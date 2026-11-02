import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base64 } from '@scure/base';
import { randomBytes } from './random';

/**
 * End-to-end encryption primitives (audited @noble libraries, no native code):
 * - XChaCha20-Poly1305 for authenticated encryption (24-byte random nonces, safe to generate randomly)
 * - X25519 + HKDF-SHA256 "sealed boxes" to share a budget key with each member's public key
 * - scrypt to turn the user's passphrase into a key that protects their private key backup
 *
 * Every ciphertext is versioned ("v1.") so the format can evolve.
 */

const te = new TextEncoder();
const td = new TextDecoder();
export const b64 = (u: Uint8Array) => base64.encode(u);
export const unb64 = (s: string) => base64.decode(s);

export const KEY_BYTES = 32;
const NONCE_BYTES = 24;
export const newKey = () => randomBytes(KEY_BYTES);

/** Encrypts bytes; `aad` binds the ciphertext to its context (e.g. a budget id) so it can't be swapped. */
export function seal(key: Uint8Array, plaintext: Uint8Array, aad?: string): string {
  const nonce = randomBytes(NONCE_BYTES);
  const ct = xchacha20poly1305(key, nonce, aad ? te.encode(aad) : undefined).encrypt(plaintext);
  return `v1.${b64(nonce)}.${b64(ct)}`;
}

export function open(key: Uint8Array, sealed: string, aad?: string): Uint8Array {
  const [v, nonce, ct] = sealed.split('.');
  if (v !== 'v1' || !nonce || !ct) throw new Error('Unsupported ciphertext format');
  return xchacha20poly1305(key, unb64(nonce), aad ? te.encode(aad) : undefined).decrypt(unb64(ct));
}

export const sealJSON = (key: Uint8Array, value: unknown, aad?: string) => seal(key, te.encode(JSON.stringify(value)), aad);
export const openJSON = <T>(key: Uint8Array, sealed: string, aad?: string): T => JSON.parse(td.decode(open(key, sealed, aad))) as T;

// ---------- Identity keys & key sharing ----------

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export function newKeyPair(): KeyPair {
  const privateKey = randomBytes(32);
  return { privateKey, publicKey: x25519.getPublicKey(privateKey) };
}

export const publicKeyFor = (privateKey: Uint8Array) => x25519.getPublicKey(privateKey);

// Context labels keep the pre-rename "finch/" prefix: they're baked into existing ciphertext.
const WRAP_INFO = te.encode('finch/budget-key/v1');

/** Seals a symmetric key so only the holder of `recipientPublic`'s private key can open it. */
export function wrapKeyFor(key: Uint8Array, recipientPublic: Uint8Array, context: string): string {
  const eph = newKeyPair();
  const shared = x25519.getSharedSecret(eph.privateKey, recipientPublic);
  const wrapKey = hkdf(sha256, shared, concat(eph.publicKey, recipientPublic), WRAP_INFO, 32);
  return `v1.${b64(eph.publicKey)}.${seal(wrapKey, key, context).slice(3)}`;
}

export function unwrapKey(wrapped: string, keyPair: KeyPair, context: string): Uint8Array {
  const [v, ephPub, nonce, ct] = wrapped.split('.');
  if (v !== 'v1' || !ephPub || !nonce || !ct) throw new Error('Unsupported wrapped key format');
  const eph = unb64(ephPub);
  const shared = x25519.getSharedSecret(keyPair.privateKey, eph);
  const wrapKey = hkdf(sha256, shared, concat(eph, keyPair.publicKey), WRAP_INFO, 32);
  return open(wrapKey, `v1.${nonce}.${ct}`, context);
}

/** A symmetric key for the user's own data, derived from their identity private key (same on every device). */
export const ownDataKey = (keyPair: KeyPair, context: string) => hkdf(sha256, keyPair.privateKey, undefined, te.encode(context), 32);

// ---------- Passphrase-protected private key backup ----------

export interface KdfParams {
  alg: 'scrypt';
  N: number;
  r: number;
  p: number;
  salt: string;
}

/** scrypt N=2^15 (~32 MB); a deliberate ~1–3 s on phones to slow down passphrase guessing. */
export const DEFAULT_KDF = { alg: 'scrypt' as const, N: 2 ** 15, r: 8, p: 1 };

export async function passphraseKey(passphrase: string, params: KdfParams, onProgress?: (p: number) => void): Promise<Uint8Array> {
  return scryptAsync(te.encode(passphrase.normalize('NFKC')), unb64(params.salt), { N: params.N, r: params.r, p: params.p, dkLen: 32, onProgress });
}

export async function lockPrivateKey(privateKey: Uint8Array, passphrase: string, onProgress?: (p: number) => void) {
  const kdf: KdfParams = { ...DEFAULT_KDF, salt: b64(randomBytes(16)) };
  const key = await passphraseKey(passphrase, kdf, onProgress);
  return { kdf, encryptedPrivateKey: seal(key, privateKey, 'finch/identity/v1') };
}

/** Throws if the passphrase is wrong (authentication tag mismatch). */
export async function unlockPrivateKey(encryptedPrivateKey: string, kdf: KdfParams, passphrase: string, onProgress?: (p: number) => void) {
  const key = await passphraseKey(passphrase, kdf, onProgress);
  return open(key, encryptedPrivateKey, 'finch/identity/v1');
}

/** SHA-256 hex, used for the Sign in with Apple nonce. */
export const sha256Hex = (s: string) => Array.from(sha256(te.encode(s)), (b) => b.toString(16).padStart(2, '0')).join('');
export const randomToken = (bytes = 32) => b64(randomBytes(bytes)).replace(/[^A-Za-z0-9]/g, '');

function concat(a: Uint8Array, b: Uint8Array) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

export const bytesEqual = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

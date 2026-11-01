import { b64, newKey, unb64 } from './crypto';

// Pre-rename name (the app was called Finch); changing it would make existing data unreadable.
const NAME = 'finch.deviceKey.v1';
let cached: Promise<Uint8Array> | null = null;

/**
 * Web build: browsers have no Keychain, so the key sits in localStorage next to the data. This keeps data
 * unreadable to anything that only sees the stored blob, but not from someone with access to this browser
 * profile. Native builds use the Keychain / Keystore (deviceKey.native.ts).
 */
export function getDeviceKey(): Promise<Uint8Array> {
  cached ??= Promise.resolve().then(() => {
    const existing = globalThis.localStorage?.getItem(NAME);
    if (existing) return unb64(existing);
    const key = newKey();
    globalThis.localStorage?.setItem(NAME, b64(key));
    return key;
  });
  return cached;
}

export const secretStore = {
  get: async (k: string) => globalThis.localStorage?.getItem(k) ?? null,
  set: async (k: string, v: string) => globalThis.localStorage?.setItem(k, v),
  remove: async (k: string) => globalThis.localStorage?.removeItem(k),
};

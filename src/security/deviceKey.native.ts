import * as SecureStore from 'expo-secure-store';
import { b64, newKey, unb64 } from './crypto';

// Pre-rename name (the app was called Finch); changing it would make existing data unreadable.
const NAME = 'finch.deviceKey.v1';
let cached: Promise<Uint8Array> | null = null;

/**
 * The key that encrypts Plan's data on this device. It lives in the iOS Keychain / Android Keystore,
 * readable only while the device is unlocked and never included in backups or synced to other devices.
 */
export function getDeviceKey(): Promise<Uint8Array> {
  cached ??= (async () => {
    const opts = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
    const existing = await SecureStore.getItemAsync(NAME, opts);
    if (existing) return unb64(existing);
    const key = newKey();
    await SecureStore.setItemAsync(NAME, b64(key), opts);
    return key;
  })();
  return cached;
}

/** Small secrets (e.g. the identity private key) go straight into the Keychain / Keystore. */
export const secretStore = {
  get: (k: string) => SecureStore.getItemAsync(k, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  set: (k: string, v: string) => SecureStore.setItemAsync(k, v, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  remove: (k: string) => SecureStore.deleteItemAsync(k),
};

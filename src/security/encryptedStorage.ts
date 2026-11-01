import AsyncStorage from '@react-native-async-storage/async-storage';
import { open, seal } from './crypto';
import { getDeviceKey } from './deviceKey';

const te = new TextEncoder();
const td = new TextDecoder();

/**
 * AsyncStorage wrapper that encrypts every value with the device key (XChaCha20-Poly1305, key name as
 * associated data). Used for the app's budgets and for the Supabase session.
 * Values written before encryption existed are read once as plain text and re-encrypted on the next write.
 */
export const encryptedStorage = {
  async getItem(name: string): Promise<string | null> {
    const raw = await AsyncStorage.getItem(name);
    if (raw == null) return null;
    if (!raw.startsWith('v1.')) return raw; // legacy plain-text value
    try {
      return td.decode(open(await getDeviceKey(), raw, name));
    } catch {
      console.warn(`[plan] could not decrypt ${name}; it was written with a different device key`);
      return null;
    }
  },
  async setItem(name: string, value: string): Promise<void> {
    await AsyncStorage.setItem(name, seal(await getDeviceKey(), te.encode(value), name));
  },
  async removeItem(name: string): Promise<void> {
    await AsyncStorage.removeItem(name);
  },
};

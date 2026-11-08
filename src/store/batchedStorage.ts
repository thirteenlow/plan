import { AppState } from 'react-native';
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { encryptedStorage } from '@/security/encryptedStorage';

/** How long changes have to pause before they're saved. */
const WAIT_MS = 700;

/**
 * Saves the store in batches. Saving means turning every budget into text and encrypting it (about 1 MB for a year of
 * use), which on a phone took long enough after every change to make the app feel slow. Now it happens once changes
 * pause, and straight away when the app goes to the background or the page is closed, so nothing is lost.
 */
export function batchedStorage<S>(): PersistStorage<S> {
  let pending: { name: string; value: StorageValue<S> } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writing: Promise<void> = Promise.resolve();

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const job = pending;
    pending = null;
    if (!job) return writing;
    // One write at a time, in order.
    writing = writing.then(() => encryptedStorage.setItem(job.name, JSON.stringify(job.value))).catch((e) => console.warn('[plan] could not save', e));
    return writing;
  };

  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void flush());
    window.addEventListener('pagehide', () => void flush());
  } else {
    AppState.addEventListener('change', (s) => s !== 'active' && void flush());
  }
  flushers.push(flush);

  return {
    async getItem(name) {
      const raw = await encryptedStorage.getItem(name);
      return raw ? (JSON.parse(raw) as StorageValue<S>) : null;
    },
    setItem(name, value) {
      pending = { name, value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), WAIT_MS);
    },
    async removeItem(name) {
      if (pending?.name === name) pending = null;
      await writing;
      await encryptedStorage.removeItem(name);
    },
  };
}

const flushers: (() => Promise<void>)[] = [];

/** Saves anything still waiting now (e.g. before signing out or reloading). */
export const flushStore = () => Promise.all(flushers.map((f) => f())).then(() => undefined);

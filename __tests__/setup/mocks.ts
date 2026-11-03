/* eslint-disable @typescript-eslint/no-require-imports */
// Runs before every test file. Keeps tests offline and deterministic.

// Cloud sync off: no Supabase client is ever created.
process.env.EXPO_PUBLIC_SUPABASE_URL = '';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = '';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('expo-secure-store', () => {
  const mem = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    getItemAsync: jest.fn(async (k: string) => mem.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void mem.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void mem.delete(k)),
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  selectionAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// Budgets are persisted through the device-key encrypted storage; an in-memory store is enough here.
jest.mock('@/security/encryptedStorage', () => {
  const mem = new Map<string, string>();
  return {
    encryptedStorage: {
      getItem: async (k: string) => mem.get(k) ?? null,
      setItem: async (k: string, v: string) => void mem.set(k, v),
      removeItem: async (k: string) => void mem.delete(k),
    },
  };
});

// Icons render as empty text, so tests don't load fonts.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Icon = () => React.createElement(Text, { accessibilityElementsHidden: true }, '');
  Icon.glyphMap = {};
  return new Proxy({}, { get: (_t, key) => (key === '__esModule' ? true : Icon) });
});

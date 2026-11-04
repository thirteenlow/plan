import { Platform } from 'react-native';

/** On an iPhone or iPad (native, or Safari on the web). */
export function isAppleDevice() {
  if (Platform.OS === 'ios') return true;
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

/** The iPhone's iOS major version (native, or Safari's user agent); null when it can't tell (e.g. a computer). */
export function iosMajor(): number | null {
  if (Platform.OS === 'ios') return parseInt(String(Platform.Version), 10) || null;
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return null;
  const m = navigator.userAgent.match(/(?:iPhone|iPad|CPU) OS (\d+)_/);
  return m ? Number(m[1]) : null;
}

/** On an Android phone or tablet (native, or a browser on one). */
export function isAndroidDevice() {
  if (Platform.OS === 'android') return true;
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

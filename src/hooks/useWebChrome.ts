import { useEffect } from 'react';
import { Platform } from 'react-native';

/** Running as an installed Home Screen app (iOS standalone or a PWA window). */
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/**
 * Web only: makes the page behind the iPhone status bar and the browser's top bar (theme-color) follow the app's
 * light/dark choice instead of the device setting baked into public/index.html.
 *
 * Installed apps only get the page background: iOS shows it behind the status bar there, and changing theme-color
 * while a Home Screen app is open can make iOS resize its window (leaving a gap under the tab bar). Browsers get
 * theme-color too, by updating the existing tags' colours without adding or removing any.
 */
export function useWebChrome(_isDark: boolean, background: string) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    for (const el of [document.documentElement, document.body, document.getElementById('root')]) {
      if (el) el.style.backgroundColor = background;
    }
    if (standalone()) return;
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = background;
  }, [background]);
}

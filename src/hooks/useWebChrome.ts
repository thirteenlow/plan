import { useEffect } from 'react';
import { Platform } from 'react-native';

/** Running as an installed Home Screen app on iPhone/iPad. */
const iosHomeScreenApp = () => {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
  return ios && ((navigator as { standalone?: boolean }).standalone === true || !!window.matchMedia?.('(display-mode: standalone)').matches);
};

/**
 * Web only: makes the system bars and the page behind them follow the app's light/dark choice instead of the device
 * setting baked into public/index.html.
 *
 * - Page background: shows behind the iPhone status bar, and under Android's bars when the page draws edge to edge.
 * - theme-color: colours the browser's top bar, and the status and navigation bars of an installed Android app.
 *   iPhone Home Screen apps are the exception: changing it while one is open can make iOS resize its window
 *   (leaving a gap under the tab bar), and they don't need it because the status bar shows the page background.
 *   The existing theme-color tags are recoloured, never added or removed.
 * - The web app manifest: installed Android apps take their bar colours from it (saved when added to the Home
 *   Screen, refreshed by Chrome from time to time), so point at the light or dark one to match.
 */
export function useWebChrome(isDark: boolean, background: string) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const href = isDark ? '/manifest-dark.json' : '/manifest.json';
    if (manifest && manifest.getAttribute('href') !== href) manifest.setAttribute('href', href);
    for (const el of [document.documentElement, document.body, document.getElementById('root')]) {
      if (el) el.style.backgroundColor = background;
    }
    if (iosHomeScreenApp()) return;
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = background;
  }, [isDark, background]);
}

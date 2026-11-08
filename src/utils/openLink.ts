import { Linking, Platform } from 'react-native';

/** The iPhone/iPad Home Screen web app (not Safari, not a computer). */
function homeScreenApp(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

/**
 * Opens another app: by its URL scheme (shortcuts://), or a link the iPhone hands to an app (an iCloud shortcut link
 * opens in Shortcuts). On the web, Linking opens a new window: in the iPhone Home Screen app that's an in-app browser
 * that hands off to the app and is left behind, blank, until closed. Going there from the page itself opens the app
 * with nothing left over. Ordinary web links on a computer still open in a new tab.
 */
export function openApp(url: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && (!/^https?:/i.test(url) || homeScreenApp())) {
    window.location.href = url;
    return Promise.resolve();
  }
  return Linking.openURL(url);
}

import { Linking, Platform } from 'react-native';

/**
 * Opens another app by its URL scheme (shortcuts://). On the web, Linking opens a new window: in the iPhone home
 * screen app that's an in-app browser that hands off to the app and is left behind, blank, until closed. Going there
 * from the page itself opens the app with nothing left over.
 */
export function openApp(url: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && !/^https?:/i.test(url)) {
    window.location.href = url;
    return Promise.resolve();
  }
  return Linking.openURL(url);
}

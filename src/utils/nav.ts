import { router } from 'expo-router';

/** Goes back, or to the budget when there's no history (e.g. opened from a deep link). */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

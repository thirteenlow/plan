import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useStore } from '@/store/store';
import { useTheme } from '@/theme';
import { useCloud } from './cloudStore';
import { cloudConfigured } from './config';

/**
 * When cloud sync is set up, using the app requires being signed in (and unlocked), so every budget is
 * saved to the account. Returns what to render instead of the screen, or null when the user may continue.
 */
export function useAccountGate(): React.ReactElement | null {
  const status = useCloud((s) => s.status);
  const firstPullDone = useCloud((s) => s.firstPullDone);
  const hasBudgets = useStore((s) => Object.keys(s.budgets).length > 0);
  const { colors } = useTheme();
  if (!cloudConfigured) return null;
  // Signing in on a new device: wait for the account's budgets to download before deciding the user has none
  // (otherwise someone with a plan would be sent to create a new one).
  if (status === 'ready' && (hasBudgets || firstPullDone)) return null;
  if (status === 'ready' || status === 'starting' || status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return <Redirect href="/account" />;
}

import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initCloud } from '@/cloud';
import { DialogHost } from '@/components/Dialog';
import '@/utils/webSetup';
import { useStore } from '@/store/store';
import { useWebChrome } from '@/hooks/useWebChrome';
import { useTheme } from '@/theme';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const hydrated = useStore((s) => s.hydrated);
  const activeBudgetId = useStore((s) => s.activeBudgetId);
  const { colors, isDark } = useTheme();
  useWebChrome(isDark, colors.bg);

  // Restore the cloud session (if configured) once local data has loaded.
  useEffect(() => {
    if (hydrated) void initCloud();
  }, [hydrated]);

  // Enter any scheduled transactions that came due, on launch and whenever the app returns to the foreground.
  useEffect(() => {
    if (!hydrated) return;
    useStore.getState().processScheduled();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') useStore.getState().processScheduled();
    });
    return () => sub.remove();
  }, [hydrated, activeBudgetId]);

  const navTheme = isDark
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.bg, card: colors.surface, primary: colors.accent } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.surface, primary: colors.accent } };

  if (!fontsLoaded || !hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const modal = { presentation: 'modal' as const };
  return (
    <SafeAreaProvider>
      <ThemeProvider value={navTheme}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade', animationDuration: 220 }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
          <Stack.Screen name="setup" options={{ gestureEnabled: false }} />
          <Stack.Screen name="transaction" options={modal} />
          <Stack.Screen name="account-edit" options={modal} />
          <Stack.Screen name="category/[id]" options={modal} />
          <Stack.Screen name="target/[id]" options={modal} />
          <Stack.Screen name="apple-pay" options={modal} />
          <Stack.Screen name="wallet-pay" options={modal} />
          <Stack.Screen name="screenshot-capture" options={modal} />
          <Stack.Screen name="pet" options={modal} />
          <Stack.Screen name="pro" options={modal} />
          <Stack.Screen name="notifications" options={modal} />
          <Stack.Screen name="move-money" options={modal} />
          <Stack.Screen name="reconcile/[id]" options={modal} />
        </Stack>
        <DialogHost />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

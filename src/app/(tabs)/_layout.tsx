import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppNav, TAB_BAR_HEIGHT, TransactionButton } from '@/components/AppNav';
import { RoamingPet } from '@/components/Pet';
import { useAccountGate } from '@/cloud/gate';
import { useBudgetData } from '@/store/store';
import { useLayout, useTheme } from '@/theme';

export default function TabsLayout() {
  const data = useBudgetData();
  const { isTablet } = useLayout();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const gate = useAccountGate();
  if (gate) return gate;
  if (!data) return <Redirect href="/onboarding" />;

  const barHeight = TAB_BAR_HEIGHT + Math.max(insets.bottom, 10);
  return (
    <View style={{ flex: 1, flexDirection: isTablet ? 'row' : 'column', backgroundColor: colors.bg }}>
      {isTablet && <AppNav variant="rail" />}
      <View style={{ flex: 1 }}>
        <Tabs tabBar={() => null} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg }, animation: 'fade' }}>
          <Tabs.Screen name="index" options={{ title: 'Home' }} />
          <Tabs.Screen name="plan" options={{ title: 'Plan' }} />
          <Tabs.Screen name="spending" options={{ title: 'Spending' }} />
          <Tabs.Screen name="accounts" options={{ title: 'Accounts' }} />
          <Tabs.Screen name="reflect" options={{ title: 'Reflect' }} />
        </Tabs>
        {isTablet && <TransactionButton bottom={insets.bottom + 24} />}
        {isTablet && <RoamingPet bottom={insets.bottom + 24} right={200} />}
      </View>
      {!isTablet && <AppNav variant="bar" />}
      {!isTablet && <TransactionButton bottom={barHeight + 12} />}
      {!isTablet && <RoamingPet bottom={barHeight + 14} right={180} />}
    </View>
  );
}

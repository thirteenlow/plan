import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
import { Tap } from '@/components/ui';
import { usePlan } from '@/cloud/pro';
import { FONT, GRADIENT, RADIUS } from '@/theme';

/** The gradient "PRO" pill. `trial` shows "PRO TRIAL". Tapping opens the Plan Pro screen. */
export function ProBadge({ size = 'md', trial = false, onPress }: { size?: 'sm' | 'md'; trial?: boolean; onPress?: () => void }) {
  const sm = size === 'sm';
  const pill = (
    <LinearGradient
      colors={GRADIENT}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: sm ? 3 : 5, paddingHorizontal: sm ? 7 : 11, paddingVertical: sm ? 2 : 5, borderRadius: RADIUS.pill }}
    >
      <Ionicons name="sparkles" size={sm ? 9 : 12} color="#FFFFFF" />
      <Text style={{ color: '#FFFFFF', fontFamily: FONT.bold, fontSize: sm ? 9.5 : 12, letterSpacing: 0.8 }}>{trial ? 'PRO TRIAL' : 'PRO'}</Text>
    </LinearGradient>
  );
  return (
    <Tap scale accessibilityRole="button" accessibilityLabel={trial ? 'Pro trial. Open Plan Pro' : 'Pro account. Open Plan Pro'} onPress={onPress ?? (() => router.push('/pro'))}>
      {pill}
    </Tap>
  );
}

/** The badge for the signed-in account, or nothing on the free plan. */
export function AccountProBadge({ size }: { size?: 'sm' | 'md' }) {
  const plan = usePlan((s) => s.plan);
  if (plan === 'free') return null;
  return <ProBadge size={size} trial={plan === 'trial'} />;
}

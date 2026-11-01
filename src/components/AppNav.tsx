import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { type Href, router, usePathname } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTodos } from '@/hooks/useTodos';
import { useUi } from '@/hooks/useBudget';
import { useBudgetData } from '@/store/store';
import { GRADIENT, RADIUS, useTheme } from '@/theme';
import type { IconName } from '@/utils/icons';
import { haptic, Tap, Txt } from './ui';

export const TABS: { href: Href; path: string; label: string; icon: IconName; iconActive: IconName }[] = [
  { href: '/', path: '/', label: 'Home', icon: 'home-outline', iconActive: 'home' },
  { href: '/plan', path: '/plan', label: 'Plan', icon: 'layers-outline', iconActive: 'layers' },
  { href: '/spending', path: '/spending', label: 'Spending', icon: 'cash-outline', iconActive: 'cash' },
  { href: '/accounts', path: '/accounts', label: 'Accounts', icon: 'business-outline', iconActive: 'business' },
  { href: '/reflect', path: '/reflect', label: 'Reflect', icon: 'bar-chart-outline', iconActive: 'bar-chart' },
];

/** Height of the phone tab bar above the safe-area inset. */
export const TAB_BAR_HEIGHT = 64;

function Badge({ count }: { count: number }) {
  const { colors } = useTheme();
  if (!count) return null;
  return (
    <View style={{ position: 'absolute', top: -4, right: -10, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface }}>
      <Txt style={{ color: '#FFF', fontSize: 10, fontWeight: '700' }}>{count > 9 ? '9+' : count}</Txt>
    </View>
  );
}

export function AppNav({ variant }: { variant: 'bar' | 'rail' }) {
  const { colors, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const todos = useTodos();
  const isActive = (p: string) => (p === '/' ? pathname === '/' || pathname === '/index' : pathname.startsWith(p));
  const go = (href: Href) => {
    haptic();
    router.navigate(href);
  };

  if (variant === 'rail') {
    return (
      <View style={{ width: 96, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20, alignItems: 'center', backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.border }}>
        <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
          <Ionicons name="leaf" size={22} color="#FFF" />
        </LinearGradient>
        <View style={{ gap: 10 }}>
          {TABS.map((t) => {
            const active = isActive(t.path);
            return (
              <Tap
                key={t.path}
                onPress={() => go(t.href)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t.label}
                style={{ width: 72, paddingVertical: 10, borderRadius: RADIUS.md, alignItems: 'center', gap: 4, backgroundColor: active ? colors.accentSoft : 'transparent' }}
              >
                <View>
                  <Ionicons name={active ? t.iconActive : t.icon} size={22} color={active ? colors.accent : colors.muted} />
                  {t.path === '/' && <Badge count={todos.length} />}
                </View>
                <Txt variant="caption" style={{ color: active ? colors.accent : colors.muted, fontSize: 11 }}>
                  {t.label}
                </Txt>
              </Tap>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderTopLeftRadius: RADIUS.xl + 4,
          borderTopRightRadius: RADIUS.xl + 4,
          height: TAB_BAR_HEIGHT + Math.max(insets.bottom, 10),
          paddingBottom: Math.max(insets.bottom, 10),
          paddingHorizontal: 6,
        },
        shadow,
        { shadowOffset: { width: 0, height: -6 }, shadowOpacity: shadow.shadowOpacity * 1.2 },
      ]}
    >
      {TABS.map((t) => {
        const active = isActive(t.path);
        return (
          <Tap key={t.path} onPress={() => go(t.href)} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={t.label} style={{ flex: 1, alignItems: 'center', paddingVertical: 6 }}>
            <View style={{ alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.md, backgroundColor: active ? colors.accentSoft : 'transparent' }}>
              <View>
                <Ionicons name={active ? t.iconActive : t.icon} size={21} color={active ? colors.accent : colors.muted} />
                {t.path === '/' && <Badge count={todos.length} />}
              </View>
              <Txt variant="caption" numberOfLines={1} style={{ fontSize: 10, color: active ? colors.accent : colors.muted }}>
                {t.label}
              </Txt>
            </View>
          </Tap>
        );
      })}
    </View>
  );
}

/** Translucent "+ Transaction" pill that floats above the tab bar on the right. */
export function TransactionButton({ bottom, accountId }: { bottom: number; accountId?: string }) {
  const data = useBudgetData();
  const { colors, isDark } = useTheme();
  const hidden = useUi((s) => s.assigning);
  if (hidden) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', right: 16, bottom }}>
      <Tap
        scale
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
        onPress={() => {
          haptic();
          if (!data?.accounts.some((a) => !a.closed)) router.push('/account-edit');
          else router.push(accountId ? { pathname: '/transaction', params: { accountId } } : '/transaction');
        }}
        style={{
          borderRadius: RADIUS.pill,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.9)',
          shadowColor: '#7B3FE4',
          shadowOpacity: 0.22,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 6,
        }}
      >
        <BlurView intensity={40} tint={isDark ? 'dark' : 'light'} style={{ backgroundColor: isDark ? 'rgba(24,28,43,0.62)' : 'rgba(255,255,255,0.6)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 10, paddingRight: 18, height: 50 }}>
            <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={20} color="#FFF" />
            </LinearGradient>
            <Txt variant="strong" style={{ color: colors.text }}>
              Transaction
            </Txt>
          </View>
        </BlurView>
      </Tap>
    </View>
  );
}

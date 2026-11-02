import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, View } from 'react-native';
import { GRADIENT, RADIUS, useTheme } from '@/theme';
import { formatMoney } from '@/utils/money';
import { haptic, IconBadge, Txt } from './ui';

export interface AssignFlashInfo {
  total: number;
  items: { name: string; amount: number }[];
}

const native = Platform.OS !== 'web';
const SHOWN = 5;
const SPARKS = 8;

/**
 * Shown after auto-assigning: a coin pops out with the total, sparks burst from it, and each category that got
 * money drops in with its share. Closes by itself, or on a tap.
 */
export function AssignFlash({ info, onDone }: { info: AssignFlashInfo; onDone: () => void }) {
  const { colors, shadow } = useTheme();
  const shown = info.items.slice(0, SHOWN);
  const [pop] = useState(() => new Animated.Value(0));
  const [burst] = useState(() => new Animated.Value(0));
  const [rows] = useState(() => shown.map(() => new Animated.Value(0)));

  useEffect(() => {
    haptic('success');
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 140, useNativeDriver: native }),
      Animated.timing(burst, { toValue: 1, duration: 700, delay: 120, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
      Animated.stagger(
        110,
        rows.map((r) => Animated.spring(r, { toValue: 1, friction: 6, tension: 120, delay: 260, useNativeDriver: native })),
      ),
    ]).start();
    const t = setTimeout(onDone, 1900 + rows.length * 110);
    return () => clearTimeout(t);
  }, [pop, burst, rows, onDone]);

  const coinScale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const coinTurn = pop.interpolate({ inputRange: [0, 0.6, 1], outputRange: ['-25deg', '10deg', '0deg'] });

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onDone}>
      <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel="Close" style={{ flex: 1, backgroundColor: 'rgba(14,17,28,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <View style={[{ width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: RADIUS.xl, padding: 22, gap: 14, alignItems: 'center' }, shadow]}>
          <View style={{ width: 72, height: 72, alignItems: 'center', justifyContent: 'center' }}>
            {Array.from({ length: SPARKS }, (_, i) => {
              const angle = (i / SPARKS) * Math.PI * 2;
              const dist = burst.interpolate({ inputRange: [0, 1], outputRange: [0, 46] });
              return (
                <Animated.View
                  key={i}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: i % 2 ? colors.accent : colors.positive,
                    opacity: burst.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
                    transform: [{ translateX: Animated.multiply(dist, Math.cos(angle)) }, { translateY: Animated.multiply(dist, Math.sin(angle)) }],
                  }}
                />
              );
            })}
            <Animated.View style={{ transform: [{ scale: coinScale }, { rotate: coinTurn }] }}>
              <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="flash" size={28} color="#FFF" />
              </LinearGradient>
            </Animated.View>
          </View>
          <Txt variant="h3" center>
            {formatMoney(info.total)} assigned
          </Txt>

          <View style={{ alignSelf: 'stretch', gap: 8 }}>
            {shown.map((item, i) => (
              <Animated.View
                key={item.name + i}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  padding: 8,
                  borderRadius: RADIUS.md,
                  backgroundColor: colors.sunken,
                  opacity: rows[i],
                  transform: [{ translateY: rows[i].interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }, { scale: rows[i].interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
                }}
              >
                <IconBadge name={item.name} size={28} />
                <Txt variant="body" numberOfLines={1} style={{ flex: 1 }}>
                  {item.name}
                </Txt>
                <Txt variant="label" tone="positive">
                  +{formatMoney(item.amount)}
                </Txt>
              </Animated.View>
            ))}
            {info.items.length > SHOWN && (
              <Txt variant="caption" tone="muted" center>
                and {info.items.length - SHOWN} more
              </Txt>
            )}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

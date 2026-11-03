import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { GRADIENT, RADIUS, useTheme } from '@/theme';
import type { IconName } from '@/utils/icons';
import { formatMoney } from '@/utils/money';
import { Button, haptic, IconBadge, Txt } from './ui';

export interface FlowEnd {
  name: string;
  icon?: IconName;
  /** Line under the name, e.g. "+$40.00" or "$12.00 left" */
  caption: string;
  tone?: 'positive' | 'danger' | 'muted';
}

export interface MoneyFlowInfo {
  title: string;
  from: FlowEnd;
  to: FlowEnd;
  /** What travels between the two (0 shows no coin) */
  amount: number;
  note: string;
  /** Something needs attention: stays open until dismissed */
  warn?: boolean;
}

const native = Platform.OS !== 'web';

/**
 * The money visibly travels from one place to another: the source dips as a coin with the amount leaves it, and
 * the destination bounces when it lands. Closes by itself (or on a tap) unless it's a warning.
 */
export function MoneyFlow({ info, onDone }: { info: MoneyFlowInfo; onDone: () => void }) {
  const { colors, shadow } = useTheme();
  const [travel] = useState(() => new Animated.Value(0));
  const [land] = useState(() => new Animated.Value(0));
  const [track, setTrack] = useState(0);
  const { warn } = info;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(200),
      Animated.timing(travel, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.cubic), useNativeDriver: native }),
      Animated.spring(land, { toValue: 1, friction: 4, tension: 120, useNativeDriver: native }),
    ]).start(() => haptic(warn ? 'warning' : 'success'));
    if (warn) return;
    const t = setTimeout(onDone, 2100);
    return () => clearTimeout(t);
  }, [travel, land, warn, onDone]);

  const coinX = travel.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(track - 92, 0)] });
  // Arcs up a little on the way, like it's being tossed across.
  const coinY = travel.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -22, 0] });
  const coinOpacity = travel.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 1, 1, 0] });
  const fromScale = travel.interpolate({ inputRange: [0, 0.15, 0.4], outputRange: [1, 0.88, 1], extrapolate: 'clamp' });
  const toScale = land.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.14, 1] });
  // The arrow track fills in behind the coin.
  const fill = travel.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onDone}>
      <View style={{ flex: 1, backgroundColor: 'rgba(14,17,28,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        {/* Tapping outside closes it (a sibling, so the Done button isn't nested in another button). */}
        {!warn && <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel="Close" style={StyleSheet.absoluteFill} />}
        <View style={[{ width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: RADIUS.xl, padding: 22, gap: 18 }, shadow]}>
          <Txt variant="h3" center>
            {info.title}
          </Txt>

          <View onLayout={(e) => setTrack(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View pointerEvents="none" style={{ position: 'absolute', left: 74, right: 74, top: 23, height: 2, borderRadius: 1, backgroundColor: colors.sunken, overflow: 'hidden' }}>
              <Animated.View style={{ flex: 1, backgroundColor: warn ? colors.warning : colors.accent, opacity: 0.6, transform: [{ scaleX: fill }], transformOrigin: 'left' }} />
            </View>
            <Animated.View style={{ transform: [{ scale: fromScale }] }}>
              <Endpoint end={info.from} />
            </Animated.View>
            <Animated.View style={{ transform: [{ scale: toScale }] }}>
              <Endpoint end={info.to} />
            </Animated.View>
            {info.amount > 0 && track > 0 && (
              <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 46, top: 10, opacity: coinOpacity, transform: [{ translateX: coinX }, { translateY: coinY }] }}>
                <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 5 }}>
                  <Txt variant="label" style={{ color: '#FFF' }}>
                    {formatMoney(info.amount)}
                  </Txt>
                </LinearGradient>
              </Animated.View>
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
            <Ionicons name={warn ? 'alert-circle' : 'checkmark-circle'} size={18} color={warn ? colors.warning : colors.positive} />
            <Txt variant="caption" tone="soft" style={{ flexShrink: 1 }}>
              {info.note}
            </Txt>
          </View>
          <Button title={warn ? 'Got it' : 'Done'} variant={warn ? 'gradient' : 'soft'} onPress={onDone} />
        </View>
      </View>
    </Modal>
  );
}

function Endpoint({ end }: { end: FlowEnd }) {
  return (
    <View style={{ width: 100, alignItems: 'center', gap: 6 }}>
      <IconBadge name={end.name} icon={end.icon} size={48} />
      <Txt variant="label" center numberOfLines={2}>
        {end.name}
      </Txt>
      <Txt variant="caption" center tone={end.tone ?? 'muted'} numberOfLines={1}>
        {end.caption}
      </Txt>
    </View>
  );
}

export interface MoneyMoveInfo {
  /** Category (or "2 categories") the card purchase came from */
  from: string;
  /** Credit card name */
  to: string;
  /** What was spent on the card */
  spent: number;
  /** What actually moved into the card's payment category (less if the category ran short) */
  moved: number;
}

/** Signed amount for an endpoint caption: "+$5.00", "-$5.00". */
export const signed = (v: number) => `${v > 0 ? '+' : ''}${formatMoney(v)}`;

/**
 * Shown after saving card spending: the money travels from the category to the card's payment category, so it's
 * clear the bill is already covered. Stays open if the category ran short.
 */
export function MoneyMove({ info, onDone }: { info: MoneyMoveInfo; onDone: () => void }) {
  const short = info.spent - info.moved;
  const tone = (v: number) => (v > 0 ? 'positive' : v < 0 ? 'danger' : 'muted');
  return (
    <MoneyFlow
      onDone={onDone}
      info={{
        title: info.moved > 0 ? 'Set aside for your card' : 'Card spending not covered',
        from: { name: info.from, caption: signed(-info.moved), tone: tone(-info.moved) },
        to: { name: `${info.to} payment`, icon: 'card', caption: signed(info.moved), tone: tone(info.moved) },
        amount: info.moved,
        note: short > 0 ? `${info.from} was short by ${formatMoney(short)}. Assign that to it so the card bill is covered.` : `${formatMoney(info.moved)} moved from ${info.from} to your ${info.to} payment.`,
        warn: short > 0,
      }}
    />
  );
}

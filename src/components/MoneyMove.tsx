import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Platform, View } from 'react-native';
import { GRADIENT, RADIUS, useTheme } from '@/theme';
import { formatMoney } from '@/utils/money';
import { Button, haptic, IconBadge, Txt } from './ui';

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

const native = Platform.OS !== 'web';

/**
 * Shown after saving card spending: the money visibly travels from the category to the card's payment
 * category, so it's clear the bill is already covered. Closes by itself unless the category ran short.
 */
export function MoneyMove({ info, onDone }: { info: MoneyMoveInfo; onDone: () => void }) {
  const { colors, shadow } = useTheme();
  const [travel] = useState(() => new Animated.Value(0));
  const [land] = useState(() => new Animated.Value(0));
  const [track, setTrack] = useState(0);
  const short = info.spent - info.moved;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(250),
      Animated.timing(travel, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.cubic), useNativeDriver: native }),
      Animated.spring(land, { toValue: 1, friction: 4, tension: 120, useNativeDriver: native }),
    ]).start(() => haptic(short > 0 ? 'warning' : 'success'));
    if (short > 0) return;
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [travel, land, short, onDone]);

  const coinX = travel.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(track - 92, 0)] });
  const coinOpacity = travel.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 1, 1, 0] });
  const cardScale = land.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.12, 1] });

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onDone}>
      <View style={{ flex: 1, backgroundColor: 'rgba(14,17,28,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <View style={[{ width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: RADIUS.xl, padding: 22, gap: 18 }, shadow]}>
          <Txt variant="h3" center>
            {info.moved > 0 ? 'Set aside for your card' : 'Card spending not covered'}
          </Txt>

          <View onLayout={(e) => setTrack(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Endpoint name={info.from} amount={-info.moved} />
            <Animated.View style={{ transform: [{ scale: cardScale }] }}>
              <Endpoint name={info.to} amount={info.moved} card />
            </Animated.View>
            {info.moved > 0 && track > 0 && (
              <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 46, top: 10, opacity: coinOpacity, transform: [{ translateX: coinX }] }}>
                <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 5 }}>
                  <Txt variant="label" style={{ color: '#FFF' }}>
                    {formatMoney(info.moved)}
                  </Txt>
                </LinearGradient>
              </Animated.View>
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
            <Ionicons name={short > 0 ? 'alert-circle' : 'checkmark-circle'} size={18} color={short > 0 ? colors.warning : colors.positive} />
            <Txt variant="caption" tone="soft" style={{ flexShrink: 1 }}>
              {short > 0
                ? `${info.from} was short by ${formatMoney(short)}. Assign that to it so the card bill is covered.`
                : `${formatMoney(info.moved)} moved from ${info.from} to your ${info.to} payment.`}
            </Txt>
          </View>
          <Button title={short > 0 ? 'Got it' : 'Done'} variant={short > 0 ? 'gradient' : 'soft'} onPress={onDone} />
        </View>
      </View>
    </Modal>
  );
}

function Endpoint({ name, amount, card }: { name: string; amount: number; card?: boolean }) {
  return (
    <View style={{ width: 100, alignItems: 'center', gap: 6 }}>
      <IconBadge name={name} icon={card ? 'card' : undefined} size={48} />
      <Txt variant="label" center numberOfLines={2}>
        {card ? `${name} payment` : name}
      </Txt>
      <Txt variant="caption" tone={amount > 0 ? 'positive' : amount < 0 ? 'danger' : 'muted'}>
        {amount > 0 ? '+' : ''}
        {formatMoney(amount)}
      </Txt>
    </View>
  );
}

import React, { type RefObject, useRef, useState } from 'react';
import { type TextInput, View } from 'react-native';
import { RADIUS, useTheme } from '@/theme';
import { formatMoney, MAX_AMOUNT, milliToInput, parseMoney, signedInput } from '@/utils/money';
import { Row, Tap, Txt } from './ui';

export type InputRef = React.ComponentRef<typeof TextInput>;

/** Ref for the amount field the calculator types into (kept by the caller, so the hook's result holds no ref). */
export const useInputRef = () => useRef<InputRef>(null);

type Op = '+' | '−' | '×' | '÷';
const OPS: (Op | '=')[] = ['+', '−', '×', '÷', '='];

function apply(a: number, op: Op, b: number): number {
  if (op === '+') return a + b;
  if (op === '−') return a - b;
  if (op === '×') return Math.round((a * b) / 1000);
  return b === 0 ? a : Math.round((a * 1000) / b);
}

/**
 * Calculator for an amount field: + − × ÷ = keys appear while it's focused (phone number pads have no
 * operators). Pressing an operator remembers the amount so far and clears the field for the next number;
 * "=" (or leaving the field) puts the result back in.
 */
export function useCalculator({
  value,
  onChange,
  inputRef,
  allowNegative = false,
}: {
  value: string;
  onChange: (text: string) => void;
  inputRef: RefObject<InputRef | null>;
  allowNegative?: boolean;
}) {
  const { colors } = useTheme();
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [focused, setFocused] = useState(false);
  // Tapping a key takes focus off the field first (on the web), so the keys stay up briefly after a blur.
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = parseMoney(value) ?? 0;

  const total = () => (acc !== null && op ? apply(acc, op, current) : current);
  const show = (m: number) => {
    const clamped = Math.max(-MAX_AMOUNT, Math.min(MAX_AMOUNT, allowNegative ? m : Math.abs(m)));
    return clamped === 0 ? '' : allowNegative ? signedInput(clamped) : milliToInput(clamped);
  };
  const finish = () => {
    if (acc === null || !op) return;
    onChange(show(total()));
    setAcc(null);
    setOp(null);
  };

  const press = (key: Op | '=') => {
    if (key === '=') finish();
    else {
      setAcc(total());
      setOp(key);
      onChange('');
    }
    inputRef.current?.focus();
  };

  const expression = acc !== null && op ? `${formatMoney(acc)} ${op} ${value ? `${formatMoney(current)} = ${formatMoney(total())}` : '…'}` : null;
  const bar =
    focused || op ? (
      <View style={{ alignItems: 'center', gap: 6, marginTop: 10 }}>
        <Row style={{ gap: 8, justifyContent: 'center' }}>
          {OPS.map((k) => (
            <Tap
              key={k}
              onPress={() => press(k)}
              accessibilityRole="button"
              accessibilityLabel={k === '=' ? 'Equals' : k === '−' ? 'Minus' : k === '×' ? 'Times' : k === '÷' ? 'Divide' : 'Plus'}
              style={{
                width: 48,
                height: 40,
                borderRadius: RADIUS.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: k === '=' ? colors.accent : op === k ? colors.accentSoft : colors.sunken,
              }}
            >
              <Txt variant="h3" style={{ color: k === '=' ? '#FFF' : colors.accent }}>
                {k}
              </Txt>
            </Tap>
          ))}
        </Row>
        {!!expression && (
          <Txt variant="caption" tone="muted" center numberOfLines={1}>
            {expression}
          </Txt>
        )}
      </View>
    ) : null;

  return {
    bar,
    onFocus: () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setFocused(true);
    },
    // Leaving the field completes a pending sum, so saving never uses half a calculation.
    onBlur: () => {
      finish();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setFocused(false), 250);
    },
  };
}

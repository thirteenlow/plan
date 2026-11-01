import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/utils/nav';
import React, { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useCalculator, useInputRef } from '@/components/Calculator';
import { Screen } from '@/components/Screen';
import { PickerSheet } from '@/components/Sheet';
import { Button, FieldRow, haptic, notify, Txt } from '@/components/ui';
import { categoryMonth } from '@/engine/budget';
import { sortedGroups, useMonthBudget, useUi } from '@/hooks/useBudget';
import { useActiveBudget, useStore } from '@/store/store';
import { RTA } from '@/store/types';
import { FONT, RADIUS, useTheme } from '@/theme';
import { monthLabel } from '@/utils/date';
import { amountWidth, noWebOutline } from '@/utils/layout';
import { formatMoney, getActiveCurrency, milliToInput, parseMoney } from '@/utils/money';
import { filterAmountTyping, LIMITS, validateAmount } from '@/utils/validation';

export default function MoveMoneyScreen() {
  const params = useLocalSearchParams<{ month?: string; from?: string; to?: string; amount?: string }>();
  const uiMonth = useUi((s) => s.month);
  const month = params.month ?? uiMonth;
  const data = useActiveBudget();
  const mb = useMonthBudget(month);
  const moveMoney = useStore((s) => s.moveMoney);
  const { colors } = useTheme();
  const [from, setFrom] = useState<string | null>(params.from ?? (params.to ? null : RTA));
  const [to, setTo] = useState<string | null>(params.to ?? null);
  const [amount, setAmount] = useState(params.amount ? milliToInput(Number(params.amount)) : '');
  const amountRef = useInputRef();
  const calc = useCalculator({ value: amount, onChange: setAmount, inputRef: amountRef });
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);

  const availableOf = (id: string | null) => (id === RTA ? mb.readyToAssign : id ? categoryMonth(mb, id).available : 0);
  const nameOf = (id: string | null) => (id === RTA ? 'Ready to Assign' : data.categories.find((c) => c.id === id)?.name);

  const items = useMemo(() => {
    const list = [{ key: RTA, title: 'Ready to Assign', section: 'Budget', right: <Txt variant="label" tone={mb.readyToAssign < 0 ? 'danger' : 'positive'}>{formatMoney(mb.readyToAssign)}</Txt> }];
    for (const { group, categories } of sortedGroups(data)) {
      for (const c of categories) {
        const a = categoryMonth(mb, c.id).available;
        list.push({ key: c.id, title: c.name, section: group.name, right: <Txt variant="label" tone={a < 0 ? 'danger' : a > 0 ? 'positive' : 'muted'}>{formatMoney(a)}</Txt> });
      }
    }
    return list;
  }, [data, mb]);

  const amt = parseMoney(amount) ?? 0;
  const valid = amt > 0 && from && to && from !== to;

  const submit = () => {
    if (!valid) return;
    const amountError = validateAmount(parseMoney(amount));
    if (amountError) return notify('Check the amount', amountError);
    if (from !== RTA && amt > availableOf(from)) {
      notify('Not enough money', `${nameOf(from)} only has ${formatMoney(availableOf(from))} available.`);
      return;
    }
    haptic('success');
    moveMoney(month, from!, to!, amt);
    goBack();
  };

  const c = getActiveCurrency();
  return (
    <Screen back="close" modal title={params.to && !params.from ? 'Cover overspending' : 'Move money'} subtitle={monthLabel(month)} footer={<Button title="Move" disabled={!valid} onPress={submit} />}>
      <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: RADIUS.pill, paddingHorizontal: 28, marginVertical: 18, minWidth: 220, justifyContent: 'center' }}>
        <Txt variant="h2" tone="muted">
          {c.symbol}
        </Txt>
        <TextInput
          value={amount}
          ref={amountRef}
          onFocus={calc.onFocus}
          onBlur={calc.onBlur}
          onChangeText={(t) => setAmount(filterAmountTyping(t, c))}
          maxLength={LIMITS.amountChars}
          placeholder="0"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          autoFocus
          accessibilityLabel="Amount to move"
          style={[{ fontFamily: FONT.bold, fontSize: 40, color: colors.accent, paddingVertical: 14, width: amountWidth(amount, 25), textAlign: 'center' }, noWebOutline]}
        />
      </View>
      {calc.bar && <View style={{ marginTop: -12, marginBottom: 18 }}>{calc.bar}</View>}
      <View style={{ gap: 10 }}>
        <FieldRow icon="arrow-up-circle-outline" label="From" value={nameOf(from) ? `${nameOf(from)} · ${formatMoney(availableOf(from))}` : undefined} placeholder="Choose where the money comes from" onPress={() => setPicker('from')} />
        <View style={{ alignItems: 'center' }}>
          <Ionicons name="arrow-down" size={18} color={colors.muted} />
        </View>
        <FieldRow icon="arrow-down-circle-outline" label="To" value={nameOf(to) ? `${nameOf(to)} · ${formatMoney(availableOf(to))}` : undefined} placeholder="Choose a category" onPress={() => setPicker('to')} />
      </View>
      <Txt variant="caption" tone="muted" center style={{ marginTop: 18 }}>
        Moving money changes the assigned amounts for {monthLabel(month)}.
      </Txt>
      <PickerSheet
        visible={picker !== null}
        onClose={() => setPicker(null)}
        title={picker === 'from' ? 'Move from' : 'Move to'}
        items={items}
        selectedKey={picker === 'from' ? from : to}
        onSelect={(k) => {
          if (picker === 'from') setFrom(k);
          else setTo(k);
          setPicker(null);
        }}
      />
    </Screen>
  );
}

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/utils/nav';
import React, { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useCalculator, useInputRef } from '@/components/Calculator';
import { MoneyFlow, type MoneyFlowInfo } from '@/components/MoneyMove';
import { Screen } from '@/components/Screen';
import { PickerSheet, type PickerItem } from '@/components/Sheet';
import { Button, Card, Divider, FieldRow, haptic, notify, Row, Tap, Txt } from '@/components/ui';
import { categoryMonth } from '@/engine/budget';
import { moneyPlan } from '@/engine/moveSuggestions';
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
  const [moved, setMoved] = useState<MoneyFlowInfo | null>(null);

  const availableOf = (id: string | null) => (id === RTA ? mb.readyToAssign : id ? categoryMonth(mb, id).available : 0);
  const nameOf = (id: string | null) => (id === RTA ? 'Ready to Assign' : data.categories.find((c) => c.id === id)?.name);

  const plan = useMemo(() => moneyPlan(data, mb), [data, mb]);
  const needOf = (id: string | null) => plan.needs.find((n) => n.id === id);
  const spareOf = (id: string | null) => plan.spares.find((s) => s.id === id);

  const items = useMemo(() => {
    const list: PickerItem[] = [{ key: RTA, title: 'Ready to Assign', section: 'Budget', right: <Txt variant="label" tone={mb.readyToAssign < 0 ? 'danger' : 'positive'}>{formatMoney(mb.readyToAssign)}</Txt> }];
    for (const { group, categories } of sortedGroups(data)) {
      for (const c of categories) {
        const a = categoryMonth(mb, c.id).available;
        const need = plan.needs.find((n) => n.id === c.id);
        const spare = plan.spares.find((s) => s.id === c.id);
        list.push({
          key: c.id,
          title: c.name,
          subtitle: need ? (need.overspent ? `Overspent · needs ${formatMoney(need.amount)}` : `Underfunded · needs ${formatMoney(need.amount)}`) : spare ? `${formatMoney(spare.amount)} spare` : undefined,
          section: group.name,
          right: <Txt variant="label" tone={a < 0 ? 'danger' : a > 0 ? 'positive' : 'muted'}>{formatMoney(a)}</Txt>,
        });
      }
    }
    return list;
  }, [data, mb, plan]);

  /** Picking where money goes: suggest the amount it needs (as much as the source can give). */
  const pickTo = (id: string) => {
    setTo(id);
    const need = needOf(id)?.amount ?? 0;
    if (need <= 0 || (parseMoney(amount) ?? 0) > 0) return;
    const can = from === RTA ? Math.max(mb.readyToAssign, 0) : from ? Math.max(availableOf(from), 0) : need;
    const fill = Math.min(need, can || need);
    if (fill > 0) setAmount(milliToInput(fill));
  };

  const applySuggestion = (s: { from: string; to: string; amount: number }) => {
    haptic('light');
    setFrom(s.from);
    setTo(s.to);
    setAmount(milliToInput(s.amount));
  };

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
    // What each side will have once the money moves, for the animation.
    const fromAfter = availableOf(from) - amt;
    const toAfter = availableOf(to) + amt;
    const end = (id: string, after: number) => ({
      name: nameOf(id) ?? '',
      icon: id === RTA ? ('wallet' as const) : undefined,
      caption: `${formatMoney(after)} left`,
      tone: after < 0 ? ('danger' as const) : after > 0 ? ('positive' as const) : ('muted' as const),
    });
    haptic('light');
    moveMoney(month, from!, to!, amt);
    setMoved({
      title: toAfter >= 0 && availableOf(to) < 0 ? 'Overspending covered' : 'Money moved',
      from: end(from!, fromAfter),
      to: end(to!, toAfter),
      amount: amt,
      note: toAfter < 0 ? `${nameOf(to)} is still short ${formatMoney(-toAfter)}.` : `Moved ${formatMoney(amt)} from ${nameOf(from)} to ${nameOf(to)}.`,
    });
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
        {/* Tap to swap From and To. */}
        <View style={{ alignItems: 'center', marginVertical: -4, zIndex: 1 }}>
          <Tap
            scale
            onPress={() => {
              haptic();
              setFrom(to);
              setTo(from);
            }}
            disabled={!from && !to}
            accessibilityRole="button"
            accessibilityLabel="Swap from and to"
            style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft, borderWidth: 3, borderColor: colors.bg }}
          >
            <Ionicons name="swap-vertical" size={18} color={colors.accent} />
          </Tap>
        </View>
        <FieldRow icon="arrow-down-circle-outline" label="To" value={nameOf(to) ? `${nameOf(to)} · ${formatMoney(availableOf(to))}` : undefined} placeholder="Choose a category" onPress={() => setPicker('to')} />
      </View>
      {!!to && !!needOf(to) && (
        <Txt variant="caption" tone="soft" center style={{ marginTop: 10 }}>
          {nameOf(to)} needs {formatMoney(needOf(to)!.amount)}
          {from && spareOf(from) ? ` · ${nameOf(from)} has ${formatMoney(spareOf(from)!.amount)} spare` : ''}
        </Txt>
      )}
      <Txt variant="caption" tone="muted" center style={{ marginTop: 18 }}>
        Moving money changes the assigned amounts for {monthLabel(month)}.
      </Txt>

      {plan.needs.length === 0 ? (
        <Row style={{ gap: 8, justifyContent: 'center', marginTop: 22 }}>
          <Ionicons name="checkmark-circle" size={18} color={colors.positive} />
          <Txt variant="caption" tone="soft">
            Nothing is overspent or underfunded this month.
          </Txt>
        </Row>
      ) : (
        <Card style={{ marginTop: 22, gap: 12 }}>
          <Row style={{ gap: 10 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="caption" tone="muted">
                Short this month
              </Txt>
              <Txt variant="strong" tone="danger">
                {formatMoney(plan.totalNeeded)}
              </Txt>
            </View>
            <View style={{ flex: 1, gap: 2, alignItems: 'flex-end' }}>
              <Txt variant="caption" tone="muted">
                Spare to move
              </Txt>
              <Txt variant="strong" tone={plan.totalSpare > 0 ? 'positive' : 'muted'}>
                {formatMoney(plan.totalSpare)}
              </Txt>
            </View>
          </Row>
          {/* Covered share of what's needed */}
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.sunken, overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(100, (plan.totalSpare / plan.totalNeeded) * 100)}%`, height: 6, backgroundColor: colors.positive }} />
          </View>

          {plan.suggestions.length > 0 && (
            <>
              <Divider />
              <Txt variant="overline" tone="muted">
                Suggested moves · tap to fill in
              </Txt>
              {plan.suggestions.slice(0, 8).map((s) => {
                const active = s.from === from && s.to === to;
                return (
                  <Tap
                    key={`${s.from}-${s.to}`}
                    onPress={() => applySuggestion(s)}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${formatMoney(s.amount)} from ${nameOf(s.from)} to ${nameOf(s.to)}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: RADIUS.md, backgroundColor: active ? colors.accentSoft : colors.sunken }}
                  >
                    <Txt variant="body" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {nameOf(s.from)}
                    </Txt>
                    <Ionicons name="arrow-forward" size={14} color={colors.muted} />
                    <Txt variant="body" numberOfLines={1} style={{ flex: 1 }}>
                      {nameOf(s.to)}
                    </Txt>
                    <Txt variant="label" tone="accent">
                      {formatMoney(s.amount)}
                    </Txt>
                  </Tap>
                );
              })}
            </>
          )}
          {plan.totalSpare < plan.totalNeeded && (
            <Txt variant="caption" tone="soft">
              {plan.totalSpare > 0 ? `Even after these moves you’re ${formatMoney(plan.totalNeeded - plan.totalSpare)} short. ` : 'There’s no spare money to move right now. '}
              Add income, or lower a target.
            </Txt>
          )}
        </Card>
      )}
      {moved && <MoneyFlow info={moved} onDone={goBack} />}
      <PickerSheet
        visible={picker !== null}
        onClose={() => setPicker(null)}
        title={picker === 'from' ? 'Move from' : 'Move to'}
        items={items}
        selectedKey={picker === 'from' ? from : to}
        onSelect={(k) => {
          if (picker === 'from') setFrom(k);
          else pickTo(k);
          setPicker(null);
        }}
      />
    </Screen>
  );
}

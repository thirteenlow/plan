import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { CalendarSheet } from '@/components/Calendar';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { Button, Card, Chip, confirm, Divider, GradientCard, haptic, notify, Row, Segmented, Tap, TextField, Txt } from '@/components/ui';
import { nextDueDate, targetMonthly } from '@/engine/budget';
import { useActiveBudget, useStore } from '@/store/store';
import type { Target, TargetCadence } from '@/store/types';
import { RADIUS, useTheme } from '@/theme';
import { addMonthsToDate, currentMonth, dueDayLabel, monthDiff, monthOf, ordinal, shortDate, today, WEEKDAYS, weekdayCount } from '@/utils/date';
import { formatMoney, formatNumber, getActiveCurrency, milliToInput, parseMoney } from '@/utils/money';
import { goBack } from '@/utils/nav';
import { filterAmountTyping, LIMITS, validateAmount } from '@/utils/validation';

type Behavior = 'setAside' | 'refill' | 'balance';

/** Older target kinds ("have a balance", "save monthly") open as the closest cadence. */
function initialFrom(t: Target | undefined): { cadence: TargetCadence; behavior: Behavior } {
  if (!t || t.kind === 'savings') return { cadence: 'monthly', behavior: 'setAside' };
  if (t.kind === 'balance') return t.dueDate ? { cadence: 'custom', behavior: 'balance' } : { cadence: 'monthly', behavior: 'refill' };
  const cadence = t.cadence ?? 'monthly';
  const behavior = t.behavior ?? 'setAside';
  return { cadence, behavior: behavior === 'balance' && cadence !== 'custom' ? 'refill' : behavior };
}

const BEHAVIOR_HELP: Record<'repeating' | 'custom', Partial<Record<Behavior, [string | null, string]>>> = {
  repeating: {
    setAside: ['Most people choose this', 'For bills, subscriptions and savings. Assigns the full amount every time, even if some is left over.'],
    refill: [null, 'For groceries, fun money and dining out. Tops the category back up, so leftovers count toward next time.'],
  },
  custom: {
    setAside: ['Most people choose this', 'Assign this much in total by the due date. Spending along the way doesn’t set you back.'],
    refill: [null, 'Top the category up to this amount by the due date, replacing what you spend.'],
    balance: [null, 'Save until the category holds this amount by the due date, e.g. for a big purchase.'],
  },
};

export default function TargetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useActiveBudget();
  const setTarget = useStore((s) => s.setTarget);
  const { colors } = useTheme();
  const category = data.categories.find((c) => c.id === id);
  const existing = category?.target;
  const init = initialFrom(existing);

  const [cadence, setCadence] = useState<TargetCadence>(init.cadence);
  const [behavior, setBehavior] = useState<Behavior>(init.behavior);
  const [amount, setAmount] = useState(existing ? milliToInput(existing.amount) : '');
  const [weekday, setWeekday] = useState(existing?.weekday ?? 6);
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? addMonthsToDate(today(), 12));
  const [dayOfMonth, setDayOfMonth] = useState(existing?.dayOfMonth ?? 0);
  const [sheet, setSheet] = useState<'behavior' | 'weekday' | 'day' | 'date' | null>(null);

  if (!category) return null;
  const amt = parseMoney(amount) ?? 0;
  const amountText = formatMoney(amt);
  const perLabel = cadence === 'weekly' ? '/week' : '';
  const nextLabel = cadence === 'yearly' ? 'Next year I want to' : cadence === 'custom' ? 'I want to' : 'Next month I want to';
  const custom = cadence === 'custom';
  const behaviorTitle = (b: Behavior) =>
    b === 'balance' ? `Have a balance of ${amountText}` : b === 'refill' ? `Refill up to ${amountText}${perLabel}` : `Set aside ${custom ? '' : 'another '}${amountText}${perLabel}`;
  const behaviorText = behaviorTitle(behavior);
  const changeCadence = (c: TargetCadence) => {
    setCadence(c);
    if (c !== 'custom' && behavior === 'balance') setBehavior('refill');
  };

  const build = (): Target => ({
    kind: 'needed',
    amount: Math.abs(amt),
    cadence,
    behavior,
    weekday: cadence === 'weekly' ? weekday : undefined,
    dayOfMonth: cadence === 'monthly' ? dayOfMonth : undefined,
    dueDate: cadence === 'yearly' || cadence === 'custom' ? dueDate : undefined,
    repeatMonths: cadence === 'custom' ? 0 : undefined,
    createdMonth: existing?.createdMonth ?? currentMonth(),
    snoozedMonth: existing?.snoozedMonth,
  });

  const save = () => {
    const amountError = validateAmount(parseMoney(amount), { label: 'Target amount' });
    if (amountError) return notify('Check the amount', amountError);
    if (custom && monthOf(dueDate) < currentMonth()) return notify('Choose a future date', 'The due date has already passed.');
    haptic('success');
    setTarget(id, build());
    goBack();
  };

  const remove = async () => {
    if (await confirm('Delete target', `Remove the target for “${category.name}”? Money already assigned stays where it is.`, 'Delete', true)) {
      setTarget(id, undefined);
      goBack();
    }
  };

  const amountField = (
    <TextField
      label={cadence === 'custom' ? 'Amount' : 'I need'}
      icon="cash-outline"
      value={amount}
      onChangeText={setAmount}
      filter={(t) => filterAmountTyping(t, getActiveCurrency())}
      calculator
      keyboardType="number-pad"
      maxLength={LIMITS.amountChars}
      placeholder={formatNumber(0)}
      autoFocus={!existing}
    />
  );
  const behaviorRow = <OptionRow icon="repeat-outline" label={nextLabel} value={behaviorText} onPress={() => setSheet('behavior')} />;
  const dateRow = (label: string) => <OptionRow icon="calendar-outline" label={label} value={shortDate(dueDate)} onPress={() => setSheet('date')} />;

  return (
    <Screen
      back="close"
      modal
      title={category.name}
      subtitle={existing ? 'Edit target' : 'Create target'}
      footer={
        <Row style={{ gap: 10 }}>
          {existing && <Button title="Delete" variant="danger" icon="trash-outline" onPress={remove} />}
          <Button title="Save target" icon="checkmark-circle-outline" style={{ flex: 1 }} disabled={amt <= 0} onPress={save} />
        </Row>
      }
    >
      <Segmented
        value={cadence}
        onChange={changeCadence}
        options={[
          { value: 'weekly', label: 'Weekly' },
          { value: 'monthly', label: 'Monthly' },
          { value: 'yearly', label: 'Yearly' },
          { value: 'custom', label: 'Custom' },
        ]}
      />

      <Card style={{ marginTop: 16, gap: 12 }}>
        {amountField}
        {cadence === 'weekly' && (
          <>
            <Divider />
            <OptionRow icon="calendar-outline" label="Every" value={WEEKDAYS[weekday]} onPress={() => setSheet('weekday')} />
          </>
        )}
        {cadence === 'monthly' && (
          <>
            <Divider />
            <OptionRow icon="calendar-outline" label="By" value={dueDayLabel(dayOfMonth)} onPress={() => setSheet('day')} />
          </>
        )}
        {(cadence === 'yearly' || custom) && (
          <>
            <Divider />
            {dateRow(custom ? 'Due on' : 'By')}
          </>
        )}
        <Divider />
        {behaviorRow}
      </Card>

      {amt > 0 && <MonthlyPlan target={build()} />}

      <Sheet visible={sheet === 'behavior'} onClose={() => setSheet(null)} title={custom ? 'By the due date' : cadence === 'yearly' ? 'Each year' : cadence === 'weekly' ? 'Each week' : 'Each month'}>
        {(Object.entries(BEHAVIOR_HELP[custom ? 'custom' : 'repeating']) as [Behavior, [string | null, string]][]).map(([value, [badge, text]], i) => (
          <View key={value}>
            {i > 0 && <Divider />}
            <Tap
              onPress={() => {
                setBehavior(value);
                setSheet(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: behavior === value }}
              style={{ flexDirection: 'row', gap: 12, paddingVertical: 14 }}
            >
              <View style={{ flex: 1, gap: 6 }}>
                <Txt variant="strong">{behaviorTitle(value)}</Txt>
                {!!badge && (
                  <View style={{ alignSelf: 'flex-start', backgroundColor: colors.accentSoft, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
                    <Txt variant="caption" tone="accent">
                      {badge}
                    </Txt>
                  </View>
                )}
                <Txt variant="caption" tone="muted">
                  {text}
                </Txt>
              </View>
              {behavior === value && <Ionicons name="checkmark" size={22} color={colors.accent} />}
            </Tap>
          </View>
        ))}
      </Sheet>
      <Sheet visible={sheet === 'weekday'} onClose={() => setSheet(null)} title="Every">
        <Row style={{ flexWrap: 'wrap', gap: 8 }}>
          {WEEKDAYS.map((d, i) => (
            <Chip
              key={d}
              label={d}
              active={weekday === i}
              onPress={() => {
                setWeekday(i);
                setSheet(null);
              }}
            />
          ))}
        </Row>
      </Sheet>
      <Sheet visible={sheet === 'day'} onClose={() => setSheet(null)} title="Needed by">
        <Row style={{ flexWrap: 'wrap', gap: 8 }}>
          {[0, ...Array.from({ length: 31 }, (_, i) => i + 1)].map((d) => (
            <Chip
              key={d}
              label={d === 0 ? 'Last day' : ordinal(d)}
              active={dayOfMonth === d}
              onPress={() => {
                setDayOfMonth(d);
                setSheet(null);
              }}
            />
          ))}
        </Row>
        <Txt variant="caption" tone="muted" style={{ marginTop: 12 }}>
          In shorter months, a day that doesn’t exist means the last day.
        </Txt>
      </Sheet>
      <CalendarSheet visible={sheet === 'date'} onClose={() => setSheet(null)} value={dueDate} onChange={setDueDate} title={cadence === 'custom' ? 'Due on' : 'By'} />
    </Screen>
  );
}

/** Breaks the target down into what to assign each month, starting now. */
function MonthlyPlan({ target }: { target: Target }) {
  const month = currentMonth();
  const { thisMonth, later, dueMonth } = targetMonthly(target, month);
  const due = target.dueDate ? nextDueDate(target, month) : undefined;
  const monthsLeft = dueMonth ? monthDiff(month, dueMonth) + 1 : 0;
  let detail: string;
  if (target.cadence === 'weekly') {
    const n = weekdayCount(month, target.weekday ?? 0);
    detail = `${formatMoney(target.amount)} × ${n} ${WEEKDAYS[target.weekday ?? 0]}s this month.`;
  } else if (target.cadence === 'monthly') {
    detail = `Needed by ${target.dayOfMonth ? `the ${ordinal(target.dayOfMonth)}` : 'the last day'} of each month.`;
  } else if (!due) {
    detail = 'The same every month.';
  } else {
    const until = `${formatMoney(target.amount)} by ${shortDate(due)}, ${monthsLeft === 1 ? 'this month' : `${monthsLeft} months away`}.`;
    detail = later ? `${until} Then ${formatMoney(later)} a month after that.` : until;
  }
  return (
    <GradientCard style={{ marginTop: 14 }}>
      <Txt variant="caption" tone="inverse" style={{ opacity: 0.9 }}>
        Your monthly plan
      </Txt>
      <Row style={{ alignItems: 'baseline', gap: 6 }}>
        <Txt variant="title" tone="inverse">
          {formatMoney(thisMonth)}
        </Txt>
        <Txt tone="inverse" style={{ opacity: 0.9 }}>
          {target.cadence === 'weekly' ? 'this month' : 'a month'}
        </Txt>
      </Row>
      <Txt variant="caption" tone="inverse" style={{ opacity: 0.9, marginTop: 4 }}>
        {detail}
      </Txt>
    </GradientCard>
  );
}

function OptionRow({ icon, label, value, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Ionicons name={icon} size={20} color={colors.muted} />
      <View style={{ flex: 1 }}>
        <Txt variant="caption" tone="muted">
          {label}
        </Txt>
        <Txt variant="strong">{value}</Txt>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Tap>
  );
}

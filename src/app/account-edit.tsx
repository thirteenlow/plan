import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/utils/nav';
import React, { useState } from 'react';
import { View } from 'react-native';
import { CalendarSheet } from '@/components/Calendar';
import { Screen } from '@/components/Screen';
import { PickerSheet } from '@/components/Sheet';
import { Button, confirm, FieldRow, haptic, IconBadge, notify, Row, Tap, TextField, Txt } from '@/components/ui';
import { useBalances } from '@/hooks/useBudget';
import { useActiveBudget, useStore } from '@/store/store';
import type { AccountType } from '@/store/types';
import { shortDate, today } from '@/utils/date';
import { RADIUS, useTheme } from '@/theme';
import { ACCOUNT_GRADIENTS, ACCOUNT_TYPE_INFO, sameAccountKind } from '@/utils/icons';
import { formatMoney, formatNumber, getActiveCurrency, milliToInput, parseMoney } from '@/utils/money';
import { filterAmountTyping, LIMITS, validateAmount, validateName } from '@/utils/validation';

// Grouped by how each kind of account affects the budget.
const TYPE_SECTIONS: { title: string; types: AccountType[] }[] = [
  { title: 'Cash accounts', types: ['checking', 'savings', 'cash'] },
  { title: 'Credit accounts', types: ['creditCard', 'lineOfCredit'] },
  { title: 'Mortgages and loans', types: ['mortgage', 'loan'] },
  { title: 'Tracking accounts', types: ['asset', 'liability'] },
];
const TYPES = TYPE_SECTIONS.flatMap((s) => s.types);
const sectionOf = (t: AccountType) => TYPE_SECTIONS.find((s) => s.types.includes(t))!.title;

export default function AccountEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const data = useActiveBudget();
  const balances = useBalances();
  const { colors } = useTheme();
  const { addAccount, updateAccount, adjustBalance, setAccountClosed, deleteAccount } = useStore.getState();
  const existing = id ? data.accounts.find((a) => a.id === id) : undefined;
  const startWorking = existing ? (balances[existing.id]?.working ?? 0) : 0;

  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<AccountType>(existing?.type ?? 'checking');
  const [balance, setBalance] = useState(existing && startWorking ? milliToInput(Math.abs(startWorking)) : '');
  // Editing: the sign of the working balance (debts are negative).
  const [negative, setNegative] = useState(startWorking < 0);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState(existing?.note ?? '');
  const [typePicker, setTypePicker] = useState(false);
  const [cal, setCal] = useState(false);
  const [errors, setErrors] = useState<{ name?: string | null; balance?: string | null }>({});

  const info = ACCOUNT_TYPE_INFO[type];

  const save = async () => {
    const nameError = validateName(name, { label: 'Account name', max: LIMITS.accountName, existing: data.accounts.map((a) => a.name), current: existing?.name });
    const v = parseMoney(balance || '0');
    const balanceError = validateAmount(v, { label: 'Balance', allowZero: true, allowNegative: !info.debt && !existing });
    setErrors({ name: nameError, balance: balanceError });
    if (nameError || balanceError) return;
    if (existing) {
      if (!sameAccountKind(existing.type, type)) {
        const to = ACCOUNT_TYPE_INFO[type];
        const effect = !to.onBudget
          ? 'It will be tracked for net worth only and leave your budget.'
          : to.credit
            ? 'It gets a credit card payment category, and its starting balance becomes card debt to plan for.'
            : 'Its balance will count as money in your budget (Ready to Assign).';
        if (!(await confirm(`Change to ${to.label}?`, effect, 'Change type'))) return;
      }
      updateAccount(existing.id, { name, note, type });
      const target = (negative ? -1 : 1) * Math.abs(v!);
      if (target !== startWorking) adjustBalance(existing.id, target);
      haptic('success');
      goBack();
      return;
    }
    if (date > today()) return notify('Choose today or earlier', 'The starting balance date can’t be in the future.');
    haptic('success');
    const newId = addAccount({ name, type, balance: info.debt ? -Math.abs(v!) : v!, date, note });
    if (!newId) return notify('Couldn’t add account', 'Please check the details and try again.');
    router.replace({ pathname: '/account/[id]', params: { id: newId } });
  };

  const working = startWorking;
  const newWorking = (negative ? -1 : 1) * Math.abs(parseMoney(balance || '0') ?? 0);

  return (
    <Screen
      back="close"
      modal
      title={existing ? 'Edit account' : 'Add account'}
      footer={
        <View style={{ gap: 10 }}>
          <Button title={existing ? 'Save' : 'Add account'} disabled={!name.trim()} onPress={() => void save()} />
          {existing && (
            <Button
              title={existing.closed ? 'Reopen account' : 'Close account'}
              variant="outline"
              onPress={() => {
                if (!existing.closed && working !== 0) {
                  notify('Balance must be zero', `Transfer or adjust the remaining ${formatMoney(working)} before closing this account.`);
                  return;
                }
                setAccountClosed(existing.id, !existing.closed);
                goBack();
              }}
            />
          )}
          {existing && (
            <Button
              title="Delete account"
              variant="danger"
              onPress={async () => {
                if (await confirm('Delete account', `This permanently removes “${existing.name}” and all of its transactions. Transfers to other accounts become regular transactions.`, 'Delete', true)) {
                  deleteAccount(existing.id);
                  router.dismissTo('/accounts');
                }
              }}
            />
          )}
        </View>
      }
    >
      <View style={{ alignItems: 'center', marginVertical: 14 }}>
        <IconBadge name={name || 'account'} icon={info.icon} colors={ACCOUNT_GRADIENTS[type]} size={64} />
      </View>
      <View style={{ gap: 12 }}>
        <TextField label="Account nickname" icon="pencil-outline" value={name} onChangeText={setName} maxLength={LIMITS.accountName} error={errors.name} placeholder="e.g. Everyday Checking" autoFocus={!existing} />
        <View>
          <Txt variant="label" tone="soft" style={{ marginBottom: 8, marginLeft: 4 }}>
            Type
          </Txt>
          <FieldRow icon={info.icon} value={info.label} onPress={() => setTypePicker(true)} />
        </View>
        {existing && (
          <View>
            <Txt variant="label" tone="soft" style={{ marginBottom: 8, marginLeft: 4 }}>
              Working balance
            </Txt>
            <Row style={{ gap: 10, alignItems: 'flex-start' }}>
              <Tap
                onPress={() => setNegative(!negative)}
                accessibilityRole="switch"
                accessibilityState={{ checked: !negative }}
                accessibilityLabel={negative ? 'Negative balance. Switch to positive' : 'Positive balance. Switch to negative'}
                style={{ width: 56, height: 56, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', backgroundColor: negative ? colors.dangerSoft : colors.positiveSoft }}
              >
                <Ionicons name={negative ? 'remove' : 'add'} size={24} color={negative ? colors.danger : colors.positive} />
              </Tap>
              <TextField
                containerStyle={{ flex: 1 }}
                icon="cash-outline"
                value={balance}
                onChangeText={setBalance}
                filter={(t) => filterAmountTyping(t, getActiveCurrency())}
                maxLength={LIMITS.amountChars}
                error={errors.balance}
                keyboardType="number-pad"
                placeholder={formatNumber(0)}
                calculator
              />
            </Row>
            <Txt variant="caption" tone="muted" style={{ marginTop: 6, marginHorizontal: 4 }}>
              {newWorking !== working
                ? `Saving adds a ${formatMoney(newWorking - working, { sign: true })} balance adjustment${info.onBudget && !info.credit ? ' (from Ready to Assign)' : ''}.`
                : 'Change this to match your bank. An adjustment transaction is added for the difference.'}
            </Txt>
          </View>
        )}
        {!existing && (
          <>
            <TextField
              label={info.debt ? 'Balance owed' : 'Current balance'}
              icon="cash-outline"
              value={balance}
              onChangeText={setBalance}
              filter={(t) => filterAmountTyping(t, getActiveCurrency(), { allowNegative: !info.debt })}
              maxLength={LIMITS.amountChars}
              error={errors.balance}
              keyboardType="numbers-and-punctuation"
              placeholder={formatNumber(0)}
              calculator={{ allowNegative: !info.debt }}
            />
            <View>
              <Txt variant="label" tone="soft" style={{ marginBottom: 8, marginLeft: 4 }}>
                As of
              </Txt>
              <FieldRow icon="calendar-outline" value={shortDate(date)} onPress={() => setCal(true)} />
            </View>
            <Txt variant="caption" tone="muted" style={{ marginHorizontal: 4 }}>
              {info.onBudget
                ? info.credit
                  ? 'Gets a payment category so you can plan to pay it off.'
                  : 'This balance becomes money in Ready to Assign.'
                : 'Counts toward net worth, not your budget.'}
            </Txt>
          </>
        )}
        <TextField label="Note" icon="document-text-outline" value={note} onChangeText={setNote} maxLength={LIMITS.note} multiline placeholder="Optional" />
      </View>

      <PickerSheet
        visible={typePicker}
        onClose={() => setTypePicker(false)}
        title="Account type"
        searchable={false}
        selectedKey={type}
        items={TYPES.map((t) => ({
          key: t,
          title: ACCOUNT_TYPE_INFO[t].label,
          section: sectionOf(t),
          left: <IconBadge name={t} icon={ACCOUNT_TYPE_INFO[t].icon} colors={ACCOUNT_GRADIENTS[t]} size={34} />,
        }))}
        onSelect={(k) => {
          setType(k as AccountType);
          setTypePicker(false);
        }}
      />
      <CalendarSheet visible={cal} onClose={() => setCal(false)} value={date} onChange={setDate} />
    </Screen>
  );
}

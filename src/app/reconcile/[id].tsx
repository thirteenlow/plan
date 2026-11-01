import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/utils/nav';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Button, Card, haptic, Row, TextField, Txt } from '@/components/ui';
import { useBalances } from '@/hooks/useBudget';
import { useActiveBudget, useStore } from '@/store/store';
import { useTheme } from '@/theme';
import { isCreditType } from '@/utils/icons';
import { formatMoney, formatNumber, getActiveCurrency, parseMoney } from '@/utils/money';
import { filterAmountTyping, LIMITS } from '@/utils/validation';

export default function ReconcileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useActiveBudget();
  const balances = useBalances();
  const reconcile = useStore((s) => s.reconcileAccount);
  const { colors } = useTheme();
  const [step, setStep] = useState<'ask' | 'enter'>('ask');
  const [actual, setActual] = useState('');
  const account = data.accounts.find((a) => a.id === id);
  if (!account) return null;

  const cleared = balances[id]?.cleared ?? 0;
  const debt = isCreditType(account.type) || ['liability', 'mortgage', 'loan'].includes(account.type);
  const parsed = parseMoney(actual);
  const actualMilli = parsed === null ? null : debt ? -Math.abs(parsed) : parsed;
  const diff = actualMilli === null ? 0 : actualMilli - cleared;

  const finish = (value: number) => {
    haptic('success');
    reconcile(id, value);
    goBack();
  };

  return (
    <Screen back="close" modal title="Reconcile" subtitle={account.name}>
      <Card style={{ alignItems: 'center', paddingVertical: 26, gap: 6 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
          <Ionicons name="checkmark-done" size={26} color={colors.accent} />
        </View>
        <Txt variant="label" tone="muted">
          Your cleared balance
        </Txt>
        <Txt variant="display">{formatMoney(cleared)}</Txt>
        <Txt tone="soft" center style={{ maxWidth: 320, marginTop: 6 }}>
          {step === 'ask' ? 'Does this match the balance your bank shows right now (excluding pending transactions)?' : `Enter the ${debt ? 'amount owed' : 'balance'} shown by your bank.`}
        </Txt>
      </Card>

      {step === 'ask' ? (
        <Row style={{ gap: 12, marginTop: 20 }}>
          <Button title="No" variant="outline" style={{ flex: 1 }} onPress={() => setStep('enter')} />
          <Button title="Yes" style={{ flex: 1 }} onPress={() => finish(cleared)} />
        </Row>
      ) : (
        <>
          <TextField containerStyle={{ marginTop: 20 }} label={debt ? 'Amount owed' : 'Bank balance'} icon="business-outline" value={actual} onChangeText={setActual} calculator filter={(t) => filterAmountTyping(t, getActiveCurrency(), { allowNegative: !debt })} maxLength={LIMITS.amountChars} keyboardType="numbers-and-punctuation" placeholder={formatNumber(0)} autoFocus />
          {actualMilli !== null && actual.trim() !== '' && (
            <Card style={{ marginTop: 14, gap: 6 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt tone="soft">Difference</Txt>
                <Txt variant="strong" tone={diff === 0 ? 'positive' : 'warning'}>
                  {formatMoney(diff, { sign: true })}
                </Txt>
              </Row>
              <Txt variant="caption" tone="muted">
                {diff === 0
                  ? 'Balances match. All cleared transactions will be locked.'
                  : 'Look for missing or uncleared transactions. Otherwise we’ll add an adjustment.'}
              </Txt>
            </Card>
          )}
          <Button title={diff === 0 ? 'Finish reconciling' : 'Create adjustment & finish'} disabled={actualMilli === null || actual.trim() === ''} style={{ marginTop: 18 }} onPress={() => finish(actualMilli!)} />
        </>
      )}
    </Screen>
  );
}

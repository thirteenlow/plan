import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { TransactionRow } from '@/components/TransactionRow';
import { Button, EmptyState, Row, Txt } from '@/components/ui';
import { frequencyLabel } from '@/engine/scheduled';
import { useActiveBudget } from '@/store/store';
import type { Transaction } from '@/store/types';
import { friendlyDate } from '@/utils/date';
import { formatMoney } from '@/utils/money';

export default function ScheduledScreen() {
  const data = useActiveBudget();
  const list = [...data.scheduled].sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1));
  const monthlyNet = list.filter((s) => s.frequency === 'monthly').reduce((sum, s) => sum + s.amount, 0);

  return (
    <Screen back="back" title="Scheduled" subtitle={list.length ? `${formatMoney(monthlyNet, { sign: true })} per month from monthly schedules` : undefined}>
      {list.length === 0 ? (
        <EmptyState icon="repeat-outline" title="Nothing scheduled" message="Add a transaction with a future date or a repeat to schedule it." action="Add scheduled transaction" onAction={() => router.push('/transaction')} />
      ) : (
        <View style={{ gap: 18 }}>
          {list.map((s) => {
            const tx: Transaction = { id: s.id, accountId: s.accountId, date: s.nextDate, amount: s.amount, payeeId: s.payeeId, categoryId: s.categoryId, memo: s.memo, cleared: 'uncleared', approved: true, transferAccountId: s.transferAccountId, flag: s.flag };
            return (
              <View key={s.id}>
                <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <Txt variant="label" tone="muted">
                    Next: {friendlyDate(s.nextDate)}
                  </Txt>
                  <Txt variant="label" tone="muted">
                    {frequencyLabel(s.frequency)}
                  </Txt>
                </Row>
                <TransactionRow tx={tx} upcoming showAccount onPress={() => router.push({ pathname: '/transaction', params: { scheduledId: s.id } })} />
              </View>
            );
          })}
          <Button title="Add scheduled transaction" variant="soft" icon="add" onPress={() => router.push('/transaction')} />
        </View>
      )}
    </Screen>
  );
}

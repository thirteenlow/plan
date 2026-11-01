import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { TransactionButton } from '@/components/AppNav';
import { Screen } from '@/components/Screen';
import { TransactionRow, useTxLabels } from '@/components/TransactionRow';
import { Button, Card, Chip, EmptyState, haptic, IconButton, Row, TextField, Txt } from '@/components/ui';
import { occurrencesUntil } from '@/engine/scheduled';
import { useBalances } from '@/hooks/useBudget';
import { useActiveBudget, useStore } from '@/store/store';
import type { Transaction } from '@/store/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayout } from '@/theme';
import { addDays, friendlyDate, shortDate, today } from '@/utils/date';
import { formatMoney } from '@/utils/money';
import { LIMITS } from '@/utils/validation';

type Filter = 'all' | 'uncleared' | 'unapproved' | 'flagged' | 'uncategorized';
const PAGE = 60;

export default function AccountScreen() {
  const { id, filter: initialFilter } = useLocalSearchParams<{ id: string; filter?: Filter }>();
  const data = useActiveBudget();
  const balances = useBalances();
  const approve = useStore((s) => s.approveTransactions);
  const labels = useTxLabels();
  const { isTablet } = useLayout();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>(initialFilter ?? 'all');
  const [limit, setLimit] = useState(PAGE);

  const all = id === 'all';
  const account = data.accounts.find((a) => a.id === id);
  const accountIds = useMemo(() => new Set(all ? data.accounts.map((a) => a.id) : [id]), [all, data.accounts, id]);

  const txs = useMemo(() => {
    const query = q.trim().toLowerCase();
    const onBudget = new Set(data.accounts.filter((a) => a.onBudget).map((a) => a.id));
    return data.transactions
      .filter((t) => accountIds.has(t.accountId))
      .filter((t) => {
        if (filter === 'uncleared') return t.cleared === 'uncleared';
        if (filter === 'unapproved') return !t.approved;
        if (filter === 'flagged') return !!t.flag;
        if (filter === 'uncategorized') return onBudget.has(t.accountId) && !t.categoryId && !t.transferAccountId && !t.subtransactions?.length && !t.isStartingBalance;
        return true;
      })
      .filter((t) => {
        if (!query) return true;
        const { payee, category } = labels(t);
        return `${payee} ${category} ${t.memo ?? ''} ${formatMoney(t.amount)}`.toLowerCase().includes(query);
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id.localeCompare(a.id)));
  }, [data, accountIds, filter, q, labels]);

  const upcoming = useMemo(() => {
    if (filter !== 'all' || q) return [];
    const until = addDays(today(), 31);
    const out: Transaction[] = [];
    for (const s of data.scheduled) {
      if (!accountIds.has(s.accountId)) continue;
      for (const d of occurrencesUntil(s.nextDate, s.frequency, until, 6)) {
        out.push({
          id: `${s.id}:${d}`,
          accountId: s.accountId,
          date: d,
          amount: s.amount,
          payeeId: s.payeeId,
          categoryId: s.categoryId,
          memo: s.memo,
          cleared: 'uncleared',
          approved: true,
          transferAccountId: s.transferAccountId,
          flag: s.flag,
        });
      }
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [data.scheduled, accountIds, filter, q]);

  const grouped = useMemo(() => {
    const out: { date: string; total: number; items: Transaction[] }[] = [];
    for (const t of txs.slice(0, limit)) {
      const last = out[out.length - 1];
      if (last && last.date === t.date) {
        last.items.push(t);
        last.total += t.amount;
      } else out.push({ date: t.date, total: t.amount, items: [t] });
    }
    return out;
  }, [txs, limit]);

  if (!all && !account) return null;
  const bal = all
    ? Object.entries(balances).reduce(
        (s, [aid, b]) => ({
          cleared: s.cleared + (accountIds.has(aid) ? b.cleared : 0),
          uncleared: s.uncleared + (accountIds.has(aid) ? b.uncleared : 0),
          working: s.working + (accountIds.has(aid) ? b.working : 0),
        }),
        { cleared: 0, uncleared: 0, working: 0 },
      )
    : balances[id];
  const unapproved = txs.filter((t) => !t.approved);

  return (
    <View style={{ flex: 1 }}>
      <Screen
        tabBarPadding
        back="back"
        title={all ? 'All transactions' : account!.name}
        subtitle={account?.lastReconciledAt ? `Reconciled ${shortDate(account.lastReconciledAt)}` : undefined}
        right={
          !all ? (
            <Row style={{ gap: 8 }}>
              <IconButton icon="create-outline" label="Edit account" onPress={() => router.push({ pathname: '/account-edit', params: { id } })} />
            </Row>
          ) : undefined
        }
      >
        <Card style={{ flexDirection: isTablet ? 'row' : 'column', alignItems: isTablet ? 'center' : 'stretch', gap: 14 }}>
          <View style={{ flex: isTablet ? 1 : undefined, alignItems: isTablet ? 'flex-start' : 'center' }}>
            <Txt variant="label" tone="muted">
              Working balance
            </Txt>
            <Txt variant="display" tone={bal.working < 0 ? 'danger' : 'default'} numberOfLines={1} adjustsFontSizeToFit>
              {formatMoney(bal.working)}
            </Txt>
          </View>
          <Row style={{ gap: 12, flex: isTablet ? 1 : undefined }}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Row style={{ gap: 4 }}>
                <Ionicons name="checkmark-circle" size={12} color="#14B57A" />
                <Txt variant="caption" tone="muted">
                  Cleared
                </Txt>
              </Row>
              <Txt variant="strong">{formatMoney(bal.cleared)}</Txt>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Row style={{ gap: 4 }}>
                <Ionicons name="ellipse-outline" size={12} color="#9AA2B6" />
                <Txt variant="caption" tone="muted">
                  Uncleared
                </Txt>
              </Row>
              <Txt variant="strong">{formatMoney(bal.uncleared)}</Txt>
            </View>
          </Row>
        </Card>

        <TextField maxLength={LIMITS.search} containerStyle={{ marginTop: 16 }} icon="search" placeholder="Search payee, category, memo" value={q} onChangeText={setQ} autoCorrect={false} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, marginHorizontal: -4 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}>
          {(['all', 'uncleared', 'unapproved', 'uncategorized', 'flagged'] as Filter[]).map((f) => (
            <Chip key={f} label={f[0].toUpperCase() + f.slice(1)} active={filter === f} onPress={() => setFilter(f)} />
          ))}
        </ScrollView>

        {unapproved.length > 0 && (
          <Button
            title={`Approve ${unapproved.length} transaction${unapproved.length > 1 ? 's' : ''}`}
            icon="checkmark-circle-outline"
            variant="soft"
            style={{ marginTop: 14 }}
            onPress={() => {
              haptic('success');
              approve(unapproved.map((t) => t.id));
            }}
          />
        )}

        {upcoming.length > 0 && (
          <>
            <Row style={{ justifyContent: 'space-between', marginTop: 22, marginBottom: 10 }}>
              <Txt variant="label" tone="muted">
                Upcoming (next 30 days)
              </Txt>
              <Txt variant="label" tone="muted">
                {formatMoney(upcoming.reduce((s, t) => s + t.amount, 0))}
              </Txt>
            </Row>
            <View style={{ gap: 10 }}>
              {upcoming.map((t) => (
                <TransactionRow key={t.id} tx={t} upcoming showAccount={all} onPress={() => router.push({ pathname: '/transaction', params: { scheduledId: t.id.split(':')[0] } })} />
              ))}
            </View>
          </>
        )}

        {grouped.length === 0 ? (
          <EmptyState icon="receipt-outline" title="No transactions" message={q || filter !== 'all' ? 'Try a different search or filter.' : 'Tap + to add your first transaction.'} />
        ) : (
          grouped.map((g) => (
            <View key={g.date}>
              <Row style={{ justifyContent: 'space-between', marginTop: 22, marginBottom: 10 }}>
                <Txt variant="label" tone="muted">
                  {friendlyDate(g.date)}
                </Txt>
                <Txt variant="label" tone="muted">
                  {formatMoney(g.total, { sign: true })}
                </Txt>
              </Row>
              <View style={{ gap: 10 }}>
                {g.items.map((t) => (
                  <TransactionRow key={t.id} tx={t} showAccount={all} onPress={() => router.push({ pathname: '/transaction', params: { id: t.id } })} />
                ))}
              </View>
            </View>
          ))
        )}
        {txs.length > limit && <Button title={`Show more (${txs.length - limit})`} variant="ghost" small onPress={() => setLimit(limit + PAGE)} style={{ marginTop: 14 }} />}
      </Screen>
      {(all || !account!.closed) && <TransactionButton bottom={insets.bottom + 20} accountId={all ? undefined : id} />}
    </View>
  );
}

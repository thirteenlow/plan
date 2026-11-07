import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { HeaderPill, Screen } from '@/components/Screen';
import { PickerSheet } from '@/components/Sheet';
import { TabMenu } from '@/components/TabMenu';
import { TransactionRow, useTxLabels } from '@/components/TransactionRow';
import { Button, Card, confirm, EmptyState, haptic, IconBadge, IconButton, Row, Tap, TextField, Txt } from '@/components/ui';
import { categoryMonth } from '@/engine/budget';
import { occurrencesUntil } from '@/engine/scheduled';
import { type SpendingFilter, sortedGroups, useMonthBudget, useUi } from '@/hooks/useBudget';
import { useActiveBudget, useStore } from '@/store/store';
import { RTA, type Transaction } from '@/store/types';
import { RADIUS, useTheme } from '@/theme';
import { addDays, currentMonth, longDate, today } from '@/utils/date';
import { formatMoney } from '@/utils/money';
import { deletePhoto } from '@/utils/photos';
import { LIMITS } from '@/utils/validation';

const PAGE = 80;
const FILTER_LABELS: Record<SpendingFilter, string> = {
  all: 'All transactions',
  unapproved: 'Unapproved',
  uncategorized: 'Uncategorized',
  uncleared: 'Uncleared',
  flagged: 'Flagged',
};


export default function SpendingScreen() {
  const data = useActiveBudget();
  const labels = useTxLabels();
  const { colors } = useTheme();
  const { spendingFilter: filter, setSpendingFilter: setFilter } = useUi();
  const { approveTransactions, setClearedMany, categorizeMany, deleteTransactions } = useStore.getState();
  const mb = useMonthBudget(currentMonth())!;
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [showScheduled, setShowScheduled] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<'filter' | 'category' | null>(null);

  const onBudget = useMemo(() => new Set(data.accounts.filter((a) => a.onBudget).map((a) => a.id)), [data.accounts]);

  const txs = useMemo(() => {
    const query = q.trim().toLowerCase();
    return data.transactions
      .filter((t) => {
        if (filter === 'uncleared') return t.cleared === 'uncleared';
        if (filter === 'unapproved') return !t.approved;
        if (filter === 'flagged') return !!t.flag;
        if (filter === 'uncategorized') return onBudget.has(t.accountId) && !t.categoryId && !t.subtransactions?.length && !t.isStartingBalance && !(t.transferAccountId && onBudget.has(t.transferAccountId));
        return true;
      })
      .filter((t) => {
        if (!query) return true;
        const { payee, category } = labels(t);
        const account = data.accounts.find((a) => a.id === t.accountId)?.name ?? '';
        return `${payee} ${category} ${account} ${t.memo ?? ''} ${formatMoney(t.amount)}`.toLowerCase().includes(query);
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id.localeCompare(a.id)));
  }, [data, filter, q, labels, onBudget]);

  const upcoming = useMemo(() => {
    const until = addDays(today(), 31);
    const out: (Transaction & { scheduleId: string })[] = [];
    for (const s of data.scheduled) {
      for (const d of occurrencesUntil(s.nextDate, s.frequency, until, 4)) {
        out.push({ id: `${s.id}:${d}`, scheduleId: s.id, accountId: s.accountId, date: d, amount: s.amount, payeeId: s.payeeId, categoryId: s.categoryId, memo: s.memo, cleared: 'uncleared', approved: true, transferAccountId: s.transferAccountId, flag: s.flag });
      }
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [data.scheduled]);

  const grouped = useMemo(() => {
    const out: { date: string; total: number; items: Transaction[] }[] = [];
    for (const t of txs.slice(0, limit)) {
      const last = out[out.length - 1];
      if (last?.date === t.date) {
        last.items.push(t);
        last.total += t.amount;
      } else out.push({ date: t.date, total: t.amount, items: [t] });
    }
    return out;
  }, [txs, limit]);

  const toggle = (id: string) => {
    haptic();
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const ids = [...selected];

  const right = selecting ? (
    <Button title="Done" small variant="soft" onPress={exitSelect} />
  ) : (
    <Row style={{ gap: 8 }}>
      <HeaderPill>
        <Tap onPress={() => setSelecting(true)} accessibilityRole="button" style={{ paddingHorizontal: 14, height: 36, justifyContent: 'center' }}>
          <Txt variant="strong">Select</Txt>
        </Tap>
      </HeaderPill>
      <HeaderPill>
        <IconButton icon="search" label="Search transactions" tone="plain" size={36} color={searching ? colors.accent : undefined} onPress={() => setSearching(!searching)} />
        <TabMenu
          plain
          title="Spending"
          actions={[
            { label: 'Filter', icon: 'filter-outline', hint: FILTER_LABELS[filter], onPress: () => setSheet('filter') },
            { label: 'By category or payee', icon: 'albums-outline', hint: 'Every transaction for one', onPress: () => router.push('/history') },
            { label: 'Scheduled transactions', icon: 'repeat-outline', onPress: () => router.push('/scheduled') },
            { label: 'Payees', icon: 'people-outline', onPress: () => router.push('/payees') },
          ]}
        />
      </HeaderPill>
    </Row>
  );

  const selectBar = selecting ? (
    <Card style={{ marginBottom: 10, gap: 10 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="strong">{selected.size} selected</Txt>
        <Tap onPress={() => setSelected(selected.size === txs.slice(0, limit).length ? new Set() : new Set(txs.slice(0, limit).map((t) => t.id)))}>
          <Txt variant="label" tone="accent">
            {selected.size === txs.slice(0, limit).length && selected.size > 0 ? 'Deselect all' : 'Select all'}
          </Txt>
        </Tap>
      </Row>
      <Row style={{ gap: 8, flexWrap: 'wrap' }}>
        <BulkButton icon="checkmark-done" label="Approve" disabled={!ids.length} onPress={() => {
            approveTransactions(ids);
            exitSelect();
          }} />
        <BulkButton icon="checkmark-circle-outline" label="Clear" disabled={!ids.length} onPress={() => {
            setClearedMany(ids, true);
            exitSelect();
          }} />
        <BulkButton icon="pricetag-outline" label="Categorize" disabled={!ids.length} onPress={() => setSheet('category')} />
        <BulkButton
          icon="trash-outline"
          label="Delete"
          danger
          disabled={!ids.length}
          onPress={async () => {
            if (await confirm('Delete transactions', `Delete ${ids.length} transaction${ids.length > 1 ? 's' : ''}? Transfers are removed from both accounts.`, 'Delete', true)) {
              const photos = data.transactions.filter((t) => ids.includes(t.id) && t.photoId).map((t) => t.photoId);
              deleteTransactions(ids);
              for (const ph of photos) void deletePhoto(ph);
              exitSelect();
            }
          }}
        />
      </Row>
    </Card>
  ) : null;

  return (
    <Screen largeTitle title="Spending" right={right} belowHeader={selectBar} tabBarPadding>
      {searching && <TextField maxLength={LIMITS.search} icon="search" placeholder="Search payee, category, account, memo" value={q} onChangeText={setQ} autoFocus autoCorrect={false} containerStyle={{ marginBottom: 12 }} />}

      {filter !== 'all' && (
        <Tap onPress={() => setFilter('all')} accessibilityRole="button" accessibilityLabel="Clear filter" style={{ flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 6, marginBottom: 12, backgroundColor: colors.text, borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 8 }}>
          <Ionicons name="filter" size={13} color={colors.bg} />
          <Txt variant="label" style={{ color: colors.bg }}>
            {FILTER_LABELS[filter]}
          </Txt>
          <Ionicons name="close" size={14} color={colors.bg} />
        </Tap>
      )}

      {upcoming.length > 0 && filter === 'all' && !q && (
        <>
          <Tap onPress={() => setShowScheduled(!showScheduled)} accessibilityRole="button" accessibilityState={{ expanded: showScheduled }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 }}>
            <Ionicons name={showScheduled ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.textSoft} />
            <Txt variant="h3" style={{ flex: 1 }}>
              Scheduled
            </Txt>
            <Txt variant="label" tone="muted">
              {upcoming.length} in the next 30 days
            </Txt>
          </Tap>
          {showScheduled && (
            <View style={{ gap: 10, marginBottom: 8 }}>
              {upcoming.map((t) => (
                <View key={t.id}>
                  <Txt variant="caption" tone="muted" style={{ marginBottom: 6 }}>
                    {longDate(t.date)}
                  </Txt>
                  <TransactionRow tx={t} upcoming showAccount onPress={() => router.push({ pathname: '/transaction', params: { scheduledId: t.scheduleId } })} />
                </View>
              ))}
              <Button title="Manage scheduled" small variant="ghost" onPress={() => router.push('/scheduled')} />
            </View>
          )}
        </>
      )}

      {grouped.length === 0 ? (
        <EmptyState icon="receipt-outline" title={q || filter !== 'all' ? 'Nothing matches' : 'No transactions yet'} message={q || filter !== 'all' ? 'Try a different search or filter.' : 'Tap “Transaction” to add your first one.'} />
      ) : (
        grouped.map((g) => (
          <View key={g.date}>
            <Row style={{ justifyContent: 'space-between', marginTop: 18, marginBottom: 10 }}>
              <Txt variant="h3">{longDate(g.date)}</Txt>
              <Txt variant="label" tone="muted">
                {formatMoney(g.total, { sign: true })}
              </Txt>
            </Row>
            <View style={{ gap: 10 }}>
              {g.items.map((t) => (
                <TransactionRow
                  key={t.id}
                  tx={t}
                  showAccount
                  selecting={selecting}
                  selected={selected.has(t.id)}
                  onPress={() => (selecting ? toggle(t.id) : router.push({ pathname: '/transaction', params: { id: t.id } }))}
                />
              ))}
            </View>
          </View>
        ))
      )}
      {txs.length > limit && <Button title={`Show more (${txs.length - limit})`} variant="ghost" small onPress={() => setLimit(limit + PAGE)} style={{ marginTop: 14 }} />}

      <PickerSheet
        visible={sheet === 'filter'}
        onClose={() => setSheet(null)}
        title="Show"
        searchable={false}
        selectedKey={filter}
        items={(Object.keys(FILTER_LABELS) as SpendingFilter[]).map((f) => ({ key: f, title: FILTER_LABELS[f] }))}
        onSelect={(k) => {
          setFilter(k as SpendingFilter);
          setSheet(null);
        }}
      />
      <PickerSheet
        visible={sheet === 'category'}
        onClose={() => setSheet(null)}
        title={`Categorize ${ids.length}`}
        items={[
          { key: RTA, title: 'Ready to Assign', section: 'Inflow' },
          ...sortedGroups(data).flatMap(({ group, categories }) =>
            categories.map((c) => {
              const a = categoryMonth(mb, c.id).available;
              return { key: c.id, title: c.name, section: group.name, left: <IconBadge name={c.name} size={30} />, right: <Txt variant="label" tone={a < 0 ? 'danger' : a > 0 ? 'positive' : 'muted'}>{formatMoney(a)}</Txt> };
            }),
          ),
        ]}
        onSelect={(k) => {
          categorizeMany(ids, k);
          setSheet(null);
          exitSelect();
        }}
      />
    </Screen>
  );
}

function BulkButton({ icon, label, onPress, disabled, danger }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  const { colors } = useTheme();
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: RADIUS.pill, backgroundColor: danger ? colors.dangerSoft : colors.accentSoft, opacity: disabled ? 0.45 : 1 }}
    >
      <Ionicons name={icon} size={15} color={danger ? colors.danger : colors.accent} />
      <Txt variant="label" style={{ color: danger ? colors.danger : colors.accent }}>
        {label}
      </Txt>
    </Tap>
  );
}

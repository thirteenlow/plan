import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { TransactionRow } from '@/components/TransactionRow';
import { CalendarSheet } from '@/components/Calendar';
import { Button, Card, Chip, Divider, EmptyState, FieldRow, IconBadge, IconButton, Row, Segmented, Tap, TextField, Txt } from '@/components/ui';
import { historyItems, historySummary, periodFor, type HistoryOf, type HistoryPeriod, type HistoryRange } from '@/engine/history';
import { sortedGroups } from '@/hooks/useBudget';
import { useActiveBudget } from '@/store/store';
import { RTA } from '@/store/types';
import { useTheme } from '@/theme';
import { addMonths, currentMonth, friendlyDate, monthLabel, today } from '@/utils/date';
import { formatMoney } from '@/utils/money';
import { LIMITS } from '@/utils/validation';

const RANGES: { value: HistoryRange; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: '3m', label: '3 months' },
  { value: '12m', label: '12 months' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
];
const PAGE = 80;

const open = (params: { category?: string; payee?: string }) => router.push({ pathname: '/history', params });

/**
 * Every transaction for one category (`?category=`) or one payee (`?payee=`), with totals and month by month.
 * With neither, a list of categories and payees to pick from.
 */
export default function HistoryScreen() {
  const { category, payee, month } = useLocalSearchParams<{ category?: string; payee?: string; month?: string }>();
  const of = useMemo<HistoryOf | null>(() => (category ? { categoryId: category } : payee ? { payeeId: payee } : null), [category, payee]);
  return of ? <History of={of} month={month && /^\d{4}-\d{2}$/.test(month) ? month : undefined} /> : <Browse />;
}

/** `month`: open on that month (from a category's month), otherwise the last 12 months. */
function History({ of, month: startMonth }: { of: HistoryOf; month?: string }) {
  const data = useActiveBudget();
  const { colors } = useTheme();
  const now = currentMonth();
  const [range, setRange] = useState<HistoryRange>(startMonth ? 'month' : '12m');
  const [month, setMonth] = useState(startMonth ?? now);
  const [custom, setCustom] = useState<{ from: string; to: string }>(() => ({ from: `${addMonths(now, -2)}-01`, to: today() }));
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const period: HistoryPeriod = useMemo(() => periodFor(range, now, month, custom), [range, now, month, custom]);
  const [limit, setLimit] = useState(PAGE);
  const isCategory = 'categoryId' in of;
  const category = isCategory ? data.categories.find((c) => c.id === of.categoryId) : undefined;
  const payee = !isCategory ? data.payees.find((p) => p.id === of.payeeId) : undefined;
  const name = isCategory ? (of.categoryId === RTA ? 'Ready to Assign' : category?.name) : payee?.name;

  const items = useMemo(() => historyItems(data, of), [data, of]);
  const sum = useMemo(() => historySummary(items, of, period, now), [items, of, period, now]);
  const oneMonth = range === 'month';
  const topName = (id: string) => (isCategory ? data.payees.find((p) => p.id === id)?.name : id === RTA ? 'Ready to Assign' : data.categories.find((c) => c.id === id)?.name);

  if (!name) {
    return (
      <Screen back="close" modal title="Transactions">
        <EmptyState icon="search-outline" title="Not found" message={isCategory ? 'This category was deleted.' : 'This payee was deleted or combined into another.'} />
      </Screen>
    );
  }

  let shown = 0;
  return (
    <Screen back="close" modal title={name} subtitle={isCategory ? 'Category' : 'Payee'} maxWidth={640}>
      <View style={{ gap: 14 }}>
        <Row style={{ gap: 8, flexWrap: 'wrap' }}>
          {RANGES.map((o) => (
            <Chip key={o.value} label={o.label} active={range === o.value} onPress={() => setRange(o.value)} />
          ))}
        </Row>
        {oneMonth && (
          <Row style={{ justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: 14, padding: 4 }}>
            <IconButton icon="chevron-back" label="Previous month" tone="plain" size={40} onPress={() => setMonth(addMonths(month, -1))} />
            <Txt variant="strong">{monthLabel(month)}</Txt>
            <IconButton icon="chevron-forward" label="Next month" tone="plain" size={40} disabled={month >= now} onPress={() => setMonth(addMonths(month, 1))} />
          </Row>
        )}
        {range === 'custom' && (
          <Row style={{ gap: 8 }}>
            <View style={{ flex: 1 }}>
              <FieldRow icon="calendar-outline" label="From" value={friendlyDate(custom.from)} onPress={() => setPicking('from')} />
            </View>
            <View style={{ flex: 1 }}>
              <FieldRow icon="calendar-outline" label="To" value={friendlyDate(custom.to)} onPress={() => setPicking('to')} />
            </View>
          </Row>
        )}

        <Card style={{ gap: 12 }}>
          <Row style={{ gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Txt variant="caption" tone="muted">
                Spent
              </Txt>
              <Txt variant="h2">{formatMoney(sum.spent)}</Txt>
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="caption" tone="muted">
                {oneMonth ? 'Money in' : 'Per month'}
              </Txt>
              <Txt variant="h2">{formatMoney(oneMonth ? sum.received : sum.perMonth)}</Txt>
            </View>
          </Row>
          <Txt variant="caption" tone="muted">
            {sum.count} {sum.count === 1 ? 'transaction' : 'transactions'}
            {sum.received && !oneMonth ? ` · ${formatMoney(sum.received)} in` : ''}
          </Txt>
          {sum.top.length > 0 && (
            <View style={{ gap: 6 }}>
              <Txt variant="label" tone="soft">
                {isCategory ? 'Most spent at' : 'Filed under'}
              </Txt>
              <Row style={{ gap: 8, flexWrap: 'wrap' }}>
                {sum.top.map((t) => (
                  <Chip key={t.id} label={`${topName(t.id) ?? '—'} · ${formatMoney(t.amount)}`} onPress={() => open(isCategory ? { payee: t.id } : { category: t.id })} />
                ))}
              </Row>
            </View>
          )}
        </Card>

        {sum.byMonth.length === 0 ? (
          <EmptyState icon="receipt-outline" title="No transactions" message={range === 'all' ? `Nothing for ${name} yet.` : oneMonth ? `Nothing in ${monthLabel(month)}.` : 'Nothing in this period. Try All time.'} />
        ) : (
          sum.byMonth.map((g) => {
            if (shown >= limit) return null;
            const rows = g.items.slice(0, limit - shown);
            shown += rows.length;
            return (
              <View key={g.month} style={{ gap: 8 }}>
                <Row style={{ justifyContent: 'space-between', marginTop: 6, marginHorizontal: 4 }}>
                  <Txt variant="label" tone="soft">
                    {monthLabel(g.month)}
                  </Txt>
                  <Txt variant="label" tone={g.net < 0 ? 'default' : 'positive'}>
                    {formatMoney(g.net)}
                  </Txt>
                </Row>
                <View style={{ gap: 10 }}>
                  {rows.map((i) => (
                    // A split shows only its part for this category.
                    <TransactionRow
                      key={i.tx.id}
                      tx={i.amount === i.tx.amount ? i.tx : { ...i.tx, amount: i.amount, categoryId: isCategory ? of.categoryId : i.tx.categoryId, subtransactions: undefined }}
                      showAccount
                      onPress={() => router.push({ pathname: '/transaction', params: { id: i.tx.id } })}
                    />
                  ))}
                </View>
              </View>
            );
          })
        )}
        {sum.count > limit && <Button title="Show more" variant="soft" onPress={() => setLimit(limit + PAGE)} />}
        <Row style={{ justifyContent: 'center', gap: 6, marginTop: 4 }}>
          <Ionicons name="information-circle-outline" size={14} color={colors.muted} />
          <Txt variant="caption" tone="muted">
            Tap a transaction to edit it.
          </Txt>
        </Row>
      </View>
      <CalendarSheet
        visible={!!picking}
        onClose={() => setPicking(null)}
        title={picking === 'from' ? 'From' : 'To'}
        value={picking === 'to' ? custom.to : custom.from}
        onChange={(d) =>
          // Keep From on or before To.
          setCustom((c) => (picking === 'from' ? { from: d, to: d > c.to ? d : c.to } : { from: d < c.from ? d : c.from, to: d }))
        }
      />
    </Screen>
  );
}

/** Pick a category or payee to see its transactions. */
function Browse() {
  const data = useActiveBudget();
  const { colors } = useTheme();
  const [mode, setMode] = useState<'category' | 'payee'>('category');
  const [q, setQ] = useState('');
  const month = currentMonth();

  // This month's money out and all-time count, for each category and payee.
  const stats = useMemo(() => {
    const m = new Map<string, { month: number; count: number }>();
    const add = (key: string | null | undefined, amount: number, date: string) => {
      if (!key) return;
      const s = m.get(key) ?? { month: 0, count: 0 };
      s.count++;
      if (date.startsWith(month) && amount < 0) s.month -= amount;
      m.set(key, s);
    };
    for (const t of data.transactions) {
      if (t.isStartingBalance) continue;
      if (!t.transferAccountId) add(`p:${t.payeeId}`, t.amount, t.date);
      if (t.subtransactions?.length) for (const s of t.subtransactions) add(`c:${s.categoryId}`, s.amount, t.date);
      else add(`c:${t.categoryId}`, t.amount, t.date);
    }
    return m;
  }, [data.transactions, month]);

  const query = q.trim().toLowerCase();
  const rows: { key: string; title: string; section?: string; params: { category?: string; payee?: string } }[] =
    mode === 'category'
      ? sortedGroups(data)
          .filter(({ group }) => !group.isCreditCardPayments)
          .flatMap(({ group, categories }) => categories.map((c) => ({ key: `c:${c.id}`, title: c.name, section: group.name, params: { category: c.id } })))
      : data.payees
          .filter((p) => p.name !== 'Starting Balance' && p.name !== 'Reconciliation Balance Adjustment' && (stats.get(`p:${p.id}`)?.count ?? 0) > 0)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((p) => ({ key: `p:${p.id}`, title: p.name, params: { payee: p.id } }));
  const list = query ? rows.filter((r) => r.title.toLowerCase().includes(query)) : rows;

  return (
    <Screen back="close" modal title="Browse transactions" maxWidth={640}>
      <View style={{ gap: 12 }}>
        <Segmented
          options={[
            { value: 'category', label: 'Categories' },
            { value: 'payee', label: 'Payees' },
          ]}
          value={mode}
          onChange={(v) => setMode(v)}
        />
        <TextField icon="search" placeholder={mode === 'category' ? 'Search categories' : 'Search payees'} value={q} onChangeText={setQ} maxLength={LIMITS.search} autoCorrect={false} />
        {list.length === 0 ? (
          <EmptyState icon="search-outline" title="Nothing found" />
        ) : (
          <Card padded={false} style={{ paddingHorizontal: 16 }}>
            {list.map((r, i) => {
              const s = stats.get(r.key);
              const newSection = r.section && r.section !== list[i - 1]?.section;
              return (
                <View key={r.key}>
                  {newSection ? (
                    <Txt variant="label" tone="muted" style={{ marginTop: i ? 14 : 12, marginBottom: 2 }}>
                      {r.section}
                    </Txt>
                  ) : (
                    i > 0 && <Divider inset={mode === 'payee' ? 48 : 0} />
                  )}
                  <Tap onPress={() => open(r.params)} accessibilityRole="button" accessibilityLabel={`${r.title}, ${s?.count ?? 0} transactions`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 }}>
                    {mode === 'payee' && <IconBadge name={r.title} icon="person" size={36} />}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt variant="strong" numberOfLines={1}>
                        {r.title}
                      </Txt>
                      <Txt variant="caption" tone="muted">
                        {s?.count ?? 0} {s?.count === 1 ? 'transaction' : 'transactions'}
                        {s?.month ? ` · ${formatMoney(s.month)} this month` : ''}
                      </Txt>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                  </Tap>
                </View>
              );
            })}
          </Card>
        )}
      </View>
    </Screen>
  );
}

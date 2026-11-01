import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { BarChart, DonutChart, LineChart, NetWorthChart, SLICE_COLORS } from '@/components/charts';
import { Screen } from '@/components/Screen';
import { Card, Chip, Divider, EmptyState, Row, Segmented, Txt } from '@/components/ui';
import { earliestMonth, incomeVsExpense, netWorthSeries, spendingByCategory } from '@/engine/reports';
import { useAgeOfMoney } from '@/hooks/useBudget';
import { useActiveBudget } from '@/store/store';
import { useLayout, useTheme } from '@/theme';
import { addMonths, currentMonth, monthLabel, monthShort, MONTHS_SHORT } from '@/utils/date';
import { formatMoney } from '@/utils/money';

type Report = 'spending' | 'trends' | 'networth' | 'income';
type Range = 'this' | 'last' | '3m' | '6m' | '12m' | 'all';

const RANGES: { value: Range; label: string }[] = [
  { value: 'this', label: 'This month' },
  { value: 'last', label: 'Last month' },
  { value: '3m', label: '3 months' },
  { value: '6m', label: '6 months' },
  { value: '12m', label: '12 months' },
  { value: 'all', label: 'All time' },
];

export default function ReportsScreen() {
  const { type } = useLocalSearchParams<{ type?: Report }>();
  const data = useActiveBudget();
  const aom = useAgeOfMoney();
  const { isTablet } = useLayout();
  const { colors } = useTheme();
  const [report, setReport] = useState<Report>(type ?? 'spending');
  const [range, setRange] = useState<Range>('6m');
  const [groupBy, setGroupBy] = useState<'category' | 'group' | 'payee'>('category');
  const [selectedBar, setSelectedBar] = useState<number | undefined>();

  const now = currentMonth();
  const first = earliestMonth(data);
  const [from, to] = useMemo((): [string, string] => {
    const clamp = (m: string) => (m < first ? first : m);
    switch (range) {
      case 'this':
        return [now, now];
      case 'last':
        return [addMonths(now, -1), addMonths(now, -1)];
      case '3m':
        return [clamp(addMonths(now, -2)), now];
      case '6m':
        return [clamp(addMonths(now, -5)), now];
      case '12m':
        return [clamp(addMonths(now, -11)), now];
      default:
        return [first, now];
    }
  }, [range, now, first]);

  const slices = useMemo(() => spendingByCategory(data, from, to, groupBy), [data, from, to, groupBy]);
  const monthly = useMemo(() => incomeVsExpense(data, from, to), [data, from, to]);
  const netWorth = useMemo(() => netWorthSeries(data, from, to), [data, from, to]);
  const totalSpent = slices.reduce((s, x) => s + x.amount, 0);
  const top = slices.slice(0, 8);
  const other = slices.slice(8).reduce((s, x) => s + x.amount, 0);
  const pieData = [...top.map((s, i) => ({ ...s, color: SLICE_COLORS[i] })), ...(other > 0 ? [{ id: 'other', name: 'Everything else', amount: other, color: SLICE_COLORS[9] }] : [])];

  const monthLabelShort = (m: string) => (from.slice(0, 4) === to.slice(0, 4) ? MONTHS_SHORT[Number(m.slice(5)) - 1] : monthShort(m));
  const sel = selectedBar !== undefined ? monthly[selectedBar] : undefined;
  const avgSpending = monthly.length ? monthly.reduce((s, m) => s + m.spending, 0) / monthly.length : 0;

  return (
    <Screen back="back" title="Reports" subtitle={from === to ? monthLabel(from) : `${monthLabel(from)} – ${monthLabel(to)}`}>
      <Segmented
        value={report}
        onChange={(v) => {
          setReport(v);
          setSelectedBar(undefined);
        }}
        options={[
          { value: 'spending', label: 'Spending' },
          { value: 'trends', label: 'Trends' },
          { value: 'networth', label: 'Net worth' },
          { value: 'income', label: isTablet ? 'Income v Expense' : 'In vs Out' },
        ]}
      />
      {/* Two even rows of three so the pills line up in a grid. */}
      {[RANGES.slice(0, 3), RANGES.slice(3)].map((rowRanges, i) => (
        <Row key={i} style={{ gap: 8, marginTop: i ? 8 : 14 }}>
          {rowRanges.map((r) => (
            <Chip key={r.value} stretch label={r.label} active={range === r.value} onPress={() => setRange(r.value)} />
          ))}
        </Row>
      ))}

      {report === 'spending' && (
        <>
          <Row style={{ gap: 8, marginTop: 14 }}>
            {(['category', 'group', 'payee'] as const).map((g) => (
              <Chip key={g} stretch label={`By ${g}`} active={groupBy === g} onPress={() => setGroupBy(g)} />
            ))}
          </Row>
          {slices.length === 0 ? (
            <EmptyState icon="pie-chart-outline" title="No spending yet" message="Categorized outflows will show up here." />
          ) : (
            <View style={{ flexDirection: isTablet ? 'row' : 'column', gap: 16, marginTop: 16 }}>
              <Card style={{ alignItems: 'center', paddingVertical: 24, flex: isTablet ? 1 : undefined, justifyContent: 'center' }}>
                <DonutChart data={pieData.map((p) => ({ value: p.amount, color: p.color }))} size={isTablet ? 240 : 210} centerLabel="Total spending" centerValue={formatMoney(totalSpent)} />
              </Card>
              <Card style={{ flex: isTablet ? 1 : undefined, gap: 2 }}>
                {pieData.map((s, i) => (
                  <View key={s.id}>
                    {i > 0 && <Divider />}
                    <Row style={{ gap: 10, paddingVertical: 10 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
                      <Txt variant="body" style={{ flex: 1 }} numberOfLines={1}>
                        {s.name}
                      </Txt>
                      <Txt variant="caption" tone="muted">
                        {Math.round((s.amount / totalSpent) * 100)}%
                      </Txt>
                      <Txt variant="strong" style={{ minWidth: 90, textAlign: 'right' }}>
                        {formatMoney(s.amount)}
                      </Txt>
                    </Row>
                  </View>
                ))}
              </Card>
            </View>
          )}
        </>
      )}

      {report === 'trends' && (
        <>
          <Card style={{ marginTop: 16 }}>
            <Txt variant="caption" tone="muted" center>
              {sel ? monthLabel(sel.month) : `${monthLabel(from)} – ${monthLabel(to)}`}
            </Txt>
            <Txt variant="h2" center style={{ marginTop: 4, marginBottom: 14 }}>
              {formatMoney(sel ? sel.spending : monthly.reduce((s, m) => s + m.spending, 0))}
            </Txt>
            <BarChart
              data={monthly.map((m) => ({ label: monthLabelShort(m.month), value: Math.max(0, m.spending) / 1000 }))}
              height={isTablet ? 260 : 210}
              selected={selectedBar}
              onSelect={(i) => setSelectedBar(selectedBar === i ? undefined : i)}
            />
          </Card>
          <Row style={{ gap: 12, marginTop: 14, alignItems: 'stretch' }}>
            <Card style={{ flex: 1 }}>
              <Txt variant="caption" tone="muted" numberOfLines={1}>
                Avg. per month
              </Txt>
              <Txt variant="h3" numberOfLines={1}>
                {formatMoney(avgSpending)}
              </Txt>
            </Card>
            <Card style={{ flex: 1 }}>
              <Txt variant="caption" tone="muted" numberOfLines={1}>
                Age of money
              </Txt>
              <Txt variant="h3">{aom === null ? '—' : `${aom} days`}</Txt>
            </Card>
          </Row>
        </>
      )}

      {report === 'networth' && (
        <>
          <Card style={{ marginTop: 16 }}>
            <Txt variant="caption" tone="muted" center>
              Net worth
            </Txt>
            <Txt variant="h2" center style={{ marginTop: 4, marginBottom: 6 }}>
              {formatMoney(netWorth[netWorth.length - 1]?.netWorth ?? 0)}
            </Txt>
            {netWorth.length > 1 && <NetWorthChange first={netWorth[0].netWorth} last={netWorth[netWorth.length - 1].netWorth} />}
            {netWorth.length > 1 && (
              <NetWorthChart data={netWorth.map((p) => ({ label: monthLabelShort(p.month), assets: p.assets, debts: p.debts, net: p.netWorth }))} height={isTablet ? 260 : 210} />
            )}
            <Row style={{ justifyContent: 'center', gap: 16, marginTop: 8 }}>
              <Legend color={colors.positive} label="Assets" />
              <Legend color={colors.danger} label="Debts" />
              <Legend gradient label="Net worth" />
            </Row>
          </Card>
          <Card style={{ marginTop: 14 }}>
            {netWorth
              .slice()
              .reverse()
              .map((p, i) => (
                <View key={p.month}>
                  {i > 0 && <Divider />}
                  <MonthRow
                    title={monthLabel(p.month)}
                    main={formatMoney(p.netWorth)}
                    details={[
                      { label: 'Assets', value: formatMoney(p.assets), tone: 'positive' },
                      { label: 'Debts', value: formatMoney(-p.debts), tone: 'danger' },
                    ]}
                  />
                </View>
              ))}
          </Card>
        </>
      )}

      {report === 'income' && (
        <>
          <Card style={{ marginTop: 16 }}>
            <Row style={{ justifyContent: 'center', gap: 16, marginBottom: 12 }}>
              <Legend color="#14B57A" label="Income" />
              <Legend gradient label="Spending" />
            </Row>
            <BarChart data={monthly.map((m) => ({ label: monthLabelShort(m.month), value: Math.max(0, m.spending) / 1000, secondary: Math.max(0, m.income) / 1000 }))} height={isTablet ? 260 : 210} />
          </Card>
          {monthly.some((m) => m.income > 0) && (
            <Card style={{ marginTop: 14 }}>
              <Txt variant="h3">Savings rate</Txt>
              <Txt variant="caption" tone="muted" style={{ marginBottom: 8 }}>
                Share of each month’s income you kept
              </Txt>
              <LineChart
                data={monthly.map((m) => ({ label: monthLabelShort(m.month), value: m.income > 0 ? Math.round(((m.income - m.spending) / m.income) * 100) * 1000 : 0 }))}
                height={isTablet ? 200 : 170}
              />
            </Card>
          )}
          <Card style={{ marginTop: 14 }}>
            {[...monthly].reverse().map((m, i) => (
              <View key={m.month}>
                {i > 0 && <Divider />}
                <MonthRow
                  title={monthLabel(m.month)}
                  main={formatMoney(m.income - m.spending, { sign: true })}
                  mainTone={m.income - m.spending < 0 ? 'danger' : 'positive'}
                  details={[
                    { label: 'In', value: formatMoney(m.income), tone: 'positive' },
                    { label: 'Out', value: formatMoney(m.spending) },
                    ...(m.income > 0 ? [{ label: 'Kept', value: `${Math.round(((m.income - m.spending) / m.income) * 100)}%` }] : []),
                  ]}
                />
              </View>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

/** One month in a report list: name and the main figure on top, the breakdown underneath, so nothing overflows on phones. */
function MonthRow({ title, main, mainTone, details }: { title: string; main: string; mainTone?: 'positive' | 'danger'; details: { label: string; value: string; tone?: 'positive' | 'danger' }[] }) {
  return (
    <View style={{ paddingVertical: 10, gap: 3 }}>
      <Row style={{ gap: 8 }}>
        <Txt variant="body" style={{ flex: 1 }} numberOfLines={1}>
          {title}
        </Txt>
        <Txt variant="strong" tone={mainTone} numberOfLines={1}>
          {main}
        </Txt>
      </Row>
      <Row style={{ gap: 12, flexWrap: 'wrap' }}>
        {details.map((d) => (
          <Txt key={d.label} variant="caption" tone="muted">
            {d.label}{' '}
            <Txt variant="caption" tone={d.tone ?? 'soft'}>
              {d.value}
            </Txt>
          </Txt>
        ))}
      </Row>
    </View>
  );
}

function NetWorthChange({ first, last }: { first: number; last: number }) {
  const diff = last - first;
  return (
    <Txt variant="caption" tone={diff >= 0 ? 'positive' : 'danger'} center style={{ marginBottom: 12 }}>
      {formatMoney(diff, { sign: true })} over this period
    </Txt>
  );
}

function Legend({ color, gradient, label }: { color?: string; gradient?: boolean; label: string }) {
  const { colors } = useTheme();
  return (
    <Row style={{ gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: gradient ? colors.accent : color }} />
      <Txt variant="caption" tone="soft">
        {label}
      </Txt>
    </Row>
  );
}

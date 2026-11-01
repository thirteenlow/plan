import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { createContext, useContext, useMemo, useState } from 'react';
import { View } from 'react-native';
import { BarChart, DonutChart, LineChart, NetWorthChart, SLICE_COLORS } from '@/components/charts';
import { Screen } from '@/components/Screen';
import { TabMenu } from '@/components/TabMenu';
import { Card, GradientCard, IconButton, Row, Tap, Txt } from '@/components/ui';
import { breakdown, budgetHealth, type Insight, insights, monthSnapshot, spendingPace } from '@/engine/insights';
import { earliestMonth, incomeVsExpense, netWorthSeries } from '@/engine/reports';
import { useAgeOfMoney } from '@/hooks/useBudget';
import { useActiveBudget } from '@/store/store';
import { RADIUS, useLayout, useTheme } from '@/theme';
import { addMonths, currentMonth, monthLabel, MONTHS_SHORT, today } from '@/utils/date';
import type { IconName } from '@/utils/icons';
import { formatMoney } from '@/utils/money';

const openReport = (type: string) => router.push({ pathname: '/report', params: { type } });
const shortMonth = (m: string) => MONTHS_SHORT[Number(m.slice(5)) - 1];
/** Amounts on Reflect drop cents from 1,000 up, so figures stay short on phones. */
const money = (m: number) => formatMoney(m, { whole: true });

export default function ReflectScreen() {
  const data = useActiveBudget();
  const { isTablet } = useLayout();
  const now = currentMonth();
  const first = earliestMonth(data);
  const [month, setMonth] = useState(now);

  const switcher = (
    <Row style={{ justifyContent: 'center', gap: 8, marginBottom: 14 }}>
      <IconButton icon="chevron-back" label="Previous month" tone="plain" size={34} disabled={month <= first} onPress={() => setMonth(addMonths(month, -1))} />
      <Txt variant="h3" center style={{ minWidth: 140 }}>
        {month === now ? 'This month' : monthLabel(month)}
      </Txt>
      <IconButton icon="chevron-forward" label="Next month" tone="plain" size={34} disabled={month >= now} onPress={() => setMonth(addMonths(month, 1))} />
    </Row>
  );

  const cards = {
    hero: <HeroCard month={month} />,
    stood: <StoodOutCard month={month} />,
    pace: <PaceCard month={month} />,
    where: <WhereCard month={month} />,
    flow: <CashFlowCard />,
    worth: <NetWorthCard />,
    buffer: <BufferCard month={month} />,
    health: <HealthCard month={month} />,
  };

  return (
    <Screen largeTitle title="Reflect" right={<TabMenu title="Reflect" actions={[{ label: 'All reports', icon: 'analytics-outline', onPress: () => openReport('spending') }]} />} tabBarPadding>
      {switcher}
      {isTablet ? (
        // Two columns; cards in the same row share a height.
        <View style={{ gap: 16 }}>
          {cards.hero}
          <Pair a={cards.stood} b={cards.pace} />
          <Pair a={cards.where} b={cards.flow} />
          <Pair a={cards.worth} b={cards.buffer} />
          {cards.health}
        </View>
      ) : (
        <View style={{ gap: 16 }}>
          {cards.hero}
          {cards.stood}
          {cards.pace}
          {cards.where}
          {cards.flow}
          {cards.worth}
          {cards.buffer}
          {cards.health}
        </View>
      )}
    </Screen>
  );
}

/** Cards side by side (tablet/desktop) stretch to the taller one; stacked on phones they keep their own height. */
const FillContext = createContext(false);
const useFill = () => (useContext(FillContext) ? { flex: 1 } : undefined);

function Pair({ a, b }: { a: React.ReactNode; b: React.ReactNode }) {
  return (
    <FillContext.Provider value>
      <Row style={{ gap: 16, alignItems: 'stretch' }}>
        <View style={{ flex: 1, minWidth: 0 }}>{a}</View>
        <View style={{ flex: 1, minWidth: 0 }}>{b}</View>
      </Row>
    </FillContext.Provider>
  );
}

// ---------- At a glance ----------

function HeroCard({ month }: { month: string }) {
  const data = useActiveBudget();
  const s = useMemo(() => monthSnapshot(data, month), [data, month]);
  const vsUsual = s.usualSpending !== null ? s.spending - s.usualSpending : null;
  return (
    <GradientCard>
      <Row style={{ justifyContent: 'space-between', gap: 8 }}>
        <Txt variant="label" tone="inverse" style={{ opacity: 0.9 }}>
          {monthLabel(month)}
        </Txt>
        {s.savingsRate !== null && (
          <View style={{ backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
            <Txt variant="label" tone="inverse">
              Kept {Math.round(s.savingsRate * 100)}%
            </Txt>
          </View>
        )}
      </Row>
      <Row style={{ marginTop: 14, gap: 8 }}>
        <Stat label="In" value={s.income} />
        <Stat label="Out" value={s.spending} />
        <Stat label="Kept" value={s.saved} />
      </Row>
      {vsUsual !== null && Math.abs(vsUsual) >= 1000 && (
        <Txt variant="caption" tone="inverse" style={{ opacity: 0.92, marginTop: 12 }}>
          {vsUsual < 0 ? '↓' : '↑'} {money(Math.abs(vsUsual))} {vsUsual < 0 ? 'less' : 'more'} than a usual month
        </Txt>
      )}
    </GradientCard>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Txt variant="caption" tone="inverse" style={{ opacity: 0.85 }}>
        {label}
      </Txt>
      <Txt variant="h3" tone="inverse" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {money(value)}
      </Txt>
    </View>
  );
}

// ---------- What stood out ----------

function StoodOutCard({ month }: { month: string }) {
  const data = useActiveBudget();
  const { colors } = useTheme();
  const list = useMemo(() => insights(data, month, money), [data, month]);
  const tint = (t: Insight['tone']) => (t === 'good' ? colors.positive : t === 'warn' ? colors.warning : colors.accent);
  const soft = (t: Insight['tone']) => (t === 'good' ? colors.positiveSoft : t === 'warn' ? colors.warningSoft : colors.accentSoft);
  return (
    <Card style={useFill()}>
      <CardHeader icon="bulb" title="Highlights" />
      {list.length === 0 ? (
        <Txt tone="muted" style={{ marginTop: 12 }}>
          Nothing notable yet.
        </Txt>
      ) : (
        <View style={{ gap: 14, marginTop: 14 }}>
          {list.map((ins, i) => (
            <Row key={i} style={{ gap: 12 }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: soft(ins.tone), alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={ins.icon} size={16} color={tint(ins.tone)} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="strong" numberOfLines={1}>
                  {ins.label}
                </Txt>
                <Txt variant="caption" tone="muted" numberOfLines={1}>
                  {ins.note}
                </Txt>
              </View>
              <Txt variant="strong" style={{ color: tint(ins.tone) }}>
                {ins.value}
              </Txt>
            </Row>
          ))}
        </View>
      )}
    </Card>
  );
}

// ---------- Spending pace ----------

function PaceCard({ month }: { month: string }) {
  const data = useActiveBudget();
  const { colors } = useTheme();
  const p = useMemo(() => spendingPace(data, month, today()), [data, month]);
  const [sel, setSel] = useState<number | undefined>(undefined);
  // Compare like with like: only the days so far (at least a week), so both lines share a readable scale.
  const span = Math.min(p.days, Math.max(p.current.length, 7));
  const hasPrev = p.previousTotal > 0;
  const day = Math.min(sel ?? p.current.length - 1, p.current.length - 1);
  const now = p.current[day] ?? 0;
  const then = p.previous[Math.min(day, p.previous.length - 1)] ?? 0;
  const diff = now - then;
  // A projection from the first few days (rent on the 1st, say) would be wildly off, so wait a week.
  const projected = p.projected !== null && p.current.length >= 7 ? p.projected : null;

  return (
    <Card style={useFill()}>
      <CardHeader icon="speedometer" title="Spending pace" />
      <Txt variant="caption" tone="muted" style={{ marginTop: 12 }}>
        {`By day ${day + 1}`}
      </Txt>
      <Row style={{ gap: 8, marginTop: 4 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Legend color={colors.accent} label="This month" />
          <Txt variant="h2" numberOfLines={1}>
            {money(now)}
          </Txt>
        </View>
        {hasPrev && (
          <View style={{ flex: 1, minWidth: 0 }}>
            <Legend color={colors.muted} dashed label="Last month" />
            <Txt variant="h2" tone="muted" numberOfLines={1}>
              {money(then)}
            </Txt>
          </View>
        )}
      </Row>
      {hasPrev && Math.abs(diff) >= 1000 && <Pill tone={diff > 0 ? 'bad' : 'good'} text={`${money(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than last month`} />}
      <View style={{ marginTop: 12 }}>
        <LineChart
          data={p.current.slice(0, span).map((v, i) => ({ label: String(i + 1), value: v }))}
          compare={hasPrev ? p.previous.slice(0, span) : undefined}
          slots={span}
          height={170}
          axis
          selected={sel}
          onSelect={(i) => setSel(i === sel ? undefined : i)}
        />
      </View>
      {projected !== null && (
        <Txt variant="caption" tone="muted" center style={{ marginTop: 4 }}>
          On pace for {money(projected)} this month
        </Txt>
      )}
    </Card>
  );
}

// ---------- Where it went ----------

function WhereCard({ month }: { month: string }) {
  const data = useActiveBudget();
  const { colors } = useTheme();
  const [by, setBy] = useState<'category' | 'group' | 'payee'>('category');
  const rows = useMemo(() => breakdown(data, month, by), [data, month, by]);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const top = rows.slice(0, 5).map((r, i) => ({ ...r, color: SLICE_COLORS[i] }));
  const rest = rows.slice(5).reduce((s, r) => s + r.amount, 0);
  const shown = [...top, ...(rest > 0 ? [{ id: 'rest', name: 'Other', amount: rest, usual: null, color: SLICE_COLORS[9] }] : [])];
  const max = Math.max(1, ...shown.map((r) => r.amount));

  return (
    <Card style={useFill()}>
      <CardHeader icon="pie-chart" title="Where it went" onPress={() => openReport('spending')} />
      <View style={{ marginTop: 12 }}>
        <Toggle
          options={[
            { value: 'category', label: 'Category' },
            { value: 'group', label: 'Group' },
            { value: 'payee', label: 'Payee' },
          ]}
          value={by}
          onChange={setBy}
        />
      </View>
      {total === 0 ? (
        <EmptyChart icon="pie-chart-outline" text="No spending yet." />
      ) : (
        <>
          <View style={{ alignItems: 'center', marginVertical: 16 }}>
            <DonutChart data={shown.map((r) => ({ value: r.amount, color: r.color }))} size={150} centerLabel="Spent" centerValue={money(total)} />
          </View>
          <View style={{ gap: 12 }}>
            {shown.map((r) => {
              const change = r.usual ? (r.amount - r.usual) / r.usual : null;
              return (
                <View key={r.id} style={{ gap: 5 }}>
                  <Row style={{ gap: 8 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r.color }} />
                    <Txt variant="body" style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
                      {r.name}
                    </Txt>
                    {change !== null && Math.abs(change) >= 0.05 && (
                      <Txt variant="caption" style={{ color: change > 0 ? colors.danger : colors.positive }}>
                        {change > 0 ? '↑' : '↓'}
                        {Math.round(Math.abs(change) * 100)}%
                      </Txt>
                    )}
                    <Txt variant="strong" style={{ fontVariant: ['tabular-nums'] }}>
                      {money(r.amount)}
                    </Txt>
                  </Row>
                  <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.sunken, overflow: 'hidden' }}>
                    <View style={{ width: `${(r.amount / max) * 100}%`, height: '100%', borderRadius: 3, backgroundColor: r.color }} />
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}
    </Card>
  );
}

// ---------- Cash flow ----------

function useRange(months: 6 | 12) {
  const data = useActiveBudget();
  const now = currentMonth();
  const first = earliestMonth(data);
  const from = addMonths(now, -(months - 1));
  return { from: from < first ? first : from, to: now };
}

const RANGES = [
  { value: 6 as const, label: '6M' },
  { value: 12 as const, label: '1Y' },
];

function CashFlowCard() {
  const data = useActiveBudget();
  const { colors } = useTheme();
  const [months, setMonths] = useState<6 | 12>(6);
  const { from, to } = useRange(months);
  const rows = useMemo(() => incomeVsExpense(data, from, to), [data, from, to]);
  const [sel, setSel] = useState<number | undefined>(undefined);
  const i = sel !== undefined && sel < rows.length ? sel : rows.length - 1;
  const m = rows[i];
  const empty = rows.every((r) => r.income === 0 && r.spending === 0);

  return (
    <Card style={useFill()}>
      <CardHeader icon="stats-chart" title="Cash flow" onPress={() => openReport('income')} right={<Toggle small options={RANGES} value={months} onChange={setMonths} />} />
      {empty || !m ? (
        <EmptyChart icon="stats-chart-outline" text="Add transactions to see cash flow." />
      ) : (
        <>
          <Txt variant="caption" tone="muted" style={{ marginTop: 12 }}>
            {monthLabel(m.month)}
          </Txt>
          <Row style={{ gap: 8, marginTop: 2, marginBottom: 10 }}>
            <MiniStat label="In" value={m.income} color={colors.positive} />
            <MiniStat label="Out" value={m.spending} />
            <MiniStat label="Left" value={m.income - m.spending} color={m.income - m.spending < 0 ? colors.danger : colors.positive} />
          </Row>
          <BarChart
            data={rows.map((r) => ({ label: shortMonth(r.month), value: Math.max(0, r.spending) / 1000, secondary: Math.max(0, r.income) / 1000 }))}
            height={180}
            selected={sel}
            onSelect={(k) => setSel(k === sel ? undefined : k)}
          />
          <Row style={{ justifyContent: 'center', gap: 16, marginTop: 6 }}>
            <Legend color={colors.positive} label="In" />
            <Legend color={colors.accent} label="Out" />
          </Row>
        </>
      )}
    </Card>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Txt variant="caption" tone="muted">
        {label}
      </Txt>
      <Txt variant="strong" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={color ? { color } : undefined}>
        {money(value)}
      </Txt>
    </View>
  );
}

// ---------- Net worth ----------

function NetWorthCard() {
  const data = useActiveBudget();
  const { colors } = useTheme();
  const [months, setMonths] = useState<6 | 12>(12);
  const { from, to } = useRange(months);
  const series = useMemo(() => netWorthSeries(data, from, to), [data, from, to]);
  const [sel, setSel] = useState<number | undefined>(undefined);
  const i = sel !== undefined && sel < series.length ? sel : series.length - 1;
  const p = series[i];
  const change = series.length > 1 ? series[series.length - 1].netWorth - series[0].netWorth : 0;

  return (
    <Card style={useFill()}>
      <CardHeader icon="trending-up" title="Net worth" onPress={() => openReport('networth')} right={<Toggle small options={RANGES} value={months} onChange={setMonths} />} />
      {!p ? (
        <EmptyChart icon="trending-up-outline" text="Add an account to see net worth." />
      ) : (
        <>
          <Txt variant="caption" tone="muted" style={{ marginTop: 12 }}>
            {sel !== undefined ? monthLabel(p.month) : 'Now'}
          </Txt>
          <Txt variant="title" numberOfLines={1}>
            {money(p.netWorth)}
          </Txt>
          {series.length > 1 && sel === undefined && <Pill tone={change >= 0 ? 'good' : 'bad'} text={`${change >= 0 ? '↑' : '↓'} ${money(Math.abs(change))} in ${series.length} months`} />}
          <Row style={{ gap: 8, marginTop: 10, marginBottom: 6 }}>
            <MiniStat label="Assets" value={p.assets} color={colors.positive} />
            <MiniStat label="Debts" value={-p.debts} color={colors.danger} />
          </Row>
          {series.length > 1 && (
            <NetWorthChart
              data={series.map((s) => ({ label: shortMonth(s.month), assets: s.assets, debts: s.debts, net: s.netWorth }))}
              height={170}
              selected={sel}
              onSelect={(k) => setSel(k === sel ? undefined : k)}
            />
          )}
        </>
      )}
    </Card>
  );
}

// ---------- Safety buffer ----------

function BufferCard({ month }: { month: string }) {
  const data = useActiveBudget();
  const aom = useAgeOfMoney();
  const { colors } = useTheme();
  const h = useMemo(() => budgetHealth(data, month), [data, month]);
  const goal = 6;
  const b = h.bufferMonths;
  return (
    <Card style={useFill()}>
      <CardHeader icon="shield-checkmark" title="Safety buffer" />
      <Row style={{ alignItems: 'flex-end', gap: 6, marginTop: 12 }}>
        <Txt variant="display">{b === null ? '—' : b >= 10 ? Math.round(b) : b.toFixed(1)}</Txt>
        <Txt tone="muted" style={{ marginBottom: 6 }}>
          months covered
        </Txt>
      </Row>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.sunken, overflow: 'hidden', marginTop: 12 }}>
        <View style={{ width: `${Math.min(1, (b ?? 0) / goal) * 100}%`, height: '100%', borderRadius: 4, backgroundColor: (b ?? 0) >= 3 ? colors.positive : colors.warning }} />
      </View>
      <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
        <Txt variant="caption" tone="muted">
          {money(h.cash)} cash
        </Txt>
        <Txt variant="caption" tone="muted">
          Goal {goal} mo
        </Txt>
      </Row>
      {!!useFill() && <View style={{ flex: 1 }} />}
      <Row style={{ gap: 8, marginTop: 14, paddingHorizontal: 12, paddingVertical: 10, borderRadius: RADIUS.md, backgroundColor: colors.surfaceAlt }}>
        <Ionicons name="hourglass-outline" size={15} color={colors.muted} />
        <Txt variant="caption" tone="soft" style={{ flex: 1 }}>
          Age of money
        </Txt>
        <Txt variant="label">{aom === null ? '—' : `${aom} days`}</Txt>
      </Row>
    </Card>
  );
}

// ---------- Targets & card bills ----------

/** Two plain checks: are this month's targets funded, and is there money set aside for the card bills? */
function HealthCard({ month }: { month: string }) {
  const data = useActiveBudget();
  const { colors } = useTheme();
  const { isTablet } = useLayout();
  const h = useMemo(() => budgetHealth(data, month), [data, month]);
  const ready = h.cardDebt - h.cardUncovered;

  const targets = (
    <Section
      icon="flag"
      title="Targets this month"
      empty={h.targetsTotal === 0 ? 'No targets yet' : undefined}
      main={`${h.targetsFunded} of ${h.targetsTotal} met`}
      progress={h.targetsTotal ? h.targetsFunded / h.targetsTotal : 0}
      color={h.targetsShort > 0 ? colors.warning : colors.positive}
      note={h.targetsShort > 0 ? `Assign ${money(h.targetsShort)} more to meet them all` : 'Every target is funded'}
      onPress={() => router.navigate('/plan')}
    />
  );

  const cards = (
    <Section
      icon="card"
      title="Credit card bills"
      empty={h.cardDebt === 0 ? 'Nothing owed' : undefined}
      main={`${money(ready)} of ${money(h.cardDebt)} ready`}
      progress={h.cardDebt ? ready / h.cardDebt : 0}
      color={h.cardUncovered > 0 ? colors.danger : colors.positive}
      note={h.cardUncovered > 0 ? `Set aside ${money(h.cardUncovered)} more to pay in full` : 'Enough set aside to pay in full'}
      onPress={() => router.navigate('/plan')}
    />
  );

  return (
    <View style={{ flexDirection: isTablet ? 'row' : 'column', gap: 16 }}>
      <View style={{ flex: isTablet ? 1 : undefined }}>{targets}</View>
      <View style={{ flex: isTablet ? 1 : undefined }}>{cards}</View>
    </View>
  );
}

function Section({
  icon,
  title,
  main,
  progress,
  color,
  note,
  empty,
  onPress,
}: {
  icon: IconName;
  title: string;
  main: string;
  progress: number;
  color: string;
  note: string;
  empty?: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Card style={{ flex: 1 }}>
      <CardHeader icon={icon} title={title} onPress={onPress} />
      {empty ? (
        <Txt tone="muted" style={{ marginTop: 12 }}>
          {empty}
        </Txt>
      ) : (
        <>
          <Txt variant="h2" numberOfLines={1} style={{ marginTop: 12 }}>
            {main}
          </Txt>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.sunken, overflow: 'hidden', marginTop: 10 }}>
            <View style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%`, height: '100%', borderRadius: 4, backgroundColor: color }} />
          </View>
          <Txt variant="caption" tone="soft" style={{ marginTop: 8 }}>
            {note}
          </Txt>
        </>
      )}
    </Card>
  );
}

// ---------- shared ----------

function CardHeader({ icon, title, onPress, right }: { icon: IconName; title: string; onPress?: () => void; right?: React.ReactNode }) {
  const { colors } = useTheme();
  const label = (
    <>
      <Ionicons name={icon} size={18} color={colors.accent} />
      <Txt variant="h3" tone="accent" numberOfLines={1} style={{ flexShrink: 1 }}>
        {title}
      </Txt>
      {onPress && <Ionicons name="chevron-forward" size={16} color={colors.muted} />}
    </>
  );
  return (
    <Row style={{ gap: 8 }}>
      {onPress ? (
        <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open ${title}`} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {label}
        </Tap>
      ) : (
        <Row style={{ flex: 1, minWidth: 0, gap: 8 }}>{label}</Row>
      )}
      {right}
    </Row>
  );
}

/** Compact segmented control for card options (range, breakdown). */
function Toggle<T extends string | number>({ options, value, onChange, small }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; small?: boolean }) {
  const { colors } = useTheme();
  return (
    <Row style={{ backgroundColor: colors.surfaceAlt, borderRadius: RADIUS.pill, padding: 3, alignSelf: small ? 'auto' : 'stretch' }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Tap
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={{ flex: small ? undefined : 1, alignItems: 'center', paddingHorizontal: small ? 10 : 8, paddingVertical: small ? 4 : 7, borderRadius: RADIUS.pill, backgroundColor: active ? colors.surface : 'transparent' }}
          >
            <Txt variant="label" style={{ color: active ? colors.text : colors.muted }}>
              {o.label}
            </Txt>
          </Tap>
        );
      })}
    </Row>
  );
}

function Pill({ text, tone }: { text: string; tone: 'good' | 'bad' }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignSelf: 'flex-start', marginTop: 6, backgroundColor: tone === 'good' ? colors.positiveSoft : colors.dangerSoft, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Txt variant="caption" style={{ color: tone === 'good' ? colors.positive : colors.danger }}>
        {text}
      </Txt>
    </View>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <Row style={{ gap: 6 }}>
      <View style={dashed ? { width: 14, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: color } : { width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Txt variant="caption" tone="muted">
        {label}
      </Txt>
    </Row>
  );
}

function EmptyChart({ icon, text }: { icon: IconName; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, backgroundColor: colors.surfaceAlt, padding: 16, marginTop: 14 }}>
      <Ionicons name={icon} size={24} color={colors.muted} />
      <Txt variant="caption" tone="muted" center>
        {text}
      </Txt>
    </View>
  );
}

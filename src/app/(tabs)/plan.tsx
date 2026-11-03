import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT } from '@/components/AppNav';
import { type InputRef, useCalculator, useInputRef } from '@/components/Calculator';
import { CategoryPanel } from '@/components/CategoryPanel';
import { HeaderPill, Screen } from '@/components/Screen';
import { ActionSheet, PickerSheet } from '@/components/Sheet';
import { TabMenu } from '@/components/TabMenu';
import { AvailablePill, Button, Card, Divider, GradientCard, haptic, IconBadge, IconButton, ProgressBar, Row, Tap, Txt, useToneColors } from '@/components/ui';
import { availableTone, categoryMonth, type CategoryMonth, type MonthBudget } from '@/engine/budget';
import { AUTO_ASSIGN_OPTIONS, assignUpTo, autoAssign } from '@/engine/autoAssign';
import { AssignFlash, type AssignFlashInfo } from '@/components/AssignFlash';
import { blurActiveField, useKeyboard } from '@/hooks/useKeyboard';
import { mostOverspent } from '@/hooks/useTodos';
import { MAX_FUTURE_MONTHS, type PlanFilter, sortedGroups, useBudgetResult, useMonthBudget, useUi } from '@/hooks/useBudget';
import { useActiveBudget, useStore } from '@/store/store';
import type { Category } from '@/store/types';
import { FONT, RADIUS, useLayout, useTheme } from '@/theme';
import { addMonths, currentMonth, monthLabel, monthRange, monthShort } from '@/utils/date';
import { noWebOutline } from '@/utils/layout';
import { formatMoney, formatNumber, getActiveCurrency, milliToInput, parseMoney } from '@/utils/money';
import { filterAmountTyping, LIMITS } from '@/utils/validation';

const FILTER_LABELS: Record<PlanFilter, string> = {
  all: 'All categories',
  underfunded: 'Underfunded',
  overspent: 'Overspent',
  available: 'Money available',
  snoozed: 'Snoozed',
};

export default function PlanScreen() {
  const data = useActiveBudget();
  const { month, setMonth, planFilter: filter, setPlanFilter: setFilter } = useUi();
  const mb = useMonthBudget(month);
  const result = useBudgetResult();
  const { colors } = useTheme();
  const { isWide, isCompact, width } = useLayout();
  const applyAssignments = useStore((s) => s.applyAssignments);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<'auto' | 'filter' | 'month' | null>(null);
  const [flash, setFlash] = useState<AssignFlashInfo | null>(null);
  const closeFlash = useCallback(() => setFlash(null), []);
  const [selected, setSelected] = useState<string | null>(null);
  // Editing an Assigned amount right in the list (like a spreadsheet cell).
  const [edit, setEdit] = useState<{ id: string; text: string } | null>(null);
  const setAssigned = useStore((s) => s.setAssigned);
  const assignRef = useInputRef();
  const calc = useCalculator({ value: edit?.text ?? '', onChange: (t) => setEdit((e) => e && { ...e, text: t }), inputRef: assignRef, allowNegative: true });
  const save = (e: { id: string; text: string } | null) => {
    if (!e) return;
    const v = parseMoney(e.text || '0') ?? 0;
    if (v !== categoryMonth(mb, e.id).assigned) setAssigned(month, e.id, v);
  };
  const startEdit = (id: string) => {
    if (edit?.id === id) return;
    save(edit);
    haptic();
    const assigned = categoryMonth(mb, id).assigned;
    setEdit({ id, text: assigned ? milliToInput(assigned) : '' });
  };
  const finishEdit = () => {
    save(edit);
    setEdit(null);
    blurActiveField();
  };

  const groups = useMemo(() => sortedGroups(data), [data]);
  const minMonth = result.first < data.createdAt.slice(0, 7) ? result.first : data.createdAt.slice(0, 7);
  const maxMonth = addMonths(currentMonth(), MAX_FUTURE_MONTHS);
  const allCats = groups.flatMap((g) => g.categories);

  const matchers: Record<PlanFilter, (c: Category) => boolean> = {
    all: () => true,
    underfunded: (c) => (categoryMonth(mb, c.id).target?.underfunded ?? 0) > 0,
    overspent: (c) => categoryMonth(mb, c.id).available < 0,
    available: (c) => categoryMonth(mb, c.id).available > 0,
    snoozed: (c) => !!categoryMonth(mb, c.id).target?.snoozed,
  };
  const overspent = allCats.filter(matchers.overspent);

  const deltaOf = (changes: Record<string, number>) => Object.entries(changes).reduce((s, [id, v]) => s + v - categoryMonth(mb, id).assigned, 0);
  const rta = mb.readyToAssign;
  const autoOptions = AUTO_ASSIGN_OPTIONS.map((o) => {
    const changes = autoAssign(data, result, month, o.value, allCats.map((c) => c.id));
    const delta = deltaOf(changes);
    // Not enough to fund every target: say so, and offer to assign just what there is (below).
    const hint = o.value === 'underfunded' && rta > 0 && delta > rta ? `Needs ${formatMoney(delta - rta)} more than you have` : o.hint;
    return { ...o, hint, changes, delta };
  });
  const fullDelta = autoOptions.find((o) => o.value === 'underfunded')?.delta ?? 0;
  const partial = rta > 0 ? assignUpTo(result, month, allCats.map((c) => c.id), rta) : {};
  const partialDelta = deltaOf(partial);
  const partialOption =
    partialDelta > 0 && (fullDelta > rta || Object.keys(partial).some((id) => categoryMonth(mb, id).available < 0))
      ? [{ value: 'partial', label: `Assign the ${formatMoney(partialDelta)} you have`, hint: 'Covers overspending first, then targets from the top of your list', changes: partial, delta: partialDelta }]
      : [];

  /** Applies auto-assigned amounts, celebrating whatever got money. */
  const applyAuto = (changes: Record<string, number>, delta: number) => {
    if (Object.keys(changes).length === 0) return;
    applyAssignments(month, changes);
    const gains = Object.entries(changes)
      .map(([id, v]) => ({ name: data.categories.find((c) => c.id === id)?.name ?? '', amount: v - categoryMonth(mb, id).assigned }))
      .filter((g) => g.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    if (delta > 0 && gains.length) setFlash({ total: delta, items: gains });
    else haptic('success');
  };

  // Hide the floating "+ Transaction" button while editing; leaving the tab saves the amount.
  const latest = useRef({ edit, save });
  useEffect(() => {
    latest.current = { edit, save };
  });
  const isEditing = !!edit;
  useEffect(() => {
    useUi.setState({ assigning: isEditing });
  }, [isEditing]);
  useFocusEffect(
    useCallback(
      () => () => {
        latest.current.save(latest.current.edit);
        setEdit(null);
        useUi.setState({ assigning: false });
      },
      [],
    ),
  );

  const openCategory = (id: string) => {
    if (edit) finishEdit();
    haptic();
    if (isWide) setSelected(id);
    else router.push({ pathname: '/category/[id]', params: { id, month } });
  };

  const cover = () => {
    const id = mostOverspent(overspent.map((c) => c.id), mb);
    if (!id) return;
    haptic();
    router.push({ pathname: '/move-money', params: { month, to: id, amount: String(-categoryMonth(mb, id).available) } });
  };

  const header = {
    left: (
      <HeaderPill>
        <IconButton icon="create-outline" label="Edit categories" tone="plain" size={36} onPress={() => router.push('/categories')} />
        <IconButton icon={filter === 'all' ? 'filter-outline' : 'filter'} label="Filter categories" tone="plain" size={36} color={filter === 'all' ? undefined : colors.accent} onPress={() => setSheet('filter')} />
      </HeaderPill>
    ),
    center: (
      <Tap onPress={() => setSheet('month')} accessibilityRole="button" accessibilityLabel={`Month: ${monthLabel(month)}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6 }}>
        <Txt variant="h2">{isCompact ? monthShort(month) : `${monthLabel(month).slice(0, 3)} ${month.slice(0, 4)}`}</Txt>
        <Ionicons name="chevron-down" size={18} color={colors.text} />
      </Tap>
    ),
    right: (
      <TabMenu
        title="Plan"
        actions={[
          { label: 'Auto-assign', icon: 'flash-outline', hint: 'Fill targets, repeat last month and more', onPress: () => setSheet('auto') },
          { label: 'Move money', icon: 'swap-horizontal', onPress: () => router.push({ pathname: '/move-money', params: { month } }) },
          { label: 'Edit categories & groups', icon: 'create-outline', onPress: () => router.push('/categories') },
          ...(month !== currentMonth() ? [{ label: 'Go to this month', icon: 'today-outline' as const, onPress: () => setMonth(currentMonth()) }] : []),
        ]}
      />
    ),
  };

  const list = (
    <>
      {overspent.length > 0 && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.dangerSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Txt variant="label" tone="danger">
              {overspent.length}
            </Txt>
          </View>
          <Txt variant="strong" style={{ flex: 1 }}>
            Overspent {overspent.length === 1 ? 'category' : 'categories'}
          </Txt>
          <Tap onPress={cover} accessibilityRole="button" style={{ backgroundColor: colors.accentSoft, borderRadius: RADIUS.pill, paddingHorizontal: 18, paddingVertical: 8 }}>
            <Txt variant="label" tone="accent">
              Cover
            </Txt>
          </Tap>
        </Card>
      )}

      <View style={{ marginTop: overspent.length ? 14 : 0 }}>
        <ReadyToAssignCard mb={mb} onAssign={() => setSheet('auto')} />
      </View>

      {mb.overspentLastMonth > 0 && (
        <Row style={{ gap: 10, backgroundColor: colors.dangerSoft, borderRadius: RADIUS.md, padding: 12, marginTop: 14 }}>
          <Ionicons name="alert-circle" size={18} color={colors.danger} />
          <Txt variant="caption" tone="danger" style={{ flex: 1 }}>
            {formatMoney(mb.overspentLastMonth)} of cash overspending in {monthLabel(addMonths(month, -1))} was taken from Ready to Assign.
          </Txt>
        </Row>
      )}

      {filter !== 'all' && (
        <Tap onPress={() => setFilter('all')} accessibilityRole="button" accessibilityLabel="Clear filter" style={{ flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 6, marginTop: 16, backgroundColor: colors.text, borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 8 }}>
          <Ionicons name="filter" size={13} color={colors.bg} />
          <Txt variant="label" style={{ color: colors.bg }}>
            {FILTER_LABELS[filter]}
          </Txt>
          <Ionicons name="close" size={14} color={colors.bg} />
        </Tap>
      )}

      {groups.map(({ group, categories }) => {
        const shown = categories.filter(matchers[filter]);
        if (filter !== 'all' && shown.length === 0) return null;
        const isCollapsed = collapsed.has(group.id);
        const assigned = categories.reduce((s, c) => s + categoryMonth(mb, c.id).assigned, 0);
        const available = categories.reduce((s, c) => s + categoryMonth(mb, c.id).available, 0);
        return (
          <View key={group.id} style={{ marginTop: 22 }}>
            <Tap
              onPress={() => {
                const next = new Set(collapsed);
                if (isCollapsed) next.delete(group.id);
                else next.add(group.id);
                setCollapsed(next);
              }}
              accessibilityRole="button"
              accessibilityState={{ expanded: !isCollapsed }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, paddingRight: 14 }}
            >
              <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={16} color={colors.muted} />
              <Txt variant="h3" style={{ flex: 1 }} numberOfLines={1}>
                {group.name}
              </Txt>
              <Column label="Assigned" value={assigned} />
              <Column label="Available" value={available} pill />
            </Tap>
            {!isCollapsed && (
              <Card padded={false} style={{ paddingHorizontal: 14 }}>
                {shown.map((c, i) => (
                  <View key={c.id}>
                    {i > 0 && <Divider inset={width >= 430 ? 48 : 0} />}
                    <CategoryRow
                      category={c}
                      mb={mb}
                      selected={(isWide && selected === c.id) || edit?.id === c.id}
                      onPress={() => openCategory(c.id)}
                      onEditAssigned={() => startEdit(c.id)}
                      inputRef={edit?.id === c.id ? assignRef : undefined}
                      editing={
                        edit?.id === c.id
                          ? { text: edit.text, onChange: (t) => setEdit({ id: c.id, text: t }), onFocus: calc.onFocus, onBlur: calc.onBlur, onSubmit: finishEdit }
                          : undefined
                      }
                    />
                  </View>
                ))}
                {shown.length === 0 && (
                  <Txt variant="caption" tone="muted" style={{ paddingVertical: 14 }}>
                    No categories yet
                  </Txt>
                )}
              </Card>
            )}
          </View>
        );
      })}

      <ActionSheet
        visible={sheet === 'auto'}
        onClose={() => setSheet(null)}
        title="Auto-assign"
        actions={[
          ...partialOption.map((o) => ({ label: o.label, hint: o.hint, icon: 'wallet-outline' as const, onPress: () => applyAuto(o.changes, o.delta) })),
          ...autoOptions.map((o) => ({
            label: `${o.label}${o.delta !== 0 ? `  ·  ${formatMoney(o.delta, { sign: true })}` : ''}`,
            hint: o.hint,
            icon: o.value.startsWith('reset') ? ('refresh' as const) : o.value === 'underfunded' ? ('flash' as const) : o.value === 'reduceOverfunding' ? ('remove-circle-outline' as const) : ('copy-outline' as const),
            destructive: o.value.startsWith('reset'),
            onPress: () => applyAuto(o.changes, o.delta),
          })),
        ]}
      />
      {flash && <AssignFlash info={flash} onDone={closeFlash} />}
      <PickerSheet
        visible={sheet === 'filter'}
        onClose={() => setSheet(null)}
        title="Show"
        searchable={false}
        selectedKey={filter}
        items={(Object.keys(FILTER_LABELS) as PlanFilter[]).map((f) => {
          const n = f === 'all' ? allCats.length : allCats.filter(matchers[f]).length;
          return { key: f, title: FILTER_LABELS[f], right: <Txt variant="label" tone="muted">{n}</Txt> };
        })}
        onSelect={(k) => {
          setFilter(k as PlanFilter);
          setSheet(null);
        }}
      />
      <PickerSheet
        visible={sheet === 'month'}
        onClose={() => setSheet(null)}
        title="Month"
        searchable={false}
        selectedKey={month}
        items={monthRange(minMonth, maxMonth)
          .reverse()
          .map((m) => ({ key: m, title: monthLabel(m), subtitle: m === currentMonth() ? 'This month' : m > currentMonth() ? 'Future' : undefined, section: m.slice(0, 4) }))}
        onSelect={(k) => {
          setMonth(k);
          setSheet(null);
        }}
      />
    </>
  );

  const editing = edit ? data.categories.find((c) => c.id === edit.id) : undefined;
  const editBar = edit && editing && (
    <AssignBar
      category={editing}
      cm={categoryMonth(mb, editing.id)}
      calcBar={calc.bar}
      onSetText={(t) => setEdit({ id: editing.id, text: t })}
      onMove={() => {
        finishEdit();
        router.push({ pathname: '/move-money', params: { month, to: editing.id } });
      }}
      onDetails={() => openCategory(editing.id)}
      onDone={finishEdit}
    />
  );

  if (isWide) {
    return (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ flex: 1.25 }}>
          <Screen largeTitle {...header} tabBarPadding maxWidth={720}>
            {list}
          </Screen>
          {editBar}
        </View>
        <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: colors.border }}>
          {selected && data.categories.some((c) => c.id === selected) ? <CategoryPanel id={selected} month={month} onClose={() => setSelected(null)} /> : <InspectorSummary mb={mb} />}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Screen largeTitle {...header} tabBarPadding>
        {list}
        {!!edit && <View style={{ height: 180 }} />}
      </Screen>
      {editBar}
    </View>
  );
}

/** Shared column widths so group totals line up exactly with the rows below. */
function useColumns() {
  const { isCompact } = useLayout();
  return { assigned: isCompact ? 70 : 96, available: isCompact ? 88 : 108, gap: 10 };
}

function Column({ label, value, pill }: { label: string; value: number; pill?: boolean }) {
  const { isCompact } = useLayout();
  const cols = useColumns();
  return (
    // Pill columns get the pill's inner padding so the numbers end at the same spot.
    <View style={{ alignItems: 'flex-end', width: pill ? cols.available : cols.assigned, paddingRight: pill ? 10 : 0 }}>
      <Txt variant="caption" tone="muted" style={{ fontSize: 11 }}>
        {label}
      </Txt>
      <Txt variant="label" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>
        {formatMoney(value, { whole: isCompact })}
      </Txt>
    </View>
  );
}

/** Rolls a number to its new value instead of jumping (e.g. Ready to Assign counting down as money is assigned). */
function useRolling(value: number, duration = 700) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    const began = Date.now();
    let frame = 0;
    const step = () => {
      const t = Math.min((Date.now() - began) / duration, 1);
      const eased = 1 - (1 - t) ** 3;
      const v = Math.round(start + (value - start) * eased);
      from.current = v;
      setShown(v);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return shown;
}

function ReadyToAssignCard({ mb, onAssign }: { mb: MonthBudget; onAssign: () => void }) {
  const rta = mb.readyToAssign;
  const rolling = useRolling(rta);
  const status = rta > 0 ? 'Ready to Assign' : rta < 0 ? 'You assigned more than you have' : 'All money assigned';
  return (
    <GradientCard>
      <Row style={{ gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Txt variant="caption" tone="inverse" style={{ opacity: 0.9 }}>
            {status}
          </Txt>
          <Txt variant="title" tone="inverse" numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(rolling)}
          </Txt>
        </View>
        {rta !== 0 && (
          <Tap onPress={onAssign} style={{ backgroundColor: '#FFF', borderRadius: RADIUS.pill, paddingHorizontal: 18, paddingVertical: 10 }} accessibilityRole="button">
            <Txt variant="label" style={{ color: rta < 0 ? '#E0393E' : '#8A4BEA' }}>
              {rta > 0 ? 'Assign' : 'Fix'}
            </Txt>
          </Tap>
        )}
      </Row>
    </GradientCard>
  );
}

interface AssignEditing {
  text: string;
  onChange: (t: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onSubmit: () => void;
}

function CategoryRow({
  category,
  mb,
  onPress,
  onEditAssigned,
  editing,
  inputRef,
  selected,
}: {
  category: Category;
  mb: MonthBudget;
  onPress: () => void;
  onEditAssigned: () => void;
  editing?: AssignEditing;
  /** The amount field's ref (kept apart from `editing` so render never reads a ref) */
  inputRef?: React.RefObject<InputRef | null>;
  selected?: boolean;
}) {
  const { colors } = useTheme();
  const { isCompact, width } = useLayout();
  // Phones give the name column priority over the icon.
  const showBadge = width >= 430;
  const cols = useColumns();
  const cm = categoryMonth(mb, category.id);
  const tone = availableTone(cm);
  const { fg } = useToneColors(tone);
  const t = cm.target;
  const sub = cm.available < 0 ? (cm.cashOverspent > 0 ? `Overspent ${formatMoney(-cm.available)}` : `Credit overspending ${formatMoney(-cm.available)}`) : t?.label;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: RADIUS.md, backgroundColor: selected ? colors.accentSoft : 'transparent' }}>
      <Tap
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${category.name}, ${formatMoney(cm.available)} available`}
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }}
      >
        {showBadge && <IconBadge name={category.name} icon={category.linkedAccountId ? 'card' : undefined} size={36} />}
        <View style={{ flex: 1, gap: 4 }}>
          <Txt variant="strong" numberOfLines={1}>
            {category.name}
          </Txt>
          {t && !t.snoozed && cm.available >= 0 ? <ProgressBar progress={t.progress} color={t.funded ? colors.positive : undefined} height={4} /> : null}
          {sub ? (
            <Txt variant="caption" numberOfLines={1} style={{ color: cm.available < 0 || (t && !t.funded && !t.snoozed) ? fg : colors.muted, fontSize: 11 }}>
              {sub}
            </Txt>
          ) : null}
        </View>
      </Tap>
      {editing ? (
        <TextInput
          ref={inputRef}
          value={editing.text}
          onChangeText={(v) => editing.onChange(filterAmountTyping(v, getActiveCurrency(), { allowNegative: true }))}
          onFocus={editing.onFocus}
          onBlur={editing.onBlur}
          onSubmitEditing={editing.onSubmit}
          autoFocus
          selectTextOnFocus
          keyboardType="number-pad"
          maxLength={LIMITS.amountChars}
          placeholder={formatNumber(0)}
          placeholderTextColor={colors.muted}
          accessibilityLabel={`Assigned to ${category.name}`}
          style={[
            { width: cols.assigned, height: 34, textAlign: 'right', fontFamily: FONT.semibold, fontSize: 14, color: colors.accent, borderBottomWidth: 2, borderBottomColor: colors.accent },
            noWebOutline,
          ]}
        />
      ) : (
        <Tap onPress={onEditAssigned} accessibilityRole="button" accessibilityLabel={`Assigned ${formatMoney(cm.assigned)}. Edit`} style={{ width: cols.assigned, paddingVertical: 12 }}>
          <Txt variant="label" tone="soft" numberOfLines={1} style={{ textAlign: 'right', fontVariant: ['tabular-nums'] }}>
            {formatMoney(cm.assigned, { whole: isCompact })}
          </Txt>
        </Tap>
      )}
      <Tap onPress={onPress} accessibilityLabel={`Open ${category.name}`} style={{ paddingVertical: 12 }}>
        <AvailablePill value={cm.available} tone={tone} width={cols.available} />
        {t?.snoozed && (
          <View style={{ position: 'absolute', top: 5, left: -6 }} accessibilityLabel="Target snoozed">
            <Txt style={{ fontSize: 10, color: colors.muted, fontWeight: '700' }}>zᶻ</Txt>
          </View>
        )}
      </Tap>
    </View>
  );
}

/** Floating bar while an Assigned amount is being edited: target shortcut, calculator keys and quick actions. */
function AssignBar({
  category,
  cm,
  calcBar,
  onSetText,
  onMove,
  onDetails,
  onDone,
}: {
  category: Category;
  cm: CategoryMonth;
  calcBar: React.ReactNode;
  onSetText: (t: string) => void;
  onMove: () => void;
  onDetails: () => void;
  onDone: () => void;
}) {
  const { colors, shadow } = useTheme();
  const { isTablet } = useLayout();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboard();
  const need = cm.target && !cm.target.snoozed ? cm.target.underfunded : 0;
  const bottom = keyboard.height > 0 ? keyboard.height + 8 : isTablet ? 16 : TAB_BAR_HEIGHT + Math.max(insets.bottom, 10) + 8;
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom, alignItems: 'center', paddingHorizontal: 12 }} pointerEvents="box-none">
      <View style={[{ width: '100%', maxWidth: 560, backgroundColor: colors.surface, borderRadius: RADIUS.xl, padding: 14, gap: 10 }, shadow]}>
        <Row style={{ gap: 8 }}>
          <Txt variant="strong" numberOfLines={1} style={{ flex: 1 }}>
            {category.name}
          </Txt>
          <Txt variant="caption" tone="muted">
            Available {formatMoney(cm.available)}
          </Txt>
        </Row>
        {need > 0 && (
          <Tap
            onPress={() => onSetText(milliToInput(cm.assigned + need))}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.accentSoft, borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 9 }}
          >
            <Ionicons name="flash" size={14} color={colors.accent} />
            <Txt variant="label" tone="accent" numberOfLines={1} style={{ flexShrink: 1 }}>
              Assign {formatMoney(need)} more to reach the target
            </Txt>
          </Tap>
        )}
        {calcBar}
        <Row style={{ gap: 8 }}>
          <Button title="Move" small variant="soft" icon="swap-horizontal" style={{ flex: 1 }} onPress={onMove} />
          <Button title="Details" small variant="soft" icon="ellipsis-horizontal" style={{ flex: 1 }} onPress={onDetails} />
          <Button title="Done" small style={{ flex: 1 }} onPress={onDone} />
        </Row>
      </View>
    </View>
  );
}

function InspectorSummary({ mb }: { mb: MonthBudget }) {
  const { colors } = useTheme();
  const rows: [string, number][] = [
    ['Left over from last month', mb.available - mb.assigned - mb.activity],
    ['Assigned this month', mb.assigned],
    ['Activity', mb.activity],
    ['Available', mb.available],
  ];
  return (
    <Screen title="Month summary" subtitle={monthLabel(mb.month)}>
      <View style={{ backgroundColor: colors.surface, borderRadius: RADIUS.lg, padding: 18, gap: 14 }}>
        {rows.map(([l, v]) => (
          <Row key={l} style={{ justifyContent: 'space-between' }}>
            <Txt tone="soft">{l}</Txt>
            <Txt variant="strong">{formatMoney(v)}</Txt>
          </Row>
        ))}
      </View>
      <View style={{ backgroundColor: colors.surface, borderRadius: RADIUS.lg, padding: 18, gap: 10, marginTop: 14 }}>
        <Txt variant="h3">Targets</Txt>
        <Txt tone="soft">{mb.underfunded > 0 ? `${formatMoney(mb.underfunded)} more is needed to fully fund this month’s targets.` : 'Every target is funded for this month. 🎉'}</Txt>
        <Txt variant="caption" tone="muted">
          Select a category to see its details, assign money and set a target.
        </Txt>
      </View>
    </Screen>
  );
}

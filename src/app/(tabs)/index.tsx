import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { canCreateBudget } from '@/cloud/pro';
import { AccountProBadge } from '@/components/ProBadge';
import React, { useState } from 'react';
import { View } from 'react-native';
import { ProgressRing } from '@/components/charts';
import { Screen } from '@/components/Screen';
import { PickerSheet, Sheet } from '@/components/Sheet';
import { TabMenu } from '@/components/TabMenu';
import { AvailablePill, Button, Card, Divider, GradientCard, haptic, IconBadge, Row, Tap, Txt } from '@/components/ui';
import { availableTone, categoryMonth } from '@/engine/budget';
import { sortedGroups, useMonthBudget, useUi } from '@/hooks/useBudget';
import { type Todo, useTodos } from '@/hooks/useTodos';
import { useActiveBudget, useStore } from '@/store/store';
import type { BudgetData } from '@/store/types';
import { RADIUS, useLayout, useTheme } from '@/theme';
import { currentMonth, shortDate } from '@/utils/date';
import { formatMoney } from '@/utils/money';

const TODO_ICONS: Record<Todo['kind'], React.ComponentProps<typeof Ionicons>['name']> = {
  overspent: 'alert-circle',
  assign: 'layers',
  overassigned: 'warning',
  approve: 'checkmark-done',
  categorize: 'pricetag',
};

/** Default goal: the first category with a dated or balance target. */
function defaultGoalId(data: BudgetData) {
  return (data.categories.find((c) => c.target?.kind === 'balance' && c.target.dueDate) ?? data.categories.find((c) => c.target?.kind === 'balance') ?? data.categories.find((c) => c.target))?.id;
}

export default function HomeScreen() {
  const data = useActiveBudget();
  const month = currentMonth();
  const mb = useMonthBudget(month);
  const todos = useTodos();
  const { isTablet } = useLayout();
  const { colors } = useTheme();
  const updateSettings = useStore((s) => s.updateSettings);
  const { setMonth, setPlanFilter, setSpendingFilter } = useUi.getState();
  const [pinnedOpen, setPinnedOpen] = useState(true);
  const [goalOpen, setGoalOpen] = useState(true);
  const [editPinned, setEditPinned] = useState(false);
  const [pickGoal, setPickGoal] = useState(false);
  const fill = isTablet ? { flex: 1 } : undefined;

  const name = data.settings.ownerName?.trim();
  const pinned = (data.settings.pinnedCategoryIds ?? []).map((id) => data.categories.find((c) => c.id === id)).filter((c) => !!c);
  const goalId = data.settings.currentGoalId && data.categories.some((c) => c.id === data.settings.currentGoalId) ? data.settings.currentGoalId : defaultGoalId(data);
  const goal = data.categories.find((c) => c.id === goalId);
  const goalCm = goal ? categoryMonth(mb, goal.id) : undefined;

  const runTodo = (t: Todo) => {
    haptic();
    switch (t.kind) {
      case 'overspent':
        // Opens Move money on the most overspent category; covering it brings back Cover for the next one.
        if (t.categoryId) router.push({ pathname: '/move-money', params: { month, to: t.categoryId, amount: String(-categoryMonth(mb, t.categoryId).available) } });
        break;
      case 'assign':
      case 'overassigned':
        setMonth(month);
        setPlanFilter(t.kind === 'assign' ? 'underfunded' : 'all');
        router.navigate('/plan');
        break;
      case 'approve':
        setSpendingFilter('unapproved');
        router.navigate('/spending');
        break;
      case 'categorize':
        setSpendingFilter('uncategorized');
        router.navigate('/spending');
        break;
    }
  };

  const welcome = (
    <GradientCard>
      <Txt variant="h2" tone="inverse">
        Welcome back{name ? `, ${name}` : ''}
      </Txt>
      <Txt tone="inverse" style={{ opacity: 0.9, marginTop: 4 }}>
        {todos.length === 0 ? 'All caught up. Every dollar has a job.' : todos.length === 1 ? 'Just one thing to do' : `${todos.length} things to do`}
      </Txt>
      <View style={{ gap: 10, marginTop: todos.length ? 16 : 0 }}>
        {todos.map((t) => (
          <Row key={t.kind} style={{ gap: 12, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: RADIUS.lg, paddingVertical: 10, paddingLeft: 12, paddingRight: 10 }}>
            <View style={{ minWidth: 30, height: 30, borderRadius: 15, paddingHorizontal: 6, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' }}>
              {t.kind === 'assign' || t.kind === 'overassigned' ? (
                <Ionicons name={TODO_ICONS[t.kind]} size={15} color="#8A4BEA" />
              ) : (
                <Txt variant="label" style={{ color: t.kind === 'overspent' ? '#E0393E' : '#8A4BEA' }}>
                  {t.count}
                </Txt>
              )}
            </View>
            <Txt variant="strong" tone="inverse" style={{ flex: 1 }} numberOfLines={2}>
              {t.label}
            </Txt>
            <Tap onPress={() => runTodo(t)} accessibilityRole="button" accessibilityLabel={`${t.action}: ${t.label}`} style={{ backgroundColor: '#FFF', borderRadius: RADIUS.pill, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Txt variant="label" style={{ color: '#8A4BEA' }}>
                {t.action}
              </Txt>
            </Tap>
          </Row>
        ))}
      </View>
    </GradientCard>
  );

  const pinnedCard = (
    <Card style={[{ paddingVertical: 8 }, fill]}>
      <SectionHeader title="Pinned" open={pinnedOpen} onToggle={() => setPinnedOpen(!pinnedOpen)} action="Edit" onAction={() => setEditPinned(true)} />
      {pinnedOpen &&
        (pinned.length === 0 ? (
          <Tap onPress={() => setEditPinned(true)} style={{ paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flex: isTablet ? 1 : undefined }}>
            <Txt tone="muted" center>
              Pin the categories you check most often.
            </Txt>
          </Tap>
        ) : (
          pinned.map((c, i) => {
            const cm = categoryMonth(mb, c.id);
            return (
              <View key={c.id}>
                {i > 0 && <Divider inset={50} />}
                <Tap onPress={() => router.push({ pathname: '/category/[id]', params: { id: c.id, month } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                  <IconBadge name={c.name} icon={c.linkedAccountId ? 'card' : undefined} size={38} />
                  <Txt variant="strong" style={{ flex: 1 }} numberOfLines={1}>
                    {c.name}
                  </Txt>
                  <AvailablePill value={cm.available} tone={availableTone(cm)} />
                </Tap>
              </View>
            );
          })
        ))}
    </Card>
  );

  const goalCard = (
    <Card style={[{ paddingVertical: 8 }, fill]}>
      <SectionHeader title="Current Goal" open={goalOpen} onToggle={() => setGoalOpen(!goalOpen)} action="Adjust" onAction={() => setPickGoal(true)} />
      {goalOpen &&
        (goal && !goal.target ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 10, flex: isTablet ? 1 : undefined }}>
            <Txt variant="h3" center>
              {goal.name}
            </Txt>
            <Txt tone="muted" center>
              Set a target to see your progress here.
            </Txt>
            <Button title="Set a target" small variant="soft" onPress={() => router.push({ pathname: '/target/[id]', params: { id: goal.id } })} />
          </View>
        ) : goal && goalCm ? (
          <Tap onPress={() => router.push({ pathname: '/category/[id]', params: { id: goal.id, month } })} style={{ alignItems: 'center', paddingVertical: 12, gap: 6 }}>
            <Txt variant="h2" center>
              {goal.name}
            </Txt>
            {goal.target?.dueDate || goalCm.target?.dueMonth ? (
              <Row style={{ gap: 6 }}>
                <Ionicons name="calendar-outline" size={14} color={colors.muted} />
                <Txt tone="muted">{goal.target?.dueDate ? shortDate(goal.target.dueDate) : goalCm.target?.dueMonth}</Txt>
              </Row>
            ) : null}
            <View style={{ marginTop: 10 }}>
              {(() => {
                const target = goal.target?.amount ?? 0;
                const balanceProgress = target ? Math.max(0, goalCm.available) / target : 0;
                const progress = goal.target?.kind === 'balance' || goal.target?.dueDate ? balanceProgress : goalCm.target?.progress ?? 0;
                return (
                  <ProgressRing progress={progress} size={isTablet ? 190 : 170}>
                    <Txt variant="display">{Math.round(Math.min(progress, 1) * 100)}%</Txt>
                    <Txt variant="caption" tone="muted">
                      {progress >= 1 ? 'Complete' : 'Complete so far'}
                    </Txt>
                  </ProgressRing>
                );
              })()}
            </View>
            <Txt variant="strong" style={{ marginTop: 10 }}>
              {formatMoney(Math.max(goalCm.available, 0))} of {formatMoney(goal.target?.amount ?? 0)}
            </Txt>
            {goalCm.target && (
              <Txt variant="caption" tone={goalCm.target.funded ? 'positive' : 'warning'} center>
                {goalCm.target.label}
              </Txt>
            )}
          </Tap>
        ) : (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 10, flex: isTablet ? 1 : undefined }}>
            <Txt tone="muted" center>
              Pick something you’re saving for, like a holiday or an emergency fund.
            </Txt>
            <Button title="Choose goal" small variant="soft" onPress={() => setPickGoal(true)} />
          </View>
        ))}
    </Card>
  );

  return (
    <Screen largeTitle title={data.name} left={<AccountProBadge />} right={
        <TabMenu
          actions={[
            { label: 'Switch budget', icon: 'albums-outline', hint: `${Object.keys(useStore.getState().budgets).length} budgets on this device`, onPress: () => router.push('/budgets') },
            { label: 'New budget', icon: 'add-circle-outline', onPress: () => canCreateBudget() && router.push('/onboarding') },
            { label: 'Edit pinned categories', icon: 'pin-outline', onPress: () => setEditPinned(true) },
            { label: 'Change current goal', icon: 'flag-outline', onPress: () => setPickGoal(true) },
          ]}
        />
      } tabBarPadding>
      {welcome}
      {isTablet ? (
        // Side by side, both cards stretch to the taller one's height.
        <Row style={{ gap: 16, marginTop: 16, alignItems: 'stretch' }}>
          <View style={{ flex: 1 }}>{pinnedCard}</View>
          <View style={{ flex: 1 }}>{goalCard}</View>
        </Row>
      ) : (
        <View style={{ gap: 16, marginTop: 16 }}>
          {pinnedCard}
          {goalCard}
        </View>
      )}

      <PinnedEditor visible={editPinned} onClose={() => setEditPinned(false)} />
      <PickerSheet
        visible={pickGoal}
        onClose={() => setPickGoal(false)}
        title="Current goal"
        selectedKey={goalId}
        items={sortedGroups(data).flatMap(({ group, categories }) =>
          categories
            .filter((c) => !c.linkedAccountId)
            .map((c) => ({
              key: c.id,
              title: c.name,
              section: group.name,
              subtitle: categoryMonth(mb, c.id).target?.label ?? 'No target yet: you’ll set one next',
              left: <IconBadge name={c.name} size={32} />,
            })),
        )}
        onSelect={(k) => {
          updateSettings({ currentGoalId: k });
          setPickGoal(false);
          // A goal needs a target to track; go straight to creating one.
          if (!data.categories.find((c) => c.id === k)?.target) setTimeout(() => router.push({ pathname: '/target/[id]', params: { id: k } }), 300);
        }}
      />
    </Screen>
  );
}

function SectionHeader({ title, open, onToggle, action, onAction }: { title: string; open: boolean; onToggle: () => void; action: string; onAction: () => void }) {
  const { colors } = useTheme();
  return (
    <Row style={{ paddingVertical: 8, gap: 8 }}>
      <Tap onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.textSoft} />
        <Txt variant="h3">{title}</Txt>
      </Tap>
      <Button title={action} small variant="soft" onPress={onAction} />
    </Row>
  );
}

function PinnedEditor({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const data = useActiveBudget();
  const updateSettings = useStore((s) => s.updateSettings);
  const { colors } = useTheme();
  const pinned = data.settings.pinnedCategoryIds ?? [];
  const toggle = (id: string) => updateSettings({ pinnedCategoryIds: pinned.includes(id) ? pinned.filter((p) => p !== id) : [...pinned, id] });
  return (
    <Sheet visible={visible} onClose={onClose} title="Pinned categories">
      {sortedGroups(data).map(({ group, categories }) => (
        <View key={group.id}>
          <Txt variant="overline" tone="muted" style={{ marginTop: 14, marginBottom: 4 }}>
            {group.name}
          </Txt>
          {categories.map((c) => {
            const on = pinned.includes(c.id);
            return (
              <Tap key={c.id} onPress={() => toggle(c.id)} accessibilityRole="checkbox" accessibilityLabel={`Pin ${c.name}`} accessibilityState={{ checked: on }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
                <IconBadge name={c.name} icon={c.linkedAccountId ? 'card' : undefined} size={32} />
                <Txt variant="body" style={{ flex: 1 }}>
                  {c.name}
                </Txt>
                <Ionicons name={on ? 'pin' : 'pin-outline'} size={20} color={on ? colors.accent : colors.muted} />
              </Tap>
            );
          })}
        </View>
      ))}
      <Button title="Done" variant="soft" small onPress={onClose} style={{ marginTop: 14 }} />
    </Sheet>
  );
}


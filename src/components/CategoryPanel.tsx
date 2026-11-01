import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { goBack } from '@/utils/nav';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { availableTone, categoryMonth, getMonth } from '@/engine/budget';
import { useBalances, useBudgetResult, useLookups } from '@/hooks/useBudget';
import { useActiveBudget, useStore } from '@/store/store';
import { RADIUS, useTheme } from '@/theme';
import { addMonths, monthLabel, monthOf, ordinal, shortDate, WEEKDAYS } from '@/utils/date';
import { formatMoney, formatNumber, getActiveCurrency, milliToInput, parseMoney } from '@/utils/money';
import { filterAmountTyping, LIMITS, validateAmount, validateName } from '@/utils/validation';
import { Screen } from './Screen';
import { ActionSheet, PickerSheet, Sheet } from './Sheet';
import { TransactionRow } from './TransactionRow';
import { Button, Card, Chip, confirm, Divider, haptic, IconBadge, IconButton, notify, ProgressBar, Row, TextField, Txt, useToneColors } from './ui';

export function CategoryPanel({ id, month, modal, onClose }: { id: string; month: string; modal?: boolean; onClose?: () => void }) {
  const data = useActiveBudget();
  const result = useBudgetResult();
  const balances = useBalances();
  const { groups } = useLookups();
  const { colors } = useTheme();
  const { setAssigned, updateCategory, deleteCategory, toggleSnooze, setTarget } = useStore.getState();
  const category = data.categories.find((c) => c.id === id);
  const mb = getMonth(result, month);
  const cm = categoryMonth(mb, id);
  const prev = categoryMonth(getMonth(result, addMonths(month, -1)), id);
  const tone = availableTone(cm);
  const toneColors = useToneColors(tone);

  // Draft text while editing; otherwise the field shows the stored value.
  const [assignedDraft, setAssignedDraft] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [rename, setRename] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [replacePicker, setReplacePicker] = useState(false);
  const [groupPicker, setGroupPicker] = useState(false);


  const txs = useMemo(
    () =>
      data.transactions
        .filter((t) => monthOf(t.date) === month && (t.categoryId === id || t.subtransactions?.some((s) => s.categoryId === id)))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [data.transactions, id, month],
  );

  if (!category) return null;
  const card = category.linkedAccountId ? data.accounts.find((a) => a.id === category.linkedAccountId) : undefined;
  const cardOwed = card ? Math.max(0, -(balances[card.id]?.working ?? 0)) : 0;

  const assignedText = assignedDraft ?? (cm.assigned ? (cm.assigned < 0 ? '-' : '') + milliToInput(cm.assigned) : '');
  const close = () => (onClose ? onClose() : goBack());
  const commitAssigned = () => {
    if (assignedDraft === null) return;
    const v = parseMoney(assignedDraft);
    setAssignedDraft(null);
    const amountError = validateAmount(v, { allowZero: true, allowNegative: true, label: 'Assigned' });
    if (amountError || v === null) {
      notify('Invalid amount', amountError ?? 'Enter an amount.');
      return;
    }
    if (v !== cm.assigned) {
      haptic();
      setAssigned(month, id, v);
    }
  };
  const quick = (label: string, value: number) => ({ label, value });
  const quickOptions = [
    cm.target && cm.target.underfunded > 0 ? quick(`Underfunded ${formatMoney(cm.target.underfunded)}`, cm.assigned + cm.target.underfunded) : null,
    prev.assigned ? quick(`Last month ${formatMoney(prev.assigned)}`, prev.assigned) : null,
    prev.activity < 0 ? quick(`Spent last month ${formatMoney(-prev.activity)}`, -prev.activity) : null,
    card && cardOwed > cm.available ? quick(`Pay full balance`, cm.assigned + (cardOwed - cm.available)) : null,
    cm.available !== 0 ? quick(cm.available > 0 ? 'Reset available' : 'Cover overspending', cm.assigned - cm.available) : null,
  ].filter(Boolean) as { label: string; value: number }[];

  const remove = async () => {
    const used = data.transactions.some((t) => t.categoryId === id || t.subtransactions?.some((s) => s.categoryId === id));
    if (used || Object.values(data.assigned).some((r) => r[id])) {
      setReplacePicker(true);
      return;
    }
    if (await confirm('Delete category', `Delete “${category.name}”?`, 'Delete', true)) {
      deleteCategory(id);
      close();
    }
  };

  const breakdown: [string, number][] = [
    [`Left over from ${monthLabel(addMonths(month, -1)).split(' ')[0]}`, cm.carryover],
    ['Assigned this month', cm.assigned],
    [card ? 'Payments & funded spending' : 'Activity', cm.activity],
  ];

  return (
    <Screen
      back={modal ? 'close' : onClose ? 'close' : undefined}
      onBack={onClose}
      modal={modal}
      header={
        <Row style={{ gap: 12 }}>
          <IconBadge name={category.name} icon={card ? 'card' : undefined} size={44} />
          <View style={{ flex: 1 }}>
            <Txt variant="h2" numberOfLines={1}>
              {category.name}
            </Txt>
            <Txt variant="caption" tone="muted" numberOfLines={1}>
              {groups.get(category.groupId)?.name} · {monthLabel(month)}
            </Txt>
          </View>
        </Row>
      }
      right={!card ? <IconButton icon="ellipsis-horizontal" label="Category options" onPress={() => setMenu(true)} /> : undefined}
    >
      {/* Available */}
      <Card style={{ alignItems: 'center', paddingVertical: 22 }}>
        <Txt variant="label" tone="muted">
          Available
        </Txt>
        <Txt variant="display" style={{ color: toneColors.fg, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>
          {formatMoney(cm.available)}
        </Txt>
        <View style={{ backgroundColor: toneColors.bg, borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 6, marginTop: 10, maxWidth: '100%' }}>
          <Txt variant="label" center numberOfLines={1} style={{ color: toneColors.fg }}>
            {tone === 'overspent'
              ? 'Overspent · cover it from another category'
              : tone === 'creditOverspent'
                ? 'Card overspending · becomes debt'
                : tone === 'underfunded'
                  ? 'Underfunded'
                  : tone === 'positive'
                    ? 'Funded'
                    : 'Nothing available'}
          </Txt>
        </View>
        {card && (
          <Txt variant="caption" tone="soft" center style={{ marginTop: 10 }}>
            Card balance {formatMoney(-cardOwed)} ·{' '}
            {cm.available >= cardOwed ? 'enough set aside to pay it off' : `${formatMoney(cardOwed - cm.available)} not yet covered`}
          </Txt>
        )}
      </Card>

      {/* Assign */}
      <Txt variant="h3" style={{ marginTop: 22, marginBottom: 10 }}>
        Assigned in {monthLabel(month).split(' ')[0]}
      </Txt>
      <TextField
        icon="layers-outline"
        value={assignedText}
        onChangeText={setAssignedDraft}
        filter={(t) => filterAmountTyping(t, getActiveCurrency(), { allowNegative: true })}
        calculator={{ allowNegative: true }}
        maxLength={LIMITS.amountChars}
        onBlur={() => commitAssigned()}
        onSubmitEditing={() => commitAssigned()}
        keyboardType="numbers-and-punctuation"
        returnKeyType="done"
        placeholder={formatNumber(0)}
        selectTextOnFocus
        accessibilityLabel="Assigned amount"
      />
      {quickOptions.length > 0 && (
        <Row style={{ flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {quickOptions.map((q) => (
            <Chip
              key={q.label}
              label={q.label}
              icon="flash-outline"
              onPress={() => {
                haptic('success');
                setAssigned(month, id, q.value);
              }}
            />
          ))}
        </Row>
      )}

      <Card style={{ marginTop: 16, gap: 12 }}>
        {breakdown.map(([l, v]) => (
          <Row key={l} style={{ justifyContent: 'space-between' }}>
            <Txt tone="soft">{l}</Txt>
            <Txt variant="strong" style={{ fontVariant: ['tabular-nums'] }}>
              {formatMoney(v)}
            </Txt>
          </Row>
        ))}
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="strong">Available</Txt>
          <Txt variant="strong" style={{ color: toneColors.fg }}>
            {formatMoney(cm.available)}
          </Txt>
        </Row>
      </Card>

      <Row style={{ gap: 10, marginTop: 14 }}>
        {cm.available < 0 ? (
          <Button
            title="Cover overspending"
            icon="medkit-outline"
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/move-money', params: { month, to: id, amount: String(-cm.available) } })}
          />
        ) : (
          <Button title="Move money" variant="soft" icon="swap-horizontal" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/move-money', params: { month, from: id } })} />
        )}
        {cm.available >= 0 && (
          <Button title="Add funds" variant="soft" icon="add-circle-outline" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/move-money', params: { month, to: id } })} />
        )}
      </Row>

      {/* Target */}
      {!card && (
        <>
          <Txt variant="h3" style={{ marginTop: 26, marginBottom: 10 }}>
            Target
          </Txt>
          {cm.target && category.target ? (
            <Card style={{ gap: 10 }}>
              <Row style={{ justifyContent: 'space-between', gap: 8 }}>
                <Txt variant="strong" style={{ flex: 1 }}>
                  {targetSummary(category.target)}
                </Txt>
                {cm.target.snoozed && (
                  <View style={{ backgroundColor: colors.sunken, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
                    <Txt variant="caption" tone="muted">
                      Snoozed this month
                    </Txt>
                  </View>
                )}
              </Row>
              <ProgressBar progress={cm.target.progress} color={cm.target.funded ? colors.positive : undefined} height={8} />
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt variant="caption" tone={cm.target.snoozed ? 'muted' : cm.target.funded ? 'positive' : 'warning'}>
                  {cm.target.label}
                </Txt>
                <Txt variant="caption" tone="muted">
                  {Math.round(cm.target.progress * 100)}%
                </Txt>
              </Row>
              {cm.target.neededThisMonth > 0 && !cm.target.snoozed && (
                <Txt variant="caption" tone="muted">
                  Needed this month: {formatMoney(cm.target.neededThisMonth)}
                </Txt>
              )}
              <Row style={{ gap: 8, marginTop: 4 }}>
                <Button title="Edit" small variant="soft" icon="create-outline" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/target/[id]', params: { id } })} />
                <Button
                  title={cm.target.snoozed ? 'Unsnooze' : 'Snooze'}
                  small
                  variant="outline"
                  icon={cm.target.snoozed ? 'alarm-outline' : 'moon-outline'}
                  style={{ flex: 1 }}
                  onPress={() => {
                    haptic();
                    toggleSnooze(id, month);
                  }}
                />
                <Button
                  title="Delete"
                  small
                  variant="danger"
                  icon="trash-outline"
                  style={{ flex: 1 }}
                  onPress={async () => {
                    if (await confirm('Delete target', `Remove the target for “${category.name}”? Money already assigned stays where it is.`, 'Delete', true)) setTarget(id, undefined);
                  }}
                />
              </Row>
              <Txt variant="caption" tone="muted">
                Snoozing skips this target for {monthLabel(month).split(' ')[0]} only. It doesn’t count as underfunded.
              </Txt>
            </Card>
          ) : (
            <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 20 }}>
              <Ionicons name="flag-outline" size={24} color={colors.accent} />
              <Txt tone="soft" center>
                How much do you need for {category.name}?
              </Txt>
              <Button title="Create target" small variant="soft" onPress={() => router.push({ pathname: '/target/[id]', params: { id } })} />
            </Card>
          )}
        </>
      )}

      {/* Notes */}
      <Txt variant="h3" style={{ marginTop: 26, marginBottom: 10 }}>
        Notes
      </Txt>
      <TextField
        icon="document-text-outline"
        value={noteDraft ?? category.note ?? ''}
        onChangeText={setNoteDraft}
        maxLength={LIMITS.note}
        onBlur={() => {
          if (noteDraft !== null && noteDraft !== (category.note ?? '')) updateCategory(id, { note: noteDraft });
          setNoteDraft(null);
        }}
        placeholder="Add a note"
        multiline
      />

      {/* Activity */}
      <Txt variant="h3" style={{ marginTop: 26, marginBottom: 10 }}>
        Activity this month
      </Txt>
      {txs.length === 0 ? (
        <Txt tone="muted">No transactions in {monthLabel(month)}.</Txt>
      ) : (
        <View style={{ gap: 10 }}>
          {txs.slice(0, 30).map((t) => (
            <TransactionRow key={t.id} tx={t} showAccount onPress={() => router.push({ pathname: '/transaction', params: { id: t.id } })} />
          ))}
        </View>
      )}

      <ActionSheet
        visible={menu}
        onClose={() => setMenu(false)}
        title={category.name}
        actions={[
          { label: 'Rename', icon: 'pencil', onPress: () => {
            setRenameError(null);
            setRename(category.name);
          } },
          { label: 'Move to group', icon: 'folder-open-outline', onPress: () => setGroupPicker(true) },
          { label: category.hidden ? 'Unhide' : 'Hide', icon: category.hidden ? 'eye-outline' : 'eye-off-outline', onPress: () => updateCategory(id, { hidden: !category.hidden }) },
          { label: 'Delete', icon: 'trash-outline', destructive: true, onPress: remove },
        ]}
      />
      <Sheet visible={rename !== null} onClose={() => setRename(null)} title="Rename category">
        <TextField value={rename ?? ''} onChangeText={setRename} maxLength={LIMITS.categoryName} error={renameError} autoFocus placeholder="Category name" />
        <Button
          title="Save"
          style={{ marginTop: 14 }}
          disabled={!rename?.trim()}
          onPress={() => {
            const error = validateName(rename ?? '', {
              label: 'Category',
              max: LIMITS.categoryName,
              existing: data.categories.filter((c) => c.groupId === category.groupId).map((c) => c.name),
              current: category.name,
            });
            setRenameError(error);
            if (error) return;
            updateCategory(id, { name: rename! });
            setRename(null);
          }}
        />
      </Sheet>
      <PickerSheet
        visible={groupPicker}
        onClose={() => setGroupPicker(false)}
        title="Move to group"
        searchable={false}
        selectedKey={category.groupId}
        items={data.groups.filter((g) => !g.isCreditCardPayments).map((g) => ({ key: g.id, title: g.name }))}
        onSelect={(gid) => {
          updateCategory(id, { groupId: gid });
          setGroupPicker(false);
        }}
      />
      <PickerSheet
        visible={replacePicker}
        onClose={() => setReplacePicker(false)}
        title="Move its history to…"
        items={data.categories
          .filter((c) => c.id !== id && !c.linkedAccountId)
          .map((c) => ({ key: c.id, title: c.name, section: groups.get(c.groupId)?.name }))}
        onSelect={async (rid) => {
          setReplacePicker(false);
          const target = data.categories.find((c) => c.id === rid)?.name;
          if (await confirm('Delete category', `Transactions and assigned money in “${category.name}” will move to “${target}”.`, 'Delete', true)) {
            deleteCategory(id, rid);
            close();
          }
        }}
      />
    </Screen>
  );
}

export function targetSummary(t: NonNullable<import('@/store/types').Category['target']>): string {
  const a = formatMoney(t.amount);
  if (t.kind === 'savings') return `Save ${a} each month`;
  if (t.kind === 'balance') return t.dueDate ? `Have ${a} by ${monthLabel(monthOf(t.dueDate))}` : `Have a balance of ${a}`;
  const verb = t.behavior === 'refill' ? 'Refill up to' : t.behavior === 'balance' ? 'Have a balance of' : 'Set aside';
  switch (t.cadence) {
    case 'weekly':
      return `${verb} ${a} every ${WEEKDAYS[t.weekday ?? 6]}`;
    case 'yearly':
      return `${verb} ${a} by ${t.dueDate ? shortDate(t.dueDate) : 'date'} each year`;
    case 'custom': {
      const m = t.repeatMonths ?? 0;
      const repeat = m ? `, every ${m % 12 === 0 ? `${m / 12} year${m > 12 ? 's' : ''}` : `${m} month${m > 1 ? 's' : ''}`}` : '';
      return `${verb} ${a} by ${t.dueDate ? shortDate(t.dueDate) : 'date'}${repeat}`;
    }
    default:
      return `${verb} ${a} each month${t.dayOfMonth ? ` by the ${ordinal(t.dayOfMonth)}` : ''}`;
  }
}

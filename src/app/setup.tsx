import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { targetSummary } from '@/components/CategoryPanel';
import { Screen } from '@/components/Screen';
import { Button, Card, Divider, GradientCard, haptic, IconBadge, IconButton, Row, Tap, TextField, Txt } from '@/components/ui';
import { categoryMonth, targetMonthly } from '@/engine/budget';
import { sortedGroups, useBalances, useMonthBudget } from '@/hooks/useBudget';
import { useAccountGate } from '@/cloud/gate';
import { useActiveBudget, useStore } from '@/store/store';
import type { AccountType, Category, Target } from '@/store/types';
import { FONT, RADIUS, useLayout, useTheme } from '@/theme';
import { currentMonth, today } from '@/utils/date';
import { ACCOUNT_GRADIENTS, ACCOUNT_TYPE_INFO } from '@/utils/icons';
import { noWebOutline } from '@/utils/layout';
import { formatMoney, formatNumber, getActiveCurrency, milliToInput, parseMoney } from '@/utils/money';
import { cleanTyping, filterAmountTyping, LIMITS, validateAmount, validateName } from '@/utils/validation';

type Step = 'categories' | 'targets' | 'accounts' | 'fund' | 'done';
const STEPS: Step[] = ['categories', 'targets', 'accounts', 'fund', 'done'];
/** Onboarding already used steps 1 (name) and 2 (formats). */
const STEP_OFFSET = 3;
const TOTAL_STEPS = 6;

/**
 * Guided first-run setup after a budget is created: personalise the plan (categories, then targets),
 * add accounts, then fund the categories. Everything is saved as you go, so leaving early still works.
 */
export default function SetupScreen() {
  const [step, setStep] = useState<Step>('categories');
  const gate = useAccountGate();
  const n = STEP_OFFSET + STEPS.indexOf(step);
  const go = (s: Step) => {
    haptic();
    setStep(s);
  };

  if (gate) return gate;
  if (step === 'categories') return <CategoriesStep onNext={() => go('targets')} />;
  if (step === 'targets') return <TargetsStep onBack={() => go('categories')} onNext={() => go('accounts')} stepNumber={n} />;
  if (step === 'accounts') return <AccountsStep onBack={() => go('targets')} onNext={() => go('fund')} stepNumber={n} />;
  if (step === 'fund') return <FundStep onBack={() => go('accounts')} onNext={() => go('done')} stepNumber={n} />;
  return <DoneStep />;
}

function Progress({ step }: { step: number }) {
  const { colors } = useTheme();
  return (
    <Row style={{ gap: 6, marginBottom: 18 }} accessibilityLabel={`Step ${step} of ${TOTAL_STEPS}`}>
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i < step ? colors.accent : colors.sunken }} />
      ))}
    </Row>
  );
}

function SkipButton({ onPress }: { onPress: () => void }) {
  return <Button title="Skip" small variant="ghost" onPress={onPress} />;
}

const isPlainMonthly = (t?: Target) => !!t && t.kind === 'needed' && (t.cadence ?? 'monthly') === 'monthly' && (t.behavior ?? 'setAside') === 'setAside';

// ---------- Step 3: categories ----------

/** A name that turns into a text box when tapped. */
function EditableName({
  value,
  onSave,
  existing,
  label,
  max,
  variant = 'body',
  dim,
}: {
  value: string;
  onSave: (name: string) => void;
  existing: string[];
  label: string;
  max: number;
  variant?: 'body' | 'h3';
  dim?: boolean;
}) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    const t = text.trim();
    if (!t || t === value) {
      setEditing(false);
      setError(null);
      return;
    }
    const err = validateName(t, { label, max, existing: existing.filter((n) => n !== value) });
    if (err) return setError(err);
    onSave(t);
    setEditing(false);
    setError(null);
  };

  if (!editing) {
    return (
      <Tap
        onPress={() => {
          setText(value);
          setEditing(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Rename ${value}`}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}
      >
        <Txt variant={variant} numberOfLines={1} style={{ flexShrink: 1, opacity: dim ? 0.5 : 1, textDecorationLine: dim ? 'line-through' : 'none' }}>
          {value}
        </Txt>
        <Ionicons name="pencil" size={12} color={colors.muted} />
      </Tap>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <TextInput
        value={text}
        onChangeText={(t) => setText(cleanTyping(t, max))}
        autoFocus
        selectTextOnFocus
        onBlur={commit}
        onSubmitEditing={commit}
        returnKeyType="done"
        accessibilityLabel={`New name for ${value}`}
        style={[
          { fontFamily: variant === 'h3' ? FONT.bold : FONT.medium, fontSize: variant === 'h3' ? 17 : 15, color: colors.text, paddingVertical: 4, borderBottomWidth: 1.5, borderBottomColor: colors.accent },
          noWebOutline,
        ]}
      />
      {!!error && (
        <Txt variant="caption" tone="danger" style={{ marginTop: 4 }}>
          {error}
        </Txt>
      )}
    </View>
  );
}

/** "+ Add …" row that opens an inline text box and stays open for adding several in a row. */
function InlineAdd({ label, placeholder, onAdd }: { label: string; placeholder: string; onAdd: (name: string) => string | null }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!text.trim()) return setOpen(false);
    const err = onAdd(text.trim());
    if (err) return setError(err);
    haptic('success');
    setText('');
    setError(null);
  };

  if (!open) {
    return (
      <Tap onPress={() => setOpen(true)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 }}>
        <Ionicons name="add-circle" size={24} color={colors.accent} />
        <Txt variant="strong" tone="accent">
          {label}
        </Txt>
      </Tap>
    );
  }
  return (
    <View style={{ paddingVertical: 8 }}>
      <Row style={{ gap: 12 }}>
        <Ionicons name="add-circle-outline" size={24} color={colors.muted} />
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(cleanTyping(t, LIMITS.categoryName));
            setError(null);
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          autoFocus
          onSubmitEditing={submit}
          submitBehavior="submit"
          returnKeyType="done"
          accessibilityLabel={label}
          style={[{ flex: 1, minWidth: 0, fontFamily: FONT.medium, fontSize: 15, color: colors.text, paddingVertical: 6 }, noWebOutline]}
        />
        <Button title="Add" small variant="soft" disabled={!text.trim()} onPress={submit} />
      </Row>
      {!!error && (
        <Txt variant="caption" tone="danger" style={{ marginTop: 4, marginLeft: 36 }}>
          {error}
        </Txt>
      )}
    </View>
  );
}

function CategoriesStep({ onNext }: { onNext: () => void }) {
  const data = useActiveBudget();
  const { addCategory, addGroup, renameGroup, updateCategory, deleteCategory, deleteGroup } = useStore.getState();
  const { colors } = useTheme();
  const groups = sortedGroups(data).filter((g) => !g.group.isCreditCardPayments);
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    haptic();
    const next = new Set(removed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setRemoved(next);
  };

  const finish = () => {
    for (const id of removed) deleteCategory(id);
    // Drop groups that ended up empty.
    const remaining = useStore.getState().budgets[data.id]?.categories ?? [];
    for (const g of data.groups) if (!g.isCreditCardPayments && !remaining.some((c) => c.groupId === g.id)) deleteGroup(g.id);
    onNext();
  };

  const kept = data.categories.filter((c) => !c.linkedAccountId && !removed.has(c.id)).length;
  const groupNames = groups.map((g) => g.group.name);

  return (
    <Screen
      title="Your categories"
      subtitle={`Step ${STEP_OFFSET} of ${TOTAL_STEPS} · personalise your plan`}
      right={<SkipButton onPress={onNext} />}
      maxWidth={620}
      footer={<Button title="Next: set targets" onPress={finish} disabled={kept === 0} />}
    >
      <Progress step={STEP_OFFSET} />
      <Txt tone="soft" style={{ marginBottom: 18 }}>
        Untick what you don’t need. Tap any name to rename it, or add your own.
      </Txt>

      {groups.map(({ group, categories }) => (
        <View key={group.id} style={{ marginBottom: 18 }}>
          <Row style={{ marginBottom: 8, marginLeft: 4 }}>
            <EditableName value={group.name} variant="h3" label="Group" max={LIMITS.groupName} existing={groupNames} onSave={(n) => renameGroup(group.id, n)} />
          </Row>
          <Card padded={false} style={{ paddingHorizontal: 14 }}>
            {categories.map((c) => {
              const on = !removed.has(c.id);
              return (
                <View key={c.id}>
                  <Row style={{ gap: 12, paddingVertical: 13 }}>
                    <Tap onPress={() => toggle(c.id)} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={c.name}>
                      <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? colors.accent : colors.muted} />
                    </Tap>
                    <EditableName
                      value={c.name}
                      dim={!on}
                      label="Category"
                      max={LIMITS.categoryName}
                      existing={categories.map((x) => x.name)}
                      onSave={(n) => updateCategory(c.id, { name: n })}
                    />
                  </Row>
                  <Divider inset={36} />
                </View>
              );
            })}
            <InlineAdd
              label="Add category"
              placeholder="e.g. Bubble tea"
              onAdd={(name) => {
                const err = validateName(name, { label: 'Category', max: LIMITS.categoryName, existing: categories.map((c) => c.name) });
                if (!err) addCategory(group.id, name);
                return err;
              }}
            />
          </Card>
        </View>
      ))}

      <Card padded={false} style={{ paddingHorizontal: 14 }}>
        <InlineAdd
          label="Add a group"
          placeholder="e.g. Family"
          onAdd={(name) => {
            const err = validateName(name, { label: 'Group', max: LIMITS.groupName, existing: groupNames });
            if (!err) addGroup(name);
            return err;
          }}
        />
      </Card>
    </Screen>
  );
}

// ---------- Step 4: targets ----------

function TargetsStep({ onBack, onNext, stepNumber }: { onBack: () => void; onNext: () => void; stepNumber: number }) {
  const data = useActiveBudget();
  const setTarget = useStore((s) => s.setTarget);
  const { colors } = useTheme();
  const c = getActiveCurrency();
  const groups = useMemo(() => sortedGroups(data).filter((g) => !g.group.isCreditCardPayments && g.categories.length > 0), [data]);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const cat of data.categories) if (cat.target && isPlainMonthly(cat.target)) init[cat.id] = milliToInput(cat.target.amount);
    return init;
  });

  const custom = (cat: Category) => !!cat.target && !isPlainMonthly(cat.target);
  const amountFor = (cat: Category) => (custom(cat) ? targetMonthly(cat.target!, currentMonth()).thisMonth : (parseMoney(drafts[cat.id] ?? '') ?? 0));
  const total = groups.flatMap((g) => g.categories).reduce((s, cat) => s + amountFor(cat), 0);

  const save = () => {
    for (const [id, v] of Object.entries(drafts)) {
      const cat = data.categories.find((x) => x.id === id);
      if (!cat || custom(cat)) continue;
      const amount = parseMoney(v) ?? 0;
      if (amount > 0) setTarget(id, { kind: 'needed', amount, cadence: 'monthly', behavior: 'setAside', createdMonth: cat.target?.createdMonth ?? currentMonth() });
      else if (cat.target) setTarget(id, undefined);
    }
    onNext();
  };

  return (
    <Screen
      back="back"
      onBack={onBack}
      title="Set targets"
      subtitle={`Step ${stepNumber} of ${TOTAL_STEPS} · personalise your plan`}
      right={<SkipButton onPress={onNext} />}
      maxWidth={620}
      footer={<Button title="Next: add accounts" onPress={save} />}
    >
      <Progress step={stepNumber} />
      <GradientCard>
        <Txt variant="caption" tone="inverse" style={{ opacity: 0.9 }}>
          Your plan needs about
        </Txt>
        <Row style={{ alignItems: 'baseline', gap: 6 }}>
          <Txt variant="title" tone="inverse">
            {formatMoney(total)}
          </Txt>
          <Txt tone="inverse" style={{ opacity: 0.9 }}>
            a month
          </Txt>
        </Row>
      </GradientCard>
      <Txt tone="soft" style={{ marginTop: 14 }}>
        How much does each category need a month? Leave it blank if it varies. Use <Ionicons name="options-outline" size={14} color={colors.textSoft} /> for weekly, yearly or
        by-date targets.
      </Txt>

      {groups.map(({ group, categories }) => (
        <View key={group.id} style={{ marginTop: 18 }}>
          <Txt variant="overline" tone="muted" style={{ marginBottom: 8 }}>
            {group.name}
          </Txt>
          <Card padded={false} style={{ paddingHorizontal: 14 }}>
            {categories.map((cat, i) => (
              <View key={cat.id}>
                {i > 0 && <Divider />}
                <Row style={{ gap: 8, paddingVertical: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="body" numberOfLines={1}>
                      {cat.name}
                    </Txt>
                    {custom(cat) && (
                      <Txt variant="caption" tone="accent" numberOfLines={1}>
                        {targetSummary(cat.target!)}
                      </Txt>
                    )}
                  </View>
                  {custom(cat) && (
                    <Txt variant="strong" style={{ minWidth: 90, textAlign: 'right' }}>
                      {formatMoney(amountFor(cat))}
                      <Txt variant="caption" tone="muted">
                        /mo
                      </Txt>
                    </Txt>
                  )}
                  {!custom(cat) && (
                    <AmountInput
                      value={drafts[cat.id] ?? ''}
                      onChange={(t) => setDrafts((d) => ({ ...d, [cat.id]: filterAmountTyping(t, c) }))}
                      label={`Monthly target for ${cat.name}`}
                      suffix="/mo"
                    />
                  )}
                  <IconButton icon="options-outline" label={`More target options for ${cat.name}`} tone="plain" size={34} onPress={() => router.push({ pathname: '/target/[id]', params: { id: cat.id } })} />
                </Row>
              </View>
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

function AmountInput({ value, onChange, label, suffix }: { value: string; onChange: (t: string) => void; label: string; suffix?: string }) {
  const { colors } = useTheme();
  return (
    <Row style={{ width: suffix ? 132 : 120, height: 40, borderRadius: RADIUS.sm, backgroundColor: colors.surfaceAlt, paddingHorizontal: 10, gap: 4 }}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={formatNumber(0)}
        placeholderTextColor={colors.muted}
        keyboardType="number-pad"
        maxLength={LIMITS.amountChars}
        accessibilityLabel={label}
        style={[{ flex: 1, minWidth: 0, height: 40, textAlign: 'right', fontFamily: FONT.semibold, fontSize: 15, color: colors.text }, noWebOutline]}
      />
      {!!suffix && (
        <Txt variant="caption" tone="muted">
          {suffix}
        </Txt>
      )}
    </Row>
  );
}

// ---------- Step 5: accounts ----------

const QUICK_TYPES: { type: AccountType; label: string }[] = [
  { type: 'checking', label: 'Checking' },
  { type: 'savings', label: 'Savings' },
  { type: 'cash', label: 'Cash' },
  { type: 'creditCard', label: 'Credit card' },
  { type: 'asset', label: 'Investment' },
  { type: 'loan', label: 'Loan' },
];

function AccountsStep({ onBack, onNext, stepNumber }: { onBack: () => void; onNext: () => void; stepNumber: number }) {
  const data = useActiveBudget();
  const balances = useBalances();
  const mb = useMonthBudget(currentMonth());
  const { addAccount, deleteAccount } = useStore.getState();
  const c = getActiveCurrency();
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [balance, setBalance] = useState('');
  const [errors, setErrors] = useState<{ name?: string | null; balance?: string | null }>({});
  const info = ACCOUNT_TYPE_INFO[type];
  const accounts = data.accounts.filter((a) => !a.closed);

  const add = () => {
    const nameError = validateName(name, { label: 'Account name', max: LIMITS.accountName, existing: data.accounts.map((a) => a.name) });
    const v = parseMoney(balance);
    const balanceError = validateAmount(v, { label: 'Balance', allowZero: true, allowNegative: !info.debt });
    setErrors({ name: nameError, balance: balanceError });
    if (nameError || balanceError) return;
    const id = addAccount({ name, type, balance: info.debt ? -Math.abs(v!) : v!, date: today() });
    if (!id) return;
    haptic('success');
    setName('');
    setBalance('');
  };

  return (
    <Screen
      back="back"
      onBack={onBack}
      title="Add your accounts"
      subtitle={`Step ${stepNumber} of ${TOTAL_STEPS} · what you have today`}
      right={<SkipButton onPress={onNext} />}
      maxWidth={620}
      footer={<Button title={accounts.length ? 'Next: fund your plan' : 'Skip for now'} variant={accounts.length ? 'gradient' : 'outline'} onPress={onNext} />}
    >
      <Progress step={stepNumber} />
      <GradientCard>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
          <View>
            <Txt variant="caption" tone="inverse" style={{ opacity: 0.9 }}>
              Money to assign
            </Txt>
            <Txt variant="title" tone="inverse">
              {formatMoney(mb.readyToAssign)}
            </Txt>
          </View>
          {mb.underfunded > 0 && (
            <Txt variant="caption" tone="inverse" style={{ opacity: 0.9 }}>
              Targets need {formatMoney(mb.underfunded)}
            </Txt>
          )}
        </Row>
      </GradientCard>

      {accounts.length > 0 && (
        <Card padded={false} style={{ paddingHorizontal: 14, marginTop: 16 }}>
          {accounts.map((a, i) => (
            <View key={a.id}>
              {i > 0 && <Divider inset={54} />}
              <Row style={{ gap: 12, paddingVertical: 12 }}>
                <IconBadge name={a.name} icon={ACCOUNT_TYPE_INFO[a.type].icon} colors={ACCOUNT_GRADIENTS[a.type]} size={40} />
                <View style={{ flex: 1 }}>
                  <Txt variant="strong" numberOfLines={1}>
                    {a.name}
                  </Txt>
                  <Txt variant="caption" tone="muted">
                    {ACCOUNT_TYPE_INFO[a.type].label}
                  </Txt>
                </View>
                <Txt variant="strong" tone={(balances[a.id]?.working ?? 0) < 0 ? 'danger' : 'default'}>
                  {formatMoney(balances[a.id]?.working ?? 0)}
                </Txt>
                <IconButton icon="close" label={`Remove ${a.name}`} tone="plain" size={30} onPress={() => deleteAccount(a.id)} />
              </Row>
            </View>
          ))}
        </Card>
      )}

      <View style={{ marginTop: 22, gap: 12 }}>
        <Txt variant="h3">{accounts.length ? 'Add another' : 'Add an account'}</Txt>
        <Row style={{ flexWrap: 'wrap', gap: 8 }}>
          {QUICK_TYPES.map((t) => (
            <TypeChip key={t.type} label={t.label} active={t.type === type} onPress={() => setType(t.type)} />
          ))}
        </Row>
        <TextField
          label="Name"
          icon="pencil-outline"
          placeholder={type === 'creditCard' ? 'e.g. Citi Rewards' : type === 'savings' ? 'e.g. OCBC 360' : 'e.g. DBS Everyday'}
          value={name}
          onChangeText={(t) => {
            setName(t);
            setErrors((e) => ({ ...e, name: null }));
          }}
          maxLength={LIMITS.accountName}
          error={errors.name}
        />
        <TextField
          label={info.debt ? 'Amount owed' : 'Balance today'}
          icon="cash-outline"
          placeholder={formatNumber(0)}
          value={balance}
          onChangeText={(t) => {
            setBalance(t);
            setErrors((e) => ({ ...e, balance: null }));
          }}
          filter={(t) => filterAmountTyping(t, c, { allowNegative: !info.debt })}
          calculator={{ allowNegative: !info.debt }}
          keyboardType="number-pad"
          maxLength={LIMITS.amountChars}
          error={errors.balance}
          onSubmitEditing={add}
        />
        <Button title="Add account" variant="soft" icon="add" disabled={!name.trim()} onPress={add} />
      </View>
    </Screen>
  );
}

function TypeChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, backgroundColor: active ? colors.accent : colors.surface }}
    >
      <Txt variant="label" style={{ color: active ? '#FFF' : colors.textSoft }}>
        {label}
      </Txt>
    </Tap>
  );
}

// ---------- Step 6: fund ----------

function FundStep({ onBack, onNext, stepNumber }: { onBack: () => void; onNext: () => void; stepNumber: number }) {
  const data = useActiveBudget();
  const balances = useBalances();
  const month = currentMonth();
  const mb = useMonthBudget(month);
  const applyAssignments = useStore((s) => s.applyAssignments);
  const { isCompact } = useLayout();
  const c = getActiveCurrency();
  const groups = useMemo(() => sortedGroups(data).filter((g) => g.categories.length > 0), [data]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Ready to Assign before this step's (unsaved) choices.
  const available = mb.readyToAssign + Object.keys(drafts).reduce((s, id) => s + categoryMonth(mb, id).assigned, 0);
  const planned = Object.values(drafts).reduce((s, v) => s + (parseMoney(v) ?? 0), 0);
  const left = available - planned;
  const needOf = (id: string) => categoryMonth(mb, id).target?.underfunded ?? 0;
  const ordered = groups.flatMap((g) => g.categories);
  const totalNeeded = ordered.reduce((s, cat) => s + needOf(cat.id), 0);

  /** Fills targets in plan order until the money runs out. */
  const fundTargets = () => {
    let remaining = available;
    const next: Record<string, string> = {};
    for (const cat of ordered) {
      const amt = Math.min(needOf(cat.id), Math.max(remaining, 0));
      if (amt > 0) {
        next[cat.id] = milliToInput(amt);
        remaining -= amt;
      }
    }
    haptic('success');
    setDrafts(next);
    setError(null);
  };

  const save = () => {
    if (left < 0) return setError(`That’s ${formatMoney(-left)} more than you have. Lower a few amounts.`);
    const values: Record<string, number> = {};
    for (const [id, v] of Object.entries(drafts)) values[id] = parseMoney(v) ?? 0;
    applyAssignments(month, values);
    haptic('success');
    onNext();
  };

  return (
    <Screen
      back="back"
      onBack={onBack}
      title="Fund your plan"
      subtitle={`Step ${stepNumber} of ${TOTAL_STEPS} · give every dollar a job`}
      right={<SkipButton onPress={onNext} />}
      maxWidth={620}
      footer={
        <View style={{ gap: 8 }}>
          {!!error && (
            <Txt variant="caption" tone="danger" center>
              {error}
            </Txt>
          )}
          <Button title={planned > 0 ? 'Save my plan' : 'Skip for now'} variant={planned > 0 ? 'gradient' : 'outline'} onPress={planned > 0 ? save : onNext} />
        </View>
      }
    >
      <Progress step={stepNumber} />
      <GradientCard>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
          <View>
            <Txt variant="caption" tone="inverse" style={{ opacity: 0.9 }}>
              {left < 0 ? 'Over-assigned' : 'Left to assign'}
            </Txt>
            <Txt variant="title" tone="inverse">
              {formatMoney(left)}
            </Txt>
          </View>
          {totalNeeded > 0 && (
            <Txt variant="caption" tone="inverse" style={{ opacity: 0.9 }}>
              Targets need {formatMoney(totalNeeded)}
            </Txt>
          )}
        </Row>
        {totalNeeded > 0 && left > 0 && (
          <Tap
            onPress={fundTargets}
            accessibilityRole="button"
            style={{ marginTop: 14, alignSelf: 'flex-start', backgroundColor: '#FFF', borderRadius: RADIUS.pill, paddingHorizontal: 16, paddingVertical: 9, flexDirection: 'row', gap: 6, alignItems: 'center' }}
          >
            <Ionicons name="flash" size={14} color="#8A4BEA" />
            <Txt variant="label" style={{ color: '#8A4BEA' }}>
              {available >= totalNeeded ? 'Fund all targets' : 'Fund targets in order'}
            </Txt>
          </Tap>
        )}
      </GradientCard>
      <Txt tone="soft" style={{ marginTop: 14 }}>
        {available > 0 ? 'Fund what’s due soonest first: bills, then everyday spending, then goals.' : 'No money to assign yet. Add an account, or skip and come back when you’re paid.'}
      </Txt>

      {groups.map(({ group, categories }) => (
        <View key={group.id} style={{ marginTop: 18 }}>
          <Txt variant="overline" tone="muted" style={{ marginBottom: 8 }}>
            {group.name}
          </Txt>
          <Card padded={false} style={{ paddingHorizontal: 14 }}>
            {categories.map((cat, i) => {
              const owed = cat.linkedAccountId ? Math.max(0, -(balances[cat.linkedAccountId]?.working ?? 0)) : 0;
              const need = needOf(cat.id);
              return (
                <View key={cat.id}>
                  {i > 0 && <Divider inset={isCompact ? 0 : 46} />}
                  <Row style={{ gap: 10, paddingVertical: 10 }}>
                    {!isCompact && <IconBadge name={cat.name} icon={cat.linkedAccountId ? 'card' : undefined} size={34} />}
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" numberOfLines={1}>
                        {cat.name}
                      </Txt>
                      {(need > 0 || owed > 0) && (
                        <Txt variant="caption" tone="muted">
                          {need > 0 ? `Needs ${formatMoney(need)}` : `Card balance ${formatMoney(-owed)}`}
                        </Txt>
                      )}
                    </View>
                    <AmountInput
                      value={drafts[cat.id] ?? ''}
                      onChange={(t) => {
                        setDrafts((d) => ({ ...d, [cat.id]: filterAmountTyping(t, c) }));
                        setError(null);
                      }}
                      label={`Amount for ${cat.name}`}
                    />
                  </Row>
                </View>
              );
            })}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

// ---------- Done ----------

function DoneStep() {
  const data = useActiveBudget();
  const mb = useMonthBudget(currentMonth());
  const { colors } = useTheme();
  const tips: [React.ComponentProps<typeof Ionicons>['name'], string, string][] = [
    ['add-circle-outline', 'Log spending', 'Tap “+ Transaction” whenever you spend.'],
    ['layers-outline', 'Check before you spend', 'Plan shows what’s left in each category.'],
    ['swap-horizontal', 'Roll with it', 'Overspent? Move money from another category.'],
  ];

  return (
    <Screen title="You’re all set" maxWidth={620} footer={<Button title="Go to my plan" onPress={() => router.replace('/')} />}>
      <Progress step={TOTAL_STEPS} />
      <GradientCard>
        <Ionicons name="sparkles" size={26} color="#FFF" />
        <Txt variant="h2" tone="inverse" style={{ marginTop: 10 }}>
          {data.name}
        </Txt>
        <Txt tone="inverse" style={{ opacity: 0.9, marginTop: 4 }}>
          {formatMoney(mb.assigned)} assigned this month
          {mb.readyToAssign > 0 ? ` · ${formatMoney(mb.readyToAssign)} left to assign` : ''}
        </Txt>
      </GradientCard>
      <View style={{ gap: 14, marginTop: 20 }}>
        {tips.map(([icon, title, text]) => (
          <Row key={title} style={{ gap: 12 }}>
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={icon} size={18} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="strong">{title}</Txt>
              <Txt variant="caption" tone="muted">
                {text}
              </Txt>
            </View>
          </Row>
        ))}
      </View>
    </Screen>
  );
}

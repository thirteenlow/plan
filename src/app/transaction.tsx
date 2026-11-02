import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/utils/nav';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, TextInput, View } from 'react-native';
import { useCloud } from '@/cloud/cloudStore';
import { readReceipt } from '@/cloud/inbox';
import { matchAccount, matchCategory, payeeCategory, scanHints } from '@/utils/scanMatch';
import { requirePro, useIsPro } from '@/cloud/pro';
import { CalendarSheet } from '@/components/Calendar';
import { useCalculator, useInputRef } from '@/components/Calculator';
import { Screen } from '@/components/Screen';
import { ActionSheet, PickerSheet, type PickerItem, Sheet } from '@/components/Sheet';
import { Button, confirm, FieldRow, haptic, IconBadge, notify, Row, Tap, TextField, Toggle, Txt } from '@/components/ui';
import { categoryMonth, computeBudget, getMonth } from '@/engine/budget';
import { MoneyMove, type MoneyMoveInfo } from '@/components/MoneyMove';
import { FREQUENCIES, frequencyLabel, nextOccurrence } from '@/engine/scheduled';
import { sortedGroups, useBudgetResult } from '@/hooks/useBudget';
import { useActiveBudget, useStore } from '@/store/store';
import { RTA, type ClearedStatus, type FlagColor, type Frequency, type SubTransaction } from '@/store/types';
import { FLAG_COLORS, FONT, RADIUS, useTheme } from '@/theme';
import { addMonthsToDate, friendlyDate, monthOf, today } from '@/utils/date';
import { ACCOUNT_GRADIENTS, ACCOUNT_TYPE_INFO, isCreditType } from '@/utils/icons';
import { uid } from '@/utils/id';
import { deletePhoto, loadPhoto, pickPhoto, savePhoto } from '@/utils/photos';
import { amountWidth, noWebOutline } from '@/utils/layout';
import { filterAmountTyping, LIMITS, sanitizeText, validateAmount } from '@/utils/validation';
import { formatMoney, formatNumber, getActiveCurrency, milliToInput, parseMoney } from '@/utils/money';

interface SplitLine {
  id: string;
  categoryId: string | null;
  amount: string;
  memo: string;
}

/** Picker key for the "Refund" choice on inflows (opens the category list). */
const REFUND = '__refund';

type Picker = { kind: 'payee' } | { kind: 'category'; split?: string } | { kind: 'account' } | { kind: 'from' } | { kind: 'to' } | { kind: 'repeat' } | { kind: 'type' } | { kind: 'photo' } | { kind: 'scan' } | null;

/** What the user is recording. Card payments and transfers are both transfers underneath. */
type TxKind = 'spending' | 'inflow' | 'ccPayment' | 'transfer';
const KIND_INFO: Record<TxKind, { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; title: string }> = {
  spending: { label: 'Spending', icon: 'remove-circle-outline', title: 'Add spending' },
  inflow: { label: 'Inflow', icon: 'add-circle-outline', title: 'Add income' },
  ccPayment: { label: 'Credit Card Payment', icon: 'card-outline', title: 'Pay a credit card' },
  transfer: { label: 'Transfer', icon: 'swap-horizontal', title: 'Add transfer' },
};

export default function TransactionScreen() {
  const params = useLocalSearchParams<{ id?: string; accountId?: string; scheduledId?: string }>();
  const data = useActiveBudget();
  const result = useBudgetResult();
  const [moving, setMoving] = useState<MoneyMoveInfo | null>(null);
  const { colors } = useTheme();
  const store = useStore.getState();

  const existing = params.id ? data.transactions.find((t) => t.id === params.id) : undefined;
  const sched = params.scheduledId ? data.scheduled.find((s) => s.id === params.scheduledId) : undefined;
  const src = existing ?? sched;
  const openAccounts = data.accounts.filter((a) => !a.closed);
  const defaultAccount = params.accountId ?? openAccounts.find((a) => a.onBudget)?.id ?? openAccounts[0]?.id;
  const existingCategory = existing?.transferAccountId && !existing.categoryId ? data.transactions.find((t) => t.id === existing.transferTransactionId)?.categoryId ?? null : src?.categoryId ?? null;

  const c = getActiveCurrency();
  const [direction, setDirection] = useState<'out' | 'in'>(src && src.amount > 0 ? 'in' : 'out');
  const [amount, setAmount] = useState(src ? milliToInput(src.amount) : '');
  const amountRef = useInputRef();
  const calc = useCalculator({ value: amount, onChange: setAmount, inputRef: amountRef });
  const [accountId, setAccountId] = useState<string | undefined>(src?.accountId ?? defaultAccount);
  const [payeeId, setPayeeId] = useState<string | null>(src?.payeeId ?? null);
  const [payeeName, setPayeeName] = useState<string>('');
  const [transferId, setTransferId] = useState<string | undefined>(src?.transferAccountId);
  const [categoryId, setCategoryId] = useState<string | null>(existingCategory);
  const [date, setDate] = useState(existing?.date ?? sched?.nextDate ?? today());
  const [memo, setMemo] = useState(src?.memo ?? '');
  const [cleared, setCleared] = useState<ClearedStatus>(existing?.cleared ?? 'uncleared');
  const [flag, setFlag] = useState<FlagColor | undefined>(src?.flag);
  const [repeat, setRepeat] = useState<Frequency>(sched?.frequency ?? 'once');
  const [splits, setSplits] = useState<SplitLine[] | null>(
    existing?.subtransactions?.length ? existing.subtransactions.map((s) => ({ id: s.id, categoryId: s.categoryId, amount: milliToInput(s.amount), memo: s.memo ?? '' })) : null,
  );
  const [picker, setPicker] = useState<Picker>(null);
  /** Receipt photo: `saved` is what's stored now; `pending` is a new pick (string) or a removal (null). */
  const [photo, setPhoto] = useState<{ saved: string | null; pending?: string | null }>({ saved: null });
  const [viewPhoto, setViewPhoto] = useState(false);
  const shownPhoto = photo.pending !== undefined ? photo.pending : photo.saved;

  useEffect(() => {
    if (!existing?.photoId) return;
    let cancelled = false;
    void loadPhoto(existing.photoId).then((d) => !cancelled && setPhoto((p) => ({ ...p, saved: d })));
    return () => {
      cancelled = true;
    };
  }, [existing?.photoId]);

  const choosePhoto = async (source: 'camera' | 'library') => {
    try {
      const d = await pickPhoto(source);
      if (d) setPhoto((p) => ({ ...p, pending: d }));
    } catch (e) {
      notify('Couldn’t add the photo', e instanceof Error ? e.message : undefined);
    }
  };
  const [cal, setCal] = useState(false);

  const account = data.accounts.find((a) => a.id === accountId);
  const transferAccount = transferId ? data.accounts.find((a) => a.id === transferId) : undefined;
  // Transfers are stored on one side; "from" is the side money leaves.
  const fromId = direction === 'out' ? accountId : transferId;
  const toId = direction === 'out' ? transferId : accountId;
  const fromAccount = data.accounts.find((a) => a.id === fromId);
  const toAccount = data.accounts.find((a) => a.id === toId);
  // The type the user picked wins; otherwise (e.g. editing) cash → card counts as a card payment.
  const [transferMode, setTransferMode] = useState<'transfer' | 'ccPayment' | null>(null);
  const kind: TxKind = transferAccount
    ? (transferMode ?? (toAccount && isCreditType(toAccount.type) && fromAccount && !isCreditType(fromAccount.type) ? 'ccPayment' : 'transfer'))
    : direction === 'in'
      ? 'inflow'
      : 'spending';
  const setFrom = (id: string) => (direction === 'out' ? setAccountId(id) : setTransferId(id));
  const setTo = (id: string) => (direction === 'out' ? setTransferId(id) : setAccountId(id));
  const cashAccounts = openAccounts.filter((a) => a.onBudget && !isCreditType(a.type));
  const creditAccounts = openAccounts.filter((a) => isCreditType(a.type));

  const chooseKind = (k: TxKind) => {
    haptic();
    setPicker(null);
    if (k === 'spending' || k === 'inflow') {
      setTransferMode(null);
      if (transferAccount) {
        // Leaving transfer mode: keep the "from" account as the account.
        setAccountId(fromId ?? defaultAccount);
        setTransferId(undefined);
      }
      setDirection(k === 'inflow' ? 'in' : 'out');
      if (k === 'inflow' && !splits) setCategoryId(RTA);
      if (k === 'spending' && categoryId === RTA) setCategoryId(null);
      return;
    }
    setSplits(null);
    setPayeeId(null);
    setPayeeName('');
    if (categoryId === RTA) setCategoryId(null);
    const from = (k === 'ccPayment' ? cashAccounts : openAccounts).find((a) => a.id === (fromId ?? accountId)) ?? (k === 'ccPayment' ? cashAccounts[0] : openAccounts[0]);
    const toChoices = (k === 'ccPayment' ? creditAccounts : openAccounts).filter((a) => a.id !== from?.id);
    // A plain transfer starts with another cash account as "To" when there is one.
    const to = toChoices.find((a) => a.id === toId) ?? (k === 'transfer' ? toChoices.find((a) => !isCreditType(a.type)) : undefined) ?? toChoices[0];
    setTransferMode(k);
    setDirection('out');
    setAccountId(from?.id);
    setTransferId(to?.id);
    if (k === 'ccPayment' && !creditAccounts.length) notify('No credit cards yet', 'Add a credit card account first, then record payments to it here.');
  };

  const sign = direction === 'in' ? 1 : -1;
  const total = Math.abs(parseMoney(amount) ?? 0) * sign;
  const mb = getMonth(result, monthOf(date));
  const isFuture = date > today();

  // A category is only needed when money leaves or enters the budget.
  const needsCategory = account?.onBudget ? !transferAccount || !transferAccount.onBudget : !!transferAccount?.onBudget;

  const payeeLabel = transferAccount ? `Transfer ${direction === 'out' ? 'to' : 'from'} ${transferAccount.name}` : payeeName || (payeeId ? data.payees.find((p) => p.id === payeeId)?.name : '');
  const categoryLabel = (id: string | null) => (id === RTA ? 'Ready to Assign' : data.categories.find((c) => c.id === id)?.name);

  const splitTotal = splits ? splits.reduce((s, l) => s + Math.abs(parseMoney(l.amount) ?? 0), 0) * sign : 0;
  const splitRemaining = total - splitTotal;
  // Left to split, by size (positive = still to split, negative = the lines add up to more than the amount).
  const splitLeft = Math.abs(total) - Math.abs(splitTotal);

  // Transfers have their own type now, so the payee list is just payees.
  const payeeItems = useMemo<PickerItem[]>(
    () =>
      data.payees
        .filter((p) => p.name !== 'Starting Balance' && p.name !== 'Reconciliation Balance Adjustment')
        .map((p) => ({ key: p.id, title: p.name, subtitle: p.lastCategoryId ? categoryLabel(p.lastCategoryId) : undefined })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.payees],
  );
  const accountItems = (list: typeof openAccounts) =>
    list.map((a) => ({
      key: a.id,
      title: a.name,
      section: a.onBudget ? (isCreditType(a.type) ? 'Credit' : 'Cash') : 'Tracking',
      left: <IconBadge name={a.name} icon={ACCOUNT_TYPE_INFO[a.type].icon} colors={ACCOUNT_GRADIENTS[a.type]} size={32} />,
    }));

  // Spending lists only spending categories. Inflow lists income (Ready to Assign) and a "Refund" choice, which
  // then shows the categories so money returned from a purchase goes back where it was spent.
  const incoming = direction === 'in';
  const [refunding, setRefunding] = useState(false);
  const categoryItems = useMemo<PickerItem[]>(() => {
    const spendingItems = (section: (group: string) => string): PickerItem[] =>
      sortedGroups(data)
        .filter(({ group }) => !group.isCreditCardPayments)
        .flatMap(({ group, categories }) =>
          categories.map((c) => {
            const a = categoryMonth(mb, c.id).available;
            return { key: c.id, title: c.name, section: section(group.name), right: <Txt variant="label" tone={a < 0 ? 'danger' : a > 0 ? 'positive' : 'muted'}>{formatMoney(a)}</Txt> };
          }),
        );
    if (!incoming) return spendingItems((g) => g);
    if (refunding) return spendingItems((g) => `Refund to ${g}`);
    const refundTo = categoryId && categoryId !== RTA ? data.categories.find((c) => c.id === categoryId)?.name : undefined;
    return [
      { key: RTA, title: 'Ready to Assign', subtitle: 'Income: pay, gifts, interest', section: 'Income', right: <Txt variant="label" tone="positive">{formatMoney(mb.readyToAssign)}</Txt> },
      { key: REFUND, title: 'Refund', subtitle: refundTo ? `Back to ${refundTo}` : 'Money back from a purchase', section: 'Refunds', right: <Ionicons name="chevron-forward" size={16} color={colors.muted} /> },
    ];
  }, [data, mb, incoming, refunding, categoryId, colors.muted]);

  const selectPayee = (key: string) => {
    if (key.startsWith('transfer:')) {
      setTransferId(key.slice(9));
      setPayeeId(null);
      setPayeeName('');
      setSplits(null);
    } else {
      setTransferId(undefined);
      setPayeeId(key);
      setPayeeName('');
      const p = data.payees.find((x) => x.id === key);
      if (p?.lastCategoryId && !categoryId && !splits) {
        setCategoryId(p.lastCategoryId);
        if (p.lastCategoryId === RTA) setDirection('in');
      }
    }
    setPicker(null);
  };

  // Scan receipt: AI reads a photo or screenshot and fills in the form; the image is kept as the receipt photo.
  const [scanning, setScanning] = useState(false);
  const cloudReady = useCloud((s) => s.status === 'ready');
  const pro = useIsPro();
  const startScan = () => {
    if (!cloudReady) return notify('Sign in first', 'Receipt scanning works through your Plan account.');
    if (requirePro('screenshot')) setPicker({ kind: 'scan' });
  };
  const scanReceipt = async (source: 'camera' | 'library') => {
    setPicker(null);
    try {
      const d = await pickPhoto(source);
      if (!d) return;
      setScanning(true);
      const r = await readReceipt(d, scanHints(data));
      const milli = Math.round(Number(r.amount) * 1000);
      if (milli > 0) setAmount(milliToInput(milli));
      setDirection('out');
      if (r.merchant) {
        const known = data.payees.find((x) => x.name.toLowerCase() === r.merchant!.toLowerCase());
        if (known) selectPayee(known.id);
        else {
          setTransferId(undefined);
          setPayeeId(null);
          setPayeeName(sanitizeText(r.merchant, LIMITS.payeeName));
        }
      }
      // Category: this payee's usual one if it has one, otherwise the AI's pick from your categories.
      const usual = payeeCategory(data, r.merchant);
      const cat = usual ?? matchCategory(data, r.category);
      if (cat && !splits) setCategoryId(cat);
      // Account: the card or wallet the receipt shows, if it's one of yours.
      const acct = matchAccount(data, r.account);
      if (acct) setAccountId(acct);
      if (r.date && r.date <= today()) setDate(r.date);
      setPhoto((p) => ({ ...p, pending: d }));
      haptic('success');
      if (r.currency && r.currency !== c.code) notify('Check the amount', `The receipt is in ${r.currency}, and this budget uses ${c.code}.`);
    } catch (e) {
      haptic('warning');
      notify('Couldn’t read that', e instanceof Error ? e.message : undefined);
    } finally {
      setScanning(false);
    }
  };

  const save = async () => {
    if (!account) return notify('Choose an account');
    const parsed = parseMoney(amount);
    const amountError = validateAmount(parsed, { label: 'Amount' });
    if (amountError) return notify('Check the amount', amountError);
    if (date < '1970-01-01' || date > addMonthsToDate(today(), 60)) return notify('Check the date', 'Dates must be between 1970 and five years from today.');
    if (splits) {
      if (splits.some((l) => !l.categoryId)) return notify('Split needs categories', 'Choose a category for every split line, or remove the empty lines.');
      if (splits.some((l) => !(parseMoney(l.amount) ?? 0))) return notify('Split needs amounts', 'Every split line needs an amount greater than zero.');
      if (splitRemaining !== 0)
        return notify(
          'Split doesn’t add up',
          splitLeft > 0 ? `${formatMoney(splitLeft)} still needs a category.` : `The lines add up to ${formatMoney(-splitLeft)} more than the amount. Lower one of them.`,
        );
    }
    if (transferAccount && transferAccount.id === account.id) return notify('Choose a different account for the transfer');

    const subtransactions: SubTransaction[] | undefined = splits?.map((l) => ({ id: l.id, categoryId: l.categoryId, amount: Math.abs(parseMoney(l.amount) ?? 0) * sign, memo: l.memo || undefined }));
    const cat = needsCategory && !splits ? categoryId : null;
    const pId = transferAccount ? null : payeeName ? store.ensurePayee(sanitizeText(payeeName, LIMITS.payeeName)) : payeeId;

    // Scheduled: editing a schedule, or a new transaction dated in the future.
    if (sched || (!existing && isFuture)) {
      store.saveScheduled({ id: sched?.id, accountId: account.id, nextDate: date, frequency: repeat, amount: total, payeeId: pId, categoryId: cat, transferAccountId: transferAccount?.id, memo: memo || undefined, flag });
      haptic('success');
      goBack();
      return;
    }

    // Photos: store a newly picked one, remove a replaced or deleted one.
    let finalPhotoId = existing?.photoId;
    if (photo.pending !== undefined) {
      try {
        finalPhotoId = photo.pending ? await savePhoto(photo.pending) : undefined;
      } catch (e) {
        return notify('Couldn’t save the photo', e instanceof Error ? e.message : undefined);
      }
      if (existing?.photoId && existing.photoId !== finalPhotoId) await deletePhoto(existing.photoId);
    }

    store.saveTransaction({
      id: existing?.id,
      photoId: transferAccount ? undefined : finalPhotoId,
      accountId: account.id,
      date,
      amount: total,
      payeeId: pId,
      transferAccountId: transferAccount?.id,
      categoryId: cat,
      memo,
      cleared,
      flag,
      subtransactions,
      approved: true,
    });
    if (!existing && repeat !== 'once') {
      const next = nextOccurrence(date, repeat);
      if (next) store.saveScheduled({ accountId: account.id, nextDate: next, frequency: repeat, amount: total, payeeId: pId, categoryId: cat, transferAccountId: transferAccount?.id, memo: memo || undefined, flag });
    }
    haptic('success');

    // New spending on a credit card: show the money moving from the category to the card's payment category.
    const paymentCat = isCreditType(account.type) ? data.categories.find((c) => c.linkedAccountId === account.id) : undefined;
    const saved = useStore.getState().budgets[data.id];
    if (!existing && !transferAccount && total < 0 && paymentCat && saved) {
      const m = monthOf(date);
      const before = categoryMonth(getMonth(result, m), paymentCat.id).available;
      const after = categoryMonth(getMonth(computeBudget(saved), m), paymentCat.id).available;
      const cats = [...new Set(subtransactions ? subtransactions.map((x) => x.categoryId) : [cat])].filter((x): x is string => !!x && x !== RTA);
      if (cats.length) {
        const from = cats.length === 1 ? (data.categories.find((c) => c.id === cats[0])?.name ?? 'Category') : `${cats.length} categories`;
        setMoving({ from, to: account.name, spent: -total, moved: Math.max(after - before, 0) });
        return;
      }
    }
    goBack();
  };

  const remove = async () => {
    if (sched) {
      if (await confirm('Delete scheduled transaction', 'Future occurrences will no longer be entered.', 'Delete', true)) {
        store.deleteScheduled(sched.id);
        goBack();
      }
      return;
    }
    if (existing && (await confirm('Delete transaction', existing.transferAccountId ? 'Both sides of this transfer will be deleted.' : 'This can’t be undone.', 'Delete', true))) {
      store.deleteTransaction(existing.id);
      void deletePhoto(existing.photoId);
      goBack();
    }
  };

  const title = sched ? 'Scheduled transaction' : existing ? 'Edit transaction' : KIND_INFO[kind].title;
  const pickedSplit = picker?.kind === 'category' ? picker.split : undefined;

  return (
    <Screen
      back="close"
      modal
      title={title}
      right={existing && !existing.approved ? <Button title="Approve" small variant="soft" onPress={() => store.approveTransactions([existing.id])} /> : undefined}
      footer={
        <Row style={{ gap: 10 }}>
          {(existing || sched) && <Button title="Delete" variant="danger" icon="trash-outline" onPress={remove} />}
          {sched && <Button title="Enter now" variant="soft" onPress={() => { store.enterScheduledNow(sched.id); goBack(); }} />}
          <Button title="Save" onPress={save} style={{ flex: 1 }} />
        </Row>
      }
    >

      {!existing && !sched && kind === 'spending' && (
        <Tap
          onPress={startScan}
          disabled={scanning}
          accessibilityRole="button"
          accessibilityLabel="Scan a receipt or screenshot"
          style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, backgroundColor: colors.accentSoft }}
        >
          {scanning ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="scan-outline" size={16} color={colors.accent} />}
          <Txt variant="label" tone="accent">
            {scanning ? 'Reading…' : 'Scan receipt'}
          </Txt>
          {!pro && (
            <View style={{ backgroundColor: colors.accent, borderRadius: RADIUS.pill, paddingHorizontal: 6, paddingVertical: 1 }}>
              <Txt variant="caption" style={{ color: colors.onGradient, fontSize: 10 }}>
                PRO
              </Txt>
            </View>
          )}
        </Tap>
      )}
      <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: RADIUS.pill, paddingHorizontal: 30, marginVertical: 22, minWidth: 220, justifyContent: 'center' }}>
        <Txt variant="h2" tone="muted">
          {direction === 'out' ? '−' : '+'}
          {c.symbol}
        </Txt>
        <TextInput
          value={amount}
          ref={amountRef}
          onFocus={calc.onFocus}
          onBlur={calc.onBlur}
          onChangeText={(t) => setAmount(filterAmountTyping(t, c))}
          maxLength={LIMITS.amountChars}
          placeholder="0"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          autoFocus={!src}
          accessibilityLabel="Amount"
          style={[{ fontFamily: FONT.bold, fontSize: 44, color: direction === 'in' ? colors.positive : colors.accent, paddingVertical: 14, width: amountWidth(amount), textAlign: 'center' }, noWebOutline]}
        />
      </View>
      {calc.bar && <View style={{ marginTop: -12, marginBottom: 18 }}>{calc.bar}</View>}

      <Tap
        onPress={() => setPicker({ kind: 'type' })}
        accessibilityRole="button"
        accessibilityLabel={`Type: ${KIND_INFO[kind].label}. Change type`}
        style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 18, height: 44, marginTop: -8, marginBottom: 18 }}
      >
        <Ionicons name={KIND_INFO[kind].icon} size={18} color={colors.text} />
        <Txt variant="strong">{KIND_INFO[kind].label}</Txt>
        <Ionicons name="chevron-expand" size={16} color={colors.muted} />
      </Tap>

      <View style={{ gap: 10 }}>
        {transferAccount ? (
          <>
            <FieldRow icon="arrow-up-circle-outline" label="From" value={fromAccount?.name} placeholder="From account" onPress={() => setPicker({ kind: 'from' })} />
            <FieldRow icon="arrow-down-circle-outline" label={kind === 'ccPayment' ? 'Credit card' : 'To'} value={toAccount?.name} placeholder={kind === 'ccPayment' ? 'Which card' : 'To account'} onPress={() => setPicker({ kind: 'to' })} />
          </>
        ) : (
          <FieldRow icon="person-outline" label="Payee" value={payeeLabel} placeholder="Payee" onPress={() => setPicker({ kind: 'payee' })} />
        )}
        {needsCategory && !splits && (
          <Row style={{ gap: 8 }}>
            <View style={{ flex: 1 }}>
              <FieldRow icon="pricetag-outline" label="Category" value={categoryLabel(categoryId)} placeholder="Category" onPress={() => setPicker({ kind: 'category' })} />
            </View>
            {!transferAccount && account?.onBudget && (
              <Tap
                onPress={() => setSplits([{ id: uid('s'), categoryId, amount: amount, memo: '' }, { id: uid('s'), categoryId: null, amount: '', memo: '' }])}
                accessibilityRole="button"
                accessibilityLabel="Split transaction"
                style={{ height: 56, paddingHorizontal: 14, borderRadius: RADIUS.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 2 }}
              >
                <Ionicons name="git-branch-outline" size={16} color={colors.accent} />
                <Txt variant="caption" tone="accent">
                  Split
                </Txt>
              </Tap>
            )}
          </Row>
        )}
        {splits && (
          <View style={{ backgroundColor: colors.surface, borderRadius: RADIUS.md, padding: 12, gap: 10 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="label">Split transaction</Txt>
              <Tap onPress={() => setSplits(null)} hitSlop={8}>
                <Txt variant="label" tone="muted">
                  Cancel split
                </Txt>
              </Tap>
            </Row>
            {splits.map((l, i) => (
              <Row key={l.id} style={{ gap: 8 }}>
                <Tap onPress={() => setPicker({ kind: 'category', split: l.id })} style={{ flex: 1.4, backgroundColor: colors.surfaceAlt, borderRadius: RADIUS.sm, padding: 10 }}>
                  <Txt variant="body" numberOfLines={1} tone={l.categoryId ? 'default' : 'muted'}>
                    {categoryLabel(l.categoryId) ?? 'Category'}
                  </Txt>
                </Tap>
                <TextInput
                  value={l.amount}
                  onChangeText={(v) => setSplits(splits.map((x) => (x.id === l.id ? { ...x, amount: filterAmountTyping(v, c) } : x)))}
                  maxLength={LIMITS.amountChars}
                  placeholder={formatNumber(0)}
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  accessibilityLabel={`Split ${i + 1} amount`}
                  style={{ flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: RADIUS.sm, padding: 10, fontFamily: FONT.semibold, color: colors.text, textAlign: 'right' }}
                />
                <Tap onPress={() => setSplits(splits.length > 2 ? splits.filter((x) => x.id !== l.id) : splits)} hitSlop={6} accessibilityLabel="Remove split line">
                  <Ionicons name="remove-circle-outline" size={20} color={splits.length > 2 ? colors.danger : colors.border} />
                </Tap>
              </Row>
            ))}
            <Row style={{ justifyContent: 'space-between' }}>
              <Tap onPress={() => setSplits([...splits, { id: uid('s'), categoryId: null, amount: splitLeft > 0 ? milliToInput(splitLeft) : '', memo: '' }])} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="add" size={16} color={colors.accent} />
                <Txt variant="label" tone="accent">
                  Add split
                </Txt>
              </Tap>
              <Txt variant="label" tone={splitLeft === 0 ? 'positive' : splitLeft < 0 ? 'danger' : 'warning'}>
                {splitLeft === 0 ? 'Fully split' : splitLeft > 0 ? `${formatMoney(splitLeft)} left to split` : `${formatMoney(-splitLeft)} over`}
              </Txt>
            </Row>
          </View>
        )}
        {!transferAccount && <FieldRow icon="wallet-outline" label="Account" value={account?.name} placeholder="Account" onPress={() => setPicker({ kind: 'account' })} />}
        <FieldRow icon="calendar-outline" label="Date" value={`${friendlyDate(date)}${isFuture && !existing ? ' · scheduled' : ''}`} onPress={() => setCal(true)} />
        {!existing && <FieldRow icon="repeat-outline" label="Repeat" value={frequencyLabel(repeat)} onPress={() => setPicker({ kind: 'repeat' })} />}
        <TextField icon="chatbubble-ellipses-outline" placeholder="Memo" value={memo} onChangeText={setMemo} maxLength={LIMITS.memo} returnKeyType="done" />
        {!transferAccount && (
          <>
            <FieldRow
              icon="image-outline"
              label="Photo"
              value={shownPhoto ? 'Receipt attached' : existing?.photoId && photo.pending === undefined ? 'Photo saved on another device' : undefined}
              placeholder="Add a receipt photo"
              onPress={() => setPicker({ kind: 'photo' })}
            />
            {!!shownPhoto && (
              <Tap onPress={() => setViewPhoto(true)} accessibilityRole="imagebutton" accessibilityLabel="View receipt photo">
                <Image source={{ uri: shownPhoto }} resizeMode="cover" style={{ width: '100%', height: 160, borderRadius: RADIUS.md, backgroundColor: colors.sunken }} />
              </Tap>
            )}
          </>
        )}

        <View style={{ backgroundColor: colors.surface, borderRadius: RADIUS.md, padding: 14, gap: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="body">Flag</Txt>
            <Row style={{ gap: 8 }}>
              {(Object.keys(FLAG_COLORS) as FlagColor[]).map((f) => (
                <Tap key={f} onPress={() => setFlag(flag === f ? undefined : f)} accessibilityLabel={`${f} flag`} accessibilityState={{ selected: flag === f }} hitSlop={4}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: FLAG_COLORS[f], borderWidth: 3, borderColor: flag === f ? colors.text : 'transparent' }} />
                </Tap>
              ))}
            </Row>
          </Row>
          {!sched && !(isFuture && !existing) && (
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="body">{cleared === 'reconciled' ? 'Reconciled' : 'Cleared'}</Txt>
              {cleared === 'reconciled' ? (
                <Ionicons name="lock-closed" size={16} color={colors.positive} />
              ) : (
                <Toggle label="Cleared" value={cleared === 'cleared'} onChange={(v) => setCleared(v ? 'cleared' : 'uncleared')} />
              )}
            </Row>
          )}
        </View>
      </View>

      <PickerSheet
        visible={picker?.kind === 'payee'}
        onClose={() => setPicker(null)}
        title="Payee"
        items={payeeItems}
        selectedKey={transferId ? `transfer:${transferId}` : payeeId}
        onSelect={selectPayee}
        onCreate={(raw) => {
          const name = sanitizeText(raw, LIMITS.payeeName);
          if (!/[\p{L}\p{N}]/u.test(name)) return notify('Invalid payee', 'Payee names need at least one letter or number.');
          setTransferId(undefined);
          setPayeeId(null);
          setPayeeName(name);
          setPicker(null);
        }}
        createLabel="New payee"
        searchPlaceholder="Search or add payee"
      />
      <PickerSheet
        visible={picker?.kind === 'category'}
        onClose={() => {
          setPicker(null);
          setRefunding(false);
        }}
        title={incoming ? (refunding ? 'Refund to which category?' : 'What kind of money is this?') : 'Category'}
        searchable={!incoming || refunding}
        items={categoryItems}
        selectedKey={pickedSplit ? splits?.find((s) => s.id === pickedSplit)?.categoryId : categoryId}
        onSelect={(k) => {
          if (k === REFUND) return setRefunding(true);
          setRefunding(false);
          if (pickedSplit) setSplits((cur) => cur?.map((s) => (s.id === pickedSplit ? { ...s, categoryId: k } : s)) ?? null);
          else {
            setCategoryId(k);
            if (k === RTA) setDirection('in');
          }
          setPicker(null);
        }}
      />
      <PickerSheet
        visible={picker?.kind === 'account'}
        onClose={() => setPicker(null)}
        title="Account"
        searchable={false}
        selectedKey={accountId}
        items={accountItems(openAccounts)}
        onSelect={(k) => {
          setAccountId(k);
          setPicker(null);
        }}
      />
      <PickerSheet
        visible={picker?.kind === 'from'}
        onClose={() => setPicker(null)}
        title={kind === 'ccPayment' ? 'Pay from' : 'Transfer from'}
        searchable={false}
        selectedKey={fromId}
        items={accountItems((kind === 'ccPayment' ? cashAccounts : openAccounts).filter((a) => a.id !== toId))}
        onSelect={(k) => {
          setFrom(k);
          setPicker(null);
        }}
      />
      <PickerSheet
        visible={picker?.kind === 'to'}
        onClose={() => setPicker(null)}
        title={kind === 'ccPayment' ? 'Which credit card?' : 'Transfer to'}
        searchable={false}
        selectedKey={toId}
        items={accountItems((kind === 'ccPayment' ? creditAccounts : openAccounts).filter((a) => a.id !== fromId))}
        onSelect={(k) => {
          setTo(k);
          setPicker(null);
        }}
      />
      <ActionSheet
        visible={picker?.kind === 'scan'}
        onClose={() => setPicker(null)}
        title="Scan a receipt"
        actions={[
          { label: 'Take photo', icon: 'camera-outline', onPress: () => void scanReceipt('camera') },
          { label: 'Choose screenshot or photo', icon: 'images-outline', onPress: () => void scanReceipt('library') },
        ]}
      />
      <ActionSheet
        visible={picker?.kind === 'photo'}
        onClose={() => setPicker(null)}
        title="Receipt photo"
        actions={[
          { label: 'Take photo', icon: 'camera-outline', onPress: () => void choosePhoto('camera') },
          { label: 'Choose from library', icon: 'images-outline', onPress: () => void choosePhoto('library') },
          ...(shownPhoto
            ? [
                { label: 'View photo', icon: 'expand-outline' as const, onPress: () => setViewPhoto(true) },
                { label: 'Remove photo', icon: 'trash-outline' as const, destructive: true, onPress: () => setPhoto((p) => ({ ...p, pending: null })) },
              ]
            : []),
        ]}
      />
      <Sheet visible={viewPhoto} onClose={() => setViewPhoto(false)} title="Receipt">
        {!!shownPhoto && <Image source={{ uri: shownPhoto }} resizeMode="contain" style={{ width: '100%', height: 480, borderRadius: RADIUS.md }} />}
        <Txt variant="caption" tone="muted" center style={{ marginTop: 10 }}>
          Stored encrypted on this device only.
        </Txt>
      </Sheet>
      <ActionSheet
        visible={picker?.kind === 'type'}
        onClose={() => setPicker(null)}
        title="Type"
        actions={(Object.keys(KIND_INFO) as TxKind[]).map((k) => ({
          label: `${KIND_INFO[k].label}${k === kind ? '  ✓' : ''}`,
          icon: KIND_INFO[k].icon,
          hint: k === 'spending' ? 'Money you spent' : k === 'inflow' ? 'Income or refunds' : k === 'ccPayment' ? 'Pay a card from a cash account' : 'Move money between accounts',
          onPress: () => chooseKind(k),
        }))}
      />
      <PickerSheet
        visible={picker?.kind === 'repeat'}
        onClose={() => setPicker(null)}
        title="Repeat"
        searchable={false}
        selectedKey={repeat}
        items={FREQUENCIES.map((f) => ({ key: f.value, title: f.label }))}
        onSelect={(k) => {
          setRepeat(k as Frequency);
          setPicker(null);
        }}
      />
      <CalendarSheet visible={cal} onClose={() => setCal(false)} value={date} onChange={setDate} />
      {moving && <MoneyMove info={moving} onDone={goBack} />}
    </Screen>
  );
}

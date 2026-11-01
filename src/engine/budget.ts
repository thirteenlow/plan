import { addMonths, addMonthsToDate, currentMonth, monthDiff, monthLabel, monthOf, weekdayCount } from '@/utils/date';
import { isCreditType } from '@/utils/icons';
import { formatMoney } from '@/utils/money';
import { RTA, type Account, type BudgetData, type Category, type Milli, type MonthKey, type Target } from '@/store/types';

export interface TargetStatus {
  /** Amount the target asks for this month */
  neededThisMonth: Milli;
  /** How much more must be assigned this month to be on track */
  underfunded: Milli;
  /** 0..1 progress shown on the bar */
  progress: number;
  funded: boolean;
  label: string;
  /** For by-date targets: the date the total is due */
  dueMonth?: MonthKey;
  snoozed?: boolean;
}

export interface CategoryMonth {
  carryover: Milli;
  assigned: Milli;
  activity: Milli;
  available: Milli;
  /** Positive amount of overspending that came from cash accounts (reduces next month's Ready to Assign) */
  cashOverspent: Milli;
  /** Positive amount of overspending on credit cards (becomes debt) */
  creditOverspent: Milli;
  target?: TargetStatus;
}

export interface MonthBudget {
  month: MonthKey;
  readyToAssign: Milli;
  income: Milli;
  assigned: Milli;
  activity: Milli;
  available: Milli;
  /** Cash overspending from last month that was deducted from this month's Ready to Assign */
  overspentLastMonth: Milli;
  /** Total assigned in months after this one */
  assignedInFuture: Milli;
  underfunded: Milli;
  overspentCount: number;
  categories: Record<string, CategoryMonth>;
}

export interface BudgetResult {
  first: MonthKey;
  last: MonthKey;
  months: Record<MonthKey, MonthBudget>;
}

const EMPTY_CM: CategoryMonth = { carryover: 0, assigned: 0, activity: 0, available: 0, cashOverspent: 0, creditOverspent: 0 };

type Bucket = Record<MonthKey, Record<string, Milli>>;
const addTo = (b: Bucket, m: MonthKey, k: string, v: Milli) => {
  const row = (b[m] ??= {});
  row[k] = (row[k] ?? 0) + v;
};

export function paymentCategoryFor(data: BudgetData, accountId: string): Category | undefined {
  return data.categories.find((c) => c.linkedAccountId === accountId);
}

export function computeBudget(data: BudgetData, through?: MonthKey): BudgetResult {
  const accounts = new Map<string, Account>(data.accounts.map((a) => [a.id, a]));
  const categoryIds = new Set(data.categories.map((c) => c.id));
  const payCatByAccount = new Map<string, string>();
  for (const c of data.categories) if (c.linkedAccountId) payCatByAccount.set(c.linkedAccountId, c.id);

  /** Category activity: flows[month][categoryId]. `card` is set for activity on a credit card with a payment category. */
  const flows: Record<MonthKey, Record<string, { date: string; amount: Milli; card?: string }[]>> = {};
  const addFlow = (m: MonthKey, cat: string, f: { date: string; amount: Milli; card?: string }) => ((flows[m] ??= {})[cat] ??= []).push(f);
  const payments: Bucket = {};
  const income: Record<MonthKey, Milli> = {};
  const uncategorized: Record<MonthKey, Milli> = {};

  let first = monthOf(data.createdAt);
  let last = through && through > currentMonth() ? through : currentMonth();

  for (const tx of data.transactions) {
    const acct = accounts.get(tx.accountId);
    if (!acct || !acct.onBudget) continue;
    const m = monthOf(tx.date);
    if (m < first) first = m;
    if (m > last) last = m;
    const isCredit = isCreditType(acct.type);

    if (tx.transferAccountId) {
      const other = accounts.get(tx.transferAccountId);
      if (other?.onBudget) {
        const otherCredit = isCreditType(other.type);
        if (!isCredit && otherCredit) {
          const pc = payCatByAccount.get(other.id);
          if (pc) addTo(payments, m, pc, tx.amount);
        } else if (isCredit && otherCredit) {
          const pc = payCatByAccount.get(acct.id);
          if (pc) addTo(payments, m, pc, -tx.amount);
        }
        continue;
      }
      // Transfers to tracking accounts are categorized on the budget side and fall through.
    }
    if (tx.isStartingBalance && isCredit) continue; // pre-existing debt lives in the payment category

    const entries = tx.subtransactions?.length ? tx.subtransactions : [{ categoryId: tx.categoryId, amount: tx.amount }];
    for (const e of entries) {
      const cat = e.categoryId;
      if (cat === RTA) income[m] = (income[m] ?? 0) + e.amount;
      else if (!cat || !categoryIds.has(cat)) uncategorized[m] = (uncategorized[m] ?? 0) + e.amount;
      else addFlow(m, cat, { date: tx.date, amount: e.amount, card: isCredit && payCatByAccount.has(acct.id) ? acct.id : undefined });
    }
  }

  let totalAssignedAll = 0;
  for (const m of Object.keys(data.assigned)) {
    const row = data.assigned[m];
    let any = false;
    for (const k in row) {
      if (!row[k]) continue;
      any = true;
      totalAssignedAll += row[k];
    }
    if (any) {
      if (m < first) first = m;
      if (m > last) last = m;
    }
  }

  const regular = data.categories.filter((c) => !c.linkedAccountId);
  const paymentCats = data.categories.filter((c) => c.linkedAccountId);
  const months: Record<MonthKey, MonthBudget> = {};
  let prev: Record<string, CategoryMonth> = {};
  let cumIncome = 0;
  let cumUncategorized = 0;
  let cumCashOverspendBefore = 0;
  let assignedSoFar = 0;
  let lastOverspent = 0;
  /** Assigned per category in months before the current one, counted from when its target was created */
  const assignedSince: Record<string, Milli> = {};

  for (let m = first; m <= last; m = addMonths(m, 1)) {
    const assignedRow = data.assigned[m] ?? {};
    const cats: Record<string, CategoryMonth> = {};
    const paymentMove: Record<string, Milli> = {};
    let monthCashOver = 0;
    let assignedTotal = 0;
    let activityTotal = 0;
    let availableTotal = 0;
    let underfunded = 0;
    let overspentCount = 0;

    const finish = (c: Category, cm: CategoryMonth) => {
      if (cm.available < 0 && cm.cashOverspent === 0 && cm.creditOverspent === 0) cm.cashOverspent = -cm.available;
      if (c.target) {
        const status = targetStatus(c.target, m, cm, assignedSince[c.id] ?? 0);
        if (m >= c.target.createdMonth) assignedSince[c.id] = (assignedSince[c.id] ?? 0) + cm.assigned;
        cm.target = c.target.snoozedMonth === m ? { ...status, underfunded: 0, snoozed: true, label: 'Snoozed this month' } : status;
      }
      cats[c.id] = cm;
      monthCashOver += cm.cashOverspent;
      assignedTotal += cm.assigned;
      availableTotal += cm.available;
      if (!c.hidden) {
        underfunded += cm.target?.underfunded ?? 0;
        if (cm.available < 0) overspentCount++;
      }
    };

    for (const c of regular) {
      const carry = Math.max(prev[c.id]?.available ?? 0, 0);
      const assigned = assignedRow[c.id] ?? 0;
      // Cash activity and card returns count first, then card purchases are funded in date order
      // (moved to the card's payment category) for as long as the category has money. Later ones go unfunded.
      const list = flows[m]?.[c.id] ?? [];
      let pool = carry + assigned;
      let activity = 0;
      let unfunded = 0;
      for (const f of list) {
        activity += f.amount;
        if (f.card && f.amount < 0) continue;
        pool += f.amount;
        // Returns on cards add back to the category and come out of the card's payment category.
        if (f.card) paymentMove[f.card] = (paymentMove[f.card] ?? 0) - f.amount;
      }
      const purchases = list.filter((f) => f.card && f.amount < 0).sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
      for (const f of purchases) {
        const funded = Math.min(-f.amount, Math.max(pool, 0));
        paymentMove[f.card!] = (paymentMove[f.card!] ?? 0) + funded;
        unfunded += -f.amount - funded;
        pool += f.amount;
      }
      const available = carry + assigned + activity;
      let creditOverspent = 0;
      let cashOverspent = 0;
      if (available < 0) {
        creditOverspent = Math.min(-available, unfunded);
        cashOverspent = -available - creditOverspent;
      }
      activityTotal += activity;
      finish(c, { carryover: carry, assigned, activity, available, cashOverspent, creditOverspent });
    }

    for (const c of paymentCats) {
      const carry = Math.max(prev[c.id]?.available ?? 0, 0);
      const assigned = assignedRow[c.id] ?? 0;
      const activity = (paymentMove[c.linkedAccountId!] ?? 0) + (payments[m]?.[c.id] ?? 0);
      const available = carry + assigned + activity;
      finish(c, {
        carryover: carry,
        assigned,
        activity,
        available,
        cashOverspent: available < 0 ? -available : 0,
        creditOverspent: 0,
      });
    }

    cumIncome += income[m] ?? 0;
    cumUncategorized += uncategorized[m] ?? 0;
    assignedSoFar += assignedTotal;

    months[m] = {
      month: m,
      // Raw value for now; future assignments are pulled back below.
      readyToAssign: cumIncome + cumUncategorized - assignedSoFar - cumCashOverspendBefore,
      income: income[m] ?? 0,
      assigned: assignedTotal,
      activity: activityTotal,
      available: availableTotal,
      overspentLastMonth: lastOverspent,
      assignedInFuture: totalAssignedAll - assignedSoFar,
      underfunded,
      overspentCount,
      categories: cats,
    };
    cumCashOverspendBefore += monthCashOver;
    lastOverspent = monthCashOver;
    prev = cats;
  }

  // Money assigned in later months must come from somewhere: if a later month would be
  // short, the shortfall reduces Ready to Assign in earlier months too.
  let runningMin = Infinity;
  for (let m = last; m >= first; m = addMonths(m, -1)) {
    const mb = months[m];
    runningMin = Math.min(runningMin, mb.readyToAssign);
    mb.readyToAssign = runningMin;
  }

  return { first, last, months };
}

export function getMonth(result: BudgetResult, month: MonthKey): MonthBudget {
  if (result.months[month]) return result.months[month];
  // Before the budget started: nothing exists yet.
  return {
    month,
    readyToAssign: 0,
    income: 0,
    assigned: 0,
    activity: 0,
    available: 0,
    overspentLastMonth: 0,
    assignedInFuture: 0,
    underfunded: 0,
    overspentCount: 0,
    categories: {},
  };
}

export const categoryMonth = (mb: MonthBudget, id: string): CategoryMonth => mb.categories[id] ?? EMPTY_CM;

/** First due date for a by-date target that falls in or after `month`. */
export function nextDueDate(t: Target, month: MonthKey): string | undefined {
  if (!t.dueDate) return undefined;
  const step = t.cadence === 'yearly' ? 12 : t.repeatMonths ?? 0;
  let due = t.dueDate;
  if (step > 0) {
    let guard = 0;
    while (monthOf(due) < month && guard++ < 1000) due = addMonthsToDate(due, step);
  }
  return due;
}

/** `assignedBefore`: total assigned to the category in earlier months since the target was created. */
export function targetStatus(t: Target, m: MonthKey, cm: CategoryMonth, assignedBefore = 0): TargetStatus {
  const { assigned, carryover, available } = cm;
  const fmt = (v: Milli) => formatMoney(v);
  const make = (needed: Milli, under: Milli, progress: number, label: string, dueMonth?: MonthKey): TargetStatus => ({
    neededThisMonth: Math.max(needed, 0),
    underfunded: Math.max(under, 0),
    progress: Math.max(0, Math.min(1, progress)),
    funded: under <= 0,
    label,
    dueMonth,
  });

  if (t.kind === 'savings') {
    const under = t.amount - assigned;
    return make(t.amount, under, t.amount ? assigned / t.amount : 1, under > 0 ? `Assign ${fmt(under)} more this month` : `Saved ${fmt(t.amount)} this month`);
  }

  const byDate = (amount: Milli, due: string | undefined) => {
    if (!due) {
      const under = amount - (carryover + assigned);
      return make(Math.max(under + assigned, 0), under, amount ? (carryover + assigned) / amount : 1, under > 0 ? `${fmt(under)} more to reach ${fmt(amount)}` : 'Target balance reached');
    }
    const dueMonth = monthOf(due);
    if (dueMonth < m) {
      return make(0, 0, available >= amount ? 1 : amount ? available / amount : 1, `Was due ${monthLabel(dueMonth)}`, dueMonth);
    }
    const monthsLeft = monthDiff(m, dueMonth) + 1;
    const needed = Math.ceil(Math.max(amount - carryover, 0) / monthsLeft / 10) * 10;
    const under = needed - assigned;
    const label = under > 0 ? `${fmt(under)} to go by ${monthLabel(dueMonth)}` : `On track for ${fmt(amount)} by ${monthLabel(dueMonth)}`;
    return make(needed, under, amount ? (carryover + assigned) / amount : 1, label, dueMonth);
  };

  if (t.kind === 'balance') return byDate(t.amount, t.dueDate);

  // Custom (one-time, by a date). "Set aside" counts what's been assigned since the target began, so spending
  // along the way doesn't set it back; "refill" and "balance" look at the money sitting in the category.
  if (t.cadence === 'custom' && !t.repeatMonths) {
    if (t.behavior === 'setAside' && t.dueDate) {
      const dueMonth = monthOf(t.dueDate);
      const total = assignedBefore + assigned;
      if (dueMonth < m) return make(0, 0, t.amount ? total / t.amount : 1, `Was due ${monthLabel(dueMonth)}`, dueMonth);
      const monthsLeft = monthDiff(m, dueMonth) + 1;
      const needed = Math.ceil(Math.max(t.amount - assignedBefore, 0) / monthsLeft / 10) * 10;
      const under = needed - assigned;
      const label = under > 0 ? `${fmt(under)} to go` : `On track for ${fmt(t.amount)} by ${monthLabel(dueMonth)}`;
      return make(needed, under, t.amount ? total / t.amount : 1, label, dueMonth);
    }
    return byDate(t.amount, t.dueDate);
  }

  // needed for spending
  if (t.cadence === 'yearly' || t.cadence === 'custom') {
    const due = nextDueDate(t, m);
    const cycle = t.cadence === 'yearly' ? 12 : t.repeatMonths ?? 0;
    // "Set aside another" on a repeating target: the same share every month, whatever is left over.
    if (t.behavior === 'setAside' && cycle > 0 && due && monthOf(due) >= m) {
      const perMonth = Math.ceil(t.amount / cycle / 10) * 10;
      const under = perMonth - assigned;
      const dueMonth = monthOf(due);
      const label = under > 0 ? `${fmt(under)} to go` : `On track for ${fmt(t.amount)} by ${monthLabel(dueMonth)}`;
      return make(perMonth, under, perMonth ? assigned / perMonth : 1, label, dueMonth);
    }
    return byDate(t.amount, due);
  }
  const perMonth = t.cadence === 'weekly' ? t.amount * weekdayCount(m, t.weekday ?? 0) : t.amount;
  if (t.behavior === 'refill') {
    const have = carryover + assigned;
    const under = perMonth - have;
    return make(perMonth, under, perMonth ? have / perMonth : 1, under > 0 ? `${fmt(under)} to go` : 'Funded');
  }
  const under = perMonth - assigned;
  return make(perMonth, under, perMonth ? assigned / perMonth : 1, under > 0 ? `${fmt(under)} to go` : 'Funded');
}

/**
 * What a target asks for per month when starting in `month` with nothing saved yet: the amount for this month,
 * plus the steady amount for later cycles when that's different (e.g. a yearly bill due in 3 months).
 */
export function targetMonthly(t: Target, month: MonthKey): { thisMonth: Milli; later?: Milli; dueMonth?: MonthKey } {
  const s = targetStatus(t, month, EMPTY_CM);
  const cycle = t.cadence === 'yearly' ? 12 : t.cadence === 'custom' ? (t.repeatMonths ?? 0) : 0;
  const later = cycle > 0 ? Math.ceil(t.amount / cycle / 10) * 10 : undefined;
  return { thisMonth: s.neededThisMonth, later: later !== undefined && later !== s.neededThisMonth ? later : undefined, dueMonth: s.dueMonth };
}

export type AvailableTone = 'positive' | 'zero' | 'underfunded' | 'overspent' | 'creditOverspent';

export function availableTone(cm: CategoryMonth): AvailableTone {
  if (cm.available < 0) return cm.cashOverspent > 0 ? 'overspent' : 'creditOverspent';
  if (cm.target && cm.target.underfunded > 0 && !cm.target.snoozed) return 'underfunded';
  if (cm.available > 0) return 'positive';
  return 'zero';
}

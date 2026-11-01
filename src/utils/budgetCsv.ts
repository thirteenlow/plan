/**
 * CSV export and import.
 *
 * Export writes two files, Plan.csv (assigned, activity and available per category and month) and Register.csv
 * (every transaction), so a budget can move to a spreadsheet or another app. Import reads files in the same
 * format, from this app or other budgeting apps that use it, into a new budget.
 * Pure functions only: no React Native imports, so this can be tested in Node.
 */
import { computeBudget, getMonth } from '@/engine/budget';
import { RTA, type Account, type AccountType, type BudgetData, type Category, type CategoryGroup, type ClearedStatus, type CurrencyFormat, type DateFormat, type FlagColor, type MonthKey, type Payee, type ScheduledTransaction, type Transaction } from '@/store/types';
import { addMonths, currentMonth } from '@/utils/date';
import { uid } from '@/utils/id';
import { ACCOUNT_TYPE_INFO, isCreditType } from '@/utils/icons';
import { applySymbol } from '@/utils/money';
import { sanitizeText } from '@/utils/validation';

const REGISTER_HEADER = ['Account', 'Flag', 'Date', 'Payee', 'Category Group/Category', 'Category Group', 'Category', 'Memo', 'Outflow', 'Inflow', 'Cleared'];
const PLAN_HEADER = ['Month', 'Category Group/Category', 'Category Group', 'Category', 'Assigned', 'Activity', 'Available'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FLAGS: FlagColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
const TRANSFER = /^Transfer\s*:\s*(.+)$/;
const SPLIT = /^Split \((\d+)\/(\d+)\)\s?/;
const MAX_ROWS = 200_000;

// ---------- CSV ----------

// Every field is quoted.
const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
const toCsv = (rows: string[][]) => rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

/** RFC 4180 parser (quoted fields, escaped quotes, CRLF/LF, optional BOM). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f !== '')) rows.push(row);
      if (rows.length > MAX_ROWS) throw new Error('That file has too many rows to import.');
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

/** Rows as objects keyed by header name. */
function records(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

export function isRegisterCsv(text: string) {
  const header = parseCsv(text.slice(0, 2000))[0]?.map((h) => h.trim()) ?? [];
  return header.includes('Account') && header.includes('Outflow') && header.includes('Inflow');
}

export function isPlanCsv(text: string) {
  const header = parseCsv(text.slice(0, 2000))[0]?.map((h) => h.trim()) ?? [];
  return header.includes('Month') && (header.includes('Assigned') || header.includes('Budgeted'));
}

// ---------- formatting ----------

/** "$1234.56": currency symbol, no thousands separators. */
function amountText(m: number, c: CurrencyFormat): string {
  const abs = Math.abs(m) / 1000;
  const body = abs.toFixed(c.decimals).replace('.', c.decimal);
  const s = applySymbol(body, { ...c, showSymbol: true });
  return m < 0 && Math.round(abs * 10 ** c.decimals) !== 0 ? `-${s}` : s;
}

function dateText(iso: string, f: DateFormat): string {
  const [y, m, d] = iso.split('-');
  return f === 'YMD' ? `${y}-${m}-${d}` : f === 'DMY' ? `${d}/${m}/${y}` : `${m}/${d}/${y}`;
}

const monthText = (m: MonthKey) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- export ----------

export function csvFileStem(data: BudgetData, today: string): string {
  const safe = data.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Budget';
  return `${safe} as of ${today}`;
}

/** Builds Register.csv and Plan.csv for a budget. */
export function exportCsv(data: BudgetData): { register: string; plan: string } {
  const c = data.settings.currency;
  const f = data.settings.dateFormat;
  const accounts = new Map(data.accounts.map((a) => [a.id, a]));
  const cats = new Map(data.categories.map((x) => [x.id, x]));
  const groups = new Map(data.groups.map((g) => [g.id, g]));
  const payees = new Map(data.payees.map((p) => [p.id, p]));

  const categoryCols = (id: string | null | undefined): [string, string, string] => {
    if (id === RTA) return ['Inflow: Ready to Assign', 'Inflow', 'Ready to Assign'];
    const cat = id ? cats.get(id) : undefined;
    if (!cat) return ['', '', ''];
    const g = groups.get(cat.groupId)?.name ?? '';
    return [`${g}: ${cat.name}`, g, cat.name];
  };

  const rows: string[][] = [];
  const txs = [...data.transactions].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
  for (const t of txs) {
    const acct = accounts.get(t.accountId);
    if (!acct) continue;
    const payee = t.transferAccountId
      ? `Transfer : ${accounts.get(t.transferAccountId)?.name ?? ''}`
      : ((t.payeeId && payees.get(t.payeeId)?.name) ?? (t.isStartingBalance ? 'Starting Balance' : ''));
    // On-budget starting balances (cards included) are filed under Ready to Assign.
    const categoryId = t.isStartingBalance && acct.onBudget ? RTA : t.categoryId;
    const lines = t.subtransactions?.length
      ? t.subtransactions.map((s, i, all) => ({ categoryId: s.categoryId, amount: s.amount, memo: `Split (${i + 1}/${all.length}) ${s.memo ?? t.memo ?? ''}`.trim() }))
      : [{ categoryId, amount: t.amount, memo: t.memo ?? '' }];
    for (const l of lines) {
      rows.push([
        acct.name,
        t.flag ? cap(t.flag) : '',
        dateText(t.date, f),
        payee,
        ...categoryCols(l.categoryId),
        l.memo,
        amountText(l.amount < 0 ? -l.amount : 0, c),
        amountText(l.amount > 0 ? l.amount : 0, c),
        cap(t.cleared),
      ]);
    }
  }

  const result = computeBudget(data);
  const planRows: string[][] = [];
  const ordered = [...data.groups]
    .sort((a, b) => a.sort - b.sort)
    .flatMap((g) => data.categories.filter((x) => x.groupId === g.id).sort((a, b) => a.sort - b.sort));
  const last = [currentMonth(), result.last].sort().at(-1)!;
  for (let m = result.first; m <= last; m = addMonths(m, 1)) {
    const mb = getMonth(result, m);
    for (const cat of ordered) {
      const cm = mb.categories[cat.id];
      const [full, g, name] = categoryCols(cat.id);
      planRows.push([monthText(m), full, g, name, amountText(cm?.assigned ?? 0, c), amountText(cm?.activity ?? 0, c), amountText(cm?.available ?? 0, c)]);
    }
  }

  return { register: toCsv([REGISTER_HEADER, ...rows]), plan: toCsv([PLAN_HEADER, ...planRows]) };
}

// ---------- import ----------

/** Parses "$1,234.56", "-€12,50", "(4.00)", "1 234,56 kr" into milliunits. */
export function parseAmountText(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  const negative = /^-|^\(|-$|\)$|^[^\d]*-/.test(t);
  const digits = t.replace(/[^\d.,]/g, '');
  if (!digits) return 0;
  const lastSep = Math.max(digits.lastIndexOf('.'), digits.lastIndexOf(','));
  let value: number;
  if (lastSep === -1) value = Number(digits);
  else {
    const after = digits.length - lastSep - 1;
    const hasBoth = digits.includes('.') && digits.includes(',');
    const isDecimal = hasBoth || after !== 3;
    value = isDecimal ? Number(`${digits.slice(0, lastSep).replace(/[.,]/g, '')}.${digits.slice(lastSep + 1)}`) : Number(digits.replace(/[.,]/g, ''));
  }
  if (!Number.isFinite(value)) return 0;
  const m = Math.round(value * 1000);
  return negative ? -m : m;
}

/** Works out the file's date order from values that can only be read one way (e.g. 29/10 vs 10/29). */
export function detectDateFormat(dates: string[], fallback: DateFormat): DateFormat {
  let dmy = false;
  let mdy = false;
  for (const d of dates) {
    if (/^\d{4}[-/.]/.test(d)) return 'YMD';
    const [a, b] = d.split(/[-/.]/).map(Number);
    if (a > 12) dmy = true;
    if (b > 12) mdy = true;
  }
  if (dmy && !mdy) return 'DMY';
  if (mdy && !dmy) return 'MDY';
  return fallback;
}

function isoFrom(text: string, f: DateFormat): string | null {
  const parts = text.trim().split(/[-/.\s]/).filter(Boolean);
  if (parts.length !== 3) return null;
  let [y, m, d] = f === 'YMD' ? parts : f === 'DMY' ? [parts[2], parts[1], parts[0]] : [parts[2], parts[0], parts[1]];
  if (y.length === 2) y = `20${y}`;
  m = m.padStart(2, '0');
  d = d.padStart(2, '0');
  const iso = `${y}-${m}-${d}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso) ? iso : null;
}

/** "Oct 2026" → "2026-10" (also accepts "October 2026" and "2026-10"). */
function monthFrom(text: string): MonthKey | null {
  const t = text.trim();
  if (/^\d{4}-\d{2}$/.test(t)) return t;
  const match = /^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{4})$/.exec(t);
  if (!match) return null;
  const i = MONTHS.findIndex((m) => m.toLowerCase() === match[1].toLowerCase());
  return i < 0 ? null : `${match[2]}-${String(i + 1).padStart(2, '0')}`;
}

/** Untrusted text from the file: strip control characters and cap the length. */
const clip = (s: string, n: number) => sanitizeText(s, n) || '?';

export interface CsvImportOptions {
  name: string;
  currency: CurrencyFormat;
  /** Used when the dates in the file could be read either way */
  dateFormat: DateFormat;
  today: string;
}

/**
 * Turns Register.csv (required) and Plan.csv (optional) into a budget. Accounts are recreated with
 * their types inferred (credit cards from their payment categories, tracking accounts from uncategorized
 * starting balances), transfers are re-linked in pairs, and split lines are joined back together.
 */
export function importCsv(registerText: string, planText: string | null, opts: CsvImportOptions): BudgetData {
  const reg = records(registerText);
  const plan = planText ? records(planText) : [];
  if (!reg.length && !plan.length) throw new Error('That file has no transactions.');
  const dateFormat = detectDateFormat(
    reg.map((r) => r.Date).filter(Boolean),
    opts.dateFormat,
  );

  // Category groups and categories, in the file's order (Plan first, then anything only in the register).
  const groups: CategoryGroup[] = [];
  const categories: Category[] = [];
  const cardNames = new Set<string>();
  const catKey = (g: string, c: string) => `${g}\u0000${c}`;
  const catIds = new Map<string, string>();
  /** Where the Credit Card Payments group sits among the others in the file's order */
  let cardGroupAt = -1;
  const addCategory = (g: string, c: string) => {
    if (!g || !c || g === 'Inflow') return;
    if (g === 'Credit Card Payments') {
      if (cardGroupAt < 0) cardGroupAt = groups.length;
      cardNames.add(c);
      return;
    }
    if (catIds.has(catKey(g, c))) return;
    let group = groups.find((x) => x.name === g);
    if (!group) {
      group = { id: uid('g'), name: clip(g, 50), hidden: g === 'Hidden Categories', sort: groups.length };
      groups.push(group);
    }
    const id = uid('c');
    categories.push({ id, groupId: group.id, name: clip(c, 50), hidden: group.hidden, sort: categories.filter((x) => x.groupId === group!.id).length });
    catIds.set(catKey(g, c), id);
  };
  for (const r of plan) addCategory(r['Category Group'], r.Category);
  for (const r of reg) addCategory(r['Category Group'], r.Category);

  // Accounts.
  const accountNames: string[] = [];
  for (const r of reg) if (r.Account && !accountNames.includes(r.Account)) accountNames.push(r.Account);
  const rowsByAccount = new Map<string, Record<string, string>[]>();
  for (const r of reg) rowsByAccount.set(r.Account, [...(rowsByAccount.get(r.Account) ?? []), r]);
  const accounts: Account[] = accountNames.map((name, i) => {
    const rows = rowsByAccount.get(name) ?? [];
    const balance = rows.reduce((s, r) => s + parseAmountText(r.Inflow) - parseAmountText(r.Outflow), 0);
    const nonTransfer = rows.filter((r) => !TRANSFER.test(r.Payee));
    const tracking = nonTransfer.length > 0 && nonTransfer.every((r) => !r.Category);
    let type: AccountType;
    if (cardNames.has(name)) type = 'creditCard';
    else if (tracking) type = balance < 0 ? 'loan' : 'asset';
    else if (/cash|wallet/i.test(name)) type = 'cash';
    else if (/saving/i.test(name)) type = 'savings';
    else type = 'checking';
    return { id: uid('a'), name: clip(name, 50), type, onBudget: ACCOUNT_TYPE_INFO[type].onBudget, closed: false, sort: i };
  });
  const accountByName = new Map(accountNames.map((n, i) => [n, accounts[i]]));

  // Credit card payment categories, linked to their cards.
  const cards = accounts.filter((a) => isCreditType(a.type));
  if (cards.length) {
    const g: CategoryGroup = { id: uid('g'), name: 'Credit Card Payments', hidden: false, sort: -1, isCreditCardPayments: true };
    groups.splice(cardGroupAt < 0 ? 0 : cardGroupAt, 0, g);
    groups.forEach((x, i) => (x.sort = i));
    const order = [...cardNames];
    cards.forEach((a) => categories.push({ id: uid('c'), groupId: g.id, name: a.name, hidden: false, sort: Math.max(order.indexOf(a.name), 0), linkedAccountId: a.id }));
  }
  const cardCategory = new Map(categories.filter((x) => x.linkedAccountId).map((x) => [x.name, x.id]));

  // Payees.
  const payees: Payee[] = [];
  const payeeId = (name: string): string | null => {
    const n = clip(name.trim(), 100);
    if (!n || TRANSFER.test(n)) return null;
    let p = payees.find((x) => x.name.toLowerCase() === n.toLowerCase());
    if (!p) {
      p = { id: uid('p'), name: n };
      payees.push(p);
    }
    return p.id;
  };

  // Transactions (split lines joined back together).
  const txs: Transaction[] = [];
  const categoryFor = (r: Record<string, string>): string | null => {
    if (r['Category Group'] === 'Inflow') return RTA;
    if (r['Category Group'] === 'Credit Card Payments') return cardCategory.get(r.Category) ?? null;
    return catIds.get(catKey(r['Category Group'], r.Category)) ?? null;
  };
  for (let i = 0; i < reg.length; i++) {
    const r = reg[i];
    const acct = accountByName.get(r.Account);
    const date = isoFrom(r.Date, dateFormat);
    if (!acct || !date) continue;
    const flag = FLAGS.find((x) => x === r.Flag.toLowerCase());
    const cleared: ClearedStatus = /^reconciled$/i.test(r.Cleared) ? 'reconciled' : /^cleared$/i.test(r.Cleared) ? 'cleared' : 'uncleared';
    const transfer = TRANSFER.exec(r.Payee);
    const other = transfer ? accountByName.get(transfer[1].trim()) : undefined;
    const starting = r.Payee === 'Starting Balance';
    const split = SPLIT.exec(r.Memo);
    const base: Transaction = {
      id: uid('t'),
      accountId: acct.id,
      date,
      amount: 0,
      payeeId: starting ? payeeId('Starting Balance') : other ? null : payeeId(r.Payee),
      categoryId: null,
      cleared,
      approved: true,
      flag,
    };
    if (split) {
      // Gather this split's lines: same account, date and payee, numbered 1..n.
      const total = Number(split[2]);
      const lines = reg.slice(i, i + total).filter((x) => x.Account === r.Account && x.Date === r.Date && x.Payee === r.Payee && SPLIT.test(x.Memo));
      i += lines.length - 1;
      const subs = lines.map((x) => ({ id: uid('s'), categoryId: categoryFor(x), amount: parseAmountText(x.Inflow) - parseAmountText(x.Outflow), memo: x.Memo.replace(SPLIT, '') || undefined }));
      txs.push({ ...base, amount: subs.reduce((s, x) => s + x.amount, 0), subtransactions: subs });
      continue;
    }
    const amount = parseAmountText(r.Inflow) - parseAmountText(r.Outflow);
    // On a card, "Ready to Assign" rows (starting balance, balance adjustments) are existing debt
    // for the payment category, not as money taken from Ready to Assign. The app models that as a starting balance.
    const cardDebt = isCreditType(acct.type) && r['Category Group'] === 'Inflow';
    txs.push({
      ...base,
      amount,
      memo: r.Memo || undefined,
      categoryId: cardDebt || (starting && !acct.onBudget) || (other?.onBudget && acct.onBudget) || !acct.onBudget ? null : categoryFor(r),
      transferAccountId: other?.id,
      isStartingBalance: starting || cardDebt || undefined,
    });
  }

  // The register can list upcoming scheduled transactions (dated after the export). Keep them as scheduled
  // so they don't count until their date. Only the next date is exported, so they're set to happen once.
  const scheduled: ScheduledTransaction[] = [];
  for (let i = txs.length - 1; i >= 0; i--) {
    const t = txs[i];
    if (t.date <= opts.today || t.subtransactions || t.isStartingBalance) continue;
    txs.splice(i, 1);
    if (t.transferAccountId && t.amount > 0) continue; // the other side of a scheduled transfer
    scheduled.push({ id: uid('s'), accountId: t.accountId, nextDate: t.date, frequency: 'once', amount: t.amount, payeeId: t.payeeId, categoryId: t.categoryId, transferAccountId: t.transferAccountId, memo: t.memo, flag: t.flag });
  }

  // Link transfer pairs (the register lists both sides); create the other side if it's missing.
  const unmatched = txs.filter((t) => t.transferAccountId);
  const used = new Set<string>();
  for (const t of unmatched) {
    if (used.has(t.id)) continue;
    const mate = unmatched.find((u) => !used.has(u.id) && u.id !== t.id && u.accountId === t.transferAccountId && u.transferAccountId === t.accountId && u.amount === -t.amount && u.date === t.date);
    used.add(t.id);
    if (mate) {
      used.add(mate.id);
      t.transferTransactionId = mate.id;
      mate.transferTransactionId = t.id;
    } else {
      const id = uid('t');
      t.transferTransactionId = id;
      txs.push({ ...t, id, accountId: t.transferAccountId!, amount: -t.amount, transferAccountId: t.accountId, transferTransactionId: t.id, categoryId: null, memo: t.memo, flag: undefined });
    }
  }

  // Remember each payee's latest category, like the app does as you enter transactions.
  for (const t of [...txs].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const p = t.payeeId && payees.find((x) => x.id === t.payeeId);
    if (p && t.categoryId && !t.isStartingBalance) p.lastCategoryId = t.categoryId;
  }

  // Assigned amounts from Plan.csv.
  const assigned: Record<MonthKey, Record<string, number>> = {};
  for (const r of plan) {
    const m = monthFrom(r.Month);
    if (!m) continue;
    const id = r['Category Group'] === 'Credit Card Payments' ? cardCategory.get(r.Category) : catIds.get(catKey(r['Category Group'], r.Category));
    const amount = parseAmountText(r.Assigned ?? r.Budgeted ?? '');
    if (id && amount) (assigned[m] ??= {})[id] = amount;
  }

  const firstDate = txs.reduce((min, t) => (t.date < min ? t.date : min), opts.today);
  return {
    id: uid('b'),
    name: opts.name,
    createdAt: [firstDate, ...Object.keys(assigned).map((m) => `${m}-01`)].sort()[0],
    lastOpenedAt: new Date().toISOString(),
    settings: { currency: opts.currency, dateFormat },
    accounts,
    groups,
    categories,
    payees,
    transactions: txs,
    scheduled: scheduled.reverse(),
    assigned,
  };
}

/** "Plan Export - My Budget as of 2026-10-31 22-55" → "My Budget". */
export function budgetNameFromFile(fileName: string): string | null {
  const base = fileName.replace(/\.(zip|csv)$/i, '').replace(/ - (Plan|Register|Budget)$/i, '');
  const m = /^(?:.+? Export - )?(.+?) as of \d{4}-\d{2}-\d{2}/i.exec(base);
  return m ? m[1].trim() : null;
}


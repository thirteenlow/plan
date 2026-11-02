import { produce, type Draft } from 'immer';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { nextOccurrence } from '@/engine/scheduled';
import { encryptedStorage } from '@/security/encryptedStorage';
import { setActiveDateFormat, today } from '@/utils/date';
import { ACCOUNT_TYPE_INFO, isCreditType } from '@/utils/icons';
import { uid } from '@/utils/id';
import { CURRENCIES, DEFAULT_CURRENCY, NUMBER_FORMATS, setActiveCurrency } from '@/utils/money';
import { cleanSymbol, isPhotoId, isISODate, isSafeAmount, isValidBudget, LIMITS, sanitizeText } from '@/utils/validation';
import { buildBudget, type BudgetTemplate } from './seed';
import {
  RTA,
  type Account,
  type AccountType,
  type BudgetData,
  type BudgetSettings,
  type DateFormat,
  type SyncMeta,
  type Category,
  type ClearedStatus,
  type CurrencyFormat,
  type FlagColor,
  type ISODate,
  type Milli,
  type MonthKey,
  type ScheduledTransaction,
  type SubTransaction,
  type Target,
  type ThemePref,
  type Transaction,
} from './types';

export interface TxDraft {
  id?: string;
  accountId: string;
  date: ISODate;
  amount: Milli;
  payeeId?: string | null;
  payeeName?: string;
  transferAccountId?: string;
  categoryId: string | null;
  memo?: string;
  cleared?: ClearedStatus;
  flag?: FlagColor;
  subtransactions?: SubTransaction[];
  approved?: boolean;
  photoId?: string;
}

interface AppState {
  budgets: Record<string, BudgetData>;
  activeBudgetId: string | null;
  theme: ThemePref;
  hydrated: boolean;
  /** Shared-budget sync state, keyed by local budget id */
  sync: Record<string, SyncMeta>;
  setSync: (budgetId: string, meta: SyncMeta | null) => void;
  /** Writes a budget that came from the cloud (new or merged) without touching the active selection. */
  putBudget: (data: BudgetData, meta?: SyncMeta | null) => void;

  // budgets
  createBudget: (name: string, currency: CurrencyFormat, template: BudgetTemplate, dateFormat?: DateFormat) => string;
  switchBudget: (id: string) => void;
  renameBudget: (id: string, name: string) => void;
  deleteBudget: (id: string) => void;
  updateSettings: (patch: Partial<BudgetSettings>) => void;
  setTheme: (t: ThemePref) => void;

  // accounts
  addAccount: (input: { name: string; type: AccountType; balance: Milli; date: ISODate; note?: string }) => string;
  /** Changing `type` across kinds (cash, credit, tracking) also updates the account's history to match. */
  updateAccount: (id: string, patch: Partial<Pick<Account, 'name' | 'note' | 'type'>>) => void;
  /** Sets the working balance by adding an adjustment transaction for the difference. */
  adjustBalance: (id: string, working: Milli) => void;
  setAccountClosed: (id: string, closed: boolean) => void;
  deleteAccount: (id: string) => void;
  reconcileAccount: (id: string, statementCleared: Milli) => void;

  // transactions
  /** Saves into the active budget, or `budgetId` when given. */
  saveTransaction: (draft: TxDraft, budgetId?: string) => string;
  deleteTransaction: (id: string) => void;
  toggleCleared: (id: string) => void;
  approveTransactions: (ids: string[]) => void;
  setClearedMany: (ids: string[], cleared: boolean) => void;
  categorizeMany: (ids: string[], categoryId: string) => void;
  deleteTransactions: (ids: string[]) => void;
  setFlag: (id: string, flag?: FlagColor) => void;

  // payees
  ensurePayee: (name: string) => string | null;
  renamePayee: (id: string, name: string) => void;
  mergePayees: (fromIds: string[], intoId: string) => void;
  deletePayee: (id: string) => void;

  // categories
  addGroup: (name: string) => string;
  renameGroup: (id: string, name: string) => void;
  setGroupHidden: (id: string, hidden: boolean) => void;
  deleteGroup: (id: string) => boolean;
  /** Deletes a group and all its categories, moving their history to `replacementId` (or leaving it uncategorized). */
  deleteGroupWithCategories: (id: string, replacementId: string | null) => void;
  moveGroup: (id: string, dir: -1 | 1) => void;
  addCategory: (groupId: string, name: string) => string;
  updateCategory: (id: string, patch: Partial<Pick<Category, 'name' | 'note' | 'hidden' | 'groupId'>>) => void;
  moveCategory: (id: string, dir: -1 | 1) => void;
  deleteCategory: (id: string, replacementId?: string | null) => void;
  setTarget: (categoryId: string, target?: Target) => void;
  toggleSnooze: (categoryId: string, month: MonthKey) => void;

  // budgeting
  setAssigned: (month: MonthKey, categoryId: string, amount: Milli) => void;
  applyAssignments: (month: MonthKey, values: Record<string, Milli>) => void;
  moveMoney: (month: MonthKey, fromId: string, toId: string, amount: Milli) => void;

  // scheduled
  saveScheduled: (s: Omit<ScheduledTransaction, 'id'> & { id?: string }) => string;
  deleteScheduled: (id: string) => void;
  enterScheduledNow: (id: string) => void;
  processScheduled: () => number;

  // data
  /** Adds a budget from a file as a new budget (never overwrites). `name` replaces "<name> (imported)". */
  importBudget: (data: unknown, name?: string) => boolean;
}

const sortNext = (items: { sort: number }[]) => items.reduce((m, i) => Math.max(m, i.sort), -1) + 1;

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_FORMATS = ['DMY', 'MDY', 'YMD'];

/** Applies a budget's formats to the module-level formatters. */
function activateFormats(settings: BudgetSettings | undefined) {
  setActiveCurrency(settings?.currency ?? DEFAULT_CURRENCY);
  setActiveDateFormat(settings?.dateFormat ?? 'MDY');
}

/** Coerces a currency format into something the formatter and parser can always handle. */
export function normalizeCurrency(c: Partial<CurrencyFormat> | undefined): CurrencyFormat {
  const base = CURRENCIES.find((x) => x.code === c?.code) ?? DEFAULT_CURRENCY;
  const numberFormat = NUMBER_FORMATS.find((f) => f.group === c?.group && f.decimal === c?.decimal) ?? { group: base.group, decimal: base.decimal };
  const decimals = c?.decimals === 0 || c?.decimals === 2 || c?.decimals === 3 ? c.decimals : base.decimals;
  return {
    code: base.code,
    symbol: typeof c?.symbol === 'string' ? cleanSymbol(c.symbol) : base.symbol,
    decimals,
    symbolFirst: typeof c?.symbolFirst === 'boolean' ? c.symbolFirst : base.symbolFirst,
    showSymbol: c?.showSymbol !== false,
    ...numberFormat,
  };
}

/** Validates a transaction before it touches the store (defence in depth; the UI validates first). */
function isValidDraft(d: TxDraft): boolean {
  if (!isSafeAmount(d.amount) || !isISODate(d.date) || typeof d.accountId !== 'string') return false;
  if (d.subtransactions?.some((x) => !isSafeAmount(x.amount))) return false;
  if (d.subtransactions?.length && d.subtransactions.reduce((sum, x) => sum + x.amount, 0) !== d.amount) return false;
  return true;
}

function ensurePayee(b: Draft<BudgetData>, name: string | undefined): string | null {
  const trimmed = sanitizeText(name, LIMITS.payeeName);
  if (!trimmed) return null;
  const existing = b.payees.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing.id;
  const id = uid('p');
  b.payees.push({ id, name: trimmed });
  return id;
}

/** Removes a transaction and its transfer mirror. Returns the removed pair. */
function removeTx(b: Draft<BudgetData>, id: string) {
  const tx = b.transactions.find((t) => t.id === id);
  if (!tx) return { tx: undefined, mirror: undefined };
  const mirror = tx.transferTransactionId ? b.transactions.find((t) => t.id === tx.transferTransactionId) : undefined;
  const mirrorCopy = mirror ? { ...mirror } : undefined;
  const txCopy = { ...tx };
  b.transactions = b.transactions.filter((t) => t.id !== id && t.id !== mirror?.id);
  return { tx: txCopy, mirror: mirrorCopy };
}

/** Inserts a transaction (and transfer mirror). */
function insertTx(b: Draft<BudgetData>, d: TxDraft, id: string, mirrorCleared: ClearedStatus = 'uncleared', mirrorId?: string) {
  const acct = b.accounts.find((a) => a.id === d.accountId);
  if (!acct) return;
  const other = d.transferAccountId ? b.accounts.find((a) => a.id === d.transferAccountId) : undefined;
  const subs = d.subtransactions?.length ? d.subtransactions.map((s) => ({ ...s, id: s.id || uid('s') })) : undefined;

  let catHere: string | null = subs ? null : d.categoryId;
  let catThere: string | null = null;
  if (other) {
    if (acct.onBudget && other.onBudget) catHere = null;
    else if (!acct.onBudget && other.onBudget) {
      catThere = d.categoryId;
      catHere = null;
    } else if (!acct.onBudget && !other.onBudget) catHere = null;
  } else if (!acct.onBudget) {
    catHere = null;
  }

  const payeeId = other ? null : d.payeeId ?? ensurePayee(b, d.payeeName);
  const tx: Transaction = {
    id,
    accountId: acct.id,
    date: d.date,
    amount: d.amount,
    payeeId,
    categoryId: catHere,
    memo: sanitizeText(d.memo, LIMITS.memo) || undefined,
    cleared: d.cleared ?? 'uncleared',
    approved: d.approved ?? true,
    flag: d.flag,
    subtransactions: other ? undefined : subs,
    photoId: isPhotoId(d.photoId) ? d.photoId : undefined,
  };
  if (other) {
    const mid = mirrorId ?? uid('t');
    tx.transferAccountId = other.id;
    tx.transferTransactionId = mid;
    b.transactions.push({
      id: mid,
      accountId: other.id,
      date: d.date,
      amount: -d.amount,
      payeeId: null,
      categoryId: catThere,
      memo: tx.memo,
      cleared: mirrorCleared,
      approved: tx.approved,
      transferAccountId: acct.id,
      transferTransactionId: id,
    });
  }
  b.transactions.push(tx);

  if (payeeId) {
    const p = b.payees.find((x) => x.id === payeeId);
    if (p && catHere) p.lastCategoryId = catHere;
  }
}

/**
 * Switches an account to another type, keeping its history consistent with how the new type budgets:
 * credit accounts get (or lose) their payment category, and starting balances / balance adjustments move
 * between Ready to Assign (cash) and existing card debt (credit). Tracking accounts are left out of the
 * budget; their transactions keep their categories so switching back restores them.
 */
function changeAccountType(b: Draft<BudgetData>, acct: Draft<Account>, type: AccountType) {
  const next = ACCOUNT_TYPE_INFO[type];
  const wasCredit = isCreditType(acct.type);
  acct.type = type;
  acct.onBudget = next.onBudget;
  const credit = next.onBudget && next.credit;

  if (wasCredit && !credit) {
    const pay = b.categories.find((c) => c.linkedAccountId === acct.id);
    if (pay) {
      b.categories = b.categories.filter((c) => c.id !== pay.id);
      for (const m of Object.keys(b.assigned)) delete b.assigned[m][pay.id];
      for (const t of b.transactions) {
        if (t.categoryId === pay.id) t.categoryId = null;
        for (const s of t.subtransactions ?? []) if (s.categoryId === pay.id) s.categoryId = null;
      }
    }
  }
  if (credit && !b.categories.some((c) => c.linkedAccountId === acct.id)) addCreditPaymentCategory(b, acct);

  for (const t of b.transactions) {
    if (t.accountId !== acct.id || t.transferAccountId) continue;
    if (credit && t.isStartingBalance) t.categoryId = null;
    else if (next.onBudget && !credit && t.isStartingBalance) {
      // Card debt rows become ordinary money in or out of Ready to Assign.
      t.categoryId = RTA;
      if (t.payeeId && b.payees.find((p) => p.id === t.payeeId)?.name !== 'Starting Balance') t.isStartingBalance = undefined;
    }
  }
}

function addCreditPaymentCategory(b: Draft<BudgetData>, account: Account) {
  let group = b.groups.find((g) => g.isCreditCardPayments);
  if (!group) {
    group = { id: uid('g'), name: 'Credit Card Payments', hidden: false, sort: -1, isCreditCardPayments: true };
    b.groups.push(group);
  }
  b.categories.push({
    id: uid('c'),
    groupId: group.id,
    name: account.name,
    hidden: false,
    sort: sortNext(b.categories.filter((c) => c.groupId === group.id)),
    linkedAccountId: account.id,
  });
}

function scheduledToDraft(s: ScheduledTransaction, date: ISODate): TxDraft {
  return {
    accountId: s.accountId,
    date,
    amount: s.amount,
    payeeId: s.payeeId,
    transferAccountId: s.transferAccountId,
    categoryId: s.categoryId,
    memo: s.memo,
    flag: s.flag,
    approved: false,
  };
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => {
      /** Applies an immer recipe to the active budget. */
      /** Changes the active budget (or `budgetId`, for imports that belong to a particular budget). */
      const mutate = (recipe: (b: Draft<BudgetData>) => void, budgetId?: string) => {
        const { activeBudgetId, budgets } = get();
        const id = budgetId ?? activeBudgetId;
        if (!id || !budgets[id]) return;
        set({ budgets: { ...budgets, [id]: produce(budgets[id], recipe) } });
      };

      return {
        budgets: {},
        activeBudgetId: null,
        theme: 'system',
        hydrated: false,
        sync: {},
        setSync: (budgetId, meta) =>
          set((s) => {
            const sync = { ...s.sync };
            if (meta) sync[budgetId] = meta;
            else delete sync[budgetId];
            return { sync };
          }),
        putBudget: (data, meta) => {
          if (!isValidBudget(data)) return;
          const clean = { ...data, settings: { ...data.settings, currency: normalizeCurrency(data.settings.currency) } };
          set((s) => {
            const sync = { ...s.sync };
            if (meta) sync[data.id] = meta;
            else if (meta === null) delete sync[data.id];
            const activeBudgetId = s.activeBudgetId ?? data.id;
            return { budgets: { ...s.budgets, [data.id]: clean }, sync, activeBudgetId };
          });
          if (get().activeBudgetId === data.id) activateFormats(clean.settings);
        },

        createBudget: (name, currency, template, dateFormat) => {
          const data = buildBudget(sanitizeText(name, LIMITS.budgetName) || 'My Budget', normalizeCurrency(currency), template);
          if (dateFormat && DATE_FORMATS.includes(dateFormat)) data.settings.dateFormat = dateFormat;
          set((s) => ({ budgets: { ...s.budgets, [data.id]: data }, activeBudgetId: data.id }));
          activateFormats(data.settings);
          return data.id;
        },
        switchBudget: (id) => {
          const b = get().budgets[id];
          if (!b) return;
          activateFormats(b.settings);
          set((s) => ({
            activeBudgetId: id,
            budgets: { ...s.budgets, [id]: { ...b, lastOpenedAt: new Date().toISOString() } },
          }));
        },
        renameBudget: (id, name) => {
          const clean = sanitizeText(name, LIMITS.budgetName);
          if (clean) set((s) => (s.budgets[id] ? { budgets: { ...s.budgets, [id]: { ...s.budgets[id], name: clean } } } : s));
        },
        deleteBudget: (id) =>
          set((s) => {
            const budgets = { ...s.budgets };
            delete budgets[id];
            const sync = { ...s.sync };
            delete sync[id];
            const remaining = Object.values(budgets).sort((a, b) => (a.lastOpenedAt < b.lastOpenedAt ? 1 : -1));
            const activeBudgetId = s.activeBudgetId === id ? remaining[0]?.id ?? null : s.activeBudgetId;
            if (activeBudgetId) activateFormats(budgets[activeBudgetId].settings);
            return { budgets, activeBudgetId, sync };
          }),
        updateSettings: (patch) => {
          const clean: Partial<BudgetSettings> = { ...patch };
          if ('currency' in patch) clean.currency = normalizeCurrency(patch.currency);
          if ('dateFormat' in patch && !DATE_FORMATS.includes(patch.dateFormat as string)) delete clean.dateFormat;
          if ('ownerName' in patch) clean.ownerName = sanitizeText(patch.ownerName, LIMITS.ownerName) || undefined;
          mutate((b) => {
            Object.assign(b.settings, clean);
          });
          const b = get().activeBudgetId ? get().budgets[get().activeBudgetId!] : undefined;
          activateFormats(b?.settings);
        },
        setTheme: (theme) => set({ theme }),

        addAccount: ({ name, type, balance, date, note }) => {
          const cleanName = sanitizeText(name, LIMITS.accountName);
          if (!cleanName || !ACCOUNT_TYPE_INFO[type] || !isSafeAmount(balance) || !isISODate(date)) return '';
          const id = uid('a');
          mutate((b) => {
            const info = ACCOUNT_TYPE_INFO[type];
            const account: Account = { id, name: cleanName, type, onBudget: info.onBudget, closed: false, note: sanitizeText(note, LIMITS.note, true) || undefined, sort: sortNext(b.accounts) };
            b.accounts.push(account);
            if (isCreditType(type)) addCreditPaymentCategory(b, account);
            const credit = isCreditType(type);
            b.transactions.push({
              id: uid('t'),
              accountId: id,
              date,
              amount: balance,
              payeeId: ensurePayee(b, 'Starting Balance'),
              categoryId: info.onBudget && !credit ? RTA : null,
              cleared: 'cleared',
              approved: true,
              isStartingBalance: true,
            });
          });
          return id;
        },
        updateAccount: (id, patch) =>
          mutate((b) => {
            const a = b.accounts.find((x) => x.id === id);
            if (!a) return;
            if (patch.name !== undefined) {
              const name = sanitizeText(patch.name, LIMITS.accountName);
              if (name) a.name = name;
            }
            if (patch.note !== undefined) a.note = sanitizeText(patch.note, LIMITS.note, true) || undefined;
            if (patch.type && ACCOUNT_TYPE_INFO[patch.type] && patch.type !== a.type) changeAccountType(b, a, patch.type);
            const pc = b.categories.find((c) => c.linkedAccountId === id);
            if (pc) pc.name = a.name;
          }),
        setAccountClosed: (id, closed) =>
          mutate((b) => {
            const a = b.accounts.find((x) => x.id === id);
            if (a) a.closed = closed;
            const pc = b.categories.find((c) => c.linkedAccountId === id);
            if (pc) pc.hidden = closed;
          }),
        deleteAccount: (id) =>
          mutate((b) => {
            const own = new Set(b.transactions.filter((t) => t.accountId === id).map((t) => t.id));
            b.transactions = b.transactions.filter((t) => !own.has(t.id));
            for (const t of b.transactions) {
              if (t.transferAccountId === id) {
                delete t.transferAccountId;
                delete t.transferTransactionId;
                t.payeeId = ensurePayee(b, 'Deleted account transfer');
              }
            }
            b.accounts = b.accounts.filter((a) => a.id !== id);
            b.scheduled = b.scheduled.filter((s) => s.accountId !== id && s.transferAccountId !== id);
            const pc = b.categories.find((c) => c.linkedAccountId === id);
            if (pc) {
              b.categories = b.categories.filter((c) => c.id !== pc.id);
              for (const m of Object.keys(b.assigned)) delete b.assigned[m][pc.id];
            }
          }),
        adjustBalance: (id, working) =>
          isSafeAmount(working) &&
          mutate((b) => {
            const acct = b.accounts.find((a) => a.id === id);
            if (!acct) return;
            const diff = working - b.transactions.filter((t) => t.accountId === id).reduce((s, t) => s + t.amount, 0);
            if (diff === 0) return;
            const credit = isCreditType(acct.type);
            b.transactions.push({
              id: uid('t'),
              accountId: id,
              date: today(),
              amount: diff,
              payeeId: ensurePayee(b, 'Manual Balance Adjustment'),
              // Cash accounts: the difference goes to (or comes from) Ready to Assign. Cards: it's debt for the
              // payment category, like a starting balance. Tracking accounts: no category.
              categoryId: acct.onBudget && !credit ? RTA : null,
              isStartingBalance: credit || undefined,
              memo: 'Balance adjusted',
              cleared: 'cleared',
              approved: true,
            });
          }),
        reconcileAccount: (id, statementCleared) =>
          isSafeAmount(statementCleared) &&
          mutate((b) => {
            const acct = b.accounts.find((a) => a.id === id);
            if (!acct) return;
            const cleared = b.transactions.filter((t) => t.accountId === id && t.cleared !== 'uncleared').reduce((s, t) => s + t.amount, 0);
            const diff = statementCleared - cleared;
            if (diff !== 0) {
              b.transactions.push({
                id: uid('t'),
                accountId: id,
                date: today(),
                amount: diff,
                payeeId: ensurePayee(b, 'Reconciliation Balance Adjustment'),
                categoryId: acct.onBudget ? RTA : null,
                memo: 'Entered automatically by reconciliation',
                cleared: 'reconciled',
                approved: true,
              });
            }
            for (const t of b.transactions) if (t.accountId === id && t.cleared === 'cleared') t.cleared = 'reconciled';
            acct.lastReconciledAt = today();
          }),

        saveTransaction: (draft, budgetId) => {
          // Reject before touching anything, so an invalid edit never deletes the original.
          if (!isValidDraft(draft)) return draft.id ?? '';
          const id = draft.id ?? uid('t');
          mutate((b) => {
            let mirrorCleared: ClearedStatus = 'uncleared';
            let mirrorId: string | undefined;
            if (draft.id) {
              const { mirror } = removeTx(b, draft.id);
              if (mirror && mirror.accountId === draft.transferAccountId) {
                mirrorCleared = mirror.cleared;
                mirrorId = mirror.id;
              }
            }
            insertTx(b, draft, id, mirrorCleared, mirrorId);
          }, budgetId);
          return id;
        },
        deleteTransaction: (id) => mutate((b) => void removeTx(b, id)),
        toggleCleared: (id) =>
          mutate((b) => {
            const t = b.transactions.find((x) => x.id === id);
            if (!t || t.cleared === 'reconciled') return;
            t.cleared = t.cleared === 'cleared' ? 'uncleared' : 'cleared';
          }),
        approveTransactions: (ids) =>
          mutate((b) => {
            const set = new Set(ids);
            for (const t of b.transactions) if (set.has(t.id) || (t.transferTransactionId && set.has(t.transferTransactionId))) t.approved = true;
          }),
        setClearedMany: (ids, cleared) =>
          mutate((b) => {
            const set = new Set(ids);
            for (const t of b.transactions) if (set.has(t.id) && t.cleared !== 'reconciled') t.cleared = cleared ? 'cleared' : 'uncleared';
          }),
        categorizeMany: (ids, categoryId) =>
          mutate((b) => {
            const set = new Set(ids);
            const onBudget = new Set(b.accounts.filter((a) => a.onBudget).map((a) => a.id));
            for (const t of b.transactions) {
              // Splits and transfers between budget accounts keep their own categorisation.
              if (!set.has(t.id) || t.subtransactions?.length || !onBudget.has(t.accountId)) continue;
              if (t.transferAccountId && onBudget.has(t.transferAccountId)) continue;
              t.categoryId = categoryId;
              t.approved = true;
              // Remember it for the payee, like saving a transaction does, so its next payment is filed the same way.
              const p = t.payeeId ? b.payees.find((x) => x.id === t.payeeId) : undefined;
              if (p && !t.transferAccountId) p.lastCategoryId = categoryId;
            }
          }),
        deleteTransactions: (ids) =>
          mutate((b) => {
            for (const id of ids) removeTx(b, id);
          }),
        setFlag: (id, flag) =>
          mutate((b) => {
            const t = b.transactions.find((x) => x.id === id);
            if (t) t.flag = flag;
          }),

        ensurePayee: (name) => {
          let id: string | null = null;
          mutate((b) => {
            id = ensurePayee(b, name);
          });
          return id;
        },
        renamePayee: (id, name) =>
          mutate((b) => {
            const p = b.payees.find((x) => x.id === id);
            const clean = sanitizeText(name, LIMITS.payeeName);
            if (p && clean) p.name = clean;
          }),
        mergePayees: (fromIds, intoId) =>
          mutate((b) => {
            const from = new Set(fromIds.filter((f) => f !== intoId));
            for (const t of b.transactions) if (t.payeeId && from.has(t.payeeId)) t.payeeId = intoId;
            for (const s of b.scheduled) if (s.payeeId && from.has(s.payeeId)) s.payeeId = intoId;
            b.payees = b.payees.filter((p) => !from.has(p.id));
          }),
        deletePayee: (id) =>
          mutate((b) => {
            for (const t of b.transactions) if (t.payeeId === id) t.payeeId = null;
            for (const s of b.scheduled) if (s.payeeId === id) s.payeeId = null;
            b.payees = b.payees.filter((p) => p.id !== id);
          }),

        addGroup: (name) => {
          const clean = sanitizeText(name, LIMITS.groupName);
          if (!clean) return '';
          const id = uid('g');
          mutate((b) => {
            b.groups.push({ id, name: clean, hidden: false, sort: sortNext(b.groups) });
          });
          return id;
        },
        renameGroup: (id, name) =>
          mutate((b) => {
            const g = b.groups.find((x) => x.id === id);
            const clean = sanitizeText(name, LIMITS.groupName);
            if (g && clean) g.name = clean;
          }),
        setGroupHidden: (id, hidden) =>
          mutate((b) => {
            const g = b.groups.find((x) => x.id === id);
            if (g) g.hidden = hidden;
          }),
        deleteGroup: (id) => {
          const b = get().activeBudgetId ? get().budgets[get().activeBudgetId!] : undefined;
          if (!b || b.categories.some((c) => c.groupId === id)) return false;
          mutate((d) => {
            d.groups = d.groups.filter((g) => g.id !== id);
          });
          return true;
        },
        deleteGroupWithCategories: (id, replacementId) => {
          const b = get().activeBudgetId ? get().budgets[get().activeBudgetId!] : undefined;
          const group = b?.groups.find((g) => g.id === id);
          if (!b || !group || group.isCreditCardPayments) return;
          const replacement = replacementId && b.categories.some((c) => c.id === replacementId && c.groupId !== id) ? replacementId : null;
          for (const c of b.categories.filter((x) => x.groupId === id)) get().deleteCategory(c.id, replacement);
          mutate((d) => {
            d.groups = d.groups.filter((g) => g.id !== id);
            d.settings.pinnedCategoryIds = d.settings.pinnedCategoryIds?.filter((pid) => d.categories.some((c) => c.id === pid));
          });
        },
        moveGroup: (id, dir) =>
          mutate((b) => {
            const list = [...b.groups].sort((a, c) => a.sort - c.sort);
            const i = list.findIndex((g) => g.id === id);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= list.length) return;
            [list[i], list[j]] = [list[j], list[i]];
            list.forEach((g, idx) => (g.sort = idx));
          }),
        addCategory: (groupId, name) => {
          const clean = sanitizeText(name, LIMITS.categoryName);
          if (!clean) return '';
          const id = uid('c');
          mutate((b) => {
            if (!b.groups.some((g) => g.id === groupId)) return;
            b.categories.push({ id, groupId, name: clean, hidden: false, sort: sortNext(b.categories.filter((c) => c.groupId === groupId)) });
          });
          return id;
        },
        updateCategory: (id, patch) =>
          mutate((b) => {
            const c = b.categories.find((x) => x.id === id);
            if (!c) return;
            if (patch.groupId && patch.groupId !== c.groupId && b.groups.some((g) => g.id === patch.groupId)) {
              c.sort = sortNext(b.categories.filter((x) => x.groupId === patch.groupId));
              c.groupId = patch.groupId;
            }
            if (patch.name !== undefined) {
              const name = sanitizeText(patch.name, LIMITS.categoryName);
              if (name) c.name = name;
            }
            if (patch.note !== undefined) c.note = sanitizeText(patch.note, LIMITS.note, true) || undefined;
            if (typeof patch.hidden === 'boolean') c.hidden = patch.hidden;
          }),
        moveCategory: (id, dir) =>
          mutate((b) => {
            const cat = b.categories.find((c) => c.id === id);
            if (!cat) return;
            const list = b.categories.filter((c) => c.groupId === cat.groupId).sort((a, c) => a.sort - c.sort);
            const i = list.findIndex((c) => c.id === id);
            const j = i + dir;
            if (j < 0 || j >= list.length) return;
            [list[i], list[j]] = [list[j], list[i]];
            list.forEach((c, idx) => (c.sort = idx));
          }),
        deleteCategory: (id, replacementId = null) =>
          mutate((b) => {
            const replace = <T extends { categoryId: string | null }>(x: T) => {
              if (x.categoryId === id) x.categoryId = replacementId;
            };
            for (const t of b.transactions) {
              replace(t);
              t.subtransactions?.forEach(replace);
            }
            b.scheduled.forEach(replace);
            for (const m of Object.keys(b.assigned)) {
              const v = b.assigned[m][id];
              if (v && replacementId) b.assigned[m][replacementId] = (b.assigned[m][replacementId] ?? 0) + v;
              delete b.assigned[m][id];
            }
            for (const p of b.payees) if (p.lastCategoryId === id) p.lastCategoryId = replacementId;
            b.categories = b.categories.filter((c) => c.id !== id);
            if (b.settings.pinnedCategoryIds) b.settings.pinnedCategoryIds = b.settings.pinnedCategoryIds.filter((p) => p !== id);
            if (b.settings.currentGoalId === id) b.settings.currentGoalId = undefined;
          }),
        setTarget: (categoryId, target) =>
          (!target || (isSafeAmount(target.amount) && target.amount > 0 && (!target.dueDate || isISODate(target.dueDate)))) &&
          mutate((b) => {
            const c = b.categories.find((x) => x.id === categoryId);
            if (c) c.target = target;
          }),

        toggleSnooze: (categoryId, month) =>
          mutate((b) => {
            const c = b.categories.find((x) => x.id === categoryId);
            if (!c?.target) return;
            c.target.snoozedMonth = c.target.snoozedMonth === month ? undefined : month;
          }),
        setAssigned: (month, categoryId, amount) =>
          MONTH_KEY.test(month) &&
          isSafeAmount(amount) &&
          mutate((b) => {
            const row = (b.assigned[month] ??= {});
            if (amount === 0) delete row[categoryId];
            else row[categoryId] = amount;
          }),
        applyAssignments: (month, values) =>
          MONTH_KEY.test(month) &&
          mutate((b) => {
            const row = (b.assigned[month] ??= {});
            for (const [k, v] of Object.entries(values)) {
              if (!isSafeAmount(v)) continue;
              if (v === 0) delete row[k];
              else row[k] = v;
            }
          }),
        moveMoney: (month, fromId, toId, amount) =>
          MONTH_KEY.test(month) &&
          isSafeAmount(amount) &&
          amount > 0 &&
          fromId !== toId &&
          mutate((b) => {
            const row = (b.assigned[month] ??= {});
            if (fromId !== RTA) row[fromId] = (row[fromId] ?? 0) - amount;
            if (toId !== RTA) row[toId] = (row[toId] ?? 0) + amount;
          }),

        saveScheduled: (s) => {
          if (!isSafeAmount(s.amount) || !isISODate(s.nextDate)) return s.id ?? '';
          const id = s.id ?? uid('sc');
          mutate((b) => {
            const next = { ...s, id, memo: sanitizeText(s.memo, LIMITS.memo) || undefined } as ScheduledTransaction;
            const i = b.scheduled.findIndex((x) => x.id === id);
            if (i >= 0) b.scheduled[i] = next;
            else b.scheduled.push(next);
          });
          get().processScheduled();
          return id;
        },
        deleteScheduled: (id) =>
          mutate((b) => {
            b.scheduled = b.scheduled.filter((s) => s.id !== id);
          }),
        enterScheduledNow: (id) =>
          mutate((b) => {
            const s = b.scheduled.find((x) => x.id === id);
            if (!s) return;
            insertTx(b, { ...scheduledToDraft(s, today()), approved: true }, uid('t'));
            const next = nextOccurrence(s.nextDate, s.frequency);
            if (next) s.nextDate = next;
            else b.scheduled = b.scheduled.filter((x) => x.id !== id);
          }),
        processScheduled: () => {
          let created = 0;
          const t = today();
          const b = get().activeBudgetId ? get().budgets[get().activeBudgetId!] : undefined;
          if (!b || !b.scheduled.some((s) => s.nextDate <= t)) return 0;
          mutate((d) => {
            for (const s of [...d.scheduled]) {
              let guard = 0;
              let date: string | null = s.nextDate;
              while (date && date <= t && guard++ < 400) {
                insertTx(d, scheduledToDraft(s, date), uid('t'));
                created++;
                date = nextOccurrence(date, s.frequency);
              }
              if (!date) d.scheduled = d.scheduled.filter((x) => x.id !== s.id);
              else {
                const live = d.scheduled.find((x) => x.id === s.id);
                if (live) live.nextDate = date;
              }
            }
          });
          return created;
        },

        importBudget: (data, name) => {
          if (!isValidBudget(data)) return false;
          const copy: BudgetData = {
            ...data,
            id: uid('b'),
            name: sanitizeText(name, LIMITS.budgetName) || `${sanitizeText(data.name, LIMITS.budgetName - 11) || 'Budget'} (imported)`,
            lastOpenedAt: new Date().toISOString(),
            settings: { ...data.settings, currency: normalizeCurrency(data.settings.currency) },
          };
          set((s) => ({ budgets: { ...s.budgets, [copy.id]: copy }, activeBudgetId: copy.id }));
          activateFormats(copy.settings);
          return true;
        },
      };
    },
    {
      // Pre-rename key (the app was called Finch); kept so existing data still loads.
      name: 'finch-budget-v1',
      // Encrypted at rest with a key held in the Keychain / Keystore.
      storage: createJSONStorage(() => encryptedStorage),
      partialize: (s) => ({ budgets: s.budgets, activeBudgetId: s.activeBudgetId, theme: s.theme, sync: s.sync }),
      onRehydrateStorage: () => (state) => {
        // Drop anything corrupted in storage rather than crashing, and repair currency formats.
        const budgets: Record<string, BudgetData> = {};
        for (const [id, b] of Object.entries(state?.budgets ?? {})) {
          if (isValidBudget(b)) budgets[id] = { ...b, settings: { ...b.settings, currency: normalizeCurrency(b.settings.currency) } };
        }
        const activeBudgetId = state?.activeBudgetId && budgets[state.activeBudgetId] ? state.activeBudgetId : (Object.keys(budgets)[0] ?? null);
        activateFormats(activeBudgetId ? budgets[activeBudgetId].settings : undefined);
        const sync = Object.fromEntries(Object.entries(state?.sync ?? {}).filter(([id]) => budgets[id]));
        useStore.setState({ budgets, activeBudgetId, sync, hydrated: true });
      },
    },
  ),
);

/** The active budget. Components re-render when it changes. */
export function useBudgetData(): BudgetData | undefined {
  return useStore((s) => (s.activeBudgetId ? s.budgets[s.activeBudgetId] : undefined));
}

/** Stand-in used for the instant between deleting the last budget and leaving the screen. Never saved. */
const EMPTY_BUDGET: BudgetData = {
  id: '',
  name: '',
  createdAt: '2000-01-01',
  lastOpenedAt: '',
  settings: { currency: DEFAULT_CURRENCY, dateFormat: 'MDY' },
  accounts: [],
  groups: [],
  categories: [],
  payees: [],
  transactions: [],
  scheduled: [],
  assigned: {},
};

/**
 * The active budget for screens that need one. Falls back to an empty budget instead of crashing when the
 * budget disappears while a screen is still open (e.g. right after it was deleted).
 */
export function useActiveBudget(): BudgetData {
  return useBudgetData() ?? EMPTY_BUDGET;
}


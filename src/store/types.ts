// All money values are integers in milliunits (1.00 = 1000).
export type Milli = number;
/** YYYY-MM-DD */
export type ISODate = string;
/** YYYY-MM */
export type MonthKey = string;

export type AccountType =
  | 'checking'
  | 'savings'
  | 'cash'
  | 'creditCard'
  | 'lineOfCredit'
  | 'asset'
  | 'liability'
  | 'mortgage'
  | 'loan';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  onBudget: boolean;
  closed: boolean;
  note?: string;
  lastReconciledAt?: ISODate;
  sort: number;
}

export type ClearedStatus = 'uncleared' | 'cleared' | 'reconciled';
export type FlagColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';

/** Special category id for income: "Inflow: Ready to Assign". */
export const RTA = 'rta';

export interface SubTransaction {
  id: string;
  categoryId: string | null;
  amount: Milli;
  memo?: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  date: ISODate;
  amount: Milli; // + inflow, - outflow
  payeeId: string | null;
  categoryId: string | null; // RTA, a category id, or null (transfer / split / tracking)
  memo?: string;
  cleared: ClearedStatus;
  approved: boolean;
  flag?: FlagColor;
  transferAccountId?: string;
  transferTransactionId?: string;
  subtransactions?: SubTransaction[];
  isStartingBalance?: boolean;
  /** Receipt photo stored encrypted on this device (see utils/photos) */
  photoId?: string;
}

export type TargetKind = 'needed' | 'balance' | 'savings';
export type TargetCadence = 'weekly' | 'monthly' | 'yearly' | 'custom';

export interface Target {
  kind: TargetKind;
  amount: Milli;
  /** needed: how often the amount is needed */
  cadence?: TargetCadence;
  /**
   * needed: 'setAside' assigns the amount each period (custom: assign it in total by the due date),
   * 'refill' tops the balance up to it, 'balance' (custom) has that balance by the due date
   */
  behavior?: 'setAside' | 'refill' | 'balance';
  /** monthly: day of the month it's needed by, 1–31, or 0 for the last day */
  dayOfMonth?: number;
  /** weekly: 0 (Sun) - 6 (Sat) */
  weekday?: number;
  /** yearly / custom / balance-by-date */
  dueDate?: ISODate;
  /** custom: repeat every N months (0 = no repeat) */
  repeatMonths?: number;
  createdMonth: MonthKey;
  /** Month in which the target is snoozed (ignored for underfunded totals) */
  snoozedMonth?: MonthKey;
}

export interface CategoryGroup {
  id: string;
  name: string;
  hidden: boolean;
  sort: number;
  isCreditCardPayments?: boolean;
}

export interface Category {
  id: string;
  groupId: string;
  name: string;
  hidden: boolean;
  sort: number;
  note?: string;
  target?: Target;
  /** Credit card payment categories point to their card */
  linkedAccountId?: string;
}

export interface Payee {
  id: string;
  name: string;
  lastCategoryId?: string | null;
}

export type Frequency =
  | 'once'
  | 'daily'
  | 'weekly'
  | 'everyOtherWeek'
  | 'twiceAMonth'
  | 'every4Weeks'
  | 'monthly'
  | 'everyOtherMonth'
  | 'every3Months'
  | 'every4Months'
  | 'twiceAYear'
  | 'yearly'
  | 'everyOtherYear';

export interface ScheduledTransaction {
  id: string;
  accountId: string;
  nextDate: ISODate;
  frequency: Frequency;
  amount: Milli;
  payeeId: string | null;
  categoryId: string | null;
  transferAccountId?: string;
  memo?: string;
  flag?: FlagColor;
}

export interface CurrencyFormat {
  code: string;
  symbol: string;
  decimals: number;
  symbolFirst: boolean;
  group: string;
  decimal: string;
  /** false hides the symbol entirely */
  showSymbol?: boolean;
}

export type PetKind = 'cat' | 'dog' | 'bunny' | 'fox' | 'panda' | 'frog' | 'penguin' | 'hamster';

export interface BudgetSettings {
  currency: CurrencyFormat;
  dateFormat: DateFormat;
  /** Used to greet the user on Home */
  ownerName?: string;
  pinnedCategoryIds?: string[];
  currentGoalId?: string;
  /** Apple Pay auto-logging: account used when a Wallet card's name doesn't match an account */
  payAccountId?: string;
  /** Companion that roams the app and reacts to the budget (src/engine/pet.ts). Personal: not shared with budget members, but saved to the user's account (src/cloud/personal.ts). */
  pet?: { kind: PetKind; name: string; hidden?: boolean };
  /** Notification choices (src/notifications/reminders.ts). Personal, like pet. */
  reminders?: ReminderPrefs;
}

export interface ReminderPrefs {
  on: boolean;
  /** A notification the moment Apple Pay or a scan logs a payment (sent by the server, not scheduled) */
  logged?: boolean;
  daily: boolean;
  /** HH:MM, local time */
  dailyTime: string;
  bills: boolean;
  review: boolean;
  assign: boolean;
  overspent: boolean;
  recap: boolean;
  /** No notifications between quietStart and quietEnd (HH:MM, local; may wrap past midnight) */
  quiet: boolean;
  quietStart?: string;
  quietEnd?: string;
  /** Include amounts and names (off: generic text only) */
  details: boolean;
}

export interface BudgetData {
  id: string;
  name: string;
  createdAt: ISODate;
  lastOpenedAt: string;
  settings: BudgetSettings;
  accounts: Account[];
  groups: CategoryGroup[];
  categories: Category[];
  payees: Payee[];
  transactions: Transaction[];
  scheduled: ScheduledTransaction[];
  /** assigned[month][categoryId] */
  assigned: Record<MonthKey, Record<string, Milli>>;
}

export type DateFormat = 'DMY' | 'MDY' | 'YMD';

/** Cloud sync state for a shared budget (kept on this device only, encrypted at rest). */
export interface SyncMeta {
  remoteId: string;
  ownerId: string;
  role: 'owner' | 'editor';
  /** Last version this device has merged */
  version: number;
  keyVersion: number;
  /** Budget key (base64). Never leaves the device unencrypted. */
  key: string;
  /** The last synced shared snapshot, used as the common ancestor for three-way merges */
  base: Omit<BudgetData, 'lastOpenedAt'> | null;
}

export type ThemePref = 'system' | 'light' | 'dark';

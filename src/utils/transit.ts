import type { BudgetData, Milli, Transaction } from '@/store/types';

/*
 * Transit taps (SimplyGo and other open-loop transit). Tapping a card at a gate or on a bus runs the Apple Pay
 * Shortcut like any payment, but Wallet has no amount yet: the operator works out the fare and charges the card
 * later, often a day's trips at once. So instead of failing, the server keeps these as amount-less taps and the app
 * folds each day's taps into one estimated, unapproved transaction you correct once the real charge shows up.
 */

/** Fare per trip when the budget hasn't set one (in the budget's currency). */
export const DEFAULT_TRANSIT_FARE: Milli = 1_500;

/** Payee for taps that came without a merchant name. */
export const TRANSIT_PAYEE = 'Bus/MRT';

const MEMO = 'Transit taps:';

/** No non-zero digit in the amount: a transit tap (empty, "0", "$0.00"), not a payment. */
export const isTransitTap = (amount: string | null | undefined) => !/[1-9]/.test(amount ?? '');

/** Most trips are two taps (in and out), so taps / 2, rounded up so a lone tap still counts as a trip. */
export const tripsForTaps = (taps: number) => Math.ceil(Math.max(0, taps) / 2);

export const transitEstimate = (taps: number, fare: Milli) => tripsForTaps(taps) * Math.max(0, fare);

export const transitMemo = (taps: number, fareText: string) => {
  const trips = tripsForTaps(taps);
  return `${MEMO} ${taps} · about ${trips} ${trips === 1 ? 'trip' : 'trips'} at ${fareText} · estimate, fix once the fare is charged`;
};

/** How many taps an estimate memo records, or 0 when it isn't one. */
export const tapsInMemo = (memo: string | undefined) => Number(memo?.startsWith(MEMO) ? (memo.slice(MEMO.length).match(/^\s*(\d+)/)?.[1] ?? 0) : 0);

/** The day's estimate still waiting for review, to add more taps to instead of logging a second one. */
export function openTransitEstimate(data: BudgetData, accountId: string, date: string, payeeName: string): Transaction | undefined {
  const name = payeeName.toLowerCase();
  return data.transactions.find(
    (t) => t.accountId === accountId && t.date === date && !t.approved && tapsInMemo(t.memo) > 0 && data.payees.find((p) => p.id === t.payeeId)?.name.toLowerCase() === name,
  );
}

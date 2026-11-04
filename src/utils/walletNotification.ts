import { parseAmountText } from './budgetCsv';

/*
 * Android tap-to-pay: MacroDroid forwards the wallet's payment notification as it is, because it can't pick the
 * amount out on its own. It posts amount = the notification text, merchant = its title, and
 * card = "<app name>: <notification text>" (the full text, since amount is cut at 40 characters on the server).
 * Google Wallet reads like title "Starbucks", text "$4.50 with Visa •••• 1234"; Samsung Wallet is similar, and
 * some versions put the wallet's own name in the title and the merchant in the text ("… at STARBUCKS").
 */

/**
 * `note`: for apps other than a wallet, what the notification says besides the amount (e.g. a SimplyGo trip).
 * `kind`: 'in' for money coming in (a friend's transfer, a refund), 'skip' for nothing spent (a top-up, a declined
 * payment); left out for an ordinary payment.
 */
export type WalletPayment = { wallet: string; amount: number; merchant: string | null; card: string | null; note?: string; kind?: 'in' | 'skip' };

/** Money coming in: "Alex sent you $20", "You received S$20 from Alex", "Refund of $4.50", "$5 cashback credited". */
const INCOMING = /\b(?:sent you|paid you|transferred (?:to )?you|you(?:'ve| have)? received|received (?:S?\$|[A-Z]{3}|from)|refund(?:ed)?|cash ?back|credited|incoming)\b/i;
/** Nothing spent: moving your own money in (top-ups) or a payment that didn't go through. */
const NOT_SPENT = /\b(?:top[- ]?up|topped up|reload(?:ed)?|declined|failed|unsuccessful|not (?:approved|completed)|cancell?ed|reversed)\b/i;

function kindOf(text: string): WalletPayment['kind'] {
  if (NOT_SPENT.test(text)) return 'skip';
  if (INCOMING.test(text)) return 'in';
  return undefined;
}

/** Who sent the money: "Alex sent you…" / "…from Alex". */
function senderInText(text: string): string | null {
  const m = text.match(/^(.+?)\s+(?:sent|paid|transferred)\s+you\b/i) ?? text.match(/\bfrom\s+(.+?)(?:\s+(?:via|on|to|with)\b|[.,\n]|$)/i);
  return m?.[1].trim().slice(0, 60) || null;
}

const WALLET_NAME = /^(google wallet|google pay|g pay|wallet|samsung wallet|samsung pay|google play services)$/i;

/**
 * Splits "<app name>: <text>" when the text is the same notification that came in as the amount. The iOS 27
 * automation sends the notification's text as the amount (and sometimes card too), with the app as the merchant.
 */
function forwarded(amount: string | null, card: string | null, merchant: string | null) {
  const head = amount?.trim().slice(0, 20);
  if (!head) return null;
  // iOS 27 SimplyGo: just the notification as the amount and the app as the merchant (no card).
  if (!card?.trim()) return merchant?.trim() && (amount ?? '').trim().length >= 12 && /[a-z]{3}/i.test(head) && /\d[.,]\d/.test(amount ?? '') ? { wallet: merchant.trim(), text: amount!.trim() } : null;
  const m = card.match(/^([^:]{2,40}): ([\s\S]+)$/);
  if (m && m[2].trim().startsWith(head)) return { wallet: m[1].trim(), text: m[2].trim() };
  // Same text in both, with words in it (not just "4.50"): a whole notification.
  if (merchant?.trim() && /[a-z]{2}/i.test(head) && card.trim().startsWith(head)) return { wallet: merchant.trim(), text: card.trim() };
  return null;
}

/** The first money amount in the text: one with a currency mark or decimals, so "•••• 1234" isn't taken for it. */
export function amountInText(text: string): number {
  const num = String.raw`\d{1,3}(?:[.,\u00a0\u202f ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
  const before = String.raw`[$€£¥₹₩₱₫฿₪₺₦₽]|\b(?:[A-Z]{3}|Rp|RM|kr|zł|Fr)`;
  const after = String.raw`[$€£¥₹₩₱₫฿₪₺₦₽]|(?:[A-Z]{3}|kr|zł)\b`;
  const marked = text.match(new RegExp(`(?:${before})\\s?(${num})|(${num})\\s?(?:${after})`));
  const decimal = text.match(/(?:^|[^\d•*·])(\d{1,3}(?:[.,]\d{3})*[.,]\d{1,2}|\d+[.,]\d{1,2})(?!\d)/);
  const token = marked?.[1] ?? marked?.[2] ?? decimal?.[1];
  return token ? Math.abs(parseAmountText(token.replace(/[\u00a0\u202f ]/g, ''))) : 0;
}

/** "Visa •••• 1234" from "… with Visa •••• 1234", or the masked card wherever it is. */
function cardInText(text: string): string | null {
  const masked = text.match(/([A-Za-z][\w&' -]{0,30}?)\s*[•*·.]{2,}\s*(\d{4})/);
  if (masked) return `${masked[1].replace(/^.*\b(?:with|using|on|con|mit|avec|com|at)\s+/i, '').trim()} •••• ${masked[2]}`;
  const after = text.match(/\b(?:with|using|on|con|mit|avec|com)\s+(?:your\s+)?(?:card\s+)?([^.,\n]{2,40})/i);
  return after?.[1].trim() ?? null;
}

/** The merchant when the title is just the wallet's name: "… at STARBUCKS with …" / "Paid STARBUCKS". */
function merchantInText(text: string): string | null {
  const m = text.match(/\b(?:at|to|bei|chez|presso|en|em)\s+(.+?)(?:\s+(?:with|using|on|con|mit|avec|com)\b|[.,\n]|$)/i);
  return m?.[1].trim() || null;
}

/**
 * Reads a payment notification forwarded whole: Google or Samsung Wallet via MacroDroid, or any app's notification via
 * an iOS 27 notification automation sending the same fields. Null for anything else (Apple Pay taps, scans).
 */
export function readWalletPayment(row: { amount: string | null; merchant: string | null; card: string | null }): WalletPayment | null {
  const f = forwarded(row.amount, row.card, row.merchant);
  if (!f) return null;
  const p = readForwarded(f, row.merchant?.trim() ?? '');
  const kind = kindOf(`${row.merchant ?? ''} ${f.text}`);
  if (!kind) return p;
  // Money in: the sender (if named) rather than the wallet, and no SimplyGo-style memo trimming.
  return { ...p, kind, merchant: kind === 'in' ? (senderInText(f.text) ?? p.merchant) : p.merchant };
}

function readForwarded(f: { wallet: string; text: string }, title: string): WalletPayment {
  const other = !WALLET_NAME.test(f.wallet) && !/google|samsung|play services/i.test(f.wallet);
  if (other) {
    // Another app (SimplyGo: "Fare $0.20 - Bus 851 Dhoby Ghaut Stn Exit A - Opp Blk 3 - 2 Mar 09:15"). The automation
    // sends the app's name as the merchant; the rest of the text, minus "Fare $0.20 - ", goes in the memo.
    const masked = f.text.match(/([A-Za-z][\w&' -]{0,30}?)\s*[•*·.]{2,}\s*(\d{4})/);
    return {
      wallet: f.wallet,
      amount: amountInText(f.text),
      // A generic title ("Trip Fare Alert", from a macro that sends the title) isn't a merchant: use the app.
      merchant: title && !/\b(alert|notification|reminder|update|receipt)s?\b/i.test(title) ? title : f.wallet,
      card: masked ? cardInText(f.text) : null,
      note: f.text.replace(/^[^\n]*?\d[.,]\d{2}\s*[-–—·|:]\s*/, '').slice(0, 80) || undefined,
    };
  }
  const wallet = WALLET_NAME.test(f.wallet) && !/play services/i.test(f.wallet) ? f.wallet : /samsung/i.test(f.wallet) ? 'Samsung Wallet' : 'Google Wallet';
  return {
    wallet,
    amount: amountInText(f.text),
    merchant: title && !WALLET_NAME.test(title) ? title : merchantInText(f.text),
    card: cardInText(f.text),
  };
}

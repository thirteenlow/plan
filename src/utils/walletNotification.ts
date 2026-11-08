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
  // Words in lowercase mean a sentence, not an Apple Pay amount like "SGD 4.50".
  if (!card?.trim()) return merchant?.trim() && (amount ?? '').trim().length >= 10 && /[a-z]{3}/.test(amount ?? '') && /\s/.test(amount!.trim()) ? { wallet: merchant.trim(), text: amount!.trim() } : null;
  const m = card.match(/^([^:]{2,40}): ([\s\S]+)$/);
  // The text either starts with what came as the amount, or (iPhone Wallet: "Wallet: <shop>\n<amount>") contains it.
  if (m && (m[2].trim().startsWith(head) || m[2].includes(head))) return { wallet: m[1].trim(), text: m[2].trim() };
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

// ---------- Reading any payment text (alert emails, other apps' notifications) ----------
//
// How each part is decided, in order:
//   Amount: a labelled amount ("Amount paid", "Total amount", "Amount", "Total", "Transaction amount"…), preferring
//           the budget's own currency (Instarem: "Amount paid 18.9 SGD" over "Transaction amount 14 USD"); otherwise
//           the first amount in the budget's currency; otherwise the first amount with a currency.
//   Payee:  a labelled payee ("Merchant", "To", "Payee", "Recipient"…), without "(MOBILE ending 1234)"; otherwise
//           who a sentence says was paid ("at X", "to X", "paid X"); money in: who it came from.
//   Card:   a labelled payment method ("Payment source", "From", "Card"…) or a card/account mentioned
//           ("card *9012", "A/C ending 4321", "Visa •••• 1234"). The account is picked from it later (inbox.ts).
//   Kind:   money in ("sent you", "received", "refund", or sent to your own wallet), or nothing spent (top-ups,
//           declined), otherwise spending.

const LABELS = {
  amount: ['amount paid', 'total amount', 'amount charged', 'amount debited', 'debit amount', 'paid amount', 'amount', 'total', 'transaction amount'],
  payee: ['merchant name', 'merchant', 'paid to', 'payee', 'recipient', 'beneficiary', 'to'],
  method: ['payment source', 'payment method', 'paid with', 'paid from', 'debited from', 'card', 'from'],
  other: ['date & time', 'date, time', 'date and time', 'date', 'time', 'transaction ref', 'reference no', 'reference', 'ref', 'status', 'description', 'location'],
};
const ALL_LABELS = [...LABELS.amount, ...LABELS.payee, ...LABELS.method, ...LABELS.other].sort((x, y) => y.length - x.length);
const LABEL_RE = ALL_LABELS.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')).join('|');
/** Labels that are also everyday words: only trusted with a colon or on a line of their own. */
const COMMON = new Set(['to', 'from', 'paid', 'total', 'card', 'date', 'time', 'status', 'description', 'reference', 'ref', 'location', 'amount']);
/** Where a value runs into the email's closing text. */
const VALUE_END = /\s+(?:To view|If (?:you|unauthori[sz]ed)|Thank you|Please|Yours|Don'?t recogni[sz]e|Kindly)\b.*$/is;

const labelKey = (l: string) => l.toLowerCase().replace(/\s+/g, ' ');

/** "Label: value" pairs, whether on one line, a label on its own line with the value under it, or run together. */
export function labelledFields(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const set = (label: string, value: string | undefined) => {
    const k = labelKey(label);
    const v = (value ?? '').replace(VALUE_END, '').trim();
    if (v && !(k in out)) out[k] = v.slice(0, 120);
  };
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const alone = new RegExp(`^(${LABEL_RE})\\s*:?$`, 'i');
  const inline = new RegExp(`(?:^|\\s)(${LABEL_RE})\\s*:\\s*`, 'gi');
  const spaced = new RegExp(`^(${LABEL_RE})\\s+(.+)$`, 'i');
  const isLabel = (line: string | undefined) => !!line && (alone.test(line) || new RegExp(`^(${LABEL_RE})\\s*:`, 'i').test(line));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const own = line.match(alone);
    if (own) {
      if (!isLabel(lines[i + 1])) set(own[1], lines[++i]);
      continue;
    }
    const hits = [...line.matchAll(inline)];
    if (hits.length) {
      hits.forEach((h, k) => {
        const start = (h.index ?? 0) + h[0].length;
        const value = line.slice(start, hits[k + 1]?.index ?? line.length).trim();
        // "Amount:" at the end of a line, with the value on the next.
        if (!value && k === hits.length - 1 && !isLabel(lines[i + 1])) set(h[1], lines[++i]);
        else set(h[1], value);
      });
      continue;
    }
    // "Merchant Spotify" (a table without colons): only labels that aren't everyday words.
    const sp = line.match(spaced);
    if (sp && !COMMON.has(labelKey(sp[1]))) set(sp[1], sp[2]);
  }
  return out;
}

/** Currency marks and codes, to tell which amount is in the budget's own currency. Not time zones. */
const CUR = String.raw`S\$|US\$|A\$|HK\$|RM|Rp|[$€£¥₹₩₱₫฿]|\b(?!SGT|GMT|UTC|EST|PST|CET|JST|HKT|AEST)[A-Z]{3}\b`;
const NUM = String.raw`\d{1,3}(?:[,\u00a0\u202f ]\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?`;
const MARK_CODE: Record<string, string> = { 'S$': 'SGD', 'US$': 'USD', 'A$': 'AUD', 'HK$': 'HKD', RM: 'MYR', Rp: 'IDR', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR', '₩': 'KRW', '₱': 'PHP', '₫': 'VND', '฿': 'THB' };

export type Money = { amount: number; currency: string | null };

/** Every amount with a currency in the text, in order ("SGD3.5", "18.9 SGD", "S$4.50"). `$` alone has no code. */
export function amountsInText(text: string): Money[] {
  const re = new RegExp(`(?:(${CUR})\\s?(${NUM}))|(?:(${NUM})\\s?(${CUR}))`, 'g');
  const out: Money[] = [];
  for (const m of text.matchAll(re)) {
    const mark = m[1] ?? m[4];
    const amount = Math.abs(parseAmountText((m[2] ?? m[3]).replace(/[\u00a0\u202f ,]/g, '')));
    if (amount) out.push({ amount, currency: mark === '$' ? null : (MARK_CODE[mark] ?? mark.toUpperCase()) });
  }
  return out;
}

/** The amount to log: in the budget's currency if there is one (or a plain "$"), otherwise the first. */
function pickMoney(list: Money[], home?: string): Money | undefined {
  return list.find((m) => !!home && m.currency === home) ?? list.find((m) => m.currency === null) ?? list[0];
}

/** "JOXXX LIXXX (MOBILE ending 5678)" → "JOXXX LIXXX". */
const cleanName = (v: string) =>
  v
    .replace(/\s*\((?:mobile|a\/c|acct|account|card|nric|uen)[^)]*\)/gi, '')
    .replace(/\s+(?:via|using|on)\s+.*$/i, '')
    .trim()
    .slice(0, 60) || null;

/** A card or account mentioned anywhere: "card *9012", "A/C ending 4321", "Visa •••• 1234". */
function methodInText(text: string): string | null {
  const m = text.match(/\b(?:card|a\/c|acct|account)\s*(?:no\.?|number|ending(?:\s+in)?)?\s*[*xX•·.]*\s*\d{4}\b/i);
  return m ? m[0].trim() : (cardInText(text) ?? null);
}

/** Who a sentence says was paid: "at STARBUCKS", "to KOPI CORNER", "paid Grab". Names start with a capital. */
function payeeInSentence(text: string): string | null {
  const m = text.match(/\b(?:[Aa]t|[Tt]o|[Pp]aid)\s+(?!You\b|Your\b|The\b|This\b|Our\b|(?:S|US|A|HK)?\$|[A-Z]{2,3}\s?\d|\d)([A-Z0-9][^\n.,!?]{1,40}?)(?=\s+(?:on|using|with|via|for|from|was|has|is|and)\b|[.,!?\n]|$)/);
  return m ? cleanName(m[1]) : null;
}

/** Sent to your own wallet or account: money in. */
const OWN_ACCOUNT = /paylah!?\s*wallet|\b(?:your|my)\s+(?:account|card|wallet)\b/i;

export type TextRead = { amount: number; currency: string | null; merchant: string | null; card: string | null; kind?: 'in' | 'skip'; labelled: boolean };

/** Reads amount, payee, card and kind from any payment text (see the rules above). `home`: the budget's currency. */
export function readPaymentText(text: string, home?: string): TextRead {
  const f = labelledFields(text);
  const get = (labels: string[]) => labels.map((l) => f[l]).find(Boolean);
  // Amount: labelled ones first (in their order), preferring the budget's currency.
  const labelledMoney = LABELS.amount.flatMap((l) => (f[l] ? (amountsInText(f[l]).length ? amountsInText(f[l]) : amountInText(f[l]) ? [{ amount: amountInText(f[l]), currency: null }] : []) : []));
  const money = pickMoney(labelledMoney, home) ?? pickMoney(amountsInText(text), home);
  const amount = money?.amount ?? amountInText(text);
  const payeeRaw = get(LABELS.payee);
  const methodRaw = get(LABELS.method);
  const toSelf = !!payeeRaw && OWN_ACCOUNT.test(payeeRaw);
  const kind = kindOf(text) ?? (toSelf ? 'in' : undefined);
  const merchant =
    kind === 'in'
      ? toSelf
        ? (methodRaw ? cleanName(methodRaw) : null) ?? senderInText(text)
        : senderInText(text)
      : (payeeRaw ? cleanName(payeeRaw) : null) ?? payeeInSentence(text);
  // Money in: the card is where it arrived (your own), otherwise where it was paid from.
  const card = kind === 'in' && toSelf ? cleanName(payeeRaw!) : methodRaw ? methodRaw.slice(0, 60) : methodInText(text);
  return { amount, currency: money?.currency ?? null, merchant, card, ...(kind ? { kind } : {}), labelled: Object.keys(f).length > 0 };
}

/**
 * Reads a bank's alert email sent whole by an iPhone "When I receive an email" automation (DBS PayLah!, PayNow,
 * card alerts, Instarem…). `card`: what the automation sends as card (an account's name, which wins over the email's
 * own); `sourceName`: the Auto-log source, sent as merchant. Null when no amount can be found (the AI may read it).
 */
export function readAlertEmail(text: string, card: string | null, sourceName?: string | null, home?: string): WalletPayment | null {
  const r = readPaymentText(text, home);
  if (!r.amount) return null;
  return {
    // The Auto-log source's name, which the email automation sends as `merchant` (older setups send the email).
    wallet: sourceName && sourceName.trim().length <= 40 && !text.startsWith(sourceName.trim()) ? sourceName.trim() : /paylah/i.test(text) ? 'PayLah!' : 'Bank alert',
    amount: r.amount,
    merchant: r.merchant,
    card: card?.trim() || r.card,
    ...(r.kind ? { kind: r.kind } : {}),
  };
}

/**
 * Reads a payment notification forwarded whole: Google or Samsung Wallet via MacroDroid, or any app's notification via
 * an iOS 27 notification automation sending the same fields, or a bank's alert email (`details`, its full text).
 * Null for anything else (Apple Pay taps, scans). `home`: the budget's currency.
 */
export function readWalletPayment(row: { amount: string | null; merchant: string | null; card: string | null; details?: string | null }, home?: string): WalletPayment | null {
  if (row.details) {
    const email = readAlertEmail(row.details, row.card && row.card.length <= 60 && !row.details.startsWith(row.card.slice(0, 20)) ? row.card : null, row.merchant, home);
    if (email) return email;
  }
  const f = forwarded(row.amount, row.card, row.merchant);
  if (!f) return null;
  const p = readForwarded(f, row.merchant?.trim() ?? '', home);
  if (p.kind === 'skip') return p;
  const kind = kindOf(`${row.merchant ?? ''} ${f.text}`);
  if (!kind) return p;
  // Money in: the sender (if named) rather than the wallet, and no SimplyGo-style memo trimming.
  return { ...p, kind, merchant: kind === 'in' ? (senderInText(f.text) ?? p.merchant) : p.merchant };
}

/** Words that only a real payment (or money in) uses. */
const MONEY_MOVED = /\b(?:charged|paid|pay(?:ment|ing)|debited|deducted|spent|spend|purchase[ds]?|transaction|fare|sent|transferred|received|refund(?:ed)?|withdrawn|billed)\b/i;
/** Offers and rewards: amounts that weren't spent. */
const PROMO = /\b(?:\d+\s?%\s?off|off your|promo(?:tion)?s?|vouchers?|use code|discount|deals?|save up|up to|earn(?:ed)?|coins?|points|rewards?|\/hr|per hour|starting from|from just)\b/i;
/** Plain words for a payment, to tell an offer that mentions one ("Use code X on your next payment") from a payment. */
const STRONG = /\b(?:charged|debited|credited|cash ?back|refund(?:ed)?|deducted|you(?:'ve| have)? (?:paid|spent|sent|received)|sent you|paid you|fare|payment (?:of|to|made|successful|completed))\b/i;

/** Another app's notification that isn't a payment: no amount and no payment words, or an offer. */
export function notAPayment(text: string, amount: number): boolean {
  if (!amount) return !MONEY_MOVED.test(text);
  return PROMO.test(text) && !STRONG.test(text);
}

/** The shop in an iPhone Wallet message: the words before the amount ("TikTok\n$44.68" → "TikTok"). */
export function appleWalletShop(text: string): string | null {
  const amountAt = text.search(/(?:[A-Z]{3}\s?|[A-Z]?\$|[€£¥₹])\s?\d|\d[.,]\d{2}/);
  // Starts with the amount ("S$6.80 with DBS Visa"): the shop is the title instead.
  if (amountAt <= 0) return null;
  const before = text.slice(0, amountAt).replace(/[\s·|,:–—-]+$/, '').trim();
  return /[\p{L}]/u.test(before) && before.length <= 60 && !/^(you|paid|payment|purchase)\b/i.test(before) ? before : null;
}

function readForwarded(f: { wallet: string; text: string }, title: string, home?: string): WalletPayment {
  const other = !WALLET_NAME.test(f.wallet) && !/google|samsung|play services/i.test(f.wallet);
  if (other) {
    // Another app (SimplyGo: "Fare $0.20 - Bus 851 Dhoby Ghaut Stn Exit A - Opp Blk 3 - 2 Mar 09:15"; PayLah!: "You
    // have paid SGD 4.20 to KOPI CORNER"). Payee: a labelled or named one in the text, else the title unless it's
    // generic ("Trip Fare Alert") or the app's own name, else the app. The rest of the text goes in the memo.
    const r = readPaymentText(f.text, home);
    // Apps send all sorts ("Your order was delivered", "You earned 120 GrabCoins", "20% off, up to $5"): only
    // alerts that say money moved are payments.
    if (notAPayment(f.text, r.amount || amountInText(f.text))) return { wallet: f.wallet, amount: 0, merchant: null, card: null, kind: 'skip' };
    const generic = !title || /\b(alert|notification|reminder|update|receipt)s?\b/i.test(title) || title.toLowerCase() === f.wallet.toLowerCase();
    return {
      wallet: f.wallet,
      amount: r.amount || amountInText(f.text),
      merchant: r.merchant ?? (generic ? f.wallet : title),
      card: r.card,
      note: f.text.replace(/^[^\n]*?\d[.,]\d{2}\s*[-–—·|:]\s*/, '').slice(0, 80) || undefined,
    };
  }
  const wallet = WALLET_NAME.test(f.wallet) && !/play services/i.test(f.wallet) ? f.wallet : /samsung/i.test(f.wallet) ? 'Samsung Wallet' : 'Google Wallet';
  // iPhone Wallet (the shared shortcut sends it as "Wallet"): the title is the card's bank ("HSBC Bank Singapore
  // Limited") and the message is the shop, then the amount ("TikTok\n$44.68").
  if (f.wallet === 'Wallet') {
    // Wallet also posts boarding passes, transit cards and order updates: only ones with an amount are payments.
    if (!amountInText(f.text)) return { wallet, amount: 0, merchant: null, card: null, kind: 'skip' };
    const shop = appleWalletShop(f.text);
    if (shop) return { wallet, amount: amountInText(f.text), merchant: shop, card: title && !WALLET_NAME.test(title) ? title : cardInText(f.text) };
  }
  return {
    wallet,
    amount: amountInText(f.text),
    merchant: title && !WALLET_NAME.test(title) ? title : merchantInText(f.text),
    card: cardInText(f.text),
  };
}

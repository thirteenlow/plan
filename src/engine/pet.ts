/**
 * The companion's mood: a 0–100 score from how this month is going (overspending, Ready to Assign, spending
 * pace against usual, targets, card debt, buffer), plus the reasons behind it. Pure function over budget data.
 */
import { categoryMonth, computeBudget, getMonth } from '@/engine/budget';
import { budgetHealth, monthSnapshot, spendingPace } from '@/engine/insights';
import type { BudgetData, Milli, MonthKey, PetKind } from '@/store/types';

export type { PetKind };

export const PETS: { kind: PetKind; label: string; name: string }[] = [
  { kind: 'cat', label: 'Cat', name: 'Miso' },
  { kind: 'dog', label: 'Dog', name: 'Biscuit' },
  { kind: 'bunny', label: 'Bunny', name: 'Mochi' },
  { kind: 'fox', label: 'Fox', name: 'Penny' },
  { kind: 'panda', label: 'Panda', name: 'Bao' },
  { kind: 'frog', label: 'Frog', name: 'Kopi' },
  { kind: 'penguin', label: 'Penguin', name: 'Pip' },
  { kind: 'hamster', label: 'Hamster', name: 'Nugget' },
];

export const petInfo = (kind: PetKind) => PETS.find((p) => p.kind === kind) ?? PETS[0];

export type Mood = 'thriving' | 'happy' | 'okay' | 'worried' | 'stressed';

export const MOODS: Record<Mood, { label: string; line: string }> = {
  thriving: { label: 'Thriving', line: 'Best month ever!' },
  happy: { label: 'Happy', line: 'Things are looking good.' },
  okay: { label: 'Okay', line: 'Hanging in there.' },
  worried: { label: 'Worried', line: 'Hmm, keep an eye on things.' },
  stressed: { label: 'Stressed', line: 'Help! The budget needs you.' },
};

export interface MoodReason {
  tone: 'good' | 'bad';
  text: string;
}

export interface PetMood {
  mood: Mood;
  /** 0–100 */
  score: number;
  /** Most important first */
  reasons: MoodReason[];
}

const moodFor = (score: number): Mood => (score >= 85 ? 'thriving' : score >= 65 ? 'happy' : score >= 45 ? 'okay' : score >= 25 ? 'worried' : 'stressed');

export function petMood(data: BudgetData, month: MonthKey, todayISO: string, fmt: (m: Milli) => string): PetMood {
  if (!data.transactions.length) return { mood: 'happy', score: 70, reasons: [{ tone: 'good', text: 'Add a few transactions and I’ll react to how your month goes.' }] };

  const mb = getMonth(computeBudget(data, month), month);
  const health = budgetHealth(data, month);
  const pace = spendingPace(data, month, todayISO);
  const usual = monthSnapshot(data, month).usualSpending ?? (pace.previousTotal || null);
  // Each signal: score change and reason; |weight| orders the reasons.
  const signals: { delta: number; reason: MoodReason }[] = [];

  if (mb.readyToAssign < 0) signals.push({ delta: -25, reason: { tone: 'bad', text: `You’ve assigned ${fmt(-mb.readyToAssign)} more than you have.` } });

  if (mb.overspentCount > 0) {
    const worst = data.categories
      .map((c) => ({ name: c.name, over: -categoryMonth(mb, c.id).available }))
      .filter((c) => c.over > 0)
      .sort((a, b) => b.over - a.over)[0];
    const others = mb.overspentCount - 1;
    signals.push({
      delta: -Math.min(36, 12 * mb.overspentCount),
      reason: { tone: 'bad', text: worst ? `${worst.name} is overspent by ${fmt(worst.over)}${others > 0 ? ` (+${others} more)` : ''}.` : 'Some categories are overspent.' },
    });
  }

  if (health.cardUncovered > 0) signals.push({ delta: -15, reason: { tone: 'bad', text: `${fmt(health.cardUncovered)} of card debt isn’t covered yet.` } });

  const dayNow = pace.current.length;
  if (pace.projected != null && usual && dayNow >= 5) {
    const ratio = pace.projected / usual;
    const pct = Math.round(Math.abs(ratio - 1) * 100);
    if (ratio > 1.15) signals.push({ delta: ratio > 1.4 ? -22 : -14, reason: { tone: 'bad', text: `On pace to spend ${pct}% more than usual this month.` } });
    else if (ratio < 0.9) signals.push({ delta: ratio < 0.75 ? 14 : 9, reason: { tone: 'good', text: `Spending is ${pct}% below your usual pace.` } });
  }

  if (health.targetsTotal > 0) {
    const share = health.targetsFunded / health.targetsTotal;
    if (share >= 1) signals.push({ delta: 10, reason: { tone: 'good', text: 'Every target is funded this month.' } });
    else if (share < 0.5) signals.push({ delta: -8, reason: { tone: 'bad', text: `${health.targetsTotal - health.targetsFunded} targets still need money.` } });
  }

  if (health.bufferMonths != null && health.bufferMonths >= 1) signals.push({ delta: 8, reason: { tone: 'good', text: `You have ${health.bufferMonths >= 2 ? `${Math.floor(health.bufferMonths)} months` : 'a month'} of spending saved.` } });

  if (mb.readyToAssign === 0 && mb.overspentCount === 0) signals.push({ delta: 6, reason: { tone: 'good', text: 'Every dollar has a job.' } });

  const score = Math.max(0, Math.min(100, signals.reduce((s, x) => s + x.delta, 70)));
  const reasons = signals.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).map((s) => s.reason);
  return { mood: moodFor(score), score, reasons: reasons.length ? reasons : [{ tone: 'good', text: 'Nothing to worry about right now.' }] };
}

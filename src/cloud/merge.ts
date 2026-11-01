import type { BudgetData } from '@/store/types';

/** Fields that belong to each person rather than the shared budget (never uploaded). */
export type SharedBudget = Omit<BudgetData, 'lastOpenedAt'>;

export function sharedPart(b: BudgetData): SharedBudget {
  const { lastOpenedAt: _l, ...rest } = b;
  const { ownerName: _o, pinnedCategoryIds: _p, currentGoalId: _g, ...settings } = b.settings;
  return { ...rest, settings };
}

/** Re-attaches this device's personal fields to a shared budget coming from the server. */
export function withPersonal(shared: SharedBudget, local: BudgetData | undefined): BudgetData {
  return {
    ...shared,
    lastOpenedAt: local?.lastOpenedAt ?? new Date().toISOString(),
    settings: {
      ...shared.settings,
      ownerName: local?.settings.ownerName,
      pinnedCategoryIds: local?.settings.pinnedCategoryIds,
      currentGoalId: local?.settings.currentGoalId,
    },
  };
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Three-way pick for one value: whichever side changed since `base` wins; if both changed, `local` wins. */
function pick<T>(base: T | undefined, local: T | undefined, remote: T | undefined): T | undefined {
  if (deepEqual(local, base)) return remote;
  if (deepEqual(remote, base)) return local;
  return local;
}

function mergeById<T extends { id: string }>(base: T[], local: T[], remote: T[]): T[] {
  const b = new Map(base.map((x) => [x.id, x]));
  const l = new Map(local.map((x) => [x.id, x]));
  const r = new Map(remote.map((x) => [x.id, x]));
  const ids = [...r.keys(), ...[...l.keys()].filter((id) => !r.has(id))];
  const out: T[] = [];
  for (const id of ids) {
    const v = pick(b.get(id), l.get(id), r.get(id));
    if (v) out.push(v);
  }
  return out;
}

function mergeAssigned(base: SharedBudget['assigned'], local: SharedBudget['assigned'], remote: SharedBudget['assigned']) {
  const months = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  const out: SharedBudget['assigned'] = {};
  for (const m of months) {
    const cats = new Set([...Object.keys(base[m] ?? {}), ...Object.keys(local[m] ?? {}), ...Object.keys(remote[m] ?? {})]);
    const row: Record<string, number> = {};
    for (const c of cats) {
      const v = pick(base[m]?.[c], local[m]?.[c], remote[m]?.[c]);
      if (v) row[c] = v;
    }
    if (Object.keys(row).length) out[m] = row;
  }
  return out;
}

/**
 * Merges concurrent edits item by item (accounts, categories, transactions, assigned amounts…).
 * Edits to different items are both kept; deletions are respected; if both sides changed the same
 * item, this device's version wins.
 */
export function mergeBudgets(base: SharedBudget, local: SharedBudget, remote: SharedBudget): SharedBudget {
  return {
    id: local.id,
    name: pick(base.name, local.name, remote.name)!,
    createdAt: pick(base.createdAt, local.createdAt, remote.createdAt)!,
    settings: {
      currency: pick(base.settings.currency, local.settings.currency, remote.settings.currency)!,
      dateFormat: pick(base.settings.dateFormat, local.settings.dateFormat, remote.settings.dateFormat)!,
    },
    accounts: mergeById(base.accounts, local.accounts, remote.accounts),
    groups: mergeById(base.groups, local.groups, remote.groups),
    categories: mergeById(base.categories, local.categories, remote.categories),
    payees: mergeById(base.payees, local.payees, remote.payees),
    transactions: mergeById(base.transactions, local.transactions, remote.transactions),
    scheduled: mergeById(base.scheduled, local.scheduled, remote.scheduled),
    assigned: mergeAssigned(base.assigned, local.assigned, remote.assigned),
  };
}

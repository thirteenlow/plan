import { historyItems, historySummary, periodFor } from '@/engine/history';
import { $, LAST_MONTH, makeBudget, THIS_MONTH, tx } from '../helpers/budget';

describe('history of a category or payee', () => {
  const d = makeBudget();
  d.payees.push({ id: 'ntuc', name: 'NTUC' }, { id: 'kopi', name: 'Kopi King' });
  tx(d, { date: `${THIS_MONTH}-03`, amount: -$(40), payeeId: 'ntuc', categoryId: 'groceries' });
  tx(d, { date: `${LAST_MONTH}-20`, amount: -$(60), payeeId: 'ntuc', subtransactions: [{ id: 's1', categoryId: 'groceries', amount: -$(45) }, { id: 's2', categoryId: 'dining', amount: -$(15) }], categoryId: null });
  tx(d, { date: `${THIS_MONTH}-05`, amount: -$(4.5), payeeId: 'kopi', categoryId: 'dining' });
  tx(d, { date: `${THIS_MONTH}-06`, amount: $(5), payeeId: 'ntuc', categoryId: 'groceries' });
  tx(d, { date: '2025-01-10', amount: -$(30), payeeId: 'ntuc', categoryId: 'groceries' });

  it('lists a category’s transactions, counting only its part of a split, newest first', () => {
    const items = historyItems(d, { categoryId: 'groceries' });
    expect(items.map((i) => i.amount)).toEqual([$(5), -$(40), -$(45), -$(30)]);
  });

  it('adds up the range, by month, with the top payees', () => {
    const of = { categoryId: 'groceries' };
    const s = historySummary(historyItems(d, of), of, periodFor('3m', THIS_MONTH), THIS_MONTH);
    expect(s).toMatchObject({ spent: $(85), received: $(5), count: 3, months: 2, perMonth: Math.round($(85) / 2) });
    expect(s.byMonth.map((g) => [g.month, g.net])).toEqual([
      [THIS_MONTH, -$(35)],
      [LAST_MONTH, -$(45)],
    ]);
    expect(s.top).toEqual([{ id: 'ntuc', amount: $(85) }]);
    expect(historySummary(historyItems(d, of), of, periodFor('all', THIS_MONTH), THIS_MONTH).count).toBe(4);
  });

  it('lists a payee’s transactions with the categories they’re filed under', () => {
    const of = { payeeId: 'ntuc' };
    const s = historySummary(historyItems(d, of), of, periodFor('12m', THIS_MONTH), THIS_MONTH);
    expect(s.count).toBe(3);
    expect(s.top).toEqual([{ id: 'groceries', amount: $(40) }]);
  });

  it('shows one month, or the dates picked', () => {
    const of = { categoryId: 'groceries' };
    const items = historyItems(d, of);
    expect(historySummary(items, of, periodFor('month', THIS_MONTH, LAST_MONTH), THIS_MONTH)).toMatchObject({ spent: $(45), count: 1 });
    expect(historySummary(items, of, periodFor('custom', THIS_MONTH, undefined, { from: '2025-01-01', to: `${LAST_MONTH}-31` }), THIS_MONTH)).toMatchObject({ spent: $(75), count: 2 });
  });
});

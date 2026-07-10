import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryCall = { sql: string; params: readonly unknown[] };

const withOrgContextMock = vi.hoisted(() => vi.fn());
const queryMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: withOrgContextMock,
}));

const { listWhereUsed } = await import('../where-used/_actions/list-where-used');
const { listPortfolioCost } = await import('../cost/portfolio/_actions/list-portfolio-cost');

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function calls(): QueryCall[] {
  return queryMock.mock.calls.map(([sql, params]) => ({ sql, params: params ?? [] }));
}

describe('technical where-used and portfolio cost read actions', () => {
  beforeEach(() => {
    queryMock.mockReset();
    withOrgContextMock.mockReset();
    withOrgContextMock.mockImplementation(async (callback: (ctx: unknown) => Promise<unknown>) =>
      callback({
        userId: '11111111-1111-4111-8111-111111111111',
        orgId: '22222222-2222-4222-8222-222222222222',
        client: { query: queryMock },
      }),
    );
  });

  it('lists one-level where-used rows with the mirrored BOM aliases and org-scoped predicate', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          fg_code: 'FG-1001',
          fg_name: 'Cooked sausage',
          component_qty: '2.500000',
          component_uom: 'kg',
        },
      ],
    });

    const result = await listWhereUsed(' RM-2001 ');

    expect(result).toEqual([
      {
        fg_code: 'FG-1001',
        fg_name: 'Cooked sausage',
        component_qty: 2.5,
        component_uom: 'kg',
      },
    ]);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(calls()[0]?.params).toEqual(['RM-2001']);
    const sql = normalize(calls()[0]!.sql);
    expect(sql).toContain('from public.bom_lines bl');
    expect(sql).toContain('join public.bom_headers ph');
    expect(sql).toContain('left join public.items i');
    expect(sql).toContain('i.item_code as fg_code');
    expect(sql).toContain('i.name as fg_name');
    expect(sql).toContain('bl.quantity::text as component_qty');
    expect(sql).toContain('bl.uom as component_uom');
    expect(sql).toContain('bl.org_id = app.current_org_id()');
    expect(sql).toContain('bl.component_code = $1');
    expect(sql).toContain("ph.status = 'active'");
    expect(sql).toContain('ph.item_id <> ( select id from public.items where org_id = app.current_org_id() and item_code = $1 )');
  });

  it('filters where-used to active BOM headers only (N-46)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await listWhereUsed('RM-2001');
    const sql = normalize(calls()[0]!.sql);
    expect(sql).toContain("ph.status = 'active'");
  });

  it('returns an empty where-used list for blank input without querying', async () => {
    await expect(listWhereUsed('   ')).resolves.toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('lists portfolio cost rows for FG items using the recipe-cost line roll-up', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          fg_code: 'FG-1001',
          fg_name: 'Cooked sausage',
          total_recipe_cost: '12.3456',
          currency: 'PLN',
        },
        {
          fg_code: 'FG-1002',
          fg_name: null,
          total_recipe_cost: null,
          currency: 'PLN',
        },
      ],
    });

    const result = await listPortfolioCost();

    expect(result).toEqual([
      {
        fg_code: 'FG-1001',
        fg_name: 'Cooked sausage',
        total_recipe_cost: '12.3456',
        currency: 'PLN',
      },
      {
        fg_code: 'FG-1002',
        fg_name: '',
        total_recipe_cost: null,
        currency: 'PLN',
      },
    ]);
    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = normalize(calls()[0]!.sql);
    expect(sql).toContain('from public.bom_headers bh');
    expect(sql).toContain('from public.bom_lines bl');
    expect(sql).toContain('left join public.items ci');
    expect(sql).toContain('from public.items i');
    expect(sql).toContain('i.item_code as fg_code');
    expect(sql).toContain('i.name as fg_name');
    expect(sql).toContain('when count(distinct vec.currency) > 1 then null');
    expect(sql).toContain("then 'mixed_currency'");
    expect(sql).toContain('left join public.v_item_effective_cost vec on vec.item_id = ci.id');
    expect(sql).toContain("i.item_type = 'fg'");
    expect(sql).toContain('i.org_id = app.current_org_id()');
    expect(sql).toContain('bl.org_id = app.current_org_id()');
    expect(sql).toContain('bl.item_id is not null and ci.id = bl.item_id');
    expect(sql).toContain('bl.item_id is null and ci.item_code = bl.component_code');
  });

  it('preserves exact decimal portfolio totals without a Number() round-trip (N-57)', async () => {
    const exactTotal = '9007199254740991.05';
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          fg_code: 'FG-PREC',
          fg_name: 'Precision FG',
          total_recipe_cost: exactTotal,
          currency: 'GBP',
        },
      ],
    });

    const result = await listPortfolioCost();

    expect(result[0]?.total_recipe_cost).toBe(exactTotal);
    expect(result[0]?.total_recipe_cost).not.toBe(Number(exactTotal));
  });

  it('returns null portfolio totals when FG recipe components mix currencies', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          fg_code: 'FG-MIX',
          fg_name: 'Mixed basket',
          total_recipe_cost: null,
          currency: 'mixed_currency',
        },
      ],
    });

    const result = await listPortfolioCost();

    expect(result).toEqual([
      {
        fg_code: 'FG-MIX',
        fg_name: 'Mixed basket',
        total_recipe_cost: null,
        currency: 'mixed_currency',
      },
    ]);
  });

  it('logs and returns empty rows when a read action fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    queryMock.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(listPortfolioCost()).resolves.toEqual([]);

    expect(errorSpy).toHaveBeenCalledWith(
      '[technical/cost/portfolio] listPortfolioCost load_failed',
      { err: 'database unavailable' },
    );
    errorSpy.mockRestore();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryCall = { sql: string; params: readonly unknown[] };

const withOrgContextMock = vi.hoisted(() => vi.fn());
const queryMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: withOrgContextMock,
}));

const { getRecipeCost } = await import('../_actions/list-recipe-cost');

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function calls(): QueryCall[] {
  return queryMock.mock.calls.map(([sql, params]) => ({ sql, params: params ?? [] }));
}

describe('technical recipe cost read action', () => {
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

  it('suppresses the recipe total when component currencies differ (no bogus cross-currency sum)', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            product_code: 'FG-1001',
            name: 'Cooked sausage',
            bom_version: 4,
            bom_status: 'active',
            yield_pct: '96.500',
            total_material_cost: null,
            currency: 'mixed_currency',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            component_code: 'RM-2001',
            component_name: 'Pork trim',
            component_type: 'rm',
            quantity: '2.500000',
            uom: 'kg',
            unit_cost: '4.2500',
            line_cost: '10.6250000000',
            currency: 'GBP',
          },
          {
            component_code: 'RM-2002',
            component_name: 'Seasoning',
            component_type: 'ingredient',
            quantity: '0.250000',
            uom: 'kg',
            unit_cost: '5.0000',
            line_cost: '1.2500000000',
            currency: 'EUR',
          },
        ],
      });

    const result = await getRecipeCost('FG-1001');

    expect(result).toEqual({
      ok: true,
      state: 'ready',
      cost: {
        productCode: 'FG-1001',
        name: 'Cooked sausage',
        bomVersion: 4,
        bomStatus: 'active',
        yieldPct: '96.500',
        totalMaterialCost: null,
        currency: 'mixed_currency',
        lines: [
          {
            componentCode: 'RM-2001',
            componentName: 'Pork trim',
            componentType: 'rm',
            quantity: '2.500000',
            uom: 'kg',
            unitCost: '4.2500',
            lineCost: '10.6250000000',
            currency: 'GBP',
          },
          {
            componentCode: 'RM-2002',
            componentName: 'Seasoning',
            componentType: 'ingredient',
            quantity: '0.250000',
            uom: 'kg',
            unitCost: '5.0000',
            lineCost: '1.2500000000',
            currency: 'EUR',
          },
        ],
      },
    });
    const headerSql = normalize(calls()[0]!.sql);
    expect(headerSql).toContain('when count(distinct vec.currency) > 1 then null');
    expect(headerSql).toContain("then 'mixed_currency'");
    expect(headerSql).not.toContain("then 'mixed'");
  });

  it('rolls up recipe cost from the effective-cost view when all line currencies match', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            product_code: 'FG-1001',
            name: 'Cooked sausage',
            bom_version: 4,
            bom_status: 'active',
            yield_pct: '96.500',
            total_material_cost: '11.8750',
            currency: 'GBP',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            component_code: 'RM-2001',
            component_name: 'Pork trim',
            component_type: 'rm',
            quantity: '2.500000',
            uom: 'kg',
            unit_cost: '4.2500',
            line_cost: '10.6250000000',
            currency: 'GBP',
          },
          {
            component_code: 'RM-2002',
            component_name: 'Seasoning',
            component_type: 'ingredient',
            quantity: '0.250000',
            uom: 'kg',
            unit_cost: '5.0000',
            line_cost: '1.2500000000',
            currency: 'GBP',
          },
        ],
      });

    const result = await getRecipeCost(' FG-1001 ');

    expect(result).toEqual({
      ok: true,
      state: 'ready',
      cost: {
        productCode: 'FG-1001',
        name: 'Cooked sausage',
        bomVersion: 4,
        bomStatus: 'active',
        yieldPct: '96.500',
        totalMaterialCost: '11.8750',
        currency: 'GBP',
        lines: [
          {
            componentCode: 'RM-2001',
            componentName: 'Pork trim',
            componentType: 'rm',
            quantity: '2.500000',
            uom: 'kg',
            unitCost: '4.2500',
            lineCost: '10.6250000000',
            currency: 'GBP',
          },
          {
            componentCode: 'RM-2002',
            componentName: 'Seasoning',
            componentType: 'ingredient',
            quantity: '0.250000',
            uom: 'kg',
            unitCost: '5.0000',
            lineCost: '1.2500000000',
            currency: 'GBP',
          },
        ],
      },
    });
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(calls()[0]?.params).toEqual(['FG-1001']);
    expect(calls()[1]?.params).toEqual(['33333333-3333-4333-8333-333333333333']);
    const headerSql = normalize(calls()[0]!.sql);
    expect(headerSql).toContain('when count(distinct vec.currency) > 1 then null');
    expect(headerSql).not.toContain('ci.cost_per_kg');
    expect(headerSql).toContain('left join public.v_item_effective_cost vec on vec.item_id = ci.id');
    expect(headerSql).not.toContain("case when count(distinct vec.currency) > 1 then 'mixed'");
    const lineSql = normalize(calls()[1]!.sql);
    expect(lineSql).toContain('vec.currency as currency');
    expect(lineSql).toContain('left join public.v_item_effective_cost vec on vec.item_id = ci.id');
  });

  it('returns the none-currency empty state when no BOM header exists', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const result = await getRecipeCost('FG-MISSING');

    expect(result).toEqual({
      ok: true,
      state: 'empty',
      cost: {
        productCode: 'FG-MISSING',
        name: null,
        bomVersion: 0,
        bomStatus: 'none',
        yieldPct: '100.000',
        totalMaterialCost: null,
        currency: 'none',
        lines: [],
      },
    });
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(calls()[0]?.params).toEqual(['FG-MISSING']);
  });
});

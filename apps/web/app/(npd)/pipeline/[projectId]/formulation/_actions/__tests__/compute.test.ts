import { beforeEach, describe, expect, it, vi } from 'vitest';

// ───────────────────────────────────────────────────────────────────────────
// Run the Server Actions with a fake in-transaction pg client — no DB required.
// (The REAL DB-backed integration proof lives in recompute.integration.test.ts.)
// ───────────────────────────────────────────────────────────────────────────
const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

type FakeCtx = {
  userId: string;
  orgId: string;
  sessionToken: string;
  client: { query: typeof queryMock };
};

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: (action: (ctx: FakeCtx) => unknown) =>
    action({ userId: 'user-1', orgId: 'org-1', sessionToken: 'tok-1', client: { query: queryMock } }),
}));

import { recomputeAndCache } from '../recompute';
import { compareVersions } from '../compare-versions';

beforeEach(() => {
  queryMock.mockReset();
});

// ───────────────────────────────────────────────────────────────────────────
// compareVersions Server Action (AC#3): v1 (5 ingredients) vs v2 (6 ingredients)
// → 5 unchanged + 1 ADDED with correct delta.
//
// Query order now: (1) assert A exists, (2) assert B exists, (3) load A rows,
// (4) load B rows. Diff identity is `sequence`, not rm_code.
// ───────────────────────────────────────────────────────────────────────────
describe('compareVersions Server Action', () => {
  function fiveIngredients() {
    return [
      { sequence: 1, rm_code: 'RM-1', pct: '40.000', qty_kg: '40', cost_per_kg_eur: '3.50' },
      { sequence: 2, rm_code: 'RM-2', pct: '25.000', qty_kg: '25', cost_per_kg_eur: '5.00' },
      { sequence: 3, rm_code: 'RM-3', pct: '20.000', qty_kg: '20', cost_per_kg_eur: '1.00' },
      { sequence: 4, rm_code: 'RM-4', pct: '10.000', qty_kg: '10', cost_per_kg_eur: '8.00' },
      { sequence: 5, rm_code: 'RM-5', pct: '5.000', qty_kg: '5', cost_per_kg_eur: '2.00' },
    ];
  }

  // Existence checks pass, then version A + version B rows.
  function mockCompare(v1: unknown[], v2: unknown[]) {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'ver-a' }] }) // assert A exists
      .mockResolvedValueOnce({ rows: [{ id: 'ver-b' }] }) // assert B exists
      .mockResolvedValueOnce({ rows: v1 }) // load A
      .mockResolvedValueOnce({ rows: v2 }); // load B
  }

  it('returns 5 unchanged + 1 ADDED row when v2 adds one ingredient', async () => {
    const v1 = fiveIngredients();
    const v2 = [
      ...fiveIngredients(),
      { sequence: 6, rm_code: 'RM-6', pct: '1.000', qty_kg: '1', cost_per_kg_eur: '9.99' },
    ];
    mockCompare(v1, v2);

    const result = await compareVersions({
      projectId: 'proj-1',
      versionAId: 'ver-a',
      versionBId: 'ver-b',
    });

    expect(result.unchanged).toBe(5);
    expect(result.added).toBe(1);
    expect(result.removed).toBe(0);
    expect(result.changed).toBe(0);

    const addedRow = result.rows.find((r) => r.status === 'ADDED');
    expect(addedRow?.rmCode).toBe('RM-6');
    expect(addedRow?.sequence).toBe(6);
    expect(addedRow?.a).toBeNull();
    expect(addedRow?.b).toEqual({
      rmCode: 'RM-6',
      pct: '1.000',
      qtyKg: '1',
      costPerKgEur: '9.99',
    });
  });

  it('flags a CHANGED row with per-field deltas when a pct changes', async () => {
    const v1 = fiveIngredients();
    const v2 = fiveIngredients();
    v2[0] = { ...v2[0], pct: '38.000' };
    mockCompare(v1, v2);

    const result = await compareVersions({
      projectId: 'proj-1',
      versionAId: 'ver-a',
      versionBId: 'ver-b',
    });

    expect(result.changed).toBe(1);
    expect(result.unchanged).toBe(4);
    const changedRow = result.rows.find((r) => r.status === 'CHANGED');
    expect(changedRow?.rmCode).toBe('RM-1');
    expect(changedRow?.changed.pct).toBe(true);
    expect(changedRow?.changed.costPerKgEur).toBe(false);
  });

  it('throws not-found when a version is missing / wrong project (no empty diff)', async () => {
    // First existence check returns no row → must throw, not treat as empty.
    queryMock.mockResolvedValueOnce({ rows: [] });
    await expect(
      compareVersions({ projectId: 'proj-1', versionAId: 'ver-a', versionBId: 'ver-b' }),
    ).rejects.toThrow(/not found/);
  });

  it('does no writes — compare is read-only', async () => {
    mockCompare([], []);
    await compareVersions({ projectId: 'proj-1', versionAId: 'ver-a', versionBId: 'ver-b' });
    for (const call of queryMock.mock.calls) {
      expect(String(call[0]).toLowerCase()).not.toMatch(/insert|update|delete/);
    }
  });

  it('validates input and rejects a missing version id', async () => {
    await expect(
      compareVersions({ projectId: 'proj-1', versionAId: '', versionBId: 'ver-b' }),
    ).rejects.toThrow();
    expect(queryMock).not.toHaveBeenCalled();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// recomputeAndCache Server Action: invokes the pure compute + writes the
// formulation_calc_cache row. Query order: (1) version meta, (2) ingredients,
// (3) Reference.RawMaterials nutrition, (4) cache upsert.
// ───────────────────────────────────────────────────────────────────────────
describe('recomputeAndCache Server Action', () => {
  it('cascades WIP nutrition and allergens into a parent formulation', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ batch_size_kg: '1', pack_weight_g: '1000', target_price_eur: null, target_yield_pct: '100' }] })
      .mockResolvedValueOnce({ rows: [{ rm_code: 'WIP-WHEAT', qty_kg: '0.5', pct: '50', cost_per_kg_eur: '1', allergens_inherited: [] }] })
      .mockResolvedValueOnce({ rows: [] }) // WIP has no RawMaterials row
      .mockResolvedValueOnce({ rows: [{ item_code: 'WIP-WHEAT', id: 'wip-item-id' }] })
      .mockResolvedValueOnce({ rows: [{ component_code: 'RM-WHEAT-FLOUR', quantity: '100' }] })
      .mockResolvedValueOnce({ rows: [{ rm_code: 'RM-WHEAT-FLOUR', nutrition_per_100g: { energy_kj: '1523', protein_g: '10.3' }, allergens_inherited: ['gluten'] }] })
      .mockResolvedValueOnce({ rows: [] }); // cache upsert

    const result = await recomputeAndCache({ projectId: 'proj-1', versionId: 'ver-1' });

    expect(result.nutrition).toEqual({ energy_kj: '761.50', protein_g: '5.15' });
    expect(result.allergens).toEqual(['gluten']);
  });

  it('cascades WIP nutrition from its active definition when no active BOM has lines', async () => {
    queryMock.mockImplementation(async (sql: string, params: readonly unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
      if (normalized.includes('from formulation_versions')) {
        return { rows: [{ batch_size_kg: '1', pack_weight_g: '1000', target_price_eur: null, target_yield_pct: '100' }] };
      }
      if (normalized.includes('from formulation_ingredients')) {
        return { rows: [{ rm_code: 'WIP-DEFINITION-ONLY', qty_kg: '1', pct: '100', cost_per_kg_eur: '1', allergens_inherited: [] }] };
      }
      if (normalized.includes('from "reference"."rawmaterials"')) {
        const codes = params[0] as string[];
        return {
          rows: [
            { rm_code: 'ING-FLOUR', nutrition_per_100g: { energy_kj: '100' }, allergens_inherited: ['gluten'] },
            { rm_code: 'ING-SUGAR', nutrition_per_100g: { energy_kj: '200' }, allergens_inherited: [] },
            { rm_code: 'RM-BUTTER', nutrition_per_100g: { energy_kj: '500' }, allergens_inherited: ['milk'] },
          ].filter((row) => codes.includes(row.rm_code)),
        };
      }
      if (normalized.includes('from public.items') && !normalized.includes('wip_definition_ingredients')) {
        return { rows: [{ item_code: 'WIP-DEFINITION-ONLY', id: 'wip-item-id' }] };
      }
      if (normalized.includes('wip_definition_ingredients')) {
        return {
          rows: [
            { component_code: 'ING-FLOUR', quantity: '0.70' },
            { component_code: 'ING-SUGAR', quantity: '0.10' },
            { component_code: 'RM-BUTTER', quantity: '0.20' },
          ],
        };
      }
      return { rows: [] };
    });

    const result = await recomputeAndCache({ projectId: 'proj-1', versionId: 'ver-1' });

    expect(result.nutrition.energy_kj).toBe('190.00');
  });

  it('computes from version ingredients and upserts formulation_calc_cache', async () => {
    // Costing v2: a 1 kg pack with 0.5 kg of each RM. rawCostPerPack =
    // 0.5×2 + 0.5×4 = 3.00; rawCost/kg = 3.00 / 1 kg = 3.0000.
    const ingredients = [
      { rm_code: 'RM-1', qty_kg: '0.500', pct: '50.000', cost_per_kg_eur: '2.00', allergens_inherited: ['milk'] },
      { rm_code: 'RM-2', qty_kg: '0.500', pct: '50.000', cost_per_kg_eur: '4.00', allergens_inherited: ['soya'] },
    ];
    const versionMeta = [{ batch_size_kg: '100', pack_weight_g: '1000', target_price_eur: '2.00', target_yield_pct: '95' }];
    const nutrition = [
      { rm_code: 'RM-1', nutrition_per_100g: { protein_g: '20', energy_kj: '400' } },
      { rm_code: 'RM-2', nutrition_per_100g: { protein_g: '10', energy_kj: '200' } },
    ];

    queryMock
      .mockResolvedValueOnce({ rows: versionMeta }) // meta
      .mockResolvedValueOnce({ rows: ingredients }) // ingredients
      .mockResolvedValueOnce({ rows: nutrition }) // Reference.RawMaterials
      .mockResolvedValueOnce({ rows: [] }); // cache upsert

    const result = await recomputeAndCache({ projectId: 'proj-1', versionId: 'ver-1' });

    expect(result.totalPct).toBe('100.000');
    expect(result.totalPctValid).toBe(true);
    expect(result.rawCost).toBe('3.0000');
    expect(result.allergens).toEqual(['milk', 'soya']);
    // weighted sum: 0.5*20 + 0.5*10 = 15.00 protein; 0.5*400 + 0.5*200 = 300.00
    expect(result.nutrition.protein_g).toBe('15.00');
    expect(result.nutrition.energy_kj).toBe('300.00');

    // Last query is the cache upsert and writes a NON-EMPTY nutrition_json.
    const lastCall = queryMock.mock.calls.at(-1);
    const upsertSql = lastCall?.[0] as string;
    expect(upsertSql.toLowerCase()).toContain('formulation_calc_cache');
    expect(upsertSql.toLowerCase()).toMatch(/insert|on conflict/);
    const nutritionJsonParam = (lastCall?.[1] as unknown[])[2] as string;
    expect(JSON.parse(nutritionJsonParam)).toEqual({ energy_kj: '300.00', protein_g: '15.00' });
  });

  it('degrades to empty nutrition when Reference.RawMaterials is absent', async () => {
    // Costing v2: a 1 kg pack of one RM at €2/kg → rawCostPerPack = 2.00;
    // rawCost/kg = 2.00 / 1 kg = 2.0000.
    const ingredients = [
      { rm_code: 'RM-1', qty_kg: '1.000', pct: '100.000', cost_per_kg_eur: '2.00', allergens_inherited: [] },
    ];
    const versionMeta = [{ batch_size_kg: '100', pack_weight_g: '1000', target_price_eur: '2.00', target_yield_pct: '95' }];
    const undefinedTable = Object.assign(new Error('relation does not exist'), { code: '42P01' });

    queryMock
      .mockResolvedValueOnce({ rows: versionMeta })
      .mockResolvedValueOnce({ rows: ingredients })
      .mockRejectedValueOnce(undefinedTable) // Reference.RawMaterials missing
      .mockResolvedValueOnce({ rows: [] }); // cache upsert still runs

    const result = await recomputeAndCache({ projectId: 'proj-1', versionId: 'ver-1' });
    expect(result.nutrition).toEqual({});
    // cost path unaffected
    expect(result.rawCost).toBe('2.0000');
  });

  it('rejects an invalid (empty) versionId before touching the DB', async () => {
    await expect(recomputeAndCache({ projectId: 'proj-1', versionId: '' })).rejects.toThrow();
    expect(queryMock).not.toHaveBeenCalled();
  });
});

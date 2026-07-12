import { beforeEach, describe, expect, it, vi } from 'vitest';

const cacheUpserts: Array<{ sql: string; params: unknown[] }> = [];

type MockConfig = {
  nutritionSourceAvailable: boolean;
  ingredientAllergens: string[];
};

let mockConfig: MockConfig = {
  nutritionSourceAvailable: true,
  ingredientAllergens: [],
};

vi.mock('zod', () => {
  const chain = {
    min: () => chain,
    parse: (value: unknown) => value,
  };
  return {
    z: {
      object: () => ({ parse: (value: unknown) => value }),
      string: () => chain,
    },
  };
});

vi.mock('@monopilot/domain', () => ({
  Dec: {
    from: (value: string) => ({
      div: () => ({ isZero: () => false, toFixed: () => '0.100000' }),
    }),
  },
  recomputeCalc: () => ({
    totalPct: '100',
    totalPctValid: true,
    totalQtyKg: '50',
    qtyBalanceValid: true,
    qtyBalanceUnset: false,
    allRmHaveCost: true,
    rawCostPerPack: '100',
    rawCost: '100',
    yieldedCost: '100',
    processing: null,
    packaging: null,
    costPerKg: '2',
    revenuePerKg: '2',
    marginPct: '0',
    nutrition: {},
    allergens: mockConfig.ingredientAllergens,
  }),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { client: { query: typeof queryMock } }) => Promise<unknown>) =>
    action({ client: { query: queryMock } }),
  ),
}));

const queryMock = vi.fn(async (sql: string, params: unknown[] = []) => {
  const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();
  if (norm.includes('from formulation_versions fv')) {
    return {
      rows: [{
        batch_size_kg: '100',
        target_price_eur: '2',
        target_yield_pct: '95',
        processing_overhead_pct: '0',
        pack_weight_g: null,
      }],
    };
  }
  if (norm.includes('from formulation_ingredients fi')) {
    return {
      rows: [{
        rm_code: 'RM-A',
        qty_kg: '50',
        pct: '100',
        cost_per_kg_eur: '2',
        allergens_inherited: mockConfig.ingredientAllergens,
      }],
    };
  }
  if (norm.includes('from "reference"."rawmaterials"')) {
    if (!mockConfig.nutritionSourceAvailable) {
      const err = Object.assign(new Error('relation does not exist'), { code: '42P01' });
      throw err;
    }
    return { rows: [] };
  }
  if (norm.startsWith('insert into formulation_calc_cache')) {
    cacheUpserts.push({ sql, params });
    return { rows: [], rowCount: 1 };
  }
  return { rows: [] };
});

/** Mirrors the ON CONFLICT nutrition_json CASE from recompute.ts. */
function resolveUpsertedNutrition(
  existingNutrition: Record<string, unknown>,
  excludedNutritionJson: string,
  nutritionSourceAvailable: boolean,
): Record<string, unknown> {
  const excluded = JSON.parse(excludedNutritionJson) as Record<string, unknown>;
  if (!nutritionSourceAvailable && Object.keys(excluded).length === 0) {
    return existingNutrition;
  }
  return excluded;
}

describe('recomputeAndCache — formulation_calc_cache upsert semantics (C1c)', () => {
  beforeEach(() => {
    cacheUpserts.length = 0;
    queryMock.mockClear();
    mockConfig = {
      nutritionSourceAvailable: true,
      ingredientAllergens: [],
    };
  });

  it('(a) preserves nutrition_json when RM nutrition source is unavailable', async () => {
    mockConfig.nutritionSourceAvailable = false;
    const { recomputeAndCache } = await import('../recompute');

    await recomputeAndCache({ projectId: 'project-1', versionId: 'version-1' });

    const upsert = cacheUpserts[0]!;
    expect(upsert.sql).toContain('when not $5::boolean');
    expect(upsert.sql).not.toContain('allergen_json = case');
    expect(upsert.params[2]).toBe('{}');
    expect(upsert.params[4]).toBe(false);

    const existing = { energy_kcal: '120' };
    expect(resolveUpsertedNutrition(existing, upsert.params[2] as string, false)).toEqual(existing);
  });

  it('(b) overwrites nutrition_json to empty when source was available', async () => {
    mockConfig.nutritionSourceAvailable = true;
    const { recomputeAndCache } = await import('../recompute');

    await recomputeAndCache({ projectId: 'project-1', versionId: 'version-1' });

    const upsert = cacheUpserts[0]!;
    expect(upsert.params[2]).toBe('{}');
    expect(upsert.params[4]).toBe(true);
    expect(resolveUpsertedNutrition({ energy_kcal: '120' }, upsert.params[2] as string, true)).toEqual({});
  });

  it('(c) overwrites allergen_json when allergens are cleared (never preserved)', async () => {
    mockConfig.ingredientAllergens = [];
    const { recomputeAndCache } = await import('../recompute');

    await recomputeAndCache({ projectId: 'project-1', versionId: 'version-1' });

    const upsert = cacheUpserts[0]!;
    expect(upsert.sql).toContain('allergen_json = excluded.allergen_json');
    expect(upsert.sql).not.toContain('formulation_calc_cache.allergen_json');
    expect(upsert.params[3]).toBe('{"allergens":[]}');
  });

  it('(d) always updates cost_json from excluded', async () => {
    const { recomputeAndCache } = await import('../recompute');

    await recomputeAndCache({ projectId: 'project-1', versionId: 'version-1' });

    const upsert = cacheUpserts[0]!;
    expect(upsert.sql).toContain('cost_json = excluded.cost_json');
    const cost = JSON.parse(upsert.params[1] as string) as Record<string, unknown>;
    expect(cost).toHaveProperty('totalPct');
    expect(cost).toHaveProperty('rawCost');
  });
});

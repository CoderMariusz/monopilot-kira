/**
 * W9-L4 — F-B05 + F-A06 read path: getFormulation must
 *   1. JOIN per-100g nutrition from Reference.RawMaterials (the same canonical
 *      source recompute.ts reads, keyed by rm_code) onto every ingredient, and
 *   2. resolve allergens for item-linked lines LIVE from the SSOT
 *      item_allergen_profiles (full array), falling back to the stored derived
 *      column only for legacy free-text lines,
 *   3. degrade gracefully (nutrition null) when migration 107 has not been
 *      applied (42P01), exactly like recompute.ts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getFormulation } from '../get-formulation';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const VERSION_ID = '44444444-4444-4444-8444-444444444444';
const FORMULATION_ID = '55555555-5555-4555-8555-555555555555';
const ITEM_A = '66666666-6666-4666-8666-666666666666';

let client: QueryClient;
let rawMaterialsProvisioned = true;
let ingredientQueries: string[];

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

const FORMULATION_ROW = {
  formulation_id: FORMULATION_ID,
  project_id: PROJECT_ID,
  product_code: 'PRD-1',
  locked_at: null,
  locked_by_user: null,
  version_id: VERSION_ID,
  version_number: 1,
  state: 'draft',
  batch_size_kg: '0.200',
  target_yield_pct: '80',
  target_price_eur: '4.00',
  cost_json: {},
  nutrition_json: {},
  allergen_json: {},
  computed_at: null,
};

/** What the (joined) ingredient read returns — full SSOT-resolved arrays. */
const INGREDIENT_ROWS = [
  {
    id: 'fi-1',
    rm_code: 'RM-1001',
    item_id: ITEM_A,
    item_name: 'Mustard blend',
    qty_kg: '0.200',
    pct: '100.000',
    cost_per_kg_eur: '9.9900',
    allergens_inherited: ['celery', 'mustard', 'sesame'],
    sequence: 1,
    nutrition_per_100g: { energy_kj: '500', fat_g: '10', salt_g: 1.2 },
  },
];

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string) => {
      const q = normalize(sql);
      if (q.includes('from public.formulations f')) return { rows: [FORMULATION_ROW] };
      if (q.includes('from public.formulation_ingredients fi')) {
        ingredientQueries.push(q);
        if (q.includes('"reference"."rawmaterials"')) {
          if (!rawMaterialsProvisioned) {
            const err = new Error('relation "Reference.RawMaterials" does not exist') as Error & { code: string };
            err.code = '42P01';
            throw err;
          }
          return { rows: INGREDIENT_ROWS };
        }
        // Legacy fallback query (no nutrition join, no nutrition column).
        return { rows: INGREDIENT_ROWS.map(({ nutrition_per_100g: _drop, ...rest }) => rest) };
      }
      throw new Error(`unexpected query in get-formulation.ssot.test: ${q.slice(0, 120)}`);
    }),
  };
}

beforeEach(() => {
  client = makeClient();
  rawMaterialsProvisioned = true;
  ingredientQueries = [];
});

describe('getFormulation — F-B05 nutrition join + F-A06 live allergen resolution', () => {
  it('returns joined per-100g nutrition and the FULL allergen array per ingredient', async () => {
    const result = await getFormulation({ projectId: PROJECT_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [ing] = result.data.ingredients;
    expect(ing.nutrition_per_100g).toEqual({ energy_kj: '500', fat_g: '10', salt_g: 1.2 });
    expect(ing.allergens_inherited).toEqual(['celery', 'mustard', 'sesame']);
    // The read resolves allergens from the SSOT (item_allergen_profiles) for
    // item-linked lines and joins the SAME nutrition source recompute.ts uses.
    expect(ingredientQueries[0]).toContain('item_allergen_profiles');
    expect(ingredientQueries[0]).toContain('"reference"."rawmaterials"');
    // F6/N+1 (W9 cross-review): the SSOT resolution is a pre-aggregated CTE
    // keyed by item_id + ONE left join — not a correlated per-row subquery.
    expect(ingredientQueries[0]).toContain('with profile_allergens as');
    expect(ingredientQueries[0]).toContain('left join profile_allergens pa on pa.item_id = fi.item_id');
    expect(ingredientQueries[0]).not.toMatch(/select array_agg\(distinct iap\.allergen_code[^)]*\)\s+from public\.item_allergen_profiles iap\s+where iap\.org_id = app\.current_org_id\(\)\s+and iap\.item_id = fi\.item_id/);
  });

  it('degrades gracefully on 42P01 (mig 107 not applied): retries without the join, nutrition null', async () => {
    rawMaterialsProvisioned = false;
    const result = await getFormulation({ projectId: PROJECT_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [ing] = result.data.ingredients;
    expect(ing.nutrition_per_100g).toBeNull();
    // Allergen resolution still runs in the fallback query — food safety never
    // degrades with nutrition.
    expect(ing.allergens_inherited).toEqual(['celery', 'mustard', 'sesame']);
    expect(ingredientQueries).toHaveLength(2);
    expect(ingredientQueries[1]).toContain('item_allergen_profiles');
    expect(ingredientQueries[1]).not.toContain('"reference"."rawmaterials"');
  });
});

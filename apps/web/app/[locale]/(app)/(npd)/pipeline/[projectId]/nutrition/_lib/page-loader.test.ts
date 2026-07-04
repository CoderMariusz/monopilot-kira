import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readNutritionPageData } from './page-loader';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const VERSION_ID = '44444444-4444-4444-8444-444444444444';

type QueryCall = {
  sql: string;
  params: readonly unknown[];
};

let calls: QueryCall[];

const { hasPermissionMock } = vi.hoisted(() => ({
  hasPermissionMock: vi.fn(),
}));

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action) =>
    action({
      userId: USER_ID,
      orgId: ORG_ID,
      client: {
        query: async (sql: string, params: readonly unknown[] = []) => {
          calls.push({ sql, params });
          const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

          if (normalized.includes('from public.formulations f')) {
            return { rows: [{ current_version_id: VERSION_ID }], rowCount: 1 };
          }

          if (normalized.includes('from public.npd_projects')) {
            return { rows: [{ product_code: 'FG-NPD-EGGS', pack_weight_g: '200' }], rowCount: 1 };
          }

          if (normalized.includes('from public.nutrition_profiles np')) {
            return {
              rows: [
                {
                  nutrient_code: 'energy_kcal',
                  display_name: 'Energy',
                  unit: 'kcal',
                  per_100g_value: '100',
                  per_portion_value: '200',
                },
              ],
              rowCount: 1,
            };
          }

          if (normalized.includes('from public.nutri_score_results')) {
            return { rows: [{ grade: 'B' }], rowCount: 1 };
          }

          if (normalized.includes('from public.fa_allergen_cascade')) {
            return {
              rows: [{ allergen_code: 'eggs', presence: 'contains', source_ingredient: null }],
              rowCount: 1,
            };
          }

          throw new Error(`unexpected query: ${normalized}`);
        },
      },
    }),
  ),
}));

vi.mock('../../../../../../../../lib/auth/has-permission', () => ({
  hasPermission: hasPermissionMock,
}));

vi.mock('../../../../../../../(npd)/pipeline/[projectId]/nutrition/_actions/compute', () => ({
  computeNutrition: vi.fn(),
}));

describe('readNutritionPageData allergen declaration source', () => {
  beforeEach(() => {
    calls = [];
    hasPermissionMock.mockResolvedValue(true);
  });

  it('uses the FG allergen cascade and does not surface stale nutrition_allergens codes', async () => {
    const result = await readNutritionPageData(PROJECT_ID);

    expect(result.state).toBe('ready');
    expect(result.data?.allergens).toEqual([
      { allergenCode: 'eggs', sourceIngredient: null, presence: 'contains' },
    ]);
    expect(result.data?.allergens.map((row) => row.allergenCode)).not.toContain('gluten');

    const allergenQuery = calls.find((call) => call.sql.includes('from public.fa_allergen_cascade'));
    expect(allergenQuery?.sql).toContain('join "Reference"."Allergens"');
    expect(calls.map((call) => call.sql).join('\n')).not.toContain('public.nutrition_allergens');
  });
});

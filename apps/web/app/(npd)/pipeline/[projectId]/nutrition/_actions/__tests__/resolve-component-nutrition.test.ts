import { describe, expect, it, vi } from 'vitest';

import { loadResolvedComponentNutrition } from '../resolve-component-nutrition';

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

describe('loadResolvedComponentNutrition — C030 live parity with materialized path', () => {
  it('recursively resolves WIP nutrition from wip_definition_ingredients when no BOM exists', async () => {
    const catalog: Record<string, Record<string, string>> = {
      'ING-FLOUR': {
        energy_kj: '100',
        fat_g: '0',
        saturates_g: '0',
        carbs_g: '30',
        sugars_g: '0',
        protein_g: '1',
        salt_g: '0',
      },
      'RM-BUTTER': {
        energy_kj: '3015',
        fat_g: '81',
        saturates_g: '51',
        carbs_g: '0.6',
        sugars_g: '0.6',
        protein_g: '0.9',
        salt_g: '0.02',
      },
      'ING-SUGAR': {
        energy_kj: '1590',
        fat_g: '0',
        saturates_g: '0',
        carbs_g: '99.7',
        sugars_g: '99.7',
        protein_g: '0',
        salt_g: '0',
      },
    };

    const client: QueryClient = {
      query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
        const q = normalize(sql);
        if (q.includes('from "reference"."rawmaterials"')) {
          const codes = params?.[0] as string[];
          return {
            rows: codes
              .filter((code) => catalog[code])
              .map((rm_code) => ({
                rm_code,
                nutrition_per_100g: catalog[rm_code],
                allergens_inherited: [],
              })),
          };
        }
        if (q.includes("item_type = 'intermediate'")) {
          const codes = params?.[0] as string[];
          return {
            rows: codes.includes('WIP-019') ? [{ item_code: 'WIP-019', id: 'wip-item-id' }] : [],
          };
        }
        if (q.includes('wip_definition_ingredients')) {
          return {
            rows: [
              { component_code: 'RM-BUTTER', quantity: '0.20' },
              { component_code: 'ING-SUGAR', quantity: '0.10' },
              { component_code: 'ING-FLOUR', quantity: '0.70' },
            ],
          };
        }
        throw new Error(`unexpected query: ${q.slice(0, 120)}`);
      }),
    };

    const { nutritionByCode } = await loadResolvedComponentNutrition(client, ['WIP-019', 'ING-FLOUR']);

    expect(nutritionByCode['WIP-019']?.energy_kj).toBe('832.00');
    expect(nutritionByCode['ING-FLOUR']?.energy_kj).toBe('100');
  });
});

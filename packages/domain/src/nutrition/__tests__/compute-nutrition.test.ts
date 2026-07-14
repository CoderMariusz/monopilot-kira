import { describe, expect, it, vi } from 'vitest';

import { computeNutrition, resolveComponentNutrition } from '../compute-nutrition.js';

describe('computeNutrition', () => {
  it('computes weighted per-100g nutrition and per-portion values for the seven EU FIC nutrients', () => {
    const result = computeNutrition(
      [
        { rmCode: 'RM-1', pct: '33.3' },
        { rmCode: 'RM-2', pct: '33.3' },
        { rmCode: 'RM-3', pct: '33.3' },
      ],
      {
        'RM-1': {
          energy_kj: '300',
          fat_g: '9',
          saturates_g: '3',
          carbs_g: '30',
          sugars_g: '6',
          protein_g: '12',
          salt_g: '0.9',
        },
        'RM-2': {
          energy_kj: '600',
          fat_g: '18',
          saturates_g: '6',
          carbs_g: '60',
          sugars_g: '12',
          protein_g: '24',
          salt_g: '1.8',
        },
        'RM-3': {
          energy_kj: '900',
          fat_g: '27',
          saturates_g: '9',
          carbs_g: '90',
          sugars_g: '18',
          protein_g: '36',
          salt_g: '2.7',
        },
      },
      { portionGrams: '40' },
    );

    expect(result).toHaveLength(7);
    expect(result.map((row) => row.nutrientCode)).toEqual([
      'energy_kj',
      'fat_g',
      'saturates_g',
      'carbs_g',
      'sugars_g',
      'protein_g',
      'salt_g',
    ]);

    const energy = result.find((row) => row.nutrientCode === 'energy_kj');
    expect(Number(energy?.per100g)).toBeCloseTo(599.4, 2);
    expect(energy?.perPortion).toBe('239.76');
  });

  it('rolls a 100% wheat-flour WIP into an FG at 50%', async () => {
    const loadActiveBom = vi.fn(async () => [
      { componentCode: 'RM-WHEAT-FLOUR', quantity: '100' },
    ]);
    const sources = await resolveComponentNutrition(['WIP-WHEAT'], {
      loadRawMaterials: async (codes) => Object.fromEntries(
        codes.includes('RM-WHEAT-FLOUR')
          ? [[
              'RM-WHEAT-FLOUR',
              {
                nutritionPer100g: { energy_kj: '1523', protein_g: '10.3' },
                allergensInherited: ['gluten'],
              },
            ]]
          : [],
      ),
      loadIntermediates: async (codes) => Object.fromEntries(
        codes.includes('WIP-WHEAT') ? [['WIP-WHEAT', 'wip-item-id']] : [],
      ),
      loadActiveBom,
    });

    expect(sources['WIP-WHEAT']).toEqual({
      nutritionPer100g: { energy_kj: '1523.00', protein_g: '10.30' },
      allergensInherited: ['gluten'],
    });
    expect(computeNutrition(
      [{ rmCode: 'WIP-WHEAT', pct: '50' }],
      { 'WIP-WHEAT': sources['WIP-WHEAT']?.nutritionPer100g },
    ).filter((row) => row.nutrientCode === 'energy_kj' || row.nutrientCode === 'protein_g')).toEqual([
      { nutrientCode: 'energy_kj', per100g: '761.50', perPortion: '761.50' },
      { nutrientCode: 'protein_g', per100g: '5.15', perPortion: '5.15' },
    ]);
    expect(loadActiveBom).toHaveBeenCalledTimes(1);
  });

  it('rejects cyclic WIP BOMs', async () => {
    await expect(resolveComponentNutrition(['WIP-A'], {
      loadRawMaterials: async () => ({}),
      loadIntermediates: async (codes) => Object.fromEntries(codes.map((code) => [code, `${code}-id`])),
      loadActiveBom: async (itemId) => [{
        componentCode: itemId === 'WIP-A-id' ? 'WIP-B' : 'WIP-A',
        quantity: '100',
      }],
    })).rejects.toThrow('Cyclic WIP BOM: WIP-A -> WIP-B -> WIP-A');
  });
});

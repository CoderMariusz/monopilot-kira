import { describe, expect, it } from 'vitest';

import { nutriScore } from '../nutri-score.js';

describe('nutriScore', () => {
  it.each([
    [
      {
        energy_kj: '0',
        sugars_g: '0',
        saturates_g: '0',
        salt_g: '0',
        protein_g: '8.1',
        fiber_g: '4.8',
        fruit_veg_nut_pct: '81',
      },
      -15,
      'A',
    ],
    [{ energy_kj: '335', sugars_g: '0', saturates_g: '0', salt_g: '0', protein_g: '0' }, 0, 'B'],
    [{ energy_kj: '1006', sugars_g: '0', saturates_g: '0', salt_g: '0', protein_g: '0' }, 3, 'C'],
    [{ energy_kj: '1676', sugars_g: '18.1', saturates_g: '3.1', salt_g: '0', protein_g: '0' }, 12, 'D'],
    [{ energy_kj: '3351', sugars_g: '45.1', saturates_g: '10.1', salt_g: '0', protein_g: '0' }, 30, 'E'],
  ])('returns numeric score %i and grade %s for 2017 boundary cases', (per100g, score, grade) => {
    expect(nutriScore(per100g)).toEqual({ score, grade });
  });
});

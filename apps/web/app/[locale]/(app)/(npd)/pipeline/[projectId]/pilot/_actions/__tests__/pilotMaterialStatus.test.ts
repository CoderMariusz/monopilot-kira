import { describe, expect, it } from 'vitest';

import { pilotMaterialStatus } from '../_helpers';

describe('pilotMaterialStatus', () => {
  it.each([
    [10, 10, 'reserved'],
    [10, 15, 'reserved'],
    [10, 5, 'short'],
    [0, 0, 'reserved'],
  ] as const)('returns %s, %s => %s', (requiredKg, reservedKg, expected) => {
    expect(pilotMaterialStatus(requiredKg, reservedKg)).toBe(expected);
  });
});

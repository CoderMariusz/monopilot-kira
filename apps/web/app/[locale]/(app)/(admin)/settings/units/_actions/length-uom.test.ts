import { describe, expect, it } from 'vitest';

import { CreateItemInput } from '../../../../(modules)/technical/items/_actions/shared';
import { CreateUnitInput } from './units-validation';

describe('length UoM validation (R3.1)', () => {
  it('accepts m and cm as item uom_base and length as manage-units category', () => {
    for (const uomBase of ['m', 'cm'] as const) {
      const parsed = CreateItemInput.safeParse({
        itemCode: 'RM-LEN',
        name: 'Measuring tape',
        itemType: 'rm',
        uomBase,
      });
      expect(parsed.success, `uom_base ${uomBase}`).toBe(true);
    }

    const unit = CreateUnitInput.safeParse({
      category: 'length',
      code: 'm',
      name: 'Metre',
      factorToBase: 1,
      isBase: true,
    });
    expect(unit.success).toBe(true);
    if (unit.success) {
      expect(unit.data.category).toBe('length');
    }
  });
});

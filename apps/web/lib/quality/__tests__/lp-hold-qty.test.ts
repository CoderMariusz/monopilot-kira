import { describe, expect, it } from 'vitest';

import { resolveLpQtyHeldKg } from '../lp-hold-qty';

describe('resolveLpQtyHeldKg', () => {
  it('uses catch_weight_kg for catch-weight LPs instead of countable quantity', () => {
    expect(
      resolveLpQtyHeldKg({
        quantity: '100',
        uom: 'each',
        catch_weight_kg: '12.345678',
      }),
    ).toBe('12.345');
  });

  it('truncates kg quantity to 3 dp without rounding up', () => {
    expect(
      resolveLpQtyHeldKg({
        quantity: '1.234567',
        uom: 'kg',
        catch_weight_kg: null,
      }),
    ).toBe('1.234');
  });

  it('returns null for non-kg LPs without catch weight instead of fabricating kg', () => {
    expect(
      resolveLpQtyHeldKg({
        quantity: '100',
        uom: 'each',
        catch_weight_kg: null,
      }),
    ).toBeNull();
  });
});

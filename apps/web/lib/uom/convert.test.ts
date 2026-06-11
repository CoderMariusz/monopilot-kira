import { describe, expect, it } from 'vitest';

import { fromBaseQty, snapshotFromItemRow, toBaseQty, TypedError, type UomSnapshot } from './convert';

describe('uom conversion', () => {
  const meat: UomSnapshot = {
    outputUom: 'box',
    uomBase: 'kg',
    netQtyPerEach: 0.1,
    eachPerBox: 10,
    boxesPerPallet: null,
    weightMode: 'fixed',
  };

  const bread: UomSnapshot = {
    outputUom: 'each',
    uomBase: 'kg',
    netQtyPerEach: 0.5,
    eachPerBox: null,
    boxesPerPallet: null,
    weightMode: 'fixed',
  };

  it('converts meat boxes to base kg', () => {
    expect(toBaseQty(meat, 300, 'box')).toBe(300);
  });

  it('converts bread each to base kg', () => {
    expect(toBaseQty(bread, 40, 'each')).toBe(20);
  });

  it('throws a typed error when a pack factor is missing', () => {
    expect(() => toBaseQty({ ...meat, eachPerBox: null }, 300, 'box')).toThrow(TypedError);
    expect(() => toBaseQty({ ...meat, eachPerBox: null }, 300, 'box')).toThrow('uom_conversion_unavailable');
  });

  it('roundtrips through base quantity', () => {
    const base = toBaseQty(meat, 17, 'box');
    expect(fromBaseQty(meat, base, 'box')).toBe(17);
  });

  it('maps item rows into a frozen snapshot shape', () => {
    expect(
      snapshotFromItemRow({
        output_uom: 'each',
        uom_base: 'kg',
        net_qty_per_each: '0.5000',
        each_per_box: null,
        boxes_per_pallet: '48',
        weight_mode: 'catch',
      }),
    ).toEqual({
      outputUom: 'each',
      uomBase: 'kg',
      netQtyPerEach: 0.5,
      eachPerBox: null,
      boxesPerPallet: 48,
      weightMode: 'catch',
    });
  });
});

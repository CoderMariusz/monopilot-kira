import { describe, expect, it } from 'vitest';

import {
  fromBaseQty,
  packHierarchyComplete,
  snapshotDecimalString,
  snapshotFromItemRow,
  toBaseQty,
  toBaseQtyFromDecimal,
  TypedError,
  type UomSnapshot,
} from './convert';

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

  it('converts decimal each quantities without JS float drift at the half-up boundary', () => {
    const snap = snapshotFromItemRow({
      output_uom: 'each',
      uom_base: 'kg',
      net_qty_per_each: '100.0615',
      each_per_box: null,
      boxes_per_pallet: null,
      weight_mode: 'fixed',
    });
    expect(toBaseQtyFromDecimal(snap, '3', 'each')).toBe('300.185');
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

describe('snapshotDecimalString', () => {
  it('returns trimmed strings without Number conversion', () => {
    expect(snapshotDecimalString(' 0.1234567890123456789 ')).toBe('0.1234567890123456789');
    expect(snapshotDecimalString('')).toBeNull();
    expect(snapshotDecimalString(null)).toBeNull();
  });
});

describe('packHierarchyComplete', () => {
  function snap(partial: Partial<UomSnapshot>): UomSnapshot {
    return {
      outputUom: 'base',
      uomBase: 'kg',
      netQtyPerEach: null,
      eachPerBox: null,
      boxesPerPallet: null,
      weightMode: 'fixed',
      ...partial,
    };
  }

  it('base output is always complete regardless of factors (bulk FG never blocked)', () => {
    expect(packHierarchyComplete(snap({ outputUom: 'base' }))).toBe(true);
    expect(
      packHierarchyComplete(snap({ outputUom: 'base', netQtyPerEach: null, eachPerBox: null })),
    ).toBe(true);
  });

  it('each output requires a positive net_qty_per_each', () => {
    expect(packHierarchyComplete(snap({ outputUom: 'each', netQtyPerEach: 0.25 }))).toBe(true);
    expect(packHierarchyComplete(snap({ outputUom: 'each', netQtyPerEach: null }))).toBe(false);
    expect(packHierarchyComplete(snap({ outputUom: 'each', netQtyPerEach: 0 }))).toBe(false);
    expect(packHierarchyComplete(snap({ outputUom: 'each', netQtyPerEach: -1 }))).toBe(false);
    expect(packHierarchyComplete(snap({ outputUom: 'each', netQtyPerEach: NaN }))).toBe(false);
  });

  it('box output requires positive net_qty_per_each AND each_per_box', () => {
    expect(packHierarchyComplete(snap({ outputUom: 'box', netQtyPerEach: 0.5, eachPerBox: 3 }))).toBe(true);
    // the canonical "1 box = 3 breads never set" gap: net set, each_per_box missing
    expect(packHierarchyComplete(snap({ outputUom: 'box', netQtyPerEach: 0.5, eachPerBox: null }))).toBe(false);
    expect(packHierarchyComplete(snap({ outputUom: 'box', netQtyPerEach: null, eachPerBox: 3 }))).toBe(false);
    expect(packHierarchyComplete(snap({ outputUom: 'box', netQtyPerEach: 0.5, eachPerBox: 0 }))).toBe(false);
    expect(packHierarchyComplete(snap({ outputUom: 'box', netQtyPerEach: null, eachPerBox: null }))).toBe(false);
  });

  it('works against a snapshot built from a raw item row (string numerics)', () => {
    const complete = snapshotFromItemRow({ output_uom: 'box', net_qty_per_each: '0.3000', each_per_box: '3' });
    expect(packHierarchyComplete(complete)).toBe(true);

    const incomplete = snapshotFromItemRow({ output_uom: 'box', net_qty_per_each: '0.3000', each_per_box: null });
    expect(packHierarchyComplete(incomplete)).toBe(false);
  });
});

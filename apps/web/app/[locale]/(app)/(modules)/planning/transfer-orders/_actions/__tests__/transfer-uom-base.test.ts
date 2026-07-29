import { describe, expect, it } from 'vitest';

import { baseMicro6ToQty, qtyToBaseMicro6 } from '../transfer-uom-base';

const FLOUR: Parameters<typeof qtyToBaseMicro6>[0] = {
  id: 'item-flour',
  uom_base: 'kg',
  net_qty_per_each: null,
  each_per_box: null,
};

const PACKED: Parameters<typeof qtyToBaseMicro6>[0] = {
  id: 'item-packed',
  uom_base: 'kg',
  net_qty_per_each: '0.5',
  each_per_box: '10',
};

describe('transfer-uom-base', () => {
  it('converts g line qty to kg base at micro-6 (PF-R10-01 reproduction)', () => {
    expect(qtyToBaseMicro6(FLOUR, '3875', 'g')).toBe(3_875_000n);
    expect(qtyToBaseMicro6(FLOUR, '6.125000', 'kg')).toBe(6_125_000n);
  });

  it('round-trips kg base through g without loss at micro-6', () => {
    const base = qtyToBaseMicro6(FLOUR, '3875', 'g');
    expect(base).not.toBeNull();
    expect(baseMicro6ToQty(FLOUR, base!, 'g')).toBe(3_875_000_000n);
  });

  it('returns null for unconvertible UoM pairs', () => {
    expect(qtyToBaseMicro6(FLOUR, '10', 'pcs')).toBeNull();
    expect(qtyToBaseMicro6(FLOUR, '0.000999', 'g')).toBeNull();
  });

  it('round-trips each and box through kg base at micro-6', () => {
    const fiveKgBase = qtyToBaseMicro6(FLOUR, '5', 'kg');
    expect(fiveKgBase).toBe(5_000_000n);
    expect(baseMicro6ToQty(PACKED, fiveKgBase!, 'each')).toBe(10_000_000n);
    expect(baseMicro6ToQty(PACKED, fiveKgBase!, 'box')).toBe(1_000_000n);
    expect(qtyToBaseMicro6(PACKED, '2', 'box')).toBe(10_000_000n);
  });
});

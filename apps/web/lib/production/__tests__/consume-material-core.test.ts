import { describe, expect, it } from 'vitest';

import {
  NIL_LP_UUID,
  ConsumptionQuantityError,
  isNilOrZeroLpId,
  normalizePersistedQuantity,
} from '../consume-material-core';

describe('normalizePersistedQuantity (S6)', () => {
  it('preserves fractional kg without integer rounding', () => {
    expect(normalizePersistedQuantity('2.52')).toBe('2.52');
    expect(normalizePersistedQuantity('0.48')).toBe('0.48');
    expect(normalizePersistedQuantity('12.632')).toBe('12.632');
  });

  it('rejects non-positive values', () => {
    expect(() => normalizePersistedQuantity('0')).toThrow(ConsumptionQuantityError);
    expect(() => normalizePersistedQuantity('0.0')).toThrow(ConsumptionQuantityError);
  });

  it('rejects scale beyond wo_material_consumption numeric(12,3)', () => {
    expect(() => normalizePersistedQuantity('1.0000009')).toThrow(ConsumptionQuantityError);
    try {
      normalizePersistedQuantity('1.0000009');
    } catch (error) {
      expect(error).toBeInstanceOf(ConsumptionQuantityError);
      expect((error as ConsumptionQuantityError).code).toBe('qty_scale_exceeded');
    }
  });

  it('rejects magnitude beyond numeric(12,3) range', () => {
    expect(() => normalizePersistedQuantity('1000000000')).toThrow(ConsumptionQuantityError);
    try {
      normalizePersistedQuantity('1000000000');
    } catch (error) {
      expect((error as ConsumptionQuantityError).code).toBe('qty_range_exceeded');
    }
  });
});

describe('isNilOrZeroLpId (C1)', () => {
  it('treats null, empty, and zero UUID as absent', () => {
    expect(isNilOrZeroLpId(null)).toBe(true);
    expect(isNilOrZeroLpId('')).toBe(true);
    expect(isNilOrZeroLpId(NIL_LP_UUID)).toBe(true);
  });

  it('accepts a real UUID', () => {
    expect(isNilOrZeroLpId('66666666-6666-4666-8666-666666666666')).toBe(false);
  });
});

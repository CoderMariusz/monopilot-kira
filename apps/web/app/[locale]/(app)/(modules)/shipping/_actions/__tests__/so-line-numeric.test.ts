import { describe, expect, it } from 'vitest';

import {
  isValidSoLineQtyInput,
  isValidSoLineUnitPriceInput,
  normalizeSoLineQty,
  normalizeSoLineUnitPrice,
} from '../so-line-numeric';

describe('so-line-numeric — trailing-zero acceptance (C114)', () => {
  it('accepts qty with harmless trailing zeros and normalizes to numeric(14,3)', () => {
    expect(normalizeSoLineQty('3.125000')).toBe('3.125');
    expect(normalizeSoLineQty('2.500')).toBe('2.5');
    expect(normalizeSoLineQty('10')).toBe('10');
    expect(isValidSoLineQtyInput('3.125000')).toBe(true);
  });

  it('accepts unit price with trailing zeros and normalizes to numeric(14,4)', () => {
    expect(normalizeSoLineUnitPrice('2.345600')).toBe('2.3456');
    expect(isValidSoLineUnitPriceInput('2.345600')).toBe(true);
  });

  it('rejects zero and non-decimal strings', () => {
    expect(normalizeSoLineQty('0')).toBeNull();
    expect(normalizeSoLineQty('0.000')).toBeNull();
    expect(normalizeSoLineQty('abc')).toBeNull();
    expect(normalizeSoLineUnitPrice('-1')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import { computeMod10 } from '../check-digit';
import { parseGTIN } from '../parse';
import {
  buildGtin14,
  computeGtinCheckDigit,
  deriveGtin14FromGtin13,
  validateGtin14,
} from '../gtin';

describe('computeGtinCheckDigit', () => {
  it('computes check digit 7 for GTIN-13 prefix 590123412345', () => {
    expect(computeGtinCheckDigit('590123412345')).toBe('7');
  });

  it('computes check digit 4 for GTIN-14 body 1590123412345', () => {
    expect(computeGtinCheckDigit('1590123412345')).toBe('4');
  });
});

describe('validateGtin14', () => {
  it('accepts known-valid GTIN-13 EAN 5901234123457', () => {
    expect(validateGtin14('5901234123457')).toBe(true);
  });

  it('accepts known-valid GTIN-14 15901234123454', () => {
    expect(validateGtin14('15901234123454')).toBe(true);
    expect(parseGTIN('15901234123454').valid).toBe(true);
  });

  it('rejects tampered check digits', () => {
    expect(validateGtin14('5901234123458')).toBe(false);
    expect(validateGtin14('15901234123458')).toBe(false);
  });
});

describe('deriveGtin14FromGtin13', () => {
  it('derives case GTIN-14 with packaging indicator 1 from EAN-13', () => {
    const gtin14 = deriveGtin14FromGtin13('5901234123457');
    expect(gtin14).toBe('15901234123454');
    expect(validateGtin14(gtin14)).toBe(true);
  });

  it('supports packaging indicators 2–9', () => {
    const gtin14 = deriveGtin14FromGtin13('5901234123457', 2);
    expect(gtin14.startsWith('2')).toBe(true);
    expect(gtin14).toHaveLength(14);
    expect(gtin14.slice(-1)).toBe(computeMod10(gtin14.slice(0, 13)));
  });

  it('rejects invalid GTIN-13 check digits and indicators', () => {
    expect(() => deriveGtin14FromGtin13('5901234123458')).toThrow(/check digit/i);
    expect(() => deriveGtin14FromGtin13('5901234123457', 0)).toThrow(/packaging indicator/i);
  });
});

describe('buildGtin14', () => {
  it('appends the mod-10 check digit to a 13-digit body', () => {
    expect(buildGtin14('1590123412345')).toBe('15901234123454');
  });
});

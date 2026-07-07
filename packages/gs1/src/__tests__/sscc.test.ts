import { describe, expect, it } from 'vitest';

import { computeMod10 } from '../check-digit';
import {
  formatSscc18,
  generateSscc18,
  normalizeSscc18,
  validateSscc18,
} from '../sscc';

describe('generateSscc18', () => {
  it('builds SSCC from extension + 7-digit prefix + padded serial (prototype layout)', () => {
    const sscc = generateSscc18({
      extensionDigit: 0,
      companyPrefix: '5012345',
      serialReference: 42,
    });

    expect(sscc).toHaveLength(18);
    // Prototype shows "0 5012345 00000042 5" as an illustration; mod-10 yields check 8.
    expect(sscc).toBe('050123450000000428');
    expect(validateSscc18(sscc)).toBe(true);
    expect(sscc.slice(-1)).toBe(computeMod10(sscc.slice(0, 17)));
  });

  it('matches the known-valid SSCC-18 vector 376104250021234569', () => {
    // Prefix 3761042 (7) + serial 5002123456 does not decompose cleanly from the
    // published vector; validate round-trip instead.
    const known = '376104250021234569';
    expect(validateSscc18(known)).toBe(true);
    expect(known.slice(-1)).toBe(computeMod10(known.slice(0, 17)));
  });

  it('pads serial references to fill the 17-digit body for a 7-digit prefix', () => {
    const sscc = generateSscc18({
      extensionDigit: 0,
      companyPrefix: '0123456',
      serialReference: 1,
    });

    expect(sscc).toBe('001234560000000018');
    expect(validateSscc18(sscc)).toBe(true);
  });

  it('supports 10-digit company prefixes with a shorter serial field', () => {
    const sscc = generateSscc18({
      extensionDigit: 9,
      companyPrefix: '1234567890',
      serialReference: 55,
    });

    expect(sscc).toBe('912345678900000558');
    expect(validateSscc18(sscc)).toBe(true);
  });

  it('rejects invalid extension digits and prefixes', () => {
    expect(() =>
      generateSscc18({ extensionDigit: 10, companyPrefix: '5012345', serialReference: 1 }),
    ).toThrow(/extension digit/i);
    expect(() =>
      generateSscc18({ extensionDigit: 0, companyPrefix: '123456', serialReference: 1 }),
    ).toThrow(/7–10 digits/i);
    expect(() =>
      generateSscc18({ extensionDigit: 0, companyPrefix: '5012345', serialReference: '1234567890' }),
    ).toThrow(/serial reference exceeds/i);
  });
});

describe('validateSscc18', () => {
  it('accepts whitespace-stripped known-good SSCC', () => {
    expect(validateSscc18('  376104250021234569  ')).toBe(true);
  });

  it('rejects wrong length and bad check digits', () => {
    expect(validateSscc18('37610425002123456')).toBe(false);
    expect(validateSscc18('376104250021234567')).toBe(false);
    expect(validateSscc18('37610425002123456X')).toBe(false);
  });
});

describe('formatSscc18', () => {
  it('formats the prototype example with spaced groups', () => {
    expect(formatSscc18('050123450000000428')).toBe('0 5012345 000000042 8');
  });

  it('round-trips through normalizeSscc18', () => {
    const formatted = formatSscc18('376104250021234569');
    expect(normalizeSscc18(formatted)).toBe('376104250021234569');
  });
});

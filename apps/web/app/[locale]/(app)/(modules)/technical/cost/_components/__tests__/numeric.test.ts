/**
 * T-050/T-052 — NUMERIC display helper unit tests.
 *
 * Proves cost values display EXACTLY (no binary-float rounding artifacts) and
 * Δ% is computed precisely on decimal strings. These are the load-bearing
 * "Display NUMERIC exactly" gate for the cost + routing cost screens.
 */
import { describe, expect, it } from 'vitest';

import { deltaPctExact, formatCost } from '../numeric';

describe('formatCost — exact NUMERIC display', () => {
  it('trims trailing fractional zeros to the requested dp', () => {
    expect(formatCost('12.3400')).toBe('12.34');
    expect(formatCost('5')).toBe('5.00');
    expect(formatCost('0')).toBe('0.00');
  });

  it('rounds half-up exactly without float drift', () => {
    expect(formatCost('12.345')).toBe('12.35');
    expect(formatCost('12.344')).toBe('12.34');
    // the classic float trap: 0.1 + 0.2; the string path is exact
    expect(formatCost('0.30000000000000004')).toBe('0.30');
  });

  it('does not introduce float artifacts on long decimals', () => {
    expect(formatCost('1.005')).toBe('1.01'); // float Number(1.005).toFixed(2) === '1.00' (wrong)
    expect(formatCost('2.675')).toBe('2.68'); // float gives 2.67
  });

  it('renders an em dash for null/empty/invalid', () => {
    expect(formatCost(null)).toBe('—');
    expect(formatCost('')).toBe('—');
    expect(formatCost('abc')).toBe('—');
  });

  it('respects an explicit decimal-place count', () => {
    expect(formatCost('1.23456', 4)).toBe('1.2346');
    expect(formatCost('1.2', 0)).toBe('1');
  });
});

describe('deltaPctExact — exact percent change on decimal strings', () => {
  it('computes a positive delta', () => {
    expect(deltaPctExact('10.00', '12.50')).toBe('25.0');
  });

  it('computes a negative delta', () => {
    expect(deltaPctExact('10.00', '9.00')).toBe('-10.0');
  });

  it('returns 0.0 for no change', () => {
    expect(deltaPctExact('10.00', '10.00')).toBe('0.0');
  });

  it('returns null when the prior cost is zero (undefined percentage)', () => {
    expect(deltaPctExact('0', '5.00')).toBeNull();
  });

  it('rounds the percentage half-up exactly', () => {
    // (10.05 - 10.00)/10.00*100 = 0.5 → "0.5"
    expect(deltaPctExact('10.00', '10.05')).toBe('0.5');
    // 21% exactly
    expect(deltaPctExact('100.00', '121.00')).toBe('21.0');
  });
});

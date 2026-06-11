/**
 * lib/shared/decimal — micro-unit bigint helpers (Codex batch-D F1 extraction).
 * NUMERIC-exact: text in, bigint micro-units for arithmetic, text out.
 */
import { describe, expect, it } from 'vitest';

import {
  MICRO_SCALE,
  ceilMicroToWholeUnits,
  microToDecimal,
  microToFixed,
  mulMicro,
  toMicro,
} from '../decimal';

describe('toMicro', () => {
  it('parses 3-4dp NUMERIC strings exactly', () => {
    expect(toMicro('15.333')).toBe(15_333_000n);
    expect(toMicro('0.0001')).toBe(100n);
    expect(toMicro('-25.300')).toBe(-25_300_000n);
    expect(toMicro('100')).toBe(100_000_000n);
  });

  it('adds float-breaking values exactly (0.1 + 0.2 === 0.3)', () => {
    expect(toMicro('0.1') + toMicro('0.2')).toBe(toMicro('0.3'));
    expect(toMicro('15.333') * 3n).toBe(toMicro('45.999'));
  });

  it('truncates beyond 6dp and zeroes unparseable input', () => {
    expect(toMicro('1.2345678')).toBe(1_234_567n);
    expect(toMicro('abc')).toBe(0n);
    expect(toMicro('')).toBe(0n);
    expect(toMicro(Number.NaN)).toBe(0n);
  });

  it('accepts plain numbers (12.5 → 12500000 micros)', () => {
    expect(toMicro(12.5)).toBe(12_500_000n);
    expect(toMicro(10)).toBe(10_000_000n);
  });
});

describe('microToFixed', () => {
  it('formats fixed-dp strings, rounding half away from zero', () => {
    expect(microToFixed(15_333_000n, 3)).toBe('15.333');
    expect(microToFixed(999_900n, 3)).toBe('1.000'); // 0.9999 → 3dp
    expect(microToFixed(-15_300_000n, 3)).toBe('-15.300');
    expect(microToFixed(1_500n, 3)).toBe('0.002'); // 0.0015 half-up
  });

  it('never emits "-0.000"', () => {
    expect(microToFixed(-100n, 3)).toBe('0.000');
    expect(microToFixed(0n, 3)).toBe('0.000');
  });
});

describe('microToDecimal', () => {
  it('trims trailing zeros and handles negatives', () => {
    expect(microToDecimal(25_300_000n)).toBe('25.3');
    expect(microToDecimal(-100n)).toBe('-0.0001');
    expect(microToDecimal(0n)).toBe('0');
  });
});

describe('mulMicro / ceilMicroToWholeUnits', () => {
  it('multiplies micro quantities exactly (qty × pack factor)', () => {
    expect(mulMicro(toMicro('3'), toMicro('0.3333'))).toBe(toMicro('0.9999'));
    expect(mulMicro(toMicro('2'), toMicro('10'))).toBe(toMicro('20'));
  });

  it('ceils to whole base units; non-positive → 0', () => {
    expect(ceilMicroToWholeUnits(15_300_000n)).toBe(16n);
    expect(ceilMicroToWholeUnits(25n * MICRO_SCALE)).toBe(25n);
    expect(ceilMicroToWholeUnits(100n)).toBe(1n);
    expect(ceilMicroToWholeUnits(0n)).toBe(0n);
    expect(ceilMicroToWholeUnits(-5_000_000n)).toBe(0n);
  });
});

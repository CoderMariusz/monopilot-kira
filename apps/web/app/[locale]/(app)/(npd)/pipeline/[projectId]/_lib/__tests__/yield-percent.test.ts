import { describe, expect, it } from 'vitest';

import { Dec } from '@monopilot/domain';

import { isPercentWithinRange, percentFieldError } from '../yield-percent';

describe('isPercentWithinRange', () => {
  it('accepts the inclusive 100% boundary', () => {
    expect(isPercentWithinRange('100')).toBe(true);
    expect(isPercentWithinRange('100.00')).toBe(true);
    expect(isPercentWithinRange('99.99')).toBe(true);
    expect(isPercentWithinRange('0')).toBe(true);
  });

  // The two values the production audit rejected server-side (PF-R04-12).
  it.each(['100.01', '101', '150'])('rejects %s', (value) => {
    expect(isPercentWithinRange(value)).toBe(false);
  });

  it('rejects anything that is not a non-negative decimal string', () => {
    expect(isPercentWithinRange('')).toBe(false);
    expect(isPercentWithinRange('abc')).toBe(false);
    expect(isPercentWithinRange('-1')).toBe(false);
    expect(isPercentWithinRange('1e2')).toBe(false);
  });

  it('accepts extra precision that truncates into the persisted range', () => {
    // Dec truncates beyond 12 dp and Postgres persists NUMERIC(5,2), so this
    // input has the same stored value and range semantics as 100.00.
    expect(isPercentWithinRange('100.0000000000000001')).toBe(true);
  });
});

describe('percentFieldError', () => {
  it('stays quiet on an empty field', () => {
    expect(percentFieldError('')).toBeNull();
    expect(percentFieldError('  ')).toBeNull();
  });

  it('reports the same code the server returns for the same value', () => {
    expect(percentFieldError('101')).toBe('yield_out_of_range');
    expect(percentFieldError('100.01')).toBe('yield_out_of_range');
    expect(percentFieldError('abc')).toBe('invalid_input');
    expect(percentFieldError('100')).toBeNull();
  });
});

/**
 * Guard on the arithmetic the audit measured: the validation change above must
 * not disturb the exact Decimal path (no float drift, no rounding).
 */
describe('trial/pilot decimal precision (audit figures)', () => {
  it('12.345 kg x 52.35% = 6.4626075 kg exactly', () => {
    const output = Dec.from('12.345').mul(Dec.from('52.35')).div(Dec.from('100'));
    expect(output.toFixed(7)).toBe('6.4626075');
  });

  it('25.555 kg x 100% = 25.555 kg with no drift', () => {
    const output = Dec.from('25.555').mul(Dec.from('100')).div(Dec.from('100'));
    expect(output.toFixed(3)).toBe('25.555');
  });
});

import { describe, expect, it } from 'vitest';

import { createInstrumentSchema, updateInstrumentSchema } from './calibration-schemas';

const VALID_BASE = {
  instrumentCode: 'SCALE-01',
  instrumentType: 'scale' as const,
  standard: 'NIST' as const,
  calibrationIntervalDays: 31,
};

describe('createInstrumentSchema measurement range', () => {
  it('rejects inverted range (rangeMin > rangeMax)', () => {
    const result = createInstrumentSchema.safeParse({
      ...VALID_BASE,
      rangeMin: '10.0000',
      rangeMax: '0.0000',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'rangeMax')).toBe(true);
    }
  });

  it('accepts ordered range with negative minimum', () => {
    const result = createInstrumentSchema.safeParse({
      ...VALID_BASE,
      rangeMin: '-0.5000',
      rangeMax: '100.0100',
    });
    expect(result.success).toBe(true);
  });

  it('accepts equal bounds (point calibration span)', () => {
    const result = createInstrumentSchema.safeParse({
      ...VALID_BASE,
      rangeMin: '25.0000',
      rangeMax: '25.0000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects bounds with more than 4 decimal places (numeric(12,4) scale)', () => {
    const result = createInstrumentSchema.safeParse({
      ...VALID_BASE,
      rangeMin: '0.00004',
      rangeMax: '0.000049',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('rangeMin');
      expect(paths).toContain('rangeMax');
    }
  });

  it('skips cross-field check when only one bound is provided', () => {
    expect(
      createInstrumentSchema.safeParse({
        ...VALID_BASE,
        rangeMin: '99.0000',
      }).success,
    ).toBe(true);
    expect(
      createInstrumentSchema.safeParse({
        ...VALID_BASE,
        rangeMax: '1.0000',
      }).success,
    ).toBe(true);
  });
});

describe('updateInstrumentSchema measurement range', () => {
  it('rejects inverted range on update', () => {
    const result = updateInstrumentSchema.safeParse({
      ...VALID_BASE,
      instrumentId: '33333333-3333-4333-8333-333333333333',
      rangeMin: '10.0000',
      rangeMax: '0.0000',
    });
    expect(result.success).toBe(false);
  });
});

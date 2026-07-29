import { describe, expect, it } from 'vitest';

import {
  applySpecBoundsToParameters,
  isWithinSpecBounds,
  normalizeParameterName,
  validateKnownSpecParameters,
  validateSpecParameterCompleteness,
} from '../evaluate-inspection-parameter';

describe('isWithinSpecBounds', () => {
  it('PF-R16-01: rejects 5.5001 when max is 5.5000 (strictly above inclusive max)', () => {
    expect(isWithinSpecBounds('5.5001', '4.5000', '5.5000')).toBe(false);
  });

  it('treats values equal to min and max as pass (inclusive bounds)', () => {
    expect(isWithinSpecBounds('4.5000', '4.5000', '5.5000')).toBe(true);
    expect(isWithinSpecBounds('5.5000', '4.5000', '5.5000')).toBe(true);
  });

  it('rejects values strictly below min or above max', () => {
    expect(isWithinSpecBounds('4.4999', '4.5000', '5.5000')).toBe(false);
    expect(isWithinSpecBounds('5.50001', '4.5000', '5.5000')).toBe(false);
  });

  it('anti-regression: sub-micro precision above max fails (toMicro truncation would pass)', () => {
    expect(isWithinSpecBounds('0.000050', '0.00004', '0.000049')).toBe(false);
    expect(isWithinSpecBounds('0.0000499', null, '0.000049')).toBe(false);
  });

  it('anti-regression: non-numeric actual fails closed instead of coercing to zero', () => {
    expect(isWithinSpecBounds('abc', null, '5.5')).toBe(false);
  });
});

describe('validateKnownSpecParameters', () => {
  const bounds = new Map([
    [
      normalizeParameterName('Moisture'),
      { parameterName: 'Moisture', minValue: '10', maxValue: '14' },
    ],
    [normalizeParameterName('Visual'), { parameterName: 'Visual', minValue: null, maxValue: null }],
  ]);

  it('rejects a typo parameter name while the active spec exists (Z-02)', () => {
    const result = validateKnownSpecParameters(
      [{ name: 'Moistur', actual: '25', pass: true }],
      bounds,
    );
    expect(result).toEqual({ ok: false, reason: 'unknown_spec_parameters', names: ['Moistur'] });
  });

  it('allows a partial payload that only includes spec-defined names', () => {
    const result = validateKnownSpecParameters(
      [{ name: 'Moisture', actual: '12', pass: true }],
      bounds,
    );
    expect(result).toEqual({ ok: true });
  });

  it('allows any payload when the spec defines no parameters', () => {
    const result = validateKnownSpecParameters(
      [{ name: 'Ad-hoc check', actual: 'ok', pass: true }],
      new Map(),
    );
    expect(result).toEqual({ ok: true });
  });
});

describe('validateSpecParameterCompleteness', () => {
  const bounds = new Map([
    [
      normalizeParameterName('NIGHT-R16 pH'),
      { parameterName: 'NIGHT-R16 pH', minValue: '4.5', maxValue: '5.5' },
    ],
    [normalizeParameterName('Visual'), { parameterName: 'Visual', minValue: null, maxValue: null }],
  ]);

  it('rejects when a required spec parameter is omitted from the payload', () => {
    const result = validateSpecParameterCompleteness(
      [{ name: 'Visual', actual: 'ok', pass: true }],
      bounds,
    );
    expect(result).toEqual({ ok: false, reason: 'missing_spec_parameters', names: ['NIGHT-R16 pH'] });
  });

  it('rejects renamed or unknown parameters when an active spec exists', () => {
    const result = validateSpecParameterCompleteness(
      [
        { name: 'pH result', actual: '5.0', pass: true },
        { name: 'Visual', actual: 'ok', pass: true },
      ],
      bounds,
    );
    expect(result).toEqual({ ok: false, reason: 'unknown_spec_parameters', names: ['pH result'] });
  });

  it('reports missing spec parameters when the payload only contains names outside the spec', () => {
    const singleSpecBounds = new Map([
      [
        normalizeParameterName('NIGHT-R16 pH'),
        { parameterName: 'NIGHT-R16 pH', minValue: '4.5', maxValue: '5.5' },
      ],
    ]);

    const result = validateSpecParameterCompleteness(
      [{ name: 'Visual', actual: 'ok', pass: true }],
      singleSpecBounds,
    );

    expect(result).toEqual({ ok: false, reason: 'missing_spec_parameters', names: ['NIGHT-R16 pH'] });
  });
});

describe('applySpecBoundsToParameters', () => {
  const bounds = new Map([
    [
      normalizeParameterName('NIGHT-R16 pH'),
      {
        parameterName: 'NIGHT-R16 pH',
        minValue: '4.5000',
        maxValue: '5.5000',
      },
    ],
  ]);

  it('overrides a client pass flag when the actual is out of spec and flags rejection', () => {
    const result = applySpecBoundsToParameters(
      [{ name: 'NIGHT-R16 pH', actual: '5.5001', pass: true }],
      bounds,
    );

    expect(result.clientPassRejected).toBe(true);
    expect(result.parameters[0]?.pass).toBe(false);
  });

  it('derives pass=false when the client selected pass for an out-of-spec measurement', () => {
    const result = applySpecBoundsToParameters(
      [{ name: 'NIGHT-R16 pH', actual: '5.5001', pass: true }],
      bounds,
    );

    expect(result.clientPassRejected).toBe(true);
    expect(result.parameters[0]?.pass).toBe(false);
  });

  it('leaves unbounded parameters under operator control', () => {
    const result = applySpecBoundsToParameters(
      [{ name: 'Visual', actual: 'OK', pass: true }],
      bounds,
    );

    expect(result.clientPassRejected).toBe(false);
    expect(result.parameters[0]?.pass).toBe(true);
  });
});

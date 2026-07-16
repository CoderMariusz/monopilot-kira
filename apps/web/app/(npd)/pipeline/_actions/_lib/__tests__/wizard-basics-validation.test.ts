import { describe, expect, it } from 'vitest';

import {
  parseFutureTargetLaunch,
  parseOptionalPackWeightG,
  parseOptionalPacksPerCase,
  parseRequiredRunsPerWeek,
  parseRequiredWeeklyVolumePacks,
} from '../wizard-basics-validation';

describe('wizard-basics-validation', () => {
  const today = '2026-07-16';

  it('rejects zero/negative pack weight and excess precision', () => {
    expect(parseOptionalPackWeightG('')).toBeNull();
    expect(parseOptionalPackWeightG('200')).toBe(200);
    expect(parseOptionalPackWeightG('250.5')).toBe(250.5);
    expect(parseOptionalPackWeightG('0')).toBeUndefined();
    expect(parseOptionalPackWeightG('-1')).toBeUndefined();
    expect(parseOptionalPackWeightG('200.1234')).toBeUndefined();
  });

  it('rejects zero packs per case; accepts integer ≥ 1', () => {
    expect(parseOptionalPacksPerCase('')).toBeNull();
    expect(parseOptionalPacksPerCase('12')).toBe(12);
    expect(parseOptionalPacksPerCase('0')).toBeUndefined();
    expect(parseOptionalPacksPerCase('-1')).toBeUndefined();
    expect(parseOptionalPacksPerCase('12.5')).toBeUndefined();
  });

  it('rejects past target launch dates', () => {
    expect(parseFutureTargetLaunch('', today)).toBeNull();
    expect(parseFutureTargetLaunch('2026-07-16', today)).toBe('2026-07-16');
    expect(parseFutureTargetLaunch('2026-09-01', today)).toBe('2026-09-01');
    expect(parseFutureTargetLaunch('2026-01-01', today)).toBeUndefined();
    expect(parseFutureTargetLaunch('not-a-date', today)).toBeUndefined();
  });

  it('rejects fractional runs per week and enforces weekly volume precision', () => {
    expect(parseRequiredRunsPerWeek('3')).toBe(3);
    expect(parseRequiredRunsPerWeek('2.5')).toBeUndefined();
    expect(parseRequiredRunsPerWeek('0')).toBeUndefined();

    expect(parseRequiredWeeklyVolumePacks('1234.567')).toBe(1234.567);
    expect(parseRequiredWeeklyVolumePacks('1234.5678')).toBeUndefined();
    expect(parseRequiredWeeklyVolumePacks('-1')).toBeUndefined();
  });
});

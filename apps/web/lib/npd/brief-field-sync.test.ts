import { describe, expect, it } from 'vitest';

import { expectedVolumeFromWeeklyPacks } from './brief-field-sync';

describe('expectedVolumeFromWeeklyPacks', () => {
  it('mirrors a plain numeric weekly volume string', () => {
    expect(expectedVolumeFromWeeklyPacks('12000')).toBe('12000');
    expect(expectedVolumeFromWeeklyPacks('3.5')).toBe('3.5');
    expect(expectedVolumeFromWeeklyPacks(5000)).toBe('5000');
  });

  it('returns null for empty or non-numeric values', () => {
    expect(expectedVolumeFromWeeklyPacks(null)).toBeNull();
    expect(expectedVolumeFromWeeklyPacks('')).toBeNull();
    expect(expectedVolumeFromWeeklyPacks('1,200 kg/week')).toBeNull();
  });
});

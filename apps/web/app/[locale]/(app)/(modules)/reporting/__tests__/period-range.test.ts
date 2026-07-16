import { describe, expect, it } from 'vitest';

import { detectCustomRangeError } from '../shared';
import { parsePeriodSearchParams } from '../_lib/period';

describe('detectCustomRangeError', () => {
  it('returns reversed when custom from is after to', () => {
    expect(
      detectCustomRangeError({
        period: 'custom',
        from: '2026-07-15',
        to: '2026-07-01',
      }),
    ).toBe('reversed');
  });

  it('returns null for valid custom range', () => {
    expect(
      detectCustomRangeError({
        period: 'custom',
        from: '2026-07-01',
        to: '2026-07-15',
      }),
    ).toBeNull();
  });

  it('returns null for preset periods', () => {
    expect(detectCustomRangeError({ period: '7d' })).toBeNull();
  });
});

describe('parsePeriodSearchParams', () => {
  it('surfaces rangeError without mutating the displayed custom dates', () => {
    const selection = parsePeriodSearchParams(
      { period: 'custom', from: '2026-07-20', to: '2026-07-01' },
      new Date('2026-07-16T12:00:00.000Z'),
    );

    expect(selection.rangeError).toBe('reversed');
    expect(selection.fromDate).toBe('2026-07-20');
    expect(selection.toDate).toBe('2026-07-01');
    expect(selection.window.period).toBe('7d');
  });
});

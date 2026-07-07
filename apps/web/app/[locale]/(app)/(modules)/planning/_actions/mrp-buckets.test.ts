import { describe, expect, it } from 'vitest';

import {
  addDaysIso,
  buildMrpBucketDates,
  dateToBucketIndex,
  isoWeekStartDate,
  isoWeekToBucketIndex,
} from './mrp-buckets';

describe('mrp-buckets', () => {
  it('builds weekly Monday bucket starts from the run date', () => {
    expect(buildMrpBucketDates('2026-06-11', 3)).toEqual(['2026-06-08', '2026-06-15', '2026-06-22']);
  });

  it('maps ISO weeks onto bucket indices', () => {
    const buckets = buildMrpBucketDates('2026-06-11', 4);
    expect(isoWeekStartDate('2026-W24')).toBe('2026-06-08');
    expect(isoWeekToBucketIndex('2026-W24', buckets)).toBe(0);
    expect(isoWeekToBucketIndex('2026-W25', buckets)).toBe(1);
  });

  it('maps need dates onto bucket indices with pre-horizon clamping', () => {
    const buckets = buildMrpBucketDates('2026-06-11', 3);
    expect(dateToBucketIndex('2026-06-01', buckets)).toBe(0);
    expect(dateToBucketIndex('2026-06-18', buckets)).toBe(1);
    expect(addDaysIso('2026-06-08', 14)).toBe('2026-06-22');
    expect(dateToBucketIndex('2026-06-22', buckets)).toBe(2);
  });
});

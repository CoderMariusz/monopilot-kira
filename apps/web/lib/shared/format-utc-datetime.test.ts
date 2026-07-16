import { describe, expect, it } from 'vitest';

import { formatUtcDateTime, formatUtcIsoMinute } from './format-utc-datetime';

describe('formatUtcIsoMinute', () => {
  it('renders the UTC wall clock regardless of host timezone', () => {
    expect(formatUtcIsoMinute('2026-06-24T14:43:00.000Z')).toBe('2026-06-24 14:43');
  });

  it('returns em dash for null/invalid', () => {
    expect(formatUtcIsoMinute(null)).toBe('—');
    expect(formatUtcIsoMinute('not-a-date')).toBe('—');
  });
});

describe('formatUtcDateTime', () => {
  it('pins timeZone to UTC so locale formatting is hydration-stable', () => {
    const label = formatUtcDateTime('2026-06-24T14:43:00.000Z', 'en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(label).toContain('Jun');
    expect(label).toMatch(/2:43\s*PM|14:43/);
  });
});

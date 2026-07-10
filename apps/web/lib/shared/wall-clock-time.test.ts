import { describe, expect, it } from 'vitest';

import { wallClockToInstant } from './wall-clock-time';

describe('wallClockToInstant', () => {
  it('maps a 09:00 Europe/London block to 08:00Z during BST', () => {
    const instant = wallClockToInstant('2026-07-10', '09:00', 'Europe/London');
    expect(instant).toBe(Date.parse('2026-07-10T08:00:00.000Z'));
  });

  it('maps a 09:00 Europe/London block to 09:00Z during GMT', () => {
    const instant = wallClockToInstant('2026-01-10', '09:00', 'Europe/London');
    expect(instant).toBe(Date.parse('2026-01-10T09:00:00.000Z'));
  });
});

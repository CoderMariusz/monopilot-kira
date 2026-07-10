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

  it('advances a nonexistent spring-forward wall time to the next valid minute', () => {
    const instant = wallClockToInstant('2026-03-29', '01:30', 'Europe/London');
    expect(instant).toBe(Date.parse('2026-03-29T01:00:00.000Z'));
  });

  it('selects the standard-time occurrence for an ambiguous fall-back wall time', () => {
    const instant = wallClockToInstant('2026-10-25', '01:30', 'Europe/London');
    expect(instant).toBe(Date.parse('2026-10-25T01:30:00.000Z'));
  });
});

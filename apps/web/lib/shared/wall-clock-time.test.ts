import { describe, expect, it } from 'vitest';

import {
  datetimeLocalInputToInstant,
  formatInstantInTimeZone,
  instantToDatetimeLocalInput,
  wallClockToInstant,
} from './wall-clock-time';

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

describe('instant ↔ site timezone parity (board + detail)', () => {
  const ISO_BST = '2026-07-10T08:00:00.000Z';
  const ZONE = 'Europe/London';

  it('formats the same civil time in the modal input and the detail line during BST', () => {
    const inputValue = instantToDatetimeLocalInput(ISO_BST, ZONE);
    expect(inputValue).toBe('2026-07-10T09:00');

    const display = formatInstantInTimeZone(ISO_BST, 'en-GB', ZONE);
    expect(display).toContain('09:00');
    expect(display).toContain('10 Jul');
  });

  it('round-trips datetime-local through the site timezone without a ±1h drift', () => {
    const inputValue = instantToDatetimeLocalInput(ISO_BST, ZONE);
    const roundTrip = datetimeLocalInputToInstant(inputValue, ZONE);
    expect(roundTrip).toBe(ISO_BST);
  });

  it('round-trips during GMT (winter) without drift', () => {
    const isoGmt = '2026-01-10T09:00:00.000Z';
    const inputValue = instantToDatetimeLocalInput(isoGmt, ZONE);
    expect(inputValue).toBe('2026-01-10T09:00');
    expect(datetimeLocalInputToInstant(inputValue, ZONE)).toBe(isoGmt);
  });
});

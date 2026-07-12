import { afterEach, describe, expect, it, vi } from 'vitest';

import { civilDateToUtcIso, todayCivilDateUtc, utcIsoToCivilDate } from './civil-date';

describe('civil-date', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('B1b: 2026-07-15 round-trips as 15 July regardless of local timezone interpretation', () => {
    const iso = civilDateToUtcIso('2026-07-15');
    expect(iso).toBe('2026-07-15T00:00:00.000Z');
    expect(utcIsoToCivilDate(iso)).toBe('2026-07-15');
  });

  it('B1b: round-trips under UTC+2 (Europe/Warsaw)', () => {
    vi.stubEnv('TZ', 'Europe/Warsaw');
    const iso = civilDateToUtcIso('2026-07-15');
    expect(iso).toBe('2026-07-15T00:00:00.000Z');
    expect(utcIsoToCivilDate(iso)).toBe('2026-07-15');
    expect(utcIsoToCivilDate('2026-07-15T00:00:00.000Z')).toBe('2026-07-15');
  });

  it('B1b: round-trips under UTC-6 (America/Chicago)', () => {
    vi.stubEnv('TZ', 'America/Chicago');
    const iso = civilDateToUtcIso('2026-07-15');
    expect(iso).toBe('2026-07-15T00:00:00.000Z');
    expect(utcIsoToCivilDate(iso)).toBe('2026-07-15');
    expect(utcIsoToCivilDate('2026-07-15T00:00:00.000Z')).toBe('2026-07-15');
  });

  it('utcIsoToCivilDate returns empty for null', () => {
    expect(utcIsoToCivilDate(null)).toBe('');
  });

  it('Extra-1: todayCivilDateUtc matches UTC calendar date used by create-WO modal default', () => {
    expect(todayCivilDateUtc()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(civilDateToUtcIso(todayCivilDateUtc())).toBe(
      `${todayCivilDateUtc()}T00:00:00.000Z`,
    );
  });
});

import { describe, expect, it } from 'vitest';

import { computeWoElapsedMin, resolveWoElapsedEndMs } from '../wo-elapsed';

const START = '2026-07-18T05:47:00.000Z';
const CANCELLED = '2026-07-18T05:56:00.000Z';
const COMPLETED = '2026-07-18T06:10:00.000Z';
const NOW = Date.parse('2026-07-29T12:00:00.000Z');

describe('computeWoElapsedMin', () => {
  it('freezes elapsed at cancelled_at for cancelled WOs (does not use live clock)', () => {
    const elapsed = computeWoElapsedMin({
      startedAt: START,
      completedAt: null,
      cancelledAt: CANCELLED,
      closedAt: null,
      status: 'cancelled',
      nowMs: NOW,
    });

    expect(elapsed).toBe(9);
    expect(
      computeWoElapsedMin({
        startedAt: START,
        completedAt: null,
        cancelledAt: CANCELLED,
        closedAt: null,
        status: 'cancelled',
        nowMs: NOW + 3_600_000,
      }),
    ).toBe(9);
  });

  it('uses completed_at for completed WOs', () => {
    expect(
      computeWoElapsedMin({
        startedAt: START,
        completedAt: COMPLETED,
        cancelledAt: null,
        closedAt: null,
        status: 'completed',
        nowMs: NOW,
      }),
    ).toBe(23);
  });

  it('uses live clock only for in_progress and paused', () => {
    expect(
      computeWoElapsedMin({
        startedAt: START,
        completedAt: null,
        cancelledAt: null,
        closedAt: null,
        status: 'in_progress',
        nowMs: Date.parse('2026-07-18T05:56:00.000Z'),
      }),
    ).toBe(9);

    expect(
      resolveWoElapsedEndMs({
        startedAt: START,
        completedAt: null,
        cancelledAt: null,
        closedAt: null,
        status: 'planned',
        nowMs: NOW,
      }),
    ).toBeNull();
  });

  it('returns null when started_at is absent', () => {
    expect(
      computeWoElapsedMin({
        startedAt: null,
        completedAt: null,
        cancelledAt: CANCELLED,
        closedAt: null,
        status: 'cancelled',
        nowMs: NOW,
      }),
    ).toBeNull();
  });
});

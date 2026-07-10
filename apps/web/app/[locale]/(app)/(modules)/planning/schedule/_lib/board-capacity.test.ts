import { describe, expect, it } from 'vitest';

import {
  capacityBlockInterval,
  computeLineDayUtilization,
  overlapMsWithUtcDay,
  type ScheduleBoardLine,
  type ScheduleBoardWo,
  type ScheduleCapacityBlock,
  utcDayOverlapsForInterval,
} from './board';

const LINE_ID = '55555555-5555-4555-8555-555555555555';
const WINDOW_START = '2026-06-12T00:00:00.000Z';

function line(): ScheduleBoardLine {
  return { id: LINE_ID, code: 'LINE-01', name: 'Line One' };
}

function scheduledWo(input: {
  id: string;
  start: string;
  end: string;
  lineId?: string;
}): ScheduleBoardWo {
  return {
    id: input.id,
    woNumber: `WO-${input.id.slice(0, 4)}`,
    itemCode: 'FG-001',
    itemName: 'Finished Good',
    status: 'RELEASED',
    priority: 'normal',
    productionLineId: input.lineId ?? LINE_ID,
    scheduledStart: input.start,
    scheduledEnd: input.end,
    plannedQuantity: '100',
    uom: 'kg',
  };
}

describe('computeLineDayUtilization', () => {
  it('returns utilization pct when scheduled hours and capacity are known', () => {
    const result = computeLineDayUtilization({
      lines: [line()],
      scheduled: [
        scheduledWo({
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          start: '2026-06-12T08:00:00.000Z',
          end: '2026-06-12T12:00:00.000Z',
        }),
      ],
      capacityRows: [{ line_id: null, capacity_hours_per_day: '8' }],
      windowStartIso: WINDOW_START,
      days: 1,
    });

    expect(result).toEqual([
      {
        lineId: LINE_ID,
        dayKey: '2026-06-12',
        scheduledHours: 4,
        capacityHours: 8,
        utilizationPct: 50,
      },
    ]);
  });

  it('flags overload when scheduled hours exceed daily capacity', () => {
    const result = computeLineDayUtilization({
      lines: [line()],
      scheduled: [
        scheduledWo({
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          start: '2026-06-12T08:00:00.000Z',
          end: '2026-06-12T14:00:00.000Z',
        }),
        scheduledWo({
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          start: '2026-06-12T14:00:00.000Z',
          end: '2026-06-12T18:00:00.000Z',
        }),
      ],
      capacityRows: [{ line_id: LINE_ID, capacity_hours_per_day: '6' }],
      windowStartIso: WINDOW_START,
      days: 1,
    });

    expect(result[0]).toMatchObject({
      scheduledHours: 10,
      capacityHours: 6,
      utilizationPct: 166.7,
    });
  });

  it('omits rows when no capacity is configured and nothing is scheduled', () => {
    const result = computeLineDayUtilization({
      lines: [line()],
      scheduled: [],
      capacityRows: [],
      windowStartIso: WINDOW_START,
      days: 2,
    });

    expect(result).toEqual([]);
  });

  it('splits cross-midnight WO hours across UTC day buckets', () => {
    const result = computeLineDayUtilization({
      lines: [line()],
      scheduled: [
        scheduledWo({
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          start: '2026-06-12T23:00:00.000Z',
          end: '2026-06-13T03:00:00.000Z',
        }),
      ],
      capacityRows: [{ line_id: LINE_ID, capacity_hours_per_day: '8' }],
      windowStartIso: WINDOW_START,
      days: 2,
    });

    const byDay = Object.fromEntries(result.map((row) => [row.dayKey, row.scheduledHours]));
    expect(byDay['2026-06-12']).toBe(1);
    expect(byDay['2026-06-13']).toBe(3);
  });
});

describe('utcDayOverlapsForInterval', () => {
  it('returns 1h on day one and 3h on day two for a 4h WO starting at 23:00 UTC', () => {
    const startMs = Date.parse('2026-06-12T23:00:00.000Z');
    const endMs = startMs + 4 * 60 * 60 * 1000;
    const overlaps = utcDayOverlapsForInterval(startMs, endMs);

    expect(overlaps).toHaveLength(2);
    expect(overlaps[0]?.overlapMs).toBe(1 * 60 * 60 * 1000);
    expect(overlaps[1]?.overlapMs).toBe(3 * 60 * 60 * 1000);
    expect(overlapMsWithUtcDay(startMs, endMs, overlaps[0]!.dayStartMs)).toBe(overlaps[0]!.overlapMs);
  });
});

describe('capacityBlockInterval', () => {
  function block(over: Partial<ScheduleCapacityBlock> = {}): ScheduleCapacityBlock {
    return {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      lineId: LINE_ID,
      projectId: null,
      trialId: null,
      label: 'Trial block',
      blockDate: '2026-07-10',
      startTime: '09:00',
      endTime: '11:00',
      blockType: 'npd_trial',
      ...over,
    };
  }

  it('interprets wall-clock times in the site IANA timezone (BST → 08:00Z)', () => {
    const interval = capacityBlockInterval(block(), 'Europe/London');
    expect(interval?.startMs).toBe(Date.parse('2026-07-10T08:00:00.000Z'));
    expect(interval?.endMs).toBe(Date.parse('2026-07-10T10:00:00.000Z'));
  });

  it('interprets wall-clock times in the site IANA timezone (GMT → 09:00Z)', () => {
    const interval = capacityBlockInterval(
      block({ blockDate: '2026-01-10' }),
      'Europe/London',
    );
    expect(interval?.startMs).toBe(Date.parse('2026-01-10T09:00:00.000Z'));
    expect(interval?.endMs).toBe(Date.parse('2026-01-10T11:00:00.000Z'));
  });
});

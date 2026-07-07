import { describe, expect, it } from 'vitest';

import { computeLineDayUtilization, type ScheduleBoardLine, type ScheduleBoardWo } from './board';

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
});

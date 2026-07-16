import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SEQUENCE_SOLVER_CONFIG,
  SequenceCapacityInfeasibleError,
  __resolvePlannedStartForTests,
  buildPreoccupiedSeed,
  sequenceWorkOrders,
} from '../sequence-solver';
import { ATP_STEP_MINUTES, CLEANING_STEP_MINUTES } from '../changeover-matrix-lookup';
import type { ChangeoverMatrixEntry, WorkOrderForScheduling } from '../scheduler-types';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const LINE_ID = '22222222-2222-4222-8222-222222222222';

function wo(input: {
  id: string;
  due: string;
  allergens: string[];
  scheduledStart?: string;
  scheduledEnd?: string;
  lineId?: string;
  routingDurationMs?: number | string | null;
  processDurationMs?: number | string | null;
}): WorkOrderForScheduling {
  return {
    id: input.id,
    org_id: ORG_ID,
    site_id: null,
    wo_number: `WO-${input.id.slice(0, 4)}`,
    product_id: '33333333-3333-4333-8333-333333333333',
    item_code: 'FG-001',
    item_name: 'Finished Good',
    status: 'DRAFT',
    planned_quantity: '100.000',
    uom: 'kg',
    production_line_id: input.lineId ?? LINE_ID,
    planned_start_date: input.scheduledStart ?? null,
    planned_end_date: input.scheduledEnd ?? input.due,
    scheduled_start_time: input.scheduledStart ?? null,
    scheduled_end_time: input.scheduledEnd ?? null,
    due_date: input.due,
    allergen_ids: input.allergens,
    routing_duration_ms: input.routingDurationMs ?? null,
    process_duration_ms: input.processDurationMs ?? null,
  };
}

function matrix(
  from: string,
  to: string,
  minutes: number,
  over: Partial<ChangeoverMatrixEntry> = {},
): ChangeoverMatrixEntry {
  return {
    id: `${from || 'none'}-${to || 'none'}`,
    org_id: ORG_ID,
    site_id: null,
    version_id: '44444444-4444-4444-8444-444444444444',
    line_id: null,
    allergen_from: from,
    allergen_to: to,
    changeover_minutes: minutes,
    requires_cleaning: minutes > 0,
    requires_atp: false,
    risk_level: 'low',
    notes: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...over,
  };
}

function seq(
  ...args: Parameters<typeof sequenceWorkOrders>
): ReturnType<typeof sequenceWorkOrders>['assignments'] {
  return sequenceWorkOrders(...args).assignments;
}

function naiveDueDateTotal(wos: WorkOrderForScheduling[], entries: ChangeoverMatrixEntry[]): number {
  const ordered = [...wos].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  let total = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    const from = [...ordered[index - 1].allergen_ids].sort();
    const to = [...ordered[index].allergen_ids].sort();
    let step = 0;
    for (const fromCode of from) {
      for (const toCode of to) {
        const hit = entries.find((entry) => entry.allergen_from === fromCode && entry.allergen_to === toCode);
        if (hit) step = Math.max(step, Number(hit.changeover_minutes));
      }
    }
    total += step;
  }
  return total;
}

describe('sequenceWorkOrders', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns an empty sequence for empty input', () => {
    expect(seq([], [])).toEqual([]);
  });

  it('returns a single WO with zero cumulative changeover cost', () => {
    const result = seq(
      [wo({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', due: '2026-06-03T08:00:00.000Z', allergens: ['milk'] })],
      [],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      wo_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sequence_index: 1,
      changeover_cost: 0,
      cumulative_changeover_cost: 0,
      allergen_profile_key: 'milk',
    });
  });

  it('is deterministic regardless of input order or allergen order', () => {
    const a = wo({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', due: '2026-06-01T08:00:00.000Z', allergens: ['soy', 'milk'] });
    const b = wo({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', due: '2026-06-02T08:00:00.000Z', allergens: ['nuts'] });
    const c = wo({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', due: '2026-06-03T08:00:00.000Z', allergens: ['milk', 'soy'] });
    const entries = [
      matrix('milk', 'nuts', 20),
      matrix('soy', 'nuts', 20),
      matrix('milk', 'soy', 0),
      matrix('soy', 'milk', 0),
    ];

    const first = seq([a, b, c], entries).map((assignment) => assignment.wo_id);
    const second = seq([c, b, a], entries).map((assignment) => assignment.wo_id);

    expect(first).toEqual(second);
    expect(first).toEqual([a.id, c.id, b.id]);
  });

  it('uses due_date as the tie-break when changeover costs are equal', () => {
    const anchor = wo({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', due: '2026-06-01T08:00:00.000Z', allergens: ['milk'] });
    const earlier = wo({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', due: '2026-06-02T08:00:00.000Z', allergens: ['soy'] });
    const later = wo({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', due: '2026-06-03T08:00:00.000Z', allergens: ['nuts'] });
    const entries = [matrix('milk', 'soy', 10), matrix('milk', 'nuts', 10), matrix('soy', 'nuts', 10)];

    const result = seq([later, earlier, anchor], entries);

    expect(result.map((assignment) => assignment.wo_id)).toEqual([anchor.id, earlier.id, later.id]);
  });

  it('beats naive due-date ordering when the changeover matrix makes reordering cheaper', () => {
    const a = wo({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', due: '2026-06-01T08:00:00.000Z', allergens: ['milk'] });
    const b = wo({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', due: '2026-06-02T08:00:00.000Z', allergens: ['nuts'] });
    const c = wo({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', due: '2026-06-03T08:00:00.000Z', allergens: ['milk'] });
    const entries = [
      matrix('milk', 'nuts', 60, { requires_cleaning: false }),
      matrix('nuts', 'milk', 60, { requires_cleaning: false }),
      matrix('milk', 'milk', 0, { requires_cleaning: false }),
    ];

    const greedy = seq([a, b, c], entries);
    const greedyTotal = greedy.at(-1)?.cumulative_changeover_cost ?? 0;
    const naiveTotal = naiveDueDateTotal([a, b, c], entries);

    expect(greedy.map((assignment) => assignment.wo_id)).toEqual([a.id, c.id, b.id]);
    expect(greedyTotal).toBeLessThan(naiveTotal);
    expect(greedyTotal).toBe(60);
    expect(naiveTotal).toBe(120);
  });

  it('time-phases assignments per line without past or start-after-end times', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z'));
    const otherLine = '55555555-5555-4555-8555-555555555555';
    const a = wo({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      due: '2026-06-01T08:00:00.000Z',
      allergens: ['milk'],
      scheduledStart: '2026-06-01T08:00:00.000Z',
      scheduledEnd: '2026-06-01T10:00:00.000Z',
    });
    const b = wo({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      due: '2026-06-02T08:00:00.000Z',
      allergens: ['nuts'],
      scheduledStart: '2026-06-02T08:00:00.000Z',
      scheduledEnd: '2026-06-02T07:00:00.000Z',
    });
    const c = wo({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      due: '2026-06-03T08:00:00.000Z',
      allergens: ['soy'],
      lineId: otherLine,
      scheduledStart: '2026-06-01T08:00:00.000Z',
      scheduledEnd: '2026-06-01T09:00:00.000Z',
    });

    const result = seq([a, b, c], []);
    const now = new Date('2026-06-24T12:00:00.000Z').getTime();
    for (const assignment of result) {
      const start = new Date(assignment.planned_start_at).getTime();
      const end = new Date(assignment.planned_end_at ?? '').getTime();
      expect(start).toBeGreaterThanOrEqual(now);
      expect(end).toBeGreaterThanOrEqual(start);
    }
    expect(result.find((assignment) => assignment.wo_id === a.id)?.planned_start_at).toBe(
      '2026-06-24T12:00:00.000Z',
    );
    expect(result.find((assignment) => assignment.wo_id === a.id)?.planned_end_at).toBe(
      '2026-06-24T14:00:00.000Z',
    );
    expect(result.find((assignment) => assignment.wo_id === b.id)?.planned_start_at).toBe(
      '2026-06-24T14:00:00.000Z',
    );
    expect(result.find((assignment) => assignment.wo_id === b.id)?.planned_end_at).toBe(
      '2026-06-24T15:00:00.000Z',
    );
    expect(result.find((assignment) => assignment.wo_id === c.id)?.planned_start_at).toBe(
      '2026-06-24T12:00:00.000Z',
    );
  });

  it('derives a positive duration for open WOs from routing/process masters', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z'));
    const openWo = wo({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      due: '2026-06-03T08:00:00.000Z',
      allergens: ['milk'],
      routingDurationMs: 2 * 60 * 60 * 1000,
    });

    const result = seq([openWo], []);
    const start = new Date(result[0].planned_start_at).getTime();
    const end = new Date(result[0].planned_end_at ?? '').getTime();

    expect(end - start).toBe(2 * 60 * 60 * 1000);
  });

  it('avoids segregated allergen transitions when a same-profile alternative exists', () => {
    const anchor = wo({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', due: '2026-06-01T08:00:00.000Z', allergens: ['milk'] });
    const same = wo({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', due: '2026-06-02T08:00:00.000Z', allergens: ['milk'] });
    const segregated = wo({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', due: '2026-06-03T08:00:00.000Z', allergens: ['nuts'] });
    const entries = [
      matrix('milk', 'milk', 0),
      matrix('milk', 'nuts', 5, { risk_level: 'segregated' }),
      matrix('nuts', 'milk', 5, { risk_level: 'segregated' }),
    ];

    const result = seq([segregated, same, anchor], entries);

    expect(result.map((assignment) => assignment.wo_id)).toEqual([anchor.id, same.id]);
    expect(result).toHaveLength(2);
  });

  it('rejects segregated adjacency even when it would minimize changeover minutes', () => {
    const milkA = wo({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', due: '2026-06-01T08:00:00.000Z', allergens: ['milk'] });
    const milkB = wo({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', due: '2026-06-02T08:00:00.000Z', allergens: ['milk'] });
    const nuts = wo({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', due: '2026-06-03T08:00:00.000Z', allergens: ['nuts'] });
    const entries = [
      matrix('milk', 'milk', 0),
      matrix('milk', 'nuts', 1, { risk_level: 'segregated' }),
      matrix('nuts', 'milk', 1, { risk_level: 'segregated' }),
      matrix('milk', 'nuts', 100, { risk_level: 'low' }),
    ];

    const result = seq([nuts, milkB, milkA], entries);

    expect(result.map((assignment) => assignment.wo_id)).toEqual([milkA.id, milkB.id]);
    expect(result).toHaveLength(2);
  });

  it('schedules mandatory cleaning and ATP step time before the next WO', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z'));
    const first = wo({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      due: '2026-06-01T08:00:00.000Z',
      allergens: ['milk'],
      scheduledStart: '2026-06-01T08:00:00.000Z',
      scheduledEnd: '2026-06-01T09:00:00.000Z',
    });
    const second = wo({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      due: '2026-06-02T08:00:00.000Z',
      allergens: ['soy'],
      scheduledStart: '2026-06-02T08:00:00.000Z',
      scheduledEnd: '2026-06-02T09:00:00.000Z',
    });
    const entries = [
      matrix('milk', 'soy', 10, { requires_cleaning: true, requires_atp: true, risk_level: 'high' }),
    ];

    const result = seq([first, second], entries);
    const gapMinutes =
      (new Date(result[1].planned_start_at).getTime() - new Date(result[0].planned_end_at ?? '').getTime()) /
      (60 * 1000);

    expect(gapMinutes).toBe(10 + CLEANING_STEP_MINUTES + ATP_STEP_MINUTES);
    expect(result[1].changeover_cost).toBe(10 + CLEANING_STEP_MINUTES + ATP_STEP_MINUTES);
  });

  it('orders by due date only when sequencingStrategy is greedy', () => {
    const anchor = wo({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', due: '2026-06-01T08:00:00.000Z', allergens: ['milk'] });
    const cheaperLater = wo({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', due: '2026-06-03T08:00:00.000Z', allergens: ['soy'] });
    const expensiveEarlier = wo({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', due: '2026-06-02T08:00:00.000Z', allergens: ['nuts'] });
    const entries = [matrix('milk', 'soy', 0), matrix('milk', 'nuts', 60), matrix('nuts', 'soy', 0)];

    const result = seq([cheaperLater, expensiveEarlier, anchor], entries, {
      ...DEFAULT_SEQUENCE_SOLVER_CONFIG,
      sequencingStrategy: 'greedy',
    });

    expect(result.map((assignment) => assignment.wo_id)).toEqual([anchor.id, expensiveEarlier.id, cheaperLater.id]);
  });

  it('rolls work past the daily capacity bucket when capacityHoursPerDay is set', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z'));
    const first = wo({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      due: '2026-06-01T08:00:00.000Z',
      allergens: ['milk'],
      scheduledStart: '2026-06-01T08:00:00.000Z',
      scheduledEnd: '2026-06-01T12:00:00.000Z',
    });
    const second = wo({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      due: '2026-06-02T08:00:00.000Z',
      allergens: ['soy'],
      scheduledStart: '2026-06-02T08:00:00.000Z',
      scheduledEnd: '2026-06-02T10:00:00.000Z',
    });

    const result = seq([first, second], [], {
      ...DEFAULT_SEQUENCE_SOLVER_CONFIG,
      capacityHoursPerDay: 4,
    });

    expect(result[1].planned_start_at).toBe('2026-06-25T00:00:00.000Z');
  });

  it('enforces finite daily capacity by default while explicit null opts out', () => {
    const lineKey = LINE_ID;
    const earliestMs = Date.parse('2026-06-24T16:00:00.000Z');
    const runDurationMs = 60 * 60 * 1000;
    const used = new Map([[`${lineKey}|2026-06-24`, 16 * 60 * 60 * 1000]]);

    const withDefault = __resolvePlannedStartForTests(
      lineKey,
      earliestMs,
      runDurationMs,
      DEFAULT_SEQUENCE_SOLVER_CONFIG,
      new Map(used),
    );
    const withoutCapacity = __resolvePlannedStartForTests(
      lineKey,
      earliestMs,
      runDurationMs,
      { ...DEFAULT_SEQUENCE_SOLVER_CONFIG, capacityHoursPerDay: null },
      new Map(used),
    );

    expect(withDefault).toBe(Date.parse('2026-06-25T00:00:00.000Z'));
    expect(withoutCapacity).toBe(earliestMs);
  });

  it('moves a WO at 00:44 into its line 06:00–14:00 shift window', () => {
    const nowMs = Date.parse('2026-06-24T00:44:00.000Z');
    const result = seq(
      [wo({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        due: '2026-06-24T12:00:00.000Z',
        allergens: ['milk'],
        routingDurationMs: 60 * 60 * 1000,
      })],
      [],
      {
        ...DEFAULT_SEQUENCE_SOLVER_CONFIG,
        nowMs,
        shiftCalendarLineIds: [LINE_ID],
        shiftWindows: [{
          line_id: LINE_ID,
          start_at: '2026-06-24T06:00:00.000Z',
          end_at: '2026-06-24T14:00:00.000Z',
        }],
      },
    );

    expect(result[0].planned_start_at).toBe('2026-06-24T06:00:00.000Z');
  });

  it('keeps always-available behavior when a line has no shift assignment', () => {
    const nowMs = Date.parse('2026-06-24T00:44:00.000Z');
    const result = seq(
      [wo({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        due: '2026-06-24T12:00:00.000Z',
        allergens: ['milk'],
        routingDurationMs: 60 * 60 * 1000,
      })],
      [],
      {
        ...DEFAULT_SEQUENCE_SOLVER_CONFIG,
        nowMs,
        shiftCalendarLineIds: [],
        shiftWindows: [],
      },
    );

    expect(result[0].planned_start_at).toBe('2026-06-24T00:44:00.000Z');
  });

  it('default solver output changes when PM windows are present', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z'));
    const first = wo({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      due: '2026-06-01T08:00:00.000Z',
      allergens: ['milk'],
      scheduledStart: '2026-06-01T08:00:00.000Z',
      scheduledEnd: '2026-06-01T09:00:00.000Z',
    });
    const second = wo({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      due: '2026-06-02T08:00:00.000Z',
      allergens: ['soy'],
      scheduledStart: '2026-06-02T08:00:00.000Z',
      scheduledEnd: '2026-06-02T09:00:00.000Z',
    });

    const withoutPm = seq([first, second], [], {
      ...DEFAULT_SEQUENCE_SOLVER_CONFIG,
      respectPmWindows: false,
    });
    const withPm = seq([first, second], [], {
      ...DEFAULT_SEQUENCE_SOLVER_CONFIG,
      pmWindows: [
        {
          line_id: LINE_ID,
          start_at: '2026-06-24T13:00:00.000Z',
          end_at: '2026-06-24T15:00:00.000Z',
        },
      ],
    });

    expect(withoutPm[1].planned_start_at).toBe('2026-06-24T13:00:00.000Z');
    expect(withPm[1].planned_start_at).toBe('2026-06-24T15:00:00.000Z');
  });

  it('keeps schedules below the default cap unchanged when capacityHoursPerDay is null', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z'));
    const first = wo({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      due: '2026-06-01T08:00:00.000Z',
      allergens: ['milk'],
      scheduledStart: '2026-06-01T08:00:00.000Z',
      scheduledEnd: '2026-06-01T10:00:00.000Z',
    });
    const second = wo({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      due: '2026-06-02T08:00:00.000Z',
      allergens: ['soy'],
      scheduledStart: '2026-06-02T08:00:00.000Z',
      scheduledEnd: '2026-06-02T11:00:00.000Z',
    });

    const baseline = seq([first, second], [], DEFAULT_SEQUENCE_SOLVER_CONFIG);
    const withNullCapacity = seq([first, second], [], {
      ...DEFAULT_SEQUENCE_SOLVER_CONFIG,
      capacityHoursPerDay: null,
    });

    expect(withNullCapacity).toEqual(baseline);
  });

  it('applies per-line capacity buckets independently on multi-line runs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z'));
    const LINE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const LINE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const lineAFirst = wo({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      due: '2026-06-01T08:00:00.000Z',
      allergens: ['milk'],
      lineId: LINE_A,
      scheduledStart: '2026-06-01T08:00:00.000Z',
      scheduledEnd: '2026-06-01T12:00:00.000Z',
    });
    const lineASecond = wo({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      due: '2026-06-02T08:00:00.000Z',
      allergens: ['soy'],
      lineId: LINE_A,
      scheduledStart: '2026-06-02T08:00:00.000Z',
      scheduledEnd: '2026-06-02T10:00:00.000Z',
    });
    const lineBFirst = wo({
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      due: '2026-06-03T08:00:00.000Z',
      allergens: ['nuts'],
      lineId: LINE_B,
      scheduledStart: '2026-06-03T08:00:00.000Z',
      scheduledEnd: '2026-06-03T12:00:00.000Z',
    });
    const lineBSecond = wo({
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      due: '2026-06-04T08:00:00.000Z',
      allergens: ['wheat'],
      lineId: LINE_B,
      scheduledStart: '2026-06-04T08:00:00.000Z',
      scheduledEnd: '2026-06-04T10:00:00.000Z',
    });

    const result = seq(
      [lineAFirst, lineASecond, lineBFirst, lineBSecond],
      [],
      {
        ...DEFAULT_SEQUENCE_SOLVER_CONFIG,
        capacityHoursPerDay: null,
        capacityHoursPerDayByLine: {
          [LINE_A]: 4,
          [LINE_B]: 8,
        },
      },
    );

    const byWo = Object.fromEntries(result.map((row) => [row.wo_id, row.planned_start_at]));
    expect(byWo[lineASecond.id]).toBe('2026-06-25T00:00:00.000Z');
    expect(byWo[lineBSecond.id]).toBe('2026-06-24T16:00:00.000Z');
  });

  it('does not charge cross-line changeover when global sequence spans different lines', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z'));
    const LINE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const LINE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const lineAFirst = wo({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      due: '2026-06-01T08:00:00.000Z',
      allergens: ['milk'],
      lineId: LINE_A,
      scheduledStart: '2026-06-01T08:00:00.000Z',
      scheduledEnd: '2026-06-01T09:00:00.000Z',
    });
    const lineBFirst = wo({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      due: '2026-06-02T08:00:00.000Z',
      allergens: ['nuts'],
      lineId: LINE_B,
      scheduledStart: '2026-06-02T08:00:00.000Z',
      scheduledEnd: '2026-06-02T09:00:00.000Z',
    });
    const lineBSecond = wo({
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      due: '2026-06-03T08:00:00.000Z',
      allergens: ['soy'],
      lineId: LINE_B,
      scheduledStart: '2026-06-03T08:00:00.000Z',
      scheduledEnd: '2026-06-03T09:00:00.000Z',
    });
    const entries = [
      matrix('milk', 'nuts', 30, { requires_cleaning: false }),
      matrix('milk', 'soy', 45, { requires_cleaning: true }),
      matrix('nuts', 'soy', 15, { requires_cleaning: false }),
    ];

    const result = seq([lineAFirst, lineBFirst, lineBSecond], entries);
    const lineBSecondAssignment = result.find((row) => row.wo_id === lineBSecond.id);

    expect(lineBSecondAssignment?.changeover_cost).toBe(15);
    expect(lineBSecondAssignment?.planned_start_at).toBe('2026-06-24T13:15:00.000Z');
  });

  it('applies same-line changeover against the per-line predecessor', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z'));
    const LINE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const lineAFirst = wo({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      due: '2026-06-01T08:00:00.000Z',
      allergens: ['milk'],
      lineId: LINE_A,
      scheduledStart: '2026-06-01T08:00:00.000Z',
      scheduledEnd: '2026-06-01T09:00:00.000Z',
    });
    const lineASecond = wo({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      due: '2026-06-02T08:00:00.000Z',
      allergens: ['soy'],
      lineId: LINE_A,
      scheduledStart: '2026-06-02T08:00:00.000Z',
      scheduledEnd: '2026-06-02T09:00:00.000Z',
    });
    const entries = [matrix('milk', 'soy', 20, { requires_cleaning: false })];

    const result = seq([lineAFirst, lineASecond], entries);
    const gapMinutes =
      (new Date(result[1].planned_start_at).getTime() - new Date(result[0].planned_end_at ?? '').getTime()) /
      (60 * 1000);

    expect(gapMinutes).toBe(20);
    expect(result[1].changeover_cost).toBe(20);
  });

  it('rolls the second run to the next day when changeover plus two runs exceed daily capacity (N-PLN-2)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T00:00:00.000Z'));
    const first = wo({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      due: '2026-06-01T08:00:00.000Z',
      allergens: ['milk'],
      scheduledStart: '2026-06-01T08:00:00.000Z',
      scheduledEnd: '2026-06-01T16:00:00.000Z',
    });
    const second = wo({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      due: '2026-06-02T08:00:00.000Z',
      allergens: ['soy'],
      scheduledStart: '2026-06-02T08:00:00.000Z',
      scheduledEnd: '2026-06-02T16:00:00.000Z',
    });
    const entries = [matrix('milk', 'soy', 240, { requires_cleaning: false, requires_atp: false })];

    const result = seq([first, second], entries, {
      ...DEFAULT_SEQUENCE_SOLVER_CONFIG,
      capacityHoursPerDay: 16,
    });

    expect(result[0].planned_start_at).toBe('2026-06-24T00:00:00.000Z');
    expect(result[0].planned_end_at).toBe('2026-06-24T08:00:00.000Z');
    expect(result[1].planned_start_at).toBe('2026-06-25T00:00:00.000Z');
    expect(result[1].planned_end_at).toBe('2026-06-25T08:00:00.000Z');
    expect(result[1].changeover_cost).toBe(240);
  });

  it('charges changeover minutes against the daily capacity budget (N-PLN-2)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T00:00:00.000Z'));
    const lineKey = LINE_ID;
    const dayUsageMs = new Map<string, number>();
    const runDurationMs = 8 * 60 * 60 * 1000;
    const changeoverMs = 4 * 60 * 60 * 1000;
    const config = { ...DEFAULT_SEQUENCE_SOLVER_CONFIG, capacityHoursPerDay: 16 };

    __resolvePlannedStartForTests(lineKey, Date.parse('2026-06-24T00:00:00.000Z'), runDurationMs, config, dayUsageMs);
    __resolvePlannedStartForTests(
      lineKey,
      Date.parse('2026-06-24T12:00:00.000Z'),
      runDurationMs,
      config,
      dayUsageMs,
      { startMs: Date.parse('2026-06-24T08:00:00.000Z'), durationMs: changeoverMs },
    );

    expect(dayUsageMs.get(`${lineKey}|2026-06-24`)).toBe(12 * 60 * 60 * 1000);
    expect(dayUsageMs.get(`${lineKey}|2026-06-25`)).toBe(8 * 60 * 60 * 1000);
  });

  it('splits an 8h WO across two 6h/day buckets instead of bypassing capacity', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T00:00:00.000Z'));
    const eightHourWo = wo({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      due: '2026-06-01T08:00:00.000Z',
      allergens: ['milk'],
      scheduledStart: '2026-06-01T08:00:00.000Z',
      scheduledEnd: '2026-06-01T16:00:00.000Z',
    });

    const result = seq([eightHourWo], [], {
      ...DEFAULT_SEQUENCE_SOLVER_CONFIG,
      capacityHoursPerDay: 6,
    });

    expect(result[0].planned_start_at).toBe('2026-06-24T18:00:00.000Z');
    expect(result[0].planned_end_at).toBe('2026-06-25T02:00:00.000Z');
  });

  it('reserves 1h on day one and 3h on day two for a 4h WO starting at 23:00 UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T00:00:00.000Z'));
    const lineKey = LINE_ID;
    const dayUsageMs = new Map<string, number>();
    const runDurationMs = 4 * 60 * 60 * 1000;
    const earliestMs = Date.parse('2026-06-24T23:00:00.000Z');

    const plannedStart = __resolvePlannedStartForTests(
      lineKey,
      earliestMs,
      runDurationMs,
      { ...DEFAULT_SEQUENCE_SOLVER_CONFIG, capacityHoursPerDay: 6 },
      dayUsageMs,
    );

    expect(plannedStart).toBe(earliestMs);
    expect(dayUsageMs.get(`${lineKey}|2026-06-24`)).toBe(1 * 60 * 60 * 1000);
    expect(dayUsageMs.get(`${lineKey}|2026-06-25`)).toBe(3 * 60 * 60 * 1000);
  });

  it('bumps the 361st one-minute WO after 360 fill a 6-hour bucket without float drift', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T00:00:00.000Z'));
    const dayUsageMs = new Map<string, number>();
    const lineKey = LINE_ID;
    const config = { ...DEFAULT_SEQUENCE_SOLVER_CONFIG, capacityHoursPerDay: 6 };
    const oneMinuteMs = 60 * 1000;
    const sixHoursMs = 6 * 60 * 60 * 1000;
    let cursor = Date.parse('2026-06-24T00:00:00.000Z');

    for (let index = 0; index < 360; index += 1) {
      cursor = __resolvePlannedStartForTests(lineKey, cursor, oneMinuteMs, config, dayUsageMs);
      cursor += oneMinuteMs;
    }

    expect(dayUsageMs.get(`${lineKey}|2026-06-24`)).toBe(sixHoursMs);

    const bumpedStart = __resolvePlannedStartForTests(lineKey, cursor, oneMinuteMs, config, dayUsageMs);
    expect(bumpedStart).toBe(Date.parse('2026-06-25T00:00:00.000Z'));
    expect(dayUsageMs.get(`${lineKey}|2026-06-25`)).toBe(oneMinuteMs);
  });

  it('throws SequenceCapacityInfeasibleError instead of silently scheduling over capacity', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T00:00:00.000Z'));
    const dayUsageMs = new Map<string, number>();
    const sixHoursMs = 6 * 60 * 60 * 1000;
    for (let day = 0; day < 400; day += 1) {
      const dayKey = new Date(Date.parse('2026-06-24T00:00:00.000Z') + day * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      dayUsageMs.set(`${LINE_ID}|${dayKey}`, sixHoursMs);
    }

    expect(() =>
      __resolvePlannedStartForTests(
        LINE_ID,
        Date.parse('2026-06-24T00:00:00.000Z'),
        8 * 60 * 60 * 1000,
        { ...DEFAULT_SEQUENCE_SOLVER_CONFIG, capacityHoursPerDay: 6 },
        dayUsageMs,
      ),
    ).toThrow(SequenceCapacityInfeasibleError);
  });

  it('moves a released WO after an open-ended in-progress line occupation', () => {
    const nowMs = Date.parse('2026-06-24T08:00:00.000Z');
    const activeWo = wo({
      id: 'active-wo',
      due: '2026-06-23T08:00:00.000Z',
      allergens: ['milk'],
      scheduledStart: '2026-06-23T08:00:00.000Z',
      routingDurationMs: 3 * 60 * 60 * 1000,
    });
    activeWo.status = 'IN_PROGRESS';

    const releasedWo = wo({
      id: 'released-wo',
      due: new Date(nowMs + 24 * 60 * 60 * 1000).toISOString(),
      allergens: ['milk'],
      routingDurationMs: 60 * 60 * 1000,
    });
    releasedWo.status = 'RELEASED';

    const withoutOccupancy = seq([releasedWo], [], {
      ...DEFAULT_SEQUENCE_SOLVER_CONFIG,
      nowMs,
    });
    const preoccupied = buildPreoccupiedSeed(
      [activeWo],
      { ...DEFAULT_SEQUENCE_SOLVER_CONFIG, nowMs },
    );
    const withOccupancy = seq([releasedWo], [], {
      ...DEFAULT_SEQUENCE_SOLVER_CONFIG,
      nowMs,
      preoccupied,
    });

    expect(withoutOccupancy[0].planned_start_at).toBe('2026-06-24T08:00:00.000Z');
    expect(withOccupancy[0].planned_start_at).toBe('2026-06-24T11:00:00.000Z');
  });

  it('schedules milk then nuts when no changeover matrix is configured (permissive)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z'));
    const milk = wo({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      due: '2026-06-01T08:00:00.000Z',
      allergens: ['milk'],
      scheduledStart: '2026-06-01T08:00:00.000Z',
      scheduledEnd: '2026-06-01T09:00:00.000Z',
    });
    const nuts = wo({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      due: '2026-06-02T08:00:00.000Z',
      allergens: ['nuts'],
      scheduledStart: '2026-06-02T08:00:00.000Z',
      scheduledEnd: '2026-06-02T09:00:00.000Z',
    });

    const result = seq([milk, nuts], []);

    expect(result.map((assignment) => assignment.wo_id)).toEqual([milk.id, nuts.id]);
    expect(result).toHaveLength(2);
  });

  it('defers a WO when a configured matrix lacks the milk→nuts pair', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z'));
    const milk = wo({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      due: '2026-06-01T08:00:00.000Z',
      allergens: ['milk'],
      scheduledStart: '2026-06-01T08:00:00.000Z',
      scheduledEnd: '2026-06-01T09:00:00.000Z',
    });
    const nuts = wo({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      due: '2026-06-02T08:00:00.000Z',
      allergens: ['nuts'],
      scheduledStart: '2026-06-02T08:00:00.000Z',
      scheduledEnd: '2026-06-02T09:00:00.000Z',
    });
    const entries = [matrix('milk', 'milk', 0)];

    const result = seq([milk, nuts], entries);

    expect(result.map((assignment) => assignment.wo_id)).toEqual([milk.id]);
    expect(result).toHaveLength(1);
  });

  it('does not schedule milk then nuts adjacent under greedy when milk→nuts is missing from the matrix', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z'));
    const milk = wo({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      due: '2026-06-01T08:00:00.000Z',
      allergens: ['milk'],
      scheduledStart: '2026-06-01T08:00:00.000Z',
      scheduledEnd: '2026-06-01T09:00:00.000Z',
    });
    const nuts = wo({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      due: '2026-06-02T08:00:00.000Z',
      allergens: ['nuts'],
      scheduledStart: '2026-06-02T08:00:00.000Z',
      scheduledEnd: '2026-06-02T09:00:00.000Z',
    });
    const entries = [matrix('milk', 'milk', 0)];

    const result = sequenceWorkOrders([milk, nuts], entries, {
      ...DEFAULT_SEQUENCE_SOLVER_CONFIG,
      sequencingStrategy: 'greedy',
    });

    expect(result.assignments.map((assignment) => assignment.wo_id)).toEqual([milk.id]);
    expect(result.omitted).toEqual([
      { wo_id: nuts.id, reason: 'no_feasible_changeover' },
    ]);
  });

  it('surfaces omitted work orders with no_feasible_changeover in the solver result', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z'));
    const milk = wo({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      due: '2026-06-01T08:00:00.000Z',
      allergens: ['milk'],
      scheduledStart: '2026-06-01T08:00:00.000Z',
      scheduledEnd: '2026-06-01T09:00:00.000Z',
    });
    const nuts = wo({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      due: '2026-06-02T08:00:00.000Z',
      allergens: ['nuts'],
      scheduledStart: '2026-06-02T08:00:00.000Z',
      scheduledEnd: '2026-06-02T09:00:00.000Z',
    });
    const entries = [matrix('milk', 'milk', 0)];

    const result = sequenceWorkOrders([milk, nuts], entries);

    expect(result.assignments).toHaveLength(1);
    expect(result.omitted).toEqual([
      { wo_id: nuts.id, reason: 'no_feasible_changeover' },
    ]);
  });

  it('omits a WO longer than the longest shift window and schedules the rest', () => {
    const nowMs = Date.parse('2026-06-24T12:00:00.000Z');
    const shiftConfig = {
      ...DEFAULT_SEQUENCE_SOLVER_CONFIG,
      capacityHoursPerDay: null,
      nowMs,
      shiftCalendarLineIds: [LINE_ID],
      shiftWindows: [{
        line_id: LINE_ID,
        start_at: '2026-06-24T06:00:00.000Z',
        end_at: '2026-06-24T14:00:00.000Z',
      }],
    };
    const fits = wo({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      due: '2026-06-01T08:00:00.000Z',
      allergens: ['milk'],
      routingDurationMs: 2 * 60 * 60 * 1000,
    });
    const tooLong = wo({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      due: '2026-06-02T08:00:00.000Z',
      allergens: ['milk'],
      routingDurationMs: 10 * 60 * 60 * 1000,
    });

    const result = sequenceWorkOrders([fits, tooLong], [], shiftConfig);

    expect(result.assignments.map((assignment) => assignment.wo_id)).toEqual([fits.id]);
    expect(result.omitted).toEqual([
      { wo_id: tooLong.id, reason: 'no_feasible_capacity' },
    ]);
  });

  it('does not abort the run when the first WO exceeds the longest shift window', () => {
    const nowMs = Date.parse('2026-06-24T12:00:00.000Z');
    const shiftConfig = {
      ...DEFAULT_SEQUENCE_SOLVER_CONFIG,
      capacityHoursPerDay: null,
      nowMs,
      shiftCalendarLineIds: [LINE_ID],
      shiftWindows: [{
        line_id: LINE_ID,
        start_at: '2026-06-24T06:00:00.000Z',
        end_at: '2026-06-24T14:00:00.000Z',
      }],
    };
    const tooLong = wo({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      due: '2026-06-01T08:00:00.000Z',
      allergens: ['milk'],
      routingDurationMs: 10 * 60 * 60 * 1000,
    });
    const fits = wo({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      due: '2026-06-02T08:00:00.000Z',
      allergens: ['milk'],
      routingDurationMs: 2 * 60 * 60 * 1000,
    });

    const result = sequenceWorkOrders([tooLong, fits], [], shiftConfig);

    expect(result.assignments.map((assignment) => assignment.wo_id)).toEqual([fits.id]);
    expect(result.omitted).toEqual([
      { wo_id: tooLong.id, reason: 'no_feasible_capacity' },
    ]);
  });
});

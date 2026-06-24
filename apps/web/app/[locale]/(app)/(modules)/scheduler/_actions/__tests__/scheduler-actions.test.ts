import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SchedulerAssignment, SchedulerRunRow, WorkOrderForScheduling } from '../scheduler-types';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const RUN_ID = '33333333-3333-4333-8333-333333333333';
const LINE_ID = '44444444-4444-4444-8444-444444444444';
const WO_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WO_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let client: QueryClient;
let allowPermission = true;
let calls: Array<{ sql: string; params: readonly unknown[] }> = [];
let insertedAssignmentPayload: Array<Record<string, unknown>> = [];
let runAlreadyApplied = false;

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

import { applySchedule, runScheduler } from '../scheduler-actions';

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function runRow(outputSummary: SchedulerRunRow['output_summary'] = { assignment_count: 2 }): SchedulerRunRow {
  return {
    run_id: RUN_ID,
    org_id: ORG_ID,
    site_id: null,
    requested_by: USER_ID,
    status: 'completed',
    horizon_days: 7,
    line_ids: [LINE_ID],
    include_forecast: null,
    optimizer_version: 'e8-greedy-v1',
    run_type: 'schedule',
    input_snapshot: { line_id: LINE_ID, horizon_days: 7, open_work_order_count: 2 },
    output_summary: outputSummary,
    solve_duration_ms: 4,
    error_message: null,
    queued_at: '2026-06-01T00:00:00.000Z',
    started_at: '2026-06-01T00:00:00.000Z',
    completed_at: '2026-06-01T00:00:00.000Z',
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  };
}

function assignmentRow(input: {
  id: string;
  woId: string;
  sequence: number;
  start: string;
  changeover: number;
}): SchedulerAssignment {
  return {
    id: input.id,
    org_id: ORG_ID,
    site_id: null,
    run_id: RUN_ID,
    wo_id: input.woId,
    line_id: LINE_ID,
    status: 'draft',
    sequence_index: String(input.sequence),
    planned_start_at: input.start,
    planned_end_at: null,
    changeover_minutes: String(input.changeover),
    optimizer_score: String(input.changeover),
    override_original_line_id: null,
    override_original_start_at: null,
    override_reason_code: null,
    override_by: null,
    override_at: null,
    approved_by: null,
    approved_at: null,
    ext: {},
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  };
}

function wo(input: { id: string; due: string; allergens: string[] }): WorkOrderForScheduling {
  return {
    id: input.id,
    org_id: ORG_ID,
    site_id: null,
    wo_number: `WO-${input.id.slice(0, 4)}`,
    product_id: '55555555-5555-4555-8555-555555555555',
    item_code: 'FG-001',
    item_name: 'Finished Good',
    status: 'DRAFT',
    planned_quantity: '100.000',
    uom: 'kg',
    production_line_id: LINE_ID,
    planned_start_date: input.due,
    planned_end_date: input.due,
    scheduled_start_time: null,
    scheduled_end_time: null,
    due_date: input.due,
    allergen_ids: input.allergens,
  };
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);
      calls.push({ sql, params });

      if (q.includes('from public.user_roles')) {
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }

      if (q.includes('from public.work_orders wo') && q.includes('item_allergen_profiles')) {
        return {
          rows: [
            wo({ id: WO_A, due: '2026-06-01T08:00:00.000Z', allergens: ['milk'] }),
            wo({ id: WO_B, due: '2026-06-02T08:00:00.000Z', allergens: ['nuts'] }),
          ],
          rowCount: 2,
        };
      }

      if (q.includes('from public.changeover_matrix cm') && q.includes('cmv.is_active = true')) {
        return {
          rows: [
            {
              id: '66666666-6666-4666-8666-666666666666',
              org_id: ORG_ID,
              site_id: null,
              version_id: '77777777-7777-4777-8777-777777777777',
              line_id: null,
              allergen_from: 'milk',
              allergen_to: 'nuts',
              changeover_minutes: '30.00',
              requires_cleaning: true,
              requires_atp: false,
              risk_level: 'low',
              notes: null,
              created_at: '2026-06-01T00:00:00.000Z',
              updated_at: '2026-06-01T00:00:00.000Z',
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('insert into public.scheduler_runs')) {
        return { rows: [runRow()], rowCount: 1 };
      }

      if (q.startsWith('insert into public.scheduler_assignments')) {
        insertedAssignmentPayload = JSON.parse(String(params[1])) as Array<Record<string, unknown>>;
        return {
          rows: insertedAssignmentPayload.map((payload, index) =>
            assignmentRow({
              id: `${index + 1}`.repeat(8).slice(0, 8) + '-1111-4111-8111-111111111111',
              woId: String(payload.wo_id),
              sequence: Number(payload.sequence_index),
              start: String(payload.planned_start_at),
              changeover: Number(payload.changeover_minutes),
            }),
          ),
          rowCount: insertedAssignmentPayload.length,
        };
      }

      if (q.includes('from public.scheduler_runs') && q.includes('where org_id = app.current_org_id()')) {
        return { rows: [runRow(runAlreadyApplied ? { applied_at: '2026-06-01T12:00:00.000Z' } : {})], rowCount: 1 };
      }

      if (q.includes('from public.scheduler_assignments')) {
        return {
          rows: [assignmentRow({ id: '88888888-8888-4888-8888-888888888888', woId: WO_A, sequence: 1, start: '2026-06-01T08:00:00.000Z', changeover: 0 })],
          rowCount: 1,
        };
      }

      if (q.startsWith('update public.work_orders')) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.scheduler_runs')) {
        return { rows: [runRow({ applied_at: '2026-06-01T12:00:00.000Z' })], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

beforeEach(() => {
  allowPermission = true;
  calls = [];
  insertedAssignmentPayload = [];
  runAlreadyApplied = false;
  client = makeClient();
});

describe('runScheduler', () => {
  it('inserts one scheduler_runs row and one scheduler_assignments payload per sequenced WO', async () => {
    const result = await runScheduler({ lineId: LINE_ID, horizonDays: 7 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.run.run_id).toBe(RUN_ID);
    expect(result.assignments).toHaveLength(2);
    expect(calls.some((call) => normalize(call.sql).startsWith('insert into public.scheduler_runs'))).toBe(true);
    expect(calls.some((call) => normalize(call.sql).startsWith('insert into public.scheduler_assignments'))).toBe(true);
    expect(insertedAssignmentPayload).toHaveLength(2);
    expect(insertedAssignmentPayload.map((row) => row.wo_id)).toEqual([WO_A, WO_B]);
    expect(insertedAssignmentPayload.map((row) => row.sequence_index)).toEqual([1, 2]);
    expect(insertedAssignmentPayload[1]).toEqual(
      expect.objectContaining({ changeover_minutes: 30, optimizer_score: 30, line_id: LINE_ID }),
    );
    expect(calls.find((call) => normalize(call.sql).includes('from public.user_roles'))?.params[2]).toBe('npd.planning.write');
  });
});

describe('applySchedule', () => {
  it('is idempotent when the run output_summary already has applied_at', async () => {
    runAlreadyApplied = true;

    const result = await applySchedule(RUN_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.applied).toBe(false);
    expect(calls.some((call) => normalize(call.sql).startsWith('update public.work_orders'))).toBe(false);
    expect(calls.some((call) => normalize(call.sql).startsWith('update public.scheduler_runs'))).toBe(false);
  });
});

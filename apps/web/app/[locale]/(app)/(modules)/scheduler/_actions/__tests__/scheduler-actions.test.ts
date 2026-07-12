import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChangeoverMatrixEntry, SchedulerAssignment, SchedulerRunRow, WorkOrderForScheduling } from '../scheduler-types';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const REQUESTER_USER_ID = '22222222-2222-4222-8222-222222222222';
const APPROVER_USER_ID = '33333333-3333-4333-8333-333333333333';
const RUN_ID = '44444444-4444-4444-8444-444444444444';
const LINE_ID = '44444444-4444-4444-8444-444444444444';
const SITE_ID = '88888888-8888-4888-8888-888888888888';
const LINE_OVERRIDE_ID = '99999999-9999-4999-8999-999999999999';
const WO_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WO_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let client: QueryClient;
let allowPermission = true;
let currentUserId = REQUESTER_USER_ID;
let calls: Array<{ sql: string; params: readonly unknown[] }> = [];
let insertedAssignmentPayload: Array<Record<string, unknown>> = [];
let runAlreadyApplied = false;
let includeLineSpecificOverride = false;
let includeSchedulerConfig = true;
let schedulerConfigRows: Array<Record<string, unknown>> = [];
let assignmentRows: SchedulerAssignment[] = [];
let staleWoIds = new Set<string>();

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: currentUserId, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../../../lib/site/site-context', () => ({
  getActiveSiteId: vi.fn(async () => SITE_ID),
}));

import { applySchedule, listChangeoverMatrix, runScheduler, upsertChangeoverMatrixEntry } from '../scheduler-actions';
import { DEFAULT_SEQUENCE_SOLVER_CONFIG, sequenceWorkOrders } from '../sequence-solver';

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function runRow(outputSummary: SchedulerRunRow['output_summary'] = { assignment_count: 2 }): SchedulerRunRow {
  return {
    run_id: RUN_ID,
    org_id: ORG_ID,
    site_id: null,
    requested_by: REQUESTER_USER_ID,
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
  end?: string | null;
  changeover: number;
  status?: SchedulerAssignment['status'];
  approvedBy?: string | null;
  approvedAt?: string | null;
}): SchedulerAssignment {
  return {
    id: input.id,
    org_id: ORG_ID,
    site_id: null,
    run_id: RUN_ID,
    wo_id: input.woId,
    line_id: LINE_ID,
    status: input.status ?? 'draft',
    sequence_index: String(input.sequence),
    planned_start_at: input.start,
    planned_end_at: input.end ?? null,
    changeover_minutes: String(input.changeover),
    optimizer_score: String(input.changeover),
    override_original_line_id: null,
    override_original_start_at: null,
    override_reason_code: null,
    override_by: null,
    override_at: null,
    approved_by: input.approvedBy ?? null,
    approved_at: input.approvedAt ?? null,
    ext: {},
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  };
}

function matrixEntry(over: Partial<ChangeoverMatrixEntry> = {}): ChangeoverMatrixEntry {
  return {
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
    ...over,
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
    routing_duration_ms: '3600000',
    process_duration_ms: null,
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

      if (q.includes('from public.scheduler_config')) {
        if (!includeSchedulerConfig) {
          return { rows: [], rowCount: 0 };
        }
        return {
          rows: schedulerConfigRows,
          rowCount: schedulerConfigRows.length,
        };
      }

      if (
        q.includes('from public.maintenance_work_orders') ||
        q.includes('from public.maintenance_schedules')
      ) {
        return {
          rows: [
            {
              line_id: LINE_ID,
              start_at: '2026-06-24T13:00:00.000Z',
              end_at: '2026-06-24T16:00:00.000Z',
            },
          ],
          rowCount: 1,
        };
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
        const defaultRow = matrixEntry();
        const lineOverride = matrixEntry({
          id: '99999999-9999-4999-8999-999999999999',
          line_id: LINE_OVERRIDE_ID,
          changeover_minutes: '120.00',
        });
        const hasOrgDefaultOnlyFilter = q.includes('($1::text is null and cm.line_id is null)');
        return {
          rows: includeLineSpecificOverride && !(params[0] === null && hasOrgDefaultOnlyFilter)
            ? [defaultRow, lineOverride]
            : [defaultRow],
          rowCount: includeLineSpecificOverride ? 2 : 1,
        };
      }

      if (q.startsWith('insert into public.outbox_events')) {
        return { rows: [], rowCount: 1 };
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
          rows: assignmentRows,
          rowCount: assignmentRows.length,
        };
      }

      if (q.startsWith('update public.work_orders')) {
        return { rows: [], rowCount: staleWoIds.has(String(params[0])) ? 0 : 1 };
      }

      if (q.startsWith('update public.scheduler_assignments')) {
        const found = assignmentRows.find((row) => row.id === params[0]);
        return {
          rows: found
            ? [
                {
                  ...found,
                  status: 'approved',
                  approved_by: APPROVER_USER_ID,
                  approved_at: '2026-06-01T12:00:00.000Z',
                  updated_at: '2026-06-01T12:00:00.000Z',
                } satisfies SchedulerAssignment,
              ]
            : [],
          rowCount: found ? 1 : 0,
        };
      }

      if (q.startsWith('update public.scheduler_runs')) {
        return { rows: [runRow({ applied_at: '2026-06-01T12:00:00.000Z' })], rowCount: 1 };
      }

      if (q.startsWith('update public.changeover_matrix')) {
        return { rows: [matrixEntry({ id: String(params[0]), changeover_minutes: '15.00' })], rowCount: 1 };
      }

      if (q.includes('from public.changeover_matrix')) {
        return { rows: [matrixEntry()], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

beforeEach(() => {
  allowPermission = true;
  currentUserId = REQUESTER_USER_ID;
  calls = [];
  insertedAssignmentPayload = [];
  runAlreadyApplied = false;
  includeLineSpecificOverride = false;
  includeSchedulerConfig = true;
  schedulerConfigRows = [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      org_id: ORG_ID,
      site_id: null,
      line_id: null,
      default_horizon_days: 14,
      optimizer_version: 'v2',
      sequencing_strategy: 'allergen_optimized',
      capacity_hours_per_day: '16.00',
      changeover_weight: '2.0000',
      duedate_weight: '1.0000',
      utilization_weight: '1.0000',
      respect_pm_windows: true,
      allow_alternate_routings: false,
      params: { pm_block_hours: 3 },
      created_by: null,
      updated_by: null,
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    },
  ];
  assignmentRows = [
    assignmentRow({
      id: '88888888-8888-4888-8888-888888888888',
      woId: WO_A,
      sequence: 1,
      start: '2026-06-01T08:00:00.000Z',
      changeover: 0,
    }),
  ];
  staleWoIds = new Set<string>();
  client = makeClient();
});

afterEach(() => {
  vi.useRealTimers();
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
      expect.objectContaining({ changeover_minutes: 45, optimizer_score: 45, line_id: LINE_ID }),
    );
    expect(calls.find((call) => normalize(call.sql).includes('from public.user_roles'))?.params[2]).toBe('scheduler.run.dispatch');
    expect(
      calls.some(
        (call) =>
          normalize(call.sql).startsWith('insert into public.outbox_events') &&
          call.params[0] === 'scheduler.run.completed',
      ),
    ).toBe(true);
  });

  it('keeps org-wide null-line runs on org-default matrix rows only', async () => {
    includeLineSpecificOverride = true;

    const result = await runScheduler({ horizonDays: 7 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    const matrixCall = calls.find((call) => normalize(call.sql).includes('from public.changeover_matrix cm'));
    expect(matrixCall?.params[0]).toBeNull();
    expect(normalize(matrixCall?.sql ?? '')).toContain('($1::text is null and cm.line_id is null)');
    expect(insertedAssignmentPayload[1]).toEqual(
      expect.objectContaining({ changeover_minutes: 45, optimizer_score: 45 }),
    );
  });

  it('reads scheduler_config when building the solver input', async () => {
    const result = await runScheduler({ lineId: LINE_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(calls.some((call) => normalize(call.sql).includes('from public.scheduler_config'))).toBe(true);
  });

  it('loads PM windows from maintenance when respect_pm_windows is enabled', async () => {
    const result = await runScheduler({ lineId: LINE_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(
      calls.some((call) => normalize(call.sql).includes('from public.maintenance_work_orders')),
    ).toBe(true);
  });

  it('keeps no-config runs byte-identical to the default solver and skips PM window loading', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T12:00:00.000Z'));
    includeSchedulerConfig = false;
    const defaultPmWindows = DEFAULT_SEQUENCE_SOLVER_CONFIG.pmWindows;

    const workOrders = [
      wo({ id: WO_A, due: '2026-06-01T08:00:00.000Z', allergens: ['milk'] }),
      wo({ id: WO_B, due: '2026-06-02T08:00:00.000Z', allergens: ['nuts'] }),
    ];
    const matrix = [matrixEntry()];
    const expected = sequenceWorkOrders(workOrders, matrix, {
      ...DEFAULT_SEQUENCE_SOLVER_CONFIG,
      pmWindows: [],
    });

    const result = await runScheduler({ lineId: LINE_ID, horizonDays: 7 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(
      calls.some(
        (call) =>
          normalize(call.sql).includes('from public.maintenance_work_orders') ||
          normalize(call.sql).includes('from public.maintenance_schedules'),
      ),
    ).toBe(false);
    expect(DEFAULT_SEQUENCE_SOLVER_CONFIG.pmWindows).toBe(defaultPmWindows);
    expect(insertedAssignmentPayload.map((row) => row.planned_start_at)).toEqual(
      expected.map((row) => row.planned_start_at),
    );
    expect(insertedAssignmentPayload.map((row) => row.planned_end_at)).toEqual(
      expected.map((row) => row.planned_end_at),
    );
    expect(insertedAssignmentPayload.map((row) => row.sequence_index)).toEqual(
      expected.map((row) => row.sequence_index),
    );
  });
});

describe('applySchedule', () => {
  beforeEach(() => {
    currentUserId = APPROVER_USER_ID;
  });

  it('is idempotent when the run output_summary already has applied_at', async () => {
    runAlreadyApplied = true;

    const result = await applySchedule(RUN_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.applied).toBe(false);
    expect(result.stale).toEqual([]);
    expect(calls.some((call) => normalize(call.sql).startsWith('update public.work_orders'))).toBe(false);
    expect(calls.some((call) => normalize(call.sql).startsWith('update public.scheduler_runs'))).toBe(false);
  });

  it('skips a stale COMPLETED work order and returns it in stale[]', async () => {
    assignmentRows = [
      assignmentRow({
        id: '88888888-8888-4888-8888-888888888888',
        woId: WO_A,
        sequence: 1,
        start: '2026-06-01T08:00:00.000Z',
        changeover: 0,
      }),
      assignmentRow({
        id: '99999999-9999-4999-8999-999999999999',
        woId: WO_B,
        sequence: 2,
        start: '2026-06-01T10:00:00.000Z',
        changeover: 30,
      }),
    ];
    staleWoIds = new Set([WO_B]);

    const result = await applySchedule(RUN_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(Array.isArray(result.applied)).toBe(true);
    expect(Array.isArray(result.applied) ? result.applied.map((row) => row.wo_id) : []).toEqual([WO_A]);
    expect(result.stale.map((row) => row.wo_id)).toEqual([WO_B]);
    const workOrderUpdate = calls.find((call) => normalize(call.sql).startsWith('update public.work_orders'));
    expect(normalize(workOrderUpdate?.sql ?? '')).toContain("wo.status in ('draft', 'released')");
  });

  it('stamps applied assignments as approved by the distinct approver user', async () => {
    const result = await applySchedule(RUN_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    const applied = Array.isArray(result.applied) ? result.applied : [];
    expect(applied).toHaveLength(1);
    expect(applied[0]).toEqual(
      expect.objectContaining({
        status: 'approved',
        approved_by: APPROVER_USER_ID,
        approved_at: '2026-06-01T12:00:00.000Z',
      }),
    );
    const assignmentUpdate = calls.find((call) => normalize(call.sql).startsWith('update public.scheduler_assignments'));
    expect(normalize(assignmentUpdate?.sql ?? '')).toContain("status = 'approved'");
    expect(assignmentUpdate?.params[1]).toBe(APPROVER_USER_ID);
  });

  it('rejects apply when the approver is the same user who requested the run (SoD)', async () => {
    currentUserId = REQUESTER_USER_ID;

    const result = await applySchedule(RUN_ID);

    expect(result).toEqual({ ok: false, error: 'sod_violation' });
    expect(calls.some((call) => normalize(call.sql).startsWith('update public.work_orders'))).toBe(false);
  });

  it('filters rejected and cancelled assignments out of the apply set', async () => {
    await applySchedule(RUN_ID);

    const loadCall = calls.find((call) => normalize(call.sql).includes('from public.scheduler_assignments'));
    expect(normalize(loadCall?.sql ?? '')).toContain("status not in ('rejected', 'cancelled')");
  });

  it('emits planning.schedule.published for an apply attempt', async () => {
    await applySchedule(RUN_ID);

    expect(
      calls.some(
        (call) =>
          normalize(call.sql).startsWith('insert into public.outbox_events') &&
          call.params[0] === 'planning.schedule.published',
      ),
    ).toBe(true);
  });

  it('A3-S9: scopes the solver input to RELEASED work orders on the active site', async () => {
    await runScheduler({ lineId: LINE_ID, horizonDays: 7 });

    const woCall = calls.find((call) => normalize(call.sql).includes('from public.work_orders wo'));
    expect(woCall).toBeDefined();
    expect(woCall?.params?.[0]).toEqual(['RELEASED']);
    expect(woCall?.params?.[3]).toBe(SITE_ID);
    expect(normalize(woCall?.sql ?? '')).toContain('pl.site_id = $4::uuid');
  });
});

describe('scheduler RBAC gates', () => {
  it('uses the scheduler-specific permission strings', async () => {
    await runScheduler({ lineId: LINE_ID, horizonDays: 7 });
    expect(calls.find((call) => normalize(call.sql).includes('from public.user_roles'))?.params[2]).toBe(
      'scheduler.run.dispatch',
    );

    calls = [];
    currentUserId = APPROVER_USER_ID;
    await applySchedule(RUN_ID);
    expect(calls.find((call) => normalize(call.sql).includes('from public.user_roles'))?.params[2]).toBe(
      'scheduler.assignment.approve',
    );

    calls = [];
    await upsertChangeoverMatrixEntry({ id: '66666666-6666-4666-8666-666666666666', changeover_minutes: '15.00' });
    expect(calls.find((call) => normalize(call.sql).includes('from public.user_roles'))?.params[2]).toBe(
      'scheduler.matrix.edit',
    );

    calls = [];
    await listChangeoverMatrix();
    expect(calls.find((call) => normalize(call.sql).includes('from public.user_roles'))?.params[2]).toBe(
      'scheduler.matrix.read',
    );
  });
});

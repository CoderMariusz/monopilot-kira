/**
 * /planning/schedule Server Action tests — rescheduleWorkOrder validations
 * (legal-state gate, range, line-org check, V-PLAN-WO-CYCLE guard, audit row)
 * + getScheduleBoard RBAC/read shape. Mirrors releaseWorkOrder.test.ts:
 * withOrgContext is mocked and the fake client dispatches on SQL shape.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getScheduleBoard, rescheduleWorkOrder } from './schedule-board';
import type { QueryClient } from '../../work-orders/_actions/shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const WO_B = '44444444-4444-4444-8444-444444444444';
const LINE_ID = '55555555-5555-4555-8555-555555555555';
const SITE_ID = '66666666-6666-4666-8666-666666666666';

const START = '2026-06-12T08:00:00.000Z';
const END = '2026-06-12T16:00:00.000Z';

let client: QueryClient;
let allowPermission = true;
let currentStatus: string | null = 'DRAFT';
let updateVisibleStatus: string | null = null;
let lineExists = true;
let dependencyEdges: Array<{ parent_wo_id: string; child_wo_id: string }> = [];

const { getActiveSiteIdMock } = vi.hoisted(() => ({
  getActiveSiteIdMock: vi.fn(),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../../../lib/site/site-context', () => ({
  getActiveSiteId: getActiveSiteIdMock,
}));

const WO_ROW = {
  id: WO_ID,
  wo_number: 'WO-2026-0001',
  status: 'DRAFT',
  priority: 'normal',
  production_line_id: LINE_ID,
  scheduled_start_time: START,
  scheduled_end_time: END,
  planned_quantity: '1000.000',
  uom: 'kg',
  item_code: null,
  item_name: null,
};

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
      if (normalized.includes('from public.user_roles')) {
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }
      if (normalized.includes('select status, scheduled_start_time')) {
        return {
          rows: currentStatus
            ? [{ status: currentStatus, scheduled_start_time: null, scheduled_end_time: null, production_line_id: null, site_id: SITE_ID }]
            : [],
          rowCount: currentStatus ? 1 : 0,
        };
      }
      if (normalized.includes('from public.production_lines') && normalized.includes('order by code')) {
        // getScheduleBoard lines read
        return { rows: [{ id: LINE_ID, code: 'LINE-01', name: 'Line One' }], rowCount: 1 };
      }
      if (normalized.includes('from public.production_lines')) {
        // rescheduleWorkOrder line-belongs-to-org check
        return { rows: lineExists ? [{ id: LINE_ID }] : [], rowCount: lineExists ? 1 : 0 };
      }
      if (normalized.includes('from public.wo_dependencies')) {
        return { rows: dependencyEdges, rowCount: dependencyEdges.length };
      }
      if (normalized.startsWith('update public.work_orders')) {
        const expectedStatus = params[6];
        const visibleStatus = updateVisibleStatus ?? currentStatus;
        return visibleStatus === expectedStatus ? { rows: [WO_ROW], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (normalized.startsWith('insert into public.wo_status_history')) {
        return { rows: [], rowCount: 1 };
      }
      if (normalized.includes('from public.work_orders')) {
        // getScheduleBoard scheduled/unscheduled reads
        return { rows: [WO_ROW], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('rescheduleWorkOrder', () => {
  beforeEach(() => {
    getActiveSiteIdMock.mockResolvedValue(SITE_ID);
    allowPermission = true;
    currentStatus = 'DRAFT';
    updateVisibleStatus = null;
    lineExists = true;
    dependencyEdges = [];
    client = makeClient();
  });

  it('updates the schedule and writes a reschedule audit row (happy path)', async () => {
    const result = await rescheduleWorkOrder({ woId: WO_ID, lineId: LINE_ID, scheduledStart: START, scheduledEnd: END });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.workOrder).toEqual(
      expect.objectContaining({ id: WO_ID, scheduledStart: START, scheduledEnd: END, productionLineId: LINE_ID }),
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('update public.work_orders'),
      [WO_ID, START, END, LINE_ID, USER_ID, ['DRAFT', 'RELEASED'], 'DRAFT'],
    );
    const lockRead = vi
      .mocked(client.query)
      .mock.calls.find(([sql]) => String(sql).replace(/\s+/g, ' ').toLowerCase().includes('select status, scheduled_start_time'));
    expect(String(lockRead?.[0])).toContain('for update');
    // Audit row like the neighbours: action 'reschedule', status unchanged.
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("'reschedule'"),
      expect.arrayContaining([WO_ID, 'DRAFT', USER_ID]),
    );
  });

  it('keeps the current line when lineId is omitted (passes NULL to coalesce)', async () => {
    const result = await rescheduleWorkOrder({ woId: WO_ID, scheduledStart: START, scheduledEnd: END });

    expect(result.ok).toBe(true);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('coalesce($4::uuid, wo.production_line_id)'),
      [WO_ID, START, END, null, USER_ID, ['DRAFT', 'RELEASED'], 'DRAFT'],
    );
    // No line-existence check is run when no line is supplied.
    expect(client.query).not.toHaveBeenCalledWith(
      expect.stringContaining('from public.production_lines'),
      expect.anything(),
    );
  });

  it('rejects end <= start with invalid_range before touching the DB', async () => {
    await expect(
      rescheduleWorkOrder({ woId: WO_ID, scheduledStart: END, scheduledEnd: START }),
    ).resolves.toEqual({ ok: false, error: 'invalid_range' });
    await expect(
      rescheduleWorkOrder({ woId: WO_ID, scheduledStart: START, scheduledEnd: START }),
    ).resolves.toEqual({ ok: false, error: 'invalid_range' });
    expect(client.query).not.toHaveBeenCalled();
  });

  it('rejects malformed input with zod issues', async () => {
    const result = await rescheduleWorkOrder({ woId: 'not-a-uuid', scheduledStart: 'soon', scheduledEnd: 'later' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toBe('invalid_input');
    expect(result.issues?.length).toBeGreaterThan(0);
  });

  it('returns forbidden when the caller lacks the WO write permission', async () => {
    allowPermission = false;

    await expect(
      rescheduleWorkOrder({ woId: WO_ID, scheduledStart: START, scheduledEnd: END }),
    ).resolves.toEqual({ ok: false, error: 'forbidden' });
  });

  it('returns not_found for an unknown WO', async () => {
    currentStatus = null;

    await expect(
      rescheduleWorkOrder({ woId: WO_ID, scheduledStart: START, scheduledEnd: END }),
    ).resolves.toEqual({ ok: false, error: 'not_found' });
  });

  it.each(['IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CLOSED', 'CANCELLED'])(
    'legal-state gate: rejects %s with invalid_state',
    async (status) => {
      currentStatus = status;

      await expect(
        rescheduleWorkOrder({ woId: WO_ID, scheduledStart: START, scheduledEnd: END }),
      ).resolves.toEqual({ ok: false, error: 'invalid_state' });
    },
  );

  it('accepts RELEASED (the other legal state)', async () => {
    currentStatus = 'RELEASED';

    const result = await rescheduleWorkOrder({ woId: WO_ID, scheduledStart: START, scheduledEnd: END });
    expect(result.ok).toBe(true);
  });

  it('returns invalid_state when status changes between read and update', async () => {
    currentStatus = 'DRAFT';
    updateVisibleStatus = 'IN_PROGRESS';

    const result = await rescheduleWorkOrder({ woId: WO_ID, scheduledStart: START, scheduledEnd: END });

    expect(result).toEqual({ ok: false, error: 'invalid_state' });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('and wo.status = $7'),
      [WO_ID, START, END, null, USER_ID, ['DRAFT', 'RELEASED'], 'DRAFT'],
    );
  });

  it('rejects a line that is not an active line of the org', async () => {
    lineExists = false;

    await expect(
      rescheduleWorkOrder({ woId: WO_ID, lineId: LINE_ID, scheduledStart: START, scheduledEnd: END }),
    ).resolves.toEqual({ ok: false, error: 'invalid_line' });
  });

  it('V-PLAN-WO-CYCLE: refuses to move a WO sitting on a cyclic dependency chain', async () => {
    dependencyEdges = [
      { parent_wo_id: WO_ID, child_wo_id: WO_B },
      { parent_wo_id: WO_B, child_wo_id: WO_ID },
    ];

    const result = await rescheduleWorkOrder({ woId: WO_ID, scheduledStart: START, scheduledEnd: END });

    expect(result).toEqual({ ok: false, error: 'dependency_cycle', cycle: [WO_ID, WO_B, WO_ID] });
    expect(client.query).not.toHaveBeenCalledWith(
      expect.stringContaining('update public.work_orders'),
      expect.anything(),
    );
  });

  it('V-PLAN-WO-CYCLE: an acyclic dependency chain does not block rescheduling', async () => {
    dependencyEdges = [{ parent_wo_id: WO_ID, child_wo_id: WO_B }];

    const result = await rescheduleWorkOrder({ woId: WO_ID, scheduledStart: START, scheduledEnd: END });
    expect(result.ok).toBe(true);
  });
});

describe('getScheduleBoard', () => {
  beforeEach(() => {
    getActiveSiteIdMock.mockResolvedValue(SITE_ID);
    allowPermission = true;
    client = makeClient();
  });

  it('returns forbidden without scheduler.run.read', async () => {
    allowPermission = false;

    await expect(getScheduleBoard()).resolves.toEqual({ ok: false, error: 'forbidden' });
  });

  it('returns lines + scheduled + unscheduled with a 7-day window', async () => {
    const result = await getScheduleBoard();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.lines).toEqual([{ id: LINE_ID, code: 'LINE-01', name: 'Line One' }]);
    expect(result.data.scheduled[0]).toEqual(
      expect.objectContaining({ id: WO_ID, woNumber: 'WO-2026-0001', scheduledStart: START }),
    );
    const spanMs = Date.parse(result.data.windowEnd) - Date.parse(result.data.windowStart);
    expect(spanMs).toBe(7 * 24 * 60 * 60 * 1000);
    // Board statuses only — the query is pinned to DRAFT/RELEASED/IN_PROGRESS.
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('wo.scheduled_start_time is not null'),
      expect.arrayContaining([['DRAFT', 'RELEASED', 'IN_PROGRESS'], SITE_ID]),
    );
    const workOrderReads = vi
      .mocked(client.query)
      .mock.calls.filter(([sql]) => String(sql).includes('from public.work_orders wo'));
    expect(workOrderReads).toHaveLength(2);
    expect(workOrderReads[0]?.[0]).toContain('wo.site_id = $4::uuid');
    expect(workOrderReads[0]?.[1]).toEqual([
      ['DRAFT', 'RELEASED', 'IN_PROGRESS'],
      expect.any(String),
      expect.any(String),
      SITE_ID,
    ]);
    expect(workOrderReads[1]?.[0]).toContain('wo.site_id = $2::uuid');
    expect(workOrderReads[1]?.[1]).toEqual([['DRAFT', 'RELEASED', 'IN_PROGRESS'], SITE_ID]);
  });

  it('fails closed with no active site before running board reads', async () => {
    getActiveSiteIdMock.mockResolvedValue(null);

    const result = await getScheduleBoard();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data).toMatchObject({
      lines: [],
      scheduled: [],
      unscheduled: [],
      noActiveSite: true,
    });
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(vi.mocked(client.query).mock.calls[0]?.[0]).toContain('from public.user_roles');
  });
});

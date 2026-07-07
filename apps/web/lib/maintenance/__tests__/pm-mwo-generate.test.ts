/**
 * PM schedule due engine — unit tests (mocked client).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  advancePmScheduleOnMwoCompletion,
  generateMwoFromPmScheduleCore,
  listDuePmScheduleIds,
  runPmScheduleDueEngine,
} from '../pm-mwo-generate';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const SCHEDULE_ID = '55555555-5555-4555-8555-555555555555';
const EQUIPMENT_ID = '33333333-3333-4333-8333-333333333333';
const SITE_ID = '77777777-7777-4777-8777-777777777777';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

let duplicateOpenMwo = false;
let scheduleNextDueDate = '2026-07-01';
const SCHEDULE_INTERVAL_DAYS = 30;
let client: QueryClient;

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      const n = normalize(sql);

      if (n.startsWith('select s.id::text from public.maintenance_schedules')) {
        const warningDays = 7;
        const dueCutoff = new Date('2026-07-08T00:00:00.000Z');
        const dueDate = new Date(`${scheduleNextDueDate}T00:00:00.000Z`);
        const isDue = dueDate <= dueCutoff;
        return isDue ? { rows: [{ id: SCHEDULE_ID }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (n.includes('from public.maintenance_schedules s') && n.includes('order by s.next_due_date')) {
        return { rows: [{ id: SCHEDULE_ID }], rowCount: 1 };
      }

      if (n.includes('from public.maintenance_schedules s') && n.includes('join public.equipment e')) {
        return {
          rows: [
            {
              id: SCHEDULE_ID,
              schedule_type: 'preventive',
              site_id: SITE_ID,
              equipment_id: EQUIPMENT_ID,
              equipment_code: 'EQ-01',
              next_due_date: scheduleNextDueDate,
              warning_days: 7,
              active: true,
            },
          ],
          rowCount: 1,
        };
      }

      if (n.startsWith('update public.maintenance_schedules s')) {
        const intervalDays = Number(params?.[1] === null ? SCHEDULE_INTERVAL_DAYS : SCHEDULE_INTERVAL_DAYS);
        const current = new Date(`${scheduleNextDueDate}T00:00:00.000Z`);
        current.setUTCDate(current.getUTCDate() + intervalDays);
        scheduleNextDueDate = current.toISOString().slice(0, 10);
        return { rows: [{ id: SCHEDULE_ID }], rowCount: 1 };
      }

      if (n.includes('pg_advisory_xact_lock')) {
        return { rows: [{}], rowCount: 1 };
      }

      if (n.includes('w.schedule_id = $1::uuid')) {
        return duplicateOpenMwo
          ? { rows: [{ id: 'existing-mwo' }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }

      if (n.includes("'mwo-' || to_char")) {
        return { rows: [{ mwo_number: 'MWO-2026-00099' }], rowCount: 1 };
      }

      if (n.startsWith('insert into public.maintenance_work_orders')) {
        return { rows: [{ id: 'new-mwo-id', mwo_number: 'MWO-2026-00099' }], rowCount: 1 };
      }

      if (n.startsWith('insert into public.outbox_events')) {
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

beforeEach(() => {
  duplicateOpenMwo = false;
  scheduleNextDueDate = '2026-07-01';
  client = makeClient();
});

describe('runPmScheduleDueEngine', () => {
  it('creates exactly one planned MWO for a due schedule', async () => {
    const summary = await runPmScheduleDueEngine({
      orgId: ORG_ID,
      actorUserId: null,
      client,
    });

    expect(summary).toMatchObject({
      schedulesScanned: 1,
      created: 1,
      skippedOpen: 0,
      errors: 0,
    });
    expect(vi.mocked(client.query).mock.calls.some((c) => normalize(c[0]).startsWith('insert into public.maintenance_work_orders'))).toBe(true);
  });

  it('is idempotent — re-run skips duplicate open backlog', async () => {
    duplicateOpenMwo = true;

    const summary = await runPmScheduleDueEngine({
      orgId: ORG_ID,
      actorUserId: null,
      client,
    });

    expect(summary).toMatchObject({
      schedulesScanned: 1,
      created: 0,
      skippedOpen: 1,
    });
    expect(
      vi.mocked(client.query).mock.calls.some((c) => normalize(c[0]).startsWith('insert into public.maintenance_work_orders')),
    ).toBe(false);
  });
});

describe('generateMwoFromPmScheduleCore', () => {
  it('emits source=pm_schedule for preventive schedules', async () => {
    const result = await generateMwoFromPmScheduleCore(
      { orgId: ORG_ID, actorUserId: null, client },
      SCHEDULE_ID,
      { skipDueWindowCheck: true },
    );

    expect(result).toMatchObject({ ok: true, created: true, mwoNumber: 'MWO-2026-00099' });
    const insert = vi.mocked(client.query).mock.calls.find((c) => normalize(c[0]).startsWith('insert into public.maintenance_work_orders'));
    expect(insert?.[1]?.[2]).toBe('pm_schedule');
  });
});

describe('listDuePmScheduleIds', () => {
  it('returns calendar-due active schedule ids', async () => {
    const ids = await listDuePmScheduleIds({ orgId: ORG_ID, actorUserId: null, client });
    expect(ids).toEqual([SCHEDULE_ID]);
  });
});

describe('advancePmScheduleOnMwoCompletion', () => {
  it('rolls calendar-day next_due_date forward by interval_value', async () => {
    const result = await advancePmScheduleOnMwoCompletion(
      { orgId: ORG_ID, actorUserId: 'actor-1', client },
      SCHEDULE_ID,
    );

    expect(result).toEqual({ advanced: true });
    expect(scheduleNextDueDate).toBe('2026-07-31');
    const update = vi.mocked(client.query).mock.calls.find((c) =>
      normalize(c[0]).startsWith('update public.maintenance_schedules s'),
    );
    expect(update?.[1]?.[0]).toBe(SCHEDULE_ID);
    expect(update?.[1]?.[1]).toBe('actor-1');
  });
});

describe('complete then due-scan', () => {
  it('does not regenerate an MWO for the same period after schedule advancement', async () => {
    const first = await runPmScheduleDueEngine({
      orgId: ORG_ID,
      actorUserId: null,
      client,
    });
    expect(first).toMatchObject({ schedulesScanned: 1, created: 1 });

    duplicateOpenMwo = false;
    await advancePmScheduleOnMwoCompletion(
      { orgId: ORG_ID, actorUserId: 'actor-1', client },
      SCHEDULE_ID,
    );

    const second = await runPmScheduleDueEngine({
      orgId: ORG_ID,
      actorUserId: null,
      client,
    });
    expect(second).toMatchObject({
      schedulesScanned: 0,
      created: 0,
      skippedOpen: 0,
    });
    expect(scheduleNextDueDate).toBe('2026-07-31');
  });
});

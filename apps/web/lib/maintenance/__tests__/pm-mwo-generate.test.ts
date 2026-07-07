/**
 * PM schedule due engine — unit tests (mocked client).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
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
let client: QueryClient;

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      const n = normalize(sql);

      if (n.startsWith('select s.id::text from public.maintenance_schedules')) {
        return { rows: [{ id: SCHEDULE_ID }], rowCount: 1 };
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
              next_due_date: '2026-07-01',
              warning_days: 7,
              active: true,
            },
          ],
          rowCount: 1,
        };
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

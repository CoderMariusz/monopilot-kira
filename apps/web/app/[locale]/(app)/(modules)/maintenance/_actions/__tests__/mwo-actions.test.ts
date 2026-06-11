/**
 * 13-MAINTENANCE — MWO Server Action tests (Wave-8 lane CL1).
 *
 * Mirrors the production output-qa-actions.test.ts harness: withOrgContext is
 * mocked to hand the action a scripted QueryClient; every SQL the action runs
 * is matched on its normalized text. Covers: RBAC forbidden paths (the FIRST
 * enforcement of the migration-202 mnt.* seed), create happy path + machine
 * validation + outbox emit, every legal transition, the illegal-transition
 * rejection, and the SoD split (execute vs cancel permissions).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMwo, listMwos, listPmSchedules, transitionMwo } from '../mwo-actions';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const MACHINE_ID = '33333333-3333-4333-8333-333333333333';
const MWO_ID = '44444444-4444-4444-8444-444444444444';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

let grantedPermissions: Set<string>;
let machineExists = true;
let currentState = 'open';
let client: QueryClient;

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      const normalized = normalize(sql);

      // RBAC probe.
      if (normalized.includes('from public.user_roles')) {
        const permission = String(params?.[2] ?? '');
        const ok = grantedPermissions.has(permission);
        return { rows: ok ? [{ ok: true }] : [], rowCount: ok ? 1 : 0 };
      }

      // listMwos: per-state tab counts.
      if (normalized.includes('group by w.state')) {
        return { rows: [{ state: 'open', n: 2 }, { state: 'completed', n: 1 }], rowCount: 2 };
      }

      // listMwos: main list read.
      if (normalized.includes('from public.maintenance_work_orders w') && normalized.includes('left join public.machines m')) {
        return {
          rows: [
            {
              id: MWO_ID,
              mwo_number: 'MWO-2026-00001',
              title: 'Mixer bearing noise',
              requester_reason: 'Loud noise from rear bearing',
              state: 'open',
              priority: 'high',
              source: 'manual_request',
              machine_id: MACHINE_ID,
              machine_code: 'MIX-01',
              machine_name: 'Mixer 1',
              due_date: '2026-06-20',
              created_at: new Date('2026-06-11T08:00:00Z'),
              started_at: null,
              completed_at: null,
            },
          ],
          rowCount: 1,
        };
      }

      // createMwo: machine org-scope validation.
      if (normalized.includes('from public.machines') && normalized.includes('id = $1::uuid')) {
        return {
          rows: machineExists ? [{ id: MACHINE_ID, code: 'MIX-01', name: 'Mixer 1' }] : [],
          rowCount: machineExists ? 1 : 0,
        };
      }

      // createMwo: advisory lock for number allocation.
      if (normalized.includes('pg_advisory_xact_lock')) {
        return { rows: [{ pg_advisory_xact_lock: '' }], rowCount: 1 };
      }

      // createMwo: number allocation.
      if (normalized.includes("'mwo-' || to_char")) {
        return { rows: [{ mwo_number: 'MWO-2026-00002' }], rowCount: 1 };
      }

      // createMwo: insert.
      if (normalized.startsWith('insert into public.maintenance_work_orders')) {
        return {
          rows: [
            {
              id: MWO_ID,
              mwo_number: 'MWO-2026-00002',
              title: params?.[5],
              requester_reason: params?.[8],
              state: 'open',
              priority: params?.[2],
              source: params?.[1],
              machine_id: params?.[3],
              machine_code: null,
              machine_name: null,
              due_date: params?.[6],
              created_at: new Date('2026-06-11T09:00:00Z'),
              started_at: null,
              completed_at: null,
            },
          ],
          rowCount: 1,
        };
      }

      // transitionMwo: FOR UPDATE state read.
      if (normalized.includes('for update')) {
        return { rows: [{ id: MWO_ID, state: currentState }], rowCount: 1 };
      }

      // transitionMwo: guarded update.
      if (normalized.startsWith('update public.maintenance_work_orders')) {
        const to = String(params?.[1]);
        currentState = to;
        return {
          rows: [
            {
              id: MWO_ID,
              mwo_number: 'MWO-2026-00001',
              title: 'Mixer bearing noise',
              requester_reason: null,
              state: to,
              priority: 'high',
              source: 'manual_request',
              machine_id: MACHINE_ID,
              machine_code: null,
              machine_name: null,
              due_date: null,
              created_at: new Date('2026-06-11T08:00:00Z'),
              started_at: to === 'in_progress' ? new Date('2026-06-11T10:00:00Z') : null,
              completed_at: to === 'completed' ? new Date('2026-06-11T11:00:00Z') : null,
            },
          ],
          rowCount: 1,
        };
      }

      // outbox writes.
      if (normalized.startsWith('insert into public.outbox_events')) {
        return { rows: [], rowCount: 1 };
      }

      // listPmSchedules.
      if (normalized.includes('from public.maintenance_schedules s')) {
        return {
          rows: [
            {
              id: '55555555-5555-4555-8555-555555555555',
              schedule_type: 'preventive',
              interval_basis: 'calendar_days',
              interval_value: 30,
              next_due_date: '2026-07-01',
              last_completed_at: null,
              active: true,
              equipment_code: 'EQ-01',
              equipment_name: 'Mixer line equipment',
            },
          ],
          rowCount: 1,
        };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

function calls(): Array<{ sql: string; params?: readonly unknown[] }> {
  return vi.mocked(client.query).mock.calls.map(([sql, params]) => ({ sql: normalize(sql), params }));
}

beforeEach(() => {
  grantedPermissions = new Set([
    'mnt.asset.read',
    'mnt.mwo.request',
    'mnt.mwo.execute',
    'mnt.mwo.cancel',
  ]);
  machineExists = true;
  currentState = 'open';
  client = makeClient();
});

describe('listMwos', () => {
  it('forbids callers without mnt.asset.read before any table read', async () => {
    grantedPermissions.clear();

    const result = await listMwos();

    expect(result).toEqual({ ok: false, reason: 'forbidden' });
    expect(calls()).toHaveLength(1);
    expect(calls()[0].sql).toContain('from public.user_roles');
  });

  it('returns machine-joined rows + zero-filled status counts', async () => {
    const result = await listMwos();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data.rows).toHaveLength(1);
    expect(result.data.rows[0]).toMatchObject({
      mwoNumber: 'MWO-2026-00001',
      title: 'Mixer bearing noise',
      state: 'open',
      priority: 'high',
      machineCode: 'MIX-01',
      machineName: 'Mixer 1',
      dueDate: '2026-06-20',
    });
    expect(result.data.statusCounts).toEqual({
      requested: 0,
      approved: 0,
      open: 2,
      in_progress: 0,
      completed: 1,
      cancelled: 0,
    });
  });

  it('passes status + machine filters through to SQL params', async () => {
    await listMwos({ status: 'in_progress', machineId: MACHINE_ID });

    const list = calls().find((c) => c.sql.includes('left join public.machines m'));
    expect(list?.params?.[0]).toBe('in_progress');
    expect(list?.params?.[1]).toBe(MACHINE_ID);
  });
});

describe('createMwo', () => {
  const input = {
    machineId: MACHINE_ID,
    title: 'Mixer bearing noise',
    description: 'Loud noise from rear bearing',
    priority: 'high' as const,
    dueDate: '2026-06-20',
  };

  it('forbids callers without mnt.mwo.request', async () => {
    grantedPermissions.delete('mnt.mwo.request');

    const result = await createMwo(input);

    expect(result).toEqual({ ok: false, reason: 'forbidden' });
    expect(calls()).toHaveLength(1);
  });

  it('creates an open reactive MWO and emits maintenance.mwo.created in-txn', async () => {
    const result = await createMwo(input);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data).toMatchObject({
      mwoNumber: 'MWO-2026-00002',
      state: 'open',
      priority: 'high',
      machineId: MACHINE_ID,
      machineCode: 'MIX-01',
      title: 'Mixer bearing noise',
    });

    const insert = calls().find((c) => c.sql.startsWith('insert into public.maintenance_work_orders'));
    expect(insert?.params?.[0]).toBe('MWO-2026-00002');
    expect(insert?.params?.[1]).toBe('manual_request');
    expect(insert?.params?.[2]).toBe('high');
    expect(insert?.params?.[3]).toBe(MACHINE_ID);
    expect(insert?.params?.[5]).toBe('Mixer bearing noise');
    expect(insert?.params?.[8]).toBe('Loud noise from rear bearing');
    expect(insert?.sql).toContain("'open'");
    expect(insert?.sql).toContain("'reactive'");

    // Advisory lock taken BEFORE the number read (no FOR UPDATE + aggregate).
    const sqls = calls().map((c) => c.sql);
    expect(sqls.findIndex((s) => s.includes('pg_advisory_xact_lock'))).toBeLessThan(
      sqls.findIndex((s) => s.includes("'mwo-' || to_char")),
    );

    const outbox = calls().find((c) => c.sql.startsWith('insert into public.outbox_events'));
    expect(outbox?.params?.[0]).toBe('maintenance.mwo.created');
    expect(String(outbox?.params?.[2])).toContain('"machine_code":"MIX-01"');
  });

  it('rejects an unknown/foreign machine with not_found and never inserts', async () => {
    machineExists = false;

    const result = await createMwo(input);

    expect(result).toEqual({ ok: false, reason: 'not_found', message: 'machine not found' });
    expect(calls().some((c) => c.sql.startsWith('insert into'))).toBe(false);
  });

  it('rejects an invalid priority at the zod boundary (no DB call)', async () => {
    const result = await createMwo({ ...input, priority: 'urgent' as never });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toBe('error');
    expect(calls()).toHaveLength(0);
  });

  it('marks source=auto_downtime when a downtime event is linked', async () => {
    const dtId = '66666666-6666-4666-8666-666666666666';
    await createMwo({ ...input, downtimeEventId: dtId });

    const insert = calls().find((c) => c.sql.startsWith('insert into public.maintenance_work_orders'));
    expect(insert?.params?.[1]).toBe('auto_downtime');
    expect(insert?.params?.[4]).toBe(dtId);
  });
});

describe('transitionMwo', () => {
  it('starts an open MWO with mnt.mwo.execute (open → in_progress)', async () => {
    currentState = 'open';

    const result = await transitionMwo({ mwoId: MWO_ID, to: 'in_progress' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data.state).toBe('in_progress');
    expect(result.data.startedAt).not.toBeNull();
    // No completion event for a start.
    expect(calls().some((c) => c.sql.startsWith('insert into public.outbox_events'))).toBe(false);
  });

  it('completes an in_progress MWO and emits maintenance.mwo.completed in-txn', async () => {
    currentState = 'in_progress';

    const result = await transitionMwo({ mwoId: MWO_ID, to: 'completed', note: 'bearing replaced' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data.state).toBe('completed');

    const outbox = calls().find((c) => c.sql.startsWith('insert into public.outbox_events'));
    expect(outbox?.params?.[0]).toBe('maintenance.mwo.completed');
    expect(String(outbox?.params?.[2])).toContain('"completion_notes":"bearing replaced"');
  });

  it('rejects the illegal completed → in_progress transition without updating', async () => {
    currentState = 'completed';

    const result = await transitionMwo({ mwoId: MWO_ID, to: 'in_progress' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toBe('invalid_transition');
    expect(calls().some((c) => c.sql.startsWith('update'))).toBe(false);
  });

  it('rejects the illegal open → completed shortcut (must start first)', async () => {
    currentState = 'open';

    const result = await transitionMwo({ mwoId: MWO_ID, to: 'completed' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.reason).toBe('invalid_transition');
  });

  it('requires mnt.mwo.cancel (not execute) for a cancel — SoD split', async () => {
    grantedPermissions.delete('mnt.mwo.cancel');
    currentState = 'open';

    const result = await transitionMwo({ mwoId: MWO_ID, to: 'cancelled', note: 'duplicate' });

    expect(result).toEqual({ ok: false, reason: 'forbidden' });
    const rbac = calls().find((c) => c.sql.includes('from public.user_roles'));
    expect(rbac?.params?.[2]).toBe('mnt.mwo.cancel');
  });

  it('cancels an in_progress MWO with mnt.mwo.cancel and stores the reason', async () => {
    currentState = 'in_progress';

    const result = await transitionMwo({ mwoId: MWO_ID, to: 'cancelled', note: 'machine scrapped' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data.state).toBe('cancelled');
    const update = calls().find((c) => c.sql.startsWith('update public.maintenance_work_orders'));
    expect(update?.params?.[2]).toBe('machine scrapped');
    expect(update?.params?.[4]).toBe('in_progress'); // from-state guard re-asserted
  });

  it('returns not_found for a missing MWO', async () => {
    client = {
      query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
        const normalized = normalize(sql);
        if (normalized.includes('from public.user_roles')) return { rows: [{ ok: true }], rowCount: 1 };
        if (normalized.includes('for update')) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      }),
    };

    const result = await transitionMwo({ mwoId: MWO_ID, to: 'in_progress' });

    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('listPmSchedules', () => {
  it('forbids callers without mnt.asset.read', async () => {
    grantedPermissions.clear();

    const result = await listPmSchedules();

    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('returns equipment-joined schedule rows', async () => {
    const result = await listPmSchedules();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      scheduleType: 'preventive',
      intervalBasis: 'calendar_days',
      intervalValue: 30,
      nextDueDate: '2026-07-01',
      active: true,
      equipmentCode: 'EQ-01',
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ROUTING_ID = '33333333-3333-4333-8333-333333333333';

type QueryCall = { sql: string; params: readonly unknown[] };

const runWithOrgContext = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('../../../items/_actions/revalidate', () => ({ safeRevalidatePath: vi.fn() }));
vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => runWithOrgContext(action)),
}));
vi.mock('../shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared')>();
  return {
    ...actual,
    hasPermission: vi.fn(async () => true),
    writeAudit: vi.fn(async () => undefined),
  };
});

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(status: string) {
  const calls: QueryCall[] = [];
  const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
    calls.push({ sql, params });
    const n = normalize(sql);
    if (n.includes('from public.user_roles')) return { rows: [{ ok: true }], rowCount: 1 };
    if (n.includes('from public.routings routing') && n.includes('for update')) {
      return { rows: [{ id: ROUTING_ID, status, item_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }], rowCount: 1 };
    }
    if (n.includes('"reference"."manufacturingoperations"')) {
      return { rows: [{ operation_name: 'Mixing' }], rowCount: 1 };
    }
    if (n.startsWith('delete from public.routing_operations')) return { rows: [], rowCount: 1 };
    if (n.startsWith('insert into public.routing_operations')) return { rows: [], rowCount: 1 };
    if (n.startsWith('insert into public.audit_log')) return { rows: [], rowCount: 1 };
    if (n.startsWith('update public.routings')) {
      return { rows: [{ id: ROUTING_ID, status: 'approved' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  return { calls, query };
}

const operation = {
  opNo: 1,
  opCode: 'OP1',
  opName: 'Mix',
  lineId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  setupTimeMin: 5,
  runTimePerUnitSec: 10,
  manufacturingOperationName: 'Mixing',
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('routing approval race locks (N-21)', () => {
  it('updateRouting locks the routing header with FOR UPDATE before replacing operations', async () => {
    const client = makeClient('draft');
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { updateRouting } = await import('../update-routing');
    const result = await updateRouting({ routingId: ROUTING_ID, operations: [operation] });

    expect(result).toEqual({ ok: true, data: { id: ROUTING_ID } });
    const lockCall = client.calls.find((call) => normalize(call.sql).includes('for update'));
    expect(lockCall).toBeDefined();
    expect(normalize(lockCall!.sql)).toContain('from public.routings routing');
    expect(client.calls.findIndex((call) => normalize(call.sql).includes('for update'))).toBeLessThan(
      client.calls.findIndex((call) => normalize(call.sql).startsWith('delete from public.routing_operations')),
    );
  });

  it('approveRouting locks the routing header with FOR UPDATE before status transition', async () => {
    const client = makeClient('draft');
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { approveRouting } = await import('../approve-routing');
    const result = await approveRouting({ routingId: ROUTING_ID });

    expect(result.ok).toBe(true);
    expect(client.calls.some((call) => normalize(call.sql).includes('for update'))).toBe(true);
  });

  it('updateRouting refuses when the row is no longer draft under the lock', async () => {
    const client = makeClient('approved');
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { updateRouting } = await import('../update-routing');
    const result = await updateRouting({ routingId: ROUTING_ID, operations: [operation] });

    expect(result).toEqual({
      ok: false,
      error: 'invalid_state',
      message: 'only a draft routing may be edited; clone a new version instead',
    });
    expect(client.calls.some((call) => normalize(call.sql).startsWith('delete from public.routing_operations'))).toBe(false);
  });
});

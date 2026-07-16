/**
 * C042 — routing labor rate + run duration must persist as exact NUMERIC strings.
 * Mocks withOrgContext; fails if create/update omit cost_per_hour from INSERT.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';
const ROUTING_ID = '44444444-4444-4444-8444-444444444444';
const LINE_ID = '55555555-5555-4555-8555-555555555555';

type QueryCall = { sql: string; params: readonly unknown[] };

const runWithOrgContext = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
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

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeCreateClient() {
  const calls: QueryCall[] = [];
  const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
    calls.push({ sql, params });
    const n = normalizeSql(sql);
    if (n.startsWith('select id from public.items')) return { rows: [{ id: ITEM_ID }], rowCount: 1 };
    if (n.includes('"reference"."manufacturingoperations"')) {
      return { rows: [{ operation_name: 'Mixing' }], rowCount: 1 };
    }
    if (n.includes('from public.production_lines')) {
      return { rows: [{ id: LINE_ID, site_id: null }], rowCount: 1 };
    }
    if (n.startsWith('select coalesce(max(version)')) return { rows: [{ next_version: 1 }], rowCount: 1 };
    if (n.startsWith('insert into public.routings')) {
      return { rows: [{ id: ROUTING_ID, status: 'draft' }], rowCount: 1 };
    }
    if (n.startsWith('insert into public.routing_operations')) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  return { calls, query };
}

function makeUpdateClient() {
  const calls: QueryCall[] = [];
  const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
    calls.push({ sql, params });
    const n = normalizeSql(sql);
    if (n.includes('from public.routings routing') && n.includes('for update')) {
      return { rows: [{ id: ROUTING_ID, status: 'draft', site_id: null }], rowCount: 1 };
    }
    if (n.includes('"reference"."manufacturingoperations"')) {
      return { rows: [{ operation_name: 'Mixing' }], rowCount: 1 };
    }
    if (n.includes('from public.production_lines')) {
      return { rows: [{ id: LINE_ID, site_id: null }], rowCount: 1 };
    }
    if (n.startsWith('delete from public.routing_operations')) return { rows: [], rowCount: 1 };
    if (n.startsWith('insert into public.routing_operations')) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  return { calls, query };
}

const opPayload = {
  opNo: 1,
  opCode: 'OP01',
  opName: 'Mix',
  lineId: LINE_ID,
  setupTimeMin: 12,
  runTimePerUnitSec: '3.333333',
  costPerHour: '27.654321',
  manufacturingOperationName: 'Mixing',
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('routing numeric precision (C042)', () => {
  it('createRouting binds run_time_per_unit_sec and cost_per_hour as exact decimal strings', async () => {
    const client = makeCreateClient();
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { createRouting } = await import('../create-routing');
    const result = await createRouting({ itemId: ITEM_ID, operations: [opPayload] });
    expect(result.ok).toBe(true);

    const insert = client.calls.find((c) => normalizeSql(c.sql).startsWith('insert into public.routing_operations'));
    expect(insert).toBeDefined();
    expect(insert!.sql).toContain('cost_per_hour');
    expect(insert!.params).toContain('3.333333');
    expect(insert!.params).toContain('27.654321');
  });

  it('updateRouting binds run_time_per_unit_sec and cost_per_hour as exact decimal strings', async () => {
    const client = makeUpdateClient();
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { updateRouting } = await import('../update-routing');
    const result = await updateRouting({
      routingId: ROUTING_ID,
      operations: [{ ...opPayload, runTimePerUnitSec: '5.555555', costPerHour: '19.876543' }],
    });
    expect(result.ok).toBe(true);

    const insert = client.calls.find((c) => normalizeSql(c.sql).startsWith('insert into public.routing_operations'));
    expect(insert).toBeDefined();
    expect(insert!.sql).toContain('cost_per_hour');
    expect(insert!.params).toContain('5.555555');
    expect(insert!.params).toContain('19.876543');
  });
});

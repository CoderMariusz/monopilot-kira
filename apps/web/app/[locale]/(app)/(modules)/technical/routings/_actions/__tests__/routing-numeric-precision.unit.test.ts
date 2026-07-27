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

import { RoutingOperationInput } from '../shared';

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

// PF-R06-09 — setup_time_min was `integer` in the DB and z.number().int() on the
// server, so 12.345 was rejected with no visible feedback. Migration 523 widens
// the column to numeric(18,6); the schema now uses the same NumericString
// contract as run time / cost per hour.
describe('PF-R06-09 — fractional setup minutes', () => {
  it('accepts a fractional setupTimeMin and keeps it as an exact decimal string', () => {
    const parsed = RoutingOperationInput.safeParse({ ...opPayload, setupTimeMin: 12.345 });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.setupTimeMin).toBe('12.345');
  });

  it('accepts the full 6 decimal places (numeric(18,6) parity with run time)', () => {
    const parsed = RoutingOperationInput.safeParse({ ...opPayload, setupTimeMin: '7.891234' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.setupTimeMin).toBe('7.891234');
  });

  it('rejects a 7th decimal place with the named max-decimal-places error', () => {
    const parsed = RoutingOperationInput.safeParse({ ...opPayload, setupTimeMin: '12.3456789' });
    expect(parsed.success).toBe(false);
    const messages = parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
    expect(messages.join(' | ')).toContain('supports at most 6 decimal places');
  });

  // R-3: `expect(success).toBe(false)` alone was green on the OLD schema too —
  // z.number().int().min(0) rejected the string '-1' as "expected number", so the
  // assertion never distinguished the new validator from the one it replaced.
  // Assert the message that only the new non-negative decimal refinement emits.
  it.each([['-1'], [-1], ['-0.5']])('rejects a negative setup time (%s) with the named error', (value) => {
    const parsed = RoutingOperationInput.safeParse({ ...opPayload, setupTimeMin: value });
    expect(parsed.success).toBe(false);
    const messages = parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
    expect(messages.join(' | ')).toContain('must be a non-negative decimal');
  });

  it('updateRouting binds setup_time_min as an exact ::numeric string (not ::integer)', async () => {
    const client = makeUpdateClient();
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { updateRouting } = await import('../update-routing');
    const result = await updateRouting({
      routingId: ROUTING_ID,
      operations: [{ ...opPayload, setupTimeMin: '12.345' }],
    });
    expect(result.ok).toBe(true);

    const insert = client.calls.find((c) => normalizeSql(c.sql).startsWith('insert into public.routing_operations'));
    expect(insert).toBeDefined();
    // $6 is setup_time_min. R-4 correction: an ::integer bind does NOT quietly
    // round — `pg` sends parameters as text, so '12.345' bound as ::integer fails
    // with an int4 input error. It was the last of three blockers (browser
    // stepMismatch, then Zod .int(), then the bind), not a rounder. ::numeric is
    // what lets a fractional changeover reach the column at all.
    expect(normalizeSql(insert!.sql)).toContain('$6::numeric');
    expect(normalizeSql(insert!.sql)).not.toContain('$6::integer');
    expect(insert!.params).toContain('12.345');
  });

  it('createRouting binds setup_time_min as an exact ::numeric string (not ::integer)', async () => {
    const client = makeCreateClient();
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { createRouting } = await import('../create-routing');
    const result = await createRouting({
      itemId: ITEM_ID,
      operations: [{ ...opPayload, setupTimeMin: '7.891234' }],
    });
    expect(result.ok).toBe(true);

    const insert = client.calls.find((c) => normalizeSql(c.sql).startsWith('insert into public.routing_operations'));
    expect(insert).toBeDefined();
    expect(normalizeSql(insert!.sql)).toContain('$6::numeric');
    expect(insert!.params).toContain('7.891234');
  });
});

// ── R-2 — the READ path was the missing sixth layer. The write was fixed to be
// NUMERIC-exact, but listRoutings put setup_time_min into jsonb_build_object as a
// NUMBER; the driver parses jsonb with JSON.parse, so the value arrived as a JS
// double and the mapper ran Number() over it again. Because opening a draft and
// pressing Save replaces the whole operation set, simply LOOKING at a routing
// persisted the rounded value.
const EXACT_18_DIGITS = '999999999999.123456';

function makeListClient(setupTimeMin: string) {
  const calls: QueryCall[] = [];
  const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
    calls.push({ sql, params });
    if (normalizeSql(sql).includes('from public.routings r')) {
      return {
        rows: [
          {
            id: ROUTING_ID,
            item_id: ITEM_ID,
            version: 3,
            status: 'draft',
            site_id: null,
            effective_from: '2026-07-01',
            effective_to: null,
            operation_count: 1,
            operations: [
              {
                op_no: 1,
                op_code: 'MIX-10',
                op_name: 'Mix',
                line_id: LINE_ID,
                // `::text` in SQL → the driver hands back a string, not a double.
                setup_time_min: setupTimeMin,
                run_time_per_unit_sec: '12.500000',
                cost_per_hour: '80.000000',
                manufacturing_operation_name: 'Mixing',
              },
            ],
          },
        ],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  });
  return { calls, query };
}

describe('R-2 — setup_time_min survives read → open → save', () => {
  it('selects setup_time_min as text so the driver never parses it as a double', async () => {
    const client = makeListClient(EXACT_18_DIGITS);
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { listRoutings } = await import('../list-routings');
    await listRoutings({ itemId: ITEM_ID });

    const read = client.calls.find((c) => normalizeSql(c.sql).includes('from public.routings r'));
    expect(read).toBeDefined();
    expect(normalizeSql(read!.sql)).toContain("'setup_time_min', o.setup_time_min::text");
  });

  it('returns the exact stored decimal, and that value round-trips back into the write schema', async () => {
    const client = makeListClient(EXACT_18_DIGITS);
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { listRoutings } = await import('../list-routings');
    const result = await listRoutings({ itemId: ITEM_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const op = result.data.routings[0]!.operations[0]!;
    // The value numeric(18,6) stores exactly, returned verbatim…
    expect(op.setupTimeMin).toBe(EXACT_18_DIGITS);
    // …and this is what the old Number() hop did to it — the assertion is only
    // meaningful because the two differ.
    expect(String(Number(EXACT_18_DIGITS))).not.toBe(EXACT_18_DIGITS);

    // Save half of the cycle: the modal sends the value it was given straight
    // back, so the write schema must accept it unchanged (no rounding, no
    // "at most 6 decimal places" rejection of a 6 dp value).
    const parsed = RoutingOperationInput.safeParse({ ...opPayload, setupTimeMin: op.setupTimeMin });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.setupTimeMin).toBe(EXACT_18_DIGITS);
  });
});

/**
 * PF-R06-06 — deleteRouting: a DRAFT routing version can be removed; every other
 * status is refused by name, and a version something still points at is refused
 * by name too.
 *
 * Before this action existed the module had no delete at all, so a routing
 * created by mistake stayed in the system forever.
 *
 * Mocks withOrgContext + hasPermission only — writeAudit stays REAL so the audit
 * assertion checks the SQL that actually reaches the database, not a spy on our
 * own helper.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';
const ROUTING_ID = '44444444-4444-4444-8444-444444444444';
const SITE_ID = '55555555-5555-4555-8555-555555555555';

type QueryCall = { sql: string; params: readonly unknown[] };

const runWithOrgContext = vi.hoisted(() => vi.fn());
const hasPermissionMock = vi.hoisted(() => vi.fn(async () => true));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../../items/_actions/revalidate', () => ({ safeRevalidatePath: vi.fn() }));
vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => runWithOrgContext(action)),
}));
vi.mock('../shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared')>();
  return { ...actual, hasPermission: hasPermissionMock };
});

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient({
  status = 'draft',
  woCount = 0,
  ecoCount = 0,
  deletedRows = 1,
  guardRows = 1,
}: {
  status?: string;
  woCount?: number;
  ecoCount?: number;
  deletedRows?: number;
  /** 0 = the reference guard returned nothing at all (R-6). */
  guardRows?: number;
} = {}) {
  const calls: QueryCall[] = [];
  const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
    calls.push({ sql, params });
    const n = normalizeSql(sql);
    if (n.includes('from public.routings routing') && n.includes('for update')) {
      return {
        rows: [
          {
            id: ROUTING_ID,
            item_id: ITEM_ID,
            version: 3,
            status,
            site_id: SITE_ID,
            effective_from: '2026-07-01',
            effective_to: null,
          },
        ],
        rowCount: 1,
      };
    }
    if (n.includes('routing_reference_counts')) {
      return {
        rows: guardRows
          ? [{ work_order_count: woCount, change_order_line_count: ecoCount }]
          : [],
        rowCount: guardRows,
      };
    }
    if (n.startsWith('delete from public.routings')) return { rows: [], rowCount: deletedRows };
    if (n.startsWith('insert into public.audit_log')) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  return { calls, query };
}

function useClient(client: { query: unknown }) {
  runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  );
}

function deleteStatements(calls: QueryCall[]): QueryCall[] {
  return calls.filter((c) => normalizeSql(c.sql).startsWith('delete from'));
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  hasPermissionMock.mockResolvedValue(true);
});

describe('PF-R06-06 — deleteRouting (draft only)', () => {
  it('deletes a draft version and writes a routing.deleted audit entry', async () => {
    const client = makeClient({ status: 'draft' });
    useClient(client);

    const { deleteRouting } = await import('../delete-routing');
    const result = await deleteRouting({ routingId: ROUTING_ID });

    expect(result).toEqual({ ok: true, data: { id: ROUTING_ID, itemId: ITEM_ID, version: 3 } });

    // The DELETE re-asserts the status under the row lock, so an approve racing
    // in another tab cannot slip an approved version through.
    const del = client.calls.find((c) => normalizeSql(c.sql).startsWith('delete from public.routings'));
    expect(del).toBeDefined();
    expect(normalizeSql(del!.sql)).toContain("status = 'draft'");
    expect(del!.params).toContain(ROUTING_ID);

    const audit = client.calls.find((c) => normalizeSql(c.sql).startsWith('insert into public.audit_log'));
    expect(audit).toBeDefined();
    expect(audit!.params).toContain('routing.deleted');
    expect(audit!.params).toContain(ROUTING_ID);
    // before_state must capture what was removed (version + status), after_state null.
    const beforeState = JSON.parse(String(audit!.params[4]));
    expect(beforeState).toMatchObject({ id: ROUTING_ID, version: 3, status: 'draft' });
    expect(JSON.parse(String(audit!.params[5]))).toBeNull();
  });

  it('never issues an explicit routing_operations delete — the FK cascades (migration 163)', async () => {
    const client = makeClient({ status: 'draft' });
    useClient(client);

    const { deleteRouting } = await import('../delete-routing');
    await deleteRouting({ routingId: ROUTING_ID });

    const deletes = deleteStatements(client.calls).map((c) => normalizeSql(c.sql));
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toContain('delete from public.routings');
  });

  for (const status of ['approved', 'active', 'superseded']) {
    it(`refuses to delete a ${status} version with the named not_draft error`, async () => {
      const client = makeClient({ status });
      useClient(client);

      const { deleteRouting } = await import('../delete-routing');
      const result = await deleteRouting({ routingId: ROUTING_ID });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('not_draft');
        expect(result.message).toContain('only a draft routing may be deleted');
      }
      // History is untouched: no DELETE and no audit row.
      expect(deleteStatements(client.calls)).toHaveLength(0);
      expect(client.calls.some((c) => normalizeSql(c.sql).startsWith('insert into public.audit_log'))).toBe(false);
    });
  }

  it('refuses a draft still referenced by a work order (soft pointer, no FK to protect it)', async () => {
    const client = makeClient({ status: 'draft', woCount: 2 });
    useClient(client);

    const { deleteRouting } = await import('../delete-routing');
    const result = await deleteRouting({ routingId: ROUTING_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('version_referenced');
      expect(result.referenceCount).toBe(2);
    }
    expect(deleteStatements(client.calls)).toHaveLength(0);
  });

  it('refuses a draft still referenced by a change-order line (target_type = routing)', async () => {
    const client = makeClient({ status: 'draft', ecoCount: 1 });
    useClient(client);

    const { deleteRouting } = await import('../delete-routing');
    const result = await deleteRouting({ routingId: ROUTING_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('version_referenced');

    const guard = client.calls.find((c) => normalizeSql(c.sql).includes('routing_reference_counts'));
    expect(guard).toBeDefined();
    expect(deleteStatements(client.calls)).toHaveLength(0);
  });

  // ── R-6 — the guard must not run as a plain subquery under the caller's RLS.
  it('counts references through the SECURITY DEFINER function, not a site-filtered subquery', async () => {
    const client = makeClient({ status: 'draft' });
    useClient(client);

    const { deleteRouting } = await import('../delete-routing');
    await deleteRouting({ routingId: ROUTING_ID });

    const guard = client.calls.find((c) => normalizeSql(c.sql).includes('routing_reference_counts'));
    expect(guard).toBeDefined();
    expect(guard!.params).toContain(ROUTING_ID);
    // A direct read of work_orders as app_user is filtered by the RESTRICTIVE
    // work_orders_site_visibility policy (migration 383), so a work order in a
    // site the caller is not assigned to counted 0 and the routing was deleted
    // out from under it. No statement here may read work_orders directly.
    const directWorkOrderRead = client.calls.find(
      (c) => normalizeSql(c.sql).includes('from public.work_orders'),
    );
    expect(directWorkOrderRead).toBeUndefined();
  });

  it('refuses when the reference guard returns no row rather than reading it as zero references', async () => {
    const client = makeClient({ status: 'draft', guardRows: 0 });
    useClient(client);

    const { deleteRouting } = await import('../delete-routing');
    const result = await deleteRouting({ routingId: ROUTING_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('persistence_failed');
    expect(deleteStatements(client.calls)).toHaveLength(0);
  });

  it('requires the routing write permission (technical.bom.create)', async () => {
    const client = makeClient({ status: 'draft' });
    useClient(client);
    hasPermissionMock.mockResolvedValue(false);

    const { deleteRouting } = await import('../delete-routing');
    const result = await deleteRouting({ routingId: ROUTING_ID });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(deleteStatements(client.calls)).toHaveLength(0);
  });

  it('rejects a non-uuid routing id before touching the database', async () => {
    const client = makeClient();
    useClient(client);

    const { deleteRouting } = await import('../delete-routing');
    const result = await deleteRouting({ routingId: 'not-a-uuid' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_input');
    expect(client.calls).toHaveLength(0);
  });

  it('reports persistence_failed instead of a false success when the delete removes no row', async () => {
    const client = makeClient({ status: 'draft', deletedRows: 0 });
    useClient(client);

    const { deleteRouting } = await import('../delete-routing');
    const result = await deleteRouting({ routingId: ROUTING_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('persistence_failed');
    expect(client.calls.some((c) => normalizeSql(c.sql).startsWith('insert into public.audit_log'))).toBe(false);
  });
});

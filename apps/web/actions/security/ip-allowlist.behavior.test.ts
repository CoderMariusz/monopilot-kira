/**
 * Behavior tests for the admin IP allowlist Server Actions.
 *
 * Companion to the source-text contract in `ip-allowlist.test.ts` — these
 * tests actually invoke the Server Action functions through a stubbed
 * `withOrgContext` runner. They cover:
 *
 *  - RBAC: callers without `settings.ip_allowlist.edit` get FORBIDDEN
 *  - CIDR rejection: 0.0.0.0/0 AND ::/0 must be rejected with
 *    `CIDR_OVERLAP_DEFAULT` before any persistence call fires
 *  - Schema dependency: when the underlying `public.admin_ip_allowlist`
 *    table is missing, actions surface `PERSISTENCE_FAILED` and DO NOT
 *    falsely claim success.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type QueryCall = { sql: string; params: readonly unknown[] };

type FakeQueryClient = {
  calls: QueryCall[];
  hasEditPermission: boolean;
  adminTableMissing: boolean;
  insertedRows: Array<Record<string, unknown>>;
  auditRows: Array<Record<string, unknown>>;
  outboxEvents: Array<Record<string, unknown>>;
  query: (
    sql: string,
    params?: readonly unknown[],
  ) => Promise<{ rows: unknown[]; rowCount?: number | null }>;
};

let currentClient: FakeQueryClient;

const { _runWithOrgContext } = vi.hoisted(() => ({
  _runWithOrgContext: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    _runWithOrgContext(action),
  ),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const ACTOR_USER_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const RANGE_ID = '33333333-3333-4333-8333-333333333333';

function makeClient(options: { hasEditPermission?: boolean; adminTableMissing?: boolean } = {}): FakeQueryClient {
  const client: FakeQueryClient = {
    calls: [],
    hasEditPermission: options.hasEditPermission ?? true,
    adminTableMissing: options.adminTableMissing ?? false,
    insertedRows: [],
    auditRows: [],
    outboxEvents: [],
    async query(sql, params = []) {
      client.calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();

      // RBAC permission lookup
      if (normalized.includes('from public.user_roles')) {
        return { rows: client.hasEditPermission ? [{ ok: true }] : [], rowCount: client.hasEditPermission ? 1 : 0 };
      }

      if (normalized.includes('insert into public.audit_log')) {
        client.auditRows.push({
          action: params[2],
          resource_type: normalized.includes("'admin_ip_allowlist'") ? 'admin_ip_allowlist' : 'unknown',
          retention_class: normalized.includes("'security'") ? 'security' : 'unknown',
        });
        return { rows: [], rowCount: 1 };
      }

      if (normalized.includes('admin_ip_allowlist')) {
        if (client.adminTableMissing) {
          throw new Error('relation "public.admin_ip_allowlist" does not exist');
        }
        if (normalized.startsWith('insert into public.admin_ip_allowlist')) {
          const row = { id: RANGE_ID, cidr: String(params[0]), label: (params[1] as string | null) ?? null };
          client.insertedRows.push(row);
          return { rows: [row], rowCount: 1 };
        }
        if (normalized.startsWith('delete from public.admin_ip_allowlist')) {
          const row = { id: String(params[0]), label: null };
          return { rows: [row], rowCount: 1 };
        }
        if (normalized.startsWith('select') || normalized.includes('from public.admin_ip_allowlist')) {
          return {
            rows: [
              {
                id: RANGE_ID,
                cidr: '203.0.113.0/24',
                label: 'office',
                created_at: '2026-05-18T00:00:00Z',
                created_by: ACTOR_USER_ID,
              },
            ],
            rowCount: 1,
          };
        }
      }

      if (normalized.includes('insert into public.outbox_events')) {
        client.outboxEvents.push({ sql, params });
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  currentClient = makeClient();
  _runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'tkn', client: currentClient }),
  );
});

afterEach(() => {
  vi.resetModules();
});

describe('addIpRange behavior', () => {
  it('rejects 0.0.0.0/0 with CIDR_OVERLAP_DEFAULT before any insert', async () => {
    const { addIpRange } = await import('./ip-allowlist-add.js');

    const result = await addIpRange('0.0.0.0/0', 'wide-open');

    expect(result).toEqual({ ok: false, error: 'CIDR_OVERLAP_DEFAULT' });
    expect(currentClient.insertedRows).toHaveLength(0);
    const insertCalled = currentClient.calls.some((call) =>
      call.sql.toLowerCase().includes('insert into public.admin_ip_allowlist'),
    );
    expect(insertCalled, 'no admin_ip_allowlist INSERT must fire for default-open CIDR').toBe(false);
  });

  it('rejects ::/0 with CIDR_OVERLAP_DEFAULT — IPv6 default-open route must be denied too', async () => {
    const { addIpRange } = await import('./ip-allowlist-add.js');

    const result = await addIpRange('::/0', 'ipv6-wide-open');

    expect(result).toEqual({ ok: false, error: 'CIDR_OVERLAP_DEFAULT' });
    expect(currentClient.insertedRows).toHaveLength(0);
  });

  it('returns FORBIDDEN when caller lacks settings.ip_allowlist.edit', async () => {
    currentClient = makeClient({ hasEditPermission: false });
    _runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'tkn', client: currentClient }),
    );

    const { addIpRange } = await import('./ip-allowlist-add.js');

    const result = await addIpRange('203.0.113.10/32', 'office');

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(currentClient.insertedRows).toHaveLength(0);
  });

  it('persists a valid /32 and emits settings.ip_allowlist.changed in the outbox', async () => {
    const { addIpRange } = await import('./ip-allowlist-add.js');

    const result = await addIpRange('203.0.113.10/32', 'office');

    expect(result.ok).toBe(true);
    expect(currentClient.insertedRows).toHaveLength(1);
    expect(currentClient.auditRows[0]).toMatchObject({
      action: 'settings.ip_allowlist.added',
      resource_type: 'admin_ip_allowlist',
      retention_class: 'security',
    });
    expect(currentClient.outboxEvents).toHaveLength(1);
    const payload = currentClient.outboxEvents[0]!;
    const params = (payload.params as readonly unknown[]) ?? [];
    expect(params[1]).toBe('settings.ip_allowlist.changed');
  });

  it('returns PERSISTENCE_FAILED when public.admin_ip_allowlist table is missing', async () => {
    currentClient = makeClient({ adminTableMissing: true });
    _runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'tkn', client: currentClient }),
    );

    const { addIpRange } = await import('./ip-allowlist-add.js');

    const result = await addIpRange('203.0.113.10/32', 'office');

    expect(result).toEqual({ ok: false, error: 'PERSISTENCE_FAILED' });
  });
});

describe('listIpRanges behavior', () => {
  it('returns FORBIDDEN when caller lacks settings.ip_allowlist.edit', async () => {
    currentClient = makeClient({ hasEditPermission: false });
    _runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'tkn', client: currentClient }),
    );

    const { listIpRanges } = await import('./ip-allowlist-list.js');

    const result = await listIpRanges();
    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('returns rows when the caller has permission', async () => {
    const { listIpRanges } = await import('./ip-allowlist-list.js');
    const result = await listIpRanges();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ cidr: '203.0.113.0/24' });
    }
  });

  it('returns PERSISTENCE_FAILED when the admin_ip_allowlist table is missing', async () => {
    currentClient = makeClient({ adminTableMissing: true });
    _runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'tkn', client: currentClient }),
    );

    const { listIpRanges } = await import('./ip-allowlist-list.js');

    const result = await listIpRanges();
    expect(result).toEqual({ ok: false, error: 'PERSISTENCE_FAILED' });
  });
});

describe('removeIpRange behavior', () => {
  it('returns FORBIDDEN when caller lacks settings.ip_allowlist.edit', async () => {
    currentClient = makeClient({ hasEditPermission: false });
    _runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'tkn', client: currentClient }),
    );

    const { removeIpRange } = await import('./ip-allowlist-remove.js');

    const result = await removeIpRange(RANGE_ID);
    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('returns INVALID_INPUT for a malformed id', async () => {
    const { removeIpRange } = await import('./ip-allowlist-remove.js');
    const result = await removeIpRange('not-a-uuid');
    expect(result).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });

  it('returns PERSISTENCE_FAILED when admin_ip_allowlist table is missing', async () => {
    currentClient = makeClient({ adminTableMissing: true });
    _runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'tkn', client: currentClient }),
    );

    const { removeIpRange } = await import('./ip-allowlist-remove.js');

    const result = await removeIpRange(RANGE_ID);
    expect(result).toEqual({ ok: false, error: 'PERSISTENCE_FAILED' });
  });
});

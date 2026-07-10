import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTOR_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TARGET_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SITE_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SITE_B = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const { _withOrgContextRunner } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    _withOrgContextRunner(action),
  ),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

type QueryCall = { sql: string; params: unknown[] };

type FakeClientOptions = {
  permissionGranted?: boolean;
  targetUserFound?: boolean;
  allSitesValid?: boolean;
  targetRoleSlugs?: string[];
};

type FakeClient = {
  calls: QueryCall[];
  deletedFor: string[];
  insertedSiteIds: string[];
  insertedAssignedBy: string[];
  auditRows: Record<string, unknown>[];
  outboxPayloads: Record<string, unknown>[];
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

function makeClient(options: FakeClientOptions = {}): FakeClient {
  const permissionGranted = options.permissionGranted ?? true;
  const targetUserFound = options.targetUserFound ?? true;
  const allSitesValid = options.allSitesValid ?? true;
  const targetRoleSlugs = options.targetRoleSlugs ?? [];
  const calls: QueryCall[] = [];
  const client: FakeClient = {
    calls,
    deletedFor: [],
    insertedSiteIds: [],
    insertedAssignedBy: [],
    auditRows: [],
    outboxPayloads: [],
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (norm.includes('role_permissions') && norm.includes('user_roles')) {
        return permissionGranted ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (norm.includes('r.slug = any($3::text[])')) {
        const allowed = new Set(params[2] as readonly string[]);
        const ok = targetRoleSlugs.some((slug) => allowed.has(slug));
        return { rows: ok ? [{ ok: true }] : [], rowCount: ok ? 1 : 0 };
      }

      if (norm.includes('target_user_found') && norm.includes('all_sites_valid')) {
        return { rows: [{ target_user_found: targetUserFound, all_sites_valid: allSitesValid }], rowCount: 1 };
      }

      if (norm.startsWith('with deleted as')) {
        const requestedSites = (params[1] as string[]) ?? [];
        client.deletedFor.push(params[0] as string);
        for (const siteId of requestedSites) {
          client.insertedSiteIds.push(siteId);
          client.insertedAssignedBy.push(params[2] as string);
        }
        return { rows: [{ replaced: String(requestedSites.length) }], rowCount: 1 };
      }

      if (norm.startsWith('insert into public.audit_log')) {
        client.auditRows.push({
          action: params[2],
          resource_type: norm.includes("'org_security_policies'") ? 'org_security_policies' : 'unknown',
          resource_id: params[3],
          retention_class: norm.includes("'security'") ? 'security' : 'unknown',
          after_state: JSON.parse(params[4] as string),
        });
        return { rows: [], rowCount: 1 };
      }

      if (norm.startsWith('insert into public.outbox_events')) {
        client.outboxPayloads.push(JSON.parse(params[3] as string) as Record<string, unknown>);
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

let currentClient: FakeClient;

function bindClient(client: FakeClient) {
  currentClient = client;
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'session-token', client: currentClient }),
  );
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

type AssignUserSitesModule = typeof import('./assign-user-sites.ts');

async function loadAssignUserSites(): Promise<AssignUserSitesModule> {
  const path = `${__dirname}/assign-user-sites.ts`;
  return (await import(path)) as AssignUserSitesModule;
}

describe('assignUserSites behavior', () => {
  it('replaces the user site assignments and writes a security audit row gated on settings.roles.assign (no outbox)', async () => {
    bindClient(makeClient());
    const { assignUserSites } = await loadAssignUserSites();

    const result = await assignUserSites({ userId: TARGET_USER_ID, siteIds: [SITE_A, SITE_B] });

    expect(result).toEqual({ ok: true, data: { userId: TARGET_USER_ID, siteIds: [SITE_A, SITE_B] } });

    // Gates on the SAME permission as assign-role.
    const permissionCall = currentClient.calls.find((call) => call.sql.includes('role_permissions'));
    expect(permissionCall?.params[2]).toBe('settings.roles.assign');

    // Delete-then-insert replace: cleared old rows for the target, inserted one
    // row per requested site with the actor as assigned_by.
    expect(currentClient.deletedFor).toEqual([TARGET_USER_ID]);
    expect(currentClient.insertedSiteIds).toEqual([SITE_A, SITE_B]);
    expect(currentClient.insertedAssignedBy).toEqual([ACTOR_USER_ID, ACTOR_USER_ID]);

    expect(currentClient.auditRows[0]).toMatchObject({
      action: 'settings.user.sites_assigned',
      resource_type: 'org_security_policies',
      resource_id: TARGET_USER_ID,
      retention_class: 'security',
    });
    expect((currentClient.auditRows[0].after_state as Record<string, unknown>).site_ids).toEqual([SITE_A, SITE_B]);
    // No outbox emit: 'settings.user.sites_assigned' is not in the outbox_events
    // CHECK constraint (verified live), and no consumer needs it — audit_log is
    // the authoritative record.
    expect(currentClient.outboxPayloads).toHaveLength(0);
  });

  it('rejects with forbidden and never mutates when the caller lacks settings.roles.assign', async () => {
    bindClient(makeClient({ permissionGranted: false }));
    const { assignUserSites } = await loadAssignUserSites();

    const result = await assignUserSites({ userId: TARGET_USER_ID, siteIds: [SITE_A] });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(currentClient.deletedFor).toHaveLength(0);
    expect(currentClient.insertedSiteIds).toHaveLength(0);
    expect(currentClient.auditRows).toHaveLength(0);
    expect(currentClient.outboxPayloads).toHaveLength(0);
  });

  it('refuses empty siteIds for an ordinary user so zero rows cannot mean unrestricted', async () => {
    bindClient(makeClient({ targetRoleSlugs: [] }));
    const { assignUserSites } = await loadAssignUserSites();

    const result = await assignUserSites({ userId: TARGET_USER_ID, siteIds: [] });

    expect(result).toEqual({ ok: false, error: 'empty_site_assignment_forbidden' });
    expect(currentClient.deletedFor).toHaveLength(0);
    expect(currentClient.insertedSiteIds).toHaveLength(0);
    expect(currentClient.auditRows).toHaveLength(0);
  });

  it('allows empty siteIds for an admin-class target user with explicit all-site authority', async () => {
    bindClient(makeClient({ targetRoleSlugs: ['admin'] }));
    const { assignUserSites } = await loadAssignUserSites();

    const result = await assignUserSites({ userId: TARGET_USER_ID, siteIds: [] });

    expect(result).toEqual({ ok: true, data: { userId: TARGET_USER_ID, siteIds: [] } });
    expect(currentClient.deletedFor).toEqual([TARGET_USER_ID]);
    expect(currentClient.insertedSiteIds).toHaveLength(0);
    expect(currentClient.auditRows[0]).toMatchObject({ action: 'settings.user.sites_assigned' });
  });

  it('refuses empty siteIds when the target has admin-family code but a non-admin slug', async () => {
    bindClient(makeClient({ targetRoleSlugs: ['custom-operator'] }));
    const { assignUserSites } = await loadAssignUserSites();

    const result = await assignUserSites({ userId: TARGET_USER_ID, siteIds: [] });

    expect(result).toEqual({ ok: false, error: 'empty_site_assignment_forbidden' });
    expect(currentClient.deletedFor).toHaveLength(0);
    expect(currentClient.insertedSiteIds).toHaveLength(0);
    expect(currentClient.auditRows).toHaveLength(0);
  });

  it('returns not_found when the target user is not in the caller org (no mutation)', async () => {
    bindClient(makeClient({ targetUserFound: false }));
    const { assignUserSites } = await loadAssignUserSites();

    const result = await assignUserSites({ userId: TARGET_USER_ID, siteIds: [SITE_A] });

    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(currentClient.deletedFor).toHaveLength(0);
    expect(currentClient.insertedSiteIds).toHaveLength(0);
  });

  it('returns invalid_input when a requested site is not an active org site (no mutation)', async () => {
    bindClient(makeClient({ allSitesValid: false }));
    const { assignUserSites } = await loadAssignUserSites();

    const result = await assignUserSites({ userId: TARGET_USER_ID, siteIds: [SITE_A] });

    expect(result).toEqual({ ok: false, error: 'invalid_input' });
    expect(currentClient.deletedFor).toHaveLength(0);
  });

  it('rejects malformed input before opening org context', async () => {
    bindClient(makeClient());
    const { assignUserSites } = await loadAssignUserSites();

    const result = await assignUserSites({ userId: '   ', siteIds: [SITE_A] } as never);
    expect(result).toEqual({ ok: false, error: 'invalid_input' });
    expect(currentClient.calls).toHaveLength(0);
  });
});

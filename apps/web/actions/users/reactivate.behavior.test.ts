import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTOR_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TARGET_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const { _withOrgContextRunner, _revalidateLocalized, _getUserById } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
  _revalidateLocalized: vi.fn(),
  _getUserById: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));

vi.mock('../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: _revalidateLocalized,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      admin: {
        getUserById: _getUserById,
      },
    },
  })),
}));

type QueryCall = { sql: string; params: unknown[] };
type FakeClient = {
  calls: QueryCall[];
  auditRows: Record<string, unknown>[];
  outboxPayloads: Record<string, unknown>[];
  targetUser: { id: string; is_active: boolean; invite_token: string | null } | null;
  seatLimit: number | null;
  activeUserCount: number;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

function makeClient(): FakeClient {
  const calls: QueryCall[] = [];
  const client: FakeClient = {
    calls,
    auditRows: [],
    outboxPayloads: [],
    targetUser: { id: TARGET_USER_ID, is_active: false, invite_token: null },
    seatLimit: 50,
    activeUserCount: 10,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (norm.includes('role_permissions') && norm.includes('user_roles')) {
        const permission = params[2];
        return ['org.access.admin', 'settings.users.deactivate'].includes(permission as string)
          ? { rows: [{ ok: true }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }

      if (norm.includes('from public.users') && norm.includes('invite_token')) {
        return client.targetUser ? { rows: [client.targetUser], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (norm.includes('seat_limit from public.organizations')) {
        return { rows: [{ seat_limit: client.seatLimit }], rowCount: 1 };
      }

      if (norm.includes('active_user_count')) {
        return { rows: [{ active_user_count: client.activeUserCount }], rowCount: 1 };
      }

      if (norm.startsWith('update public.users') && norm.includes('is_active = true')) {
        return client.targetUser && !client.targetUser.is_active && !client.targetUser.invite_token
          ? { rows: [{ id: TARGET_USER_ID }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }

      if (norm.startsWith('insert into public.audit_log')) {
        client.auditRows.push({
          action: params[2],
          resource_id: params[3],
          after_state: JSON.parse(params[4] as string),
        });
        return { rows: [], rowCount: 1 };
      }

      if (norm.startsWith('insert into public.outbox_events')) {
        client.outboxPayloads.push({
          event_type: params[1],
          payload: JSON.parse(params[3] as string),
        });
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  currentClient = makeClient();
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: ACTOR_USER_ID, orgId: ORG_ID, sessionToken: 'session-token', client: currentClient }),
  );
  _getUserById.mockResolvedValue({ data: { user: { id: TARGET_USER_ID } }, error: null });
});

type ReactivateModule = typeof import('./reactivate.ts');

async function loadReactivate(): Promise<ReactivateModule> {
  return (await import(`${__dirname}/reactivate.ts`)) as ReactivateModule;
}

describe('reactivateUser behavior', () => {
  it('rejects callers without the deactivate/admin permission union', async () => {
    const { reactivateUser } = await loadReactivate();
    currentClient.query = async (sql: string, params: unknown[] = []) => {
      currentClient.calls.push({ sql, params });
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (norm.includes('role_permissions')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    };

    const result = await reactivateUser({ targetUserId: TARGET_USER_ID });
    expect(result).toEqual({ ok: false, error: 'forbidden' });
  });

  it('reactivates a disabled org user, verifies auth identity, and writes audit + outbox rows', async () => {
    const { reactivateUser } = await loadReactivate();

    const result = await reactivateUser({ targetUserId: TARGET_USER_ID });

    expect(result).toEqual({ ok: true, data: { targetUserId: TARGET_USER_ID, reactivated: true } });
    expect(_getUserById).toHaveBeenCalledWith(TARGET_USER_ID);
    expect(currentClient.auditRows[0]).toMatchObject({
      action: 'settings.user.reactivated',
      resource_id: TARGET_USER_ID,
    });
    expect(currentClient.outboxPayloads[0]).toMatchObject({
      event_type: 'settings.user.reactivated',
      payload: expect.objectContaining({ target_user_id: TARGET_USER_ID, org_id: ORG_ID }),
    });
    expect(_revalidateLocalized).toHaveBeenCalledWith('/settings/users');
  });

  it('returns auth_identity_missing when the Supabase auth user was hard-deleted', async () => {
    _getUserById.mockResolvedValueOnce({ data: { user: null }, error: { message: 'not found' } });
    const { reactivateUser } = await loadReactivate();

    const result = await reactivateUser({ targetUserId: TARGET_USER_ID });

    expect(result).toEqual({ ok: false, error: 'auth_identity_missing' });
    expect(currentClient.auditRows).toHaveLength(0);
  });

  it('scopes the target lookup to the caller org', async () => {
    const { reactivateUser } = await loadReactivate();
    await reactivateUser({ targetUserId: TARGET_USER_ID });

    const lookup = currentClient.calls.find((call) => call.sql.includes('invite_token'));
    expect(lookup?.params).toEqual([TARGET_USER_ID, ORG_ID]);
  });

  it('reactivates a password-created-then-deactivated user (invite_token IS NULL, is_active = false)', async () => {
    // createUserWithPassword sets invite_token = null and is_active = true.
    // Deactivation then flips is_active to false, leaving invite_token = null.
    // The guard must NOT block this shape — it should only block NEVER-ACTIVATED
    // invitees (invite_token IS NOT NULL).
    currentClient.targetUser = { id: TARGET_USER_ID, is_active: false, invite_token: null };
    const { reactivateUser } = await loadReactivate();

    const result = await reactivateUser({ targetUserId: TARGET_USER_ID });

    expect(result).toEqual({ ok: true, data: { targetUserId: TARGET_USER_ID, reactivated: true } });
    expect(_getUserById).toHaveBeenCalledWith(TARGET_USER_ID);
    expect(currentClient.auditRows[0]).toMatchObject({ action: 'settings.user.reactivated' });
  });

  it('blocks reactivation of a never-activated invite (invite_token IS NOT NULL)', async () => {
    // An invited user who never clicked the link has invite_token set.
    // Reactivating them would bypass the invite-accept lifecycle — guard must fire.
    currentClient.targetUser = { id: TARGET_USER_ID, is_active: false, invite_token: 'pending-invite-token' };
    const { reactivateUser } = await loadReactivate();

    const result = await reactivateUser({ targetUserId: TARGET_USER_ID });

    expect(result).toEqual({ ok: false, error: 'not_disabled' });
    expect(_getUserById).not.toHaveBeenCalled();
    expect(currentClient.auditRows).toHaveLength(0);
  });
});

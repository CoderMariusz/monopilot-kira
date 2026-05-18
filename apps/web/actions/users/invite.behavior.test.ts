import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ORG_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const VIEWER_ROLE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OWNER_ROLE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const CROSS_ORG_ROLE_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const {
  _withOrgContextRunner,
  _mockGenerateLink,
} = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
  _mockGenerateLink: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    _withOrgContextRunner(action),
  ),
}));

vi.mock('../../lib/auth/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      admin: {
        generateLink: _mockGenerateLink,
      },
    },
  })),
}));

type QueryCall = { sql: string; params: unknown[] };

type FakeClientOptions = {
  hasInvitePermission: boolean;
  seatLimit: number | null;
  activeUsers: number;
  rolesById: Record<string, { id: string; org_id: string; code: string; is_system: boolean; display_order: number | null }>;
};

type FakeClient = {
  calls: QueryCall[];
  upsertedUser: Record<string, unknown> | null;
  outboxEvents: Array<{ event_type: string; payload: Record<string, unknown> }>;
  conflictEmailOrgId?: string;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

function makeClient(opts: FakeClientOptions): FakeClient {
  const calls: QueryCall[] = [];
  const client: FakeClient = {
    calls,
    upsertedUser: null,
    outboxEvents: [],
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (norm.startsWith('select') && norm.includes('role_permissions') && norm.includes('user_roles')) {
        return {
          rows: opts.hasInvitePermission ? [{ ok: true }] : [],
          rowCount: opts.hasInvitePermission ? 1 : 0,
        };
      }

      if (norm.startsWith('select seat_limit')) {
        return { rows: [{ seat_limit: opts.seatLimit }], rowCount: 1 };
      }

      if (norm.includes('count(*)') && norm.includes('users')) {
        return { rows: [{ active_user_count: opts.activeUsers }], rowCount: 1 };
      }

      if (norm.startsWith('select') && norm.includes('from public.roles') && norm.includes('where id =')) {
        const id = params[0] as string;
        const role = opts.rolesById[id];
        return { rows: role ? [role] : [], rowCount: role ? 1 : 0 };
      }

      if (norm.startsWith('insert into public.users')) {
        if (client.conflictEmailOrgId && client.conflictEmailOrgId !== params[0]) {
          return { rows: [], rowCount: 0 };
        }
        client.upsertedUser = {
          org_id: params[0],
          email: params[1],
          name: params[2],
          role_id: params[3],
          language: params[4],
          invite_token: params[5],
          invite_token_expires_at: params[6],
        };
        return { rows: [], rowCount: 1 };
      }

      if (norm.startsWith('insert into public.outbox_events')) {
        client.outboxEvents.push({
          event_type: params[1] as string,
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
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, sessionToken: 'sess', client: currentClient }),
  );
  _mockGenerateLink.mockResolvedValue({
    data: { properties: { hashed_token: 'hashed-token-stub' } },
    error: null,
  });
});

type InviteModule = typeof import('./invite.ts');

async function loadInvite(): Promise<InviteModule> {
  const path = `${__dirname}/invite.ts`;
  return (await import(path)) as InviteModule;
}

describe('inviteUser RBAC (behavior)', () => {
  it('returns forbidden when caller lacks settings.users.invite permission', async () => {
    currentClient = makeClient({
      hasInvitePermission: false,
      seatLimit: null,
      activeUsers: 0,
      rolesById: {
        [VIEWER_ROLE_ID]: { id: VIEWER_ROLE_ID, org_id: ORG_ID, code: 'viewer', is_system: false, display_order: 99 },
      },
    });
    const { inviteUser } = await loadInvite();
    const result = await inviteUser({ email: 'new@example.com', roleId: VIEWER_ROLE_ID });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(_mockGenerateLink).not.toHaveBeenCalled();
    expect(currentClient.upsertedUser).toBeNull();
  });

  it('allows invite when caller has the settings.users.invite permission', async () => {
    currentClient = makeClient({
      hasInvitePermission: true,
      seatLimit: 100,
      activeUsers: 5,
      rolesById: {
        [VIEWER_ROLE_ID]: { id: VIEWER_ROLE_ID, org_id: ORG_ID, code: 'viewer', is_system: false, display_order: 99 },
      },
    });
    const { inviteUser } = await loadInvite();
    const result = await inviteUser({ email: 'new@example.com', roleId: VIEWER_ROLE_ID });

    expect(result.ok).toBe(true);
    expect(_mockGenerateLink).toHaveBeenCalledTimes(1);
    expect(currentClient.upsertedUser?.role_id).toBe(VIEWER_ROLE_ID);
    expect(currentClient.upsertedUser?.email).toBe('new@example.com');
    expect(currentClient.outboxEvents.map((e) => e.event_type)).toContain('settings.user.invited');
  });
});

describe('inviteUser roleId handling', () => {
  it('returns invalid_input when roleId is missing (mandatory)', async () => {
    currentClient = makeClient({
      hasInvitePermission: true,
      seatLimit: null,
      activeUsers: 0,
      rolesById: {},
    });
    const { inviteUser } = await loadInvite();
    const result = await inviteUser({ email: 'new@example.com' });

    expect(result).toEqual({ ok: false, error: 'invalid_input' });
    expect(_mockGenerateLink).not.toHaveBeenCalled();
    expect(currentClient.upsertedUser).toBeNull();
  });

  it('rejects cross-org roleId with invalid_input', async () => {
    currentClient = makeClient({
      hasInvitePermission: true,
      seatLimit: null,
      activeUsers: 0,
      rolesById: {
        [CROSS_ORG_ROLE_ID]: { id: CROSS_ORG_ROLE_ID, org_id: OTHER_ORG_ID, code: 'viewer', is_system: false, display_order: 99 },
      },
    });
    const { inviteUser } = await loadInvite();
    const result = await inviteUser({ email: 'new@example.com', roleId: CROSS_ORG_ROLE_ID });

    expect(result).toEqual({ ok: false, error: 'invalid_input' });
    expect(currentClient.upsertedUser).toBeNull();
  });

  it('rejects an existing same-email user from another org instead of taking it over', async () => {
    currentClient = makeClient({
      hasInvitePermission: true,
      seatLimit: null,
      activeUsers: 0,
      rolesById: {
        [VIEWER_ROLE_ID]: { id: VIEWER_ROLE_ID, org_id: ORG_ID, code: 'viewer', is_system: false, display_order: 99 },
      },
    });
    currentClient.conflictEmailOrgId = OTHER_ORG_ID;
    const { inviteUser } = await loadInvite();
    const result = await inviteUser({ email: 'existing@example.com', roleId: VIEWER_ROLE_ID });

    expect(result).toEqual({ ok: false, error: 'invalid_input' });
    expect(currentClient.upsertedUser).toBeNull();
  });

  it('never silently defaults the role to a system owner/admin role', async () => {
    currentClient = makeClient({
      hasInvitePermission: true,
      seatLimit: null,
      activeUsers: 0,
      rolesById: {
        [OWNER_ROLE_ID]: { id: OWNER_ROLE_ID, org_id: ORG_ID, code: 'org.access.admin', is_system: true, display_order: 0 },
      },
    });
    const { inviteUser } = await loadInvite();
    const result = await inviteUser({ email: 'new@example.com' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('invalid_input');
    }
    expect(currentClient.upsertedUser?.role_id).not.toBe(OWNER_ROLE_ID);
  });
});

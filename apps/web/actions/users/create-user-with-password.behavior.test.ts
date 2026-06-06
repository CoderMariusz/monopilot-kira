import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ORG_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const VIEWER_ROLE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OWNER_ROLE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const CROSS_ORG_ROLE_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const NEW_USER_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_USER_ID = '22222222-2222-4222-8222-222222222222';
const STRONG_PASSWORD = 'Sup3r-Str0ng-Pass!';

const {
  _withOrgContextRunner,
  _mockCreateUser,
  _mockDeleteUser,
} = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
  _mockCreateUser: vi.fn(),
  _mockDeleteUser: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    _withOrgContextRunner(action),
  ),
}));

// The service-role admin client is created via a dynamic `import('@supabase/supabase-js')`.
// Mock that module so no real network/service-role key is needed.
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      admin: {
        createUser: _mockCreateUser,
        deleteUser: _mockDeleteUser,
      },
    },
  })),
}));

type QueryCall = { sql: string; params: unknown[] };

type FakeClientOptions = {
  hasPermission: boolean;
  seatLimit: number | null;
  activeUsers: number;
  rolesById: Record<string, { id: string; org_id: string; code: string; is_system: boolean; display_order: number | null }>;
  existingEmailInOrg?: boolean;
  insertUserFails?: boolean;
};

type FakeClient = {
  calls: QueryCall[];
  insertedUser: Record<string, unknown> | null;
  insertedUserRole: Record<string, unknown> | null;
  auditEvents: Array<{ action: string; payload: Record<string, unknown> }>;
  outboxEvents: Array<{ event_type: string; payload: Record<string, unknown> }>;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

function makeClient(opts: FakeClientOptions): FakeClient {
  const calls: QueryCall[] = [];
  const client: FakeClient = {
    calls,
    insertedUser: null,
    insertedUserRole: null,
    auditEvents: [],
    outboxEvents: [],
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (norm.startsWith('select') && norm.includes('role_permissions') && norm.includes('user_roles')) {
        return { rows: opts.hasPermission ? [{ ok: true }] : [], rowCount: opts.hasPermission ? 1 : 0 };
      }

      if (norm.startsWith('select') && norm.includes('from public.roles') && norm.includes('where id =')) {
        const id = params[0] as string;
        const role = opts.rolesById[id];
        return { rows: role ? [role] : [], rowCount: role ? 1 : 0 };
      }

      if (norm.startsWith('select id from public.users') && norm.includes('email')) {
        return { rows: opts.existingEmailInOrg ? [{ id: 'pre-existing' }] : [], rowCount: opts.existingEmailInOrg ? 1 : 0 };
      }

      if (norm.startsWith('select seat_limit')) {
        return { rows: [{ seat_limit: opts.seatLimit }], rowCount: 1 };
      }

      if (norm.includes('count(*)') && norm.includes('users')) {
        return { rows: [{ active_user_count: opts.activeUsers }], rowCount: 1 };
      }

      if (norm.startsWith('insert into public.users')) {
        if (opts.insertUserFails) {
          throw new Error('insert users failed');
        }
        client.insertedUser = {
          org_id: params[0],
          email: params[1],
          name: params[2],
          role_id: params[3],
          language: params[4],
        };
        return { rows: [{ id: NEW_USER_ID }], rowCount: 1 };
      }

      if (norm.startsWith('insert into public.user_roles')) {
        client.insertedUserRole = { user_id: params[0], role_id: params[1], org_id: params[2] };
        return { rows: [], rowCount: 1 };
      }

      if (norm.startsWith('insert into public.audit_log')) {
        client.auditEvents.push({ action: params[2] as string, payload: JSON.parse(params[4] as string) });
        return { rows: [], rowCount: 1 };
      }

      if (norm.startsWith('insert into public.outbox_events')) {
        client.outboxEvents.push({ event_type: params[1] as string, payload: JSON.parse(params[3] as string) });
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
  _mockCreateUser.mockResolvedValue({ data: { user: { id: AUTH_USER_ID } }, error: null });
  _mockDeleteUser.mockResolvedValue({ data: {}, error: null });
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-stub';
});

type Mod = typeof import('./create-user-with-password.ts');

async function load(): Promise<Mod> {
  return (await import(`${__dirname}/create-user-with-password.ts`)) as Mod;
}

const VIEWER_ROLE = { id: VIEWER_ROLE_ID, org_id: ORG_ID, code: 'viewer', is_system: false, display_order: 99 };

describe('createUserWithPassword RBAC + provisioning (behavior)', () => {
  it('returns forbidden and never creates an auth user when caller lacks the admin permission', async () => {
    currentClient = makeClient({ hasPermission: false, seatLimit: null, activeUsers: 0, rolesById: { [VIEWER_ROLE_ID]: VIEWER_ROLE } });
    const { createUserWithPassword } = await load();
    const result = await createUserWithPassword({ email: 'new@example.com', password: STRONG_PASSWORD, roleId: VIEWER_ROLE_ID });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(_mockCreateUser).not.toHaveBeenCalled();
    expect(currentClient.insertedUser).toBeNull();
  });

  it('creates an ACTIVE user with no invite email and provisions users + user_roles + audit + outbox', async () => {
    currentClient = makeClient({ hasPermission: true, seatLimit: 100, activeUsers: 5, rolesById: { [VIEWER_ROLE_ID]: VIEWER_ROLE } });
    const { createUserWithPassword } = await load();
    const result = await createUserWithPassword({ email: 'New@Example.com', password: STRONG_PASSWORD, name: 'New Person', roleId: VIEWER_ROLE_ID, language: 'en' });

    expect(result).toEqual({ ok: true, data: { email: 'new@example.com', userId: NEW_USER_ID } });
    // email_confirm:true → no invite email; password set directly.
    expect(_mockCreateUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'new@example.com',
      password: STRONG_PASSWORD,
      email_confirm: true,
    }));
    // public.users row is created ACTIVE (sixth positional param = is_active literal true in SQL, no invite_token).
    expect(currentClient.insertedUser).toMatchObject({ org_id: ORG_ID, email: 'new@example.com', role_id: VIEWER_ROLE_ID, language: 'en' });
    expect(currentClient.insertedUserRole).toMatchObject({ user_id: NEW_USER_ID, role_id: VIEWER_ROLE_ID, org_id: ORG_ID });
    expect(currentClient.auditEvents[0]).toMatchObject({ action: 'settings.user.created_with_password' });
    expect(currentClient.auditEvents[0]?.payload).toMatchObject({ invite_email_sent: false, email_confirmed: true });
    expect(currentClient.outboxEvents[0]).toMatchObject({ event_type: 'settings.user.created_with_password' });
  });

  it('rejects a weak password before any DB or auth call', async () => {
    currentClient = makeClient({ hasPermission: true, seatLimit: null, activeUsers: 0, rolesById: { [VIEWER_ROLE_ID]: VIEWER_ROLE } });
    const { createUserWithPassword } = await load();
    const result = await createUserWithPassword({ email: 'new@example.com', password: 'short', roleId: VIEWER_ROLE_ID });

    expect(result).toEqual({ ok: false, error: 'weak_password' });
    expect(_mockCreateUser).not.toHaveBeenCalled();
  });

  it('rejects an invalid email', async () => {
    currentClient = makeClient({ hasPermission: true, seatLimit: null, activeUsers: 0, rolesById: { [VIEWER_ROLE_ID]: VIEWER_ROLE } });
    const { createUserWithPassword } = await load();
    const result = await createUserWithPassword({ email: 'not-an-email', password: STRONG_PASSWORD, roleId: VIEWER_ROLE_ID });

    expect(result).toEqual({ ok: false, error: 'invalid_input' });
    expect(_mockCreateUser).not.toHaveBeenCalled();
  });

  it('rejects a cross-org roleId', async () => {
    currentClient = makeClient({ hasPermission: true, seatLimit: null, activeUsers: 0, rolesById: { [CROSS_ORG_ROLE_ID]: { id: CROSS_ORG_ROLE_ID, org_id: OTHER_ORG_ID, code: 'viewer', is_system: false, display_order: 9 } } });
    const { createUserWithPassword } = await load();
    const result = await createUserWithPassword({ email: 'new@example.com', password: STRONG_PASSWORD, roleId: CROSS_ORG_ROLE_ID });

    expect(result).toEqual({ ok: false, error: 'invalid_input' });
    expect(_mockCreateUser).not.toHaveBeenCalled();
  });

  it('refuses to self-serve a privileged system role', async () => {
    currentClient = makeClient({ hasPermission: true, seatLimit: null, activeUsers: 0, rolesById: { [OWNER_ROLE_ID]: { id: OWNER_ROLE_ID, org_id: ORG_ID, code: 'org.access.admin', is_system: true, display_order: 0 } } });
    const { createUserWithPassword } = await load();
    const result = await createUserWithPassword({ email: 'new@example.com', password: STRONG_PASSWORD, roleId: OWNER_ROLE_ID });

    expect(result).toEqual({ ok: false, error: 'invalid_input' });
    expect(_mockCreateUser).not.toHaveBeenCalled();
  });

  it('returns email_taken when the email already exists in the org', async () => {
    currentClient = makeClient({ hasPermission: true, seatLimit: null, activeUsers: 0, rolesById: { [VIEWER_ROLE_ID]: VIEWER_ROLE }, existingEmailInOrg: true });
    const { createUserWithPassword } = await load();
    const result = await createUserWithPassword({ email: 'taken@example.com', password: STRONG_PASSWORD, roleId: VIEWER_ROLE_ID });

    expect(result).toEqual({ ok: false, error: 'email_taken' });
    expect(_mockCreateUser).not.toHaveBeenCalled();
  });

  it('enforces the seat limit before creating the auth user', async () => {
    currentClient = makeClient({ hasPermission: true, seatLimit: 5, activeUsers: 5, rolesById: { [VIEWER_ROLE_ID]: VIEWER_ROLE } });
    const { createUserWithPassword } = await load();
    const result = await createUserWithPassword({ email: 'new@example.com', password: STRONG_PASSWORD, roleId: VIEWER_ROLE_ID });

    expect(result).toEqual({ ok: false, error: 'seat_limit_exceeded' });
    expect(_mockCreateUser).not.toHaveBeenCalled();
  });

  it('maps an "already registered" auth error to email_taken', async () => {
    currentClient = makeClient({ hasPermission: true, seatLimit: null, activeUsers: 0, rolesById: { [VIEWER_ROLE_ID]: VIEWER_ROLE } });
    _mockCreateUser.mockResolvedValue({ data: null, error: { message: 'A user with this email address has already been registered' } });
    const { createUserWithPassword } = await load();
    const result = await createUserWithPassword({ email: 'dupe@example.com', password: STRONG_PASSWORD, roleId: VIEWER_ROLE_ID });

    expect(result).toEqual({ ok: false, error: 'email_taken' });
    expect(currentClient.insertedUser).toBeNull();
  });

  it('flags service_unavailable when the service-role env is missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    currentClient = makeClient({ hasPermission: true, seatLimit: null, activeUsers: 0, rolesById: { [VIEWER_ROLE_ID]: VIEWER_ROLE } });
    const { createUserWithPassword } = await load();
    const result = await createUserWithPassword({ email: 'new@example.com', password: STRONG_PASSWORD, roleId: VIEWER_ROLE_ID });

    expect(result).toEqual({ ok: false, error: 'service_unavailable' });
    expect(_mockCreateUser).not.toHaveBeenCalled();
  });

  it('best-effort deletes the orphan auth user when DB provisioning fails after createUser', async () => {
    currentClient = makeClient({ hasPermission: true, seatLimit: null, activeUsers: 0, rolesById: { [VIEWER_ROLE_ID]: VIEWER_ROLE }, insertUserFails: true });
    const { createUserWithPassword } = await load();
    const result = await createUserWithPassword({ email: 'new@example.com', password: STRONG_PASSWORD, roleId: VIEWER_ROLE_ID });

    expect(result).toEqual({ ok: false, error: 'persistence_failed' });
    expect(_mockCreateUser).toHaveBeenCalledTimes(1);
    expect(_mockDeleteUser).toHaveBeenCalledWith(AUTH_USER_ID);
  });
});

describe('isStrongPassword', () => {
  it('requires a length floor and class diversity', async () => {
    const { isStrongPassword } = await import('./password-policy');
    expect(isStrongPassword('short')).toBe(false);
    expect(isStrongPassword('alllowercaseletters')).toBe(false);
    expect(isStrongPassword('Sup3r-Str0ng-Pass!')).toBe(true);
    expect(isStrongPassword(12345 as unknown)).toBe(false);
  });
});

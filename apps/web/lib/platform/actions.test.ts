import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const HOME_ORG_ID = '22222222-2222-4222-8222-222222222222';
const TARGET_ORG_ID = '33333333-3333-4333-8333-333333333333';

type QueryCall = { sql: string; params: readonly unknown[] };

const state = vi.hoisted(() => ({
  cookieStore: { set: vi.fn(), delete: vi.fn() },
  ownerCalls: [] as QueryCall[],
  appCalls: [] as QueryCall[],
  activePlatformOrg: '33333333-3333-4333-8333-333333333333' as string | null,
  // addPlatformAdminAction controls:
  userLookup: null as { id: string; email: string } | null,
  upsertRow: { was_revoked: false, existed: false } as { was_revoked: boolean; existed: boolean },
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => state.cookieStore),
}));

vi.mock('../auth/supabase-server', () => ({
  getCachedUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })),
}));

vi.mock('../auth/with-org-context', () => ({
  getOwnerPool: vi.fn(() => ({
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      state.ownerCalls.push({ sql, params });
      const text = normalize(sql);
      if (text.startsWith('select true as ok from public.organizations')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (text.startsWith('select org_id::text as org_id from public.users')) {
        return { rows: [{ org_id: HOME_ORG_ID }], rowCount: 1 };
      }
      if (text.startsWith('select id::text as id, email::text as email from public.users')) {
        return { rows: state.userLookup ? [state.userLookup] : [], rowCount: state.userLookup ? 1 : 0 };
      }
      if (text.startsWith('with existing as')) {
        return { rows: [state.upsertRow], rowCount: 1 };
      }
      if (text.startsWith('insert into app.platform_audit')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
  })),
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: { query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount: number }> } }) => Promise<unknown>) =>
    action({
      userId: USER_ID,
      orgId: state.activePlatformOrg ?? HOME_ORG_ID,
      client: {
        query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
          state.appCalls.push({ sql, params });
          return { rows: [], rowCount: 1 };
        }),
      },
    }),
  ),
}));

vi.mock('./platform-context', () => ({
  PLATFORM_ORG_COOKIE: 'mp_platform_org',
  asPlatformOrgId: vi.fn((value: unknown) => (typeof value === 'string' && value.length > 0 ? value : null)),
  assertPlatformAdmin: vi.fn(async () => undefined),
  readPlatformOrgCookie: vi.fn(async () => state.activePlatformOrg),
}));

beforeEach(() => {
  state.cookieStore = { set: vi.fn(), delete: vi.fn() };
  state.ownerCalls = [];
  state.appCalls = [];
  state.activePlatformOrg = TARGET_ORG_ID;
  state.userLookup = null;
  state.upsertRow = { was_revoked: false, existed: false };
  vi.clearAllMocks();
});

describe('platform act-as actions', () => {
  it('actAsOrgAction clears mp_site_id and writes public + platform audit', async () => {
    const { actAsOrgAction } = await import('./actions');

    await expect(actAsOrgAction(TARGET_ORG_ID)).resolves.toEqual({ ok: true });

    expect(state.cookieStore.set).toHaveBeenCalledWith(
      'mp_platform_org',
      TARGET_ORG_ID,
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: expect.any(Number),
      }),
    );
    expect(state.cookieStore.delete).toHaveBeenCalledWith('mp_site_id');
    expect(state.appCalls.some((call) => normalize(call.sql).startsWith('insert into public.audit_events'))).toBe(true);
    expect(state.ownerCalls.some((call) => normalize(call.sql).startsWith('insert into app.platform_audit'))).toBe(true);
  });

  it('exitActAsAction clears mp_platform_org and mp_site_id cookies and writes audit', async () => {
    const { exitActAsAction } = await import('./actions');

    await expect(exitActAsAction()).resolves.toEqual({ ok: true });

    expect(state.cookieStore.delete).toHaveBeenCalledWith('mp_platform_org');
    expect(state.cookieStore.delete).toHaveBeenCalledWith('mp_site_id');
    expect(state.appCalls.some((call) => normalize(call.sql).startsWith('insert into public.audit_events'))).toBe(true);
    expect(state.ownerCalls.some((call) => normalize(call.sql).startsWith('insert into app.platform_audit'))).toBe(true);
  });
});

describe('addPlatformAdminAction', () => {
  const TARGET_USER = { id: '44444444-4444-4444-8444-444444444444', email: 'kim@acme.com' };

  function auditWritten(): boolean {
    return state.ownerCalls.some(
      (c) =>
        normalize(c.sql).startsWith('insert into app.platform_audit') &&
        (c.params[3] as string) === 'platform.admin.added',
    );
  }

  it('rejects an invalid email before touching the DB', async () => {
    const { addPlatformAdminAction } = await import('./actions');
    await expect(addPlatformAdminAction('not-an-email')).resolves.toEqual({ ok: false, error: 'invalid_email' });
    expect(state.ownerCalls.some((c) => normalize(c.sql).startsWith('select id::text as id'))).toBe(false);
  });

  it('returns not_found when no user has that email', async () => {
    state.userLookup = null;
    const { addPlatformAdminAction } = await import('./actions');
    await expect(addPlatformAdminAction('ghost@acme.com')).resolves.toEqual({ ok: false, error: 'not_found' });
    expect(auditWritten()).toBe(false);
  });

  it('adds a new admin and writes a platform.admin.added audit row', async () => {
    state.userLookup = TARGET_USER;
    state.upsertRow = { was_revoked: false, existed: false };
    const { addPlatformAdminAction } = await import('./actions');

    await expect(addPlatformAdminAction('KIM@acme.com')).resolves.toEqual({
      ok: true,
      outcome: 'added',
      email: 'kim@acme.com',
    });
    expect(auditWritten()).toBe(true);
  });

  it('revives a previously-revoked admin (outcome=revived) and audits it', async () => {
    state.userLookup = TARGET_USER;
    state.upsertRow = { was_revoked: true, existed: true };
    const { addPlatformAdminAction } = await import('./actions');

    await expect(addPlatformAdminAction('kim@acme.com')).resolves.toEqual({
      ok: true,
      outcome: 'revived',
      email: 'kim@acme.com',
    });
    expect(auditWritten()).toBe(true);
  });

  it('is a no-op success (already_admin) for an active admin and writes NO audit row', async () => {
    state.userLookup = TARGET_USER;
    state.upsertRow = { was_revoked: false, existed: true };
    const { addPlatformAdminAction } = await import('./actions');

    await expect(addPlatformAdminAction('kim@acme.com')).resolves.toEqual({
      ok: true,
      outcome: 'already_admin',
      email: 'kim@acme.com',
    });
    expect(auditWritten()).toBe(false);
  });

  it('is a no-op success (self) when the actor adds their own email', async () => {
    // USER_ID is the actor from the getCachedUser mock.
    state.userLookup = { id: USER_ID, email: 'me@acme.com' };
    const { addPlatformAdminAction } = await import('./actions');

    await expect(addPlatformAdminAction('me@acme.com')).resolves.toEqual({
      ok: true,
      outcome: 'self',
      email: 'me@acme.com',
    });
    expect(auditWritten()).toBe(false);
    // Self path must not run the upsert.
    expect(state.ownerCalls.some((c) => normalize(c.sql).startsWith('with existing as'))).toBe(false);
  });
});

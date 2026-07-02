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

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SITE_COOKIE_NAME } from './site-context';
import { setActiveSite } from './site-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const SITE_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

let siteExists = true;
let admin = false;
let assignmentCount = 0;
let assignedSiteIds = new Set<string>();
let client: QueryClient;
let cookieStore: { set: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => cookieStore),
}));

vi.mock('../auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

beforeEach(() => {
  siteExists = true;
  admin = false;
  assignmentCount = 0;
  assignedSiteIds = new Set<string>();
  cookieStore = { set: vi.fn(), delete: vi.fn() };
  client = {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);
      if (q.startsWith('select true as ok from public.sites')) {
        expect(q).toContain('org_id = app.current_org_id()');
        expect(q).toContain('and is_active');
        expect(params).toEqual([SITE_ID]);
        return { rows: siteExists ? [{ ok: true }] : [], rowCount: siteExists ? 1 : 0 };
      }
      if (q.includes('from public.user_roles')) {
        expect(q).toContain('ur.org_id = app.current_org_id()');
        expect(q).toContain('r.slug = any');
        expect(params[0]).toBe(USER_ID);
        return { rows: admin ? [{ ok: 1 }] : [], rowCount: admin ? 1 : 0 };
      }
      if (q.includes('select count(*)::int as count from public.user_sites')) {
        expect(q).toContain('us.org_id = app.current_org_id()');
        expect(params).toEqual([USER_ID]);
        return { rows: [{ count: assignmentCount }], rowCount: 1 };
      }
      if (q.includes('from public.user_sites us') && q.includes('and us.site_id = $2::uuid')) {
        expect(q).toContain('us.org_id = app.current_org_id()');
        expect(params).toEqual([USER_ID, SITE_ID]);
        const allowed = assignedSiteIds.has(String(params[1]));
        return { rows: allowed ? [{ ok: true }] : [], rowCount: allowed ? 1 : 0 };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
  vi.clearAllMocks();
});

describe('setActiveSite', () => {
  it('writes the cookie only after the active site is verified in org context', async () => {
    assignmentCount = 1;
    assignedSiteIds = new Set([SITE_ID]);

    const result = await setActiveSite(SITE_ID);

    expect(result).toEqual({ ok: true });
    expect(cookieStore.set).toHaveBeenCalledWith(
      SITE_COOKIE_NAME,
      SITE_ID,
      expect.objectContaining({ path: '/', sameSite: 'lax', httpOnly: true }),
    );
  });

  it('does not write the cookie for an inactive or cross-org site', async () => {
    siteExists = false;

    const result = await setActiveSite(SITE_ID);

    expect(result).toEqual({ ok: false });
    expect(client.query).toHaveBeenCalledOnce();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('rejects a restricted user assigned to another site without writing the cookie', async () => {
    assignmentCount = 1;
    assignedSiteIds = new Set();

    const result = await setActiveSite(SITE_ID);

    expect(result).toEqual({ ok: false });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('allows an admin user to select any active org site', async () => {
    admin = true;
    assignmentCount = 1;

    const result = await setActiveSite(SITE_ID);

    expect(result).toEqual({ ok: true });
    expect(cookieStore.set).toHaveBeenCalledWith(
      SITE_COOKIE_NAME,
      SITE_ID,
      expect.objectContaining({ path: '/', sameSite: 'lax', httpOnly: true }),
    );
  });

  it('allows a user with zero site assignments to select any active org site', async () => {
    assignmentCount = 0;

    const result = await setActiveSite(SITE_ID);

    expect(result).toEqual({ ok: true });
    expect(cookieStore.set).toHaveBeenCalledWith(
      SITE_COOKIE_NAME,
      SITE_ID,
      expect.objectContaining({ path: '/', sameSite: 'lax', httpOnly: true }),
    );
  });

  it('rejects malformed site ids without touching DB or cookies', async () => {
    const result = await setActiveSite('not-a-uuid');

    expect(result).toEqual({ ok: false });
    expect(client.query).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});

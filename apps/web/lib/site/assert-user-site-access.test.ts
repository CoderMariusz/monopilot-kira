import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertUserSiteAccess } from './assert-user-site-access';
import { SiteAccessError } from './site-access-error';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const USER_ID = '33333333-3333-4333-8333-333333333333';
const SITE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_SITE_ID = '44444444-4444-4444-8444-444444444444';

let admin = false;
let assignmentCount = 0;
let assignedSiteIds = new Set<string>();
let client: QueryClient;

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

beforeEach(() => {
  admin = false;
  assignmentCount = 0;
  assignedSiteIds = new Set<string>();
  client = {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);
      if (q.includes('from public.user_roles')) {
        expect(q).toContain('ur.org_id = app.current_org_id()');
        expect(q).toContain('r.slug = any');
        expect(params[0]).toBe(USER_ID);
        expect(params[1]).toEqual(['org.access.admin', 'org.platform.admin', 'owner', 'admin', 'org_admin']);
        return { rows: admin ? [{ ok: 1 }] : [], rowCount: admin ? 1 : 0 };
      }
      if (q.includes('select count(*)::int as count from public.user_sites')) {
        expect(q).toContain('us.org_id = app.current_org_id()');
        expect(params).toEqual([USER_ID]);
        return { rows: [{ count: assignmentCount }], rowCount: 1 };
      }
      if (q.includes('from public.user_sites us') && q.includes('and us.site_id = $2::uuid')) {
        expect(q).toContain('us.org_id = app.current_org_id()');
        const allowed = assignedSiteIds.has(String(params[1]));
        return { rows: allowed ? [{ ok: true }] : [], rowCount: allowed ? 1 : 0 };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
});

describe('assertUserSiteAccess', () => {
  it('returns true for admin users', async () => {
    admin = true;
    assignmentCount = 1;

    await expect(assertUserSiteAccess(USER_ID, OTHER_SITE_ID, client)).resolves.toBe(true);
  });

  it('returns true when the user has zero site assignments', async () => {
    assignmentCount = 0;

    await expect(assertUserSiteAccess(USER_ID, OTHER_SITE_ID, client)).resolves.toBe(true);
  });

  it('returns true when the requested site is assigned', async () => {
    assignmentCount = 1;
    assignedSiteIds = new Set([SITE_ID]);

    await expect(assertUserSiteAccess(USER_ID, SITE_ID, client)).resolves.toBe(true);
  });

  it('throws SiteAccessError when a restricted user requests an unassigned site', async () => {
    assignmentCount = 1;
    assignedSiteIds = new Set([SITE_ID]);

    await expect(assertUserSiteAccess(USER_ID, OTHER_SITE_ID, client)).rejects.toBeInstanceOf(SiteAccessError);
    await expect(assertUserSiteAccess(USER_ID, OTHER_SITE_ID, client)).rejects.toMatchObject({
      siteId: OTHER_SITE_ID,
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getUserSites } from './get-user-sites';
import { getOrgSites } from './get-org-sites';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const USER_ID = '33333333-3333-4333-8333-333333333333';
const SITE_A = '11111111-1111-4111-8111-111111111111';
const SITE_B = '22222222-2222-4222-8222-222222222222';
const ORG_SITES = [
  { id: SITE_A, siteCode: 'A', name: 'Alpha', isDefault: true },
  { id: SITE_B, siteCode: 'B', name: 'Beta', isDefault: false },
];

const { state } = vi.hoisted(() => ({
  state: {
    client: undefined as QueryClient | undefined,
  },
}));

vi.mock('../auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({
      userId: USER_ID,
      orgId: '99999999-9999-4999-8999-999999999999',
      client: state.client as QueryClient,
    }),
  ),
}));

vi.mock('./get-org-sites', () => ({
  getOrgSites: vi.fn(async () => ORG_SITES),
}));

let admin = false;
let assignmentCount = 0;
let assignedRows: Array<{ id: string; site_code: string; name: string; is_default: boolean }> = [];

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

beforeEach(() => {
  admin = false;
  assignmentCount = 0;
  assignedRows = [];
  state.client = {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);
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
      if (q.includes('from public.user_sites us') && q.includes('join public.sites s')) {
        expect(q).toContain('us.org_id = app.current_org_id()');
        expect(q).toContain('and s.is_active = true');
        expect(q).toContain('order by s.is_default desc, s.name asc');
        expect(params).toEqual([USER_ID]);
        return { rows: assignedRows, rowCount: assignedRows.length };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
  vi.clearAllMocks();
});

describe('getUserSites', () => {
  it('returns all org sites for admin users', async () => {
    admin = true;
    assignmentCount = 1;

    const result = await getUserSites(USER_ID);

    expect(result).toEqual(ORG_SITES);
    expect(getOrgSites).toHaveBeenCalledOnce();
  });

  it('returns all org sites when the user has zero assignments', async () => {
    assignmentCount = 0;

    const result = await getUserSites(USER_ID);

    expect(result).toEqual(ORG_SITES);
    expect(getOrgSites).toHaveBeenCalledOnce();
  });

  it('returns only assigned active sites for restricted users', async () => {
    assignmentCount = 2;
    assignedRows = [
      { id: SITE_A, site_code: 'A', name: 'Alpha', is_default: true },
      { id: SITE_B, site_code: 'B', name: 'Beta', is_default: false },
    ];

    const result = await getUserSites(USER_ID);

    expect(result).toEqual([
      { id: SITE_A, siteCode: 'A', name: 'Alpha', isDefault: true },
      { id: SITE_B, siteCode: 'B', name: 'Beta', isDefault: false },
    ]);
    expect(getOrgSites).not.toHaveBeenCalled();
  });
});

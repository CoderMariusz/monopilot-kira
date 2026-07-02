import { beforeEach, describe, expect, it, vi } from 'vitest';

import { searchTraceability } from './search-traceability';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

let grantedPermissions: Set<string>;
let client: { query: ReturnType<typeof vi.fn> };

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: typeof client }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

beforeEach(() => {
  grantedPermissions = new Set(['quality.dashboard.view']);
  client = {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      const normalized = normalize(sql);
      if (normalized.includes('from public.user_roles')) {
        const permission = String(params?.[2] ?? '');
        const ok = grantedPermissions.has(permission);
        return { rows: ok ? [{ ok: true }] : [], rowCount: ok ? 1 : 0 };
      }
      if (normalized.includes('seed_lps')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
});

describe('searchTraceability RBAC', () => {
  it('returns forbidden without quality.dashboard.view', async () => {
    grantedPermissions.clear();

    const result = await searchTraceability({ query: 'LP-001' });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('queries trace data when quality.dashboard.view is granted', async () => {
    const result = await searchTraceability({ query: 'LP-001' });

    expect(result).toEqual({ ok: true, data: { nodes: [], edges: [] } });
    expect(client.query.mock.calls.length).toBeGreaterThan(1);
  });
});

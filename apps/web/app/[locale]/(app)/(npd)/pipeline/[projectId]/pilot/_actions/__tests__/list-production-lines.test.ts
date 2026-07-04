import { afterEach, describe, expect, it, vi } from 'vitest';

const { queryMock, getActiveSiteIdMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  getActiveSiteIdMock: vi.fn(),
}));

vi.mock('../../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: <T,>(fn: (ctx: unknown) => Promise<T>) =>
    fn({
      userId: '11111111-1111-4111-8111-111111111111',
      orgId: '22222222-2222-4222-8222-222222222222',
      client: { query: queryMock },
    }),
}));

vi.mock('../../../../../../../../../lib/site/site-context', () => ({
  getActiveSiteId: getActiveSiteIdMock,
}));

import { listProductionLines } from '../list-production-lines';

afterEach(() => {
  queryMock.mockReset();
  getActiveSiteIdMock.mockReset();
});

describe('listProductionLines', () => {
  it('binds null for All-sites context so every org line can be returned', async () => {
    getActiveSiteIdMock.mockResolvedValue(undefined);
    queryMock.mockImplementation(async (sql: string, params: readonly unknown[] = []) => {
      if (/role_permissions/.test(sql) && /rp\.permission = \$3/.test(sql)) {
        return { rows: [{ ok: true }] };
      }
      if (/from public\.production_lines pl/.test(sql)) {
        expect(params[0]).toBeNull();
        expect(sql).toContain('($1::uuid is null or pl.site_id = $1::uuid or pl.site_id is null)');
        return {
          rows: [
            {
              id: 'line-1',
              code: 'L1',
              name: 'Line 1',
              warehouse_id: 'warehouse-1',
              site_id: 'site-1',
              site_code: 'S1',
              site_name: 'Site 1',
            },
            {
              id: 'line-2',
              code: 'L2',
              name: 'Line 2',
              warehouse_id: 'warehouse-2',
              site_id: 'site-2',
              site_code: 'S2',
              site_name: 'Site 2',
            },
          ],
        };
      }
      return { rows: [] };
    });

    const lines = await listProductionLines();

    expect(lines.map((line) => line.code)).toEqual(['L1', 'L2']);
  });
});

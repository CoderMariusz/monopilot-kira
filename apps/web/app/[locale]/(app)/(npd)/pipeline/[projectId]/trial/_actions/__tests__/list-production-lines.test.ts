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

vi.mock('../../../../../../../../../lib/auth/has-permission', () => ({
  hasPermission: vi.fn(async () => true),
}));

vi.mock('../../../../../../../../../lib/site/site-context', () => ({
  getActiveSiteId: getActiveSiteIdMock,
}));

import { listProductionLines } from '../list-production-lines';

const SITE_X = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

afterEach(() => {
  queryMock.mockReset();
  getActiveSiteIdMock.mockReset();
});

describe('trial listProductionLines (B2 site filter)', () => {
  it('returns only active-site lines plus null-site lines when a site is selected', async () => {
    getActiveSiteIdMock.mockResolvedValue(SITE_X);
    queryMock.mockImplementation(async (sql: string, params: readonly unknown[] = []) => {
      if (/from public\.production_lines pl/.test(sql)) {
        expect(params[0]).toBe(SITE_X);
        expect(sql).toContain('($1::uuid is null or pl.site_id = $1::uuid or pl.site_id is null)');
        return {
          rows: [
            { id: 'line-site-x', code: 'LINE-X', name: 'Line X' },
            { id: 'line-global', code: 'LINE-G', name: 'Global line' },
          ],
        };
      }
      return { rows: [] };
    });

    const lines = await listProductionLines();
    expect(lines.map((l) => l.code)).toEqual(['LINE-X', 'LINE-G']);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { searchFgProducts, listProductionResources } from './wo-form-data';
import type { QueryClient } from './shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

let client: QueryClient;

const { withOrgContextMock, getActiveSiteIdMock } = vi.hoisted(() => ({
  withOrgContextMock: vi.fn(),
  getActiveSiteIdMock: vi.fn(),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: withOrgContextMock,
}));

vi.mock('../../../../../../../lib/site/site-context', () => ({
  getActiveSiteId: getActiveSiteIdMock,
}));

function makeClient(): QueryClient {
  return {
    query: vi.fn(async () => ({
      rows: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          item_code: 'CO-FAT-TRIM',
          name: 'Rendered fat trim (co-product)',
          uom_base: 'kg',
          output_uom: 'base',
          net_qty_per_each: null,
          each_per_box: null,
          boxes_per_pallet: null,
          weight_mode: 'catch',
        },
      ],
      rowCount: 1,
    })),
  } as unknown as QueryClient;
}

describe('searchFgProducts (M-7: co_product is plannable)', () => {
  beforeEach(() => {
    client = makeClient();
    withOrgContextMock.mockImplementation(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
    getActiveSiteIdMock.mockResolvedValue(null);
  });

  it('queries plannable outputs — both fg AND co_product item types', async () => {
    const result = await searchFgProducts({ query: 'co' });

    expect(result[0]).toEqual(expect.objectContaining({ itemCode: 'CO-FAT-TRIM' }));

    const sql = vi.mocked(client.query).mock.calls
      .map(([s]) => String(s).replace(/\s+/g, ' ').toLowerCase())
      .find((s) => s.includes('from public.items'));
    expect(sql).toBeDefined();
    // The picker must include co_product, not only fg.
    expect(sql).toContain("i.item_type in ('fg', 'co_product')");
    expect(sql).not.toMatch(/i\.item_type = 'fg'/);
    // Factory-release owner gate — exclude unreleased NPD FGs.
    expect(sql).toContain('factory_release_status');
    expect(sql).toContain('released_to_factory');
    expect(sql).toContain('npd_project_id');
  });
});

describe('listProductionResources (Extra-2 site filter)', () => {
  const SITE_Y = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  beforeEach(() => {
    client = makeClient();
    withOrgContextMock.mockImplementation(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
    getActiveSiteIdMock.mockResolvedValue(SITE_Y);
  });

  it('scopes production lines to the active site (plus null-site lines)', async () => {
    vi.mocked(client.query).mockImplementation(async (sql: string, params: readonly unknown[] = []) => {
      if (/from public\.production_lines/.test(sql)) {
        expect(params[0]).toBe(SITE_Y);
        expect(sql).toContain('($1::uuid is null or pl.site_id = $1::uuid or pl.site_id is null)');
        return {
          rows: [{ id: 'line-y', code: 'LY', name: 'Line Y' }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await listProductionResources();
    expect(result.lines).toEqual([{ id: 'line-y', code: 'LY', name: 'Line Y' }]);
  });
});

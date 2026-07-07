import { beforeEach, describe, expect, it, vi } from 'vitest';

import { searchFgProducts } from './wo-form-data';
import type { QueryClient } from './shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

let client: QueryClient;

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
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

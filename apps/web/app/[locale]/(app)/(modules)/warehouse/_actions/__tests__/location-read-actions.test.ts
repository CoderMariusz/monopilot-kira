import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listLocations } from '../location-read-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const LOC_ID = '33333333-3333-4333-8333-333333333333';
const WH_ID = '44444444-4444-4444-8444-444444444444';

let client: QueryClient;
let allowPermission = true;
let locationRows: Array<Record<string, unknown>> = [];

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string) => {
      const q = normalize(sql);
      if (q.includes('from public.user_roles')) {
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }
      if (q.includes('from public.locations')) {
        return { rows: locationRows };
      }
      return { rows: [] };
    }),
  };
}

beforeEach(() => {
  allowPermission = true;
  locationRows = [
    { id: LOC_ID, code: 'A-01', name: 'Aisle 01', warehouse_id: WH_ID, warehouse_code: 'WH1', warehouse_name: 'Main' },
  ];
  client = makeClient();
});

describe('listLocations', () => {
  it('returns org-scoped locations joined to their warehouse', async () => {
    const res = await listLocations();
    expect(res).toEqual({
      ok: true,
      data: [
        { id: LOC_ID, code: 'A-01', name: 'Aisle 01', warehouseId: WH_ID, warehouseCode: 'WH1', warehouseName: 'Main' },
      ],
    });
  });

  it('returns an empty list (empty-state) when no locations exist', async () => {
    locationRows = [];
    const res = await listLocations();
    expect(res).toEqual({ ok: true, data: [] });
  });

  it('is forbidden without warehouse.inventory.read', async () => {
    allowPermission = false;
    const res = await listLocations();
    expect(res).toEqual({ ok: false, reason: 'forbidden' });
  });
});

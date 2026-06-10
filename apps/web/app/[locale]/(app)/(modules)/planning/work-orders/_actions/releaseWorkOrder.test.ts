import { beforeEach, describe, expect, it, vi } from 'vitest';

import { releaseWorkOrder } from './releaseWorkOrder';
import type { QueryClient } from './shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';

let client: QueryClient;
let allowPermission = true;
let currentStatus: string | null = 'DRAFT';

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
      if (normalized.includes('from public.user_roles')) {
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }
      if (normalized.startsWith('select status from public.work_orders')) {
        return { rows: currentStatus ? [{ status: currentStatus }] : [], rowCount: currentStatus ? 1 : 0 };
      }
      if (normalized.startsWith('update public.work_orders')) {
        return {
          rows: [
            {
              id: WO_ID,
              wo_number: 'WO-001',
              product_id: PRODUCT_ID,
              item_code: 'FG-NPD-004',
              item_type_at_creation: 'fg',
              planned_quantity: '1000.000',
              produced_quantity: null,
              uom: 'kg',
              status: 'RELEASED',
              scheduled_start_time: null,
              scheduled_end_time: null,
              production_line_id: null,
              machine_id: null,
              priority: 'normal',
              source_of_demand: 'manual',
              source_reference: 'FG-NPD-004',
              notes: null,
              created_at: '2026-06-09T07:00:00.000Z',
              updated_at: '2026-06-09T07:00:00.000Z',
            },
          ],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('insert into public.wo_status_history')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('releaseWorkOrder', () => {
  beforeEach(() => {
    allowPermission = true;
    currentStatus = 'DRAFT';
    client = makeClient();
  });

  it('transitions DRAFT to RELEASED and returns the updated header', async () => {
    const result = await releaseWorkOrder({ id: WO_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.workOrder).toEqual(expect.objectContaining({ id: WO_ID, status: 'RELEASED' }));
  });

  it('returns forbidden when the caller lacks planning write permission', async () => {
    allowPermission = false;

    await expect(releaseWorkOrder({ id: WO_ID })).resolves.toEqual({ ok: false, error: 'forbidden' });
  });

  it('rejects non-DRAFT work orders', async () => {
    currentStatus = 'IN_PROGRESS';

    await expect(releaseWorkOrder({ id: WO_ID })).resolves.toEqual({ ok: false, error: 'invalid_state' });
  });
});

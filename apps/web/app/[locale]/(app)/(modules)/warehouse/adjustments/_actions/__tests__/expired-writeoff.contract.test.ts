import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WAREHOUSE_ID = '33333333-3333-4333-8333-333333333333';
const LOCATION_ID = '44444444-4444-4444-8444-444444444444';
const ITEM_ID = '55555555-5555-4555-8555-555555555555';
const LP_ID = '66666666-6666-4666-8666-666666666666';
const CLIENT_OP_ID = '77777777-7777-4777-8777-777777777777';
const SUPERVISOR_ID = '88888888-8888-4888-8888-888888888888';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

let client: QueryClient & { query: ReturnType<typeof vi.fn> };

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('@monopilot/e-sign', () => ({
  signEvent: vi.fn(async () => ({ signatureId: '99999999-9999-4999-8999-999999999999' })),
}));

vi.mock('@monopilot/server/quality/holdsGuard.js', () => ({
  assertNoActiveHoldForLp: vi.fn(async () => undefined),
}));

vi.mock('../../../../../../../../../../packages/auth/src/verify-pin.js', () => ({
  verifyPin: vi.fn(async () => true),
}));

vi.mock('../../../../../../../../lib/finance/upsert-wac', () => ({
  creditWacAtAvgCost: vi.fn(async () => undefined),
  debitWac: vi.fn(async () => undefined),
}));

vi.mock('../../../../../../../../lib/warehouse/lp-create', () => ({
  makeLpNumber: vi.fn(() => 'LP-ADJ-1'),
  makeStockMoveNumber: vi.fn(() => 'SM-ADJ-1'),
}));

import { applyDirectAdjustment } from '../../../_actions/direct-adjust-actions';

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient & { query: ReturnType<typeof vi.fn> } {
  return {
    query: vi.fn(async (sql: string) => {
      const q = normalize(sql);
      if (q.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (q.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (q.includes('from public.user_pins')) return { rows: [{ ok: true }] };
      if (q.includes('from public.stock_moves sm')) return { rows: [] };
      if (q.startsWith('select i.uom_base as base_uom')) {
        return {
          rows: [{
            base_uom: 'kg',
            secondary_uom: null,
            output_uom: 'base',
            net_qty_per_each: null,
            each_per_box: null,
            input_factor_to_base: '1',
            input_category: 'mass',
            base_factor_to_base: '1',
            base_category: 'mass',
          }],
        };
      }
      if (q.startsWith('select lp.id::text') && q.includes('from public.license_plates lp')) {
        const filtersExpired = q.includes('expiry_date') && q.includes('current_date');
        return {
          rows: filtersExpired
            ? []
            : [{
                id: LP_ID,
                site_id: sessionSiteId,
                status: 'available',
                quantity: '5',
                reserved_qty: '0',
                uom: 'kg',
              }],
        };
      }
      if (q.startsWith('update public.license_plates')) {
        return { rows: [{ quantity: '4', status: 'available' }] };
      }
      if (q.startsWith('insert into public.stock_adjustments')) return { rows: [{ id: 'adjustment-1' }] };
      if (q.startsWith('insert into public.stock_moves')) return { rows: [] };
      if (q.startsWith('insert into public.lp_state_history')) return { rows: [] };
      throw new Error(`unexpected query: ${q}`);
    }),
  } as QueryClient & { query: ReturnType<typeof vi.fn> };
}

const sessionSiteId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('WH-128 expired LP egress contract', () => {
  beforeEach(() => {
    client = makeClient();
  });

  it('allows an expiry_write_off decrease against an expired released LP', async () => {
    const result = await applyDirectAdjustment({
      warehouseId: WAREHOUSE_ID,
      locationId: LOCATION_ID,
      itemId: ITEM_ID,
      lpId: LP_ID,
      direction: 'decrease',
      quantity: '1',
      uom: 'kg',
      reasonCode: 'expiry_write_off',
      signature: { password: '123456' },
      supervisorUserId: SUPERVISOR_ID,
      supervisorPin: '654321',
      clientOpId: CLIENT_OP_ID,
    });

    expect(result).toEqual({ ok: true, data: { adjustmentId: 'adjustment-1', lpId: LP_ID } });
  });
});

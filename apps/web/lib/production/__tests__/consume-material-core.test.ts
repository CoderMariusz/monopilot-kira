import { describe, expect, it, vi } from 'vitest';

import {
  NIL_LP_UUID,
  ConsumptionQuantityError,
  isNilOrZeroLpId,
  normalizePersistedQuantity,
  resolveConsumptionLp,
} from '../consume-material-core';
import type { QueryClient } from '../shared';

const LP_HELD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRODUCT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ORG_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SITE_A = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SITE_B = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const LP_SITE_A = '11111111-1111-4111-8111-111111111111';
const LP_SITE_B = '22222222-2222-4222-8222-222222222222';

function makeClient(mode: 'held-only' | 'no-stock'): QueryClient {
  return {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.includes('from public.v_inventory_available cand')) {
        return { rows: [] };
      }
      if (normalized.includes('from public.license_plates lp') && normalized.includes('v_active_holds')) {
        expect(normalized).toContain("lp.qa_status in ('released', 'on_hold')");
        return { rows: mode === 'held-only' ? [{ lp_id: LP_HELD }] : [] };
      }
      if (normalized.includes('with target_lp as')) {
        return {
          rows:
            mode === 'held-only'
              ? [{ hold_id: 'hold-1', reference_type: 'lp', reference_id: LP_HELD }]
              : [],
        };
      }
      if (normalized.includes('for update of lp') || (normalized.includes('from public.license_plates lp') && normalized.includes('for update'))) {
        return {
          rows: [
            {
              id: params?.[0] ?? LP_HELD,
              status: 'available',
              qa_status: 'on_hold',
              expired: false,
              locked_by: null,
              lock_is_active_for_other_user: false,
            },
          ],
        };
      }
      if (normalized.includes('from public.license_plates lp') && normalized.includes('and lp.id = $1::uuid')) {
        return {
          rows: [
            {
              id: LP_HELD,
              product_id: PRODUCT_ID,
              status: 'available',
              site_id: null,
              location_id: null,
            },
          ],
        };
      }
      throw new Error(`unexpected sql: ${normalized}`);
    }),
  } as unknown as QueryClient;
}

describe('resolveConsumptionLp hold messaging (N2)', () => {
  it('returns quality_hold_active when only on_hold stock under an active hold satisfies the quantity', async () => {
    const client = makeClient('held-only');
    const result = await resolveConsumptionLp(
      { client, userId: USER_ID },
      { explicitLpId: null, productIds: [PRODUCT_ID], uom: 'kg', qty: '5', siteId: SITE_A },
    );
    expect(result).toMatchObject({ ok: false, error: 'quality_hold_active' });
  });

  it('returns lp_unavailable when no stock exists at all', async () => {
    const client = makeClient('no-stock');
    const result = await resolveConsumptionLp(
      { client, userId: USER_ID },
      { explicitLpId: null, productIds: [PRODUCT_ID], uom: 'kg', qty: '5', siteId: SITE_A },
    );
    expect(result).toEqual({ ok: false, error: 'lp_unavailable' });
  });
});

function makeSiteScopedClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (normalized.includes('from public.v_inventory_available cand')) {
        const siteFilterPresent =
          normalized.includes('cand.site_id = $4::uuid') && params?.[3] === SITE_A;
        return {
          rows: [
            siteFilterPresent
              ? {
                  lp_id: LP_SITE_A,
                  product_id: PRODUCT_ID,
                  status: 'available',
                  site_id: SITE_A,
                  location_id: null,
                }
              : {
                  lp_id: LP_SITE_B,
                  product_id: PRODUCT_ID,
                  status: 'available',
                  site_id: SITE_B,
                  location_id: null,
                },
          ],
        };
      }

      if (
        normalized.includes('from public.license_plates lp') &&
        normalized.includes('lp.locked_by::text')
      ) {
        return {
          rows: [
            {
              id: params?.[0],
              status: 'available',
              qa_status: 'released',
              expired: false,
              locked_by: null,
              lock_is_active_for_other_user: false,
            },
          ],
        };
      }

      if (normalized.includes('with target_lp as')) {
        return { rows: [] };
      }

      if (
        normalized.includes('from public.license_plates lp') &&
        normalized.includes('lp.product_id = any')
      ) {
        const lpId = String(params?.[0]);
        const siteFilterPresent =
          normalized.includes('lp.site_id = $5::uuid') && params?.[4] === SITE_A;
        if (!siteFilterPresent || lpId === LP_SITE_B) return { rows: [] };
        return {
          rows: [
            {
              id: LP_SITE_A,
              product_id: PRODUCT_ID,
              status: 'available',
              site_id: SITE_A,
              location_id: null,
            },
          ],
        };
      }

      throw new Error(`unexpected sql: ${normalized}`);
    }),
  } as unknown as QueryClient;
}

describe('resolveConsumptionLp work-order site scope', () => {
  it('auto-selects FEFO only from the work-order site', async () => {
    const result = await resolveConsumptionLp(
      { client: makeSiteScopedClient(), userId: USER_ID },
      {
        explicitLpId: null,
        productIds: [PRODUCT_ID],
        uom: 'kg',
        qty: '5',
        siteId: SITE_A,
      },
    );

    expect(result).toMatchObject({ ok: true, lpId: LP_SITE_A, siteId: SITE_A });
  });

  it('rejects an explicit LP from another site but accepts one from the work-order site', async () => {
    const client = makeSiteScopedClient();

    const otherSite = await resolveConsumptionLp(
      { client, userId: USER_ID },
      {
        explicitLpId: LP_SITE_B,
        productIds: [PRODUCT_ID],
        uom: 'kg',
        qty: '5',
        siteId: SITE_A,
      },
    );
    const ownSite = await resolveConsumptionLp(
      { client, userId: USER_ID },
      {
        explicitLpId: LP_SITE_A,
        productIds: [PRODUCT_ID],
        uom: 'kg',
        qty: '5',
        siteId: SITE_A,
      },
    );

    expect(otherSite).toEqual({ ok: false, error: 'lp_unavailable' });
    expect(ownSite).toMatchObject({ ok: true, lpId: LP_SITE_A, siteId: SITE_A });
  });
});

describe('normalizePersistedQuantity (S6)', () => {
  it('preserves fractional kg without integer rounding', () => {
    expect(normalizePersistedQuantity('2.52')).toBe('2.52');
    expect(normalizePersistedQuantity('0.48')).toBe('0.48');
    expect(normalizePersistedQuantity('12.632')).toBe('12.632');
  });

  it('rejects non-positive values', () => {
    expect(() => normalizePersistedQuantity('0')).toThrow(ConsumptionQuantityError);
    expect(() => normalizePersistedQuantity('0.0')).toThrow(ConsumptionQuantityError);
  });

  it('rejects scale beyond wo_material_consumption numeric(12,3)', () => {
    expect(() => normalizePersistedQuantity('1.0000009')).toThrow(ConsumptionQuantityError);
    try {
      normalizePersistedQuantity('1.0000009');
    } catch (error) {
      expect(error).toBeInstanceOf(ConsumptionQuantityError);
      expect((error as ConsumptionQuantityError).code).toBe('qty_scale_exceeded');
    }
  });

  it('rejects magnitude beyond numeric(12,3) range', () => {
    expect(() => normalizePersistedQuantity('1000000000')).toThrow(ConsumptionQuantityError);
    try {
      normalizePersistedQuantity('1000000000');
    } catch (error) {
      expect((error as ConsumptionQuantityError).code).toBe('qty_range_exceeded');
    }
  });
});

describe('isNilOrZeroLpId (C1)', () => {
  it('treats null, empty, and zero UUID as absent', () => {
    expect(isNilOrZeroLpId(null)).toBe(true);
    expect(isNilOrZeroLpId('')).toBe(true);
    expect(isNilOrZeroLpId(NIL_LP_UUID)).toBe(true);
  });

  it('accepts a real UUID', () => {
    expect(isNilOrZeroLpId('66666666-6666-4666-8666-666666666666')).toBe(false);
  });
});

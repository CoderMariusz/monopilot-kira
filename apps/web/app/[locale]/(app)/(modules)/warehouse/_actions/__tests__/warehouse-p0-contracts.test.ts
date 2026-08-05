import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStockMove } from '../stock-move-actions';
import { releaseReservation } from '../reservation-actions';
import type { QueryClient } from '../shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_SITE_ID = '44444444-4444-4444-8444-444444444444';
const LP_ID = '55555555-5555-4555-8555-555555555555';
const FROM_LOCATION_ID = '66666666-6666-4666-8666-666666666666';
const TO_LOCATION_ID = '77777777-7777-4777-8777-777777777777';
const WAREHOUSE_ID = '88888888-8888-4888-8888-888888888888';

let client: QueryClient;
let grantedPermissions: Set<string>;
let activeSiteId: string | null;
let lpSiteId: string | null;
let lpStatus: string;
let lockedByOther: boolean;
let reservedQty: string;

vi.mock('../../../../../../../lib/auth/with-site-context', () => ({
  withSiteContext: vi.fn(async (action: (ctx: {
    userId: string;
    orgId: string;
    client: QueryClient;
    siteId: string | null;
  }) => Promise<unknown>) => action({ userId: USER_ID, orgId: ORG_ID, client, siteId: activeSiteId })),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: {
    userId: string;
    orgId: string;
    client: QueryClient;
  }) => Promise<unknown>) => action({ userId: USER_ID, orgId: ORG_ID, client })),
}));

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
  revalidateAfterCommit: vi.fn(),
}));

vi.mock('../../../shipping/_actions/so-transitions', () => ({
  LIVE_ALLOCATION_SQL: "ia.status = 'allocated'",
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      const q = normalize(sql);

      if (q.includes('from public.user_roles')) {
        const permission = String(params?.[2] ?? '');
        const allowed = grantedPermissions.has(permission);
        return { rows: allowed ? [{ ok: true }] : [], rowCount: allowed ? 1 : 0 };
      }

      if (q.includes('from public.license_plates lp') && q.includes('for update')) {
        if (q.includes('lp.reserved_for_wo_id')) {
          return {
            rows: [{
              id: LP_ID,
              status: lpStatus,
              reserved_qty: reservedQty,
              reserved_for_wo_id: null,
              locked_by: lockedByOther ? '99999999-9999-4999-8999-999999999999' : null,
              lock_is_active_for_other_user: lockedByOther,
            }],
            rowCount: 1,
          };
        }

        const hasSitePredicate = q.includes('and ($3::uuid is null or lp.site_id = $3::uuid)');
        const visible = !hasSitePredicate || activeSiteId === null || lpSiteId === activeSiteId;
        return {
          rows: visible
            ? [{
                id: LP_ID,
                lp_number: 'LP-001',
                status: lpStatus,
                location_id: FROM_LOCATION_ID,
                quantity: '10.000000',
                uom: 'kg',
                site_id: lpSiteId,
                locked_by: null,
                lock_is_active_for_other_user: false,
              }]
            : [],
          rowCount: visible ? 1 : 0,
        };
      }

      if (q.startsWith('select loc.id::text')) {
        return {
          rows: [{ id: TO_LOCATION_ID, warehouse_id: WAREHOUSE_ID, site_id: activeSiteId }],
          rowCount: 1,
        };
      }

      if (q.startsWith('insert into public.stock_moves')) {
        return { rows: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }], rowCount: 1 };
      }

      if (q.startsWith('select sm.id::text')) {
        return {
          rows: [{
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            move_number: 'SM-001',
            lp_id: LP_ID,
            lp_number: 'LP-001',
            move_type: 'transfer',
            from_location_code: 'A-01',
            to_location_code: 'B-01',
            quantity: '10.000000',
            uom: 'kg',
            move_date: '2026-07-30T12:00:00.000Z',
            reason_text: 'relocate',
          }],
          rowCount: 1,
        };
      }

      if (q.startsWith('update public.license_plates lp') && q.includes('set reserved_qty = 0')) {
        const nextStatus = String(params?.[1]);
        return {
          rows: [{
            lp_id: LP_ID,
            lp_number: 'LP-001',
            status: nextStatus,
            reserved_qty: '0.000000',
            reserved_for_wo_id: null,
            wo_number: null,
            item_code: 'RM-001',
            item_name: 'Raw material',
            quantity: '10.000000',
            uom: 'kg',
          }],
          rowCount: 1,
        };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

beforeEach(() => {
  grantedPermissions = new Set(['warehouse.stock.move', 'warehouse.lp.reserve']);
  activeSiteId = SITE_ID;
  lpSiteId = SITE_ID;
  lpStatus = 'available';
  lockedByOther = false;
  reservedQty = '5.000000';
  client = makeClient();
});

describe('P0 GAP contracts — desktop stock move', () => {
  it('WH-044 rejects without warehouse.stock.move before loading the LP', async () => {
    grantedPermissions.delete('warehouse.stock.move');

    await expect(
      createStockMove({
        lpId: LP_ID,
        toLocationId: TO_LOCATION_ID,
        reason: 'relocate',
        clientOpId: 'WH-044-forbidden',
      }),
    ).resolves.toEqual({ ok: false, reason: 'forbidden' });

    expect(vi.mocked(client.query).mock.calls.some(([sql]) => normalize(String(sql)).includes('from public.license_plates lp'))).toBe(false);
  });

  it('WH-044 hides an LP outside the active site and performs no write', async () => {
    lpSiteId = OTHER_SITE_ID;

    await expect(
      createStockMove({
        lpId: LP_ID,
        toLocationId: TO_LOCATION_ID,
        reason: 'relocate',
        clientOpId: 'WH-044-cross-site',
      }),
    ).resolves.toEqual({ ok: false, reason: 'not_found' });

    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => normalize(String(sql)));
    expect(calls.find((sql) => sql.includes('from public.license_plates lp'))).toContain(
      'and ($3::uuid is null or lp.site_id = $3::uuid)',
    );
    expect(calls.some((sql) => sql.startsWith('insert into public.stock_moves'))).toBe(false);
  });

  it('WH-044 allows a permitted move for an LP in the active site', async () => {
    const result = await createStockMove({
      lpId: LP_ID,
      toLocationId: TO_LOCATION_ID,
      reason: 'relocate',
      clientOpId: 'WH-044-ok',
    });

    expect(result.ok).toBe(true);
    expect(vi.mocked(client.query).mock.calls.some(([sql]) => normalize(String(sql)).startsWith('insert into public.stock_moves'))).toBe(true);
  });
});

describe('P0 GAP contracts — reservation release', () => {
  it.each([
    ['reserved', 'available'],
    ['available', 'available'],
  ])('WH-050 clears quantity and maps status %s → %s', async (fromStatus, expectedStatus) => {
    lpStatus = fromStatus;

    const result = await releaseReservation({ lpId: LP_ID, reason: 'release contract' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message ?? result.reason);
    expect(result.data).toMatchObject({
      status: expectedStatus,
      reservedQty: '0.000000',
      reservedForWoId: null,
    });
  });

  it.each(['consumed', 'destroyed', 'shipped', 'merged'])(
    'WH-050 rejects terminal status %s without clearing the reservation',
    async (status) => {
      lpStatus = status;

      await expect(releaseReservation({ lpId: LP_ID, reason: 'release contract' })).resolves.toEqual({
        ok: false,
        reason: 'error',
        message: 'not_releasable_status',
      });

      expect(
        vi.mocked(client.query).mock.calls.some(([sql]) =>
          normalize(String(sql)).startsWith('update public.license_plates lp')),
      ).toBe(false);
    },
  );

  it('WH-050 rejects a fresh foreign scanner lock and allows the same LP after unlock', async () => {
    lockedByOther = true;
    await expect(releaseReservation({ lpId: LP_ID, reason: 'release contract' })).resolves.toEqual({
      ok: false,
      reason: 'error',
      message: 'locked',
    });

    lockedByOther = false;
    client = makeClient();
    await expect(releaseReservation({ lpId: LP_ID, reason: 'release contract' })).resolves.toMatchObject({ ok: true });
  });
});

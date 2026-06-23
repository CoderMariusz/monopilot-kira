import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getSupplierScorecard,
  listCarriers,
  listTransportLanes,
  upsertCarrier,
  upsertTransportLane,
} from '../freight-actions';
import type { QueryClient } from '../procurement-shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const CARRIER_ID = '33333333-3333-4333-8333-333333333333';
const LANE_ID = '44444444-4444-4444-8444-444444444444';
const SUPPLIER_ID = '55555555-5555-4555-8555-555555555555';

let client: QueryClient;
let allowPermission = true;
let carrierExists = true;
let executed: string[] = [];
let upsertLaneParams: readonly unknown[] | null = null;

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function carrierRow() {
  return {
    id: CARRIER_ID,
    code: 'CARR-01',
    name: 'North Freight',
    mode: 'road',
    contact_email: 'ops@example.test',
    contact_phone: '+48123123123',
    is_active: true,
  };
}

function laneRow() {
  return {
    id: LANE_ID,
    carrier_id: CARRIER_ID,
    carrier_name: 'North Freight',
    origin: 'Warsaw',
    destination: 'Berlin',
    mode: 'road',
    cost_basis: 'flat',
    cost_amount: '42.50',
    currency: 'EUR',
    transit_days: 2,
    is_active: true,
  };
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);
      executed.push(q);

      if (q.includes('from public.user_roles')) {
        expect(params).toEqual([USER_ID, ORG_ID, 'npd.planning.write']);
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }
      if (q.startsWith('select id, code, name, mode, contact_email')) {
        return { rows: [carrierRow()], rowCount: 1 };
      }
      if (q.startsWith('insert into public.carriers')) {
        return { rows: [carrierRow()], rowCount: 1 };
      }
      if (q.startsWith('select id from public.carriers')) {
        return { rows: carrierExists ? [{ id: CARRIER_ID }] : [], rowCount: carrierExists ? 1 : 0 };
      }
      if (q.startsWith('insert into public.transport_lanes')) {
        upsertLaneParams = params;
        return { rows: [{ id: LANE_ID }], rowCount: 1 };
      }
      if (q.startsWith('select l.id, l.carrier_id')) {
        return { rows: [laneRow()], rowCount: 1 };
      }
      if (q.startsWith('insert into public.audit_events')) {
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('select id from public.suppliers')) {
        return { rows: [{ id: SUPPLIER_ID }], rowCount: 1 };
      }
      if (q.startsWith('with received_by_line as')) {
        return {
          rows: [
            {
              id: '66666666-6666-4666-8666-666666666666',
              po_number: 'PO-1',
              status: 'received',
              expected_delivery: '2026-06-10',
              first_receipt_date: '2026-06-09T10:00:00.000Z',
              ordered_qty: '100.000',
              received_qty: '95.000',
            },
            {
              id: '77777777-7777-4777-8777-777777777777',
              po_number: 'PO-2',
              status: 'received',
              expected_delivery: '2026-06-12',
              first_receipt_date: '2026-06-14T10:00:00.000Z',
              ordered_qty: '50.000',
              received_qty: '55.000',
            },
          ],
          rowCount: 2,
        };
      }
      if (q.startsWith('select count(*)::text as ncr_count')) {
        return { rows: [{ ncr_count: '3', open_ncr_count: '2' }], rowCount: 1 };
      }
      throw new Error(`unexpected query: ${q}`);
    }),
  };
}

describe('freight planning actions', () => {
  beforeEach(() => {
    allowPermission = true;
    carrierExists = true;
    executed = [];
    upsertLaneParams = null;
    client = makeClient();
  });

  it('carriers upsert round-trip using the org-scoped client', async () => {
    const upserted = await upsertCarrier({
      code: 'CARR-01',
      name: 'North Freight',
      mode: 'road',
      contactEmail: 'ops@example.test',
      contactPhone: '+48123123123',
    });
    const carriers = await listCarriers();

    expect(upserted).toEqual({
      ok: true,
      data: {
        id: CARRIER_ID,
        code: 'CARR-01',
        name: 'North Freight',
        mode: 'road',
        contactEmail: 'ops@example.test',
        contactPhone: '+48123123123',
        isActive: true,
      },
    });
    expect(carriers).toEqual([upserted.ok ? upserted.data : null]);
    expect(executed.some((sql) => sql.includes('app.current_org_id()'))).toBe(true);
  });

  it('lanes upsert round-trip using the carrier join and normalizes flat cost basis', async () => {
    const upserted = await upsertTransportLane({
      carrierId: CARRIER_ID,
      origin: 'Warsaw',
      destination: 'Berlin',
      mode: 'road',
      costBasis: 'per_shipment',
      costAmount: '42.50',
      currency: 'eur',
      transitDays: 2,
    });
    const lanes = await listTransportLanes(CARRIER_ID);

    expect(upserted).toEqual({
      ok: true,
      data: {
        id: LANE_ID,
        carrierId: CARRIER_ID,
        carrierName: 'North Freight',
        origin: 'Warsaw',
        destination: 'Berlin',
        mode: 'road',
        costBasis: 'per_shipment',
        costAmount: '42.50',
        currency: 'EUR',
        transitDays: 2,
        isActive: true,
      },
    });
    expect(lanes).toEqual([upserted.ok ? upserted.data : null]);
    expect(upsertLaneParams?.[4]).toBe('flat');
    expect(upsertLaneParams?.[6]).toBe('EUR');
  });

  it('returns not_found before inserting a lane when the carrier is outside the org', async () => {
    carrierExists = false;

    await expect(
      upsertTransportLane({
        carrierId: CARRIER_ID,
        origin: 'Warsaw',
        destination: 'Berlin',
        mode: 'road',
        costBasis: 'per_pallet',
        costAmount: '42.50',
        currency: 'EUR',
        transitDays: 2,
      }),
    ).resolves.toEqual({ ok: false, error: 'not_found' });
    expect(upsertLaneParams).toBeNull();
  });

  it('scorecard computes on-time, quantity variance, and NCR counts from GRN-backed fixtures', async () => {
    const result = await getSupplierScorecard(SUPPLIER_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.onTimePct).toBe(50);
    expect(result.data.avgQtyVariancePct).toBe(7.5);
    expect(result.data.ncrCount).toBe(3);
    expect(result.data.openNcrCount).toBe(2);
    expect(result.data.recentPos).toEqual([
      expect.objectContaining({
        poNumber: 'PO-1',
        status: 'received',
        expectedDelivery: '2026-06-10T00:00:00.000Z',
        receivedAt: '2026-06-09T10:00:00.000Z',
        onTime: true,
        qtyVariancePct: -5,
      }),
      expect.objectContaining({
        poNumber: 'PO-2',
        status: 'received',
        onTime: false,
        qtyVariancePct: 10,
      }),
    ]);
    expect(executed.find((sql) => sql.startsWith('with received_by_line as'))).toContain('from public.grn_items');
    expect(executed.find((sql) => sql.startsWith('select count(*)::text as ncr_count'))).toContain(
      'from public.ncr_reports',
    );
  });
});

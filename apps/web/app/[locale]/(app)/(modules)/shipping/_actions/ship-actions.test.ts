import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateBol, recordPod, sealShipment, shipShipment } from './ship-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SO_ID = '33333333-3333-4333-8333-333333333333';
const SHIPMENT_ID = '44444444-4444-4444-8444-444444444444';
const LP_1 = '55555555-5555-4555-8555-555555555555';
const LP_2 = '66666666-6666-4666-8666-666666666666';
const PRODUCT_ID = '77777777-7777-4777-8777-777777777777';
const PRODUCT_ID_2 = '88888888-8888-4888-8888-888888888888';
const LINE_1 = '77777777-7777-4777-8777-777777777777';
const LINE_2 = '88888888-8888-4888-8888-888888888888';
const FIXED_NOW = '2026-06-23T12:34:56.000Z';

let client: QueryClient;
let grantedPermissions = new Set<string>(['ship.pack.close', 'ship.ship.confirm', 'ship.bol.sign']);
let shipmentStatus = 'packed';
let salesOrderStatus = 'manifested';
let shipmentTransitionSucceeds = true;
let boxCount = 1;
let lpRows: Array<{
  lp_id: string;
  lp_number: string | null;
  product_id: string;
  uom: string;
  shipped_qty: string;
  prior_status: string;
  prior_reserved_qty: string;
}> = [];
let blockedLpRows: Array<{ lp_number: string; reason: string }> = [];
let packedShipmentUpdate: Record<string, unknown> | null = null;
let shippedShipmentUpdate: Record<string, unknown> | null = null;
let shippedLpIds: string[] = [];
let shippedLpSnapshot: Array<Record<string, unknown>> = [];
let shippedExtData: Record<string, unknown> | null = null;
let salesOrderUpdate: Record<string, unknown> | null = null;
let remainingShipmentCount = 0;
let bolUpdate: Record<string, unknown> | null = null;
let podUpdate: Record<string, unknown> | null = null;
let soLineAllocationDecrements: Array<{ line_id: string; qty: string }> = [];
let outboxEvents: Array<{
  aggregateId: string;
  eventType: string;
  aggregateType: string;
  payload: Record<string, unknown>;
  sql: string;
}> = [];
let queryLog: Array<{ sql: string; params: readonly unknown[] }> = [];

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      queryLog.push({ sql, params });
      const q = normalize(sql);

      if (q.includes('from public.user_roles')) {
        const permission = String(params?.[2] ?? '');
        const ok = grantedPermissions.has(permission);
        return { rows: ok ? [{ ok: true }] : [], rowCount: ok ? 1 : 0 };
      }

      if (q.startsWith('select status from public.sales_orders') && q.includes('for update')) {
        return { rows: [{ status: salesOrderStatus }], rowCount: 1 };
      }

      if (q.startsWith('select status, sales_order_id::text') && q.includes('from public.shipments') && q.includes('for update')) {
        return { rows: [{ status: shipmentStatus, sales_order_id: SO_ID }], rowCount: 1 };
      }

      if (q.startsWith('update public.shipments') && q.includes('set status = $2')) {
        if (!shipmentTransitionSucceeds) {
          return { rows: [], rowCount: 0 };
        }
        const nextStatus = String(params[1]);
        shipmentStatus = nextStatus;
        if (nextStatus === 'packed') {
          packedShipmentUpdate = { shipment_id: params[0], sql };
        }
        if (nextStatus === 'shipped') {
          shippedShipmentUpdate = { shipment_id: params[0], sql };
        }
        if (nextStatus === 'delivered') {
          podUpdate = { shipment_id: params[0], sql };
        }
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.shipments') && q.includes('set packed_at = now()')) {
        packedShipmentUpdate = {
          shipment_id: params[0],
          packed_by: params[1],
          sql,
        };
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.shipments') && q.includes('set shipped_at = now()')) {
        shippedShipmentUpdate = {
          shipment_id: params[0],
          shipped_by: params[1],
          sql,
        };
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.inventory_allocations ia') && q.includes('closed_reason')) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('select sbc.sales_order_line_id::text') && q.includes('sum(sbc.quantity)')) {
        return {
          rows: [
            { sales_order_line_id: LINE_1, shipped_qty: '3.000' },
            { sales_order_line_id: LINE_2, shipped_qty: '2.000' },
          ],
          rowCount: 2,
        };
      }

      if (q.startsWith('update public.sales_order_lines') && q.includes('quantity_allocated = greatest')) {
        soLineAllocationDecrements.push({
          line_id: String(params[0]),
          qty: String(params[1]),
        });
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('select sh.id::text') && q.includes('box_count')) {
        return {
          rows: [
            {
              id: SHIPMENT_ID,
              status: shipmentStatus,
              sales_order_id: SO_ID,
              box_count: boxCount,
            },
          ],
          rowCount: 1,
        };
      }

      // recordPod's status pre-check (ship-actions.ts:330) — a plain
      // `select id::text, status from public.shipments` (no box_count join).
      if (q.startsWith('select id::text, status') && q.includes('from public.shipments')) {
        return { rows: [{ id: SHIPMENT_ID, status: shipmentStatus }], rowCount: 1 };
      }

      if (q.startsWith('select lp.id::text as lp_id')) {
        return { rows: lpRows, rowCount: lpRows.length };
      }

      if (q.startsWith('update public.shipments') && q.includes("set status = 'packed'")) {
        packedShipmentUpdate = {
          shipment_id: params[0],
          packed_by: params[1],
          sql,
        };
        return { rows: [{ id: params[0] }], rowCount: 1 };
      }

      if (q.startsWith('update public.shipments') && q.includes("set status = 'shipped'")) {
        if (!shipmentShipCasSucceeds) {
          return { rows: [], rowCount: 0 };
        }
        shippedShipmentUpdate = {
          shipment_id: params[0],
          shipped_by: params[1],
          sql,
        };
        return { rows: [{ id: params[0] }], rowCount: 1 };
      }

      if (q.startsWith('select lp.lp_number') && q.includes('from public.shipment_box_contents') && q.includes('v_active_holds')) {
        return { rows: blockedLpRows, rowCount: blockedLpRows.length };
      }

      if (q.startsWith('with shipment_lps') && q.includes('update public.license_plates lp')) {
        shippedLpIds = lpRows.map((row) => row.lp_id);
        return {
          rows: lpRows.map((row) => ({
            id: row.lp_id,
            shipped_qty: row.shipped_qty,
            prior_status: row.prior_status,
            prior_reserved_qty: row.prior_reserved_qty,
          })),
          rowCount: lpRows.length,
        };
      }

      if (q.includes('from public.items i') && q.includes('as qty_kg')) {
        return { rows: [{ qty_kg: String(params?.[0] ?? '0'), resolved: true }], rowCount: 1 };
      }
      if (q.includes('with existing as materialized') && q.includes('computed.qty_kg::text as "qtykg"')) {
        const qtyKg = String(params?.[2] ?? '0');
        const avgCost = '5';
        return {
          rows: [{
            qtyKg,
            valueDebited: String(Number(qtyKg) * Number(avgCost)),
            avgCostUsed: avgCost,
            totalQtyKg: '0',
            totalValue: '0',
            clamped: false,
          }],
          rowCount: 1,
        };
      }
      if (q.startsWith('select coalesce((') && q.includes('avg_cost')) {
        return { rows: [{ avg_cost: '5' }], rowCount: 1 };
      }
      if (q.startsWith('select ($1::numeric * $2::numeric)::text as value')) {
        const left = Number(params?.[0] ?? 0);
        const right = Number(params?.[1] ?? 0);
        return { rows: [{ value: String(left * right) }], rowCount: 1 };
      }
      if (q.includes('insert into public.item_wac_state')) {
        return { rows: [{ totalQtyKg: '0', totalValue: '0', clamped: false }], rowCount: 1 };
      }

      if (q.startsWith('update public.shipments') && q.includes('ext_data = coalesce') && q.includes("and status = 'shipped'")) {
        const parsed = JSON.parse(params[1] as string) as {
          shipped_license_plates: Array<Record<string, unknown>>;
          wac_debits?: Array<Record<string, unknown>>;
        };
        shippedLpSnapshot = parsed.shipped_license_plates;
        shippedExtData = parsed;
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('insert into public.outbox_events')) {
        outboxEvents.push({
          aggregateId: params[0] as string,
          eventType: q.includes("'warehouse.lp.shipped'") ? 'warehouse.lp.shipped' : '',
          aggregateType: q.includes("'license_plate'") ? 'license_plate' : '',
          payload: JSON.parse(params[1] as string) as Record<string, unknown>,
          sql,
        });
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.shipments') && q.includes('set delivered_at = now()')) {
        podUpdate = {
          shipment_id: params[0],
          bol_signed_pdf_url: params[1],
          updated_by: params[2],
          sql,
        };
        return { rows: [{ id: params[0], sales_order_id: SO_ID }], rowCount: 1 };
      }

      if (q.startsWith('select count(*)::int as remaining_count') && q.includes("status not in ('delivered', 'cancelled')")) {
        return { rows: [{ remaining_count: remainingShipmentCount }], rowCount: 1 };
      }

      if (q.startsWith('update public.sales_orders')) {
        salesOrderStatus = String(params[1]);
        salesOrderUpdate = {
          sales_order_id: params[0],
          status: params[1],
          updated_by: params[2],
          sql,
        };
        return { rows: [{ id: params[0] }], rowCount: 1 };
      }

      if (q.startsWith('select count(*)::int as remaining_count') && q.includes("status not in ('shipped', 'cancelled')")) {
        return { rows: [{ remaining_count: remainingShipmentCount }], rowCount: 1 };
      }

      if (q.startsWith('update public.shipments') && q.includes('bol_pdf_url')) {
        bolUpdate = {
          shipment_id: params[0],
          carrier: params[1],
          service_level: params[2],
          tracking_number: params[3],
          bol_pdf_url: params[4],
          ext_data: JSON.parse(params[5] as string) as Record<string, unknown>,
          updated_by: params[6],
        };
        return { rows: [{ id: params[0] }], rowCount: 1 };
      }

      if (q.startsWith('update public.shipments') && q.includes('delivered_at') && !q.includes('set delivered_at = now()')) {
        return { rows: [], rowCount: 0 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(FIXED_NOW));
  grantedPermissions = new Set(['ship.pack.close', 'ship.ship.confirm', 'ship.bol.sign']);
  shipmentStatus = 'packed';
  shipmentTransitionSucceeds = true;
  salesOrderStatus = 'manifested';
  boxCount = 1;
  lpRows = [
    {
      lp_id: LP_1,
      lp_number: 'LP-0001',
      product_id: PRODUCT_ID,
      uom: 'kg',
      shipped_qty: '3.000',
      prior_status: 'available',
      prior_reserved_qty: '3.000',
    },
    {
      lp_id: LP_2,
      lp_number: 'LP-0002',
      product_id: PRODUCT_ID_2,
      uom: 'kg',
      shipped_qty: '2.000',
      prior_status: 'available',
      prior_reserved_qty: '2.000',
    },
  ];
  blockedLpRows = [];
  packedShipmentUpdate = null;
  shippedShipmentUpdate = null;
  shippedLpIds = [];
  shippedLpSnapshot = [];
  shippedExtData = null;
  salesOrderUpdate = null;
  remainingShipmentCount = 0;
  bolUpdate = null;
  podUpdate = null;
  soLineAllocationDecrements = [];
  outboxEvents = [];
  queryLog = [];
  client = makeClient();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('shipShipment RBAC', () => {
  it('returns forbidden without ship.ship.confirm even when ship.pack.close is granted', async () => {
    grantedPermissions = new Set(['ship.pack.close']);

    const result = await shipShipment(SHIPMENT_ID);

    expect(result).toEqual({ ok: false, error: 'forbidden' });
  });

  it('ships when ship.ship.confirm is granted', async () => {
    grantedPermissions = new Set(['ship.ship.confirm']);

    await expect(shipShipment(SHIPMENT_ID)).resolves.toEqual({ ok: true });
  });
});

describe('sealShipment RBAC', () => {
  it('returns forbidden without ship.pack.close', async () => {
    grantedPermissions = new Set(['ship.ship.confirm']);
    shipmentStatus = 'packing';

    const result = await sealShipment(SHIPMENT_ID);

    expect(result).toEqual({ ok: false, error: 'forbidden' });
  });
});

describe('generateBol RBAC', () => {
  it('returns forbidden without ship.ship.confirm', async () => {
    grantedPermissions = new Set(['ship.pack.close']);

    const result = await generateBol({ shipmentId: SHIPMENT_ID, carrier: 'DHL' });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
  });

  it('generates BOL when ship.ship.confirm is granted', async () => {
    grantedPermissions = new Set(['ship.ship.confirm']);

    const result = await generateBol({ shipmentId: SHIPMENT_ID, carrier: 'DHL' });

    expect(result.ok).toBe(true);
  });
});

describe('shipShipment', () => {
  it('ships a packed shipment, updates every LP, emits one warehouse.lp.shipped event per LP, and marks the SO shipped', async () => {
    const result = await shipShipment(SHIPMENT_ID);

    expect(result).toEqual({ ok: true });
    expect(shippedShipmentUpdate).toMatchObject({
      shipment_id: SHIPMENT_ID,
      shipped_by: USER_ID,
    });
    expect(normalize(String(shippedShipmentUpdate?.sql))).toContain('shipped_at = now()');
    expect(shippedLpIds).toEqual([LP_1, LP_2]);
    const lpUpdateSql = queryLog.find(({ sql }) => normalize(sql).includes('update public.license_plates lp'))?.sql;
    expect(normalize(String(lpUpdateSql))).toContain('quantity = lp.quantity - shipment_lps.shipped_qty');
    expect(normalize(String(lpUpdateSql))).toContain('reserved_qty = greatest(0, lp.reserved_qty - shipment_lps.shipped_qty)');
    expect(shippedLpSnapshot).toEqual([
      { lp_id: LP_1, shipped_qty: '3.000', prior_status: 'available', prior_reserved_qty: '3.000' },
      { lp_id: LP_2, shipped_qty: '2.000', prior_status: 'available', prior_reserved_qty: '2.000' },
    ]);
    expect(queryLog.filter(({ sql }) => normalize(sql).includes('insert into public.item_wac_state'))).toHaveLength(2);
    expect(shippedExtData?.wac_debits).toEqual([
      { lp_id: LP_1, item_id: PRODUCT_ID, qty_kg: '3.000', wac_value: '15' },
      { lp_id: LP_2, item_id: PRODUCT_ID_2, qty_kg: '2.000', wac_value: '10' },
    ]);
    expect(outboxEvents).toHaveLength(2);
    expect(outboxEvents.map((event) => event.eventType)).toEqual(['warehouse.lp.shipped', 'warehouse.lp.shipped']);
    expect(outboxEvents.map((event) => event.aggregateType)).toEqual(['license_plate', 'license_plate']);
    expect(outboxEvents.map((event) => event.aggregateId)).toEqual([LP_1, LP_2]);
    expect(outboxEvents.map((event) => event.payload)).toEqual([
      { lp_id: LP_1, shipment_id: SHIPMENT_ID, so_id: SO_ID, org_id: ORG_ID },
      { lp_id: LP_2, shipment_id: SHIPMENT_ID, so_id: SO_ID, org_id: ORG_ID },
    ]);
    expect(salesOrderUpdate).toMatchObject({
      sales_order_id: SO_ID,
      status: 'shipped',
      updated_by: USER_ID,
    });
    expect(soLineAllocationDecrements).toEqual([
      { line_id: LINE_1, qty: '3.000' },
      { line_id: LINE_2, qty: '2.000' },
    ]);
  });

  it('returns lp_blocked_for_ship and does not update LPs when a shipment LP is blocked', async () => {
    blockedLpRows = [{ lp_number: 'LP-0001', reason: 'hold' }];

    const result = await shipShipment(SHIPMENT_ID);

    expect(result).toEqual({ ok: false, error: 'lp_blocked_for_ship' });
    expect(queryLog.some(({ sql }) => normalize(sql).includes('v_active_holds'))).toBe(true);
    expect(queryLog.some(({ sql }) => normalize(sql).includes('update public.license_plates lp'))).toBe(false);
    expect(shippedLpIds).toEqual([]);
    expect(outboxEvents).toEqual([]);
    expect(salesOrderUpdate).toBeNull();
  });

  it('ships successfully when the food-safety LP guard returns no blocked rows', async () => {
    blockedLpRows = [];

    const result = await shipShipment(SHIPMENT_ID);

    expect(result).toEqual({ ok: true });
    expect(queryLog.some(({ sql }) => normalize(sql).includes('v_active_holds'))).toBe(true);
    expect(shippedLpIds).toEqual([LP_1, LP_2]);
    expect(salesOrderUpdate).toMatchObject({
      sales_order_id: SO_ID,
      status: 'shipped',
      updated_by: USER_ID,
    });
  });

  it('returns invalid_state for an empty shipment with no boxes', async () => {
    boxCount = 0;
    lpRows = [];

    const result = await shipShipment(SHIPMENT_ID);

    expect(result).toEqual({ ok: false, error: 'invalid_state' });
    expect(shippedShipmentUpdate).toBeNull();
    expect(shippedLpIds).toEqual([]);
    expect(outboxEvents).toEqual([]);
    expect(salesOrderUpdate).toBeNull();
  });

  it('does not mark the SO shipped while another shipment remains open', async () => {
    remainingShipmentCount = 1;

    const result = await shipShipment(SHIPMENT_ID);

    expect(result).toEqual({ ok: true });
    expect(shippedShipmentUpdate).toMatchObject({ shipment_id: SHIPMENT_ID });
    expect(salesOrderUpdate).toBeNull();
  });

  it('double-ship is rejected and LP is decremented exactly once', async () => {
    await expect(shipShipment(SHIPMENT_ID)).resolves.toEqual({ ok: true });

    shipmentTransitionSucceeds = false;
    shipmentStatus = 'packed';

    await expect(shipShipment(SHIPMENT_ID)).resolves.toEqual({ ok: false, error: 'persistence_failed' });
    expect(queryLog.filter(({ sql }) => normalize(sql).includes('update public.license_plates lp'))).toHaveLength(1);
  });
});

describe('sealShipment', () => {
  it('transitions a packing shipment with at least one box to packed', async () => {
    shipmentStatus = 'packing';
    boxCount = 1;

    const result = await sealShipment(SHIPMENT_ID);

    expect(result).toEqual({ ok: true });
    expect(packedShipmentUpdate).toMatchObject({
      shipment_id: SHIPMENT_ID,
      packed_by: USER_ID,
    });
    expect(normalize(String(packedShipmentUpdate?.sql))).toContain('packed_at = now()');
    expect(normalize(String(packedShipmentUpdate?.sql))).toContain('packed_by = $2::uuid');
  });

  it("returns invalid_state when the shipment is not in 'packing'", async () => {
    shipmentStatus = 'packed';
    boxCount = 1;

    const result = await sealShipment(SHIPMENT_ID);

    expect(result).toEqual({ ok: false, error: 'invalid_state' });
    expect(packedShipmentUpdate).toBeNull();
  });

  it('returns no_boxes when the packing shipment has no boxes', async () => {
    shipmentStatus = 'packing';
    boxCount = 0;

    const result = await sealShipment(SHIPMENT_ID);

    expect(result).toEqual({ ok: false, error: 'no_boxes' });
    expect(packedShipmentUpdate).toBeNull();
  });
});

describe('generateBol', () => {
  it('stores the BOL JSON text and SHA-256 hash in shipment ext_data', async () => {
    const result = await generateBol({
      shipmentId: SHIPMENT_ID,
      carrier: 'DHL',
      serviceLevel: 'next_day',
      trackingNumber: 'TRACK-123',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const storedBol = JSON.parse(String(bolUpdate?.bol_pdf_url)) as Record<string, unknown>;
    const expectedHash = createHash('sha256').update(String(bolUpdate?.bol_pdf_url)).digest('hex');
    expect(result.bolRef).toBe(expectedHash);
    expect(bolUpdate).toMatchObject({
      shipment_id: SHIPMENT_ID,
      carrier: 'DHL',
      service_level: 'next_day',
      tracking_number: 'TRACK-123',
      ext_data: { bol_sha256: expectedHash },
      updated_by: USER_ID,
    });
    expect(storedBol).toEqual({
      shipmentId: SHIPMENT_ID,
      orgId: ORG_ID,
      carrier: 'DHL',
      serviceLevel: 'next_day',
      trackingNumber: 'TRACK-123',
      generatedAt: FIXED_NOW,
      licensePlates: [
        { lpId: LP_1, lpNumber: 'LP-0001' },
        { lpId: LP_2, lpNumber: 'LP-0002' },
      ],
    });
    expect(String(bolUpdate?.bol_pdf_url)).not.toMatch(/^data:/);
  });

  it('rejects BOL generation for cancelled shipments', async () => {
    shipmentStatus = 'cancelled';

    const result = await generateBol({ shipmentId: SHIPMENT_ID, carrier: 'DHL' });

    expect(result).toEqual({ ok: false, error: 'invalid_state' });
    expect(bolUpdate).toBeNull();
  });

  it('rejects BOL generation when the shipment has no boxes', async () => {
    shipmentStatus = 'packed';
    boxCount = 0;

    const result = await generateBol({ shipmentId: SHIPMENT_ID, carrier: 'DHL' });

    expect(result).toEqual({ ok: false, error: 'no_boxes' });
    expect(bolUpdate).toBeNull();
  });
});

describe('recordPod', () => {
  it('sets delivered_at and stores the signed BOL URL', async () => {
    // recordPod now requires the shipment to be 'shipped' (proof-of-delivery
    // follows dispatch); the prior default 'packed' is rejected by the new guard.
    shipmentStatus = 'shipped';
    salesOrderStatus = 'shipped';
    remainingShipmentCount = 0;
    const result = await recordPod({
      shipmentId: SHIPMENT_ID,
      signedPdfUrl: 'https://storage.example/pod.pdf',
    });

    expect(result).toEqual({ ok: true });
    expect(podUpdate).toMatchObject({
      shipment_id: SHIPMENT_ID,
      bol_signed_pdf_url: 'https://storage.example/pod.pdf',
      updated_by: USER_ID,
    });
    expect(normalize(String(podUpdate?.sql))).toContain('delivered_at = now()');
  });

  it('marks the SO delivered when no non-cancelled shipments remain undelivered', async () => {
    shipmentStatus = 'shipped';
    salesOrderStatus = 'partially_delivered';
    remainingShipmentCount = 0;

    const result = await recordPod({ shipmentId: SHIPMENT_ID });

    expect(result).toEqual({ ok: true });
    expect(salesOrderUpdate).toMatchObject({
      sales_order_id: SO_ID,
      status: 'delivered',
    });
    expect(
      queryLog.some(({ sql }) =>
        normalize(sql).includes("status not in ('delivered', 'cancelled')"),
      ),
    ).toBe(true);
  });

  it('marks the SO partially_delivered when a cancelled sibling would have trapped the count', async () => {
    shipmentStatus = 'shipped';
    salesOrderStatus = 'shipped';
    // Only this shipment remains undelivered; cancelled siblings must not inflate the count.
    remainingShipmentCount = 1;

    const result = await recordPod({ shipmentId: SHIPMENT_ID });

    expect(result).toEqual({ ok: true });
    expect(salesOrderUpdate).toMatchObject({
      sales_order_id: SO_ID,
      status: 'partially_delivered',
    });
  });
});

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
const FIXED_NOW = '2026-06-23T12:34:56.000Z';

let client: QueryClient;
let allowPermission = true;
let shipmentStatus = 'packed';
let boxCount = 1;
let lpRows: Array<{ lp_id: string; lp_number: string | null }> = [];
let packedShipmentUpdate: Record<string, unknown> | null = null;
let shippedShipmentUpdate: Record<string, unknown> | null = null;
let shippedLpIds: string[] = [];
let salesOrderUpdate: Record<string, unknown> | null = null;
let bolUpdate: Record<string, unknown> | null = null;
let podUpdate: Record<string, unknown> | null = null;
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
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
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

      if (q.startsWith('select distinct lp.id::text as lp_id')) {
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
        shippedShipmentUpdate = {
          shipment_id: params[0],
          shipped_by: params[1],
          sql,
        };
        return { rows: [{ id: params[0] }], rowCount: 1 };
      }

      if (q.startsWith('update public.license_plates')) {
        shippedLpIds = [...((params[0] as string[]) ?? [])];
        return { rows: shippedLpIds.map((id) => ({ id })), rowCount: shippedLpIds.length };
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

      if (q.startsWith('update public.sales_orders')) {
        salesOrderUpdate = {
          sales_order_id: params[0],
          status: params[1],
          updated_by: params[2],
          sql,
        };
        return { rows: [{ id: params[0] }], rowCount: 1 };
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

      if (q.startsWith('update public.shipments') && q.includes('delivered_at')) {
        podUpdate = {
          shipment_id: params[0],
          bol_signed_pdf_url: params[1],
          updated_by: params[2],
          sql,
        };
        return { rows: [{ id: params[0] }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(FIXED_NOW));
  allowPermission = true;
  shipmentStatus = 'packed';
  boxCount = 1;
  lpRows = [
    { lp_id: LP_1, lp_number: 'LP-0001' },
    { lp_id: LP_2, lp_number: 'LP-0002' },
  ];
  packedShipmentUpdate = null;
  shippedShipmentUpdate = null;
  shippedLpIds = [];
  salesOrderUpdate = null;
  bolUpdate = null;
  podUpdate = null;
  outboxEvents = [];
  queryLog = [];
  client = makeClient();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('shipShipment', () => {
  it('ships a packed shipment, updates every LP, emits one warehouse.lp.shipped event per LP, and marks the SO shipped', async () => {
    const result = await shipShipment(SHIPMENT_ID);

    expect(result).toEqual({ ok: true });
    expect(shippedShipmentUpdate).toMatchObject({
      shipment_id: SHIPMENT_ID,
      shipped_by: USER_ID,
    });
    expect(normalize(String(shippedShipmentUpdate?.sql))).toContain("status = 'shipped'");
    expect(normalize(String(shippedShipmentUpdate?.sql))).toContain('shipped_at = now()');
    expect(shippedLpIds).toEqual([LP_1, LP_2]);
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
    expect(normalize(String(packedShipmentUpdate?.sql))).toContain("status = 'packed'");
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
});

describe('recordPod', () => {
  it('sets delivered_at and stores the signed BOL URL', async () => {
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
});

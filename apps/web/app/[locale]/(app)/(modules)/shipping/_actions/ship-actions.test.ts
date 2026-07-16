import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateBol, recordPod, sealShipment, shipShipment } from './ship-actions';

const SIGNATURE_ID = 'sig-record-pod-001';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`).join(',')}}`;
}

function hashESignSubject(subject: unknown): string {
  return createHash('sha256').update(canonicalJson(subject), 'utf8').digest('hex');
}

const signEventMock = vi.fn(async (input: { intent?: string; subject?: unknown }) => {
  if (input.intent === 'ship.bol.sign' && input.subject) {
    const persisted = JSON.parse(JSON.stringify(input.subject)) as Record<string, unknown>;
    signedBolSubjectHashes.add(hashESignSubject(persisted));
  }
  return { signatureId: SIGNATURE_ID };
});

vi.mock('@monopilot/e-sign', () => ({
  hashESignSubject: (subject: unknown) => hashESignSubject(subject),
  signEvent: (...args: unknown[]) => signEventMock(...args),
}));

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
const BOL_REASON = 'BOL attestation';
const BOL_PASSWORD = 'pin-test';

function defaultBolPayload(overrides: Record<string, unknown> = {}) {
  return {
    shipmentId: SHIPMENT_ID,
    orgId: ORG_ID,
    carrier: 'DHL',
    serviceLevel: null,
    trackingNumber: null,
    generatedAt: FIXED_NOW,
    licensePlates: [
      { lpId: LP_1, lpNumber: 'LP-0001' },
      { lpId: LP_2, lpNumber: 'LP-0002' },
    ],
    ...overrides,
  };
}

function defaultGenerateBolInput(overrides: Record<string, unknown> = {}) {
  return {
    shipmentId: SHIPMENT_ID,
    carrier: 'DHL',
    reason: BOL_REASON,
    signature: { password: BOL_PASSWORD },
    ...overrides,
  };
}

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
let podAuditEvent: Record<string, unknown> | null = null;
let bolAuditEvent: Record<string, unknown> | null = null;
let shipmentCarrier: string | null = null;
let shipmentServiceLevel: string | null = null;
let shipmentTrackingNumber: string | null = null;
let bolPayload: Record<string, unknown> | null = null;
let signedBolSubjectHashes = new Set<string>();
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
              carrier: shipmentCarrier,
              service_level: shipmentServiceLevel,
              tracking_number: shipmentTrackingNumber,
              sales_order_id: SO_ID,
              box_count: boxCount,
              bol_payload: bolPayload,
            },
          ],
          rowCount: 1,
        };
      }

      if (q.includes('from public.e_sign_log') && q.includes('subject_hash')) {
        const intent = String(params?.[0] ?? '');
        const subjectHash = String(params?.[1] ?? '');
        const ok = intent === 'ship.bol.sign' && signedBolSubjectHashes.has(subjectHash);
        return { rows: ok ? [{ ok: true }] : [], rowCount: ok ? 1 : 0 };
      }

      if (q.startsWith('insert into public.audit_events') && q.includes('shipping.bol.carrier_updated')) {
        bolAuditEvent = {
          action: 'shipping.bol.carrier_updated',
          resource_id: params[1],
          before_state: JSON.parse(String(params[2])),
          after_state: JSON.parse(String(params[3])),
        };
        return { rows: [{ id: 42 }], rowCount: 1 };
      }

      // recordPod's status pre-check — select id/status/(sales_order_id)/bol_signed_pdf_url.
      if (q.startsWith('select id::text') && q.includes('from public.shipments') && q.includes('bol_signed_pdf_url')) {
        return {
          rows: [
            {
              id: SHIPMENT_ID,
              status: shipmentStatus,
              sales_order_id: SO_ID,
              bol_signed_pdf_url: null,
            },
          ],
          rowCount: 1,
        };
      }

      // recordPod's legacy status pre-check (other shipment selects).
      if (q.startsWith('select id::text, status') && q.includes('from public.shipments')) {
        return { rows: [{ id: SHIPMENT_ID, status: shipmentStatus }], rowCount: 1 };
      }

      if (q.startsWith('insert into public.audit_events') && q.includes('shipping.pod.recorded')) {
        podAuditEvent = {
          action: 'shipping.pod.recorded',
          resource_id: params[1],
          before_state: JSON.parse(params[2] as string) as Record<string, unknown>,
          after_state: JSON.parse(params[3] as string) as Record<string, unknown>,
        };
        return { rows: [{ id: 42 }], rowCount: 1 };
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
        if (!shipmentTransitionSucceeds) {
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
      if (q.includes('with existing as materialized') && q.includes('avg_cost_used')) {
        const qtyKg = String(params?.[2] ?? '0');
        const avgCost = '5';
        return {
          rows: [{ avg_cost_used: avgCost, value_debited: String(Number(qtyKg) * Number(avgCost)) }],
          rowCount: 1,
        };
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

      if (q.startsWith('update public.shipments') && q.includes('bol_payload')) {
        const expectedStatus = String(params[7] ?? '');
        if (expectedStatus && expectedStatus !== shipmentStatus) {
          return { rows: [], rowCount: 0 };
        }
        bolUpdate = {
          shipment_id: params[0],
          carrier: params[1],
          service_level: params[2],
          tracking_number: params[3],
          bol_payload: params[4],
          ext_data: JSON.parse(params[5] as string) as Record<string, unknown>,
          updated_by: params[6],
          locked_status: params[7],
        };
        bolPayload = JSON.parse(String(params[4])) as Record<string, unknown>;
        shipmentCarrier = params[1] == null ? null : String(params[1]);
        shipmentServiceLevel = params[2] == null ? null : String(params[2]);
        shipmentTrackingNumber = params[3] == null ? null : String(params[3]);
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
  podAuditEvent = null;
  bolAuditEvent = null;
  shipmentCarrier = null;
  shipmentServiceLevel = null;
  shipmentTrackingNumber = null;
  bolPayload = defaultBolPayload();
  signedBolSubjectHashes = new Set([hashESignSubject(bolPayload)]);
  signEventMock.mockReset();
  signEventMock.mockImplementation(async (input: { intent?: string; subject?: unknown }) => {
    if (input.intent === 'ship.bol.sign' && input.subject) {
      const persisted = JSON.parse(JSON.stringify(input.subject)) as Record<string, unknown>;
      signedBolSubjectHashes.add(hashESignSubject(persisted));
    }
    return { signatureId: SIGNATURE_ID };
  });
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

describe('shipShipment BOL signature guard', () => {
  it('rejects ship when no signed BOL exists for the current payload', async () => {
    bolPayload = null;
    signedBolSubjectHashes.clear();

    const result = await shipShipment(SHIPMENT_ID);

    expect(result).toEqual({ ok: false, error: 'bol_not_signed' });
    expect(shippedShipmentUpdate).toBeNull();
  });

  it('rejects ship after BOL regeneration until the new payload is re-signed', async () => {
    const oldPayload = defaultBolPayload({ carrier: 'Old Carrier' });
    bolPayload = oldPayload;
    signedBolSubjectHashes = new Set([hashESignSubject(oldPayload)]);

    const regenerated = defaultBolPayload({ carrier: 'New Carrier', generatedAt: '2026-06-23T13:00:00.000Z' });
    bolPayload = regenerated;
    signedBolSubjectHashes.clear();

    const result = await shipShipment(SHIPMENT_ID);

    expect(result).toEqual({ ok: false, error: 'bol_not_signed' });
  });

  it('ships after generateBol signs the current payload', async () => {
    bolPayload = null;
    signedBolSubjectHashes.clear();

    const generated = await generateBol(defaultGenerateBolInput({ carrier: 'Signed Carrier' }));
    expect(generated).toEqual({ ok: true, bolRef: expect.any(String) });
    expect(signEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'ship.bol.sign',
        reason: BOL_REASON,
        subject: expect.objectContaining({ carrier: 'Signed Carrier' }),
      }),
      expect.any(Object),
    );

    const result = await shipShipment(SHIPMENT_ID);
    expect(result).toEqual({ ok: true });
  });
});

describe('generateBol RBAC', () => {
  it('returns forbidden without ship.ship.confirm', async () => {
    grantedPermissions = new Set(['ship.pack.close', 'ship.bol.sign']);

    const result = await generateBol(defaultGenerateBolInput());

    expect(result).toEqual({ ok: false, error: 'forbidden' });
  });

  it('returns forbidden without ship.bol.sign', async () => {
    grantedPermissions = new Set(['ship.ship.confirm']);

    const result = await generateBol(defaultGenerateBolInput());

    expect(result).toEqual({ ok: false, error: 'forbidden' });
  });

  it('generates BOL when ship.ship.confirm and ship.bol.sign are granted', async () => {
    grantedPermissions = new Set(['ship.ship.confirm', 'ship.bol.sign']);

    const result = await generateBol(defaultGenerateBolInput());

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

  it('scopes allocation release to the packed SO line on a shared LP', async () => {
    await shipShipment(SHIPMENT_ID);

    const allocationRelease = queryLog.find(
      ({ sql }) =>
        normalize(sql).startsWith('update public.inventory_allocations ia') &&
        normalize(sql).includes('closed_reason'),
    );
    expect(allocationRelease?.sql).toContain('ia.sales_order_line_id = sbc.sales_order_line_id');
    expect(allocationRelease?.sql).toContain('sol.sales_order_id = sh.sales_order_id');
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

  it('ships when the sales order is still picked (packed shipment without an SO packed transition)', async () => {
    salesOrderStatus = 'picked';

    const result = await shipShipment(SHIPMENT_ID);

    expect(result).toEqual({ ok: true });
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
  it('stores the BOL payload in bol_payload and SHA-256 hash in shipment ext_data', async () => {
    const result = await generateBol(
      defaultGenerateBolInput({
        serviceLevel: 'next_day',
        trackingNumber: 'TRACK-123',
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const storedBol = JSON.parse(String(bolUpdate?.bol_payload)) as Record<string, unknown>;
    const expectedHash = createHash('sha256').update(String(bolUpdate?.bol_payload)).digest('hex');
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
    expect(signEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'ship.bol.sign',
        reason: BOL_REASON,
      }),
      expect.any(Object),
    );
    expect(bolUpdate?.bol_pdf_url).toBeUndefined();
  });

  it('returns invalid_input without e-sign credentials', async () => {
    const result = await generateBol({ shipmentId: SHIPMENT_ID, carrier: 'DHL' });
    expect(result).toEqual({ ok: false, error: 'invalid_input' });
  });

  it('requires ship.bol.sign and audits carrier changes on shipped shipments', async () => {
    shipmentStatus = 'shipped';
    shipmentCarrier = 'Old Carrier';
    shipmentTrackingNumber = 'OLD-1';
    grantedPermissions = new Set(['ship.ship.confirm']);

    const forbidden = await generateBol(
      defaultGenerateBolInput({ carrier: 'New Carrier', trackingNumber: 'NEW-1' }),
    );
    expect(forbidden).toEqual({ ok: false, error: 'forbidden' });
    expect(bolUpdate).toBeNull();
    expect(bolAuditEvent).toBeNull();

    grantedPermissions = new Set(['ship.ship.confirm', 'ship.bol.sign']);
    const result = await generateBol(
      defaultGenerateBolInput({ carrier: 'New Carrier', trackingNumber: 'NEW-1' }),
    );
    expect(result.ok).toBe(true);
    expect(bolAuditEvent).toMatchObject({
      action: 'shipping.bol.carrier_updated',
      before_state: {
        carrier: 'Old Carrier',
        service_level: null,
        tracking_number: 'OLD-1',
      },
      after_state: {
        carrier: 'New Carrier',
        service_level: null,
        tracking_number: 'NEW-1',
      },
    });
  });

  it('rejects BOL generation for cancelled shipments', async () => {
    shipmentStatus = 'cancelled';

    const result = await generateBol(defaultGenerateBolInput());

    expect(result).toEqual({ ok: false, error: 'invalid_state' });
    expect(bolUpdate).toBeNull();
  });

  it('rejects BOL generation when the shipment has no boxes', async () => {
    shipmentStatus = 'packed';
    boxCount = 0;

    const result = await generateBol(defaultGenerateBolInput());

    expect(result).toEqual({ ok: false, error: 'no_boxes' });
    expect(bolUpdate).toBeNull();
  });

  it('locks the shipment with FOR UPDATE before mutating BOL fields (N-68)', async () => {
    await generateBol(defaultGenerateBolInput());

    const lockQuery = queryLog.find(
      ({ sql }) => normalize(sql).includes('from public.shipments') && normalize(sql).includes('for update of sh'),
    );
    const updateQuery = queryLog.find(({ sql }) => normalize(sql).includes('bol_payload'));
    expect(lockQuery).toBeDefined();
    expect(updateQuery?.sql).toContain("and status = $8::text");
    expect(bolUpdate?.locked_status).toBe('packed');
  });

  it('returns not_found when the locked status no longer matches at update time', async () => {
    shipmentStatus = 'packed';
    const originalQuery = client.query.bind(client);
    client.query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);
      if (q.startsWith('update public.shipments') && q.includes('bol_payload')) {
        return { rows: [], rowCount: 0 };
      }
      return originalQuery(sql, params);
    }) as typeof client.query;

    const result = await generateBol(defaultGenerateBolInput());
    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(bolAuditEvent).toBeNull();
  });
});

describe('recordPod', () => {
  const validInput = {
    shipmentId: SHIPMENT_ID,
    signedPdfUrl: 'https://storage.example/pod.pdf',
    reason: 'Carrier confirmed delivery with signed BOL.',
    signature: { password: '1234' },
  };

  it('rejects delivery when the POD artifact URL is missing or invalid', async () => {
    shipmentStatus = 'shipped';

    await expect(recordPod({ ...validInput, signedPdfUrl: '' })).resolves.toEqual({
      ok: false,
      error: 'invalid_input',
    });
    await expect(recordPod({ ...validInput, signedPdfUrl: 'not-a-url' })).resolves.toEqual({
      ok: false,
      error: 'invalid_input',
    });
    expect(signEventMock).not.toHaveBeenCalled();
    expect(podUpdate).toBeNull();
  });

  it('rejects delivery without a valid e-sign PIN', async () => {
    shipmentStatus = 'shipped';
    signEventMock.mockRejectedValueOnce(new Error('bad pin'));

    const result = await recordPod(validInput);

    expect(result).toEqual({ ok: false, error: 'esign_failed' });
    expect(signEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'record_pod',
        reason: validInput.reason,
        subject: expect.objectContaining({
          shipment_id: SHIPMENT_ID,
          signed_pdf_url: validInput.signedPdfUrl,
        }),
      }),
      expect.any(Object),
    );
    expect(podUpdate).toBeNull();
    expect(podAuditEvent).toBeNull();
  });

  it('records delivered with proof URL, e-sign, and an operational audit event', async () => {
    shipmentStatus = 'shipped';
    salesOrderStatus = 'shipped';
    remainingShipmentCount = 0;

    const result = await recordPod(validInput);

    expect(result).toEqual({ ok: true });
    expect(signEventMock).toHaveBeenCalledOnce();
    expect(podUpdate).toMatchObject({
      shipment_id: SHIPMENT_ID,
      bol_signed_pdf_url: 'https://storage.example/pod.pdf',
      updated_by: USER_ID,
    });
    expect(normalize(String(podUpdate?.sql))).toContain('delivered_at = now()');
    expect(podAuditEvent).toMatchObject({
      action: 'shipping.pod.recorded',
      resource_id: SHIPMENT_ID,
      before_state: { shipment_status: 'shipped' },
      after_state: expect.objectContaining({
        shipment_status: 'delivered',
        bol_signed_pdf_url: validInput.signedPdfUrl,
        signature_id: SIGNATURE_ID,
        reason: validInput.reason,
      }),
    });
  });

  it('marks the SO delivered when no non-cancelled shipments remain undelivered', async () => {
    shipmentStatus = 'shipped';
    salesOrderStatus = 'partially_delivered';
    remainingShipmentCount = 0;

    const result = await recordPod(validInput);

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
    remainingShipmentCount = 1;

    const result = await recordPod(validInput);

    expect(result).toEqual({ ok: true });
    expect(salesOrderUpdate).toMatchObject({
      sales_order_id: SO_ID,
      status: 'partially_delivered',
    });
  });
});

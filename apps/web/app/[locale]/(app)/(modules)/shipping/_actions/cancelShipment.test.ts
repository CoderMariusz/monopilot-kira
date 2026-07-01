import { beforeEach, describe, expect, it, vi } from 'vitest';

import { signEvent } from '@monopilot/e-sign';
import { cancelShipment, unpackShipment, voidPod } from './cancelShipment';
import { shipShipment } from './ship-actions';

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
const LP_ID = '55555555-5555-4555-8555-555555555555';
const ALLOCATION_ID = '66666666-6666-4666-8666-666666666666';
const SITE_ID = '77777777-7777-4777-8777-777777777777';
const SIGNATURE_ID = 'sig-123';

type ShipmentState = {
  id: string;
  status: string;
  sales_order_id: string | null;
  sales_order_status: string | null;
  shipment_number: string | null;
  delivered_at: string | null;
  bol_signed_pdf_url: string | null;
};

let client: QueryClient;
let permissions: Set<string>;
let shipment: ShipmentState;
let lpStatus = 'shipped';
let lpQuantity = '4.000';
let lpReservedQty = '0.000';
let lpShipSnapshot: Array<Record<string, unknown>> = [];
let allocations: Array<{ id: string; lp_id: string; qty: string; status: string }>;
let recomputeAllocationCount = 0;
let financialRows: Array<{ table_name: string; has_shipment_id: boolean; has_sales_order_id: boolean; has_so_id: boolean }>;
let financialCount = '0';
let auditId = 9001;
let queryLog: Array<{ sql: string; params: readonly unknown[] }> = [];
let releasedAllocations: string[] = [];
let reservedQtyUpdates: Array<{ lpId: unknown; qty: unknown }> = [];
let lpRestoreUpdates: Array<{ lpId: unknown; shippedQty: unknown; reservedQty: unknown; toStatus: unknown }> = [];
let lpTransitions: Array<{ fromStatus: unknown; toStatus: unknown }> = [];
let shipmentStatusUpdates: string[] = [];
let salesOrderStatusUpdates: string[] = [];
let boxesVoided = 0;
let boxContentsVoided = 0;

vi.mock('@monopilot/e-sign', () => ({
  signEvent: vi.fn(async () => ({ signatureId: SIGNATURE_ID })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function input() {
  return {
    shipmentId: SHIPMENT_ID,
    reasonCode: 'operator_error',
    note: 'void test',
    signature: { password: '123456', nonce: 'nonce-1' },
  };
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      queryLog.push({ sql, params });
      const q = normalize(sql);

      if (q.includes('from public.user_roles')) {
        const permission = String(params[2]);
        return permissions.has(permission) ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (q.startsWith('select sh.id::text') && q.includes('for update of sh')) {
        return shipment ? { rows: [shipment], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (q.startsWith('select sh.id::text') && q.includes('box_count')) {
        return shipment
          ? {
              rows: [{ id: shipment.id, status: shipment.status, sales_order_id: shipment.sales_order_id, box_count: 1 }],
              rowCount: 1,
            }
          : { rows: [], rowCount: 0 };
      }

      if (q.startsWith('select status from public.sales_orders')) {
        return shipment.sales_order_status ? { rows: [{ status: shipment.sales_order_status }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (q.startsWith('select lp.id::text as lp_id')) {
        return {
          rows: [
            {
              lp_id: LP_ID,
              lp_number: 'LP-1',
              site_id: SITE_ID,
              shipped_qty: '6.000',
              prior_status: 'available',
              from_status: lpStatus,
              reserved_qty: lpReservedQty,
              prior_reserved_qty: '6.000',
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('with shipment_lps') && q.includes('shipment_lp_snapshots')) {
        const snapshot = lpShipSnapshot[0] ?? {
          lp_id: LP_ID,
          shipped_qty: '6.000',
          prior_status: 'available',
          prior_reserved_qty: '6.000',
        };
        return {
          rows: [
            {
              lp_id: LP_ID,
              site_id: SITE_ID,
              from_status: snapshot.prior_status,
              shipped_qty: snapshot.shipped_qty,
              reserved_qty: lpReservedQty,
              prior_reserved_qty: snapshot.prior_reserved_qty,
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('select ia.license_plate_id::text')) {
        const active = allocations.filter((allocation) => allocation.status === 'allocated' || allocation.status === 'picked');
        return { rows: active.map((allocation) => ({ lp_id: allocation.lp_id, qty: allocation.qty })), rowCount: active.length };
      }

      if (q.startsWith('select ia.id::text')) {
        return { rows: allocations, rowCount: allocations.length };
      }

      if (q.startsWith('update public.inventory_allocations')) {
        if (q.includes('from public.sales_order_lines')) {
          releasedAllocations.push(...allocations.filter((allocation) => allocation.status !== 'released').map((allocation) => allocation.id));
          allocations = allocations.map((allocation) =>
            allocation.status === 'allocated' || allocation.status === 'picked' ? { ...allocation, status: 'released' } : allocation,
          );
        } else {
          releasedAllocations.push(String(params[0]));
          allocations = allocations.map((allocation) =>
            allocation.id === params[0] ? { ...allocation, status: 'released' } : allocation,
          );
        }
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.license_plates') && q.includes('reserved_qty = greatest')) {
        reservedQtyUpdates.push({ lpId: params[0], qty: params[1] });
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('with shipment_lps') && q.includes('update public.license_plates lp')) {
        lpQuantity = '4.000';
        lpReservedQty = '0.000';
        lpStatus = 'shipped';
        return {
          rows: [{ id: LP_ID, shipped_qty: '6.000', prior_status: 'available', prior_reserved_qty: '6.000' }],
          rowCount: 1,
        };
      }

      if (q.startsWith('update public.license_plates') && q.includes('quantity = quantity +')) {
        lpRestoreUpdates.push({ lpId: params[0], shippedQty: params[1], reservedQty: lpReservedQty, toStatus: params[2] });
        lpQuantity = '10.000';
        lpStatus = String(params[2]);
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.sales_order_lines') && q.includes('set quantity_allocated = 0')) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('insert into public.lp_state_history')) {
        lpTransitions.push({ fromStatus: params[2], toStatus: params[3] });
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.shipment_box_contents')) {
        boxContentsVoided += 1;
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.shipment_boxes')) {
        boxesVoided += 1;
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.shipments') && q.includes("status = 'cancelled'")) {
        shipmentStatusUpdates.push('cancelled');
        shipment = { ...shipment, status: 'cancelled' };
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.shipments') && q.includes("set status = 'shipped'")) {
        shipmentStatusUpdates.push('shipped');
        shipment = { ...shipment, status: 'shipped' };
        return { rows: [{ id: shipment.id }], rowCount: 1 };
      }

      if (q.startsWith('update public.shipments') && q.includes('ext_data = coalesce') && q.includes("and status = 'shipped'")) {
        lpShipSnapshot = (JSON.parse(params[1] as string) as { shipped_license_plates: Array<Record<string, unknown>> })
          .shipped_license_plates;
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('with remaining_shipments')) {
        return {
          rows: [
            {
              shipment_count: 0,
              packing_count: 0,
              packed_count: 0,
              manifested_count: 0,
              shipped_count: 0,
              delivered_count: 0,
              allocation_count: recomputeAllocationCount,
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('update public.sales_orders')) {
        const nextStatus = q.includes("status = 'shipped'")
          ? 'shipped'
          : q.includes("status = 'confirmed'")
            ? 'confirmed'
            : String(params[1]);
        salesOrderStatusUpdates.push(nextStatus);
        shipment = { ...shipment, sales_order_status: nextStatus };
        return { rows: [{ id: params[0] }], rowCount: 1 };
      }

      if (q.startsWith('insert into public.audit_events')) {
        return { rows: [{ id: auditId }], rowCount: 1 };
      }

      if (q.startsWith('insert into public.outbox_events')) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('select table_name')) {
        return { rows: financialRows, rowCount: financialRows.length };
      }

      if (q.startsWith('select count(*)::text')) {
        return { rows: [{ count: financialCount }], rowCount: 1 };
      }

      if (q.startsWith('update public.shipments') && q.includes("status = 'shipped'")) {
        shipmentStatusUpdates.push('shipped');
        shipment = { ...shipment, status: 'shipped', delivered_at: null, bol_signed_pdf_url: null };
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.shipments') && q.includes("status = 'packing'")) {
        shipmentStatusUpdates.push('packing');
        shipment = { ...shipment, status: 'packing' };
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

beforeEach(() => {
  permissions = new Set(['ship.so.cancel', 'ship.bol.sign', 'ship.pack.close']);
  shipment = {
    id: SHIPMENT_ID,
    status: 'shipped',
    sales_order_id: SO_ID,
    sales_order_status: 'manifested',
    shipment_number: 'SH-1',
    delivered_at: '2026-06-24T10:00:00.000Z',
    bol_signed_pdf_url: 'https://example.test/pod.pdf',
  };
  lpStatus = 'shipped';
  lpQuantity = '4.000';
  lpReservedQty = '0.000';
  lpShipSnapshot = [];
  allocations = [{ id: ALLOCATION_ID, lp_id: LP_ID, qty: '5.000', status: 'allocated' }];
  recomputeAllocationCount = 0;
  financialRows = [];
  financialCount = '0';
  auditId = 9001;
  queryLog = [];
  releasedAllocations = [];
  reservedQtyUpdates = [];
  lpRestoreUpdates = [];
  lpTransitions = [];
  shipmentStatusUpdates = [];
  salesOrderStatusUpdates = [];
  boxesVoided = 0;
  boxContentsVoided = 0;
  client = makeClient();
  vi.mocked(signEvent).mockReset();
  vi.mocked(signEvent).mockResolvedValue({ signatureId: SIGNATURE_ID });
});

describe('cancelShipment', () => {
  it('cancels shipped shipments, deallocates reservations, restores shipped LPs, voids boxes, and recomputes the SO', async () => {
    const result = await cancelShipment(input());

    expect(result).toEqual({ ok: true });
    expect(releasedAllocations).toEqual([ALLOCATION_ID]);
    expect(reservedQtyUpdates).toEqual([{ lpId: LP_ID, qty: '5.000' }]);
    expect(lpRestoreUpdates).toEqual([{ lpId: LP_ID, shippedQty: '6.000', reservedQty: '0.000', toStatus: 'available' }]);
    expect(lpTransitions).toEqual([{ fromStatus: 'shipped', toStatus: 'available' }]);
    expect(boxContentsVoided).toBe(1);
    expect(boxesVoided).toBe(1);
    expect(shipmentStatusUpdates).toContain('cancelled');
    expect(salesOrderStatusUpdates).toEqual(['confirmed', 'confirmed']);
  });

  it('ships by decrementing the LP quantity and cancel restores only that shipped delta once', async () => {
    shipment = { ...shipment, status: 'packed', sales_order_status: 'packed' };
    lpQuantity = '10.000';
    lpReservedQty = '6.000';
    allocations = [{ id: ALLOCATION_ID, lp_id: LP_ID, qty: '6.000', status: 'allocated' }];

    await expect(shipShipment(SHIPMENT_ID)).resolves.toEqual({ ok: true });
    expect(lpQuantity).toBe('4.000');
    expect(lpReservedQty).toBe('0.000');
    expect(lpStatus).toBe('shipped');
    expect(lpShipSnapshot).toEqual([
      { lp_id: LP_ID, shipped_qty: '6.000', prior_status: 'available', prior_reserved_qty: '6.000' },
    ]);

    await expect(cancelShipment(input())).resolves.toEqual({ ok: true });
    expect(lpQuantity).toBe('10.000');
    expect(lpReservedQty).toBe('0.000');
    expect(lpStatus).toBe('available');

    await expect(cancelShipment(input())).resolves.toEqual({ ok: true });
    expect(lpRestoreUpdates).toHaveLength(1);
    expect(lpQuantity).toBe('10.000');
  });

  it("rejects cancellation when the shipment is 'delivered'", async () => {
    shipment = { ...shipment, status: 'delivered', sales_order_status: 'shipped' };

    const result = await cancelShipment(input());

    expect(result).toEqual({ ok: false, error: 'invalid_state' });
    expect(signEvent).not.toHaveBeenCalled();
    expect(shipmentStatusUpdates).toEqual([]);
  });

  it('returns esign_failed without persisting cancellation changes when signing fails', async () => {
    vi.mocked(signEvent).mockRejectedValueOnce(new Error('bad pin'));

    const result = await cancelShipment(input());

    expect(result).toEqual({ ok: false, error: 'esign_failed' });
    expect(releasedAllocations).toEqual([]);
    expect(reservedQtyUpdates).toEqual([]);
    expect(lpRestoreUpdates).toEqual([]);
    expect(shipmentStatusUpdates).toEqual([]);
    expect(salesOrderStatusUpdates).toEqual([]);
  });

  it('is idempotent when re-called for an already cancelled shipment', async () => {
    shipment = { ...shipment, status: 'cancelled' };

    const result = await cancelShipment(input());

    expect(result).toEqual({ ok: true });
    expect(signEvent).not.toHaveBeenCalled();
    expect(queryLog.some(({ sql }) => normalize(sql).startsWith('update public.shipments'))).toBe(false);
  });

  it('rejects a principal with only ship.ship.confirm', async () => {
    permissions = new Set(['ship.ship.confirm']);

    const result = await cancelShipment(input());

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(queryLog.find(({ sql }) => normalize(sql).includes('from public.user_roles'))?.params[2]).toBe('ship.so.cancel');
    expect(signEvent).not.toHaveBeenCalled();
  });
});

describe('voidPod', () => {
  it('voids POD when allowed and blocks when downstream financial records exist', async () => {
    shipment = { ...shipment, status: 'delivered', sales_order_status: 'delivered' };

    await expect(voidPod(input())).resolves.toEqual({ ok: true });
    expect(shipmentStatusUpdates).toContain('shipped');
    expect(salesOrderStatusUpdates).toEqual(['shipped']);

    shipment = { ...shipment, status: 'delivered', sales_order_status: 'delivered' };
    shipmentStatusUpdates = [];
    salesOrderStatusUpdates = [];
    financialRows = [{ table_name: 'invoices', has_shipment_id: true, has_sales_order_id: false, has_so_id: false }];
    financialCount = '1';

    await expect(voidPod(input())).resolves.toEqual({ ok: false, error: 'downstream_financial_record' });
    expect(shipmentStatusUpdates).toEqual([]);
    expect(salesOrderStatusUpdates).toEqual([]);
  });

  it('rejects a principal with only ship.ship.confirm', async () => {
    permissions = new Set(['ship.ship.confirm']);
    shipment = { ...shipment, status: 'delivered', sales_order_status: 'delivered' };

    const result = await voidPod(input());

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(queryLog.find(({ sql }) => normalize(sql).includes('from public.user_roles'))?.params[2]).toBe('ship.bol.sign');
    expect(signEvent).not.toHaveBeenCalled();
  });
});

describe('unpackShipment', () => {
  it('moves packed or manifested shipments back to packing and voids boxes without writing LP picked status', async () => {
    shipment = { ...shipment, status: 'manifested', sales_order_status: 'manifested' };
    lpStatus = 'available';

    const result = await unpackShipment(input());

    expect(result).toEqual({ ok: true });
    expect(boxContentsVoided).toBe(1);
    expect(boxesVoided).toBe(1);
    expect(shipmentStatusUpdates).toContain('packing');
    expect(lpRestoreUpdates).toEqual([]);
    expect(lpTransitions).toEqual([]);
    expect(queryLog.some(({ sql }) => normalize(sql).includes("status = 'picked'"))).toBe(false);
  });
});

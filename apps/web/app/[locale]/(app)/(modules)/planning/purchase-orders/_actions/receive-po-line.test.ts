import { beforeEach, describe, expect, it, vi } from 'vitest';

import { receivePoLineDesktop } from './receive-po-line';
import { getPoForReceive } from '../../../warehouse/_actions/receive-po-line';
import type { DesktopReceiveInput } from './receive-po-line.types';
import type { QueryClient } from '../../_actions/procurement-shared';

const ORG_ID = '00000000-0000-4000-8000-00000000000a';
const USER_ID = '00000000-0000-4000-8000-0000000000aa';
const PO_ID = '00000000-0000-4000-8000-0000000000a1';
const LINE_ID = '00000000-0000-4000-8000-0000000000b1';
const ITEM_ID = '00000000-0000-4000-8000-0000000000c1';
const SUPPLIER_ID = '00000000-0000-4000-8000-0000000000d1';
const WAREHOUSE_ID = '00000000-0000-4000-8000-0000000000e1';
const PO_DEST_WAREHOUSE_ID = '00000000-0000-4000-8000-0000000000e3';
const SITE_ID = '00000000-0000-4000-8000-0000000000e2';
const LOCATION_ID = '00000000-0000-4000-8000-0000000000f1';
const PO_DEST_LOCATION_ID = '00000000-0000-4000-8000-0000000000f3';

const baseInput: DesktopReceiveInput = {
  poLineId: LINE_ID,
  qty: '10.000',
  batchNumber: 'B-1',
  bestBefore: '2026-07-01',
};

let currentClient: MockClient;
let permissionAllowed = true;

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async <T,>(action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<T>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client: currentClient }),
}));

vi.mock('../../../warehouse/_actions/shared', () => ({
  hasWarehousePermission: vi.fn(async () => permissionAllowed),
}));

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

describe('receivePoLineDesktop', () => {
  beforeEach(() => {
    permissionAllowed = true;
    currentClient = makeClient();
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 5, 11));
    vi.spyOn(Math, 'random').mockReturnValue(0.1234);
  });

  it('returns forbidden when the RBAC gate fails', async () => {
    permissionAllowed = false;

    const result = await receivePoLineDesktop(baseInput);

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(currentClient.calls.some((call) => call.sql.includes('from public.purchase_order_lines pol'))).toBe(false);
  });

  it('returns over_receive_cap when qty exceeds 110%', async () => {
    currentClient = makeClient({ orderedQty: '10.000000', receivedQty: '1.000000' });

    const result = await receivePoLineDesktop({ ...baseInput, qty: '10.100' });

    expect(result).toEqual({ ok: false, error: 'over_receive_cap' });
    expect(currentClient.calls.some((call) => call.sql.includes('insert into public.grn_items'))).toBe(false);
  });

  it('fires GRN insert, LP insert, grn_items insert, and rollup on the happy path', async () => {
    currentClient = makeClient({ orderedQty: '10.000000', receivedQty: '0.000000', isReceived: true });

    const result = await receivePoLineDesktop(baseInput);

    expect(result).toMatchObject({
      ok: true,
      grnId: 'grn-1',
      grnNumber: 'GRN-20260611-0001',
      lpId: 'lp-1',
      qty: '10',
      uom: 'kg',
      overReceived: false,
      poStatus: 'received',
      qcInspectionRequired: false,
      inspectionId: null,
    });
    expect(findCall('insert into public.grns')).toBeTruthy();
    expect(findCall('insert into public.license_plates')?.sql).toContain("'received', 'pending'");
    expect(
      findCalls('insert into public.lp_state_history').some((call) => call.sql.includes("'received', 'available'")),
    ).toBe(false);
    expect(findCall('insert into public.grn_items')).toBeTruthy();
    const poUpdate = findCall('update public.purchase_orders');
    expect(poUpdate?.sql).toContain("status in ('sent', 'confirmed', 'partially_received')");
    expect(poUpdate?.params).toEqual([ORG_ID, PO_ID, 'received', USER_ID]);
  });

  it('rolls up a receipt when the PO is still sent', async () => {
    currentClient = makeClient({ orderedQty: '10.000000', receivedQty: '0.000000', isReceived: false });

    const result = await receivePoLineDesktop(baseInput);

    expect(result).toMatchObject({ ok: true, poStatus: 'partially_received' });
    const poUpdate = findCall('update public.purchase_orders');
    expect(poUpdate?.sql).toContain("status in ('sent', 'confirmed', 'partially_received')");
    expect(poUpdate?.params).toEqual([ORG_ID, PO_ID, 'partially_received', USER_ID]);
  });

  it('allows a partial re-receive when the cumulative quantity stays within cap', async () => {
    currentClient = makeClient({ orderedQty: '10.000000', receivedQty: '4.000000', isReceived: true });

    const result = await receivePoLineDesktop({ ...baseInput, qty: '6.000' });

    expect(result).toMatchObject({ ok: true, qty: '6', poStatus: 'received' });
    expect(findCall('insert into public.grns')).toBeTruthy();
    expect(findCall('insert into public.license_plates')).toBeTruthy();
    expect(findCall('insert into public.grn_items')).toBeTruthy();
  });

  it('logs unexpected receive failures before returning the generic error', async () => {
    currentClient = makeClient({ throwOnOpenGrnLookup: true });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await receivePoLineDesktop(baseInput);

    expect(result).toEqual({ ok: false, error: 'error' });
    expect(consoleError).toHaveBeenCalledWith('[warehouse] receivePoLineDesktop failed', expect.any(Error));
    consoleError.mockRestore();
  });

  it('falls back to a deterministic org warehouse when no default warehouse exists', async () => {
    currentClient = makeClient({
      orderedQty: '10.000000',
      receivedQty: '0.000000',
      warehouse: { id: WAREHOUSE_ID, site_id: null, default_location_id: LOCATION_ID },
    });

    const result = await receivePoLineDesktop(baseInput);

    expect(result).toMatchObject({ ok: true, grnId: 'grn-1', lpId: 'lp-1' });
    const warehouseLookup = findCall('from public.warehouses w');
    expect(warehouseLookup?.sql).toContain('order by w.is_default desc');
    expect(warehouseLookup?.sql).not.toContain('and w.is_default = true');
    expect(findCall('insert into public.license_plates')?.params[1]).toBeNull();
    expect(findCall('insert into public.license_plates')?.params[2]).toBe(WAREHOUSE_ID);
  });

  it('uses the PO destination warehouse when no explicit warehouse is supplied', async () => {
    currentClient = makeClient({
      orderedQty: '10.000000',
      receivedQty: '0.000000',
      destinationWarehouseId: PO_DEST_WAREHOUSE_ID,
    });

    const result = await receivePoLineDesktop(baseInput);

    expect(result).toMatchObject({ ok: true, grnId: 'grn-1', lpId: 'lp-1' });
    const destinationLookup = currentClient.calls.find((call) => call.params?.[0] === PO_DEST_WAREHOUSE_ID);
    expect(destinationLookup?.sql).toContain('from public.warehouses w');
    expect(findCall('insert into public.license_plates')?.params[2]).toBe(PO_DEST_WAREHOUSE_ID);
    expect(findCall('insert into public.license_plates')?.params[11]).toBe(PO_DEST_LOCATION_ID);
    expect(findCall('insert into public.grns')?.params).toEqual(
      expect.arrayContaining([PO_DEST_WAREHOUSE_ID, PO_DEST_LOCATION_ID]),
    );
  });

  it('lets an explicit warehouseId override the PO destination warehouse', async () => {
    currentClient = makeClient({
      orderedQty: '10.000000',
      receivedQty: '0.000000',
      destinationWarehouseId: PO_DEST_WAREHOUSE_ID,
    });

    const result = await receivePoLineDesktop({ ...baseInput, warehouseId: WAREHOUSE_ID });

    expect(result).toMatchObject({ ok: true, grnId: 'grn-1', lpId: 'lp-1' });
    const warehouseLookups = findCalls('from public.warehouses w');
    expect(warehouseLookups[0]?.params).toEqual([WAREHOUSE_ID]);
    expect(warehouseLookups.some((call) => call.params?.[0] === PO_DEST_WAREHOUSE_ID)).toBe(false);
    expect(findCall('insert into public.license_plates')?.params[2]).toBe(WAREHOUSE_ID);
    expect(findCall('insert into public.license_plates')?.params[11]).toBe(LOCATION_ID);
  });

  it('falls back to the existing default warehouse order when the PO has no destination warehouse', async () => {
    currentClient = makeClient({
      orderedQty: '10.000000',
      receivedQty: '0.000000',
      destinationWarehouseId: null,
    });

    const result = await receivePoLineDesktop(baseInput);

    expect(result).toMatchObject({ ok: true, grnId: 'grn-1', lpId: 'lp-1' });
    const warehouseLookup = findCall('from public.warehouses w');
    expect(warehouseLookup?.params).toBeUndefined();
    expect(warehouseLookup?.sql).toContain('order by w.is_default desc');
    expect(findCall('insert into public.license_plates')?.params[2]).toBe(WAREHOUSE_ID);
  });

  it('returns no_warehouse when no desktop warehouse can be resolved', async () => {
    currentClient = makeClient({ warehouse: null });

    const result = await receivePoLineDesktop(baseInput);

    expect(result).toEqual({ ok: false, error: 'no_warehouse' });
    expect(currentClient.calls.some((call) => call.sql.includes('insert into public.grns'))).toBe(false);
  });
});

type MockCall = { sql: string; params?: readonly unknown[] };
type MockOptions = {
  orderedQty?: string;
  receivedQty?: string;
  warehouse?: { id: string; site_id: string | null; default_location_id: string | null } | null;
  existingGrn?: { id: string; grn_number: string } | null;
  isReceived?: boolean;
  destinationWarehouseId?: string | null;
  throwOnOpenGrnLookup?: boolean;
};

class MockClient implements QueryClient {
  calls: MockCall[] = [];

  constructor(private readonly options: MockOptions) {}

  async query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }> {
    this.calls.push({ sql, params });
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

    if (normalized.includes('from public.user_roles')) return { rows: [{ ok: true }] as T[], rowCount: 1 };

    if (normalized.includes('from public.purchase_order_lines pol') && normalized.includes('for update of pol, po')) {
      return {
        rows: [
          {
            id: LINE_ID,
            org_id: ORG_ID,
            po_id: PO_ID,
            item_id: ITEM_ID,
            supplier_id: SUPPLIER_ID,
            destination_warehouse_id: this.options.destinationWarehouseId ?? null,
            line_no: 1,
            ordered_qty: this.options.orderedQty ?? '10.000000',
            uom: 'kg',
            received_qty: this.options.receivedQty ?? '0.000000',
            shelf_life_days: null,
            shelf_life_mode: null,
          },
        ] as T[],
      };
    }

    if (normalized.includes('from public.warehouses w')) {
      if (params?.[0] === PO_DEST_WAREHOUSE_ID) {
        return {
          rows: [{ id: PO_DEST_WAREHOUSE_ID, site_id: SITE_ID, default_location_id: PO_DEST_LOCATION_ID }] as T[],
        };
      }
      if (params?.[0] === WAREHOUSE_ID) {
        return { rows: [defaultWarehouse()] as T[] };
      }
      return { rows: (this.options.warehouse === null ? [] : [this.options.warehouse ?? defaultWarehouse()]) as T[] };
    }

    if (normalized.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (normalized.includes('from public.grns') && normalized.includes('status =')) {
      if (this.options.throwOnOpenGrnLookup) throw new Error('grn lookup failed');
      return { rows: (this.options.existingGrn ? [this.options.existingGrn] : []) as T[] };
    }
    if (normalized.includes("substring(grn_number from 'grn-")) return { rows: [{ seq: 1 }] as T[] };
    if (normalized.startsWith('insert into public.grns')) return { rows: [{ id: 'grn-1', grn_number: 'GRN-20260611-0001' }] as T[] };
    if (normalized.startsWith('insert into public.license_plates')) return { rows: [{ id: 'lp-1' }] as T[] };
    if (normalized.includes('max(line_number)')) return { rows: [{ line_number: 1 }] as T[] };
    if (normalized.startsWith('insert into public.grn_items')) return { rows: [{ id: 'grn-item-1' }] as T[] };
    if (normalized.startsWith('insert into public.lp_state_history')) return { rows: [] };
    if (normalized.startsWith('insert into public.outbox_events')) return { rows: [] };
    if (normalized.includes('from public.tenant_variations')) return { rows: [{ require_qc: false }] as T[] };
    if (normalized.includes('bool_and')) return { rows: [{ is_received: this.options.isReceived ?? false }] as T[] };
    if (normalized.startsWith('update public.purchase_orders')) return { rows: [] };
    if (normalized.startsWith('update public.grns')) return { rows: [] };
    if (normalized.startsWith('insert into public.audit_events')) return { rows: [] };

    return { rows: [] };
  }
}

function makeClient(options: MockOptions = {}): MockClient {
  return new MockClient(options);
}

function defaultWarehouse(): { id: string; site_id: string | null; default_location_id: string | null } {
  return { id: WAREHOUSE_ID, site_id: SITE_ID, default_location_id: LOCATION_ID };
}

function findCall(fragment: string): MockCall | undefined {
  return currentClient.calls.find((call) => call.sql.replace(/\s+/g, ' ').trim().toLowerCase().includes(fragment));
}

function findCalls(fragment: string): MockCall[] {
  return currentClient.calls.filter((call) => call.sql.replace(/\s+/g, ' ').trim().toLowerCase().includes(fragment));
}

// ── F3: getPoForReceive site visibility ──────────────────────────────────────

describe('getPoForReceive — site visibility (F3)', () => {
  beforeEach(() => {
    permissionAllowed = true;
  });

  it('includes app.user_can_see_site(po.site_id) in the main open-PO query', async () => {
    currentClient = new MockClient({ orderedQty: '10.000000', receivedQty: '0.000000' });

    await getPoForReceive(PO_ID);

    const poQuery = currentClient.calls.find(
      (call) => call.sql.includes('from public.purchase_orders po') && call.sql.includes('po.status = any'),
    );
    expect(poQuery?.sql).toContain('app.user_can_see_site(po.site_id)');
  });

  it('includes app.user_can_see_site in the closed-PO fallback query', async () => {
    // Make the open-PO query return nothing (no open rows) so the fallback fires.
    currentClient = new MockClient({ orderedQty: '10.000000', receivedQty: '0.000000', existingGrn: null });
    // Override: the mock already returns [] for purchase_order_lines FOR UPDATE path,
    // but we need the getPoForReceive path (which queries purchase_orders with status filter).
    // We use a spy-based client so we can inspect both SQL calls.
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    currentClient = {
      calls,
      query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
        calls.push({ sql, params });
        const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();
        if (norm.includes('from public.user_roles')) return { rows: [{ ok: true }] };
        // Open-PO query returns nothing → triggers fallback
        if (norm.includes('from public.purchase_orders po') && norm.includes('po.status = any')) {
          return { rows: [] };
        }
        // Closed-PO fallback
        if (norm.includes('from public.purchase_orders') && norm.includes('limit 1')) {
          return { rows: [{ id: PO_ID }] };
        }
        return { rows: [] };
      }),
    } as unknown as MockClient;

    await getPoForReceive(PO_ID);

    const fallback = calls.find(
      (call) => call.sql.includes('from public.purchase_orders') && call.sql.includes('limit 1'),
    );
    expect(fallback?.sql).toContain('app.user_can_see_site(site_id)');
  });

  it('returns not_found for a PO on a site the user cannot see (open PO returns no rows, fallback also blocked)', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    currentClient = {
      calls,
      query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
        calls.push({ sql, params });
        const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();
        if (norm.includes('from public.user_roles')) return { rows: [{ ok: true }] };
        // Both site-filtered queries return nothing → simulates invisible site
        return { rows: [] };
      }),
    } as unknown as MockClient;

    const result = await getPoForReceive(PO_ID);

    expect(result).toEqual({ ok: false, error: 'not_found' });
  });
});

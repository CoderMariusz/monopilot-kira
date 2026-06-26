import { beforeEach, describe, expect, it, vi } from 'vitest';

import { receivePoLineDesktop, type DesktopReceiveInput } from './receive-po-line';
import type { QueryClient } from '../../_actions/procurement-shared';

const ORG_ID = '00000000-0000-4000-8000-00000000000a';
const USER_ID = '00000000-0000-4000-8000-0000000000aa';
const PO_ID = '00000000-0000-4000-8000-0000000000a1';
const LINE_ID = '00000000-0000-4000-8000-0000000000b1';
const ITEM_ID = '00000000-0000-4000-8000-0000000000c1';
const SUPPLIER_ID = '00000000-0000-4000-8000-0000000000d1';
const WAREHOUSE_ID = '00000000-0000-4000-8000-0000000000e1';
const SITE_ID = '00000000-0000-4000-8000-0000000000e2';
const LOCATION_ID = '00000000-0000-4000-8000-0000000000f1';

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

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
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
    expect(findCall('insert into public.license_plates')).toBeTruthy();
    expect(findCall('insert into public.grn_items')).toBeTruthy();
    expect(findCall('update public.purchase_orders')?.params).toEqual([ORG_ID, PO_ID, 'received', USER_ID]);
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
      return { rows: (this.options.warehouse === null ? [] : [this.options.warehouse ?? defaultWarehouse()]) as T[] };
    }

    if (normalized.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (normalized.includes('from public.grns') && normalized.includes('status =')) {
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

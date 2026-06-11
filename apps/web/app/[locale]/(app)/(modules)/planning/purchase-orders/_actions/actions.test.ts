import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  transitionPurchaseOrderStatus,
} from './actions';
import type { QueryClient } from '../../_actions/procurement-shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PO_ID = '33333333-3333-4333-8333-333333333333';
const SUPPLIER_ID = '44444444-4444-4444-8444-444444444444';
const ITEM_ID = '55555555-5555-4555-8555-555555555555';

let client: QueryClient;
let allowPermission = true;
let poExists = true;
let generatedSeq = 7;
let failNextAutoInsert = false;

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function header(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PO_ID,
    po_number: 'PO-TEST-001',
    supplier_id: SUPPLIER_ID,
    supplier_code: 'SUP-TEST-01',
    supplier_name: 'Test Supplier',
    status: 'draft',
    expected_delivery: '2026-06-18',
    currency: 'EUR',
    notes: null,
    created_at: '2026-06-10T08:00:00.000Z',
    updated_at: '2026-06-10T08:00:00.000Z',
    ...overrides,
  };
}

function line() {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    po_id: PO_ID,
    item_id: ITEM_ID,
    item_code: 'RM-BEEF-80',
    item_name: 'Beef trim 80VL',
    qty: '10.000',
    uom: 'kg',
    unit_price: '6.2000',
    line_no: 1,
  };
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.includes('from public.user_roles')) {
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }
      if (normalized.startsWith('update public.org_document_settings')) {
        return {
          rows: [{ old_seq: generatedSeq++, number_prefix: 'PO', number_date_part: 'YYYYMM', number_seq_padding: 4 }],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('select count(*) as archived_count')) {
        return { rows: [{ archived_count: 1 }], rowCount: 1 };
      }
      if (normalized.includes('from public.purchase_order_lines')) {
        return { rows: [line()], rowCount: 1 };
      }
      if (normalized.startsWith('select po.id')) {
        return { rows: poExists ? [header({ status: params[3] === true ? 'received' : 'draft' })] : [], rowCount: poExists ? 1 : 0 };
      }
      if (normalized.startsWith('insert into public.purchase_orders')) {
        if (failNextAutoInsert) {
          failNextAutoInsert = false;
          const error = new Error('duplicate') as Error & { code: string };
          error.code = '23505';
          throw error;
        }
        return { rows: [header({ po_number: String(params[0]), supplier_code: null, supplier_name: null })], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.purchase_order_lines')) {
        return { rows: [], rowCount: 1 };
      }
      if (normalized.startsWith('select status from public.purchase_orders')) {
        return { rows: poExists ? [{ status: 'draft' }] : [], rowCount: poExists ? 1 : 0 };
      }
      if (normalized.startsWith('update public.purchase_orders')) {
        return { rows: poExists ? [header({ status: 'confirmed', supplier_code: null, supplier_name: null })] : [], rowCount: poExists ? 1 : 0 };
      }
      if (normalized.startsWith('insert into public.audit_events')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('planning purchase order actions', () => {
  beforeEach(() => {
    allowPermission = true;
    poExists = true;
    generatedSeq = 7;
    failNextAutoInsert = false;
    client = makeClient();
  });

  it('lists purchase orders with supplier context', async () => {
    const result = await listPurchaseOrders({ status: 'draft', q: 'PO' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data[0]).toEqual(expect.objectContaining({ poNumber: 'PO-TEST-001', supplierCode: 'SUP-TEST-01' }));
    expect(result.archivedCount).toBe(1);
  });

  it('passes archived=false by default and archived=true for archive views', async () => {
    await listPurchaseOrders({});
    await listPurchaseOrders({ archived: true });

    const listCalls = vi.mocked(client.query).mock.calls.filter(([sql]) => String(sql).includes('from public.purchase_orders po'));
    expect(listCalls[0]?.[1]).toEqual([null, null, 100, false]);
    expect(listCalls[2]?.[1]).toEqual([null, null, 100, true]);
  });

  it('gets purchase order detail with ordered lines', async () => {
    const result = await getPurchaseOrder(PO_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.lines).toEqual([expect.objectContaining({ itemCode: 'RM-BEEF-80', qty: '10.000' })]);
  });

  it('creates a purchase order, lines, and audit event', async () => {
    const result = await createPurchaseOrder({
      poNumber: 'PO-TEST-001',
      supplierId: SUPPLIER_ID,
      lines: [{ itemId: ITEM_ID, qty: '10.000', uom: 'kg', unitPrice: '6.2000', lineNo: 1 }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.poNumber).toBe('PO-TEST-001');
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => sql);
    expect(calls.some((sql) => sql.includes('insert into public.purchase_order_lines'))).toBe(true);
    expect(calls.some((sql) => sql.includes('insert into public.audit_events'))).toBe(true);
  });

  it('auto-generates a purchase order number when absent', async () => {
    const result = await createPurchaseOrder({
      supplierId: SUPPLIER_ID,
      lines: [{ itemId: ITEM_ID, qty: '10.000', uom: 'kg', unitPrice: '6.2000', lineNo: 1 }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.poNumber).toMatch(/^PO-\d{6}-0007$/);
  });

  it('retries once with a fresh generated number on unique violation', async () => {
    failNextAutoInsert = true;

    const result = await createPurchaseOrder({
      supplierId: SUPPLIER_ID,
      lines: [{ itemId: ITEM_ID, qty: '10.000', uom: 'kg', unitPrice: '6.2000', lineNo: 1 }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.poNumber).toMatch(/^PO-\d{6}-0008$/);
  });

  it('rejects create when caller lacks planning write permission', async () => {
    allowPermission = false;
    await expect(
      createPurchaseOrder({
        poNumber: 'PO-TEST-001',
        supplierId: SUPPLIER_ID,
        lines: [{ itemId: ITEM_ID, qty: '10.000', uom: 'kg', lineNo: 1 }],
      }),
    ).resolves.toEqual({ ok: false, error: 'forbidden' });
  });

  it('transitions purchase order status', async () => {
    const result = await transitionPurchaseOrderStatus(PO_ID, 'confirmed');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.status).toBe('confirmed');
  });
});

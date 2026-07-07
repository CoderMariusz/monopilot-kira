import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  reopenPurchaseOrder,
  transitionPurchaseOrderStatus,
} from './actions';
import type { QueryClient } from '../../_actions/procurement-shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PO_ID = '33333333-3333-4333-8333-333333333333';
const SUPPLIER_ID = '44444444-4444-4444-8444-444444444444';
const ITEM_ID = '55555555-5555-4555-8555-555555555555';
const DESTINATION_WAREHOUSE_ID = '77777777-7777-4777-8777-777777777777';
const SITE_ID = '88888888-8888-4888-8888-888888888888';

let client: QueryClient;
let allowWritePermission = true;
let allowReadPermission = true;
let poExists = true;
let generatedSeq = 7;
let failNextAutoInsert = false;
let currentStatus = 'draft';
let activeReceivedCount = 0;
let fullyReceived = false;
let supplierStatus = 'active';
let listTotal = 1;

function permissionAllowed(permission: unknown): boolean {
  if (permission === 'npd.planning.write') return allowWritePermission;
  if (permission === 'scheduler.run.read') return allowReadPermission;
  return false;
}

const { getActiveSiteIdMock, resolveWriteSiteIdMock } = vi.hoisted(() => ({
  getActiveSiteIdMock: vi.fn(),
  resolveWriteSiteIdMock: vi.fn(),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../../../lib/site/site-context', () => ({
  getActiveSiteId: getActiveSiteIdMock,
  resolveWriteSiteId: resolveWriteSiteIdMock,
}));

function header(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PO_ID,
    po_number: 'PO-TEST-001',
    supplier_id: SUPPLIER_ID,
    supplier_code: 'SUP-TEST-01',
    supplier_name: 'Test Supplier',
    destination_warehouse_id: null,
    destination_warehouse_name: null,
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
        return { rows: permissionAllowed(params[2]) ? [{ ok: true }] : [], rowCount: permissionAllowed(params[2]) ? 1 : 0 };
      }
      if (normalized.startsWith('select status from public.suppliers')) {
        return { rows: [{ status: supplierStatus }], rowCount: 1 };
      }
      if (normalized.startsWith('update public.org_document_settings')) {
        return {
          rows: [{ old_seq: generatedSeq++, number_prefix: 'PO', number_date_part: 'YYYYMM', number_seq_padding: 4 }],
          rowCount: 1,
        };
      }
      if (normalized.includes('select count(*)::int as total')) {
        return { rows: [{ total: listTotal }], rowCount: 1 };
      }
      if (normalized.startsWith('select count(*) as archived_count')) {
        return { rows: [{ archived_count: 1 }], rowCount: 1 };
      }
      if (normalized.startsWith('select count(*) filter')) {
        return { rows: [{ active_received_count: activeReceivedCount, grn_line_count: 0 }], rowCount: 1 };
      }
      if (normalized.includes('bool_and')) {
        return { rows: [{ is_received: fullyReceived }], rowCount: 1 };
      }
      if (normalized.startsWith('select po.id')) {
        return { rows: poExists ? [header({ status: currentStatus })] : [], rowCount: poExists ? 1 : 0 };
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
        return { rows: poExists ? [{ status: currentStatus }] : [], rowCount: poExists ? 1 : 0 };
      }
      if (normalized.startsWith('update public.purchase_orders') && normalized.includes("set status = 'draft'")) {
        return { rows: poExists ? [header({ status: 'draft', supplier_code: null, supplier_name: null })] : [], rowCount: poExists ? 1 : 0 };
      }
      if (normalized.startsWith('update public.purchase_orders')) {
        return { rows: poExists ? [header({ status: String(params[1]), supplier_code: null, supplier_name: null })] : [], rowCount: poExists ? 1 : 0 };
      }
      if (normalized.includes('from public.purchase_order_lines')) {
        return { rows: [line()], rowCount: 1 };
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
    allowWritePermission = true;
    allowReadPermission = true;
    supplierStatus = 'active';
    poExists = true;
    generatedSeq = 7;
    failNextAutoInsert = false;
    currentStatus = 'draft';
    activeReceivedCount = 0;
    fullyReceived = false;
    listTotal = 1;
    getActiveSiteIdMock.mockResolvedValue(SITE_ID);
    resolveWriteSiteIdMock.mockResolvedValue({ ok: true, siteId: SITE_ID });
    client = makeClient();
  });

  it('rejects list when caller lacks planning read permission', async () => {
    allowReadPermission = false;
    await expect(listPurchaseOrders({})).resolves.toEqual({ ok: false, error: 'forbidden' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => String(sql));
    expect(calls.some((sql) => sql.includes('from public.purchase_orders po'))).toBe(false);
  });

  it('rejects get when caller lacks planning read permission', async () => {
    allowReadPermission = false;
    await expect(getPurchaseOrder(PO_ID)).resolves.toEqual({ ok: false, error: 'forbidden' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => String(sql));
    expect(calls.some((sql) => sql.includes('from public.purchase_orders po'))).toBe(false);
  });

  it('lists purchase orders with supplier context', async () => {
    const result = await listPurchaseOrders({ status: 'draft', q: 'PO' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data[0]).toEqual(expect.objectContaining({ poNumber: 'PO-TEST-001', supplierCode: 'SUP-TEST-01' }));
    expect(result.archivedCount).toBe(1);
  });

  it('passes archived=false by default and archived=true for archive views, including site_id bind', async () => {
    await listPurchaseOrders({});
    await listPurchaseOrders({ archived: true });

    const listCalls = vi.mocked(client.query).mock.calls.filter(([sql]) => String(sql).includes('from public.purchase_orders po'));
    expect(listCalls[0]?.[1]).toEqual([null, null, false, SITE_ID]);
    expect(listCalls[1]?.[1]).toEqual([null, null, false, SITE_ID, 50, 0]);
    expect(listCalls[3]?.[1]).toEqual([null, null, true, SITE_ID]);
    expect(listCalls[4]?.[1]).toEqual([null, null, true, SITE_ID, 50, 0]);
  });

  it('page 2 offset reaches rows beyond the default page cap when total exceeds limit', async () => {
    listTotal = 120;

    const result = await listPurchaseOrders({ page: 2 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.pagination).toMatchObject({
      total: 120,
      page: 2,
      limit: 50,
      offset: 50,
      hasMore: true,
    });
    const dataCall = vi.mocked(client.query).mock.calls.find(([sql]) =>
      String(sql).includes('limit $6::integer offset $7::integer'),
    );
    expect(dataCall?.[1]).toEqual([null, null, false, SITE_ID, 50, 50]);
  });

  it('narrows the list SELECT to the active site (optional predicate) when a site is active', async () => {
    await listPurchaseOrders({ status: 'draft' });

    const mainCall = vi.mocked(client.query).mock.calls.find(([sql]) =>
      String(sql).includes('from public.purchase_orders po') && String(sql).includes('limit $6::integer offset $7::integer'),
    );
    // F10 — the site predicate is now an OPTIONAL narrowing filter, not a hard gate.
    expect(mainCall?.[0]).toContain('($5::uuid is null or po.site_id = $5::uuid)');
    expect(mainCall?.[1]).toEqual(['draft', null, false, SITE_ID, 50, 0]);
  });

  it('F10: lists ORG-WIDE (site bind = null) when no site is active, instead of returning an empty list', async () => {
    getActiveSiteIdMock.mockResolvedValue(null);

    const result = await listPurchaseOrders({ status: 'draft' });

    // PO screens stay org-wide per the site-selector tooltip: "All sites" must
    // return every org PO — including ones created with site_id=NULL — never an
    // empty list. The main SELECT MUST still run, bound with a null site.
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect((result as { noActiveSite?: boolean }).noActiveSite).toBeUndefined();
    const mainCall = vi.mocked(client.query).mock.calls.find(([sql]) =>
      String(sql).includes('from public.purchase_orders po') && String(sql).includes('limit $6::integer offset $7::integer'),
    );
    expect(mainCall).toBeDefined();
    expect(mainCall?.[1]).toEqual(['draft', null, false, null, 50, 0]);
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

  it('F10: refuses to create with no_active_site instead of writing a null-site PO (fail-closed)', async () => {
    // resolveWriteSiteId reports the org has no resolvable/active site.
    resolveWriteSiteIdMock.mockResolvedValue({ ok: false, reason: 'no_active_site' });

    const result = await createPurchaseOrder({
      poNumber: 'PO-TEST-NOSITE',
      supplierId: SUPPLIER_ID,
      lines: [{ itemId: ITEM_ID, qty: '10.000', uom: 'kg', unitPrice: '6.2000', lineNo: 1 }],
    });

    expect(result).toEqual({ ok: false, error: 'no_active_site' });
    // No PO header/line insert may have happened (no orphaned null-site PO).
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => String(sql));
    expect(calls.some((sql) => sql.includes('insert into public.purchase_orders'))).toBe(false);
    expect(calls.some((sql) => sql.includes('insert into public.purchase_order_lines'))).toBe(false);
  });

  it('F10: surfaces ambiguous_site when >1 active site and none chosen/default', async () => {
    resolveWriteSiteIdMock.mockResolvedValue({ ok: false, reason: 'ambiguous_site' });

    const result = await createPurchaseOrder({
      supplierId: SUPPLIER_ID,
      lines: [{ itemId: ITEM_ID, qty: '10.000', uom: 'kg', unitPrice: '6.2000', lineNo: 1 }],
    });

    expect(result).toEqual({ ok: false, error: 'ambiguous_site' });
  });

  it('F10: persists the resolved site_id (never null) on the PO header', async () => {
    const result = await createPurchaseOrder({
      poNumber: 'PO-TEST-SITE',
      supplierId: SUPPLIER_ID,
      lines: [{ itemId: ITEM_ID, qty: '10.000', uom: 'kg', unitPrice: '6.2000', lineNo: 1 }],
    });

    expect(result.ok).toBe(true);
    const insertHeaderCall = vi
      .mocked(client.query)
      .mock.calls.find(([sql]) => String(sql).includes('insert into public.purchase_orders'));
    // site_id is the 9th bind ($9::uuid) — must be the resolved SITE_ID, not null.
    expect(insertHeaderCall?.[1]?.[8]).toBe(SITE_ID);
  });

  it('accepts and persists destination_warehouse_id when creating a purchase order', async () => {
    const result = await createPurchaseOrder({
      poNumber: 'PO-TEST-DEST',
      supplierId: SUPPLIER_ID,
      destinationWarehouseId: DESTINATION_WAREHOUSE_ID,
      lines: [{ itemId: ITEM_ID, qty: '10.000', uom: 'kg', unitPrice: '6.2000', lineNo: 1 }],
    });

    expect(result.ok).toBe(true);
    const insertHeaderCall = vi
      .mocked(client.query)
      .mock.calls.find(([sql]) => String(sql).includes('insert into public.purchase_orders'));
    expect(insertHeaderCall?.[0]).toContain('destination_warehouse_id');
    // currency defaults to GBP (single-currency org); site_id is the 9th bind
    // ($9::uuid) and must be the resolved site, never null (F10).
    expect(insertHeaderCall?.[1]).toEqual([
      'PO-TEST-DEST',
      SUPPLIER_ID,
      DESTINATION_WAREHOUSE_ID,
      'draft',
      null,
      'GBP',
      null,
      USER_ID,
      SITE_ID,
    ]);
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

  it('forces draft status on create even when client sends a terminal status', async () => {
    const result = await createPurchaseOrder({
      poNumber: 'PO-TEST-RECEIVED',
      supplierId: SUPPLIER_ID,
      status: 'received',
      lines: [{ itemId: ITEM_ID, qty: '10.000', uom: 'kg', unitPrice: '6.2000', lineNo: 1 }],
    });

    expect(result.ok).toBe(true);
    const insertHeaderCall = vi
      .mocked(client.query)
      .mock.calls.find(([sql]) => String(sql).includes('insert into public.purchase_orders'));
    expect(insertHeaderCall?.[1]?.[3]).toBe('draft');
  });

  it('rejects create when supplier is blocked', async () => {
    supplierStatus = 'blocked';

    const result = await createPurchaseOrder({
      poNumber: 'PO-TEST-BLOCKED',
      supplierId: SUPPLIER_ID,
      lines: [{ itemId: ITEM_ID, qty: '10.000', uom: 'kg', unitPrice: '6.2000', lineNo: 1 }],
    });

    expect(result).toEqual({
      ok: false,
      error: 'supplier_blocked',
      code: 'supplier_blocked',
      message: 'Supplier is blocked',
    });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => String(sql));
    expect(calls.some((sql) => sql.includes('insert into public.purchase_orders'))).toBe(false);
  });

  it('rejects create when caller lacks planning write permission', async () => {
    allowWritePermission = false;
    await expect(
      createPurchaseOrder({
        poNumber: 'PO-TEST-001',
        supplierId: SUPPLIER_ID,
        lines: [{ itemId: ITEM_ID, qty: '10.000', uom: 'kg', lineNo: 1 }],
      }),
    ).resolves.toEqual({ ok: false, error: 'forbidden' });
  });

  it('transitions purchase order status on a legal move (draft -> sent)', async () => {
    currentStatus = 'draft';
    const result = await transitionPurchaseOrderStatus(PO_ID, 'sent');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.status).toBe('sent');
  });

  it('rejects manual transition to received when open quantity remains (confirmed -> received)', async () => {
    currentStatus = 'confirmed';
    activeReceivedCount = 0;
    fullyReceived = false;

    const result = await transitionPurchaseOrderStatus(PO_ID, 'received');

    expect(result).toEqual({ ok: false, error: 'po_open_quantity', code: 'po_open_quantity' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => String(sql));
    expect(calls.some((sql) => sql.startsWith('update public.purchase_orders'))).toBe(false);
  });

  it('rejects manual transition to partially_received without active receipts', async () => {
    currentStatus = 'confirmed';
    activeReceivedCount = 0;

    const result = await transitionPurchaseOrderStatus(PO_ID, 'partially_received');

    expect(result).toEqual({ ok: false, error: 'po_open_quantity', code: 'po_open_quantity' });
  });

  it('blocks manual transition to received even when receipt state is complete (edge removed)', async () => {
    currentStatus = 'confirmed';
    activeReceivedCount = 1;
    fullyReceived = true;

    const result = await transitionPurchaseOrderStatus(PO_ID, 'received');

    expect(result).toEqual({ ok: false, error: 'invalid_state' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => String(sql));
    expect(calls.some((sql) => sql.startsWith('update public.purchase_orders'))).toBe(false);
  });

  it('refuses cancel when active receipts exist (po_has_receipts guard)', async () => {
    currentStatus = 'confirmed';
    activeReceivedCount = 2;

    const result = await transitionPurchaseOrderStatus(PO_ID, 'cancelled');

    expect(result).toEqual({ ok: false, error: 'po_has_receipts', code: 'po_has_receipts' });
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => String(sql));
    expect(calls.some((sql) => sql.startsWith('update public.purchase_orders'))).toBe(false);
  });

  it('refuses an illegal transition (draft -> confirmed) server-side', async () => {
    currentStatus = 'draft';
    const result = await transitionPurchaseOrderStatus(PO_ID, 'confirmed');

    expect(result).toEqual({ ok: false, error: 'invalid_state' });
    // The illegal request must never reach the UPDATE.
    const calls = vi.mocked(client.query).mock.calls.map(([sql]) => String(sql));
    expect(calls.some((sql) => sql.startsWith('update public.purchase_orders'))).toBe(false);
  });

  it('refuses any transition out of a terminal status (received -> cancelled)', async () => {
    currentStatus = 'received';
    const result = await transitionPurchaseOrderStatus(PO_ID, 'cancelled');

    expect(result).toEqual({ ok: false, error: 'invalid_state' });
  });

  it('reopenPurchaseOrder ignores cancelled GRN lines in both receipt guards', async () => {
    currentStatus = 'sent';

    const result = await reopenPurchaseOrder(PO_ID);

    expect(result.ok).toBe(true);
    const receiptStateCall = vi.mocked(client.query).mock.calls.find(([sql]) => String(sql).includes('as grn_line_count'));
    expect(receiptStateCall?.[0]).toContain('count(*) filter');
    expect(receiptStateCall?.[0]).toContain('gi.cancelled_at is null');
    expect(receiptStateCall?.[0]).toContain("coalesce(g.status, 'draft') <> 'cancelled'");

    const reopenUpdateCall = vi
      .mocked(client.query)
      .mock.calls.find(([sql]) => String(sql).includes("set status = 'draft'"));
    expect(reopenUpdateCall?.[0]).toContain('and gi.cancelled_at is null');
    expect(reopenUpdateCall?.[0]).toContain("and coalesce(g.status, 'draft') <> 'cancelled'");
  });
});

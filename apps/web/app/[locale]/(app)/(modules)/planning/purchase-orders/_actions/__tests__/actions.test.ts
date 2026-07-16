import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addPurchaseOrderLine,
  deletePurchaseOrderLine,
  updatePurchaseOrder,
  updatePurchaseOrderLine,
} from '../actions';
import type { QueryClient } from '../../../_actions/procurement-shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PO_ID = '33333333-3333-4333-8333-333333333333';
const LINE_ID = '44444444-4444-4444-8444-444444444444';
const SUPPLIER_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_ACTIVE_SUPPLIER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BLOCKED_SUPPLIER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ITEM_ID = '66666666-6666-4666-8666-666666666666';

let client: QueryClient;
let allowPermission = true;
let poExists = true;
let supplierExists = true;
let itemExists = true;
let lineExists = true;
let currentStatus = 'draft';
let raceOnHeaderUpdate = false;
let raceOnLineMutation = false;
let duplicateAppendOnce = false;
let lineCount = 2;
const supplierStatuses: Record<string, string> = {};
const INITIAL_LINES = [
  {
    id: LINE_ID,
    po_id: PO_ID,
    item_id: ITEM_ID,
    item_code: 'RM-BEEF-80',
    item_name: 'Beef trim 80VL',
    qty: '10.000',
    uom: 'kg',
    unit_price: '6.2000',
    line_no: 1,
    received_qty: '0',
  },
  {
    id: '77777777-7777-4777-8777-777777777777',
    po_id: PO_ID,
    item_id: ITEM_ID,
    item_code: 'RM-PORK-70',
    item_name: 'Pork trim 70VL',
    qty: '5.000',
    uom: 'kg',
    unit_price: '4.1000',
    line_no: 2,
    received_qty: '0',
  },
];
let lines = INITIAL_LINES.map((line) => ({ ...line }));

const revalidatePath = vi.fn();

vi.mock('../../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: (path: string, type?: string) => type !== undefined ? revalidatePath(path, type) : revalidatePath(path),
}));

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
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
    status: currentStatus,
    expected_delivery: '2026-06-18',
    currency: 'EUR',
    notes: null,
    created_at: '2026-06-10T08:00:00.000Z',
    updated_at: '2026-06-10T08:00:00.000Z',
    ...overrides,
  };
}

function currentLine() {
  return { ...lines[0] };
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.includes('from public.user_roles')) {
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }
      if (normalized.includes('from public.purchase_orders po') && normalized.includes('for update of po')) {
        return { rows: poExists ? [header()] : [], rowCount: poExists ? 1 : 0 };
      }
      if (normalized.startsWith('select id, status') && normalized.includes('from public.suppliers')) {
        const supplierId = String(params[0]);
        if (!supplierExists && supplierId === SUPPLIER_ID) {
          return { rows: [], rowCount: 0 };
        }
        if (!(supplierId in supplierStatuses)) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [{ id: supplierId, status: supplierStatuses[supplierId] }], rowCount: 1 };
      }
      if (normalized.includes('from public.suppliers') && normalized.includes('left join')) {
        return { rows: [], rowCount: 0 };
      }
      if (normalized.includes('from public.suppliers')) {
        const supplierId = String(params[0] ?? SUPPLIER_ID);
        if (!supplierExists && supplierId === SUPPLIER_ID) {
          return { rows: [], rowCount: 0 };
        }
        if (!(supplierId in supplierStatuses)) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [{ id: supplierId, status: supplierStatuses[supplierId] }], rowCount: 1 };
      }
      if (normalized.includes('from public.items')) {
        return { rows: itemExists ? [{ id: ITEM_ID }] : [], rowCount: itemExists ? 1 : 0 };
      }
      if (normalized.startsWith('update public.purchase_orders')) {
        if (raceOnHeaderUpdate) return { rows: [], rowCount: 0 };
        return {
          rows: [
            header({
              supplier_id: params[1] ?? SUPPLIER_ID,
              expected_delivery: params[2] ?? '2026-06-18',
              currency: params[3] ?? 'EUR',
              notes: params[4] ?? null,
            }),
          ],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('insert into public.purchase_order_lines')) {
        if (duplicateAppendOnce) {
          duplicateAppendOnce = false;
          const error = new Error('duplicate line_no') as Error & { code: string };
          error.code = '23505';
          throw error;
        }
        if (raceOnLineMutation) return { rows: [], rowCount: 0 };
        return { rows: [{ id: LINE_ID, line_no: 3 }], rowCount: 1 };
      }
      if (normalized.startsWith('select l.id') && normalized.includes('left join public.items')) {
        return { rows: lines, rowCount: lines.length };
      }
      if (normalized.startsWith('select l.id') && normalized.includes('from public.purchase_order_lines l')) {
        return { rows: lineExists ? [currentLine()] : [], rowCount: lineExists ? 1 : 0 };
      }
      if (normalized.startsWith('update public.purchase_order_lines l')) {
        return { rows: [], rowCount: raceOnLineMutation ? 0 : 1 };
      }
      if (normalized.startsWith('select count(*) as line_count')) {
        return { rows: [{ line_count: lineCount }], rowCount: 1 };
      }
      if (normalized.startsWith('delete from public.purchase_order_lines')) {
        return { rows: [], rowCount: raceOnLineMutation ? 0 : 1 };
      }
      if (normalized.startsWith('with ranked as')) {
        lines = lines.slice(1).map((line, index) => ({ ...line, line_no: index + 1 }));
        return { rows: [], rowCount: lines.length };
      }
      if (normalized.startsWith('insert into public.audit_events')) {
        return { rows: [], rowCount: 1 };
      }
      if (normalized === 'savepoint po_line_append' || normalized === 'release savepoint po_line_append') {
        return { rows: [], rowCount: null };
      }
      if (normalized === 'rollback to savepoint po_line_append') {
        return { rows: [], rowCount: null };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('planning purchase order draft edit actions', () => {
  beforeEach(() => {
    allowPermission = true;
    poExists = true;
    supplierExists = true;
    itemExists = true;
    lineExists = true;
    currentStatus = 'draft';
    raceOnHeaderUpdate = false;
    raceOnLineMutation = false;
    duplicateAppendOnce = false;
    lineCount = 2;
    supplierStatuses[SUPPLIER_ID] = 'active';
    supplierStatuses[OTHER_ACTIVE_SUPPLIER_ID] = 'active';
    supplierStatuses[BLOCKED_SUPPLIER_ID] = 'blocked';
    lines = INITIAL_LINES.map((line) => ({ ...line }));
    revalidatePath.mockClear();
    client = makeClient();
  });

  describe('updatePurchaseOrder', () => {
    it('updates a draft purchase order and audits the change', async () => {
      const result = await updatePurchaseOrder({
        id: PO_ID,
        supplierId: SUPPLIER_ID,
        expectedDelivery: '2026-06-20',
        currency: 'GBP',
        notes: 'expedite',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.data.currency).toBe('GBP');
      const calls = vi.mocked(client.query).mock.calls.map(([sql]) => String(sql));
      expect(calls.some((sql) => sql.includes('for update of po'))).toBe(true);
      expect(calls.some((sql) => sql.includes('insert into public.audit_events'))).toBe(true);
      expect(revalidatePath).toHaveBeenCalledWith('/planning/purchase-orders');
      expect(revalidatePath).toHaveBeenCalledWith(`/planning/purchase-orders/${PO_ID}`);
    });

    it('returns invalid_state for a non-draft purchase order', async () => {
      currentStatus = 'sent';
      await expect(updatePurchaseOrder({ id: PO_ID, notes: 'late' })).resolves.toEqual({
        ok: false,
        error: 'invalid_state',
        code: 'invalid_state',
      });
    });

    it('returns not_found for a supplier outside the current org', async () => {
      supplierExists = false;
      delete supplierStatuses[SUPPLIER_ID];
      await expect(updatePurchaseOrder({ id: PO_ID, supplierId: SUPPLIER_ID })).resolves.toEqual({ ok: false, error: 'not_found' });
    });

    it('rejects swapping a draft PO supplier to a blocked supplier', async () => {
      const result = await updatePurchaseOrder({ id: PO_ID, supplierId: BLOCKED_SUPPLIER_ID });

      expect(result).toEqual({
        ok: false,
        error: 'supplier_blocked',
        code: 'supplier_blocked',
        message: 'Supplier is blocked',
      });
      const calls = vi.mocked(client.query).mock.calls.map(([sql]) => String(sql));
      expect(calls.some((sql) => sql.startsWith('update public.purchase_orders'))).toBe(false);
    });

    it('allows swapping a draft PO supplier to an active supplier', async () => {
      const result = await updatePurchaseOrder({ id: PO_ID, supplierId: OTHER_ACTIVE_SUPPLIER_ID });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.data.supplierId).toBe(OTHER_ACTIVE_SUPPLIER_ID);
    });

    it('returns invalid_state when status changes between read and write', async () => {
      raceOnHeaderUpdate = true;
      await expect(updatePurchaseOrder({ id: PO_ID, notes: 'race' })).resolves.toEqual({
        ok: false,
        error: 'invalid_state',
        code: 'invalid_state',
      });
    });
  });

  describe('addPurchaseOrderLine', () => {
    it('adds a draft line with decimal string qty and unitPrice', async () => {
      const result = await addPurchaseOrderLine({ poId: PO_ID, itemId: ITEM_ID, qty: '1.250', uom: 'kg', unitPrice: '3.4567' });

      expect(result.ok).toBe(true);
      const insert = vi.mocked(client.query).mock.calls.find(([sql]) => String(sql).startsWith('insert into public.purchase_order_lines'));
      expect(insert?.[1]).toEqual([PO_ID, ITEM_ID, '1.250', 'kg', '3.4567', '0', USER_ID]);
    });

    it('retries once when concurrent append collides on line_no', async () => {
      duplicateAppendOnce = true;
      const result = await addPurchaseOrderLine({ poId: PO_ID, itemId: ITEM_ID, qty: '1.250', uom: 'kg', unitPrice: '3.4567' });

      expect(result.ok).toBe(true);
      const inserts = vi.mocked(client.query).mock.calls.filter(([sql]) => String(sql).startsWith('insert into public.purchase_order_lines'));
      expect(inserts).toHaveLength(2);
    });

    it('returns invalid_state for a non-draft purchase order', async () => {
      currentStatus = 'sent';
      await expect(addPurchaseOrderLine({ poId: PO_ID, itemId: ITEM_ID, qty: '1.250', uom: 'kg', unitPrice: '3.4567' })).resolves.toEqual({
        ok: false,
        error: 'invalid_state',
        code: 'invalid_state',
      });
    });

    it('returns not_found for an item outside the current org', async () => {
      itemExists = false;
      await expect(addPurchaseOrderLine({ poId: PO_ID, itemId: ITEM_ID, qty: '1.250', uom: 'kg', unitPrice: '3.4567' })).resolves.toEqual({
        ok: false,
        error: 'not_found',
      });
    });

    it('returns invalid_state when status changes between read and write', async () => {
      raceOnLineMutation = true;
      await expect(addPurchaseOrderLine({ poId: PO_ID, itemId: ITEM_ID, qty: '1.250', uom: 'kg', unitPrice: '3.4567' })).resolves.toEqual({
        ok: false,
        error: 'invalid_state',
        code: 'invalid_state',
      });
    });
  });

  describe('updatePurchaseOrderLine', () => {
    it('updates a draft line with decimal string qty and unitPrice', async () => {
      const result = await updatePurchaseOrderLine({ poId: PO_ID, lineId: LINE_ID, qty: '2.500', uom: 'case', unitPrice: '7.0000' });

      expect(result.ok).toBe(true);
      const update = vi.mocked(client.query).mock.calls.find(([sql]) => String(sql).startsWith('update public.purchase_order_lines l'));
      expect(update?.[1]).toEqual([PO_ID, LINE_ID, '2.500', 'case', '7.0000', null, USER_ID]);
    });

    it('returns invalid_state for a non-draft purchase order', async () => {
      currentStatus = 'sent';
      await expect(updatePurchaseOrderLine({ poId: PO_ID, lineId: LINE_ID, qty: '2.500' })).resolves.toEqual({
        ok: false,
        error: 'invalid_state',
        code: 'invalid_state',
      });
    });

    it('returns not_found for a line outside the current org', async () => {
      lineExists = false;
      await expect(updatePurchaseOrderLine({ poId: PO_ID, lineId: LINE_ID, qty: '2.500' })).resolves.toEqual({ ok: false, error: 'not_found' });
    });

    it('returns invalid_state when status changes between read and write', async () => {
      raceOnLineMutation = true;
      await expect(updatePurchaseOrderLine({ poId: PO_ID, lineId: LINE_ID, qty: '2.500' })).resolves.toEqual({
        ok: false,
        error: 'invalid_state',
        code: 'invalid_state',
      });
    });
  });

  describe('deletePurchaseOrderLine', () => {
    it('deletes a draft line and renumbers remaining lines densely', async () => {
      const result = await deletePurchaseOrderLine({ poId: PO_ID, lineId: LINE_ID });

      expect(result.ok).toBe(true);
      expect(lines).toEqual([expect.objectContaining({ line_no: 1 })]);
      const calls = vi.mocked(client.query).mock.calls.map(([sql]) => String(sql));
      expect(calls.some((sql) => sql.startsWith('delete from public.purchase_order_lines'))).toBe(true);
      expect(calls.some((sql) => sql.startsWith('with ranked as'))).toBe(true);
    });

    it('returns invalid_state for a non-draft purchase order', async () => {
      currentStatus = 'sent';
      await expect(deletePurchaseOrderLine({ poId: PO_ID, lineId: LINE_ID })).resolves.toEqual({
        ok: false,
        error: 'invalid_state',
        code: 'invalid_state',
      });
    });

    it('returns not_found for a line outside the current org', async () => {
      lineExists = false;
      await expect(deletePurchaseOrderLine({ poId: PO_ID, lineId: LINE_ID })).resolves.toEqual({ ok: false, error: 'not_found' });
    });

    it('refuses deleting the last remaining line', async () => {
      lineCount = 1;
      await expect(deletePurchaseOrderLine({ poId: PO_ID, lineId: LINE_ID })).resolves.toEqual({
        ok: false,
        error: 'last_line',
        code: 'last_line',
        message: 'Cannot delete the last purchase order line',
      });
    });

    it('returns invalid_state when status changes between read and write', async () => {
      raceOnLineMutation = true;
      await expect(deletePurchaseOrderLine({ poId: PO_ID, lineId: LINE_ID })).resolves.toEqual({
        ok: false,
        error: 'invalid_state',
        code: 'invalid_state',
      });
    });
  });
});

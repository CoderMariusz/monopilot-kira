import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QueryClient } from '../../_actions/procurement-shared';
import { createPurchaseOrderCore } from './create-purchase-order-core';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SUPPLIER_ID = '33333333-3333-4333-8333-333333333333';
const SITE_ID = '88888888-8888-4888-8888-888888888888';
const ITEM_ID = '55555555-5555-4555-8555-555555555555';

let client: QueryClient;
let allowPermission = true;
let supplierStatus = 'active';
let supplierQuerySql = '';

vi.mock('../../../../../../../lib/site/site-context', () => ({
  resolveWriteSiteId: vi.fn(async () => ({ ok: true as const, siteId: SITE_ID })),
}));

vi.mock('../../../../../../../lib/documents/numbering', () => ({
  nextDocumentNumber: vi.fn(async () => 'PO-AUTO-001'),
}));

function makeClient(): QueryClient {
  const query: QueryClient['query'] = async <T = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<{ rows: T[]; rowCount?: number | null }> => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    let rows: unknown[] = [];

    if (normalized.includes('from public.user_roles')) {
      rows = allowPermission ? [{ ok: true }] : [];
    } else if (normalized.includes('from public.suppliers')) {
      supplierQuerySql = sql;
      rows = [{ status: supplierStatus }];
    } else if (normalized.includes('insert into public.purchase_orders')) {
      rows = [
        {
          id: '99999999-9999-4999-8999-999999999999',
          po_number: params[0],
          supplier_id: params[1],
          supplier_code: null,
          supplier_name: null,
          destination_warehouse_id: params[2],
          destination_warehouse_name: null,
          status: params[3],
          expected_delivery: params[4],
          currency: params[5],
          notes: params[6],
          created_at: '2026-06-23T12:00:00.000Z',
          updated_at: '2026-06-23T12:00:00.000Z',
        },
      ];
    } else if (normalized.includes('insert into public.purchase_order_lines')) {
      rows = [];
    } else if (normalized.includes('insert into public.audit_events')) {
      rows = [];
    } else if (normalized.includes('from public.purchase_order_lines')) {
      rows = [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          po_id: '99999999-9999-4999-8999-999999999999',
          item_id: ITEM_ID,
          item_code: 'ITEM-A',
          item_name: 'Item A',
          qty: params[0] === undefined ? '10' : String(params[2]),
          uom: 'kg',
          unit_price: '1',
          line_no: 1,
          received_qty: '0',
        },
      ];
    }

    return { rows: rows as T[], rowCount: rows.length };
  };

  return { query: vi.fn(query) as unknown as QueryClient['query'] };
}

describe('createPurchaseOrderCore', () => {
  beforeEach(() => {
    allowPermission = true;
    supplierStatus = 'active';
    supplierQuerySql = '';
    client = makeClient();
  });

  it('locks the supplier row with FOR UPDATE during the status check', async () => {
    const result = await createPurchaseOrderCore(
      { userId: USER_ID, orgId: ORG_ID, client },
      {
        poNumber: 'PO-LOCK-1',
        supplierId: SUPPLIER_ID,
        status: 'draft',
        currency: 'GBP',
        lines: [{ itemId: ITEM_ID, qty: '10', uom: 'kg', unitPrice: '0', lineNo: 1 }],
      },
    );

    expect(result.ok).toBe(true);
    expect(supplierQuerySql.toLowerCase()).toContain('for update');
    expect(supplierQuerySql.toLowerCase()).toContain('supplier_row');
  });

  it('rejects blocked suppliers under the row lock', async () => {
    supplierStatus = 'blocked';

    const result = await createPurchaseOrderCore(
      { userId: USER_ID, orgId: ORG_ID, client },
      {
        poNumber: 'PO-BLOCKED',
        supplierId: SUPPLIER_ID,
        status: 'draft',
        currency: 'GBP',
        lines: [{ itemId: ITEM_ID, qty: '10', uom: 'kg', unitPrice: '0', lineNo: 1 }],
      },
    );

    expect(result).toEqual({
      ok: false,
      error: 'supplier_blocked',
      code: 'supplier_blocked',
      message: 'Supplier is blocked',
    });
  });

  it('rejects inactive suppliers under the row lock', async () => {
    supplierStatus = 'inactive';

    const result = await createPurchaseOrderCore(
      { userId: USER_ID, orgId: ORG_ID, client },
      {
        poNumber: 'PO-INACTIVE',
        supplierId: SUPPLIER_ID,
        status: 'draft',
        currency: 'GBP',
        lines: [{ itemId: ITEM_ID, qty: '10', uom: 'kg', unitPrice: '0', lineNo: 1 }],
      },
    );

    expect(result).toEqual({
      ok: false,
      error: 'supplier_blocked',
      code: 'supplier_blocked',
      message: 'Supplier is inactive',
    });
  });
});

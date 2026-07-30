import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  allocateSalesOrder,
  createSalesOrder,
  deallocateSalesOrder,
  deleteSalesOrder,
  getSalesOrder,
  listSalesOrders,
  transitionSalesOrderStatus,
  updateSalesOrder,
} from '../so-actions';
import { reserveLp } from '../../../warehouse/license-plates/[lpId]/_actions/lp-detail-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SO_ID = '33333333-3333-4333-8333-333333333333';
const CUSTOMER_ID = '44444444-4444-4444-8444-444444444444';
const LINE_ID = '55555555-5555-4555-8555-555555555555';
const UNKNOWN_LINE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM_ID = '66666666-6666-4666-8666-666666666666';
const ITEM_ID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LP_1 = '77777777-7777-4777-8777-777777777777';
const LP_2 = '88888888-8888-4888-8888-888888888888';
const SITE_ID = '99999999-9999-4999-8999-999999999999';
const CLIENT_OP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WO_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

let client: QueryClient;
let allowPermission = true;
let status = 'draft';
let soNumber = 'SO-202606-00001';
let insertedSo: Record<string, unknown> | null = null;
let insertedLines: Array<Record<string, unknown>> = [];
let listPriceGbp: string | null = '7.2500';
let customerPriceRows: Array<{ item_id: string; unit_price: string; currency: string }> = [];
let orderDate = '2026-07-07';
let allocationRows: Array<{ sales_order_line_id: string; lp_id: string; qty: string; status: string }> = [];
let lpReserved: Record<string, string> = {};
let lineAllocatedQty = '0';
let lineSiteId: string | null = null;
let lineProductId = ITEM_ID;
let lineQuantityOrdered = '10';
let lineOrderQty: string | null = null;
let lineOrderUom: string | null = null;
let lineUnitPriceGbp = '7.2500';
let hasSalesOrderLine = true;
let lineNotes: string | null = 'line note';
let lineUpdateCallCount = 0;
let candidateRows: Array<{
  lp_id: string;
  available_qty: string;
  expiry_date?: string | null;
  days_to_expiry?: number | null;
}> = [];
let nearExpiryWarnDays: string = '7';
let customerActive = true;
let customerDeleted = false;
let activeSiteRows: Array<{ id: string; is_default: boolean }> = [];
let itemPackFactors: Record<
  string,
  { uom_base: string; output_uom: string; net_qty_per_each: string | null; each_per_box: number | null; boxes_per_pallet: number | null }
> = {
  [ITEM_ID]: { uom_base: 'kg', output_uom: 'base', net_qty_per_each: null, each_per_box: null, boxes_per_pallet: null },
  [ITEM_ID_2]: {
    uom_base: 'pcs',
    output_uom: 'each',
    net_qty_per_each: '1',
    each_per_box: 12,
    boxes_per_pallet: null,
  },
};
let orgUnitCodes = ['kg', 'g', 'l', 'ml', 'pcs', 'pack', 'box', 'pallet', 'case'];
let queryLog: Array<{ sql: string; params: readonly unknown[] }> = [];
let listTotal = 1;
let listRowTotal: string | null = '10.0000';
let idempotencyRows = new Map<string, { request_hash: string; response_json: { ok: boolean; data: { id: string } } }>();
let soInsertCount = 0;
let advisoryLockDepth = 0;
const advisoryLockWaiters: Array<() => void> = [];
const nextCacheMocks = vi.hoisted(() => ({ revalidateLocalized: vi.fn() }));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));
vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => nextCacheMocks);
vi.mock('../../../quality/_actions/hold-actions', () => ({
  releaseHoldFromWarehouseLpUnblock: vi.fn(),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function decimalAdd(a: string, b: string): string {
  const toUnits = (value: string) => {
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  };
  const units = toUnits(a) + toUnits(b);
  const whole = units / 1_000_000n;
  const fraction = (units % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${whole.toString()}${fraction ? `.${fraction}` : ''}`;
}

function resolveInventoryQtyMock(orderQty: string, orderUom: string, itemId: string): { inventory_qty: string; resolved: boolean } {
  const item = itemPackFactors[itemId];
  if (!item) return { inventory_qty: '0', resolved: false };
  const uom = orderUom.trim().toLowerCase();
  const qty = Number(orderQty);
  if (uom === 'kg' || uom === item.uom_base.toLowerCase()) {
    return { inventory_qty: orderQty, resolved: true };
  }
  if (uom === 'case' || uom === 'box') {
    if (item.each_per_box == null) return { inventory_qty: '0', resolved: false };
    return { inventory_qty: String(qty * item.each_per_box), resolved: true };
  }
  if (uom === 'pcs' || uom === 'each') {
    return { inventory_qty: orderQty, resolved: true };
  }
  return { inventory_qty: '0', resolved: false };
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      queryLog.push({ sql, params });
      const q = normalize(sql);

      if (q.includes('from public.user_roles')) {
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }
      if (q.includes('from public.license_plates lp') && q.includes('lp.reserved_for_wo_id') && q.includes('for update')) {
        return {
          rows: [{
            id: LP_1,
            lp_number: 'LP-001',
            status: 'available',
            qa_status: 'released',
            quantity: '100',
            reserved_qty: lpReserved[LP_1] ?? '0',
            reserved_for_wo_id: null,
            product_id: ITEM_ID,
            uom: 'kg',
            expiry_date: null,
            site_id: SITE_ID,
            wo_id: null,
            grn_id: null,
            lock_is_active_for_other_user: false,
          }],
          rowCount: 1,
        };
      }
      if (q.startsWith('select hold_id::text') && q.includes('from public.v_active_holds')) {
        return { rows: [], rowCount: 0 };
      }
      if (q.startsWith('select id::text, wo_number, status from public.work_orders')) {
        return { rows: [{ id: WO_ID, wo_number: 'WO-001', status: 'RELEASED' }], rowCount: 1 };
      }
      if (q.startsWith('select exists (') && q.includes('from public.wo_materials wm')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (q.startsWith('select ($1::numeric <=')) {
        const fits = Number(params[0]) <= Number(params[1]) - Number(params[2]);
        return { rows: [{ fits }], rowCount: 1 };
      }
      if (q.includes('pg_advisory_xact_lock')) {
        if (advisoryLockDepth > 0) {
          await new Promise<void>((resolve) => {
            advisoryLockWaiters.push(resolve);
          });
        }
        advisoryLockDepth += 1;
        return { rows: [], rowCount: 0 };
      }
      if (q.includes('from public.idempotency_keys')) {
        const transactionId = String(params[0]);
        const row = idempotencyRows.get(transactionId);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (q.startsWith('insert into public.idempotency_keys')) {
        const transactionId = String(params[0]);
        if (!idempotencyRows.has(transactionId)) {
          idempotencyRows.set(transactionId, {
            request_hash: String(params[2]),
            response_json: JSON.parse(String(params[3])) as { ok: boolean; data: { id: string } },
          });
          advisoryLockDepth = Math.max(0, advisoryLockDepth - 1);
          advisoryLockWaiters.shift()?.();
          return {
            rows: [{ org_id: String(params[1]), request_hash: String(params[2]) }],
            rowCount: 1,
          };
        }
        advisoryLockDepth = Math.max(0, advisoryLockDepth - 1);
        advisoryLockWaiters.shift()?.();
        return { rows: [], rowCount: 0 };
      }
      if (q.includes('next_sales_order_document_number')) {
        return { rows: [{ so_number: soNumber }], rowCount: 1 };
      }
      if (q.includes('from public.sites')) {
        const rows = q.includes('and is_default')
          ? activeSiteRows.filter((site) => site.is_default)
          : activeSiteRows;
        return { rows, rowCount: rows.length };
      }
      if (q.startsWith('select id::text') && q.includes('from public.customers')) {
        if (!customerActive || customerDeleted) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [{ id: CUSTOMER_ID }], rowCount: 1 };
      }
      if (q.startsWith('insert into public.sales_orders')) {
        soInsertCount += 1;
        insertedSo = {
          id: SO_ID,
          order_number: params[2],
          customer_id: params[3],
          promised_ship_date: params[4],
          notes: params[5],
        };
        return { rows: [{ id: SO_ID }], rowCount: 1 };
      }
      if (q.startsWith('select id::text, list_price_gbp::text as list_price_gbp')) {
        const requestedIds = params[0] as string[];
        const rows = requestedIds
          .filter((id) => id === ITEM_ID || id === ITEM_ID_2)
          .map((id) => ({ id, list_price_gbp: listPriceGbp }));
        return { rows, rowCount: rows.length };
      }
      if (q.includes('current_date::text as order_date')) {
        return { rows: [{ order_date: orderDate }], rowCount: 1 };
      }
      if (q.includes('from public.customer_item_prices')) {
        const targetCurrency = params[3];
        if (targetCurrency === undefined) {
          return { rows: customerPriceRows, rowCount: customerPriceRows.length };
        }
        const filtered = customerPriceRows.filter((row) => row.currency === targetCurrency);
        return { rows: filtered, rowCount: filtered.length };
      }
      if (q.includes('from public.unit_of_measure')) {
        return {
          rows: orgUnitCodes.map((code) => ({ code, name: code, category: 'mass' })),
          rowCount: orgUnitCodes.length,
        };
      }
      if (q.includes('as inventory_qty') && q.includes('from public.items i')) {
        const resolved = resolveInventoryQtyMock(String(params[0]), String(params[1]), String(params[2]));
        return { rows: [resolved], rowCount: 1 };
      }
      if (q.startsWith('insert into public.sales_order_lines')) {
        const quantityOrdered = params[5] as string;
        const unitPriceGbp = params[6] as string;
        const orderQty = params[7] as string;
        const discountPct = params[8] as string;
        const taxPct = params[9] as string;
        const currency = params[10] as string | null;
        insertedLines.push({
          sales_order_id: params[2],
          line_number: params[3],
          product_id: params[4],
          quantity_ordered: quantityOrdered,
          unit_price_gbp: unitPriceGbp,
          line_total_gbp: `${Number(orderQty) * Number(unitPriceGbp) * (1 - Number(discountPct) / 100) * (1 + Number(taxPct) / 100)}`,
          ext_data: { order_uom: params[11], order_qty: orderQty },
          ...(discountPct !== '0.0000' || taxPct !== '0.0000' || currency != null
            ? { discount_pct: discountPct, tax_pct: taxPct, currency }
            : {}),
        });
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('select count(*)::int as total') && q.includes('from public.sales_orders')) {
        if (params[1] === 'page2only') return { rows: [{ total: 1 }], rowCount: 1 };
        return { rows: [{ total: listTotal }], rowCount: 1 };
      }
      if (q.startsWith('select so.id::text') && q.includes('line_count')) {
        const offset = Number(params[4] ?? 0);
        const limit = Number(params[3] ?? 50);
        if (params[1] === 'page2only') {
          return {
            rows: [
              {
                id: SO_ID,
                so_number: 'SO-MATCH-999',
                status,
                customer_name: 'Acme Foods',
                customer_code: 'ACME',
                line_count: '1',
                total: listRowTotal,
                created_at: '2026-06-11T10:00:00.000Z',
                expected_ship_date: '2026-06-20',
              },
            ],
            rowCount: 1,
          };
        }
        const index = offset + 1;
        if (index > listTotal) {
          return { rows: [], rowCount: 0 };
        }
        return {
          rows: [
            {
              id: SO_ID,
              so_number: `SO-202606-${String(index).padStart(5, '0')}`,
              status,
              customer_name: 'Acme Foods',
              customer_code: 'ACME',
              line_count: '1',
              total: listRowTotal,
              created_at: '2026-06-11T10:00:00.000Z',
              expected_ship_date: insertedSo?.promised_ship_date ?? '2026-06-20',
            },
          ].slice(0, limit),
          rowCount: 1,
        };
      }
      if (q.startsWith('select so.id::text')) {
        return {
          rows: [
            {
              id: SO_ID,
              order_number: insertedSo?.order_number ?? soNumber,
              status,
              customer_id: CUSTOMER_ID,
              customer_name: 'Acme Foods',
              customer_code: 'ACME',
              promised_ship_date:
                insertedSo && 'promised_ship_date' in insertedSo
                  ? (insertedSo.promised_ship_date as string | null)
                  : '2026-06-20',
              notes: insertedSo && 'notes' in insertedSo ? (insertedSo.notes as string | null) : 'deliver am',
              created_at: '2026-06-11T10:00:00.000Z',
              updated_at: '2026-06-11T10:00:00.000Z',
            },
          ],
          rowCount: 1,
        };
      }
      if (q.startsWith('select sol.id::text') && q.includes("ext_data->>'order_qty' as order_qty")) {
        return {
          rows: [
            {
              id: LINE_ID,
              site_id: lineSiteId,
              product_id: lineProductId,
              quantity_ordered: lineQuantityOrdered,
              order_qty: lineOrderQty,
              order_uom: lineOrderUom,
              inventory_uom: itemPackFactors[lineProductId]?.uom_base ?? 'kg',
            },
          ],
          rowCount: 1,
        };
      }
      if (q.startsWith('select sol.id::text') && q.includes('item_code')) {
        const inventoryUom = lineOrderUom === 'case' ? 'pcs' : 'kg';
        const orderQty = lineOrderQty ?? lineQuantityOrdered;
        const orderUom = lineOrderUom ?? inventoryUom;
        const allocatedCanonical = lineAllocatedQty;
        let allocatedDisplay = allocatedCanonical;
        if (orderUom === 'case' && lineProductId === ITEM_ID_2) {
          allocatedDisplay = String(Number(allocatedCanonical) / 12);
        }
        return {
          rows: [
            {
              id: LINE_ID,
              line_number: 1,
              product_id: lineProductId === ITEM_ID_2 ? ITEM_ID_2 : ITEM_ID,
              item_code: lineProductId === ITEM_ID_2 ? 'FG-002' : 'FG-001',
              item_name: lineProductId === ITEM_ID_2 ? 'Finished Good 002' : 'Finished Good 001',
              inventory_qty: lineQuantityOrdered,
              inventory_uom: inventoryUom,
              order_qty: orderQty,
              order_uom: orderUom,
              quantity_allocated: allocatedCanonical,
              allocated_qty_display: allocatedDisplay,
              unit_price_gbp: lineUnitPriceGbp,
              line_total_gbp: `${Number(orderQty) * Number(lineUnitPriceGbp)}`,
              discount_pct: '0.0000',
              tax_pct: '0.0000',
              currency: 'GBP',
              notes: lineNotes,
            },
          ],
          rowCount: 1,
        };
      }
      if (q.startsWith('select status from public.sales_orders')) {
        return { rows: [{ status }], rowCount: 1 };
      }
      if (q.startsWith('select count(*)::int as line_count') && q.includes('from public.sales_order_lines')) {
        return {
          rows: [{
            line_count: hasSalesOrderLine ? 1 : 0,
            unpriced_line_count: hasSalesOrderLine && lineUnitPriceGbp === '0.0000' ? 1 : 0,
          }],
          rowCount: 1,
        };
      }
      if (
        q.startsWith('update public.sales_orders') &&
        !q.includes('total_amount_gbp') &&
        !q.includes('set deleted_at') &&
        !q.includes('set status')
      ) {
        insertedSo = { ...(insertedSo ?? {}) };
        let idx = 2;
        if (q.includes('promised_ship_date =')) {
          insertedSo.promised_ship_date = params[idx++];
        }
        if (q.includes("ext_data = case")) {
          insertedSo.notes = params[idx++];
        }
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('update public.sales_orders') && q.includes('total_amount_gbp')) {
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('update public.sales_orders') && q.includes('set deleted_at')) {
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('select sol.id::text') && q.includes("coalesce(sol.ext_data->>'order_qty', sol.quantity_ordered::text) as order_qty")) {
        return {
          rows: [
            {
              id: LINE_ID,
              product_id: ITEM_ID,
              order_qty: lineOrderQty ?? lineQuantityOrdered,
              order_uom: lineOrderUom ?? 'kg',
            },
          ],
          rowCount: 1,
        };
      }
      if (q.startsWith('select sol.unit_price_gbp::text')) {
        return {
          rows: [{ unit_price_gbp: lineUnitPriceGbp, discount_pct: '0', tax_pct: '0', currency: 'GBP' }],
          rowCount: 1,
        };
      }
      if (q.startsWith('update public.sales_order_lines') && q.includes('line_total_gbp')) {
        lineUpdateCallCount += 1;
        lineOrderQty = params[6] as string;
        lineQuantityOrdered = params[1] as string;
        lineUnitPriceGbp = params[2] as string;
        if (q.includes('notes = $8::text')) {
          lineNotes = params[7] as string | null;
        }
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('update public.sales_order_lines') && q.includes('set deleted_at')) {
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('update public.sales_orders')) {
        status = params[1] as string;
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('select ia.license_plate_id::text')) {
        const active = allocationRows.filter((row) => row.status === 'allocated');
        return { rows: active, rowCount: active.length };
      }
      if (q.startsWith('update public.inventory_allocations')) {
        allocationRows = allocationRows.map((row) =>
          row.sales_order_line_id === LINE_ID && row.status === 'allocated' ? { ...row, status: 'released' } : row,
        );
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('update public.sales_order_lines') && q.includes('set quantity_allocated = 0')) {
        lineAllocatedQty = '0';
        return { rows: [], rowCount: 1 };
      }
      if (q.includes("feature_flags->>'near_expiry_warn_days'")) {
        return { rows: [{ warn_days: nearExpiryWarnDays }], rowCount: 1 };
      }
      if (q.startsWith('select lp.id::text as lp_id')) {
        return { rows: candidateRows, rowCount: candidateRows.length };
      }
      if (q.startsWith('insert into public.inventory_allocations')) {
        allocationRows.push({
          sales_order_line_id: params[2] as string,
          lp_id: params[3] as string,
          qty: params[4] as string,
          status: 'allocated',
        });
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('update public.license_plates lp') && q.includes('reserved_qty = reserved_qty +')) {
        const lpId = params[0] as string;
        const nextReserved = decimalAdd(lpReserved[lpId] ?? '0', params[1] as string);
        if (Number(nextReserved) > 100) return { rows: [], rowCount: 0 };
        lpReserved[lpId] = nextReserved;
        return {
          rows: [{
            id: lpId,
            lp_number: 'LP-001',
            status: 'reserved',
            reserved_qty: nextReserved,
            available_qty: String(100 - Number(nextReserved)),
            reserved_for_wo_id: WO_ID,
            reserved_for_wo_number: 'WO-001',
            uom: 'kg',
          }],
          rowCount: 1,
        };
      }
      if (q.startsWith('update public.license_plates') && q.includes('reserved_qty = reserved_qty +')) {
        const lpId = params[0] as string;
        lpReserved[lpId] = decimalAdd(lpReserved[lpId] ?? '0', params[1] as string);
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('update public.license_plates') && q.includes('reserved_qty = greatest')) {
        const lpId = params[0] as string;
        lpReserved[lpId] = '0';
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('update public.sales_order_lines') && q.includes('set quantity_allocated = $2')) {
        lineAllocatedQty = params[1] as string;
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

beforeEach(() => {
  allowPermission = true;
  status = 'draft';
  soNumber = 'SO-202606-00001';
  insertedSo = null;
  insertedLines = [];
  listPriceGbp = '7.2500';
  customerPriceRows = [];
  orderDate = '2026-07-07';
  allocationRows = [];
  lpReserved = {};
  lineAllocatedQty = '0';
  lineSiteId = null;
  lineProductId = ITEM_ID;
  lineQuantityOrdered = '10';
  lineOrderQty = null;
  lineOrderUom = null;
  lineUnitPriceGbp = '7.2500';
  hasSalesOrderLine = true;
  lineNotes = 'line note';
  lineUpdateCallCount = 0;
  candidateRows = [];
  nearExpiryWarnDays = '7';
  customerActive = true;
  customerDeleted = false;
  activeSiteRows = [{ id: SITE_ID, is_default: true }];
  orgUnitCodes = ['kg', 'g', 'l', 'ml', 'pcs', 'pack', 'box', 'pallet', 'case'];
  queryLog = [];
  listTotal = 1;
  listRowTotal = '10.0000';
  idempotencyRows = new Map();
  soInsertCount = 0;
  advisoryLockDepth = 0;
  advisoryLockWaiters.length = 0;
  nextCacheMocks.revalidateLocalized.mockClear();
  client = makeClient();
});

describe('SO read actions', () => {
  it('returns forbidden instead of throwing when permission is denied', async () => {
    allowPermission = false;

    await expect(listSalesOrders()).resolves.toEqual({ ok: false, error: 'forbidden' });
    expect(queryLog.some((entry) => normalize(entry.sql).includes('from public.sales_orders'))).toBe(false);
  });

  it('maps list rows to human display fields', async () => {
    const result = await listSalesOrders({ status: 'draft' });

    expect(result).toEqual({
      ok: true,
      data: {
        items: [
          {
            id: SO_ID,
            so_number: 'SO-202606-00001',
            customer_name: 'Acme Foods',
            customer_code: 'ACME',
            status: 'draft',
            line_count: 1,
            total: '10.0000',
            created_at: '2026-06-11T10:00:00.000Z',
            expected_ship_date: '2026-06-20',
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
        offset: 0,
        hasMore: false,
      },
    });
    expect(queryLog.some((entry) => normalize(entry.sql).includes('left join public.customers'))).toBe(true);
  });

  it('computes list total from rounded line sums instead of stored total_amount_gbp', async () => {
    await listSalesOrders({ status: 'draft' });

    const listQuery = queryLog.find(
      (entry) => normalize(entry.sql).includes('line_count') && normalize(entry.sql).includes('offset $5::int'),
    );
    expect(listQuery).toBeDefined();
    expect(normalize(String(listQuery?.sql))).not.toContain('so.total_amount_gbp');
    expect(normalize(String(listQuery?.sql))).toContain('sum(round(');
    expect(normalize(String(listQuery?.sql))).toContain("count(*) filter");
    expect(normalize(String(listQuery?.sql))).toContain("<> 'gbp'");
  });

  it('preserves a null total when a legacy order contains non-GBP lines', async () => {
    listRowTotal = null;

    const result = await listSalesOrders({ status: 'draft' });

    expect(result).toMatchObject({
      ok: true,
      data: {
        items: [{ total: null }],
      },
    });
  });

  it('page 2 offset returns the second page of rows when total exceeds limit', async () => {
    listTotal = 120;

    const result = await listSalesOrders({ page: 2 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data).toMatchObject({
      total: 120,
      page: 2,
      limit: 50,
      offset: 50,
      hasMore: true,
    });
    expect(result.data.items[0]).toEqual(
      expect.objectContaining({ so_number: 'SO-202606-00051' }),
    );
    const listQuery = queryLog.find(
      (entry) => normalize(entry.sql).includes('line_count') && normalize(entry.sql).includes('offset $5::int'),
    );
    expect(listQuery?.params).toEqual([null, null, null, 50, 50]);
  });

  it('search filter finds a row that would only appear on page 2 when unfiltered', async () => {
    listTotal = 120;

    const result = await listSalesOrders({ search: 'page2only', page: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.total).toBe(1);
    expect(result.data.items[0]).toEqual(expect.objectContaining({ so_number: 'SO-MATCH-999' }));
    const countQuery = queryLog.find((entry) => normalize(entry.sql).startsWith('select count(*)'));
    expect(countQuery?.params).toEqual([null, 'page2only', null]);
  });

  it('status filter is passed to count and page queries and total reflects the filter', async () => {
    listTotal = 75;

    const result = await listSalesOrders({ status: 'draft', page: 2 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.total).toBe(75);
    const listQuery = queryLog.find(
      (entry) => normalize(entry.sql).includes('line_count') && normalize(entry.sql).includes('offset $5::int'),
    );
    expect(listQuery?.params).toEqual(['draft', null, null, 50, 50]);
  });

  it('returns sales order detail with header and lines', async () => {
    lineAllocatedQty = '4';

    const result = await getSalesOrder(SO_ID);

    expect(result).toMatchObject({
      ok: true,
      data: {
        id: SO_ID,
        so_number: 'SO-202606-00001',
        customer_name: 'Acme Foods',
        customer_code: 'ACME',
        allocation_status: 'partially_allocated',
        lines: [
          {
            id: LINE_ID,
            line_no: 1,
            item_id: ITEM_ID,
            item_code: 'FG-001',
            item_name: 'Finished Good 001',
            qty: '10',
            uom: 'kg',
            inventory_qty: '10',
            inventory_uom: 'kg',
            allocated_qty: '4',
            allocation_status: 'partially_allocated',
          },
        ],
      },
    });
  });

  it('reports allocation status from canonical inventory qty for case orders', async () => {
    lineAllocatedQty = '12';
    lineQuantityOrdered = '36';
    lineOrderQty = '3';
    lineOrderUom = 'case';
    lineProductId = ITEM_ID_2;

    const result = await getSalesOrder(SO_ID);

    expect(result).toMatchObject({
      ok: true,
      data: {
        allocation_status: 'partially_allocated',
        lines: [
          {
            qty: '3',
            uom: 'case',
            inventory_qty: '36',
            inventory_uom: 'pcs',
            allocated_qty: '1',
            allocation_status: 'partially_allocated',
          },
        ],
      },
    });
  });
});

describe('createSalesOrder', () => {
  it('generates the SO number and inserts the order plus lines', async () => {
    const result = await createSalesOrder({
      client_op_id: CLIENT_OP_ID,
      customer_id: CUSTOMER_ID,
      requested_date: '2026-06-20',
      notes: 'deliver am',
      lines: [{ item_id: ITEM_ID, qty: '10', uom: 'kg' }],
    });

    expect(result).toMatchObject({ ok: true, data: { so_number: 'SO-202606-00001' } });
    expect(insertedSo).toMatchObject({ order_number: 'SO-202606-00001', customer_id: CUSTOMER_ID });
    expect(insertedLines).toEqual([
      {
        sales_order_id: SO_ID,
        line_number: 1,
        product_id: ITEM_ID,
        quantity_ordered: '10',
        unit_price_gbp: '7.2500',
        line_total_gbp: '72.5',
        ext_data: { order_uom: 'kg', order_qty: '10' },
      },
    ]);
    expect(nextCacheMocks.revalidateLocalized).toHaveBeenCalledWith('/shipping');
    const headerInsert = queryLog.find((entry) => normalize(entry.sql).startsWith('insert into public.sales_orders'));
    expect(normalize(headerInsert?.sql ?? '')).toContain('(org_id, site_id, order_number');
    expect(headerInsert?.params?.[1]).toBe(SITE_ID);
    const lineInsert = queryLog.find((entry) => normalize(entry.sql).startsWith('insert into public.sales_order_lines'));
    expect(normalize(lineInsert?.sql ?? '')).toContain('(org_id, site_id, sales_order_id');
    expect(lineInsert?.params?.[1]).toBe(SITE_ID);
  });

  it('refuses creation before the first write when no site can be resolved', async () => {
    activeSiteRows = [];

    const result = await createSalesOrder({
      client_op_id: CLIENT_OP_ID,
      customer_id: CUSTOMER_ID,
      lines: [{ item_id: ITEM_ID, qty: '10', uom: 'kg' }],
    });

    expect(result).toEqual({
      ok: false,
      error: 'persistence_failed',
      message: 'No active site is available. Create or activate a site before creating a sales order.',
    });
    expect(queryLog.some((entry) => normalize(entry.sql).includes('next_sales_order_document_number'))).toBe(false);
    expect(queryLog.some((entry) => normalize(entry.sql).startsWith('insert into public.sales_orders'))).toBe(false);
  });

  it('creates one header and both lines when two valid lines are submitted', async () => {
    const result = await createSalesOrder({
      client_op_id: CLIENT_OP_ID,
      customer_id: CUSTOMER_ID,
      requested_date: '2026-06-20',
      notes: 'deliver am',
      lines: [
        { item_id: ITEM_ID, qty: '10', uom: 'kg' },
        { item_id: ITEM_ID_2, qty: '5', uom: 'case' },
      ],
    });

    expect(result).toMatchObject({ ok: true, data: { so_number: 'SO-202606-00001' } });
    expect(insertedSo).toMatchObject({ order_number: 'SO-202606-00001', customer_id: CUSTOMER_ID });
    expect(
      queryLog.filter((entry) => normalize(entry.sql).startsWith('insert into public.sales_orders')),
    ).toHaveLength(1);
    expect(
      queryLog.filter((entry) => normalize(entry.sql).startsWith('insert into public.sales_order_lines')),
    ).toHaveLength(2);
    expect(insertedLines).toEqual([
      {
        sales_order_id: SO_ID,
        line_number: 1,
        product_id: ITEM_ID,
        quantity_ordered: '10',
        unit_price_gbp: '7.2500',
        line_total_gbp: '72.5',
        ext_data: { order_uom: 'kg', order_qty: '10' },
      },
      {
        sales_order_id: SO_ID,
        line_number: 2,
        product_id: ITEM_ID_2,
        quantity_ordered: '60',
        unit_price_gbp: '7.2500',
        line_total_gbp: '36.25',
        ext_data: { order_uom: 'case', order_qty: '5' },
      },
    ]);
  });

  it('uses item list_price_gbp for unit_price_gbp and line_total_gbp', async () => {
    listPriceGbp = '2.5000';

    await createSalesOrder({
      client_op_id: CLIENT_OP_ID,
      customer_id: CUSTOMER_ID,
      requested_date: '2026-06-20',
      lines: [{ item_id: ITEM_ID_2, qty: '3', uom: 'case' }],
    });

    expect(insertedLines[0]).toMatchObject({
      quantity_ordered: '36',
      unit_price_gbp: '2.5000',
      line_total_gbp: '7.5',
      ext_data: { order_uom: 'case', order_qty: '3' },
    });
  });

  it('persists GBP discount and tax with the extended exact formula', async () => {
    await createSalesOrder({
      client_op_id: CLIENT_OP_ID,
      customer_id: CUSTOMER_ID,
      lines: [
        {
          item_id: ITEM_ID,
          qty: '3.25',
          uom: 'kg',
          unit_price_gbp: '3.50',
          discount_pct: '10',
          tax_pct: '5',
          currency: 'GBP',
        },
      ],
    });

    expect(insertedLines[0]).toMatchObject({
      discount_pct: '10.0000',
      tax_pct: '5.0000',
      currency: 'GBP',
      line_total_gbp: '10.749375',
    });
    const insert = queryLog.find((entry) => normalize(entry.sql).startsWith('insert into public.sales_order_lines'));
    expect(normalize(insert?.sql ?? '')).toContain(
      '$8::numeric * $7::numeric * (1 - $9::numeric / 100) * (1 + $10::numeric / 100)',
    );
    const headerTotalUpdate = queryLog.find(
      (entry) =>
        normalize(entry.sql).startsWith('update public.sales_orders so') &&
        normalize(entry.sql).includes('set total_amount_gbp'),
    );
    expect(normalize(headerTotalUpdate?.sql ?? '')).toContain('count(*) filter');
    expect(normalize(headerTotalUpdate?.sql ?? '')).toContain("<> 'gbp'");
  });

  it('rejects an explicit non-GBP line before the first write', async () => {
    const result = await createSalesOrder({
      client_op_id: CLIENT_OP_ID,
      customer_id: CUSTOMER_ID,
      lines: [
        {
          item_id: ITEM_ID,
          qty: '3.25',
          uom: 'kg',
          unit_price_gbp: '3.50',
          currency: 'EUR',
        },
      ],
    });

    expect(result).toEqual({
      ok: false,
      error: 'invalid_input',
      message: 'Sales order lines must use GBP',
    });
    expect(queryLog.some((entry) => normalize(entry.sql).startsWith('insert into public.sales_orders'))).toBe(false);
    expect(queryLog.some((entry) => normalize(entry.sql).startsWith('insert into public.sales_order_lines'))).toBe(false);
  });

  it('accepts trailing-zero qty and price on create and normalizes to DB scale (C114)', async () => {
    await createSalesOrder({
      client_op_id: CLIENT_OP_ID,
      customer_id: CUSTOMER_ID,
      lines: [
        {
          item_id: ITEM_ID,
          qty: '3.125000',
          uom: 'kg',
          unit_price_gbp: '2.345600',
        },
      ],
    });

    expect(insertedLines[0]).toMatchObject({
      quantity_ordered: '3.125',
      unit_price_gbp: '2.3456',
      ext_data: { order_uom: 'kg', order_qty: '3.125' },
    });
  });

  it('persists high-precision list_price_gbp normalized to the stored 4dp scale', async () => {
    listPriceGbp = '12.3456789';

    await createSalesOrder({
      client_op_id: CLIENT_OP_ID,
      customer_id: CUSTOMER_ID,
      requested_date: '2026-06-20',
      lines: [{ item_id: ITEM_ID, qty: '1', uom: 'kg' }],
    });

    expect(insertedLines[0]?.unit_price_gbp).toBe('12.3457');
    const lineInsert = queryLog.find((entry) => normalize(entry.sql).startsWith('insert into public.sales_order_lines'));
    expect(lineInsert?.params?.[6]).toBe('12.3457');
  });

  it('uses active GBP customer_item_prices over list price', async () => {
    listPriceGbp = '10.0000';
    customerPriceRows = [{ item_id: ITEM_ID, unit_price: '6.5000', currency: 'GBP' }];

    await createSalesOrder({
      client_op_id: CLIENT_OP_ID,
      customer_id: CUSTOMER_ID,
      requested_date: '2026-06-20',
      lines: [{ item_id: ITEM_ID, qty: '4', uom: 'kg' }],
    });

    expect(insertedLines[0]).toMatchObject({
      unit_price_gbp: '6.5000',
      ext_data: { order_uom: 'kg', order_qty: '4' },
    });
    expect(queryLog.some((entry) => normalize(entry.sql).includes('from public.customer_item_prices'))).toBe(true);
  });

  it('ignores non-GBP customer price and uses list price', async () => {
    listPriceGbp = '3.0000';
    customerPriceRows = [{ item_id: ITEM_ID, unit_price: '1.0000', currency: 'EUR' }];

    await createSalesOrder({
      client_op_id: CLIENT_OP_ID,
      customer_id: CUSTOMER_ID,
      requested_date: '2026-06-20',
      lines: [{ item_id: ITEM_ID, qty: '2', uom: 'kg' }],
    });

    expect(insertedLines[0]).toMatchObject({
      unit_price_gbp: '3.0000',
      ext_data: { order_uom: 'kg', order_qty: '2' },
    });
  });

  it('creates a draft SO with zero price when item list_price_gbp is null', async () => {
    listPriceGbp = null;

    const result = await createSalesOrder({
      client_op_id: CLIENT_OP_ID,
      customer_id: CUSTOMER_ID,
      requested_date: '2026-06-20',
      lines: [{ item_id: ITEM_ID, qty: '3', uom: 'kg' }],
    });

    expect(result).toMatchObject({
      ok: true,
      data: { id: SO_ID, status: 'draft' },
    });
    expect(insertedLines).toEqual([
      expect.objectContaining({
        sales_order_id: SO_ID,
        unit_price_gbp: '0.0000',
        line_total_gbp: '0',
      }),
    ]);
  });

  it('rejects SO creation for an inactive customer', async () => {
    customerActive = false;

    const result = await createSalesOrder({
      client_op_id: CLIENT_OP_ID,
      customer_id: CUSTOMER_ID,
      requested_date: '2026-06-20',
      lines: [{ item_id: ITEM_ID, qty: '10', uom: 'kg' }],
    });

    expect(result).toEqual({
      ok: false,
      error: 'invalid_input',
      message: 'Customer is inactive or not found',
    });
    expect(insertedSo).toBeNull();
    expect(insertedLines).toEqual([]);
    expect(queryLog.some((entry) => normalize(entry.sql).includes('from public.customers'))).toBe(true);
    expect(queryLog.some((entry) => normalize(entry.sql).includes('insert into public.sales_orders'))).toBe(false);
  });

  it('rejects SO creation for a soft-deleted customer', async () => {
    customerDeleted = true;

    const result = await createSalesOrder({
      client_op_id: CLIENT_OP_ID,
      customer_id: CUSTOMER_ID,
      requested_date: '2026-06-20',
      lines: [{ item_id: ITEM_ID, qty: '10', uom: 'kg' }],
    });

    expect(result).toEqual({
      ok: false,
      error: 'invalid_input',
      message: 'Customer is inactive or not found',
    });
    expect(insertedSo).toBeNull();
  });

  it('rejects SO creation when a line UoM is not in the org unit registry', async () => {
    const result = await createSalesOrder({
      client_op_id: CLIENT_OP_ID,
      customer_id: CUSTOMER_ID,
      requested_date: '2026-06-20',
      lines: [{ item_id: ITEM_ID, qty: '10', uom: 'bogus-unit' }],
    });

    expect(result).toEqual({
      ok: false,
      error: 'invalid_input',
      message: 'Unknown unit of measure',
    });
    expect(insertedSo).toBeNull();
    expect(insertedLines).toHaveLength(0);
  });

  it('rejects SO creation when the org unit registry is empty', async () => {
    orgUnitCodes = [];

    const result = await createSalesOrder({
      client_op_id: CLIENT_OP_ID,
      customer_id: CUSTOMER_ID,
      requested_date: '2026-06-20',
      lines: [{ item_id: ITEM_ID, qty: '10', uom: 'bogus-unit' }],
    });

    expect(result).toEqual({
      ok: false,
      error: 'persistence_failed',
      message: 'Unit of measure registry is not configured; seed units before creating sales orders',
    });
    expect(insertedSo).toBeNull();
    expect(insertedLines).toHaveLength(0);
    expect(queryLog.some((entry) => normalize(entry.sql).includes('insert into public.sales_orders'))).toBe(false);
  });

  it('rejects SO creation when a line references an unknown item without inserting a header', async () => {
    const UNKNOWN_ITEM_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const baseQuery = client.query;
    client.query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);
      if (q.startsWith('select id::text, list_price_gbp::text as list_price_gbp')) {
        return { rows: [{ id: ITEM_ID, list_price_gbp: listPriceGbp }], rowCount: 1 };
      }
      return baseQuery(sql, params);
    }) as typeof client.query;

    const result = await createSalesOrder({
      client_op_id: CLIENT_OP_ID,
      customer_id: CUSTOMER_ID,
      requested_date: '2026-06-20',
      lines: [
        { item_id: ITEM_ID, qty: '10', uom: 'kg' },
        { item_id: UNKNOWN_ITEM_ID, qty: '5', uom: 'kg' },
      ],
    });

    expect(result).toEqual({
      ok: false,
      error: 'invalid_input',
      message: 'Unknown sales order item',
    });
    expect(insertedSo).toBeNull();
    expect(insertedLines).toEqual([]);
    expect(queryLog.some((entry) => normalize(entry.sql).includes('insert into public.sales_orders'))).toBe(false);
    expect(queryLog.some((entry) => normalize(entry.sql).includes('insert into public.sales_order_lines'))).toBe(false);
  });

  it('rejects create without a client_op_id before any insert', async () => {
    const result = await createSalesOrder({
      client_op_id: '',
      customer_id: CUSTOMER_ID,
      lines: [{ item_id: ITEM_ID, qty: '10', uom: 'kg' }],
    });

    expect(result).toEqual({ ok: false, error: 'invalid_input', message: 'client_op_id must be a UUID' });
    expect(soInsertCount).toBe(0);
  });

  it('replays the same client_op_id + payload without inserting a second sales order', async () => {
    const payload = {
      client_op_id: CLIENT_OP_ID,
      customer_id: CUSTOMER_ID,
      requested_date: '2026-06-20',
      notes: 'deliver am',
      lines: [{ item_id: ITEM_ID, qty: '10', uom: 'kg' }],
    };

    const first = await createSalesOrder(payload);
    const second = await createSalesOrder(payload);

    expect(first).toMatchObject({ ok: true, data: { so_number: 'SO-202606-00001' } });
    expect(second).toMatchObject({ ok: true, data: { so_number: 'SO-202606-00001' } });
    expect(soInsertCount).toBe(1);
    expect(
      queryLog.filter((entry) => normalize(entry.sql).startsWith('insert into public.sales_orders')),
    ).toHaveLength(1);
  });

  it('creates only one sales order when duplicate requests run concurrently', async () => {
    const payload = {
      client_op_id: CLIENT_OP_ID,
      customer_id: CUSTOMER_ID,
      requested_date: '2026-06-20',
      lines: [{ item_id: ITEM_ID, qty: '10', uom: 'kg' }],
    };

    const [first, second] = await Promise.all([createSalesOrder(payload), createSalesOrder(payload)]);

    expect(first).toMatchObject({ ok: true, data: { so_number: 'SO-202606-00001' } });
    expect(second).toMatchObject({ ok: true, data: { so_number: 'SO-202606-00001' } });
    expect(soInsertCount).toBe(1);
    expect(
      queryLog.filter((entry) => normalize(entry.sql).startsWith('insert into public.sales_orders')),
    ).toHaveLength(1);
  });

  it('rejects a payload change under the same client_op_id', async () => {
    await createSalesOrder({
      client_op_id: CLIENT_OP_ID,
      customer_id: CUSTOMER_ID,
      lines: [{ item_id: ITEM_ID, qty: '10', uom: 'kg' }],
    });

    const result = await createSalesOrder({
      client_op_id: CLIENT_OP_ID,
      customer_id: CUSTOMER_ID,
      lines: [{ item_id: ITEM_ID, qty: '11', uom: 'kg' }],
    });

    expect(result).toEqual({
      ok: false,
      error: 'invalid_input',
      message: 'Idempotency key was reused with a different sales order payload',
    });
    expect(soInsertCount).toBe(1);
  });
});

describe('transitionSalesOrderStatus', () => {
  it('allows a legal draft to confirmed transition', async () => {
    const result = await transitionSalesOrderStatus(SO_ID, 'confirmed');

    expect(status).toBe('confirmed');
    expect(result).toMatchObject({ ok: true, data: { id: SO_ID, status: 'confirmed' } });
  });

  it('keeps an unpriced SO in draft and names the blocking unit-price field', async () => {
    lineUnitPriceGbp = '0.0000';

    const result = await transitionSalesOrderStatus(SO_ID, 'confirmed');

    expect(result).toEqual({ ok: false, error: 'so_unit_price_required' });
    expect(status).toBe('draft');
  });

  it('keeps an empty SO in draft and names the missing-lines field', async () => {
    hasSalesOrderLine = false;

    const result = await transitionSalesOrderStatus(SO_ID, 'confirmed');

    expect(result).toEqual({ ok: false, error: 'so_lines_required' });
    expect(status).toBe('draft');
  });

  it('returns ILLEGAL_TRANSITION for an invalid transition', async () => {
    const result = await transitionSalesOrderStatus(SO_ID, 'shipped');

    expect(result).toEqual({ ok: false, error: 'ILLEGAL_TRANSITION', from: 'draft', to: 'shipped' });
    expect(status).toBe('draft');
  });

  it('rejects shipped to allocated so shipped stock cannot be reallocated', async () => {
    status = 'shipped';

    const result = await transitionSalesOrderStatus(SO_ID, 'allocated');

    expect(result).toEqual({ ok: false, error: 'ILLEGAL_TRANSITION', from: 'shipped', to: 'allocated' });
    expect(status).toBe('shipped');
  });

  it('rejects shipped to confirmed through the public SO transition action', async () => {
    status = 'shipped';

    const result = await transitionSalesOrderStatus(SO_ID, 'confirmed');

    expect(result).toEqual({ ok: false, error: 'ILLEGAL_TRANSITION', from: 'shipped', to: 'confirmed' });
    expect(status).toBe('shipped');
  });

  it('allows shipped to delivered as the forward closeout transition', async () => {
    status = 'shipped';

    const result = await transitionSalesOrderStatus(SO_ID, 'delivered');

    expect(status).toBe('delivered');
    expect(result).toMatchObject({ ok: true, data: { id: SO_ID, status: 'delivered' } });
  });

  it('rejects delivered to shipped regression via the public transition action', async () => {
    status = 'delivered';

    const result = await transitionSalesOrderStatus(SO_ID, 'shipped');

    expect(result).toEqual({ ok: false, error: 'ILLEGAL_TRANSITION', from: 'delivered', to: 'shipped' });
    expect(status).toBe('delivered');
  });

  it('blocks cancel when a shipped shipment exists on the SO', async () => {
    status = 'packed';
    const baseQuery = client.query;
    client.query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);
      if (q.includes('status = any($2::text[])')) {
        return { rows: [{ id: 'shipment-shipped' }], rowCount: 1 };
      }
      return baseQuery(sql, params);
    }) as typeof client.query;

    const result = await transitionSalesOrderStatus(SO_ID, 'cancelled');

    expect(result).toEqual({ ok: false, error: 'so_cancel_blocked_shipped' });
    expect(status).toBe('packed');
  });
});

describe('allocateSalesOrder', () => {
  it('WH-051 rejects WO +1 after the SO reserves all 100, and allows the exact remaining quantity', async () => {
    status = 'confirmed';
    lineQuantityOrdered = '100';
    candidateRows = [{ lp_id: LP_1, available_qty: '100' }];

    const allocated = await allocateSalesOrder(SO_ID);

    expect(allocated).toMatchObject({ ok: true });
    expect(lpReserved).toEqual({ [LP_1]: '100' });
    await expect(reserveLp(LP_1, WO_ID, '1')).resolves.toEqual({
      ok: false,
      reason: 'error',
      message: 'qty_exceeds_available',
    });

    lpReserved[LP_1] = '99';
    const exactFit = await reserveLp(LP_1, WO_ID, '1');
    expect(exactFit).toMatchObject({ ok: true, data: { reservedQty: '100', availableQty: '0' } });
  });

  it('allocates greedily across two FEFO LPs and marks the SO allocated', async () => {
    status = 'confirmed';
    candidateRows = [
      { lp_id: LP_1, available_qty: '6' },
      { lp_id: LP_2, available_qty: '10' },
    ];

    const result = await allocateSalesOrder(SO_ID);

    expect(result).toMatchObject({ ok: true, data: { id: SO_ID, status: 'allocated' } });
    expect(allocationRows).toEqual([
      { sales_order_line_id: LINE_ID, lp_id: LP_1, qty: '6', status: 'allocated' },
      { sales_order_line_id: LINE_ID, lp_id: LP_2, qty: '4', status: 'allocated' },
    ]);
    expect(lpReserved).toEqual({ [LP_1]: '6', [LP_2]: '4' });
    expect(lineAllocatedQty).toBe('10');
  });

  it('allocates 36 inventory units when the order line is 3 cases with each_per_box=12', async () => {
    status = 'confirmed';
    lineProductId = ITEM_ID_2;
    lineQuantityOrdered = '36';
    lineOrderQty = '3';
    lineOrderUom = 'case';
    candidateRows = [{ lp_id: LP_1, available_qty: '40' }];

    const result = await allocateSalesOrder(SO_ID);

    expect(result).toMatchObject({ ok: true, data: { id: SO_ID, status: 'allocated' } });
    expect(allocationRows).toEqual([
      { sales_order_line_id: LINE_ID, lp_id: LP_1, qty: '36', status: 'allocated' },
    ]);
    expect(lineAllocatedQty).toBe('36');
  });

  it('returns unresolved_uom when pack hierarchy cannot convert the entered order UoM', async () => {
    status = 'confirmed';
    lineProductId = ITEM_ID;
    lineQuantityOrdered = '3';
    lineOrderQty = '3';
    lineOrderUom = 'case';

    const result = await allocateSalesOrder(SO_ID);

    expect(result).toMatchObject({ ok: false, error: 'unresolved_uom', uom: 'case' });
    expect(allocationRows).toEqual([]);
  });

  it('returns INSUFFICIENT_STOCK without writing allocations when stock is short', async () => {
    status = 'confirmed';
    candidateRows = [{ lp_id: LP_1, available_qty: '3.5' }];

    const result = await allocateSalesOrder(SO_ID);

    expect(result).toEqual({ ok: false, error: 'INSUFFICIENT_STOCK', item_id: ITEM_ID, needed: '10', available: '3.5' });
    expect(allocationRows).toEqual([]);
    expect(lineAllocatedQty).toBe('0');
    expect(
      queryLog.some((entry) => {
        const sql = normalize(entry.sql);
        return sql.startsWith('insert into public.inventory_allocations') || sql.startsWith('update public.license_plates');
      }),
    ).toBe(false);
  });

  it('excludes expired LPs in the allocation candidate query', async () => {
    status = 'confirmed';
    candidateRows = [{ lp_id: LP_1, available_qty: '10' }];

    await allocateSalesOrder(SO_ID);

    const candidateQuery = queryLog.find(({ sql }) => normalize(sql).startsWith('select lp.id::text as lp_id'))?.sql;
    expect(normalize(String(candidateQuery))).toContain(
      'and (lp.expiry_date is null or lp.expiry_date >= current_date)',
    );
  });

  it('excludes LPs on an active quality hold via v_active_holds (G-QA-07)', async () => {
    status = 'confirmed';
    candidateRows = [{ lp_id: LP_1, available_qty: '10' }];

    await allocateSalesOrder(SO_ID);

    const candidateQuery = queryLog.find(({ sql }) => normalize(sql).startsWith('select lp.id::text as lp_id'))?.sql;
    const normalized = normalize(String(candidateQuery));
    // reads the canonical SECURITY INVOKER v_active_holds view (T-064), keyed on
    // the polymorphic (reference_type='lp', reference_id) model — NOT quality_holds
    expect(normalized).toContain('not exists');
    expect(normalized).toContain('from public.v_active_holds h');
    expect(normalized).toContain("h.reference_type = 'lp'");
    expect(normalized).toContain('h.reference_id = lp.id');
    // never read the underlying quality_holds table directly — T-064 mandates
    // the v_active_holds seam (comments may mention the name; queries must not).
    expect(normalized).not.toContain('from public.quality_holds');
  });

  it('filters allocation candidates to the sales order line site when one is set', async () => {
    status = 'confirmed';
    lineSiteId = SITE_ID;
    candidateRows = [{ lp_id: LP_1, available_qty: '10' }];

    await allocateSalesOrder(SO_ID);

    const candidateQuery = queryLog.find(({ sql }) => normalize(sql).startsWith('select lp.id::text as lp_id'));
    expect(normalize(String(candidateQuery?.sql))).toContain('and ($2::uuid is null or lp.site_id = $2::uuid)');
    expect(candidateQuery?.params).toEqual([ITEM_ID, SITE_ID, 'kg']);
  });

  it('filters allocation candidates to the item inventory UoM', async () => {
    status = 'confirmed';
    lineSiteId = SITE_ID;
    candidateRows = [{ lp_id: LP_1, available_qty: '10' }];

    await allocateSalesOrder(SO_ID);

    const candidateQuery = queryLog.find(({ sql }) => normalize(sql).startsWith('select lp.id::text as lp_id'));
    const normalized = normalize(String(candidateQuery?.sql));
    expect(normalized).toContain('lower(lp.uom) = lower($3::text)');
    expect(normalized).toContain("lower(lp.uom) in ('each', 'ea', 'pcs', 'szt')");
    expect(candidateQuery?.params).toEqual([ITEM_ID, SITE_ID, 'kg']);
  });

  it('does NOT allocate when the only candidate LP is held (held LP never returned) — G-QA-07', async () => {
    // The DB excludes held LPs at the query level, so a held-only product
    // surfaces ZERO candidates → INSUFFICIENT_STOCK, never an allocation.
    status = 'confirmed';
    candidateRows = [];

    const result = await allocateSalesOrder(SO_ID);

    expect(result).toMatchObject({ ok: false, error: 'INSUFFICIENT_STOCK' });
    expect(allocationRows).toEqual([]);
    expect(
      queryLog.some((entry) => normalize(entry.sql).startsWith('insert into public.inventory_allocations')),
    ).toBe(false);
  });

  it('emits a soft near-expiry warning when an allocated LP expires within the warn window', async () => {
    // warn window 7 days; LP expires in 3 days → WARN fires but allocation still happens.
    status = 'confirmed';
    nearExpiryWarnDays = '7';
    candidateRows = [{ lp_id: LP_1, available_qty: '10', expiry_date: '2026-06-21', days_to_expiry: 3 }];

    const result = await allocateSalesOrder(SO_ID);

    expect(result).toMatchObject({ ok: true, data: { id: SO_ID, status: 'allocated' } });
    // It is a WARN, not a block: the allocation was written.
    expect(allocationRows).toEqual([
      { sales_order_line_id: LINE_ID, lp_id: LP_1, qty: '10', status: 'allocated' },
    ]);
    expect((result as { nearExpiryWarning?: unknown }).nearExpiryWarning).toEqual({
      nearExpiry: true,
      reasonCode: 'allocated_lp_near_expiry',
      soonestExpiry: '2026-06-21',
      daysToExpiry: 3,
      warnDays: 7,
      affectedLpCount: 1,
    });
  });

  it('reports the SOONEST expiry and counts every affected leg across multiple near-expiry LPs', async () => {
    status = 'confirmed';
    nearExpiryWarnDays = '7';
    candidateRows = [
      { lp_id: LP_1, available_qty: '6', expiry_date: '2026-06-24', days_to_expiry: 6 },
      { lp_id: LP_2, available_qty: '10', expiry_date: '2026-06-22', days_to_expiry: 4 },
    ];

    const result = await allocateSalesOrder(SO_ID);

    expect(result).toMatchObject({ ok: true });
    expect((result as { nearExpiryWarning?: unknown }).nearExpiryWarning).toMatchObject({
      nearExpiry: true,
      // 6 (LP_1) is taken first, then 4 (LP_2) — soonest is 4 days / 2026-06-22.
      soonestExpiry: '2026-06-22',
      daysToExpiry: 4,
      affectedLpCount: 2,
    });
  });

  it('does NOT warn when the allocated LP expiry is beyond the warn window', async () => {
    status = 'confirmed';
    nearExpiryWarnDays = '7';
    candidateRows = [{ lp_id: LP_1, available_qty: '10', expiry_date: '2026-07-30', days_to_expiry: 42 }];

    const result = await allocateSalesOrder(SO_ID);

    expect(result).toMatchObject({ ok: true, data: { id: SO_ID, status: 'allocated' } });
    expect('nearExpiryWarning' in (result as object)).toBe(false);
  });

  it('does NOT warn for an LP with no expiry date (non-perishable)', async () => {
    status = 'confirmed';
    nearExpiryWarnDays = '7';
    candidateRows = [{ lp_id: LP_1, available_qty: '10', expiry_date: null, days_to_expiry: null }];

    const result = await allocateSalesOrder(SO_ID);

    expect(result).toMatchObject({ ok: true });
    expect('nearExpiryWarning' in (result as object)).toBe(false);
  });

  it('suppresses the near-expiry warning entirely when the window is configured to 0', async () => {
    status = 'confirmed';
    nearExpiryWarnDays = '0';
    candidateRows = [{ lp_id: LP_1, available_qty: '10', expiry_date: '2026-06-21', days_to_expiry: 3 }];

    const result = await allocateSalesOrder(SO_ID);

    expect(result).toMatchObject({ ok: true });
    expect('nearExpiryWarning' in (result as object)).toBe(false);
  });
});

describe('deallocateSalesOrder', () => {
  it('decrements LP reserved qty, resets allocated qty, and deletes allocations', async () => {
    status = 'allocated';
    allocationRows = [
      { sales_order_line_id: LINE_ID, lp_id: LP_1, qty: '6', status: 'allocated' },
      { sales_order_line_id: LINE_ID, lp_id: LP_2, qty: '4', status: 'allocated' },
    ];
    lpReserved = { [LP_1]: '6', [LP_2]: '4' };
    lineAllocatedQty = '10';

    const result = await deallocateSalesOrder(SO_ID);

    expect(result).toEqual({ ok: true, data: null });
    expect(lpReserved).toEqual({ [LP_1]: '0', [LP_2]: '0' });
    expect(lineAllocatedQty).toBe('0');
    expect(allocationRows).toEqual([
      { sales_order_line_id: LINE_ID, lp_id: LP_1, qty: '6', status: 'released' },
      { sales_order_line_id: LINE_ID, lp_id: LP_2, qty: '4', status: 'released' },
    ]);
    expect(queryLog.some((entry) => normalize(entry.sql).startsWith('update public.inventory_allocations'))).toBe(true);
  });
});

describe('updateSalesOrder', () => {
  it('rejects a non-draft sales order', async () => {
    status = 'confirmed';
    const result = await updateSalesOrder(SO_ID, { notes: 'updated' });
    expect(result).toEqual({ ok: false, error: 'not_draft' });
  });

  it('updates draft header fields and recomputes line totals while keeping unit price > 0', async () => {
    status = 'draft';
    lineOrderQty = '10';
    const result = await updateSalesOrder(SO_ID, {
      requiredDate: '2026-08-01',
      notes: 'rush order',
      lines: [{ id: LINE_ID, qty: '5', notes: 'half case', unit_price_gbp: '8.0000' }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data?.notes).toBe('rush order');
      expect(result.data?.lines[0]?.qty).toBe('5');
      expect(result.data?.lines[0]?.unit_price_gbp).toBe('8.0000');
      expect(result.data?.lines[0]?.line_total_gbp).toBe('40');
    }
    expect(
      queryLog.some((entry) =>
        normalize(entry.sql).includes(
          'line_total_gbp = ($7::numeric * $3::numeric * (1 - $4::numeric / 100) * (1 + $5::numeric / 100))',
        ),
      ),
    ).toBe(true);
    const headerUpdate = queryLog.find(
      (entry) =>
        normalize(entry.sql).startsWith('update public.sales_orders') &&
        normalize(entry.sql).includes('promised_ship_date ='),
    );
    expect(headerUpdate).toBeDefined();
    expect(insertedSo).toMatchObject({ promised_ship_date: '2026-08-01', notes: 'rush order' });
    const totalUpdate = queryLog.find(
      (entry) =>
        normalize(entry.sql).startsWith('update public.sales_orders so') &&
        normalize(entry.sql).includes('set total_amount_gbp'),
    );
    expect(normalize(totalUpdate?.sql ?? '')).toContain('count(*) filter');
    expect(normalize(totalUpdate?.sql ?? '')).toContain("<> 'gbp'");
  });

  it('rejects an explicit non-GBP currency before updating a draft', async () => {
    const result = await updateSalesOrder(SO_ID, {
      lines: [{ id: LINE_ID, currency: 'EUR' }],
    });

    expect(result).toEqual({
      ok: false,
      error: 'invalid_input',
      message: 'Sales order lines must use GBP',
    });
    expect(queryLog).toEqual([]);
  });

  it('updates an unpriced draft line without forcing a positive price', async () => {
    lineUnitPriceGbp = '0.0000';

    const result = await updateSalesOrder(SO_ID, {
      lines: [{ id: LINE_ID, qty: '4', notes: 'sample line' }],
    });

    expect(result).toMatchObject({ ok: true, data: { id: SO_ID, status: 'draft' } });
    expect(lineUnitPriceGbp).toBe('0.0000');
    expect(lineNotes).toBe('sample line');
  });

  it('leaves the sales order unchanged when a later line patch is invalid', async () => {
    status = 'draft';
    lineOrderQty = '10';
    lineQuantityOrdered = '10';
    lineUnitPriceGbp = '7.2500';
    lineUpdateCallCount = 0;

    const result = await updateSalesOrder(SO_ID, {
      notes: 'should not persist',
      lines: [
        { id: LINE_ID, qty: '5', unit_price_gbp: '8.0000' },
        { id: UNKNOWN_LINE_ID, qty: '1', unit_price_gbp: '1.0000' },
      ],
    });

    expect(result).toEqual({ ok: false, error: 'invalid_input', message: 'Unknown sales order line' });
    expect(lineUpdateCallCount).toBe(0);
    expect(lineOrderQty).toBe('10');
    expect(lineQuantityOrdered).toBe('10');
    expect(lineUnitPriceGbp).toBe('7.2500');
    expect(insertedSo?.notes).not.toBe('should not persist');
  });

  it('persists explicit null clears for promised date, header notes, and line notes', async () => {
    status = 'draft';
    insertedSo = { promised_ship_date: '2026-08-01', notes: 'rush order' };
    lineNotes = 'half case';

    const result = await updateSalesOrder(SO_ID, {
      requiredDate: null,
      notes: null,
      lines: [{ id: LINE_ID, qty: '5', notes: null, unit_price_gbp: '8.0000' }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data?.expected_ship_date).toBeNull();
      expect(result.data?.notes).toBeNull();
      expect(result.data?.lines[0]?.notes).toBeNull();
    }
    expect(insertedSo).toMatchObject({ promised_ship_date: null, notes: null });
    expect(lineNotes).toBeNull();
  });
});

describe('deleteSalesOrder', () => {
  it('rejects deleting a non-draft sales order', async () => {
    status = 'confirmed';
    const result = await deleteSalesOrder(SO_ID);
    expect(result).toEqual({ ok: false, error: 'not_draft' });
  });

  it('soft-deletes a draft sales order and its lines', async () => {
    status = 'draft';
    const result = await deleteSalesOrder(SO_ID);
    expect(result).toEqual({ ok: true, data: null });
    expect(queryLog.some((entry) => normalize(entry.sql).includes('update public.sales_order_lines') && normalize(entry.sql).includes('deleted_at'))).toBe(true);
    expect(queryLog.some((entry) => normalize(entry.sql).includes('update public.sales_orders') && normalize(entry.sql).includes('deleted_at'))).toBe(true);
  });

  it('releases live allocations before soft-deleting a draft sales order', async () => {
    status = 'draft';
    allocationRows = [{ sales_order_line_id: LINE_ID, lp_id: LP_1, qty: '6', status: 'allocated' }];
    lpReserved = { [LP_1]: '6' };

    const result = await deleteSalesOrder(SO_ID);

    expect(result).toEqual({ ok: true, data: null });
    expect(lpReserved).toEqual({ [LP_1]: '0' });
    expect(allocationRows).toEqual([{ sales_order_line_id: LINE_ID, lp_id: LP_1, qty: '6', status: 'released' }]);
    const lineDeleteIdx = queryLog.findIndex(
      (entry) => normalize(entry.sql).includes('update public.sales_order_lines') && normalize(entry.sql).includes('deleted_at'),
    );
    const releaseIdx = queryLog.findIndex((entry) => normalize(entry.sql).includes('update public.inventory_allocations'));
    expect(releaseIdx).toBeGreaterThanOrEqual(0);
    expect(lineDeleteIdx).toBeGreaterThan(releaseIdx);
  });
});

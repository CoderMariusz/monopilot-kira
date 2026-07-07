import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  allocateSalesOrder,
  createSalesOrder,
  deallocateSalesOrder,
  getSalesOrder,
  listSalesOrders,
  transitionSalesOrderStatus,
} from '../so-actions';

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
const ITEM_ID = '66666666-6666-4666-8666-666666666666';
const ITEM_ID_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LP_1 = '77777777-7777-4777-8777-777777777777';
const LP_2 = '88888888-8888-4888-8888-888888888888';
const SITE_ID = '99999999-9999-4999-8999-999999999999';

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
let candidateRows: Array<{
  lp_id: string;
  available_qty: string;
  expiry_date?: string | null;
  days_to_expiry?: number | null;
}> = [];
let nearExpiryWarnDays: string = '7';
let customerActive = true;
let customerDeleted = false;
let queryLog: Array<{ sql: string; params: readonly unknown[] }> = [];
const nextCacheMocks = vi.hoisted(() => ({ revalidateLocalized: vi.fn() }));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));
vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => nextCacheMocks);

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

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      queryLog.push({ sql, params });
      const q = normalize(sql);

      if (q.includes('from public.user_roles')) {
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }
      if (q.includes('next_sales_order_document_number')) {
        return { rows: [{ so_number: soNumber }], rowCount: 1 };
      }
      if (q.startsWith('select id::text') && q.includes('from public.customers')) {
        if (!customerActive || customerDeleted) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [{ id: CUSTOMER_ID }], rowCount: 1 };
      }
      if (q.startsWith('insert into public.sales_orders')) {
        insertedSo = {
          id: SO_ID,
          order_number: params[1],
          customer_id: params[2],
          promised_ship_date: params[3],
          notes: params[4],
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
        const filtered = customerPriceRows.filter((row) => row.currency === targetCurrency);
        return { rows: filtered, rowCount: filtered.length };
      }
      if (q.startsWith('insert into public.sales_order_lines')) {
        const quantityOrdered = params[4] as string;
        const unitPriceGbp = params[5] as string;
        insertedLines.push({
          sales_order_id: params[1],
          line_number: params[2],
          product_id: params[3],
          quantity_ordered: quantityOrdered,
          unit_price_gbp: unitPriceGbp,
          line_total_gbp: `${Number(quantityOrdered) * Number(unitPriceGbp)}`,
          ext_data: { order_uom: params[6] },
        });
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('select so.id::text') && q.includes('line_count')) {
        return {
          rows: [
            {
              id: SO_ID,
              so_number: insertedSo?.order_number ?? soNumber,
              status,
              customer_name: 'Acme Foods',
              customer_code: 'ACME',
              line_count: '1',
              total: '10.0000',
              created_at: '2026-06-11T10:00:00.000Z',
              expected_ship_date: insertedSo?.promised_ship_date ?? '2026-06-20',
            },
          ],
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
              promised_ship_date: insertedSo?.promised_ship_date ?? '2026-06-20',
              notes: insertedSo?.notes ?? 'deliver am',
              created_at: '2026-06-11T10:00:00.000Z',
              updated_at: '2026-06-11T10:00:00.000Z',
            },
          ],
          rowCount: 1,
        };
      }
      if (q.startsWith('select sol.id::text')) {
        return {
          rows: [
            {
              id: LINE_ID,
              line_number: 1,
              product_id: ITEM_ID,
              item_code: 'FG-001',
              item_name: 'Finished Good 001',
              quantity_ordered: '10',
              uom: 'kg',
              quantity_allocated: lineAllocatedQty,
            },
          ],
          rowCount: 1,
        };
      }
      if (q.startsWith('select status from public.sales_orders')) {
        return { rows: [{ status }], rowCount: 1 };
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
      if (q.startsWith('select id::text, site_id::text')) {
        return { rows: [{ id: LINE_ID, site_id: lineSiteId, product_id: ITEM_ID, quantity_ordered: '10' }], rowCount: 1 };
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
  candidateRows = [];
  nearExpiryWarnDays = '7';
  customerActive = true;
  customerDeleted = false;
  queryLog = [];
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
      data: [
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
    });
    expect(queryLog.some((entry) => normalize(entry.sql).includes('left join public.customers'))).toBe(true);
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
            allocated_qty: '4',
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
        ext_data: { order_uom: 'kg' },
      },
    ]);
    expect(nextCacheMocks.revalidateLocalized).toHaveBeenCalledWith('/shipping');
  });

  it('creates one header and both lines when two valid lines are submitted', async () => {
    const result = await createSalesOrder({
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
        ext_data: { order_uom: 'kg' },
      },
      {
        sales_order_id: SO_ID,
        line_number: 2,
        product_id: ITEM_ID_2,
        quantity_ordered: '5',
        unit_price_gbp: '7.2500',
        line_total_gbp: '36.25',
        ext_data: { order_uom: 'case' },
      },
    ]);
  });

  it('uses item list_price_gbp for unit_price_gbp and line_total_gbp', async () => {
    listPriceGbp = '2.5000';

    await createSalesOrder({
      customer_id: CUSTOMER_ID,
      requested_date: '2026-06-20',
      lines: [{ item_id: ITEM_ID, qty: '3', uom: 'case' }],
    });

    expect(insertedLines[0]).toMatchObject({
      unit_price_gbp: '2.5000',
      ext_data: { order_uom: 'case' },
    });
  });

  it('preserves high-precision list_price_gbp through to SQL params', async () => {
    listPriceGbp = '12.3456789';

    await createSalesOrder({
      customer_id: CUSTOMER_ID,
      requested_date: '2026-06-20',
      lines: [{ item_id: ITEM_ID, qty: '1', uom: 'kg' }],
    });

    expect(insertedLines[0]?.unit_price_gbp).toBe('12.3456789');
    const lineInsert = queryLog.find((entry) => normalize(entry.sql).startsWith('insert into public.sales_order_lines'));
    expect(lineInsert?.params?.[5]).toBe('12.3456789');
  });

  it('uses active GBP customer_item_prices over list price', async () => {
    listPriceGbp = '10.0000';
    customerPriceRows = [{ item_id: ITEM_ID, unit_price: '6.5000', currency: 'GBP' }];

    await createSalesOrder({
      customer_id: CUSTOMER_ID,
      requested_date: '2026-06-20',
      lines: [{ item_id: ITEM_ID, qty: '4', uom: 'kg' }],
    });

    expect(insertedLines[0]).toMatchObject({
      unit_price_gbp: '6.5000',
      ext_data: { order_uom: 'kg' },
    });
    expect(queryLog.some((entry) => normalize(entry.sql).includes('from public.customer_item_prices'))).toBe(true);
  });

  it('ignores non-GBP customer price and uses list price', async () => {
    listPriceGbp = '3.0000';
    customerPriceRows = [{ item_id: ITEM_ID, unit_price: '1.0000', currency: 'EUR' }];

    await createSalesOrder({
      customer_id: CUSTOMER_ID,
      requested_date: '2026-06-20',
      lines: [{ item_id: ITEM_ID, qty: '2', uom: 'kg' }],
    });

    expect(insertedLines[0]).toMatchObject({
      unit_price_gbp: '3.0000',
      ext_data: { order_uom: 'kg' },
    });
  });

  it('uses zero unit_price_gbp when item list_price_gbp is null', async () => {
    listPriceGbp = null;

    await createSalesOrder({
      customer_id: CUSTOMER_ID,
      requested_date: '2026-06-20',
      lines: [{ item_id: ITEM_ID, qty: '3', uom: 'kg' }],
    });

    expect(insertedLines[0]).toMatchObject({
      unit_price_gbp: '0',
    });
  });

  it('rejects SO creation for an inactive customer', async () => {
    customerActive = false;

    const result = await createSalesOrder({
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
});

describe('transitionSalesOrderStatus', () => {
  it('allows a legal draft to confirmed transition', async () => {
    const result = await transitionSalesOrderStatus(SO_ID, 'confirmed');

    expect(status).toBe('confirmed');
    expect(result).toMatchObject({ ok: true, data: { id: SO_ID, status: 'confirmed' } });
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
    expect(candidateQuery?.params).toEqual([ITEM_ID, SITE_ID]);
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

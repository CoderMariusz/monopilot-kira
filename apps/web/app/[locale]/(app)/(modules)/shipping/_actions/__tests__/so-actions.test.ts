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
const LP_1 = '77777777-7777-4777-8777-777777777777';
const LP_2 = '88888888-8888-4888-8888-888888888888';

let client: QueryClient;
let allowPermission = true;
let status = 'draft';
let soNumber = 'SO-202606-00001';
let insertedSo: Record<string, unknown> | null = null;
let insertedLines: Array<Record<string, unknown>> = [];
let listPriceGbp: string | null = '7.2500';
let allocationRows: Array<{ sales_order_line_id: string; lp_id: string; qty: string; status: string }> = [];
let lpReserved: Record<string, string> = {};
let lineAllocatedQty = '0';
let candidateRows: Array<{ lp_id: string; available_qty: string }> = [];
let queryLog: Array<{ sql: string; params: readonly unknown[] }> = [];

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
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
        return { rows: [{ id: ITEM_ID, list_price_gbp: listPriceGbp }], rowCount: 1 };
      }
      if (q.startsWith('insert into public.sales_order_lines')) {
        const quantityOrdered = params[4] as string;
        const unitPriceGbp = params[5] as number;
        insertedLines.push({
          sales_order_id: params[1],
          line_number: params[2],
          product_id: params[3],
          quantity_ordered: quantityOrdered,
          unit_price_gbp: unitPriceGbp,
          line_total_gbp: Number(quantityOrdered) * unitPriceGbp,
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
        return { rows: [{ id: LINE_ID, site_id: null, product_id: ITEM_ID, quantity_ordered: '10' }], rowCount: 1 };
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
  allocationRows = [];
  lpReserved = {};
  lineAllocatedQty = '0';
  candidateRows = [];
  queryLog = [];
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
        unit_price_gbp: 7.25,
        line_total_gbp: 72.5,
        ext_data: { order_uom: 'kg' },
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
      unit_price_gbp: 2.5,
      line_total_gbp: 7.5,
      ext_data: { order_uom: 'case' },
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
      unit_price_gbp: 0,
      line_total_gbp: 0,
    });
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
});

describe('deallocateSalesOrder', () => {
  it('decrements LP reserved qty, resets allocated qty, and deletes allocations', async () => {
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

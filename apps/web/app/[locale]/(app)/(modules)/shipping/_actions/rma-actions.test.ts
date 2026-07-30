import { beforeEach, describe, expect, it, vi } from 'vitest';

import { approveRma, createRma, listRmas } from './rma-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';
const SO_ID = '44444444-4444-4444-8444-444444444444';
const SO_LINE_ID = '55555555-5555-4555-8555-555555555555';
const RMA_ID = '66666666-6666-4666-8666-666666666666';
const PRODUCT_ID = '77777777-7777-4777-8777-777777777777';

let client: QueryClient;
let queryLog: Array<{ sql: string; params: readonly unknown[] }> = [];
let hasPermission = true;
let reasonExists = true;
let rmaStatus = 'pending';
let detailExists = true;
let transactionOutcome: 'commit' | 'rollback' | null = null;

const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock('../../../../../../lib/i18n/revalidate-localized', () => ({ revalidateLocalized: revalidatePath }));

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) => {
    try {
      const result = await action({ userId: USER_ID, orgId: ORG_ID, client });
      transactionOutcome = 'commit';
      return result;
    } catch (err) {
      transactionOutcome = 'rollback';
      throw err;
    }
  }),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function rmaRow(over: Record<string, unknown> = {}) {
  return {
    id: RMA_ID,
    rma_number: 'RMA-2026-00001',
    customer_id: CUSTOMER_ID,
    customer_name: 'Acme',
    customer_code: 'CUST-2026-00001',
    sales_order_id: null,
    sales_order_number: null,
    shipment_id: null,
    reason_code: 'defective',
    reason_label: 'Defective',
    status: rmaStatus,
    total_value_gbp: '10.00',
    disposition: null,
    notes: null,
    approved_at: null,
    received_at: null,
    processed_at: null,
    closed_at: null,
    created_at: '2026-07-16T10:00:00.000Z',
    line_count: 1,
    ...over,
  };
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      queryLog.push({ sql, params });
      const q = normalize(sql);

      if (q.includes('from public.user_roles')) {
        return hasPermission ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (q.includes('from public.rma_reason_codes') && q.includes('select true as ok')) {
        return reasonExists ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (q.includes('from public.customers') && q.includes('select id::text')) {
        return { rows: [{ id: CUSTOMER_ID }], rowCount: 1 };
      }
      if (q.includes('from public.sales_orders') && q.includes('select customer_id::text')) {
        return { rows: [{ customer_id: CUSTOMER_ID }], rowCount: 1 };
      }
      if (q.startsWith('insert into public.rma_requests')) {
        return { rows: [{ id: RMA_ID }], rowCount: 1 };
      }
      if (q.includes('sol.line_total_gbp / nullif(sol.quantity_ordered, 0)')) {
        return { rows: [{ product_id: PRODUCT_ID, effective_unit_price: '5.0000' }], rowCount: 1 };
      }
      if (q.startsWith('insert into public.rma_lines')) {
        return { rows: [], rowCount: 1 };
      }
      if (q.includes('set total_value_gbp')) {
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('insert into public.audit_events')) {
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('insert into public.outbox_events')) {
        return { rows: [], rowCount: 1 };
      }
      if (q.includes('from public.rma_requests r') && q.includes('join public.customers c')) {
        if (q.includes('order by r.created_at desc')) {
          return { rows: [rmaRow()], rowCount: 1 };
        }
        if (q.includes('limit 1')) {
          return detailExists ? { rows: [rmaRow()], rowCount: 1 } : { rows: [], rowCount: 0 };
        }
      }
      if (q.startsWith('select') && q.includes('from public.rma_lines rl') && q.includes('where rl.org_id')) {
        return {
          rows: [
            {
              id: '88888888-8888-4888-8888-888888888888',
              product_id: PRODUCT_ID,
              product_code: 'FG-001',
              product_name: 'Sample FG',
              quantity_expected: '1.000',
              quantity_received: '0.000',
              lot_number: null,
              reason_notes: null,
              disposition: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (q.startsWith('update public.rma_requests') && q.includes("status = 'approved'")) {
        rmaStatus = 'approved';
        return { rows: [{ id: RMA_ID, status: 'approved' }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

beforeEach(() => {
  queryLog = [];
  hasPermission = true;
  reasonExists = true;
  rmaStatus = 'pending';
  detailExists = true;
  transactionOutcome = null;
  client = makeClient();
  revalidatePath.mockClear();
});

describe('createRma', () => {
  it('inserts header + lines and emits shipping.rma.created outbox event', async () => {
    const result = await createRma({
      customerId: CUSTOMER_ID,
      salesOrderId: SO_ID,
      reasonCode: 'defective',
      lines: [{ salesOrderLineId: SO_LINE_ID, quantityExpected: '1' }],
    });
    expect(result.ok).toBe(true);
    expect(queryLog.some((e) => normalize(e.sql).startsWith('insert into public.rma_requests'))).toBe(true);
    expect(queryLog.some((e) => normalize(e.sql).startsWith('insert into public.rma_lines'))).toBe(true);
    expect(
      queryLog.some(
        (e) => normalize(e.sql).startsWith('insert into public.outbox_events') && String(e.params[0]).includes('shipping.rma.created'),
      ),
    ).toBe(true);
  });

  it('prices a linked return from the discounted sales-line total', async () => {
    const result = await createRma({
      customerId: CUSTOMER_ID,
      salesOrderId: SO_ID,
      reasonCode: 'defective',
      lines: [{ salesOrderLineId: SO_LINE_ID, quantityExpected: '2' }],
    });

    expect(result.ok).toBe(true);
    const priceLookup = queryLog.find((entry) => normalize(entry.sql).includes('from public.sales_order_lines sol'));
    expect(normalize(priceLookup?.sql ?? '')).toContain(
      '(sol.line_total_gbp / nullif(sol.quantity_ordered, 0))::text as effective_unit_price',
    );
    expect(normalize(priceLookup?.sql ?? '')).toContain('sol.id = $1::uuid');
    expect(priceLookup?.params).toEqual([SO_LINE_ID, SO_ID]);
    const lineInsert = queryLog.find((entry) => normalize(entry.sql).startsWith('insert into public.rma_lines'));
    expect(lineInsert?.params[1]).toBe(PRODUCT_ID);
    expect(lineInsert?.params[5]).toBe('5.0000');
    const totalUpdate = queryLog.find((entry) => normalize(entry.sql).includes('set total_value_gbp'));
    expect(normalize(totalUpdate?.sql ?? '')).toContain(
      'sum(rl.quantity_expected * coalesce(rl.unit_price_gbp, 0))',
    );
  });

  it('rejects an unlinked return before any price lookup or write', async () => {
    const result = await createRma({
      customerId: CUSTOMER_ID,
      reasonCode: 'defective',
      lines: [{ salesOrderLineId: SO_LINE_ID, quantityExpected: '1' }],
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(queryLog).toEqual([]);
  });

  it('rolls back when the final read fails after the RMA writes', async () => {
    detailExists = false;

    const result = await createRma({
      customerId: CUSTOMER_ID,
      salesOrderId: SO_ID,
      reasonCode: 'defective',
      lines: [{ salesOrderLineId: SO_LINE_ID, quantityExpected: '1' }],
    });

    expect(result).toEqual({ ok: false, error: 'persistence_failed' });
    expect(queryLog.some((entry) => normalize(entry.sql).startsWith('insert into public.rma_requests'))).toBe(true);
    expect(transactionOutcome).toBe('rollback');
  });

  it('rejects unknown reason code', async () => {
    reasonExists = false;
    const result = await createRma({
      customerId: CUSTOMER_ID,
      salesOrderId: SO_ID,
      reasonCode: 'unknown',
      lines: [{ salesOrderLineId: SO_LINE_ID, quantityExpected: '1' }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_input');
  });
});

describe('approveRma', () => {
  it('transitions pending RMA to approved', async () => {
    const result = await approveRma({ rmaId: RMA_ID });
    expect(result.ok).toBe(true);
    expect(queryLog.some((e) => normalize(e.sql).includes("status = 'approved'"))).toBe(true);
  });
});

describe('listRmas', () => {
  it('returns org-scoped RMA rows', async () => {
    const result = await listRmas();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data[0]?.rmaNumber).toBe('RMA-2026-00001');
    expect(normalize(queryLog[0]!.sql)).toContain('app.current_org_id()');
  });
});

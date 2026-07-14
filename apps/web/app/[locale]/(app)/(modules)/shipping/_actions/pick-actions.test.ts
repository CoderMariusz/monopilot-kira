import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QaHoldActiveError } from '@monopilot/server/quality/holdsGuard.js';

import { createPickList, pickLine } from './pick-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SO_ID = '33333333-3333-4333-8333-333333333333';
const PICK_LIST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PICK_LINE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LINE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LP_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OTHER_LP_ID = '99999999-9999-4999-8999-999999999999';
const ALLOCATION_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SITE_ID = '88888888-8888-4888-8888-888888888888';

let client: QueryClient;
let allowPermission = true;
let salesOrderStatus = 'allocated';
let pickListStatus = 'pending';
let lineStatus = 'pending';
let openPickListExists = false;
let allocationExists = true;
let lpBlockedQa = false;
let batchHoldActive = false;
let pendingLineCount = 0;
let qtyExactMatch = true;
let qtyShortPick = false;
let insertedPickLists: Array<Record<string, unknown>> = [];
let insertedPickLines: Array<Record<string, unknown>> = [];
let updatedAllocations: Array<Record<string, unknown>> = [];
let updatedSoStatuses: string[] = [];
let outboxEvents: Array<Record<string, unknown>> = [];
let queryLog: Array<{ sql: string; params: readonly unknown[] }> = [];

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

vi.mock('@monopilot/server/quality/holdsGuard.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@monopilot/server/quality/holdsGuard.js')>();
  return {
    ...actual,
    assertNoActiveHoldForLp: vi.fn(async (lpId: string) => {
      if (batchHoldActive) {
        throw new QaHoldActiveError('HLD-BATCH-001', 'critical', null);
      }
      return actual.assertNoActiveHoldForLp(lpId, {
        query: async () => ({ rows: [], rowCount: 0 }),
      });
    }),
  };
});

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      queryLog.push({ sql, params });
      const q = normalize(sql);

      if (q.includes('from public.user_roles')) {
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }

      if (q.startsWith('select status') && q.includes('from public.sales_orders') && q.includes('for update')) {
        return { rows: [{ status: salesOrderStatus }], rowCount: 1 };
      }

      if (q.startsWith('select id::text') && q.includes('from public.pick_lists') && q.includes('status = any')) {
        return { rows: openPickListExists ? [{ id: PICK_LIST_ID }] : [], rowCount: openPickListExists ? 1 : 0 };
      }

      if (q.startsWith('select site_id::text') && q.includes('from public.sales_orders')) {
        return { rows: [{ site_id: SITE_ID }], rowCount: 1 };
      }

      if (q.includes('from public.inventory_allocations ia') && q.includes("ia.status = 'allocated'") && q.includes('order by sol.line_number')) {
        return {
          rows: allocationExists
            ? [
                {
                  sales_order_line_id: LINE_ID,
                  license_plate_id: LP_ID,
                  product_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
                  lot_number: 'LOT-1',
                  location_id: null,
                  quantity_allocated: '10.000',
                  line_number: 1,
                },
              ]
            : [],
          rowCount: allocationExists ? 1 : 0,
        };
      }

      if (q.startsWith('insert into public.pick_lists')) {
        insertedPickLists.push({
          org_id: params[0],
          site_id: params[1],
          sales_order_id: params[2],
          created_by: params[3],
        });
        return { rows: [{ id: PICK_LIST_ID }], rowCount: 1 };
      }

      if (q.startsWith('insert into public.pick_list_lines')) {
        insertedPickLines.push({
          pick_list_id: params[2],
          sales_order_line_id: params[3],
          license_plate_id: params[4],
          quantity_to_pick: params[8],
        });
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('select pll.id::text') && q.includes('for update of pll, pl')) {
        return {
          rows: [
            {
              id: PICK_LINE_ID,
              pick_list_id: PICK_LIST_ID,
              sales_order_line_id: LINE_ID,
              license_plate_id: LP_ID,
              quantity_to_pick: '10.000',
              status: lineStatus,
              sales_order_id: SO_ID,
              pick_list_status: pickListStatus,
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('select ($1::numeric(14,3)')) {
        return {
          rows: [{ exact_match: qtyExactMatch, short_pick: qtyShortPick }],
          rowCount: 1,
        };
      }

      if (q.startsWith('select case') && q.includes('license_plates lp') && q.includes('qa_status')) {
        return { rows: lpBlockedQa ? [{ reason: 'qa' }] : [], rowCount: lpBlockedQa ? 1 : 0 };
      }

      if (q.startsWith('select ia.id::text') && q.includes("ia.status = 'allocated'") && q.includes('for update')) {
        return {
          rows: allocationExists ? [{ id: ALLOCATION_ID }] : [],
          rowCount: allocationExists ? 1 : 0,
        };
      }

      if (q.startsWith('update public.pick_list_lines')) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.inventory_allocations') && q.includes("status = 'picked'")) {
        updatedAllocations.push({ id: params[0], updated_by: params[1] });
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.sales_order_lines') && q.includes('quantity_picked')) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('insert into public.outbox_events')) {
        outboxEvents.push({
          event_type: params[0],
          aggregate_id: params[1],
          payload: params[2],
        });
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.pick_lists') && q.includes("status = 'in_progress'")) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('select count(*)::int as pending_count')) {
        return { rows: [{ pending_count: pendingLineCount }], rowCount: 1 };
      }

      if (q.startsWith('update public.pick_lists') && q.includes("status = 'completed'")) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.sales_orders') && q.includes('set status = $2')) {
        updatedSoStatuses.push(String(params[1]));
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

beforeEach(() => {
  allowPermission = true;
  salesOrderStatus = 'allocated';
  pickListStatus = 'pending';
  lineStatus = 'pending';
  openPickListExists = false;
  allocationExists = true;
  lpBlockedQa = false;
  batchHoldActive = false;
  pendingLineCount = 0;
  qtyExactMatch = true;
  qtyShortPick = false;
  insertedPickLists = [];
  insertedPickLines = [];
  updatedAllocations = [];
  updatedSoStatuses = [];
  outboxEvents = [];
  queryLog = [];
  client = makeClient();
});

describe('createPickList', () => {
  it('creates a pick list and lines from live allocations', async () => {
    const result = await createPickList(SO_ID);

    expect(result).toEqual({ ok: true, pickListId: PICK_LIST_ID });
    expect(insertedPickLists).toHaveLength(1);
    expect(insertedPickLines).toEqual([
      {
        pick_list_id: PICK_LIST_ID,
        sales_order_line_id: LINE_ID,
        license_plate_id: LP_ID,
        quantity_to_pick: '10.000',
      },
    ]);
  });

  it('rejects when the sales order is not allocated', async () => {
    salesOrderStatus = 'confirmed';

    const result = await createPickList(SO_ID);

    expect(result).toEqual({ ok: false, error: 'invalid_state' });
    expect(insertedPickLists).toEqual([]);
  });
});

describe('pickLine', () => {
  it('marks allocation picked, completes the pick list, drives SO to picked, and emits outbox', async () => {
    pendingLineCount = 0;

    const result = await pickLine(PICK_LINE_ID, { quantityPicked: '10.000' });

    expect(result).toEqual({ ok: true });
    expect(updatedAllocations).toEqual([{ id: ALLOCATION_ID, updated_by: USER_ID }]);
    expect(updatedSoStatuses).toEqual(['picked']);
    expect(outboxEvents).toHaveLength(1);
    expect(outboxEvents[0]?.event_type).toBe('shipping.pick.completed');
  });

  it('rejects a short (partial) pick', async () => {
    qtyExactMatch = false;
    qtyShortPick = true;

    const result = await pickLine(PICK_LINE_ID, { quantityPicked: '5.000' });

    expect(result).toEqual({ ok: false, error: 'short_pick_not_supported' });
    expect(updatedAllocations).toEqual([]);
    expect(outboxEvents).toEqual([]);
  });

  it('rejects a sub-scale quantity that would round to less than quantity_to_pick', async () => {
    qtyExactMatch = false;
    qtyShortPick = false;

    const result = await pickLine(PICK_LINE_ID, { quantityPicked: '0.0004' });

    expect(result).toEqual({ ok: false, error: 'invalid_input' });
    expect(updatedAllocations).toEqual([]);
  });

  it('rejects when a batch-level quality hold covers the LP', async () => {
    batchHoldActive = true;

    const result = await pickLine(PICK_LINE_ID, { quantityPicked: '10.000' });

    expect(result).toEqual({ ok: false, error: 'lp_blocked_for_pick' });
    expect(updatedAllocations).toEqual([]);
  });

  it('rejects when the caller passes a different allocation LP', async () => {
    const result = await pickLine(PICK_LINE_ID, {
      pickedLicensePlateId: OTHER_LP_ID,
      quantityPicked: '10.000',
    });

    expect(result).toEqual({ ok: false, error: 'invalid_input' });
    expect(updatedAllocations).toEqual([]);
  });
});

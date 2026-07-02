import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryGenealogy } from '../../../../../../../lib/warehouse/genealogy';
import { completeRecallDrill, runTraceReport, startRecallDrill, type TraceReport } from './trace-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const INPUT_LP_ID = '33333333-3333-4333-8333-333333333333';
const OUTPUT_LP_ID = '44444444-4444-4444-8444-444444444444';
const SOLO_LP_ID = '55555555-5555-4555-8555-555555555555';
const WO_ID = '66666666-6666-4666-8666-666666666666';
const DRILL_ID = '77777777-7777-4777-8777-777777777777';
const SUPPLIER_ID = '88888888-8888-4888-8888-888888888888';
const PO_ID = '99999999-9999-4999-8999-999999999999';
const GRN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SO_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SHIPMENT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CUSTOMER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

let client: QueryClient;
let scenario: 'chain' | 'solo';

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../../../lib/warehouse/genealogy', () => ({
  queryGenealogy: vi.fn(),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function lpRows() {
  if (scenario === 'solo') {
    return [
      {
        id: SOLO_LP_ID,
        lp_number: 'LP-SOLO',
        lp_code: 'LP-SOLO',
        display_ref: 'LP-SOLO',
        product_id: 'item-solo',
        item_code: 'RM-SOLO',
        item_name: 'Solo raw material',
        quantity: '3.000000',
        uom: 'kg',
        batch_code: 'B-SOLO',
        status: 'available',
        origin: 'grn',
        parent_lp_id: null,
        grn_id: null,
        wo_id: null,
        consumed_by_wo_id: null,
        source_so_id: null,
        created_at: '2026-06-23T08:00:00.000Z',
      },
    ];
  }

  return [
    {
      id: INPUT_LP_ID,
      lp_number: 'LP-IN',
      lp_code: 'LP-IN',
      display_ref: 'LP-IN',
      product_id: 'item-rm',
      item_code: 'RM-FLOUR',
      item_name: 'Flour',
      quantity: '10.000000',
      uom: 'kg',
      batch_code: 'B-RM',
      status: 'consumed',
      origin: 'grn',
      parent_lp_id: null,
      grn_id: GRN_ID,
      wo_id: null,
      consumed_by_wo_id: WO_ID,
      source_so_id: null,
      created_at: '2026-06-23T08:00:00.000Z',
    },
    {
      id: OUTPUT_LP_ID,
      lp_number: 'LP-OUT',
      lp_code: 'LP-OUT',
      display_ref: 'LP-OUT',
      product_id: 'item-fg',
      item_code: 'FG-BREAD',
      item_name: 'Bread',
      quantity: '15.000000',
      uom: 'kg',
      batch_code: 'B-FG',
      status: 'available',
      origin: 'production',
      parent_lp_id: INPUT_LP_ID,
      grn_id: null,
      wo_id: WO_ID,
      consumed_by_wo_id: null,
      source_so_id: SO_ID,
      created_at: '2026-06-23T09:00:00.000Z',
    },
  ];
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);

      if (q.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }

      if (q.startsWith('select lp.id::text as id') && q.includes('lp.lp_code = $1')) {
        return { rows: [{ id: scenario === 'solo' ? SOLO_LP_ID : INPUT_LP_ID }], rowCount: 1 };
      }

      if (q.startsWith('select lp.id::text as id, lp.lp_number')) {
        return { rows: lpRows(), rowCount: lpRows().length };
      }

      if (q.includes('from public.license_plates lp left join public.grn_items gi')) {
        if (scenario === 'solo') return { rows: [], rowCount: 0 };
        return {
          rows: [
            {
              lp_id: INPUT_LP_ID,
              grn_item_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              grn_id: GRN_ID,
              grn_number: 'GRN-2026-0001',
              po_id: PO_ID,
              po_number: 'PO-2026-0001',
              supplier_id: SUPPLIER_ID,
              supplier_code: 'SUP-FLOUR',
              supplier_name: 'Flour Supplier Ltd',
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('select c.id::text as id')) {
        if (scenario === 'solo') return { rows: [], rowCount: 0 };
        return {
          rows: [
            {
              id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
              lp_id: INPUT_LP_ID,
              wo_id: WO_ID,
              wo_number: 'WO-2026-0001',
              qty_consumed: '10.000',
              uom: 'kg',
              material_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              material_name: 'Flour',
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('select o.id::text as id')) {
        if (scenario === 'solo') return { rows: [], rowCount: 0 };
        return {
          rows: [
            {
              id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
              wo_id: WO_ID,
              wo_number: 'WO-2026-0001',
              output_lp_id: OUTPUT_LP_ID,
              output_ref: 'LP-OUT',
              batch_number: 'B-FG',
              qty: '15.000',
              uom: 'kg',
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('select wo.id::text as id')) {
        if (scenario === 'solo') return { rows: [], rowCount: 0 };
        return {
          rows: [
            {
              id: WO_ID,
              wo_number: 'WO-2026-0001',
              planned_quantity: '15.000',
              uom: 'kg',
              status: 'completed',
            },
          ],
          rowCount: 1,
        };
      }

      if (q.includes('get_forward_shipments_org_wide')) {
        if (scenario === 'solo') return { rows: [], rowCount: 0 };
        return {
          rows: [
            {
              shipment_id: SHIPMENT_ID,
              shipment_number: 'SH-2026-0001',
              sales_order_id: SO_ID,
              sales_order_number: 'SO-2026-0001',
              customer_id: CUSTOMER_ID,
              customer_name: 'Acme Foods',
              customer_code: 'ACME',
              lp_id: OUTPUT_LP_ID,
              lp_ref: 'LP-OUT',
              shipped_qty: '15.000',
              uom: 'kg',
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('insert into public.recall_drills')) {
        return { rows: [{ id: DRILL_ID }], rowCount: 1 };
      }

      if (q.startsWith('update public.recall_drills')) {
        return {
          rows: [
            {
              id: DRILL_ID,
              initiated_by: USER_ID,
              input_type: 'lp',
              input_ref: 'LP-IN',
              direction: 'both',
              started_at: '2026-06-23T10:00:00.000Z',
              completed_at: '2026-06-23T10:00:02.500Z',
              duration_ms: 2500,
              result_jsonb: JSON.parse(String(params[1])) as TraceReport,
              is_drill: true,
              created_at: '2026-06-23T10:00:00.000Z',
              updated_at: '2026-06-23T10:00:02.500Z',
            },
          ],
          rowCount: 1,
        };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('trace recall server actions', () => {
  beforeEach(() => {
    scenario = 'chain';
    client = makeClient();
    vi.clearAllMocks();
    vi.mocked(queryGenealogy).mockImplementation(async (_queryClient, lpId) => {
      if (lpId === SOLO_LP_ID) return [];
      return [
        {
          lpId: INPUT_LP_ID,
          lpNumber: 'LP-IN',
          itemCode: 'RM-FLOUR',
          quantity: '10.000000',
          uom: 'kg',
          status: 'consumed',
          createdAt: '2026-06-23T08:00:00.000Z',
          depth: 0,
          direction: 'self',
          parentLpId: null,
        },
        {
          lpId: OUTPUT_LP_ID,
          lpNumber: 'LP-OUT',
          itemCode: 'FG-BREAD',
          quantity: '15.000000',
          uom: 'kg',
          status: 'available',
          createdAt: '2026-06-23T09:00:00.000Z',
          depth: 1,
          direction: 'descendant',
          parentLpId: INPUT_LP_ID,
        },
      ];
    });
  });

  it('runTraceReport assembles nodes, edges, and forward shipment/customer rows from a 2-level LP to SO chain', async () => {
    const report = await runTraceReport({ inputType: 'lp', inputRef: 'LP-IN', direction: 'both' });

    expect(report.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'supplier', ref: 'SUP-FLOUR' }),
        expect.objectContaining({ type: 'purchase_order', ref: 'PO-2026-0001' }),
        expect.objectContaining({ type: 'grn', ref: 'GRN-2026-0001' }),
        expect.objectContaining({ nodeId: `lp:${INPUT_LP_ID}`, type: 'input_lp', ref: 'LP-IN', qty: '10.000000', uom: 'kg' }),
        expect.objectContaining({ nodeId: `wo:${WO_ID}`, type: 'work_order', ref: 'WO-2026-0001' }),
        expect.objectContaining({ nodeId: `lp:${OUTPUT_LP_ID}`, type: 'output_lp', ref: 'LP-OUT', qty: '15.000000', uom: 'kg' }),
        expect.objectContaining({
          nodeId: `shipment:${SHIPMENT_ID}:${OUTPUT_LP_ID}`,
          type: 'shipment_placeholder',
          ref: 'SH-2026-0001',
          label: 'Acme Foods / SO-2026-0001 / LP-OUT',
          qty: '15.000',
          uom: 'kg',
        }),
      ]),
    );
    expect(report.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: `lp:${INPUT_LP_ID}`, to: `wo:${WO_ID}`, relation: 'consumed_by', qty: '10.000', uom: 'kg' }),
        expect.objectContaining({ from: `wo:${WO_ID}`, to: `lp:${OUTPUT_LP_ID}`, relation: 'produced', qty: '15.000', uom: 'kg' }),
        expect.objectContaining({
          from: `lp:${OUTPUT_LP_ID}`,
          to: `shipment:${SHIPMENT_ID}:${OUTPUT_LP_ID}`,
          relation: 'ships_to',
          qty: '15.000',
          uom: 'kg',
        }),
      ]),
    );
    expect(report.affectedCustomers).toEqual([{ customerId: CUSTOMER_ID, customerName: 'Acme Foods', customerCode: 'ACME' }]);
    expect(report.flat).toContainEqual({ nodeId: `lp:${INPUT_LP_ID}`, type: 'input_lp', ref: 'LP-IN', qty: '10.000000', uom: 'kg' });
    expect(report.summary).toEqual({
      lpCount: 2,
      woCount: 1,
      shipmentCount: 1,
      customersAffected: 1,
      totalKg: '25',
    });
  });

  it('runTraceReport returns a single LP node with no edges when genealogy is empty', async () => {
    scenario = 'solo';
    client = makeClient();

    const report = await runTraceReport({ inputType: 'lp', inputRef: 'LP-SOLO', direction: 'both' });

    expect(report.nodes).toEqual([
      expect.objectContaining({ nodeId: `lp:${SOLO_LP_ID}`, type: 'input_lp', ref: 'LP-SOLO', qty: '3.000000', uom: 'kg' }),
    ]);
    expect(report.edges).toEqual([]);
    expect(report.flat).toEqual([{ nodeId: `lp:${SOLO_LP_ID}`, type: 'input_lp', ref: 'LP-SOLO', qty: '3.000000', uom: 'kg' }]);
    expect(report.summary.lpCount).toBe(1);
  });

  it('startRecallDrill followed by completeRecallDrill writes the row, stamps duration_ms, and snapshots the result', async () => {
    const started = await startRecallDrill({ inputType: 'lp', inputRef: 'LP-IN', direction: 'both', is_drill: true });
    const completed = await completeRecallDrill(started.drillId, started.report);

    expect(started.drillId).toBe(DRILL_ID);
    expect(completed.id).toBe(DRILL_ID);
    expect(completed.durationMs).toBeGreaterThan(0);
    expect(completed.result).toEqual(started.report);

    const calls = vi.mocked(client.query).mock.calls;
    const insert = calls.find(([sql]) => normalize(String(sql)).startsWith('insert into public.recall_drills'));
    const update = calls.find(([sql]) => normalize(String(sql)).startsWith('update public.recall_drills'));
    expect(insert?.[1]).toEqual([USER_ID, 'lp', 'LP-IN', 'both', true]);
    expect(update?.[1]?.[0]).toBe(DRILL_ID);
    expect(JSON.parse(String(update?.[1]?.[1]))).toEqual(started.report);
  });
});

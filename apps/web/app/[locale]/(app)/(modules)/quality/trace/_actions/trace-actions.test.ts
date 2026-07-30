import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryGenealogy } from '../../../../../../../lib/warehouse/genealogy';
import { runTraceReport } from './trace-actions';
import { LP_SEED_LIMIT } from './trace-mass-balance';

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
const SIBLING_LP_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const WO_ID = '66666666-6666-4666-8666-666666666666';
const SUPPLIER_ID = '88888888-8888-4888-8888-888888888888';
const PO_ID = '99999999-9999-4999-8999-999999999999';
const GRN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SO_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SHIPMENT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CUSTOMER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const WIP_LP_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const WO1_ID = '10101010-1010-4101-8101-101010101010';
const WO2_ID = '20202020-2020-4202-8202-202020202020';
const SPLIT_LP_ID = '30303030-3030-4303-8303-303030303030';
const TRANSFER_LP_ID = '40404040-4040-4404-8404-404040404040';
const MERGED_LP_ID = '50505050-5050-4505-8505-505050505050';

let client: QueryClient;
let scenario:
  | 'chain'
  | 'derived'
  | 'orphaned_output'
  | 'solo'
  | 'truncated_lp'
  | 'sibling'
  | 'restricted'
  | 'three_level'
  | 'duplicate_bom_scope'
  | 'partial_shipment'
  | 'fully_shipped'
  | 'real_imbalance'
  | 'batch_waste';

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

const BASE_LP_ROW = {
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
};

const OUTPUT_LP_ROW = {
  id: OUTPUT_LP_ID,
  lp_number: 'LP-OUT',
  lp_code: 'LP-OUT',
  display_ref: 'LP-OUT',
  product_id: 'item-fg',
  item_code: 'FG-BREAD',
  item_name: 'Bread',
  quantity: '0.000000',
  uom: 'kg',
  batch_code: 'B-FG',
  status: 'shipped',
  origin: 'production',
  parent_lp_id: INPUT_LP_ID,
  grn_id: null,
  wo_id: WO_ID,
  consumed_by_wo_id: null,
  source_so_id: SO_ID,
  created_at: '2026-06-23T09:00:00.000Z',
};

function lpRows() {
  if (
    scenario === 'duplicate_bom_scope' ||
    scenario === 'partial_shipment' ||
    scenario === 'fully_shipped' ||
    scenario === 'real_imbalance' ||
    scenario === 'batch_waste'
  ) {
    const outputQuantity = scenario === 'fully_shipped'
      ? '0.000000'
      : scenario === 'duplicate_bom_scope' || scenario === 'batch_waste'
        ? '30.000000'
        : '10.000000';
    const rows = [
      { ...BASE_LP_ROW, quantity: '0.000000', consumed_by_wo_id: WO_ID },
      { ...OUTPUT_LP_ROW, quantity: outputQuantity, status: 'available' },
    ];
    if (scenario === 'duplicate_bom_scope') {
      rows.push({
        ...OUTPUT_LP_ROW,
        id: SIBLING_LP_ID,
        lp_number: 'LP-SIBLING',
        lp_code: 'LP-SIBLING',
        display_ref: 'LP-SIBLING',
        quantity: '70.000000',
        batch_code: 'B-SIBLING',
        parent_lp_id: null,
      });
    }
    return rows;
  }

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

  if (scenario === 'sibling') {
    // WO-123 produced LP-OUT (traced) AND LP-SIBLING (co-product, NOT traced).
    // The sibling shares the same WO_ID but has a different LP id and batch code.
    return [
      BASE_LP_ROW,
      OUTPUT_LP_ROW,
      {
        id: SIBLING_LP_ID,
        lp_number: 'LP-SIBLING',
        lp_code: 'LP-SIBLING',
        display_ref: 'LP-SIBLING',
        product_id: 'item-sibling',
        item_code: 'FG-CAKE',
        item_name: 'Cake (co-product)',
        quantity: '20.000000',
        uom: 'kg',
        batch_code: 'B-SIBLING',
        status: 'available',
        origin: 'production',
        parent_lp_id: null,
        grn_id: null,
        wo_id: WO_ID,
        consumed_by_wo_id: null,
        source_so_id: null,
        created_at: '2026-06-23T09:30:00.000Z',
      },
    ];
  }

  if (scenario === 'three_level') {
    return [
      { ...BASE_LP_ROW, consumed_by_wo_id: WO1_ID },
      {
        id: WIP_LP_ID,
        lp_number: 'LP-WIP',
        lp_code: 'LP-WIP',
        display_ref: 'LP-WIP',
        product_id: 'item-wip',
        item_code: 'WIP-DOUGH',
        item_name: 'Dough WIP',
        quantity: '0.000000',
        uom: 'kg',
        batch_code: 'B-WIP',
        status: 'consumed',
        origin: 'production',
        parent_lp_id: INPUT_LP_ID,
        grn_id: null,
        wo_id: WO1_ID,
        consumed_by_wo_id: WO2_ID,
        source_so_id: null,
        created_at: '2026-06-23T08:30:00.000Z',
      },
      {
        ...OUTPUT_LP_ROW,
        parent_lp_id: WIP_LP_ID,
        wo_id: WO2_ID,
        quantity: '0.000000',
      },
    ];
  }

  if (scenario === 'derived' || scenario === 'orphaned_output') {
    return [
      BASE_LP_ROW,
      OUTPUT_LP_ROW,
      {
        ...OUTPUT_LP_ROW,
        id: SPLIT_LP_ID,
        lp_number: 'LP-OUT-SPLIT',
        lp_code: 'LP-OUT-SPLIT',
        display_ref: 'LP-OUT-SPLIT',
        origin: 'split',
        parent_lp_id: OUTPUT_LP_ID,
        wo_id: null,
        source_so_id: null,
      },
      {
        ...OUTPUT_LP_ROW,
        id: TRANSFER_LP_ID,
        lp_number: 'LP-OUT-TRANSFER',
        lp_code: 'LP-OUT-TRANSFER',
        display_ref: 'LP-OUT-TRANSFER',
        origin: 'transfer',
        parent_lp_id: SPLIT_LP_ID,
        wo_id: null,
        source_so_id: null,
      },
      {
        ...OUTPUT_LP_ROW,
        id: MERGED_LP_ID,
        lp_number: 'LP-OUT-MERGED',
        lp_code: 'LP-OUT-MERGED',
        display_ref: 'LP-OUT-MERGED',
        origin: 'merge',
        parent_lp_id: TRANSFER_LP_ID,
        wo_id: null,
        source_so_id: null,
      },
    ];
  }

  return [BASE_LP_ROW, OUTPUT_LP_ROW];
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);

      // hasPermission — contains role_permissions join or platform_admin check
      if (q.includes('from public.user_roles') && q.includes('role_permissions')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }

      // isUserSiteAccessUnrestricted — admin role slug check (no role_permissions)
      if (q.includes('from public.user_roles') && q.includes('r.slug = any')) {
        if (scenario === 'restricted') return { rows: [], rowCount: 0 };
        return { rows: [{ ok: 1 }], rowCount: 1 };
      }

      // isUserSiteAccessUnrestricted — user_sites assignment count
      if (q.includes('from public.user_sites us') && q.includes('count(*)')) {
        if (scenario === 'restricted') return { rows: [{ count: 2 }], rowCount: 1 };
        return { rows: [{ count: 0 }], rowCount: 1 };
      }

      if (q.startsWith('select lp.id::text as id') && q.includes('lp.lp_code = $1')) {
        if (scenario === 'truncated_lp') {
          const rows = Array.from({ length: LP_SEED_LIMIT + 1 }, (_, index) => ({
            id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`,
          }));
          return { rows, rowCount: rows.length };
        }
        const outputSeed =
          ((scenario === 'derived' || scenario === 'orphaned_output') && params[0] === 'LP-OUT-MERGED') ||
          scenario === 'duplicate_bom_scope' ||
          scenario === 'partial_shipment' ||
          scenario === 'fully_shipped' ||
          scenario === 'real_imbalance' ||
          scenario === 'batch_waste';
        return {
          rows: [{
            id: scenario === 'solo'
              ? SOLO_LP_ID
              : (scenario === 'derived' || scenario === 'orphaned_output') && params[0] === 'LP-OUT-MERGED'
                ? MERGED_LP_ID
                : outputSeed
                  ? OUTPUT_LP_ID
                  : INPUT_LP_ID,
          }],
          rowCount: 1,
        };
      }

      if (q.startsWith('select lp.id::text as id, lp.lp_number')) {
        // Filter by the queried LP ids (params[0] = array of ids) to match production behaviour.
        const queried = params[0] as string[] | undefined;
        const allRows = lpRows();
        const filtered = queried ? allRows.filter((r) => queried.includes(r.id)) : allRows;
        return { rows: filtered, rowCount: filtered.length };
      }

      if (q.includes('from public.license_plates lp left join public.grn_items gi')) {
        if (scenario === 'solo') return { rows: [], rowCount: 0 };
        if (scenario === 'orphaned_output' && !(params[0] as string[]).includes(INPUT_LP_ID)) {
          return { rows: [], rowCount: 0 };
        }
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
        if (scenario === 'orphaned_output') {
          const lpIds = params[0] as string[];
          const woIds = params[1] as string[];
          if (!lpIds.includes(INPUT_LP_ID) && !woIds.includes(WO_ID)) {
            return { rows: [], rowCount: 0 };
          }
        }
        if (scenario === 'duplicate_bom_scope') {
          const row = {
            id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            lp_id: INPUT_LP_ID,
            wo_id: WO_ID,
            wo_number: 'WO-2026-0001',
            qty_consumed: '100.000',
            uom: 'kg',
            material_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          };
          const rows = q.includes('material_per_product')
            ? [{ ...row, material_name: 'Raw meat (stage 1) / Raw meat (stage 2)' }]
            : [
                { ...row, material_name: 'Raw meat (stage 1)' },
                { ...row, material_name: 'Raw meat (stage 2)' },
              ];
          return { rows, rowCount: rows.length };
        }
        if (
          scenario === 'partial_shipment' ||
          scenario === 'fully_shipped' ||
          scenario === 'real_imbalance' ||
          scenario === 'batch_waste'
        ) {
          const qty = scenario === 'batch_waste' ? '35.000' : '30.000';
          return {
            rows: [
              {
                id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                lp_id: INPUT_LP_ID,
                wo_id: WO_ID,
                wo_number: 'WO-2026-0001',
                qty_consumed: qty,
                uom: 'kg',
                material_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
                material_name: 'Raw material',
              },
            ],
            rowCount: 1,
          };
        }
        if (scenario === 'three_level') {
          return {
            rows: [
              {
                id: 'c1111111-1111-4111-8111-111111111111',
                lp_id: INPUT_LP_ID,
                wo_id: WO1_ID,
                wo_number: 'WO-2026-0001',
                qty_consumed: '10.000',
                uom: 'kg',
                material_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
                material_name: 'Flour',
              },
              {
                id: 'c2222222-2222-4222-8222-222222222222',
                lp_id: WIP_LP_ID,
                wo_id: WO2_ID,
                wo_number: 'WO-2026-0002',
                qty_consumed: '9.000',
                uom: 'kg',
                material_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
                material_name: 'Dough WIP',
              },
            ],
            rowCount: 2,
          };
        }
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
        if (scenario === 'duplicate_bom_scope') {
          return {
            rows: [
              {
                id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
                wo_id: WO_ID,
                wo_number: 'WO-2026-0001',
                output_lp_id: OUTPUT_LP_ID,
                output_ref: 'LP-OUT',
                batch_number: 'B-FG',
                qty: '30.000',
                uom: 'kg',
                current_qty: '30.000000',
                current_uom: 'kg',
                consumed_by_wo_id: null,
              },
              {
                id: 'ffffffff-ffff-4fff-8fff-000000000001',
                wo_id: WO_ID,
                wo_number: 'WO-2026-0001',
                output_lp_id: SIBLING_LP_ID,
                output_ref: 'LP-SIBLING',
                batch_number: 'B-SIBLING',
                qty: '70.000',
                uom: 'kg',
                current_qty: '70.000000',
                current_uom: 'kg',
                consumed_by_wo_id: null,
              },
            ],
            rowCount: 2,
          };
        }
        if (
          scenario === 'partial_shipment' ||
          scenario === 'fully_shipped' ||
          scenario === 'real_imbalance' ||
          scenario === 'batch_waste'
        ) {
          const currentQty =
            scenario === 'fully_shipped' ? '0.000000' : scenario === 'batch_waste' ? '30.000000' : '10.000000';
          return {
            rows: [
              {
                id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
                wo_id: WO_ID,
                wo_number: 'WO-2026-0001',
                output_lp_id: OUTPUT_LP_ID,
                output_ref: 'LP-OUT',
                batch_number: 'B-FG',
                qty: '30.000',
                uom: 'kg',
                current_qty: currentQty,
                current_uom: 'kg',
                consumed_by_wo_id: null,
              },
            ],
            rowCount: 1,
          };
        }
        if (scenario === 'three_level') {
          return {
            rows: [
              {
                id: 'o1111111-1111-4111-8111-111111111111',
                wo_id: WO1_ID,
                wo_number: 'WO-2026-0001',
                output_lp_id: WIP_LP_ID,
                output_ref: 'LP-WIP',
                batch_number: 'B-WIP',
                qty: '9.000',
                uom: 'kg',
              },
              {
                id: 'o2222222-2222-4222-8222-222222222222',
                wo_id: WO2_ID,
                wo_number: 'WO-2026-0002',
                output_lp_id: OUTPUT_LP_ID,
                output_ref: 'LP-OUT',
                batch_number: 'B-FG',
                qty: '8.500',
                uom: 'kg',
              },
            ],
            rowCount: 2,
          };
        }
        if (scenario === 'sibling') {
          // WO produced both LP-OUT (traced, B-FG) and LP-SIBLING (co-product, B-SIBLING).
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
              {
                id: 'ffffffff-ffff-4fff-8fff-000000000001',
                wo_id: WO_ID,
                wo_number: 'WO-2026-0001',
                output_lp_id: SIBLING_LP_ID,
                output_ref: 'LP-SIBLING',
                batch_number: 'B-SIBLING',
                qty: '20.000',
                uom: 'kg',
              },
            ],
            rowCount: 2,
          };
        }
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
        if (
          scenario === 'duplicate_bom_scope' ||
          scenario === 'partial_shipment' ||
          scenario === 'fully_shipped' ||
          scenario === 'real_imbalance' ||
          scenario === 'batch_waste'
        ) {
          return {
            rows: [
              {
                id: WO_ID,
                wo_number: 'WO-2026-0001',
                planned_quantity: scenario === 'duplicate_bom_scope' ? '100.000' : '30.000',
                uom: 'kg',
                status: 'completed',
              },
            ],
            rowCount: 1,
          };
        }
        if (scenario === 'three_level') {
          return {
            rows: [
              {
                id: WO1_ID,
                wo_number: 'WO-2026-0001',
                planned_quantity: '9.000',
                uom: 'kg',
                status: 'completed',
              },
              {
                id: WO2_ID,
                wo_number: 'WO-2026-0002',
                planned_quantity: '8.500',
                uom: 'kg',
                status: 'completed',
              },
            ],
            rowCount: 2,
          };
        }
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
        if (scenario === 'partial_shipment' || scenario === 'fully_shipped' || scenario === 'real_imbalance') {
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
                shipped_qty:
                  scenario === 'fully_shipped' ? '30.000' : scenario === 'partial_shipment' ? '20.000' : '15.000',
                uom: 'kg',
              },
            ],
            rowCount: 1,
          };
        }
        if (scenario === 'duplicate_bom_scope' || scenario === 'batch_waste') {
          return { rows: [], rowCount: 0 };
        }
        if (scenario === 'derived' || scenario === 'orphaned_output') {
          const requestedLpIds = params[0] as string[];
          if (!requestedLpIds.includes(MERGED_LP_ID)) return { rows: [], rowCount: 0 };
          return {
            rows: [
              {
                shipment_id: SHIPMENT_ID,
                shipment_number: 'SH-DERIVED',
                sales_order_id: SO_ID,
                sales_order_number: 'SO-DERIVED',
                customer_id: CUSTOMER_ID,
                customer_name: 'Derived Customer',
                customer_code: 'DERIVED',
                lp_id: MERGED_LP_ID,
                lp_ref: 'LP-OUT-MERGED',
                shipped_qty: '5.000',
                uom: 'kg',
              },
            ],
            rowCount: 1,
          };
        }
        if (scenario === 'three_level') {
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
                shipped_qty: '8.500',
                uom: 'kg',
              },
            ],
            rowCount: 1,
          };
        }
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

      if (q.includes('from public.wo_waste_log w')) {
        if (scenario === 'solo') return { rows: [], rowCount: 0 };
        if (scenario === 'batch_waste') {
          return {
            rows: [{ wo_id: WO_ID, lp_id: INPUT_LP_ID, wo_number: 'WO-2026-0001', qty_kg: '5.000' }],
            rowCount: 1,
          };
        }
        if (
          scenario === 'duplicate_bom_scope' ||
          scenario === 'partial_shipment' ||
          scenario === 'fully_shipped' ||
          scenario === 'real_imbalance'
        ) {
          return { rows: [], rowCount: 0 };
        }
        if (scenario === 'three_level') {
          return {
            rows: [
              { wo_id: WO1_ID, lp_id: INPUT_LP_ID, wo_number: 'WO-2026-0001', qty_kg: '1.000' },
              { wo_id: WO2_ID, lp_id: WIP_LP_ID, wo_number: 'WO-2026-0002', qty_kg: '0.500' },
            ],
            rowCount: 2,
          };
        }
        if (scenario === 'sibling') {
          // Sibling scenario: WO has waste that belongs to the SIBLING batch (no LP match)
          // → should land in unreconciled, not inflate wasteKg
          return {
            rows: [
              {
                wo_id: WO_ID,
                lp_id: SIBLING_LP_ID,   // sibling LP — not in the traced set
                wo_number: 'WO-2026-0001',
                qty_kg: '3.000',
              },
            ],
            rowCount: 1,
          };
        }
        // default chain scenario: no waste
        return { rows: [], rowCount: 0 };
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
      if (
        scenario === 'duplicate_bom_scope' ||
        scenario === 'partial_shipment' ||
        scenario === 'fully_shipped' ||
        scenario === 'real_imbalance' ||
        scenario === 'batch_waste'
      ) {
        return [
          {
            lpId: INPUT_LP_ID,
            lpNumber: 'LP-IN',
            itemCode: 'RM-001',
            quantity: '0.000000',
            uom: 'kg',
            status: 'consumed',
            createdAt: '2026-06-23T08:00:00.000Z',
            depth: 1,
            direction: 'ancestor',
            parentLpId: null,
          },
          {
            lpId: OUTPUT_LP_ID,
            lpNumber: 'LP-OUT',
            itemCode: 'FG-001',
            quantity: lpRows().find((row) => row.id === OUTPUT_LP_ID)?.quantity ?? '0',
            uom: 'kg',
            status: 'available',
            createdAt: '2026-06-23T09:00:00.000Z',
            depth: 0,
            direction: 'self',
            parentLpId: INPUT_LP_ID,
          },
        ];
      }
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

  it('runTraceReport forward-traces a 3-level RM→WIP→FG genealogy through two WOs to shipment with mass balance', async () => {
    scenario = 'three_level';
    client = makeClient();
    vi.mocked(queryGenealogy).mockImplementation(async (_queryClient, lpId) => {
      if (lpId !== INPUT_LP_ID) return [];
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
          direction: 'self' as const,
          parentLpId: null,
        },
        {
          lpId: WIP_LP_ID,
          lpNumber: 'LP-WIP',
          itemCode: 'WIP-DOUGH',
          quantity: '9.000000',
          uom: 'kg',
          status: 'consumed',
          createdAt: '2026-06-23T08:30:00.000Z',
          depth: 1,
          direction: 'descendant' as const,
          parentLpId: INPUT_LP_ID,
        },
        {
          lpId: OUTPUT_LP_ID,
          lpNumber: 'LP-OUT',
          itemCode: 'FG-BREAD',
          quantity: '8.500000',
          uom: 'kg',
          status: 'shipped',
          createdAt: '2026-06-23T09:00:00.000Z',
          depth: 2,
          direction: 'descendant' as const,
          parentLpId: WIP_LP_ID,
        },
      ];
    });

    const report = await runTraceReport({ inputType: 'lp', inputRef: 'LP-IN', direction: 'forward' });

    expect(report.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: `lp:${INPUT_LP_ID}`, type: 'input_lp', ref: 'LP-IN' }),
        expect.objectContaining({ nodeId: `lp:${WIP_LP_ID}`, type: 'output_lp', ref: 'LP-WIP' }),
        expect.objectContaining({ nodeId: `lp:${OUTPUT_LP_ID}`, type: 'output_lp', ref: 'LP-OUT' }),
        expect.objectContaining({ nodeId: `wo:${WO1_ID}`, type: 'work_order', ref: 'WO-2026-0001' }),
        expect.objectContaining({ nodeId: `wo:${WO2_ID}`, type: 'work_order', ref: 'WO-2026-0002' }),
        expect.objectContaining({
          nodeId: `shipment:${SHIPMENT_ID}:${OUTPUT_LP_ID}`,
          type: 'shipment_placeholder',
          ref: 'SH-2026-0001',
        }),
      ]),
    );
    expect(report.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: `lp:${INPUT_LP_ID}`, to: `wo:${WO1_ID}`, relation: 'consumed_by', qty: '10.000' }),
        expect.objectContaining({ from: `wo:${WO1_ID}`, to: `lp:${WIP_LP_ID}`, relation: 'produced', qty: '9.000' }),
        expect.objectContaining({ from: `lp:${WIP_LP_ID}`, to: `wo:${WO2_ID}`, relation: 'consumed_by', qty: '9.000' }),
        expect.objectContaining({ from: `wo:${WO2_ID}`, to: `lp:${OUTPUT_LP_ID}`, relation: 'produced', qty: '8.500' }),
        expect.objectContaining({
          from: `lp:${OUTPUT_LP_ID}`,
          to: `shipment:${SHIPMENT_ID}:${OUTPUT_LP_ID}`,
          relation: 'ships_to',
          qty: '8.500',
        }),
      ]),
    );
    expect(report.summary).toMatchObject({
      lpCount: 3,
      woCount: 2,
      shipmentCount: 1,
      customersAffected: 1,
    });
    if (!report.massBalance || !('nodes' in report.massBalance)) throw new Error('expected applicable mass balance');
    const wo1 = report.massBalance.nodes.find((node) => node.woRef === 'WO-2026-0001');
    const wo2 = report.massBalance.nodes.find((node) => node.woRef === 'WO-2026-0002');
    expect(wo1).toMatchObject({ inputKg: '10', outputKg: '9', wasteKg: '1', remainingKg: '0', deltaKg: '0', balanced: true });
    expect(wo2).toMatchObject({ inputKg: '9', outputKg: '8.5', wasteKg: '0.5', remainingKg: '0', deltaKg: '0', balanced: true });
    expect(report.massBalance.total).toMatchObject({
      seedInputKg: '10',
      shippedKg: '8.5',
      onSiteKg: '0',
      wasteKg: '1.5',
      deltaKg: '0',
      balanced: true,
      percentAccounted: '100',
    });
    expect(report.massBalance.unreconciled).toEqual([]);
  });

  it('Z2: forward recall includes the customer shipping an LP after split, transfer, and merge', async () => {
    scenario = 'derived';
    client = makeClient();
    const derivedChain = [
      [INPUT_LP_ID, 'LP-IN', null],
      [OUTPUT_LP_ID, 'LP-OUT', INPUT_LP_ID],
      [SPLIT_LP_ID, 'LP-OUT-SPLIT', OUTPUT_LP_ID],
      [TRANSFER_LP_ID, 'LP-OUT-TRANSFER', SPLIT_LP_ID],
      [MERGED_LP_ID, 'LP-OUT-MERGED', TRANSFER_LP_ID],
    ] as const;
    vi.mocked(queryGenealogy).mockImplementation(async (_queryClient, rootLpId) =>
      derivedChain.map(([lpId, lpNumber, parentLpId], index) => ({
        lpId,
        lpNumber,
        itemCode: index === 0 ? 'RM-FLOUR' : 'FG-BREAD',
        quantity: index === 0 ? '10.000000' : '5.000000',
        uom: 'kg',
        status: index === 0 ? 'consumed' : index === 4 ? 'shipped' : 'available',
        createdAt: `2026-06-23T${String(index + 8).padStart(2, '0')}:00:00.000Z`,
        depth: rootLpId === INPUT_LP_ID ? index : 4 - index,
        direction:
          lpId === rootLpId
            ? 'self' as const
            : rootLpId === INPUT_LP_ID
              ? 'descendant' as const
              : 'ancestor' as const,
        parentLpId,
      })),
    );

    const report = await runTraceReport({ inputType: 'lp', inputRef: 'LP-IN', direction: 'forward' });

    expect(report.nodes).toEqual(
      expect.arrayContaining(
        [OUTPUT_LP_ID, SPLIT_LP_ID, TRANSFER_LP_ID, MERGED_LP_ID].map((lpId) =>
          expect.objectContaining({ nodeId: `lp:${lpId}`, type: 'output_lp' }),
        ),
      ),
    );
    expect(report.affectedCustomers).toEqual([
      { customerId: CUSTOMER_ID, customerName: 'Derived Customer', customerCode: 'DERIVED' },
    ]);
    expect(report.edges).toContainEqual(
      expect.objectContaining({
        from: `lp:${MERGED_LP_ID}`,
        to: `shipment:${SHIPMENT_ID}:${MERGED_LP_ID}`,
        relation: 'ships_to',
      }),
    );

    const backward = await runTraceReport({
      inputType: 'lp',
      inputRef: 'LP-OUT-MERGED',
      direction: 'backward',
    });
    expect(backward.nodes).toEqual(
      expect.arrayContaining([
        ...derivedChain.map(([lpId]) => expect.objectContaining({ nodeId: `lp:${lpId}` })),
        expect.objectContaining({ type: 'supplier', ref: 'SUP-FLOUR' }),
      ]),
    );
  });

  it('Z1: recall bridges an historical output with no consumed genealogy edge through the WO ledgers', async () => {
    scenario = 'orphaned_output';
    client = makeClient();
    const derivativeChain = [
      [OUTPUT_LP_ID, 'LP-OUT', null],
      [SPLIT_LP_ID, 'LP-OUT-SPLIT', OUTPUT_LP_ID],
      [TRANSFER_LP_ID, 'LP-OUT-TRANSFER', SPLIT_LP_ID],
      [MERGED_LP_ID, 'LP-OUT-MERGED', TRANSFER_LP_ID],
    ] as const;
    vi.mocked(queryGenealogy).mockImplementation(async (_queryClient, rootLpId) => {
      if (rootLpId === INPUT_LP_ID) {
        return [{
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
        }];
      }
      if (rootLpId !== OUTPUT_LP_ID && rootLpId !== MERGED_LP_ID) return [];
      return derivativeChain.map(([lpId, lpNumber, parentLpId], index) => ({
        lpId,
        lpNumber,
        itemCode: 'FG-BREAD',
        quantity: '5.000000',
        uom: 'kg',
        status: index === 3 ? 'shipped' : 'available',
        createdAt: `2026-06-23T${String(index + 9).padStart(2, '0')}:00:00.000Z`,
        depth: rootLpId === OUTPUT_LP_ID ? index : 3 - index,
        direction:
          lpId === rootLpId
            ? 'self' as const
            : rootLpId === OUTPUT_LP_ID
              ? 'descendant' as const
              : 'ancestor' as const,
        parentLpId,
      }));
    });

    const forward = await runTraceReport({ inputType: 'lp', inputRef: 'LP-IN', direction: 'forward' });
    expect(forward.nodes).toEqual(
      expect.arrayContaining(
        derivativeChain.map(([lpId]) => expect.objectContaining({ nodeId: `lp:${lpId}` })),
      ),
    );
    expect(forward.affectedCustomers).toContainEqual(
      expect.objectContaining({ customerId: CUSTOMER_ID, customerName: 'Derived Customer' }),
    );

    const backward = await runTraceReport({
      inputType: 'lp',
      inputRef: 'LP-OUT-MERGED',
      direction: 'backward',
    });
    expect(backward.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: `lp:${INPUT_LP_ID}`, ref: 'LP-IN' }),
        expect.objectContaining({ type: 'supplier', ref: 'SUP-FLOUR' }),
      ]),
    );
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
        expect.objectContaining({ nodeId: `lp:${OUTPUT_LP_ID}`, type: 'output_lp', ref: 'LP-OUT', qty: '0.000000', uom: 'kg' }),
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
      totalKg: '10',
    });
    expect(report.truncation).toEqual({ truncated: false, layers: [] });
    expect(report.massBalance).toMatchObject({
      total: {
        balanced: false,
        seedInputKg: '10',
        shippedKg: '15',
        deltaKg: '-5',
      },
    });
    if (!report.massBalance || !('nodes' in report.massBalance)) throw new Error('expected applicable mass balance');
    expect(report.massBalance.total.shippedKg).toBe('15');
    expect(report.massBalance.nodes[0]).toMatchObject({ inputKg: '10', outputKg: '15', deltaKg: '-5', balanced: false });
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
    expect(report.truncation).toEqual({ truncated: false, layers: [] });
    expect(report.massBalance).toBeNull();
  });

  it('runTraceReport propagates seed_lp truncation when the LP cap is exceeded', async () => {
    scenario = 'truncated_lp';
    client = makeClient();

    const report = await runTraceReport({ inputType: 'lp', inputRef: 'LP-OVERFLOW', direction: 'both' });

    expect(report.truncation).toEqual({
      truncated: true,
      layers: [{ layer: 'seed_lp', limit: LP_SEED_LIMIT }],
    });
  });

  it('uses one WO scope for consumption, sibling outputs, and waste', async () => {
    scenario = 'sibling';
    client = makeClient();
    vi.mocked(queryGenealogy).mockImplementation(async (_queryClient, lpId) => {
      if (lpId === INPUT_LP_ID) {
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
            direction: 'self' as const,
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
            direction: 'descendant' as const,
            parentLpId: INPUT_LP_ID,
          },
        ];
      }
      return [];
    });

    const report = await runTraceReport({ inputType: 'lp', inputRef: 'LP-IN', direction: 'both' });

    expect(report.massBalance).not.toBeNull();
    if (!report.massBalance || !('nodes' in report.massBalance)) {
      throw new Error('expected applicable mass balance');
    }
    expect(report.massBalance.nodes[0]?.outputKg).toBe('35');
    expect(report.massBalance.total.wasteKg).toBe('3');
    expect(report.massBalance.unreconciled).not.toContainEqual(
      expect.objectContaining({ bucket: 'unattributed_wo_waste', reason: 'unattributed_wo_waste' }),
    );
  });

  it('Z3: counts one 100 kg consumption once when the material occurs on two BOM lines', async () => {
    scenario = 'duplicate_bom_scope';
    client = makeClient();

    const report = await runTraceReport({ inputType: 'lp', inputRef: 'LP-OUT', direction: 'both' });

    if (!report.massBalance || !('nodes' in report.massBalance)) {
      throw new Error('expected applicable mass balance');
    }
    expect(report.massBalance.nodes[0]).toMatchObject({
      inputKg: '100',
      outputKg: '100',
      wasteKg: '0',
      deltaKg: '0',
      balanced: true,
    });
  });

  it('Z4: uses the 30 kg WO boundary input after a 20 kg partial shipment instead of current 10 kg LP quantity', async () => {
    scenario = 'partial_shipment';
    client = makeClient();

    const report = await runTraceReport({ inputType: 'lp', inputRef: 'LP-OUT', direction: 'both' });

    if (!report.massBalance || !('nodes' in report.massBalance)) {
      throw new Error('expected applicable mass balance');
    }
    expect(report.massBalance.total).toMatchObject({
      seedInputKg: '30',
      onSiteKg: '10',
      shippedKg: '20',
      wasteKg: '0',
      deltaKg: '0',
      percentAccounted: '100',
      balanced: true,
    });
    expect(report.massBalance.nodes[0]?.balanced).toBe(true);
  });

  it('Z4: keeps the panel and a 100% balance after all 30 kg is shipped, also in a backward trace', async () => {
    scenario = 'fully_shipped';
    client = makeClient();

    const report = await runTraceReport({ inputType: 'lp', inputRef: 'LP-OUT', direction: 'backward' });

    if (!report.massBalance || !('nodes' in report.massBalance)) {
      throw new Error('expected applicable mass balance');
    }
    expect(report.massBalance.total).toMatchObject({
      seedInputKg: '30',
      onSiteKg: '0',
      shippedKg: '30',
      wasteKg: '0',
      deltaKg: '0',
      percentAccounted: '100',
      balanced: true,
    });
  });

  it('Z4: includes WO waste in the same scope without falsely flagging a healthy 35→30+5 kg run', async () => {
    scenario = 'batch_waste';
    client = makeClient();

    const report = await runTraceReport({ inputType: 'lp', inputRef: 'LP-OUT', direction: 'both' });

    if (!report.massBalance || !('nodes' in report.massBalance)) {
      throw new Error('expected applicable mass balance');
    }
    expect(report.massBalance.total).toMatchObject({
      seedInputKg: '35',
      onSiteKg: '30',
      shippedKg: '0',
      wasteKg: '5',
      deltaKg: '0',
      percentAccounted: '100',
      balanced: true,
    });
    expect(report.massBalance.unreconciled).toEqual([]);
  });

  it('Z4: still detects a real 5 kg shortage in a 30→10+15 kg WO balance', async () => {
    scenario = 'real_imbalance';
    client = makeClient();

    const report = await runTraceReport({ inputType: 'lp', inputRef: 'LP-OUT', direction: 'both' });

    if (!report.massBalance || !('nodes' in report.massBalance)) {
      throw new Error('expected applicable mass balance');
    }
    expect(report.massBalance.total).toMatchObject({
      seedInputKg: '30',
      onSiteKg: '10',
      shippedKg: '15',
      wasteKg: '0',
      deltaKg: '5',
      percentAccounted: '83.333333',
      balanced: false,
    });
  });

  it('F2: site-restricted caller gets massBalance: { scopeLimited: true } without computing balances', async () => {
    scenario = 'restricted';
    client = makeClient();

    const report = await runTraceReport({ inputType: 'lp', inputRef: 'LP-IN', direction: 'both' });

    expect(report.massBalance).not.toBeNull();
    expect(report.massBalance).toEqual({ scopeLimited: true });
    // Mass balance lines must NOT be present (discriminant check)
    if (report.massBalance && 'nodes' in report.massBalance) {
      throw new Error('site-restricted massBalance must not have nodes');
    }
  });
});

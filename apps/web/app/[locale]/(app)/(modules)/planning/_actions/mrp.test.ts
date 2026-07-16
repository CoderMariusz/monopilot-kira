/**
 * W9-M2 — runMrp Server Action tests (mock pg dispatcher, node env).
 * CL2 slice 2 — persistence round-trip (mig-178-shaped INSERT params into
 * mrp_runs/mrp_requirements), write-gate on persist, reorder_thresholds read,
 * listMrpRuns / getMrpRunRequirements.
 *
 * Mirrors the purchase-orders actions.test.ts seam: withOrgContext is mocked to
 * hand the action a fake QueryClient whose dispatcher routes on SQL shape. We
 * assert the RBAC gate, the org-scoped source reads, end-to-end netting through
 * computeMrp, and the error surface.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withSiteContext } from '../../../../../../lib/auth/with-site-context';
import { MRP_DEFAULT_HORIZON_WEEKS } from './mrp-compute';
import { cancelPlannedOrder, convertPlannedToPo, convertPlannedToWo, getMrpRunRequirements, listMrpRuns, runMrp } from './mrp';
import { addDaysIso, buildMrpBucketDates, bucketHorizonEnd } from './mrp-buckets';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const FLOUR_ID = '33333333-3333-4333-8333-333333333333';
const DOUGH_ID = '44444444-4444-4444-8444-444444444444';
const FG_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const RUN_ID = '77777777-7777-4777-8777-777777777777';
const SUPPLIER_ID = '88888888-8888-4888-8888-888888888888';
const PO_PLANNED_ID = '99999999-9999-4999-8999-999999999999';
const WO_PLANNED_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FG_PLANNED_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PO_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const WO_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SITE_ID = '12121212-1212-4121-8121-121212121212';
const OTHER_SITE_ID = 'abababab-abab-4aba-8aba-abababababab';
const MOCK_NEED_DATE = '2026-06-11';
const MOCK_ISO_WEEK = '2026-W24';

const OPEN_SO_DEMAND_STATUS_EXPECTATION = [
  'confirmed',
  'allocated',
  'partially_picked',
  'picked',
  'partially_packed',
  'packed',
  'manifested',
  'shipped',
  'partially_delivered',
] as const;

function bucketStartForRunDate(isoDate: string): string {
  return buildMrpBucketDates(isoDate, 1)[0]!;
}

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

let client: QueryClient;
let boundSiteId: string | null = SITE_ID;
let allowPermission = true;
let allowWritePermission = true;
let failInventoryRead = false;
/** Threshold rows the reorder_thresholds read returns (default none). */
let thresholdRows: Array<{
  item_id: string;
  min_qty: string;
  reorder_qty: string;
  preferred_supplier_id: string | null;
  lead_time_days: number | null;
}> = [];
/**
 * Rework scenario (Codex batch-D F2): WO_REWORK consumes 20 kg dough to make
 * dough (self-referential). Its 50 kg projected output must NOT offset its own
 * demand — the schedule_outputs anti-join has to exclude it.
 */
let reworkSelfSupply = false;
/** demand_forecasts rows the independent-demand read returns (default none). */
let forecastRows: Array<{ product_id: string; uom: string; iso_week: string; qty: string }> = [];
/** sales_order_lines rows the SO-demand read returns (default none). */
let soDemandRows: Array<{ product_id: string; uom: string; need_date: string; qty: string }> = [];
/** Undated confirmed SO line count returned by the warning probe (default none). */
let undatedSoLinesMock = 0;
/** When set, flour item carries pack hierarchy for box-UoM SO demand tests. */
let flourPackHierarchy = false;
let includeFinishedGood = false;
/** Open-PO supplier rows returned by procurement supplier resolution (S13). */
let openPoSupplierRows: Array<{ item_id: string; supplier_id: string }> = [];
/** supplier_specs fallback rows for procurement supplier resolution (S13). */
let supplierSpecLinkRows: Array<{ item_id: string; supplier_id: string }> = [];
/** Draft-WO schedule output that must NOT count as MRP supply (S11). */
let draftWoSupplyQty: string | null = null;
let executed: string[] = [];
/** Captured DDL-shaped INSERT params. */
let runInserts: Array<readonly unknown[]> = [];
let reqInserts: Array<readonly unknown[]> = [];
let plannedInserts: Array<readonly unknown[]> = [];
let outboxInserts: Array<readonly unknown[]> = [];
let releasedUpdates: Array<readonly unknown[]> = [];
let cancelUpdates: Array<readonly unknown[]> = [];
let auditInserts: Array<readonly unknown[]> = [];
let workOrderInserts: Array<readonly unknown[]> = [];
let woMaterialInserts: Array<readonly unknown[]> = [];
let woOperationInserts: Array<readonly unknown[]> = [];
let scheduleOutputInserts: Array<readonly unknown[]> = [];
let woStatusHistoryInserts: Array<readonly unknown[]> = [];
let conversionRows: Array<Record<string, unknown>> = [];
let cancelLookupRows: Array<Record<string, unknown>> = [];
let hasActiveBom = true;
let supplierSpecUnitPrice: string | null = '6.2500';
/** list_price_gbp the items single-row mock returns (null = column absent/null). */
let itemListPriceGbp: string | null = '5.0000';
let supplierCurrency = 'GBP';
const createPurchaseOrderCoreMock = vi.fn();

const WO_OTHER = '55555555-5555-4555-8555-555555555555';
const WO_REWORK = '66666666-6666-4666-8666-666666666666';

function plannedOrderIdForItem(itemId: string, index: number): string {
  if (itemId === FLOUR_ID) return PO_PLANNED_ID;
  if (itemId === DOUGH_ID) return WO_PLANNED_ID;
  if (itemId === FG_ID) return FG_PLANNED_ID;
  return `planned-${index}`;
}

function itemLabelForId(itemId: string): { code: string; name: string } {
  if (itemId === FLOUR_ID) return { code: 'RM-FLOUR', name: 'Wheat flour' };
  if (itemId === DOUGH_ID) return { code: 'INT-DOUGH', name: 'Bread dough' };
  if (itemId === FG_ID) return { code: 'FG-BREAD', name: 'Finished bread' };
  return { code: 'UNKNOWN', name: 'Unknown item' };
}

vi.mock('../../../../../../lib/auth/with-site-context', () => ({
  withSiteContext: vi.fn(
    async (
      arg1: unknown,
      arg2?: (ctx: { userId: string; orgId: string; siteId: string | null; client: QueryClient }) => Promise<unknown>,
    ) => {
      const action = typeof arg1 === 'function' ? arg1 : arg2;
      if (!action) throw new TypeError('withSiteContext mock: missing action');
      return action({ userId: USER_ID, orgId: ORG_ID, siteId: boundSiteId, client });
    },
  ),
}));

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../purchase-orders/_actions/create-purchase-order-core', () => ({
  createPurchaseOrderCore: (ctx: unknown, input: unknown) => createPurchaseOrderCoreMock(ctx, input),
}));

function plannedOrdersVisibleForSql<T extends { site_id?: string | null }>(
  sql: string,
  rows: T[],
): T[] {
  const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalized.includes('app.current_site_id() is null or') || boundSiteId === null) {
    return rows;
  }
  return rows.filter((row) => row.site_id === boundSiteId);
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      executed.push(normalized);

      if (normalized.includes('from public.user_roles')) {
        expect(params[0]).toBe(USER_ID);
        expect(params[1]).toBe(ORG_ID);
        const permission = params[2];
        if (permission === 'scheduler.run.read') {
          return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
        }
        if (permission === 'npd.planning.write' || permission === 'planning.mrp.convert') {
          return {
            rows: allowWritePermission ? [{ ok: true }] : [],
            rowCount: allowWritePermission ? 1 : 0,
          };
        }
        throw new Error(`unexpected permission probe: ${String(permission)}`);
      }
      if (normalized.includes('insert into public.mrp_runs')) {
        runInserts.push(params);
        return { rows: [{ id: RUN_ID, run_number: params[0] }], rowCount: 1 };
      }
      if (normalized.includes('insert into public.mrp_requirements')) {
        reqInserts.push(params);
        return { rows: [{ id: `req-${reqInserts.length}` }], rowCount: 1 };
      }
      if (normalized.startsWith('delete from public.mrp_planned_orders')) {
        return { rows: [], rowCount: 1 };
      }
      if (normalized.includes('insert into public.mrp_planned_orders')) {
        plannedInserts.push(params);
        return { rows: [], rowCount: 1 };
      }
      if (normalized.includes('insert into public.outbox_events')) {
        outboxInserts.push(params);
        return { rows: [], rowCount: 1 };
      }
      if (normalized.includes('insert into public.audit_events')) {
        auditInserts.push(params);
        return { rows: [], rowCount: 1 };
      }
      if (normalized.startsWith('update public.org_document_settings')) {
        expect(params).toEqual([ORG_ID, 'wo']);
        return {
          rows: [{ old_seq: 42, number_prefix: 'WO', number_date_part: 'YYYYMM', number_seq_padding: 4 }],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('insert into public.org_document_settings')) {
        expect(params[0]).toBe(ORG_ID);
        expect(params[1]).toBe('wo');
        return { rows: [], rowCount: 1 };
      }
      if (normalized.startsWith('update public.mrp_planned_orders') && normalized.includes("set release_status = 'cancelled'")) {
        cancelUpdates.push(params);
        return { rows: [{ id: params[0] }], rowCount: 1 };
      }
      if (normalized.startsWith('update public.mrp_planned_orders')) {
        releasedUpdates.push(params);
        return { rows: [], rowCount: 1 };
      }
      if (normalized.includes('from public.mrp_planned_orders')) {
        if (normalized.includes('for update of po') && !Array.isArray(params[0])) {
          const rows = plannedOrdersVisibleForSql(sql, cancelLookupRows);
          return { rows: rows as never[], rowCount: rows.length };
        }
        if (!Array.isArray(params[0])) {
          const rows = plannedOrdersVisibleForSql(
            sql,
            plannedInserts.map((p, index) => {
              const itemId = String(p[2]);
              const label = itemLabelForId(itemId);
              return {
                id: plannedOrderIdForItem(itemId, index),
                site_id: SITE_ID,
                item_id: p[2],
                item_code: label.code,
                item_name: label.name,
                order_type: p[3],
                quantity: p[4],
                uom: p[5],
                due_date: p[6],
                supplier_id: p[8],
                release_status: 'suggested',
              };
            }),
          );
          return { rows, rowCount: rows.length };
        }
        const rows = plannedOrdersVisibleForSql(sql, conversionRows);
        return { rows: rows as never[], rowCount: rows.length };
      }
      if (normalized.includes('from public.suppliers') && normalized.includes('select currency')) {
        return { rows: [{ currency: supplierCurrency }], rowCount: 1 };
      }
      if (normalized.includes('from public.suppliers s') && normalized.includes('join public.supplier_specs ss')) {
        expect(params[1]).toBe(SUPPLIER_ID);
        return {
          rows: supplierSpecUnitPrice == null ? [] : ([{ unit_price: supplierSpecUnitPrice }] as never[]),
          rowCount: supplierSpecUnitPrice == null ? 0 : 1,
        };
      }
      if (normalized.includes('from public.bom_headers')) {
        return { rows: hasActiveBom ? [{ id: 'bom-id', version: 1 }] : [], rowCount: hasActiveBom ? 1 : 0 };
      }
      if (normalized.includes('from public.factory_specs')) {
        return { rows: [{ id: 'factory-spec-id' }], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.work_orders')) {
        workOrderInserts.push(params);
        return { rows: [{ id: params[0] }], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.wo_materials')) {
        woMaterialInserts.push(params);
        return { rows: [], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.wo_operations')) {
        woOperationInserts.push(params);
        return { rows: [], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.schedule_outputs')) {
        scheduleOutputInserts.push(params);
        return { rows: [], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.wo_status_history')) {
        woStatusHistoryInserts.push(params);
        return { rows: [], rowCount: 1 };
      }
      if (normalized.includes('from public.mrp_runs')) {
        return {
          rows: [
            {
              id: RUN_ID,
              run_number: 'MRP-20260611-AAAA1111',
              status: 'completed',
              horizon_start: '2026-06-11',
              requirement_count: 2,
              exception_count: 1,
              created_at: '2026-06-11T10:00:00.000Z',
            },
          ],
          rowCount: 1,
        };
      }
      if (normalized.includes('from public.mrp_requirements')) {
        expect(params[0]).toBe(RUN_ID);
        return {
          rows: [
            {
              item_id: FLOUR_ID,
              item_code: 'RM-FLOUR',
              item_name: 'Wheat flour',
              bucket_date: '2026-06-11',
              gross_requirement: '80.000',
              scheduled_receipts: '25.000',
              projected_on_hand: '-25.000',
              net_requirement: '25.000',
              uom: 'kg',
              exception_type: 'shortage',
            },
          ],
          rowCount: 1,
        };
      }
      if (normalized.includes('from public.reorder_thresholds')) {
        return { rows: thresholdRows, rowCount: thresholdRows.length };
      }
      if (normalized.includes('from public.items')) {
        if (typeof params[0] === 'string') {
          // list_price_gbp fallback: the MRP price resolver issues a targeted query
          // (select list_price_gbp::text as unit_price … where id = $1::uuid).
          if (normalized.includes('list_price_gbp')) {
            return {
              rows: itemListPriceGbp == null ? [] : ([{ unit_price: itemListPriceGbp }] as never[]),
              rowCount: itemListPriceGbp == null ? 0 : 1,
            };
          }
          const label = itemLabelForId(params[0]);
          return {
            rows: [
              {
                id: params[0],
                item_code: label.code,
                name: label.name,
                item_type: params[0] === FG_ID ? 'fg' : params[0] === DOUGH_ID ? 'intermediate' : 'rm',
                output_uom: 'base',
                uom_base: 'kg',
                net_qty_per_each: null,
                each_per_box: null,
                boxes_per_pallet: null,
                weight_mode: 'fixed',
              },
            ],
            rowCount: 1,
          };
        }
        expect(params[0]).toEqual(['rm', 'ingredient', 'intermediate', 'packaging', 'fg']);
        const rows = [
          {
            id: FLOUR_ID,
            item_code: 'RM-FLOUR',
            name: 'Wheat flour',
            item_type: 'rm',
            uom_base: 'kg',
            output_uom: 'base',
            net_qty_per_each: flourPackHierarchy ? '50' : null,
            each_per_box: flourPackHierarchy ? '1' : null,
          },
          {
            id: DOUGH_ID,
            item_code: 'INT-DOUGH',
            name: 'Bread dough',
            item_type: 'intermediate',
            uom_base: 'kg',
            output_uom: 'base',
            net_qty_per_each: null,
            each_per_box: null,
          },
        ];
        if (includeFinishedGood) {
          rows.push({
            id: FG_ID,
            item_code: 'FG-BREAD',
            name: 'Finished bread',
            item_type: 'fg',
            uom_base: 'kg',
            output_uom: 'base',
            net_qty_per_each: null,
            each_per_box: null,
          });
        }
        return {
          rows,
          rowCount: rows.length,
        };
      }
      if (normalized.includes('from public.v_inventory_available')) {
        if (failInventoryRead) throw new Error('boom');
        return {
          rows: [{ product_id: FLOUR_ID, uom: 'kg', on_hand: '40.000', reserved: '10.000' }],
          rowCount: 1,
        };
      }
      // NOTE: schedule_outputs is matched BEFORE wo_materials — its SQL embeds a
      // `not exists (select 1 from public.wo_materials …)` anti-join (batch-D F2).
      if (normalized.includes('from public.schedule_outputs')) {
        expect(params[0]).toEqual(['RELEASED', 'IN_PROGRESS']);
        // Simulated DB state: raw open to_stock schedule_outputs rows, each
        // tagged with its WO; open wo_materials (wo, product) demand pairs.
        const raw = [{ wo: WO_OTHER, product_id: DOUGH_ID, uom: 'kg', qty: '12.000' }];
        const supplyStatuses = params[0] as string[];
        if (draftWoSupplyQty && supplyStatuses.includes('DRAFT')) {
          raw.push({ wo: 'draft-wo', product_id: FLOUR_ID, uom: 'kg', qty: draftWoSupplyQty });
        }
        const openMaterialPairs = new Set([`${WO_OTHER}:${FLOUR_ID}`]);
        if (reworkSelfSupply) {
          raw.push({ wo: WO_REWORK, product_id: DOUGH_ID, uom: 'kg', qty: '50.000' });
          openMaterialPairs.add(`${WO_REWORK}:${DOUGH_ID}`);
        }
        // The mock honours the anti-join ONLY when the action's SQL asks for it —
        // dropping the anti-join from mrp.ts re-admits the self-supply row and
        // fails the rework test below.
        const hasAntiJoin =
          normalized.includes('not exists') &&
          normalized.includes('m.wo_id = so.planned_wo_id') &&
          normalized.includes('m.product_id = so.product_id');
        const visible = hasAntiJoin
          ? raw.filter((r) => !openMaterialPairs.has(`${r.wo}:${r.product_id}`))
          : raw;
        const rows = visible.map(({ product_id, uom, qty }) => ({
          product_id,
          uom,
          qty,
          need_date: MOCK_NEED_DATE,
        }));
        return { rows, rowCount: rows.length };
      }
      if (normalized.includes('from public.wo_materials')) {
        expect(params[0]).toEqual(['DRAFT', 'RELEASED', 'IN_PROGRESS']);
        return {
          rows: [
            { product_id: FLOUR_ID, uom: 'kg', qty: '80.000', need_date: MOCK_NEED_DATE },
            { product_id: DOUGH_ID, uom: 'kg', qty: '20.000', need_date: MOCK_NEED_DATE },
          ],
          rowCount: 2,
        };
      }
      if (normalized.includes('from public.demand_forecasts')) {
        expect(String(params[0])).toMatch(/^\d{4}-W\d{2}$/);
        expect(String(params[1])).toMatch(/^\d{4}-W\d{2}$/);
        return { rows: forecastRows, rowCount: forecastRows.length };
      }
      if (normalized.includes('from public.sales_order_lines')) {
        if (normalized.includes('count(distinct sol.id)')) {
          return { rows: [{ undated_lines: String(undatedSoLinesMock) }], rowCount: 1 };
        }
        expect(params[0]).toEqual([...OPEN_SO_DEMAND_STATUS_EXPECTATION]);
        expect(String(params[1])).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(String(params[2])).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        return { rows: soDemandRows, rowCount: soDemandRows.length };
      }
      if (normalized.includes('from public.purchase_order_lines')) {
        if (normalized.includes('distinct on (l.item_id)')) {
          return { rows: openPoSupplierRows, rowCount: openPoSupplierRows.length };
        }
        expect(params[0]).toEqual(['sent', 'confirmed', 'partially_received']);
        // Remainder already netted in SQL (ordered − received via grn_items).
        return { rows: [{ product_id: FLOUR_ID, uom: 'kg', qty: '25.000', need_date: MOCK_NEED_DATE }], rowCount: 1 };
      }
      if (normalized.includes('from public.supplier_specs ss') && normalized.includes('distinct on (ss.item_id)')) {
        return { rows: supplierSpecLinkRows, rowCount: supplierSpecLinkRows.length };
      }
      if (normalized.includes('from public.suppliers s') && normalized.includes("s.status <> 'blocked'")) {
        const ids = (params[0] as string[]) ?? [];
        return { rows: ids.map((id) => ({ id })), rowCount: ids.length };
      }
      throw new Error(`unexpected query: ${normalized}`);
    }),
  };
}

beforeEach(() => {
  client = makeClient();
  boundSiteId = SITE_ID;
  allowPermission = true;
  allowWritePermission = true;
  failInventoryRead = false;
  reworkSelfSupply = false;
  forecastRows = [];
  soDemandRows = [];
  undatedSoLinesMock = 0;
  flourPackHierarchy = false;
  thresholdRows = [];
  includeFinishedGood = false;
  openPoSupplierRows = [];
  supplierSpecLinkRows = [];
  draftWoSupplyQty = null;
  executed = [];
  runInserts = [];
  reqInserts = [];
  plannedInserts = [];
  outboxInserts = [];
  releasedUpdates = [];
  cancelUpdates = [];
  auditInserts = [];
  workOrderInserts = [];
  woMaterialInserts = [];
  woOperationInserts = [];
  scheduleOutputInserts = [];
  woStatusHistoryInserts = [];
  conversionRows = [];
  cancelLookupRows = [];
  hasActiveBom = true;
  supplierSpecUnitPrice = '6.2500';
  itemListPriceGbp = '5.0000';
  supplierCurrency = 'GBP';
  createPurchaseOrderCoreMock.mockReset();
  createPurchaseOrderCoreMock.mockResolvedValue({ ok: true, data: { id: PO_ID } });
});

describe('cancelPlannedOrder', () => {
  it('cancels an org-scoped suggested planned order and writes an audit event', async () => {
    cancelLookupRows = [
      {
        id: PO_PLANNED_ID,
        site_id: SITE_ID,
        item_id: FLOUR_ID,
        item_code: 'RM-FLOUR',
        order_type: 'po',
        quantity: '25.000000',
        uom: 'kg',
        due_date: '2026-06-18',
        release_status: 'suggested',
        released_order_id: null,
        linked_po_status: null,
        linked_to_status: null,
        linked_wo_status: null,
      },
    ];

    const result = await cancelPlannedOrder(PO_PLANNED_ID);

    expect(result).toEqual({ ok: true, cancelled: true });
    expect(cancelUpdates).toHaveLength(1);
    expect(cancelUpdates[0][0]).toBe(PO_PLANNED_ID);
    expect(cancelUpdates[0][1]).toEqual(['pending', 'suggested', 'firm', 'released']);
    const cancelSql = executed.find((sql) => sql.startsWith('update public.mrp_planned_orders') && sql.includes("set release_status = 'cancelled'"))!;
    expect(cancelSql).toContain('app.current_org_id()');
    expect(cancelSql).toContain('app.current_site_id() is null or po.site_id = app.current_site_id()');
    expect(cancelSql).toContain('not exists');
    expect(auditInserts).toHaveLength(1);
    expect(auditInserts[0][2]).toBe('planning.mrp_planned_order.cancelled');
    expect(auditInserts[0][3]).toBe('mrp_planned_order');
    expect(auditInserts[0][4]).toBe(PO_PLANNED_ID);
    expect(JSON.parse(auditInserts[0][5] as string)).toEqual({ releaseStatus: 'suggested', releasedOrderId: null });
    expect(JSON.parse(auditInserts[0][6] as string)).toMatchObject({
      releaseStatus: 'cancelled',
      orderType: 'po',
      itemId: FLOUR_ID,
      itemCode: 'RM-FLOUR',
    });
  });

  it('returns not_found for a planned order on another site', async () => {
    boundSiteId = SITE_ID;
    cancelLookupRows = [
      {
        id: PO_PLANNED_ID,
        site_id: OTHER_SITE_ID,
        item_id: FLOUR_ID,
        item_code: 'RM-FLOUR',
        order_type: 'po',
        quantity: '25.000000',
        uom: 'kg',
        due_date: '2026-06-18',
        release_status: 'suggested',
        released_order_id: null,
        linked_po_status: null,
        linked_to_status: null,
        linked_wo_status: null,
      },
    ];

    expect(await cancelPlannedOrder(PO_PLANNED_ID)).toEqual({ ok: false, error: 'not_found' });
    expect(cancelUpdates).toHaveLength(0);
    expect(createPurchaseOrderCoreMock).not.toHaveBeenCalled();
  });

  it('refuses to cancel a released planned PO after receipt has started', async () => {
    cancelLookupRows = [
      {
        id: PO_PLANNED_ID,
        site_id: SITE_ID,
        item_id: FLOUR_ID,
        item_code: 'RM-FLOUR',
        order_type: 'po',
        quantity: '25.000000',
        uom: 'kg',
        due_date: '2026-06-18',
        release_status: 'released',
        released_order_id: PO_ID,
        linked_po_status: 'partially_received',
        linked_to_status: null,
        linked_wo_status: null,
      },
    ];

    expect(await cancelPlannedOrder(PO_PLANNED_ID)).toEqual({ ok: false, error: 'invalid_state' });
    expect(cancelUpdates).toHaveLength(0);
    expect(auditInserts).toHaveLength(0);
  });

  it('refuses to cancel a released planned WO once the linked WO is closed', async () => {
    cancelLookupRows = [
      {
        id: WO_PLANNED_ID,
        site_id: SITE_ID,
        item_id: DOUGH_ID,
        item_code: 'INT-DOUGH',
        order_type: 'wo',
        quantity: '8.000000',
        uom: 'kg',
        due_date: '2026-06-18',
        release_status: 'released',
        released_order_id: WO_ID,
        linked_po_status: null,
        linked_to_status: null,
        linked_wo_status: 'CLOSED',
      },
    ];

    expect(await cancelPlannedOrder(WO_PLANNED_ID)).toEqual({ ok: false, error: 'invalid_state' });
    expect(cancelUpdates).toHaveLength(0);
    expect(auditInserts).toHaveLength(0);
  });

  it('uses the same write and MRP-convert RBAC gates as conversion actions', async () => {
    allowWritePermission = false;
    expect(await cancelPlannedOrder(PO_PLANNED_ID)).toEqual({ ok: false, error: 'forbidden' });
    expect(cancelUpdates).toHaveLength(0);
  });

  it('rejects a non-uuid planned order id', async () => {
    expect(await cancelPlannedOrder('not-a-uuid')).toEqual({ ok: false, error: 'invalid_input' });
    expect(executed).toHaveLength(0);
  });
});

describe('runMrp', () => {
  it('nets demand vs on-hand + open supply per item and sorts shortages first', async () => {
    const result = await runMrp();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.ranAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.data.rows).toHaveLength(2);

    // Flour: 40 − 10 + 25 − 80 = −25 → BUY 25 (rm).
    const flour = result.data.rows.find((r) => r.itemCode === 'RM-FLOUR')!;
    expect(flour.onHand).toBe('40.000');
    expect(flour.reserved).toBe('10.000');
    expect(flour.openSupply).toBe('25.000');
    expect(flour.demand).toBe('80.000');
    expect(flour.net).toBe('-25.000');
    expect(flour.severity).toBe('shortage');
    expect(flour.suggestedAction).toMatchObject({ type: 'buy', qty: '25', supplierId: null });

    // Dough: 0 + 12 − 20 = −8 → MAKE 8 (intermediate; schedule_outputs counted as supply).
    const dough = result.data.rows.find((r) => r.itemCode === 'INT-DOUGH')!;
    expect(dough.openSupply).toBe('12.000');
    expect(dough.net).toBe('-8.000');
    expect(dough.suggestedAction).toMatchObject({ type: 'make', qty: '8', supplierId: null });

    // Shortage sort: most negative first.
    expect(result.data.rows.map((r) => r.itemCode)).toEqual(['RM-FLOUR', 'INT-DOUGH']);

    expect(result.data.kpis.itemsShort).toBe(2);
    expect(result.data.kpis.itemsAnalyzed).toBe(2);
    expect(result.data.kpis.totalDemand).toBe('100.000');
    // shortage 25 + 8 = 33 of 100 demand → 67% coverage.
    expect(result.data.kpis.coveragePct).toBe(67);
  });

  it('runs all org-scoped source reads incl. demand_forecasts + sales_order_lines (RLS predicates present)', async () => {
    await runMrp();
    const sources = [
      'public.items',
      'public.v_inventory_available',
      'public.wo_materials',
      'public.demand_forecasts',
      'public.sales_order_lines',
      'public.purchase_order_lines',
      'public.schedule_outputs',
      'public.reorder_thresholds',
    ];
    for (const source of sources) {
      const q = executed.find((sql) => sql.includes(`from ${source}`));
      expect(q, `${source} read missing`).toBeTruthy();
      expect(q!, `${source} read not org-scoped`).toContain('app.current_org_id()');
    }
    // PO remainder uses the grn_items aggregate on non-cancelled GRNs.
    const po = executed.find((sql) => sql.includes('from public.purchase_order_lines'))!;
    expect(po).toContain('grn_items');
    expect(po).toContain("status <> 'cancelled'");
    // Read-only slice: nothing is persisted.
    expect(executed.some((sql) => sql.startsWith('insert') || sql.startsWith('update') || sql.startsWith('delete'))).toBe(false);
  });

  it('excludes a rework WO\'s self-supply — its output never offsets its own demand (batch-D F2)', async () => {
    reworkSelfSupply = true;
    const result = await runMrp();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // WO_REWORK consumes 20 kg dough to make dough and projects 50 kg output.
    // Without the anti-join the 50 kg self-supply would swamp the 20 kg demand
    // (net +42 → "covered") and hide the shortage. With it, only WO_OTHER's
    // 12 kg counts: 0 + 12 − 20 = −8 → MAKE 8.
    const dough = result.data.rows.find((r) => r.itemCode === 'INT-DOUGH')!;
    expect(dough.openSupply).toBe('12.000');
    expect(dough.demand).toBe('20.000');
    expect(dough.net).toBe('-8.000');
    expect(dough.severity).toBe('shortage');
    expect(dough.suggestedAction).toMatchObject({ type: 'make', qty: '8', supplierId: null });

    // The schedule_outputs read carries the org-scoped anti-join on (wo, product).
    const so = executed.find((sql) => sql.includes('from public.schedule_outputs'))!;
    expect(so).toContain('coalesce(w.site_id, pl.site_id) = app.current_site_id()');
    expect(so).not.toContain('so.site_id is null');
    expect(so).toContain('not exists');
    expect(so).toContain('m.wo_id = so.planned_wo_id');
    expect(so).toContain('m.product_id = so.product_id');
    expect(so).toContain('m.required_qty > m.consumed_qty');
  });

  it('does not count draft WIP schedule_outputs as open supply (S11)', async () => {
    draftWoSupplyQty = '100.000';
    const result = await runMrp();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flour = result.data.rows.find((r) => r.itemCode === 'RM-FLOUR')!;
    expect(flour.openSupply).toBe('25.000');
    expect(flour.net).toBe('-25.000');
  });

  it('resolves buy planned-order supplier from open PO history when threshold is unset (S13)', async () => {
    openPoSupplierRows = [{ item_id: FLOUR_ID, supplier_id: SUPPLIER_ID }];
    const result = await runMrp({ persist: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flourPlanned = plannedInserts.find((p) => p[2] === FLOUR_ID);
    expect(flourPlanned?.[8]).toBe(SUPPLIER_ID);
  });

  it('returns forbidden when the planning read permission is missing', async () => {
    allowPermission = false;
    const result = await runMrp();
    expect(result).toEqual({ ok: false, error: 'forbidden' });
    // Gate fails fast — no source reads.
    expect(executed.some((sql) => sql.includes('from public.items'))).toBe(false);
  });

  it('maps a failed read to persistence_failed (never throws to the client)', async () => {
    failInventoryRead = true;
    const result = await runMrp();
    expect(result).toEqual({ ok: false, error: 'persistence_failed' });
  });

  it('feeds reorder thresholds into the netting (below_min + lot + lead-time due date)', async () => {
    // Dough: 0 + 12 − 20 = −8 (shortage) with min 5, lot 20, supplier lead 7 →
    // qty = ceil(max(5 − (−8), 20)) = 20, due = today + 7.
    thresholdRows = [
      {
        item_id: DOUGH_ID,
        min_qty: '5.000',
        reorder_qty: '20.000',
        preferred_supplier_id: SUPPLIER_ID,
        lead_time_days: 7,
      },
    ];
    const result = await runMrp();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const today = result.data.ranAt.slice(0, 10);
    const bucketStart = bucketStartForRunDate(today);
    const dueDate = bucketStart < today ? today : bucketStart;
    const dough = result.data.rows.find((r) => r.itemCode === 'INT-DOUGH')!;
    expect(dough.severity).toBe('shortage');
    expect(dough.minQty).toBe('5.000');
    const rawRelease = addDaysIso(dueDate, -7);
    expect(dough.suggestedAction).toMatchObject({
      type: 'make',
      qty: '20',
      dueDate,
      supplierId: SUPPLIER_ID,
    });
    if (rawRelease < today) {
      expect(dough.suggestedAction?.releaseDate).toBe(today);
      expect(dough.suggestedAction?.isLate).toBe(true);
    } else {
      expect(dough.suggestedAction?.releaseDate).toBe(rawRelease);
      expect(dough.suggestedAction?.isLate).toBeFalsy();
    }
  });

  it('nets demand_forecasts as INDEPENDENT demand — forecast qty raises the item net requirement (E6)', async () => {
    // Baseline flour: 40 − 10 + 25 − 80 = −25 (buy 25). Add a 30 kg forecast →
    // demand 80 + 30 = 110, net 40 − 10 + 25 − 110 = −55 → buy 55.
    forecastRows = [{ product_id: FLOUR_ID, uom: 'kg', iso_week: '2026-W24', qty: '30.000' }];

    const result = await runMrp();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flour = result.data.rows.find((r) => r.itemCode === 'RM-FLOUR')!;
    expect(flour.demand).toBe('110.000'); // 80 dependent + 30 forecast
    expect(flour.forecastDemand).toBe('30.000');
    expect(flour.net).toBe('-55.000'); // 25 worse than the −25 baseline (== forecast qty)
    expect(flour.severity).toBe('shortage');
    // Shortage grew by exactly the forecast qty → a larger BUY shortfall order.
    expect(flour.suggestedAction).toMatchObject({ type: 'buy', qty: '55', supplierId: null });

    // Dough has no forecast → still pure dependent demand, untouched.
    const dough = result.data.rows.find((r) => r.itemCode === 'INT-DOUGH')!;
    expect(dough.demand).toBe('20.000');
    expect(dough.forecastDemand).toBe('0.000');
    expect(dough.soDemand).toBe('0.000');
  });

  it('nets confirmed sales-order demand as INDEPENDENT demand — SO qty raises the item net requirement (NN-PLAN-4)', async () => {
    // Baseline flour: 40 − 10 + 25 − 80 = −25 (buy 25). Add a 15 kg confirmed-SO →
    // demand 80 + 15 = 95, net 40 − 10 + 25 − 95 = −40 → buy 40.
    soDemandRows = [{ product_id: FLOUR_ID, uom: 'kg', need_date: MOCK_NEED_DATE, qty: '15.000' }];

    const result = await runMrp();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flour = result.data.rows.find((r) => r.itemCode === 'RM-FLOUR')!;
    expect(flour.demand).toBe('95.000'); // 80 dependent + 15 SO
    expect(flour.soDemand).toBe('15.000');
    expect(flour.forecastDemand).toBe('0.000');
    expect(flour.net).toBe('-40.000');
    expect(flour.severity).toBe('shortage');
    expect(flour.suggestedAction).toMatchObject({ type: 'buy', qty: '40', supplierId: null });

    const dough = result.data.rows.find((r) => r.itemCode === 'INT-DOUGH')!;
    expect(dough.soDemand).toBe('0.000');
  });

  it('tags the persisted run/requirement as independent when SO demand feeds an item (NN-PLAN-4)', async () => {
    soDemandRows = [{ product_id: FLOUR_ID, uom: 'kg', need_date: MOCK_NEED_DATE, qty: '15.000' }];
    const result = await runMrp({ persist: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(runInserts[0][8]).toBe('forecast');

    const flourReq = reqInserts.find((p) => p[1] === FLOUR_ID && p[3] === '95.000')!;
    const doughReq = reqInserts.find((p) => p[1] === DOUGH_ID && p[3] === '20.000')!;
    expect(flourReq[3]).toBe('95.000');
    expect(flourReq[9]).toBe('independent');
    expect(doughReq[9]).toBe('dependent');
  });

  it('stays byte-identical to the no-SO baseline when soDemandRows is empty (invariance)', async () => {
    const baseline = await runMrp();
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;

    soDemandRows = [];
    const invariant = await runMrp();
    expect(invariant.ok).toBe(true);
    if (!invariant.ok) return;

    expect(invariant.data.rows).toEqual(baseline.data.rows);
    expect(invariant.data.kpis).toEqual(baseline.data.kpis);
  });

  it('binds SQL demand/supply horizon to the phased bucket grid end, not today+weeks*7 (N-PLN-3)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-11T10:00:00.000Z'));
    const today = '2026-06-11';
    const expectedHorizonEnd = bucketHorizonEnd(buildMrpBucketDates(today, MRP_DEFAULT_HORIZON_WEEKS))!;
    expect(expectedHorizonEnd).not.toBe(addDaysIso(today, MRP_DEFAULT_HORIZON_WEEKS * 7));

    let capturedWoHorizon: string | undefined;
    let capturedSoHorizon: string | undefined;
    const probeClient: QueryClient = {
      query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
        const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
        executed.push(normalized);
        if (normalized.includes('from public.user_roles')) {
          return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
        }
        if (normalized.includes('from public.items i') && normalized.includes('item_type = any')) {
          return {
            rows: [{ id: FLOUR_ID, item_code: 'RM-FLOUR', name: 'Flour', item_type: 'rm', uom_base: 'kg', output_uom: null, net_qty_per_each: null, each_per_box: null }],
            rowCount: 1,
          };
        }
        if (normalized.includes('from public.v_inventory_available')) {
          return { rows: [{ product_id: FLOUR_ID, uom: 'kg', on_hand: '0', reserved: '0' }], rowCount: 1 };
        }
        if (normalized.includes('from public.wo_materials')) {
          capturedWoHorizon = String(params?.[2]);
          return { rows: [], rowCount: 0 };
        }
        if (normalized.includes('from public.sales_order_lines') && normalized.includes('need_date')) {
          if (normalized.includes('count(distinct sol.id)')) {
            return { rows: [{ undated_lines: '0' }], rowCount: 1 };
          }
          capturedSoHorizon = String(params?.[1]);
          return { rows: [], rowCount: 0 };
        }
        if (normalized.includes('from public.demand_forecasts')) {
          return { rows: [], rowCount: 0 };
        }
        if (normalized.includes('from public.purchase_order_lines') && !normalized.includes('distinct on')) {
          return { rows: [], rowCount: 0 };
        }
        if (normalized.includes('from public.schedule_outputs')) {
          return { rows: [], rowCount: 0 };
        }
        if (normalized.includes('from public.reorder_thresholds')) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
    client = probeClient;

    await runMrp();
    expect(capturedWoHorizon).toBe(expectedHorizonEnd);
    expect(capturedSoHorizon).toBe(expectedHorizonEnd);
    vi.useRealTimers();
  });

  it('reads sales_order_lines with post-confirm statuses and a horizon-end bind (NN-PLAN-4)', async () => {
    await runMrp();
    const soSql = executed.find((sql) => sql.includes('from public.sales_order_lines') && sql.includes('need_date'))!;
    expect(soSql).toContain('app.current_org_id()');
    expect(soSql).toContain('sales_orders so');
    expect(soSql).toContain("so.status = any($1::text[])");
    expect(soSql).toContain('from public.shipment_box_contents sbc');
    expect(soSql).toContain('join public.shipment_boxes sb');
    expect(soSql).toContain('join public.shipments sh');
    expect(soSql).toContain("sh.status in ('shipped', 'delivered')");
    expect(soSql).toContain('quantity_ordered - coalesce(shipped.shipped_qty, 0)');
    expect(soSql).not.toContain('sol.quantity_shipped');
    expect(soSql).toContain('sum(sbc.quantity) as shipped_qty');
    expect(soSql).toContain('i.uom_base as uom');
    expect(soSql).not.toContain("coalesce(sol.ext_data->>'order_uom', i.uom_base)");
    expect(soSql).not.toContain('sbc.quantity / (i_s.net_qty_per_each * i_s.each_per_box)');
    expect(soSql).toContain('when so.promised_ship_date is null and so.required_delivery_date is null');
    expect(soSql).toContain('then $3::date');
    expect(soSql).toContain('<= $2::date');
    expect(soSql).not.toContain("'draft'");
    expect(soSql).not.toContain("'cancelled'");
  });

  /**
   * Mirrors the canonical open-SO remainder in mrp.ts — both ordered and shipped are inventory/base qty.
   */
  function openSoRemainderCanonical(orderedCanonical: number, shippedBase: number): number {
    return Math.max(orderedCanonical - shippedBase, 0);
  }

  it('nets partially shipped case order in canonical inventory UoM (wave 8)', () => {
    // 3 cases × 12 each_per_box = 36 pcs ordered; 12 pcs shipped → 24 pcs open demand.
    expect(openSoRemainderCanonical(36, 12)).toBe(24);
  });

  it('nets partially shipped pallet order in canonical inventory UoM (wave 8)', () => {
    // 2 pallets × 48 boxes/pallet × 12 each/box = 1152 pcs ordered; 144 pcs shipped → 1008 remainder.
    expect(openSoRemainderCanonical(1152, 144)).toBe(1008);
  });

  it('nets canonical SO remainder after shipped base qty through computeMrpPhased (P2-05)', async () => {
    // SQL remainder: 500 kg ordered − 50 kg shipped = 450 kg base demand.
    soDemandRows = [{ product_id: FLOUR_ID, uom: 'kg', need_date: MOCK_NEED_DATE, qty: '450.000' }];

    const result = await runMrp();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flour = result.data.rows.find((r) => r.itemCode === 'RM-FLOUR')!;
    expect(flour.soDemand).toBe('450.000');
    expect(flour.demand).toBe('530.000'); // 80 dependent + 450 SO
  });

  it('nets canonical each-UoM SO remainder through computeMrpPhased (P2-05)', async () => {
    // SQL remainder: 450 kg ordered − 50 kg shipped = 400 kg base demand.
    soDemandRows = [{ product_id: FLOUR_ID, uom: 'kg', need_date: MOCK_NEED_DATE, qty: '400.000' }];

    const result = await runMrp();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flour = result.data.rows.find((r) => r.itemCode === 'RM-FLOUR')!;
    expect(flour.soDemand).toBe('400.000');
    expect(flour.demand).toBe('480.000'); // 80 dependent + 400 SO
    expect(flour.excludedUoms).toEqual([]);
  });

  it('excludes non-base SO demand when pack metadata is missing (compute excludedUoms)', async () => {
    // flourPackHierarchy stays false → net_qty_per_each/each_per_box are null on the item.
    // SO demand is already canonical (uom_base); computeMrpPhased passes kg through directly.
    soDemandRows = [{ product_id: FLOUR_ID, uom: 'kg', need_date: MOCK_NEED_DATE, qty: '10.000' }];

    const result = await runMrp();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flour = result.data.rows.find((r) => r.itemCode === 'RM-FLOUR')!;
    expect(flour.excludedUoms).toEqual([]);
    expect(flour.soDemand).toBe('10.000');
    expect(flour.demand).toBe('90.000'); // 80 dependent + 10 SO
    expect(flour.net).toBe('-35.000'); // baseline −25 worsened by 10 kg SO demand
  });

  it('buckets undated confirmed SO demand on the run date and surfaces a warning (P2-06)', async () => {
    const todayIso = new Date().toISOString().slice(0, 10);
    soDemandRows = [{ product_id: FLOUR_ID, uom: 'kg', need_date: todayIso, qty: '12.000' }];
    undatedSoLinesMock = 1;

    const result = await runMrp();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.warnings).toEqual({ undatedSoLines: 1 });
    const flour = result.data.rows.find((r) => r.itemCode === 'RM-FLOUR')!;
    expect(flour.soDemand).toBe('12.000');
    const firstBucket = result.data.bucketRows.find((r) => r.itemCode === 'RM-FLOUR' && r.bucketIndex === 0)!;
    expect(firstBucket.soDemand).toBe('12.000');
  });

  it('does not count draft/cancelled SO statuses in open demand filters (P2-06 guard)', async () => {
    await runMrp();
    const soSql = executed.find((sql) => sql.includes('from public.sales_order_lines') && sql.includes('need_date'))!;
    expect(soSql).toContain("so.status = any($1::text[])");
    expect(soSql).not.toContain("'draft'");
    expect(soSql).not.toContain("'cancelled'");
    expect(OPEN_SO_DEMAND_STATUS_EXPECTATION).not.toContain('draft');
    expect(OPEN_SO_DEMAND_STATUS_EXPECTATION).not.toContain('cancelled');
    expect(OPEN_SO_DEMAND_STATUS_EXPECTATION).not.toContain('delivered');
  });

  it('nets partial SO shipment as ordered minus shipped aggregate (6 of 10 → demand 4)', async () => {
    // SQL: greatest(10 - 6, 0) = 4 on a confirmed/manifested SO line.
    soDemandRows = [{ product_id: FLOUR_ID, uom: 'kg', need_date: MOCK_NEED_DATE, qty: '4.000' }];

    const result = await runMrp();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flour = result.data.rows.find((r) => r.itemCode === 'RM-FLOUR')!;
    expect(flour.demand).toBe('84.000'); // 80 dependent + 4 SO remainder
    expect(flour.soDemand).toBe('4.000');
    expect(flour.net).toBe('-29.000');
  });

  it('includes partially_delivered SO status in open demand filter (NN-PLAN-4)', async () => {
    // Multi-shipment order with one delivery: SO → partially_delivered; open line
    // balance must still feed MRP when the SQL aggregate leaves remainder > 0.
    soDemandRows = [{ product_id: FLOUR_ID, uom: 'kg', need_date: MOCK_NEED_DATE, qty: '7.000' }];

    const result = await runMrp();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flour = result.data.rows.find((r) => r.itemCode === 'RM-FLOUR')!;
    expect(flour.soDemand).toBe('7.000');
    expect(flour.demand).toBe('87.000'); // 80 dependent + 7 SO remainder
  });

  it('nets fully shipped SO line to zero demand (ordered − shipped aggregate)', async () => {
    // SQL: greatest(10 - 10, 0) = 0 — row dropped from grouped demand.
    soDemandRows = [];

    const result = await runMrp();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flour = result.data.rows.find((r) => r.itemCode === 'RM-FLOUR')!;
    expect(flour.soDemand).toBe('0.000');
    expect(flour.demand).toBe('80.000'); // dependent only
    expect(flour.net).toBe('-25.000'); // baseline without SO demand
  });

  it('tags the persisted run/requirement as forecast-driven when a forecast feeds an item (E6)', async () => {
    forecastRows = [{ product_id: FLOUR_ID, uom: 'kg', iso_week: '2026-W24', qty: '30.000' }];
    const result = await runMrp({ persist: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Run header demand_source flips to 'forecast' (mrp_runs_demand_source_check).
    // params: [run_number, horizon, paramsJson, reqCount, exceptionCount, startedAt, createdBy, plannedCount, demandSource]
    expect(runInserts).toHaveLength(1);
    expect(runInserts[0][8]).toBe('forecast');

    // mrp_requirements: source_type='independent' for the forecasted flour row,
    // 'dependent' for dough. params: [run, item, bucket, gross, receipts, projected, net_req, uom, exception, source_type]
    const flourReqs = reqInserts.filter((p) => p[1] === FLOUR_ID);
    const doughReq = reqInserts.find((p) => p[1] === DOUGH_ID)!;
    const flourGrossTotal = flourReqs.reduce((sum, p) => sum + Number(p[3]), 0);
    expect(flourGrossTotal).toBe(110);
    expect(flourReqs.some((p) => p[9] === 'independent')).toBe(true);
    expect(doughReq[9]).toBe('dependent');
  });

  it('keeps demand_source=manual + source_type=dependent with no forecasts (default)', async () => {
    const result = await runMrp({ persist: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(runInserts[0][8]).toBe('manual');
    for (const req of reqInserts) expect(req[9]).toBe('dependent');
  });

  it('persists the selected horizon_weeks in params_jsonb', async () => {
    const result = await runMrp({ persist: true, horizonWeeks: 4 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.parse(String(runInserts[0][2])).horizon_weeks).toBe(4);
  });

  it('routes a finished-good shortage to a make planned order and WO conversion, never PO', async () => {
    includeFinishedGood = true;
    forecastRows = [{ product_id: FG_ID, uom: 'kg', qty: '9.000', iso_week: MOCK_ISO_WEEK }];

    const result = await runMrp({ persist: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const fgRow = result.data.rows.find((r) => r.itemCode === 'FG-BREAD')!;
    expect(fgRow.itemType).toBe('fg');
    expect(fgRow.net).toBe('-9.000');
    expect(fgRow.suggestedAction).toMatchObject({ type: 'make', qty: '9', supplierId: null });

    const fgPlannedInsert = plannedInserts.find((p) => p[2] === FG_ID)!;
    expect(fgPlannedInsert[3]).toBe('wo');
    const fgPlanned = result.data.plannedOrders.find((po) => po.itemId === FG_ID)!;
    expect(fgPlanned.type).toBe('make');

    conversionRows = [
      {
        id: FG_PLANNED_ID,
        item_id: FG_ID,
        site_id: SITE_ID,
        item_code: 'FG-BREAD',
        item_name: 'Finished bread',
        order_type: 'wo',
        quantity: '9.000000',
        uom: 'kg',
        due_date: fgPlanned.needBy,
        supplier_id: null,
        release_status: 'suggested',
      },
    ];

    const woResult = await convertPlannedToWo([FG_PLANNED_ID]);
    expect(woResult).toEqual({ ok: true, created: 1, woIds: [workOrderInserts[0][0]], skipped: [] });
    expect(workOrderInserts).toHaveLength(1);
    expect(workOrderInserts[0][2]).toBe(FG_ID);
    expect(workOrderInserts[0][4]).toBe('9.000');
    expect(workOrderInserts[0][11]).toBe(SITE_ID);

    createPurchaseOrderCoreMock.mockClear();
    const poResult = await convertPlannedToPo([FG_PLANNED_ID]);
    expect(poResult).toEqual({
      ok: true,
      created: 0,
      poIds: [],
      skipped: [{ id: FG_PLANNED_ID, reason: 'not a buy planned order' }],
      priceWarnings: [],
    });
    expect(createPurchaseOrderCoreMock).not.toHaveBeenCalled();
  });

  it('persists the run header + per-item requirements per the mig-178 DDL ({ persist: true })', async () => {
    const result = await runMrp({ persist: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The run id/number from the insert surface on the result.
    expect(result.data.runId).toBe(RUN_ID);
    expect(result.data.runNumber).toMatch(/^MRP-\d{8}-[0-9A-F]{8}$/);

    // mrp_runs header: org-scoped insert, DDL columns, completed status.
    expect(runInserts).toHaveLength(1);
    const runSql = executed.find((sql) => sql.includes('insert into public.mrp_runs'))!;
    expect(runSql).toContain('app.current_org_id()');
    for (const col of [
      'site_id', 'run_number', 'status', 'demand_source', 'horizon_start', 'horizon_end',
      'bucket_days', 'params_jsonb', 'requirement_count', 'planned_order_count',
      'exception_count', 'started_at', 'completed_at', 'created_by',
    ]) {
      expect(runSql, `mrp_runs insert missing ${col}`).toContain(col);
    }
    const today = result.data.ranAt.slice(0, 10);
    const bucketStart = result.data.bucketDates[0] ?? bucketStartForRunDate(today);
    const [runNumber, horizon, paramsJson, reqCount, exceptionCount, startedAt, createdBy, plannedCount] = runInserts[0];
    expect(runNumber).toBe(result.data.runNumber);
    expect(horizon).toBe(bucketStart);
    expect(JSON.parse(paramsJson as string)).toMatchObject({ slice: 'c3b-phased', suggested_actions: 2 });
    expect(reqCount).toBe(2);
    expect(exceptionCount).toBe(2);
    expect(startedAt).toBe(result.data.ranAt);
    expect(createdBy).toBe(USER_ID);
    expect(plannedCount).toBe(2);
    expect(runInserts[0][11]).toBe(SITE_ID);

    // mrp_requirements: one DDL-shaped row per active bucket, idempotent upsert.
    expect(reqInserts).toHaveLength(2);
    const reqSql = executed.find((sql) => sql.includes('insert into public.mrp_requirements'))!;
    expect(reqSql).toContain('app.current_org_id()');
    expect(reqSql).toContain('on conflict on constraint mrp_requirements_run_item_bucket_unique');
    expect(reqSql).toContain('do update set');

    const flourReq = reqInserts.find((p) => p[1] === FLOUR_ID && p[3] === '80.000')!;
    const doughReq = reqInserts.find((p) => p[1] === DOUGH_ID && p[3] === '20.000')!;
    expect(flourReq[2]).toBe(bucketStart);
    expect(flourReq[3]).toBe('80.000');
    expect(flourReq[9]).toBe('dependent');
    expect(doughReq[2]).toBe(bucketStart);
    expect(doughReq[9]).toBe('dependent');

    expect(plannedInserts).toHaveLength(2);
    expect(plannedInserts.some((p) => p[2] === FLOUR_ID)).toBe(true);
    expect(plannedInserts.some((p) => p[2] === DOUGH_ID)).toBe(true);
    expect(result.data.plannedOrders).toHaveLength(2);

    const outboxSql = executed.find((sql) => sql.includes('insert into public.outbox_events'))!;
    expect(outboxSql).toContain('planning-mrp-v1');
    expect(outboxInserts).toEqual([
      [
        'planning.mrp.completed',
        RUN_ID,
        JSON.stringify({
          run_id: RUN_ID,
          actor_user_id: USER_ID,
          counts: { requirements: 2, planned_orders: 2 },
        }),
      ],
    ]);
  });

  it('refuses to persist without the planning WRITE permission (npd.planning.write)', async () => {
    allowWritePermission = false;
    const result = await runMrp({ persist: true });
    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(runInserts).toHaveLength(0);
    expect(reqInserts).toHaveLength(0);
  });

  it('never writes without { persist: true } (default stays read-only)', async () => {
    const result = await runMrp();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.runId).toBeNull();
    expect(result.data.runNumber).toBeNull();
    expect(runInserts).toHaveLength(0);
    expect(reqInserts).toHaveLength(0);
  });
});

describe('listMrpRuns', () => {
  it('lists persisted runs (org-scoped, newest first), camel-mapped', async () => {
    const result = await listMrpRuns();
    expect(result).toEqual({
      ok: true,
      data: [
        {
          id: RUN_ID,
          runNumber: 'MRP-20260611-AAAA1111',
          status: 'completed',
          horizonStart: '2026-06-11',
          requirementCount: 2,
          exceptionCount: 1,
          createdAt: '2026-06-11T10:00:00.000Z',
        },
      ],
    });
    const sql = executed.find((s) => s.includes('from public.mrp_runs'))!;
    expect(sql).toContain('app.current_org_id()');
    expect(sql).toContain('app.current_site_id() is null or site_id = app.current_site_id()');
    expect(sql).not.toContain('site_id is null or site_id = app.current_site_id()');
    expect(sql).toContain('order by created_at desc');
    expect(sql).toContain('created_at');
  });

  it('B1c: maps created_at separately from horizon_start for the runs list', async () => {
    const result = await listMrpRuns();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = result.data[0]!;
    expect(row.createdAt).toBe('2026-06-11T10:00:00.000Z');
    expect(row.horizonStart).toBe('2026-06-11');
    expect(row.createdAt).not.toBe(row.horizonStart);
  });

  it('returns forbidden without the read permission', async () => {
    allowPermission = false;
    expect(await listMrpRuns()).toEqual({ ok: false, error: 'forbidden' });
  });
});

describe('convertPlannedToPo', () => {
  it('groups buy planned orders by supplier and calls createPurchaseOrderCore on the outer ctx', async () => {
    conversionRows = [
      {
        id: PO_PLANNED_ID,
        site_id: SITE_ID,
        item_id: FLOUR_ID,
        item_code: 'RM-FLOUR',
        item_name: 'Wheat flour',
        order_type: 'po',
        quantity: '25.000000',
        uom: 'kg',
        due_date: '2026-06-18',
        supplier_id: SUPPLIER_ID,
        release_status: 'suggested',
      },
    ];

    const result = await convertPlannedToPo([PO_PLANNED_ID]);

    expect(result).toEqual({ ok: true, created: 1, poIds: [PO_ID], skipped: [], priceWarnings: [] });
    expect(createPurchaseOrderCoreMock).toHaveBeenCalledWith(
      { userId: USER_ID, orgId: ORG_ID, client },
      {
        supplierId: SUPPLIER_ID,
        status: 'draft',
        expectedDelivery: '2026-06-18',
        currency: 'GBP',
        notes: 'Created from MRP planned orders',
        lines: [{ itemId: FLOUR_ID, qty: '25.000', uom: 'kg', unitPrice: '6.2500', taxPct: '0', lineNo: 1 }],
      },
    );
    expect(releasedUpdates).toEqual([[[PO_PLANNED_ID], PO_ID]]);
    const priceSql = executed.find((sql) => sql.includes('join public.supplier_specs ss'));
    expect(priceSql).toContain('ss.lifecycle_status = \'active\'');
    expect(priceSql).toContain('ss.review_status = \'approved\'');
    expect(priceSql).toContain('ss.unit_price is not null');
  });

  it('keeps unitPrice 0 and surfaces a warning when no supplier spec price exists', async () => {
    supplierSpecUnitPrice = null;
    itemListPriceGbp = null;
    conversionRows = [
      {
        id: PO_PLANNED_ID,
        site_id: SITE_ID,
        item_id: FLOUR_ID,
        item_code: 'RM-FLOUR',
        item_name: 'Wheat flour',
        order_type: 'po',
        quantity: '25.000000',
        uom: 'kg',
        due_date: '2026-06-18',
        supplier_id: SUPPLIER_ID,
        release_status: 'suggested',
      },
    ];

    const result = await convertPlannedToPo([PO_PLANNED_ID]);

    expect(result).toEqual({
      ok: true,
      created: 1,
      poIds: [PO_ID],
      skipped: [],
      priceWarnings: [{ id: PO_PLANNED_ID, reason: 'missing supplier spec price' }],
    });
    expect(createPurchaseOrderCoreMock.mock.calls[0]?.[1]).toMatchObject({
      lines: [{ itemId: FLOUR_ID, qty: '25.000', uom: 'kg', unitPrice: '0', taxPct: '0', lineNo: 1 }],
    });
  });

  it('flatten: convertPlannedToPo opens exactly one withSiteContext and does not nest another', async () => {
    conversionRows = [
      {
        id: PO_PLANNED_ID,
        site_id: SITE_ID,
        item_id: FLOUR_ID,
        item_code: 'RM-FLOUR',
        item_name: 'Wheat flour',
        order_type: 'po',
        quantity: '25.000000',
        uom: 'kg',
        due_date: '2026-06-18',
        supplier_id: SUPPLIER_ID,
        release_status: 'suggested',
      },
    ];
    vi.mocked(withSiteContext).mockClear();

    await convertPlannedToPo([PO_PLANNED_ID]);

    expect(vi.mocked(withSiteContext)).toHaveBeenCalledTimes(1);
    expect(createPurchaseOrderCoreMock).toHaveBeenCalledTimes(1);
    expect(createPurchaseOrderCoreMock.mock.calls[0]?.[0]).toEqual({
      userId: USER_ID,
      orgId: ORG_ID,
      client,
    });
    const conversionSelect = executed.find((sql) => sql.includes('from public.mrp_planned_orders') && sql.includes('for update of po'))!;
    expect(conversionSelect).toContain('app.current_site_id() is null or po.site_id = app.current_site_id()');
  });

  it('skips buy planned orders without a supplier', async () => {
    conversionRows = [
      {
        id: PO_PLANNED_ID,
        site_id: SITE_ID,
        item_id: FLOUR_ID,
        item_code: 'RM-FLOUR',
        item_name: 'Wheat flour',
        order_type: 'po',
        quantity: '25.000000',
        uom: 'kg',
        due_date: '2026-06-18',
        supplier_id: null,
        release_status: 'suggested',
      },
    ];

    const result = await convertPlannedToPo([PO_PLANNED_ID]);

    expect(result).toEqual({ ok: true, created: 0, poIds: [], skipped: [{ id: PO_PLANNED_ID, reason: 'missing supplier' }], priceWarnings: [] });
    expect(createPurchaseOrderCoreMock).not.toHaveBeenCalled();
  });

  it('returns not_found for a buy planned order on another site', async () => {
    boundSiteId = SITE_ID;
    conversionRows = [
      {
        id: PO_PLANNED_ID,
        site_id: OTHER_SITE_ID,
        item_id: FLOUR_ID,
        item_code: 'RM-FLOUR',
        item_name: 'Wheat flour',
        order_type: 'po',
        quantity: '25.000000',
        uom: 'kg',
        due_date: '2026-06-18',
        supplier_id: SUPPLIER_ID,
        release_status: 'suggested',
      },
    ];

    const result = await convertPlannedToPo([PO_PLANNED_ID]);

    expect(result).toEqual({
      ok: true,
      created: 0,
      poIds: [],
      skipped: [{ id: PO_PLANNED_ID, reason: 'not found' }],
      priceWarnings: [],
    });
    expect(createPurchaseOrderCoreMock).not.toHaveBeenCalled();
    expect(releasedUpdates).toHaveLength(0);
  });

  describe('price resolution', () => {
    const baseConversionRow = {
      id: PO_PLANNED_ID,
      site_id: SITE_ID,
      item_id: FLOUR_ID,
      item_code: 'RM-FLOUR',
      item_name: 'Wheat flour',
      order_type: 'po',
      quantity: '25.000000',
      uom: 'kg',
      due_date: '2026-06-18',
      supplier_id: SUPPLIER_ID,
      release_status: 'suggested',
    };

    it('(a) uses the supplier spec price when an approved spec exists — list_price_gbp is ignored', async () => {
      // supplierSpecUnitPrice defaults to '6.2500', itemListPriceGbp to '5.0000'.
      conversionRows = [baseConversionRow];

      const result = await convertPlannedToPo([PO_PLANNED_ID]);

      expect(result).toEqual({ ok: true, created: 1, poIds: [PO_ID], skipped: [], priceWarnings: [] });
      expect(createPurchaseOrderCoreMock.mock.calls[0]?.[1]).toMatchObject({
        lines: [{ itemId: FLOUR_ID, unitPrice: '6.2500' }],
      });
      // The list_price fallback query must NOT have been issued.
      expect(executed.some((sql) => sql.includes('list_price_gbp'))).toBe(false);
    });

    it('(b) falls back to items.list_price_gbp when no approved supplier spec price exists', async () => {
      supplierSpecUnitPrice = null;
      // itemListPriceGbp stays '5.0000'.
      conversionRows = [baseConversionRow];

      const result = await convertPlannedToPo([PO_PLANNED_ID]);

      expect(result).toEqual({
        ok: true,
        created: 1,
        poIds: [PO_ID],
        skipped: [],
        priceWarnings: [{ id: PO_PLANNED_ID, reason: 'list_price_fallback' }],
      });
      expect(createPurchaseOrderCoreMock.mock.calls[0]?.[1]).toMatchObject({
        lines: [{ itemId: FLOUR_ID, unitPrice: '5.0000' }],
      });
      // The fallback query must have been issued with correct RLS predicate.
      const fallbackSql = executed.find((sql) => sql.includes('list_price_gbp'))!;
      expect(fallbackSql).toBeTruthy();
      expect(fallbackSql).toContain('app.current_org_id()');
    });

    it('(b2) does not use list_price_gbp for non-GBP supplier — unitPrice 0 with missing-spec warning', async () => {
      supplierCurrency = 'EUR';
      supplierSpecUnitPrice = null;
      conversionRows = [baseConversionRow];

      const result = await convertPlannedToPo([PO_PLANNED_ID]);

      expect(result).toEqual({
        ok: true,
        created: 1,
        poIds: [PO_ID],
        skipped: [],
        priceWarnings: [{ id: PO_PLANNED_ID, reason: 'missing supplier spec price' }],
      });
      expect(createPurchaseOrderCoreMock.mock.calls[0]?.[1]).toMatchObject({
        currency: 'EUR',
        lines: [{ itemId: FLOUR_ID, unitPrice: '0' }],
      });
      expect(executed.some((sql) => sql.includes('list_price_gbp'))).toBe(false);
    });

    it('(c) keeps unitPrice \'0\' and emits missing-spec warning only when neither spec nor list price exists', async () => {
      supplierSpecUnitPrice = null;
      itemListPriceGbp = null;
      conversionRows = [baseConversionRow];

      const result = await convertPlannedToPo([PO_PLANNED_ID]);

      expect(result).toEqual({
        ok: true,
        created: 1,
        poIds: [PO_ID],
        skipped: [],
        priceWarnings: [{ id: PO_PLANNED_ID, reason: 'missing supplier spec price' }],
      });
      expect(createPurchaseOrderCoreMock.mock.calls[0]?.[1]).toMatchObject({
        lines: [{ itemId: FLOUR_ID, unitPrice: '0' }],
      });
    });
  });
});

describe('convertPlannedToWo', () => {
  it('inlines WO creation for make planned orders with an active BOM', async () => {
    conversionRows = [
      {
        id: WO_PLANNED_ID,
        site_id: SITE_ID,
        item_id: DOUGH_ID,
        item_code: 'INT-DOUGH',
        item_name: 'Bread dough',
        order_type: 'wo',
        quantity: '8.000000',
        uom: 'kg',
        due_date: '2026-06-18',
        supplier_id: null,
        release_status: 'suggested',
      },
    ];

    const result = await convertPlannedToWo([WO_PLANNED_ID]);

    const woId = workOrderInserts[0][0] as string;
    expect(result).toEqual({ ok: true, created: 1, woIds: [woId], skipped: [] });
    expect(workOrderInserts).toHaveLength(1);
    expect(workOrderInserts[0][2]).toBe(DOUGH_ID);
    expect(workOrderInserts[0][3]).toBe('bom-id');
    expect(workOrderInserts[0][4]).toBe('8.000');
    expect(workOrderInserts[0][5]).toBe('INT-DOUGH');
    expect(workOrderInserts[0][10]).toBe('factory-spec-id');
    expect(workOrderInserts[0][11]).toBe(SITE_ID);
    expect(woMaterialInserts).toEqual([[woId, '8.000000', 1, 'bom-id']]);
    const materialInsertSql = executed.find((sql) => sql.startsWith('insert into public.wo_materials'))!;
    expect(materialInsertSql).toContain('select app.current_org_id(), $1::uuid, i.id, bl.component_code');
    expect(materialInsertSql).not.toContain('coalesce(i.id, bl.id)');
    expect(woOperationInserts).toEqual([[woId, '8.000', DOUGH_ID]]);
    expect(scheduleOutputInserts).toEqual([[woId, DOUGH_ID, '8.000', 'Created from MRP planned order', 'kg', SITE_ID]]);
    expect(woStatusHistoryInserts).toEqual([
      [woId, USER_ID, JSON.stringify({ app_version: 'planning-work-orders-v1', bom_header_id: 'bom-id' })],
    ]);
    expect(releasedUpdates).toEqual([[[WO_PLANNED_ID], woId]]);
    const conversionSelect = executed.find((sql) => sql.includes('from public.mrp_planned_orders') && sql.includes('for update of po'))!;
    expect(conversionSelect).toContain('po.site_id');
    expect(conversionSelect).toContain('app.current_site_id() is null or po.site_id = app.current_site_id()');
    const releaseUpdate = executed.find((sql) => sql.startsWith('update public.mrp_planned_orders'))!;
    expect(releaseUpdate).toContain("release_status in ('suggested', 'firm')");
    expect(releaseUpdate).toContain('app.current_site_id() is null or site_id = app.current_site_id()');
    expect(executed.find((sql) => sql.startsWith('insert into public.work_orders'))).toContain('site_id');
    expect(executed.find((sql) => sql.startsWith('insert into public.schedule_outputs'))).toContain('site_id');
  });

  it('skips make planned orders with no active BOM before inlining WO creation', async () => {
    hasActiveBom = false;
    conversionRows = [
      {
        id: WO_PLANNED_ID,
        site_id: SITE_ID,
        item_id: DOUGH_ID,
        item_code: 'INT-DOUGH',
        item_name: 'Bread dough',
        order_type: 'wo',
        quantity: '8.000000',
        uom: 'kg',
        due_date: '2026-06-18',
        supplier_id: null,
        release_status: 'suggested',
      },
    ];

    const result = await convertPlannedToWo([WO_PLANNED_ID]);

    expect(result).toEqual({ ok: true, created: 0, woIds: [], skipped: [{ id: WO_PLANNED_ID, reason: 'no active BOM' }] });
    expect(workOrderInserts).toHaveLength(0);
    expect(releasedUpdates).toHaveLength(0);
  });

  it('returns not_found for a make planned order on another site', async () => {
    boundSiteId = SITE_ID;
    conversionRows = [
      {
        id: WO_PLANNED_ID,
        site_id: OTHER_SITE_ID,
        item_id: DOUGH_ID,
        item_code: 'INT-DOUGH',
        item_name: 'Bread dough',
        order_type: 'wo',
        quantity: '8.000000',
        uom: 'kg',
        due_date: '2026-06-18',
        supplier_id: null,
        release_status: 'suggested',
      },
    ];

    const result = await convertPlannedToWo([WO_PLANNED_ID]);

    expect(result).toEqual({
      ok: true,
      created: 0,
      woIds: [],
      skipped: [{ id: WO_PLANNED_ID, reason: 'not found' }],
    });
    expect(workOrderInserts).toHaveLength(0);
    expect(releasedUpdates).toHaveLength(0);
  });
});

describe('getMrpRunRequirements', () => {
  it('rejects a non-uuid run id', async () => {
    expect(await getMrpRunRequirements('not-a-uuid')).toEqual({ ok: false, error: 'invalid_input' });
    expect(executed).toHaveLength(0);
  });

  it('returns the item-labelled requirement ledger of one run', async () => {
    const result = await getMrpRunRequirements(RUN_ID);
    expect(result).toEqual({
      ok: true,
      data: [
        {
          itemId: FLOUR_ID,
          itemCode: 'RM-FLOUR',
          itemName: 'Wheat flour',
          bucketDate: '2026-06-11',
          grossRequirement: '80.000',
          scheduledReceipts: '25.000',
          projectedOnHand: '-25.000',
          netRequirement: '25.000',
          uom: 'kg',
          exceptionType: 'shortage',
        },
      ],
    });
    const sql = executed.find((s) => s.includes('from public.mrp_requirements'))!;
    expect(sql).toContain('app.current_org_id()');
  });

  it('returns forbidden without the read permission', async () => {
    allowPermission = false;
    expect(await getMrpRunRequirements(RUN_ID)).toEqual({ ok: false, error: 'forbidden' });
  });
});

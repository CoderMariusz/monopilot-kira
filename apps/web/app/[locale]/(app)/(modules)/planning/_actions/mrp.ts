'use server';

/**
 * W9-M2 — runMrp: read-first MRP vertical (04-planning T-032 family, first slice).
 * CL2 slice 2 — optional PERSISTENCE into the mig-178 tables + reorder thresholds:
 *
 *   - runMrp({ persist: true }) additionally writes ONE mrp_runs header row
 *     (status='completed', org-unique run_number, requirement/exception counts)
 *     and one mrp_requirements row PER ITEM (bucket_date = today, bom_level 0 —
 *     this slice nets a single bucket with no BOM explosion; the (run_id,
 *     item_id, bucket_date, bom_level) unique key makes the per-run write
 *     idempotent via ON CONFLICT DO UPDATE). mrp_planned_orders is NOT written
 *     in this slice — planned_order_count stays 0 (honest) and the on-screen
 *     suggestion count goes into params_jsonb instead.
 *   - reorder_thresholds (mig 178) now feeds the netting: below-min severity +
 *     reorder-lot suggestions + due dates from suppliers.lead_time_days (mig
 *     261) via preferred_supplier_id. Semantics documented in mrp-compute.ts.
 *
 * All reads run inside withOrgContext as app_user, RLS-scoped via
 * app.current_org_id() — no service-role bypass.
 *
 * Demand / supply sources (see mrp-compute.ts for the netting formula + caveats):
 *   - demand:      wo_materials (required − consumed) on DRAFT/RELEASED/IN_PROGRESS WOs (mig 176)
 *                  — DEPENDENT demand (BOM-driven)
 *   - forecast:    demand_forecasts.qty (mig 302, base UoM) for iso_week >= the current
 *                  ISO week (the run horizon) — INDEPENDENT demand entered on
 *                  /planning/forecasts. Folded into the item's gross requirement; when an
 *                  item receives any forecast the persisted requirement is tagged
 *                  source_type='independent' and the run demand_source flips to 'forecast'.
 *   - on-hand:     v_inventory_available (mig 191; status=available + qa released)
 *   - PO supply:   purchase_order_lines remainder (qty − Σ grn_items.received_qty,
 *                  non-cancelled GRNs — same join shape as purchase-orders/_actions
 *                  fetchLines) on open POs (sent/confirmed/partially_received)
 *   - production:  schedule_outputs.expected_qty (mig 177, planning-owned) of open
 *                  WOs with disposition='to_stock' — intermediates incoming supply
 *   - thresholds:  reorder_thresholds (mig 178) + suppliers.lead_time_days (mig 261)
 *
 * RBAC: reads gate on `scheduler.run.read` (the planning READ gate the dashboard
 * + module-registry use). Persisting is a WRITE and additionally gates on
 * `npd.planning.write` — the same permission family PO/TO creates use
 * (procurement-shared hasPlanningWritePermission).
 */
import { randomUUID } from 'node:crypto';

import { nextDocumentNumber } from '../../../../../../lib/documents/numbering';
import { snapshotFromItemRow, toBaseQty } from '../../../../../../lib/uom/convert';
import { createPurchaseOrder } from '../purchase-orders/_actions/actions';
import { APP_VERSION, isPgError } from '../work-orders/_actions/shared';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { hasPlanningWritePermission, writeProcurementAudit, type OrgActionContext } from './procurement-shared';
import {
  computeMrp,
  type MrpItemRow,
  type MrpKpis,
  type MrpOnHandBucket,
  type MrpQtyBucket,
  type MrpRow,
  type MrpThresholdRow,
} from './mrp-compute';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

/** Planning read gate — byte-matches the module-registry planning-basic gate. */
const PLANNING_READ_PERMISSION = 'scheduler.run.read';

/** WO statuses whose materials count as open demand / whose outputs count as incoming supply. */
const OPEN_WO_STATUSES = ['DRAFT', 'RELEASED', 'IN_PROGRESS'];
/** PO statuses that represent committed open supply (draft POs are not yet committed). */
const OPEN_PO_STATUSES = ['sent', 'confirmed', 'partially_received'];
/** Item types planned by MRP. FG shortages can create planned WOs when an active BOM exists. */
const MRP_ITEM_TYPES = ['rm', 'ingredient', 'intermediate', 'packaging', 'fg'];
const MRP_COMPLETED_EVENT = 'planning.mrp.completed';
const PLANNING_MRP_CONVERT_PERMISSION = 'planning.mrp.convert';

/**
 * Current ISO-8601 week label (e.g. '2026-W25') for a UTC date — the forecast
 * horizon floor: runMrp nets demand_forecasts cells whose iso_week is at or after
 * this. The `YYYY-Www` zero-padded format sorts lexicographically == chronologically,
 * so the SQL filter is a plain string comparison. (Same Thursday rule as
 * forecasts.ts buildForecastWeeks.)
 */
function currentIsoWeek(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - day + 3); // Thursday of this ISO week
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

export type MrpRunData = {
  /** ISO timestamp of this run. */
  ranAt: string;
  rows: MrpRow[];
  kpis: MrpKpis;
  /** Set ONLY when the run was persisted to mrp_runs ({ persist: true }). */
  runId: string | null;
  runNumber: string | null;
  plannedOrders: MrpPlannedOrder[];
};

export type MrpRunResult =
  | { ok: true; data: MrpRunData }
  | { ok: false; error: 'forbidden' | 'persistence_failed' };

export type MrpRunInput = { persist?: boolean };

export type MrpRunSummary = {
  id: string;
  runNumber: string;
  status: string;
  /** yyyy-mm-dd bucket date of the persisted snapshot. */
  horizonStart: string;
  requirementCount: number;
  exceptionCount: number;
  createdAt: string;
};

export type MrpRunRequirement = {
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  bucketDate: string;
  grossRequirement: string;
  scheduledReceipts: string;
  projectedOnHand: string;
  netRequirement: string;
  uom: string;
  exceptionType: string | null;
};

export type MrpPlannedOrderType = 'buy' | 'make' | 'transfer';

export type MrpPlannedOrder = {
  id: string;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  type: MrpPlannedOrderType;
  qty: string;
  uom: string;
  needBy: string;
  supplierId: string | null;
  status: string;
};

export type MrpConvertResult =
  | { ok: true; created: number; poIds?: string[]; woIds?: string[]; skipped: Array<{ id: string; reason: string }> }
  | { ok: false; error: 'forbidden' | 'invalid_input' | 'persistence_failed' };

export type MrpCancelResult =
  | { ok: true; cancelled: true }
  | { ok: false; error: 'forbidden' | 'invalid_input' | 'not_found' | 'invalid_state' | 'persistence_failed' };

export type MrpRunsListResult =
  | { ok: true; data: MrpRunSummary[] }
  | { ok: false; error: 'forbidden' | 'persistence_failed' };

export type MrpRunRequirementsResult =
  | { ok: true; data: MrpRunRequirement[] }
  | { ok: false; error: 'forbidden' | 'invalid_input' | 'persistence_failed' };

async function hasPlanningReadPermission(
  client: QueryClient,
  userId: string,
  orgId: string,
): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [userId, orgId, PLANNING_READ_PERMISSION],
  );
  return rows.length > 0;
}

async function hasMrpConvertPermission(client: QueryClient, userId: string, orgId: string): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [userId, orgId, PLANNING_MRP_CONVERT_PERMISSION],
  );
  return rows.length > 0;
}

export async function runMrp(input: MrpRunInput = {}): Promise<MrpRunResult> {
  const persist = input?.persist === true;
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<MrpRunResult> => {
      const c = client as QueryClient;

      if (!(await hasPlanningReadPermission(c, userId, orgId))) {
        return { ok: false, error: 'forbidden' };
      }
      // Persisting writes mrp_runs/mrp_requirements → the planning WRITE gate
      // (npd.planning.write — same family as PO/TO creates) must also hold.
      if (persist && !(await hasPlanningWritePermission({ userId, orgId, client: c }))) {
        return { ok: false, error: 'forbidden' };
      }

      // Single run timestamp — the netting bucket date AND the forecast horizon floor.
      const startedAt = new Date();
      const today = startedAt.toISOString().slice(0, 10);

      // 1) Item master — the MRP-planned item universe (pack hierarchy for UoM conversion).
      const items = await c.query<MrpItemRow>(
        `select i.id, i.item_code, i.name, i.item_type, i.uom_base,
                i.output_uom, i.net_qty_per_each::text as net_qty_per_each, i.each_per_box
           from public.items i
          where i.org_id = app.current_org_id()
            and i.item_type = any($1::text[])
            and i.status = 'active'`,
        [MRP_ITEM_TYPES],
      );

      // 2) On-hand + reserved from the FEFO read model (available + QA-released only).
      const onHand = await c.query<MrpOnHandBucket>(
        `select product_id, uom,
                sum(quantity)::text as on_hand,
                sum(reserved_qty)::text as reserved
           from public.v_inventory_available
          where org_id = app.current_org_id()
          group by product_id, uom`,
      );

      // 3) Demand — unconsumed BOM-snapshot materials on open WOs.
      const demand = await c.query<MrpQtyBucket>(
        `select m.product_id, m.uom,
                sum(greatest(m.required_qty - m.consumed_qty, 0))::text as qty
           from public.wo_materials m
           join public.work_orders w
             on w.id = m.wo_id
            and w.org_id = app.current_org_id()
            and w.status = any($1::text[])
          where m.org_id = app.current_org_id()
          group by m.product_id, m.uom`,
        [OPEN_WO_STATUSES],
      );

      // 3b) Independent (forecast) demand — demand_forecasts (mig 302), summed per
      //     item across the run horizon (every ISO-week at or after the current one;
      //     elapsed weeks are never re-netted). qty is ALREADY in the item's base
      //     UoM (uom = items.uom_base snapshot at write time) → no lib/uom
      //     conversion; the same MrpQtyBucket {product_id, uom, qty} shape as the
      //     other grouped demand reads so computeMrp nets it identically.
      const forecastDemand = await c.query<MrpQtyBucket>(
        `select f.item_id as product_id, f.uom,
                sum(f.qty)::text as qty
           from public.demand_forecasts f
          where f.org_id = app.current_org_id()
            and f.iso_week >= $1
          group by f.item_id, f.uom`,
        [currentIsoWeek(startedAt)],
      );

      // 4) Open-PO remainder — ordered minus received (grn_items on non-cancelled GRNs;
      //    same aggregate shape as purchase-orders/_actions/actions.ts fetchLines).
      const poSupply = await c.query<MrpQtyBucket>(
        `select l.item_id as product_id, l.uom,
                sum(greatest(l.qty - coalesce(rec.received_qty, 0), 0))::text as qty
           from public.purchase_order_lines l
           join public.purchase_orders po
             on po.id = l.po_id
            and po.org_id = app.current_org_id()
            and po.status = any($1::text[])
           left join (
             select gi.po_line_id, sum(gi.received_qty) as received_qty
               from public.grn_items gi
               join public.grns g
                 on g.id = gi.grn_id
                and g.org_id = app.current_org_id()
                and g.status <> 'cancelled'
              where gi.org_id = app.current_org_id()
                and gi.po_line_id is not null
                and gi.cancelled_at is null
              group by gi.po_line_id
           ) rec on rec.po_line_id = l.id
          where l.org_id = app.current_org_id()
          group by l.item_id, l.uom`,
        [OPEN_PO_STATUSES],
      );

      // 5) Planned production supply — schedule_outputs (planning-owned projection)
      //    of open WOs, to-stock only (direct_continue feeds a downstream WO, not
      //    stock; pending_decision is excluded conservatively).
      //
      //    Self-supply guard (Codex batch-D F2): a WO that CONSUMES product X to
      //    MAKE product X (rework / regrind) must not offset its own open material
      //    demand with its own projected output — that nets the loop to ~zero and
      //    hides the real shortage. Anti-join: drop any schedule_outputs row whose
      //    WO still has an open wo_materials demand row for the SAME product.
      const productionSupply = await c.query<MrpQtyBucket>(
        `select so.product_id, so.uom, sum(so.expected_qty)::text as qty
           from public.schedule_outputs so
           join public.work_orders w
             on w.id = so.planned_wo_id
            and w.org_id = app.current_org_id()
            and w.status = any($1::text[])
          where so.org_id = app.current_org_id()
            and so.disposition = 'to_stock'
            and not exists (
              select 1
                from public.wo_materials m
               where m.org_id = app.current_org_id()
                 and m.wo_id = so.planned_wo_id
                 and m.product_id = so.product_id
                 and m.required_qty > m.consumed_qty
            )
          group by so.product_id, so.uom`,
        [OPEN_WO_STATUSES],
      );

      // 6) Reorder thresholds (mig 178) + the preferred supplier's lead time
      //    (suppliers soft join, mig 261) — feeds below-min severity, reorder
      //    lots and suggested due dates.
      const thresholds = await c.query<MrpThresholdRow>(
        `select rt.item_id,
                rt.min_qty::text as min_qty,
                rt.reorder_qty::text as reorder_qty,
                rt.preferred_supplier_id,
                s.lead_time_days
           from public.reorder_thresholds rt
           left join public.suppliers s
             on s.org_id = app.current_org_id()
            and s.id = rt.preferred_supplier_id
          where rt.org_id = app.current_org_id()`,
      );

      const { rows, kpis } = computeMrp({
        items: items.rows,
        onHand: onHand.rows,
        demand: demand.rows,
        forecastDemand: forecastDemand.rows,
        poSupply: poSupply.rows,
        productionSupply: productionSupply.rows,
        thresholds: thresholds.rows,
        today,
      });

      let runId: string | null = null;
      let runNumber: string | null = null;
      if (persist) {
        const persisted = await persistMrpRun(c, userId, {
          today,
          startedAt,
          rows,
          kpis,
        });
        runId = persisted.runId;
        runNumber = persisted.runNumber;
      }

      const plannedOrders =
        persist && runId ? await listPlannedOrdersForRun(c, runId) : [];

      return { ok: true, data: { ranAt: startedAt.toISOString(), rows, kpis, runId, runNumber, plannedOrders } };
    });
  } catch (err) {
    console.error('[planning/mrp] runMrp failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

/**
 * Write the run header + per-item requirement ledger exactly per the mig-178
 * DDL. One mrp_runs row (org-unique run_number, status 'completed', horizon =
 * the single netting bucket [today, today], counts from the computed result)
 * and one mrp_requirements row per netted item plus planned supply suggestions
 * in mrp_planned_orders:
 *
 *   gross_requirement  = open WO demand           (NUMERIC >= 0 — row.demand)
 *   scheduled_receipts = open PO + WO supply       (NUMERIC >= 0 — row.openSupply)
 *   projected_on_hand  = the netted position       (row.net — may be negative)
 *   net_requirement    = unmet demand max(−net, 0)
 *   bucket_date        = today, bom_level = 0 (single bucket, no BOM explosion)
 *   source_type        = 'independent' when the item carried any demand_forecasts
 *                        contribution (mig 302), else 'dependent' (WO-material demand).
 *                        mrp_requirements_source_type_check allows only those two.
 *   exception_type     = 'shortage' when net < 0 (mig-178 CHECK list), else null
 *
 * The run header's demand_source flips from 'manual' to 'forecast' (a value
 * mrp_runs_demand_source_check already permits) whenever any forecast demand fed
 * the netting, so the run is attributable as forecast-driven.
 *
 * Decimal strings only — quantities never round-trip through JS floats.
 * Idempotent per run: the (run_id, item_id, bucket_date, bom_level) unique key
 * upserts via ON CONFLICT DO UPDATE. Planned orders are delete-and-reinserted
 * for the same run id so reruns do not duplicate suggestions.
 */
async function persistMrpRun(
  c: QueryClient,
  userId: string,
  input: { today: string; startedAt: Date; rows: MrpRow[]; kpis: MrpKpis },
): Promise<{ runId: string; runNumber: string }> {
  const { today, startedAt, rows, kpis } = input;
  const suggestionCount = rows.filter((r) => r.suggestedAction !== null).length;
  const runNumber = `MRP-${today.replace(/-/g, '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
  // Attribute the run as forecast-driven when any item carried independent
  // (demand_forecasts) demand — a value mrp_runs_demand_source_check permits.
  const hasForecastDemand = rows.some((r) => r.forecastDemand !== '0.000');
  const demandSource = hasForecastDemand ? 'forecast' : 'manual';

  const header = await c.query<{ id: string; run_number: string }>(
    `insert into public.mrp_runs
       (org_id, run_number, status, demand_source, horizon_start, horizon_end,
        bucket_days, params_jsonb, requirement_count, planned_order_count,
        exception_count, started_at, completed_at, created_by)
     values
       (app.current_org_id(), $1, 'completed', $9, $2::date, $2::date,
        1, $3::jsonb, $4::integer, $8::integer,
        $5::integer, $6::timestamptz, now(), $7::uuid)
     returning id, run_number`,
    [
      runNumber,
      today,
      JSON.stringify({
        slice: 'cl2-persist',
        item_types: MRP_ITEM_TYPES,
        suggested_actions: suggestionCount,
        items_below_min: kpis.itemsBelowMin,
        coverage_pct: kpis.coveragePct,
      }),
      rows.length,
      kpis.itemsShort,
      startedAt.toISOString(),
      userId,
      suggestionCount,
      demandSource,
    ],
  );
  const run = header.rows[0];
  if (!run) throw new Error('mrp_runs insert returned no row');

  const requirementIds = new Map<string, string>();
  for (const row of rows) {
    // row.net is a canonical 3-dp decimal string from microToFixed — the sign
    // test is exact on the string; |net| is a pure prefix strip (no floats).
    const isShort = row.net.startsWith('-');
    const netRequirement = isShort ? row.net.slice(1) : '0';
    // Independent demand (forecast) attribution — mrp_requirements_source_type_check
    // allows only 'independent' | 'dependent'. Any forecast contribution → independent.
    const sourceType = row.forecastDemand !== '0.000' ? 'independent' : 'dependent';
    const requirement = await c.query<{ id: string }>(
      `insert into public.mrp_requirements
         (org_id, run_id, item_id, bom_level, bucket_date, gross_requirement,
          scheduled_receipts, projected_on_hand, net_requirement, uom,
          source_type, exception_type)
       values
         (app.current_org_id(), $1::uuid, $2::uuid, 0, $3::date, $4::numeric,
          $5::numeric, $6::numeric, $7::numeric, $8,
          $10, $9)
       on conflict on constraint mrp_requirements_run_item_bucket_unique
       do update set gross_requirement = excluded.gross_requirement,
                     scheduled_receipts = excluded.scheduled_receipts,
                     projected_on_hand = excluded.projected_on_hand,
                     net_requirement = excluded.net_requirement,
                     uom = excluded.uom,
                     source_type = excluded.source_type,
                     exception_type = excluded.exception_type
       returning id`,
      [
        run.id,
        row.itemId,
        today,
        row.demand,
        row.openSupply,
        row.net,
        netRequirement,
        row.uomBase,
        isShort ? 'shortage' : null,
        sourceType,
      ],
    );
    if (requirement.rows[0]) requirementIds.set(row.itemId, requirement.rows[0].id);
  }

  await persistPlannedOrders(c, run.id, today, rows, requirementIds);
  await emitMrpCompletedEvent(c, userId, run.id, {
    requirements: rows.length,
    planned_orders: suggestionCount,
  });

  return { runId: run.id, runNumber: run.run_number };
}

function toPlannedOrderType(type: 'po' | 'to' | 'wo'): MrpPlannedOrderType {
  if (type === 'po') return 'buy';
  if (type === 'wo') return 'make';
  return 'transfer';
}

function toDbOrderType(type: NonNullable<MrpRow['suggestedAction']>['type']): 'po' | 'wo' {
  if (type === 'buy') return 'po';
  return 'wo';
}

function toBaseQtyString(row: MrpRow): string {
  const snap = snapshotFromItemRow({
    output_uom: 'base',
    uom_base: row.uomBase,
    net_qty_per_each: null,
    each_per_box: null,
    weight_mode: 'fixed',
  });
  return toBaseQty(snap, Number(row.suggestedAction?.qty ?? '0'), 'base').toFixed(3);
}

async function persistPlannedOrders(
  c: QueryClient,
  runId: string,
  today: string,
  rows: MrpRow[],
  requirementIds: Map<string, string>,
): Promise<void> {
  await c.query(
    `delete from public.mrp_planned_orders
      where org_id = app.current_org_id()
        and run_id = $1::uuid
        and release_status = 'suggested'`,
    [runId],
  );

  for (const row of rows) {
    if (!row.suggestedAction) continue;
    const dueDate = row.suggestedAction.dueDate ?? today;
    await c.query(
      `insert into public.mrp_planned_orders
         (org_id, run_id, requirement_id, item_id, order_type, quantity, uom,
          due_date, supplier_id, release_status, notes)
       values
         (app.current_org_id(), $1::uuid, $2::uuid, $3::uuid, $4, $5::numeric, $6,
          $7::date, $8::uuid, 'suggested', $9)`,
      [
        runId,
        requirementIds.get(row.itemId) ?? null,
        row.itemId,
        toDbOrderType(row.suggestedAction.type),
        toBaseQtyString(row),
        row.uomBase,
        dueDate,
        row.suggestedAction.supplierId,
        `MRP ${row.suggestedAction.type} suggestion for ${row.itemCode}`,
      ],
    );
  }
}

async function emitMrpCompletedEvent(
  c: QueryClient,
  userId: string,
  runId: string,
  counts: { requirements: number; planned_orders: number },
): Promise<void> {
  await c.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values
       (app.current_org_id(), $1, 'mrp_run', $2::uuid, $3::jsonb, 'planning-mrp-v1')`,
    [
      MRP_COMPLETED_EVENT,
      runId,
      JSON.stringify({ run_id: runId, actor_user_id: userId, counts }),
    ],
  );
}

async function listPlannedOrdersForRun(c: QueryClient, runId: string): Promise<MrpPlannedOrder[]> {
  const { rows } = await c.query<{
    id: string;
    item_id: string;
    item_code: string | null;
    item_name: string | null;
    order_type: 'po' | 'to' | 'wo';
    quantity: string;
    uom: string;
    due_date: string;
    supplier_id: string | null;
    release_status: string;
  }>(
    `select po.id, po.item_id, i.item_code, i.name as item_name,
            po.order_type, po.quantity::text as quantity, po.uom,
            po.due_date::text as due_date, po.supplier_id, po.release_status
       from public.mrp_planned_orders po
       left join public.items i
         on i.org_id = app.current_org_id()
        and i.id = po.item_id
      where po.org_id = app.current_org_id()
        and po.run_id = $1::uuid
      order by po.due_date asc, i.item_code asc`,
    [runId],
  );
  return rows.map((row) => ({
    id: row.id,
    itemId: row.item_id,
    itemCode: row.item_code,
    itemName: row.item_name,
    type: toPlannedOrderType(row.order_type),
    qty: row.quantity,
    uom: row.uom,
    needBy: row.due_date,
    supplierId: row.supplier_id,
    status: row.release_status,
  }));
}

/** Recent persisted MRP runs (newest first) — read-gated like runMrp. */
export async function listMrpRuns(): Promise<MrpRunsListResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<MrpRunsListResult> => {
      const c = client as QueryClient;
      if (!(await hasPlanningReadPermission(c, userId, orgId))) {
        return { ok: false, error: 'forbidden' };
      }
      const { rows } = await c.query<{
        id: string;
        run_number: string;
        status: string;
        horizon_start: string;
        requirement_count: number;
        exception_count: number;
        created_at: string | Date;
      }>(
        `select id, run_number, status, horizon_start::text as horizon_start,
                requirement_count, exception_count, created_at
           from public.mrp_runs
          where org_id = app.current_org_id()
          order by created_at desc
          limit 20`,
      );
      return {
        ok: true,
        data: rows.map((r) => ({
          id: r.id,
          runNumber: r.run_number,
          status: r.status,
          horizonStart: r.horizon_start,
          requirementCount: Number(r.requirement_count),
          exceptionCount: Number(r.exception_count),
          createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : new Date(r.created_at).toISOString(),
        })),
      };
    });
  } catch (err) {
    console.error('[planning/mrp] listMrpRuns failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Requirement ledger of one persisted run, item-labelled — read-gated. */
export async function getMrpRunRequirements(runId: string): Promise<MrpRunRequirementsResult> {
  if (typeof runId !== 'string' || !UUID_RE.test(runId)) {
    return { ok: false, error: 'invalid_input' };
  }
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<MrpRunRequirementsResult> => {
      const c = client as QueryClient;
      if (!(await hasPlanningReadPermission(c, userId, orgId))) {
        return { ok: false, error: 'forbidden' };
      }
      const { rows } = await c.query<{
        item_id: string;
        item_code: string | null;
        item_name: string | null;
        bucket_date: string;
        gross_requirement: string;
        scheduled_receipts: string;
        projected_on_hand: string;
        net_requirement: string;
        uom: string;
        exception_type: string | null;
      }>(
        `select r.item_id, i.item_code, i.name as item_name,
                r.bucket_date::text as bucket_date,
                r.gross_requirement::text as gross_requirement,
                r.scheduled_receipts::text as scheduled_receipts,
                r.projected_on_hand::text as projected_on_hand,
                r.net_requirement::text as net_requirement,
                r.uom, r.exception_type
           from public.mrp_requirements r
           left join public.items i
             on i.org_id = app.current_org_id()
            and i.id = r.item_id
          where r.org_id = app.current_org_id()
            and r.run_id = $1::uuid
          order by (r.exception_type is null) asc, r.net_requirement desc, i.item_code asc`,
        [runId],
      );
      return {
        ok: true,
        data: rows.map((r) => ({
          itemId: r.item_id,
          itemCode: r.item_code,
          itemName: r.item_name,
          bucketDate: r.bucket_date,
          grossRequirement: r.gross_requirement,
          scheduledReceipts: r.scheduled_receipts,
          projectedOnHand: r.projected_on_hand,
          netRequirement: r.net_requirement,
          uom: r.uom,
          exceptionType: r.exception_type,
        })),
      };
    });
  } catch (err) {
    console.error('[planning/mrp] getMrpRunRequirements failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

type PlannedOrderForConversion = {
  id: string;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  order_type: 'po' | 'to' | 'wo';
  quantity: string;
  uom: string;
  due_date: string;
  supplier_id: string | null;
  release_status: string;
};

type PlannedOrderForCancel = {
  id: string;
  item_id: string;
  item_code: string | null;
  order_type: 'po' | 'to' | 'wo';
  quantity: string;
  uom: string;
  due_date: string;
  release_status: string;
  released_order_id: string | null;
  linked_po_status: string | null;
  linked_to_status: string | null;
  linked_wo_status: string | null;
};

// Mig 178 calls not-yet-released planned orders `suggested`/`firm`; there is no
// persisted `pending` status in the local CHECK constraint, but accepting it here
// keeps the action compatible with callers that use the product wording.
const MRP_CANCELLABLE_RELEASE_STATUSES = ['pending', 'suggested', 'firm', 'released'];
const MRP_RECEIVED_PO_STATUSES = ['partially_received', 'received'];
const MRP_RECEIVED_TO_STATUSES = ['partially_received', 'received'];
const MRP_CLOSED_WO_STATUSES = ['COMPLETED', 'CLOSED'];

function uniqueValidIds(ids: string[]): string[] | null {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200) return null;
  const unique = [...new Set(ids)];
  return unique.every((id) => UUID_RE.test(id)) ? unique : null;
}

function quantityToNumeric3(value: string): string | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return null;
  const intPart = match[1];
  const fraction = match[2] ?? '';
  const firstThree = fraction.slice(0, 3).padEnd(3, '0');
  const rest = fraction.slice(3);
  if (/[^0]/.test(rest)) return null;
  return `${intPart}.${firstThree}`;
}

async function fetchPlannedOrdersForConversion(
  c: QueryClient,
  ids: string[],
): Promise<PlannedOrderForConversion[]> {
  const { rows } = await c.query<PlannedOrderForConversion>(
    `select po.id, po.item_id, i.item_code, i.name as item_name,
            po.order_type, po.quantity::text as quantity, po.uom,
            po.due_date::text as due_date, po.supplier_id, po.release_status
       from public.mrp_planned_orders po
       join public.items i
         on i.org_id = app.current_org_id()
        and i.id = po.item_id
      where po.org_id = app.current_org_id()
        and po.id = any($1::uuid[])
      order by po.due_date asc, i.item_code asc`,
    [ids],
  );
  return rows;
}

async function markPlannedOrdersReleased(
  c: QueryClient,
  ids: string[],
  releasedOrderId: string,
): Promise<void> {
  await c.query(
    `update public.mrp_planned_orders
        set release_status = 'released',
            released_order_id = $2::uuid,
            converted_at = now()
      where org_id = app.current_org_id()
        and id = any($1::uuid[])`,
    [ids, releasedOrderId],
  );
}

async function fetchPlannedOrderForCancel(
  c: QueryClient,
  plannedOrderId: string,
): Promise<PlannedOrderForCancel | null> {
  const { rows } = await c.query<PlannedOrderForCancel>(
    `select po.id, po.item_id, i.item_code,
            po.order_type, po.quantity::text as quantity, po.uom,
            po.due_date::text as due_date, po.release_status,
            po.released_order_id::text as released_order_id,
            purchase_orders.status as linked_po_status,
            transfer_orders.status as linked_to_status,
            work_orders.status as linked_wo_status
       from public.mrp_planned_orders po
       left join public.items i
         on i.org_id = app.current_org_id()
        and i.id = po.item_id
       left join public.purchase_orders
         on purchase_orders.org_id = app.current_org_id()
        and po.order_type = 'po'
        and purchase_orders.id = po.released_order_id
       left join public.transfer_orders
         on transfer_orders.org_id = app.current_org_id()
        and po.order_type = 'to'
        and transfer_orders.id = po.released_order_id
       left join public.work_orders
         on work_orders.org_id = app.current_org_id()
        and po.order_type = 'wo'
        and work_orders.id = po.released_order_id
      where po.org_id = app.current_org_id()
        and po.id = $1::uuid
      limit 1
      for update of po`,
    [plannedOrderId],
  );
  return rows[0] ?? null;
}

function isConvertedAndReceived(row: PlannedOrderForCancel): boolean {
  if (row.order_type === 'po') return MRP_RECEIVED_PO_STATUSES.includes(row.linked_po_status ?? '');
  if (row.order_type === 'to') return MRP_RECEIVED_TO_STATUSES.includes(row.linked_to_status ?? '');
  if (row.order_type === 'wo') return MRP_CLOSED_WO_STATUSES.includes(row.linked_wo_status ?? '');
  return false;
}

export async function cancelPlannedOrder(plannedOrderId: string): Promise<MrpCancelResult> {
  if (typeof plannedOrderId !== 'string' || !UUID_RE.test(plannedOrderId)) {
    return { ok: false, error: 'invalid_input' };
  }

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<MrpCancelResult> => {
      const c = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: c };
      if (!(await hasMrpConvertPermission(c, userId, orgId)) || !(await hasPlanningWritePermission(ctx))) {
        return { ok: false, error: 'forbidden' };
      }

      const planned = await fetchPlannedOrderForCancel(c, plannedOrderId);
      if (!planned) return { ok: false, error: 'not_found' };
      if (!MRP_CANCELLABLE_RELEASE_STATUSES.includes(planned.release_status) || isConvertedAndReceived(planned)) {
        return { ok: false, error: 'invalid_state' };
      }

      const updated = await c.query<{ id: string }>(
        `update public.mrp_planned_orders po
            set release_status = 'cancelled'
          where po.org_id = app.current_org_id()
            and po.id = $1::uuid
            and po.release_status = any($2::text[])
            and not exists (
              select 1
                from public.purchase_orders linked_po
               where linked_po.org_id = app.current_org_id()
                 and po.order_type = 'po'
                 and linked_po.id = po.released_order_id
                 and linked_po.status = any($3::text[])
            )
            and not exists (
              select 1
                from public.transfer_orders linked_to
               where linked_to.org_id = app.current_org_id()
                 and po.order_type = 'to'
                 and linked_to.id = po.released_order_id
                 and linked_to.status = any($4::text[])
            )
            and not exists (
              select 1
                from public.work_orders linked_wo
               where linked_wo.org_id = app.current_org_id()
                 and po.order_type = 'wo'
                 and linked_wo.id = po.released_order_id
                 and linked_wo.status = any($5::text[])
            )
        returning po.id`,
        [
          planned.id,
          MRP_CANCELLABLE_RELEASE_STATUSES,
          MRP_RECEIVED_PO_STATUSES,
          MRP_RECEIVED_TO_STATUSES,
          MRP_CLOSED_WO_STATUSES,
        ],
      );
      if (!updated.rows[0]) return { ok: false, error: 'invalid_state' };

      await writeProcurementAudit(ctx, {
        action: 'planning.mrp_planned_order.cancelled',
        resourceType: 'mrp_planned_order',
        resourceId: planned.id,
        beforeState: {
          releaseStatus: planned.release_status,
          releasedOrderId: planned.released_order_id,
        },
        afterState: {
          releaseStatus: 'cancelled',
          orderType: planned.order_type,
          itemId: planned.item_id,
          itemCode: planned.item_code,
          quantity: planned.quantity,
          uom: planned.uom,
          dueDate: planned.due_date,
        },
      });

      return { ok: true, cancelled: true };
    });
  } catch (err) {
    console.error('[planning/mrp] cancelPlannedOrder failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function convertPlannedToPo(plannedOrderIds: string[]): Promise<MrpConvertResult> {
  const ids = uniqueValidIds(plannedOrderIds);
  if (!ids) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<MrpConvertResult> => {
      const c = client as QueryClient;
      if (!(await hasMrpConvertPermission(c, userId, orgId)) || !(await hasPlanningWritePermission({ userId, orgId, client: c }))) {
        return { ok: false, error: 'forbidden' };
      }

      const planned = await fetchPlannedOrdersForConversion(c, ids);
      const found = new Set(planned.map((row) => row.id));
      const skipped: Array<{ id: string; reason: string }> = ids
        .filter((id) => !found.has(id))
        .map((id) => ({ id, reason: 'not found' }));

      const bySupplier = new Map<string, PlannedOrderForConversion[]>();
      for (const row of planned) {
        if (row.release_status !== 'suggested' && row.release_status !== 'firm') {
          skipped.push({ id: row.id, reason: 'already converted' });
          continue;
        }
        if (row.order_type !== 'po') {
          skipped.push({ id: row.id, reason: 'not a buy planned order' });
          continue;
        }
        if (!row.supplier_id) {
          skipped.push({ id: row.id, reason: 'missing supplier' });
          continue;
        }
        const quantity = quantityToNumeric3(row.quantity);
        if (!quantity) {
          skipped.push({ id: row.id, reason: 'quantity precision exceeds PO line precision' });
          continue;
        }
        bySupplier.set(row.supplier_id, [...(bySupplier.get(row.supplier_id) ?? []), row]);
      }

      const poIds: string[] = [];
      for (const [supplierId, rows] of bySupplier) {
        const result = await createPurchaseOrder({
          supplierId,
          status: 'draft',
          expectedDelivery: rows[0]?.due_date,
          currency: 'EUR',
          notes: 'Created from MRP planned orders',
          lines: rows.map((row, index) => ({
            itemId: row.item_id,
            qty: quantityToNumeric3(row.quantity) ?? row.quantity,
            uom: row.uom,
            unitPrice: '0',
            lineNo: index + 1,
          })),
        });
        if (!result.ok) {
          rows.forEach((row) => skipped.push({ id: row.id, reason: result.error }));
          continue;
        }
        poIds.push(result.data.id);
        await markPlannedOrdersReleased(c, rows.map((row) => row.id), result.data.id);
      }

      return { ok: true, created: poIds.length, poIds, skipped };
    });
  } catch (err) {
    console.error('[planning/mrp] convertPlannedToPo failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function convertPlannedToWo(plannedOrderIds: string[]): Promise<MrpConvertResult> {
  const ids = uniqueValidIds(plannedOrderIds);
  if (!ids) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<MrpConvertResult> => {
      const c = client as QueryClient;
      if (!(await hasMrpConvertPermission(c, userId, orgId)) || !(await hasPlanningWritePermission({ userId, orgId, client: c }))) {
        return { ok: false, error: 'forbidden' };
      }

      const planned = await fetchPlannedOrdersForConversion(c, ids);
      const found = new Set(planned.map((row) => row.id));
      const skipped: Array<{ id: string; reason: string }> = ids
        .filter((id) => !found.has(id))
        .map((id) => ({ id, reason: 'not found' }));
      const woIds: string[] = [];

      for (const row of planned) {
        if (row.release_status !== 'suggested' && row.release_status !== 'firm') {
          skipped.push({ id: row.id, reason: 'already converted' });
          continue;
        }
        if (row.order_type !== 'wo') {
          skipped.push({ id: row.id, reason: 'not a make planned order' });
          continue;
        }
        if (!row.item_code) {
          skipped.push({ id: row.id, reason: 'missing item code' });
          continue;
        }

        const activeBom = await c.query<{ id: string; version: number }>(
          `select id
                  , version
             from public.bom_headers
            where org_id = app.current_org_id()
              and product_id = $1
              and status = 'active'
            order by version desc
            limit 1`,
          [row.item_code],
        );
        if (!activeBom.rows[0]) {
          skipped.push({ id: row.id, reason: 'no active BOM' });
          continue;
        }

        const quantity = quantityToNumeric3(row.quantity);
        if (!quantity) {
          skipped.push({ id: row.id, reason: 'quantity precision exceeds WO precision' });
          continue;
        }
        const itemUomResult = await c.query<{
          output_uom: string;
          uom_base: string;
          net_qty_per_each: string | null;
          each_per_box: string | null;
          boxes_per_pallet: string | null;
          weight_mode: 'fixed' | 'catch';
        }>(
          `select output_uom, uom_base, net_qty_per_each::text as net_qty_per_each,
                  each_per_box::text as each_per_box, boxes_per_pallet::text as boxes_per_pallet,
                  weight_mode
             from public.items
            where org_id = app.current_org_id()
              and id = $1::uuid
            limit 1`,
          [row.item_id],
        );
        const itemUom = itemUomResult.rows[0];
        if (!itemUom) {
          skipped.push({ id: row.id, reason: 'invalid_input' });
          continue;
        }
        const uomSnapshot = snapshotFromItemRow(itemUom);
        const dbUomSnapshot = {
          output_uom: itemUom.output_uom,
          uom_base: itemUom.uom_base,
          net_qty_per_each: itemUom.net_qty_per_each,
          each_per_box: itemUom.each_per_box,
          boxes_per_pallet: itemUom.boxes_per_pallet,
          weight_mode: itemUom.weight_mode,
        };
        const specResult = await c.query<{ id: string }>(
          `select id
             from public.factory_specs
            where org_id = app.current_org_id()
              and fg_item_id = $1::uuid
              and status in ('approved_for_factory', 'released_to_factory')
            order by version desc
            limit 1`,
          [row.item_id],
        );
        const spec = specResult.rows[0];
        const woId = randomUUID();
        const notes = 'Created from MRP planned order';
        const insertWorkOrderHeader = async (documentNumber: string) =>
          c.query<{ id: string }>(
            `insert into public.work_orders
               (id, org_id, wo_number, product_id, item_type_at_creation, active_bom_header_id,
                active_factory_spec_id,
                planned_quantity, uom, status, scheduled_start_time, production_line_id, machine_id,
                source_of_demand, source_reference, qty_entered, qty_entered_uom, uom_snapshot,
                ext_jsonb, created_by, updated_by)
             values
               ($1::uuid, app.current_org_id(), $2, $3::uuid, 'fg', $4::uuid,
                $11::uuid,
                $5::numeric, $10, 'DRAFT', null, null, null,
                'manual', $6, null, null, $9::jsonb, $7::jsonb, $8::uuid, $8::uuid)
             returning id`,
            [
              woId,
              documentNumber,
              row.item_id,
              activeBom.rows[0].id,
              quantity,
              row.item_code,
              JSON.stringify({ notes, app_version: APP_VERSION }),
              userId,
              JSON.stringify(dbUomSnapshot),
              uomSnapshot.uomBase,
              spec?.id ?? null,
            ],
          );

        try {
          await insertWorkOrderHeader(await nextDocumentNumber(c, orgId, 'wo', new Date()));
        } catch (error) {
          if (!isPgError(error) || error.code !== '23505') throw error;
          await insertWorkOrderHeader(await nextDocumentNumber(c, orgId, 'wo', new Date()));
        }

        await c.query(
          `insert into public.wo_materials
             (org_id, wo_id, product_id, material_name, required_qty, uom, sequence,
              bom_item_id, bom_version, material_source, notes)
           select app.current_org_id(), $1::uuid, coalesce(i.id, bl.id), bl.component_code,
                  round((bl.quantity * $2::numeric), 3), bl.uom, coalesce(bl.sequence, bl.line_no),
                  bl.id, $3::integer, 'stock', bl.notes
             from public.bom_lines bl
             left join public.items i
               on i.org_id = app.current_org_id()
              and i.item_code = bl.component_code
            where bl.org_id = app.current_org_id()
              and bl.bom_header_id = $4::uuid
            order by bl.line_no`,
          [woId, quantity, activeBom.rows[0].version, activeBom.rows[0].id],
        );
        await c.query(
          `insert into public.wo_operations
             (org_id, site_id, wo_id, sequence, operation_name, machine_id, line_id,
              expected_duration_minutes, status, notes)
           select app.current_org_id(), ro.site_id, $1::uuid, ro.op_no, ro.op_name,
                  ro.machine_id, ro.line_id,
                  case
                    when ro.run_time_per_unit_sec is null and ro.setup_time_min is null
                      then null
                    when coalesce(ro.setup_time_min, 0)::numeric
                         + coalesce(ceil((ro.run_time_per_unit_sec * $2::numeric) / 60.0), 0) > 2147483647
                      then null
                    else (coalesce(ro.setup_time_min, 0)::numeric
                          + coalesce(ceil((ro.run_time_per_unit_sec * $2::numeric) / 60.0), 0))::integer
                  end,
                  'pending', ro.op_code
             from public.routing_operations ro
             join public.routings r
               on r.id = ro.routing_id
              and r.org_id = ro.org_id
            where ro.org_id = app.current_org_id()
              and r.item_id = $3::uuid
              and r.status = 'active'
              and r.version = (
                select max(r2.version) from public.routings r2
                 where r2.org_id = app.current_org_id()
                   and r2.item_id = $3::uuid
                   and r2.status = 'active'
              )
            order by ro.op_no
           on conflict (wo_id, sequence) do nothing`,
          [woId, quantity, row.item_id],
        );
        await c.query(
          `insert into public.schedule_outputs
             (org_id, planned_wo_id, product_id, output_role, expected_qty, uom, allocation_pct, disposition, notes)
           values
             (app.current_org_id(), $1::uuid, $2::uuid, 'primary', $3::numeric, $5, 100.00, 'to_stock', $4)`,
          [woId, row.item_id, quantity, notes, uomSnapshot.uomBase],
        );
        await c.query(
          `insert into public.wo_status_history
             (org_id, wo_id, from_status, to_status, action, user_id, context_jsonb)
           values
             (app.current_org_id(), $1::uuid, null, 'DRAFT', 'create', $2::uuid, $3::jsonb)`,
          [woId, userId, JSON.stringify({ app_version: APP_VERSION, bom_header_id: activeBom.rows[0].id })],
        );
        woIds.push(woId);
        await markPlannedOrdersReleased(c, [row.id], woId);
      }

      return { ok: true, created: woIds.length, woIds, skipped };
    });
  } catch (err) {
    console.error('[planning/mrp] convertPlannedToWo failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

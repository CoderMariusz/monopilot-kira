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

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { hasPlanningWritePermission } from './procurement-shared';
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
/** Item types planned by MRP. fg/co_product/byproduct demand is production output, not material demand. */
const MRP_ITEM_TYPES = ['rm', 'ingredient', 'intermediate', 'packaging'];

export type MrpRunData = {
  /** ISO timestamp of this run. */
  ranAt: string;
  rows: MrpRow[];
  kpis: MrpKpis;
  /** Set ONLY when the run was persisted to mrp_runs ({ persist: true }). */
  runId: string | null;
  runNumber: string | null;
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

      // 1) Item master — the MRP-planned item universe (pack hierarchy for UoM conversion).
      const items = await c.query<MrpItemRow>(
        `select i.id, i.item_code, i.name, i.item_type, i.uom_base,
                i.output_uom, i.net_qty_per_each::text as net_qty_per_each, i.each_per_box
           from public.items i
          where i.org_id = app.current_org_id()
            and i.item_type = any($1::text[])`,
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

      const startedAt = new Date();
      const today = startedAt.toISOString().slice(0, 10);
      const { rows, kpis } = computeMrp({
        items: items.rows,
        onHand: onHand.rows,
        demand: demand.rows,
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

      return { ok: true, data: { ranAt: startedAt.toISOString(), rows, kpis, runId, runNumber } };
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
 * and one mrp_requirements row per netted item:
 *
 *   gross_requirement  = open WO demand           (NUMERIC >= 0 — row.demand)
 *   scheduled_receipts = open PO + WO supply       (NUMERIC >= 0 — row.openSupply)
 *   projected_on_hand  = the netted position       (row.net — may be negative)
 *   net_requirement    = unmet demand max(−net, 0)
 *   bucket_date        = today, bom_level = 0 (single bucket, no BOM explosion)
 *   source_type        = 'dependent' (demand comes from WO materials)
 *   exception_type     = 'shortage' when net < 0 (mig-178 CHECK list), else null
 *
 * Decimal strings only — quantities never round-trip through JS floats.
 * Idempotent per run: the (run_id, item_id, bucket_date, bom_level) unique key
 * upserts via ON CONFLICT DO UPDATE. mrp_planned_orders is NOT written in this
 * slice (planned_order_count = 0; suggestion counts live in params_jsonb).
 */
async function persistMrpRun(
  c: QueryClient,
  userId: string,
  input: { today: string; startedAt: Date; rows: MrpRow[]; kpis: MrpKpis },
): Promise<{ runId: string; runNumber: string }> {
  const { today, startedAt, rows, kpis } = input;
  const suggestionCount = rows.filter((r) => r.suggestedAction !== null).length;
  const runNumber = `MRP-${today.replace(/-/g, '')}-${randomUUID().slice(0, 8).toUpperCase()}`;

  const header = await c.query<{ id: string; run_number: string }>(
    `insert into public.mrp_runs
       (org_id, run_number, status, demand_source, horizon_start, horizon_end,
        bucket_days, params_jsonb, requirement_count, planned_order_count,
        exception_count, started_at, completed_at, created_by)
     values
       (app.current_org_id(), $1, 'completed', 'manual', $2::date, $2::date,
        1, $3::jsonb, $4::integer, 0,
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
    ],
  );
  const run = header.rows[0];
  if (!run) throw new Error('mrp_runs insert returned no row');

  for (const row of rows) {
    // row.net is a canonical 3-dp decimal string from microToFixed — the sign
    // test is exact on the string; |net| is a pure prefix strip (no floats).
    const isShort = row.net.startsWith('-');
    const netRequirement = isShort ? row.net.slice(1) : '0';
    await c.query(
      `insert into public.mrp_requirements
         (org_id, run_id, item_id, bom_level, bucket_date, gross_requirement,
          scheduled_receipts, projected_on_hand, net_requirement, uom,
          source_type, exception_type)
       values
         (app.current_org_id(), $1::uuid, $2::uuid, 0, $3::date, $4::numeric,
          $5::numeric, $6::numeric, $7::numeric, $8,
          'dependent', $9)
       on conflict on constraint mrp_requirements_run_item_bucket_unique
       do update set gross_requirement = excluded.gross_requirement,
                     scheduled_receipts = excluded.scheduled_receipts,
                     projected_on_hand = excluded.projected_on_hand,
                     net_requirement = excluded.net_requirement,
                     uom = excluded.uom,
                     exception_type = excluded.exception_type`,
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
      ],
    );
  }

  return { runId: run.id, runNumber: run.run_number };
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

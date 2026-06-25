'use server';

/**
 * P-L1 — 08-Production WO list (SCR-08, prototype wo-list.jsx:4-106).
 *
 * READ server action: lists the org's work orders with their materialized
 * execution status, planned qty, latest-execution-derived progress and the
 * canonical wo_outputs sum, for the dedicated `/production/wos` screen (the
 * dashboard's "Work orders" deep-link). Mirrors the query style of the
 * dashboard loader (production/_actions/dashboard-data.ts → getProductionDashboard):
 *
 *   - work_orders is the DRIVING table so released-but-unstarted WOs appear as
 *     `planned` before wo_executions is lazily materialized.
 *   - status folds the wo_executions.status materialized state over the planning
 *     work_orders.status, identical to the dashboard mapping.
 *   - progress is computed from the canonical wo_outputs sum (08 owns wo_outputs),
 *     not the planning produced_quantity mirror.
 *   - the allergen badge surfaces when allergen_profile_snapshot is present.
 *
 * Runs inside a SINGLE `withOrgContext` transaction — RLS (`org_id =
 * app.current_org_id()`) scopes every row to the signed-in user's org. No
 * service-role bypass, no mocks. RBAC: server-resolved `production.oee.read`
 * (the same read permission the dashboard loader gates on, migration 185); the
 * client never re-queries and never trusts a client-side flag.
 *
 * This `'use server'` module exports ONLY the async action + serialisable types
 * (no classes/enums) per the 'use server' export rule.
 */

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  hasPermission,
  type ProductionContext,
  type WoState,
} from '../../../../../../lib/production/shared';

/** The production read permission (migration 185 — org-admin/operator/supervisor). */
const PRODUCTION_VIEW_PERMISSION = 'production.oee.read';

/** Execution-lifecycle states, identical to the dashboard loader's WoExecStatus. */
export type WoListStatus = WoState;

const ALL_STATUSES: WoListStatus[] = [
  'planned',
  'in_progress',
  'paused',
  'completed',
  'closed',
  'cancelled',
];

/** One WO row surfaced on the `/production/wos` list (live, org-scoped). */
export type WorkOrderListItem = {
  id: string;
  woNumber: string;
  productId: string;
  /** items.item_code / items.name — null when the product row is missing. */
  itemCode: string | null;
  productName: string | null;
  status: WoListStatus;
  lineId: string | null;
  /** production_lines.code — null when no line is assigned. */
  lineCode: string | null;
  /** Planned qty in the WO's UOM. */
  plannedQty: number;
  uom: string;
  /** Canonical sum(wo_outputs.qty_kg); null when no output rows yet. */
  outputKg: number | null;
  /** 0..100 = output/planned, clamped; null when planned is 0. */
  progressPct: number | null;
  allergenGate: boolean;
  overProductionFlagged: boolean;
  scheduledStart: string | null;
  scheduledEnd: string | null;
};

export type WorkOrderListData = {
  rows: WorkOrderListItem[];
  /** Per-status counts for the list's status tabs (all statuses, zero-filled). */
  statusCounts: Record<WoListStatus, number>;
};

/**
 * Result wrapper (mirrors ProductionDashboardResult):
 *   - ok:true                          → rows + status counts.
 *   - ok:false, reason:'forbidden'     → caller lacks production.oee.read.
 *   - ok:false, reason:'error'         → live read failed (error banner, no 500).
 */
export type WorkOrderListResult =
  | { ok: true; data: WorkOrderListData }
  | { ok: false; reason: 'forbidden' | 'error' };

/** Optional read filters (14-multi-site CL4 — additive, absent = unchanged). */
export type WorkOrderListInput = {
  /**
   * Site filter (topbar picker cookie). Matches the WO's own site_id when set,
   * else the assigned line's site_id (production_lines.site_id, backfilled to
   * the org default site in mig 268 — work_orders.site_id is day-1 NULL until
   * the T-030 backfill). null/undefined/non-uuid = All sites (no filter).
   */
  siteId?: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listWorkOrders(input?: WorkOrderListInput): Promise<WorkOrderListResult> {
  const siteId =
    typeof input?.siteId === 'string' && UUID_RE.test(input.siteId) ? input.siteId : null;
  try {
    return await withOrgContext(async (ctx): Promise<WorkOrderListResult> => {
      const pctx = ctx as unknown as ProductionContext;

      // ── RBAC gate (server-side, never trust the client) ──────────────────────
      if (!(await hasPermission(pctx, PRODUCTION_VIEW_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      const c = ctx.client;

      // Status-tab counts from work_orders so released-but-unstarted WOs are
      // visible as `planned` before an execution row exists (dashboard parity).
      const statusRes = await c.query<{ status: string; n: number }>(
        `select coalesce(
                  e.status,
                  case w.status
                    when 'RELEASED' then 'planned'
                    when 'IN_PROGRESS' then 'in_progress'
                    when 'ON_HOLD' then 'paused'
                    when 'COMPLETED' then 'completed'
                    when 'CLOSED' then 'closed'
                    when 'CANCELLED' then 'cancelled'
                  end
                ) as status,
                count(*)::int as n
           from public.work_orders w
           left join public.wo_executions e
             on e.org_id = w.org_id and e.wo_id = w.id
           left join public.production_lines pl
             on pl.org_id = w.org_id and pl.id = w.production_line_id
          where w.org_id = app.current_org_id()
            and w.status in ('RELEASED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CLOSED', 'CANCELLED')
            and ($1::uuid is null or coalesce(w.site_id, pl.site_id) = $1::uuid)
          group by 1`,
        [siteId],
      );
      const statusCounts = ALL_STATUSES.reduce(
        (acc, s) => {
          acc[s] = 0;
          return acc;
        },
        {} as Record<WoListStatus, number>,
      );
      for (const r of statusRes.rows) {
        if ((ALL_STATUSES as string[]).includes(r.status)) {
          statusCounts[r.status as WoListStatus] = r.n;
        }
      }

      // WO list — work_orders is the driving table. Progress is computed from the
      // canonical wo_outputs sum (NUMERIC in SQL), not the planning mirror.
      const woRes = await c.query<{
        id: string;
        wo_number: string | null;
        product_id: string;
        item_code: string | null;
        product_name: string | null;
        status: string;
        production_line_id: string | null;
        line_code: string | null;
        planned_quantity: string | number | null;
        uom: string | null;
        output_kg: string | number | null;
        progress_pct: string | number | null;
        has_allergen: boolean;
        over_production_flagged: boolean | null;
        scheduled_start_time: string | Date | null;
        scheduled_end_time: string | Date | null;
      }>(
        `select w.id::text as id,
                w.wo_number,
                w.product_id::text as product_id,
                i.item_code,
                i.name as product_name,
                pl.code as line_code,
                coalesce(
                  e.status,
                  case w.status
                    when 'RELEASED' then 'planned'
                    when 'IN_PROGRESS' then 'in_progress'
                    when 'ON_HOLD' then 'paused'
                    when 'COMPLETED' then 'completed'
                    when 'CLOSED' then 'closed'
                    when 'CANCELLED' then 'cancelled'
                    else 'planned'
                  end
                ) as status,
                w.production_line_id::text as production_line_id,
                w.planned_quantity,
                w.uom,
                produced.qty_kg as output_kg,
                case
                  when coalesce(w.planned_quantity, 0) > 0
                    then least(100::numeric, round(produced.qty_kg / w.planned_quantity * 100, 0))
                  else null
                end as progress_pct,
                (w.allergen_profile_snapshot is not null) as has_allergen,
                w.over_production_flagged,
                w.scheduled_start_time,
                w.scheduled_end_time
           from public.work_orders w
           left join public.wo_executions e
             on e.wo_id = w.id and e.org_id = w.org_id
           left join public.items i
             on i.org_id = w.org_id and i.id = w.product_id
           left join public.production_lines pl
             on pl.org_id = w.org_id and pl.id = w.production_line_id
           left join lateral (
             select coalesce(sum(o.qty_kg), 0) as qty_kg
               from public.wo_outputs o
              where o.wo_id = w.id
                and o.org_id = app.current_org_id()
           ) produced on true
          where w.org_id = app.current_org_id()
            and w.status in ('RELEASED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CLOSED', 'CANCELLED')
            and ($1::uuid is null or coalesce(w.site_id, pl.site_id) = $1::uuid)
          order by w.scheduled_start_time desc nulls last, e.created_at desc nulls last
          limit 200`,
        [siteId],
      );

      const rows: WorkOrderListItem[] = woRes.rows.map((r) => {
        const status = (ALL_STATUSES as string[]).includes(r.status)
          ? (r.status as WoListStatus)
          : 'planned';
        const outputKg =
          r.output_kg === null || r.output_kg === undefined ? null : Number(r.output_kg);
        return {
          id: r.id,
          woNumber: r.wo_number ?? r.id.slice(0, 8),
          productId: r.product_id,
          itemCode: r.item_code,
          productName: r.product_name,
          status,
          lineId: r.production_line_id,
          lineCode: r.line_code,
          plannedQty: Number(r.planned_quantity ?? 0),
          uom: r.uom ?? 'kg',
          outputKg,
          progressPct:
            r.progress_pct === null || r.progress_pct === undefined ? null : Number(r.progress_pct),
          allergenGate: Boolean(r.has_allergen),
          overProductionFlagged: Boolean(r.over_production_flagged),
          scheduledStart: toIso(r.scheduled_start_time),
          scheduledEnd: toIso(r.scheduled_end_time),
        };
      });

      return { ok: true, data: { rows, statusCounts } };
    });
  } catch (error) {
    console.error('[production/wos] WO-list read failed:', error);
    return { ok: false, reason: 'error' };
  }
}

function toIso(v: string | Date | null): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

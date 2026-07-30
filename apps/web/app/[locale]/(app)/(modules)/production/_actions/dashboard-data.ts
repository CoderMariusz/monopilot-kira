'use server';

/**
 * T-046 — 08-Production Dashboard (SCR-08-01): org-scoped live KPI + WO-list reads.
 *
 * Prototype: prototypes/design/Monopilot Design System/production/dashboard.jsx:3-146
 * (production_dashboard, 6-KPI strip) + wo-list.jsx:3-104 (wo_list). The prototype's
 * LINES / EVENTS_FEED / WOS mock arrays are replaced 1:1 with real Supabase reads.
 *
 * Every read runs inside `withSiteContext({ mode: 'read' })`, composing on
 * `withOrgContext` so it executes as `app_user` with `app.set_org_context(...)`
 * and `app.set_site_context(...)` applied — RLS (`org_id = app.current_org_id()`)
 * plus the active top-bar site (`app.current_site_id()`) scopes every
 * count/row/sum to the signed-in user's organization and selected site. No service-role
 * bypass, no mocks. Canonical owners are respected (read-only here):
 *   - wo_executions / wo_outputs / downtime_events / oee_snapshots → 08-production
 *     (migrations 181-184). work_orders → 04-planning (migration 176).
 *
 * RBAC: the page is gated server-side on `production.oee.read` (the production
 * read permission seeded to the org-admin + operator + supervisor role families in
 * migration 185). The client never re-queries and never trusts a client-side flag.
 *
 * This `'use server'` module exports only the async dashboard read plus
 * serializable types; it is invoked directly from the Production dashboard Server
 * Component during render.
 */
import { withSiteContext } from '../../../../../../lib/auth/with-site-context';
import { SITE_DAY_START_SQL } from '../../../../../../lib/site/site-day';
import { isKgUom } from '../../../../../../lib/uom/piece';
import {
  PRODUCTION_DASHBOARD_WO_LIST_SQL,
  PRODUCTION_DASHBOARD_SITE_WO_PREDICATE,
  productionDashboardSiteRowPredicate,
} from '../_lib/dashboard-queries';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

/** The production view permission (migration 185 — org-admin/operator/supervisor). */
const PRODUCTION_VIEW_PERMISSION = 'production.oee.read';

/** Materialized execution-lifecycle states (wo_executions.status). */
export type WoExecStatus = 'planned' | 'in_progress' | 'paused' | 'completed' | 'closed' | 'cancelled';

/** One WO row surfaced on the dashboard WO list (live, org-scoped). */
export type WoListRow = {
  id: string;
  woNumber: string;
  /** Execution lifecycle status (folded from wo_events); falls back to the planning status. */
  status: WoExecStatus;
  lineId: string | null;
  /** Names sweep: production_lines.code / items code+name; null when joins miss
   *  (mig-259 orphan demo WOs) — callers fall back to UUID fragments. */
  lineCode: string | null;
  productId: string | null;
  itemCode: string | null;
  productName: string | null;
  plannedKg: string;
  producedKg: string | null;
  /** 0..100 progress = produced/planned, clamped. Null when planned is 0. */
  progressPct: number | null;
  /** True when the WO carries an allergen profile snapshot (changeover gate may apply). */
  allergenGate: boolean;
  overProductionFlagged: boolean;
};

export type ProductionDashboardKpis = {
  /** count(wo_executions WHERE status='in_progress') */
  woInProgress: number;
  /** count(wo_executions WHERE status IN ('planned','in_progress','paused')) — the denominator. */
  woActiveTotal: number;
  /** count(work_orders WHERE over_production_flagged = true) */
  overProducedCount: number;
  /**
   * sum(wo_outputs.qty_kg) for the current SITE-LOCAL calendar day, restricted to rows
   * whose `uom` really is kg. `qty_kg` is a legacy column name: it holds the quantity in
   * whatever unit sits next to it in `wo_outputs.uom`, so a blind sum added pieces to
   * kilograms one-for-one (200 kg + 500 pcs rendered as "700 kg").
   */
  outputTodayKg: string;
  /**
   * The non-kg part of the same day, one entry per unit, so nothing is silently dropped
   * from the tile. Empty on a kg-only day. Mirrors `partitionKgRows` in
   * quality/trace/_actions/trace-mass-balance.ts — partition, never blind-sum.
   */
  outputTodayOther: Array<{ uom: string; qty: string }>;
  /** Latest oee_snapshots.oee_pct (most recent snapshot_minute); null = no snapshot yet. */
  oeeCurrentPct: number | null;
  /** count(downtime_events WHERE ended_at IS NULL) — currently-open downtime. */
  openDowntime: number;
  /** Per-status counts for the WO-list status tabs. */
  statusCounts: Record<WoExecStatus, number>;
  /** Live WO rows (newest scheduled first, capped). */
  woRows: WoListRow[];
};

const ALL_STATUSES: WoExecStatus[] = [
  'planned',
  'in_progress',
  'paused',
  'completed',
  'closed',
  'cancelled',
];

/** Resolves whether the caller holds a permission, org-scoped under RLS. */
async function hasPermission(
  c: QueryClient,
  userId: string,
  orgId: string,
  permission: string,
): Promise<boolean> {
  const { rows } = await c.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [userId, orgId, permission],
  );
  return rows.length > 0;
}

/**
 * Result wrapper:
 *   - `ok:true`              → KPIs + WO rows.
 *   - `ok:false, reason:'forbidden'` → caller lacks production.oee.read (permission-denied UI).
 *   - `ok:false, reason:'error'`     → live read failed (error banner, never a 500).
 */
export type ProductionDashboardResult =
  | { ok: true; data: ProductionDashboardKpis }
  | { ok: false; reason: 'forbidden' | 'error' };

/**
 * Aggregates all KPI tiles + the WO list in a SINGLE org-context transaction.
 * Queries run sequentially on the one pooled pg client (node-pg does not run
 * concurrent queries on a single connection).
 */
export async function getProductionDashboard(): Promise<ProductionDashboardResult> {
  try {
    return await withSiteContext({ mode: 'read' }, async ({ userId, orgId, client }): Promise<ProductionDashboardResult> => {
      const c = client as QueryClient;

      // ── RBAC gate (server-side, never trust the client) ──────────────────────
      const allowed = await hasPermission(c, userId, orgId, PRODUCTION_VIEW_PERMISSION);
      if (!allowed) {
        return { ok: false, reason: 'forbidden' };
      }

      const countOf = async (sql: string, params?: readonly unknown[]): Promise<number> => {
        const res = await c.query<{ n: number }>(sql, params);
        return res.rows[0]?.n ?? 0;
      };

      // KPI 1 — WOs in progress (executions materialized state).
      const woInProgress = await countOf(
        `select count(*)::int as n
           from public.wo_executions e
           join public.work_orders w
             on w.id = e.wo_id and w.org_id = e.org_id
           left join public.production_lines pl
             on pl.org_id = w.org_id and pl.id = w.production_line_id
          where e.org_id = app.current_org_id()
            and e.status = 'in_progress'
            and ${PRODUCTION_DASHBOARD_SITE_WO_PREDICATE}`,
      );

      // Denominator — active/released WOs, including released-but-unstarted
      // planning rows with no wo_executions materialization yet.
      const woActiveTotal = await countOf(
        `select count(*)::int as n
           from public.work_orders w
           left join public.wo_executions e
             on e.org_id = w.org_id and e.wo_id = w.id
           left join public.production_lines pl
             on pl.org_id = w.org_id and pl.id = w.production_line_id
          where w.org_id = app.current_org_id()
            and ${PRODUCTION_DASHBOARD_SITE_WO_PREDICATE}
            and coalesce(
                  e.status,
                  case w.status
                    when 'RELEASED' then 'planned'
                    when 'IN_PROGRESS' then 'in_progress'
                    when 'ON_HOLD' then 'paused'
                  end
                ) in ('planned', 'in_progress', 'paused')`,
      );

      // KPI 2 — Output today (kg): sum of canonical wo_outputs registered on the
      // SITE-LOCAL calendar day (lib/site/site-day.ts). It used to be the UTC day,
      // which put 1-2h of a Warsaw night shift under the wrong date while expiry +
      // scheduler already counted the site-local day. `mv_reporting_production_throughput`
      // deliberately KEEPS its UTC `output_date` bucket — it is a cross-site
      // historical aggregate whose key must not move when a site's timezone is edited.
      const outputRes = await c.query<{ uom: string | null; kg: string | null }>(
        `select coalesce(nullif(trim(o.uom), ''), 'kg') as uom,
                coalesce(sum(o.qty_kg), 0)::text as kg
           from public.wo_outputs o
           join public.work_orders w
             on w.id = o.wo_id and w.org_id = o.org_id
           left join public.production_lines pl
             on pl.org_id = w.org_id and pl.id = w.production_line_id
          where o.org_id = app.current_org_id()
            and ${PRODUCTION_DASHBOARD_SITE_WO_PREDICATE}
            and o.registered_at >= ${SITE_DAY_START_SQL}
            and o.registered_at < ${SITE_DAY_START_SQL} + interval '1 day'
          group by 1
          order by 1`,
      );
      const outputTodayKg = String(outputRes.rows.find((r) => isKgUom(r.uom))?.kg ?? '0');
      const outputTodayOther = outputRes.rows
        .filter((r) => !isKgUom(r.uom))
        .map((r) => ({ uom: String(r.uom), qty: String(r.kg ?? '0') }));

      // KPI 3 — OEE current: most recent snapshot's oee_pct (08 is the sole producer).
      const oeeRes = await c.query<{ oee_pct: string | number | null }>(
        `select oee_pct
           from public.oee_snapshots s
          where s.org_id = app.current_org_id()
            and ${productionDashboardSiteRowPredicate('s')}
          order by s.snapshot_minute desc
          limit 1`,
      );
      const rawOee = oeeRes.rows[0]?.oee_pct;
      const oeeCurrentPct = rawOee === undefined || rawOee === null ? null : Number(rawOee);

      // KPI 4 — Open downtime: events with no end (V-PROD-06 open-event semantics).
      const openDowntime = await countOf(
        `select count(*)::int as n
           from public.downtime_events d
          where d.org_id = app.current_org_id()
            and ${productionDashboardSiteRowPredicate('d')}
            and d.ended_at is null`,
      );

      // KPI 5 — Over-produced WOs: planning rows flagged by 08-production output capture.
      const overProducedCount = await countOf(
        `select count(*)::int as n
           from public.work_orders w
           left join public.production_lines pl
             on pl.org_id = w.org_id and pl.id = w.production_line_id
          where w.org_id = app.current_org_id()
            and ${PRODUCTION_DASHBOARD_SITE_WO_PREDICATE}
            and w.over_production_flagged = true`,
      );

      // Status-tab counts from work_orders so released-but-unstarted WOs are
      // visible as planned before an execution row exists.
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
            and ${PRODUCTION_DASHBOARD_SITE_WO_PREDICATE}
            and w.status in ('RELEASED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CLOSED', 'CANCELLED')
          group by 1`,
      );
      const statusCounts = ALL_STATUSES.reduce(
        (acc, s) => {
          acc[s] = 0;
          return acc;
        },
        {} as Record<WoExecStatus, number>,
      );
      for (const r of statusRes.rows) {
        if ((ALL_STATUSES as string[]).includes(r.status)) {
          statusCounts[r.status as WoExecStatus] = r.n;
        }
      }

      // WO list — work_orders is the driving table so released-but-unstarted WOs
      // appear before wo_executions is lazily materialized. Progress is computed
      // from canonical wo_outputs, not the planning produced_quantity mirror.
      const woRes = await c.query<{
        id: string;
        wo_number: string | null;
        status: string;
        production_line_id: string | null;
        line_code: string | null;
        product_id: string | null;
        item_code: string | null;
        product_name: string | null;
        planned_quantity: string | null;
        produced_quantity: string | null;
        progress_pct: string | number | null;
        has_allergen: boolean;
        over_production_flagged: boolean | null;
      }>(PRODUCTION_DASHBOARD_WO_LIST_SQL);

      const woRows: WoListRow[] = woRes.rows.map((r) => {
        const plannedKg = String(r.planned_quantity ?? '0');
        const producedKg =
          r.produced_quantity === null || r.produced_quantity === undefined
            ? null
            : String(r.produced_quantity);
        const progressPct = r.progress_pct === null || r.progress_pct === undefined ? null : Number(r.progress_pct);
        const status = (ALL_STATUSES as string[]).includes(r.status)
          ? (r.status as WoExecStatus)
          : 'planned';
        return {
          id: r.id,
          woNumber: r.wo_number ?? r.id.slice(0, 8),
          status,
          lineId: r.production_line_id,
          lineCode: r.line_code,
          productId: r.product_id,
          itemCode: r.item_code,
          productName: r.product_name,
          plannedKg,
          producedKg,
          progressPct,
          allergenGate: Boolean(r.has_allergen),
          overProductionFlagged: Boolean(r.over_production_flagged),
        };
      });

      return {
        ok: true,
        data: {
          woInProgress,
          woActiveTotal,
          overProducedCount,
          outputTodayKg,
          outputTodayOther,
          oeeCurrentPct,
          openDowntime,
          statusCounts,
          woRows,
        },
      };
    });
  } catch (error) {
    console.error('[production/dashboard] KPI aggregate read failed:', error);
    return { ok: false, reason: 'error' };
  }
}

/**
 * 08-Production — Analytics hub (read-only): OEE / yield / waste aggregates.
 *
 * Prototype: prototypes/design/Monopilot Design System/production/other-screens.jsx:398-504
 * (AnalyticsScreen). The prototype's hard-coded KPIs / SPARK_OEE / yield-by-line / top-
 * downtime mocks are replaced 1:1 with real Supabase aggregates over a rolling 7-day
 * window:
 *   - OEE 7-day avg + FPQ (quality_pct) + the OEE trend sparkline → oee_snapshots
 *   - yield KPI + yield-by-line (avg work_orders.yield_percent)   → work_orders (same as Reporting)
 *   - waste % (waste / (output + waste) over wo_outputs + waste)  → wo_outputs ⋈ wo_waste_log ⋈ work_orders
 *   - top downtime drivers (30d)                                  → downtime_events ⋈ downtime_categories
 * Simple SQL aggregates; the trend renders via the shared Sparkline SVG (the cost-history
 * pattern) — NO new chart libraries. No mocks.
 *
 * Every read runs inside `withOrgContext` — RLS scopes to the signed-in org. Gated
 * server-side on `production.oee.read` (migration 185) like the dashboard loader.
 */
import { num, pct } from '../../../reporting/_actions/shared';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const PRODUCTION_VIEW_PERMISSION = 'production.oee.read';

export type OeeTrendPoint = { bucket: string; oeePct: number };

export type YieldByLineRow = { lineId: string; yieldPct: number };

export type TopDowntimeRow = {
  categoryName: string | null;
  lineId: string;
  events: number;
  minutes: number;
};

export type AnalyticsScreenData = {
  /** avg(oee_pct) over the 7-day window; null when no snapshots. */
  oeeAvgPct: number | null;
  /** avg(quality_pct) over the 7-day window (first-pass quality proxy); null when none. */
  fpqAvgPct: number | null;
  /** avg(work_orders.yield_percent) × 100 over completed WOs; null when none. */
  yieldAvgPct: number | null;
  /** Waste % of produced over 7 days = waste_kg / (waste_kg + output_kg); null when no output. */
  wastePct: number | null;
  /** OEE trend points (hourly buckets), oldest→newest. */
  oeeTrend: OeeTrendPoint[];
  /** Per-line avg(yield_percent) × 100, sorted desc. */
  yieldByLine: YieldByLineRow[];
  /** Top downtime drivers over 30 days. */
  topDowntime: TopDowntimeRow[];
};

export type AnalyticsScreenResult =
  | { ok: true; data: AnalyticsScreenData }
  | { ok: false; reason: 'forbidden' | 'error' };

export type AnalyticsScreenWindow = {
  from: Date;
  to: Date;
};

export type AnalyticsScreenInput = {
  window?: AnalyticsScreenWindow;
};

const MS_PER_DAY = 86_400_000;

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


function defaultWindow(days: number, now = new Date()): AnalyticsScreenWindow {
  return { from: new Date(now.getTime() - days * MS_PER_DAY), to: now };
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function validWindow(input: AnalyticsScreenWindow | undefined): input is AnalyticsScreenWindow {
  return validDate(input?.from) && validDate(input?.to) && input.from.getTime() <= input.to.getTime();
}

export async function getAnalyticsScreen(input?: AnalyticsScreenInput): Promise<AnalyticsScreenResult> {
  const now = new Date();
  const candidateWindow = input?.window;
  const inputWindow = validWindow(candidateWindow) ? candidateWindow : undefined;
  const analyticsWindow = inputWindow ?? defaultWindow(7, now);
  const downtimeWindow = inputWindow ?? defaultWindow(30, now);

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<AnalyticsScreenResult> => {
      const c = client as QueryClient;

      const allowed = await hasPermission(c, userId, orgId, PRODUCTION_VIEW_PERMISSION);
      if (!allowed) {
        return { ok: false, reason: 'forbidden' };
      }

      // OEE / FPQ / yield KPIs over the selected/default rolling 7-day window.
      const oeeKpiRes = await c.query<{ oee_avg: string | number | null; fpq_avg: string | number | null }>(
        `select avg(oee_pct) as oee_avg,
                avg(quality_pct) as fpq_avg
           from public.oee_snapshots
          where org_id = app.current_org_id()
            and snapshot_minute >= $1::timestamptz
            and snapshot_minute <= $2::timestamptz`,
        [analyticsWindow.from, analyticsWindow.to],
      );
      const oeeAvgPct = num(oeeKpiRes.rows[0]?.oee_avg);
      const fpqAvgPct = num(oeeKpiRes.rows[0]?.fpq_avg);

      // Yield KPI — same definition as Reporting productionSummary:
      // avg(work_orders.yield_percent) over completed WOs in the window (0..1 fraction).
      const yieldKpiRes = await c.query<{ avg_yield: string | number | null }>(
        `select avg(wo.yield_percent)::text as avg_yield
           from public.work_orders wo
          where wo.org_id = app.current_org_id()
            and wo.status in ('COMPLETED', 'CLOSED')
            and wo.completed_at is not null
            and wo.completed_at >= $1::timestamptz
            and wo.completed_at <= $2::timestamptz`,
        [analyticsWindow.from, analyticsWindow.to],
      );
      const avgYieldRaw = yieldKpiRes.rows[0]?.avg_yield;
      const yieldAvgPct =
        avgYieldRaw === null || avgYieldRaw === undefined ? null : num(avgYieldRaw) * 100;

      // Waste % — same numerator/denominator as Reporting: sums over WO-linked rows.
      const outputKpiRes = await c.query<{ output_kg: string | null }>(
        `select sum(o.qty_kg)::text as output_kg
           from public.wo_outputs o
           join public.work_orders wo
             on wo.org_id = app.current_org_id()
            and wo.id = o.wo_id
          where o.org_id = app.current_org_id()
            and o.registered_at >= $1::timestamptz
            and o.registered_at <= $2::timestamptz`,
        [analyticsWindow.from, analyticsWindow.to],
      );
      const wasteKpiRes = await c.query<{ waste_kg: string | null }>(
        `select sum(w.qty_kg)::text as waste_kg
           from public.wo_waste_log w
           join public.work_orders wo
             on wo.org_id = app.current_org_id()
            and wo.id = w.wo_id
          where w.org_id = app.current_org_id()
            and w.recorded_at >= $1::timestamptz
            and w.recorded_at <= $2::timestamptz`,
        [analyticsWindow.from, analyticsWindow.to],
      );
      const outputKg = num(outputKpiRes.rows[0]?.output_kg);
      const wasteKg = num(wasteKpiRes.rows[0]?.waste_kg);
      const wastePctRaw = pct(wasteKg, outputKg + wasteKg);
      const wastePct = wastePctRaw === null ? null : num(wastePctRaw);

      // OEE trend — hourly buckets over the selected/default 7 days, oldest→newest.
      const trendRes = await c.query<{ bucket: string; oee_pct: string | number | null }>(
        `select date_trunc('hour', snapshot_minute) as bucket,
                avg(oee_pct) as oee_pct
           from public.oee_snapshots
          where org_id = app.current_org_id()
            and snapshot_minute >= $1::timestamptz
            and snapshot_minute <= $2::timestamptz
          group by 1
          order by 1 asc`,
        [analyticsWindow.from, analyticsWindow.to],
      );
      const oeeTrend: OeeTrendPoint[] = trendRes.rows
        .filter((r) => r.oee_pct !== null)
        .map((r) => ({ bucket: r.bucket, oeePct: Number(r.oee_pct) }));

      // Yield by line — avg(yield_percent) × 100 per production line (Reporting-aligned).
      const yieldRes = await c.query<{ line_label: string; yield_pct: string | null }>(
        `select coalesce(pl.code, pl.name, 'Unassigned') as line_label,
                avg(wo.yield_percent)::text as yield_pct
           from public.work_orders wo
           left join public.production_lines pl
             on pl.org_id = wo.org_id and pl.id = wo.production_line_id
          where wo.org_id = app.current_org_id()
            and wo.status in ('COMPLETED', 'CLOSED')
            and wo.completed_at is not null
            and wo.completed_at >= $1::timestamptz
            and wo.completed_at <= $2::timestamptz
            and wo.yield_percent is not null
          group by pl.code, pl.name
          order by yield_pct desc
          limit 12`,
        [analyticsWindow.from, analyticsWindow.to],
      );
      const yieldByLine: YieldByLineRow[] = yieldRes.rows
        .filter((r) => r.yield_pct !== null)
        .map((r) => ({ lineId: r.line_label, yieldPct: num(r.yield_pct) * 100 }));

      // Top downtime drivers over the selected/default 30 days.
      const topRes = await c.query<{
        category_name: string | null;
        line_id: string;
        line_label: string;
        events: number;
        minutes: number;
      }>(
        `select dc.name as category_name,
                de.line_id,
                coalesce(pl.code, pl.name, 'Unassigned') as line_label,
                count(*)::int as events,
                coalesce(sum(de.duration_min), 0)::int as minutes
           from public.downtime_events de
          left join public.downtime_categories dc
             on dc.id = de.category_id and dc.org_id = de.org_id
          left join public.production_lines pl
             on pl.org_id = app.current_org_id()
            and pl.id::text = de.line_id
          where de.org_id = app.current_org_id()
            and de.started_at >= $1::timestamptz
            and de.started_at <= $2::timestamptz
          group by dc.name, de.line_id, pl.code, pl.name
          order by minutes desc, events desc
          limit 10`,
        [downtimeWindow.from, downtimeWindow.to],
      );
      const topDowntime: TopDowntimeRow[] = topRes.rows.map((r) => ({
        categoryName: r.category_name,
        lineId: r.line_label,
        events: Number(r.events ?? 0),
        minutes: Number(r.minutes ?? 0),
      }));

      return {
        ok: true,
        data: { oeeAvgPct, fpqAvgPct, yieldAvgPct, wastePct, oeeTrend, yieldByLine, topDowntime },
      };
    });
  } catch (error) {
    console.error('[production/analytics] read failed:', error);
    return { ok: false, reason: 'error' };
  }
}

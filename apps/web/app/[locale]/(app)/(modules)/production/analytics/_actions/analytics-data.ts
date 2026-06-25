/**
 * 08-Production — Analytics hub (read-only): OEE / yield / waste aggregates.
 *
 * Prototype: prototypes/design/Monopilot Design System/production/other-screens.jsx:398-504
 * (AnalyticsScreen). The prototype's hard-coded KPIs / SPARK_OEE / yield-by-line / top-
 * downtime mocks are replaced 1:1 with real Supabase aggregates over a rolling 7-day
 * window:
 *   - OEE 7-day avg + FPQ (quality_pct) + the OEE trend sparkline → oee_snapshots
 *   - yield-by-line (avg quality_pct as a yield proxy)            → oee_snapshots
 *   - waste %                                                     → wo_waste_log + wo_outputs
 *   - top downtime drivers (30d)                                  → downtime_events ⋈ downtime_categories
 * Simple SQL aggregates; the trend renders via the shared Sparkline SVG (the cost-history
 * pattern) — NO new chart libraries. No mocks.
 *
 * Every read runs inside `withOrgContext` — RLS scopes to the signed-in org. Gated
 * server-side on `production.oee.read` (migration 185) like the dashboard loader.
 */
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
  /** Yield proxy = avg(quality_pct) plant-wide; null when none. */
  yieldAvgPct: number | null;
  /** Waste % of produced over 7 days = waste_kg / (waste_kg + output_kg); null when no output. */
  wastePct: number | null;
  /** OEE trend points (hourly buckets), oldest→newest. */
  oeeTrend: OeeTrendPoint[];
  /** Per-line yield (avg quality_pct), sorted desc. */
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

function num(v: string | number | null | undefined): number | null {
  return v === null || v === undefined ? null : Number(v);
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
      const yieldAvgPct = fpqAvgPct;

      // Waste % over the selected/default 7 days = waste / (waste + output).
      const wasteKpiRes = await c.query<{ waste_kg: string | number | null; output_kg: string | number | null }>(
        `select (select coalesce(sum(qty_kg), 0)
                   from public.wo_waste_log
                  where org_id = app.current_org_id()
                    and recorded_at >= $1::timestamptz
                    and recorded_at <= $2::timestamptz) as waste_kg,
                (select coalesce(sum(qty_kg), 0)
                   from public.wo_outputs
                  where org_id = app.current_org_id()
                    and registered_at >= $1::timestamptz
                    and registered_at <= $2::timestamptz) as output_kg`,
        [analyticsWindow.from, analyticsWindow.to],
      );
      const wasteKg = Number(wasteKpiRes.rows[0]?.waste_kg ?? 0);
      const outputKg = Number(wasteKpiRes.rows[0]?.output_kg ?? 0);
      const denom = wasteKg + outputKg;
      const wastePct = denom > 0 ? (wasteKg / denom) * 100 : null;

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

      // Yield by line — avg(quality_pct) over the selected/default 7 days, sorted desc.
      const yieldRes = await c.query<{ line_id: string; line_label: string; yield_pct: string | number | null }>(
        `select s.line_id,
                coalesce(pl.code, pl.name, 'Unassigned') as line_label,
                avg(s.quality_pct) as yield_pct
          from public.oee_snapshots s
          left join public.production_lines pl
            on pl.org_id = app.current_org_id()
           and pl.id::text = s.line_id
          where s.org_id = app.current_org_id()
            and s.snapshot_minute >= $1::timestamptz
            and s.snapshot_minute <= $2::timestamptz
          group by s.line_id, pl.code, pl.name
          order by yield_pct desc
          limit 12`,
        [analyticsWindow.from, analyticsWindow.to],
      );
      const yieldByLine: YieldByLineRow[] = yieldRes.rows
        .filter((r) => r.yield_pct !== null)
        .map((r) => ({ lineId: r.line_label, yieldPct: Number(r.yield_pct) }));

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

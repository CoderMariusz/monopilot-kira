/**
 * 08-Production — Waste analytics screen (read-only): org-scoped KPIs + log.
 *
 * Prototype: prototypes/design/Monopilot Design System/production/new-screens.jsx:5-213
 * (WasteAnalyticsScreen). The prototype's WASTE_* mock arrays are replaced 1:1 with real
 * Supabase reads (wo_waste_log ⋈ waste_categories ⋈ work_orders, migration 183). The
 * waste table carries no line_id, so the line is resolved through work_orders.
 * production_line_id. No mocks.
 *
 * Every read runs inside `withOrgContext` — RLS scopes to the signed-in org. The page is
 * gated server-side on `production.oee.read` (migration 185), exactly like the Production
 * dashboard loader. Read-only here (logging is the WO waste action).
 */
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const PRODUCTION_VIEW_PERMISSION = 'production.oee.read';

export type WasteEventRow = {
  id: string;
  recordedAt: string;
  lineId: string | null;
  woNumber: string | null;
  categoryName: string | null;
  qtyKg: number;
  operatorName: string | null;
  reason: string | null;
  /** Wave R2 — set on signed counter-entries (mig 293); the journal renders them distinctly. */
  correctionOfId: string | null;
};

export type WasteParetoRow = {
  categoryName: string;
  qtyKg: number;
  events: number;
};

export type WasteByLineRow = {
  lineId: string;
  qtyKg: number;
  events: number;
};

export type WasteScreenData = {
  /** sum(qty_kg) across all in-scope waste rows. */
  totalKg: number;
  /** count(*) of waste rows. */
  eventCount: number;
  /** Top category by kg (null when empty). */
  topCategory: { name: string; qtyKg: number; events: number } | null;
  /** Distinct lines that logged waste. */
  lineCount: number;
  /** Pareto buckets sorted by kg desc. */
  pareto: WasteParetoRow[];
  /** Per-line totals sorted by kg desc. */
  byLine: WasteByLineRow[];
  /** Event-log rows, newest first (capped). */
  events: WasteEventRow[];
};

export type WasteScreenResult =
  | { ok: true; data: WasteScreenData }
  | { ok: false; reason: 'forbidden' | 'error' };

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

function normalizeWindowDays(windowDays: number): number {
  return [1, 7, 30, 90].includes(windowDays) ? windowDays : 1;
}

function wasteDatePredicate(column: string, windowDays: number): string {
  const start =
    windowDays === 1
      ? `${column} >= date_trunc('day', now() AT TIME ZONE 'UTC')`
      : `${column} >= date_trunc('day', now() AT TIME ZONE 'UTC') - make_interval(days => ${windowDays - 1})`;
  return `${start}
            and ${column} < date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day'`;
}

export async function getWasteScreen(windowDays = 1): Promise<WasteScreenResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WasteScreenResult> => {
      const c = client as QueryClient;
      const days = normalizeWindowDays(windowDays);

      const allowed = await hasPermission(c, userId, orgId, PRODUCTION_VIEW_PERMISSION);
      if (!allowed) {
        return { ok: false, reason: 'forbidden' };
      }

      // KPI totals. Wave R2 storno semantics: SUMS stay signed/net (negative
      // counter-entries cancel voided waste); event COUNTS exclude correction
      // rows so a void doesn't inflate the journal volume.
      const kpiRes = await c.query<{ total_kg: string | number | null; event_count: number; line_count: number }>(
        `select coalesce(sum(wl.qty_kg), 0) as total_kg,
                count(*) filter (where wl.correction_of_id is null)::int as event_count,
                count(distinct w.production_line_id)::int as line_count
          from public.wo_waste_log wl
           left join public.work_orders w
             on w.id = wl.wo_id and w.org_id = wl.org_id
          where wl.org_id = app.current_org_id()
            and ${wasteDatePredicate('recorded_at', days)}`,
      );
      const totalKg = Number(kpiRes.rows[0]?.total_kg ?? 0);
      const eventCount = kpiRes.rows[0]?.event_count ?? 0;
      const lineCount = kpiRes.rows[0]?.line_count ?? 0;

      // Pareto by category, kg desc.
      const paretoRes = await c.query<{ category_name: string | null; qty_kg: string | number | null; events: number }>(
        `select wc.name as category_name,
                coalesce(sum(wl.qty_kg), 0) as qty_kg,
                count(*) filter (where wl.correction_of_id is null)::int as events
           from public.wo_waste_log wl
           left join public.waste_categories wc
             on wc.id = wl.category_id and wc.org_id = wl.org_id
          where wl.org_id = app.current_org_id()
            and ${wasteDatePredicate('recorded_at', days)}
          group by wc.name
          order by qty_kg desc, events desc
          limit 12`,
      );
      const pareto: WasteParetoRow[] = paretoRes.rows
        .filter((r) => r.category_name !== null)
        .map((r) => ({
          categoryName: r.category_name as string,
          qtyKg: Number(r.qty_kg ?? 0),
          events: Number(r.events ?? 0),
        }));
      const topCategory = pareto.length > 0
        ? { name: pareto[0]!.categoryName, qtyKg: pareto[0]!.qtyKg, events: pareto[0]!.events }
        : null;

      // By line, kg desc.
      const byLineRes = await c.query<{ line_id: string | null; qty_kg: string | number | null; events: number }>(
        `select w.production_line_id::text as line_id,
                coalesce(sum(wl.qty_kg), 0) as qty_kg,
                count(*) filter (where wl.correction_of_id is null)::int as events
           from public.wo_waste_log wl
           left join public.work_orders w
             on w.id = wl.wo_id and w.org_id = wl.org_id
          where wl.org_id = app.current_org_id()
            and ${wasteDatePredicate('recorded_at', days)}
            and w.production_line_id is not null
          group by w.production_line_id
          order by qty_kg desc
          limit 12`,
      );
      const byLine: WasteByLineRow[] = byLineRes.rows.map((r) => ({
        lineId: (r.line_id as string).slice(0, 8),
        qtyKg: Number(r.qty_kg ?? 0),
        events: Number(r.events ?? 0),
      }));

      // Event log, newest first.
      const eventsRes = await c.query<{
        id: string;
        recorded_at: string;
        line_id: string | null;
        wo_number: string | null;
        category_name: string | null;
        qty_kg: string | number | null;
        operator_name: string | null;
        reason_notes: string | null;
        reason_code: string | null;
        correction_of_id: string | null;
      }>(
        `select wl.id::text as id,
                wl.correction_of_id::text as correction_of_id,
                wl.recorded_at,
                w.production_line_id::text as line_id,
                w.wo_number,
                wc.name as category_name,
                wl.qty_kg,
                u.name as operator_name,
                wl.reason_notes,
                wl.reason_code
           from public.wo_waste_log wl
           left join public.waste_categories wc
             on wc.id = wl.category_id and wc.org_id = wl.org_id
           left join public.work_orders w
             on w.id = wl.wo_id and w.org_id = wl.org_id
           left join public.users u
             on u.id = wl.operator_id
          where wl.org_id = app.current_org_id()
            and ${wasteDatePredicate('recorded_at', days)}
          order by wl.recorded_at desc
          limit 100`,
      );
      const events: WasteEventRow[] = eventsRes.rows.map((r) => ({
        id: r.id,
        recordedAt: r.recorded_at,
        lineId: r.line_id ? r.line_id.slice(0, 8) : null,
        woNumber: r.wo_number,
        categoryName: r.category_name,
        qtyKg: Number(r.qty_kg ?? 0),
        operatorName: r.operator_name,
        reason: r.reason_notes ?? r.reason_code ?? null,
        correctionOfId: r.correction_of_id,
      }));

      return {
        ok: true,
        data: { totalKg, eventCount, topCategory, lineCount, pareto, byLine, events },
      };
    });
  } catch (error) {
    console.error('[production/waste] read failed:', error);
    return { ok: false, reason: 'error' };
  }
}

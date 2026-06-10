/**
 * 08-Production — Downtime screen (read-only): org-scoped event log + KPI strip.
 *
 * Prototype: prototypes/design/Monopilot Design System/production/other-screens.jsx:126-217
 * (DowntimeScreen). The prototype's DOWNTIME / PARETO mock arrays are replaced 1:1
 * with real Supabase reads (downtime_events joined to downtime_categories — the same
 * reference table the WO pause endpoint references via reasonCategoryId, migration
 * 183). No mocks.
 *
 * Every read runs inside `withOrgContext`, executing as `app_user` with
 * `app.set_org_context(...)` applied — RLS (`org_id = app.current_org_id()`) scopes
 * every row/aggregate to the signed-in user's org. The page is gated server-side on
 * `production.oee.read` (the production read permission, migration 185), exactly like
 * the Production dashboard loader. The client never re-queries and never trusts a
 * client-side flag.
 *
 * NOT a `"use server"` module: invoked directly from the Downtime Server Component
 * during render (the withOrgContext import keeps it server-only in practice).
 */
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

/** The production view permission (migration 185 — org-admin/operator/supervisor). */
const PRODUCTION_VIEW_PERMISSION = 'production.oee.read';

/** downtime_events.source enum (migration 183). */
export type DowntimeSource = 'manual' | 'wo_pause' | 'plc_auto' | 'changeover';

/** downtime_categories.kind (migration 183) — drives the prototype red/amber/blue badge. */
export type DowntimeKind = 'planned' | 'unplanned' | 'changeover';

/** One downtime event row (live, org-scoped). */
export type DowntimeEventRow = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  lineId: string;
  woNumber: string | null;
  categoryName: string | null;
  categoryKind: DowntimeKind | null;
  reasonNotes: string | null;
  operatorName: string | null;
  durationMin: number | null;
  source: DowntimeSource;
  /** True while ended_at IS NULL (open event). */
  isOpen: boolean;
};

/** One Pareto bucket (category → total minutes, event count). */
export type DowntimeParetoRow = {
  /** Null when the row's category is missing — the RSC supplies an i18n fallback label. */
  categoryName: string | null;
  categoryKind: DowntimeKind | null;
  totalMin: number;
  events: number;
};

export type DowntimeScreenData = {
  /** count(*) of all events in scope. */
  eventCount: number;
  /** sum(duration_min) over completed events, in minutes. */
  totalMin: number;
  /** count(*) of currently-open events (ended_at IS NULL). */
  openCount: number;
  /** Pareto buckets sorted by minutes desc. */
  pareto: DowntimeParetoRow[];
  /** Event-log rows, newest first (capped). */
  events: DowntimeEventRow[];
};

export type DowntimeScreenResult =
  | { ok: true; data: DowntimeScreenData }
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

const KIND_VALUES: DowntimeKind[] = ['planned', 'unplanned', 'changeover'];
const SOURCE_VALUES: DowntimeSource[] = ['manual', 'wo_pause', 'plc_auto', 'changeover'];

/**
 * Aggregates the downtime KPI strip + Pareto + event log in a SINGLE org-context
 * transaction (sequential queries on one pooled pg client).
 */
export async function getDowntimeScreen(): Promise<DowntimeScreenResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<DowntimeScreenResult> => {
      const c = client as QueryClient;

      const allowed = await hasPermission(c, userId, orgId, PRODUCTION_VIEW_PERMISSION);
      if (!allowed) {
        return { ok: false, reason: 'forbidden' };
      }

      // KPI aggregates — count, total minutes (completed events), open count.
      const kpiRes = await c.query<{ event_count: number; total_min: number; open_count: number }>(
        `select count(*)::int as event_count,
                coalesce(sum(duration_min), 0)::int as total_min,
                count(*) filter (where ended_at is null)::int as open_count
           from public.downtime_events
          where org_id = app.current_org_id()`,
      );
      const eventCount = kpiRes.rows[0]?.event_count ?? 0;
      const totalMin = kpiRes.rows[0]?.total_min ?? 0;
      const openCount = kpiRes.rows[0]?.open_count ?? 0;

      // Pareto — category → minutes / events, sorted by minutes desc.
      const paretoRes = await c.query<{
        category_name: string | null;
        category_kind: string | null;
        total_min: number;
        events: number;
      }>(
        `select dc.name as category_name,
                dc.kind as category_kind,
                coalesce(sum(de.duration_min), 0)::int as total_min,
                count(*)::int as events
           from public.downtime_events de
           left join public.downtime_categories dc
             on dc.id = de.category_id and dc.org_id = de.org_id
          where de.org_id = app.current_org_id()
          group by dc.name, dc.kind
          order by total_min desc, events desc
          limit 12`,
      );
      const pareto: DowntimeParetoRow[] = paretoRes.rows.map((r) => ({
        categoryName: r.category_name,
        categoryKind: KIND_VALUES.includes(r.category_kind as DowntimeKind)
          ? (r.category_kind as DowntimeKind)
          : null,
        totalMin: Number(r.total_min ?? 0),
        events: Number(r.events ?? 0),
      }));

      // Event log — newest first, joined to category + WO number + operator name.
      const eventsRes = await c.query<{
        id: string;
        started_at: string;
        ended_at: string | null;
        line_id: string;
        wo_number: string | null;
        category_name: string | null;
        category_kind: string | null;
        reason_notes: string | null;
        operator_name: string | null;
        duration_min: number | null;
        source: string;
      }>(
        `select de.id::text as id,
                de.started_at,
                de.ended_at,
                de.line_id,
                w.wo_number,
                dc.name as category_name,
                dc.kind as category_kind,
                de.reason_notes,
                u.name as operator_name,
                de.duration_min,
                de.source::text as source
           from public.downtime_events de
           left join public.downtime_categories dc
             on dc.id = de.category_id and dc.org_id = de.org_id
           left join public.work_orders w
             on w.id = de.wo_id and w.org_id = de.org_id
           left join public.users u
             on u.id = de.operator_id
          where de.org_id = app.current_org_id()
          order by de.started_at desc
          limit 100`,
      );
      const events: DowntimeEventRow[] = eventsRes.rows.map((r) => ({
        id: r.id,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        lineId: r.line_id,
        woNumber: r.wo_number,
        categoryName: r.category_name,
        categoryKind: KIND_VALUES.includes(r.category_kind as DowntimeKind)
          ? (r.category_kind as DowntimeKind)
          : null,
        reasonNotes: r.reason_notes,
        operatorName: r.operator_name,
        durationMin: r.duration_min === null || r.duration_min === undefined ? null : Number(r.duration_min),
        source: SOURCE_VALUES.includes(r.source as DowntimeSource) ? (r.source as DowntimeSource) : 'manual',
        isOpen: r.ended_at === null,
      }));

      return { ok: true, data: { eventCount, totalMin, openCount, pareto, events } };
    });
  } catch (error) {
    console.error('[production/downtime] read failed:', error);
    return { ok: false, reason: 'error' };
  }
}

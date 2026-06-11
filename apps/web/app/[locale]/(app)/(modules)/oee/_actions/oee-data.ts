/**
 * 15-OEE — dashboard loader (READ-ONLY consumer of oee_snapshots per D-OEE-1;
 * 08-production owns the producer — apps/web/lib/production/oee-snapshot-producer.ts).
 *
 * Prototype: prototypes/design/Monopilot Design System/oee/dashboard.jsx (OEE-003
 * Daily Summary). This loader feeds the honest minimal vertical of that screen:
 * KPI averages, per-line A/P/Q table, recent snapshot list — all straight from
 * `oee_snapshots` (the T-006/T-007 MVs + worker refresh are 15-OEE backlog tasks).
 *
 * Every read runs inside `withOrgContext` as `app_user` — RLS
 * (`org_id = app.current_org_id()`) scopes all rows. Gated server-side on
 * `oee.dashboard.read` (seeded to the org-admin family + oee_* roles, mig 203 T-026).
 *
 * Percent values stay TEXT end-to-end (SQL `round(...)::text`) — no float roundtrip;
 * NULL averages (e.g. performance never computable) surface as null → "—" in the UI.
 *
 * NOT a `'use server'` module: invoked from the OEE Server Component during render.
 */
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const OEE_VIEW_PERMISSION = 'oee.dashboard.read';

/** KPI tile aggregates over the trailing 7-day window. */
export type OeeKpis = {
  snapshotCount: number;
  /** round(avg, 1) as text; null when no non-null values exist in the window. */
  avgOee: string | null;
  avgAvailability: string | null;
  avgPerformance: string | null;
  avgQuality: string | null;
};

export type OeeLineRow = {
  lineId: string;
  /** production_lines code/name when line_id resolves to a line uuid; else null. */
  lineCode: string | null;
  lineName: string | null;
  woCount: number;
  avgAvailability: string | null;
  avgPerformance: string | null;
  avgQuality: string | null;
  avgOee: string | null;
};

export type OeeSnapshotRow = {
  id: string;
  snapshotMinute: string;
  lineId: string;
  lineCode: string | null;
  shiftId: string;
  woNumber: string | null;
  availability: string | null;
  performance: string | null;
  quality: string | null;
  oee: string | null;
  outputKg: string | null;
  downtimeMin: number | null;
  wasteKg: string | null;
};

export type OeeScreenData = {
  kpis: OeeKpis;
  lines: OeeLineRow[];
  recent: OeeSnapshotRow[];
};

export type OeeScreenResult =
  | { ok: true; data: OeeScreenData }
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

export async function getOeeScreen(): Promise<OeeScreenResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<OeeScreenResult> => {
      const c = client as QueryClient;

      const allowed = await hasPermission(c, userId, orgId, OEE_VIEW_PERMISSION);
      if (!allowed) return { ok: false, reason: 'forbidden' };

      // KPI tiles — trailing 7 days. avg() skips NULLs (honest-NULL components);
      // an all-NULL column yields NULL → "—" tile.
      const kpiRes = await c.query<{
        snapshot_count: number;
        avg_oee: string | null;
        avg_a: string | null;
        avg_p: string | null;
        avg_q: string | null;
      }>(
        `select count(*)::int as snapshot_count,
                round(avg(oee_pct), 1)::text as avg_oee,
                round(avg(availability_pct), 1)::text as avg_a,
                round(avg(performance_pct), 1)::text as avg_p,
                round(avg(quality_pct), 1)::text as avg_q
           from public.oee_snapshots
          where org_id = app.current_org_id()
            and snapshot_minute >= pg_catalog.now() - interval '7 days'`,
      );
      const k = kpiRes.rows[0];
      const kpis: OeeKpis = {
        snapshotCount: Number(k?.snapshot_count ?? 0),
        avgOee: k?.avg_oee ?? null,
        avgAvailability: k?.avg_a ?? null,
        avgPerformance: k?.avg_p ?? null,
        avgQuality: k?.avg_q ?? null,
      };

      // Per-line aggregates — trailing 7 days. line_id stores the production line
      // uuid as text ('unassigned' fallback); resolve code/name where it matches.
      const linesRes = await c.query<{
        line_id: string;
        line_code: string | null;
        line_name: string | null;
        wo_count: number;
        avg_a: string | null;
        avg_p: string | null;
        avg_q: string | null;
        avg_oee: string | null;
      }>(
        `select s.line_id,
                pl.code as line_code,
                pl.name as line_name,
                count(distinct s.active_wo_id) filter (where s.active_wo_id is not null)::int as wo_count,
                round(avg(s.availability_pct), 1)::text as avg_a,
                round(avg(s.performance_pct), 1)::text as avg_p,
                round(avg(s.quality_pct), 1)::text as avg_q,
                round(avg(s.oee_pct), 1)::text as avg_oee
           from public.oee_snapshots s
           left join public.production_lines pl
             on pl.org_id = s.org_id and pl.id::text = s.line_id
          where s.org_id = app.current_org_id()
            and s.snapshot_minute >= pg_catalog.now() - interval '7 days'
          group by s.line_id, pl.code, pl.name
          order by avg(s.oee_pct) desc nulls last, s.line_id
          limit 50`,
      );
      const lines: OeeLineRow[] = linesRes.rows.map((r) => ({
        lineId: r.line_id,
        lineCode: r.line_code,
        lineName: r.line_name,
        woCount: Number(r.wo_count ?? 0),
        avgAvailability: r.avg_a,
        avgPerformance: r.avg_p,
        avgQuality: r.avg_q,
        avgOee: r.avg_oee,
      }));

      // Recent snapshots — newest first (all-time, capped).
      const recentRes = await c.query<{
        id: string;
        snapshot_minute: string;
        line_id: string;
        line_code: string | null;
        shift_id: string;
        wo_number: string | null;
        a: string | null;
        p: string | null;
        q: string | null;
        oee: string | null;
        output_kg: string | null;
        downtime_min: number | null;
        waste_kg: string | null;
      }>(
        `select s.id::text as id,
                s.snapshot_minute,
                s.line_id,
                pl.code as line_code,
                s.shift_id,
                w.wo_number,
                round(s.availability_pct, 1)::text as a,
                round(s.performance_pct, 1)::text as p,
                round(s.quality_pct, 1)::text as q,
                round(s.oee_pct, 1)::text as oee,
                s.output_qty_delta::text as output_kg,
                s.downtime_min_delta as downtime_min,
                s.waste_qty_delta::text as waste_kg
           from public.oee_snapshots s
           left join public.production_lines pl
             on pl.org_id = s.org_id and pl.id::text = s.line_id
           left join public.work_orders w
             on w.org_id = s.org_id and w.id = s.active_wo_id
          where s.org_id = app.current_org_id()
          order by s.snapshot_minute desc, s.id desc
          limit 15`,
      );
      const recent: OeeSnapshotRow[] = recentRes.rows.map((r) => ({
        id: r.id,
        snapshotMinute: r.snapshot_minute,
        lineId: r.line_id,
        lineCode: r.line_code,
        shiftId: r.shift_id,
        woNumber: r.wo_number,
        availability: r.a,
        performance: r.p,
        quality: r.q,
        oee: r.oee,
        outputKg: r.output_kg,
        downtimeMin: r.downtime_min == null ? null : Number(r.downtime_min),
        wasteKg: r.waste_kg,
      }));

      return { ok: true, data: { kpis, lines, recent } };
    });
  } catch (error) {
    console.error('[oee] read failed:', error);
    return { ok: false, reason: 'error' };
  }
}

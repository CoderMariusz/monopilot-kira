/**
 * 08-Production — Shifts screen (read-only): shift roll-up.
 *
 * Prototype: prototypes/design/Monopilot Design System/production/other-screens.jsx:218-297
 * (ShiftsScreen). IMPORTANT — no shifts master table exists (per the audit). The
 * prototype's SHIFT_CREW / handover-notes / targets are not data-backed; instead we
 * aggregate by the `shift_id` text carried on the operational rows that do exist:
 *   - downtime_events.shift_id   (nullable)
 *   - wo_waste_log.shift_id      (NOT NULL)
 *   - oee_snapshots.shift_id     (NOT NULL)
 * For each distinct shift_id we surface downtime minutes/events, waste kg, and the
 * latest OEE snapshot. When nothing references a shift, the page shows an honest
 * empty-state. No mocks.
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

export type ShiftRollupRow = {
  shiftId: string;
  downtimeMin: number;
  downtimeEvents: number;
  wasteKg: number;
  wasteEvents: number;
  /** Latest oee_pct snapshot for the shift; null when none. */
  oeePct: number | null;
};

export type ShiftsScreenData = {
  shifts: ShiftRollupRow[];
};

export type ShiftsScreenResult =
  | { ok: true; data: ShiftsScreenData }
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

function shiftDatePredicate(column: string, windowDays: number): string {
  const start =
    windowDays === 1
      ? `${column} >= date_trunc('day', now() AT TIME ZONE 'UTC')`
      : `${column} >= date_trunc('day', now() AT TIME ZONE 'UTC') - make_interval(days => ${windowDays - 1})`;
  return `${start}
              and ${column} < date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day'`;
}

export async function getShiftsScreen(windowDays = 1): Promise<ShiftsScreenResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ShiftsScreenResult> => {
      const c = client as QueryClient;
      const days = normalizeWindowDays(windowDays);

      const allowed = await hasPermission(c, userId, orgId, PRODUCTION_VIEW_PERMISSION);
      if (!allowed) {
        return { ok: false, reason: 'forbidden' };
      }

      // Roll up downtime + waste + latest-OEE by the shift_id text across the three
      // shift-tagged operational tables (no shifts master exists). Each source is
      // pre-aggregated by shift_id, then full-outer-joined so a shift present in any
      // one source appears in the result.
      const res = await c.query<{
        shift_id: string;
        downtime_min: number;
        downtime_events: number;
        waste_kg: string | number | null;
        waste_events: number;
        oee_pct: string | number | null;
      }>(
        `with dt as (
           select shift_id,
                  coalesce(sum(duration_min), 0)::int as downtime_min,
                  count(*)::int as downtime_events
             from public.downtime_events
            where org_id = app.current_org_id() and shift_id is not null
              and ${shiftDatePredicate('started_at', days)}
            group by shift_id
         ),
         ws as (
           select shift_id,
                  coalesce(sum(qty_kg), 0) as waste_kg,
                  count(*)::int as waste_events
             from public.wo_waste_log
            where org_id = app.current_org_id()
              and ${shiftDatePredicate('recorded_at', days)}
            group by shift_id
         ),
         oe as (
           select distinct on (shift_id) shift_id, oee_pct
             from public.oee_snapshots
            where org_id = app.current_org_id()
              and ${shiftDatePredicate('snapshot_minute', days)}
            order by shift_id, snapshot_minute desc
         ),
         keys as (
           select shift_id from dt
           union select shift_id from ws
           union select shift_id from oe
         )
         select k.shift_id,
                coalesce(dt.downtime_min, 0) as downtime_min,
                coalesce(dt.downtime_events, 0) as downtime_events,
                coalesce(ws.waste_kg, 0) as waste_kg,
                coalesce(ws.waste_events, 0) as waste_events,
                oe.oee_pct
           from keys k
           left join dt on dt.shift_id = k.shift_id
           left join ws on ws.shift_id = k.shift_id
           left join oe on oe.shift_id = k.shift_id
          order by k.shift_id`,
      );

      const shifts: ShiftRollupRow[] = res.rows.map((r) => ({
        shiftId: r.shift_id,
        downtimeMin: Number(r.downtime_min ?? 0),
        downtimeEvents: Number(r.downtime_events ?? 0),
        wasteKg: Number(r.waste_kg ?? 0),
        wasteEvents: Number(r.waste_events ?? 0),
        oeePct: r.oee_pct === null || r.oee_pct === undefined ? null : Number(r.oee_pct),
      }));

      return { ok: true, data: { shifts } };
    });
  } catch (error) {
    console.error('[production/shifts] read failed:', error);
    return { ok: false, reason: 'error' };
  }
}

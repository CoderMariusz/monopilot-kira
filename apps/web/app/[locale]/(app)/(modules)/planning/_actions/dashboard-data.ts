/**
 * P-L5 — Planning Dashboard (SCREEN-01) org-scoped live reads.
 *
 * Prototype: prototypes/design/Monopilot Design System/planning/dashboard.jsx:4-262
 * (plan_dashboard, KPI strip + alert columns + upcoming-schedule tabs + header
 * actions). The prototype's PLAN_KPIS / WO_ALERTS / UPCOMING_WOS mock arrays are
 * replaced with REAL Supabase reads from public.work_orders (migration 176).
 *
 * Honest data policy (re-audited W9-M2): `purchase_orders` (mig 262) and
 * `transfer_orders` (mig 263) ARE live now, so the PO/TO KPI tiles show real
 * open counts and the PO/TO alert panels show real overdue documents — the old
 * "module not live yet" placeholders were lying after wave 8 and are gone.
 * No fake numbers are ever invented.
 *
 * Every read runs inside `withOrgContext`, executing as `app_user` with
 * `app.set_org_context(...)` applied — RLS (`org_id = app.current_org_id()`)
 * scopes every count/row to the signed-in user's org. No service-role bypass.
 *
 * RBAC: gated server-side on `scheduler.run.read` (the planning read gate wired in
 * apps/web/lib/navigation/module-registry.ts for planning-basic). The client never
 * re-queries and never trusts a client-side flag; a missing permission degrades to
 * the permission-denied state.
 *
 * NOT a `"use server"` module: invoked directly from the Planning dashboard Server
 * Component during render (like dashboard-summary.ts / production dashboard-data.ts).
 */
import { withOrgContext } from "../../../../../../lib/auth/with-org-context";

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

/** The planning read permission (module-registry planning-basic gate). */
const PLANNING_VIEW_PERMISSION = "scheduler.run.read";

/** WO planning statuses considered "active" for the in-progress KPI. */
const WO_ACTIVE_STATUSES = ["RELEASED", "IN_PROGRESS", "ON_HOLD"];
/** Statuses that count as "scheduled but not yet running" for past-start alerts. */
const WO_PRE_RUNNING_STATUSES = ["DRAFT", "RELEASED"];

/** Stable KPI tile keys (i18n + test ids). */
export type PlanningKpiKey = "openWos" | "wosToday" | "openPos" | "openTos";

export type PlanningKpi = {
  key: PlanningKpiKey;
  /** Live count, or null when the source table is not live yet. */
  value: number | null;
  /** Semantic colour band (.kpi.{green|amber|red}). */
  color: "blue" | "amber" | "red" | "green";
  /** True when value is null because the backing module is not live yet. */
  notLive: boolean;
};

/** One alert row surfaced in the WO alert panel (real, org-scoped). */
export type PlanningWoAlert = {
  id: string;
  woNumber: string;
  /** i18n key suffix under Planning.alerts.reasons.* */
  reasonKey: "pastStartNotRunning";
  severity: "red" | "amber";
};

/** One overdue PO/TO alert row (real, org-scoped). */
export type PlanningDocAlert = {
  id: string;
  refNumber: string;
  /** i18n key suffix under Planning.alerts.reasons.* */
  reasonKey: "poOverdue" | "toOverdue";
  severity: "red" | "amber";
};

/** One scheduled WO inside the 7-day upcoming window. */
export type PlanningScheduledWo = {
  id: string;
  woNumber: string;
  status: string;
  /** ISO timestamp of scheduled_start_time. */
  scheduledStart: string;
};

/** A single calendar day bucket inside the 7-day window. */
export type PlanningScheduleDay = {
  /** YYYY-MM-DD (UTC) bucket key. */
  date: string;
  wos: PlanningScheduledWo[];
};

export type PlanningDashboardData = {
  kpis: PlanningKpi[];
  alerts: PlanningWoAlert[];
  /** Overdue open POs (expected_delivery in the past). */
  poAlerts: PlanningDocAlert[];
  /** Overdue open TOs (scheduled_date in the past). */
  toAlerts: PlanningDocAlert[];
  /** 7-day schedule grouped by UTC day, ascending. */
  schedule: PlanningScheduleDay[];
};

export type PlanningDashboardResult =
  | { ok: true; data: PlanningDashboardData }
  | { ok: false; reason: "forbidden" | "error" };

/**
 * Pure helper (unit-tested): groups scheduled WOs into 7 ascending UTC-day
 * buckets starting from `fromDay`. Days with no WOs are still emitted so the
 * calendar always shows a full 7-day strip (empty-state-safe).
 */
export function groupScheduleByDay(
  wos: PlanningScheduledWo[],
  fromDay: Date,
  days = 7,
): PlanningScheduleDay[] {
  const dayKey = (d: Date): string => d.toISOString().slice(0, 10);
  const start = new Date(Date.UTC(fromDay.getUTCFullYear(), fromDay.getUTCMonth(), fromDay.getUTCDate()));

  const buckets: PlanningScheduleDay[] = [];
  const index = new Map<string, PlanningScheduleDay>();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const bucket: PlanningScheduleDay = { date: dayKey(d), wos: [] };
    buckets.push(bucket);
    index.set(bucket.date, bucket);
  }

  for (const wo of wos) {
    const key = wo.scheduledStart.slice(0, 10);
    const bucket = index.get(key);
    if (bucket) {
      bucket.wos.push(wo);
    }
  }

  for (const bucket of buckets) {
    bucket.wos.sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
  }

  return buckets;
}

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

export async function getPlanningDashboard(): Promise<PlanningDashboardResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<PlanningDashboardResult> => {
      const c = client as QueryClient;

      // ── RBAC gate (server-side, never trust the client) ──────────────────────
      const allowed = await hasPermission(c, userId, orgId, PLANNING_VIEW_PERMISSION);
      if (!allowed) {
        return { ok: false, reason: "forbidden" };
      }

      const countOf = async (sql: string, params?: readonly unknown[]): Promise<number> => {
        const res = await c.query<{ n: number }>(sql, params);
        return res.rows[0]?.n ?? 0;
      };

      // KPI — Open WOs (released / in-progress / on-hold).
      const openWos = await countOf(
        `select count(*)::int as n
           from public.work_orders
          where org_id = app.current_org_id()
            and status = any($1::text[])`,
        [WO_ACTIVE_STATUSES],
      );

      // KPI — WOs scheduled today (UTC day).
      const wosToday = await countOf(
        `select count(*)::int as n
           from public.work_orders
          where org_id = app.current_org_id()
            and scheduled_start_time >= (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')
            and scheduled_start_time < (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') + interval '1 day'`,
      );

      // 7-day schedule window (today .. +7d), real WOs with a scheduled start.
      const scheduleRes = await c.query<{
        id: string;
        wo_number: string | null;
        status: string;
        scheduled_start_time: string;
      }>(
        `select id::text as id,
                wo_number,
                status,
                scheduled_start_time
           from public.work_orders
          where org_id = app.current_org_id()
            and scheduled_start_time >= (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')
            and scheduled_start_time < (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') + interval '7 day'
          order by scheduled_start_time asc
          limit 200`,
      );

      const scheduledWos: PlanningScheduledWo[] = scheduleRes.rows.map((r) => ({
        id: r.id,
        woNumber: r.wo_number ?? r.id.slice(0, 8),
        status: r.status,
        scheduledStart: new Date(r.scheduled_start_time).toISOString(),
      }));
      const schedule = groupScheduleByDay(scheduledWos, new Date());

      // Alerts — WOs past their scheduled start but still DRAFT/RELEASED (not running).
      const alertRes = await c.query<{
        id: string;
        wo_number: string | null;
        status: string;
      }>(
        `select id::text as id, wo_number, status
           from public.work_orders
          where org_id = app.current_org_id()
            and status = any($1::text[])
            and scheduled_start_time is not null
            and scheduled_start_time < now()
          order by scheduled_start_time asc
          limit 25`,
        [WO_PRE_RUNNING_STATUSES],
      );
      const alerts: PlanningWoAlert[] = alertRes.rows.map((r) => ({
        id: r.id,
        woNumber: r.wo_number ?? r.id.slice(0, 8),
        reasonKey: "pastStartNotRunning",
        // Released-but-not-started is more urgent (capacity committed) than draft.
        severity: r.status === "RELEASED" ? "red" : "amber",
      }));

      // KPI — Open POs (mig 262): every status that is not terminal.
      const openPos = await countOf(
        `select count(*)::int as n
           from public.purchase_orders
          where org_id = app.current_org_id()
            and status in ('draft', 'sent', 'confirmed', 'partially_received')`,
      );

      // KPI — Open TOs (mig 263): draft or in transit.
      const openTos = await countOf(
        `select count(*)::int as n
           from public.transfer_orders
          where org_id = app.current_org_id()
            and status in ('draft', 'in_transit')`,
      );

      // Alerts — open POs whose expected delivery date has passed.
      const poAlertRes = await c.query<{ id: string; po_number: string; status: string }>(
        `select id::text as id, po_number, status
           from public.purchase_orders
          where org_id = app.current_org_id()
            and status in ('draft', 'sent', 'confirmed', 'partially_received')
            and expected_delivery is not null
            and expected_delivery < current_date
          order by expected_delivery asc
          limit 25`,
      );
      const poAlerts: PlanningDocAlert[] = poAlertRes.rows.map((r) => ({
        id: r.id,
        refNumber: r.po_number,
        reasonKey: "poOverdue",
        // Confirmed/partially received late = supply already committed → red.
        severity: r.status === "draft" || r.status === "sent" ? "amber" : "red",
      }));

      // Alerts — open TOs whose scheduled date has passed.
      const toAlertRes = await c.query<{ id: string; to_number: string; status: string }>(
        `select id::text as id, to_number, status
           from public.transfer_orders
          where org_id = app.current_org_id()
            and status in ('draft', 'in_transit')
            and scheduled_date is not null
            and scheduled_date < current_date
          order by scheduled_date asc
          limit 25`,
      );
      const toAlerts: PlanningDocAlert[] = toAlertRes.rows.map((r) => ({
        id: r.id,
        refNumber: r.to_number,
        reasonKey: "toOverdue",
        // Stock already moving late = red; a stale draft is amber.
        severity: r.status === "in_transit" ? "red" : "amber",
      }));

      const kpis: PlanningKpi[] = [
        { key: "openWos", value: openWos, color: "blue", notLive: false },
        { key: "wosToday", value: wosToday, color: "green", notLive: false },
        { key: "openPos", value: openPos, color: "amber", notLive: false },
        { key: "openTos", value: openTos, color: "amber", notLive: false },
      ];

      return { ok: true, data: { kpis, alerts, poAlerts, toAlerts, schedule } };
    });
  } catch (error) {
    console.error("[planning/dashboard] aggregate read failed:", error);
    return { ok: false, reason: "error" };
  }
}

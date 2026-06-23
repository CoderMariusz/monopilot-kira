/**
 * Org dashboard (home) data load — shell gap #3.
 *
 * Builds the prototype "Main Dashboard" (sitemap source:
 * `prototypes/design/Monopilot Design System/source/MONOPILOT-SITEMAP.html:123`)
 * from REAL Supabase data wherever the table exists, in a SINGLE
 * `withOrgContext` transaction (the established data-plane pattern — RLS scopes
 * every read to the signed-in user's org).
 *
 * Honest data policy:
 *   - Active WOs   → public.work_orders (mig 176), status in the live set.
 *   - Pending POs  → public.purchase_orders (mig 262), open procurement statuses.
 *   - Low Stock    → public.reorder_thresholds (mig 178) vs v_inventory_available (mig 191).
 *   - Quality Holds→ public.quality_holds (mig 197), hold_status still open.
 *   - Shipments    → public.shipments (mig 211) created today.
 *   - Activity     → public.audit_events (mig 004), latest 10 org-scoped.
 *   - Alerts       → derived from cheap real signals (open quality holds,
 *                    shipments stuck in 'exception'); empty-state otherwise.
 *
 * A failed transaction degrades the whole page to the unavailable state instead
 * of throwing a 500. No fake numbers are ever invented.
 *
 * NOT a `"use server"` module: invoked directly from the dashboard Server
 * Component during render, like `skeleton-data.ts`.
 */
import { withOrgContext } from "../../../../../lib/auth/with-org-context";

export type DashboardKpi = {
  /** Stable key for i18n + test ids. */
  key: "activeWos" | "pendingPos" | "lowStock" | "qualityHolds" | "shipmentsToday";
  /** Live count, or null when the source table/signal is not live yet. */
  value: number | null;
  /** Semantic colour band matching the prototype (.kpi.{green|amber|red}). */
  color: "blue" | "amber" | "red" | "green";
  /** When true, value is null because the backing module is not live yet. */
  notLive: boolean;
};

export type DashboardActivity = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  occurredAt: string;
};

export type DashboardAlert = {
  id: string;
  severity: "red" | "amber" | "blue";
  /** i18n key suffix under Dashboard.alerts.items.* */
  messageKey: string;
  count: number;
};

export type DashboardData = {
  ok: boolean;
  kpis: DashboardKpi[];
  activity: DashboardActivity[];
  alerts: DashboardAlert[];
};

const ACTIVE_WO_STATUSES = ["RELEASED", "IN_PROGRESS", "ON_HOLD"];
const OPEN_PO_STATUSES = ["draft", "sent", "confirmed", "partially_received"];
const OPEN_HOLD_STATUSES = ["open", "investigating", "escalated", "quarantined"];

function emptyDashboard(): DashboardData {
  return {
    ok: false,
    kpis: [
      { key: "activeWos", value: null, color: "blue", notLive: false },
      { key: "pendingPos", value: null, color: "amber", notLive: false },
      { key: "lowStock", value: null, color: "red", notLive: false },
      { key: "qualityHolds", value: null, color: "amber", notLive: false },
      { key: "shipmentsToday", value: null, color: "green", notLive: false },
    ],
    activity: [],
    alerts: [],
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  try {
    return await withOrgContext(async ({ client }) => {
      const scalar = async (sql: string, params: unknown[] = []): Promise<number> => {
        const res = await client.query<{ n: number }>(sql, params);
        return res.rows[0]?.n ?? 0;
      };

      const activeWos = await scalar(
        `select count(*)::int as n from public.work_orders where status = any($1::text[])`,
        [ACTIVE_WO_STATUSES],
      );

      const pendingPos = await scalar(
        `select count(*)::int as n
           from public.purchase_orders
          where org_id = app.current_org_id()
            and status = any($1::text[])`,
        [OPEN_PO_STATUSES],
      );

      const lowStock = await scalar(
        `select count(*)::int as n
           from public.reorder_thresholds rt
           join public.items i
             on i.org_id = app.current_org_id()
            and i.id = rt.item_id
            and i.status = 'active'
           left join (
             select product_id, sum(available_qty)::numeric as available_qty
               from public.v_inventory_available
              where org_id = app.current_org_id()
              group by product_id
           ) inv on inv.product_id = rt.item_id
          where rt.org_id = app.current_org_id()
            and rt.min_qty > 0
            and coalesce(inv.available_qty, 0::numeric) < rt.min_qty`,
      );

      const qualityHolds = await scalar(
        `select count(*)::int as n from public.quality_holds where hold_status = any($1::text[])`,
        [OPEN_HOLD_STATUSES],
      );

      const shipmentsToday = await scalar(
        `select count(*)::int as n from public.shipments where created_at::date = (now() at time zone 'utc')::date`,
      );

      const shipmentExceptions = await scalar(
        `select count(*)::int as n from public.shipments where status = 'exception'`,
      );

      const activityRes = await client.query<{
        id: string;
        action: string;
        resource_type: string;
        resource_id: string;
        occurred_at: string;
      }>(
        `select id::text, action, resource_type, resource_id, occurred_at
           from public.audit_events
          order by occurred_at desc
          limit 10`,
      );

      const kpis: DashboardKpi[] = [
        { key: "activeWos", value: activeWos, color: "blue", notLive: false },
        { key: "pendingPos", value: pendingPos, color: "amber", notLive: false },
        { key: "lowStock", value: lowStock, color: "red", notLive: false },
        { key: "qualityHolds", value: qualityHolds, color: "amber", notLive: false },
        { key: "shipmentsToday", value: shipmentsToday, color: "green", notLive: false },
      ];

      const alerts: DashboardAlert[] = [];
      if (qualityHolds > 0) {
        alerts.push({ id: "open-holds", severity: "amber", messageKey: "openHolds", count: qualityHolds });
      }
      if (shipmentExceptions > 0) {
        alerts.push({ id: "shipment-exceptions", severity: "red", messageKey: "shipmentExceptions", count: shipmentExceptions });
      }

      const activity: DashboardActivity[] = activityRes.rows.map((row) => ({
        id: row.id,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        occurredAt: row.occurred_at,
      }));

      return { ok: true, kpis, activity, alerts } satisfies DashboardData;
    });
  } catch (error) {
    console.error("[dashboard-summary] org dashboard read failed:", error);
    return emptyDashboard();
  }
}

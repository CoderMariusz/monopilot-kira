/**
 * T-036 — TEC-080 Technical Dashboard: org-scoped KPI + Recent Changes reads.
 *
 * Prototype: prototypes/design/Monopilot Design System/technical/other-screens.jsx:242-301
 * (TechDashboardScreen / TEC-080). The 6-tile prototype strip is rolled into the
 * canonical 5-tile spec (Active Items, Pending BOM Approvals, Open Allergen
 * Overrides, D365 Sync Status, Cost Review Queue) + the Recent Changes panel.
 *
 * Every read runs inside `withOrgContext`, so it executes as `app_user` with
 * `app.set_org_context(...)` applied — RLS (`org_id = app.current_org_id()`)
 * scopes every count/row to the signed-in user's organization. No service-role
 * bypass, no mocks: all five tiles + the timeline come from real Supabase tables
 * (migrations 153 items, 168 bom_headers state machine, 161 allergen profiles,
 * 164 d365_sync_jobs, 160 item_cost_history, audit_log).
 *
 * NOT a `"use server"` module: these helpers are invoked directly from the
 * Technical dashboard Server Component during render (not as client-callable
 * actions). The import of `withOrgContext` (Node-only pg pools) keeps the module
 * server-only in practice.
 */
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

/** The five canonical D365-sync states surfaced on the dashboard tile. */
export type D365SyncStatus = 'pending' | 'running' | 'completed' | 'failed' | 'dead_lettered';

const D365_STATUSES = new Set<D365SyncStatus>([
  'pending',
  'running',
  'completed',
  'failed',
  'dead_lettered',
]);

/** Resource types the Recent Changes panel surfaces (Technical-owned writes). */
const TECHNICAL_RESOURCE_TYPES = [
  'item',
  'bom',
  'bom_header',
  'factory_spec',
  'routing',
  'allergen',
  'item_cost',
] as const;

export type RecentChange = {
  id: string;
  occurredAt: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
};

export type TechnicalDashboardKpis = {
  /** count(public.items WHERE status='active') */
  activeItems: number;
  /** count(public.bom_headers WHERE status IN ('draft','in_review')) — awaiting Technical approval */
  pendingBomApprovals: number;
  /** count(public.item_allergen_profiles WHERE source='manual_override') — open manual overrides */
  openAllergenOverrides: number;
  /** status of the most recent public.d365_sync_jobs row (null = no sync run yet) */
  d365SyncStatus: D365SyncStatus | null;
  /** count(currently-effective machine-generated item_cost_history rows awaiting cost review) */
  costReviewQueue: number;
  /** Most recent Technical-domain audit_log entries (newest first, max 5). */
  recentChanges: RecentChange[];
  /** Caller holds technical.items.create — gates the "Create item" quick action. */
  canCreateItem: boolean;
  /** Caller holds technical.bom.create — gates the "New BOM" quick action. */
  canCreateBom: boolean;
};

const ITEMS_CREATE_PERMISSION = 'technical.items.create';
const BOM_CREATE_PERMISSION = 'technical.bom.create';

/** Resolves whether the caller holds a permission, org-scoped under RLS. */
async function hasPermission(c: QueryClient, userId: string, orgId: string, permission: string): Promise<boolean> {
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
 * Result wrapper: `ok:false` means the live read failed, so the dashboard
 * degrades to its error state instead of throwing a 500. The failure is logged
 * (never silently swallowed) and rendered as a visible error banner.
 */
export type TechnicalDashboardResult =
  | { ok: true; data: TechnicalDashboardKpis }
  | { ok: false };

/**
 * Aggregates all five KPI tiles + the Recent Changes timeline in a SINGLE
 * org-context transaction. Queries run sequentially on the one pooled pg client
 * (node-pg does not run concurrent queries on a single connection).
 */
export async function getTechnicalDashboardKpis(): Promise<TechnicalDashboardResult> {
  try {
    const data = await withOrgContext(async ({ userId, orgId, client }): Promise<TechnicalDashboardKpis> => {
      const c = client as QueryClient;

      const countOf = async (sql: string, params?: readonly unknown[]): Promise<number> => {
        const res = await c.query<{ n: number }>(sql, params);
        return res.rows[0]?.n ?? 0;
      };

      // KPI 1 — Active Items
      const activeItems = await countOf(
        `select count(*)::int as n
           from public.items
          where org_id = app.current_org_id()
            and status = 'active'`,
      );

      // KPI 2 — Pending BOM Approvals (draft / in_review awaiting Technical approval)
      const pendingBomApprovals = await countOf(
        `select count(*)::int as n
           from public.bom_headers
          where org_id = app.current_org_id()
            and status in ('draft', 'in_review')`,
      );

      // KPI 3 — Open Allergen Overrides (active manual overrides on item allergen profiles)
      const openAllergenOverrides = await countOf(
        `select count(*)::int as n
           from public.item_allergen_profiles
          where org_id = app.current_org_id()
            and source = 'manual_override'`,
      );

      // KPI 5 — Cost Review Queue: currently-effective, machine-generated cost rows
      // (variance roll / D365 sync) that still need a human cost review.
      const costReviewQueue = await countOf(
        `select count(*)::int as n
           from public.item_cost_history
          where org_id = app.current_org_id()
            and effective_to is null
            and source in ('variance_roll', 'd365_sync')`,
      );

      // KPI 4 — D365 Sync Status: status of the most recent sync job (any direction).
      const d365Res = await c.query<{ status: string }>(
        `select status
           from public.d365_sync_jobs
          where org_id = app.current_org_id()
          order by scheduled_at desc nulls last, created_at desc
          limit 1`,
      );
      const rawStatus = d365Res.rows[0]?.status;
      const d365SyncStatus =
        rawStatus && D365_STATUSES.has(rawStatus as D365SyncStatus)
          ? (rawStatus as D365SyncStatus)
          : null;

      // Recent Changes — newest Technical-domain audit entries, max 5.
      const recentRes = await c.query<{
        id: string;
        occurred_at: string | Date;
        action: string;
        resource_type: string;
        resource_id: string | null;
      }>(
        `select id,
                occurred_at,
                action,
                resource_type,
                resource_id::text as resource_id
           from public.audit_log
          where org_id = app.current_org_id()
            and resource_type = any($1::text[])
          order by occurred_at desc
          limit 5`,
        [TECHNICAL_RESOURCE_TYPES as unknown as string[]],
      );
      const recentChanges: RecentChange[] = recentRes.rows.map((r) => ({
        id: String(r.id),
        occurredAt: r.occurred_at instanceof Date ? r.occurred_at.toISOString() : String(r.occurred_at),
        action: r.action,
        resourceType: r.resource_type,
        resourceId: r.resource_id,
      }));

      const [canCreateItem, canCreateBom] = await Promise.all([
        hasPermission(c, userId, orgId, ITEMS_CREATE_PERMISSION),
        hasPermission(c, userId, orgId, BOM_CREATE_PERMISSION),
      ]);

      return {
        activeItems,
        pendingBomApprovals,
        openAllergenOverrides,
        d365SyncStatus,
        costReviewQueue,
        recentChanges,
        canCreateItem,
        canCreateBom,
      };
    });

    return { ok: true, data };
  } catch (error) {
    console.error('[technical/dashboard] KPI aggregate read failed:', error);
    return { ok: false };
  }
}

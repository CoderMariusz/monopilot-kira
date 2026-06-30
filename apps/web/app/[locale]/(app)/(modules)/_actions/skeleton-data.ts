/**
 * Walking Skeleton (Wave 0) — real, org-scoped Supabase reads for the module
 * landing pages and the dashboard summary.
 *
 * Every query runs inside `withOrgContext`, so it executes as `app_user` with
 * `app.set_org_context(...)` applied — RLS (`org_id = app.current_org_id()`)
 * scopes the counts to the signed-in user's organization. The tables are the
 * R13 placeholder business tables (migration 014) plus `public.users`.
 *
 * NOT a `"use server"` module: these helpers are invoked directly from Server
 * Components during render (not as client-callable actions), which keeps them
 * free of the action-export constraints. The import of `withOrgContext` (which
 * pulls Node-only pg pools) keeps this module server-only in practice.
 */
import { withOrgContext } from '../../../../../lib/auth/with-org-context';

// Fixed allowlist of schema-qualified, org-scoped tables. Callers pass a key
// from this map only — raw caller input is NEVER interpolated into SQL.
const COUNTABLE = {
  bom_item: 'public.bom_lines',
  work_order: 'public.work_orders',
  quality_event: 'public.quality_holds',
  shipment: 'public.shipping_orders',
  lot: 'public.license_plates',
  users: 'public.users',
} as const;

export type CountableTable = keyof typeof COUNTABLE;

/** Result of a single org-scoped count; `ok:false` means the live read failed. */
export type ModuleCountResult = { ok: true; count: number } | { ok: false };

/**
 * Org-scoped row count for one allowlisted table. Failures are logged and
 * surfaced as `{ ok: false }` so a transient DB issue degrades the landing
 * page to an "unavailable" state instead of throwing a 500 — the failure is
 * still visible (logged + rendered), never silently swallowed.
 */
export async function getModuleCount(table: CountableTable): Promise<ModuleCountResult> {
  const qualified = COUNTABLE[table];
  try {
    const count = await withOrgContext(async ({ client }) => {
      const res = await client.query<{ n: number }>(`select count(*)::int as n from ${qualified}`);
      return res.rows[0]?.n ?? 0;
    });
    return { ok: true, count };
  } catch (error) {
    console.error(`[skeleton-data] org-scoped count failed for ${qualified}:`, error);
    return { ok: false };
  }
}

/** Per-metric counts for the dashboard summary; `null` = that read failed. */
export type OrgSummary = {
  users: number | null;
  workOrders: number | null;
  lots: number | null;
  qualityEvents: number | null;
  shipments: number | null;
  bomItems: number | null;
};

const EMPTY_SUMMARY: OrgSummary = {
  users: null,
  workOrders: null,
  lots: null,
  qualityEvents: null,
  shipments: null,
  bomItems: null,
};

/**
 * Org-scoped counts across all skeleton tables in a SINGLE org-context
 * transaction. Queries run sequentially on the one pooled pg client (node-pg
 * does not run concurrent queries on a single connection).
 */
export async function getOrgSummary(): Promise<OrgSummary> {
  try {
    return await withOrgContext(async ({ client }) => {
      const countOf = async (qualified: string): Promise<number> => {
        const res = await client.query<{ n: number }>(`select count(*)::int as n from ${qualified}`);
        return res.rows[0]?.n ?? 0;
      };
      return {
        users: await countOf(COUNTABLE.users),
        workOrders: await countOf(COUNTABLE.work_order),
        lots: await countOf(COUNTABLE.lot),
        qualityEvents: await countOf(COUNTABLE.quality_event),
        shipments: await countOf(COUNTABLE.shipment),
        bomItems: await countOf(COUNTABLE.bom_item),
      };
    });
  } catch (error) {
    console.error('[skeleton-data] org summary read failed:', error);
    return EMPTY_SUMMARY;
  }
}

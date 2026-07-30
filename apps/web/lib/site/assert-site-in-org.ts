/**
 * 14-multi-site — server-side ownership check for a CLIENT-SUPPLIED `site_id`.
 *
 * Neither RLS nor the FK proves that a `site_id` arriving in a Server Action
 * payload belongs to the caller's organization: `sites_org_context` (mig 215)
 * only checks `org_id = app.current_org_id()` on the SITES row being read, and
 * the FKs on `warehouses.site_id` / `production_lines.site_id` only check that
 * the site EXISTS. A crafted request carrying another org's site uuid therefore
 * persisted a cross-org reference (proven on monopilot_t2: the row inserts, the
 * victim org cannot even see the site it now points at).
 *
 * `create-work-order-core.ts` already did this check inline; this is the same
 * query, extracted so warehouse + line creation share ONE guard instead of each
 * growing its own copy. `is_active` is part of the check because a write must
 * not attach to an archived site (same rule the WO path has always applied).
 *
 * Requires an RLS-bound client (org context already set) — every caller runs
 * inside `withOrgContext` / `withSiteContext`.
 */

export interface SiteOwnershipClient {
  query<R = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: R[] }>;
}

/**
 * Resolve `siteId` to the caller org's ACTIVE site of that id, or `null` when it
 * is not this org's (or not active). Returns the id so callers can bind the
 * value the database confirmed rather than the one the client sent.
 */
export async function assertSiteInOrg(
  client: SiteOwnershipClient,
  siteId: string,
): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `select id::text as id
       from public.sites
      where org_id = app.current_org_id()
        and id = $1::uuid
        and is_active = true
      limit 1`,
    [siteId],
  );
  return rows[0]?.id ?? null;
}

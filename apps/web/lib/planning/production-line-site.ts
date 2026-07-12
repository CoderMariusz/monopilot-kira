type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type ProductionLineSiteRow = {
  id: string;
  site_id: string | null;
};

/**
 * Load a production line scoped to the current org. Returns null when the line
 * does not exist or is not active.
 */
export async function fetchActiveProductionLineSite(
  client: QueryClient,
  lineId: string,
): Promise<ProductionLineSiteRow | null> {
  const { rows } = await client.query<ProductionLineSiteRow>(
    `select pl.id::text as id, pl.site_id::text as site_id
       from public.production_lines pl
      where pl.org_id = app.current_org_id()
        and pl.id = $1::uuid
        and pl.status = 'active'
      limit 1`,
    [lineId],
  );
  return rows[0] ?? null;
}

/** True when the line may be assigned to a WO at {@link woSiteId}. */
export function productionLineMatchesWoSite(
  lineSiteId: string | null | undefined,
  woSiteId: string,
): boolean {
  if (lineSiteId == null || lineSiteId === '') return true;
  return lineSiteId === woSiteId;
}

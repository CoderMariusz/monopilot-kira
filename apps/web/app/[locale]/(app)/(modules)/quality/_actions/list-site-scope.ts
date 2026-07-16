/**
 * List-read site scope for quality NCR / inspection lists.
 *
 * `getActiveSiteId()` returns null for the explicit "All sites" cookie sentinel
 * (see lib/site/site-context.ts) — reads must include every org row, not empty.
 * A concrete site id still includes rows with a null site_id (org-wide / legacy).
 */
export function qualityListSiteClause(
  tableAlias: string,
  activeSiteId: string | null,
  bindIndex: number,
): string {
  if (activeSiteId === null) return '';
  return `and (${tableAlias}.site_id = $${bindIndex}::uuid or ${tableAlias}.site_id is null)`;
}

export function qualityListSiteParams(
  filterParams: readonly unknown[],
  activeSiteId: string | null,
): unknown[] {
  return activeSiteId === null ? [...filterParams] : [...filterParams, activeSiteId];
}

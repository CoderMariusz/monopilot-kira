/**
 * Active-site filter for public.production_lines reads.
 *
 * When $1 is a uuid, returns lines for that site plus org-wide lines (site_id IS NULL).
 * When $1 is null ("All sites"), returns every active line in the org.
 */

/** Append to a production_lines WHERE clause; bind active site id (or null) as $1. */
export const PRODUCTION_LINES_SITE_FILTER_SQL = `and ($1::uuid is null or pl.site_id = $1::uuid or pl.site_id is null)`;

/** Same filter when the query aliases production_lines as bare columns (no pl prefix). */
export const PRODUCTION_LINES_SITE_FILTER_BARE_SQL = `and ($1::uuid is null or site_id = $1::uuid or site_id is null)`;

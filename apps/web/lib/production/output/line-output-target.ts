import type { OrgContextLike } from '../shared';

/**
 * Warehouse + location an output license plate is created in.
 * `id` is the warehouse id; `default_location_id` the location inside it.
 */
export type OutputTarget = { id: string; default_location_id: string | null };

/**
 * The output destination CONFIGURED ON THE WORK ORDER'S PRODUCTION LINE
 * (`production_lines.default_location_id`, the canonical column — see migration
 * 526), together with the warehouse that location belongs to.
 *
 * Both output paths used to resolve a warehouse and then take its
 * alphabetically first location (`order by l.level asc, l.code asc limit 1`),
 * aliasing it as `default_location_id`. That alias only *looked* like the line
 * setting: nothing read `production_lines.default_location_id`, so a line
 * configured for `R02-ZONE` produced finished goods into `R02-BIN1` while the
 * lines screen, the sites screen and the scanner all displayed `R02-ZONE`.
 *
 * Returns null — and the caller then keeps its previous warehouse-first-location
 * resolution — when:
 *   - the work order has no production line (`production_line_id is null`),
 *   - the line has no configured output (`default_location_id is null`), or
 *   - that location is not under a warehouse (`locations.warehouse_id is null`),
 *     since `license_plates.warehouse_id` must be populated.
 * Production registration must never be blocked by an unconfigured line, so
 * every one of those cases falls back instead of raising.
 */
export async function resolveLineOutputTarget(
  ctx: OrgContextLike,
  woId: string,
): Promise<OutputTarget | null> {
  const { rows } = await ctx.client.query<OutputTarget>(
    `select loc.warehouse_id::text as id,
            loc.id::text as default_location_id
       from public.work_orders wo
       join public.production_lines pl
         on pl.org_id = wo.org_id
        and pl.id = wo.production_line_id
       join public.locations loc
         on loc.org_id = wo.org_id
        and loc.id = pl.default_location_id
      where wo.org_id = app.current_org_id()
        and wo.id = $1::uuid
        and loc.warehouse_id is not null
      limit 1`,
    [woId],
  );
  // Both halves or nothing: the caller uses this as a complete replacement for
  // its warehouse+location resolution, so a half-resolved target would write an
  // LP with a null location (or a null warehouse) instead of falling back. The
  // WHERE clause above already excludes that; this makes the contract explicit
  // rather than implied by the SQL.
  const target = rows[0];
  if (!target?.id || !target.default_location_id) return null;
  return target;
}

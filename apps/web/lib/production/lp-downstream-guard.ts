import type { ProductionContext } from './shared';

/** True when the LP has net material consumption or child plates (repack/merge genealogy). */
export async function hasLpConsumptionOrChildren(
  ctx: ProductionContext,
  lpId: string,
): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select (
       (
         select coalesce(sum(qty_consumed), 0)
           from public.wo_material_consumption
          where org_id = app.current_org_id()
            and lp_id = $1::uuid
       ) > 0
       or exists (
         select 1
           from public.license_plates
          where org_id = app.current_org_id()
            and parent_lp_id = $1::uuid
       )
     ) as ok`,
    [lpId],
  );
  return rows[0]?.ok === true;
}

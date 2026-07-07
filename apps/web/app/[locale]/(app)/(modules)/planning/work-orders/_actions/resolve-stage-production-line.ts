import type { OrgActionContext } from './shared';

type StageLineRow = {
  item_id: string;
  production_line_id: string | null;
};

/**
 * Resolve production_line_id per chain stage item.
 *
 * Priority per item:
 * 1. routing_operations.line_id — first op for WIP stages, last op for the FG root
 * 2. npd_wip_processes.line_id via wip_item_id (ensureWipItem path) or wip_definitions.item_id
 * 3. FG root only: npd_wip_processes.line_id via prod_detail.item_id (last op)
 * 4. npd_projects.production_line_id for the FG product's project
 */
export async function loadStageProductionLineIds(
  ctx: OrgActionContext,
  fgItemId: string,
  stageItemIds: Array<{ itemId: string; isFg: boolean }>,
): Promise<Map<string, string | null>> {
  const byItem = new Map<string, string | null>();
  if (stageItemIds.length === 0) return byItem;

  const itemIds = stageItemIds.map((stage) => stage.itemId);
  const { rows } = await ctx.client.query<StageLineRow>(
    `with stages as (
       select s.item_id,
              s.is_fg
         from unnest($1::uuid[], $2::boolean[]) as s(item_id, is_fg)
     )
     select s.item_id::text as item_id,
            coalesce(
              routing_line.line_id,
              wip_item_line.line_id,
              wip_def_line.line_id,
              fg_process_line.line_id,
              project_line.production_line_id
            )::text as production_line_id
       from stages s
       left join lateral (
         select ro.line_id
           from public.routings r
           join public.routing_operations ro
             on ro.routing_id = r.id
            and ro.org_id = r.org_id
          where r.org_id = app.current_org_id()
            and r.item_id = s.item_id
            and r.status in ('active', 'draft', 'approved')
          order by case r.status when 'active' then 0 when 'approved' then 1 else 2 end,
                   r.version desc,
                   ro.op_no * case when s.is_fg then -1 else 1 end
          limit 1
       ) routing_line on true
       left join lateral (
         select wp.line_id
           from public.npd_wip_processes wp
          where wp.org_id = app.current_org_id()
            and not s.is_fg
            and wp.wip_item_id = s.item_id
          order by wp.display_order asc, wp.created_at asc, wp.id asc
          limit 1
       ) wip_item_line on true
       left join lateral (
         select wp.line_id
           from public.wip_definitions wd
           join public.npd_wip_processes wp
             on wp.org_id = wd.org_id
            and wp.wip_definition_id = wd.id
          where wd.org_id = app.current_org_id()
            and not s.is_fg
            and wd.item_id = s.item_id
          order by wp.display_order asc, wp.created_at asc, wp.id asc
          limit 1
       ) wip_def_line on true
       left join lateral (
         select wp.line_id
           from public.prod_detail pd
           join public.npd_wip_processes wp
             on wp.org_id = pd.org_id
            and wp.prod_detail_id = pd.id
          where pd.org_id = app.current_org_id()
            and s.is_fg
            and pd.item_id = s.item_id
          order by wp.display_order desc, wp.created_at desc, wp.id desc
          limit 1
       ) fg_process_line on true
       left join lateral (
         select p.production_line_id
           from public.items fg
           join public.npd_projects p
             on p.org_id = fg.org_id
            and p.product_code = fg.item_code
          where fg.org_id = app.current_org_id()
            and fg.id = $3::uuid
          limit 1
       ) project_line on true`,
    [itemIds, stageItemIds.map((stage) => stage.isFg), fgItemId],
  );

  for (const row of rows) {
    byItem.set(row.item_id, row.production_line_id);
  }
  return byItem;
}

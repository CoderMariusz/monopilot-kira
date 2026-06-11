'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  WAREHOUSE_READ_PERMISSION,
  hasWarehousePermission,
  toIso,
  type GenealogyNode,
  type QueryClient,
  type WarehouseContext,
  type WarehouseResult,
} from './shared';

export async function traceGenealogy(lpId: string): Promise<WarehouseResult<GenealogyNode[]>> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WarehouseResult<GenealogyNode[]>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_READ_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const exists = await ctx.client.query<{ id: string }>(
        `select id::text
           from public.license_plates
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1`,
        [lpId],
      );
      if (!exists.rows[0]) return { ok: false, reason: 'not_found' };

      const { rows } = await ctx.client.query<{
        lp_id: string;
        lp_number: string;
        item_code: string | null;
        quantity: string;
        uom: string;
        status: string;
        created_at: string | Date;
        depth: number;
        direction: 'self' | 'ancestor' | 'descendant';
        parent_lp_id: string | null;
      }>(
        `with recursive
          seed as (
            select lp.id,
                   lp.parent_lp_id,
                   array[lp.id] as path,
                   0 as depth
              from public.license_plates lp
             where lp.org_id = app.current_org_id()
               and lp.id = $1::uuid
          ),
          ancestors as (
            select id, parent_lp_id, path, depth from seed
            union all
            select parent.id,
                   parent.parent_lp_id,
                   ancestors.path || parent.id,
                   ancestors.depth + 1
              from ancestors
              join public.license_plates current
                on current.org_id = app.current_org_id()
               and current.id = ancestors.id
              join public.license_plates parent
                on parent.org_id = app.current_org_id()
               and parent.id = current.parent_lp_id
             where ancestors.depth < 20
               and not parent.id = any(ancestors.path)
          ),
          descendants as (
            select id, parent_lp_id, path, depth from seed
            union all
            select child.id,
                   child.parent_lp_id,
                   descendants.path || child.id,
                   descendants.depth + 1
              from descendants
              join public.license_plates child
                on child.org_id = app.current_org_id()
               and child.parent_lp_id = descendants.id
             where descendants.depth < 20
               and not child.id = any(descendants.path)
          ),
          nodes as (
            select id, depth, 'ancestor'::text as direction from ancestors where depth > 0
            union all
            select id, 0, 'self'::text from seed
            union all
            select id, depth, 'descendant'::text from descendants where depth > 0
          )
        select lp.id::text as lp_id,
               lp.lp_number,
               i.item_code,
               lp.quantity::text,
               lp.uom,
               lp.status,
               lp.created_at,
               nodes.depth,
               nodes.direction,
               lp.parent_lp_id::text
          from nodes
          join public.license_plates lp
            on lp.org_id = app.current_org_id()
           and lp.id = nodes.id
          left join public.items i on i.org_id = app.current_org_id() and i.id = lp.product_id
         order by case nodes.direction when 'ancestor' then 0 when 'self' then 1 else 2 end,
                  nodes.depth desc,
                  lp.created_at asc`,
        [lpId],
      );

      return {
        ok: true,
        data: rows.map((row) => ({
          lpId: row.lp_id,
          lpNumber: row.lp_number,
          itemCode: row.item_code,
          quantity: String(row.quantity),
          uom: row.uom,
          status: row.status,
          createdAt: toIso(row.created_at) ?? '',
          depth: Number(row.depth),
          direction: row.direction,
          parentLpId: row.parent_lp_id,
        })),
      };
    });
  } catch (error) {
    console.error('[warehouse] traceGenealogy failed', error);
    return { ok: false, reason: 'error' };
  }
}

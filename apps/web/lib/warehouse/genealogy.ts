/**
 * LP genealogy reader (W9-K-II extraction). The recursive parent_lp_id CTE was
 * audited as CORRECT (org-scoped, cycle-checked, depth-capped) but lived inline
 * in the traceGenealogy Server Action where no integration test could reach it.
 * Extracted verbatim here so the warehouse action delegates and the
 * output-LP/TO-LP genealogy writers (F-B08/F-C05) can be tested end-to-end
 * against the reader.
 *
 * Wave0 lock: org scope only via app.current_org_id() — callers run inside a
 * withOrgContext (or equivalent RLS app_user) transaction.
 */

export type GenealogyQueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type GenealogyChainNode = {
  lpId: string;
  lpNumber: string;
  itemCode: string | null;
  quantity: string;
  uom: string;
  status: string;
  createdAt: string | Date;
  depth: number;
  direction: 'self' | 'ancestor' | 'descendant';
  parentLpId: string | null;
};

type GenealogyRow = {
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
};

/**
 * Full ancestor + self + descendant chain for an LP via parent_lp_id.
 * Depth-capped at 20 each way; cycle-proof via path tracking.
 */
export async function queryGenealogy(
  client: GenealogyQueryClient,
  lpId: string,
): Promise<GenealogyChainNode[]> {
  const { rows } = await client.query<GenealogyRow>(
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

  return rows.map((row) => ({
    lpId: row.lp_id,
    lpNumber: row.lp_number,
    itemCode: row.item_code,
    quantity: String(row.quantity),
    uom: row.uom,
    status: row.status,
    createdAt: row.created_at,
    depth: Number(row.depth),
    direction: row.direction,
    parentLpId: row.parent_lp_id,
  }));
}

/**
 * LP genealogy reader (W9-K-II extraction). The recursive traversal lives in
 * public.get_lp_genealogy_org_wide so site-restricted app_user reads do not
 * prune cross-site provenance. The SECURITY DEFINER function is org-scoped by
 * p_org_id; callers still run inside withOrgContext or equivalent app_user
 * transactions.
 *
 * Wave0 lock: org scope only via app.current_org_id().
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
 * Full ancestor + self + descendant chain for an LP.
 * Depth-capped at 20 each way; cycle-proof in the database function.
 */
export async function queryGenealogy(
  client: GenealogyQueryClient,
  lpId: string,
): Promise<GenealogyChainNode[]> {
  const { rows } = await client.query<GenealogyRow>(
    `select lp_id,
            lp_number,
            item_code,
            quantity,
            uom,
            status,
            created_at,
            depth,
            direction,
            parent_lp_id
       from public.get_lp_genealogy_org_wide(app.current_org_id(), $1::uuid, 'both')`,
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

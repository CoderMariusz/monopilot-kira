'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { queryGenealogy } from '../../../../../../lib/warehouse/genealogy';
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

      // W9-K-II: the recursive parent_lp_id CTE moved verbatim to
      // lib/warehouse/genealogy.ts so the genealogy WRITERS (production output
      // LPs + transfer-order destination LPs) are tested against this reader.
      const nodes = await queryGenealogy(ctx.client, lpId);

      return {
        ok: true,
        data: nodes.map((node) => ({
          lpId: node.lpId,
          lpNumber: node.lpNumber,
          itemCode: node.itemCode,
          quantity: node.quantity,
          uom: node.uom,
          status: node.status,
          createdAt: toIso(node.createdAt) ?? '',
          depth: node.depth,
          direction: node.direction,
          parentLpId: node.parentLpId,
        })),
      };
    });
  } catch (error) {
    console.error('[warehouse] traceGenealogy failed', error);
    return { ok: false, reason: 'error' };
  }
}

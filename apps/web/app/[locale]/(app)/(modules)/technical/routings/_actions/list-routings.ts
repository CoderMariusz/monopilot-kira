'use server';

/**
 * 03-technical Routings CRUD (T-022): list the routing versions for an item.
 *
 * Org-scoped read under withOrgContext + RLS. Returns each version with its
 * status, effective range and operation count, ordered by version DESC. Gated on
 * `technical.bom.create` (the routing-authoring surface).
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  hasPermission,
  ListRoutingsInput,
  type ListRoutingsResult,
  type OrgActionContext,
  type QueryClient,
  ROUTING_WRITE_PERMISSION,
  type RoutingStatus,
  type RoutingSummary,
} from './shared';

type RoutingRow = {
  id: string;
  item_id: string;
  version: number;
  status: string;
  effective_from: string;
  effective_to: string | null;
  operation_count: string | number;
};

const STATUS_SET = new Set<RoutingStatus>(['draft', 'approved', 'active', 'superseded']);

function mapRow(row: RoutingRow): RoutingSummary {
  return {
    id: String(row.id),
    itemId: String(row.item_id),
    version: Number(row.version),
    status: STATUS_SET.has(row.status as RoutingStatus) ? (row.status as RoutingStatus) : 'draft',
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    operationCount: Number(row.operation_count),
  };
}

export async function listRoutings(rawInput: unknown): Promise<ListRoutingsResult> {
  const parsed = ListRoutingsInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ListRoutingsResult> => {
      const qc = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: qc };
      if (!(await hasPermission(ctx, ROUTING_WRITE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const { rows } = await qc.query<RoutingRow>(
        `select r.id,
                r.item_id,
                r.version,
                r.status,
                r.effective_from::text as effective_from,
                r.effective_to::text as effective_to,
                (select count(*) from public.routing_operations o
                  where o.org_id = app.current_org_id() and o.routing_id = r.id) as operation_count
           from public.routings r
          where r.org_id = app.current_org_id()
            and r.item_id = $1::uuid
          order by r.version desc`,
        [input.itemId],
      );

      return { ok: true, data: { routings: rows.map(mapRow) } };
    });
  } catch (error) {
    console.error('[technical/routings] listRoutings load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

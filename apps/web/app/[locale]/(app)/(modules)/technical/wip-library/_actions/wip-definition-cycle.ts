/**
 * WIP definition composition cycle guard (PF-R05-01 / V-TEC-13 analogue).
 *
 * Pure graph helpers + org-scoped edge loader. Reuses the BOM cycle-detection
 * adjacency/DFS primitives so self-reference and multi-node WIP→WIP loops are
 * rejected with one shared implementation.
 */

import { buildGraph, detectCycle } from '../../bom/_actions/cycle-detection';

export type WipCompositionEdge = { parent: string; component: string };

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

/** Returns true when `parentItemId` → proposed ingredients would close a loop. */
export function detectWipDefinitionCompositionCycle(
  existingEdges: ReadonlyArray<WipCompositionEdge>,
  parentItemId: string,
  proposedComponentItemIds: ReadonlyArray<string>,
): boolean {
  const graph = buildGraph(existingEdges);
  return detectCycle(graph, parentItemId, proposedComponentItemIds);
}

/**
 * Active/draft definition ingredient edges, excluding the row being rewritten
 * (its proposed ingredients replace the persisted set).
 */
export async function loadWipCompositionEdges(
  client: QueryClient,
  excludeParentItemId: string | null,
): Promise<WipCompositionEdge[]> {
  const { rows } = await client.query<{ parent: string; component: string }>(
    `select wd.item_id::text as parent,
            wdi.item_id::text as component
       from public.wip_definitions wd
       join public.wip_definition_ingredients wdi
         on wdi.org_id = wd.org_id
        and wdi.wip_definition_id = wd.id
      where wd.org_id = app.current_org_id()
        and wd.item_id is not null
        and wd.status in ('active', 'draft')
        and ($1::uuid is null or wd.item_id <> $1::uuid)`,
    [excludeParentItemId],
  );
  return rows;
}

export async function assertWipDefinitionCompositionAcyclic(
  client: QueryClient,
  parentItemId: string,
  proposedComponentItemIds: string[],
): Promise<{ ok: true } | { ok: false; code: 'WIP_DEFINITION_CYCLE' }> {
  await client.query(
    `select pg_advisory_xact_lock(hashtextextended('wip-composition:' || app.current_org_id()::text, 0))`,
  );
  const edges = await loadWipCompositionEdges(client, parentItemId);
  if (detectWipDefinitionCompositionCycle(edges, parentItemId, proposedComponentItemIds)) {
    return { ok: false, code: 'WIP_DEFINITION_CYCLE' };
  }
  return { ok: true };
}

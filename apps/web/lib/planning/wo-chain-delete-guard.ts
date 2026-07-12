import type { QueryClient } from './factory-release-wo-gate';

/**
 * Block hard-delete of a draft WO that is still part of an active production chain
 * (C5). Cancellation preserves history; delete must not destroy wo_dependencies.
 *
 * Traverses the full dependency graph (both parent and child directions) from the
 * target WO. Blocks when any visited WO has progressed beyond draft/cancelled,
 * has active execution activity, or has registered outputs.
 *
 * ALSO blocks whenever the target participates in ANY dependency edge whose
 * counterpart is not cancelled — even an all-draft chain. wo_dependencies FKs are
 * ON DELETE CASCADE, so deleting a draft child would silently drop the edge and
 * orphan its parent's genealogy; cancellation is the correct path, not delete.
 */
export async function assertDraftWorkOrderDeletable(
  client: QueryClient,
  woId: string,
): Promise<{ ok: true } | { ok: false; error: 'chain_delete_blocked' }> {
  const { rows } = await client.query<{ blocked: boolean }>(
    `with recursive chain(wo_id, depth) as (
       select $1::uuid, 0
       union
       select case
                when d.parent_wo_id = c.wo_id then d.child_wo_id
                else d.parent_wo_id
              end,
              c.depth + 1
         from chain c
         join public.wo_dependencies d
           on d.org_id = app.current_org_id()
          and (d.parent_wo_id = c.wo_id or d.child_wo_id = c.wo_id)
        where c.depth < 32
     )
     select exists (
       select 1
         from chain ch
         join public.work_orders wo
           on wo.org_id = app.current_org_id()
          and wo.id = ch.wo_id
        where wo.status not in ('DRAFT', 'CANCELLED')
           or exists (
             select 1
               from public.wo_executions ex
              where ex.org_id = wo.org_id
                and ex.wo_id = wo.id
                and coalesce(ex.status, 'planned') not in ('planned', 'cancelled')
           )
           or exists (
             select 1
               from public.wo_outputs o
              where o.org_id = wo.org_id
                and o.wo_id = wo.id
              limit 1
           )
     )
     or exists (
       -- target participates in an active dependency edge (counterpart not cancelled):
       -- deleting it would cascade-drop wo_dependencies and orphan the counterpart
       select 1
         from public.wo_dependencies d
         join public.work_orders cp
           on cp.org_id = d.org_id
          and cp.id = case when d.parent_wo_id = $1::uuid then d.child_wo_id else d.parent_wo_id end
        where d.org_id = app.current_org_id()
          and (d.parent_wo_id = $1::uuid or d.child_wo_id = $1::uuid)
          and cp.status <> 'CANCELLED'
     ) as blocked`,
    [woId],
  );
  if (rows[0]?.blocked) {
    return { ok: false, error: 'chain_delete_blocked' };
  }
  return { ok: true };
}

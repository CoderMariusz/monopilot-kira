import type { QueryClient } from './shared';

/**
 * Recompute work_orders.actual_qty + produced_quantity from live primary
 * wo_outputs (excluding voided originals). Mirrors completeWo post-transition
 * rollup — keeps yield_percent (GENERATED) aligned after output corrections.
 */
export async function syncWorkOrderOutputQuantities(
  client: QueryClient,
  woId: string,
): Promise<void> {
  await client.query(
    `update public.work_orders
        set actual_qty = (
              select coalesce(sum(o.qty_kg), 0)
                from public.wo_outputs o
               where o.org_id = app.current_org_id()
                 and o.wo_id = $1::uuid
                 and o.output_type = 'primary'
                 and o.correction_of_id is null
                 and not exists (
                   select 1 from public.wo_outputs c
                    where c.org_id = o.org_id and c.correction_of_id = o.id
                 )
            ),
            produced_quantity = (
              select coalesce(sum(o.qty_kg), 0)
                from public.wo_outputs o
               where o.org_id = app.current_org_id()
                 and o.wo_id = $1::uuid
                 and o.output_type = 'primary'
                 and o.correction_of_id is null
                 and not exists (
                   select 1 from public.wo_outputs c
                    where c.org_id = o.org_id and c.correction_of_id = o.id
                 )
            )
      where org_id = app.current_org_id()
        and id = $1::uuid`,
    [woId],
  );
}

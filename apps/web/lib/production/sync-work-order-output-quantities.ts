import type { QueryClient } from './shared';

/**
 * Recompute work_orders.actual_qty + produced_quantity from live primary
 * wo_outputs (excluding voided originals). Mirrors completeWo post-transition
 * rollup — keeps yield_percent (GENERATED) aligned after output corrections.
 *
 * actual_qty is compared against planned_quantity in work_orders.uom, and yield_percent
 * is GENERATED from that pair, so only outputs denominated in the WO's own unit may be
 * summed in. `wo_outputs.qty_kg` is a legacy column name — the unit sits next to it in
 * `wo_outputs.uom` — so a blind sum folded 500 pcs into 500 kg of yield (U1).
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
                 and lower(coalesce(nullif(trim(o.uom), ''), 'kg'))
                     = lower(coalesce(nullif(trim(work_orders.uom), ''), 'kg'))
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
                 and lower(coalesce(nullif(trim(o.uom), ''), 'kg'))
                     = lower(coalesce(nullif(trim(work_orders.uom), ''), 'kg'))
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

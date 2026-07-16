/**
 * closed_production_strict_v1 — consumption vs output yield tolerance (2% default).
 * Blocks WO completion when posted kg consumption is outside the configured band
 * relative to registered primary output and the effective BOM/operation yield.
 */

import { woPostedConsumptionKgSubquery } from './consumption-qty-to-kg';
import type { QueryClient } from './shared';

/** Matches T-013 / register-output MASS_BALANCE_WARN_PCT. */
export const CLOSED_PRODUCTION_STRICT_TOLERANCE = 0.02;

export type ClosedProductionStrictRow = {
  output_kg: string;
  posted_consumption_kg: string;
  effective_yield_pct: string;
  expected_input_kg: string | null;
  within_tolerance: boolean;
};

export async function evaluateClosedProductionStrict(
  client: QueryClient,
  woId: string,
  tolerance = CLOSED_PRODUCTION_STRICT_TOLERANCE,
): Promise<ClosedProductionStrictRow | null> {
  const { rows } = await client.query<ClosedProductionStrictRow>(
    `with yield_ctx as (
       select coalesce(
                (
                  select wop.expected_yield_percent
                    from public.wo_operations wop
                   where wop.org_id = app.current_org_id()
                     and wop.wo_id = wo.id
                     and wop.expected_yield_percent is not null
                   order by wop.sequence asc
                   limit 1
                ),
                bh.yield_pct,
                100::numeric
              ) as effective_yield_pct
         from public.work_orders wo
         left join public.bom_headers bh
           on bh.org_id = wo.org_id
          and bh.id = wo.active_bom_header_id
        where wo.org_id = app.current_org_id()
          and wo.id = $1::uuid
        limit 1
     ),
     totals as (
       select coalesce(
                (
                  select sum(o.qty_kg)
                    from public.wo_outputs o
                   where o.org_id = app.current_org_id()
                     and o.wo_id = $1::uuid
                     and o.output_type = 'primary'
                     and o.correction_of_id is null
                     and not exists (
                       select 1
                         from public.wo_outputs correction
                        where correction.org_id = o.org_id
                          and correction.correction_of_id = o.id
                     )
                ),
                0::numeric
              ) as output_kg,
              ${woPostedConsumptionKgSubquery('$1')} as posted_consumption_kg
     )
     select t.output_kg::text as output_kg,
            t.posted_consumption_kg::text as posted_consumption_kg,
            y.effective_yield_pct::text as effective_yield_pct,
            case
              when y.effective_yield_pct > 0
                then (t.output_kg / (y.effective_yield_pct / 100.0))::text
              else null
            end as expected_input_kg,
            (
              y.effective_yield_pct > 0
              and t.posted_consumption_kg > 0
              and t.output_kg > 0
              and t.posted_consumption_kg >= (t.output_kg / (y.effective_yield_pct / 100.0)) * (1 - $2::numeric)
              and t.posted_consumption_kg <= (t.output_kg / (y.effective_yield_pct / 100.0)) * (1 + $2::numeric)
            ) as within_tolerance
       from yield_ctx y
       cross join totals t`,
    [woId, tolerance],
  );
  return rows[0] ?? null;
}

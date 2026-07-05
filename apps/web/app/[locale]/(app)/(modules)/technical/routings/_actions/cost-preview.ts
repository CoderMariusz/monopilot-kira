'use server';

/**
 * 03-technical Routing cost preview (T-023): read-only cost estimate for a
 * routing version at a given production volume.
 *
 * Per-op cost (PRD §11.4 / §12.4):
 *   hourly_rate = Σ(crew.headcount × labor_rates.rate_per_hour)
 *   setup_cost  = setup_time_min / 60                     × hourly_rate
 *   run_cost    = (run_time_per_unit_sec × volume) / 3600 × hourly_rate
 *   op_cost    = setup_cost + run_cost
 *   total      = Σ op_cost
 *
 * AC1: setup=30 min, run=10 sec, cost=60/h, volume=100
 *   → setup 30/60×60 = 30 ; run (10×100)/3600×60 = 16.666… ; op_cost ≈ 46.67.
 *
 * NUMERIC-exact: the entire arithmetic is a single SQL query over the NUMERIC
 * columns — no JS float ever touches a cost. Values are returned as strings
 * (rounded to 2 dp for the per-op/total presentation) so the caller keeps an
 * exact decimal. READ-ONLY — no write side effects (red line).
 *
 * Gated on `technical.bom.create` (the routing surface). RLS scopes the read to
 * the caller's org, so a cross-org routing id resolves to zero rows → not_found
 * (AC3).
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  hasPermission,
  type OrgActionContext,
  type QueryClient,
  ROUTING_WRITE_PERMISSION,
} from './shared';
import {
  RoutingCostPreviewInput,
  type RoutingCostPreviewResult,
} from './cost-preview-shared';

type OpCostRow = {
  op_no: number;
  op_code: string;
  op_name: string;
  setup_cost: string;
  run_cost: string;
  op_cost: string;
};

export async function routingCostPreview(rawInput: unknown): Promise<RoutingCostPreviewResult> {
  const parsed = RoutingCostPreviewInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<RoutingCostPreviewResult> => {
      const qc = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: qc };
      if (!(await hasPermission(ctx, ROUTING_WRITE_PERMISSION))) return { ok: false, error: 'forbidden' };

      // The routing must exist in the caller's org (RLS → AC3 cross-org = 0 rows).
      const { rows: routingRows } = await qc.query<{ id: string }>(
        `select id from public.routings where org_id = app.current_org_id() and id = $1::uuid`,
        [input.routingId],
      );
      if (!routingRows[0]) return { ok: false, error: 'not_found' };

      // Single SQL pass — all NUMERIC. Crew is the canonical rate source; legacy
      // cost_per_hour is used only when crew is empty and cost_per_hour is set.
      const { rows } = await qc.query<OpCostRow>(
        `with op_rates as (
           select o.op_no,
                  o.op_code,
                  o.op_name,
                  o.setup_time_min,
                  o.run_time_per_unit_sec,
                  case
                    when jsonb_typeof(coalesce(o.crew, '[]'::jsonb)) = 'array'
                     and jsonb_array_length(coalesce(o.crew, '[]'::jsonb)) > 0
                      then coalesce(crew_rates.rate_per_hour, 0)
                    when o.cost_per_hour is not null
                      then o.cost_per_hour
                    else 0
                  end as rate_per_hour
             from public.routing_operations o
             left join lateral (
               select sum(coalesce((c.headcount)::numeric, 0) * coalesce(lr.rate_per_hour, 0)) as rate_per_hour
                 from jsonb_to_recordset(
                        case
                          when jsonb_typeof(coalesce(o.crew, '[]'::jsonb)) = 'array'
                            then coalesce(o.crew, '[]'::jsonb)
                          else '[]'::jsonb
                        end
                      ) as c(role_group text, headcount numeric)
                 left join lateral (
                   select rate_per_hour
                     from public.labor_rates lr
                    where lr.org_id = app.current_org_id()
                      and lr.role_group = c.role_group
                      and lr.currency = 'GBP'
                      and lr.effective_from <= current_date
                    order by lr.effective_from desc
                    limit 1
                 ) lr on true
             ) crew_rates on true
            where o.org_id = app.current_org_id()
              and o.routing_id = $1::uuid
         )
         select
            op_no,
            op_code,
            op_name,
            round((coalesce(setup_time_min, 0)::numeric / 60) * rate_per_hour, 2)::text as setup_cost,
            round((coalesce(run_time_per_unit_sec, 0) * $2::numeric / 3600) * rate_per_hour, 2)::text as run_cost,
            round(
              (coalesce(setup_time_min, 0)::numeric / 60) * rate_per_hour
              + (coalesce(run_time_per_unit_sec, 0) * $2::numeric / 3600) * rate_per_hour,
              2
            )::text as op_cost
           from op_rates
          order by op_no asc`,
        [input.routingId, input.volume],
      );

      // Total summed in SQL too (exact, then rounded to 2 dp) so the total is not
      // the float-sum of already-rounded per-op strings.
      const { rows: totalRows } = await qc.query<{ total: string }>(
        `with op_rates as (
           select o.setup_time_min,
                  o.run_time_per_unit_sec,
                  case
                    when jsonb_typeof(coalesce(o.crew, '[]'::jsonb)) = 'array'
                     and jsonb_array_length(coalesce(o.crew, '[]'::jsonb)) > 0
                      then coalesce(crew_rates.rate_per_hour, 0)
                    when o.cost_per_hour is not null
                      then o.cost_per_hour
                    else 0
                  end as rate_per_hour
             from public.routing_operations o
             left join lateral (
               select sum(coalesce((c.headcount)::numeric, 0) * coalesce(lr.rate_per_hour, 0)) as rate_per_hour
                 from jsonb_to_recordset(
                        case
                          when jsonb_typeof(coalesce(o.crew, '[]'::jsonb)) = 'array'
                            then coalesce(o.crew, '[]'::jsonb)
                          else '[]'::jsonb
                        end
                      ) as c(role_group text, headcount numeric)
                 left join lateral (
                   select rate_per_hour
                     from public.labor_rates lr
                    where lr.org_id = app.current_org_id()
                      and lr.role_group = c.role_group
                      and lr.currency = 'GBP'
                      and lr.effective_from <= current_date
                    order by lr.effective_from desc
                    limit 1
                 ) lr on true
             ) crew_rates on true
            where o.org_id = app.current_org_id()
              and o.routing_id = $1::uuid
         )
         select round(coalesce(sum(
            (coalesce(setup_time_min, 0)::numeric / 60) * rate_per_hour
            + (coalesce(run_time_per_unit_sec, 0) * $2::numeric / 3600) * rate_per_hour
          ), 0), 2)::text as total
           from op_rates`,
        [input.routingId, input.volume],
      );

      return {
        ok: true,
        data: {
          routingId: input.routingId,
          volume: input.volume,
          operations: rows.map((r) => ({
            opNo: Number(r.op_no),
            opCode: r.op_code,
            opName: r.op_name,
            setupCost: r.setup_cost,
            runCost: r.run_cost,
            opCost: r.op_cost,
          })),
          totalCost: totalRows[0]?.total ?? '0.00',
        },
      };
    });
  } catch (error) {
    console.error('[technical/routings] routingCostPreview load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

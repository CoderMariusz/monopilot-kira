-- 501-intermediate-cost-batch-normalize.sql
-- C033 / W2-T1: compute_intermediate_unit_cost (491/492) summed full batch
-- process totals (rate×headcount×duration + additional) onto every kg instead of
-- dividing by batch output inferred from throughput×duration. Aligns SQL with
-- apps/web/lib/npd/wip-cost.ts batch-normalized labour.
--
-- Idempotent: CREATE OR REPLACE. Do NOT apply locally — owner PREPAREs on prod.

create or replace function public.compute_intermediate_unit_cost(p_item_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
  with leaf_cost as (
    select ci.id as item_id,
           coalesce(ch.cost_per_kg, ss.unit_price, ci.list_price_gbp) as amount
      from public.items ci
      left join lateral (
        select ch.cost_per_kg
          from public.item_cost_history ch
         where ch.org_id = ci.org_id and ch.item_id = ci.id and ch.effective_to is null
         order by ch.effective_from desc limit 1
      ) ch on true
      left join lateral (
        select ss.unit_price
          from public.supplier_specs ss
         where ss.org_id = ci.org_id and ss.item_id = ci.id
           and ss.lifecycle_status = 'active' and ss.review_status = 'approved'
           and ss.unit_price is not null
         order by ss.effective_from desc nulls last, ss.updated_at desc nulls last limit 1
      ) ss on true
     where ci.org_id = app.current_org_id()
  ),
  active_bom as (
    select bl.item_id, bl.component_code, bl.quantity
      from public.bom_headers bh
      join public.bom_lines bl on bl.org_id = bh.org_id and bl.bom_header_id = bh.id
     where bh.org_id = app.current_org_id() and bh.item_id = p_item_id and bh.status = 'active'
  ),
  bom_material as (
    select coalesce(sum(ab.quantity * lc.amount), 0)::numeric as amount,
           count(*) as lines
      from active_bom ab
      join public.items ci
        on ci.org_id = app.current_org_id()
       and ((ab.item_id is not null and ci.id = ab.item_id)
            or (ab.item_id is null and ci.item_code = ab.component_code))
      join leaf_cost lc on lc.item_id = ci.id
     where lc.amount is not null
  ),
  def_material as (
    select coalesce(sum(wdi.qty_per_unit * lc.amount), 0)::numeric as amount,
           count(*) as lines
      from public.wip_definitions wd
      join public.wip_definition_ingredients wdi
        on wdi.org_id = wd.org_id and wdi.wip_definition_id = wd.id
      join leaf_cost lc on lc.item_id = wdi.item_id
     where wd.org_id = app.current_org_id()
       and wd.item_id = p_item_id
       and wd.status = 'active'
       and lc.amount is not null
  ),
  material as (
    select case when (select count(*) from active_bom) > 0
                then (select amount from bom_material)
                else (select amount from def_material)
           end as amount
  ),
  process_crew as (
    select wp.id as process_id,
           coalesce(sum(
             coalesce(wpr.rate_per_hour, lr.rate_per_hour, 0)
             * coalesce(wpr.headcount, 0)
           ), 0)::numeric as crew_rate,
           coalesce(wp.duration_hours, 0)::numeric as duration_hours,
           coalesce(wp.additional_cost, 0)::numeric as additional_cost,
           coalesce(wp.throughput_per_hour, 0)::numeric as throughput_per_hour,
           coalesce(wp.throughput_uom, 'kg') as throughput_uom
      from public.npd_wip_processes wp
      left join public.npd_wip_process_roles wpr
        on wpr.org_id = wp.org_id and wpr.process_id = wp.id
      left join lateral (
        select rate_per_hour from public.labor_rates lr
         where lr.org_id = wp.org_id and lr.role_group = wpr.role_group
         order by lr.effective_from desc limit 1
      ) lr on true
     where wp.org_id = app.current_org_id() and wp.wip_item_id = p_item_id
     group by wp.id, wp.duration_hours, wp.additional_cost, wp.throughput_per_hour, wp.throughput_uom
  ),
  batch_output as (
    select coalesce(max(
             case
               when pc.throughput_per_hour > 0
                and pc.duration_hours > 0
                and lower(pc.throughput_uom) = 'kg'
               then pc.throughput_per_hour * pc.duration_hours
             end), 1)::numeric as batch_kg
      from process_crew pc
  ),
  labor_per_unit as (
    select case
             when pc.throughput_per_hour > 0 then
               pc.crew_rate / pc.throughput_per_hour
               + pc.additional_cost
                 / nullif(
                     pc.throughput_per_hour
                       -- Preserve valid fractional batches (e.g. 0.5h); only
                       -- a missing/zero duration uses the one-hour fallback.
                       * case when coalesce(pc.duration_hours, 0) > 0 then pc.duration_hours else 1 end,
                     0
                   )
             else
               (pc.crew_rate * pc.duration_hours + pc.additional_cost)
               / nullif((select batch_kg from batch_output), 0)
           end as per_unit
      from process_crew pc
  ),
  labor as (
    select coalesce(sum(per_unit), 0)::numeric as amount
      from labor_per_unit
  ),
  yield_pct as (
    select coalesce(
             (select wp.yield_pct from public.npd_wip_processes wp
               where wp.org_id = app.current_org_id() and wp.wip_item_id = p_item_id
               order by wp.display_order limit 1),
             100)::numeric as pct
  )
  select case
           when (select amount from material) + (select amount from labor) = 0 then null
           else ((select amount from material) + (select amount from labor))
                / nullif((select pct from yield_pct) / 100.0, 0)
         end;
$$;

revoke all on function public.compute_intermediate_unit_cost(uuid) from public;
grant execute on function public.compute_intermediate_unit_cost(uuid) to app_user;

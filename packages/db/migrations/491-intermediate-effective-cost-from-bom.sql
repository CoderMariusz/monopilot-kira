-- 491-intermediate-effective-cost-from-bom.sql
-- G4 / WIP parity: an intermediate (WIP) with no item_cost_history / supplier /
-- list price still resolves a non-null amount on v_item_effective_cost by
-- computing cost-on-read from its ACTIVE BOM materials + npd_wip_processes
-- labour (rate×headcount×duration + additional_cost), yield-adjusted.
-- One-level only — nested WIP children still need their own leaf cost (or a
-- cost_history row written by the FG costing pipeline). Avoids a backfill for
-- existing WIPs such as WIP-20260714-0011 (Wheat Flour + process roles).
--
-- Idempotent: CREATE OR REPLACE function + view. Do NOT apply locally — owner
-- PREPAREs on prod.

create or replace function public.compute_intermediate_unit_cost(p_item_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
  -- Materials: ACTIVE BOM lines × leaf effective cost (cost_history → supplier → list).
  -- Does NOT read v_item_effective_cost (would recurse through this fallback).
  with material as (
    select coalesce(sum(bl.quantity * leaf.amount), 0)::numeric as amount
      from public.bom_headers bh
      join public.bom_lines bl
        on bl.org_id = bh.org_id
       and bl.bom_header_id = bh.id
      join public.items ci
        on ci.org_id = bh.org_id
       and (
         (bl.item_id is not null and ci.id = bl.item_id)
         or (bl.item_id is null and ci.item_code = bl.component_code)
       )
      left join lateral (
        select coalesce(ch.cost_per_kg, ss.unit_price, ci.list_price_gbp) as amount
          from (select 1) _
          left join lateral (
            select ch.cost_per_kg
              from public.item_cost_history ch
             where ch.org_id = ci.org_id
               and ch.item_id = ci.id
               and ch.effective_to is null
             order by ch.effective_from desc
             limit 1
          ) ch on true
          left join lateral (
            select ss.unit_price
              from public.supplier_specs ss
             where ss.org_id = ci.org_id
               and ss.item_id = ci.id
               and ss.lifecycle_status = 'active'
               and ss.review_status = 'approved'
               and ss.unit_price is not null
             order by ss.effective_from desc nulls last, ss.updated_at desc nulls last
             limit 1
          ) ss on true
      ) leaf on true
     where bh.org_id = app.current_org_id()
       and bh.item_id = p_item_id
       and bh.status = 'active'
       and leaf.amount is not null
  ),
  labor as (
    select coalesce(sum(
             coalesce(wpr.rate_per_hour, lr.rate_per_hour, 0)
             * coalesce(wpr.headcount, 0)
             * coalesce(wp.duration_hours, 0)
             + coalesce(wp.additional_cost, 0)
           ), 0)::numeric as amount
      from public.npd_wip_processes wp
      left join public.npd_wip_process_roles wpr
        on wpr.org_id = wp.org_id
       and wpr.process_id = wp.id
      left join lateral (
        select rate_per_hour
          from public.labor_rates lr
         where lr.org_id = wp.org_id
           and lr.role_group = wpr.role_group
         order by lr.effective_from desc
         limit 1
      ) lr on true
     where wp.org_id = app.current_org_id()
       and wp.wip_item_id = p_item_id
  ),
  yield_pct as (
    select coalesce(
             (select wp.yield_pct
                from public.npd_wip_processes wp
               where wp.org_id = app.current_org_id()
                 and wp.wip_item_id = p_item_id
               order by wp.display_order
               limit 1),
             100
           )::numeric as pct
  )
  select case
           when (select amount from material) + (select amount from labor) = 0 then null
           else ((select amount from material) + (select amount from labor))
                / nullif((select pct from yield_pct) / 100.0, 0)
         end;
$$;

revoke all on function public.compute_intermediate_unit_cost(uuid) from public;
grant execute on function public.compute_intermediate_unit_cost(uuid) to app_user;

create or replace view public.v_item_effective_cost
  with (security_invoker = true)
as
select i.org_id,
       i.id        as item_id,
       i.item_code,
       coalesce(ch.cost_per_kg, ss.unit_price, i.list_price_gbp, wip.amount) as amount,
       case
         when ch.cost_per_kg is not null then nullif(trim(ch.currency), '')
         when ss.unit_price is not null then coalesce(nullif(trim(ss.price_currency), ''), 'GBP')
         when i.list_price_gbp is not null then 'GBP'
         when wip.amount is not null then 'GBP'
         else null
       end as currency,
       case
         when ch.cost_per_kg is not null then 'cost_history'
         when ss.unit_price is not null then 'supplier_spec'
         when i.list_price_gbp is not null then 'list_price'
         when wip.amount is not null then 'wip_computed'
         else 'none'
       end as source
  from public.items i
  left join lateral (
    select ch.cost_per_kg, ch.currency
      from public.item_cost_history ch
     where ch.org_id = i.org_id
       and ch.item_id = i.id
       and ch.effective_to is null
     order by ch.effective_from desc
     limit 1
  ) ch on true
  left join lateral (
    select ss.unit_price, ss.price_currency
      from public.supplier_specs ss
     where ss.org_id = i.org_id
       and ss.item_id = i.id
       and ss.lifecycle_status = 'active'
       and ss.review_status = 'approved'
       and ss.unit_price is not null
     order by ss.effective_from desc nulls last, ss.updated_at desc nulls last
     limit 1
  ) ss on true
  left join lateral (
    select public.compute_intermediate_unit_cost(i.id) as amount
      where i.item_type = 'intermediate'
        and ch.cost_per_kg is null
        and ss.unit_price is null
        and i.list_price_gbp is null
  ) wip on true;

grant select on public.v_item_effective_cost to app_user;

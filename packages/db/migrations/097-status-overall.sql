-- T-015: 01-NPD IsAllRequiredFilled + computed fa_status_overall view.
-- Wave0 lock: org_id is the business scope; RLS uses app.current_org_id().
-- PRD: docs/prd/01-NPD-PRD.md §5.10, §7.3.

create or replace function public.is_all_required_filled(product_code text, dept text)
returns boolean
language plpgsql
stable
set search_path = pg_catalog, public, "Reference"
as $$
declare
  product_row public.product%rowtype;
  product_json jsonb;
  required_column record;
  physical_column text;
  field_value text;
begin
  select *
    into product_row
    from public.product
   where product.product_code = is_all_required_filled.product_code;

  if not found then
    return false;
  end if;

  product_json := to_jsonb(product_row);

  for required_column in
    select column_key
      from "Reference"."DeptColumns"
     where org_id = product_row.org_id
       and lower(dept_code) = lower(is_all_required_filled.dept)
       and required_for_done = true
     order by display_order nulls last, column_key
  loop
    physical_column := lower(required_column.column_key);

    if not product_json ? physical_column then
      return false;
    end if;

    field_value := product_json ->> physical_column;
    if field_value is null or nullif(btrim(field_value), '') is null then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.is_all_required_filled(text, text) from public;
grant execute on function public.is_all_required_filled(text, text) to app_user;

create or replace view public.fa_status_overall
  with (security_invoker = true)
as
with computed as (
  select
    p.product_code,
    p.org_id,
    p.built,
    (p.launch_date - current_date)::integer as days_to_launch,
    coalesce(p.closed_core, '') = 'Yes' as closed_core_yes,
    coalesce(p.closed_planning, '') = 'Yes' as closed_planning_yes,
    coalesce(p.closed_commercial, '') = 'Yes' as closed_commercial_yes,
    coalesce(p.closed_production, '') = 'Yes' as closed_production_yes,
    coalesce(p.closed_technical, '') = 'Yes' as closed_technical_yes,
    coalesce(p.closed_mrp, '') = 'Yes' as closed_mrp_yes,
    coalesce(p.closed_procurement, '') = 'Yes' as closed_procurement_yes,
    public.is_all_required_filled(p.product_code, 'Core') as all_core_required,
    public.is_all_required_filled(p.product_code, 'Planning') as all_planning_required,
    public.is_all_required_filled(p.product_code, 'Commercial') as all_commercial_required,
    public.is_all_required_filled(p.product_code, 'Production') as all_production_required,
    public.is_all_required_filled(p.product_code, 'Technical') as all_technical_required,
    public.is_all_required_filled(p.product_code, 'MRP') as all_mrp_required,
    public.is_all_required_filled(p.product_code, 'Procurement') as all_procurement_required
  from public.product p
),
done as (
  select
    product_code,
    org_id,
    built,
    days_to_launch,
    closed_core_yes,
    closed_planning_yes,
    closed_commercial_yes,
    closed_production_yes,
    closed_technical_yes,
    closed_mrp_yes,
    closed_procurement_yes,
    all_core_required,
    all_planning_required,
    all_commercial_required,
    all_production_required,
    all_technical_required,
    all_mrp_required,
    all_procurement_required,
    all_core_required and closed_core_yes as done_core,
    all_planning_required and closed_planning_yes as done_planning,
    all_commercial_required and closed_commercial_yes as done_commercial,
    all_production_required and closed_production_yes as done_production,
    all_technical_required and closed_technical_yes as done_technical,
    all_mrp_required and closed_mrp_yes as done_mrp,
    all_procurement_required and closed_procurement_yes as done_procurement
  from computed
)
select
  product_code,
  org_id,
  done_core,
  done_planning,
  done_commercial,
  done_production,
  done_technical,
  done_mrp,
  done_procurement,
  case
    when built = true then 'Built'
    when done_core
      and done_planning
      and done_commercial
      and done_production
      and done_technical
      and done_mrp
      and done_procurement then 'Complete'
    when days_to_launch <= 10
      and not (
        all_core_required
        and all_planning_required
        and all_commercial_required
        and all_production_required
        and all_technical_required
        and all_mrp_required
        and all_procurement_required
      ) then 'Alert'
    when closed_core_yes
      or closed_planning_yes
      or closed_commercial_yes
      or closed_production_yes
      or closed_technical_yes
      or closed_mrp_yes
      or closed_procurement_yes then 'InProgress'
    else 'Pending'
  end as status_overall,
  days_to_launch
from done;

revoke all on public.fa_status_overall from public;
revoke all on public.fa_status_overall from app_user;
grant select on public.fa_status_overall to app_user;

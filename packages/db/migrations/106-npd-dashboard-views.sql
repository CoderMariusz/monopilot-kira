-- Migration 106: T-048 01-NPD-e dashboard SQL views.
-- PRD: docs/prd/01-NPD-PRD.md §11.2, §11.3, §11.4.
-- Wave0 lock: org_id is the business scope.

create or replace function public.npd_dashboard_label(column_key text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select regexp_replace(initcap(replace(column_key, '_', ' ')), '\mMrp\M', 'MRP', 'g');
$$;

revoke all on function public.npd_dashboard_label(text) from public;
grant execute on function public.npd_dashboard_label(text) to app_user;

create or replace view public.missing_required_cols
  with (security_invoker = true)
as
with candidate_missing as (
  select
    p.product_code,
    p.org_id,
    case
      when lower(dc.dept_code) in ('tech', 'technical') then 'Tech'
      else dc.dept_code
    end as dept_label,
    dc.display_order,
    lower(dc.column_key) as physical_column,
    public.npd_dashboard_label(dc.column_key) as column_label,
    case lower(dc.dept_code)
      when 'core' then 10
      when 'planning' then 20
      when 'commercial' then 30
      when 'production' then 40
      when 'mrp' then 50
      when 'tech' then 60
      when 'technical' then 60
      when 'procurement' then 70
      else 100
    end as dept_sort
  from public.fa p
  join "Reference"."DeptColumns" dc
    on dc.org_id = p.org_id
   and dc.required_for_done = true
  where nullif(btrim(coalesce(to_jsonb(p) ->> lower(dc.column_key), '')), '') is null
),
missing_cells as (
  select
    product_code,
    org_id,
    dept_label,
    physical_column,
    min(display_order) as display_order,
    min(column_label) as column_label,
    min(dept_sort) as dept_sort
  from candidate_missing
  group by product_code, org_id, dept_label, physical_column
),
dept_missing as (
  select
    product_code,
    org_id,
    dept_label,
    dept_sort,
    string_agg(column_label, ', ' order by display_order nulls last, physical_column) as columns_text
  from missing_cells
  group by product_code, org_id, dept_label, dept_sort
)
select
  product_code,
  org_id,
  string_agg(dept_label || ': ' || columns_text, '. ' order by dept_sort, dept_label) || '.' as missing_data
from dept_missing
group by product_code, org_id;

revoke all on public.missing_required_cols from public;
revoke all on public.missing_required_cols from app_user;
grant select on public.missing_required_cols to app_user;

create or replace view public.dashboard_summary
  with (security_invoker = true)
as
select
  org_id,
  count(*) filter (where product_code is not null) as total_active,
  count(*) filter (where status_overall = 'Complete') as fully_complete,
  count(*) filter (where status_overall in ('InProgress', 'Pending', 'Alert')) as pending,
  count(*) filter (where built = true) as total_built
from public.fa
group by org_id;

revoke all on public.dashboard_summary from public;
revoke all on public.dashboard_summary from app_user;
grant select on public.dashboard_summary to app_user;

create or replace view public.launch_alerts
  with (security_invoker = true)
as
with threshold_values as (
  select
    org_id,
    max(value_int) filter (where threshold_key = 'launch_alert_red_days') as red_days,
    max(value_int) filter (where threshold_key = 'launch_alert_yellow_days') as yellow_days
  from "Reference"."AlertThresholds"
  where threshold_key in ('launch_alert_red_days', 'launch_alert_yellow_days')
  group by org_id
),
launch_candidates as (
  select
    f.product_code,
    f.org_id,
    f.launch_date,
    (f.launch_date - current_date)::integer as days_left,
    m.missing_data,
    t.red_days,
    t.yellow_days
  from public.fa f
  join threshold_values t
    on t.org_id = f.org_id
  left join public.missing_required_cols m
    on m.org_id = f.org_id
   and m.product_code = f.product_code
  where f.built = false
    and coalesce(f.status_overall, '') <> 'Complete'
)
select
  product_code,
  org_id,
  launch_date,
  days_left,
  case
    when launch_date is null or days_left <= red_days then 'RED'
    when days_left <= yellow_days and nullif(missing_data, '') is not null then 'YELLOW'
    else 'GREEN'
  end as alert_level,
  missing_data
from launch_candidates
order by days_left asc nulls first, product_code;

revoke all on public.launch_alerts from public;
revoke all on public.launch_alerts from app_user;
grant select on public.launch_alerts to app_user;

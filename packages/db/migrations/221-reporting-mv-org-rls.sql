-- Migration 221: Reporting materialized-view org isolation wrappers.
--
-- Source migration read:
--   * 213-reporting-read-models-and-config.sql defines seven mv_reporting_* fact
--     materialized views and grants SELECT on each to app_reporting_role.
--   * Every mv_reporting_* fact MV in 213 carries org_id, so each receives an
--     org-filtered wrapper view. No mv_reporting_* view is skipped.
--
-- MVs cannot have RLS policies. Expose org-filtered views and remove direct
-- app roles from the raw materialized views.

create or replace view public.v_mv_reporting_production_throughput
with (security_invoker = true) as
select *
from public.mv_reporting_production_throughput
where org_id = app.current_org_id();

revoke select on public.mv_reporting_production_throughput from app_user;
revoke select on public.mv_reporting_production_throughput from app_reporting_role;
grant select on public.v_mv_reporting_production_throughput to app_user;

create or replace view public.v_mv_reporting_yield_by_line_week
with (security_invoker = true) as
select *
from public.mv_reporting_yield_by_line_week
where org_id = app.current_org_id();

revoke select on public.mv_reporting_yield_by_line_week from app_user;
revoke select on public.mv_reporting_yield_by_line_week from app_reporting_role;
grant select on public.v_mv_reporting_yield_by_line_week to app_user;

create or replace view public.v_mv_reporting_oee_rollup
with (security_invoker = true) as
select *
from public.mv_reporting_oee_rollup
where org_id = app.current_org_id();

revoke select on public.mv_reporting_oee_rollup from app_user;
revoke select on public.mv_reporting_oee_rollup from app_reporting_role;
grant select on public.v_mv_reporting_oee_rollup to app_user;

create or replace view public.v_mv_reporting_quality_hold_rate
with (security_invoker = true) as
select *
from public.mv_reporting_quality_hold_rate
where org_id = app.current_org_id();

revoke select on public.mv_reporting_quality_hold_rate from app_user;
revoke select on public.mv_reporting_quality_hold_rate from app_reporting_role;
grant select on public.v_mv_reporting_quality_hold_rate to app_user;

create or replace view public.v_mv_reporting_downtime_by_line
with (security_invoker = true) as
select *
from public.mv_reporting_downtime_by_line
where org_id = app.current_org_id();

revoke select on public.mv_reporting_downtime_by_line from app_user;
revoke select on public.mv_reporting_downtime_by_line from app_reporting_role;
grant select on public.v_mv_reporting_downtime_by_line to app_user;

create or replace view public.v_mv_reporting_schedule_adherence
with (security_invoker = true) as
select *
from public.mv_reporting_schedule_adherence
where org_id = app.current_org_id();

revoke select on public.mv_reporting_schedule_adherence from app_user;
revoke select on public.mv_reporting_schedule_adherence from app_reporting_role;
grant select on public.v_mv_reporting_schedule_adherence to app_user;

create or replace view public.v_mv_reporting_inventory_aging
with (security_invoker = true) as
select *
from public.mv_reporting_inventory_aging
where org_id = app.current_org_id();

revoke select on public.mv_reporting_inventory_aging from app_user;
revoke select on public.mv_reporting_inventory_aging from app_reporting_role;
grant select on public.v_mv_reporting_inventory_aging to app_user;

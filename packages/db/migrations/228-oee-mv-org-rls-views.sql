-- Migration 228: OEE materialized-view org isolation wrappers.
--
-- Matches the migration 221 reporting-MV fix: MVs cannot have RLS policies, so
-- expose org-filtered security-invoker views and remove direct app role access
-- from the raw materialized views while preserving refresh paths.
--
-- Source migration read:
--   * 203-oee-schema-foundation.sql defines oee_shift_metrics and
--     oee_daily_summary with org_id, and grants SELECT on both to app_user.

create or replace view public.v_oee_shift_metrics
with (security_invoker = true) as
select *
from public.oee_shift_metrics
where org_id = app.current_org_id();

revoke select on public.oee_shift_metrics from app_user;
grant select on public.v_oee_shift_metrics to app_user;

create or replace view public.v_oee_daily_summary
with (security_invoker = true) as
select *
from public.oee_daily_summary
where org_id = app.current_org_id();

revoke select on public.oee_daily_summary from app_user;
grant select on public.v_oee_daily_summary to app_user;

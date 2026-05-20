-- Migration 048: Settings role_categories reference seed (T-091)
-- PRD: docs/prd/02-SETTINGS-PRD.md §3, S-U6.
-- Global read-only display mapping: role_code -> ui_category.
-- Categories are presentational only and must not drive permission resolution.

create table if not exists public.role_categories (
  role_code text primary key,
  ui_category text not null constraint role_categories_ui_category_check
    check (ui_category in ('admin', 'manager', 'operator', 'viewer')),
  color_hint text
);

revoke all on public.role_categories from public;
grant select on public.role_categories to app_user;

insert into public.role_categories (role_code, ui_category, color_hint)
values
  ('owner', 'admin', 'red/danger'),
  ('admin', 'admin', 'red/danger'),
  ('npd_manager', 'manager', 'blue'),
  ('module_admin', 'manager', 'blue'),
  ('planner', 'manager', 'blue'),
  ('production_lead', 'manager', 'blue'),
  ('quality_lead', 'manager', 'blue'),
  ('warehouse_operator', 'operator', 'green'),
  ('auditor', 'viewer', 'gray'),
  ('viewer', 'viewer', 'gray')
on conflict (role_code) do update
set ui_category = excluded.ui_category,
    color_hint = excluded.color_hint;

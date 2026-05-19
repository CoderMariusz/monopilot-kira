-- Seed: role_categories reference (T-091 / PRD 02-settings §3, S-U6)
-- Maps the 10 system role codes to 4 customer-facing UI categories.
-- Presentational only: permission resolution remains keyed on role_code.
-- Idempotent via ON CONFLICT (role_code) DO UPDATE.

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

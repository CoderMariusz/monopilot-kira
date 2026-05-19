-- T-092: Settings §10.1 modules baseline seed.
-- Additive/idempotent seed for module catalog rows and per-organization defaults.

insert into public.modules (code, name, dependencies, can_disable, phase, display_order)
values
  ('00-foundation', 'Foundation', array[]::text[], false, 1, 0),
  ('01-npd', 'NPD', array['00-foundation', '02-settings']::text[], true, 1, 1),
  ('02-settings', 'Settings', array['00-foundation']::text[], true, 1, 2),
  ('03-technical', 'Technical', array['00-foundation', '02-settings']::text[], true, 1, 3),
  ('04-planning-basic', 'Planning Basic', array['00-foundation', '02-settings', '03-technical']::text[], true, 1, 4),
  ('05-warehouse', 'Warehouse', array['00-foundation', '02-settings', '03-technical']::text[], true, 1, 5),
  ('06-scanner-p1', 'Scanner P1', array['05-warehouse']::text[], true, 1, 6),
  ('07-planning-ext', 'Planning Extended', array['04-planning-basic']::text[], true, 2, 7),
  ('08-production', 'Production', array['04-planning-basic', '05-warehouse']::text[], true, 1, 8),
  ('09-quality', 'Quality', array['08-production']::text[], true, 2, 9),
  ('10-finance', 'Finance', array['08-production', '10-finance']::text[], true, 2, 10),
  ('11-shipping', 'Shipping', array['05-warehouse', '08-production']::text[], true, 2, 11),
  ('12-reporting', 'Reporting', array['01-npd', '08-production', '10-finance']::text[], true, 2, 12),
  ('13-maintenance', 'Maintenance', array['03-technical']::text[], true, 2, 13),
  ('14-multi-site', 'Multi-site', array[]::text[], true, 3, 14),
  ('15-oee', 'OEE', array['08-production']::text[], true, 3, 15)
on conflict (code) do nothing;

with module_defaults(module_code, enabled) as (
  values
    ('00-foundation', true),
    ('01-npd', true),
    ('02-settings', true),
    ('03-technical', true),
    ('04-planning-basic', true),
    ('05-warehouse', true),
    ('06-scanner-p1', true),
    ('07-planning-ext', false),
    ('08-production', true),
    ('09-quality', false),
    ('10-finance', false),
    ('11-shipping', false),
    ('12-reporting', false),
    ('13-maintenance', false),
    ('14-multi-site', false),
    ('15-oee', false)
)
insert into public.organization_modules (org_id, module_code, enabled)
select org.id, module_defaults.module_code, module_defaults.enabled
from public.organizations org
cross join module_defaults
on conflict (org_id, module_code) do nothing;

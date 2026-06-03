-- T-092: Settings §10.1 modules baseline seed.
-- Additive/idempotent seed for module catalog rows and per-organization defaults.

insert into public.modules (code, name, description, dependencies, can_disable, phase, display_order)
values
  ('00-foundation', 'Foundation', 'Authentication, RBAC, tenancy, audit, outbox, and observability.', array[]::text[], false, 1, 0),
  ('01-npd', 'NPD', 'Product development, specifications, and allergen workflow.', array['00-foundation', '02-settings']::text[], true, 1, 1),
  ('02-settings', 'Settings', 'Reference data, policies, permissions, and workspace configuration.', array['00-foundation']::text[], true, 1, 2),
  ('03-technical', 'Technical', 'Products, BOMs, routings, equipment, items, and standard costs.', array['00-foundation', '02-settings']::text[], true, 1, 3),
  ('04-planning-basic', 'Planning Basic', 'Suppliers, purchase orders, work order baseline, and MRP.', array['00-foundation', '02-settings', '03-technical']::text[], true, 1, 4),
  ('05-warehouse', 'Warehouse', 'License plates, GRN, transfers, and stock movements.', array['00-foundation', '02-settings', '03-technical']::text[], true, 1, 5),
  ('06-scanner-p1', 'Scanner P1', 'Mobile scanner workflows, operators, and offline sync.', array['05-warehouse']::text[], true, 1, 6),
  ('07-planning-ext', 'Planning Extended', 'Extended planning, scheduler outputs, and dependency planning.', array['04-planning-basic']::text[], true, 2, 7),
  ('08-production', 'Production', 'Work order execution, outputs, waste, and downtime.', array['04-planning-basic', '05-warehouse']::text[], true, 1, 8),
  ('09-quality', 'Quality', 'Specifications, holds, NCR, HACCP, and allergen gates.', array['08-production']::text[], true, 2, 9),
  ('10-finance', 'Finance', 'Standard costs, actual costing, FIFO/WAC variance, and D365 export.', array['08-production', '10-finance']::text[], true, 2, 10),
  ('11-shipping', 'Shipping', 'Sales orders, allocation, pick/pack, BOL, POD, and carriers.', array['05-warehouse', '08-production']::text[], true, 2, 11),
  ('12-reporting', 'Reporting', 'KPIs, dashboards, exports, and reporting consumers.', array['01-npd', '08-production', '10-finance']::text[], true, 2, 12),
  ('13-maintenance', 'Maintenance', 'Assets, PM schedules, maintenance work orders, LOTO, and calibration.', array['03-technical']::text[], true, 2, 13),
  ('14-multi-site', 'Multi-site', 'Site context, inter-site transfers, lanes, and master-data sync.', array[]::text[], true, 3, 14),
  ('15-oee', 'OEE', 'Availability, performance, quality, and read-only snapshots.', array['08-production']::text[], true, 3, 15)
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

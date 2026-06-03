-- 069 — Settings module catalog descriptions + organization_modules.updated_at.
--
-- T-072 (/settings/features) and T-103 (/settings/modules) read REAL module
-- catalog data. The audit found descriptions were sourced from a hardcoded
-- MODULE_DESCRIPTIONS map in the page; per the no-hardcode mandate the copy
-- must live in the catalog. This migration adds:
--
--   1. public.modules.description (the per-module human-readable summary the
--      Features/Modules screens render under each toggle), seeded for the
--      T-092 §10.1 module baseline.
--   2. public.organization_modules.updated_at — the T-019 toggleModule action
--      (apps/web/actions/modules/toggle.ts) already writes `updated_at = now()`
--      on every toggle, but the column was never created, so a real toggle
--      raised undefined_column → persistence_failed. Added idempotently here so
--      the wired action persists instead of forking it.
--
-- Additive + idempotent: safe to re-run.

alter table public.modules
  add column if not exists description text;

update public.modules m
set description = v.description
from (values
  ('00-foundation',     'Authentication, RBAC, tenancy, audit, outbox, and observability.'),
  ('01-npd',            'Product development, specifications, and allergen workflow.'),
  ('02-settings',       'Reference data, policies, permissions, and workspace configuration.'),
  ('03-technical',      'Products, BOMs, routings, equipment, items, and standard costs.'),
  ('04-planning-basic', 'Suppliers, purchase orders, work order baseline, and MRP.'),
  ('05-warehouse',      'License plates, GRN, transfers, and stock movements.'),
  ('06-scanner-p1',     'Mobile scanner workflows, operators, and offline sync.'),
  ('07-planning-ext',   'Extended planning, scheduler outputs, and dependency planning.'),
  ('08-production',     'Work order execution, outputs, waste, and downtime.'),
  ('09-quality',        'Specifications, holds, NCR, HACCP, and allergen gates.'),
  ('10-finance',        'Standard costs, actual costing, FIFO/WAC variance, and D365 export.'),
  ('11-shipping',       'Sales orders, allocation, pick/pack, BOL, POD, and carriers.'),
  ('12-reporting',      'KPIs, dashboards, exports, and reporting consumers.'),
  ('13-maintenance',    'Assets, PM schedules, maintenance work orders, LOTO, and calibration.'),
  ('14-multi-site',     'Site context, inter-site transfers, lanes, and master-data sync.'),
  ('15-oee',            'Availability, performance, quality, and read-only snapshots.')
) as v(code, description)
where m.code = v.code
  and (m.description is null or m.description = '');

alter table public.organization_modules
  add column if not exists updated_at timestamptz default now();

update public.organization_modules
set updated_at = coalesce(updated_at, now());

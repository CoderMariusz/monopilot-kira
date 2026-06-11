-- Migration 290: 13-Maintenance — MWO ↔ machines link + list-facing columns.
--
-- Context (Wave-8 lane CL1, first 13-maintenance vertical):
--   The full CMMS schema landed in migration 201 (15 tables) but has been an
--   orphan since — no UI/actions ever touched it. This wave builds the first
--   vertical (MWO CRUD + PM schedule list) on the now-real `public.machines`
--   registry (mig 042; CRUD screen at /settings/machines since wave 7).
--
--   maintenance_work_orders.equipment_id hard-FKs public.equipment (the 13-a
--   asset registry, T-019), which is still empty/unbuilt. The operational asset
--   master users actually maintain TODAY is public.machines (02-settings owner).
--   Per migration 201's own convention ("all cross-module identities are SOFT
--   uuids"), machine_id is a SOFT uuid — validated org-scoped in the Server
--   Action, no hard FK (machines is another module's table; mirrors
--   parent_line_id / downtime_event_id / warehouse_id).
--
--   equipment_id stays untouched — when 13-a lands the equipment registry, PM /
--   calibration MWOs keep using it; reactive machine MWOs carry machine_id.
--
--   title / due_date: PRD §9.5 has no title or due-date column (the prototype's
--   "Problem description" maps to requester_reason, which stays the description
--   field). The MWO list + create modal (work-orders.jsx:48-238,
--   modals.jsx:186-233) need a short summary line and a due date — added as real
--   columns, NOT smuggled into l3_ext_cols (schema-driven L3 is reserved for
--   tenant ext columns).
--
-- Wave0 lock: org_id (NOT tenant_id); RLS unchanged — the migration-201 FOR ALL
--   policy (org_id = app.current_org_id()) already covers the new columns.
-- Idempotent: IF NOT EXISTS everywhere; safe to apply twice.

alter table public.maintenance_work_orders
  add column if not exists machine_id uuid,
  add column if not exists title text,
  add column if not exists due_date date;

comment on column public.maintenance_work_orders.machine_id
  is 'SOFT uuid -> public.machines (02-settings owner, mig 042). Org-scope validated in the Server Action; no hard FK per migration-201 cross-module convention. equipment_id (13-a asset registry) remains for PM/calibration MWOs.';
comment on column public.maintenance_work_orders.title
  is 'Short summary line for the MWO list; the long problem description stays in requester_reason (PRD §9.5 / prototype modals.jsx:186-233).';
comment on column public.maintenance_work_orders.due_date
  is 'Requested completion date (create-modal field); NOT the PM engine next_due_date (that lives on maintenance_schedules).';

create index if not exists idx_mwo_machine
  on public.maintenance_work_orders (machine_id)
  where machine_id is not null;

-- Due-date scan for the list's overdue highlight (open/in-flight rows only).
create index if not exists idx_mwo_due_date
  on public.maintenance_work_orders (due_date)
  where due_date is not null and state in ('requested', 'approved', 'open', 'in_progress');

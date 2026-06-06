-- Migration 234: 01-NPD PILOT stage — pilot_runs + pilot_run_materials + pilot_run_checklist_items.
-- PRD: docs/prd/01-NPD-PRD.md (Pilot stage); NPD-owned, project-scoped.
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
-- Supabase-applyable: no superuser ops; module-local updated_at trigger; text+CHECK enums.
-- wo_reference is a soft (text) reference to 08-production work_orders — NO hard cross-module FK.

create table if not exists public.pilot_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  project_id uuid not null references public.npd_projects(id) on delete cascade,
  planned_date date,
  line text,
  batch_size_kg numeric(12, 4),
  expected_yield_pct numeric(5, 2),
  duration_hours numeric(8, 2),
  supervisor_user_id uuid references public.users(id),
  wo_reference text, -- soft FK to public.work_orders (08-production); service-layer-validated, NOT a DB FK.
  status text not null default 'planned',
  -- Audit (R13)
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  constraint pilot_runs_status_check
    check (status in ('planned', 'in_progress', 'completed')),
  constraint pilot_runs_batch_size_kg_nonneg
    check (batch_size_kg is null or batch_size_kg >= 0),
  constraint pilot_runs_expected_yield_pct_range
    check (expected_yield_pct is null or (expected_yield_pct >= 0 and expected_yield_pct <= 100)),
  constraint pilot_runs_duration_hours_nonneg
    check (duration_hours is null or duration_hours >= 0)
);

create index if not exists pilot_runs_org_project_idx
  on public.pilot_runs (org_id, project_id);

create table if not exists public.pilot_run_materials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  pilot_run_id uuid not null references public.pilot_runs(id) on delete cascade,
  ingredient_code text not null,
  required_kg numeric(12, 4),
  available_kg numeric(12, 4),
  reserved_kg numeric(12, 4),
  status text not null default 'reserved',
  -- Audit (R13)
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  constraint pilot_run_materials_status_check
    check (status in ('reserved', 'short')),
  constraint pilot_run_materials_required_kg_nonneg
    check (required_kg is null or required_kg >= 0),
  constraint pilot_run_materials_available_kg_nonneg
    check (available_kg is null or available_kg >= 0),
  constraint pilot_run_materials_reserved_kg_nonneg
    check (reserved_kg is null or reserved_kg >= 0)
);

create index if not exists pilot_run_materials_org_run_idx
  on public.pilot_run_materials (org_id, pilot_run_id);

create table if not exists public.pilot_run_checklist_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  pilot_run_id uuid not null references public.pilot_runs(id) on delete cascade,
  label text not null,
  is_checked boolean not null default false,
  display_order integer not null default 0,
  -- Audit (R13)
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id)
);

create index if not exists pilot_run_checklist_items_org_run_idx
  on public.pilot_run_checklist_items (org_id, pilot_run_id);

create or replace function public.npd_pilot_runs_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists pilot_runs_set_updated_at on public.pilot_runs;
create trigger pilot_runs_set_updated_at
  before update on public.pilot_runs
  for each row execute function public.npd_pilot_runs_set_updated_at();

drop trigger if exists pilot_run_materials_set_updated_at on public.pilot_run_materials;
create trigger pilot_run_materials_set_updated_at
  before update on public.pilot_run_materials
  for each row execute function public.npd_pilot_runs_set_updated_at();

drop trigger if exists pilot_run_checklist_items_set_updated_at on public.pilot_run_checklist_items;
create trigger pilot_run_checklist_items_set_updated_at
  before update on public.pilot_run_checklist_items
  for each row execute function public.npd_pilot_runs_set_updated_at();

-- RLS: pilot_runs
alter table public.pilot_runs enable row level security;
alter table public.pilot_runs force row level security;
drop policy if exists pilot_runs_org_context on public.pilot_runs;
create policy pilot_runs_org_context
  on public.pilot_runs
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- RLS: pilot_run_materials
alter table public.pilot_run_materials enable row level security;
alter table public.pilot_run_materials force row level security;
drop policy if exists pilot_run_materials_org_context on public.pilot_run_materials;
create policy pilot_run_materials_org_context
  on public.pilot_run_materials
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- RLS: pilot_run_checklist_items
alter table public.pilot_run_checklist_items enable row level security;
alter table public.pilot_run_checklist_items force row level security;
drop policy if exists pilot_run_checklist_items_org_context on public.pilot_run_checklist_items;
create policy pilot_run_checklist_items_org_context
  on public.pilot_run_checklist_items
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- Grants
revoke all on public.pilot_runs from public;
revoke all on public.pilot_runs from app_user;
grant select, insert, update, delete on public.pilot_runs to app_user;

revoke all on public.pilot_run_materials from public;
revoke all on public.pilot_run_materials from app_user;
grant select, insert, update, delete on public.pilot_run_materials to app_user;

revoke all on public.pilot_run_checklist_items from public;
revoke all on public.pilot_run_checklist_items from app_user;
grant select, insert, update, delete on public.pilot_run_checklist_items to app_user;

comment on table public.pilot_runs
  is 'NPD PILOT stage runs per project. wo_reference is a soft text reference to 08-production work_orders (no hard FK). org_id isolated by app.current_org_id().';
comment on table public.pilot_run_materials
  is 'NPD PILOT run material reservations (child of pilot_runs). org_id isolated by app.current_org_id().';
comment on table public.pilot_run_checklist_items
  is 'NPD PILOT run readiness checklist (child of pilot_runs). org_id isolated by app.current_org_id().';

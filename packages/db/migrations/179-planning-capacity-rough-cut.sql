-- Migration 179: 04-Planning-Basic — rough-cut capacity planning schema.
-- PRD: docs/prd/04-PLANNING-BASIC-PRD.md §11 (Finite-Capacity Scheduling Stub / rough-cut tally).
--
-- The capacity side of MRP: a capacity plan projects required load (planned + in-flight
-- WO hours) against available capacity per resource per time bucket, flagging
-- over-loaded buckets. This is the ROUGH-CUT horizon owned by 04-planning-basic; the
-- FINITE solver (scheduler_runs / scheduler_assignments / changeover_matrix) is owned by
-- 07-planning-ext and the parallel scheduling agent — NOT created here.
--
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id().
-- NUMERIC-exact for every hours column. site_id is the day-1 nullable column (no FK).
-- resource_id is a SOFT reference (production_lines / machines live in 03-technical
-- infra-master) and mrp_run_id is a SOFT reference (decouples capacity from the MRP
-- package). Idempotent: safe to re-apply.

-- ============================================================================
-- 1. capacity_plans — one row per rough-cut capacity projection run
-- ============================================================================
create table if not exists public.capacity_plans (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  site_id        uuid,
  plan_number    text not null,
  status         text not null default 'draft',
  horizon_start  date not null default current_date,
  horizon_end    date not null,
  bucket_kind    text not null default 'day',
  mrp_run_id     uuid, -- soft FK to mrp_runs; service-layer-validated (decoupled package)
  created_by     uuid references public.users(id) on delete restrict,
  created_at     timestamptz not null default pg_catalog.now(),
  updated_at     timestamptz not null default pg_catalog.now(),

  constraint capacity_plans_org_plan_number_unique unique (org_id, plan_number),
  constraint capacity_plans_status_check check (
    status in ('draft', 'published', 'archived')
  ),
  constraint capacity_plans_bucket_kind_check check (
    bucket_kind in ('day', 'week', 'shift')
  ),
  constraint capacity_plans_horizon_range_check check (horizon_end >= horizon_start)
);

create index if not exists idx_capacity_plans_org_status on public.capacity_plans (org_id, status);
create index if not exists idx_capacity_plans_org_site   on public.capacity_plans (org_id, site_id);
create index if not exists idx_capacity_plans_mrp_run    on public.capacity_plans (mrp_run_id)
  where mrp_run_id is not null;
create index if not exists idx_capacity_plans_created_by on public.capacity_plans (created_by)
  where created_by is not null;

-- ============================================================================
-- 2. capacity_plan_lines — load vs available capacity per resource per bucket
-- ============================================================================
create table if not exists public.capacity_plan_lines (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  site_id         uuid,
  plan_id         uuid not null references public.capacity_plans(id) on delete cascade,
  resource_id     uuid, -- soft FK to production_lines / machines (03-technical); service-layer-validated
  resource_kind   text not null default 'line',
  bucket_date     date not null,
  available_hours numeric(12, 4) not null default 0,
  required_hours  numeric(12, 4) not null default 0,
  created_at      timestamptz not null default pg_catalog.now(),
  updated_at      timestamptz not null default pg_catalog.now(),

  constraint capacity_plan_lines_plan_resource_bucket_unique unique (plan_id, resource_id, bucket_date),
  constraint capacity_plan_lines_resource_kind_check check (
    resource_kind in ('line', 'machine', 'labour')
  ),
  constraint capacity_plan_lines_available_nonnegative_check check (available_hours >= 0),
  constraint capacity_plan_lines_required_nonnegative_check check (required_hours >= 0)
);

create index if not exists idx_capacity_plan_lines_plan on public.capacity_plan_lines (plan_id);
create index if not exists idx_capacity_plan_lines_org_resource_bucket
  on public.capacity_plan_lines (org_id, resource_id, bucket_date);

-- ============================================================================
-- 3. RLS enable + force (org-only predicate; site_id day-1 nullable)
-- ============================================================================
alter table public.capacity_plans      enable row level security;
alter table public.capacity_plans      force  row level security;
alter table public.capacity_plan_lines enable row level security;
alter table public.capacity_plan_lines force  row level security;

-- ============================================================================
-- 4. Policies — one org-isolation policy per table, via app.current_org_id()
-- ============================================================================
drop policy if exists capacity_plans_org_isolation on public.capacity_plans;
create policy capacity_plans_org_isolation on public.capacity_plans
  for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists capacity_plan_lines_org_isolation on public.capacity_plan_lines;
create policy capacity_plan_lines_org_isolation on public.capacity_plan_lines
  for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- ============================================================================
-- 5. Grants — fail-closed default; DML only to app_user
-- ============================================================================
revoke all on public.capacity_plans      from public;
revoke all on public.capacity_plan_lines from public;
revoke all on public.capacity_plans      from app_user;
revoke all on public.capacity_plan_lines from app_user;
grant select, insert, update, delete on public.capacity_plans      to app_user;
grant select, insert, update, delete on public.capacity_plan_lines to app_user;

-- ============================================================================
-- 6. updated_at triggers
-- ============================================================================
create or replace function public.planning_capacity_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists capacity_plans_set_updated_at on public.capacity_plans;
create trigger capacity_plans_set_updated_at
  before update on public.capacity_plans
  for each row execute function public.planning_capacity_set_updated_at();

drop trigger if exists capacity_plan_lines_set_updated_at on public.capacity_plan_lines;
create trigger capacity_plan_lines_set_updated_at
  before update on public.capacity_plan_lines
  for each row execute function public.planning_capacity_set_updated_at();

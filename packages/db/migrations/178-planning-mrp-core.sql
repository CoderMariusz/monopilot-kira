-- Migration 178: 04-Planning-Basic — MRP-core schema (demand→supply netting model).
-- PRD: docs/prd/04-PLANNING-BASIC-PRD.md §4 (MRP/MPS basic), §5.4 (data model), T-045 (reorder_thresholds).
--
-- The demand→supply netting model. An MRP run explodes demand (MPS / forecast / manual)
-- through the BOM, nets it against on-hand + scheduled receipts, and emits planned
-- PO/TO/WO suggestions pegged back to the requirement that drove them. reorder_thresholds
-- backs the Material Demand dashboard (T-045).
--
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id().
-- NUMERIC-exact for every quantity column (never an inexact binary numeric type).
-- site_id is the day-1 nullable column (no FK / registry) — full per-site scoping lands
-- later via 14-multi-site T-030; the RLS predicate stays org-only for now.
--
-- Ownership boundary (binding, 2026-05-14 decision): this module owns the PLANNING
-- projection only. It NEVER creates / writes wo_outputs (08-production canonical) nor
-- schedule_outputs / wo_dependencies (owned by the parallel scheduling agent, migs 176/177).
-- bom / suppliers references are SOFT (no DB FK across module boundaries); the items FK
-- is concrete because the items master is merged (migration 153). Idempotent: re-runnable.

-- ============================================================================
-- 1. mrp_runs — one row per MRP execution
-- ============================================================================
create table if not exists public.mrp_runs (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  site_id            uuid,
  run_number         text not null,
  status             text not null default 'pending',
  demand_source      text not null default 'manual',
  horizon_start      date not null default current_date,
  horizon_end        date not null,
  bucket_days        integer not null default 1,
  params_jsonb       jsonb not null default '{}'::jsonb,
  requirement_count  integer not null default 0,
  planned_order_count integer not null default 0,
  exception_count    integer not null default 0,
  started_at         timestamptz,
  completed_at       timestamptz,
  error_message      text,
  created_by         uuid references public.users(id) on delete restrict,
  created_at         timestamptz not null default pg_catalog.now(),
  updated_at         timestamptz not null default pg_catalog.now(),

  constraint mrp_runs_org_run_number_unique unique (org_id, run_number),
  constraint mrp_runs_status_check check (
    status in ('pending', 'running', 'completed', 'failed', 'cancelled')
  ),
  constraint mrp_runs_demand_source_check check (
    demand_source in ('manual', 'forecast', 'd365_so', 'mps')
  ),
  constraint mrp_runs_bucket_days_check check (bucket_days >= 1),
  constraint mrp_runs_horizon_range_check check (horizon_end >= horizon_start),
  constraint mrp_runs_counts_nonnegative_check check (
    requirement_count >= 0 and planned_order_count >= 0 and exception_count >= 0
  )
);

create index if not exists idx_mrp_runs_org_status on public.mrp_runs (org_id, status);
create index if not exists idx_mrp_runs_org_site   on public.mrp_runs (org_id, site_id);
create index if not exists idx_mrp_runs_created_by on public.mrp_runs (created_by)
  where created_by is not null;

-- ============================================================================
-- 2. mrp_requirements — net-requirement ledger (per item per time bucket)
-- ============================================================================
create table if not exists public.mrp_requirements (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  site_id             uuid,
  run_id              uuid not null references public.mrp_runs(id) on delete cascade,
  item_id             uuid not null references public.items(id) on delete restrict,
  bom_level           integer not null default 0,
  bucket_date         date not null,
  gross_requirement   numeric(18, 6) not null default 0,
  scheduled_receipts  numeric(18, 6) not null default 0,
  projected_on_hand   numeric(18, 6) not null default 0,
  net_requirement     numeric(18, 6) not null default 0,
  uom                 text not null,
  source_type         text not null default 'dependent',
  source_reference    uuid, -- soft FK to driving demand (so_line / forecast / mps); service-layer-validated
  exception_type      text,
  created_at          timestamptz not null default pg_catalog.now(),
  updated_at          timestamptz not null default pg_catalog.now(),

  constraint mrp_requirements_run_item_bucket_unique unique (run_id, item_id, bucket_date, bom_level),
  constraint mrp_requirements_bom_level_check check (bom_level >= 0),
  constraint mrp_requirements_source_type_check check (
    source_type in ('independent', 'dependent')
  ),
  constraint mrp_requirements_exception_type_check check (
    exception_type is null or exception_type in ('past_due', 'expedite', 'de_expedite', 'shortage', 'excess')
  ),
  constraint mrp_requirements_gross_nonnegative_check check (gross_requirement >= 0),
  constraint mrp_requirements_receipts_nonnegative_check check (scheduled_receipts >= 0)
);

create index if not exists idx_mrp_requirements_org_item_bucket
  on public.mrp_requirements (org_id, item_id, bucket_date);
create index if not exists idx_mrp_requirements_run  on public.mrp_requirements (run_id);
create index if not exists idx_mrp_requirements_item on public.mrp_requirements (item_id);
create index if not exists idx_mrp_requirements_exception
  on public.mrp_requirements (org_id, exception_type)
  where exception_type is not null;

-- ============================================================================
-- 3. mrp_planned_orders — supply suggestions pegged to a requirement
-- ============================================================================
create table if not exists public.mrp_planned_orders (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  site_id            uuid,
  run_id             uuid not null references public.mrp_runs(id) on delete cascade,
  requirement_id     uuid references public.mrp_requirements(id) on delete cascade,
  item_id            uuid not null references public.items(id) on delete restrict,
  order_type         text not null,
  quantity           numeric(18, 6) not null,
  uom                text not null,
  due_date           date not null,
  release_date       date,
  supplier_id        uuid, -- soft FK to suppliers (not merged here); service-layer-validated
  release_status     text not null default 'suggested',
  released_order_id  uuid, -- soft FK to released canonical PO/TO/WO row
  notes              text,
  created_at         timestamptz not null default pg_catalog.now(),
  updated_at         timestamptz not null default pg_catalog.now(),

  constraint mrp_planned_orders_order_type_check check (
    order_type in ('po', 'to', 'wo')
  ),
  constraint mrp_planned_orders_release_status_check check (
    release_status in ('suggested', 'firm', 'released', 'cancelled')
  ),
  constraint mrp_planned_orders_quantity_positive_check check (quantity > 0),
  constraint mrp_planned_orders_release_date_check check (
    release_date is null or release_date <= due_date
  )
);

create index if not exists idx_mrp_planned_orders_run on public.mrp_planned_orders (run_id);
create index if not exists idx_mrp_planned_orders_org_item_due
  on public.mrp_planned_orders (org_id, item_id, due_date);
create index if not exists idx_mrp_planned_orders_requirement
  on public.mrp_planned_orders (requirement_id)
  where requirement_id is not null;
create index if not exists idx_mrp_planned_orders_item on public.mrp_planned_orders (item_id);
create index if not exists idx_mrp_planned_orders_release_status
  on public.mrp_planned_orders (org_id, release_status);
create index if not exists idx_mrp_planned_orders_supplier
  on public.mrp_planned_orders (supplier_id)
  where supplier_id is not null;

-- ============================================================================
-- 4. reorder_thresholds — per-item reorder config (Material Demand dashboard, T-045)
-- ============================================================================
create table if not exists public.reorder_thresholds (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete cascade,
  site_id               uuid,
  item_id               uuid not null references public.items(id) on delete cascade,
  min_qty               numeric(18, 6) not null default 0,
  reorder_qty           numeric(18, 6) not null default 0,
  preferred_supplier_id uuid, -- soft FK to suppliers (not merged here); service-layer-validated
  updated_by            uuid references public.users(id) on delete restrict,
  created_at            timestamptz not null default pg_catalog.now(),
  updated_at            timestamptz not null default pg_catalog.now(),

  constraint reorder_thresholds_org_item_unique unique (org_id, item_id),
  constraint reorder_thresholds_min_qty_nonnegative_check check (min_qty >= 0),
  constraint reorder_thresholds_reorder_qty_nonnegative_check check (reorder_qty >= 0)
);

create index if not exists idx_reorder_thresholds_org  on public.reorder_thresholds (org_id);
create index if not exists idx_reorder_thresholds_item on public.reorder_thresholds (item_id);
create index if not exists idx_reorder_thresholds_supplier
  on public.reorder_thresholds (preferred_supplier_id)
  where preferred_supplier_id is not null;
create index if not exists idx_reorder_thresholds_updated_by
  on public.reorder_thresholds (updated_by)
  where updated_by is not null;

-- ============================================================================
-- 5. RLS enable + force (org-only predicate; site_id day-1 nullable)
-- ============================================================================
alter table public.mrp_runs           enable row level security;
alter table public.mrp_runs           force  row level security;
alter table public.mrp_requirements   enable row level security;
alter table public.mrp_requirements   force  row level security;
alter table public.mrp_planned_orders enable row level security;
alter table public.mrp_planned_orders force  row level security;
alter table public.reorder_thresholds enable row level security;
alter table public.reorder_thresholds force  row level security;

-- ============================================================================
-- 6. Policies — one org-isolation policy per table, via app.current_org_id()
-- ============================================================================
drop policy if exists mrp_runs_org_isolation on public.mrp_runs;
create policy mrp_runs_org_isolation on public.mrp_runs
  for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists mrp_requirements_org_isolation on public.mrp_requirements;
create policy mrp_requirements_org_isolation on public.mrp_requirements
  for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists mrp_planned_orders_org_isolation on public.mrp_planned_orders;
create policy mrp_planned_orders_org_isolation on public.mrp_planned_orders
  for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists reorder_thresholds_org_isolation on public.reorder_thresholds;
create policy reorder_thresholds_org_isolation on public.reorder_thresholds
  for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- ============================================================================
-- 7. Grants — fail-closed default; DML only to app_user
-- ============================================================================
revoke all on public.mrp_runs           from public;
revoke all on public.mrp_requirements   from public;
revoke all on public.mrp_planned_orders from public;
revoke all on public.reorder_thresholds from public;
revoke all on public.mrp_runs           from app_user;
revoke all on public.mrp_requirements   from app_user;
revoke all on public.mrp_planned_orders from app_user;
revoke all on public.reorder_thresholds from app_user;
grant select, insert, update, delete on public.mrp_runs           to app_user;
grant select, insert, update, delete on public.mrp_requirements   to app_user;
grant select, insert, update, delete on public.mrp_planned_orders to app_user;
grant select, insert, update, delete on public.reorder_thresholds to app_user;

-- ============================================================================
-- 8. updated_at triggers (shared helper per the per-table inline convention)
-- ============================================================================
create or replace function public.planning_mrp_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists mrp_runs_set_updated_at on public.mrp_runs;
create trigger mrp_runs_set_updated_at
  before update on public.mrp_runs
  for each row execute function public.planning_mrp_set_updated_at();

drop trigger if exists mrp_requirements_set_updated_at on public.mrp_requirements;
create trigger mrp_requirements_set_updated_at
  before update on public.mrp_requirements
  for each row execute function public.planning_mrp_set_updated_at();

drop trigger if exists mrp_planned_orders_set_updated_at on public.mrp_planned_orders;
create trigger mrp_planned_orders_set_updated_at
  before update on public.mrp_planned_orders
  for each row execute function public.planning_mrp_set_updated_at();

drop trigger if exists reorder_thresholds_set_updated_at on public.reorder_thresholds;
create trigger reorder_thresholds_set_updated_at
  before update on public.reorder_thresholds
  for each row execute function public.planning_mrp_set_updated_at();

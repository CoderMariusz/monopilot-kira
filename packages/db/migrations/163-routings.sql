-- Migration 163: 03-Technical — routings + routing_operations.
-- PRD: docs/prd/03-TECHNICAL-PRD.md §5.6, §12.1, §12.2.
-- Task: _meta/atomic-tasks/03-technical/tasks/T-006.json.
--
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id().
-- site_id day-1: site_id uuid is nullable, no FK and no registry — the full per-site
--   scoping (NOT NULL + (org_id, site_id) index + app.current_site_id() policy) lands
--   later via the cross-module multi-site backfill (14-multi-site T-030). Until then the
--   column exists so operational rows can be tagged without a schema break.
-- Cost columns are NUMERIC-exact (no float): run_time_per_unit_sec NUMERIC(10,2),
--   cost_per_hour NUMERIC(10,4) per ADR-009 (routing-level cost).
-- manufacturing_operation_name is the canonical naming (pairs with
--   bom_lines.manufacturing_operation_name for cross-link queries); the legacy
--   process-stage / process-code identifiers are NOT introduced here.
-- Resource FKs (line_id -> production_lines, machine_id -> machines) are HARD FKs —
--   both tables exist (migration 042).

-- ---------------------------------------------------------------------------
-- routings — per item/FG; zero-or-one active routing, versioned with effective dates.
-- ---------------------------------------------------------------------------
create table if not exists public.routings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid,
  item_id uuid not null references public.items(id) on delete cascade,
  version integer not null default 1,
  status text not null default 'draft',
  effective_from date not null default current_date,
  effective_to date,
  approved_by uuid references public.users(id) on delete restrict,
  approved_at timestamptz,

  created_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint routings_org_item_version_unique unique (org_id, item_id, version),
  constraint routings_status_check check (
    status in ('draft', 'approved', 'active', 'superseded')
  ),
  constraint routings_version_check check (version >= 1),
  constraint routings_effective_range_check check (
    effective_to is null or effective_to >= effective_from
  )
);

create index if not exists idx_routings_org_item
  on public.routings (org_id, item_id, status);

create index if not exists idx_routings_item
  on public.routings (item_id);

create index if not exists idx_routings_approved_by
  on public.routings (approved_by)
  where approved_by is not null;

create index if not exists idx_routings_created_by
  on public.routings (created_by)
  where created_by is not null;

alter table public.routings enable row level security;
alter table public.routings force row level security;

drop policy if exists routings_org_isolation on public.routings;
create policy routings_org_isolation
  on public.routings
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.routings from public;
revoke all on public.routings from app_user;
grant select, insert, update, delete on public.routings to app_user;

create or replace function public.routings_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists routings_set_updated_at on public.routings;
create trigger routings_set_updated_at
  before update on public.routings
  for each row execute function public.routings_set_updated_at();

-- ---------------------------------------------------------------------------
-- routing_operations — ordered ops with resource binding + setup/run times + cost.
-- ON DELETE CASCADE from routings: deleting a routing removes its operations.
-- ---------------------------------------------------------------------------
create table if not exists public.routing_operations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid,
  routing_id uuid not null references public.routings(id) on delete cascade,
  op_no integer not null,
  op_code text not null,
  op_name text not null,
  line_id uuid references public.production_lines(id) on delete set null,
  machine_id uuid references public.machines(id) on delete set null,
  setup_time_min integer not null default 0,
  run_time_per_unit_sec numeric(10, 2),
  cost_per_hour numeric(10, 4),
  manufacturing_operation_name text,

  created_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint routing_operations_routing_op_no_unique unique (routing_id, op_no),
  constraint routing_operations_op_no_check check (op_no >= 1),
  constraint routing_operations_setup_time_nonnegative_check check (setup_time_min >= 0),
  constraint routing_operations_run_time_nonnegative_check check (
    run_time_per_unit_sec is null or run_time_per_unit_sec >= 0
  ),
  constraint routing_operations_cost_per_hour_nonnegative_check check (
    cost_per_hour is null or cost_per_hour >= 0
  )
);

create index if not exists idx_routing_operations_routing
  on public.routing_operations (routing_id, op_no);

create index if not exists idx_routing_operations_org
  on public.routing_operations (org_id);

create index if not exists idx_routing_operations_line
  on public.routing_operations (line_id)
  where line_id is not null;

create index if not exists idx_routing_operations_machine
  on public.routing_operations (machine_id)
  where machine_id is not null;

create index if not exists idx_routing_operations_created_by
  on public.routing_operations (created_by)
  where created_by is not null;

create index if not exists idx_routing_operations_mfg_op_name
  on public.routing_operations (org_id, manufacturing_operation_name)
  where manufacturing_operation_name is not null;

alter table public.routing_operations enable row level security;
alter table public.routing_operations force row level security;

drop policy if exists routing_operations_org_isolation on public.routing_operations;
create policy routing_operations_org_isolation
  on public.routing_operations
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.routing_operations from public;
revoke all on public.routing_operations from app_user;
grant select, insert, update, delete on public.routing_operations to app_user;

drop trigger if exists routing_operations_set_updated_at on public.routing_operations;
create trigger routing_operations_set_updated_at
  before update on public.routing_operations
  for each row execute function public.routings_set_updated_at();

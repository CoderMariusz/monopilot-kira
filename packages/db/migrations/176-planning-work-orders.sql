-- Migration 176: 04-Planning-Basic — work_orders + wo_materials + wo_operations.
-- PRD: docs/prd/04-PLANNING-BASIC-PRD.md §5.6, §5.7.
-- Task: _meta/atomic-tasks/04-planning-basic/tasks/T-004.json.
--
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id().
--   The PRD tables still say "tenant_id" in their prose — that is legacy; the Wave0 v4.3
--   column lock binds the physical column to org_id (see
--   _meta/audits/2026-05-14-tenant-context-remediation.md).
-- site_id day-1: site_id uuid is nullable, no FK and no registry — the full per-site
--   scoping (NOT NULL + (org_id, site_id) index + app.current_site_id() policy) lands later
--   via the cross-module multi-site backfill. Until then the column exists so operational
--   rows can be tagged without a schema break.
-- NUMERIC-exact: all qty columns are NUMERIC (never float). planned_quantity / produced_quantity
--   / actual_qty NUMERIC(15,3); yield/scrap percent NUMERIC(7,4).
-- Canonical ownership: this module owns the planning-side WO schema. It does NOT own
--   wo_outputs (08-production T-003) or oee_snapshots (08-production). Those are not created here.
-- Cross-module product FK: product_id / source_wo_id reference 03-Technical items + planning
--   work_orders. product_id is a SOFT reference (no DB FK) to public.items because the
--   canonical product identity (rm/intermediate/fg/co_product/byproduct) lives in 03-Technical;
--   a hard FK would couple module migration ordering. Resource FKs (production_line_id,
--   machine_id) are HARD FKs to 02-Settings tables (production_lines / machines, migration 042).

-- ---------------------------------------------------------------------------
-- ENUM domains (via CHECK constraints — repo convention keeps enums inline so a
-- value change is a forward migration, never an ALTER TYPE).
-- ---------------------------------------------------------------------------

create table if not exists public.work_orders (
  id                                  uuid primary key default gen_random_uuid(),
  org_id                              uuid not null references public.organizations(id) on delete cascade,
  site_id                             uuid,

  wo_number                           varchar(30) not null,
  product_id                          uuid not null, -- soft FK to 03-Technical public.items; service-layer-validated
  item_type_at_creation               text not null,

  bom_id                              uuid,                 -- nullable: NULL for is_rework=true
  active_bom_header_id                uuid,                 -- canonical factory release read model snapshot
  active_factory_spec_id              uuid,                 -- canonical factory release read model snapshot
  factory_release_event_id            uuid,                 -- read-model release/audit event used to admit this WO
  factory_release_status_at_creation  varchar(40),          -- snapshot: approved_for_factory|released_to_factory for normal WOs
  routing_id                          uuid,                 -- inherited via boms.routing_id (soft, 03-Technical)

  planned_quantity                    numeric(15, 3) not null,
  produced_quantity                   numeric(15, 3),
  uom                                 text not null,

  is_rework                           boolean not null default false,
  released_to_warehouse               boolean not null default false,

  status                              varchar(30) not null default 'DRAFT',

  planned_start_date                  timestamptz,
  planned_end_date                    timestamptz,
  scheduled_start_time                timestamptz,
  scheduled_end_time                  timestamptz,

  production_line_id                  uuid references public.production_lines(id) on delete set null,
  machine_id                          uuid references public.machines(id) on delete set null,

  priority                            varchar(20) not null default 'normal',
  source_of_demand                    text not null default 'manual',
  source_reference                    varchar(255),
  expiry_date                         date,
  disposition_policy                  text not null default 'to_stock',

  actual_qty                          numeric(15, 3),
  -- yield_percent: generated column actual_qty / planned_quantity (NULL-safe; NULL when
  -- actual_qty is NULL or planned_quantity is 0).
  yield_percent                       numeric(9, 4) generated always as (
    case
      when actual_qty is null or planned_quantity = 0 then null
      else round(actual_qty / planned_quantity, 4)
    end
  ) stored,

  started_at                          timestamptz,
  completed_at                        timestamptz,
  paused_at                           timestamptz,
  pause_reason                        text,

  allergen_profile_snapshot           jsonb,
  ext_jsonb                           jsonb not null default '{}'::jsonb,
  schema_version                      integer not null default 1,

  created_by                          uuid references public.users(id) on delete restrict,
  updated_by                          uuid references public.users(id) on delete restrict,
  created_at                          timestamptz not null default pg_catalog.now(),
  updated_at                          timestamptz not null default pg_catalog.now(),

  constraint work_orders_org_wo_number_unique unique (org_id, wo_number),
  constraint work_orders_item_type_at_creation_check check (
    item_type_at_creation in ('rm', 'intermediate', 'fg', 'co_product', 'byproduct')
  ),
  constraint work_orders_status_check check (
    status in ('DRAFT', 'RELEASED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CLOSED', 'CANCELLED')
  ),
  constraint work_orders_priority_check check (
    priority in ('low', 'normal', 'high', 'critical')
  ),
  constraint work_orders_source_of_demand_check check (
    source_of_demand in ('manual', 'd365_so', 'forecast', 'rework', 'intermediate_cascade')
  ),
  constraint work_orders_disposition_policy_check check (
    disposition_policy in ('to_stock', 'direct_continue', 'planner_decides')
  ),
  constraint work_orders_planned_quantity_positive_check check (planned_quantity > 0),
  constraint work_orders_produced_quantity_nonneg_check check (
    produced_quantity is null or produced_quantity >= 0
  ),
  constraint work_orders_actual_qty_nonneg_check check (
    actual_qty is null or actual_qty >= 0
  ),
  constraint work_orders_schema_version_check check (schema_version >= 1)
);

-- Indexes per §5.6
create index if not exists idx_work_orders_org_status_sched
  on public.work_orders (org_id, status, scheduled_start_time);
create index if not exists idx_work_orders_source_reference
  on public.work_orders (source_reference)
  where source_reference is not null;
create index if not exists idx_work_orders_line_sched
  on public.work_orders (production_line_id, scheduled_start_time)
  where production_line_id is not null;
create index if not exists idx_work_orders_released_to_warehouse_true
  on public.work_orders (org_id, released_to_warehouse)
  where released_to_warehouse = true;
create index if not exists idx_work_orders_product
  on public.work_orders (org_id, product_id);
create index if not exists idx_work_orders_machine
  on public.work_orders (machine_id)
  where machine_id is not null;
create index if not exists idx_work_orders_created_by
  on public.work_orders (created_by)
  where created_by is not null;
create index if not exists idx_work_orders_updated_by
  on public.work_orders (updated_by)
  where updated_by is not null;

alter table public.work_orders enable row level security;
alter table public.work_orders force row level security;

drop policy if exists work_orders_org_context on public.work_orders;
create policy work_orders_org_context
  on public.work_orders
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.work_orders from public;
revoke all on public.work_orders from app_user;
grant select, insert, update, delete on public.work_orders to app_user;

create or replace function public.work_orders_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists work_orders_set_updated_at on public.work_orders;
create trigger work_orders_set_updated_at
  before update on public.work_orders
  for each row execute function public.work_orders_set_updated_at();

-- ---------------------------------------------------------------------------
-- wo_materials — BOM-snapshot consumption rows.
-- source_wo_id is a self-FK to work_orders WITHOUT cascade delete (manual handling
-- per §9.4 / T-004 red line — deleting an upstream WO must not silently drop a child WO's
-- material provenance).
-- ---------------------------------------------------------------------------
create table if not exists public.wo_materials (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  site_id         uuid,
  wo_id           uuid not null references public.work_orders(id) on delete cascade,
  product_id      uuid not null, -- soft FK to 03-Technical public.items; service-layer-validated
  material_name   varchar(255) not null,

  required_qty    numeric(15, 3) not null,
  consumed_qty    numeric(15, 3) not null default 0,
  reserved_qty    numeric(15, 3) not null default 0,
  uom             text not null,

  sequence        integer not null default 1,
  consume_whole_lp boolean not null default false,
  is_by_product   boolean not null default false,
  yield_percent   numeric(7, 4),
  scrap_percent   numeric(7, 4),
  condition_flags jsonb not null default '{}'::jsonb,

  bom_item_id     uuid, -- provenance, soft FK to 03-Technical bom_lines
  bom_version     integer,

  material_source text not null default 'stock',
  source_wo_id    uuid references public.work_orders(id) on delete restrict, -- NO cascade (T-004)
  notes           text,

  created_at      timestamptz not null default pg_catalog.now(),
  updated_at      timestamptz not null default pg_catalog.now(),

  constraint wo_materials_material_source_check check (
    material_source in ('stock', 'upstream_wo_output', 'manual')
  ),
  constraint wo_materials_required_qty_nonneg_check check (required_qty >= 0),
  constraint wo_materials_consumed_qty_nonneg_check check (consumed_qty >= 0),
  constraint wo_materials_reserved_qty_nonneg_check check (reserved_qty >= 0)
);

create index if not exists idx_wo_materials_org_wo
  on public.wo_materials (org_id, wo_id);
create index if not exists idx_wo_materials_wo
  on public.wo_materials (wo_id);
create index if not exists idx_wo_materials_product
  on public.wo_materials (org_id, product_id);
create index if not exists idx_wo_materials_source_wo
  on public.wo_materials (source_wo_id)
  where source_wo_id is not null;

alter table public.wo_materials enable row level security;
alter table public.wo_materials force row level security;

drop policy if exists wo_materials_org_context on public.wo_materials;
create policy wo_materials_org_context
  on public.wo_materials
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.wo_materials from public;
revoke all on public.wo_materials from app_user;
grant select, insert, update, delete on public.wo_materials to app_user;

drop trigger if exists wo_materials_set_updated_at on public.wo_materials;
create trigger wo_materials_set_updated_at
  before update on public.wo_materials
  for each row execute function public.work_orders_set_updated_at();

-- ---------------------------------------------------------------------------
-- wo_operations — ordered ops snapshot from routing.
-- ---------------------------------------------------------------------------
create table if not exists public.wo_operations (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.organizations(id) on delete cascade,
  site_id                   uuid,
  wo_id                     uuid not null references public.work_orders(id) on delete cascade,

  sequence                  integer not null,
  operation_name            varchar(255) not null,
  machine_id                uuid references public.machines(id) on delete set null,
  line_id                   uuid references public.production_lines(id) on delete set null,

  expected_duration_minutes integer,
  expected_yield_percent    numeric(7, 4),
  actual_duration           integer,
  actual_yield              numeric(7, 4),

  status                    varchar(30) not null default 'pending',

  started_at                timestamptz,
  started_by                uuid references public.users(id) on delete restrict,
  completed_at              timestamptz,
  completed_by              uuid references public.users(id) on delete restrict,
  notes                     text,

  created_at                timestamptz not null default pg_catalog.now(),
  updated_at                timestamptz not null default pg_catalog.now(),

  constraint wo_operations_wo_sequence_unique unique (wo_id, sequence),
  constraint wo_operations_sequence_check check (sequence >= 1),
  constraint wo_operations_status_check check (
    status in ('pending', 'in_progress', 'completed', 'skipped')
  )
);

create index if not exists idx_wo_operations_org_wo
  on public.wo_operations (org_id, wo_id);
create index if not exists idx_wo_operations_wo_sequence
  on public.wo_operations (wo_id, sequence);
create index if not exists idx_wo_operations_line
  on public.wo_operations (line_id)
  where line_id is not null;
create index if not exists idx_wo_operations_machine
  on public.wo_operations (machine_id)
  where machine_id is not null;

alter table public.wo_operations enable row level security;
alter table public.wo_operations force row level security;

drop policy if exists wo_operations_org_context on public.wo_operations;
create policy wo_operations_org_context
  on public.wo_operations
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.wo_operations from public;
revoke all on public.wo_operations from app_user;
grant select, insert, update, delete on public.wo_operations to app_user;

drop trigger if exists wo_operations_set_updated_at on public.wo_operations;
create trigger wo_operations_set_updated_at
  before update on public.wo_operations
  for each row execute function public.work_orders_set_updated_at();

-- Migration 181: 08-Production — wo_outputs (CANONICAL) + wo_material_consumption.
-- PRD: docs/prd/08-PRODUCTION-PRD.md §9.3, §9.4, §16.4 V-PROD-02/03/04/16/24, §5.1#4 R14.
-- Tasks: _meta/atomic-tasks/08-production/tasks/T-003.json (wo_outputs),
--        _meta/atomic-tasks/08-production/tasks/T-002.json (wo_material_consumption).
--
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id().
--   The PRD prose still says "tenant_id" — that is legacy; the Wave0 v4.3 column lock binds
--   the physical column to org_id (see _meta/audits/2026-05-14-tenant-context-remediation.md).
-- site_id day-1: site_id uuid is nullable, no FK and no registry — full per-site scoping
--   (NOT NULL + (org_id, site_id) index + app.current_site_id() policy) lands later via the
--   cross-module multi-site backfill (14-multi-site T-030). Until then the column exists so
--   operational rows can be tagged without a schema break.
-- NUMERIC-exact: qty columns are NUMERIC (never float). qty_kg / qty_consumed NUMERIC(12,3).
--
-- CANONICAL OWNERSHIP (2026-05-14 user decision — see
--   _meta/audits/2026-05-14-fixer-F5-wo-outputs-and-quality-gate.md):
--   08-Production owns `wo_outputs` (the canonical runtime output table). 04-Planning does
--   NOT create it — planning owns `schedule_outputs` (migration 177) and 08-production
--   materializes those rows into wo_outputs on the wo.start event, adding production-only
--   columns (batch_number, qa_status, V-PROD-24 unique-per-year, catch_weight_details, etc.).
--   The wo_outputs.output_type enum is 1:1 with schedule_outputs.output_role.
--   NB: schedule_outputs.output_role uses 'byproduct'; wo_outputs.output_type uses
--   'by_product' per the 08-production §9.4 / MON-domain-production canonical enum set.
--
-- Audit (R13): created/registered actor + timestamp columns + ext_jsonb + schema_version,
--   matching the planning 176/177 pattern. This repo has no generic app.audit_event() trigger;
--   the embedded actor/timestamp columns are the R13 audit surface.
-- FKs: wo_id is a HARD FK to public.work_orders (migration 176, applied). product_id is a
--   SOFT uuid (canonical product identity lives in 03-Technical public.items; a hard FK would
--   couple migration ordering — mirrors planning 176/177). lp_id is a SOFT uuid to
--   05-warehouse license_plates (not yet built) — service-layer validated.

-- ===========================================================================
-- wo_outputs — canonical runtime output rows (primary / co_product / by_product).
-- ===========================================================================
create table if not exists public.wo_outputs (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.organizations(id) on delete cascade,
  site_id                   uuid,

  -- R14 idempotency: a materialization/registration is keyed by transaction_id so a retried
  -- request never double-inserts an output row.
  transaction_id            uuid not null,

  wo_id                     uuid not null references public.work_orders(id) on delete cascade,

  -- 1:1 with schedule_outputs.output_role ('primary'|'co_product'|'by_product').
  output_type               text not null,

  product_id                uuid not null, -- soft FK to 03-Technical public.items; service-layer-validated
  lp_id                     uuid,          -- soft FK to 05-warehouse license_plates; service-layer-validated

  batch_number              text not null,
  qty_kg                    numeric(12, 3) not null,
  uom                       text not null default 'kg',

  qa_status                 text not null default 'PENDING',
  expiry_date               date,
  catch_weight_details      jsonb,
  allergen_profile_snapshot jsonb,

  label_printed_at          timestamptz,

  ext_jsonb                 jsonb not null default '{}'::jsonb,
  schema_version            integer not null default 1,

  -- R13 audit
  registered_by             uuid references public.users(id) on delete restrict,
  registered_at             timestamptz not null default pg_catalog.now(),
  created_by                uuid references public.users(id) on delete restrict,
  updated_by                uuid references public.users(id) on delete restrict,
  created_at                timestamptz not null default pg_catalog.now(),
  updated_at                timestamptz not null default pg_catalog.now(),

  constraint wo_outputs_transaction_id_unique unique (transaction_id),
  constraint wo_outputs_output_type_check check (
    output_type in ('primary', 'co_product', 'by_product')
  ),
  -- V-PROD-03/04: registered output quantity is non-negative.
  constraint wo_outputs_qty_kg_nonneg_check check (qty_kg >= 0),
  constraint wo_outputs_qa_status_check check (
    qa_status in ('PENDING', 'PASSED', 'FAILED', 'ON_HOLD', 'RELEASED')
  ),
  constraint wo_outputs_schema_version_check check (schema_version >= 1)
);

-- V-PROD-24: batch_number unique per org per calendar year (year derived from registered_at).
-- EXTRACT(YEAR FROM timestamptz) is not IMMUTABLE (depends on session TimeZone), so a direct
-- expression index is rejected. We materialize the year via a STORED generated column on the
-- UTC-normalized registered_at and build the unique index on that immutable column.
alter table public.wo_outputs
  add column if not exists registered_year integer
  generated always as (extract(year from (registered_at at time zone 'UTC'))::integer) stored;

create unique index if not exists wo_outputs_org_batch_year_uq
  on public.wo_outputs (org_id, batch_number, registered_year);

-- Indexes per §9.4
create index if not exists idx_outputs_wo
  on public.wo_outputs (org_id, wo_id);
create index if not exists idx_outputs_lp
  on public.wo_outputs (lp_id)
  where lp_id is not null;
create index if not exists idx_outputs_batch
  on public.wo_outputs (org_id, batch_number);
create index if not exists idx_outputs_qa_status
  on public.wo_outputs (org_id, qa_status);
create index if not exists idx_outputs_product
  on public.wo_outputs (org_id, product_id);

alter table public.wo_outputs enable row level security;
alter table public.wo_outputs force row level security;

drop policy if exists wo_outputs_org_context on public.wo_outputs;
create policy wo_outputs_org_context
  on public.wo_outputs
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.wo_outputs from public;
revoke all on public.wo_outputs from app_user;
grant select, insert, update, delete on public.wo_outputs to app_user;

create or replace function public.wo_outputs_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists wo_outputs_set_updated_at on public.wo_outputs;
create trigger wo_outputs_set_updated_at
  before update on public.wo_outputs
  for each row execute function public.wo_outputs_set_updated_at();

-- ===========================================================================
-- wo_material_consumption — consume-from-LP rows with R14 idempotency, FEFO + over-consume.
-- §9.3. Genealogy: lp_id (soft FK to 05-warehouse) is the consumed lot; output linkage is
--   resolved service-side via wo_id + the wo_outputs registered for the same WO.
-- ===========================================================================
create table if not exists public.wo_material_consumption (
  id                            uuid primary key default gen_random_uuid(),
  org_id                        uuid not null references public.organizations(id) on delete cascade,
  site_id                       uuid,

  transaction_id                uuid not null, -- R14 idempotency key

  wo_id                         uuid not null references public.work_orders(id) on delete cascade,
  component_id                  uuid not null, -- soft FK to 03-Technical items / 04 wo_materials.product_id
  lp_id                         uuid not null, -- soft FK to 05-warehouse license_plates; service-layer-validated

  qty_consumed                  numeric(12, 3) not null,
  uom                           text not null default 'kg',

  operator_id                   uuid references public.users(id) on delete set null,

  fefo_adherence_flag           boolean not null,
  fefo_deviation_reason         text,

  over_consumption_flag         boolean not null default false,
  over_consumption_approved_by  uuid references public.users(id) on delete set null,
  over_consumption_approved_at  timestamptz,
  over_consumption_reason_code  text,

  ext_jsonb                     jsonb not null default '{}'::jsonb,

  consumed_at                   timestamptz not null default pg_catalog.now(),
  created_at                    timestamptz not null default pg_catalog.now(),
  updated_at                    timestamptz not null default pg_catalog.now(),

  constraint wo_material_consumption_transaction_id_unique unique (transaction_id),
  constraint wo_material_consumption_qty_consumed_positive_check check (qty_consumed > 0),
  -- §9.3: an over-consumption row is only valid once it carries an approver.
  constraint chk_over_consumption_approval check (
    over_consumption_flag = false or over_consumption_approved_by is not null
  )
);

create index if not exists idx_consumption_wo
  on public.wo_material_consumption (org_id, wo_id);
create index if not exists idx_consumption_lp
  on public.wo_material_consumption (lp_id);
-- Partial index: only FEFO-deviation rows (FEFO deviation audit lookups).
create index if not exists idx_consumption_fefo_dev
  on public.wo_material_consumption (org_id, wo_id)
  where fefo_adherence_flag = false;
create index if not exists idx_consumption_operator_time
  on public.wo_material_consumption (operator_id, consumed_at)
  where operator_id is not null;

alter table public.wo_material_consumption enable row level security;
alter table public.wo_material_consumption force row level security;

drop policy if exists wo_material_consumption_org_context on public.wo_material_consumption;
create policy wo_material_consumption_org_context
  on public.wo_material_consumption
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.wo_material_consumption from public;
revoke all on public.wo_material_consumption from app_user;
grant select, insert, update, delete on public.wo_material_consumption to app_user;

drop trigger if exists wo_material_consumption_set_updated_at on public.wo_material_consumption;
create trigger wo_material_consumption_set_updated_at
  before update on public.wo_material_consumption
  for each row execute function public.wo_outputs_set_updated_at();

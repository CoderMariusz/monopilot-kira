-- Migration 191: 05-Warehouse — license_plates (LP) + FEFO inventory read model.
-- PRD: docs/prd/05-WAREHOUSE-PRD.md §5.2 (LP entity), §9 (FEFO First-Expiry-First-Out).
-- Tasks: _meta/atomic-tasks/05-warehouse/tasks/T-002.json (license_plates + RLS + FEFO index),
--        T-011 (FEFO composite + genealogy/location indexes), T-012 (RLS org isolation).
--
-- LP is the universal lot/quantity unit (ADR-001) consumed across consume/ship/scan by
-- 06-scanner, 08-production, 09-quality, 10-finance, 11-shipping. 08-production already
-- references lp_id as a SOFT uuid (migs 181/183); THIS migration is the canonical owner of
-- public.license_plates.
--
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id()
--   (foundation function, migration 002-rls-baseline.sql — never redefined, never read as a
--   raw current_setting GUC).
-- site_id day-1: site_id uuid is NULLABLE, no FK, no registry — full per-site scoping
--   (NOT NULL + (org_id, site_id) policy + app.current_site_id()) lands later via the
--   cross-module multi-site backfill (14-multi-site T-030). Until then the column exists so
--   operational rows can be tagged without a schema break.
-- NUMERIC-exact: quantity / reserved_qty / catch_weight_kg are NUMERIC (never float).
-- FKs: organizations (hard, cascade) + users (hard, set null for lock/audit actors). All
--   cross-module identities (warehouse_id, product_id, location_id, grn_id, wo_id, parent_lp_id,
--   reserved_for_wo_id, consumed_by_wo_id, source_so_id) are SOFT uuids — a hard FK would couple
--   migration ordering across modules (mirrors planning 176/177 + production 181).
-- Canonical-owner separation: this migration creates ONLY license_plates + its FEFO read model.
--   It does NOT create wo_outputs (08-production), schedule_outputs (04-planning), or
--   oee_snapshots (08-production).

-- ===========================================================================
-- license_plates — atomic inventory unit (T-002, WH §5.2).
-- ===========================================================================
create table if not exists public.license_plates (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations(id) on delete cascade,
  site_id                  uuid,

  -- Identity / numbering — UNIQUE per (org, warehouse); lp_number_seq is per-warehouse (T-016).
  warehouse_id             uuid not null,            -- soft FK to 02-Settings warehouses
  lp_number                text not null,
  lp_code                  text,                     -- GS1-128 rendered code (T-023)

  -- What it holds — dual-UoM (quantity + uom + catch_weight_kg).
  product_id               uuid not null,            -- soft FK to 03-Technical items
  quantity                 numeric(18, 6) not null,
  reserved_qty             numeric(18, 6) not null default 0,
  uom                      text not null,
  catch_weight_kg          numeric(18, 6),

  -- State — status owned by warehouse; qa_status owned by 09-Quality (mirrored here).
  status                   text not null default 'available',
  qa_status                text not null default 'pending',

  -- Batch / barcode.
  batch_number             text,
  supplier_batch_number    text,
  gtin                     text,

  -- Expiry — FEFO key. shelf_life_mode/date_code snapshot from 03-Technical at receipt.
  expiry_date              timestamptz,
  best_before_date         timestamptz,
  shelf_life_mode_snapshot text,
  date_code_rendered       text,

  -- Location — soft FK to 02-Settings locations (ltree zone roll-up).
  location_id              uuid,

  -- Origin — GRN (receipt) or production (output LP) etc.
  origin                   text not null default 'grn',

  -- Lineage — genealogy parent + WO/GRN references (soft FKs).
  parent_lp_id             uuid,
  grn_id                   uuid,
  wo_id                    uuid,
  reserved_for_wo_id       uuid,
  consumed_by_wo_id        uuid,
  source_so_id             uuid,                     -- 11-Shipping sales order on ship

  -- Scanner lock protocol (§6.6, T-020) — 5-min auto-release enforced service-side.
  locked_by                uuid references public.users(id) on delete set null,
  locked_at                timestamptz,

  -- Extensions (ADR-028).
  ext_jsonb                jsonb not null default '{}'::jsonb,
  private_jsonb            jsonb not null default '{}'::jsonb,
  schema_version           integer not null default 1,

  -- R13 audit.
  created_by               uuid references public.users(id) on delete set null,
  updated_by               uuid references public.users(id) on delete set null,
  created_at               timestamptz not null default pg_catalog.now(),
  updated_at               timestamptz not null default pg_catalog.now(),

  constraint license_plates_org_warehouse_lp_number_uq unique (org_id, warehouse_id, lp_number),
  constraint license_plates_quantity_nonneg_check check (quantity >= 0),
  constraint license_plates_reserved_qty_nonneg_check check (reserved_qty >= 0),
  constraint license_plates_reserved_qty_le_quantity_check check (reserved_qty <= quantity),
  constraint license_plates_status_check check (
    status in ('received', 'available', 'reserved', 'allocated', 'consumed',
               'blocked', 'merged', 'shipped', 'returned', 'quarantine')
  ),
  constraint license_plates_qa_status_check check (
    qa_status in ('pending', 'released', 'on_hold', 'rejected')
  ),
  constraint license_plates_origin_check check (
    origin in ('grn', 'production', 'transfer', 'adjustment', 'split', 'merge')
  ),
  constraint license_plates_schema_version_check check (schema_version >= 1)
);

-- ---------------------------------------------------------------------------
-- Indexes (T-011). FEFO composite is MANDATORY — §9.2 <500 ms SLO depends on it.
-- ---------------------------------------------------------------------------
-- FEFO composite: expire-earliest first, NULLS LAST (no-expiry LPs picked last).
create index if not exists license_plates_fefo_idx
  on public.license_plates (org_id, warehouse_id, product_id, status, expiry_date asc nulls last);
create index if not exists license_plates_org_idx
  on public.license_plates (org_id);
create index if not exists license_plates_org_site_idx
  on public.license_plates (org_id, site_id);
create index if not exists license_plates_location_idx
  on public.license_plates (org_id, location_id);
create index if not exists license_plates_parent_idx
  on public.license_plates (parent_lp_id) where parent_lp_id is not null;
create index if not exists license_plates_grn_idx
  on public.license_plates (grn_id) where grn_id is not null;
create index if not exists license_plates_wo_idx
  on public.license_plates (wo_id) where wo_id is not null;

-- ---------------------------------------------------------------------------
-- RLS — ENABLE + FORCE; org isolation via app.current_org_id() (T-012).
-- ---------------------------------------------------------------------------
alter table public.license_plates enable row level security;
alter table public.license_plates force row level security;

drop policy if exists license_plates_org_context on public.license_plates;
create policy license_plates_org_context
  on public.license_plates
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.license_plates from public;
revoke all on public.license_plates from app_user;
grant select, insert, update, delete on public.license_plates to app_user;

-- updated_at trigger (reuse the production helper if present, else define a local one).
create or replace function public.license_plates_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists license_plates_set_updated_at on public.license_plates;
create trigger license_plates_set_updated_at
  before update on public.license_plates
  for each row execute function public.license_plates_set_updated_at();

-- ===========================================================================
-- v_inventory_available — FEFO read model (§9.2).
-- security_invoker so the underlying license_plates RLS applies to the querying app_user.
-- Pre-ordered by the FEFO key so the §9.2 picker can `LIMIT n` without re-sorting; the
-- license_plates_fefo_idx backs the WHERE + ORDER BY.
-- ===========================================================================
drop view if exists public.v_inventory_available;
create view public.v_inventory_available
  with (security_invoker = true)
  as
  select
    lp.id                              as lp_id,
    lp.org_id,
    lp.site_id,
    lp.warehouse_id,
    lp.product_id,
    lp.lp_number,
    lp.status,
    lp.qa_status,
    lp.quantity,
    lp.reserved_qty,
    (lp.quantity - lp.reserved_qty)    as available_qty,
    lp.uom,
    lp.batch_number,
    lp.expiry_date,
    lp.best_before_date,
    lp.location_id
  from public.license_plates lp
  where lp.status = 'available'
    and lp.qa_status = 'released'
    and (lp.quantity - lp.reserved_qty) > 0
  order by lp.org_id, lp.warehouse_id, lp.product_id,
           lp.expiry_date asc nulls last, lp.lp_number asc;

revoke all on public.v_inventory_available from public;
grant select on public.v_inventory_available to app_user;

comment on view public.v_inventory_available is
  'FEFO read model (WH §9.2). security_invoker view over license_plates: pickable on-hand '
  '(status=available, qa_status=released, available_qty>0) pre-ordered by expiry NULLS LAST '
  'then lp_number. Backed by license_plates_fefo_idx.';

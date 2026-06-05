-- Migration 193: 05-Warehouse wave-B — LP-transition ledger + GRN/stock-movement + spare-parts.
-- PRD: docs/prd/05-WAREHOUSE-PRD.md §5.5 (grns + grn_items), §5.6 (stock_moves), §6.1 (LP state
--   machine + lp_state_history), §7 (GRN workflow), §8 (stock movements).
-- Tasks: _meta/atomic-tasks/05-warehouse/tasks/T-019.json (lp_state_history — the transition
--   ledger written by transitionLpState), T-005.json (grns + grn_items, multi-LP-per-line),
--   T-006.json (stock_moves + 8 move types). Builds on migration 191 (license_plates + FEFO).
--
-- BUILDS ON 191/192 — does NOT recreate public.license_plates, the warehouse RBAC permission
--   family, or the existing warehouse.lp.* outbox events. The DSL rule (lp_state_machine_v1),
--   outbox CHECK regen, and the wave-B RBAC seed live in migration 194.
--
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS ENABLE + FORCE via
--   app.current_org_id() (foundation function, migration 002 — never a raw current_setting GUC).
-- site_id day-1: site_id uuid is NULLABLE, no FK, no registry on every operational table — full
--   per-site scoping ((org_id, site_id) policy + app.current_site_id()) lands later via the
--   cross-module multi-site backfill (14-multi-site T-030).
-- NUMERIC-exact: all qty / catch-weight columns are NUMERIC (never float).
-- FKs: organizations (hard, cascade) + users (hard, set null for audit actors). The LP subject
--   (lp_id) is a HARD FK to public.license_plates (migration 191, applied). All other
--   cross-module identities (warehouse_id, product_id, location_id, po_id, to_id, supplier_id,
--   wo_id, part_item_id) are SOFT uuids — a hard FK would couple migration ordering across
--   02-Settings / 03-Technical / 04-Planning / 13-Maintenance (mirrors 191).
-- Canonical-owner separation: this migration creates ONLY warehouse-owned tables. It does NOT
--   create wo_outputs / oee_snapshots / downtime_events (08-production), schedule_outputs
--   (04-planning), item_cost_history (03-technical), or quality_holds/ncr_reports (09-quality).
-- Audit (R13): created/updated actor + timestamp columns + ext_jsonb/private_jsonb +
--   schema_version, plus a BEFORE UPDATE updated_at trigger (mirrors 191).

-- ===========================================================================
-- lp_state_history — the LP transition ledger (T-019, WH §6.1).
--   One immutable row per license_plates status move
--   (received → available → reserved/allocated → consumed → shipped, plus block/merge/return).
--   The transitionLpState service validates from→to against lp_state_machine_v1 (migration 194),
--   inserts a row here in the SAME txn as the license_plates UPDATE, and emits the outbox event.
--   APPEND-ONLY by contract (Forbidden #3): app_user gets SELECT + INSERT only, no UPDATE/DELETE.
-- ===========================================================================
create table if not exists public.lp_state_history (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  site_id            uuid,

  lp_id              uuid not null references public.license_plates(id) on delete cascade,

  -- State move. from_state NULL only for the genesis (create) transition.
  from_state         text,
  to_state           text not null,

  -- Why — reason_code required for destructive transitions (block/destroy/merged), enforced by
  -- the service against lp_state_machine_v1 allowed_reasons (V-WH-LP-010).
  reason_code        text,
  reason_text        text,

  -- Optional context refs (soft uuids) — which WO/GRN/SO/move drove the transition.
  wo_id              uuid,
  grn_id             uuid,
  stock_move_id      uuid,
  source_so_id       uuid,

  -- Idempotency (R14): a retried transition request never double-writes the ledger row.
  transaction_id     uuid not null default gen_random_uuid(),

  ext_jsonb          jsonb not null default '{}'::jsonb,
  private_jsonb      jsonb not null default '{}'::jsonb,
  schema_version     integer not null default 1,

  -- R13 audit. transitioned_at is the business event time; created_at is the row write time.
  transitioned_at    timestamptz not null default pg_catalog.now(),
  created_by         uuid references public.users(id) on delete set null,
  created_at         timestamptz not null default pg_catalog.now(),

  constraint lp_state_history_transaction_id_uq unique (org_id, transaction_id),
  constraint lp_state_history_from_state_check check (
    from_state is null or from_state in (
      'received', 'available', 'reserved', 'allocated', 'consumed',
      'blocked', 'merged', 'shipped', 'returned', 'quarantine'
    )
  ),
  constraint lp_state_history_to_state_check check (
    to_state in (
      'received', 'available', 'reserved', 'allocated', 'consumed',
      'blocked', 'merged', 'shipped', 'returned', 'quarantine'
    )
  ),
  constraint lp_state_history_schema_version_check check (schema_version >= 1)
);

create index if not exists lp_state_history_lp_idx
  on public.lp_state_history (org_id, lp_id, transitioned_at);
create index if not exists lp_state_history_org_idx
  on public.lp_state_history (org_id);
create index if not exists lp_state_history_org_site_idx
  on public.lp_state_history (org_id, site_id);
create index if not exists lp_state_history_wo_idx
  on public.lp_state_history (wo_id) where wo_id is not null;
create index if not exists lp_state_history_grn_idx
  on public.lp_state_history (grn_id) where grn_id is not null;

alter table public.lp_state_history enable row level security;
alter table public.lp_state_history force row level security;

drop policy if exists lp_state_history_org_context on public.lp_state_history;
create policy lp_state_history_org_context
  on public.lp_state_history
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.lp_state_history from public;
revoke all on public.lp_state_history from app_user;
-- APPEND-ONLY (Forbidden #3): no UPDATE / no DELETE for the application role.
grant select, insert on public.lp_state_history to app_user;

-- ===========================================================================
-- grns — goods-receipt note header (T-005, WH §5.5).
--   status is ALWAYS manually completed (Q1/V-WH-GRN-001): a completed GRN's items are frozen.
-- ===========================================================================
create table if not exists public.grns (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  site_id              uuid,

  grn_number           text not null,                  -- auto GRN-YYYY-NNNNN (service-assigned)
  source_type          text not null default 'po',     -- po / to / return / adjustment_in
  po_id                uuid,                            -- soft FK to 04-Planning purchase orders
  to_id                uuid,                            -- soft FK to 14-MS transfer orders
  asn_id               uuid,                            -- P2
  supplier_id          uuid,                            -- soft FK to 03-Technical suppliers
  warehouse_id         uuid not null,                   -- soft FK to 02-Settings warehouses
  default_location_id  uuid,                            -- soft FK to 02-Settings locations
  receipt_date         timestamptz not null default pg_catalog.now(),
  status               text not null default 'draft',   -- draft / completed / cancelled
  received_by          uuid references public.users(id) on delete set null,
  completed_at         timestamptz,
  notes                text,

  ext_jsonb            jsonb not null default '{}'::jsonb,
  private_jsonb        jsonb not null default '{}'::jsonb,
  schema_version       integer not null default 1,

  created_by           uuid references public.users(id) on delete set null,
  updated_by           uuid references public.users(id) on delete set null,
  created_at           timestamptz not null default pg_catalog.now(),
  updated_at           timestamptz not null default pg_catalog.now(),

  constraint grns_org_grn_number_uq unique (org_id, grn_number),
  constraint grns_source_type_check check (
    source_type in ('po', 'to', 'return', 'adjustment_in')
  ),
  constraint grns_status_check check (status in ('draft', 'completed', 'cancelled')),
  constraint grns_schema_version_check check (schema_version >= 1)
);

create index if not exists grns_org_idx on public.grns (org_id);
create index if not exists grns_org_site_idx on public.grns (org_id, site_id);
create index if not exists grns_warehouse_idx on public.grns (org_id, warehouse_id);
create index if not exists grns_po_idx on public.grns (po_id) where po_id is not null;
create index if not exists grns_to_idx on public.grns (to_id) where to_id is not null;
create index if not exists grns_status_idx on public.grns (org_id, status);

alter table public.grns enable row level security;
alter table public.grns force row level security;

drop policy if exists grns_org_context on public.grns;
create policy grns_org_context
  on public.grns
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.grns from public;
revoke all on public.grns from app_user;
grant select, insert, update, delete on public.grns to app_user;

-- ===========================================================================
-- grn_items — multi-LP-per-line receipt rows (T-005, WH §5.5).
--   One PO line -> N grn_items rows, each = 1 LP with its own batch/expiry/pallet/location.
--   The system NEVER auto-splits/merges (Forbidden #8): per-row qty is operator-entered.
-- ===========================================================================
create table if not exists public.grn_items (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations(id) on delete cascade,
  site_id                uuid,

  grn_id                 uuid not null references public.grns(id) on delete cascade,
  line_number            integer not null,             -- sequence within GRN (multi-row per PO line)
  product_id             uuid not null,                -- soft FK to 03-Technical items
  po_line_id             uuid,                         -- source linkage (04-Planning)
  to_line_id             uuid,
  ordered_qty            numeric(18, 6),               -- denorm from PO line (validation)
  received_qty           numeric(18, 6) not null,      -- qty on THIS LP row
  uom                    text not null,
  batch_number           text,
  supplier_batch_number  text,
  gtin                   text,
  catch_weight_kg        numeric(18, 6),
  manufacture_date       timestamptz,
  expiry_date            timestamptz,
  best_before_date       timestamptz,
  pallet_id              uuid,
  location_id            uuid,                         -- target put-away location
  qa_status_initial      text not null default 'pending',
  lp_id                  uuid references public.license_plates(id) on delete set null,  -- populated on complete

  ext_jsonb              jsonb not null default '{}'::jsonb,
  private_jsonb          jsonb not null default '{}'::jsonb,
  schema_version         integer not null default 1,

  created_by             uuid references public.users(id) on delete set null,
  updated_by             uuid references public.users(id) on delete set null,
  created_at             timestamptz not null default pg_catalog.now(),
  updated_at             timestamptz not null default pg_catalog.now(),

  constraint grn_items_grn_line_uq unique (grn_id, line_number),
  constraint grn_items_received_qty_nonneg_check check (received_qty >= 0),
  constraint grn_items_qa_status_initial_check check (
    qa_status_initial in ('pending', 'released', 'on_hold', 'rejected')
  ),
  constraint grn_items_schema_version_check check (schema_version >= 1)
);

create index if not exists grn_items_grn_idx on public.grn_items (org_id, grn_id);
create index if not exists grn_items_org_idx on public.grn_items (org_id);
create index if not exists grn_items_org_site_idx on public.grn_items (org_id, site_id);
create index if not exists grn_items_po_line_idx on public.grn_items (po_line_id) where po_line_id is not null;
create index if not exists grn_items_product_idx on public.grn_items (org_id, product_id);
create index if not exists grn_items_lp_idx on public.grn_items (lp_id) where lp_id is not null;

alter table public.grn_items enable row level security;
alter table public.grn_items force row level security;

drop policy if exists grn_items_org_context on public.grn_items;
create policy grn_items_org_context
  on public.grn_items
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.grn_items from public;
revoke all on public.grn_items from app_user;
grant select, insert, update, delete on public.grn_items to app_user;

-- GRN status-immutability guard (V-WH-GRN-001): a completed/cancelled GRN's items are frozen.
create or replace function public.grn_items_block_completed_grn()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_status text;
begin
  select g.status into v_status
    from public.grns g
   where g.id = coalesce(new.grn_id, old.grn_id);
  if v_status in ('completed', 'cancelled') then
    raise exception 'V-WH-GRN-001: grn_items are frozen once the GRN is % (grn_id=%)',
      v_status, coalesce(new.grn_id, old.grn_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists grn_items_block_completed_grn on public.grn_items;
create trigger grn_items_block_completed_grn
  before insert or update or delete on public.grn_items
  for each row execute function public.grn_items_block_completed_grn();

-- ===========================================================================
-- stock_moves — movement / adjustment audit log (T-006, WH §5.6, §8).
--   8 move types; adjustments may be NEGATIVE (§8.5 decrease). The move log is the SoT for
--   §11 genealogy + §14 movement dashboards. Status is completed/cancelled.
-- ===========================================================================
create table if not exists public.stock_moves (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  site_id            uuid,

  move_number        text not null,                    -- auto SM-YYYY-NNNNN (service-assigned)
  lp_id              uuid not null references public.license_plates(id) on delete cascade,
  move_type          text not null,                    -- 8 types (see CHECK)
  from_location_id   uuid,                             -- null for putaway from virtual receiving zone
  to_location_id     uuid,
  quantity           numeric(18, 6) not null,          -- may be negative for adjustment (§8.5)
  catch_weight_kg    numeric(18, 6),
  uom                text,
  move_date          timestamptz not null default pg_catalog.now(),
  status             text not null default 'completed',

  -- Adjustment governance (§8.7): >10% adjustments need manager approval; reason_code required.
  reason_code        text,
  reason_text        text,
  approved_by        uuid references public.users(id) on delete set null,

  -- Context refs (soft uuids).
  wo_id              uuid,                              -- consume_to_wo linkage
  grn_id             uuid,                              -- receipt linkage
  wo_material_id     uuid,

  -- Idempotency (R14).
  transaction_id     uuid not null default gen_random_uuid(),

  ext_jsonb          jsonb not null default '{}'::jsonb,
  private_jsonb      jsonb not null default '{}'::jsonb,
  schema_version     integer not null default 1,

  created_by         uuid references public.users(id) on delete set null,
  updated_by         uuid references public.users(id) on delete set null,
  created_at         timestamptz not null default pg_catalog.now(),
  updated_at         timestamptz not null default pg_catalog.now(),

  constraint stock_moves_org_move_number_uq unique (org_id, move_number),
  constraint stock_moves_transaction_id_uq unique (org_id, transaction_id),
  constraint stock_moves_move_type_check check (
    move_type in (
      'transfer', 'putaway', 'issue', 'receipt',
      'adjustment', 'return', 'quarantine', 'consume_to_wo'
    )
  ),
  constraint stock_moves_status_check check (status in ('completed', 'cancelled')),
  -- Only adjustment moves may carry a negative qty (§8.5 decrease); all other types are positive.
  constraint stock_moves_quantity_sign_check check (
    move_type = 'adjustment' or quantity >= 0
  ),
  constraint stock_moves_schema_version_check check (schema_version >= 1)
);

create index if not exists stock_moves_lp_idx on public.stock_moves (org_id, lp_id, move_date);
create index if not exists stock_moves_org_idx on public.stock_moves (org_id);
create index if not exists stock_moves_org_site_idx on public.stock_moves (org_id, site_id);
create index if not exists stock_moves_move_type_idx on public.stock_moves (org_id, move_type, move_date);
create index if not exists stock_moves_wo_idx on public.stock_moves (wo_id) where wo_id is not null;
create index if not exists stock_moves_grn_idx on public.stock_moves (grn_id) where grn_id is not null;

alter table public.stock_moves enable row level security;
alter table public.stock_moves force row level security;

drop policy if exists stock_moves_org_context on public.stock_moves;
create policy stock_moves_org_context
  on public.stock_moves
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.stock_moves from public;
revoke all on public.stock_moves from app_user;
grant select, insert, update, delete on public.stock_moves to app_user;

-- ===========================================================================
-- spare_parts_stock — spare-parts inventory (wave-B; SOFT cross-link to 13-maintenance).
--   The part SKU (part_item_id) is a soft uuid into 03-Technical items / a maintenance parts
--   catalog; 13-maintenance MWO reads this via the cross-module contract. on_hand_qty is the
--   authoritative on-hand; reserved_qty is held against open MWOs. reorder_point/reorder_qty
--   drive the low-stock signal.
-- ===========================================================================
create table if not exists public.spare_parts_stock (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  site_id            uuid,

  part_item_id       uuid not null,                    -- soft FK to part SKU (03-Technical / 13-MNT)
  part_number        text not null,                    -- human-readable part code
  part_name          text,
  warehouse_id       uuid,                             -- soft FK to 02-Settings warehouses
  location_id        uuid,                             -- soft FK to 02-Settings locations

  on_hand_qty        numeric(18, 6) not null default 0,
  reserved_qty       numeric(18, 6) not null default 0,
  reorder_point      numeric(18, 6),
  reorder_qty        numeric(18, 6),
  uom                text not null default 'each',
  unit_cost          numeric(18, 6),                   -- NUMERIC-exact money

  -- Soft cross-link to 13-maintenance (last MWO that drew/returned the part).
  last_mwo_id        uuid,

  ext_jsonb          jsonb not null default '{}'::jsonb,
  private_jsonb      jsonb not null default '{}'::jsonb,
  schema_version     integer not null default 1,

  created_by         uuid references public.users(id) on delete set null,
  updated_by         uuid references public.users(id) on delete set null,
  created_at         timestamptz not null default pg_catalog.now(),
  updated_at         timestamptz not null default pg_catalog.now(),

  -- One stock row per part per (warehouse) within an org.
  constraint spare_parts_stock_org_part_wh_uq unique (org_id, part_item_id, warehouse_id),
  constraint spare_parts_stock_on_hand_nonneg_check check (on_hand_qty >= 0),
  constraint spare_parts_stock_reserved_nonneg_check check (reserved_qty >= 0),
  constraint spare_parts_stock_reserved_le_on_hand_check check (reserved_qty <= on_hand_qty),
  constraint spare_parts_stock_schema_version_check check (schema_version >= 1)
);

create index if not exists spare_parts_stock_org_idx on public.spare_parts_stock (org_id);
create index if not exists spare_parts_stock_org_site_idx on public.spare_parts_stock (org_id, site_id);
create index if not exists spare_parts_stock_part_idx on public.spare_parts_stock (org_id, part_item_id);
create index if not exists spare_parts_stock_warehouse_idx on public.spare_parts_stock (org_id, warehouse_id);
-- Low-stock signal: on_hand at/under reorder point.
create index if not exists spare_parts_stock_reorder_idx
  on public.spare_parts_stock (org_id, part_item_id)
  where reorder_point is not null;

alter table public.spare_parts_stock enable row level security;
alter table public.spare_parts_stock force row level security;

drop policy if exists spare_parts_stock_org_context on public.spare_parts_stock;
create policy spare_parts_stock_org_context
  on public.spare_parts_stock
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.spare_parts_stock from public;
revoke all on public.spare_parts_stock from app_user;
grant select, insert, update, delete on public.spare_parts_stock to app_user;

-- ===========================================================================
-- Shared updated_at trigger for the wave-B mutable tables (reuse the 191 helper).
-- lp_state_history is append-only (no updated_at), so it is excluded.
-- ===========================================================================
drop trigger if exists grns_set_updated_at on public.grns;
create trigger grns_set_updated_at
  before update on public.grns
  for each row execute function public.license_plates_set_updated_at();

drop trigger if exists grn_items_set_updated_at on public.grn_items;
create trigger grn_items_set_updated_at
  before update on public.grn_items
  for each row execute function public.license_plates_set_updated_at();

drop trigger if exists stock_moves_set_updated_at on public.stock_moves;
create trigger stock_moves_set_updated_at
  before update on public.stock_moves
  for each row execute function public.license_plates_set_updated_at();

drop trigger if exists spare_parts_stock_set_updated_at on public.spare_parts_stock;
create trigger spare_parts_stock_set_updated_at
  before update on public.spare_parts_stock
  for each row execute function public.license_plates_set_updated_at();

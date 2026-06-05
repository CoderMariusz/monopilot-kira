-- Migration 211: 11-Shipping — SCHEMA foundation.
--   Customer domain (customers + customer_contacts + customer_addresses +
--   customer_allergen_restrictions), sales orders (sales_orders + sales_order_lines), inventory
--   allocations (inventory_allocations), picking (waves + pick_lists + pick_list_lines), shipments
--   (shipments + shipment_boxes + shipment_box_contents + per-org sscc_counters + SSCC functions),
--   and bill_of_lading.
-- PRD: docs/prd/11-SHIPPING-PRD.md §9.1 (tables), §6 D-SHP-7 RLS, §6 D-SHP-8 SO status machine,
--   §6 D-SHP-13 hold gate, §13.1 SSCC-18, §14.4 BRCGS BOL retention. Tasks T-001/T-006/T-011/
--   T-015/T-018 (+ BOL slice of T-023). SCHEMA-ONLY — status-machine enforcement + Server Actions
--   live in T-002/T-007/T-012/T-016/T-020/T-023.
--
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id()
--   (foundation function, 002-rls-baseline.sql — never redefined, never read as a raw
--   current_setting GUC).
-- site_id day-1: site_id uuid is NULLABLE on every operational table, no FK, no registry — full
--   per-site scoping ((org_id, site_id) policy + app.current_site_id()) lands later via 14-MS T-030.
-- NUMERIC-exact: every money/qty/weight column is NUMERIC (never float).
-- Audit (R13): embedded created_by/created_at/updated_at/updated_by/deleted_at columns + a local
--   shipping_set_updated_at trigger (matches production migs 181-185 / warehouse 191 / quality 197).
-- Cross-module FKs are SOFT uuids (no .references()) to avoid coupling migration ordering across
--   modules: product_id (01-NPD/03-Technical product FG SSOT — NO parallel fa_id), license_plate_id
--   (05-Warehouse license_plates — READ-ONLY here; consumed for ship via warehouse.lp.ship),
--   allergen_id (02-Settings reference rows), location_id / warehouse_id.
-- Canonical-owner separation: this migration creates ONLY 11-shipping tables. It does NOT create
--   wo_outputs / oee_snapshots / downtime_events (08-production), schedule_outputs (04-planning),
--   license_plates (05-warehouse), item_cost_history (03-technical), quality_holds / ncr_reports /
--   v_active_holds (09-quality). The LP qa-status gate READS v_active_holds via holdsGuard.

-- ===========================================================================
-- Per-org human-readable numbering sequences (SO-/PL-/WV-/SH-/BOL-, START 1).
-- Drizzle .references() would create a global counter; per-org numbering is enforced by the
-- generated-number-column UNIQUE (org_id, *_number) below. These global sequences feed the *_seq
-- bigint; the *_number is derived per-row.
-- ===========================================================================
create sequence if not exists public.sales_order_seq start 1;
create sequence if not exists public.pick_list_seq start 1;
create sequence if not exists public.wave_seq start 1;
create sequence if not exists public.shipment_seq start 1;
create sequence if not exists public.bol_seq start 1;

-- ===========================================================================
-- shipping_set_updated_at — R13 embedded-audit trigger (sets updated_at on UPDATE).
-- ===========================================================================
create or replace function public.shipping_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

-- Human-readable number assignment (<PREFIX>-YYYY-NNNNN) — one trigger function per prefix/column,
-- populated at INSERT time (now() is not IMMUTABLE so the number cannot be a GENERATED column).
-- The (org_id, <number>) UNIQUE index + the global *_seq bigint keep numbers unique. The year is a
-- presentation prefix; cross-year uniqueness still holds because the seq is monotonic.
create or replace function public.shipping_set_sales_order_number()
returns trigger language plpgsql as $$
begin
  if new.order_number is null then
    new.order_number := 'SO-' || to_char(new.created_at, 'YYYY') || '-' || lpad(new.order_seq::text, 5, '0');
  end if;
  return new;
end;
$$;

create or replace function public.shipping_set_wave_number()
returns trigger language plpgsql as $$
begin
  if new.wave_number is null then
    new.wave_number := 'WV-' || to_char(new.created_at, 'YYYY') || '-' || lpad(new.wave_seq::text, 5, '0');
  end if;
  return new;
end;
$$;

create or replace function public.shipping_set_pick_list_number()
returns trigger language plpgsql as $$
begin
  if new.pick_list_number is null then
    new.pick_list_number := 'PL-' || to_char(new.created_at, 'YYYY') || '-' || lpad(new.pick_list_seq::text, 5, '0');
  end if;
  return new;
end;
$$;

create or replace function public.shipping_set_shipment_number()
returns trigger language plpgsql as $$
begin
  if new.shipment_number is null then
    new.shipment_number := 'SH-' || to_char(new.created_at, 'YYYY') || '-' || lpad(new.shipment_seq::text, 5, '0');
  end if;
  return new;
end;
$$;

create or replace function public.shipping_set_bol_number()
returns trigger language plpgsql as $$
begin
  if new.bol_number is null then
    new.bol_number := 'BOL-' || to_char(new.created_at, 'YYYY') || '-' || lpad(new.bol_seq::text, 5, '0');
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- customers (T-001).
-- ===========================================================================
create table if not exists public.customers (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete cascade,
  site_id               uuid,
  customer_code         text not null,
  name                  text not null,
  email                 text,
  phone                 text,
  tax_id                text,
  category              text not null default 'retail',
  allergen_restrictions jsonb not null default '[]'::jsonb,
  credit_limit_gbp      numeric(14, 2),
  is_active             boolean not null default true,
  ext_data              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default pg_catalog.now(),
  created_by            uuid,
  updated_at            timestamptz not null default pg_catalog.now(),
  updated_by            uuid,
  deleted_at            timestamptz,
  constraint customers_category_check check (category in ('retail', 'wholesale', 'distributor'))
);
create unique index if not exists customers_org_code_uq on public.customers (org_id, customer_code);
create index if not exists customers_org_idx on public.customers (org_id);
create index if not exists customers_org_site_idx on public.customers (org_id, site_id);

-- ===========================================================================
-- customer_contacts (T-001).
-- ===========================================================================
create table if not exists public.customer_contacts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  site_id     uuid,  -- day-1 nullable scoping column (no FK; 14-MS T-030 adds (org_id, site_id) scoping)
  customer_id uuid not null references public.customers(id) on delete cascade,
  name        text not null,
  title       text,
  email       text,
  phone       text,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default pg_catalog.now(),
  created_by  uuid,
  updated_at  timestamptz not null default pg_catalog.now(),
  updated_by  uuid,
  deleted_at  timestamptz
);
create index if not exists customer_contacts_org_idx on public.customer_contacts (org_id);
create index if not exists customer_contacts_org_site_idx on public.customer_contacts (org_id, site_id);
create index if not exists customer_contacts_customer_idx on public.customer_contacts (customer_id);

-- ===========================================================================
-- customer_addresses (T-001).
-- ===========================================================================
create table if not exists public.customer_addresses (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  site_id       uuid,  -- day-1 nullable scoping column (no FK; 14-MS T-030 adds (org_id, site_id) scoping)
  customer_id   uuid not null references public.customers(id) on delete cascade,
  address_type  text not null,
  is_default    boolean not null default false,
  address_line1 text not null,
  address_line2 text,
  city          text not null,
  state         text,
  postal_code   text not null,
  country_iso2  char(2) not null,
  dock_hours    jsonb,
  notes         text,
  created_at    timestamptz not null default pg_catalog.now(),
  created_by    uuid,
  updated_at    timestamptz not null default pg_catalog.now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  constraint customer_addresses_address_type_check check (address_type in ('billing', 'shipping'))
);
create index if not exists customer_addresses_org_idx on public.customer_addresses (org_id);
create index if not exists customer_addresses_org_site_idx on public.customer_addresses (org_id, site_id);
create index if not exists customer_addresses_customer_type_idx
  on public.customer_addresses (org_id, customer_id, address_type);

-- ===========================================================================
-- customer_allergen_restrictions (T-001). allergen_id soft FK to 02-Settings allergen_families.
-- ===========================================================================
create table if not exists public.customer_allergen_restrictions (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  site_id          uuid,  -- day-1 nullable scoping column (no FK; 14-MS T-030 adds (org_id, site_id) scoping)
  customer_id      uuid not null references public.customers(id) on delete cascade,
  allergen_id      uuid not null,
  restriction_type text not null,
  notes            text,
  created_at       timestamptz not null default pg_catalog.now(),
  created_by       uuid,
  updated_at       timestamptz not null default pg_catalog.now(),
  updated_by       uuid,
  deleted_at       timestamptz,
  constraint customer_allergen_restrictions_type_check
    check (restriction_type in ('refuses', 'requires_decl'))
);
create unique index if not exists customer_allergen_restrictions_uq
  on public.customer_allergen_restrictions (org_id, customer_id, allergen_id);
create index if not exists customer_allergen_restrictions_org_idx
  on public.customer_allergen_restrictions (org_id);
create index if not exists customer_allergen_restrictions_org_site_idx
  on public.customer_allergen_restrictions (org_id, site_id);

-- ===========================================================================
-- sales_orders (T-006). order_number GENERATED 'SO-YYYY-NNNNN' from order_seq. status machine
-- ENFORCEMENT is T-007; the CHECK here only restricts the vocabulary (D-SHP-8 12 states).
-- ===========================================================================
create table if not exists public.sales_orders (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations(id) on delete cascade,
  site_id                uuid,
  order_seq              bigint not null default nextval('public.sales_order_seq'),
  -- order_number ('SO-YYYY-NNNNN') is populated by the sales_orders_set_number BEFORE INSERT
  -- trigger (now() is not IMMUTABLE so it cannot be a GENERATED column).
  order_number           text,
  customer_id            uuid not null references public.customers(id) on delete restrict,
  customer_po            text,
  shipping_address_id    uuid references public.customer_addresses(id) on delete set null,
  order_date             date not null,
  promised_ship_date     date,
  required_delivery_date date,
  status                 text not null default 'draft',
  total_amount_gbp       numeric(14, 2),
  allergen_validated     boolean not null default false,
  confirmed_at           timestamptz,
  confirmed_by           uuid,
  shipped_at             timestamptz,
  ext_data               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default pg_catalog.now(),
  created_by             uuid,
  updated_at             timestamptz not null default pg_catalog.now(),
  updated_by             uuid,
  deleted_at             timestamptz,
  constraint sales_orders_status_check check (
    status in ('draft', 'confirmed', 'allocated', 'partially_picked', 'picked',
               'partially_packed', 'packed', 'manifested', 'shipped',
               'partially_delivered', 'delivered', 'cancelled')
  ),
  constraint sales_orders_ship_date_check check (
    promised_ship_date is null or promised_ship_date >= order_date
  )
);
create unique index if not exists sales_orders_org_number_uq on public.sales_orders (org_id, order_number);
create index if not exists sales_orders_org_idx on public.sales_orders (org_id);
create index if not exists sales_orders_org_site_idx on public.sales_orders (org_id, site_id);
create index if not exists sales_orders_customer_idx on public.sales_orders (customer_id);
create index if not exists sales_orders_status_idx on public.sales_orders (org_id, status);

-- ===========================================================================
-- sales_order_lines (T-006). product_id soft FK to product FG SSOT (NO parallel fa_id).
-- ===========================================================================
create table if not exists public.sales_order_lines (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  site_id            uuid,  -- day-1 nullable scoping column (no FK; 14-MS T-030 adds (org_id, site_id) scoping)
  sales_order_id     uuid not null references public.sales_orders(id) on delete cascade,
  line_number        integer not null,
  product_id         uuid not null,
  quantity_ordered   numeric(14, 3) not null,
  quantity_allocated numeric(14, 3) not null default 0,
  quantity_picked    numeric(14, 3) not null default 0,
  quantity_packed    numeric(14, 3) not null default 0,
  quantity_shipped   numeric(14, 3) not null default 0,
  unit_price_gbp     numeric(14, 4) not null,
  line_total_gbp     numeric(14, 4),
  requested_lot      text,
  notes              text,
  ext_data           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default pg_catalog.now(),
  created_by         uuid,
  updated_at         timestamptz not null default pg_catalog.now(),
  updated_by         uuid,
  deleted_at         timestamptz,
  constraint sales_order_lines_so_line_uq unique (sales_order_id, line_number),
  constraint sales_order_lines_qty_check check (quantity_ordered > 0),
  constraint sales_order_lines_price_check check (unit_price_gbp > 0)
);
create index if not exists sales_order_lines_org_idx on public.sales_order_lines (org_id);
create index if not exists sales_order_lines_org_site_idx on public.sales_order_lines (org_id, site_id);
create index if not exists sales_order_lines_so_idx on public.sales_order_lines (sales_order_id);
create index if not exists sales_order_lines_product_idx on public.sales_order_lines (org_id, product_id);

-- ===========================================================================
-- inventory_allocations (T-011). license_plate_id soft FK to 05-Warehouse license_plates.
-- NOT cascade-deleted from sales_orders (release flow handles orphans).
-- ===========================================================================
create table if not exists public.inventory_allocations (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  site_id              uuid,
  sales_order_line_id  uuid not null references public.sales_order_lines(id) on delete cascade,
  license_plate_id     uuid not null,
  quantity_allocated   numeric(14, 3) not null,
  status               text not null default 'allocated',
  override_reason_code text,
  override_by          uuid,
  allocated_at         timestamptz not null default pg_catalog.now(),
  released_at          timestamptz,
  ext_data             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default pg_catalog.now(),
  created_by           uuid,
  updated_at           timestamptz not null default pg_catalog.now(),
  updated_by           uuid,
  deleted_at           timestamptz,
  constraint inventory_allocations_qty_check check (quantity_allocated > 0),
  constraint inventory_allocations_status_check
    check (status in ('allocated', 'picked', 'released', 'cancelled'))
);
create index if not exists inventory_allocations_org_idx on public.inventory_allocations (org_id);
create index if not exists inventory_allocations_so_line_idx
  on public.inventory_allocations (sales_order_line_id);
create index if not exists inventory_allocations_lp_idx
  on public.inventory_allocations (org_id, license_plate_id);

-- ===========================================================================
-- waves (T-015). wave_number GENERATED 'WV-YYYY-NNNNN'.
-- ===========================================================================
create table if not exists public.waves (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  site_id       uuid,
  wave_seq      bigint not null default nextval('public.wave_seq'),
  wave_number   text, -- 'WV-YYYY-NNNNN' populated by waves_set_number BEFORE INSERT trigger.
  status        text not null default 'unreleased',
  planned_start timestamptz,
  released_at   timestamptz,
  completed_at  timestamptz,
  ext_data      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default pg_catalog.now(),
  created_by    uuid,
  updated_at    timestamptz not null default pg_catalog.now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  constraint waves_status_check check (status in ('unreleased', 'released', 'in_pick', 'completed'))
);
create unique index if not exists waves_org_number_uq on public.waves (org_id, wave_number);
create index if not exists waves_org_idx on public.waves (org_id);

-- ===========================================================================
-- pick_lists (T-015). pick_list_number GENERATED 'PL-YYYY-NNNNN'. NOT cascade from sales_orders.
-- ===========================================================================
create table if not exists public.pick_lists (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  site_id          uuid,
  pick_list_seq    bigint not null default nextval('public.pick_list_seq'),
  pick_list_number text, -- 'PL-YYYY-NNNNN' populated by pick_lists_set_number BEFORE INSERT trigger.
  pick_type        text not null default 'single_order',
  status           text not null default 'pending',
  priority         integer not null default 3,
  assigned_to      uuid references public.users(id) on delete set null,
  wave_id          uuid references public.waves(id) on delete set null,
  sales_order_id   uuid references public.sales_orders(id) on delete set null,
  started_at       timestamptz,
  completed_at     timestamptz,
  ext_data         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default pg_catalog.now(),
  created_by       uuid,
  updated_at       timestamptz not null default pg_catalog.now(),
  updated_by       uuid,
  deleted_at       timestamptz,
  constraint pick_lists_pick_type_check check (pick_type in ('single_order', 'wave')),
  constraint pick_lists_status_check
    check (status in ('pending', 'assigned', 'in_progress', 'completed', 'cancelled')),
  constraint pick_lists_priority_check check (priority between 1 and 5)
);
create unique index if not exists pick_lists_org_number_uq on public.pick_lists (org_id, pick_list_number);
create index if not exists pick_lists_org_idx on public.pick_lists (org_id);
create index if not exists pick_lists_org_site_idx on public.pick_lists (org_id, site_id);
create index if not exists pick_lists_assigned_idx on public.pick_lists (org_id, assigned_to);
create index if not exists pick_lists_wave_idx on public.pick_lists (wave_id);
create index if not exists pick_lists_so_idx on public.pick_lists (sales_order_id);

-- ===========================================================================
-- pick_list_lines (T-015). license_plate_id / picked_license_plate_id soft FK to 05.
-- ===========================================================================
create table if not exists public.pick_list_lines (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations(id) on delete cascade,
  site_id                 uuid,  -- day-1 nullable scoping column (no FK; 14-MS T-030 adds (org_id, site_id) scoping)
  pick_list_id            uuid not null references public.pick_lists(id) on delete cascade,
  sales_order_line_id     uuid references public.sales_order_lines(id) on delete set null,
  license_plate_id        uuid,
  picked_license_plate_id uuid,
  location_id             uuid,
  product_id              uuid,
  lot_number              text,
  quantity_to_pick        numeric(14, 3) not null,
  quantity_picked         numeric(14, 3) not null default 0,
  pick_sequence           integer,
  status                  text not null default 'pending',
  picked_at               timestamptz,
  picked_by               uuid,
  ext_data                jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default pg_catalog.now(),
  created_by              uuid,
  updated_at              timestamptz not null default pg_catalog.now(),
  updated_by              uuid,
  deleted_at              timestamptz,
  constraint pick_list_lines_qty_check check (quantity_to_pick > 0),
  constraint pick_list_lines_status_check check (status in ('pending', 'picked', 'short'))
);
create index if not exists pick_list_lines_org_idx on public.pick_list_lines (org_id);
create index if not exists pick_list_lines_org_site_idx on public.pick_list_lines (org_id, site_id);
create index if not exists pick_list_lines_pick_list_idx on public.pick_list_lines (pick_list_id);
create index if not exists pick_list_lines_so_line_idx on public.pick_list_lines (sales_order_line_id);

-- ===========================================================================
-- shipments (T-018). shipment_number GENERATED 'SH-YYYY-NNNNN'. NOT cascade from sales_orders.
-- ===========================================================================
create table if not exists public.shipments (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  site_id             uuid,
  shipment_seq        bigint not null default nextval('public.shipment_seq'),
  shipment_number     text, -- 'SH-YYYY-NNNNN' populated by shipments_set_number BEFORE INSERT trigger.
  sales_order_id      uuid references public.sales_orders(id) on delete restrict,
  customer_id         uuid references public.customers(id) on delete restrict,
  shipping_address_id uuid references public.customer_addresses(id) on delete set null,
  status              text not null default 'pending',
  carrier             text,
  service_level       text,
  tracking_number     text,
  total_weight_kg     numeric(12, 3),
  total_boxes         integer,
  dock_door_id        uuid,
  staged_location_id  uuid,
  packed_at           timestamptz,
  packed_by           uuid,
  shipped_at          timestamptz,
  shipped_by          uuid,
  delivered_at        timestamptz,
  bol_pdf_url         text,
  bol_signed_pdf_url  text,
  ext_data            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default pg_catalog.now(),
  created_by          uuid,
  updated_at          timestamptz not null default pg_catalog.now(),
  updated_by          uuid,
  deleted_at          timestamptz,
  constraint shipments_status_check check (
    status in ('pending', 'packing', 'packed', 'manifested', 'shipped', 'delivered', 'exception')
  )
);
create unique index if not exists shipments_org_number_uq on public.shipments (org_id, shipment_number);
create index if not exists shipments_org_idx on public.shipments (org_id);
create index if not exists shipments_org_site_idx on public.shipments (org_id, site_id);
create index if not exists shipments_so_idx on public.shipments (sales_order_id);
create index if not exists shipments_customer_idx on public.shipments (customer_id);

-- ===========================================================================
-- shipment_boxes (T-018). sscc varchar(18), 18-digit CHECK, UNIQUE per org.
-- ===========================================================================
create table if not exists public.shipment_boxes (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  site_id          uuid,  -- day-1 nullable scoping column (no FK; 14-MS T-030 adds (org_id, site_id) scoping)
  shipment_id      uuid not null references public.shipments(id) on delete cascade,
  box_number       integer not null,
  sscc             varchar(18),
  weight_kg        numeric(10, 3),
  actual_weight_kg numeric(10, 3),
  length_cm        numeric(8, 2),
  width_cm         numeric(8, 2),
  height_cm        numeric(8, 2),
  tracking_number  text,
  ext_data         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default pg_catalog.now(),
  created_by       uuid,
  updated_at       timestamptz not null default pg_catalog.now(),
  updated_by       uuid,
  deleted_at       timestamptz,
  constraint shipment_boxes_sscc_check check (sscc is null or sscc ~ '^[0-9]{18}$')
);
create unique index if not exists shipment_boxes_org_sscc_uq on public.shipment_boxes (org_id, sscc);
create index if not exists shipment_boxes_org_idx on public.shipment_boxes (org_id);
create index if not exists shipment_boxes_org_site_idx on public.shipment_boxes (org_id, site_id);
create index if not exists shipment_boxes_shipment_idx on public.shipment_boxes (shipment_id);

-- ===========================================================================
-- shipment_box_contents (T-018). license_plate_id soft FK to 05 (consumed via warehouse.lp.ship).
-- ===========================================================================
create table if not exists public.shipment_box_contents (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  site_id             uuid,  -- day-1 nullable scoping column (no FK; 14-MS T-030 adds (org_id, site_id) scoping)
  shipment_box_id     uuid not null references public.shipment_boxes(id) on delete cascade,
  sales_order_line_id uuid references public.sales_order_lines(id) on delete set null,
  product_id          uuid,
  license_plate_id    uuid,
  lot_number          text,
  quantity            numeric(14, 3),
  actual_weight_kg    numeric(10, 3),
  ext_data            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default pg_catalog.now(),
  created_by          uuid,
  updated_at          timestamptz not null default pg_catalog.now(),
  updated_by          uuid,
  deleted_at          timestamptz
);
create index if not exists shipment_box_contents_org_idx on public.shipment_box_contents (org_id);
create index if not exists shipment_box_contents_org_site_idx on public.shipment_box_contents (org_id, site_id);
create index if not exists shipment_box_contents_box_idx on public.shipment_box_contents (shipment_box_id);
create index if not exists shipment_box_contents_lp_idx
  on public.shipment_box_contents (org_id, license_plate_id);

-- ===========================================================================
-- bill_of_lading (BOL slice of T-023). BRCGS §14.4: SHA-256 hash + 7y retention.
-- retention_until = COALESCE(signed_at, created_at) + 7y, trigger-maintained.
-- ===========================================================================
create table if not exists public.bill_of_lading (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  site_id           uuid,
  bol_seq           bigint not null default nextval('public.bol_seq'),
  bol_number        text, -- 'BOL-YYYY-NNNNN' populated by bill_of_lading_set_number BEFORE INSERT trigger.
  shipment_id       uuid not null references public.shipments(id) on delete restrict,
  status            text not null default 'draft',
  carrier           text,
  pro_number        text,
  pdf_url           text,
  pdf_sha256        char(64),
  signed_pdf_url    text,
  signed_pdf_sha256 char(64),
  signed_at         timestamptz,
  signed_by         uuid,
  issued_at         timestamptz,
  retention_until   date default ((pg_catalog.now()::date) + interval '7 years')::date,
  ext_data          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default pg_catalog.now(),
  created_by        uuid,
  updated_at        timestamptz not null default pg_catalog.now(),
  updated_by        uuid,
  deleted_at        timestamptz,
  constraint bill_of_lading_status_check check (status in ('draft', 'issued', 'signed', 'cancelled'))
);
create unique index if not exists bill_of_lading_org_number_uq on public.bill_of_lading (org_id, bol_number);
create index if not exists bill_of_lading_org_idx on public.bill_of_lading (org_id);
create index if not exists bill_of_lading_shipment_idx on public.bill_of_lading (shipment_id);

-- bill_of_lading retention_until (BRCGS 7y from COALESCE(signed_at, created_at)) — trigger-maintained
-- (timestamptz::date + interval is not immutable, so not a GENERATED STORED column).
create or replace function public.bill_of_lading_set_updated_at_retention()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  new.retention_until := (coalesce(new.signed_at, new.created_at)::date + interval '7 years')::date;
  return new;
end;
$$;

-- ===========================================================================
-- sscc_counters + SSCC functions (T-018, §13.1).
--   next_sscc_serial(org)  — atomic per-org serial (row-locked UPDATE ... RETURNING; no gaps).
--   sscc_mod10(sscc17)     — GS1 mod-10 check digit (server-side only; V-SHIP-LBL-03).
--   generate_sscc(org,ext) — 18-digit SSCC: ext(1) + gs1_prefix(7) + serial(9) + mod10.
-- ===========================================================================
create table if not exists public.sscc_counters (
  org_id      uuid primary key references public.organizations(id) on delete cascade,
  last_serial bigint not null default 0,
  updated_at  timestamptz not null default pg_catalog.now()
);

create or replace function public.next_sscc_serial(p_org_id uuid)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_serial bigint;
begin
  -- Insert-on-first-call then atomic increment via UPDATE ... RETURNING (row lock = no gaps,
  -- no duplicates under concurrency). NEVER nextval() — that is a global sequence, not per-org.
  insert into public.sscc_counters (org_id) values (p_org_id)
    on conflict (org_id) do nothing;
  update public.sscc_counters
     set last_serial = last_serial + 1,
         updated_at  = pg_catalog.now()
   where org_id = p_org_id
   returning last_serial into v_serial;
  return v_serial;
end;
$$;

create or replace function public.sscc_mod10(p_sscc17 text)
returns integer
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_sum    integer := 0;
  v_digit  integer;
  v_weight integer;
  i        integer;
begin
  if p_sscc17 is null or p_sscc17 !~ '^[0-9]{17}$' then
    raise exception 'sscc_mod10: input must be exactly 17 digits';
  end if;
  -- GS1 SSCC-18 check digit: weight the 17 digits 3,1,3,1,... from the LEFT, sum, then the
  -- check digit is (10 - (sum mod 10)) mod 10.
  for i in 1..17 loop
    v_digit  := substr(p_sscc17, i, 1)::integer;
    v_weight := case when (i % 2) = 1 then 3 else 1 end;
    v_sum    := v_sum + v_digit * v_weight;
  end loop;
  return (10 - (v_sum % 10)) % 10;
end;
$$;

create or replace function public.generate_sscc(p_org_id uuid, p_extension integer default 0)
returns varchar(18)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_prefix  text;
  v_serial  bigint;
  v_body    text;
  v_check   integer;
begin
  if p_extension is null or p_extension < 0 or p_extension > 9 then
    raise exception 'generate_sscc: extension digit must be 0-9';
  end if;
  -- gs1_prefix sourced from organizations (02-SETTINGS §12.1) — NEVER env config.
  select gs1_prefix into v_prefix from public.organizations where id = p_org_id;
  if v_prefix is null or v_prefix = '' then
    raise exception 'V-SHIP-PACK-03 missing GS1 company prefix for org %', p_org_id;
  end if;
  -- P1 enforces exactly 7-digit GS1 company prefix (V-SHIP-PACK-03 7-10; P2 widens).
  if v_prefix !~ '^[0-9]{7}$' then
    raise exception 'V-SHIP-PACK-03 GS1 company prefix must be exactly 7 digits (got %)', v_prefix;
  end if;
  v_serial := public.next_sscc_serial(p_org_id);
  -- body = ext(1) + prefix(7) + serial(9) = 17 digits.
  v_body  := p_extension::text || v_prefix || lpad(v_serial::text, 9, '0');
  v_check := public.sscc_mod10(v_body);
  return (v_body || v_check::text)::varchar(18);
end;
$$;

revoke all on function public.next_sscc_serial(uuid) from public;
revoke all on function public.generate_sscc(uuid, integer) from public;
grant execute on function public.next_sscc_serial(uuid) to app_user;
grant execute on function public.sscc_mod10(text) to app_user;
grant execute on function public.generate_sscc(uuid, integer) to app_user;

-- ===========================================================================
-- RLS + FORCE RLS + grants + updated_at triggers for every operational table.
-- Policies <table>_org_context USING/WITH CHECK (org_id = app.current_org_id()) — no GUC reads.
-- ===========================================================================
do $$
declare
  t text;
  shipping_tables text[] := array[
    'customers', 'customer_contacts', 'customer_addresses', 'customer_allergen_restrictions',
    'sales_orders', 'sales_order_lines', 'inventory_allocations',
    'waves', 'pick_lists', 'pick_list_lines',
    'shipments', 'shipment_boxes', 'shipment_box_contents', 'bill_of_lading'
  ];
begin
  foreach t in array shipping_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_org_context', t);
    execute format(
      'create policy %I on public.%I for all to app_user using (org_id = app.current_org_id()) with check (org_id = app.current_org_id())',
      t || '_org_context', t
    );
    execute format('revoke all on public.%I from public', t);
    execute format('revoke all on public.%I from app_user', t);
    execute format('grant select, insert, update, delete on public.%I to app_user', t);
  end loop;
end
$$;

-- bill_of_lading uses the retention-maintaining trigger (insert + update); the rest use the plain
-- updated_at trigger (update only).
drop trigger if exists bill_of_lading_set_updated_at on public.bill_of_lading;
create trigger bill_of_lading_set_updated_at
  before insert or update on public.bill_of_lading
  for each row execute function public.bill_of_lading_set_updated_at_retention();

do $$
declare
  t text;
  plain_tables text[] := array[
    'customers', 'customer_contacts', 'customer_addresses', 'customer_allergen_restrictions',
    'sales_orders', 'sales_order_lines', 'inventory_allocations',
    'waves', 'pick_lists', 'pick_list_lines',
    'shipments', 'shipment_boxes', 'shipment_box_contents'
  ];
begin
  foreach t in array plain_tables loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.shipping_set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end
$$;

-- Human-readable number triggers (BEFORE INSERT, fire before the updated_at/retention triggers).
drop trigger if exists sales_orders_set_number on public.sales_orders;
create trigger sales_orders_set_number
  before insert on public.sales_orders
  for each row execute function public.shipping_set_sales_order_number();

drop trigger if exists waves_set_number on public.waves;
create trigger waves_set_number
  before insert on public.waves
  for each row execute function public.shipping_set_wave_number();

drop trigger if exists pick_lists_set_number on public.pick_lists;
create trigger pick_lists_set_number
  before insert on public.pick_lists
  for each row execute function public.shipping_set_pick_list_number();

drop trigger if exists shipments_set_number on public.shipments;
create trigger shipments_set_number
  before insert on public.shipments
  for each row execute function public.shipping_set_shipment_number();

drop trigger if exists bill_of_lading_set_number on public.bill_of_lading;
create trigger bill_of_lading_set_number
  before insert on public.bill_of_lading
  for each row execute function public.shipping_set_bol_number();

-- sscc_counters: org-scoped mutable per-org state. RLS ENABLED + FORCED with the app.current_org_id()
-- function-form policy (Wave0 lock; no GUC reads). Writes flow through the SECURITY DEFINER counter
-- functions (next_sscc_serial / generate_sscc) which run as the migration owner (postgres, implicit
-- BYPASSRLS) so they are unaffected by FORCE RLS and keep operating gap-free. app_user retains SELECT
-- (for inspection) but it is now RLS-scoped to the caller's org.
alter table public.sscc_counters enable row level security;
alter table public.sscc_counters force row level security;
drop policy if exists sscc_counters_org_context on public.sscc_counters;
create policy sscc_counters_org_context on public.sscc_counters
  for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.sscc_counters from public;
grant select on public.sscc_counters to app_user;

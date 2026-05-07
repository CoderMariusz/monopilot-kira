-- T-040: R13 org-scoped identity columns on lot/work_order/quality_event/shipment/bom_item placeholder tables
-- Migration: 0014_r13-placeholder-tables.sql
-- Depends on: 001-baseline.sql (organizations table), 002-rls-baseline.sql (app.current_org_id function)

-- ─── lot ──────────────────────────────────────────────────────────────────────

create table if not exists public.lot (
  id                  uuid          not null default gen_random_uuid() primary key,
  external_id         text,
  org_id              uuid          not null references public.organizations(id) on delete restrict,
  created_at          timestamptz   not null default now(),
  created_by_user     uuid,
  created_by_device   text,
  app_version         text,
  model_prediction_id uuid          null,
  epcis_event_id      uuid          null,
  schema_version      integer       not null default 1
);

create index if not exists lot_org_created_idx
  on public.lot (org_id, created_at desc);

alter table public.lot enable row level security;
alter table public.lot force row level security;

drop policy if exists lot_org_context on public.lot;
create policy lot_org_context
  on public.lot
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- ─── work_order ───────────────────────────────────────────────────────────────

create table if not exists public.work_order (
  id                  uuid          not null default gen_random_uuid() primary key,
  external_id         text,
  org_id              uuid          not null references public.organizations(id) on delete restrict,
  created_at          timestamptz   not null default now(),
  created_by_user     uuid,
  created_by_device   text,
  app_version         text,
  model_prediction_id uuid          null,
  epcis_event_id      uuid          null,
  schema_version      integer       not null default 1
);

create index if not exists work_order_org_created_idx
  on public.work_order (org_id, created_at desc);

alter table public.work_order enable row level security;
alter table public.work_order force row level security;

drop policy if exists work_order_org_context on public.work_order;
create policy work_order_org_context
  on public.work_order
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- ─── quality_event ────────────────────────────────────────────────────────────

create table if not exists public.quality_event (
  id                  uuid          not null default gen_random_uuid() primary key,
  external_id         text,
  org_id              uuid          not null references public.organizations(id) on delete restrict,
  created_at          timestamptz   not null default now(),
  created_by_user     uuid,
  created_by_device   text,
  app_version         text,
  model_prediction_id uuid          null,
  epcis_event_id      uuid          null,
  schema_version      integer       not null default 1
);

create index if not exists quality_event_org_created_idx
  on public.quality_event (org_id, created_at desc);

alter table public.quality_event enable row level security;
alter table public.quality_event force row level security;

drop policy if exists quality_event_org_context on public.quality_event;
create policy quality_event_org_context
  on public.quality_event
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- ─── shipment ─────────────────────────────────────────────────────────────────

create table if not exists public.shipment (
  id                  uuid          not null default gen_random_uuid() primary key,
  external_id         text,
  org_id              uuid          not null references public.organizations(id) on delete restrict,
  created_at          timestamptz   not null default now(),
  created_by_user     uuid,
  created_by_device   text,
  app_version         text,
  model_prediction_id uuid          null,
  epcis_event_id      uuid          null,
  schema_version      integer       not null default 1
);

create index if not exists shipment_org_created_idx
  on public.shipment (org_id, created_at desc);

alter table public.shipment enable row level security;
alter table public.shipment force row level security;

drop policy if exists shipment_org_context on public.shipment;
create policy shipment_org_context
  on public.shipment
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- ─── bom_item ─────────────────────────────────────────────────────────────────

create table if not exists public.bom_item (
  id                  uuid          not null default gen_random_uuid() primary key,
  external_id         text,
  org_id              uuid          not null references public.organizations(id) on delete restrict,
  created_at          timestamptz   not null default now(),
  created_by_user     uuid,
  created_by_device   text,
  app_version         text,
  model_prediction_id uuid          null,
  epcis_event_id      uuid          null,
  schema_version      integer       not null default 1
);

create index if not exists bom_item_org_created_idx
  on public.bom_item (org_id, created_at desc);

alter table public.bom_item enable row level security;
alter table public.bom_item force row level security;

drop policy if exists bom_item_org_context on public.bom_item;
create policy bom_item_org_context
  on public.bom_item
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

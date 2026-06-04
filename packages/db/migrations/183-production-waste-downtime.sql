-- Migration 183: 08-Production — wo_waste_log + downtime_events (+ downtime_source_enum) + the
-- 02-Settings category shell tables they FK into.
-- PRD: docs/prd/08-PRODUCTION-PRD.md §9.5, §9.6, §16.4 V-PROD-05/06/19/22, §5.5.
-- Tasks: _meta/atomic-tasks/08-production/tasks/T-004.json (wo_waste_log),
--        _meta/atomic-tasks/08-production/tasks/T-005.json (downtime_events).
--
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id().
--   The PRD prose still says "tenant_id" — legacy; the Wave0 v4.3 column lock binds the
--   physical column to org_id (_meta/audits/2026-05-14-tenant-context-remediation.md).
-- site_id day-1: site_id uuid nullable, no FK, no registry — the full per-site scoping lands
--   later via the cross-module multi-site backfill. The column exists so rows can be tagged.
-- NUMERIC-exact: qty_kg NUMERIC(12,3) (never float).
-- Retention: wo_waste_log is a 3-year-retention operational log (§5.5) — enforced by the
--   cross-module retention sweeper, noted here for provenance.
--
-- Category FK targets: waste_categories / downtime_categories are 02-Settings reference tables
--   (§8 reference data). 02-Settings has not yet shipped them in the migration chain, so this
--   migration creates the org-scoped SHELL tables (create table if not exists — no seed; the
--   Apex category seed remains 02-Settings' responsibility) purely so the production FKs in
--   V-PROD-05 can exist. They are idempotent and additive; 02-Settings can later extend them.

-- ===========================================================================
-- 02-Settings reference shells: waste_categories + downtime_categories.
-- Minimal org-scoped lookup shape (id, org_id, code, name, is_active). RLS-forced.
-- ===========================================================================
create table if not exists public.waste_categories (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.organizations(id) on delete cascade,
  site_id   uuid,
  code      text not null,
  name      text not null,
  is_active boolean not null default true,
  ext_jsonb jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint waste_categories_org_code_unique unique (org_id, code)
);

create index if not exists idx_waste_categories_org on public.waste_categories (org_id);

alter table public.waste_categories enable row level security;
alter table public.waste_categories force row level security;
drop policy if exists waste_categories_org_context on public.waste_categories;
create policy waste_categories_org_context
  on public.waste_categories
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.waste_categories from public;
revoke all on public.waste_categories from app_user;
grant select, insert, update, delete on public.waste_categories to app_user;

create table if not exists public.downtime_categories (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.organizations(id) on delete cascade,
  site_id   uuid,
  code      text not null,
  name      text not null,
  kind      text not null default 'unplanned',
  is_active boolean not null default true,
  ext_jsonb jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint downtime_categories_org_code_unique unique (org_id, code),
  constraint downtime_categories_kind_check check (
    kind in ('planned', 'unplanned', 'changeover')
  )
);

create index if not exists idx_downtime_categories_org on public.downtime_categories (org_id);

alter table public.downtime_categories enable row level security;
alter table public.downtime_categories force row level security;
drop policy if exists downtime_categories_org_context on public.downtime_categories;
create policy downtime_categories_org_context
  on public.downtime_categories
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.downtime_categories from public;
revoke all on public.downtime_categories from app_user;
grant select, insert, update, delete on public.downtime_categories to app_user;

-- ===========================================================================
-- wo_waste_log (T-004, §9.5) — categorized waste capture.
-- ===========================================================================
create table if not exists public.wo_waste_log (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid not null,                                       -- R14 idempotency key
  org_id          uuid not null references public.organizations(id) on delete cascade,
  site_id         uuid,                                                -- site_id day-1
  wo_id           uuid not null references public.work_orders(id) on delete cascade,
  category_id     uuid not null references public.waste_categories(id) on delete restrict, -- V-PROD-05
  qty_kg          numeric(12, 3) not null,
  reason_code     text,
  reason_notes    text,
  operator_id     uuid references public.users(id) on delete restrict,
  shift_id        text not null,                                       -- V-PROD-19
  approved_by     uuid references public.users(id) on delete restrict,
  scan_event_id   uuid,                                                -- soft ref to 06-scanner
  recorded_at     timestamptz not null default pg_catalog.now(),
  created_at      timestamptz not null default pg_catalog.now(),
  updated_at      timestamptz not null default pg_catalog.now(),

  constraint wo_waste_log_transaction_id_unique unique (transaction_id),
  constraint wo_waste_log_qty_kg_positive_check check (qty_kg > 0)     -- V-PROD-05 red-line
);

create index if not exists idx_waste_wo on public.wo_waste_log (wo_id);
create index if not exists idx_waste_category_time on public.wo_waste_log (category_id, recorded_at);
create index if not exists idx_waste_tenant_time on public.wo_waste_log (org_id, recorded_at);

alter table public.wo_waste_log enable row level security;
alter table public.wo_waste_log force row level security;
drop policy if exists wo_waste_log_org_context on public.wo_waste_log;
create policy wo_waste_log_org_context
  on public.wo_waste_log
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.wo_waste_log from public;
revoke all on public.wo_waste_log from app_user;
grant select, insert, update, delete on public.wo_waste_log to app_user;

create or replace function public.production_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists wo_waste_log_set_updated_at on public.wo_waste_log;
create trigger wo_waste_log_set_updated_at
  before update on public.wo_waste_log
  for each row execute function public.production_set_updated_at();

-- ===========================================================================
-- downtime_source_enum + downtime_events (T-005, §9.6).
-- ===========================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'downtime_source_enum') then
    create type public.downtime_source_enum as enum ('manual', 'wo_pause', 'plc_auto', 'changeover');
  end if;
end
$$;

create table if not exists public.downtime_events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  site_id       uuid,                                                  -- site_id day-1
  line_id       text not null,
  wo_id         uuid references public.work_orders(id) on delete set null, -- nullable; V-PROD-22 at API
  category_id   uuid not null references public.downtime_categories(id) on delete restrict,
  source        public.downtime_source_enum not null,

  started_at    timestamptz not null,
  ended_at      timestamptz,
  -- V-PROD-06: GENERATED minute-difference, STORED, NULL while open. Never user-settable.
  duration_min  integer generated always as (
    case
      when ended_at is not null then (extract(epoch from ended_at - started_at) / 60)::integer
    end
  ) stored,

  shift_id      text,
  operator_id   uuid references public.users(id) on delete set null,
  reason_notes  text,
  plc_fault_code text,
  mwo_id        uuid,                                                  -- soft ref to 13-maintenance
  recorded_by   uuid references public.users(id) on delete set null,
  recorded_at   timestamptz not null default pg_catalog.now(),
  ext_jsonb     jsonb not null default '{}'::jsonb
);

create index if not exists idx_downtime_line_time on public.downtime_events (line_id, started_at);
create index if not exists idx_downtime_category on public.downtime_events (category_id);
create index if not exists idx_downtime_wo on public.downtime_events (wo_id) where wo_id is not null;
create index if not exists idx_downtime_mwo on public.downtime_events (mwo_id) where mwo_id is not null;
-- Partial open-event index (V-PROD-06 lookups of currently-open downtime).
create index if not exists idx_downtime_open on public.downtime_events (org_id, line_id) where ended_at is null;

alter table public.downtime_events enable row level security;
alter table public.downtime_events force row level security;
drop policy if exists downtime_events_org_context on public.downtime_events;
create policy downtime_events_org_context
  on public.downtime_events
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.downtime_events from public;
revoke all on public.downtime_events from app_user;
grant select, insert, update, delete on public.downtime_events to app_user;

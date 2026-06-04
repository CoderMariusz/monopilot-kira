-- Migration 188: 03-Technical T-031 — catch-weight variance nightly results table
--                + soft work_order_items weighing source.
-- PRD: docs/prd/03-TECHNICAL-PRD.md §8.1, §8.5, §8.6 ; task _meta/atomic-tasks/03-technical/tasks/T-031.json
--
-- Wave0 lock: org_id is the business scope; RLS via app.current_org_id().
-- site_id day-1: nullable uuid, NO FK / NO registry (registry is added later by 14-multi-site).
--
-- CANONICAL-OWNER NOTE (do NOT cross): the per-unit weight-capture table
-- public.work_order_items (actual_weight) is 08-PRODUCTION canonical (PRD §8.3
-- line 763). It does not exist yet. T-031 is READ-ONLY against it. We create a
-- MINIMAL `create table if not exists` shell here purely as the variance job's
-- read source so the nightly cron is runnable on a real DB; when 08-PRODUCTION
-- ships its canonical version, the `if not exists` makes this a no-op and the
-- canonical columns win. This migration NEVER writes work_order_items rows.
--
-- The results table public.catch_weight_variance_daily IS Technical-owned: it
-- records the nightly per-(org,item,day) variance roll-up + sample stats. An
-- alert outbox event 'catch_weight.variance_exceeded' is emitted by the job
-- (lib + cron route) when avg variance exceeds the org's catch_weight_variance_pct
-- threshold (Reference.AlertThresholds, default 5% seeded by migration 167).
--
-- Idempotent: create table if not exists + drop policy if exists + recreate.

-- ============================================================================
-- 1. work_order_items — SOFT read source (08-PRODUCTION canonical owner).
--    Minimal shell: enough columns for the variance computation. `if not exists`
--    so the canonical 08-PRODUCTION migration supersedes this without conflict.
-- ============================================================================
create table if not exists public.work_order_items (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  site_id       uuid,                                   -- day-1 nullable, no FK / no registry
  work_order_id uuid,                                   -- soft uuid; canonical FK lives in 08-PRODUCTION
  item_id       uuid references public.items(id) on delete restrict,
  nominal_weight numeric(10, 4),                        -- label target (mirrors items.nominal_weight)
  actual_weight numeric(10, 4),                         -- per-unit scale capture (PRD §8.3)
  captured_at   timestamptz not null default pg_catalog.now(),
  created_at    timestamptz not null default pg_catalog.now()
);

create index if not exists idx_work_order_items_org_item_captured
  on public.work_order_items (org_id, item_id, captured_at);
create index if not exists idx_work_order_items_org_wo
  on public.work_order_items (org_id, work_order_id)
  where work_order_id is not null;

alter table public.work_order_items enable row level security;
alter table public.work_order_items force row level security;

drop policy if exists work_order_items_org_context_select on public.work_order_items;
create policy work_order_items_org_context_select
  on public.work_order_items
  for select
  to app_user
  using (org_id = app.current_org_id());

drop policy if exists work_order_items_org_context_insert on public.work_order_items;
create policy work_order_items_org_context_insert
  on public.work_order_items
  for insert
  to app_user
  with check (org_id = app.current_org_id());

drop policy if exists work_order_items_org_context_update on public.work_order_items;
create policy work_order_items_org_context_update
  on public.work_order_items
  for update
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists work_order_items_org_context_delete on public.work_order_items;
create policy work_order_items_org_context_delete
  on public.work_order_items
  for delete
  to app_user
  using (org_id = app.current_org_id());

revoke all on public.work_order_items from public;
grant select, insert, update, delete on public.work_order_items to app_user;

comment on table public.work_order_items is
  'SOFT read source for T-031 catch-weight variance. 08-PRODUCTION is the canonical '
  'owner of per-unit weight capture (actual_weight, PRD §8.3); this minimal shell exists '
  'only so the variance nightly job is runnable. created via IF NOT EXISTS — superseded by '
  'the 08-PRODUCTION canonical migration when it ships.';

-- ============================================================================
-- 2. catch_weight_variance_daily — Technical-owned nightly roll-up results.
-- ============================================================================
create table if not exists public.catch_weight_variance_daily (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  site_id         uuid,                                 -- day-1 nullable, no FK / no registry
  item_id         uuid not null references public.items(id) on delete restrict,
  day             date not null,
  avg_variance_pct numeric(7, 4) not null,              -- percent (0.0000-100.0000)
  stddev          numeric(10, 4),                       -- stddev of per-unit variance%
  samples         integer not null,
  threshold_pct   numeric(7, 4),                        -- the org threshold this row was scored against
  alerted         boolean not null default false,       -- did this roll-up breach the threshold
  computed_at     timestamptz not null default pg_catalog.now(),

  constraint cwv_daily_samples_positive_check check (samples >= 0),
  constraint cwv_daily_avg_variance_nonneg_check check (avg_variance_pct >= 0),
  constraint cwv_daily_stddev_nonneg_check check (stddev is null or stddev >= 0)
);

-- One roll-up row per org/item/day (re-running the job upserts).
create unique index if not exists catch_weight_variance_daily_org_item_day_uq
  on public.catch_weight_variance_daily (org_id, item_id, day);
create index if not exists idx_cwv_daily_org_day
  on public.catch_weight_variance_daily (org_id, day);
create index if not exists idx_cwv_daily_org_site
  on public.catch_weight_variance_daily (org_id, site_id);

alter table public.catch_weight_variance_daily enable row level security;
alter table public.catch_weight_variance_daily force row level security;

drop policy if exists catch_weight_variance_daily_org_context_select on public.catch_weight_variance_daily;
create policy catch_weight_variance_daily_org_context_select
  on public.catch_weight_variance_daily
  for select
  to app_user
  using (org_id = app.current_org_id());

drop policy if exists catch_weight_variance_daily_org_context_insert on public.catch_weight_variance_daily;
create policy catch_weight_variance_daily_org_context_insert
  on public.catch_weight_variance_daily
  for insert
  to app_user
  with check (org_id = app.current_org_id());

drop policy if exists catch_weight_variance_daily_org_context_update on public.catch_weight_variance_daily;
create policy catch_weight_variance_daily_org_context_update
  on public.catch_weight_variance_daily
  for update
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists catch_weight_variance_daily_org_context_delete on public.catch_weight_variance_daily;
create policy catch_weight_variance_daily_org_context_delete
  on public.catch_weight_variance_daily
  for delete
  to app_user
  using (org_id = app.current_org_id());

revoke all on public.catch_weight_variance_daily from public;
grant select, insert, update, delete on public.catch_weight_variance_daily to app_user;

comment on table public.catch_weight_variance_daily is
  'T-031: nightly per-(org,item,day) catch-weight variance roll-up (avg variance%, stddev, samples). '
  'Technical-owned. The nightly cron emits catch_weight.variance_exceeded when avg_variance_pct '
  'exceeds the org Reference.AlertThresholds catch_weight_variance_pct (default 5%).';

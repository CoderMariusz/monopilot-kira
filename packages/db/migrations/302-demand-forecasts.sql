-- Migration 302: Wave E6 (second slice) — demand_forecasts.
-- Independent demand input for MRP: one qty per (item, ISO-week) bucket, in the item's BASE UoM.
-- runMrp already nets dependent (WO-material) demand; this table is the seam for INDEPENDENT
-- demand (sales/forecast) so the planner can drive net requirements without a live WO yet.
--
-- PRD lineage: 04-PLANNING-BASIC §4 (MRP/MPS basic; demand source = 'forecast' — see
--   mrp_runs_demand_source_check in migration 178). reorder_thresholds (mig 178) is the sibling
--   per-item config table this DDL mirrors for RLS / grants / updated_at.
--
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id().
-- NUMERIC-exact for the quantity column (never an inexact binary numeric type).
-- site_id is the day-1 nullable column (no FK / registry) — full per-site scoping lands later via
--   14-multi-site; the RLS predicate stays org-only for now (identical to mig 178).
-- items FK is concrete (items master is merged, migration 153); created_by references public.users.
-- Idempotent: re-runnable (create-if-not-exists + drop-if-exists policies/triggers).

-- ============================================================================
-- 1. demand_forecasts — independent demand per item per ISO-week (base UoM)
-- ============================================================================
create table if not exists public.demand_forecasts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  site_id     uuid,
  item_id     uuid not null references public.items(id) on delete cascade,
  iso_week    text not null,                 -- e.g. '2026-W25' (ISO-8601 week)
  qty         numeric(18, 6) not null,       -- in the item's BASE UoM (conversions via lib/uom only)
  uom         text not null,                 -- snapshot of items.uom_base at write time
  source      text not null default 'manual',
  created_by  uuid references public.users(id) on delete restrict,
  created_at  timestamptz not null default pg_catalog.now(),
  updated_at  timestamptz not null default pg_catalog.now(),

  constraint demand_forecasts_org_item_week_unique unique (org_id, item_id, iso_week),
  constraint demand_forecasts_qty_nonnegative_check check (qty >= 0),
  constraint demand_forecasts_source_check check (source in ('manual', 'import')),
  constraint demand_forecasts_iso_week_format_check check (iso_week ~ '^\d{4}-W\d{2}$')
);

create index if not exists idx_demand_forecasts_org_item_week
  on public.demand_forecasts (org_id, item_id, iso_week);
create index if not exists idx_demand_forecasts_org_week
  on public.demand_forecasts (org_id, iso_week);
create index if not exists idx_demand_forecasts_item
  on public.demand_forecasts (item_id);
create index if not exists idx_demand_forecasts_created_by
  on public.demand_forecasts (created_by)
  where created_by is not null;

-- ============================================================================
-- 2. RLS enable + force (org-only predicate; site_id day-1 nullable) — mirrors mig 178
-- ============================================================================
alter table public.demand_forecasts enable row level security;
alter table public.demand_forecasts force  row level security;

drop policy if exists demand_forecasts_org_isolation on public.demand_forecasts;
create policy demand_forecasts_org_isolation on public.demand_forecasts
  for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- ============================================================================
-- 3. Grants — fail-closed default; DML only to app_user (mirrors mig 178)
-- ============================================================================
revoke all on public.demand_forecasts from public;
revoke all on public.demand_forecasts from app_user;
grant select, insert, update, delete on public.demand_forecasts to app_user;

-- ============================================================================
-- 4. updated_at trigger (reuses the planning helper installed by migration 178)
-- ============================================================================
drop trigger if exists demand_forecasts_set_updated_at on public.demand_forecasts;
create trigger demand_forecasts_set_updated_at
  before update on public.demand_forecasts
  for each row execute function public.planning_mrp_set_updated_at();

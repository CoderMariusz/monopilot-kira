-- Migration 160: 03-Technical — item_cost_history (cost rolls per item).
-- PRD: docs/prd/03-TECHNICAL-PRD.md §5.3, §11.1, §11.2 (T-003).
--
-- DUAL-OWNED with 10-finance: Technical owns the master cost edit + this history
-- table; Finance owns standard-cost/valuation/variance (NOT created here).
--
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id().
-- NUMERIC precision is MANDATORY for every cost column — never an inexact binary type.
-- currency stays CHAR(3) — ISO 4217 validated at the API layer (V-TEC-52).
-- source CHECK enforces the four allowed enum values.
-- site_id is day-1 nullable (no FK / registry) — the sites registry + backfill land
-- in 14-multi-site (T-030); the org-scoped RLS predicate stays org-only for now.
-- Do NOT back-fill items.cost_per_kg here — that runs in T-021 (cost API).

create table if not exists public.item_cost_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid,
  item_id uuid not null references public.items(id) on delete cascade,

  cost_per_kg numeric(10, 4) not null,
  currency char(3) not null default 'PLN',
  effective_from date not null default current_date,
  effective_to date,
  source text,

  created_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint item_cost_history_source_check check (
    source is null or source in ('manual', 'd365_sync', 'supplier_update', 'variance_roll')
  ),
  constraint item_cost_history_cost_per_kg_nonnegative_check check (
    cost_per_kg >= 0
  ),
  constraint item_cost_history_effective_range_check check (
    effective_to is null or effective_to >= effective_from
  )
);

-- AC2: active-cost lookup ordered effective_from DESC; also covers the item_id FK.
create index if not exists idx_item_cost_active
  on public.item_cost_history (org_id, item_id, effective_from desc);

alter table public.item_cost_history enable row level security;
alter table public.item_cost_history force row level security;

drop policy if exists item_cost_history_org_isolation on public.item_cost_history;
create policy item_cost_history_org_isolation
  on public.item_cost_history
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.item_cost_history from public;
revoke all on public.item_cost_history from app_user;
grant select, insert, update, delete on public.item_cost_history to app_user;

create or replace function public.item_cost_history_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists item_cost_history_set_updated_at on public.item_cost_history;
create trigger item_cost_history_set_updated_at
  before update on public.item_cost_history
  for each row execute function public.item_cost_history_set_updated_at();

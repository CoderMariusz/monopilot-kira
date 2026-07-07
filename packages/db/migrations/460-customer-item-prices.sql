-- Migration 460 — per-customer item sell prices (C5c / NN-SET-3).
--
-- Sales-order line unit_price_gbp resolves via resolveSalesLinePrice():
--   1. Active customer_item_prices row (effective window covers pricing date, currency GBP)
--   2. items.list_price_gbp
--   3. 0
-- Multiple rows per (customer, item) are versioned by effective_from; the latest
-- effective_from still in-window wins (DISTINCT ON in the resolver query).
--
-- ADDITIVE, idempotent. Money: numeric(12,4) non-negative, matches SO line scale.

create table if not exists public.customer_item_prices (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  site_id         uuid,
  customer_id     uuid not null references public.customers(id) on delete cascade,
  item_id         uuid not null references public.items(id) on delete restrict,
  unit_price      numeric(12, 4) not null,
  currency        text not null default 'GBP',
  effective_from  date not null default current_date,
  effective_to    date,
  created_at      timestamptz not null default pg_catalog.now(),
  created_by      uuid references public.users(id) on delete set null,
  updated_at      timestamptz not null default pg_catalog.now(),
  updated_by      uuid references public.users(id) on delete set null,
  deleted_at      timestamptz,
  constraint customer_item_prices_unit_price_nonneg check (unit_price >= 0),
  constraint customer_item_prices_effective_window_check
    check (effective_to is null or effective_to >= effective_from),
  constraint customer_item_prices_org_customer_item_eff_uq
    unique (org_id, customer_id, item_id, effective_from)
);

create index if not exists customer_item_prices_org_customer_item_idx
  on public.customer_item_prices (org_id, customer_id, item_id, effective_from desc);

create index if not exists customer_item_prices_org_item_idx
  on public.customer_item_prices (org_id, item_id);

alter table public.customer_item_prices enable row level security;
alter table public.customer_item_prices force row level security;

drop policy if exists customer_item_prices_org_isolation on public.customer_item_prices;
create policy customer_item_prices_org_isolation on public.customer_item_prices
  for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.customer_item_prices from public;
revoke all on public.customer_item_prices from app_user;
grant select, insert, update, delete on public.customer_item_prices to app_user;

drop trigger if exists customer_item_prices_set_updated_at on public.customer_item_prices;
create trigger customer_item_prices_set_updated_at
  before update on public.customer_item_prices
  for each row execute function public.planning_mrp_set_updated_at();

do $$
begin
  raise notice 'migration 460: customer_item_prices table ready (rows=%)',
    (select count(*) from public.customer_item_prices);
end $$;

-- Migration 153: 03-Technical — items universal master table.
-- PRD: docs/prd/03-TECHNICAL-PRD.md §5.1, §6.1, §6.4.
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id().
-- D365 fields are soft integration mirrors only; no D365 FK is introduced.

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  item_code text not null,
  item_type text not null,
  name text not null,
  description text,
  status text not null default 'active',

  product_group text,
  uom_base text not null,
  uom_secondary text,
  gs1_gtin text,

  weight_mode text not null default 'fixed',
  nominal_weight numeric(10, 4),
  tare_weight numeric(10, 4),
  gross_weight_max numeric(10, 4),
  variance_tolerance_pct numeric(5, 2) default 5.00,

  shelf_life_days integer,
  shelf_life_mode text default 'use_by',
  date_code_format text,

  cost_per_kg numeric(18, 6),

  d365_item_id text,
  d365_last_sync_at timestamptz,
  d365_sync_status text default 'unsynced',

  ext_jsonb jsonb not null default '{}'::jsonb,
  private_jsonb jsonb not null default '{}'::jsonb,

  schema_version integer not null default 1,
  created_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint items_org_item_code_unique unique (org_id, item_code),
  constraint items_item_type_check check (
    item_type in ('rm', 'intermediate', 'fg', 'co_product', 'byproduct')
  ),
  constraint items_status_check check (
    status in ('draft', 'active', 'deprecated', 'blocked')
  ),
  constraint items_weight_mode_check check (
    weight_mode in ('fixed', 'catch')
  ),
  constraint items_shelf_life_mode_check check (
    shelf_life_mode is null or shelf_life_mode in ('use_by', 'best_before')
  ),
  constraint items_d365_sync_status_check check (
    d365_sync_status is null or d365_sync_status in ('unsynced', 'synced', 'drift', 'error')
  ),
  constraint items_cost_per_kg_nonnegative_check check (
    cost_per_kg is null or cost_per_kg >= 0
  ),
  constraint items_weights_nonnegative_check check (
    (nominal_weight is null or nominal_weight >= 0)
    and (tare_weight is null or tare_weight >= 0)
    and (gross_weight_max is null or gross_weight_max >= 0)
  ),
  constraint items_variance_tolerance_pct_check check (
    variance_tolerance_pct is null
    or (variance_tolerance_pct >= 0 and variance_tolerance_pct <= 100)
  ),
  constraint items_shelf_life_days_check check (
    shelf_life_days is null or shelf_life_days >= 0
  ),
  constraint items_schema_version_check check (schema_version >= 1),
  constraint items_ext_jsonb_object_check check (jsonb_typeof(ext_jsonb) = 'object'),
  constraint items_private_jsonb_object_check check (jsonb_typeof(private_jsonb) = 'object')
);

create index if not exists idx_items_org_type
  on public.items (org_id, item_type, status);

create index if not exists idx_items_d365
  on public.items (org_id, d365_item_id)
  where d365_item_id is not null;

create index if not exists idx_items_ext_jsonb
  on public.items using gin (ext_jsonb);

alter table public.items enable row level security;
alter table public.items force row level security;

drop policy if exists items_org_isolation on public.items;
create policy items_org_isolation
  on public.items
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.items from public;
revoke all on public.items from app_user;
grant select, insert, update, delete on public.items to app_user;

create or replace function public.items_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists items_set_updated_at on public.items;
create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.items_set_updated_at();

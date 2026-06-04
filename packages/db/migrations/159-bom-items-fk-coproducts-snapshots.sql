-- Migration 159: T-002 — shared BOM SSOT extension.
-- PRD: docs/prd/03-TECHNICAL-PRD.md §0 (final decisions), §5.2, §7.1, §7.2.
-- Wave0 lock: org_id is the business scope; RLS via app.current_org_id() (never a raw GUC).
-- Day-1 multi-site rule: every NEW operational table carries site_id uuid NULL (no FK, no RLS
--   predicate change) so 14-multi-site/T-030 only backfills + ALTERs; reference tables exempt.
-- BOM is the ONE shared SSOT (bom_headers/bom_lines from migration 090). This migration ADDS:
--   1. bom_lines.item_id uuid FK -> public.items(id) for the canonical item master link
--      (component_code TEXT stays for display / back-compat).
--   2. bom_co_products: positive-value co-products + zero-value byproducts per BOM version.
--   3. bom_snapshots: immutable BOM snapshot captured at WO creation (ADR-002).
-- The bom_headers version state machine (draft -> in_review -> technical_approved -> active ->
--   superseded/archived) + approval columns already ship in migration 090; T-073 adds the
--   transition ENFORCEMENT. This migration only adds the related child tables + items FK.
-- D365 is integration only, never source of truth. No work_order FK here (lives in 08-PRODUCTION).

-- ---------------------------------------------------------------------------
-- 1. bom_lines.item_id — canonical item master FK (component_code kept for display)
-- ---------------------------------------------------------------------------
alter table public.bom_lines
  add column if not exists item_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bom_lines_item_id_fkey'
  ) then
    alter table public.bom_lines
      add constraint bom_lines_item_id_fkey
      foreign key (item_id) references public.items(id) on delete restrict;
  end if;
end
$$;

create index if not exists bom_lines_org_item_idx
  on public.bom_lines (org_id, item_id)
  where item_id is not null;

comment on column public.bom_lines.item_id
  is 'T-002: canonical item master FK (public.items). component_code TEXT is retained for display / back-compat; item_id is the authoritative component reference for the shared BOM SSOT.';

-- ---------------------------------------------------------------------------
-- 2. bom_co_products — co-products (positive value) + byproducts (zero value)
-- ---------------------------------------------------------------------------
create table if not exists public.bom_co_products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  bom_header_id uuid not null,
  co_product_item_id uuid not null references public.items(id) on delete restrict,
  quantity numeric(14, 6) not null,
  uom text not null,
  allocation_pct numeric(6, 3) not null,
  is_byproduct boolean not null default false,
  -- Day-1 multi-site: site_id NULL now; 14-multi-site/T-030 backfills + tightens to NOT NULL.
  site_id uuid,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  schema_version integer not null default 1,
  constraint bom_co_products_header_org_fk
    foreign key (bom_header_id, org_id)
    references public.bom_headers(id, org_id)
    on delete cascade,
  constraint bom_co_products_header_item_unique
    unique (bom_header_id, co_product_item_id),
  constraint bom_co_products_quantity_positive_check
    check (quantity > 0),
  constraint bom_co_products_allocation_pct_check
    check (allocation_pct >= 0 and allocation_pct <= 100.000),
  constraint bom_co_products_byproduct_allocation_check
    check (is_byproduct is false or allocation_pct = 0)
);

create index if not exists bom_co_products_org_header_idx
  on public.bom_co_products (org_id, bom_header_id);

create index if not exists bom_co_products_org_item_idx
  on public.bom_co_products (org_id, co_product_item_id);

create index if not exists bom_co_products_org_site_idx
  on public.bom_co_products (org_id, site_id);

create or replace function public.bom_co_products_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists bom_co_products_set_updated_at on public.bom_co_products;
create trigger bom_co_products_set_updated_at
  before update on public.bom_co_products
  for each row execute function public.bom_co_products_set_updated_at();

alter table public.bom_co_products enable row level security;
alter table public.bom_co_products force row level security;

drop policy if exists bom_co_products_org_context on public.bom_co_products;
create policy bom_co_products_org_context
  on public.bom_co_products
  for all
  to app_user
  using (
    org_id = app.current_org_id()
    and exists (
      select 1
      from public.bom_headers header
      where header.id = bom_header_id
        and header.org_id = app.current_org_id()
    )
  )
  with check (
    org_id = app.current_org_id()
    and exists (
      select 1
      from public.bom_headers header
      where header.id = bom_header_id
        and header.org_id = app.current_org_id()
    )
  );

revoke all on public.bom_co_products from public;
revoke all on public.bom_co_products from app_user;
grant select, insert, update, delete on public.bom_co_products to app_user;

-- ---------------------------------------------------------------------------
-- 3. bom_snapshots — immutable BOM snapshot at WO creation (ADR-002)
-- ---------------------------------------------------------------------------
-- work_order_id stays UUID nullable; FK is added by 08-PRODUCTION once work_orders exists.
create table if not exists public.bom_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  work_order_id uuid,
  bom_header_id uuid not null,
  snapshot_json jsonb not null,
  -- Day-1 multi-site: site_id NULL now; 14-multi-site/T-030 backfills + tightens to NOT NULL.
  site_id uuid,
  snapshot_at timestamptz not null default pg_catalog.now(),
  constraint bom_snapshots_header_org_fk
    foreign key (bom_header_id, org_id)
    references public.bom_headers(id, org_id)
    on delete restrict,
  constraint bom_snapshots_snapshot_json_object_check
    check (jsonb_typeof(snapshot_json) = 'object')
);

create index if not exists idx_bom_snapshots_wo
  on public.bom_snapshots (org_id, work_order_id);

create index if not exists bom_snapshots_org_header_idx
  on public.bom_snapshots (org_id, bom_header_id);

create index if not exists bom_snapshots_org_site_idx
  on public.bom_snapshots (org_id, site_id);

-- Snapshots are immutable: block UPDATE/DELETE so a captured WO BOM never drifts.
create or replace function public.bom_snapshots_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'bom_snapshots rows are immutable; insert a new snapshot instead of updating or deleting';
end;
$$;

drop trigger if exists bom_snapshots_reject_mutation on public.bom_snapshots;
create trigger bom_snapshots_reject_mutation
  before update or delete on public.bom_snapshots
  for each row execute function public.bom_snapshots_reject_mutation();

alter table public.bom_snapshots enable row level security;
alter table public.bom_snapshots force row level security;

drop policy if exists bom_snapshots_org_context on public.bom_snapshots;
create policy bom_snapshots_org_context
  on public.bom_snapshots
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.bom_snapshots from public;
revoke all on public.bom_snapshots from app_user;
-- No update/delete grant: immutability is enforced both by trigger and by withheld privileges.
grant select, insert on public.bom_snapshots to app_user;

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
comment on table public.bom_co_products
  is 'T-002: co-products (positive market value) + byproducts (is_byproduct=true, allocation_pct=0) per shared BOM version. Cost allocation_pct of parent + non-byproduct co-products sums to 100. Part of the shared BOM SSOT; D365 is integration only.';

comment on table public.bom_snapshots
  is 'T-002: immutable flattened BOM snapshot (header + lines + co-products) captured at WO creation (ADR-002). WO execution reads only its snapshot, never live bom_headers. work_order_id FK is added by 08-PRODUCTION. site_id is the Day-1 multi-site column. Shared BOM SSOT; D365 is integration only.';

comment on column public.bom_co_products.site_id
  is 'Day-1 multi-site column (uuid NULL). 14-multi-site/T-030 backfills + tightens to NOT NULL + composite (org_id, site_id) RLS. No FK / RLS predicate here.';

comment on column public.bom_snapshots.site_id
  is 'Day-1 multi-site column (uuid NULL). 14-multi-site/T-030 backfills + tightens to NOT NULL + composite (org_id, site_id) RLS. No FK / RLS predicate here.';

comment on column public.bom_snapshots.work_order_id
  is 'T-002: soft UUID reference to 08-PRODUCTION work_orders; FK is intentionally deferred to 08-PRODUCTION (table does not exist yet).';

-- Migration 042: Settings infrastructure/master data (T-009)
-- PRD: docs/prd/02-SETTINGS-PRD.md §5.6, §12.1.
-- Wave0: org_id business scope. RLS uses app.current_org_id().
-- Location path storage: target Postgres may not have the ltree extension; path is stored as text
-- using the ASCII '/' separator (for example WH1/ZONE/AISLE/RACK) with a text_pattern_ops
-- index so exact and prefix path lookups remain operational without hard-failing on missing ltree.

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  warehouse_type text not null,
  is_default boolean not null default false,
  address jsonb,
  created_at timestamptz default pg_catalog.now(),
  unique (org_id, code)
);

create index if not exists warehouses_org_idx on public.warehouses (org_id);

alter table public.warehouses enable row level security;
alter table public.warehouses force row level security;

drop policy if exists warehouses_org_context_select on public.warehouses;
create policy warehouses_org_context_select
  on public.warehouses
  for select
  to app_user
  using (org_id = app.current_org_id());

drop policy if exists warehouses_org_context_insert on public.warehouses;
create policy warehouses_org_context_insert
  on public.warehouses
  for insert
  to app_user
  with check (org_id = app.current_org_id());

drop policy if exists warehouses_org_context_update on public.warehouses;
create policy warehouses_org_context_update
  on public.warehouses
  for update
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists warehouses_org_context_delete on public.warehouses;
create policy warehouses_org_context_delete
  on public.warehouses
  for delete
  to app_user
  using (org_id = app.current_org_id());

revoke all on public.warehouses from public;
grant select, insert, update, delete on public.warehouses to app_user;

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  parent_id uuid references public.locations(id) on delete restrict,
  code text not null,
  name text not null,
  location_type text not null,
  level integer not null,
  path text not null,
  max_capacity numeric(18, 6),
  unique (org_id, code)
);

create index if not exists locations_org_idx on public.locations (org_id);
create index if not exists locations_warehouse_idx on public.locations (warehouse_id);
create index if not exists locations_path_idx on public.locations (path text_pattern_ops);
create index if not exists locations_org_path_idx on public.locations (org_id, path text_pattern_ops);

alter table public.locations enable row level security;
alter table public.locations force row level security;

drop policy if exists locations_org_context_select on public.locations;
create policy locations_org_context_select on public.locations
  for select to app_user
  using (org_id = app.current_org_id());

drop policy if exists locations_org_context_insert on public.locations;
create policy locations_org_context_insert on public.locations
  for insert to app_user
  with check (org_id = app.current_org_id());

drop policy if exists locations_org_context_update on public.locations;
create policy locations_org_context_update on public.locations
  for update to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists locations_org_context_delete on public.locations;
create policy locations_org_context_delete on public.locations
  for delete to app_user
  using (org_id = app.current_org_id());

revoke all on public.locations from public;
grant select, insert, update, delete on public.locations to app_user;

create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  machine_type text not null,
  status text not null default 'active',
  capacity_per_hour numeric(18, 6),
  specs jsonb not null default '{}'::jsonb,
  location_id uuid references public.locations(id) on delete set null,
  unique (org_id, code)
);

create index if not exists machines_org_idx on public.machines (org_id);
create index if not exists machines_location_idx on public.machines (location_id);

alter table public.machines enable row level security;
alter table public.machines force row level security;

drop policy if exists machines_org_context_select on public.machines;
create policy machines_org_context_select on public.machines
  for select to app_user
  using (org_id = app.current_org_id());

drop policy if exists machines_org_context_insert on public.machines;
create policy machines_org_context_insert on public.machines
  for insert to app_user
  with check (org_id = app.current_org_id());

drop policy if exists machines_org_context_update on public.machines;
create policy machines_org_context_update on public.machines
  for update to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists machines_org_context_delete on public.machines;
create policy machines_org_context_delete on public.machines
  for delete to app_user
  using (org_id = app.current_org_id());

revoke all on public.machines from public;
grant select, insert, update, delete on public.machines to app_user;

create table if not exists public.production_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  status text not null default 'active',
  default_location_id uuid references public.locations(id) on delete set null,
  unique (org_id, code)
);

create index if not exists production_lines_org_idx on public.production_lines (org_id);
create index if not exists production_lines_default_location_idx on public.production_lines (default_location_id);

alter table public.production_lines enable row level security;
alter table public.production_lines force row level security;

drop policy if exists production_lines_org_context_select on public.production_lines;
create policy production_lines_org_context_select on public.production_lines
  for select to app_user
  using (org_id = app.current_org_id());

drop policy if exists production_lines_org_context_insert on public.production_lines;
create policy production_lines_org_context_insert on public.production_lines
  for insert to app_user
  with check (org_id = app.current_org_id());

drop policy if exists production_lines_org_context_update on public.production_lines;
create policy production_lines_org_context_update on public.production_lines
  for update to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists production_lines_org_context_delete on public.production_lines;
create policy production_lines_org_context_delete on public.production_lines
  for delete to app_user
  using (org_id = app.current_org_id());

revoke all on public.production_lines from public;
grant select, insert, update, delete on public.production_lines to app_user;

create table if not exists public.line_machines (
  line_id uuid not null references public.production_lines(id) on delete cascade,
  machine_id uuid not null references public.machines(id) on delete cascade,
  sequence integer not null,
  primary key (line_id, machine_id)
);

create index if not exists line_machines_machine_idx on public.line_machines (machine_id);

revoke all on public.line_machines from public;
grant select, insert, update, delete on public.line_machines to app_user;

create table if not exists public.allergens (
  code text primary key,
  name text not null,
  name_pl text,
  name_de text,
  name_fr text,
  name_uk text,
  name_ro text,
  icon_url text,
  is_active boolean not null default true
);

revoke all on public.allergens from public;
grant select on public.allergens to app_user;

create table if not exists public.tax_codes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  rate numeric(5, 4) not null,
  country_code char(2),
  tax_type text,
  jurisdiction text,
  effective_from date,
  effective_to date,
  is_default boolean not null default false,
  unique (org_id, code, effective_from)
);

create index if not exists tax_codes_org_idx on public.tax_codes (org_id);

alter table public.tax_codes enable row level security;
alter table public.tax_codes force row level security;

drop policy if exists tax_codes_org_context_select on public.tax_codes;
create policy tax_codes_org_context_select on public.tax_codes
  for select to app_user
  using (org_id = app.current_org_id());

drop policy if exists tax_codes_org_context_insert on public.tax_codes;
create policy tax_codes_org_context_insert on public.tax_codes
  for insert to app_user
  with check (org_id = app.current_org_id());

drop policy if exists tax_codes_org_context_update on public.tax_codes;
create policy tax_codes_org_context_update on public.tax_codes
  for update to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists tax_codes_org_context_delete on public.tax_codes;
create policy tax_codes_org_context_delete on public.tax_codes
  for delete to app_user
  using (org_id = app.current_org_id());

revoke all on public.tax_codes from public;
grant select, insert, update, delete on public.tax_codes to app_user;

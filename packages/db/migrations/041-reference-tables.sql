-- Migration 041: Settings reference_tables generic storage (T-008)
-- PRD: docs/prd/02-SETTINGS-PRD.md §5.5, §8.4.
-- Wave0: org_id business scope. RLS uses app.current_org_id().

create table if not exists public.reference_tables (
  org_id uuid not null references public.organizations(id) on delete cascade,
  table_code text not null,
  row_key text not null,
  row_data jsonb not null,
  version integer not null default 1,
  is_active boolean not null default true,
  display_order integer default 0,
  created_by uuid references public.users(id),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (org_id, table_code, row_key)
);

create index if not exists reference_tables_org_table_idx on public.reference_tables (org_id, table_code);
create index if not exists reference_tables_org_active_idx on public.reference_tables (org_id, is_active);

alter table public.reference_tables enable row level security;
alter table public.reference_tables force row level security;

drop policy if exists reference_tables_org_context_select on public.reference_tables;
create policy reference_tables_org_context_select
  on public.reference_tables
  for select
  to app_user
  using (org_id = app.current_org_id());

drop policy if exists reference_tables_org_context_insert on public.reference_tables;
create policy reference_tables_org_context_insert
  on public.reference_tables
  for insert
  to app_user
  with check (org_id = app.current_org_id());

drop policy if exists reference_tables_org_context_update on public.reference_tables;
create policy reference_tables_org_context_update
  on public.reference_tables
  for update
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists reference_tables_org_context_delete on public.reference_tables;
create policy reference_tables_org_context_delete
  on public.reference_tables
  for delete
  to app_user
  using (org_id = app.current_org_id());

revoke all on public.reference_tables from public;
grant select, insert, update, delete on public.reference_tables to app_user;

create or replace function app.reference_tables_set_version()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.row_data is distinct from old.row_data then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists reference_tables_set_version on public.reference_tables;
create trigger reference_tables_set_version
  before update
  on public.reference_tables
  for each row
  execute function app.reference_tables_set_version();

revoke all on function app.reference_tables_set_version() from public;
grant execute on function app.reference_tables_set_version() to app_user;

create or replace function app.refresh_reference_table_mv(org_id uuid, table_code text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  mv_name text;
begin
  mv_name := format(
    'reference_table_mv_%s_%s',
    replace(refresh_reference_table_mv.org_id::text, '-', ''),
    regexp_replace(refresh_reference_table_mv.table_code, '[^a-zA-Z0-9_]+', '_', 'g')
  );

  if to_regclass(format('public.%I', mv_name)) is null then
    return false;
  end if;

  execute format('refresh materialized view public.%I', mv_name);
  return true;
end;
$$;

revoke all on function app.refresh_reference_table_mv(uuid, text) from public;
grant execute on function app.refresh_reference_table_mv(uuid, text) to app_user;

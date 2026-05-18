-- Migration 038: Settings schema metadata (T-005)
-- PRD: docs/prd/02-SETTINGS-PRD.md §5.2; ADR-028.
-- Wave0: org_id business scope. RLS uses app.current_org_id().

create table if not exists public.reference_schemas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id),
  table_code text not null,
  column_code text not null,
  dept_code text,
  data_type text not null constraint reference_schemas_data_type_check check (data_type in ('text', 'number', 'date', 'enum', 'formula', 'relation')),
  tier text not null constraint reference_schemas_tier_check check (tier in ('L1', 'L2', 'L3', 'L4')),
  storage text not null,
  dropdown_source text,
  blocking_rule text,
  required_for_done boolean not null default false,
  validation_json jsonb default '{}'::jsonb,
  presentation_json jsonb default '{}'::jsonb,
  schema_version int not null default 1,
  deprecated_at timestamptz,
  created_by uuid references public.users(id),
  created_at timestamptz default now(),
  unique (org_id, table_code, column_code)
);

create index if not exists reference_schemas_org_id_idx on public.reference_schemas (org_id);
create index if not exists reference_schemas_table_code_idx on public.reference_schemas (table_code);
create index if not exists reference_schemas_org_table_code_idx on public.reference_schemas (org_id, table_code);

alter table public.reference_schemas enable row level security;
alter table public.reference_schemas force row level security;

drop policy if exists reference_schemas_org_context_select on public.reference_schemas;
create policy reference_schemas_org_context_select
  on public.reference_schemas
  for select
  to app_user
  using (org_id = app.current_org_id());

drop policy if exists reference_schemas_org_context_insert on public.reference_schemas;
create policy reference_schemas_org_context_insert
  on public.reference_schemas
  for insert
  to app_user
  with check (org_id = app.current_org_id());

drop policy if exists reference_schemas_org_context_update on public.reference_schemas;
create policy reference_schemas_org_context_update
  on public.reference_schemas
  for update
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists reference_schemas_org_context_delete on public.reference_schemas;
create policy reference_schemas_org_context_delete
  on public.reference_schemas
  for delete
  to app_user
  using (org_id = app.current_org_id());

revoke all on public.reference_schemas from public;
grant select, insert, update, delete on public.reference_schemas to app_user;

create table if not exists public.schema_migrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id),
  table_code text not null default '__migration_runner__',
  column_code text,
  action text not null default 'runner_apply',
  tier_before text,
  tier_after text,
  migration_script text,
  approved_by uuid references public.users(id),
  approved_at timestamptz,
  executed_at timestamptz,
  status text not null default 'pending',
  result_notes text,
  created_at timestamptz default now(),
  filename text,
  applied_at timestamptz not null default now(),
  checksum text
);

alter table public.schema_migrations
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists org_id uuid references public.organizations(id),
  add column if not exists table_code text default '__migration_runner__',
  add column if not exists column_code text,
  add column if not exists action text default 'runner_apply',
  add column if not exists tier_before text,
  add column if not exists tier_after text,
  add column if not exists migration_script text,
  add column if not exists approved_by uuid references public.users(id),
  add column if not exists approved_at timestamptz,
  add column if not exists executed_at timestamptz,
  add column if not exists status text default 'pending',
  add column if not exists result_notes text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists filename text,
  add column if not exists applied_at timestamptz default now(),
  add column if not exists checksum text;

update public.schema_migrations
set
  id = coalesce(id, gen_random_uuid()),
  table_code = coalesce(table_code, '__migration_runner__'),
  action = coalesce(action, 'runner_apply'),
  status = coalesce(status, 'pending'),
  applied_at = coalesce(applied_at, now()),
  created_at = coalesce(created_at, now());

alter table public.schema_migrations
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column table_code set default '__migration_runner__',
  alter column table_code set not null,
  alter column action set default 'runner_apply',
  alter column action set not null,
  alter column status set default 'pending',
  alter column status set not null,
  alter column applied_at set default now(),
  alter column applied_at set not null,
  alter column created_at set default now();

do $$
begin
  if exists (
    select 1
    from pg_constraint c
    join unnest(c.conkey) with ordinality as k(attnum, ordinality) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.conrelid = 'public.schema_migrations'::regclass
      and c.contype = 'p'
      and c.conname = 'schema_migrations_pkey'
      and a.attname <> 'id'
  ) then
    alter table public.schema_migrations drop constraint schema_migrations_pkey;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.schema_migrations'::regclass
      and conname = 'schema_migrations_pkey'
  ) then
    alter table public.schema_migrations add constraint schema_migrations_pkey primary key (id);
  end if;
end $$;

create unique index if not exists schema_migrations_filename_unique
  on public.schema_migrations (filename)
  where filename is not null;
create index if not exists schema_migrations_org_id_idx on public.schema_migrations (org_id);
create index if not exists schema_migrations_table_code_idx on public.schema_migrations (table_code);
create index if not exists schema_migrations_org_table_code_idx on public.schema_migrations (org_id, table_code);

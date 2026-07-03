-- Migration 430 — WIP definitions platform (W3 L8).
-- Re-entrant additive foundation. Wave0 lock: org_id business scope; RLS via app.current_org_id().

create table if not exists public.wip_definitions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  name text not null,
  description text,
  base_uom text not null default 'kg',
  yield_pct numeric(6,3) not null default 100 check (yield_pct > 0 and yield_pct <= 100),
  version int not null default 1,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  reusable boolean not null default false,
  source_project_id uuid references public.npd_projects(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);

create unique index if not exists wip_definitions_org_lower_name_active_uq
  on public.wip_definitions (org_id, lower(name))
  where status <> 'archived';

create table if not exists public.wip_definition_ingredients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  wip_definition_id uuid not null,
  item_id uuid not null references public.items(id) on delete restrict,
  qty_per_unit numeric(14,6) not null check (qty_per_unit >= 0),
  uom text not null default 'kg',
  sequence int not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, wip_definition_id, item_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'wip_definition_ingredients_definition_org_fkey'
       and conrelid = 'public.wip_definition_ingredients'::regclass
  ) then
    alter table public.wip_definition_ingredients
      add constraint wip_definition_ingredients_definition_org_fkey
      foreign key (wip_definition_id, org_id)
      references public.wip_definitions (id, org_id)
      on delete cascade;
  end if;
end $$;

create table if not exists public.wip_definition_processes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  wip_definition_id uuid not null,
  process_name text not null,
  display_order int not null default 0,
  duration_hours numeric(10,4) not null default 0,
  additional_cost numeric(14,4) not null default 0,
  throughput_per_hour numeric(14,4),
  throughput_uom text,
  setup_cost numeric(14,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  constraint wip_definition_processes_duration_nonneg check (duration_hours >= 0),
  constraint wip_definition_processes_addcost_nonneg check (additional_cost >= 0),
  constraint wip_definition_processes_throughput_nonneg check (throughput_per_hour is null or throughput_per_hour >= 0),
  constraint wip_definition_processes_setup_cost_nonneg check (setup_cost >= 0)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'wip_definition_processes_definition_org_fkey'
       and conrelid = 'public.wip_definition_processes'::regclass
  ) then
    alter table public.wip_definition_processes
      add constraint wip_definition_processes_definition_org_fkey
      foreign key (wip_definition_id, org_id)
      references public.wip_definitions (id, org_id)
      on delete cascade;
  end if;
end $$;

create table if not exists public.wip_definition_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  process_id uuid not null,
  role_group text not null,
  headcount int not null default 1,
  rate_per_hour numeric(18,4),
  created_at timestamptz not null default now(),
  unique (org_id, process_id, role_group),
  constraint wip_definition_roles_headcount_pos check (headcount > 0),
  constraint wip_definition_roles_rate_nonneg check (rate_per_hour is null or rate_per_hour >= 0)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'wip_definition_roles_process_org_fkey'
       and conrelid = 'public.wip_definition_roles'::regclass
  ) then
    alter table public.wip_definition_roles
      add constraint wip_definition_roles_process_org_fkey
      foreign key (process_id, org_id)
      references public.wip_definition_processes (id, org_id)
      on delete cascade;
  end if;
end $$;

create table if not exists public.wip_definition_acks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  wip_definition_id uuid not null,
  npd_project_id uuid not null references public.npd_projects(id) on delete cascade,
  accepted_version int not null,
  accepted_by uuid,
  accepted_at timestamptz not null default now(),
  unique (org_id, wip_definition_id, npd_project_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'wip_definition_acks_definition_org_fkey'
       and conrelid = 'public.wip_definition_acks'::regclass
  ) then
    alter table public.wip_definition_acks
      add constraint wip_definition_acks_definition_org_fkey
      foreign key (wip_definition_id, org_id)
      references public.wip_definitions (id, org_id)
      on delete cascade;
  end if;
end $$;

alter table public.npd_wip_processes
  add column if not exists wip_definition_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'npd_wip_processes_wip_definition_org_fkey'
       and conrelid = 'public.npd_wip_processes'::regclass
  ) then
    alter table public.npd_wip_processes
      add constraint npd_wip_processes_wip_definition_org_fkey
      foreign key (wip_definition_id, org_id)
      references public.wip_definitions (id, org_id)
      on delete set null;
  end if;
end $$;

alter table public.formulation_ingredients
  add column if not exists wip_definition_id uuid references public.wip_definitions(id) on delete set null;

create index if not exists wip_definition_ingredients_org_definition_order_idx
  on public.wip_definition_ingredients (org_id, wip_definition_id, sequence);
create index if not exists wip_definition_processes_org_definition_order_idx
  on public.wip_definition_processes (org_id, wip_definition_id, display_order);
create index if not exists wip_definition_roles_org_process_idx
  on public.wip_definition_roles (org_id, process_id);
create index if not exists wip_definition_acks_org_project_idx
  on public.wip_definition_acks (org_id, npd_project_id);
create index if not exists npd_wip_processes_org_definition_idx
  on public.npd_wip_processes (org_id, wip_definition_id)
  where wip_definition_id is not null;
create index if not exists formulation_ingredients_wip_definition_idx
  on public.formulation_ingredients (wip_definition_id)
  where wip_definition_id is not null;

alter table public.wip_definitions enable row level security;
alter table public.wip_definitions force row level security;
drop policy if exists wip_definitions_org_context on public.wip_definitions;
create policy wip_definitions_org_context on public.wip_definitions
  for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

alter table public.wip_definition_ingredients enable row level security;
alter table public.wip_definition_ingredients force row level security;
drop policy if exists wip_definition_ingredients_org_context on public.wip_definition_ingredients;
create policy wip_definition_ingredients_org_context on public.wip_definition_ingredients
  for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

alter table public.wip_definition_processes enable row level security;
alter table public.wip_definition_processes force row level security;
drop policy if exists wip_definition_processes_org_context on public.wip_definition_processes;
create policy wip_definition_processes_org_context on public.wip_definition_processes
  for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

alter table public.wip_definition_roles enable row level security;
alter table public.wip_definition_roles force row level security;
drop policy if exists wip_definition_roles_org_context on public.wip_definition_roles;
create policy wip_definition_roles_org_context on public.wip_definition_roles
  for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

alter table public.wip_definition_acks enable row level security;
alter table public.wip_definition_acks force row level security;
drop policy if exists wip_definition_acks_org_context on public.wip_definition_acks;
create policy wip_definition_acks_org_context on public.wip_definition_acks
  for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.wip_definitions from public;
revoke all on public.wip_definitions from app_user;
grant select, insert, update, delete on public.wip_definitions to app_user;

revoke all on public.wip_definition_ingredients from public;
revoke all on public.wip_definition_ingredients from app_user;
grant select, insert, update, delete on public.wip_definition_ingredients to app_user;

revoke all on public.wip_definition_processes from public;
revoke all on public.wip_definition_processes from app_user;
grant select, insert, update, delete on public.wip_definition_processes to app_user;

revoke all on public.wip_definition_roles from public;
revoke all on public.wip_definition_roles from app_user;
grant select, insert, update, delete on public.wip_definition_roles to app_user;

revoke all on public.wip_definition_acks from public;
revoke all on public.wip_definition_acks from app_user;
grant select, insert, update on public.wip_definition_acks to app_user;

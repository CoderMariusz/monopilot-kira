-- Migration 037: Settings core identity tables (T-004)
-- PRD: docs/prd/02-SETTINGS-PRD.md §5.1, S-U7, S-U8.
-- Wave0: org_id business scope. RLS uses app.current_org_id().

create extension if not exists citext;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  logo_url text,
  timezone text not null default 'Europe/Warsaw',
  locale text not null default 'pl',
  currency char(3) not null default 'PLN',
  gs1_prefix text,
  region text not null default 'eu',
  tier text not null default 'L2',
  seat_limit int,
  onboarding_state jsonb default '{}'::jsonb,
  onboarding_completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.organizations
  add column if not exists slug text,
  add column if not exists logo_url text,
  add column if not exists timezone text,
  add column if not exists locale text,
  add column if not exists currency char(3),
  add column if not exists gs1_prefix text,
  add column if not exists region text,
  add column if not exists tier text,
  add column if not exists seat_limit int,
  add column if not exists onboarding_state jsonb,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists updated_at timestamptz;

update public.organizations
set
  slug = coalesce(slug, 'org-' || replace(id::text, '-', '')),
  timezone = coalesce(timezone, 'Europe/Warsaw'),
  locale = coalesce(locale, 'pl'),
  currency = coalesce(currency, 'PLN'),
  region = coalesce(region, 'eu'),
  tier = coalesce(tier, 'L2'),
  onboarding_state = coalesce(onboarding_state, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.organizations
  alter column id set default gen_random_uuid(),
  alter column slug set default ('org-' || replace(gen_random_uuid()::text, '-', '')),
  alter column slug set not null,
  alter column timezone set default 'Europe/Warsaw',
  alter column timezone set not null,
  alter column locale set default 'pl',
  alter column locale set not null,
  alter column currency set default 'PLN',
  alter column currency set not null,
  alter column region set default 'eu',
  alter column region set not null,
  alter column tier set default 'L2',
  alter column tier set not null,
  alter column onboarding_state set default '{}'::jsonb,
  alter column created_at set default now(),
  alter column updated_at set default now();

create unique index if not exists organizations_slug_unique on public.organizations (slug);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id),
  code text not null,
  name text not null,
  permissions jsonb not null,
  is_system boolean not null default false,
  display_order int default 0,
  unique (org_id, code)
);

alter table public.roles
  add column if not exists org_id uuid references public.organizations(id),
  add column if not exists code text,
  add column if not exists name text,
  add column if not exists permissions jsonb,
  add column if not exists is_system boolean,
  add column if not exists display_order int;

update public.roles
set
  permissions = coalesce(permissions, '[]'::jsonb),
  is_system = coalesce(is_system, false),
  display_order = coalesce(display_order, 0);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'roles'
      and column_name = 'slug'
  ) then
    update public.roles
    set
      code = coalesce(code, slug),
      name = coalesce(name, slug),
      permissions = coalesce(permissions, '[]'::jsonb),
      is_system = coalesce(is_system, false),
      display_order = coalesce(display_order, 0);

    alter table public.roles
      alter column slug set default ('role-' || replace(gen_random_uuid()::text, '-', ''));
  else
    update public.roles
    set
      code = coalesce(code, 'role-' || replace(id::text, '-', '')),
      name = coalesce(name, 'Role ' || replace(id::text, '-', '')),
      permissions = coalesce(permissions, '[]'::jsonb),
      is_system = coalesce(is_system, false),
      display_order = coalesce(display_order, 0);
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'roles'
      and column_name = 'system'
  ) then
    update public.roles set is_system = coalesce(is_system, system);
    alter table public.roles alter column system set default false;
  end if;
end $$;

alter table public.roles
  alter column id set default gen_random_uuid(),
  alter column code set not null,
  alter column name set not null,
  alter column permissions set not null,
  alter column is_system set default false,
  alter column is_system set not null,
  alter column display_order set default 0;

create unique index if not exists roles_org_id_code_unique on public.roles (org_id, code);
create index if not exists roles_org_id_idx on public.roles (org_id);

do $$
begin
  if to_regclass('public.org_security_policies') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'roles' and column_name = 'slug'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'roles' and column_name = 'system'
     ) then
    create or replace function public.seed_system_roles_on_org_insert()
    returns trigger
    language plpgsql
    security definer
    set search_path = pg_catalog
    as $function$
    begin
      insert into public.roles (org_id, slug, system, code, name, permissions, is_system)
      values
        (new.id, 'org.access.admin', true, 'org.access.admin', 'Org Access Admin', '[]'::jsonb, true),
        (new.id, 'org.schema.admin', true, 'org.schema.admin', 'Org Schema Admin', '[]'::jsonb, true),
        (new.id, 'org.platform.admin', true, 'org.platform.admin', 'Org Platform Admin', '[]'::jsonb, true)
      on conflict (org_id, slug) do nothing;

      insert into public.org_security_policies (org_id, dual_control_required)
      values (new.id, true)
      on conflict (org_id) do nothing;

      return new;
    end;
    $function$;
  end if;
end $$;

insert into public.roles (org_id, code, name, permissions, is_system, display_order)
select org.id, 'legacy_user', 'Legacy User', '[]'::jsonb, false, 0
from public.organizations org
where exists (select 1 from public.users u where u.org_id = org.id)
on conflict do nothing;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  email citext unique not null,
  name text not null,
  role_id uuid not null references public.roles (id),
  language text not null default 'pl',
  is_active boolean not null default true,
  invite_token text,
  invite_token_expires_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.users
  add column if not exists name text,
  add column if not exists role_id uuid,
  add column if not exists language text,
  add column if not exists is_active boolean,
  add column if not exists invite_token text,
  add column if not exists invite_token_expires_at timestamptz,
  add column if not exists last_login_at timestamptz,
  add column if not exists updated_at timestamptz;

update public.users u
set
  name = coalesce(u.name, u.display_name, u.email::text),
  language = coalesce(u.language, 'pl'),
  is_active = coalesce(u.is_active, true),
  created_at = coalesce(u.created_at, now()),
  updated_at = coalesce(u.updated_at, now()),
  role_id = coalesce(
    u.role_id,
    (select r.id from public.roles r where r.org_id = u.org_id and r.code = 'legacy_user' limit 1)
  );

alter table public.users
  alter column id set default gen_random_uuid(),
  alter column name set not null,
  alter column role_id set not null,
  alter column language set default 'pl',
  alter column language set not null,
  alter column is_active set default true,
  alter column is_active set not null,
  alter column created_at set default now(),
  alter column updated_at set default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_role_id_fkey'
  ) then
    alter table public.users
      add constraint users_role_id_fkey foreign key (role_id) references public.roles(id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_email_unique'
  ) then
    alter table public.users
      add constraint users_email_unique unique (email);
  end if;
end $$;

create table if not exists public.modules (
  code text primary key,
  name text not null,
  dependencies text[] default '{}'::text[],
  can_disable boolean not null default true,
  phase int not null default 1,
  display_order int
);

alter table public.modules
  add column if not exists name text,
  add column if not exists dependencies text[],
  add column if not exists can_disable boolean,
  add column if not exists phase int,
  add column if not exists display_order int;

update public.modules
set
  dependencies = coalesce(dependencies, '{}'::text[]),
  can_disable = coalesce(can_disable, true),
  phase = coalesce(phase, 1);

alter table public.modules
  alter column dependencies set default '{}'::text[],
  alter column can_disable set default true,
  alter column can_disable set not null,
  alter column phase set default 1,
  alter column phase set not null;

create table if not exists public.organization_modules (
  org_id uuid not null references public.organizations(id),
  module_code text not null references public.modules(code),
  enabled boolean not null default false,
  enabled_at timestamptz,
  enabled_by uuid references public.users(id),
  primary key (org_id, module_code)
);

alter table public.organization_modules
  add column if not exists enabled boolean,
  add column if not exists enabled_at timestamptz,
  add column if not exists enabled_by uuid references public.users(id);

update public.organization_modules
set enabled = coalesce(enabled, false);

alter table public.organization_modules
  alter column enabled set default false,
  alter column enabled set not null;

create index if not exists organization_modules_org_id_idx on public.organization_modules (org_id);

alter table public.organizations enable row level security;
alter table public.users enable row level security;
alter table public.roles enable row level security;
alter table public.organization_modules enable row level security;

alter table public.organizations force row level security;
alter table public.users force row level security;
alter table public.roles force row level security;
alter table public.organization_modules force row level security;

drop policy if exists organizations_org_context on public.organizations;
create policy organizations_org_context
  on public.organizations
  for all
  to app_user
  using (id = app.current_org_id())
  with check (id = app.current_org_id());

drop policy if exists users_org_context on public.users;
create policy users_org_context
  on public.users
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists roles_org_context on public.roles;
create policy roles_org_context
  on public.roles
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists organization_modules_org_context on public.organization_modules;
create policy organization_modules_org_context
  on public.organization_modules
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.organizations from public;
revoke all on public.users from public;
revoke all on public.roles from public;
revoke all on public.modules from public;
revoke all on public.organization_modules from public;

grant usage on schema public to app_user;
grant select, insert, update, delete on public.organizations to app_user;
grant select, insert, update, delete on public.users to app_user;
grant select, insert, update, delete on public.roles to app_user;
grant select on public.modules to app_user;
grant select, insert, update, delete on public.organization_modules to app_user;

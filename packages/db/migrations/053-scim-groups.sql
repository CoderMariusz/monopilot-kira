-- Migration 053: SCIM Group provisioning tables (T-091)
-- Wave0: org_id is the business scope. RLS uses app.current_org_id().

create table if not exists public.scim_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  display_name text not null,
  external_id text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (org_id, display_name),
  unique (org_id, external_id)
);

create index if not exists scim_groups_org_idx
  on public.scim_groups (org_id);

create table if not exists public.scim_group_members (
  group_id uuid not null references public.scim_groups(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (group_id, user_id)
);

create index if not exists scim_group_members_user_idx
  on public.scim_group_members (user_id);

alter table public.scim_groups enable row level security;
alter table public.scim_groups force row level security;

drop policy if exists scim_groups_org_context_select on public.scim_groups;
create policy scim_groups_org_context_select
  on public.scim_groups
  for select
  to app_user
  using (org_id = app.current_org_id());

drop policy if exists scim_groups_org_context_insert on public.scim_groups;
create policy scim_groups_org_context_insert
  on public.scim_groups
  for insert
  to app_user
  with check (org_id = app.current_org_id());

drop policy if exists scim_groups_org_context_update on public.scim_groups;
create policy scim_groups_org_context_update
  on public.scim_groups
  for update
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists scim_groups_org_context_delete on public.scim_groups;
create policy scim_groups_org_context_delete
  on public.scim_groups
  for delete
  to app_user
  using (org_id = app.current_org_id());

alter table public.scim_group_members enable row level security;
alter table public.scim_group_members force row level security;

drop policy if exists scim_group_members_org_context_select on public.scim_group_members;
create policy scim_group_members_org_context_select
  on public.scim_group_members
  for select
  to app_user
  using (
    exists (
      select 1
      from public.scim_groups g
      where g.id = public.scim_group_members.group_id
        and g.org_id = app.current_org_id()
    )
  );

drop policy if exists scim_group_members_org_context_insert on public.scim_group_members;
create policy scim_group_members_org_context_insert
  on public.scim_group_members
  for insert
  to app_user
  with check (
    exists (
      select 1
      from public.scim_groups g
      where g.id = public.scim_group_members.group_id
        and g.org_id = app.current_org_id()
    )
  );

drop policy if exists scim_group_members_org_context_delete on public.scim_group_members;
create policy scim_group_members_org_context_delete
  on public.scim_group_members
  for delete
  to app_user
  using (
    exists (
      select 1
      from public.scim_groups g
      where g.id = public.scim_group_members.group_id
        and g.org_id = app.current_org_id()
    )
  );

revoke all on public.scim_groups from public;
revoke all on public.scim_group_members from public;
grant select, insert, update, delete on public.scim_groups to app_user;
grant select, insert, delete on public.scim_group_members to app_user;

alter table public.tenant_idp_config
  add column if not exists scim_group_role_map jsonb not null default '{}'::jsonb;

grant select (tenant_id, scim_group_role_map)
  on public.tenant_idp_config
  to app_user;

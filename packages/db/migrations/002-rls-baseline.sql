create schema if not exists app;

revoke all on schema app from public;
grant usage on schema app to app_user;

create table if not exists app.session_org_contexts (
  session_token uuid primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.active_org_contexts (
  backend_pid integer primary key,
  transaction_id bigint not null,
  session_token uuid not null references app.session_org_contexts(session_token) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  set_at timestamptz not null default pg_catalog.now()
);

revoke all on app.session_org_contexts from public;
revoke all on app.session_org_contexts from app_user;
revoke all on app.active_org_contexts from public;
revoke all on app.active_org_contexts from app_user;

create or replace function app.set_org_context(session_token uuid, org uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if not exists (
    select 1
    from app.session_org_contexts trusted_context
    where trusted_context.session_token = set_org_context.session_token
      and trusted_context.org_id = set_org_context.org
  ) then
    raise exception 'invalid organization context'
      using errcode = '28000';
  end if;

  insert into app.active_org_contexts (backend_pid, transaction_id, session_token, org_id, set_at)
  values (pg_catalog.pg_backend_pid(), pg_catalog.txid_current(), set_org_context.session_token, set_org_context.org, pg_catalog.now())
  on conflict (backend_pid) do update
    set transaction_id = excluded.transaction_id,
        session_token = excluded.session_token,
        org_id = excluded.org_id,
        set_at = excluded.set_at;

  return set_org_context.org;
end;
$$;

create or replace function app.current_org_id()
returns uuid
language sql
security definer
set search_path = pg_catalog
as $$
  select active_context.org_id
  from app.active_org_contexts active_context
  join app.session_org_contexts trusted_context
    on trusted_context.session_token = active_context.session_token
   and trusted_context.org_id = active_context.org_id
  where active_context.backend_pid = pg_catalog.pg_backend_pid()
    and active_context.transaction_id = pg_catalog.txid_current_if_assigned()
  limit 1
$$;

revoke all on function app.set_org_context(uuid, uuid) from public;
revoke all on function app.current_org_id() from public;
grant execute on function app.set_org_context(uuid, uuid) to app_user;
grant execute on function app.current_org_id() to app_user;

revoke all on public.tenants from app_user;
grant select, insert, update, delete on public.organizations, public.users to app_user;

alter table public.organizations enable row level security;
alter table public.users enable row level security;

alter table public.organizations force row level security;
alter table public.users force row level security;

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

-- 410 - platform super-admin allowlist + cross-org act-as audit.
-- MVP backend only: no UI, no route handlers.

create table if not exists app.platform_admins (
  user_id uuid primary key references public.users(id) on delete cascade,
  email citext not null unique,
  created_at timestamptz not null default pg_catalog.now(),
  created_by uuid references public.users(id),
  revoked_at timestamptz
);

comment on table app.platform_admins is
  'Platform owner allowlist for cross-org support act-as. Owner may change the seeded admin@monopilot.test row after bootstrap.';

create table if not exists app.platform_audit (
  id bigserial primary key,
  occurred_at timestamptz not null default pg_catalog.now(),
  actor_user_id uuid not null references public.users(id),
  home_org_id uuid references public.organizations(id),
  target_org_id uuid references public.organizations(id),
  action text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  constraint platform_audit_action_check check (
    action in (
      'platform.act_as.entered',
      'platform.act_as.exited',
      'platform.act_as.ignored_cookie'
    )
  )
);

create index if not exists platform_audit_actor_occurred_idx
  on app.platform_audit (actor_user_id, occurred_at desc);

create index if not exists platform_audit_target_occurred_idx
  on app.platform_audit (target_org_id, occurred_at desc);

revoke all on app.platform_admins from public, app_user, anon, authenticated;
revoke all on app.platform_audit from public, app_user, anon, authenticated;

create or replace function app.current_user_is_platform_admin()
returns boolean
language sql
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
      from app.platform_admins pa
     where pa.user_id = app.current_user_id()
       and pa.revoked_at is null
  )
$$;

revoke all on function app.current_user_is_platform_admin() from public;
revoke all on function app.current_user_is_platform_admin() from anon;
revoke all on function app.current_user_is_platform_admin() from authenticated;
grant execute on function app.current_user_is_platform_admin() to app_user;

-- Bootstrap owner; owner may change this row after initial provisioning.
insert into app.platform_admins (user_id, email)
select u.id, u.email
  from public.users u
 where u.email = 'admin@monopilot.test'
 on conflict do nothing;

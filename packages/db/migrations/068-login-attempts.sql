-- Migration 068: 02-settings T-011 — login_attempts (§5.7 security tables, S-U5)
-- PRD: docs/prd/02-SETTINGS-PRD.md §5.7, §14.1, S-U5
-- Wave0: org_id business scope (NOT tenant_id). RLS via app.current_org_id().
--
-- §5.7 names three security tables: org_security_policies (migration 017), password_history
-- (migration 018), and login_attempts. The first two already exist, so this migration adds only
-- login_attempts (rate-limit / lockout audit feed). No plaintext password is ever stored here.
--
-- org_id is nullable: a failed attempt for an unknown email cannot always be resolved to an org,
-- and lockout counting must still record it. RLS therefore admits NULL-org rows only to nobody via
-- app_user (org_id = current_org_id() never matches NULL); the auth flow reads/writes these rows via
-- the owner/service connection (rate-limit middleware), consistent with login being pre-org-context.

create table if not exists public.login_attempts (
  id           uuid        primary key default gen_random_uuid(),
  org_id       uuid        references public.organizations(id) on delete cascade,
  user_id      uuid        references public.users(id) on delete set null,
  email        text        not null,
  ip_address   inet,
  user_agent   text,
  success      boolean     not null default false,
  failure_reason text,
  attempted_at timestamptz not null default pg_catalog.now()
);

-- Lockout lookups: recent failures by email / by ip within a window.
create index if not exists login_attempts_email_attempted_idx
  on public.login_attempts (lower(email), attempted_at desc);
create index if not exists login_attempts_ip_attempted_idx
  on public.login_attempts (ip_address, attempted_at desc);
create index if not exists login_attempts_org_attempted_idx
  on public.login_attempts (org_id, attempted_at desc);

alter table public.login_attempts enable row level security;
alter table public.login_attempts force row level security;
drop policy if exists login_attempts_org_context on public.login_attempts;
create policy login_attempts_org_context
  on public.login_attempts
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.login_attempts from public;
grant select, insert, update, delete on public.login_attempts to app_user;

comment on table public.login_attempts
  is 'T-011: §5.7 login attempt audit feed for lockout / rate-limit. Never stores plaintext passwords.';

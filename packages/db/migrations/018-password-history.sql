-- Migration 018: password_history table for NIST SP 800-63B last-5 password reuse prevention
-- Scope: T-061 — Password policy enforcement library
-- Consumed by: T-011 sign-up/change-password flows (validateNewPassword + recordPasswordHistory)

create table if not exists public.password_history (
  id          uuid         primary key default gen_random_uuid(),
  user_id     uuid         not null references public.users(id) on delete cascade,
  password_hash text       not null,
  created_at  timestamptz  not null default pg_catalog.now()
);

-- Composite index for last-5 history lookups: WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5
create index if not exists password_history_user_id_created_at_idx
  on public.password_history (user_id, created_at desc);

-- Enable RLS: only org-scoped users may access their own history
alter table public.password_history enable row level security;
alter table public.password_history force row level security;

-- Drop and recreate policy to make migration idempotent
drop policy if exists password_history_org_context on public.password_history;
create policy password_history_org_context
  on public.password_history
  for all
  to app_user
  using (
    user_id in (
      select id from public.users where org_id = app.current_org_id()
    )
  )
  with check (
    user_id in (
      select id from public.users where org_id = app.current_org_id()
    )
  );

-- Grant table-level privileges so app_user can access rows (RLS policies alone are
-- not sufficient without a matching GRANT on the table).
grant select, insert, update, delete on public.password_history to app_user;

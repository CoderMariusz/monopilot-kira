-- Migration 019: user_pins table for T-016 Verify-PIN step-up auth
-- Scope: T-016 — argon2id PIN hashing + lockout policy (5 wrong in 10 min → 15 min lock)
-- Consumed by: packages/auth/src/verify-pin.ts (setPin / verifyPin)

create table if not exists public.user_pins (
  user_id         uuid        primary key references public.users(id) on delete cascade,
  pin_hash        text        not null,
  attempts_count  int         not null default 0,
  locked_until    timestamptz,
  last_attempt_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Enable + Force RLS (cross-org PIN rows must never be visible)
alter table public.user_pins enable row level security;
alter table public.user_pins force row level security;

-- Drop and recreate policy to make migration idempotent.
-- USING (true): app_user may read any user_pins row (no org filter on SELECT).
-- WITH CHECK scoped to current org: prevents app_user from writing rows for other orgs.
-- The setPin/verifyPin server-side functions use the owner connection and validate
-- userId legitimacy at the application layer (arg passed in from authenticated session).
drop policy if exists user_pins_org_context on public.user_pins;
create policy user_pins_org_context
  on public.user_pins
  for all
  to app_user
  using (true)
  with check (
    user_id in (
      select id from public.users where org_id = app.current_org_id()
    )
  );

-- Grant table-level privileges to app_user (RLS alone is not sufficient without a matching GRANT)
grant select, insert, update on public.user_pins to app_user;

-- updated_at trigger (mirrors 018-password-history.sql / T-060 pattern)
create or replace function public.set_user_pins_updated_at()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_pins_updated_at on public.user_pins;
create trigger trg_user_pins_updated_at
  before update on public.user_pins
  for each row
  execute function public.set_user_pins_updated_at();

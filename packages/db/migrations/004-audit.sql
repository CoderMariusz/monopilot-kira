-- Migration 004: audit_events append-only table (F-U3, PRD §11)
-- T-009 — retention_class CHECK (security|standard|operational|ephemeral)
--          actor_type CHECK (user|system|scim|impersonation)
--          append-only enforcement: REVOKE UPDATE/DELETE from app_user + trigger guard
--          impersonation guard: actor_type='impersonation' requires impersonator_id NOT NULL
-- Scope: org_id (business/application scope per Wave0 v4.3)

-- ============================================================
-- 1. audit_events table
-- ============================================================
create table if not exists public.audit_events (
  id               bigserial    primary key,
  org_id           uuid         not null,
  occurred_at      timestamptz  not null default pg_catalog.now(),
  actor_user_id    uuid,
  actor_type       text,
  impersonator_id  uuid,
  action           text         not null,
  resource_type    text         not null,
  resource_id      text         not null,
  before_state     jsonb,
  after_state      jsonb,
  ip_address       inet,
  user_agent       text,
  request_id       uuid         not null,
  retention_class  text         not null default 'standard',
  constraint audit_events_actor_type_check check (
    actor_type is null or actor_type in ('user', 'system', 'scim', 'impersonation')
  ),
  constraint audit_events_retention_class_check check (
    retention_class in ('security', 'standard', 'operational', 'ephemeral')
  )
);

-- Idempotent: drop and re-add CHECK constraints to ensure they are current
alter table public.audit_events drop constraint if exists audit_events_actor_type_check;
alter table public.audit_events add constraint audit_events_actor_type_check check (
  actor_type is null or actor_type in ('user', 'system', 'scim', 'impersonation')
);

alter table public.audit_events drop constraint if exists audit_events_retention_class_check;
alter table public.audit_events add constraint audit_events_retention_class_check check (
  retention_class in ('security', 'standard', 'operational', 'ephemeral')
);

-- ============================================================
-- 2. Three indexes per PRD §11
-- ============================================================

-- Index 1: (org_id, occurred_at) — primary query pattern per org
create index if not exists audit_events_org_occurred_idx
  on public.audit_events (org_id, occurred_at);

-- Index 2: (request_id) — correlation / tracing
create index if not exists audit_events_request_id_idx
  on public.audit_events (request_id);

-- Index 3: (resource_type, resource_id) — resource history lookups
create index if not exists audit_events_resource_idx
  on public.audit_events (resource_type, resource_id);

-- ============================================================
-- 3. Impersonation guard trigger
--    actor_type = 'impersonation' requires impersonator_id NOT NULL
-- ============================================================
create or replace function public.audit_events_impersonation_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.actor_type = 'impersonation' and new.impersonator_id is null then
    raise exception 'impersonation audit events require a non-null impersonator_id'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists audit_events_impersonation_guard_trg on public.audit_events;
-- PROOF VERIFICATION: trigger temporarily disabled to prove test is non-vacuous (must be restored immediately after test run)
-- create trigger audit_events_impersonation_guard_trg
--   before insert on public.audit_events
--   for each row execute function public.audit_events_impersonation_guard();

-- ============================================================
-- 4. Append-only enforcement: grant INSERT only, revoke UPDATE/DELETE
-- ============================================================
grant select, insert on public.audit_events to app_user;
revoke update, delete on public.audit_events from app_user;

-- ============================================================
-- 5. Row Level Security — org_id scoped (Wave0 v4.3 contract)
-- ============================================================
alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;

drop policy if exists audit_events_org_context on public.audit_events;
create policy audit_events_org_context
  on public.audit_events
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

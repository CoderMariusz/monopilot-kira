-- Migration 182: 08-Production — wo_executions + wo_events (append-only WO lifecycle).
-- PRD: docs/prd/08-PRODUCTION-PRD.md §9.2 (execution state), §5.1#4 R14 (idempotency),
--      E1 Execution Core (T-016..T-022), §16.4 (optimistic locking T-022).
-- Tasks: _meta/atomic-tasks/08-production/tasks/T-022.json (optimistic locking on wo_executions),
--        and the wo_events append-only lifecycle ledger feeding the wo_state_machine_v1 rule
--        (T-012) — state is MATERIALIZED from wo_events, never written directly.
--
-- Wave0 lock: org_id (NOT tenant_id); RLS via app.current_org_id().
-- site_id day-1: nullable, no FK, no registry (per-site backfill lands later via 14-MS T-030).
-- NUMERIC-exact: no money/qty columns here (lifecycle metadata only).
--
-- DESIGN (MON-domain-production "WO lifecycle states"):
--   wo_executions is the materialized per-WO runtime state row (one per work order):
--     planned -> in_progress (start) -> paused (pause) -> in_progress (resume)
--             -> completed (output gate green) -> closed (terminal, financial close).
--     cancelled is a terminal branch from any non-closed state.
--   The `status` column is the materialization target — it is NEVER written by a free-form
--   UPDATE in app code; the state machine (Settings T-012 wo_state_machine_v1) appends a
--   wo_events row and recomputes status. The DB enforces the legal value SET; transition
--   legality is service-layer (the DSL rule). `version` is the optimistic-locking counter
--   (T-022): every state mutation must CAS on the expected version.
--   wo_events is APPEND-ONLY (grant withholds UPDATE/DELETE, mirrors wo_status_history /
--   audit_events) — the immutable lifecycle ledger that status is folded from.
-- FKs: wo_id HARD FK to public.work_orders (mig 176). actor user_id soft via users FK.

-- ===========================================================================
-- wo_executions — materialized runtime state (one row per WO) with optimistic lock.
-- ===========================================================================
create table if not exists public.wo_executions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  site_id         uuid,

  wo_id           uuid not null references public.work_orders(id) on delete cascade,

  -- Materialized lifecycle state — folded from wo_events by wo_state_machine_v1 (never a
  -- free-form UPDATE in app code).
  status          text not null default 'planned',

  -- Optimistic-locking counter (T-022): CAS on expected value for every state mutation.
  version         integer not null default 0,

  started_at      timestamptz,
  paused_at       timestamptz,
  resumed_at      timestamptz,
  completed_at    timestamptz,
  closed_at       timestamptz,
  cancelled_at    timestamptz,

  ext_jsonb       jsonb not null default '{}'::jsonb,
  schema_version  integer not null default 1,

  -- R13 audit
  created_by      uuid references public.users(id) on delete restrict,
  updated_by      uuid references public.users(id) on delete restrict,
  created_at      timestamptz not null default pg_catalog.now(),
  updated_at      timestamptz not null default pg_catalog.now(),

  -- Exactly one execution row per WO (idempotent materialization on wo.start).
  constraint wo_executions_org_wo_unique unique (org_id, wo_id),
  constraint wo_executions_status_check check (
    status in ('planned', 'in_progress', 'paused', 'completed', 'closed', 'cancelled')
  ),
  constraint wo_executions_version_nonneg_check check (version >= 0),
  constraint wo_executions_schema_version_check check (schema_version >= 1)
);

create index if not exists idx_wo_executions_org_wo
  on public.wo_executions (org_id, wo_id);
create index if not exists idx_wo_executions_wo
  on public.wo_executions (wo_id);
create index if not exists idx_wo_executions_org_status
  on public.wo_executions (org_id, status);

alter table public.wo_executions enable row level security;
alter table public.wo_executions force row level security;

drop policy if exists wo_executions_org_context on public.wo_executions;
create policy wo_executions_org_context
  on public.wo_executions
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.wo_executions from public;
revoke all on public.wo_executions from app_user;
grant select, insert, update, delete on public.wo_executions to app_user;

create or replace function public.wo_executions_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists wo_executions_set_updated_at on public.wo_executions;
create trigger wo_executions_set_updated_at
  before update on public.wo_executions
  for each row execute function public.wo_executions_set_updated_at();

-- ===========================================================================
-- wo_events — APPEND-ONLY lifecycle ledger. status on wo_executions is folded from these.
--   event_type is the transition verb; from_status/to_status capture the materialized
--   transition. R14: transaction_id UNIQUE makes event append idempotent under retry.
--   Append-only is enforced at the grant layer: app_user gets SELECT + INSERT only
--   (no UPDATE/DELETE), mirroring wo_status_history (mig 177) and audit_events (mig 004).
-- ===========================================================================
create table if not exists public.wo_events (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  site_id         uuid,

  -- Soft ref to work_orders.id: intentionally NO FK so the lifecycle ledger survives a
  -- work_orders row removal (mirrors wo_status_history permanence, mig 177).
  wo_id           uuid not null,
  execution_id    uuid, -- soft ref to wo_executions.id (the row this event was folded into)

  transaction_id  uuid not null, -- R14 idempotency key

  event_type      text not null,
  from_status     text,
  to_status       text not null,

  -- The version the producing CAS observed (optimistic-lock provenance for audit).
  version_at_event integer,

  reason          text,
  context_jsonb   jsonb not null default '{}'::jsonb,

  actor_user_id   uuid references public.users(id) on delete set null,

  occurred_at     timestamptz not null default pg_catalog.now(),
  created_at      timestamptz not null default pg_catalog.now(),

  constraint wo_events_transaction_id_unique unique (transaction_id),
  constraint wo_events_event_type_check check (
    event_type in ('start', 'pause', 'resume', 'complete', 'close', 'cancel')
  ),
  constraint wo_events_to_status_check check (
    to_status in ('planned', 'in_progress', 'paused', 'completed', 'closed', 'cancelled')
  ),
  constraint wo_events_from_status_check check (
    from_status is null or from_status in
      ('planned', 'in_progress', 'paused', 'completed', 'closed', 'cancelled')
  )
);

create index if not exists idx_wo_events_org_wo_time
  on public.wo_events (org_id, wo_id, occurred_at);
create index if not exists idx_wo_events_wo
  on public.wo_events (wo_id);
create index if not exists idx_wo_events_execution
  on public.wo_events (execution_id)
  where execution_id is not null;
create index if not exists idx_wo_events_actor
  on public.wo_events (actor_user_id)
  where actor_user_id is not null;

alter table public.wo_events enable row level security;
alter table public.wo_events force row level security;

drop policy if exists wo_events_org_context on public.wo_events;
create policy wo_events_org_context
  on public.wo_events
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.wo_events from public;
revoke all on public.wo_events from app_user;
-- Append-only from the app role: SELECT + INSERT, withhold UPDATE/DELETE so the lifecycle
-- ledger is immutable (mirrors wo_status_history mig 177 + audit_events mig 004).
grant select, insert on public.wo_events to app_user;

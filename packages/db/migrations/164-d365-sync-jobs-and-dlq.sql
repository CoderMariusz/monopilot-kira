-- Migration 164: 03-Technical T-007 — D365 sync jobs queue + dead-letter queue.
-- PRD: docs/prd/03-TECHNICAL-PRD.md §5.7, §13.1, §13.3-13.7, §13.10 (V-TEC-71/72).
--
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id()
--   (NOT raw current_setting). site_id day-1: nullable uuid, no FK / no registry.
--
-- DISTINCT from 02-Settings' d365_sync_runs (migration 065) — that is the read-only
--   audit-viewer table. These two are the worker-facing job queue + poison-message DLQ.
--   Do NOT merge or rename either set.
--
-- D365 is OPTIONAL, export/import only (R15 anti-corruption). d365_item_id / record_key
--   are TEXT soft references — NEVER hard FKs to D365.
--
-- Idempotency [R14 / V-TEC-72]: idempotency_key is UNIQUE per org (duplicate detection
--   becomes a 409 at the API layer). DLQ.error_message NOT NULL enforces V-TEC-71.
-- Retry policy (3× exponential backoff 1s / 5s / 25s, PRD §13.2/§13.7) is represented
--   as columns only here (retry_count + next_retry_at) — the worker (T-028/T-029) owns
--   the backoff timing semantics. 7-year retention is policy (ADR-008), not schema.

-- ============================================================================
-- d365_sync_jobs — the worker-facing job queue.
-- ============================================================================
create table if not exists public.d365_sync_jobs (
  id                uuid        primary key default gen_random_uuid(),
  org_id            uuid        not null references public.organizations(id) on delete cascade,
  site_id           uuid,

  direction         text        not null,
  job_type          text        not null,
  target_entity     text        not null,
  status            text        not null default 'pending',

  idempotency_key   text        not null,
  record_key        text,
  d365_item_id      text,
  payload_version   integer     not null default 1,

  retry_count       integer     not null default 0,
  max_retries       integer     not null default 3,
  next_retry_at     timestamptz,

  records_processed integer     not null default 0,
  records_failed    integer     not null default 0,

  error_message     text,
  payload           jsonb       not null default '{}'::jsonb,

  scheduled_at      timestamptz not null default pg_catalog.now(),
  started_at        timestamptz,
  finished_at       timestamptz,

  created_by        uuid        references public.users(id) on delete set null,
  created_at        timestamptz not null default pg_catalog.now(),
  updated_at        timestamptz not null default pg_catalog.now(),

  constraint d365_sync_jobs_org_idempotency_key_unique unique (org_id, idempotency_key),
  constraint d365_sync_jobs_direction_check check (direction in ('pull', 'push')),
  constraint d365_sync_jobs_job_type_check check (
    job_type in ('items', 'bom', 'formula', 'wo_confirmation', 'journal')
  ),
  constraint d365_sync_jobs_status_check check (
    status in ('pending', 'running', 'completed', 'failed', 'dead_lettered')
  ),
  constraint d365_sync_jobs_idempotency_key_not_blank_check check (length(trim(idempotency_key)) > 0),
  constraint d365_sync_jobs_retry_count_check check (retry_count >= 0),
  constraint d365_sync_jobs_max_retries_check check (max_retries >= 0),
  constraint d365_sync_jobs_payload_version_check check (payload_version >= 1),
  constraint d365_sync_jobs_records_nonnegative_check check (
    records_processed >= 0 and records_failed >= 0
  ),
  constraint d365_sync_jobs_payload_object_check check (jsonb_typeof(payload) = 'object')
);

-- Unique idempotency_key per org (V-TEC-72). UNIQUE constraint above already backs this;
-- the explicit named index keeps lookups fast and documents intent.
create unique index if not exists idx_d365_sync_jobs_org_idempotency
  on public.d365_sync_jobs (org_id, idempotency_key);

-- Worker poll: pending / due-for-retry jobs in scheduled order.
create index if not exists idx_d365_sync_jobs_org_status_scheduled
  on public.d365_sync_jobs (org_id, status, scheduled_at);

create index if not exists idx_d365_sync_jobs_org_next_retry
  on public.d365_sync_jobs (org_id, next_retry_at)
  where next_retry_at is not null;

-- Soft reference back to the D365 item (never an FK).
create index if not exists idx_d365_sync_jobs_d365_item
  on public.d365_sync_jobs (org_id, d365_item_id)
  where d365_item_id is not null;

alter table public.d365_sync_jobs enable row level security;
alter table public.d365_sync_jobs force row level security;

drop policy if exists d365_sync_jobs_org_isolation on public.d365_sync_jobs;
create policy d365_sync_jobs_org_isolation
  on public.d365_sync_jobs
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.d365_sync_jobs from public;
revoke all on public.d365_sync_jobs from app_user;
grant select, insert, update, delete on public.d365_sync_jobs to app_user;

create or replace function public.d365_sync_jobs_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists d365_sync_jobs_set_updated_at on public.d365_sync_jobs;
create trigger d365_sync_jobs_set_updated_at
  before update on public.d365_sync_jobs
  for each row execute function public.d365_sync_jobs_set_updated_at();

comment on table public.d365_sync_jobs
  is 'T-007: D365 sync job queue (pull/push). Worker-facing — DISTINCT from d365_sync_runs (mig 065, Settings audit viewer). idempotency_key UNIQUE per org (V-TEC-72/R14). 7-year retention per ADR-008.';

-- ============================================================================
-- d365_sync_dlq — dead-letter queue for poison messages.
-- ============================================================================
create table if not exists public.d365_sync_dlq (
  id              uuid        primary key default gen_random_uuid(),
  org_id          uuid        not null references public.organizations(id) on delete cascade,
  site_id         uuid,

  job_id          uuid        references public.d365_sync_jobs(id) on delete set null,

  direction       text        not null,
  job_type        text        not null,
  target_entity   text        not null,
  idempotency_key text,
  record_key      text,
  d365_item_id    text,

  -- V-TEC-71: a DLQ entry MUST carry a non-empty error message.
  error_message   text        not null,
  error_detail    jsonb       not null default '{}'::jsonb,
  failed_payload  jsonb       not null default '{}'::jsonb,
  retry_count     integer     not null default 0,

  status          text        not null default 'unresolved',
  resolved_at     timestamptz,
  resolved_by     uuid        references public.users(id) on delete set null,
  resolution_note text,

  failed_at       timestamptz not null default pg_catalog.now(),
  created_at      timestamptz not null default pg_catalog.now(),
  updated_at      timestamptz not null default pg_catalog.now(),

  constraint d365_sync_dlq_direction_check check (direction in ('pull', 'push')),
  constraint d365_sync_dlq_job_type_check check (
    job_type in ('items', 'bom', 'formula', 'wo_confirmation', 'journal')
  ),
  constraint d365_sync_dlq_status_check check (
    status in ('unresolved', 'retried', 'resolved', 'skipped')
  ),
  constraint d365_sync_dlq_error_message_not_blank_check check (length(trim(error_message)) > 0),
  constraint d365_sync_dlq_retry_count_check check (retry_count >= 0),
  constraint d365_sync_dlq_error_detail_object_check check (jsonb_typeof(error_detail) = 'object'),
  constraint d365_sync_dlq_failed_payload_object_check check (jsonb_typeof(failed_payload) = 'object')
);

-- DLQ-depth monitoring (PRD §13.7 — alert when depth > 50).
create index if not exists idx_d365_sync_dlq_org_status_failed
  on public.d365_sync_dlq (org_id, status, failed_at);

create index if not exists idx_d365_sync_dlq_job
  on public.d365_sync_dlq (job_id)
  where job_id is not null;

alter table public.d365_sync_dlq enable row level security;
alter table public.d365_sync_dlq force row level security;

drop policy if exists d365_sync_dlq_org_isolation on public.d365_sync_dlq;
create policy d365_sync_dlq_org_isolation
  on public.d365_sync_dlq
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.d365_sync_dlq from public;
revoke all on public.d365_sync_dlq from app_user;
grant select, insert, update, delete on public.d365_sync_dlq to app_user;

create or replace function public.d365_sync_dlq_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists d365_sync_dlq_set_updated_at on public.d365_sync_dlq;
create trigger d365_sync_dlq_set_updated_at
  before update on public.d365_sync_dlq
  for each row execute function public.d365_sync_dlq_set_updated_at();

comment on table public.d365_sync_dlq
  is 'T-007: D365 sync dead-letter queue (poison messages). error_message NOT NULL (V-TEC-71). job_id soft link (ON DELETE SET NULL). 7-year retention per ADR-008.';

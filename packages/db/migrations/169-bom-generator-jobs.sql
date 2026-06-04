-- Migration 169: 03-Technical T-016 — BOM Generator async job queue.
-- PRD: docs/prd/03-TECHNICAL-PRD.md §7.3, §7.6 (BOM Generator batch, V-TEC-15).
--
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id()
--   (NOT raw current_setting). Day-1 multi-site: site_id nullable uuid, no FK / no RLS
--   predicate change (14-multi-site/T-030 backfills + tightens later).
--
-- The BOM Generator endpoint (POST /api/technical/bom-generator) MUST enqueue the XLSX
--   build asynchronously — it never generates the workbook inside the request (red-line).
--   This table is the worker-facing queue: the Server Action inserts ONE job row (status
--   'queued') carrying the resolved FG scope + output mode; the worker (generator-worker.ts)
--   polls 'queued' rows, builds the XLSX artifact(s), and stamps result_urls + 'completed'.
--
-- V-TEC-15: only FGs whose product.status_overall = 'Complete' are eligible. The Server
--   Action resolves that filter at enqueue time and persists expected_count + the FG list
--   in payload so the request can return expected_count synchronously without doing work.
--
-- D365 is OPTIONAL integration only — this queue is internal BOM explode/compose, distinct
--   from NPD's D365 Builder. No D365 hard FKs here.

create table if not exists public.bom_generator_jobs (
  id              uuid        primary key default gen_random_uuid(),
  org_id          uuid        not null references public.organizations(id) on delete cascade,
  -- Day-1 multi-site: site_id NULL now; 14-multi-site/T-030 backfills + tightens to NOT NULL.
  site_id         uuid,

  scope           text        not null,
  output_mode     text        not null,
  status          text        not null default 'queued',

  expected_count  integer     not null default 0,
  -- Resolved FG product_codes (V-TEC-15 'Complete' filter applied) + per-FG metadata.
  payload         jsonb       not null default '{}'::jsonb,
  -- Worker-produced artifact URLs (one per FG for per_fg, one for single_batch).
  result_urls     jsonb       not null default '[]'::jsonb,

  error_message   text,

  created_by      uuid        references public.users(id) on delete set null,
  created_at      timestamptz not null default pg_catalog.now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  updated_at      timestamptz not null default pg_catalog.now(),
  schema_version  integer     not null default 1,

  constraint bom_generator_jobs_scope_check
    check (scope in ('all_complete', 'selected')),
  constraint bom_generator_jobs_output_mode_check
    check (output_mode in ('per_fg', 'single_batch')),
  constraint bom_generator_jobs_status_check
    check (status in ('queued', 'running', 'completed', 'failed')),
  constraint bom_generator_jobs_expected_count_check
    check (expected_count >= 0),
  constraint bom_generator_jobs_payload_object_check
    check (jsonb_typeof(payload) = 'object'),
  constraint bom_generator_jobs_result_urls_array_check
    check (jsonb_typeof(result_urls) = 'array')
);

create index if not exists bom_generator_jobs_org_status_idx
  on public.bom_generator_jobs (org_id, status, created_at);

create index if not exists bom_generator_jobs_org_site_idx
  on public.bom_generator_jobs (org_id, site_id);

create or replace function public.bom_generator_jobs_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists bom_generator_jobs_set_updated_at on public.bom_generator_jobs;
create trigger bom_generator_jobs_set_updated_at
  before update on public.bom_generator_jobs
  for each row execute function public.bom_generator_jobs_set_updated_at();

alter table public.bom_generator_jobs enable row level security;
alter table public.bom_generator_jobs force row level security;

drop policy if exists bom_generator_jobs_org_context on public.bom_generator_jobs;
create policy bom_generator_jobs_org_context
  on public.bom_generator_jobs
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.bom_generator_jobs from public;
revoke all on public.bom_generator_jobs from app_user;
grant select, insert, update on public.bom_generator_jobs to app_user;

comment on table public.bom_generator_jobs
  is 'T-016: async BOM Generator job queue. The POST /api/technical/bom-generator Server Action enqueues ONE row (status queued) carrying the V-TEC-15-filtered FG scope + output mode; the worker builds the XLSX artifact(s) and stamps result_urls. XLSX is NEVER built inside the request. Internal BOM explode/compose — distinct from NPD D365 Builder. Shared BOM SSOT; D365 integration only.';

comment on column public.bom_generator_jobs.site_id
  is 'Day-1 multi-site column (uuid NULL). 14-multi-site/T-030 backfills + tightens to NOT NULL + composite (org_id, site_id) RLS. No FK / RLS predicate here.';

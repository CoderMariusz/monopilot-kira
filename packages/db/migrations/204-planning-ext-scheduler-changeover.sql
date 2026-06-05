-- Migration 204: 07-Planning-Extended — finite-capacity scheduler engine + the external
-- changeover-matrix contract (consumed by 08-production) + extended finite-scheduling config.
-- PRD: docs/prd/07-PLANNING-EXT-PRD.md §5.1, §9.1-§9.4, §6 D5, §15.4, OQ-EXT-09.
-- Tasks: T-001 (scheduler_runs), T-002 (scheduler_assignments), T-003 (changeover_matrix +
--   changeover_matrix_versions), T-008 (scheduler_config).
--
-- Built ON the 04-planning-basic schema (migs 176-179: work_orders / schedule_outputs / mrp /
--   rough-cut capacity). This migration READS those tables at solve time and FK-references
--   work_orders; it does NOT recreate or alter them.
-- Canonical-owner separation (NEVER created/written here): wo_outputs + oee_snapshots +
--   downtime_events = 08-production; schedule_outputs = 04-planning; license_plates = 05-warehouse;
--   item_cost_history = 03-technical; quality_holds/ncr_reports = 09-quality.
--
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS ENABLED + FORCED via app.current_org_id()
--   (never raw GUC reads of the app.tenant_id / app.current_org_id session settings).
-- site_id day-1: site_id uuid nullable on every operational table (no FK / registry yet); full
--   per-site scoping (NOT NULL + (org_id, site_id) index + app.current_site_id() policy) lands
--   later via the 14-multi-site backfill.
-- NUMERIC-exact: all qty/duration/score/weight columns are NUMERIC or INTEGER (never float).
-- Audit: R13 audit COLUMNS (created_by/updated_by/created_at/updated_at) + set_updated_at trigger
--   per table. This repo has NO generic app.audit_event() row trigger (per quality 197 / finance 199
--   precedent); mutating-action audit_events rows are written by the Server Action layer.
--
-- Section (E) at the END regenerates the outbox_events CHECK to the FULL vocabulary
--   (events.enum.ts DB_EVENT_TYPES incl the 7 new planning.*/scheduler.*/matrix.* events) so the
--   enum<->CHECK drift gate (packages/outbox check-drift.test.ts) stays green — this is now the
--   highest-numbered migration that (re)creates the CHECK.

-- ===========================================================================
-- (A) scheduler_runs (T-001, §9.2) — finite-capacity solver run history.
--     run_id UUID PK (R14 idempotency: caller-supplied UUID v7).
-- ===========================================================================
create table if not exists public.scheduler_runs (
  run_id            uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  site_id           uuid,                                            -- site_id day-1

  requested_by      uuid references public.users(id) on delete set null,
  status            text not null default 'queued',
  horizon_days      integer not null,
  line_ids          text[],                                          -- soft FK to 02-settings production_lines
  include_forecast  text,
  optimizer_version text not null default 'v2',
  run_type          text not null default 'schedule',                -- OQ-EXT-09 dry-run reuse

  input_snapshot    jsonb,
  output_summary    jsonb,
  solve_duration_ms integer,
  error_message     text,

  queued_at         timestamptz not null default pg_catalog.now(),
  started_at        timestamptz,
  completed_at      timestamptz,

  created_at        timestamptz not null default pg_catalog.now(),
  updated_at        timestamptz not null default pg_catalog.now(),

  constraint scheduler_runs_status_check check (
    status in ('queued', 'running', 'completed', 'failed', 'cancelled')
  ),
  constraint scheduler_runs_horizon_days_check check (horizon_days >= 1 and horizon_days <= 30),
  constraint scheduler_runs_run_type_check check (
    run_type in ('schedule', 'dry_run', 'what_if')
  ),
  constraint scheduler_runs_solve_duration_nonneg_check check (
    solve_duration_ms is null or solve_duration_ms >= 0
  )
);

create index if not exists idx_scheduler_runs_org_status
  on public.scheduler_runs (org_id, status, queued_at);
create index if not exists idx_scheduler_runs_requested_by
  on public.scheduler_runs (requested_by, queued_at)
  where requested_by is not null;

alter table public.scheduler_runs enable row level security;
alter table public.scheduler_runs force row level security;
drop policy if exists scheduler_runs_org_context on public.scheduler_runs;
create policy scheduler_runs_org_context on public.scheduler_runs
  for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.scheduler_runs from public;
revoke all on public.scheduler_runs from app_user;
grant select, insert, update, delete on public.scheduler_runs to app_user;

drop trigger if exists scheduler_runs_set_updated_at on public.scheduler_runs;
create trigger scheduler_runs_set_updated_at
  before update on public.scheduler_runs
  for each row execute function app.set_updated_at();

-- ===========================================================================
-- (B) scheduler_assignments (T-002, §9.3) — draft/approved/rejected/overridden WO assignments.
--     run_id FK ON DELETE CASCADE; wo_id HARD FK to 04-planning work_orders.
-- ===========================================================================
create table if not exists public.scheduler_assignments (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  site_id                     uuid,                                  -- site_id day-1

  run_id                      uuid not null references public.scheduler_runs(run_id) on delete cascade,
  wo_id                       uuid not null references public.work_orders(id) on delete cascade,
  line_id                     text,                                  -- soft FK to 02-settings production_lines

  status                      text not null default 'draft',
  sequence_index              numeric(10, 2),
  planned_start_at            timestamptz,
  planned_end_at              timestamptz,
  changeover_minutes          numeric(10, 2),
  optimizer_score             numeric(10, 2),

  override_original_line_id   text,
  override_original_start_at  timestamptz,
  override_reason_code        text,
  override_by                 uuid references public.users(id) on delete set null,
  override_at                 timestamptz,

  approved_by                 uuid references public.users(id) on delete set null,
  approved_at                 timestamptz,

  ext                         jsonb not null default '{}'::jsonb,

  created_at                  timestamptz not null default pg_catalog.now(),
  updated_at                  timestamptz not null default pg_catalog.now(),

  constraint scheduler_assignments_status_check check (
    status in ('draft', 'approved', 'rejected', 'overridden')
  ),
  constraint scheduler_assignments_changeover_nonneg_check check (
    changeover_minutes is null or changeover_minutes >= 0
  ),
  constraint scheduler_assignments_time_order_check check (
    planned_end_at is null or planned_start_at is null or planned_start_at <= planned_end_at
  )
);

create index if not exists idx_scheduler_assignments_run    on public.scheduler_assignments (run_id);
create index if not exists idx_scheduler_assignments_wo     on public.scheduler_assignments (wo_id);
create index if not exists idx_scheduler_assignments_status on public.scheduler_assignments (org_id, status);
create index if not exists idx_scheduler_assignments_time   on public.scheduler_assignments (org_id, planned_start_at);
create index if not exists idx_scheduler_assignments_override_by
  on public.scheduler_assignments (override_by) where override_by is not null;
create index if not exists idx_scheduler_assignments_approved_by
  on public.scheduler_assignments (approved_by) where approved_by is not null;

alter table public.scheduler_assignments enable row level security;
alter table public.scheduler_assignments force row level security;
drop policy if exists scheduler_assignments_org_context on public.scheduler_assignments;
create policy scheduler_assignments_org_context on public.scheduler_assignments
  for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.scheduler_assignments from public;
revoke all on public.scheduler_assignments from app_user;
grant select, insert, update, delete on public.scheduler_assignments to app_user;

drop trigger if exists scheduler_assignments_set_updated_at on public.scheduler_assignments;
create trigger scheduler_assignments_set_updated_at
  before update on public.scheduler_assignments
  for each row execute function app.set_updated_at();

-- ===========================================================================
-- (C) changeover_matrix_versions + changeover_matrix (T-003, §9.4, §6 D5).
--     The EXTERNAL changeover contract 08-production consumes (planned lookup), distinct from
--     08's runtime changeover_events (recorded window, mig 184).
-- ===========================================================================
create table if not exists public.changeover_matrix_versions (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  site_id        uuid,                                               -- site_id day-1

  version_number integer not null,
  label          text,
  is_active      boolean not null default false,
  status         text not null default 'draft',

  published_by   uuid references public.users(id) on delete set null,
  published_at   timestamptz,

  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default pg_catalog.now(),
  updated_at     timestamptz not null default pg_catalog.now(),

  constraint changeover_matrix_versions_org_version_unique unique (org_id, version_number),
  constraint changeover_matrix_versions_status_check check (
    status in ('draft', 'pending_review', 'active', 'archived')
  ),
  constraint changeover_matrix_versions_version_positive_check check (version_number >= 1)
);

-- D5: only ONE active version per org (partial unique on is_active=true).
create unique index if not exists idx_changeover_active_per_org
  on public.changeover_matrix_versions (org_id) where is_active = true;
create index if not exists idx_changeover_matrix_versions_org
  on public.changeover_matrix_versions (org_id);

alter table public.changeover_matrix_versions enable row level security;
alter table public.changeover_matrix_versions force row level security;
drop policy if exists changeover_matrix_versions_org_context on public.changeover_matrix_versions;
create policy changeover_matrix_versions_org_context on public.changeover_matrix_versions
  for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.changeover_matrix_versions from public;
revoke all on public.changeover_matrix_versions from app_user;
grant select, insert, update, delete on public.changeover_matrix_versions to app_user;

drop trigger if exists changeover_matrix_versions_set_updated_at on public.changeover_matrix_versions;
create trigger changeover_matrix_versions_set_updated_at
  before update on public.changeover_matrix_versions
  for each row execute function app.set_updated_at();

create table if not exists public.changeover_matrix (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  site_id            uuid,                                           -- site_id day-1

  version_id         uuid not null references public.changeover_matrix_versions(id) on delete cascade,
  line_id            text,                                           -- D5: NULL = org default; non-NULL = per-line override
  allergen_from      text not null,
  allergen_to        text not null,
  changeover_minutes numeric(10, 2) not null,
  requires_cleaning  boolean not null default false,
  requires_atp       boolean not null default false,
  risk_level         text not null default 'low',
  notes              text,

  created_at         timestamptz not null default pg_catalog.now(),
  updated_at         timestamptz not null default pg_catalog.now(),

  -- NULL line_id (default) + a specific line_id (override) coexist for the same pair+version
  -- because NULLs are distinct in a UNIQUE constraint.
  constraint changeover_matrix_pair_unique unique (org_id, version_id, line_id, allergen_from, allergen_to),
  constraint changeover_matrix_risk_level_check check (
    risk_level in ('low', 'medium', 'high', 'segregated')
  ),
  constraint changeover_matrix_changeover_nonneg_check check (changeover_minutes >= 0)
);

create index if not exists idx_changeover_matrix_version  on public.changeover_matrix (version_id);
create index if not exists idx_changeover_matrix_org_pair on public.changeover_matrix (org_id, allergen_from, allergen_to);
create index if not exists idx_changeover_matrix_line     on public.changeover_matrix (line_id) where line_id is not null;

alter table public.changeover_matrix enable row level security;
alter table public.changeover_matrix force row level security;
drop policy if exists changeover_matrix_org_context on public.changeover_matrix;
create policy changeover_matrix_org_context on public.changeover_matrix
  for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.changeover_matrix from public;
revoke all on public.changeover_matrix from app_user;
grant select, insert, update, delete on public.changeover_matrix to app_user;

drop trigger if exists changeover_matrix_set_updated_at on public.changeover_matrix;
create trigger changeover_matrix_set_updated_at
  before update on public.changeover_matrix
  for each row execute function app.set_updated_at();

-- ===========================================================================
-- (D) scheduler_config (T-008, PLE-005) — extended finite-capacity / sequencing config.
--     One row per (org_id, line_id) scope; line_id NULL = org-wide default.
-- ===========================================================================
create table if not exists public.scheduler_config (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations(id) on delete cascade,
  site_id                uuid,                                       -- site_id day-1
  line_id                text,                                       -- NULL = org default; non-NULL = per-line override

  default_horizon_days   integer not null default 7,
  optimizer_version      text not null default 'v2',
  sequencing_strategy    text not null default 'greedy',
  capacity_hours_per_day numeric(8, 2),
  changeover_weight      numeric(6, 4) not null default 1.0000,
  duedate_weight         numeric(6, 4) not null default 1.0000,
  utilization_weight     numeric(6, 4) not null default 1.0000,
  respect_pm_windows     boolean not null default true,
  allow_alternate_routings boolean not null default false,
  params                 jsonb not null default '{}'::jsonb,

  created_by             uuid references public.users(id) on delete set null,
  updated_by             uuid references public.users(id) on delete set null,
  created_at             timestamptz not null default pg_catalog.now(),
  updated_at             timestamptz not null default pg_catalog.now(),

  constraint scheduler_config_org_line_unique unique (org_id, line_id),
  constraint scheduler_config_horizon_check check (
    default_horizon_days >= 1 and default_horizon_days <= 30
  ),
  constraint scheduler_config_strategy_check check (
    sequencing_strategy in ('greedy', 'local_search', 'allergen_optimized')
  ),
  constraint scheduler_config_capacity_nonneg_check check (
    capacity_hours_per_day is null or capacity_hours_per_day >= 0
  )
);

create index if not exists idx_scheduler_config_org  on public.scheduler_config (org_id);
create index if not exists idx_scheduler_config_line on public.scheduler_config (line_id) where line_id is not null;

alter table public.scheduler_config enable row level security;
alter table public.scheduler_config force row level security;
drop policy if exists scheduler_config_org_context on public.scheduler_config;
create policy scheduler_config_org_context on public.scheduler_config
  for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.scheduler_config from public;
revoke all on public.scheduler_config from app_user;
grant select, insert, update, delete on public.scheduler_config to app_user;

drop trigger if exists scheduler_config_set_updated_at on public.scheduler_config;
create trigger scheduler_config_set_updated_at
  before update on public.scheduler_config
  for each row execute function app.set_updated_at();


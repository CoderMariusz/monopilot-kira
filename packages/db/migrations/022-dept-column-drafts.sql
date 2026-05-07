-- Migration 022: dept_column_drafts + dept_column_migrations (T-036)
-- Schema-driven column draft/publish workflow with schema_version bump tracking.
--
-- Naming note: T-036 JSON specified `schema_migrations` for the column-version log.
-- That collides with T-054's `public.schema_migrations` runner-state table, so this
-- migration uses the renamed `dept_column_migrations` instead. RED tests pin the
-- renamed identifier (see _meta/atomic-tasks/00-foundation/notes/T-036.md).
--
-- Migration filename note: T-036 JSON specified 011-dept-column-drafts.sql, but
-- 011 is taken by T-019 departments. Orchestrator reassigned to 022 (020/021 are
-- intentionally vacant per T-016 REWORK γ revert).

-- ============================================================
-- 1. dept_column_drafts table
-- ============================================================
create table if not exists public.dept_column_drafts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  dept_id           uuid NOT NULL,
  column_key        text NOT NULL,
  field_type        text NOT NULL,
  validation_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  presentation_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status            text NOT NULL DEFAULT 'draft',
  created_by        uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT pg_catalog.now()
);

-- Idempotent CHECK constraints (drop+add for re-entrant runs)
alter table public.dept_column_drafts
  drop constraint if exists dept_column_drafts_field_type_check;
alter table public.dept_column_drafts
  add constraint dept_column_drafts_field_type_check
  check (field_type in ('string','number','date','enum','formula','relation'));

alter table public.dept_column_drafts
  drop constraint if exists dept_column_drafts_status_check;
alter table public.dept_column_drafts
  add constraint dept_column_drafts_status_check
  check (status in ('draft','published'));

create index if not exists dept_column_drafts_org_dept_idx
  on public.dept_column_drafts (org_id, dept_id);
create index if not exists dept_column_drafts_org_status_idx
  on public.dept_column_drafts (org_id, status);

-- ============================================================
-- 2. dept_column_migrations table (column-version audit log)
--    RENAMED from JSON's `schema_migrations` (collides with T-054 runner table).
-- ============================================================
create table if not exists public.dept_column_migrations (
  id              bigserial PRIMARY KEY,
  org_id          uuid NOT NULL,
  dept_column_id  uuid NOT NULL,
  prev_version    integer NOT NULL,
  new_version     integer NOT NULL,
  applied_at      timestamptz NOT NULL DEFAULT pg_catalog.now()
);

-- Unique index for idempotent INSERT ... ON CONFLICT DO NOTHING in publish.
create unique index if not exists dept_column_migrations_unique_per_version
  on public.dept_column_migrations (dept_column_id, new_version);

create index if not exists dept_column_migrations_org_idx
  on public.dept_column_migrations (org_id);

-- ============================================================
-- 3. Row Level Security: ENABLE + FORCE on both tables
-- ============================================================
alter table public.dept_column_drafts enable row level security;
alter table public.dept_column_drafts force row level security;

alter table public.dept_column_migrations enable row level security;
alter table public.dept_column_migrations force row level security;

drop policy if exists dept_column_drafts_org_context on public.dept_column_drafts;
create policy dept_column_drafts_org_context
  on public.dept_column_drafts
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists dept_column_migrations_org_context on public.dept_column_migrations;
create policy dept_column_migrations_org_context
  on public.dept_column_migrations
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- ============================================================
-- 4. Grants
-- ============================================================
grant select, insert, update, delete on public.dept_column_drafts    to app_user;
grant select, insert, update, delete on public.dept_column_migrations to app_user;
grant usage, select on sequence public.dept_column_migrations_id_seq to app_user;

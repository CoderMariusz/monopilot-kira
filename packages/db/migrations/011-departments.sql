-- Migration 011: Reference.Departments configurable taxonomy seed (ADR-030)
-- T-019 — 7 Apex departments + organizations.dept_overrides JSONB
-- Marker: [APEX-CONFIG] seed rows per PRD §9; schema is [UNIVERSAL]

-- ============================================================
-- 1. Create Reference schema (idempotent)
-- ============================================================
create schema if not exists "Reference";

-- ============================================================
-- 2. Reference.Departments table [UNIVERSAL]
-- ============================================================
create table if not exists "Reference"."Departments" (
  id               uuid primary key,
  org_id           uuid not null references public.organizations(id) on delete cascade,
  code             text not null,
  display_name     text not null,
  role_description text not null,
  marker           text not null default 'APEX-CONFIG',
  created_at       timestamptz not null default pg_catalog.now(),
  constraint departments_org_id_code_unique unique (org_id, code)
);

-- Add any missing columns idempotently (for re-entrant runs)
alter table "Reference"."Departments"
  add column if not exists id               uuid,
  add column if not exists org_id           uuid,
  add column if not exists code             text,
  add column if not exists display_name     text,
  add column if not exists role_description text,
  add column if not exists marker           text,
  add column if not exists created_at       timestamptz;

-- Ensure marker default is set
alter table "Reference"."Departments"
  alter column marker      set default 'APEX-CONFIG',
  alter column created_at  set default pg_catalog.now();

create index if not exists departments_org_id_idx on "Reference"."Departments" (org_id);

-- ============================================================
-- 3. Row Level Security — org_id scoped (HOTFIX T-019)
-- ============================================================
alter table "Reference"."Departments" enable row level security;
alter table "Reference"."Departments" force row level security;

drop policy if exists "Departments_org_isolation" on "Reference"."Departments";
create policy "Departments_org_isolation" on "Reference"."Departments"
  for all to public
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

grant select, insert, update, delete on "Reference"."Departments" to app_user;

-- ============================================================
-- 4. Add dept_overrides JSONB to organizations [UNIVERSAL]
-- ============================================================
alter table public.organizations
  add column if not exists dept_overrides jsonb not null default '{}'::jsonb;

-- ============================================================
-- 5. Seed 7 Apex departments [APEX-CONFIG]
--    Requires Apex org to exist in public.organizations.
--    Seeded via apex-departments.sql (called separately); this
--    migration only ensures the schema is ready.
-- ============================================================

-- Migration 009: Reference.DeptColumns + Reference.FieldTypes + Reference.Formulas (ADR-030)
-- T-017 — json-schema-to-zod runtime engine metadata tables
-- Marker: [UNIVERSAL] — org-scoped schema-driven column definitions

-- ============================================================
-- 1. Ensure Reference schema exists (idempotent)
-- ============================================================
create schema if not exists "Reference";

-- ============================================================
-- 2. Reference.FieldTypes table [UNIVERSAL]
--    Stores canonical field type definitions with JSON Schema
-- ============================================================
create table if not exists "Reference"."FieldTypes" (
  code         text primary key,
  ts_type      text not null,
  json_schema  jsonb not null,
  created_at   timestamptz not null default pg_catalog.now(),
  created_by_user   uuid,
  created_by_device text,
  app_version  text,
  model_prediction_id uuid,
  epcis_event_id text,
  schema_version integer not null default 1
);

alter table "Reference"."FieldTypes"
  add column if not exists code          text,
  add column if not exists ts_type       text,
  add column if not exists json_schema   jsonb,
  add column if not exists created_at    timestamptz,
  add column if not exists created_by_user   uuid,
  add column if not exists created_by_device text,
  add column if not exists app_version   text,
  add column if not exists model_prediction_id uuid,
  add column if not exists epcis_event_id text,
  add column if not exists schema_version integer;

alter table "Reference"."FieldTypes"
  alter column created_at   set default pg_catalog.now(),
  alter column schema_version set default 1;

update "Reference"."FieldTypes"
set
  created_at     = coalesce(created_at, pg_catalog.now()),
  schema_version = coalesce(schema_version, 1)
where created_at is null
   or schema_version is null;

alter table "Reference"."FieldTypes"
  alter column created_at     set not null,
  alter column schema_version set not null;

-- Seed canonical field types (idempotent)
insert into "Reference"."FieldTypes" (code, ts_type, json_schema)
values
  ('string',  'string',  '{"type": "string"}'::jsonb),
  ('number',  'number',  '{"type": "number"}'::jsonb),
  ('integer', 'number',  '{"type": "integer"}'::jsonb),
  ('boolean', 'boolean', '{"type": "boolean"}'::jsonb),
  ('date',    'string',  '{"type": "string", "format": "date"}'::jsonb),
  ('datetime','string',  '{"type": "string", "format": "date-time"}'::jsonb),
  ('enum',    'string',  '{"type": "string"}'::jsonb),
  ('formula', 'string',  '{"type": "string"}'::jsonb)
on conflict (code) do nothing;

-- ============================================================
-- 3. Reference.DeptColumns table [UNIVERSAL]
--    Org-scoped column definitions per department
-- ============================================================
create table if not exists "Reference"."DeptColumns" (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  dept_code      text not null,
  column_key     text not null,
  field_type     text not null references "Reference"."FieldTypes"(code),
  is_required    boolean not null default false,
  validation_dsl jsonb,
  schema_version integer not null default 1,
  created_at     timestamptz not null default pg_catalog.now(),
  created_by_user    uuid,
  created_by_device  text,
  app_version    text,
  model_prediction_id uuid,
  epcis_event_id text,
  constraint dept_columns_org_dept_key_unique unique (org_id, dept_code, column_key)
);

alter table "Reference"."DeptColumns"
  add column if not exists id             uuid,
  add column if not exists org_id         uuid,
  add column if not exists dept_code      text,
  add column if not exists column_key     text,
  add column if not exists field_type     text,
  add column if not exists is_required    boolean,
  add column if not exists validation_dsl jsonb,
  add column if not exists schema_version integer,
  add column if not exists created_at     timestamptz,
  add column if not exists created_by_user    uuid,
  add column if not exists created_by_device  text,
  add column if not exists app_version    text,
  add column if not exists model_prediction_id uuid,
  add column if not exists epcis_event_id text;

alter table "Reference"."DeptColumns"
  alter column is_required    set default false,
  alter column schema_version set default 1,
  alter column created_at     set default pg_catalog.now();

update "Reference"."DeptColumns"
set
  is_required    = coalesce(is_required, false),
  schema_version = coalesce(schema_version, 1),
  created_at     = coalesce(created_at, pg_catalog.now())
where is_required is null
   or schema_version is null
   or created_at is null;

alter table "Reference"."DeptColumns"
  alter column is_required    set not null,
  alter column schema_version set not null,
  alter column created_at     set not null;

create index if not exists dept_columns_org_dept_idx
  on "Reference"."DeptColumns" (org_id, dept_code);

create index if not exists dept_columns_schema_version_idx
  on "Reference"."DeptColumns" (org_id, dept_code, schema_version);

-- ============================================================
-- 4. Reference.Formulas table [UNIVERSAL]
--    Org-scoped formula expressions per key
-- ============================================================
create table if not exists "Reference"."Formulas" (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  formula_key  text not null,
  expression   text not null,
  created_at   timestamptz not null default pg_catalog.now(),
  created_by_user    uuid,
  created_by_device  text,
  app_version  text,
  model_prediction_id uuid,
  epcis_event_id text,
  schema_version integer not null default 1,
  constraint formulas_org_key_unique unique (org_id, formula_key)
);

alter table "Reference"."Formulas"
  add column if not exists id           uuid,
  add column if not exists org_id       uuid,
  add column if not exists formula_key  text,
  add column if not exists expression   text,
  add column if not exists created_at   timestamptz,
  add column if not exists created_by_user    uuid,
  add column if not exists created_by_device  text,
  add column if not exists app_version  text,
  add column if not exists model_prediction_id uuid,
  add column if not exists epcis_event_id text,
  add column if not exists schema_version integer;

alter table "Reference"."Formulas"
  alter column created_at     set default pg_catalog.now(),
  alter column schema_version set default 1;

update "Reference"."Formulas"
set
  created_at     = coalesce(created_at, pg_catalog.now()),
  schema_version = coalesce(schema_version, 1)
where created_at is null
   or schema_version is null;

alter table "Reference"."Formulas"
  alter column created_at     set not null,
  alter column schema_version set not null;

create index if not exists formulas_org_id_idx
  on "Reference"."Formulas" (org_id);

-- ============================================================
-- 5. Row Level Security
-- ============================================================
grant usage on schema "Reference" to app_user;
grant select, insert, update, delete
  on "Reference"."FieldTypes", "Reference"."DeptColumns", "Reference"."Formulas"
  to app_user;

alter table "Reference"."FieldTypes" enable row level security;
alter table "Reference"."DeptColumns" enable row level security;
alter table "Reference"."Formulas"    enable row level security;

alter table "Reference"."FieldTypes" force row level security;
alter table "Reference"."DeptColumns" force row level security;
alter table "Reference"."Formulas"    force row level security;

-- FieldTypes: readable by all authenticated users (reference data)
drop policy if exists field_types_readable on "Reference"."FieldTypes";
create policy field_types_readable
  on "Reference"."FieldTypes"
  for select
  to app_user
  using (true);

-- DeptColumns: scoped to current org context
drop policy if exists dept_columns_org_context on "Reference"."DeptColumns";
create policy dept_columns_org_context
  on "Reference"."DeptColumns"
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- Formulas: scoped to current org context
drop policy if exists formulas_org_context on "Reference"."Formulas";
create policy formulas_org_context
  on "Reference"."Formulas"
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

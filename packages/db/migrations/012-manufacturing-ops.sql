-- Migration 012: Reference.ManufacturingOperations (ADR-028 extension)
-- T-020 — manufacturing operations taxonomy per industry (bakery/pharma/fmcg/generic)
-- Marker: [APEX-CONFIG] seed rows per PRD §9.1; schema is [UNIVERSAL]

-- ============================================================
-- 1. Create Reference schema (idempotent)
-- ============================================================
create schema if not exists "Reference";

-- ============================================================
-- 2. Reference.ManufacturingOperations table [UNIVERSAL]
-- ============================================================
create table if not exists "Reference"."ManufacturingOperations" (
  id              uuid        primary key default gen_random_uuid(),
  org_id          uuid        not null references public.organizations(id) on delete cascade,
  operation_name  text        not null,
  process_suffix  text        not null check (process_suffix ~ '^[A-Z0-9]{2,4}$'),
  description     text,
  operation_seq   int,
  industry_code   text        not null,
  is_active       boolean     not null default true,
  marker          text        not null default 'APEX-CONFIG',
  created_at      timestamptz not null default now(),
  constraint mfg_ops_org_industry_suffix_unique unique (org_id, industry_code, process_suffix)
);

-- Add any missing columns idempotently (for re-entrant runs)
alter table "Reference"."ManufacturingOperations"
  add column if not exists id             uuid,
  add column if not exists org_id         uuid,
  add column if not exists operation_name text,
  add column if not exists process_suffix text,
  add column if not exists description    text,
  add column if not exists operation_seq  int,
  add column if not exists industry_code  text,
  add column if not exists is_active      boolean,
  add column if not exists marker         text,
  add column if not exists created_at     timestamptz;

-- Ensure column defaults are set
alter table "Reference"."ManufacturingOperations"
  alter column is_active  set default true,
  alter column marker     set default 'APEX-CONFIG',
  alter column created_at set default now();

create index if not exists mfg_ops_org_id_idx
  on "Reference"."ManufacturingOperations" (org_id);

create index if not exists mfg_ops_org_industry_idx
  on "Reference"."ManufacturingOperations" (org_id, industry_code);

-- ============================================================
-- 3. Row Level Security — org_id scoped
-- ============================================================
alter table "Reference"."ManufacturingOperations" enable row level security;
alter table "Reference"."ManufacturingOperations" force row level security;

drop policy if exists "ManufacturingOperations_org_isolation"
  on "Reference"."ManufacturingOperations";

create policy "ManufacturingOperations_org_isolation"
  on "Reference"."ManufacturingOperations"
  for all to public
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

grant select, insert, update, delete on "Reference"."ManufacturingOperations" to app_user;

-- =============================================================================
-- Monopilot combined migrations — paste into Supabase SQL Editor
-- Generated: 2026-05-13  (33 migration files)
-- Idempotent: safe to run multiple times.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 001-baseline.sql
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  perform pg_advisory_xact_lock(hashtext('monopilot:baseline:citext'));
  create extension if not exists citext;
end $$;

create table if not exists public.tenants (
  id uuid primary key,
  name text not null,
  region_cluster text,
  data_plane_url text,
  created_at timestamptz,
  constraint tenants_region_cluster_check check (region_cluster in ('eu', 'us'))
);

alter table public.tenants
  add column if not exists region_cluster text,
  add column if not exists data_plane_url text,
  add column if not exists created_at timestamptz;

update public.tenants
set
  region_cluster = coalesce(region_cluster, 'eu'),
  data_plane_url = coalesce(data_plane_url, ''),
  created_at = coalesce(created_at, pg_catalog.now())
where region_cluster is null
  or data_plane_url is null
  or created_at is null;

alter table public.tenants
  alter column region_cluster set default 'eu',
  alter column region_cluster set not null,
  alter column data_plane_url set not null,
  alter column created_at set not null,
  alter column created_at set default pg_catalog.now();

alter table public.tenants drop constraint if exists tenants_region_cluster_check;
alter table public.tenants add constraint tenants_region_cluster_check check (region_cluster in ('eu', 'us'));

create table if not exists public.organizations (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id),
  name text not null,
  industry_code text,
  external_id text,
  created_at timestamptz,
  created_by_user uuid,
  created_by_device text,
  app_version text,
  model_prediction_id uuid,
  epcis_event_id text,
  schema_version integer,
  constraint organizations_industry_code_check check (industry_code in ('bakery', 'pharma', 'fmcg', 'generic'))
);

alter table public.organizations
  add column if not exists tenant_id uuid,
  add column if not exists name text,
  add column if not exists industry_code text,
  add column if not exists external_id text,
  add column if not exists created_at timestamptz,
  add column if not exists created_by_user uuid,
  add column if not exists created_by_device text,
  add column if not exists app_version text,
  add column if not exists model_prediction_id uuid,
  add column if not exists epcis_event_id text,
  add column if not exists schema_version integer;

update public.organizations
set
  industry_code = coalesce(industry_code, 'generic'),
  created_at = coalesce(created_at, pg_catalog.now()),
  schema_version = coalesce(schema_version, 1)
where tenant_id is null
  or industry_code is null
  or created_at is null
  or schema_version is null;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.organizations
    WHERE tenant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Baseline migration requires organizations.tenant_id for all rows.';
  END IF;
END $$;

alter table public.organizations
  alter column name set not null,
  alter column tenant_id set not null,
  alter column industry_code set not null,
  alter column created_at set not null,
  alter column created_at set default pg_catalog.now(),
  alter column schema_version set default 1,
  alter column schema_version set not null;

alter table public.organizations drop constraint if exists organizations_industry_code_check;
alter table public.organizations add constraint organizations_industry_code_check check (industry_code in ('bakery', 'pharma', 'fmcg', 'generic'));

create index if not exists organizations_tenant_id_idx on public.organizations (tenant_id);

DO $$
DECLARE
  fk_name text;
BEGIN
  FOR fk_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.organizations'::regclass
      AND c.contype = 'f'
      AND c.confrelid = 'public.tenants'::regclass
  LOOP
    EXECUTE format('alter table public.organizations drop constraint %I', fk_name);
  END LOOP;

  alter table public.organizations
    add constraint organizations_tenant_id_fkey foreign key (tenant_id) references public.tenants(id);
END;
$$;

create table if not exists public.users (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  email citext,
  display_name text,
  external_id text,
  created_at timestamptz,
  created_by_user uuid,
  created_by_device text,
  app_version text,
  model_prediction_id uuid,
  epcis_event_id text,
  schema_version integer,
  constraint users_org_id_email_unique unique (org_id, email)
);

do $$
begin
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'email'
      AND data_type = 'text'
  ) THEN
    alter table public.users
      alter column email type citext using email::citext;
  END IF;
end $$;

alter table public.users
  alter column email set not null;

alter table public.users
  add column if not exists org_id uuid,
  add column if not exists email citext,
  add column if not exists display_name text,
  add column if not exists external_id text,
  add column if not exists created_at timestamptz,
  add column if not exists created_by_user uuid,
  add column if not exists created_by_device text,
  add column if not exists app_version text,
  add column if not exists model_prediction_id uuid,
  add column if not exists epcis_event_id text,
  add column if not exists schema_version integer;

update public.users
set
  created_at = coalesce(created_at, pg_catalog.now()),
  schema_version = coalesce(schema_version, 1)
where created_at is null
  or schema_version is null;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.users
    WHERE org_id IS NULL
       OR email IS NULL
  ) THEN
    RAISE EXCEPTION 'Baseline migration requires users.org_id and users.email for all rows.';
  END IF;
END $$;

alter table public.users
  alter column org_id set not null,
  alter column created_at set not null,
  alter column created_at set default pg_catalog.now(),
  alter column schema_version set default 1,
  alter column schema_version set not null;

DO $$
DECLARE
  fk_name text;
BEGIN
  FOR fk_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.users'::regclass
      AND c.contype = 'f'
      AND c.confrelid = 'public.organizations'::regclass
  LOOP
    EXECUTE format('alter table public.users drop constraint %I', fk_name);
  END LOOP;

  alter table public.users
    add constraint users_org_id_fkey foreign key (org_id) references public.organizations(id);
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.users'::regclass
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname ORDER BY cols.ordinality)
        FROM unnest(c.conkey) WITH ORDINALITY AS cols(attnum, ordinality)
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid
         AND a.attnum = cols.attnum
         AND NOT a.attisdropped
      ) = ARRAY['org_id', 'email']::name[]
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_org_id_email_unique UNIQUE (org_id, email);
  END IF;
END;
$$;

create index if not exists users_org_id_idx on public.users (org_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 002-rls-baseline.sql
-- ─────────────────────────────────────────────────────────────────────────────
create schema if not exists app;

revoke all on schema app from public;
grant usage on schema app to app_user;

create table if not exists app.session_org_contexts (
  session_token uuid primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now()
);

create table if not exists app.active_org_contexts (
  backend_pid integer primary key,
  transaction_id bigint not null,
  session_token uuid not null references app.session_org_contexts(session_token) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  set_at timestamptz not null default pg_catalog.now()
);

revoke all on app.session_org_contexts from public;
revoke all on app.session_org_contexts from app_user;
revoke all on app.active_org_contexts from public;
revoke all on app.active_org_contexts from app_user;

create or replace function app.set_org_context(session_token uuid, org uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if not exists (
    select 1
    from app.session_org_contexts trusted_context
    where trusted_context.session_token = set_org_context.session_token
      and trusted_context.org_id = set_org_context.org
  ) then
    raise exception 'invalid organization context'
      using errcode = '28000';
  end if;

  insert into app.active_org_contexts (backend_pid, transaction_id, session_token, org_id, set_at)
  values (pg_catalog.pg_backend_pid(), pg_catalog.txid_current(), set_org_context.session_token, set_org_context.org, pg_catalog.now())
  on conflict (backend_pid) do update
    set transaction_id = excluded.transaction_id,
        session_token = excluded.session_token,
        org_id = excluded.org_id,
        set_at = excluded.set_at;

  return set_org_context.org;
end;
$$;

create or replace function app.current_org_id()
returns uuid
language sql
security definer
set search_path = pg_catalog
as $$
  select active_context.org_id
  from app.active_org_contexts active_context
  join app.session_org_contexts trusted_context
    on trusted_context.session_token = active_context.session_token
   and trusted_context.org_id = active_context.org_id
  where active_context.backend_pid = pg_catalog.pg_backend_pid()
    and active_context.transaction_id = pg_catalog.txid_current_if_assigned()
  limit 1
$$;

revoke all on function app.set_org_context(uuid, uuid) from public;
revoke all on function app.current_org_id() from public;
grant execute on function app.set_org_context(uuid, uuid) to app_user;
grant execute on function app.current_org_id() to app_user;

revoke all on public.tenants from app_user;
grant select, insert, update, delete on public.organizations, public.users to app_user;

alter table public.organizations enable row level security;
alter table public.users enable row level security;

alter table public.organizations force row level security;
alter table public.users force row level security;

drop policy if exists organizations_org_context on public.organizations;
create policy organizations_org_context
  on public.organizations
  for all
  to app_user
  using (id = app.current_org_id())
  with check (id = app.current_org_id());

drop policy if exists users_org_context on public.users;
create policy users_org_context
  on public.users
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 003-outbox.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003: outbox_events table for transactional outbox pattern
-- Scope: org_id (business/application scope per Wave0 v4.3)
-- Event type constraint enforced against canonical EventType members from T-003

create table if not exists public.outbox_events (
  id            bigserial    primary key,
  org_id        uuid         not null,
  event_type    text         not null,
  aggregate_type text        not null,
  aggregate_id  uuid         not null,
  payload       jsonb        not null,
  created_at    timestamptz  not null default pg_catalog.now(),
  consumed_at   timestamptz,
  app_version   text         not null,
  constraint outbox_events_event_type_check check (
    event_type in (
      'org.created',
      'user.invited',
      'role.assigned',
      'audit.recorded',
      'brief.created',
      'fg.created',
      'fg.allergens_changed',
      'fg.intermediate_code_changed',
      'lp.received',
      'wo.ready',
      'quality.recorded',
      'shipment.created'
    )
  )
);

-- Partial index on (org_id, created_at) for unconsumed events — used by worker poll query
create index if not exists outbox_events_unconsumed_idx
  on public.outbox_events (org_id, created_at)
  where consumed_at is null;

-- Enable RLS on outbox_events (bypassed for service-role/superuser poll worker)
alter table public.outbox_events enable row level security;
alter table public.outbox_events force row level security;

drop policy if exists outbox_events_org_context on public.outbox_events;
create policy outbox_events_org_context
  on public.outbox_events
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 004-audit.sql
-- ─────────────────────────────────────────────────────────────────────────────
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
create trigger audit_events_impersonation_guard_trg
  before insert on public.audit_events
  for each row execute function public.audit_events_impersonation_guard();

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

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 005-tenant-idp-config.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 005: tenant_idp_config table per PRD §8.x with F-U5 default seed values
-- Scope: control-plane only (tenant-scoped; app_user has no access per 002-rls-baseline pattern)
-- Trigger: AFTER INSERT on tenants auto-seeds one default row per F-U5 / PRD §13

create table if not exists public.tenant_idp_config (
  tenant_id            uuid         not null primary key references public.tenants(id) on delete cascade,
  provider_type        varchar      not null default 'password',
  idle_timeout_min     int          not null default 60,
  session_max_h        int          not null default 8,
  mfa_required         boolean      not null default true,
  mfa_required_for_roles text[]     not null default array['org.access.admin', 'org.schema.admin'],
  mfa_allowed_methods  text[]       not null default array['totp'],
  password_complexity  varchar      not null default 'strong',
  constraint tenant_idp_config_provider_type_check
    check (provider_type in ('saml', 'oidc', 'password', 'magic'))
);

-- Seed function: inserts F-U5 default row for each new tenant
create or replace function public.seed_tenant_idp_config()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.tenant_idp_config (
    tenant_id,
    provider_type,
    idle_timeout_min,
    session_max_h,
    mfa_required,
    mfa_required_for_roles,
    mfa_allowed_methods,
    password_complexity
  ) values (
    new.id,
    'password',
    60,
    8,
    true,
    array['org.access.admin', 'org.schema.admin'],
    array['totp'],
    'strong'
  )
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;

-- AFTER INSERT trigger on tenants
drop trigger if exists tenants_seed_idp_config on public.tenants;
create trigger tenants_seed_idp_config
  after insert on public.tenants
  for each row
  execute function public.seed_tenant_idp_config();

-- RLS: tenant_idp_config is control-plane-only; revoke app_user access (mirrors tenants pattern from 002)
revoke all on public.tenant_idp_config from app_user;

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 006-app-role.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 006-app-role.sql
-- Purpose: Create monopilot_app (NOLOGIN template) and monopilot_app_local (LOGIN per-env)
--          roles; ensure app_user exists as test login role; apply FORCE ROW LEVEL SECURITY.
-- Idempotent: all role creation uses DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL $$

-- Step 1: Create monopilot_app NOLOGIN template role (no SUPERUSER, no BYPASSRLS)
DO $$
BEGIN
  CREATE ROLE monopilot_app
    NOLOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOINHERIT
    NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

-- Step 2: Create per-env login role monopilot_app_local inheriting from monopilot_app
DO $$
BEGIN
  CREATE ROLE monopilot_app_local
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    INHERIT
    NOBYPASSRLS
    IN ROLE monopilot_app;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

-- Step 3: Ensure app_user exists as a test login role (inherits from monopilot_app)
DO $$
BEGIN
  CREATE ROLE app_user
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    INHERIT
    NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

-- Ensure app_user is a member of monopilot_app (idempotent via DO block)
DO $$
BEGIN
  GRANT monopilot_app TO app_user;
EXCEPTION WHEN others THEN
  NULL;
END
$$;

-- Step 4: Grant schema usage
GRANT USAGE ON SCHEMA public TO monopilot_app;

-- Step 5: Grant DML on all three tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO monopilot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO monopilot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO monopilot_app;

-- Step 6: Enable and FORCE ROW LEVEL SECURITY on all three tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

-- Step 7: Revoke superuser-style privileges from monopilot_app and app_user
-- (NOSUPERUSER / NOBYPASSRLS are already set at CREATE ROLE time above)
ALTER ROLE monopilot_app NOSUPERUSER NOBYPASSRLS;
ALTER ROLE monopilot_app_local NOSUPERUSER NOBYPASSRLS;
ALTER ROLE app_user NOSUPERUSER NOBYPASSRLS;

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 007-mfa.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 007: TOTP MFA enrolment tables (T-015)
-- Tables: mfa_secrets (libsodium secretbox encrypted TOTP secret)
--         recovery_codes (argon2id hashed one-time recovery codes)
-- Scope: T-015 — TOTP enrolment via otplib + argon2id recovery codes + WebAuthn stub

-- ============================================================
-- 1. mfa_secrets: one row per enrolled user
--    secret_encrypted = base64(nonce + libsodium.crypto_secretbox_easy(rawSecret, nonce, key))
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mfa_secrets (
  user_id          uuid        PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  secret_encrypted text        NOT NULL,
  enrolled_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. recovery_codes: 10 codes per user, argon2id hashed, one-time use
-- ============================================================
CREATE TABLE IF NOT EXISTS public.recovery_codes (
  id         bigserial   PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  code_hash  text        NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. Enable + Force RLS on both tables
-- ============================================================
ALTER TABLE public.mfa_secrets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfa_secrets     FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_codes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_codes  FORCE ROW LEVEL SECURITY;

-- ============================================================
-- 4. RLS policies: org-scoped via JOIN to users.org_id
-- ============================================================
DROP POLICY IF EXISTS mfa_secrets_org_context ON public.mfa_secrets;
CREATE POLICY mfa_secrets_org_context ON public.mfa_secrets
  USING (user_id IN (SELECT id FROM public.users WHERE org_id = app.current_org_id()));

DROP POLICY IF EXISTS recovery_codes_org_context ON public.recovery_codes;
CREATE POLICY recovery_codes_org_context ON public.recovery_codes
  USING (user_id IN (SELECT id FROM public.users WHERE org_id = app.current_org_id()));

-- ============================================================
-- 5. GRANTs
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON public.mfa_secrets    TO app_user;
GRANT SELECT, INSERT, UPDATE ON public.recovery_codes TO app_user;
GRANT USAGE ON SEQUENCE public.recovery_codes_id_seq TO app_user;

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 009-schema-driven.sql
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 010-rules.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 010: Reference.Rules table (ADR-029 DSL executor)
-- T-018 — rule_type CHECK (cascading|conditional_required|gate|workflow)
-- Scope: [UNIVERSAL] — org_id scoped, RLS enforced via app.current_org_id()

-- ============================================================
-- 1. Ensure Reference schema exists (idempotent)
-- ============================================================
create schema if not exists "Reference";

-- ============================================================
-- 2. Reference.Rules table [UNIVERSAL]
-- ============================================================
create table if not exists "Reference"."Rules" (
  id               uuid primary key,
  org_id           uuid not null references public.organizations(id) on delete cascade,
  rule_id          text not null,
  rule_type        text not null,
  definition_json  jsonb not null default '{}'::jsonb,
  version          integer not null default 1,
  active_from      timestamptz not null default pg_catalog.now(),
  active_to        timestamptz,
  -- R13 identity/audit columns
  created_at       timestamptz not null default pg_catalog.now(),
  created_by_user  uuid,
  created_by_device text,
  app_version      text,
  model_prediction_id uuid,
  epcis_event_id   text,
  schema_version   integer not null default 1,
  constraint rules_org_id_rule_id_version_unique unique (org_id, rule_id, version),
  constraint rules_rule_type_check check (rule_type in ('cascading', 'conditional_required', 'gate', 'workflow'))
);

-- Add any missing columns idempotently (for re-entrant runs)
alter table "Reference"."Rules"
  add column if not exists id                 uuid,
  add column if not exists org_id             uuid,
  add column if not exists rule_id            text,
  add column if not exists rule_type          text,
  add column if not exists definition_json    jsonb,
  add column if not exists version            integer,
  add column if not exists active_from        timestamptz,
  add column if not exists active_to          timestamptz,
  add column if not exists created_at         timestamptz,
  add column if not exists created_by_user    uuid,
  add column if not exists created_by_device  text,
  add column if not exists app_version        text,
  add column if not exists model_prediction_id uuid,
  add column if not exists epcis_event_id     text,
  add column if not exists schema_version     integer;

-- Ensure defaults
alter table "Reference"."Rules"
  alter column definition_json  set default '{}'::jsonb,
  alter column version          set default 1,
  alter column active_from      set default pg_catalog.now(),
  alter column created_at       set default pg_catalog.now(),
  alter column schema_version   set default 1;

-- Idempotent CHECK constraint
alter table "Reference"."Rules" drop constraint if exists rules_rule_type_check;
alter table "Reference"."Rules" add constraint rules_rule_type_check
  check (rule_type in ('cascading', 'conditional_required', 'gate', 'workflow'));

-- Idempotent UNIQUE constraint
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = '"Reference"."Rules"'::regclass
      and c.contype = 'u'
      and (
        select array_agg(a.attname order by cols.ordinality)
        from unnest(c.conkey) with ordinality as cols(attnum, ordinality)
        join pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = cols.attnum
         and not a.attisdropped
      ) = array['org_id', 'rule_id', 'version']::name[]
  ) then
    alter table "Reference"."Rules"
      add constraint rules_org_id_rule_id_version_unique unique (org_id, rule_id, version);
  end if;
end $$;

create index if not exists rules_org_id_idx       on "Reference"."Rules" (org_id);
create index if not exists rules_rule_type_idx    on "Reference"."Rules" (rule_type);
create index if not exists rules_active_range_idx on "Reference"."Rules" (org_id, active_from, active_to);

-- ============================================================
-- 3. Grant access to app_user (mirrors 002-rls-baseline pattern)
-- ============================================================
grant select, insert, update, delete on "Reference"."Rules" to app_user;

-- ============================================================
-- 4. Row Level Security — org_id scoped (Wave0 v4.3 contract)
-- ============================================================
alter table "Reference"."Rules" enable row level security;
alter table "Reference"."Rules" force row level security;

drop policy if exists rules_org_context on "Reference"."Rules";
create policy rules_org_context
  on "Reference"."Rules"
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 011-departments.sql
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 012-manufacturing-ops.sql
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 013-tenant-migrations.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- T-038: tenant_migrations table (canary upgrade orchestration baseline)
-- Creates the tenant_migrations table recording per-tenant component versions,
-- cohort segmentation (canary/early/general), and migration run state.
-- Note: tenant_id is a UUID referencing an organization, but no FK constraint
-- is enforced here to keep the table lightweight and avoid cascade complexity
-- in the upgrade orchestrator (the application layer enforces referential integrity).

create table if not exists public.tenant_migrations (
  tenant_id         uuid    not null,
  component         text    not null,
  current_version   text    not null,
  target_version    text,
  cohort            text    not null default 'general',
  last_run_at       timestamptz,
  status            text    not null default 'idle',
  failure_reason    text,
  constraint tenant_migrations_pkey
    primary key (tenant_id, component),
  constraint tenant_migrations_cohort_check
    check (cohort in ('canary', 'early', 'general')),
  constraint tenant_migrations_status_check
    check (status in ('idle', 'pending', 'running', 'succeeded', 'failed', 'rolled_back'))
);

create index if not exists tenant_migrations_cohort_status_idx
  on public.tenant_migrations (cohort, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 014-r13-placeholder-tables.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- T-040: R13 org-scoped identity columns on lot/work_order/quality_event/shipment/bom_item placeholder tables
-- Migration: 0014_r13-placeholder-tables.sql
-- Depends on: 001-baseline.sql (organizations table), 002-rls-baseline.sql (app.current_org_id function)

-- ─── lot ──────────────────────────────────────────────────────────────────────

create table if not exists public.lot (
  id                  uuid          not null default gen_random_uuid() primary key,
  external_id         text,
  org_id              uuid          not null references public.organizations(id) on delete restrict,
  created_at          timestamptz   not null default now(),
  created_by_user     uuid,
  created_by_device   text,
  app_version         text,
  model_prediction_id uuid          null,
  epcis_event_id      uuid          null,
  schema_version      integer       not null default 1
);

create index if not exists lot_org_created_idx
  on public.lot (org_id, created_at desc);

alter table public.lot enable row level security;
alter table public.lot force row level security;

drop policy if exists lot_org_context on public.lot;
create policy lot_org_context
  on public.lot
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- ─── work_order ───────────────────────────────────────────────────────────────

create table if not exists public.work_order (
  id                  uuid          not null default gen_random_uuid() primary key,
  external_id         text,
  org_id              uuid          not null references public.organizations(id) on delete restrict,
  created_at          timestamptz   not null default now(),
  created_by_user     uuid,
  created_by_device   text,
  app_version         text,
  model_prediction_id uuid          null,
  epcis_event_id      uuid          null,
  schema_version      integer       not null default 1
);

create index if not exists work_order_org_created_idx
  on public.work_order (org_id, created_at desc);

alter table public.work_order enable row level security;
alter table public.work_order force row level security;

drop policy if exists work_order_org_context on public.work_order;
create policy work_order_org_context
  on public.work_order
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- ─── quality_event ────────────────────────────────────────────────────────────

create table if not exists public.quality_event (
  id                  uuid          not null default gen_random_uuid() primary key,
  external_id         text,
  org_id              uuid          not null references public.organizations(id) on delete restrict,
  created_at          timestamptz   not null default now(),
  created_by_user     uuid,
  created_by_device   text,
  app_version         text,
  model_prediction_id uuid          null,
  epcis_event_id      uuid          null,
  schema_version      integer       not null default 1
);

create index if not exists quality_event_org_created_idx
  on public.quality_event (org_id, created_at desc);

alter table public.quality_event enable row level security;
alter table public.quality_event force row level security;

drop policy if exists quality_event_org_context on public.quality_event;
create policy quality_event_org_context
  on public.quality_event
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- ─── shipment ─────────────────────────────────────────────────────────────────

create table if not exists public.shipment (
  id                  uuid          not null default gen_random_uuid() primary key,
  external_id         text,
  org_id              uuid          not null references public.organizations(id) on delete restrict,
  created_at          timestamptz   not null default now(),
  created_by_user     uuid,
  created_by_device   text,
  app_version         text,
  model_prediction_id uuid          null,
  epcis_event_id      uuid          null,
  schema_version      integer       not null default 1
);

create index if not exists shipment_org_created_idx
  on public.shipment (org_id, created_at desc);

alter table public.shipment enable row level security;
alter table public.shipment force row level security;

drop policy if exists shipment_org_context on public.shipment;
create policy shipment_org_context
  on public.shipment
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- ─── bom_item ─────────────────────────────────────────────────────────────────

create table if not exists public.bom_item (
  id                  uuid          not null default gen_random_uuid() primary key,
  external_id         text,
  org_id              uuid          not null references public.organizations(id) on delete restrict,
  created_at          timestamptz   not null default now(),
  created_by_user     uuid,
  created_by_device   text,
  app_version         text,
  model_prediction_id uuid          null,
  epcis_event_id      uuid          null,
  schema_version      integer       not null default 1
);

create index if not exists bom_item_org_created_idx
  on public.bom_item (org_id, created_at desc);

alter table public.bom_item enable row level security;
alter table public.bom_item force row level security;

drop policy if exists bom_item_org_context on public.bom_item;
create policy bom_item_org_context
  on public.bom_item
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 015-idempotency.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 015: idempotency_keys table for client-generated UUID v7 idempotent mutations
-- Scope: org_id (business/application scope per Wave0 v4.3)
-- Note: T-024.json originally specified 013- but 013-tenant-migrations.sql was already
--       claimed by T-038. Using 015- to avoid collision; documented in T-024.md.

create table if not exists public.idempotency_keys (
  transaction_id  uuid         primary key,
  org_id          uuid         not null,
  request_hash    text         not null,
  response_json   jsonb        not null,
  created_at      timestamptz  not null default pg_catalog.now(),
  expires_at      timestamptz
);

create index if not exists idempotency_keys_org_id_idx
  on public.idempotency_keys (org_id);

create index if not exists idempotency_keys_expires_at_idx
  on public.idempotency_keys (expires_at)
  where expires_at is not null;

-- Enable RLS: org_id isolation via app.current_org_id()
alter table public.idempotency_keys enable row level security;
alter table public.idempotency_keys force row level security;

drop policy if exists idempotency_keys_org_context on public.idempotency_keys;
create policy idempotency_keys_org_context
  on public.idempotency_keys
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- Grant table-level privileges so app_user can access rows (RLS policies alone are
-- not sufficient without a matching GRANT on the table).
grant select, insert, update, delete on public.idempotency_keys to app_user;

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 016-tenant-idp-config-fa2-columns.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 016: ALTER tenant_idp_config — add 11 missing F-A2 columns
-- Scope: additive ALTER TABLE only; do NOT modify 005-tenant-idp-config.sql
-- PRD refs: §8.x (Multi-tenant F-A2 columns), §13 (F-U5 password lifecycle)
-- Blocker: Wave-B (T-011/T-012/T-013 depend on these columns)

-- SAML columns
alter table public.tenant_idp_config
  add column if not exists metadata_url    text,
  add column if not exists entity_id       text,
  add column if not exists x509_cert       text,
  add column if not exists provider_label  text;

-- SCIM columns
alter table public.tenant_idp_config
  add column if not exists scim_token_hash      text,
  add column if not exists scim_token_last_four text;

-- JIT provisioning column
alter table public.tenant_idp_config
  add column if not exists jit_provisioning boolean not null default false;

-- Enforcement column
alter table public.tenant_idp_config
  add column if not exists enforce_for_non_admins boolean not null default false;

-- Password lifecycle columns
alter table public.tenant_idp_config
  add column if not exists password_expiry_days integer not null default 0;

-- Timestamp columns (idempotent — skipped if already present)
alter table public.tenant_idp_config
  add column if not exists created_at timestamptz not null default now();

alter table public.tenant_idp_config
  add column if not exists updated_at timestamptz not null default now();

-- updated_at trigger function (SECURITY DEFINER, restricted search_path)
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

-- BEFORE UPDATE trigger on tenant_idp_config
drop trigger if exists tenant_idp_config_touch_updated_at on public.tenant_idp_config;
create trigger tenant_idp_config_touch_updated_at
  before update on public.tenant_idp_config
  for each row
  execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 017-rbac.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 017: RBAC tables — org-scoped roles, permissions, user assignments, security policy
-- T-014 — RBAC enforcement library with org-scoped roles and Org Admin / Schema Admin SoD grant guard
-- Scope: org_id (business/application scope per Wave0 v4.3 — NO tenant_id in RBAC tables)

-- ============================================================
-- 1. roles table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.roles (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  slug       text        NOT NULL,
  system     boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, slug)
);

-- ============================================================
-- 2. role_permissions table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id    uuid  NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission text  NOT NULL,
  PRIMARY KEY (role_id, permission)
);

-- ============================================================
-- 3. user_roles table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  org_id  uuid NOT NULL,
  PRIMARY KEY (user_id, role_id)
);

-- ============================================================
-- 4. org_security_policies table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.org_security_policies (
  org_id                uuid    PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  dual_control_required boolean NOT NULL DEFAULT true,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- ============================================================
-- 5. Enforce audit retention_class = 'security' for role.assigned events
--    (security red line: role assignment audit rows must always be security-retained)
-- ============================================================
ALTER TABLE public.audit_events
  DROP CONSTRAINT IF EXISTS audit_events_role_assigned_security_check;
ALTER TABLE public.audit_events
  ADD CONSTRAINT audit_events_role_assigned_security_check
  CHECK (action <> 'role.assigned' OR retention_class = 'security')
  NOT VALID;
-- NOT VALID: constraint applies to new rows immediately; existing rows are not rechecked
-- (safe for idempotent migration against a DB that may have pre-existing test data).
COMMENT ON CONSTRAINT audit_events_role_assigned_security_check ON public.audit_events
  IS 'T-014: role.assigned events must always use retention_class=security (security red line)';

-- ============================================================
-- 6. RLS: ENABLE + FORCE on all four tables
-- ============================================================
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.org_security_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_security_policies FORCE ROW LEVEL SECURITY;

-- ============================================================
-- 6. RLS policies — org_id = app.current_org_id()
-- ============================================================
DROP POLICY IF EXISTS roles_org_context ON public.roles;
CREATE POLICY roles_org_context
  ON public.roles
  FOR ALL
  TO app_user
  USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

DROP POLICY IF EXISTS role_permissions_org_context ON public.role_permissions;
CREATE POLICY role_permissions_org_context
  ON public.role_permissions
  FOR ALL
  TO app_user
  USING (
    role_id IN (
      SELECT id FROM public.roles WHERE org_id = app.current_org_id()
    )
  )
  WITH CHECK (
    role_id IN (
      SELECT id FROM public.roles WHERE org_id = app.current_org_id()
    )
  );

DROP POLICY IF EXISTS user_roles_org_context ON public.user_roles;
CREATE POLICY user_roles_org_context
  ON public.user_roles
  FOR ALL
  TO app_user
  USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

DROP POLICY IF EXISTS org_security_policies_org_context ON public.org_security_policies;
CREATE POLICY org_security_policies_org_context
  ON public.org_security_policies
  FOR ALL
  TO app_user
  USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- ============================================================
-- 7. Grant DML to app_user on all four tables
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_security_policies TO app_user;

-- ============================================================
-- 8. Trigger: seed system roles + security policy on org INSERT
--    Both org.access.admin and org.schema.admin are seeded with system=true.
--    Also inserts org_security_policies row (dual_control_required = true).
--    SECURITY DEFINER so trigger function bypasses RLS on roles table.
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_system_roles_on_org_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  INSERT INTO public.roles (org_id, slug, system)
  VALUES
    (NEW.id, 'org.access.admin', true),
    (NEW.id, 'org.schema.admin', true)
  ON CONFLICT (org_id, slug) DO NOTHING;

  INSERT INTO public.org_security_policies (org_id, dual_control_required)
  VALUES (NEW.id, true)
  ON CONFLICT (org_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_system_roles_on_org_insert ON public.organizations;
CREATE TRIGGER seed_system_roles_on_org_insert
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_system_roles_on_org_insert();

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 018-password-history.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 018: password_history table for NIST SP 800-63B last-5 password reuse prevention
-- Scope: T-061 — Password policy enforcement library
-- Consumed by: T-011 sign-up/change-password flows (validateNewPassword + recordPasswordHistory)

create table if not exists public.password_history (
  id          uuid         primary key default gen_random_uuid(),
  user_id     uuid         not null references public.users(id) on delete cascade,
  password_hash text       not null,
  created_at  timestamptz  not null default pg_catalog.now()
);

-- Composite index for last-5 history lookups: WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5
create index if not exists password_history_user_id_created_at_idx
  on public.password_history (user_id, created_at desc);

-- Enable RLS: only org-scoped users may access their own history
alter table public.password_history enable row level security;
alter table public.password_history force row level security;

-- Drop and recreate policy to make migration idempotent
drop policy if exists password_history_org_context on public.password_history;
create policy password_history_org_context
  on public.password_history
  for all
  to app_user
  using (
    user_id in (
      select id from public.users where org_id = app.current_org_id()
    )
  )
  with check (
    user_id in (
      select id from public.users where org_id = app.current_org_id()
    )
  );

-- Grant table-level privileges so app_user can access rows (RLS policies alone are
-- not sufficient without a matching GRANT on the table).
grant select, insert, update, delete on public.password_history to app_user;

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 019-pins.sql
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 022-dept-column-drafts.sql
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 023-outbox-events-extension.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 023 — T-039: extend outbox_events_event_type_check constraint
-- Adds three tenant-canary-upgrade event types required by T-039 Server Actions:
--   - tenant.migration.run         (recordMigrationRun success)
--   - tenant.migration.run.failed  (recordMigrationRun failure)
--   - tenant.cohort.advanced       (advanceCohort emits one per advanced tenant)
--
-- The original 12-event CHECK from 003-outbox.sql is preserved; this migration
-- replaces it with a broader 15-event CHECK. SQLSTATE 23514 still gates unknown
-- event_type values (validated by AC2 #3 in T-039 RED).
--
-- Note: T-039 does NOT auto-seed the org.platform.admin role on org INSERT.
-- The role is system-scoped and granted out-of-band per task spec; tests seed
-- it manually via owner connection (matches T-014 RED-test pattern).

ALTER TABLE public.outbox_events
  DROP CONSTRAINT IF EXISTS outbox_events_event_type_check;

ALTER TABLE public.outbox_events
  ADD CONSTRAINT outbox_events_event_type_check CHECK (
    event_type IN (
      -- 12 original (003-outbox.sql)
      'org.created',
      'user.invited',
      'role.assigned',
      'audit.recorded',
      'brief.created',
      'fg.created',
      'fg.allergens_changed',
      'fg.intermediate_code_changed',
      'lp.received',
      'wo.ready',
      'quality.recorded',
      'shipment.created',
      -- 3 new (T-039)
      'tenant.migration.run',
      'tenant.migration.run.failed',
      'tenant.cohort.advanced'
    )
  );

COMMENT ON CONSTRAINT outbox_events_event_type_check ON public.outbox_events
  IS 'T-039: extends 003-outbox.sql 12-event CHECK with tenant.migration.run, tenant.migration.run.failed, tenant.cohort.advanced.';

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 024-scim-extras.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 024: T-013 SCIM extras
--   1. ALTER public.users ADD COLUMN deleted_at timestamptz (nullable; soft-delete sentinel)
--   2. CREATE INDEX users_org_id_active_idx ON public.users (org_id) WHERE deleted_at IS NULL
--   3. CREATE INDEX tenant_idp_config_scim_last_four_idx ON public.tenant_idp_config(scim_token_last_four)
--      → enables O(1) SCIM bearer-token lookup so middleware verify-path completes <10ms
--        even on a miss (avoids scanning every tenant's argon2id hash).
--
-- All operations idempotent (IF NOT EXISTS).

alter table public.users
  add column if not exists deleted_at timestamptz;

create index if not exists users_org_id_active_idx
  on public.users (org_id)
  where deleted_at is null;

create index if not exists tenant_idp_config_scim_last_four_idx
  on public.tenant_idp_config (scim_token_last_four);

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 025-tenant-idp-config-app-grant.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 025: GRANT SELECT on tenant_idp_config to app_user
-- T-012 — SAML SP needs to read enforce_for_non_admins and other policy fields
-- at request time when enforcing the SAML password-block policy. The original
-- 005-tenant-idp-config.sql `revoke all` from app_user is too restrictive for
-- runtime policy reads; it was designed for control-plane writes (provider_type,
-- x509_cert, etc.), but read access for policy enforcement is required.
--
-- Scope: SELECT only — INSERT/UPDATE/DELETE remain control-plane (revoked).
-- This mirrors the read-only operational pattern used by other policy tables
-- (e.g. org_security_policies has SELECT under RLS).
--
-- Note: tenant_idp_config has no RLS enabled — it is keyed by tenant_id and
-- there is one row per tenant. App-tier code must scope reads by the
-- session's tenant_id, which is enforced by callers (T-012 enforceSamlPolicy
-- always passes tenantId from the authenticated JWT/cookie).

grant select on public.tenant_idp_config to app_user;

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 026-pins-rls-org-scoped.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- T-062 hardening: org-scoped user_pins RLS (was using(true)) — Wave A.6 P0
-- Migration 026: replace fail-open SELECT policy on user_pins with org-scoped policy.
--
-- BEFORE this migration, 019-pins.sql installed:
--   create policy user_pins_org_context on public.user_pins for all to app_user
--     using (true)
--     with check (user_id in (select id from public.users where org_id = app.current_org_id()));
--
-- Effect of `using (true)`: any app_user (regardless of org context) could
--   `select pin_hash from public.user_pins where user_id = '<arbitrary-uuid>'`
-- and read PIN argon2id hashes belonging to users of OTHER organizations.
-- INSERT/UPDATE were correctly scoped, but SELECT and DELETE leaked.
--
-- AFTER this migration:
--   * SELECT/UPDATE/DELETE/INSERT all gated on
--     `user_id IN (SELECT id FROM public.users WHERE org_id = app.current_org_id())`.
--   * Cross-org SELECT returns 0 rows (RLS filters them out).
--
-- Mutation proof (manual, to be wired into the integration suite):
--   1. Seed orgA with userA + a pin row for userA.
--   2. Seed orgB with userB.
--   3. As app_user with current_org_id() set to orgB, run
--        SELECT count(*) FROM public.user_pins WHERE user_id = '<userA-uuid>';
--      BEFORE this migration → returns 1 (leak).
--      AFTER this migration → returns 0 (RLS hides cross-org rows).
--
-- Reversibility: this migration is reversible. To roll back, drop the new
-- policy and recreate the original `using (true)` policy from 019-pins.sql.
-- (We deliberately do NOT keep the old policy as a fallback — fail-closed.)

-- Drop the leaking policy so we can recreate it with org scope on USING.
drop policy if exists user_pins_org_context on public.user_pins;

create policy user_pins_org_context
  on public.user_pins
  for all
  to app_user
  using (
    user_id in (
      select id from public.users where org_id = app.current_org_id()
    )
  )
  with check (
    user_id in (
      select id from public.users where org_id = app.current_org_id()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 027-tenant-idp-config-rls.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- T-062 hardening: enable RLS on tenant_idp_config + revoke broad app_user SELECT.
-- Migration 027: lock down tenant_idp_config so secrets (x509_cert, scim_token_hash,
-- entity_id, metadata_url, …) cannot be read directly by the app role. Replaces
-- the broad `grant select` from 025-tenant-idp-config-app-grant.sql with a
-- narrow SECURITY DEFINER reader that exposes only the safe policy fields the
-- app actually needs at request time.
--
-- BEFORE: 025-tenant-idp-config-app-grant.sql granted SELECT to app_user with
--         no RLS (the table was keyed by tenant_id and "scoped by callers").
--         Effect: any app_user could
--           `select x509_cert, scim_token_hash from public.tenant_idp_config`
--         and exfiltrate IdP signing certificates and SCIM token hashes.
--
-- AFTER:  RLS enabled + force; broad SELECT revoked from app_user; app reads
--         go through `app.get_my_tenant_idp_config(p_tenant_id uuid)` which
--         returns ONLY the policy fields needed for SAML enforcement
--         (provider_type, enforce_for_non_admins, jit_provisioning,
--          mfa_required, mfa_required_for_roles, mfa_allowed_methods).
--         Secrets stay control-plane-only.
--
-- Mutation proof:
--   * As app_user before: `SELECT x509_cert FROM public.tenant_idp_config`
--     → returns rows.
--   * As app_user after:  same query → permission denied (no SELECT grant).
--   * `SELECT app.get_my_tenant_idp_config('<tenant>')` returns only the
--     allow-listed policy columns; calling it with a tenant the caller has
--     no current org context for returns NULL (no row).
--
-- Reversibility: dropping the function and re-granting SELECT restores the
-- previous (insecure) state. Documented for completeness; do NOT run in prod.

-- 1. Lock the table down: enable + force RLS, revoke broad SELECT grant.
alter table public.tenant_idp_config enable row level security;
alter table public.tenant_idp_config force row level security;
revoke select on public.tenant_idp_config from app_user;

-- 2. Narrow reader function — returns ONLY the safe policy fields that
--    enforceSamlPolicy / SAML route handlers need. Secrets are intentionally
--    excluded (no x509_cert, no scim_token_hash, no metadata_url, no entity_id).
--
--    SECURITY DEFINER: runs with the migration owner's privileges (which has
--    full SELECT on tenant_idp_config) so it can bypass the table-level
--    revoke for the explicitly-allow-listed columns.
--    SET search_path = pg_catalog hardens against search-path injection.
create or replace function app.get_my_tenant_idp_config(p_tenant_id uuid)
returns table (
  tenant_id              uuid,
  provider_type          varchar,
  enforce_for_non_admins boolean,
  jit_provisioning       boolean,
  mfa_required           boolean,
  mfa_required_for_roles text[],
  mfa_allowed_methods    text[],
  password_complexity    varchar,
  idle_timeout_min       int,
  session_max_h          int
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  -- Only return rows whose tenant_id matches BOTH the caller-supplied tenant
  -- AND an organization the current session has been bound to. This prevents
  -- a session bound to org A from reading org B's IdP policy.
  return query
    select
      t.tenant_id,
      t.provider_type,
      t.enforce_for_non_admins,
      t.jit_provisioning,
      t.mfa_required,
      t.mfa_required_for_roles,
      t.mfa_allowed_methods,
      t.password_complexity,
      t.idle_timeout_min,
      t.session_max_h
    from public.tenant_idp_config t
    where t.tenant_id = p_tenant_id
      and exists (
        select 1
        from public.organizations o
        where o.tenant_id = t.tenant_id
          and o.id = app.current_org_id()
      );
end;
$$;

-- 3. Lock down the function and grant execute to app_user only.
revoke all on function app.get_my_tenant_idp_config(uuid) from public;
grant execute on function app.get_my_tenant_idp_config(uuid) to app_user;

-- 4. We deliberately do NOT add a SELECT policy to the table itself —
--    callers must use the function. Anyone trying the old direct path will
--    get 0 rows back (RLS denies, since no policy is defined for app_user).

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 028-mfa-totp-replay.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- T-062 hardening: TOTP replay protection on mfa_secrets.
-- Migration 028: track the last consumed TOTP step per user so the same OTP
-- code cannot be replayed within its 30-second window.
--
-- BEFORE: packages/auth/src/totp.ts:128 verifies a presented TOTP token via
--         otplib's `verifySync` and returns true on the first valid match.
--         An attacker who intercepts the 6-digit code (over the wire, via
--         shoulder surfing, MFA prompt phishing, etc.) can replay it within
--         the same 30-second epoch and get a second successful verification.
--
-- AFTER:  verifyTotp atomically claims the current TOTP step by writing the
--         epoch number into `last_otp_window`. The atomic UPDATE has the
--         predicate `(last_otp_window IS NULL OR last_otp_window <> $window)`
--         so the second concurrent verifier sees `rowCount === 0` and returns
--         { ok: false, reason: 'replay' }.
--
-- Mutation proof:
--   1. Enroll user with secret S.
--   2. Generate TOTP code C for current epoch E.
--   3. verifyTotp(C) → { ok: true } and DB row has last_otp_window = E.
--   4. verifyTotp(C) immediately after (same epoch) → UPDATE matches 0 rows
--      (predicate `last_otp_window <> E` is false) → { ok: false, reason: 'replay' }.
--
-- Reversibility: drop the two columns + index. No data loss (purely additive
-- audit columns; no behaviour change for existing flows besides replay block).

alter table public.mfa_secrets
  add column if not exists last_otp_used_at timestamptz,
  add column if not exists last_otp_window  bigint;

-- Index supports the verify-time UPDATE predicate (user_id is already PK so
-- the lookup is O(1); the index also helps audit queries grouping by window).
create index if not exists mfa_secrets_last_otp_window_idx
  on public.mfa_secrets (user_id, last_otp_window);

-- No grant changes required: app_user already has UPDATE on mfa_secrets per
-- 007-mfa.sql line 49 (`GRANT SELECT, INSERT, UPDATE ON public.mfa_secrets`).

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 029-org-platform-admin.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- T-A.7-001 — backfill org.platform.admin (system role); FT-020 closeout

-- ============================================================
-- 1. Extend seed_system_roles_on_org_insert trigger function
--    to also seed org.platform.admin on every new org INSERT.
--    SECURITY DEFINER + SET search_path = pg_catalog preserved.
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_system_roles_on_org_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  INSERT INTO public.roles (org_id, slug, system)
  VALUES
    (NEW.id, 'org.access.admin', true),
    (NEW.id, 'org.schema.admin', true),
    (NEW.id, 'org.platform.admin', true)
  ON CONFLICT (org_id, slug) DO NOTHING;

  INSERT INTO public.org_security_policies (org_id, dual_control_required)
  VALUES (NEW.id, true)
  ON CONFLICT (org_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. Backfill: seed org.platform.admin for all existing orgs
--    that were inserted before this migration ran.
--    Idempotent: ON CONFLICT (org_id, slug) DO NOTHING.
-- ============================================================
INSERT INTO public.roles (org_id, slug, system)
SELECT id, 'org.platform.admin', true
FROM public.organizations
ON CONFLICT (org_id, slug) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 030-apex-org-bootstrap.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- T-A.7-002 — Apex tenant/org bootstrap; FT-020 closeout

-- ============================================================
-- Bootstrap the Apex (system) tenant and organization with
-- deterministic UUIDs so that seed files referencing
-- external_id = 'apex' (e.g. seeds/apex-departments.sql)
-- have a valid parent org to reference.
--
-- The trigger seed_system_roles_on_org_insert (migration 029)
-- will auto-seed org.access.admin, org.schema.admin, and
-- org.platform.admin for this org on INSERT.
--
-- Idempotent: both statements use ON CONFLICT (id) DO NOTHING.
-- ============================================================

-- Apex tenant
INSERT INTO public.tenants (id, name, region_cluster, data_plane_url, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Apex (system)',
  'eu',
  '',
  pg_catalog.now()
)
ON CONFLICT (id) DO NOTHING;

-- Apex organization
INSERT INTO public.organizations (
  id,
  tenant_id,
  name,
  industry_code,
  external_id,
  created_at,
  schema_version
)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Apex',
  'generic',
  'apex',
  pg_catalog.now(),
  1
)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 031-session-org-contexts-janitor.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- T-A.7-003 — session_org_contexts janitor (TTL + GC) — Wave A.7 HIGH residual closeout
--
-- Rationale:
--   apps/web/lib/auth/with-org-context.ts performs a best-effort
--   `delete from app.session_org_contexts where session_token = $1` in its
--   `finally` block AFTER the COMMIT has already succeeded. If that delete
--   fails (network blip, owner-pool exhaustion, process crash, etc.) the
--   row is leaked: the wrapped Server Action committed normally, but the
--   `app.session_org_contexts` row stays around forever. With no TTL or GC,
--   that table accumulates orphans indefinitely.
--
-- Mitigation:
--   1. Ensure every row carries a `created_at` timestamp (already the case
--      since 002-rls-baseline.sql, but we re-state with `IF NOT EXISTS` so
--      this migration is safe to run on any historical schema state).
--   2. Add an index on `created_at` so the janitor can range-scan efficiently
--      without a seq-scan over the full table.
--   3. Provide a SECURITY DEFINER function `app.gc_session_org_contexts()`
--      that operators wire up to a cron / scheduled job.
--
-- Expected operational wiring (NOT performed by this migration):
--   - Cadence: every 5 minutes.
--   - Default TTL: 600 seconds (10 minutes).
--     This is intentionally LONGER than any reasonable Server Action timeout
--     (Next.js Server Actions are bounded well below 60s in production).
--     A 10-minute floor guarantees we never race a still-executing happy-path
--     transaction; a leaked orphan only becomes collectable well after the
--     originating request has completed (success OR failure).
--   - Example crontab entry:
--       */5 * * * *  psql "$DATABASE_URL_OWNER" -c "select app.gc_session_org_contexts()"
--
-- Privilege model:
--   The function is SECURITY DEFINER (executes with owner privileges) but is
--   NOT granted to `app_user` — only operators / cron with owner credentials
--   may invoke it. The app code path never needs to call it directly.
--
-- Idempotent: ALTER TABLE ... ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT
--   EXISTS / CREATE OR REPLACE FUNCTION are all safe to re-run.

-- 1. Ensure created_at exists (defensive — should already exist since 002).
alter table app.session_org_contexts
  add column if not exists created_at timestamptz not null default pg_catalog.now();

-- 2. Index for janitor range scans on (created_at).
create index if not exists session_org_contexts_created_at_idx
  on app.session_org_contexts (created_at);

-- 3. Janitor function: delete rows older than `p_max_age_seconds`, return count.
--
-- Notes:
--   - SECURITY DEFINER + `set search_path = pg_catalog` hardens against
--     search-path injection (see Postgres docs §5.11.6).
--   - The interval arithmetic uses `make_interval(secs => ...)` instead of
--     `p_max_age_seconds * interval '1 second'` to keep the search_path
--     restricted to pg_catalog (avoids any text-based interval cast that
--     could resolve through a shadowed operator).
create or replace function app.gc_session_org_contexts(p_max_age_seconds int default 600)
returns int
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_deleted int;
begin
  delete from app.session_org_contexts
   where created_at < pg_catalog.now() - make_interval(secs => p_max_age_seconds);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Lock down: revoke from public (anybody) and ensure app_user cannot invoke it
-- directly. Only owner/cron credentials should ever run this.
revoke all on function app.gc_session_org_contexts(int) from public;
revoke all on function app.gc_session_org_contexts(int) from app_user;

comment on function app.gc_session_org_contexts(int) is
  'GC orphan rows from app.session_org_contexts older than p_max_age_seconds (default 600). '
  'Operators wire this to a 5-minute cron with owner credentials. See migration 031.';

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 032-reference-seed-on-org-insert.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 032 — per-tenant Reference seed on organization INSERT (Slot F-1).
--
-- Problem:
--   "Reference"."Departments" and "Reference"."ManufacturingOperations" are
--   only seeded for the Apex org (id = '00000000-0000-0000-0000-000000000002').
--   Every non-Apex tenant boots with empty taxonomy, which breaks 02-settings
--   T-019 (departments) and T-094 (mfg ops) because their UIs read from those
--   tables.
--
-- Strategy:
--   On INSERT into public.organizations, copy every Reference.Departments row
--   from Apex to the new org (same for Reference.ManufacturingOperations).
--   Idempotent via ON CONFLICT DO NOTHING on the (org_id, code) and
--   (org_id, industry_code, process_suffix) unique constraints.
--
--   The Apex org itself is excluded from self-copy (the trigger fires for the
--   Apex bootstrap row from migration 030 too).
--
--   A backfill block at the end copies the seed to all existing non-Apex orgs
--   so this migration is fix-on-deploy: tenants that already exist will get
--   their taxonomy populated immediately. Subsequent inserts go through the
--   trigger.

-- ============================================================
-- 1. Pre-flight — required tables must exist (clear failure if not)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'Reference'
       AND table_name   = 'Departments'
  ) THEN
    RAISE EXCEPTION 'Reference.Departments not found — run migration 011 first';
  END IF;
END
$$;

-- ============================================================
-- 2. Trigger function — copy Apex reference data to a new org
--
--    SECURITY DEFINER bypasses the org_id RLS policy on the Reference tables
--    (current_org_id() is unset during a system org INSERT). search_path is
--    pinned to keep the function deterministic regardless of caller setting.
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_reference_data_on_org_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_apex_org_id uuid := '00000000-0000-0000-0000-000000000002'::uuid;
BEGIN
  -- Skip Apex itself — the source of the seed has nothing to copy from.
  IF NEW.id = v_apex_org_id THEN
    RETURN NEW;
  END IF;

  -- Reference.Departments — clone Apex rows into the new org.
  INSERT INTO "Reference"."Departments"
    (id, org_id, code, display_name, role_description, marker, created_at)
  SELECT gen_random_uuid(),
         NEW.id,
         code,
         display_name,
         role_description,
         marker,
         pg_catalog.now()
    FROM "Reference"."Departments"
   WHERE org_id = v_apex_org_id
  ON CONFLICT (org_id, code) DO NOTHING;

  -- Reference.ManufacturingOperations — table only present after migration 012;
  -- guard so this trigger remains usable on partially migrated databases.
  IF EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'Reference'
       AND table_name   = 'ManufacturingOperations'
  ) THEN
    INSERT INTO "Reference"."ManufacturingOperations"
      (id, org_id, operation_name, process_suffix, description, operation_seq,
       industry_code, is_active, marker, created_at)
    SELECT gen_random_uuid(),
           NEW.id,
           operation_name,
           process_suffix,
           description,
           operation_seq,
           industry_code,
           is_active,
           marker,
           pg_catalog.now()
      FROM "Reference"."ManufacturingOperations"
     WHERE org_id = v_apex_org_id
    ON CONFLICT (org_id, industry_code, process_suffix) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. Trigger — wire it onto public.organizations
-- ============================================================
DROP TRIGGER IF EXISTS trg_seed_reference_data ON public.organizations;
CREATE TRIGGER trg_seed_reference_data
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_reference_data_on_org_insert();

-- ============================================================
-- 4. Backfill — copy Apex seed to every existing non-Apex org
--    Idempotent (ON CONFLICT DO NOTHING) so re-running is safe.
-- ============================================================
DO $$
DECLARE
  v_apex_org_id uuid := '00000000-0000-0000-0000-000000000002'::uuid;
  v_org         record;
BEGIN
  FOR v_org IN
    SELECT id FROM public.organizations WHERE id <> v_apex_org_id
  LOOP
    INSERT INTO "Reference"."Departments"
      (id, org_id, code, display_name, role_description, marker, created_at)
    SELECT gen_random_uuid(),
           v_org.id,
           code,
           display_name,
           role_description,
           marker,
           pg_catalog.now()
      FROM "Reference"."Departments"
     WHERE org_id = v_apex_org_id
    ON CONFLICT (org_id, code) DO NOTHING;

    IF EXISTS (
      SELECT 1
        FROM information_schema.tables
       WHERE table_schema = 'Reference'
         AND table_name   = 'ManufacturingOperations'
    ) THEN
      INSERT INTO "Reference"."ManufacturingOperations"
        (id, org_id, operation_name, process_suffix, description, operation_seq,
         industry_code, is_active, marker, created_at)
      SELECT gen_random_uuid(),
             v_org.id,
             operation_name,
             process_suffix,
             description,
             operation_seq,
             industry_code,
             is_active,
             marker,
             pg_catalog.now()
        FROM "Reference"."ManufacturingOperations"
       WHERE org_id = v_apex_org_id
      ON CONFLICT (org_id, industry_code, process_suffix) DO NOTHING;
    END IF;
  END LOOP;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 033-consumed-approval-tokens.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 033 — FT-011: approval-token jti replay protection.
--
-- Problem:
--   `grantRole` (packages/rbac/src/grant.ts) verifies an HMAC-SHA256 signed
--   approval token to authorise SoD-violating / dual-control role grants but
--   does NOT track which tokens have already been consumed. An attacker who
--   intercepts a valid token (within its 5-minute TTL) can replay it any
--   number of times to grant the same role to the same target — defeating
--   the whole point of single-use approval semantics.
--
-- Strategy:
--   Persist the token's `jti` (UUID, generated at token creation) the first
--   time `grantRole` consumes it. Every subsequent call sees the row and
--   short-circuits with `invalid_token`. The INSERT happens inside the same
--   transaction as the role grant so the atomicity guarantee holds: either
--   both jti row and user_roles row land, or neither does.
--
-- Cleanup:
--   Token TTL is 5 minutes; rows older than 7 days are vestigial. The actual
--   prune is the responsibility of the audit-prune cron job (Slot F-4) — this
--   migration only provides the index that makes the prune sweep cheap.
--
-- RLS / privileges:
--   The table is owner-scoped only. `grantRole` runs through getOwnerConnection
--   (BYPASSRLS) so app_user grants are not required. Do NOT expose this table
--   to app_user — `jti` values are sensitive (knowing a jti is sufficient for
--   the replay attack we are guarding against here).

CREATE TABLE IF NOT EXISTS public.consumed_approval_tokens (
  jti         uuid         PRIMARY KEY,
  org_id      uuid         NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  consumed_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Index supports the audit-prune cron's (org_id, consumed_at < cutoff) sweep
-- and ad-hoc per-org forensic queries (e.g. "how many approvals burned this
-- week in org X?").
CREATE INDEX IF NOT EXISTS consumed_approval_tokens_org_idx
  ON public.consumed_approval_tokens (org_id, consumed_at);

-- Defensive: revoke from PUBLIC and app_user. The grant flow uses the owner
-- pool (BYPASSRLS), so app_user MUST NOT be able to read or write here.
REVOKE ALL ON public.consumed_approval_tokens FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE 'REVOKE ALL ON public.consumed_approval_tokens FROM app_user';
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 034-approval-token-prune-cron.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 034 — Slot F-4: prune cron for consumed_approval_tokens.
--
-- Problem:
--   Migration 033 installed `public.consumed_approval_tokens` to defeat
--   replay of approval tokens, but did not provide a sweep. Token TTL is
--   5 minutes; rows older than 30 days are vestigial and should be pruned
--   so the table stays bounded over the lifetime of the deployment.
--
-- Strategy:
--   * Define `public.prune_consumed_approval_tokens()` — a small DELETE.
--   * Schedule it daily at 03:00 UTC via pg_cron.
--   * Wrap the schedule in a `pg_extension` guard so the migration is a
--     no-op on environments without pg_cron (e.g. local docker-compose or
--     CI Postgres images that don't ship pg_cron). The function itself is
--     always created, so operators on those environments can still invoke
--     it manually (or via their own scheduler).
--
-- Index rationale:
--   The (org_id, consumed_at) index from 033 covers the prune predicate
--   (consumed_at < cutoff) — the planner picks the index even though the
--   DELETE doesn't restrict by org_id, because consumed_at is the trailing
--   key on a small table. No new index needed.

-- 1. Pruning function: deletes tokens older than 30 days.
CREATE OR REPLACE FUNCTION public.prune_consumed_approval_tokens()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  DELETE FROM public.consumed_approval_tokens
   WHERE consumed_at < now() - interval '30 days';
$$;

-- Lock down the function — only the migration owner can grant execute. We do
-- NOT grant execute to app_user; the prune is a control-plane job.
REVOKE ALL ON FUNCTION public.prune_consumed_approval_tokens() FROM PUBLIC;

-- 2. Schedule via pg_cron — guarded so the migration succeeds on environments
--    without pg_cron installed (the schedule is then operator-installed when
--    the extension is added later).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- cron.schedule is idempotent on (jobname): re-running this migration
    -- replaces the prior schedule entry with the same jobname rather than
    -- creating duplicates.
    PERFORM cron.schedule(
      'prune_consumed_approval_tokens_daily',
      '0 3 * * *',
      $cron$ SELECT public.prune_consumed_approval_tokens(); $cron$
    );
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 035-tenant-idp-grants.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 035 — Slot F-4: defence-in-depth column-level revokes on
--                            public.tenant_idp_config.
--
-- Background:
--   Migration 027 already revokes the broad SELECT grant on
--   public.tenant_idp_config from app_user and forces RLS, so as of today
--   app_user cannot read this table at all. Migration 035 adds explicit,
--   column-scoped REVOKE statements as a defence-in-depth lock so that any
--   future migration which (intentionally or accidentally) re-grants
--   table-level SELECT to app_user does NOT also re-expose the secret
--   columns. The column revokes survive a subsequent table-level GRANT
--   SELECT — the most-specific privilege wins on a per-column basis.
--
-- Column scope (sensitive — must NEVER be readable by the RLS app role):
--   * metadata_url       — IdP metadata endpoint (probable IdP fingerprint)
--   * entity_id          — IdP entity identifier
--   * x509_cert          — IdP signing certificate
--   * scim_token_hash    — bcrypt hash of the SCIM bearer token
--   The prompt called out `metadata_xml / private_key / certificate`; those
--   columns do not exist on this table — the live equivalents that hold
--   IdP secret material are listed above. We revoke them all here.
--
-- This migration is idempotent. REVOKE on a privilege that isn't granted
-- is a no-op in Postgres, so re-running this migration on a fresh DB is
-- safe.

-- Belt-and-suspenders: revoke any column-level SELECT that may have been
-- granted to app_user on the secret columns. (Today the table-level grant
-- has been revoked entirely — this is forward-looking insurance.)
REVOKE SELECT (metadata_url, entity_id, x509_cert, scim_token_hash)
  ON public.tenant_idp_config
  FROM app_user;

-- Defensive: also strip these columns from PUBLIC.
REVOKE SELECT (metadata_url, entity_id, x509_cert, scim_token_hash)
  ON public.tenant_idp_config
  FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 036-audit-log-retention.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 036 — Slot F-4: audit_events retention prune cron.
--
-- Background:
--   The audit table is `public.audit_events` (see migration 004) with a
--   timestamp column `occurred_at`. The prompt-level requirement was
--   "delete audit_log rows older than 90 days"; the live table is
--   `audit_events`, so this migration prunes that table by `occurred_at`.
--
-- Retention policy:
--   * The prune deletes rows with `occurred_at < now() - interval '90 days'`.
--   * `retention_class = 'security'` rows are EXCLUDED from the prune so
--     long-retention security events (admin/role grants, mfa events,
--     impersonation) survive the 90-day window. Standard / operational /
--     ephemeral classes are pruned at 90 days. This is the conservative
--     interpretation of the "90 day" requirement: a flat 90-day prune would
--     destroy compliance-relevant security events; if/when finer-grained
--     class-specific windows are required, they extend this function.
--
-- pg_cron guard:
--   Wraps `cron.schedule` in a `pg_extension` existence guard so the
--   migration is a no-op on Postgres images without pg_cron (local docker,
--   CI). The function itself is always created — operators on those
--   environments can invoke it manually.
--
-- Append-only enforcement:
--   `audit_events` REVOKEs DELETE from app_user (migration 004); this
--   function runs as SECURITY DEFINER (migration owner) so it bypasses that
--   guard. Only the prune cron can delete rows — application paths still
--   cannot.

-- 1. Pruning function: deletes non-security rows older than 90 days.
CREATE OR REPLACE FUNCTION public.prune_audit_events()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  DELETE FROM public.audit_events
   WHERE occurred_at < now() - interval '90 days'
     AND retention_class <> 'security';
$$;

-- Lock down the function — only the migration owner / cron can execute.
REVOKE ALL ON FUNCTION public.prune_audit_events() FROM PUBLIC;

-- 2. Schedule via pg_cron — guarded so migration succeeds on environments
--    without pg_cron installed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'prune_audit_events_daily',
      '0 4 * * *',
      $cron$ SELECT public.prune_audit_events(); $cron$
    );
  END IF;
END
$$;

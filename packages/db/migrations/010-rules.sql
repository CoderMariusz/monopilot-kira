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

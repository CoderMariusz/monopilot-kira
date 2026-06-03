Reading additional input from stdin...
OpenAI Codex v0.124.0 (research preview)
--------
workdir: /Users/mariuszkrawczyk/Projects/monopilot-kira
model: gpt-5.5
provider: openai
approval: never
sandbox: read-only
reasoning effort: none
reasoning summaries: none
session id: 019e8dff-50e2-7dd0-832b-1f0e744e8c31
--------
user
Cross-provider review (you are Codex; Opus wrote this). Review the 02-settings DB schema migrations 063-070 in packages/db/migrations/ (org_authorization_policies, unit_of_measure, d365_sync_runs, email_delivery_log, feature_flags_core, login_attempts, modules-description, notification_preferences). THE LAW: org-scoped tables use org_id (NOT tenant_id), RLS enabled+FORCED with policy using app.current_org_id() (NOT raw current_setting), grants to app_user, revoke from public. For each migration flag P0/P1/P2 issues: missing/incorrect RLS (cross-org leak), unsafe seed-on-INSERT triggers/backfill (063/064/067), the 070 outbox_events_event_type_check union completeness, CHECK/FK/index correctness, login_attempts org_id-nullable handling. Concise prioritized list; one line per correct migration. Read-only, do not edit.
codex
I’ll review the migration files only and check them against the RLS/org-scope rules plus the specific migration risks you called out. No edits.
exec
/bin/zsh -lc "sed -n '1,260p' packages/db/migrations/064-unit_of_measure.sql" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 exited 1 in 0ms:
sed: packages/db/migrations/064-unit_of_measure.sql: No such file or directory

exec
/bin/zsh -lc "sed -n '1,240p' packages/db/migrations/063-org_authorization_policies.sql" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 exited 1 in 0ms:
sed: packages/db/migrations/063-org_authorization_policies.sql: No such file or directory

exec
/bin/zsh -lc "sed -n '1,260p' packages/db/migrations/065-d365_sync_runs.sql" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 exited 1 in 0ms:
sed: packages/db/migrations/065-d365_sync_runs.sql: No such file or directory

exec
/bin/zsh -lc "sed -n '1,260p' packages/db/migrations/066-email_delivery_log.sql" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 exited 1 in 0ms:
sed: packages/db/migrations/066-email_delivery_log.sql: No such file or directory

codex
The exact filenames differ from the names in the request, so I’m listing the migration directory and then I’ll read the 063-070 files by their actual names.
exec
/bin/zsh -lc "ls packages/db/migrations | sed -n '55,80p'" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 succeeded in 0ms:
057-gdpr-erasure-requests.sql
058-audit-events-dept-column-denied-check.sql
059-dept-column-drafts-unique.sql
060-audit-events-org-id-nullable.sql
061-org-scoped-sequences.sql
062-tenant-migrations-fk-restore.sql
063-org-authorization-policies.sql
064-unit-of-measure.sql
065-d365-sync-runs.sql
066-email-delivery-log.sql
067-feature-flags-core.sql
068-login-attempts.sql
069-modules-description.sql
070-notification-preferences.sql

exec
/bin/zsh -lc "rg --files packages/db/migrations | rg '/0(63|64|65|66|67|68|69|70)'" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 succeeded in 0ms:
packages/db/migrations/064-unit-of-measure.sql
packages/db/migrations/066-email-delivery-log.sql
packages/db/migrations/065-d365-sync-runs.sql
packages/db/migrations/068-login-attempts.sql
packages/db/migrations/067-feature-flags-core.sql
packages/db/migrations/063-org-authorization-policies.sql
packages/db/migrations/069-modules-description.sql
packages/db/migrations/070-notification-preferences.sql

codex
I found the hyphenated filenames. Now I’m reading the migrations and will inspect policies, grants, triggers, check constraints, and any outbox enum changes together.
exec
/bin/zsh -lc "sed -n '1,280p' packages/db/migrations/063-org-authorization-policies.sql" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 succeeded in 0ms:
-- Migration 063: 02-settings T-122 — org_authorization_policies (schema + per-org seed)
-- PRD: docs/prd/02-SETTINGS-PRD.md §5.1 org_authorization_policies, §9.1, §10.2 V-SET-43/V-SET-44, UX SET-011b
-- Wave0: org_id business scope (NOT tenant_id). RLS via app.current_org_id() (NOT raw current_setting).
--
-- Settings-owned per-org authorization policies for NPD post-release edit requests and
-- Technical product-spec approval gates. Column shape matches the runtime consumers:
--   apps/web/actions/authorization/preflight.ts (readAuthorizationPolicy / runNpdPostReleaseEditPreflight)
--   apps/web/actions/authorization/policy-actions.ts (updateAuthorizationPolicy — version increment)
--   apps/web/app/[locale]/(app)/(admin)/settings/authorization/page.tsx
-- These helpers (T-126) already exist and fail at runtime because this table is missing.
--
-- Risk red lines (T-122):
--   * No NPD/Technical workflow implementation here (schema + seed only).
--   * requires_new_version=true is invariant for npd_post_release_edit (no in-place released-spec mutation).
--   * No self-authorization default for npd_manager (segregation_of_duties default = true).
--   * Explicit typed columns + CHECK constraints — not unvalidated JSON-only storage.

-- ============================================================
-- 1. Table DDL — explicit columns + constraints (no JSON-only storage)
-- ============================================================
create table if not exists public.org_authorization_policies (
  id                            uuid        primary key default gen_random_uuid(),
  org_id                        uuid        not null references public.organizations(id) on delete cascade,
  policy_code                   text        not null,
  is_enabled                    boolean     not null default true,
  request_permissions           text[]      not null default '{}'::text[],
  authorize_permissions         text[]      not null default '{}'::text[],
  approver_role_codes           text[]      not null default '{}'::text[],
  min_approvers                 integer     not null default 1,
  require_segregation_of_duties boolean     not null default true,
  requires_new_version          boolean     not null default true,
  approval_gate_rule_code       text,
  settings_json                 jsonb       not null default '{}'::jsonb,
  version                       integer     not null default 1,
  updated_by                    uuid        references public.users(id) on delete set null,
  created_at                    timestamptz not null default pg_catalog.now(),
  updated_at                    timestamptz not null default pg_catalog.now(),
  constraint org_authorization_policies_org_code_unique unique (org_id, policy_code),
  constraint org_authorization_policies_code_check
    check (policy_code in ('npd_post_release_edit', 'technical_product_spec_approval')),
  constraint org_authorization_policies_min_approvers_check
    check (min_approvers >= 1),
  constraint org_authorization_policies_version_check
    check (version >= 1),
  -- V-SET-43 invariant: npd_post_release_edit must always require a new version (no in-place edit of released specs).
  constraint org_authorization_policies_npd_requires_new_version_check
    check (policy_code <> 'npd_post_release_edit' or requires_new_version = true)
);

-- ============================================================
-- 2. Indexes (org_id always first; lookup is by (org_id, policy_code))
-- ============================================================
create index if not exists org_authorization_policies_org_idx
  on public.org_authorization_policies (org_id);
create index if not exists org_authorization_policies_org_code_idx
  on public.org_authorization_policies (org_id, policy_code);

-- ============================================================
-- 3. RLS — enable + FORCE; single org-context policy (project convention, see migration 044)
-- ============================================================
alter table public.org_authorization_policies enable row level security;
alter table public.org_authorization_policies force row level security;

drop policy if exists org_authorization_policies_org_context on public.org_authorization_policies;
create policy org_authorization_policies_org_context
  on public.org_authorization_policies
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.org_authorization_policies from public;
grant select, insert, update, delete on public.org_authorization_policies to app_user;

-- updated_at maintenance (no shared app.set_updated_at() in this project; inline trigger fn).
create or replace function public.org_authorization_policies_set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists org_authorization_policies_set_updated_at on public.org_authorization_policies;
create trigger org_authorization_policies_set_updated_at
  before update on public.org_authorization_policies
  for each row execute function public.org_authorization_policies_set_updated_at();

comment on table public.org_authorization_policies
  is 'T-122: Settings-owned per-org authorization policies (NPD post-release edit + Technical product-spec approval). V-SET-43/V-SET-44.';

-- ============================================================
-- 4. Per-org default seed — function applied on org INSERT + backfill (pattern from migration 032)
--    Seeds the two policy rows AND the technical_product_spec_approval_gate_v1 gate rule in
--    public.rule_definitions so runTechnicalApprovalPreflight does not fire `gate_rule_missing`.
--    SECURITY DEFINER bypasses RLS (current_org_id() is unset during the org INSERT).
-- ============================================================
create or replace function public.seed_authorization_policies_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- NPD post-release edit policy. owner authorizes; segregation-of-duties on; requires new version (invariant).
  insert into public.org_authorization_policies
    (org_id, policy_code, is_enabled, request_permissions, authorize_permissions,
     approver_role_codes, min_approvers, require_segregation_of_duties, requires_new_version,
     approval_gate_rule_code, settings_json, version)
  values
    (p_org_id, 'npd_post_release_edit', true,
     array['npd.released_product_edit.request']::text[],
     array['npd.released_product_edit.authorize']::text[],
     array['owner']::text[], 1, true, true,
     null, '{}'::jsonb, 1)
  on conflict (org_id, policy_code) do nothing;

  -- Technical product-spec approval policy. quality_lead approves; references the gate rule.
  insert into public.org_authorization_policies
    (org_id, policy_code, is_enabled, request_permissions, authorize_permissions,
     approver_role_codes, min_approvers, require_segregation_of_duties, requires_new_version,
     approval_gate_rule_code, settings_json, version)
  values
    (p_org_id, 'technical_product_spec_approval', true,
     '{}'::text[],
     array['technical.product_spec.approve']::text[],
     array['quality_lead']::text[], 1, true, true,
     'technical_product_spec_approval_gate_v1',
     jsonb_build_object('require_dual_sign_off', true), 1)
  on conflict (org_id, policy_code) do nothing;

  -- Active gate rule referenced by the technical approval preflight (rule_definitions, migration 039).
  if to_regclass('public.rule_definitions') is not null then
    insert into public.rule_definitions
      (org_id, rule_code, rule_type, tier, definition_json, version, active_from, active_to)
    values
      (p_org_id, 'technical_product_spec_approval_gate_v1', 'gate', 'L1',
       jsonb_build_object('min_approvers', 1, 'requires_new_version', true), 1, pg_catalog.now(), null)
    on conflict (org_id, rule_code, version) do nothing;
  end if;
end;
$$;

create or replace function public.seed_authorization_policies_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.seed_authorization_policies_for_org(new.id);
  return new;
end;
$$;

drop trigger if exists trg_seed_authorization_policies on public.organizations;
create trigger trg_seed_authorization_policies
  after insert on public.organizations
  for each row
  execute function public.seed_authorization_policies_on_org_insert();

-- Backfill every existing org (idempotent via ON CONFLICT DO NOTHING inside the function).
do $$
declare
  v_org record;
begin
  for v_org in select id from public.organizations loop
    perform public.seed_authorization_policies_for_org(v_org.id);
  end loop;
end
$$;

exec
/bin/zsh -lc "sed -n '1,280p' packages/db/migrations/065-d365-sync-runs.sql" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 succeeded in 0ms:
-- Migration 065: 02-settings T-112 — d365_sync_runs (D365 Sync Audit, SET-083 §11.3)
-- PRD: docs/prd/02-SETTINGS-PRD.md §11.3, §11.4
-- Wave0: org_id business scope (NOT tenant_id). RLS via app.current_org_id().
--
-- Read-only audit viewer source. Column shape matches the consumer page:
--   apps/web/app/[locale]/(app)/(admin)/settings/integrations/d365/audit/page.tsx
--   reads: id, started_at, finished_at, direction (pull|push), entity_type, status (ok|partial|failed),
--          rows_in, rows_ok, rows_failed, error_summary, errors (jsonb)
-- NO seed — honest empty-state until the D365 sync engine (another module) produces rows.

create table if not exists public.d365_sync_runs (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references public.organizations(id) on delete cascade,
  started_at    timestamptz not null default pg_catalog.now(),
  finished_at   timestamptz,
  direction     text        not null,
  entity_type   text        not null,
  status        text        not null,
  rows_in       integer     not null default 0,
  rows_ok       integer     not null default 0,
  rows_failed   integer     not null default 0,
  error_summary text,
  errors        jsonb       not null default '[]'::jsonb,
  created_at    timestamptz not null default pg_catalog.now(),
  constraint d365_sync_runs_direction_check check (direction in ('pull', 'push')),
  constraint d365_sync_runs_status_check check (status in ('ok', 'partial', 'failed')),
  constraint d365_sync_runs_row_counts_check check (rows_in >= 0 and rows_ok >= 0 and rows_failed >= 0)
);

create index if not exists d365_sync_runs_org_idx
  on public.d365_sync_runs (org_id);
-- Page query: WHERE org_id (RLS) ORDER BY started_at DESC LIMIT 100.
create index if not exists d365_sync_runs_org_started_idx
  on public.d365_sync_runs (org_id, started_at desc);

alter table public.d365_sync_runs enable row level security;
alter table public.d365_sync_runs force row level security;
drop policy if exists d365_sync_runs_org_context on public.d365_sync_runs;
create policy d365_sync_runs_org_context
  on public.d365_sync_runs
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.d365_sync_runs from public;
grant select, insert, update, delete on public.d365_sync_runs to app_user;

comment on table public.d365_sync_runs
  is 'T-112: D365 sync audit runs (SET-083). Producer is the D365 sync engine in another module; read-only viewer in Settings.';

exec
/bin/zsh -lc "sed -n '1,320p' packages/db/migrations/064-unit-of-measure.sql" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 succeeded in 0ms:
-- Migration 064: 02-settings T-073 — unit_of_measure + uom_custom_conversions (schema + reference seed)
-- PRD: docs/prd/02-SETTINGS-PRD.md §8 (Units / UoM)
-- Wave0: org_id business scope (NOT tenant_id). RLS via app.current_org_id().
--
-- Column shape matches the consumer page:
--   apps/web/app/[locale]/(app)/(admin)/settings/units/page.tsx
--   unit_of_measure:        id, org_id, category, code, name, factor_to_base, is_base, deleted_at
--   uom_custom_conversions: id, org_id, label, from_unit_code, to_unit_code, factor, deleted_at
-- Seeds a baseline set of standard UoM as REAL reference data (kg/g/t/mg, L/mL, ea/box/pallet).
-- Adds RBAC permission settings.units.manage so the page's canEdit gate CAN be true (page wiring is T-073 UI scope).

-- ============================================================
-- 1. unit_of_measure
-- ============================================================
create table if not exists public.unit_of_measure (
  id             uuid        primary key default gen_random_uuid(),
  org_id         uuid        not null references public.organizations(id) on delete cascade,
  category       text        not null,
  code           text        not null,
  name           text        not null,
  factor_to_base numeric(18, 6) not null default 1,
  is_base        boolean     not null default false,
  created_at     timestamptz not null default pg_catalog.now(),
  updated_at     timestamptz not null default pg_catalog.now(),
  deleted_at     timestamptz,
  constraint unit_of_measure_category_check check (category in ('mass', 'volume', 'count')),
  constraint unit_of_measure_factor_positive check (factor_to_base > 0),
  constraint unit_of_measure_org_code_unique unique (org_id, code)
);

create index if not exists unit_of_measure_org_idx
  on public.unit_of_measure (org_id);
create index if not exists unit_of_measure_org_category_idx
  on public.unit_of_measure (org_id, category, is_base);
-- One base unit per (org, category): partial unique index over live (non-deleted) base rows.
create unique index if not exists unit_of_measure_org_category_base_uq
  on public.unit_of_measure (org_id, category)
  where is_base and deleted_at is null;

alter table public.unit_of_measure enable row level security;
alter table public.unit_of_measure force row level security;
drop policy if exists unit_of_measure_org_context on public.unit_of_measure;
create policy unit_of_measure_org_context
  on public.unit_of_measure
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.unit_of_measure from public;
grant select, insert, update, delete on public.unit_of_measure to app_user;

comment on table public.unit_of_measure
  is 'T-073: per-org units of measure (mass/volume/count) used across recipes, stock, shipping.';

-- ============================================================
-- 2. uom_custom_conversions
-- ============================================================
create table if not exists public.uom_custom_conversions (
  id             uuid        primary key default gen_random_uuid(),
  org_id         uuid        not null references public.organizations(id) on delete cascade,
  label          text        not null,
  from_unit_code text        not null,
  to_unit_code   text        not null,
  factor         numeric(18, 6) not null,
  created_at     timestamptz not null default pg_catalog.now(),
  updated_at     timestamptz not null default pg_catalog.now(),
  deleted_at     timestamptz,
  constraint uom_custom_conversions_factor_positive check (factor > 0),
  constraint uom_custom_conversions_org_label_unique unique (org_id, label)
);

create index if not exists uom_custom_conversions_org_idx
  on public.uom_custom_conversions (org_id);
create index if not exists uom_custom_conversions_org_label_idx
  on public.uom_custom_conversions (org_id, label);

alter table public.uom_custom_conversions enable row level security;
alter table public.uom_custom_conversions force row level security;
drop policy if exists uom_custom_conversions_org_context on public.uom_custom_conversions;
create policy uom_custom_conversions_org_context
  on public.uom_custom_conversions
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.uom_custom_conversions from public;
grant select, insert, update, delete on public.uom_custom_conversions to app_user;

comment on table public.uom_custom_conversions
  is 'T-073: per-org non-linear UoM conversions (e.g. flour 1 cup = 120g).';

-- ============================================================
-- 3. updated_at triggers (inline; no shared app.set_updated_at() in this project)
-- ============================================================
create or replace function public.unit_of_measure_set_updated_at()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin new.updated_at := pg_catalog.now(); return new; end; $$;

drop trigger if exists unit_of_measure_set_updated_at on public.unit_of_measure;
create trigger unit_of_measure_set_updated_at
  before update on public.unit_of_measure
  for each row execute function public.unit_of_measure_set_updated_at();

drop trigger if exists uom_custom_conversions_set_updated_at on public.uom_custom_conversions;
create trigger uom_custom_conversions_set_updated_at
  before update on public.uom_custom_conversions
  for each row execute function public.unit_of_measure_set_updated_at();

-- ============================================================
-- 4. Reference seed — standard UoM per org (function on org INSERT + backfill; pattern from migration 032).
--    These are legitimate standard reference units (SI + common packaging), not demo mock rows.
-- ============================================================
create or replace function public.seed_units_of_measure_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.unit_of_measure (org_id, category, code, name, factor_to_base, is_base)
  values
    -- mass (base: kg)
    (p_org_id, 'mass', 'kg', 'Kilogram', 1,         true),
    (p_org_id, 'mass', 'g',  'Gram',     0.001,     false),
    (p_org_id, 'mass', 'mg', 'Milligram',0.000001,  false),
    (p_org_id, 'mass', 't',  'Tonne',    1000,      false),
    -- volume (base: L)
    (p_org_id, 'volume', 'L',  'Litre',      1,     true),
    (p_org_id, 'volume', 'mL', 'Millilitre', 0.001, false),
    -- count (base: ea)
    (p_org_id, 'count', 'ea',     'Each',   1,   true),
    (p_org_id, 'count', 'box',    'Box',    1,   false),
    (p_org_id, 'count', 'pallet', 'Pallet', 1,   false)
  on conflict (org_id, code) do nothing;
end;
$$;

create or replace function public.seed_units_of_measure_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.seed_units_of_measure_for_org(new.id);
  return new;
end;
$$;

drop trigger if exists trg_seed_units_of_measure on public.organizations;
create trigger trg_seed_units_of_measure
  after insert on public.organizations
  for each row
  execute function public.seed_units_of_measure_on_org_insert();

do $$
declare v_org record;
begin
  for v_org in select id from public.organizations loop
    perform public.seed_units_of_measure_for_org(v_org.id);
  end loop;
end
$$;

-- ============================================================
-- 5. RBAC — settings.units.manage permission for admin roles (lets the page's canEdit gate be true).
--    Mirrors migration 050 dual-write (normalized role_permissions + legacy roles.permissions JSONB).
-- ============================================================
do $$
begin
  if to_regclass('public.role_permissions') is null or to_regclass('public.roles') is null then
    return; -- RBAC tables not present yet; nothing to grant.
  end if;

  insert into public.role_permissions (role_id, permission)
  select r.id, 'settings.units.manage'::text
    from public.roles r
   where r.code in ('owner', 'admin', 'org_admin')
  on conflict (role_id, permission) do nothing;

  update public.roles r
     set permissions = (
       select jsonb_agg(distinct value order by value)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as value
           union all
           select 'settings.units.manage'
         ) merged
     )
   where r.code in ('owner', 'admin', 'org_admin');
end
$$;

exec
/bin/zsh -lc "sed -n '1,280p' packages/db/migrations/066-email-delivery-log.sql" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 succeeded in 0ms:
-- Migration 066: 02-settings T-113 — email_delivery_log (Email Delivery Log, SET-093 §13.4)
-- PRD: docs/prd/02-SETTINGS-PRD.md §13.4, §13.2
-- Wave0: org_id business scope (NOT tenant_id). RLS via app.current_org_id().
--
-- Read-only viewer source, populated by the email outbox/DLQ worker (§13.2, another module).
-- Column shape matches the consumer page:
--   apps/web/app/[locale]/(app)/(admin)/settings/notifications/email-log/page.tsx
--   reads: id, created_at, status (queued|sent|failed|dlq), retry_status, trigger_code,
--          recipient_email, provider_message_id, payload (jsonb)
-- Task JSON §13.4 also lists subject / retry_count / last_error_summary (worker-written) — included for completeness.
-- NO seed — honest empty-state until the email worker produces rows.

create table if not exists public.email_delivery_log (
  id                  uuid        primary key default gen_random_uuid(),
  org_id              uuid        not null references public.organizations(id) on delete cascade,
  trigger_code        text        not null,
  recipient_email     text        not null,
  subject             text,
  status              text        not null default 'queued',
  retry_status        text        not null default 'not_retried',
  retry_count         integer     not null default 0,
  provider_message_id text,
  last_error_summary  text,
  payload             jsonb       not null default '{}'::jsonb,
  created_at          timestamptz not null default pg_catalog.now(),
  updated_at          timestamptz not null default pg_catalog.now(),
  constraint email_delivery_log_status_check
    check (status in ('queued', 'sent', 'failed', 'dlq')),
  constraint email_delivery_log_retry_status_check
    check (retry_status in ('not_retried', 'retry_scheduled', 'retry_exhausted', 'dlq')),
  constraint email_delivery_log_retry_count_check check (retry_count >= 0)
);

create index if not exists email_delivery_log_org_idx
  on public.email_delivery_log (org_id);
-- Page query: WHERE org_id (RLS) ORDER BY created_at DESC LIMIT 100.
create index if not exists email_delivery_log_org_created_idx
  on public.email_delivery_log (org_id, created_at desc);
create index if not exists email_delivery_log_org_trigger_idx
  on public.email_delivery_log (org_id, trigger_code);

alter table public.email_delivery_log enable row level security;
alter table public.email_delivery_log force row level security;
drop policy if exists email_delivery_log_org_context on public.email_delivery_log;
create policy email_delivery_log_org_context
  on public.email_delivery_log
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.email_delivery_log from public;
grant select, insert, update, delete on public.email_delivery_log to app_user;

comment on table public.email_delivery_log
  is 'T-113: per-org email delivery log (SET-093). Producer is the email outbox/DLQ worker; read-only viewer in Settings.';

codex
063-066 mostly have the required RLS shape. I’m now checking 067-070 and then I’ll cross-check event type and nullable-org handling against nearby migrations/schema.
exec
/bin/zsh -lc "sed -n '1,280p' packages/db/migrations/069-modules-description.sql" in /Users/mariuszkrawczyk/Projects/monopilot-kira
exec
/bin/zsh -lc "sed -n '1,360p' packages/db/migrations/067-feature-flags-core.sql" in /Users/mariuszkrawczyk/Projects/monopilot-kira
exec
/bin/zsh -lc "sed -n '1,320p' packages/db/migrations/068-login-attempts.sql" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 succeeded in 0ms:
-- 069 — Settings module catalog descriptions + organization_modules.updated_at.
--
-- T-072 (/settings/features) and T-103 (/settings/modules) read REAL module
-- catalog data. The audit found descriptions were sourced from a hardcoded
-- MODULE_DESCRIPTIONS map in the page; per the no-hardcode mandate the copy
-- must live in the catalog. This migration adds:
--
--   1. public.modules.description (the per-module human-readable summary the
--      Features/Modules screens render under each toggle), seeded for the
--      T-092 §10.1 module baseline.
--   2. public.organization_modules.updated_at — the T-019 toggleModule action
--      (apps/web/actions/modules/toggle.ts) already writes `updated_at = now()`
--      on every toggle, but the column was never created, so a real toggle
--      raised undefined_column → persistence_failed. Added idempotently here so
--      the wired action persists instead of forking it.
--
-- Additive + idempotent: safe to re-run.

alter table public.modules
  add column if not exists description text;

update public.modules m
set description = v.description
from (values
  ('00-foundation',     'Authentication, RBAC, tenancy, audit, outbox, and observability.'),
  ('01-npd',            'Product development, specifications, and allergen workflow.'),
  ('02-settings',       'Reference data, policies, permissions, and workspace configuration.'),
  ('03-technical',      'Products, BOMs, routings, equipment, items, and standard costs.'),
  ('04-planning-basic', 'Suppliers, purchase orders, work order baseline, and MRP.'),
  ('05-warehouse',      'License plates, GRN, transfers, and stock movements.'),
  ('06-scanner-p1',     'Mobile scanner workflows, operators, and offline sync.'),
  ('07-planning-ext',   'Extended planning, scheduler outputs, and dependency planning.'),
  ('08-production',     'Work order execution, outputs, waste, and downtime.'),
  ('09-quality',        'Specifications, holds, NCR, HACCP, and allergen gates.'),
  ('10-finance',        'Standard costs, actual costing, FIFO/WAC variance, and D365 export.'),
  ('11-shipping',       'Sales orders, allocation, pick/pack, BOL, POD, and carriers.'),
  ('12-reporting',      'KPIs, dashboards, exports, and reporting consumers.'),
  ('13-maintenance',    'Assets, PM schedules, maintenance work orders, LOTO, and calibration.'),
  ('14-multi-site',     'Site context, inter-site transfers, lanes, and master-data sync.'),
  ('15-oee',            'Availability, performance, quality, and read-only snapshots.')
) as v(code, description)
where m.code = v.code
  and (m.description is null or m.description = '');

alter table public.organization_modules
  add column if not exists updated_at timestamptz default now();

update public.organization_modules
set updated_at = coalesce(updated_at, now());

 succeeded in 0ms:
-- Migration 067: 02-settings T-013 — feature_flags_core (§10.2 built-in fallback)
-- PRD: docs/prd/02-SETTINGS-PRD.md §10.2 feature_flags_core
-- Wave0: org_id business scope (NOT tenant_id). RLS via app.current_org_id().
--
-- Per-org built-in feature-flag fallback table. PostHog flags are NOT mirrored here (T-013 red line).
-- PK is (org_id, flag_code); rolled_out_pct INT default 0 (per T-013 AC).
-- Seeds the 4 §10.2 core flags (is_enabled=false) PLUS the two authorization flags the /flags screen
-- and V-SET-42/43/44 expect, so the screen renders real Supabase data.
-- notification_preferences (the other T-013 table) already exists from migration 049; this migration
-- only adds feature_flags_core. The combined Drizzle schema lives in packages/db/schema/flags-prefs.ts.

create table if not exists public.feature_flags_core (
  org_id          uuid        not null references public.organizations(id) on delete cascade,
  flag_code       text        not null,
  description     text        not null default '',
  is_enabled      boolean     not null default false,
  rolled_out_pct  integer     not null default 0,
  tier            text        not null default 'L1',
  created_at      timestamptz not null default pg_catalog.now(),
  updated_at      timestamptz not null default pg_catalog.now(),
  primary key (org_id, flag_code),
  constraint feature_flags_core_rolled_out_pct_check check (rolled_out_pct between 0 and 100),
  constraint feature_flags_core_tier_check check (tier in ('L1', 'L2', 'L3', 'L4'))
);

create index if not exists feature_flags_core_org_idx
  on public.feature_flags_core (org_id);

alter table public.feature_flags_core enable row level security;
alter table public.feature_flags_core force row level security;
drop policy if exists feature_flags_core_org_context on public.feature_flags_core;
create policy feature_flags_core_org_context
  on public.feature_flags_core
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.feature_flags_core from public;
grant select, insert, update, delete on public.feature_flags_core to app_user;

create or replace function public.feature_flags_core_set_updated_at()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin new.updated_at := pg_catalog.now(); return new; end; $$;

drop trigger if exists feature_flags_core_set_updated_at on public.feature_flags_core;
create trigger feature_flags_core_set_updated_at
  before update on public.feature_flags_core
  for each row execute function public.feature_flags_core_set_updated_at();

comment on table public.feature_flags_core
  is 'T-013: §10.2 built-in feature-flag fallback (per-org). PostHog non-core flags are NOT mirrored here.';

-- ============================================================
-- Per-org seed — 4 §10.2 core flags + 2 authorization flags for the /flags screen (V-SET-42/43/44).
-- Pattern from migration 032 (function on INSERT + backfill).
-- ============================================================
create or replace function public.seed_feature_flags_core_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.feature_flags_core (org_id, flag_code, description, is_enabled, rolled_out_pct, tier)
  values
    -- §10.2 core flags (is_enabled=false per T-013 AC).
    (p_org_id, 'maintenance_mode',          'Put the org into maintenance mode.',                   false, 0, 'L1'),
    (p_org_id, 'integration.d365.enabled',  'Enable Dynamics 365 integration for this org.',        false, 0, 'L1'),
    (p_org_id, 'scanner.pwa.enabled',       'Enable the warehouse scanner PWA.',                    false, 0, 'L1'),
    (p_org_id, 'npd.d365_builder.execute',  'Allow the NPD D365 builder to execute.',               false, 0, 'L1'),
    -- Authorization flags surfaced by /settings/flags (V-SET-42/43/44 preflight gate).
    (p_org_id, 'npd.post_release_edit.enabled',          'Allow released NPD product/BOM edits after authorization.', false, 0,   'L1'),
    (p_org_id, 'technical.product_spec_approval.required','Require Technical product-spec approval before factory use.', true,  100, 'L1')
  on conflict (org_id, flag_code) do nothing;
end;
$$;

create or replace function public.seed_feature_flags_core_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.seed_feature_flags_core_for_org(new.id);
  return new;
end;
$$;

drop trigger if exists trg_seed_feature_flags_core on public.organizations;
create trigger trg_seed_feature_flags_core
  after insert on public.organizations
  for each row
  execute function public.seed_feature_flags_core_on_org_insert();

do $$
declare v_org record;
begin
  for v_org in select id from public.organizations loop
    perform public.seed_feature_flags_core_for_org(v_org.id);
  end loop;
end
$$;

 succeeded in 0ms:
-- Migration 068: 02-settings T-011 — login_attempts (§5.7 security tables, S-U5)
-- PRD: docs/prd/02-SETTINGS-PRD.md §5.7, §14.1, S-U5
-- Wave0: org_id business scope (NOT tenant_id). RLS via app.current_org_id().
--
-- §5.7 names three security tables: org_security_policies (migration 017), password_history
-- (migration 018), and login_attempts. The first two already exist, so this migration adds only
-- login_attempts (rate-limit / lockout audit feed). No plaintext password is ever stored here.
--
-- org_id is nullable: a failed attempt for an unknown email cannot always be resolved to an org,
-- and lockout counting must still record it. RLS therefore admits NULL-org rows only to nobody via
-- app_user (org_id = current_org_id() never matches NULL); the auth flow reads/writes these rows via
-- the owner/service connection (rate-limit middleware), consistent with login being pre-org-context.

create table if not exists public.login_attempts (
  id           uuid        primary key default gen_random_uuid(),
  org_id       uuid        references public.organizations(id) on delete cascade,
  user_id      uuid        references public.users(id) on delete set null,
  email        text        not null,
  ip_address   inet,
  user_agent   text,
  success      boolean     not null default false,
  failure_reason text,
  attempted_at timestamptz not null default pg_catalog.now()
);

-- Lockout lookups: recent failures by email / by ip within a window.
create index if not exists login_attempts_email_attempted_idx
  on public.login_attempts (lower(email), attempted_at desc);
create index if not exists login_attempts_ip_attempted_idx
  on public.login_attempts (ip_address, attempted_at desc);
create index if not exists login_attempts_org_attempted_idx
  on public.login_attempts (org_id, attempted_at desc);

alter table public.login_attempts enable row level security;
alter table public.login_attempts force row level security;
drop policy if exists login_attempts_org_context on public.login_attempts;
create policy login_attempts_org_context
  on public.login_attempts
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.login_attempts from public;
grant select, insert, update, delete on public.login_attempts to app_user;

comment on table public.login_attempts
  is 'T-011: §5.7 login attempt audit feed for lockout / rate-limit. Never stores plaintext passwords.';

exec
/bin/zsh -lc "sed -n '1,360p' packages/db/migrations/070-notification-preferences.sql" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 succeeded in 0ms:
-- Migration 049 — SET-092 notification preferences + outbox events
-- Adds the user/org-scoped notification preference store used by the Settings
-- notifications screen and allows the transactional outbox event types emitted
-- by its Server Actions.

create table if not exists public.notification_preferences (
  user_id        uuid    not null references public.users(id) on delete cascade,
  org_id         uuid    not null references public.organizations(id) on delete cascade,
  category       text    not null,
  event          text    not null,
  channel_email  boolean not null default true,
  channel_in_app boolean not null default true,
  created_at     timestamptz not null default pg_catalog.now(),
  updated_at     timestamptz not null default pg_catalog.now(),
  primary key (user_id, org_id, category, event),
  constraint notification_preferences_category_event_nonempty
    check (length(trim(category)) > 0 and length(trim(event)) > 0)
);

create index if not exists notification_preferences_org_event_idx
  on public.notification_preferences (org_id, category, event);

alter table public.notification_preferences enable row level security;
alter table public.notification_preferences force row level security;

drop policy if exists notification_preferences_org_context on public.notification_preferences;
create policy notification_preferences_org_context
  on public.notification_preferences
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

alter table public.outbox_events
  drop constraint if exists outbox_events_event_type_check;

alter table public.outbox_events
  add constraint outbox_events_event_type_check check (
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
      'shipment.created',
      'tenant.migration.run',
      'tenant.migration.run.failed',
      'tenant.cohort.advanced',
      'settings.schema.migration_requested',
      'settings.rule.deployed',
      'rule.deployed',
      'settings.location.upserted',
      'settings.machine.upserted',
      'settings.line.upserted',
      'settings.warehouse.deactivated',
      'onboarding.step.advance',
      'onboarding.step.back',
      'onboarding.step.skip',
      'onboarding.step.jump',
      'onboarding.step.restart',
      'onboarding.first_wo_recorded',
      'settings.notification_rule_updated',
      'settings.notification_channel_updated',
      'settings.notification_digest_updated'
    )
  );

comment on table public.notification_preferences
  is 'SET-092 per-user/per-org notification preferences surfaced by /settings/notifications.';

exec
/bin/zsh -lc "nl -ba packages/db/migrations/063-org-authorization-policies.sql | sed -n '80,190p'" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 succeeded in 0ms:
    80	as $$
    81	begin
    82	  new.updated_at := pg_catalog.now();
    83	  return new;
    84	end;
    85	$$;
    86	
    87	drop trigger if exists org_authorization_policies_set_updated_at on public.org_authorization_policies;
    88	create trigger org_authorization_policies_set_updated_at
    89	  before update on public.org_authorization_policies
    90	  for each row execute function public.org_authorization_policies_set_updated_at();
    91	
    92	comment on table public.org_authorization_policies
    93	  is 'T-122: Settings-owned per-org authorization policies (NPD post-release edit + Technical product-spec approval). V-SET-43/V-SET-44.';
    94	
    95	-- ============================================================
    96	-- 4. Per-org default seed — function applied on org INSERT + backfill (pattern from migration 032)
    97	--    Seeds the two policy rows AND the technical_product_spec_approval_gate_v1 gate rule in
    98	--    public.rule_definitions so runTechnicalApprovalPreflight does not fire `gate_rule_missing`.
    99	--    SECURITY DEFINER bypasses RLS (current_org_id() is unset during the org INSERT).
   100	-- ============================================================
   101	create or replace function public.seed_authorization_policies_for_org(p_org_id uuid)
   102	returns void
   103	language plpgsql
   104	security definer
   105	set search_path = pg_catalog, public
   106	as $$
   107	begin
   108	  -- NPD post-release edit policy. owner authorizes; segregation-of-duties on; requires new version (invariant).
   109	  insert into public.org_authorization_policies
   110	    (org_id, policy_code, is_enabled, request_permissions, authorize_permissions,
   111	     approver_role_codes, min_approvers, require_segregation_of_duties, requires_new_version,
   112	     approval_gate_rule_code, settings_json, version)
   113	  values
   114	    (p_org_id, 'npd_post_release_edit', true,
   115	     array['npd.released_product_edit.request']::text[],
   116	     array['npd.released_product_edit.authorize']::text[],
   117	     array['owner']::text[], 1, true, true,
   118	     null, '{}'::jsonb, 1)
   119	  on conflict (org_id, policy_code) do nothing;
   120	
   121	  -- Technical product-spec approval policy. quality_lead approves; references the gate rule.
   122	  insert into public.org_authorization_policies
   123	    (org_id, policy_code, is_enabled, request_permissions, authorize_permissions,
   124	     approver_role_codes, min_approvers, require_segregation_of_duties, requires_new_version,
   125	     approval_gate_rule_code, settings_json, version)
   126	  values
   127	    (p_org_id, 'technical_product_spec_approval', true,
   128	     '{}'::text[],
   129	     array['technical.product_spec.approve']::text[],
   130	     array['quality_lead']::text[], 1, true, true,
   131	     'technical_product_spec_approval_gate_v1',
   132	     jsonb_build_object('require_dual_sign_off', true), 1)
   133	  on conflict (org_id, policy_code) do nothing;
   134	
   135	  -- Active gate rule referenced by the technical approval preflight (rule_definitions, migration 039).
   136	  if to_regclass('public.rule_definitions') is not null then
   137	    insert into public.rule_definitions
   138	      (org_id, rule_code, rule_type, tier, definition_json, version, active_from, active_to)
   139	    values
   140	      (p_org_id, 'technical_product_spec_approval_gate_v1', 'gate', 'L1',
   141	       jsonb_build_object('min_approvers', 1, 'requires_new_version', true), 1, pg_catalog.now(), null)
   142	    on conflict (org_id, rule_code, version) do nothing;
   143	  end if;
   144	end;
   145	$$;
   146	
   147	create or replace function public.seed_authorization_policies_on_org_insert()
   148	returns trigger
   149	language plpgsql
   150	security definer
   151	set search_path = pg_catalog, public
   152	as $$
   153	begin
   154	  perform public.seed_authorization_policies_for_org(new.id);
   155	  return new;
   156	end;
   157	$$;
   158	
   159	drop trigger if exists trg_seed_authorization_policies on public.organizations;
   160	create trigger trg_seed_authorization_policies
   161	  after insert on public.organizations
   162	  for each row
   163	  execute function public.seed_authorization_policies_on_org_insert();
   164	
   165	-- Backfill every existing org (idempotent via ON CONFLICT DO NOTHING inside the function).
   166	do $$
   167	declare
   168	  v_org record;
   169	begin
   170	  for v_org in select id from public.organizations loop
   171	    perform public.seed_authorization_policies_for_org(v_org.id);
   172	  end loop;
   173	end
   174	$$;

exec
/bin/zsh -lc "nl -ba packages/db/migrations/070-notification-preferences.sql | sed -n '1,160p'" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 succeeded in 0ms:
     1	-- Migration 049 — SET-092 notification preferences + outbox events
     2	-- Adds the user/org-scoped notification preference store used by the Settings
     3	-- notifications screen and allows the transactional outbox event types emitted
     4	-- by its Server Actions.
     5	
     6	create table if not exists public.notification_preferences (
     7	  user_id        uuid    not null references public.users(id) on delete cascade,
     8	  org_id         uuid    not null references public.organizations(id) on delete cascade,
     9	  category       text    not null,
    10	  event          text    not null,
    11	  channel_email  boolean not null default true,
    12	  channel_in_app boolean not null default true,
    13	  created_at     timestamptz not null default pg_catalog.now(),
    14	  updated_at     timestamptz not null default pg_catalog.now(),
    15	  primary key (user_id, org_id, category, event),
    16	  constraint notification_preferences_category_event_nonempty
    17	    check (length(trim(category)) > 0 and length(trim(event)) > 0)
    18	);
    19	
    20	create index if not exists notification_preferences_org_event_idx
    21	  on public.notification_preferences (org_id, category, event);
    22	
    23	alter table public.notification_preferences enable row level security;
    24	alter table public.notification_preferences force row level security;
    25	
    26	drop policy if exists notification_preferences_org_context on public.notification_preferences;
    27	create policy notification_preferences_org_context
    28	  on public.notification_preferences
    29	  for all
    30	  to app_user
    31	  using (org_id = app.current_org_id())
    32	  with check (org_id = app.current_org_id());
    33	
    34	alter table public.outbox_events
    35	  drop constraint if exists outbox_events_event_type_check;
    36	
    37	alter table public.outbox_events
    38	  add constraint outbox_events_event_type_check check (
    39	    event_type in (
    40	      'org.created',
    41	      'user.invited',
    42	      'role.assigned',
    43	      'audit.recorded',
    44	      'brief.created',
    45	      'fg.created',
    46	      'fg.allergens_changed',
    47	      'fg.intermediate_code_changed',
    48	      'lp.received',
    49	      'wo.ready',
    50	      'quality.recorded',
    51	      'shipment.created',
    52	      'tenant.migration.run',
    53	      'tenant.migration.run.failed',
    54	      'tenant.cohort.advanced',
    55	      'settings.schema.migration_requested',
    56	      'settings.rule.deployed',
    57	      'rule.deployed',
    58	      'settings.location.upserted',
    59	      'settings.machine.upserted',
    60	      'settings.line.upserted',
    61	      'settings.warehouse.deactivated',
    62	      'onboarding.step.advance',
    63	      'onboarding.step.back',
    64	      'onboarding.step.skip',
    65	      'onboarding.step.jump',
    66	      'onboarding.step.restart',
    67	      'onboarding.first_wo_recorded',
    68	      'settings.notification_rule_updated',
    69	      'settings.notification_channel_updated',
    70	      'settings.notification_digest_updated'
    71	    )
    72	  );
    73	
    74	comment on table public.notification_preferences
    75	  is 'SET-092 per-user/per-org notification preferences surfaced by /settings/notifications.';

exec
/bin/zsh -lc "rg \"outbox_events_event_type_check|event_type in|event_type.*'\" packages/db/migrations packages -g '*.sql' -g '*.ts'" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 succeeded in 0ms:
packages/db/migrations/049-onboarding-outbox-grants.sql:  DROP CONSTRAINT IF EXISTS outbox_events_event_type_check;
packages/db/migrations/049-onboarding-outbox-grants.sql:  ADD CONSTRAINT outbox_events_event_type_check CHECK (
packages/db/migrations/049-onboarding-outbox-grants.sql:COMMENT ON CONSTRAINT outbox_events_event_type_check ON public.outbox_events
packages/rule-engine/src/__tests__/cascade-mfg-intermediate.test.ts: *       /^WIP-MX-\d{7}$/ and an outbox row with event_type='fg.intermediate_code_changed'
packages/rule-engine/src/__tests__/cascade-mfg-intermediate.test.ts:            where org_id = $1 and event_type = 'fg.intermediate_code_changed'`,
packages/rule-engine/src/__tests__/cascade-mfg-intermediate.test.ts:            where org_id = $1 and event_type = 'fg.intermediate_code_changed'
packages/rule-engine/src/__tests__/cascade-mfg-intermediate.test.ts:            where org_id = $1 and event_type = 'fg.intermediate_code_changed'`,
packages/rule-engine/src/__tests__/workflow.test.ts:              event_type: 'wo.ready',
packages/rule-engine/src/__tests__/workflow.test.ts:              event_type: 'quality.recorded',
packages/rule-engine/src/__tests__/workflow.test.ts:      payload: expect.objectContaining({ event_type: 'wo.ready' }),
packages/rule-engine/src/__tests__/workflow.test.ts:        event_type: 'wo.ready',
packages/rule-engine/src/__tests__/workflow.test.ts:  dbIt('outbox CHECK constraint pins SQLSTATE 23514 on bad event_type', async () => {
packages/rule-engine/src/__tests__/workflow.test.ts:          'workflow.bogus_unknown_event_type',
packages/rule-engine/src/__tests__/workflow.test.ts:      event_type: 'wo.requestReady',
packages/rule-engine/src/__tests__/workflow.test.ts:      event_type: 'wo.requestReady',
packages/rule-engine/src/__tests__/workflow.test.ts:      executeRule(rule, { event_type: 'test.event' }, RuleExecutionMode.NORMAL);
packages/db/migrations/070-notification-preferences.sql:  drop constraint if exists outbox_events_event_type_check;
packages/db/migrations/070-notification-preferences.sql:  add constraint outbox_events_event_type_check check (
packages/db/migrations/070-notification-preferences.sql:    event_type in (
packages/db/migrations/047-outbox-events-settings-rules.sql:  DROP CONSTRAINT IF EXISTS outbox_events_event_type_check;
packages/db/migrations/047-outbox-events-settings-rules.sql:  ADD CONSTRAINT outbox_events_event_type_check CHECK (
packages/db/migrations/047-outbox-events-settings-rules.sql:COMMENT ON CONSTRAINT outbox_events_event_type_check ON public.outbox_events
packages/rule-engine/src/__tests__/executor.test.ts:        event_type: 'wo.status_change.READY',
packages/rule-engine/src/__tests__/executor.test.ts:        event_type: 'wo.status_change.READY',
packages/rule-engine/src/__tests__/executor.test.ts:        event_type: 'wo.status_change.READY',
packages/rule-engine/src/__tests__/executor.test.ts:      const event = { event_type: 'brief.import', source_dept: 'core' };
packages/rule-engine/src/__tests__/executor.test.ts:      const event = { event_type: 'some.event' };
packages/rule-engine/src/__tests__/executor.test.ts:      const event = { event_type: 'test.event' };
packages/rule-engine/src/__tests__/executor.test.ts:        event_type: 'brief.import',
packages/rule-engine/src/__tests__/executor.test.ts:        event_type: 'product.definition',
packages/rule-engine/src/__tests__/executor.test.ts:        event_type: 'product.definition',
packages/rule-engine/src/__tests__/executor.test.ts:        event_type: 'price.release',
packages/rule-engine/src/__tests__/executor.test.ts:        event_type: 'wo.created',
packages/rule-engine/src/__tests__/executor.test.ts:      const event = { event_type: 'test.event' };
packages/rule-engine/src/__tests__/executor.test.ts:      const event = { event_type: 'test.event', status: 'INACTIVE' };
packages/rule-engine/src/__tests__/executor.test.ts:      const wrongEvent = { event_type: 'wo.status_change.DRAFT' };
packages/rule-engine/src/__tests__/executor.test.ts:      const rightEvent = { event_type: 'wo.status_change.READY' };
packages/rule-engine/src/__tests__/executor.test.ts:        event_type: 'fg.manufacturing_operation_changed',
packages/rule-engine/src/__tests__/executor.test.ts:        event_type: 'fg.manufacturing_operation_changed',
packages/rule-engine/src/__tests__/executor.test.ts:        event_type: 'fg.manufacturing_operation_changed',
packages/rule-engine/src/__tests__/executor.test.ts:        event_type: 'fg.manufacturing_operation_changed',
packages/rule-engine/src/cascade-handler.ts: * row (event_type='fg.intermediate_code_changed') in the same tx as the UPDATE.
packages/rule-engine/src/executor.ts:  // Trigger discrimination: rule must list the event_type in its triggers
packages/rule-engine/src/executor.ts:  const triggerMatches = rule.triggers.includes(event['event_type']);
packages/db/__expected__/schema.sql:    CONSTRAINT outbox_events_event_type_check CHECK ((event_type = ANY (ARRAY['org.created'::text, 'user.invited'::text, 'role.assigned'::text, 'audit.recorded'::text, 'brief.created'::text, 'fg.created'::text, 'fg.allergens_changed'::text, 'fg.intermediate_code_changed'::text, 'lp.received'::text, 'wo.ready'::text, 'quality.recorded'::text, 'shipment.created'::text, 'tenant.migration.run'::text, 'tenant.migration.run.failed'::text, 'tenant.cohort.advanced'::text, 'settings.schema.migration_requested'::text, 'settings.rule.deployed'::text, 'rule.deployed'::text, 'settings.location.upserted'::text, 'settings.machine.upserted'::text, 'settings.line.upserted'::text, 'settings.warehouse.deactivated'::text, 'onboarding.step.advance'::text, 'onboarding.step.back'::text, 'onboarding.step.skip'::text, 'onboarding.step.jump'::text, 'onboarding.step.restart'::text, 'onboarding.first_wo_recorded'::text])))
packages/db/__expected__/schema.sql:-- Name: CONSTRAINT outbox_events_event_type_check ON outbox_events; Type: COMMENT; Schema: public; Owner: -
packages/db/__expected__/schema.sql:COMMENT ON CONSTRAINT outbox_events_event_type_check ON public.outbox_events IS 'Adds SET-001..006 onboarding transition events while preserving prior outbox event types.';
packages/db/migrations/023-outbox-events-extension.sql:-- Migration 023 — T-039: extend outbox_events_event_type_check constraint
packages/db/migrations/023-outbox-events-extension.sql:  DROP CONSTRAINT IF EXISTS outbox_events_event_type_check;
packages/db/migrations/023-outbox-events-extension.sql:  ADD CONSTRAINT outbox_events_event_type_check CHECK (
packages/db/migrations/023-outbox-events-extension.sql:COMMENT ON CONSTRAINT outbox_events_event_type_check ON public.outbox_events
packages/db/migrations/003-outbox.sql:  constraint outbox_events_event_type_check check (
packages/db/migrations/003-outbox.sql:    event_type in (
packages/db/migrations/049-onboarding-outbox-grants.sql:  DROP CONSTRAINT IF EXISTS outbox_events_event_type_check;
packages/db/migrations/049-onboarding-outbox-grants.sql:  ADD CONSTRAINT outbox_events_event_type_check CHECK (
packages/db/migrations/049-onboarding-outbox-grants.sql:COMMENT ON CONSTRAINT outbox_events_event_type_check ON public.outbox_events
packages/db/migrations/070-notification-preferences.sql:  drop constraint if exists outbox_events_event_type_check;
packages/db/migrations/070-notification-preferences.sql:  add constraint outbox_events_event_type_check check (
packages/db/migrations/070-notification-preferences.sql:    event_type in (
packages/db/migrations/047-outbox-events-settings-rules.sql:  DROP CONSTRAINT IF EXISTS outbox_events_event_type_check;
packages/db/migrations/047-outbox-events-settings-rules.sql:  ADD CONSTRAINT outbox_events_event_type_check CHECK (
packages/db/migrations/047-outbox-events-settings-rules.sql:COMMENT ON CONSTRAINT outbox_events_event_type_check ON public.outbox_events
packages/db/migrations/003-outbox.sql:  constraint outbox_events_event_type_check check (
packages/db/migrations/003-outbox.sql:    event_type in (
packages/db/migrations/023-outbox-events-extension.sql:-- Migration 023 — T-039: extend outbox_events_event_type_check constraint
packages/db/migrations/023-outbox-events-extension.sql:  DROP CONSTRAINT IF EXISTS outbox_events_event_type_check;
packages/db/migrations/023-outbox-events-extension.sql:  ADD CONSTRAINT outbox_events_event_type_check CHECK (
packages/db/migrations/023-outbox-events-extension.sql:COMMENT ON CONSTRAINT outbox_events_event_type_check ON public.outbox_events
packages/db/schema/baseline.ts:    eventType: text('event_type').notNull(),
packages/db/schema/baseline.ts:    eventType: text('event_type').notNull(),
packages/outbox/src/__tests__/worker.e2e.test.ts:  runWithDb('AC1: given outbox_events exists and a row is inserted with event_type=audit.recorded, when worker.runOnce() executes, then the in-memory queue contains exactly one message and the row\'s consumed_at is set', async () => {
packages/outbox/src/__tests__/worker.e2e.test.ts:  runWithDb('AC2: given event_type is constrained to EventType members, when an insertion uses invalid.event (not in EventType), then the worker rejects publishing and the test fails fast', async () => {

exec
/bin/zsh -lc "nl -ba packages/db/migrations/064-unit-of-measure.sql | sed -n '95,180p'" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 succeeded in 0ms:
    95	create or replace function public.unit_of_measure_set_updated_at()
    96	returns trigger language plpgsql set search_path = pg_catalog, public as $$
    97	begin new.updated_at := pg_catalog.now(); return new; end; $$;
    98	
    99	drop trigger if exists unit_of_measure_set_updated_at on public.unit_of_measure;
   100	create trigger unit_of_measure_set_updated_at
   101	  before update on public.unit_of_measure
   102	  for each row execute function public.unit_of_measure_set_updated_at();
   103	
   104	drop trigger if exists uom_custom_conversions_set_updated_at on public.uom_custom_conversions;
   105	create trigger uom_custom_conversions_set_updated_at
   106	  before update on public.uom_custom_conversions
   107	  for each row execute function public.unit_of_measure_set_updated_at();
   108	
   109	-- ============================================================
   110	-- 4. Reference seed — standard UoM per org (function on org INSERT + backfill; pattern from migration 032).
   111	--    These are legitimate standard reference units (SI + common packaging), not demo mock rows.
   112	-- ============================================================
   113	create or replace function public.seed_units_of_measure_for_org(p_org_id uuid)
   114	returns void
   115	language plpgsql
   116	security definer
   117	set search_path = pg_catalog, public
   118	as $$
   119	begin
   120	  insert into public.unit_of_measure (org_id, category, code, name, factor_to_base, is_base)
   121	  values
   122	    -- mass (base: kg)
   123	    (p_org_id, 'mass', 'kg', 'Kilogram', 1,         true),
   124	    (p_org_id, 'mass', 'g',  'Gram',     0.001,     false),
   125	    (p_org_id, 'mass', 'mg', 'Milligram',0.000001,  false),
   126	    (p_org_id, 'mass', 't',  'Tonne',    1000,      false),
   127	    -- volume (base: L)
   128	    (p_org_id, 'volume', 'L',  'Litre',      1,     true),
   129	    (p_org_id, 'volume', 'mL', 'Millilitre', 0.001, false),
   130	    -- count (base: ea)
   131	    (p_org_id, 'count', 'ea',     'Each',   1,   true),
   132	    (p_org_id, 'count', 'box',    'Box',    1,   false),
   133	    (p_org_id, 'count', 'pallet', 'Pallet', 1,   false)
   134	  on conflict (org_id, code) do nothing;
   135	end;
   136	$$;
   137	
   138	create or replace function public.seed_units_of_measure_on_org_insert()
   139	returns trigger
   140	language plpgsql
   141	security definer
   142	set search_path = pg_catalog, public
   143	as $$
   144	begin
   145	  perform public.seed_units_of_measure_for_org(new.id);
   146	  return new;
   147	end;
   148	$$;
   149	
   150	drop trigger if exists trg_seed_units_of_measure on public.organizations;
   151	create trigger trg_seed_units_of_measure
   152	  after insert on public.organizations
   153	  for each row
   154	  execute function public.seed_units_of_measure_on_org_insert();
   155	
   156	do $$
   157	declare v_org record;
   158	begin
   159	  for v_org in select id from public.organizations loop
   160	    perform public.seed_units_of_measure_for_org(v_org.id);
   161	  end loop;
   162	end
   163	$$;
   164	
   165	-- ============================================================
   166	-- 5. RBAC — settings.units.manage permission for admin roles (lets the page's canEdit gate be true).
   167	--    Mirrors migration 050 dual-write (normalized role_permissions + legacy roles.permissions JSONB).
   168	-- ============================================================
   169	do $$
   170	begin
   171	  if to_regclass('public.role_permissions') is null or to_regclass('public.roles') is null then
   172	    return; -- RBAC tables not present yet; nothing to grant.
   173	  end if;
   174	
   175	  insert into public.role_permissions (role_id, permission)
   176	  select r.id, 'settings.units.manage'::text
   177	    from public.roles r
   178	   where r.code in ('owner', 'admin', 'org_admin')
   179	  on conflict (role_id, permission) do nothing;
   180	

exec
/bin/zsh -lc "nl -ba packages/db/migrations/067-feature-flags-core.sql | sed -n '1,180p'" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 succeeded in 0ms:
     1	-- Migration 067: 02-settings T-013 — feature_flags_core (§10.2 built-in fallback)
     2	-- PRD: docs/prd/02-SETTINGS-PRD.md §10.2 feature_flags_core
     3	-- Wave0: org_id business scope (NOT tenant_id). RLS via app.current_org_id().
     4	--
     5	-- Per-org built-in feature-flag fallback table. PostHog flags are NOT mirrored here (T-013 red line).
     6	-- PK is (org_id, flag_code); rolled_out_pct INT default 0 (per T-013 AC).
     7	-- Seeds the 4 §10.2 core flags (is_enabled=false) PLUS the two authorization flags the /flags screen
     8	-- and V-SET-42/43/44 expect, so the screen renders real Supabase data.
     9	-- notification_preferences (the other T-013 table) already exists from migration 049; this migration
    10	-- only adds feature_flags_core. The combined Drizzle schema lives in packages/db/schema/flags-prefs.ts.
    11	
    12	create table if not exists public.feature_flags_core (
    13	  org_id          uuid        not null references public.organizations(id) on delete cascade,
    14	  flag_code       text        not null,
    15	  description     text        not null default '',
    16	  is_enabled      boolean     not null default false,
    17	  rolled_out_pct  integer     not null default 0,
    18	  tier            text        not null default 'L1',
    19	  created_at      timestamptz not null default pg_catalog.now(),
    20	  updated_at      timestamptz not null default pg_catalog.now(),
    21	  primary key (org_id, flag_code),
    22	  constraint feature_flags_core_rolled_out_pct_check check (rolled_out_pct between 0 and 100),
    23	  constraint feature_flags_core_tier_check check (tier in ('L1', 'L2', 'L3', 'L4'))
    24	);
    25	
    26	create index if not exists feature_flags_core_org_idx
    27	  on public.feature_flags_core (org_id);
    28	
    29	alter table public.feature_flags_core enable row level security;
    30	alter table public.feature_flags_core force row level security;
    31	drop policy if exists feature_flags_core_org_context on public.feature_flags_core;
    32	create policy feature_flags_core_org_context
    33	  on public.feature_flags_core
    34	  for all
    35	  to app_user
    36	  using (org_id = app.current_org_id())
    37	  with check (org_id = app.current_org_id());
    38	revoke all on public.feature_flags_core from public;
    39	grant select, insert, update, delete on public.feature_flags_core to app_user;
    40	
    41	create or replace function public.feature_flags_core_set_updated_at()
    42	returns trigger language plpgsql set search_path = pg_catalog, public as $$
    43	begin new.updated_at := pg_catalog.now(); return new; end; $$;
    44	
    45	drop trigger if exists feature_flags_core_set_updated_at on public.feature_flags_core;
    46	create trigger feature_flags_core_set_updated_at
    47	  before update on public.feature_flags_core
    48	  for each row execute function public.feature_flags_core_set_updated_at();
    49	
    50	comment on table public.feature_flags_core
    51	  is 'T-013: §10.2 built-in feature-flag fallback (per-org). PostHog non-core flags are NOT mirrored here.';
    52	
    53	-- ============================================================
    54	-- Per-org seed — 4 §10.2 core flags + 2 authorization flags for the /flags screen (V-SET-42/43/44).
    55	-- Pattern from migration 032 (function on INSERT + backfill).
    56	-- ============================================================
    57	create or replace function public.seed_feature_flags_core_for_org(p_org_id uuid)
    58	returns void
    59	language plpgsql
    60	security definer
    61	set search_path = pg_catalog, public
    62	as $$
    63	begin
    64	  insert into public.feature_flags_core (org_id, flag_code, description, is_enabled, rolled_out_pct, tier)
    65	  values
    66	    -- §10.2 core flags (is_enabled=false per T-013 AC).
    67	    (p_org_id, 'maintenance_mode',          'Put the org into maintenance mode.',                   false, 0, 'L1'),
    68	    (p_org_id, 'integration.d365.enabled',  'Enable Dynamics 365 integration for this org.',        false, 0, 'L1'),
    69	    (p_org_id, 'scanner.pwa.enabled',       'Enable the warehouse scanner PWA.',                    false, 0, 'L1'),
    70	    (p_org_id, 'npd.d365_builder.execute',  'Allow the NPD D365 builder to execute.',               false, 0, 'L1'),
    71	    -- Authorization flags surfaced by /settings/flags (V-SET-42/43/44 preflight gate).
    72	    (p_org_id, 'npd.post_release_edit.enabled',          'Allow released NPD product/BOM edits after authorization.', false, 0,   'L1'),
    73	    (p_org_id, 'technical.product_spec_approval.required','Require Technical product-spec approval before factory use.', true,  100, 'L1')
    74	  on conflict (org_id, flag_code) do nothing;
    75	end;
    76	$$;
    77	
    78	create or replace function public.seed_feature_flags_core_on_org_insert()
    79	returns trigger
    80	language plpgsql
    81	security definer
    82	set search_path = pg_catalog, public
    83	as $$
    84	begin
    85	  perform public.seed_feature_flags_core_for_org(new.id);
    86	  return new;
    87	end;
    88	$$;
    89	
    90	drop trigger if exists trg_seed_feature_flags_core on public.organizations;
    91	create trigger trg_seed_feature_flags_core
    92	  after insert on public.organizations
    93	  for each row
    94	  execute function public.seed_feature_flags_core_on_org_insert();
    95	
    96	do $$
    97	declare v_org record;
    98	begin
    99	  for v_org in select id from public.organizations loop
   100	    perform public.seed_feature_flags_core_for_org(v_org.id);
   101	  end loop;
   102	end
   103	$$;

exec
/bin/zsh -lc "nl -ba packages/db/migrations/068-login-attempts.sql | sed -n '1,140p'" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 succeeded in 0ms:
     1	-- Migration 068: 02-settings T-011 — login_attempts (§5.7 security tables, S-U5)
     2	-- PRD: docs/prd/02-SETTINGS-PRD.md §5.7, §14.1, S-U5
     3	-- Wave0: org_id business scope (NOT tenant_id). RLS via app.current_org_id().
     4	--
     5	-- §5.7 names three security tables: org_security_policies (migration 017), password_history
     6	-- (migration 018), and login_attempts. The first two already exist, so this migration adds only
     7	-- login_attempts (rate-limit / lockout audit feed). No plaintext password is ever stored here.
     8	--
     9	-- org_id is nullable: a failed attempt for an unknown email cannot always be resolved to an org,
    10	-- and lockout counting must still record it. RLS therefore admits NULL-org rows only to nobody via
    11	-- app_user (org_id = current_org_id() never matches NULL); the auth flow reads/writes these rows via
    12	-- the owner/service connection (rate-limit middleware), consistent with login being pre-org-context.
    13	
    14	create table if not exists public.login_attempts (
    15	  id           uuid        primary key default gen_random_uuid(),
    16	  org_id       uuid        references public.organizations(id) on delete cascade,
    17	  user_id      uuid        references public.users(id) on delete set null,
    18	  email        text        not null,
    19	  ip_address   inet,
    20	  user_agent   text,
    21	  success      boolean     not null default false,
    22	  failure_reason text,
    23	  attempted_at timestamptz not null default pg_catalog.now()
    24	);
    25	
    26	-- Lockout lookups: recent failures by email / by ip within a window.
    27	create index if not exists login_attempts_email_attempted_idx
    28	  on public.login_attempts (lower(email), attempted_at desc);
    29	create index if not exists login_attempts_ip_attempted_idx
    30	  on public.login_attempts (ip_address, attempted_at desc);
    31	create index if not exists login_attempts_org_attempted_idx
    32	  on public.login_attempts (org_id, attempted_at desc);
    33	
    34	alter table public.login_attempts enable row level security;
    35	alter table public.login_attempts force row level security;
    36	drop policy if exists login_attempts_org_context on public.login_attempts;
    37	create policy login_attempts_org_context
    38	  on public.login_attempts
    39	  for all
    40	  to app_user
    41	  using (org_id = app.current_org_id())
    42	  with check (org_id = app.current_org_id());
    43	revoke all on public.login_attempts from public;
    44	grant select, insert, update, delete on public.login_attempts to app_user;
    45	
    46	comment on table public.login_attempts
    47	  is 'T-011: §5.7 login attempt audit feed for lockout / rate-limit. Never stores plaintext passwords.';

exec
/bin/zsh -lc "nl -ba packages/db/migrations/069-modules-description.sql | sed -n '1,120p'" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 succeeded in 0ms:
     1	-- 069 — Settings module catalog descriptions + organization_modules.updated_at.
     2	--
     3	-- T-072 (/settings/features) and T-103 (/settings/modules) read REAL module
     4	-- catalog data. The audit found descriptions were sourced from a hardcoded
     5	-- MODULE_DESCRIPTIONS map in the page; per the no-hardcode mandate the copy
     6	-- must live in the catalog. This migration adds:
     7	--
     8	--   1. public.modules.description (the per-module human-readable summary the
     9	--      Features/Modules screens render under each toggle), seeded for the
    10	--      T-092 §10.1 module baseline.
    11	--   2. public.organization_modules.updated_at — the T-019 toggleModule action
    12	--      (apps/web/actions/modules/toggle.ts) already writes `updated_at = now()`
    13	--      on every toggle, but the column was never created, so a real toggle
    14	--      raised undefined_column → persistence_failed. Added idempotently here so
    15	--      the wired action persists instead of forking it.
    16	--
    17	-- Additive + idempotent: safe to re-run.
    18	
    19	alter table public.modules
    20	  add column if not exists description text;
    21	
    22	update public.modules m
    23	set description = v.description
    24	from (values
    25	  ('00-foundation',     'Authentication, RBAC, tenancy, audit, outbox, and observability.'),
    26	  ('01-npd',            'Product development, specifications, and allergen workflow.'),
    27	  ('02-settings',       'Reference data, policies, permissions, and workspace configuration.'),
    28	  ('03-technical',      'Products, BOMs, routings, equipment, items, and standard costs.'),
    29	  ('04-planning-basic', 'Suppliers, purchase orders, work order baseline, and MRP.'),
    30	  ('05-warehouse',      'License plates, GRN, transfers, and stock movements.'),
    31	  ('06-scanner-p1',     'Mobile scanner workflows, operators, and offline sync.'),
    32	  ('07-planning-ext',   'Extended planning, scheduler outputs, and dependency planning.'),
    33	  ('08-production',     'Work order execution, outputs, waste, and downtime.'),
    34	  ('09-quality',        'Specifications, holds, NCR, HACCP, and allergen gates.'),
    35	  ('10-finance',        'Standard costs, actual costing, FIFO/WAC variance, and D365 export.'),
    36	  ('11-shipping',       'Sales orders, allocation, pick/pack, BOL, POD, and carriers.'),
    37	  ('12-reporting',      'KPIs, dashboards, exports, and reporting consumers.'),
    38	  ('13-maintenance',    'Assets, PM schedules, maintenance work orders, LOTO, and calibration.'),
    39	  ('14-multi-site',     'Site context, inter-site transfers, lanes, and master-data sync.'),
    40	  ('15-oee',            'Availability, performance, quality, and read-only snapshots.')
    41	) as v(code, description)
    42	where m.code = v.code
    43	  and (m.description is null or m.description = '');
    44	
    45	alter table public.organization_modules
    46	  add column if not exists updated_at timestamptz default now();
    47	
    48	update public.organization_modules
    49	set updated_at = coalesce(updated_at, now());

exec
/bin/zsh -lc "rg -n \"create table.*(modules|organization_modules)|organization_modules|public.modules|enable row level security|force row level security|grant .*organization_modules|revoke .*organization_modules|grant .*modules|revoke .*modules\" packages/db/migrations -g '*.sql'" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 succeeded in 0ms:
packages/db/migrations/015-idempotency.sql:23:alter table public.idempotency_keys enable row level security;
packages/db/migrations/015-idempotency.sql:24:alter table public.idempotency_keys force row level security;
packages/db/migrations/003-outbox.sql:39:alter table public.outbox_events enable row level security;
packages/db/migrations/003-outbox.sql:40:alter table public.outbox_events force row level security;
packages/db/migrations/069-modules-description.sql:1:-- 069 — Settings module catalog descriptions + organization_modules.updated_at.
packages/db/migrations/069-modules-description.sql:8:--   1. public.modules.description (the per-module human-readable summary the
packages/db/migrations/069-modules-description.sql:11:--   2. public.organization_modules.updated_at — the T-019 toggleModule action
packages/db/migrations/069-modules-description.sql:19:alter table public.modules
packages/db/migrations/069-modules-description.sql:22:update public.modules m
packages/db/migrations/069-modules-description.sql:45:alter table public.organization_modules
packages/db/migrations/069-modules-description.sql:48:update public.organization_modules
packages/db/migrations/070-notification-preferences.sql:23:alter table public.notification_preferences enable row level security;
packages/db/migrations/070-notification-preferences.sql:24:alter table public.notification_preferences force row level security;
packages/db/migrations/019-pins.sql:16:alter table public.user_pins enable row level security;
packages/db/migrations/019-pins.sql:17:alter table public.user_pins force row level security;
packages/db/migrations/014-r13-placeholder-tables.sql:23:alter table public.lot enable row level security;
packages/db/migrations/014-r13-placeholder-tables.sql:24:alter table public.lot force row level security;
packages/db/migrations/014-r13-placeholder-tables.sql:52:alter table public.work_order enable row level security;
packages/db/migrations/014-r13-placeholder-tables.sql:53:alter table public.work_order force row level security;
packages/db/migrations/014-r13-placeholder-tables.sql:81:alter table public.quality_event enable row level security;
packages/db/migrations/014-r13-placeholder-tables.sql:82:alter table public.quality_event force row level security;
packages/db/migrations/014-r13-placeholder-tables.sql:110:alter table public.shipment enable row level security;
packages/db/migrations/014-r13-placeholder-tables.sql:111:alter table public.shipment force row level security;
packages/db/migrations/014-r13-placeholder-tables.sql:139:alter table public.bom_item enable row level security;
packages/db/migrations/014-r13-placeholder-tables.sql:140:alter table public.bom_item force row level security;
packages/db/migrations/011-departments.sql:44:alter table "Reference"."Departments" enable row level security;
packages/db/migrations/011-departments.sql:45:alter table "Reference"."Departments" force row level security;
packages/db/migrations/065-d365-sync-runs.sql:36:alter table public.d365_sync_runs enable row level security;
packages/db/migrations/065-d365-sync-runs.sql:37:alter table public.d365_sync_runs force row level security;
packages/db/migrations/066-email-delivery-log.sql:42:alter table public.email_delivery_log enable row level security;
packages/db/migrations/066-email-delivery-log.sql:43:alter table public.email_delivery_log force row level security;
packages/db/migrations/039-rule-registry.sql:25:alter table public.rule_definitions enable row level security;
packages/db/migrations/039-rule-registry.sql:26:alter table public.rule_definitions force row level security;
packages/db/migrations/039-rule-registry.sql:67:alter table public.rule_dry_runs enable row level security;
packages/db/migrations/039-rule-registry.sql:68:alter table public.rule_dry_runs force row level security;
packages/db/migrations/042-infra-master.sql:22:alter table public.warehouses enable row level security;
packages/db/migrations/042-infra-master.sql:23:alter table public.warehouses force row level security;
packages/db/migrations/042-infra-master.sql:76:alter table public.locations enable row level security;
packages/db/migrations/042-infra-master.sql:77:alter table public.locations force row level security;
packages/db/migrations/042-infra-master.sql:119:alter table public.machines enable row level security;
packages/db/migrations/042-infra-master.sql:120:alter table public.machines force row level security;
packages/db/migrations/042-infra-master.sql:159:alter table public.production_lines enable row level security;
packages/db/migrations/042-infra-master.sql:160:alter table public.production_lines force row level security;
packages/db/migrations/042-infra-master.sql:230:alter table public.tax_codes enable row level security;
packages/db/migrations/042-infra-master.sql:231:alter table public.tax_codes force row level security;
packages/db/migrations/061-org-scoped-sequences.sql:19:alter table public.org_sequences enable row level security;
packages/db/migrations/061-org-scoped-sequences.sql:20:alter table public.org_sequences force row level security;
packages/db/migrations/012-manufacturing-ops.sql:55:alter table "Reference"."ManufacturingOperations" enable row level security;
packages/db/migrations/012-manufacturing-ops.sql:56:alter table "Reference"."ManufacturingOperations" force row level security;
packages/db/migrations/043-audit-log-partitioning.sql:35:alter table public.audit_log enable row level security;
packages/db/migrations/043-audit-log-partitioning.sql:36:alter table public.audit_log force row level security;
packages/db/migrations/037-settings-core.sql:287:create table if not exists public.modules (
packages/db/migrations/037-settings-core.sql:296:alter table public.modules
packages/db/migrations/037-settings-core.sql:303:update public.modules
packages/db/migrations/037-settings-core.sql:309:alter table public.modules
packages/db/migrations/037-settings-core.sql:316:create table if not exists public.organization_modules (
packages/db/migrations/037-settings-core.sql:318:  module_code text not null references public.modules(code),
packages/db/migrations/037-settings-core.sql:325:alter table public.organization_modules
packages/db/migrations/037-settings-core.sql:330:update public.organization_modules
packages/db/migrations/037-settings-core.sql:333:alter table public.organization_modules
packages/db/migrations/037-settings-core.sql:337:create index if not exists organization_modules_org_id_idx on public.organization_modules (org_id);
packages/db/migrations/037-settings-core.sql:339:alter table public.organizations enable row level security;
packages/db/migrations/037-settings-core.sql:340:alter table public.users enable row level security;
packages/db/migrations/037-settings-core.sql:341:alter table public.roles enable row level security;
packages/db/migrations/037-settings-core.sql:342:alter table public.organization_modules enable row level security;
packages/db/migrations/037-settings-core.sql:344:alter table public.organizations force row level security;
packages/db/migrations/037-settings-core.sql:345:alter table public.users force row level security;
packages/db/migrations/037-settings-core.sql:346:alter table public.roles force row level security;
packages/db/migrations/037-settings-core.sql:347:alter table public.organization_modules force row level security;
packages/db/migrations/037-settings-core.sql:373:drop policy if exists organization_modules_org_context on public.organization_modules;
packages/db/migrations/037-settings-core.sql:374:create policy organization_modules_org_context
packages/db/migrations/037-settings-core.sql:375:  on public.organization_modules
packages/db/migrations/037-settings-core.sql:384:revoke all on public.modules from public;
packages/db/migrations/037-settings-core.sql:385:revoke all on public.organization_modules from public;
packages/db/migrations/037-settings-core.sql:391:grant select on public.modules to app_user;
packages/db/migrations/037-settings-core.sql:392:grant select, insert, update, delete on public.organization_modules to app_user;
packages/db/migrations/057-gdpr-erasure-requests.sql:27:alter table public.gdpr_erasure_requests enable row level security;
packages/db/migrations/057-gdpr-erasure-requests.sql:28:alter table public.gdpr_erasure_requests force row level security;
packages/db/migrations/038-schema-metadata.sql:30:alter table public.reference_schemas enable row level security;
packages/db/migrations/038-schema-metadata.sql:31:alter table public.reference_schemas force row level security;
packages/db/migrations/038-schema-metadata.sql:176:alter table public.schema_migrations enable row level security;
packages/db/migrations/045-reference-csv-import-reports.sql:21:alter table public.reference_csv_import_reports enable row level security;
packages/db/migrations/045-reference-csv-import-reports.sql:22:alter table public.reference_csv_import_reports force row level security;
packages/db/migrations/068-login-attempts.sql:34:alter table public.login_attempts enable row level security;
packages/db/migrations/068-login-attempts.sql:35:alter table public.login_attempts force row level security;
packages/db/migrations/009-schema-driven.sql:188:alter table "Reference"."FieldTypes" enable row level security;
packages/db/migrations/009-schema-driven.sql:189:alter table "Reference"."DeptColumns" enable row level security;
packages/db/migrations/009-schema-driven.sql:190:alter table "Reference"."Formulas"    enable row level security;
packages/db/migrations/009-schema-driven.sql:192:alter table "Reference"."FieldTypes" force row level security;
packages/db/migrations/009-schema-driven.sql:193:alter table "Reference"."DeptColumns" force row level security;
packages/db/migrations/009-schema-driven.sql:194:alter table "Reference"."Formulas"    force row level security;
packages/db/migrations/067-feature-flags-core.sql:29:alter table public.feature_flags_core enable row level security;
packages/db/migrations/067-feature-flags-core.sql:30:alter table public.feature_flags_core force row level security;
packages/db/migrations/027-tenant-idp-config-rls.sql:33:alter table public.tenant_idp_config enable row level security;
packages/db/migrations/027-tenant-idp-config-rls.sql:34:alter table public.tenant_idp_config force row level security;
packages/db/migrations/044-settings-security-scim-ipallowlist.sql:21:alter table public.scim_tokens enable row level security;
packages/db/migrations/044-settings-security-scim-ipallowlist.sql:22:alter table public.scim_tokens force row level security;
packages/db/migrations/044-settings-security-scim-ipallowlist.sql:47:alter table public.admin_ip_allowlist enable row level security;
packages/db/migrations/044-settings-security-scim-ipallowlist.sql:48:alter table public.admin_ip_allowlist force row level security;
packages/db/migrations/010-rules.sql:99:alter table "Reference"."Rules" enable row level security;
packages/db/migrations/010-rules.sql:100:alter table "Reference"."Rules" force row level security;
packages/db/migrations/051-rls-public-exposure-remediation.sql:9:    alter table public.tenant_variations enable row level security;
packages/db/migrations/051-rls-public-exposure-remediation.sql:10:    alter table public.tenant_variations force row level security;
packages/db/migrations/051-rls-public-exposure-remediation.sql:29:    alter table public.consumed_approval_tokens enable row level security;
packages/db/migrations/051-rls-public-exposure-remediation.sql:30:    alter table public.consumed_approval_tokens force row level security;
packages/db/migrations/051-rls-public-exposure-remediation.sql:49:    alter table public.tenant_migrations enable row level security;
packages/db/migrations/051-rls-public-exposure-remediation.sql:50:    alter table public.tenant_migrations force row level security;
packages/db/migrations/051-rls-public-exposure-remediation.sql:70:  if to_regclass('public.modules') is not null then
packages/db/migrations/051-rls-public-exposure-remediation.sql:71:    alter table public.modules enable row level security;
packages/db/migrations/051-rls-public-exposure-remediation.sql:72:    alter table public.modules force row level security;
packages/db/migrations/051-rls-public-exposure-remediation.sql:74:    drop policy if exists modules_app_user_read on public.modules;
packages/db/migrations/051-rls-public-exposure-remediation.sql:76:      on public.modules
packages/db/migrations/051-rls-public-exposure-remediation.sql:81:    revoke select on public.modules from public, anon, authenticated;
packages/db/migrations/051-rls-public-exposure-remediation.sql:82:    grant select on public.modules to app_user;
packages/db/migrations/051-rls-public-exposure-remediation.sql:90:    alter table public.allergens enable row level security;
packages/db/migrations/051-rls-public-exposure-remediation.sql:91:    alter table public.allergens force row level security;
packages/db/migrations/051-rls-public-exposure-remediation.sql:109:    alter table public.line_machines enable row level security;
packages/db/migrations/051-rls-public-exposure-remediation.sql:110:    alter table public.line_machines force row level security;
packages/db/migrations/051-rls-public-exposure-remediation.sql:129:    alter table public.role_categories enable row level security;
packages/db/migrations/051-rls-public-exposure-remediation.sql:130:    alter table public.role_categories force row level security;
packages/db/migrations/051-rls-public-exposure-remediation.sql:149:    alter table public.tenant_migrations_legacy_t038 enable row level security;
packages/db/migrations/051-rls-public-exposure-remediation.sql:150:    alter table public.tenant_migrations_legacy_t038 force row level security;
packages/db/migrations/051-rls-public-exposure-remediation.sql:156:alter table if exists public.audit_log enable row level security;
packages/db/migrations/051-rls-public-exposure-remediation.sql:157:alter table if exists public.audit_log force row level security;
packages/db/migrations/051-rls-public-exposure-remediation.sql:180:      execute format('alter table public.%I enable row level security', partition_name);
packages/db/migrations/051-rls-public-exposure-remediation.sql:181:      execute format('alter table public.%I force row level security', partition_name);
packages/db/migrations/051-rls-public-exposure-remediation.sql:192:    alter table public.tenants enable row level security;
packages/db/migrations/051-rls-public-exposure-remediation.sql:193:    alter table public.tenants force row level security;
packages/db/migrations/051-rls-public-exposure-remediation.sql:223:    alter table public.tenant_idp_config enable row level security;
packages/db/migrations/051-rls-public-exposure-remediation.sql:224:    alter table public.tenant_idp_config force row level security;
packages/db/migrations/004-audit.sql:95:alter table public.audit_events enable row level security;
packages/db/migrations/004-audit.sql:96:alter table public.audit_events force row level security;
packages/db/migrations/041-reference-tables.sql:22:alter table public.reference_tables enable row level security;
packages/db/migrations/041-reference-tables.sql:23:alter table public.reference_tables force row level security;
packages/db/migrations/002-rls-baseline.sql:78:alter table public.organizations enable row level security;
packages/db/migrations/002-rls-baseline.sql:79:alter table public.users enable row level security;
packages/db/migrations/002-rls-baseline.sql:81:alter table public.organizations force row level security;
packages/db/migrations/002-rls-baseline.sql:82:alter table public.users force row level security;
packages/db/migrations/053-scim-groups.sql:28:alter table public.scim_groups enable row level security;
packages/db/migrations/053-scim-groups.sql:29:alter table public.scim_groups force row level security;
packages/db/migrations/053-scim-groups.sql:60:alter table public.scim_group_members enable row level security;
packages/db/migrations/053-scim-groups.sql:61:alter table public.scim_group_members force row level security;
packages/db/migrations/018-password-history.sql:17:alter table public.password_history enable row level security;
packages/db/migrations/018-password-history.sql:18:alter table public.password_history force row level security;
packages/db/migrations/022-dept-column-drafts.sql:70:alter table public.dept_column_drafts enable row level security;
packages/db/migrations/022-dept-column-drafts.sql:71:alter table public.dept_column_drafts force row level security;
packages/db/migrations/022-dept-column-drafts.sql:73:alter table public.dept_column_migrations enable row level security;
packages/db/migrations/022-dept-column-drafts.sql:74:alter table public.dept_column_migrations force row level security;
packages/db/migrations/063-org-authorization-policies.sql:61:alter table public.org_authorization_policies enable row level security;
packages/db/migrations/063-org-authorization-policies.sql:62:alter table public.org_authorization_policies force row level security;
packages/db/migrations/064-unit-of-measure.sql:40:alter table public.unit_of_measure enable row level security;
packages/db/migrations/064-unit-of-measure.sql:41:alter table public.unit_of_measure force row level security;
packages/db/migrations/064-unit-of-measure.sql:77:alter table public.uom_custom_conversions enable row level security;
packages/db/migrations/064-unit-of-measure.sql:78:alter table public.uom_custom_conversions force row level security;

exec
/bin/zsh -lc "sed -n '1,150p' packages/db/migrations/049-onboarding-outbox-grants.sql" in /Users/mariuszkrawczyk/Projects/monopilot-kira
exec
/bin/zsh -lc "sed -n '1,140p' packages/db/migrations/047-outbox-events-settings-rules.sql" in /Users/mariuszkrawczyk/Projects/monopilot-kira
exec
/bin/zsh -lc "sed -n '1,120p' packages/db/migrations/003-outbox.sql" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 succeeded in 0ms:
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

 succeeded in 0ms:
-- Migration 045 — Wave 4 Settings + Rules outbox event types
-- Adds three event types required by the Settings Server Actions and the
-- rules CI deploy script:
--   - settings.schema.migration_requested  (T-023 V-SET-03 L1 promotion queue)
--   - settings.rule.deployed               (T-026 rules-deploy CLI audit emit)
--   - rule.deployed                        (T-026 rules-deploy CLI canonical name)
--
-- These are listed in §6.7 / §7.3 of docs/prd/02-SETTINGS-PRD.md and need to be
-- accepted by the outbox CHECK so the transactional emit does not 23514.
-- Existing event types from 003-outbox.sql + 023-outbox-events-extension.sql
-- are preserved verbatim.

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
      -- 3 from T-039 (023-outbox-events-extension.sql)
      'tenant.migration.run',
      'tenant.migration.run.failed',
      'tenant.cohort.advanced',
      -- 3 new (Wave 4 settings + rules)
      'settings.schema.migration_requested',
      'settings.rule.deployed',
      'rule.deployed',
      -- T-029 infrastructure CRUD Server Action events
      'settings.location.upserted',
      'settings.machine.upserted',
      'settings.line.upserted',
      'settings.warehouse.deactivated'
    )
  );

COMMENT ON CONSTRAINT outbox_events_event_type_check ON public.outbox_events
  IS 'Wave4: adds settings schema/rule events plus T-029 infrastructure CRUD mutation events.';

 succeeded in 0ms:
-- Migration 049: onboarding Server Action outbox events + app_user grants
-- Context: SET-001..006 onboarding actions emit onboarding.step.* and
-- onboarding.first_wo_recorded through public.outbox_events inside the
-- app_user RLS transaction. Earlier outbox migrations created the table and
-- policy but did not grant table/sequence privileges to app_user or include
-- onboarding event types in the CHECK constraint, causing fail-closed
-- persistence during Preview runtime smoke.

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
      -- 3 from T-039 (023-outbox-events-extension.sql)
      'tenant.migration.run',
      'tenant.migration.run.failed',
      'tenant.cohort.advanced',
      -- Wave 4 settings + rules (047-outbox-events-settings-rules.sql)
      'settings.schema.migration_requested',
      'settings.rule.deployed',
      'rule.deployed',
      'settings.location.upserted',
      'settings.machine.upserted',
      'settings.line.upserted',
      'settings.warehouse.deactivated',
      -- SET-001..006 onboarding Server Actions (apps/web/actions/onboarding/advance.ts)
      'onboarding.step.advance',
      'onboarding.step.back',
      'onboarding.step.skip',
      'onboarding.step.jump',
      'onboarding.step.restart',
      'onboarding.first_wo_recorded'
    )
  );

COMMENT ON CONSTRAINT outbox_events_event_type_check ON public.outbox_events
  IS 'Adds SET-001..006 onboarding transition events while preserving prior outbox event types.';

REVOKE ALL ON public.outbox_events FROM PUBLIC;
GRANT SELECT, INSERT ON public.outbox_events TO app_user;
GRANT USAGE, SELECT ON SEQUENCE public.outbox_events_id_seq TO app_user;

-- The onboarding Server Actions call mutateOnboarding(), which authorizes via
-- settings.onboarding.complete. Keep both RBAC storage variants in sync because
-- older Wave tasks read roles.permissions JSONB while newer tasks normalize
-- through role_permissions.
INSERT INTO public.role_permissions (role_id, permission)
SELECT r.id, 'settings.onboarding.complete'
FROM public.roles r
WHERE r.code IN ('org.access.admin', 'org.platform.admin')
   OR r.slug IN ('org.access.admin', 'org.platform.admin')
ON CONFLICT DO NOTHING;

UPDATE public.roles r
SET permissions = CASE
  WHEN coalesce(r.permissions, '[]'::jsonb) ? 'settings.onboarding.complete'
    THEN coalesce(r.permissions, '[]'::jsonb)
  ELSE coalesce(r.permissions, '[]'::jsonb) || to_jsonb('settings.onboarding.complete'::text)
END
WHERE r.code IN ('org.access.admin', 'org.platform.admin')
   OR r.slug IN ('org.access.admin', 'org.platform.admin');

exec
/bin/zsh -lc "sed -n '1,140p' packages/db/migrations/023-outbox-events-extension.sql" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 succeeded in 0ms:
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

codex
The outbox check in 070 preserves earlier SQL-listed events and adds three notification events, but I’m checking the TypeScript enum and Server Actions to see whether those three names match all emitted settings notification event types.
exec
/bin/zsh -lc "sed -n '1,220p' packages/outbox/src/events.enum.ts" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 succeeded in 0ms:
export enum EventType {
  ORG_CREATED = 'org.created',
  USER_INVITED = 'user.invited',
  ROLE_ASSIGNED = 'role.assigned',
  AUDIT_RECORDED = 'audit.recorded',
  BRIEF_CREATED = 'brief.created',
  FG_CREATED = 'fg.created',
  FG_ALLERGENS_CHANGED = 'fg.allergens_changed',
  FG_INTERMEDIATE_CODE_CHANGED = 'fg.intermediate_code_changed',
  LP_RECEIVED = 'lp.received',
  WO_READY = 'wo.ready',
  QUALITY_RECORDED = 'quality.recorded',
  SHIPMENT_CREATED = 'shipment.created',
  // T-039 — canary upgrade orchestration
  TENANT_MIGRATION_RUN = 'tenant.migration.run',
  TENANT_MIGRATION_RUN_FAILED = 'tenant.migration.run.failed',
  TENANT_COHORT_ADVANCED = 'tenant.cohort.advanced',

  // T-003 — settings outbox events
  SETTINGS_ORG_CREATED = 'settings.org.created',
  SETTINGS_ORG_UPDATED = 'settings.org.updated',
  SETTINGS_USER_INVITED = 'settings.user.invited',
  SETTINGS_USER_ACCEPTED = 'settings.user.accepted',
  SETTINGS_USER_DEACTIVATED = 'settings.user.deactivated',
  SETTINGS_ROLE_ASSIGNED = 'settings.role.assigned',
  SETTINGS_MODULE_TOGGLED = 'settings.module.toggled',
  SETTINGS_REFERENCE_ROW_UPDATED = 'settings.reference.row_updated',
  SETTINGS_SCHEMA_MIGRATION_REQUESTED = 'settings.schema.migration_requested',
  SETTINGS_RULE_DEPLOYED = 'settings.rule.deployed',
  SETTINGS_NOTIFICATION_RULE_UPDATED = 'settings.notification_rule_updated',
  SETTINGS_NOTIFICATION_CHANNEL_UPDATED = 'settings.notification_channel_updated',
  SETTINGS_NOTIFICATION_DIGEST_UPDATED = 'settings.notification_digest_updated',
  SETTINGS_SSO_CONFIG_CHANGED = 'settings.sso.config_changed',
  SETTINGS_SCIM_TOKEN_CREATED = 'settings.scim.token_created',
}

export const ALL_SETTINGS_EVENTS = [
  EventType.SETTINGS_ORG_CREATED,
  EventType.SETTINGS_ORG_UPDATED,
  EventType.SETTINGS_USER_INVITED,
  EventType.SETTINGS_USER_ACCEPTED,
  EventType.SETTINGS_USER_DEACTIVATED,
  EventType.SETTINGS_ROLE_ASSIGNED,
  EventType.SETTINGS_MODULE_TOGGLED,
  EventType.SETTINGS_REFERENCE_ROW_UPDATED,
  EventType.SETTINGS_SCHEMA_MIGRATION_REQUESTED,
  EventType.SETTINGS_RULE_DEPLOYED,
  EventType.SETTINGS_NOTIFICATION_RULE_UPDATED,
  EventType.SETTINGS_NOTIFICATION_CHANNEL_UPDATED,
  EventType.SETTINGS_NOTIFICATION_DIGEST_UPDATED,
  EventType.SETTINGS_SSO_CONFIG_CHANGED,
  EventType.SETTINGS_SCIM_TOKEN_CREATED,
] as const;

export const LegacyEventAlias = {
  'fa.created': EventType.FG_CREATED,
  'fa.allergens_changed': EventType.FG_ALLERGENS_CHANGED,
  'fa.intermediate_code_changed': EventType.FG_INTERMEDIATE_CODE_CHANGED,
} as const;

export const ALL_EVENTS = Object.values(EventType) as readonly EventType[];

export const ALL_EVENT_ALIASES = LegacyEventAlias;

const canonicalEvents = new Set<string>(ALL_EVENTS);

export function normalizeEventType(input: string): EventType {
  if (canonicalEvents.has(input)) {
    return input as EventType;
  }

  if (input in LegacyEventAlias) {
    return LegacyEventAlias[input as keyof typeof LegacyEventAlias];
  }

  throw new Error(`Unknown event type: ${input}`);
}

exec
/bin/zsh -lc "rg -n \"notification_preferences|feature_flags_core|login_attempts|org_authorization_policies|unit_of_measure|d365_sync_runs|email_delivery_log\" packages/db/schema apps packages -g '*.ts' -g '*.tsx'" in /Users/mariuszkrawczyk/Projects/monopilot-kira
exec
/bin/zsh -lc "rg -n \"settings\\.notification|notification_.*updated|eventType|event_type\" apps packages -g '*.ts' -g '*.tsx'" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 succeeded in 0ms:
packages/db/schema/email-log.ts:6:// T-113 — email_delivery_log (migration 066). Email Delivery Log (SET-093).
packages/db/schema/email-log.ts:9:  'email_delivery_log',
packages/db/schema/email-log.ts:28:    orgIdx: index('email_delivery_log_org_idx').on(table.orgId),
packages/db/schema/email-log.ts:29:    orgCreatedIdx: index('email_delivery_log_org_created_idx').on(table.orgId, table.createdAt),
packages/db/schema/email-log.ts:30:    orgTriggerIdx: index('email_delivery_log_org_trigger_idx').on(table.orgId, table.triggerCode),
packages/db/schema/email-log.ts:32:      'email_delivery_log_status_check',
packages/db/schema/email-log.ts:36:      'email_delivery_log_retry_status_check',
packages/db/schema/email-log.ts:39:    retryCountCheck: check('email_delivery_log_retry_count_check', sql`retry_count >= 0`),
packages/db/schema/settings-auth-policies.ts:6:// T-122 — org_authorization_policies (migration 063).
packages/db/schema/settings-auth-policies.ts:10:  'org_authorization_policies',
packages/db/schema/settings-auth-policies.ts:32:    orgCodeUnique: unique('org_authorization_policies_org_code_unique').on(table.orgId, table.policyCode),
packages/db/schema/settings-auth-policies.ts:33:    orgIdx: index('org_authorization_policies_org_idx').on(table.orgId),
packages/db/schema/settings-auth-policies.ts:34:    orgCodeIdx: index('org_authorization_policies_org_code_idx').on(table.orgId, table.policyCode),
packages/db/schema/settings-auth-policies.ts:36:      'org_authorization_policies_code_check',
packages/db/schema/settings-auth-policies.ts:39:    minApproversCheck: check('org_authorization_policies_min_approvers_check', sql`min_approvers >= 1`),
packages/db/schema/settings-auth-policies.ts:40:    versionCheck: check('org_authorization_policies_version_check', sql`version >= 1`),
packages/db/schema/settings-auth-policies.ts:42:      'org_authorization_policies_npd_requires_new_version_check',
packages/db/schema/security.ts:5:// T-011 — §5.7 security tables. login_attempts (migration 068) is the new table this task adds;
packages/db/schema/security.ts:11:  'login_attempts',
packages/db/schema/security.ts:24:    ipAttemptedIdx: index('login_attempts_ip_attempted_idx').on(table.ipAddress, table.attemptedAt),
packages/db/schema/security.ts:25:    orgAttemptedIdx: index('login_attempts_org_attempted_idx').on(table.orgId, table.attemptedAt),
packages/db/schema/integrations-d365.ts:6:// T-112 — d365_sync_runs (migration 065). D365 Sync Audit (SET-083).
packages/db/schema/integrations-d365.ts:9:  'd365_sync_runs',
packages/db/schema/integrations-d365.ts:28:    orgIdx: index('d365_sync_runs_org_idx').on(table.orgId),
packages/db/schema/integrations-d365.ts:29:    orgStartedIdx: index('d365_sync_runs_org_started_idx').on(table.orgId, table.startedAt),
packages/db/schema/integrations-d365.ts:30:    directionCheck: check('d365_sync_runs_direction_check', sql`direction in ('pull', 'push')`),
packages/db/schema/integrations-d365.ts:31:    statusCheck: check('d365_sync_runs_status_check', sql`status in ('ok', 'partial', 'failed')`),
packages/db/schema/integrations-d365.ts:33:      'd365_sync_runs_row_counts_check',
packages/db/schema/flags-prefs.ts:6:// T-013 — feature_flags_core (§10.2, migration 067) + notification_preferences (§13.3, migration 049).
packages/db/schema/flags-prefs.ts:7:// PostHog non-core flags are NOT mirrored into feature_flags_core (T-013 red line).
packages/db/schema/flags-prefs.ts:9:  'feature_flags_core',
packages/db/schema/flags-prefs.ts:24:    orgIdx: index('feature_flags_core_org_idx').on(table.orgId),
packages/db/schema/flags-prefs.ts:26:      'feature_flags_core_rolled_out_pct_check',
packages/db/schema/flags-prefs.ts:29:    tierCheck: check('feature_flags_core_tier_check', sql`tier in ('L1', 'L2', 'L3', 'L4')`),
packages/db/schema/flags-prefs.ts:35:  'notification_preferences',
packages/db/schema/flags-prefs.ts:52:    orgEventIdx: index('notification_preferences_org_event_idx').on(table.orgId, table.category, table.event),
packages/db/schema/flags-prefs.ts:54:      'notification_preferences_category_event_nonempty',
packages/db/schema/units.ts:6:// T-073 — unit_of_measure + uom_custom_conversions (migration 064).
packages/db/schema/units.ts:9:  'unit_of_measure',
packages/db/schema/units.ts:25:    orgCodeUnique: unique('unit_of_measure_org_code_unique').on(table.orgId, table.code),
packages/db/schema/units.ts:26:    orgIdx: index('unit_of_measure_org_idx').on(table.orgId),
packages/db/schema/units.ts:27:    orgCategoryIdx: index('unit_of_measure_org_category_idx').on(table.orgId, table.category, table.isBase),
packages/db/schema/units.ts:28:    categoryCheck: check('unit_of_measure_category_check', sql`category in ('mass', 'volume', 'count')`),
packages/db/schema/units.ts:29:    factorPositive: check('unit_of_measure_factor_positive', sql`factor_to_base > 0`),
packages/db/__tests__/settings-schema-foundation.test.ts:4: * Covers T-122 (org_authorization_policies), T-073 (unit_of_measure + uom_custom_conversions),
packages/db/__tests__/settings-schema-foundation.test.ts:5: * T-112 (d365_sync_runs), T-113 (email_delivery_log), T-013 (feature_flags_core), T-011 (login_attempts).
packages/db/__tests__/settings-schema-foundation.test.ts:29:  'org_authorization_policies',
packages/db/__tests__/settings-schema-foundation.test.ts:30:  'unit_of_measure',
packages/db/__tests__/settings-schema-foundation.test.ts:32:  'd365_sync_runs',
packages/db/__tests__/settings-schema-foundation.test.ts:33:  'email_delivery_log',
packages/db/__tests__/settings-schema-foundation.test.ts:34:  'feature_flags_core',
packages/db/__tests__/settings-schema-foundation.test.ts:35:  'login_attempts',
packages/db/__tests__/settings-schema-foundation.test.ts:39:  org_authorization_policies: '063-org-authorization-policies.sql',
packages/db/__tests__/settings-schema-foundation.test.ts:40:  unit_of_measure: '064-unit-of-measure.sql',
packages/db/__tests__/settings-schema-foundation.test.ts:42:  d365_sync_runs: '065-d365-sync-runs.sql',
packages/db/__tests__/settings-schema-foundation.test.ts:43:  email_delivery_log: '066-email-delivery-log.sql',
packages/db/__tests__/settings-schema-foundation.test.ts:44:  feature_flags_core: '067-feature-flags-core.sql',
packages/db/__tests__/settings-schema-foundation.test.ts:45:  login_attempts: '068-login-attempts.sql',
packages/db/__tests__/settings-schema-foundation.test.ts:66:  it('feature_flags_core has PK (org_id, flag_code) and rolled_out_pct default 0', () => {
packages/db/__tests__/settings-schema-foundation.test.ts:72:  it('org_authorization_policies enforces npd requires_new_version invariant (V-SET-43)', () => {
packages/db/__tests__/settings-schema-foundation.test.ts:74:    expect(sql).toMatch(/org_authorization_policies_npd_requires_new_version_check/i);
packages/db/__tests__/settings-schema-foundation.test.ts:170:      authz: (await c.query('select policy_code from public.org_authorization_policies')).rowCount,
packages/db/__tests__/settings-schema-foundation.test.ts:171:      uom: (await c.query('select code from public.unit_of_measure')).rowCount,
packages/db/__tests__/settings-schema-foundation.test.ts:172:      flags: (await c.query('select flag_code from public.feature_flags_core')).rowCount,
packages/db/__tests__/settings-schema-foundation.test.ts:195:        `insert into public.d365_sync_runs (org_id, direction, entity_type, status)
packages/db/__tests__/settings-schema-foundation.test.ts:200:        `insert into public.email_delivery_log (org_id, trigger_code, recipient_email)
packages/db/__tests__/settings-schema-foundation.test.ts:205:        `insert into public.login_attempts (org_id, email, success) values (app.current_org_id(), $1, true)`,
packages/db/__tests__/settings-schema-foundation.test.ts:220:      d365: (await c.query('select 1 from public.d365_sync_runs where entity_type = $1', [marker])).rowCount,
packages/db/__tests__/settings-schema-foundation.test.ts:221:      email: (await c.query('select 1 from public.email_delivery_log where trigger_code = $1', [marker])).rowCount,
packages/db/__tests__/settings-schema-foundation.test.ts:222:      login: (await c.query('select 1 from public.login_attempts where email = $1', [`${marker}@ex.test`])).rowCount,
packages/db/__tests__/settings-schema-foundation.test.ts:229:      (await c.query('select 1 from public.d365_sync_runs where entity_type = $1', [marker])).rowCount,
packages/db/__tests__/settings-schema-foundation.test.ts:236:        c.query(`insert into public.feature_flags_core (org_id, flag_code) values ($1::uuid, 'sneak')`, [orgB]),
packages/db/__tests__/settings-schema-foundation.test.ts:241:    await adminPool.query('delete from public.d365_sync_runs where entity_type = $1', [marker]).catch(() => undefined);
packages/db/__tests__/settings-schema-foundation.test.ts:242:    await adminPool.query('delete from public.email_delivery_log where trigger_code = $1', [marker]).catch(() => undefined);
packages/db/__tests__/settings-schema-foundation.test.ts:243:    await adminPool.query('delete from public.login_attempts where email = $1', [`${marker}@ex.test`]).catch(() => undefined);
packages/db/__tests__/settings-schema-foundation.test.ts:251:          `insert into public.org_authorization_policies (org_id, policy_code, requires_new_version)
packages/db/__tests__/settings-schema-foundation.test.ts:255:    ).rejects.toThrow(/org_authorization_policies_npd_requires_new_version_check|violates check/i);
packages/db/schema/email-log.ts:6:// T-113 — email_delivery_log (migration 066). Email Delivery Log (SET-093).
packages/db/schema/email-log.ts:9:  'email_delivery_log',
packages/db/schema/email-log.ts:28:    orgIdx: index('email_delivery_log_org_idx').on(table.orgId),
packages/db/schema/email-log.ts:29:    orgCreatedIdx: index('email_delivery_log_org_created_idx').on(table.orgId, table.createdAt),
packages/db/schema/email-log.ts:30:    orgTriggerIdx: index('email_delivery_log_org_trigger_idx').on(table.orgId, table.triggerCode),
packages/db/schema/email-log.ts:32:      'email_delivery_log_status_check',
packages/db/schema/email-log.ts:36:      'email_delivery_log_retry_status_check',
packages/db/schema/email-log.ts:39:    retryCountCheck: check('email_delivery_log_retry_count_check', sql`retry_count >= 0`),
packages/db/schema/settings-auth-policies.ts:6:// T-122 — org_authorization_policies (migration 063).
packages/db/schema/settings-auth-policies.ts:10:  'org_authorization_policies',
packages/db/schema/settings-auth-policies.ts:32:    orgCodeUnique: unique('org_authorization_policies_org_code_unique').on(table.orgId, table.policyCode),
packages/db/schema/settings-auth-policies.ts:33:    orgIdx: index('org_authorization_policies_org_idx').on(table.orgId),
packages/db/schema/settings-auth-policies.ts:34:    orgCodeIdx: index('org_authorization_policies_org_code_idx').on(table.orgId, table.policyCode),
packages/db/schema/settings-auth-policies.ts:36:      'org_authorization_policies_code_check',
packages/db/schema/settings-auth-policies.ts:39:    minApproversCheck: check('org_authorization_policies_min_approvers_check', sql`min_approvers >= 1`),
packages/db/schema/settings-auth-policies.ts:40:    versionCheck: check('org_authorization_policies_version_check', sql`version >= 1`),
packages/db/schema/settings-auth-policies.ts:42:      'org_authorization_policies_npd_requires_new_version_check',
packages/db/schema/flags-prefs.ts:6:// T-013 — feature_flags_core (§10.2, migration 067) + notification_preferences (§13.3, migration 049).
packages/db/schema/flags-prefs.ts:7:// PostHog non-core flags are NOT mirrored into feature_flags_core (T-013 red line).
packages/db/schema/flags-prefs.ts:9:  'feature_flags_core',
packages/db/schema/flags-prefs.ts:24:    orgIdx: index('feature_flags_core_org_idx').on(table.orgId),
packages/db/schema/flags-prefs.ts:26:      'feature_flags_core_rolled_out_pct_check',
packages/db/schema/flags-prefs.ts:29:    tierCheck: check('feature_flags_core_tier_check', sql`tier in ('L1', 'L2', 'L3', 'L4')`),
packages/db/schema/flags-prefs.ts:35:  'notification_preferences',
packages/db/schema/flags-prefs.ts:52:    orgEventIdx: index('notification_preferences_org_event_idx').on(table.orgId, table.category, table.event),
packages/db/schema/flags-prefs.ts:54:      'notification_preferences_category_event_nonempty',
packages/db/schema/units.ts:6:// T-073 — unit_of_measure + uom_custom_conversions (migration 064).
packages/db/schema/units.ts:9:  'unit_of_measure',
packages/db/schema/units.ts:25:    orgCodeUnique: unique('unit_of_measure_org_code_unique').on(table.orgId, table.code),
packages/db/schema/units.ts:26:    orgIdx: index('unit_of_measure_org_idx').on(table.orgId),
packages/db/schema/units.ts:27:    orgCategoryIdx: index('unit_of_measure_org_category_idx').on(table.orgId, table.category, table.isBase),
packages/db/schema/units.ts:28:    categoryCheck: check('unit_of_measure_category_check', sql`category in ('mass', 'volume', 'count')`),
packages/db/schema/units.ts:29:    factorPositive: check('unit_of_measure_factor_positive', sql`factor_to_base > 0`),
packages/db/schema/security.ts:5:// T-011 — §5.7 security tables. login_attempts (migration 068) is the new table this task adds;
packages/db/schema/security.ts:11:  'login_attempts',
packages/db/schema/security.ts:24:    ipAttemptedIdx: index('login_attempts_ip_attempted_idx').on(table.ipAddress, table.attemptedAt),
packages/db/schema/security.ts:25:    orgAttemptedIdx: index('login_attempts_org_attempted_idx').on(table.orgId, table.attemptedAt),
packages/db/schema/integrations-d365.ts:6:// T-112 — d365_sync_runs (migration 065). D365 Sync Audit (SET-083).
packages/db/schema/integrations-d365.ts:9:  'd365_sync_runs',
packages/db/schema/integrations-d365.ts:28:    orgIdx: index('d365_sync_runs_org_idx').on(table.orgId),
packages/db/schema/integrations-d365.ts:29:    orgStartedIdx: index('d365_sync_runs_org_started_idx').on(table.orgId, table.startedAt),
packages/db/schema/integrations-d365.ts:30:    directionCheck: check('d365_sync_runs_direction_check', sql`direction in ('pull', 'push')`),
packages/db/schema/integrations-d365.ts:31:    statusCheck: check('d365_sync_runs_status_check', sql`status in ('ok', 'partial', 'failed')`),
packages/db/schema/integrations-d365.ts:33:      'd365_sync_runs_row_counts_check',
apps/web/app/[locale]/(app)/(admin)/account/notifications/notifications-data.test.ts:5: * Asserts the REAL SQL hits `public.notification_preferences` (migration 049),
apps/web/app/[locale]/(app)/(admin)/account/notifications/notifications-data.test.ts:35:  it('selects from public.notification_preferences scoped by org + signed-in user', async () => {
apps/web/app/[locale]/(app)/(admin)/account/notifications/notifications-data.test.ts:41:    expect(sql).toContain('from public.notification_preferences');
apps/web/app/[locale]/(app)/(admin)/account/notifications/notifications-data.test.ts:98:      String(sql).includes('insert into public.notification_preferences'),
apps/web/app/(admin)/settings/__tests__/admin-settings-guards.test.ts:147:  it('authorization canonical loader reads real org_authorization_policies via withOrgContext (no SERVER_DEFAULT fixtures)', () => {
apps/web/app/[locale]/(app)/(admin)/account/notifications/notifications-data.ts:6: * reads/writes against `public.notification_preferences` (migration 049).
apps/web/app/[locale]/(app)/(admin)/account/notifications/notifications-data.ts:19: * NOTE: `notification_preferences` is boolean-channel only — it has no columns
apps/web/app/[locale]/(app)/(admin)/account/notifications/notifications-data.ts:130:           from public.notification_preferences
apps/web/app/[locale]/(app)/(admin)/account/notifications/notifications-data.ts:154: * Upsert every boolean toggle as a `notification_preferences` row for the
apps/web/app/[locale]/(app)/(admin)/account/notifications/notifications-data.ts:172:          `insert into public.notification_preferences
apps/web/app/[locale]/(app)/(admin)/account/notifications/notifications-data.ts:187:         values ($1::uuid, $2, 'notification_preferences', $1::uuid, $3::jsonb, $4)`,
apps/web/actions/import-export/import.ts:139:       from public.org_authorization_policies
apps/web/lib/settings/rules/technical-product-spec-approval-gate.test.ts:136:      if (normalized.includes('from public.org_authorization_policies')) {
apps/web/actions/flags/set-core.test.ts:91:    expect(statementIndex('feature_flags_core')).toBe(-1);
apps/web/actions/flags/set-core.test.ts:118:    expect(statementIndex('org_authorization_policies')).toBeGreaterThanOrEqual(0);
apps/web/actions/flags/set-core.test.ts:119:    expect(statementIndex('feature_flags_core')).toBe(-1);
apps/web/actions/flags/set-core.test.ts:146:    expect(statementIndex('org_authorization_policies')).toBeGreaterThanOrEqual(0);
apps/web/actions/flags/set-core.test.ts:148:    expect(statementIndex('feature_flags_core')).toBe(-1);
apps/web/actions/flags/set-core.test.ts:165:    expect(statementIndex('org_authorization_policies')).toBe(-1);
apps/web/actions/flags/set-core.test.ts:181:    expect(statementIndex('feature_flags_core')).toBe(-1);
apps/web/actions/flags/set-core.test.ts:186:  it('writes exactly one audit-triggered row and one outbox event for each successful feature_flags_core change', async () => {
apps/web/actions/flags/set-core.test.ts:197:      { action: 'feature_flags_core.update', resourceId: 'scanner.pwa.enabled' },
apps/web/actions/flags/set-core.test.ts:292:      if (normalized.includes('org_authorization_policies')) {
apps/web/actions/flags/set-core.test.ts:302:      if (normalized.includes('from public.feature_flags_core') || normalized.includes('from feature_flags_core')) {
apps/web/actions/flags/set-core.test.ts:311:      if (normalized.includes('feature_flags_core') && (normalized.includes('insert') || normalized.includes('update'))) {
apps/web/actions/flags/set-core.test.ts:316:          client.auditEvents.push({ action: 'feature_flags_core.update', resourceId: flagCode });
apps/web/actions/flags/set-core.ts:76:        `update public.feature_flags_core
apps/web/actions/flags/set-core.ts:244:       from public.org_authorization_policies
apps/web/actions/import-export/import-export.test.ts:229:    expect(statementIndex('org_authorization_policies')).toBeGreaterThanOrEqual(0);
apps/web/actions/import-export/import-export.test.ts:345:      if (normalized.includes('from public.org_authorization_policies')) {
apps/web/actions/authorization/policy-actions.ts:54:        `update public.org_authorization_policies
apps/web/actions/authorization/preflight.ts:122:       from public.org_authorization_policies
apps/web/actions/authorization/authorization-policy.test.ts:128:    expect(statementIndex('org_authorization_policies')).toBeGreaterThanOrEqual(0);
apps/web/actions/authorization/authorization-policy.test.ts:150:    expect(statementIndex('org_authorization_policies')).toBeGreaterThanOrEqual(0);
apps/web/actions/authorization/authorization-policy.test.ts:168:    expect(statementIndex('org_authorization_policies')).toBeGreaterThanOrEqual(0);
apps/web/actions/authorization/authorization-policy.test.ts:188:    expect(statementIndex('update public.org_authorization_policies')).toBe(-1);
apps/web/actions/authorization/authorization-policy.test.ts:203:    expect(statementIndex('update public.org_authorization_policies')).toBe(-1);
apps/web/actions/authorization/authorization-policy.test.ts:221:    expect(callBlob('update public.org_authorization_policies')).toContain('app.current_org_id()');
apps/web/actions/authorization/authorization-policy.test.ts:277:    expect(statementIndex('org_authorization_policies')).toBeGreaterThanOrEqual(0);
apps/web/actions/authorization/authorization-policy.test.ts:278:    expect(statementIndex('update public.org_authorization_policies')).toBe(-1);
apps/web/actions/authorization/authorization-policy.test.ts:329:      if (normalized.includes('org_authorization_policies') && normalized.includes('select')) {
apps/web/actions/authorization/authorization-policy.test.ts:342:      if (normalized.includes('update public.org_authorization_policies')) {
apps/web/app/[locale]/(app)/(admin)/settings/flags/page.tsx:141:// V-SET-43 preflight is computed from REAL org_authorization_policies state — never a
apps/web/app/[locale]/(app)/(admin)/settings/flags/page.tsx:189:             from public.feature_flags_core
apps/web/app/[locale]/(app)/(admin)/settings/flags/page.tsx:197:             from public.org_authorization_policies
apps/web/app/[locale]/(app)/(admin)/settings/flags/page.test.tsx:36:// Real-data wiring: the production page reads feature_flags_core +
apps/web/app/[locale]/(app)/(admin)/settings/flags/page.test.tsx:37:// org_authorization_policies through withOrgContext (RLS app.current_org_id()).
apps/web/app/[locale]/(app)/(admin)/settings/flags/page.test.tsx:262:// Seeded feature_flags_core rows (migration 067 per-org seed) the mocked HOF returns.
apps/web/app/[locale]/(app)/(admin)/settings/flags/page.test.tsx:282:// org_authorization_policies row for npd_post_release_edit (V-SET-43 preflight source).
apps/web/app/[locale]/(app)/(admin)/settings/flags/page.test.tsx:304:    if (/from public\.feature_flags_core/i.test(sql)) {
apps/web/app/[locale]/(app)/(admin)/settings/flags/page.test.tsx:307:    if (/from public\.org_authorization_policies/i.test(sql)) {
apps/web/app/[locale]/(app)/(admin)/settings/flags/page.test.tsx:466:describe('T-065 flags admin reads REAL feature_flags_core via withOrgContext (no hardcoded defaultFlags)', () => {
apps/web/app/[locale]/(app)/(admin)/settings/flags/page.test.tsx:467:  it('the production page source contains no hardcoded defaultFlags array and reads feature_flags_core through withOrgContext', () => {
apps/web/app/[locale]/(app)/(admin)/settings/flags/page.test.tsx:476:    expect(source).toMatch(/public\.feature_flags_core/);
apps/web/app/[locale]/(app)/(admin)/settings/flags/page.test.tsx:477:    expect(source).toMatch(/public\.org_authorization_policies/);
apps/web/app/[locale]/(app)/(admin)/settings/flags/page.test.tsx:480:  it('renders the seeded feature_flags_core rows fetched through the org-scoped HOF', async () => {
apps/web/app/[locale]/(app)/(admin)/settings/flags/page.test.tsx:485:    // feature_flags_core SELECT is RLS-scoped to app.current_org_id().
apps/web/app/[locale]/(app)/(admin)/settings/flags/page.test.tsx:486:    const flagSelect = queryMock.mock.calls.find(([sql]) => /from public\.feature_flags_core/i.test(sql as string));
apps/web/app/[locale]/(app)/(admin)/settings/flags/page.test.tsx:495:  it('computes the V-SET-43 preflight from the REAL org_authorization_policies row (canEnable true), so the toggle is not pre-blocked', async () => {
apps/web/app/[locale]/(app)/(admin)/settings/flags/page.test.tsx:533:  it('renders the empty state when feature_flags_core returns zero rows for the org', async () => {
apps/web/app/[locale]/(app)/(admin)/settings/units/_actions/manage-units.ts:13: *   - unit_of_measure(org_id, category, code, name, factor_to_base, is_base, deleted_at)
apps/web/app/[locale]/(app)/(admin)/settings/units/_actions/manage-units.ts:106:     values ($1::uuid, $2::uuid, 'user', $3, 'unit_of_measure', $4, $5::jsonb, $6::jsonb, 'standard')`,
apps/web/app/[locale]/(app)/(admin)/settings/units/_actions/manage-units.ts:125:     values ($1::uuid, $2, 'unit_of_measure', $3::uuid, $4::jsonb, $5)`,
apps/web/app/[locale]/(app)/(admin)/settings/units/_actions/manage-units.ts:145:        `insert into public.unit_of_measure
apps/web/app/[locale]/(app)/(admin)/settings/units/_actions/manage-units.ts:164:        eventType: 'unit_of_measure.created',
apps/web/app/[locale]/(app)/(admin)/settings/units/_actions/manage-units.ts:213:        eventType: 'unit_of_measure.conversion_created',
apps/web/app/[locale]/(app)/(admin)/settings/units/_actions/manage-units.ts:242:        `update public.unit_of_measure
apps/web/app/[locale]/(app)/(admin)/settings/units/_actions/manage-units.ts:262:        eventType: 'unit_of_measure.soft_deleted',
apps/web/app/[locale]/(app)/(admin)/settings/units/page.tsx:229:             from public.unit_of_measure
apps/web/app/[locale]/(app)/(admin)/settings/integrations/_data/load-integrations.ts:13: *   - public.d365_sync_runs                                    → sync KPIs + recent activity
apps/web/app/[locale]/(app)/(admin)/settings/integrations/_data/load-integrations.ts:104:           from public.d365_sync_runs
apps/web/app/[locale]/(app)/(admin)/settings/integrations/_data/load-integrations.ts:129:         from public.d365_sync_runs
apps/web/app/[locale]/(app)/(admin)/settings/units/page.test.tsx:356:  // mirroring the live unit_of_measure / uom_custom_conversions / role_permissions
apps/web/app/[locale]/(app)/(admin)/settings/units/page.test.tsx:363:            if (/from\s+public\.unit_of_measure/i.test(sql)) {
apps/web/app/[locale]/(app)/(admin)/settings/units/page.test.tsx:385:  it('reads units from the live unit_of_measure table via withOrgContext (no injected props, no mocks)', async () => {
apps/web/app/[locale]/(app)/(admin)/settings/integrations/d365/audit/page.tsx:112:           from public.d365_sync_runs
apps/web/app/[locale]/(app)/(admin)/settings/authorization/page.test.tsx:111:  missingSeedBody: 'Required org_authorization_policies rows are absent. Seed these policy codes before editing settings:',
apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.tsx:188:             from public.notification_preferences
apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.tsx:280:     values ($1::uuid, $2, 'notification_preferences', $1::uuid, $3::jsonb, $4)`,
apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.tsx:292:      `insert into public.notification_preferences (user_id, org_id, category, event, channel_email, channel_in_app)
apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.tsx:320:        `update public.notification_preferences
apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.tsx:344:      `insert into public.notification_preferences (user_id, org_id, category, event, channel_email, channel_in_app)
apps/web/app/[locale]/(app)/(admin)/settings/notifications/email-log/page.test.tsx:230:  it('lists the last five email_delivery_log rows in created_at DESC order with status badges and no retry actions', async () => {
apps/web/app/[locale]/(app)/(admin)/settings/notifications/email-log/page.test.tsx:235:    expect(root).toHaveAttribute('data-screen', 'email_delivery_log_screen');
apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.test.tsx:278:  it('proves public.notification_preferences FORCE RLS and app.current_org_id() policy from live pg_catalog', async () => {
apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.test.tsx:279:    const verificationCommand = `psql "$DATABASE_URL" -Atc "select c.relrowsecurity, c.relforcerowsecurity, count(p.policyname), count(*) filter (where coalesce(p.qual,'') || coalesce(p.with_check,'') like '%app.current_org_id()%') from pg_class c join pg_namespace n on n.oid = c.relnamespace left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname where n.nspname = 'public' and c.relname = 'notification_preferences' group by c.relrowsecurity, c.relforcerowsecurity;"`;
apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.test.tsx:307:            and c.relname = 'notification_preferences'
apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.test.tsx:311:      expect(result.rows, 'public.notification_preferences must exist in the migrated live DB').toHaveLength(1);
apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.test.tsx:312:      expect(result.rows[0]?.relrowsecurity, 'RLS must be enabled on notification_preferences').toBe(true);
apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.test.tsx:317:        'notification_preferences policy must be scoped by app.current_org_id()',
apps/web/app/[locale]/(app)/(admin)/settings/notifications/email-log/page.tsx:228:           from public.email_delivery_log
apps/web/app/[locale]/(app)/(admin)/settings/notifications/email-log/page.tsx:246:      data-screen="email_delivery_log_screen"
apps/web/app/[locale]/(app)/(admin)/settings/notifications/email-log/page.tsx:310:      data-screen="email_delivery_log_screen"

 succeeded in 0ms:
apps/worker/src/jobs/outbox-consumer.ts:27:  event_type: string;
apps/worker/src/jobs/outbox-consumer.ts:47:      eventType: message.eventType,
apps/worker/src/jobs/outbox-consumer.ts:109:    `SELECT id, org_id, event_type, aggregate_type, aggregate_id, payload,
apps/worker/src/jobs/outbox-consumer.ts:143:        event_type: row.event_type,
apps/worker/src/jobs/outbox-consumer.ts:160:    eventType: normalizeEventType(row.event_type),
apps/worker/src/jobs/outbox-consumer.ts:199:         (outbox_event_id, org_id, event_type, aggregate_type, aggregate_id,
apps/worker/src/jobs/outbox-consumer.ts:208:        row.event_type,
packages/rule-engine/src/dispatch.ts:6:  eventType: string;
packages/rule-engine/src/dispatch.ts:18:export function isCascadeEvent(eventType: string): boolean {
packages/rule-engine/src/dispatch.ts:20:    eventType.includes('manufacturing_operation') ||
packages/rule-engine/src/dispatch.ts:21:    eventType.includes('cascade') ||
packages/rule-engine/src/dispatch.ts:22:    eventType === CASCADE_EVENT
packages/rule-engine/src/dispatch.ts:47:  const eventMatch = msg.eventType.match(/manufacturing_operation_([1-4])/);
packages/rule-engine/src/dispatch.ts:74:  if (!isCascadeEvent(msg.eventType)) {
apps/worker/src/jobs/__tests__/outbox-consumer.test.ts:28:  eventType?: string;
apps/worker/src/jobs/__tests__/outbox-consumer.test.ts:38:       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version, attempts)
apps/worker/src/jobs/__tests__/outbox-consumer.test.ts:43:      values.eventType ?? EventType.AUDIT_RECORDED,
apps/worker/src/jobs/__tests__/outbox-consumer.test.ts:124:      eventType: EventType.FG_CREATED,
apps/worker/src/jobs/__tests__/outbox-consumer.test.ts:138:      eventType: EventType.FG_CREATED,
packages/rule-engine/src/__tests__/cascade-mfg-intermediate.test.ts:9: *       /^WIP-MX-\d{7}$/ and an outbox row with event_type='fg.intermediate_code_changed'
packages/rule-engine/src/__tests__/cascade-mfg-intermediate.test.ts:314:            where org_id = $1 and event_type = 'fg.intermediate_code_changed'`,
packages/rule-engine/src/__tests__/cascade-mfg-intermediate.test.ts:338:          event_type: string;
packages/rule-engine/src/__tests__/cascade-mfg-intermediate.test.ts:343:          `select event_type, aggregate_id, aggregate_type, payload
packages/rule-engine/src/__tests__/cascade-mfg-intermediate.test.ts:345:            where org_id = $1 and event_type = 'fg.intermediate_code_changed'
packages/rule-engine/src/__tests__/cascade-mfg-intermediate.test.ts:623:            where org_id = $1 and event_type = 'fg.intermediate_code_changed'`,
packages/schema-driven/src/actions/draft.ts:385:           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
packages/rule-engine/src/__tests__/cascade-dispatch.test.ts:21:        eventType: 'fg.manufacturing_operation_1.changed',
packages/rule-engine/src/__tests__/cascade-dispatch.test.ts:53:        eventType: 'audit.recorded',
packages/rule-engine/src/__tests__/workflow.test.ts:108:              event_type: 'wo.ready',
packages/rule-engine/src/__tests__/workflow.test.ts:131:              event_type: 'quality.recorded',
packages/rule-engine/src/__tests__/workflow.test.ts:164:      payload: expect.objectContaining({ event_type: 'wo.ready' }),
packages/rule-engine/src/__tests__/workflow.test.ts:358:        event_type: 'wo.ready',
packages/rule-engine/src/__tests__/workflow.test.ts:396:  dbIt('outbox CHECK constraint pins SQLSTATE 23514 on bad event_type', async () => {
packages/rule-engine/src/__tests__/workflow.test.ts:406:           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
packages/rule-engine/src/__tests__/workflow.test.ts:410:          'workflow.bogus_unknown_event_type',
packages/rule-engine/src/__tests__/workflow.test.ts:494:      event_type: 'wo.requestReady',
packages/rule-engine/src/__tests__/workflow.test.ts:529:      event_type: 'wo.requestReady',
packages/rule-engine/src/__tests__/workflow.test.ts:557:      executeRule(rule, { event_type: 'test.event' }, RuleExecutionMode.NORMAL);
packages/rule-engine/src/__tests__/executor.test.ts:41:        event_type: 'wo.status_change.READY',
packages/rule-engine/src/__tests__/executor.test.ts:86:        event_type: 'wo.status_change.READY',
packages/rule-engine/src/__tests__/executor.test.ts:126:        event_type: 'wo.status_change.READY',
packages/rule-engine/src/__tests__/executor.test.ts:154:      const event = { event_type: 'brief.import', source_dept: 'core' };
packages/rule-engine/src/__tests__/executor.test.ts:177:      const event = { event_type: 'some.event' };
packages/rule-engine/src/__tests__/executor.test.ts:191:      const event = { event_type: 'test.event' };
packages/rule-engine/src/__tests__/executor.test.ts:229:        event_type: 'brief.import',
packages/rule-engine/src/__tests__/executor.test.ts:269:        event_type: 'product.definition',
packages/rule-engine/src/__tests__/executor.test.ts:295:        event_type: 'product.definition',
packages/rule-engine/src/__tests__/executor.test.ts:332:        event_type: 'price.release',
packages/rule-engine/src/__tests__/executor.test.ts:364:        event_type: 'wo.created',
packages/rule-engine/src/__tests__/executor.test.ts:387:      const event = { event_type: 'test.event' };
packages/rule-engine/src/__tests__/executor.test.ts:406:      const event = { event_type: 'test.event', status: 'INACTIVE' };
packages/rule-engine/src/__tests__/executor.test.ts:421:      const wrongEvent = { event_type: 'wo.status_change.DRAFT' };
packages/rule-engine/src/__tests__/executor.test.ts:422:      const rightEvent = { event_type: 'wo.status_change.READY' };
packages/rule-engine/src/__tests__/executor.test.ts:462:        event_type: 'fg.manufacturing_operation_changed',
packages/rule-engine/src/__tests__/executor.test.ts:494:        event_type: 'fg.manufacturing_operation_changed',
packages/rule-engine/src/__tests__/executor.test.ts:519:        event_type: 'fg.manufacturing_operation_changed',
packages/rule-engine/src/__tests__/executor.test.ts:540:        event_type: 'fg.manufacturing_operation_changed',
packages/rule-engine/src/cascade-handler.ts:6: * row (event_type='fg.intermediate_code_changed') in the same tx as the UPDATE.
packages/rule-engine/src/cascade-handler.ts:159:         (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
packages/rule-engine/src/workflow.ts:148:      const eventType = p.event_type as string | undefined;
packages/rule-engine/src/workflow.ts:151:      if (!orgId || !eventType || !aggregateType || !aggregateId) continue;
packages/rule-engine/src/workflow.ts:155:             (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
packages/rule-engine/src/workflow.ts:157:          [orgId, eventType, aggregateType, aggregateId, p, 't035-workflow'],
packages/rule-engine/src/executor.ts:133:  // Trigger discrimination: rule must list the event_type in its triggers
packages/rule-engine/src/executor.ts:134:  const triggerMatches = rule.triggers.includes(event['event_type']);
packages/rule-engine/src/executor.ts:203:          (event.event_type as string | undefined) ??
packages/outbox/src/queue.ts:9:  eventType: EventType;
packages/outbox/src/worker.ts:11:  event_type: string;
packages/outbox/src/worker.ts:35:    `SELECT id, org_id, event_type, aggregate_type, aggregate_id, payload, created_at, app_version
packages/outbox/src/worker.ts:43:    // Validate event_type against the canonical enum — throws for unknown types
packages/outbox/src/worker.ts:44:    const eventType = normalizeEventType(row.event_type);
packages/outbox/src/worker.ts:49:      eventType,
packages/outbox/src/__tests__/dispatcher-error-surface.test.ts:10:    eventType: EventType.AUDIT_RECORDED,
packages/outbox/src/__tests__/worker.e2e.test.ts:87:  runWithDb('AC1: given outbox_events exists and a row is inserted with event_type=audit.recorded, when worker.runOnce() executes, then the in-memory queue contains exactly one message and the row\'s consumed_at is set', async () => {
packages/outbox/src/__tests__/worker.e2e.test.ts:102:      `INSERT INTO ${schemaName}.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
packages/outbox/src/__tests__/worker.e2e.test.ts:127:      eventType: EventType.AUDIT_RECORDED,
packages/outbox/src/__tests__/worker.e2e.test.ts:144:  runWithDb('AC2: given event_type is constrained to EventType members, when an insertion uses invalid.event (not in EventType), then the worker rejects publishing and the test fails fast', async () => {
packages/outbox/src/__tests__/worker.e2e.test.ts:163:        `INSERT INTO ${schemaName}.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
packages/outbox/src/__tests__/worker.e2e.test.ts:215:      SELECT id, org_id, event_type, aggregate_type, aggregate_id, payload, created_at, consumed_at, app_version
packages/outbox/src/__tests__/dispatch-queue.test.ts:10:    eventType: EventType.AUDIT_RECORDED,
packages/db/schema/baseline.ts:91:    eventType: text('event_type').notNull(),
packages/db/schema/baseline.ts:118:    eventType: text('event_type').notNull(),
packages/outbox/src/__tests__/events.test.ts:19:  'settings.notification_rule_updated',
packages/outbox/src/__tests__/events.test.ts:20:  'settings.notification_channel_updated',
packages/outbox/src/__tests__/events.test.ts:21:  'settings.notification_digest_updated',
packages/outbox/src/__tests__/events.test.ts:80:    for (const eventType of ALL_SETTINGS_EVENTS) {
packages/outbox/src/__tests__/events.test.ts:81:      expect(eventType).toMatch(/^settings\.[a-z_]+(?:\.[a-z_]+)?$/);
packages/outbox/src/__tests__/events.test.ts:82:      expect(ALL_EVENTS).toContain(eventType);
packages/outbox/src/__tests__/events.test.ts:83:      expect(Object.values(EventType)).toContain(eventType);
packages/outbox/src/__tests__/events.test.ts:90:    for (const eventType of ALL_EVENTS) {
packages/outbox/src/__tests__/events.test.ts:91:      expect(eventType).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
packages/outbox/src/__tests__/events.test.ts:105:    expect(Object.values(EventType).some((eventType) => eventType.startsWith('fa.'))).toBe(false);
packages/outbox/src/__tests__/events.test.ts:106:    expect(Object.values(EventType).some((eventType) => eventType.startsWith('product.'))).toBe(false);
packages/outbox/src/__tests__/events.test.ts:107:    expect(ALL_EVENTS.some((eventType) => eventType.startsWith('fa.'))).toBe(false);
packages/outbox/src/__tests__/events.test.ts:111:    expect(ALL_EVENTS.some((eventType) => eventType.startsWith('product.'))).toBe(false);
packages/outbox/src/__tests__/events.test.ts:132:    for (const eventType of ALL_EVENTS) {
packages/outbox/src/__tests__/events.test.ts:133:      expect(normalizeEventType(eventType)).toBe(eventType);
packages/outbox/src/events.enum.ts:30:  SETTINGS_NOTIFICATION_RULE_UPDATED = 'settings.notification_rule_updated',
packages/outbox/src/events.enum.ts:31:  SETTINGS_NOTIFICATION_CHANNEL_UPDATED = 'settings.notification_channel_updated',
packages/outbox/src/events.enum.ts:32:  SETTINGS_NOTIFICATION_DIGEST_UPDATED = 'settings.notification_digest_updated',
apps/web/middleware.test.ts:205:      eventType: 'admin_ip_blocked',
apps/web/middleware.test.ts:234:      eventType: 'admin_ip_blocked',
apps/web/app/(admin)/account/notifications/page.tsx:76:      ? 'Permission denied: settings.notifications.manage is required to edit notification preferences.'
apps/web/app/api/internal/cron/outbox/route.ts:21: *     next tick. Consumer-side dedup (e.g. on aggregate_id + event_type +
apps/web/app/api/internal/cron/outbox/route.ts:70: *   - validate event_type against the canonical enum
apps/web/app/api/internal/cron/outbox/route.ts:77:  event_type: string;
apps/web/app/api/internal/cron/outbox/route.ts:87:    `SELECT id, org_id, event_type, aggregate_type, aggregate_id, payload, created_at, app_version
apps/web/app/api/internal/cron/outbox/route.ts:95:    const eventType = normalizeEventType(row.event_type);
apps/web/app/api/internal/cron/outbox/route.ts:99:      eventType,
apps/web/app/api/internal/upgrade/_actions/__tests__/upgrade.test.ts:17: *   (a new migration adding these event_type values) before these tests can pass.
apps/web/app/api/internal/upgrade/_actions/__tests__/upgrade.test.ts:152:    `delete from public.outbox_events where event_type in (
apps/web/app/api/internal/upgrade/_actions/__tests__/upgrade.test.ts:229:      `select count(*)::text as count from public.outbox_events where event_type = 'tenant.migration.run'`,
apps/web/app/api/internal/upgrade/_actions/__tests__/upgrade.test.ts:243:      event_type: string;
apps/web/app/api/internal/upgrade/_actions/__tests__/upgrade.test.ts:247:      `select event_type, org_id, payload from public.outbox_events
apps/web/app/api/internal/upgrade/_actions/__tests__/upgrade.test.ts:248:         where event_type = 'tenant.migration.run' order by id desc limit 1`,
apps/web/app/api/internal/upgrade/_actions/__tests__/upgrade.test.ts:253:      `select count(*)::text as count from public.outbox_events where event_type = 'tenant.migration.run'`,
apps/web/app/api/internal/upgrade/_actions/__tests__/upgrade.test.ts:258:    expect(rows[0]!.event_type).toBe('tenant.migration.run');
apps/web/app/api/internal/upgrade/_actions/__tests__/upgrade.test.ts:352:      event_type: string;
apps/web/app/api/internal/upgrade/_actions/__tests__/upgrade.test.ts:355:      `select event_type, payload from public.outbox_events
apps/web/app/api/internal/upgrade/_actions/__tests__/upgrade.test.ts:356:         where event_type = 'tenant.migration.run.failed' order by id desc limit 1`,
apps/web/app/api/internal/upgrade/_actions/__tests__/upgrade.test.ts:360:    expect(rows[0]!.event_type).toBe('tenant.migration.run.failed');
apps/web/app/api/internal/upgrade/_actions/__tests__/upgrade.test.ts:369:  it('outbox CHECK constraint pins SQLSTATE 23514 if event_type is unknown (locks 12-event invariant)', async () => {
apps/web/app/api/internal/upgrade/_actions/__tests__/upgrade.test.ts:370:    // Verifies the 003-outbox.sql CHECK constraint still rejects unknown event_type values.
apps/web/app/api/internal/upgrade/_actions/__tests__/upgrade.test.ts:375:        `insert into public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/app/api/internal/upgrade/_actions/__tests__/upgrade.test.ts:469:         where event_type = 'tenant.cohort.advanced'`,
apps/web/app/api/internal/upgrade/_actions/__tests__/upgrade.test.ts:535:         where event_type = 'tenant.cohort.advanced'`,
apps/web/proxy.ts:211:          eventType: 'admin_ip_blocked',
apps/web/app/api/internal/upgrade/_actions/recordMigrationRun.ts:95:             (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/app/api/internal/upgrade/_actions/recordMigrationRun.ts:136:             (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/app/api/internal/upgrade/_actions/advanceCohort.ts:100:             (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/infra/warehouse.ts:112:        eventType: 'settings.warehouse.deactivated',
apps/web/actions/infra/warehouse.ts:204:  params: { orgId: string; eventType: string; aggregateType: string; aggregateId: string; payload: unknown },
apps/web/actions/infra/warehouse.ts:208:       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/infra/warehouse.ts:210:    [params.orgId, params.eventType, params.aggregateType, params.aggregateId, JSON.stringify(params.payload)],
apps/web/actions/schema/add-column.ts:180:             (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/infra/crud.test.ts:28:  outboxEntries: Array<{ event_type: string; aggregate_id: string; payload: unknown }>;
apps/web/actions/infra/crud.test.ts:78:        const eventType = String(params.find((value) => typeof value === 'string' && value.includes('.')) ?? 'infra.unknown.changed');
apps/web/actions/infra/crud.test.ts:79:        if (options.outboxAllowedEventTypes && !options.outboxAllowedEventTypes.has(eventType)) {
apps/web/actions/infra/crud.test.ts:80:          const error = new Error(`outbox_events_event_type_check rejected ${eventType}`) as Error & { code: string; constraint: string };
apps/web/actions/infra/crud.test.ts:82:          error.constraint = 'outbox_events_event_type_check';
apps/web/actions/infra/crud.test.ts:87:        client.outboxEntries.push({ event_type: eventType, aggregate_id: aggregateId, payload: safeJsonParse(payloadRaw) });
apps/web/actions/infra/crud.test.ts:208:    const addConstraintIndex = sql.toLowerCase().lastIndexOf('add constraint outbox_events_event_type_check check');
apps/web/actions/infra/crud.test.ts:214:    expect.fail('Infra CRUD RED contract: outbox_events_event_type_check must exist in migrations before infra mutations can emit outbox rows');
apps/web/actions/infra/crud.test.ts:274:    expect(currentClient.outboxEntries.some((entry) => entry.event_type === 'settings.location.upserted')).toBe(true);
apps/web/actions/infra/crud.test.ts:290:    expect(currentClient.outboxEntries.some((entry) => entry.event_type === 'settings.machine.upserted')).toBe(true);
apps/web/actions/infra/crud.test.ts:308:    expect(currentClient.outboxEntries.some((entry) => entry.event_type === 'settings.line.upserted')).toBe(true);
apps/web/actions/infra/crud.test.ts:318:    expect(currentClient.outboxEntries.some((entry) => entry.event_type === 'settings.warehouse.deactivated')).toBe(true);
apps/web/actions/infra/crud.test.ts:321:  it('Outbox on mutations persists only event types accepted by outbox_events_event_type_check', async () => {
apps/web/actions/infra/crud.test.ts:338:      { eventType: 'settings.location.upserted', result: await upsertLocation({ warehouseId: WAREHOUSE_ID, parentId: AISLE_ID, code: 'RACK-03', name: 'Rack 03', level: 3, locationType: 'rack' }) },
apps/web/actions/infra/crud.test.ts:339:      { eventType: 'settings.machine.upserted', result: await upsertMachine({ id: MACHINE_ID, code: 'MIX-01', name: 'Mixer', machineType: 'mixer', locationId: BIN_ID }) },
apps/web/actions/infra/crud.test.ts:340:      { eventType: 'settings.line.upserted', result: await upsertLine({ id: LINE_ID, code: 'LINE-1', name: 'Line 1', status: 'active', machineIds: [MACHINE_ID] }) },
apps/web/actions/infra/crud.test.ts:341:      { eventType: 'settings.warehouse.deactivated', result: await deactivateWarehouse({ warehouseId: WAREHOUSE_ID, force: true }) },
apps/web/actions/infra/crud.test.ts:342:    ].map(({ eventType, result }) => ({ eventType, ok: result.ok, error: result.ok ? undefined : result.error }));
apps/web/actions/infra/crud.test.ts:346:      'Infra CRUD outbox event types must be admitted by the real outbox_events_event_type_check constraint; 23514 maps to persistence_failed and rolls back mutations.',
apps/web/actions/infra/crud.test.ts:348:      { eventType: 'settings.location.upserted', ok: true, error: undefined },
apps/web/actions/infra/crud.test.ts:349:      { eventType: 'settings.machine.upserted', ok: true, error: undefined },
apps/web/actions/infra/crud.test.ts:350:      { eventType: 'settings.line.upserted', ok: true, error: undefined },
apps/web/actions/infra/crud.test.ts:351:      { eventType: 'settings.warehouse.deactivated', ok: true, error: undefined },
apps/web/actions/infra/crud.test.ts:353:    expect(currentClient.outboxEntries.map((entry) => entry.event_type)).toEqual([
apps/web/actions/onboarding/mark-first-wo-created.ts:14:      audit: { eventType: 'settings.onboarding.first_wo_created'; timeToFirstWoMinutes: number };
apps/web/actions/onboarding/mark-first-wo-created.ts:39:    audit: { eventType: 'settings.onboarding.first_wo_created', timeToFirstWoMinutes: minutes },
apps/web/actions/schema/wizard.test.ts:61:  event_type: string;
apps/web/actions/schema/wizard.test.ts:193:        event_type: 'settings.schema.migration_requested',
apps/web/actions/schema/wizard.test.ts:438:  const eventType = params.find((p): p is string => typeof p === 'string' && p.includes('.')) ?? '';
apps/web/actions/schema/wizard.test.ts:448:    event_type: eventType,
apps/web/actions/infra/line.ts:64:        eventType: 'settings.line.upserted',
apps/web/actions/infra/line.ts:118:  params: { orgId: string; eventType: string; aggregateType: string; aggregateId: string; payload: unknown },
apps/web/actions/infra/line.ts:122:       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/infra/line.ts:124:    [params.orgId, params.eventType, params.aggregateType, params.aggregateId, JSON.stringify(params.payload)],
apps/web/actions/infra/location.ts:84:        eventType: 'settings.location.upserted',
apps/web/actions/infra/location.ts:151:  params: { orgId: string; eventType: string; aggregateType: string; aggregateId: string; payload: unknown },
apps/web/actions/infra/location.ts:155:       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/infra/location.ts:157:    [params.orgId, params.eventType, params.aggregateType, params.aggregateId, JSON.stringify(params.payload)],
apps/web/actions/infra/machine.ts:62:        eventType: 'settings.machine.upserted',
apps/web/actions/infra/machine.ts:117:  params: { orgId: string; eventType: string; aggregateType: string; aggregateId: string; payload: unknown },
apps/web/actions/infra/machine.ts:121:       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/infra/machine.ts:123:    [params.orgId, params.eventType, params.aggregateType, params.aggregateId, JSON.stringify(params.payload)],
apps/web/actions/orgs/create.ts:124:         (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/lib/auth/edge-middleware-policy.ts:37:  eventType: 'admin_ip_blocked';
apps/web/app/api/auth/invite/accept/route.ts:92:       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/app/[locale]/(app)/(admin)/account/notifications/notifications-data.test.ts:95:    expect(result.outboxEventType).toBe('settings.notification_digest_updated');
apps/web/actions/onboarding/advance.ts:278:       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/app/[locale]/(app)/(admin)/account/notifications/notifications-data.ts:16: *     emits a `settings.notification_digest_updated` outbox event in the same
apps/web/app/[locale]/(app)/(admin)/account/notifications/notifications-data.ts:62:const OUTBOX_DIGEST_EVENT = 'settings.notification_digest_updated';
apps/web/app/[locale]/(app)/(admin)/account/notifications/notifications-data.ts:186:           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/security/ip-allowlist-remove.ts:43:           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/security/upsert-policy.ts:95:           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/security/upsert-policy.ts:220:       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/security/force-mfa.ts:47:           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/flags/set-core.test.ts:57:  outboxEvents: Array<{ eventType: string; payload: unknown }>;
apps/web/actions/flags/set-core.test.ts:200:    expect(currentClient.outboxEvents[0]?.eventType).toBe('settings.core_flag.updated');
apps/web/actions/flags/set-core.test.ts:323:        const eventType = params.find((param): param is string => param === 'settings.core_flag.updated');
apps/web/actions/flags/set-core.test.ts:324:        client.outboxEvents.push({ eventType: eventType ?? 'unknown', payload: params });
apps/web/actions/security/ip-allowlist-add.ts:60:           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/app/onboarding/workorder/_components/workorder-client.tsx:39:      audit: { eventType: 'settings.onboarding.first_wo_created'; timeToFirstWoMinutes: number };
apps/web/app/onboarding/workorder/_components/workorder-client.tsx:250:  auditEvent: { eventType: string; timeToFirstWoMinutes: number } | null;
apps/web/app/onboarding/workorder/_components/workorder-client.tsx:275:          <code>{auditEvent.eventType}</code> · <code>time_to_first_wo = {auditEvent.timeToFirstWoMinutes} min</code>
apps/web/app/onboarding/workorder/_components/workorder-client.tsx:312:  const [auditEvent, setAuditEvent] = React.useState<{ eventType: string; timeToFirstWoMinutes: number } | null>(null);
apps/web/actions/flags/set-core.ts:92:           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/tenant/set-local-flag.ts:61:        eventType: 'settings.module.toggled',
apps/web/actions/tenant/set-local-flag.ts:127:  eventType,
apps/web/actions/tenant/set-local-flag.ts:133:  eventType: string;
apps/web/actions/tenant/set-local-flag.ts:138:       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/tenant/set-local-flag.ts:140:    [orgId, eventType, aggregateId, JSON.stringify(payload)],
apps/web/app/onboarding/workorder/page.test.tsx:51:      audit: { eventType: 'settings.onboarding.first_wo_created'; timeToFirstWoMinutes: number };
apps/web/app/onboarding/workorder/page.test.tsx:121:      eventType: 'settings.onboarding.first_wo_created',
apps/web/app/onboarding/workorder/page.test.tsx:168:        audit: { eventType: 'settings.onboarding.first_wo_created', timeToFirstWoMinutes: 11 },
apps/web/app/onboarding/workorder/page.test.tsx:276:        eventType: 'settings.onboarding.first_wo_created',
apps/web/actions/tenant/set-dept.ts:83:        eventType: 'settings.dept_override.updated',
apps/web/actions/tenant/set-dept.ts:207:  eventType,
apps/web/actions/tenant/set-dept.ts:213:  eventType: string;
apps/web/actions/tenant/set-dept.ts:218:       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/tenant/set-dept.ts:220:    [orgId, eventType, aggregateId, JSON.stringify(payload)],
apps/web/actions/reference/manufacturing-ops/update.ts:74:        eventType: 'manufacturing_operations.updated',
apps/web/actions/reference/manufacturing-ops/update.ts:172:  params: { orgId: string; eventType: string; aggregateId: string; payload: unknown },
apps/web/actions/reference/manufacturing-ops/update.ts:176:       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/reference/manufacturing-ops/update.ts:178:    [params.orgId, params.eventType, params.aggregateId, JSON.stringify(params.payload)],
apps/web/actions/tenant/start-upgrade.ts:99:        eventType: 'settings.upgrade.scheduled',
apps/web/actions/tenant/start-upgrade.ts:159:  eventType,
apps/web/actions/tenant/start-upgrade.ts:165:  eventType: string;
apps/web/actions/tenant/start-upgrade.ts:170:       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/tenant/start-upgrade.ts:172:    [orgId, eventType, aggregateId, JSON.stringify(payload)],
apps/web/actions/reference/upsert.ts:99:          eventType: 'reference.row.upserted',
apps/web/actions/reference/upsert.ts:131:        eventType: 'reference.row.upserted',
apps/web/actions/reference/upsert.ts:280:  params: { orgId: string; eventType: string; aggregateType: string; aggregateId: string; payload: unknown },
apps/web/actions/reference/upsert.ts:284:       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/reference/upsert.ts:286:    [params.orgId, params.eventType, params.aggregateType, params.aggregateId, JSON.stringify(params.payload)],
apps/web/app/onboarding/default-wiring.test.tsx:90:      audit: { eventType: 'settings.onboarding.first_wo_created', timeToFirstWoMinutes: 15 },
apps/web/actions/reference/manufacturing-ops/create.ts:69:        eventType: 'manufacturing_operations.created',
apps/web/actions/reference/manufacturing-ops/create.ts:163:  params: { orgId: string; eventType: string; aggregateId: string; payload: unknown },
apps/web/actions/reference/manufacturing-ops/create.ts:167:       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/reference/manufacturing-ops/create.ts:169:    [params.orgId, params.eventType, params.aggregateId, JSON.stringify(params.payload)],
apps/web/actions/reference/manufacturing-ops/deactivate.ts:90:        eventType: 'manufacturing_operations.deactivated',
apps/web/actions/reference/manufacturing-ops/deactivate.ts:197:  params: { orgId: string; eventType: string; aggregateId: string; payload: unknown },
apps/web/actions/reference/manufacturing-ops/deactivate.ts:201:       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/reference/manufacturing-ops/deactivate.ts:203:    [params.orgId, params.eventType, params.aggregateId, JSON.stringify(params.payload)],
apps/web/actions/reference/crud.test.ts:37:  outboxEntries: Array<{ event_type: string; aggregate_id: string; payload: unknown }>;
apps/web/actions/reference/crud.test.ts:148:        const eventType = String(params[1] ?? '');
apps/web/actions/reference/crud.test.ts:152:        client.outboxEntries.push({ event_type: eventType, aggregate_id: aggregateId, payload });
apps/web/actions/reference/crud.test.ts:315:    expect(currentClient.outboxEntries[0]?.event_type).toBe('reference.row.upserted');
apps/web/actions/reference/crud.test.ts:348:    expect(currentClient.outboxEntries[0]?.event_type).toBe('reference.row.soft_deleted');
apps/web/actions/tenant/set-rule-variant.ts:87:        eventType: 'settings.rule_variant.updated',
apps/web/actions/tenant/set-rule-variant.ts:154:  eventType,
apps/web/actions/tenant/set-rule-variant.ts:160:  eventType: string;
apps/web/actions/tenant/set-rule-variant.ts:165:       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/tenant/set-rule-variant.ts:167:    [orgId, eventType, aggregateId, JSON.stringify(payload)],
apps/web/actions/tenant/promote-canary.ts:77:        eventType: nextStatus === 'completed' ? 'settings.upgrade.completed' : 'settings.upgrade.promoted',
apps/web/actions/tenant/promote-canary.ts:131:  eventType,
apps/web/actions/tenant/promote-canary.ts:137:  eventType: string;
apps/web/actions/tenant/promote-canary.ts:142:       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/tenant/promote-canary.ts:144:    [orgId, eventType, aggregateId, JSON.stringify(payload)],
apps/web/actions/tenant/rollback-upgrade.ts:99:        eventType: 'settings.upgrade.rolled_back',
apps/web/actions/tenant/rollback-upgrade.ts:158:  eventType,
apps/web/actions/tenant/rollback-upgrade.ts:164:  eventType: string;
apps/web/actions/tenant/rollback-upgrade.ts:169:       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/tenant/rollback-upgrade.ts:171:    [orgId, eventType, aggregateId, JSON.stringify(payload)],
apps/web/actions/reference/csv.test.ts:83:  outboxEntries: Array<{ event_type: string }>;
apps/web/actions/reference/csv.test.ts:161:      currentClient.outboxEntries.some((entry) => entry.event_type === 'reference.csv.committed'),
apps/web/actions/reference/csv.test.ts:265:  const outboxEntries: Array<{ event_type: string }> = [];
apps/web/actions/reference/csv.test.ts:323:        const eventType = String(params[1] ?? '');
apps/web/actions/reference/csv.test.ts:324:        outboxEntries.push({ event_type: eventType });
apps/web/actions/reference/manufacturing-ops/reset-to-seed.ts:116:        eventType: 'manufacturing_operations.reset_to_seed',
apps/web/actions/reference/manufacturing-ops/reset-to-seed.ts:178:  params: { orgId: string; eventType: string; aggregateId: string; payload: unknown },
apps/web/actions/reference/manufacturing-ops/reset-to-seed.ts:182:       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/reference/manufacturing-ops/reset-to-seed.ts:184:    [params.orgId, params.eventType, params.aggregateId, JSON.stringify(params.payload)],
apps/web/actions/reference/manufacturing-ops.test.ts:34:  outboxEntries: Array<{ event_type: string }>;
apps/web/actions/reference/manufacturing-ops.test.ts:150:        const eventType = String(params[1] ?? '');
apps/web/actions/reference/manufacturing-ops.test.ts:151:        client.outboxEntries.push({ event_type: eventType });
apps/web/actions/reference/manufacturing-ops.test.ts:286:    expect(currentClient.outboxEntries.some((entry) => entry.event_type === 'manufacturing_operations.created')).toBe(true);
apps/web/actions/reference/manufacturing-ops.test.ts:304:    expect(currentClient.outboxEntries.some((entry) => entry.event_type === 'manufacturing_operations.updated')).toBe(true);
apps/web/actions/reference/manufacturing-ops.test.ts:339:    expect(currentClient.outboxEntries.some((entry) => entry.event_type === 'manufacturing_operations.deactivated')).toBe(true);
apps/web/actions/reference/manufacturing-ops.test.ts:384:    expect(currentClient.outboxEntries.some((entry) => entry.event_type === 'manufacturing_operations.reset_to_seed')).toBe(true);
apps/web/actions/reference/import-csv.ts:253:        eventType: 'reference.csv.committed',
apps/web/actions/reference/import-csv.ts:499:  params: { orgId: string; eventType: string; aggregateId: string; payload: unknown },
apps/web/actions/reference/import-csv.ts:503:       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/reference/import-csv.ts:505:    [params.orgId, params.eventType, params.aggregateId, JSON.stringify(params.payload)],
apps/web/actions/reference/soft-delete.ts:83:        eventType: 'reference.row.soft_deleted',
apps/web/actions/reference/soft-delete.ts:220:  params: { orgId: string; eventType: string; aggregateType: string; aggregateId: string; payload: unknown },
apps/web/actions/reference/soft-delete.ts:224:       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/reference/soft-delete.ts:226:    [params.orgId, params.eventType, params.aggregateType, params.aggregateId, JSON.stringify(params.payload)],
apps/web/actions/users/invite.behavior.test.ts:46:  outboxEvents: Array<{ event_type: string; payload: Record<string, unknown> }>;
apps/web/actions/users/invite.behavior.test.ts:100:          event_type: params[1] as string,
apps/web/actions/modules/toggle.ts:102:      const eventType = input.enabled ? 'settings.module.enabled' : 'settings.module.disabled';
apps/web/actions/modules/toggle.ts:105:           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/modules/toggle.ts:109:          eventType,
apps/web/actions/users/invite.ts:187:           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/users/invitations-lifecycle.test.ts:144:function eventType(params: unknown[]): string | undefined {
apps/web/actions/users/invitations-lifecycle.test.ts:342:    expect(currentClient.outboxEvents.map((call) => eventType(call.params))).toContain('settings.user.invitation_resent');
apps/web/actions/users/invitations-lifecycle.test.ts:355:    expect(currentClient.outboxEvents.map((call) => eventType(call.params))).toContain('settings.user.invitation_resent');
apps/web/actions/users/invitations-lifecycle.test.ts:370:    expect(currentClient.outboxEvents.map((call) => eventType(call.params))).toContain('settings.user.invitation_revoked');
apps/web/actions/authorization/authorization-policy.test.ts:229:    expect(auditSql).not.toContain('event_type');
apps/web/actions/users/deactivate.ts:88:           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/authorization/policy-actions.ts:113:           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/users/assign-role.ts:103:           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/users/admin-actions.test.ts:30:function expectOutboxAfterGuard(source: string, guardIndex: number, eventType: string): void {
apps/web/actions/users/admin-actions.test.ts:31:  const eventIndex = source.indexOf(eventType);
apps/web/actions/users/admin-actions.test.ts:32:  expect(eventIndex, `expected outbox event ${eventType}`).toBeGreaterThan(guardIndex);
apps/web/actions/users/invitations-lifecycle.ts:207:  eventType: 'settings.user.invitation_resent' | 'settings.user.invitation_revoked',
apps/web/actions/users/invitations-lifecycle.ts:212:       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/actions/users/invitations-lifecycle.ts:223:      OUTBOX_EVENT_BY_LIFECYCLE_ACTION[eventType],
apps/web/actions/users/invitations-lifecycle.ts:225:      eventType,
apps/web/app/[locale]/(app)/(admin)/settings/company/page.tsx:157:           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/app/[locale]/(app)/(admin)/settings/infra/locations/page.tsx:347:        `insert into public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/app/[locale]/(app)/(admin)/settings/units/_actions/manage-units.ts:120:  params: { orgId: string; eventType: string; aggregateId: string; payload: unknown },
apps/web/app/[locale]/(app)/(admin)/settings/units/_actions/manage-units.ts:124:       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/app/[locale]/(app)/(admin)/settings/units/_actions/manage-units.ts:126:    [params.orgId, params.eventType, params.aggregateId, JSON.stringify(params.payload), APP_VERSION],
apps/web/app/[locale]/(app)/(admin)/settings/units/_actions/manage-units.ts:164:        eventType: 'unit_of_measure.created',
apps/web/app/[locale]/(app)/(admin)/settings/units/_actions/manage-units.ts:213:        eventType: 'unit_of_measure.conversion_created',
apps/web/app/[locale]/(app)/(admin)/settings/units/_actions/manage-units.ts:262:        eventType: 'unit_of_measure.soft_deleted',
apps/web/app/[locale]/(app)/(admin)/settings/promotions/_actions/submitPromotion.ts:21: * Outbox: the canonical outbox_events.event_type CHECK (migration 003) does not
apps/web/app/[locale]/(app)/(admin)/settings/promotions/_actions/submitPromotion.ts:24: * (emitting an unlisted event_type would violate the CHECK and roll back the
apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.tsx:62:const OUTBOX_NOTIFICATION_RULE_EVENT = 'settings.notification_rule_updated';
apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.tsx:63:const OUTBOX_NOTIFICATION_CHANNEL_EVENT = 'settings.notification_channel_updated';
apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.tsx:64:const OUTBOX_NOTIFICATION_DIGEST_EVENT = 'settings.notification_digest_updated';
apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.tsx:116:  const t = (await getTranslations({ locale, namespace: 'settings.notifications' })) as Translator;
apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.tsx:198:              and event_type like 'notification.%'
apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.tsx:275:  eventType: string,
apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.tsx:279:    `insert into public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.tsx:281:    [orgId, eventType, JSON.stringify(payload), OUTBOX_APP_VERSION],
apps/web/app/[locale]/(app)/(admin)/settings/notifications/notifications-screen.client.tsx:44:  outboxEventType: 'settings.notification_rule_updated';
apps/web/app/[locale]/(app)/(admin)/settings/notifications/notifications-screen.client.tsx:51:  outboxEventType: 'settings.notification_channel_updated';
apps/web/app/[locale]/(app)/(admin)/settings/notifications/notifications-screen.client.tsx:58:  outboxEventType: 'settings.notification_digest_updated';
apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.test.tsx:96:type ToggleRuleResult = { ok: true; ruleId: string; enabled: boolean; outboxEventType: 'settings.notification_rule_updated' };
apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.test.tsx:211:      outboxEventType: 'settings.notification_rule_updated',
apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.test.tsx:422:      outboxEventType: 'settings.notification_rule_updated',
apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.test.tsx:440:      outboxEventType: 'settings.notification_rule_updated',

exec
/bin/zsh -lc "sed -n '80,115p' apps/web/actions/flags/set-core.ts" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 succeeded in 0ms:
          where org_id = app.current_org_id()
            and flag_code = $3
        returning flag_code, is_enabled`,
        [input.enabled, userId, input.flagCode],
      );
      const flag = updated.rows[0];
      if ((updated.rowCount ?? updated.rows.length) < 1 || !flag) {
        return { ok: false, error: 'flag_not_found' };
      }

      await client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1::uuid, $2, $3, null, $4::jsonb, $5)`,
        [
          orgId,
          'settings.core_flag.updated',
          'core_flag',
          JSON.stringify({
            org_id: orgId,
            flag_code: flag.flag_code,
            enabled: flag.is_enabled,
            actor_user_id: userId,
            audit_reason: input.auditReason,
          }),
          'settings-set-core-flag-v1',
        ],
      );

      revalidatePath('/settings/flags');
      return { ok: true, data: { flagCode: flag.flag_code, enabled: flag.is_enabled } };
    } catch (error) {
      if (error === FORBIDDEN) {
        return { ok: false, error: 'forbidden' };
      }
      return { ok: false, error: 'persistence_failed' };

exec
/bin/zsh -lc "sed -n '80,120p' apps/web/actions/modules/toggle.ts" in /Users/mariuszkrawczyk/Projects/monopilot-kira
exec
/bin/zsh -lc "sed -n '100,145p' apps/web/actions/orgs/create.ts" in /Users/mariuszkrawczyk/Projects/monopilot-kira
exec
/bin/zsh -lc "sed -n '70,120p' apps/web/actions/authorization/policy-actions.ts" in /Users/mariuszkrawczyk/Projects/monopilot-kira
 succeeded in 0ms:
          client,
          moduleByCode,
          moduleCode: input.moduleCode,
        });
        if (blockingModules.length > 0) {
          return { ok: false, error: 'dependency_enabled', blockingModules };
        }
      }

      const updated = await client.query<OrganizationModuleRow>(
        `update public.organization_modules
            set enabled = $1,
                updated_at = now()
          where module_code = $2
            and org_id = app.current_org_id()
        returning module_code, enabled`,
        [input.enabled, input.moduleCode],
      );
      if ((updated.rowCount ?? updated.rows.length) < 1) {
        return { ok: false, error: 'module_not_found' };
      }

      const eventType = input.enabled ? 'settings.module.enabled' : 'settings.module.disabled';
      await client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1::uuid, $2, $3, null, $4::jsonb, $5)`,
        [
          orgId,
          eventType,
          'module',
          JSON.stringify({
            org_id: orgId,
            module_code: input.moduleCode,
            enabled: input.enabled,
            actor_user_id: userId,
            force: input.force,
            auditReason: input.auditReason,
          }),
          'settings-toggle-module-v1',
        ],

 succeeded in 0ms:
         $1::uuid,
         role_seed.code,
         role_seed.name,
         role_seed.permissions::jsonb,
         true,
         role_seed.display_order
       from jsonb_to_recordset($2::jsonb) as role_seed(
         code text,
         name text,
         permissions jsonb,
         display_order int
       )`,
      [organization.id, JSON.stringify(buildRoleSeedRows())],
    );

    await client.query(
      `insert into public.tenant_variations
         (org_id, dept_overrides, rule_variant_overrides, feature_flags, schema_extensions_count)
       values ($1::uuid, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 0)`,
      [organization.id],
    );

    await client.query(
      `insert into public.outbox_events
         (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
       values ($1::uuid, $2, $3, $4::uuid, $5::jsonb, $6)`,
      [
        organization.id,
        'org.created',
        'org',
        organization.id,
        JSON.stringify({ org_id: organization.id, slug: organization.slug }),
        'settings-create-organization-v1',
      ],
    );

    await client.query('COMMIT');
    return { ok: true, data: { orgId: organization.id, slug: organization.slug } };
  } catch (error) {
    await rollbackQuietly(client);
    if (isDuplicateSlugError(error)) {
      return { ok: false, error: 'SLUG_TAKEN' };
    }
    return { ok: false, error: 'PERSISTENCE_FAILED' };
  } finally {
    client.release();

 succeeded in 0ms:
        [
          parsed.policyCode,
          nullableBoolean(parsed.patch.is_enabled ?? parsed.patch.enabled),
          nullableStringArray(parsed.patch.request_permissions),
          nullableStringArray(parsed.patch.authorize_permissions),
          nullableStringArray(parsed.patch.approver_role_codes),
          nullableInteger(parsed.patch.min_approvers),
          nullableBoolean(parsed.patch.require_segregation_of_duties),
          nullableBoolean(parsed.patch.requires_new_version),
          nullableString(parsed.patch.approval_gate_rule_code),
          parsed.patch.settings_json ? JSON.stringify(parsed.patch.settings_json) : null,
          userId,
        ],
      );
      const row = updated.rows[0];
      if ((updated.rowCount ?? updated.rows.length) < 1 || !row) return { ok: false, error: 'policy_not_found' };

      const nextVersion = toNumber(row.version);
      const requestId = randomUUID();

      await client.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            after_state, request_id, retention_class)
         values ($1::uuid, $2::uuid, 'user', $3, $4, $5, $6::jsonb, $7::uuid, 'security')`,
        [
          orgId,
          userId,
          'authorization_policy_update',
          'org_authorization_policy',
          parsed.policyCode,
          JSON.stringify({
            policy_code: parsed.policyCode,
            previous_version: toNumber(current.version ?? 0),
            version: nextVersion,
            audit_reason: parsed.auditReason,
          }),
          requestId,
        ],
      );

      await client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1::uuid, $2, $3, $4::uuid, $5::jsonb, $6)`,
        [
          orgId,
          'audit.recorded',
          'org_authorization_policy',
          orgId,
          JSON.stringify({

codex
**Findings**

- P1 [063-org-authorization-policies.sql:101](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/063-org-authorization-policies.sql:101): `SECURITY DEFINER` seed function is publicly executable by default; any role can call `seed_authorization_policies_for_org(<other_org>)` and bypass RLS to write cross-org policy/rule seed rows. Suggested fix: `revoke execute on function ... from public, app_user`; same for trigger wrapper if callable.
- P1 [064-unit-of-measure.sql:113](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/064-unit-of-measure.sql:113): same unsafe public-executable `SECURITY DEFINER` seed function lets callers seed arbitrary org UoM rows outside `app.current_org_id()`. Revoke execute.
- P2 [064-unit-of-measure.sql:55](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/064-unit-of-measure.sql:55): `uom_custom_conversions` has `from_unit_code`/`to_unit_code` but no composite FK to `unit_of_measure(org_id, code)`, so conversions can reference nonexistent units. Add composite FKs or enforce in trigger.
- P1 [065-d365-sync-runs.sql:25](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/065-d365-sync-runs.sql:25): `direction in ('pull','push')` violates the project D365 export-only red line; schema admits import/pull sync state. Suggested fix: restrict to export/push-only naming.
- P1 [067-feature-flags-core.sql:57](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/067-feature-flags-core.sql:57): same unsafe public-executable `SECURITY DEFINER` seed function can seed another org’s flags by arbitrary `p_org_id`. Revoke execute.
- P2 [068-login-attempts.sql:34](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/068-login-attempts.sql:34): nullable `org_id` rows are intentionally invisible to `app_user`, but the table still grants `insert/update/delete` to `app_user`; unknown-email/null-org attempts cannot be inserted under this policy, while org-scoped attempts can be client-written. If only service/owner should write login attempts, do not grant app_user writes or split read/write policies.
- P1 [070-notification-preferences.sql:23](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/070-notification-preferences.sql:23): RLS is enabled/forced, but the migration never `revoke all ... from public` or grants `app_user` access, violating the migration law and risking runtime denial or default-privilege drift.
- P1 [070-notification-preferences.sql:37](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/070-notification-preferences.sql:37): replacing `outbox_events_event_type_check` is not union-complete with `packages/outbox/src/events.enum.ts` and current emitters. Missing examples include `settings.core_flag.updated`, `settings.module.enabled`, `settings.module.disabled`, `unit_of_measure.created`, `unit_of_measure.conversion_created`, `unit_of_measure.soft_deleted`, plus many enum members such as `settings.org.updated`, `settings.sso.config_changed`, `settings.scim.token_created`. These actions will 23514 and roll back.

**Correct**

- [066-email-delivery-log.sql](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/066-email-delivery-log.sql:1): correct org_id scope, forced RLS via `app.current_org_id()`, public revoke, app_user grant, checks, and org-first indexes.
- [069-modules-description.sql](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/069-modules-description.sql:1): correct as additive catalog/`organization_modules.updated_at` migration; existing RLS/grants are established in prior migrations.
tokens used
81,038
**Findings**

- P1 [063-org-authorization-policies.sql:101](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/063-org-authorization-policies.sql:101): `SECURITY DEFINER` seed function is publicly executable by default; any role can call `seed_authorization_policies_for_org(<other_org>)` and bypass RLS to write cross-org policy/rule seed rows. Suggested fix: `revoke execute on function ... from public, app_user`; same for trigger wrapper if callable.
- P1 [064-unit-of-measure.sql:113](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/064-unit-of-measure.sql:113): same unsafe public-executable `SECURITY DEFINER` seed function lets callers seed arbitrary org UoM rows outside `app.current_org_id()`. Revoke execute.
- P2 [064-unit-of-measure.sql:55](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/064-unit-of-measure.sql:55): `uom_custom_conversions` has `from_unit_code`/`to_unit_code` but no composite FK to `unit_of_measure(org_id, code)`, so conversions can reference nonexistent units. Add composite FKs or enforce in trigger.
- P1 [065-d365-sync-runs.sql:25](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/065-d365-sync-runs.sql:25): `direction in ('pull','push')` violates the project D365 export-only red line; schema admits import/pull sync state. Suggested fix: restrict to export/push-only naming.
- P1 [067-feature-flags-core.sql:57](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/067-feature-flags-core.sql:57): same unsafe public-executable `SECURITY DEFINER` seed function can seed another org’s flags by arbitrary `p_org_id`. Revoke execute.
- P2 [068-login-attempts.sql:34](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/068-login-attempts.sql:34): nullable `org_id` rows are intentionally invisible to `app_user`, but the table still grants `insert/update/delete` to `app_user`; unknown-email/null-org attempts cannot be inserted under this policy, while org-scoped attempts can be client-written. If only service/owner should write login attempts, do not grant app_user writes or split read/write policies.
- P1 [070-notification-preferences.sql:23](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/070-notification-preferences.sql:23): RLS is enabled/forced, but the migration never `revoke all ... from public` or grants `app_user` access, violating the migration law and risking runtime denial or default-privilege drift.
- P1 [070-notification-preferences.sql:37](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/070-notification-preferences.sql:37): replacing `outbox_events_event_type_check` is not union-complete with `packages/outbox/src/events.enum.ts` and current emitters. Missing examples include `settings.core_flag.updated`, `settings.module.enabled`, `settings.module.disabled`, `unit_of_measure.created`, `unit_of_measure.conversion_created`, `unit_of_measure.soft_deleted`, plus many enum members such as `settings.org.updated`, `settings.sso.config_changed`, `settings.scim.token_created`. These actions will 23514 and roll back.

**Correct**

- [066-email-delivery-log.sql](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/066-email-delivery-log.sql:1): correct org_id scope, forced RLS via `app.current_org_id()`, public revoke, app_user grant, checks, and org-first indexes.
- [069-modules-description.sql](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/069-modules-description.sql:1): correct as additive catalog/`organization_modules.updated_at` migration; existing RLS/grants are established in prior migrations.

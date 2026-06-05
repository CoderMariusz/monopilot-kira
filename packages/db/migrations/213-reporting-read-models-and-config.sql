-- Migration 213: 12-Reporting — schema foundation (READ-MOSTLY CONSUMER).
--   (A) Report-config / saved-report / scheduled-export-shell + support tables that 12-reporting OWNS:
--       report_definitions, saved_report_configs, scheduled_export_configs, saved_filter_presets,
--       dashboards_catalog, report_exports, mv_refresh_log, report_access_audits.
--   (B) Cross-module FACT materialized views over the canonical producers (READ-ONLY — reporting
--       NEVER writes/owns these): mv_reporting_production_throughput (08 wo_outputs),
--       mv_reporting_yield_by_line_week (08 wo_outputs + wo_material_consumption),
--       mv_reporting_oee_rollup (08 oee_snapshots, READ), mv_reporting_quality_hold_rate
--       (09 quality_holds + quality_hold_items), mv_reporting_downtime_by_line (08 downtime_events),
--       mv_reporting_schedule_adherence (04 schedule_outputs), mv_reporting_inventory_aging
--       (05 license_plates).
--
-- PRD: docs/prd/12-REPORTING-PRD.md §3/§11 (RBAC), §6 D-RPT-1/3/7/9 (KPI sources + weighted avg),
--   §9.1 (MV definitions), §9.2 (support tables), §9.3 (dashboards_catalog), §12 (read-only consumer:
--   "12-REPORTING NIE produkuje eventow" — no fact events), §14.1 (BRCGS 7y export retention),
--   §15.1a (saved_filter_presets).
-- Tasks: T-003 (yield/factory MVs), T-004 (support tables), T-006 (qc/downtime MVs), T-007 (operational
--   MVs), T-008 (presets + catalog), T-014 (integration/rules MVs — config rows here, UNION MVs are a
--   later forward-script once all outbox tables land).
--
-- Wave0 lock: org_id is the business scope (NOT tenant_id even where the PRD §9.2/§15.1a labels say
--   tenant_id — Wave0 v4.3 decision #1 overrides); RLS via app.current_org_id() (foundation function,
--   migration 002 — never a raw current_setting GUC).
-- site_id day-1: site_id uuid is NULLABLE, no FK, no registry on every operational config table —
--   full per-site scoping lands later via 14-multi-site.
-- NUMERIC-exact: every money/qty/yield/percentage column is NUMERIC (never float/double).
-- Audit (R13): embedded created_by/created_at/updated_at + a local set_updated_at trigger (matches the
--   production/warehouse/quality migrations 181-198 — this repo has no generic app.audit_event()).
-- CANONICAL-OWNER SEPARATION (the load-bearing assertion of this module): this migration creates ONLY
--   reporting-owned config tables + materialized VIEWS/views. It creates NO base copy of wo_outputs /
--   wo_material_consumption / oee_snapshots / downtime_events (08-production), schedule_outputs
--   (04-planning), license_plates (05-warehouse), quality_holds / quality_hold_items (09-quality).
--   The MVs READ those producer tables; they never duplicate or shadow them.

-- ===========================================================================
-- app_reporting_role — the read-only role the MVs grant SELECT to (REVOKE PUBLIC). app_user is
--   GRANTed membership so the application connection can read the read-models, while direct grants to
--   PUBLIC are withheld per the §5 security model. Created idempotently; harmless if it already exists.
-- ===========================================================================
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_reporting_role') then
    create role app_reporting_role nologin;
  end if;
end
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user')
     and exists (select 1 from pg_roles where rolname = 'app_reporting_role') then
    execute 'grant app_reporting_role to app_user';
  end if;
end
$$;

-- ===========================================================================
-- (A.1) report_definitions — versioned report/dashboard definition catalog OWNED by reporting.
--   Each row binds a logical report to its source MV + the KPI glossary keys it renders + its required
--   read permission. This is reporting's own config — NOT a producer fact table.
-- ===========================================================================
create table if not exists public.report_definitions (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  site_id            uuid,                                  -- day-1 nullable
  report_key         text not null,
  name               text not null,
  description        text,
  category           text not null default 'dashboard',
  source_view        text,                                  -- the mv_reporting_* / v_reporting_* read model
  kpi_keys           jsonb not null default '[]'::jsonb,    -- KPI glossary keys rendered (T-002 SSOT)
  required_permission text not null default 'rpt.dashboard.view',
  phase              text not null default 'P1',
  is_active          boolean not null default true,
  config_jsonb       jsonb not null default '{}'::jsonb,
  ext_jsonb          jsonb not null default '{}'::jsonb,
  created_by         uuid references public.users(id) on delete set null,
  updated_by         uuid references public.users(id) on delete set null,
  created_at         timestamptz not null default pg_catalog.now(),
  updated_at         timestamptz not null default pg_catalog.now(),

  constraint report_definitions_org_key_uq unique (org_id, report_key),
  constraint report_definitions_category_check check (
    category in ('dashboard', 'tabular', 'export', 'kpi_tile', 'admin')
  ),
  constraint report_definitions_phase_check check (phase in ('P1', 'P2', 'P3'))
);

create index if not exists idx_report_definitions_org on public.report_definitions (org_id);
create index if not exists idx_report_definitions_org_site on public.report_definitions (org_id, site_id);
create index if not exists idx_report_definitions_active
  on public.report_definitions (org_id, is_active) where is_active;

alter table public.report_definitions enable row level security;
alter table public.report_definitions force row level security;
drop policy if exists report_definitions_org_context on public.report_definitions;
create policy report_definitions_org_context
  on public.report_definitions for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.report_definitions from public;
revoke all on public.report_definitions from app_user;
grant select, insert, update, delete on public.report_definitions to app_user;

-- ===========================================================================
-- (A.2) saved_report_configs — a user's saved view/column/sort config for a report (reporting-owned).
-- ===========================================================================
create table if not exists public.saved_report_configs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  site_id       uuid,
  user_id       uuid not null references public.users(id) on delete cascade,
  report_key    text not null,
  name          text not null,
  slug          text not null,
  config_jsonb  jsonb not null default '{}'::jsonb,
  visibility    text not null default 'just_me',
  is_default    boolean not null default false,
  ext_jsonb     jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default pg_catalog.now(),
  updated_at    timestamptz not null default pg_catalog.now(),

  constraint saved_report_configs_user_report_slug_uq unique (org_id, user_id, report_key, slug),
  constraint saved_report_configs_visibility_check check (visibility in ('just_me', 'my_team', 'org'))
);

create index if not exists idx_saved_report_configs_org on public.saved_report_configs (org_id);
create index if not exists idx_saved_report_configs_user
  on public.saved_report_configs (org_id, user_id, report_key);

alter table public.saved_report_configs enable row level security;
alter table public.saved_report_configs force row level security;
drop policy if exists saved_report_configs_org_context on public.saved_report_configs;
create policy saved_report_configs_org_context
  on public.saved_report_configs for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.saved_report_configs from public;
revoke all on public.saved_report_configs from app_user;
grant select, insert, update, delete on public.saved_report_configs to app_user;

-- ===========================================================================
-- (A.3) scheduled_export_configs — P2 scheduled-export SHELL (flag-gated at the rule layer). Holds the
--   cron expression + delivery channel; the runner is a later task. Reporting-owned config.
-- ===========================================================================
create table if not exists public.scheduled_export_configs (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  site_id           uuid,
  user_id           uuid not null references public.users(id) on delete cascade,
  report_key        text not null,
  name              text not null,
  cron_expression   text not null,
  format            text not null default 'pdf',
  delivery_channel  text not null default 'email',
  delivery_target   jsonb not null default '{}'::jsonb,
  filters           jsonb not null default '{}'::jsonb,
  is_enabled        boolean not null default false,
  last_run_at       timestamptz,
  next_run_at       timestamptz,
  ext_jsonb         jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default pg_catalog.now(),
  updated_at        timestamptz not null default pg_catalog.now(),

  constraint scheduled_export_configs_format_check check (format in ('pdf', 'csv', 'xlsx', 'json')),
  constraint scheduled_export_configs_channel_check check (
    delivery_channel in ('email', 'webhook', 'storage')
  )
);

create index if not exists idx_scheduled_export_configs_org on public.scheduled_export_configs (org_id);
create index if not exists idx_scheduled_export_configs_due
  on public.scheduled_export_configs (next_run_at) where is_enabled;

alter table public.scheduled_export_configs enable row level security;
alter table public.scheduled_export_configs force row level security;
drop policy if exists scheduled_export_configs_org_context on public.scheduled_export_configs;
create policy scheduled_export_configs_org_context
  on public.scheduled_export_configs for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.scheduled_export_configs from public;
revoke all on public.scheduled_export_configs from app_user;
grant select, insert, update, delete on public.scheduled_export_configs to app_user;

-- ===========================================================================
-- (A.4) saved_filter_presets — P1 per-user filter preset (T-008, §15.1a). org_id NOT tenant_id.
-- ===========================================================================
create table if not exists public.saved_filter_presets (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  site_id       uuid,
  user_id       uuid not null references public.users(id) on delete cascade,
  dashboard_id  text not null,
  name          text not null,
  slug          text not null,
  filters       jsonb not null default '{}'::jsonb,
  visibility    text not null default 'just_me',
  created_at    timestamptz not null default pg_catalog.now(),
  updated_at    timestamptz not null default pg_catalog.now(),

  constraint saved_filter_presets_user_dash_slug_uq unique (org_id, user_id, dashboard_id, slug),
  constraint saved_filter_presets_visibility_check check (visibility in ('just_me', 'my_team'))
);

create index if not exists idx_saved_filter_presets_org on public.saved_filter_presets (org_id);
create index if not exists idx_saved_filter_presets_user
  on public.saved_filter_presets (org_id, user_id, dashboard_id);

alter table public.saved_filter_presets enable row level security;
alter table public.saved_filter_presets force row level security;
drop policy if exists saved_filter_presets_org_context on public.saved_filter_presets;
create policy saved_filter_presets_org_context
  on public.saved_filter_presets for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.saved_filter_presets from public;
revoke all on public.saved_filter_presets from app_user;
grant select, insert, update, delete on public.saved_filter_presets to app_user;

-- ===========================================================================
-- (A.5) dashboards_catalog — GLOBAL metadata registry of dashboards (T-008, §9.3). No org_id — gated
--   by feature_flag + enabled_for_orgs[] + RBAC at the rule layer. Seeded with the 10 P1 dashboards.
-- ===========================================================================
create table if not exists public.dashboards_catalog (
  id               text primary key,
  name             text not null,
  description      text,
  phase            text not null default 'P1',
  required_role    text not null,
  feature_flag     text,
  metadata_schema  jsonb not null default '{}'::jsonb,
  enabled_for_orgs uuid[] not null default '{}'::uuid[],
  version          text not null default 'v3.0',
  created_at       timestamptz not null default pg_catalog.now(),

  constraint dashboards_catalog_phase_check check (phase in ('P1', 'P2', 'P3'))
);

-- Global reference table — readable by every authenticated app_user (RBAC gates the actual page at the
-- rule/service layer). No RLS (no org_id); REVOKE PUBLIC + GRANT SELECT to app_user only.
revoke all on public.dashboards_catalog from public;
grant select on public.dashboards_catalog to app_user;

insert into public.dashboards_catalog (id, name, description, phase, required_role, feature_flag) values
  ('factory-overview',   'Factory Overview',        'Plant-wide KPI overview',          'P1', 'rpt.dashboard.view',     null),
  ('yield-by-line',      'Yield by Line',           'Yield % per line per week',         'P1', 'rpt.dashboard.view',     null),
  ('yield-by-sku',       'Yield by SKU',            'Yield % per SKU per week',          'P1', 'rpt.dashboard.view',     null),
  ('qc-holds',           'QC Holds',                'Quality holds summary',             'P1', 'rpt.dashboard.view',     null),
  ('oee-summary',        'OEE Summary',             'OEE rollup (consumer of 15-OEE)',   'P1', 'rpt.dashboard.view',     null),
  ('inventory-aging',    'Inventory Aging',         'LP age buckets',                    'P1', 'rpt.dashboard.view',     null),
  ('wo-status',          'WO Status',               'Work-order status summary',         'P1', 'rpt.dashboard.view',     null),
  ('shipment-otd',       'Shipment OTD',            'On-time-delivery weekly',           'P1', 'rpt.dashboard.view',     null),
  ('integration-health', 'Integration Health',      'Cross-outbox health',               'P1', 'rpt.integration.read',   null),
  ('rules-usage',        'Rules Usage Analytics',   'DSL rule evaluation analytics',     'P1', 'rpt.rules_usage.read',   null)
on conflict (id) do nothing;

-- ===========================================================================
-- (A.6) report_exports — export audit trail with GENERATED 7-year BRCGS retention (T-004, §9.2/§14.1).
--   org_id NOT tenant_id. sha256_hash NOT NULL (V-RPT-EXPORT-2). retention_until is GENERATED STORED on
--   the immutable exported_at default so auditors cannot tamper post-insert.
-- ===========================================================================
create table if not exists public.report_exports (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations(id) on delete cascade,
  site_id                 uuid,
  user_id                 uuid not null references public.users(id) on delete restrict,
  dashboard_id            text not null,
  report_type             text not null,
  date_range              jsonb not null,
  filters                 jsonb,
  format                  text not null,
  file_size_bytes         bigint,
  sha256_hash             text not null,
  status                  text not null default 'generating',
  error_message           text,
  exported_at             timestamptz not null default pg_catalog.now(),
  -- retention_until = exported_at(UTC-date) + 7y, GENERATED STORED for BRCGS-immutable audit. The
  -- generation expression must be IMMUTABLE: `timestamptz + interval` and `timestamptz::date` are only
  -- STABLE (timezone-dependent), so we normalize to a UTC date first ((exported_at at time zone 'UTC')
  -- is timestamp, ::date is immutable) and add the interval on the resulting date (date + interval is
  -- immutable). exported_at is insert-only (never updated), so the stored value is fixed at insert.
  retention_until         date generated always as
    ((((exported_at at time zone 'UTC')::date) + interval '7 years')::date) stored,
  archived_to_cold_storage boolean not null default false,

  constraint report_exports_format_check check (format in ('pdf', 'csv', 'xlsx', 'json')),
  constraint report_exports_status_check check (status in ('generating', 'completed', 'failed'))
);

create index if not exists idx_report_exports_org on public.report_exports (org_id);
create index if not exists idx_report_exports_user on public.report_exports (org_id, user_id, exported_at desc);
create index if not exists idx_report_exports_retention
  on public.report_exports (retention_until) where archived_to_cold_storage = false;

alter table public.report_exports enable row level security;
alter table public.report_exports force row level security;
drop policy if exists report_exports_org_context on public.report_exports;
create policy report_exports_org_context
  on public.report_exports for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.report_exports from public;
revoke all on public.report_exports from app_user;
grant select, insert, update, delete on public.report_exports to app_user;

-- ===========================================================================
-- (A.7) mv_refresh_log — MV refresh telemetry (T-004, §9.2). duration_ms is a GENERATED STORED column.
-- ===========================================================================
create table if not exists public.mv_refresh_log (
  id              bigserial primary key,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  site_id         uuid,
  view_name       text not null,
  started_at      timestamptz not null default pg_catalog.now(),
  completed_at    timestamptz,
  rows_affected   bigint,
  duration_ms     integer generated always as (
    case when completed_at is not null
      then (extract(epoch from (completed_at - started_at)) * 1000)::integer
    end
  ) stored,
  status          text not null default 'started',
  error_message   text,

  constraint mv_refresh_log_status_check check (
    status in ('started', 'completed', 'failed', 'deferred_source_missing')
  )
);

create index if not exists idx_mv_refresh_log_org on public.mv_refresh_log (org_id);
create index if not exists idx_mv_refresh_log_view on public.mv_refresh_log (view_name, started_at desc);

alter table public.mv_refresh_log enable row level security;
alter table public.mv_refresh_log force row level security;
drop policy if exists mv_refresh_log_org_context on public.mv_refresh_log;
create policy mv_refresh_log_org_context
  on public.mv_refresh_log for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.mv_refresh_log from public;
revoke all on public.mv_refresh_log from app_user;
grant select, insert, update, delete on public.mv_refresh_log to app_user;

-- ===========================================================================
-- (A.8) report_access_audits — access allow/deny audit (T-004, §9.2, V-RPT-ACCESS-2/3).
-- ===========================================================================
create table if not exists public.report_access_audits (
  id            bigserial primary key,
  org_id        uuid not null references public.organizations(id) on delete cascade,
  site_id       uuid,
  user_id       uuid not null references public.users(id) on delete cascade,
  dashboard_id  text not null,
  result        text not null,
  deny_reason   text,
  accessed_at   timestamptz not null default pg_catalog.now(),
  ip_address    inet,
  user_agent    text,

  constraint report_access_audits_result_check check (result in ('allow', 'deny'))
);

create index if not exists idx_report_access_audits_org on public.report_access_audits (org_id);
create index if not exists idx_report_access_audits_user
  on public.report_access_audits (org_id, user_id, accessed_at desc);

alter table public.report_access_audits enable row level security;
alter table public.report_access_audits force row level security;
drop policy if exists report_access_audits_org_context on public.report_access_audits;
create policy report_access_audits_org_context
  on public.report_access_audits for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.report_access_audits from public;
revoke all on public.report_access_audits from app_user;
grant select, insert, update, delete on public.report_access_audits to app_user;

-- ===========================================================================
-- set_updated_at trigger (R13 embedded-audit) — reused across the reporting config tables that carry
-- an updated_at column.
-- ===========================================================================
create or replace function public.reporting_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists report_definitions_set_updated_at on public.report_definitions;
create trigger report_definitions_set_updated_at
  before update on public.report_definitions
  for each row execute function public.reporting_set_updated_at();

drop trigger if exists saved_report_configs_set_updated_at on public.saved_report_configs;
create trigger saved_report_configs_set_updated_at
  before update on public.saved_report_configs
  for each row execute function public.reporting_set_updated_at();

drop trigger if exists scheduled_export_configs_set_updated_at on public.scheduled_export_configs;
create trigger scheduled_export_configs_set_updated_at
  before update on public.scheduled_export_configs
  for each row execute function public.reporting_set_updated_at();

drop trigger if exists saved_filter_presets_set_updated_at on public.saved_filter_presets;
create trigger saved_filter_presets_set_updated_at
  before update on public.saved_filter_presets
  for each row execute function public.reporting_set_updated_at();

-- ===========================================================================
-- (B) CROSS-MODULE FACT MATERIALIZED VIEWS — read-only over the canonical producers. REVOKE PUBLIC +
--   GRANT SELECT to app_reporting_role only. Each carries a UNIQUE index so REFRESH MATERIALIZED VIEW
--   CONCURRENTLY (the T-005 worker) works. org_id is selected through verbatim so the service layer can
--   filter `WHERE org_id = app.current_org_id()` (Postgres MVs cannot host RLS policies — §5 Techniczne).
--   site_id is carried for REC-L1 per-site filtering (NULL day-1).
--   These MVs READ, never own: dropping/recreating them never touches the producer tables.
-- ===========================================================================

-- (B.1) mv_reporting_production_throughput — daily kg output per line, from 08 wo_outputs (canonical).
drop materialized view if exists public.mv_reporting_production_throughput;
create materialized view public.mv_reporting_production_throughput as
  select
    o.org_id,
    o.site_id,
    -- site_key: NULL-safe site discriminator so the REFRESH-CONCURRENTLY unique index can be a
    -- PLAIN-COLUMN index (Postgres requires a non-partial unique index on the MV's own columns for
    -- CONCURRENTLY; a coalesce() expression index does not qualify). NULL site_id (day-1) maps to the
    -- zero-uuid so distinct grouping keys stay unique.
    coalesce(o.site_id, '00000000-0000-0000-0000-000000000000'::uuid)  as site_key,
    coalesce(wo.production_line_id::text, 'unassigned')                 as line_id,
    (o.registered_at at time zone 'UTC')::date                          as output_date,
    count(*)::bigint                                                    as output_count,
    sum(o.qty_kg)::numeric(18, 3)                                       as total_kg_output,
    sum(o.qty_kg) filter (where o.output_type = 'primary')::numeric(18, 3) as primary_kg_output
  from public.wo_outputs o
  left join public.work_orders wo on wo.id = o.wo_id
  group by o.org_id, o.site_id, coalesce(wo.production_line_id::text, 'unassigned'),
           (o.registered_at at time zone 'UTC')::date;

create unique index mv_reporting_production_throughput_pk
  on public.mv_reporting_production_throughput (org_id, site_key, line_id, output_date);
revoke all on public.mv_reporting_production_throughput from public;
revoke all on public.mv_reporting_production_throughput from app_user;
grant select on public.mv_reporting_production_throughput to app_reporting_role;

-- (B.2) mv_reporting_yield_by_line_week — weighted yield per line per ISO-Saturday week, from 08
--   wo_outputs (output kg) + wo_material_consumption (usage kg). yield_pct = output/usage*100
--   (NUMERIC-exact, weighted by kg per D-RPT-3 — the aggregate is sum(output)/sum(usage), i.e. mass-
--   weighted, not a mean of per-row ratios).
drop materialized view if exists public.mv_reporting_yield_by_line_week;
create materialized view public.mv_reporting_yield_by_line_week as
  with out_agg as (
    select
      o.org_id, o.site_id,
      coalesce(wo.production_line_id::text, 'unassigned')              as line_id,
      (date_trunc('week', (o.registered_at at time zone 'UTC'))
        + interval '5 days')::date                                    as week_ending,
      sum(o.qty_kg)::numeric(18, 3)                                   as kg_output
    from public.wo_outputs o
    left join public.work_orders wo on wo.id = o.wo_id
    group by o.org_id, o.site_id, coalesce(wo.production_line_id::text, 'unassigned'),
             (date_trunc('week', (o.registered_at at time zone 'UTC')) + interval '5 days')::date
  ),
  use_agg as (
    select
      c.org_id, c.site_id,
      coalesce(wo.production_line_id::text, 'unassigned')              as line_id,
      (date_trunc('week', (c.consumed_at at time zone 'UTC'))
        + interval '5 days')::date                                    as week_ending,
      sum(c.qty_consumed)::numeric(18, 3)                             as kg_usage
    from public.wo_material_consumption c
    left join public.work_orders wo on wo.id = c.wo_id
    group by c.org_id, c.site_id, coalesce(wo.production_line_id::text, 'unassigned'),
             (date_trunc('week', (c.consumed_at at time zone 'UTC')) + interval '5 days')::date
  )
  select
    coalesce(o.org_id, u.org_id)                                       as org_id,
    coalesce(o.site_id, u.site_id)                                     as site_id,
    coalesce(o.site_id, u.site_id, '00000000-0000-0000-0000-000000000000'::uuid) as site_key,
    coalesce(o.line_id, u.line_id)                                     as line_id,
    coalesce(o.week_ending, u.week_ending)                             as week_ending,
    coalesce(o.kg_output, 0)::numeric(18, 3)                           as kg_output,
    coalesce(u.kg_usage, 0)::numeric(18, 3)                            as kg_usage,
    case when coalesce(u.kg_usage, 0) > 0
      then round(coalesce(o.kg_output, 0) / u.kg_usage * 100, 2)
      else null end::numeric(7, 2)                                     as yield_pct
  from out_agg o
  full outer join use_agg u
    on o.org_id = u.org_id
   and o.line_id = u.line_id
   and o.week_ending = u.week_ending
   and o.site_id is not distinct from u.site_id;

create unique index mv_reporting_yield_by_line_week_pk
  on public.mv_reporting_yield_by_line_week (org_id, site_key, line_id, week_ending);
revoke all on public.mv_reporting_yield_by_line_week from public;
revoke all on public.mv_reporting_yield_by_line_week from app_user;
grant select on public.mv_reporting_yield_by_line_week to app_reporting_role;

-- (B.3) mv_reporting_oee_rollup — daily OEE rollup per line, READ-ONLY consumer of 08 oee_snapshots
--   (08-production is the canonical OEE producer per D-OEE-1; 15-OEE + 12-reporting are read-only).
--   Simple time-mean of the minute snapshots per day (the snapshot grain is per-minute).
drop materialized view if exists public.mv_reporting_oee_rollup;
create materialized view public.mv_reporting_oee_rollup as
  select
    s.org_id,
    s.site_id,
    coalesce(s.site_id, '00000000-0000-0000-0000-000000000000'::uuid)  as site_key,
    s.line_id,
    (s.snapshot_minute at time zone 'UTC')::date                       as oee_date,
    count(*)::bigint                                                    as snapshot_count,
    round(avg(s.availability_pct), 2)::numeric(5, 2)                   as avg_availability_pct,
    round(avg(s.performance_pct), 2)::numeric(5, 2)                    as avg_performance_pct,
    round(avg(s.quality_pct), 2)::numeric(5, 2)                        as avg_quality_pct,
    round(avg(s.oee_pct), 2)::numeric(5, 2)                            as avg_oee_pct
  from public.oee_snapshots s
  group by s.org_id, s.site_id, s.line_id, (s.snapshot_minute at time zone 'UTC')::date;

create unique index mv_reporting_oee_rollup_pk
  on public.mv_reporting_oee_rollup (org_id, site_key, line_id, oee_date);
revoke all on public.mv_reporting_oee_rollup from public;
revoke all on public.mv_reporting_oee_rollup from app_user;
grant select on public.mv_reporting_oee_rollup to app_reporting_role;

-- (B.4) mv_reporting_quality_hold_rate — daily hold counts + held kg per line, READ-ONLY consumer of
--   09 quality_holds + quality_hold_items (09-quality is the canonical owner).
drop materialized view if exists public.mv_reporting_quality_hold_rate;
create materialized view public.mv_reporting_quality_hold_rate as
  select
    h.org_id,
    h.site_id,
    coalesce(h.site_id, '00000000-0000-0000-0000-000000000000'::uuid)  as site_key,
    (h.created_at at time zone 'UTC')::date                            as hold_date,
    h.priority,
    count(distinct h.id)::bigint                                       as hold_count,
    count(distinct h.id) filter (where h.released_at is null)::bigint  as active_hold_count,
    coalesce(sum(i.qty_held_kg), 0)::numeric(18, 3)                    as total_held_kg
  from public.quality_holds h
  left join public.quality_hold_items i on i.hold_id = h.id
  group by h.org_id, h.site_id, (h.created_at at time zone 'UTC')::date, h.priority;

create unique index mv_reporting_quality_hold_rate_pk
  on public.mv_reporting_quality_hold_rate (org_id, site_key, hold_date, priority);
revoke all on public.mv_reporting_quality_hold_rate from public;
revoke all on public.mv_reporting_quality_hold_rate from app_user;
grant select on public.mv_reporting_quality_hold_rate to app_reporting_role;

-- (B.5) mv_reporting_downtime_by_line — daily downtime minutes per line per category-kind, READ-ONLY
--   consumer of 08 downtime_events joined to 02-Settings downtime_categories (kind taxonomy, D-RPT-7 —
--   never a hardcoded category list).
drop materialized view if exists public.mv_reporting_downtime_by_line;
create materialized view public.mv_reporting_downtime_by_line as
  select
    d.org_id,
    d.site_id,
    coalesce(d.site_id, '00000000-0000-0000-0000-000000000000'::uuid)  as site_key,
    d.line_id,
    (d.started_at at time zone 'UTC')::date                            as downtime_date,
    cat.kind                                                           as category_kind,
    count(*)::bigint                                                   as event_count,
    coalesce(sum(d.duration_min), 0)::bigint                           as total_minutes
  from public.downtime_events d
  join public.downtime_categories cat on cat.id = d.category_id
  group by d.org_id, d.site_id, d.line_id, (d.started_at at time zone 'UTC')::date, cat.kind;

create unique index mv_reporting_downtime_by_line_pk
  on public.mv_reporting_downtime_by_line (org_id, site_key, line_id, downtime_date, category_kind);
revoke all on public.mv_reporting_downtime_by_line from public;
revoke all on public.mv_reporting_downtime_by_line from app_user;
grant select on public.mv_reporting_downtime_by_line to app_reporting_role;

-- (B.6) mv_reporting_schedule_adherence — planned vs scheduled per line per day, READ-ONLY consumer of
--   04 schedule_outputs (04-planning is the canonical owner — NOT wo_outputs).
drop materialized view if exists public.mv_reporting_schedule_adherence;
create materialized view public.mv_reporting_schedule_adherence as
  select
    so.org_id,
    so.site_id,
    coalesce(so.site_id, '00000000-0000-0000-0000-000000000000'::uuid) as site_key,
    coalesce(wo.production_line_id::text, 'unassigned')               as line_id,
    (coalesce(wo.scheduled_start_time, wo.planned_start_date, so.created_at)
      at time zone 'UTC')::date                                       as schedule_date,
    count(*)::bigint                                                   as scheduled_count,
    coalesce(sum(so.expected_qty), 0)::numeric(18, 3)                 as total_planned_qty
  from public.schedule_outputs so
  left join public.work_orders wo on wo.id = so.planned_wo_id
  group by so.org_id, so.site_id, coalesce(wo.production_line_id::text, 'unassigned'),
    (coalesce(wo.scheduled_start_time, wo.planned_start_date, so.created_at) at time zone 'UTC')::date;

create unique index mv_reporting_schedule_adherence_pk
  on public.mv_reporting_schedule_adherence (org_id, site_key, line_id, schedule_date);
revoke all on public.mv_reporting_schedule_adherence from public;
revoke all on public.mv_reporting_schedule_adherence from app_user;
grant select on public.mv_reporting_schedule_adherence to app_reporting_role;

-- (B.7) mv_reporting_inventory_aging — LP age buckets, READ-ONLY consumer of 05 license_plates
--   (05-warehouse is the canonical owner). age_bucket computed server-side at refresh.
drop materialized view if exists public.mv_reporting_inventory_aging;
create materialized view public.mv_reporting_inventory_aging as
  select
    lp.org_id,
    lp.site_id,
    coalesce(lp.site_id, '00000000-0000-0000-0000-000000000000'::uuid) as site_key,
    lp.warehouse_id,
    case
      when pg_catalog.now() - lp.created_at < interval '7 days'  then '0_7d'
      when pg_catalog.now() - lp.created_at < interval '14 days' then '7_14d'
      when pg_catalog.now() - lp.created_at < interval '30 days' then '14_30d'
      else 'gt_30d'
    end                                                                as age_bucket,
    count(*)::bigint                                                   as lp_count,
    coalesce(sum(lp.quantity), 0)::numeric(18, 6)                     as total_qty,
    min(lp.expiry_date)                                               as oldest_expiry
  from public.license_plates lp
  where lp.status in ('received', 'available', 'reserved', 'allocated', 'quarantine')
  group by lp.org_id, lp.site_id, lp.warehouse_id,
    case
      when pg_catalog.now() - lp.created_at < interval '7 days'  then '0_7d'
      when pg_catalog.now() - lp.created_at < interval '14 days' then '7_14d'
      when pg_catalog.now() - lp.created_at < interval '30 days' then '14_30d'
      else 'gt_30d'
    end;

create unique index mv_reporting_inventory_aging_pk
  on public.mv_reporting_inventory_aging (org_id, site_key, warehouse_id, age_bucket);
revoke all on public.mv_reporting_inventory_aging from public;
revoke all on public.mv_reporting_inventory_aging from app_user;
grant select on public.mv_reporting_inventory_aging to app_reporting_role;

comment on materialized view public.mv_reporting_production_throughput is
  '12-reporting READ-ONLY fact MV over 08-production wo_outputs (canonical owner). Reporting never writes wo_outputs.';
comment on materialized view public.mv_reporting_oee_rollup is
  '12-reporting READ-ONLY fact MV over 08-production oee_snapshots (canonical owner; D-OEE-1). Reporting + 15-OEE are read-only.';
comment on materialized view public.mv_reporting_quality_hold_rate is
  '12-reporting READ-ONLY fact MV over 09-quality quality_holds (canonical owner). Reporting never writes quality_holds.';
comment on materialized view public.mv_reporting_schedule_adherence is
  '12-reporting READ-ONLY fact MV over 04-planning schedule_outputs (canonical owner — NOT wo_outputs).';

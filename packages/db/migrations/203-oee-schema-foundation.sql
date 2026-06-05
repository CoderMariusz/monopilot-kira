-- Migration 203: 15-OEE — SCHEMA foundation (READ-ONLY consumer of oee_snapshots, D-OEE-1).
-- PRD: docs/prd/15-OEE-PRD.md §3 (RBAC), §6 (D-OEE-1 consumer contract), §9.2 (MVs),
--   §9.4 (reference tables), §13.3 (Big Loss taxonomy), §15.3/§15.4 (admin screens).
-- Tasks: T-001 (perm enum) / T-003 (shift_configs + oee_alert_thresholds) /
--   T-004 (shift_patterns + org_non_production_days) / T-005 (big_loss_categories + RBAC seed) /
--   T-006 (oee_shift_metrics MV) / T-007 (oee_daily_summary MV) /
--   T-008+T-023 (DSL rule registry seeds) / T-026 (RBAC grant-seed P0).
--
-- HARD CONSTRAINTS (CLAUDE.md + MON-multi-tenant-site + MON-t1-schema):
--   * org_id business scope (NOT tenant_id); RLS via app.current_org_id() (no raw current_setting).
--   * RLS ENABLED + FORCED on every new operational table.
--   * site_id uuid NULL day-1 on every operational table (REC-L1; no FK / registry yet).
--   * audit/updated_at triggers; FK indexes; NUMERIC-exact (no float).
--
-- CANONICAL-OWNER SEPARATION (D-OEE-1): 08-production is the SOLE producer/writer of
--   oee_snapshots + downtime_events. This migration creates NO base oee_snapshots /
--   downtime_events table — only MATERIALIZED VIEWS + reference tables ON TOP of the 08-owned
--   tables. The producer-not-here invariant is asserted by the test suite.
--
-- The migrate runner wraps each file in BEGIN/COMMIT. CREATE MATERIALIZED VIEW ... WITH NO DATA
-- is tx-safe; REFRESH ... CONCURRENTLY is NOT and is therefore NEVER run inside a migration
-- (it runs on apps/worker per T-009 + in tests). MVs ship WITH NO DATA and are first populated
-- by a non-concurrent REFRESH from the worker/admin path.

-- Pre-flight: fail fast if the 08-production producer tables are absent. 15-OEE cannot build its
-- read models without the canonical producer schema. (D-OEE-1 — we consume, never create them.)
do $$
begin
  if to_regclass('public.oee_snapshots') is null then
    raise exception '15-OEE migration 203 requires public.oee_snapshots (08-production, mig 184). It is the SOLE producer (D-OEE-1) — 15-OEE never creates it.';
  end if;
  if to_regclass('public.downtime_events') is null then
    raise exception '15-OEE migration 203 requires public.downtime_events (08-production, mig 183).';
  end if;
end
$$;

-- updated_at helper shared by the OEE reference tables.
create or replace function public.oee_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

-- ===========================================================================
-- (1) shift_configs (T-003, §9.4) — per-org shift definitions feeding shift_aggregator_v1.
--   org_id NOT NULL; site_id NULL day-1. IANA tz validated server-side (V-OEE-SHIFT-4), not CHECK.
-- ===========================================================================
create table if not exists public.shift_configs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  site_id      uuid,                                              -- site_id day-1
  shift_id     text not null,
  shift_label  text not null,
  start_time   time not null,
  end_time     time not null,
  timezone     text not null default 'UTC',
  active_days  text[] not null default array['mon','tue','wed','thu','fri','sat','sun'],
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  ext_jsonb    jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default pg_catalog.now(),
  updated_at   timestamptz not null default pg_catalog.now(),
  created_by   uuid references public.users(id) on delete set null,
  updated_by   uuid references public.users(id) on delete set null,
  constraint shift_configs_org_shift_unique unique (org_id, shift_id)
);

create index if not exists idx_shift_configs_org on public.shift_configs (org_id);
create index if not exists idx_shift_configs_org_site on public.shift_configs (org_id, site_id);

alter table public.shift_configs enable row level security;
alter table public.shift_configs force row level security;
drop policy if exists shift_configs_org_context on public.shift_configs;
create policy shift_configs_org_context
  on public.shift_configs
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.shift_configs from public;
revoke all on public.shift_configs from app_user;
grant select, insert, update, delete on public.shift_configs to app_user;

drop trigger if exists shift_configs_set_updated_at on public.shift_configs;
create trigger shift_configs_set_updated_at
  before update on public.shift_configs
  for each row execute function public.oee_set_updated_at();

-- ===========================================================================
-- (2) oee_alert_thresholds (T-003, §9.4) — per-line/per-org target + anomaly/maintenance tunables.
--   line_id NULL = org default. NUMERIC-exact percentages.
-- ===========================================================================
create table if not exists public.oee_alert_thresholds (
  id                                  uuid primary key default gen_random_uuid(),
  org_id                              uuid not null references public.organizations(id) on delete cascade,
  site_id                             uuid,                       -- site_id day-1
  line_id                             text,                       -- NULL = org default
  oee_target_pct                      numeric(5, 2) not null default 70.00,
  availability_min_pct                numeric(5, 2) not null default 70.00,
  performance_min_pct                 numeric(5, 2) not null default 80.00,
  quality_min_pct                     numeric(5, 2) not null default 95.00,
  anomaly_alpha                       numeric(3, 2) not null default 0.30,
  anomaly_sigma_threshold             numeric(3, 1) not null default 2.0,
  maintenance_trigger_threshold_pct   numeric(5, 2) not null default 70.00,
  maintenance_trigger_consecutive_days integer not null default 3,
  is_active                           boolean not null default true,
  ext_jsonb                           jsonb not null default '{}'::jsonb,
  created_at                          timestamptz not null default pg_catalog.now(),
  updated_at                          timestamptz not null default pg_catalog.now(),
  created_by                          uuid references public.users(id) on delete set null,
  updated_by                          uuid references public.users(id) on delete set null,
  constraint oee_alert_thresholds_org_line_unique unique (org_id, line_id)
);

create index if not exists idx_oee_thresholds_org on public.oee_alert_thresholds (org_id);
create index if not exists idx_oee_thresholds_org_site on public.oee_alert_thresholds (org_id, site_id);

alter table public.oee_alert_thresholds enable row level security;
alter table public.oee_alert_thresholds force row level security;
drop policy if exists oee_alert_thresholds_org_context on public.oee_alert_thresholds;
create policy oee_alert_thresholds_org_context
  on public.oee_alert_thresholds
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.oee_alert_thresholds from public;
revoke all on public.oee_alert_thresholds from app_user;
grant select, insert, update, delete on public.oee_alert_thresholds to app_user;

drop trigger if exists oee_alert_thresholds_set_updated_at on public.oee_alert_thresholds;
create trigger oee_alert_thresholds_set_updated_at
  before update on public.oee_alert_thresholds
  for each row execute function public.oee_set_updated_at();

-- ===========================================================================
-- (3) shift_patterns (T-004, §15.3 OEE-ADM-003) — per-line override of shift_configs.
--   Composite FK (org_id, shift_id) -> shift_configs(org_id, shift_id) (single shift_id is not
--   unique across orgs). line_id NULL = org-wide pattern.
-- ===========================================================================
create table if not exists public.shift_patterns (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  site_id     uuid,                                               -- site_id day-1
  line_id     text,                                               -- NULL = org-wide
  shift_id    text not null,
  start_time  time,
  end_time    time,
  days_active text[] not null default array['mon','tue','wed','thu','fri'],
  is_active   boolean not null default true,
  ext_jsonb   jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default pg_catalog.now(),
  updated_at  timestamptz not null default pg_catalog.now(),
  created_by  uuid references public.users(id) on delete set null,
  updated_by  uuid references public.users(id) on delete set null,
  constraint shift_patterns_org_line_shift_unique unique (org_id, line_id, shift_id),
  constraint shift_patterns_shift_fk
    foreign key (org_id, shift_id) references public.shift_configs (org_id, shift_id) on delete cascade
);

create index if not exists idx_shift_patterns_org on public.shift_patterns (org_id);
create index if not exists idx_shift_patterns_org_line on public.shift_patterns (org_id, line_id, is_active);

alter table public.shift_patterns enable row level security;
alter table public.shift_patterns force row level security;
drop policy if exists shift_patterns_org_context on public.shift_patterns;
create policy shift_patterns_org_context
  on public.shift_patterns
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.shift_patterns from public;
revoke all on public.shift_patterns from app_user;
grant select, insert, update, delete on public.shift_patterns to app_user;

drop trigger if exists shift_patterns_set_updated_at on public.shift_patterns;
create trigger shift_patterns_set_updated_at
  before update on public.shift_patterns
  for each row execute function public.oee_set_updated_at();

-- ===========================================================================
-- (4) org_non_production_days (T-004, §15.3 OEE-ADM-003) — factory closures consumed by
--   shift_aggregator_v1. reason taxonomy from §15.3 layout.
-- ===========================================================================
create table if not exists public.org_non_production_days (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  site_id    uuid,                                                -- site_id day-1
  date       date not null,
  reason     text not null,
  notes      text,
  ext_jsonb  jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  constraint org_non_production_days_org_site_date_unique unique (org_id, site_id, date),
  constraint org_non_production_days_reason_check
    check (reason in ('holiday', 'maintenance', 'plant_closure', 'custom'))
);

create index if not exists idx_org_npd_org on public.org_non_production_days (org_id);
create index if not exists idx_org_npd_date on public.org_non_production_days (org_id, date);

alter table public.org_non_production_days enable row level security;
alter table public.org_non_production_days force row level security;
drop policy if exists org_non_production_days_org_context on public.org_non_production_days;
create policy org_non_production_days_org_context
  on public.org_non_production_days
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.org_non_production_days from public;
revoke all on public.org_non_production_days from app_user;
grant select, insert, update, delete on public.org_non_production_days to app_user;

drop trigger if exists org_non_production_days_set_updated_at on public.org_non_production_days;
create trigger org_non_production_days_set_updated_at
  before update on public.org_non_production_days
  for each row execute function public.oee_set_updated_at();

-- ===========================================================================
-- (5) big_loss_categories (T-005, §13.3) — UNIVERSAL Nakajima Six Big Losses taxonomy.
--   No org_id (cross-tenant industry standard, ADR-034). Read-only reference; admin overrides
--   land in a per-tenant mapping table later (T-021). Seeded below.
-- ===========================================================================
create table if not exists public.big_loss_categories (
  code              text primary key,
  label             text not null,
  description       text,
  impact_dimension  char(1) not null,
  lean_class        text not null,
  default_color_hex text,
  sort_order        integer not null default 0,
  is_active         boolean not null default true,
  constraint big_loss_categories_impact_check check (impact_dimension in ('A', 'P', 'Q')),
  constraint big_loss_categories_lean_check check (lean_class in ('Plant', 'Process', 'People'))
);

-- Universal taxonomy is world-readable to app_user (no org scoping). No RLS — it has no org_id.
revoke all on public.big_loss_categories from public;
revoke all on public.big_loss_categories from app_user;
grant select on public.big_loss_categories to app_user;

insert into public.big_loss_categories
  (code, label, description, impact_dimension, lean_class, default_color_hex, sort_order)
values
  ('BREAKDOWN',        'Equipment Failure',       'Unplanned stops from equipment breakdowns',          'A', 'Plant',   '#dc2626', 1),
  ('SETUP_ADJ',        'Setup & Adjustments',     'Changeover, setup and adjustment time',              'A', 'Process', '#f59e0b', 2),
  ('IDLING',           'Idling & Minor Stops',    'Short stops, jams and idling under 5 minutes',       'A', 'Process', '#fbbf24', 3),
  ('REDUCED_SPEED',    'Reduced Speed',           'Running below ideal cycle time',                     'P', 'Plant',   '#3b82f6', 4),
  ('STARTUP_REJECT',   'Startup Rejects',         'Defects produced during startup / warm-up',          'Q', 'Process', '#8b5cf6', 5),
  ('PRODUCTION_REJECT','Production Rejects',       'Defects produced during stable production',          'Q', 'Process', '#a855f7', 6)
on conflict (code) do nothing;

-- ===========================================================================
-- (6) oee_shift_metrics MATERIALIZED VIEW (T-006, §9.2 verbatim, tenant_id -> org_id).
--   Per-shift rollup over oee_snapshots LEFT JOIN downtime_events LEFT JOIN shift_configs.
--   MTBF/MTTR stub columns NULL when downtime_event_count = 0 (V-OEE-AGG-4).
--   WITH NO DATA — first populated by a non-concurrent REFRESH from worker/admin (CONCURRENTLY
--   refresh needs the UNIQUE index below + a populated MV; never run inside this tx).
-- ===========================================================================
drop materialized view if exists public.oee_shift_metrics cascade;
create materialized view public.oee_shift_metrics as
select
  o.org_id,
  o.site_id,
  o.line_id,
  date(o.snapshot_minute at time zone coalesce(sc.timezone, 'UTC')) as shift_date,
  o.shift_id,
  sc.shift_label,
  avg(o.availability_pct)                                   as availability_pct,
  avg(o.performance_pct)                                    as performance_pct,
  avg(o.quality_pct)                                        as quality_pct,
  avg(o.oee_pct)                                            as oee_pct,
  sum(o.output_qty_delta)                                   as total_output_qty,
  sum(o.downtime_min_delta)                                 as total_downtime_min,
  sum(o.waste_qty_delta)                                    as total_waste_qty,
  count(*)                                                  as snapshot_count,
  count(distinct o.active_wo_id) filter (where o.active_wo_id is not null) as wo_count,
  count(distinct de.id)                                     as downtime_event_count,
  case when count(distinct de.id) > 0
    then sum(o.downtime_min_delta)::numeric / count(distinct de.id)
    else null
  end                                                       as mttr_min,
  case when count(distinct de.id) > 0
    then (count(*) - sum(o.downtime_min_delta))::numeric / count(distinct de.id)
    else null
  end                                                       as mtbf_min,
  max(o.snapshot_minute)                                    as last_snapshot_at
from public.oee_snapshots o
left join public.downtime_events de
  on de.org_id = o.org_id
  and de.line_id = o.line_id
  and de.started_at between o.snapshot_minute - interval '1 minute' and o.snapshot_minute
left join public.shift_configs sc
  on sc.org_id = o.org_id and sc.shift_id = o.shift_id
group by
  o.org_id, o.site_id, o.line_id,
  date(o.snapshot_minute at time zone coalesce(sc.timezone, 'UTC')),
  o.shift_id, sc.shift_label
with no data;

-- UNIQUE index required for REFRESH MATERIALIZED VIEW CONCURRENTLY (V-OEE-AGG-5). Plain-column
-- index (CONCURRENTLY rejects expression/partial unique indexes). The GROUP BY produces at most
-- one row per (org_id, site_id, line_id, shift_date, shift_id) — including the NULL-site group —
-- so a plain unique index never collides even though SQL NULLs are normally distinct.
create unique index idx_oee_shift_pk on public.oee_shift_metrics
  (org_id, site_id, line_id, shift_date, shift_id);
create index idx_oee_shift_date on public.oee_shift_metrics (shift_date desc);

-- MVs cannot host RLS policies (Postgres limitation) — org isolation is enforced at the service
-- layer (where org_id = app.current_org_id()) AND because the underlying oee_snapshots is RLS-
-- forced, the MV is only refreshable/visible by owner/refresh paths. app_user gets SELECT only.
revoke all on public.oee_shift_metrics from public;
grant select on public.oee_shift_metrics to app_user;

-- ===========================================================================
-- (7) oee_daily_summary MATERIALIZED VIEW (T-007, §9.2, tenant_id -> org_id, 90-day rolling).
--   best/worst shift via correlated lookup against oee_shift_metrics. The PRD's illustrative
--   sub-select referenced the source table inside GROUP BY (invalid SQL); rewritten as a CTE
--   over the grouped daily rows joined to per-day best/worst shift from oee_shift_metrics.
-- ===========================================================================
drop materialized view if exists public.oee_daily_summary cascade;
create materialized view public.oee_daily_summary as
with daily as (
  select
    org_id,
    site_id,
    line_id,
    date(snapshot_minute at time zone 'UTC')  as date,
    avg(availability_pct)                      as availability_pct,
    avg(performance_pct)                       as performance_pct,
    avg(quality_pct)                           as quality_pct,
    avg(oee_pct)                               as oee_pct,
    max(oee_pct)                               as best_oee_pct,
    min(oee_pct)                               as worst_oee_pct,
    sum(output_qty_delta)                      as total_output,
    sum(downtime_min_delta)                    as total_downtime_min,
    sum(waste_qty_delta)                       as total_waste,
    count(*)                                   as snapshot_count
  from public.oee_snapshots
  where snapshot_minute > now() - interval '90 days'
  group by org_id, site_id, line_id, date(snapshot_minute at time zone 'UTC')
)
select
  d.org_id,
  d.site_id,
  d.line_id,
  d.date,
  d.availability_pct,
  d.performance_pct,
  d.quality_pct,
  d.oee_pct,
  d.best_oee_pct,
  d.worst_oee_pct,
  d.total_output,
  d.total_downtime_min,
  d.total_waste,
  d.snapshot_count,
  (
    select osm.shift_id from public.oee_shift_metrics osm
    where osm.org_id = d.org_id and osm.line_id = d.line_id and osm.shift_date = d.date
      and (osm.site_id is not distinct from d.site_id)
    order by osm.oee_pct desc nulls last, osm.shift_id
    limit 1
  ) as best_shift_id,
  (
    select osm.shift_id from public.oee_shift_metrics osm
    where osm.org_id = d.org_id and osm.line_id = d.line_id and osm.shift_date = d.date
      and (osm.site_id is not distinct from d.site_id)
    order by osm.oee_pct asc nulls last, osm.shift_id
    limit 1
  ) as worst_shift_id
from daily d
with no data;

-- Plain-column unique index (CONCURRENTLY-compatible). GROUP BY guarantees one row per tuple.
create unique index idx_oee_daily_pk on public.oee_daily_summary
  (org_id, site_id, line_id, date);
create index idx_oee_daily_date on public.oee_daily_summary (date desc);

revoke all on public.oee_daily_summary from public;
grant select on public.oee_daily_summary to app_user;

-- ===========================================================================
-- (8) DSL rule definitions (T-008 active + T-023 P2 stubs) — registered into the 02-settings
--   rule_definitions registry (mig 039). 15-OEE registers rows; it does not own the table.
--   shift_aggregator_v1 = P1 active. oee_anomaly_detector_v1 / oee_maintenance_trigger_v1 = P2
--   stubs (active_to set in the past so they are inactive until the feature flag flips).
--   Seeded per existing org (incl. Apex bootstrap) + AFTER INSERT trigger for new orgs.
-- ===========================================================================
create or replace function public.seed_oee_rule_definitions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  -- P1 active aggregator.
  insert into public.rule_definitions
    (org_id, rule_code, rule_type, tier, definition_json, version, active_from, active_to)
  select
    p_org_id, 'shift_aggregator_v1', 'workflow', 'L1',
    jsonb_build_object(
      'module', '15-oee',
      'trigger', 'shift_close',
      'inputs', jsonb_build_array('oee_snapshots', 'downtime_events', 'shift_configs'),
      'output_mv', 'oee_shift_metrics',
      'emits', 'oee.shift.aggregated',
      'active', true
    ),
    1, pg_catalog.now(), null
  where not exists (
    select 1 from public.rule_definitions
    where org_id = p_org_id and rule_code = 'shift_aggregator_v1'
  );

  -- P2 anomaly detector stub (inactive — active_to in the past).
  insert into public.rule_definitions
    (org_id, rule_code, rule_type, tier, definition_json, version, active_from, active_to)
  select
    p_org_id, 'oee_anomaly_detector_v1', 'workflow', 'L1',
    jsonb_build_object(
      'module', '15-oee', 'phase', 'P2', 'feature_flag', 'oee.anomaly_detection_enabled',
      'emits', 'oee.anomaly.detected', 'active', false
    ),
    1, pg_catalog.now(), pg_catalog.now()
  where not exists (
    select 1 from public.rule_definitions
    where org_id = p_org_id and rule_code = 'oee_anomaly_detector_v1'
  );

  -- P2 maintenance trigger stub (inactive — active_to in the past).
  insert into public.rule_definitions
    (org_id, rule_code, rule_type, tier, definition_json, version, active_from, active_to)
  select
    p_org_id, 'oee_maintenance_trigger_v1', 'workflow', 'L1',
    jsonb_build_object(
      'module', '15-oee', 'phase', 'P2', 'feature_flag', 'oee.maintenance_trigger_enabled',
      'emits', 'oee.anomaly.detected', 'active', false
    ),
    1, pg_catalog.now(), pg_catalog.now()
  where not exists (
    select 1 from public.rule_definitions
    where org_id = p_org_id and rule_code = 'oee_maintenance_trigger_v1'
  );
end;
$$;

revoke all on function public.seed_oee_rule_definitions_for_org(uuid) from public;
revoke all on function public.seed_oee_rule_definitions_for_org(uuid) from app_user;

-- ===========================================================================
-- (9) outbox CHECK regen — admit the 5 oee.* producer events. The enum<->CHECK drift gate
--   (packages/outbox check-drift.test.ts) asserts THIS highest-numbered migration's CHECK string
--   set === DB_EVENT_TYPES (events.enum.ts). Strict superset of 192 — no event dropped.
-- ===========================================================================
alter table public.outbox_events
  drop constraint if exists outbox_events_event_type_check;

alter table public.outbox_events
  add constraint outbox_events_event_type_check check (
    event_type in (
      'audit.recorded',
      'bom.initial_version_created',
      'bom.version_submitted',
      'brief.completed_for_project',
      'brief.converted',
      'brief.created',
      'catch_weight.variance_exceeded',
      'compliance_doc.deleted',
      'compliance_doc.expired',
      'compliance_doc.expiring',
      'compliance_doc.uploaded',
      'd365.cache.refreshed',
      'fa.allergens_changed',
      'fa.built',
      'fa.built_reset',
      'fa.cascade',
      'fa.core_closed',
      'fa.created',
      'fa.deleted',
      'fa.dept_closed',
      'fa.dept_reopened',
      'fa.edit',
      'fa.intermediate_code_changed',
      'fa.recipe_changed',
      'fa.template_applied',
      'fg.allergens_changed',
      'fg.bom.released',
      'fg.created',
      'fg.edit',
      'fg.intermediate_code_changed',
      'fg.release_blocked',
      'fg.released_to_factory',
      'formulation.locked',
      'formulation.submitted_for_trial',
      'lp.received',
      'manufacturing_operations.created',
      'manufacturing_operations.deactivated',
      'manufacturing_operations.reset_to_seed',
      'manufacturing_operations.updated',
      'npd.allergens.bulk_rebuild_completed',
      'npd.builder.released_records_created',
      'npd.fg_candidate_mapped',
      'npd.gate.advanced',
      'npd.gate.approved',
      'npd.gate.reverted',
      'npd.project.brief_mapped',
      'npd.project.created',
      'npd.project.legacy_stages_closed',
      'npd.project.release_requested',
      'oee.alert.threshold_breached',
      'oee.anomaly.detected',
      'oee.dsl_rule.updated',
      'oee.shift.aggregated',
      'oee.snapshot.refreshed',
      'onboarding.first_wo_recorded',
      'onboarding.step.advance',
      'onboarding.step.back',
      'onboarding.step.jump',
      'onboarding.step.restart',
      'onboarding.step.skip',
      'org.created',
      'org.mfa_enrollment.forced',
      'org.security_policy.updated',
      'production.allergen_changeover.validated',
      'production.changeover.signed',
      'production.consume.blocked',
      'production.consume.completed',
      'production.downtime.recorded',
      'production.oee.snapshot',
      'production.output.recorded',
      'production.waste.recorded',
      'production.wo.closed',
      'production.wo.completed',
      'production.wo.started',
      'quality.atp_swab_failed',
      'quality.recorded',
      'reference.allergens_added_by_process.bulk_changed',
      'reference.allergens_by_rm.bulk_changed',
      'reference.csv.committed',
      'reference.row.soft_deleted',
      'reference.row.upserted',
      'risk.created',
      'role.assigned',
      'rule.deployed',
      'settings.core_flag.updated',
      'settings.d365_sync.updated',
      'settings.dept_override.updated',
      'settings.ip_allowlist.changed',
      'settings.line.upserted',
      'settings.location.deleted',
      'settings.location.imported',
      'settings.location.upserted',
      'settings.machine.upserted',
      'settings.module.disabled',
      'settings.module.enabled',
      'settings.module.toggled',
      'settings.notification_channel_updated',
      'settings.notification_digest_updated',
      'settings.notification_rule_updated',
      'settings.org.created',
      'settings.org.updated',
      'settings.reference.row_updated',
      'settings.role.assigned',
      'settings.rule.deployed',
      'settings.rule_variant.updated',
      'settings.schema.migration_requested',
      'settings.scim.token_created',
      'settings.sso.config_changed',
      'settings.upgrade.completed',
      'settings.upgrade.promoted',
      'settings.upgrade.rolled_back',
      'settings.upgrade.scheduled',
      'settings.user.accepted',
      'settings.user.deactivated',
      'settings.user.invitation_resent',
      'settings.user.invited',
      'settings.warehouse.deactivated',
      'shipment.created',
      'technical.factory_spec.approved',
      'tenant.cohort.advanced',
      'tenant.migration.run',
      'tenant.migration.run.failed',
      'unit_of_measure.conversion_created',
      'unit_of_measure.created',
      'unit_of_measure.soft_deleted',
      'user.invited',
      'warehouse.lp.received',
      'warehouse.lp.shipped',
      'warehouse.lp.transitioned',
      'warehouse.material.consumed',
      'wo.ready'
    )
  );

comment on constraint outbox_events_event_type_check on public.outbox_events
  is 'Regenerated from events.enum.ts DB_EVENT_TYPES (131 types incl oee.*).';

-- ===========================================================================
-- (10) oee.* RBAC permission seed (T-005 + T-026, recurring-live-bug X-1 class P0).
--   ROOT CAUSE (same as 116/146/148/149/154/185/192): adding oee.* strings to the enum grants
--   NOBODY access. The deployed org administrator is on the canonical org-admin role family,
--   which receives NONE of the oee.* strings — so every OEE page/action 403s at live Gate-5.
--
--   Grants:
--     * the COMPLETE oee.* set (13 strings) to the org-admin role family + oee_admin;
--     * the supervisor subset (read + annotate + escalate + ack + exports) to oee_supervisor;
--     * the viewer subset (read + exports) to oee_viewer;
--   in BOTH role_permissions (normalized) and roles.permissions (legacy jsonb cache), for every
--   existing org, with an AFTER INSERT trigger so new orgs inherit it. Models on 149/154/185/192.
-- ===========================================================================
create or replace function public.seed_oee_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_all_perms text[] := array[
    'oee.dashboard.read',
    'oee.target.edit',
    'oee.override.create',
    'oee.override.delete',
    'oee.export.csv',
    'oee.export.pdf',
    'oee.anomaly.acknowledge',
    'oee.big_loss.map_edit',
    'oee.shift_pattern.edit',
    'oee.shift_pattern.read',
    'oee.downtime.annotate',
    'oee.downtime.escalate',
    'oee.tv.kiosk_view'
  ];
  -- oee_supervisor: read + analyse + annotate/escalate + acknowledge + exports + kiosk + read
  -- shift patterns. NOT target.edit / override.* / big_loss.map_edit / shift_pattern.edit (admin).
  v_supervisor_perms text[] := array[
    'oee.dashboard.read',
    'oee.export.csv',
    'oee.export.pdf',
    'oee.anomaly.acknowledge',
    'oee.shift_pattern.read',
    'oee.downtime.annotate',
    'oee.downtime.escalate',
    'oee.tv.kiosk_view'
  ];
  -- oee_viewer: read + exports + kiosk only (least privilege).
  v_viewer_perms text[] := array[
    'oee.dashboard.read',
    'oee.export.csv',
    'oee.export.pdf',
    'oee.tv.kiosk_view'
  ];
  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin','oee_admin'];
begin
  -- --- Normalized storage (role_permissions) ---
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_all_perms) as p(permission)
  where r.org_id = p_org_id and r.code = any(v_admin_roles)
  on conflict (role_id, permission) do nothing;

  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_supervisor_perms) as p(permission)
  where r.org_id = p_org_id and r.code = 'oee_supervisor'
  on conflict (role_id, permission) do nothing;

  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_viewer_perms) as p(permission)
  where r.org_id = p_org_id and r.code = 'oee_viewer'
  on conflict (role_id, permission) do nothing;

  -- --- Legacy jsonb cache (roles.permissions) ---
  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select unnest(v_all_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id and r.code = any(v_admin_roles);

  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select unnest(v_supervisor_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id and r.code = 'oee_supervisor';

  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select unnest(v_viewer_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id and r.code = 'oee_viewer';
end;
$$;

revoke all on function public.seed_oee_permissions_for_org(uuid) from public;
revoke all on function public.seed_oee_permissions_for_org(uuid) from app_user;

create or replace function public.seed_oee_module_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_oee_permissions_for_org(new.id);
  perform public.seed_oee_rule_definitions_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_oee_module_on_org_insert() from public;
revoke all on function public.seed_oee_module_on_org_insert() from app_user;

-- Fire after the 080 role-seeding trigger so admin roles already exist (zzz prefix).
drop trigger if exists trg_zzz_seed_oee_module on public.organizations;
create trigger trg_zzz_seed_oee_module
  after insert on public.organizations
  for each row
  execute function public.seed_oee_module_on_org_insert();

-- Backfill every existing org (perms + rule definitions).
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_oee_permissions_for_org(v_org_id);
    perform public.seed_oee_rule_definitions_for_org(v_org_id);
  end loop;
end
$$;

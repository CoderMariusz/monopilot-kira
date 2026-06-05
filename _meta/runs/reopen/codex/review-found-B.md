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
session id: 019e96b9-6abf-7e33-b0c2-8e607e619c96
--------
user
You are the cross-provider CODEX reviewer for MonoPilot Kira (Gate 4, /kira:review). The code below is a git diff (branch kira/long-run vs main) of Claude/agent-written work — the writer never reviews its own output, so you provide the independent cross-check. Review ONLY this diff (provided on stdin). Do NOT edit anything — review only.

Focus on HIGH-risk red-lines (this is food-mfg MES; regulated):
1. TENANCY: org_id NOT tenant_id; every operational table has RLS ENABLED + FORCED with policies using app.current_org_id() (the function form) — NEVER raw current_setting('app.current_org_id') or SET LOCAL. site_id present as nullable day-1.
2. CANONICAL OWNERS (a module must not create/write another's table): wo_outputs + oee_snapshots + downtime_events = 08-production; schedule_outputs = 04-planning; license_plates = 05-warehouse; item_cost_history = 03-technical (dual w/ finance); quality_holds + ncr_reports = 09-quality. oee_snapshots has a SINGLE producer (08); 15-oee is read-only.
3. RBAC SEED (the #1 live 403 bug): a new permission family must be GRANTed to the org-admin family (org.access.admin/org.platform.admin/owner/admin/org_admin) + operator roles, in BOTH role_permissions AND legacy roles.permissions jsonb, with an org-insert trigger + existing-org backfill, idempotent. The strings GRANTed must byte-match the strings pages CHECK.
4. OUTBOX: every new event_type is in the enum AND the latest migration's CHECK constraint (enum<->CHECK drift). Outbox INSERT must be in the same txn as the state change.
5. MONEY/QTY: NUMERIC-exact, never float/double precision for cost/qty/kg.
6. MIGRATION HYGIENE: 3-digit prefix, monotonic, never edits an applied migration, idempotent (IF NOT EXISTS / OR REPLACE), FK indexes present.
7. REGULATORY: CFR-21 Part 11 e-sign (PIN server-side hash, dual-sign distinct session), BRCGS retention, D365 export-only anti-corruption (R15, soft refs not hard FKs), GS1 SSCC.

Output format:
- A markdown table: | severity (BLOCK/HIGH/MED/LOW) | file:line | issue | suggested fix |
- Then a final line: VERDICT: PASS  (gates-clean, no BLOCK/HIGH) or VERDICT: FAIL + the blocking items.
Be specific and cite the migration filename + line. If the diff is sound, say so plainly with VERDICT: PASS.

<stdin>
diff --git a/packages/db/migrations/203-oee-schema-foundation.sql b/packages/db/migrations/203-oee-schema-foundation.sql
new file mode 100644
index 00000000..1e12481f
--- /dev/null
+++ b/packages/db/migrations/203-oee-schema-foundation.sql
@@ -0,0 +1,768 @@
+-- Migration 203: 15-OEE — SCHEMA foundation (READ-ONLY consumer of oee_snapshots, D-OEE-1).
+-- PRD: docs/prd/15-OEE-PRD.md §3 (RBAC), §6 (D-OEE-1 consumer contract), §9.2 (MVs),
+--   §9.4 (reference tables), §13.3 (Big Loss taxonomy), §15.3/§15.4 (admin screens).
+-- Tasks: T-001 (perm enum) / T-003 (shift_configs + oee_alert_thresholds) /
+--   T-004 (shift_patterns + org_non_production_days) / T-005 (big_loss_categories + RBAC seed) /
+--   T-006 (oee_shift_metrics MV) / T-007 (oee_daily_summary MV) /
+--   T-008+T-023 (DSL rule registry seeds) / T-026 (RBAC grant-seed P0).
+--
+-- HARD CONSTRAINTS (CLAUDE.md + MON-multi-tenant-site + MON-t1-schema):
+--   * org_id business scope (NOT tenant_id); RLS via app.current_org_id() (no raw current_setting).
+--   * RLS ENABLED + FORCED on every new operational table.
+--   * site_id uuid NULL day-1 on every operational table (REC-L1; no FK / registry yet).
+--   * audit/updated_at triggers; FK indexes; NUMERIC-exact (no float).
+--
+-- CANONICAL-OWNER SEPARATION (D-OEE-1): 08-production is the SOLE producer/writer of
+--   oee_snapshots + downtime_events. This migration creates NO base oee_snapshots /
+--   downtime_events table — only MATERIALIZED VIEWS + reference tables ON TOP of the 08-owned
+--   tables. The producer-not-here invariant is asserted by the test suite.
+--
+-- The migrate runner wraps each file in BEGIN/COMMIT. CREATE MATERIALIZED VIEW ... WITH NO DATA
+-- is tx-safe; REFRESH ... CONCURRENTLY is NOT and is therefore NEVER run inside a migration
+-- (it runs on apps/worker per T-009 + in tests). MVs ship WITH NO DATA and are first populated
+-- by a non-concurrent REFRESH from the worker/admin path.
+
+-- Pre-flight: fail fast if the 08-production producer tables are absent. 15-OEE cannot build its
+-- read models without the canonical producer schema. (D-OEE-1 — we consume, never create them.)
+do $$
+begin
+  if to_regclass('public.oee_snapshots') is null then
+    raise exception '15-OEE migration 203 requires public.oee_snapshots (08-production, mig 184). It is the SOLE producer (D-OEE-1) — 15-OEE never creates it.';
+  end if;
+  if to_regclass('public.downtime_events') is null then
+    raise exception '15-OEE migration 203 requires public.downtime_events (08-production, mig 183).';
+  end if;
+end
+$$;
+
+-- updated_at helper shared by the OEE reference tables.
+create or replace function public.oee_set_updated_at()
+returns trigger
+language plpgsql
+as $$
+begin
+  new.updated_at := pg_catalog.now();
+  return new;
+end;
+$$;
+
+-- ===========================================================================
+-- (1) shift_configs (T-003, §9.4) — per-org shift definitions feeding shift_aggregator_v1.
+--   org_id NOT NULL; site_id NULL day-1. IANA tz validated server-side (V-OEE-SHIFT-4), not CHECK.
+-- ===========================================================================
+create table if not exists public.shift_configs (
+  id           uuid primary key default gen_random_uuid(),
+  org_id       uuid not null references public.organizations(id) on delete cascade,
+  site_id      uuid,                                              -- site_id day-1
+  shift_id     text not null,
+  shift_label  text not null,
+  start_time   time not null,
+  end_time     time not null,
+  timezone     text not null default 'UTC',
+  active_days  text[] not null default array['mon','tue','wed','thu','fri','sat','sun'],
+  sort_order   integer not null default 0,
+  is_active    boolean not null default true,
+  ext_jsonb    jsonb not null default '{}'::jsonb,
+  created_at   timestamptz not null default pg_catalog.now(),
+  updated_at   timestamptz not null default pg_catalog.now(),
+  created_by   uuid references public.users(id) on delete set null,
+  updated_by   uuid references public.users(id) on delete set null,
+  constraint shift_configs_org_shift_unique unique (org_id, shift_id)
+);
+
+create index if not exists idx_shift_configs_org on public.shift_configs (org_id);
+create index if not exists idx_shift_configs_org_site on public.shift_configs (org_id, site_id);
+
+alter table public.shift_configs enable row level security;
+alter table public.shift_configs force row level security;
+drop policy if exists shift_configs_org_context on public.shift_configs;
+create policy shift_configs_org_context
+  on public.shift_configs
+  for all
+  to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+revoke all on public.shift_configs from public;
+revoke all on public.shift_configs from app_user;
+grant select, insert, update, delete on public.shift_configs to app_user;
+
+drop trigger if exists shift_configs_set_updated_at on public.shift_configs;
+create trigger shift_configs_set_updated_at
+  before update on public.shift_configs
+  for each row execute function public.oee_set_updated_at();
+
+-- ===========================================================================
+-- (2) oee_alert_thresholds (T-003, §9.4) — per-line/per-org target + anomaly/maintenance tunables.
+--   line_id NULL = org default. NUMERIC-exact percentages.
+-- ===========================================================================
+create table if not exists public.oee_alert_thresholds (
+  id                                  uuid primary key default gen_random_uuid(),
+  org_id                              uuid not null references public.organizations(id) on delete cascade,
+  site_id                             uuid,                       -- site_id day-1
+  line_id                             text,                       -- NULL = org default
+  oee_target_pct                      numeric(5, 2) not null default 70.00,
+  availability_min_pct                numeric(5, 2) not null default 70.00,
+  performance_min_pct                 numeric(5, 2) not null default 80.00,
+  quality_min_pct                     numeric(5, 2) not null default 95.00,
+  anomaly_alpha                       numeric(3, 2) not null default 0.30,
+  anomaly_sigma_threshold             numeric(3, 1) not null default 2.0,
+  maintenance_trigger_threshold_pct   numeric(5, 2) not null default 70.00,
+  maintenance_trigger_consecutive_days integer not null default 3,
+  is_active                           boolean not null default true,
+  ext_jsonb                           jsonb not null default '{}'::jsonb,
+  created_at                          timestamptz not null default pg_catalog.now(),
+  updated_at                          timestamptz not null default pg_catalog.now(),
+  created_by                          uuid references public.users(id) on delete set null,
+  updated_by                          uuid references public.users(id) on delete set null,
+  constraint oee_alert_thresholds_org_line_unique unique (org_id, line_id)
+);
+
+create index if not exists idx_oee_thresholds_org on public.oee_alert_thresholds (org_id);
+create index if not exists idx_oee_thresholds_org_site on public.oee_alert_thresholds (org_id, site_id);
+
+alter table public.oee_alert_thresholds enable row level security;
+alter table public.oee_alert_thresholds force row level security;
+drop policy if exists oee_alert_thresholds_org_context on public.oee_alert_thresholds;
+create policy oee_alert_thresholds_org_context
+  on public.oee_alert_thresholds
+  for all
+  to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+revoke all on public.oee_alert_thresholds from public;
+revoke all on public.oee_alert_thresholds from app_user;
+grant select, insert, update, delete on public.oee_alert_thresholds to app_user;
+
+drop trigger if exists oee_alert_thresholds_set_updated_at on public.oee_alert_thresholds;
+create trigger oee_alert_thresholds_set_updated_at
+  before update on public.oee_alert_thresholds
+  for each row execute function public.oee_set_updated_at();
+
+-- ===========================================================================
+-- (3) shift_patterns (T-004, §15.3 OEE-ADM-003) — per-line override of shift_configs.
+--   Composite FK (org_id, shift_id) -> shift_configs(org_id, shift_id) (single shift_id is not
+--   unique across orgs). line_id NULL = org-wide pattern.
+-- ===========================================================================
+create table if not exists public.shift_patterns (
+  id          uuid primary key default gen_random_uuid(),
+  org_id      uuid not null references public.organizations(id) on delete cascade,
+  site_id     uuid,                                               -- site_id day-1
+  line_id     text,                                               -- NULL = org-wide
+  shift_id    text not null,
+  start_time  time,
+  end_time    time,
+  days_active text[] not null default array['mon','tue','wed','thu','fri'],
+  is_active   boolean not null default true,
+  ext_jsonb   jsonb not null default '{}'::jsonb,
+  created_at  timestamptz not null default pg_catalog.now(),
+  updated_at  timestamptz not null default pg_catalog.now(),
+  created_by  uuid references public.users(id) on delete set null,
+  updated_by  uuid references public.users(id) on delete set null,
+  constraint shift_patterns_org_line_shift_unique unique (org_id, line_id, shift_id),
+  constraint shift_patterns_shift_fk
+    foreign key (org_id, shift_id) references public.shift_configs (org_id, shift_id) on delete cascade
+);
+
+create index if not exists idx_shift_patterns_org on public.shift_patterns (org_id);
+create index if not exists idx_shift_patterns_org_line on public.shift_patterns (org_id, line_id, is_active);
+
+alter table public.shift_patterns enable row level security;
+alter table public.shift_patterns force row level security;
+drop policy if exists shift_patterns_org_context on public.shift_patterns;
+create policy shift_patterns_org_context
+  on public.shift_patterns
+  for all
+  to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+revoke all on public.shift_patterns from public;
+revoke all on public.shift_patterns from app_user;
+grant select, insert, update, delete on public.shift_patterns to app_user;
+
+drop trigger if exists shift_patterns_set_updated_at on public.shift_patterns;
+create trigger shift_patterns_set_updated_at
+  before update on public.shift_patterns
+  for each row execute function public.oee_set_updated_at();
+
+-- ===========================================================================
+-- (4) org_non_production_days (T-004, §15.3 OEE-ADM-003) — factory closures consumed by
+--   shift_aggregator_v1. reason taxonomy from §15.3 layout.
+-- ===========================================================================
+create table if not exists public.org_non_production_days (
+  id         uuid primary key default gen_random_uuid(),
+  org_id     uuid not null references public.organizations(id) on delete cascade,
+  site_id    uuid,                                                -- site_id day-1
+  date       date not null,
+  reason     text not null,
+  notes      text,
+  ext_jsonb  jsonb not null default '{}'::jsonb,
+  created_at timestamptz not null default pg_catalog.now(),
+  updated_at timestamptz not null default pg_catalog.now(),
+  created_by uuid references public.users(id) on delete set null,
+  updated_by uuid references public.users(id) on delete set null,
+  constraint org_non_production_days_org_site_date_unique unique (org_id, site_id, date),
+  constraint org_non_production_days_reason_check
+    check (reason in ('holiday', 'maintenance', 'plant_closure', 'custom'))
+);
+
+create index if not exists idx_org_npd_org on public.org_non_production_days (org_id);
+create index if not exists idx_org_npd_date on public.org_non_production_days (org_id, date);
+
+alter table public.org_non_production_days enable row level security;
+alter table public.org_non_production_days force row level security;
+drop policy if exists org_non_production_days_org_context on public.org_non_production_days;
+create policy org_non_production_days_org_context
+  on public.org_non_production_days
+  for all
+  to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+revoke all on public.org_non_production_days from public;
+revoke all on public.org_non_production_days from app_user;
+grant select, insert, update, delete on public.org_non_production_days to app_user;
+
+drop trigger if exists org_non_production_days_set_updated_at on public.org_non_production_days;
+create trigger org_non_production_days_set_updated_at
+  before update on public.org_non_production_days
+  for each row execute function public.oee_set_updated_at();
+
+-- ===========================================================================
+-- (5) big_loss_categories (T-005, §13.3) — UNIVERSAL Nakajima Six Big Losses taxonomy.
+--   No org_id (cross-tenant industry standard, ADR-034). Read-only reference; admin overrides
+--   land in a per-tenant mapping table later (T-021). Seeded below.
+-- ===========================================================================
+create table if not exists public.big_loss_categories (
+  code              text primary key,
+  label             text not null,
+  description       text,
+  impact_dimension  char(1) not null,
+  lean_class        text not null,
+  default_color_hex text,
+  sort_order        integer not null default 0,
+  is_active         boolean not null default true,
+  constraint big_loss_categories_impact_check check (impact_dimension in ('A', 'P', 'Q')),
+  constraint big_loss_categories_lean_check check (lean_class in ('Plant', 'Process', 'People'))
+);
+
+-- Universal taxonomy is world-readable to app_user (no org scoping). No RLS — it has no org_id.
+revoke all on public.big_loss_categories from public;
+revoke all on public.big_loss_categories from app_user;
+grant select on public.big_loss_categories to app_user;
+
+insert into public.big_loss_categories
+  (code, label, description, impact_dimension, lean_class, default_color_hex, sort_order)
+values
+  ('BREAKDOWN',        'Equipment Failure',       'Unplanned stops from equipment breakdowns',          'A', 'Plant',   '#dc2626', 1),
+  ('SETUP_ADJ',        'Setup & Adjustments',     'Changeover, setup and adjustment time',              'A', 'Process', '#f59e0b', 2),
+  ('IDLING',           'Idling & Minor Stops',    'Short stops, jams and idling under 5 minutes',       'A', 'Process', '#fbbf24', 3),
+  ('REDUCED_SPEED',    'Reduced Speed',           'Running below ideal cycle time',                     'P', 'Plant',   '#3b82f6', 4),
+  ('STARTUP_REJECT',   'Startup Rejects',         'Defects produced during startup / warm-up',          'Q', 'Process', '#8b5cf6', 5),
+  ('PRODUCTION_REJECT','Production Rejects',       'Defects produced during stable production',          'Q', 'Process', '#a855f7', 6)
+on conflict (code) do nothing;
+
+-- ===========================================================================
+-- (6) oee_shift_metrics MATERIALIZED VIEW (T-006, §9.2 verbatim, tenant_id -> org_id).
+--   Per-shift rollup over oee_snapshots LEFT JOIN downtime_events LEFT JOIN shift_configs.
+--   MTBF/MTTR stub columns NULL when downtime_event_count = 0 (V-OEE-AGG-4).
+--   WITH NO DATA — first populated by a non-concurrent REFRESH from worker/admin (CONCURRENTLY
+--   refresh needs the UNIQUE index below + a populated MV; never run inside this tx).
+-- ===========================================================================
+drop materialized view if exists public.oee_shift_metrics cascade;
+create materialized view public.oee_shift_metrics as
+select
+  o.org_id,
+  o.site_id,
+  o.line_id,
+  date(o.snapshot_minute at time zone coalesce(sc.timezone, 'UTC')) as shift_date,
+  o.shift_id,
+  sc.shift_label,
+  avg(o.availability_pct)                                   as availability_pct,
+  avg(o.performance_pct)                                    as performance_pct,
+  avg(o.quality_pct)                                        as quality_pct,
+  avg(o.oee_pct)                                            as oee_pct,
+  sum(o.output_qty_delta)                                   as total_output_qty,
+  sum(o.downtime_min_delta)                                 as total_downtime_min,
+  sum(o.waste_qty_delta)                                    as total_waste_qty,
+  count(*)                                                  as snapshot_count,
+  count(distinct o.active_wo_id) filter (where o.active_wo_id is not null) as wo_count,
+  count(distinct de.id)                                     as downtime_event_count,
+  case when count(distinct de.id) > 0
+    then sum(o.downtime_min_delta)::numeric / count(distinct de.id)
+    else null
+  end                                                       as mttr_min,
+  case when count(distinct de.id) > 0
+    then (count(*) - sum(o.downtime_min_delta))::numeric / count(distinct de.id)
+    else null
+  end                                                       as mtbf_min,
+  max(o.snapshot_minute)                                    as last_snapshot_at
+from public.oee_snapshots o
+left join public.downtime_events de
+  on de.org_id = o.org_id
+  and de.line_id = o.line_id
+  and de.started_at between o.snapshot_minute - interval '1 minute' and o.snapshot_minute
+left join public.shift_configs sc
+  on sc.org_id = o.org_id and sc.shift_id = o.shift_id
+group by
+  o.org_id, o.site_id, o.line_id,
+  date(o.snapshot_minute at time zone coalesce(sc.timezone, 'UTC')),
+  o.shift_id, sc.shift_label
+with no data;
+
+-- UNIQUE index required for REFRESH MATERIALIZED VIEW CONCURRENTLY (V-OEE-AGG-5). Plain-column
+-- index (CONCURRENTLY rejects expression/partial unique indexes). The GROUP BY produces at most
+-- one row per (org_id, site_id, line_id, shift_date, shift_id) — including the NULL-site group —
+-- so a plain unique index never collides even though SQL NULLs are normally distinct.
+create unique index idx_oee_shift_pk on public.oee_shift_metrics
+  (org_id, site_id, line_id, shift_date, shift_id);
+create index idx_oee_shift_date on public.oee_shift_metrics (shift_date desc);
+
+-- MVs cannot host RLS policies (Postgres limitation) — org isolation is enforced at the service
+-- layer (where org_id = app.current_org_id()) AND because the underlying oee_snapshots is RLS-
+-- forced, the MV is only refreshable/visible by owner/refresh paths. app_user gets SELECT only.
+revoke all on public.oee_shift_metrics from public;
+grant select on public.oee_shift_metrics to app_user;
+
+-- ===========================================================================
+-- (7) oee_daily_summary MATERIALIZED VIEW (T-007, §9.2, tenant_id -> org_id, 90-day rolling).
+--   best/worst shift via correlated lookup against oee_shift_metrics. The PRD's illustrative
+--   sub-select referenced the source table inside GROUP BY (invalid SQL); rewritten as a CTE
+--   over the grouped daily rows joined to per-day best/worst shift from oee_shift_metrics.
+-- ===========================================================================
+drop materialized view if exists public.oee_daily_summary cascade;
+create materialized view public.oee_daily_summary as
+with daily as (
+  select
+    org_id,
+    site_id,
+    line_id,
+    date(snapshot_minute at time zone 'UTC')  as date,
+    avg(availability_pct)                      as availability_pct,
+    avg(performance_pct)                       as performance_pct,
+    avg(quality_pct)                           as quality_pct,
+    avg(oee_pct)                               as oee_pct,
+    max(oee_pct)                               as best_oee_pct,
+    min(oee_pct)                               as worst_oee_pct,
+    sum(output_qty_delta)                      as total_output,
+    sum(downtime_min_delta)                    as total_downtime_min,
+    sum(waste_qty_delta)                       as total_waste,
+    count(*)                                   as snapshot_count
+  from public.oee_snapshots
+  where snapshot_minute > now() - interval '90 days'
+  group by org_id, site_id, line_id, date(snapshot_minute at time zone 'UTC')
+)
+select
+  d.org_id,
+  d.site_id,
+  d.line_id,
+  d.date,
+  d.availability_pct,
+  d.performance_pct,
+  d.quality_pct,
+  d.oee_pct,
+  d.best_oee_pct,
+  d.worst_oee_pct,
+  d.total_output,
+  d.total_downtime_min,
+  d.total_waste,
+  d.snapshot_count,
+  (
+    select osm.shift_id from public.oee_shift_metrics osm
+    where osm.org_id = d.org_id and osm.line_id = d.line_id and osm.shift_date = d.date
+      and (osm.site_id is not distinct from d.site_id)
+    order by osm.oee_pct desc nulls last, osm.shift_id
+    limit 1
+  ) as best_shift_id,
+  (
+    select osm.shift_id from public.oee_shift_metrics osm
+    where osm.org_id = d.org_id and osm.line_id = d.line_id and osm.shift_date = d.date
+      and (osm.site_id is not distinct from d.site_id)
+    order by osm.oee_pct asc nulls last, osm.shift_id
+    limit 1
+  ) as worst_shift_id
+from daily d
+with no data;
+
+-- Plain-column unique index (CONCURRENTLY-compatible). GROUP BY guarantees one row per tuple.
+create unique index idx_oee_daily_pk on public.oee_daily_summary
+  (org_id, site_id, line_id, date);
+create index idx_oee_daily_date on public.oee_daily_summary (date desc);
+
+revoke all on public.oee_daily_summary from public;
+grant select on public.oee_daily_summary to app_user;
+
+-- ===========================================================================
+-- (8) DSL rule definitions (T-008 active + T-023 P2 stubs) — registered into the 02-settings
+--   rule_definitions registry (mig 039). 15-OEE registers rows; it does not own the table.
+--   shift_aggregator_v1 = P1 active. oee_anomaly_detector_v1 / oee_maintenance_trigger_v1 = P2
+--   stubs (active_to set in the past so they are inactive until the feature flag flips).
+--   Seeded per existing org (incl. Apex bootstrap) + AFTER INSERT trigger for new orgs.
+-- ===========================================================================
+create or replace function public.seed_oee_rule_definitions_for_org(p_org_id uuid)
+returns void
+language plpgsql
+security definer
+set search_path = pg_catalog
+as $$
+begin
+  -- P1 active aggregator.
+  insert into public.rule_definitions
+    (org_id, rule_code, rule_type, tier, definition_json, version, active_from, active_to)
+  select
+    p_org_id, 'shift_aggregator_v1', 'workflow', 'L1',
+    jsonb_build_object(
+      'module', '15-oee',
+      'trigger', 'shift_close',
+      'inputs', jsonb_build_array('oee_snapshots', 'downtime_events', 'shift_configs'),
+      'output_mv', 'oee_shift_metrics',
+      'emits', 'oee.shift.aggregated',
+      'active', true
+    ),
+    1, pg_catalog.now(), null
+  where not exists (
+    select 1 from public.rule_definitions
+    where org_id = p_org_id and rule_code = 'shift_aggregator_v1'
+  );
+
+  -- P2 anomaly detector stub (inactive — active_to in the past).
+  insert into public.rule_definitions
+    (org_id, rule_code, rule_type, tier, definition_json, version, active_from, active_to)
+  select
+    p_org_id, 'oee_anomaly_detector_v1', 'workflow', 'L1',
+    jsonb_build_object(
+      'module', '15-oee', 'phase', 'P2', 'feature_flag', 'oee.anomaly_detection_enabled',
+      'emits', 'oee.anomaly.detected', 'active', false
+    ),
+    1, pg_catalog.now(), pg_catalog.now()
+  where not exists (
+    select 1 from public.rule_definitions
+    where org_id = p_org_id and rule_code = 'oee_anomaly_detector_v1'
+  );
+
+  -- P2 maintenance trigger stub (inactive — active_to in the past).
+  insert into public.rule_definitions
+    (org_id, rule_code, rule_type, tier, definition_json, version, active_from, active_to)
+  select
+    p_org_id, 'oee_maintenance_trigger_v1', 'workflow', 'L1',
+    jsonb_build_object(
+      'module', '15-oee', 'phase', 'P2', 'feature_flag', 'oee.maintenance_trigger_enabled',
+      'emits', 'oee.anomaly.detected', 'active', false
+    ),
+    1, pg_catalog.now(), pg_catalog.now()
+  where not exists (
+    select 1 from public.rule_definitions
+    where org_id = p_org_id and rule_code = 'oee_maintenance_trigger_v1'
+  );
+end;
+$$;
+
+revoke all on function public.seed_oee_rule_definitions_for_org(uuid) from public;
+revoke all on function public.seed_oee_rule_definitions_for_org(uuid) from app_user;
+
+-- ===========================================================================
+-- (9) outbox CHECK regen — admit the 5 oee.* producer events. The enum<->CHECK drift gate
+--   (packages/outbox check-drift.test.ts) asserts THIS highest-numbered migration's CHECK string
+--   set === DB_EVENT_TYPES (events.enum.ts). Strict superset of 192 — no event dropped.
+-- ===========================================================================
+alter table public.outbox_events
+  drop constraint if exists outbox_events_event_type_check;
+
+alter table public.outbox_events
+  add constraint outbox_events_event_type_check check (
+    event_type in (
+      'audit.recorded',
+      'bom.initial_version_created',
+      'bom.version_submitted',
+      'brief.completed_for_project',
+      'brief.converted',
+      'brief.created',
+      'catch_weight.variance_exceeded',
+      'compliance_doc.deleted',
+      'compliance_doc.expired',
+      'compliance_doc.expiring',
+      'compliance_doc.uploaded',
+      'd365.cache.refreshed',
+      'fa.allergens_changed',
+      'fa.built',
+      'fa.built_reset',
+      'fa.cascade',
+      'fa.core_closed',
+      'fa.created',
+      'fa.deleted',
+      'fa.dept_closed',
+      'fa.dept_reopened',
+      'fa.edit',
+      'fa.intermediate_code_changed',
+      'fa.recipe_changed',
+      'fa.template_applied',
+      'fg.allergens_changed',
+      'fg.bom.released',
+      'fg.created',
+      'fg.edit',
+      'fg.intermediate_code_changed',
+      'fg.release_blocked',
+      'fg.released_to_factory',
+      'formulation.locked',
+      'formulation.submitted_for_trial',
+      'lp.received',
+      'manufacturing_operations.created',
+      'manufacturing_operations.deactivated',
+      'manufacturing_operations.reset_to_seed',
+      'manufacturing_operations.updated',
+      'npd.allergens.bulk_rebuild_completed',
+      'npd.builder.released_records_created',
+      'npd.fg_candidate_mapped',
+      'npd.gate.advanced',
+      'npd.gate.approved',
+      'npd.gate.reverted',
+      'npd.project.brief_mapped',
+      'npd.project.created',
+      'npd.project.legacy_stages_closed',
+      'npd.project.release_requested',
+      'oee.alert.threshold_breached',
+      'oee.anomaly.detected',
+      'oee.dsl_rule.updated',
+      'oee.shift.aggregated',
+      'oee.snapshot.refreshed',
+      'onboarding.first_wo_recorded',
+      'onboarding.step.advance',
+      'onboarding.step.back',
+      'onboarding.step.jump',
+      'onboarding.step.restart',
+      'onboarding.step.skip',
+      'org.created',
+      'org.mfa_enrollment.forced',
+      'org.security_policy.updated',
+      'production.allergen_changeover.validated',
+      'production.changeover.signed',
+      'production.consume.blocked',
+      'production.consume.completed',
+      'production.downtime.recorded',
+      'production.oee.snapshot',
+      'production.output.recorded',
+      'production.waste.recorded',
+      'production.wo.closed',
+      'production.wo.completed',
+      'production.wo.started',
+      'quality.atp_swab_failed',
+      'quality.recorded',
+      'reference.allergens_added_by_process.bulk_changed',
+      'reference.allergens_by_rm.bulk_changed',
+      'reference.csv.committed',
+      'reference.row.soft_deleted',
+      'reference.row.upserted',
+      'risk.created',
+      'role.assigned',
+      'rule.deployed',
+      'settings.core_flag.updated',
+      'settings.d365_sync.updated',
+      'settings.dept_override.updated',
+      'settings.ip_allowlist.changed',
+      'settings.line.upserted',
+      'settings.location.deleted',
+      'settings.location.imported',
+      'settings.location.upserted',
+      'settings.machine.upserted',
+      'settings.module.disabled',
+      'settings.module.enabled',
+      'settings.module.toggled',
+      'settings.notification_channel_updated',
+      'settings.notification_digest_updated',
+      'settings.notification_rule_updated',
+      'settings.org.created',
+      'settings.org.updated',
+      'settings.reference.row_updated',
+      'settings.role.assigned',
+      'settings.rule.deployed',
+      'settings.rule_variant.updated',
+      'settings.schema.migration_requested',
+      'settings.scim.token_created',
+      'settings.sso.config_changed',
+      'settings.upgrade.completed',
+      'settings.upgrade.promoted',
+      'settings.upgrade.rolled_back',
+      'settings.upgrade.scheduled',
+      'settings.user.accepted',
+      'settings.user.deactivated',
+      'settings.user.invitation_resent',
+      'settings.user.invited',
+      'settings.warehouse.deactivated',
+      'shipment.created',
+      'technical.factory_spec.approved',
+      'tenant.cohort.advanced',
+      'tenant.migration.run',
+      'tenant.migration.run.failed',
+      'unit_of_measure.conversion_created',
+      'unit_of_measure.created',
+      'unit_of_measure.soft_deleted',
+      'user.invited',
+      'warehouse.lp.received',
+      'warehouse.lp.shipped',
+      'warehouse.lp.transitioned',
+      'warehouse.material.consumed',
+      'wo.ready'
+    )
+  );
+
+comment on constraint outbox_events_event_type_check on public.outbox_events
+  is 'Regenerated from events.enum.ts DB_EVENT_TYPES (131 types incl oee.*).';
+
+-- ===========================================================================
+-- (10) oee.* RBAC permission seed (T-005 + T-026, recurring-live-bug X-1 class P0).
+--   ROOT CAUSE (same as 116/146/148/149/154/185/192): adding oee.* strings to the enum grants
+--   NOBODY access. The deployed org administrator is on the canonical org-admin role family,
+--   which receives NONE of the oee.* strings — so every OEE page/action 403s at live Gate-5.
+--
+--   Grants:
+--     * the COMPLETE oee.* set (13 strings) to the org-admin role family + oee_admin;
+--     * the supervisor subset (read + annotate + escalate + ack + exports) to oee_supervisor;
+--     * the viewer subset (read + exports) to oee_viewer;
+--   in BOTH role_permissions (normalized) and roles.permissions (legacy jsonb cache), for every
+--   existing org, with an AFTER INSERT trigger so new orgs inherit it. Models on 149/154/185/192.
+-- ===========================================================================
+create or replace function public.seed_oee_permissions_for_org(p_org_id uuid)
+returns void
+language plpgsql
+security definer
+set search_path = pg_catalog
+as $$
+declare
+  v_all_perms text[] := array[
+    'oee.dashboard.read',
+    'oee.target.edit',
+    'oee.override.create',
+    'oee.override.delete',
+    'oee.export.csv',
+    'oee.export.pdf',
+    'oee.anomaly.acknowledge',
+    'oee.big_loss.map_edit',
+    'oee.shift_pattern.edit',
+    'oee.shift_pattern.read',
+    'oee.downtime.annotate',
+    'oee.downtime.escalate',
+    'oee.tv.kiosk_view'
+  ];
+  -- oee_supervisor: read + analyse + annotate/escalate + acknowledge + exports + kiosk + read
+  -- shift patterns. NOT target.edit / override.* / big_loss.map_edit / shift_pattern.edit (admin).
+  v_supervisor_perms text[] := array[
+    'oee.dashboard.read',
+    'oee.export.csv',
+    'oee.export.pdf',
+    'oee.anomaly.acknowledge',
+    'oee.shift_pattern.read',
+    'oee.downtime.annotate',
+    'oee.downtime.escalate',
+    'oee.tv.kiosk_view'
+  ];
+  -- oee_viewer: read + exports + kiosk only (least privilege).
+  v_viewer_perms text[] := array[
+    'oee.dashboard.read',
+    'oee.export.csv',
+    'oee.export.pdf',
+    'oee.tv.kiosk_view'
+  ];
+  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin','oee_admin'];
+begin
+  -- --- Normalized storage (role_permissions) ---
+  insert into public.role_permissions (role_id, permission)
+  select r.id, p.permission
+  from public.roles r
+  cross join unnest(v_all_perms) as p(permission)
+  where r.org_id = p_org_id and r.code = any(v_admin_roles)
+  on conflict (role_id, permission) do nothing;
+
+  insert into public.role_permissions (role_id, permission)
+  select r.id, p.permission
+  from public.roles r
+  cross join unnest(v_supervisor_perms) as p(permission)
+  where r.org_id = p_org_id and r.code = 'oee_supervisor'
+  on conflict (role_id, permission) do nothing;
+
+  insert into public.role_permissions (role_id, permission)
+  select r.id, p.permission
+  from public.roles r
+  cross join unnest(v_viewer_perms) as p(permission)
+  where r.org_id = p_org_id and r.code = 'oee_viewer'
+  on conflict (role_id, permission) do nothing;
+
+  -- --- Legacy jsonb cache (roles.permissions) ---
+  update public.roles r
+     set permissions = coalesce(
+       (
+         select jsonb_agg(distinct merged.permission order by merged.permission)
+         from (
+           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
+           union all
+           select unnest(v_all_perms)
+         ) merged
+       ),
+       '[]'::jsonb
+     )
+   where r.org_id = p_org_id and r.code = any(v_admin_roles);
+
+  update public.roles r
+     set permissions = coalesce(
+       (
+         select jsonb_agg(distinct merged.permission order by merged.permission)
+         from (
+           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
+           union all
+           select unnest(v_supervisor_perms)
+         ) merged
+       ),
+       '[]'::jsonb
+     )
+   where r.org_id = p_org_id and r.code = 'oee_supervisor';
+
+  update public.roles r
+     set permissions = coalesce(
+       (
+         select jsonb_agg(distinct merged.permission order by merged.permission)
+         from (
+           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
+           union all
+           select unnest(v_viewer_perms)
+         ) merged
+       ),
+       '[]'::jsonb
+     )
+   where r.org_id = p_org_id and r.code = 'oee_viewer';
+end;
+$$;
+
+revoke all on function public.seed_oee_permissions_for_org(uuid) from public;
+revoke all on function public.seed_oee_permissions_for_org(uuid) from app_user;
+
+create or replace function public.seed_oee_module_on_org_insert()
+returns trigger
+language plpgsql
+security definer
+set search_path = pg_catalog
+as $$
+begin
+  perform public.seed_oee_permissions_for_org(new.id);
+  perform public.seed_oee_rule_definitions_for_org(new.id);
+  return new;
+end;
+$$;
+
+revoke all on function public.seed_oee_module_on_org_insert() from public;
+revoke all on function public.seed_oee_module_on_org_insert() from app_user;
+
+-- Fire after the 080 role-seeding trigger so admin roles already exist (zzz prefix).
+drop trigger if exists trg_zzz_seed_oee_module on public.organizations;
+create trigger trg_zzz_seed_oee_module
+  after insert on public.organizations
+  for each row
+  execute function public.seed_oee_module_on_org_insert();
+
+-- Backfill every existing org (perms + rule definitions).
+do $$
+declare
+  v_org_id uuid;
+begin
+  for v_org_id in select id from public.organizations loop
+    perform public.seed_oee_permissions_for_org(v_org_id);
+    perform public.seed_oee_rule_definitions_for_org(v_org_id);
+  end loop;
+end
+$$;
diff --git a/packages/db/migrations/204-planning-ext-scheduler-changeover.sql b/packages/db/migrations/204-planning-ext-scheduler-changeover.sql
new file mode 100644
index 00000000..692701e2
--- /dev/null
+++ b/packages/db/migrations/204-planning-ext-scheduler-changeover.sql
@@ -0,0 +1,334 @@
+-- Migration 204: 07-Planning-Extended — finite-capacity scheduler engine + the external
+-- changeover-matrix contract (consumed by 08-production) + extended finite-scheduling config.
+-- PRD: docs/prd/07-PLANNING-EXT-PRD.md §5.1, §9.1-§9.4, §6 D5, §15.4, OQ-EXT-09.
+-- Tasks: T-001 (scheduler_runs), T-002 (scheduler_assignments), T-003 (changeover_matrix +
+--   changeover_matrix_versions), T-008 (scheduler_config).
+--
+-- Built ON the 04-planning-basic schema (migs 176-179: work_orders / schedule_outputs / mrp /
+--   rough-cut capacity). This migration READS those tables at solve time and FK-references
+--   work_orders; it does NOT recreate or alter them.
+-- Canonical-owner separation (NEVER created/written here): wo_outputs + oee_snapshots +
+--   downtime_events = 08-production; schedule_outputs = 04-planning; license_plates = 05-warehouse;
+--   item_cost_history = 03-technical; quality_holds/ncr_reports = 09-quality.
+--
+-- Wave0 lock: org_id business scope (NOT tenant_id); RLS ENABLED + FORCED via app.current_org_id()
+--   (never raw GUC reads of the app.tenant_id / app.current_org_id session settings).
+-- site_id day-1: site_id uuid nullable on every operational table (no FK / registry yet); full
+--   per-site scoping (NOT NULL + (org_id, site_id) index + app.current_site_id() policy) lands
+--   later via the 14-multi-site backfill.
+-- NUMERIC-exact: all qty/duration/score/weight columns are NUMERIC or INTEGER (never float).
+-- Audit: app.audit_event() trigger + set_updated_at trigger on every table.
+--
+-- Section (E) at the END regenerates the outbox_events CHECK to the FULL vocabulary
+--   (events.enum.ts DB_EVENT_TYPES incl the 7 new planning.*/scheduler.*/matrix.* events) so the
+--   enum<->CHECK drift gate (packages/outbox check-drift.test.ts) stays green — this is now the
+--   highest-numbered migration that (re)creates the CHECK.
+
+-- ===========================================================================
+-- (A) scheduler_runs (T-001, §9.2) — finite-capacity solver run history.
+--     run_id UUID PK (R14 idempotency: caller-supplied UUID v7).
+-- ===========================================================================
+create table if not exists public.scheduler_runs (
+  run_id            uuid primary key default gen_random_uuid(),
+  org_id            uuid not null references public.organizations(id) on delete cascade,
+  site_id           uuid,                                            -- site_id day-1
+
+  requested_by      uuid references public.users(id) on delete set null,
+  status            text not null default 'queued',
+  horizon_days      integer not null,
+  line_ids          text[],                                          -- soft FK to 02-settings production_lines
+  include_forecast  text,
+  optimizer_version text not null default 'v2',
+  run_type          text not null default 'schedule',                -- OQ-EXT-09 dry-run reuse
+
+  input_snapshot    jsonb,
+  output_summary    jsonb,
+  solve_duration_ms integer,
+  error_message     text,
+
+  queued_at         timestamptz not null default pg_catalog.now(),
+  started_at        timestamptz,
+  completed_at      timestamptz,
+
+  created_at        timestamptz not null default pg_catalog.now(),
+  updated_at        timestamptz not null default pg_catalog.now(),
+
+  constraint scheduler_runs_status_check check (
+    status in ('queued', 'running', 'completed', 'failed', 'cancelled')
+  ),
+  constraint scheduler_runs_horizon_days_check check (horizon_days >= 1 and horizon_days <= 30),
+  constraint scheduler_runs_run_type_check check (
+    run_type in ('schedule', 'dry_run', 'what_if')
+  ),
+  constraint scheduler_runs_solve_duration_nonneg_check check (
+    solve_duration_ms is null or solve_duration_ms >= 0
+  )
+);
+
+create index if not exists idx_scheduler_runs_org_status
+  on public.scheduler_runs (org_id, status, queued_at);
+create index if not exists idx_scheduler_runs_requested_by
+  on public.scheduler_runs (requested_by, queued_at)
+  where requested_by is not null;
+
+alter table public.scheduler_runs enable row level security;
+alter table public.scheduler_runs force row level security;
+drop policy if exists scheduler_runs_org_context on public.scheduler_runs;
+create policy scheduler_runs_org_context on public.scheduler_runs
+  for all to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+revoke all on public.scheduler_runs from public;
+revoke all on public.scheduler_runs from app_user;
+grant select, insert, update, delete on public.scheduler_runs to app_user;
+
+drop trigger if exists scheduler_runs_audit on public.scheduler_runs;
+create trigger scheduler_runs_audit
+  after insert or update or delete on public.scheduler_runs
+  for each row execute function app.audit_event();
+drop trigger if exists scheduler_runs_set_updated_at on public.scheduler_runs;
+create trigger scheduler_runs_set_updated_at
+  before update on public.scheduler_runs
+  for each row execute function app.set_updated_at();
+
+-- ===========================================================================
+-- (B) scheduler_assignments (T-002, §9.3) — draft/approved/rejected/overridden WO assignments.
+--     run_id FK ON DELETE CASCADE; wo_id HARD FK to 04-planning work_orders.
+-- ===========================================================================
+create table if not exists public.scheduler_assignments (
+  id                          uuid primary key default gen_random_uuid(),
+  org_id                      uuid not null references public.organizations(id) on delete cascade,
+  site_id                     uuid,                                  -- site_id day-1
+
+  run_id                      uuid not null references public.scheduler_runs(run_id) on delete cascade,
+  wo_id                       uuid not null references public.work_orders(id) on delete cascade,
+  line_id                     text,                                  -- soft FK to 02-settings production_lines
+
+  status                      text not null default 'draft',
+  sequence_index              numeric(10, 2),
+  planned_start_at            timestamptz,
+  planned_end_at              timestamptz,
+  changeover_minutes          numeric(10, 2),
+  optimizer_score             numeric(10, 2),
+
+  override_original_line_id   text,
+  override_original_start_at  timestamptz,
+  override_reason_code        text,
+  override_by                 uuid references public.users(id) on delete set null,
+  override_at                 timestamptz,
+
+  approved_by                 uuid references public.users(id) on delete set null,
+  approved_at                 timestamptz,
+
+  ext                         jsonb not null default '{}'::jsonb,
+
+  created_at                  timestamptz not null default pg_catalog.now(),
+  updated_at                  timestamptz not null default pg_catalog.now(),
+
+  constraint scheduler_assignments_status_check check (
+    status in ('draft', 'approved', 'rejected', 'overridden')
+  ),
+  constraint scheduler_assignments_changeover_nonneg_check check (
+    changeover_minutes is null or changeover_minutes >= 0
+  ),
+  constraint scheduler_assignments_time_order_check check (
+    planned_end_at is null or planned_start_at is null or planned_start_at <= planned_end_at
+  )
+);
+
+create index if not exists idx_scheduler_assignments_run    on public.scheduler_assignments (run_id);
+create index if not exists idx_scheduler_assignments_wo     on public.scheduler_assignments (wo_id);
+create index if not exists idx_scheduler_assignments_status on public.scheduler_assignments (org_id, status);
+create index if not exists idx_scheduler_assignments_time   on public.scheduler_assignments (org_id, planned_start_at);
+create index if not exists idx_scheduler_assignments_override_by
+  on public.scheduler_assignments (override_by) where override_by is not null;
+create index if not exists idx_scheduler_assignments_approved_by
+  on public.scheduler_assignments (approved_by) where approved_by is not null;
+
+alter table public.scheduler_assignments enable row level security;
+alter table public.scheduler_assignments force row level security;
+drop policy if exists scheduler_assignments_org_context on public.scheduler_assignments;
+create policy scheduler_assignments_org_context on public.scheduler_assignments
+  for all to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+revoke all on public.scheduler_assignments from public;
+revoke all on public.scheduler_assignments from app_user;
+grant select, insert, update, delete on public.scheduler_assignments to app_user;
+
+drop trigger if exists scheduler_assignments_audit on public.scheduler_assignments;
+create trigger scheduler_assignments_audit
+  after insert or update or delete on public.scheduler_assignments
+  for each row execute function app.audit_event();
+drop trigger if exists scheduler_assignments_set_updated_at on public.scheduler_assignments;
+create trigger scheduler_assignments_set_updated_at
+  before update on public.scheduler_assignments
+  for each row execute function app.set_updated_at();
+
+-- ===========================================================================
+-- (C) changeover_matrix_versions + changeover_matrix (T-003, §9.4, §6 D5).
+--     The EXTERNAL changeover contract 08-production consumes (planned lookup), distinct from
+--     08's runtime changeover_events (recorded window, mig 184).
+-- ===========================================================================
+create table if not exists public.changeover_matrix_versions (
+  id             uuid primary key default gen_random_uuid(),
+  org_id         uuid not null references public.organizations(id) on delete cascade,
+  site_id        uuid,                                               -- site_id day-1
+
+  version_number integer not null,
+  label          text,
+  is_active      boolean not null default false,
+  status         text not null default 'draft',
+
+  published_by   uuid references public.users(id) on delete set null,
+  published_at   timestamptz,
+
+  created_by     uuid references public.users(id) on delete set null,
+  created_at     timestamptz not null default pg_catalog.now(),
+  updated_at     timestamptz not null default pg_catalog.now(),
+
+  constraint changeover_matrix_versions_org_version_unique unique (org_id, version_number),
+  constraint changeover_matrix_versions_status_check check (
+    status in ('draft', 'pending_review', 'active', 'archived')
+  ),
+  constraint changeover_matrix_versions_version_positive_check check (version_number >= 1)
+);
+
+-- D5: only ONE active version per org (partial unique on is_active=true).
+create unique index if not exists idx_changeover_active_per_org
+  on public.changeover_matrix_versions (org_id) where is_active = true;
+create index if not exists idx_changeover_matrix_versions_org
+  on public.changeover_matrix_versions (org_id);
+
+alter table public.changeover_matrix_versions enable row level security;
+alter table public.changeover_matrix_versions force row level security;
+drop policy if exists changeover_matrix_versions_org_context on public.changeover_matrix_versions;
+create policy changeover_matrix_versions_org_context on public.changeover_matrix_versions
+  for all to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+revoke all on public.changeover_matrix_versions from public;
+revoke all on public.changeover_matrix_versions from app_user;
+grant select, insert, update, delete on public.changeover_matrix_versions to app_user;
+
+drop trigger if exists changeover_matrix_versions_audit on public.changeover_matrix_versions;
+create trigger changeover_matrix_versions_audit
+  after insert or update or delete on public.changeover_matrix_versions
+  for each row execute function app.audit_event();
+drop trigger if exists changeover_matrix_versions_set_updated_at on public.changeover_matrix_versions;
+create trigger changeover_matrix_versions_set_updated_at
+  before update on public.changeover_matrix_versions
+  for each row execute function app.set_updated_at();
+
+create table if not exists public.changeover_matrix (
+  id                 uuid primary key default gen_random_uuid(),
+  org_id             uuid not null references public.organizations(id) on delete cascade,
+  site_id            uuid,                                           -- site_id day-1
+
+  version_id         uuid not null references public.changeover_matrix_versions(id) on delete cascade,
+  line_id            text,                                           -- D5: NULL = org default; non-NULL = per-line override
+  allergen_from      text not null,
+  allergen_to        text not null,
+  changeover_minutes numeric(10, 2) not null,
+  requires_cleaning  boolean not null default false,
+  requires_atp       boolean not null default false,
+  risk_level         text not null default 'low',
+  notes              text,
+
+  created_at         timestamptz not null default pg_catalog.now(),
+  updated_at         timestamptz not null default pg_catalog.now(),
+
+  -- NULL line_id (default) + a specific line_id (override) coexist for the same pair+version
+  -- because NULLs are distinct in a UNIQUE constraint.
+  constraint changeover_matrix_pair_unique unique (org_id, version_id, line_id, allergen_from, allergen_to),
+  constraint changeover_matrix_risk_level_check check (
+    risk_level in ('low', 'medium', 'high', 'segregated')
+  ),
+  constraint changeover_matrix_changeover_nonneg_check check (changeover_minutes >= 0)
+);
+
+create index if not exists idx_changeover_matrix_version  on public.changeover_matrix (version_id);
+create index if not exists idx_changeover_matrix_org_pair on public.changeover_matrix (org_id, allergen_from, allergen_to);
+create index if not exists idx_changeover_matrix_line     on public.changeover_matrix (line_id) where line_id is not null;
+
+alter table public.changeover_matrix enable row level security;
+alter table public.changeover_matrix force row level security;
+drop policy if exists changeover_matrix_org_context on public.changeover_matrix;
+create policy changeover_matrix_org_context on public.changeover_matrix
+  for all to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+revoke all on public.changeover_matrix from public;
+revoke all on public.changeover_matrix from app_user;
+grant select, insert, update, delete on public.changeover_matrix to app_user;
+
+drop trigger if exists changeover_matrix_audit on public.changeover_matrix;
+create trigger changeover_matrix_audit
+  after insert or update or delete on public.changeover_matrix
+  for each row execute function app.audit_event();
+drop trigger if exists changeover_matrix_set_updated_at on public.changeover_matrix;
+create trigger changeover_matrix_set_updated_at
+  before update on public.changeover_matrix
+  for each row execute function app.set_updated_at();
+
+-- ===========================================================================
+-- (D) scheduler_config (T-008, PLE-005) — extended finite-capacity / sequencing config.
+--     One row per (org_id, line_id) scope; line_id NULL = org-wide default.
+-- ===========================================================================
+create table if not exists public.scheduler_config (
+  id                     uuid primary key default gen_random_uuid(),
+  org_id                 uuid not null references public.organizations(id) on delete cascade,
+  site_id                uuid,                                       -- site_id day-1
+  line_id                text,                                       -- NULL = org default; non-NULL = per-line override
+
+  default_horizon_days   integer not null default 7,
+  optimizer_version      text not null default 'v2',
+  sequencing_strategy    text not null default 'greedy',
+  capacity_hours_per_day numeric(8, 2),
+  changeover_weight      numeric(6, 4) not null default 1.0000,
+  duedate_weight         numeric(6, 4) not null default 1.0000,
+  utilization_weight     numeric(6, 4) not null default 1.0000,
+  respect_pm_windows     boolean not null default true,
+  allow_alternate_routings boolean not null default false,
+  params                 jsonb not null default '{}'::jsonb,
+
+  created_by             uuid references public.users(id) on delete set null,
+  updated_by             uuid references public.users(id) on delete set null,
+  created_at             timestamptz not null default pg_catalog.now(),
+  updated_at             timestamptz not null default pg_catalog.now(),
+
+  constraint scheduler_config_org_line_unique unique (org_id, line_id),
+  constraint scheduler_config_horizon_check check (
+    default_horizon_days >= 1 and default_horizon_days <= 30
+  ),
+  constraint scheduler_config_strategy_check check (
+    sequencing_strategy in ('greedy', 'local_search', 'allergen_optimized')
+  ),
+  constraint scheduler_config_capacity_nonneg_check check (
+    capacity_hours_per_day is null or capacity_hours_per_day >= 0
+  )
+);
+
+create index if not exists idx_scheduler_config_org  on public.scheduler_config (org_id);
+create index if not exists idx_scheduler_config_line on public.scheduler_config (line_id) where line_id is not null;
+
+alter table public.scheduler_config enable row level security;
+alter table public.scheduler_config force row level security;
+drop policy if exists scheduler_config_org_context on public.scheduler_config;
+create policy scheduler_config_org_context on public.scheduler_config
+  for all to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+revoke all on public.scheduler_config from public;
+revoke all on public.scheduler_config from app_user;
+grant select, insert, update, delete on public.scheduler_config to app_user;
+
+drop trigger if exists scheduler_config_audit on public.scheduler_config;
+create trigger scheduler_config_audit
+  after insert or update or delete on public.scheduler_config
+  for each row execute function app.audit_event();
+drop trigger if exists scheduler_config_set_updated_at on public.scheduler_config;
+create trigger scheduler_config_set_updated_at
+  before update on public.scheduler_config
+  for each row execute function app.set_updated_at();
+
diff --git a/packages/db/migrations/211-shipping-schema-foundation.sql b/packages/db/migrations/211-shipping-schema-foundation.sql
new file mode 100644
index 00000000..628b3051
--- /dev/null
+++ b/packages/db/migrations/211-shipping-schema-foundation.sql
@@ -0,0 +1,733 @@
+-- Migration 211: 11-Shipping — SCHEMA foundation.
+--   Customer domain (customers + customer_contacts + customer_addresses +
+--   customer_allergen_restrictions), sales orders (sales_orders + sales_order_lines), inventory
+--   allocations (inventory_allocations), picking (waves + pick_lists + pick_list_lines), shipments
+--   (shipments + shipment_boxes + shipment_box_contents + per-org sscc_counters + SSCC functions),
+--   and bill_of_lading.
+-- PRD: docs/prd/11-SHIPPING-PRD.md §9.1 (tables), §6 D-SHP-7 RLS, §6 D-SHP-8 SO status machine,
+--   §6 D-SHP-13 hold gate, §13.1 SSCC-18, §14.4 BRCGS BOL retention. Tasks T-001/T-006/T-011/
+--   T-015/T-018 (+ BOL slice of T-023). SCHEMA-ONLY — status-machine enforcement + Server Actions
+--   live in T-002/T-007/T-012/T-016/T-020/T-023.
+--
+-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id()
+--   (foundation function, 002-rls-baseline.sql — never redefined, never read as a raw
+--   current_setting GUC).
+-- site_id day-1: site_id uuid is NULLABLE on every operational table, no FK, no registry — full
+--   per-site scoping ((org_id, site_id) policy + app.current_site_id()) lands later via 14-MS T-030.
+-- NUMERIC-exact: every money/qty/weight column is NUMERIC (never float).
+-- Audit (R13): embedded created_by/created_at/updated_at/updated_by/deleted_at columns + a local
+--   shipping_set_updated_at trigger (matches production migs 181-185 / warehouse 191 / quality 197).
+-- Cross-module FKs are SOFT uuids (no .references()) to avoid coupling migration ordering across
+--   modules: product_id (01-NPD/03-Technical product FG SSOT — NO parallel fa_id), license_plate_id
+--   (05-Warehouse license_plates — READ-ONLY here; consumed for ship via warehouse.lp.ship),
+--   allergen_id (02-Settings reference rows), location_id / warehouse_id.
+-- Canonical-owner separation: this migration creates ONLY 11-shipping tables. It does NOT create
+--   wo_outputs / oee_snapshots / downtime_events (08-production), schedule_outputs (04-planning),
+--   license_plates (05-warehouse), item_cost_history (03-technical), quality_holds / ncr_reports /
+--   v_active_holds (09-quality). The LP qa-status gate READS v_active_holds via holdsGuard.
+
+-- ===========================================================================
+-- Per-org human-readable numbering sequences (SO-/PL-/WV-/SH-/BOL-, START 1).
+-- Drizzle .references() would create a global counter; per-org numbering is enforced by the
+-- generated-number-column UNIQUE (org_id, *_number) below. These global sequences feed the *_seq
+-- bigint; the *_number is derived per-row.
+-- ===========================================================================
+create sequence if not exists public.sales_order_seq start 1;
+create sequence if not exists public.pick_list_seq start 1;
+create sequence if not exists public.wave_seq start 1;
+create sequence if not exists public.shipment_seq start 1;
+create sequence if not exists public.bol_seq start 1;
+
+-- ===========================================================================
+-- shipping_set_updated_at — R13 embedded-audit trigger (sets updated_at on UPDATE).
+-- ===========================================================================
+create or replace function public.shipping_set_updated_at()
+returns trigger
+language plpgsql
+as $$
+begin
+  new.updated_at := pg_catalog.now();
+  return new;
+end;
+$$;
+
+-- Human-readable number assignment (<PREFIX>-YYYY-NNNNN) — one trigger function per prefix/column,
+-- populated at INSERT time (now() is not IMMUTABLE so the number cannot be a GENERATED column).
+-- The (org_id, <number>) UNIQUE index + the global *_seq bigint keep numbers unique. The year is a
+-- presentation prefix; cross-year uniqueness still holds because the seq is monotonic.
+create or replace function public.shipping_set_sales_order_number()
+returns trigger language plpgsql as $$
+begin
+  if new.order_number is null then
+    new.order_number := 'SO-' || to_char(new.created_at, 'YYYY') || '-' || lpad(new.order_seq::text, 5, '0');
+  end if;
+  return new;
+end;
+$$;
+
+create or replace function public.shipping_set_wave_number()
+returns trigger language plpgsql as $$
+begin
+  if new.wave_number is null then
+    new.wave_number := 'WV-' || to_char(new.created_at, 'YYYY') || '-' || lpad(new.wave_seq::text, 5, '0');
+  end if;
+  return new;
+end;
+$$;
+
+create or replace function public.shipping_set_pick_list_number()
+returns trigger language plpgsql as $$
+begin
+  if new.pick_list_number is null then
+    new.pick_list_number := 'PL-' || to_char(new.created_at, 'YYYY') || '-' || lpad(new.pick_list_seq::text, 5, '0');
+  end if;
+  return new;
+end;
+$$;
+
+create or replace function public.shipping_set_shipment_number()
+returns trigger language plpgsql as $$
+begin
+  if new.shipment_number is null then
+    new.shipment_number := 'SH-' || to_char(new.created_at, 'YYYY') || '-' || lpad(new.shipment_seq::text, 5, '0');
+  end if;
+  return new;
+end;
+$$;
+
+create or replace function public.shipping_set_bol_number()
+returns trigger language plpgsql as $$
+begin
+  if new.bol_number is null then
+    new.bol_number := 'BOL-' || to_char(new.created_at, 'YYYY') || '-' || lpad(new.bol_seq::text, 5, '0');
+  end if;
+  return new;
+end;
+$$;
+
+-- ===========================================================================
+-- customers (T-001).
+-- ===========================================================================
+create table if not exists public.customers (
+  id                    uuid primary key default gen_random_uuid(),
+  org_id                uuid not null references public.organizations(id) on delete cascade,
+  site_id               uuid,
+  customer_code         text not null,
+  name                  text not null,
+  email                 text,
+  phone                 text,
+  tax_id                text,
+  category              text not null default 'retail',
+  allergen_restrictions jsonb not null default '[]'::jsonb,
+  credit_limit_gbp      numeric(14, 2),
+  is_active             boolean not null default true,
+  ext_data              jsonb not null default '{}'::jsonb,
+  created_at            timestamptz not null default pg_catalog.now(),
+  created_by            uuid,
+  updated_at            timestamptz not null default pg_catalog.now(),
+  updated_by            uuid,
+  deleted_at            timestamptz,
+  constraint customers_category_check check (category in ('retail', 'wholesale', 'distributor'))
+);
+create unique index if not exists customers_org_code_uq on public.customers (org_id, customer_code);
+create index if not exists customers_org_idx on public.customers (org_id);
+create index if not exists customers_org_site_idx on public.customers (org_id, site_id);
+
+-- ===========================================================================
+-- customer_contacts (T-001).
+-- ===========================================================================
+create table if not exists public.customer_contacts (
+  id          uuid primary key default gen_random_uuid(),
+  org_id      uuid not null references public.organizations(id) on delete cascade,
+  customer_id uuid not null references public.customers(id) on delete cascade,
+  name        text not null,
+  title       text,
+  email       text,
+  phone       text,
+  is_primary  boolean not null default false,
+  created_at  timestamptz not null default pg_catalog.now(),
+  created_by  uuid,
+  updated_at  timestamptz not null default pg_catalog.now(),
+  updated_by  uuid,
+  deleted_at  timestamptz
+);
+create index if not exists customer_contacts_org_idx on public.customer_contacts (org_id);
+create index if not exists customer_contacts_customer_idx on public.customer_contacts (customer_id);
+
+-- ===========================================================================
+-- customer_addresses (T-001).
+-- ===========================================================================
+create table if not exists public.customer_addresses (
+  id            uuid primary key default gen_random_uuid(),
+  org_id        uuid not null references public.organizations(id) on delete cascade,
+  customer_id   uuid not null references public.customers(id) on delete cascade,
+  address_type  text not null,
+  is_default    boolean not null default false,
+  address_line1 text not null,
+  address_line2 text,
+  city          text not null,
+  state         text,
+  postal_code   text not null,
+  country_iso2  char(2) not null,
+  dock_hours    jsonb,
+  notes         text,
+  created_at    timestamptz not null default pg_catalog.now(),
+  created_by    uuid,
+  updated_at    timestamptz not null default pg_catalog.now(),
+  updated_by    uuid,
+  deleted_at    timestamptz,
+  constraint customer_addresses_address_type_check check (address_type in ('billing', 'shipping'))
+);
+create index if not exists customer_addresses_org_idx on public.customer_addresses (org_id);
+create index if not exists customer_addresses_customer_type_idx
+  on public.customer_addresses (org_id, customer_id, address_type);
+
+-- ===========================================================================
+-- customer_allergen_restrictions (T-001). allergen_id soft FK to 02-Settings allergen_families.
+-- ===========================================================================
+create table if not exists public.customer_allergen_restrictions (
+  id               uuid primary key default gen_random_uuid(),
+  org_id           uuid not null references public.organizations(id) on delete cascade,
+  customer_id      uuid not null references public.customers(id) on delete cascade,
+  allergen_id      uuid not null,
+  restriction_type text not null,
+  notes            text,
+  created_at       timestamptz not null default pg_catalog.now(),
+  created_by       uuid,
+  updated_at       timestamptz not null default pg_catalog.now(),
+  updated_by       uuid,
+  deleted_at       timestamptz,
+  constraint customer_allergen_restrictions_type_check
+    check (restriction_type in ('refuses', 'requires_decl'))
+);
+create unique index if not exists customer_allergen_restrictions_uq
+  on public.customer_allergen_restrictions (org_id, customer_id, allergen_id);
+create index if not exists customer_allergen_restrictions_org_idx
+  on public.customer_allergen_restrictions (org_id);
+
+-- ===========================================================================
+-- sales_orders (T-006). order_number GENERATED 'SO-YYYY-NNNNN' from order_seq. status machine
+-- ENFORCEMENT is T-007; the CHECK here only restricts the vocabulary (D-SHP-8 12 states).
+-- ===========================================================================
+create table if not exists public.sales_orders (
+  id                     uuid primary key default gen_random_uuid(),
+  org_id                 uuid not null references public.organizations(id) on delete cascade,
+  site_id                uuid,
+  order_seq              bigint not null default nextval('public.sales_order_seq'),
+  -- order_number ('SO-YYYY-NNNNN') is populated by the sales_orders_set_number BEFORE INSERT
+  -- trigger (now() is not IMMUTABLE so it cannot be a GENERATED column).
+  order_number           text,
+  customer_id            uuid not null references public.customers(id) on delete restrict,
+  customer_po            text,
+  shipping_address_id    uuid references public.customer_addresses(id) on delete set null,
+  order_date             date not null,
+  promised_ship_date     date,
+  required_delivery_date date,
+  status                 text not null default 'draft',
+  total_amount_gbp       numeric(14, 2),
+  allergen_validated     boolean not null default false,
+  confirmed_at           timestamptz,
+  confirmed_by           uuid,
+  shipped_at             timestamptz,
+  ext_data               jsonb not null default '{}'::jsonb,
+  created_at             timestamptz not null default pg_catalog.now(),
+  created_by             uuid,
+  updated_at             timestamptz not null default pg_catalog.now(),
+  updated_by             uuid,
+  deleted_at             timestamptz,
+  constraint sales_orders_status_check check (
+    status in ('draft', 'confirmed', 'allocated', 'partially_picked', 'picked',
+               'partially_packed', 'packed', 'manifested', 'shipped',
+               'partially_delivered', 'delivered', 'cancelled')
+  ),
+  constraint sales_orders_ship_date_check check (
+    promised_ship_date is null or promised_ship_date >= order_date
+  )
+);
+create unique index if not exists sales_orders_org_number_uq on public.sales_orders (org_id, order_number);
+create index if not exists sales_orders_org_idx on public.sales_orders (org_id);
+create index if not exists sales_orders_org_site_idx on public.sales_orders (org_id, site_id);
+create index if not exists sales_orders_customer_idx on public.sales_orders (customer_id);
+create index if not exists sales_orders_status_idx on public.sales_orders (org_id, status);
+
+-- ===========================================================================
+-- sales_order_lines (T-006). product_id soft FK to product FG SSOT (NO parallel fa_id).
+-- ===========================================================================
+create table if not exists public.sales_order_lines (
+  id                 uuid primary key default gen_random_uuid(),
+  org_id             uuid not null references public.organizations(id) on delete cascade,
+  sales_order_id     uuid not null references public.sales_orders(id) on delete cascade,
+  line_number        integer not null,
+  product_id         uuid not null,
+  quantity_ordered   numeric(14, 3) not null,
+  quantity_allocated numeric(14, 3) not null default 0,
+  quantity_picked    numeric(14, 3) not null default 0,
+  quantity_packed    numeric(14, 3) not null default 0,
+  quantity_shipped   numeric(14, 3) not null default 0,
+  unit_price_gbp     numeric(14, 4) not null,
+  line_total_gbp     numeric(14, 4),
+  requested_lot      text,
+  notes              text,
+  ext_data           jsonb not null default '{}'::jsonb,
+  created_at         timestamptz not null default pg_catalog.now(),
+  created_by         uuid,
+  updated_at         timestamptz not null default pg_catalog.now(),
+  updated_by         uuid,
+  deleted_at         timestamptz,
+  constraint sales_order_lines_so_line_uq unique (sales_order_id, line_number),
+  constraint sales_order_lines_qty_check check (quantity_ordered > 0),
+  constraint sales_order_lines_price_check check (unit_price_gbp > 0)
+);
+create index if not exists sales_order_lines_org_idx on public.sales_order_lines (org_id);
+create index if not exists sales_order_lines_so_idx on public.sales_order_lines (sales_order_id);
+create index if not exists sales_order_lines_product_idx on public.sales_order_lines (org_id, product_id);
+
+-- ===========================================================================
+-- inventory_allocations (T-011). license_plate_id soft FK to 05-Warehouse license_plates.
+-- NOT cascade-deleted from sales_orders (release flow handles orphans).
+-- ===========================================================================
+create table if not exists public.inventory_allocations (
+  id                   uuid primary key default gen_random_uuid(),
+  org_id               uuid not null references public.organizations(id) on delete cascade,
+  site_id              uuid,
+  sales_order_line_id  uuid not null references public.sales_order_lines(id) on delete cascade,
+  license_plate_id     uuid not null,
+  quantity_allocated   numeric(14, 3) not null,
+  status               text not null default 'allocated',
+  override_reason_code text,
+  override_by          uuid,
+  allocated_at         timestamptz not null default pg_catalog.now(),
+  released_at          timestamptz,
+  ext_data             jsonb not null default '{}'::jsonb,
+  created_at           timestamptz not null default pg_catalog.now(),
+  created_by           uuid,
+  updated_at           timestamptz not null default pg_catalog.now(),
+  updated_by           uuid,
+  deleted_at           timestamptz,
+  constraint inventory_allocations_qty_check check (quantity_allocated > 0),
+  constraint inventory_allocations_status_check
+    check (status in ('allocated', 'picked', 'released', 'cancelled'))
+);
+create index if not exists inventory_allocations_org_idx on public.inventory_allocations (org_id);
+create index if not exists inventory_allocations_so_line_idx
+  on public.inventory_allocations (sales_order_line_id);
+create index if not exists inventory_allocations_lp_idx
+  on public.inventory_allocations (org_id, license_plate_id);
+
+-- ===========================================================================
+-- waves (T-015). wave_number GENERATED 'WV-YYYY-NNNNN'.
+-- ===========================================================================
+create table if not exists public.waves (
+  id            uuid primary key default gen_random_uuid(),
+  org_id        uuid not null references public.organizations(id) on delete cascade,
+  site_id       uuid,
+  wave_seq      bigint not null default nextval('public.wave_seq'),
+  wave_number   text, -- 'WV-YYYY-NNNNN' populated by waves_set_number BEFORE INSERT trigger.
+  status        text not null default 'unreleased',
+  planned_start timestamptz,
+  released_at   timestamptz,
+  completed_at  timestamptz,
+  ext_data      jsonb not null default '{}'::jsonb,
+  created_at    timestamptz not null default pg_catalog.now(),
+  created_by    uuid,
+  updated_at    timestamptz not null default pg_catalog.now(),
+  updated_by    uuid,
+  deleted_at    timestamptz,
+  constraint waves_status_check check (status in ('unreleased', 'released', 'in_pick', 'completed'))
+);
+create unique index if not exists waves_org_number_uq on public.waves (org_id, wave_number);
+create index if not exists waves_org_idx on public.waves (org_id);
+
+-- ===========================================================================
+-- pick_lists (T-015). pick_list_number GENERATED 'PL-YYYY-NNNNN'. NOT cascade from sales_orders.
+-- ===========================================================================
+create table if not exists public.pick_lists (
+  id               uuid primary key default gen_random_uuid(),
+  org_id           uuid not null references public.organizations(id) on delete cascade,
+  site_id          uuid,
+  pick_list_seq    bigint not null default nextval('public.pick_list_seq'),
+  pick_list_number text, -- 'PL-YYYY-NNNNN' populated by pick_lists_set_number BEFORE INSERT trigger.
+  pick_type        text not null default 'single_order',
+  status           text not null default 'pending',
+  priority         integer not null default 3,
+  assigned_to      uuid references public.users(id) on delete set null,
+  wave_id          uuid references public.waves(id) on delete set null,
+  sales_order_id   uuid references public.sales_orders(id) on delete set null,
+  started_at       timestamptz,
+  completed_at     timestamptz,
+  ext_data         jsonb not null default '{}'::jsonb,
+  created_at       timestamptz not null default pg_catalog.now(),
+  created_by       uuid,
+  updated_at       timestamptz not null default pg_catalog.now(),
+  updated_by       uuid,
+  deleted_at       timestamptz,
+  constraint pick_lists_pick_type_check check (pick_type in ('single_order', 'wave')),
+  constraint pick_lists_status_check
+    check (status in ('pending', 'assigned', 'in_progress', 'completed', 'cancelled')),
+  constraint pick_lists_priority_check check (priority between 1 and 5)
+);
+create unique index if not exists pick_lists_org_number_uq on public.pick_lists (org_id, pick_list_number);
+create index if not exists pick_lists_org_idx on public.pick_lists (org_id);
+create index if not exists pick_lists_org_site_idx on public.pick_lists (org_id, site_id);
+create index if not exists pick_lists_assigned_idx on public.pick_lists (org_id, assigned_to);
+create index if not exists pick_lists_wave_idx on public.pick_lists (wave_id);
+create index if not exists pick_lists_so_idx on public.pick_lists (sales_order_id);
+
+-- ===========================================================================
+-- pick_list_lines (T-015). license_plate_id / picked_license_plate_id soft FK to 05.
+-- ===========================================================================
+create table if not exists public.pick_list_lines (
+  id                      uuid primary key default gen_random_uuid(),
+  org_id                  uuid not null references public.organizations(id) on delete cascade,
+  pick_list_id            uuid not null references public.pick_lists(id) on delete cascade,
+  sales_order_line_id     uuid references public.sales_order_lines(id) on delete set null,
+  license_plate_id        uuid,
+  picked_license_plate_id uuid,
+  location_id             uuid,
+  product_id              uuid,
+  lot_number              text,
+  quantity_to_pick        numeric(14, 3) not null,
+  quantity_picked         numeric(14, 3) not null default 0,
+  pick_sequence           integer,
+  status                  text not null default 'pending',
+  picked_at               timestamptz,
+  picked_by               uuid,
+  ext_data                jsonb not null default '{}'::jsonb,
+  created_at              timestamptz not null default pg_catalog.now(),
+  created_by              uuid,
+  updated_at              timestamptz not null default pg_catalog.now(),
+  updated_by              uuid,
+  deleted_at              timestamptz,
+  constraint pick_list_lines_qty_check check (quantity_to_pick > 0),
+  constraint pick_list_lines_status_check check (status in ('pending', 'picked', 'short'))
+);
+create index if not exists pick_list_lines_org_idx on public.pick_list_lines (org_id);
+create index if not exists pick_list_lines_pick_list_idx on public.pick_list_lines (pick_list_id);
+create index if not exists pick_list_lines_so_line_idx on public.pick_list_lines (sales_order_line_id);
+
+-- ===========================================================================
+-- shipments (T-018). shipment_number GENERATED 'SH-YYYY-NNNNN'. NOT cascade from sales_orders.
+-- ===========================================================================
+create table if not exists public.shipments (
+  id                  uuid primary key default gen_random_uuid(),
+  org_id              uuid not null references public.organizations(id) on delete cascade,
+  site_id             uuid,
+  shipment_seq        bigint not null default nextval('public.shipment_seq'),
+  shipment_number     text, -- 'SH-YYYY-NNNNN' populated by shipments_set_number BEFORE INSERT trigger.
+  sales_order_id      uuid references public.sales_orders(id) on delete restrict,
+  customer_id         uuid references public.customers(id) on delete restrict,
+  shipping_address_id uuid references public.customer_addresses(id) on delete set null,
+  status              text not null default 'pending',
+  carrier             text,
+  service_level       text,
+  tracking_number     text,
+  total_weight_kg     numeric(12, 3),
+  total_boxes         integer,
+  dock_door_id        uuid,
+  staged_location_id  uuid,
+  packed_at           timestamptz,
+  packed_by           uuid,
+  shipped_at          timestamptz,
+  shipped_by          uuid,
+  delivered_at        timestamptz,
+  bol_pdf_url         text,
+  bol_signed_pdf_url  text,
+  ext_data            jsonb not null default '{}'::jsonb,
+  created_at          timestamptz not null default pg_catalog.now(),
+  created_by          uuid,
+  updated_at          timestamptz not null default pg_catalog.now(),
+  updated_by          uuid,
+  deleted_at          timestamptz,
+  constraint shipments_status_check check (
+    status in ('pending', 'packing', 'packed', 'manifested', 'shipped', 'delivered', 'exception')
+  )
+);
+create unique index if not exists shipments_org_number_uq on public.shipments (org_id, shipment_number);
+create index if not exists shipments_org_idx on public.shipments (org_id);
+create index if not exists shipments_org_site_idx on public.shipments (org_id, site_id);
+create index if not exists shipments_so_idx on public.shipments (sales_order_id);
+create index if not exists shipments_customer_idx on public.shipments (customer_id);
+
+-- ===========================================================================
+-- shipment_boxes (T-018). sscc varchar(18), 18-digit CHECK, UNIQUE per org.
+-- ===========================================================================
+create table if not exists public.shipment_boxes (
+  id               uuid primary key default gen_random_uuid(),
+  org_id           uuid not null references public.organizations(id) on delete cascade,
+  shipment_id      uuid not null references public.shipments(id) on delete cascade,
+  box_number       integer not null,
+  sscc             varchar(18),
+  weight_kg        numeric(10, 3),
+  actual_weight_kg numeric(10, 3),
+  length_cm        numeric(8, 2),
+  width_cm         numeric(8, 2),
+  height_cm        numeric(8, 2),
+  tracking_number  text,
+  ext_data         jsonb not null default '{}'::jsonb,
+  created_at       timestamptz not null default pg_catalog.now(),
+  created_by       uuid,
+  updated_at       timestamptz not null default pg_catalog.now(),
+  updated_by       uuid,
+  deleted_at       timestamptz,
+  constraint shipment_boxes_sscc_check check (sscc is null or sscc ~ '^[0-9]{18}$')
+);
+create unique index if not exists shipment_boxes_org_sscc_uq on public.shipment_boxes (org_id, sscc);
+create index if not exists shipment_boxes_org_idx on public.shipment_boxes (org_id);
+create index if not exists shipment_boxes_shipment_idx on public.shipment_boxes (shipment_id);
+
+-- ===========================================================================
+-- shipment_box_contents (T-018). license_plate_id soft FK to 05 (consumed via warehouse.lp.ship).
+-- ===========================================================================
+create table if not exists public.shipment_box_contents (
+  id                  uuid primary key default gen_random_uuid(),
+  org_id              uuid not null references public.organizations(id) on delete cascade,
+  shipment_box_id     uuid not null references public.shipment_boxes(id) on delete cascade,
+  sales_order_line_id uuid references public.sales_order_lines(id) on delete set null,
+  product_id          uuid,
+  license_plate_id    uuid,
+  lot_number          text,
+  quantity            numeric(14, 3),
+  actual_weight_kg    numeric(10, 3),
+  ext_data            jsonb not null default '{}'::jsonb,
+  created_at          timestamptz not null default pg_catalog.now(),
+  created_by          uuid,
+  updated_at          timestamptz not null default pg_catalog.now(),
+  updated_by          uuid,
+  deleted_at          timestamptz
+);
+create index if not exists shipment_box_contents_org_idx on public.shipment_box_contents (org_id);
+create index if not exists shipment_box_contents_box_idx on public.shipment_box_contents (shipment_box_id);
+create index if not exists shipment_box_contents_lp_idx
+  on public.shipment_box_contents (org_id, license_plate_id);
+
+-- ===========================================================================
+-- bill_of_lading (BOL slice of T-023). BRCGS §14.4: SHA-256 hash + 7y retention.
+-- retention_until = COALESCE(signed_at, created_at) + 7y, trigger-maintained.
+-- ===========================================================================
+create table if not exists public.bill_of_lading (
+  id                uuid primary key default gen_random_uuid(),
+  org_id            uuid not null references public.organizations(id) on delete cascade,
+  site_id           uuid,
+  bol_seq           bigint not null default nextval('public.bol_seq'),
+  bol_number        text, -- 'BOL-YYYY-NNNNN' populated by bill_of_lading_set_number BEFORE INSERT trigger.
+  shipment_id       uuid not null references public.shipments(id) on delete restrict,
+  status            text not null default 'draft',
+  carrier           text,
+  pro_number        text,
+  pdf_url           text,
+  pdf_sha256        char(64),
+  signed_pdf_url    text,
+  signed_pdf_sha256 char(64),
+  signed_at         timestamptz,
+  signed_by         uuid,
+  issued_at         timestamptz,
+  retention_until   date default ((pg_catalog.now()::date) + interval '7 years')::date,
+  ext_data          jsonb not null default '{}'::jsonb,
+  created_at        timestamptz not null default pg_catalog.now(),
+  created_by        uuid,
+  updated_at        timestamptz not null default pg_catalog.now(),
+  updated_by        uuid,
+  deleted_at        timestamptz,
+  constraint bill_of_lading_status_check check (status in ('draft', 'issued', 'signed', 'cancelled'))
+);
+create unique index if not exists bill_of_lading_org_number_uq on public.bill_of_lading (org_id, bol_number);
+create index if not exists bill_of_lading_org_idx on public.bill_of_lading (org_id);
+create index if not exists bill_of_lading_shipment_idx on public.bill_of_lading (shipment_id);
+
+-- bill_of_lading retention_until (BRCGS 7y from COALESCE(signed_at, created_at)) — trigger-maintained
+-- (timestamptz::date + interval is not immutable, so not a GENERATED STORED column).
+create or replace function public.bill_of_lading_set_updated_at_retention()
+returns trigger
+language plpgsql
+as $$
+begin
+  new.updated_at := pg_catalog.now();
+  new.retention_until := (coalesce(new.signed_at, new.created_at)::date + interval '7 years')::date;
+  return new;
+end;
+$$;
+
+-- ===========================================================================
+-- sscc_counters + SSCC functions (T-018, §13.1).
+--   next_sscc_serial(org)  — atomic per-org serial (row-locked UPDATE ... RETURNING; no gaps).
+--   sscc_mod10(sscc17)     — GS1 mod-10 check digit (server-side only; V-SHIP-LBL-03).
+--   generate_sscc(org,ext) — 18-digit SSCC: ext(1) + gs1_prefix(7) + serial(9) + mod10.
+-- ===========================================================================
+create table if not exists public.sscc_counters (
+  org_id      uuid primary key references public.organizations(id) on delete cascade,
+  last_serial bigint not null default 0,
+  updated_at  timestamptz not null default pg_catalog.now()
+);
+
+create or replace function public.next_sscc_serial(p_org_id uuid)
+returns bigint
+language plpgsql
+security definer
+set search_path = pg_catalog, public
+as $$
+declare
+  v_serial bigint;
+begin
+  -- Insert-on-first-call then atomic increment via UPDATE ... RETURNING (row lock = no gaps,
+  -- no duplicates under concurrency). NEVER nextval() — that is a global sequence, not per-org.
+  insert into public.sscc_counters (org_id) values (p_org_id)
+    on conflict (org_id) do nothing;
+  update public.sscc_counters
+     set last_serial = last_serial + 1,
+         updated_at  = pg_catalog.now()
+   where org_id = p_org_id
+   returning last_serial into v_serial;
+  return v_serial;
+end;
+$$;
+
+create or replace function public.sscc_mod10(p_sscc17 text)
+returns integer
+language plpgsql
+immutable
+set search_path = pg_catalog
+as $$
+declare
+  v_sum    integer := 0;
+  v_digit  integer;
+  v_weight integer;
+  i        integer;
+begin
+  if p_sscc17 is null or p_sscc17 !~ '^[0-9]{17}$' then
+    raise exception 'sscc_mod10: input must be exactly 17 digits';
+  end if;
+  -- GS1 SSCC-18 check digit: weight the 17 digits 3,1,3,1,... from the LEFT, sum, then the
+  -- check digit is (10 - (sum mod 10)) mod 10.
+  for i in 1..17 loop
+    v_digit  := substr(p_sscc17, i, 1)::integer;
+    v_weight := case when (i % 2) = 1 then 3 else 1 end;
+    v_sum    := v_sum + v_digit * v_weight;
+  end loop;
+  return (10 - (v_sum % 10)) % 10;
+end;
+$$;
+
+create or replace function public.generate_sscc(p_org_id uuid, p_extension integer default 0)
+returns varchar(18)
+language plpgsql
+security definer
+set search_path = pg_catalog, public
+as $$
+declare
+  v_prefix  text;
+  v_serial  bigint;
+  v_body    text;
+  v_check   integer;
+begin
+  if p_extension is null or p_extension < 0 or p_extension > 9 then
+    raise exception 'generate_sscc: extension digit must be 0-9';
+  end if;
+  -- gs1_prefix sourced from organizations (02-SETTINGS §12.1) — NEVER env config.
+  select gs1_prefix into v_prefix from public.organizations where id = p_org_id;
+  if v_prefix is null or v_prefix = '' then
+    raise exception 'V-SHIP-PACK-03 missing GS1 company prefix for org %', p_org_id;
+  end if;
+  -- P1 enforces exactly 7-digit GS1 company prefix (V-SHIP-PACK-03 7-10; P2 widens).
+  if v_prefix !~ '^[0-9]{7}$' then
+    raise exception 'V-SHIP-PACK-03 GS1 company prefix must be exactly 7 digits (got %)', v_prefix;
+  end if;
+  v_serial := public.next_sscc_serial(p_org_id);
+  -- body = ext(1) + prefix(7) + serial(9) = 17 digits.
+  v_body  := p_extension::text || v_prefix || lpad(v_serial::text, 9, '0');
+  v_check := public.sscc_mod10(v_body);
+  return (v_body || v_check::text)::varchar(18);
+end;
+$$;
+
+revoke all on function public.next_sscc_serial(uuid) from public;
+revoke all on function public.generate_sscc(uuid, integer) from public;
+grant execute on function public.next_sscc_serial(uuid) to app_user;
+grant execute on function public.sscc_mod10(text) to app_user;
+grant execute on function public.generate_sscc(uuid, integer) to app_user;
+
+-- ===========================================================================
+-- RLS + FORCE RLS + grants + updated_at triggers for every operational table.
+-- Policies <table>_org_context USING/WITH CHECK (org_id = app.current_org_id()) — no GUC reads.
+-- ===========================================================================
+do $$
+declare
+  t text;
+  shipping_tables text[] := array[
+    'customers', 'customer_contacts', 'customer_addresses', 'customer_allergen_restrictions',
+    'sales_orders', 'sales_order_lines', 'inventory_allocations',
+    'waves', 'pick_lists', 'pick_list_lines',
+    'shipments', 'shipment_boxes', 'shipment_box_contents', 'bill_of_lading'
+  ];
+begin
+  foreach t in array shipping_tables loop
+    execute format('alter table public.%I enable row level security', t);
+    execute format('alter table public.%I force row level security', t);
+    execute format('drop policy if exists %I on public.%I', t || '_org_context', t);
+    execute format(
+      'create policy %I on public.%I for all to app_user using (org_id = app.current_org_id()) with check (org_id = app.current_org_id())',
+      t || '_org_context', t
+    );
+    execute format('revoke all on public.%I from public', t);
+    execute format('revoke all on public.%I from app_user', t);
+    execute format('grant select, insert, update, delete on public.%I to app_user', t);
+  end loop;
+end
+$$;
+
+-- bill_of_lading uses the retention-maintaining trigger (insert + update); the rest use the plain
+-- updated_at trigger (update only).
+drop trigger if exists bill_of_lading_set_updated_at on public.bill_of_lading;
+create trigger bill_of_lading_set_updated_at
+  before insert or update on public.bill_of_lading
+  for each row execute function public.bill_of_lading_set_updated_at_retention();
+
+do $$
+declare
+  t text;
+  plain_tables text[] := array[
+    'customers', 'customer_contacts', 'customer_addresses', 'customer_allergen_restrictions',
+    'sales_orders', 'sales_order_lines', 'inventory_allocations',
+    'waves', 'pick_lists', 'pick_list_lines',
+    'shipments', 'shipment_boxes', 'shipment_box_contents'
+  ];
+begin
+  foreach t in array plain_tables loop
+    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
+    execute format(
+      'create trigger %I before update on public.%I for each row execute function public.shipping_set_updated_at()',
+      t || '_set_updated_at', t
+    );
+  end loop;
+end
+$$;
+
+-- Human-readable number triggers (BEFORE INSERT, fire before the updated_at/retention triggers).
+drop trigger if exists sales_orders_set_number on public.sales_orders;
+create trigger sales_orders_set_number
+  before insert on public.sales_orders
+  for each row execute function public.shipping_set_sales_order_number();
+
+drop trigger if exists waves_set_number on public.waves;
+create trigger waves_set_number
+  before insert on public.waves
+  for each row execute function public.shipping_set_wave_number();
+
+drop trigger if exists pick_lists_set_number on public.pick_lists;
+create trigger pick_lists_set_number
+  before insert on public.pick_lists
+  for each row execute function public.shipping_set_pick_list_number();
+
+drop trigger if exists shipments_set_number on public.shipments;
+create trigger shipments_set_number
+  before insert on public.shipments
+  for each row execute function public.shipping_set_shipment_number();
+
+drop trigger if exists bill_of_lading_set_number on public.bill_of_lading;
+create trigger bill_of_lading_set_number
+  before insert on public.bill_of_lading
+  for each row execute function public.shipping_set_bol_number();
+
+-- sscc_counters: owner/security-definer writes only (functions). RLS not required (PK is org_id and
+-- the only writers are the SECURITY DEFINER functions); app_user gets SELECT for inspection.
+revoke all on public.sscc_counters from public;
+grant select on public.sscc_counters to app_user;
diff --git a/packages/db/migrations/212-shipping-outbox-and-rbac-seed.sql b/packages/db/migrations/212-shipping-outbox-and-rbac-seed.sql
new file mode 100644
index 00000000..aabf53b4
--- /dev/null
+++ b/packages/db/migrations/212-shipping-outbox-and-rbac-seed.sql
@@ -0,0 +1,349 @@
+-- Migration 212: 11-Shipping — (A) admit the shipping.* SO/pick/pack/ship/BOL lifecycle outbox
+--   events to the outbox_events CHECK constraint (keep the enum<->CHECK drift gate green), and
+--   (B) grant the ship.* RBAC permission family to the org-admin role family + shipping
+--   operator/manager roles in BOTH the normalized role_permissions table and the legacy
+--   roles.permissions jsonb cache, with an AFTER INSERT trigger + full backfill.
+-- PRD: docs/prd/11-SHIPPING-PRD.md §3 (RBAC), §6 (D-SHP-8/13/14), §9.1, §12 (events / D365 push).
+-- Tasks: T-031 (permission enum) + T-033 (RBAC-seed P0, recurring-live-bug class 1).
+-- Canonical permission strings: packages/rbac/src/permissions.enum.ts (ALL_SHIP_PERMISSIONS).
+-- Canonical event strings: packages/outbox/src/events.enum.ts (ALL_SHIPPING_EVENTS / DB_EVENT_TYPES).
+-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
+
+-- ===========================================================================
+-- (A) Outbox event CHECK — drop + recreate with the FULL vocabulary (198's list + the 8 new
+--     11-shipping events). The enum<->CHECK drift gate (packages/outbox check-drift.test.ts)
+--     asserts THIS (now highest-numbered) migration's CHECK string set === DB_EVENT_TYPES, so the
+--     list below MUST stay byte-aligned with events.enum.ts (EventType ∪ LegacyEventAlias keys).
+--     Strict superset of 198 — no event dropped. (198 already carried warehouse.* + quality.*.)
+-- ===========================================================================
+alter table public.outbox_events
+  drop constraint if exists outbox_events_event_type_check;
+
+alter table public.outbox_events
+  add constraint outbox_events_event_type_check check (
+    event_type in (
+      'audit.recorded',
+      'bom.initial_version_created',
+      'bom.version_submitted',
+      'brief.completed_for_project',
+      'brief.converted',
+      'brief.created',
+      'catch_weight.variance_exceeded',
+      'compliance_doc.deleted',
+      'compliance_doc.expired',
+      'compliance_doc.expiring',
+      'compliance_doc.uploaded',
+      'd365.cache.refreshed',
+      'fa.allergens_changed',
+      'fa.built',
+      'fa.built_reset',
+      'fa.cascade',
+      'fa.core_closed',
+      'fa.created',
+      'fa.deleted',
+      'fa.dept_closed',
+      'fa.dept_reopened',
+      'fa.edit',
+      'fa.intermediate_code_changed',
+      'fa.recipe_changed',
+      'fa.template_applied',
+      'fg.allergens_changed',
+      'fg.bom.released',
+      'fg.created',
+      'fg.edit',
+      'fg.intermediate_code_changed',
+      'fg.release_blocked',
+      'fg.released_to_factory',
+      'formulation.locked',
+      'formulation.submitted_for_trial',
+      'lp.received',
+      'manufacturing_operations.created',
+      'manufacturing_operations.deactivated',
+      'manufacturing_operations.reset_to_seed',
+      'manufacturing_operations.updated',
+      'npd.allergens.bulk_rebuild_completed',
+      'npd.builder.released_records_created',
+      'npd.fg_candidate_mapped',
+      'npd.gate.advanced',
+      'npd.gate.approved',
+      'npd.gate.reverted',
+      'npd.project.brief_mapped',
+      'npd.project.created',
+      'npd.project.legacy_stages_closed',
+      'npd.project.release_requested',
+      'onboarding.first_wo_recorded',
+      'onboarding.step.advance',
+      'onboarding.step.back',
+      'onboarding.step.jump',
+      'onboarding.step.restart',
+      'onboarding.step.skip',
+      'org.created',
+      'org.mfa_enrollment.forced',
+      'org.security_policy.updated',
+      'production.allergen_changeover.validated',
+      'production.changeover.signed',
+      'production.consume.blocked',
+      'production.consume.completed',
+      'production.downtime.recorded',
+      'production.oee.snapshot',
+      'production.output.recorded',
+      'production.waste.recorded',
+      'production.wo.closed',
+      'production.wo.completed',
+      'production.wo.started',
+      'quality.atp_swab_failed',
+      'quality.hold.created',
+      'quality.hold.released',
+      'quality.ncr.assigned',
+      'quality.ncr.closed',
+      'quality.ncr.critical_dual_signed',
+      'quality.ncr.opened',
+      'quality.ncr.submitted',
+      'quality.ncr.updated',
+      'quality.recorded',
+      'reference.allergens_added_by_process.bulk_changed',
+      'reference.allergens_by_rm.bulk_changed',
+      'reference.csv.committed',
+      'reference.row.soft_deleted',
+      'reference.row.upserted',
+      'risk.created',
+      'role.assigned',
+      'rule.deployed',
+      'settings.core_flag.updated',
+      'settings.d365_sync.updated',
+      'settings.dept_override.updated',
+      'settings.ip_allowlist.changed',
+      'settings.line.upserted',
+      'settings.location.deleted',
+      'settings.location.imported',
+      'settings.location.upserted',
+      'settings.machine.upserted',
+      'settings.module.disabled',
+      'settings.module.enabled',
+      'settings.module.toggled',
+      'settings.notification_channel_updated',
+      'settings.notification_digest_updated',
+      'settings.notification_rule_updated',
+      'settings.org.created',
+      'settings.org.updated',
+      'settings.reference.row_updated',
+      'settings.role.assigned',
+      'settings.rule.deployed',
+      'settings.rule_variant.updated',
+      'settings.schema.migration_requested',
+      'settings.scim.token_created',
+      'settings.sso.config_changed',
+      'settings.upgrade.completed',
+      'settings.upgrade.promoted',
+      'settings.upgrade.rolled_back',
+      'settings.upgrade.scheduled',
+      'settings.user.accepted',
+      'settings.user.deactivated',
+      'settings.user.invitation_resent',
+      'settings.user.invited',
+      'settings.warehouse.deactivated',
+      'shipment.created',
+      'shipping.bol.issued',
+      'shipping.pick.completed',
+      'shipping.pick.released',
+      'shipping.shipment.confirmed',
+      'shipping.shipment.packed',
+      'shipping.so.cancelled',
+      'shipping.so.confirmed',
+      'shipping.so.released',
+      'technical.factory_spec.approved',
+      'tenant.cohort.advanced',
+      'tenant.migration.run',
+      'tenant.migration.run.failed',
+      'unit_of_measure.conversion_created',
+      'unit_of_measure.created',
+      'unit_of_measure.soft_deleted',
+      'user.invited',
+      'warehouse.lp.received',
+      'warehouse.lp.shipped',
+      'warehouse.lp.transitioned',
+      'warehouse.material.consumed',
+      'wo.ready'
+    )
+  );
+
+comment on constraint outbox_events_event_type_check on public.outbox_events
+  is 'Regenerated from events.enum.ts DB_EVENT_TYPES (incl shipping.* lifecycle events).';
+
+-- ===========================================================================
+-- (B) ship.* RBAC permission seed.
+--   ROOT CAUSE (X-1 unreachable-feature / 403-everywhere class — same as 116/146/148/149/154/185/
+--   192/198): adding the ship.* strings to the enum (T-031) grants NOBODY access. The deployed org
+--   administrator is on the canonical org-admin role family, which receives NONE of the ship.*
+--   strings — so every shipping page/action 403s at live Gate-5.
+--
+--   This grants:
+--     * the COMPLETE ship.* set (14 strings) to the org-admin role family;
+--     * the shipping operator/picker subset to a warehouse/shipping operator role family;
+--     * the shipping manager/supervisor subset (= full set) to a shipping lead role family;
+--   in BOTH role_permissions (normalized) and roles.permissions (legacy jsonb cache), for every
+--   existing org, with an AFTER INSERT trigger so new orgs inherit it.
+--   Role codes are matched defensively across naming conventions; the grant is a no-op for any role
+--   code not present in an org (idempotent). The admin-family grant is the load-bearing one for
+--   Gate-5 reachability. Models on 149/154/185/192/198.
+-- ===========================================================================
+create or replace function public.seed_ship_permissions_for_org(p_org_id uuid)
+returns void
+language plpgsql
+security definer
+set search_path = pg_catalog
+as $$
+declare
+  -- Complete ship.* family (PRD §3 RBAC matrix). Mirrors ALL_SHIP_PERMISSIONS.
+  v_all_perms text[] := array[
+    'ship.so.create',
+    'ship.so.confirm',
+    'ship.so.cancel',
+    'ship.hold.place',
+    'ship.hold.release',
+    'ship.alloc.override',
+    'ship.allergen.override',
+    'ship.pick.execute',
+    'ship.pack.close',
+    'ship.ship.confirm',
+    'ship.bol.sign',
+    'ship.rma.disposition',
+    'ship.dashboard.view',
+    'ship.dlq.replay'
+  ];
+  -- Shipping operator / picker subset: creates SO drafts, executes picks, closes packs, confirms
+  -- shipments, views the dashboard. NOT the elevated/approval strings (so.confirm, so.cancel,
+  -- hold.release, alloc.override, allergen.override, bol.sign, rma.disposition, dlq.replay — SoD).
+  v_operator_perms text[] := array[
+    'ship.so.create',
+    'ship.hold.place',
+    'ship.pick.execute',
+    'ship.pack.close',
+    'ship.ship.confirm',
+    'ship.dashboard.view'
+  ];
+  -- Shipping manager / supervisor subset: the approver. Full set.
+  v_manager_perms text[] := v_all_perms;
+  -- org-admin role family across naming conventions used in this codebase.
+  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin'];
+  -- shipping operator / picker role family (defensive — codes vary; grant is a no-op if absent).
+  v_operator_roles text[] := array[
+    'shipping_operator','shipping_clerk','picker','packer','warehouse_operator','scanner',
+    'scanner_operator','dispatcher'
+  ];
+  -- shipping manager / supervisor role family (defensive).
+  v_manager_roles text[] := array[
+    'shipping_manager','shipping_supervisor','shipping_lead','logistics_manager','dispatch_manager'
+  ];
+begin
+  -- --- Normalized storage (role_permissions) ---
+  -- admin family: full set.
+  insert into public.role_permissions (role_id, permission)
+  select r.id, p.permission
+  from public.roles r
+  cross join unnest(v_all_perms) as p(permission)
+  where r.org_id = p_org_id
+    and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles))
+  on conflict (role_id, permission) do nothing;
+
+  -- operator/picker family: operator subset.
+  insert into public.role_permissions (role_id, permission)
+  select r.id, p.permission
+  from public.roles r
+  cross join unnest(v_operator_perms) as p(permission)
+  where r.org_id = p_org_id
+    and (r.code = any(v_operator_roles) or r.slug = any(v_operator_roles))
+  on conflict (role_id, permission) do nothing;
+
+  -- manager/supervisor family: manager subset (= full set).
+  insert into public.role_permissions (role_id, permission)
+  select r.id, p.permission
+  from public.roles r
+  cross join unnest(v_manager_perms) as p(permission)
+  where r.org_id = p_org_id
+    and (r.code = any(v_manager_roles) or r.slug = any(v_manager_roles))
+  on conflict (role_id, permission) do nothing;
+
+  -- --- Legacy jsonb cache (roles.permissions) ---
+  update public.roles r
+     set permissions = coalesce(
+       (
+         select jsonb_agg(distinct merged.permission order by merged.permission)
+         from (
+           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
+           union all
+           select unnest(v_all_perms)
+         ) merged
+       ),
+       '[]'::jsonb
+     )
+   where r.org_id = p_org_id
+     and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles));
+
+  update public.roles r
+     set permissions = coalesce(
+       (
+         select jsonb_agg(distinct merged.permission order by merged.permission)
+         from (
+           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
+           union all
+           select unnest(v_operator_perms)
+         ) merged
+       ),
+       '[]'::jsonb
+     )
+   where r.org_id = p_org_id
+     and (r.code = any(v_operator_roles) or r.slug = any(v_operator_roles));
+
+  update public.roles r
+     set permissions = coalesce(
+       (
+         select jsonb_agg(distinct merged.permission order by merged.permission)
+         from (
+           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
+           union all
+           select unnest(v_manager_perms)
+         ) merged
+       ),
+       '[]'::jsonb
+     )
+   where r.org_id = p_org_id
+     and (r.code = any(v_manager_roles) or r.slug = any(v_manager_roles));
+end;
+$$;
+
+revoke all on function public.seed_ship_permissions_for_org(uuid) from public;
+revoke all on function public.seed_ship_permissions_for_org(uuid) from app_user;
+
+create or replace function public.seed_ship_permissions_on_org_insert()
+returns trigger
+language plpgsql
+security definer
+set search_path = pg_catalog
+as $$
+begin
+  perform public.seed_ship_permissions_for_org(new.id);
+  return new;
+end;
+$$;
+
+revoke all on function public.seed_ship_permissions_on_org_insert() from public;
+revoke all on function public.seed_ship_permissions_on_org_insert() from app_user;
+
+-- Fire after the 080 role-seeding trigger so the admin roles already exist (zzz prefix sorts last).
+drop trigger if exists trg_zzz_seed_ship_permissions on public.organizations;
+create trigger trg_zzz_seed_ship_permissions
+  after insert on public.organizations
+  for each row
+  execute function public.seed_ship_permissions_on_org_insert();
+
+-- Backfill every existing org.
+do $$
+declare
+  v_org_id uuid;
+begin
+  for v_org_id in select id from public.organizations loop
+    perform public.seed_ship_permissions_for_org(v_org_id);
+  end loop;
+end
+$$;
diff --git a/packages/db/migrations/213-reporting-read-models-and-config.sql b/packages/db/migrations/213-reporting-read-models-and-config.sql
new file mode 100644
index 00000000..047d2777
--- /dev/null
+++ b/packages/db/migrations/213-reporting-read-models-and-config.sql
@@ -0,0 +1,639 @@
+-- Migration 213: 12-Reporting — schema foundation (READ-MOSTLY CONSUMER).
+--   (A) Report-config / saved-report / scheduled-export-shell + support tables that 12-reporting OWNS:
+--       report_definitions, saved_report_configs, scheduled_export_configs, saved_filter_presets,
+--       dashboards_catalog, report_exports, mv_refresh_log, report_access_audits.
+--   (B) Cross-module FACT materialized views over the canonical producers (READ-ONLY — reporting
+--       NEVER writes/owns these): mv_reporting_production_throughput (08 wo_outputs),
+--       mv_reporting_yield_by_line_week (08 wo_outputs + wo_material_consumption),
+--       mv_reporting_oee_rollup (08 oee_snapshots, READ), mv_reporting_quality_hold_rate
+--       (09 quality_holds + quality_hold_items), mv_reporting_downtime_by_line (08 downtime_events),
+--       mv_reporting_schedule_adherence (04 schedule_outputs), mv_reporting_inventory_aging
+--       (05 license_plates).
+--
+-- PRD: docs/prd/12-REPORTING-PRD.md §3/§11 (RBAC), §6 D-RPT-1/3/7/9 (KPI sources + weighted avg),
+--   §9.1 (MV definitions), §9.2 (support tables), §9.3 (dashboards_catalog), §12 (read-only consumer:
+--   "12-REPORTING NIE produkuje eventow" — no fact events), §14.1 (BRCGS 7y export retention),
+--   §15.1a (saved_filter_presets).
+-- Tasks: T-003 (yield/factory MVs), T-004 (support tables), T-006 (qc/downtime MVs), T-007 (operational
+--   MVs), T-008 (presets + catalog), T-014 (integration/rules MVs — config rows here, UNION MVs are a
+--   later forward-script once all outbox tables land).
+--
+-- Wave0 lock: org_id is the business scope (NOT tenant_id even where the PRD §9.2/§15.1a labels say
+--   tenant_id — Wave0 v4.3 decision #1 overrides); RLS via app.current_org_id() (foundation function,
+--   migration 002 — never a raw current_setting GUC).
+-- site_id day-1: site_id uuid is NULLABLE, no FK, no registry on every operational config table —
+--   full per-site scoping lands later via 14-multi-site.
+-- NUMERIC-exact: every money/qty/yield/percentage column is NUMERIC (never float/double).
+-- Audit (R13): embedded created_by/created_at/updated_at + a local set_updated_at trigger (matches the
+--   production/warehouse/quality migrations 181-198 — this repo has no generic app.audit_event()).
+-- CANONICAL-OWNER SEPARATION (the load-bearing assertion of this module): this migration creates ONLY
+--   reporting-owned config tables + materialized VIEWS/views. It creates NO base copy of wo_outputs /
+--   wo_material_consumption / oee_snapshots / downtime_events (08-production), schedule_outputs
+--   (04-planning), license_plates (05-warehouse), quality_holds / quality_hold_items (09-quality).
+--   The MVs READ those producer tables; they never duplicate or shadow them.
+
+-- ===========================================================================
+-- app_reporting_role — the read-only role the MVs grant SELECT to (REVOKE PUBLIC). app_user is
+--   GRANTed membership so the application connection can read the read-models, while direct grants to
+--   PUBLIC are withheld per the §5 security model. Created idempotently; harmless if it already exists.
+-- ===========================================================================
+do $$
+begin
+  if not exists (select 1 from pg_roles where rolname = 'app_reporting_role') then
+    create role app_reporting_role nologin;
+  end if;
+end
+$$;
+
+do $$
+begin
+  if exists (select 1 from pg_roles where rolname = 'app_user')
+     and exists (select 1 from pg_roles where rolname = 'app_reporting_role') then
+    execute 'grant app_reporting_role to app_user';
+  end if;
+end
+$$;
+
+-- ===========================================================================
+-- (A.1) report_definitions — versioned report/dashboard definition catalog OWNED by reporting.
+--   Each row binds a logical report to its source MV + the KPI glossary keys it renders + its required
+--   read permission. This is reporting's own config — NOT a producer fact table.
+-- ===========================================================================
+create table if not exists public.report_definitions (
+  id                 uuid primary key default gen_random_uuid(),
+  org_id             uuid not null references public.organizations(id) on delete cascade,
+  site_id            uuid,                                  -- day-1 nullable
+  report_key         text not null,
+  name               text not null,
+  description        text,
+  category           text not null default 'dashboard',
+  source_view        text,                                  -- the mv_reporting_* / v_reporting_* read model
+  kpi_keys           jsonb not null default '[]'::jsonb,    -- KPI glossary keys rendered (T-002 SSOT)
+  required_permission text not null default 'rpt.dashboard.view',
+  phase              text not null default 'P1',
+  is_active          boolean not null default true,
+  config_jsonb       jsonb not null default '{}'::jsonb,
+  ext_jsonb          jsonb not null default '{}'::jsonb,
+  created_by         uuid references public.users(id) on delete set null,
+  updated_by         uuid references public.users(id) on delete set null,
+  created_at         timestamptz not null default pg_catalog.now(),
+  updated_at         timestamptz not null default pg_catalog.now(),
+
+  constraint report_definitions_org_key_uq unique (org_id, report_key),
+  constraint report_definitions_category_check check (
+    category in ('dashboard', 'tabular', 'export', 'kpi_tile', 'admin')
+  ),
+  constraint report_definitions_phase_check check (phase in ('P1', 'P2', 'P3'))
+);
+
+create index if not exists idx_report_definitions_org on public.report_definitions (org_id);
+create index if not exists idx_report_definitions_org_site on public.report_definitions (org_id, site_id);
+create index if not exists idx_report_definitions_active
+  on public.report_definitions (org_id, is_active) where is_active;
+
+alter table public.report_definitions enable row level security;
+alter table public.report_definitions force row level security;
+drop policy if exists report_definitions_org_context on public.report_definitions;
+create policy report_definitions_org_context
+  on public.report_definitions for all to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+revoke all on public.report_definitions from public;
+revoke all on public.report_definitions from app_user;
+grant select, insert, update, delete on public.report_definitions to app_user;
+
+-- ===========================================================================
+-- (A.2) saved_report_configs — a user's saved view/column/sort config for a report (reporting-owned).
+-- ===========================================================================
+create table if not exists public.saved_report_configs (
+  id            uuid primary key default gen_random_uuid(),
+  org_id        uuid not null references public.organizations(id) on delete cascade,
+  site_id       uuid,
+  user_id       uuid not null references public.users(id) on delete cascade,
+  report_key    text not null,
+  name          text not null,
+  slug          text not null,
+  config_jsonb  jsonb not null default '{}'::jsonb,
+  visibility    text not null default 'just_me',
+  is_default    boolean not null default false,
+  ext_jsonb     jsonb not null default '{}'::jsonb,
+  created_at    timestamptz not null default pg_catalog.now(),
+  updated_at    timestamptz not null default pg_catalog.now(),
+
+  constraint saved_report_configs_user_report_slug_uq unique (org_id, user_id, report_key, slug),
+  constraint saved_report_configs_visibility_check check (visibility in ('just_me', 'my_team', 'org'))
+);
+
+create index if not exists idx_saved_report_configs_org on public.saved_report_configs (org_id);
+create index if not exists idx_saved_report_configs_user
+  on public.saved_report_configs (org_id, user_id, report_key);
+
+alter table public.saved_report_configs enable row level security;
+alter table public.saved_report_configs force row level security;
+drop policy if exists saved_report_configs_org_context on public.saved_report_configs;
+create policy saved_report_configs_org_context
+  on public.saved_report_configs for all to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+revoke all on public.saved_report_configs from public;
+revoke all on public.saved_report_configs from app_user;
+grant select, insert, update, delete on public.saved_report_configs to app_user;
+
+-- ===========================================================================
+-- (A.3) scheduled_export_configs — P2 scheduled-export SHELL (flag-gated at the rule layer). Holds the
+--   cron expression + delivery channel; the runner is a later task. Reporting-owned config.
+-- ===========================================================================
+create table if not exists public.scheduled_export_configs (
+  id                uuid primary key default gen_random_uuid(),
+  org_id            uuid not null references public.organizations(id) on delete cascade,
+  site_id           uuid,
+  user_id           uuid not null references public.users(id) on delete cascade,
+  report_key        text not null,
+  name              text not null,
+  cron_expression   text not null,
+  format            text not null default 'pdf',
+  delivery_channel  text not null default 'email',
+  delivery_target   jsonb not null default '{}'::jsonb,
+  filters           jsonb not null default '{}'::jsonb,
+  is_enabled        boolean not null default false,
+  last_run_at       timestamptz,
+  next_run_at       timestamptz,
+  ext_jsonb         jsonb not null default '{}'::jsonb,
+  created_at        timestamptz not null default pg_catalog.now(),
+  updated_at        timestamptz not null default pg_catalog.now(),
+
+  constraint scheduled_export_configs_format_check check (format in ('pdf', 'csv', 'xlsx', 'json')),
+  constraint scheduled_export_configs_channel_check check (
+    delivery_channel in ('email', 'webhook', 'storage')
+  )
+);
+
+create index if not exists idx_scheduled_export_configs_org on public.scheduled_export_configs (org_id);
+create index if not exists idx_scheduled_export_configs_due
+  on public.scheduled_export_configs (next_run_at) where is_enabled;
+
+alter table public.scheduled_export_configs enable row level security;
+alter table public.scheduled_export_configs force row level security;
+drop policy if exists scheduled_export_configs_org_context on public.scheduled_export_configs;
+create policy scheduled_export_configs_org_context
+  on public.scheduled_export_configs for all to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+revoke all on public.scheduled_export_configs from public;
+revoke all on public.scheduled_export_configs from app_user;
+grant select, insert, update, delete on public.scheduled_export_configs to app_user;
+
+-- ===========================================================================
+-- (A.4) saved_filter_presets — P1 per-user filter preset (T-008, §15.1a). org_id NOT tenant_id.
+-- ===========================================================================
+create table if not exists public.saved_filter_presets (
+  id            uuid primary key default gen_random_uuid(),
+  org_id        uuid not null references public.organizations(id) on delete cascade,
+  site_id       uuid,
+  user_id       uuid not null references public.users(id) on delete cascade,
+  dashboard_id  text not null,
+  name          text not null,
+  slug          text not null,
+  filters       jsonb not null default '{}'::jsonb,
+  visibility    text not null default 'just_me',
+  created_at    timestamptz not null default pg_catalog.now(),
+  updated_at    timestamptz not null default pg_catalog.now(),
+
+  constraint saved_filter_presets_user_dash_slug_uq unique (org_id, user_id, dashboard_id, slug),
+  constraint saved_filter_presets_visibility_check check (visibility in ('just_me', 'my_team'))
+);
+
+create index if not exists idx_saved_filter_presets_org on public.saved_filter_presets (org_id);
+create index if not exists idx_saved_filter_presets_user
+  on public.saved_filter_presets (org_id, user_id, dashboard_id);
+
+alter table public.saved_filter_presets enable row level security;
+alter table public.saved_filter_presets force row level security;
+drop policy if exists saved_filter_presets_org_context on public.saved_filter_presets;
+create policy saved_filter_presets_org_context
+  on public.saved_filter_presets for all to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+revoke all on public.saved_filter_presets from public;
+revoke all on public.saved_filter_presets from app_user;
+grant select, insert, update, delete on public.saved_filter_presets to app_user;
+
+-- ===========================================================================
+-- (A.5) dashboards_catalog — GLOBAL metadata registry of dashboards (T-008, §9.3). No org_id — gated
+--   by feature_flag + enabled_for_orgs[] + RBAC at the rule layer. Seeded with the 10 P1 dashboards.
+-- ===========================================================================
+create table if not exists public.dashboards_catalog (
+  id               text primary key,
+  name             text not null,
+  description      text,
+  phase            text not null default 'P1',
+  required_role    text not null,
+  feature_flag     text,
+  metadata_schema  jsonb not null default '{}'::jsonb,
+  enabled_for_orgs uuid[] not null default '{}'::uuid[],
+  version          text not null default 'v3.0',
+  created_at       timestamptz not null default pg_catalog.now(),
+
+  constraint dashboards_catalog_phase_check check (phase in ('P1', 'P2', 'P3'))
+);
+
+-- Global reference table — readable by every authenticated app_user (RBAC gates the actual page at the
+-- rule/service layer). No RLS (no org_id); REVOKE PUBLIC + GRANT SELECT to app_user only.
+revoke all on public.dashboards_catalog from public;
+grant select on public.dashboards_catalog to app_user;
+
+insert into public.dashboards_catalog (id, name, description, phase, required_role, feature_flag) values
+  ('factory-overview',   'Factory Overview',        'Plant-wide KPI overview',          'P1', 'rpt.dashboard.view',     null),
+  ('yield-by-line',      'Yield by Line',           'Yield % per line per week',         'P1', 'rpt.dashboard.view',     null),
+  ('yield-by-sku',       'Yield by SKU',            'Yield % per SKU per week',          'P1', 'rpt.dashboard.view',     null),
+  ('qc-holds',           'QC Holds',                'Quality holds summary',             'P1', 'rpt.dashboard.view',     null),
+  ('oee-summary',        'OEE Summary',             'OEE rollup (consumer of 15-OEE)',   'P1', 'rpt.dashboard.view',     null),
+  ('inventory-aging',    'Inventory Aging',         'LP age buckets',                    'P1', 'rpt.dashboard.view',     null),
+  ('wo-status',          'WO Status',               'Work-order status summary',         'P1', 'rpt.dashboard.view',     null),
+  ('shipment-otd',       'Shipment OTD',            'On-time-delivery weekly',           'P1', 'rpt.dashboard.view',     null),
+  ('integration-health', 'Integration Health',      'Cross-outbox health',               'P1', 'rpt.integration.read',   null),
+  ('rules-usage',        'Rules Usage Analytics',   'DSL rule evaluation analytics',     'P1', 'rpt.rules_usage.read',   null)
+on conflict (id) do nothing;
+
+-- ===========================================================================
+-- (A.6) report_exports — export audit trail with GENERATED 7-year BRCGS retention (T-004, §9.2/§14.1).
+--   org_id NOT tenant_id. sha256_hash NOT NULL (V-RPT-EXPORT-2). retention_until is GENERATED STORED on
+--   the immutable exported_at default so auditors cannot tamper post-insert.
+-- ===========================================================================
+create table if not exists public.report_exports (
+  id                      uuid primary key default gen_random_uuid(),
+  org_id                  uuid not null references public.organizations(id) on delete cascade,
+  site_id                 uuid,
+  user_id                 uuid not null references public.users(id) on delete restrict,
+  dashboard_id            text not null,
+  report_type             text not null,
+  date_range              jsonb not null,
+  filters                 jsonb,
+  format                  text not null,
+  file_size_bytes         bigint,
+  sha256_hash             text not null,
+  status                  text not null default 'generating',
+  error_message           text,
+  exported_at             timestamptz not null default pg_catalog.now(),
+  -- retention_until = exported_at(UTC-date) + 7y, GENERATED STORED for BRCGS-immutable audit. The
+  -- generation expression must be IMMUTABLE: `timestamptz + interval` and `timestamptz::date` are only
+  -- STABLE (timezone-dependent), so we normalize to a UTC date first ((exported_at at time zone 'UTC')
+  -- is timestamp, ::date is immutable) and add the interval on the resulting date (date + interval is
+  -- immutable). exported_at is insert-only (never updated), so the stored value is fixed at insert.
+  retention_until         date generated always as
+    ((((exported_at at time zone 'UTC')::date) + interval '7 years')::date) stored,
+  archived_to_cold_storage boolean not null default false,
+
+  constraint report_exports_format_check check (format in ('pdf', 'csv', 'xlsx', 'json')),
+  constraint report_exports_status_check check (status in ('generating', 'completed', 'failed'))
+);
+
+create index if not exists idx_report_exports_org on public.report_exports (org_id);
+create index if not exists idx_report_exports_user on public.report_exports (org_id, user_id, exported_at desc);
+create index if not exists idx_report_exports_retention
+  on public.report_exports (retention_until) where archived_to_cold_storage = false;
+
+alter table public.report_exports enable row level security;
+alter table public.report_exports force row level security;
+drop policy if exists report_exports_org_context on public.report_exports;
+create policy report_exports_org_context
+  on public.report_exports for all to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+revoke all on public.report_exports from public;
+revoke all on public.report_exports from app_user;
+grant select, insert, update, delete on public.report_exports to app_user;
+
+-- ===========================================================================
+-- (A.7) mv_refresh_log — MV refresh telemetry (T-004, §9.2). duration_ms is a GENERATED STORED column.
+-- ===========================================================================
+create table if not exists public.mv_refresh_log (
+  id              bigserial primary key,
+  org_id          uuid not null references public.organizations(id) on delete cascade,
+  site_id         uuid,
+  view_name       text not null,
+  started_at      timestamptz not null default pg_catalog.now(),
+  completed_at    timestamptz,
+  rows_affected   bigint,
+  duration_ms     integer generated always as (
+    case when completed_at is not null
+      then (extract(epoch from (completed_at - started_at)) * 1000)::integer
+    end
+  ) stored,
+  status          text not null default 'started',
+  error_message   text,
+
+  constraint mv_refresh_log_status_check check (
+    status in ('started', 'completed', 'failed', 'deferred_source_missing')
+  )
+);
+
+create index if not exists idx_mv_refresh_log_org on public.mv_refresh_log (org_id);
+create index if not exists idx_mv_refresh_log_view on public.mv_refresh_log (view_name, started_at desc);
+
+alter table public.mv_refresh_log enable row level security;
+alter table public.mv_refresh_log force row level security;
+drop policy if exists mv_refresh_log_org_context on public.mv_refresh_log;
+create policy mv_refresh_log_org_context
+  on public.mv_refresh_log for all to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+revoke all on public.mv_refresh_log from public;
+revoke all on public.mv_refresh_log from app_user;
+grant select, insert, update, delete on public.mv_refresh_log to app_user;
+
+-- ===========================================================================
+-- (A.8) report_access_audits — access allow/deny audit (T-004, §9.2, V-RPT-ACCESS-2/3).
+-- ===========================================================================
+create table if not exists public.report_access_audits (
+  id            bigserial primary key,
+  org_id        uuid not null references public.organizations(id) on delete cascade,
+  site_id       uuid,
+  user_id       uuid not null references public.users(id) on delete cascade,
+  dashboard_id  text not null,
+  result        text not null,
+  deny_reason   text,
+  accessed_at   timestamptz not null default pg_catalog.now(),
+  ip_address    inet,
+  user_agent    text,
+
+  constraint report_access_audits_result_check check (result in ('allow', 'deny'))
+);
+
+create index if not exists idx_report_access_audits_org on public.report_access_audits (org_id);
+create index if not exists idx_report_access_audits_user
+  on public.report_access_audits (org_id, user_id, accessed_at desc);
+
+alter table public.report_access_audits enable row level security;
+alter table public.report_access_audits force row level security;
+drop policy if exists report_access_audits_org_context on public.report_access_audits;
+create policy report_access_audits_org_context
+  on public.report_access_audits for all to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+revoke all on public.report_access_audits from public;
+revoke all on public.report_access_audits from app_user;
+grant select, insert, update, delete on public.report_access_audits to app_user;
+
+-- ===========================================================================
+-- set_updated_at trigger (R13 embedded-audit) — reused across the reporting config tables that carry
+-- an updated_at column.
+-- ===========================================================================
+create or replace function public.reporting_set_updated_at()
+returns trigger
+language plpgsql
+as $$
+begin
+  new.updated_at := pg_catalog.now();
+  return new;
+end;
+$$;
+
+drop trigger if exists report_definitions_set_updated_at on public.report_definitions;
+create trigger report_definitions_set_updated_at
+  before update on public.report_definitions
+  for each row execute function public.reporting_set_updated_at();
+
+drop trigger if exists saved_report_configs_set_updated_at on public.saved_report_configs;
+create trigger saved_report_configs_set_updated_at
+  before update on public.saved_report_configs
+  for each row execute function public.reporting_set_updated_at();
+
+drop trigger if exists scheduled_export_configs_set_updated_at on public.scheduled_export_configs;
+create trigger scheduled_export_configs_set_updated_at
+  before update on public.scheduled_export_configs
+  for each row execute function public.reporting_set_updated_at();
+
+drop trigger if exists saved_filter_presets_set_updated_at on public.saved_filter_presets;
+create trigger saved_filter_presets_set_updated_at
+  before update on public.saved_filter_presets
+  for each row execute function public.reporting_set_updated_at();
+
+-- ===========================================================================
+-- (B) CROSS-MODULE FACT MATERIALIZED VIEWS — read-only over the canonical producers. REVOKE PUBLIC +
+--   GRANT SELECT to app_reporting_role only. Each carries a UNIQUE index so REFRESH MATERIALIZED VIEW
+--   CONCURRENTLY (the T-005 worker) works. org_id is selected through verbatim so the service layer can
+--   filter `WHERE org_id = app.current_org_id()` (Postgres MVs cannot host RLS policies — §5 Techniczne).
+--   site_id is carried for REC-L1 per-site filtering (NULL day-1).
+--   These MVs READ, never own: dropping/recreating them never touches the producer tables.
+-- ===========================================================================
+
+-- (B.1) mv_reporting_production_throughput — daily kg output per line, from 08 wo_outputs (canonical).
+drop materialized view if exists public.mv_reporting_production_throughput;
+create materialized view public.mv_reporting_production_throughput as
+  select
+    o.org_id,
+    o.site_id,
+    -- site_key: NULL-safe site discriminator so the REFRESH-CONCURRENTLY unique index can be a
+    -- PLAIN-COLUMN index (Postgres requires a non-partial unique index on the MV's own columns for
+    -- CONCURRENTLY; a coalesce() expression index does not qualify). NULL site_id (day-1) maps to the
+    -- zero-uuid so distinct grouping keys stay unique.
+    coalesce(o.site_id, '00000000-0000-0000-0000-000000000000'::uuid)  as site_key,
+    coalesce(wo.production_line_id::text, 'unassigned')                 as line_id,
+    (o.registered_at at time zone 'UTC')::date                          as output_date,
+    count(*)::bigint                                                    as output_count,
+    sum(o.qty_kg)::numeric(18, 3)                                       as total_kg_output,
+    sum(o.qty_kg) filter (where o.output_type = 'primary')::numeric(18, 3) as primary_kg_output
+  from public.wo_outputs o
+  left join public.work_orders wo on wo.id = o.wo_id
+  group by o.org_id, o.site_id, coalesce(wo.production_line_id::text, 'unassigned'),
+           (o.registered_at at time zone 'UTC')::date;
+
+create unique index mv_reporting_production_throughput_pk
+  on public.mv_reporting_production_throughput (org_id, site_key, line_id, output_date);
+revoke all on public.mv_reporting_production_throughput from public;
+revoke all on public.mv_reporting_production_throughput from app_user;
+grant select on public.mv_reporting_production_throughput to app_reporting_role;
+
+-- (B.2) mv_reporting_yield_by_line_week — weighted yield per line per ISO-Saturday week, from 08
+--   wo_outputs (output kg) + wo_material_consumption (usage kg). yield_pct = output/usage*100
+--   (NUMERIC-exact, weighted by kg per D-RPT-3 — the aggregate is sum(output)/sum(usage), i.e. mass-
+--   weighted, not a mean of per-row ratios).
+drop materialized view if exists public.mv_reporting_yield_by_line_week;
+create materialized view public.mv_reporting_yield_by_line_week as
+  with out_agg as (
+    select
+      o.org_id, o.site_id,
+      coalesce(wo.production_line_id::text, 'unassigned')              as line_id,
+      (date_trunc('week', (o.registered_at at time zone 'UTC'))
+        + interval '5 days')::date                                    as week_ending,
+      sum(o.qty_kg)::numeric(18, 3)                                   as kg_output
+    from public.wo_outputs o
+    left join public.work_orders wo on wo.id = o.wo_id
+    group by o.org_id, o.site_id, coalesce(wo.production_line_id::text, 'unassigned'),
+             (date_trunc('week', (o.registered_at at time zone 'UTC')) + interval '5 days')::date
+  ),
+  use_agg as (
+    select
+      c.org_id, c.site_id,
+      coalesce(wo.production_line_id::text, 'unassigned')              as line_id,
+      (date_trunc('week', (c.consumed_at at time zone 'UTC'))
+        + interval '5 days')::date                                    as week_ending,
+      sum(c.qty_consumed)::numeric(18, 3)                             as kg_usage
+    from public.wo_material_consumption c
+    left join public.work_orders wo on wo.id = c.wo_id
+    group by c.org_id, c.site_id, coalesce(wo.production_line_id::text, 'unassigned'),
+             (date_trunc('week', (c.consumed_at at time zone 'UTC')) + interval '5 days')::date
+  )
+  select
+    coalesce(o.org_id, u.org_id)                                       as org_id,
+    coalesce(o.site_id, u.site_id)                                     as site_id,
+    coalesce(o.site_id, u.site_id, '00000000-0000-0000-0000-000000000000'::uuid) as site_key,
+    coalesce(o.line_id, u.line_id)                                     as line_id,
+    coalesce(o.week_ending, u.week_ending)                             as week_ending,
+    coalesce(o.kg_output, 0)::numeric(18, 3)                           as kg_output,
+    coalesce(u.kg_usage, 0)::numeric(18, 3)                            as kg_usage,
+    case when coalesce(u.kg_usage, 0) > 0
+      then round(coalesce(o.kg_output, 0) / u.kg_usage * 100, 2)
+      else null end::numeric(7, 2)                                     as yield_pct
+  from out_agg o
+  full outer join use_agg u
+    on o.org_id = u.org_id
+   and o.line_id = u.line_id
+   and o.week_ending = u.week_ending
+   and o.site_id is not distinct from u.site_id;
+
+create unique index mv_reporting_yield_by_line_week_pk
+  on public.mv_reporting_yield_by_line_week (org_id, site_key, line_id, week_ending);
+revoke all on public.mv_reporting_yield_by_line_week from public;
+revoke all on public.mv_reporting_yield_by_line_week from app_user;
+grant select on public.mv_reporting_yield_by_line_week to app_reporting_role;
+
+-- (B.3) mv_reporting_oee_rollup — daily OEE rollup per line, READ-ONLY consumer of 08 oee_snapshots
+--   (08-production is the canonical OEE producer per D-OEE-1; 15-OEE + 12-reporting are read-only).
+--   Simple time-mean of the minute snapshots per day (the snapshot grain is per-minute).
+drop materialized view if exists public.mv_reporting_oee_rollup;
+create materialized view public.mv_reporting_oee_rollup as
+  select
+    s.org_id,
+    s.site_id,
+    coalesce(s.site_id, '00000000-0000-0000-0000-000000000000'::uuid)  as site_key,
+    s.line_id,
+    (s.snapshot_minute at time zone 'UTC')::date                       as oee_date,
+    count(*)::bigint                                                    as snapshot_count,
+    round(avg(s.availability_pct), 2)::numeric(5, 2)                   as avg_availability_pct,
+    round(avg(s.performance_pct), 2)::numeric(5, 2)                    as avg_performance_pct,
+    round(avg(s.quality_pct), 2)::numeric(5, 2)                        as avg_quality_pct,
+    round(avg(s.oee_pct), 2)::numeric(5, 2)                            as avg_oee_pct
+  from public.oee_snapshots s
+  group by s.org_id, s.site_id, s.line_id, (s.snapshot_minute at time zone 'UTC')::date;
+
+create unique index mv_reporting_oee_rollup_pk
+  on public.mv_reporting_oee_rollup (org_id, site_key, line_id, oee_date);
+revoke all on public.mv_reporting_oee_rollup from public;
+revoke all on public.mv_reporting_oee_rollup from app_user;
+grant select on public.mv_reporting_oee_rollup to app_reporting_role;
+
+-- (B.4) mv_reporting_quality_hold_rate — daily hold counts + held kg per line, READ-ONLY consumer of
+--   09 quality_holds + quality_hold_items (09-quality is the canonical owner).
+drop materialized view if exists public.mv_reporting_quality_hold_rate;
+create materialized view public.mv_reporting_quality_hold_rate as
+  select
+    h.org_id,
+    h.site_id,
+    coalesce(h.site_id, '00000000-0000-0000-0000-000000000000'::uuid)  as site_key,
+    (h.created_at at time zone 'UTC')::date                            as hold_date,
+    h.priority,
+    count(distinct h.id)::bigint                                       as hold_count,
+    count(distinct h.id) filter (where h.released_at is null)::bigint  as active_hold_count,
+    coalesce(sum(i.qty_held_kg), 0)::numeric(18, 3)                    as total_held_kg
+  from public.quality_holds h
+  left join public.quality_hold_items i on i.hold_id = h.id
+  group by h.org_id, h.site_id, (h.created_at at time zone 'UTC')::date, h.priority;
+
+create unique index mv_reporting_quality_hold_rate_pk
+  on public.mv_reporting_quality_hold_rate (org_id, site_key, hold_date, priority);
+revoke all on public.mv_reporting_quality_hold_rate from public;
+revoke all on public.mv_reporting_quality_hold_rate from app_user;
+grant select on public.mv_reporting_quality_hold_rate to app_reporting_role;
+
+-- (B.5) mv_reporting_downtime_by_line — daily downtime minutes per line per category-kind, READ-ONLY
+--   consumer of 08 downtime_events joined to 02-Settings downtime_categories (kind taxonomy, D-RPT-7 —
+--   never a hardcoded category list).
+drop materialized view if exists public.mv_reporting_downtime_by_line;
+create materialized view public.mv_reporting_downtime_by_line as
+  select
+    d.org_id,
+    d.site_id,
+    coalesce(d.site_id, '00000000-0000-0000-0000-000000000000'::uuid)  as site_key,
+    d.line_id,
+    (d.started_at at time zone 'UTC')::date                            as downtime_date,
+    cat.kind                                                           as category_kind,
+    count(*)::bigint                                                   as event_count,
+    coalesce(sum(d.duration_min), 0)::bigint                           as total_minutes
+  from public.downtime_events d
+  join public.downtime_categories cat on cat.id = d.category_id
+  group by d.org_id, d.site_id, d.line_id, (d.started_at at time zone 'UTC')::date, cat.kind;
+
+create unique index mv_reporting_downtime_by_line_pk
+  on public.mv_reporting_downtime_by_line (org_id, site_key, line_id, downtime_date, category_kind);
+revoke all on public.mv_reporting_downtime_by_line from public;
+revoke all on public.mv_reporting_downtime_by_line from app_user;
+grant select on public.mv_reporting_downtime_by_line to app_reporting_role;
+
+-- (B.6) mv_reporting_schedule_adherence — planned vs scheduled per line per day, READ-ONLY consumer of
+--   04 schedule_outputs (04-planning is the canonical owner — NOT wo_outputs).
+drop materialized view if exists public.mv_reporting_schedule_adherence;
+create materialized view public.mv_reporting_schedule_adherence as
+  select
+    so.org_id,
+    so.site_id,
+    coalesce(so.site_id, '00000000-0000-0000-0000-000000000000'::uuid) as site_key,
+    coalesce(wo.production_line_id::text, 'unassigned')               as line_id,
+    (coalesce(wo.scheduled_start_time, wo.planned_start_date, so.created_at)
+      at time zone 'UTC')::date                                       as schedule_date,
+    count(*)::bigint                                                   as scheduled_count,
+    coalesce(sum(so.expected_qty), 0)::numeric(18, 3)                 as total_planned_qty
+  from public.schedule_outputs so
+  left join public.work_orders wo on wo.id = so.planned_wo_id
+  group by so.org_id, so.site_id, coalesce(wo.production_line_id::text, 'unassigned'),
+    (coalesce(wo.scheduled_start_time, wo.planned_start_date, so.created_at) at time zone 'UTC')::date;
+
+create unique index mv_reporting_schedule_adherence_pk
+  on public.mv_reporting_schedule_adherence (org_id, site_key, line_id, schedule_date);
+revoke all on public.mv_reporting_schedule_adherence from public;
+revoke all on public.mv_reporting_schedule_adherence from app_user;
+grant select on public.mv_reporting_schedule_adherence to app_reporting_role;
+
+-- (B.7) mv_reporting_inventory_aging — LP age buckets, READ-ONLY consumer of 05 license_plates
+--   (05-warehouse is the canonical owner). age_bucket computed server-side at refresh.
+drop materialized view if exists public.mv_reporting_inventory_aging;
+create materialized view public.mv_reporting_inventory_aging as
+  select
+    lp.org_id,
+    lp.site_id,
+    coalesce(lp.site_id, '00000000-0000-0000-0000-000000000000'::uuid) as site_key,
+    lp.warehouse_id,
+    case
+      when pg_catalog.now() - lp.created_at < interval '7 days'  then '0_7d'
+      when pg_catalog.now() - lp.created_at < interval '14 days' then '7_14d'
+      when pg_catalog.now() - lp.created_at < interval '30 days' then '14_30d'
+      else 'gt_30d'
+    end                                                                as age_bucket,
+    count(*)::bigint                                                   as lp_count,
+    coalesce(sum(lp.quantity), 0)::numeric(18, 6)                     as total_qty,
+    min(lp.expiry_date)                                               as oldest_expiry
+  from public.license_plates lp
+  where lp.status in ('received', 'available', 'reserved', 'allocated', 'quarantine')
+  group by lp.org_id, lp.site_id, lp.warehouse_id,
+    case
+      when pg_catalog.now() - lp.created_at < interval '7 days'  then '0_7d'
+      when pg_catalog.now() - lp.created_at < interval '14 days' then '7_14d'
+      when pg_catalog.now() - lp.created_at < interval '30 days' then '14_30d'
+      else 'gt_30d'
+    end;
+
+create unique index mv_reporting_inventory_aging_pk
+  on public.mv_reporting_inventory_aging (org_id, site_key, warehouse_id, age_bucket);
+revoke all on public.mv_reporting_inventory_aging from public;
+revoke all on public.mv_reporting_inventory_aging from app_user;
+grant select on public.mv_reporting_inventory_aging to app_reporting_role;
+
+comment on materialized view public.mv_reporting_production_throughput is
+  '12-reporting READ-ONLY fact MV over 08-production wo_outputs (canonical owner). Reporting never writes wo_outputs.';
+comment on materialized view public.mv_reporting_oee_rollup is
+  '12-reporting READ-ONLY fact MV over 08-production oee_snapshots (canonical owner; D-OEE-1). Reporting + 15-OEE are read-only.';
+comment on materialized view public.mv_reporting_quality_hold_rate is
+  '12-reporting READ-ONLY fact MV over 09-quality quality_holds (canonical owner). Reporting never writes quality_holds.';
+comment on materialized view public.mv_reporting_schedule_adherence is
+  '12-reporting READ-ONLY fact MV over 04-planning schedule_outputs (canonical owner — NOT wo_outputs).';
diff --git a/packages/db/migrations/214-reporting-outbox-and-rbac-seed.sql b/packages/db/migrations/214-reporting-outbox-and-rbac-seed.sql
new file mode 100644
index 00000000..ef370a8e
--- /dev/null
+++ b/packages/db/migrations/214-reporting-outbox-and-rbac-seed.sql
@@ -0,0 +1,384 @@
+-- Migration 214: 12-Reporting — (A) admit the reporting.* telemetry events to the outbox_events CHECK
+--   constraint (keep the enum<->CHECK drift gate green), and (B) grant the rpt.* RBAC permission family
+--   to the org-admin role family + reporting operator/manager/viewer roles in BOTH the normalized
+--   role_permissions table and the legacy roles.permissions jsonb cache, with an AFTER INSERT trigger +
+--   full backfill.
+-- PRD: docs/prd/12-REPORTING-PRD.md §3 (RBAC matrix), §11 (V-RPT-ACCESS-*), §12 (read-only consumer;
+--   reporting.* are telemetry, not fact events), §13.2 (refresh/export telemetry).
+-- Tasks: T-001 (permission enum) + T-028 (RBAC-seed P0, X-1 unreachable-feature class).
+-- Canonical permission strings: packages/rbac/src/permissions.enum.ts (ALL_REPORTING_CORE_PERMISSIONS).
+-- Canonical event strings: packages/outbox/src/events.enum.ts (ALL_REPORTING_EVENTS / DB_EVENT_TYPES).
+-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
+
+-- ===========================================================================
+-- (A) Outbox event CHECK — drop + recreate with the FULL vocabulary (198's list + the 4 new
+--     reporting.* telemetry events). The enum<->CHECK drift gate (packages/outbox check-drift.test.ts)
+--     asserts THIS (now highest-numbered) migration's CHECK string set === DB_EVENT_TYPES, so the list
+--     below MUST stay byte-aligned with events.enum.ts (EventType ∪ LegacyEventAlias keys). Strict
+--     superset of 198 — no event dropped. Includes the existing warehouse.* + quality.* events.
+-- ===========================================================================
+alter table public.outbox_events
+  drop constraint if exists outbox_events_event_type_check;
+
+alter table public.outbox_events
+  add constraint outbox_events_event_type_check check (
+    event_type in (
+      'audit.recorded',
+      'bom.initial_version_created',
+      'bom.version_submitted',
+      'brief.completed_for_project',
+      'brief.converted',
+      'brief.created',
+      'catch_weight.variance_exceeded',
+      'compliance_doc.deleted',
+      'compliance_doc.expired',
+      'compliance_doc.expiring',
+      'compliance_doc.uploaded',
+      'd365.cache.refreshed',
+      'fa.allergens_changed',
+      'fa.built',
+      'fa.built_reset',
+      'fa.cascade',
+      'fa.core_closed',
+      'fa.created',
+      'fa.deleted',
+      'fa.dept_closed',
+      'fa.dept_reopened',
+      'fa.edit',
+      'fa.intermediate_code_changed',
+      'fa.recipe_changed',
+      'fa.template_applied',
+      'fg.allergens_changed',
+      'fg.bom.released',
+      'fg.created',
+      'fg.edit',
+      'fg.intermediate_code_changed',
+      'fg.release_blocked',
+      'fg.released_to_factory',
+      'formulation.locked',
+      'formulation.submitted_for_trial',
+      'lp.received',
+      'manufacturing_operations.created',
+      'manufacturing_operations.deactivated',
+      'manufacturing_operations.reset_to_seed',
+      'manufacturing_operations.updated',
+      'npd.allergens.bulk_rebuild_completed',
+      'npd.builder.released_records_created',
+      'npd.fg_candidate_mapped',
+      'npd.gate.advanced',
+      'npd.gate.approved',
+      'npd.gate.reverted',
+      'npd.project.brief_mapped',
+      'npd.project.created',
+      'npd.project.legacy_stages_closed',
+      'npd.project.release_requested',
+      'onboarding.first_wo_recorded',
+      'onboarding.step.advance',
+      'onboarding.step.back',
+      'onboarding.step.jump',
+      'onboarding.step.restart',
+      'onboarding.step.skip',
+      'org.created',
+      'org.mfa_enrollment.forced',
+      'org.security_policy.updated',
+      'production.allergen_changeover.validated',
+      'production.changeover.signed',
+      'production.consume.blocked',
+      'production.consume.completed',
+      'production.downtime.recorded',
+      'production.oee.snapshot',
+      'production.output.recorded',
+      'production.waste.recorded',
+      'production.wo.closed',
+      'production.wo.completed',
+      'production.wo.started',
+      'quality.atp_swab_failed',
+      'quality.hold.created',
+      'quality.hold.released',
+      'quality.ncr.assigned',
+      'quality.ncr.closed',
+      'quality.ncr.critical_dual_signed',
+      'quality.ncr.opened',
+      'quality.ncr.submitted',
+      'quality.ncr.updated',
+      'quality.recorded',
+      'reference.allergens_added_by_process.bulk_changed',
+      'reference.allergens_by_rm.bulk_changed',
+      'reference.csv.committed',
+      'reference.row.soft_deleted',
+      'reference.row.upserted',
+      'reporting.export.completed',
+      'reporting.export.failed',
+      'reporting.mv.refresh_completed',
+      'reporting.schedule.run_completed',
+      'risk.created',
+      'role.assigned',
+      'rule.deployed',
+      'settings.core_flag.updated',
+      'settings.d365_sync.updated',
+      'settings.dept_override.updated',
+      'settings.ip_allowlist.changed',
+      'settings.line.upserted',
+      'settings.location.deleted',
+      'settings.location.imported',
+      'settings.location.upserted',
+      'settings.machine.upserted',
+      'settings.module.disabled',
+      'settings.module.enabled',
+      'settings.module.toggled',
+      'settings.notification_channel_updated',
+      'settings.notification_digest_updated',
+      'settings.notification_rule_updated',
+      'settings.org.created',
+      'settings.org.updated',
+      'settings.reference.row_updated',
+      'settings.role.assigned',
+      'settings.rule.deployed',
+      'settings.rule_variant.updated',
+      'settings.schema.migration_requested',
+      'settings.scim.token_created',
+      'settings.sso.config_changed',
+      'settings.upgrade.completed',
+      'settings.upgrade.promoted',
+      'settings.upgrade.rolled_back',
+      'settings.upgrade.scheduled',
+      'settings.user.accepted',
+      'settings.user.deactivated',
+      'settings.user.invitation_resent',
+      'settings.user.invited',
+      'settings.warehouse.deactivated',
+      'shipment.created',
+      'technical.factory_spec.approved',
+      'tenant.cohort.advanced',
+      'tenant.migration.run',
+      'tenant.migration.run.failed',
+      'unit_of_measure.conversion_created',
+      'unit_of_measure.created',
+      'unit_of_measure.soft_deleted',
+      'user.invited',
+      'warehouse.lp.received',
+      'warehouse.lp.shipped',
+      'warehouse.lp.transitioned',
+      'warehouse.material.consumed',
+      'wo.ready'
+    )
+  );
+
+comment on constraint outbox_events_event_type_check on public.outbox_events
+  is 'Regenerated from events.enum.ts DB_EVENT_TYPES (138 types incl reporting.* telemetry).';
+
+-- ===========================================================================
+-- (B) rpt.* RBAC permission seed.
+--   ROOT CAUSE (X-1 unreachable-feature / 403-everywhere class — same as 116/146/148/149/154/185/192/
+--   198): adding the rpt.* strings to the enum (T-001) grants NOBODY access. The deployed org
+--   administrator is on the canonical org-admin role family, which receives NONE of the rpt.* strings —
+--   so every reporting page/action 403s at live Gate-5.
+--
+--   This grants (PRD §3 least-privilege matrix):
+--     * the COMPLETE rpt.* set (14 strings) to the org-admin role family;
+--     * the reporting-VIEWER subset (dashboard view only) to a viewer role family;
+--     * the reporting-OPERATOR subset (view + csv/pdf export + preset save/share/delete) to an
+--       operator role family;
+--     * the reporting-MANAGER subset (operator subset + integration/rules read + schedule + mv.refresh
+--       + settings.read) to a manager role family;
+--   in BOTH role_permissions (normalized) and roles.permissions (legacy jsonb cache), for every existing
+--   org, with an AFTER INSERT trigger so new orgs inherit it. Reporting role codes are matched
+--   defensively across naming conventions; the grant is a no-op for any role code not present in an org
+--   (idempotent). The admin-family grant is the load-bearing one for Gate-5 reachability. Models on
+--   149/154/185/192/198.
+-- ===========================================================================
+create or replace function public.seed_reporting_permissions_for_org(p_org_id uuid)
+returns void
+language plpgsql
+security definer
+set search_path = pg_catalog
+as $$
+declare
+  -- Complete rpt.* family (PRD §3 RBAC matrix). Mirrors ALL_REPORTING_CORE_PERMISSIONS.
+  v_all_perms text[] := array[
+    'rpt.dashboard.view',
+    'rpt.export.csv',
+    'rpt.export.pdf',
+    'rpt.preset.save',
+    'rpt.preset.share',
+    'rpt.preset.delete',
+    'rpt.schedule.create',
+    'rpt.schedule.run_now',
+    'rpt.schedule.delete',
+    'rpt.settings.read',
+    'rpt.settings.edit',
+    'rpt.mv.refresh',
+    'rpt.integration.read',
+    'rpt.rules_usage.read'
+  ];
+  -- Reporting VIEWER: base dashboard read only (no export, no preset, no admin).
+  v_viewer_perms text[] := array[
+    'rpt.dashboard.view'
+  ];
+  -- Reporting OPERATOR: view + export + own-preset management. NOT schedule/settings/integration/refresh.
+  v_operator_perms text[] := array[
+    'rpt.dashboard.view',
+    'rpt.export.csv',
+    'rpt.export.pdf',
+    'rpt.preset.save',
+    'rpt.preset.share',
+    'rpt.preset.delete'
+  ];
+  -- Reporting MANAGER: operator subset + scheduling + admin reads + mv.refresh + settings.read.
+  -- (settings.edit + schedule.delete remain admin-only per least-privilege.)
+  v_manager_perms text[] := array[
+    'rpt.dashboard.view',
+    'rpt.export.csv',
+    'rpt.export.pdf',
+    'rpt.preset.save',
+    'rpt.preset.share',
+    'rpt.preset.delete',
+    'rpt.schedule.create',
+    'rpt.schedule.run_now',
+    'rpt.settings.read',
+    'rpt.mv.refresh',
+    'rpt.integration.read',
+    'rpt.rules_usage.read'
+  ];
+  -- org-admin role family across naming conventions used in this codebase.
+  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin'];
+  -- Reporting viewer/operator/manager role families (defensive — codes vary; no-op if absent).
+  v_viewer_roles text[]   := array['reporting_viewer','report_viewer','rpt_viewer','analyst_viewer'];
+  v_operator_roles text[] := array['reporting_operator','report_operator','rpt_operator','analyst'];
+  v_manager_roles text[]  := array['reporting_manager','report_manager','rpt_manager','operations_manager'];
+begin
+  -- --- Normalized storage (role_permissions) ---
+  -- admin family: full set.
+  insert into public.role_permissions (role_id, permission)
+  select r.id, p.permission
+  from public.roles r
+  cross join unnest(v_all_perms) as p(permission)
+  where r.org_id = p_org_id
+    and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles))
+  on conflict (role_id, permission) do nothing;
+
+  -- viewer family.
+  insert into public.role_permissions (role_id, permission)
+  select r.id, p.permission
+  from public.roles r
+  cross join unnest(v_viewer_perms) as p(permission)
+  where r.org_id = p_org_id
+    and (r.code = any(v_viewer_roles) or r.slug = any(v_viewer_roles))
+  on conflict (role_id, permission) do nothing;
+
+  -- operator family.
+  insert into public.role_permissions (role_id, permission)
+  select r.id, p.permission
+  from public.roles r
+  cross join unnest(v_operator_perms) as p(permission)
+  where r.org_id = p_org_id
+    and (r.code = any(v_operator_roles) or r.slug = any(v_operator_roles))
+  on conflict (role_id, permission) do nothing;
+
+  -- manager family.
+  insert into public.role_permissions (role_id, permission)
+  select r.id, p.permission
+  from public.roles r
+  cross join unnest(v_manager_perms) as p(permission)
+  where r.org_id = p_org_id
+    and (r.code = any(v_manager_roles) or r.slug = any(v_manager_roles))
+  on conflict (role_id, permission) do nothing;
+
+  -- --- Legacy jsonb cache (roles.permissions) ---
+  update public.roles r
+     set permissions = coalesce(
+       (
+         select jsonb_agg(distinct merged.permission order by merged.permission)
+         from (
+           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
+           union all
+           select unnest(v_all_perms)
+         ) merged
+       ),
+       '[]'::jsonb
+     )
+   where r.org_id = p_org_id
+     and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles));
+
+  update public.roles r
+     set permissions = coalesce(
+       (
+         select jsonb_agg(distinct merged.permission order by merged.permission)
+         from (
+           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
+           union all
+           select unnest(v_viewer_perms)
+         ) merged
+       ),
+       '[]'::jsonb
+     )
+   where r.org_id = p_org_id
+     and (r.code = any(v_viewer_roles) or r.slug = any(v_viewer_roles));
+
+  update public.roles r
+     set permissions = coalesce(
+       (
+         select jsonb_agg(distinct merged.permission order by merged.permission)
+         from (
+           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
+           union all
+           select unnest(v_operator_perms)
+         ) merged
+       ),
+       '[]'::jsonb
+     )
+   where r.org_id = p_org_id
+     and (r.code = any(v_operator_roles) or r.slug = any(v_operator_roles));
+
+  update public.roles r
+     set permissions = coalesce(
+       (
+         select jsonb_agg(distinct merged.permission order by merged.permission)
+         from (
+           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
+           union all
+           select unnest(v_manager_perms)
+         ) merged
+       ),
+       '[]'::jsonb
+     )
+   where r.org_id = p_org_id
+     and (r.code = any(v_manager_roles) or r.slug = any(v_manager_roles));
+end;
+$$;
+
+revoke all on function public.seed_reporting_permissions_for_org(uuid) from public;
+revoke all on function public.seed_reporting_permissions_for_org(uuid) from app_user;
+
+create or replace function public.seed_reporting_permissions_on_org_insert()
+returns trigger
+language plpgsql
+security definer
+set search_path = pg_catalog
+as $$
+begin
+  perform public.seed_reporting_permissions_for_org(new.id);
+  return new;
+end;
+$$;
+
+revoke all on function public.seed_reporting_permissions_on_org_insert() from public;
+revoke all on function public.seed_reporting_permissions_on_org_insert() from app_user;
+
+-- Fire after the 080 role-seeding trigger so the admin roles already exist (zzz prefix sorts last).
+drop trigger if exists trg_zzz_seed_reporting_permissions on public.organizations;
+create trigger trg_zzz_seed_reporting_permissions
+  after insert on public.organizations
+  for each row
+  execute function public.seed_reporting_permissions_on_org_insert();
+
+-- Backfill every existing org.
+do $$
+declare
+  v_org_id uuid;
+begin
+  for v_org_id in select id from public.organizations loop
+    perform public.seed_reporting_permissions_for_org(v_org_id);
+  end loop;
+end
+$$;
diff --git a/packages/db/migrations/215-multi-site-sites-registry-context.sql b/packages/db/migrations/215-multi-site-sites-registry-context.sql
new file mode 100644
index 00000000..28d05625
--- /dev/null
+++ b/packages/db/migrations/215-multi-site-sites-registry-context.sql
@@ -0,0 +1,534 @@
+-- Migration 215: 14-multi-site — SCHEMA FOUNDATION.
+--   (A) app.session_site_contexts + app.active_site_contexts trust store + app.set_site_context()
+--       setter + app.current_site_id() reader (the site-scoping primitive every operational table's
+--       day-1 site_id column awaits; T-001).
+--   (B) public.sites — the canonical physical-site registry (org master data, org-scoped — NOT
+--       site-scoped per §6.4 REC-L1). site_id columns across all modules are nullable-no-FK day-1;
+--       THIS migration owns the FK target so future modules can reference public.sites (T-002).
+--   (C) public.operational_tables — the cross-module site-scoping registry + app.is_site_scoped_table()
+--       helper. Records which operational tables carry a day-1 site_id column awaiting the T-030
+--       backfill (NOT NULL + (org_id, site_id) policy + app.current_site_id()). This migration ONLY
+--       ships the registry + seeds the known §9.8 tables; it does NOT ALTER/backfill any other
+--       module's table (that is T-030, out of scope).
+--   (D) public.inter_site_transfer_orders — the inter-site transfer (IST/TO) shell, the one
+--       OPERATIONAL site-scoped table this foundation owns (from_site/to_site reference public.sites).
+--       Org+site RLS via app.current_org_id() AND app.current_site_id(). (T-008 shell.)
+--   (E) Outbox CHECK regenerated to equal DB_EVENT_TYPES incl the 5 new transfer_order.* /
+--       transport_lane.* events (drift gate green).
+--
+-- PRD: docs/prd/14-MULTI-SITE-PRD.md §9.1 (sites), §9.6 (IST), §9.8 (operational table list),
+--      §9.9 (composite indexes), §11.1 V-MS-01/04, §15.1 (current_site_id), §12.3/§10A.4 (events).
+-- Tasks: T-001 (site context), T-002 (sites), T-008 (IST shell), T-017 (events), T-030 (registry contract).
+--
+-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id()
+--   (migration 002-rls-baseline.sql — never redefined). The new app.current_site_id() mirrors that
+--   trust-store contract (no raw current_setting GUC read leaks past the SECURITY DEFINER body).
+-- site_id day-1: nullable uuid (no retro-FK) on every operational table; sites lands now so the FK
+--   TARGET exists for future modules, but NO retro-FK is added to existing nullable site_id columns
+--   (that is the T-030 backfill, out of scope here).
+-- NUMERIC-exact: transfer_cost is NUMERIC(18,2) (money — never float).
+-- Canonical-owner separation: this migration creates ONLY sites + operational_tables +
+--   inter_site_transfer_orders + the site-context functions. It does NOT create/alter wo_outputs
+--   (08), oee_snapshots (08), downtime_events (08), schedule_outputs (04), license_plates (05),
+--   item_cost_history (03), quality_holds / ncr_reports / v_active_holds (09).
+
+-- ===========================================================================
+-- (A) Site-context primitive — app.session_site_contexts trust store + setter/reader (T-001).
+--     Mirrors app.session_org_contexts / app.set_org_context / app.current_org_id() in 002.
+--     site_id NULL on a trust row = explicit super_admin ALL-sites mode (V-MS-07).
+-- ===========================================================================
+create table if not exists app.session_site_contexts (
+  session_token uuid primary key,
+  user_id       uuid not null,
+  org_id        uuid not null references public.organizations(id) on delete cascade,
+  site_id       uuid,  -- NULL = ALL-sites (super_admin) per V-MS-07
+  created_at    timestamptz not null default pg_catalog.now()
+);
+
+create table if not exists app.active_site_contexts (
+  backend_pid    integer primary key,
+  transaction_id bigint not null,
+  session_token  uuid not null references app.session_site_contexts(session_token) on delete cascade,
+  site_id        uuid,  -- NULL = ALL-sites mode (super_admin)
+  set_at         timestamptz not null default pg_catalog.now()
+);
+
+revoke all on app.session_site_contexts from public;
+revoke all on app.session_site_contexts from app_user;
+revoke all on app.active_site_contexts from public;
+revoke all on app.active_site_contexts from app_user;
+
+-- Setter: verifies the session row exists; if its site_id is NOT NULL it MUST equal the requested
+-- site (else PG 28000); if its site_id IS NULL the caller may declare ALL-sites (site arg NULL) OR a
+-- specific in-scope site is delegated to site_user_access at the app layer (not enforced here — the
+-- trust-store row is the gate). Distinguishes 'no row' (reject) from 'row with site_id NULL' (allow).
+create or replace function app.set_site_context(session_token uuid, site uuid)
+returns void
+language plpgsql
+security definer
+set search_path = pg_catalog
+as $$
+declare
+  v_trusted_site uuid;
+  v_found        boolean;
+begin
+  select trusted_context.site_id,
+         true
+    into v_trusted_site, v_found
+  from app.session_site_contexts trusted_context
+  where trusted_context.session_token = set_site_context.session_token
+  limit 1;
+
+  if not coalesce(v_found, false) then
+    raise exception 'invalid site context'
+      using errcode = '28000';
+  end if;
+
+  -- A site-bound trust row may only set its own site (mismatch = spoof attempt).
+  if v_trusted_site is not null and (set_site_context.site is null or set_site_context.site <> v_trusted_site) then
+    raise exception 'invalid site context'
+      using errcode = '28000';
+  end if;
+
+  insert into app.active_site_contexts (backend_pid, transaction_id, session_token, site_id, set_at)
+  values (pg_catalog.pg_backend_pid(), pg_catalog.txid_current(), set_site_context.session_token, set_site_context.site, pg_catalog.now())
+  on conflict (backend_pid) do update
+    set transaction_id = excluded.transaction_id,
+        session_token  = excluded.session_token,
+        site_id        = excluded.site_id,
+        set_at         = excluded.set_at;
+end;
+$$;
+
+-- Reader: returns the bound site for the current backend+tx, NULL = super_admin / ALL-sites mode.
+-- SECURITY DEFINER STABLE LEAKPROOF; the only legal read of the GUC trust store lives here.
+create or replace function app.current_site_id()
+returns uuid
+language sql
+security definer
+stable
+leakproof
+set search_path = pg_catalog
+as $$
+  select active_context.site_id
+  from app.active_site_contexts active_context
+  join app.session_site_contexts trusted_context
+    on trusted_context.session_token = active_context.session_token
+  where active_context.backend_pid = pg_catalog.pg_backend_pid()
+    and active_context.transaction_id = pg_catalog.txid_current_if_assigned()
+  limit 1
+$$;
+
+revoke all on function app.set_site_context(uuid, uuid) from public;
+revoke all on function app.current_site_id() from public;
+grant execute on function app.set_site_context(uuid, uuid) to app_user;
+grant execute on function app.current_site_id() to app_user;
+
+-- ===========================================================================
+-- (B) public.sites — physical-site registry (org master data, org-scoped; §9.1, T-002).
+--     V-MS-01 exactly-one-default-site-per-org via unique partial index. site_code unique per org.
+--     parent_site_id self-ref (archive-only, no CASCADE per D-MS-3). NO site_id column on sites
+--     itself (master data per §6.4 REC-L1; a site_id here would be circular).
+-- ===========================================================================
+create table if not exists public.sites (
+  id                    uuid primary key default gen_random_uuid(),
+  org_id                uuid not null references public.organizations(id) on delete cascade,
+
+  site_code             text not null,
+  name                  text not null,
+  is_default            boolean not null default false,
+
+  legal_entity          text,
+  timezone              text not null default 'UTC',  -- IANA TZ validated at app layer (V-MS-04, zod)
+  country               text,
+  data_residency_region text,
+
+  hierarchy_config_id   uuid,                          -- soft FK to sites_hierarchy_config (T-005)
+  parent_site_id        uuid references public.sites(id) on delete restrict,  -- archive-only (D-MS-3)
+  address               jsonb not null default '{}'::jsonb,
+  l3_ext_cols           jsonb not null default '{}'::jsonb,
+
+  is_active             boolean not null default true,
+  activated_at          timestamptz,
+
+  created_by            uuid references public.users(id) on delete set null,
+  updated_by            uuid references public.users(id) on delete set null,
+  created_at            timestamptz not null default pg_catalog.now(),
+  updated_at            timestamptz not null default pg_catalog.now(),
+
+  constraint sites_org_code_uq unique (org_id, site_code)
+);
+
+-- V-MS-01: at most one default site per org.
+create unique index if not exists idx_sites_default
+  on public.sites (org_id) where is_default = true;
+-- org-scoped active read.
+create index if not exists idx_sites_org
+  on public.sites (org_id) where is_active;
+create index if not exists sites_org_idx
+  on public.sites (org_id);
+create index if not exists sites_parent_idx
+  on public.sites (parent_site_id) where parent_site_id is not null;
+
+alter table public.sites enable row level security;
+alter table public.sites force row level security;
+
+drop policy if exists sites_org_context on public.sites;
+create policy sites_org_context
+  on public.sites
+  for all
+  to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+
+revoke all on public.sites from public;
+revoke all on public.sites from app_user;
+grant select, insert, update, delete on public.sites to app_user;
+
+create or replace function public.sites_set_updated_at()
+returns trigger
+language plpgsql
+as $$
+begin
+  new.updated_at := pg_catalog.now();
+  return new;
+end;
+$$;
+
+drop trigger if exists sites_set_updated_at on public.sites;
+create trigger sites_set_updated_at
+  before update on public.sites
+  for each row execute function public.sites_set_updated_at();
+
+-- ===========================================================================
+-- (C) public.operational_tables — the cross-module site-scoping REGISTRY (§9.8 contract, T-030).
+--     Declares which operational tables carry a day-1 site_id column that the later activation
+--     migration (T-030) will make NOT NULL + add an (org_id, site_id) policy via app.current_site_id().
+--     This is the checked-in mechanism for the day-1 rule (decision D-1 option A). This migration
+--     ONLY ships the registry + helper + seeds the §9.8 table names; it ALTERs nothing else.
+-- ===========================================================================
+create table if not exists public.operational_tables (
+  table_name       text primary key,
+  owning_module    text not null,         -- e.g. '05-warehouse', '08-production'
+  -- 'pending'  = site_id column exists day-1, NOT yet activated (nullable, no policy);
+  -- 'activated'= T-030 backfill complete (NOT NULL + (org_id, site_id) site-scoped policy).
+  scoping_status   text not null default 'pending',
+  -- whether the day-1 nullable site_id column has actually shipped on the table yet.
+  site_id_present  boolean not null default false,
+  notes            text,
+  registered_at    timestamptz not null default pg_catalog.now(),
+  activated_at     timestamptz,
+  constraint operational_tables_scoping_status_check
+    check (scoping_status in ('pending', 'activating', 'activated'))
+);
+
+-- Registry is a global catalog (no org_id) — read-only to app_user, written only by migrations.
+revoke all on public.operational_tables from public;
+revoke all on public.operational_tables from app_user;
+grant select on public.operational_tables to app_user;
+
+-- Helper: is this table registered as site-scoped (i.e. should T-030 backfill it)?
+create or replace function app.is_site_scoped_table(p_table_name text)
+returns boolean
+language sql
+security definer
+stable
+set search_path = pg_catalog
+as $$
+  select exists (
+    select 1 from public.operational_tables ot
+    where ot.table_name = p_table_name
+  )
+$$;
+
+revoke all on function app.is_site_scoped_table(text) from public;
+grant execute on function app.is_site_scoped_table(text) to app_user;
+
+-- Seed the §9.8 operational tables that carry a day-1 nullable site_id column awaiting T-030.
+-- site_id_present is true only for tables that already shipped the day-1 site_id column in earlier
+-- migrations (license_plates @191, quality_holds/ncr_reports @197); the rest are declared 'pending'
+-- with site_id_present=false so T-030 knows to ADD the column. owning_module records canon ownership;
+-- THIS migration does not touch those tables.
+insert into public.operational_tables (table_name, owning_module, scoping_status, site_id_present, notes)
+values
+  ('warehouses',              '05-warehouse',  'pending', false, '§9.8'),
+  ('license_plates',          '05-warehouse',  'pending', true,  '§9.8; day-1 site_id @191'),
+  ('grn_items',               '05-warehouse',  'pending', false, '§9.8'),
+  ('stock_movements',         '05-warehouse',  'pending', false, '§9.8'),
+  ('work_orders',             '08-production', 'pending', false, '§9.8'),
+  ('wo_outputs',              '08-production', 'pending', false, '§9.8; canon owner 08'),
+  ('wo_consumptions',         '08-production', 'pending', false, '§9.8'),
+  ('wo_dependencies',         '08-production', 'pending', false, '§9.8'),
+  ('downtime_events',         '08-production', 'pending', false, '§9.8; canon owner 08'),
+  ('quality_holds',           '09-quality',   'pending', true,  '§9.8; day-1 site_id @197'),
+  ('quality_inspections',     '09-quality',   'pending', false, '§9.8'),
+  ('ncr_reports',             '09-quality',   'pending', true,  '§9.8; day-1 site_id @197'),
+  ('haccp_plans',             '09-quality',   'pending', false, '§9.8'),
+  ('shipments',               '11-shipping',  'pending', false, '§9.8'),
+  ('sales_orders',            '11-shipping',  'pending', false, '§9.8'),
+  ('inventory_cost_layers',   '10-finance',   'pending', false, '§9.8'),
+  ('wip_balances',            '10-finance',   'pending', false, '§9.8'),
+  ('oee_snapshots',           '08-production', 'pending', false, '§9.8; canon owner 08 (15-oee read-only)'),
+  ('maintenance_work_orders', '13-maintenance','pending', false, '§9.8'),
+  ('spare_parts_stock',       '13-maintenance','pending', false, '§9.8'),
+  ('calibration_instruments', '13-maintenance','pending', false, '§9.8'),
+  ('inter_site_transfer_orders','14-multi-site','pending', true,  '§9.6 IST shell owned by 14-multi-site')
+on conflict (table_name) do nothing;
+
+-- ===========================================================================
+-- (D) public.inter_site_transfer_orders — IST shell (§9.6, T-008). The one OPERATIONAL site-scoped
+--     table this foundation owns. from_site_id/to_site_id are hard FKs to public.sites (the FK target
+--     this module ships). site_id is the day-1 nullable scoping column (its own composite (org_id,
+--     site_id) index per §9.9). cost_allocation_method CHECK + DEFAULT 'receiver' (D-MS-11).
+--     RLS org+site via app.current_org_id() AND app.current_site_id() (REC-L1: ALL-sites when
+--     app.current_site_id() IS NULL).
+-- ===========================================================================
+create table if not exists public.inter_site_transfer_orders (
+  id                          uuid primary key default gen_random_uuid(),
+  org_id                      uuid not null references public.organizations(id) on delete cascade,
+  site_id                     uuid,  -- day-1 nullable scoping column (originating site); T-030 backfill
+
+  to_number                   text not null,
+  status                      text not null default 'draft',
+
+  from_site_id                uuid references public.sites(id) on delete restrict,
+  to_site_id                  uuid references public.sites(id) on delete restrict,
+
+  transfer_cost               numeric(18, 2),  -- money: NUMERIC-exact (never float)
+  cost_allocation_method      text not null default 'receiver',
+
+  expected_arrival_at         timestamptz,
+  shipped_at                  timestamptz,
+  actual_arrival_at           timestamptz,
+
+  -- dual cross-site manager-approval refs (audit_events.id soft refs; D-MS-11). NULL = not approved.
+  from_site_manager_approval_id uuid,
+  to_site_manager_approval_id   uuid,
+
+  notes                       text,
+  ext_jsonb                   jsonb not null default '{}'::jsonb,
+
+  created_by                  uuid references public.users(id) on delete set null,
+  updated_by                  uuid references public.users(id) on delete set null,
+  created_at                  timestamptz not null default pg_catalog.now(),
+  updated_at                  timestamptz not null default pg_catalog.now(),
+
+  constraint inter_site_transfer_orders_org_to_number_uq unique (org_id, to_number),
+  constraint inter_site_transfer_orders_status_check check (
+    status in ('draft', 'approved', 'shipped', 'in_transit', 'received', 'cancelled')
+  ),
+  constraint inter_site_transfer_orders_cost_alloc_check check (
+    cost_allocation_method in ('sender', 'receiver', 'split', 'none')
+  ),
+  constraint inter_site_transfer_orders_transfer_cost_nonneg_check check (
+    transfer_cost is null or transfer_cost >= 0
+  )
+);
+
+-- §9.9 mandatory composite for site-scoped reads (planner must hit (org_id, site_id)).
+create index if not exists idx_ist_org_site
+  on public.inter_site_transfer_orders (org_id, site_id);
+create index if not exists inter_site_transfer_orders_org_idx
+  on public.inter_site_transfer_orders (org_id);
+create index if not exists inter_site_transfer_orders_from_site_idx
+  on public.inter_site_transfer_orders (from_site_id) where from_site_id is not null;
+create index if not exists inter_site_transfer_orders_to_site_idx
+  on public.inter_site_transfer_orders (to_site_id) where to_site_id is not null;
+create index if not exists inter_site_transfer_orders_status_idx
+  on public.inter_site_transfer_orders (org_id, status);
+
+alter table public.inter_site_transfer_orders enable row level security;
+alter table public.inter_site_transfer_orders force row level security;
+
+-- Org + site scope. app.current_site_id() IS NULL = super_admin ALL-sites mode (V-MS-07); otherwise
+-- a row is visible when its site_id matches the bound site OR is still NULL (day-1 pre-backfill).
+drop policy if exists inter_site_transfer_orders_site_scope on public.inter_site_transfer_orders;
+create policy inter_site_transfer_orders_site_scope
+  on public.inter_site_transfer_orders
+  for all
+  to app_user
+  using (
+    org_id = app.current_org_id()
+    and (app.current_site_id() is null or site_id is null or site_id = app.current_site_id())
+  )
+  with check (
+    org_id = app.current_org_id()
+    and (app.current_site_id() is null or site_id is null or site_id = app.current_site_id())
+  );
+
+revoke all on public.inter_site_transfer_orders from public;
+revoke all on public.inter_site_transfer_orders from app_user;
+grant select, insert, update, delete on public.inter_site_transfer_orders to app_user;
+
+create or replace function public.inter_site_transfer_orders_set_updated_at()
+returns trigger
+language plpgsql
+as $$
+begin
+  new.updated_at := pg_catalog.now();
+  return new;
+end;
+$$;
+
+drop trigger if exists inter_site_transfer_orders_set_updated_at on public.inter_site_transfer_orders;
+create trigger inter_site_transfer_orders_set_updated_at
+  before update on public.inter_site_transfer_orders
+  for each row execute function public.inter_site_transfer_orders_set_updated_at();
+
+-- ===========================================================================
+-- (E) Outbox event CHECK — drop + recreate with the FULL vocabulary (198's list + the 5 new
+--     14-multi-site events). The enum<->CHECK drift gate (packages/outbox check-drift.test.ts) asserts
+--     THIS (now highest-numbered) migration's CHECK string set === DB_EVENT_TYPES, so the list below
+--     MUST stay byte-aligned with events.enum.ts (EventType ∪ LegacyEventAlias keys). Strict superset
+--     of 198 — no event dropped.
+-- ===========================================================================
+alter table public.outbox_events
+  drop constraint if exists outbox_events_event_type_check;
+
+alter table public.outbox_events
+  add constraint outbox_events_event_type_check check (
+    event_type in (
+      'audit.recorded',
+      'bom.initial_version_created',
+      'bom.version_submitted',
+      'brief.completed_for_project',
+      'brief.converted',
+      'brief.created',
+      'catch_weight.variance_exceeded',
+      'compliance_doc.deleted',
+      'compliance_doc.expired',
+      'compliance_doc.expiring',
+      'compliance_doc.uploaded',
+      'd365.cache.refreshed',
+      'fa.allergens_changed',
+      'fa.built',
+      'fa.built_reset',
+      'fa.cascade',
+      'fa.core_closed',
+      'fa.created',
+      'fa.deleted',
+      'fa.dept_closed',
+      'fa.dept_reopened',
+      'fa.edit',
+      'fa.intermediate_code_changed',
+      'fa.recipe_changed',
+      'fa.template_applied',
+      'fg.allergens_changed',
+      'fg.bom.released',
+      'fg.created',
+      'fg.edit',
+      'fg.intermediate_code_changed',
+      'fg.release_blocked',
+      'fg.released_to_factory',
+      'formulation.locked',
+      'formulation.submitted_for_trial',
+      'lp.received',
+      'manufacturing_operations.created',
+      'manufacturing_operations.deactivated',
+      'manufacturing_operations.reset_to_seed',
+      'manufacturing_operations.updated',
+      'npd.allergens.bulk_rebuild_completed',
+      'npd.builder.released_records_created',
+      'npd.fg_candidate_mapped',
+      'npd.gate.advanced',
+      'npd.gate.approved',
+      'npd.gate.reverted',
+      'npd.project.brief_mapped',
+      'npd.project.created',
+      'npd.project.legacy_stages_closed',
+      'npd.project.release_requested',
+      'onboarding.first_wo_recorded',
+      'onboarding.step.advance',
+      'onboarding.step.back',
+      'onboarding.step.jump',
+      'onboarding.step.restart',
+      'onboarding.step.skip',
+      'org.created',
+      'org.mfa_enrollment.forced',
+      'org.security_policy.updated',
+      'production.allergen_changeover.validated',
+      'production.changeover.signed',
+      'production.consume.blocked',
+      'production.consume.completed',
+      'production.downtime.recorded',
+      'production.oee.snapshot',
+      'production.output.recorded',
+      'production.waste.recorded',
+      'production.wo.closed',
+      'production.wo.completed',
+      'production.wo.started',
+      'quality.atp_swab_failed',
+      'quality.hold.created',
+      'quality.hold.released',
+      'quality.ncr.assigned',
+      'quality.ncr.closed',
+      'quality.ncr.critical_dual_signed',
+      'quality.ncr.opened',
+      'quality.ncr.submitted',
+      'quality.ncr.updated',
+      'quality.recorded',
+      'reference.allergens_added_by_process.bulk_changed',
+      'reference.allergens_by_rm.bulk_changed',
+      'reference.csv.committed',
+      'reference.row.soft_deleted',
+      'reference.row.upserted',
+      'risk.created',
+      'role.assigned',
+      'rule.deployed',
+      'settings.core_flag.updated',
+      'settings.d365_sync.updated',
+      'settings.dept_override.updated',
+      'settings.ip_allowlist.changed',
+      'settings.line.upserted',
+      'settings.location.deleted',
+      'settings.location.imported',
+      'settings.location.upserted',
+      'settings.machine.upserted',
+      'settings.module.disabled',
+      'settings.module.enabled',
+      'settings.module.toggled',
+      'settings.notification_channel_updated',
+      'settings.notification_digest_updated',
+      'settings.notification_rule_updated',
+      'settings.org.created',
+      'settings.org.updated',
+      'settings.reference.row_updated',
+      'settings.role.assigned',
+      'settings.rule.deployed',
+      'settings.rule_variant.updated',
+      'settings.schema.migration_requested',
+      'settings.scim.token_created',
+      'settings.sso.config_changed',
+      'settings.upgrade.completed',
+      'settings.upgrade.promoted',
+      'settings.upgrade.rolled_back',
+      'settings.upgrade.scheduled',
+      'settings.user.accepted',
+      'settings.user.deactivated',
+      'settings.user.invitation_resent',
+      'settings.user.invited',
+      'settings.warehouse.deactivated',
+      'shipment.created',
+      'technical.factory_spec.approved',
+      'tenant.cohort.advanced',
+      'tenant.migration.run',
+      'tenant.migration.run.failed',
+      'transfer_order.in_transit',
+      'transfer_order.received',
+      'transfer_order.shipped',
+      'transport_lane.created',
+      'transport_lane_rate_card.activated',
+      'unit_of_measure.conversion_created',
+      'unit_of_measure.created',
+      'unit_of_measure.soft_deleted',
+      'user.invited',
+      'warehouse.lp.received',
+      'warehouse.lp.shipped',
+      'warehouse.lp.transitioned',
+      'warehouse.material.consumed',
+      'wo.ready'
+    )
+  );
+
+comment on constraint outbox_events_event_type_check on public.outbox_events
+  is 'Regenerated from events.enum.ts DB_EVENT_TYPES (139 types incl 14-multi-site transfer_order.* / transport_lane.*).';
diff --git a/packages/db/migrations/216-multi-site-outbox-and-rbac-seed.sql b/packages/db/migrations/216-multi-site-outbox-and-rbac-seed.sql
new file mode 100644
index 00000000..b6566eb3
--- /dev/null
+++ b/packages/db/migrations/216-multi-site-outbox-and-rbac-seed.sql
@@ -0,0 +1,163 @@
+-- Migration 216: 14-multi-site — grant the multi_site.* RBAC permission family to the org-admin role
+--   family + site-manager operator roles in BOTH the normalized role_permissions table AND the legacy
+--   roles.permissions jsonb cache, with an AFTER INSERT trigger + full backfill.
+-- PRD: docs/prd/14-MULTI-SITE-PRD.md §10A.5 (lane/rate-card RBAC), §10B MS-101..110 (admin surfaces),
+--      §11.5 (activation), §14.2 (super-admin audit).
+-- Tasks: T-031 (permission enum) + T-032 (RBAC-seed P0, recurring-live-bug class 1).
+-- Canonical permission strings: packages/rbac/src/permissions.enum.ts (ALL_MULTI_SITE_PERMISSIONS).
+-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
+--
+-- ROOT CAUSE (X-1 unreachable-feature / 403-everywhere class — same as 116/146/148/149/154/185/192/198):
+--   adding the multi_site.* strings to the enum (T-031) grants NOBODY access. The deployed org
+--   administrator is on the canonical org-admin role family, which receives NONE of the multi_site.*
+--   strings — so every multi-site page/action 403s at live Gate-5. This grants the COMPLETE
+--   multi_site.* set (26 strings) to the org-admin role family, and the site-operational subset to a
+--   site-manager role family, in BOTH stores, for every existing org, with an AFTER INSERT trigger so
+--   new orgs inherit it. The admin-family grant is the load-bearing one for Gate-5 reachability.
+--   Models on 149/154/185/192/198.
+
+create or replace function public.seed_multi_site_permissions_for_org(p_org_id uuid)
+returns void
+language plpgsql
+security definer
+set search_path = pg_catalog
+as $$
+declare
+  -- Complete multi_site.* family (PRD §10A.5 / §10B / §11.5 / §14.2). Mirrors ALL_MULTI_SITE_PERMISSIONS.
+  v_all_perms text[] := array[
+    'multi_site.site.view',
+    'multi_site.site.create',
+    'multi_site.site.edit',
+    'multi_site.site.decommission',
+    'multi_site.site_access.assign',
+    'multi_site.site_access.revoke',
+    'multi_site.site_access.bulk_assign',
+    'multi_site.site_settings.override',
+    'multi_site.site_settings.clear',
+    'multi_site.ist.create',
+    'multi_site.ist.amend',
+    'multi_site.ist.cancel',
+    'multi_site.ist.approve',
+    'multi_site.lane.create',
+    'multi_site.lane.edit',
+    'multi_site.lane.deactivate',
+    'multi_site.rate_card.upload',
+    'multi_site.rate_card.approve',
+    'multi_site.rate_card.delete',
+    'multi_site.replication.retry',
+    'multi_site.replication.run_sync',
+    'multi_site.conflict.resolve',
+    'multi_site.activation.start',
+    'multi_site.activation.rollback',
+    'multi_site.config.promote',
+    'multi_site.cross_site.read'
+  ];
+  -- Site-manager operational subset: views sites, manages IST (create/amend/cancel/approve at own
+  -- site per V-MS-10/11), creates lanes, uploads rate cards, retries replication. NOT the elevated
+  -- org-level admin strings (site create/edit/decommission, site_access bulk admin, rate_card
+  -- approve/delete, conflict.resolve, activation.start/rollback, config.promote, cross_site.read —
+  -- org-admin / super-admin only, SoD).
+  v_site_manager_perms text[] := array[
+    'multi_site.site.view',
+    'multi_site.ist.create',
+    'multi_site.ist.amend',
+    'multi_site.ist.cancel',
+    'multi_site.ist.approve',
+    'multi_site.lane.create',
+    'multi_site.lane.edit',
+    'multi_site.rate_card.upload',
+    'multi_site.replication.retry',
+    'multi_site.replication.run_sync'
+  ];
+  -- org-admin role family across naming conventions used in this codebase.
+  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin'];
+  -- site-manager role family (defensive — codes vary; grant is a no-op if absent).
+  v_site_manager_roles text[] := array['site_manager','site_admin','plant_manager','warehouse_manager','operations_manager'];
+begin
+  -- --- Normalized storage (role_permissions) ---
+  -- admin family: full set.
+  insert into public.role_permissions (role_id, permission)
+  select r.id, p.permission
+  from public.roles r
+  cross join unnest(v_all_perms) as p(permission)
+  where r.org_id = p_org_id
+    and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles))
+  on conflict (role_id, permission) do nothing;
+
+  -- site-manager family: operational subset.
+  insert into public.role_permissions (role_id, permission)
+  select r.id, p.permission
+  from public.roles r
+  cross join unnest(v_site_manager_perms) as p(permission)
+  where r.org_id = p_org_id
+    and (r.code = any(v_site_manager_roles) or r.slug = any(v_site_manager_roles))
+  on conflict (role_id, permission) do nothing;
+
+  -- --- Legacy jsonb cache (roles.permissions) ---
+  update public.roles r
+     set permissions = coalesce(
+       (
+         select jsonb_agg(distinct merged.permission order by merged.permission)
+         from (
+           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
+           union all
+           select unnest(v_all_perms)
+         ) merged
+       ),
+       '[]'::jsonb
+     )
+   where r.org_id = p_org_id
+     and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles));
+
+  update public.roles r
+     set permissions = coalesce(
+       (
+         select jsonb_agg(distinct merged.permission order by merged.permission)
+         from (
+           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
+           union all
+           select unnest(v_site_manager_perms)
+         ) merged
+       ),
+       '[]'::jsonb
+     )
+   where r.org_id = p_org_id
+     and (r.code = any(v_site_manager_roles) or r.slug = any(v_site_manager_roles));
+end;
+$$;
+
+revoke all on function public.seed_multi_site_permissions_for_org(uuid) from public;
+revoke all on function public.seed_multi_site_permissions_for_org(uuid) from app_user;
+
+create or replace function public.seed_multi_site_permissions_on_org_insert()
+returns trigger
+language plpgsql
+security definer
+set search_path = pg_catalog
+as $$
+begin
+  perform public.seed_multi_site_permissions_for_org(new.id);
+  return new;
+end;
+$$;
+
+revoke all on function public.seed_multi_site_permissions_on_org_insert() from public;
+revoke all on function public.seed_multi_site_permissions_on_org_insert() from app_user;
+
+-- Fire after the 080 role-seeding trigger so the admin roles already exist (zzz prefix sorts last).
+drop trigger if exists trg_zzz_seed_multi_site_permissions on public.organizations;
+create trigger trg_zzz_seed_multi_site_permissions
+  after insert on public.organizations
+  for each row
+  execute function public.seed_multi_site_permissions_on_org_insert();
+
+-- Backfill every existing org.
+do $$
+declare
+  v_org_id uuid;
+begin
+  for v_org_id in select id from public.organizations loop
+    perform public.seed_multi_site_permissions_for_org(v_org_id);
+  end loop;
+end
+$$;
diff --git a/packages/db/migrations/217-outbox-check-full-foundation-union.sql b/packages/db/migrations/217-outbox-check-full-foundation-union.sql
new file mode 100644
index 00000000..8c07b48a
--- /dev/null
+++ b/packages/db/migrations/217-outbox-check-full-foundation-union.sql
@@ -0,0 +1,198 @@
+-- Migration: 217-outbox-check-full-foundation-union.sql
+-- Regenerate outbox_events_event_type_check to the COMPLETE events.enum.ts DB_EVENT_TYPES union.
+-- Collection of the wave-B foundation modules (05-warehouse waveB, 10-finance, 13-maintenance,
+-- 15-oee, 07-planning-ext, 11-shipping, 12-reporting, 14-multi-site) added 39 new
+-- canonical event types. The previous latest definition (mig 215) only knew 139, so inserting any
+-- of the new module events into public.outbox_events would violate the CHECK. This recreates the
+-- constraint with all 178 permitted types so the drift gate (check-drift.test.ts) passes
+-- and every foundation can emit through the shared outbox.
+
+alter table public.outbox_events
+  drop constraint if exists outbox_events_event_type_check;
+
+alter table public.outbox_events
+  add constraint outbox_events_event_type_check check (
+    event_type in (
+      'audit.recorded',
+      'bom.initial_version_created',
+      'bom.version_submitted',
+      'brief.completed_for_project',
+      'brief.converted',
+      'brief.created',
+      'catch_weight.variance_exceeded',
+      'compliance_doc.deleted',
+      'compliance_doc.expired',
+      'compliance_doc.expiring',
+      'compliance_doc.uploaded',
+      'd365.cache.refreshed',
+      'fa.allergens_changed',
+      'fa.built',
+      'fa.built_reset',
+      'fa.cascade',
+      'fa.core_closed',
+      'fa.created',
+      'fa.deleted',
+      'fa.dept_closed',
+      'fa.dept_reopened',
+      'fa.edit',
+      'fa.intermediate_code_changed',
+      'fa.recipe_changed',
+      'fa.template_applied',
+      'fg.allergens_changed',
+      'fg.bom.released',
+      'fg.created',
+      'fg.edit',
+      'fg.intermediate_code_changed',
+      'fg.release_blocked',
+      'fg.released_to_factory',
+      'finance.consumption.valued',
+      'finance.cost_per_kg.changed',
+      'finance.standard_cost.approved',
+      'finance.valuation.closed_monthly',
+      'finance.variance.computed',
+      'formulation.locked',
+      'formulation.submitted_for_trial',
+      'lp.received',
+      'maintenance.calibration.completed',
+      'maintenance.calibration.failed',
+      'maintenance.loto.applied',
+      'maintenance.loto.released',
+      'maintenance.mwo.completed',
+      'maintenance.mwo.created',
+      'maintenance.pm.due',
+      'maintenance.sanitation.allergen_change.completed',
+      'manufacturing_operations.created',
+      'manufacturing_operations.deactivated',
+      'manufacturing_operations.reset_to_seed',
+      'manufacturing_operations.updated',
+      'matrix.version.published',
+      'npd.allergens.bulk_rebuild_completed',
+      'npd.builder.released_records_created',
+      'npd.fg_candidate_mapped',
+      'npd.gate.advanced',
+      'npd.gate.approved',
+      'npd.gate.reverted',
+      'npd.project.brief_mapped',
+      'npd.project.created',
+      'npd.project.legacy_stages_closed',
+      'npd.project.release_requested',
+      'oee.alert.threshold_breached',
+      'oee.anomaly.detected',
+      'oee.dsl_rule.updated',
+      'oee.shift.aggregated',
+      'oee.snapshot.refreshed',
+      'onboarding.first_wo_recorded',
+      'onboarding.step.advance',
+      'onboarding.step.back',
+      'onboarding.step.jump',
+      'onboarding.step.restart',
+      'onboarding.step.skip',
+      'org.created',
+      'org.mfa_enrollment.forced',
+      'org.security_policy.updated',
+      'planning.schedule.published',
+      'production.allergen_changeover.validated',
+      'production.changeover.signed',
+      'production.consume.blocked',
+      'production.consume.completed',
+      'production.downtime.recorded',
+      'production.oee.snapshot',
+      'production.output.recorded',
+      'production.waste.recorded',
+      'production.wo.closed',
+      'production.wo.completed',
+      'production.wo.started',
+      'quality.atp_swab_failed',
+      'quality.hold.created',
+      'quality.hold.released',
+      'quality.ncr.assigned',
+      'quality.ncr.closed',
+      'quality.ncr.critical_dual_signed',
+      'quality.ncr.opened',
+      'quality.ncr.submitted',
+      'quality.ncr.updated',
+      'quality.recorded',
+      'reference.allergens_added_by_process.bulk_changed',
+      'reference.allergens_by_rm.bulk_changed',
+      'reference.csv.committed',
+      'reference.row.soft_deleted',
+      'reference.row.upserted',
+      'reporting.export.completed',
+      'reporting.export.failed',
+      'reporting.mv.refresh_completed',
+      'reporting.schedule.run_completed',
+      'risk.created',
+      'role.assigned',
+      'rule.deployed',
+      'scheduler.assignment.approved',
+      'scheduler.assignment.bulk_approved',
+      'scheduler.assignment.overridden',
+      'scheduler.assignment.rejected',
+      'scheduler.run.completed',
+      'settings.core_flag.updated',
+      'settings.d365_sync.updated',
+      'settings.dept_override.updated',
+      'settings.ip_allowlist.changed',
+      'settings.line.upserted',
+      'settings.location.deleted',
+      'settings.location.imported',
+      'settings.location.upserted',
+      'settings.machine.upserted',
+      'settings.module.disabled',
+      'settings.module.enabled',
+      'settings.module.toggled',
+      'settings.notification_channel_updated',
+      'settings.notification_digest_updated',
+      'settings.notification_rule_updated',
+      'settings.org.created',
+      'settings.org.updated',
+      'settings.reference.row_updated',
+      'settings.role.assigned',
+      'settings.rule.deployed',
+      'settings.rule_variant.updated',
+      'settings.schema.migration_requested',
+      'settings.scim.token_created',
+      'settings.sso.config_changed',
+      'settings.upgrade.completed',
+      'settings.upgrade.promoted',
+      'settings.upgrade.rolled_back',
+      'settings.upgrade.scheduled',
+      'settings.user.accepted',
+      'settings.user.deactivated',
+      'settings.user.invitation_resent',
+      'settings.user.invited',
+      'settings.warehouse.deactivated',
+      'shipment.created',
+      'shipping.bol.issued',
+      'shipping.pick.completed',
+      'shipping.pick.released',
+      'shipping.shipment.confirmed',
+      'shipping.shipment.packed',
+      'shipping.so.cancelled',
+      'shipping.so.confirmed',
+      'shipping.so.released',
+      'spare.reorder_threshold_breached',
+      'technical.factory_spec.approved',
+      'tenant.cohort.advanced',
+      'tenant.migration.run',
+      'tenant.migration.run.failed',
+      'transfer_order.in_transit',
+      'transfer_order.received',
+      'transfer_order.shipped',
+      'transport_lane.created',
+      'transport_lane_rate_card.activated',
+      'unit_of_measure.conversion_created',
+      'unit_of_measure.created',
+      'unit_of_measure.soft_deleted',
+      'user.invited',
+      'warehouse.grn.received',
+      'warehouse.lp.received',
+      'warehouse.lp.shipped',
+      'warehouse.lp.transitioned',
+      'warehouse.material.consumed',
+      'wo.ready'
+    )
+  );
+
+comment on constraint outbox_events_event_type_check on public.outbox_events
+  is 'Regenerated from events.enum.ts DB_EVENT_TYPES (178 types; wave-B foundation union).';
</stdin>
codex
| severity (BLOCK/HIGH/MED/LOW) | file:line | issue | suggested fix |
|---|---|---|---|
| BLOCK | `packages/db/migrations/211-shipping-schema-foundation.sql:131` | Multiple shipping operational tables omit the required nullable day-1 `site_id`: `customer_contacts`, `customer_addresses`, `customer_allergen_restrictions`, `sales_order_lines`, `pick_list_lines`, `shipment_boxes`, and `shipment_box_contents`. The red-line requires `site_id` on every operational table. | Add `site_id uuid` to every shipping operational table and add the expected `(org_id, site_id)` indexes where missing. |
| BLOCK | `packages/db/migrations/211-shipping-schema-foundation.sql:567` | `sscc_counters` is an org-scoped operational table with mutable per-org state, but RLS is not enabled or forced. The migration explicitly skips RLS and grants `SELECT` to `app_user`, violating the “every operational table has RLS ENABLED + FORCED” rule. | Enable and force RLS on `public.sscc_counters`, add an `org_id = app.current_org_id()` policy, and keep writes constrained through the SECURITY DEFINER functions. |
| HIGH | `packages/db/migrations/215-multi-site-sites-registry-context.sql:244` | `operational_tables` registry seeds `shipments` and `sales_orders` with `site_id_present=false`, but migration 211 already creates both with `site_id`. This makes the T-030 registry inaccurate and could cause a later activation migration to try to add duplicate columns or mis-handle scoping state. | Seed `shipments` and `sales_orders` with `site_id_present=true`; also include the other shipping tables once `site_id` is added. |
| HIGH | `packages/db/migrations/215-multi-site-sites-registry-context.sql:151` | `public.sites` enforces “at most one default site per org” via a partial unique index, but not “exactly one”. The migration comment cites V-MS-01 exactly-one-default-site-per-org, yet the schema permits zero defaults. | Add an enforcement path for at least one default per org, for example a deferred constraint trigger or controlled site creation/update function that prevents leaving an org with zero default sites. |

VERDICT: FAIL + blocking items: missing `site_id` on shipping operational tables; `sscc_counters` lacks ENABLE/FORCE RLS.
tokens used
76,851
| severity (BLOCK/HIGH/MED/LOW) | file:line | issue | suggested fix |
|---|---|---|---|
| BLOCK | `packages/db/migrations/211-shipping-schema-foundation.sql:131` | Multiple shipping operational tables omit the required nullable day-1 `site_id`: `customer_contacts`, `customer_addresses`, `customer_allergen_restrictions`, `sales_order_lines`, `pick_list_lines`, `shipment_boxes`, and `shipment_box_contents`. The red-line requires `site_id` on every operational table. | Add `site_id uuid` to every shipping operational table and add the expected `(org_id, site_id)` indexes where missing. |
| BLOCK | `packages/db/migrations/211-shipping-schema-foundation.sql:567` | `sscc_counters` is an org-scoped operational table with mutable per-org state, but RLS is not enabled or forced. The migration explicitly skips RLS and grants `SELECT` to `app_user`, violating the “every operational table has RLS ENABLED + FORCED” rule. | Enable and force RLS on `public.sscc_counters`, add an `org_id = app.current_org_id()` policy, and keep writes constrained through the SECURITY DEFINER functions. |
| HIGH | `packages/db/migrations/215-multi-site-sites-registry-context.sql:244` | `operational_tables` registry seeds `shipments` and `sales_orders` with `site_id_present=false`, but migration 211 already creates both with `site_id`. This makes the T-030 registry inaccurate and could cause a later activation migration to try to add duplicate columns or mis-handle scoping state. | Seed `shipments` and `sales_orders` with `site_id_present=true`; also include the other shipping tables once `site_id` is added. |
| HIGH | `packages/db/migrations/215-multi-site-sites-registry-context.sql:151` | `public.sites` enforces “at most one default site per org” via a partial unique index, but not “exactly one”. The migration comment cites V-MS-01 exactly-one-default-site-per-org, yet the schema permits zero defaults. | Add an enforcement path for at least one default per org, for example a deferred constraint trigger or controlled site creation/update function that prevents leaving an org with zero default sites. |

VERDICT: FAIL + blocking items: missing `site_id` on shipping operational tables; `sscc_counters` lacks ENABLE/FORCE RLS.

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
session id: 019e93ea-d4be-7b12-8a03-a7b5b63cd5bd
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

Module under review: 08-production — migrations 181-189 (wo_outputs CANONICAL + consumption, executions+events, waste/downtime, changeover/allergen/oee_snapshots, production outbox+RBAC seed, ATP auto-fail, catch-weight variance, outbox full-union). 08 is the SOLE producer of wo_outputs + oee_snapshots.

<stdin>
diff --git a/packages/db/migrations/181-production-wo-outputs-consumption.sql b/packages/db/migrations/181-production-wo-outputs-consumption.sql
new file mode 100644
index 00000000..b64ee33b
--- /dev/null
+++ b/packages/db/migrations/181-production-wo-outputs-consumption.sql
@@ -0,0 +1,214 @@
+-- Migration 181: 08-Production — wo_outputs (CANONICAL) + wo_material_consumption.
+-- PRD: docs/prd/08-PRODUCTION-PRD.md §9.3, §9.4, §16.4 V-PROD-02/03/04/16/24, §5.1#4 R14.
+-- Tasks: _meta/atomic-tasks/08-production/tasks/T-003.json (wo_outputs),
+--        _meta/atomic-tasks/08-production/tasks/T-002.json (wo_material_consumption).
+--
+-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id().
+--   The PRD prose still says "tenant_id" — that is legacy; the Wave0 v4.3 column lock binds
+--   the physical column to org_id (see _meta/audits/2026-05-14-tenant-context-remediation.md).
+-- site_id day-1: site_id uuid is nullable, no FK and no registry — full per-site scoping
+--   (NOT NULL + (org_id, site_id) index + app.current_site_id() policy) lands later via the
+--   cross-module multi-site backfill (14-multi-site T-030). Until then the column exists so
+--   operational rows can be tagged without a schema break.
+-- NUMERIC-exact: qty columns are NUMERIC (never float). qty_kg / qty_consumed NUMERIC(12,3).
+--
+-- CANONICAL OWNERSHIP (2026-05-14 user decision — see
+--   _meta/audits/2026-05-14-fixer-F5-wo-outputs-and-quality-gate.md):
+--   08-Production owns `wo_outputs` (the canonical runtime output table). 04-Planning does
+--   NOT create it — planning owns `schedule_outputs` (migration 177) and 08-production
+--   materializes those rows into wo_outputs on the wo.start event, adding production-only
+--   columns (batch_number, qa_status, V-PROD-24 unique-per-year, catch_weight_details, etc.).
+--   The wo_outputs.output_type enum is 1:1 with schedule_outputs.output_role.
+--   NB: schedule_outputs.output_role uses 'byproduct'; wo_outputs.output_type uses
+--   'by_product' per the 08-production §9.4 / MON-domain-production canonical enum set.
+--
+-- Audit (R13): created/registered actor + timestamp columns + ext_jsonb + schema_version,
+--   matching the planning 176/177 pattern. This repo has no generic app.audit_event() trigger;
+--   the embedded actor/timestamp columns are the R13 audit surface.
+-- FKs: wo_id is a HARD FK to public.work_orders (migration 176, applied). product_id is a
+--   SOFT uuid (canonical product identity lives in 03-Technical public.items; a hard FK would
+--   couple migration ordering — mirrors planning 176/177). lp_id is a SOFT uuid to
+--   05-warehouse license_plates (not yet built) — service-layer validated.
+
+-- ===========================================================================
+-- wo_outputs — canonical runtime output rows (primary / co_product / by_product).
+-- ===========================================================================
+create table if not exists public.wo_outputs (
+  id                        uuid primary key default gen_random_uuid(),
+  org_id                    uuid not null references public.organizations(id) on delete cascade,
+  site_id                   uuid,
+
+  -- R14 idempotency: a materialization/registration is keyed by transaction_id so a retried
+  -- request never double-inserts an output row.
+  transaction_id            uuid not null,
+
+  wo_id                     uuid not null references public.work_orders(id) on delete cascade,
+
+  -- 1:1 with schedule_outputs.output_role ('primary'|'co_product'|'by_product').
+  output_type               text not null,
+
+  product_id                uuid not null, -- soft FK to 03-Technical public.items; service-layer-validated
+  lp_id                     uuid,          -- soft FK to 05-warehouse license_plates; service-layer-validated
+
+  batch_number              text not null,
+  qty_kg                    numeric(12, 3) not null,
+  uom                       text not null default 'kg',
+
+  qa_status                 text not null default 'PENDING',
+  expiry_date               date,
+  catch_weight_details      jsonb,
+  allergen_profile_snapshot jsonb,
+
+  label_printed_at          timestamptz,
+
+  ext_jsonb                 jsonb not null default '{}'::jsonb,
+  schema_version            integer not null default 1,
+
+  -- R13 audit
+  registered_by             uuid references public.users(id) on delete restrict,
+  registered_at             timestamptz not null default pg_catalog.now(),
+  created_by                uuid references public.users(id) on delete restrict,
+  updated_by                uuid references public.users(id) on delete restrict,
+  created_at                timestamptz not null default pg_catalog.now(),
+  updated_at                timestamptz not null default pg_catalog.now(),
+
+  constraint wo_outputs_transaction_id_unique unique (transaction_id),
+  constraint wo_outputs_output_type_check check (
+    output_type in ('primary', 'co_product', 'by_product')
+  ),
+  -- V-PROD-03/04: registered output quantity is non-negative.
+  constraint wo_outputs_qty_kg_nonneg_check check (qty_kg >= 0),
+  constraint wo_outputs_qa_status_check check (
+    qa_status in ('PENDING', 'PASSED', 'FAILED', 'ON_HOLD', 'RELEASED')
+  ),
+  constraint wo_outputs_schema_version_check check (schema_version >= 1)
+);
+
+-- V-PROD-24: batch_number unique per org per calendar year (year derived from registered_at).
+-- EXTRACT(YEAR FROM timestamptz) is not IMMUTABLE (depends on session TimeZone), so a direct
+-- expression index is rejected. We materialize the year via a STORED generated column on the
+-- UTC-normalized registered_at and build the unique index on that immutable column.
+alter table public.wo_outputs
+  add column if not exists registered_year integer
+  generated always as (extract(year from (registered_at at time zone 'UTC'))::integer) stored;
+
+create unique index if not exists wo_outputs_org_batch_year_uq
+  on public.wo_outputs (org_id, batch_number, registered_year);
+
+-- Indexes per §9.4
+create index if not exists idx_outputs_wo
+  on public.wo_outputs (org_id, wo_id);
+create index if not exists idx_outputs_lp
+  on public.wo_outputs (lp_id)
+  where lp_id is not null;
+create index if not exists idx_outputs_batch
+  on public.wo_outputs (org_id, batch_number);
+create index if not exists idx_outputs_qa_status
+  on public.wo_outputs (org_id, qa_status);
+create index if not exists idx_outputs_product
+  on public.wo_outputs (org_id, product_id);
+
+alter table public.wo_outputs enable row level security;
+alter table public.wo_outputs force row level security;
+
+drop policy if exists wo_outputs_org_context on public.wo_outputs;
+create policy wo_outputs_org_context
+  on public.wo_outputs
+  for all
+  to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+
+revoke all on public.wo_outputs from public;
+revoke all on public.wo_outputs from app_user;
+grant select, insert, update, delete on public.wo_outputs to app_user;
+
+create or replace function public.wo_outputs_set_updated_at()
+returns trigger
+language plpgsql
+as $$
+begin
+  new.updated_at := pg_catalog.now();
+  return new;
+end;
+$$;
+
+drop trigger if exists wo_outputs_set_updated_at on public.wo_outputs;
+create trigger wo_outputs_set_updated_at
+  before update on public.wo_outputs
+  for each row execute function public.wo_outputs_set_updated_at();
+
+-- ===========================================================================
+-- wo_material_consumption — consume-from-LP rows with R14 idempotency, FEFO + over-consume.
+-- §9.3. Genealogy: lp_id (soft FK to 05-warehouse) is the consumed lot; output linkage is
+--   resolved service-side via wo_id + the wo_outputs registered for the same WO.
+-- ===========================================================================
+create table if not exists public.wo_material_consumption (
+  id                            uuid primary key default gen_random_uuid(),
+  org_id                        uuid not null references public.organizations(id) on delete cascade,
+  site_id                       uuid,
+
+  transaction_id                uuid not null, -- R14 idempotency key
+
+  wo_id                         uuid not null references public.work_orders(id) on delete cascade,
+  component_id                  uuid not null, -- soft FK to 03-Technical items / 04 wo_materials.product_id
+  lp_id                         uuid not null, -- soft FK to 05-warehouse license_plates; service-layer-validated
+
+  qty_consumed                  numeric(12, 3) not null,
+  uom                           text not null default 'kg',
+
+  operator_id                   uuid references public.users(id) on delete set null,
+
+  fefo_adherence_flag           boolean not null,
+  fefo_deviation_reason         text,
+
+  over_consumption_flag         boolean not null default false,
+  over_consumption_approved_by  uuid references public.users(id) on delete set null,
+  over_consumption_approved_at  timestamptz,
+  over_consumption_reason_code  text,
+
+  ext_jsonb                     jsonb not null default '{}'::jsonb,
+
+  consumed_at                   timestamptz not null default pg_catalog.now(),
+  created_at                    timestamptz not null default pg_catalog.now(),
+  updated_at                    timestamptz not null default pg_catalog.now(),
+
+  constraint wo_material_consumption_transaction_id_unique unique (transaction_id),
+  constraint wo_material_consumption_qty_consumed_positive_check check (qty_consumed > 0),
+  -- §9.3: an over-consumption row is only valid once it carries an approver.
+  constraint chk_over_consumption_approval check (
+    over_consumption_flag = false or over_consumption_approved_by is not null
+  )
+);
+
+create index if not exists idx_consumption_wo
+  on public.wo_material_consumption (org_id, wo_id);
+create index if not exists idx_consumption_lp
+  on public.wo_material_consumption (lp_id);
+-- Partial index: only FEFO-deviation rows (FEFO deviation audit lookups).
+create index if not exists idx_consumption_fefo_dev
+  on public.wo_material_consumption (org_id, wo_id)
+  where fefo_adherence_flag = false;
+create index if not exists idx_consumption_operator_time
+  on public.wo_material_consumption (operator_id, consumed_at)
+  where operator_id is not null;
+
+alter table public.wo_material_consumption enable row level security;
+alter table public.wo_material_consumption force row level security;
+
+drop policy if exists wo_material_consumption_org_context on public.wo_material_consumption;
+create policy wo_material_consumption_org_context
+  on public.wo_material_consumption
+  for all
+  to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+
+revoke all on public.wo_material_consumption from public;
+revoke all on public.wo_material_consumption from app_user;
+grant select, insert, update, delete on public.wo_material_consumption to app_user;
+
+drop trigger if exists wo_material_consumption_set_updated_at on public.wo_material_consumption;
+create trigger wo_material_consumption_set_updated_at
+  before update on public.wo_material_consumption
+  for each row execute function public.wo_outputs_set_updated_at();
diff --git a/packages/db/migrations/182-production-wo-executions-events.sql b/packages/db/migrations/182-production-wo-executions-events.sql
new file mode 100644
index 00000000..8b0f8174
--- /dev/null
+++ b/packages/db/migrations/182-production-wo-executions-events.sql
@@ -0,0 +1,178 @@
+-- Migration 182: 08-Production — wo_executions + wo_events (append-only WO lifecycle).
+-- PRD: docs/prd/08-PRODUCTION-PRD.md §9.2 (execution state), §5.1#4 R14 (idempotency),
+--      E1 Execution Core (T-016..T-022), §16.4 (optimistic locking T-022).
+-- Tasks: _meta/atomic-tasks/08-production/tasks/T-022.json (optimistic locking on wo_executions),
+--        and the wo_events append-only lifecycle ledger feeding the wo_state_machine_v1 rule
+--        (T-012) — state is MATERIALIZED from wo_events, never written directly.
+--
+-- Wave0 lock: org_id (NOT tenant_id); RLS via app.current_org_id().
+-- site_id day-1: nullable, no FK, no registry (per-site backfill lands later via 14-MS T-030).
+-- NUMERIC-exact: no money/qty columns here (lifecycle metadata only).
+--
+-- DESIGN (MON-domain-production "WO lifecycle states"):
+--   wo_executions is the materialized per-WO runtime state row (one per work order):
+--     planned -> in_progress (start) -> paused (pause) -> in_progress (resume)
+--             -> completed (output gate green) -> closed (terminal, financial close).
+--     cancelled is a terminal branch from any non-closed state.
+--   The `status` column is the materialization target — it is NEVER written by a free-form
+--   UPDATE in app code; the state machine (Settings T-012 wo_state_machine_v1) appends a
+--   wo_events row and recomputes status. The DB enforces the legal value SET; transition
+--   legality is service-layer (the DSL rule). `version` is the optimistic-locking counter
+--   (T-022): every state mutation must CAS on the expected version.
+--   wo_events is APPEND-ONLY (grant withholds UPDATE/DELETE, mirrors wo_status_history /
+--   audit_events) — the immutable lifecycle ledger that status is folded from.
+-- FKs: wo_id HARD FK to public.work_orders (mig 176). actor user_id soft via users FK.
+
+-- ===========================================================================
+-- wo_executions — materialized runtime state (one row per WO) with optimistic lock.
+-- ===========================================================================
+create table if not exists public.wo_executions (
+  id              uuid primary key default gen_random_uuid(),
+  org_id          uuid not null references public.organizations(id) on delete cascade,
+  site_id         uuid,
+
+  wo_id           uuid not null references public.work_orders(id) on delete cascade,
+
+  -- Materialized lifecycle state — folded from wo_events by wo_state_machine_v1 (never a
+  -- free-form UPDATE in app code).
+  status          text not null default 'planned',
+
+  -- Optimistic-locking counter (T-022): CAS on expected value for every state mutation.
+  version         integer not null default 0,
+
+  started_at      timestamptz,
+  paused_at       timestamptz,
+  resumed_at      timestamptz,
+  completed_at    timestamptz,
+  closed_at       timestamptz,
+  cancelled_at    timestamptz,
+
+  ext_jsonb       jsonb not null default '{}'::jsonb,
+  schema_version  integer not null default 1,
+
+  -- R13 audit
+  created_by      uuid references public.users(id) on delete restrict,
+  updated_by      uuid references public.users(id) on delete restrict,
+  created_at      timestamptz not null default pg_catalog.now(),
+  updated_at      timestamptz not null default pg_catalog.now(),
+
+  -- Exactly one execution row per WO (idempotent materialization on wo.start).
+  constraint wo_executions_org_wo_unique unique (org_id, wo_id),
+  constraint wo_executions_status_check check (
+    status in ('planned', 'in_progress', 'paused', 'completed', 'closed', 'cancelled')
+  ),
+  constraint wo_executions_version_nonneg_check check (version >= 0),
+  constraint wo_executions_schema_version_check check (schema_version >= 1)
+);
+
+create index if not exists idx_wo_executions_org_wo
+  on public.wo_executions (org_id, wo_id);
+create index if not exists idx_wo_executions_wo
+  on public.wo_executions (wo_id);
+create index if not exists idx_wo_executions_org_status
+  on public.wo_executions (org_id, status);
+
+alter table public.wo_executions enable row level security;
+alter table public.wo_executions force row level security;
+
+drop policy if exists wo_executions_org_context on public.wo_executions;
+create policy wo_executions_org_context
+  on public.wo_executions
+  for all
+  to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+
+revoke all on public.wo_executions from public;
+revoke all on public.wo_executions from app_user;
+grant select, insert, update, delete on public.wo_executions to app_user;
+
+create or replace function public.wo_executions_set_updated_at()
+returns trigger
+language plpgsql
+as $$
+begin
+  new.updated_at := pg_catalog.now();
+  return new;
+end;
+$$;
+
+drop trigger if exists wo_executions_set_updated_at on public.wo_executions;
+create trigger wo_executions_set_updated_at
+  before update on public.wo_executions
+  for each row execute function public.wo_executions_set_updated_at();
+
+-- ===========================================================================
+-- wo_events — APPEND-ONLY lifecycle ledger. status on wo_executions is folded from these.
+--   event_type is the transition verb; from_status/to_status capture the materialized
+--   transition. R14: transaction_id UNIQUE makes event append idempotent under retry.
+--   Append-only is enforced at the grant layer: app_user gets SELECT + INSERT only
+--   (no UPDATE/DELETE), mirroring wo_status_history (mig 177) and audit_events (mig 004).
+-- ===========================================================================
+create table if not exists public.wo_events (
+  id              uuid primary key default gen_random_uuid(),
+  org_id          uuid not null references public.organizations(id) on delete cascade,
+  site_id         uuid,
+
+  -- Soft ref to work_orders.id: intentionally NO FK so the lifecycle ledger survives a
+  -- work_orders row removal (mirrors wo_status_history permanence, mig 177).
+  wo_id           uuid not null,
+  execution_id    uuid, -- soft ref to wo_executions.id (the row this event was folded into)
+
+  transaction_id  uuid not null, -- R14 idempotency key
+
+  event_type      text not null,
+  from_status     text,
+  to_status       text not null,
+
+  -- The version the producing CAS observed (optimistic-lock provenance for audit).
+  version_at_event integer,
+
+  reason          text,
+  context_jsonb   jsonb not null default '{}'::jsonb,
+
+  actor_user_id   uuid references public.users(id) on delete set null,
+
+  occurred_at     timestamptz not null default pg_catalog.now(),
+  created_at      timestamptz not null default pg_catalog.now(),
+
+  constraint wo_events_transaction_id_unique unique (transaction_id),
+  constraint wo_events_event_type_check check (
+    event_type in ('start', 'pause', 'resume', 'complete', 'close', 'cancel')
+  ),
+  constraint wo_events_to_status_check check (
+    to_status in ('planned', 'in_progress', 'paused', 'completed', 'closed', 'cancelled')
+  ),
+  constraint wo_events_from_status_check check (
+    from_status is null or from_status in
+      ('planned', 'in_progress', 'paused', 'completed', 'closed', 'cancelled')
+  )
+);
+
+create index if not exists idx_wo_events_org_wo_time
+  on public.wo_events (org_id, wo_id, occurred_at);
+create index if not exists idx_wo_events_wo
+  on public.wo_events (wo_id);
+create index if not exists idx_wo_events_execution
+  on public.wo_events (execution_id)
+  where execution_id is not null;
+create index if not exists idx_wo_events_actor
+  on public.wo_events (actor_user_id)
+  where actor_user_id is not null;
+
+alter table public.wo_events enable row level security;
+alter table public.wo_events force row level security;
+
+drop policy if exists wo_events_org_context on public.wo_events;
+create policy wo_events_org_context
+  on public.wo_events
+  for all
+  to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+
+revoke all on public.wo_events from public;
+revoke all on public.wo_events from app_user;
+-- Append-only from the app role: SELECT + INSERT, withhold UPDATE/DELETE so the lifecycle
+-- ledger is immutable (mirrors wo_status_history mig 177 + audit_events mig 004).
+grant select, insert on public.wo_events to app_user;
diff --git a/packages/db/migrations/183-production-waste-downtime.sql b/packages/db/migrations/183-production-waste-downtime.sql
new file mode 100644
index 00000000..d342ee4a
--- /dev/null
+++ b/packages/db/migrations/183-production-waste-downtime.sql
@@ -0,0 +1,200 @@
+-- Migration 183: 08-Production — wo_waste_log + downtime_events (+ downtime_source_enum) + the
+-- 02-Settings category shell tables they FK into.
+-- PRD: docs/prd/08-PRODUCTION-PRD.md §9.5, §9.6, §16.4 V-PROD-05/06/19/22, §5.5.
+-- Tasks: _meta/atomic-tasks/08-production/tasks/T-004.json (wo_waste_log),
+--        _meta/atomic-tasks/08-production/tasks/T-005.json (downtime_events).
+--
+-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id().
+--   The PRD prose still says "tenant_id" — legacy; the Wave0 v4.3 column lock binds the
+--   physical column to org_id (_meta/audits/2026-05-14-tenant-context-remediation.md).
+-- site_id day-1: site_id uuid nullable, no FK, no registry — the full per-site scoping lands
+--   later via the cross-module multi-site backfill. The column exists so rows can be tagged.
+-- NUMERIC-exact: qty_kg NUMERIC(12,3) (never float).
+-- Retention: wo_waste_log is a 3-year-retention operational log (§5.5) — enforced by the
+--   cross-module retention sweeper, noted here for provenance.
+--
+-- Category FK targets: waste_categories / downtime_categories are 02-Settings reference tables
+--   (§8 reference data). 02-Settings has not yet shipped them in the migration chain, so this
+--   migration creates the org-scoped SHELL tables (create table if not exists — no seed; the
+--   Apex category seed remains 02-Settings' responsibility) purely so the production FKs in
+--   V-PROD-05 can exist. They are idempotent and additive; 02-Settings can later extend them.
+
+-- ===========================================================================
+-- 02-Settings reference shells: waste_categories + downtime_categories.
+-- Minimal org-scoped lookup shape (id, org_id, code, name, is_active). RLS-forced.
+-- ===========================================================================
+create table if not exists public.waste_categories (
+  id        uuid primary key default gen_random_uuid(),
+  org_id    uuid not null references public.organizations(id) on delete cascade,
+  site_id   uuid,
+  code      text not null,
+  name      text not null,
+  is_active boolean not null default true,
+  ext_jsonb jsonb not null default '{}'::jsonb,
+  created_at timestamptz not null default pg_catalog.now(),
+  updated_at timestamptz not null default pg_catalog.now(),
+  constraint waste_categories_org_code_unique unique (org_id, code)
+);
+
+create index if not exists idx_waste_categories_org on public.waste_categories (org_id);
+
+alter table public.waste_categories enable row level security;
+alter table public.waste_categories force row level security;
+drop policy if exists waste_categories_org_context on public.waste_categories;
+create policy waste_categories_org_context
+  on public.waste_categories
+  for all
+  to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+revoke all on public.waste_categories from public;
+revoke all on public.waste_categories from app_user;
+grant select, insert, update, delete on public.waste_categories to app_user;
+
+create table if not exists public.downtime_categories (
+  id        uuid primary key default gen_random_uuid(),
+  org_id    uuid not null references public.organizations(id) on delete cascade,
+  site_id   uuid,
+  code      text not null,
+  name      text not null,
+  kind      text not null default 'unplanned',
+  is_active boolean not null default true,
+  ext_jsonb jsonb not null default '{}'::jsonb,
+  created_at timestamptz not null default pg_catalog.now(),
+  updated_at timestamptz not null default pg_catalog.now(),
+  constraint downtime_categories_org_code_unique unique (org_id, code),
+  constraint downtime_categories_kind_check check (
+    kind in ('planned', 'unplanned', 'changeover')
+  )
+);
+
+create index if not exists idx_downtime_categories_org on public.downtime_categories (org_id);
+
+alter table public.downtime_categories enable row level security;
+alter table public.downtime_categories force row level security;
+drop policy if exists downtime_categories_org_context on public.downtime_categories;
+create policy downtime_categories_org_context
+  on public.downtime_categories
+  for all
+  to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+revoke all on public.downtime_categories from public;
+revoke all on public.downtime_categories from app_user;
+grant select, insert, update, delete on public.downtime_categories to app_user;
+
+-- ===========================================================================
+-- wo_waste_log (T-004, §9.5) — categorized waste capture.
+-- ===========================================================================
+create table if not exists public.wo_waste_log (
+  id              uuid primary key default gen_random_uuid(),
+  transaction_id  uuid not null,                                       -- R14 idempotency key
+  org_id          uuid not null references public.organizations(id) on delete cascade,
+  site_id         uuid,                                                -- site_id day-1
+  wo_id           uuid not null references public.work_orders(id) on delete cascade,
+  category_id     uuid not null references public.waste_categories(id) on delete restrict, -- V-PROD-05
+  qty_kg          numeric(12, 3) not null,
+  reason_code     text,
+  reason_notes    text,
+  operator_id     uuid references public.users(id) on delete restrict,
+  shift_id        text not null,                                       -- V-PROD-19
+  approved_by     uuid references public.users(id) on delete restrict,
+  scan_event_id   uuid,                                                -- soft ref to 06-scanner
+  recorded_at     timestamptz not null default pg_catalog.now(),
+  created_at      timestamptz not null default pg_catalog.now(),
+  updated_at      timestamptz not null default pg_catalog.now(),
+
+  constraint wo_waste_log_transaction_id_unique unique (transaction_id),
+  constraint wo_waste_log_qty_kg_positive_check check (qty_kg > 0)     -- V-PROD-05 red-line
+);
+
+create index if not exists idx_waste_wo on public.wo_waste_log (wo_id);
+create index if not exists idx_waste_category_time on public.wo_waste_log (category_id, recorded_at);
+create index if not exists idx_waste_tenant_time on public.wo_waste_log (org_id, recorded_at);
+
+alter table public.wo_waste_log enable row level security;
+alter table public.wo_waste_log force row level security;
+drop policy if exists wo_waste_log_org_context on public.wo_waste_log;
+create policy wo_waste_log_org_context
+  on public.wo_waste_log
+  for all
+  to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+revoke all on public.wo_waste_log from public;
+revoke all on public.wo_waste_log from app_user;
+grant select, insert, update, delete on public.wo_waste_log to app_user;
+
+create or replace function public.production_set_updated_at()
+returns trigger
+language plpgsql
+as $$
+begin
+  new.updated_at := pg_catalog.now();
+  return new;
+end;
+$$;
+
+drop trigger if exists wo_waste_log_set_updated_at on public.wo_waste_log;
+create trigger wo_waste_log_set_updated_at
+  before update on public.wo_waste_log
+  for each row execute function public.production_set_updated_at();
+
+-- ===========================================================================
+-- downtime_source_enum + downtime_events (T-005, §9.6).
+-- ===========================================================================
+do $$
+begin
+  if not exists (select 1 from pg_type where typname = 'downtime_source_enum') then
+    create type public.downtime_source_enum as enum ('manual', 'wo_pause', 'plc_auto', 'changeover');
+  end if;
+end
+$$;
+
+create table if not exists public.downtime_events (
+  id            uuid primary key default gen_random_uuid(),
+  org_id        uuid not null references public.organizations(id) on delete cascade,
+  site_id       uuid,                                                  -- site_id day-1
+  line_id       text not null,
+  wo_id         uuid references public.work_orders(id) on delete set null, -- nullable; V-PROD-22 at API
+  category_id   uuid not null references public.downtime_categories(id) on delete restrict,
+  source        public.downtime_source_enum not null,
+
+  started_at    timestamptz not null,
+  ended_at      timestamptz,
+  -- V-PROD-06: GENERATED minute-difference, STORED, NULL while open. Never user-settable.
+  duration_min  integer generated always as (
+    case
+      when ended_at is not null then (extract(epoch from ended_at - started_at) / 60)::integer
+    end
+  ) stored,
+
+  shift_id      text,
+  operator_id   uuid references public.users(id) on delete set null,
+  reason_notes  text,
+  plc_fault_code text,
+  mwo_id        uuid,                                                  -- soft ref to 13-maintenance
+  recorded_by   uuid references public.users(id) on delete set null,
+  recorded_at   timestamptz not null default pg_catalog.now(),
+  ext_jsonb     jsonb not null default '{}'::jsonb
+);
+
+create index if not exists idx_downtime_line_time on public.downtime_events (line_id, started_at);
+create index if not exists idx_downtime_category on public.downtime_events (category_id);
+create index if not exists idx_downtime_wo on public.downtime_events (wo_id) where wo_id is not null;
+create index if not exists idx_downtime_mwo on public.downtime_events (mwo_id) where mwo_id is not null;
+-- Partial open-event index (V-PROD-06 lookups of currently-open downtime).
+create index if not exists idx_downtime_open on public.downtime_events (org_id, line_id) where ended_at is null;
+
+alter table public.downtime_events enable row level security;
+alter table public.downtime_events force row level security;
+drop policy if exists downtime_events_org_context on public.downtime_events;
+create policy downtime_events_org_context
+  on public.downtime_events
+  for all
+  to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+revoke all on public.downtime_events from public;
+revoke all on public.downtime_events from app_user;
+grant select, insert, update, delete on public.downtime_events to app_user;
diff --git a/packages/db/migrations/184-production-changeover-allergen-oee.sql b/packages/db/migrations/184-production-changeover-allergen-oee.sql
new file mode 100644
index 00000000..9f3d7c34
--- /dev/null
+++ b/packages/db/migrations/184-production-changeover-allergen-oee.sql
@@ -0,0 +1,193 @@
+-- Migration 184: 08-Production — changeover_events + allergen_changeover_validations
+-- (+ 7y-retention trigger) + oee_snapshots.
+-- PRD: docs/prd/08-PRODUCTION-PRD.md §9.7, §9.8, §9.9, §5.3 (BRCGS), §16.4 V-PROD-08/09/10/23/25, §5.5.
+-- Tasks: T-006 (changeover_events), T-007 (allergen_changeover_validations), T-008 (oee_snapshots).
+--
+-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
+-- site_id day-1: nullable site_id uuid (no FK / registry yet).
+-- NUMERIC-exact: all qty/pct columns NUMERIC (never float).
+-- D-OEE-1: 08-production is the SOLE PRODUCER of oee_snapshots; 15-OEE is read-only.
+
+-- ===========================================================================
+-- changeover_events (T-006, §9.7) — allergen/product changeover window.
+-- ===========================================================================
+create table if not exists public.changeover_events (
+  id                   uuid primary key default gen_random_uuid(),
+  org_id               uuid not null references public.organizations(id) on delete cascade,
+  site_id              uuid,                                            -- site_id day-1
+  line_id              text not null,
+  wo_from_id           uuid references public.work_orders(id) on delete set null,
+  wo_to_id             uuid references public.work_orders(id) on delete set null,
+
+  allergen_from        text[],
+  allergen_to          text[],
+  risk_level           text not null,
+
+  started_at           timestamptz not null,
+  completed_at         timestamptz,
+  planned_duration_min integer,
+  actual_duration_min  integer,
+
+  cleaning_completed   boolean not null default false,
+  cleaning_checklist   jsonb,
+  atp_required         boolean not null default false,
+  atp_result           jsonb,
+
+  dual_sign_off_status text not null default 'pending',
+  first_signer         uuid references public.users(id) on delete set null,
+  first_signed_at      timestamptz,
+  second_signer        uuid references public.users(id) on delete set null,
+  second_signed_at     timestamptz,
+
+  ext_jsonb            jsonb not null default '{}'::jsonb,             -- D9 L3 extension
+
+  created_at           timestamptz not null default pg_catalog.now(),
+  updated_at           timestamptz not null default pg_catalog.now(),
+
+  constraint changeover_events_risk_level_check check (
+    risk_level in ('low', 'medium', 'high', 'segregated')
+  ),
+  -- V-PROD-23: started_at must precede completed_at when the changeover is finished.
+  constraint chk_changeover_time check (completed_at is null or started_at < completed_at)
+);
+
+create index if not exists idx_changeover_line_time on public.changeover_events (line_id, started_at);
+create index if not exists idx_changeover_wo_from on public.changeover_events (wo_from_id) where wo_from_id is not null;
+create index if not exists idx_changeover_wo_to on public.changeover_events (wo_to_id) where wo_to_id is not null;
+
+alter table public.changeover_events enable row level security;
+alter table public.changeover_events force row level security;
+drop policy if exists changeover_events_org_context on public.changeover_events;
+create policy changeover_events_org_context
+  on public.changeover_events
+  for all
+  to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+revoke all on public.changeover_events from public;
+revoke all on public.changeover_events from app_user;
+grant select, insert, update, delete on public.changeover_events to app_user;
+
+drop trigger if exists changeover_events_set_updated_at on public.changeover_events;
+create trigger changeover_events_set_updated_at
+  before update on public.changeover_events
+  for each row execute function public.production_set_updated_at();
+
+-- ===========================================================================
+-- allergen_changeover_validations (T-007, §9.8) — BRCGS Issue 10 evidence record.
+--   V-PROD-09: retention_until = validated_at + 7y (trigger, override below 7y forbidden).
+--   V-PROD-08: signatures length >= 2 for risk in (medium, high, segregated) (CHECK).
+-- ===========================================================================
+create table if not exists public.allergen_changeover_validations (
+  id                  uuid primary key default gen_random_uuid(),
+  org_id              uuid not null references public.organizations(id) on delete cascade,
+  site_id             uuid,                                            -- site_id day-1
+  changeover_event_id uuid not null references public.changeover_events(id) on delete cascade,
+
+  validation_result   text not null,
+  risk_level          text not null,
+
+  cleaning_evidence   jsonb not null,
+  atp_evidence        jsonb,
+  signatures          jsonb not null,
+
+  override_by         uuid references public.users(id) on delete set null,
+  override_reason     text,
+
+  validated_at        timestamptz not null default pg_catalog.now(),
+  retention_until     date not null,
+
+  -- V-PROD-08: dual signature required for risk >= medium.
+  constraint chk_allergen_signatures check (
+    jsonb_array_length(signatures) >= 2 or risk_level not in ('medium', 'high', 'segregated')
+  )
+);
+
+create index if not exists idx_allergen_val_changeover on public.allergen_changeover_validations (changeover_event_id);
+create index if not exists idx_allergen_val_retention on public.allergen_changeover_validations (retention_until);
+
+-- V-PROD-09 trigger: stamp retention_until = validated_at + 7y, never allowing a shorter
+-- retention than BRCGS Issue 10 §5.3#1 requires. If a caller supplies an earlier date it is
+-- clamped UP to validated_at + 7y; a later date (longer retention) is left untouched.
+create or replace function public.fn_set_allergen_retention_until()
+returns trigger
+language plpgsql
+as $$
+declare
+  v_min_retention date := (new.validated_at + interval '7 years')::date;
+begin
+  if new.retention_until is null or new.retention_until < v_min_retention then
+    new.retention_until := v_min_retention;
+  end if;
+  return new;
+end;
+$$;
+
+drop trigger if exists trg_set_allergen_retention_until on public.allergen_changeover_validations;
+create trigger trg_set_allergen_retention_until
+  before insert or update on public.allergen_changeover_validations
+  for each row execute function public.fn_set_allergen_retention_until();
+
+alter table public.allergen_changeover_validations enable row level security;
+alter table public.allergen_changeover_validations force row level security;
+drop policy if exists allergen_changeover_validations_org_context on public.allergen_changeover_validations;
+create policy allergen_changeover_validations_org_context
+  on public.allergen_changeover_validations
+  for all
+  to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+revoke all on public.allergen_changeover_validations from public;
+revoke all on public.allergen_changeover_validations from app_user;
+grant select, insert, update, delete on public.allergen_changeover_validations to app_user;
+
+-- ===========================================================================
+-- oee_snapshots (T-008, §9.9) — per-minute OEE producer (D-OEE-1: 08 is sole writer).
+--   V-PROD-10: UNIQUE (org_id, line_id, shift_id, snapshot_minute).
+--   V-PROD-25: A/P/Q each CHECK BETWEEN 0 AND 100.
+--   oee_pct GENERATED ALWAYS AS (A*P*Q/10000) STORED — never user-settable.
+--   90-day retention (§5.5) — enforced by the cross-module sweeper; noted for provenance.
+-- ===========================================================================
+create table if not exists public.oee_snapshots (
+  id                  bigserial primary key,
+  org_id              uuid not null references public.organizations(id) on delete cascade,
+  site_id             uuid,                                            -- site_id day-1
+  line_id             text not null,
+  shift_id            text not null,
+  snapshot_minute     timestamptz not null,
+
+  availability_pct    numeric(5, 2) not null,
+  performance_pct     numeric(5, 2) not null,
+  quality_pct         numeric(5, 2) not null,
+  oee_pct             numeric(5, 2) generated always as (
+    availability_pct * performance_pct * quality_pct / 10000
+  ) stored,
+
+  active_wo_id        uuid,                                            -- soft ref (snapshot fact)
+  output_qty_delta    numeric(12, 3),
+  downtime_min_delta  integer,
+  waste_qty_delta     numeric(12, 3),
+  ideal_cycle_time_sec numeric(8, 2),
+
+  created_at          timestamptz not null default pg_catalog.now(),
+
+  constraint oee_snapshots_line_shift_minute_unique unique (org_id, line_id, shift_id, snapshot_minute),
+  constraint oee_snapshots_availability_pct_range_check check (availability_pct between 0 and 100),
+  constraint oee_snapshots_performance_pct_range_check check (performance_pct between 0 and 100),
+  constraint oee_snapshots_quality_pct_range_check check (quality_pct between 0 and 100)
+);
+
+create index if not exists idx_oee_line_time on public.oee_snapshots (line_id, snapshot_minute desc);
+
+alter table public.oee_snapshots enable row level security;
+alter table public.oee_snapshots force row level security;
+drop policy if exists oee_snapshots_org_context on public.oee_snapshots;
+create policy oee_snapshots_org_context
+  on public.oee_snapshots
+  for all
+  to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+revoke all on public.oee_snapshots from public;
+revoke all on public.oee_snapshots from app_user;
+grant select, insert, update, delete on public.oee_snapshots to app_user;
diff --git a/packages/db/migrations/185-production-outbox-and-rbac-seed.sql b/packages/db/migrations/185-production-outbox-and-rbac-seed.sql
new file mode 100644
index 00000000..00707562
--- /dev/null
+++ b/packages/db/migrations/185-production-outbox-and-rbac-seed.sql
@@ -0,0 +1,326 @@
+-- Migration 185: 08-Production — (A) admit the production.* / wo.* outbox events to the
+-- outbox_events CHECK constraint (keep the enum↔CHECK drift gate green), and (B) grant the
+-- production.* RBAC permission family to the org-admin role family + production operator/
+-- supervisor roles in BOTH the normalized role_permissions table and the legacy roles.permissions
+-- jsonb cache, with an AFTER INSERT trigger + full backfill.
+-- PRD: docs/prd/08-PRODUCTION-PRD.md §3.2 (RBAC), §6/§12/§13 (events).
+-- Tasks: T-056 (permission enum) + the recurring-live-bug RBAC-seed P0 (class 1).
+-- Canonical permission strings: packages/rbac/src/permissions.enum.ts (ALL_PRODUCTION_PERMISSIONS).
+-- Canonical event strings: packages/outbox/src/events.enum.ts (ALL_PRODUCTION_EVENTS).
+-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
+
+-- ===========================================================================
+-- (A) Outbox event CHECK — drop + recreate with the full vocabulary (152 list + 11 new
+--     08-production events). The enum↔CHECK drift gate (packages/outbox check-drift.test.ts)
+--     asserts THIS migration's CHECK string set === DB_EVENT_TYPES, so the list below MUST
+--     stay byte-aligned with events.enum.ts (EventType ∪ LegacyEventAlias keys).
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
+      'wo.ready'
+    )
+  );
+
+-- ===========================================================================
+-- (B) production.* RBAC permission seed.
+--   ROOT CAUSE (X-1 unreachable-feature / 403-everywhere class — same as 116/146/148/149/154):
+--   adding the production.* strings to the enum (T-056) grants NOBODY access. The deployed
+--   org administrator is on the canonical org-admin role family, which receives NONE of the
+--   production.* strings — so every production page/action 403s at live Gate-5.
+--
+--   This grants:
+--     * the COMPLETE production.* set (17 strings) to the org-admin role family;
+--     * the operator-facing subset to a production operator role family;
+--     * the supervisor/approver subset to a production supervisor role family;
+--   in BOTH role_permissions (normalized) and roles.permissions (legacy jsonb cache), for every
+--   existing org, with an AFTER INSERT trigger so new orgs inherit it.
+--   Operator/supervisor role codes are matched defensively across naming conventions; the grant
+--   is a no-op for any role code not present in an org (idempotent). The admin-family grant is
+--   the load-bearing one for Gate-5 reachability. Models on 149/154.
+-- ===========================================================================
+create or replace function public.seed_production_permissions_for_org(p_org_id uuid)
+returns void
+language plpgsql
+security definer
+set search_path = pg_catalog
+as $$
+declare
+  -- Complete production.* family (PRD §3.2 RBAC matrix). Mirrors ALL_PRODUCTION_PERMISSIONS.
+  v_all_perms text[] := array[
+    'production.wo.start',
+    'production.wo.pause',
+    'production.wo.resume',
+    'production.wo.complete',
+    'production.consumption.write',
+    'production.consumption.override_approve',
+    'production.output.write',
+    'production.output.catch_weight_override',
+    'production.waste.write',
+    'production.waste.overthreshold_approve',
+    'production.downtime.write',
+    'production.downtime.taxonomy_edit',
+    'production.changeover.write',
+    'production.allergen_gate.sign_first',
+    'production.allergen_gate.sign_second',
+    'production.d365_dlq.replay',
+    'production.oee.read'
+  ];
+  -- Operator-facing subset: the line operator runs WOs, consumes, records output/waste/downtime,
+  -- performs changeovers, signs first on the allergen gate, and reads OEE. NOT the approver
+  -- (override/overthreshold/catch-weight/taxonomy/dlq-replay/second-sign — SoD).
+  v_operator_perms text[] := array[
+    'production.wo.start',
+    'production.wo.pause',
+    'production.wo.resume',
+    'production.wo.complete',
+    'production.consumption.write',
+    'production.output.write',
+    'production.waste.write',
+    'production.downtime.write',
+    'production.changeover.write',
+    'production.allergen_gate.sign_first',
+    'production.oee.read'
+  ];
+  -- Supervisor subset: the approver. The full operator set PLUS the approval/override/second-sign
+  -- + taxonomy + d365 dlq replay strings. (SoD: sign_first vs sign_second are distinct grants.)
+  v_supervisor_perms text[] := v_all_perms;
+  -- org-admin role family across naming conventions used in this codebase.
+  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin'];
+  -- production operator role family (defensive — codes vary; grant is a no-op if absent).
+  v_operator_roles text[] := array['operator','production_operator','line_operator','warehouse_operator'];
+  -- production supervisor role family (defensive).
+  v_supervisor_roles text[] := array['supervisor','production_supervisor','shift_supervisor','production_lead'];
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
+  -- operator family: operator subset.
+  insert into public.role_permissions (role_id, permission)
+  select r.id, p.permission
+  from public.roles r
+  cross join unnest(v_operator_perms) as p(permission)
+  where r.org_id = p_org_id
+    and (r.code = any(v_operator_roles) or r.slug = any(v_operator_roles))
+  on conflict (role_id, permission) do nothing;
+
+  -- supervisor family: supervisor subset (= full set).
+  insert into public.role_permissions (role_id, permission)
+  select r.id, p.permission
+  from public.roles r
+  cross join unnest(v_supervisor_perms) as p(permission)
+  where r.org_id = p_org_id
+    and (r.code = any(v_supervisor_roles) or r.slug = any(v_supervisor_roles))
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
+           select unnest(v_supervisor_perms)
+         ) merged
+       ),
+       '[]'::jsonb
+     )
+   where r.org_id = p_org_id
+     and (r.code = any(v_supervisor_roles) or r.slug = any(v_supervisor_roles));
+end;
+$$;
+
+revoke all on function public.seed_production_permissions_for_org(uuid) from public;
+revoke all on function public.seed_production_permissions_for_org(uuid) from app_user;
+
+create or replace function public.seed_production_permissions_on_org_insert()
+returns trigger
+language plpgsql
+security definer
+set search_path = pg_catalog
+as $$
+begin
+  perform public.seed_production_permissions_for_org(new.id);
+  return new;
+end;
+$$;
+
+revoke all on function public.seed_production_permissions_on_org_insert() from public;
+revoke all on function public.seed_production_permissions_on_org_insert() from app_user;
+
+-- Fire after the 080 role-seeding trigger so the admin roles already exist (zzz prefix).
+drop trigger if exists trg_zzz_seed_production_permissions on public.organizations;
+create trigger trg_zzz_seed_production_permissions
+  after insert on public.organizations
+  for each row
+  execute function public.seed_production_permissions_on_org_insert();
+
+-- Backfill every existing org.
+do $$
+declare
+  v_org_id uuid;
+begin
+  for v_org_id in select id from public.organizations loop
+    perform public.seed_production_permissions_for_org(v_org_id);
+  end loop;
+end
+$$;
diff --git a/packages/db/migrations/187-atp-swab-autofail-trigger.sql b/packages/db/migrations/187-atp-swab-autofail-trigger.sql
new file mode 100644
index 00000000..cf4d61f6
--- /dev/null
+++ b/packages/db/migrations/187-atp-swab-autofail-trigger.sql
@@ -0,0 +1,169 @@
+-- Migration 187: 03-Technical T-026 — ATP swab auto-fail trigger (V-TEC-44) + outbox emit.
+-- PRD: docs/prd/03-TECHNICAL-PRD.md §10.6, §10.8 ; task _meta/atomic-tasks/03-technical/tasks/T-026.json
+--
+-- Wave0 lock: org_id is the business scope (the org, not a license/billing tier);
+--             RLS via app.current_org_id().
+--
+-- CANONICAL-OWNER NOTE (do NOT cross): public.lab_results is QUALITY-OWNED
+-- (migration 162). This trigger is a DB-LEVEL auto-fail guard that lives in the
+-- 03-Technical migration set per the T-026 scope, but it does NOT introduce a
+-- Technical write/approve path — it only enforces the ATP cleaning-validation
+-- threshold at INSERT/UPDATE time and emits an outbox event. The 08-PRODUCTION
+-- WO-close gate is the DOWNSTREAM CONSUMER of that event; this migration only
+-- EMITS (red-line: "Do not consume the event here").
+--
+-- What it does (V-TEC-44):
+--   When a lab_results row with test_type='atp_swab' has a result_value that
+--   exceeds the org's ATP RLU threshold, the row's result_status is forced to
+--   'fail' (BEFORE INSERT/UPDATE) and a 'quality.atp_swab_failed' outbox event
+--   is emitted (AFTER INSERT/UPDATE) with payload
+--     { item_id, work_order_id, test_code, result_value, threshold_rlu }.
+--
+-- Threshold resolution (precedence):
+--   1. the row's own threshold_rlu column when provided (per-row override), else
+--   2. the org's "Reference"."AlertThresholds" row_key='atp_swab_rlu_max'
+--      (value_int; default 10 seeded by migration 167), else
+--   3. the hard fallback 10 RLU (matches the column DEFAULT in migration 162).
+--
+-- The event_type 'quality.atp_swab_failed' is registered in the AUTHORITATIVE
+-- enum (packages/outbox/src/events.enum.ts) and the DB CHECK is regenerated from
+-- it in migration 189 (drift gate stays green). `quality.*` is the registered
+-- aggregate prefix for swab events per _meta/specs/event-naming-convention.md.
+--
+-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS + recreate.
+-- d365 is never the system of record; no D365 hard FK is introduced.
+
+-- ============================================================================
+-- 1. Threshold resolver — STABLE, runs as the inserting role so the
+--    AlertThresholds RLS SELECT is org-scoped by the active app.current_org_id().
+-- ============================================================================
+create or replace function public.atp_swab_threshold_rlu(p_org_id uuid, p_row_threshold numeric)
+returns numeric
+language plpgsql
+stable
+as $$
+declare
+  v_threshold numeric;
+begin
+  -- 1. per-row override wins.
+  if p_row_threshold is not null then
+    return p_row_threshold;
+  end if;
+
+  -- 2. org-level configured threshold from Reference.AlertThresholds.
+  select at.value_int
+    into v_threshold
+    from "Reference"."AlertThresholds" at
+   where at.org_id = p_org_id
+     and at.threshold_key = 'atp_swab_rlu_max';
+
+  if v_threshold is not null then
+    return v_threshold;
+  end if;
+
+  -- 3. hard fallback (matches lab_results.threshold_rlu default in migration 162).
+  return 10::numeric;
+end;
+$$;
+
+revoke all on function public.atp_swab_threshold_rlu(uuid, numeric) from public;
+grant execute on function public.atp_swab_threshold_rlu(uuid, numeric) to app_user;
+
+-- ============================================================================
+-- 2. BEFORE trigger — auto-fail status when ATP swab result exceeds threshold.
+--    Only touches test_type='atp_swab' rows; everything else passes through
+--    unmodified (red-line: allergen_elisa/pass must NOT be rewritten).
+-- ============================================================================
+create or replace function public.lab_results_atp_autofail()
+returns trigger
+language plpgsql
+as $$
+declare
+  v_threshold numeric;
+begin
+  if new.test_type <> 'atp_swab' then
+    return new;
+  end if;
+
+  -- No measured value → cannot auto-fail; leave caller-provided status intact.
+  if new.result_value is null then
+    return new;
+  end if;
+
+  v_threshold := public.atp_swab_threshold_rlu(new.org_id, new.threshold_rlu);
+
+  -- Persist the resolved threshold so downstream consumers + the AFTER trigger
+  -- payload see the value the decision was made against.
+  new.threshold_rlu := v_threshold;
+
+  -- Over threshold (strictly greater than; ≤ threshold passes per §10.6) → fail.
+  if new.result_value > v_threshold then
+    new.result_status := 'fail';
+  end if;
+
+  return new;
+end;
+$$;
+
+drop trigger if exists lab_results_atp_autofail on public.lab_results;
+create trigger lab_results_atp_autofail
+  before insert or update on public.lab_results
+  for each row execute function public.lab_results_atp_autofail();
+
+-- ============================================================================
+-- 3. AFTER trigger — emit 'quality.atp_swab_failed' outbox event on auto-fail.
+--    Runs in the SAME transaction as the lab_results write (transactional
+--    outbox). org_id is taken from the row; the outbox RLS INSERT policy checks
+--    org_id = app.current_org_id(), which is the active org context.
+-- ============================================================================
+create or replace function public.lab_results_atp_emit_fail()
+returns trigger
+language plpgsql
+as $$
+begin
+  if new.test_type <> 'atp_swab' then
+    return new;
+  end if;
+
+  if new.result_status is distinct from 'fail' then
+    return new;
+  end if;
+
+  -- On UPDATE, only emit when the row TRANSITIONS into fail (avoid duplicate
+  -- events when an already-failed row is touched for unrelated reasons).
+  if tg_op = 'UPDATE' and old.result_status is not distinct from 'fail' then
+    return new;
+  end if;
+
+  insert into public.outbox_events
+    (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
+  values (
+    new.org_id,
+    'quality.atp_swab_failed',
+    'lab_result',
+    new.id::text,
+    jsonb_build_object(
+      'item_id', new.item_id,
+      'work_order_id', new.work_order_id,
+      'test_code', new.test_code,
+      'result_value', new.result_value,
+      'threshold_rlu', new.threshold_rlu
+    ),
+    'technical-atp-autofail-v1'
+  );
+
+  return new;
+end;
+$$;
+
+drop trigger if exists lab_results_atp_emit_fail on public.lab_results;
+create trigger lab_results_atp_emit_fail
+  after insert or update on public.lab_results
+  for each row execute function public.lab_results_atp_emit_fail();
+
+comment on function public.lab_results_atp_autofail() is
+  'T-026 / V-TEC-44: forces result_status=fail when an ATP swab result_value exceeds '
+  'the org ATP RLU threshold (per-row override -> Reference.AlertThresholds atp_swab_rlu_max -> 10).';
+comment on function public.lab_results_atp_emit_fail() is
+  'T-026: emits quality.atp_swab_failed outbox event when an ATP swab row transitions to fail. '
+  'EMIT-ONLY -- the 08-PRODUCTION WO-close gate is the downstream consumer.';
diff --git a/packages/db/migrations/188-catch-weight-variance-daily.sql b/packages/db/migrations/188-catch-weight-variance-daily.sql
new file mode 100644
index 00000000..aab6f559
--- /dev/null
+++ b/packages/db/migrations/188-catch-weight-variance-daily.sql
@@ -0,0 +1,155 @@
+-- Migration 188: 03-Technical T-031 — catch-weight variance nightly results table
+--                + soft work_order_items weighing source.
+-- PRD: docs/prd/03-TECHNICAL-PRD.md §8.1, §8.5, §8.6 ; task _meta/atomic-tasks/03-technical/tasks/T-031.json
+--
+-- Wave0 lock: org_id is the business scope; RLS via app.current_org_id().
+-- site_id day-1: nullable uuid, NO FK / NO registry (registry is added later by 14-multi-site).
+--
+-- CANONICAL-OWNER NOTE (do NOT cross): the per-unit weight-capture table
+-- public.work_order_items (actual_weight) is 08-PRODUCTION canonical (PRD §8.3
+-- line 763). It does not exist yet. T-031 is READ-ONLY against it. We create a
+-- MINIMAL `create table if not exists` shell here purely as the variance job's
+-- read source so the nightly cron is runnable on a real DB; when 08-PRODUCTION
+-- ships its canonical version, the `if not exists` makes this a no-op and the
+-- canonical columns win. This migration NEVER writes work_order_items rows.
+--
+-- The results table public.catch_weight_variance_daily IS Technical-owned: it
+-- records the nightly per-(org,item,day) variance roll-up + sample stats. An
+-- alert outbox event 'catch_weight.variance_exceeded' is emitted by the job
+-- (lib + cron route) when avg variance exceeds the org's catch_weight_variance_pct
+-- threshold (Reference.AlertThresholds, default 5% seeded by migration 167).
+--
+-- Idempotent: create table if not exists + drop policy if exists + recreate.
+
+-- ============================================================================
+-- 1. work_order_items — SOFT read source (08-PRODUCTION canonical owner).
+--    Minimal shell: enough columns for the variance computation. `if not exists`
+--    so the canonical 08-PRODUCTION migration supersedes this without conflict.
+-- ============================================================================
+create table if not exists public.work_order_items (
+  id            uuid primary key default gen_random_uuid(),
+  org_id        uuid not null references public.organizations(id) on delete cascade,
+  site_id       uuid,                                   -- day-1 nullable, no FK / no registry
+  work_order_id uuid,                                   -- soft uuid; canonical FK lives in 08-PRODUCTION
+  item_id       uuid references public.items(id) on delete restrict,
+  nominal_weight numeric(10, 4),                        -- label target (mirrors items.nominal_weight)
+  actual_weight numeric(10, 4),                         -- per-unit scale capture (PRD §8.3)
+  captured_at   timestamptz not null default pg_catalog.now(),
+  created_at    timestamptz not null default pg_catalog.now()
+);
+
+create index if not exists idx_work_order_items_org_item_captured
+  on public.work_order_items (org_id, item_id, captured_at);
+create index if not exists idx_work_order_items_org_wo
+  on public.work_order_items (org_id, work_order_id)
+  where work_order_id is not null;
+
+alter table public.work_order_items enable row level security;
+alter table public.work_order_items force row level security;
+
+drop policy if exists work_order_items_org_context_select on public.work_order_items;
+create policy work_order_items_org_context_select
+  on public.work_order_items
+  for select
+  to app_user
+  using (org_id = app.current_org_id());
+
+drop policy if exists work_order_items_org_context_insert on public.work_order_items;
+create policy work_order_items_org_context_insert
+  on public.work_order_items
+  for insert
+  to app_user
+  with check (org_id = app.current_org_id());
+
+drop policy if exists work_order_items_org_context_update on public.work_order_items;
+create policy work_order_items_org_context_update
+  on public.work_order_items
+  for update
+  to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+
+drop policy if exists work_order_items_org_context_delete on public.work_order_items;
+create policy work_order_items_org_context_delete
+  on public.work_order_items
+  for delete
+  to app_user
+  using (org_id = app.current_org_id());
+
+revoke all on public.work_order_items from public;
+grant select, insert, update, delete on public.work_order_items to app_user;
+
+comment on table public.work_order_items is
+  'SOFT read source for T-031 catch-weight variance. 08-PRODUCTION is the canonical '
+  'owner of per-unit weight capture (actual_weight, PRD §8.3); this minimal shell exists '
+  'only so the variance nightly job is runnable. created via IF NOT EXISTS — superseded by '
+  'the 08-PRODUCTION canonical migration when it ships.';
+
+-- ============================================================================
+-- 2. catch_weight_variance_daily — Technical-owned nightly roll-up results.
+-- ============================================================================
+create table if not exists public.catch_weight_variance_daily (
+  id              uuid primary key default gen_random_uuid(),
+  org_id          uuid not null references public.organizations(id) on delete cascade,
+  site_id         uuid,                                 -- day-1 nullable, no FK / no registry
+  item_id         uuid not null references public.items(id) on delete restrict,
+  day             date not null,
+  avg_variance_pct numeric(7, 4) not null,              -- percent (0.0000-100.0000)
+  stddev          numeric(10, 4),                       -- stddev of per-unit variance%
+  samples         integer not null,
+  threshold_pct   numeric(7, 4),                        -- the org threshold this row was scored against
+  alerted         boolean not null default false,       -- did this roll-up breach the threshold
+  computed_at     timestamptz not null default pg_catalog.now(),
+
+  constraint cwv_daily_samples_positive_check check (samples >= 0),
+  constraint cwv_daily_avg_variance_nonneg_check check (avg_variance_pct >= 0),
+  constraint cwv_daily_stddev_nonneg_check check (stddev is null or stddev >= 0)
+);
+
+-- One roll-up row per org/item/day (re-running the job upserts).
+create unique index if not exists catch_weight_variance_daily_org_item_day_uq
+  on public.catch_weight_variance_daily (org_id, item_id, day);
+create index if not exists idx_cwv_daily_org_day
+  on public.catch_weight_variance_daily (org_id, day);
+create index if not exists idx_cwv_daily_org_site
+  on public.catch_weight_variance_daily (org_id, site_id);
+
+alter table public.catch_weight_variance_daily enable row level security;
+alter table public.catch_weight_variance_daily force row level security;
+
+drop policy if exists catch_weight_variance_daily_org_context_select on public.catch_weight_variance_daily;
+create policy catch_weight_variance_daily_org_context_select
+  on public.catch_weight_variance_daily
+  for select
+  to app_user
+  using (org_id = app.current_org_id());
+
+drop policy if exists catch_weight_variance_daily_org_context_insert on public.catch_weight_variance_daily;
+create policy catch_weight_variance_daily_org_context_insert
+  on public.catch_weight_variance_daily
+  for insert
+  to app_user
+  with check (org_id = app.current_org_id());
+
+drop policy if exists catch_weight_variance_daily_org_context_update on public.catch_weight_variance_daily;
+create policy catch_weight_variance_daily_org_context_update
+  on public.catch_weight_variance_daily
+  for update
+  to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+
+drop policy if exists catch_weight_variance_daily_org_context_delete on public.catch_weight_variance_daily;
+create policy catch_weight_variance_daily_org_context_delete
+  on public.catch_weight_variance_daily
+  for delete
+  to app_user
+  using (org_id = app.current_org_id());
+
+revoke all on public.catch_weight_variance_daily from public;
+grant select, insert, update, delete on public.catch_weight_variance_daily to app_user;
+
+comment on table public.catch_weight_variance_daily is
+  'T-031: nightly per-(org,item,day) catch-weight variance roll-up (avg variance%, stddev, samples). '
+  'Technical-owned. The nightly cron emits catch_weight.variance_exceeded when avg_variance_pct '
+  'exceeds the org Reference.AlertThresholds catch_weight_variance_pct (default 5%).';
diff --git a/packages/db/migrations/189-outbox-events-full-union.sql b/packages/db/migrations/189-outbox-events-full-union.sql
new file mode 100644
index 00000000..c421669f
--- /dev/null
+++ b/packages/db/migrations/189-outbox-events-full-union.sql
@@ -0,0 +1,134 @@
+-- Migration 189: outbox event_type CHECK regenerate — FULL enum union (DB_EVENT_TYPES).
+-- SoT: packages/outbox/src/events.enum.ts (DB_EVENT_TYPES, 122 types).
+-- Regenerated at collection to include 08-production.* (migs 181-185) + settings.d365_sync.updated
+-- (mig 180) + quality.atp_swab_failed (T-026) + catch_weight.variance_exceeded (T-031).
+-- Strict superset — no event dropped. Drift gate: packages/outbox/src/__tests__/check-drift.test.ts.
+alter table public.outbox_events drop constraint if exists outbox_events_event_type_check;
+alter table public.outbox_events add constraint outbox_events_event_type_check check (
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
+      'wo.ready'
+    )
+  );
+comment on constraint outbox_events_event_type_check on public.outbox_events
+  is 'Regenerated from events.enum.ts DB_EVENT_TYPES (122 types incl production.*).';
</stdin>
codex
| severity (BLOCK/HIGH/MED/LOW) | file:line | issue | suggested fix |
|---|---:|---|---|
| BLOCK | `packages/db/migrations/183-production-waste-downtime.sql:1` | 08-production creates `public.waste_categories` and `public.downtime_categories`, explicitly described as 02-Settings reference tables. This crosses canonical ownership: production should not create settings-owned reference tables, even as “shells”. | Move these tables to a 02-Settings migration, or remove the FKs until the 02-owned tables exist. 08 may reference only canonical tables owned elsewhere, not create them. |
| BLOCK | `packages/db/migrations/188-catch-weight-variance-daily.sql:32` | Migration 188 creates `public.work_order_items` while the comment says it is 08-PRODUCTION canonical. This is a 03-Technical migration creating an 08-owned operational table shell, which violates the canonical-owner red line and can lock in the wrong table shape before the owner ships it. | Remove the shell table from this migration. Have 08-production create the canonical `work_order_items` table, then make Technical read from it after dependency ordering is satisfied. |
| HIGH | `packages/db/migrations/184-production-changeover-allergen-oee.sql:186` | `oee_snapshots` is stated as “08 is sole writer”, but `app_user` is granted `insert, update, delete`. That does not enforce a single producer and lets any app path mutate OEE facts directly, including future 15-oee code running as `app_user`. | Restrict writes to a dedicated 08-production writer role/function. Grant non-08 consumers `select` only; if app writes are needed, expose a SECURITY DEFINER function owned by 08 that validates producer context. |

VERDICT: FAIL + blocking items: cross-owner creation of 02-Settings category tables in migration 183, cross-owner creation of 08-owned `work_order_items` in migration 188.
tokens used
46,239
| severity (BLOCK/HIGH/MED/LOW) | file:line | issue | suggested fix |
|---|---:|---|---|
| BLOCK | `packages/db/migrations/183-production-waste-downtime.sql:1` | 08-production creates `public.waste_categories` and `public.downtime_categories`, explicitly described as 02-Settings reference tables. This crosses canonical ownership: production should not create settings-owned reference tables, even as “shells”. | Move these tables to a 02-Settings migration, or remove the FKs until the 02-owned tables exist. 08 may reference only canonical tables owned elsewhere, not create them. |
| BLOCK | `packages/db/migrations/188-catch-weight-variance-daily.sql:32` | Migration 188 creates `public.work_order_items` while the comment says it is 08-PRODUCTION canonical. This is a 03-Technical migration creating an 08-owned operational table shell, which violates the canonical-owner red line and can lock in the wrong table shape before the owner ships it. | Remove the shell table from this migration. Have 08-production create the canonical `work_order_items` table, then make Technical read from it after dependency ordering is satisfied. |
| HIGH | `packages/db/migrations/184-production-changeover-allergen-oee.sql:186` | `oee_snapshots` is stated as “08 is sole writer”, but `app_user` is granted `insert, update, delete`. That does not enforce a single producer and lets any app path mutate OEE facts directly, including future 15-oee code running as `app_user`. | Restrict writes to a dedicated 08-production writer role/function. Grant non-08 consumers `select` only; if app writes are needed, expose a SECURITY DEFINER function owned by 08 that validates producer context. |

VERDICT: FAIL + blocking items: cross-owner creation of 02-Settings category tables in migration 183, cross-owner creation of 08-owned `work_order_items` in migration 188.

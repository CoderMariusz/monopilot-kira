-- Migration 201: 13-Maintenance — CMMS schema foundation (15 tables).
-- PRD: docs/prd/13-MAINTENANCE-PRD.md §9.1-9.15, §14.1 (7y BRCGS retention), §14.2 (RLS).
-- Tasks: _meta/atomic-tasks/13-maintenance/tasks/T-002 (settings/technicians/equipment),
--   T-003 (schedules), T-004 (MWO core + checklists + LOTO), T-005 (spares ×4),
--   T-006 (calibration + sanitation + history).
--
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id()
--   (foundation function, migration 002-rls-baseline.sql — never redefined, never read as a raw
--   current_setting GUC). site_id is REC-L1 day-1: NULLABLE uuid, no FK, no registry — full
--   per-site scoping (NOT NULL + (org_id, site_id) policy + app.current_site_id()) lands later via
--   14-multi-site T-030. Until then the column exists so operational rows can be tagged.
-- NUMERIC-exact: money/qty/rate/temp columns are NUMERIC (never float).
-- R13 audit: created_at/updated_at on every table; created_by/updated_by where an actor applies.
-- BRCGS 7y retention: calibration_records / sanitation_checklists / maintenance_history carry a
--   retention_until DATE GENERATED ALWAYS AS (... + INTERVAL '7 years') STORED column — never writable.
-- Canonical-owner separation: this migration creates ONLY maintenance.* tables. It does NOT create
--   wo_outputs / oee_snapshots / downtime_events (08-production), schedule_outputs (04-planning),
--   license_plates (05-warehouse), item_cost_history (03-technical), quality_holds / ncr_reports
--   (09-quality). All cross-module identities (parent_line_id, assigned_operation_id,
--   downtime_event_id, warehouse_id, supplier_id, line_id) are SOFT uuids — a hard FK would couple
--   migration ordering across modules (mirrors warehouse 191 + production 181 patterns).

-- ===========================================================================
-- Shared updated_at trigger function (maintenance namespace, idempotent).
-- ===========================================================================
create or replace function public.maintenance_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

-- ===========================================================================
-- 9.1 maintenance_settings — per (org, site) tunables.
-- ===========================================================================
create table if not exists public.maintenance_settings (
  id                                uuid primary key default gen_random_uuid(),
  org_id                            uuid not null references public.organizations(id) on delete cascade,
  site_id                           uuid,
  pm_interval_default_days          integer not null default 30,
  calibration_warning_days          integer not null default 30,
  calibration_urgent_days           integer not null default 7,
  mtbf_target_hours                 integer,
  availability_breach_threshold_pct numeric(5, 2) default 80.00,
  requires_loto_default             boolean not null default false,
  created_by                        uuid references public.users(id) on delete set null,
  updated_by                        uuid references public.users(id) on delete set null,
  created_at                        timestamptz not null default pg_catalog.now(),
  updated_at                        timestamptz not null default pg_catalog.now(),
  constraint maintenance_settings_org_site_uq unique (org_id, site_id)
);
create index if not exists idx_maintenance_settings_org_site
  on public.maintenance_settings (org_id, site_id);

-- ===========================================================================
-- 9.2 technician_profiles — maintenance staff (PII: auth.users link).
-- ===========================================================================
create table if not exists public.technician_profiles (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  site_id        uuid,
  user_id        uuid not null,            -- -> auth.users(id), service-layer validated
  skill_level    text not null,
  certifications jsonb not null default '[]'::jsonb,
  hourly_rate    numeric(10, 2),
  active         boolean not null default true,
  created_by     uuid references public.users(id) on delete set null,
  updated_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default pg_catalog.now(),
  updated_at     timestamptz not null default pg_catalog.now(),
  constraint technician_profiles_org_user_uq unique (org_id, user_id),
  constraint technician_profiles_skill_level_check
    check (skill_level in ('basic', 'advanced', 'specialist'))
);
create index if not exists idx_technician_profiles_org_site
  on public.technician_profiles (org_id, site_id);

-- ===========================================================================
-- 9.3 equipment — asset registry (5-level hierarchy via parent_line_id soft FK).
-- ===========================================================================
create table if not exists public.equipment (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.organizations(id) on delete cascade,
  site_id                   uuid,
  equipment_code            text not null,
  name                      text not null,
  equipment_type            text not null,
  parent_line_id            uuid,             -- soft FK -> 08-PROD production_lines
  assigned_operation_id     uuid,             -- soft FK -> 02-SETTINGS manufacturing_operations
  requires_loto             boolean not null default false,
  requires_calibration      boolean not null default false,
  calibration_interval_days integer,
  l3_ext_cols               jsonb not null default '{}'::jsonb,
  active                    boolean not null default true,
  created_by                uuid references public.users(id) on delete set null,
  updated_by                uuid references public.users(id) on delete set null,
  created_at                timestamptz not null default pg_catalog.now(),
  updated_at                timestamptz not null default pg_catalog.now(),
  constraint equipment_org_code_uq unique (org_id, equipment_code)
);
create index if not exists idx_equipment_org_site  on public.equipment (org_id, site_id);
create index if not exists idx_equipment_line       on public.equipment (parent_line_id);
create index if not exists idx_equipment_operation  on public.equipment (assigned_operation_id);

-- ===========================================================================
-- 9.4 maintenance_schedules — PM/calibration/sanitation/inspection schedules.
-- ===========================================================================
create table if not exists public.maintenance_schedules (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations(id) on delete cascade,
  site_id                uuid,
  equipment_id           uuid not null references public.equipment(id) on delete restrict,
  operation_context      jsonb,
  schedule_type          text not null,
  interval_basis         text not null,
  interval_value         integer not null,
  warning_days           integer default 7,
  next_due_date          date,
  last_completed_at      timestamptz,
  assigned_technician_id uuid references public.technician_profiles(id) on delete set null,
  checklist_template_id  uuid,             -- optional ref -> mwo_checklist_templates (T-003 follow-on)
  active                 boolean not null default true,
  created_by             uuid references public.users(id) on delete set null,
  updated_by             uuid references public.users(id) on delete set null,
  created_at             timestamptz not null default pg_catalog.now(),
  updated_at             timestamptz not null default pg_catalog.now(),
  constraint maintenance_schedules_schedule_type_check
    check (schedule_type in ('preventive', 'calibration', 'sanitation', 'inspection')),
  constraint maintenance_schedules_interval_basis_check
    check (interval_basis in ('calendar_days', 'usage_hours', 'usage_cycles'))
);
create index if not exists idx_schedules_org_site  on public.maintenance_schedules (org_id, site_id);
create index if not exists idx_schedules_equipment on public.maintenance_schedules (equipment_id);
-- PM-engine hot path: next-due scan, only active rows.
create index if not exists idx_schedules_next_due
  on public.maintenance_schedules (next_due_date) where active;
-- V-MNT-23 operation-scoped maintenance query speed.
create index if not exists idx_schedules_operation
  on public.maintenance_schedules using gin (operation_context) where operation_context is not null;

-- ===========================================================================
-- 9.5 maintenance_work_orders — MWO core, 6-state (D-MNT-9). State transitions enforced in
--   T-010 Server Action (workflow-as-data), NOT DB triggers. downtime_event_id soft FK to
--   08-PROD downtime_events; reactive MWOs consume production.downtime.recorded (T-017).
-- ===========================================================================
create table if not exists public.maintenance_work_orders (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  site_id             uuid,
  mwo_number          text not null,        -- MWO-YYYY-NNNNN
  state               text not null,
  source              text not null,
  type                text not null,
  priority            text not null,
  equipment_id        uuid references public.equipment(id) on delete restrict,
  schedule_id         uuid references public.maintenance_schedules(id) on delete set null,
  downtime_event_id   uuid,                 -- soft FK -> 08-PROD downtime_events (canonical owner)
  requester_user_id   uuid,
  requester_reason    text,
  approver_user_id    uuid,
  assigned_to_user_id uuid references public.technician_profiles(id) on delete set null,
  started_at          timestamptz,
  completed_at        timestamptz,
  actual_duration_min integer,
  completion_notes    text,
  cancellation_reason text,
  estimated_cost      numeric(10, 2),
  actual_cost         numeric(10, 2),       -- materialized from parts + labor
  l3_ext_cols         jsonb not null default '{}'::jsonb,
  created_by          uuid references public.users(id) on delete set null,
  updated_by          uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default pg_catalog.now(),
  updated_at          timestamptz not null default pg_catalog.now(),
  constraint maintenance_work_orders_org_mwo_number_uq unique (org_id, mwo_number),
  constraint maintenance_work_orders_state_check
    check (state in ('requested', 'approved', 'open', 'in_progress', 'completed', 'cancelled')),
  constraint maintenance_work_orders_source_check
    check (source in ('manual_request', 'auto_downtime', 'pm_schedule', 'oee_trigger', 'calibration_alert')),
  constraint maintenance_work_orders_type_check
    check (type in ('reactive', 'preventive', 'calibration', 'sanitation', 'inspection')),
  constraint maintenance_work_orders_priority_check
    check (priority in ('low', 'medium', 'high', 'critical'))
);
create index if not exists idx_mwo_state     on public.maintenance_work_orders (state);
create index if not exists idx_mwo_equipment on public.maintenance_work_orders (equipment_id);
create index if not exists idx_mwo_assigned  on public.maintenance_work_orders (assigned_to_user_id);
create index if not exists idx_mwo_source    on public.maintenance_work_orders (source);
create index if not exists idx_mwo_org_site  on public.maintenance_work_orders (org_id, site_id);

-- ===========================================================================
-- 9.6 mwo_checklists — per-step execution checklist.
-- ===========================================================================
create table if not exists public.mwo_checklists (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  site_id          uuid,
  mwo_id           uuid not null references public.maintenance_work_orders(id) on delete cascade,
  step_no          integer not null,
  step_description text not null,
  step_type        text,
  expected_value   text,
  actual_value     text,
  passed           boolean,
  completed_by     uuid,
  completed_at     timestamptz,
  created_at       timestamptz not null default pg_catalog.now(),
  updated_at       timestamptz not null default pg_catalog.now(),
  constraint mwo_checklists_mwo_step_uq unique (mwo_id, step_no),
  constraint mwo_checklists_step_type_check
    check (step_type is null or step_type in ('check', 'measure', 'photo', 'signoff'))
);
create index if not exists idx_mwo_checklists_org on public.mwo_checklists (org_id);

-- ===========================================================================
-- 9.7 mwo_loto_checklists — LOTO pre-execution (D-MNT-15). Dual e-sign applied in T-014:
--   zero_energy_verified_by (lockout verify) + released_by (release verify) — two distinct actors
--   per OSHA 29 CFR 1910.147; e-sign attestation written via @monopilot/e-sign (T-124).
-- ===========================================================================
create table if not exists public.mwo_loto_checklists (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations(id) on delete cascade,
  site_id                  uuid,
  mwo_id                   uuid not null references public.maintenance_work_orders(id) on delete cascade,
  energy_sources_isolated  jsonb not null default '[]'::jsonb,  -- [{source, method, verified_by}]
  tags_applied             jsonb not null default '[]'::jsonb,
  zero_energy_verified_by  uuid,             -- e-sign actor 1 (lockout zero-energy verify)
  verified_at              timestamptz,
  released_at              timestamptz,
  released_by              uuid,             -- e-sign actor 2 (release verify)
  created_at               timestamptz not null default pg_catalog.now(),
  updated_at               timestamptz not null default pg_catalog.now()
);
create index if not exists idx_mwo_loto_mwo on public.mwo_loto_checklists (mwo_id);
create index if not exists idx_mwo_loto_org on public.mwo_loto_checklists (org_id);

-- ===========================================================================
-- 9.8 spare_parts — maintenance catalog, SEPARATE from 03-TECH items (D-MNT-6).
-- ===========================================================================
create table if not exists public.spare_parts (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  site_id         uuid,
  part_code       text not null,
  name            text not null,
  category        text,
  supplier_id     uuid,                     -- soft FK -> 03-TECH suppliers (shared master)
  unit_cost       numeric(10, 2),
  unit_of_measure text default 'ea',
  shelf_life_days integer,
  critical_part   boolean not null default false,
  l3_ext_cols     jsonb not null default '{}'::jsonb,
  active          boolean not null default true,
  created_by      uuid references public.users(id) on delete set null,
  updated_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default pg_catalog.now(),
  updated_at      timestamptz not null default pg_catalog.now(),
  constraint spare_parts_org_part_code_uq unique (org_id, part_code)
);
create index if not exists idx_spare_parts_org_site on public.spare_parts (org_id, site_id);

-- ===========================================================================
-- 9.9 maintenance_spare_parts_stock — per (org, site, part, warehouse) on-hand. warehouse_id soft FK to
--   05-WH warehouses (no FEFO per D-MNT-6). The §9.9 UNIQUE(org,site,part,warehouse) treats NULLs
--   as distinct in Postgres; a COALESCE-expression unique index enforces one stock row per logical key.
-- ===========================================================================
create table if not exists public.maintenance_spare_parts_stock (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  site_id         uuid,
  part_id         uuid not null references public.spare_parts(id) on delete restrict,
  warehouse_id    uuid,                     -- soft FK -> 05-WH warehouses
  location_code   text,
  qty_on_hand     numeric(12, 3) not null default 0,
  reorder_point   numeric(12, 3) default 0,
  reorder_qty     numeric(12, 3) default 0,
  last_counted_at timestamptz,
  created_at      timestamptz not null default pg_catalog.now(),
  updated_at      timestamptz not null default pg_catalog.now(),
  constraint maintenance_spare_parts_stock_qty_on_hand_nonneg_check check (qty_on_hand >= 0)
);
-- One stock row per (org, site, part, warehouse) logical key (NULL-safe).
create unique index if not exists maintenance_spare_parts_stock_org_site_part_wh_uq
  on public.maintenance_spare_parts_stock (
    org_id,
    coalesce(site_id, '00000000-0000-0000-0000-000000000000'::uuid),
    part_id,
    coalesce(warehouse_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
create index if not exists idx_maintenance_spare_parts_stock_org_site on public.maintenance_spare_parts_stock (org_id, site_id);
-- Reorder scan: only below-threshold rows (PM cron T-009).
create index if not exists idx_sp_stock_reorder
  on public.maintenance_spare_parts_stock (org_id, site_id) where qty_on_hand <= reorder_point;

-- ===========================================================================
-- 9.10 spare_parts_transactions — every receipt/consume/adjust/transfer/return.
-- ===========================================================================
create table if not exists public.spare_parts_transactions (
  id           uuid primary key default gen_random_uuid(),  -- UUID v7 idempotency target (R14)
  org_id       uuid not null references public.organizations(id) on delete cascade,
  site_id      uuid,
  part_id      uuid not null references public.spare_parts(id) on delete restrict,
  txn_type     text not null,
  qty          numeric(12, 3) not null,
  mwo_id       uuid references public.maintenance_work_orders(id) on delete set null,
  performed_by uuid,
  performed_at timestamptz not null default pg_catalog.now(),
  notes        text,
  created_at   timestamptz not null default pg_catalog.now(),
  constraint spare_parts_transactions_txn_type_check
    check (txn_type in ('receipt', 'consume', 'adjust', 'transfer_out', 'transfer_in', 'return'))
);
create index if not exists idx_spare_parts_transactions_org on public.spare_parts_transactions (org_id);
create index if not exists idx_sp_txn_mwo
  on public.spare_parts_transactions (mwo_id) where mwo_id is not null;
create index if not exists idx_sp_txn_part_date
  on public.spare_parts_transactions (part_id, performed_at);

-- ===========================================================================
-- 9.11 mwo_spare_parts — MWO <-> part planned/actual join.
-- ===========================================================================
create table if not exists public.mwo_spare_parts (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  site_id            uuid,
  mwo_id             uuid not null references public.maintenance_work_orders(id) on delete cascade,
  part_id            uuid not null references public.spare_parts(id) on delete restrict,
  qty_planned        numeric(12, 3),
  qty_actual         numeric(12, 3),
  unit_cost_snapshot numeric(10, 2),
  created_at         timestamptz not null default pg_catalog.now(),
  updated_at         timestamptz not null default pg_catalog.now(),
  constraint mwo_spare_parts_mwo_part_uq unique (mwo_id, part_id)
);
create index if not exists idx_mwo_spare_parts_org on public.mwo_spare_parts (org_id);

-- ===========================================================================
-- 9.12 calibration_instruments — instrument registry (D-MNT-5 + D-MNT-10).
-- 09-QA v3.1 FK target: lab_results.equipment_id = calibration_instruments.id
--   (D-MNT-10 documented, NOT enforced here — added later by a 09-quality migration).
-- ===========================================================================
create table if not exists public.calibration_instruments (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.organizations(id) on delete cascade,
  site_id                   uuid,
  equipment_id              uuid references public.equipment(id) on delete set null,
  instrument_code           text not null,
  instrument_type           text not null,
  standard                  text not null,
  range_min                 numeric(12, 4),
  range_max                 numeric(12, 4),
  unit_of_measure           text,
  calibration_interval_days integer not null,
  l3_ext_cols               jsonb not null default '{}'::jsonb,
  active                    boolean not null default true,
  created_by                uuid references public.users(id) on delete set null,
  updated_by                uuid references public.users(id) on delete set null,
  created_at                timestamptz not null default pg_catalog.now(),
  updated_at                timestamptz not null default pg_catalog.now(),
  constraint calibration_instruments_org_code_uq unique (org_id, instrument_code),
  constraint calibration_instruments_instrument_type_check
    check (instrument_type in ('scale', 'thermometer', 'ph_meter', 'other')),
  constraint calibration_instruments_standard_check
    check (standard in ('ISO_9001', 'NIST', 'internal', 'other'))
);
create index if not exists idx_cal_instr_org_site on public.calibration_instruments (org_id, site_id);

-- ===========================================================================
-- 9.13 calibration_records — immutable cert + 7y retention (BRCGS Issue 10 + FSMA 204).
--   retention_until is GENERATED ALWAYS AS STORED — never writable. result='FAIL' triggers a
--   09-quality auto-hold candidate (V-MNT-10) via the outbox event (T-012/T-015). certificate_sha256
--   = 21 CFR Part 11 e-sign chain; immutability of finalized certs enforced in T-015 Server Action.
--   Dual e-sign (T-015): calibrated_by = signer 1, reviewer_signed_by = signer 2.
-- ===========================================================================
create table if not exists public.calibration_records (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  site_id              uuid,
  instrument_id        uuid not null references public.calibration_instruments(id) on delete restrict,
  mwo_id               uuid references public.maintenance_work_orders(id) on delete set null,
  calibrated_at        timestamptz not null,
  calibrated_by        uuid,
  standard_applied     text not null,
  test_points          jsonb not null default '[]'::jsonb,  -- [{reference, measured, tolerance_pct}]
  result               text not null,
  certificate_file_url text,
  certificate_sha256   text,             -- 21 CFR Part 11; immutable once set (T-015)
  next_due_date        date not null,
  retention_until      date generated always as ((next_due_date + interval '7 years')::date) stored,
  reviewer_signed_by   uuid,             -- dual e-sign reviewer (T-015)
  notes                text,
  created_by           uuid references public.users(id) on delete set null,
  created_at           timestamptz not null default pg_catalog.now(),
  updated_at           timestamptz not null default pg_catalog.now(),
  constraint calibration_records_result_check
    check (result in ('PASS', 'FAIL', 'OUT_OF_SPEC'))
);
create index if not exists idx_cal_rec_instrument_date
  on public.calibration_records (instrument_id, calibrated_at);
create index if not exists idx_cal_rec_next_due on public.calibration_records (next_due_date);
create index if not exists idx_cal_rec_org      on public.calibration_records (org_id);

-- ===========================================================================
-- 9.14 sanitation_checklists — CIP + allergen-change dual sign + 7y retention (D-MNT-7/14).
--   allergen_change_flag=true -> T-016 emits maintenance.sanitation.allergen_change.completed,
--   consumed by 08-PROD allergen_changeover_gate_v1. Dual e-sign (T-016): first_signed_by
--   (hygiene lead) + second_signed_by (QA). retention_until GENERATED ALWAYS AS STORED.
-- ===========================================================================
create table if not exists public.sanitation_checklists (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  site_id             uuid,
  mwo_id              uuid not null references public.maintenance_work_orders(id) on delete cascade,
  line_id             uuid,                 -- soft FK -> 08-PROD production_lines
  cip_program         text,                 -- pre_rinse|caustic_wash|acid_wash|sanitize|final_rinse
  temp_c              numeric(5, 2),
  concentration_pct   numeric(5, 2),
  duration_min        integer,
  flow_rate_l_per_min numeric(8, 2),
  allergen_change_flag boolean not null default false,
  allergens_removed   jsonb not null default '[]'::jsonb,
  atp_test_result_rlu integer,             -- Relative Light Units (09-QA Q2 consumer)
  first_signed_by     uuid,                 -- dual e-sign actor 1 (hygiene lead)
  second_signed_by    uuid,                 -- dual e-sign actor 2 (QA, allergen_change)
  completed_at        timestamptz,
  -- timestamptz -> date cast is anchored to UTC so the generation expression is IMMUTABLE
  --   (a bare ::date depends on session timezone and Postgres rejects it for STORED generated cols).
  retention_until     date generated always as ((((completed_at at time zone 'UTC')::date) + interval '7 years')::date) stored,
  created_by          uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default pg_catalog.now(),
  updated_at          timestamptz not null default pg_catalog.now()
);
create index if not exists idx_sanitation_mwo      on public.sanitation_checklists (mwo_id);
create index if not exists idx_sanitation_org_site on public.sanitation_checklists (org_id, site_id);

-- ===========================================================================
-- 9.15 maintenance_history — denormalized audit trail + 7y retention.
-- ===========================================================================
create table if not exists public.maintenance_history (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  site_id         uuid,
  equipment_id    uuid not null references public.equipment(id) on delete restrict,
  mwo_id          uuid references public.maintenance_work_orders(id) on delete set null,
  event_type      text not null,            -- completion|cancellation|calibration|sanitation|breakdown
  event_date      timestamptz not null,
  summary         text not null,
  cost            numeric(10, 2),
  technician_id   uuid,
  duration_min    integer,
  retention_until date generated always as ((((event_date at time zone 'UTC')::date) + interval '7 years')::date) stored,
  created_at      timestamptz not null default pg_catalog.now(),
  constraint maintenance_history_event_date_not_null check (event_date is not null)
);
create index if not exists idx_hist_equipment_date on public.maintenance_history (equipment_id, event_date);
create index if not exists idx_hist_org_site       on public.maintenance_history (org_id, site_id);

-- ===========================================================================
-- RLS + grants + updated_at triggers for all 15 tables.
-- ENABLE + FORCE RLS; org-isolation policy via app.current_org_id() (NOT raw current_setting).
-- site_id REC-L1 day-1: policy is org-only for now; per-site app.current_site_id() scoping is
--   added by 14-multi-site T-030 (atomic policy swap) when the site context lands.
-- maintenance_history is append-only (no updated_at column / trigger; insert+select grants only).
-- ===========================================================================
do $$
declare
  v_tbl text;
  -- tables that carry an updated_at column (everything except maintenance_history).
  v_mutable_tables text[] := array[
    'maintenance_settings', 'technician_profiles', 'equipment', 'maintenance_schedules',
    'maintenance_work_orders', 'mwo_checklists', 'mwo_loto_checklists', 'spare_parts',
    'maintenance_spare_parts_stock', 'spare_parts_transactions', 'mwo_spare_parts',
    'calibration_instruments', 'calibration_records', 'sanitation_checklists'
  ];
  v_all_tables text[];
begin
  v_all_tables := v_mutable_tables || array['maintenance_history'];

  foreach v_tbl in array v_all_tables loop
    -- Enable + FORCE RLS.
    execute format('alter table public.%I enable row level security', v_tbl);
    execute format('alter table public.%I force row level security', v_tbl);

    -- Single org-context policy (FOR ALL), org_id = app.current_org_id().
    execute format('drop policy if exists %I on public.%I', v_tbl || '_org_context', v_tbl);
    execute format(
      'create policy %I on public.%I for all to app_user '
      || 'using (org_id = app.current_org_id()) with check (org_id = app.current_org_id())',
      v_tbl || '_org_context', v_tbl
    );

    -- Grants: fail-closed default, DML to app_user only.
    execute format('revoke all on public.%I from public', v_tbl);
    execute format('revoke all on public.%I from app_user', v_tbl);
    execute format('grant select, insert, update, delete on public.%I to app_user', v_tbl);
  end loop;

  -- updated_at triggers (mutable tables only).
  foreach v_tbl in array v_mutable_tables loop
    execute format('drop trigger if exists %I on public.%I', v_tbl || '_set_updated_at', v_tbl);
    execute format(
      'create trigger %I before update on public.%I '
      || 'for each row execute function public.maintenance_set_updated_at()',
      v_tbl || '_set_updated_at', v_tbl
    );
  end loop;

  -- maintenance_history is append-only: SELECT + INSERT only (no UPDATE/DELETE to app_user).
  revoke update, delete on public.maintenance_history from app_user;
end
$$;

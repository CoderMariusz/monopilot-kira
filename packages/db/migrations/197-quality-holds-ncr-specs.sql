-- Migration 197: 09-Quality — schema foundation: quality_holds (+ v_active_holds consume gate),
--   quality_hold_items, ncr_reports, quality_specifications + quality_spec_parameters.
-- PRD: docs/prd/09-QUALITY-PRD.md §6.3 (Key table summaries: quality_holds, quality_hold_items,
--   quality_specifications, quality_spec_parameters, ncr_reports), §9.1 (RLS), §9.2 (v_active_holds),
--   §11.4 (V-QA-NCR), §13.x (retention).
-- Tasks: T-004 (quality_holds + quality_hold_items), T-037 (ncr_reports), T-017 (quality_specifications
--   + quality_spec_parameters), T-064 (v_active_holds VIEW — the canonical consume-gate read model
--   queried by 08-production / 05-warehouse / 11-shipping via holdsGuard).
--
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id()
--   (foundation function, migration 002-rls-baseline.sql — never redefined, never read as a raw
--   current_setting GUC).
-- site_id day-1: site_id uuid is NULLABLE, no FK, no registry — full per-site scoping
--   ((org_id, site_id) policy + app.current_site_id()) lands later via 14-multi-site T-030.
-- NUMERIC-exact: affected_qty_kg / qty_held_kg / yield/claim use NUMERIC (never float).
-- Audit (R13): embedded created_by/created_at/updated columns + a local set_updated_at trigger —
--   this repo has no generic app.audit_event() (matches production migs 181-185 + warehouse 191).
-- Cross-module FKs are SOFT uuids (no .references()) to avoid coupling migration ordering across
--   modules: reason_code_id (02-Settings reference rows), reference_id (lp/batch/wo/po/grn),
--   product_id (03-Technical items), fail_reason_code_id, license_plate_id (05-Warehouse).
-- Canonical-owner separation: this migration creates ONLY 09-quality tables. It does NOT create
--   wo_outputs / oee_snapshots (08-production), schedule_outputs (04-planning), license_plates
--   (05-warehouse).

-- ===========================================================================
-- Sequences (HLD-/NCR- human-readable numbering, START 1000 per PRD §6.3).
-- ===========================================================================
create sequence if not exists public.quality_hold_seq start 1000;
create sequence if not exists public.ncr_seq start 1000;

-- ===========================================================================
-- quality_holds — central hold registry (T-004, §6.3). released_at IS NOT NULL is the terminal
--   flag consumed by v_active_holds (T-064).
-- ===========================================================================
create table if not exists public.quality_holds (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  site_id                     uuid,                          -- day-1 nullable; per-site via 14-MS T-030

  hold_seq                    bigint not null default nextval('public.quality_hold_seq'),
  hold_number                 text generated always as ('HLD-' || lpad(hold_seq::text, 8, '0')) stored,

  reference_type              text not null,
  reference_id                uuid not null,
  reason_code_id              uuid,                          -- soft FK to 02-Settings quality_hold_reasons
  reason_free_text            text,
  priority                    text not null,
  disposition                 text,
  disposition_notes           text,
  default_hold_duration_days  integer,                       -- snapshot from reason at create
  -- estimated_release_at = created_at::date + default_hold_duration_days. A GENERATED STORED column
  -- here is rejected ("generation expression is not immutable" — timestamptz::date + text-interval
  -- cast are not immutable), so it is a regular column maintained by the trigger below.
  estimated_release_at        date,
  hold_status                 text not null default 'open',

  created_by                  uuid not null references public.users(id) on delete restrict,
  created_at                  timestamptz not null default pg_catalog.now(),
  released_by                 uuid references public.users(id) on delete set null,
  released_at                 timestamptz,
  release_signature_hash      varchar(64),
  release_notes               text,

  ext_jsonb                   jsonb not null default '{}'::jsonb,  -- ADR-028 L3 schema-driven
  updated_at                  timestamptz not null default pg_catalog.now(),

  -- retention_until (BRCGS 7y from release/create). A GENERATED column referencing the mutable
  -- released_at column is not STORED-safe across UPDATEs, so it is a regular column maintained by
  -- the quality_holds_set_updated_at_retention trigger (and defaulted on insert) to stay exact.
  retention_until             date default ((pg_catalog.now()::date) + interval '7 years')::date,

  constraint quality_holds_hold_number_uq unique (hold_number),
  constraint quality_holds_reference_type_check check (
    reference_type in ('lp', 'batch', 'wo', 'po', 'grn')
  ),
  constraint quality_holds_priority_check check (
    priority in ('low', 'medium', 'high', 'critical')
  ),
  constraint quality_holds_hold_status_check check (
    hold_status in ('open', 'investigating', 'released', 'quarantined', 'escalated')
  ),
  constraint quality_holds_disposition_check check (
    disposition is null or disposition in
      ('pending', 'rework', 'scrap', 'release_as_is', 'return_supplier', 'other')
  )
);

-- idx_holds_active — the partial index that backs the v_active_holds consume-gate read model (T-064).
create index if not exists idx_holds_active
  on public.quality_holds (org_id, hold_status)
  where hold_status in ('open', 'investigating', 'escalated', 'quarantined');
create index if not exists idx_holds_ref
  on public.quality_holds (org_id, reference_type, reference_id);
create index if not exists quality_holds_org_idx
  on public.quality_holds (org_id);
create index if not exists quality_holds_org_site_idx
  on public.quality_holds (org_id, site_id);

alter table public.quality_holds enable row level security;
alter table public.quality_holds force row level security;
drop policy if exists quality_holds_org_context on public.quality_holds;
create policy quality_holds_org_context
  on public.quality_holds
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.quality_holds from public;
revoke all on public.quality_holds from app_user;
grant select, insert, update, delete on public.quality_holds to app_user;

-- ===========================================================================
-- quality_hold_items — multi-LP hold (one hold can cover multiple LPs in same batch) (T-004, §6.3).
-- ===========================================================================
create table if not exists public.quality_hold_items (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  hold_id           uuid not null references public.quality_holds(id) on delete cascade,
  license_plate_id  uuid,                                    -- soft FK to 05-Warehouse license_plates
  qty_held_kg       numeric(18, 3),
  qty_released_kg   numeric(18, 3) default 0,
  item_status       text not null default 'held',
  notes             text,
  created_at        timestamptz not null default pg_catalog.now(),
  updated_at        timestamptz not null default pg_catalog.now(),

  constraint quality_hold_items_hold_lp_uq unique (hold_id, license_plate_id),
  constraint quality_hold_items_item_status_check check (
    item_status in ('held', 'released', 'partial_released', 'scrapped')
  )
);

create index if not exists quality_hold_items_org_idx
  on public.quality_hold_items (org_id);
create index if not exists quality_hold_items_hold_idx
  on public.quality_hold_items (hold_id);
create index if not exists quality_hold_items_lp_idx
  on public.quality_hold_items (license_plate_id) where license_plate_id is not null;

alter table public.quality_hold_items enable row level security;
alter table public.quality_hold_items force row level security;
drop policy if exists quality_hold_items_org_context on public.quality_hold_items;
create policy quality_hold_items_org_context
  on public.quality_hold_items
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.quality_hold_items from public;
revoke all on public.quality_hold_items from app_user;
grant select, insert, update, delete on public.quality_hold_items to app_user;

-- ===========================================================================
-- ncr_reports — Non-Conformance Reports (T-037, §6.3). severity-driven response_due_at (GENERATED),
--   10y retention (GENERATED on immutable created_at — STORED-safe).
-- ===========================================================================
create table if not exists public.ncr_reports (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations(id) on delete cascade,
  site_id                 uuid,                              -- day-1 nullable

  ncr_seq                 bigint not null default nextval('public.ncr_seq'),
  ncr_number              text generated always as ('NCR-' || lpad(ncr_seq::text, 8, '0')) stored,

  ncr_type                text not null default 'quality',
  severity                text not null,
  status                  text not null default 'draft',
  title                   text not null,
  description             text not null,
  reference_type          text,
  reference_id            uuid,
  product_id              uuid,                              -- soft FK to 03-Technical items
  detected_by             uuid references public.users(id) on delete set null,
  detected_at             timestamptz not null default pg_catalog.now(),
  detected_location       text,
  fail_reason_code_id     uuid,                              -- soft FK to 02-Settings qa_failure_reasons

  affected_qty_kg         numeric(18, 3),

  -- Phase-2 workflow columns (present in P1 schema, written by later Server Actions).
  assigned_to             uuid references public.users(id) on delete set null,
  investigator_id         uuid references public.users(id) on delete set null,
  root_cause              text,
  root_cause_category     text,
  immediate_action        text,
  capa_record_id          uuid,                              -- soft FK to capa_records (P2)

  -- Yield-issue specific (§6.2).
  target_yield_pct        numeric(5, 2),
  actual_yield_pct        numeric(5, 2),
  claim_pct               numeric(5, 2),
  claim_value_eur         numeric(18, 2),

  -- Closure (dual-sign for critical enforced by T-038 Server Action + a later immutability trigger).
  closed_by               uuid references public.users(id) on delete set null,
  closed_at               timestamptz,
  closure_signature_hash  varchar(64),

  -- response_due_at = detected_at + severity SLA (critical 24h / major 48h / minor 7d). A GENERATED
  -- STORED column is rejected (timestamptz + interval is STABLE, not IMMUTABLE), so it is
  -- trigger-maintained (and defaulted to detected_at on insert before the trigger overwrites it).
  response_due_at         timestamptz,

  linked_hold_id          uuid references public.quality_holds(id) on delete set null,
  ext_jsonb               jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default pg_catalog.now(),
  updated_at             timestamptz not null default pg_catalog.now(),
  -- retention_until = created_at + 10y. A GENERATED STORED column on created_at::date is rejected
  -- (timestamptz::date is not immutable), so it is trigger-maintained (defaulted on insert too).
  retention_until         date default ((pg_catalog.now()::date) + interval '10 years')::date,

  constraint ncr_reports_ncr_number_uq unique (ncr_number),
  constraint ncr_reports_ncr_type_check check (
    ncr_type in ('quality', 'yield_issue', 'allergen_deviation', 'supplier', 'process', 'complaint_related')
  ),
  constraint ncr_reports_severity_check check (
    severity in ('critical', 'major', 'minor')
  ),
  constraint ncr_reports_status_check check (
    status in ('draft', 'open', 'investigating', 'awaiting_capa', 'closed', 'reopened', 'cancelled')
  ),
  constraint ncr_reports_reference_type_check check (
    reference_type is null or reference_type in
      ('lp', 'batch', 'wo', 'po', 'grn', 'inspection', 'ccp_deviation', 'complaint', 'supplier')
  )
);

create index if not exists idx_ncr_open
  on public.ncr_reports (org_id, status, severity, response_due_at)
  where status not in ('closed', 'cancelled');
create index if not exists idx_ncr_ref
  on public.ncr_reports (org_id, reference_type, reference_id);
create index if not exists ncr_reports_org_idx
  on public.ncr_reports (org_id);
create index if not exists ncr_reports_org_site_idx
  on public.ncr_reports (org_id, site_id);
create index if not exists ncr_reports_linked_hold_idx
  on public.ncr_reports (linked_hold_id) where linked_hold_id is not null;

alter table public.ncr_reports enable row level security;
alter table public.ncr_reports force row level security;
drop policy if exists ncr_reports_org_context on public.ncr_reports;
create policy ncr_reports_org_context
  on public.ncr_reports
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.ncr_reports from public;
revoke all on public.ncr_reports from app_user;
grant select, insert, update, delete on public.ncr_reports to app_user;

-- ===========================================================================
-- quality_specifications + quality_spec_parameters — versioned product specs (T-017, §6.3).
-- ===========================================================================
create table if not exists public.quality_specifications (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations(id) on delete cascade,
  product_id               uuid not null,                   -- soft FK to 03-Technical items
  spec_code                text not null,
  version                  integer not null default 1,
  status                   text not null default 'draft',
  effective_from           date,
  effective_until          date,
  applies_to               text not null,
  reference_documents      jsonb not null default '[]'::jsonb,
  allergen_profile         jsonb,                           -- snapshot from 03-TECH at approval (T-020)
  approved_by              uuid references public.users(id) on delete set null,
  approved_at              timestamptz,
  approval_signature_hash  varchar(64),
  superseded_by            uuid references public.quality_specifications(id) on delete set null,
  created_by               uuid not null references public.users(id) on delete restrict,
  created_at               timestamptz not null default pg_catalog.now(),
  updated_at               timestamptz not null default pg_catalog.now(),
  ext_jsonb                jsonb not null default '{}'::jsonb,

  constraint quality_specifications_product_code_version_uq
    unique (org_id, product_id, spec_code, version),
  constraint quality_specifications_status_check check (
    status in ('draft', 'under_review', 'active', 'expired', 'superseded')
  ),
  constraint quality_specifications_applies_to_check check (
    applies_to in ('incoming', 'in_process', 'final', 'all')
  )
);

create index if not exists quality_specifications_org_idx
  on public.quality_specifications (org_id);
create index if not exists quality_specifications_org_product_idx
  on public.quality_specifications (org_id, product_id);
create index if not exists quality_specifications_superseded_idx
  on public.quality_specifications (superseded_by) where superseded_by is not null;

alter table public.quality_specifications enable row level security;
alter table public.quality_specifications force row level security;
drop policy if exists quality_specifications_org_context on public.quality_specifications;
create policy quality_specifications_org_context
  on public.quality_specifications
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.quality_specifications from public;
revoke all on public.quality_specifications from app_user;
grant select, insert, update, delete on public.quality_specifications to app_user;

create table if not exists public.quality_spec_parameters (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  specification_id   uuid not null references public.quality_specifications(id) on delete cascade,
  parameter_name     text not null,
  parameter_type     text not null,
  target_value       numeric,
  min_value          numeric,
  max_value          numeric,
  unit               text,
  test_method        text,
  equipment_required text,
  is_critical        boolean not null default false,        -- critical = fail blocks batch release
  sort_order         integer not null default 0,
  ext_jsonb          jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default pg_catalog.now(),
  updated_at         timestamptz not null default pg_catalog.now(),

  constraint quality_spec_parameters_parameter_type_check check (
    parameter_type in ('visual', 'measurement', 'attribute', 'microbiological', 'chemical', 'sensory', 'equipment')
  ),
  constraint quality_spec_parameters_min_le_max_check check (
    min_value is null or max_value is null or min_value <= max_value
  )
);

create index if not exists quality_spec_parameters_org_idx
  on public.quality_spec_parameters (org_id);
create index if not exists quality_spec_parameters_spec_idx
  on public.quality_spec_parameters (specification_id);

alter table public.quality_spec_parameters enable row level security;
alter table public.quality_spec_parameters force row level security;
drop policy if exists quality_spec_parameters_org_context on public.quality_spec_parameters;
create policy quality_spec_parameters_org_context
  on public.quality_spec_parameters
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.quality_spec_parameters from public;
revoke all on public.quality_spec_parameters from app_user;
grant select, insert, update, delete on public.quality_spec_parameters to app_user;

-- ===========================================================================
-- set_updated_at + retention_until maintenance trigger (R13 embedded-audit pattern).
-- Reused across the four 09-quality tables. For quality_holds it ALSO keeps retention_until exact
-- (COALESCE(released_at, created_at + 7y)::date + 7y) per §6.3, since a GENERATED column on the
-- mutable released_at column is not STORED-safe.
-- ===========================================================================
create or replace function public.quality_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function public.quality_holds_set_updated_at_retention()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  -- retention_until (BRCGS 7y from release/create) — §6.3 COALESCE(released_at, created_at+7y)+7y.
  new.retention_until :=
    (coalesce(new.released_at, new.created_at + interval '7 years')::date + interval '7 years')::date;
  -- estimated_release_at = created_at::date + default_hold_duration_days.
  new.estimated_release_at :=
    (new.created_at::date + (coalesce(new.default_hold_duration_days, 0) || ' days')::interval)::date;
  return new;
end;
$$;

-- ncr_reports retention_until (10y from created_at) + response_due_at (severity SLA) —
-- trigger-maintained (see column comments). timestamptz + interval is STABLE not IMMUTABLE, so
-- these cannot be GENERATED STORED columns.
create or replace function public.ncr_reports_set_updated_at_retention()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  new.retention_until := (new.created_at::date + interval '10 years')::date;
  new.response_due_at := new.detected_at + case new.severity
    when 'critical' then interval '24 hours'
    when 'major'    then interval '48 hours'
    when 'minor'    then interval '7 days'
  end;
  return new;
end;
$$;

-- quality_holds: maintain updated_at + retention_until on insert AND update.
drop trigger if exists quality_holds_set_updated_at on public.quality_holds;
create trigger quality_holds_set_updated_at
  before insert or update on public.quality_holds
  for each row execute function public.quality_holds_set_updated_at_retention();

drop trigger if exists quality_hold_items_set_updated_at on public.quality_hold_items;
create trigger quality_hold_items_set_updated_at
  before update on public.quality_hold_items
  for each row execute function public.quality_set_updated_at();

-- ncr_reports: maintain updated_at + retention_until on insert AND update.
drop trigger if exists ncr_reports_set_updated_at on public.ncr_reports;
create trigger ncr_reports_set_updated_at
  before insert or update on public.ncr_reports
  for each row execute function public.ncr_reports_set_updated_at_retention();

drop trigger if exists quality_specifications_set_updated_at on public.quality_specifications;
create trigger quality_specifications_set_updated_at
  before update on public.quality_specifications
  for each row execute function public.quality_set_updated_at();

drop trigger if exists quality_spec_parameters_set_updated_at on public.quality_spec_parameters;
create trigger quality_spec_parameters_set_updated_at
  before update on public.quality_spec_parameters
  for each row execute function public.quality_set_updated_at();

-- ===========================================================================
-- v_active_holds — canonical consume-gate read model (T-064, §9.2).
-- security_invoker so the underlying quality_holds RLS applies to the querying app_user
-- (NEVER security_definer — that would bypass RLS and leak cross-org holds). 08-production WO
-- consume, 05-warehouse LP consume, and 11-shipping LP qa_status gating ALL query this view via
-- packages/server/src/quality/holdsGuard.ts (single source of truth — never re-read quality_holds
-- directly from a consume path). Active = open/investigating/escalated/quarantined AND released_at
-- IS NULL. The WHERE clause + (org_id, hold_status) predicate are backed by idx_holds_active.
-- ===========================================================================
drop view if exists public.v_active_holds;
create view public.v_active_holds
  with (security_invoker = true)
  as
  select
    h.id                    as hold_id,
    h.hold_number,
    h.org_id,
    h.reference_type,
    h.reference_id,
    h.priority,
    h.hold_status,
    h.created_at,
    h.estimated_release_at,
    h.default_hold_duration_days
  from public.quality_holds h
  where h.hold_status in ('open', 'investigating', 'escalated', 'quarantined')
    and h.released_at is null;

revoke all on public.v_active_holds from public;
grant select on public.v_active_holds to app_user;

comment on view public.v_active_holds is
  'Canonical consume-gate read model (09-Quality §9.2, T-064). security_invoker view over '
  'quality_holds: active holds only (hold_status in open/investigating/escalated/quarantined AND '
  'released_at IS NULL). Queried by 08-production / 05-warehouse / 11-shipping via holdsGuard '
  '(single source of truth). NEVER security_definer — RLS must flow from quality_holds.';

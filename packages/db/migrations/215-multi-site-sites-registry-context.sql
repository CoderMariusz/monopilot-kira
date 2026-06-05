-- Migration 215: 14-multi-site — SCHEMA FOUNDATION.
--   (A) app.session_site_contexts + app.active_site_contexts trust store + app.set_site_context()
--       setter + app.current_site_id() reader (the site-scoping primitive every operational table's
--       day-1 site_id column awaits; T-001).
--   (B) public.sites — the canonical physical-site registry (org master data, org-scoped — NOT
--       site-scoped per §6.4 REC-L1). site_id columns across all modules are nullable-no-FK day-1;
--       THIS migration owns the FK target so future modules can reference public.sites (T-002).
--   (C) public.operational_tables — the cross-module site-scoping registry + app.is_site_scoped_table()
--       helper. Records which operational tables carry a day-1 site_id column awaiting the T-030
--       backfill (NOT NULL + (org_id, site_id) policy + app.current_site_id()). This migration ONLY
--       ships the registry + seeds the known §9.8 tables; it does NOT ALTER/backfill any other
--       module's table (that is T-030, out of scope).
--   (D) public.inter_site_transfer_orders — the inter-site transfer (IST/TO) shell, the one
--       OPERATIONAL site-scoped table this foundation owns (from_site/to_site reference public.sites).
--       Org+site RLS via app.current_org_id() AND app.current_site_id(). (T-008 shell.)
--   (E) Outbox CHECK regenerated to equal DB_EVENT_TYPES incl the 5 new transfer_order.* /
--       transport_lane.* events (drift gate green).
--
-- PRD: docs/prd/14-MULTI-SITE-PRD.md §9.1 (sites), §9.6 (IST), §9.8 (operational table list),
--      §9.9 (composite indexes), §11.1 V-MS-01/04, §15.1 (current_site_id), §12.3/§10A.4 (events).
-- Tasks: T-001 (site context), T-002 (sites), T-008 (IST shell), T-017 (events), T-030 (registry contract).
--
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id()
--   (migration 002-rls-baseline.sql — never redefined). The new app.current_site_id() mirrors that
--   trust-store contract (no raw current_setting GUC read leaks past the SECURITY DEFINER body).
-- site_id day-1: nullable uuid (no retro-FK) on every operational table; sites lands now so the FK
--   TARGET exists for future modules, but NO retro-FK is added to existing nullable site_id columns
--   (that is the T-030 backfill, out of scope here).
-- NUMERIC-exact: transfer_cost is NUMERIC(18,2) (money — never float).
-- Canonical-owner separation: this migration creates ONLY sites + operational_tables +
--   inter_site_transfer_orders + the site-context functions. It does NOT create/alter wo_outputs
--   (08), oee_snapshots (08), downtime_events (08), schedule_outputs (04), license_plates (05),
--   item_cost_history (03), quality_holds / ncr_reports / v_active_holds (09).

-- ===========================================================================
-- (A) Site-context primitive — app.session_site_contexts trust store + setter/reader (T-001).
--     Mirrors app.session_org_contexts / app.set_org_context / app.current_org_id() in 002.
--     site_id NULL on a trust row = explicit super_admin ALL-sites mode (V-MS-07).
-- ===========================================================================
create table if not exists app.session_site_contexts (
  session_token uuid primary key,
  user_id       uuid not null,
  org_id        uuid not null references public.organizations(id) on delete cascade,
  site_id       uuid,  -- NULL = ALL-sites (super_admin) per V-MS-07
  created_at    timestamptz not null default pg_catalog.now()
);

create table if not exists app.active_site_contexts (
  backend_pid    integer primary key,
  transaction_id bigint not null,
  session_token  uuid not null references app.session_site_contexts(session_token) on delete cascade,
  site_id        uuid,  -- NULL = ALL-sites mode (super_admin)
  set_at         timestamptz not null default pg_catalog.now()
);

revoke all on app.session_site_contexts from public;
revoke all on app.session_site_contexts from app_user;
revoke all on app.active_site_contexts from public;
revoke all on app.active_site_contexts from app_user;

-- Setter: verifies the session row exists; if its site_id is NOT NULL it MUST equal the requested
-- site (else PG 28000); if its site_id IS NULL the caller may declare ALL-sites (site arg NULL) OR a
-- specific in-scope site is delegated to site_user_access at the app layer (not enforced here — the
-- trust-store row is the gate). Distinguishes 'no row' (reject) from 'row with site_id NULL' (allow).
create or replace function app.set_site_context(session_token uuid, site uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_trusted_site uuid;
  v_found        boolean;
begin
  select trusted_context.site_id,
         true
    into v_trusted_site, v_found
  from app.session_site_contexts trusted_context
  where trusted_context.session_token = set_site_context.session_token
  limit 1;

  if not coalesce(v_found, false) then
    raise exception 'invalid site context'
      using errcode = '28000';
  end if;

  -- A site-bound trust row may only set its own site (mismatch = spoof attempt).
  if v_trusted_site is not null and (set_site_context.site is null or set_site_context.site <> v_trusted_site) then
    raise exception 'invalid site context'
      using errcode = '28000';
  end if;

  insert into app.active_site_contexts (backend_pid, transaction_id, session_token, site_id, set_at)
  values (pg_catalog.pg_backend_pid(), pg_catalog.txid_current(), set_site_context.session_token, set_site_context.site, pg_catalog.now())
  on conflict (backend_pid) do update
    set transaction_id = excluded.transaction_id,
        session_token  = excluded.session_token,
        site_id        = excluded.site_id,
        set_at         = excluded.set_at;
end;
$$;

-- Reader: returns the bound site for the current backend+tx, NULL = super_admin / ALL-sites mode.
-- SECURITY DEFINER STABLE; the only legal read of the GUC trust store lives here.
-- (NOT leakproof: only a superuser may define a leakproof function, and the migration role
-- on Supabase is not superuser — leakproof is a planner optimization hint, safe to omit.)
create or replace function app.current_site_id()
returns uuid
language sql
security definer
stable
set search_path = pg_catalog
as $$
  select active_context.site_id
  from app.active_site_contexts active_context
  join app.session_site_contexts trusted_context
    on trusted_context.session_token = active_context.session_token
  where active_context.backend_pid = pg_catalog.pg_backend_pid()
    and active_context.transaction_id = pg_catalog.txid_current_if_assigned()
  limit 1
$$;

revoke all on function app.set_site_context(uuid, uuid) from public;
revoke all on function app.current_site_id() from public;
grant execute on function app.set_site_context(uuid, uuid) to app_user;
grant execute on function app.current_site_id() to app_user;

-- ===========================================================================
-- (B) public.sites — physical-site registry (org master data, org-scoped; §9.1, T-002).
--     V-MS-01 exactly-one-default-site-per-org via unique partial index. site_code unique per org.
--     parent_site_id self-ref (archive-only, no CASCADE per D-MS-3). NO site_id column on sites
--     itself (master data per §6.4 REC-L1; a site_id here would be circular).
-- ===========================================================================
create table if not exists public.sites (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete cascade,

  site_code             text not null,
  name                  text not null,
  is_default            boolean not null default false,

  legal_entity          text,
  timezone              text not null default 'UTC',  -- IANA TZ validated at app layer (V-MS-04, zod)
  country               text,
  data_residency_region text,

  hierarchy_config_id   uuid,                          -- soft FK to sites_hierarchy_config (T-005)
  parent_site_id        uuid references public.sites(id) on delete restrict,  -- archive-only (D-MS-3)
  address               jsonb not null default '{}'::jsonb,
  l3_ext_cols           jsonb not null default '{}'::jsonb,

  is_active             boolean not null default true,
  activated_at          timestamptz,

  created_by            uuid references public.users(id) on delete set null,
  updated_by            uuid references public.users(id) on delete set null,
  created_at            timestamptz not null default pg_catalog.now(),
  updated_at            timestamptz not null default pg_catalog.now(),

  constraint sites_org_code_uq unique (org_id, site_code)
);

-- V-MS-01: at most one default site per org.
create unique index if not exists idx_sites_default
  on public.sites (org_id) where is_default = true;
-- org-scoped active read.
create index if not exists idx_sites_org
  on public.sites (org_id) where is_active;
create index if not exists sites_org_idx
  on public.sites (org_id);
create index if not exists sites_parent_idx
  on public.sites (parent_site_id) where parent_site_id is not null;

alter table public.sites enable row level security;
alter table public.sites force row level security;

drop policy if exists sites_org_context on public.sites;
create policy sites_org_context
  on public.sites
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.sites from public;
revoke all on public.sites from app_user;
grant select, insert, update, delete on public.sites to app_user;

create or replace function public.sites_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists sites_set_updated_at on public.sites;
create trigger sites_set_updated_at
  before update on public.sites
  for each row execute function public.sites_set_updated_at();

-- ===========================================================================
-- (C) public.operational_tables — the cross-module site-scoping REGISTRY (§9.8 contract, T-030).
--     Declares which operational tables carry a day-1 site_id column that the later activation
--     migration (T-030) will make NOT NULL + add an (org_id, site_id) policy via app.current_site_id().
--     This is the checked-in mechanism for the day-1 rule (decision D-1 option A). This migration
--     ONLY ships the registry + helper + seeds the §9.8 table names; it ALTERs nothing else.
-- ===========================================================================
create table if not exists public.operational_tables (
  table_name       text primary key,
  owning_module    text not null,         -- e.g. '05-warehouse', '08-production'
  -- 'pending'  = site_id column exists day-1, NOT yet activated (nullable, no policy);
  -- 'activated'= T-030 backfill complete (NOT NULL + (org_id, site_id) site-scoped policy).
  scoping_status   text not null default 'pending',
  -- whether the day-1 nullable site_id column has actually shipped on the table yet.
  site_id_present  boolean not null default false,
  notes            text,
  registered_at    timestamptz not null default pg_catalog.now(),
  activated_at     timestamptz,
  constraint operational_tables_scoping_status_check
    check (scoping_status in ('pending', 'activating', 'activated'))
);

-- Registry is a global catalog (no org_id) — read-only to app_user, written only by migrations.
revoke all on public.operational_tables from public;
revoke all on public.operational_tables from app_user;
grant select on public.operational_tables to app_user;

-- Helper: is this table registered as site-scoped (i.e. should T-030 backfill it)?
create or replace function app.is_site_scoped_table(p_table_name text)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog
as $$
  select exists (
    select 1 from public.operational_tables ot
    where ot.table_name = p_table_name
  )
$$;

revoke all on function app.is_site_scoped_table(text) from public;
grant execute on function app.is_site_scoped_table(text) to app_user;

-- Seed the §9.8 operational tables that carry a day-1 nullable site_id column awaiting T-030.
-- site_id_present is true only for tables that already shipped the day-1 site_id column in earlier
-- migrations (license_plates @191, quality_holds/ncr_reports @197); the rest are declared 'pending'
-- with site_id_present=false so T-030 knows to ADD the column. owning_module records canon ownership;
-- THIS migration does not touch those tables.
insert into public.operational_tables (table_name, owning_module, scoping_status, site_id_present, notes)
values
  ('warehouses',              '05-warehouse',  'pending', false, '§9.8'),
  ('license_plates',          '05-warehouse',  'pending', true,  '§9.8; day-1 site_id @191'),
  ('grn_items',               '05-warehouse',  'pending', false, '§9.8'),
  ('stock_movements',         '05-warehouse',  'pending', false, '§9.8'),
  ('work_orders',             '08-production', 'pending', false, '§9.8'),
  ('wo_outputs',              '08-production', 'pending', false, '§9.8; canon owner 08'),
  ('wo_consumptions',         '08-production', 'pending', false, '§9.8'),
  ('wo_dependencies',         '08-production', 'pending', false, '§9.8'),
  ('downtime_events',         '08-production', 'pending', false, '§9.8; canon owner 08'),
  ('quality_holds',           '09-quality',   'pending', true,  '§9.8; day-1 site_id @197'),
  ('quality_inspections',     '09-quality',   'pending', false, '§9.8'),
  ('ncr_reports',             '09-quality',   'pending', true,  '§9.8; day-1 site_id @197'),
  ('haccp_plans',             '09-quality',   'pending', false, '§9.8'),
  ('shipments',               '11-shipping',  'pending', true,  '§9.8; day-1 site_id @211'),
  ('sales_orders',            '11-shipping',  'pending', true,  '§9.8; day-1 site_id @211'),
  ('inventory_cost_layers',   '10-finance',   'pending', true,  '§9.8; day-1 site_id @199'),
  ('wip_balances',            '10-finance',   'pending', false, '§9.8'),
  ('oee_snapshots',           '08-production', 'pending', false, '§9.8; canon owner 08 (15-oee read-only)'),
  ('maintenance_work_orders', '13-maintenance','pending', false, '§9.8'),
  ('spare_parts_stock',       '13-maintenance','pending', false, '§9.8'),
  ('calibration_instruments', '13-maintenance','pending', false, '§9.8'),
  ('inter_site_transfer_orders','14-multi-site','pending', true,  '§9.6 IST shell owned by 14-multi-site')
on conflict (table_name) do nothing;

-- ===========================================================================
-- (D) public.inter_site_transfer_orders — IST shell (§9.6, T-008). The one OPERATIONAL site-scoped
--     table this foundation owns. from_site_id/to_site_id are hard FKs to public.sites (the FK target
--     this module ships). site_id is the day-1 nullable scoping column (its own composite (org_id,
--     site_id) index per §9.9). cost_allocation_method CHECK + DEFAULT 'receiver' (D-MS-11).
--     RLS org+site via app.current_org_id() AND app.current_site_id() (REC-L1: ALL-sites when
--     app.current_site_id() IS NULL).
-- ===========================================================================
create table if not exists public.inter_site_transfer_orders (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  site_id                     uuid,  -- day-1 nullable scoping column (originating site); T-030 backfill

  to_number                   text not null,
  status                      text not null default 'draft',

  from_site_id                uuid references public.sites(id) on delete restrict,
  to_site_id                  uuid references public.sites(id) on delete restrict,

  transfer_cost               numeric(18, 2),  -- money: NUMERIC-exact (never float)
  cost_allocation_method      text not null default 'receiver',

  expected_arrival_at         timestamptz,
  shipped_at                  timestamptz,
  actual_arrival_at           timestamptz,

  -- dual cross-site manager-approval refs (audit_events.id soft refs; D-MS-11). NULL = not approved.
  from_site_manager_approval_id uuid,
  to_site_manager_approval_id   uuid,

  notes                       text,
  ext_jsonb                   jsonb not null default '{}'::jsonb,

  created_by                  uuid references public.users(id) on delete set null,
  updated_by                  uuid references public.users(id) on delete set null,
  created_at                  timestamptz not null default pg_catalog.now(),
  updated_at                  timestamptz not null default pg_catalog.now(),

  constraint inter_site_transfer_orders_org_to_number_uq unique (org_id, to_number),
  constraint inter_site_transfer_orders_status_check check (
    status in ('draft', 'approved', 'shipped', 'in_transit', 'received', 'cancelled')
  ),
  constraint inter_site_transfer_orders_cost_alloc_check check (
    cost_allocation_method in ('sender', 'receiver', 'split', 'none')
  ),
  constraint inter_site_transfer_orders_transfer_cost_nonneg_check check (
    transfer_cost is null or transfer_cost >= 0
  )
);

-- §9.9 mandatory composite for site-scoped reads (planner must hit (org_id, site_id)).
create index if not exists idx_ist_org_site
  on public.inter_site_transfer_orders (org_id, site_id);
create index if not exists inter_site_transfer_orders_org_idx
  on public.inter_site_transfer_orders (org_id);
create index if not exists inter_site_transfer_orders_from_site_idx
  on public.inter_site_transfer_orders (from_site_id) where from_site_id is not null;
create index if not exists inter_site_transfer_orders_to_site_idx
  on public.inter_site_transfer_orders (to_site_id) where to_site_id is not null;
create index if not exists inter_site_transfer_orders_status_idx
  on public.inter_site_transfer_orders (org_id, status);

alter table public.inter_site_transfer_orders enable row level security;
alter table public.inter_site_transfer_orders force row level security;

-- Org + site scope. app.current_site_id() IS NULL = super_admin ALL-sites mode (V-MS-07); otherwise
-- a row is visible when its site_id matches the bound site OR is still NULL (day-1 pre-backfill).
drop policy if exists inter_site_transfer_orders_site_scope on public.inter_site_transfer_orders;
create policy inter_site_transfer_orders_site_scope
  on public.inter_site_transfer_orders
  for all
  to app_user
  using (
    org_id = app.current_org_id()
    and (app.current_site_id() is null or site_id is null or site_id = app.current_site_id())
  )
  with check (
    org_id = app.current_org_id()
    and (app.current_site_id() is null or site_id is null or site_id = app.current_site_id())
  );

revoke all on public.inter_site_transfer_orders from public;
revoke all on public.inter_site_transfer_orders from app_user;
grant select, insert, update, delete on public.inter_site_transfer_orders to app_user;

create or replace function public.inter_site_transfer_orders_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists inter_site_transfer_orders_set_updated_at on public.inter_site_transfer_orders;
create trigger inter_site_transfer_orders_set_updated_at
  before update on public.inter_site_transfer_orders
  for each row execute function public.inter_site_transfer_orders_set_updated_at();

-- ===========================================================================
-- (E) Outbox event CHECK — drop + recreate with the FULL vocabulary (198's list + the 5 new
--     14-multi-site events). The enum<->CHECK drift gate (packages/outbox check-drift.test.ts) asserts
--     THIS (now highest-numbered) migration's CHECK string set === DB_EVENT_TYPES, so the list below
--     MUST stay byte-aligned with events.enum.ts (EventType ∪ LegacyEventAlias keys). Strict superset
--     of 198 — no event dropped.
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
      'quality.hold.created',
      'quality.hold.released',
      'quality.ncr.assigned',
      'quality.ncr.closed',
      'quality.ncr.critical_dual_signed',
      'quality.ncr.opened',
      'quality.ncr.submitted',
      'quality.ncr.updated',
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
      'transfer_order.in_transit',
      'transfer_order.received',
      'transfer_order.shipped',
      'transport_lane.created',
      'transport_lane_rate_card.activated',
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
  is 'Regenerated from events.enum.ts DB_EVENT_TYPES (139 types incl 14-multi-site transfer_order.* / transport_lane.*).';

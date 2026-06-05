-- Migration 199: 10-Finance — SCHEMA foundation + outbox CHECK regen + RBAC seed.
--
-- (A) Finance core schema: standard_costs (T-009), wo_actual_costing (T-015, READ-only soft ref
--     to canonical 08-production wo_outputs — NEVER writes wo_outputs), inventory_cost_layers /
--     item_wac_state / cost_variances (T-021 FIFO/WAC valuation + variance), finance_outbox_events
--     / d365_finance_dlq (T-027 D365 stage-5 export-only, R15). All org-scoped, RLS enabled+FORCED
--     via app.current_org_id(), audit triggers, FK indexes, NUMERIC-exact money/qty.
-- (B) Outbox event CHECK regen — admit the 5 finance.* events into the highest-numbered migration's
--     outbox_events_event_type_check so the enum<->CHECK drift gate stays green (strict superset of
--     189/192 + 5 finance + the planning-ext scheduler set if present is NOT added here — 199 only
--     adds finance; see note below).
-- (C) finance.* RBAC permission family seed to the org-admin role family + a finance operator role
--     family, in BOTH role_permissions (normalized) and roles.permissions (legacy jsonb) + AFTER
--     INSERT trigger + full backfill (model migs 149/154/185/192 — the #1 403-everywhere fix).
--
-- PRD: docs/prd/10-FINANCE-PRD.md §3 (RBAC), §5 (standard cost), §6 (D365 stage-5 R15), §7
--      (WO actual costing + FIFO/WAC + variance), §12 (events).
-- Tasks: T-001 (fin.* permission enum) + T-009 + T-015 + T-021 + T-027 + the recurring-live-bug
--        RBAC-seed P0 (class 1).
-- Canonical permission strings: packages/rbac/src/permissions.enum.ts (ALL_FINANCE_PERMISSIONS).
-- Canonical event strings: packages/outbox/src/events.enum.ts (ALL_FINANCE_EVENTS / DB_EVENT_TYPES).
--
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id()
--   (foundation function, migration 002-rls-baseline.sql — never redefined, never read as a raw
--   current_setting GUC).
-- site_id day-1: site_id uuid is NULLABLE, no FK, no registry — full per-site scoping
--   ((org_id, site_id) NOT NULL + app.current_site_id() policy) lands later via 14-MS T-030.
-- NUMERIC-exact: money NUMERIC(18,4), unit cost NUMERIC(18,6), quantity/kg NUMERIC(14,3),
--   percent NUMERIC(8,2). NEVER float.
-- Canonical-owner separation: this migration creates ONLY finance-owned tables. It does NOT create
--   or write wo_outputs / oee_snapshots / downtime_events (08-production), schedule_outputs
--   (04-planning), license_plates (05-warehouse), item_cost_history (03-technical, dual-owned),
--   or quality_holds / ncr_reports (09-quality). All cross-module identities are SOFT uuids.

-- ===========================================================================
-- (A1) standard_costs — versioned target cost per item (T-009, FIN §5).
-- ===========================================================================
create table if not exists public.standard_costs (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.organizations(id) on delete cascade,
  site_id                   uuid,

  item_id                   uuid not null,            -- soft FK to 03-Technical items
  currency_id               uuid not null,            -- soft FK to 10-Finance currencies

  version                   integer not null default 1,

  material_cost             numeric(18, 4) not null default 0,
  labour_cost               numeric(18, 4) not null default 0,
  overhead_cost             numeric(18, 4) not null default 0,
  total_cost                numeric(18, 4) not null default 0,

  effective_from            timestamptz not null default pg_catalog.now(),
  effective_to              timestamptz,

  status                    text not null default 'draft',

  approved_by               uuid references public.users(id) on delete set null,
  approved_at               timestamptz,
  approval_signature_sha256 text,

  ext_jsonb                 jsonb not null default '{}'::jsonb,

  created_by                uuid references public.users(id) on delete set null,
  updated_by                uuid references public.users(id) on delete set null,
  created_at                timestamptz not null default pg_catalog.now(),
  updated_at                timestamptz not null default pg_catalog.now(),

  constraint standard_costs_org_item_currency_version_uq
    unique (org_id, item_id, currency_id, version),
  constraint standard_costs_status_check
    check (status in ('draft', 'approved', 'superseded', 'archived')),
  constraint standard_costs_version_positive_check check (version >= 1),
  constraint standard_costs_total_nonneg_check check (total_cost >= 0)
);

create index if not exists standard_costs_org_idx       on public.standard_costs (org_id);
create index if not exists standard_costs_org_site_idx  on public.standard_costs (org_id, site_id);
create index if not exists standard_costs_org_item_idx  on public.standard_costs (org_id, item_id);

-- ===========================================================================
-- (A2) wo_actual_costing — realized cost per WO (T-015, FIN §7). READS canonical 08-production
--      wo_outputs via SOFT wo_output_id uuid; NEVER writes wo_outputs.
-- ===========================================================================
create table if not exists public.wo_actual_costing (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  site_id             uuid,

  wo_id               uuid not null,                  -- soft FK to 08-Production work_orders
  wo_output_id        uuid,                           -- soft READ-only ref to 08-Production wo_outputs
  item_id             uuid,                           -- soft FK to 03-Technical items
  currency_id         uuid not null,                  -- soft FK to currencies

  output_qty_kg       numeric(14, 3) not null default 0,

  material_cost       numeric(18, 4) not null default 0,
  labour_cost         numeric(18, 4) not null default 0,
  overhead_cost       numeric(18, 4) not null default 0,
  total_actual_cost   numeric(18, 4) not null default 0,

  status              text not null default 'open',
  closed_at           timestamptz,

  ext_jsonb           jsonb not null default '{}'::jsonb,

  created_by          uuid references public.users(id) on delete set null,
  updated_by          uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default pg_catalog.now(),
  updated_at          timestamptz not null default pg_catalog.now(),

  constraint wo_actual_costing_org_wo_currency_uq unique (org_id, wo_id, currency_id),
  constraint wo_actual_costing_status_check check (status in ('open', 'closed', 'reversed')),
  constraint wo_actual_costing_total_nonneg_check check (total_actual_cost >= 0)
);

create index if not exists wo_actual_costing_org_idx        on public.wo_actual_costing (org_id);
create index if not exists wo_actual_costing_org_site_idx   on public.wo_actual_costing (org_id, site_id);
create index if not exists wo_actual_costing_org_wo_idx     on public.wo_actual_costing (org_id, wo_id);
create index if not exists wo_actual_costing_wo_output_idx  on public.wo_actual_costing (wo_output_id)
  where wo_output_id is not null;

-- ===========================================================================
-- (A3) inventory_cost_layers — FIFO per-LP lot tracking (T-021, FIN §7). Soft READ-only ref to
--      05-warehouse license_plates. Partial index where NOT exhausted is query-plan-load-bearing.
-- ===========================================================================
create table if not exists public.inventory_cost_layers (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  site_id           uuid,

  item_id           uuid not null,                    -- soft FK to 03-Technical items
  license_plate_id  uuid,                             -- soft READ-only ref to 05-warehouse license_plates
  currency_id       uuid not null,                    -- soft FK to currencies

  source_type       text not null default 'po_receipt',
  receipt_date      timestamptz not null default pg_catalog.now(),

  qty_received_kg   numeric(14, 3) not null,
  qty_remaining_kg  numeric(14, 3) not null,
  unit_cost         numeric(18, 6) not null,
  total_value       numeric(18, 4) not null default 0,

  is_exhausted      boolean not null default false,

  ext_jsonb         jsonb not null default '{}'::jsonb,

  created_by        uuid references public.users(id) on delete set null,
  updated_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default pg_catalog.now(),
  updated_at        timestamptz not null default pg_catalog.now(),

  constraint inventory_cost_layers_source_type_check
    check (source_type in ('po_receipt', 'wo_output', 'adjustment', 'd365_import')),
  constraint inventory_cost_layers_qty_received_positive_check check (qty_received_kg > 0),
  -- No negative inventory (V-FIN-INV-04).
  constraint inventory_cost_layers_qty_remaining_nonneg_check check (qty_remaining_kg >= 0),
  constraint inventory_cost_layers_qty_remaining_le_received_check
    check (qty_remaining_kg <= qty_received_kg),
  constraint inventory_cost_layers_unit_cost_nonneg_check check (unit_cost >= 0)
);

create index if not exists inventory_cost_layers_org_idx       on public.inventory_cost_layers (org_id);
create index if not exists inventory_cost_layers_org_site_idx  on public.inventory_cost_layers (org_id, site_id);
create index if not exists inventory_cost_layers_org_item_idx  on public.inventory_cost_layers (org_id, item_id);
create index if not exists inventory_cost_layers_lp_idx        on public.inventory_cost_layers (license_plate_id)
  where license_plate_id is not null;
-- FIFO consume partial index (receipt_date ASC, only active layers) — §7 FIFO SLO depends on it.
create index if not exists inventory_cost_layers_fifo_consume_idx
  on public.inventory_cost_layers (org_id, item_id, currency_id, receipt_date asc)
  where is_exhausted = false;

-- ===========================================================================
-- (A4) item_wac_state — Weighted-Average Cost running state (T-021, FIN §7). avg_cost is GENERATED
--      ALWAYS AS (total_value / NULLIF(total_qty_kg, 0)) STORED. No negative inventory (V-FIN-INV-04).
-- ===========================================================================
create table if not exists public.item_wac_state (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  site_id       uuid,

  item_id       uuid not null,                        -- soft FK to 03-Technical items
  currency_id   uuid not null,                        -- soft FK to currencies

  total_qty_kg  numeric(14, 3) not null default 0,
  total_value   numeric(18, 4) not null default 0,
  avg_cost      numeric(18, 6)
    generated always as (
      case when total_qty_kg = 0 then 0
           else round(total_value / total_qty_kg, 6)
      end
    ) stored,

  ext_jsonb     jsonb not null default '{}'::jsonb,

  updated_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default pg_catalog.now(),
  updated_at    timestamptz not null default pg_catalog.now(),

  constraint item_wac_state_org_item_currency_uq unique (org_id, item_id, currency_id),
  constraint item_wac_state_qty_nonneg_check check (total_qty_kg >= 0),
  constraint item_wac_state_value_nonneg_check check (total_value >= 0)
);

create index if not exists item_wac_state_org_idx       on public.item_wac_state (org_id);
create index if not exists item_wac_state_org_site_idx  on public.item_wac_state (org_id, site_id);

-- ===========================================================================
-- (A5) cost_variances — standard vs actual variance per (wo, category) (T-021, FIN §7).
--      variance_amount = actual - standard (GENERATED). Finalized variance is immutable (P1).
-- ===========================================================================
create table if not exists public.cost_variances (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  site_id           uuid,

  wo_id             uuid not null,                    -- soft FK to 08-Production work_orders
  item_id           uuid,                             -- soft FK to 03-Technical items
  currency_id       uuid not null,                    -- soft FK to currencies

  category          text not null,

  standard_amount   numeric(18, 4) not null default 0,
  actual_amount     numeric(18, 4) not null default 0,
  variance_amount   numeric(18, 4) generated always as (actual_amount - standard_amount) stored,
  variance_pct      numeric(8, 2),

  severity          text not null default 'info',
  status            text not null default 'open',
  finalized_at      timestamptz,

  ext_jsonb         jsonb not null default '{}'::jsonb,

  created_by        uuid references public.users(id) on delete set null,
  updated_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default pg_catalog.now(),
  updated_at        timestamptz not null default pg_catalog.now(),

  constraint cost_variances_org_wo_category_currency_uq
    unique (org_id, wo_id, category, currency_id),
  constraint cost_variances_category_check
    check (category in ('material', 'labour', 'overhead', 'yield', 'waste')),
  constraint cost_variances_severity_check check (severity in ('info', 'warn', 'critical')),
  constraint cost_variances_status_check check (status in ('open', 'finalized'))
);

create index if not exists cost_variances_org_idx       on public.cost_variances (org_id);
create index if not exists cost_variances_org_site_idx  on public.cost_variances (org_id, site_id);
create index if not exists cost_variances_org_wo_idx    on public.cost_variances (org_id, wo_id);

-- ===========================================================================
-- (A6) finance_outbox_events — D365 stage-5 EXPORT-ONLY parallel outbox namespace (T-027, FIN §6.4).
--      R15 anti-corruption: D365 is strictly export-only; these rows are NEVER an inbound source of
--      truth for any canonical Monopilot state. D365 IDs live only as optional d365_external_ids
--      metadata, never as a primary/RLS key. Idempotency key = UUID v7 (Foundation R14).
-- ===========================================================================
create table if not exists public.finance_outbox_events (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  site_id           uuid,

  event_type        text not null,
  idempotency_key   uuid not null,

  payload           jsonb not null default '{}'::jsonb,
  d365_external_ids jsonb not null default '{}'::jsonb,

  posting_date      timestamptz,
  gl_account        text,

  status            text not null default 'pending',
  attempts          integer not null default 0,
  last_error        text,
  processed_at      timestamptz,

  created_at        timestamptz not null default pg_catalog.now(),
  updated_at        timestamptz not null default pg_catalog.now(),

  constraint finance_outbox_events_org_idempotency_uq unique (org_id, idempotency_key),
  constraint finance_outbox_events_status_check
    check (status in ('pending', 'processing', 'sent', 'failed', 'dead_lettered'))
);

create index if not exists finance_outbox_events_org_idx         on public.finance_outbox_events (org_id);
create index if not exists finance_outbox_events_org_status_idx  on public.finance_outbox_events (org_id, status);
create index if not exists finance_outbox_events_consolidator_idx
  on public.finance_outbox_events (org_id, posting_date, gl_account);

-- ===========================================================================
-- (A7) d365_finance_dlq — dead-letter queue for permanent D365 export failures (T-027, FIN §6.4).
--      Permanent-error replay is admin-only (V-FIN-INT-05). Export-only (R15).
-- ===========================================================================
create table if not exists public.d365_finance_dlq (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  site_id         uuid,

  source_event_id uuid,                               -- soft ref to finance_outbox_events.id
  event_type      text not null,
  idempotency_key uuid not null,

  payload         jsonb not null default '{}'::jsonb,
  failure_reason  text,
  attempts        integer not null default 0,

  status          text not null default 'dead_lettered',
  resolved_by     uuid references public.users(id) on delete set null,
  resolved_at     timestamptz,

  created_at      timestamptz not null default pg_catalog.now(),
  updated_at      timestamptz not null default pg_catalog.now(),

  constraint d365_finance_dlq_org_idempotency_uq unique (org_id, idempotency_key),
  constraint d365_finance_dlq_status_check
    check (status in ('dead_lettered', 'replaying', 'resolved'))
);

create index if not exists d365_finance_dlq_org_idx          on public.d365_finance_dlq (org_id);
create index if not exists d365_finance_dlq_org_status_idx   on public.d365_finance_dlq (org_id, status);
create index if not exists d365_finance_dlq_source_event_idx on public.d365_finance_dlq (source_event_id)
  where source_event_id is not null;

-- ===========================================================================
-- RLS — ENABLE + FORCE; org isolation via app.current_org_id(); updated_at trigger.
-- R13 audit = audit COLUMNS (created_by/updated_by/created_at/updated_at) + updated_at trigger.
-- This repo has NO generic public.audit_event() / app.audit_event() row trigger (per planning
-- 176/177 + production 181 precedent — they note the same); mutating-action audit_events rows are
-- emitted by the Server-Action layer (Foundation T-040/R13), not a DB row trigger. A shared
-- updated_at helper (define once, reuse for all 7 finance tables).
-- ===========================================================================
create or replace function public.finance_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

do $$
declare
  v_table text;
  v_tables text[] := array[
    'standard_costs', 'wo_actual_costing', 'inventory_cost_layers',
    'item_wac_state', 'cost_variances', 'finance_outbox_events', 'd365_finance_dlq'
  ];
begin
  foreach v_table in array v_tables loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);

    execute format('drop policy if exists %I on public.%I', v_table || '_org_context', v_table);
    execute format(
      'create policy %I on public.%I for all to app_user '
      'using (org_id = app.current_org_id()) with check (org_id = app.current_org_id())',
      v_table || '_org_context', v_table
    );

    execute format('revoke all on public.%I from public', v_table);
    execute format('revoke all on public.%I from app_user', v_table);
    execute format('grant select, insert, update, delete on public.%I to app_user', v_table);

    -- updated_at trigger
    execute format('drop trigger if exists %I on public.%I', v_table || '_set_updated_at', v_table);
    execute format(
      'create trigger %I before update on public.%I '
      'for each row execute function public.finance_set_updated_at()',
      v_table || '_set_updated_at', v_table
    );
  end loop;
end
$$;

-- ===========================================================================
-- (B) Outbox event CHECK regen — strict superset of the 192 list + the 5 finance.* events.
--     The drift gate (packages/outbox check-drift.test.ts) asserts THIS migration's CHECK string
--     set === DB_EVENT_TYPES. Migration 199 is the highest finance migration; if a later module
--     migration (e.g., planning-ext) regenerates the CHECK again it must include these finance.*
--     strings too. List below = 192's set + finance.* (alphabetically merged).
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
      'finance.consumption.valued',
      'finance.cost_per_kg.changed',
      'finance.standard_cost.approved',
      'finance.valuation.closed_monthly',
      'finance.variance.computed',
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
  is 'Regenerated from events.enum.ts DB_EVENT_TYPES (131 types incl finance.*).';

-- ===========================================================================
-- (C) finance.* RBAC permission seed.
--   ROOT CAUSE (403-everywhere class — same as 116/146/148/149/154/185/192): adding the fin.*
--   strings to the enum (T-001) grants NOBODY access. The deployed org administrator is on the
--   canonical org-admin role family, which receives NONE of the fin.* strings — so every finance
--   page/action 403s at live Gate-5.
--
--   This grants the COMPLETE fin.* set (14 strings) to the org-admin role family, and a
--   read/operate subset to a finance operator/analyst role family, in BOTH role_permissions
--   (normalized) AND roles.permissions (legacy jsonb cache), for every existing org, with an
--   AFTER INSERT trigger so new orgs inherit it. Operator role codes are matched defensively
--   across naming conventions; the grant is a no-op for any role code not present in an org.
-- ===========================================================================
create or replace function public.seed_finance_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  -- Complete fin.* family (PRD §3). Mirrors ALL_FINANCE_PERMISSIONS.
  v_all_perms text[] := array[
    'fin.settings.view',
    'fin.settings.edit',
    'fin.standard_cost.view',
    'fin.standard_cost.edit',
    'fin.standard_cost.approve',
    'fin.actual_cost.view',
    'fin.valuation.view',
    'fin.valuation.close',
    'fin.variance.view',
    'fin.variance.finalize',
    'fin.dashboard.view',
    'fin.reports.view',
    'fin.d365.view',
    'fin.d365_dlq.replay'
  ];
  -- Finance operator/analyst subset: reads everything + drafts standard costs + reads D365 export.
  -- NOT the elevated/SoD strings (standard_cost.approve, valuation.close, variance.finalize,
  -- d365_dlq.replay, settings.edit) — those stay admin-only.
  v_operator_perms text[] := array[
    'fin.settings.view',
    'fin.standard_cost.view',
    'fin.standard_cost.edit',
    'fin.actual_cost.view',
    'fin.valuation.view',
    'fin.variance.view',
    'fin.dashboard.view',
    'fin.reports.view',
    'fin.d365.view'
  ];
  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin'];
  v_operator_roles text[] := array[
    'finance_operator','finance_analyst','finance_clerk','finance','controller','cost_accountant'
  ];
begin
  -- --- Normalized storage (role_permissions) ---
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_all_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles))
  on conflict (role_id, permission) do nothing;

  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_operator_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_operator_roles) or r.slug = any(v_operator_roles))
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
   where r.org_id = p_org_id
     and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles));

  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select unnest(v_operator_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_operator_roles) or r.slug = any(v_operator_roles));
end;
$$;

revoke all on function public.seed_finance_permissions_for_org(uuid) from public;
revoke all on function public.seed_finance_permissions_for_org(uuid) from app_user;

create or replace function public.seed_finance_permissions_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_finance_permissions_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_finance_permissions_on_org_insert() from public;
revoke all on function public.seed_finance_permissions_on_org_insert() from app_user;

-- Fire after the 080 role-seeding trigger so the admin roles already exist (zzz prefix).
drop trigger if exists trg_zzz_seed_finance_permissions on public.organizations;
create trigger trg_zzz_seed_finance_permissions
  after insert on public.organizations
  for each row
  execute function public.seed_finance_permissions_on_org_insert();

-- Backfill every existing org.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_finance_permissions_for_org(v_org_id);
  end loop;
end
$$;

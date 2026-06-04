-- Migration 161: 03-Technical — allergen domain tables (T-004).
-- PRD: docs/prd/03-TECHNICAL-PRD.md §5.4, §10.1, §10.4, §10.5.
--
-- Three allergen-domain tables + an append-only override-history table:
--   1. public.item_allergen_profiles                       — per-item allergen profile (current state)
--   2. public.item_allergen_profile_overrides              — per-(item x allergen x actor x ts) override history
--   3. public.manufacturing_operation_allergen_additions   — process-added allergens
--   4. public.allergen_contamination_risk                  — cross-contamination risk matrix (line/machine)
--
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id().
-- site_id (day-1): operational tables carry site_id uuid NULL — no FK, no registry.
-- ADR-028 / V-TEC-40: allergen_code is TEXT with NO hard FK — soft reference to
--   Reference."Allergens" / reference_tables.allergens_reference (EU-14 + org custom).
-- EU FIC 1169/2011 framing; auto-cascaded badges are read-only; manual overrides are
--   additive with required reason + audit (override-history captures actor + ts per change).
-- Technical CONSUMES 01-NPD's materialized product.allergens / may_contain — this migration
--   only provides the TABLES. Cascade deployment (T-024) + CRUD (T-017/18/19) + UI are later waves.

-- ---------------------------------------------------------------------------
-- 1. item_allergen_profiles — per-item allergen profile (current state)
-- ---------------------------------------------------------------------------
create table if not exists public.item_allergen_profiles (
  org_id uuid not null references public.organizations(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  -- soft reference to Reference."Allergens".allergen_code (EU-14 + org custom). No hard FK (ADR-028).
  allergen_code text not null,
  source text not null,
  intensity text not null default 'contains',
  confidence text not null default 'declared',
  -- site_id day-1: present, NULL, no FK / no registry.
  site_id uuid,
  declared_by uuid references public.users(id) on delete restrict,
  declared_at timestamptz not null default pg_catalog.now(),
  manual_override_reason text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint item_allergen_profiles_pk primary key (org_id, item_id, allergen_code),
  constraint item_allergen_profiles_allergen_code_nonblank_check
    check (length(btrim(allergen_code)) > 0),
  constraint item_allergen_profiles_source_check
    check (source in ('brief_declared', 'supplier_spec', 'lab_result', 'cascaded', 'manual_override')),
  constraint item_allergen_profiles_intensity_check
    check (intensity in ('contains', 'may_contain', 'trace')),
  constraint item_allergen_profiles_confidence_check
    check (confidence in ('declared', 'tested', 'assumed')),
  -- V-TEC-42: a manual override must carry a non-empty reason.
  constraint item_allergen_profiles_override_reason_check
    check (
      source <> 'manual_override'
      or (manual_override_reason is not null and length(btrim(manual_override_reason)) > 0)
    )
);

-- FK indexes (org scope + item lookup + allergen lookup for cascade aggregation).
create index if not exists idx_item_allergen_profiles_org
  on public.item_allergen_profiles (org_id);
create index if not exists idx_item_allergen_profiles_item
  on public.item_allergen_profiles (org_id, item_id);
create index if not exists idx_item_allergen_profiles_allergen
  on public.item_allergen_profiles (org_id, allergen_code);
create index if not exists idx_item_allergen_profiles_declared_by
  on public.item_allergen_profiles (declared_by)
  where declared_by is not null;

alter table public.item_allergen_profiles enable row level security;
alter table public.item_allergen_profiles force row level security;

drop policy if exists item_allergen_profiles_org_isolation on public.item_allergen_profiles;
create policy item_allergen_profiles_org_isolation
  on public.item_allergen_profiles
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.item_allergen_profiles from public;
revoke all on public.item_allergen_profiles from app_user;
grant select, insert, update, delete on public.item_allergen_profiles to app_user;

create or replace function public.item_allergen_profiles_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists item_allergen_profiles_set_updated_at on public.item_allergen_profiles;
create trigger item_allergen_profiles_set_updated_at
  before update on public.item_allergen_profiles
  for each row execute function public.item_allergen_profiles_set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. item_allergen_profile_overrides — append-only override history
--    One immutable row per (item x allergen x actor x ts) override action so the
--    full manual-override trail is auditable (CFR 21 Part 11 framing). Current
--    state lives in item_allergen_profiles; this table is the additive ledger.
-- ---------------------------------------------------------------------------
create table if not exists public.item_allergen_profile_overrides (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  allergen_code text not null,
  -- The override action: how the badge moved (set/clear/adjust intensity, etc.).
  action text not null,
  -- The values applied by this override action.
  intensity text,
  confidence text,
  -- Required justification for the manual override (V-TEC-42).
  reason text not null,
  -- Actor + timestamp = the (actor x ts) half of the history grain.
  overridden_by uuid references public.users(id) on delete restrict,
  overridden_at timestamptz not null default pg_catalog.now(),
  site_id uuid,
  created_at timestamptz not null default pg_catalog.now(),

  constraint item_allergen_profile_overrides_allergen_code_nonblank_check
    check (length(btrim(allergen_code)) > 0),
  constraint item_allergen_profile_overrides_action_check
    check (action in ('set', 'clear', 'adjust_intensity', 'adjust_confidence')),
  constraint item_allergen_profile_overrides_intensity_check
    check (intensity is null or intensity in ('contains', 'may_contain', 'trace')),
  constraint item_allergen_profile_overrides_confidence_check
    check (confidence is null or confidence in ('declared', 'tested', 'assumed')),
  constraint item_allergen_profile_overrides_reason_nonblank_check
    check (length(btrim(reason)) > 0)
);

-- FK indexes + the per-(item x allergen) chronological override trail.
create index if not exists idx_item_allergen_profile_overrides_org
  on public.item_allergen_profile_overrides (org_id);
create index if not exists idx_item_allergen_profile_overrides_history
  on public.item_allergen_profile_overrides (org_id, item_id, allergen_code, overridden_at desc);
create index if not exists idx_item_allergen_profile_overrides_actor
  on public.item_allergen_profile_overrides (overridden_by)
  where overridden_by is not null;

alter table public.item_allergen_profile_overrides enable row level security;
alter table public.item_allergen_profile_overrides force row level security;

drop policy if exists item_allergen_profile_overrides_org_isolation on public.item_allergen_profile_overrides;
create policy item_allergen_profile_overrides_org_isolation
  on public.item_allergen_profile_overrides
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.item_allergen_profile_overrides from public;
revoke all on public.item_allergen_profile_overrides from app_user;
-- Append-only ledger: no update/delete grant (history is immutable).
grant select, insert on public.item_allergen_profile_overrides to app_user;

-- ---------------------------------------------------------------------------
-- 3. manufacturing_operation_allergen_additions — process-added allergens
--    manufacturing_operation_name aligns with Reference."ManufacturingOperations".row_key
--    (00-FOUNDATION §9.1) — soft reference, no hard FK.
-- ---------------------------------------------------------------------------
create table if not exists public.manufacturing_operation_allergen_additions (
  org_id uuid not null references public.organizations(id) on delete cascade,
  manufacturing_operation_name text not null,
  allergen_code text not null,
  reason text,
  site_id uuid,
  created_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint manufacturing_operation_allergen_additions_pk
    primary key (org_id, manufacturing_operation_name, allergen_code),
  constraint manufacturing_operation_allergen_additions_op_nonblank_check
    check (length(btrim(manufacturing_operation_name)) > 0),
  constraint manufacturing_operation_allergen_additions_allergen_code_nonblank_check
    check (length(btrim(allergen_code)) > 0)
);

create index if not exists idx_manufacturing_operation_allergen_additions_org
  on public.manufacturing_operation_allergen_additions (org_id);
create index if not exists idx_manufacturing_operation_allergen_additions_op
  on public.manufacturing_operation_allergen_additions (org_id, manufacturing_operation_name);
create index if not exists idx_manufacturing_operation_allergen_additions_allergen
  on public.manufacturing_operation_allergen_additions (org_id, allergen_code);

alter table public.manufacturing_operation_allergen_additions enable row level security;
alter table public.manufacturing_operation_allergen_additions force row level security;

drop policy if exists manufacturing_operation_allergen_additions_org_isolation
  on public.manufacturing_operation_allergen_additions;
create policy manufacturing_operation_allergen_additions_org_isolation
  on public.manufacturing_operation_allergen_additions
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.manufacturing_operation_allergen_additions from public;
revoke all on public.manufacturing_operation_allergen_additions from app_user;
grant select, insert, update, delete on public.manufacturing_operation_allergen_additions to app_user;

create or replace function public.mfg_op_allergen_additions_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists mfg_op_allergen_additions_set_updated_at
  on public.manufacturing_operation_allergen_additions;
create trigger mfg_op_allergen_additions_set_updated_at
  before update on public.manufacturing_operation_allergen_additions
  for each row execute function public.mfg_op_allergen_additions_set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. allergen_contamination_risk — cross-contamination risk matrix
--    line_id / machine_id reference 02-SETTINGS public.production_lines / machines
--    (hard FK — both tables exist as of migration 042). allergen_code stays soft.
-- ---------------------------------------------------------------------------
create table if not exists public.allergen_contamination_risk (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  line_id uuid references public.production_lines(id) on delete cascade,
  machine_id uuid references public.machines(id) on delete cascade,
  allergen_code text not null,
  risk_level text not null,
  mitigation text,
  site_id uuid,
  last_assessed_at timestamptz,
  assessed_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint allergen_contamination_risk_allergen_code_nonblank_check
    check (length(btrim(allergen_code)) > 0),
  constraint allergen_contamination_risk_risk_level_check
    check (risk_level in ('high', 'medium', 'low', 'segregated')),
  -- A risk row must target a line and/or a machine.
  constraint allergen_contamination_risk_target_check
    check (line_id is not null or machine_id is not null)
);

create index if not exists idx_allergen_contamination_risk_org
  on public.allergen_contamination_risk (org_id);
create index if not exists idx_allergen_contamination_risk_line
  on public.allergen_contamination_risk (line_id)
  where line_id is not null;
create index if not exists idx_allergen_contamination_risk_machine
  on public.allergen_contamination_risk (machine_id)
  where machine_id is not null;
create index if not exists idx_allergen_contamination_risk_allergen
  on public.allergen_contamination_risk (org_id, allergen_code);
create index if not exists idx_allergen_contamination_risk_assessed_by
  on public.allergen_contamination_risk (assessed_by)
  where assessed_by is not null;

alter table public.allergen_contamination_risk enable row level security;
alter table public.allergen_contamination_risk force row level security;

drop policy if exists allergen_contamination_risk_org_isolation on public.allergen_contamination_risk;
create policy allergen_contamination_risk_org_isolation
  on public.allergen_contamination_risk
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.allergen_contamination_risk from public;
revoke all on public.allergen_contamination_risk from app_user;
grant select, insert, update, delete on public.allergen_contamination_risk to app_user;

create or replace function public.allergen_contamination_risk_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists allergen_contamination_risk_set_updated_at on public.allergen_contamination_risk;
create trigger allergen_contamination_risk_set_updated_at
  before update on public.allergen_contamination_risk
  for each row execute function public.allergen_contamination_risk_set_updated_at();

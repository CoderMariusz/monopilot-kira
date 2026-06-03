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

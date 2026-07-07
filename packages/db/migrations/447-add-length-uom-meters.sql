-- Migration 447: R3.1 — extend unit_of_measure with length category (m, cm).
-- Wave0: org_id business scope. RLS via app.current_org_id().
-- Mirrors migration 064 seed/backfill pattern: update seed function + backfill all orgs.

-- ============================================================
-- 1. Extend category CHECK to include length
-- ============================================================
alter table public.unit_of_measure
  drop constraint if exists unit_of_measure_category_check;

alter table public.unit_of_measure
  add constraint unit_of_measure_category_check
  check (category in ('mass', 'volume', 'count', 'length'));

comment on table public.unit_of_measure
  is 'T-073: per-org units of measure (mass/volume/count/length) used across recipes, stock, shipping.';

-- ============================================================
-- 2. Seed function — add length (base: m) + cm; idempotent ON CONFLICT
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
    (p_org_id, 'count', 'pallet', 'Pallet', 1,   false),
    -- length (base: m)
    (p_org_id, 'length', 'm',  'Metre',      1,    true),
    (p_org_id, 'length', 'cm', 'Centimetre', 0.01, false)
  on conflict (org_id, code) do nothing;
end;
$$;

-- ============================================================
-- 3. Backfill length units for all existing orgs (idempotent)
-- ============================================================
do $$
declare v_org record;
begin
  for v_org in select id from public.organizations loop
    perform public.seed_units_of_measure_for_org(v_org.id);
  end loop;
end
$$;

-- ============================================================
-- 4. Canonicalize pre-existing m/cm rows (unique key is (org_id, code), so an
--    org that created 'm'/'cm' under another category made the seed's
--    ON CONFLICT DO NOTHING skip the canonical length row — upsert them here).
-- ============================================================
do $$
declare v_count int;
begin
  update public.unit_of_measure
     set category = 'length',
         name = case code when 'm' then 'Metre' else 'Centimetre' end,
         factor_to_base = case code when 'm' then 1 else 0.01 end,
         is_base = (code = 'm')
   where code in ('m', 'cm')
     and (category is distinct from 'length'
          or factor_to_base is distinct from (case code when 'm' then 1 else 0.01 end)
          or is_base is distinct from (code = 'm'));
  get diagnostics v_count = row_count;
  raise notice 'migration 447: canonicalized % pre-existing m/cm rows', v_count;
end
$$;

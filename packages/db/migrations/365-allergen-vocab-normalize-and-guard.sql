-- Migration 365 — allergen vocabulary normalization + canonical-code guard (food-safety data integrity).
--
-- Problem (owner-confirmed): the item-detail nutrition tab (upsert-nutrition.ts) stored the EU-14 NUMERIC
-- codes ('A01'..'A14') into "Reference"."RawMaterials".allergens_inherited, while item_allergen_profiles got
-- the canonical SEMANTIC codes ('gluten','milk',…). The NPD nutrition compute copies allergens_inherited
-- verbatim into nutrition_allergens.allergen_code, so non-canonical codes propagate and never resolve against
-- "Reference"."Allergens" (the org-scoped EU-14 master with semantic allergen_code). Live audit found exactly:
--   "Reference"."RawMaterials".allergens_inherited : 'A01', 'soya'   (1 row each)
--   public.nutrition_allergens.allergen_code        : 'A01'          (1 row)
-- Everything else is already canonical. Allergen mislabel / under-declaration is a food-safety risk.
--
-- This migration:
--   1. adds public.normalize_allergen_code(text) — maps the EU-14 numeric scheme + common aliases (soya/soy)
--      to the canonical "Reference"."Allergens".allergen_code vocabulary; passes canonical/unknown through
--      lower-trimmed (the guard then rejects genuinely-unknown codes).
--   2. normalizes the existing contaminated rows (idempotent; dedupes array members).
--   3. installs a BEFORE INSERT/UPDATE guard on "Reference"."RawMaterials" that normalizes allergens_inherited
--      and REJECTS any element that is still not a recognised Reference.Allergens code for the org. The guard
--      is FORGIVING for known numeric/alias codes (it normalizes them, so the currently-deployed upsert writer
--      which still sends 'A0x' keeps working) and STRICT for genuinely-unknown codes.
--
-- Rollback:
--   drop trigger if exists reference_rawmaterials_normalize_allergens_trg on "Reference"."RawMaterials";
--   drop function if exists public.reference_rawmaterials_normalize_allergens();
--   drop function if exists public.normalize_allergen_code(text);

-- 1. canonical normalizer (immutable; no table access so it stays IMMUTABLE).
create or replace function public.normalize_allergen_code(p_code text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  select case lower(btrim(coalesce(p_code, '')))
    when 'a01' then 'gluten'
    when 'a02' then 'crustaceans'
    when 'a03' then 'eggs'
    when 'a04' then 'fish'
    when 'a05' then 'peanuts'
    when 'a06' then 'soybeans'
    when 'a07' then 'milk'
    when 'a08' then 'nuts'
    when 'a09' then 'celery'
    when 'a10' then 'mustard'
    when 'a11' then 'sesame'
    when 'a12' then 'sulphites'
    when 'a13' then 'lupin'
    when 'a14' then 'molluscs'
    when 'soya' then 'soybeans'
    when 'soy' then 'soybeans'
    else lower(btrim(coalesce(p_code, '')))
  end
$function$;

-- 2a. normalize the existing "Reference"."RawMaterials".allergens_inherited arrays (dedupe; only touch rows
--     that actually change).
update "Reference"."RawMaterials" rm
   set allergens_inherited = coalesce((
     select array_agg(distinct public.normalize_allergen_code(e))
     from unnest(rm.allergens_inherited) e
     where nullif(btrim(e), '') is not null
   ), '{}')
 where rm.allergens_inherited is not null
   and exists (
     select 1 from unnest(rm.allergens_inherited) e
     where public.normalize_allergen_code(e) is distinct from e
   );

-- 2b. Collapse collisions BEFORE normalizing, then normalize the survivors. Unique key is
--     (org_id, product_code, formulation_version_id, allergen_code) NULLS NOT DISTINCT. Within each
--     (org, product, formulation_version) group, ANY two rows that normalize to the SAME canonical code
--     would collide once normalized — this covers BOTH a non-canonical row vs a pre-existing canonical twin
--     AND two different non-canonical rows mapping to the same canonical (e.g. 'A06' and 'soya' -> soybeans).
--     Keep one deterministic survivor (lowest id) per (group, normalized-code); delete the rest.
delete from public.nutrition_allergens na
 using public.nutrition_allergens keep
 where na.org_id = keep.org_id
   and na.product_code = keep.product_code
   and na.formulation_version_id is not distinct from keep.formulation_version_id
   and public.normalize_allergen_code(na.allergen_code) = public.normalize_allergen_code(keep.allergen_code)
   and na.id > keep.id;

-- After the collapse every (group, normalized-code) has exactly one row, so normalizing cannot collide.
update public.nutrition_allergens na
   set allergen_code = public.normalize_allergen_code(na.allergen_code)
 where public.normalize_allergen_code(na.allergen_code) is distinct from na.allergen_code;

-- 3. guard trigger on the producer source: normalize on write, reject genuinely-unknown codes.
create or replace function public.reference_rawmaterials_normalize_allergens()
returns trigger
language plpgsql
set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_unknown text;
begin
  if new.allergens_inherited is not null then
    new.allergens_inherited := coalesce((
      select array_agg(distinct public.normalize_allergen_code(e))
      from unnest(new.allergens_inherited) e
      where nullif(btrim(e), '') is not null
    ), '{}');

    select nc into v_unknown
    from unnest(new.allergens_inherited) nc
    where not exists (
      select 1 from "Reference"."Allergens" a
      where a.org_id = new.org_id
        and a.allergen_code = nc
    )
    limit 1;

    if v_unknown is not null then
      raise exception 'allergen code "%" is not a recognised Reference.Allergens code for org %', v_unknown, new.org_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists reference_rawmaterials_normalize_allergens_trg on "Reference"."RawMaterials";
create trigger reference_rawmaterials_normalize_allergens_trg
  before insert or update on "Reference"."RawMaterials"
  for each row execute function public.reference_rawmaterials_normalize_allergens();

-- 343: fa_allergen_cascade now ALSO derives allergens from the FG's RECIPE
-- (formulation_ingredients.allergens_inherited), additively alongside the legacy
-- product.ingredient_codes (rm_confirmed/rm_may_contain) + prod_detail process
-- paths. Root cause it fixes: NPD finished goods (e.g. FG-NPD-002) showed
-- "No allergen data" because their allergens live on the locked recipe, not on
-- product.ingredient_codes (which is NULL until the FA Core tab is filled, and
-- the FG often has no public.items row yet — the product↔items split). The
-- recipe path traverses formulations.current_version_id → formulation_ingredients
-- directly by product_code, so it works regardless of items materialization.
--
-- Output columns (derived/published/may_contain/conditional_process_allergens),
-- override semantics, and security_invoker=true (org RLS via caller) are all
-- preserved. CREATE OR REPLACE VIEW = idempotent.
create or replace view public.fa_allergen_cascade
with (security_invoker = true) as
with rm_confirmed as (
  select p_1.product_code, p_1.org_id, rm.allergen_code
  from product p_1
    cross join lateral regexp_split_to_table(coalesce(p_1.ingredient_codes, ''::text), '\s*,\s*'::text) parsed(ingredient_code)
    join "Reference"."Allergens_by_RM" rm on rm.org_id = p_1.org_id and rm.ingredient_codes = btrim(parsed.ingredient_code) and rm.confidence = 'confirmed'::text
  where btrim(parsed.ingredient_code) <> ''::text
), rm_may_contain as (
  select p_1.product_code, p_1.org_id, rm.allergen_code
  from product p_1
    cross join lateral regexp_split_to_table(coalesce(p_1.ingredient_codes, ''::text), '\s*,\s*'::text) parsed(ingredient_code)
    join "Reference"."Allergens_by_RM" rm on rm.org_id = p_1.org_id and rm.ingredient_codes = btrim(parsed.ingredient_code) and (rm.confidence = any (array['may_contain'::text, 'trace'::text]))
  where btrim(parsed.ingredient_code) <> ''::text
), process_confirmed as (
  select distinct pd.product_code, pd.org_id, ap.allergen_code
  from prod_detail pd
    cross join lateral (values (pd.manufacturing_operation_1), (pd.manufacturing_operation_2), (pd.manufacturing_operation_3), (pd.manufacturing_operation_4)) ops(process_name)
    join "Reference"."Allergens_added_by_Process" ap on ap.org_id = pd.org_id and ap.process_name = ops.process_name and ap.confidence = 'confirmed'::text
  where ops.process_name is not null
), process_conditional as (
  select distinct pd.product_code, pd.org_id, ap.allergen_code
  from prod_detail pd
    cross join lateral (values (pd.manufacturing_operation_1), (pd.manufacturing_operation_2), (pd.manufacturing_operation_3), (pd.manufacturing_operation_4)) ops(process_name)
    join "Reference"."Allergens_added_by_Process" ap on ap.org_id = pd.org_id and ap.process_name = ops.process_name and ap.confidence = 'conditional'::text
  where ops.process_name is not null
), recipe_confirmed as (
  -- NEW: allergens carried by the product's current/locked recipe ingredients.
  select f.product_code, f.org_id, btrim(a.allergen_code) as allergen_code
  from formulations f
    join formulation_versions fv on fv.id = coalesce(f.current_version_id,
        (select fv2.id from formulation_versions fv2 where fv2.formulation_id = f.id order by fv2.version_number desc limit 1))
    join formulation_ingredients fi on fi.version_id = fv.id
    cross join lateral unnest(coalesce(fi.allergens_inherited, '{}'::text[])) as a(allergen_code)
  where btrim(coalesce(a.allergen_code, '')) <> ''::text
), confirmed as (
  select product_code, org_id, allergen_code from rm_confirmed
  union select product_code, org_id, allergen_code from process_confirmed
  union select product_code, org_id, allergen_code from recipe_confirmed
), current_overrides as (
  select distinct on (o.org_id, o.product_code, o.allergen_code) o.product_code, o.org_id, o.allergen_code, o.action
  from fa_allergen_overrides o
  where o.superseded_at is null
  order by o.org_id, o.product_code, o.allergen_code, o.created_at desc, o.id desc
), published_candidates as (
  select product_code, org_id, allergen_code from confirmed
  union select product_code, org_id, allergen_code from current_overrides where action = 'add'::fa_allergen_override_action
), published as (
  select pc.product_code, pc.org_id, pc.allergen_code
  from published_candidates pc
  where not (exists (select 1 from current_overrides co where co.org_id = pc.org_id and co.product_code = pc.product_code and co.allergen_code = pc.allergen_code and co.action = 'remove'::fa_allergen_override_action))
), may_contain_raw as (
  select product_code, org_id, allergen_code from rm_may_contain
  union select product_code, org_id, allergen_code from process_conditional
)
select product_code, org_id,
  coalesce((select array_agg(distinct c.allergen_code order by c.allergen_code) from confirmed c where c.product_code = p.product_code and c.org_id = p.org_id), '{}'::text[]) as derived_allergens,
  coalesce((select array_agg(distinct pub.allergen_code order by pub.allergen_code) from published pub where pub.product_code = p.product_code and pub.org_id = p.org_id), '{}'::text[]) as published_allergens,
  coalesce((select array_agg(distinct mc.allergen_code order by mc.allergen_code) from may_contain_raw mc where mc.product_code = p.product_code and mc.org_id = p.org_id and not (exists (select 1 from published pub2 where pub2.org_id = mc.org_id and pub2.product_code = mc.product_code and pub2.allergen_code = mc.allergen_code))), '{}'::text[]) as may_contain_allergens,
  coalesce((select array_agg(distinct cp.allergen_code order by cp.allergen_code) from process_conditional cp where cp.product_code = p.product_code and cp.org_id = p.org_id), '{}'::text[]) as conditional_process_allergens
from product p;

-- 490 — P1-09: RM-BUTTER regulatory reference seed (Milk allergen + fat/saturates nutrition)
--
-- Audit finding P1-09: raw material RM-BUTTER contributed neither the Milk allergen
-- nor fat/saturates nutrition into formulations, because it had NO row in
-- "Reference"."RawMaterials" (the source the formulation allergen/nutrition cascade reads
-- via load-recipe-cascade / recompute) and no Milk row in item_allergen_profiles.
--
-- This seeds the missing reference data for the Apex 22 org (…0002). Idempotent:
-- re-running upserts the RawMaterials row and no-ops the allergen profile.
-- Nutrition per 100 g uses standard unsalted-butter reference values (string-typed to
-- match the existing RawMaterials.nutrition_per_100g shape, e.g. RM-BEEF-50).

-- 1) Raw material reference record (source of the formulation cascade)
insert into "Reference"."RawMaterials"
  (org_id, rm_code, display_name, nutrition_per_100g, allergens_inherited, created_at, schema_version)
values (
  '00000000-0000-0000-0000-000000000002'::uuid,
  'RM-BUTTER',
  'Butter',
  '{"fat_g": "81.0", "salt_g": "0.02", "carbs_g": "0.6", "sugars_g": "0.6", "energy_kj": "3015", "protein_g": "0.9", "saturates_g": "51.0"}'::jsonb,
  '{milk}'::text[],
  now(),
  1
)
on conflict (org_id, rm_code) do update
  set nutrition_per_100g = excluded.nutrition_per_100g,
      allergens_inherited = excluded.allergens_inherited;

-- 2) Item-level allergen profile (item detail view + item-scoped cascade)
insert into public.item_allergen_profiles
  (org_id, item_id, allergen_code, source, intensity, confidence, declared_at, created_at, updated_at)
select i.org_id, i.id, 'milk', 'brief_declared', 'contains', 'declared', now(), now(), now()
  from public.items i
 where i.item_code = 'RM-BUTTER'
   and i.org_id = '00000000-0000-0000-0000-000000000002'::uuid
on conflict (org_id, item_id, allergen_code) do nothing;

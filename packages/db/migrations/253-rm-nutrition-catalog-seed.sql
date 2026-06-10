-- Migration 253: seed Reference.RawMaterials nutrition for the 33-item demo catalog.
--
-- Root cause (live, 2026-06-10): the NPD nutrition compute reads
-- "Reference"."RawMaterials".nutrition_per_100g by rm_code, but the table was
-- created (mig 107) with NO rows — every nutrient summed to zero and NutriScore
-- graded all-zero inputs. The catalog items (mig 249) live only in public.items.
-- This seeds realistic literature per-100g values for the demo org so the
-- nutrition panel and NutriScore compute on real numbers. Idempotent: upsert by
-- (org_id, rm_code) refreshes values on re-run.
--
-- Nutrient codes match "Reference"."Nutrients" (mig 086):
--   energy_kj, fat_g, saturates_g, carbs_g, sugars_g, protein_g, salt_g.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().

insert into "Reference"."RawMaterials"
  (org_id, rm_code, display_name, nutrition_per_100g, allergens_inherited)
select
  '00000000-0000-0000-0000-000000000002'::uuid,
  v.rm_code,
  v.display_name,
  jsonb_build_object(
    'energy_kj',  v.energy_kj::text,
    'fat_g',      v.fat_g::text,
    'saturates_g', v.saturates_g::text,
    'carbs_g',    v.carbs_g::text,
    'sugars_g',   v.sugars_g::text,
    'protein_g',  v.protein_g::text,
    'salt_g',     v.salt_g::text
  ),
  v.allergens::text[]
from (values
  -- rm_code, display_name, protein, fat, saturates, carbs, sugars, salt, energy_kj, allergens
  ('RM-BEEF-80',    'Beef trim 80VL (lean)',        20.5,  5.0,  2.0,  0.0,  0.0,  0.07,  530, '{}'),
  ('RM-BEEF-50',    'Beef trim 50VL',               16.0, 13.0,  5.5,  0.0,  0.0,  0.06,  730, '{}'),
  ('RM-BEEF-MDM',   'Beef MDM',                     12.0, 18.0,  8.0,  0.0,  0.0,  0.08,  870, '{}'),
  ('RM-PORK-90',    'Pork trim 90VL (lean)',        22.0,  2.0,  0.7,  0.0,  0.0,  0.06,  450, '{}'),
  ('RM-PORK-70',    'Pork trim 70VL',               19.0,  8.0,  3.0,  0.0,  0.0,  0.06,  600, '{}'),
  ('RM-PORK-SHLD',  'Pork shoulder',                20.0,  7.0,  2.5,  0.0,  0.0,  0.07,  580, '{}'),
  ('RM-PORK-FAT',   'Pork back fat',                 2.5, 88.0, 32.0,  0.0,  0.0,  0.02, 3260, '{}'),
  ('RM-CHKN-BR',    'Chicken breast',               23.0,  1.5,  0.4,  0.0,  0.0,  0.07,  445, '{}'),
  ('RM-CHKN-MDM',   'Chicken MDM',                  14.0, 12.0,  3.5,  0.0,  0.0,  0.08,  660, '{}'),
  ('RM-WATER-ICE',  'Water / ice',                   0.0,  0.0,  0.0,  0.0,  0.0,  0.0,     0, '{}'),
  ('ING-CURE-SALT', 'Curing salt (nitrite)',         0.0,  0.0,  0.0,  0.0,  0.0, 39.0,     0, '{}'),
  ('ING-SEA-SALT',  'Sea salt',                      0.0,  0.0,  0.0,  0.0,  0.0, 39.0,     0, '{}'),
  ('ING-DEXTROSE',  'Dextrose',                      0.0,  0.0,  0.0, 99.5, 99.5,  0.0,  1590, '{}'),
  ('ING-STPP',      'Phosphate (STPP)',              0.0,  0.0,  0.0,  0.0,  0.0,  0.0,     0, '{}'),
  ('ING-ASCORBATE', 'Sodium ascorbate',              0.0,  0.0,  0.0,  0.0,  0.0,  0.0,     0, '{}'),
  ('ING-ERYTHORB',  'Sodium erythorbate',            0.0,  0.0,  0.0,  0.0,  0.0,  0.0,     0, '{}'),
  ('ING-MSG',       'Monosodium glutamate',          0.0,  0.0,  0.0,  0.0,  0.0, 12.0,     0, '{}'),
  ('ING-SUGAR',     'Sugar',                         0.0,  0.0,  0.0, 99.7, 99.7,  0.0,  1590, '{}'),
  ('SP-PEPPER-BLK', 'Black pepper',                 10.4,  3.3,  1.0, 64.0,  0.6,  0.04, 1330, '{}'),
  ('SP-PEPPER-WHT', 'White pepper',                 10.4,  2.1,  0.7, 68.0,  0.5,  0.01, 1340, '{}'),
  ('SP-GARLIC',     'Garlic powder',                16.0,  0.6,  0.2, 72.0,  1.0,  0.06, 1400, '{}'),
  ('SP-ONION',      'Onion powder',                  9.0,  0.5,  0.1, 79.0, 30.0,  0.08, 1390, '{}'),
  ('SP-PAPRIKA',    'Paprika',                      14.0, 13.0,  2.0, 54.0, 10.0,  0.04, 1640, '{}'),
  ('SP-NUTMEG',     'Nutmeg',                        5.8, 36.0, 26.0, 49.0,  2.9,  0.02, 2300, '{}'),
  ('SP-CORIANDER',  'Coriander',                    12.4, 17.8,  1.0, 55.0,  0.9,  0.04, 1800, '{}'),
  ('SP-MARJORAM',   'Marjoram',                     12.7,  7.0,  3.2, 61.0,  4.0,  0.08, 1440, '{}'),
  ('SP-MUSTARD',    'Mustard flour',                28.0, 33.0,  2.0, 16.0,  3.0,  0.04, 2000, '{mustard}'),
  ('FN-POTATO-ST',  'Potato starch',                 0.1,  0.1,  0.0, 83.0,  0.5,  0.0,  1430, '{}'),
  ('FN-SOY-ISO',    'Soy protein isolate',          90.0,  0.5,  0.1,  0.0,  0.0,  1.5,  1510, '{soya}'),
  ('FN-CARRAGEEN',  'Carrageenan',                   0.0,  0.0,  0.0, 80.0,  0.0,  4.0,  1300, '{}'),
  ('FN-SMOKE',      'Liquid smoke',                  0.0,  0.0,  0.0,  0.0,  0.0,  0.0,     0, '{}'),
  ('FN-CULTURE',    'Starter culture',              30.0,  5.0,  2.0, 10.0,  0.0,  1.0,   840, '{}'),
  ('FN-HOG-CASING', 'Hog casing',                   18.0,  4.0,  1.5,  0.0,  0.0,  3.0,   440, '{}')
) as v(rm_code, display_name, protein_g, fat_g, saturates_g, carbs_g, sugars_g, salt_g, energy_kj, allergens)
on conflict (org_id, rm_code) do update
  set display_name = excluded.display_name,
      nutrition_per_100g = excluded.nutrition_per_100g,
      allergens_inherited = excluded.allergens_inherited;

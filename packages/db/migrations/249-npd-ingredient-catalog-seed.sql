-- 249-npd-ingredient-catalog-seed.sql
--
-- Seed a realistic meat-industry ingredient catalog into public.items for the
-- canonical demo org (Apex 22 = 00000000-0000-0000-0000-000000000002).
--
-- WHY: the NPD recipe/formulation editor picks ingredients from the items master
-- (Lane-B ItemPicker → searchItems → public.items, RLS-scoped). Before this seed
-- the org had only 4 placeholder test rows with NO cost_per_kg, so a recipe could
-- not auto-fill any cost — every contribution was 0 and the whole costing v2 model
-- (qty/pack × cost/kg) was unusable. This populates a proper raw-material + additive
-- + spice + functional catalog with realistic EUR cost_per_kg and uom_base='kg' so
-- recipes immediately resolve real components with real costs.
--
-- All rows are REAL Supabase data read back via RLS — not app-side mocks.
--
-- Idempotent: ON CONFLICT (org_id, item_code) refreshes name / type / group / cost,
-- so re-running (or a later cost revision) is safe and never duplicates.

insert into public.items
  (org_id, item_code, item_type, name, description, status, product_group,
   uom_base, weight_mode, cost_per_kg)
select
  '00000000-0000-0000-0000-000000000002'::uuid as org_id,
  v.item_code, v.item_type, v.name, v.description, 'active', v.product_group,
  'kg', 'fixed', v.cost_per_kg
from (values
  -- ── Meats / raw materials (item_type = 'rm') ──────────────────────────────
  ('RM-BEEF-80',    'rm',         'Beef trim 80VL (lean)',          'Lean beef trimmings, 80% visual lean', 'meat',       6.20),
  ('RM-BEEF-50',    'rm',         'Beef trim 50VL',                 'Beef trimmings, 50% visual lean',      'meat',       4.10),
  ('RM-BEEF-MDM',   'rm',         'Beef MDM',                       'Mechanically deboned beef',            'meat',       1.45),
  ('RM-PORK-90',    'rm',         'Pork trim 90VL',                 'Lean pork trimmings, 90% visual lean', 'meat',       3.80),
  ('RM-PORK-70',    'rm',         'Pork trim 70VL',                 'Pork trimmings, 70% visual lean',      'meat',       2.90),
  ('RM-PORK-SHLD',  'rm',         'Pork shoulder',                  'Boneless pork shoulder',               'meat',       4.50),
  ('RM-PORK-FAT',   'rm',         'Pork back fat',                  'Trimmed pork back fat',                'meat',       1.60),
  ('RM-CHKN-BR',    'rm',         'Chicken breast',                 'Skinless chicken breast fillet',       'meat',       5.40),
  ('RM-CHKN-MDM',   'rm',         'Chicken MDM',                    'Mechanically deboned chicken',         'meat',       1.20),
  ('RM-WATER-ICE',  'rm',         'Water / ice',                    'Process water / flake ice',            'meat',       0.01),
  -- ── Curing / functional additives (item_type = 'ingredient') ──────────────
  ('ING-CURE-SALT', 'ingredient', 'Nitrite curing salt',           'Curing salt, 0.6% sodium nitrite',     'additive',   0.55),
  ('ING-SEA-SALT',  'ingredient', 'Sea salt (fine)',               'Fine food-grade sea salt',             'additive',   0.35),
  ('ING-DEXTROSE',  'ingredient', 'Dextrose',                      'Dextrose monohydrate',                 'additive',   1.10),
  ('ING-STPP',      'ingredient', 'Sodium tripolyphosphate',       'Phosphate binder (STPP, E451)',        'functional', 3.20),
  ('ING-ASCORBATE', 'ingredient', 'Sodium ascorbate',              'Cure accelerator / antioxidant (E301)','additive',   8.50),
  ('ING-ERYTHORB',  'ingredient', 'Sodium erythorbate',            'Cure accelerator (E316)',              'additive',   7.90),
  ('ING-MSG',       'ingredient', 'Monosodium glutamate',          'Flavour enhancer (E621)',              'additive',   4.80),
  ('ING-SUGAR',     'ingredient', 'Sugar',                         'Granulated sucrose',                   'additive',   1.00),
  -- ── Spices (item_type = 'ingredient') ─────────────────────────────────────
  ('SP-PEPPER-BLK', 'ingredient', 'Black pepper, ground',          'Ground black pepper',                  'spice',      9.80),
  ('SP-PEPPER-WHT', 'ingredient', 'White pepper, ground',          'Ground white pepper',                  'spice',     11.50),
  ('SP-GARLIC',     'ingredient', 'Garlic powder',                 'Dehydrated garlic powder',             'spice',      7.20),
  ('SP-ONION',      'ingredient', 'Onion powder',                  'Dehydrated onion powder',              'spice',      5.60),
  ('SP-PAPRIKA',    'ingredient', 'Paprika, sweet',                'Sweet ground paprika',                 'spice',      6.40),
  ('SP-NUTMEG',     'ingredient', 'Nutmeg, ground',                'Ground nutmeg',                        'spice',     14.00),
  ('SP-CORIANDER',  'ingredient', 'Coriander, ground',             'Ground coriander seed',                'spice',      6.80),
  ('SP-MARJORAM',   'ingredient', 'Marjoram, dried',               'Dried rubbed marjoram',                'spice',     12.50),
  ('SP-MUSTARD',    'ingredient', 'Mustard flour',                 'Yellow mustard flour',                 'spice',      4.30),
  -- ── Functional / binders / process aids (item_type = 'ingredient') ────────
  ('FN-POTATO-ST',  'ingredient', 'Potato starch',                 'Native potato starch binder',          'functional', 1.40),
  ('FN-SOY-ISO',    'ingredient', 'Soy protein isolate',           'Functional soy protein isolate',       'functional', 3.60),
  ('FN-CARRAGEEN',  'ingredient', 'Carrageenan',                   'Kappa carrageenan gelling agent',      'functional',13.00),
  ('FN-SMOKE',      'ingredient', 'Smoke flavour, liquid',         'Liquid smoke condensate',              'functional', 9.50),
  ('FN-CULTURE',    'ingredient', 'Lactic starter culture',        'Freeze-dried fermentation culture',    'functional',45.00),
  ('FN-HOG-CASING', 'ingredient', 'Hog casings',                   'Natural hog casings (salted)',         'functional',18.00)
) as v(item_code, item_type, name, description, product_group, cost_per_kg)
on conflict (org_id, item_code) do update
  set item_type     = excluded.item_type,
      name          = excluded.name,
      description    = excluded.description,
      product_group = excluded.product_group,
      uom_base      = excluded.uom_base,
      cost_per_kg   = excluded.cost_per_kg,
      status        = 'active';

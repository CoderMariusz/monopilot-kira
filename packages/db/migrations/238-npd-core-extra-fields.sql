-- Migration 238: NPD Core tab — 7 prototype-parity fields
--
-- Prototype parity source: prototypes/design/Monopilot Design System/npd/fa-screens.jsx:482-518
-- (FACoreTab "Core section" form-grid). The built Core tab is schema-driven from
-- Reference.DeptColumns (dept_code='Core'); the loader maps lower(column_key) → the
-- physical public.product column and special-cases the 'Comments' key as a textarea,
-- so adding the product columns + the DeptColumns rows is sufficient — no UI change.
--
-- Adds: Volume, Dev Code, Weights (g), Packs per case, Benchmark, Price (Brief),
-- Comments. (Number_of_Cases / Pack_Size / Template / Product_Name already seeded;
-- the Core "Finish Meat → RM Code (auto)" pair already ships as Recipe_Components /
-- Ingredient_Codes.) Procurement already owns column_key='Price' → product.price, so
-- the Core brief price uses a SEPARATE column 'Price_Brief' → product.price_brief.
--
-- Wave0 lock: org_id business scope; idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- New orgs inherit these rows via the existing trg_seed_dept_columns trigger (mig 095),
-- which copies every Apex Core DeptColumn on org insert — Apex is included in the seed below.

-- ============================================================
-- 1. product columns (nullable; non-negative CHECKs on numerics)
-- ============================================================
ALTER TABLE public.product
  ADD COLUMN IF NOT EXISTS volume         numeric(12,3),
  ADD COLUMN IF NOT EXISTS dev_code       text,
  ADD COLUMN IF NOT EXISTS weight         numeric(10,3),
  ADD COLUMN IF NOT EXISTS packs_per_case integer,
  ADD COLUMN IF NOT EXISTS benchmark      text,
  ADD COLUMN IF NOT EXISTS price_brief    numeric(12,2),
  ADD COLUMN IF NOT EXISTS comments       text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_volume_nonneg') THEN
    ALTER TABLE public.product ADD CONSTRAINT product_volume_nonneg
      CHECK (volume IS NULL OR volume >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_weight_nonneg') THEN
    ALTER TABLE public.product ADD CONSTRAINT product_weight_nonneg
      CHECK (weight IS NULL OR weight >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_packs_per_case_nonneg') THEN
    ALTER TABLE public.product ADD CONSTRAINT product_packs_per_case_nonneg
      CHECK (packs_per_case IS NULL OR packs_per_case >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_price_brief_nonneg') THEN
    ALTER TABLE public.product ADD CONSTRAINT product_price_brief_nonneg
      CHECK (price_brief IS NULL OR price_brief >= 0);
  END IF;
END
$$;

-- ============================================================
-- 2. Reference.DeptColumns(Core) rows — for EVERY org that already has Core seeded
--    (includes the Apex baseline org, so new orgs inherit via the 095 trigger).
--    Mirrors the 095 column list; display_order 71-77 places them after Template (7)
--    and before Closed_Core (bumped to 80 in step 3). required_for_done=false (only
--    Product_Name / Pack_Size / Recipe_Components gate Close Core).
-- ============================================================
INSERT INTO "Reference"."DeptColumns"
  (org_id, dept_code, column_key, field_type, is_required, validation_dsl,
   dropdown_source, blocking_rule, required_for_done, display_order, marker, schema_version)
SELECT
  o.org_id, 'Core', c.column_key, c.field_type, false, c.validation_dsl,
  NULL, '', false, c.display_order, 'APEX-CONFIG', 1
FROM (
  SELECT DISTINCT org_id FROM "Reference"."DeptColumns" WHERE dept_code = 'Core'
) o
CROSS JOIN (
  VALUES
    ('Volume',         'number',  '{"minimum":0}'::jsonb, 71),
    ('Dev_Code',       'string',  NULL::jsonb,            72),
    ('Weight',         'number',  '{"minimum":0}'::jsonb, 73),
    ('Packs_Per_Case', 'integer', '{"minimum":0}'::jsonb, 74),
    ('Benchmark',      'string',  NULL::jsonb,            75),
    ('Price_Brief',    'number',  '{"minimum":0}'::jsonb, 76),
    ('Comments',       'string',  NULL::jsonb,            77)
) AS c(column_key, field_type, validation_dsl, display_order)
ON CONFLICT (org_id, dept_code, column_key) DO NOTHING;

-- ============================================================
-- 3. Push Closed_Core to the end so the new fields render before the close control
-- ============================================================
UPDATE "Reference"."DeptColumns"
   SET display_order = 80
 WHERE dept_code = 'Core' AND column_key = 'Closed_Core';

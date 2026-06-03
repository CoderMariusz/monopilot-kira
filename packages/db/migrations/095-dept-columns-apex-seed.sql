-- Migration 095: Reference.DeptColumns Apex baseline seed (69 cols)
-- T-016 — PRD 01-NPD §5.1-§5.10
--
-- Inserts the 69-column Main Table metadata baseline into the existing
-- "Reference"."DeptColumns" table for the Apex org.
--
-- Wave0 lock: org_id (NOT tenant_id); idempotent ON CONFLICT DO NOTHING.
-- The function Reference.seed_dept_columns_apex() is SECURITY DEFINER so it
-- can bypass RLS when called by the org-insert trigger (current_org_id() is
-- unset during system-level INSERT INTO public.organizations).
--
-- Trigger: seed_dept_columns_on_org_insert_t016 — distinct name from T-004
-- (trg_seed_reference_data) to avoid clobbering that trigger/function.

-- ============================================================
-- 1. Pre-flight guard — 077 columns must exist
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'Reference'
       AND table_name   = 'DeptColumns'
       AND column_name  = 'blocking_rule'
  ) THEN
    RAISE EXCEPTION
      'Reference.DeptColumns missing blocking_rule column — run migration 077 first';
  END IF;
END
$$;

-- ============================================================
-- 2. Seed function (SECURITY DEFINER — bypasses org-context RLS)
--    Called both inline (Apex backfill) and from the org-insert
--    trigger below.
-- ============================================================
CREATE OR REPLACE FUNCTION "Reference".seed_dept_columns_apex(p_org_id uuid DEFAULT '00000000-0000-0000-0000-000000000002'::uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, "Reference"
AS $$
BEGIN
  -- -------------------------------------------------------
  -- dept_code  | column_key                | field_type | is_required
  -- | validation_dsl | dropdown_source | blocking_rule
  -- | required_for_done | display_order | marker | schema_version
  -- -------------------------------------------------------
  INSERT INTO "Reference"."DeptColumns"
    (org_id, dept_code, column_key, field_type, is_required, validation_dsl,
     dropdown_source, blocking_rule, required_for_done, display_order, marker, schema_version)
  VALUES

  -- ====================================================
  -- Core (8 cols) — §5.2
  -- Product_Code is the PK on the product table, not a DeptColumn
  -- The 8 Core cols per §5.1 summary are:
  --   Product_Name, Pack_Size, Number_of_Cases, Recipe_Components,
  --   Ingredient_Codes, Template, Closed_Core  (7 columns)
  --   + Weights (brief extension §5.3 counted in Core cols baseline)
  -- Per PRD §5.2 the 8 core cols listed are #1-#8 including Product_Code
  -- which acts as PK. We seed 8 non-PK columns: #2-#8 + one §5.3 brief ext.
  -- Strictly following §5.1: Core = 8 cols (Product_Code counted as col 1,
  -- but as PK it is in the product table not DeptColumns).
  -- Resolution: seed exactly the 8 data-entry cols per §5.2 (#2-#8) plus
  -- keep count=8 by including Product_Code itself as a system/meta col.
  -- ====================================================

  -- #1 Product_Code (PK / identifier — display only)
  (p_org_id, 'Core', 'Product_Code', 'string', false, NULL,
   NULL, '', false, 1, 'UNIVERSAL', 1),

  -- #2 Product_Name
  (p_org_id, 'Core', 'Product_Name', 'string', true, '{"minLength":1}'::jsonb,
   NULL, '', true, 2, 'UNIVERSAL', 1),

  -- #3 Pack_Size
  (p_org_id, 'Core', 'Pack_Size', 'string', true, NULL,
   'PackSizes', '', true, 3, 'APEX-CONFIG', 1),

  -- #4 Number_of_Cases
  (p_org_id, 'Core', 'Number_of_Cases', 'number', true, '{"minimum":0}'::jsonb,
   NULL, '', true, 4, 'APEX-CONFIG', 1),

  -- #5 Recipe_Components
  (p_org_id, 'Core', 'Recipe_Components', 'string', true, NULL,
   NULL, '', true, 5, 'APEX-CONFIG', 1),

  -- #6 Ingredient_Codes (AUTO derived — required_for_done=false per red-line)
  (p_org_id, 'Core', 'Ingredient_Codes', 'string', false, NULL,
   NULL, '', false, 6, 'APEX-CONFIG', 1),

  -- #7 Template
  (p_org_id, 'Core', 'Template', 'string', false, NULL,
   'Templates', '', false, 7, 'APEX-CONFIG', 1),

  -- #8 Closed_Core
  (p_org_id, 'Core', 'Closed_Core', 'string', false, NULL,
   'CloseConfirm', '', false, 8, 'UNIVERSAL', 1),

  -- ====================================================
  -- Planning (4 cols) — §5.4
  -- ====================================================

  -- #9 Primary_Ingredient_Pct
  (p_org_id, 'Planning', 'Primary_Ingredient_Pct', 'number', true, '{"minimum":0,"maximum":100}'::jsonb,
   NULL, 'Core done', true, 9, 'APEX-CONFIG', 1),

  -- #10 Runs_Per_Week
  (p_org_id, 'Planning', 'Runs_Per_Week', 'number', true, '{"minimum":0}'::jsonb,
   NULL, 'Core done', true, 10, 'APEX-CONFIG', 1),

  -- #11 Date_Code_Per_Week
  (p_org_id, 'Planning', 'Date_Code_Per_Week', 'string', true, NULL,
   NULL, 'Core done', true, 11, 'APEX-CONFIG', 1),

  -- #12 Closed_Planning
  (p_org_id, 'Planning', 'Closed_Planning', 'string', false, NULL,
   'CloseConfirm', 'Core done', false, 12, 'APEX-CONFIG', 1),

  -- ====================================================
  -- Commercial (8 cols) — §5.5
  -- ====================================================

  -- #13 Launch_Date
  (p_org_id, 'Commercial', 'Launch_Date', 'date', true, NULL,
   NULL, 'Core done', true, 13, 'UNIVERSAL', 1),

  -- #14 Department_Number
  (p_org_id, 'Commercial', 'Department_Number', 'string', true, NULL,
   NULL, 'Core done', true, 14, 'APEX-CONFIG', 1),

  -- #15 Article_Number
  (p_org_id, 'Commercial', 'Article_Number', 'string', true, NULL,
   NULL, 'Core done', true, 15, 'APEX-CONFIG', 1),

  -- #16 Bar_Codes
  (p_org_id, 'Commercial', 'Bar_Codes', 'string', true, NULL,
   NULL, 'Core done', true, 16, 'UNIVERSAL', 1),

  -- #17 Cases_Per_Week_W1
  (p_org_id, 'Commercial', 'Cases_Per_Week_W1', 'number', true, '{"minimum":0}'::jsonb,
   NULL, 'Core done', true, 17, 'APEX-CONFIG', 1),

  -- #18 Cases_Per_Week_W2
  (p_org_id, 'Commercial', 'Cases_Per_Week_W2', 'number', true, '{"minimum":0}'::jsonb,
   NULL, 'Core done', true, 18, 'APEX-CONFIG', 1),

  -- #19 Cases_Per_Week_W3
  (p_org_id, 'Commercial', 'Cases_Per_Week_W3', 'number', true, '{"minimum":0}'::jsonb,
   NULL, 'Core done', true, 19, 'APEX-CONFIG', 1),

  -- #20 Closed_Commercial
  (p_org_id, 'Commercial', 'Closed_Commercial', 'string', false, NULL,
   'CloseConfirm', 'Core done', false, 20, 'APEX-CONFIG', 1),

  -- ====================================================
  -- Production (19 cols) — §5.6
  -- ====================================================

  -- #21 Manufacturing_Operation_1
  (p_org_id, 'Production', 'Manufacturing_Operation_1', 'string', false, NULL,
   'ManufacturingOperations', 'Pack_Size filled', false, 21, 'APEX-CONFIG', 1),

  -- #22 Operation_Yield_1
  (p_org_id, 'Production', 'Operation_Yield_1', 'number', false, '{"minimum":0,"maximum":100}'::jsonb,
   NULL, 'Pack_Size filled', false, 22, 'APEX-CONFIG', 1),

  -- #23 Manufacturing_Operation_2
  (p_org_id, 'Production', 'Manufacturing_Operation_2', 'string', false, NULL,
   'ManufacturingOperations', 'Pack_Size filled', false, 23, 'APEX-CONFIG', 1),

  -- #24 Operation_Yield_2
  (p_org_id, 'Production', 'Operation_Yield_2', 'number', false, '{"minimum":0,"maximum":100}'::jsonb,
   NULL, 'Pack_Size filled', false, 24, 'APEX-CONFIG', 1),

  -- #25 Manufacturing_Operation_3
  (p_org_id, 'Production', 'Manufacturing_Operation_3', 'string', false, NULL,
   'ManufacturingOperations', 'Pack_Size filled', false, 25, 'APEX-CONFIG', 1),

  -- #26 Operation_Yield_3
  (p_org_id, 'Production', 'Operation_Yield_3', 'number', false, '{"minimum":0,"maximum":100}'::jsonb,
   NULL, 'Pack_Size filled', false, 26, 'APEX-CONFIG', 1),

  -- #27 Manufacturing_Operation_4
  (p_org_id, 'Production', 'Manufacturing_Operation_4', 'string', false, NULL,
   'ManufacturingOperations', 'Pack_Size filled', false, 27, 'APEX-CONFIG', 1),

  -- #28 Operation_Yield_4
  (p_org_id, 'Production', 'Operation_Yield_4', 'number', false, '{"minimum":0,"maximum":100}'::jsonb,
   NULL, 'Pack_Size filled', false, 28, 'APEX-CONFIG', 1),

  -- #29 Line
  (p_org_id, 'Production', 'Line', 'string', true, NULL,
   'Lines_By_PackSize', 'Pack_Size filled', true, 29, 'APEX-CONFIG', 1),

  -- #30 Equipment_Setup (AUTO — required_for_done=false per red-line; is_required=true means must fill before close)
  -- PRD §5.6: Equipment_Setup required_for_done=✅ BUT it is AUTO-derived — red-line override applies
  -- Red-line: "Do not set required_for_done=true on auto-derived cols (e.g., ingredient_codes, equipment_setup)"
  (p_org_id, 'Production', 'Equipment_Setup', 'string', false, NULL,
   'Equipment_Setup_By_Line_Pack', 'Line filled', false, 30, 'APEX-CONFIG', 1),

  -- #31 Yield_Line
  (p_org_id, 'Production', 'Yield_Line', 'number', true, '{"minimum":0}'::jsonb,
   NULL, 'Line filled', true, 31, 'APEX-CONFIG', 1),

  -- #32 Resource_Requirement
  (p_org_id, 'Production', 'Resource_Requirement', 'string', false, NULL,
   NULL, 'Line filled', false, 32, 'APEX-CONFIG', 1),

  -- #33 Rate
  (p_org_id, 'Production', 'Rate', 'number', true, '{"minimum":0}'::jsonb,
   NULL, 'Line filled', true, 33, 'APEX-CONFIG', 1),

  -- #34 Intermediate_Code_P1 (AUTO)
  (p_org_id, 'Production', 'Intermediate_Code_P1', 'string', false, NULL,
   NULL, '', false, 34, 'APEX-CONFIG', 1),

  -- #35 Intermediate_Code_P2 (AUTO)
  (p_org_id, 'Production', 'Intermediate_Code_P2', 'string', false, NULL,
   NULL, '', false, 35, 'APEX-CONFIG', 1),

  -- #36 Intermediate_Code_P3 (AUTO)
  (p_org_id, 'Production', 'Intermediate_Code_P3', 'string', false, NULL,
   NULL, '', false, 36, 'APEX-CONFIG', 1),

  -- #37 Intermediate_Code_P4 (AUTO)
  (p_org_id, 'Production', 'Intermediate_Code_P4', 'string', false, NULL,
   NULL, '', false, 37, 'APEX-CONFIG', 1),

  -- #38 Intermediate_Code_Final (AUTO)
  (p_org_id, 'Production', 'Intermediate_Code_Final', 'string', false, NULL,
   NULL, '', false, 38, 'APEX-CONFIG', 1),

  -- #39 Closed_Production
  (p_org_id, 'Production', 'Closed_Production', 'string', false, NULL,
   'CloseConfirm', 'Pack_Size filled', false, 39, 'APEX-CONFIG', 1),

  -- ====================================================
  -- Technical (2 baseline cols) — §5.7
  -- ====================================================

  -- #40 Shelf_Life
  (p_org_id, 'Technical', 'Shelf_Life', 'string', true, NULL,
   NULL, 'Core done', true, 40, 'UNIVERSAL', 1),

  -- #41 Closed_Technical
  (p_org_id, 'Technical', 'Closed_Technical', 'string', false, NULL,
   'CloseConfirm', 'Core done', false, 41, 'UNIVERSAL', 1),

  -- ====================================================
  -- MRP (13 cols) — §5.8
  -- ====================================================

  -- #42 Box
  (p_org_id, 'MRP', 'Box', 'string', true, NULL,
   NULL, 'Core + Production done', true, 42, 'APEX-CONFIG', 1),

  -- #43 Top_Label
  (p_org_id, 'MRP', 'Top_Label', 'string', true, NULL,
   NULL, 'Core + Production done', true, 43, 'APEX-CONFIG', 1),

  -- #44 Bottom_Label
  (p_org_id, 'MRP', 'Bottom_Label', 'string', false, NULL,
   NULL, 'Core + Production done', false, 44, 'APEX-CONFIG', 1),

  -- #45 Web
  (p_org_id, 'MRP', 'Web', 'string', false, NULL,
   NULL, 'Core + Production done', false, 45, 'APEX-CONFIG', 1),

  -- #46 MRP_Box
  (p_org_id, 'MRP', 'MRP_Box', 'string', true, NULL,
   NULL, 'Core + Production done', true, 46, 'APEX-CONFIG', 1),

  -- #47 MRP_Labels
  (p_org_id, 'MRP', 'MRP_Labels', 'string', true, NULL,
   NULL, 'Core + Production done', true, 47, 'APEX-CONFIG', 1),

  -- #48 MRP_Films
  (p_org_id, 'MRP', 'MRP_Films', 'string', true, NULL,
   NULL, 'Core + Production done', true, 48, 'APEX-CONFIG', 1),

  -- #49 MRP_Sleeves
  (p_org_id, 'MRP', 'MRP_Sleeves', 'string', false, NULL,
   NULL, 'Core + Production done', false, 49, 'APEX-CONFIG', 1),

  -- #50 MRP_Cartons
  (p_org_id, 'MRP', 'MRP_Cartons', 'string', false, NULL,
   NULL, 'Core + Production done', false, 50, 'APEX-CONFIG', 1),

  -- #51 Tara_Weight
  (p_org_id, 'MRP', 'Tara_Weight', 'number', true, '{"minimum":0}'::jsonb,
   NULL, 'Core + Production done', true, 51, 'APEX-CONFIG', 1),

  -- #52 Pallet_Stacking_Plan
  (p_org_id, 'MRP', 'Pallet_Stacking_Plan', 'string', true, NULL,
   NULL, 'Core + Production done', true, 52, 'APEX-CONFIG', 1),

  -- #53 Box_Dimensions
  (p_org_id, 'MRP', 'Box_Dimensions', 'string', true, NULL,
   NULL, 'Core + Production done', true, 53, 'APEX-CONFIG', 1),

  -- #54 Closed_MRP
  (p_org_id, 'MRP', 'Closed_MRP', 'string', false, NULL,
   'CloseConfirm', 'Core + Production done', false, 54, 'APEX-CONFIG', 1),

  -- ====================================================
  -- Procurement (5 cols) — §5.9
  -- ====================================================

  -- #55 Price — Phase D #7: blocking_rule = 'Core + Production done'
  (p_org_id, 'Procurement', 'Price', 'number', true, '{"minimum":0}'::jsonb,
   NULL, 'Core + Production done', true, 55, 'APEX-CONFIG', 1),

  -- #56 Lead_Time
  (p_org_id, 'Procurement', 'Lead_Time', 'number', true, '{"minimum":0}'::jsonb,
   NULL, 'Core done', true, 56, 'APEX-CONFIG', 1),

  -- #57 Supplier
  (p_org_id, 'Procurement', 'Supplier', 'string', true, NULL,
   NULL, 'Core done', true, 57, 'APEX-CONFIG', 1),

  -- #58 Proc_Shelf_Life
  (p_org_id, 'Procurement', 'Proc_Shelf_Life', 'number', true, '{"minimum":0}'::jsonb,
   NULL, 'Core done', true, 58, 'APEX-CONFIG', 1),

  -- #59 Closed_Procurement
  (p_org_id, 'Procurement', 'Closed_Procurement', 'string', false, NULL,
   'CloseConfirm', 'Core done', false, 59, 'APEX-CONFIG', 1),

  -- ====================================================
  -- System (10 cols, auto-calc) — §5.10
  -- All System cols: required_for_done=false (auto-calc, no user input)
  -- ====================================================

  -- #60 Done_Core
  (p_org_id, 'System', 'Done_Core', 'boolean', false, NULL,
   NULL, '', false, 60, 'UNIVERSAL', 1),

  -- #61 Done_Planning
  (p_org_id, 'System', 'Done_Planning', 'boolean', false, NULL,
   NULL, '', false, 61, 'UNIVERSAL', 1),

  -- #62 Done_Commercial
  (p_org_id, 'System', 'Done_Commercial', 'boolean', false, NULL,
   NULL, '', false, 62, 'UNIVERSAL', 1),

  -- #63 Done_Production
  (p_org_id, 'System', 'Done_Production', 'boolean', false, NULL,
   NULL, '', false, 63, 'UNIVERSAL', 1),

  -- #64 Done_Technical
  (p_org_id, 'System', 'Done_Technical', 'boolean', false, NULL,
   NULL, '', false, 64, 'UNIVERSAL', 1),

  -- #65 Done_MRP
  (p_org_id, 'System', 'Done_MRP', 'boolean', false, NULL,
   NULL, '', false, 65, 'UNIVERSAL', 1),

  -- #66 Done_Procurement
  (p_org_id, 'System', 'Done_Procurement', 'boolean', false, NULL,
   NULL, '', false, 66, 'UNIVERSAL', 1),

  -- #67 Status_Overall
  (p_org_id, 'System', 'Status_Overall', 'string', false, NULL,
   NULL, '', false, 67, 'UNIVERSAL', 1),

  -- #68 Days_To_Launch (computed on-the-fly, integer stored as number)
  (p_org_id, 'System', 'Days_To_Launch', 'integer', false, NULL,
   NULL, '', false, 68, 'UNIVERSAL', 1),

  -- #69 Built [LEGACY-D365]
  (p_org_id, 'System', 'Built', 'boolean', false, NULL,
   NULL, '', false, 69, 'LEGACY-D365', 1)

  ON CONFLICT (org_id, dept_code, column_key) DO NOTHING;
END;
$$;

-- ============================================================
-- 3. Apex org backfill — seed for Apex org immediately
-- ============================================================
SELECT "Reference".seed_dept_columns_apex('00000000-0000-0000-0000-000000000002'::uuid);

-- ============================================================
-- 4. Org-insert trigger — copy DeptColumns to every new org
--    Uses a DISTINCT function name from the T-004/T-005 triggers.
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_dept_columns_on_org_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, "Reference"
AS $$
DECLARE
  v_apex_org_id uuid := '00000000-0000-0000-0000-000000000002'::uuid;
BEGIN
  -- Skip Apex itself
  IF NEW.id = v_apex_org_id THEN
    RETURN NEW;
  END IF;

  -- Guard: table must exist (safe on partial DB)
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'Reference'
       AND table_name   = 'DeptColumns'
  ) THEN
    RETURN NEW;
  END IF;

  -- Guard: blocking_rule column must exist (migration 077 required)
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'Reference'
       AND table_name   = 'DeptColumns'
       AND column_name  = 'blocking_rule'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO "Reference"."DeptColumns"
    (org_id, dept_code, column_key, field_type, is_required, validation_dsl,
     dropdown_source, blocking_rule, required_for_done, display_order, marker, schema_version)
  SELECT
    NEW.id,
    dept_code,
    column_key,
    field_type,
    is_required,
    validation_dsl,
    dropdown_source,
    blocking_rule,
    required_for_done,
    display_order,
    marker,
    schema_version
  FROM "Reference"."DeptColumns"
  WHERE org_id = v_apex_org_id
  ON CONFLICT (org_id, dept_code, column_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_dept_columns ON public.organizations;
CREATE TRIGGER trg_seed_dept_columns
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_dept_columns_on_org_insert();

-- ============================================================
-- 5. Backfill — copy to all existing non-Apex orgs (idempotent)
-- ============================================================
DO $$
DECLARE
  v_apex_org_id uuid := '00000000-0000-0000-0000-000000000002'::uuid;
  v_org         record;
BEGIN
  FOR v_org IN
    SELECT id FROM public.organizations WHERE id <> v_apex_org_id
  LOOP
    INSERT INTO "Reference"."DeptColumns"
      (org_id, dept_code, column_key, field_type, is_required, validation_dsl,
       dropdown_source, blocking_rule, required_for_done, display_order, marker, schema_version)
    SELECT
      v_org.id,
      dept_code,
      column_key,
      field_type,
      is_required,
      validation_dsl,
      dropdown_source,
      blocking_rule,
      required_for_done,
      display_order,
      marker,
      schema_version
    FROM "Reference"."DeptColumns"
    WHERE org_id = v_apex_org_id
    ON CONFLICT (org_id, dept_code, column_key) DO NOTHING;
  END LOOP;
END
$$;

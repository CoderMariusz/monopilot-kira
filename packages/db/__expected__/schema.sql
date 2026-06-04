--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: Reference; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA "Reference";


--
-- Name: app; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA app;


--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: fa_allergen_override_action; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fa_allergen_override_action AS ENUM (
    'add',
    'remove'
);


--
-- Name: seed_d365_constants_apex(); Type: FUNCTION; Schema: Reference; Owner: -
--

CREATE FUNCTION "Reference".seed_d365_constants_apex() RETURNS void
    LANGUAGE sql
    AS $$
  insert into "Reference"."D365_Constants" (
    org_id,
    constant_key,
    constant_value,
    description,
    marker,
    schema_version
  )
  values
    ('00000000-0000-0000-0000-000000000002', 'PRODUCTIONSITEID', 'FNOR', 'Apex Production Site', 'LEGACY-D365;APEX-CONFIG', 1),
    ('00000000-0000-0000-0000-000000000002', 'APPROVERPERSONNELNUMBER', 'APX100048', 'Approver ID (Jane or default)', 'LEGACY-D365;APEX-CONFIG', 1),
    ('00000000-0000-0000-0000-000000000002', 'CONSUMPTIONWAREHOUSEID', 'ApexDG', 'Warehouse code', 'LEGACY-D365;APEX-CONFIG', 1),
    ('00000000-0000-0000-0000-000000000002', 'PRODUCTGROUPID_FG', 'FinGoods', 'Finished Goods group', 'LEGACY-D365;APEX-CONFIG', 1),
    ('00000000-0000-0000-0000-000000000002', 'PRODUCTGROUPID_PR', null, 'PR intermediates group; TBD until configured', 'LEGACY-D365;APEX-CONFIG', 1),
    ('00000000-0000-0000-0000-000000000002', 'COSTINGOPERATIONRESOURCEID_DEFAULT', 'APXProd01', 'Default resource (override per Line in Phase C)', 'LEGACY-D365;APEX-CONFIG', 1),
    ('00000000-0000-0000-0000-000000000002', 'FLUSHINGPRINCIPLE', 'Finish', 'Materials consumed at Finish', 'LEGACY-D365;APEX-CONFIG', 1),
    ('00000000-0000-0000-0000-000000000002', 'LINETYPE', 'Item', 'Default line type', 'LEGACY-D365;APEX-CONFIG', 1),
    ('00000000-0000-0000-0000-000000000002', 'CONSUMPTIONTYPE', 'Variable', 'Default consumption type', 'LEGACY-D365;APEX-CONFIG', 1),
    ('00000000-0000-0000-0000-000000000002', 'CONSUMPTIONCALCULATIONFORMULA', 'Formula0', 'Default consumption calculation formula', 'LEGACY-D365;APEX-CONFIG', 1),
    ('00000000-0000-0000-0000-000000000002', 'OPERATIONPRIORITY', 'Primary', 'Default operation priority', 'LEGACY-D365;APEX-CONFIG', 1),
    ('00000000-0000-0000-0000-000000000002', 'NEXTOPERATIONLINKTYPE_TERMINAL', 'None', 'Terminal operation link type for final operation', 'LEGACY-D365;APEX-CONFIG', 1)
  on conflict (org_id, constant_key) do nothing;
$$;


--
-- Name: seed_dept_columns_apex(uuid); Type: FUNCTION; Schema: Reference; Owner: -
--

CREATE FUNCTION "Reference".seed_dept_columns_apex(p_org_id uuid DEFAULT '00000000-0000-0000-0000-000000000002'::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'Reference'
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


--
-- Name: seed_reference_lookups(uuid); Type: FUNCTION; Schema: Reference; Owner: -
--

CREATE FUNCTION "Reference".seed_reference_lookups(p_org_id uuid DEFAULT '00000000-0000-0000-0000-000000000002'::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'Reference'
    AS $$
DECLARE
  -- prototype window.NPD_REF.pack_sizes (data.jsx) — the canonical Pack Size option list.
  v_pack_sizes text[] := ARRAY['100g','120g','150g','160g','180g','200g','220g','250g'];
  -- prototype window.NPD_REF.lines (data.jsx) — the canonical Line option list.
  v_lines      text[] := ARRAY['L1','L2','L3','L4-MAP','L5-Smoked'];
  v_line       text;
  v_pack       text;
BEGIN
  -- -------- PackSizes (dropdown_source 'PackSizes', Core "Pack Size *") --------
  INSERT INTO "Reference"."PackSizes" (org_id, value)
  SELECT p_org_id, ps
    FROM unnest(v_pack_sizes) AS ps
  ON CONFLICT (org_id, value) DO NOTHING;

  -- -------- CloseConfirm (dropdown_source 'CloseConfirm', "Closed_<Dept>") -----
  -- 079 CHECK constraint restricts value to ('Yes','No',''); seed all three.
  INSERT INTO "Reference"."CloseConfirm" (org_id, value)
  VALUES (p_org_id, 'Yes'), (p_org_id, 'No'), (p_org_id, '')
  ON CONFLICT (org_id, value) DO NOTHING;

  -- -------- Templates (dropdown_source 'Templates', Core "Template") -----------
  -- template_name list from prototype window.NPD_REF.templates (data.jsx). The four
  -- operation_*_name values come from window.NPD_REF.processes so cascade chain4
  -- (templateOperations() requires all 4 non-empty) resolves for every template.
  INSERT INTO "Reference"."Templates"
    (org_id, template_name, operation_1_name, operation_2_name, operation_3_name, operation_4_name)
  VALUES
    (p_org_id, 'Single Comp · Cold cut', 'Slice',  'MAP',    'Pack', 'Pack'),
    (p_org_id, 'Single Comp · Smoked',   'Smoke',  'Slice',  'MAP',  'Pack'),
    (p_org_id, 'Single Comp · Cured',    'Inject', 'Tumble', 'Cook', 'Pack'),
    (p_org_id, 'Single Comp · Fish',     'Slice',  'Coat',   'Cook', 'Pack'),
    (p_org_id, 'Multi Comp · Platter',   'Slice',  'MAP',    'Coat', 'Pack')
  ON CONFLICT (org_id, template_name) DO NOTHING;

  -- -------- Lines_By_PackSize (dropdown_source 'Lines_By_PackSize', Production "Line") --
  -- Each baseline line supports every baseline pack size (supported_pack_sizes is the
  -- array the @> containment query in reference-lookups.test.ts filters on).
  INSERT INTO "Reference"."Lines_By_PackSize" (org_id, line, supported_pack_sizes)
  SELECT p_org_id, ln, v_pack_sizes
    FROM unnest(v_lines) AS ln
  ON CONFLICT (org_id, line) DO NOTHING;

  -- -------- Equipment_Setup_By_Line_Pack (dropdown_source, Production "Equipment_Setup") --
  -- One deterministic dieset per (line, pack) so cascade chain1 handleLineChange()
  -- auto-fills prod_detail.equipment_setup non-null for any valid line+pack pairing.
  FOREACH v_line IN ARRAY v_lines LOOP
    FOREACH v_pack IN ARRAY v_pack_sizes LOOP
      INSERT INTO "Reference"."Equipment_Setup_By_Line_Pack"
        (org_id, line, pack_size, equipment_setup)
      VALUES (p_org_id, v_line, v_pack, 'Dieset ' || v_line || ' · ' || v_pack)
      ON CONFLICT (org_id, line, pack_size) DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;


--
-- Name: app_next_seq_7(uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.app_next_seq_7(p_org_id uuid, p_seq_name text DEFAULT 'short_codes'::text) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_current_org_id uuid;
  v_seq_name text;
  v_next bigint;
begin
  v_current_org_id := app.current_org_id();
  v_seq_name := pg_catalog.btrim(p_seq_name);

  if p_org_id is null then
    raise exception 'org_id is required'
      using errcode = '22004';
  end if;

  if v_current_org_id is null or v_current_org_id <> p_org_id then
    raise exception 'invalid organization context'
      using errcode = '28000';
  end if;

  if v_seq_name is null or v_seq_name = '' then
    raise exception 'sequence name is required'
      using errcode = '22004';
  end if;

  insert into public.org_sequences (org_id, seq_name, current_value, updated_at)
  values (p_org_id, v_seq_name, 1, pg_catalog.now())
  on conflict (org_id, seq_name) do update
    set current_value = public.org_sequences.current_value + 1,
        updated_at = pg_catalog.now()
    where public.org_sequences.current_value < 9999999
  returning current_value into v_next;

  if v_next is null then
    raise exception 'sequence exhausted for org_id %, seq_name %', p_org_id, v_seq_name
      using errcode = '2200H';
  end if;

  return pg_catalog.lpad(v_next::text, 7, '0');
end;
$$;


--
-- Name: count_manufacturing_operation_usage(uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.count_manufacturing_operation_usage(p_org_id uuid, p_operation_name text) RETURNS TABLE(active_fa_count integer, template_count integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
declare
  v_fa integer := 0;
  v_tpl integer := 0;
begin
  if p_org_id is null or p_operation_name is null then
    return query select 0, 0;
    return;
  end if;

  if to_regclass('npd.formulation_assignments') is not null then
    execute format(
      'select count(*)::integer
         from %s
        where org_id = $1
          and is_active = true
          and (
                manufacturing_operation_1 = $2
             or manufacturing_operation_2 = $2
             or manufacturing_operation_3 = $2
             or manufacturing_operation_4 = $2
              )',
      'npd.formulation_assignments'
    )
    into v_fa
    using p_org_id, p_operation_name;
  end if;

  if to_regclass('npd.templates') is not null then
    execute format(
      'select count(*)::integer
         from %s
        where org_id = $1
          and is_active = true
          and (
                template_operation_1 = $2
             or template_operation_2 = $2
             or template_operation_3 = $2
             or template_operation_4 = $2
              )',
      'npd.templates'
    )
    into v_tpl
    using p_org_id, p_operation_name;
  end if;

  return query select coalesce(v_fa, 0), coalesce(v_tpl, 0);
end;
$_$;


--
-- Name: FUNCTION count_manufacturing_operation_usage(p_org_id uuid, p_operation_name text); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.count_manufacturing_operation_usage(p_org_id uuid, p_operation_name text) IS 'V-SET-MFG-04 helper: returns active FA + template reference counts for a given operation name within the current org. Returns (0, 0) when the underlying FA/template tables do not exist (LEGACY-FA migration not yet complete).';


--
-- Name: current_org_id(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.current_org_id() RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  select active_context.org_id
  from app.active_org_contexts active_context
  join app.session_org_contexts trusted_context
    on trusted_context.session_token = active_context.session_token
   and trusted_context.org_id = active_context.org_id
  where active_context.backend_pid = pg_catalog.pg_backend_pid()
    and active_context.transaction_id = pg_catalog.txid_current_if_assigned()
  limit 1
$$;


--
-- Name: gc_session_org_contexts(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.gc_session_org_contexts(p_max_age_seconds integer DEFAULT 600) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_deleted int;
begin
  delete from app.session_org_contexts
   where created_at < pg_catalog.now() - make_interval(secs => p_max_age_seconds);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;


--
-- Name: FUNCTION gc_session_org_contexts(p_max_age_seconds integer); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.gc_session_org_contexts(p_max_age_seconds integer) IS 'GC orphan rows from app.session_org_contexts older than p_max_age_seconds (default 600). Operators wire this to a 5-minute cron with owner credentials. See migration 031.';


--
-- Name: get_my_tenant_idp_config(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_my_tenant_idp_config(p_tenant_id uuid) RETURNS TABLE(tenant_id uuid, provider_type character varying, enforce_for_non_admins boolean, jit_provisioning boolean, mfa_required boolean, mfa_required_for_roles text[], mfa_allowed_methods text[], password_complexity character varying, idle_timeout_min integer, session_max_h integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  -- Only return rows whose tenant_id matches BOTH the caller-supplied tenant
  -- AND an organization the current session has been bound to. This prevents
  -- a session bound to org A from reading org B's IdP policy.
  return query
    select
      t.tenant_id,
      t.provider_type,
      t.enforce_for_non_admins,
      t.jit_provisioning,
      t.mfa_required,
      t.mfa_required_for_roles,
      t.mfa_allowed_methods,
      t.password_complexity,
      t.idle_timeout_min,
      t.session_max_h
    from public.tenant_idp_config t
    where t.tenant_id = p_tenant_id
      and exists (
        select 1
        from public.organizations o
        where o.tenant_id = t.tenant_id
          and o.id = app.current_org_id()
      );
end;
$$;


--
-- Name: queue_allergen_cascade_rebuild(uuid, text[], text[]); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.queue_allergen_cascade_rebuild(p_org_id uuid, p_ingredient_codes text[], p_process_names text[]) RETURNS TABLE(product_code text, job_id uuid, source_event_id uuid, inserted boolean)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  select *
  from app.queue_allergen_cascade_rebuild(
    p_org_id,
    p_ingredient_codes,
    p_process_names,
    gen_random_uuid(),
    'reference.allergens_by_rm.bulk_changed'
  )
$$;


--
-- Name: queue_allergen_cascade_rebuild(uuid, text[], text[], uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.queue_allergen_cascade_rebuild(p_org_id uuid, p_ingredient_codes text[], p_process_names text[], p_source_event_id uuid DEFAULT gen_random_uuid(), p_source_event_type text DEFAULT 'reference.allergens_by_rm.bulk_changed'::text) RETURNS TABLE(product_code text, job_id uuid, source_event_id uuid, inserted boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_current_org_id uuid := app.current_org_id();
  v_run_after timestamptz := pg_catalog.now();
begin
  if v_current_org_id is null then
    raise exception 'queue_allergen_cascade_rebuild requires app.current_org_id()'
      using errcode = '28000';
  end if;

  if p_org_id is distinct from v_current_org_id then
    raise exception 'requested org % does not match current org context %', p_org_id, v_current_org_id
      using errcode = '42501';
  end if;

  if p_source_event_type not in (
    'reference.allergens_by_rm.bulk_changed',
    'reference.allergens_added_by_process.bulk_changed'
  ) then
    raise exception 'unsupported allergen cascade source event type: %', p_source_event_type
      using errcode = '23514';
  end if;

  select coalesce(max(event.created_at), '-infinity'::timestamptz) + interval '5 minutes'
    into v_run_after
  from public.outbox_events event
  where event.org_id = p_org_id
    and event.event_type = 'npd.allergens.bulk_rebuild_completed'
    and event.created_at > pg_catalog.now() - interval '5 minutes';

  v_run_after := greatest(pg_catalog.now(), v_run_after);

  return query
  with normalized_ingredients as (
    select distinct pg_catalog.btrim(code) as ingredient_code
    from unnest(coalesce(p_ingredient_codes, '{}'::text[])) code
    where pg_catalog.btrim(code) <> ''
  ),
  normalized_processes as (
    select distinct pg_catalog.btrim(name) as process_name
    from unnest(coalesce(p_process_names, '{}'::text[])) name
    where pg_catalog.btrim(name) <> ''
  ),
  affected_by_rm as (
    select distinct product.product_code as affected_product_code
    from public.product
    cross join lateral pg_catalog.regexp_split_to_table(
      coalesce(product.ingredient_codes, ''), '\s*,\s*'
    ) parsed(ingredient_code)
    join normalized_ingredients changed
      on changed.ingredient_code = pg_catalog.btrim(parsed.ingredient_code)
    where product.org_id = p_org_id
      and product.deleted_at is null
  ),
  affected_by_process as (
    select distinct detail.product_code as affected_product_code
    from public.prod_detail detail
    cross join lateral (
      values
        (detail.manufacturing_operation_1),
        (detail.manufacturing_operation_2),
        (detail.manufacturing_operation_3),
        (detail.manufacturing_operation_4)
    ) ops(process_name)
    join normalized_processes changed
      on changed.process_name = ops.process_name
    join public.product product
      on product.product_code = detail.product_code
     and product.org_id = detail.org_id
     and product.deleted_at is null
    where detail.org_id = p_org_id
  ),
  affected as (
    select affected_by_rm.affected_product_code from affected_by_rm
    union
    select affected_by_process.affected_product_code from affected_by_process
  ),
  inserted_jobs as (
    insert into public.allergen_cascade_rebuild_jobs (
      org_id,
      product_code,
      source_event_id,
      source_event_type,
      run_after
    )
    select p_org_id, affected.affected_product_code, p_source_event_id, p_source_event_type, v_run_after
    from affected
    on conflict on constraint allergen_cascade_rebuild_jobs_dedup_unique do nothing
    returning allergen_cascade_rebuild_jobs.product_code,
              allergen_cascade_rebuild_jobs.id,
              allergen_cascade_rebuild_jobs.source_event_id
  )
  select affected.affected_product_code,
         coalesce(inserted_jobs.id, existing.id) as job_id,
         p_source_event_id as source_event_id,
         inserted_jobs.id is not null as inserted
  from affected
  left join inserted_jobs
    on inserted_jobs.product_code = affected.affected_product_code
  left join public.allergen_cascade_rebuild_jobs existing
    on existing.org_id = p_org_id
   and existing.product_code = affected.affected_product_code
   and existing.source_event_id = p_source_event_id
  order by affected.affected_product_code;
end;
$$;


--
-- Name: FUNCTION queue_allergen_cascade_rebuild(p_org_id uuid, p_ingredient_codes text[], p_process_names text[], p_source_event_id uuid, p_source_event_type text); Type: COMMENT; Schema: app; Owner: -
--

COMMENT ON FUNCTION app.queue_allergen_cascade_rebuild(p_org_id uuid, p_ingredient_codes text[], p_process_names text[], p_source_event_id uuid, p_source_event_type text) IS 'T-099: queues one idempotent allergen rebuild job per affected FA product for the current app.current_org_id(); source event replay is deduped by (org_id, product_code, source_event_id).';


--
-- Name: reference_tables_set_version(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.reference_tables_set_version() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
begin
  if new.row_data is distinct from old.row_data then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


--
-- Name: refresh_reference_table_mv(uuid, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.refresh_reference_table_mv(org_id uuid, table_code text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  mv_name text;
begin
  mv_name := format(
    'reference_table_mv_%s_%s',
    replace(refresh_reference_table_mv.org_id::text, '-', ''),
    regexp_replace(refresh_reference_table_mv.table_code, '[^a-zA-Z0-9_]+', '_', 'g')
  );

  if to_regclass(format('public.%I', mv_name)) is null then
    return false;
  end if;

  execute format('refresh materialized view public.%I', mv_name);
  return true;
end;
$$;


--
-- Name: set_org_context(uuid, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.set_org_context(session_token uuid, org uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  if not exists (
    select 1
    from app.session_org_contexts trusted_context
    where trusted_context.session_token = set_org_context.session_token
      and trusted_context.org_id = set_org_context.org
  ) then
    raise exception 'invalid organization context'
      using errcode = '28000';
  end if;

  insert into app.active_org_contexts (backend_pid, transaction_id, session_token, org_id, set_at)
  values (pg_catalog.pg_backend_pid(), pg_catalog.txid_current(), set_org_context.session_token, set_org_context.org, pg_catalog.now())
  on conflict (backend_pid) do update
    set transaction_id = excluded.transaction_id,
        session_token = excluded.session_token,
        org_id = excluded.org_id,
        set_at = excluded.set_at;

  return set_org_context.org;
end;
$$;


--
-- Name: allergen_contamination_risk_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.allergen_contamination_risk_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


--
-- Name: approve_supplier_spec_review(uuid, uuid, text, date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_supplier_spec_review(p_proposal_id uuid, p_approved_by uuid, p_new_spec_version text DEFAULT NULL::text, p_new_expiry_date date DEFAULT NULL::date, p_review_notes text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
declare
  v_org_id uuid := app.current_org_id();
  v_proposal public.supplier_spec_review_proposals%rowtype;
  v_base public.supplier_specs%rowtype;
  v_new_spec_id uuid;
begin
  select *
    into v_proposal
  from public.supplier_spec_review_proposals proposal
  where proposal.id = p_proposal_id
    and proposal.org_id = v_org_id
  for update;

  if v_proposal.id is null then
    raise exception 'supplier spec review proposal not found in current org: %', p_proposal_id
      using errcode = 'P0002';
  end if;

  if v_proposal.proposal_status <> 'pending' then
    raise exception 'supplier spec review proposal % is not pending (status %)',
      p_proposal_id, v_proposal.proposal_status
      using errcode = '23514';
  end if;

  select *
    into v_base
  from public.supplier_specs spec
  where spec.id = v_proposal.supplier_spec_id
    and spec.org_id = v_org_id
  for update;

  if v_base.id is null then
    raise exception 'targeted supplier_spec not found in current org: %', v_proposal.supplier_spec_id
      using errcode = 'P0002';
  end if;

  -- Supersede the prior active+approved spec for the same (org,item,supplier) so the new
  -- active+approved row does not violate supplier_specs_one_active_approved.
  update public.supplier_specs spec
     set lifecycle_status = 'superseded'
   where spec.org_id = v_org_id
     and spec.item_id = v_base.item_id
     and spec.supplier_code = v_base.supplier_code
     and spec.lifecycle_status = 'active'
     and spec.review_status = 'approved';

  -- Clone-on-write: a NEW supplier_spec row carrying the approved revision.
  insert into public.supplier_specs (
    org_id, site_id, item_id, supplier_code, supplier_status,
    spec_document_url, document_sha256, document_mime_type,
    spec_version, issued_date, effective_from, expiry_date,
    lifecycle_status, review_status, review_notes,
    approved_by, approved_at,
    declared_allergens, declared_attrs, certificate_refs,
    uploaded_by
  )
  values (
    v_org_id, v_base.site_id, v_base.item_id, v_base.supplier_code, 'approved',
    v_base.spec_document_url, v_base.document_sha256, v_base.document_mime_type,
    coalesce(p_new_spec_version, v_base.spec_version || '-rev'),
    v_base.issued_date, current_date, coalesce(p_new_expiry_date, v_base.expiry_date),
    'active', 'approved', coalesce(p_review_notes, 'Approved from supplier spec review proposal.'),
    p_approved_by, pg_catalog.now(),
    v_base.declared_allergens,
    v_base.declared_attrs || v_proposal.proposed_attrs,
    v_base.certificate_refs,
    p_approved_by
  )
  returning id into v_new_spec_id;

  update public.supplier_spec_review_proposals proposal
     set proposal_status = 'approved',
         reviewed_by = p_approved_by,
         reviewed_at = pg_catalog.now(),
         review_notes = coalesce(p_review_notes, proposal.review_notes),
         resulting_supplier_spec_id = v_new_spec_id
   where proposal.id = p_proposal_id
     and proposal.org_id = v_org_id;

  return v_new_spec_id;
end;
$$;


--
-- Name: FUNCTION approve_supplier_spec_review(p_proposal_id uuid, p_approved_by uuid, p_new_spec_version text, p_new_expiry_date date, p_review_notes text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.approve_supplier_spec_review(p_proposal_id uuid, p_approved_by uuid, p_new_spec_version text, p_new_expiry_date date, p_review_notes text) IS 'T-075: Technical-only governed approval. Clones a new active+approved supplier_spec from a proposal and supersedes the prior active+approved spec (preserving single-active uniqueness).';


--
-- Name: audit_events_impersonation_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_events_impersonation_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  if new.actor_type = 'impersonation' and new.impersonator_id is null then
    raise exception 'impersonation audit events require a non-null impersonator_id'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;


--
-- Name: audit_log_create_partitions(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_log_create_partitions(n integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  start_month date := date_trunc('year', current_date)::date;
  partition_start date;
  partition_end date;
  partition_name text;
begin
  if n is null or n < 1 then
    raise exception 'partition count must be positive' using errcode = '22023';
  end if;

  for month_offset in 0..(n - 1) loop
    partition_start := (start_month + (month_offset || ' months')::interval)::date;
    partition_end := (partition_start + interval '1 month')::date;
    partition_name := 'audit_log_' || to_char(partition_start, 'YYYY_MM');

    execute format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.audit_log FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      partition_start,
      partition_end
    );
  end loop;
end;
$$;


--
-- Name: audit_log_detach_old(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_log_detach_old(months integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
declare
  retention_months integer := months;
  cutoff_month date;
  partition_record record;
  partition_month date;
  detached_count integer := 0;
begin
  if retention_months is null or retention_months < 1 then
    raise exception 'retention window must be positive' using errcode = '22023';
  end if;

  cutoff_month := (date_trunc('month', current_date)::date - (retention_months || ' months')::interval)::date;

  for partition_record in
    select namespace.nspname as schema_name, child.relname as table_name
      from pg_inherits inheritance
      join pg_class child on child.oid = inheritance.inhrelid
      join pg_namespace namespace on namespace.oid = child.relnamespace
     where inheritance.inhparent = 'public.audit_log'::regclass
       and namespace.nspname = 'public'
       and child.relname ~ '^audit_log_[0-9]{4}_(0[1-9]|1[0-2])$'
     order by child.relname
  loop
    partition_month := to_date(substring(partition_record.table_name from 'audit_log_([0-9]{4}_[0-9]{2})'), 'YYYY_MM');

    if partition_month < cutoff_month then
      execute format(
        'ALTER TABLE public.audit_log DETACH PARTITION %I.%I',
        partition_record.schema_name,
        partition_record.table_name
      );
      detached_count := detached_count + 1;
    end if;
  end loop;

  return detached_count;
end;
$_$;


--
-- Name: FUNCTION audit_log_detach_old(months integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.audit_log_detach_old(months integer) IS 'Detach audit_log monthly partitions older than the supplied number of months; invoke with 84 for 7-year retention.';


--
-- Name: backfill_initial_shared_boms_from_legacy_npd(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.backfill_initial_shared_boms_from_legacy_npd() RETURNS integer
    LANGUAGE plpgsql
    AS $$
declare
  v_created integer := 0;
begin
  with candidates as (
    select product_row.org_id, product_row.product_code, project.id as project_id, product_row.created_by_user
    from public.product product_row
    left join public.npd_projects project
      on project.org_id = product_row.org_id
     and project.product_code = product_row.product_code
    where (product_row.built = true or lower(coalesce(product_row.status_overall, '')) in ('released', 'built', 'complete', 'launched'))
      and not exists (
        select 1
        from public.bom_headers header
        where header.org_id = product_row.org_id
          and header.product_id = product_row.product_code
          and header.version = 1
      )
      and exists (
        select 1
        from public.prod_detail detail
        where detail.org_id = product_row.org_id
          and detail.product_code = product_row.product_code
          and nullif(detail.intermediate_code, '') is not null
      )
  ),
  inserted_headers as (
    insert into public.bom_headers (
      org_id,
      product_id,
      npd_project_id,
      fa_code,
      origin_module,
      status,
      version,
      technical_review_requested_by,
      technical_review_requested_at,
      notes,
      created_by_user
    )
    select
      candidate.org_id,
      candidate.product_code,
      candidate.project_id,
      candidate.product_code,
      'npd',
      'in_review',
      1,
      candidate.created_by_user,
      pg_catalog.now(),
      'Backfilled initial shared BOM version from Monopilot NPD production detail; pending Technical approval.',
      candidate.created_by_user
    from candidates candidate
    returning id, org_id, product_id, npd_project_id, created_by_user
  ),
  inserted_lines as (
    insert into public.bom_lines (
      org_id,
      bom_header_id,
      line_no,
      component_code,
      component_type,
      quantity,
      uom,
      manufacturing_operation_name,
      sequence,
      source,
      notes
    )
    select
      detail.org_id,
      header.id,
      detail.component_index,
      detail.intermediate_code,
      'WIP',
      coalesce(detail.component_weight, 1.000000)::numeric(14,6),
      'kg',
      coalesce(
        nullif(detail.manufacturing_operation_1, ''),
        nullif(detail.manufacturing_operation_2, ''),
        nullif(detail.manufacturing_operation_3, ''),
        nullif(detail.manufacturing_operation_4, '')
      ),
      detail.component_index,
      'prod_detail',
      'Backfilled from NPD production detail.'
    from inserted_headers header
    join public.prod_detail detail
      on detail.org_id = header.org_id
     and detail.product_code = header.product_id
    where nullif(detail.intermediate_code, '') is not null
    on conflict on constraint bom_lines_header_line_unique do nothing
    returning 1
  ),
  inserted_events as (
    insert into public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
    select
      header.org_id,
      'bom.initial_version_created',
      'bom',
      header.id,
      jsonb_build_object(
        'project_id', header.npd_project_id,
        'product_id', header.product_id,
        'bom_header_id', header.id,
        'version', 1,
        'origin_module', 'npd',
        'status', 'in_review',
        'backfilled', true
      ),
      'db-099'
    from inserted_headers header
    returning 1
  )
  select count(*)::integer
    into v_created
  from inserted_headers;

  return v_created;
end;
$$;


--
-- Name: bom_co_products_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bom_co_products_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


--
-- Name: bom_factory_release_bundle_decision(uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bom_factory_release_bundle_decision(p_bom_header_id uuid, p_factory_spec_id uuid, p_split_allowed boolean DEFAULT false) RETURNS TABLE(decision text, reason text, bom_ready boolean, factory_spec_ready boolean)
    LANGUAGE plpgsql STABLE
    AS $$
declare
  v_org_id uuid := app.current_org_id();
  v_bom_status text;
  v_spec_status text;
  v_bom_ready boolean;
  v_spec_ready boolean;
begin
  select header.status into v_bom_status
  from public.bom_headers header
  where header.id = p_bom_header_id and header.org_id = v_org_id;

  if v_bom_status is null then
    raise exception 'BOM version not found in current org: %', p_bom_header_id
      using errcode = 'P0002';
  end if;

  select spec.status into v_spec_status
  from public.factory_specs spec
  where spec.id = p_factory_spec_id and spec.org_id = v_org_id;

  if v_spec_status is null then
    raise exception 'factory_spec version not found in current org: %', p_factory_spec_id
      using errcode = 'P0002';
  end if;

  -- A BOM is release-ready when Technical has approved/activated it.
  v_bom_ready  := v_bom_status in ('technical_approved', 'active');
  -- A factory_spec is release-ready when it is factory-usable.
  v_spec_ready := v_spec_status in ('approved_for_factory', 'released_to_factory');

  if v_bom_ready and v_spec_ready then
    return query select 'approve'::text, null::text, v_bom_ready, v_spec_ready;
    return;
  end if;

  -- One side ready, the other not => partial. Only an explicit split unblocks the ready side.
  if (v_bom_ready or v_spec_ready) and p_split_allowed then
    return query select 'approve'::text, 'SPLIT_APPROVED'::text, v_bom_ready, v_spec_ready;
    return;
  end if;

  if (v_bom_ready or v_spec_ready) and not p_split_allowed then
    return query select 'reject'::text, 'PARTIAL_RELEASE_NOT_ALLOWED'::text, v_bom_ready, v_spec_ready;
    return;
  end if;

  -- Neither ready: surface the BOM reason first (deterministic), else the spec reason.
  if not v_bom_ready then
    return query select 'reject'::text, 'BOM_NOT_APPROVED'::text, v_bom_ready, v_spec_ready;
    return;
  end if;

  return query select 'reject'::text, 'FACTORY_SPEC_NOT_APPROVED'::text, v_bom_ready, v_spec_ready;
end;
$$;


--
-- Name: FUNCTION bom_factory_release_bundle_decision(p_bom_header_id uuid, p_factory_spec_id uuid, p_split_allowed boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.bom_factory_release_bundle_decision(p_bom_header_id uuid, p_factory_spec_id uuid, p_split_allowed boolean) IS 'T-073: atomic FactorySpec+BOM release decision. Rejects partial release unless a Technical approver explicitly splits the bundle. Read-only; caller applies the transition.';


--
-- Name: bom_generator_jobs_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bom_generator_jobs_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


--
-- Name: bom_headers_enforce_status_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bom_headers_enforce_status_transition() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_ok boolean;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  v_ok := case old.status
    when 'draft'              then new.status in ('in_review', 'technical_approved', 'active', 'archived')
    when 'in_review'          then new.status in ('draft', 'technical_approved', 'active', 'archived')
    when 'technical_approved' then new.status in ('in_review', 'active', 'superseded', 'archived')
    when 'active'             then new.status in ('superseded', 'archived')
    when 'superseded'         then new.status in ('archived')
    when 'archived'           then false
    else false
  end;

  if not v_ok then
    raise exception
      'invalid BOM version status transition % -> % (clone-on-write: an immutable version may only terminalize, never re-open; create a new draft version instead)',
      old.status, new.status
      using errcode = '23514';
  end if;

  return new;
end;
$$;


--
-- Name: FUNCTION bom_headers_enforce_status_transition(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.bom_headers_enforce_status_transition() IS 'T-073: BOM version state-machine guard. Allows only valid forward lifecycle transitions; rejects illegal jumps/backward moves. Complements the 090 content-immutability trigger.';


--
-- Name: bom_headers_reject_approved_content_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bom_headers_reject_approved_content_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if old.status in ('technical_approved', 'active')
     and (
       new.org_id is distinct from old.org_id
       or new.product_id is distinct from old.product_id
       or new.npd_project_id is distinct from old.npd_project_id
       or new.fa_code is distinct from old.fa_code
       or new.origin_module is distinct from old.origin_module
       or new.version is distinct from old.version
       or new.supersedes_bom_header_id is distinct from old.supersedes_bom_header_id
       or new.yield_pct is distinct from old.yield_pct
       or new.effective_from is distinct from old.effective_from
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at
       or new.technical_review_requested_by is distinct from old.technical_review_requested_by
       or new.technical_review_requested_at is distinct from old.technical_review_requested_at
       or new.notes is distinct from old.notes
       or new.created_at is distinct from old.created_at
       or new.created_by_user is distinct from old.created_by_user
       or new.created_by_device is distinct from old.created_by_device
       or new.app_version is distinct from old.app_version
       or new.schema_version is distinct from old.schema_version
     ) then
    raise exception 'approved or active BOM versions are immutable; create a superseding bom_headers version instead';
  end if;

  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


--
-- Name: bom_lines_reject_approved_header_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bom_lines_reject_approved_header_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_header_status text;
begin
  select status into v_header_status
  from public.bom_headers
  where id = coalesce(new.bom_header_id, old.bom_header_id);

  if v_header_status in ('technical_approved', 'active') then
    raise exception 'approved or active BOM line content is immutable; create a superseding bom_headers version instead';
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := pg_catalog.now();
    return new;
  elsif tg_op = 'INSERT' then
    return new;
  elsif tg_op = 'DELETE' then
    return old;
  end if;

  raise exception 'unsupported bom_lines immutability trigger operation: %', tg_op;
end;
$$;


--
-- Name: bom_request_version_edit(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bom_request_version_edit(p_source_bom_header_id uuid, p_requested_by uuid, p_notes text DEFAULT NULL::text) RETURNS TABLE(decision text, bom_header_id uuid, status text, version integer, supersedes_bom_header_id uuid)
    LANGUAGE plpgsql
    AS $$
declare
  v_org_id uuid := app.current_org_id();
  v_src public.bom_headers%rowtype;
  v_new_id uuid;
  v_decision text;
begin
  select *
    into v_src
  from public.bom_headers header
  where header.id = p_source_bom_header_id
    and header.org_id = v_org_id;

  if v_src.id is null then
    raise exception 'BOM version not found in current org: %', p_source_bom_header_id
      using errcode = 'P0002';
  end if;

  if v_src.status not in ('technical_approved', 'active') then
    raise exception
      'BOM version % is in status % and is directly editable; clone-on-write only applies to technical_approved/active versions',
      p_source_bom_header_id, v_src.status
      using errcode = '23514';
  end if;

  -- Idempotency: reuse an existing in-flight superseding draft/in_review version if present.
  select header.id
    into v_new_id
  from public.bom_headers header
  where header.org_id = v_org_id
    and header.supersedes_bom_header_id = v_src.id
    and header.status in ('draft', 'in_review')
  order by header.created_at
  limit 1;

  if v_new_id is not null then
    v_decision := 'existing';
  else
    v_decision := 'cloned';

    insert into public.bom_headers (
      org_id, product_id, npd_project_id, fa_code, origin_module, status, version,
      supersedes_bom_header_id, yield_pct, effective_from,
      technical_review_requested_by, technical_review_requested_at, notes, created_by_user
    )
    values (
      v_org_id, v_src.product_id, v_src.npd_project_id, v_src.fa_code, 'technical', 'in_review',
      v_src.version + 1, v_src.id, v_src.yield_pct, current_date,
      p_requested_by, pg_catalog.now(),
      coalesce(p_notes, 'Technical post-release edit; new version pending Technical approval (clone-on-write).'),
      p_requested_by
    )
    returning id into v_new_id;

    insert into public.bom_lines (
      org_id, bom_header_id, line_no, component_code, component_type, item_id, quantity, uom,
      scrap_pct, manufacturing_operation_name, sequence, is_phantom, source, notes
    )
    select
      line.org_id, v_new_id, line.line_no, line.component_code, line.component_type, line.item_id,
      line.quantity, line.uom, line.scrap_pct, line.manufacturing_operation_name, line.sequence,
      line.is_phantom, 'superseded_copy', 'Copied from prior immutable BOM version (clone-on-write).'
    from public.bom_lines line
    where line.org_id = v_org_id
      and line.bom_header_id = v_src.id
    order by line.line_no;

    insert into public.bom_co_products (
      org_id, bom_header_id, co_product_item_id, quantity, uom, allocation_pct, is_byproduct, site_id
    )
    select
      cp.org_id, v_new_id, cp.co_product_item_id, cp.quantity, cp.uom, cp.allocation_pct,
      cp.is_byproduct, cp.site_id
    from public.bom_co_products cp
    where cp.org_id = v_org_id
      and cp.bom_header_id = v_src.id;

    -- Reuse the already-registered outbox event (migration 151 SoT). No new event type.
    insert into public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
    select
      v_org_id, 'bom.version_submitted', 'bom', v_new_id,
      jsonb_build_object(
        'previous_bom_header_id', v_src.id,
        'bom_header_id', v_new_id,
        'status', 'in_review',
        'origin', 'technical_clone_on_write',
        'requires_technical_approval', true
      ),
      'db-168'
    where not exists (
      select 1 from public.outbox_events event
      where event.org_id = v_org_id
        and event.event_type = 'bom.version_submitted'
        and event.aggregate_id = v_new_id::text
    );
  end if;

  return query
  select v_decision, header.id, header.status, header.version, header.supersedes_bom_header_id
  from public.bom_headers header
  where header.id = v_new_id
    and header.org_id = v_org_id;
end;
$$;


--
-- Name: FUNCTION bom_request_version_edit(p_source_bom_header_id uuid, p_requested_by uuid, p_notes text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.bom_request_version_edit(p_source_bom_header_id uuid, p_requested_by uuid, p_notes text) IS 'T-073: generic clone-on-write for the shared BOM SSOT. Clones an immutable (technical_approved/active) version into a new in_review draft routed to Technical approval; never mutates the source. Returns a typed decision (cloned|existing).';


--
-- Name: bom_snapshots_reject_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bom_snapshots_reject_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception 'bom_snapshots rows are immutable; insert a new snapshot instead of updating or deleting';
end;
$$;


--
-- Name: compliance_docs_expiry_scan(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compliance_docs_expiry_scan() RETURNS TABLE(org_id uuid, doc_id uuid, product_code text, doc_type text, title text, expires_at date, previous_state text, expiry_state text, uploaded_by_user uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_today date := current_date;
begin
  return query
  with scoped as (
    select
      d.id,
      d.org_id,
      d.product_code,
      d.doc_type,
      d.title,
      d.expires_at,
      d.expiry_state as old_state,
      d.uploaded_by_user,
      case
        when d.expires_at is null then 'Valid'
        when d.expires_at < v_today then 'Expired'
        when d.expires_at <= v_today + 30 then 'Expiring'
        else 'Valid'
      end as next_state
    from public.compliance_docs d
    where d.deleted_at is null
  ),
  changed as (
    update public.compliance_docs d
       set expiry_state = scoped.next_state,
           last_expiry_scan_at = pg_catalog.now()
      from scoped
     where d.id = scoped.id
       and d.expiry_state is distinct from scoped.next_state
     returning
       d.org_id,
       d.id as doc_id,
       d.product_code,
       d.doc_type,
       d.title,
       d.expires_at,
       scoped.old_state as previous_state,
       d.expiry_state,
       d.uploaded_by_user
  )
  select
    changed.org_id,
    changed.doc_id,
    changed.product_code,
    changed.doc_type,
    changed.title,
    changed.expires_at,
    changed.previous_state,
    changed.expiry_state,
    changed.uploaded_by_user
  from changed
  where changed.expiry_state in ('Expiring', 'Expired')
  order by changed.org_id, changed.doc_id;
end;
$$;


--
-- Name: FUNCTION compliance_docs_expiry_scan(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.compliance_docs_expiry_scan() IS 'T-085: SECURITY DEFINER service-role expiry-state scanner for compliance docs expiring in <=30 days or already expired.';


--
-- Name: create_initial_shared_bom_version_for_npd_project(uuid, text, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_initial_shared_bom_version_for_npd_project(p_project_id uuid, p_product_id text DEFAULT NULL::text, p_created_by_user uuid DEFAULT NULL::uuid, p_initial_version integer DEFAULT 1) RETURNS TABLE(bom_header_id uuid, status text, version integer, line_count bigint)
    LANGUAGE plpgsql
    AS $$
declare
  v_org_id uuid := app.current_org_id();
  v_product_id text;
  v_header_id uuid;
  v_line_count bigint;
begin
  if p_initial_version is null or p_initial_version < 1 then
    raise exception 'initial BOM version must be a positive integer';
  end if;

  select coalesce(p_product_id, project.product_code)
    into v_product_id
  from public.npd_projects project
  where project.id = p_project_id
    and project.org_id = v_org_id;

  if v_product_id is null then
    raise exception 'NPD project not found or has no released FG product mapping: %', p_project_id;
  end if;

  if not exists (
    select 1
    from public.product product_row
    where product_row.product_code = v_product_id
      and product_row.org_id = v_org_id
  ) then
    raise exception 'Released FG product not found for NPD project: %', v_product_id;
  end if;

  select header.id
    into v_header_id
  from public.bom_headers header
  where header.org_id = v_org_id
    and header.product_id = v_product_id
    and header.version = p_initial_version
  order by header.created_at
  limit 1;

  if v_header_id is null then
    insert into public.bom_headers (
      org_id,
      product_id,
      npd_project_id,
      fa_code,
      origin_module,
      status,
      version,
      technical_review_requested_by,
      technical_review_requested_at,
      notes,
      created_by_user
    )
    values (
      v_org_id,
      v_product_id,
      p_project_id,
      v_product_id,
      'npd',
      'in_review',
      p_initial_version,
      p_created_by_user,
      pg_catalog.now(),
      'Initial shared BOM version created by NPD Builder; pending Technical approval before factory use.',
      p_created_by_user
    )
    returning id into v_header_id;
  end if;

  insert into public.bom_lines (
    org_id,
    bom_header_id,
    line_no,
    component_code,
    component_type,
    quantity,
    uom,
    manufacturing_operation_name,
    sequence,
    source,
    notes
  )
  select
    detail.org_id,
    v_header_id,
    detail.component_index,
    detail.intermediate_code,
    'WIP',
    coalesce(detail.component_weight, 1.000000)::numeric(14,6),
    'kg',
    coalesce(
      nullif(detail.manufacturing_operation_1, ''),
      nullif(detail.manufacturing_operation_2, ''),
      nullif(detail.manufacturing_operation_3, ''),
      nullif(detail.manufacturing_operation_4, '')
    ),
    detail.component_index,
    'prod_detail',
    'Copied from NPD production detail at initial release.'
  from public.prod_detail detail
  where detail.org_id = v_org_id
    and detail.product_code = v_product_id
    and nullif(detail.intermediate_code, '') is not null
  on conflict on constraint bom_lines_header_line_unique do nothing;

  select count(*)::bigint
    into v_line_count
  from public.bom_lines line
  where line.org_id = v_org_id
    and line.bom_header_id = v_header_id;

  if v_line_count = 0 then
    raise exception 'Initial shared BOM for % has no component lines', v_product_id;
  end if;

  insert into public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
  select
    v_org_id,
    'bom.initial_version_created',
    'bom',
    v_header_id,
    jsonb_build_object(
      'project_id', p_project_id,
      'product_id', v_product_id,
      'bom_header_id', v_header_id,
      'version', p_initial_version,
      'line_count', v_line_count,
      'origin_module', 'npd',
      'status', 'in_review'
    ),
    'db-099'
  where not exists (
    select 1
    from public.outbox_events event
    where event.org_id = v_org_id
      and event.event_type = 'bom.initial_version_created'
      and event.aggregate_id = v_header_id::text
  );

  insert into public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
  select
    v_org_id,
    'fg.bom.released',
    'fg',
    p_project_id,
    jsonb_build_object(
      'project_id', p_project_id,
      'product_id', v_product_id,
      'bom_header_id', v_header_id,
      'version', p_initial_version,
      'factory_active', false,
      'requires_technical_approval', true
    ),
    'db-099'
  where not exists (
    select 1
    from public.outbox_events event
    where event.org_id = v_org_id
      and event.event_type = 'fg.bom.released'
      and event.aggregate_id = p_project_id::text
      and event.payload->>'bom_header_id' = v_header_id::text
  );

  return query
  select v_header_id, header.status, header.version, v_line_count
  from public.bom_headers header
  where header.id = v_header_id
    and header.org_id = v_org_id;
end;
$$;


--
-- Name: FUNCTION create_initial_shared_bom_version_for_npd_project(p_project_id uuid, p_product_id text, p_created_by_user uuid, p_initial_version integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_initial_shared_bom_version_for_npd_project(p_project_id uuid, p_product_id text, p_created_by_user uuid, p_initial_version integer) IS 'T-093: NPD Builder primitive that writes the initial shared BOM SSOT version from Monopilot-owned prod_detail rows; idempotent and pending Technical approval. (145: outbox aggregate_id text cast)';


--
-- Name: d365_sync_dlq_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.d365_sync_dlq_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


--
-- Name: d365_sync_jobs_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.d365_sync_jobs_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


--
-- Name: fa_actor_from_local_context(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fa_actor_from_local_context() RETURNS uuid
    LANGUAGE plpgsql STABLE
    AS $$
declare
  v_actor text;
begin
  v_actor := nullif(current_setting('app.fa_actor_user_id', true), '');
  if v_actor is null then
    return null;
  end if;
  return v_actor::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;


--
-- Name: fa_allergen_overrides_audit_after_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fa_allergen_overrides_audit_after_insert() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
begin
  insert into public.audit_events (
    org_id,
    actor_user_id,
    actor_type,
    action,
    resource_type,
    resource_id,
    after_state,
    request_id,
    retention_class
  )
  values (
    new.org_id,
    new.actor_user_id,
    'user',
    'INSERT',
    'fa_allergen_overrides',
    new.id::text,
    jsonb_build_object(
      'table', 'fa_allergen_overrides',
      'op', 'INSERT',
      'row', to_jsonb(new)
    ),
    gen_random_uuid(),
    'standard'
  );

  return new;
end;
$$;


--
-- Name: fa_allergen_overrides_chain_before_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fa_allergen_overrides_chain_before_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  prior_current public.fa_allergen_overrides%rowtype;
begin
  if new.superseded_at is not null then
    raise exception 'new fa_allergen_overrides rows must be current at insert'
      using errcode = '23514';
  end if;

  if new.supersedes_id is not null then
    select *
      into prior_current
      from public.fa_allergen_overrides
     where id = new.supersedes_id
     for update;

    if not found then
      raise exception 'supersedes_id % does not reference an existing override', new.supersedes_id
        using errcode = '23503';
    end if;

    if prior_current.org_id <> new.org_id
       or prior_current.product_code <> new.product_code
       or prior_current.allergen_code <> new.allergen_code then
      raise exception 'supersedes_id must reference the same org/product/allergen chain'
        using errcode = '23514';
    end if;

    if prior_current.superseded_at is not null then
      raise exception 'supersedes_id must reference the current override row'
        using errcode = '23514';
    end if;
  else
    select *
      into prior_current
      from public.fa_allergen_overrides
     where org_id = new.org_id
       and product_code = new.product_code
       and allergen_code = new.allergen_code
       and superseded_at is null
     order by created_at desc, id desc
     limit 1
     for update;

    if found then
      new.supersedes_id := prior_current.id;
    end if;
  end if;

  if new.supersedes_id is not null then
    update public.fa_allergen_overrides
       set superseded_at = new.created_at
     where id = new.supersedes_id;
  end if;

  return new;
end;
$$;


--
-- Name: fa_builder_outputs_before_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fa_builder_outputs_before_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  product_org_id uuid;
  user_org_id uuid;
begin
  select product.org_id
    into product_org_id
  from public.product
  where product.product_code = new.product_code;

  if product_org_id is null then
    raise exception 'Product % does not exist', new.product_code
      using errcode = '23503';
  end if;

  if product_org_id <> new.org_id then
    raise exception 'Product % does not belong to current org', new.product_code
      using errcode = '42501';
  end if;

  select users.org_id
    into user_org_id
  from public.users
  where users.id = new.generated_by_user;

  if user_org_id is null then
    raise exception 'Generated-by user % does not exist', new.generated_by_user
      using errcode = '23503';
  end if;

  if user_org_id <> new.org_id then
    raise exception 'Generated-by user % does not belong to current org', new.generated_by_user
      using errcode = '42501';
  end if;

  update public.fa_builder_outputs
     set superseded_at = coalesce(new.generated_at, now())
   where org_id = new.org_id
     and product_code = new.product_code
     and superseded_at is null;

  return new;
end;
$$;


--
-- Name: fa_built_v18_check_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fa_built_v18_check_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.built is false and old.built is true then
    if coalesce(current_setting('app.fa_built_reset_allowed', true), '') <> 'on' then
      raise exception 'V18_BUILT_DOWNGRADE_REQUIRES_AUDIT'
        using errcode = '23514';
    end if;
  end if;

  if new.built is true and old.built is false then
    if exists (
      select 1
      from public.risks risk
      where risk.org_id = new.org_id
        and risk.product_code = new.product_code
        and risk.bucket = 'High'
        and risk.state = 'Open'
    ) then
      raise exception 'V18_HIGH_RISK_OPEN'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: fa_reject_writes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fa_reject_writes() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception 'fa is a read-only compatibility view';
end;
$$;


--
-- Name: fa_reset_built_on_prod_detail_edit_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fa_reset_built_on_prod_detail_edit_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  v_old := to_jsonb(old) - 'created_at';
  v_new := to_jsonb(new) - 'created_at';

  if v_old is distinct from v_new then
    perform public.fa_reset_product_built_for_edit(
      new.org_id,
      new.product_code,
      public.fa_actor_from_local_context(),
      'prod_detail',
      '{}'::jsonb
    );
  end if;

  return new;
end;
$$;


--
-- Name: fa_reset_built_on_product_edit_fn(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fa_reset_built_on_product_edit_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_old jsonb;
  v_new jsonb;
  v_actor uuid;
  v_diff jsonb := '{}'::jsonb;
begin
  v_old := to_jsonb(old) - 'built';
  v_new := to_jsonb(new) - 'built';

  if old.built is true and v_old is distinct from v_new then
    new.built := false;
    v_actor := public.fa_actor_from_local_context();

    insert into public.outbox_events
      (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
    values
      (
        new.org_id,
        'fa.built_reset',
        'fa',
        new.product_code,
        jsonb_build_object(
          'org_id', new.org_id,
          'product_code', new.product_code,
          'actor_user_id', v_actor,
          'source', 'product',
          'diff', v_diff
        ),
        'update-fa-cell-reset-built-v1'
      );
  end if;

  return new;
end;
$$;


--
-- Name: fa_reset_product_built_for_edit(uuid, text, uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fa_reset_product_built_for_edit(p_org_id uuid, p_product_code text, p_actor_user_id uuid, p_source text, p_diff jsonb DEFAULT '{}'::jsonb) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
declare
  v_reset boolean := false;
  v_row_count integer := 0;
begin
  perform set_config('app.fa_built_reset_allowed', 'on', true);

  update public.product
     set built = false
   where org_id = p_org_id
     and product_code = p_product_code
     and built = true;

  get diagnostics v_row_count = row_count;
  v_reset := v_row_count > 0;
  perform set_config('app.fa_built_reset_allowed', 'off', true);

  if v_reset then
    insert into public.outbox_events
      (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
    values
      (
        p_org_id,
        'fa.built_reset',
        'fa',
        p_product_code,
        jsonb_build_object(
          'org_id', p_org_id,
          'product_code', p_product_code,
          'actor_user_id', p_actor_user_id,
          'source', p_source,
          'diff', coalesce(p_diff, '{}'::jsonb)
        ),
        'update-fa-cell-reset-built-v1'
      );
  end if;

  return v_reset;
end;
$$;


--
-- Name: factory_release_status_validate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.factory_release_status_validate() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  project_row record;
  product_org_id uuid;
  bom_row record;
  actor_org_id uuid;
  event_org_id uuid;
begin
  select p.org_id, p.product_code
    into project_row
  from public.npd_projects p
  where p.id = new.project_id;

  if project_row.org_id is null then
    raise exception 'NPD project % does not exist', new.project_id
      using errcode = '23503';
  end if;

  if project_row.org_id <> new.org_id then
    raise exception 'NPD project % does not belong to release org', new.project_id
      using errcode = '42501';
  end if;

  if project_row.product_code is not null and project_row.product_code <> new.product_code then
    raise exception 'NPD project % is not linked to product %', new.project_id, new.product_code
      using errcode = '23514';
  end if;

  select product.org_id
    into product_org_id
  from public.product
  where product.product_code = new.product_code;

  if product_org_id is null then
    raise exception 'Product % does not exist', new.product_code
      using errcode = '23503';
  end if;

  if product_org_id <> new.org_id then
    raise exception 'Product % does not belong to release org', new.product_code
      using errcode = '42501';
  end if;

  if new.active_bom_header_id is not null then
    select h.org_id, h.product_id, h.npd_project_id, h.status
      into bom_row
    from public.bom_headers h
    where h.id = new.active_bom_header_id;

    if bom_row.org_id is null then
      raise exception 'BOM header % does not exist', new.active_bom_header_id
        using errcode = '23503';
    end if;

    if bom_row.org_id <> new.org_id then
      raise exception 'BOM header % does not belong to release org', new.active_bom_header_id
        using errcode = '42501';
    end if;

    if bom_row.product_id is not null and bom_row.product_id <> new.product_code then
      raise exception 'BOM header % is not linked to product %', new.active_bom_header_id, new.product_code
        using errcode = '23514';
    end if;

    if bom_row.npd_project_id is not null and bom_row.npd_project_id <> new.project_id then
      raise exception 'BOM header % is not linked to project %', new.active_bom_header_id, new.project_id
        using errcode = '23514';
    end if;

    if new.release_status in ('approved_for_factory', 'released_to_factory')
       and bom_row.status not in ('technical_approved', 'active') then
      raise exception 'factory-usable release requires Technical-approved active BOM/spec evidence'
        using errcode = '23514';
    end if;
  end if;

  if new.factory_approved_by is not null then
    select users.org_id
      into actor_org_id
    from public.users
    where users.id = new.factory_approved_by;

    if actor_org_id is null then
      raise exception 'Factory approver % does not exist', new.factory_approved_by
        using errcode = '23503';
    end if;

    if actor_org_id <> new.org_id then
      raise exception 'Factory approver % does not belong to release org', new.factory_approved_by
        using errcode = '42501';
    end if;
  end if;

  if new.requested_by is not null then
    select users.org_id
      into actor_org_id
    from public.users
    where users.id = new.requested_by;

    if actor_org_id is null then
      raise exception 'Release requester % does not exist', new.requested_by
        using errcode = '23503';
    end if;

    if actor_org_id <> new.org_id then
      raise exception 'Release requester % does not belong to release org', new.requested_by
        using errcode = '42501';
    end if;
  end if;

  if new.release_event_id is not null then
    select outbox_events.org_id
      into event_org_id
    from public.outbox_events
    where outbox_events.id = new.release_event_id;

    if event_org_id is null then
      raise exception 'Release event % does not exist', new.release_event_id
        using errcode = '23503';
    end if;

    if event_org_id <> new.org_id then
      raise exception 'Release event % does not belong to release org', new.release_event_id
        using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;


--
-- Name: factory_specs_enforce_clone_on_write(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.factory_specs_enforce_clone_on_write() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  business_changed boolean;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  -- Only guard rows that are already in a factory-usable (immutable) state.
  if old.status not in ('approved_for_factory', 'released_to_factory') then
    return new;
  end if;

  -- Did any immutable business field change?
  business_changed := (
    new.org_id is distinct from old.org_id
    or new.fg_item_id is distinct from old.fg_item_id
    or new.spec_code is distinct from old.spec_code
    or new.version is distinct from old.version
    or new.source is distinct from old.source
    or new.bom_header_id is distinct from old.bom_header_id
    or new.bom_version is distinct from old.bom_version
    or new.supersedes_factory_spec_id is distinct from old.supersedes_factory_spec_id
    or new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at
    or new.notes is distinct from old.notes
    or new.site_id is distinct from old.site_id
    or new.d365_item_id is distinct from old.d365_item_id
    or new.schema_version is distinct from old.schema_version
  );

  if business_changed then
    raise exception
      'factory_specs version % (status %) is immutable; edits must create a new version (clone-on-write)',
      old.version, old.status
      using errcode = '23514';
  end if;

  -- Status may only move forward to a terminal/release state — never back to a draft/working state.
  if new.status is distinct from old.status
     and new.status not in ('released_to_factory', 'superseded', 'archived') then
    raise exception
      'factory_specs approved version cannot transition from % to % in place (clone-on-write)',
      old.status, new.status
      using errcode = '23514';
  end if;

  return new;
end;
$$;


--
-- Name: factory_specs_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.factory_specs_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


--
-- Name: feature_flags_core_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.feature_flags_core_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin new.updated_at := pg_catalog.now(); return new; end; $$;


--
-- Name: formulation_audit_log_reject_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.formulation_audit_log_reject_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'formulation_audit_log is append-only; cannot update audit rows';
  elsif tg_op = 'DELETE' then
    raise exception 'formulation_audit_log is append-only; cannot delete audit rows';
  end if;

  return new;
end;
$$;


--
-- Name: formulation_ingredients_reject_locked_version_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.formulation_ingredients_reject_locked_version_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_version_id uuid;
  v_state text;
begin
  v_version_id := case when tg_op = 'DELETE' then old.version_id else new.version_id end;

  select version.state into v_state
  from public.formulation_versions version
  where version.id = v_version_id;

  if v_state = 'locked' then
    raise exception 'locked formulation versions cannot mutate ingredient rows';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;


--
-- Name: formulation_versions_enforce_state_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.formulation_versions_enforce_state_transition() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if tg_op = 'UPDATE' and new.state is distinct from old.state then
    if old.state = 'locked' then
      raise exception 'locked formulation versions cannot change state';
    end if;

    if old.state = 'submitted_for_trial' and new.state = 'draft' then
      raise exception 'formulation versions cannot transition from submitted_for_trial to draft';
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: formulations_validate_org_links(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.formulations_validate_org_links() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_project_org_id uuid;
  v_product_org_id uuid;
  v_current_formulation_id uuid;
begin
  select project.org_id into v_project_org_id
  from public.npd_projects project
  where project.id = new.project_id;

  if v_project_org_id is null then
    raise exception 'formulation project_id % does not exist', new.project_id;
  end if;

  if v_project_org_id is distinct from new.org_id then
    raise exception 'formulation org_id must match npd_projects.org_id';
  end if;

  if new.product_code is not null then
    select product.org_id into v_product_org_id
    from public.product product
    where product.product_code = new.product_code;

    if v_product_org_id is null then
      raise exception 'formulation product_code % does not exist', new.product_code;
    end if;

    if v_product_org_id is distinct from new.org_id then
      raise exception 'formulation org_id must match product.org_id';
    end if;
  end if;

  if new.current_version_id is not null then
    select version.formulation_id into v_current_formulation_id
    from public.formulation_versions version
    where version.id = new.current_version_id;

    if v_current_formulation_id is distinct from new.id then
      raise exception 'current_version_id must belong to the same formulation';
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: gdpr_redact_user_pii(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gdpr_redact_user_pii(target_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
declare
  v_org_id        uuid := app.current_org_id();
  v_placeholder   constant uuid := '00000000-0000-0000-0000-000000000000';
  v_counts        jsonb := '{}'::jsonb;
  v_n             integer;
begin
  if v_org_id is null then
    raise exception 'gdpr_redact_user_pii: no org context set (app.current_org_id() is null)'
      using errcode = '42501';
  end if;

  -- Never let a caller "erase" the sentinel itself.
  if target_user_id = v_placeholder then
    raise exception 'gdpr_redact_user_pii: refusing to redact the anonymisation sentinel';
  end if;

  -- product (the "fa" compatibility view's backing table)
  update public.product
     set created_by_user = v_placeholder
   where org_id = v_org_id and created_by_user = target_user_id;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('product', v_n, 'fa', v_n);

  -- brief
  update public.brief
     set created_by_user   = case when created_by_user   = target_user_id then v_placeholder else created_by_user end,
         converted_by_user = case when converted_by_user = target_user_id then v_placeholder else converted_by_user end
   where org_id = v_org_id
     and (created_by_user = target_user_id or converted_by_user = target_user_id);
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('brief', v_n);

  -- npd_projects
  update public.npd_projects
     set created_by_user = v_placeholder
   where org_id = v_org_id and created_by_user = target_user_id;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('npd_projects', v_n);

  -- gate_checklist_items
  update public.gate_checklist_items
     set completed_by_user = v_placeholder
   where org_id = v_org_id and completed_by_user = target_user_id;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('gate_checklist_items', v_n);

  -- gate_approvals
  update public.gate_approvals
     set approver_user_id = v_placeholder
   where org_id = v_org_id and approver_user_id = target_user_id;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('gate_approvals', v_n);

  -- formulations
  update public.formulations
     set created_by_user = case when created_by_user = target_user_id then v_placeholder else created_by_user end,
         locked_by_user  = case when locked_by_user  = target_user_id then v_placeholder else locked_by_user end
   where org_id = v_org_id
     and (created_by_user = target_user_id or locked_by_user = target_user_id);
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('formulations', v_n);

  -- risks
  update public.risks
     set owner_user_id  = case when owner_user_id  = target_user_id then v_placeholder else owner_user_id end,
         created_by_user= case when created_by_user= target_user_id then v_placeholder else created_by_user end,
         closed_by_user = case when closed_by_user = target_user_id then v_placeholder else closed_by_user end
   where org_id = v_org_id
     and (owner_user_id = target_user_id or created_by_user = target_user_id or closed_by_user = target_user_id);
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('risks', v_n);

  -- compliance_docs
  update public.compliance_docs
     set uploaded_by_user = case when uploaded_by_user = target_user_id then v_placeholder else uploaded_by_user end,
         created_by_user   = case when created_by_user   = target_user_id then v_placeholder else created_by_user end
   where org_id = v_org_id
     and (uploaded_by_user = target_user_id or created_by_user = target_user_id);
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('compliance_docs', v_n);

  -- Module audit tables: keep the row (regulatory audit retention) but anonymise the
  -- actor FK so the subject's identity is erased per Art. 17 while history survives.
  update public.formulation_audit_log
     set actor_user_id = v_placeholder
   where actor_user_id = target_user_id
     and formulation_id in (
       select f.id from public.formulations f where f.org_id = v_org_id
     );
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('formulation_audit_log', v_n);

  update public.fa_allergen_overrides
     set actor_user_id = v_placeholder
   where org_id = v_org_id and actor_user_id = target_user_id;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('fa_allergen_overrides', v_n);

  -- formulation_versions has no org_id column; scope through the parent formulation.
  update public.formulation_versions fv
     set created_by_user = v_placeholder
   where fv.created_by_user = target_user_id
     and fv.formulation_id in (
       select f.id from public.formulations f where f.org_id = v_org_id
     );
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('formulation_versions', v_n);

  -- prod_detail (Production Detail Dept block) — named in the T-089 erasure scope.
  -- The table currently carries NO user-FK (org_id + product_code only), so there
  -- is nothing to pseudonymise: the count is always 0. We still emit an explicit
  -- prod_detail key so the contract's named scope is provably covered, and so a
  -- future user-FK on this table becomes a single-line change (add it to the
  -- WHERE/SET) that the count assertions immediately exercise.
  v_n := 0;
  v_counts := v_counts || jsonb_build_object('prod_detail', v_n);

  -- Audit: one security-retained row per invocation (AC2 / Foundation §15).
  insert into public.audit_events (
    org_id, actor_type, action, resource_type, resource_id,
    before_state, after_state, request_id, retention_class
  )
  values (
    v_org_id,
    'system',
    'gdpr.erasure_executed',
    'gdpr_erasure',
    target_user_id::text,
    null,
    jsonb_build_object(
      'target_user_id', target_user_id,
      'placeholder_user_id', v_placeholder,
      'counts', v_counts
    ),
    gen_random_uuid(),
    'security'
  );

  return v_counts;
end;
$$;


--
-- Name: FUNCTION gdpr_redact_user_pii(target_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gdpr_redact_user_pii(target_user_id uuid) IS 'T-089: GDPR Art.17 right-to-erasure for NPD. Pseudonymises subject user-FK references to the anonymisation sentinel (00000000-…-0000) within the active org context, writes a gdpr.erasure_executed audit_events row, returns per-table counts. SECURITY DEFINER; pseudonymise (never delete); org-scoped via app.current_org_id(). Reciprocal of foundation @monopilot/gdpr handler (T-113).';


--
-- Name: get_fa_bom(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_fa_bom(p_product_code text) RETURNS TABLE(bom_header_id uuid, product_code text, status text, version integer, line_no integer, component_code text, component_type text, quantity numeric, uom text, manufacturing_operation_name text, source text)
    LANGUAGE sql STABLE
    AS $$
  with selected_header as (
    select header.id, header.product_id, header.status, header.version
    from public.bom_headers header
    where header.org_id = app.current_org_id()
      and header.product_id = p_product_code
      and header.status in ('active', 'technical_approved', 'in_review', 'draft')
    order by
      case header.status
        when 'active' then 1
        when 'technical_approved' then 2
        when 'in_review' then 3
        else 4
      end,
      header.version desc,
      header.created_at desc
    limit 1
  )
  select
    header.id,
    header.product_id,
    header.status,
    header.version,
    line.line_no,
    line.component_code,
    line.component_type,
    line.quantity,
    line.uom,
    line.manufacturing_operation_name,
    line.source
  from selected_header header
  join public.bom_lines line
    on line.org_id = app.current_org_id()
   and line.bom_header_id = header.id
  order by line.line_no;
$$;


--
-- Name: FUNCTION get_fa_bom(p_product_code text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_fa_bom(p_product_code text) IS 'T-093: FA compatibility BOM reader backed by public.bom_headers/public.bom_lines, not the deprecated computed fa_bom_view.';


--
-- Name: get_factory_active_bom(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_factory_active_bom(p_product_code text) RETURNS TABLE(bom_header_id uuid, product_code text, status text, version integer, line_no integer, component_code text, quantity numeric, uom text, source text)
    LANGUAGE sql STABLE
    AS $$
  select
    header.id,
    header.product_id,
    header.status,
    header.version,
    line.line_no,
    line.component_code,
    line.quantity,
    line.uom,
    line.source
  from public.bom_headers header
  join public.bom_lines line
    on line.org_id = header.org_id
   and line.bom_header_id = header.id
  where header.org_id = app.current_org_id()
    and header.product_id = p_product_code
    and header.status = 'active'
  order by line.line_no;
$$;


--
-- Name: integration_settings_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.integration_settings_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin new.updated_at := pg_catalog.now(); return new; end; $$;


--
-- Name: is_all_required_filled(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_all_required_filled(product_code text, dept text) RETURNS boolean
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog', 'public', 'Reference'
    AS $$
declare
  product_row public.product%rowtype;
  product_json jsonb;
  required_column record;
  physical_column text;
  field_value text;
begin
  select *
    into product_row
    from public.product
   where product.product_code = is_all_required_filled.product_code;

  if not found then
    return false;
  end if;

  product_json := to_jsonb(product_row);

  for required_column in
    select column_key
      from "Reference"."DeptColumns"
     where org_id = product_row.org_id
       and lower(dept_code) = lower(is_all_required_filled.dept)
       and required_for_done = true
     order by display_order nulls last, column_key
  loop
    physical_column := lower(required_column.column_key);

    if not product_json ? physical_column then
      return false;
    end if;

    field_value := product_json ->> physical_column;
    if field_value is null or nullif(btrim(field_value), '') is null then
      return false;
    end if;
  end loop;

  return true;
end;
$$;


--
-- Name: item_allergen_profiles_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.item_allergen_profiles_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


--
-- Name: item_cost_history_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.item_cost_history_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


--
-- Name: items_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.items_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


--
-- Name: mfg_op_allergen_additions_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mfg_op_allergen_additions_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


--
-- Name: npd_dashboard_label(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.npd_dashboard_label(column_key text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog'
    AS $$
  select regexp_replace(initcap(replace(column_key, '_', ' ')), '\mMrp\M', 'MRP', 'g');
$$;


--
-- Name: org_authorization_policies_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.org_authorization_policies_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


--
-- Name: planning_capacity_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.planning_capacity_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


--
-- Name: planning_mrp_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.planning_mrp_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


--
-- Name: prune_audit_events(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prune_audit_events() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  DELETE FROM public.audit_events
   WHERE occurred_at < now() - interval '90 days'
     AND retention_class <> 'security';
$$;


--
-- Name: prune_consumed_approval_tokens(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prune_consumed_approval_tokens() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  DELETE FROM public.consumed_approval_tokens
   WHERE consumed_at < now() - interval '30 days';
$$;


--
-- Name: prune_reference_csv_import_reports(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prune_reference_csv_import_reports() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  removed integer;
begin
  delete from public.reference_csv_import_reports
   where expires_at < pg_catalog.now()
  returning 1
  into removed;
  return coalesce(removed, 0);
end;
$$;


--
-- Name: reject_supplier_spec_review(uuid, uuid, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_supplier_spec_review(p_proposal_id uuid, p_reviewed_by uuid, p_review_notes text DEFAULT NULL::text, p_block boolean DEFAULT false) RETURNS void
    LANGUAGE plpgsql
    AS $$
declare
  v_org_id uuid := app.current_org_id();
  v_proposal public.supplier_spec_review_proposals%rowtype;
begin
  select *
    into v_proposal
  from public.supplier_spec_review_proposals proposal
  where proposal.id = p_proposal_id
    and proposal.org_id = v_org_id
  for update;

  if v_proposal.id is null then
    raise exception 'supplier spec review proposal not found in current org: %', p_proposal_id
      using errcode = 'P0002';
  end if;

  if v_proposal.proposal_status <> 'pending' then
    raise exception 'supplier spec review proposal % is not pending (status %)',
      p_proposal_id, v_proposal.proposal_status
      using errcode = '23514';
  end if;

  update public.supplier_spec_review_proposals proposal
     set proposal_status = case when p_block then 'blocked' else 'rejected' end,
         reviewed_by = p_reviewed_by,
         reviewed_at = pg_catalog.now(),
         review_notes = p_review_notes
   where proposal.id = p_proposal_id
     and proposal.org_id = v_org_id;
end;
$$;


--
-- Name: FUNCTION reject_supplier_spec_review(p_proposal_id uuid, p_reviewed_by uuid, p_review_notes text, p_block boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reject_supplier_spec_review(p_proposal_id uuid, p_reviewed_by uuid, p_review_notes text, p_block boolean) IS 'T-075: reject/block a supplier spec review proposal; the prior active+approved spec is left untouched (AC7).';


--
-- Name: request_npd_released_bom_edit(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_npd_released_bom_edit(p_active_bom_header_id uuid, p_requested_by uuid, p_notes text DEFAULT NULL::text) RETURNS TABLE(bom_header_id uuid, status text, version integer, supersedes_bom_header_id uuid)
    LANGUAGE plpgsql
    AS $$
declare
  v_org_id uuid := app.current_org_id();
  v_active public.bom_headers%rowtype;
  v_new_id uuid;
begin
  select *
    into v_active
  from public.bom_headers header
  where header.id = p_active_bom_header_id
    and header.org_id = v_org_id
    and header.status = 'active';

  if v_active.id is null then
    raise exception 'Active released BOM version not found: %', p_active_bom_header_id;
  end if;

  select header.id
    into v_new_id
  from public.bom_headers header
  where header.org_id = v_org_id
    and header.product_id = v_active.product_id
    and header.supersedes_bom_header_id = v_active.id
    and header.status = 'in_review'
  order by header.created_at
  limit 1;

  if v_new_id is null then
    insert into public.bom_headers (
      org_id,
      product_id,
      npd_project_id,
      fa_code,
      origin_module,
      status,
      version,
      supersedes_bom_header_id,
      yield_pct,
      effective_from,
      technical_review_requested_by,
      technical_review_requested_at,
      notes,
      created_by_user
    )
    values (
      v_org_id,
      v_active.product_id,
      v_active.npd_project_id,
      v_active.fa_code,
      'npd',
      'in_review',
      v_active.version + 1,
      v_active.id,
      v_active.yield_pct,
      current_date,
      p_requested_by,
      pg_catalog.now(),
      coalesce(p_notes, 'NPD post-release edit requested; pending Technical approval.'),
      p_requested_by
    )
    returning id into v_new_id;

    insert into public.bom_lines (
      org_id,
      bom_header_id,
      line_no,
      component_code,
      component_type,
      quantity,
      uom,
      scrap_pct,
      manufacturing_operation_name,
      sequence,
      is_phantom,
      source,
      notes
    )
    select
      line.org_id,
      v_new_id,
      line.line_no,
      line.component_code,
      line.component_type,
      line.quantity,
      line.uom,
      line.scrap_pct,
      line.manufacturing_operation_name,
      line.sequence,
      line.is_phantom,
      'superseded_copy',
      'Copied from prior active BOM for NPD edit request.'
    from public.bom_lines line
    where line.org_id = v_org_id
      and line.bom_header_id = v_active.id
    order by line.line_no;
  end if;

  insert into public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
  select
    v_org_id,
    'bom.version_submitted',
    'bom',
    v_new_id,
    jsonb_build_object(
      'product_id', v_active.product_id,
      'previous_bom_header_id', v_active.id,
      'bom_header_id', v_new_id,
      'status', 'in_review',
      'requires_technical_approval', true
    ),
    'db-099'
  where not exists (
    select 1
    from public.outbox_events event
    where event.org_id = v_org_id
      and event.event_type = 'bom.version_submitted'
      and event.aggregate_id = v_new_id::text
  );

  return query
  select header.id, header.status, header.version, header.supersedes_bom_header_id
  from public.bom_headers header
  where header.id = v_new_id
    and header.org_id = v_org_id;
end;
$$;


--
-- Name: FUNCTION request_npd_released_bom_edit(p_active_bom_header_id uuid, p_requested_by uuid, p_notes text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.request_npd_released_bom_edit(p_active_bom_header_id uuid, p_requested_by uuid, p_notes text) IS 'T-093: Guards post-release NPD edits by creating a superseding in_review BOM version for Technical approval. (145: outbox aggregate_id text cast)';


--
-- Name: revoke_schema_admin_sod_overgrant_for_org(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_schema_admin_sod_overgrant_for_org(p_org_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  if to_regclass('public.role_permissions') is null or to_regclass('public.roles') is null then
    return; -- RBAC tables not present yet; nothing to revoke.
  end if;

  -- ----------------------------------------------------------------------
  -- 1) Normalized storage: delete the over-granted strings from the
  --    schema-admin role(s). REVOKE list = migration 150's admin matrix MINUS
  --    the three schema-scoped keepers.
  -- ----------------------------------------------------------------------
  with schema_admin_roles as (
    select r.id
    from public.roles r
    where r.org_id = p_org_id
      and r.slug = 'org.schema.admin'
      and r.code not in ('owner', 'admin', 'org_admin')
  ),
  revoke_list(permission) as (
    values
      ('settings.org.read'),
      ('settings.org.update'),
      ('settings.users.view'),
      ('settings.users.invite'),
      ('settings.users.create'),
      ('settings.users.deactivate'),
      ('settings.users.manage'),
      ('settings.roles.view'),
      ('settings.roles.assign'),
      ('settings.roles.manage'),
      ('settings.audit.read'),
      ('impersonate.tenant'),
      ('settings.rules.view'),
      ('settings.reference.view'),
      ('settings.reference.edit'),
      ('settings.reference.import'),
      ('settings.infra.read'),
      ('settings.infra.update'),
      ('settings.infra.view'),
      ('settings.flags.edit'),
      ('settings.flags.view'),
      ('settings.units.manage'),
      ('settings.d365.view'),
      ('settings.d365.manage'),
      ('settings.d365.rotate_secret'),
      ('settings.d365.test_connection'),
      ('settings.email.view'),
      ('settings.email.edit'),
      ('settings.email.read'),
      ('settings.email_config.edit'),
      ('settings.sso.edit'),
      ('settings.scim.edit'),
      ('settings.ip_allowlist.edit'),
      ('settings.security.view'),
      ('settings.security.manage'),
      ('settings.security.edit'),
      ('settings.authorization.view'),
      ('settings.authorization.edit'),
      ('org.access.admin')
  )
  delete from public.role_permissions rp
  using schema_admin_roles sar
  where rp.role_id = sar.id
    and rp.permission in (select permission from revoke_list);

  -- ----------------------------------------------------------------------
  -- 2) Legacy jsonb cache: remove the same strings from the schema-admin
  --    role's permissions array (surgical — keep everything else as-is).
  -- ----------------------------------------------------------------------
  with revoke_list(permission) as (
    values
      ('settings.org.read'), ('settings.org.update'),
      ('settings.users.view'), ('settings.users.invite'), ('settings.users.create'),
      ('settings.users.deactivate'), ('settings.users.manage'),
      ('settings.roles.view'), ('settings.roles.assign'), ('settings.roles.manage'),
      ('settings.audit.read'), ('impersonate.tenant'), ('settings.rules.view'),
      ('settings.reference.view'), ('settings.reference.edit'), ('settings.reference.import'),
      ('settings.infra.read'), ('settings.infra.update'), ('settings.infra.view'),
      ('settings.flags.edit'), ('settings.flags.view'), ('settings.units.manage'),
      ('settings.d365.view'), ('settings.d365.manage'), ('settings.d365.rotate_secret'),
      ('settings.d365.test_connection'),
      ('settings.email.view'), ('settings.email.edit'), ('settings.email.read'),
      ('settings.email_config.edit'), ('settings.sso.edit'), ('settings.scim.edit'),
      ('settings.ip_allowlist.edit'),
      ('settings.security.view'), ('settings.security.manage'), ('settings.security.edit'),
      ('settings.authorization.view'), ('settings.authorization.edit'),
      ('org.access.admin')
  )
  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(elem order by elem)
         from jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) elem
         where elem not in (select permission from revoke_list)
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and r.slug = 'org.schema.admin'
     and r.code not in ('owner', 'admin', 'org_admin')
     and r.permissions is not null;
end;
$$;


--
-- Name: revoke_schema_admin_sod_overgrant_on_org_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_schema_admin_sod_overgrant_on_org_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  perform public.revoke_schema_admin_sod_overgrant_for_org(new.id);
  return new;
end;
$$;


--
-- Name: routings_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.routings_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


--
-- Name: schedule_outputs_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.schedule_outputs_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


--
-- Name: seed_alert_thresholds_for_org(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_alert_thresholds_for_org(p_org_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  INSERT INTO "Reference"."AlertThresholds" (org_id, threshold_key, value_int, value_text)
  VALUES
    -- PRD §11.3 — launch alert thresholds (days before scheduled launch date)
    (p_org_id, 'launch_alert_red_days',      10, NULL),
    (p_org_id, 'launch_alert_yellow_days',   21, NULL),
    -- PRD §17.11.3 — costing margin warning threshold (percent, ≤15% triggers warn)
    (p_org_id, 'costing_margin_warn_pct',    15, NULL),
    -- PRD §10.6 — ATP swab cleaning-validation threshold (RLU, ≤10 passes)
    (p_org_id, 'atp_swab_rlu_max',           10, NULL),
    -- PRD §8.5/§8.6 — catch-weight variance default tolerance (percent)
    (p_org_id, 'catch_weight_variance_pct',   5, NULL)
  ON CONFLICT (org_id, threshold_key) DO NOTHING;
END;
$$;


--
-- Name: FUNCTION seed_alert_thresholds_for_org(p_org_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.seed_alert_thresholds_for_org(p_org_id uuid) IS 'T-050/T-070: Seeds the canonical default AlertThreshold rows for the given org (launch alert + costing margin + ATP swab RLU + catch-weight variance). Idempotent (ON CONFLICT DO NOTHING). Called by trg_seed_alert_thresholds and the backfill below.';


--
-- Name: seed_alert_thresholds_on_org_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_alert_thresholds_on_org_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  PERFORM public.seed_alert_thresholds_for_org(NEW.id);
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION seed_alert_thresholds_on_org_insert(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.seed_alert_thresholds_on_org_insert() IS 'T-050: Trigger function — seeds default AlertThreshold rows for every new org on INSERT.';


--
-- Name: seed_allergen_cascade_rule_for_org(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_allergen_cascade_rule_for_org() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_definition jsonb := jsonb_build_object(
    'rule_code', 'technical.allergen_cascade',
    'description', 'Technical allergen full cascade: RM/intermediate profile change -> active BOM parents -> cascaded FG profile rows; manufacturing-op additions UNIONed; manual_override rows never overwritten.',
    'trigger_event', 'technical.item_allergen_profile.changed',
    'sources', jsonb_build_array('item_allergen_profiles', 'manufacturing_operation_allergen_additions', 'bom_headers', 'bom_lines'),
    'target', 'item_allergen_profiles',
    'cascaded_source_label', 'cascaded',
    'override_protected_source', 'manual_override',
    'kpi_max_ms', 5000,
    'handler', 'apps/web/lib/technical/allergens/cascade.ts'
  );
begin
  insert into public.rule_definitions (org_id, rule_code, rule_type, tier, definition_json, version)
  values (new.id, 'technical.allergen_cascade', 'cascading', 'L1', v_definition, 1)
  on conflict (org_id, rule_code, version) do nothing;
  return new;
end
$$;


--
-- Name: seed_allergens_eu14_for_org(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_allergens_eu14_for_org(p_org_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  insert into "Reference"."Allergens" (
    org_id,
    allergen_code,
    allergen_name,
    display_name,
    regulatory_framework,
    seed_source,
    display_name_pl,
    display_name_uk,
    display_name_ro,
    marker
  )
  values
    (p_org_id, 'gluten', 'Cereals containing gluten', 'Gluten', 'EU_FIC_1169_2011', 'EU14_default', 'Gluten', 'Глютен', 'Gluten', '[UNIVERSAL]'),
    (p_org_id, 'crustaceans', 'Crustaceans', 'Crustaceans', 'EU_FIC_1169_2011', 'EU14_default', 'Skorupiaki', 'Ракоподібні', 'Crustacee', '[UNIVERSAL]'),
    (p_org_id, 'eggs', 'Eggs', 'Eggs', 'EU_FIC_1169_2011', 'EU14_default', 'Jaja', 'Яйця', 'Ouă', '[UNIVERSAL]'),
    (p_org_id, 'fish', 'Fish', 'Fish', 'EU_FIC_1169_2011', 'EU14_default', 'Ryby', 'Риба', 'Pește', '[UNIVERSAL]'),
    (p_org_id, 'peanuts', 'Peanuts', 'Peanuts', 'EU_FIC_1169_2011', 'EU14_default', 'Orzeszki ziemne', 'Арахіс', 'Arahide', '[UNIVERSAL]'),
    (p_org_id, 'soybeans', 'Soybeans', 'Soybeans', 'EU_FIC_1169_2011', 'EU14_default', 'Soja', 'Соя', 'Soia', '[UNIVERSAL]'),
    (p_org_id, 'milk', 'Milk', 'Milk', 'EU_FIC_1169_2011', 'EU14_default', 'Mleko', 'Молоко', 'Lapte', '[UNIVERSAL]'),
    (p_org_id, 'nuts', 'Nuts', 'Nuts', 'EU_FIC_1169_2011', 'EU14_default', 'Orzechy', 'Горіхи', 'Fructe cu coajă lemnoasă', '[UNIVERSAL]'),
    (p_org_id, 'celery', 'Celery', 'Celery', 'EU_FIC_1169_2011', 'EU14_default', 'Seler', 'Селера', 'Țelină', '[UNIVERSAL]'),
    (p_org_id, 'mustard', 'Mustard', 'Mustard', 'EU_FIC_1169_2011', 'EU14_default', 'Gorczyca', 'Гірчиця', 'Muștar', '[UNIVERSAL]'),
    (p_org_id, 'sesame', 'Sesame seeds', 'Sesame', 'EU_FIC_1169_2011', 'EU14_default', 'Sezam', 'Кунжут', 'Susan', '[UNIVERSAL]'),
    (p_org_id, 'sulphites', 'Sulphur dioxide and sulphites', 'Sulphites', 'EU_FIC_1169_2011', 'EU14_default', 'Dwutlenek siarki i siarczyny', 'Діоксид сірки та сульфіти', 'Dioxid de sulf și sulfiți', '[UNIVERSAL]'),
    (p_org_id, 'lupin', 'Lupin', 'Lupin', 'EU_FIC_1169_2011', 'EU14_default', 'Łubin', 'Люпин', 'Lupin', '[UNIVERSAL]'),
    (p_org_id, 'molluscs', 'Molluscs', 'Molluscs', 'EU_FIC_1169_2011', 'EU14_default', 'Mięczaki', 'Moluște', 'Moluște', '[UNIVERSAL]')
  on conflict (org_id, allergen_code) do update
    set allergen_name = excluded.allergen_name,
        display_name = excluded.display_name,
        regulatory_framework = excluded.regulatory_framework,
        seed_source = excluded.seed_source,
        display_name_pl = excluded.display_name_pl,
        display_name_uk = excluded.display_name_uk,
        display_name_ro = excluded.display_name_ro,
        marker = excluded.marker;
end;
$$;


--
-- Name: seed_allergens_eu14_on_org_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_allergens_eu14_on_org_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  perform public.seed_allergens_eu14_for_org(new.id);
  return new;
end;
$$;


--
-- Name: seed_authorization_policies_for_org(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_authorization_policies_for_org(p_org_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  -- NPD post-release edit policy. owner authorizes; segregation-of-duties on; requires new version (invariant).
  insert into public.org_authorization_policies
    (org_id, policy_code, is_enabled, request_permissions, authorize_permissions,
     approver_role_codes, min_approvers, require_segregation_of_duties, requires_new_version,
     approval_gate_rule_code, settings_json, version)
  values
    (p_org_id, 'npd_post_release_edit', true,
     array['npd.released_product_edit.request']::text[],
     array['npd.released_product_edit.authorize']::text[],
     array['owner']::text[], 1, true, true,
     null, '{}'::jsonb, 1)
  on conflict (org_id, policy_code) do nothing;

  -- Technical product-spec approval policy. quality_lead approves; references the gate rule.
  insert into public.org_authorization_policies
    (org_id, policy_code, is_enabled, request_permissions, authorize_permissions,
     approver_role_codes, min_approvers, require_segregation_of_duties, requires_new_version,
     approval_gate_rule_code, settings_json, version)
  values
    (p_org_id, 'technical_product_spec_approval', true,
     '{}'::text[],
     array['technical.product_spec.approve']::text[],
     array['quality_lead']::text[], 1, true, true,
     'technical_product_spec_approval_gate_v1',
     jsonb_build_object('require_dual_sign_off', true), 1)
  on conflict (org_id, policy_code) do nothing;

  -- Active gate rule referenced by the technical approval preflight (rule_definitions, migration 039).
  if to_regclass('public.rule_definitions') is not null then
    insert into public.rule_definitions
      (org_id, rule_code, rule_type, tier, definition_json, version, active_from, active_to)
    values
      (p_org_id, 'technical_product_spec_approval_gate_v1', 'gate', 'L1',
       jsonb_build_object('min_approvers', 1, 'requires_new_version', true), 1, pg_catalog.now(), null)
    on conflict (org_id, rule_code, version) do nothing;
  end if;
end;
$$;


--
-- Name: seed_authorization_policies_on_org_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_authorization_policies_on_org_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  perform public.seed_authorization_policies_for_org(new.id);
  return new;
end;
$$;


--
-- Name: seed_dept_columns_on_org_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_dept_columns_on_org_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'Reference'
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


--
-- Name: seed_feature_flags_core_for_org(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_feature_flags_core_for_org(p_org_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  insert into public.feature_flags_core (org_id, flag_code, description, is_enabled, rolled_out_pct, tier)
  values
    -- §10.2 core flags (is_enabled=false per T-013 AC).
    (p_org_id, 'maintenance_mode',          'Put the org into maintenance mode.',                   false, 0, 'L1'),
    (p_org_id, 'integration.d365.enabled',  'Enable Dynamics 365 integration for this org.',        false, 0, 'L1'),
    (p_org_id, 'scanner.pwa.enabled',       'Enable the warehouse scanner PWA.',                    false, 0, 'L1'),
    (p_org_id, 'npd.d365_builder.execute',  'Allow the NPD D365 builder to execute.',               false, 0, 'L1'),
    -- Authorization flags surfaced by /settings/flags (V-SET-42/43/44 preflight gate).
    (p_org_id, 'npd.post_release_edit.enabled',          'Allow released NPD product/BOM edits after authorization.', false, 0,   'L1'),
    (p_org_id, 'technical.product_spec_approval.required','Require Technical product-spec approval before factory use.', true,  100, 'L1')
  on conflict (org_id, flag_code) do nothing;
end;
$$;


--
-- Name: seed_feature_flags_core_on_org_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_feature_flags_core_on_org_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  perform public.seed_feature_flags_core_for_org(new.id);
  return new;
end;
$$;


--
-- Name: seed_gate_checklist_templates_for_org(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_gate_checklist_templates_for_org(p_org_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'Reference'
    AS $$
BEGIN
  INSERT INTO "Reference"."GateChecklistTemplates"
    (org_id, template_id, gate_code, category_code, item_text, required, sequence, schema_version)
  VALUES

  -- ================================================================
  -- G0 — Idea (4 items: 3 business + 1 technical)
  -- Prototype GATE_CHECKLISTS.G0 (gate-screens.jsx:15-24)
  -- Spine patch mandate: "brief complete, owner assigned, linked NPD project exists"
  -- ================================================================
  (p_org_id, 'APEX_DEFAULT', 'G0', 'business',   'Product concept documented',   true,  1, 1),
  (p_org_id, 'APEX_DEFAULT', 'G0', 'business',   'Market opportunity identified', true,  2, 1),
  (p_org_id, 'APEX_DEFAULT', 'G0', 'business',   'Preliminary cost target set',   false, 3, 1),
  (p_org_id, 'APEX_DEFAULT', 'G0', 'technical',  'Initial feasibility check',     true,  4, 1),

  -- ================================================================
  -- G1 — Feasibility (5 items: 3 technical + 2 business)
  -- Prototype GATE_CHECKLISTS.G1 (gate-screens.jsx:25-35)
  -- Spine patch mandate: "basic formulation/volume/target launch evidence"
  -- ================================================================
  (p_org_id, 'APEX_DEFAULT', 'G1', 'technical',  'Technical feasibility confirmed', true,  1, 1),
  (p_org_id, 'APEX_DEFAULT', 'G1', 'technical',  'Key ingredients identified',      true,  2, 1),
  (p_org_id, 'APEX_DEFAULT', 'G1', 'technical',  'Initial allergen assessment',     true,  3, 1),
  (p_org_id, 'APEX_DEFAULT', 'G1', 'business',   'Rough cost estimate',             true,  4, 1),
  (p_org_id, 'APEX_DEFAULT', 'G1', 'business',   'Competitor benchmark review',     false, 5, 1),

  -- ================================================================
  -- G2 — Business Case (11 items: 3 technical + 5 business + 3 compliance)
  -- Prototype GATE_CHECKLISTS.G2 (gate-screens.jsx:36-53)
  -- Spine patch mandate: "costing/nutrition/risk initial checks"
  -- ================================================================
  (p_org_id, 'APEX_DEFAULT', 'G2', 'technical',   'Detailed ingredient specification', true,  1, 1),
  (p_org_id, 'APEX_DEFAULT', 'G2', 'technical',   'Shelf life assessment',             true,  2, 1),
  (p_org_id, 'APEX_DEFAULT', 'G2', 'technical',   'Packaging compatibility check',     false, 3, 1),
  (p_org_id, 'APEX_DEFAULT', 'G2', 'business',    'Business case documented',          true,  4, 1),
  (p_org_id, 'APEX_DEFAULT', 'G2', 'business',    'Target cost approved',              true,  5, 1),
  (p_org_id, 'APEX_DEFAULT', 'G2', 'business',    'Target margin confirmed',           true,  6, 1),
  (p_org_id, 'APEX_DEFAULT', 'G2', 'business',    'Resource plan approved',            true,  7, 1),
  (p_org_id, 'APEX_DEFAULT', 'G2', 'business',    'Market research summary',           false, 8, 1),
  (p_org_id, 'APEX_DEFAULT', 'G2', 'compliance',  'Regulatory pathway identified',     true,  9, 1),
  (p_org_id, 'APEX_DEFAULT', 'G2', 'compliance',  'Initial label requirements',        false, 10, 1),
  (p_org_id, 'APEX_DEFAULT', 'G2', 'compliance',  'Preliminary HACCP considerations',  false, 11, 1),

  -- ================================================================
  -- G3 — Development (10 items: 4 technical + 2 business + 2 compliance + 2 spine-patch)
  -- Prototype GATE_CHECKLISTS.G3 (gate-screens.jsx:55-69)
  -- Spine patch mandate (T-056 task contract):
  --   - FG candidate created or mapped (T-095)
  --   - Trial/Pilot/Packaging evidence placeholders
  --   - No blocking risk/docs
  -- §17.6: ALL G3 items required=true (fully gated per approval contract)
  -- ================================================================
  (p_org_id, 'APEX_DEFAULT', 'G3', 'technical',   'Formulation created and locked',         true, 1, 1),
  (p_org_id, 'APEX_DEFAULT', 'G3', 'technical',   'Lab trial batches executed (min 3)',      true, 2, 1),
  (p_org_id, 'APEX_DEFAULT', 'G3', 'technical',   'Allergen declaration validated',          true, 3, 1),
  (p_org_id, 'APEX_DEFAULT', 'G3', 'technical',   'Sensory evaluation passed',               true, 4, 1),
  (p_org_id, 'APEX_DEFAULT', 'G3', 'business',    'Cost estimate within ±5% of target',     true, 5, 1),
  (p_org_id, 'APEX_DEFAULT', 'G3', 'business',    'Retailer specification confirmed',        true, 6, 1),
  (p_org_id, 'APEX_DEFAULT', 'G3', 'compliance',  'Nutrition declaration calculated',        true, 7, 1),
  (p_org_id, 'APEX_DEFAULT', 'G3', 'compliance',  'Label copy approved by QA',               true, 8, 1),
  -- Spine patch items:
  (p_org_id, 'APEX_DEFAULT', 'G3', 'technical',   'FG candidate created or mapped in system (T-095)', true, 9, 1),
  (p_org_id, 'APEX_DEFAULT', 'G3', 'compliance',  'No blocking risk or compliance docs outstanding',   true, 10, 1),

  -- ================================================================
  -- G4 — Testing / Handoff (16 items: 3 technical + 3 compliance + 2 business + 8 spine-patch)
  -- Prototype GATE_CHECKLISTS.G4 (gate-screens.jsx:71-86)
  -- Spine patch mandate (T-056 task contract):
  --   - required departments Done_<Dept> for all 7 depts (Core, Planning, Commercial,
  --     Production, Technical, MRP, Procurement)
  --   - RM usability PASS for every BOM component
  --   - Initial shared BOM ready
  --   - Initial factory_spec submitted for Technical approval
  --   - Settings approval chain complete
  -- Closed_Technical = Technical supplied/closed NPD data (NOT approved_for_factory)
  -- factory use requires Technical approval of factory_spec/BOM bundle (separate gate)
  -- ================================================================
  -- Prototype items (3 technical + 3 compliance + 2 business = 8)
  (p_org_id, 'APEX_DEFAULT', 'G4', 'technical',   'Pilot run on production line',     true,  1, 1),
  (p_org_id, 'APEX_DEFAULT', 'G4', 'technical',   'Production yield ≥ target',        true,  2, 1),
  (p_org_id, 'APEX_DEFAULT', 'G4', 'technical',   'CCP log verified',                 true,  3, 1),
  (p_org_id, 'APEX_DEFAULT', 'G4', 'compliance',  'Microbiological testing passed',   true,  4, 1),
  (p_org_id, 'APEX_DEFAULT', 'G4', 'compliance',  'Shelf-life validation complete',   true,  5, 1),
  (p_org_id, 'APEX_DEFAULT', 'G4', 'compliance',  'Final label approved (BRCGS)',     true,  6, 1),
  (p_org_id, 'APEX_DEFAULT', 'G4', 'business',    'Commercial order placed',          true,  7, 1),
  (p_org_id, 'APEX_DEFAULT', 'G4', 'business',    'Dispatch readiness confirmed',     false, 8, 1),
  -- Spine patch: 7 department closure items (Done_<Dept> = dept has closed NPD data)
  -- "Closed_Technical" means Technical supplied/closed NPD data, not approved_for_factory
  (p_org_id, 'APEX_DEFAULT', 'G4', 'business',    'Done_Core: Core department NPD data closed',               true,  9,  1),
  (p_org_id, 'APEX_DEFAULT', 'G4', 'business',    'Done_Planning: Planning department NPD data closed',        true,  10, 1),
  (p_org_id, 'APEX_DEFAULT', 'G4', 'business',    'Done_Commercial: Commercial department NPD data closed',    true,  11, 1),
  (p_org_id, 'APEX_DEFAULT', 'G4', 'business',    'Done_Production: Production department NPD data closed',    true,  12, 1),
  (p_org_id, 'APEX_DEFAULT', 'G4', 'technical',   'Done_Technical: Technical department NPD data closed (Closed_Technical; does not imply factory_spec approval)', true, 13, 1),
  (p_org_id, 'APEX_DEFAULT', 'G4', 'business',    'Done_MRP: MRP department NPD data closed',                 true,  14, 1),
  (p_org_id, 'APEX_DEFAULT', 'G4', 'business',    'Done_Procurement: Procurement department NPD data closed',  true,  15, 1),
  -- Spine patch: RM usability + BOM + factory_spec
  (p_org_id, 'APEX_DEFAULT', 'G4', 'technical',   'RM usability PASS: all BOM raw materials confirmed usable for this product',                   true,  16, 1)

  ON CONFLICT (org_id, template_id, gate_code, sequence) DO NOTHING;

  -- Additional spine-patch items inserted separately to allow sequence continuation
  -- without conflicting with prototype sequence numbers above.
  -- Shared BOM ready + factory_spec items use sequence 17-18 within G4.
  INSERT INTO "Reference"."GateChecklistTemplates"
    (org_id, template_id, gate_code, category_code, item_text, required, sequence, schema_version)
  VALUES
  (p_org_id, 'APEX_DEFAULT', 'G4', 'technical',   'Initial shared BOM ready and linked to NPD project',                                          true,  17, 1),
  (p_org_id, 'APEX_DEFAULT', 'G4', 'compliance',  'Initial factory_spec submitted for Technical approval (factory use requires Technical sign-off of factory_spec/BOM bundle)', true, 18, 1)
  ON CONFLICT (org_id, template_id, gate_code, sequence) DO NOTHING;

END;
$$;


--
-- Name: FUNCTION seed_gate_checklist_templates_for_org(p_org_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.seed_gate_checklist_templates_for_org(p_org_id uuid) IS 'T-056: Seeds the default G0-G4 GateChecklistTemplate rows (APEX_DEFAULT) for the given org. Idempotent (ON CONFLICT DO NOTHING). Called by trg_seed_gate_checklist_templates and migration 101 backfill.';


--
-- Name: seed_gate_checklist_templates_on_org_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_gate_checklist_templates_on_org_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
BEGIN
  -- Guard: table must exist (safe on partial DB)
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'Reference'
       AND table_name   = 'GateChecklistTemplates'
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM public.seed_gate_checklist_templates_for_org(NEW.id);
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION seed_gate_checklist_templates_on_org_insert(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.seed_gate_checklist_templates_on_org_insert() IS 'T-056: Trigger function — seeds default G0-G4 GateChecklistTemplate rows for every new org on INSERT.';


--
-- Name: seed_gdpr_erasure_permission_for_org(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_gdpr_erasure_permission_for_org(p_org_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  -- Normalized storage: the admin role gets the canonical permission row.
  insert into public.role_permissions (role_id, permission)
  select r.id, 'gdpr.erasure.execute'
  from public.roles r
  where r.org_id = p_org_id
    and r.code = 'admin'
  on conflict (role_id, permission) do nothing;

  -- Legacy jsonb cache: keep the admin role's permissions array in sync so either
  -- read path (role_permissions row OR roles.permissions ? perm) grants access.
  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select 'gdpr.erasure.execute'
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and r.code = 'admin';
end;
$$;


--
-- Name: seed_gdpr_erasure_permission_on_org_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_gdpr_erasure_permission_on_org_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  perform public.seed_gdpr_erasure_permission_for_org(new.id);
  return new;
end;
$$;


--
-- Name: seed_npd_allergen_write_permission_for_org(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_npd_allergen_write_permission_for_org(p_org_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  -- Normalized storage: allergen-writing roles get the canonical permission row.
  insert into public.role_permissions (role_id, permission)
  select r.id, 'npd.allergen.write'
  from public.roles r
  where r.org_id = p_org_id
    and r.code in ('npd_manager', 'core_user', 'admin')
  on conflict (role_id, permission) do nothing;

  -- Legacy jsonb cache: keep each role's permissions array in sync so either read path
  -- (role_permissions row OR roles.permissions ? perm) grants access.
  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select 'npd.allergen.write'
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and r.code in ('npd_manager', 'core_user', 'admin');
end;
$$;


--
-- Name: seed_npd_allergen_write_permission_on_org_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_npd_allergen_write_permission_on_org_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  perform public.seed_npd_allergen_write_permission_for_org(new.id);
  return new;
end;
$$;


--
-- Name: seed_npd_org_admin_permissions_for_org(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_npd_org_admin_permissions_for_org(p_org_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  -- COMPLETE union of permission strings actually checked by NPD pages/actions (both the
  -- canonical locale tree and the non-locale (npd) actions it imports). The page-check
  -- vocabulary diverged from migration 080's seed vocabulary (080 seeds npd.core.write /
  -- npd.dashboard.view / ... while pages check npd.fa.read / npd.compliance / npd.costing /
  -- npd.nutrition / npd.risks / npd.*.write / npd.project.* / npd.brief.* — none seeded).
  -- An org admin gets the full set so the whole NPD module is reachable. The page-vs-seed
  -- vocabulary divergence itself is recorded for a follow-up reconciliation decision.
  v_perms text[] := array[
    'brief.convert_to_fa','brief.convert_to_npd_project','brief.create',
    'fa.create','fa.delete','fa.field_edit','fg.create',
    'npd.allergen.write','npd.bom.export','npd.brief.read','npd.brief.write',
    'npd.closed_flag.unset','npd.commercial.write','npd.compliance','npd.compliance_doc.write',
    'npd.core.write','npd.costing','npd.d365_builder.execute','npd.dashboard','npd.dashboard.view',
    'npd.fa.build','npd.fa.close','npd.fa.create','npd.fa.read',
    'npd.formulation.create_draft','npd.formulation.lock','npd.gate.advance','npd.gate.approve',
    'npd.mrp.write','npd.nutrition','npd.pilot.promote_to_bom','npd.planning.write',
    'npd.procurement.write','npd.production.write','npd.project.create','npd.project.delete',
    'npd.project.view','npd.recipe.submit_for_trial','npd.risk.write','npd.risks',
    'npd.rule.edit','npd.schema.edit','npd.technical.write'
  ];
  -- org-admin role family across naming conventions used in this codebase.
  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin'];
begin
  -- Normalized storage.
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles))
  on conflict (role_id, permission) do nothing;

  -- Legacy jsonb cache: union the perms into each admin role's permissions array.
  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select unnest(v_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles));
end;
$$;


--
-- Name: seed_npd_org_admin_permissions_on_org_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_npd_org_admin_permissions_on_org_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  perform public.seed_npd_org_admin_permissions_for_org(new.id);
  return new;
end;
$$;


--
-- Name: seed_npd_role_permissions_for_org(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_npd_role_permissions_for_org(p_org_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  -- Remove legacy un-namespaced NPD permission strings from normalized storage.
  delete from public.role_permissions rp
  using public.roles r
  where r.id = rp.role_id
    and r.org_id = p_org_id
    and rp.permission in (
      'd365_builder.execute',
      'risk.write',
      'core.write',
      'dashboard.view',
      'closed_flag.unset',
      'schema.edit',
      'rule.edit',
      'compliance_doc.write',
      'formulation.create_draft',
      'formulation.lock',
      'recipe.submit_for_trial',
      'pilot.promote_to_bom',
      'fa.delete',
      'dept.write',
      'bom.export'
    );

  -- Keep the legacy JSONB role cache free of strings that would bypass canonical checks.
  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(kept.permission order by kept.permission)
         from (
           select distinct value as permission
           from jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as existing(value)
           where value not in (
             'd365_builder.execute',
             'risk.write',
             'core.write',
             'dashboard.view',
             'closed_flag.unset',
             'schema.edit',
             'rule.edit',
             'compliance_doc.write',
             'formulation.create_draft',
             'formulation.lock',
             'recipe.submit_for_trial',
             'pilot.promote_to_bom',
             'fa.delete',
             'dept.write',
             'bom.export'
           )
         ) kept
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id;

  insert into public.roles (org_id, slug, system, code, name, permissions, is_system, display_order)
  values
    (p_org_id, 'npd_manager', false, 'npd_manager', 'NPD Manager', '[]'::jsonb, true, 100),
    (p_org_id, 'core_user', false, 'core_user', 'Core User', '[]'::jsonb, true, 110),
    (p_org_id, 'dept_manager', false, 'dept_manager', 'Department Manager', '[]'::jsonb, true, 120),
    (p_org_id, 'dept_user', false, 'dept_user', 'Department User', '[]'::jsonb, true, 130),
    (p_org_id, 'admin', false, 'admin', 'Admin', '[]'::jsonb, true, 140),
    (p_org_id, 'viewer', false, 'viewer', 'Viewer', '[]'::jsonb, true, 150)
  on conflict do nothing;

  with role_matrix(permission, role_code) as (
    values
      ('fg.create', 'npd_manager'),
      ('fg.create', 'core_user'),
      ('fg.create', 'admin'),
      ('npd.project.delete', 'npd_manager'),
      ('npd.project.delete', 'admin'),
      ('brief.create', 'npd_manager'),
      ('brief.create', 'core_user'),
      ('brief.create', 'admin'),
      ('brief.convert_to_npd_project', 'npd_manager'),
      ('brief.convert_to_npd_project', 'admin'),
      ('npd.core.write', 'npd_manager'),
      ('npd.core.write', 'core_user'),
      ('npd.core.write', 'admin'),
      ('npd.dashboard.view', 'npd_manager'),
      ('npd.dashboard.view', 'core_user'),
      ('npd.dashboard.view', 'dept_manager'),
      ('npd.dashboard.view', 'dept_user'),
      ('npd.dashboard.view', 'admin'),
      ('npd.dashboard.view', 'viewer'),
      ('npd.bom.export', 'npd_manager'),
      ('npd.bom.export', 'admin'),
      ('npd.d365_builder.execute', 'npd_manager'),
      ('npd.closed_flag.unset', 'npd_manager'),
      ('npd.closed_flag.unset', 'core_user'),
      ('npd.closed_flag.unset', 'dept_manager'),
      ('npd.closed_flag.unset', 'admin'),
      ('npd.schema.edit', 'admin'),
      ('npd.rule.edit', 'admin'),
      ('npd.risk.write', 'npd_manager'),
      ('npd.risk.write', 'admin'),
      ('npd.compliance_doc.write', 'npd_manager'),
      ('npd.compliance_doc.write', 'dept_manager'),
      ('npd.compliance_doc.write', 'admin'),
      ('npd.formulation.create_draft', 'npd_manager'),
      ('npd.formulation.create_draft', 'core_user'),
      ('npd.formulation.create_draft', 'admin'),
      ('npd.formulation.lock', 'npd_manager'),
      ('npd.formulation.lock', 'admin'),
      ('npd.recipe.submit_for_trial', 'npd_manager'),
      ('npd.recipe.submit_for_trial', 'core_user'),
      ('npd.recipe.submit_for_trial', 'admin'),
      ('npd.pilot.promote_to_bom', 'npd_manager'),
      ('npd.pilot.promote_to_bom', 'admin'),
      ('npd.gate.advance', 'npd_manager'),
      ('npd.gate.advance', 'admin'),
      ('npd.gate.approve', 'npd_manager'),
      ('npd.gate.approve', 'admin')
  )
  insert into public.role_permissions (role_id, permission)
  select r.id, rm.permission
  from public.roles r
  join role_matrix rm on rm.role_code = r.code
  where r.org_id = p_org_id
  on conflict (role_id, permission) do nothing;

  with matrix_permissions as (
    select r.id, rm.permission
    from public.roles r
    join (
      values
        ('fg.create', 'npd_manager'),
        ('fg.create', 'core_user'),
        ('fg.create', 'admin'),
        ('npd.project.delete', 'npd_manager'),
        ('npd.project.delete', 'admin'),
        ('brief.create', 'npd_manager'),
        ('brief.create', 'core_user'),
        ('brief.create', 'admin'),
        ('brief.convert_to_npd_project', 'npd_manager'),
        ('brief.convert_to_npd_project', 'admin'),
        ('npd.core.write', 'npd_manager'),
        ('npd.core.write', 'core_user'),
        ('npd.core.write', 'admin'),
        ('npd.dashboard.view', 'npd_manager'),
        ('npd.dashboard.view', 'core_user'),
        ('npd.dashboard.view', 'dept_manager'),
        ('npd.dashboard.view', 'dept_user'),
        ('npd.dashboard.view', 'admin'),
        ('npd.dashboard.view', 'viewer'),
        ('npd.bom.export', 'npd_manager'),
        ('npd.bom.export', 'admin'),
        ('npd.d365_builder.execute', 'npd_manager'),
        ('npd.closed_flag.unset', 'npd_manager'),
        ('npd.closed_flag.unset', 'core_user'),
        ('npd.closed_flag.unset', 'dept_manager'),
        ('npd.closed_flag.unset', 'admin'),
        ('npd.schema.edit', 'admin'),
        ('npd.rule.edit', 'admin'),
        ('npd.risk.write', 'npd_manager'),
        ('npd.risk.write', 'admin'),
        ('npd.compliance_doc.write', 'npd_manager'),
        ('npd.compliance_doc.write', 'dept_manager'),
        ('npd.compliance_doc.write', 'admin'),
        ('npd.formulation.create_draft', 'npd_manager'),
        ('npd.formulation.create_draft', 'core_user'),
        ('npd.formulation.create_draft', 'admin'),
        ('npd.formulation.lock', 'npd_manager'),
        ('npd.formulation.lock', 'admin'),
        ('npd.recipe.submit_for_trial', 'npd_manager'),
        ('npd.recipe.submit_for_trial', 'core_user'),
        ('npd.recipe.submit_for_trial', 'admin'),
        ('npd.pilot.promote_to_bom', 'npd_manager'),
        ('npd.pilot.promote_to_bom', 'admin'),
        ('npd.gate.advance', 'npd_manager'),
        ('npd.gate.advance', 'admin'),
        ('npd.gate.approve', 'npd_manager'),
        ('npd.gate.approve', 'admin')
    ) as rm(permission, role_code) on rm.role_code = r.code
    where r.org_id = p_org_id
  ),
  expanded as (
    select
      r.id,
      coalesce(
        (
          select jsonb_agg(distinct merged.permission order by merged.permission)
          from (
            select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
            union all
            select mp.permission
            from matrix_permissions mp
            where mp.id = r.id
          ) merged
        ),
        '[]'::jsonb
      ) as permissions
    from public.roles r
    where r.org_id = p_org_id
      and r.code in ('npd_manager', 'core_user', 'dept_manager', 'dept_user', 'admin', 'viewer')
  )
  update public.roles r
     set permissions = expanded.permissions
    from expanded
   where r.id = expanded.id;
end;
$$;


--
-- Name: seed_npd_role_permissions_on_org_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_npd_role_permissions_on_org_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  perform public.seed_npd_role_permissions_for_org(new.id);
  return new;
end;
$$;


--
-- Name: seed_reference_data_on_org_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_reference_data_on_org_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_apex_org_id uuid := '00000000-0000-0000-0000-000000000002'::uuid;
begin
  if new.id = v_apex_org_id then
    return new;
  end if;

  insert into "Reference"."Departments"
    (id, org_id, code, display_name, role_description, marker, created_at)
  select gen_random_uuid(),
         new.id,
         code,
         display_name,
         role_description,
         marker,
         pg_catalog.now()
    from "Reference"."Departments"
   where org_id = v_apex_org_id
  on conflict (org_id, code) do nothing;

  if exists (
    select 1
      from information_schema.tables
     where table_schema = 'Reference'
       and table_name = 'ManufacturingOperations'
  ) then
    insert into "Reference"."ManufacturingOperations"
      (id, org_id, operation_name, process_suffix, description, operation_seq,
       industry_code, is_active, marker, created_at)
    select gen_random_uuid(),
           new.id,
           seed.operation_name,
           seed.process_suffix,
           seed.description,
           seed.operation_seq,
           seed.industry_code,
           true,
           'APEX-CONFIG',
           pg_catalog.now()
      from (
        values
          ('bakery', 'Mix', 'MX', 'Ingredient mixing stage', 1),
          ('bakery', 'Knead', 'KN', 'Dough kneading stage', 2),
          ('bakery', 'Proof', 'PR', 'Dough proofing / fermentation', 3),
          ('bakery', 'Bake', 'BK', 'Oven baking stage', 4),
          ('pharma', 'Synthesis', 'SY', 'API synthesis reaction', 1),
          ('pharma', 'Separation', 'SE', 'Phase separation / extraction', 2),
          ('pharma', 'Crystallization', 'CZ', 'Crystallization and filtration', 3),
          ('pharma', 'Drying', 'DR', 'Final drying and sizing', 4),
          ('fmcg', 'Mix', 'MX', 'Blending and mixing', 1),
          ('fmcg', 'Fill', 'FL', 'Container filling', 2),
          ('fmcg', 'Seal', 'SL', 'Container sealing / capping', 3),
          ('fmcg', 'Label', 'LB', 'Label application', 4)
      ) as seed(industry_code, operation_name, process_suffix, description, operation_seq)
      where seed.industry_code = new.industry_code
    on conflict (org_id, operation_name) do nothing;
  end if;

  return new;
end;
$$;


--
-- Name: seed_reference_lookups_on_org_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_reference_lookups_on_org_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'Reference'
    AS $$
DECLARE
  v_apex_org_id uuid := '00000000-0000-0000-0000-000000000002'::uuid;
BEGIN
  -- Skip Apex itself — it is the source of the seed.
  IF NEW.id = v_apex_org_id THEN
    RETURN NEW;
  END IF;

  -- Guard: lookup tables must exist (safe on a partially migrated DB).
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'Reference'
       AND table_name   = 'PackSizes'
  ) THEN
    RETURN NEW;
  END IF;

  -- Seed the new org from the same canonical baseline (NOT a copy of Apex rows, so
  -- a manually-edited Apex set never leaks into fresh tenants).
  PERFORM "Reference".seed_reference_lookups(NEW.id);

  RETURN NEW;
END;
$$;


--
-- Name: seed_settings_infra_permissions_for_org(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_settings_infra_permissions_for_org(p_org_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  -- Normalized storage: admin-class roles get the two canonical infra permission rows.
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join (values ('settings.infra.read'), ('settings.infra.update')) as p(permission)
  where r.org_id = p_org_id
    and (
      r.code in ('owner', 'admin', 'org_admin')
      or r.slug in ('owner', 'admin', 'org.access.admin', 'org.platform.admin', 'org.schema.admin')
    )
  on conflict (role_id, permission) do nothing;

  -- Legacy jsonb cache: keep each admin-class role's permissions array in sync so either
  -- read path (role_permissions row OR roles.permissions ? perm) grants access.
  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select 'settings.infra.read'
           union all
           select 'settings.infra.update'
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (
       r.code in ('owner', 'admin', 'org_admin')
       or r.slug in ('owner', 'admin', 'org.access.admin', 'org.platform.admin', 'org.schema.admin')
     );
end;
$$;


--
-- Name: seed_settings_infra_permissions_on_org_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_settings_infra_permissions_on_org_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  perform public.seed_settings_infra_permissions_for_org(new.id);
  return new;
end;
$$;


--
-- Name: seed_settings_rbac_matrix_for_org(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_settings_rbac_matrix_for_org(p_org_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  if to_regclass('public.role_permissions') is null or to_regclass('public.roles') is null then
    return; -- RBAC tables not present yet; nothing to grant.
  end if;

  -- ----------------------------------------------------------------------
  -- 1) Normalized storage: insert (role_id, permission) for the grant matrix.
  --    grant_matrix(permission, role_family):
  --      'admin'   -> org-admin family (codes owner/admin/org_admin + slugs org.*.admin)
  --      'auditor' -> the auditor role (code or slug 'auditor')
  -- ----------------------------------------------------------------------
  with grant_matrix(permission, role_family) as (
    values
      -- Org / tenant settings ----------------------------------------------------
      ('settings.org.read',             'admin'),
      ('settings.org.update',           'admin'),
      -- Users / roles -----------------------------------------------------------
      ('settings.users.view',           'admin'),
      ('settings.users.view',           'auditor'),
      ('settings.users.invite',         'admin'),
      ('settings.users.create',         'admin'),
      ('settings.users.deactivate',     'admin'),
      ('settings.users.manage',         'admin'),
      ('settings.roles.view',           'admin'),
      ('settings.roles.assign',         'admin'),
      ('settings.roles.manage',         'admin'),
      -- Audit / impersonation ---------------------------------------------------
      ('settings.audit.read',           'admin'),
      ('settings.audit.read',           'auditor'),
      ('impersonate.tenant',            'admin'),
      -- Rules registry ----------------------------------------------------------
      ('settings.rules.view',           'admin'),
      ('settings.rules.view',           'auditor'),
      -- Reference data ----------------------------------------------------------
      ('settings.reference.view',       'admin'),
      ('settings.reference.edit',       'admin'),
      ('settings.reference.import',     'admin'),
      -- Infrastructure (warehouses / machines / locations / lines) --------------
      -- read/update = the strings the code checks; view = export-capability check.
      ('settings.infra.read',           'admin'),
      ('settings.infra.update',         'admin'),
      ('settings.infra.view',           'admin'),
      -- Feature flags / modules -------------------------------------------------
      ('settings.flags.edit',           'admin'),
      ('settings.flags.view',           'admin'),
      -- Units of measure (also repairs the migration-064 ordering bug) ----------
      ('settings.units.manage',         'admin'),
      -- D365 integration (strings as the code checks them today) ----------------
      ('settings.d365.view',            'admin'),
      ('settings.d365.manage',          'admin'),
      ('settings.d365.rotate_secret',   'admin'),
      ('settings.d365.test_connection', 'admin'),
      -- Email configuration (both string variants the code uses) ----------------
      ('settings.email.view',           'admin'),
      ('settings.email.edit',           'admin'),
      ('settings.email.read',           'admin'),
      ('settings.email_config.edit',    'admin'),
      -- SSO / SCIM --------------------------------------------------------------
      ('settings.sso.edit',             'admin'),
      ('settings.scim.edit',            'admin'),
      -- IP allowlist ------------------------------------------------------------
      ('settings.ip_allowlist.edit',    'admin'),
      -- Security page -----------------------------------------------------------
      ('settings.security.view',        'admin'),
      ('settings.security.manage',      'admin'),
      ('settings.security.edit',        'admin'),
      -- Authorization policies --------------------------------------------------
      ('settings.authorization.view',   'admin'),
      ('settings.authorization.edit',   'admin'),
      -- Schema lifecycle (preview / diff read) ----------------------------------
      ('settings.schema.read',          'admin'),
      ('settings.schema.admin',         'admin'),
      -- Role-name-as-permission gates (flags / schema-preview / promotions / security)
      ('org.access.admin',              'admin'),
      ('org.schema.admin',              'admin')
  )
  insert into public.role_permissions (role_id, permission)
  select r.id, gm.permission
  from public.roles r
  join grant_matrix gm
    on (
         gm.role_family = 'admin'
         and (
           r.code in ('owner', 'admin', 'org_admin')
           or r.slug in ('owner', 'admin', 'org_admin',
                         'org.access.admin', 'org.platform.admin', 'org.schema.admin')
         )
       )
    or (
         gm.role_family = 'auditor'
         and (r.code = 'auditor' or r.slug = 'auditor')
       )
  where r.org_id = p_org_id
  on conflict (role_id, permission) do nothing;

  -- ----------------------------------------------------------------------
  -- 2) Legacy jsonb cache: rebuild each touched role's permissions array as the
  --    set-deduped union of its existing array + every role_permissions row it now
  --    holds (so either read path grants access). Only roles in the seeded families.
  -- ----------------------------------------------------------------------
  with expanded as (
    select
      r.id,
      coalesce(
        (
          select jsonb_agg(distinct merged.value order by merged.value)
          from (
            select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as value
            union all
            select rp.permission
            from public.role_permissions rp
            where rp.role_id = r.id
          ) merged(value)
        ),
        '[]'::jsonb
      ) as permissions
    from public.roles r
    where r.org_id = p_org_id
      and (
        r.code in ('owner', 'admin', 'org_admin', 'auditor')
        or r.slug in ('owner', 'admin', 'org_admin', 'auditor',
                      'org.access.admin', 'org.platform.admin', 'org.schema.admin')
      )
  )
  update public.roles r
     set permissions = expanded.permissions
    from expanded
   where r.id = expanded.id
     and r.permissions is distinct from expanded.permissions;
end;
$$;


--
-- Name: seed_settings_rbac_matrix_on_org_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_settings_rbac_matrix_on_org_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  perform public.seed_settings_rbac_matrix_for_org(new.id);
  return new;
end;
$$;


--
-- Name: seed_system_roles_on_org_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_system_roles_on_org_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
    begin
      insert into public.roles (org_id, slug, system, code, name, permissions, is_system)
      values
        (new.id, 'org.access.admin', true, 'org.access.admin', 'Org Access Admin', '[]'::jsonb, true),
        (new.id, 'org.schema.admin', true, 'org.schema.admin', 'Org Schema Admin', '[]'::jsonb, true),
        (new.id, 'org.platform.admin', true, 'org.platform.admin', 'Org Platform Admin', '[]'::jsonb, true)
      on conflict (org_id, slug) do nothing;

      insert into public.org_security_policies (org_id, dual_control_required)
      values (new.id, true)
      on conflict (org_id) do nothing;

      return new;
    end;
    $$;


--
-- Name: seed_technical_permissions_for_org(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_technical_permissions_for_org(p_org_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  -- The complete technical.* family the 03-technical pages/actions check: the 10 strings
  -- added by T-091 (ALL_TECHNICAL_PERMISSIONS) plus the pre-existing
  -- technical.product_spec.approve workflow-authorization string, so the org admin can also
  -- approve product specs.
  v_perms text[] := array[
    'technical.allergens.edit',
    'technical.bom.approve',
    'technical.bom.create',
    'technical.bom.generate_batch',
    'technical.bom.version_publish',
    'technical.cost.edit',
    'technical.d365.sync_trigger',
    'technical.items.create',
    'technical.items.deactivate',
    'technical.items.edit',
    'technical.product_spec.approve'
  ];
  -- org-admin role family across naming conventions used in this codebase.
  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin'];
begin
  -- Normalized storage.
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles))
  on conflict (role_id, permission) do nothing;

  -- Legacy jsonb cache: union the perms into each admin role's permissions array.
  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select unnest(v_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles));
end;
$$;


--
-- Name: seed_technical_permissions_on_org_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_technical_permissions_on_org_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  perform public.seed_technical_permissions_for_org(new.id);
  return new;
end;
$$;


--
-- Name: seed_tenant_idp_config(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_tenant_idp_config() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  insert into public.tenant_idp_config (
    tenant_id,
    provider_type,
    idle_timeout_min,
    session_max_h,
    mfa_required,
    mfa_required_for_roles,
    mfa_allowed_methods,
    password_complexity
  ) values (
    new.id,
    'password',
    60,
    8,
    true,
    array['org.access.admin', 'org.schema.admin'],
    array['totp'],
    'strong'
  )
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;


--
-- Name: seed_units_of_measure_for_org(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_units_of_measure_for_org(p_org_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
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


--
-- Name: seed_units_of_measure_on_org_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_units_of_measure_on_org_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  perform public.seed_units_of_measure_for_org(new.id);
  return new;
end;
$$;


--
-- Name: set_user_pins_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_user_pins_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: supplier_spec_resolved_lifecycle(text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.supplier_spec_resolved_lifecycle(p_lifecycle_status text, p_expiry_date date) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select case
    when p_expiry_date is not null and p_expiry_date < current_date
         and p_lifecycle_status in ('draft', 'active')
      then 'expired'
    else p_lifecycle_status
  end;
$$;


--
-- Name: FUNCTION supplier_spec_resolved_lifecycle(p_lifecycle_status text, p_expiry_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.supplier_spec_resolved_lifecycle(p_lifecycle_status text, p_expiry_date date) IS 'T-075: resolves effective lifecycle — an active/draft spec past its expiry_date resolves to expired (AC2).';


--
-- Name: supplier_spec_review_proposals_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.supplier_spec_review_proposals_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


--
-- Name: supplier_spec_rm_usability(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.supplier_spec_rm_usability(p_supplier_spec_id uuid) RETURNS TABLE(usable boolean, reason text)
    LANGUAGE plpgsql STABLE
    AS $$
declare
  v_org_id uuid := app.current_org_id();
  v_spec public.supplier_specs%rowtype;
  v_effective_lifecycle text;
begin
  select *
    into v_spec
  from public.supplier_specs spec
  where spec.id = p_supplier_spec_id
    and spec.org_id = v_org_id;

  if v_spec.id is null then
    return query select false, 'NOT_FOUND'::text;
    return;
  end if;

  if v_spec.lifecycle_status = 'blocked'
     or v_spec.review_status = 'blocked'
     or v_spec.spec_review_blocked then
    return query select false, 'SPEC_BLOCKED'::text;
    return;
  end if;

  if v_spec.supplier_status <> 'approved' then
    return query select false, 'SUPPLIER_NOT_APPROVED'::text;
    return;
  end if;

  if v_spec.review_status <> 'approved' then
    return query select false, 'NOT_REVIEW_APPROVED'::text;
    return;
  end if;

  v_effective_lifecycle :=
    public.supplier_spec_resolved_lifecycle(v_spec.lifecycle_status, v_spec.expiry_date);

  if v_effective_lifecycle <> 'active' then
    -- Surface EXPIRED specifically; any other non-active resolves to the generic lifecycle code.
    if v_effective_lifecycle = 'expired' then
      return query select false, 'EXPIRED'::text;
    else
      return query select false, ('LIFECYCLE_' || upper(v_effective_lifecycle))::text;
    end if;
    return;
  end if;

  return query select true, 'OK'::text;
end;
$$;


--
-- Name: FUNCTION supplier_spec_rm_usability(p_supplier_spec_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.supplier_spec_rm_usability(p_supplier_spec_id uuid) IS 'T-075: typed RM-usability decision (usable, reason). reason in OK|SUPPLIER_NOT_APPROVED|EXPIRED|NOT_REVIEW_APPROVED|SPEC_BLOCKED|NOT_FOUND.';


--
-- Name: supplier_specs_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.supplier_specs_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


--
-- Name: sync_prod_detail_rows(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_prod_detail_rows(p_product_code text, p_app_version text DEFAULT 'sync_prod_detail_rows-v1'::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
declare
  v_org_id uuid := app.current_org_id();
  v_recipe text;
  v_components text[];
  v_added text[] := '{}'::text[];
  v_removed text[] := '{}'::text[];
  v_code text;
  v_idx integer := 0;
  v_item_id uuid;
  v_changed integer := 0;
begin
  if v_org_id is null then
    raise exception 'sync_prod_detail_rows requires an org context (app.current_org_id() is null)';
  end if;

  -- Read the product's free-text recipe component list (comma-separated) within scope.
  select p.recipe_components
    into v_recipe
    from public.product p
   where p.org_id = v_org_id
     and p.product_code = p_product_code;

  if not found then
    raise exception 'sync_prod_detail_rows: product % not visible in org %', p_product_code, v_org_id;
  end if;

  -- Parse: split on comma, trim, drop blanks, de-duplicate preserving first-seen order.
  select coalesce(
           array_agg(c order by ord),
           '{}'::text[]
         )
    into v_components
    from (
      select trimmed as c, min(ord) as ord
        from (
          select pg_catalog.btrim(part) as trimmed,
                 ordinality as ord
            from unnest(string_to_array(coalesce(v_recipe, ''), ',')) with ordinality as t(part, ordinality)
        ) parts
       where length(trimmed) > 0
       group by trimmed
    ) deduped;

  -- Remove prod_detail rows whose intermediate_code no longer appears in the recipe.
  with deleted as (
    delete from public.prod_detail pd
     where pd.org_id = v_org_id
       and pd.product_code = p_product_code
       and not (pd.intermediate_code = any (v_components))
    returning pd.intermediate_code
  )
  select coalesce(array_agg(intermediate_code), '{}'::text[]) into v_removed from deleted;
  v_changed := v_changed + coalesce(array_length(v_removed, 1), 0);

  -- Upsert one row per component, in recipe order. Match an existing real item
  -- by code so item_id is wired automatically when the item master has it.
  foreach v_code in array v_components loop
    v_idx := v_idx + 1;

    select i.id
      into v_item_id
      from public.items i
     where i.org_id = v_org_id
       and i.item_code = v_code
       and i.item_type in ('rm', 'intermediate', 'co_product')
     limit 1;

    if exists (
      select 1 from public.prod_detail pd
       where pd.org_id = v_org_id
         and pd.product_code = p_product_code
         and pd.intermediate_code = v_code
    ) then
      update public.prod_detail pd
         set component_index = v_idx,
             item_id = coalesce(v_item_id, pd.item_id)
       where pd.org_id = v_org_id
         and pd.product_code = p_product_code
         and pd.intermediate_code = v_code
         and (pd.component_index is distinct from v_idx
              or (v_item_id is not null and pd.item_id is distinct from v_item_id));
    else
      insert into public.prod_detail
        (org_id, product_code, intermediate_code, component_index, item_id)
      values
        (v_org_id, p_product_code, v_code, v_idx, v_item_id);
      v_added := array_append(v_added, v_code);
      v_changed := v_changed + 1;
    end if;
  end loop;

  -- Emit an audit event only when the materialized component set actually changed.
  if coalesce(array_length(v_added, 1), 0) > 0
     or coalesce(array_length(v_removed, 1), 0) > 0 then
    insert into public.outbox_events
      (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
    values
      (v_org_id, 'fa.recipe_changed', 'fa', p_product_code,
       jsonb_build_object(
         'product_code', p_product_code,
         'next_recipe_components', array_to_string(v_components, ', '),
         'diff', jsonb_build_object('added', to_jsonb(v_added), 'removed', to_jsonb(v_removed))
       ),
       p_app_version);
  end if;

  return v_changed;
end;
$$;


--
-- Name: FUNCTION sync_prod_detail_rows(p_product_code text, p_app_version text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.sync_prod_detail_rows(p_product_code text, p_app_version text) IS 'Lane-B: materialize/refresh prod_detail rows from product.recipe_components (org-scoped, idempotent); wires item_id from the items master by code.';


--
-- Name: technical_sensory_evaluations_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.technical_sensory_evaluations_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


--
-- Name: unit_of_measure_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unit_of_measure_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin new.updated_at := pg_catalog.now(); return new; end; $$;


--
-- Name: update_fa_allergen_set(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_fa_allergen_set(p_product_code text) RETURNS TABLE(product_code text, allergens text[], may_contain text[], changed boolean)
    LANGUAGE plpgsql
    AS $$
declare
  v_org_id uuid := app.current_org_id();
  v_old_allergens text[];
  v_old_may_contain text[];
  v_new_allergens text[];
  v_new_may_contain text[];
  v_changed boolean := false;
begin
  if v_org_id is null then
    raise exception 'update_fa_allergen_set requires an org context (app.current_org_id())';
  end if;

  -- Lock the FG row for this org; fail loudly if it is not visible/owned.
  select coalesce(prod.allergens, '{}'::text[]), coalesce(prod.may_contain, '{}'::text[])
    into v_old_allergens, v_old_may_contain
  from public.product prod
  where prod.product_code = p_product_code
    and prod.org_id = v_org_id
  for update;

  if not found then
    raise exception 'update_fa_allergen_set: product % not found in current org', p_product_code;
  end if;

  -- Recompute from the read-model (already org-scoped via security_invoker + RLS).
  select
    coalesce(casc.published_allergens, '{}'::text[]),
    coalesce(casc.may_contain_allergens, '{}'::text[])
    into v_new_allergens, v_new_may_contain
  from public.fa_allergen_cascade casc
  where casc.product_code = p_product_code
    and casc.org_id = v_org_id;

  v_new_allergens := coalesce(v_new_allergens, '{}'::text[]);
  v_new_may_contain := coalesce(v_new_may_contain, '{}'::text[]);

  -- Diff old vs new (order-independent set comparison). text[] equality after sort.
  v_changed := (
    (select coalesce(pg_catalog.array_agg(a order by a), '{}'::text[])
       from unnest(v_old_allergens) a)
      is distinct from
    (select coalesce(pg_catalog.array_agg(a order by a), '{}'::text[])
       from unnest(v_new_allergens) a)
  ) or (
    (select coalesce(pg_catalog.array_agg(m order by m), '{}'::text[])
       from unnest(v_old_may_contain) m)
      is distinct from
    (select coalesce(pg_catalog.array_agg(m order by m), '{}'::text[])
       from unnest(v_new_may_contain) m)
  );

  if v_changed then
    -- Persist normalized (sorted, deduped) sets onto the FG row.
    update public.product prod
       set allergens = (select coalesce(pg_catalog.array_agg(distinct a order by a), '{}'::text[])
                          from unnest(v_new_allergens) a),
           may_contain = (select coalesce(pg_catalog.array_agg(distinct m order by m), '{}'::text[])
                            from unnest(v_new_may_contain) m)
     where prod.product_code = p_product_code
       and prod.org_id = v_org_id;

    -- Emit the canonical change event ONLY when the set actually changed.
    insert into public.outbox_events
      (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
    values (
      v_org_id,
      'fa.allergens_changed',
      'fa',
      p_product_code,
      jsonb_build_object(
        'product_code', p_product_code,
        'allergens', pg_catalog.to_jsonb(v_new_allergens),
        'may_contain', pg_catalog.to_jsonb(v_new_may_contain),
        'previous_allergens', pg_catalog.to_jsonb(v_old_allergens),
        'previous_may_contain', pg_catalog.to_jsonb(v_old_may_contain)
      ),
      'db-114'
    );
  end if;

  return query
  select prod.product_code, prod.allergens, prod.may_contain, v_changed
  from public.product prod
  where prod.product_code = p_product_code
    and prod.org_id = v_org_id;
end;
$$;


--
-- Name: FUNCTION update_fa_allergen_set(p_product_code text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.update_fa_allergen_set(p_product_code text) IS 'T-038 cascade engine: recomputes the derived allergen set for a FG from RM/process/override sources (via fa_allergen_cascade), materializes published_allergens→product.allergens and may_contain_allergens→product.may_contain, and emits outbox fa.allergens_changed ONLY when the persisted set changes. Idempotent: no-op + no event when unchanged. security invoker, org-scoped via app.current_org_id().';


--
-- Name: work_orders_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.work_orders_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AlertThresholds; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."AlertThresholds" (
    org_id uuid NOT NULL,
    threshold_key text NOT NULL,
    value_int integer,
    value_text text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY "Reference"."AlertThresholds" FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE "AlertThresholds"; Type: COMMENT; Schema: Reference; Owner: -
--

COMMENT ON TABLE "Reference"."AlertThresholds" IS 'T-049: Per-org NPD dashboard alert threshold configuration. Seed values are owned by T-050.';


--
-- Name: Allergens; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."Allergens" (
    org_id uuid NOT NULL,
    allergen_code text NOT NULL,
    allergen_name text NOT NULL,
    display_name text NOT NULL,
    regulatory_framework text NOT NULL,
    seed_source text,
    display_name_pl text,
    display_name_uk text,
    display_name_ro text,
    marker text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reference_allergens_regulatory_framework_check CHECK ((regulatory_framework = ANY (ARRAY['EU_FIC_1169_2011'::text, 'US_FALCPA'::text, 'UK_FIR'::text, 'custom'::text]))),
    CONSTRAINT reference_allergens_seed_source_check CHECK (((seed_source IS NULL) OR (seed_source = ANY (ARRAY['EU14_default'::text, 'org_added'::text]))))
);

ALTER TABLE ONLY "Reference"."Allergens" FORCE ROW LEVEL SECURITY;


--
-- Name: Allergens_added_by_Process; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."Allergens_added_by_Process" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    process_name text NOT NULL,
    allergen_code text NOT NULL,
    confidence text NOT NULL,
    recipe_condition text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reference_allergens_added_by_process_confidence_check CHECK ((confidence = ANY (ARRAY['confirmed'::text, 'conditional'::text])))
);

ALTER TABLE ONLY "Reference"."Allergens_added_by_Process" FORCE ROW LEVEL SECURITY;


--
-- Name: Allergens_by_RM; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."Allergens_by_RM" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    ingredient_codes text NOT NULL,
    allergen_code text NOT NULL,
    confidence text NOT NULL,
    source text NOT NULL,
    last_verified date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reference_allergens_by_rm_confidence_check CHECK ((confidence = ANY (ARRAY['confirmed'::text, 'may_contain'::text, 'trace'::text]))),
    CONSTRAINT reference_allergens_by_rm_source_check CHECK ((source = ANY (ARRAY['supplier_spec'::text, 'manual'::text, 'lab_test'::text])))
);

ALTER TABLE ONLY "Reference"."Allergens_by_RM" FORCE ROW LEVEL SECURITY;


--
-- Name: ApprovalChainTemplates; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."ApprovalChainTemplates" (
    org_id uuid NOT NULL,
    template_id text NOT NULL,
    chain_mode text NOT NULL,
    steps jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT approval_chain_templates_chain_mode_check CHECK ((chain_mode = ANY (ARRAY['single'::text, 'multi'::text]))),
    CONSTRAINT approval_chain_templates_steps_array_check CHECK ((jsonb_typeof(steps) = 'array'::text))
);

ALTER TABLE ONLY "Reference"."ApprovalChainTemplates" FORCE ROW LEVEL SECURITY;


--
-- Name: BriefFieldMapping; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."BriefFieldMapping" (
    org_id uuid NOT NULL,
    brief_col text NOT NULL,
    fa_target text NOT NULL,
    transform text NOT NULL,
    marker text NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT brief_field_mapping_brief_col_check CHECK ((brief_col ~ '^C([1-9]|1[0-9]|20)$'::text)),
    CONSTRAINT brief_field_mapping_marker_not_reserved_check CHECK ((lower(marker) !~~ '%reserved%'::text)),
    CONSTRAINT brief_field_mapping_schema_version_check CHECK ((schema_version >= 1))
);

ALTER TABLE ONLY "Reference"."BriefFieldMapping" FORCE ROW LEVEL SECURITY;


--
-- Name: CloseConfirm; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."CloseConfirm" (
    org_id uuid NOT NULL,
    value text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT close_confirm_allowed_value CHECK ((value = ANY (ARRAY['Yes'::text, 'No'::text, ''::text])))
);

ALTER TABLE ONLY "Reference"."CloseConfirm" FORCE ROW LEVEL SECURITY;


--
-- Name: D365_Constants; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."D365_Constants" (
    org_id uuid NOT NULL,
    constant_key text NOT NULL,
    constant_value text,
    description text NOT NULL,
    marker text DEFAULT 'LEGACY-D365;APEX-CONFIG'::text NOT NULL,
    last_updated timestamp with time zone DEFAULT now() NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT d365_constants_marker_check CHECK (((marker ~~ '%LEGACY-D365%'::text) AND (marker ~~ '%APEX-CONFIG%'::text))),
    CONSTRAINT d365_constants_schema_version_check CHECK ((schema_version >= 1))
);

ALTER TABLE ONLY "Reference"."D365_Constants" FORCE ROW LEVEL SECURITY;


--
-- Name: Departments; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."Departments" (
    id uuid NOT NULL,
    org_id uuid NOT NULL,
    code text NOT NULL,
    display_name text NOT NULL,
    role_description text NOT NULL,
    marker text DEFAULT 'APEX-CONFIG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY "Reference"."Departments" FORCE ROW LEVEL SECURITY;


--
-- Name: DeptColumns; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."DeptColumns" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    dept_code text NOT NULL,
    column_key text NOT NULL,
    field_type text NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    validation_dsl jsonb,
    schema_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id text,
    dropdown_source text,
    blocking_rule text,
    required_for_done boolean DEFAULT false NOT NULL,
    display_order integer,
    marker text,
    data_type text
);

ALTER TABLE ONLY "Reference"."DeptColumns" FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN "DeptColumns".data_type; Type: COMMENT; Schema: Reference; Owner: -
--

COMMENT ON COLUMN "Reference"."DeptColumns".data_type IS 'T-014 ADR-028 runtime primitive: text, number, date, or dropdown. Backfilled from legacy field_type for compatibility.';


--
-- Name: Equipment_Setup_By_Line_Pack; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."Equipment_Setup_By_Line_Pack" (
    org_id uuid NOT NULL,
    line text NOT NULL,
    pack_size text NOT NULL,
    equipment_setup text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY "Reference"."Equipment_Setup_By_Line_Pack" FORCE ROW LEVEL SECURITY;


--
-- Name: FieldTypes; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."FieldTypes" (
    code text NOT NULL,
    ts_type text NOT NULL,
    json_schema jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id text,
    schema_version integer DEFAULT 1 NOT NULL
);

ALTER TABLE ONLY "Reference"."FieldTypes" FORCE ROW LEVEL SECURITY;


--
-- Name: Formulas; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."Formulas" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    formula_key text NOT NULL,
    expression text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id text,
    schema_version integer DEFAULT 1 NOT NULL
);

ALTER TABLE ONLY "Reference"."Formulas" FORCE ROW LEVEL SECURITY;


--
-- Name: GateChecklistTemplates; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."GateChecklistTemplates" (
    org_id uuid NOT NULL,
    template_id text NOT NULL,
    gate_code text NOT NULL,
    category_code text NOT NULL,
    item_text text NOT NULL,
    required boolean NOT NULL,
    sequence integer NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT gate_checklist_templates_category_code_check CHECK ((category_code = ANY (ARRAY['technical'::text, 'business'::text, 'compliance'::text]))),
    CONSTRAINT gate_checklist_templates_gate_code_check CHECK ((gate_code = ANY (ARRAY['G0'::text, 'G1'::text, 'G2'::text, 'G3'::text, 'G4'::text]))),
    CONSTRAINT gate_checklist_templates_schema_version_positive_check CHECK ((schema_version > 0)),
    CONSTRAINT gate_checklist_templates_sequence_positive_check CHECK ((sequence > 0))
);

ALTER TABLE ONLY "Reference"."GateChecklistTemplates" FORCE ROW LEVEL SECURITY;


--
-- Name: Lines_By_PackSize; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."Lines_By_PackSize" (
    org_id uuid NOT NULL,
    line text NOT NULL,
    supported_pack_sizes text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY "Reference"."Lines_By_PackSize" FORCE ROW LEVEL SECURITY;


--
-- Name: ManufacturingOperations; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."ManufacturingOperations" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    operation_name text NOT NULL,
    process_suffix text NOT NULL,
    description text,
    operation_seq integer NOT NULL,
    industry_code text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    marker text DEFAULT 'APEX-CONFIG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "ManufacturingOperations_process_suffix_check" CHECK ((process_suffix ~ '^[A-Z0-9]{2,4}$'::text)),
    CONSTRAINT manufacturing_operations_industry_code_check CHECK ((industry_code = ANY (ARRAY['bakery'::text, 'pharma'::text, 'fmcg'::text]))),
    CONSTRAINT manufacturing_operations_process_suffix_check CHECK ((process_suffix ~ '^[A-Z0-9]{2,4}$'::text))
);

ALTER TABLE ONLY "Reference"."ManufacturingOperations" FORCE ROW LEVEL SECURITY;


--
-- Name: Nutrients; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."Nutrients" (
    nutrient_code text NOT NULL,
    display_name text NOT NULL,
    unit text NOT NULL,
    display_order integer NOT NULL,
    regulation text NOT NULL,
    CONSTRAINT reference_nutrients_code_nonempty_check CHECK ((length(btrim(nutrient_code)) > 0))
);


--
-- Name: PackSizes; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."PackSizes" (
    org_id uuid NOT NULL,
    value text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY "Reference"."PackSizes" FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE "PackSizes"; Type: COMMENT; Schema: Reference; Owner: -
--

COMMENT ON TABLE "Reference"."PackSizes" IS 'T-028 V03 source: per-org pack-size lookup for NPD validators.';


--
-- Name: RawMaterials; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."RawMaterials" (
    org_id uuid NOT NULL,
    rm_code text NOT NULL,
    display_name text NOT NULL,
    nutrition_per_100g jsonb DEFAULT '{}'::jsonb NOT NULL,
    allergens_inherited text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT reference_raw_materials_rm_code_nonempty_check CHECK ((length(btrim(rm_code)) > 0))
);

ALTER TABLE ONLY "Reference"."RawMaterials" FORCE ROW LEVEL SECURITY;


--
-- Name: Rules; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."Rules" (
    id uuid NOT NULL,
    org_id uuid NOT NULL,
    rule_id text NOT NULL,
    rule_type text NOT NULL,
    definition_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    active_from timestamp with time zone DEFAULT now() NOT NULL,
    active_to timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id text,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT rules_rule_type_check CHECK ((rule_type = ANY (ARRAY['cascading'::text, 'conditional_required'::text, 'gate'::text, 'workflow'::text])))
);

ALTER TABLE ONLY "Reference"."Rules" FORCE ROW LEVEL SECURITY;


--
-- Name: Templates; Type: TABLE; Schema: Reference; Owner: -
--

CREATE TABLE "Reference"."Templates" (
    org_id uuid NOT NULL,
    template_name text NOT NULL,
    operation_1_name text,
    operation_2_name text,
    operation_3_name text,
    operation_4_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY "Reference"."Templates" FORCE ROW LEVEL SECURITY;


--
-- Name: active_org_contexts; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.active_org_contexts (
    backend_pid integer NOT NULL,
    transaction_id bigint NOT NULL,
    session_token uuid NOT NULL,
    org_id uuid NOT NULL,
    set_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: session_org_contexts; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.session_org_contexts (
    session_token uuid NOT NULL,
    org_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_ip_allowlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_ip_allowlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    cidr inet NOT NULL,
    label text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_ip_allowlist_label_check CHECK (((label IS NULL) OR (char_length(label) <= 120))),
    CONSTRAINT admin_ip_allowlist_no_default_route CHECK (((cidr <> '0.0.0.0/0'::inet) AND (cidr <> '::/0'::inet)))
);

ALTER TABLE ONLY public.admin_ip_allowlist FORCE ROW LEVEL SECURITY;


--
-- Name: allergen_cascade_rebuild_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.allergen_cascade_rebuild_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    product_code text NOT NULL,
    source_event_id uuid NOT NULL,
    source_event_type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    run_after timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT allergen_cascade_rebuild_jobs_source_event_type_check CHECK ((source_event_type = ANY (ARRAY['reference.allergens_by_rm.bulk_changed'::text, 'reference.allergens_added_by_process.bulk_changed'::text]))),
    CONSTRAINT allergen_cascade_rebuild_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'processed'::text])))
);

ALTER TABLE ONLY public.allergen_cascade_rebuild_jobs FORCE ROW LEVEL SECURITY;


--
-- Name: allergen_contamination_risk; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.allergen_contamination_risk (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    line_id uuid,
    machine_id uuid,
    allergen_code text NOT NULL,
    risk_level text NOT NULL,
    mitigation text,
    site_id uuid,
    last_assessed_at timestamp with time zone,
    assessed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT allergen_contamination_risk_allergen_code_nonblank_check CHECK ((length(btrim(allergen_code)) > 0)),
    CONSTRAINT allergen_contamination_risk_risk_level_check CHECK ((risk_level = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text, 'segregated'::text]))),
    CONSTRAINT allergen_contamination_risk_target_check CHECK (((line_id IS NOT NULL) OR (machine_id IS NOT NULL)))
);

ALTER TABLE ONLY public.allergen_contamination_risk FORCE ROW LEVEL SECURITY;


--
-- Name: allergens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.allergens (
    code text NOT NULL,
    name text NOT NULL,
    name_pl text,
    name_de text,
    name_fr text,
    name_uk text,
    name_ro text,
    icon_url text,
    is_active boolean DEFAULT true NOT NULL
);

ALTER TABLE ONLY public.allergens FORCE ROW LEVEL SECURITY;


--
-- Name: audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_events (
    id bigint NOT NULL,
    org_id uuid,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    impersonator_id uuid,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    ip_address inet,
    user_agent text,
    request_id uuid NOT NULL,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    is_unauthenticated boolean DEFAULT false NOT NULL,
    CONSTRAINT audit_events_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_events_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text]))),
    CONSTRAINT audit_events_role_assigned_security_check CHECK (((action <> 'role.assigned'::text) OR (retention_class = 'security'::text)))
);

ALTER TABLE ONLY public.audit_events FORCE ROW LEVEL SECURITY;


--
-- Name: CONSTRAINT audit_events_role_assigned_security_check ON audit_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT audit_events_role_assigned_security_check ON public.audit_events IS 'T-014: role.assigned events must always use retention_class=security (security red line)';


--
-- Name: audit_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_events_id_seq OWNED BY public.audit_events.id;


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
)
PARTITION BY RANGE (occurred_at);

ALTER TABLE ONLY public.audit_log FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_01; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_01 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
);

ALTER TABLE ONLY public.audit_log_2026_01 FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_02; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_02 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
);

ALTER TABLE ONLY public.audit_log_2026_02 FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_03; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_03 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
);

ALTER TABLE ONLY public.audit_log_2026_03 FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_04; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_04 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
);

ALTER TABLE ONLY public.audit_log_2026_04 FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_05; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_05 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
);

ALTER TABLE ONLY public.audit_log_2026_05 FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_06; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_06 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
);

ALTER TABLE ONLY public.audit_log_2026_06 FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_07; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_07 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
);

ALTER TABLE ONLY public.audit_log_2026_07 FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_08; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_08 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
);

ALTER TABLE ONLY public.audit_log_2026_08 FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_09; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_09 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
);

ALTER TABLE ONLY public.audit_log_2026_09 FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_10; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_10 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
);

ALTER TABLE ONLY public.audit_log_2026_10 FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_11; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_11 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
);

ALTER TABLE ONLY public.audit_log_2026_11 FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_12; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_2026_12 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_user_id uuid,
    actor_type text,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    before_state jsonb,
    after_state jsonb,
    request_id uuid,
    retention_class text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT audit_log_actor_type_check CHECK (((actor_type IS NULL) OR (actor_type = ANY (ARRAY['user'::text, 'system'::text, 'scim'::text, 'impersonation'::text])))),
    CONSTRAINT audit_log_retention_class_check CHECK ((retention_class = ANY (ARRAY['security'::text, 'standard'::text, 'operational'::text, 'ephemeral'::text])))
);

ALTER TABLE ONLY public.audit_log_2026_12 FORCE ROW LEVEL SECURITY;


--
-- Name: bom_co_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bom_co_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    bom_header_id uuid NOT NULL,
    co_product_item_id uuid NOT NULL,
    quantity numeric(14,6) NOT NULL,
    uom text NOT NULL,
    allocation_pct numeric(6,3) NOT NULL,
    is_byproduct boolean DEFAULT false NOT NULL,
    site_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT bom_co_products_allocation_pct_check CHECK (((allocation_pct >= (0)::numeric) AND (allocation_pct <= 100.000))),
    CONSTRAINT bom_co_products_byproduct_allocation_check CHECK (((is_byproduct IS FALSE) OR (allocation_pct = (0)::numeric))),
    CONSTRAINT bom_co_products_quantity_positive_check CHECK ((quantity > (0)::numeric))
);

ALTER TABLE ONLY public.bom_co_products FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE bom_co_products; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bom_co_products IS 'T-002: co-products (positive market value) + byproducts (is_byproduct=true, allocation_pct=0) per shared BOM version. Cost allocation_pct of parent + non-byproduct co-products sums to 100. Part of the shared BOM SSOT; D365 is integration only.';


--
-- Name: COLUMN bom_co_products.site_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bom_co_products.site_id IS 'Day-1 multi-site column (uuid NULL). 14-multi-site/T-030 backfills + tightens to NOT NULL + composite (org_id, site_id) RLS. No FK / RLS predicate here.';


--
-- Name: bom_generator_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bom_generator_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    site_id uuid,
    scope text NOT NULL,
    output_mode text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    expected_count integer DEFAULT 0 NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    result_urls jsonb DEFAULT '[]'::jsonb NOT NULL,
    error_message text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT bom_generator_jobs_expected_count_check CHECK ((expected_count >= 0)),
    CONSTRAINT bom_generator_jobs_output_mode_check CHECK ((output_mode = ANY (ARRAY['per_fg'::text, 'single_batch'::text]))),
    CONSTRAINT bom_generator_jobs_payload_object_check CHECK ((jsonb_typeof(payload) = 'object'::text)),
    CONSTRAINT bom_generator_jobs_result_urls_array_check CHECK ((jsonb_typeof(result_urls) = 'array'::text)),
    CONSTRAINT bom_generator_jobs_scope_check CHECK ((scope = ANY (ARRAY['all_complete'::text, 'selected'::text]))),
    CONSTRAINT bom_generator_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text])))
);

ALTER TABLE ONLY public.bom_generator_jobs FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE bom_generator_jobs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bom_generator_jobs IS 'T-016: async BOM Generator job queue. The POST /api/technical/bom-generator Server Action enqueues ONE row (status queued) carrying the V-TEC-15-filtered FG scope + output mode; the worker builds the XLSX artifact(s) and stamps result_urls. XLSX is NEVER built inside the request. Internal BOM explode/compose — distinct from NPD D365 Builder. Shared BOM SSOT; D365 integration only.';


--
-- Name: COLUMN bom_generator_jobs.site_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bom_generator_jobs.site_id IS 'Day-1 multi-site column (uuid NULL). 14-multi-site/T-030 backfills + tightens to NOT NULL + composite (org_id, site_id) RLS. No FK / RLS predicate here.';


--
-- Name: bom_headers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bom_headers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    product_id text,
    npd_project_id uuid,
    fa_code text,
    origin_module text DEFAULT 'technical'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    supersedes_bom_header_id uuid,
    yield_pct numeric(6,3) DEFAULT 100.000 NOT NULL,
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    effective_to date,
    approved_by uuid,
    approved_at timestamp with time zone,
    technical_review_requested_by uuid,
    technical_review_requested_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT bom_headers_approved_status_requires_approval_check CHECK (((status <> ALL (ARRAY['technical_approved'::text, 'active'::text])) OR ((approved_by IS NOT NULL) AND (approved_at IS NOT NULL)))),
    CONSTRAINT bom_headers_effective_dates_check CHECK (((effective_to IS NULL) OR (effective_to >= effective_from))),
    CONSTRAINT bom_headers_not_orphaned_check CHECK (((product_id IS NOT NULL) OR (npd_project_id IS NOT NULL) OR (fa_code IS NOT NULL))),
    CONSTRAINT bom_headers_origin_module_check CHECK ((origin_module = ANY (ARRAY['npd'::text, 'technical'::text, 'imported'::text]))),
    CONSTRAINT bom_headers_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'in_review'::text, 'technical_approved'::text, 'active'::text, 'superseded'::text, 'archived'::text]))),
    CONSTRAINT bom_headers_version_positive_check CHECK ((version > 0)),
    CONSTRAINT bom_headers_yield_pct_check CHECK (((yield_pct > (0)::numeric) AND (yield_pct <= 100.000)))
);

ALTER TABLE ONLY public.bom_headers FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE bom_headers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bom_headers IS 'T-092: bom_headers/bom_lines are the shared BOM SSOT across NPD, Technical, Planning, Production, and integrations. D365 is integration only, never source of truth.';


--
-- Name: COLUMN bom_headers.origin_module; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bom_headers.origin_module IS 'Shared BOM origin: npd for NPD Builder initial versions, technical for Technical-owned edits, imported for integration-created drafts. D365 imports are integration only, not BOM SSOT.';


--
-- Name: COLUMN bom_headers.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bom_headers.status IS 'Shared BOM lifecycle: draft, in_review, technical_approved, active, superseded, archived. technical_approved maps the Technical approval milestone before active factory use.';


--
-- Name: bom_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bom_item (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_id text,
    org_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id uuid,
    schema_version integer DEFAULT 1 NOT NULL
);

ALTER TABLE ONLY public.bom_item FORCE ROW LEVEL SECURITY;


--
-- Name: bom_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bom_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    bom_header_id uuid NOT NULL,
    line_no integer NOT NULL,
    component_code text NOT NULL,
    component_type text,
    quantity numeric(14,6) NOT NULL,
    uom text NOT NULL,
    scrap_pct numeric(5,2) DEFAULT 0.00 NOT NULL,
    manufacturing_operation_name text,
    sequence integer,
    is_phantom boolean DEFAULT false NOT NULL,
    source text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    item_id uuid,
    CONSTRAINT bom_lines_component_type_check CHECK (((component_type IS NULL) OR (component_type = ANY (ARRAY['RM'::text, 'PM'::text, 'WIP'::text, 'FG'::text])))),
    CONSTRAINT bom_lines_line_no_check CHECK ((line_no > 0)),
    CONSTRAINT bom_lines_quantity_positive_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT bom_lines_scrap_pct_check CHECK (((scrap_pct >= (0)::numeric) AND (scrap_pct <= 100.00)))
);

ALTER TABLE ONLY public.bom_lines FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE bom_lines; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bom_lines IS 'T-092: Line items for the shared BOM SSOT. Initial NPD Builder BOMs and Technical post-release versions use this same model; D365 is integration only.';


--
-- Name: COLUMN bom_lines.item_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bom_lines.item_id IS 'T-002: canonical item master FK (public.items). component_code TEXT is retained for display / back-compat; item_id is the authoritative component reference for the shared BOM SSOT.';


--
-- Name: bom_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bom_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    work_order_id uuid,
    bom_header_id uuid NOT NULL,
    snapshot_json jsonb NOT NULL,
    site_id uuid,
    snapshot_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bom_snapshots_snapshot_json_object_check CHECK ((jsonb_typeof(snapshot_json) = 'object'::text))
);

ALTER TABLE ONLY public.bom_snapshots FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE bom_snapshots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bom_snapshots IS 'T-002: immutable flattened BOM snapshot (header + lines + co-products) captured at WO creation (ADR-002). WO execution reads only its snapshot, never live bom_headers. work_order_id FK is added by 08-PRODUCTION. site_id is the Day-1 multi-site column. Shared BOM SSOT; D365 is integration only.';


--
-- Name: COLUMN bom_snapshots.work_order_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bom_snapshots.work_order_id IS 'T-002: soft UUID reference to 08-PRODUCTION work_orders; FK is intentionally deferred to 08-PRODUCTION (table does not exist yet).';


--
-- Name: COLUMN bom_snapshots.site_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bom_snapshots.site_id IS 'Day-1 multi-site column (uuid NULL). 14-multi-site/T-030 backfills + tightens to NOT NULL + composite (org_id, site_id) RLS. No FK / RLS predicate here.';


--
-- Name: brief; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brief (
    brief_id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    npd_project_id uuid,
    template text NOT NULL,
    dev_code text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    product_name text,
    volume numeric,
    converted_at timestamp with time zone,
    converted_by_user uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id uuid,
    external_id text,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT brief_schema_version_check CHECK ((schema_version >= 1)),
    CONSTRAINT brief_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'complete'::text, 'converted'::text, 'abandoned'::text]))),
    CONSTRAINT brief_template_check CHECK ((template = ANY (ARRAY['single_component'::text, 'multi_component'::text]))),
    CONSTRAINT brief_volume_positive_check CHECK (((volume IS NULL) OR (volume > (0)::numeric)))
);

ALTER TABLE ONLY public.brief FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE brief; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.brief IS 'T-030 NPD brief header. Canonical conversion target is npd_projects; FG/product mapping is deferred to G3.';


--
-- Name: brief_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brief_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brief_id uuid NOT NULL,
    org_id uuid NOT NULL,
    line_type text NOT NULL,
    line_index integer NOT NULL,
    product text,
    volume numeric,
    dev_code text,
    component text,
    slice_count integer,
    supplier text,
    code text,
    price text,
    weights numeric,
    pct numeric,
    packs_per_case integer,
    comments text,
    benchmark_identified text,
    primary_packaging text,
    secondary_packaging text,
    base_web_code text,
    base_web_price numeric,
    top_web_type text,
    sleeve_carton_code text,
    sleeve_carton_price numeric,
    packaging_ext jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT brief_lines_line_index_positive_check CHECK ((line_index >= 0)),
    CONSTRAINT brief_lines_line_type_check CHECK ((line_type = ANY (ARRAY['product'::text, 'component'::text, 'summary'::text]))),
    CONSTRAINT brief_lines_packs_per_case_positive_check CHECK (((packs_per_case IS NULL) OR (packs_per_case > 0))),
    CONSTRAINT brief_lines_pct_range_check CHECK (((pct IS NULL) OR ((pct >= (0)::numeric) AND (pct <= (100)::numeric)))),
    CONSTRAINT brief_lines_slice_count_nonnegative_check CHECK (((slice_count IS NULL) OR (slice_count >= 0))),
    CONSTRAINT brief_lines_volume_positive_check CHECK (((volume IS NULL) OR (volume > (0)::numeric))),
    CONSTRAINT brief_lines_weights_nonnegative_check CHECK (((weights IS NULL) OR (weights >= (0)::numeric)))
);

ALTER TABLE ONLY public.brief_lines FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE brief_lines; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.brief_lines IS 'T-030 NPD brief lines. Unknown Section B packaging fields are stored only in packaging_ext JSONB until rescan.';


--
-- Name: brief_to_fa_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brief_to_fa_audit (
    id bigint NOT NULL,
    org_id uuid NOT NULL,
    brief_id uuid NOT NULL,
    product_code text,
    field_name text NOT NULL,
    applied boolean DEFAULT false NOT NULL,
    mapping_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT brief_to_fa_audit_field_name_check CHECK ((field_name ~ '^C([1-9]|1[0-9]|20)$'::text)),
    CONSTRAINT brief_to_fa_audit_mapping_version_check CHECK ((mapping_version >= 1))
);

ALTER TABLE ONLY public.brief_to_fa_audit FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE brief_to_fa_audit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.brief_to_fa_audit IS 'T-033 legacy compatibility audit for Brief -> Project completion. FA/Product creation remains owned by G3.';


--
-- Name: brief_to_fa_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.brief_to_fa_audit ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.brief_to_fa_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: capacity_plan_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.capacity_plan_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    site_id uuid,
    plan_id uuid NOT NULL,
    resource_id uuid,
    resource_kind text DEFAULT 'line'::text NOT NULL,
    bucket_date date NOT NULL,
    available_hours numeric(12,4) DEFAULT 0 NOT NULL,
    required_hours numeric(12,4) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT capacity_plan_lines_available_nonnegative_check CHECK ((available_hours >= (0)::numeric)),
    CONSTRAINT capacity_plan_lines_required_nonnegative_check CHECK ((required_hours >= (0)::numeric)),
    CONSTRAINT capacity_plan_lines_resource_kind_check CHECK ((resource_kind = ANY (ARRAY['line'::text, 'machine'::text, 'labour'::text])))
);

ALTER TABLE ONLY public.capacity_plan_lines FORCE ROW LEVEL SECURITY;


--
-- Name: capacity_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.capacity_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    site_id uuid,
    plan_number text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    horizon_start date DEFAULT CURRENT_DATE NOT NULL,
    horizon_end date NOT NULL,
    bucket_kind text DEFAULT 'day'::text NOT NULL,
    mrp_run_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT capacity_plans_bucket_kind_check CHECK ((bucket_kind = ANY (ARRAY['day'::text, 'week'::text, 'shift'::text]))),
    CONSTRAINT capacity_plans_horizon_range_check CHECK ((horizon_end >= horizon_start)),
    CONSTRAINT capacity_plans_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);

ALTER TABLE ONLY public.capacity_plans FORCE ROW LEVEL SECURITY;


--
-- Name: compliance_docs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_docs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    product_code text NOT NULL,
    doc_type text NOT NULL,
    title text NOT NULL,
    file_path text NOT NULL,
    mime_type text NOT NULL,
    file_size_bytes bigint NOT NULL,
    version_number integer DEFAULT 1 NOT NULL,
    expires_at date,
    uploaded_by_user uuid NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    external_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id uuid,
    schema_version integer DEFAULT 1 NOT NULL,
    expiry_state text DEFAULT 'Valid'::text NOT NULL,
    last_expiry_scan_at timestamp with time zone,
    last_notified_at timestamp with time zone,
    CONSTRAINT compliance_docs_doc_type_check CHECK ((doc_type = ANY (ARRAY['CoA'::text, 'SDS'::text, 'Spec'::text, 'Cert'::text, 'Other'::text]))),
    CONSTRAINT compliance_docs_expiry_state_check CHECK ((expiry_state = ANY (ARRAY['Valid'::text, 'Expiring'::text, 'Expired'::text]))),
    CONSTRAINT compliance_docs_file_path_nonempty_check CHECK ((length(btrim(file_path)) > 0)),
    CONSTRAINT compliance_docs_file_size_bytes_check CHECK (((file_size_bytes > 0) AND (file_size_bytes <= ((20 * 1024) * 1024)))),
    CONSTRAINT compliance_docs_mime_type_check CHECK ((mime_type = ANY (ARRAY['application/pdf'::text, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'::text, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'::text]))),
    CONSTRAINT compliance_docs_title_length_check CHECK (((length(title) >= 3) AND (length(title) <= 300))),
    CONSTRAINT compliance_docs_version_number_check CHECK ((version_number >= 1))
);

ALTER TABLE ONLY public.compliance_docs FORCE ROW LEVEL SECURITY;


--
-- Name: consumed_approval_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consumed_approval_tokens (
    jti uuid NOT NULL,
    org_id uuid NOT NULL,
    consumed_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.consumed_approval_tokens FORCE ROW LEVEL SECURITY;


--
-- Name: costing_breakdowns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.costing_breakdowns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    product_code text NOT NULL,
    scenario text NOT NULL,
    raw_cost_eur numeric NOT NULL,
    margin_pct numeric NOT NULL,
    target_price_eur numeric NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    params jsonb,
    CONSTRAINT costing_breakdowns_margin_pct_check CHECK ((margin_pct >= ('-100'::integer)::numeric)),
    CONSTRAINT costing_breakdowns_scenario_nonempty_check CHECK ((length(btrim(scenario)) > 0))
);

ALTER TABLE ONLY public.costing_breakdowns FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN costing_breakdowns.params; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.costing_breakdowns.params IS 'T-073: exact what-if input parameter set (rawCostEur, yieldPct, processLabourEur, packagingEur, overheadEur, logisticsEur, marginPct, distributorMarkupPct, retailMarkupPct) as decimal strings — never JS floats. Null for legacy rows.';


--
-- Name: costing_waterfall_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.costing_waterfall_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    breakdown_id uuid NOT NULL,
    step_index integer NOT NULL,
    step_name text NOT NULL,
    value_eur numeric NOT NULL,
    delta_pct numeric,
    CONSTRAINT costing_waterfall_steps_step_index_check CHECK (((step_index >= 1) AND (step_index <= 9))),
    CONSTRAINT costing_waterfall_steps_step_name_nonempty_check CHECK ((length(btrim(step_name)) > 0))
);

ALTER TABLE ONLY public.costing_waterfall_steps FORCE ROW LEVEL SECURITY;


--
-- Name: d365_import_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.d365_import_cache (
    org_id uuid NOT NULL,
    code text NOT NULL,
    status text NOT NULL,
    comment text,
    last_synced_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT d365_import_cache_status_check CHECK ((status = ANY (ARRAY['Found'::text, 'NoCost'::text, 'Missing'::text])))
);

ALTER TABLE ONLY public.d365_import_cache FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE d365_import_cache; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.d365_import_cache IS 'T-028 V04 source: per-org D365 material-code validation cache. Status values remain Found, NoCost, or Missing; Empty is a validator result when no cache row exists.';


--
-- Name: d365_import_cache_meta; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.d365_import_cache_meta WITH (security_invoker='true') AS
 SELECT org_id,
    max(last_synced_at) AS last_synced_at,
    count(*) AS row_count
   FROM public.d365_import_cache cache
  GROUP BY org_id;


--
-- Name: VIEW d365_import_cache_meta; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.d365_import_cache_meta IS 'T-090: Per-org last D365 import-cache sync timestamp and cache row count. security_invoker=true preserves d365_import_cache RLS.';


--
-- Name: d365_sync_dlq; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.d365_sync_dlq (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    site_id uuid,
    job_id uuid,
    direction text NOT NULL,
    job_type text NOT NULL,
    target_entity text NOT NULL,
    idempotency_key text,
    record_key text,
    d365_item_id text,
    error_message text NOT NULL,
    error_detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    failed_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'unresolved'::text NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    resolution_note text,
    failed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT d365_sync_dlq_direction_check CHECK ((direction = ANY (ARRAY['pull'::text, 'push'::text]))),
    CONSTRAINT d365_sync_dlq_error_detail_object_check CHECK ((jsonb_typeof(error_detail) = 'object'::text)),
    CONSTRAINT d365_sync_dlq_error_message_not_blank_check CHECK ((length(TRIM(BOTH FROM error_message)) > 0)),
    CONSTRAINT d365_sync_dlq_failed_payload_object_check CHECK ((jsonb_typeof(failed_payload) = 'object'::text)),
    CONSTRAINT d365_sync_dlq_job_type_check CHECK ((job_type = ANY (ARRAY['items'::text, 'bom'::text, 'formula'::text, 'wo_confirmation'::text, 'journal'::text]))),
    CONSTRAINT d365_sync_dlq_retry_count_check CHECK ((retry_count >= 0)),
    CONSTRAINT d365_sync_dlq_status_check CHECK ((status = ANY (ARRAY['unresolved'::text, 'retried'::text, 'resolved'::text, 'skipped'::text])))
);

ALTER TABLE ONLY public.d365_sync_dlq FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE d365_sync_dlq; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.d365_sync_dlq IS 'T-007: D365 sync dead-letter queue (poison messages). error_message NOT NULL (V-TEC-71). job_id soft link (ON DELETE SET NULL). 7-year retention per ADR-008.';


--
-- Name: d365_sync_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.d365_sync_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    site_id uuid,
    direction text NOT NULL,
    job_type text NOT NULL,
    target_entity text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    idempotency_key text NOT NULL,
    record_key text,
    d365_item_id text,
    payload_version integer DEFAULT 1 NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    max_retries integer DEFAULT 3 NOT NULL,
    next_retry_at timestamp with time zone,
    records_processed integer DEFAULT 0 NOT NULL,
    records_failed integer DEFAULT 0 NOT NULL,
    error_message text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    scheduled_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT d365_sync_jobs_direction_check CHECK ((direction = ANY (ARRAY['pull'::text, 'push'::text]))),
    CONSTRAINT d365_sync_jobs_idempotency_key_not_blank_check CHECK ((length(TRIM(BOTH FROM idempotency_key)) > 0)),
    CONSTRAINT d365_sync_jobs_job_type_check CHECK ((job_type = ANY (ARRAY['items'::text, 'bom'::text, 'formula'::text, 'wo_confirmation'::text, 'journal'::text]))),
    CONSTRAINT d365_sync_jobs_max_retries_check CHECK ((max_retries >= 0)),
    CONSTRAINT d365_sync_jobs_payload_object_check CHECK ((jsonb_typeof(payload) = 'object'::text)),
    CONSTRAINT d365_sync_jobs_payload_version_check CHECK ((payload_version >= 1)),
    CONSTRAINT d365_sync_jobs_records_nonnegative_check CHECK (((records_processed >= 0) AND (records_failed >= 0))),
    CONSTRAINT d365_sync_jobs_retry_count_check CHECK ((retry_count >= 0)),
    CONSTRAINT d365_sync_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'dead_lettered'::text])))
);

ALTER TABLE ONLY public.d365_sync_jobs FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE d365_sync_jobs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.d365_sync_jobs IS 'T-007: D365 sync job queue (pull/push). Worker-facing — DISTINCT from d365_sync_runs (mig 065, Settings audit viewer). idempotency_key UNIQUE per org (V-TEC-72/R14). 7-year retention per ADR-008.';


--
-- Name: d365_sync_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.d365_sync_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    direction text NOT NULL,
    entity_type text NOT NULL,
    status text NOT NULL,
    rows_in integer DEFAULT 0 NOT NULL,
    rows_ok integer DEFAULT 0 NOT NULL,
    rows_failed integer DEFAULT 0 NOT NULL,
    error_summary text,
    errors jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT d365_sync_runs_direction_check CHECK ((direction = 'push'::text)),
    CONSTRAINT d365_sync_runs_row_counts_check CHECK (((rows_in >= 0) AND (rows_ok >= 0) AND (rows_failed >= 0))),
    CONSTRAINT d365_sync_runs_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'partial'::text, 'failed'::text])))
);

ALTER TABLE ONLY public.d365_sync_runs FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE d365_sync_runs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.d365_sync_runs IS 'T-112: D365 sync audit runs (SET-083). Producer is the D365 sync engine in another module; read-only viewer in Settings.';


--
-- Name: product; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product (
    product_code text NOT NULL,
    product_name text,
    pack_size text,
    number_of_cases numeric,
    recipe_components text,
    ingredient_codes text,
    template text,
    closed_core text,
    primary_ingredient_pct numeric,
    runs_per_week numeric,
    date_code_per_week text,
    closed_planning text,
    launch_date date,
    department_number text,
    article_number text,
    bar_codes text,
    cases_per_week_w1 numeric,
    cases_per_week_w2 numeric,
    cases_per_week_w3 numeric,
    closed_commercial text,
    process_1 text,
    yield_p1 numeric,
    process_2 text,
    yield_p2 numeric,
    process_3 text,
    yield_p3 numeric,
    process_4 text,
    yield_p4 numeric,
    line text,
    dieset text,
    yield_line numeric,
    staffing text,
    rate numeric,
    pr_code_p1 text,
    pr_code_p2 text,
    pr_code_p3 text,
    pr_code_p4 text,
    pr_code_final text,
    closed_production text,
    shelf_life text,
    closed_technical text,
    box text,
    top_label text,
    bottom_label text,
    web text,
    mrp_box text,
    mrp_labels text,
    mrp_films text,
    mrp_sleeves text,
    mrp_cartons text,
    tara_weight numeric,
    pallet_stacking_plan text,
    box_dimensions text,
    closed_mrp text,
    price numeric,
    lead_time numeric,
    supplier text,
    proc_shelf_life numeric,
    closed_procurement text,
    done_core boolean,
    done_planning boolean,
    done_commercial boolean,
    done_production boolean,
    done_technical boolean,
    done_mrp boolean,
    done_procurement boolean,
    status_overall text,
    days_to_launch integer,
    built boolean DEFAULT false NOT NULL,
    org_id uuid NOT NULL,
    ext_jsonb jsonb DEFAULT '{}'::jsonb NOT NULL,
    private_jsonb jsonb DEFAULT '{}'::jsonb NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    model_prediction_id uuid,
    epcis_event_id uuid,
    external_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid NOT NULL,
    created_by_device text,
    app_version text,
    allergens text[] DEFAULT '{}'::text[] NOT NULL,
    may_contain text[] DEFAULT '{}'::text[] NOT NULL,
    deleted_at timestamp with time zone
);

ALTER TABLE ONLY public.product FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN product.allergens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product.allergens IS 'T-038: DERIVED published allergen set (confirmed RM ∪ confirmed process, override-adjusted). Materialized by public.update_fa_allergen_set — never user-authored.';


--
-- Name: COLUMN product.may_contain; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product.may_contain IS 'T-038: DERIVED precautionary allergen set (RM may_contain/trace ∪ conditional process), minus confirmed allergens. Materialized by public.update_fa_allergen_set — never user-authored.';


--
-- Name: fa; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.fa WITH (security_invoker='true') AS
 SELECT product_code,
    product_name,
    pack_size,
    number_of_cases,
    recipe_components,
    ingredient_codes,
    template,
    closed_core,
    primary_ingredient_pct,
    runs_per_week,
    date_code_per_week,
    closed_planning,
    launch_date,
    department_number,
    article_number,
    bar_codes,
    cases_per_week_w1,
    cases_per_week_w2,
    cases_per_week_w3,
    closed_commercial,
    process_1,
    yield_p1,
    process_2,
    yield_p2,
    process_3,
    yield_p3,
    process_4,
    yield_p4,
    line,
    dieset,
    yield_line,
    staffing,
    rate,
    pr_code_p1,
    pr_code_p2,
    pr_code_p3,
    pr_code_p4,
    pr_code_final,
    closed_production,
    shelf_life,
    closed_technical,
    box,
    top_label,
    bottom_label,
    web,
    mrp_box,
    mrp_labels,
    mrp_films,
    mrp_sleeves,
    mrp_cartons,
    tara_weight,
    pallet_stacking_plan,
    box_dimensions,
    closed_mrp,
    price,
    lead_time,
    supplier,
    proc_shelf_life,
    closed_procurement,
    done_core,
    done_planning,
    done_commercial,
    done_production,
    done_technical,
    done_mrp,
    done_procurement,
    status_overall,
    days_to_launch,
    built,
    org_id,
    ext_jsonb,
    private_jsonb,
    schema_version,
    model_prediction_id,
    epcis_event_id,
    external_id,
    created_at,
    created_by_user,
    created_by_device,
    app_version,
    allergens,
    may_contain,
    deleted_at
   FROM public.product
  WHERE (deleted_at IS NULL);


--
-- Name: dashboard_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.dashboard_summary WITH (security_invoker='true') AS
 SELECT org_id,
    count(*) FILTER (WHERE (product_code IS NOT NULL)) AS total_active,
    count(*) FILTER (WHERE (status_overall = 'Complete'::text)) AS fully_complete,
    count(*) FILTER (WHERE (status_overall = ANY (ARRAY['InProgress'::text, 'Pending'::text, 'Alert'::text]))) AS pending,
    count(*) FILTER (WHERE (built = true)) AS total_built
   FROM public.fa
  GROUP BY org_id;


--
-- Name: dept_column_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dept_column_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    dept_id uuid NOT NULL,
    column_key text NOT NULL,
    field_type text NOT NULL,
    validation_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    presentation_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dept_column_drafts_field_type_check CHECK ((field_type = ANY (ARRAY['string'::text, 'number'::text, 'date'::text, 'enum'::text, 'formula'::text, 'relation'::text]))),
    CONSTRAINT dept_column_drafts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])))
);

ALTER TABLE ONLY public.dept_column_drafts FORCE ROW LEVEL SECURITY;


--
-- Name: dept_column_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dept_column_migrations (
    id bigint NOT NULL,
    org_id uuid NOT NULL,
    dept_column_id uuid NOT NULL,
    prev_version integer NOT NULL,
    new_version integer NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.dept_column_migrations FORCE ROW LEVEL SECURITY;


--
-- Name: dept_column_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dept_column_migrations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dept_column_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dept_column_migrations_id_seq OWNED BY public.dept_column_migrations.id;


--
-- Name: e_sign_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.e_sign_log (
    signature_id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    signer_user_id uuid NOT NULL,
    intent text NOT NULL,
    subject_hash text NOT NULL,
    nonce text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.e_sign_log FORCE ROW LEVEL SECURITY;


--
-- Name: email_delivery_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_delivery_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    trigger_code text NOT NULL,
    recipient_email text NOT NULL,
    subject text,
    status text DEFAULT 'queued'::text NOT NULL,
    retry_status text DEFAULT 'not_retried'::text NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    provider_message_id text,
    last_error_summary text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_delivery_log_retry_count_check CHECK ((retry_count >= 0)),
    CONSTRAINT email_delivery_log_retry_status_check CHECK ((retry_status = ANY (ARRAY['not_retried'::text, 'retry_scheduled'::text, 'retry_exhausted'::text, 'dlq'::text]))),
    CONSTRAINT email_delivery_log_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sent'::text, 'failed'::text, 'dlq'::text])))
);

ALTER TABLE ONLY public.email_delivery_log FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE email_delivery_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.email_delivery_log IS 'T-113: per-org email delivery log (SET-093). Producer is the email outbox/DLQ worker; read-only viewer in Settings.';


--
-- Name: fa_allergen_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fa_allergen_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    product_code text NOT NULL,
    allergen_code text NOT NULL,
    action public.fa_allergen_override_action NOT NULL,
    reason text NOT NULL,
    actor_user_id uuid NOT NULL,
    actor_role text NOT NULL,
    supersedes_id uuid,
    superseded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT fa_allergen_overrides_actor_role_nonempty_check CHECK ((length(TRIM(BOTH FROM actor_role)) > 0)),
    CONSTRAINT fa_allergen_overrides_reason_length_check CHECK ((length(reason) >= 10)),
    CONSTRAINT fa_allergen_overrides_schema_version_check CHECK ((schema_version >= 1))
);

ALTER TABLE ONLY public.fa_allergen_overrides FORCE ROW LEVEL SECURITY;


--
-- Name: prod_detail; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prod_detail (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_code text NOT NULL,
    org_id uuid NOT NULL,
    intermediate_code text NOT NULL,
    component_index integer NOT NULL,
    manufacturing_operation_1 text,
    manufacturing_operation_2 text,
    manufacturing_operation_3 text,
    manufacturing_operation_4 text,
    operation_yield_1 numeric,
    operation_yield_2 numeric,
    operation_yield_3 numeric,
    operation_yield_4 numeric,
    line text,
    equipment_setup text,
    yield_line numeric,
    resource_requirement text,
    rate numeric,
    intermediate_code_p1 text,
    intermediate_code_p2 text,
    intermediate_code_p3 text,
    intermediate_code_p4 text,
    intermediate_code_final text,
    slice_count integer,
    component_weight numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    item_id uuid
);

ALTER TABLE ONLY public.prod_detail FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE prod_detail; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.prod_detail IS 'T-002: per-component production detail rows for product manufacturing data.';


--
-- Name: COLUMN prod_detail.item_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.prod_detail.item_id IS 'Lane-B: optional FK to the real items master row this component represents (intermediate_code stays the display code).';


--
-- Name: fa_allergen_cascade; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.fa_allergen_cascade WITH (security_invoker='true') AS
 WITH rm_confirmed AS (
         SELECT p_1.product_code,
            p_1.org_id,
            rm.allergen_code
           FROM ((public.product p_1
             CROSS JOIN LATERAL regexp_split_to_table(COALESCE(p_1.ingredient_codes, ''::text), '\s*,\s*'::text) parsed(ingredient_code))
             JOIN "Reference"."Allergens_by_RM" rm ON (((rm.org_id = p_1.org_id) AND (rm.ingredient_codes = btrim(parsed.ingredient_code)) AND (rm.confidence = 'confirmed'::text))))
          WHERE (btrim(parsed.ingredient_code) <> ''::text)
        ), rm_may_contain AS (
         SELECT p_1.product_code,
            p_1.org_id,
            rm.allergen_code
           FROM ((public.product p_1
             CROSS JOIN LATERAL regexp_split_to_table(COALESCE(p_1.ingredient_codes, ''::text), '\s*,\s*'::text) parsed(ingredient_code))
             JOIN "Reference"."Allergens_by_RM" rm ON (((rm.org_id = p_1.org_id) AND (rm.ingredient_codes = btrim(parsed.ingredient_code)) AND (rm.confidence = ANY (ARRAY['may_contain'::text, 'trace'::text])))))
          WHERE (btrim(parsed.ingredient_code) <> ''::text)
        ), process_confirmed AS (
         SELECT DISTINCT pd.product_code,
            pd.org_id,
            ap.allergen_code
           FROM ((public.prod_detail pd
             CROSS JOIN LATERAL ( VALUES (pd.manufacturing_operation_1), (pd.manufacturing_operation_2), (pd.manufacturing_operation_3), (pd.manufacturing_operation_4)) ops(process_name))
             JOIN "Reference"."Allergens_added_by_Process" ap ON (((ap.org_id = pd.org_id) AND (ap.process_name = ops.process_name) AND (ap.confidence = 'confirmed'::text))))
          WHERE (ops.process_name IS NOT NULL)
        ), process_conditional AS (
         SELECT DISTINCT pd.product_code,
            pd.org_id,
            ap.allergen_code
           FROM ((public.prod_detail pd
             CROSS JOIN LATERAL ( VALUES (pd.manufacturing_operation_1), (pd.manufacturing_operation_2), (pd.manufacturing_operation_3), (pd.manufacturing_operation_4)) ops(process_name))
             JOIN "Reference"."Allergens_added_by_Process" ap ON (((ap.org_id = pd.org_id) AND (ap.process_name = ops.process_name) AND (ap.confidence = 'conditional'::text))))
          WHERE (ops.process_name IS NOT NULL)
        ), confirmed AS (
         SELECT rm_confirmed.product_code,
            rm_confirmed.org_id,
            rm_confirmed.allergen_code
           FROM rm_confirmed
        UNION
         SELECT process_confirmed.product_code,
            process_confirmed.org_id,
            process_confirmed.allergen_code
           FROM process_confirmed
        ), current_overrides AS (
         SELECT DISTINCT ON (o.org_id, o.product_code, o.allergen_code) o.product_code,
            o.org_id,
            o.allergen_code,
            o.action
           FROM public.fa_allergen_overrides o
          WHERE (o.superseded_at IS NULL)
          ORDER BY o.org_id, o.product_code, o.allergen_code, o.created_at DESC, o.id DESC
        ), published_candidates AS (
         SELECT confirmed.product_code,
            confirmed.org_id,
            confirmed.allergen_code
           FROM confirmed
        UNION
         SELECT current_overrides.product_code,
            current_overrides.org_id,
            current_overrides.allergen_code
           FROM current_overrides
          WHERE (current_overrides.action = 'add'::public.fa_allergen_override_action)
        ), published AS (
         SELECT pc.product_code,
            pc.org_id,
            pc.allergen_code
           FROM published_candidates pc
          WHERE (NOT (EXISTS ( SELECT 1
                   FROM current_overrides co
                  WHERE ((co.org_id = pc.org_id) AND (co.product_code = pc.product_code) AND (co.allergen_code = pc.allergen_code) AND (co.action = 'remove'::public.fa_allergen_override_action)))))
        ), may_contain_raw AS (
         SELECT rm_may_contain.product_code,
            rm_may_contain.org_id,
            rm_may_contain.allergen_code
           FROM rm_may_contain
        UNION
         SELECT process_conditional.product_code,
            process_conditional.org_id,
            process_conditional.allergen_code
           FROM process_conditional
        )
 SELECT product_code,
    org_id,
    COALESCE(( SELECT array_agg(DISTINCT c.allergen_code ORDER BY c.allergen_code) AS array_agg
           FROM confirmed c
          WHERE ((c.product_code = p.product_code) AND (c.org_id = p.org_id))), '{}'::text[]) AS derived_allergens,
    COALESCE(( SELECT array_agg(DISTINCT pub.allergen_code ORDER BY pub.allergen_code) AS array_agg
           FROM published pub
          WHERE ((pub.product_code = p.product_code) AND (pub.org_id = p.org_id))), '{}'::text[]) AS published_allergens,
    COALESCE(( SELECT array_agg(DISTINCT mc.allergen_code ORDER BY mc.allergen_code) AS array_agg
           FROM may_contain_raw mc
          WHERE ((mc.product_code = p.product_code) AND (mc.org_id = p.org_id) AND (NOT (EXISTS ( SELECT 1
                   FROM published pub2
                  WHERE ((pub2.org_id = mc.org_id) AND (pub2.product_code = mc.product_code) AND (pub2.allergen_code = mc.allergen_code))))))), '{}'::text[]) AS may_contain_allergens,
    COALESCE(( SELECT array_agg(DISTINCT cp.allergen_code ORDER BY cp.allergen_code) AS array_agg
           FROM process_conditional cp
          WHERE ((cp.product_code = p.product_code) AND (cp.org_id = p.org_id))), '{}'::text[]) AS conditional_process_allergens
   FROM public.product p;


--
-- Name: VIEW fa_allergen_cascade; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.fa_allergen_cascade IS 'T-038: derived allergen cascade read-model per FG. derived_allergens = union(confirmed RM, confirmed process); published_allergens applies current fa_allergen_overrides additively (add/remove) without mutating the derived source; may_contain_allergens = union(RM may_contain/trace, conditional process) minus confirmed; conditional_process_allergens surfaced separately (recipe_condition NOT evaluated → never silently published). security_invoker=true; org-scoped via underlying RLS (app.current_org_id()).';


--
-- Name: fa_bom_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.fa_bom_view WITH (security_invoker='true') AS
 SELECT bom.bom_header_id,
    bom.product_code,
    bom.status,
    bom.version,
    bom.line_no,
    bom.component_type,
    bom.component_code,
    bom.quantity,
    COALESCE(NULLIF(bom.manufacturing_operation_name, ''::text), ''::text) AS process_stage,
    COALESCE(NULLIF(bom.source, ''::text), ''::text) AS source,
    COALESCE(NULLIF(d365.status, ''::text), 'Empty'::text) AS d365_status
   FROM ((public.fa fa_row
     CROSS JOIN LATERAL public.get_fa_bom(fa_row.product_code) bom(bom_header_id, product_code, status, version, line_no, component_code, component_type, quantity, uom, manufacturing_operation_name, source))
     LEFT JOIN public.d365_import_cache d365 ON (((d365.org_id = app.current_org_id()) AND (d365.code = bom.component_code))))
  WHERE ((fa_row.org_id = app.current_org_id()) AND (fa_row.built = false));


--
-- Name: VIEW fa_bom_view; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.fa_bom_view IS 'T-045 / T-092: DEPRECATED/preview-only legacy NPD FA BOM compatibility view (computed via get_fa_bom). Not canonical; the shared BOM SSOT is public.bom_headers/public.bom_lines. Surfaces D365 status badges only; D365 is integration only, never source of truth.';


--
-- Name: fa_builder_outputs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fa_builder_outputs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    product_code text NOT NULL,
    file_path text NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    generated_by_user uuid NOT NULL,
    app_version text,
    superseded_at timestamp with time zone,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT fa_builder_outputs_file_path_nonempty_check CHECK ((length(TRIM(BOTH FROM file_path)) > 0)),
    CONSTRAINT fa_builder_outputs_schema_version_check CHECK ((schema_version >= 1)),
    CONSTRAINT fa_builder_outputs_superseded_after_generated_check CHECK (((superseded_at IS NULL) OR (superseded_at >= generated_at)))
);

ALTER TABLE ONLY public.fa_builder_outputs FORCE ROW LEVEL SECURITY;


--
-- Name: fa_status_overall; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.fa_status_overall WITH (security_invoker='true') AS
 WITH computed AS (
         SELECT p.product_code,
            p.org_id,
            p.built,
            (p.launch_date - CURRENT_DATE) AS days_to_launch,
            (COALESCE(p.closed_core, ''::text) = 'Yes'::text) AS closed_core_yes,
            (COALESCE(p.closed_planning, ''::text) = 'Yes'::text) AS closed_planning_yes,
            (COALESCE(p.closed_commercial, ''::text) = 'Yes'::text) AS closed_commercial_yes,
            (COALESCE(p.closed_production, ''::text) = 'Yes'::text) AS closed_production_yes,
            (COALESCE(p.closed_technical, ''::text) = 'Yes'::text) AS closed_technical_yes,
            (COALESCE(p.closed_mrp, ''::text) = 'Yes'::text) AS closed_mrp_yes,
            (COALESCE(p.closed_procurement, ''::text) = 'Yes'::text) AS closed_procurement_yes,
            public.is_all_required_filled(p.product_code, 'Core'::text) AS all_core_required,
            public.is_all_required_filled(p.product_code, 'Planning'::text) AS all_planning_required,
            public.is_all_required_filled(p.product_code, 'Commercial'::text) AS all_commercial_required,
            public.is_all_required_filled(p.product_code, 'Production'::text) AS all_production_required,
            public.is_all_required_filled(p.product_code, 'Technical'::text) AS all_technical_required,
            public.is_all_required_filled(p.product_code, 'MRP'::text) AS all_mrp_required,
            public.is_all_required_filled(p.product_code, 'Procurement'::text) AS all_procurement_required
           FROM public.product p
        ), done AS (
         SELECT computed.product_code,
            computed.org_id,
            computed.built,
            computed.days_to_launch,
            computed.closed_core_yes,
            computed.closed_planning_yes,
            computed.closed_commercial_yes,
            computed.closed_production_yes,
            computed.closed_technical_yes,
            computed.closed_mrp_yes,
            computed.closed_procurement_yes,
            computed.all_core_required,
            computed.all_planning_required,
            computed.all_commercial_required,
            computed.all_production_required,
            computed.all_technical_required,
            computed.all_mrp_required,
            computed.all_procurement_required,
            (computed.all_core_required AND computed.closed_core_yes) AS done_core,
            (computed.all_planning_required AND computed.closed_planning_yes) AS done_planning,
            (computed.all_commercial_required AND computed.closed_commercial_yes) AS done_commercial,
            (computed.all_production_required AND computed.closed_production_yes) AS done_production,
            (computed.all_technical_required AND computed.closed_technical_yes) AS done_technical,
            (computed.all_mrp_required AND computed.closed_mrp_yes) AS done_mrp,
            (computed.all_procurement_required AND computed.closed_procurement_yes) AS done_procurement
           FROM computed
        )
 SELECT product_code,
    org_id,
    done_core,
    done_planning,
    done_commercial,
    done_production,
    done_technical,
    done_mrp,
    done_procurement,
        CASE
            WHEN (built = true) THEN 'Built'::text
            WHEN (done_core AND done_planning AND done_commercial AND done_production AND done_technical AND done_mrp AND done_procurement) THEN 'Complete'::text
            WHEN ((days_to_launch <= 10) AND (NOT (all_core_required AND all_planning_required AND all_commercial_required AND all_production_required AND all_technical_required AND all_mrp_required AND all_procurement_required))) THEN 'Alert'::text
            WHEN (closed_core_yes OR closed_planning_yes OR closed_commercial_yes OR closed_production_yes OR closed_technical_yes OR closed_mrp_yes OR closed_procurement_yes) THEN 'InProgress'::text
            ELSE 'Pending'::text
        END AS status_overall,
    days_to_launch
   FROM done;


--
-- Name: factory_release_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.factory_release_status (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    product_code text NOT NULL,
    release_status text DEFAULT 'pending_npd_release'::text NOT NULL,
    factory_available_at timestamp with time zone,
    factory_approved_by uuid,
    release_event_id bigint,
    active_bom_header_id uuid,
    active_factory_spec_id uuid,
    release_blockers jsonb DEFAULT '[]'::jsonb NOT NULL,
    requested_by uuid,
    requested_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT factory_release_status_blocked_has_blockers_check CHECK (((release_status <> 'blocked'::text) OR (jsonb_array_length(release_blockers) > 0))),
    CONSTRAINT factory_release_status_blockers_array_check CHECK ((jsonb_typeof(release_blockers) = 'array'::text)),
    CONSTRAINT factory_release_status_factory_usable_evidence_check CHECK (((release_status <> ALL (ARRAY['approved_for_factory'::text, 'released_to_factory'::text])) OR ((active_bom_header_id IS NOT NULL) AND (active_factory_spec_id IS NOT NULL) AND (factory_available_at IS NOT NULL) AND (factory_approved_by IS NOT NULL) AND (release_event_id IS NOT NULL) AND (jsonb_array_length(release_blockers) = 0)))),
    CONSTRAINT factory_release_status_pending_technical_check CHECK (((release_status <> 'pending_technical_approval'::text) OR ((active_bom_header_id IS NOT NULL) AND (active_factory_spec_id IS NOT NULL) AND (factory_available_at IS NULL)))),
    CONSTRAINT factory_release_status_release_status_check CHECK ((release_status = ANY (ARRAY['pending_npd_release'::text, 'pending_technical_approval'::text, 'approved_for_factory'::text, 'released_to_factory'::text, 'blocked'::text]))),
    CONSTRAINT factory_release_status_schema_version_check CHECK ((schema_version >= 1))
);

ALTER TABLE ONLY public.factory_release_status FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE factory_release_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.factory_release_status IS 'T-097 canonical factory release read model. Factory/Planning may treat only approved_for_factory or released_to_factory as usable. D365 export and Built are not release state.';


--
-- Name: COLUMN factory_release_status.active_factory_spec_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.factory_release_status.active_factory_spec_id IS 'Technical-owned factory_specs id. No FK here until 03-TECHNICAL owns/provisions factory_specs; T-097 must not create that table.';


--
-- Name: factory_specs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.factory_specs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    site_id uuid,
    fg_item_id uuid NOT NULL,
    spec_code text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    source text DEFAULT 'technical'::text NOT NULL,
    bom_header_id uuid,
    bom_version integer,
    supersedes_factory_spec_id uuid,
    approved_by uuid,
    approved_at timestamp with time zone,
    released_by uuid,
    released_at timestamp with time zone,
    notes text,
    d365_item_id text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT factory_specs_approved_requires_evidence_check CHECK (((status <> ALL (ARRAY['approved_for_factory'::text, 'released_to_factory'::text])) OR ((approved_by IS NOT NULL) AND (approved_at IS NOT NULL)))),
    CONSTRAINT factory_specs_bom_version_check CHECK (((bom_version IS NULL) OR (bom_version > 0))),
    CONSTRAINT factory_specs_d365_import_status_check CHECK (((source <> 'd365_import'::text) OR (status = ANY (ARRAY['draft'::text, 'in_review'::text])))),
    CONSTRAINT factory_specs_npd_builder_draft_check CHECK (((source <> 'npd_builder'::text) OR ((status = 'draft'::text) AND (approved_by IS NULL) AND (approved_at IS NULL) AND (released_by IS NULL) AND (released_at IS NULL)))),
    CONSTRAINT factory_specs_released_requires_evidence_check CHECK (((status <> 'released_to_factory'::text) OR ((released_by IS NOT NULL) AND (released_at IS NOT NULL)))),
    CONSTRAINT factory_specs_schema_version_check CHECK ((schema_version >= 1)),
    CONSTRAINT factory_specs_source_check CHECK ((source = ANY (ARRAY['technical'::text, 'npd_builder'::text, 'd365_import'::text]))),
    CONSTRAINT factory_specs_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'in_review'::text, 'approved_for_factory'::text, 'released_to_factory'::text, 'superseded'::text, 'archived'::text]))),
    CONSTRAINT factory_specs_version_positive_check CHECK ((version > 0))
);

ALTER TABLE ONLY public.factory_specs FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE factory_specs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.factory_specs IS 'Technical-owned, versioned canonical production spec (factory_spec / internal_product_spec) per FG. Clone-on-write: approved/released versions are immutable. Approval emits technical.factory_spec.approved (wired in T-080/T-081).';


--
-- Name: COLUMN factory_specs.site_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.factory_specs.site_id IS 'site_id day-1 soft column: nullable uuid, no FK / no registry (REC-L1 style).';


--
-- Name: COLUMN factory_specs.bom_header_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.factory_specs.bom_header_id IS 'Soft (nullable) composite FK to the shared BOM SSOT header (bom_headers). The bundle approval is T-080.';


--
-- Name: COLUMN factory_specs.d365_item_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.factory_specs.d365_item_id IS 'D365 soft TEXT reference only; D365 is never authoritative for approved specs (no FK).';


--
-- Name: feature_flags_core; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feature_flags_core (
    org_id uuid NOT NULL,
    flag_code text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    rolled_out_pct integer DEFAULT 0 NOT NULL,
    tier text DEFAULT 'L1'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT feature_flags_core_rolled_out_pct_check CHECK (((rolled_out_pct >= 0) AND (rolled_out_pct <= 100))),
    CONSTRAINT feature_flags_core_tier_check CHECK ((tier = ANY (ARRAY['L1'::text, 'L2'::text, 'L3'::text, 'L4'::text])))
);

ALTER TABLE ONLY public.feature_flags_core FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE feature_flags_core; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.feature_flags_core IS 'T-013: §10.2 built-in feature-flag fallback (per-org). PostHog non-core flags are NOT mirrored here.';


--
-- Name: formulation_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.formulation_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    formulation_id uuid,
    version_id uuid,
    event_type text NOT NULL,
    event_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    actor_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT formulation_audit_log_event_type_nonempty_check CHECK ((length(btrim(event_type)) > 0))
);

ALTER TABLE ONLY public.formulation_audit_log FORCE ROW LEVEL SECURITY;


--
-- Name: formulation_calc_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.formulation_calc_cache (
    version_id uuid NOT NULL,
    cost_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    nutrition_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    allergen_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL
);

ALTER TABLE ONLY public.formulation_calc_cache FORCE ROW LEVEL SECURITY;


--
-- Name: formulation_ingredients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.formulation_ingredients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version_id uuid NOT NULL,
    rm_code text NOT NULL,
    qty_kg numeric,
    pct numeric,
    cost_per_kg_eur numeric,
    allergens_inherited text[] DEFAULT '{}'::text[] NOT NULL,
    sequence integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    item_id uuid,
    CONSTRAINT formulation_ingredients_cost_per_kg_eur_check CHECK (((cost_per_kg_eur IS NULL) OR (cost_per_kg_eur >= (0)::numeric))),
    CONSTRAINT formulation_ingredients_pct_check CHECK (((pct IS NULL) OR ((pct >= (0)::numeric) AND (pct <= (100)::numeric)))),
    CONSTRAINT formulation_ingredients_qty_kg_check CHECK (((qty_kg IS NULL) OR (qty_kg >= (0)::numeric))),
    CONSTRAINT formulation_ingredients_rm_code_nonempty_check CHECK ((length(btrim(rm_code)) > 0)),
    CONSTRAINT formulation_ingredients_sequence_check CHECK ((sequence > 0))
);

ALTER TABLE ONLY public.formulation_ingredients FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN formulation_ingredients.item_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.formulation_ingredients.item_id IS 'Lane-B: optional FK to the real items master row this ingredient represents (rm_code stays the display code).';


--
-- Name: formulation_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.formulation_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    formulation_id uuid NOT NULL,
    version_number integer NOT NULL,
    state text NOT NULL,
    batch_size_kg numeric,
    target_yield_pct numeric,
    target_price_eur numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT formulation_versions_batch_size_kg_check CHECK (((batch_size_kg IS NULL) OR (batch_size_kg > (0)::numeric))),
    CONSTRAINT formulation_versions_state_check CHECK ((state = ANY (ARRAY['draft'::text, 'submitted_for_trial'::text, 'locked'::text]))),
    CONSTRAINT formulation_versions_target_price_eur_check CHECK (((target_price_eur IS NULL) OR (target_price_eur >= (0)::numeric))),
    CONSTRAINT formulation_versions_target_yield_pct_check CHECK (((target_yield_pct IS NULL) OR ((target_yield_pct >= (0)::numeric) AND (target_yield_pct <= (100)::numeric)))),
    CONSTRAINT formulation_versions_version_number_check CHECK ((version_number > 0))
);

ALTER TABLE ONLY public.formulation_versions FORCE ROW LEVEL SECURITY;


--
-- Name: formulations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.formulations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    product_code text,
    current_version_id uuid,
    locked_at timestamp with time zone,
    locked_by_user uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    schema_version integer DEFAULT 1 NOT NULL
);

ALTER TABLE ONLY public.formulations FORCE ROW LEVEL SECURITY;


--
-- Name: gate_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gate_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid,
    gate_code text NOT NULL,
    decision text NOT NULL,
    approver_user_id uuid NOT NULL,
    notes text,
    rejection_reason text,
    esigned_at timestamp with time zone,
    esign_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT gate_approvals_decision_check CHECK ((decision = ANY (ARRAY['approved'::text, 'rejected'::text]))),
    CONSTRAINT gate_approvals_gate_code_check CHECK ((gate_code = ANY (ARRAY['G0'::text, 'G1'::text, 'G2'::text, 'G3'::text, 'G4'::text])))
);

ALTER TABLE ONLY public.gate_approvals FORCE ROW LEVEL SECURITY;


--
-- Name: gate_checklist_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gate_checklist_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    gate_code text NOT NULL,
    category_code text NOT NULL,
    item_text text NOT NULL,
    required boolean DEFAULT false NOT NULL,
    completed_at timestamp with time zone,
    completed_by_user uuid,
    evidence_file text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT gate_checklist_items_category_code_check CHECK ((category_code = ANY (ARRAY['technical'::text, 'business'::text, 'compliance'::text]))),
    CONSTRAINT gate_checklist_items_gate_code_check CHECK ((gate_code = ANY (ARRAY['G0'::text, 'G1'::text, 'G2'::text, 'G3'::text, 'G4'::text])))
);

ALTER TABLE ONLY public.gate_checklist_items FORCE ROW LEVEL SECURITY;


--
-- Name: gdpr_erasure_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gdpr_erasure_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    subject_id text NOT NULL,
    requested_by uuid NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    started_at timestamp with time zone,
    processed_at timestamp with time zone,
    domains_run text[] DEFAULT '{}'::text[] NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gdpr_erasure_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'done'::text, 'failed'::text])))
);

ALTER TABLE ONLY public.gdpr_erasure_requests FORCE ROW LEVEL SECURITY;


--
-- Name: idempotency_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.idempotency_keys (
    transaction_id uuid NOT NULL,
    org_id uuid NOT NULL,
    request_hash text NOT NULL,
    response_json jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone
);

ALTER TABLE ONLY public.idempotency_keys FORCE ROW LEVEL SECURITY;


--
-- Name: integration_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    category text NOT NULL,
    provider text,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.integration_settings FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE integration_settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.integration_settings IS 'W7/T-090: per-org integration provider config (email/etc). One active row per (org, category).';


--
-- Name: iso4217; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.iso4217 (
    code character(3) NOT NULL,
    currency_name text NOT NULL,
    num character(3) NOT NULL,
    minor_unit integer DEFAULT 2 NOT NULL,
    CONSTRAINT iso4217_code_format_check CHECK ((code ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT iso4217_minor_unit_check CHECK (((minor_unit >= 0) AND (minor_unit <= 4))),
    CONSTRAINT iso4217_num_format_check CHECK ((num ~ '^[0-9]{3}$'::text))
);


--
-- Name: TABLE iso4217; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.iso4217 IS 'T-070: Global ISO-4217 currency reference (code / name / numeric / minor unit). Un-scoped shared lookup (no org_id, no RLS). Backs V-TEC-52 currency validation.';


--
-- Name: item_allergen_profile_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_allergen_profile_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    item_id uuid NOT NULL,
    allergen_code text NOT NULL,
    action text NOT NULL,
    intensity text,
    confidence text,
    reason text NOT NULL,
    overridden_by uuid,
    overridden_at timestamp with time zone DEFAULT now() NOT NULL,
    site_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT item_allergen_profile_overrides_action_check CHECK ((action = ANY (ARRAY['set'::text, 'clear'::text, 'adjust_intensity'::text, 'adjust_confidence'::text]))),
    CONSTRAINT item_allergen_profile_overrides_allergen_code_nonblank_check CHECK ((length(btrim(allergen_code)) > 0)),
    CONSTRAINT item_allergen_profile_overrides_confidence_check CHECK (((confidence IS NULL) OR (confidence = ANY (ARRAY['declared'::text, 'tested'::text, 'assumed'::text])))),
    CONSTRAINT item_allergen_profile_overrides_intensity_check CHECK (((intensity IS NULL) OR (intensity = ANY (ARRAY['contains'::text, 'may_contain'::text, 'trace'::text])))),
    CONSTRAINT item_allergen_profile_overrides_reason_nonblank_check CHECK ((length(btrim(reason)) > 0))
);

ALTER TABLE ONLY public.item_allergen_profile_overrides FORCE ROW LEVEL SECURITY;


--
-- Name: item_allergen_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_allergen_profiles (
    org_id uuid NOT NULL,
    item_id uuid NOT NULL,
    allergen_code text NOT NULL,
    source text NOT NULL,
    intensity text DEFAULT 'contains'::text NOT NULL,
    confidence text DEFAULT 'declared'::text NOT NULL,
    site_id uuid,
    declared_by uuid,
    declared_at timestamp with time zone DEFAULT now() NOT NULL,
    manual_override_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT item_allergen_profiles_allergen_code_nonblank_check CHECK ((length(btrim(allergen_code)) > 0)),
    CONSTRAINT item_allergen_profiles_confidence_check CHECK ((confidence = ANY (ARRAY['declared'::text, 'tested'::text, 'assumed'::text]))),
    CONSTRAINT item_allergen_profiles_intensity_check CHECK ((intensity = ANY (ARRAY['contains'::text, 'may_contain'::text, 'trace'::text]))),
    CONSTRAINT item_allergen_profiles_override_reason_check CHECK (((source <> 'manual_override'::text) OR ((manual_override_reason IS NOT NULL) AND (length(btrim(manual_override_reason)) > 0)))),
    CONSTRAINT item_allergen_profiles_source_check CHECK ((source = ANY (ARRAY['brief_declared'::text, 'supplier_spec'::text, 'lab_result'::text, 'cascaded'::text, 'manual_override'::text])))
);

ALTER TABLE ONLY public.item_allergen_profiles FORCE ROW LEVEL SECURITY;


--
-- Name: item_cost_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_cost_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    site_id uuid,
    item_id uuid NOT NULL,
    cost_per_kg numeric(10,4) NOT NULL,
    currency character(3) DEFAULT 'PLN'::bpchar NOT NULL,
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    effective_to date,
    source text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT item_cost_history_cost_per_kg_nonnegative_check CHECK ((cost_per_kg >= (0)::numeric)),
    CONSTRAINT item_cost_history_effective_range_check CHECK (((effective_to IS NULL) OR (effective_to >= effective_from))),
    CONSTRAINT item_cost_history_source_check CHECK (((source IS NULL) OR (source = ANY (ARRAY['manual'::text, 'd365_sync'::text, 'supplier_update'::text, 'variance_roll'::text]))))
);

ALTER TABLE ONLY public.item_cost_history FORCE ROW LEVEL SECURITY;


--
-- Name: items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    item_code text NOT NULL,
    item_type text NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'active'::text NOT NULL,
    product_group text,
    uom_base text NOT NULL,
    uom_secondary text,
    gs1_gtin text,
    weight_mode text DEFAULT 'fixed'::text NOT NULL,
    nominal_weight numeric(10,4),
    tare_weight numeric(10,4),
    gross_weight_max numeric(10,4),
    variance_tolerance_pct numeric(5,2) DEFAULT 5.00,
    shelf_life_days integer,
    shelf_life_mode text DEFAULT 'use_by'::text,
    date_code_format text,
    cost_per_kg numeric(18,6),
    d365_item_id text,
    d365_last_sync_at timestamp with time zone,
    d365_sync_status text DEFAULT 'unsynced'::text,
    ext_jsonb jsonb DEFAULT '{}'::jsonb NOT NULL,
    private_jsonb jsonb DEFAULT '{}'::jsonb NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT items_cost_per_kg_nonnegative_check CHECK (((cost_per_kg IS NULL) OR (cost_per_kg >= (0)::numeric))),
    CONSTRAINT items_d365_sync_status_check CHECK (((d365_sync_status IS NULL) OR (d365_sync_status = ANY (ARRAY['unsynced'::text, 'synced'::text, 'drift'::text, 'error'::text])))),
    CONSTRAINT items_ext_jsonb_object_check CHECK ((jsonb_typeof(ext_jsonb) = 'object'::text)),
    CONSTRAINT items_item_type_check CHECK ((item_type = ANY (ARRAY['rm'::text, 'intermediate'::text, 'fg'::text, 'co_product'::text, 'byproduct'::text]))),
    CONSTRAINT items_private_jsonb_object_check CHECK ((jsonb_typeof(private_jsonb) = 'object'::text)),
    CONSTRAINT items_schema_version_check CHECK ((schema_version >= 1)),
    CONSTRAINT items_shelf_life_days_check CHECK (((shelf_life_days IS NULL) OR (shelf_life_days >= 0))),
    CONSTRAINT items_shelf_life_mode_check CHECK (((shelf_life_mode IS NULL) OR (shelf_life_mode = ANY (ARRAY['use_by'::text, 'best_before'::text])))),
    CONSTRAINT items_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'deprecated'::text, 'blocked'::text]))),
    CONSTRAINT items_variance_tolerance_pct_check CHECK (((variance_tolerance_pct IS NULL) OR ((variance_tolerance_pct >= (0)::numeric) AND (variance_tolerance_pct <= (100)::numeric)))),
    CONSTRAINT items_weight_mode_check CHECK ((weight_mode = ANY (ARRAY['fixed'::text, 'catch'::text]))),
    CONSTRAINT items_weights_nonnegative_check CHECK ((((nominal_weight IS NULL) OR (nominal_weight >= (0)::numeric)) AND ((tare_weight IS NULL) OR (tare_weight >= (0)::numeric)) AND ((gross_weight_max IS NULL) OR (gross_weight_max >= (0)::numeric))))
);

ALTER TABLE ONLY public.items FORCE ROW LEVEL SECURITY;


--
-- Name: lab_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lab_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    site_id uuid,
    item_id uuid,
    work_order_id uuid,
    quality_result_id uuid,
    test_type text NOT NULL,
    test_code text,
    result_value numeric(14,4),
    result_unit text,
    result_status text NOT NULL,
    threshold_rlu numeric(10,2) DEFAULT 10.00,
    tested_at timestamp with time zone,
    lab_provider text,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lab_results_result_status_check CHECK ((result_status = ANY (ARRAY['pass'::text, 'fail'::text, 'inconclusive'::text, 'pending'::text, 'hold'::text]))),
    CONSTRAINT lab_results_test_type_check CHECK ((test_type = ANY (ARRAY['atp_swab'::text, 'allergen_elisa'::text, 'micro_apc'::text, 'nutrition'::text, 'sensory'::text]))),
    CONSTRAINT lab_results_threshold_rlu_nonnegative_check CHECK (((threshold_rlu IS NULL) OR (threshold_rlu >= (0)::numeric)))
);

ALTER TABLE ONLY public.lab_results FORCE ROW LEVEL SECURITY;


--
-- Name: missing_required_cols; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.missing_required_cols WITH (security_invoker='true') AS
 WITH candidate_missing AS (
         SELECT p.product_code,
            p.org_id,
                CASE
                    WHEN (lower(dc.dept_code) = ANY (ARRAY['tech'::text, 'technical'::text])) THEN 'Tech'::text
                    ELSE dc.dept_code
                END AS dept_label,
            dc.display_order,
            lower(dc.column_key) AS physical_column,
            public.npd_dashboard_label(dc.column_key) AS column_label,
                CASE lower(dc.dept_code)
                    WHEN 'core'::text THEN 10
                    WHEN 'planning'::text THEN 20
                    WHEN 'commercial'::text THEN 30
                    WHEN 'production'::text THEN 40
                    WHEN 'mrp'::text THEN 50
                    WHEN 'tech'::text THEN 60
                    WHEN 'technical'::text THEN 60
                    WHEN 'procurement'::text THEN 70
                    ELSE 100
                END AS dept_sort
           FROM (public.fa p
             JOIN "Reference"."DeptColumns" dc ON (((dc.org_id = p.org_id) AND (dc.required_for_done = true))))
          WHERE (NULLIF(btrim(COALESCE((to_jsonb(p.*) ->> lower(dc.column_key)), ''::text)), ''::text) IS NULL)
        ), missing_cells AS (
         SELECT candidate_missing.product_code,
            candidate_missing.org_id,
            candidate_missing.dept_label,
            candidate_missing.physical_column,
            min(candidate_missing.display_order) AS display_order,
            min(candidate_missing.column_label) AS column_label,
            min(candidate_missing.dept_sort) AS dept_sort
           FROM candidate_missing
          GROUP BY candidate_missing.product_code, candidate_missing.org_id, candidate_missing.dept_label, candidate_missing.physical_column
        ), dept_missing AS (
         SELECT missing_cells.product_code,
            missing_cells.org_id,
            missing_cells.dept_label,
            missing_cells.dept_sort,
            string_agg(missing_cells.column_label, ', '::text ORDER BY missing_cells.display_order, missing_cells.physical_column) AS columns_text
           FROM missing_cells
          GROUP BY missing_cells.product_code, missing_cells.org_id, missing_cells.dept_label, missing_cells.dept_sort
        )
 SELECT product_code,
    org_id,
    (string_agg(((dept_label || ': '::text) || columns_text), '. '::text ORDER BY dept_sort, dept_label) || '.'::text) AS missing_data
   FROM dept_missing
  GROUP BY product_code, org_id;


--
-- Name: launch_alerts; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.launch_alerts WITH (security_invoker='true') AS
 WITH threshold_values AS (
         SELECT "AlertThresholds".org_id,
            max("AlertThresholds".value_int) FILTER (WHERE ("AlertThresholds".threshold_key = 'launch_alert_red_days'::text)) AS red_days,
            max("AlertThresholds".value_int) FILTER (WHERE ("AlertThresholds".threshold_key = 'launch_alert_yellow_days'::text)) AS yellow_days
           FROM "Reference"."AlertThresholds"
          WHERE ("AlertThresholds".threshold_key = ANY (ARRAY['launch_alert_red_days'::text, 'launch_alert_yellow_days'::text]))
          GROUP BY "AlertThresholds".org_id
        ), launch_candidates AS (
         SELECT f.product_code,
            f.org_id,
            f.launch_date,
            (f.launch_date - CURRENT_DATE) AS days_left,
            m.missing_data,
            t.red_days,
            t.yellow_days
           FROM ((public.fa f
             JOIN threshold_values t ON ((t.org_id = f.org_id)))
             LEFT JOIN public.missing_required_cols m ON (((m.org_id = f.org_id) AND (m.product_code = f.product_code))))
          WHERE ((f.built = false) AND (COALESCE(f.status_overall, ''::text) <> 'Complete'::text))
        )
 SELECT product_code,
    org_id,
    launch_date,
    days_left,
        CASE
            WHEN ((launch_date IS NULL) OR (days_left <= red_days)) THEN 'RED'::text
            WHEN ((days_left <= yellow_days) AND (NULLIF(missing_data, ''::text) IS NOT NULL)) THEN 'YELLOW'::text
            ELSE 'GREEN'::text
        END AS alert_level,
    missing_data
   FROM launch_candidates
  ORDER BY days_left NULLS FIRST, product_code;


--
-- Name: line_machines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.line_machines (
    line_id uuid NOT NULL,
    machine_id uuid NOT NULL,
    sequence integer NOT NULL
);

ALTER TABLE ONLY public.line_machines FORCE ROW LEVEL SECURITY;


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    warehouse_id uuid NOT NULL,
    parent_id uuid,
    code text NOT NULL,
    name text NOT NULL,
    location_type text NOT NULL,
    level integer NOT NULL,
    path text NOT NULL,
    max_capacity numeric(18,6)
);

ALTER TABLE ONLY public.locations FORCE ROW LEVEL SECURITY;


--
-- Name: login_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid,
    user_id uuid,
    email text NOT NULL,
    ip_address inet,
    user_agent text,
    success boolean DEFAULT false NOT NULL,
    failure_reason text,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.login_attempts FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE login_attempts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.login_attempts IS 'T-011: §5.7 login attempt audit feed for lockout / rate-limit. Never stores plaintext passwords.';


--
-- Name: lot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_id text,
    org_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id uuid,
    schema_version integer DEFAULT 1 NOT NULL
);

ALTER TABLE ONLY public.lot FORCE ROW LEVEL SECURITY;


--
-- Name: machines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.machines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    machine_type text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    capacity_per_hour numeric(18,6),
    specs jsonb DEFAULT '{}'::jsonb NOT NULL,
    location_id uuid
);

ALTER TABLE ONLY public.machines FORCE ROW LEVEL SECURITY;


--
-- Name: manufacturing_operation_allergen_additions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manufacturing_operation_allergen_additions (
    org_id uuid NOT NULL,
    manufacturing_operation_name text NOT NULL,
    allergen_code text NOT NULL,
    reason text,
    site_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT manufacturing_operation_allergen_additions_allergen_code_nonbla CHECK ((length(btrim(allergen_code)) > 0)),
    CONSTRAINT manufacturing_operation_allergen_additions_op_nonblank_check CHECK ((length(btrim(manufacturing_operation_name)) > 0))
);

ALTER TABLE ONLY public.manufacturing_operation_allergen_additions FORCE ROW LEVEL SECURITY;


--
-- Name: mfa_secrets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mfa_secrets (
    user_id uuid NOT NULL,
    secret_encrypted text NOT NULL,
    enrolled_at timestamp with time zone DEFAULT now() NOT NULL,
    last_otp_used_at timestamp with time zone,
    last_otp_window bigint
);

ALTER TABLE ONLY public.mfa_secrets FORCE ROW LEVEL SECURITY;


--
-- Name: modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modules (
    code text NOT NULL,
    name text NOT NULL,
    dependencies text[] DEFAULT '{}'::text[],
    can_disable boolean DEFAULT true NOT NULL,
    phase integer DEFAULT 1 NOT NULL,
    display_order integer,
    description text
);

ALTER TABLE ONLY public.modules FORCE ROW LEVEL SECURITY;


--
-- Name: mrp_planned_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mrp_planned_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    site_id uuid,
    run_id uuid NOT NULL,
    requirement_id uuid,
    item_id uuid NOT NULL,
    order_type text NOT NULL,
    quantity numeric(18,6) NOT NULL,
    uom text NOT NULL,
    due_date date NOT NULL,
    release_date date,
    supplier_id uuid,
    release_status text DEFAULT 'suggested'::text NOT NULL,
    released_order_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mrp_planned_orders_order_type_check CHECK ((order_type = ANY (ARRAY['po'::text, 'to'::text, 'wo'::text]))),
    CONSTRAINT mrp_planned_orders_quantity_positive_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT mrp_planned_orders_release_date_check CHECK (((release_date IS NULL) OR (release_date <= due_date))),
    CONSTRAINT mrp_planned_orders_release_status_check CHECK ((release_status = ANY (ARRAY['suggested'::text, 'firm'::text, 'released'::text, 'cancelled'::text])))
);

ALTER TABLE ONLY public.mrp_planned_orders FORCE ROW LEVEL SECURITY;


--
-- Name: mrp_requirements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mrp_requirements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    site_id uuid,
    run_id uuid NOT NULL,
    item_id uuid NOT NULL,
    bom_level integer DEFAULT 0 NOT NULL,
    bucket_date date NOT NULL,
    gross_requirement numeric(18,6) DEFAULT 0 NOT NULL,
    scheduled_receipts numeric(18,6) DEFAULT 0 NOT NULL,
    projected_on_hand numeric(18,6) DEFAULT 0 NOT NULL,
    net_requirement numeric(18,6) DEFAULT 0 NOT NULL,
    uom text NOT NULL,
    source_type text DEFAULT 'dependent'::text NOT NULL,
    source_reference uuid,
    exception_type text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mrp_requirements_bom_level_check CHECK ((bom_level >= 0)),
    CONSTRAINT mrp_requirements_exception_type_check CHECK (((exception_type IS NULL) OR (exception_type = ANY (ARRAY['past_due'::text, 'expedite'::text, 'de_expedite'::text, 'shortage'::text, 'excess'::text])))),
    CONSTRAINT mrp_requirements_gross_nonnegative_check CHECK ((gross_requirement >= (0)::numeric)),
    CONSTRAINT mrp_requirements_receipts_nonnegative_check CHECK ((scheduled_receipts >= (0)::numeric)),
    CONSTRAINT mrp_requirements_source_type_check CHECK ((source_type = ANY (ARRAY['independent'::text, 'dependent'::text])))
);

ALTER TABLE ONLY public.mrp_requirements FORCE ROW LEVEL SECURITY;


--
-- Name: mrp_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mrp_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    site_id uuid,
    run_number text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    demand_source text DEFAULT 'manual'::text NOT NULL,
    horizon_start date DEFAULT CURRENT_DATE NOT NULL,
    horizon_end date NOT NULL,
    bucket_days integer DEFAULT 1 NOT NULL,
    params_jsonb jsonb DEFAULT '{}'::jsonb NOT NULL,
    requirement_count integer DEFAULT 0 NOT NULL,
    planned_order_count integer DEFAULT 0 NOT NULL,
    exception_count integer DEFAULT 0 NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    error_message text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mrp_runs_bucket_days_check CHECK ((bucket_days >= 1)),
    CONSTRAINT mrp_runs_counts_nonnegative_check CHECK (((requirement_count >= 0) AND (planned_order_count >= 0) AND (exception_count >= 0))),
    CONSTRAINT mrp_runs_demand_source_check CHECK ((demand_source = ANY (ARRAY['manual'::text, 'forecast'::text, 'd365_so'::text, 'mps'::text]))),
    CONSTRAINT mrp_runs_horizon_range_check CHECK ((horizon_end >= horizon_start)),
    CONSTRAINT mrp_runs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);

ALTER TABLE ONLY public.mrp_runs FORCE ROW LEVEL SECURITY;


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    user_id uuid NOT NULL,
    org_id uuid NOT NULL,
    category text NOT NULL,
    event text NOT NULL,
    channel_email boolean DEFAULT true NOT NULL,
    channel_in_app boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_preferences_category_event_nonempty CHECK (((length(TRIM(BOTH FROM category)) > 0) AND (length(TRIM(BOTH FROM event)) > 0)))
);

ALTER TABLE ONLY public.notification_preferences FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE notification_preferences; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_preferences IS 'SET-092 per-user/per-org notification preferences surfaced by /settings/notifications.';


--
-- Name: npd_legacy_closeout; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.npd_legacy_closeout (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    npd_project_id uuid NOT NULL,
    fg_product_code text NOT NULL,
    closed_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_by uuid NOT NULL,
    release_event_id bigint NOT NULL,
    trial_shelf_life_set boolean NOT NULL,
    trial_allergens_cascade_recomputed_at timestamp with time zone NOT NULL,
    pilot_wo_id uuid,
    handoff_g4_esign_id uuid NOT NULL,
    handoff_bom_header_id uuid NOT NULL,
    packaging_snapshot_jsonb jsonb NOT NULL,
    packaging_mrp_complete boolean NOT NULL,
    external_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id uuid,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT npd_legacy_closeout_packaging_complete_check CHECK ((packaging_mrp_complete = true)),
    CONSTRAINT npd_legacy_closeout_schema_version_check CHECK ((schema_version >= 1)),
    CONSTRAINT npd_legacy_closeout_snapshot_object_check CHECK ((jsonb_typeof(packaging_snapshot_jsonb) = 'object'::text)),
    CONSTRAINT npd_legacy_closeout_trial_complete_check CHECK ((trial_shelf_life_set = true))
);

ALTER TABLE ONLY public.npd_legacy_closeout FORCE ROW LEVEL SECURITY;


--
-- Name: npd_projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.npd_projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    current_gate text DEFAULT 'G0'::text NOT NULL,
    current_stage text DEFAULT 'brief'::text NOT NULL,
    prio text DEFAULT 'normal'::text NOT NULL,
    owner text,
    target_launch date,
    notes text,
    product_code text,
    start_from text,
    clone_source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device uuid,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id uuid,
    external_id text,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT npd_projects_current_gate_check CHECK ((current_gate = ANY (ARRAY['G0'::text, 'G1'::text, 'G2'::text, 'G3'::text, 'G4'::text, 'Launched'::text]))),
    CONSTRAINT npd_projects_current_stage_check CHECK ((current_stage = ANY (ARRAY['brief'::text, 'recipe'::text, 'trial'::text, 'approval'::text, 'handoff'::text]))),
    CONSTRAINT npd_projects_prio_check CHECK ((prio = ANY (ARRAY['high'::text, 'normal'::text, 'low'::text]))),
    CONSTRAINT npd_projects_start_from_check CHECK (((start_from IS NULL) OR (start_from = ANY (ARRAY['blank'::text, 'clone'::text, 'template'::text]))))
);

ALTER TABLE ONLY public.npd_projects FORCE ROW LEVEL SECURITY;


--
-- Name: nutri_score_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nutri_score_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    product_code text NOT NULL,
    formulation_version_id uuid,
    grade text NOT NULL,
    computed_score integer NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT nutri_score_results_grade_check CHECK ((grade = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text, 'E'::text])))
);

ALTER TABLE ONLY public.nutri_score_results FORCE ROW LEVEL SECURITY;


--
-- Name: nutrition_allergens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nutrition_allergens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    product_code text NOT NULL,
    formulation_version_id uuid,
    allergen_code text NOT NULL,
    presence text NOT NULL,
    audited_at timestamp with time zone DEFAULT now() NOT NULL,
    audited_by_user uuid,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT nutrition_allergens_presence_check CHECK ((presence = ANY (ARRAY['contains'::text, 'may_contain'::text, 'free_from'::text, 'unknown'::text])))
);

ALTER TABLE ONLY public.nutrition_allergens FORCE ROW LEVEL SECURITY;


--
-- Name: nutrition_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nutrition_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    product_code text NOT NULL,
    formulation_version_id uuid,
    nutrient_code text NOT NULL,
    per_100g_value numeric NOT NULL,
    per_portion_value numeric NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT nutrition_profiles_nonnegative_values_check CHECK (((per_100g_value >= (0)::numeric) AND (per_portion_value >= (0)::numeric)))
);

ALTER TABLE ONLY public.nutrition_profiles FORCE ROW LEVEL SECURITY;


--
-- Name: org_authorization_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_authorization_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    policy_code text NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    request_permissions text[] DEFAULT '{}'::text[] NOT NULL,
    authorize_permissions text[] DEFAULT '{}'::text[] NOT NULL,
    approver_role_codes text[] DEFAULT '{}'::text[] NOT NULL,
    min_approvers integer DEFAULT 1 NOT NULL,
    require_segregation_of_duties boolean DEFAULT true NOT NULL,
    requires_new_version boolean DEFAULT true NOT NULL,
    approval_gate_rule_code text,
    settings_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_authorization_policies_code_check CHECK ((policy_code = ANY (ARRAY['npd_post_release_edit'::text, 'technical_product_spec_approval'::text]))),
    CONSTRAINT org_authorization_policies_min_approvers_check CHECK ((min_approvers >= 1)),
    CONSTRAINT org_authorization_policies_npd_requires_new_version_check CHECK (((policy_code <> 'npd_post_release_edit'::text) OR (requires_new_version = true))),
    CONSTRAINT org_authorization_policies_version_check CHECK ((version >= 1))
);

ALTER TABLE ONLY public.org_authorization_policies FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE org_authorization_policies; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.org_authorization_policies IS 'T-122: Settings-owned per-org authorization policies (NPD post-release edit + Technical product-spec approval). V-SET-43/V-SET-44.';


--
-- Name: org_security_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_security_policies (
    org_id uuid NOT NULL,
    dual_control_required boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.org_security_policies FORCE ROW LEVEL SECURITY;


--
-- Name: org_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_sequences (
    org_id uuid NOT NULL,
    seq_name text NOT NULL,
    current_value bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_sequences_current_value_check CHECK (((current_value >= 0) AND (current_value <= 9999999))),
    CONSTRAINT org_sequences_seq_name_not_blank_check CHECK ((length(btrim(seq_name)) > 0))
);

ALTER TABLE ONLY public.org_sequences FORCE ROW LEVEL SECURITY;


--
-- Name: organization_modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_modules (
    org_id uuid NOT NULL,
    module_code text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    enabled_at timestamp with time zone,
    enabled_by uuid,
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.organization_modules FORCE ROW LEVEL SECURITY;


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    industry_code text NOT NULL,
    external_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id text,
    schema_version integer DEFAULT 1 NOT NULL,
    dept_overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
    slug text DEFAULT ('org-'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
    logo_url text,
    timezone text DEFAULT 'Europe/Warsaw'::text NOT NULL,
    locale text DEFAULT 'pl'::text NOT NULL,
    currency character(3) DEFAULT 'PLN'::bpchar NOT NULL,
    gs1_prefix text,
    region text DEFAULT 'eu'::text NOT NULL,
    tier text DEFAULT 'L2'::text NOT NULL,
    seat_limit integer,
    onboarding_state jsonb DEFAULT '{}'::jsonb,
    onboarding_completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now(),
    legal_name text,
    vat text,
    regon text,
    industry text,
    street text,
    city text,
    zip text,
    country text,
    email text,
    phone text,
    website text,
    CONSTRAINT organizations_industry_code_check CHECK ((industry_code = ANY (ARRAY['bakery'::text, 'pharma'::text, 'fmcg'::text, 'generic'::text])))
);

ALTER TABLE ONLY public.organizations FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN organizations.legal_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.legal_name IS 'Full registered company name (Settings -> Company profile).';


--
-- Name: COLUMN organizations.vat; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.vat IS 'VAT / NIP tax identification number.';


--
-- Name: COLUMN organizations.regon; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.regon IS 'REGON registry number (PL).';


--
-- Name: COLUMN organizations.industry; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.industry IS 'Industry label shown on the company profile.';


--
-- Name: COLUMN organizations.street; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.street IS 'Registered address -- street line.';


--
-- Name: COLUMN organizations.city; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.city IS 'Registered address -- city.';


--
-- Name: COLUMN organizations.zip; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.zip IS 'Registered address -- postal/ZIP code.';


--
-- Name: COLUMN organizations.country; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.country IS 'Registered address -- country.';


--
-- Name: COLUMN organizations.email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.email IS 'Primary company contact email.';


--
-- Name: COLUMN organizations.phone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.phone IS 'Primary company contact phone.';


--
-- Name: COLUMN organizations.website; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.organizations.website IS 'Company website URL.';


--
-- Name: outbox_dead_letter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outbox_dead_letter (
    id bigint NOT NULL,
    outbox_event_id bigint NOT NULL,
    org_id uuid NOT NULL,
    event_type text NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    app_version text NOT NULL,
    attempts integer NOT NULL,
    failed_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error_text text NOT NULL,
    CONSTRAINT outbox_dead_letter_attempts_check CHECK ((attempts >= 0))
);

ALTER TABLE ONLY public.outbox_dead_letter FORCE ROW LEVEL SECURITY;


--
-- Name: outbox_dead_letter_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.outbox_dead_letter_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: outbox_dead_letter_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.outbox_dead_letter_id_seq OWNED BY public.outbox_dead_letter.id;


--
-- Name: outbox_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outbox_events (
    id bigint NOT NULL,
    org_id uuid NOT NULL,
    event_type text NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    consumed_at timestamp with time zone,
    app_version text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    dead_lettered_at timestamp with time zone,
    last_error_text text,
    dedup_key text,
    CONSTRAINT outbox_events_event_type_check CHECK ((event_type = ANY (ARRAY['audit.recorded'::text, 'bom.initial_version_created'::text, 'bom.version_submitted'::text, 'brief.completed_for_project'::text, 'brief.converted'::text, 'brief.created'::text, 'compliance_doc.deleted'::text, 'compliance_doc.expired'::text, 'compliance_doc.expiring'::text, 'compliance_doc.uploaded'::text, 'd365.cache.refreshed'::text, 'fa.allergens_changed'::text, 'fa.built'::text, 'fa.built_reset'::text, 'fa.cascade'::text, 'fa.core_closed'::text, 'fa.created'::text, 'fa.deleted'::text, 'fa.dept_closed'::text, 'fa.dept_reopened'::text, 'fa.edit'::text, 'fa.intermediate_code_changed'::text, 'fa.recipe_changed'::text, 'fa.template_applied'::text, 'fg.allergens_changed'::text, 'fg.bom.released'::text, 'fg.created'::text, 'fg.edit'::text, 'fg.intermediate_code_changed'::text, 'fg.release_blocked'::text, 'fg.released_to_factory'::text, 'formulation.locked'::text, 'formulation.submitted_for_trial'::text, 'lp.received'::text, 'manufacturing_operations.created'::text, 'manufacturing_operations.deactivated'::text, 'manufacturing_operations.reset_to_seed'::text, 'manufacturing_operations.updated'::text, 'npd.allergens.bulk_rebuild_completed'::text, 'npd.builder.released_records_created'::text, 'npd.fg_candidate_mapped'::text, 'npd.gate.advanced'::text, 'npd.gate.approved'::text, 'npd.gate.reverted'::text, 'npd.project.brief_mapped'::text, 'npd.project.created'::text, 'npd.project.legacy_stages_closed'::text, 'npd.project.release_requested'::text, 'onboarding.first_wo_recorded'::text, 'onboarding.step.advance'::text, 'onboarding.step.back'::text, 'onboarding.step.jump'::text, 'onboarding.step.restart'::text, 'onboarding.step.skip'::text, 'org.created'::text, 'org.mfa_enrollment.forced'::text, 'org.security_policy.updated'::text, 'quality.recorded'::text, 'reference.allergens_added_by_process.bulk_changed'::text, 'reference.allergens_by_rm.bulk_changed'::text, 'reference.csv.committed'::text, 'reference.row.soft_deleted'::text, 'reference.row.upserted'::text, 'risk.created'::text, 'role.assigned'::text, 'rule.deployed'::text, 'settings.core_flag.updated'::text, 'settings.dept_override.updated'::text, 'settings.ip_allowlist.changed'::text, 'settings.line.upserted'::text, 'settings.location.deleted'::text, 'settings.location.imported'::text, 'settings.location.upserted'::text, 'settings.machine.upserted'::text, 'settings.module.disabled'::text, 'settings.module.enabled'::text, 'settings.module.toggled'::text, 'settings.notification_channel_updated'::text, 'settings.notification_digest_updated'::text, 'settings.notification_rule_updated'::text, 'settings.org.created'::text, 'settings.org.updated'::text, 'settings.reference.row_updated'::text, 'settings.role.assigned'::text, 'settings.rule.deployed'::text, 'settings.rule_variant.updated'::text, 'settings.schema.migration_requested'::text, 'settings.scim.token_created'::text, 'settings.sso.config_changed'::text, 'settings.upgrade.completed'::text, 'settings.upgrade.promoted'::text, 'settings.upgrade.rolled_back'::text, 'settings.upgrade.scheduled'::text, 'settings.user.accepted'::text, 'settings.user.deactivated'::text, 'settings.user.invitation_resent'::text, 'settings.user.invited'::text, 'settings.warehouse.deactivated'::text, 'shipment.created'::text, 'technical.factory_spec.approved'::text, 'tenant.cohort.advanced'::text, 'tenant.migration.run'::text, 'tenant.migration.run.failed'::text, 'unit_of_measure.conversion_created'::text, 'unit_of_measure.created'::text, 'unit_of_measure.soft_deleted'::text, 'user.invited'::text, 'wo.ready'::text])))
);

ALTER TABLE ONLY public.outbox_events FORCE ROW LEVEL SECURITY;


--
-- Name: outbox_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.outbox_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: outbox_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.outbox_events_id_seq OWNED BY public.outbox_events.id;


--
-- Name: password_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.password_history FORCE ROW LEVEL SECURITY;


--
-- Name: production_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.production_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    default_location_id uuid
);

ALTER TABLE ONLY public.production_lines FORCE ROW LEVEL SECURITY;


--
-- Name: quality_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quality_event (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_id text,
    org_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id uuid,
    schema_version integer DEFAULT 1 NOT NULL
);

ALTER TABLE ONLY public.quality_event FORCE ROW LEVEL SECURITY;


--
-- Name: recovery_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recovery_codes (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    code_hash text NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.recovery_codes FORCE ROW LEVEL SECURITY;


--
-- Name: recovery_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recovery_codes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recovery_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recovery_codes_id_seq OWNED BY public.recovery_codes.id;


--
-- Name: reference_csv_import_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reference_csv_import_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    table_code text NOT NULL,
    payload jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.reference_csv_import_reports FORCE ROW LEVEL SECURITY;


--
-- Name: reference_schemas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reference_schemas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid,
    table_code text NOT NULL,
    column_code text NOT NULL,
    dept_code text,
    data_type text NOT NULL,
    tier text NOT NULL,
    storage text NOT NULL,
    dropdown_source text,
    blocking_rule text,
    required_for_done boolean DEFAULT false NOT NULL,
    validation_json jsonb DEFAULT '{}'::jsonb,
    presentation_json jsonb DEFAULT '{}'::jsonb,
    schema_version integer DEFAULT 1 NOT NULL,
    deprecated_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT reference_schemas_data_type_check CHECK ((data_type = ANY (ARRAY['text'::text, 'number'::text, 'date'::text, 'enum'::text, 'formula'::text, 'relation'::text]))),
    CONSTRAINT reference_schemas_tier_check CHECK ((tier = ANY (ARRAY['L1'::text, 'L2'::text, 'L3'::text, 'L4'::text])))
);

ALTER TABLE ONLY public.reference_schemas FORCE ROW LEVEL SECURITY;


--
-- Name: reference_tables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reference_tables (
    org_id uuid NOT NULL,
    table_code text NOT NULL,
    row_key text NOT NULL,
    row_data jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.reference_tables FORCE ROW LEVEL SECURITY;


--
-- Name: reorder_thresholds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reorder_thresholds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    site_id uuid,
    item_id uuid NOT NULL,
    min_qty numeric(18,6) DEFAULT 0 NOT NULL,
    reorder_qty numeric(18,6) DEFAULT 0 NOT NULL,
    preferred_supplier_id uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reorder_thresholds_min_qty_nonnegative_check CHECK ((min_qty >= (0)::numeric)),
    CONSTRAINT reorder_thresholds_reorder_qty_nonnegative_check CHECK ((reorder_qty >= (0)::numeric))
);

ALTER TABLE ONLY public.reorder_thresholds FORCE ROW LEVEL SECURITY;


--
-- Name: risks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.risks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    product_code text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    likelihood integer NOT NULL,
    impact integer NOT NULL,
    score integer GENERATED ALWAYS AS ((likelihood * impact)) STORED,
    bucket text GENERATED ALWAYS AS (
CASE
    WHEN ((likelihood * impact) >= 6) THEN 'High'::text
    WHEN ((likelihood * impact) >= 3) THEN 'Med'::text
    ELSE 'Low'::text
END) STORED,
    state text DEFAULT 'Open'::text NOT NULL,
    mitigation text,
    owner_user_id uuid,
    closed_at timestamp with time zone,
    closed_by_user uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id uuid,
    external_id text,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT risks_description_length_check CHECK (((length(description) >= 10) AND (length(description) <= 500))),
    CONSTRAINT risks_impact_check CHECK (((impact >= 1) AND (impact <= 3))),
    CONSTRAINT risks_likelihood_check CHECK (((likelihood >= 1) AND (likelihood <= 3))),
    CONSTRAINT risks_state_check CHECK ((state = ANY (ARRAY['Open'::text, 'Mitigated'::text, 'Closed'::text]))),
    CONSTRAINT risks_title_length_check CHECK (((length(title) >= 3) AND (length(title) <= 300)))
);

ALTER TABLE ONLY public.risks FORCE ROW LEVEL SECURITY;


--
-- Name: role_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_categories (
    role_code text NOT NULL,
    ui_category text NOT NULL,
    color_hint text,
    CONSTRAINT role_categories_ui_category_check CHECK ((ui_category = ANY (ARRAY['admin'::text, 'manager'::text, 'operator'::text, 'viewer'::text])))
);

ALTER TABLE ONLY public.role_categories FORCE ROW LEVEL SECURITY;


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role_id uuid NOT NULL,
    permission text NOT NULL
);

ALTER TABLE ONLY public.role_permissions FORCE ROW LEVEL SECURITY;


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    slug text DEFAULT ('role-'::text || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
    system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    permissions jsonb NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 0
);

ALTER TABLE ONLY public.roles FORCE ROW LEVEL SECURITY;


--
-- Name: routing_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routing_operations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    site_id uuid,
    routing_id uuid NOT NULL,
    op_no integer NOT NULL,
    op_code text NOT NULL,
    op_name text NOT NULL,
    line_id uuid,
    machine_id uuid,
    setup_time_min integer DEFAULT 0 NOT NULL,
    run_time_per_unit_sec numeric(10,2),
    cost_per_hour numeric(10,4),
    manufacturing_operation_name text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT routing_operations_cost_per_hour_nonnegative_check CHECK (((cost_per_hour IS NULL) OR (cost_per_hour >= (0)::numeric))),
    CONSTRAINT routing_operations_op_no_check CHECK ((op_no >= 1)),
    CONSTRAINT routing_operations_run_time_nonnegative_check CHECK (((run_time_per_unit_sec IS NULL) OR (run_time_per_unit_sec >= (0)::numeric))),
    CONSTRAINT routing_operations_setup_time_nonnegative_check CHECK ((setup_time_min >= 0))
);

ALTER TABLE ONLY public.routing_operations FORCE ROW LEVEL SECURITY;


--
-- Name: routings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    site_id uuid,
    item_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    effective_to date,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT routings_effective_range_check CHECK (((effective_to IS NULL) OR (effective_to >= effective_from))),
    CONSTRAINT routings_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text, 'active'::text, 'superseded'::text]))),
    CONSTRAINT routings_version_check CHECK ((version >= 1))
);

ALTER TABLE ONLY public.routings FORCE ROW LEVEL SECURITY;


--
-- Name: rule_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rule_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    rule_code text NOT NULL,
    rule_type text NOT NULL,
    tier text DEFAULT 'L1'::text NOT NULL,
    definition_json jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    active_from timestamp with time zone DEFAULT now() NOT NULL,
    active_to timestamp with time zone,
    deployed_by uuid,
    deploy_ref text,
    CONSTRAINT rule_definitions_rule_type_check CHECK ((rule_type = ANY (ARRAY['cascading'::text, 'conditional'::text, 'gate'::text, 'workflow'::text]))),
    CONSTRAINT rule_definitions_tier_check CHECK ((tier = ANY (ARRAY['L1'::text, 'L2'::text, 'L3'::text, 'L4'::text])))
);

ALTER TABLE ONLY public.rule_definitions FORCE ROW LEVEL SECURITY;


--
-- Name: rule_dry_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rule_dry_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    rule_definition_id uuid NOT NULL,
    sample_input_json jsonb NOT NULL,
    result_json jsonb NOT NULL,
    ran_at timestamp with time zone DEFAULT now(),
    ran_by uuid
);

ALTER TABLE ONLY public.rule_dry_runs FORCE ROW LEVEL SECURITY;


--
-- Name: schedule_outputs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_outputs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    site_id uuid,
    planned_wo_id uuid NOT NULL,
    product_id uuid NOT NULL,
    output_role text NOT NULL,
    expected_qty numeric(12,3) NOT NULL,
    uom text NOT NULL,
    allocation_pct numeric(5,2) NOT NULL,
    disposition text DEFAULT 'to_stock'::text NOT NULL,
    downstream_wo_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT schedule_outputs_allocation_pct_range_check CHECK (((allocation_pct >= (0)::numeric) AND (allocation_pct <= (100)::numeric))),
    CONSTRAINT schedule_outputs_disposition_check CHECK ((disposition = ANY (ARRAY['to_stock'::text, 'direct_continue'::text, 'pending_decision'::text]))),
    CONSTRAINT schedule_outputs_expected_qty_nonneg_check CHECK ((expected_qty >= (0)::numeric)),
    CONSTRAINT schedule_outputs_output_role_check CHECK ((output_role = ANY (ARRAY['primary'::text, 'co_product'::text, 'byproduct'::text])))
);

ALTER TABLE ONLY public.schedule_outputs FORCE ROW LEVEL SECURITY;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    checksum text NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid,
    table_code text DEFAULT '__migration_runner__'::text NOT NULL,
    column_code text,
    action text DEFAULT 'runner_apply'::text NOT NULL,
    tier_before text,
    tier_after text,
    migration_script text,
    approved_by uuid,
    approved_at timestamp with time zone,
    executed_at timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    result_notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT schema_migrations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'running'::text, 'completed'::text, 'failed'::text, 'rolled_back'::text])))
);


--
-- Name: scim_group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scim_group_members (
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.scim_group_members FORCE ROW LEVEL SECURITY;


--
-- Name: scim_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scim_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    display_name text NOT NULL,
    external_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.scim_groups FORCE ROW LEVEL SECURITY;


--
-- Name: scim_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scim_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    label text NOT NULL,
    scim_token_hash text NOT NULL,
    scim_token_last_four text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT scim_tokens_label_check CHECK (((char_length(label) >= 1) AND (char_length(label) <= 120))),
    CONSTRAINT scim_tokens_scim_token_last_four_check CHECK ((char_length(scim_token_last_four) = 4))
);

ALTER TABLE ONLY public.scim_tokens FORCE ROW LEVEL SECURITY;


--
-- Name: shipment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_id text,
    org_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id uuid,
    schema_version integer DEFAULT 1 NOT NULL
);

ALTER TABLE ONLY public.shipment FORCE ROW LEVEL SECURITY;


--
-- Name: supplier_spec_review_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_spec_review_proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    site_id uuid,
    supplier_spec_id uuid NOT NULL,
    source text DEFAULT 'po_actual'::text NOT NULL,
    proposal_status text DEFAULT 'pending'::text NOT NULL,
    proposed_attrs jsonb DEFAULT '{}'::jsonb NOT NULL,
    observed_notes text,
    is_non_conformance boolean DEFAULT false NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    review_notes text,
    resulting_supplier_spec_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT supplier_spec_review_proposals_proposed_attrs_object_check CHECK ((jsonb_typeof(proposed_attrs) = 'object'::text)),
    CONSTRAINT supplier_spec_review_proposals_resulting_spec_consistency_check CHECK ((((proposal_status = 'approved'::text) AND (resulting_supplier_spec_id IS NOT NULL)) OR ((proposal_status <> 'approved'::text) AND (resulting_supplier_spec_id IS NULL)))),
    CONSTRAINT supplier_spec_review_proposals_source_check CHECK ((source = ANY (ARRAY['po_actual'::text, 'technical'::text, 'import'::text]))),
    CONSTRAINT supplier_spec_review_proposals_status_check CHECK ((proposal_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'blocked'::text])))
);

ALTER TABLE ONLY public.supplier_spec_review_proposals FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE supplier_spec_review_proposals; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.supplier_spec_review_proposals IS 'T-075: non-mutating PO/Technical review proposal channel for supplier_specs. PO actuals create proposals (review/non-conformance) but never overwrite supplier_specs; the only governed mutation path is approve_supplier_spec_review (Technical).';


--
-- Name: supplier_specs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_specs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    site_id uuid,
    item_id uuid NOT NULL,
    supplier_code text NOT NULL,
    supplier_status text DEFAULT 'pending'::text NOT NULL,
    spec_document_url text,
    document_sha256 text,
    document_mime_type text,
    spec_version text NOT NULL,
    issued_date date,
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    expiry_date date,
    lifecycle_status text DEFAULT 'draft'::text NOT NULL,
    review_status text DEFAULT 'pending'::text NOT NULL,
    review_notes text,
    cost_review_blocked boolean DEFAULT false NOT NULL,
    spec_review_blocked boolean DEFAULT false NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    rejected_by uuid,
    rejected_at timestamp with time zone,
    rejection_reason text,
    declared_allergens text[],
    declared_attrs jsonb DEFAULT '{}'::jsonb NOT NULL,
    certificate_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplier_specs_certificate_refs_array_check CHECK ((jsonb_typeof(certificate_refs) = 'array'::text)),
    CONSTRAINT supplier_specs_declared_attrs_object_check CHECK ((jsonb_typeof(declared_attrs) = 'object'::text)),
    CONSTRAINT supplier_specs_expiry_after_effective_check CHECK (((expiry_date IS NULL) OR (effective_from IS NULL) OR (expiry_date >= effective_from))),
    CONSTRAINT supplier_specs_lifecycle_status_check CHECK ((lifecycle_status = ANY (ARRAY['draft'::text, 'active'::text, 'expired'::text, 'superseded'::text, 'blocked'::text]))),
    CONSTRAINT supplier_specs_review_status_check CHECK ((review_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'blocked'::text]))),
    CONSTRAINT supplier_specs_supplier_status_check CHECK ((supplier_status = ANY (ARRAY['pending'::text, 'approved'::text, 'blocked'::text])))
);

ALTER TABLE ONLY public.supplier_specs FORCE ROW LEVEL SECURITY;


--
-- Name: tax_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    rate numeric(5,4) NOT NULL,
    country_code character(2),
    tax_type text,
    jurisdiction text,
    effective_from date,
    effective_to date,
    is_default boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public.tax_codes FORCE ROW LEVEL SECURITY;


--
-- Name: technical_sensory_evaluations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.technical_sensory_evaluations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    site_id uuid,
    subject_type text NOT NULL,
    subject_ref text NOT NULL,
    subject_item_id uuid,
    status text DEFAULT 'not_required'::text NOT NULL,
    status_reason text,
    policy_required boolean DEFAULT false NOT NULL,
    evaluated_at timestamp with time zone,
    evaluated_by uuid,
    schema_version integer DEFAULT 1 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT technical_sensory_evaluations_not_required_policy_check CHECK (((status <> 'not_required'::text) OR (policy_required = false))),
    CONSTRAINT technical_sensory_evaluations_schema_version_check CHECK ((schema_version >= 1)),
    CONSTRAINT technical_sensory_evaluations_status_check CHECK ((status = ANY (ARRAY['required'::text, 'pending'::text, 'pass'::text, 'fail'::text, 'hold'::text, 'not_required'::text]))),
    CONSTRAINT technical_sensory_evaluations_subject_type_check CHECK ((subject_type = ANY (ARRAY['product'::text, 'project'::text, 'work_order'::text, 'item'::text])))
);

ALTER TABLE ONLY public.technical_sensory_evaluations FORCE ROW LEVEL SECURITY;


--
-- Name: tenant_idp_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_idp_config (
    tenant_id uuid NOT NULL,
    provider_type character varying DEFAULT 'password'::character varying NOT NULL,
    idle_timeout_min integer DEFAULT 60 NOT NULL,
    session_max_h integer DEFAULT 8 NOT NULL,
    mfa_required boolean DEFAULT true NOT NULL,
    mfa_required_for_roles text[] DEFAULT ARRAY['org.access.admin'::text, 'org.schema.admin'::text] NOT NULL,
    mfa_allowed_methods text[] DEFAULT ARRAY['totp'::text] NOT NULL,
    password_complexity character varying DEFAULT 'strong'::character varying NOT NULL,
    metadata_url text,
    entity_id text,
    x509_cert text,
    provider_label text,
    scim_token_hash text,
    scim_token_last_four text,
    jit_provisioning boolean DEFAULT false NOT NULL,
    enforce_for_non_admins boolean DEFAULT false NOT NULL,
    password_expiry_days integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    scim_group_role_map jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT tenant_idp_config_provider_type_check CHECK (((provider_type)::text = ANY ((ARRAY['saml'::character varying, 'oidc'::character varying, 'password'::character varying, 'magic'::character varying])::text[])))
);

ALTER TABLE ONLY public.tenant_idp_config FORCE ROW LEVEL SECURITY;


--
-- Name: tenant_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_migrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    component text NOT NULL,
    current_version text NOT NULL,
    target_version text NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    canary_pct numeric(7,4) DEFAULT 0 NOT NULL,
    last_run_at timestamp with time zone,
    scheduled_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tenant_migrations_l2_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'canary'::text, 'progressive'::text, 'completed'::text, 'rolled_back'::text, 'force_scheduled'::text])))
);

ALTER TABLE ONLY public.tenant_migrations FORCE ROW LEVEL SECURITY;


--
-- Name: tenant_migrations_legacy_t038; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_migrations_legacy_t038 (
    tenant_id uuid NOT NULL,
    component text NOT NULL,
    current_version text NOT NULL,
    target_version text,
    cohort text DEFAULT 'general'::text NOT NULL,
    last_run_at timestamp with time zone,
    status text DEFAULT 'idle'::text NOT NULL,
    failure_reason text,
    CONSTRAINT tenant_migrations_cohort_check CHECK ((cohort = ANY (ARRAY['canary'::text, 'early'::text, 'general'::text]))),
    CONSTRAINT tenant_migrations_status_check CHECK ((status = ANY (ARRAY['idle'::text, 'pending'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'rolled_back'::text])))
);

ALTER TABLE ONLY public.tenant_migrations_legacy_t038 FORCE ROW LEVEL SECURITY;


--
-- Name: tenant_variations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_variations (
    org_id uuid NOT NULL,
    dept_overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
    rule_variant_overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
    feature_flags jsonb DEFAULT '{}'::jsonb NOT NULL,
    schema_extensions_count integer DEFAULT 0 NOT NULL,
    upgraded_at timestamp with time zone,
    upgraded_from_version text,
    upgraded_to_version text
);

ALTER TABLE ONLY public.tenant_variations FORCE ROW LEVEL SECURITY;


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid NOT NULL,
    name text NOT NULL,
    region_cluster text DEFAULT 'eu'::text NOT NULL,
    data_plane_url text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tenants_region_cluster_check CHECK ((region_cluster = ANY (ARRAY['eu'::text, 'us'::text])))
);

ALTER TABLE ONLY public.tenants FORCE ROW LEVEL SECURITY;


--
-- Name: unit_of_measure; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unit_of_measure (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    category text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    factor_to_base numeric(18,6) DEFAULT 1 NOT NULL,
    is_base boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT unit_of_measure_category_check CHECK ((category = ANY (ARRAY['mass'::text, 'volume'::text, 'count'::text]))),
    CONSTRAINT unit_of_measure_factor_positive CHECK ((factor_to_base > (0)::numeric))
);

ALTER TABLE ONLY public.unit_of_measure FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE unit_of_measure; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.unit_of_measure IS 'T-073: per-org units of measure (mass/volume/count) used across recipes, stock, shipping.';


--
-- Name: uom_custom_conversions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uom_custom_conversions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    label text NOT NULL,
    from_unit_code text NOT NULL,
    to_unit_code text NOT NULL,
    factor numeric(18,6) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT uom_custom_conversions_factor_positive CHECK ((factor > (0)::numeric))
);

ALTER TABLE ONLY public.uom_custom_conversions FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE uom_custom_conversions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.uom_custom_conversions IS 'T-073: per-org non-linear UoM conversions (e.g. flour 1 cup = 120g).';


--
-- Name: user_pins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_pins (
    user_id uuid NOT NULL,
    pin_hash text NOT NULL,
    attempts_count integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    last_attempt_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.user_pins FORCE ROW LEVEL SECURITY;


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    org_id uuid NOT NULL
);

ALTER TABLE ONLY public.user_roles FORCE ROW LEVEL SECURITY;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    email public.citext NOT NULL,
    display_name text,
    external_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id text,
    schema_version integer DEFAULT 1 NOT NULL,
    deleted_at timestamp with time zone,
    name text NOT NULL,
    role_id uuid NOT NULL,
    language text DEFAULT 'pl'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    invite_token text,
    invite_token_expires_at timestamp with time zone,
    last_login_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.users FORCE ROW LEVEL SECURITY;


--
-- Name: warehouses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    warehouse_type text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    address jsonb,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.warehouses FORCE ROW LEVEL SECURITY;


--
-- Name: wo_dependencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wo_dependencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    site_id uuid,
    parent_wo_id uuid NOT NULL,
    child_wo_id uuid NOT NULL,
    material_link uuid,
    required_qty numeric(12,3),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wo_dependencies_no_self_loop_check CHECK ((parent_wo_id <> child_wo_id)),
    CONSTRAINT wo_dependencies_required_qty_nonneg_check CHECK (((required_qty IS NULL) OR (required_qty >= (0)::numeric)))
);

ALTER TABLE ONLY public.wo_dependencies FORCE ROW LEVEL SECURITY;


--
-- Name: wo_materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wo_materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    site_id uuid,
    wo_id uuid NOT NULL,
    product_id uuid NOT NULL,
    material_name character varying(255) NOT NULL,
    required_qty numeric(15,3) NOT NULL,
    consumed_qty numeric(15,3) DEFAULT 0 NOT NULL,
    reserved_qty numeric(15,3) DEFAULT 0 NOT NULL,
    uom text NOT NULL,
    sequence integer DEFAULT 1 NOT NULL,
    consume_whole_lp boolean DEFAULT false NOT NULL,
    is_by_product boolean DEFAULT false NOT NULL,
    yield_percent numeric(7,4),
    scrap_percent numeric(7,4),
    condition_flags jsonb DEFAULT '{}'::jsonb NOT NULL,
    bom_item_id uuid,
    bom_version integer,
    material_source text DEFAULT 'stock'::text NOT NULL,
    source_wo_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wo_materials_consumed_qty_nonneg_check CHECK ((consumed_qty >= (0)::numeric)),
    CONSTRAINT wo_materials_material_source_check CHECK ((material_source = ANY (ARRAY['stock'::text, 'upstream_wo_output'::text, 'manual'::text]))),
    CONSTRAINT wo_materials_required_qty_nonneg_check CHECK ((required_qty >= (0)::numeric)),
    CONSTRAINT wo_materials_reserved_qty_nonneg_check CHECK ((reserved_qty >= (0)::numeric))
);

ALTER TABLE ONLY public.wo_materials FORCE ROW LEVEL SECURITY;


--
-- Name: wo_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wo_operations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    site_id uuid,
    wo_id uuid NOT NULL,
    sequence integer NOT NULL,
    operation_name character varying(255) NOT NULL,
    machine_id uuid,
    line_id uuid,
    expected_duration_minutes integer,
    expected_yield_percent numeric(7,4),
    actual_duration integer,
    actual_yield numeric(7,4),
    status character varying(30) DEFAULT 'pending'::character varying NOT NULL,
    started_at timestamp with time zone,
    started_by uuid,
    completed_at timestamp with time zone,
    completed_by uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wo_operations_sequence_check CHECK ((sequence >= 1)),
    CONSTRAINT wo_operations_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'skipped'::character varying])::text[])))
);

ALTER TABLE ONLY public.wo_operations FORCE ROW LEVEL SECURITY;


--
-- Name: wo_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wo_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    site_id uuid,
    wo_id uuid NOT NULL,
    from_status character varying(30),
    to_status character varying(30) NOT NULL,
    action character varying(60) NOT NULL,
    user_id uuid,
    override_reason text,
    context_jsonb jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.wo_status_history FORCE ROW LEVEL SECURITY;


--
-- Name: work_order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_order (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_id text,
    org_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user uuid,
    created_by_device text,
    app_version text,
    model_prediction_id uuid,
    epcis_event_id uuid,
    schema_version integer DEFAULT 1 NOT NULL
);

ALTER TABLE ONLY public.work_order FORCE ROW LEVEL SECURITY;


--
-- Name: work_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    site_id uuid,
    wo_number character varying(30) NOT NULL,
    product_id uuid NOT NULL,
    item_type_at_creation text NOT NULL,
    bom_id uuid,
    active_bom_header_id uuid,
    active_factory_spec_id uuid,
    factory_release_event_id uuid,
    factory_release_status_at_creation character varying(40),
    routing_id uuid,
    planned_quantity numeric(15,3) NOT NULL,
    produced_quantity numeric(15,3),
    uom text NOT NULL,
    is_rework boolean DEFAULT false NOT NULL,
    released_to_warehouse boolean DEFAULT false NOT NULL,
    status character varying(30) DEFAULT 'DRAFT'::character varying NOT NULL,
    planned_start_date timestamp with time zone,
    planned_end_date timestamp with time zone,
    scheduled_start_time timestamp with time zone,
    scheduled_end_time timestamp with time zone,
    production_line_id uuid,
    machine_id uuid,
    priority character varying(20) DEFAULT 'normal'::character varying NOT NULL,
    source_of_demand text DEFAULT 'manual'::text NOT NULL,
    source_reference character varying(255),
    expiry_date date,
    disposition_policy text DEFAULT 'to_stock'::text NOT NULL,
    actual_qty numeric(15,3),
    yield_percent numeric(9,4) GENERATED ALWAYS AS (
CASE
    WHEN ((actual_qty IS NULL) OR (planned_quantity = (0)::numeric)) THEN NULL::numeric
    ELSE round((actual_qty / planned_quantity), 4)
END) STORED,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    paused_at timestamp with time zone,
    pause_reason text,
    allergen_profile_snapshot jsonb,
    ext_jsonb jsonb DEFAULT '{}'::jsonb NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT work_orders_actual_qty_nonneg_check CHECK (((actual_qty IS NULL) OR (actual_qty >= (0)::numeric))),
    CONSTRAINT work_orders_disposition_policy_check CHECK ((disposition_policy = ANY (ARRAY['to_stock'::text, 'direct_continue'::text, 'planner_decides'::text]))),
    CONSTRAINT work_orders_item_type_at_creation_check CHECK ((item_type_at_creation = ANY (ARRAY['rm'::text, 'intermediate'::text, 'fg'::text, 'co_product'::text, 'byproduct'::text]))),
    CONSTRAINT work_orders_planned_quantity_positive_check CHECK ((planned_quantity > (0)::numeric)),
    CONSTRAINT work_orders_priority_check CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'normal'::character varying, 'high'::character varying, 'critical'::character varying])::text[]))),
    CONSTRAINT work_orders_produced_quantity_nonneg_check CHECK (((produced_quantity IS NULL) OR (produced_quantity >= (0)::numeric))),
    CONSTRAINT work_orders_schema_version_check CHECK ((schema_version >= 1)),
    CONSTRAINT work_orders_source_of_demand_check CHECK ((source_of_demand = ANY (ARRAY['manual'::text, 'd365_so'::text, 'forecast'::text, 'rework'::text, 'intermediate_cascade'::text]))),
    CONSTRAINT work_orders_status_check CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'RELEASED'::character varying, 'IN_PROGRESS'::character varying, 'ON_HOLD'::character varying, 'COMPLETED'::character varying, 'CLOSED'::character varying, 'CANCELLED'::character varying])::text[])))
);

ALTER TABLE ONLY public.work_orders FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_2026_01; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_01 FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-02-01 00:00:00+00');


--
-- Name: audit_log_2026_02; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_02 FOR VALUES FROM ('2026-02-01 00:00:00+00') TO ('2026-03-01 00:00:00+00');


--
-- Name: audit_log_2026_03; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_03 FOR VALUES FROM ('2026-03-01 00:00:00+00') TO ('2026-04-01 00:00:00+01');


--
-- Name: audit_log_2026_04; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_04 FOR VALUES FROM ('2026-04-01 00:00:00+01') TO ('2026-05-01 00:00:00+01');


--
-- Name: audit_log_2026_05; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_05 FOR VALUES FROM ('2026-05-01 00:00:00+01') TO ('2026-06-01 00:00:00+01');


--
-- Name: audit_log_2026_06; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_06 FOR VALUES FROM ('2026-06-01 00:00:00+01') TO ('2026-07-01 00:00:00+01');


--
-- Name: audit_log_2026_07; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_07 FOR VALUES FROM ('2026-07-01 00:00:00+01') TO ('2026-08-01 00:00:00+01');


--
-- Name: audit_log_2026_08; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_08 FOR VALUES FROM ('2026-08-01 00:00:00+01') TO ('2026-09-01 00:00:00+01');


--
-- Name: audit_log_2026_09; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_09 FOR VALUES FROM ('2026-09-01 00:00:00+01') TO ('2026-10-01 00:00:00+01');


--
-- Name: audit_log_2026_10; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_10 FOR VALUES FROM ('2026-10-01 00:00:00+01') TO ('2026-11-01 00:00:00+00');


--
-- Name: audit_log_2026_11; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_11 FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');


--
-- Name: audit_log_2026_12; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ATTACH PARTITION public.audit_log_2026_12 FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');


--
-- Name: audit_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events ALTER COLUMN id SET DEFAULT nextval('public.audit_events_id_seq'::regclass);


--
-- Name: dept_column_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dept_column_migrations ALTER COLUMN id SET DEFAULT nextval('public.dept_column_migrations_id_seq'::regclass);


--
-- Name: outbox_dead_letter id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_dead_letter ALTER COLUMN id SET DEFAULT nextval('public.outbox_dead_letter_id_seq'::regclass);


--
-- Name: outbox_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_events ALTER COLUMN id SET DEFAULT nextval('public.outbox_events_id_seq'::regclass);


--
-- Name: recovery_codes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recovery_codes ALTER COLUMN id SET DEFAULT nextval('public.recovery_codes_id_seq'::regclass);


--
-- Name: AlertThresholds AlertThresholds_pkey; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."AlertThresholds"
    ADD CONSTRAINT "AlertThresholds_pkey" PRIMARY KEY (org_id, threshold_key);


--
-- Name: Allergens_added_by_Process Allergens_added_by_Process_pkey; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Allergens_added_by_Process"
    ADD CONSTRAINT "Allergens_added_by_Process_pkey" PRIMARY KEY (id);


--
-- Name: Allergens_by_RM Allergens_by_RM_pkey; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Allergens_by_RM"
    ADD CONSTRAINT "Allergens_by_RM_pkey" PRIMARY KEY (id);


--
-- Name: ApprovalChainTemplates ApprovalChainTemplates_pkey; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."ApprovalChainTemplates"
    ADD CONSTRAINT "ApprovalChainTemplates_pkey" PRIMARY KEY (org_id, template_id);


--
-- Name: CloseConfirm CloseConfirm_pkey; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."CloseConfirm"
    ADD CONSTRAINT "CloseConfirm_pkey" PRIMARY KEY (org_id, value);


--
-- Name: Departments Departments_pkey; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Departments"
    ADD CONSTRAINT "Departments_pkey" PRIMARY KEY (id);


--
-- Name: DeptColumns DeptColumns_pkey; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."DeptColumns"
    ADD CONSTRAINT "DeptColumns_pkey" PRIMARY KEY (id);


--
-- Name: Equipment_Setup_By_Line_Pack Equipment_Setup_By_Line_Pack_pkey; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Equipment_Setup_By_Line_Pack"
    ADD CONSTRAINT "Equipment_Setup_By_Line_Pack_pkey" PRIMARY KEY (org_id, line, pack_size);


--
-- Name: FieldTypes FieldTypes_pkey; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."FieldTypes"
    ADD CONSTRAINT "FieldTypes_pkey" PRIMARY KEY (code);


--
-- Name: Formulas Formulas_pkey; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Formulas"
    ADD CONSTRAINT "Formulas_pkey" PRIMARY KEY (id);


--
-- Name: GateChecklistTemplates GateChecklistTemplates_pkey; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."GateChecklistTemplates"
    ADD CONSTRAINT "GateChecklistTemplates_pkey" PRIMARY KEY (org_id, template_id, gate_code, sequence);


--
-- Name: Lines_By_PackSize Lines_By_PackSize_pkey; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Lines_By_PackSize"
    ADD CONSTRAINT "Lines_By_PackSize_pkey" PRIMARY KEY (org_id, line);


--
-- Name: ManufacturingOperations ManufacturingOperations_pkey; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."ManufacturingOperations"
    ADD CONSTRAINT "ManufacturingOperations_pkey" PRIMARY KEY (id);


--
-- Name: Nutrients Nutrients_pkey; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Nutrients"
    ADD CONSTRAINT "Nutrients_pkey" PRIMARY KEY (nutrient_code);


--
-- Name: PackSizes PackSizes_pkey; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."PackSizes"
    ADD CONSTRAINT "PackSizes_pkey" PRIMARY KEY (org_id, value);


--
-- Name: Rules Rules_pkey; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Rules"
    ADD CONSTRAINT "Rules_pkey" PRIMARY KEY (id);


--
-- Name: Templates Templates_pkey; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Templates"
    ADD CONSTRAINT "Templates_pkey" PRIMARY KEY (org_id, template_name);


--
-- Name: BriefFieldMapping brief_field_mapping_pk; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."BriefFieldMapping"
    ADD CONSTRAINT brief_field_mapping_pk PRIMARY KEY (org_id, brief_col);


--
-- Name: D365_Constants d365_constants_pk; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."D365_Constants"
    ADD CONSTRAINT d365_constants_pk PRIMARY KEY (org_id, constant_key);


--
-- Name: Departments departments_org_id_code_unique; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Departments"
    ADD CONSTRAINT departments_org_id_code_unique UNIQUE (org_id, code);


--
-- Name: DeptColumns dept_columns_org_dept_key_unique; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."DeptColumns"
    ADD CONSTRAINT dept_columns_org_dept_key_unique UNIQUE (org_id, dept_code, column_key);


--
-- Name: Formulas formulas_org_key_unique; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Formulas"
    ADD CONSTRAINT formulas_org_key_unique UNIQUE (org_id, formula_key);


--
-- Name: ManufacturingOperations manufacturing_operations_org_operation_name_unique; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."ManufacturingOperations"
    ADD CONSTRAINT manufacturing_operations_org_operation_name_unique UNIQUE (org_id, operation_name);


--
-- Name: ManufacturingOperations manufacturing_operations_org_process_suffix_unique; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."ManufacturingOperations"
    ADD CONSTRAINT manufacturing_operations_org_process_suffix_unique UNIQUE (org_id, process_suffix);


--
-- Name: ManufacturingOperations mfg_ops_org_industry_suffix_unique; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."ManufacturingOperations"
    ADD CONSTRAINT mfg_ops_org_industry_suffix_unique UNIQUE (org_id, industry_code, process_suffix);


--
-- Name: Allergens_by_RM reference_allergens_by_rm_org_ingredient_allergen_unique; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Allergens_by_RM"
    ADD CONSTRAINT reference_allergens_by_rm_org_ingredient_allergen_unique UNIQUE (org_id, ingredient_codes, allergen_code);


--
-- Name: Allergens reference_allergens_pk; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Allergens"
    ADD CONSTRAINT reference_allergens_pk PRIMARY KEY (org_id, allergen_code);


--
-- Name: Nutrients reference_nutrients_display_order_unique; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Nutrients"
    ADD CONSTRAINT reference_nutrients_display_order_unique UNIQUE (display_order);


--
-- Name: RawMaterials reference_raw_materials_pkey; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."RawMaterials"
    ADD CONSTRAINT reference_raw_materials_pkey PRIMARY KEY (org_id, rm_code);


--
-- Name: Rules rules_org_id_rule_id_version_unique; Type: CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Rules"
    ADD CONSTRAINT rules_org_id_rule_id_version_unique UNIQUE (org_id, rule_id, version);


--
-- Name: active_org_contexts active_org_contexts_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.active_org_contexts
    ADD CONSTRAINT active_org_contexts_pkey PRIMARY KEY (backend_pid);


--
-- Name: session_org_contexts session_org_contexts_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.session_org_contexts
    ADD CONSTRAINT session_org_contexts_pkey PRIMARY KEY (session_token);


--
-- Name: admin_ip_allowlist admin_ip_allowlist_org_cidr_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_ip_allowlist
    ADD CONSTRAINT admin_ip_allowlist_org_cidr_unique UNIQUE (org_id, cidr);


--
-- Name: admin_ip_allowlist admin_ip_allowlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_ip_allowlist
    ADD CONSTRAINT admin_ip_allowlist_pkey PRIMARY KEY (id);


--
-- Name: allergen_cascade_rebuild_jobs allergen_cascade_rebuild_jobs_dedup_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allergen_cascade_rebuild_jobs
    ADD CONSTRAINT allergen_cascade_rebuild_jobs_dedup_unique UNIQUE (org_id, product_code, source_event_id);


--
-- Name: allergen_cascade_rebuild_jobs allergen_cascade_rebuild_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allergen_cascade_rebuild_jobs
    ADD CONSTRAINT allergen_cascade_rebuild_jobs_pkey PRIMARY KEY (id);


--
-- Name: allergen_contamination_risk allergen_contamination_risk_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allergen_contamination_risk
    ADD CONSTRAINT allergen_contamination_risk_pkey PRIMARY KEY (id);


--
-- Name: allergens allergens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allergens
    ADD CONSTRAINT allergens_pkey PRIMARY KEY (code);


--
-- Name: audit_events audit_events_dept_column_denied_security_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.audit_events
    ADD CONSTRAINT audit_events_dept_column_denied_security_check CHECK (((action <> 'dept_column_denied'::text) OR ((after_state IS NOT NULL) AND (after_state ? 'dept_id'::text) AND (after_state ? 'column_key'::text) AND (after_state ? 'actor_user_id'::text)))) NOT VALID;


--
-- Name: CONSTRAINT audit_events_dept_column_denied_security_check ON audit_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT audit_events_dept_column_denied_security_check ON public.audit_events IS 'T-083: dept_column_denied audit events require dept_id, column_key, and actor_user_id in after_state';


--
-- Name: audit_events audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pk PRIMARY KEY (id, occurred_at);


--
-- Name: audit_log_2026_01 audit_log_2026_01_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_01
    ADD CONSTRAINT audit_log_2026_01_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: audit_log_2026_02 audit_log_2026_02_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_02
    ADD CONSTRAINT audit_log_2026_02_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: audit_log_2026_03 audit_log_2026_03_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_03
    ADD CONSTRAINT audit_log_2026_03_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: audit_log_2026_04 audit_log_2026_04_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_04
    ADD CONSTRAINT audit_log_2026_04_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: audit_log_2026_05 audit_log_2026_05_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_05
    ADD CONSTRAINT audit_log_2026_05_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: audit_log_2026_06 audit_log_2026_06_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_06
    ADD CONSTRAINT audit_log_2026_06_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: audit_log_2026_07 audit_log_2026_07_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_07
    ADD CONSTRAINT audit_log_2026_07_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: audit_log_2026_08 audit_log_2026_08_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_08
    ADD CONSTRAINT audit_log_2026_08_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: audit_log_2026_09 audit_log_2026_09_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_09
    ADD CONSTRAINT audit_log_2026_09_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: audit_log_2026_10 audit_log_2026_10_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_10
    ADD CONSTRAINT audit_log_2026_10_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: audit_log_2026_11 audit_log_2026_11_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_11
    ADD CONSTRAINT audit_log_2026_11_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: audit_log_2026_12 audit_log_2026_12_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_2026_12
    ADD CONSTRAINT audit_log_2026_12_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: bom_co_products bom_co_products_header_item_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_co_products
    ADD CONSTRAINT bom_co_products_header_item_unique UNIQUE (bom_header_id, co_product_item_id);


--
-- Name: bom_co_products bom_co_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_co_products
    ADD CONSTRAINT bom_co_products_pkey PRIMARY KEY (id);


--
-- Name: bom_generator_jobs bom_generator_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_generator_jobs
    ADD CONSTRAINT bom_generator_jobs_pkey PRIMARY KEY (id);


--
-- Name: bom_headers bom_headers_identity_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_headers
    ADD CONSTRAINT bom_headers_identity_unique UNIQUE (id, org_id);


--
-- Name: bom_headers bom_headers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_headers
    ADD CONSTRAINT bom_headers_pkey PRIMARY KEY (id);


--
-- Name: bom_item bom_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_item
    ADD CONSTRAINT bom_item_pkey PRIMARY KEY (id);


--
-- Name: bom_lines bom_lines_header_line_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_lines
    ADD CONSTRAINT bom_lines_header_line_unique UNIQUE (bom_header_id, line_no);


--
-- Name: bom_lines bom_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_lines
    ADD CONSTRAINT bom_lines_pkey PRIMARY KEY (id);


--
-- Name: bom_snapshots bom_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_snapshots
    ADD CONSTRAINT bom_snapshots_pkey PRIMARY KEY (id);


--
-- Name: brief brief_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brief
    ADD CONSTRAINT brief_id_org_unique UNIQUE (brief_id, org_id);


--
-- Name: brief_lines brief_lines_brief_line_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brief_lines
    ADD CONSTRAINT brief_lines_brief_line_unique UNIQUE (brief_id, line_type, line_index);


--
-- Name: brief_lines brief_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brief_lines
    ADD CONSTRAINT brief_lines_pkey PRIMARY KEY (id);


--
-- Name: brief brief_npd_project_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brief
    ADD CONSTRAINT brief_npd_project_unique UNIQUE (npd_project_id);


--
-- Name: brief brief_org_dev_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brief
    ADD CONSTRAINT brief_org_dev_code_unique UNIQUE (org_id, dev_code);


--
-- Name: brief brief_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brief
    ADD CONSTRAINT brief_pkey PRIMARY KEY (brief_id);


--
-- Name: brief_to_fa_audit brief_to_fa_audit_brief_field_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brief_to_fa_audit
    ADD CONSTRAINT brief_to_fa_audit_brief_field_unique UNIQUE (brief_id, field_name);


--
-- Name: brief_to_fa_audit brief_to_fa_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brief_to_fa_audit
    ADD CONSTRAINT brief_to_fa_audit_pkey PRIMARY KEY (id);


--
-- Name: capacity_plan_lines capacity_plan_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capacity_plan_lines
    ADD CONSTRAINT capacity_plan_lines_pkey PRIMARY KEY (id);


--
-- Name: capacity_plan_lines capacity_plan_lines_plan_resource_bucket_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capacity_plan_lines
    ADD CONSTRAINT capacity_plan_lines_plan_resource_bucket_unique UNIQUE (plan_id, resource_id, bucket_date);


--
-- Name: capacity_plans capacity_plans_org_plan_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capacity_plans
    ADD CONSTRAINT capacity_plans_org_plan_number_unique UNIQUE (org_id, plan_number);


--
-- Name: capacity_plans capacity_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capacity_plans
    ADD CONSTRAINT capacity_plans_pkey PRIMARY KEY (id);


--
-- Name: compliance_docs compliance_docs_org_product_doc_version_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_docs
    ADD CONSTRAINT compliance_docs_org_product_doc_version_unique UNIQUE (org_id, product_code, doc_type, version_number);


--
-- Name: compliance_docs compliance_docs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_docs
    ADD CONSTRAINT compliance_docs_pkey PRIMARY KEY (id);


--
-- Name: consumed_approval_tokens consumed_approval_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumed_approval_tokens
    ADD CONSTRAINT consumed_approval_tokens_pkey PRIMARY KEY (jti);


--
-- Name: costing_breakdowns costing_breakdowns_org_product_scenario_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.costing_breakdowns
    ADD CONSTRAINT costing_breakdowns_org_product_scenario_unique UNIQUE (org_id, product_code, scenario);


--
-- Name: costing_breakdowns costing_breakdowns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.costing_breakdowns
    ADD CONSTRAINT costing_breakdowns_pkey PRIMARY KEY (id);


--
-- Name: costing_waterfall_steps costing_waterfall_steps_breakdown_step_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.costing_waterfall_steps
    ADD CONSTRAINT costing_waterfall_steps_breakdown_step_unique UNIQUE (breakdown_id, step_index);


--
-- Name: costing_waterfall_steps costing_waterfall_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.costing_waterfall_steps
    ADD CONSTRAINT costing_waterfall_steps_pkey PRIMARY KEY (id);


--
-- Name: d365_import_cache d365_import_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.d365_import_cache
    ADD CONSTRAINT d365_import_cache_pkey PRIMARY KEY (org_id, code);


--
-- Name: d365_sync_dlq d365_sync_dlq_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.d365_sync_dlq
    ADD CONSTRAINT d365_sync_dlq_pkey PRIMARY KEY (id);


--
-- Name: d365_sync_jobs d365_sync_jobs_org_idempotency_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.d365_sync_jobs
    ADD CONSTRAINT d365_sync_jobs_org_idempotency_key_unique UNIQUE (org_id, idempotency_key);


--
-- Name: d365_sync_jobs d365_sync_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.d365_sync_jobs
    ADD CONSTRAINT d365_sync_jobs_pkey PRIMARY KEY (id);


--
-- Name: d365_sync_runs d365_sync_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.d365_sync_runs
    ADD CONSTRAINT d365_sync_runs_pkey PRIMARY KEY (id);


--
-- Name: dept_column_drafts dept_column_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dept_column_drafts
    ADD CONSTRAINT dept_column_drafts_pkey PRIMARY KEY (id);


--
-- Name: dept_column_migrations dept_column_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dept_column_migrations
    ADD CONSTRAINT dept_column_migrations_pkey PRIMARY KEY (id);


--
-- Name: e_sign_log e_sign_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.e_sign_log
    ADD CONSTRAINT e_sign_log_pkey PRIMARY KEY (signature_id);


--
-- Name: e_sign_log e_sign_log_signer_user_id_subject_hash_intent_nonce_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.e_sign_log
    ADD CONSTRAINT e_sign_log_signer_user_id_subject_hash_intent_nonce_key UNIQUE (signer_user_id, subject_hash, intent, nonce);


--
-- Name: email_delivery_log email_delivery_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_delivery_log
    ADD CONSTRAINT email_delivery_log_pkey PRIMARY KEY (id);


--
-- Name: fa_allergen_overrides fa_allergen_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_allergen_overrides
    ADD CONSTRAINT fa_allergen_overrides_pkey PRIMARY KEY (id);


--
-- Name: fa_builder_outputs fa_builder_outputs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_builder_outputs
    ADD CONSTRAINT fa_builder_outputs_pkey PRIMARY KEY (id);


--
-- Name: factory_release_status factory_release_status_bundle_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factory_release_status
    ADD CONSTRAINT factory_release_status_bundle_unique UNIQUE (org_id, project_id, product_code);


--
-- Name: factory_release_status factory_release_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factory_release_status
    ADD CONSTRAINT factory_release_status_pkey PRIMARY KEY (id);


--
-- Name: factory_specs factory_specs_org_fg_version_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factory_specs
    ADD CONSTRAINT factory_specs_org_fg_version_unique UNIQUE (org_id, fg_item_id, version);


--
-- Name: factory_specs factory_specs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factory_specs
    ADD CONSTRAINT factory_specs_pkey PRIMARY KEY (id);


--
-- Name: feature_flags_core feature_flags_core_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_flags_core
    ADD CONSTRAINT feature_flags_core_pkey PRIMARY KEY (org_id, flag_code);


--
-- Name: formulation_audit_log formulation_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_audit_log
    ADD CONSTRAINT formulation_audit_log_pkey PRIMARY KEY (id);


--
-- Name: formulation_calc_cache formulation_calc_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_calc_cache
    ADD CONSTRAINT formulation_calc_cache_pkey PRIMARY KEY (version_id);


--
-- Name: formulation_ingredients formulation_ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_ingredients
    ADD CONSTRAINT formulation_ingredients_pkey PRIMARY KEY (id);


--
-- Name: formulation_ingredients formulation_ingredients_version_sequence_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_ingredients
    ADD CONSTRAINT formulation_ingredients_version_sequence_unique UNIQUE (version_id, sequence);


--
-- Name: formulation_versions formulation_versions_formulation_version_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_versions
    ADD CONSTRAINT formulation_versions_formulation_version_unique UNIQUE (formulation_id, version_number);


--
-- Name: formulation_versions formulation_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_versions
    ADD CONSTRAINT formulation_versions_pkey PRIMARY KEY (id);


--
-- Name: formulations formulations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_pkey PRIMARY KEY (id);


--
-- Name: gate_approvals gate_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gate_approvals
    ADD CONSTRAINT gate_approvals_pkey PRIMARY KEY (id);


--
-- Name: gate_checklist_items gate_checklist_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gate_checklist_items
    ADD CONSTRAINT gate_checklist_items_pkey PRIMARY KEY (id);


--
-- Name: gdpr_erasure_requests gdpr_erasure_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gdpr_erasure_requests
    ADD CONSTRAINT gdpr_erasure_requests_pkey PRIMARY KEY (id);


--
-- Name: idempotency_keys idempotency_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idempotency_keys
    ADD CONSTRAINT idempotency_keys_pkey PRIMARY KEY (transaction_id);


--
-- Name: integration_settings integration_settings_org_category_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_settings
    ADD CONSTRAINT integration_settings_org_category_unique UNIQUE (org_id, category);


--
-- Name: integration_settings integration_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_settings
    ADD CONSTRAINT integration_settings_pkey PRIMARY KEY (id);


--
-- Name: iso4217 iso4217_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iso4217
    ADD CONSTRAINT iso4217_pkey PRIMARY KEY (code);


--
-- Name: item_allergen_profile_overrides item_allergen_profile_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_allergen_profile_overrides
    ADD CONSTRAINT item_allergen_profile_overrides_pkey PRIMARY KEY (id);


--
-- Name: item_allergen_profiles item_allergen_profiles_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_allergen_profiles
    ADD CONSTRAINT item_allergen_profiles_pk PRIMARY KEY (org_id, item_id, allergen_code);


--
-- Name: item_cost_history item_cost_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_cost_history
    ADD CONSTRAINT item_cost_history_pkey PRIMARY KEY (id);


--
-- Name: items items_org_item_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_org_item_code_unique UNIQUE (org_id, item_code);


--
-- Name: items items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);


--
-- Name: lab_results lab_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_results
    ADD CONSTRAINT lab_results_pkey PRIMARY KEY (id);


--
-- Name: line_machines line_machines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.line_machines
    ADD CONSTRAINT line_machines_pkey PRIMARY KEY (line_id, machine_id);


--
-- Name: locations locations_org_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_org_id_code_key UNIQUE (org_id, code);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: login_attempts login_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_attempts
    ADD CONSTRAINT login_attempts_pkey PRIMARY KEY (id);


--
-- Name: lot lot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lot
    ADD CONSTRAINT lot_pkey PRIMARY KEY (id);


--
-- Name: machines machines_org_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.machines
    ADD CONSTRAINT machines_org_id_code_key UNIQUE (org_id, code);


--
-- Name: machines machines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.machines
    ADD CONSTRAINT machines_pkey PRIMARY KEY (id);


--
-- Name: manufacturing_operation_allergen_additions manufacturing_operation_allergen_additions_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_operation_allergen_additions
    ADD CONSTRAINT manufacturing_operation_allergen_additions_pk PRIMARY KEY (org_id, manufacturing_operation_name, allergen_code);


--
-- Name: mfa_secrets mfa_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfa_secrets
    ADD CONSTRAINT mfa_secrets_pkey PRIMARY KEY (user_id);


--
-- Name: modules modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT modules_pkey PRIMARY KEY (code);


--
-- Name: mrp_planned_orders mrp_planned_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mrp_planned_orders
    ADD CONSTRAINT mrp_planned_orders_pkey PRIMARY KEY (id);


--
-- Name: mrp_requirements mrp_requirements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mrp_requirements
    ADD CONSTRAINT mrp_requirements_pkey PRIMARY KEY (id);


--
-- Name: mrp_requirements mrp_requirements_run_item_bucket_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mrp_requirements
    ADD CONSTRAINT mrp_requirements_run_item_bucket_unique UNIQUE (run_id, item_id, bucket_date, bom_level);


--
-- Name: mrp_runs mrp_runs_org_run_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mrp_runs
    ADD CONSTRAINT mrp_runs_org_run_number_unique UNIQUE (org_id, run_number);


--
-- Name: mrp_runs mrp_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mrp_runs
    ADD CONSTRAINT mrp_runs_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (user_id, org_id, category, event);


--
-- Name: npd_legacy_closeout npd_legacy_closeout_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npd_legacy_closeout
    ADD CONSTRAINT npd_legacy_closeout_pkey PRIMARY KEY (id);


--
-- Name: npd_legacy_closeout npd_legacy_closeout_project_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npd_legacy_closeout
    ADD CONSTRAINT npd_legacy_closeout_project_unique UNIQUE (npd_project_id);


--
-- Name: npd_projects npd_projects_org_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npd_projects
    ADD CONSTRAINT npd_projects_org_code_unique UNIQUE (org_id, code);


--
-- Name: npd_projects npd_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npd_projects
    ADD CONSTRAINT npd_projects_pkey PRIMARY KEY (id);


--
-- Name: nutri_score_results nutri_score_results_org_product_computed_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutri_score_results
    ADD CONSTRAINT nutri_score_results_org_product_computed_unique UNIQUE NULLS NOT DISTINCT (org_id, product_code, formulation_version_id, computed_at);


--
-- Name: nutri_score_results nutri_score_results_org_product_version_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutri_score_results
    ADD CONSTRAINT nutri_score_results_org_product_version_unique UNIQUE NULLS NOT DISTINCT (org_id, product_code, formulation_version_id);


--
-- Name: nutri_score_results nutri_score_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutri_score_results
    ADD CONSTRAINT nutri_score_results_pkey PRIMARY KEY (id);


--
-- Name: nutrition_allergens nutrition_allergens_org_product_allergen_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutrition_allergens
    ADD CONSTRAINT nutrition_allergens_org_product_allergen_unique UNIQUE NULLS NOT DISTINCT (org_id, product_code, formulation_version_id, allergen_code);


--
-- Name: nutrition_allergens nutrition_allergens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutrition_allergens
    ADD CONSTRAINT nutrition_allergens_pkey PRIMARY KEY (id);


--
-- Name: nutrition_profiles nutrition_profiles_org_product_version_nutrient_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutrition_profiles
    ADD CONSTRAINT nutrition_profiles_org_product_version_nutrient_unique UNIQUE NULLS NOT DISTINCT (org_id, product_code, formulation_version_id, nutrient_code);


--
-- Name: nutrition_profiles nutrition_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutrition_profiles
    ADD CONSTRAINT nutrition_profiles_pkey PRIMARY KEY (id);


--
-- Name: org_authorization_policies org_authorization_policies_org_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_authorization_policies
    ADD CONSTRAINT org_authorization_policies_org_code_unique UNIQUE (org_id, policy_code);


--
-- Name: org_authorization_policies org_authorization_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_authorization_policies
    ADD CONSTRAINT org_authorization_policies_pkey PRIMARY KEY (id);


--
-- Name: org_security_policies org_security_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_security_policies
    ADD CONSTRAINT org_security_policies_pkey PRIMARY KEY (org_id);


--
-- Name: org_sequences org_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sequences
    ADD CONSTRAINT org_sequences_pkey PRIMARY KEY (org_id, seq_name);


--
-- Name: organization_modules organization_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_modules
    ADD CONSTRAINT organization_modules_pkey PRIMARY KEY (org_id, module_code);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: outbox_dead_letter outbox_dead_letter_outbox_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_dead_letter
    ADD CONSTRAINT outbox_dead_letter_outbox_event_id_key UNIQUE (outbox_event_id);


--
-- Name: outbox_dead_letter outbox_dead_letter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_dead_letter
    ADD CONSTRAINT outbox_dead_letter_pkey PRIMARY KEY (id);


--
-- Name: outbox_events outbox_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_events
    ADD CONSTRAINT outbox_events_pkey PRIMARY KEY (id);


--
-- Name: password_history password_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_history
    ADD CONSTRAINT password_history_pkey PRIMARY KEY (id);


--
-- Name: prod_detail prod_detail_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prod_detail
    ADD CONSTRAINT prod_detail_pkey PRIMARY KEY (id);


--
-- Name: product product_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_pkey PRIMARY KEY (org_id, product_code);


--
-- Name: production_lines production_lines_org_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_lines
    ADD CONSTRAINT production_lines_org_id_code_key UNIQUE (org_id, code);


--
-- Name: production_lines production_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_lines
    ADD CONSTRAINT production_lines_pkey PRIMARY KEY (id);


--
-- Name: quality_event quality_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quality_event
    ADD CONSTRAINT quality_event_pkey PRIMARY KEY (id);


--
-- Name: recovery_codes recovery_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recovery_codes
    ADD CONSTRAINT recovery_codes_pkey PRIMARY KEY (id);


--
-- Name: reference_csv_import_reports reference_csv_import_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_csv_import_reports
    ADD CONSTRAINT reference_csv_import_reports_pkey PRIMARY KEY (id);


--
-- Name: reference_schemas reference_schemas_org_id_table_code_column_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_schemas
    ADD CONSTRAINT reference_schemas_org_id_table_code_column_code_key UNIQUE (org_id, table_code, column_code);


--
-- Name: reference_schemas reference_schemas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_schemas
    ADD CONSTRAINT reference_schemas_pkey PRIMARY KEY (id);


--
-- Name: reference_tables reference_tables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_tables
    ADD CONSTRAINT reference_tables_pkey PRIMARY KEY (org_id, table_code, row_key);


--
-- Name: reorder_thresholds reorder_thresholds_org_item_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reorder_thresholds
    ADD CONSTRAINT reorder_thresholds_org_item_unique UNIQUE (org_id, item_id);


--
-- Name: reorder_thresholds reorder_thresholds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reorder_thresholds
    ADD CONSTRAINT reorder_thresholds_pkey PRIMARY KEY (id);


--
-- Name: risks risks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risks
    ADD CONSTRAINT risks_pkey PRIMARY KEY (id);


--
-- Name: role_categories role_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_categories
    ADD CONSTRAINT role_categories_pkey PRIMARY KEY (role_code);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission);


--
-- Name: roles roles_org_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_org_id_slug_key UNIQUE (org_id, slug);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: routing_operations routing_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routing_operations
    ADD CONSTRAINT routing_operations_pkey PRIMARY KEY (id);


--
-- Name: routing_operations routing_operations_routing_op_no_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routing_operations
    ADD CONSTRAINT routing_operations_routing_op_no_unique UNIQUE (routing_id, op_no);


--
-- Name: routings routings_org_item_version_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routings
    ADD CONSTRAINT routings_org_item_version_unique UNIQUE (org_id, item_id, version);


--
-- Name: routings routings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routings
    ADD CONSTRAINT routings_pkey PRIMARY KEY (id);


--
-- Name: rule_definitions rule_definitions_org_id_rule_code_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_definitions
    ADD CONSTRAINT rule_definitions_org_id_rule_code_version_key UNIQUE (org_id, rule_code, version);


--
-- Name: rule_definitions rule_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_definitions
    ADD CONSTRAINT rule_definitions_pkey PRIMARY KEY (id);


--
-- Name: rule_dry_runs rule_dry_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_dry_runs
    ADD CONSTRAINT rule_dry_runs_pkey PRIMARY KEY (id);


--
-- Name: schedule_outputs schedule_outputs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_outputs
    ADD CONSTRAINT schedule_outputs_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (id);


--
-- Name: scim_group_members scim_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scim_group_members
    ADD CONSTRAINT scim_group_members_pkey PRIMARY KEY (group_id, user_id);


--
-- Name: scim_groups scim_groups_org_id_display_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scim_groups
    ADD CONSTRAINT scim_groups_org_id_display_name_key UNIQUE (org_id, display_name);


--
-- Name: scim_groups scim_groups_org_id_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scim_groups
    ADD CONSTRAINT scim_groups_org_id_external_id_key UNIQUE (org_id, external_id);


--
-- Name: scim_groups scim_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scim_groups
    ADD CONSTRAINT scim_groups_pkey PRIMARY KEY (id);


--
-- Name: scim_tokens scim_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scim_tokens
    ADD CONSTRAINT scim_tokens_pkey PRIMARY KEY (id);


--
-- Name: shipment shipment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment
    ADD CONSTRAINT shipment_pkey PRIMARY KEY (id);


--
-- Name: supplier_spec_review_proposals supplier_spec_review_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_spec_review_proposals
    ADD CONSTRAINT supplier_spec_review_proposals_pkey PRIMARY KEY (id);


--
-- Name: supplier_specs supplier_specs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_specs
    ADD CONSTRAINT supplier_specs_pkey PRIMARY KEY (id);


--
-- Name: tax_codes tax_codes_org_id_code_effective_from_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_codes
    ADD CONSTRAINT tax_codes_org_id_code_effective_from_key UNIQUE (org_id, code, effective_from);


--
-- Name: tax_codes tax_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_codes
    ADD CONSTRAINT tax_codes_pkey PRIMARY KEY (id);


--
-- Name: technical_sensory_evaluations technical_sensory_evaluations_org_subject_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technical_sensory_evaluations
    ADD CONSTRAINT technical_sensory_evaluations_org_subject_unique UNIQUE (org_id, subject_type, subject_ref);


--
-- Name: technical_sensory_evaluations technical_sensory_evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technical_sensory_evaluations
    ADD CONSTRAINT technical_sensory_evaluations_pkey PRIMARY KEY (id);


--
-- Name: tenant_idp_config tenant_idp_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_idp_config
    ADD CONSTRAINT tenant_idp_config_pkey PRIMARY KEY (tenant_id);


--
-- Name: tenant_migrations tenant_migrations_l2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_migrations
    ADD CONSTRAINT tenant_migrations_l2_pkey PRIMARY KEY (id);


--
-- Name: tenant_migrations_legacy_t038 tenant_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_migrations_legacy_t038
    ADD CONSTRAINT tenant_migrations_pkey PRIMARY KEY (tenant_id, component);


--
-- Name: tenant_variations tenant_variations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_variations
    ADD CONSTRAINT tenant_variations_pkey PRIMARY KEY (org_id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: unit_of_measure unit_of_measure_org_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_of_measure
    ADD CONSTRAINT unit_of_measure_org_code_unique UNIQUE (org_id, code);


--
-- Name: unit_of_measure unit_of_measure_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_of_measure
    ADD CONSTRAINT unit_of_measure_pkey PRIMARY KEY (id);


--
-- Name: uom_custom_conversions uom_custom_conversions_org_label_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uom_custom_conversions
    ADD CONSTRAINT uom_custom_conversions_org_label_unique UNIQUE (org_id, label);


--
-- Name: uom_custom_conversions uom_custom_conversions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uom_custom_conversions
    ADD CONSTRAINT uom_custom_conversions_pkey PRIMARY KEY (id);


--
-- Name: user_pins user_pins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_pins
    ADD CONSTRAINT user_pins_pkey PRIMARY KEY (user_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_org_id_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_org_id_email_unique UNIQUE (org_id, email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: warehouses warehouses_org_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_org_id_code_key UNIQUE (org_id, code);


--
-- Name: warehouses warehouses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_pkey PRIMARY KEY (id);


--
-- Name: wo_dependencies wo_dependencies_org_parent_child_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_dependencies
    ADD CONSTRAINT wo_dependencies_org_parent_child_unique UNIQUE (org_id, parent_wo_id, child_wo_id);


--
-- Name: wo_dependencies wo_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_dependencies
    ADD CONSTRAINT wo_dependencies_pkey PRIMARY KEY (id);


--
-- Name: wo_materials wo_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_materials
    ADD CONSTRAINT wo_materials_pkey PRIMARY KEY (id);


--
-- Name: wo_operations wo_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_operations
    ADD CONSTRAINT wo_operations_pkey PRIMARY KEY (id);


--
-- Name: wo_operations wo_operations_wo_sequence_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_operations
    ADD CONSTRAINT wo_operations_wo_sequence_unique UNIQUE (wo_id, sequence);


--
-- Name: wo_status_history wo_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_status_history
    ADD CONSTRAINT wo_status_history_pkey PRIMARY KEY (id);


--
-- Name: work_order work_order_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order
    ADD CONSTRAINT work_order_pkey PRIMARY KEY (id);


--
-- Name: work_orders work_orders_org_wo_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_org_wo_number_unique UNIQUE (org_id, wo_number);


--
-- Name: work_orders work_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_pkey PRIMARY KEY (id);


--
-- Name: alert_thresholds_org_key_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX alert_thresholds_org_key_idx ON "Reference"."AlertThresholds" USING btree (org_id, threshold_key);


--
-- Name: approval_chain_templates_org_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX approval_chain_templates_org_idx ON "Reference"."ApprovalChainTemplates" USING btree (org_id);


--
-- Name: brief_field_mapping_org_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX brief_field_mapping_org_idx ON "Reference"."BriefFieldMapping" USING btree (org_id);


--
-- Name: close_confirm_org_id_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX close_confirm_org_id_idx ON "Reference"."CloseConfirm" USING btree (org_id);


--
-- Name: d365_constants_org_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX d365_constants_org_idx ON "Reference"."D365_Constants" USING btree (org_id);


--
-- Name: departments_org_id_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX departments_org_id_idx ON "Reference"."Departments" USING btree (org_id);


--
-- Name: dept_columns_org_dept_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX dept_columns_org_dept_idx ON "Reference"."DeptColumns" USING btree (org_id, dept_code);


--
-- Name: dept_columns_schema_version_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX dept_columns_schema_version_idx ON "Reference"."DeptColumns" USING btree (org_id, dept_code, schema_version);


--
-- Name: equipment_setup_by_line_pack_org_id_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX equipment_setup_by_line_pack_org_id_idx ON "Reference"."Equipment_Setup_By_Line_Pack" USING btree (org_id);


--
-- Name: formulas_org_id_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX formulas_org_id_idx ON "Reference"."Formulas" USING btree (org_id);


--
-- Name: gate_checklist_templates_seed_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX gate_checklist_templates_seed_idx ON "Reference"."GateChecklistTemplates" USING btree (org_id, template_id, gate_code);


--
-- Name: lines_by_pack_size_org_id_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX lines_by_pack_size_org_id_idx ON "Reference"."Lines_By_PackSize" USING btree (org_id);


--
-- Name: lines_by_pack_size_supported_pack_sizes_gin_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX lines_by_pack_size_supported_pack_sizes_gin_idx ON "Reference"."Lines_By_PackSize" USING gin (supported_pack_sizes);


--
-- Name: manufacturing_operations_org_industry_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX manufacturing_operations_org_industry_idx ON "Reference"."ManufacturingOperations" USING btree (org_id, industry_code);


--
-- Name: mfg_ops_org_id_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX mfg_ops_org_id_idx ON "Reference"."ManufacturingOperations" USING btree (org_id);


--
-- Name: mfg_ops_org_industry_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX mfg_ops_org_industry_idx ON "Reference"."ManufacturingOperations" USING btree (org_id, industry_code);


--
-- Name: pack_sizes_org_id_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX pack_sizes_org_id_idx ON "Reference"."PackSizes" USING btree (org_id);


--
-- Name: reference_allergens_added_by_process_org_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX reference_allergens_added_by_process_org_idx ON "Reference"."Allergens_added_by_Process" USING btree (org_id);


--
-- Name: reference_allergens_added_by_process_process_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX reference_allergens_added_by_process_process_idx ON "Reference"."Allergens_added_by_Process" USING btree (org_id, process_name);


--
-- Name: reference_allergens_by_rm_ingredient_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX reference_allergens_by_rm_ingredient_idx ON "Reference"."Allergens_by_RM" USING btree (org_id, ingredient_codes);


--
-- Name: reference_allergens_by_rm_org_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX reference_allergens_by_rm_org_idx ON "Reference"."Allergens_by_RM" USING btree (org_id);


--
-- Name: reference_allergens_org_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX reference_allergens_org_idx ON "Reference"."Allergens" USING btree (org_id);


--
-- Name: reference_raw_materials_org_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX reference_raw_materials_org_idx ON "Reference"."RawMaterials" USING btree (org_id);


--
-- Name: rules_active_range_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX rules_active_range_idx ON "Reference"."Rules" USING btree (org_id, active_from, active_to);


--
-- Name: rules_org_id_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX rules_org_id_idx ON "Reference"."Rules" USING btree (org_id);


--
-- Name: rules_rule_type_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX rules_rule_type_idx ON "Reference"."Rules" USING btree (rule_type);


--
-- Name: templates_org_id_idx; Type: INDEX; Schema: Reference; Owner: -
--

CREATE INDEX templates_org_id_idx ON "Reference"."Templates" USING btree (org_id);


--
-- Name: session_org_contexts_created_at_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX session_org_contexts_created_at_idx ON app.session_org_contexts USING btree (created_at);


--
-- Name: admin_ip_allowlist_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_ip_allowlist_org_created_idx ON public.admin_ip_allowlist USING btree (org_id, created_at DESC);


--
-- Name: allergen_cascade_rebuild_jobs_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX allergen_cascade_rebuild_jobs_pending_idx ON public.allergen_cascade_rebuild_jobs USING btree (org_id, run_after, created_at) WHERE (processed_at IS NULL);


--
-- Name: audit_events_org_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_org_occurred_idx ON public.audit_events USING btree (org_id, occurred_at);


--
-- Name: audit_events_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_request_id_idx ON public.audit_events USING btree (request_id);


--
-- Name: audit_events_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_resource_idx ON public.audit_events USING btree (resource_type, resource_id);


--
-- Name: audit_log_org_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_org_occurred_idx ON ONLY public.audit_log USING btree (org_id, occurred_at);


--
-- Name: audit_log_2026_01_org_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_01_org_id_occurred_at_idx ON public.audit_log_2026_01 USING btree (org_id, occurred_at);


--
-- Name: audit_log_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_request_id_idx ON ONLY public.audit_log USING btree (request_id);


--
-- Name: audit_log_2026_01_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_01_request_id_idx ON public.audit_log_2026_01 USING btree (request_id);


--
-- Name: audit_log_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_resource_idx ON ONLY public.audit_log USING btree (resource_type, resource_id, occurred_at);


--
-- Name: audit_log_2026_01_resource_type_resource_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_01_resource_type_resource_id_occurred_at_idx ON public.audit_log_2026_01 USING btree (resource_type, resource_id, occurred_at);


--
-- Name: audit_log_2026_02_org_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_02_org_id_occurred_at_idx ON public.audit_log_2026_02 USING btree (org_id, occurred_at);


--
-- Name: audit_log_2026_02_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_02_request_id_idx ON public.audit_log_2026_02 USING btree (request_id);


--
-- Name: audit_log_2026_02_resource_type_resource_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_02_resource_type_resource_id_occurred_at_idx ON public.audit_log_2026_02 USING btree (resource_type, resource_id, occurred_at);


--
-- Name: audit_log_2026_03_org_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_03_org_id_occurred_at_idx ON public.audit_log_2026_03 USING btree (org_id, occurred_at);


--
-- Name: audit_log_2026_03_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_03_request_id_idx ON public.audit_log_2026_03 USING btree (request_id);


--
-- Name: audit_log_2026_03_resource_type_resource_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_03_resource_type_resource_id_occurred_at_idx ON public.audit_log_2026_03 USING btree (resource_type, resource_id, occurred_at);


--
-- Name: audit_log_2026_04_org_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_04_org_id_occurred_at_idx ON public.audit_log_2026_04 USING btree (org_id, occurred_at);


--
-- Name: audit_log_2026_04_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_04_request_id_idx ON public.audit_log_2026_04 USING btree (request_id);


--
-- Name: audit_log_2026_04_resource_type_resource_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_04_resource_type_resource_id_occurred_at_idx ON public.audit_log_2026_04 USING btree (resource_type, resource_id, occurred_at);


--
-- Name: audit_log_2026_05_org_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_05_org_id_occurred_at_idx ON public.audit_log_2026_05 USING btree (org_id, occurred_at);


--
-- Name: audit_log_2026_05_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_05_request_id_idx ON public.audit_log_2026_05 USING btree (request_id);


--
-- Name: audit_log_2026_05_resource_type_resource_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_05_resource_type_resource_id_occurred_at_idx ON public.audit_log_2026_05 USING btree (resource_type, resource_id, occurred_at);


--
-- Name: audit_log_2026_06_org_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_06_org_id_occurred_at_idx ON public.audit_log_2026_06 USING btree (org_id, occurred_at);


--
-- Name: audit_log_2026_06_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_06_request_id_idx ON public.audit_log_2026_06 USING btree (request_id);


--
-- Name: audit_log_2026_06_resource_type_resource_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_06_resource_type_resource_id_occurred_at_idx ON public.audit_log_2026_06 USING btree (resource_type, resource_id, occurred_at);


--
-- Name: audit_log_2026_07_org_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_07_org_id_occurred_at_idx ON public.audit_log_2026_07 USING btree (org_id, occurred_at);


--
-- Name: audit_log_2026_07_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_07_request_id_idx ON public.audit_log_2026_07 USING btree (request_id);


--
-- Name: audit_log_2026_07_resource_type_resource_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_07_resource_type_resource_id_occurred_at_idx ON public.audit_log_2026_07 USING btree (resource_type, resource_id, occurred_at);


--
-- Name: audit_log_2026_08_org_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_08_org_id_occurred_at_idx ON public.audit_log_2026_08 USING btree (org_id, occurred_at);


--
-- Name: audit_log_2026_08_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_08_request_id_idx ON public.audit_log_2026_08 USING btree (request_id);


--
-- Name: audit_log_2026_08_resource_type_resource_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_08_resource_type_resource_id_occurred_at_idx ON public.audit_log_2026_08 USING btree (resource_type, resource_id, occurred_at);


--
-- Name: audit_log_2026_09_org_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_09_org_id_occurred_at_idx ON public.audit_log_2026_09 USING btree (org_id, occurred_at);


--
-- Name: audit_log_2026_09_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_09_request_id_idx ON public.audit_log_2026_09 USING btree (request_id);


--
-- Name: audit_log_2026_09_resource_type_resource_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_09_resource_type_resource_id_occurred_at_idx ON public.audit_log_2026_09 USING btree (resource_type, resource_id, occurred_at);


--
-- Name: audit_log_2026_10_org_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_10_org_id_occurred_at_idx ON public.audit_log_2026_10 USING btree (org_id, occurred_at);


--
-- Name: audit_log_2026_10_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_10_request_id_idx ON public.audit_log_2026_10 USING btree (request_id);


--
-- Name: audit_log_2026_10_resource_type_resource_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_10_resource_type_resource_id_occurred_at_idx ON public.audit_log_2026_10 USING btree (resource_type, resource_id, occurred_at);


--
-- Name: audit_log_2026_11_org_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_11_org_id_occurred_at_idx ON public.audit_log_2026_11 USING btree (org_id, occurred_at);


--
-- Name: audit_log_2026_11_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_11_request_id_idx ON public.audit_log_2026_11 USING btree (request_id);


--
-- Name: audit_log_2026_11_resource_type_resource_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_11_resource_type_resource_id_occurred_at_idx ON public.audit_log_2026_11 USING btree (resource_type, resource_id, occurred_at);


--
-- Name: audit_log_2026_12_org_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_12_org_id_occurred_at_idx ON public.audit_log_2026_12 USING btree (org_id, occurred_at);


--
-- Name: audit_log_2026_12_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_12_request_id_idx ON public.audit_log_2026_12 USING btree (request_id);


--
-- Name: audit_log_2026_12_resource_type_resource_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_2026_12_resource_type_resource_id_occurred_at_idx ON public.audit_log_2026_12 USING btree (resource_type, resource_id, occurred_at);


--
-- Name: bom_co_products_org_header_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bom_co_products_org_header_idx ON public.bom_co_products USING btree (org_id, bom_header_id);


--
-- Name: bom_co_products_org_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bom_co_products_org_item_idx ON public.bom_co_products USING btree (org_id, co_product_item_id);


--
-- Name: bom_co_products_org_site_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bom_co_products_org_site_idx ON public.bom_co_products USING btree (org_id, site_id);


--
-- Name: bom_generator_jobs_org_site_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bom_generator_jobs_org_site_idx ON public.bom_generator_jobs USING btree (org_id, site_id);


--
-- Name: bom_generator_jobs_org_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bom_generator_jobs_org_status_idx ON public.bom_generator_jobs USING btree (org_id, status, created_at);


--
-- Name: bom_headers_active_version_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX bom_headers_active_version_idx ON public.bom_headers USING btree (org_id, product_id) WHERE ((status = 'active'::text) AND (product_id IS NOT NULL));


--
-- Name: bom_headers_org_npd_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bom_headers_org_npd_project_idx ON public.bom_headers USING btree (org_id, npd_project_id, status, version DESC) WHERE (npd_project_id IS NOT NULL);


--
-- Name: bom_headers_org_npd_project_version_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX bom_headers_org_npd_project_version_unique ON public.bom_headers USING btree (org_id, npd_project_id, version) WHERE ((npd_project_id IS NOT NULL) AND (product_id IS NULL));


--
-- Name: bom_headers_org_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bom_headers_org_product_idx ON public.bom_headers USING btree (org_id, product_id, status, version DESC) WHERE (product_id IS NOT NULL);


--
-- Name: bom_headers_org_product_version_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX bom_headers_org_product_version_unique ON public.bom_headers USING btree (org_id, product_id, version) WHERE (product_id IS NOT NULL);


--
-- Name: bom_headers_technical_approval_queue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bom_headers_technical_approval_queue_idx ON public.bom_headers USING btree (org_id, status, technical_review_requested_at, created_at) WHERE (status = ANY (ARRAY['in_review'::text, 'technical_approved'::text]));


--
-- Name: bom_item_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bom_item_org_created_idx ON public.bom_item USING btree (org_id, created_at DESC);


--
-- Name: bom_lines_org_component_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bom_lines_org_component_idx ON public.bom_lines USING btree (org_id, component_code);


--
-- Name: bom_lines_org_header_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bom_lines_org_header_idx ON public.bom_lines USING btree (org_id, bom_header_id, line_no);


--
-- Name: bom_lines_org_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bom_lines_org_item_idx ON public.bom_lines USING btree (org_id, item_id) WHERE (item_id IS NOT NULL);


--
-- Name: bom_snapshots_org_header_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bom_snapshots_org_header_idx ON public.bom_snapshots USING btree (org_id, bom_header_id);


--
-- Name: bom_snapshots_org_site_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bom_snapshots_org_site_idx ON public.bom_snapshots USING btree (org_id, site_id);


--
-- Name: brief_lines_brief_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brief_lines_brief_order_idx ON public.brief_lines USING btree (brief_id, line_index);


--
-- Name: brief_lines_org_brief_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brief_lines_org_brief_idx ON public.brief_lines USING btree (org_id, brief_id);


--
-- Name: brief_org_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brief_org_project_idx ON public.brief USING btree (org_id, npd_project_id);


--
-- Name: brief_org_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brief_org_status_idx ON public.brief USING btree (org_id, status);


--
-- Name: brief_to_fa_audit_org_brief_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brief_to_fa_audit_org_brief_idx ON public.brief_to_fa_audit USING btree (org_id, brief_id);


--
-- Name: compliance_docs_org_expires_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX compliance_docs_org_expires_active_idx ON public.compliance_docs USING btree (org_id, expires_at) WHERE ((deleted_at IS NULL) AND (expires_at IS NOT NULL));


--
-- Name: compliance_docs_org_expiry_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX compliance_docs_org_expiry_state_idx ON public.compliance_docs USING btree (org_id, expiry_state) WHERE (deleted_at IS NULL);


--
-- Name: compliance_docs_org_product_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX compliance_docs_org_product_active_idx ON public.compliance_docs USING btree (org_id, product_code) WHERE (deleted_at IS NULL);


--
-- Name: consumed_approval_tokens_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX consumed_approval_tokens_org_idx ON public.consumed_approval_tokens USING btree (org_id, consumed_at);


--
-- Name: costing_breakdowns_org_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX costing_breakdowns_org_product_idx ON public.costing_breakdowns USING btree (org_id, product_code);


--
-- Name: costing_breakdowns_product_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX costing_breakdowns_product_code_idx ON public.costing_breakdowns USING btree (product_code);


--
-- Name: costing_waterfall_steps_breakdown_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX costing_waterfall_steps_breakdown_idx ON public.costing_waterfall_steps USING btree (breakdown_id);


--
-- Name: d365_import_cache_org_last_synced_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX d365_import_cache_org_last_synced_idx ON public.d365_import_cache USING btree (org_id, last_synced_at DESC);


--
-- Name: d365_import_cache_org_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX d365_import_cache_org_status_idx ON public.d365_import_cache USING btree (org_id, status);


--
-- Name: d365_sync_runs_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX d365_sync_runs_org_idx ON public.d365_sync_runs USING btree (org_id);


--
-- Name: d365_sync_runs_org_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX d365_sync_runs_org_started_idx ON public.d365_sync_runs USING btree (org_id, started_at DESC);


--
-- Name: dept_column_drafts_active_draft_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX dept_column_drafts_active_draft_uq ON public.dept_column_drafts USING btree (org_id, dept_id, column_key) WHERE (status = 'draft'::text);


--
-- Name: dept_column_drafts_org_dept_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dept_column_drafts_org_dept_idx ON public.dept_column_drafts USING btree (org_id, dept_id);


--
-- Name: dept_column_drafts_org_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dept_column_drafts_org_status_idx ON public.dept_column_drafts USING btree (org_id, status);


--
-- Name: dept_column_migrations_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dept_column_migrations_org_idx ON public.dept_column_migrations USING btree (org_id);


--
-- Name: dept_column_migrations_unique_per_version; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX dept_column_migrations_unique_per_version ON public.dept_column_migrations USING btree (dept_column_id, new_version);


--
-- Name: e_sign_log_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX e_sign_log_org_created_idx ON public.e_sign_log USING btree (org_id, created_at);


--
-- Name: e_sign_log_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX e_sign_log_subject_idx ON public.e_sign_log USING btree (org_id, subject_hash, intent);


--
-- Name: email_delivery_log_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_delivery_log_org_created_idx ON public.email_delivery_log USING btree (org_id, created_at DESC);


--
-- Name: email_delivery_log_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_delivery_log_org_idx ON public.email_delivery_log USING btree (org_id);


--
-- Name: email_delivery_log_org_trigger_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_delivery_log_org_trigger_idx ON public.email_delivery_log USING btree (org_id, trigger_code);


--
-- Name: fa_allergen_overrides_current_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fa_allergen_overrides_current_idx ON public.fa_allergen_overrides USING btree (org_id, product_code, allergen_code) WHERE (superseded_at IS NULL);


--
-- Name: fa_allergen_overrides_history_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fa_allergen_overrides_history_idx ON public.fa_allergen_overrides USING btree (org_id, product_code, created_at DESC);


--
-- Name: fa_allergen_overrides_supersedes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fa_allergen_overrides_supersedes_idx ON public.fa_allergen_overrides USING btree (supersedes_id) WHERE (supersedes_id IS NOT NULL);


--
-- Name: fa_builder_outputs_current_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fa_builder_outputs_current_idx ON public.fa_builder_outputs USING btree (org_id, product_code, generated_at DESC) WHERE (superseded_at IS NULL);


--
-- Name: fa_builder_outputs_file_path_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX fa_builder_outputs_file_path_unique ON public.fa_builder_outputs USING btree (file_path);


--
-- Name: fa_builder_outputs_history_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fa_builder_outputs_history_idx ON public.fa_builder_outputs USING btree (org_id, product_code, generated_at DESC);


--
-- Name: factory_release_status_org_product_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX factory_release_status_org_product_code_idx ON public.factory_release_status USING btree (org_id, product_code);


--
-- Name: factory_release_status_org_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX factory_release_status_org_project_idx ON public.factory_release_status USING btree (org_id, project_id);


--
-- Name: factory_release_status_org_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX factory_release_status_org_status_idx ON public.factory_release_status USING btree (org_id, release_status, product_code);


--
-- Name: factory_release_status_org_usable_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX factory_release_status_org_usable_idx ON public.factory_release_status USING btree (org_id, product_code, active_bom_header_id, active_factory_spec_id) WHERE (release_status = ANY (ARRAY['approved_for_factory'::text, 'released_to_factory'::text]));


--
-- Name: factory_specs_one_active_approved_per_fg; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX factory_specs_one_active_approved_per_fg ON public.factory_specs USING btree (org_id, fg_item_id) WHERE (status = 'approved_for_factory'::text);


--
-- Name: factory_specs_one_released_per_fg; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX factory_specs_one_released_per_fg ON public.factory_specs USING btree (org_id, fg_item_id) WHERE (status = 'released_to_factory'::text);


--
-- Name: feature_flags_core_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feature_flags_core_org_idx ON public.feature_flags_core USING btree (org_id);


--
-- Name: formulation_audit_log_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX formulation_audit_log_org_created_idx ON public.formulation_audit_log USING btree (org_id, created_at DESC);


--
-- Name: formulation_ingredients_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX formulation_ingredients_item_id_idx ON public.formulation_ingredients USING btree (item_id) WHERE (item_id IS NOT NULL);


--
-- Name: formulation_ingredients_version_sequence_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX formulation_ingredients_version_sequence_idx ON public.formulation_ingredients USING btree (version_id, sequence);


--
-- Name: formulation_versions_formulation_version_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX formulation_versions_formulation_version_idx ON public.formulation_versions USING btree (formulation_id, version_number);


--
-- Name: formulations_org_product_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX formulations_org_product_code_idx ON public.formulations USING btree (org_id, product_code);


--
-- Name: formulations_org_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX formulations_org_project_idx ON public.formulations USING btree (org_id, project_id);


--
-- Name: gate_approvals_org_project_gate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gate_approvals_org_project_gate_idx ON public.gate_approvals USING btree (org_id, project_id, gate_code);


--
-- Name: gate_checklist_items_org_project_gate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gate_checklist_items_org_project_gate_idx ON public.gate_checklist_items USING btree (org_id, project_id, gate_code);


--
-- Name: gdpr_erasure_requests_org_requested_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gdpr_erasure_requests_org_requested_idx ON public.gdpr_erasure_requests USING btree (org_id, requested_at);


--
-- Name: gdpr_erasure_requests_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gdpr_erasure_requests_pending_idx ON public.gdpr_erasure_requests USING btree (requested_at, id) WHERE (status = 'pending'::text);


--
-- Name: idempotency_keys_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idempotency_keys_expires_at_idx ON public.idempotency_keys USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idempotency_keys_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idempotency_keys_org_id_idx ON public.idempotency_keys USING btree (org_id);


--
-- Name: idx_allergen_contamination_risk_allergen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_allergen_contamination_risk_allergen ON public.allergen_contamination_risk USING btree (org_id, allergen_code);


--
-- Name: idx_allergen_contamination_risk_assessed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_allergen_contamination_risk_assessed_by ON public.allergen_contamination_risk USING btree (assessed_by) WHERE (assessed_by IS NOT NULL);


--
-- Name: idx_allergen_contamination_risk_line; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_allergen_contamination_risk_line ON public.allergen_contamination_risk USING btree (line_id) WHERE (line_id IS NOT NULL);


--
-- Name: idx_allergen_contamination_risk_machine; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_allergen_contamination_risk_machine ON public.allergen_contamination_risk USING btree (machine_id) WHERE (machine_id IS NOT NULL);


--
-- Name: idx_allergen_contamination_risk_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_allergen_contamination_risk_org ON public.allergen_contamination_risk USING btree (org_id);


--
-- Name: idx_bom_snapshots_wo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bom_snapshots_wo ON public.bom_snapshots USING btree (org_id, work_order_id);


--
-- Name: idx_capacity_plan_lines_org_resource_bucket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_capacity_plan_lines_org_resource_bucket ON public.capacity_plan_lines USING btree (org_id, resource_id, bucket_date);


--
-- Name: idx_capacity_plan_lines_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_capacity_plan_lines_plan ON public.capacity_plan_lines USING btree (plan_id);


--
-- Name: idx_capacity_plans_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_capacity_plans_created_by ON public.capacity_plans USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_capacity_plans_mrp_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_capacity_plans_mrp_run ON public.capacity_plans USING btree (mrp_run_id) WHERE (mrp_run_id IS NOT NULL);


--
-- Name: idx_capacity_plans_org_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_capacity_plans_org_site ON public.capacity_plans USING btree (org_id, site_id);


--
-- Name: idx_capacity_plans_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_capacity_plans_org_status ON public.capacity_plans USING btree (org_id, status);


--
-- Name: idx_d365_sync_dlq_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_d365_sync_dlq_job ON public.d365_sync_dlq USING btree (job_id) WHERE (job_id IS NOT NULL);


--
-- Name: idx_d365_sync_dlq_org_status_failed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_d365_sync_dlq_org_status_failed ON public.d365_sync_dlq USING btree (org_id, status, failed_at);


--
-- Name: idx_d365_sync_jobs_d365_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_d365_sync_jobs_d365_item ON public.d365_sync_jobs USING btree (org_id, d365_item_id) WHERE (d365_item_id IS NOT NULL);


--
-- Name: idx_d365_sync_jobs_org_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_d365_sync_jobs_org_idempotency ON public.d365_sync_jobs USING btree (org_id, idempotency_key);


--
-- Name: idx_d365_sync_jobs_org_next_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_d365_sync_jobs_org_next_retry ON public.d365_sync_jobs USING btree (org_id, next_retry_at) WHERE (next_retry_at IS NOT NULL);


--
-- Name: idx_d365_sync_jobs_org_status_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_d365_sync_jobs_org_status_scheduled ON public.d365_sync_jobs USING btree (org_id, status, scheduled_at);


--
-- Name: idx_factory_specs_bom_header; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_factory_specs_bom_header ON public.factory_specs USING btree (org_id, bom_header_id) WHERE (bom_header_id IS NOT NULL);


--
-- Name: idx_factory_specs_d365; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_factory_specs_d365 ON public.factory_specs USING btree (org_id, d365_item_id) WHERE (d365_item_id IS NOT NULL);


--
-- Name: idx_factory_specs_org_fg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_factory_specs_org_fg ON public.factory_specs USING btree (org_id, fg_item_id, version DESC);


--
-- Name: idx_factory_specs_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_factory_specs_org_status ON public.factory_specs USING btree (org_id, status, fg_item_id);


--
-- Name: idx_item_allergen_profile_overrides_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_allergen_profile_overrides_actor ON public.item_allergen_profile_overrides USING btree (overridden_by) WHERE (overridden_by IS NOT NULL);


--
-- Name: idx_item_allergen_profile_overrides_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_allergen_profile_overrides_history ON public.item_allergen_profile_overrides USING btree (org_id, item_id, allergen_code, overridden_at DESC);


--
-- Name: idx_item_allergen_profile_overrides_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_allergen_profile_overrides_org ON public.item_allergen_profile_overrides USING btree (org_id);


--
-- Name: idx_item_allergen_profiles_allergen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_allergen_profiles_allergen ON public.item_allergen_profiles USING btree (org_id, allergen_code);


--
-- Name: idx_item_allergen_profiles_declared_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_allergen_profiles_declared_by ON public.item_allergen_profiles USING btree (declared_by) WHERE (declared_by IS NOT NULL);


--
-- Name: idx_item_allergen_profiles_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_allergen_profiles_item ON public.item_allergen_profiles USING btree (org_id, item_id);


--
-- Name: idx_item_allergen_profiles_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_allergen_profiles_org ON public.item_allergen_profiles USING btree (org_id);


--
-- Name: idx_item_cost_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_item_cost_active ON public.item_cost_history USING btree (org_id, item_id, effective_from DESC);


--
-- Name: idx_items_d365; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_d365 ON public.items USING btree (org_id, d365_item_id) WHERE (d365_item_id IS NOT NULL);


--
-- Name: idx_items_ext_jsonb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_ext_jsonb ON public.items USING gin (ext_jsonb);


--
-- Name: idx_items_org_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_items_org_type ON public.items USING btree (org_id, item_type, status);


--
-- Name: idx_lab_results_org_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lab_results_org_item ON public.lab_results USING btree (org_id, item_id);


--
-- Name: idx_lab_results_org_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lab_results_org_site ON public.lab_results USING btree (org_id, site_id);


--
-- Name: idx_lab_results_org_test_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lab_results_org_test_type ON public.lab_results USING btree (org_id, test_type, result_status);


--
-- Name: idx_lab_results_org_work_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lab_results_org_work_order ON public.lab_results USING btree (org_id, work_order_id) WHERE (work_order_id IS NOT NULL);


--
-- Name: idx_manufacturing_operation_allergen_additions_allergen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_manufacturing_operation_allergen_additions_allergen ON public.manufacturing_operation_allergen_additions USING btree (org_id, allergen_code);


--
-- Name: idx_manufacturing_operation_allergen_additions_op; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_manufacturing_operation_allergen_additions_op ON public.manufacturing_operation_allergen_additions USING btree (org_id, manufacturing_operation_name);


--
-- Name: idx_manufacturing_operation_allergen_additions_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_manufacturing_operation_allergen_additions_org ON public.manufacturing_operation_allergen_additions USING btree (org_id);


--
-- Name: idx_mrp_planned_orders_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mrp_planned_orders_item ON public.mrp_planned_orders USING btree (item_id);


--
-- Name: idx_mrp_planned_orders_org_item_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mrp_planned_orders_org_item_due ON public.mrp_planned_orders USING btree (org_id, item_id, due_date);


--
-- Name: idx_mrp_planned_orders_release_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mrp_planned_orders_release_status ON public.mrp_planned_orders USING btree (org_id, release_status);


--
-- Name: idx_mrp_planned_orders_requirement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mrp_planned_orders_requirement ON public.mrp_planned_orders USING btree (requirement_id) WHERE (requirement_id IS NOT NULL);


--
-- Name: idx_mrp_planned_orders_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mrp_planned_orders_run ON public.mrp_planned_orders USING btree (run_id);


--
-- Name: idx_mrp_planned_orders_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mrp_planned_orders_supplier ON public.mrp_planned_orders USING btree (supplier_id) WHERE (supplier_id IS NOT NULL);


--
-- Name: idx_mrp_requirements_exception; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mrp_requirements_exception ON public.mrp_requirements USING btree (org_id, exception_type) WHERE (exception_type IS NOT NULL);


--
-- Name: idx_mrp_requirements_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mrp_requirements_item ON public.mrp_requirements USING btree (item_id);


--
-- Name: idx_mrp_requirements_org_item_bucket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mrp_requirements_org_item_bucket ON public.mrp_requirements USING btree (org_id, item_id, bucket_date);


--
-- Name: idx_mrp_requirements_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mrp_requirements_run ON public.mrp_requirements USING btree (run_id);


--
-- Name: idx_mrp_runs_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mrp_runs_created_by ON public.mrp_runs USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_mrp_runs_org_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mrp_runs_org_site ON public.mrp_runs USING btree (org_id, site_id);


--
-- Name: idx_mrp_runs_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mrp_runs_org_status ON public.mrp_runs USING btree (org_id, status);


--
-- Name: idx_reorder_thresholds_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reorder_thresholds_item ON public.reorder_thresholds USING btree (item_id);


--
-- Name: idx_reorder_thresholds_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reorder_thresholds_org ON public.reorder_thresholds USING btree (org_id);


--
-- Name: idx_reorder_thresholds_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reorder_thresholds_supplier ON public.reorder_thresholds USING btree (preferred_supplier_id) WHERE (preferred_supplier_id IS NOT NULL);


--
-- Name: idx_reorder_thresholds_updated_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reorder_thresholds_updated_by ON public.reorder_thresholds USING btree (updated_by) WHERE (updated_by IS NOT NULL);


--
-- Name: idx_routing_operations_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routing_operations_created_by ON public.routing_operations USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_routing_operations_line; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routing_operations_line ON public.routing_operations USING btree (line_id) WHERE (line_id IS NOT NULL);


--
-- Name: idx_routing_operations_machine; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routing_operations_machine ON public.routing_operations USING btree (machine_id) WHERE (machine_id IS NOT NULL);


--
-- Name: idx_routing_operations_mfg_op_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routing_operations_mfg_op_name ON public.routing_operations USING btree (org_id, manufacturing_operation_name) WHERE (manufacturing_operation_name IS NOT NULL);


--
-- Name: idx_routing_operations_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routing_operations_org ON public.routing_operations USING btree (org_id);


--
-- Name: idx_routing_operations_routing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routing_operations_routing ON public.routing_operations USING btree (routing_id, op_no);


--
-- Name: idx_routings_approved_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routings_approved_by ON public.routings USING btree (approved_by) WHERE (approved_by IS NOT NULL);


--
-- Name: idx_routings_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routings_created_by ON public.routings USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_routings_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routings_item ON public.routings USING btree (item_id);


--
-- Name: idx_routings_org_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routings_org_item ON public.routings USING btree (org_id, item_id, status);


--
-- Name: idx_schedule_outputs_downstream; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_outputs_downstream ON public.schedule_outputs USING btree (downstream_wo_id) WHERE (downstream_wo_id IS NOT NULL);


--
-- Name: idx_schedule_outputs_org_planned_wo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_outputs_org_planned_wo ON public.schedule_outputs USING btree (org_id, planned_wo_id);


--
-- Name: idx_schedule_outputs_planned_wo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_outputs_planned_wo ON public.schedule_outputs USING btree (planned_wo_id);


--
-- Name: idx_schedule_outputs_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_outputs_product ON public.schedule_outputs USING btree (org_id, product_id);


--
-- Name: idx_supplier_spec_review_proposals_org_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_spec_review_proposals_org_site ON public.supplier_spec_review_proposals USING btree (org_id, site_id);


--
-- Name: idx_supplier_spec_review_proposals_org_spec; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_spec_review_proposals_org_spec ON public.supplier_spec_review_proposals USING btree (org_id, supplier_spec_id);


--
-- Name: idx_supplier_spec_review_proposals_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_spec_review_proposals_org_status ON public.supplier_spec_review_proposals USING btree (org_id, proposal_status);


--
-- Name: idx_supplier_specs_org_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_specs_org_item ON public.supplier_specs USING btree (org_id, item_id);


--
-- Name: idx_supplier_specs_org_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_specs_org_site ON public.supplier_specs USING btree (org_id, site_id);


--
-- Name: idx_supplier_specs_org_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_specs_org_supplier ON public.supplier_specs USING btree (org_id, supplier_code, item_id);


--
-- Name: idx_technical_sensory_evaluations_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technical_sensory_evaluations_item ON public.technical_sensory_evaluations USING btree (org_id, subject_item_id) WHERE (subject_item_id IS NOT NULL);


--
-- Name: idx_technical_sensory_evaluations_org_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technical_sensory_evaluations_org_site ON public.technical_sensory_evaluations USING btree (org_id, site_id);


--
-- Name: idx_technical_sensory_evaluations_org_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technical_sensory_evaluations_org_status ON public.technical_sensory_evaluations USING btree (org_id, status);


--
-- Name: idx_technical_sensory_evaluations_org_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_technical_sensory_evaluations_org_subject ON public.technical_sensory_evaluations USING btree (org_id, subject_type, subject_ref);


--
-- Name: idx_wo_dependencies_child; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_dependencies_child ON public.wo_dependencies USING btree (child_wo_id);


--
-- Name: idx_wo_dependencies_material_link; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_dependencies_material_link ON public.wo_dependencies USING btree (material_link) WHERE (material_link IS NOT NULL);


--
-- Name: idx_wo_dependencies_org_child; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_dependencies_org_child ON public.wo_dependencies USING btree (org_id, child_wo_id);


--
-- Name: idx_wo_dependencies_org_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_dependencies_org_parent ON public.wo_dependencies USING btree (org_id, parent_wo_id);


--
-- Name: idx_wo_dependencies_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_dependencies_parent ON public.wo_dependencies USING btree (parent_wo_id);


--
-- Name: idx_wo_materials_org_wo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_materials_org_wo ON public.wo_materials USING btree (org_id, wo_id);


--
-- Name: idx_wo_materials_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_materials_product ON public.wo_materials USING btree (org_id, product_id);


--
-- Name: idx_wo_materials_source_wo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_materials_source_wo ON public.wo_materials USING btree (source_wo_id) WHERE (source_wo_id IS NOT NULL);


--
-- Name: idx_wo_materials_wo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_materials_wo ON public.wo_materials USING btree (wo_id);


--
-- Name: idx_wo_operations_line; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_operations_line ON public.wo_operations USING btree (line_id) WHERE (line_id IS NOT NULL);


--
-- Name: idx_wo_operations_machine; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_operations_machine ON public.wo_operations USING btree (machine_id) WHERE (machine_id IS NOT NULL);


--
-- Name: idx_wo_operations_org_wo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_operations_org_wo ON public.wo_operations USING btree (org_id, wo_id);


--
-- Name: idx_wo_operations_wo_sequence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_operations_wo_sequence ON public.wo_operations USING btree (wo_id, sequence);


--
-- Name: idx_wo_status_history_org_wo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_status_history_org_wo ON public.wo_status_history USING btree (org_id, wo_id, occurred_at);


--
-- Name: idx_wo_status_history_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_status_history_user ON public.wo_status_history USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_wo_status_history_wo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_status_history_wo ON public.wo_status_history USING btree (wo_id);


--
-- Name: idx_work_orders_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_work_orders_created_by ON public.work_orders USING btree (created_by) WHERE (created_by IS NOT NULL);


--
-- Name: idx_work_orders_line_sched; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_work_orders_line_sched ON public.work_orders USING btree (production_line_id, scheduled_start_time) WHERE (production_line_id IS NOT NULL);


--
-- Name: idx_work_orders_machine; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_work_orders_machine ON public.work_orders USING btree (machine_id) WHERE (machine_id IS NOT NULL);


--
-- Name: idx_work_orders_org_status_sched; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_work_orders_org_status_sched ON public.work_orders USING btree (org_id, status, scheduled_start_time);


--
-- Name: idx_work_orders_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_work_orders_product ON public.work_orders USING btree (org_id, product_id);


--
-- Name: idx_work_orders_released_to_warehouse_true; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_work_orders_released_to_warehouse_true ON public.work_orders USING btree (org_id, released_to_warehouse) WHERE (released_to_warehouse = true);


--
-- Name: idx_work_orders_source_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_work_orders_source_reference ON public.work_orders USING btree (source_reference) WHERE (source_reference IS NOT NULL);


--
-- Name: idx_work_orders_updated_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_work_orders_updated_by ON public.work_orders USING btree (updated_by) WHERE (updated_by IS NOT NULL);


--
-- Name: integration_settings_org_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integration_settings_org_category_idx ON public.integration_settings USING btree (org_id, category);


--
-- Name: integration_settings_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integration_settings_org_idx ON public.integration_settings USING btree (org_id);


--
-- Name: line_machines_machine_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX line_machines_machine_idx ON public.line_machines USING btree (machine_id);


--
-- Name: locations_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX locations_org_idx ON public.locations USING btree (org_id);


--
-- Name: locations_org_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX locations_org_path_idx ON public.locations USING btree (org_id, path text_pattern_ops);


--
-- Name: locations_path_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX locations_path_idx ON public.locations USING btree (path text_pattern_ops);


--
-- Name: locations_warehouse_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX locations_warehouse_idx ON public.locations USING btree (warehouse_id);


--
-- Name: login_attempts_email_attempted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX login_attempts_email_attempted_idx ON public.login_attempts USING btree (lower(email), attempted_at DESC);


--
-- Name: login_attempts_ip_attempted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX login_attempts_ip_attempted_idx ON public.login_attempts USING btree (ip_address, attempted_at DESC);


--
-- Name: login_attempts_org_attempted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX login_attempts_org_attempted_idx ON public.login_attempts USING btree (org_id, attempted_at DESC);


--
-- Name: lot_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lot_org_created_idx ON public.lot USING btree (org_id, created_at DESC);


--
-- Name: machines_location_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX machines_location_idx ON public.machines USING btree (location_id);


--
-- Name: machines_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX machines_org_idx ON public.machines USING btree (org_id);


--
-- Name: mfa_secrets_last_otp_window_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mfa_secrets_last_otp_window_idx ON public.mfa_secrets USING btree (user_id, last_otp_window);


--
-- Name: notification_preferences_org_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notification_preferences_org_event_idx ON public.notification_preferences USING btree (org_id, category, event);


--
-- Name: npd_legacy_closeout_org_closed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX npd_legacy_closeout_org_closed_idx ON public.npd_legacy_closeout USING btree (org_id, closed_at DESC);


--
-- Name: npd_legacy_closeout_org_project_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX npd_legacy_closeout_org_project_idx ON public.npd_legacy_closeout USING btree (org_id, npd_project_id);


--
-- Name: npd_projects_org_product_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX npd_projects_org_product_code_idx ON public.npd_projects USING btree (org_id, product_code);


--
-- Name: nutri_score_results_org_product_computed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nutri_score_results_org_product_computed_idx ON public.nutri_score_results USING btree (org_id, product_code, computed_at DESC);


--
-- Name: nutrition_allergens_org_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nutrition_allergens_org_product_idx ON public.nutrition_allergens USING btree (org_id, product_code);


--
-- Name: nutrition_profiles_org_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nutrition_profiles_org_product_idx ON public.nutrition_profiles USING btree (org_id, product_code);


--
-- Name: nutrition_profiles_product_nutrient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nutrition_profiles_product_nutrient_idx ON public.nutrition_profiles USING btree (product_code, nutrient_code);


--
-- Name: org_authorization_policies_org_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_authorization_policies_org_code_idx ON public.org_authorization_policies USING btree (org_id, policy_code);


--
-- Name: org_authorization_policies_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_authorization_policies_org_idx ON public.org_authorization_policies USING btree (org_id);


--
-- Name: org_sequences_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_sequences_org_id_idx ON public.org_sequences USING btree (org_id);


--
-- Name: organization_modules_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_modules_org_id_idx ON public.organization_modules USING btree (org_id);


--
-- Name: organizations_slug_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organizations_slug_unique ON public.organizations USING btree (slug);


--
-- Name: organizations_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organizations_tenant_id_idx ON public.organizations USING btree (tenant_id);


--
-- Name: outbox_events_org_dedup_key_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX outbox_events_org_dedup_key_unique ON public.outbox_events USING btree (org_id, dedup_key) WHERE (dedup_key IS NOT NULL);


--
-- Name: outbox_events_retry_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbox_events_retry_pending_idx ON public.outbox_events USING btree (org_id, created_at) WHERE ((consumed_at IS NULL) AND (dead_lettered_at IS NULL));


--
-- Name: outbox_events_unconsumed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbox_events_unconsumed_idx ON public.outbox_events USING btree (org_id, created_at) WHERE (consumed_at IS NULL);


--
-- Name: password_history_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_history_user_id_created_at_idx ON public.password_history USING btree (user_id, created_at DESC);


--
-- Name: prod_detail_item_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prod_detail_item_id_idx ON public.prod_detail USING btree (item_id) WHERE (item_id IS NOT NULL);


--
-- Name: prod_detail_org_product_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prod_detail_org_product_code_idx ON public.prod_detail USING btree (org_id, product_code);


--
-- Name: prod_detail_product_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prod_detail_product_code_idx ON public.prod_detail USING btree (product_code);


--
-- Name: product_org_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_org_active_idx ON public.product USING btree (org_id, product_code) WHERE (deleted_at IS NULL);


--
-- Name: product_org_closed_commercial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_org_closed_commercial_idx ON public.product USING btree (org_id, closed_commercial);


--
-- Name: product_org_closed_core_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_org_closed_core_idx ON public.product USING btree (org_id, closed_core);


--
-- Name: product_org_closed_mrp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_org_closed_mrp_idx ON public.product USING btree (org_id, closed_mrp);


--
-- Name: product_org_closed_planning_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_org_closed_planning_idx ON public.product USING btree (org_id, closed_planning);


--
-- Name: product_org_closed_procurement_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_org_closed_procurement_idx ON public.product USING btree (org_id, closed_procurement);


--
-- Name: product_org_closed_production_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_org_closed_production_idx ON public.product USING btree (org_id, closed_production);


--
-- Name: product_org_closed_technical_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_org_closed_technical_idx ON public.product USING btree (org_id, closed_technical);


--
-- Name: product_org_launch_unbuilt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_org_launch_unbuilt_idx ON public.product USING btree (org_id, launch_date) WHERE (built = false);


--
-- Name: product_org_status_days_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_org_status_days_idx ON public.product USING btree (org_id, status_overall, days_to_launch);


--
-- Name: production_lines_default_location_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX production_lines_default_location_idx ON public.production_lines USING btree (default_location_id);


--
-- Name: production_lines_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX production_lines_org_idx ON public.production_lines USING btree (org_id);


--
-- Name: quality_event_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quality_event_org_created_idx ON public.quality_event USING btree (org_id, created_at DESC);


--
-- Name: reference_csv_import_reports_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reference_csv_import_reports_org_idx ON public.reference_csv_import_reports USING btree (org_id, expires_at);


--
-- Name: reference_schemas_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reference_schemas_org_id_idx ON public.reference_schemas USING btree (org_id);


--
-- Name: reference_schemas_org_table_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reference_schemas_org_table_code_idx ON public.reference_schemas USING btree (org_id, table_code);


--
-- Name: reference_schemas_table_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reference_schemas_table_code_idx ON public.reference_schemas USING btree (table_code);


--
-- Name: reference_tables_org_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reference_tables_org_active_idx ON public.reference_tables USING btree (org_id, is_active);


--
-- Name: reference_tables_org_table_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reference_tables_org_table_idx ON public.reference_tables USING btree (org_id, table_code);


--
-- Name: risks_org_open_bucket_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX risks_org_open_bucket_idx ON public.risks USING btree (org_id, bucket) WHERE (state = 'Open'::text);


--
-- Name: risks_org_product_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX risks_org_product_state_idx ON public.risks USING btree (org_id, product_code, state);


--
-- Name: roles_org_id_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX roles_org_id_code_unique ON public.roles USING btree (org_id, code);


--
-- Name: roles_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX roles_org_id_idx ON public.roles USING btree (org_id);


--
-- Name: rule_definitions_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rule_definitions_org_id_idx ON public.rule_definitions USING btree (org_id);


--
-- Name: rule_definitions_org_rule_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rule_definitions_org_rule_code_idx ON public.rule_definitions USING btree (org_id, rule_code);


--
-- Name: rule_dry_runs_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rule_dry_runs_org_id_idx ON public.rule_dry_runs USING btree (org_id);


--
-- Name: rule_dry_runs_org_rule_definition_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rule_dry_runs_org_rule_definition_idx ON public.rule_dry_runs USING btree (org_id, rule_definition_id);


--
-- Name: schedule_outputs_one_primary_per_wo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX schedule_outputs_one_primary_per_wo ON public.schedule_outputs USING btree (org_id, planned_wo_id) WHERE (output_role = 'primary'::text);


--
-- Name: schema_migrations_filename_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX schema_migrations_filename_unique ON public.schema_migrations USING btree (filename) WHERE (filename IS NOT NULL);


--
-- Name: schema_migrations_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX schema_migrations_org_id_idx ON public.schema_migrations USING btree (org_id);


--
-- Name: schema_migrations_org_table_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX schema_migrations_org_table_code_idx ON public.schema_migrations USING btree (org_id, table_code);


--
-- Name: schema_migrations_table_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX schema_migrations_table_code_idx ON public.schema_migrations USING btree (table_code);


--
-- Name: scim_group_members_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scim_group_members_user_idx ON public.scim_group_members USING btree (user_id);


--
-- Name: scim_groups_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scim_groups_org_idx ON public.scim_groups USING btree (org_id);


--
-- Name: scim_tokens_last_four_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scim_tokens_last_four_active_idx ON public.scim_tokens USING btree (scim_token_last_four) WHERE (revoked_at IS NULL);


--
-- Name: scim_tokens_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scim_tokens_org_created_idx ON public.scim_tokens USING btree (org_id, created_at DESC);


--
-- Name: shipment_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipment_org_created_idx ON public.shipment USING btree (org_id, created_at DESC);


--
-- Name: supplier_specs_one_active_approved; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX supplier_specs_one_active_approved ON public.supplier_specs USING btree (org_id, item_id, supplier_code) WHERE ((lifecycle_status = 'active'::text) AND (review_status = 'approved'::text));


--
-- Name: tax_codes_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tax_codes_org_idx ON public.tax_codes USING btree (org_id);


--
-- Name: tenant_idp_config_scim_last_four_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_idp_config_scim_last_four_idx ON public.tenant_idp_config USING btree (scim_token_last_four);


--
-- Name: tenant_migrations_cohort_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_migrations_cohort_status_idx ON public.tenant_migrations_legacy_t038 USING btree (cohort, status);


--
-- Name: tenant_migrations_l2_org_component_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_migrations_l2_org_component_idx ON public.tenant_migrations USING btree (org_id, component);


--
-- Name: tenant_migrations_l2_org_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tenant_migrations_l2_org_status_idx ON public.tenant_migrations USING btree (org_id, status);


--
-- Name: unit_of_measure_org_category_base_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unit_of_measure_org_category_base_uq ON public.unit_of_measure USING btree (org_id, category) WHERE (is_base AND (deleted_at IS NULL));


--
-- Name: unit_of_measure_org_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX unit_of_measure_org_category_idx ON public.unit_of_measure USING btree (org_id, category, is_base);


--
-- Name: unit_of_measure_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX unit_of_measure_org_idx ON public.unit_of_measure USING btree (org_id);


--
-- Name: uom_custom_conversions_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX uom_custom_conversions_org_idx ON public.uom_custom_conversions USING btree (org_id);


--
-- Name: uom_custom_conversions_org_label_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX uom_custom_conversions_org_label_idx ON public.uom_custom_conversions USING btree (org_id, label);


--
-- Name: users_org_id_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_org_id_active_idx ON public.users USING btree (org_id) WHERE (deleted_at IS NULL);


--
-- Name: users_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_org_id_idx ON public.users USING btree (org_id);


--
-- Name: warehouses_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX warehouses_org_idx ON public.warehouses USING btree (org_id);


--
-- Name: work_order_org_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX work_order_org_created_idx ON public.work_order USING btree (org_id, created_at DESC);


--
-- Name: audit_log_2026_01_org_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_occurred_idx ATTACH PARTITION public.audit_log_2026_01_org_id_occurred_at_idx;


--
-- Name: audit_log_2026_01_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pk ATTACH PARTITION public.audit_log_2026_01_pkey;


--
-- Name: audit_log_2026_01_request_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_request_id_idx ATTACH PARTITION public.audit_log_2026_01_request_id_idx;


--
-- Name: audit_log_2026_01_resource_type_resource_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_resource_idx ATTACH PARTITION public.audit_log_2026_01_resource_type_resource_id_occurred_at_idx;


--
-- Name: audit_log_2026_02_org_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_occurred_idx ATTACH PARTITION public.audit_log_2026_02_org_id_occurred_at_idx;


--
-- Name: audit_log_2026_02_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pk ATTACH PARTITION public.audit_log_2026_02_pkey;


--
-- Name: audit_log_2026_02_request_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_request_id_idx ATTACH PARTITION public.audit_log_2026_02_request_id_idx;


--
-- Name: audit_log_2026_02_resource_type_resource_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_resource_idx ATTACH PARTITION public.audit_log_2026_02_resource_type_resource_id_occurred_at_idx;


--
-- Name: audit_log_2026_03_org_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_occurred_idx ATTACH PARTITION public.audit_log_2026_03_org_id_occurred_at_idx;


--
-- Name: audit_log_2026_03_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pk ATTACH PARTITION public.audit_log_2026_03_pkey;


--
-- Name: audit_log_2026_03_request_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_request_id_idx ATTACH PARTITION public.audit_log_2026_03_request_id_idx;


--
-- Name: audit_log_2026_03_resource_type_resource_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_resource_idx ATTACH PARTITION public.audit_log_2026_03_resource_type_resource_id_occurred_at_idx;


--
-- Name: audit_log_2026_04_org_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_occurred_idx ATTACH PARTITION public.audit_log_2026_04_org_id_occurred_at_idx;


--
-- Name: audit_log_2026_04_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pk ATTACH PARTITION public.audit_log_2026_04_pkey;


--
-- Name: audit_log_2026_04_request_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_request_id_idx ATTACH PARTITION public.audit_log_2026_04_request_id_idx;


--
-- Name: audit_log_2026_04_resource_type_resource_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_resource_idx ATTACH PARTITION public.audit_log_2026_04_resource_type_resource_id_occurred_at_idx;


--
-- Name: audit_log_2026_05_org_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_occurred_idx ATTACH PARTITION public.audit_log_2026_05_org_id_occurred_at_idx;


--
-- Name: audit_log_2026_05_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pk ATTACH PARTITION public.audit_log_2026_05_pkey;


--
-- Name: audit_log_2026_05_request_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_request_id_idx ATTACH PARTITION public.audit_log_2026_05_request_id_idx;


--
-- Name: audit_log_2026_05_resource_type_resource_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_resource_idx ATTACH PARTITION public.audit_log_2026_05_resource_type_resource_id_occurred_at_idx;


--
-- Name: audit_log_2026_06_org_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_occurred_idx ATTACH PARTITION public.audit_log_2026_06_org_id_occurred_at_idx;


--
-- Name: audit_log_2026_06_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pk ATTACH PARTITION public.audit_log_2026_06_pkey;


--
-- Name: audit_log_2026_06_request_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_request_id_idx ATTACH PARTITION public.audit_log_2026_06_request_id_idx;


--
-- Name: audit_log_2026_06_resource_type_resource_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_resource_idx ATTACH PARTITION public.audit_log_2026_06_resource_type_resource_id_occurred_at_idx;


--
-- Name: audit_log_2026_07_org_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_occurred_idx ATTACH PARTITION public.audit_log_2026_07_org_id_occurred_at_idx;


--
-- Name: audit_log_2026_07_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pk ATTACH PARTITION public.audit_log_2026_07_pkey;


--
-- Name: audit_log_2026_07_request_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_request_id_idx ATTACH PARTITION public.audit_log_2026_07_request_id_idx;


--
-- Name: audit_log_2026_07_resource_type_resource_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_resource_idx ATTACH PARTITION public.audit_log_2026_07_resource_type_resource_id_occurred_at_idx;


--
-- Name: audit_log_2026_08_org_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_occurred_idx ATTACH PARTITION public.audit_log_2026_08_org_id_occurred_at_idx;


--
-- Name: audit_log_2026_08_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pk ATTACH PARTITION public.audit_log_2026_08_pkey;


--
-- Name: audit_log_2026_08_request_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_request_id_idx ATTACH PARTITION public.audit_log_2026_08_request_id_idx;


--
-- Name: audit_log_2026_08_resource_type_resource_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_resource_idx ATTACH PARTITION public.audit_log_2026_08_resource_type_resource_id_occurred_at_idx;


--
-- Name: audit_log_2026_09_org_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_occurred_idx ATTACH PARTITION public.audit_log_2026_09_org_id_occurred_at_idx;


--
-- Name: audit_log_2026_09_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pk ATTACH PARTITION public.audit_log_2026_09_pkey;


--
-- Name: audit_log_2026_09_request_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_request_id_idx ATTACH PARTITION public.audit_log_2026_09_request_id_idx;


--
-- Name: audit_log_2026_09_resource_type_resource_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_resource_idx ATTACH PARTITION public.audit_log_2026_09_resource_type_resource_id_occurred_at_idx;


--
-- Name: audit_log_2026_10_org_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_occurred_idx ATTACH PARTITION public.audit_log_2026_10_org_id_occurred_at_idx;


--
-- Name: audit_log_2026_10_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pk ATTACH PARTITION public.audit_log_2026_10_pkey;


--
-- Name: audit_log_2026_10_request_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_request_id_idx ATTACH PARTITION public.audit_log_2026_10_request_id_idx;


--
-- Name: audit_log_2026_10_resource_type_resource_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_resource_idx ATTACH PARTITION public.audit_log_2026_10_resource_type_resource_id_occurred_at_idx;


--
-- Name: audit_log_2026_11_org_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_occurred_idx ATTACH PARTITION public.audit_log_2026_11_org_id_occurred_at_idx;


--
-- Name: audit_log_2026_11_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pk ATTACH PARTITION public.audit_log_2026_11_pkey;


--
-- Name: audit_log_2026_11_request_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_request_id_idx ATTACH PARTITION public.audit_log_2026_11_request_id_idx;


--
-- Name: audit_log_2026_11_resource_type_resource_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_resource_idx ATTACH PARTITION public.audit_log_2026_11_resource_type_resource_id_occurred_at_idx;


--
-- Name: audit_log_2026_12_org_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_org_occurred_idx ATTACH PARTITION public.audit_log_2026_12_org_id_occurred_at_idx;


--
-- Name: audit_log_2026_12_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_pk ATTACH PARTITION public.audit_log_2026_12_pkey;


--
-- Name: audit_log_2026_12_request_id_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_request_id_idx ATTACH PARTITION public.audit_log_2026_12_request_id_idx;


--
-- Name: audit_log_2026_12_resource_type_resource_id_occurred_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.audit_log_resource_idx ATTACH PARTITION public.audit_log_2026_12_resource_type_resource_id_occurred_at_idx;


--
-- Name: allergen_contamination_risk allergen_contamination_risk_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER allergen_contamination_risk_set_updated_at BEFORE UPDATE ON public.allergen_contamination_risk FOR EACH ROW EXECUTE FUNCTION public.allergen_contamination_risk_set_updated_at();


--
-- Name: audit_events audit_events_impersonation_guard_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_events_impersonation_guard_trg BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.audit_events_impersonation_guard();


--
-- Name: bom_co_products bom_co_products_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bom_co_products_set_updated_at BEFORE UPDATE ON public.bom_co_products FOR EACH ROW EXECUTE FUNCTION public.bom_co_products_set_updated_at();


--
-- Name: bom_generator_jobs bom_generator_jobs_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bom_generator_jobs_set_updated_at BEFORE UPDATE ON public.bom_generator_jobs FOR EACH ROW EXECUTE FUNCTION public.bom_generator_jobs_set_updated_at();


--
-- Name: bom_headers bom_headers_aa_enforce_status_transition; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bom_headers_aa_enforce_status_transition BEFORE UPDATE ON public.bom_headers FOR EACH ROW EXECUTE FUNCTION public.bom_headers_enforce_status_transition();


--
-- Name: bom_headers bom_headers_reject_approved_content_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bom_headers_reject_approved_content_update BEFORE UPDATE ON public.bom_headers FOR EACH ROW EXECUTE FUNCTION public.bom_headers_reject_approved_content_update();


--
-- Name: bom_lines bom_lines_reject_approved_header_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bom_lines_reject_approved_header_update BEFORE INSERT OR DELETE OR UPDATE ON public.bom_lines FOR EACH ROW EXECUTE FUNCTION public.bom_lines_reject_approved_header_update();


--
-- Name: bom_snapshots bom_snapshots_reject_mutation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bom_snapshots_reject_mutation BEFORE DELETE OR UPDATE ON public.bom_snapshots FOR EACH ROW EXECUTE FUNCTION public.bom_snapshots_reject_mutation();


--
-- Name: capacity_plan_lines capacity_plan_lines_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER capacity_plan_lines_set_updated_at BEFORE UPDATE ON public.capacity_plan_lines FOR EACH ROW EXECUTE FUNCTION public.planning_capacity_set_updated_at();


--
-- Name: capacity_plans capacity_plans_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER capacity_plans_set_updated_at BEFORE UPDATE ON public.capacity_plans FOR EACH ROW EXECUTE FUNCTION public.planning_capacity_set_updated_at();


--
-- Name: d365_sync_dlq d365_sync_dlq_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER d365_sync_dlq_set_updated_at BEFORE UPDATE ON public.d365_sync_dlq FOR EACH ROW EXECUTE FUNCTION public.d365_sync_dlq_set_updated_at();


--
-- Name: d365_sync_jobs d365_sync_jobs_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER d365_sync_jobs_set_updated_at BEFORE UPDATE ON public.d365_sync_jobs FOR EACH ROW EXECUTE FUNCTION public.d365_sync_jobs_set_updated_at();


--
-- Name: fa_allergen_overrides fa_allergen_overrides_audit_after_insert_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fa_allergen_overrides_audit_after_insert_trg AFTER INSERT ON public.fa_allergen_overrides FOR EACH ROW EXECUTE FUNCTION public.fa_allergen_overrides_audit_after_insert();


--
-- Name: fa_allergen_overrides fa_allergen_overrides_chain_before_insert_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fa_allergen_overrides_chain_before_insert_trg BEFORE INSERT ON public.fa_allergen_overrides FOR EACH ROW EXECUTE FUNCTION public.fa_allergen_overrides_chain_before_insert();


--
-- Name: fa_builder_outputs fa_builder_outputs_before_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fa_builder_outputs_before_insert BEFORE INSERT ON public.fa_builder_outputs FOR EACH ROW EXECUTE FUNCTION public.fa_builder_outputs_before_insert();


--
-- Name: product fa_built_v18_check; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fa_built_v18_check BEFORE UPDATE OF built ON public.product FOR EACH ROW WHEN ((old.built IS DISTINCT FROM new.built)) EXECUTE FUNCTION public.fa_built_v18_check_fn();


--
-- Name: fa fa_read_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fa_read_only INSTEAD OF INSERT OR DELETE OR UPDATE ON public.fa FOR EACH ROW EXECUTE FUNCTION public.fa_reject_writes();


--
-- Name: prod_detail fa_reset_built_on_prod_detail_edit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fa_reset_built_on_prod_detail_edit AFTER UPDATE ON public.prod_detail FOR EACH ROW EXECUTE FUNCTION public.fa_reset_built_on_prod_detail_edit_fn();


--
-- Name: product fa_reset_built_on_product_edit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER fa_reset_built_on_product_edit BEFORE UPDATE ON public.product FOR EACH ROW WHEN ((old.built IS TRUE)) EXECUTE FUNCTION public.fa_reset_built_on_product_edit_fn();


--
-- Name: factory_release_status factory_release_status_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER factory_release_status_validate BEFORE INSERT OR UPDATE ON public.factory_release_status FOR EACH ROW EXECUTE FUNCTION public.factory_release_status_validate();


--
-- Name: factory_specs factory_specs_enforce_clone_on_write; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER factory_specs_enforce_clone_on_write BEFORE UPDATE ON public.factory_specs FOR EACH ROW EXECUTE FUNCTION public.factory_specs_enforce_clone_on_write();


--
-- Name: factory_specs factory_specs_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER factory_specs_set_updated_at BEFORE UPDATE ON public.factory_specs FOR EACH ROW EXECUTE FUNCTION public.factory_specs_set_updated_at();


--
-- Name: feature_flags_core feature_flags_core_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER feature_flags_core_set_updated_at BEFORE UPDATE ON public.feature_flags_core FOR EACH ROW EXECUTE FUNCTION public.feature_flags_core_set_updated_at();


--
-- Name: formulation_audit_log formulation_audit_log_reject_mutation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER formulation_audit_log_reject_mutation BEFORE DELETE OR UPDATE ON public.formulation_audit_log FOR EACH ROW EXECUTE FUNCTION public.formulation_audit_log_reject_mutation();


--
-- Name: formulation_ingredients formulation_ingredients_reject_locked_version_mutation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER formulation_ingredients_reject_locked_version_mutation BEFORE INSERT OR DELETE OR UPDATE ON public.formulation_ingredients FOR EACH ROW EXECUTE FUNCTION public.formulation_ingredients_reject_locked_version_mutation();


--
-- Name: formulation_versions formulation_versions_enforce_state_transition; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER formulation_versions_enforce_state_transition BEFORE UPDATE ON public.formulation_versions FOR EACH ROW EXECUTE FUNCTION public.formulation_versions_enforce_state_transition();


--
-- Name: formulations formulations_validate_org_links; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER formulations_validate_org_links BEFORE INSERT OR UPDATE ON public.formulations FOR EACH ROW EXECUTE FUNCTION public.formulations_validate_org_links();


--
-- Name: integration_settings integration_settings_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER integration_settings_set_updated_at BEFORE UPDATE ON public.integration_settings FOR EACH ROW EXECUTE FUNCTION public.integration_settings_set_updated_at();


--
-- Name: item_allergen_profiles item_allergen_profiles_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER item_allergen_profiles_set_updated_at BEFORE UPDATE ON public.item_allergen_profiles FOR EACH ROW EXECUTE FUNCTION public.item_allergen_profiles_set_updated_at();


--
-- Name: item_cost_history item_cost_history_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER item_cost_history_set_updated_at BEFORE UPDATE ON public.item_cost_history FOR EACH ROW EXECUTE FUNCTION public.item_cost_history_set_updated_at();


--
-- Name: items items_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER items_set_updated_at BEFORE UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.items_set_updated_at();


--
-- Name: manufacturing_operation_allergen_additions mfg_op_allergen_additions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mfg_op_allergen_additions_set_updated_at BEFORE UPDATE ON public.manufacturing_operation_allergen_additions FOR EACH ROW EXECUTE FUNCTION public.mfg_op_allergen_additions_set_updated_at();


--
-- Name: mrp_planned_orders mrp_planned_orders_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mrp_planned_orders_set_updated_at BEFORE UPDATE ON public.mrp_planned_orders FOR EACH ROW EXECUTE FUNCTION public.planning_mrp_set_updated_at();


--
-- Name: mrp_requirements mrp_requirements_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mrp_requirements_set_updated_at BEFORE UPDATE ON public.mrp_requirements FOR EACH ROW EXECUTE FUNCTION public.planning_mrp_set_updated_at();


--
-- Name: mrp_runs mrp_runs_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mrp_runs_set_updated_at BEFORE UPDATE ON public.mrp_runs FOR EACH ROW EXECUTE FUNCTION public.planning_mrp_set_updated_at();


--
-- Name: org_authorization_policies org_authorization_policies_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER org_authorization_policies_set_updated_at BEFORE UPDATE ON public.org_authorization_policies FOR EACH ROW EXECUTE FUNCTION public.org_authorization_policies_set_updated_at();


--
-- Name: reference_tables reference_tables_set_version; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reference_tables_set_version BEFORE UPDATE ON public.reference_tables FOR EACH ROW EXECUTE FUNCTION app.reference_tables_set_version();


--
-- Name: reorder_thresholds reorder_thresholds_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reorder_thresholds_set_updated_at BEFORE UPDATE ON public.reorder_thresholds FOR EACH ROW EXECUTE FUNCTION public.planning_mrp_set_updated_at();


--
-- Name: routing_operations routing_operations_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER routing_operations_set_updated_at BEFORE UPDATE ON public.routing_operations FOR EACH ROW EXECUTE FUNCTION public.routings_set_updated_at();


--
-- Name: routings routings_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER routings_set_updated_at BEFORE UPDATE ON public.routings FOR EACH ROW EXECUTE FUNCTION public.routings_set_updated_at();


--
-- Name: schedule_outputs schedule_outputs_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER schedule_outputs_set_updated_at BEFORE UPDATE ON public.schedule_outputs FOR EACH ROW EXECUTE FUNCTION public.schedule_outputs_set_updated_at();


--
-- Name: organizations seed_allergen_cascade_rule_after_org_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER seed_allergen_cascade_rule_after_org_insert AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.seed_allergen_cascade_rule_for_org();


--
-- Name: organizations seed_allergens_eu14_after_org_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER seed_allergens_eu14_after_org_insert AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.seed_allergens_eu14_on_org_insert();


--
-- Name: organizations seed_system_roles_on_org_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER seed_system_roles_on_org_insert AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.seed_system_roles_on_org_insert();


--
-- Name: supplier_spec_review_proposals supplier_spec_review_proposals_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER supplier_spec_review_proposals_set_updated_at BEFORE UPDATE ON public.supplier_spec_review_proposals FOR EACH ROW EXECUTE FUNCTION public.supplier_spec_review_proposals_set_updated_at();


--
-- Name: supplier_specs supplier_specs_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER supplier_specs_set_updated_at BEFORE UPDATE ON public.supplier_specs FOR EACH ROW EXECUTE FUNCTION public.supplier_specs_set_updated_at();


--
-- Name: technical_sensory_evaluations technical_sensory_evaluations_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER technical_sensory_evaluations_set_updated_at BEFORE UPDATE ON public.technical_sensory_evaluations FOR EACH ROW EXECUTE FUNCTION public.technical_sensory_evaluations_set_updated_at();


--
-- Name: tenant_idp_config tenant_idp_config_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tenant_idp_config_touch_updated_at BEFORE UPDATE ON public.tenant_idp_config FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: tenants tenants_seed_idp_config; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tenants_seed_idp_config AFTER INSERT ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.seed_tenant_idp_config();


--
-- Name: organizations trg_seed_alert_thresholds; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_seed_alert_thresholds AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.seed_alert_thresholds_on_org_insert();


--
-- Name: organizations trg_seed_authorization_policies; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_seed_authorization_policies AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.seed_authorization_policies_on_org_insert();


--
-- Name: organizations trg_seed_dept_columns; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_seed_dept_columns AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.seed_dept_columns_on_org_insert();


--
-- Name: organizations trg_seed_feature_flags_core; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_seed_feature_flags_core AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.seed_feature_flags_core_on_org_insert();


--
-- Name: organizations trg_seed_gate_checklist_templates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_seed_gate_checklist_templates AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.seed_gate_checklist_templates_on_org_insert();


--
-- Name: organizations trg_seed_npd_role_permissions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_seed_npd_role_permissions AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.seed_npd_role_permissions_on_org_insert();


--
-- Name: organizations trg_seed_reference_data; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_seed_reference_data AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.seed_reference_data_on_org_insert();


--
-- Name: organizations trg_seed_reference_lookups; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_seed_reference_lookups AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.seed_reference_lookups_on_org_insert();


--
-- Name: organizations trg_seed_units_of_measure; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_seed_units_of_measure AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.seed_units_of_measure_on_org_insert();


--
-- Name: user_pins trg_user_pins_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_pins_updated_at BEFORE UPDATE ON public.user_pins FOR EACH ROW EXECUTE FUNCTION public.set_user_pins_updated_at();


--
-- Name: organizations trg_zzz_seed_gdpr_erasure_permission; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_zzz_seed_gdpr_erasure_permission AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.seed_gdpr_erasure_permission_on_org_insert();


--
-- Name: organizations trg_zzz_seed_npd_allergen_write_permission; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_zzz_seed_npd_allergen_write_permission AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.seed_npd_allergen_write_permission_on_org_insert();


--
-- Name: organizations trg_zzz_seed_npd_org_admin_permissions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_zzz_seed_npd_org_admin_permissions AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.seed_npd_org_admin_permissions_on_org_insert();


--
-- Name: organizations trg_zzz_seed_settings_infra_permissions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_zzz_seed_settings_infra_permissions AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.seed_settings_infra_permissions_on_org_insert();


--
-- Name: organizations trg_zzz_seed_settings_rbac_matrix; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_zzz_seed_settings_rbac_matrix AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.seed_settings_rbac_matrix_on_org_insert();


--
-- Name: organizations trg_zzz_seed_technical_permissions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_zzz_seed_technical_permissions AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.seed_technical_permissions_on_org_insert();


--
-- Name: organizations trg_zzzz_revoke_schema_admin_sod_overgrant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_zzzz_revoke_schema_admin_sod_overgrant AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.revoke_schema_admin_sod_overgrant_on_org_insert();


--
-- Name: unit_of_measure unit_of_measure_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER unit_of_measure_set_updated_at BEFORE UPDATE ON public.unit_of_measure FOR EACH ROW EXECUTE FUNCTION public.unit_of_measure_set_updated_at();


--
-- Name: uom_custom_conversions uom_custom_conversions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER uom_custom_conversions_set_updated_at BEFORE UPDATE ON public.uom_custom_conversions FOR EACH ROW EXECUTE FUNCTION public.unit_of_measure_set_updated_at();


--
-- Name: wo_materials wo_materials_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wo_materials_set_updated_at BEFORE UPDATE ON public.wo_materials FOR EACH ROW EXECUTE FUNCTION public.work_orders_set_updated_at();


--
-- Name: wo_operations wo_operations_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER wo_operations_set_updated_at BEFORE UPDATE ON public.wo_operations FOR EACH ROW EXECUTE FUNCTION public.work_orders_set_updated_at();


--
-- Name: work_orders work_orders_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER work_orders_set_updated_at BEFORE UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.work_orders_set_updated_at();


--
-- Name: AlertThresholds AlertThresholds_org_id_fkey; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."AlertThresholds"
    ADD CONSTRAINT "AlertThresholds_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: Allergens_added_by_Process Allergens_added_by_Process_org_id_fkey; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Allergens_added_by_Process"
    ADD CONSTRAINT "Allergens_added_by_Process_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: Allergens_by_RM Allergens_by_RM_org_id_fkey; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Allergens_by_RM"
    ADD CONSTRAINT "Allergens_by_RM_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: Allergens Allergens_org_id_fkey; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Allergens"
    ADD CONSTRAINT "Allergens_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: ApprovalChainTemplates ApprovalChainTemplates_org_id_fkey; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."ApprovalChainTemplates"
    ADD CONSTRAINT "ApprovalChainTemplates_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: BriefFieldMapping BriefFieldMapping_org_id_fkey; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."BriefFieldMapping"
    ADD CONSTRAINT "BriefFieldMapping_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: CloseConfirm CloseConfirm_org_id_fkey; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."CloseConfirm"
    ADD CONSTRAINT "CloseConfirm_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: D365_Constants D365_Constants_org_id_fkey; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."D365_Constants"
    ADD CONSTRAINT "D365_Constants_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: Departments Departments_org_id_fkey; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Departments"
    ADD CONSTRAINT "Departments_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: DeptColumns DeptColumns_field_type_fkey; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."DeptColumns"
    ADD CONSTRAINT "DeptColumns_field_type_fkey" FOREIGN KEY (field_type) REFERENCES "Reference"."FieldTypes"(code);


--
-- Name: DeptColumns DeptColumns_org_id_fkey; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."DeptColumns"
    ADD CONSTRAINT "DeptColumns_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: Equipment_Setup_By_Line_Pack Equipment_Setup_By_Line_Pack_org_id_fkey; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Equipment_Setup_By_Line_Pack"
    ADD CONSTRAINT "Equipment_Setup_By_Line_Pack_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: Formulas Formulas_org_id_fkey; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Formulas"
    ADD CONSTRAINT "Formulas_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: GateChecklistTemplates GateChecklistTemplates_org_id_fkey; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."GateChecklistTemplates"
    ADD CONSTRAINT "GateChecklistTemplates_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: Lines_By_PackSize Lines_By_PackSize_org_id_fkey; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Lines_By_PackSize"
    ADD CONSTRAINT "Lines_By_PackSize_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: ManufacturingOperations ManufacturingOperations_org_id_fkey; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."ManufacturingOperations"
    ADD CONSTRAINT "ManufacturingOperations_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: PackSizes PackSizes_org_id_fkey; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."PackSizes"
    ADD CONSTRAINT "PackSizes_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: RawMaterials RawMaterials_org_id_fkey; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."RawMaterials"
    ADD CONSTRAINT "RawMaterials_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: Rules Rules_org_id_fkey; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Rules"
    ADD CONSTRAINT "Rules_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: Templates Templates_org_id_fkey; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Templates"
    ADD CONSTRAINT "Templates_org_id_fkey" FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: Allergens_added_by_Process reference_allergens_added_by_process_allergen_fk; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Allergens_added_by_Process"
    ADD CONSTRAINT reference_allergens_added_by_process_allergen_fk FOREIGN KEY (org_id, allergen_code) REFERENCES "Reference"."Allergens"(org_id, allergen_code) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Allergens_by_RM reference_allergens_by_rm_allergen_fk; Type: FK CONSTRAINT; Schema: Reference; Owner: -
--

ALTER TABLE ONLY "Reference"."Allergens_by_RM"
    ADD CONSTRAINT reference_allergens_by_rm_allergen_fk FOREIGN KEY (org_id, allergen_code) REFERENCES "Reference"."Allergens"(org_id, allergen_code) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: active_org_contexts active_org_contexts_org_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.active_org_contexts
    ADD CONSTRAINT active_org_contexts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: active_org_contexts active_org_contexts_session_token_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.active_org_contexts
    ADD CONSTRAINT active_org_contexts_session_token_fkey FOREIGN KEY (session_token) REFERENCES app.session_org_contexts(session_token) ON DELETE CASCADE;


--
-- Name: session_org_contexts session_org_contexts_org_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.session_org_contexts
    ADD CONSTRAINT session_org_contexts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: admin_ip_allowlist admin_ip_allowlist_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_ip_allowlist
    ADD CONSTRAINT admin_ip_allowlist_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: admin_ip_allowlist admin_ip_allowlist_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_ip_allowlist
    ADD CONSTRAINT admin_ip_allowlist_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: allergen_cascade_rebuild_jobs allergen_cascade_rebuild_jobs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allergen_cascade_rebuild_jobs
    ADD CONSTRAINT allergen_cascade_rebuild_jobs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: allergen_cascade_rebuild_jobs allergen_cascade_rebuild_jobs_product_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allergen_cascade_rebuild_jobs
    ADD CONSTRAINT allergen_cascade_rebuild_jobs_product_code_fkey FOREIGN KEY (org_id, product_code) REFERENCES public.product(org_id, product_code) ON DELETE CASCADE;


--
-- Name: allergen_contamination_risk allergen_contamination_risk_assessed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allergen_contamination_risk
    ADD CONSTRAINT allergen_contamination_risk_assessed_by_fkey FOREIGN KEY (assessed_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: allergen_contamination_risk allergen_contamination_risk_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allergen_contamination_risk
    ADD CONSTRAINT allergen_contamination_risk_line_id_fkey FOREIGN KEY (line_id) REFERENCES public.production_lines(id) ON DELETE CASCADE;


--
-- Name: allergen_contamination_risk allergen_contamination_risk_machine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allergen_contamination_risk
    ADD CONSTRAINT allergen_contamination_risk_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES public.machines(id) ON DELETE CASCADE;


--
-- Name: allergen_contamination_risk allergen_contamination_risk_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allergen_contamination_risk
    ADD CONSTRAINT allergen_contamination_risk_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: audit_log audit_log_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.audit_log
    ADD CONSTRAINT audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: audit_log audit_log_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.audit_log
    ADD CONSTRAINT audit_log_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: bom_co_products bom_co_products_co_product_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_co_products
    ADD CONSTRAINT bom_co_products_co_product_item_id_fkey FOREIGN KEY (co_product_item_id) REFERENCES public.items(id) ON DELETE RESTRICT;


--
-- Name: bom_co_products bom_co_products_header_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_co_products
    ADD CONSTRAINT bom_co_products_header_org_fk FOREIGN KEY (bom_header_id, org_id) REFERENCES public.bom_headers(id, org_id) ON DELETE CASCADE;


--
-- Name: bom_co_products bom_co_products_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_co_products
    ADD CONSTRAINT bom_co_products_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: bom_generator_jobs bom_generator_jobs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_generator_jobs
    ADD CONSTRAINT bom_generator_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: bom_generator_jobs bom_generator_jobs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_generator_jobs
    ADD CONSTRAINT bom_generator_jobs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: bom_headers bom_headers_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_headers
    ADD CONSTRAINT bom_headers_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: bom_headers bom_headers_created_by_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_headers
    ADD CONSTRAINT bom_headers_created_by_user_fkey FOREIGN KEY (created_by_user) REFERENCES public.users(id);


--
-- Name: bom_headers bom_headers_npd_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_headers
    ADD CONSTRAINT bom_headers_npd_project_id_fkey FOREIGN KEY (npd_project_id) REFERENCES public.npd_projects(id) ON DELETE SET NULL;


--
-- Name: bom_headers bom_headers_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_headers
    ADD CONSTRAINT bom_headers_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: bom_headers bom_headers_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_headers
    ADD CONSTRAINT bom_headers_product_id_fkey FOREIGN KEY (org_id, product_id) REFERENCES public.product(org_id, product_code) ON DELETE RESTRICT;


--
-- Name: bom_headers bom_headers_supersedes_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_headers
    ADD CONSTRAINT bom_headers_supersedes_fk FOREIGN KEY (supersedes_bom_header_id, org_id) REFERENCES public.bom_headers(id, org_id) ON DELETE RESTRICT;


--
-- Name: bom_headers bom_headers_technical_review_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_headers
    ADD CONSTRAINT bom_headers_technical_review_requested_by_fkey FOREIGN KEY (technical_review_requested_by) REFERENCES public.users(id);


--
-- Name: bom_item bom_item_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_item
    ADD CONSTRAINT bom_item_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: bom_lines bom_lines_header_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_lines
    ADD CONSTRAINT bom_lines_header_org_fk FOREIGN KEY (bom_header_id, org_id) REFERENCES public.bom_headers(id, org_id) ON DELETE CASCADE;


--
-- Name: bom_lines bom_lines_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_lines
    ADD CONSTRAINT bom_lines_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT;


--
-- Name: bom_lines bom_lines_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_lines
    ADD CONSTRAINT bom_lines_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: bom_snapshots bom_snapshots_header_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_snapshots
    ADD CONSTRAINT bom_snapshots_header_org_fk FOREIGN KEY (bom_header_id, org_id) REFERENCES public.bom_headers(id, org_id) ON DELETE RESTRICT;


--
-- Name: bom_snapshots bom_snapshots_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bom_snapshots
    ADD CONSTRAINT bom_snapshots_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: brief brief_converted_by_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brief
    ADD CONSTRAINT brief_converted_by_user_fkey FOREIGN KEY (converted_by_user) REFERENCES public.users(id);


--
-- Name: brief brief_created_by_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brief
    ADD CONSTRAINT brief_created_by_user_fkey FOREIGN KEY (created_by_user) REFERENCES public.users(id);


--
-- Name: brief_lines brief_lines_brief_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brief_lines
    ADD CONSTRAINT brief_lines_brief_id_fkey FOREIGN KEY (brief_id) REFERENCES public.brief(brief_id) ON DELETE CASCADE;


--
-- Name: brief_lines brief_lines_brief_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brief_lines
    ADD CONSTRAINT brief_lines_brief_org_fkey FOREIGN KEY (brief_id, org_id) REFERENCES public.brief(brief_id, org_id) ON DELETE CASCADE;


--
-- Name: brief_lines brief_lines_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brief_lines
    ADD CONSTRAINT brief_lines_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: brief brief_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brief
    ADD CONSTRAINT brief_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: brief_to_fa_audit brief_to_fa_audit_brief_org_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brief_to_fa_audit
    ADD CONSTRAINT brief_to_fa_audit_brief_org_fkey FOREIGN KEY (brief_id, org_id) REFERENCES public.brief(brief_id, org_id) ON DELETE CASCADE;


--
-- Name: brief_to_fa_audit brief_to_fa_audit_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brief_to_fa_audit
    ADD CONSTRAINT brief_to_fa_audit_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: capacity_plan_lines capacity_plan_lines_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capacity_plan_lines
    ADD CONSTRAINT capacity_plan_lines_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: capacity_plan_lines capacity_plan_lines_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capacity_plan_lines
    ADD CONSTRAINT capacity_plan_lines_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.capacity_plans(id) ON DELETE CASCADE;


--
-- Name: capacity_plans capacity_plans_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capacity_plans
    ADD CONSTRAINT capacity_plans_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: capacity_plans capacity_plans_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.capacity_plans
    ADD CONSTRAINT capacity_plans_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: compliance_docs compliance_docs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_docs
    ADD CONSTRAINT compliance_docs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: compliance_docs compliance_docs_product_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_docs
    ADD CONSTRAINT compliance_docs_product_code_fkey FOREIGN KEY (org_id, product_code) REFERENCES public.product(org_id, product_code) ON DELETE CASCADE;


--
-- Name: compliance_docs compliance_docs_uploaded_by_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_docs
    ADD CONSTRAINT compliance_docs_uploaded_by_user_fkey FOREIGN KEY (uploaded_by_user) REFERENCES public.users(id);


--
-- Name: consumed_approval_tokens consumed_approval_tokens_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumed_approval_tokens
    ADD CONSTRAINT consumed_approval_tokens_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: costing_breakdowns costing_breakdowns_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.costing_breakdowns
    ADD CONSTRAINT costing_breakdowns_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: costing_breakdowns costing_breakdowns_product_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.costing_breakdowns
    ADD CONSTRAINT costing_breakdowns_product_code_fkey FOREIGN KEY (org_id, product_code) REFERENCES public.product(org_id, product_code) ON DELETE CASCADE;


--
-- Name: costing_waterfall_steps costing_waterfall_steps_breakdown_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.costing_waterfall_steps
    ADD CONSTRAINT costing_waterfall_steps_breakdown_id_fkey FOREIGN KEY (breakdown_id) REFERENCES public.costing_breakdowns(id) ON DELETE CASCADE;


--
-- Name: d365_import_cache d365_import_cache_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.d365_import_cache
    ADD CONSTRAINT d365_import_cache_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: d365_sync_dlq d365_sync_dlq_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.d365_sync_dlq
    ADD CONSTRAINT d365_sync_dlq_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.d365_sync_jobs(id) ON DELETE SET NULL;


--
-- Name: d365_sync_dlq d365_sync_dlq_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.d365_sync_dlq
    ADD CONSTRAINT d365_sync_dlq_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: d365_sync_dlq d365_sync_dlq_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.d365_sync_dlq
    ADD CONSTRAINT d365_sync_dlq_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: d365_sync_jobs d365_sync_jobs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.d365_sync_jobs
    ADD CONSTRAINT d365_sync_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: d365_sync_jobs d365_sync_jobs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.d365_sync_jobs
    ADD CONSTRAINT d365_sync_jobs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: d365_sync_runs d365_sync_runs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.d365_sync_runs
    ADD CONSTRAINT d365_sync_runs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: dept_column_drafts dept_column_drafts_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dept_column_drafts
    ADD CONSTRAINT dept_column_drafts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: e_sign_log e_sign_log_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.e_sign_log
    ADD CONSTRAINT e_sign_log_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: e_sign_log e_sign_log_signer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.e_sign_log
    ADD CONSTRAINT e_sign_log_signer_user_id_fkey FOREIGN KEY (signer_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: email_delivery_log email_delivery_log_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_delivery_log
    ADD CONSTRAINT email_delivery_log_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: fa_allergen_overrides fa_allergen_overrides_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_allergen_overrides
    ADD CONSTRAINT fa_allergen_overrides_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id);


--
-- Name: fa_allergen_overrides fa_allergen_overrides_allergen_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_allergen_overrides
    ADD CONSTRAINT fa_allergen_overrides_allergen_fk FOREIGN KEY (org_id, allergen_code) REFERENCES "Reference"."Allergens"(org_id, allergen_code) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: fa_allergen_overrides fa_allergen_overrides_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_allergen_overrides
    ADD CONSTRAINT fa_allergen_overrides_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: fa_allergen_overrides fa_allergen_overrides_product_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_allergen_overrides
    ADD CONSTRAINT fa_allergen_overrides_product_code_fkey FOREIGN KEY (org_id, product_code) REFERENCES public.product(org_id, product_code) ON DELETE CASCADE;


--
-- Name: fa_allergen_overrides fa_allergen_overrides_supersedes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_allergen_overrides
    ADD CONSTRAINT fa_allergen_overrides_supersedes_id_fkey FOREIGN KEY (supersedes_id) REFERENCES public.fa_allergen_overrides(id);


--
-- Name: fa_builder_outputs fa_builder_outputs_generated_by_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_builder_outputs
    ADD CONSTRAINT fa_builder_outputs_generated_by_user_fkey FOREIGN KEY (generated_by_user) REFERENCES public.users(id);


--
-- Name: fa_builder_outputs fa_builder_outputs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_builder_outputs
    ADD CONSTRAINT fa_builder_outputs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: fa_builder_outputs fa_builder_outputs_product_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fa_builder_outputs
    ADD CONSTRAINT fa_builder_outputs_product_code_fkey FOREIGN KEY (org_id, product_code) REFERENCES public.product(org_id, product_code) ON DELETE CASCADE;


--
-- Name: factory_release_status factory_release_status_bom_header_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factory_release_status
    ADD CONSTRAINT factory_release_status_bom_header_fk FOREIGN KEY (active_bom_header_id, org_id) REFERENCES public.bom_headers(id, org_id) ON DELETE RESTRICT;


--
-- Name: factory_release_status factory_release_status_factory_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factory_release_status
    ADD CONSTRAINT factory_release_status_factory_approved_by_fkey FOREIGN KEY (factory_approved_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: factory_release_status factory_release_status_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factory_release_status
    ADD CONSTRAINT factory_release_status_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: factory_release_status factory_release_status_product_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factory_release_status
    ADD CONSTRAINT factory_release_status_product_code_fkey FOREIGN KEY (org_id, product_code) REFERENCES public.product(org_id, product_code) ON DELETE RESTRICT;


--
-- Name: factory_release_status factory_release_status_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factory_release_status
    ADD CONSTRAINT factory_release_status_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.npd_projects(id) ON DELETE CASCADE;


--
-- Name: factory_release_status factory_release_status_release_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factory_release_status
    ADD CONSTRAINT factory_release_status_release_event_id_fkey FOREIGN KEY (release_event_id) REFERENCES public.outbox_events(id) ON DELETE RESTRICT;


--
-- Name: factory_release_status factory_release_status_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factory_release_status
    ADD CONSTRAINT factory_release_status_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: factory_specs factory_specs_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factory_specs
    ADD CONSTRAINT factory_specs_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: factory_specs factory_specs_bom_header_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factory_specs
    ADD CONSTRAINT factory_specs_bom_header_fk FOREIGN KEY (bom_header_id, org_id) REFERENCES public.bom_headers(id, org_id) ON DELETE RESTRICT;


--
-- Name: factory_specs factory_specs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factory_specs
    ADD CONSTRAINT factory_specs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: factory_specs factory_specs_fg_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factory_specs
    ADD CONSTRAINT factory_specs_fg_item_id_fkey FOREIGN KEY (fg_item_id) REFERENCES public.items(id) ON DELETE RESTRICT;


--
-- Name: factory_specs factory_specs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factory_specs
    ADD CONSTRAINT factory_specs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: factory_specs factory_specs_released_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factory_specs
    ADD CONSTRAINT factory_specs_released_by_fkey FOREIGN KEY (released_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: factory_specs factory_specs_supersedes_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factory_specs
    ADD CONSTRAINT factory_specs_supersedes_fk FOREIGN KEY (supersedes_factory_spec_id) REFERENCES public.factory_specs(id) ON DELETE RESTRICT;


--
-- Name: feature_flags_core feature_flags_core_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_flags_core
    ADD CONSTRAINT feature_flags_core_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: formulation_audit_log formulation_audit_log_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_audit_log
    ADD CONSTRAINT formulation_audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id);


--
-- Name: formulation_audit_log formulation_audit_log_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_audit_log
    ADD CONSTRAINT formulation_audit_log_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: formulation_calc_cache formulation_calc_cache_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_calc_cache
    ADD CONSTRAINT formulation_calc_cache_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.formulation_versions(id) ON DELETE CASCADE;


--
-- Name: formulation_ingredients formulation_ingredients_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_ingredients
    ADD CONSTRAINT formulation_ingredients_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE SET NULL;


--
-- Name: formulation_ingredients formulation_ingredients_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_ingredients
    ADD CONSTRAINT formulation_ingredients_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.formulation_versions(id) ON DELETE CASCADE;


--
-- Name: formulation_versions formulation_versions_created_by_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_versions
    ADD CONSTRAINT formulation_versions_created_by_user_fkey FOREIGN KEY (created_by_user) REFERENCES public.users(id);


--
-- Name: formulation_versions formulation_versions_formulation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulation_versions
    ADD CONSTRAINT formulation_versions_formulation_id_fkey FOREIGN KEY (formulation_id) REFERENCES public.formulations(id) ON DELETE CASCADE;


--
-- Name: formulations formulations_created_by_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_created_by_user_fkey FOREIGN KEY (created_by_user) REFERENCES public.users(id);


--
-- Name: formulations formulations_current_version_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_current_version_fk FOREIGN KEY (current_version_id) REFERENCES public.formulation_versions(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;


--
-- Name: formulations formulations_locked_by_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_locked_by_user_fkey FOREIGN KEY (locked_by_user) REFERENCES public.users(id);


--
-- Name: formulations formulations_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: formulations formulations_product_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_product_code_fkey FOREIGN KEY (org_id, product_code) REFERENCES public.product(org_id, product_code);


--
-- Name: formulations formulations_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formulations
    ADD CONSTRAINT formulations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.npd_projects(id) ON DELETE CASCADE;


--
-- Name: gate_approvals gate_approvals_approver_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gate_approvals
    ADD CONSTRAINT gate_approvals_approver_user_id_fkey FOREIGN KEY (approver_user_id) REFERENCES public.users(id);


--
-- Name: gate_approvals gate_approvals_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gate_approvals
    ADD CONSTRAINT gate_approvals_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: gate_approvals gate_approvals_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gate_approvals
    ADD CONSTRAINT gate_approvals_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.npd_projects(id) ON DELETE SET NULL;


--
-- Name: gate_checklist_items gate_checklist_items_completed_by_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gate_checklist_items
    ADD CONSTRAINT gate_checklist_items_completed_by_user_fkey FOREIGN KEY (completed_by_user) REFERENCES public.users(id);


--
-- Name: gate_checklist_items gate_checklist_items_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gate_checklist_items
    ADD CONSTRAINT gate_checklist_items_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: gate_checklist_items gate_checklist_items_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gate_checklist_items
    ADD CONSTRAINT gate_checklist_items_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.npd_projects(id) ON DELETE CASCADE;


--
-- Name: gdpr_erasure_requests gdpr_erasure_requests_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gdpr_erasure_requests
    ADD CONSTRAINT gdpr_erasure_requests_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: integration_settings integration_settings_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_settings
    ADD CONSTRAINT integration_settings_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: item_allergen_profile_overrides item_allergen_profile_overrides_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_allergen_profile_overrides
    ADD CONSTRAINT item_allergen_profile_overrides_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: item_allergen_profile_overrides item_allergen_profile_overrides_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_allergen_profile_overrides
    ADD CONSTRAINT item_allergen_profile_overrides_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: item_allergen_profile_overrides item_allergen_profile_overrides_overridden_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_allergen_profile_overrides
    ADD CONSTRAINT item_allergen_profile_overrides_overridden_by_fkey FOREIGN KEY (overridden_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: item_allergen_profiles item_allergen_profiles_declared_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_allergen_profiles
    ADD CONSTRAINT item_allergen_profiles_declared_by_fkey FOREIGN KEY (declared_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: item_allergen_profiles item_allergen_profiles_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_allergen_profiles
    ADD CONSTRAINT item_allergen_profiles_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: item_allergen_profiles item_allergen_profiles_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_allergen_profiles
    ADD CONSTRAINT item_allergen_profiles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: item_cost_history item_cost_history_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_cost_history
    ADD CONSTRAINT item_cost_history_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: item_cost_history item_cost_history_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_cost_history
    ADD CONSTRAINT item_cost_history_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: item_cost_history item_cost_history_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_cost_history
    ADD CONSTRAINT item_cost_history_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: items items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: items items_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: lab_results lab_results_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_results
    ADD CONSTRAINT lab_results_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: lab_results lab_results_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_results
    ADD CONSTRAINT lab_results_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT;


--
-- Name: lab_results lab_results_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_results
    ADD CONSTRAINT lab_results_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: line_machines line_machines_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.line_machines
    ADD CONSTRAINT line_machines_line_id_fkey FOREIGN KEY (line_id) REFERENCES public.production_lines(id) ON DELETE CASCADE;


--
-- Name: line_machines line_machines_machine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.line_machines
    ADD CONSTRAINT line_machines_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES public.machines(id) ON DELETE CASCADE;


--
-- Name: locations locations_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: locations locations_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.locations(id) ON DELETE RESTRICT;


--
-- Name: locations locations_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;


--
-- Name: login_attempts login_attempts_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_attempts
    ADD CONSTRAINT login_attempts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: login_attempts login_attempts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_attempts
    ADD CONSTRAINT login_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: lot lot_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lot
    ADD CONSTRAINT lot_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: machines machines_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.machines
    ADD CONSTRAINT machines_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: machines machines_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.machines
    ADD CONSTRAINT machines_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: manufacturing_operation_allergen_additions manufacturing_operation_allergen_additions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_operation_allergen_additions
    ADD CONSTRAINT manufacturing_operation_allergen_additions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: manufacturing_operation_allergen_additions manufacturing_operation_allergen_additions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturing_operation_allergen_additions
    ADD CONSTRAINT manufacturing_operation_allergen_additions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: mfa_secrets mfa_secrets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfa_secrets
    ADD CONSTRAINT mfa_secrets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: mrp_planned_orders mrp_planned_orders_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mrp_planned_orders
    ADD CONSTRAINT mrp_planned_orders_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT;


--
-- Name: mrp_planned_orders mrp_planned_orders_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mrp_planned_orders
    ADD CONSTRAINT mrp_planned_orders_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: mrp_planned_orders mrp_planned_orders_requirement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mrp_planned_orders
    ADD CONSTRAINT mrp_planned_orders_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES public.mrp_requirements(id) ON DELETE CASCADE;


--
-- Name: mrp_planned_orders mrp_planned_orders_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mrp_planned_orders
    ADD CONSTRAINT mrp_planned_orders_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.mrp_runs(id) ON DELETE CASCADE;


--
-- Name: mrp_requirements mrp_requirements_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mrp_requirements
    ADD CONSTRAINT mrp_requirements_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT;


--
-- Name: mrp_requirements mrp_requirements_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mrp_requirements
    ADD CONSTRAINT mrp_requirements_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: mrp_requirements mrp_requirements_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mrp_requirements
    ADD CONSTRAINT mrp_requirements_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.mrp_runs(id) ON DELETE CASCADE;


--
-- Name: mrp_runs mrp_runs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mrp_runs
    ADD CONSTRAINT mrp_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: mrp_runs mrp_runs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mrp_runs
    ADD CONSTRAINT mrp_runs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: notification_preferences notification_preferences_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: notification_preferences notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: npd_legacy_closeout npd_legacy_closeout_bom_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npd_legacy_closeout
    ADD CONSTRAINT npd_legacy_closeout_bom_fk FOREIGN KEY (handoff_bom_header_id, org_id) REFERENCES public.bom_headers(id, org_id) ON DELETE RESTRICT;


--
-- Name: npd_legacy_closeout npd_legacy_closeout_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npd_legacy_closeout
    ADD CONSTRAINT npd_legacy_closeout_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: npd_legacy_closeout npd_legacy_closeout_created_by_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npd_legacy_closeout
    ADD CONSTRAINT npd_legacy_closeout_created_by_user_fkey FOREIGN KEY (created_by_user) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: npd_legacy_closeout npd_legacy_closeout_handoff_g4_esign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npd_legacy_closeout
    ADD CONSTRAINT npd_legacy_closeout_handoff_g4_esign_id_fkey FOREIGN KEY (handoff_g4_esign_id) REFERENCES public.gate_approvals(id) ON DELETE RESTRICT;


--
-- Name: npd_legacy_closeout npd_legacy_closeout_npd_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npd_legacy_closeout
    ADD CONSTRAINT npd_legacy_closeout_npd_project_id_fkey FOREIGN KEY (npd_project_id) REFERENCES public.npd_projects(id) ON DELETE CASCADE;


--
-- Name: npd_legacy_closeout npd_legacy_closeout_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npd_legacy_closeout
    ADD CONSTRAINT npd_legacy_closeout_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: npd_legacy_closeout npd_legacy_closeout_product_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npd_legacy_closeout
    ADD CONSTRAINT npd_legacy_closeout_product_fk FOREIGN KEY (org_id, fg_product_code) REFERENCES public.product(org_id, product_code) ON DELETE RESTRICT;


--
-- Name: npd_legacy_closeout npd_legacy_closeout_release_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npd_legacy_closeout
    ADD CONSTRAINT npd_legacy_closeout_release_event_id_fkey FOREIGN KEY (release_event_id) REFERENCES public.outbox_events(id) ON DELETE RESTRICT;


--
-- Name: npd_projects npd_projects_created_by_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npd_projects
    ADD CONSTRAINT npd_projects_created_by_user_fkey FOREIGN KEY (created_by_user) REFERENCES public.users(id);


--
-- Name: npd_projects npd_projects_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npd_projects
    ADD CONSTRAINT npd_projects_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: npd_projects npd_projects_product_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npd_projects
    ADD CONSTRAINT npd_projects_product_code_fkey FOREIGN KEY (org_id, product_code) REFERENCES public.product(org_id, product_code);


--
-- Name: nutri_score_results nutri_score_results_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutri_score_results
    ADD CONSTRAINT nutri_score_results_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: nutri_score_results nutri_score_results_product_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutri_score_results
    ADD CONSTRAINT nutri_score_results_product_code_fkey FOREIGN KEY (org_id, product_code) REFERENCES public.product(org_id, product_code) ON DELETE CASCADE;


--
-- Name: nutrition_allergens nutrition_allergens_audited_by_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutrition_allergens
    ADD CONSTRAINT nutrition_allergens_audited_by_user_fkey FOREIGN KEY (audited_by_user) REFERENCES public.users(id);


--
-- Name: nutrition_allergens nutrition_allergens_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutrition_allergens
    ADD CONSTRAINT nutrition_allergens_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: nutrition_allergens nutrition_allergens_product_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutrition_allergens
    ADD CONSTRAINT nutrition_allergens_product_code_fkey FOREIGN KEY (org_id, product_code) REFERENCES public.product(org_id, product_code) ON DELETE CASCADE;


--
-- Name: nutrition_profiles nutrition_profiles_nutrient_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutrition_profiles
    ADD CONSTRAINT nutrition_profiles_nutrient_code_fkey FOREIGN KEY (nutrient_code) REFERENCES "Reference"."Nutrients"(nutrient_code) ON UPDATE CASCADE;


--
-- Name: nutrition_profiles nutrition_profiles_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutrition_profiles
    ADD CONSTRAINT nutrition_profiles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: nutrition_profiles nutrition_profiles_product_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutrition_profiles
    ADD CONSTRAINT nutrition_profiles_product_code_fkey FOREIGN KEY (org_id, product_code) REFERENCES public.product(org_id, product_code) ON DELETE CASCADE;


--
-- Name: org_authorization_policies org_authorization_policies_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_authorization_policies
    ADD CONSTRAINT org_authorization_policies_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_authorization_policies org_authorization_policies_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_authorization_policies
    ADD CONSTRAINT org_authorization_policies_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_security_policies org_security_policies_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_security_policies
    ADD CONSTRAINT org_security_policies_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_sequences org_sequences_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_sequences
    ADD CONSTRAINT org_sequences_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_modules organization_modules_enabled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_modules
    ADD CONSTRAINT organization_modules_enabled_by_fkey FOREIGN KEY (enabled_by) REFERENCES public.users(id);


--
-- Name: organization_modules organization_modules_module_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_modules
    ADD CONSTRAINT organization_modules_module_code_fkey FOREIGN KEY (module_code) REFERENCES public.modules(code);


--
-- Name: organization_modules organization_modules_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_modules
    ADD CONSTRAINT organization_modules_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: organizations organizations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: password_history password_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_history
    ADD CONSTRAINT password_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: prod_detail prod_detail_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prod_detail
    ADD CONSTRAINT prod_detail_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE SET NULL;


--
-- Name: prod_detail prod_detail_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prod_detail
    ADD CONSTRAINT prod_detail_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: prod_detail prod_detail_product_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prod_detail
    ADD CONSTRAINT prod_detail_product_code_fkey FOREIGN KEY (org_id, product_code) REFERENCES public.product(org_id, product_code) ON DELETE CASCADE;


--
-- Name: product product_created_by_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_created_by_user_fkey FOREIGN KEY (created_by_user) REFERENCES public.users(id);


--
-- Name: product product_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: production_lines production_lines_default_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_lines
    ADD CONSTRAINT production_lines_default_location_id_fkey FOREIGN KEY (default_location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: production_lines production_lines_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.production_lines
    ADD CONSTRAINT production_lines_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: quality_event quality_event_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quality_event
    ADD CONSTRAINT quality_event_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: recovery_codes recovery_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recovery_codes
    ADD CONSTRAINT recovery_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: reference_csv_import_reports reference_csv_import_reports_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_csv_import_reports
    ADD CONSTRAINT reference_csv_import_reports_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: reference_csv_import_reports reference_csv_import_reports_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_csv_import_reports
    ADD CONSTRAINT reference_csv_import_reports_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: reference_schemas reference_schemas_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_schemas
    ADD CONSTRAINT reference_schemas_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: reference_schemas reference_schemas_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_schemas
    ADD CONSTRAINT reference_schemas_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: reference_tables reference_tables_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_tables
    ADD CONSTRAINT reference_tables_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: reference_tables reference_tables_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_tables
    ADD CONSTRAINT reference_tables_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: reorder_thresholds reorder_thresholds_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reorder_thresholds
    ADD CONSTRAINT reorder_thresholds_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: reorder_thresholds reorder_thresholds_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reorder_thresholds
    ADD CONSTRAINT reorder_thresholds_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: reorder_thresholds reorder_thresholds_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reorder_thresholds
    ADD CONSTRAINT reorder_thresholds_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: risks risks_closed_by_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risks
    ADD CONSTRAINT risks_closed_by_user_fkey FOREIGN KEY (closed_by_user) REFERENCES public.users(id);


--
-- Name: risks risks_created_by_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risks
    ADD CONSTRAINT risks_created_by_user_fkey FOREIGN KEY (created_by_user) REFERENCES public.users(id);


--
-- Name: risks risks_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risks
    ADD CONSTRAINT risks_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: risks risks_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risks
    ADD CONSTRAINT risks_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id);


--
-- Name: risks risks_product_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risks
    ADD CONSTRAINT risks_product_code_fkey FOREIGN KEY (org_id, product_code) REFERENCES public.product(org_id, product_code) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: roles roles_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: routing_operations routing_operations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routing_operations
    ADD CONSTRAINT routing_operations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: routing_operations routing_operations_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routing_operations
    ADD CONSTRAINT routing_operations_line_id_fkey FOREIGN KEY (line_id) REFERENCES public.production_lines(id) ON DELETE SET NULL;


--
-- Name: routing_operations routing_operations_machine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routing_operations
    ADD CONSTRAINT routing_operations_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES public.machines(id) ON DELETE SET NULL;


--
-- Name: routing_operations routing_operations_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routing_operations
    ADD CONSTRAINT routing_operations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: routing_operations routing_operations_routing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routing_operations
    ADD CONSTRAINT routing_operations_routing_id_fkey FOREIGN KEY (routing_id) REFERENCES public.routings(id) ON DELETE CASCADE;


--
-- Name: routings routings_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routings
    ADD CONSTRAINT routings_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: routings routings_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routings
    ADD CONSTRAINT routings_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: routings routings_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routings
    ADD CONSTRAINT routings_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: routings routings_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routings
    ADD CONSTRAINT routings_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: rule_definitions rule_definitions_deployed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_definitions
    ADD CONSTRAINT rule_definitions_deployed_by_fkey FOREIGN KEY (deployed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: rule_definitions rule_definitions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_definitions
    ADD CONSTRAINT rule_definitions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: rule_dry_runs rule_dry_runs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_dry_runs
    ADD CONSTRAINT rule_dry_runs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: rule_dry_runs rule_dry_runs_ran_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_dry_runs
    ADD CONSTRAINT rule_dry_runs_ran_by_fkey FOREIGN KEY (ran_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: rule_dry_runs rule_dry_runs_rule_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_dry_runs
    ADD CONSTRAINT rule_dry_runs_rule_definition_id_fkey FOREIGN KEY (rule_definition_id) REFERENCES public.rule_definitions(id) ON DELETE CASCADE;


--
-- Name: schedule_outputs schedule_outputs_downstream_wo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_outputs
    ADD CONSTRAINT schedule_outputs_downstream_wo_id_fkey FOREIGN KEY (downstream_wo_id) REFERENCES public.work_orders(id) ON DELETE SET NULL;


--
-- Name: schedule_outputs schedule_outputs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_outputs
    ADD CONSTRAINT schedule_outputs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: schedule_outputs schedule_outputs_planned_wo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_outputs
    ADD CONSTRAINT schedule_outputs_planned_wo_id_fkey FOREIGN KEY (planned_wo_id) REFERENCES public.work_orders(id) ON DELETE CASCADE;


--
-- Name: schema_migrations schema_migrations_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: schema_migrations schema_migrations_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: scim_group_members scim_group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scim_group_members
    ADD CONSTRAINT scim_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.scim_groups(id) ON DELETE CASCADE;


--
-- Name: scim_groups scim_groups_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scim_groups
    ADD CONSTRAINT scim_groups_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: scim_tokens scim_tokens_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scim_tokens
    ADD CONSTRAINT scim_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: scim_tokens scim_tokens_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scim_tokens
    ADD CONSTRAINT scim_tokens_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: shipment shipment_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment
    ADD CONSTRAINT shipment_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: supplier_spec_review_proposals supplier_spec_review_proposals_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_spec_review_proposals
    ADD CONSTRAINT supplier_spec_review_proposals_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: supplier_spec_review_proposals supplier_spec_review_proposals_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_spec_review_proposals
    ADD CONSTRAINT supplier_spec_review_proposals_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: supplier_spec_review_proposals supplier_spec_review_proposals_resulting_spec_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_spec_review_proposals
    ADD CONSTRAINT supplier_spec_review_proposals_resulting_spec_fk FOREIGN KEY (resulting_supplier_spec_id) REFERENCES public.supplier_specs(id) ON DELETE SET NULL;


--
-- Name: supplier_spec_review_proposals supplier_spec_review_proposals_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_spec_review_proposals
    ADD CONSTRAINT supplier_spec_review_proposals_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: supplier_spec_review_proposals supplier_spec_review_proposals_spec_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_spec_review_proposals
    ADD CONSTRAINT supplier_spec_review_proposals_spec_org_fk FOREIGN KEY (supplier_spec_id) REFERENCES public.supplier_specs(id) ON DELETE CASCADE;


--
-- Name: supplier_specs supplier_specs_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_specs
    ADD CONSTRAINT supplier_specs_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: supplier_specs supplier_specs_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_specs
    ADD CONSTRAINT supplier_specs_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT;


--
-- Name: supplier_specs supplier_specs_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_specs
    ADD CONSTRAINT supplier_specs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: supplier_specs supplier_specs_rejected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_specs
    ADD CONSTRAINT supplier_specs_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: supplier_specs supplier_specs_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_specs
    ADD CONSTRAINT supplier_specs_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: tax_codes tax_codes_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_codes
    ADD CONSTRAINT tax_codes_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: technical_sensory_evaluations technical_sensory_evaluations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technical_sensory_evaluations
    ADD CONSTRAINT technical_sensory_evaluations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: technical_sensory_evaluations technical_sensory_evaluations_evaluated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technical_sensory_evaluations
    ADD CONSTRAINT technical_sensory_evaluations_evaluated_by_fkey FOREIGN KEY (evaluated_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: technical_sensory_evaluations technical_sensory_evaluations_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technical_sensory_evaluations
    ADD CONSTRAINT technical_sensory_evaluations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: technical_sensory_evaluations technical_sensory_evaluations_subject_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.technical_sensory_evaluations
    ADD CONSTRAINT technical_sensory_evaluations_subject_item_id_fkey FOREIGN KEY (subject_item_id) REFERENCES public.items(id) ON DELETE RESTRICT;


--
-- Name: tenant_idp_config tenant_idp_config_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_idp_config
    ADD CONSTRAINT tenant_idp_config_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tenant_migrations tenant_migrations_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_migrations
    ADD CONSTRAINT tenant_migrations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: tenant_migrations tenant_migrations_scheduled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_migrations
    ADD CONSTRAINT tenant_migrations_scheduled_by_fkey FOREIGN KEY (scheduled_by) REFERENCES public.users(id);


--
-- Name: tenant_migrations_legacy_t038 tenant_migrations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_migrations_legacy_t038
    ADD CONSTRAINT tenant_migrations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;


--
-- Name: tenant_variations tenant_variations_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_variations
    ADD CONSTRAINT tenant_variations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: unit_of_measure unit_of_measure_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unit_of_measure
    ADD CONSTRAINT unit_of_measure_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: uom_custom_conversions uom_custom_conversions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uom_custom_conversions
    ADD CONSTRAINT uom_custom_conversions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: user_pins user_pins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_pins
    ADD CONSTRAINT user_pins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id);


--
-- Name: users users_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- Name: warehouses warehouses_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: wo_dependencies wo_dependencies_child_wo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_dependencies
    ADD CONSTRAINT wo_dependencies_child_wo_id_fkey FOREIGN KEY (child_wo_id) REFERENCES public.work_orders(id) ON DELETE CASCADE;


--
-- Name: wo_dependencies wo_dependencies_material_link_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_dependencies
    ADD CONSTRAINT wo_dependencies_material_link_fkey FOREIGN KEY (material_link) REFERENCES public.wo_materials(id) ON DELETE SET NULL;


--
-- Name: wo_dependencies wo_dependencies_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_dependencies
    ADD CONSTRAINT wo_dependencies_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: wo_dependencies wo_dependencies_parent_wo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_dependencies
    ADD CONSTRAINT wo_dependencies_parent_wo_id_fkey FOREIGN KEY (parent_wo_id) REFERENCES public.work_orders(id) ON DELETE CASCADE;


--
-- Name: wo_materials wo_materials_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_materials
    ADD CONSTRAINT wo_materials_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: wo_materials wo_materials_source_wo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_materials
    ADD CONSTRAINT wo_materials_source_wo_id_fkey FOREIGN KEY (source_wo_id) REFERENCES public.work_orders(id) ON DELETE RESTRICT;


--
-- Name: wo_materials wo_materials_wo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_materials
    ADD CONSTRAINT wo_materials_wo_id_fkey FOREIGN KEY (wo_id) REFERENCES public.work_orders(id) ON DELETE CASCADE;


--
-- Name: wo_operations wo_operations_completed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_operations
    ADD CONSTRAINT wo_operations_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: wo_operations wo_operations_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_operations
    ADD CONSTRAINT wo_operations_line_id_fkey FOREIGN KEY (line_id) REFERENCES public.production_lines(id) ON DELETE SET NULL;


--
-- Name: wo_operations wo_operations_machine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_operations
    ADD CONSTRAINT wo_operations_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES public.machines(id) ON DELETE SET NULL;


--
-- Name: wo_operations wo_operations_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_operations
    ADD CONSTRAINT wo_operations_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: wo_operations wo_operations_started_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_operations
    ADD CONSTRAINT wo_operations_started_by_fkey FOREIGN KEY (started_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: wo_operations wo_operations_wo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_operations
    ADD CONSTRAINT wo_operations_wo_id_fkey FOREIGN KEY (wo_id) REFERENCES public.work_orders(id) ON DELETE CASCADE;


--
-- Name: wo_status_history wo_status_history_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_status_history
    ADD CONSTRAINT wo_status_history_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: wo_status_history wo_status_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_status_history
    ADD CONSTRAINT wo_status_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: work_order work_order_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order
    ADD CONSTRAINT work_order_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: work_orders work_orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: work_orders work_orders_machine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES public.machines(id) ON DELETE SET NULL;


--
-- Name: work_orders work_orders_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: work_orders work_orders_production_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_production_line_id_fkey FOREIGN KEY (production_line_id) REFERENCES public.production_lines(id) ON DELETE SET NULL;


--
-- Name: work_orders work_orders_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: AlertThresholds; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."AlertThresholds" ENABLE ROW LEVEL SECURITY;

--
-- Name: Allergens; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."Allergens" ENABLE ROW LEVEL SECURITY;

--
-- Name: Allergens_added_by_Process; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."Allergens_added_by_Process" ENABLE ROW LEVEL SECURITY;

--
-- Name: Allergens_added_by_Process Allergens_added_by_Process_org_context_delete; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "Allergens_added_by_Process_org_context_delete" ON "Reference"."Allergens_added_by_Process" FOR DELETE TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: Allergens_added_by_Process Allergens_added_by_Process_org_context_insert; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "Allergens_added_by_Process_org_context_insert" ON "Reference"."Allergens_added_by_Process" FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: Allergens_added_by_Process Allergens_added_by_Process_org_context_select; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "Allergens_added_by_Process_org_context_select" ON "Reference"."Allergens_added_by_Process" FOR SELECT TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: Allergens_added_by_Process Allergens_added_by_Process_org_context_update; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "Allergens_added_by_Process_org_context_update" ON "Reference"."Allergens_added_by_Process" FOR UPDATE TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: Allergens_by_RM; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."Allergens_by_RM" ENABLE ROW LEVEL SECURITY;

--
-- Name: Allergens_by_RM Allergens_by_RM_org_context_delete; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "Allergens_by_RM_org_context_delete" ON "Reference"."Allergens_by_RM" FOR DELETE TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: Allergens_by_RM Allergens_by_RM_org_context_insert; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "Allergens_by_RM_org_context_insert" ON "Reference"."Allergens_by_RM" FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: Allergens_by_RM Allergens_by_RM_org_context_select; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "Allergens_by_RM_org_context_select" ON "Reference"."Allergens_by_RM" FOR SELECT TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: Allergens_by_RM Allergens_by_RM_org_context_update; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "Allergens_by_RM_org_context_update" ON "Reference"."Allergens_by_RM" FOR UPDATE TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: Allergens Allergens_org_context_delete; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "Allergens_org_context_delete" ON "Reference"."Allergens" FOR DELETE TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: Allergens Allergens_org_context_insert; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "Allergens_org_context_insert" ON "Reference"."Allergens" FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: Allergens Allergens_org_context_select; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "Allergens_org_context_select" ON "Reference"."Allergens" FOR SELECT TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: Allergens Allergens_org_context_update; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "Allergens_org_context_update" ON "Reference"."Allergens" FOR UPDATE TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: ApprovalChainTemplates; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."ApprovalChainTemplates" ENABLE ROW LEVEL SECURITY;

--
-- Name: ApprovalChainTemplates ApprovalChainTemplates_org_context; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "ApprovalChainTemplates_org_context" ON "Reference"."ApprovalChainTemplates" TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: BriefFieldMapping; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."BriefFieldMapping" ENABLE ROW LEVEL SECURITY;

--
-- Name: BriefFieldMapping BriefFieldMapping_org_context; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "BriefFieldMapping_org_context" ON "Reference"."BriefFieldMapping" TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: CloseConfirm; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."CloseConfirm" ENABLE ROW LEVEL SECURITY;

--
-- Name: CloseConfirm CloseConfirm_org_context; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "CloseConfirm_org_context" ON "Reference"."CloseConfirm" TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: D365_Constants; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."D365_Constants" ENABLE ROW LEVEL SECURITY;

--
-- Name: D365_Constants D365_Constants_org_context; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "D365_Constants_org_context" ON "Reference"."D365_Constants" TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: Departments; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."Departments" ENABLE ROW LEVEL SECURITY;

--
-- Name: Departments Departments_org_isolation; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "Departments_org_isolation" ON "Reference"."Departments" USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: DeptColumns; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."DeptColumns" ENABLE ROW LEVEL SECURITY;

--
-- Name: Equipment_Setup_By_Line_Pack; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."Equipment_Setup_By_Line_Pack" ENABLE ROW LEVEL SECURITY;

--
-- Name: Equipment_Setup_By_Line_Pack Equipment_Setup_By_Line_Pack_org_context; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "Equipment_Setup_By_Line_Pack_org_context" ON "Reference"."Equipment_Setup_By_Line_Pack" TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: FieldTypes; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."FieldTypes" ENABLE ROW LEVEL SECURITY;

--
-- Name: Formulas; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."Formulas" ENABLE ROW LEVEL SECURITY;

--
-- Name: GateChecklistTemplates; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."GateChecklistTemplates" ENABLE ROW LEVEL SECURITY;

--
-- Name: GateChecklistTemplates GateChecklistTemplates_org_context; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "GateChecklistTemplates_org_context" ON "Reference"."GateChecklistTemplates" TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: Lines_By_PackSize; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."Lines_By_PackSize" ENABLE ROW LEVEL SECURITY;

--
-- Name: Lines_By_PackSize Lines_By_PackSize_org_context; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "Lines_By_PackSize_org_context" ON "Reference"."Lines_By_PackSize" TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: ManufacturingOperations; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."ManufacturingOperations" ENABLE ROW LEVEL SECURITY;

--
-- Name: ManufacturingOperations ManufacturingOperations_org_isolation; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "ManufacturingOperations_org_isolation" ON "Reference"."ManufacturingOperations" TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: PackSizes; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."PackSizes" ENABLE ROW LEVEL SECURITY;

--
-- Name: PackSizes PackSizes_org_context; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "PackSizes_org_context" ON "Reference"."PackSizes" TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: RawMaterials; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."RawMaterials" ENABLE ROW LEVEL SECURITY;

--
-- Name: Rules; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."Rules" ENABLE ROW LEVEL SECURITY;

--
-- Name: Templates; Type: ROW SECURITY; Schema: Reference; Owner: -
--

ALTER TABLE "Reference"."Templates" ENABLE ROW LEVEL SECURITY;

--
-- Name: Templates Templates_org_context; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY "Templates_org_context" ON "Reference"."Templates" TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: AlertThresholds alert_thresholds_org_context; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY alert_thresholds_org_context ON "Reference"."AlertThresholds" TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: DeptColumns dept_columns_org_context; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY dept_columns_org_context ON "Reference"."DeptColumns" TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: FieldTypes field_types_readable; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY field_types_readable ON "Reference"."FieldTypes" FOR SELECT TO app_user USING (true);


--
-- Name: Formulas formulas_org_context; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY formulas_org_context ON "Reference"."Formulas" TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: RawMaterials reference_raw_materials_org_context; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY reference_raw_materials_org_context ON "Reference"."RawMaterials" TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: Rules rules_org_context; Type: POLICY; Schema: Reference; Owner: -
--

CREATE POLICY rules_org_context ON "Reference"."Rules" TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: admin_ip_allowlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_ip_allowlist ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_ip_allowlist admin_ip_allowlist_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_ip_allowlist_org_context ON public.admin_ip_allowlist TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: allergen_cascade_rebuild_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.allergen_cascade_rebuild_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: allergen_cascade_rebuild_jobs allergen_cascade_rebuild_jobs_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allergen_cascade_rebuild_jobs_org_context ON public.allergen_cascade_rebuild_jobs TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: allergen_contamination_risk; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.allergen_contamination_risk ENABLE ROW LEVEL SECURITY;

--
-- Name: allergen_contamination_risk allergen_contamination_risk_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allergen_contamination_risk_org_isolation ON public.allergen_contamination_risk TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: allergens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.allergens ENABLE ROW LEVEL SECURITY;

--
-- Name: allergens allergens_app_user_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY allergens_app_user_read ON public.allergens FOR SELECT TO app_user USING (true);


--
-- Name: audit_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_events audit_events_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_events_org_context ON public.audit_events TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_2026_01; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_2026_01 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_2026_02; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_2026_02 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_2026_03; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_2026_03 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_2026_04; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_2026_04 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_2026_05; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_2026_05 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_2026_06; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_2026_06 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_2026_07; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_2026_07 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_2026_08; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_2026_08 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_2026_09; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_2026_09 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_2026_10; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_2026_10 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_2026_11; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_2026_11 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_2026_12; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_2026_12 ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log audit_log_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_log_org_context ON public.audit_log TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: bom_co_products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bom_co_products ENABLE ROW LEVEL SECURITY;

--
-- Name: bom_co_products bom_co_products_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bom_co_products_org_context ON public.bom_co_products TO app_user USING (((org_id = app.current_org_id()) AND (EXISTS ( SELECT 1
   FROM public.bom_headers header
  WHERE ((header.id = bom_co_products.bom_header_id) AND (header.org_id = app.current_org_id())))))) WITH CHECK (((org_id = app.current_org_id()) AND (EXISTS ( SELECT 1
   FROM public.bom_headers header
  WHERE ((header.id = bom_co_products.bom_header_id) AND (header.org_id = app.current_org_id()))))));


--
-- Name: bom_generator_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bom_generator_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: bom_generator_jobs bom_generator_jobs_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bom_generator_jobs_org_context ON public.bom_generator_jobs TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: bom_headers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bom_headers ENABLE ROW LEVEL SECURITY;

--
-- Name: bom_headers bom_headers_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bom_headers_org_context ON public.bom_headers TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: bom_item; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bom_item ENABLE ROW LEVEL SECURITY;

--
-- Name: bom_item bom_item_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bom_item_org_context ON public.bom_item TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: bom_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bom_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: bom_lines bom_lines_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bom_lines_org_context ON public.bom_lines TO app_user USING (((org_id = app.current_org_id()) AND (EXISTS ( SELECT 1
   FROM public.bom_headers header
  WHERE ((header.id = bom_lines.bom_header_id) AND (header.org_id = app.current_org_id())))))) WITH CHECK (((org_id = app.current_org_id()) AND (EXISTS ( SELECT 1
   FROM public.bom_headers header
  WHERE ((header.id = bom_lines.bom_header_id) AND (header.org_id = app.current_org_id()))))));


--
-- Name: bom_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bom_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: bom_snapshots bom_snapshots_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bom_snapshots_org_context ON public.bom_snapshots TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: brief; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brief ENABLE ROW LEVEL SECURITY;

--
-- Name: brief_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brief_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: brief_lines brief_lines_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brief_lines_org_context ON public.brief_lines TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: brief brief_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brief_org_context ON public.brief TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: brief_to_fa_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brief_to_fa_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: brief_to_fa_audit brief_to_fa_audit_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brief_to_fa_audit_org_context ON public.brief_to_fa_audit TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: capacity_plan_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.capacity_plan_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: capacity_plan_lines capacity_plan_lines_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY capacity_plan_lines_org_isolation ON public.capacity_plan_lines TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: capacity_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.capacity_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: capacity_plans capacity_plans_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY capacity_plans_org_isolation ON public.capacity_plans TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: compliance_docs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.compliance_docs ENABLE ROW LEVEL SECURITY;

--
-- Name: compliance_docs compliance_docs_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY compliance_docs_org_context ON public.compliance_docs TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: consumed_approval_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consumed_approval_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: consumed_approval_tokens consumed_approval_tokens_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY consumed_approval_tokens_org_context ON public.consumed_approval_tokens TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: costing_breakdowns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.costing_breakdowns ENABLE ROW LEVEL SECURITY;

--
-- Name: costing_breakdowns costing_breakdowns_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY costing_breakdowns_org_context ON public.costing_breakdowns TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: costing_waterfall_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.costing_waterfall_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: costing_waterfall_steps costing_waterfall_steps_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY costing_waterfall_steps_org_context ON public.costing_waterfall_steps TO app_user USING ((EXISTS ( SELECT 1
   FROM public.costing_breakdowns breakdown
  WHERE ((breakdown.id = costing_waterfall_steps.breakdown_id) AND (breakdown.org_id = app.current_org_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.costing_breakdowns breakdown
  WHERE ((breakdown.id = costing_waterfall_steps.breakdown_id) AND (breakdown.org_id = app.current_org_id())))));


--
-- Name: d365_import_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.d365_import_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: d365_import_cache d365_import_cache_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY d365_import_cache_org_context ON public.d365_import_cache TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: d365_sync_dlq; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.d365_sync_dlq ENABLE ROW LEVEL SECURITY;

--
-- Name: d365_sync_dlq d365_sync_dlq_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY d365_sync_dlq_org_isolation ON public.d365_sync_dlq TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: d365_sync_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.d365_sync_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: d365_sync_jobs d365_sync_jobs_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY d365_sync_jobs_org_isolation ON public.d365_sync_jobs TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: d365_sync_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.d365_sync_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: d365_sync_runs d365_sync_runs_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY d365_sync_runs_org_context ON public.d365_sync_runs TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: dept_column_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dept_column_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: dept_column_drafts dept_column_drafts_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_column_drafts_org_context ON public.dept_column_drafts TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: dept_column_migrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dept_column_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: dept_column_migrations dept_column_migrations_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dept_column_migrations_org_context ON public.dept_column_migrations TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: e_sign_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.e_sign_log ENABLE ROW LEVEL SECURITY;

--
-- Name: e_sign_log e_sign_log_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY e_sign_log_org_context ON public.e_sign_log TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: email_delivery_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_delivery_log ENABLE ROW LEVEL SECURITY;

--
-- Name: email_delivery_log email_delivery_log_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_delivery_log_org_context ON public.email_delivery_log TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: fa_allergen_overrides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fa_allergen_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: fa_allergen_overrides fa_allergen_overrides_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fa_allergen_overrides_org_context ON public.fa_allergen_overrides TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: fa_builder_outputs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fa_builder_outputs ENABLE ROW LEVEL SECURITY;

--
-- Name: fa_builder_outputs fa_builder_outputs_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fa_builder_outputs_org_context ON public.fa_builder_outputs TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: factory_release_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.factory_release_status ENABLE ROW LEVEL SECURITY;

--
-- Name: factory_release_status factory_release_status_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY factory_release_status_org_context ON public.factory_release_status TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: factory_specs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.factory_specs ENABLE ROW LEVEL SECURITY;

--
-- Name: factory_specs factory_specs_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY factory_specs_org_isolation ON public.factory_specs TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: feature_flags_core; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feature_flags_core ENABLE ROW LEVEL SECURITY;

--
-- Name: feature_flags_core feature_flags_core_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY feature_flags_core_org_context ON public.feature_flags_core TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: formulation_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.formulation_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: formulation_audit_log formulation_audit_log_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY formulation_audit_log_org_context ON public.formulation_audit_log TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: formulation_calc_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.formulation_calc_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: formulation_calc_cache formulation_calc_cache_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY formulation_calc_cache_org_context ON public.formulation_calc_cache TO app_user USING ((EXISTS ( SELECT 1
   FROM (public.formulation_versions version
     JOIN public.formulations formulation ON ((formulation.id = version.formulation_id)))
  WHERE ((version.id = formulation_calc_cache.version_id) AND (formulation.org_id = app.current_org_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.formulation_versions version
     JOIN public.formulations formulation ON ((formulation.id = version.formulation_id)))
  WHERE ((version.id = formulation_calc_cache.version_id) AND (formulation.org_id = app.current_org_id())))));


--
-- Name: formulation_ingredients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.formulation_ingredients ENABLE ROW LEVEL SECURITY;

--
-- Name: formulation_ingredients formulation_ingredients_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY formulation_ingredients_org_context ON public.formulation_ingredients TO app_user USING ((EXISTS ( SELECT 1
   FROM (public.formulation_versions version
     JOIN public.formulations formulation ON ((formulation.id = version.formulation_id)))
  WHERE ((version.id = formulation_ingredients.version_id) AND (formulation.org_id = app.current_org_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.formulation_versions version
     JOIN public.formulations formulation ON ((formulation.id = version.formulation_id)))
  WHERE ((version.id = formulation_ingredients.version_id) AND (formulation.org_id = app.current_org_id())))));


--
-- Name: formulation_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.formulation_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: formulation_versions formulation_versions_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY formulation_versions_org_context ON public.formulation_versions TO app_user USING ((EXISTS ( SELECT 1
   FROM public.formulations formulation
  WHERE ((formulation.id = formulation_versions.formulation_id) AND (formulation.org_id = app.current_org_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.formulations formulation
  WHERE ((formulation.id = formulation_versions.formulation_id) AND (formulation.org_id = app.current_org_id())))));


--
-- Name: formulations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.formulations ENABLE ROW LEVEL SECURITY;

--
-- Name: formulations formulations_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY formulations_org_context ON public.formulations TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: gate_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gate_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: gate_approvals gate_approvals_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gate_approvals_org_context ON public.gate_approvals TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: gate_checklist_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gate_checklist_items ENABLE ROW LEVEL SECURITY;

--
-- Name: gate_checklist_items gate_checklist_items_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gate_checklist_items_org_context ON public.gate_checklist_items TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: gdpr_erasure_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gdpr_erasure_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: gdpr_erasure_requests gdpr_erasure_requests_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gdpr_erasure_requests_org_context ON public.gdpr_erasure_requests TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: idempotency_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: idempotency_keys idempotency_keys_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY idempotency_keys_org_context ON public.idempotency_keys TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: integration_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: integration_settings integration_settings_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY integration_settings_org_context ON public.integration_settings TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: item_allergen_profile_overrides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.item_allergen_profile_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: item_allergen_profile_overrides item_allergen_profile_overrides_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_allergen_profile_overrides_org_isolation ON public.item_allergen_profile_overrides TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: item_allergen_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.item_allergen_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: item_allergen_profiles item_allergen_profiles_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_allergen_profiles_org_isolation ON public.item_allergen_profiles TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: item_cost_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.item_cost_history ENABLE ROW LEVEL SECURITY;

--
-- Name: item_cost_history item_cost_history_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY item_cost_history_org_isolation ON public.item_cost_history TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

--
-- Name: items items_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY items_org_isolation ON public.items TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: lab_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lab_results ENABLE ROW LEVEL SECURITY;

--
-- Name: lab_results lab_results_org_context_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lab_results_org_context_insert ON public.lab_results FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: lab_results lab_results_org_context_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lab_results_org_context_select ON public.lab_results FOR SELECT TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: line_machines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.line_machines ENABLE ROW LEVEL SECURITY;

--
-- Name: line_machines line_machines_app_user_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY line_machines_app_user_access ON public.line_machines TO app_user USING (true) WITH CHECK (true);


--
-- Name: locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

--
-- Name: locations locations_org_context_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY locations_org_context_delete ON public.locations FOR DELETE TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: locations locations_org_context_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY locations_org_context_insert ON public.locations FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: locations locations_org_context_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY locations_org_context_select ON public.locations FOR SELECT TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: locations locations_org_context_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY locations_org_context_update ON public.locations FOR UPDATE TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: login_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: login_attempts login_attempts_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY login_attempts_org_context ON public.login_attempts TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: lot; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lot ENABLE ROW LEVEL SECURITY;

--
-- Name: lot lot_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lot_org_context ON public.lot TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: machines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;

--
-- Name: machines machines_org_context_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY machines_org_context_delete ON public.machines FOR DELETE TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: machines machines_org_context_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY machines_org_context_insert ON public.machines FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: machines machines_org_context_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY machines_org_context_select ON public.machines FOR SELECT TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: machines machines_org_context_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY machines_org_context_update ON public.machines FOR UPDATE TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: manufacturing_operation_allergen_additions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.manufacturing_operation_allergen_additions ENABLE ROW LEVEL SECURITY;

--
-- Name: manufacturing_operation_allergen_additions manufacturing_operation_allergen_additions_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY manufacturing_operation_allergen_additions_org_isolation ON public.manufacturing_operation_allergen_additions TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: mfa_secrets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mfa_secrets ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_secrets mfa_secrets_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mfa_secrets_org_context ON public.mfa_secrets USING ((user_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.org_id = app.current_org_id()))));


--
-- Name: modules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

--
-- Name: modules modules_app_user_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modules_app_user_read ON public.modules FOR SELECT TO app_user USING (true);


--
-- Name: mrp_planned_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mrp_planned_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: mrp_planned_orders mrp_planned_orders_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mrp_planned_orders_org_isolation ON public.mrp_planned_orders TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: mrp_requirements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mrp_requirements ENABLE ROW LEVEL SECURITY;

--
-- Name: mrp_requirements mrp_requirements_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mrp_requirements_org_isolation ON public.mrp_requirements TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: mrp_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mrp_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: mrp_runs mrp_runs_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mrp_runs_org_isolation ON public.mrp_runs TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_preferences notification_preferences_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_preferences_org_context ON public.notification_preferences TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: npd_legacy_closeout; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.npd_legacy_closeout ENABLE ROW LEVEL SECURITY;

--
-- Name: npd_legacy_closeout npd_legacy_closeout_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY npd_legacy_closeout_org_context ON public.npd_legacy_closeout TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: npd_projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.npd_projects ENABLE ROW LEVEL SECURITY;

--
-- Name: npd_projects npd_projects_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY npd_projects_org_context ON public.npd_projects TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: nutri_score_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nutri_score_results ENABLE ROW LEVEL SECURITY;

--
-- Name: nutri_score_results nutri_score_results_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nutri_score_results_org_context ON public.nutri_score_results TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: nutrition_allergens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nutrition_allergens ENABLE ROW LEVEL SECURITY;

--
-- Name: nutrition_allergens nutrition_allergens_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nutrition_allergens_org_context ON public.nutrition_allergens TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: nutrition_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nutrition_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: nutrition_profiles nutrition_profiles_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nutrition_profiles_org_context ON public.nutrition_profiles TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: org_authorization_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_authorization_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: org_authorization_policies org_authorization_policies_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_authorization_policies_org_context ON public.org_authorization_policies TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: org_security_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_security_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: org_security_policies org_security_policies_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_security_policies_org_context ON public.org_security_policies TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: org_sequences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.org_sequences ENABLE ROW LEVEL SECURITY;

--
-- Name: org_sequences org_sequences_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_sequences_org_context ON public.org_sequences TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: organization_modules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_modules ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_modules organization_modules_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_modules_org_context ON public.organization_modules TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations organizations_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizations_org_context ON public.organizations TO app_user USING ((id = app.current_org_id())) WITH CHECK ((id = app.current_org_id()));


--
-- Name: outbox_dead_letter; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outbox_dead_letter ENABLE ROW LEVEL SECURITY;

--
-- Name: outbox_dead_letter outbox_dead_letter_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY outbox_dead_letter_org_context ON public.outbox_dead_letter TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: outbox_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;

--
-- Name: outbox_events outbox_events_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY outbox_events_org_context ON public.outbox_events TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: password_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.password_history ENABLE ROW LEVEL SECURITY;

--
-- Name: password_history password_history_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY password_history_org_context ON public.password_history TO app_user USING ((user_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.org_id = app.current_org_id())))) WITH CHECK ((user_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.org_id = app.current_org_id()))));


--
-- Name: prod_detail; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prod_detail ENABLE ROW LEVEL SECURITY;

--
-- Name: prod_detail prod_detail_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY prod_detail_org_context ON public.prod_detail TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: product; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product ENABLE ROW LEVEL SECURITY;

--
-- Name: product product_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_org_context ON public.product TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: production_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.production_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: production_lines production_lines_org_context_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY production_lines_org_context_delete ON public.production_lines FOR DELETE TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: production_lines production_lines_org_context_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY production_lines_org_context_insert ON public.production_lines FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: production_lines production_lines_org_context_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY production_lines_org_context_select ON public.production_lines FOR SELECT TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: production_lines production_lines_org_context_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY production_lines_org_context_update ON public.production_lines FOR UPDATE TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: quality_event; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quality_event ENABLE ROW LEVEL SECURITY;

--
-- Name: quality_event quality_event_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quality_event_org_context ON public.quality_event TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: recovery_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recovery_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: recovery_codes recovery_codes_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recovery_codes_org_context ON public.recovery_codes USING ((user_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.org_id = app.current_org_id()))));


--
-- Name: reference_csv_import_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reference_csv_import_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: reference_csv_import_reports reference_csv_import_reports_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_csv_import_reports_org_context ON public.reference_csv_import_reports TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: reference_schemas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reference_schemas ENABLE ROW LEVEL SECURITY;

--
-- Name: reference_schemas reference_schemas_org_context_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_schemas_org_context_delete ON public.reference_schemas FOR DELETE TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: reference_schemas reference_schemas_org_context_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_schemas_org_context_insert ON public.reference_schemas FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: reference_schemas reference_schemas_org_context_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_schemas_org_context_select ON public.reference_schemas FOR SELECT TO app_user USING (((org_id = app.current_org_id()) OR (org_id IS NULL)));


--
-- Name: reference_schemas reference_schemas_org_context_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_schemas_org_context_update ON public.reference_schemas FOR UPDATE TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: reference_tables; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reference_tables ENABLE ROW LEVEL SECURITY;

--
-- Name: reference_tables reference_tables_org_context_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_tables_org_context_delete ON public.reference_tables FOR DELETE TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: reference_tables reference_tables_org_context_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_tables_org_context_insert ON public.reference_tables FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: reference_tables reference_tables_org_context_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_tables_org_context_select ON public.reference_tables FOR SELECT TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: reference_tables reference_tables_org_context_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_tables_org_context_update ON public.reference_tables FOR UPDATE TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: reorder_thresholds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reorder_thresholds ENABLE ROW LEVEL SECURITY;

--
-- Name: reorder_thresholds reorder_thresholds_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reorder_thresholds_org_isolation ON public.reorder_thresholds TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: risks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.risks ENABLE ROW LEVEL SECURITY;

--
-- Name: risks risks_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY risks_org_context ON public.risks TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: role_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: role_categories role_categories_app_user_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY role_categories_app_user_read ON public.role_categories FOR SELECT TO app_user USING (true);


--
-- Name: role_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: role_permissions role_permissions_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY role_permissions_org_context ON public.role_permissions TO app_user USING ((role_id IN ( SELECT roles.id
   FROM public.roles
  WHERE (roles.org_id = app.current_org_id())))) WITH CHECK ((role_id IN ( SELECT roles.id
   FROM public.roles
  WHERE (roles.org_id = app.current_org_id()))));


--
-- Name: roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

--
-- Name: roles roles_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roles_org_context ON public.roles TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: routing_operations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.routing_operations ENABLE ROW LEVEL SECURITY;

--
-- Name: routing_operations routing_operations_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY routing_operations_org_isolation ON public.routing_operations TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: routings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.routings ENABLE ROW LEVEL SECURITY;

--
-- Name: routings routings_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY routings_org_isolation ON public.routings TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: rule_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rule_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: rule_definitions rule_definitions_org_context_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rule_definitions_org_context_delete ON public.rule_definitions FOR DELETE TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: rule_definitions rule_definitions_org_context_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rule_definitions_org_context_insert ON public.rule_definitions FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: rule_definitions rule_definitions_org_context_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rule_definitions_org_context_select ON public.rule_definitions FOR SELECT TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: rule_definitions rule_definitions_org_context_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rule_definitions_org_context_update ON public.rule_definitions FOR UPDATE TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: rule_dry_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rule_dry_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: rule_dry_runs rule_dry_runs_org_context_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rule_dry_runs_org_context_delete ON public.rule_dry_runs FOR DELETE TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: rule_dry_runs rule_dry_runs_org_context_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rule_dry_runs_org_context_insert ON public.rule_dry_runs FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: rule_dry_runs rule_dry_runs_org_context_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rule_dry_runs_org_context_select ON public.rule_dry_runs FOR SELECT TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: rule_dry_runs rule_dry_runs_org_context_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rule_dry_runs_org_context_update ON public.rule_dry_runs FOR UPDATE TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: schedule_outputs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schedule_outputs ENABLE ROW LEVEL SECURITY;

--
-- Name: schedule_outputs schedule_outputs_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY schedule_outputs_org_context ON public.schedule_outputs TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations schema_migrations_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY schema_migrations_org_context ON public.schema_migrations TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: scim_group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scim_group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: scim_group_members scim_group_members_org_context_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scim_group_members_org_context_delete ON public.scim_group_members FOR DELETE TO app_user USING ((EXISTS ( SELECT 1
   FROM public.scim_groups g
  WHERE ((g.id = scim_group_members.group_id) AND (g.org_id = app.current_org_id())))));


--
-- Name: scim_group_members scim_group_members_org_context_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scim_group_members_org_context_insert ON public.scim_group_members FOR INSERT TO app_user WITH CHECK ((EXISTS ( SELECT 1
   FROM public.scim_groups g
  WHERE ((g.id = scim_group_members.group_id) AND (g.org_id = app.current_org_id())))));


--
-- Name: scim_group_members scim_group_members_org_context_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scim_group_members_org_context_select ON public.scim_group_members FOR SELECT TO app_user USING ((EXISTS ( SELECT 1
   FROM public.scim_groups g
  WHERE ((g.id = scim_group_members.group_id) AND (g.org_id = app.current_org_id())))));


--
-- Name: scim_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scim_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: scim_groups scim_groups_org_context_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scim_groups_org_context_delete ON public.scim_groups FOR DELETE TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: scim_groups scim_groups_org_context_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scim_groups_org_context_insert ON public.scim_groups FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: scim_groups scim_groups_org_context_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scim_groups_org_context_select ON public.scim_groups FOR SELECT TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: scim_groups scim_groups_org_context_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scim_groups_org_context_update ON public.scim_groups FOR UPDATE TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: scim_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scim_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: scim_tokens scim_tokens_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scim_tokens_org_context ON public.scim_tokens TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: shipment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shipment ENABLE ROW LEVEL SECURITY;

--
-- Name: shipment shipment_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shipment_org_context ON public.shipment TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: supplier_spec_review_proposals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_spec_review_proposals ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_spec_review_proposals supplier_spec_review_proposals_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_spec_review_proposals_org_context ON public.supplier_spec_review_proposals TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: supplier_specs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_specs ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_specs supplier_specs_org_context_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_specs_org_context_delete ON public.supplier_specs FOR DELETE TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: supplier_specs supplier_specs_org_context_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_specs_org_context_insert ON public.supplier_specs FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: supplier_specs supplier_specs_org_context_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_specs_org_context_select ON public.supplier_specs FOR SELECT TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: supplier_specs supplier_specs_org_context_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_specs_org_context_update ON public.supplier_specs FOR UPDATE TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: tax_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_codes tax_codes_org_context_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_codes_org_context_delete ON public.tax_codes FOR DELETE TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: tax_codes tax_codes_org_context_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_codes_org_context_insert ON public.tax_codes FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: tax_codes tax_codes_org_context_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_codes_org_context_select ON public.tax_codes FOR SELECT TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: tax_codes tax_codes_org_context_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tax_codes_org_context_update ON public.tax_codes FOR UPDATE TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: technical_sensory_evaluations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.technical_sensory_evaluations ENABLE ROW LEVEL SECURITY;

--
-- Name: technical_sensory_evaluations technical_sensory_evaluations_org_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY technical_sensory_evaluations_org_isolation ON public.technical_sensory_evaluations TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: tenant_idp_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_idp_config ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_idp_config tenant_idp_config_current_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_idp_config_current_org_context ON public.tenant_idp_config TO app_user USING ((EXISTS ( SELECT 1
   FROM public.organizations org
  WHERE ((org.tenant_id = tenant_idp_config.tenant_id) AND (org.id = app.current_org_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organizations org
  WHERE ((org.tenant_id = tenant_idp_config.tenant_id) AND (org.id = app.current_org_id())))));


--
-- Name: tenant_migrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_migrations_legacy_t038; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_migrations_legacy_t038 ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_migrations tenant_migrations_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_migrations_org_context ON public.tenant_migrations TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: tenant_variations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_variations ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_variations tenant_variations_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_variations_org_context ON public.tenant_variations TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: tenants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

--
-- Name: tenants tenants_current_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenants_current_org_context ON public.tenants TO app_user USING ((EXISTS ( SELECT 1
   FROM public.organizations org
  WHERE ((org.tenant_id = tenants.id) AND (org.id = app.current_org_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.organizations org
  WHERE ((org.tenant_id = tenants.id) AND (org.id = app.current_org_id())))));


--
-- Name: unit_of_measure; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unit_of_measure ENABLE ROW LEVEL SECURITY;

--
-- Name: unit_of_measure unit_of_measure_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY unit_of_measure_org_context ON public.unit_of_measure TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: uom_custom_conversions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.uom_custom_conversions ENABLE ROW LEVEL SECURITY;

--
-- Name: uom_custom_conversions uom_custom_conversions_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY uom_custom_conversions_org_context ON public.uom_custom_conversions TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: user_pins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_pins ENABLE ROW LEVEL SECURITY;

--
-- Name: user_pins user_pins_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_pins_org_context ON public.user_pins TO app_user USING ((user_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.org_id = app.current_org_id())))) WITH CHECK ((user_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.org_id = app.current_org_id()))));


--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles user_roles_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_org_context ON public.user_roles TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_org_context ON public.users TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: warehouses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

--
-- Name: warehouses warehouses_org_context_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouses_org_context_delete ON public.warehouses FOR DELETE TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: warehouses warehouses_org_context_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouses_org_context_insert ON public.warehouses FOR INSERT TO app_user WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: warehouses warehouses_org_context_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouses_org_context_select ON public.warehouses FOR SELECT TO app_user USING ((org_id = app.current_org_id()));


--
-- Name: warehouses warehouses_org_context_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY warehouses_org_context_update ON public.warehouses FOR UPDATE TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: wo_dependencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wo_dependencies ENABLE ROW LEVEL SECURITY;

--
-- Name: wo_dependencies wo_dependencies_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wo_dependencies_org_context ON public.wo_dependencies TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: wo_materials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wo_materials ENABLE ROW LEVEL SECURITY;

--
-- Name: wo_materials wo_materials_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wo_materials_org_context ON public.wo_materials TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: wo_operations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wo_operations ENABLE ROW LEVEL SECURITY;

--
-- Name: wo_operations wo_operations_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wo_operations_org_context ON public.wo_operations TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: wo_status_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wo_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: wo_status_history wo_status_history_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wo_status_history_org_context ON public.wo_status_history TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: work_order; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.work_order ENABLE ROW LEVEL SECURITY;

--
-- Name: work_order work_order_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_order_org_context ON public.work_order TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- Name: work_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: work_orders work_orders_org_context; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_orders_org_context ON public.work_orders TO app_user USING ((org_id = app.current_org_id())) WITH CHECK ((org_id = app.current_org_id()));


--
-- PostgreSQL database dump complete
--



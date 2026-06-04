-- Migration 156: Reference lookup-table BASELINE seed (cascade Chain 1 + Core dropdowns).
--
-- Problem:
--   Migration 079 created "Reference"."PackSizes", "Templates", "Lines_By_PackSize",
--   "Equipment_Setup_By_Line_Pack" and "CloseConfirm" but seeded ZERO rows, and the
--   org-insert seed trigger from 032 only copies Departments + ManufacturingOperations.
--   So every schema-driven Select bound to one of these dropdown_sources renders empty:
--     - Core "Pack Size *" (DeptColumns dropdown_source='PackSizes', required)  → user is stuck
--     - Core "Template"      (dropdown_source='Templates')
--     - Core/Planning/... "Closed_<Dept>" (dropdown_source='CloseConfirm')
--     - Production "Line"      (dropdown_source='Lines_By_PackSize')
--     - Production "Equipment_Setup" (dropdown_source='Equipment_Setup_By_Line_Pack')
--
-- Strategy (models 095 + 032):
--   1. A SECURITY DEFINER seed function loads BASELINE rows for one org (default Apex).
--      The values come from real artifacts (NOT invented):
--        - pack_sizes / lines / templates  → prototype data.jsx (window.NPD_REF), the
--          single source of the Pack Size / Line / Template option lists rendered by
--          fa-screens.jsx:494 / :507 / :640.
--        - templates' 4 operation names    → prototype window.NPD_REF.processes, so
--          cascade-engine chain4 (templateOperations() requires all 4 non-empty) resolves.
--        - equipment_setup per (line, pack) → 1 row per line×pack so cascade-engine
--          chain1 handleLineChange() resolves equipment_setup non-null (chain1-pack-size.ts).
--        - close_confirm values             → the Yes / No / '' confirm enum the Core
--          "Closed_<Dept>" Selects use (CloseConfirm CHECK in 079).
--   2. Apex backfill — seed Apex immediately (so existing live data lights up).
--   3. A DISTINCT org-insert trigger (trg_seed_reference_lookups) copies the lookups to
--      every new org. Distinct name from 032 (trg_seed_reference_data) and 095
--      (trg_seed_dept_columns) so it never clobbers them.
--   4. All-org backfill — copy the lookups from Apex to every existing non-Apex org.
--
--   Everything is idempotent (ON CONFLICT DO NOTHING). search_path pinned. The seed
--   function and trigger function are SECURITY DEFINER (RLS-bypassing) because
--   app.current_org_id() is unset during a system-level INSERT INTO public.organizations.
--
-- Wave0 lock: org_id (NOT tenant_id); RLS via app.current_org_id() on the tables (079).
-- PRD: docs/prd/01-NPD-PRD.md §4.1, §6.1, §7.2, §11.3.

-- ============================================================
-- 1. Pre-flight guard — the 079 lookup tables must exist
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'Reference'
       AND table_name   = 'PackSizes'
  ) THEN
    RAISE EXCEPTION 'Reference.PackSizes not found — run migration 079 first';
  END IF;
END
$$;

-- ============================================================
-- 2. Seed function (SECURITY DEFINER — bypasses org-context RLS)
--    Called inline (Apex backfill + all-org backfill) and from the
--    org-insert trigger below. Idempotent via ON CONFLICT DO NOTHING.
-- ============================================================
CREATE OR REPLACE FUNCTION "Reference".seed_reference_lookups(
  p_org_id uuid DEFAULT '00000000-0000-0000-0000-000000000002'::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, "Reference"
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

-- ============================================================
-- 3. Apex org backfill — seed for Apex immediately
-- ============================================================
SELECT "Reference".seed_reference_lookups('00000000-0000-0000-0000-000000000002'::uuid);

-- ============================================================
-- 4. Org-insert trigger — copy Apex lookups to every new org.
--    DISTINCT function/trigger name from 032 (trg_seed_reference_data) and
--    095 (trg_seed_dept_columns) so neither is clobbered.
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_reference_lookups_on_org_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, "Reference"
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

DROP TRIGGER IF EXISTS trg_seed_reference_lookups ON public.organizations;
CREATE TRIGGER trg_seed_reference_lookups
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_reference_lookups_on_org_insert();

-- ============================================================
-- 5. Backfill — seed the baseline for every existing non-Apex org (idempotent).
-- ============================================================
DO $$
DECLARE
  v_apex_org_id uuid := '00000000-0000-0000-0000-000000000002'::uuid;
  v_org         record;
BEGIN
  FOR v_org IN
    SELECT id FROM public.organizations WHERE id <> v_apex_org_id
  LOOP
    PERFORM "Reference".seed_reference_lookups(v_org.id);
  END LOOP;
END
$$;

-- ============================================================
-- 6. Lock down the SECURITY DEFINER seed function — never callable by app_user/public.
-- ============================================================
REVOKE ALL ON FUNCTION "Reference".seed_reference_lookups(uuid) FROM public;
REVOKE ALL ON FUNCTION "Reference".seed_reference_lookups(uuid) FROM app_user;
REVOKE ALL ON FUNCTION public.seed_reference_lookups_on_org_insert() FROM public;
REVOKE ALL ON FUNCTION public.seed_reference_lookups_on_org_insert() FROM app_user;

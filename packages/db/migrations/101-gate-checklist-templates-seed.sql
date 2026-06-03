-- Migration 101: T-056 — Default G0-G4 GateChecklistTemplates seed.
-- PRD: docs/prd/01-NPD-PRD.md §17.10
-- Prototype: prototypes/design/Monopilot Design System/npd/gate-screens.jsx:14-87 (GATE_CHECKLISTS)
-- Spine patch: T-056 task contract E2E spine patch (G3 FG candidate; G4 dept/BOM/factory closures)
--
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().
-- Idempotent: ON CONFLICT (org_id, template_id, gate_code, sequence) DO NOTHING.
-- Trigger function distinctly named (seed_gate_checklist_templates_on_org_insert) to avoid
-- clobbering T-004/T-005/T-016/T-050 triggers already on public.organizations.
-- template_id = 'APEX_DEFAULT' for all default items.

-- ============================================================
-- 1. Pre-flight: Reference.GateChecklistTemplates must exist (migration 092)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'Reference'
       AND table_name   = 'GateChecklistTemplates'
  ) THEN
    RAISE EXCEPTION 'Reference.GateChecklistTemplates not found — run migration 092 first';
  END IF;
END
$$;

-- ============================================================
-- 2. Per-org seed helper function
--
--    SECURITY DEFINER bypasses RLS (org_id context is unset during a system
--    trigger fired by an org INSERT). search_path pinned for determinism.
--
--    Items per gate (sequence ordering within gate):
--    G0 :  4 items — 3 business + 1 technical  (prototype 1:1)
--    G1 :  5 items — 3 technical + 2 business  (prototype 1:1)
--    G2 : 11 items — 3 technical + 5 business + 3 compliance  (prototype 1:1)
--    G3 : 10 items — 4 technical + 2 business + 2 compliance + 2 spine-patch items
--                    (FG candidate create/map; no-blocking-risk/docs guard)
--    G4 : 16 items — 3 technical + 3 compliance + 2 business + 8 spine-patch items
--                    (7 dept Done_<Dept> closures + RM usability PASS + shared BOM ready
--                     + factory_spec Technical submission)
--
--    Closed_Technical = Technical supplied/closed NPD data, NOT approved_for_factory
--    (factory approval requires Technical sign-off on factory_spec/BOM bundle).
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_gate_checklist_templates_for_org(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, "Reference"
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

COMMENT ON FUNCTION public.seed_gate_checklist_templates_for_org(uuid)
  IS 'T-056: Seeds the default G0-G4 GateChecklistTemplate rows (APEX_DEFAULT) for the given org. Idempotent (ON CONFLICT DO NOTHING). Called by trg_seed_gate_checklist_templates and migration 101 backfill.';

-- ============================================================
-- 3. Trigger function — fires on INSERT into public.organizations
--    to seed GateChecklistTemplates for every future org.
--    Distinctly named to avoid clobbering other org-insert triggers.
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_gate_checklist_templates_on_org_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
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

COMMENT ON FUNCTION public.seed_gate_checklist_templates_on_org_insert()
  IS 'T-056: Trigger function — seeds default G0-G4 GateChecklistTemplate rows for every new org on INSERT.';

-- ============================================================
-- 4. Attach trigger to public.organizations
-- ============================================================
DROP TRIGGER IF EXISTS trg_seed_gate_checklist_templates ON public.organizations;
CREATE TRIGGER trg_seed_gate_checklist_templates
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_gate_checklist_templates_on_org_insert();

-- ============================================================
-- 5. Backfill — seed ALL existing orgs (Apex + any non-Apex orgs).
--    ON CONFLICT DO NOTHING makes this re-runnable (idempotent).
-- ============================================================
DO $$
DECLARE
  v_org record;
BEGIN
  FOR v_org IN
    SELECT id FROM public.organizations
  LOOP
    PERFORM public.seed_gate_checklist_templates_for_org(v_org.id);
  END LOOP;
END
$$;

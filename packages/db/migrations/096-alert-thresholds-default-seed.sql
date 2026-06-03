-- Migration 096: T-050 — Reference.AlertThresholds default seed (01-NPD-e).
-- PRD: docs/prd/01-NPD-PRD.md §11.3 (launch alert days), §17.11.3 (margin warn ≤15%).
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().
--
-- Seeds the canonical 3 default alert-threshold rows into "Reference"."AlertThresholds"
-- (created by migration 084) for:
--   • Apex org 00000000-0000-0000-0000-000000000002 (backfill via loop)
--   • Every other existing org (backfill loop)
--   • Future orgs (via the trg_seed_alert_thresholds trigger on public.organizations)
--
-- All inserts use ON CONFLICT (org_id, threshold_key) DO NOTHING — fully idempotent.
-- Trigger function is distinctly named (seed_alert_thresholds_on_org_insert) so it
-- does not interfere with other per-org seed triggers on public.organizations.

-- ============================================================
-- 1. Pre-flight: Reference.AlertThresholds must already exist (migration 084)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'Reference'
       AND table_name   = 'AlertThresholds'
  ) THEN
    RAISE EXCEPTION 'Reference.AlertThresholds not found — run migration 084 first';
  END IF;
END
$$;

-- ============================================================
-- 2. Per-org seed helper function
--
--    SECURITY DEFINER bypasses RLS (org_id context is unset during a system
--    trigger fired by an org INSERT). search_path pinned for determinism.
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_alert_thresholds_for_org(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO "Reference"."AlertThresholds" (org_id, threshold_key, value_int, value_text)
  VALUES
    -- PRD §11.3 — launch alert thresholds (days before scheduled launch date)
    (p_org_id, 'launch_alert_red_days',    10,   NULL),
    (p_org_id, 'launch_alert_yellow_days', 21,   NULL),
    -- PRD §17.11.3 — costing margin warning threshold (percent, ≤15% triggers warn)
    (p_org_id, 'costing_margin_warn_pct',  15,   NULL)
  ON CONFLICT (org_id, threshold_key) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.seed_alert_thresholds_for_org(uuid)
  IS 'T-050: Seeds the 3 canonical default AlertThreshold rows for the given org. Idempotent (ON CONFLICT DO NOTHING). Called by trg_seed_alert_thresholds and the migration 096 backfill.';

-- ============================================================
-- 3. Trigger function — fires on INSERT into public.organizations
--    to seed AlertThresholds for every future org.
--    Distinctly named to avoid interfering with other org-insert triggers.
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_alert_thresholds_on_org_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.seed_alert_thresholds_for_org(NEW.id);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.seed_alert_thresholds_on_org_insert()
  IS 'T-050: Trigger function — seeds default AlertThreshold rows for every new org on INSERT.';

-- ============================================================
-- 4. Attach trigger to public.organizations
-- ============================================================
DROP TRIGGER IF EXISTS trg_seed_alert_thresholds ON public.organizations;
CREATE TRIGGER trg_seed_alert_thresholds
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_alert_thresholds_on_org_insert();

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
    PERFORM public.seed_alert_thresholds_for_org(v_org.id);
  END LOOP;
END
$$;

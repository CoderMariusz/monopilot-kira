-- Migration 167: T-070 — 03-TECHNICAL baseline seed.
-- PRD: docs/prd/03-TECHNICAL-PRD.md §8.5/§8.6 (catch-weight variance default 5.0%),
--      §10.6 (ATP swab threshold ≤10 RLU), §11.3/§11.6 V-TEC-52 (Currency ∈ ISO 4217).
--
-- Delivers the two T-070 portions that were ABSENT from the repo:
--   1. The 03-TECHNICAL alert_thresholds defaults missing from migration 096:
--        • atp_swab_rlu_max          = 10  (PRD §10.6 — ATP swab ≤10 RLU)
--        • catch_weight_variance_pct = 5   (PRD §8.5/§8.6 — default 5.0%)
--      These extend the EXISTING per-org seed function + trigger (096) so they
--      reach every existing org (backfill) and every future org (trigger).
--   2. A GLOBAL ISO-4217 currency reference table (public.iso4217). Global /
--      un-scoped (no org_id, no RLS) following the public.role_categories
--      reference-table convention (migration 048): revoke from public, grant
--      SELECT to app_user. Backs V-TEC-52 ("Currency ∈ ISO 4217 supported list").
--
-- The manufacturing_operations seed already ships (seeds/manufacturing-operations.sql
-- + migration 078) and is intentionally per-org/per-industry gated — it is NOT
-- touched here.
--
-- Wave0 lock: business scope is org_id; RLS via app.current_org_id() on the
-- org-scoped table (AlertThresholds, created by 084). iso4217 is a GLOBAL
-- reference table and is intentionally un-scoped.
--
-- Everything is idempotent: ON CONFLICT DO NOTHING + CREATE OR REPLACE +
-- CREATE TABLE IF NOT EXISTS. The seed function is SECURITY DEFINER (RLS-bypassing,
-- because app.current_org_id() is unset during a system-level org INSERT) with a
-- pinned search_path; it is the same distinctly-named function introduced by 096.

-- ============================================================
-- 1. Pre-flight: Reference.AlertThresholds must already exist (migration 084)
--    and the 096 per-org seed function must exist (we extend it).
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'Reference' AND table_name = 'AlertThresholds'
  ) THEN
    RAISE EXCEPTION 'Reference.AlertThresholds not found — run migration 084 first';
  END IF;
END
$$;

-- ============================================================
-- 2. Extend the EXISTING per-org alert-threshold seed function (from 096)
--    with the two 03-TECHNICAL defaults. CREATE OR REPLACE keeps the same
--    function signature/name so the 096 trigger (trg_seed_alert_thresholds)
--    automatically seeds these for every future org too.
--
--    SECURITY DEFINER + pinned search_path: bypasses RLS during the org-INSERT
--    trigger, where app.current_org_id() is unset.
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

COMMENT ON FUNCTION public.seed_alert_thresholds_for_org(uuid)
  IS 'T-050/T-070: Seeds the canonical default AlertThreshold rows for the given org '
     '(launch alert + costing margin + ATP swab RLU + catch-weight variance). '
     'Idempotent (ON CONFLICT DO NOTHING). Called by trg_seed_alert_thresholds and the backfill below.';

-- Defense in depth: keep SECURITY DEFINER seed fns off public / app_user EXECUTE.
REVOKE ALL ON FUNCTION public.seed_alert_thresholds_for_org(uuid) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.seed_alert_thresholds_for_org(uuid) FROM app_user';
  END IF;
END
$$;

-- ============================================================
-- 3. Backfill — seed the new keys into ALL existing orgs (Apex + others).
--    ON CONFLICT DO NOTHING in the function makes this re-runnable.
-- ============================================================
DO $$
DECLARE
  v_org record;
BEGIN
  FOR v_org IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_alert_thresholds_for_org(v_org.id);
  END LOOP;
END
$$;

-- ============================================================
-- 4. GLOBAL ISO-4217 currency reference table.
--    Un-scoped (no org_id, no RLS) — a shared lookup, like public.role_categories
--    (migration 048). code = 3-letter alpha PK; num = numeric code; minor_unit =
--    number of decimal places. Read-only for app_user.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.iso4217 (
  code          char(3) PRIMARY KEY
    CONSTRAINT iso4217_code_format_check CHECK (code ~ '^[A-Z]{3}$'),
  currency_name text    NOT NULL,
  num           char(3) NOT NULL
    CONSTRAINT iso4217_num_format_check CHECK (num ~ '^[0-9]{3}$'),
  minor_unit    integer NOT NULL DEFAULT 2
    CONSTRAINT iso4217_minor_unit_check CHECK (minor_unit BETWEEN 0 AND 4)
);

COMMENT ON TABLE public.iso4217
  IS 'T-070: Global ISO-4217 currency reference (code / name / numeric / minor unit). '
     'Un-scoped shared lookup (no org_id, no RLS). Backs V-TEC-52 currency validation.';

REVOKE ALL ON public.iso4217 FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE 'GRANT SELECT ON public.iso4217 TO app_user';
  END IF;
END
$$;

-- Seed the supported ISO-4217 list. Idempotent (ON CONFLICT DO NOTHING).
-- minor_unit follows ISO-4217 (e.g. JPY/KRW = 0, BHD/KWD/TND = 3, most = 2).
INSERT INTO public.iso4217 (code, currency_name, num, minor_unit)
VALUES
  ('PLN', 'Zloty',                 '985', 2),
  ('EUR', 'Euro',                  '978', 2),
  ('USD', 'US Dollar',             '840', 2),
  ('GBP', 'Pound Sterling',        '826', 2),
  ('CHF', 'Swiss Franc',           '756', 2),
  ('CZK', 'Czech Koruna',          '203', 2),
  ('SEK', 'Swedish Krona',         '752', 2),
  ('NOK', 'Norwegian Krone',       '578', 2),
  ('DKK', 'Danish Krone',          '208', 2),
  ('HUF', 'Forint',                '348', 2),
  ('RON', 'Romanian Leu',          '946', 2),
  ('BGN', 'Bulgarian Lev',         '975', 2),
  ('UAH', 'Hryvnia',               '980', 2),
  ('CAD', 'Canadian Dollar',       '124', 2),
  ('AUD', 'Australian Dollar',     '036', 2),
  ('NZD', 'New Zealand Dollar',    '554', 2),
  ('JPY', 'Yen',                   '392', 0),
  ('CNY', 'Yuan Renminbi',         '156', 2),
  ('HKD', 'Hong Kong Dollar',      '344', 2),
  ('SGD', 'Singapore Dollar',      '702', 2),
  ('INR', 'Indian Rupee',          '356', 2),
  ('KRW', 'Won',                   '410', 0),
  ('ZAR', 'Rand',                  '710', 2),
  ('BRL', 'Brazilian Real',        '986', 2),
  ('MXN', 'Mexican Peso',          '484', 2),
  ('TRY', 'Turkish Lira',          '949', 2),
  ('AED', 'UAE Dirham',            '784', 2),
  ('SAR', 'Saudi Riyal',           '682', 2),
  ('BHD', 'Bahraini Dinar',        '048', 3),
  ('KWD', 'Kuwaiti Dinar',         '414', 3),
  ('TND', 'Tunisian Dinar',        '788', 3)
ON CONFLICT (code) DO NOTHING;

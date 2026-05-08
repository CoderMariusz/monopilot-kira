-- Migration 032 — per-tenant Reference seed on organization INSERT (Slot F-1).
--
-- Problem:
--   "Reference"."Departments" and "Reference"."ManufacturingOperations" are
--   only seeded for the Apex org (id = '00000000-0000-0000-0000-000000000002').
--   Every non-Apex tenant boots with empty taxonomy, which breaks 02-settings
--   T-019 (departments) and T-094 (mfg ops) because their UIs read from those
--   tables.
--
-- Strategy:
--   On INSERT into public.organizations, copy every Reference.Departments row
--   from Apex to the new org (same for Reference.ManufacturingOperations).
--   Idempotent via ON CONFLICT DO NOTHING on the (org_id, code) and
--   (org_id, industry_code, process_suffix) unique constraints.
--
--   The Apex org itself is excluded from self-copy (the trigger fires for the
--   Apex bootstrap row from migration 030 too).
--
--   A backfill block at the end copies the seed to all existing non-Apex orgs
--   so this migration is fix-on-deploy: tenants that already exist will get
--   their taxonomy populated immediately. Subsequent inserts go through the
--   trigger.

-- ============================================================
-- 1. Pre-flight — required tables must exist (clear failure if not)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'Reference'
       AND table_name   = 'Departments'
  ) THEN
    RAISE EXCEPTION 'Reference.Departments not found — run migration 011 first';
  END IF;
END
$$;

-- ============================================================
-- 2. Trigger function — copy Apex reference data to a new org
--
--    SECURITY DEFINER bypasses the org_id RLS policy on the Reference tables
--    (current_org_id() is unset during a system org INSERT). search_path is
--    pinned to keep the function deterministic regardless of caller setting.
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_reference_data_on_org_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_apex_org_id uuid := '00000000-0000-0000-0000-000000000002'::uuid;
BEGIN
  -- Skip Apex itself — the source of the seed has nothing to copy from.
  IF NEW.id = v_apex_org_id THEN
    RETURN NEW;
  END IF;

  -- Reference.Departments — clone Apex rows into the new org.
  INSERT INTO "Reference"."Departments"
    (id, org_id, code, display_name, role_description, marker, created_at)
  SELECT gen_random_uuid(),
         NEW.id,
         code,
         display_name,
         role_description,
         marker,
         pg_catalog.now()
    FROM "Reference"."Departments"
   WHERE org_id = v_apex_org_id
  ON CONFLICT (org_id, code) DO NOTHING;

  -- Reference.ManufacturingOperations — table only present after migration 012;
  -- guard so this trigger remains usable on partially migrated databases.
  IF EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'Reference'
       AND table_name   = 'ManufacturingOperations'
  ) THEN
    INSERT INTO "Reference"."ManufacturingOperations"
      (id, org_id, operation_name, process_suffix, description, operation_seq,
       industry_code, is_active, marker, created_at)
    SELECT gen_random_uuid(),
           NEW.id,
           operation_name,
           process_suffix,
           description,
           operation_seq,
           industry_code,
           is_active,
           marker,
           pg_catalog.now()
      FROM "Reference"."ManufacturingOperations"
     WHERE org_id = v_apex_org_id
    ON CONFLICT (org_id, industry_code, process_suffix) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. Trigger — wire it onto public.organizations
-- ============================================================
DROP TRIGGER IF EXISTS trg_seed_reference_data ON public.organizations;
CREATE TRIGGER trg_seed_reference_data
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_reference_data_on_org_insert();

-- ============================================================
-- 4. Backfill — copy Apex seed to every existing non-Apex org
--    Idempotent (ON CONFLICT DO NOTHING) so re-running is safe.
-- ============================================================
DO $$
DECLARE
  v_apex_org_id uuid := '00000000-0000-0000-0000-000000000002'::uuid;
  v_org         record;
BEGIN
  FOR v_org IN
    SELECT id FROM public.organizations WHERE id <> v_apex_org_id
  LOOP
    INSERT INTO "Reference"."Departments"
      (id, org_id, code, display_name, role_description, marker, created_at)
    SELECT gen_random_uuid(),
           v_org.id,
           code,
           display_name,
           role_description,
           marker,
           pg_catalog.now()
      FROM "Reference"."Departments"
     WHERE org_id = v_apex_org_id
    ON CONFLICT (org_id, code) DO NOTHING;

    IF EXISTS (
      SELECT 1
        FROM information_schema.tables
       WHERE table_schema = 'Reference'
         AND table_name   = 'ManufacturingOperations'
    ) THEN
      INSERT INTO "Reference"."ManufacturingOperations"
        (id, org_id, operation_name, process_suffix, description, operation_seq,
         industry_code, is_active, marker, created_at)
      SELECT gen_random_uuid(),
             v_org.id,
             operation_name,
             process_suffix,
             description,
             operation_seq,
             industry_code,
             is_active,
             marker,
             pg_catalog.now()
        FROM "Reference"."ManufacturingOperations"
       WHERE org_id = v_apex_org_id
      ON CONFLICT (org_id, industry_code, process_suffix) DO NOTHING;
    END IF;
  END LOOP;
END
$$;

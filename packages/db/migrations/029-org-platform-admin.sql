-- T-A.7-001 — backfill org.platform.admin (system role); FT-020 closeout

-- ============================================================
-- 1. Extend seed_system_roles_on_org_insert trigger function
--    to also seed org.platform.admin on every new org INSERT.
--    SECURITY DEFINER + SET search_path = pg_catalog preserved.
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_system_roles_on_org_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  INSERT INTO public.roles (org_id, slug, system)
  VALUES
    (NEW.id, 'org.access.admin', true),
    (NEW.id, 'org.schema.admin', true),
    (NEW.id, 'org.platform.admin', true)
  ON CONFLICT (org_id, slug) DO NOTHING;

  INSERT INTO public.org_security_policies (org_id, dual_control_required)
  VALUES (NEW.id, true)
  ON CONFLICT (org_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. Backfill: seed org.platform.admin for all existing orgs
--    that were inserted before this migration ran.
--    Idempotent: ON CONFLICT (org_id, slug) DO NOTHING.
-- ============================================================
INSERT INTO public.roles (org_id, slug, system)
SELECT id, 'org.platform.admin', true
FROM public.organizations
ON CONFLICT (org_id, slug) DO NOTHING;

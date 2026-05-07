-- Migration 017: RBAC tables — org-scoped roles, permissions, user assignments, security policy
-- T-014 — RBAC enforcement library with org-scoped roles and Org Admin / Schema Admin SoD grant guard
-- Scope: org_id (business/application scope per Wave0 v4.3 — NO tenant_id in RBAC tables)

-- ============================================================
-- 1. roles table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.roles (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  slug       text        NOT NULL,
  system     boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, slug)
);

-- ============================================================
-- 2. role_permissions table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id    uuid  NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission text  NOT NULL,
  PRIMARY KEY (role_id, permission)
);

-- ============================================================
-- 3. user_roles table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  org_id  uuid NOT NULL,
  PRIMARY KEY (user_id, role_id)
);

-- ============================================================
-- 4. org_security_policies table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.org_security_policies (
  org_id                uuid    PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  dual_control_required boolean NOT NULL DEFAULT true,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- ============================================================
-- 5. Enforce audit retention_class = 'security' for role.assigned events
--    (security red line: role assignment audit rows must always be security-retained)
-- ============================================================
ALTER TABLE public.audit_events
  DROP CONSTRAINT IF EXISTS audit_events_role_assigned_security_check;
ALTER TABLE public.audit_events
  ADD CONSTRAINT audit_events_role_assigned_security_check
  CHECK (action <> 'role.assigned' OR retention_class = 'security')
  NOT VALID;
-- NOT VALID: constraint applies to new rows immediately; existing rows are not rechecked
-- (safe for idempotent migration against a DB that may have pre-existing test data).
COMMENT ON CONSTRAINT audit_events_role_assigned_security_check ON public.audit_events
  IS 'T-014: role.assigned events must always use retention_class=security (security red line)';

-- ============================================================
-- 6. RLS: ENABLE + FORCE on all four tables
-- ============================================================
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.org_security_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_security_policies FORCE ROW LEVEL SECURITY;

-- ============================================================
-- 6. RLS policies — org_id = app.current_org_id()
-- ============================================================
DROP POLICY IF EXISTS roles_org_context ON public.roles;
CREATE POLICY roles_org_context
  ON public.roles
  FOR ALL
  TO app_user
  USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

DROP POLICY IF EXISTS role_permissions_org_context ON public.role_permissions;
CREATE POLICY role_permissions_org_context
  ON public.role_permissions
  FOR ALL
  TO app_user
  USING (
    role_id IN (
      SELECT id FROM public.roles WHERE org_id = app.current_org_id()
    )
  )
  WITH CHECK (
    role_id IN (
      SELECT id FROM public.roles WHERE org_id = app.current_org_id()
    )
  );

DROP POLICY IF EXISTS user_roles_org_context ON public.user_roles;
CREATE POLICY user_roles_org_context
  ON public.user_roles
  FOR ALL
  TO app_user
  USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

DROP POLICY IF EXISTS org_security_policies_org_context ON public.org_security_policies;
CREATE POLICY org_security_policies_org_context
  ON public.org_security_policies
  FOR ALL
  TO app_user
  USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- ============================================================
-- 7. Grant DML to app_user on all four tables
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_security_policies TO app_user;

-- ============================================================
-- 8. Trigger: seed system roles + security policy on org INSERT
--    Both org.access.admin and org.schema.admin are seeded with system=true.
--    Also inserts org_security_policies row (dual_control_required = true).
--    SECURITY DEFINER so trigger function bypasses RLS on roles table.
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
    (NEW.id, 'org.schema.admin', true)
  ON CONFLICT (org_id, slug) DO NOTHING;

  INSERT INTO public.org_security_policies (org_id, dual_control_required)
  VALUES (NEW.id, true)
  ON CONFLICT (org_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_system_roles_on_org_insert ON public.organizations;
CREATE TRIGGER seed_system_roles_on_org_insert
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_system_roles_on_org_insert();

-- Migration 050: Settings admin page manage permissions
-- Grants page-level access permissions required by Settings Users and Security
-- Server Components. Keep normalized role_permissions and legacy roles.permissions
-- JSONB in sync to avoid RBAC storage drift across Wave 7/8 pages.

DO $$
BEGIN
  IF to_regclass('public.role_permissions') IS NULL OR to_regclass('public.roles') IS NULL THEN
    RAISE EXCEPTION 'settings manage permission migration requires roles and role_permissions tables';
  END IF;
END $$;

WITH settings_manage_permissions(permission) AS (
  VALUES
    ('settings.users.manage'::text),
    ('settings.security.manage'::text)
), admin_roles AS (
  SELECT r.id, r.permissions
  FROM public.roles r
  WHERE r.code IN ('owner', 'admin', 'org_admin')
     OR r.slug IN ('owner', 'admin', 'org.access.admin', 'org.platform.admin', 'org.schema.admin')
)
INSERT INTO public.role_permissions (role_id, permission)
SELECT ar.id, smp.permission
FROM admin_roles ar
CROSS JOIN settings_manage_permissions smp
ON CONFLICT (role_id, permission) DO NOTHING;

WITH settings_manage_permissions(permission) AS (
  VALUES
    ('settings.users.manage'::text),
    ('settings.security.manage'::text)
), expanded AS (
  SELECT
    r.id,
    (
      SELECT jsonb_agg(DISTINCT value ORDER BY value)
      FROM (
        SELECT jsonb_array_elements_text(COALESCE(r.permissions, '[]'::jsonb)) AS value
        UNION ALL
        SELECT permission AS value FROM settings_manage_permissions
      ) values_to_merge
    ) AS permissions
  FROM public.roles r
  WHERE r.code IN ('owner', 'admin', 'org_admin')
     OR r.slug IN ('owner', 'admin', 'org.access.admin', 'org.platform.admin', 'org.schema.admin')
)
UPDATE public.roles r
SET permissions = expanded.permissions
FROM expanded
WHERE r.id = expanded.id;

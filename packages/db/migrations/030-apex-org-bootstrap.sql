-- T-A.7-002 — Apex tenant/org bootstrap; FT-020 closeout

-- ============================================================
-- Bootstrap the Apex (system) tenant and organization with
-- deterministic UUIDs so that seed files referencing
-- external_id = 'apex' (e.g. seeds/apex-departments.sql)
-- have a valid parent org to reference.
--
-- The trigger seed_system_roles_on_org_insert (migration 029)
-- will auto-seed org.access.admin, org.schema.admin, and
-- org.platform.admin for this org on INSERT.
--
-- Idempotent: both statements use ON CONFLICT (id) DO NOTHING.
-- ============================================================

-- Apex tenant
INSERT INTO public.tenants (id, name, region_cluster, data_plane_url, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Apex (system)',
  'eu',
  '',
  pg_catalog.now()
)
ON CONFLICT (id) DO NOTHING;

-- Apex organization
INSERT INTO public.organizations (
  id,
  tenant_id,
  name,
  industry_code,
  external_id,
  created_at,
  schema_version
)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Apex',
  'generic',
  'apex',
  pg_catalog.now(),
  1
)
ON CONFLICT (id) DO NOTHING;

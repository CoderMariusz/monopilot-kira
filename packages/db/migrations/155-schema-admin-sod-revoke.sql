-- Migration 155: P0 separation-of-duties fix — REVOKE the broad-admin permissions
-- that migration 150 over-granted to the schema-admin role.
-- PRD: docs/prd/02-SETTINGS-PRD.md §3 (RBAC / SoD).
-- Re-open verdict: _meta/runs/reopen/codex-reopen-verdict.md (P0 #1).
-- SoD lock: packages/rbac/src/permissions.enum.ts (SOD_EXCLUSIVE_PAIRS) +
--           packages/rbac/src/__tests__/permissions.test.ts:225.
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
--
-- ============================================================================
-- WHY THIS EXISTS
-- ----------------------------------------------------------------------------
-- Migration 150 seeded the full settings.* matrix to an "org-admin family" whose
-- join condition included the slug 'org.schema.admin' (150-...:50, :157). The
-- schema-admin role therefore received DANGEROUS admin-class capabilities it must
-- NOT hold under the locked SoD model where org.access.admin ⊥ org.schema.admin:
--   impersonate.tenant, settings.users.* / roles.* management, SSO/SCIM edit,
--   D365 secret rotation / test-connection, security.edit, the org.access.admin
--   role-name gate, etc. (migration 149's org-admin family already EXCLUDES
--   org.schema.admin for exactly this reason.)
--
-- 150 is already applied to the live DB (Supabase @152), so we do NOT edit 150 —
-- we reconcile forward with this REVOKE migration. The schema-admin role keeps
-- only its legitimately schema-scoped grants:
--   settings.schema.read, settings.schema.admin, and the literal org.schema.admin
--   gate. Every other string 150 granted it is revoked here (surgical — we revoke
--   exactly 150's matrix set minus the three keepers, so unrelated grants from
--   other migrations are untouched).
--
-- Targeting: the pure schema-admin role = slug 'org.schema.admin' that is NOT
-- itself part of the access-admin family (code owner/admin/org_admin or slug
-- org.access.admin/org.platform.admin). A role that is BOTH is a real admin and
-- is left alone.
--
-- Storage: revoke from BOTH normalized role_permissions AND the legacy
-- roles.permissions jsonb cache (the gates read either path). Idempotent.
-- SECURITY DEFINER fn + AFTER INSERT trigger (zzzz-prefixed so it fires AFTER
-- 150's trg_zzz_seed_settings_rbac_matrix, undoing the over-grant for new orgs)
-- + one-time backfill of every existing org.
-- ============================================================================

create or replace function public.revoke_schema_admin_sod_overgrant_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
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

revoke all on function public.revoke_schema_admin_sod_overgrant_for_org(uuid) from public;
revoke all on function public.revoke_schema_admin_sod_overgrant_for_org(uuid) from app_user;

create or replace function public.revoke_schema_admin_sod_overgrant_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.revoke_schema_admin_sod_overgrant_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.revoke_schema_admin_sod_overgrant_on_org_insert() from public;
revoke all on function public.revoke_schema_admin_sod_overgrant_on_org_insert() from app_user;

-- zzzz-prefixed: fires AFTER 150's trg_zzz_seed_settings_rbac_matrix, so any new
-- org first receives 150's (over-broad) grant and then has it reduced here.
drop trigger if exists trg_zzzz_revoke_schema_admin_sod_overgrant on public.organizations;
create trigger trg_zzzz_revoke_schema_admin_sod_overgrant
  after insert on public.organizations
  for each row
  execute function public.revoke_schema_admin_sod_overgrant_on_org_insert();

-- Backfill every existing org (reconciles the live @152 over-grant).
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.revoke_schema_admin_sod_overgrant_for_org(v_org_id);
  end loop;
end
$$;

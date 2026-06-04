-- ============================================================================
-- PROPOSAL ONLY — DO NOT APPLY TO CANON.
-- Migration 211: side-car RBAC seed-gap remediation.
-- Seeds settings-module permission strings that production Server Actions / pages
-- gate on but that no role currently holds in public.role_permissions (every user
-- gets 403 → feature unreachable). Same bug class fixed by 116 (gdpr.erasure.execute)
-- and 146 (npd.allergen.write). Mirrors those migrations exactly:
--   * SECURITY DEFINER per-org seeding function,
--   * dual-write (normalized role_permissions + legacy roles.permissions jsonb cache),
--   * AFTER INSERT trigger on organizations (zzz-prefixed → runs after 037/050/080),
--   * one-time backfill for every existing org.
-- Idempotent: ON CONFLICT DO NOTHING + set-deduplicated jsonb merge.
--
-- SOURCE OF TRUTH for the strings/roles: _meta/runs/sidecar/reports/rbac-permission-seed-gaps.md
-- NOTE: this seeds the *strings the code actually checks today* (incl. drifted strings
-- such as settings.d365.manage / settings.email_config.edit / impersonate.tenant /
-- settings.units.manage / settings.infra.read|update). A separate follow-up task should
-- converge code+enum onto canonical strings and collapse duplicates, then re-seed.
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
-- ============================================================================

create or replace function public.seed_settings_rbac_gap_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  -- (permission, role_code) grant matrix. role codes present in canon:
  --   admin, org.access.admin, org.platform.admin, org.schema.admin, viewer (+ npd roles).
  -- 'owner' included defensively in case an owner role exists in some orgs.
begin
  with grant_matrix(permission, role_code) as (
    values
      -- Org / tenant settings (access-admin domain)
      ('settings.org.read',            'admin'),
      ('settings.org.read',            'org.access.admin'),
      ('settings.org.read',            'org.platform.admin'),
      ('settings.org.read',            'owner'),
      ('settings.org.update',          'admin'),
      ('settings.org.update',          'org.access.admin'),
      ('settings.org.update',          'org.platform.admin'),
      ('settings.org.update',          'owner'),
      -- Rules registry (view + auditor)
      ('settings.rules.view',          'admin'),
      ('settings.rules.view',          'org.access.admin'),
      ('settings.rules.view',          'auditor'),
      ('settings.rules.view',          'owner'),
      -- Reference data
      ('settings.reference.view',      'admin'),
      ('settings.reference.view',      'org.access.admin'),
      ('settings.reference.view',      'owner'),
      ('settings.reference.edit',      'admin'),
      ('settings.reference.edit',      'org.access.admin'),
      ('settings.reference.edit',      'owner'),
      ('settings.reference.import',    'admin'),
      ('settings.reference.import',    'org.access.admin'),
      ('settings.reference.import',    'owner'),
      -- Audit
      ('settings.audit.read',          'admin'),
      ('settings.audit.read',          'org.access.admin'),
      ('settings.audit.read',          'auditor'),
      ('settings.audit.read',          'owner'),
      -- Feature flags
      ('settings.flags.edit',          'admin'),
      ('settings.flags.edit',          'org.access.admin'),
      ('settings.flags.edit',          'org.platform.admin'),
      ('settings.flags.edit',          'owner'),
      -- Units of measure (also repairs migration-064 ordering bug; no trigger existed)
      ('settings.units.manage',        'admin'),
      ('settings.units.manage',        'org.access.admin'),
      ('settings.units.manage',        'owner'),
      -- D365 (platform-admin domain; strings as the code checks them today)
      ('settings.d365.view',           'admin'),
      ('settings.d365.view',           'org.access.admin'),
      ('settings.d365.view',           'org.platform.admin'),
      ('settings.d365.view',           'owner'),
      ('settings.d365.manage',         'admin'),
      ('settings.d365.manage',         'org.platform.admin'),
      ('settings.d365.manage',         'owner'),
      ('settings.d365.rotate_secret',  'admin'),
      ('settings.d365.rotate_secret',  'org.platform.admin'),
      ('settings.d365.rotate_secret',  'owner'),
      ('settings.d365.test_connection','admin'),
      ('settings.d365.test_connection','org.platform.admin'),
      ('settings.d365.test_connection','owner'),
      -- Email config (both string variants the code uses)
      ('settings.email.view',          'admin'),
      ('settings.email.view',          'org.platform.admin'),
      ('settings.email.view',          'owner'),
      ('settings.email.edit',          'admin'),
      ('settings.email.edit',          'org.platform.admin'),
      ('settings.email.edit',          'owner'),
      ('settings.email_config.edit',   'admin'),
      ('settings.email_config.edit',   'org.platform.admin'),
      ('settings.email_config.edit',   'owner'),
      -- SSO / SCIM (platform-admin domain)
      ('settings.sso.edit',            'admin'),
      ('settings.sso.edit',            'org.platform.admin'),
      ('settings.sso.edit',            'owner'),
      ('settings.scim.edit',           'admin'),
      ('settings.scim.edit',           'org.platform.admin'),
      ('settings.scim.edit',           'owner'),
      -- IP allowlist
      ('settings.ip_allowlist.edit',   'admin'),
      ('settings.ip_allowlist.edit',   'org.access.admin'),
      ('settings.ip_allowlist.edit',   'owner'),
      -- Authorization policies
      ('settings.authorization.edit',  'admin'),
      ('settings.authorization.edit',  'org.access.admin'),
      ('settings.authorization.edit',  'owner'),
      -- Users / roles (access-admin domain)
      ('settings.users.invite',        'admin'),
      ('settings.users.invite',        'org.access.admin'),
      ('settings.users.invite',        'owner'),
      ('settings.users.view',          'admin'),
      ('settings.users.view',          'org.access.admin'),
      ('settings.users.view',          'auditor'),
      ('settings.users.view',          'owner'),
      ('settings.roles.assign',        'admin'),
      ('settings.roles.assign',        'org.access.admin'),
      ('settings.roles.assign',        'owner'),
      -- Infra (strings as the code checks them today: read/update, not view/edit)
      ('settings.infra.read',          'admin'),
      ('settings.infra.read',          'org.access.admin'),
      ('settings.infra.read',          'owner'),
      ('settings.infra.update',        'admin'),
      ('settings.infra.update',        'org.access.admin'),
      ('settings.infra.update',        'owner'),
      -- Impersonation (string as the code checks it today)
      ('impersonate.tenant',           'admin'),
      ('impersonate.tenant',           'org.access.admin'),
      ('impersonate.tenant',           'owner'),
      -- Gates that key on the role's OWN name as a *permission* string.
      -- The flags/security/schema/promotions paths check requirePermission('org.access.admin')
      -- / ('org.schema.admin') — so the corresponding role must hold that literal as a permission.
      ('org.access.admin',             'admin'),
      ('org.access.admin',             'org.access.admin'),
      ('org.access.admin',             'org.platform.admin'),
      ('org.access.admin',             'owner'),
      ('org.schema.admin',             'admin'),
      ('org.schema.admin',             'org.schema.admin'),
      ('org.schema.admin',             'owner')
  )
  -- 1) Normalized storage.
  insert into public.role_permissions (role_id, permission)
  select r.id, gm.permission
  from public.roles r
  join grant_matrix gm on gm.role_code = r.code
  where r.org_id = p_org_id
  on conflict (role_id, permission) do nothing;

  -- 2) Legacy jsonb cache (some action gates accept `roles.permissions ? perm`).
  with grant_matrix(permission, role_code) as (
    select rp.permission, r.code
    from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    where r.org_id = p_org_id
  ),
  expanded as (
    select
      r.id,
      coalesce(
        (
          select jsonb_agg(distinct value order by value)
          from (
            select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as value
            union all
            select gm.permission
            from public.role_permissions rp2
            where rp2.role_id = r.id
          ) merged(value)
        ),
        '[]'::jsonb
      ) as permissions
    from public.roles r
    where r.org_id = p_org_id
  )
  update public.roles r
     set permissions = expanded.permissions
    from expanded
   where r.id = expanded.id
     and r.permissions is distinct from expanded.permissions;
end;
$$;

revoke all on function public.seed_settings_rbac_gap_permissions_for_org(uuid) from public;
revoke all on function public.seed_settings_rbac_gap_permissions_for_org(uuid) from app_user;

create or replace function public.seed_settings_rbac_gap_permissions_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_settings_rbac_gap_permissions_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_settings_rbac_gap_permissions_on_org_insert() from public;
revoke all on function public.seed_settings_rbac_gap_permissions_on_org_insert() from app_user;

-- zzz-prefixed so it fires AFTER 037 (creates org.*.admin roles), 050, 080 (creates admin/viewer).
drop trigger if exists trg_zzz_seed_settings_rbac_gap on public.organizations;
create trigger trg_zzz_seed_settings_rbac_gap
  after insert on public.organizations
  for each row
  execute function public.seed_settings_rbac_gap_permissions_on_org_insert();

-- Backfill every existing org.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_settings_rbac_gap_permissions_for_org(v_org_id);
  end loop;
end
$$;

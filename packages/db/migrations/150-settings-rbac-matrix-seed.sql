-- Migration 150: 02-settings authoritative RBAC matrix seed (module RE-OPEN — reachability fix).
-- PRD: docs/prd/02-SETTINGS-PRD.md §3 (RBAC), §6-§14 (all settings sub-domains).
-- Side-car source of truth:
--   _meta/runs/sidecar/reports/rbac-permission-seed-gaps.md
--   _meta/runs/sidecar/reports/settings-reachability.md
--   _meta/runs/sidecar/reports/settings-audit.md  (F1 reachability / F2 string-drift)
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
--
-- ============================================================================
-- WHY THIS EXISTS
-- ----------------------------------------------------------------------------
-- Every settings Server Action / page gates on a literal permission string via a
-- local hasPermission/requirePermission that does an EXACT-MATCH lookup against
-- public.role_permissions (plus, in some gates, the legacy roles.permissions jsonb
-- cache). There is NO superuser bypass and NO alias normalization at the gate site.
-- If a checked string is never INSERTed into role_permissions for a role the user
-- holds, the gate returns `forbidden` for EVERY user — including the org admin —
-- and the feature is permanently unreachable (renders, but every read/write 403s).
--
-- Migrations 037/049/050/064/116/146/148 seeded only a tiny slice of the strings the
-- settings pages actually check (onboarding.complete, security.manage, users.manage,
-- infra.read/update, gdpr.erasure.execute). The org admin therefore hit 403 on ~24-30
-- settings pages on a freshly-migrated DB. The live DB only "works" because the admin
-- role was HAND-SEEDED during Gate-5 with strings that exist in NO migration — i.e. the
-- working state is not reproducible from version control. This migration makes the full
-- settings permission set durable & reproducible (local / new tenants / clean re-provision).
--
-- It also REPAIRS the migration-064 ordering bug: 064 granted settings.units.manage to
-- code IN ('owner','admin','org_admin') in a one-time DO block, but the `admin` role is
-- created LATER by 080 and 064 installed NO org-insert trigger -> 0 rows seeded. Here
-- units.manage is part of the matrix AND inherited by new orgs via the trigger below.
--
-- ----------------------------------------------------------------------------
-- DISCOVERY METHOD (the strings below are the REAL union, not just the proposal)
-- ----------------------------------------------------------------------------
-- Grepped every settings gate site (hasPermission / requirePermission / *_PERMISSION
-- constants / *_PERMISSIONS arrays) under:
--   apps/web/app/**/(admin)/settings/**   and   apps/web/actions/**
-- The strings are seeded VERBATIM as the code checks them today (incl. drifted strings
-- such as settings.d365.manage / settings.d365.rotate_secret / settings.d365.test_connection
-- / settings.email_config.edit / settings.units.manage / settings.infra.read|update /
-- settings.schema.read|admin / impersonate.tenant, and the role-name-as-permission gates
-- org.access.admin / org.schema.admin used by flags / schema-preview / promotions / security).
-- A follow-up task should converge gate-strings <-> permissions.enum.ts onto one vocabulary
-- and collapse the duplicate (.view/.read, .edit/.manage/.update) pairs, then re-seed canonically.
--
-- ----------------------------------------------------------------------------
-- ROLE MAPPING
-- ----------------------------------------------------------------------------
-- org-admin family  = codes/slugs: owner, admin, org_admin, org.access.admin,
--                     org.platform.admin, org.schema.admin  -> FULL settings.* set
--                     (mirrors the admin-class set used by migrations 050 / 148).
-- auditor           = read-only oversight: settings.audit.read, settings.users.view,
--                     settings.rules.view  (seeded defensively; the role may not exist
--                     in every org — the join simply yields 0 rows where absent).
-- Role-name-as-permission rows: the flags / schema / promotions / security gates check
-- requirePermission('org.access.admin') / ('org.schema.admin'); the matching role must
-- therefore hold its own name as a permission string. Granted to the admin family.
--
-- Dual-write: BOTH normalized role_permissions AND legacy roles.permissions jsonb cache
-- (the gates accept either read path). Idempotent: ON CONFLICT DO NOTHING + set-deduped
-- jsonb merge. SECURITY DEFINER fn + AFTER INSERT trigger (zzz-prefixed -> runs after
-- 037/050/064/080/116/146/148) + one-time backfill of every existing org.
-- ============================================================================

create or replace function public.seed_settings_rbac_matrix_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if to_regclass('public.role_permissions') is null or to_regclass('public.roles') is null then
    return; -- RBAC tables not present yet; nothing to grant.
  end if;

  -- ----------------------------------------------------------------------
  -- 1) Normalized storage: insert (role_id, permission) for the grant matrix.
  --    grant_matrix(permission, role_family):
  --      'admin'   -> org-admin family (codes owner/admin/org_admin + slugs org.*.admin)
  --      'auditor' -> the auditor role (code or slug 'auditor')
  -- ----------------------------------------------------------------------
  with grant_matrix(permission, role_family) as (
    values
      -- Org / tenant settings ----------------------------------------------------
      ('settings.org.read',             'admin'),
      ('settings.org.update',           'admin'),
      -- Users / roles -----------------------------------------------------------
      ('settings.users.view',           'admin'),
      ('settings.users.view',           'auditor'),
      ('settings.users.invite',         'admin'),
      ('settings.users.create',         'admin'),
      ('settings.users.deactivate',     'admin'),
      ('settings.users.manage',         'admin'),
      ('settings.roles.view',           'admin'),
      ('settings.roles.assign',         'admin'),
      ('settings.roles.manage',         'admin'),
      -- Audit / impersonation ---------------------------------------------------
      ('settings.audit.read',           'admin'),
      ('settings.audit.read',           'auditor'),
      ('impersonate.tenant',            'admin'),
      -- Rules registry ----------------------------------------------------------
      ('settings.rules.view',           'admin'),
      ('settings.rules.view',           'auditor'),
      -- Reference data ----------------------------------------------------------
      ('settings.reference.view',       'admin'),
      ('settings.reference.edit',       'admin'),
      ('settings.reference.import',     'admin'),
      -- Infrastructure (warehouses / machines / locations / lines) --------------
      -- read/update = the strings the code checks; view = export-capability check.
      ('settings.infra.read',           'admin'),
      ('settings.infra.update',         'admin'),
      ('settings.infra.view',           'admin'),
      -- Feature flags / modules -------------------------------------------------
      ('settings.flags.edit',           'admin'),
      ('settings.flags.view',           'admin'),
      -- Units of measure (also repairs the migration-064 ordering bug) ----------
      ('settings.units.manage',         'admin'),
      -- D365 integration (strings as the code checks them today) ----------------
      ('settings.d365.view',            'admin'),
      ('settings.d365.manage',          'admin'),
      ('settings.d365.rotate_secret',   'admin'),
      ('settings.d365.test_connection', 'admin'),
      -- Email configuration (both string variants the code uses) ----------------
      ('settings.email.view',           'admin'),
      ('settings.email.edit',           'admin'),
      ('settings.email.read',           'admin'),
      ('settings.email_config.edit',    'admin'),
      -- SSO / SCIM --------------------------------------------------------------
      ('settings.sso.edit',             'admin'),
      ('settings.scim.edit',            'admin'),
      -- IP allowlist ------------------------------------------------------------
      ('settings.ip_allowlist.edit',    'admin'),
      -- Security page -----------------------------------------------------------
      ('settings.security.view',        'admin'),
      ('settings.security.manage',      'admin'),
      ('settings.security.edit',        'admin'),
      -- Authorization policies --------------------------------------------------
      ('settings.authorization.view',   'admin'),
      ('settings.authorization.edit',   'admin'),
      -- Schema lifecycle (preview / diff read) ----------------------------------
      ('settings.schema.read',          'admin'),
      ('settings.schema.admin',         'admin'),
      -- Role-name-as-permission gates (flags / schema-preview / promotions / security)
      ('org.access.admin',              'admin'),
      ('org.schema.admin',              'admin')
  )
  insert into public.role_permissions (role_id, permission)
  select r.id, gm.permission
  from public.roles r
  join grant_matrix gm
    on (
         gm.role_family = 'admin'
         and (
           r.code in ('owner', 'admin', 'org_admin')
           or r.slug in ('owner', 'admin', 'org_admin',
                         'org.access.admin', 'org.platform.admin', 'org.schema.admin')
         )
       )
    or (
         gm.role_family = 'auditor'
         and (r.code = 'auditor' or r.slug = 'auditor')
       )
  where r.org_id = p_org_id
  on conflict (role_id, permission) do nothing;

  -- ----------------------------------------------------------------------
  -- 2) Legacy jsonb cache: rebuild each touched role's permissions array as the
  --    set-deduped union of its existing array + every role_permissions row it now
  --    holds (so either read path grants access). Only roles in the seeded families.
  -- ----------------------------------------------------------------------
  with expanded as (
    select
      r.id,
      coalesce(
        (
          select jsonb_agg(distinct merged.value order by merged.value)
          from (
            select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as value
            union all
            select rp.permission
            from public.role_permissions rp
            where rp.role_id = r.id
          ) merged(value)
        ),
        '[]'::jsonb
      ) as permissions
    from public.roles r
    where r.org_id = p_org_id
      and (
        r.code in ('owner', 'admin', 'org_admin', 'auditor')
        or r.slug in ('owner', 'admin', 'org_admin', 'auditor',
                      'org.access.admin', 'org.platform.admin', 'org.schema.admin')
      )
  )
  update public.roles r
     set permissions = expanded.permissions
    from expanded
   where r.id = expanded.id
     and r.permissions is distinct from expanded.permissions;
end;
$$;

revoke all on function public.seed_settings_rbac_matrix_for_org(uuid) from public;
revoke all on function public.seed_settings_rbac_matrix_for_org(uuid) from app_user;

create or replace function public.seed_settings_rbac_matrix_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_settings_rbac_matrix_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_settings_rbac_matrix_on_org_insert() from public;
revoke all on function public.seed_settings_rbac_matrix_on_org_insert() from app_user;

-- zzz-prefixed: triggers fire in alphabetical order, so this runs AFTER
-- trg_seed_npd_role_permissions (080, creates admin/viewer) and the other
-- per-org role-creation triggers. New orgs inherit the full settings matrix.
-- This is also the org-insert trigger that migration 064 forgot to install for
-- settings.units.manage (now carried in the matrix above).
drop trigger if exists trg_zzz_seed_settings_rbac_matrix on public.organizations;
create trigger trg_zzz_seed_settings_rbac_matrix
  after insert on public.organizations
  for each row
  execute function public.seed_settings_rbac_matrix_on_org_insert();

-- Backfill every existing org.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_settings_rbac_matrix_for_org(v_org_id);
  end loop;
end
$$;

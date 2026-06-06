-- Migration 244: 02-settings — grant the Settings + Reference manage permission set to the
-- org-admin role family so the org administrator can actually create/manage these screens.
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
--
-- ROOT CAUSE (found at live click-through, same recurring class as 116/146/148/149/236):
-- adding a permission string to the code's gate does NOT grant it. Three Settings screens
-- gate their writes on permission strings the org-admin role family was never granted:
--   * Settings -> Sites & lines  (settings/sites/_actions/sites.ts)  checks 'settings.org.update'
--   * Settings -> Shifts & cal.   (settings/shifts/_actions/shifts.ts) checks 'settings.org.update'
--   * Settings -> Manufacturing Operations (actions/reference/manufacturing-ops/*) checks
--       manufacturing_operations.view / .create / .edit / .delete / .reorder
-- The deployed org admin is on role `org.access.admin` (NOT `admin`); none of these strings
-- were seeded to it, so the admin gets "no permission to create" / "You do not have
-- permission to manage manufacturing operations." while vitest+tsc stay green.
--
-- The manufacturing-ops gate uses an INNER JOIN on role_permissions ONLY (no r.code /
-- roles.permissions jsonb fallback), so the grant MUST land in the normalized
-- role_permissions table. The sites/shifts gate additionally accepts r.code and the legacy
-- roles.permissions jsonb. To satisfy every gate variant and mirror 149/236, this seeds the
-- full set into BOTH the normalized role_permissions table AND the legacy roles.permissions
-- jsonb cache, for every existing org, with an AFTER INSERT trigger so new orgs inherit it.
-- Idempotent. Uses its own dedicated function + trigger name so it does NOT clobber the NPD
-- seed chain (seed_npd_org_admin_permissions_for_org) that migration 236 owns.

create or replace function public.seed_settings_org_admin_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  -- COMPLETE set of permission strings checked by the Settings + Reference screens whose
  -- writes the org admin must be able to perform. Verified by grep of each screen's
  -- _actions / page.tsx:
  --   settings.org.update            -> sites/_actions/sites.ts, shifts/_actions/shifts.ts
  --   manufacturing_operations.view  -> actions/reference/manufacturing-ops/list.ts
  --   manufacturing_operations.create-> actions/reference/manufacturing-ops/create.ts
  --   manufacturing_operations.edit  -> actions/reference/manufacturing-ops/{update,reset-to-seed}.ts
  --   manufacturing_operations.delete-> actions/reference/manufacturing-ops/deactivate.ts
  --   manufacturing_operations.reorder-> actions/reference/manufacturing-ops/reorder.ts
  v_perms text[] := array[
    'settings.org.update',
    'manufacturing_operations.view',
    'manufacturing_operations.create',
    'manufacturing_operations.edit',
    'manufacturing_operations.delete',
    'manufacturing_operations.reorder'
  ];
  -- org-admin role family across naming conventions used in this codebase (matches 149/236).
  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin'];
begin
  -- Normalized storage (required by the manufacturing-ops INNER-JOIN gate).
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles))
  on conflict (role_id, permission) do nothing;

  -- Legacy jsonb cache: union the perms into each admin role's permissions array.
  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select unnest(v_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles));
end;
$$;

revoke all on function public.seed_settings_org_admin_permissions_for_org(uuid) from public;
revoke all on function public.seed_settings_org_admin_permissions_for_org(uuid) from app_user;

create or replace function public.seed_settings_org_admin_permissions_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_settings_org_admin_permissions_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_settings_org_admin_permissions_on_org_insert() from public;
revoke all on function public.seed_settings_org_admin_permissions_on_org_insert() from app_user;

-- Fire after org insert so the admin roles already exist (zzz name -> after earlier seeds).
drop trigger if exists trg_zzz_seed_settings_org_admin_permissions on public.organizations;
create trigger trg_zzz_seed_settings_org_admin_permissions
  after insert on public.organizations
  for each row
  execute function public.seed_settings_org_admin_permissions_on_org_insert();

-- Backfill every existing org so already-provisioned tenants (incl. the live test org)
-- receive the Settings + Reference manage perms immediately.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_settings_org_admin_permissions_for_org(v_org_id);
  end loop;
end
$$;

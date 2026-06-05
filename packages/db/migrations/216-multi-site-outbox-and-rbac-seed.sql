-- Migration 216: 14-multi-site — grant the multi_site.* RBAC permission family to the org-admin role
--   family + site-manager operator roles in BOTH the normalized role_permissions table AND the legacy
--   roles.permissions jsonb cache, with an AFTER INSERT trigger + full backfill.
-- PRD: docs/prd/14-MULTI-SITE-PRD.md §10A.5 (lane/rate-card RBAC), §10B MS-101..110 (admin surfaces),
--      §11.5 (activation), §14.2 (super-admin audit).
-- Tasks: T-031 (permission enum) + T-032 (RBAC-seed P0, recurring-live-bug class 1).
-- Canonical permission strings: packages/rbac/src/permissions.enum.ts (ALL_MULTI_SITE_PERMISSIONS).
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
--
-- ROOT CAUSE (X-1 unreachable-feature / 403-everywhere class — same as 116/146/148/149/154/185/192/198):
--   adding the multi_site.* strings to the enum (T-031) grants NOBODY access. The deployed org
--   administrator is on the canonical org-admin role family, which receives NONE of the multi_site.*
--   strings — so every multi-site page/action 403s at live Gate-5. This grants the COMPLETE
--   multi_site.* set (26 strings) to the org-admin role family, and the site-operational subset to a
--   site-manager role family, in BOTH stores, for every existing org, with an AFTER INSERT trigger so
--   new orgs inherit it. The admin-family grant is the load-bearing one for Gate-5 reachability.
--   Models on 149/154/185/192/198.

create or replace function public.seed_multi_site_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  -- Complete multi_site.* family (PRD §10A.5 / §10B / §11.5 / §14.2). Mirrors ALL_MULTI_SITE_PERMISSIONS.
  v_all_perms text[] := array[
    'multi_site.site.view',
    'multi_site.site.create',
    'multi_site.site.edit',
    'multi_site.site.decommission',
    'multi_site.site_access.assign',
    'multi_site.site_access.revoke',
    'multi_site.site_access.bulk_assign',
    'multi_site.site_settings.override',
    'multi_site.site_settings.clear',
    'multi_site.ist.create',
    'multi_site.ist.amend',
    'multi_site.ist.cancel',
    'multi_site.ist.approve',
    'multi_site.lane.create',
    'multi_site.lane.edit',
    'multi_site.lane.deactivate',
    'multi_site.rate_card.upload',
    'multi_site.rate_card.approve',
    'multi_site.rate_card.delete',
    'multi_site.replication.retry',
    'multi_site.replication.run_sync',
    'multi_site.conflict.resolve',
    'multi_site.activation.start',
    'multi_site.activation.rollback',
    'multi_site.config.promote',
    'multi_site.cross_site.read'
  ];
  -- Site-manager operational subset: views sites, manages IST (create/amend/cancel/approve at own
  -- site per V-MS-10/11), creates lanes, uploads rate cards, retries replication. NOT the elevated
  -- org-level admin strings (site create/edit/decommission, site_access bulk admin, rate_card
  -- approve/delete, conflict.resolve, activation.start/rollback, config.promote, cross_site.read —
  -- org-admin / super-admin only, SoD).
  v_site_manager_perms text[] := array[
    'multi_site.site.view',
    'multi_site.ist.create',
    'multi_site.ist.amend',
    'multi_site.ist.cancel',
    'multi_site.ist.approve',
    'multi_site.lane.create',
    'multi_site.lane.edit',
    'multi_site.rate_card.upload',
    'multi_site.replication.retry',
    'multi_site.replication.run_sync'
  ];
  -- org-admin role family across naming conventions used in this codebase.
  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin'];
  -- site-manager role family (defensive — codes vary; grant is a no-op if absent).
  v_site_manager_roles text[] := array['site_manager','site_admin','plant_manager','warehouse_manager','operations_manager'];
begin
  -- --- Normalized storage (role_permissions) ---
  -- admin family: full set.
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_all_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles))
  on conflict (role_id, permission) do nothing;

  -- site-manager family: operational subset.
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_site_manager_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_site_manager_roles) or r.slug = any(v_site_manager_roles))
  on conflict (role_id, permission) do nothing;

  -- --- Legacy jsonb cache (roles.permissions) ---
  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select unnest(v_all_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles));

  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select unnest(v_site_manager_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_site_manager_roles) or r.slug = any(v_site_manager_roles));
end;
$$;

revoke all on function public.seed_multi_site_permissions_for_org(uuid) from public;
revoke all on function public.seed_multi_site_permissions_for_org(uuid) from app_user;

create or replace function public.seed_multi_site_permissions_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_multi_site_permissions_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_multi_site_permissions_on_org_insert() from public;
revoke all on function public.seed_multi_site_permissions_on_org_insert() from app_user;

-- Fire after the 080 role-seeding trigger so the admin roles already exist (zzz prefix sorts last).
drop trigger if exists trg_zzz_seed_multi_site_permissions on public.organizations;
create trigger trg_zzz_seed_multi_site_permissions
  after insert on public.organizations
  for each row
  execute function public.seed_multi_site_permissions_on_org_insert();

-- Backfill every existing org.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_multi_site_permissions_for_org(v_org_id);
  end loop;
end
$$;

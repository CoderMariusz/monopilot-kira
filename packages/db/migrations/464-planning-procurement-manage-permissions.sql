-- Migration 464: Wave 2 planning procurement RBAC — seed planning.po.manage,
--   planning.to.manage and planning.supplier.manage for the org-admin + planner
--   role families (same grant surface as planning.mrp.run in migration 301).
-- Canonical strings: packages/rbac/src/permissions.enum.ts.
-- Wave0 lock: org_id business scope; dual-store (role_permissions + roles.permissions jsonb).
-- Idempotent: ON CONFLICT DO NOTHING; jsonb merge is set-deduplicated.

create or replace function public.seed_planning_procurement_manage_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_procurement_perms text[] := array[
    'planning.po.manage',
    'planning.to.manage',
    'planning.supplier.manage'
  ];
  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin'];
  v_planner_roles text[] := array[
    'planner','planning_manager','planning-manager','planning',
    'production_planner','master_planner','manager','operations_manager'
  ];
begin
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_procurement_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles))
  on conflict (role_id, permission) do nothing;

  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_procurement_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_planner_roles) or r.slug = any(v_planner_roles))
  on conflict (role_id, permission) do nothing;

  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select unnest(v_procurement_perms)
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
           select unnest(v_procurement_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_planner_roles) or r.slug = any(v_planner_roles));
end;
$$;

revoke all on function public.seed_planning_procurement_manage_permissions_for_org(uuid) from public;
revoke all on function public.seed_planning_procurement_manage_permissions_for_org(uuid) from app_user;

create or replace function public.seed_planning_procurement_manage_permissions_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_planning_procurement_manage_permissions_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_planning_procurement_manage_permissions_on_org_insert() from public;
revoke all on function public.seed_planning_procurement_manage_permissions_on_org_insert() from app_user;

drop trigger if exists trg_zzz_seed_planning_procurement_manage_permissions on public.organizations;
create trigger trg_zzz_seed_planning_procurement_manage_permissions
  after insert on public.organizations
  for each row
  execute function public.seed_planning_procurement_manage_permissions_on_org_insert();

do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_planning_procurement_manage_permissions_for_org(v_org_id);
  end loop;
end
$$;

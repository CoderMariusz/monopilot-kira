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
  v_planning_source_perm text := 'npd.planning.write';
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

  -- Continuity: every role that already holds npd.planning.write (either RBAC
  -- store) receives the dedicated procurement gates — mirrors migration 319.
  with target_roles as (
    select distinct r.id
    from public.roles r
    left join public.role_permissions rp
      on rp.role_id = r.id
     and rp.permission = v_planning_source_perm
    where r.org_id = p_org_id
      and (
        rp.permission is not null
        or coalesce(r.permissions, '[]'::jsonb) ? v_planning_source_perm
      )
  )
  insert into public.role_permissions (role_id, permission)
  select tr.id, p.permission
  from target_roles tr
  cross join unnest(v_procurement_perms) as p(permission)
  on conflict (role_id, permission) do nothing;

  with target_roles as (
    select distinct r.id
    from public.roles r
    left join public.role_permissions rp
      on rp.role_id = r.id
     and rp.permission = v_planning_source_perm
    where r.org_id = p_org_id
      and (
        rp.permission is not null
        or coalesce(r.permissions, '[]'::jsonb) ? v_planning_source_perm
      )
  ),
  expanded as (
    select
      r.id,
      coalesce(
        (
          select jsonb_agg(distinct merged.permission order by merged.permission)
          from (
            select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
            union all
            select unnest(v_procurement_perms)
          ) merged
        ),
        '[]'::jsonb
      ) as permissions
    from public.roles r
    join target_roles tr on tr.id = r.id
    where r.org_id = p_org_id
  )
  update public.roles r
     set permissions = expanded.permissions
    from expanded
   where r.id = expanded.id;
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

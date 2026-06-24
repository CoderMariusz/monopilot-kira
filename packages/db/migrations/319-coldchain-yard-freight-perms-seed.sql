-- Migration 319: Cold-chain, yard, and freight RBAC permission seed.
-- Grants the dedicated cold-chain, yard, and freight action-gate permissions to
-- roles that already carry the predecessor quality/planning grants. Idempotent:
-- role_permissions uses ON CONFLICT DO NOTHING, and roles.permissions is merged
-- set-wise for the legacy JSONB cache.

create or replace function public.seed_coldchain_yard_freight_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_quality_source_perms text[] := array[
    'quality.settings.edit',
    'quality.inspection.execute'
  ];
  v_quality_new_perms text[] := array[
    'quality.coldchain.record',
    'quality.coldchain.manage'
  ];
  v_planning_source_perm text := 'npd.planning.write';
  v_planning_new_perms text[] := array[
    'yard.manage',
    'freight.manage'
  ];
begin
  -- --- Normalized storage (role_permissions) ---
  -- Cold-chain: every role that already holds quality.settings.edit and/or
  -- quality.inspection.execute receives the dedicated cold-chain gates.
  with target_roles as (
    select distinct r.id
    from public.roles r
    left join public.role_permissions rp
      on rp.role_id = r.id
     and rp.permission = any(v_quality_source_perms)
    where r.org_id = p_org_id
      and (
        rp.permission is not null
        or coalesce(r.permissions, '[]'::jsonb) ?| v_quality_source_perms
      )
  )
  insert into public.role_permissions (role_id, permission)
  select tr.id, p.permission
  from target_roles tr
  cross join unnest(v_quality_new_perms) as p(permission)
  on conflict (role_id, permission) do nothing;

  -- Yard/freight: every role that already holds npd.planning.write receives the
  -- dedicated logistics gates.
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
  cross join unnest(v_planning_new_perms) as p(permission)
  on conflict (role_id, permission) do nothing;

  -- --- Legacy jsonb cache (roles.permissions) ---
  with target_roles as (
    select distinct r.id
    from public.roles r
    left join public.role_permissions rp
      on rp.role_id = r.id
     and rp.permission = any(v_quality_source_perms)
    where r.org_id = p_org_id
      and (
        rp.permission is not null
        or coalesce(r.permissions, '[]'::jsonb) ?| v_quality_source_perms
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
            select unnest(v_quality_new_perms)
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
            select unnest(v_planning_new_perms)
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

revoke all on function public.seed_coldchain_yard_freight_permissions_for_org(uuid) from public;
revoke all on function public.seed_coldchain_yard_freight_permissions_for_org(uuid) from app_user;

create or replace function public.seed_coldchain_yard_freight_permissions_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_coldchain_yard_freight_permissions_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_coldchain_yard_freight_permissions_on_org_insert() from public;
revoke all on function public.seed_coldchain_yard_freight_permissions_on_org_insert() from app_user;

-- Fire after the existing zzz permission seed triggers so predecessor grants
-- (quality.settings.edit, quality.inspection.execute, npd.planning.write) exist.
drop trigger if exists trg_zzzz_seed_coldchain_yard_freight_permissions on public.organizations;
create trigger trg_zzzz_seed_coldchain_yard_freight_permissions
  after insert on public.organizations
  for each row
  execute function public.seed_coldchain_yard_freight_permissions_on_org_insert();

-- Backfill every existing org.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_coldchain_yard_freight_permissions_for_org(v_org_id);
  end loop;
end
$$;

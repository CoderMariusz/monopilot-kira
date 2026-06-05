-- Migration 219: OEE RBAC seed role slug corrective migration.
--
-- Source migrations read:
--   * 203-oee-schema-foundation.sql defines public.seed_oee_permissions_for_org.
--   * 199-finance-schema-and-rbac-seed.sql matches role families with
--     (r.code = any(...) or r.slug = any(...)); OEE now mirrors that pattern.

create or replace function public.seed_oee_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_all_perms text[] := array[
    'oee.dashboard.read',
    'oee.target.edit',
    'oee.override.create',
    'oee.override.delete',
    'oee.export.csv',
    'oee.export.pdf',
    'oee.anomaly.acknowledge',
    'oee.big_loss.map_edit',
    'oee.shift_pattern.edit',
    'oee.shift_pattern.read',
    'oee.downtime.annotate',
    'oee.downtime.escalate',
    'oee.tv.kiosk_view'
  ];
  v_supervisor_perms text[] := array[
    'oee.dashboard.read',
    'oee.export.csv',
    'oee.export.pdf',
    'oee.anomaly.acknowledge',
    'oee.shift_pattern.read',
    'oee.downtime.annotate',
    'oee.downtime.escalate',
    'oee.tv.kiosk_view'
  ];
  v_viewer_perms text[] := array[
    'oee.dashboard.read',
    'oee.export.csv',
    'oee.export.pdf',
    'oee.tv.kiosk_view'
  ];
  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin','oee_admin'];
  v_supervisor_roles text[] := array['oee_supervisor'];
  v_viewer_roles text[] := array['oee_viewer'];
begin
  -- --- Normalized storage (role_permissions) ---
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_all_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles))
  on conflict (role_id, permission) do nothing;

  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_supervisor_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_supervisor_roles) or r.slug = any(v_supervisor_roles))
  on conflict (role_id, permission) do nothing;

  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_viewer_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_viewer_roles) or r.slug = any(v_viewer_roles))
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
           select unnest(v_supervisor_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_supervisor_roles) or r.slug = any(v_supervisor_roles));

  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select unnest(v_viewer_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_viewer_roles) or r.slug = any(v_viewer_roles));
end;
$$;

revoke all on function public.seed_oee_permissions_for_org(uuid) from public;
revoke all on function public.seed_oee_permissions_for_org(uuid) from app_user;

-- Backfill every existing org. The seed is idempotent:
-- role_permissions uses ON CONFLICT DO NOTHING, and roles.permissions is merged.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_oee_permissions_for_org(v_org_id);
  end loop;
end
$$;

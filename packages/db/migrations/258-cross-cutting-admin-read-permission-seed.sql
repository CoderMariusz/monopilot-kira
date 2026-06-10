-- Migration 258: cross-cutting RBAC sitemap audit - grant read/view module permissions
-- to the org-admin role family.
-- Audit: 2026-06-09 sitemap audit. Wave0 lock: org_id business scope (NOT tenant_id);
-- RLS policies use app.current_org_id(), never raw current_setting.
--
-- Mirrors the 149/230/236 seed pattern: grant exact canonical permission strings from
-- packages/rbac/src/permissions.enum.ts to the org-admin role family, in BOTH the
-- normalized role_permissions table and the legacy roles.permissions jsonb cache, with
-- an AFTER INSERT trigger for new orgs plus an existing-org backfill. Idempotent.

create or replace function public.seed_cross_cutting_admin_read_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  -- Exact read/view strings from the canonical Permission enum.
  v_perms text[] := array[
    'quality.dashboard.view',
    'ship.dashboard.view',
    'oee.dashboard.read',
    'oee.shift_pattern.read',
    'oee.tv.kiosk_view',
    'mnt.asset.read',
    'multi_site.site.view',
    'multi_site.cross_site.read'
  ];
  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin'];
begin
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles))
  on conflict (role_id, permission) do nothing;

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

revoke all on function public.seed_cross_cutting_admin_read_permissions_for_org(uuid) from public;
revoke all on function public.seed_cross_cutting_admin_read_permissions_for_org(uuid) from app_user;

create or replace function public.seed_cross_cutting_admin_read_permissions_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_cross_cutting_admin_read_permissions_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_cross_cutting_admin_read_permissions_on_org_insert() from public;
revoke all on function public.seed_cross_cutting_admin_read_permissions_on_org_insert() from app_user;

drop trigger if exists trg_zzz_seed_cross_cutting_admin_read_permissions on public.organizations;
create trigger trg_zzz_seed_cross_cutting_admin_read_permissions
  after insert on public.organizations
  for each row
  execute function public.seed_cross_cutting_admin_read_permissions_on_org_insert();

do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_cross_cutting_admin_read_permissions_for_org(v_org_id);
  end loop;
end
$$;

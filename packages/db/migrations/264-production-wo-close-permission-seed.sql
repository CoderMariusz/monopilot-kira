-- Migration 264: seed production.wo.close to org-admin role family.
-- Mirrors migration 258 pattern. Wave0 lock: org_id business scope (NOT tenant_id).

create or replace function public.seed_production_wo_close_permission_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_perms text[] := array['production.wo.close'];
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

revoke all on function public.seed_production_wo_close_permission_for_org(uuid) from public;
revoke all on function public.seed_production_wo_close_permission_for_org(uuid) from app_user;

create or replace function public.seed_production_wo_close_permission_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_production_wo_close_permission_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_production_wo_close_permission_on_org_insert() from public;
revoke all on function public.seed_production_wo_close_permission_on_org_insert() from app_user;

drop trigger if exists trg_zzz_seed_production_wo_close_permission on public.organizations;
create trigger trg_zzz_seed_production_wo_close_permission
  after insert on public.organizations
  for each row
  execute function public.seed_production_wo_close_permission_on_org_insert();

do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_production_wo_close_permission_for_org(v_org_id);
  end loop;
end
$$;

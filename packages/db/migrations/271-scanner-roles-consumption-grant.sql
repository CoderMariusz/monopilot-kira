-- Migration 271: grant production scanner write permissions to scanner roles.
--
-- QA release-path audit (2026-06-11): scanner-dedicated roles can reach the
-- production consume/output/waste routes, but migration 185 seeded the operator
-- production write subset to operator/line roles only. Mirror the 258/260
-- SECURITY DEFINER + trg_zzz + existing-org backfill pattern. Idempotent.

create or replace function public.seed_scanner_roles_production_write_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_perms text[] := array[
    'production.consumption.write',
    'production.output.write',
    'production.waste.write'
  ];
  v_scanner_roles text[] := array['scanner','scanner_operator'];
begin
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_scanner_roles) or r.slug = any(v_scanner_roles))
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
     and (r.code = any(v_scanner_roles) or r.slug = any(v_scanner_roles));
end;
$$;

revoke all on function public.seed_scanner_roles_production_write_permissions_for_org(uuid) from public;
revoke all on function public.seed_scanner_roles_production_write_permissions_for_org(uuid) from app_user;

create or replace function public.seed_scanner_roles_production_write_permissions_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_scanner_roles_production_write_permissions_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_scanner_roles_production_write_permissions_on_org_insert() from public;
revoke all on function public.seed_scanner_roles_production_write_permissions_on_org_insert() from app_user;

drop trigger if exists trg_zzz_seed_scanner_roles_production_write_permissions on public.organizations;
create trigger trg_zzz_seed_scanner_roles_production_write_permissions
  after insert on public.organizations
  for each row
  execute function public.seed_scanner_roles_production_write_permissions_on_org_insert();

do $$
declare
  v_org record;
begin
  for v_org in select id from public.organizations loop
    perform public.seed_scanner_roles_production_write_permissions_for_org(v_org.id);
  end loop;
end;
$$;

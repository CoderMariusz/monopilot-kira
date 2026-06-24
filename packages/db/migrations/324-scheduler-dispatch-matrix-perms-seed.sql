-- Migration 324: seed scheduler.run.dispatch / scheduler.matrix.read /
-- scheduler.matrix.edit to the org-admin role family.
--
-- scheduler-actions.ts enforces these three permission strings (run the
-- scheduler "Uruchom harmonogram" + read/edit the changeover matrix), but
-- migration 260 only ever seeded scheduler.run.read — so the dispatch button and
-- the matrix were dead for ALL roles incl. org admin. Found by the 2026-06-24
-- live browser audit. Mirrors mig 260's seed shape exactly (same admin roles).

create or replace function public.seed_scheduler_dispatch_matrix_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_perms text[] := array['scheduler.run.dispatch','scheduler.matrix.read','scheduler.matrix.edit'];
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

revoke all on function public.seed_scheduler_dispatch_matrix_permissions_for_org(uuid) from public;
revoke all on function public.seed_scheduler_dispatch_matrix_permissions_for_org(uuid) from app_user;

create or replace function public.seed_scheduler_dispatch_matrix_permissions_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_scheduler_dispatch_matrix_permissions_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_scheduler_dispatch_matrix_permissions_on_org_insert() from public;
revoke all on function public.seed_scheduler_dispatch_matrix_permissions_on_org_insert() from app_user;

drop trigger if exists trg_zzzz_seed_scheduler_dispatch_matrix_permissions on public.organizations;
create trigger trg_zzzz_seed_scheduler_dispatch_matrix_permissions
  after insert on public.organizations
  for each row
  execute function public.seed_scheduler_dispatch_matrix_permissions_on_org_insert();

do $$
declare
  v_org record;
begin
  for v_org in select id from public.organizations loop
    perform public.seed_scheduler_dispatch_matrix_permissions_for_org(v_org.id);
  end loop;
end;
$$;

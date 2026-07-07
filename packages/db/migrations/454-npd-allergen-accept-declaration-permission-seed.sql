-- Migration 454: NN-TEC-5 — seed npd.allergen.accept_declaration for allergen declaration accept/revoke.
-- Replaces the accept-declaration.ts npd_manager role-code bypass with a real RBAC permission.
-- Canonical string: packages/rbac/src/permissions.enum.ts (NPD_ALLERGEN_ACCEPT_DECLARATION).
-- Wave0 lock: org_id business scope; dual-store (role_permissions + roles.permissions jsonb).
-- Idempotent: ON CONFLICT DO NOTHING; jsonb merge is set-deduplicated.

create or replace function public.seed_npd_allergen_accept_declaration_permission_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.role_permissions (role_id, permission)
  select r.id, 'npd.allergen.accept_declaration'
  from public.roles r
  where r.org_id = p_org_id
    and r.code = 'npd_manager'
  on conflict (role_id, permission) do nothing;

  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select 'npd.allergen.accept_declaration'
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and r.code = 'npd_manager';
end;
$$;

revoke all on function public.seed_npd_allergen_accept_declaration_permission_for_org(uuid) from public;
revoke all on function public.seed_npd_allergen_accept_declaration_permission_for_org(uuid) from app_user;

create or replace function public.seed_npd_allergen_accept_declaration_permission_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_npd_allergen_accept_declaration_permission_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_npd_allergen_accept_declaration_permission_on_org_insert() from public;
revoke all on function public.seed_npd_allergen_accept_declaration_permission_on_org_insert() from app_user;

drop trigger if exists trg_zzz_seed_npd_allergen_accept_declaration_permission on public.organizations;
create trigger trg_zzz_seed_npd_allergen_accept_declaration_permission
  after insert on public.organizations
  for each row
  execute function public.seed_npd_allergen_accept_declaration_permission_on_org_insert();

do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_npd_allergen_accept_declaration_permission_for_org(v_org_id);
  end loop;
end
$$;

-- Migration 146: 01-npd module-close — seed npd.allergen.write to allergen-writing roles.
-- PRD: docs/prd/01-NPD-PRD.md §2.2 (RBAC) + §13 (allergen cascade).
-- Canonical permission string: packages/rbac/src/permissions.enum.ts (NPD_ALLERGEN_WRITE).
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
--
-- The allergen Server Actions (apps/web/app/(npd)/fa/[productCode]/allergens/_actions/*)
-- gate the write path on the canonical permission 'npd.allergen.write'. Migration 080
-- seeded the NPD permission matrix but predates this permission, so without a seed every
-- real user is rejected (read path stays open; write/refresh always 403). Allergen
-- declaration is core/technical product data, so it mirrors npd.core.write's role set:
-- npd_manager, core_user, admin. Granted in BOTH the normalized role_permissions table and
-- the legacy roles.permissions jsonb cache (actions accept either), for every existing org,
-- with an AFTER INSERT trigger so newly-created orgs inherit it. Mirrors migration 116.
-- Idempotent: ON CONFLICT DO NOTHING on the table; jsonb merge is set-deduplicated.

create or replace function public.seed_npd_allergen_write_permission_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  -- Normalized storage: allergen-writing roles get the canonical permission row.
  insert into public.role_permissions (role_id, permission)
  select r.id, 'npd.allergen.write'
  from public.roles r
  where r.org_id = p_org_id
    and r.code in ('npd_manager', 'core_user', 'admin')
  on conflict (role_id, permission) do nothing;

  -- Legacy jsonb cache: keep each role's permissions array in sync so either read path
  -- (role_permissions row OR roles.permissions ? perm) grants access.
  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select 'npd.allergen.write'
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and r.code in ('npd_manager', 'core_user', 'admin');
end;
$$;

revoke all on function public.seed_npd_allergen_write_permission_for_org(uuid) from public;
revoke all on function public.seed_npd_allergen_write_permission_for_org(uuid) from app_user;

create or replace function public.seed_npd_allergen_write_permission_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_npd_allergen_write_permission_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_npd_allergen_write_permission_on_org_insert() from public;
revoke all on function public.seed_npd_allergen_write_permission_on_org_insert() from app_user;

-- Run AFTER the 080 NPD seed trigger (which creates the npd_manager/core_user/admin roles
-- on org insert). Trigger names fire alphabetically; 'trg_seed_npd_role_permissions' (080)
-- sorts before 'trg_zzz_seed_npd_allergen_write_permission', so the roles already exist.
drop trigger if exists trg_zzz_seed_npd_allergen_write_permission on public.organizations;
create trigger trg_zzz_seed_npd_allergen_write_permission
  after insert on public.organizations
  for each row
  execute function public.seed_npd_allergen_write_permission_on_org_insert();

-- Backfill every existing org.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_npd_allergen_write_permission_for_org(v_org_id);
  end loop;
end
$$;

-- Migration 116: T-089 (cross-review HIGH-2) — seed gdpr.erasure.execute to admin.
-- PRD: docs/prd/01-NPD-PRD.md §15 Compliance + Foundation §15 GDPR.
-- Canonical permission string: packages/rbac/src/permissions.enum.ts (GDPR_ERASURE_EXECUTE).
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
--
-- The redact-user Server Action (apps/web/app/(admin)/gdpr/_actions/redact-user.ts)
-- gates on the canonical permission 'gdpr.erasure.execute'. Without a seed, every
-- real admin is rejected. This migration grants that permission to the org-scoped
-- 'admin' role in BOTH the normalized role_permissions table and the legacy
-- roles.permissions jsonb cache (the action accepts either), for every existing
-- org, and installs an AFTER INSERT trigger so newly-created orgs inherit it too.
-- Idempotent: ON CONFLICT DO NOTHING on the table; jsonb merge is set-deduplicated.

create or replace function public.seed_gdpr_erasure_permission_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  -- Normalized storage: the admin role gets the canonical permission row.
  insert into public.role_permissions (role_id, permission)
  select r.id, 'gdpr.erasure.execute'
  from public.roles r
  where r.org_id = p_org_id
    and r.code = 'admin'
  on conflict (role_id, permission) do nothing;

  -- Legacy jsonb cache: keep the admin role's permissions array in sync so either
  -- read path (role_permissions row OR roles.permissions ? perm) grants access.
  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select 'gdpr.erasure.execute'
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and r.code = 'admin';
end;
$$;

revoke all on function public.seed_gdpr_erasure_permission_for_org(uuid) from public;
revoke all on function public.seed_gdpr_erasure_permission_for_org(uuid) from app_user;

create or replace function public.seed_gdpr_erasure_permission_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_gdpr_erasure_permission_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_gdpr_erasure_permission_on_org_insert() from public;
revoke all on function public.seed_gdpr_erasure_permission_on_org_insert() from app_user;

-- Run AFTER the 080 NPD seed trigger (which creates the 'admin' role on org insert).
-- Trigger names fire alphabetically; 'trg_seed_npd_role_permissions' (080) sorts
-- before 'trg_zzz_seed_gdpr_erasure_permission', so the admin role already exists.
drop trigger if exists trg_zzz_seed_gdpr_erasure_permission on public.organizations;
create trigger trg_zzz_seed_gdpr_erasure_permission
  after insert on public.organizations
  for each row
  execute function public.seed_gdpr_erasure_permission_on_org_insert();

-- Backfill every existing org.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_gdpr_erasure_permission_for_org(v_org_id);
  end loop;
end
$$;

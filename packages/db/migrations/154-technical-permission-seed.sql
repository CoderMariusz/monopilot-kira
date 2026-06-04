-- Migration 154: 03-technical Gate-5 reachability fix — grant the full technical.* permission
-- family to the org-admin role family so the org administrator can actually reach the Technical
-- (factory specification) module.
-- PRD: docs/prd/03-TECHNICAL-PRD.md §3 (RBAC).
-- Canonical permission strings: packages/rbac/src/permissions.enum.ts (ALL_TECHNICAL_PERMISSIONS
-- added by T-091 + the pre-existing TECHNICAL_PRODUCT_SPEC_APPROVE workflow string).
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
--
-- ROOT CAUSE (X-1 unreachable-feature class — same as 116/146/148/149): adding the
-- technical.* strings to the enum (T-091) does NOT grant anyone access. Migration 080's
-- seed grants permissions to functional role CODES (npd_manager/core_user/admin/etc.), but the
-- deployed org administrator is on the canonical org-admin role family
-- ('org.access.admin' / 'org.platform.admin' / 'owner' / 'admin' / 'org_admin'), which receives
-- NONE of the technical.* strings — so every technical page returns "You do not have
-- permission…" for the org admin at live Gate-5. This grants the COMPLETE technical.* set to
-- the org-admin role family, in BOTH the normalized role_permissions table and the legacy
-- roles.permissions jsonb cache, for every existing org, with an AFTER INSERT trigger so new
-- orgs inherit it. Idempotent: ON CONFLICT DO NOTHING on the table; jsonb merge is
-- set-deduplicated and sorted. Models exactly on 149-npd-permissions-org-admin-seed.sql.

create or replace function public.seed_technical_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  -- The complete technical.* family the 03-technical pages/actions check: the 10 strings
  -- added by T-091 (ALL_TECHNICAL_PERMISSIONS) plus the pre-existing
  -- technical.product_spec.approve workflow-authorization string, so the org admin can also
  -- approve product specs.
  v_perms text[] := array[
    'technical.allergens.edit',
    'technical.bom.approve',
    'technical.bom.create',
    'technical.bom.generate_batch',
    'technical.bom.version_publish',
    'technical.cost.edit',
    'technical.d365.sync_trigger',
    'technical.items.create',
    'technical.items.deactivate',
    'technical.items.edit',
    'technical.product_spec.approve'
  ];
  -- org-admin role family across naming conventions used in this codebase.
  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin'];
begin
  -- Normalized storage.
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles))
  on conflict (role_id, permission) do nothing;

  -- Legacy jsonb cache: union the perms into each admin role's permissions array.
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

revoke all on function public.seed_technical_permissions_for_org(uuid) from public;
revoke all on function public.seed_technical_permissions_for_org(uuid) from app_user;

create or replace function public.seed_technical_permissions_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_technical_permissions_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_technical_permissions_on_org_insert() from public;
revoke all on function public.seed_technical_permissions_on_org_insert() from app_user;

-- Fire after the 080 role-seeding trigger so the admin roles already exist (zzz prefix).
drop trigger if exists trg_zzz_seed_technical_permissions on public.organizations;
create trigger trg_zzz_seed_technical_permissions
  after insert on public.organizations
  for each row
  execute function public.seed_technical_permissions_on_org_insert();

-- Backfill every existing org.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_technical_permissions_for_org(v_org_id);
  end loop;
end
$$;

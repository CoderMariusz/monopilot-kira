-- Migration 210: 02-settings reachability fix — seed settings.infra.read / settings.infra.update.
-- PRD: docs/prd/02-SETTINGS-PRD.md (Infrastructure: warehouses, machines, locations, lines).
-- Canonical permission strings checked by code:
--   READ_PERMISSION   = 'settings.infra.read'   (page-level read gate)
--   UPDATE_PERMISSION = 'settings.infra.update'  (create/deactivate/edit gate)
-- Source-of-truth usages (NOT seeded prior to this migration):
--   apps/web/app/[locale]/(app)/(admin)/settings/infra/{warehouses,machines,locations,lines}/page.tsx
--   apps/web/actions/infra/{warehouse,machine,location,line}.ts  (EDIT_PERMISSION = 'settings.infra.update')
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
--
-- ROOT CAUSE: The entire Settings → Infrastructure section (warehouses/machines/
-- locations/lines) gates its server-component READ on 'settings.infra.read' and every
-- create/edit/deactivate on 'settings.infra.update'. Neither string was ever seeded into
-- public.role_permissions or the legacy roles.permissions jsonb cache. The settings
-- *page* hasPermission() helper has NO admin-role fallback (unlike the Server Action
-- helper), so every admin sees "permission_denied" and the "Add warehouse" control is
-- never rendered — they cannot add a warehouse. (Live preview had only the mismatched
-- strings 'settings.infra.view' / 'settings.infrastructure.edit', which the code never
-- reads.) This mirrors the gdpr.erasure.execute (116) and npd.allergen.write (146)
-- unseeded-permission bug class.
--
-- Granted to the admin-class role set used by migration 050 (settings.users.manage /
-- settings.security.manage): codes owner/admin/org_admin and slugs
-- owner/admin/org.access.admin/org.platform.admin/org.schema.admin. This deliberately
-- includes org.access.admin because the live admin@monopilot.test test user is on the
-- org.access.admin role, not 'admin'. Granted in BOTH the normalized role_permissions
-- table and the legacy roles.permissions jsonb cache (the page + action accept either),
-- for every existing org, with an AFTER INSERT trigger so newly-created orgs inherit it.
-- Idempotent: ON CONFLICT DO NOTHING on the table; jsonb merge is set-deduplicated.

create or replace function public.seed_settings_infra_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  -- Normalized storage: admin-class roles get the two canonical infra permission rows.
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join (values ('settings.infra.read'), ('settings.infra.update')) as p(permission)
  where r.org_id = p_org_id
    and (
      r.code in ('owner', 'admin', 'org_admin')
      or r.slug in ('owner', 'admin', 'org.access.admin', 'org.platform.admin', 'org.schema.admin')
    )
  on conflict (role_id, permission) do nothing;

  -- Legacy jsonb cache: keep each admin-class role's permissions array in sync so either
  -- read path (role_permissions row OR roles.permissions ? perm) grants access.
  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select 'settings.infra.read'
           union all
           select 'settings.infra.update'
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (
       r.code in ('owner', 'admin', 'org_admin')
       or r.slug in ('owner', 'admin', 'org.access.admin', 'org.platform.admin', 'org.schema.admin')
     );
end;
$$;

revoke all on function public.seed_settings_infra_permissions_for_org(uuid) from public;
revoke all on function public.seed_settings_infra_permissions_for_org(uuid) from app_user;

create or replace function public.seed_settings_infra_permissions_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_settings_infra_permissions_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_settings_infra_permissions_on_org_insert() from public;
revoke all on function public.seed_settings_infra_permissions_on_org_insert() from app_user;

-- Run AFTER the 080 NPD seed trigger (which creates the org-scoped roles on org insert).
-- Trigger names fire alphabetically; 'trg_seed_npd_role_permissions' (080) sorts before
-- 'trg_zzz_seed_settings_infra_permissions', so the roles already exist.
drop trigger if exists trg_zzz_seed_settings_infra_permissions on public.organizations;
create trigger trg_zzz_seed_settings_infra_permissions
  after insert on public.organizations
  for each row
  execute function public.seed_settings_infra_permissions_on_org_insert();

-- Backfill every existing org.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_settings_infra_permissions_for_org(v_org_id);
  end loop;
end
$$;

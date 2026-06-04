-- Migration 149: 01-npd Gate-5 reachability fix — grant the full NPD permission set to the
-- org-admin role(s) so the org administrator can actually reach the NPD module.
-- PRD: docs/prd/01-NPD-PRD.md §2.2 (RBAC).
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
--
-- ROOT CAUSE (found at live Gate-5 click-through): migration 080's
-- seed_npd_role_permissions_for_org grants npd.*/fg.*/brief.* to role CODES
-- npd_manager/core_user/admin/etc. But the deployed org administrator is on the role
-- 'org.access.admin' (the canonical org-admin role), which receives NONE of them — so
-- every NPD page returns "You do not have permission…" for the org admin. Same unseeded/
-- mis-targeted-role permission class as gdpr.erasure (116), npd.allergen.write (146),
-- settings.infra (148). This grants the COMPLETE npd/fg/brief permission set (the admin
-- gets everything) to the org-admin role family, in BOTH the normalized role_permissions
-- table and the legacy roles.permissions jsonb cache, for every existing org, with an
-- AFTER INSERT trigger so new orgs inherit it. Idempotent.

create or replace function public.seed_npd_org_admin_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  -- COMPLETE union of permission strings actually checked by NPD pages/actions (both the
  -- canonical locale tree and the non-locale (npd) actions it imports). The page-check
  -- vocabulary diverged from migration 080's seed vocabulary (080 seeds npd.core.write /
  -- npd.dashboard.view / ... while pages check npd.fa.read / npd.compliance / npd.costing /
  -- npd.nutrition / npd.risks / npd.*.write / npd.project.* / npd.brief.* — none seeded).
  -- An org admin gets the full set so the whole NPD module is reachable. The page-vs-seed
  -- vocabulary divergence itself is recorded for a follow-up reconciliation decision.
  v_perms text[] := array[
    'brief.convert_to_fa','brief.convert_to_npd_project','brief.create',
    'fa.create','fa.delete','fa.field_edit','fg.create',
    'npd.allergen.write','npd.bom.export','npd.brief.read','npd.brief.write',
    'npd.closed_flag.unset','npd.commercial.write','npd.compliance','npd.compliance_doc.write',
    'npd.core.write','npd.costing','npd.d365_builder.execute','npd.dashboard','npd.dashboard.view',
    'npd.fa.build','npd.fa.close','npd.fa.create','npd.fa.read',
    'npd.formulation.create_draft','npd.formulation.lock','npd.gate.advance','npd.gate.approve',
    'npd.mrp.write','npd.nutrition','npd.pilot.promote_to_bom','npd.planning.write',
    'npd.procurement.write','npd.production.write','npd.project.create','npd.project.delete',
    'npd.project.view','npd.recipe.submit_for_trial','npd.risk.write','npd.risks',
    'npd.rule.edit','npd.schema.edit','npd.technical.write'
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

revoke all on function public.seed_npd_org_admin_permissions_for_org(uuid) from public;
revoke all on function public.seed_npd_org_admin_permissions_for_org(uuid) from app_user;

create or replace function public.seed_npd_org_admin_permissions_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_npd_org_admin_permissions_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_npd_org_admin_permissions_on_org_insert() from public;
revoke all on function public.seed_npd_org_admin_permissions_on_org_insert() from app_user;

-- Fire after the 080 NPD seed trigger so the admin roles already exist.
drop trigger if exists trg_zzz_seed_npd_org_admin_permissions on public.organizations;
create trigger trg_zzz_seed_npd_org_admin_permissions
  after insert on public.organizations
  for each row
  execute function public.seed_npd_org_admin_permissions_on_org_insert();

-- Backfill every existing org.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_npd_org_admin_permissions_for_org(v_org_id);
  end loop;
end
$$;

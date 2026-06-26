-- Migration 347: grant technical.sensory.write to the org-admin family (sensory create UI).
-- Mirror of 236 (which added technical.sensory.read): the Technical-owned "Record sensory
-- evaluation" write path CHECKs 'technical.sensory.write'; without a GRANT in BOTH the
-- normalized role_permissions table AND the legacy roles.permissions jsonb cache, the org
-- admin (role family below) gets FORBIDDEN on every save while vitest+tsc stay green
-- (same recurring live-bug class as 116/146/148/149/154/230/236). This re-creates the
-- existing seed function with 236's full array PLUS the new write string, re-creates the
-- org-insert trigger, and backfills every existing org. Idempotent. Additive — nothing dropped.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().

create or replace function public.seed_npd_org_admin_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  -- 236's COMPLETE array (verbatim — do NOT drop any) + the Technical sensory WRITE string.
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
    'npd.rule.edit','npd.schema.edit','npd.technical.write',
    'npd.formulation.read',
    'npd.packaging.read','npd.packaging.write',
    'npd.trial.read','npd.trial.write',
    'npd.pilot.read','npd.pilot.write',
    'npd.handoff.read','npd.handoff.promote',
    -- Technical owns sensory; read (236) + write (this migration) live in the technical.* family.
    'technical.sensory.read',
    'technical.sensory.write'
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

revoke all on function public.seed_npd_org_admin_permissions_for_org(uuid) from public;
revoke all on function public.seed_npd_org_admin_permissions_for_org(uuid) from app_user;

-- Backfill every existing org (incl. the live test org) so the write perm lands immediately.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_npd_org_admin_permissions_for_org(v_org_id);
  end loop;
end
$$;

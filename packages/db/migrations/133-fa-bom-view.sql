-- Migration 133: T-045 FA BOM export view.
-- PRD: docs/prd/01-NPD-PRD.md §10.7.
-- Wave0 lock: org_id business scope; RLS flows through security_invoker view + app.current_org_id().
-- Shared public.bom_headers/public.bom_lines remain the BOM SSOT; D365 is export-only badge metadata.

drop view if exists public.fa_bom_view;

create view public.fa_bom_view
  with (security_invoker = true)
as
select
  bom.bom_header_id,
  bom.product_code,
  bom.status,
  bom.version,
  bom.line_no,
  bom.component_type,
  bom.component_code,
  bom.quantity,
  coalesce(nullif(bom.manufacturing_operation_name, ''), '') as process_stage,
  coalesce(nullif(bom.source, ''), '') as source,
  coalesce(nullif(d365.status, ''), 'Empty') as d365_status
from public.fa fa_row
cross join lateral public.get_fa_bom(fa_row.product_code) bom
left join public.d365_import_cache d365
  on d365.org_id = app.current_org_id()
 and d365.code = bom.component_code
where fa_row.org_id = app.current_org_id()
  and fa_row.built = false;

revoke all on public.fa_bom_view from public;
revoke all on public.fa_bom_view from app_user;
grant select on public.fa_bom_view to app_user;

comment on view public.fa_bom_view
  is 'T-045: NPD FA BOM export view over shared BOM SSOT plus D365 status badges. Filters to unbuilt FAs and runs with invoker/RLS org context.';

create or replace function public.seed_npd_role_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  -- Remove legacy un-namespaced NPD permission strings from normalized storage.
  delete from public.role_permissions rp
  using public.roles r
  where r.id = rp.role_id
    and r.org_id = p_org_id
    and rp.permission in (
      'd365_builder.execute',
      'risk.write',
      'core.write',
      'dashboard.view',
      'closed_flag.unset',
      'schema.edit',
      'rule.edit',
      'compliance_doc.write',
      'formulation.create_draft',
      'formulation.lock',
      'recipe.submit_for_trial',
      'pilot.promote_to_bom',
      'fa.delete',
      'dept.write',
      'bom.export'
    );

  -- Keep the legacy JSONB role cache free of strings that would bypass canonical checks.
  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(kept.permission order by kept.permission)
         from (
           select distinct value as permission
           from jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as existing(value)
           where value not in (
             'd365_builder.execute',
             'risk.write',
             'core.write',
             'dashboard.view',
             'closed_flag.unset',
             'schema.edit',
             'rule.edit',
             'compliance_doc.write',
             'formulation.create_draft',
             'formulation.lock',
             'recipe.submit_for_trial',
             'pilot.promote_to_bom',
             'fa.delete',
             'dept.write',
             'bom.export'
           )
         ) kept
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id;

  insert into public.roles (org_id, slug, system, code, name, permissions, is_system, display_order)
  values
    (p_org_id, 'npd_manager', false, 'npd_manager', 'NPD Manager', '[]'::jsonb, true, 100),
    (p_org_id, 'core_user', false, 'core_user', 'Core User', '[]'::jsonb, true, 110),
    (p_org_id, 'dept_manager', false, 'dept_manager', 'Department Manager', '[]'::jsonb, true, 120),
    (p_org_id, 'dept_user', false, 'dept_user', 'Department User', '[]'::jsonb, true, 130),
    (p_org_id, 'admin', false, 'admin', 'Admin', '[]'::jsonb, true, 140),
    (p_org_id, 'viewer', false, 'viewer', 'Viewer', '[]'::jsonb, true, 150)
  on conflict do nothing;

  with role_matrix(permission, role_code) as (
    values
      ('fg.create', 'npd_manager'),
      ('fg.create', 'core_user'),
      ('fg.create', 'admin'),
      ('npd.project.delete', 'npd_manager'),
      ('npd.project.delete', 'admin'),
      ('brief.create', 'npd_manager'),
      ('brief.create', 'core_user'),
      ('brief.create', 'admin'),
      ('brief.convert_to_npd_project', 'npd_manager'),
      ('brief.convert_to_npd_project', 'admin'),
      ('npd.core.write', 'npd_manager'),
      ('npd.core.write', 'core_user'),
      ('npd.core.write', 'admin'),
      ('npd.dashboard.view', 'npd_manager'),
      ('npd.dashboard.view', 'core_user'),
      ('npd.dashboard.view', 'dept_manager'),
      ('npd.dashboard.view', 'dept_user'),
      ('npd.dashboard.view', 'admin'),
      ('npd.dashboard.view', 'viewer'),
      ('npd.bom.export', 'npd_manager'),
      ('npd.bom.export', 'admin'),
      ('npd.d365_builder.execute', 'npd_manager'),
      ('npd.closed_flag.unset', 'npd_manager'),
      ('npd.closed_flag.unset', 'core_user'),
      ('npd.closed_flag.unset', 'dept_manager'),
      ('npd.closed_flag.unset', 'admin'),
      ('npd.schema.edit', 'admin'),
      ('npd.rule.edit', 'admin'),
      ('npd.risk.write', 'npd_manager'),
      ('npd.risk.write', 'admin'),
      ('npd.compliance_doc.write', 'npd_manager'),
      ('npd.compliance_doc.write', 'dept_manager'),
      ('npd.compliance_doc.write', 'admin'),
      ('npd.formulation.create_draft', 'npd_manager'),
      ('npd.formulation.create_draft', 'core_user'),
      ('npd.formulation.create_draft', 'admin'),
      ('npd.formulation.lock', 'npd_manager'),
      ('npd.formulation.lock', 'admin'),
      ('npd.recipe.submit_for_trial', 'npd_manager'),
      ('npd.recipe.submit_for_trial', 'core_user'),
      ('npd.recipe.submit_for_trial', 'admin'),
      ('npd.pilot.promote_to_bom', 'npd_manager'),
      ('npd.pilot.promote_to_bom', 'admin'),
      ('npd.gate.advance', 'npd_manager'),
      ('npd.gate.advance', 'admin'),
      ('npd.gate.approve', 'npd_manager'),
      ('npd.gate.approve', 'admin')
  )
  insert into public.role_permissions (role_id, permission)
  select r.id, rm.permission
  from public.roles r
  join role_matrix rm on rm.role_code = r.code
  where r.org_id = p_org_id
  on conflict (role_id, permission) do nothing;

  with matrix_permissions as (
    select r.id, rm.permission
    from public.roles r
    join (
      values
        ('fg.create', 'npd_manager'),
        ('fg.create', 'core_user'),
        ('fg.create', 'admin'),
        ('npd.project.delete', 'npd_manager'),
        ('npd.project.delete', 'admin'),
        ('brief.create', 'npd_manager'),
        ('brief.create', 'core_user'),
        ('brief.create', 'admin'),
        ('brief.convert_to_npd_project', 'npd_manager'),
        ('brief.convert_to_npd_project', 'admin'),
        ('npd.core.write', 'npd_manager'),
        ('npd.core.write', 'core_user'),
        ('npd.core.write', 'admin'),
        ('npd.dashboard.view', 'npd_manager'),
        ('npd.dashboard.view', 'core_user'),
        ('npd.dashboard.view', 'dept_manager'),
        ('npd.dashboard.view', 'dept_user'),
        ('npd.dashboard.view', 'admin'),
        ('npd.dashboard.view', 'viewer'),
        ('npd.bom.export', 'npd_manager'),
        ('npd.bom.export', 'admin'),
        ('npd.d365_builder.execute', 'npd_manager'),
        ('npd.closed_flag.unset', 'npd_manager'),
        ('npd.closed_flag.unset', 'core_user'),
        ('npd.closed_flag.unset', 'dept_manager'),
        ('npd.closed_flag.unset', 'admin'),
        ('npd.schema.edit', 'admin'),
        ('npd.rule.edit', 'admin'),
        ('npd.risk.write', 'npd_manager'),
        ('npd.risk.write', 'admin'),
        ('npd.compliance_doc.write', 'npd_manager'),
        ('npd.compliance_doc.write', 'dept_manager'),
        ('npd.compliance_doc.write', 'admin'),
        ('npd.formulation.create_draft', 'npd_manager'),
        ('npd.formulation.create_draft', 'core_user'),
        ('npd.formulation.create_draft', 'admin'),
        ('npd.formulation.lock', 'npd_manager'),
        ('npd.formulation.lock', 'admin'),
        ('npd.recipe.submit_for_trial', 'npd_manager'),
        ('npd.recipe.submit_for_trial', 'core_user'),
        ('npd.recipe.submit_for_trial', 'admin'),
        ('npd.pilot.promote_to_bom', 'npd_manager'),
        ('npd.pilot.promote_to_bom', 'admin'),
        ('npd.gate.advance', 'npd_manager'),
        ('npd.gate.advance', 'admin'),
        ('npd.gate.approve', 'npd_manager'),
        ('npd.gate.approve', 'admin')
    ) as rm(permission, role_code) on rm.role_code = r.code
    where r.org_id = p_org_id
  ),
  expanded as (
    select
      r.id,
      coalesce(
        (
          select jsonb_agg(distinct merged.permission order by merged.permission)
          from (
            select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
            union all
            select mp.permission
            from matrix_permissions mp
            where mp.id = r.id
          ) merged
        ),
        '[]'::jsonb
      ) as permissions
    from public.roles r
    where r.org_id = p_org_id
      and r.code in ('npd_manager', 'core_user', 'dept_manager', 'dept_user', 'admin', 'viewer')
  )
  update public.roles r
     set permissions = expanded.permissions
    from expanded
   where r.id = expanded.id;
end;
$$;

revoke all on function public.seed_npd_role_permissions_for_org(uuid) from public;
revoke all on function public.seed_npd_role_permissions_for_org(uuid) from app_user;

do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_npd_role_permissions_for_org(v_org_id);
  end loop;
end
$$;

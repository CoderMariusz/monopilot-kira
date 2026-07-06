-- Migration 444: 08-Production yield-gate override RBAC (NN-PROD-6).
-- Adds production.wo.override_yield to supervisor/admin families only (NOT line operators).
-- Mirrors migration 225's seed_production_permissions_for_org pattern + persona backfill.
-- Wave0 lock: org_id business scope.

create or replace function public.seed_production_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_all_perms text[] := array[
    'production.wo.start',
    'production.wo.pause',
    'production.wo.resume',
    'production.wo.complete',
    'production.wo.cancel',
    'production.wo.override_yield',
    'production.consumption.write',
    'production.consumption.override_approve',
    'production.output.write',
    'production.output.catch_weight_override',
    'production.waste.write',
    'production.waste.overthreshold_approve',
    'production.downtime.write',
    'production.downtime.taxonomy_edit',
    'production.changeover.write',
    'production.allergen_gate.sign_first',
    'production.allergen_gate.sign_second',
    'production.d365_dlq.replay',
    'production.oee.read'
  ];
  v_operator_perms text[] := array[
    'production.wo.start',
    'production.wo.pause',
    'production.wo.resume',
    'production.wo.complete',
    'production.wo.cancel',
    'production.consumption.write',
    'production.output.write',
    'production.waste.write',
    'production.downtime.write',
    'production.changeover.write',
    'production.allergen_gate.sign_first',
    'production.oee.read'
  ];
  v_supervisor_perms text[] := v_all_perms;
  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin'];
  v_operator_roles text[] := array['operator','production_operator','line_operator','warehouse_operator'];
  v_supervisor_roles text[] := array['supervisor','production_supervisor','shift_supervisor','production_lead'];
begin
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_all_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles))
  on conflict (role_id, permission) do nothing;

  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_operator_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_operator_roles) or r.slug = any(v_operator_roles))
  on conflict (role_id, permission) do nothing;

  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_supervisor_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_supervisor_roles) or r.slug = any(v_supervisor_roles))
  on conflict (role_id, permission) do nothing;

  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select unnest(v_all_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles));

  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select unnest(v_operator_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_operator_roles) or r.slug = any(v_operator_roles));

  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select unnest(v_supervisor_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_supervisor_roles) or r.slug = any(v_supervisor_roles));
end;
$$;

revoke all on function public.seed_production_permissions_for_org(uuid) from public;
revoke all on function public.seed_production_permissions_for_org(uuid) from app_user;

do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_production_permissions_for_org(v_org_id);
  end loop;
end
$$;

-- Persona tier (migration 356): yield-gate override is a supervisor approval (R8).
insert into public.role_permissions (role_id, permission)
select r.id, 'production.wo.override_yield'
  from public.roles r
 where r.code in ('prod_manager', 'shift_lead')
    or r.slug in ('prod_manager', 'shift_lead')
on conflict (role_id, permission) do nothing;

update public.roles r
   set permissions = coalesce(
     (
       select jsonb_agg(distinct merged.permission order by merged.permission)
       from (
         select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
         union all
         select 'production.wo.override_yield'
       ) merged
     ),
     '[]'::jsonb
   )
 where r.code in ('prod_manager', 'shift_lead')
    or r.slug in ('prod_manager', 'shift_lead');

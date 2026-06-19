-- Migration 300: Wave R4 reversibility — seed the two CORRECTION RBAC permissions added to
--   packages/rbac/src/permissions.enum.ts (WAREHOUSE_TRANSFER_CORRECT='warehouse.transfer.correct',
--   TECHNICAL_FACTORY_SPEC_RECALL='technical.factory_spec.recall') into the org-admin role family
--   PLUS the supervisor/manager role families, in BOTH the normalized role_permissions table and the
--   legacy roles.permissions jsonb cache, with an AFTER INSERT trigger on organizations + full backfill.
--
-- Separation-of-Duties (owner decision): the `*.correct` correction family is deliberately separate
--   from the everyday operate permissions. A correction REVERSES a posted state (transfer-receive
--   reversal; factory-spec recall), so it must NOT be grantable to the base operator/clerk/scanner
--   roles that performed the original action — only to the org-admin tier and the supervisor/manager
--   tier above the operators. Base operator roles are intentionally excluded here.
--
--   * warehouse.transfer.correct -> reverse an inter-site / transfer-order receive (Wave R4). Granted to
--     the org-admin family + the warehouse/production supervisor-manager family.
--   * technical.factory_spec.recall -> recall an approved/released factory spec (Wave R4). Granted to
--     the org-admin family + the technical lead/manager family.
--
-- Canonical permission strings: packages/rbac/src/permissions.enum.ts (Permission.WAREHOUSE_TRANSFER_CORRECT,
--   Permission.TECHNICAL_FACTORY_SPEC_RECALL). Wave0 lock: org_id business scope (NOT tenant_id);
--   RLS via app.current_org_id(). Functions are security definer with a pinned search_path and revoked
--   from public + app_user, mirroring migration 214 exactly. Idempotent (on conflict do nothing).

create or replace function public.seed_r4_correction_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  -- Wave R4 correction permissions, split by domain so each lands on its own approver tier.
  v_warehouse_correct_perms text[] := array[
    'warehouse.transfer.correct'
  ];
  v_technical_recall_perms text[] := array[
    'technical.factory_spec.recall'
  ];
  -- Both perms, for the org-admin family (the load-bearing Gate-5 reachability grant).
  v_all_correction_perms text[] := array[
    'warehouse.transfer.correct',
    'technical.factory_spec.recall'
  ];
  -- org-admin role family across naming conventions used in this codebase.
  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin'];
  -- Warehouse / production supervisor-manager family (transfer-receive reversal approvers).
  -- Defensive multi-naming; grant is a no-op for any code absent in an org. Base operator/scanner
  -- codes are deliberately NOT included (Separation-of-Duties).
  v_wh_supervisor_roles text[] := array[
    'supervisor','production_supervisor','shift_supervisor','production_lead',
    'warehouse_manager','warehouse_supervisor','warehouse_lead','inventory_manager',
    'logistics_manager','operations_manager','manager'
  ];
  -- Technical lead/manager family (factory-spec recall approvers).
  v_tech_lead_roles text[] := array['technical_manager','technical_lead','quality_lead'];
begin
  -- --- Normalized storage (role_permissions) ---
  -- admin family: both correction perms.
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_all_correction_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles))
  on conflict (role_id, permission) do nothing;

  -- warehouse/production supervisor-manager family: warehouse.transfer.correct.
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_warehouse_correct_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_wh_supervisor_roles) or r.slug = any(v_wh_supervisor_roles))
  on conflict (role_id, permission) do nothing;

  -- technical lead/manager family: technical.factory_spec.recall.
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_technical_recall_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_tech_lead_roles) or r.slug = any(v_tech_lead_roles))
  on conflict (role_id, permission) do nothing;

  -- --- Legacy jsonb cache (roles.permissions) ---
  -- admin family: both correction perms.
  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select unnest(v_all_correction_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles));

  -- warehouse/production supervisor-manager family: warehouse.transfer.correct.
  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select unnest(v_warehouse_correct_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_wh_supervisor_roles) or r.slug = any(v_wh_supervisor_roles));

  -- technical lead/manager family: technical.factory_spec.recall.
  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select unnest(v_technical_recall_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_tech_lead_roles) or r.slug = any(v_tech_lead_roles));
end;
$$;

revoke all on function public.seed_r4_correction_permissions_for_org(uuid) from public;
revoke all on function public.seed_r4_correction_permissions_for_org(uuid) from app_user;

create or replace function public.seed_r4_correction_permissions_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_r4_correction_permissions_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_r4_correction_permissions_on_org_insert() from public;
revoke all on function public.seed_r4_correction_permissions_on_org_insert() from app_user;

-- Fire after the 080 role-seeding trigger so the admin/supervisor roles already exist (zzz sorts last).
drop trigger if exists trg_zzz_seed_r4_correction_permissions on public.organizations;
create trigger trg_zzz_seed_r4_correction_permissions
  after insert on public.organizations
  for each row
  execute function public.seed_r4_correction_permissions_on_org_insert();

-- Backfill every existing org.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_r4_correction_permissions_for_org(v_org_id);
  end loop;
end
$$;

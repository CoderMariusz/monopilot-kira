-- Migration 207: 03-technical Gate-4 corrective — technical.* OPERATOR/lead role completeness.
-- PRD: docs/prd/03-TECHNICAL-PRD.md §3 (RBAC).
-- Canonical permission strings: packages/rbac/src/permissions.enum.ts (ALL_TECHNICAL_PERMISSIONS
-- + the pre-existing technical.product_spec.approve workflow string).
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
--
-- ROOT CAUSE: migration 154 (154-technical-permission-seed.sql) grants the COMPLETE technical.*
-- family to the org-admin role family ONLY (v_admin_roles). The org admin is reachable, but a
-- non-admin TECHNICAL operator / technical-lead role (the day-to-day item-master + BOM authoring
-- + allergen/cost editor) receives NONE of the technical.* strings and 403s on every technical
-- write page. This is the operator-completeness layer (same X-1 unreachable-feature class as
-- 116/146/148/149/154/185), modelled exactly on 154's structure + 185's operator/supervisor seed
-- pattern. The admin grant already exists in 154 — this migration adds ONLY the operator/lead
-- families and never re-touches the admin grant's load-bearing path.
--
-- ROLE-FAMILY MATCHING is defensive across naming conventions (codes vary per org; the grant is
-- a no-op for any role code/slug absent in an org). The codebase's system role seed
-- (packages/rbac/src/role-seed.ts) ships 'quality_lead' carrying technical.product_spec.approve;
-- this migration treats quality_lead as part of the technical LEAD family (it gets the approval
-- subset) and additionally covers the defensive technical/technical_manager/technical_lead codes.
--
-- SUBSETS (Separation of Duties):
--   * OPERATOR (technical / technical_operator): everyday authoring — items create/edit, BOM
--     create, allergen edit, cost edit. NOT deactivate, NOT approve/version_publish, NOT D365
--     trigger, NOT product_spec.approve (those are governance/approval acts → lead-only).
--   * LEAD (technical_manager / technical_lead / quality_lead): the operator subset PLUS the
--     governance/approval strings (items.deactivate, bom.approve, bom.version_publish,
--     bom.generate_batch, d365.sync_trigger, product_spec.approve).
-- Idempotent: ON CONFLICT DO NOTHING on role_permissions; jsonb merge is set-deduplicated/sorted.

create or replace function public.seed_technical_operator_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  -- Operator-facing subset: the day-to-day technical authoring acts (NOT governance/approval).
  v_operator_perms text[] := array[
    'technical.items.create',
    'technical.items.edit',
    'technical.bom.create',
    'technical.allergens.edit',
    'technical.cost.edit'
  ];
  -- Lead subset: the operator subset PLUS the approval/governance strings. Equals the full
  -- technical.* family seeded to admins by 154.
  v_lead_perms text[] := array[
    'technical.items.create',
    'technical.items.edit',
    'technical.items.deactivate',
    'technical.bom.create',
    'technical.bom.approve',
    'technical.bom.version_publish',
    'technical.bom.generate_batch',
    'technical.allergens.edit',
    'technical.cost.edit',
    'technical.d365.sync_trigger',
    'technical.product_spec.approve'
  ];
  -- technical operator role family (defensive — codes vary; grant is a no-op if absent).
  v_operator_roles text[] := array['technical','technical_operator'];
  -- technical lead/manager role family (defensive). quality_lead already approves product specs
  -- (role-seed.ts) so it belongs to the lead family for the full governance subset.
  v_lead_roles text[] := array['technical_manager','technical_lead','quality_lead'];
begin
  -- --- Normalized storage (role_permissions) ---
  -- operator family: operator subset.
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_operator_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_operator_roles) or r.slug = any(v_operator_roles))
  on conflict (role_id, permission) do nothing;

  -- lead family: lead subset (= full technical.* family).
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_lead_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_lead_roles) or r.slug = any(v_lead_roles))
  on conflict (role_id, permission) do nothing;

  -- --- Legacy jsonb cache (roles.permissions) ---
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
           select unnest(v_lead_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_lead_roles) or r.slug = any(v_lead_roles));
end;
$$;

revoke all on function public.seed_technical_operator_permissions_for_org(uuid) from public;
revoke all on function public.seed_technical_operator_permissions_for_org(uuid) from app_user;

create or replace function public.seed_technical_operator_permissions_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_technical_operator_permissions_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_technical_operator_permissions_on_org_insert() from public;
revoke all on function public.seed_technical_operator_permissions_on_org_insert() from app_user;

-- Fire after the 080 role-seeding trigger so the operator/lead roles already exist (zzz prefix).
drop trigger if exists trg_zzz_seed_technical_operator_permissions on public.organizations;
create trigger trg_zzz_seed_technical_operator_permissions
  after insert on public.organizations
  for each row
  execute function public.seed_technical_operator_permissions_on_org_insert();

-- Backfill every existing org.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_technical_operator_permissions_for_org(v_org_id);
  end loop;
end
$$;

comment on function public.seed_technical_operator_permissions_for_org(uuid) is
  'Migration 207: grants the technical.* operator subset to the technical operator role family and the full technical.* family to the technical lead family (technical_manager/technical_lead/quality_lead), in both role_permissions and the legacy roles.permissions jsonb. Operator-completeness layer for 154 (which seeds the org-admin family only). Idempotent.';

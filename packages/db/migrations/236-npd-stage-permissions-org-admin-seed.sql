-- Migration 236: 01-npd Fala-3 stage permissions — extend the org-admin NPD grant seed.
-- PRD: docs/prd/01-NPD-PRD.md §2.2 (RBAC). Wave3a BE-2.
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
--
-- WHY THIS EXISTS (mirror of 149 — the documented remedy for the recurring "no
-- permission" live-bug): adding a permission string to permissions.enum.ts does NOT
-- grant it. Every NPD page/action in Fala-3 (formulation/packaging/trial/pilot/
-- handoff + the Technical-owned sensory read) CHECKs a permission string; if the
-- org-admin role family is not GRANTed those exact strings — in BOTH the normalized
-- role_permissions table AND the legacy roles.permissions jsonb cache — the deployed
-- org admin (role `org.access.admin`, NOT `admin`) gets a 403 on every Fala-3 page at
-- live Gate-5, while vitest+tsc stay green. Same class as 116/146/148/149/154/230.
--
-- This `create or replace`s the existing public.seed_npd_org_admin_permissions_for_org
-- function (introduced in 149) with the SAME full perm array PLUS the new Fala-3 stage
-- strings. The 149 array is preserved verbatim — NOTHING is dropped, only added:
--   * npd.formulation.read   (fixes the live Gate-5 formulation gap)
--   * npd.packaging.read / npd.packaging.write
--   * npd.trial.read / npd.trial.write
--   * npd.pilot.read / npd.pilot.write
--   * npd.handoff.read / npd.handoff.promote
--   * technical.sensory.read (Technical owns sensory — the read perm is in the
--     technical.* family, NOT npd.sensory; verified by grep: no prior sensory perm
--     string existed — the sensory page gated on "any technical.* perm". This adds an
--     explicit dedicated read string the org-admin family receives. CROSS-MODULE NOTE
--     for Codex: an NPD-driven seed migration grants a technical.* string because the
--     org admin gets the full union; the canonical owner of the string is 03-Technical.)
--
-- Keeps the same admin-role-family array, the BOTH-stores writes, re-creates the
-- AFTER INSERT trigger, and re-runs the existing-org backfill. Idempotent.

create or replace function public.seed_npd_org_admin_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  -- 149's COMPLETE array (verbatim — do NOT drop any) + Fala-3 stage strings.
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
    -- NEW (Fala-3 stage permissions). npd.formulation.read fixes the live Gate-5 gap.
    'npd.formulation.read',
    'npd.packaging.read','npd.packaging.write',
    'npd.trial.read','npd.trial.write',
    'npd.pilot.read','npd.pilot.write',
    'npd.handoff.read','npd.handoff.promote',
    -- Technical owns sensory; the read perm lives in the technical.* family.
    'technical.sensory.read'
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

-- Re-create the org-insert trigger fn + trigger (idempotent; mirrors 149).
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

-- Backfill every existing org so already-provisioned tenants (incl. the live test org)
-- receive the Fala-3 stage perms immediately.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_npd_org_admin_permissions_for_org(v_org_id);
  end loop;
end
$$;

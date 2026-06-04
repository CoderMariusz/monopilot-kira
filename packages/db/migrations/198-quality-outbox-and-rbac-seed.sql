-- Migration 198: 09-Quality — (A) admit the quality.hold.* / quality.ncr.* outbox events to the
--   outbox_events CHECK constraint (keep the enum<->CHECK drift gate green), and (B) grant the
--   quality.* RBAC permission family to the org-admin role family + QA/lab operator roles in BOTH
--   the normalized role_permissions table and the legacy roles.permissions jsonb cache, with an
--   AFTER INSERT trigger + full backfill.
-- PRD: docs/prd/09-QUALITY-PRD.md §2.3 (RBAC matrix), §6.3 (NCR/HACCP), §12.1 (events).
-- Tasks: T-065 (permission enum) + T-066 (RBAC-seed P0, recurring-live-bug class 1).
-- Canonical permission strings: packages/rbac/src/permissions.enum.ts (ALL_QUALITY_PERMISSIONS).
-- Canonical event strings: packages/outbox/src/events.enum.ts (ALL_QUALITY_EVENTS / DB_EVENT_TYPES).
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().

-- ===========================================================================
-- (A) Outbox event CHECK — drop + recreate with the FULL vocabulary (192's list + the 8 new
--     09-quality events). The enum<->CHECK drift gate (packages/outbox check-drift.test.ts)
--     asserts THIS (now highest-numbered) migration's CHECK string set === DB_EVENT_TYPES, so the
--     list below MUST stay byte-aligned with events.enum.ts (EventType ∪ LegacyEventAlias keys).
--     Strict superset of 192 — no event dropped.
-- ===========================================================================
alter table public.outbox_events
  drop constraint if exists outbox_events_event_type_check;

alter table public.outbox_events
  add constraint outbox_events_event_type_check check (
    event_type in (
      'audit.recorded',
      'bom.initial_version_created',
      'bom.version_submitted',
      'brief.completed_for_project',
      'brief.converted',
      'brief.created',
      'catch_weight.variance_exceeded',
      'compliance_doc.deleted',
      'compliance_doc.expired',
      'compliance_doc.expiring',
      'compliance_doc.uploaded',
      'd365.cache.refreshed',
      'fa.allergens_changed',
      'fa.built',
      'fa.built_reset',
      'fa.cascade',
      'fa.core_closed',
      'fa.created',
      'fa.deleted',
      'fa.dept_closed',
      'fa.dept_reopened',
      'fa.edit',
      'fa.intermediate_code_changed',
      'fa.recipe_changed',
      'fa.template_applied',
      'fg.allergens_changed',
      'fg.bom.released',
      'fg.created',
      'fg.edit',
      'fg.intermediate_code_changed',
      'fg.release_blocked',
      'fg.released_to_factory',
      'formulation.locked',
      'formulation.submitted_for_trial',
      'lp.received',
      'manufacturing_operations.created',
      'manufacturing_operations.deactivated',
      'manufacturing_operations.reset_to_seed',
      'manufacturing_operations.updated',
      'npd.allergens.bulk_rebuild_completed',
      'npd.builder.released_records_created',
      'npd.fg_candidate_mapped',
      'npd.gate.advanced',
      'npd.gate.approved',
      'npd.gate.reverted',
      'npd.project.brief_mapped',
      'npd.project.created',
      'npd.project.legacy_stages_closed',
      'npd.project.release_requested',
      'onboarding.first_wo_recorded',
      'onboarding.step.advance',
      'onboarding.step.back',
      'onboarding.step.jump',
      'onboarding.step.restart',
      'onboarding.step.skip',
      'org.created',
      'org.mfa_enrollment.forced',
      'org.security_policy.updated',
      'production.allergen_changeover.validated',
      'production.changeover.signed',
      'production.consume.blocked',
      'production.consume.completed',
      'production.downtime.recorded',
      'production.oee.snapshot',
      'production.output.recorded',
      'production.waste.recorded',
      'production.wo.closed',
      'production.wo.completed',
      'production.wo.started',
      'quality.atp_swab_failed',
      'quality.hold.created',
      'quality.hold.released',
      'quality.ncr.assigned',
      'quality.ncr.closed',
      'quality.ncr.critical_dual_signed',
      'quality.ncr.opened',
      'quality.ncr.submitted',
      'quality.ncr.updated',
      'quality.recorded',
      'reference.allergens_added_by_process.bulk_changed',
      'reference.allergens_by_rm.bulk_changed',
      'reference.csv.committed',
      'reference.row.soft_deleted',
      'reference.row.upserted',
      'risk.created',
      'role.assigned',
      'rule.deployed',
      'settings.core_flag.updated',
      'settings.d365_sync.updated',
      'settings.dept_override.updated',
      'settings.ip_allowlist.changed',
      'settings.line.upserted',
      'settings.location.deleted',
      'settings.location.imported',
      'settings.location.upserted',
      'settings.machine.upserted',
      'settings.module.disabled',
      'settings.module.enabled',
      'settings.module.toggled',
      'settings.notification_channel_updated',
      'settings.notification_digest_updated',
      'settings.notification_rule_updated',
      'settings.org.created',
      'settings.org.updated',
      'settings.reference.row_updated',
      'settings.role.assigned',
      'settings.rule.deployed',
      'settings.rule_variant.updated',
      'settings.schema.migration_requested',
      'settings.scim.token_created',
      'settings.sso.config_changed',
      'settings.upgrade.completed',
      'settings.upgrade.promoted',
      'settings.upgrade.rolled_back',
      'settings.upgrade.scheduled',
      'settings.user.accepted',
      'settings.user.deactivated',
      'settings.user.invitation_resent',
      'settings.user.invited',
      'settings.warehouse.deactivated',
      'shipment.created',
      'technical.factory_spec.approved',
      'tenant.cohort.advanced',
      'tenant.migration.run',
      'tenant.migration.run.failed',
      'unit_of_measure.conversion_created',
      'unit_of_measure.created',
      'unit_of_measure.soft_deleted',
      'user.invited',
      'warehouse.lp.received',
      'warehouse.lp.shipped',
      'warehouse.lp.transitioned',
      'warehouse.material.consumed',
      'wo.ready'
    )
  );

comment on constraint outbox_events_event_type_check on public.outbox_events
  is 'Regenerated from events.enum.ts DB_EVENT_TYPES (134 types incl quality.hold.* / quality.ncr.*).';

-- ===========================================================================
-- (B) quality.* RBAC permission seed.
--   ROOT CAUSE (X-1 unreachable-feature / 403-everywhere class — same as 116/146/148/149/154/185/192):
--   adding the quality.* strings to the enum (T-065) grants NOBODY access. The deployed
--   org administrator is on the canonical org-admin role family, which receives NONE of the
--   quality.* strings — so every quality page/action 403s at live Gate-5.
--
--   This grants:
--     * the COMPLETE quality.* set (13 strings) to the org-admin role family;
--     * the QA-operator-facing subset to a QA inspector / lab role family;
--     * the QA-lead/approver subset (= full set) to a quality lead / hygiene lead role family;
--   in BOTH role_permissions (normalized) and roles.permissions (legacy jsonb cache), for every
--   existing org, with an AFTER INSERT trigger so new orgs inherit it.
--   QA role codes are matched defensively across naming conventions; the grant is a no-op for any
--   role code not present in an org (idempotent). The admin-family grant is the load-bearing one
--   for Gate-5 reachability. Models on 149/154/185/192.
-- ===========================================================================
create or replace function public.seed_quality_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  -- Complete quality.* family (PRD §2.3 RBAC matrix). Mirrors ALL_QUALITY_PERMISSIONS.
  v_all_perms text[] := array[
    'quality.hold.create',
    'quality.hold.release',
    'quality.spec.approve',
    'quality.inspection.execute',
    'quality.inspection.assign',
    'quality.ncr.create',
    'quality.ncr.close_critical',
    'quality.ccp.deviation_override',
    'quality.haccp.plan_edit',
    'quality.batch.release',
    'quality.dashboard.view',
    'quality.settings.edit',
    'quality.audit.export'
  ];
  -- QA inspector / lab operator subset: creates holds, executes inspections, raises NCRs, views the
  -- dashboard. NOT the elevated/approval strings (hold.release, spec.approve, ncr.close_critical,
  -- ccp.deviation_override, haccp.plan_edit, batch.release, settings.edit, audit.export — SoD).
  v_inspector_perms text[] := array[
    'quality.hold.create',
    'quality.inspection.execute',
    'quality.ncr.create',
    'quality.dashboard.view'
  ];
  -- QA lead / hygiene lead subset: the approver. Full set (release/approve/close-critical/override/
  -- haccp-edit/batch-release/settings/audit-export are quality-lead grants).
  v_lead_perms text[] := v_all_perms;
  -- org-admin role family across naming conventions used in this codebase.
  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin'];
  -- QA inspector / lab role family (defensive — codes vary; grant is a no-op if absent).
  v_inspector_roles text[] := array['qa_inspector','quality_inspector','inspector','lab_technician','lab_analyst'];
  -- QA lead / hygiene lead role family (defensive).
  v_lead_roles text[] := array['quality_lead','qa_lead','quality_manager','hygiene_lead','qa_manager'];
begin
  -- --- Normalized storage (role_permissions) ---
  -- admin family: full set.
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_all_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles))
  on conflict (role_id, permission) do nothing;

  -- inspector family: inspector subset.
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_inspector_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_inspector_roles) or r.slug = any(v_inspector_roles))
  on conflict (role_id, permission) do nothing;

  -- lead family: lead subset (= full set).
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
           select unnest(v_inspector_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_inspector_roles) or r.slug = any(v_inspector_roles));

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

revoke all on function public.seed_quality_permissions_for_org(uuid) from public;
revoke all on function public.seed_quality_permissions_for_org(uuid) from app_user;

create or replace function public.seed_quality_permissions_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_quality_permissions_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_quality_permissions_on_org_insert() from public;
revoke all on function public.seed_quality_permissions_on_org_insert() from app_user;

-- Fire after the 080 role-seeding trigger so the admin roles already exist (zzz prefix sorts last).
drop trigger if exists trg_zzz_seed_quality_permissions on public.organizations;
create trigger trg_zzz_seed_quality_permissions
  after insert on public.organizations
  for each row
  execute function public.seed_quality_permissions_on_org_insert();

-- Backfill every existing org.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_quality_permissions_for_org(v_org_id);
  end loop;
end
$$;

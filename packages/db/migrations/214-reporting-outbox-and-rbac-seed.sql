-- Migration 214: 12-Reporting — (A) admit the reporting.* telemetry events to the outbox_events CHECK
--   constraint (keep the enum<->CHECK drift gate green), and (B) grant the rpt.* RBAC permission family
--   to the org-admin role family + reporting operator/manager/viewer roles in BOTH the normalized
--   role_permissions table and the legacy roles.permissions jsonb cache, with an AFTER INSERT trigger +
--   full backfill.
-- PRD: docs/prd/12-REPORTING-PRD.md §3 (RBAC matrix), §11 (V-RPT-ACCESS-*), §12 (read-only consumer;
--   reporting.* are telemetry, not fact events), §13.2 (refresh/export telemetry).
-- Tasks: T-001 (permission enum) + T-028 (RBAC-seed P0, X-1 unreachable-feature class).
-- Canonical permission strings: packages/rbac/src/permissions.enum.ts (ALL_REPORTING_CORE_PERMISSIONS).
-- Canonical event strings: packages/outbox/src/events.enum.ts (ALL_REPORTING_EVENTS / DB_EVENT_TYPES).
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().

-- ===========================================================================
-- (A) Outbox event CHECK — drop + recreate with the FULL vocabulary (198's list + the 4 new
--     reporting.* telemetry events). The enum<->CHECK drift gate (packages/outbox check-drift.test.ts)
--     asserts THIS (now highest-numbered) migration's CHECK string set === DB_EVENT_TYPES, so the list
--     below MUST stay byte-aligned with events.enum.ts (EventType ∪ LegacyEventAlias keys). Strict
--     superset of 198 — no event dropped. Includes the existing warehouse.* + quality.* events.
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
      'reporting.export.completed',
      'reporting.export.failed',
      'reporting.mv.refresh_completed',
      'reporting.schedule.run_completed',
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
  is 'Regenerated from events.enum.ts DB_EVENT_TYPES (138 types incl reporting.* telemetry).';

-- ===========================================================================
-- (B) rpt.* RBAC permission seed.
--   ROOT CAUSE (X-1 unreachable-feature / 403-everywhere class — same as 116/146/148/149/154/185/192/
--   198): adding the rpt.* strings to the enum (T-001) grants NOBODY access. The deployed org
--   administrator is on the canonical org-admin role family, which receives NONE of the rpt.* strings —
--   so every reporting page/action 403s at live Gate-5.
--
--   This grants (PRD §3 least-privilege matrix):
--     * the COMPLETE rpt.* set (14 strings) to the org-admin role family;
--     * the reporting-VIEWER subset (dashboard view only) to a viewer role family;
--     * the reporting-OPERATOR subset (view + csv/pdf export + preset save/share/delete) to an
--       operator role family;
--     * the reporting-MANAGER subset (operator subset + integration/rules read + schedule + mv.refresh
--       + settings.read) to a manager role family;
--   in BOTH role_permissions (normalized) and roles.permissions (legacy jsonb cache), for every existing
--   org, with an AFTER INSERT trigger so new orgs inherit it. Reporting role codes are matched
--   defensively across naming conventions; the grant is a no-op for any role code not present in an org
--   (idempotent). The admin-family grant is the load-bearing one for Gate-5 reachability. Models on
--   149/154/185/192/198.
-- ===========================================================================
create or replace function public.seed_reporting_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  -- Complete rpt.* family (PRD §3 RBAC matrix). Mirrors ALL_REPORTING_CORE_PERMISSIONS.
  v_all_perms text[] := array[
    'rpt.dashboard.view',
    'rpt.export.csv',
    'rpt.export.pdf',
    'rpt.preset.save',
    'rpt.preset.share',
    'rpt.preset.delete',
    'rpt.schedule.create',
    'rpt.schedule.run_now',
    'rpt.schedule.delete',
    'rpt.settings.read',
    'rpt.settings.edit',
    'rpt.mv.refresh',
    'rpt.integration.read',
    'rpt.rules_usage.read'
  ];
  -- Reporting VIEWER: base dashboard read only (no export, no preset, no admin).
  v_viewer_perms text[] := array[
    'rpt.dashboard.view'
  ];
  -- Reporting OPERATOR: view + export + own-preset management. NOT schedule/settings/integration/refresh.
  v_operator_perms text[] := array[
    'rpt.dashboard.view',
    'rpt.export.csv',
    'rpt.export.pdf',
    'rpt.preset.save',
    'rpt.preset.share',
    'rpt.preset.delete'
  ];
  -- Reporting MANAGER: operator subset + scheduling + admin reads + mv.refresh + settings.read.
  -- (settings.edit + schedule.delete remain admin-only per least-privilege.)
  v_manager_perms text[] := array[
    'rpt.dashboard.view',
    'rpt.export.csv',
    'rpt.export.pdf',
    'rpt.preset.save',
    'rpt.preset.share',
    'rpt.preset.delete',
    'rpt.schedule.create',
    'rpt.schedule.run_now',
    'rpt.settings.read',
    'rpt.mv.refresh',
    'rpt.integration.read',
    'rpt.rules_usage.read'
  ];
  -- org-admin role family across naming conventions used in this codebase.
  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin'];
  -- Reporting viewer/operator/manager role families (defensive — codes vary; no-op if absent).
  v_viewer_roles text[]   := array['reporting_viewer','report_viewer','rpt_viewer','analyst_viewer'];
  v_operator_roles text[] := array['reporting_operator','report_operator','rpt_operator','analyst'];
  v_manager_roles text[]  := array['reporting_manager','report_manager','rpt_manager','operations_manager'];
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

  -- viewer family.
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_viewer_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_viewer_roles) or r.slug = any(v_viewer_roles))
  on conflict (role_id, permission) do nothing;

  -- operator family.
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_operator_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_operator_roles) or r.slug = any(v_operator_roles))
  on conflict (role_id, permission) do nothing;

  -- manager family.
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_manager_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_manager_roles) or r.slug = any(v_manager_roles))
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
           select unnest(v_viewer_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_viewer_roles) or r.slug = any(v_viewer_roles));

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
           select unnest(v_manager_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_manager_roles) or r.slug = any(v_manager_roles));
end;
$$;

revoke all on function public.seed_reporting_permissions_for_org(uuid) from public;
revoke all on function public.seed_reporting_permissions_for_org(uuid) from app_user;

create or replace function public.seed_reporting_permissions_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_reporting_permissions_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_reporting_permissions_on_org_insert() from public;
revoke all on function public.seed_reporting_permissions_on_org_insert() from app_user;

-- Fire after the 080 role-seeding trigger so the admin roles already exist (zzz prefix sorts last).
drop trigger if exists trg_zzz_seed_reporting_permissions on public.organizations;
create trigger trg_zzz_seed_reporting_permissions
  after insert on public.organizations
  for each row
  execute function public.seed_reporting_permissions_on_org_insert();

-- Backfill every existing org.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_reporting_permissions_for_org(v_org_id);
  end loop;
end
$$;

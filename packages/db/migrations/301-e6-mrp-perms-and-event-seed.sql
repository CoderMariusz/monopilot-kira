-- Migration 301: Wave E6 MRP — (A) admit the new planning.mrp.completed outbox event to the
--   outbox_events_event_type_check constraint (keep the enum<->CHECK drift gate green), and (B) grant
--   the three new planning RBAC permissions added to packages/rbac/src/permissions.enum.ts
--   (PLANNING_MRP_RUN='planning.mrp.run', PLANNING_MRP_CONVERT='planning.mrp.convert',
--   PLANNING_FORECAST_MANAGE='planning.forecast.manage') to the org-admin role family + the
--   planner/planning-manager role families, in BOTH the normalized role_permissions table and the legacy
--   roles.permissions jsonb cache, with an AFTER INSERT trigger on organizations + full backfill.
--
-- Canonical event strings: packages/outbox/src/events.enum.ts (EventType.PLANNING_MRP_COMPLETED /
--   DB_EVENT_TYPES). Canonical permission strings: packages/rbac/src/permissions.enum.ts.
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id(). Functions are
--   security definer with a pinned search_path, revoked from public + app_user, mirroring migration 214.
--
-- ===========================================================================
-- (A) Outbox event CHECK — drop + recreate with the FULL current vocabulary. This is the
--     HIGHEST-numbered migration, so the enum<->CHECK drift gate (packages/outbox check-drift.test.ts)
--     asserts THIS migration's CHECK string set === DB_EVENT_TYPES (EventType values ∪ LegacyEventAlias
--     keys). The list below was derived directly from events.enum.ts DB_EVENT_TYPES (180 types =
--     migration 247's 179 + planning.mrp.completed) and MUST stay byte-aligned with it. Strict superset
--     of 247 — no event dropped.
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
      'finance.consumption.valued',
      'finance.cost_per_kg.changed',
      'finance.standard_cost.approved',
      'finance.valuation.closed_monthly',
      'finance.variance.computed',
      'formulation.locked',
      'formulation.submitted_for_trial',
      'lp.received',
      'maintenance.calibration.completed',
      'maintenance.calibration.failed',
      'maintenance.loto.applied',
      'maintenance.loto.released',
      'maintenance.mwo.completed',
      'maintenance.mwo.created',
      'maintenance.pm.due',
      'maintenance.sanitation.allergen_change.completed',
      'manufacturing_operations.created',
      'manufacturing_operations.deactivated',
      'manufacturing_operations.reset_to_seed',
      'manufacturing_operations.updated',
      'matrix.version.published',
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
      'oee.alert.threshold_breached',
      'oee.anomaly.detected',
      'oee.dsl_rule.updated',
      'oee.shift.aggregated',
      'oee.snapshot.refreshed',
      'onboarding.first_wo_recorded',
      'onboarding.step.advance',
      'onboarding.step.back',
      'onboarding.step.jump',
      'onboarding.step.restart',
      'onboarding.step.skip',
      'org.created',
      'org.mfa_enrollment.forced',
      'org.security_policy.updated',
      'planning.mrp.completed',
      'planning.schedule.published',
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
      'scheduler.assignment.approved',
      'scheduler.assignment.bulk_approved',
      'scheduler.assignment.overridden',
      'scheduler.assignment.rejected',
      'scheduler.run.completed',
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
      'settings.warehouse.storage_rules_updated',
      'shipment.created',
      'shipping.bol.issued',
      'shipping.pick.completed',
      'shipping.pick.released',
      'shipping.shipment.confirmed',
      'shipping.shipment.packed',
      'shipping.so.cancelled',
      'shipping.so.confirmed',
      'shipping.so.released',
      'spare.reorder_threshold_breached',
      'technical.factory_spec.approved',
      'tenant.cohort.advanced',
      'tenant.migration.run',
      'tenant.migration.run.failed',
      'transfer_order.in_transit',
      'transfer_order.received',
      'transfer_order.shipped',
      'transport_lane.created',
      'transport_lane_rate_card.activated',
      'unit_of_measure.conversion_created',
      'unit_of_measure.created',
      'unit_of_measure.soft_deleted',
      'user.invited',
      'warehouse.grn.received',
      'warehouse.lp.received',
      'warehouse.lp.shipped',
      'warehouse.lp.transitioned',
      'warehouse.material.consumed',
      'wo.ready'
    )
  );

comment on constraint outbox_events_event_type_check on public.outbox_events
  is 'Regenerated from events.enum.ts DB_EVENT_TYPES (180 types; adds planning.mrp.completed, Wave E6 MRP).';

-- ===========================================================================
-- (B) planning.* MRP RBAC permission seed.
--   ROOT CAUSE (X-1 unreachable-feature / 403 class — same as 185/192/198/214): adding the planning.*
--   strings to the enum grants NOBODY access. This grants the three new MRP permissions to the org-admin
--   role family (load-bearing Gate-5 reachability) PLUS the planner / planning-manager role families, in
--   BOTH role_permissions (normalized) and roles.permissions (legacy jsonb). Planning role codes are
--   matched defensively across naming conventions; the grant is a no-op for any role code absent in an
--   org (idempotent). Models on 214.
-- ===========================================================================
create or replace function public.seed_e6_mrp_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  -- Wave E6 MRP permission family (mirrors the new planning.* strings in permissions.enum.ts).
  v_mrp_perms text[] := array[
    'planning.mrp.run',
    'planning.mrp.convert',
    'planning.forecast.manage'
  ];
  -- org-admin role family across naming conventions used in this codebase.
  v_admin_roles text[] := array['org.access.admin','org.platform.admin','owner','admin','org_admin'];
  -- planner / planning-manager role family (defensive — codes vary; no-op if absent).
  v_planner_roles text[] := array[
    'planner','planning_manager','planning-manager','planning',
    'production_planner','master_planner','manager','operations_manager'
  ];
begin
  -- --- Normalized storage (role_permissions) ---
  -- admin family: full MRP set.
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_mrp_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_admin_roles) or r.slug = any(v_admin_roles))
  on conflict (role_id, permission) do nothing;

  -- planner / planning-manager family: full MRP set.
  insert into public.role_permissions (role_id, permission)
  select r.id, p.permission
  from public.roles r
  cross join unnest(v_mrp_perms) as p(permission)
  where r.org_id = p_org_id
    and (r.code = any(v_planner_roles) or r.slug = any(v_planner_roles))
  on conflict (role_id, permission) do nothing;

  -- --- Legacy jsonb cache (roles.permissions) ---
  update public.roles r
     set permissions = coalesce(
       (
         select jsonb_agg(distinct merged.permission order by merged.permission)
         from (
           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           union all
           select unnest(v_mrp_perms)
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
           select unnest(v_mrp_perms)
         ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_planner_roles) or r.slug = any(v_planner_roles));
end;
$$;

revoke all on function public.seed_e6_mrp_permissions_for_org(uuid) from public;
revoke all on function public.seed_e6_mrp_permissions_for_org(uuid) from app_user;

create or replace function public.seed_e6_mrp_permissions_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_e6_mrp_permissions_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_e6_mrp_permissions_on_org_insert() from public;
revoke all on function public.seed_e6_mrp_permissions_on_org_insert() from app_user;

-- Fire after the 080 role-seeding trigger so the admin/planner roles already exist (zzz sorts last).
drop trigger if exists trg_zzz_seed_e6_mrp_permissions on public.organizations;
create trigger trg_zzz_seed_e6_mrp_permissions
  after insert on public.organizations
  for each row
  execute function public.seed_e6_mrp_permissions_on_org_insert();

-- Backfill every existing org.
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_e6_mrp_permissions_for_org(v_org_id);
  end loop;
end
$$;

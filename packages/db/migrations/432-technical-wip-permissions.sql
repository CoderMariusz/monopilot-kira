-- Migration 432 — WIP library RBAC + outbox event admission (W3 L8).
-- Idempotent grants to both role_permissions and roles.permissions, with org-insert trigger + backfill.

create or replace function public.seed_technical_wip_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  -- Mirrors mig 207's SoD split: operators author/edit, only lead + org-admin
  -- families hold the deactivate (archive governance) act. No bare 'operator'/'lead'.
  v_operator_perms text[] := array['technical.wip.create', 'technical.wip.edit'];
  v_governance_perms text[] := array['technical.wip.create', 'technical.wip.edit', 'technical.wip.deactivate'];
  v_operator_roles text[] := array['technical','technical_operator'];
  v_governance_roles text[] := array[
    'technical_manager','technical_lead','quality_lead',
    'org.access.admin','org.platform.admin','owner','admin','org_admin'
  ];
begin
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
    cross join unnest(v_governance_perms) as p(permission)
   where r.org_id = p_org_id
     and (r.code = any(v_governance_roles) or r.slug = any(v_governance_roles))
  on conflict (role_id, permission) do nothing;

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
             select unnest(v_governance_perms)
           ) merged
       ),
       '[]'::jsonb
     )
   where r.org_id = p_org_id
     and (r.code = any(v_governance_roles) or r.slug = any(v_governance_roles));
end;
$$;

revoke all on function public.seed_technical_wip_permissions_for_org(uuid) from public;
revoke all on function public.seed_technical_wip_permissions_for_org(uuid) from app_user;

create or replace function public.seed_technical_wip_permissions_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_technical_wip_permissions_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_technical_wip_permissions_on_org_insert() from public;
revoke all on function public.seed_technical_wip_permissions_on_org_insert() from app_user;

drop trigger if exists trg_zzz_seed_technical_wip_permissions on public.organizations;
create trigger trg_zzz_seed_technical_wip_permissions
  after insert on public.organizations
  for each row
  execute function public.seed_technical_wip_permissions_on_org_insert();

do $$
declare
  v_org_id uuid;
begin
  for v_org_id in select id from public.organizations loop
    perform public.seed_technical_wip_permissions_for_org(v_org_id);
  end loop;
end
$$;

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
      'fa.built',
      'fa.built_reset',
      'fa.cascade',
      'fa.core_closed',
      'fa.deleted',
      'fa.dept_closed',
      'fa.dept_reopened',
      'fa.recipe_changed',
      'fa.template_applied',
      'finance.consumption.valued',
      'finance.cost_per_kg.changed',
      'finance.standard_cost.approved',
      'finance.valuation.closed_monthly',
      'finance.variance.computed',
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
      'quality.atp_swab_failed',
      'quality.hold.created',
      'quality.hold.released',
      'quality.ncr.opened',
      'quality.ncr.submitted',
      'quality.ncr.assigned',
      'quality.ncr.updated',
      'quality.ncr.closed',
      'quality.ncr.critical_dual_signed',
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
      'scheduler.run.completed',
      'scheduler.assignment.approved',
      'scheduler.assignment.overridden',
      'scheduler.assignment.rejected',
      'scheduler.assignment.bulk_approved',
      'matrix.version.published',
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
      'settings.rule_variant.updated',
      'settings.rule.deployed',
      'settings.schema.migration_requested',
      'settings.scim.token_created',
      'settings.sso.config_changed',
      'settings.upgrade.completed',
      'settings.upgrade.promoted',
      'settings.upgrade.rolled_back',
      'settings.upgrade.scheduled',
      'settings.user.accepted',
      'settings.user.created_with_password',
      'settings.user.deactivated',
      'settings.user.invitation_resent',
      'settings.user.invited',
      'settings.user.reactivated',
      'settings.warehouse.deactivated',
      'settings.warehouse.storage_rules_updated',
      'shipment.created',
      'shipping.so.released',
      'shipping.so.confirmed',
      'shipping.so.cancelled',
      'shipping.pick.released',
      'shipping.pick.completed',
      'shipping.shipment.packed',
      'shipping.shipment.confirmed',
      'shipping.bol.issued',
      'technical.factory_spec.approved',
      'wip.definition.updated',
      'tenant.cohort.advanced',
      'tenant.migration.run',
      'tenant.migration.run.failed',
      'unit_of_measure.conversion_created',
      'unit_of_measure.created',
      'unit_of_measure.soft_deleted',
      'user.invited',
      'transfer_order.shipped',
      'transfer_order.in_transit',
      'transfer_order.received',
      'transport_lane.created',
      'transport_lane_rate_card.activated',
      'warehouse.grn.received',
      'warehouse.lp.received',
      'warehouse.lp.transitioned',
      'warehouse.material.consumed',
      'warehouse.lp.shipped',
      'maintenance.pm.due',
      'maintenance.mwo.created',
      'maintenance.mwo.completed',
      'maintenance.loto.applied',
      'maintenance.loto.released',
      'maintenance.calibration.completed',
      'maintenance.calibration.failed',
      'maintenance.sanitation.allergen_change.completed',
      'spare.reorder_threshold_breached',
      'oee.snapshot.refreshed',
      'oee.dsl_rule.updated',
      'oee.shift.aggregated',
      'oee.alert.threshold_breached',
      'oee.anomaly.detected',
      'wo.ready',
      'fa.created',
      'fa.allergens_changed',
      'fa.intermediate_code_changed',
      'fa.edit'
    )
  );

comment on constraint outbox_events_event_type_check on public.outbox_events
  is 'Regenerated from events.enum.ts DB_EVENT_TYPES (183 types; adds wip.definition.updated).';

comment on function public.seed_technical_wip_permissions_for_org(uuid) is
  'Migration 432: grants technical.wip.* to operator, lead, and org-admin role families in role_permissions and roles.permissions. Idempotent.';

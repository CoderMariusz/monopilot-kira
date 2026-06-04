-- Migration 136: T-018 FA dept autofilter indexes + reopen outbox event.
-- Wave0 lock: org_id business scope (NOT tenant_id); product RLS already uses app.current_org_id().

create index if not exists product_org_closed_core_idx
  on public.product (org_id, closed_core);

create index if not exists product_org_closed_planning_idx
  on public.product (org_id, closed_planning);

create index if not exists product_org_closed_commercial_idx
  on public.product (org_id, closed_commercial);

create index if not exists product_org_closed_production_idx
  on public.product (org_id, closed_production);

create index if not exists product_org_closed_technical_idx
  on public.product (org_id, closed_technical);

create index if not exists product_org_closed_mrp_idx
  on public.product (org_id, closed_mrp);

create index if not exists product_org_closed_procurement_idx
  on public.product (org_id, closed_procurement);

alter table public.outbox_events drop constraint if exists outbox_events_event_type_check;
alter table public.outbox_events add constraint outbox_events_event_type_check check (
    event_type in (
      'audit.recorded',
      'bom.initial_version_created',
      'bom.version_submitted',
      'brief.converted',
      'brief.created',
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
      'fa.intermediate_code_changed',
      'fa.recipe_changed',
      'fa.template_applied',
      'fg.allergens_changed',
      'fg.bom.released',
      'fg.created',
      'fg.intermediate_code_changed',
      'fg.release_blocked',
      'fg.released_to_factory',
      'formulation.locked',
      'formulation.submitted_for_trial',
      'lp.received',
      'npd.builder.released_records_created',
      'npd.project.created',
      'npd.project.release_requested',
      'onboarding.first_wo_recorded',
      'onboarding.step.advance',
      'onboarding.step.back',
      'onboarding.step.jump',
      'onboarding.step.restart',
      'onboarding.step.skip',
      'org.created',
      'quality.recorded',
      'risk.created',
      'role.assigned',
      'rule.deployed',
      'settings.line.upserted',
      'settings.location.upserted',
      'settings.machine.upserted',
      'settings.module.toggled',
      'settings.notification_channel_updated',
      'settings.notification_digest_updated',
      'settings.notification_rule_updated',
      'settings.org.created',
      'settings.org.updated',
      'settings.reference.row_updated',
      'settings.role.assigned',
      'settings.rule.deployed',
      'settings.schema.migration_requested',
      'settings.scim.token_created',
      'settings.sso.config_changed',
      'settings.user.accepted',
      'settings.user.deactivated',
      'settings.user.invited',
      'settings.warehouse.deactivated',
      'shipment.created',
      'technical.factory_spec.approved',
      'tenant.cohort.advanced',
      'tenant.migration.run',
      'tenant.migration.run.failed',
      'user.invited',
      'wo.ready'
    )
  );

comment on constraint outbox_events_event_type_check on public.outbox_events
  is 'T-018: includes fa.dept_reopened while preserving migration 135 accepted outbox event types.';

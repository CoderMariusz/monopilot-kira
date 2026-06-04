-- T-081: admit NPD risk.created outbox events emitted by risk Server Actions.
-- Wave0 lock: public.outbox_events remains org_id scoped by existing RLS via
-- app.current_org_id(); this migration only extends the event-type CHECK.

alter table public.outbox_events
  drop constraint if exists outbox_events_event_type_check;

alter table public.outbox_events
  add constraint outbox_events_event_type_check check (
    event_type in (
      'org.created', 'user.invited', 'role.assigned', 'audit.recorded',
      'brief.created', 'brief.converted',
      'fg.created', 'fg.allergens_changed', 'fg.intermediate_code_changed',
      'fa.created', 'fa.core_closed', 'fa.dept_closed', 'fa.built', 'fa.built_reset',
      'fa.allergens_changed', 'fa.intermediate_code_changed',
      'risk.created',
      'bom.initial_version_created', 'fg.bom.released', 'bom.version_submitted',
      'lp.received', 'wo.ready', 'quality.recorded', 'shipment.created',
      'tenant.migration.run', 'tenant.migration.run.failed', 'tenant.cohort.advanced',
      'settings.schema.migration_requested',
      'settings.rule.deployed', 'rule.deployed',
      'settings.location.upserted', 'settings.machine.upserted', 'settings.line.upserted',
      'settings.warehouse.deactivated',
      'settings.module.toggled',
      'settings.org.created', 'settings.org.updated',
      'settings.reference.row_updated',
      'settings.role.assigned',
      'settings.scim.token_created', 'settings.sso.config_changed',
      'settings.user.invited', 'settings.user.accepted', 'settings.user.deactivated',
      'settings.notification_rule_updated', 'settings.notification_channel_updated',
      'settings.notification_digest_updated',
      'onboarding.step.advance', 'onboarding.step.back', 'onboarding.step.skip',
      'onboarding.step.jump', 'onboarding.step.restart', 'onboarding.first_wo_recorded'
    )
  );

comment on constraint outbox_events_event_type_check on public.outbox_events
  is 'T-081: includes NPD risk.created event while preserving existing accepted outbox event types.';

-- T-084: Compliance docs lifecycle Server Actions emit upload/delete outbox events.
-- Wave0 lock: org_id business scope stays on outbox_events; this migration only
-- reconciles the event_type CHECK with the new 01-NPD-i events.

alter table public.outbox_events
  drop constraint if exists outbox_events_event_type_check;
alter table public.outbox_events
  add constraint outbox_events_event_type_check check (
    event_type in (
      'audit.recorded',
      'bom.initial_version_created',
      'bom.version_submitted',
      'brief.converted',
      'brief.created',
      'compliance_doc.deleted',
      'compliance_doc.uploaded',
      'fa.allergens_changed',
      'fa.built',
      'fa.built_reset',
      'fa.core_closed',
      'fa.created',
      'fa.dept_closed',
      'fa.intermediate_code_changed',
      'fg.allergens_changed',
      'fg.bom.released',
      'fg.created',
      'fg.intermediate_code_changed',
      'formulation.locked',
      'formulation.submitted_for_trial',
      'lp.received',
      'npd.project.created',
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
      'tenant.cohort.advanced',
      'tenant.migration.run',
      'tenant.migration.run.failed',
      'user.invited',
      'wo.ready'
    )
  );
comment on constraint outbox_events_event_type_check on public.outbox_events
  is 'Authoritative union of all outbox event types as of T-084. Re-run reconcile when adding new types.';

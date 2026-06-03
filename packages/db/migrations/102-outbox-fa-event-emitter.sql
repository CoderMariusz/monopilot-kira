-- Migration 102: T-007 typed FA event emitter support.
-- Wave0 lock: org_id business scope remains enforced by existing
-- outbox_events RLS policy via app.current_org_id().

alter table public.outbox_events
  alter column aggregate_id type text using aggregate_id::text;

alter table public.outbox_dead_letter
  alter column aggregate_id type text using aggregate_id::text;

alter table public.outbox_events
  add column if not exists dedup_key text;

create unique index if not exists outbox_events_org_dedup_key_unique
  on public.outbox_events (org_id, dedup_key)
  where dedup_key is not null;

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
  is 'T-007: includes typed NPD FA emitter events and brief.converted.';

grant select, insert on public.outbox_events to app_user;
grant usage, select on sequence public.outbox_events_id_seq to app_user;

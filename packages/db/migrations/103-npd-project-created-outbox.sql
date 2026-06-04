-- Migration 103: T-057 NPD project created outbox event.
-- Wave0 lock: org_id business scope remains enforced by existing
-- outbox_events RLS policy via app.current_org_id().

alter table public.npd_projects
  drop constraint if exists npd_projects_code_key;

drop index if exists public.npd_projects_code_key;

alter table public.npd_projects
  drop constraint if exists npd_projects_org_code_unique;

alter table public.npd_projects
  add constraint npd_projects_org_code_unique unique (org_id, code);

alter table public.outbox_events
  drop constraint if exists outbox_events_event_type_check;

alter table public.outbox_events
  add constraint outbox_events_event_type_check check (
    event_type in (
      'org.created', 'user.invited', 'role.assigned', 'audit.recorded',
      'brief.created', 'brief.converted',
      'npd.project.created',
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
  is 'T-057: includes npd.project.created for project lifecycle Server Actions.';

grant select, insert on public.outbox_events to app_user;
grant usage, select on sequence public.outbox_events_id_seq to app_user;

-- Migration 120: T-090 — D365 import cache metadata view + outbox event type.
-- Wave0 lock: org_id business scope; view relies on d365_import_cache RLS via
-- security_invoker and never reads app.current_org_id() through raw current_setting.

create or replace view public.d365_import_cache_meta
with (security_invoker = true) as
select
  cache.org_id,
  max(cache.last_synced_at) as last_synced_at,
  count(*) as row_count
from public.d365_import_cache cache
group by cache.org_id;

revoke all on public.d365_import_cache_meta from public;
grant select on public.d365_import_cache_meta to app_user;

comment on view public.d365_import_cache_meta
  is 'T-090: Per-org last D365 import-cache sync timestamp and cache row count. security_invoker=true preserves d365_import_cache RLS.';

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
      'd365.cache.refreshed',
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
  is 'Authoritative union of all outbox event types through T-090, including d365.cache.refreshed.';

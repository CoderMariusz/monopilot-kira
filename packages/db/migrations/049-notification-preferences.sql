-- Migration 049 — SET-092 notification preferences + outbox events
-- Adds the user/org-scoped notification preference store used by the Settings
-- notifications screen and allows the transactional outbox event types emitted
-- by its Server Actions.

create table if not exists public.notification_preferences (
  user_id        uuid    not null references public.users(id) on delete cascade,
  org_id         uuid    not null references public.organizations(id) on delete cascade,
  category       text    not null,
  event          text    not null,
  channel_email  boolean not null default true,
  channel_in_app boolean not null default true,
  created_at     timestamptz not null default pg_catalog.now(),
  updated_at     timestamptz not null default pg_catalog.now(),
  primary key (user_id, org_id, category, event),
  constraint notification_preferences_category_event_nonempty
    check (length(trim(category)) > 0 and length(trim(event)) > 0)
);

create index if not exists notification_preferences_org_event_idx
  on public.notification_preferences (org_id, category, event);

alter table public.notification_preferences enable row level security;
alter table public.notification_preferences force row level security;

drop policy if exists notification_preferences_org_context on public.notification_preferences;
create policy notification_preferences_org_context
  on public.notification_preferences
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

alter table public.outbox_events
  drop constraint if exists outbox_events_event_type_check;

alter table public.outbox_events
  add constraint outbox_events_event_type_check check (
    event_type in (
      'org.created',
      'user.invited',
      'role.assigned',
      'audit.recorded',
      'brief.created',
      'fg.created',
      'fg.allergens_changed',
      'fg.intermediate_code_changed',
      'lp.received',
      'wo.ready',
      'quality.recorded',
      'shipment.created',
      'tenant.migration.run',
      'tenant.migration.run.failed',
      'tenant.cohort.advanced',
      'settings.schema.migration_requested',
      'settings.rule.deployed',
      'rule.deployed',
      'settings.location.upserted',
      'settings.machine.upserted',
      'settings.line.upserted',
      'settings.warehouse.deactivated',
      'settings.notification_rule_updated',
      'settings.notification_channel_updated',
      'settings.notification_digest_updated'
    )
  );

comment on table public.notification_preferences
  is 'SET-092 per-user/per-org notification preferences surfaced by /settings/notifications.';

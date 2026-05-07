-- Migration 003: outbox_events table for transactional outbox pattern
-- Scope: org_id (business/application scope per Wave0 v4.3)
-- Event type constraint enforced against canonical EventType members from T-003

create table if not exists public.outbox_events (
  id            bigserial    primary key,
  org_id        uuid         not null,
  event_type    text         not null,
  aggregate_type text        not null,
  aggregate_id  uuid         not null,
  payload       jsonb        not null,
  created_at    timestamptz  not null default pg_catalog.now(),
  consumed_at   timestamptz,
  app_version   text         not null,
  constraint outbox_events_event_type_check check (
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
      'shipment.created'
    )
  )
);

-- Partial index on (org_id, created_at) for unconsumed events — used by worker poll query
create index if not exists outbox_events_unconsumed_idx
  on public.outbox_events (org_id, created_at)
  where consumed_at is null;

-- Enable RLS on outbox_events (bypassed for service-role/superuser poll worker)
alter table public.outbox_events enable row level security;
alter table public.outbox_events force row level security;

drop policy if exists outbox_events_org_context on public.outbox_events;
create policy outbox_events_org_context
  on public.outbox_events
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

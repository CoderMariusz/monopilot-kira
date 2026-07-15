-- Migration 493: per-user quiet-hours settings for Account > Notifications.

create table if not exists public.user_notification_settings (
  user_id uuid not null references public.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, org_id)
);

alter table public.user_notification_settings enable row level security;
alter table public.user_notification_settings force row level security;

drop policy if exists user_notification_settings_org_user_context on public.user_notification_settings;
create policy user_notification_settings_org_user_context
  on public.user_notification_settings
  for all
  to app_user
  using (
    org_id = app.current_org_id()
    and user_id = app.current_user_id()
  )
  with check (
    org_id = app.current_org_id()
    and user_id = app.current_user_id()
  );

revoke all on public.user_notification_settings from public;
grant select, insert, update, delete on public.user_notification_settings to app_user;

comment on table public.user_notification_settings
  is 'Per-user, per-org global notification settings, including quiet hours.';

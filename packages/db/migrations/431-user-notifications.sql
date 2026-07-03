-- Migration 431 — user notifications inbox (W3 L8).
-- Mirrors notification_preferences: org RLS via app.current_org_id(); actions must also filter user_id.

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  type text not null,
  title text not null,
  body text,
  link text,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_org_user_created_idx
  on public.user_notifications (org_id, user_id, created_at desc);

alter table public.user_notifications enable row level security;
alter table public.user_notifications force row level security;

drop policy if exists user_notifications_org_context on public.user_notifications;
create policy user_notifications_org_context
  on public.user_notifications
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.user_notifications from public;
revoke all on public.user_notifications from app_user;
grant select, insert, update on public.user_notifications to app_user;

comment on table public.user_notifications
  is 'Per-user org-scoped notification inbox. RLS mirrors notification_preferences; application queries must filter user_id = ctx.userId.';

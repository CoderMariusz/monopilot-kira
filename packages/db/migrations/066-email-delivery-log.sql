-- Migration 066: 02-settings T-113 — email_delivery_log (Email Delivery Log, SET-093 §13.4)
-- PRD: docs/prd/02-SETTINGS-PRD.md §13.4, §13.2
-- Wave0: org_id business scope (NOT tenant_id). RLS via app.current_org_id().
--
-- Read-only viewer source, populated by the email outbox/DLQ worker (§13.2, another module).
-- Column shape matches the consumer page:
--   apps/web/app/[locale]/(app)/(admin)/settings/notifications/email-log/page.tsx
--   reads: id, created_at, status (queued|sent|failed|dlq), retry_status, trigger_code,
--          recipient_email, provider_message_id, payload (jsonb)
-- Task JSON §13.4 also lists subject / retry_count / last_error_summary (worker-written) — included for completeness.
-- NO seed — honest empty-state until the email worker produces rows.

create table if not exists public.email_delivery_log (
  id                  uuid        primary key default gen_random_uuid(),
  org_id              uuid        not null references public.organizations(id) on delete cascade,
  trigger_code        text        not null,
  recipient_email     text        not null,
  subject             text,
  status              text        not null default 'queued',
  retry_status        text        not null default 'not_retried',
  retry_count         integer     not null default 0,
  provider_message_id text,
  last_error_summary  text,
  payload             jsonb       not null default '{}'::jsonb,
  created_at          timestamptz not null default pg_catalog.now(),
  updated_at          timestamptz not null default pg_catalog.now(),
  constraint email_delivery_log_status_check
    check (status in ('queued', 'sent', 'failed', 'dlq')),
  constraint email_delivery_log_retry_status_check
    check (retry_status in ('not_retried', 'retry_scheduled', 'retry_exhausted', 'dlq')),
  constraint email_delivery_log_retry_count_check check (retry_count >= 0)
);

create index if not exists email_delivery_log_org_idx
  on public.email_delivery_log (org_id);
-- Page query: WHERE org_id (RLS) ORDER BY created_at DESC LIMIT 100.
create index if not exists email_delivery_log_org_created_idx
  on public.email_delivery_log (org_id, created_at desc);
create index if not exists email_delivery_log_org_trigger_idx
  on public.email_delivery_log (org_id, trigger_code);

alter table public.email_delivery_log enable row level security;
alter table public.email_delivery_log force row level security;
drop policy if exists email_delivery_log_org_context on public.email_delivery_log;
create policy email_delivery_log_org_context
  on public.email_delivery_log
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.email_delivery_log from public;
grant select, insert, update, delete on public.email_delivery_log to app_user;

comment on table public.email_delivery_log
  is 'T-113: per-org email delivery log (SET-093). Producer is the email outbox/DLQ worker; read-only viewer in Settings.';

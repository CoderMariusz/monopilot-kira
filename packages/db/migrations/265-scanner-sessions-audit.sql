-- Migration 265: 06-Scanner — scanner session backbone and append-only scanner audit.
--
-- Wave0 lock: org_id is the business scope; RLS uses
-- app.current_org_id() and never raw current_setting GUCs.

create table if not exists public.scanner_sessions (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null,
  user_id            uuid not null,
  device_id          uuid,
  site_id            uuid,
  line_id            uuid,
  shift              text,
  mode               text not null default 'personal',
  session_token_hash text not null unique,
  expires_at         timestamptz not null,
  ended_at           timestamptz,
  created_at         timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),

  constraint scanner_sessions_mode_check check (mode in ('personal', 'kiosk'))
);

create index if not exists scanner_sessions_org_user_idx
  on public.scanner_sessions (org_id, user_id);

alter table public.scanner_sessions enable row level security;
alter table public.scanner_sessions force row level security;

drop policy if exists scanner_sessions_org_context on public.scanner_sessions;
create policy scanner_sessions_org_context
  on public.scanner_sessions
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.scanner_sessions from public;
revoke all on public.scanner_sessions from app_user;
grant select, insert, update, delete on public.scanner_sessions to app_user;

create table if not exists public.scanner_audit_log (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  session_id    uuid references public.scanner_sessions(id),
  user_id       uuid,
  device_id     uuid,
  operation     text not null,
  barcode_raw   text,
  lp_id         uuid,
  wo_id         uuid,
  scan_method   text,
  result_code   text,
  client_op_id  text,
  occurred_at   timestamptz not null default now(),
  ext           jsonb not null default '{}'::jsonb
);

create unique index if not exists scanner_audit_log_org_client_op_id_uq
  on public.scanner_audit_log (org_id, client_op_id)
  where client_op_id is not null;

create index if not exists scanner_audit_log_org_occurred_at_idx
  on public.scanner_audit_log (org_id, occurred_at desc);
create index if not exists scanner_audit_log_org_wo_idx
  on public.scanner_audit_log (org_id, wo_id);

alter table public.scanner_audit_log enable row level security;
alter table public.scanner_audit_log force row level security;

drop policy if exists scanner_audit_log_org_context_select on public.scanner_audit_log;
create policy scanner_audit_log_org_context_select
  on public.scanner_audit_log
  for select
  to app_user
  using (org_id = app.current_org_id());

drop policy if exists scanner_audit_log_org_context_insert on public.scanner_audit_log;
create policy scanner_audit_log_org_context_insert
  on public.scanner_audit_log
  for insert
  to app_user
  with check (org_id = app.current_org_id());

drop policy if exists scanner_audit_log_org_context_update on public.scanner_audit_log;
drop policy if exists scanner_audit_log_org_context_delete on public.scanner_audit_log;

revoke all on public.scanner_audit_log from public;
revoke all on public.scanner_audit_log from app_user;
grant select, insert on public.scanner_audit_log to app_user;

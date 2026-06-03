-- Migration 057: GDPR erasure request runtime queue (T-114)
-- Wave0: org_id is the business scope. RLS uses app.current_org_id().

create table if not exists public.gdpr_erasure_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_id text not null,
  requested_by uuid not null,
  requested_at timestamptz not null default pg_catalog.now(),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'done', 'failed')),
  started_at timestamptz,
  processed_at timestamptz,
  domains_run text[] not null default '{}'::text[],
  last_error text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create index if not exists gdpr_erasure_requests_pending_idx
  on public.gdpr_erasure_requests (requested_at, id)
  where status = 'pending';

create index if not exists gdpr_erasure_requests_org_requested_idx
  on public.gdpr_erasure_requests (org_id, requested_at);

alter table public.gdpr_erasure_requests enable row level security;
alter table public.gdpr_erasure_requests force row level security;

drop policy if exists gdpr_erasure_requests_org_context on public.gdpr_erasure_requests;
create policy gdpr_erasure_requests_org_context
  on public.gdpr_erasure_requests
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.gdpr_erasure_requests from public;
grant select, insert, update on public.gdpr_erasure_requests to app_user;

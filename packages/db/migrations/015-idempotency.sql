-- Migration 015: idempotency_keys table for client-generated UUID v7 idempotent mutations
-- Scope: org_id (business/application scope per Wave0 v4.3)
-- Note: T-024.json originally specified 013- but 013-tenant-migrations.sql was already
--       claimed by T-038. Using 015- to avoid collision; documented in T-024.md.

create table if not exists public.idempotency_keys (
  transaction_id  uuid         primary key,
  org_id          uuid         not null,
  request_hash    text         not null,
  response_json   jsonb        not null,
  created_at      timestamptz  not null default pg_catalog.now(),
  expires_at      timestamptz
);

create index if not exists idempotency_keys_org_id_idx
  on public.idempotency_keys (org_id);

create index if not exists idempotency_keys_expires_at_idx
  on public.idempotency_keys (expires_at)
  where expires_at is not null;

-- Enable RLS: org_id isolation via app.current_org_id()
alter table public.idempotency_keys enable row level security;
alter table public.idempotency_keys force row level security;

drop policy if exists idempotency_keys_org_context on public.idempotency_keys;
create policy idempotency_keys_org_context
  on public.idempotency_keys
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

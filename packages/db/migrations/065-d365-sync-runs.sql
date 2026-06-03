-- Migration 065: 02-settings T-112 — d365_sync_runs (D365 Sync Audit, SET-083 §11.3)
-- PRD: docs/prd/02-SETTINGS-PRD.md §11.3, §11.4
-- Wave0: org_id business scope (NOT tenant_id). RLS via app.current_org_id().
--
-- Read-only audit viewer source. Column shape matches the consumer page:
--   apps/web/app/[locale]/(app)/(admin)/settings/integrations/d365/audit/page.tsx
--   reads: id, started_at, finished_at, direction (pull|push), entity_type, status (ok|partial|failed),
--          rows_in, rows_ok, rows_failed, error_summary, errors (jsonb)
-- NO seed — honest empty-state until the D365 sync engine (another module) produces rows.

create table if not exists public.d365_sync_runs (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references public.organizations(id) on delete cascade,
  started_at    timestamptz not null default pg_catalog.now(),
  finished_at   timestamptz,
  direction     text        not null,
  entity_type   text        not null,
  status        text        not null,
  rows_in       integer     not null default 0,
  rows_ok       integer     not null default 0,
  rows_failed   integer     not null default 0,
  error_summary text,
  errors        jsonb       not null default '[]'::jsonb,
  created_at    timestamptz not null default pg_catalog.now(),
  constraint d365_sync_runs_direction_check check (direction in ('pull', 'push')),
  constraint d365_sync_runs_status_check check (status in ('ok', 'partial', 'failed')),
  constraint d365_sync_runs_row_counts_check check (rows_in >= 0 and rows_ok >= 0 and rows_failed >= 0)
);

create index if not exists d365_sync_runs_org_idx
  on public.d365_sync_runs (org_id);
-- Page query: WHERE org_id (RLS) ORDER BY started_at DESC LIMIT 100.
create index if not exists d365_sync_runs_org_started_idx
  on public.d365_sync_runs (org_id, started_at desc);

alter table public.d365_sync_runs enable row level security;
alter table public.d365_sync_runs force row level security;
drop policy if exists d365_sync_runs_org_context on public.d365_sync_runs;
create policy d365_sync_runs_org_context
  on public.d365_sync_runs
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.d365_sync_runs from public;
grant select, insert, update, delete on public.d365_sync_runs to app_user;

comment on table public.d365_sync_runs
  is 'T-112: D365 sync audit runs (SET-083). Producer is the D365 sync engine in another module; read-only viewer in Settings.';

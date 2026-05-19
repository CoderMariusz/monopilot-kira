-- Migration 045: reference_csv_import_reports persistent storage (T-022)
-- PRD: docs/prd/02-SETTINGS-PRD.md §8.5
-- Reason: preview→commit CSV import flow must survive Vercel serverless
--   scale-out where ƛ instances do not share /tmp. We persist the preview
--   payload in Postgres so any instance can finalize the commit.
-- Wave0: org_id; RLS uses app.current_org_id().

create table if not exists public.reference_csv_import_reports (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references public.organizations(id) on delete cascade,
  table_code  text        not null,
  payload     jsonb       not null,
  expires_at  timestamptz not null,
  created_by  uuid        references public.users(id) on delete set null,
  created_at  timestamptz not null default pg_catalog.now()
);

create index if not exists reference_csv_import_reports_org_idx
  on public.reference_csv_import_reports (org_id, expires_at);

alter table public.reference_csv_import_reports enable row level security;
alter table public.reference_csv_import_reports force row level security;

drop policy if exists reference_csv_import_reports_org_context on public.reference_csv_import_reports;
create policy reference_csv_import_reports_org_context
  on public.reference_csv_import_reports
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.reference_csv_import_reports from public;
grant select, insert, update, delete on public.reference_csv_import_reports to app_user;

-- Janitor: callers may run this periodically (cron) to drop stale preview reports.
create or replace function public.prune_reference_csv_import_reports()
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  removed integer;
begin
  delete from public.reference_csv_import_reports
   where expires_at < pg_catalog.now()
  returning 1
  into removed;
  return coalesce(removed, 0);
end;
$$;

revoke all on function public.prune_reference_csv_import_reports() from public;

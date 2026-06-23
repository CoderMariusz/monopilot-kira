-- Migration 305: Wave E2A — recall_drills (trace/recall drill record + KPI timing).
-- A recall drill records a trace run (backward/forward from an LP/batch/item) and how long it
-- took from start to report (BRCGS expects a target, e.g. <4h). The trace graph itself is read
-- live from the existing recursive genealogy CTE (lib/warehouse/genealogy.ts) — this table only
-- stores the drill envelope + a result snapshot, it does NOT duplicate the genealogy reader.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id(). site_id day-1 nullable.
create table if not exists public.recall_drills (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  site_id       uuid,
  initiated_by  uuid references public.users(id) on delete set null,
  input_type    text not null,
  input_ref     text not null,
  direction     text not null default 'both',
  started_at    timestamptz not null default pg_catalog.now(),
  completed_at  timestamptz,
  duration_ms   integer,
  result_jsonb  jsonb,
  report_url    text,
  is_drill      boolean not null default true,
  notes         text,
  created_at    timestamptz not null default pg_catalog.now(),
  updated_at    timestamptz not null default pg_catalog.now(),
  constraint recall_drills_input_type_check check (input_type in ('lp','batch','item')),
  constraint recall_drills_direction_check check (direction in ('backward','forward','both'))
);
create index if not exists idx_recall_drills_org on public.recall_drills (org_id, started_at desc);

alter table public.recall_drills enable row level security;
alter table public.recall_drills force  row level security;
drop policy if exists recall_drills_org_isolation on public.recall_drills;
create policy recall_drills_org_isolation on public.recall_drills
  for all to app_user using (org_id = app.current_org_id()) with check (org_id = app.current_org_id());

revoke all on public.recall_drills from public;
revoke all on public.recall_drills from app_user;
grant select, insert, update, delete on public.recall_drills to app_user;

drop trigger if exists recall_drills_set_updated_at on public.recall_drills;
create trigger recall_drills_set_updated_at before update on public.recall_drills
  for each row execute function public.planning_mrp_set_updated_at();

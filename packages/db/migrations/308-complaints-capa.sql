-- Migration 308: Wave E11 — customer complaints register + CAPA actions.
-- A complaint references a batch/LP (traced via the existing genealogy/trace), can convert to
-- the EXISTING NCR module, and drives CAPA (corrective/preventive actions with owners + due dates
-- + e-sign on close). Wave0 lock: org_id; RLS via app.current_org_id(). site_id day-1 nullable.
create table if not exists public.complaints (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  site_id       uuid,
  complaint_number text,
  customer_id   uuid,
  lp_id         uuid,
  batch_ref     text,
  description   text not null,
  severity      text not null default 'medium',
  status        text not null default 'open',
  ncr_id        uuid,
  opened_by     uuid references public.users(id) on delete set null,
  opened_at     timestamptz not null default pg_catalog.now(),
  closed_at     timestamptz,
  created_at    timestamptz not null default pg_catalog.now(),
  updated_at    timestamptz not null default pg_catalog.now(),
  constraint complaints_severity_check check (severity in ('low','medium','high','critical')),
  constraint complaints_status_check check (status in ('open','investigating','converted','closed'))
);
create index if not exists idx_complaints_org on public.complaints (org_id, status);

create table if not exists public.capa_actions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  site_id       uuid,
  source_type   text not null,
  source_id     uuid not null,
  action_type   text not null default 'corrective',
  description   text not null,
  owner_user_id uuid references public.users(id) on delete set null,
  due_date      date,
  status        text not null default 'open',
  closed_by     uuid references public.users(id) on delete set null,
  closed_at     timestamptz,
  esign_ref     text,
  created_at    timestamptz not null default pg_catalog.now(),
  updated_at    timestamptz not null default pg_catalog.now(),
  constraint capa_source_type_check check (source_type in ('complaint','ncr')),
  constraint capa_action_type_check check (action_type in ('corrective','preventive')),
  constraint capa_status_check check (status in ('open','in_progress','closed'))
);
create index if not exists idx_capa_org on public.capa_actions (org_id, status);
create index if not exists idx_capa_source on public.capa_actions (org_id, source_type, source_id);

alter table public.complaints   enable row level security;
alter table public.complaints   force  row level security;
alter table public.capa_actions enable row level security;
alter table public.capa_actions force  row level security;

drop policy if exists complaints_org_isolation on public.complaints;
create policy complaints_org_isolation on public.complaints
  for all to app_user using (org_id = app.current_org_id()) with check (org_id = app.current_org_id());
drop policy if exists capa_actions_org_isolation on public.capa_actions;
create policy capa_actions_org_isolation on public.capa_actions
  for all to app_user using (org_id = app.current_org_id()) with check (org_id = app.current_org_id());

revoke all on public.complaints   from public;
revoke all on public.complaints   from app_user;
revoke all on public.capa_actions from public;
revoke all on public.capa_actions from app_user;
grant select, insert, update, delete on public.complaints   to app_user;
grant select, insert, update, delete on public.capa_actions to app_user;

drop trigger if exists complaints_set_updated_at on public.complaints;
create trigger complaints_set_updated_at before update on public.complaints
  for each row execute function public.planning_mrp_set_updated_at();
drop trigger if exists capa_actions_set_updated_at on public.capa_actions;
create trigger capa_actions_set_updated_at before update on public.capa_actions
  for each row execute function public.planning_mrp_set_updated_at();

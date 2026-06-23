-- Migration 306: Wave E3 (HACCP full) — haccp_plans + ccp_deviations + link ccps to a plan.
-- haccp_ccps (mig 289) + haccp_monitoring_log already exist; this adds the PLAN layer above CCPs
-- (draft→active→superseded, clone-on-write versioning, e-sign approval) and a deviation register
-- (a critical-limit breach opens a ccp_deviation + can auto-hold the affected LP/WO). plan_id on
-- haccp_ccps is nullable so existing CCPs are not broken.
-- Wave0 lock: org_id; RLS via app.current_org_id(). site_id day-1 nullable.
create table if not exists public.haccp_plans (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  site_id       uuid,
  scope_type    text not null default 'product',
  scope_ref     text,
  name          text not null,
  version       integer not null default 1,
  status        text not null default 'draft',
  approved_by   uuid references public.users(id) on delete set null,
  approved_at   timestamptz,
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default pg_catalog.now(),
  updated_at    timestamptz not null default pg_catalog.now(),
  constraint haccp_plans_scope_check check (scope_type in ('product','category','line')),
  constraint haccp_plans_status_check check (status in ('draft','active','superseded')),
  constraint haccp_plans_org_name_version_unique unique (org_id, name, version)
);
create index if not exists idx_haccp_plans_org on public.haccp_plans (org_id, status);

alter table public.haccp_ccps add column if not exists plan_id uuid references public.haccp_plans(id) on delete set null;
create index if not exists idx_haccp_ccps_plan on public.haccp_ccps (plan_id) where plan_id is not null;

create table if not exists public.ccp_deviations (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  site_id           uuid,
  ccp_id            uuid not null references public.haccp_ccps(id) on delete cascade,
  monitoring_log_id uuid,
  measured_value    numeric,
  uom               text,
  action_taken      text,
  disposition       text,
  hold_id           uuid,
  status            text not null default 'open',
  opened_at         timestamptz not null default pg_catalog.now(),
  opened_by         uuid references public.users(id) on delete set null,
  closed_at         timestamptz,
  closed_by         uuid references public.users(id) on delete set null,
  esign_ref         text,
  created_at        timestamptz not null default pg_catalog.now(),
  updated_at        timestamptz not null default pg_catalog.now(),
  constraint ccp_deviations_status_check check (status in ('open','resolved'))
);
create index if not exists idx_ccp_deviations_org on public.ccp_deviations (org_id, status);
create index if not exists idx_ccp_deviations_ccp on public.ccp_deviations (ccp_id);

alter table public.haccp_plans    enable row level security;
alter table public.haccp_plans    force  row level security;
alter table public.ccp_deviations enable row level security;
alter table public.ccp_deviations force  row level security;

drop policy if exists haccp_plans_org_isolation on public.haccp_plans;
create policy haccp_plans_org_isolation on public.haccp_plans
  for all to app_user using (org_id = app.current_org_id()) with check (org_id = app.current_org_id());
drop policy if exists ccp_deviations_org_isolation on public.ccp_deviations;
create policy ccp_deviations_org_isolation on public.ccp_deviations
  for all to app_user using (org_id = app.current_org_id()) with check (org_id = app.current_org_id());

revoke all on public.haccp_plans    from public;
revoke all on public.haccp_plans    from app_user;
revoke all on public.ccp_deviations from public;
revoke all on public.ccp_deviations from app_user;
grant select, insert, update, delete on public.haccp_plans    to app_user;
grant select, insert, update, delete on public.ccp_deviations to app_user;

drop trigger if exists haccp_plans_set_updated_at on public.haccp_plans;
create trigger haccp_plans_set_updated_at before update on public.haccp_plans
  for each row execute function public.planning_mrp_set_updated_at();
drop trigger if exists ccp_deviations_set_updated_at on public.ccp_deviations;
create trigger ccp_deviations_set_updated_at before update on public.ccp_deviations
  for each row execute function public.planning_mrp_set_updated_at();

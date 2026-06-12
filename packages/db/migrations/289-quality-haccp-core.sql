-- Migration 289: 09-Quality P2 — HACCP/CCP monitoring core.
-- Creates CCP definitions and monitoring log only; sampling, complaints, and plan lifecycle are out of scope.

create table if not exists public.haccp_ccps (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations(id) on delete cascade,
  ccp_code                text not null,
  name                    text not null,
  process_step            text not null,
  hazard_type             text not null,
  critical_limit_min      numeric,
  critical_limit_max      numeric,
  unit                    text not null default '',
  monitoring_frequency    text not null default '',
  corrective_action       text not null default '',
  line_id                 uuid,
  is_active               boolean not null default true,
  created_at              timestamptz not null default pg_catalog.now(),
  updated_at              timestamptz not null default pg_catalog.now(),
  created_by              uuid,

  constraint haccp_ccps_org_code_uq unique (org_id, ccp_code),
  constraint haccp_ccps_hazard_type_check check (
    hazard_type in ('biological', 'chemical', 'physical', 'allergen')
  ),
  constraint haccp_ccps_critical_limits_check check (
    critical_limit_min is null
    or critical_limit_max is null
    or critical_limit_min <= critical_limit_max
  ),
  constraint haccp_ccps_active_limit_required_check check (
    not is_active or critical_limit_min is not null or critical_limit_max is not null
  )
);

create table if not exists public.haccp_monitoring_log (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations(id) on delete cascade,
  ccp_id                  uuid not null references public.haccp_ccps(id) on delete restrict,
  measured_value          numeric(12, 4) not null,
  measured_at             timestamptz not null default pg_catalog.now(),
  wo_id                   uuid,
  within_limits           boolean not null,
  recorded_by             uuid,
  note                    text,
  breach_ncr_id           uuid references public.ncr_reports(id) on delete set null,
  created_at              timestamptz not null default pg_catalog.now(),
  updated_at              timestamptz not null default pg_catalog.now()
);

create index if not exists haccp_ccps_org_idx
  on public.haccp_ccps (org_id);
create index if not exists haccp_ccps_org_active_idx
  on public.haccp_ccps (org_id, is_active);
create index if not exists haccp_monitoring_log_org_idx
  on public.haccp_monitoring_log (org_id);
create index if not exists haccp_monitoring_log_ccp_measured_at_idx
  on public.haccp_monitoring_log (ccp_id, measured_at desc);

alter table public.haccp_ccps enable row level security;
alter table public.haccp_ccps force row level security;
drop policy if exists haccp_ccps_org_context on public.haccp_ccps;
create policy haccp_ccps_org_context
  on public.haccp_ccps
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

alter table public.haccp_monitoring_log enable row level security;
alter table public.haccp_monitoring_log force row level security;
drop policy if exists haccp_monitoring_log_org_context on public.haccp_monitoring_log;
create policy haccp_monitoring_log_org_context
  on public.haccp_monitoring_log
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.haccp_ccps from public;
revoke all on public.haccp_ccps from app_user;
grant select, insert, update on public.haccp_ccps to app_user;

revoke all on public.haccp_monitoring_log from public;
revoke all on public.haccp_monitoring_log from app_user;
grant select, insert, update on public.haccp_monitoring_log to app_user;

drop trigger if exists haccp_ccps_set_updated_at on public.haccp_ccps;
create trigger haccp_ccps_set_updated_at
  before insert or update on public.haccp_ccps
  for each row execute function public.quality_set_updated_at();

drop trigger if exists haccp_monitoring_log_set_updated_at on public.haccp_monitoring_log;
create trigger haccp_monitoring_log_set_updated_at
  before insert or update on public.haccp_monitoring_log
  for each row execute function public.quality_set_updated_at();

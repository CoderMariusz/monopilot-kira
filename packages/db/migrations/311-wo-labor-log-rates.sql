-- Migration 311: Wave E4B — WO labor log + effective-dated labor rates.
-- Operators clock in/out of a WO (scanner or desktop); hours x rate feeds WO labor cost
-- (replaces the hardcoded 8% in NPD costing). Rates are effective-dated like item_cost_history.
create table if not exists public.wo_labor_log (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  site_id       uuid,
  wo_id         uuid not null,
  user_id       uuid references public.users(id) on delete set null,
  line_id       text,
  started_at    timestamptz not null default pg_catalog.now(),
  ended_at      timestamptz,
  source        text not null default 'desktop',
  shift_pattern_id uuid,
  created_at    timestamptz not null default pg_catalog.now(),
  updated_at    timestamptz not null default pg_catalog.now(),
  constraint wo_labor_log_source_check check (source in ('scanner','desktop'))
);
create index if not exists idx_wo_labor_log_org_wo on public.wo_labor_log (org_id, wo_id);
create index if not exists idx_wo_labor_log_active on public.wo_labor_log (org_id, user_id) where ended_at is null;

create table if not exists public.labor_rates (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  site_id       uuid,
  role_group    text not null,
  rate_per_hour numeric(18,4) not null,
  currency      text not null default 'GBP',
  effective_from date not null default current_date,
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default pg_catalog.now(),
  updated_at    timestamptz not null default pg_catalog.now(),
  constraint labor_rates_rate_check check (rate_per_hour >= 0),
  constraint labor_rates_org_role_eff_unique unique (org_id, role_group, effective_from)
);
create index if not exists idx_labor_rates_org on public.labor_rates (org_id, role_group, effective_from desc);

alter table public.wo_labor_log enable row level security;
alter table public.wo_labor_log force  row level security;
alter table public.labor_rates  enable row level security;
alter table public.labor_rates  force  row level security;

drop policy if exists wo_labor_log_org_isolation on public.wo_labor_log;
create policy wo_labor_log_org_isolation on public.wo_labor_log
  for all to app_user using (org_id = app.current_org_id()) with check (org_id = app.current_org_id());
drop policy if exists labor_rates_org_isolation on public.labor_rates;
create policy labor_rates_org_isolation on public.labor_rates
  for all to app_user using (org_id = app.current_org_id()) with check (org_id = app.current_org_id());

revoke all on public.wo_labor_log from public;
revoke all on public.wo_labor_log from app_user;
revoke all on public.labor_rates  from public;
revoke all on public.labor_rates  from app_user;
grant select, insert, update, delete on public.wo_labor_log to app_user;
grant select, insert, update, delete on public.labor_rates  to app_user;

drop trigger if exists wo_labor_log_set_updated_at on public.wo_labor_log;
create trigger wo_labor_log_set_updated_at before update on public.wo_labor_log
  for each row execute function public.planning_mrp_set_updated_at();
drop trigger if exists labor_rates_set_updated_at on public.labor_rates;
create trigger labor_rates_set_updated_at before update on public.labor_rates
  for each row execute function public.planning_mrp_set_updated_at();

-- Migration 429 — NPD cost engine inputs (W2-L5 / owner D22-D31, D41-D42, U2).
--
-- Fully re-entrant and additive only. Do not apply from Codex lanes.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().

-- D22/D40: average batch quantity in the FG base unit.
-- D26/D27: per-project overrides for org-level overhead/logistics parameters.
alter table public.npd_projects
  add column if not exists avg_batch_qty numeric(14, 4),
  add column if not exists overhead_per_kg_override numeric(14, 6),
  add column if not exists logistics_per_box_override numeric(14, 6);

comment on column public.npd_projects.avg_batch_qty is
  'NPD costing D22/D40: average batch quantity in the FG base unit; converted to packs for per-batch display.';
comment on column public.npd_projects.overhead_per_kg_override is
  'NPD costing D26: optional project override for org_npd_cost_params.overhead_per_kg.';
comment on column public.npd_projects.logistics_per_box_override is
  'NPD costing D27: optional project override for org_npd_cost_params.logistics_per_box.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'npd_projects_avg_batch_qty_nonneg'
       and conrelid = 'public.npd_projects'::regclass
  ) then
    alter table public.npd_projects
      add constraint npd_projects_avg_batch_qty_nonneg
      check (avg_batch_qty is null or avg_batch_qty >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'npd_projects_overhead_per_kg_override_nonneg'
       and conrelid = 'public.npd_projects'::regclass
  ) then
    alter table public.npd_projects
      add constraint npd_projects_overhead_per_kg_override_nonneg
      check (overhead_per_kg_override is null or overhead_per_kg_override >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'npd_projects_logistics_per_box_override_nonneg'
       and conrelid = 'public.npd_projects'::regclass
  ) then
    alter table public.npd_projects
      add constraint npd_projects_logistics_per_box_override_nonneg
      check (logistics_per_box_override is null or logistics_per_box_override >= 0);
  end if;
end $$;

-- D24/D42: process throughput and setup costing inputs on per-use WIP processes.
alter table public.npd_wip_processes
  add column if not exists throughput_per_hour numeric(14, 4),
  add column if not exists throughput_uom text,
  add column if not exists setup_cost numeric(14, 4) not null default 0;

comment on column public.npd_wip_processes.throughput_per_hour is
  'NPD costing D24/D42: process output throughput per hour in throughput_uom; preferred over legacy duration_hours.';
comment on column public.npd_wip_processes.throughput_uom is
  'NPD costing D24/D42: output unit for throughput_per_hour (kg, pack/each, box where supported by engine).';
comment on column public.npd_wip_processes.setup_cost is
  'NPD costing D25: setup cost per run; amortised as setup_cost * runs_per_week / weekly_volume_packs.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'npd_wip_processes_throughput_nonneg'
       and conrelid = 'public.npd_wip_processes'::regclass
  ) then
    alter table public.npd_wip_processes
      add constraint npd_wip_processes_throughput_nonneg
      check (throughput_per_hour is null or throughput_per_hour >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'npd_wip_processes_setup_cost_nonneg'
       and conrelid = 'public.npd_wip_processes'::regclass
  ) then
    alter table public.npd_wip_processes
      add constraint npd_wip_processes_setup_cost_nonneg
      check (setup_cost >= 0);
  end if;
end $$;

-- D24/D42 defaults for process prefill.
alter table public.npd_process_defaults
  add column if not exists throughput_per_hour numeric(14, 4),
  add column if not exists throughput_uom text,
  add column if not exists setup_cost numeric(14, 4) not null default 0;

comment on column public.npd_process_defaults.throughput_per_hour is
  'NPD costing D24/D42 default: output throughput per hour copied to npd_wip_processes at prefill.';
comment on column public.npd_process_defaults.throughput_uom is
  'NPD costing D24/D42 default: output unit copied to npd_wip_processes at prefill.';
comment on column public.npd_process_defaults.setup_cost is
  'NPD costing D25 default: setup cost copied to npd_wip_processes at prefill.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'npd_process_defaults_throughput_nonneg'
       and conrelid = 'public.npd_process_defaults'::regclass
  ) then
    alter table public.npd_process_defaults
      add constraint npd_process_defaults_throughput_nonneg
      check (throughput_per_hour is null or throughput_per_hour >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'npd_process_defaults_setup_cost_nonneg'
       and conrelid = 'public.npd_process_defaults'::regclass
  ) then
    alter table public.npd_process_defaults
      add constraint npd_process_defaults_setup_cost_nonneg
      check (setup_cost >= 0);
  end if;
end $$;

-- D26/D27: org-level overhead/logistics parameters.
create table if not exists public.org_npd_cost_params (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  overhead_per_kg numeric(14, 6) not null default 0,
  logistics_per_box numeric(14, 6) not null default 0,
  updated_at timestamptz not null default now(),
  constraint org_npd_cost_params_overhead_nonneg check (overhead_per_kg >= 0),
  constraint org_npd_cost_params_logistics_nonneg check (logistics_per_box >= 0)
);

comment on table public.org_npd_cost_params is
  'NPD costing D26/D27: org-level overhead per kg and logistics per box, scoped by org_id/app.current_org_id().';
comment on column public.org_npd_cost_params.overhead_per_kg is
  'D26: overhead rate applied as overhead_per_kg * pack_weight_kg.';
comment on column public.org_npd_cost_params.logistics_per_box is
  'D27: logistics rate applied as logistics_per_box / packs_per_case.';

create or replace function public.org_npd_cost_params_set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists org_npd_cost_params_set_updated_at on public.org_npd_cost_params;
create trigger org_npd_cost_params_set_updated_at
  before update on public.org_npd_cost_params
  for each row execute function public.org_npd_cost_params_set_updated_at();

alter table public.org_npd_cost_params enable row level security;
alter table public.org_npd_cost_params force row level security;

drop policy if exists org_npd_cost_params_org_context on public.org_npd_cost_params;
create policy org_npd_cost_params_org_context
  on public.org_npd_cost_params
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.org_npd_cost_params from public;
revoke all on public.org_npd_cost_params from app_user;
grant select, insert, update on public.org_npd_cost_params to app_user;

revoke all on function public.org_npd_cost_params_set_updated_at() from public;
grant execute on function public.org_npd_cost_params_set_updated_at() to app_user;

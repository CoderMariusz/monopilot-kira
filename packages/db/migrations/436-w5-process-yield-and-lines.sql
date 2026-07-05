-- W5 L1: process yield, production line FKs, and crew snapshots.
-- Wave0 lock: org_id is the business scope; RLS remains on the existing tables.

alter table public.npd_wip_processes
  add column if not exists yield_pct numeric(6, 3) not null default 100;

update public.npd_wip_processes
   set yield_pct = 100
 where yield_pct is null;

alter table public.npd_wip_processes
  alter column yield_pct set default 100,
  alter column yield_pct set not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'npd_wip_processes_yield_pct_check'
       and conrelid = 'public.npd_wip_processes'::regclass
  ) then
    alter table public.npd_wip_processes
      add constraint npd_wip_processes_yield_pct_check
      check (yield_pct > 0 and yield_pct <= 100);
  end if;
end $$;

alter table public.wip_definition_processes
  add column if not exists yield_pct numeric(6, 3) not null default 100;

update public.wip_definition_processes
   set yield_pct = 100
 where yield_pct is null;

alter table public.wip_definition_processes
  alter column yield_pct set default 100,
  alter column yield_pct set not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'wip_definition_processes_yield_pct_check'
       and conrelid = 'public.wip_definition_processes'::regclass
  ) then
    alter table public.wip_definition_processes
      add constraint wip_definition_processes_yield_pct_check
      check (yield_pct > 0 and yield_pct <= 100);
  end if;
end $$;

alter table public.npd_projects
  add column if not exists production_line_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'npd_projects_production_line_id_fkey'
       and conrelid = 'public.npd_projects'::regclass
  ) then
    alter table public.npd_projects
      add constraint npd_projects_production_line_id_fkey
      foreign key (production_line_id)
      references public.production_lines (id);
  end if;
end $$;

alter table public.pilot_runs
  add column if not exists production_line_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'pilot_runs_production_line_id_fkey'
       and conrelid = 'public.pilot_runs'::regclass
  ) then
    alter table public.pilot_runs
      add constraint pilot_runs_production_line_id_fkey
      foreign key (production_line_id)
      references public.production_lines (id);
  end if;
end $$;

alter table public.wo_operations
  add column if not exists crew jsonb;

comment on column public.wo_operations.crew is
  'Crew snapshot as [{"role_group": text, "headcount": int}].';

alter table public.routing_operations
  add column if not exists crew jsonb,
  add column if not exists yield_pct numeric(6, 3) not null default 100;

update public.routing_operations
   set yield_pct = 100
 where yield_pct is null;

alter table public.routing_operations
  alter column yield_pct set default 100,
  alter column yield_pct set not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'routing_operations_yield_pct_check'
       and conrelid = 'public.routing_operations'::regclass
  ) then
    alter table public.routing_operations
      add constraint routing_operations_yield_pct_check
      check (yield_pct > 0 and yield_pct <= 100);
  end if;
end $$;

comment on column public.routing_operations.crew is
  'Crew definition as [{"role_group": text, "headcount": int}].';

comment on column public.routing_operations.cost_per_hour is
  'DEPRECATED: kept for legacy reads only; W5 resolves labor cost from crew and labor_rates.';

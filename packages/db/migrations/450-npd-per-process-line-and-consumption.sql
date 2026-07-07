-- Migration 450 — R4.1: per-process production line + ingredient consumption assignment.
-- Additive + idempotent. Do NOT apply from agent lanes — owner applies after review.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id() on existing tables.
-- Nullable columns: unassigned behaves exactly like today. NO data backfill.

alter table public.npd_wip_processes
  add column if not exists line_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'npd_wip_processes_line_id_fkey'
       and conrelid = 'public.npd_wip_processes'::regclass
  ) then
    alter table public.npd_wip_processes
      add constraint npd_wip_processes_line_id_fkey
      foreign key (line_id)
      references public.production_lines (id);
  end if;
end $$;

comment on column public.npd_wip_processes.line_id is
  'R4.1: production line for this WIP process (nullable = inherit project-level line).';

create index if not exists npd_wip_processes_line_id_idx
  on public.npd_wip_processes (line_id)
  where line_id is not null;

alter table public.formulation_ingredients
  add column if not exists npd_wip_process_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'formulation_ingredients_npd_wip_process_id_fkey'
       and conrelid = 'public.formulation_ingredients'::regclass
  ) then
    alter table public.formulation_ingredients
      add constraint formulation_ingredients_npd_wip_process_id_fkey
      foreign key (npd_wip_process_id)
      references public.npd_wip_processes (id)
      on delete set null;
  end if;
end $$;

comment on column public.formulation_ingredients.npd_wip_process_id is
  'R4.1: WIP process that consumes this formulation ingredient (nullable = unassigned).';

create index if not exists formulation_ingredients_npd_wip_process_id_idx
  on public.formulation_ingredients (npd_wip_process_id)
  where npd_wip_process_id is not null;

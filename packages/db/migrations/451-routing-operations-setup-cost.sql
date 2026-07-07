-- Migration 451 — R4.3: carry NPD monetary setup_cost onto routing_operations.
-- Additive + idempotent. Do NOT apply from agent lanes — owner applies after review.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id() on existing tables.
--
-- routing_operations already has setup_time_min (labor/setup duration in minutes).
-- npd_wip_processes.setup_cost is a fixed monetary cost per run (NPD costing D25) —
-- distinct from cost-preview's labor-derived setup (setup_time_min / 60 × rate).

alter table public.routing_operations
  add column if not exists setup_cost numeric(14, 4);

comment on column public.routing_operations.setup_cost is
  'R4.3: monetary setup cost per run from NPD process materialization (nullable; labor setup remains setup_time_min).';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'routing_operations_setup_cost_nonneg'
       and conrelid = 'public.routing_operations'::regclass
  ) then
    alter table public.routing_operations
      add constraint routing_operations_setup_cost_nonneg
      check (setup_cost is null or setup_cost >= 0);
  end if;
end $$;

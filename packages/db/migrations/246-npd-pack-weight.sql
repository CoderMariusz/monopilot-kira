-- Migration 246: 01-npd — Costing v2: pack weight (g) on npd_projects.
-- PRD: docs/prd/01-NPD-PRD.md §17.11.1 (formulation / costing) — quantity-per-pack model.
-- Wave0: org_id (not tenant_id). RLS already enforced on npd_projects (mig 242 family).
--
-- The recipe's batch size is the pack net weight (grams), captured in the
-- create-wizard / brief. Cost per kg = (raw cost per pack) / (pack weight in kg).
-- Idempotent (ADD COLUMN IF NOT EXISTS + guarded CHECK).

alter table public.npd_projects
  add column if not exists pack_weight_g numeric(12, 3);

-- Non-negative guard (added once; guarded so re-runs do not error).
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'npd_projects_pack_weight_nonneg'
       and conrelid = 'public.npd_projects'::regclass
  ) then
    alter table public.npd_projects
      add constraint npd_projects_pack_weight_nonneg
      check (pack_weight_g is null or pack_weight_g >= 0);
  end if;
end $$;

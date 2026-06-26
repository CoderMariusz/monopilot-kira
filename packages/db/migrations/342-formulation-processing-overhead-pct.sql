-- 342: per-recipe processing overhead % on formulation_versions.
-- Makes the processing overhead editable per recipe (previously a hard-coded 8%
-- constant in packages/domain/src/formulation/recompute-calc.ts). Additive +
-- idempotent: NULL keeps the existing 8% default behaviour for legacy rows.
alter table public.formulation_versions
  add column if not exists processing_overhead_pct numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'formulation_versions_processing_overhead_pct_check'
  ) then
    alter table public.formulation_versions
      add constraint formulation_versions_processing_overhead_pct_check
      check (processing_overhead_pct is null
             or (processing_overhead_pct >= 0 and processing_overhead_pct <= 100));
  end if;
end $$;

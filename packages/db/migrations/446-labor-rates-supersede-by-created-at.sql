-- Migration 446: allow labor-rate corrections (same role + effective_from) with
-- deterministic precedence — latest created_at wins at read time.
alter table public.labor_rates
  drop constraint if exists labor_rates_org_role_eff_unique;

create index if not exists idx_labor_rates_org_role_eff_created
  on public.labor_rates (org_id, role_group, effective_from desc, created_at desc);

-- Migration 440 — W2-T1 unified Settings "Processes" screen: extend npd_process_defaults.
--
-- Additive + idempotent only. Do NOT apply from agent lanes — owner applies after review.
-- Wave0 lock: org_id business scope; RLS (mig 390 org_context policy) untouched.
--
-- Per locked owner decisions 2026-07-06 (_meta/plans/2026-07-06-consolidation-waves.md W2-T1):
--   * setup_cost / throughput_per_hour / throughput_uom were ALREADY added by mig 429
--     (D24/D42 prefill defaults) — restated here idempotently per the W2 M-A column list,
--     no-ops on any database that has 429 applied.
--   * yield_pct       — default process yield % (mirrors npd_wip_processes.yield_pct, mig 436).
--   * prefix          — auto-numbered per ManufacturingOperations.process_suffix
--                       (PREP-01, PREP-02, …), manual override allowed; unique per org.
--   * cost_overridden — standard_cost becomes derived-with-override: false ⇒ standard_cost is
--                       Σ(role default_headcount × labor_rates.rate_per_hour) computed at save;
--                       true ⇒ the admin typed it, and it survives later labor-rate changes.

alter table public.npd_process_defaults
  add column if not exists setup_cost numeric(14, 4) not null default 0,
  add column if not exists throughput_per_hour numeric(14, 4),
  add column if not exists throughput_uom text,
  add column if not exists yield_pct numeric(6, 3) not null default 100,
  add column if not exists prefix text,
  add column if not exists cost_overridden boolean not null default false;

comment on column public.npd_process_defaults.yield_pct is
  'W2-T1 default: process yield % (0 < yield_pct <= 100) copied to npd_wip_processes at prefill.';
comment on column public.npd_process_defaults.prefix is
  'W2-T1: process code, auto-numbered per ManufacturingOperations.process_suffix (e.g. PREP-01); manual override allowed.';
comment on column public.npd_process_defaults.cost_overridden is
  'W2-T1: false = standard_cost derived as sum(default_headcount * labor_rates.rate_per_hour) at save; true = manual override.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'npd_process_defaults_yield_pct_check'
       and conrelid = 'public.npd_process_defaults'::regclass
  ) then
    alter table public.npd_process_defaults
      add constraint npd_process_defaults_yield_pct_check
      check (yield_pct > 0 and yield_pct <= 100);
  end if;
end $$;

-- Auto-numbering relies on prefixes being unique inside an org (manual overrides included).
-- Partial: rows configured before this migration keep prefix NULL until first re-save.
create unique index if not exists npd_process_defaults_org_prefix_unique
  on public.npd_process_defaults (org_id, prefix)
  where prefix is not null;

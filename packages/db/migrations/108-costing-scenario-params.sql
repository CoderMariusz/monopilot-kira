-- T-073 (rework): persist what-if scenario PARAMETERS.
-- PRD: docs/prd/01-NPD-PRD.md §17.11.3 — a scenario must be retrievable by
-- name AND parameters. The original 087-costing schema stored only the computed
-- snapshot (raw_cost/margin/target_price); the slider input parameters were
-- discarded. This adds a JSONB column to hold the exact input parameter set.
--
-- Wave0 lock: org_id business scope; RLS via app.current_org_id() (already
-- enforced on public.costing_breakdowns by 087 — this only adds a column, the
-- existing policy/grants continue to govern access).

alter table public.costing_breakdowns
  add column if not exists params jsonb;

comment on column public.costing_breakdowns.params is
  'T-073: exact what-if input parameter set (rawCostEur, yieldPct, processLabourEur, '
  'packagingEur, overheadEur, logisticsEur, marginPct, distributorMarkupPct, '
  'retailMarkupPct) as decimal strings — never JS floats. Null for legacy rows.';

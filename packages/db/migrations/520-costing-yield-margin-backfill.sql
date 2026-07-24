-- Migration 520: costing margin semantics + formulation yield invariant.
-- Idempotent data repair: legacy yield 0 becomes NULL ("not provided" = 100%
-- no-loss behavior), and legacy waterfall step 9 revenue becomes margin.

do $$
declare
  v_zero_yields bigint;
  v_cost_caches bigint;
  v_margin_steps bigint;
begin
  update public.formulation_versions
     set target_yield_pct = null
   where target_yield_pct = 0;
  get diagnostics v_zero_yields = row_count;
  raise notice '520: normalized % zero-yield formulation version(s) to NULL', v_zero_yields;

  -- Existing cache rows predate the yieldValid contract. Their non-null
  -- costPerKg was computed with the old NULL/0 = no-loss behavior, which the
  -- zero->NULL repair above intentionally preserves as valid 100% yield.
  update public.formulation_calc_cache cache
     set cost_json = cache.cost_json || '{"yieldValid":true}'::jsonb
    from public.formulation_versions fv
   where fv.id = cache.version_id
     and not (cache.cost_json ? 'yieldValid')
     and cache.cost_json ? 'costPerKg'
     and cache.cost_json -> 'costPerKg' <> 'null'::jsonb
     and (
       fv.target_yield_pct is null
       or (fv.target_yield_pct > 0 and fv.target_yield_pct <= 100)
     );
  get diagnostics v_cost_caches = row_count;
  raise notice '520: marked % legacy formulation cost cache(s) with yieldValid=true', v_cost_caches;

  with legacy_margin as (
    select margin_step.id,
           breakdown.target_price_eur - total_step.value_eur as margin_eur,
           breakdown.margin_pct
      from public.costing_waterfall_steps margin_step
      join public.costing_breakdowns breakdown
        on breakdown.id = margin_step.breakdown_id
      join public.costing_waterfall_steps total_step
        on total_step.breakdown_id = margin_step.breakdown_id
       and total_step.step_index = 8
       and total_step.step_name = 'Total cost'
     where margin_step.step_index = 9
       and margin_step.step_name = 'Margin vs target price'
       -- Old step 9 stored target revenue verbatim. This predicate prevents
       -- rewriting already-recomputed rows or unrelated custom data.
       and margin_step.value_eur = breakdown.target_price_eur
  )
  update public.costing_waterfall_steps step
     set value_eur = legacy.margin_eur,
         delta_pct = legacy.margin_pct
    from legacy_margin legacy
   where step.id = legacy.id;
  get diagnostics v_margin_steps = row_count;
  raise notice '520: converted % legacy waterfall margin step(s)', v_margin_steps;

  if exists (
    select 1
      from public.formulation_versions
     where target_yield_pct = 0
  ) then
    raise exception '520: zero target_yield_pct rows remain';
  end if;

  if exists (
    select 1
      from public.costing_waterfall_steps margin_step
      join public.costing_breakdowns breakdown
        on breakdown.id = margin_step.breakdown_id
      join public.costing_waterfall_steps total_step
        on total_step.breakdown_id = margin_step.breakdown_id
       and total_step.step_index = 8
       and total_step.step_name = 'Total cost'
     where margin_step.step_index = 9
       and margin_step.step_name = 'Margin vs target price'
       and margin_step.value_eur = breakdown.target_price_eur
       and total_step.value_eur <> 0
  ) then
    raise exception '520: legacy waterfall margin rows remain';
  end if;
end $$;

alter table public.formulation_versions
  drop constraint if exists formulation_versions_target_yield_pct_check;

alter table public.formulation_versions
  add constraint formulation_versions_target_yield_pct_check
  check (target_yield_pct is null or (target_yield_pct > 0 and target_yield_pct <= 100));

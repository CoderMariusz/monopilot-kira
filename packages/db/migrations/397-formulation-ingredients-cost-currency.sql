-- 397-formulation-ingredients-cost-currency.sql
-- DB cleanup audit Phase 2 — carry the real currency of a recipe ingredient's cost
-- alongside the amount. formulation_ingredients.cost_per_kg_eur is misnamed: it stores
-- whatever currency the source cost was in (GBP via list_price_gbp, PLN via item_cost_history),
-- NOT necessarily EUR. cost_currency records the actual currency so the costing waterfall can
-- display the true currency and flag mixed-currency recipes instead of silently labelling EUR.
-- Additive + nullable (legacy rows stay NULL = "unknown, treat as the org default").
alter table public.formulation_ingredients
  add column if not exists cost_currency text;

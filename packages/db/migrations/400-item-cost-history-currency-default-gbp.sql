-- 400-item-cost-history-currency-default-gbp.sql
-- DB cleanup audit (owner decision: GBP single currency, no FX). Switch the default
-- currency for NEW item cost-history entries from 'PLN' to 'GBP'. Existing rows are left
-- as-is (historical record); any insert without an explicit currency now records GBP, so
-- v_item_effective_cost (mig 396) and all cost consumers resolve in GBP.
alter table public.item_cost_history alter column currency set default 'GBP';

-- Migration 310: Wave E7 — add 'disassembly_allocation' to item_cost_history.source.
-- registerDisassemblyOutput allocates an input LP's cost across N co-products; that ledger
-- write needs its own source value (was temporarily writing 'variance_roll').
alter table public.item_cost_history drop constraint if exists item_cost_history_source_check;
alter table public.item_cost_history add constraint item_cost_history_source_check
  check (source is null or source = any (array['manual','d365_sync','supplier_update','variance_roll','disassembly_allocation']));

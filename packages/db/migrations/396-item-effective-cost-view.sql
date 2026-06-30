-- 396-item-effective-cost-view.sql
-- DB cleanup audit Phase 2 — single source of truth for an item's INTERNAL / standard
-- cost (recipe BOM cost, portfolio cost, NPD costing waterfall). Consolidates the
-- scattered, inconsistent reads (items.cost_per_kg [opaque currency], items.list_price_gbp
-- [GBP], item_cost_history [currency-bearing ledger]) into one view so every consumer
-- resolves the same amount the same way AND carries the real currency — ending the
-- GBP/PLN-silently-labelled-EUR class of rozjazd.
--   Priority: item_cost_history active row (the ledger SoT, with currency) -> items.list_price_gbp (GBP).
--   items.cost_per_kg is intentionally NOT a source: it is a denormalised write-through cache
--   of item_cost_history with no currency of its own.
-- Set-based callers JOIN this view; per-item / date-specific callers should resolve
-- from the same ledger (item_cost_history, e.g. write-cost-ledger.ts). A shared TS
-- resolver that wraps both is a planned follow-up.
-- SECURITY INVOKER so items / item_cost_history RLS (org scoping) applies to the caller.
create or replace view public.v_item_effective_cost
  with (security_invoker = true)
as
select i.org_id,
       i.id        as item_id,
       i.item_code,
       coalesce(ch.cost_per_kg, i.list_price_gbp)                          as amount,
       case when ch.cost_per_kg   is not null then nullif(trim(ch.currency), '')
            when i.list_price_gbp is not null then 'GBP'
            else null end                                                  as currency,
       case when ch.cost_per_kg   is not null then 'cost_history'
            when i.list_price_gbp is not null then 'list_price'
            else 'none' end                                                as source
  from public.items i
  left join lateral (
    select ch.cost_per_kg, ch.currency
      from public.item_cost_history ch
     where ch.org_id = i.org_id
       and ch.item_id = i.id
       and ch.effective_to is null
     order by ch.effective_from desc
     limit 1
  ) ch on true;

grant select on public.v_item_effective_cost to app_user;

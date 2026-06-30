-- 405-effective-cost-reads-supplier-spec.sql
-- "One price" single-source (owner): a supplied item's price is owned by
-- supplier_specs.unit_price. Extend v_item_effective_cost to read it as a source tier so
-- the SAME value feeds both the PO prefill (getItemSupplierPrice already reads supplier_specs)
-- AND recipe/BOM/portfolio cost (this view) — no duplication, and a wizard-created item whose
-- price lives on its supplier spec no longer falls through to a missing list_price.
-- Priority: item_cost_history (explicit internal cost ledger) -> supplier_specs.unit_price
-- (active+approved, latest effective purchase price) -> items.list_price_gbp (fallback).
create or replace view public.v_item_effective_cost
  with (security_invoker = true)
as
select i.org_id,
       i.id        as item_id,
       i.item_code,
       coalesce(ch.cost_per_kg, ss.unit_price, i.list_price_gbp)            as amount,
       case when ch.cost_per_kg   is not null then nullif(trim(ch.currency), '')
            when ss.unit_price    is not null then coalesce(nullif(trim(ss.price_currency), ''), 'GBP')
            when i.list_price_gbp is not null then 'GBP'
            else null end                                                  as currency,
       case when ch.cost_per_kg   is not null then 'cost_history'
            when ss.unit_price    is not null then 'supplier_spec'
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
  ) ch on true
  left join lateral (
    select ss.unit_price, ss.price_currency
      from public.supplier_specs ss
     where ss.org_id = i.org_id
       and ss.item_id = i.id
       and ss.lifecycle_status = 'active'
       and ss.review_status = 'approved'
       and ss.unit_price is not null
     order by ss.effective_from desc nulls last, ss.updated_at desc nulls last
     limit 1
  ) ss on true;

grant select on public.v_item_effective_cost to app_user;

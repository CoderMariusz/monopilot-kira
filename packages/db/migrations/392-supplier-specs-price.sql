-- Migration 392 — supplier_specs versioned purchase price (owner 2026-06-30).
--
-- A PO line's unit_price should be copied from the supplier's price for that item, and that price
-- can change over time (spec v1 valid until 20.09 at 1.2, spec v2 from 21.09 at 1.45). supplier_specs
-- already carries effective_from + expiry_date (mig 162) and is the item↔supplier link, so the price
-- belongs on the spec: a PO created on date D uses the active+approved spec whose validity window
-- covers D. This adds the missing price + currency columns. The PO-line pre-fill then resolves the
-- effective spec price (falling back to items.list_price_gbp when no spec price is set).
--
-- ADDITIVE, idempotent. Money: non-negative check, numeric(12,4) to match purchase_order_lines.unit_price.

alter table public.supplier_specs
  add column if not exists unit_price numeric(12,4),
  add column if not exists price_currency text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'supplier_specs_unit_price_nonneg'
       and conrelid = 'public.supplier_specs'::regclass
  ) then
    alter table public.supplier_specs
      add constraint supplier_specs_unit_price_nonneg check (unit_price is null or unit_price >= 0);
  end if;
end $$;

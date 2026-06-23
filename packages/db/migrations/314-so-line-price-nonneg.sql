-- SO line pricing now comes from items.list_price_gbp (resolveSalesLinePrice), which is 0 when an item has no
-- list price set yet. The original CHECK (unit_price_gbp > 0) made createSalesOrder CRASH for such items.
-- Relax to >= 0 (a draft line with an unpriced item is valid; price is set before confirm).
-- Applied live via Supabase MCP 2026-06-24; file added for repo/DB parity.

alter table public.sales_order_lines drop constraint if exists sales_order_lines_price_check;
alter table public.sales_order_lines
  add constraint sales_order_lines_price_check check (unit_price_gbp >= 0);

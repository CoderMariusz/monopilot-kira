-- Sales price on the item master (owner-decided: SO line price comes "from the product card",
-- with a resolver seam for a future per-customer price list). Nullable; cost_per_kg stays the COST.
-- Applied live via Supabase MCP 2026-06-23; file added for repo/DB parity.

alter table public.items
  add column if not exists list_price_gbp numeric;

comment on column public.items.list_price_gbp is
  'Default sell/list price per base UoM (GBP). Source for sales-order line pricing via resolveSalesLinePrice(); a future per-customer price list overrides this.';

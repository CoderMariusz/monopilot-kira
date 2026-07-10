-- 465: WAC valuation is GBP-only (wave-1); non-GBP PO receipts are rejected with
-- unsupported_currency. Flip the column DEFAULTs from 'EUR' to 'GBP' so the default
-- supplier→PO path creates receivable orders. Additive, live-safe, no data rewrite.
alter table public.suppliers alter column currency set default 'GBP';
alter table public.purchase_orders alter column currency set default 'GBP';

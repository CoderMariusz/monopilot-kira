-- 461-seed-trading-currencies.sql
-- WAC per-currency pools (item_wac_state.currency_id) require rows in public.currencies.
-- Mig 406 seeded GBP only; EUR/USD PO receipts failed with currency_id NOT NULL when the
-- upsert subquery returned NULL. Idempotent additive seed for common trading currencies.

do $$
declare
  v_inserted int;
begin
  insert into public.currencies (code, name)
  values
    ('EUR', 'Euro'),
    ('USD', 'US Dollar'),
    ('PLN', 'Zloty'),
    ('CHF', 'Swiss Franc'),
    ('CZK', 'Czech Koruna'),
    ('SEK', 'Swedish Krona'),
    ('NOK', 'Norwegian Krone'),
    ('DKK', 'Danish Krone'),
    ('HUF', 'Forint'),
    ('RON', 'Romanian Leu')
  on conflict (code) do nothing;

  get diagnostics v_inserted = row_count;
  raise notice '461-seed-trading-currencies: % new currency row(s) inserted', v_inserted;
end $$;

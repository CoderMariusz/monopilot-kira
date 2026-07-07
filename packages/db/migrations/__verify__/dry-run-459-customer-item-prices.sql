-- Dry-run probes for migration 459-customer-item-prices.sql
-- Run: psql ... -v ON_ERROR_STOP=1 -f this-file.sql
-- End with rollback; PASS probe must succeed, FAIL probe must error.

begin;

\i packages/db/migrations/459-customer-item-prices.sql

-- PASS: table exists with expected columns
select column_name
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'customer_item_prices'
   and column_name in ('org_id', 'customer_id', 'item_id', 'unit_price', 'currency', 'effective_from', 'effective_to');

-- PASS: RLS enabled
select relrowsecurity, relforcerowsecurity
  from pg_class
 where oid = 'public.customer_item_prices'::regclass;

-- FAIL probe (must NOT run past rollback): negative unit_price rejected
-- insert into public.customer_item_prices (org_id, customer_id, item_id, unit_price)
-- values ('00000000-0000-4000-8000-000000000001'::uuid,
--         '00000000-0000-4000-8000-000000000002'::uuid,
--         '00000000-0000-4000-8000-000000000003'::uuid,
--         -1);

rollback;

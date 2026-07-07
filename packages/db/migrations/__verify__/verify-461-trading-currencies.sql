-- Verification — 461 trading-currency seed. Self-rolling-back dry-run against live Postgres.
-- Run: psql "$DATABASE_URL_OWNER" -v ON_ERROR_STOP=1 -f packages/db/migrations/__verify__/verify-461-trading-currencies.sql

\set ON_ERROR_STOP on

begin;

-- ── migration body (461) ─────────────────────────────────────────────────────
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

-- ── PROBE PASS: EUR currency_id resolves for item_wac_state ────────────────
do $$
declare
  v_org_id uuid;
  v_eur_id uuid;
  v_item_id uuid := gen_random_uuid();
begin
  select id into v_eur_id from public.currencies where code = 'EUR';
  if v_eur_id is null then
    raise exception 'PROBE FAIL: EUR currency_id is null after 461 seed';
  end if;

  select o.id into v_org_id from public.organizations o limit 1;
  if v_org_id is null then
    raise notice 'PROBE SKIP: no organizations row — EUR id % resolves (subquery non-null)', v_eur_id;
    return;
  end if;

  insert into public.item_wac_state (org_id, item_id, currency_id, total_qty_kg, total_value)
  values (v_org_id, v_item_id, v_eur_id, 1, 1);

  raise notice 'PROBE OK: item_wac_state insert with EUR currency_id succeeded';
end $$;

-- ── PROBE PASS: upsert-wac subquery shape returns non-null for EUR ─────────
do $$
declare
  v_subquery_id uuid;
begin
  select (select id from public.currencies where code = 'EUR') into v_subquery_id;
  if v_subquery_id is null then
    raise exception 'PROBE FAIL: upsert-wac EUR subquery returned NULL';
  end if;
  raise notice 'PROBE OK: upsert-wac EUR subquery resolves to %', v_subquery_id;
end $$;

-- ── PROBE FAIL-GUARD: genuinely unknown codes stay absent ──────────────────
do $$
declare
  v_fake_id uuid;
begin
  select id into v_fake_id from public.currencies where code = 'ZZZ';
  if v_fake_id is not null then
    raise exception 'PROBE FAIL: ZZZ must not exist in currencies';
  end if;
  raise notice 'PROBE OK: unknown currency ZZZ correctly absent';
end $$;

rollback;

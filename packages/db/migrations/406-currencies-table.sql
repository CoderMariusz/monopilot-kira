-- 406-currencies-table.sql
-- WAC valuation prerequisite: item_wac_state.currency_id is a NOT-NULL soft FK
-- with no target table. Create the canonical currency lookup and seed GBP
-- (single-currency decision, no FX). Idempotent so the Vercel migrate gate can
-- re-run it safely after an out-of-band MCP apply.

create table if not exists public.currencies (
  id uuid primary key default gen_random_uuid(),
  code char(3) not null unique check (code ~ '^[A-Z]{3}$'),
  name text not null,
  created_at timestamptz not null default now()
);

grant select on public.currencies to app_user;

insert into public.currencies (code, name)
values ('GBP', 'Pound Sterling')
on conflict (code) do nothing;

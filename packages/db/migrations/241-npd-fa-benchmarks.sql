-- Migration 241: 01-NPD FA Core tab — multi-benchmark editor (fa_benchmarks).
--
-- Replaces the SINGLE Core "Benchmark" field (product.benchmark, seeded as the
-- Reference.DeptColumns(Core) row column_key='Benchmark' in mig 238) with a real
-- per-FG benchmark table: a repeatable list of {label, price} rows per Factory
-- Article. The separate single "Price (Brief)" field (product.price_brief /
-- DeptColumns column_key='Price_Brief') is left AS-IS.
--
-- Prototype parity source:
--   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:513-514
--   (Core form-grid "Benchmark" + "Price (Brief)" fields) — the user wants the
--   single Benchmark <input> to become a multi-row {benchmark, price} list with
--   "+ Add benchmark".
--
-- Pattern mirror: packages/db/migrations/232-npd-packaging-components.sql
--   (org-scoped per-FG child table, FORCE RLS, single org_context policy, R13
--   audit cols, module-local updated_at trigger, revoke-then-grant DML).
--
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via
-- app.current_org_id(). The product PK is per-org (mig 142), so the FK is the
-- composite (org_id, product_code) -> product(org_id, product_code) — the same
-- shape mig 144 / mig 144-closeout use.
--
-- Supabase-applyable: no superuser ops (no CREATE EXTENSION, no LEAKPROOF, no
-- owner change, no shared app.* trigger fn). Module-local updated_at trigger.
-- Idempotent throughout (create table if not exists, guarded constraints,
-- create-or-replace fn, drop-if-exists trigger/policy, idempotent DELETE).
--
-- NOTE: the migration runner (scripts/migrate.ts) wraps each file in its own
-- transaction, so this file must NOT open/close one itself.

-- ============================================================
-- 1. Table DDL — public.fa_benchmarks (per-FG {label, price} rows)
-- ============================================================
create table if not exists public.fa_benchmarks (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id),
  product_code  text not null,
  label         text not null,
  price         numeric(12, 2),
  display_order integer not null default 0,
  -- Audit (R13)
  created_at    timestamptz not null default pg_catalog.now(),
  updated_at    timestamptz not null default pg_catalog.now(),
  created_by    uuid references public.users(id),
  updated_by    uuid references public.users(id)
);

-- Composite FK to the per-org product PK (mig 142 made product PK (org_id, product_code)).
-- Guarded so re-running the migration does not error if the FK already exists.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fa_benchmarks_product_fk'
  ) then
    alter table public.fa_benchmarks
      add constraint fa_benchmarks_product_fk
      foreign key (org_id, product_code)
      references public.product (org_id, product_code)
      on delete cascade;
  end if;
end
$$;

-- Non-negative price CHECK (price is nullable; NULL passes).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fa_benchmarks_price_nonneg'
  ) then
    alter table public.fa_benchmarks
      add constraint fa_benchmarks_price_nonneg
      check (price is null or price >= 0);
  end if;
end
$$;

-- ============================================================
-- 2. Index — (org_id, product_code) hot read path
-- ============================================================
create index if not exists fa_benchmarks_org_product_idx
  on public.fa_benchmarks (org_id, product_code);

-- ============================================================
-- 3. Module-local updated_at trigger (no shared app.set_updated_at in this repo)
-- ============================================================
create or replace function public.npd_fa_benchmarks_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists fa_benchmarks_set_updated_at on public.fa_benchmarks;
create trigger fa_benchmarks_set_updated_at
  before update on public.fa_benchmarks
  for each row execute function public.npd_fa_benchmarks_set_updated_at();

-- ============================================================
-- 4. RLS — enable + FORCE, single org_context policy (using + with check)
-- ============================================================
alter table public.fa_benchmarks enable row level security;
alter table public.fa_benchmarks force row level security;

drop policy if exists fa_benchmarks_org_context on public.fa_benchmarks;
create policy fa_benchmarks_org_context
  on public.fa_benchmarks
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- ============================================================
-- 5. Grants — fail-closed default; app_user gets DML only
-- ============================================================
revoke all on public.fa_benchmarks from public;
revoke all on public.fa_benchmarks from app_user;
grant select, insert, update, delete on public.fa_benchmarks to app_user;

comment on table public.fa_benchmarks
  is 'NPD FA Core tab multi-benchmark rows per Factory Article (per-org product_code). org_id isolated by app.current_org_id(); supersedes the single product.benchmark Core field. price is numeric(12,2) non-negative (nullable).';

-- ============================================================
-- 6. Remove the now-superseded single "Benchmark" Core DeptColumn so the single
--    field stops rendering. Idempotent (DELETE of a non-existent row is a no-op).
--    The product.benchmark column stays (unused) — never edit applied mig 238.
--    The separate 'Price_Brief' Core column is intentionally LEFT in place.
-- ============================================================
delete from "Reference"."DeptColumns"
  where dept_code = 'Core' and column_key = 'Benchmark';

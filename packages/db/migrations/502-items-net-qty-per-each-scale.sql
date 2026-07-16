-- 502-items-net-qty-per-each-scale.sql
-- C047 / R2-E: net_qty_per_each was numeric(12,4) (migration 267) — six-decimal
-- pack weights (e.g. 0.333333 kg/each) were silently truncated at storage.
-- Expand to numeric(18,6) for parity with cost_per_kg and NPD backfill (388).
-- Idempotent: ALTER TYPE is safe to re-run when already at target scale.

alter table public.items
  alter column net_qty_per_each type numeric(18, 6);

comment on column public.items.net_qty_per_each is
  'Net quantity per each in uom_base (numeric 18,6 — max 6 decimal places).';

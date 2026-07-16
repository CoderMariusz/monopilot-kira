-- 503-routing-operation-numeric-scale.sql
-- C042 / R2-E: routing_operations.run_time_per_unit_sec was numeric(10,2) and
-- cost_per_hour numeric(10,4) (migration 163) — audit values like 3.333333 /
-- 27.654321 were silently truncated. Expand both to numeric(18,6) for parity
-- with items.net_qty_per_each (502). Idempotent ALTER TYPE.

alter table public.routing_operations
  alter column run_time_per_unit_sec type numeric(18, 6),
  alter column cost_per_hour type numeric(18, 6);

comment on column public.routing_operations.run_time_per_unit_sec is
  'Run duration per output unit in seconds (numeric 18,6 — max 6 decimal places).';

comment on column public.routing_operations.cost_per_hour is
  'Labour rate per hour for this operation (numeric 18,6 — max 6 decimal places).';

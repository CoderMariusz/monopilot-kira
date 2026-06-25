-- 336: persistent over-production flag on work_orders.
--
-- Owner decision (2026-06-25): mass-balance over-production is NEVER a hard block —
-- it is a significant WARNING plus the WO is FLAGGED in the system so over-produced
-- work orders are visible on the list/detail. register-output sets this flag (in the
-- same transaction as the output) whenever the mass-balance warn tier fires (registered
-- output exceeds what the yield-adjusted consumed input could produce). Idempotent:
-- once flagged the WO stays flagged; reversing/voiding an output does not clear it
-- (the over-production event still happened and is part of the record).
--
-- Fast, no table rewrite: a constant default + a nullable timestamptz are metadata-only
-- in PostgreSQL 11+. work_orders already carries org_id + RLS + app_user grants, so no
-- policy/grant change is required.

alter table public.work_orders
  add column if not exists over_production_flagged boolean not null default false,
  add column if not exists over_production_flagged_at timestamptz;

comment on column public.work_orders.over_production_flagged is
  'True when an output registration tripped the mass-balance over-production warning. Owner policy: warn + flag, never block. Idempotent; not cleared on output void.';
comment on column public.work_orders.over_production_flagged_at is
  'Timestamp of the first over-production warning that flagged this WO.';

-- Migration 321: reconciliation follow-up for the 288 / 289 in-place edits.
--
-- Migrations 288 (shipping SO core) and 289 (HACCP core) were edited in-place by
-- the wave-10 closures commit (9fc9a032) AFTER they had already been applied. That
-- broke the migrate runner's checksum gate (`Applied migrations must never be
-- edited`) and ERRORed every Vercel deploy since 9fc9a032 — the live site was
-- stuck on the last green build. Those two files have now been restored to their
-- exact applied originals; the intended forward changes from that edit are
-- re-expressed here as a new ADDITIVE migration so the live DB and any fresh /
-- wiped DB converge to the same final state.
--
-- 1) 288 follow-up — grant the sales_orders sequence to app_user. Migration 211's
--    sales_orders.order_seq default draws from public.sales_order_seq, but no
--    migration ever granted it, so the INSERT grant in 288 was unusable
--    (permission denied for sequence). Idempotent; guarded for fresh DBs.
-- 2) 289 follow-up — an active HACCP CCP must carry at least one critical limit.
--    Verified 0 violating rows live before adding, so the constraint is validated.

do $$
begin
  if to_regclass('public.sales_order_seq') is not null then
    grant usage, select on sequence public.sales_order_seq to app_user;
  end if;
end
$$;

alter table public.haccp_ccps
  drop constraint if exists haccp_ccps_active_limit_required_check;

alter table public.haccp_ccps
  add constraint haccp_ccps_active_limit_required_check check (
    not is_active or critical_limit_min is not null or critical_limit_max is not null
  );

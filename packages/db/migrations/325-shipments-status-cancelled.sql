-- Migration 325: allow 'cancelled' on shipments.status (shipping reversal — cancelShipment).
--
-- The wave-10 shipping core (mig 211) constrained shipments.status to
-- pending|packing|packed|manifested|shipped|delivered|exception. cancelShipment
-- (owner Q8 shipping-reverse) writes status='cancelled' → 23514 without this.
-- Scoped to shipments.status ONLY per the 2026-06-24 adversarial review: the LP
-- status-domain / lp_state_history additions Codex first proposed are NOT needed
-- (after the review fix, cancelShipment only restores LPs shipped→available, which
-- is already a legal LP state). Applied live via Supabase MCP; idempotent.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shipments_status_check'
      and pg_get_constraintdef(oid) like '%cancelled%'
  ) then
    alter table public.shipments drop constraint shipments_status_check;
    alter table public.shipments add constraint shipments_status_check
      check (status in ('pending','packing','packed','manifested','shipped','delivered','exception','cancelled'));
  end if;
end $$;

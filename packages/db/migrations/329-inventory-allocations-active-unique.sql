-- Migration 329: defense-in-depth unique index for active inventory allocations.
--
-- allocateSalesOrder (shipping/_actions/so-actions.ts) could DOUBLE-allocate on a
-- network retry / double-click: the FOR UPDATE lock only blocked CONCURRENT
-- allocators, not a retry of the same op, and there was no DB constraint to stop a
-- second INSERT into inventory_allocations + a second reserved_qty increment ->
-- permanent over-reservation. The primary fix is a `SELECT status ... FOR UPDATE`
-- on the sales_order row (so a retry re-reads 'allocated' and fails the transition
-- gate before any write); this partial unique index is the DB-level backstop:
-- at most one ACTIVE (not deleted, not cancelled) allocation per
-- (sales_order_line_id, license_plate_id).
--
-- Verified live before creating: zero existing duplicate active allocations.
-- Applied live via Supabase MCP 2026-06-24; idempotent. Found by the exhaustive
-- bug-audit workflow (shipping confirmed bug #4).
create unique index if not exists inventory_allocations_line_lp_active_uidx
  on public.inventory_allocations (sales_order_line_id, license_plate_id)
  where deleted_at is null and status <> 'cancelled';

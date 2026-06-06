-- Migration 248: add the 'ingredient' item_type (ING) to the item master.
-- PRD: docs/prd/03-TECHNICAL-PRD.md §5.1, §6.1 (item_type domain).
-- APPLIED LIVE: orchestrator MCP → Supabase project khjvkhzwfzuwzrusgobp.
--
-- An ingredient is a raw material used in production/BOMs but classified and
-- accounted SEPARATELY from raw materials ('rm'). It is therefore usable as a
-- BOM/production component (alongside 'rm', 'intermediate', 'co_product') but
-- carries its own item_type so accounting/rollups can distinguish it.
--
-- This migration only WIDENS two CHECK constraints — it adds a new allowed
-- value and never drops or rewrites data. Idempotent: re-running drops the
-- constraint (if present) and recreates it with the widened domain.
--
-- Wave0 lock: org_id is the business scope; RLS via app.current_org_id() is
-- unaffected (this touches CHECK constraints only).

-- public.items.item_type — the canonical item-type domain.
alter table public.items
  drop constraint if exists items_item_type_check;

alter table public.items
  add constraint items_item_type_check
  check (item_type in ('rm', 'ingredient', 'intermediate', 'fg', 'co_product', 'byproduct'));

-- public.work_orders.item_type_at_creation — snapshot of the produced item's
-- type at WO creation (migration 176). Kept in sync with the items domain.
alter table public.work_orders
  drop constraint if exists work_orders_item_type_at_creation_check;

alter table public.work_orders
  add constraint work_orders_item_type_at_creation_check
  check (item_type_at_creation in ('rm', 'ingredient', 'intermediate', 'fg', 'co_product', 'byproduct'));

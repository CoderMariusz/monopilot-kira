-- Migration 417 — DRAFT (do not apply; orchestrator applies migrations)
-- Partial unique index: at most one live default address per (org, customer, type).
--
-- Why include deleted_at IS NULL:
--   soft-deleted rows (deleted_at IS NOT NULL) are inactive records kept for
--   audit/history. They must NOT block a new default being set on the same
--   (org_id, customer_id, address_type) tuple, so we exclude them from the
--   uniqueness constraint.  The application already sets is_default = false on
--   deactivation, but the index guard covers any edge-case where that clear
--   races or is bypassed.

create unique index if not exists customer_addresses_one_default_uq
  on public.customer_addresses (org_id, customer_id, address_type)
  where is_default = true
    and deleted_at is null;

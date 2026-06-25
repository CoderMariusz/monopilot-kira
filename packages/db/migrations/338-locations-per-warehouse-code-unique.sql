-- mig-338: per-warehouse location code uniqueness (owner-blocked 2026-06-25)
-- Owner hit a hard wall during the onboarding walk: could not create a location with
-- the same code in a SECOND warehouse, because the unique key was UNIQUE(org_id, code)
-- — org-global. Locations are warehouse-scoped (warehouse_id is already NOT NULL), so
-- the same human code ("RECEIVING", "A1", ...) SHOULD be reusable per warehouse.
-- Swap the constraint to (org_id, warehouse_id, code). This is strictly MORE permissive
-- than the old key, so every existing row stays valid (no backfill / dedupe needed).
-- barcode stays org-global (locations_org_barcode_uq) — a scannable barcode must be
-- unique org-wide so a scan resolves to exactly one bin.
-- Applied live to project khjvkhzwfzuwzrusgobp on 2026-06-25 and verified.
-- DO NOT EDIT after apply (checksum gate) — superseding changes go in a new migration.

alter table public.locations drop constraint locations_org_id_code_key;
alter table public.locations
  add constraint locations_org_wh_code_key unique (org_id, warehouse_id, code);

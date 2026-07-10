-- Migration 467: defense-in-depth — at most one open cost-history row per item.
--
-- writeItemCostLedger serializes interval surgery via a per-(org,item) advisory
-- xact lock before reading anchors. This partial unique index is the DB backstop
-- against overlapping open intervals if two writers ever race past the lock.

create unique index if not exists item_cost_history_org_item_open_uidx
  on public.item_cost_history (org_id, item_id)
  where effective_to is null;

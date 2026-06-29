-- Migration 388 — NPD v2 S2 completion: backfill items.net_qty_per_each for NPD FGs.
--
-- The per-box WO consumption scaling (owner decision D8, slice S2-WO) computes
--   kg_per_box = items.each_per_box × items.net_qty_per_each
-- and scales per-box BOM lines by NUMBER OF BOXES = plannedBaseQty / kg_per_box. mig 387 stamped
-- each_per_box from packs_per_case, but NPD FGs whose item row was created BEFORE their pack
-- weight was set have net_qty_per_each = NULL (e.g. FG-NPD-012). With a NULL net, kg_per_box is
-- NULL → the scaler safely falls back to legacy per-base scaling, so the per-box correction never
-- engages and consumption stays wrong. Backfill net_qty_per_each = pack_weight_g / 1000 (kg per
-- pack) from the linked project so the per-box model is complete.
--
-- Data-only, idempotent, additive. Only fills NULLs where the project carries a positive pack
-- weight. materialize-npd-bom already sets net_qty_per_each for NEW FGs at insert; this covers the
-- pre-existing rows.

update public.items i
   set net_qty_per_each = round((np.pack_weight_g / 1000.0)::numeric, 6)
  from public.npd_projects np
 where i.org_id = np.org_id
   and i.item_code = np.product_code
   and np.product_code is not null
   and i.origin_module = 'npd'
   and i.item_type = 'fg'
   and i.net_qty_per_each is null
   and np.pack_weight_g is not null
   and np.pack_weight_g > 0;

-- Migration 368 — A12: backfill FG detail fields from the project brief (kill double-entry).
-- Owner finding (2026-06-27, repro /en/fa/FG-NPD-012): the FG detail shows blank Volume / Weight (g) /
-- Price (Brief) even though those values were entered in the project brief. createFgCandidate / createFa
-- only ever inserted (product_code, product_name, …) and NEVER copied the brief, so fg_npd_ext.weight /
-- price_brief / volume stayed NULL on every project-created FG. The companion code change (gate-helpers
-- createFgCandidate) copies them on creation going forward; this migration backfills the EXISTING FGs.
--
-- Mapping (brief column on npd_projects → fg_npd_ext column):
--   pack_weight_g          → weight       (numeric → numeric, clean)
--   target_retail_price_eur→ price_brief  (numeric → numeric, clean)
--   expected_volume (text) → volume       (numeric) — ONLY when the text is a plain number; free-text
--                                           like "500ml" is ambiguous and intentionally left NULL.
--   packs_per_case: no brief source exists (npd_projects has no packs/cases column) → not backfilled.
--
-- Written against the underlying public.fg_npd_ext table (NOT the public.product view): the view's
-- INSTEAD-OF triggers call app.current_org_id(), which is unset during a migration run. Join FG→project
-- via items.item_code = npd_projects.product_code. coalesce() only fills NULLs (never overwrites a value
-- a user already typed). Idempotent.

update public.fg_npd_ext x
   set weight      = coalesce(x.weight,      np.pack_weight_g),
       price_brief = coalesce(x.price_brief, np.target_retail_price_eur),
       volume      = coalesce(
                       x.volume,
                       case when np.expected_volume ~ '^[0-9]+(\.[0-9]+)?$'
                            then np.expected_volume::numeric
                       end
                     )
  from public.items i
  join public.npd_projects np
    on np.product_code = i.item_code
   and np.org_id = i.org_id
 where x.item_id = i.id
   and (x.weight is null or x.price_brief is null or x.volume is null);

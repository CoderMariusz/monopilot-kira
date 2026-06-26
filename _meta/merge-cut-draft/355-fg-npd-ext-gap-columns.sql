-- Migration 355 — product→items MERGE, finalized-cut step 1 (§8d.1, additive + idempotent).
-- Design: _meta/plans/2026-06-26-product-items-merge-design.md §8b "column-coverage gaps".
--
-- mig 353 created public.fg_npd_ext with the 75 NPD-only product columns, and mig 354 backfilled them.
-- BUT 6 product columns map to NEITHER an existing items column NOR a fg_npd_ext column. They must live
-- in fg_npd_ext so the P2 product VIEW (mig 357) can reproduce the EXACT 93-col product shape:
--   supplier, created_by_device, app_version, allergens text[], may_contain text[], deleted_at timestamptz.
-- Rationale (§8b): deleted_at lives in ext to preserve the EXACT timestamp (items.status='deprecated'
-- is the production-lifecycle mirror, not a 1:1 of the timestamp); allergens/may_contain are the
-- regulatory FG declaration that update_fa_allergen_set persists (mig 356 re-routes them here).
--
-- This is additive (6 nullable/defaulted cols on an extension table only the merge reads) + an idempotent
-- backfill that UPDATEs the already-present ext rows (mig 354 inserted them WITHOUT these cols).
-- Rollback: alter table public.fg_npd_ext drop column {supplier, created_by_device, app_version,
--           allergens, may_contain, deleted_at}.

-- 1. Add the 6 gap columns. Types mirror public.product exactly; allergens/may_contain carry the same
--    NOT NULL DEFAULT '{}' contract product has (so the view never surfaces NULL arrays).
alter table public.fg_npd_ext
  add column if not exists supplier          text,
  add column if not exists created_by_device text,
  add column if not exists app_version       text,
  add column if not exists allergens         text[] not null default '{}'::text[],
  add column if not exists may_contain       text[] not null default '{}'::text[],
  add column if not exists deleted_at        timestamptz;

-- 2. Idempotent backfill from public.product, keyed by the items twin (org_id + item_code = product_code).
--    mig 354 already created every ext row via INSERT … ON CONFLICT DO NOTHING, so the rows exist but the
--    6 new columns are NULL/default — fill them here. Re-runnable: it always overwrites from product
--    (product is still the source of truth until the mig-357 cut), so a second run is a no-op once equal.
update public.fg_npd_ext x
   set supplier          = p.supplier,
       created_by_device = p.created_by_device,
       app_version       = p.app_version,
       allergens         = coalesce(p.allergens, '{}'::text[]),
       may_contain       = coalesce(p.may_contain, '{}'::text[]),
       deleted_at        = p.deleted_at,
       updated_at        = now()
  from public.items i
  join public.product p
    on p.org_id = i.org_id
   and p.product_code = i.item_code
 where x.item_id = i.id
   and (
        x.supplier          is distinct from p.supplier
     or x.created_by_device is distinct from p.created_by_device
     or x.app_version       is distinct from p.app_version
     or x.allergens         is distinct from coalesce(p.allergens, '{}'::text[])
     or x.may_contain       is distinct from coalesce(p.may_contain, '{}'::text[])
     or x.deleted_at        is distinct from p.deleted_at
   );

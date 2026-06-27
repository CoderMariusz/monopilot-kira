-- Migration 364 — P3-FK Phase 2a (additive): retarget the bom_headers orphan guard from product_id to item_id.
-- Design: _meta/plans/2026-06-27-p3-fk-design.md (Mig-D expand/contract).
--
-- This is the expand step that UNBLOCKS item_id-only writes while product_id still physically exists. The
-- orphan CHECK currently requires (product_id OR npd_project_id OR fa_code) NOT NULL. The technical BOM
-- create-draft writer sets neither npd_project_id nor fa_code, so the moment it stops writing product_id it
-- would violate the old guard. Swapping the guard to item_id (NOT NULL ⟺ product_id NOT NULL, verified 1:1)
-- keeps it equivalent for every existing row AND valid for BOTH the current dual-writers and the upcoming
-- item_id-only writers — so the app deploy can land safely with product_id still present (Phase 2b/mig 365
-- then rewrites the write/guard functions and drops product_id + its indexes/trigger/FK).
--
-- Pre-checked LIVE: 0 rows fail (item_id IS NOT NULL OR npd_project_id IS NOT NULL OR fa_code IS NOT NULL);
-- item_id is 1:1 with product_id (has_pid_no_iid = 0), so this guard is exactly as strict as the original.
--
-- Rollback:
--   alter table public.bom_headers drop constraint if exists bom_headers_not_orphaned_check;
--   alter table public.bom_headers add constraint bom_headers_not_orphaned_check
--     check (product_id is not null or npd_project_id is not null or fa_code is not null);

alter table public.bom_headers
  drop constraint if exists bom_headers_not_orphaned_check;

alter table public.bom_headers
  add constraint bom_headers_not_orphaned_check
  check (item_id is not null or npd_project_id is not null or fa_code is not null);

-- Migration 375 — site-scoping backfill for the new quality + warehouse fail-closed list reads.
-- The strict site-scoped reads (listStockMoves UNION leg lp_state_history, listNcrs, listInspections)
-- filter `site_id = $n` and therefore HIDE any NULL-site row under an active site. mig 366 backfilled
-- license_plates/grns/stock_moves and mig 334 backfilled quality_inspections (lp/grn refs only), but
-- lp_state_history, ncr_reports, and quality_inspections(wo_output refs) were never backfilled — so
-- existing movement history / NCRs / wo-output inspections would silently vanish from the site-scoped
-- lists. Assign each org's NULL-site rows to that org's default site (sites.is_default), consistent with
-- mig 369/371. Idempotent (only NULL site_id rows touched). The companion runtime change sets site_id
-- on new inserts so fresh records stay visible.

update public.lp_state_history h
   set site_id = s.id
  from public.sites s
 where h.site_id is null and s.org_id = h.org_id and s.is_default = true;

update public.ncr_reports n
   set site_id = s.id
  from public.sites s
 where n.site_id is null and s.org_id = n.org_id and s.is_default = true;

update public.quality_inspections qi
   set site_id = s.id
  from public.sites s
 where qi.site_id is null and s.org_id = qi.org_id and s.is_default = true;

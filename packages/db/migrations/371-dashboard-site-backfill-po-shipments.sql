-- Migration 371 — site-scoping backfill for the dashboard KPI tiles: purchase_orders + shipments.
-- The dashboard KPI row (pendingPos, shipmentsToday, shipmentExceptions) is being site-scoped.
-- Both tables carry a nullable site_id (added by mig 334) but all existing rows are NULL, so a
-- fail-closed site filter would zero those tiles. Backfill each org's NULL-site rows to that org's
-- default site (public.sites where is_default = true). Companion to mig 369 (work_orders) and mig 366
-- (license_plates). quality_holds + reorder_thresholds are empty -> not backfilled. Idempotent
-- (only NULL site_id rows are touched).

update public.purchase_orders po
   set site_id = s.id
  from public.sites s
 where po.site_id is null
   and s.org_id = po.org_id
   and s.is_default = true;

update public.shipments sh
   set site_id = s.id
  from public.sites s
 where sh.site_id is null
   and s.org_id = sh.org_id
   and s.is_default = true;

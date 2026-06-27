-- Migration 366 — site-scoping B-unblocker: backfill site_id on the warehouse operational tables.
-- Design: _meta/plans/2026-06-27-big-initiatives-plan.md (Initiative B, S1/B1 prerequisite).
--
-- site_id was added to these tables (migs 215/312/334 era) but never backfilled on the operational rows:
-- LIVE audit (org …0002) found GRNs 4/4 NULL, stock_moves 7/7 NULL, license_plates 3/12 NULL. Strict
-- site-scoped reads (B1/B3) would therefore HIDE every un-sited row — worse than the current cross-site leak.
-- This is the plan's "fail-OPEN on backfill" step: derive site from the owning warehouse (every warehouse has
-- site_id — verified 5/5) directly, or via the row's location → warehouse. Idempotent (only fills NULL).
-- Dry-run verified: 0 rows remain unresolved on any of the three tables.
--
-- Rollback: none needed (additive value-fill; site_id stays nullable). To undo a specific env, NULL the
-- backfilled rows — but there is no reason to.

-- license_plates: prefer the direct warehouse_id, else the location's warehouse.
update public.license_plates lp
   set site_id = w.site_id
  from public.warehouses w
 where lp.site_id is null and lp.warehouse_id = w.id and w.org_id = lp.org_id and w.site_id is not null;

update public.license_plates lp
   set site_id = w.site_id
  from public.locations l
  join public.warehouses w on w.id = l.warehouse_id and w.org_id = l.org_id
 where lp.site_id is null and lp.location_id = l.id and l.org_id = lp.org_id and w.site_id is not null;

-- grns: prefer warehouse_id, else default_location's warehouse.
update public.grns g
   set site_id = w.site_id
  from public.warehouses w
 where g.site_id is null and g.warehouse_id = w.id and w.org_id = g.org_id and w.site_id is not null;

update public.grns g
   set site_id = w.site_id
  from public.locations l
  join public.warehouses w on w.id = l.warehouse_id and w.org_id = l.org_id
 where g.site_id is null and g.default_location_id = l.id and l.org_id = g.org_id and w.site_id is not null;

-- stock_moves: prefer the destination (to_location) warehouse, else the source (from_location).
update public.stock_moves s
   set site_id = w.site_id
  from public.locations l
  join public.warehouses w on w.id = l.warehouse_id and w.org_id = l.org_id
 where s.site_id is null and s.to_location_id = l.id and l.org_id = s.org_id and w.site_id is not null;

update public.stock_moves s
   set site_id = w.site_id
  from public.locations l
  join public.warehouses w on w.id = l.warehouse_id and w.org_id = l.org_id
 where s.site_id is null and s.from_location_id = l.id and l.org_id = s.org_id and w.site_id is not null;

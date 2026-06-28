-- Migration 369 — site-scoping backfill: assign existing work_orders.site_id to the org default site.
-- Feature B (site-scoping) rolls out fail-closed read filters on the planning module: a read with an
-- active site appends ` and work_orders.site_id = $n `. Existing work_orders predate site assignment
-- (all site_id NULL), so without this backfill they would silently vanish from every site-scoped view
-- the moment a user selects a site. Assign each org's NULL-site work orders to that org's default site
-- (public.sites where is_default = true). Orgs with no default site are left untouched (nothing to map).
-- Idempotent: only NULL site_id rows are touched; re-running is a no-op.

update public.work_orders wo
   set site_id = s.id
  from public.sites s
 where wo.site_id is null
   and s.org_id = wo.org_id
   and s.is_default = true;

# WAVE — Site as global scope + scanner warehouse scoping + TO/PO/scan logic audit (BACKLOG, owner-requested 2026-06-23)

Owner ask (2026-06-23): the **site** (top-bar switcher) should classify WHERE every order is
created and processed — when you switch site in the top bar, everything you do should inherit that
site as a **global variable**. And on the **scanner**, when you pick a warehouse at login you should
only be able to touch that warehouse's WOs / locations / LPs — today you can scan ANY LP and move it
between warehouses, which must not be allowed. This is a big rebuild → a whole wave, together with an
audit of transfer-order / PO / scanning logic.

## The model (two scope levels — get this right first)
- **SITE = org-wide operational dimension, driven by the top bar.** A site is "a factory/location".
  Orders (PO/TO/WO/SO), inventory, production all belong to a site. The site switcher already exists
  (`components/shell/site-switcher.tsx`, `site-crumb.tsx`, `app.current_site_id()`, mig 215). Today
  it's a **partial cookie-based read filter on a few screens** — NOT a true global scope (see "current
  state"). Goal: switching site = a global context that (a) every CREATE stamps `site_id` from, and
  (b) every LIST/READ filters by, app-wide.
- **WAREHOUSE = the scanner's operational scope WITHIN a site.** A site has N warehouses; a warehouse
  has N locations. The scanner login picks site→**warehouse**→line→shift. That warehouse choice must
  scope the scanner session: only that warehouse's WOs, locations, LPs are visible/actionable.
- **Cross-warehouse / cross-site movement is LEGAL only via a Transfer Order**, never an ad-hoc
  scanner move. So the rule is not "never move between warehouses" — it's "within a warehouse-scoped
  scanner session you act only on that warehouse; to move stock elsewhere you ship/receive a TO."

## Current state (what exists vs the gap) — from the 2026-06-18 multi-site audit
- EXISTS: `sites` registry (mig 215), `app.current_site_id()` + `lib/site/site-context.ts`,
  site-switcher/site-crumb shell, ~38 tables carry a `site_id` column, `inter_site_transfer_orders`
  shell + RLS (mig 227). Scanner session carries `siteId`/`lineId` and the login has a site step;
  bootstrap now returns lines' real `site_id` (fixed 2026-06-18).
- GAP (why it's not a true global scope yet):
  - **No `withSiteContext` request-path HOF** — site is a cookie read on a few screens, not enforced
    in RLS / not stamped on every create. (Named only as a future seam; does not exist.)
  - **No per-site RLS** — RLS is org-only; `site_id` is a plain column most queries don't filter by.
  - The scanner picks a WAREHOUSE? — verify: today the scanner login picks site+line+shift but may
    NOT actually pick/scope a warehouse, and the WO list / putaway / move / pick do NOT filter by the
    session's warehouse. (Scanner review 2026-06-23 found the "my_line" filter is even unimplemented.)
  - `/multi-site` page is still a `ModuleStubNotice` stub.

## Audit to run FIRST (read-only, before building) — owner asked for this
1. **Transfer-order logic:** does a TO correctly model from_warehouse → to_warehouse, and does
   ship/receive actually move the LP's `location_id`/warehouse and block receiving into the wrong
   warehouse? Is there any path to move an LP across warehouses WITHOUT a TO (the bug owner saw on the
   scanner)? Map every writer of `license_plates.location_id` / warehouse.
2. **PO logic:** does a PO carry a destination warehouse, and does receive put the LP into THAT
   warehouse's location? Can you receive a PO line into a warehouse it wasn't destined for?
3. **Scanning logic:** for putaway / move / pick / consume / receive — is the LP and the destination
   location validated to belong to the scanner session's warehouse? (Today: likely NOT — owner can
   scan any LP and move between warehouses.) List each scanner write path + whether it checks
   warehouse membership of (a) the scanned LP and (b) the target location.
4. **Site stamping:** for every create (PO/TO/WO/SO/GRN/LP/output/waste/hold/…), is `site_id` set
   from the active context, or left null / defaulted? List the gaps.
5. **Site reading:** for every list/dashboard, does it filter by the active site, or show all sites'
   data regardless of the top-bar selection? List the gaps.

## Build slices (after the audit; sequence safest-first)
- **SC-1 — Site global context:** a `withSiteContext` server seam that resolves the active `site_id`
  (from the site cookie the switcher sets) and exposes it to actions; every CREATE action stamps
  `site_id` from it; a shared `siteScoped()` query helper so lists filter by it. (Decide: enforce in
  RLS via `app.current_site_id()` like org, OR application-level filter — RLS is stronger but a bigger
  migration across ~38 tables.) Owner-confirm the enforcement level before building.
- **SC-2 — Scanner warehouse scope:** the scanner login picks a **warehouse** (within the site); the
  session carries `warehouseId`; the WO list, putaway, move, pick, receive, LP-info, QA all filter to
  that warehouse's WOs / locations / LPs. The bootstrap returns only that warehouse's data.
- **SC-3 — Scan validation (the owner's bug):** every scanner LP scan validates the LP belongs to the
  session warehouse; every destination-location scan validates the location is in the session
  warehouse; reject cross-warehouse with a clear message ("This LP is in warehouse X — use a Transfer
  Order to move it here"). Server-side enforcement, not just UI.
- **SC-4 — TO as the only cross-warehouse path:** ensure ship/receive is the sole writer that moves an
  LP between warehouses; close any ad-hoc cross-warehouse move path found in the audit.
- **SC-5 — Site filtering everywhere:** wire the site read-filter into every module list/dashboard so
  the top-bar selection is honored globally (close the SC-5 read gaps from the audit).
- **SC-6 — /multi-site screen:** replace the stub with a real site management + cross-site overview.

## Verification (owner's standard: hard evidence, browser)
- Switch the top-bar site → every list (PO/TO/WO/inventory/…) shows only that site's data; create a
  PO → it carries the selected site.
- Scanner: log in to warehouse A → WO list, locations, LPs are ONLY warehouse A's. Try to scan an LP
  physically in warehouse B → rejected with the "use a TO" message. Move an LP onto a location in
  warehouse B from a warehouse-A session → rejected.
- The only way an LP reaches warehouse B is shipping + receiving a TO; the genealogy/trace reflects it.
- Cross-org + cross-site isolation tests (org B / site B can't see site A's data).

## Risk / size
LARGE. SC-1 (site RLS vs app-filter) is a design decision that touches ~38 tables if RLS-enforced.
SC-2/3 rebuild the scanner session model. Needs owner sign-off on enforcement level (RLS vs app) and
must be browser-verified (it changes what every operator sees). Pairs with finishing multi-site
(`withSiteContext` + `/multi-site`). Sequence AFTER the read-only audit so the build is precise.

## AUDIT FINDINGS (read-only, 2026-06-23 — DONE)
**The owner's cross-warehouse bug is CONFIRMED.** Zero warehouse-boundary enforcement on any scanner
write path — an operator CAN scan an LP from warehouse A and put it on a location in warehouse B.
Root causes + the minimal fix:

- **Scanner session has NO warehouse dimension at all.** `scanner_sessions` (mig 265) has
  `site_id`+`line_id` but no `warehouse_id`; login/`/api/scanner/context`/bootstrap never set or
  return a warehouse. So step 1 of any fix is adding it. (Bootstrap returns sites+lines, not warehouses.)
- **No warehouse check on move/putaway/pick.** `lib/warehouse/scanner/movement.ts:692` `assertLocationExists`
  checks org only (`org_id = app.current_org_id()`), not `loc.warehouse_id`. `loadMovableLpForUpdate`
  (movement.ts:659) loads the LP by org only. So cross-warehouse is unguarded.
- **Ghost warehouse_id:** `updateLpLocation` (movement.ts:826) writes `location_id` but NEVER updates
  `license_plates.warehouse_id` → after an uncontrolled scanner move, `lp.warehouse_id` (still A) and
  the location's warehouse (B) diverge. (The TO ship/receive IS the only controlled cross-warehouse
  writer — receive creates the LP with `warehouse_id = to_warehouse_id`, actions.ts:897.)
- **PO has no destination warehouse:** `purchase_orders` has no warehouse/site column;
  `resolveWarehouse` (receive-po.ts:511) picks the ORG DEFAULT warehouse → in a multi-warehouse org
  every scanner receipt lands in one warehouse regardless of site. The optional `toLocationId` accepts
  ANY org location (receive-po.ts:493) → cross-warehouse receive is possible.
- **Site is not a global scope:** `withSiteContext` does NOT exist (explicit comment at
  `lib/site/site-context.ts:11` — read-side cookie filter only). Gap: 3/5 sampled CREATE actions stamp
  no `site_id` (PO/TO tables have no site_id column at all; WO/receive-LP/output-LP omit it); 4/7
  sampled LISTS don't filter by site (PO list, TO list, scanner PO list). 3/10 lists (WO/LP/OEE) do.

**Minimal server-side fix set (the build target for SC-2/3):**
1. Add `warehouse_id` to `scanner_sessions` (new mig) + set it at login/context + bootstrap returns
   the session site's warehouses.
2. `loadMovableLpForUpdate` (movement.ts:659): `AND lp.warehouse_id = <session.warehouse_id>` → LP from
   another warehouse = not_found.
3. `assertLocationExists` (movement.ts:692, and the pick call at :522): `AND loc.warehouse_id =
   <session.warehouse_id>` → cross-warehouse destination = invalid_location.
4. `updateLpLocation` (movement.ts:826): also set `warehouse_id` from the target location so it never
   diverges.
5. `resolveWarehouse` (receive-po.ts:511): resolve a SITE-LOCAL warehouse from the session, not the org
   default.
6. `resolveRequestedLocation` (receive-po.ts:493): `AND l.warehouse_id = <session.warehouse_id>`.
7. The scanner must never write `warehouse_id` cross-warehouse; only TO ship/receive does. Reject a
   scanner move where `lp.warehouse_id ≠ targetLocation.warehouse_id` with "use a Transfer Order".

This is now a precise, buildable wave — but it's LARGE (new session field + 7 enforcement points +
the site-global-scope decision) and changes what every operator sees, so it needs owner sign-off
(RLS vs app-level for site) + browser verification. Not an autonomous fire-and-forget.

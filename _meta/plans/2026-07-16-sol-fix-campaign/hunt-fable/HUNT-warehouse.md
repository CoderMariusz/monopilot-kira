# HUNT — Warehouse / Inventory / Scanner / License Plates (Fable, 2026-07-16)

Area: `apps/web/lib/warehouse/**`, `apps/web/app/api/warehouse/scanner/**`,
`apps/web/app/api/production/scanner/**`, LP / stock_moves / GRN / put-away /
pick / consume / ship flows.

Dedupe base read: FULL-REPORT C001–C120 + LEDGER W1–W8. Scanner a11y/offline
(C094–C097), GRN mutability/expiry/counts (C052–C055), FEFO/over-consume
(C081–C084), RMA (C112) all confirmed already-handled and excluded.

Verdict: the LP quantity-conservation, FEFO, over-consume, and org/site-scope
core paths are **solid** — decrements are guarded (`quantity - qty >=
reserved_qty`), FEFO auto-select locks `for update`, reverse-consume serialises
via `for update of c`, and every write route re-gates RBAC + `user_can_see_site`.
The novel defects below are integrity/parity gaps around the edges, not
conservation holes. Honest count: 1×P2, 2×P3, 1 refactor.

## Findings

| ID | Sev | Location | One-line |
|----|-----|----------|----------|
| NEW-P01 | P2 | receive-po-line-core.ts:392-411 + movement.ts:212-303,746-763 + location/route.ts:32-61 | Deactivated locations (`is_active=false`, mig 303) are accepted by every stock-write destination and by single-code lookup; only the location *list* filters them — put-away even actively suggests disabled bins. |
| NEW-P02 | P3 | receive-po.ts:490-492 | `normalizeDecimal` strips ALL trailing zeros from the whole qty string, not just the fractional tail — latent 10ˣ under-display, currently masked by numeric(18,6)::text. |
| NEW-P03 | P3 | movement.ts:478-534,573,890-908 (pick) | Pick has no check that the destination staging location's site matches the WO site; an operator seeing 2 sites can stage a site-A pick into a site-B bin and the LP's `site_id` is silently rewritten to B. |
| NEW-R01 | refactor | movement.ts:394-429 | `listFefoLps` is dead code (zero callers) and — unlike the live `pick/lps` route — omits site/QA/hold/expiry filters; delete it before someone wires up a cross-site leak. |

---

### NEW-P01 (P2) — deactivated locations still accept & are suggested for stock

**Files:**
- `apps/web/lib/warehouse/scanner/movement.ts:746` `loadLocationScope` — validates
  org + `user_can_see_site(w.site_id)` only, **no `loc.is_active` check**. This is
  the gate used by both put-away and transfer (`moveScannerLp`) and by pick
  (`pickScannerLp` line 527).
- `apps/web/lib/warehouse/scanner/movement.ts:212-303` `suggestPutawayLocations` —
  the `same_product` / `empty` / `default` CTEs never filter `is_active`, so the
  put-away suggestion API returns disabled bins as recommended targets.
- `apps/web/app/api/warehouse/scanner/location/route.ts:32-61` — the **single-code**
  location lookup (scan a bin barcode) has no `is_active` filter; only the
  no-code **list** branch (line 76) filters `coalesce(loc.is_active, true)`.
- `apps/web/lib/warehouse/receive-po-line-core.ts:392-411` `resolveRequestedLocation`
  (desktop) and the scanner default-location resolution likewise never check
  `is_active` — GRN receipt can also land a new LP on a disabled bin.

**Verification:** `is_active` (migration 303, "soft enable/disable without
deleting") is referenced in write/read paths in exactly ONE place repo-wide —
the scanner location *list* route. `grep -rln "loc.is_active" apps/web/lib
apps/web/app/api` → only `location/route.ts`. No move/putaway/pick/receive path
enforces it.

**Failure scenario:** Supervisor disables bin `A-01-02` (damaged rack / temporary
quarantine zone) expecting no new stock. Operator scans an LP, scans `A-01-02`'s
barcode → lookup returns it as valid → put-away commits, LP now sits in the
disabled bin. The bin no longer appears in the location *picker* (list filters
`is_active`), so the stock is effectively hidden from anyone browsing locations,
yet remains fully counted in `v_inventory_available` and FEFO-consumable (FEFO
keys on the LP, not the bin's active flag). Put-away *suggest* makes it worse by
proactively recommending the disabled bin.

**Why not C001–C120:** C012 is warehouse-level reactivation; C101 is the same-
location guard; C102 is terminal-status block. None cover `locations.is_active`
enforcement on stock movement — the deactivation feature is toothless everywhere
except one read view.

**Fix (lazy/root-cause):** add `and coalesce(loc.is_active, true)` to
`loadLocationScope` (one guard covers put-away + transfer + pick destination) and
to the single-code branch of `location/route.ts`; exclude inactive bins from the
three `suggestPutawayLocations` CTEs. GRN receipt should reject an inactive
`toLocationId`.

---

### NEW-P02 (P3, latent) — `normalizeDecimal` over-strips trailing zeros

**File:** `apps/web/lib/warehouse/scanner/receive-po.ts:490`
```ts
function normalizeDecimal(value: string): string {
  return formatDecimal(parseDecimal(String(value).replace(/0+$/, '').replace(/\.$/, '') || '0'));
}
```
`/0+$/` strips the maximal run of trailing zeros from the **entire** string, not
just digits after a decimal point. `normalizeDecimal('100')` → `'1'`,
`'20'`→`'2'`, `'150'`→`'15'`.

**Why masked today:** callers pass `pol.qty::text` and
`coalesce(sum(grn_items.received_qty),0)::text`. Both columns are `numeric(18,6)`
(mig 262→506 for PO qty; mig 193 for grn_items), and Postgres emits the declared
scale, so `100` renders as `'100.000000'` — the strip then correctly peels the
fractional zeros back to `'100'`. So it is **not** live-broken.

**Failure scenario (when it bites):** any future caller or schema change that
feeds a bare-integer numeric string (an unconstrained `numeric`, a `::int`
count, or a hand-built string) makes the scanner PO-detail screen show a
quantity 10ˣ too small — e.g. an ordered qty of `200` displayed as `2` to the
receiving operator. The correct intent is "strip zeros only after a decimal
point"; `formatDecimal` (receive-po-line-core.ts:832) already does exactly that
on the fractional part, so `normalizeDecimal`'s pre-strip is both wrong and
redundant.

**Why not C001–C120:** C114 covers SO decimals; no finding touches this scanner
receive-po helper. Reported as latent (LOW) for honesty — code is a landmine, not
a live wound.

**Fix:** delete the `.replace(/0+$/, '').replace(/\.$/, '')` pre-strip and rely
on `parseDecimal`/`formatDecimal` (which already canonicalise), or anchor it to
`/(\.\d*?)0+$/`.

---

### NEW-P03 (P3) — pick destination site not tied to WO site

**File:** `apps/web/lib/warehouse/scanner/movement.ts:478-534,573,890-908`

The pick cross-site guard (line 532) only compares the **LP** site to the **WO**
site: `if (lp.site_id && material.site_id && lp.site_id !== material.site_id)`.
The **destination** (`toLocationId`, defaulting to the line's staging location) is
validated only for `user_can_see_site` in `loadLocationScope`. There is no
assertion that `destination.siteId === material.site_id`. `updateLpLocation`
(line 890) then rewrites the LP's `site_id`/`warehouse_id` to the destination's.

**Failure scenario:** operator has visibility of sites A and B. They pick LP
`L1` (site A) for WO `W1` (site A) but supply `toLocationId` = a bin in site B
(which they can see). Guard passes (A==A). The `issue` stock-move is written with
`site_id=B` and `L1.site_id` is silently flipped to B — the pallet staged for a
site-A work order now reports as site-B inventory, corrupting per-site stock
figures and the genealogy site trail. Also note the null-site branch: an
org-level LP (`site_id IS NULL`) bypasses the guard entirely and can be picked
into any visible site.

**Why not C001–C120:** C010/C041/C051/C073 cover cross-site line/routing/PO/
scheduler scoping; none cover the scanner pick destination-vs-WO site invariant.

**Fix:** after `loadLocationScope`, add `if (material.site_id &&
destination.siteId !== material.site_id) throw lp_wrong_site` (mirrors the LP
guard already present).

---

### NEW-R01 (refactor) — delete dead `listFefoLps`

**File:** `apps/web/lib/warehouse/scanner/movement.ts:394-429`

`listFefoLps` has **zero** source callers (`grep` finds only its definition +
`.next` build cache; the live FEFO-suggest surface is the separate
`app/api/warehouse/scanner/pick/lps/route.ts`). Beyond being dead weight, its
query lacks the `app.user_can_see_site(lp.site_id)`, `qa_status='released'`,
expiry, and active-hold filters that the live `pick/lps` route carefully
applies — so if a future dev "reuses the existing helper" they'd ship a
cross-site + held-stock FEFO leak. Ponytail: delete it; the real one already
exists a route over.

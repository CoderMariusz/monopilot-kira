# Per-page / per-flow LOGIC audit — overnight run (2026-06-24)

Owner asked (overnight, full autonomy): scan the WHOLE app, ~1 agent per page/flow, and for each check:
- Do the functions actually work? Are they logically consistent? What do they serve?
- Is the data SOURCED (Supabase) or HARDCODED?
- Is there REVERSE logic where the real world needs it:
  - over-consume to a WO on the scanner → how do we reverse it?
  - wrong PO issued to a supplier → how do we correct it?
  - can we UNBLOCK a pallet, or CREATE one ourselves via counting if we find unrecorded stock?

Read-only research agents append their findings here (orchestrator writes; agents return). 255 page.tsx total
→ audited by functional cluster (list+detail+actions+reverse), trivial redirects/stubs skipped.

Severity: L1 = broken/illogical/data-loss · L2 = works but gap (missing reverse, hardcoded) · L3 = polish.

---

## Findings (appended per cluster as agents return)

### BATCH 1 (2026-06-24 ~22:00) — core operational flows + reverse logic

**REVERSE LOGIC = the owner's headline question. Summary answers:**
- **Over-consume → reverse on SCANNER?** NO. `reverseConsumption`/`voidWoOutput`/`voidWasteEntry` all exist + work
  but are **desktop-only Server Actions** — ZERO scanner API routes. Plus a PIN-vs-password gap: desktop uses e-sign
  account password; scanner ops have numeric PINs. Exposing reverse on the scanner = a build wave + the PIN decision. [QUEUE 5am]
- **Wrong PO to a supplier → correct?** Only partially. Draft PO is fully editable; once `sent` it's read-only — the only
  exit is `→ cancelled` (loses the doc). No amend / reopen-to-draft. `received` is terminal (no reversal after GRN
  corrections). `partially_received → cancelled` has NO stock guard (silent inconsistency: stock stays, PO cancelled). [QUEUE 5am]
- **Unblock a pallet?** Currently **BROKEN (L1)**: `releaseHold` (quality/_actions/hold-actions.ts:694-701) only updates
  `qa_status`, NEVER restores `license_plates.status` from 'blocked'→'available' → a blocked LP is permanently dead
  (invisible to FEFO, un-reservable). No "Unblock" button on the LP screen either. (My R8a `blockLp` is thus a one-way trap.) [FIX NOW]
- **Create a pallet via counting (found stock)?** NO — entirely absent. No cycle-count/inventory-count table, no
  adjustment action, no UI. `warehouse.stock.adjust` permission seeded (mig 192) but ZERO callers (phantom). [QUEUE 5am — build a counting/adjustment wave]

**CRITICAL bugs to FIX autonomously (clear, no flow decision):**
- **L1 allergen gate silently dead** — scanner WO-execute reads `data.allergenGate` (top-level) but the API emits
  `header.allergenFlag` → the allergen-changeover banner NEVER shows (food-safety!). `api/production/scanner/wos/[id]/route.ts:169`
  vs `wo-execute-screen.tsx:93`. The test fixture put it top-level so the test masks it. [FIX NOW]
- **L1 consume route has no WO-status gate** — `api/.../scanner/wos/[id]/consume/route.ts` doesn't call `readWoExecutionStatus`;
  a material can be consumed on a cancelled/closed WO via the API (output/waste routes DO gate). [FIX NOW]
- **L1 lp_genealogy not cleaned on output void** — `voidWoOutput` sets LP `destroyed` but leaves `lp_genealogy` rows →
  voided LP still traversable as a child. `corrections-actions.ts:860`. [FIX NOW]
- **L2 yield gate ignores voided outputs** — `complete-cancel-wo.ts:61-99` `qty_kg>0` lacks `correction_of_id IS NULL`;
  a WO whose only primary output was voided can still pass the yield gate + complete. [FIX NOW]
- **L2 nextBatchNumber counts void rows** — `register-output.ts:241` count lacks `correction_of_id IS NULL` → batch seq gaps. [FIX NOW]
- **L1 reporting-refresh cron is a no-op** — `api/internal/cron/reporting-refresh/route.ts:100` queries `pg_matviews` for
  `v_mv_reporting_%`, but mig 221 created those as plain VIEWs (the matviews are `mv_reporting_*`, mig 213) → matches 0,
  refreshes nothing, logs `refreshed:0`. The whole MV reporting layer is never refreshed. [FIX NOW — refresh the real mv_reporting_* names]
- **L1 home dashboard stale** — `_actions/dashboard-summary.ts:122-125` still renders `pendingPos`/`lowStock` as `notLive:true`
  though `purchase_orders`/`transfer_orders` exist since mig 262-263 (planning dashboard already queries them). [FIX NOW]

**REPORTS (owner question) — precise answer:** reports ARE real (Supabase, RLS), but: (1) NO period selector anywhere —
all windows hardcoded (production 7d, quality/procurement 30d, OEE 7d, analytics 7d/30d); NO daily/weekly/monthly toggle.
(2) NO search/filter by WO/PO/SO or by LINE (OEE takes only siteId). (3) Data real but the 7 `mv_reporting_*` matviews +
their `v_mv_reporting_*` wrappers are DEAD schema (no page reads them); `saved_report_configs`/`saved_filter_presets`/
`report_definitions` tables exist with no UI. Procurement "confirmed→GRN" KPI permanently null (no `confirmed_at` col).
→ A reporting wave (period selector + entity search + wire MVs/exports) is needed. [QUEUE 5am for scope]

**Lower-sev (backlog):** scanner receive-line route has no `hasPermission` gate (L2); GRN-number race (MAX no lock, L2);
cross-warehouse scoping gap CONFIRMED (already in backlog); FEFO pick list not warehouse-scoped (L2); GRN UI badge
`in_progress` has no matching DB status (L2); no whole-GRN cancel (L2); locations tree flat/no CRUD (L2);
revalidatePath targets wrong route segment in corrections (L3, harmless under force-dynamic).

### BATCH 2 (2026-06-24 ~23:00) — NPD / Technical / Planning-MRP / SO-Shipping / Settings

**CRITICAL/clear to FIX autonomously (queued for the next fix round):**
- **L1 Planning: FG shortage suggests BUY not MAKE** — `planning/_actions/mrp-compute.ts:365` `item_type==='intermediate'?'make':'buy'`
  → an FG (which has a BOM, is manufactured) gets a 'buy' planned order → creates a draft PO to a supplier for a finished
  good. Fix: `intermediate || fg → make`. [FIX]
- **L1 SO: createSalesOrder CRASHES for items with null list_price** — DB constraint `unit_price_gbp > 0` (mig 211:287)
  vs `resolveSalesLinePrice` returns 0 when list_price null (my R7a). Fix: relax constraint to `>= 0` (mig) [FIX]
- **L1 SO: deallocateSalesOrder leaves status stuck** — `so-actions.ts:715` zeroes allocations but never resets
  `sales_orders.status` to 'confirmed' → SO permanently stuck at 'allocated'. Fix: reset status. [FIX]
- **L1 SO: recordPod never sets status='delivered'** — `ship-actions.ts:321` sets delivered_at only; shipment + SO stay
  'shipped'; 'delivered' is unreachable. Fix: set status. [FIX]
- **L1 SO/shipments RTL tests never run** — `sales-orders.test.tsx` + `shipments.test.tsx` fail to PARSE (missing
  `/** @vitest-environment jsdom */` docblock) → 0 tests executed. Fix: add the docblock. [FIX]
- **L2 Technical food-safety: ALLERGEN_CONFLICT never fires** — `bom/_actions/shared.ts:277` hardcodes
  `targetFgForbiddenAllergens: []`, so a milk-containing RM can be added to a "milk-free" FG with no error. Fix: feed the
  FG's real forbidden allergens into `validateRmUsability`. [FIX]
- **L2 NPD ALREADY_CLOSED returns status 200** (should be 409) — `close-out-legacy-stages.ts:451`. [FIX]
- **L2 Settings: /settings/gallery** (design-system demo) reachable in prod with no guard; **D365 "Run sync now" dead in
  prod** (`integrations/d365/audit/page.tsx:155` — `runSyncNow` prop never populated though the API route exists). [FIX gallery; wire run-sync]
- **L2 SO: shipShipment doesn't zero reserved_qty** on shipped LP (inventory over-counts). [FIX]

**Hardcoded values that should be sourced (NPD approval — L2):** C3 margin threshold `15%` hardcoded in
`packages/domain/.../evaluate-criteria.ts:44` (diverges from org `costing_margin_warn_pct`); C4 sensory always
`not_required` (panel score never wired); C5 allergen passes vacuously on empty arrays; costing bootstrap labour/
packaging/overhead seeded as '0'. [some FIX, threshold-config = 5am Q7]

**Reverse-logic gaps (queued):** NPD `revertGate`/`rollbackGate` exists but has ZERO UI callers (dead) + reverting a
Launched project doesn't clean closeout/product-activation/BOM (L1); a launched product can't be un-launched; gate
rejection doesn't block a later advance. Technical: factory-spec `approved_for_factory` has no recall-to-draft (only
`released_to_factory` recallable); BOM rollback to a superseded version not surfaced; cost rollup + nutrition NOT
reactive to component/BOM changes (stale until manual). SO/Shipping: NO cancel-shipment / un-pack / un-pick / void-POD
anywhere (once shipped, no stock credit-back). Planning: no `cancelPlannedOrder` (mig allows 'cancelled', no code sets it).

**Good news (verified correct + real):** MRP netting math is CORRECT and fully Supabase-sourced (onHand/reserved/
openSupply/demand all real, bigint micro-unit precision, rework anti-join correct). RBAC (roles→permissions→enforcement)
is REAL + enforced. D365 is REAL infra (sync runs/DLQ/drift tables, workers) — just env-var-gated, not a mock. BOM
versioning/snapshot, WO corrections framework (void/reverse with storno + double-reverse guards), allergen cascade
packaging-exclusion — all correct. Settings pages are overwhelmingly REAL (read/write Supabase); only `gallery` is a demo.

**Parity/scale (L2/L3 backlog):** planning dashboard 4/8 KPIs (prototype gap); dashboard `date_trunc('day',now())` no UTC
(tz drift); forecasts grid only shows items with existing cells (can't plan zero-history items in-grid); duplicate
settings trees (non-locale `(admin)/settings/*` redirects) + duplicate `/settings/machines` route; schedule cycle-guard
full-scans wo_dependencies per drag.

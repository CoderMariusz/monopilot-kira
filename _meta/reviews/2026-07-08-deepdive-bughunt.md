# Deep-Dive Bug Hunt - 2026-07-08

Scope: current `main` worktree, read-only code review. I loaded the owner report and `.claude/skills/MON-verify-and-review/SKILL.md`. The requested prior-audit file `_meta/reviews/2026-07-02-fleet-audit-B/00-REMAINING-WORK-status.md` is not present in this checkout, so I cross-checked against the current tree and the R3-to-C6 owner report instead of reusing stale findings.

No tests were run; this is a source-level bug hunt.

## P0

### [P0-01] Sales order creation commits an orphan header on line validation failure
**File:** apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts:581
**Class:** Transactionality / return-after-write commit
**Scenario:** `createSalesOrder` inserts the SO header at lines 581-587, then validates and inserts lines. If a later line references an unknown item, the loop returns `{ ok: false }` at lines 618-620. `withOrgContext` commits on normal return, so the header and any earlier lines remain as a partial draft order.
**Fix sketch:** Resolve and validate every item, UoM, price, and stock-policy input before the first insert, or throw after any write-side failure so the org transaction rolls back.

### [P0-02] Shipping SO server-action module exports non-async types
**File:** apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts:42
**Class:** RSC server-action build boundary
**Scenario:** The file starts with `'use server'` and exports `type ActionResult`, plus other exported types at lines 62-140. Next server-action modules may export only async functions; importing these types from client/RSC code can pass local typecheck but fail `next build` with missing server-reference exports.
**Fix sketch:** Move exported types to a non-`'use server'` sibling and import them with `import type`; leave only async action exports in this file.

### [P0-03] Shipping shipment server-action module exports non-async types
**File:** apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts:20
**Class:** RSC server-action build boundary
**Scenario:** The file starts with `'use server'` and exports `ActionResult`, `ShipOrderInput`, `RecordPodInput`, and `VoidBolInput`. This violates the server-action export contract and can break the app build when those symbols are referenced across the RSC boundary.
**Fix sketch:** Move these type exports to a plain shared module and keep `shipOrder`, `recordPod`, and `voidBol` as the only exports here.

### [P0-04] Shipping pack server-action module exports non-async types
**File:** apps/web/app/[locale]/(app)/(modules)/shipping/_actions/pack-actions.ts:17
**Class:** RSC server-action build boundary
**Scenario:** The file starts with `'use server'` and exports multiple input/result types before the async actions. This is a known deploy-breaking pattern in this repo because server-action manifests do not expose type-only exports at runtime.
**Fix sketch:** Relocate type definitions to a non-server module and import them type-only from both actions and UI code.

### [P0-05] MRP server-action module exports a large public type surface
**File:** apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp.ts:141
**Class:** RSC server-action build boundary
**Scenario:** `mrp.ts` starts with `'use server'` and exports numerous types from lines 141-225. A page or client island importing any of them can produce a production build failure even though `tsc` accepts it.
**Fix sketch:** Split the MRP DTO types into a plain `mrp.types.ts` file and leave this module with only async server actions.

### [P0-06] NPD release server-action module exports a non-async result type
**File:** apps/web/app/(npd)/builder/_actions/release-npd-project-to-factory.ts:40
**Class:** RSC server-action build boundary
**Scenario:** The file starts with `'use server'` and exports `ReleaseNpdProjectResult`. This can break consumers that import the result type from the action module during Next's server-reference generation.
**Fix sketch:** Move `ReleaseNpdProjectResult` to a non-server shared type file and import it with `import type`.

### [P0-07] NPD release-status server module exports types under `'use server'`
**File:** apps/web/app/(npd)/builder/_lib/factory-release-status.ts:7
**Class:** RSC server-action build boundary
**Scenario:** This module starts with `'use server'` and exports `FactoryReleaseStatusCode`, `FactoryReleaseStatusInfo`, and later `FactoryReleaseStatusResult`. Because it is a server module, those non-async exports are not valid server-reference exports.
**Fix sketch:** Remove `'use server'` if this is only a server-side helper, or split exported types/constants into a plain module and keep server-only logic separate.

### [P0-08] NPD item-search action module exports types under `'use server'`
**File:** apps/web/app/(npd)/fa/actions/search-items.ts:42
**Class:** RSC server-action build boundary
**Scenario:** The file starts with `'use server'` and exports `ItemSearchResult` and `ItemSearchActionResult`. Client search components importing those types from the action file can trigger the same production-only server-action export failure.
**Fix sketch:** Move search result types to a non-server sibling and keep the action file export list to async functions.

### [P0-09] NPD WIP process action module exports types under `'use server'`
**File:** apps/web/app/(npd)/fa/actions/wip-process-actions.ts:67
**Class:** RSC server-action build boundary
**Scenario:** `wip-process-actions.ts` starts with `'use server'` and exports `ActionResult`, `ProcessSummary`, and `FormulaWithProcesses`. Any RSC/client type import from this module can break build artifact generation.
**Fix sketch:** Move the exported DTO types to a plain type module and import them type-only.

### [P0-10] Factory-spec flow action module exports types under `'use server'`
**File:** apps/web/app/[locale]/(app)/(modules)/technical/factory-specs/actions/factory-spec-flow.ts:35
**Class:** RSC server-action build boundary
**Scenario:** The file starts with `'use server'` and exports `ActionResult`, `FactorySpecFlowSummary`, and `FactorySpecFlowSnapshot`. This is the same invalid export shape called out in the project gotchas.
**Fix sketch:** Move flow DTO exports to a non-server module and leave only async functions in the action file.

## P1

### [P1-01] Scanner PO list endpoint has no read permission check
**File:** apps/web/app/api/warehouse/scanner/pos/route.ts:10
**Class:** RBAC parity / data exposure
**Scenario:** The scanner PO list route accepts any valid scanner bearer session and directly calls `listScannerPurchaseOrders`. Unlike desktop warehouse/planning views, it does not check `warehouse.inventory.read`, `warehouse.receive`, or a planning read permission. A low-privilege scanner token can enumerate open purchase orders for all visible sites in the org.
**Fix sketch:** Require the same read/receive permission used by the desktop PO receiving workflow before listing POs.

### [P1-02] Scanner PO detail endpoint exposes line-level PO data without read permission
**File:** apps/web/app/api/warehouse/scanner/pos/[id]/route.ts:13
**Class:** RBAC parity / data exposure
**Scenario:** The detail route validates only the scanner session and site visibility before returning PO detail. A token intended for narrow stock moves can retrieve supplier, line, quantity, and receipt-state details for purchase orders.
**Fix sketch:** Add an explicit PO/receive read permission gate matching the desktop receive action.

### [P1-03] Scanner LP lookup endpoint can enumerate inventory without inventory read permission
**File:** apps/web/app/api/warehouse/scanner/lp/route.ts:13
**Class:** RBAC parity / inventory disclosure
**Scenario:** `/api/warehouse/scanner/lp` requires only a scanner bearer token and site visibility. It has no `warehouse.inventory.read` check, so a scanner session can probe LP codes or UUIDs and retrieve stock data from visible sites even if the user lacks desktop inventory read access.
**Fix sketch:** Gate LP lookup with `warehouse.inventory.read` or the exact desktop twin permission before resolving LP details.

### [P1-04] Scanner receive can fall back to a warehouse in the wrong site
**File:** apps/web/lib/warehouse/receive-po-line-core.ts:407
**Class:** Site scoping / inventory corruption
**Scenario:** `resolveWarehouse` orders candidate warehouses by requested warehouse, PO destination, scanner site match, then any org default/active warehouse. If a scanner session has site A or no site and the PO has no destination warehouse, the fallback can select an active/default warehouse in site B. The receipt then creates inventory, LPs, and GRN rows at site B from a site A scanner workflow.
**Fix sketch:** For scanner mode, require a resolved scanner site and restrict fallback warehouses to that site unless the requested warehouse/location has already passed a site-visibility check.

### [P1-05] Scanner receive accepts a destination location from an invisible site
**File:** apps/web/lib/warehouse/receive-po-line-core.ts:323
**Class:** Site scoping / authorization bypass
**Scenario:** `resolveRequestedLocation` checks only `l.org_id = app.current_org_id()` and location id. It does not join the warehouse/site or call `app.user_can_see_site`. A scanner request can pass a location id from another site in the same org and force receipt inventory into that location.
**Fix sketch:** Join the location warehouse, require `app.user_can_see_site(w.site_id)`, and in scanner mode require the destination site to match the scanner session unless explicit cross-site receive permission exists.

### [P1-06] GRN header warehouse/location can disagree with the received LP location
**File:** apps/web/lib/warehouse/receive-po-line-core.ts:175
**Class:** Data integrity / GRN-inventory mismatch
**Scenario:** `destLocationId` honors a requested location, but `getOrCreateOpenGrn` is called with `warehouse.default_location_id`. The GRN header is also reused by PO/date only at lines 462-476, not by warehouse/location. A receipt into a requested quarantine/bin location can create LP stock there while the GRN header points at the warehouse default location.
**Fix sketch:** Pass the actual `destLocationId` into GRN creation and include warehouse/location compatibility when reusing an open draft GRN, or split GRNs per destination.

### [P1-07] Scanner-created license plates can get a null or wrong site_id
**File:** apps/web/lib/warehouse/receive-po-line-core.ts:173
**Class:** Site scoping / lifecycle integrity
**Scenario:** `lpSiteId` is set to `ctx.siteId` in scanner mode instead of the resolved warehouse site. If the scanner session site is null, or if the destination warehouse came from a requested location/fallback in another site, the inserted LP row is stamped with null/wrong `site_id` while its warehouse/location point elsewhere.
**Fix sketch:** Derive LP site from the resolved destination warehouse and separately validate that the scanner session is allowed to receive there.

### [P1-08] Receipt WAC silently skips valuation for unresolved UoM
**File:** apps/web/lib/finance/book-receipt-wac.ts:51
**Class:** Financial integrity / silent failure
**Scenario:** `bookReceiptWacAfterGrnItem` calls `resolveWacDeltaQtyKg`. If the UoM cannot be resolved to kg, base, each, or box with pack metadata, the code updates `grn_items.ext_jsonb` with `wac_excluded: 'unresolved_uom'` and returns success. The PO receipt and inventory are committed while WAC and item cost state remain unchanged.
**Fix sketch:** Treat unresolved valuation UoM as a blocking receive error for WAC-governed items, or require an explicit non-valued item policy before allowing receipt.

### [P1-09] Packed or manifested sales orders can receive duplicate shipments
**File:** apps/web/app/[locale]/(app)/(modules)/shipping/_actions/pack-actions.ts:227
**Class:** Lifecycle / duplicate fulfillment
**Scenario:** `createShipment` checks existing open shipments using `OPEN_SHIPMENT_STATUSES`, but that set contains only `pending` and `packing`. The same function allows SO statuses including `packed` and `manifested`. After a shipment reaches `packed` or `manifested`, a user can call `createShipment` again and create another shipment for the same SO.
**Fix sketch:** Treat `packed`, `manifested`, and shipped-but-not-void lifecycle states as blocking shipment creation, or enforce a unique active shipment constraint at the database level.

### [P1-10] Delivery/POD can be recorded with no signed proof
**File:** apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts:565
**Class:** Regulatory retention / lifecycle correctness
**Scenario:** `recordPod` accepts `signedPdfUrl?: string` and writes `input.signedPdfUrl ?? null` while marking the shipment delivered. A caller can record delivered POD with no signed proof URL, violating the stated BRCGS POD retention requirement and leaving delivery state without the retained artifact.
**Fix sketch:** Require a validated immutable POD artifact URL before transitioning to delivered, and reject empty or unverified proof.

### [P1-11] POD delivery recording lacks CFR-style e-sign/PIN verification
**File:** apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts:541
**Class:** Regulatory / authorization strength
**Scenario:** `recordPod` gates on `ship.bol.sign` permission but does not require a PIN/e-sign event, reason, or signed audit evidence before delivery is recorded. A normal authenticated session with that permission can finalize delivery without the e-signature controls required for regulated shipping evidence.
**Fix sketch:** Require the same e-sign/PIN verification and audit envelope used by other regulated signoff flows before updating POD/delivery state.

### [P1-12] Delivered orders and shipments can regress back to shipped
**File:** apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-transitions.ts:53
**Class:** Lifecycle invariant
**Scenario:** `SO_LEGAL_TRANSITIONS` allows `delivered -> shipped` and `SHIPMENT_LEGAL_TRANSITIONS` allows `delivered -> shipped`. The generic status writers enforce these tables, so any path using them can move legally delivered records backward without a reversal/correction document.
**Fix sketch:** Remove backward delivered transitions from the legal transition tables and add an explicit correction/void workflow if business users need to undo a mistaken delivery.

## P2

### [P2-01] Sales line prices are converted through JavaScript floating point
**File:** apps/web/app/[locale]/(app)/(modules)/shipping/_actions/sales-line-price.ts:16
**Class:** Numeric precision / money
**Scenario:** `parsePrice` converts DB numeric text to `Number`, and `resolveSalesLinePrice` returns `number`. SO line insertions then pass that JS number back into numeric columns. Decimal prices such as `0.10005` or high-precision contract prices can be rounded before persistence and line-total calculation.
**Fix sketch:** Keep prices as decimal strings or a decimal library value end to end; only format to number at display boundaries.

### [P2-02] Customer item pricing ignores non-GBP prices
**File:** apps/web/app/[locale]/(app)/(modules)/shipping/_actions/sales-line-price.ts:6
**Class:** Currency correctness
**Scenario:** `SO_CURRENCY` and `SO_PRICE_KIND` are hardcoded to GBP/list. If a customer-specific price exists in EUR/USD or another org-supported currency, the resolver ignores it and can fall back to item list GBP or zero, producing incorrect order pricing.
**Fix sketch:** Resolve price by the SO/customer currency and persist both amount and currency, or explicitly reject non-GBP customers until multi-currency SOs are supported.

### [P2-03] NPD BOM materializer loads ingredients without an explicit org filter
**File:** apps/web/app/(npd)/pipeline/_actions/_lib/materialize-npd-bom.ts:441
**Class:** Org scoping / defense in depth
**Scenario:** `loadIngredients` selects from `formulation_ingredients` by `version_id` only. The caller normally obtains the version through an org-scoped project lookup, but the helper itself does not assert `org_id = app.current_org_id()`. A corrupted or incorrectly related version id can pull another org's ingredient rows into BOM materialization.
**Fix sketch:** Add explicit `org_id = app.current_org_id()` filters to every formulation table read in the materializer, even when upstream ids were org-scoped.

### [P2-04] NPD process-assignment readiness check is not org-scoped at the leaf table
**File:** apps/web/app/(npd)/pipeline/_actions/_lib/materialize-npd-bom.ts:558
**Class:** Org scoping / readiness false positive
**Scenario:** `formulationHasProcessAssignments` checks `formulation_ingredients` by `version_id` only before joining process rows. If a bad cross-org version relation exists, another org's ingredient assignments can satisfy the readiness check and allow BOM materialization to proceed.
**Fix sketch:** Add `fi.org_id = app.current_org_id()` and equivalent org filters on joined process-assignment tables.

### [P2-05] MRP subtracts packed/shipped quantities without proving they are in the SO order UoM
**File:** apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp.ts:331
**Class:** UoM correctness / demand netting
**Scenario:** `netSalesDemandByItem` groups open SO lines by `sol.order_uom` and subtracts `shipment_box_contents.quantity` directly. If the SO line is ordered in boxes/cases while packed LP content is stored in base or inventory UoM, the open-demand calculation under- or overstates demand without conversion.
**Fix sketch:** Store and subtract shipped quantity in the SO line UoM, or join item/UoM conversion metadata and convert packed content before netting.

### [P2-06] MRP demand horizon excludes undated sales orders
**File:** apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp.ts:335
**Class:** Planning correctness / silent omission
**Scenario:** The MRP demand query requires `so.requested_ship_date <= horizon`. Draft/confirmed sales orders with a null requested ship date are silently ignored instead of being included in immediate demand or rejected as unplannable. A user can create a confirmed SO without a date and MRP will not plan supply for it.
**Fix sketch:** Either require requested ship date before SO confirmation or include null requested dates as immediate demand with an explicit warning.

## Totals

- P0: 10
- P1: 12
- P2: 6
- Total: 28

## Top 8 to Fix First

1. [P0-01] Sales order partial-commit bug.
2. [P0-02] through [P0-10] server-action non-async exports, because any one can break deploy/build.
3. [P1-04] scanner receive wrong-site warehouse fallback.
4. [P1-05] scanner receive invisible-site destination location.
5. [P1-08] receipt WAC silent skip.
6. [P1-09] duplicate shipment creation after packed/manifested.
7. [P1-10] POD delivered with no proof artifact.
8. [P1-12] delivered lifecycle regression to shipped.

## Systemic Patterns

- Server-action modules repeatedly mix runtime actions with exported DTO types. This is a deploy-risk pattern and should be linted.
- Scanner APIs often trust scanner bearer sessions as permission-equivalent. They need parity with desktop RBAC and explicit site checks on every read/write target.
- Several workflows validate after the first write or return normal failure objects inside `withOrgContext`. Any post-write failure must throw or be moved before mutation.
- Financial and planning paths still convert precision-sensitive values or UoM quantities through insufficiently typed representations (`number`, raw packed quantity) instead of explicit decimal/UoM conversion boundaries.

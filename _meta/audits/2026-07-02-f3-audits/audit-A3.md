# Wave F3 / Lane A3 — Gap Audit: Warehouse + Shipping + Quality + Finance/Reporting

**Tree:** main @ `4248cbc0` · **Method:** read-only, claim-vs-enforcement, file:line evidence.
**Legend:** [KNOWN <roadmap-item>] already on ROADMAP · [NEW] not on roadmap · [IN-FLIGHT] F2/F3 is fixing this exact spot.
**Reference-count re-verification (clean source, excl .next/worktree/tests):**
- `wo_actual_costing` (mig-199): **0 app refs** — AND it was DROPPED in `packages/db/migrations/404-drop-dead-tables-p7.sql:13`.
- `customer_addresses` / `customer_contacts` (mig-211): **0 app refs** (schema-only, `packages/db/migrations/211-shipping-schema-foundation.sql`).
- `certificate_refs` (mig-162): **wired** (read in list-supplier-specs). `declared_allergens` / `declared_attrs`: **0 app refs** (migrations/seeds only).

---

## A. Finance + Reporting

| ID | Sev | Tag | Finding | Evidence |
|----|-----|-----|---------|----------|
| F-1 | P2 | [NEW] | Roadmap 4.8 targets `wo_actual_costing` for the WO cost snapshot, but that table was **DROPPED** in mig-404. WO costing (`wo-cost-actions.ts`) is header-declared READ-ONLY ("no valuation snapshots") — 4.8 must first RECREATE the table, not just wire it. Roadmap assumes the schema exists; it doesn't. | `packages/db/migrations/404-drop-dead-tables-p7.sql:13` (`drop table if exists public.wo_actual_costing`); `.../finance/_actions/wo-cost-actions.ts:23` |
| F-2 | P2 | [KNOWN 4.8] | No WO cost snapshot at completion anywhere — cost is recomputed on every read. Completed-WO costs are recomputed per-request in a loop. | `.../finance/_actions/wo-cost-actions.ts:452-497` (`listCompletedWoCosts` loops `computeWoActualCostInContext`) |
| F-3 | P3 | [IN-FLIGHT] | Inventory valuation now has the unvalued bucket + SQL SUM aggregation — the F2/F3 valuation fix **landed**. Groups by `wac` in addition to item (harmless since `item_wac_state` is 1-row/item). | `.../finance/valuation/_actions/get-inventory-valuation.ts:127-153` |
| F-4 | P3 | [IN-FLIGHT] | WAC `ON CONFLICT DO UPDATE` correct + clamped-at-zero; reversal wired into direct-adjust (`readWacDeltaValue`→`upsertWac`). WAC fix **landed**. | `apps/web/lib/finance/upsert-wac.ts:56-60`; `.../warehouse/_actions/direct-adjust-actions.ts:452-458` |
| F-5 | P3 | [NEW] | `resolveWacDeltaQtyKg` silent fall-through: unknown UoM returns `resolved:false` but still feeds RAW qty into WAC (line 95 `else $1::numeric`). Caller flags it but a wrong-unit qty can still poison WAC total_qty_kg. | `apps/web/lib/finance/upsert-wac.ts:95,105` |
| F-6 | P3 | [NEW] | Finance landing page has 3 hardcoded EN strings on a shipped screen ("Scrap / waste cost", "Completed WOs in selected period", "Inventory valuation") — violates D9/T1. | `.../finance/page.tsx:76,80,110` |
| F-7 | P2 | [KNOWN D7] | Reporting silent truncations, no pagination: production WO rows `limit 20`, receipts `limit 50`, shipments `limit 50`, completed-WO costs `limit 25`. Under volume the dashboards under-report with no warning. | `.../reporting/_actions/report-read-actions.ts:315,608,722`; `.../finance/_actions/wo-cost-actions.ts:478` |
| F-8 | P3 | [NEW] | Reporting honestly documents an un-computable metric: `avgConfirmedToFirstGrnDays: null` because PO status changes aren't timestamped (no `confirmed_at`). Real gap = PO status history missing. | `.../reporting/_actions/report-read-actions.ts:903-905,946` |

## B. Warehouse (LP/locations/movements/adjustments/counts/GRN/TO)

| ID | Sev | Tag | Finding | Evidence |
|----|-----|-----|---------|----------|
| W-1 | P2 | [KNOWN 4.3] | Cycle-count **not seeded**: `createCountSession` inserts a bare session with NO expected-qty lines snapshotted from LPs — it's a blind count requiring manual per-LP `recordCount`. No add-line-from-stock, no freeze/snapshot. | `.../warehouse/counts/_actions/count-actions.ts:810-815` |
| W-2 | P2 | [KNOWN 4.3] | Count session has NO cancel/abandon leg (only `closeCountSession`), and close does NOT verify all lines counted (blind close from open/counting/review allowed). No SoD (recorder = approver). | `.../warehouse/counts/_actions/count-actions.ts:1203-1226` |
| W-3 | P3 | [KNOWN D7] | `list-adjustments` `limit 100` no pagination — silent truncation. | `.../warehouse/adjustments/_actions/list-adjustments.ts:69` |
| W-4 | P3 | [KNOWN 2.1] | Direct-adjust has no evidence/attachment capture (adjustment reason free-text only; roadmap 2.1 attachments layer absent). | `.../warehouse/_actions/direct-adjust-actions.ts` (no attachments path) |
| W-5 | P3 | [IN-FLIGHT] | `releaseLpQa` (goods-in QC gate) correctly checks `holdsGuard` before releasing and only acts on `qa_status='pending'` LPs — cannot release held stock. Well-gated. | `.../warehouse/_actions/lp-qa-actions.ts:61,66-67,93` |

## C. Shipping (SO/allocation/pick/pack/ship/BOL/customers)

| ID | Sev | Tag | Finding | Evidence |
|----|-----|-----|---------|----------|
| S-1 | P1 | [KNOWN 2.3] | **Customer master CRUD incomplete**: `customer-actions.ts` exports ONLY `listCustomers` + `createCustomer`. NO update, NO deactivate, NO address/contact. mig-211 `customer_addresses`/`customer_contacts` = 0 app refs. Once created a customer can't be edited or given a ship-to address. | `.../shipping/customers/_actions/customer-actions.ts:192,221` (only 2 exports); customers/page.tsx has no edit/deactivate/address controls, empty `_components/` |
| S-2 | P2 | [KNOWN 2.2/M5] | **BOL is not a document**: `generateBol` stores serialized JSON into the `bol_pdf_url` column + a SHA-256 hash. No HTML→PDF render. The "BOL" and packing slip are data records, not printable paperwork (D4 fail). | `.../shipping/_actions/ship-actions.ts:433,440,453-454` |
| S-3 | P1 | [KNOWN 3.4] | **GS1-128/SSCC absent**: `packages/gs1` does not exist. `shipment_boxes.sscc` is only READ (nullable string) — no SSCC-18 generation, no check-digit, no GS1 AI codec anywhere. Retailer sell-blocker. | pack-actions.ts:287,338 (read-only `sscc`); `ls packages/gs1` → absent |
| S-4 | P2 | [NEW] | **SO state machine allows backward un-shipping**: `shipped → allocated/confirmed/packed` and `delivered → shipped` are LEGAL transitions. Reverting a shipped/delivered SO to `allocated` can re-allocate already-shipped stock and orphan the physical shipment — an integrity hole the LEGAL_TRANSITIONS rewrite (1.8) did not close. | `.../shipping/_actions/so-transitions.ts:50-52` |
| S-5 | P3 | [NEW] | `SHIPMENT_LEGAL_TRANSITIONS.exception: []` is a terminal status with NO transition INTO it from any state — `exception` is unreachable dead state (only referenced in the list filter + type). | `.../shipping/_actions/so-transitions.ts:56-64`; shipments-list-view.tsx:53 |
| S-6 | P3 | [IN-FLIGHT] | SO/shipment lifecycle 1.8 largely landed: explicit LEGAL_TRANSITIONS maps, `cancelled:[]` terminal, ship-time hold re-check against `v_active_holds`. | so-transitions.ts:41-65; ship-actions.ts:219,235 |
| S-7 | P3 | [NEW] | Partial-ship LP correctly stays in prior pickable status (guards frozen-stock) — good. But `source_so_id` is NOT stamped on the LP at ship; only in the outbox payload. Forward-trace survives via the `get_forward_shipments_org_wide` box-walk, so not a trace blocker, but the LP row loses its SO linkage for any other consumer. | ship-actions.ts:275-296 (no source_so_id set), :354 (so_id only in outbox) |

## D. Quality (holds/inspections/NCR/CCP/complaints/trace/recall)

| ID | Sev | Tag | Finding | Evidence |
|----|-----|-----|---------|----------|
| Q-1 | P1 | [KNOWN 0.3/D1] | **No mass-balance reconciliation** in trace: `summary` has only lpCount/woCount/shipmentCount/customersAffected/totalKg — no "produced = on-site + shipped + waste, % recovered". BRCGS D1 acceptance requires it; roadmap 0.3 lists "add mass-balance reconciliation" — NOT implemented. | `.../quality/trace/_actions/trace-actions.ts:70-76,753-759` |
| Q-2 | P1 | [KNOWN 0.3] | **No silent-truncation warning** in trace despite `limit 200` / `limit 500` on the graph node/edge queries. A large recall silently drops affected LPs/consumption rows with no operator warning — the exact scenario roadmap 0.3 flags. | `.../quality/trace/_actions/trace-actions.ts:289,302,315` (no truncation flag surfaced in summary) |
| Q-3 | P2 | [KNOWN 3.11] | **Recall is drill-only**: `recall-drills/_actions` dir is EMPTY; recall reuses `startRecallDrill` in trace-actions. No classification, notification log, effectiveness, closure, "hold all N LPs" bulk, regulator PDF, or annual-drill reminder. | `recall-drills/` has no `_actions`; trace-actions.ts:772-789 (`startRecallDrill` = drill row + report only) |
| Q-4 | P2 | [KNOWN 3.1] | **CAPA panel not reused on NCR**: `capa-panel.client.tsx` exists only under `complaints/_components/`; not imported into `ncrs/`. NCR stores a `capa_record_id` FK but has no CAPA panel / effectiveness-verification UI. | `capa-panel.client.tsx` only in complaints/_components; ncr-actions.ts:76,401,440 (FK only) |
| Q-5 | P3 | [IN-FLIGHT] | **CCP-deviation resolve (0.4) fully landed**: real `signEvent` (intent `qa.haccp.ccp.deviation` + `qa.hold.release`), honors disposition — releases hold via `releaseHoldCore` ONLY when disposition=release, else quarantines. No auto-release, no fabricated hash. | `.../quality/_actions/ccp-deviation-actions.ts:399,432-467,444-455` |
| Q-6 | P3 | [IN-FLIGHT] | **Hold-model single gate (0.6) largely landed**: `holdsGuard` used at 13 non-test call sites incl. consume/output/waste/TO-ship/adjust/counts/scanner; batch-hold via `reference_text` (mig-412); inspection failed-decision creates a real LP hold + qa_status. | `apps/web/lib/production/holds-guard.ts:71-101`; inspection-actions.ts:286-338 |
| Q-7 | P2 | [KNOWN 4.9] | `declared_allergens`/`declared_attrs` (mig-162) unwired — supplier-spec allergen declaration + mismatch-flag vs item profile not captured/displayed. `certificate_refs` IS read but never verified/gated (roadmap 3.6 CoA positive-release absent). | `.../technical/items/[item_code]/_actions/list-supplier-specs.ts:85-88` (reads certificate_refs, NOT declared_allergens); mig-162 only refs |

---

## TOP-10 (NEW first, then severity)

1. **[NEW · P2] F-1** — Roadmap 4.8's snapshot target `wo_actual_costing` was DROPPED (mig-404:13); the finance-snapshot backbone must be recreated, not wired. Roadmap is stale on this.
2. **[NEW · P1] S-4** — SO state machine allows `shipped/delivered → allocated/confirmed` (so-transitions.ts:50-52): un-shipping can re-allocate already-shipped stock / orphan shipments. The 1.8 rewrite didn't close it.
3. **[NEW · P3] F-5** — WAC unit-mixing residual: `resolveWacDeltaQtyKg` unknown-UoM path feeds RAW qty into WAC total_qty_kg (upsert-wac.ts:95) even while flagging unresolved.
4. **[NEW · P3] S-5** — `exception` shipment status is unreachable dead state (so-transitions.ts:56-64); no path writes it.
5. **[NEW · P3] F-6** — Hardcoded EN on shipped Finance page (page.tsx:76,80,110) — D9/T1 violation.
6. **[NEW · P3] F-8 / S-7** — PO status changes untimestamped (no confirmed_at → cycle metric permanently null); LP `source_so_id` never stamped at ship (only in outbox).
7. **[KNOWN 0.3/D1 · P1] Q-1** — No mass-balance / %-recovered reconciliation in trace: BRCGS mock-recall acceptance (D1) cannot be met.
8. **[KNOWN 0.3 · P1] Q-2** — Trace graph silently truncates at limit 200/500 with no warning: a real recall can under-report affected stock.
9. **[KNOWN 2.3 · P1] S-1** — Customer master is create+list only; no update/deactivate/address; mig-211 tables 0-referenced. Blocks BOL ship-to, credit, DESADV.
10. **[KNOWN 3.4/2.2 · P1] S-3 / S-2** — GS1-128/SSCC entirely absent (no packages/gs1, sscc read-only); BOL/packing-slip are JSON+hash data records, not rendered documents (D4 fail).

**Landed / verified-good (do NOT re-flag as gaps):** valuation unvalued-bucket + SQL agg (F-3), WAC ON CONFLICT + reversal (F-4), CCP-deviation resolve with e-sign + disposition (Q-5), holdsGuard single-gate + batch reference_text + inspection-decision hold (Q-6), SO/shipment LEGAL_TRANSITIONS + ship-time hold recheck (S-6), goods-in QC gate holdsGuard-checked (W-5), forward-trace via definer box-walk (customers ARE named).

# HANDOFF — Phase C4 Sesja 2 CLOSE → C4 Sesja 3 bootstrap

**From:** Phase C4 Sesja 2 (2026-04-20) — 10-FINANCE writing
**To:** Phase C4 Sesja 3 — 11-SHIPPING writing + INTEGRATIONS stage 3 inline + 02-SETTINGS v3.1 bundled revision
**Phase:** C4 Sesja 1 CLOSED → **C4 Sesja 2 CLOSED** → C4 Sesja 3 NEXT (11-SHIPPING) → C5 batch (12-15)

---

## 🏁 Phase C4 Sesja 2 COMPLETE

### Deliverable

**`10-FINANCE-PRD.md` v3.0** — **1318 linii, 18 sekcji**, 10 D-decisions (Q1-Q10), 5 sub-modules build 10-a..e (18-23 sesji impl est. P1), 11 P2 epics (10-F..10-P, +14-20 sesji impl).

Baseline v1.0 (663 linii, 2026-02-18, 19 tabel, 26 stories) w pełni przepisany do v3.0 convention. D-FIN-1..10 decyzje zachowane + rozszerzone o cross-PRD integracje (08-PROD outbox reuse, 09-QA yield consumer, 04-PLAN DAG cascade).

### Kluczowe decyzje C4 Sesja 2 (Q1-Q10 user approved 2026-04-20)

| Q | Decyzja | Rationale |
|---|---|---|
| **Q1 ✅** | Costing method = **C** FIFO + WAC parallel P1 (DSL rule `cost_method_selector_v1`) | Baseline D-FIN-4 retained; schema-driven method resolution per transaction |
| **Q2 ✅** | WIP cost timing = **A** real-time per consume transaction | GAAP-aligned, matches 05-WH scan-to-consume pattern |
| **Q3 ✅** | Yield variance = **A** per WO P1 + Finance aggregates P2 | Reuse 08-PROD `output_yield_gate_v1` consumer, minimal new infrastructure |
| **Q4 ✅** | Waste cost allocation = **A** full cost × qty per category P1 + recovery credit P2 | Spójne z 09-QA `waste_categories` ref table registered w 02-SETTINGS §8 |
| **Q5 ✅** | D365 cost posting = **B** daily consolidated journal P1 | Matches period-close practice, zmniejsza D365 API load 100x+ vs per-WO |
| **Q6 ✅** | Material cost ingestion = **B** D365 pull P1 (extend 03-TECH §13 stage 1) | Forza reality: D365 = source of truth dla RM costs; stage 1 sync adds `cost_per_kg` field |
| **Q7 ✅** | P2 deferred scope = all (budget, margin, savings, variance decomp, multi-currency, complaint cost, AR/AP, landed cost, OCR, alerts, revaluation) + **Comarch Optima WYCOFANE** | Monopilot zastępuje D365 docelowo; Comarch nie dotyczy Forza. Baseline D-FIN-6 refactored do stage 5. |
| **Q8 ✅** | DSL rules = 2 P1 (`cost_method_selector_v1`, `waste_cost_allocator_v1`) + 1 P2 stub (`standard_cost_approval_v1`) | Spójny pattern z 07/08/09 module rule registrations |
| **Q9 ✅** | Currency base = **GBP** (Forza mieści się w UK — user clarification) | Multi-currency P2 EPIC 10-J |
| **Q10 ✅** | Standard cost approval P1 = **A** `finance_manager` sole approver | Simple RBAC P1, dual sign-off upgrade via `standard_cost_approval_v1` v2.0 P2 |

### Core innovations 10-FINANCE v3.0

| # | Innovation | Section | Marker |
|---|---|---|---|
| 1 | **2 DSL rules registered w 02-SETTINGS §7** (`cost_method_selector_v1` FIFO/WAC per-org, `waste_cost_allocator_v1` full-loss/recovery) + 1 P2 stub (`standard_cost_approval_v1`) | §10 | [UNIVERSAL] |
| 2 | **Cascade-aware cost rollup** (recursive CTE walks 04-PLAN `wo_dependencies` DAG, parent WO cost = own + Σ child cascade_totals) | §9 | [UNIVERSAL] |
| 3 | **Co-product allocation** (`bom_co_products.allocation_pct` consumer z 03-TECH, primary_cost × (1 - Σ co_pct) dla primary, each co_pct × cost dla co-products) | §9.3 | [UNIVERSAL] |
| 4 | **INTEGRATIONS stage 5 D365 cost posting** — exact reuse 08-PROD §12 stage 2 outbox pattern (template convergence). Daily consolidated `GeneralJournalLineEntity` DMF push. R14 UUID v7 idempotency, R15 adapter. | §12 | [LEGACY-D365] |
| 5 | **Cost timing real-time per consume** (Q2) — 05-WH `material.consumed` event handler z rule `cost_method_selector_v1` resolve FIFO layer lub WAC avg | §13.1 | [UNIVERSAL] |
| 6 | **FIFO + WAC parallel tracking** (`inventory_cost_layers` FIFO per LP + `item_wac_state` running avg per item) — org wybiera metodę domyślną, system utrzymuje obie | §6.4 | [UNIVERSAL] |
| 7 | **cost_per_kg dual ownership** (D-FIN-9 retained: 03-TECH schema owner, 10-FIN lifecycle owner — writes on standard_cost.approved) | §13.2 | [UNIVERSAL] |
| 8 | **Yield loss monthly aggregation** (09-QA `ncr_reports` yield_issue + claim_value_eur query → GBP widget FIN-001) | §13.3 | [UNIVERSAL] |
| 9 | **21 CFR Part 11 e-signature** dla standard_cost approval (SHA-256 hash + PIN re-verification + immutability trigger `prevent_approved_standard_cost_update`) | §5.3, §6.4 | [UNIVERSAL] |
| 10 | **7-year retention BRCGS** via `retention_until` DATE GENERATED columns + nightly archival do `archive_finance.*` schema | §5.2 | [UNIVERSAL] |
| 11 | **GBP base currency** (Q9 Forza UK, user clarification) + multi-currency P2 EPIC 10-J | §5.5, §14 | [FORZA-CONFIG] |
| 12 | **15 P1 tables + 3 supporting** (streamlined vs v1.0 19 tables: dropped variance_thresholds/alerts/exports/budgets do P2) | §6 | [UNIVERSAL] |
| 13 | **29 V-FIN validation rules** (SETUP/STD/WO/INV/VAR/INT) | §11 | [UNIVERSAL] |
| 14 | **Comarch Optima retired** (Q7) — D365 F&O = sole external ERP target, baseline D-FIN-6 refactored | §3.2 exclusions | — |
| 15 | **D365 Constants consumer** (dataAreaId=FNOR, warehouse=ForzDG, account=FinGoods) read z 02-SETTINGS §11 w outbox adapter | §12.8 | [LEGACY-D365] |

### Cross-PRD consistency check ✅

**10-FIN ↔ 08-PRODUCTION v3.0:**
- Consumer `wo.completed` event → trigger cost finalize (recursive CTE + variance + outbox enqueue) ✅
- Consumer `wo_output.registered` event → allocation_pct split per output_type ✅
- Consumer `waste.logged` event → rule `waste_cost_allocator_v1` apply ✅
- Consumer `labor.recorded` event → labor_costs insert ✅
- **INTEGRATIONS stage 5 = exact clone stage 2** (same outbox schema, same retry schedule 5min/30min/2h/12h/24h, same DLQ pattern, same R14/R15). Shared `@monopilot/d365-*-adapter` test harness. ✅

**10-FIN ↔ 03-TECHNICAL v3.0:**
- Consumer `items` schema (item_type rm/intermediate/fa/co_product/byproduct) ✅
- Consumer `bom_co_products.allocation_pct` dla cost split ✅
- **Dual ownership `items.cost_per_kg`** (D-FIN-9 retained: schema 03-TECH, lifecycle 10-FIN via standard_cost.approved handler) ✅
- Consumer `d365.items.imported` event (stage 1 extended w 03-TECH §13) → create `standard_costs` draft status='pending' ✅

**10-FIN ↔ 09-QUALITY v3.0:**
- Consumer `ncr_reports` WHERE `ncr_type='yield_issue'` monthly aggregation (claim_value_eur → GBP via exchange_rates) ✅
- P2 Consumer `quality.hold.created/released` events → freeze/unfreeze cost layers ✅
- `quality_complaints` stub (09-QA §6) → P2 EPIC 10-K complaint cost allocation ✅

**10-FIN ↔ 05-WAREHOUSE v3.0:**
- Consumer `lp.received` event → insert inventory_cost_layers (FIFO) + update item_wac_state (WAC) both parallel ✅
- Consumer `material.consumed` event → resolve method via `cost_method_selector_v1` → FIFO layer consume OR WAC avg apply ✅
- P2 consumer `license_plates.cost_at_creation` snapshot (05-WH §13 P2) ✅
- Reuse FSMA 204 lot genealogy CTE (via 05-WH §11) dla recall cost P2 ✅

**10-FIN ↔ 04-PLANNING-BASIC v3.1:**
- Consumer `wo_dependencies` DAG (§8.5) dla cascade rollup recursive CTE ✅
- V-PLAN-WO-CYCLE rule enforced upstream (cycle detection dla safe recursion) ✅

**10-FIN ↔ 07-PLANNING-EXT v3.0:**
- P2 consumer Prophet forecast bridge (§6) → budget/forecast module EPIC 10-F ✅
- Consumer `changeover_matrix` (07-EXT §7) → changeover cost modeling (setup time × labor rate) P2 ✅

**10-FIN ↔ 02-SETTINGS v3.0 (pending v3.1 delta):**
- Registers 2 DSL rules w §7 (cost_method_selector_v1, waste_cost_allocator_v1) + 1 P2 stub ✅
- Reads D365 Constants §11 (dataAreaId=FNOR, warehouse=ForzDG, finished_goods_account=FinGoods) ✅
- Reuses generic reference table infrastructure §8 (no new 10-FIN ref tables added) ✅
- **Action item:** Cross-PRD revision 02-SETTINGS v3.1 delta application — **BUNDLED z C4 Sesja 3 post 11-SHIPPING** (oszczędność 1 sesji vs separate revision)

**10-FIN ↔ 06-SCANNER-P1 v3.0:**
- **No direct scanner interaction** (finance = desktop module). Indirect via 08-PROD scanner events which trigger WO cost hooks. ✅

### Resolved open questions from C4 Sesja 1

- ✅ **None direct** — Sesja 1 OQ-QA-* były wszystkie post-launch / P2, nie blokowały Sesja 2

### New open items (OQ-FIN-01..12)

12 open items, wszystkie P2 / post-launch / future sessions. Nie blokują C4 Sesja 3.

---

## Phase C4 Sesja 2 summary

| Sesja | Data | Deliverable | Linii |
|---|---|---|---|
| **C4 Sesja 1** | 2026-04-20 | 09-QUALITY v3.0 | 1739 |
| **C4 Sesja 2** | **2026-04-20** | **10-FINANCE v3.0** | **1318** |

**Observation C4 Sesja 2:** 10-FINANCE zamknięte w 1 sesji (est. 1-2, w budżecie — mid-size module jak 07-EXT). Kluczowe czynniki sukcesu:
1. **Explore agent bootstrap** — kompaktowy ~3500-word summary zastąpił reading 9 full PRDów + MES-TRENDS. Skoncentrowany na finance-relevant sections (§11 cost_per_kg, §12 outbox, §7 BOM allocation, §11 D365 Constants, §7 rules registry).
2. **Outbox template reuse** — 08-PROD §12 stage 2 pattern = 10-FIN stage 5 clone. Zero redesign. Shared implementation artifact (`@monopilot/d365-*-adapter` shared test harness).
3. **D-FIN-1..10 baseline retain + extend** — v1.0 decision foundation była solidna; v3.0 extension (DSL rules + cascade + consumer hooks).
4. **Q1-Q10 all match recommendations + user clarification Q9 GBP** — zero rewrite po user response.
5. **Comarch retirement decision** — jasne cutoff (Monopilot zastępuje D365, Comarch nie relevant dla Forza) → clean v3.0 scope bez legacy baggage.

**Drugi ważny moment:** **Stage 5 INTEGRATIONS convergence confirmed** — template pattern established przez 08-PROD §12 stage 2 z C3 Sesja 1 = stage 5 tutaj = stage 3 (11-SHIPPING C4 Sesja 3) = stage 4 (05-WH EPCIS P2). Shared outbox + DLQ + R14/R15 across stages.

---

## Phase C4 Sesja 3 scope + bootstrap

### Scope C4 Sesja 3

**Primary deliverable:** `11-SHIPPING-PRD.md` v3.0 — outbound shipment management + dispatch notes + batch release gate (09-QA consumer) + INTEGRATIONS stage 3 (D365 SalesOrder confirm push, shipment confirmations, reuse outbox pattern).

**Secondary deliverable:** Cross-PRD revision **02-SETTINGS v3.1 bundled delta apply** (3 rules z 10-FIN + potentially new rules/ref tables z 11-SHIPPING — full bundle w jednej revision pass).

**Est.** 1-2 sesje (11-SHIPPING est. 1000-1300 linii — mid-size, shipping is less complex than warehouse/production). Bundled revision +0.5 sesji overhead.

### Bootstrap C4 Sesja 3 (11-SHIPPING)

1. Read `_meta/handoffs/2026-04-20-c4-sesja2-close.md` (this file)
2. Read `05-WAREHOUSE-PRD.md` v3.0 §6-7 LP lifecycle + §13.7 EPCIS P2 stub (cross-reference shipping LP state transitions)
3. Read `09-QUALITY-PRD.md` v3.0 §6 quality_holds + batch_release_gate_v1 (P2) — shipping blocks on released status
4. Read `08-PRODUCTION-PRD.md` v3.0 §12 INTEGRATIONS stage 2 (outbox template reference — same as 10-FIN used)
5. Read `04-PLANNING-BASIC-PRD.md` v3.1 §7 customer_orders + SO trigger (D365 SO pull → WO gen)
6. Read `03-TECHNICAL-PRD.md` v3.0 §8 catch weight + GS1 (SSCC for pallet shipment)
7. Read `02-SETTINGS-PRD.md` v3.0 §11 D365_Constants (shipment config reuse) + §7 rules (potential new rules from 11-SHIP)
8. Read `10-FINANCE-PRD.md` v3.0 §6 `inventory_cost_layers` (COGS per shipment P2)
9. Read `_foundation/research/MES-TRENDS-2026.md` §9 11-SHIPPING R-decisions
10. Read baseline `11-SHIPPING-PRD.md` pre-Phase-D
11. Propose outline → user Q&A → full write
12. Apply **bundled 02-SETTINGS v3.1 delta** (10-FIN + 11-SHIP changes in single revision pass)
13. Update memory + close HANDOFF → C5 bootstrap

### Key dependencies handoff C4 Sesja 2 → C4 Sesja 3

| C4 Sesja 2 deliverable | C4 Sesja 3 consumer context |
|---|---|
| 10-FIN `inventory_cost_layers` + `item_wac_state` | 11-SHIP P2 COGS per shipment (consume layers at shipment confirm event) |
| 10-FIN INTEGRATIONS stage 5 outbox pattern | 11-SHIP stage 3 **template reuse** — SO confirmation push to D365 SalesOrderHeader/Lines |
| 10-FIN `wo_cost_rollups` posted_to_d365 | 11-SHIP shipment posting correlation (same journal batch?) |
| 10-FIN GBP base currency | 11-SHIP shipment value in GBP + VAT codes reuse |
| 10-FIN D365 Constants consumer (FNOR, ForzDG) | 11-SHIP same constants + potential additional (customer, shipping_warehouse) |
| Pending 02-SETTINGS v3.1 delta (3 rules from 10-FIN) | Bundle together — avoid 2 separate revisions |

### Key questions do rozstrzygnięcia w C4 Sesja 3 (11-SHIPPING)

- **Q1** Shipment trigger source — **A** D365 SO pull (04-PLAN §7 existing) + Monopilot ships / **B** Monopilot standalone sales + D365 pull P2 / **C** External WMS integration?
- **Q2** Pick/pack workflow — **A** Scanner-integrated (06-SCN extension) / **B** Desktop list / **C** Both (scanner for pallet, desktop for mixed)?
- **Q3** SSCC labeling — **A** GS1-128 pallet labels P1 / **B** Deferred P2 / **C** Stage 4 EPCIS-ready P1?
- **Q4** Carrier integration — **A** Manual dispatch note P1 + carrier API P2 / **B** Booked courier API P1 (DHL/UPS)?
- **Q5** D365 shipment confirm — **A** Per-shipment push / **B** Daily consolidated (like 10-FIN) / **C** Real-time?
- **Q6** Batch release gate — **A** Hard gate via `batch_release_gate_v1` (P2 rule from 09-QA) / **B** Soft warning override / **C** Skip if no QA plan?
- **Q7** COGS timing — **A** At shipment confirm P2 (consumes FIFO layers) / **B** At invoice post (D365 AR) / **C** Monthly COGS reclass?
- **Q8** Multi-leg shipments — **A** Single shipment = single dispatch P1 / **B** Partial shipments support P1 / **C** Multi-leg chains P2?

### Open items carry-forward z C4 Sesja 2

**10-FIN open questions (OQ-FIN-*):** 12 items, wszystkie P2 / post-launch. Nie blockery.

**Bundled revision carry:** 02-SETTINGS v3.1 delta — 3 rules z 10-FIN + potentially new z 11-SHIP + any ref tables z 11-SHIP. Apply w C4 Sesja 3 close.

---

## Phase C progress overall (updated)

| Batch | Status | Moduły | Sesji actual |
|---|---|---|---|
| **C1** | ✅ COMPLETE | 02-SETTINGS + 03-TECHNICAL | 2 sesje (2026-04-19/20) |
| **C2 Sesja 1** | ✅ COMPLETE | 04-PLANNING-BASIC v3.0 | 1 (2026-04-20) |
| **C2 Sesja 2** | ✅ COMPLETE | 05-WAREHOUSE v3.0 + 04-PLANNING v3.1 revision | 1 (2026-04-20) |
| **C2 Sesja 3** | ✅ COMPLETE | 06-SCANNER-P1 v3.0 | 1 (2026-04-20) |
| **C2 CLOSED** | ✅ | batch 3 sesje | **3** |
| **C3 Sesja 1** | ✅ COMPLETE | 07-PLANNING-EXT v3.0 + 08-PRODUCTION v3.0 + INTEGRATIONS stage 2 | 1 (2026-04-20) |
| **C3 CLOSED** | ✅ | batch 1 sesja | **1** |
| **C4 Sesja 1** | ✅ COMPLETE | 09-QUALITY v3.0 | 1 (2026-04-20) |
| **C4 Sesja 2** | ✅ **COMPLETE** | **10-FINANCE v3.0 + INTEGRATIONS stage 5** | **1 (2026-04-20)** |
| **C4 Sesja 3** | ⏭ NEXT | 11-SHIPPING + INTEGRATIONS stage 3 + 02-SETTINGS v3.1 bundled delta | ~1-2 |
| **C5** | pending | 12-REPORTING + 13-MAINTENANCE + 14-MULTI-SITE + 15-OEE | ~3-4 |

**Pozostało writing Phase C:** C4 Sesja 3 + C5 = **4-6 sesji**.

**Total Phase C done:** C1 (2) + C2 (3) + C3 (1) + C4 Sesja 1-2 (2) = **8 sesji** (est. ~5-7, lekko over z Q&A thoroughness + dual-costing complexity).

---

## Kumulatywne deliverables Phase B+C (kompletne PRDy v3.0+)

| # | PRD | Wersja | Linii | Kluczowe innowacje |
|---|---|---|---|---|
| 1 | 00-FOUNDATION | v3.0 | 744 | 6 principles, markers, R1-R15, ADR-028/029/030/031 |
| 2 | 01-NPD | v3.0 | 1520 | PLD v7 equivalent + Brief + Allergens RM→FA + D365 Builder N+1 |
| 3 | 02-SETTINGS | v3.0 (v3.1 pending) | 1343 | Schema admin wizard L1-L4, rules registry, reference CRUD |
| 4 | 03-TECHNICAL | v3.0 | 1184 | Product master rm/intermediate/fa, BOM versioning, co-products, catch weight |
| 5 | 04-PLANNING-BASIC | v3.1 | 1528 | PO/TO/WO lifecycle, intermediate cascade DAG, workflow-as-data |
| 6 | 05-WAREHOUSE | v3.0 | ~1700 | Intermediate LP scan-to-consume, FEFO DSL, multi-LP GRN, lot genealogy |
| 7 | 06-SCANNER-P1 | v3.0 | 1504 | SCN-080 intermediate consume, 3-method input parity, PIN auth, LP lock |
| 8 | 07-PLANNING-EXT | v3.0 | 1368 | Heuristic solver, allergen optimizer DSL v2, Prophet bridge P2, disposition bridge P2 |
| 9 | 08-PRODUCTION | v3.0 | 2088 | Allergen changeover gate, INTEGRATIONS stage 2, per-minute OEE, BRCGS 7y audit |
| 10 | 09-QUALITY | v3.0 | 1739 | 3 DSL rules, 08-PROD E7 consumer, SCN-070..073 backend, BRCGS+FSMA+21 CFR |
| 11 | **10-FINANCE** | **v3.0** | **1318** | **Cascade cost rollup, FIFO+WAC parallel, INTEGRATIONS stage 5 D365 daily consolidated, 2 DSL rules, cost_per_kg lifecycle, 21 CFR e-sig, BRCGS 7y** |

**Total Phase B+C done:** **~16,036 linii PRD w 11 modułach** fundamentowych + operation + scheduling + quality + finance.

---

## Closing note

C4 Sesja 2 zamknęła 10-FINANCE w 1 sesji (est. 1-2, w budżecie). Pattern v3.0 w pełni stabilny:

1. **Q&A pre-write** — 10 pytań rozstrzygniętych upfront (rekord ilości pytań), zero rewrites. User clarification Q9 GBP (UK) zamiast propozycji EUR.
2. **Explore agent bootstrap** — kompaktowe summary 9 źródeł + baseline + MES-TRENDS zamiast reading full files. ~3500 słów output vs ~20000+ słów raw read.
3. **Template reuse dyscyplina** — INTEGRATIONS stage 5 = stage 2 clone (zero redesign, shared artifacts). Pattern convergence driver.
4. **Comarch retirement** — clean cutoff decision (D365 = sole ERP target), baseline D-FIN-6 refactored bez legacy baggage.
5. **Dual ownership `items.cost_per_kg`** — D-FIN-9 z v1.0 baseline retained jako cross-PRD contract (03-TECH schema, 10-FIN lifecycle).

**Drugi ważny moment:** **8 sesji Phase C done** — nad cumulatively 11 modułów, ~16k linii PRD, wszystkie v3.0 w jednolitym format. INTEGRATIONS pattern (outbox + DLQ + R14/R15 + adapter) = universal template across 5 stages (1 D365 items/BOM, 2 D365 WO confirm, 3 D365 shipments, 4 EPCIS P2, 5 D365 cost posting).

Phase C4 Sesja 2 **COMPLETE**. Finance cost layer zdefiniowana — core operational module ready do build. 10-FINANCE = 10. PRD v3.0 ze 16,036 linii całkowitych w Phase B+C.

**Next session:** Session reset recommended. C4 Sesja 3 fresh context dla 11-SHIPPING (outbound + dispatch + batch release gate) + INTEGRATIONS stage 3 (D365 SO/shipment) + **bundled 02-SETTINGS v3.1 delta** (10-FIN rules + 11-SHIP potential additions in single revision pass).

---

## Related

- [`10-FINANCE-PRD.md`](../../10-FINANCE-PRD.md) v3.0 — primary deliverable
- [`2026-04-20-c4-sesja1-close.md`](./2026-04-20-c4-sesja1-close.md) — input HANDOFF (C4 Sesja 1 close)
- [`08-PRODUCTION-PRD.md`](../../08-PRODUCTION-PRD.md) v3.0 §12 — INTEGRATIONS stage 2 template (source of truth dla stage 5)
- [`03-TECHNICAL-PRD.md`](../../03-TECHNICAL-PRD.md) v3.0 §11 — cost_per_kg dual ownership partner
- [`09-QUALITY-PRD.md`](../../09-QUALITY-PRD.md) v3.0 §6 — ncr yield_issue + quality_holds consumer
- [`05-WAREHOUSE-PRD.md`](../../05-WAREHOUSE-PRD.md) v3.0 §8/§10/§13 — LP lifecycle events consumer
- [`04-PLANNING-BASIC-PRD.md`](../../04-PLANNING-BASIC-PRD.md) v3.1 §8.5 — wo_dependencies DAG
- [`02-SETTINGS-PRD.md`](../../02-SETTINGS-PRD.md) v3.0 §7 + §11 — rules registry (pending v3.1 delta) + D365_Constants
- [`00-FOUNDATION-PRD.md`](../../00-FOUNDATION-PRD.md) v3.0 — R14 UUID v7 idempotency, R15 anti-corruption adapter
- [`_foundation/research/MES-TRENDS-2026.md`](../../_foundation/research/MES-TRENDS-2026.md) — §9 10-FINANCE R-decisions + §3 regulatory

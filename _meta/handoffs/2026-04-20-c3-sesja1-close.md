# HANDOFF — Phase C3 Sesja 1 CLOSE → C4 bootstrap

**From:** Phase C3 Sesja 1 (2026-04-20) — 07-PLANNING-EXT + 08-PRODUCTION writing (bundled)
**To:** Phase C4 Sesja 1 — 09-QUALITY writing
**Phase:** C2 CLOSED → C3 Sesja 1 CLOSED → **C3 CLOSED** (1 sesja zamiast 2-3 est.) → C4 NEXT

---

## 🏁 Phase C3 Sesja 1 COMPLETE

### Deliverables (dual PRD, 1 sesja!)

**1. `07-PLANNING-EXT-PRD.md` v3.0** — **1368 linii, 16 sekcji**, 5 D-decisions, 4 sub-modules build 07-a..d (14-18 sesji impl est.)
**2. `08-PRODUCTION-PRD.md` v3.0** — **2088 linii, 16 sekcji**, 15 D-decisions, 7 sub-modules P1 (08-a..g, 20-25 sesji impl est.) + 5 P2 (08-h..l, 13-19 sesji impl)

**Total Sesja 1:** 3456 linii PRD, 20 D-decisions, 11 sub-modules Phase 1 + P2 overview. Bundled w 1 sesji (est. C3 było 2-3 sesje — **under budget**).

### Kluczowe decyzje 07-EXT (Q1-Q5 user approved 2026-04-20)

| Q | Decyzja | Rationale |
|---|---|---|
| **Q1 ✅** | Solver engine = **B heuristic greedy + local search** (Python microservice `planner-solver`) zamiast OR-Tools CP-SAT | Simpler deployment, no solver license, fast for Forza scale. OR-Tools upgrade trigger ADR if heuristic <20% changeover reduction after 6mo empirical. |
| **Q2 ✅** | Allergen optimizer = **B pluggable DSL rule** `allergen_sequencing_optimizer_v2` w 02-SETTINGS §7 registry | Consistency z 14 DSL rules pattern. A/B testing v1/v2. Future v3 genetic algorithm same way. |
| **Q3 ✅** | ML forecasting = **A internal Prophet microservice** (P2) | Data sovereignty food industry, $0 external spend, Prophet battle-tested CPG. |
| **Q4 ✅** | Horizon granularity = hour-level internal, day-level UX default | Shift-based 8h blocks natural, hour-zoom for tactical. |
| **Q5 ✅** | Changeover matrix = per-line override allowed | Realistic modeling (LINE-03 Breaded slower changeover). |

### Kluczowe decyzje 08-PROD (Q4-Q8 user approved + D-extensions)

| Q | Decyzja | Rationale |
|---|---|---|
| **Q4 ✅** | OEE = **A per-minute aggregation** Postgres batch job zamiast streaming | Zero ops overhead, 1min granularity sufficient food-mfg. Streaming → P2 08-k. |
| **Q5 ✅** | PLC = **B deferred P2** | P1 manual downtime entry. OPC UA infra dopiero jak Forza ma servery online. |
| **Q6 ✅** | Changeover tracking = **A schema-driven L3** (ADR-028 `ext_jsonb`) | Phase D "easy extension" principle. |
| **Q7 ✅** | D365 push = **B async outbox** zamiast synchronous | MES-TRENDS R1 event-first resilient; D365 downtime nie blokuje produkcji. |
| **Q8 ✅** | Downtime taxonomy = **B admin-configurable** (02-SETTINGS §8) | L2 per-tenant variation (ADR-030 pattern). |

### Core innovations 07-EXT v3.0

| # | Innovation | Section | Marker |
|---|---|---|---|
| 1 | **Heuristic finite-capacity solver** (Python FastAPI microservice, greedy + local search) | §7 E1 | [UNIVERSAL] |
| 2 | **Allergen optimizer v2 as DSL rule** (replaces 04-PLAN §10 v1 heuristic) | §10.2 | [UNIVERSAL] |
| 3 | **Changeover matrix editor** (tenant-wide + per-line override) | §8 SCR-07-02 | [UNIVERSAL] |
| 4 | **Forecast bridge P2** (Prophet internal + manual CSV P1) | §7 E3 | [EVOLVING] |
| 5 | **Disposition bridge P2** (re-introduces `direct_continue`/`planner_decides` z 04-PLAN §8.5 Q6 revision) | §7 E4 | [EVOLVING] |
| 6 | **GanttView scheduler dashboard** | §8 SCR-07-01 | [UNIVERSAL] |
| 7 | **Idempotent runs** R14 UUID v7 | §8.2 POST /run | [UNIVERSAL] |
| 8 | **10 V-SCHED validation rules** | §15.4 | [UNIVERSAL] |

### Core innovations 08-PROD v3.0

| # | Innovation | Section | Marker |
|---|---|---|---|
| 1 | **Allergen changeover gate** DSL rule `allergen_changeover_gate_v1` (cleaning + ATP + dual sign-off) | §7 E7 + §10.2 | [UNIVERSAL] |
| 2 | **INTEGRATIONS stage 2 inline** (outbox pattern, D365 WO push, DLQ, R14 idempotency, R15 anti-corruption adapter) | §12 | [UNIVERSAL + LEGACY-D365] |
| 3 | **Per-minute OEE aggregation** (oee_snapshots table, A×P×Q) | §9.9 + §11.2 | [UNIVERSAL] |
| 4 | **Closed_Production strict all-must-complete** DSL rule (Phase D #17) | §10.3 | [UNIVERSAL] |
| 5 | **Output yield gate** (>10% variance → Prod Manager review) | §10.4 | [UNIVERSAL] |
| 6 | **Operator KPIs** materialized view (consumption speed, FEFO, over-consumption) | §9.12 + §11.3 | [UNIVERSAL] |
| 7 | **Catch weight entry P1 manual**, P2 scale integration | §7 E3 + D13 | [EVOLVING] |
| 8 | **ZPL P2, browser PDF P1** fallback | D14 | [EVOLVING] |
| 9 | **PLC integration deferred P2** | D12 + E8 | [EVOLVING] |
| 10 | **BRCGS Issue 10 compliance** (digital signatures, 7y retention, audit trail) | §5.3 | [UNIVERSAL] |
| 11 | **FSMA 204 genealogy** <2s query (05-WH §11 consumer) | §11 KPI | [UNIVERSAL] |
| 12 | **25 V-PROD validation rules** | §16.4 | [UNIVERSAL] |

### INTEGRATIONS stages status po C3 Sesja 1

| Stage | Module | Scope | Status |
|---|---|---|---|
| Stage 1 | 03-TECH §13 | D365 item/BOM/supplier pull | Designed P1 |
| **Stage 2** | **08-PROD §12** | **D365 WO confirmations push** | **Designed P1** ✅ |
| Stage 3 | 11-SHIPPING (C4) | D365 SO pull + delivery confirmations | Pending C4 |
| Stage 4 | 05-WH §13.7 | EPCIS consumer | P2 deferred |
| Stage 5 | 10-FINANCE (C4) | Cost posting + financial sync | P2 deferred |

### Cross-PRD consistency check ✅

**07-EXT ↔ 04-PLAN v3.1:**
- 07-EXT E4 Disposition Bridge re-introduces `direct_continue` + `planner_decides` z 04-PLAN §8.5 Q6 revision ✅
- 07-EXT `changeover_matrix` konsumowane przez 04-PLAN §10 (basic heuristic v1 fallback) ✅

**07-EXT ↔ 02-SETTINGS v3.0:**
- 3 nowe DSL rules w 02-SETTINGS §7: `finite_capacity_solver_v1`, `allergen_sequencing_optimizer_v2`, `disposition_bridge_v1` (P2) ✅
- `changeover_matrix` editor linkowany z 02-SETTINGS reference tables ✅

**07-EXT ↔ 08-PROD v3.0:**
- 07-EXT output `scheduler.assignment.approved` event → 08-PROD E1 populates WO planner metadata ✅
- 08-PROD allergen_changeover_gate_v1 consumes `changeover_matrix` z 07-EXT §9.4 ✅
- Wspólny workflow-as-data pattern (oba PRDy używają 02-SETTINGS §7 DSL rules) ✅

**08-PROD ↔ 05-WH v3.0:**
- E2 konsumuje 05-WH §13 (scanner APIs), §10 (intermediate LP scan-to-consume), §13.4 (LP lock 5min) ✅
- E3 konsumuje 05-WH LP creation API (output registration) ✅
- Genealogy writes per 05-WH §11 pattern ✅

**08-PROD ↔ 06-SCN v3.0:**
- E2 backend implementuje SCN-080 (consume-to-WO) per §14.1 contract ✅
- E3 backend implementuje SCN-082/083/084 (output + co-product + waste) per §14.1 ✅
- E7 backend dla SCN-081 changeover flow ✅
- Error severity pattern z 06-SCN §6 D9 zachowany (block/warn/info) ✅

**08-PROD ↔ 03-TECH v3.0:**
- E3 używa BOM + yield_pct + co_products.allocation_pct z §7 ✅
- E7 allergen gate używa `items.allergen_profiles` z §5.2 + `allergen_cascade_rm_to_fa` z §10 ✅
- Routings + expected_duration z §8 dla OEE performance calc ✅

---

## Phase C3 CLOSED — podsumowanie batch

| Sesja | Data | Deliverable | Linii |
|---|---|---|---|
| **C3 Sesja 1** | **2026-04-20** | **07-PLANNING-EXT v3.0 + 08-PRODUCTION v3.0 + INTEGRATIONS stage 2 inline** | **1368 + 2088 = 3456** |

**Total C3:** 1 sesja (est. 2-3), **3456+ linii PRD w batch**, **20 D-decisions**, 11 sub-modules designed.

**Observation:** C3 bundled efektywnie dzięki fresh context window (60k→140k użyte, ~86% headroom zostało na końcu). Obie PRD napisane w tym samym context (07-EXT pierwszy, potem 08-PROD konsumuje 07-EXT §9.4 changeover_matrix) — cross-PRD consistency enforced naturally.

---

## Phase C4 scope + bootstrap

### Scope C4

**3 PRDy + INTEGRATIONS stage 3 + 5 (inline):**

1. **09-QUALITY-PRD.md** — CCP monitoring, ATP device integration, QA workflows, lab results, 09-QUALITY handoff from 08-PROD allergen gate (ATP swab flow), hold/release workflows, inspector dashboards
2. **10-FINANCE-PRD.md** — WIP costing, yield variance, waste cost allocation, BOM cost rollup, INTEGRATIONS stage 5 (cost posting to D365 ledger), material cost ingestion from supplier invoices
3. **11-SHIPPING-PRD.md** — SO fulfillment, pick wave, SSCC generation (R15), Delivery Note, customs docs, INTEGRATIONS stage 3 (D365 SO pull + delivery confirmations push)

**Est.** 3-4 sesje (3 PRDy + 2 INTEGRATIONS stages inline).

### Bootstrap C4 Sesja 1 (09-QUALITY)

1. Read `_meta/handoffs/2026-04-20-c3-sesja1-close.md` (this file)
2. Read `08-PRODUCTION-PRD.md` v3.0 §7 E7 Allergen Changeover Gate + §9.8 allergen_changeover_validations + §12 INTEGRATIONS stage 2 (09-QUALITY consumer pattern)
3. Read `05-WAREHOUSE-PRD.md` v3.0 §12 use_by/best_before gating + §11 lot genealogy (QA hold/release flows)
4. Read `03-TECHNICAL-PRD.md` v3.0 §10 Allergens cascade (ATP swab lab results, contamination risk matrix → QA lab integration)
5. Read `06-SCANNER-P1-PRD.md` v3.0 §8 SCN-071..073 QA workflows
6. Read `02-SETTINGS-PRD.md` v3.0 §7 rule registry + §8 reference tables (QA test types, lab method taxonomy)
7. Read `_foundation/research/MES-TRENDS-2026.md` §9 "09-QUALITY" + §3 regulatory (BRCGS v9 CCP runtime, FSMA 204 trace, 21 CFR Part 11 e-signatures)
8. Read baseline `09-QUALITY-PRD.md` pre-Phase-D (check `monopilot-kira-main/09-QUALITY-PRD.md`)
9. Propose outline → user Q&A → full write
10. Update memory + close HANDOFF → C4 Sesja 2 bootstrap

### Key dependencies handoff C3 → C4

| C3 deliverable | C4 consumer context |
|---|---|
| **08-PROD §7 E7 Allergen Gate** (cleaning + ATP + dual sign-off) | 09-QUALITY ATP device integration (P2 upgrade from P1 manual entry); QA role = quality_lead second signer |
| **08-PROD §12 INTEGRATIONS stage 2** (outbox pattern) | 10-FINANCE stage 5 reuses outbox dispatcher pattern dla cost posting |
| **08-PROD `wo_outputs.qa_status`** | 09-QUALITY owns QA status writes + hold/release workflow |
| **08-PROD `wo_waste_log`** | 10-FINANCE waste cost allocation (cost per category × qty) |
| **08-PROD `wo_material_consumption`** | 10-FINANCE material cost rollup (LP cost × qty) |
| **07-EXT `changeover_matrix` + allergen data** | 09-QUALITY cross-contamination risk assessment |
| **07-EXT `demand_forecasts` (P2)** | 11-SHIPPING P2 use forecast for SO planning |
| **02-SETTINGS rules registry** | All 3 PRDów dodają DSL rules (QA workflows, cost allocation, SSCC generation) |

### Key questions do rozstrzygnięcia w C4 Sesja 1 (09-QUALITY)

- **Q1** CCP monitoring engine — event-driven (IoT sensors) P1 vs manual entry P1 + IoT P2?
- **Q2** ATP device integration P1 (Hygiena EnSURE / Kikkoman Lumitester) vs manual entry P1?
- **Q3** Hold/release workflow — generic (any LP can be held) vs structured (specific hold reasons taxonomy)?
- **Q4** Lab LIMS integration — internal module vs external LIMS system (e.g., LabWare) bridge?
- **Q5** Non-conformance mgmt (NCR) — inline w 09-QUALITY vs separate module?
- **Q6** Calibration management (scales, ATP devices, thermometers) — P1 scope or deferred?
- **Q7** Customer complaints integration — 09-QUALITY or 12-REPORTING?

### Open items carry-forward z C3 Sesja 1

**07-EXT open questions:**
- **OQ-EXT-01** Allergen risk penalty weights calibration (empirical post-P1 30d run)
- **OQ-EXT-03** Multi-tenant shared Prophet model vs per-tenant (P2 design)
- **OQ-EXT-04** Disposition bridge `shelf_life_hours ≤ 24` threshold — 24h/12h/48h decision z Forza Quality

**08-PROD open questions:**
- **OQ-PROD-01** Catch weight hard tolerance enforcement (Forza Quality decision — PRE-P1 UAT)
- **OQ-PROD-03** D365 push batching: per-WO vs daily consolidated journal (pre-stage 2 impl)
- **OQ-PROD-04** ATP device P1 vs manual only — **ROZSTRZYGANE W C4 09-QUALITY Sesja 1 Q2**
- **OQ-PROD-07** Allergen gate override authority (Quality Lead only vs Quality+Prod Manager) — BRCGS audit review

**Nie blockery C4.** OQ-PROD-04 będzie resolved w C4 Sesja 1.

---

## Phase C progress overall

| Batch | Status | Moduły | Sesji actual |
|---|---|---|---|
| **C1** | ✅ COMPLETE | 02-SETTINGS + 03-TECHNICAL | 2 sesje (2026-04-19/20) |
| **C2 Sesja 1** | ✅ COMPLETE | 04-PLANNING-BASIC v3.0 | 1 (2026-04-20) |
| **C2 Sesja 2** | ✅ COMPLETE | 05-WAREHOUSE v3.0 + 04-PLANNING v3.1 revision | 1 (2026-04-20) |
| **C2 Sesja 3** | ✅ COMPLETE | 06-SCANNER-P1 v3.0 | 1 (2026-04-20) |
| **C2 CLOSED** | ✅ | batch 3 sesje | **3** |
| **C3 Sesja 1** | ✅ **COMPLETE** | **07-PLANNING-EXT v3.0 + 08-PRODUCTION v3.0 + INTEGRATIONS stage 2** | **1 (2026-04-20)** |
| **C3 CLOSED** | ✅ | **batch 1 sesja (est. 2-3, under budget!)** | **1** |
| **C4** | ⏭ NEXT | 09-QUALITY + 10-FINANCE + 11-SHIPPING + INTEGRATIONS stage 3+5 | ~3-4 |
| **C5** | pending | 12-REPORTING + 13-MAINTENANCE + 14-MULTI-SITE + 15-OEE | ~3-4 |

**Pozostało writing Phase C:** C4 + C5 = **6-8 sesji**.

**Total Phase C done:** C1 (2) + C2 (3) + C3 (1) = **6 sesji** (est. ~5-6, w budżecie — C3 oszczędził 1-2 sesje).

---

## Kumulatywne deliverables Phase B+C (kompletne PRDy v3.0+)

| # | PRD | Wersja | Linii | Kluczowe innowacje |
|---|---|---|---|---|
| 1 | 00-FOUNDATION | v3.0 | 744 | 6 principles, markers, R1-R15, ADR-028/029/030/031 |
| 2 | 01-NPD | v3.0 | 1520 | PLD v7 equivalent + Brief module + Allergens RM→FA cascade + D365 Builder N+1 |
| 3 | 02-SETTINGS | v3.0 | 1343 | Schema admin wizard L1-L4, rules registry read-only, reference CRUD |
| 4 | 03-TECHNICAL | v3.0 | 1184 | Product master rm/intermediate/fa, BOM versioning, co-products, catch weight GS1 |
| 5 | 04-PLANNING-BASIC | v3.1 | 1528 | PO/TO/WO lifecycle, intermediate cascade DAG, workflow-as-data, Q6 revised |
| 6 | 05-WAREHOUSE | v3.0 | ~1700 | Intermediate LP scan-to-consume, FEFO DSL, multi-LP GRN, lot genealogy FSMA 204 |
| 7 | 06-SCANNER-P1 | v3.0 | 1504 | SCN-080 intermediate consume, 3-method input parity, PIN auth, LP lock |
| 8 | **07-PLANNING-EXT** | **v3.0** | **1368** | **Heuristic solver, allergen optimizer DSL v2, Prophet bridge P2, disposition bridge P2, changeover matrix** |
| 9 | **08-PRODUCTION** | **v3.0** | **2088** | **Allergen changeover gate, INTEGRATIONS stage 2 inline, per-minute OEE, closed_production_strict, BRCGS 7y audit** |

**Total Phase B+C done:** **~13,000 linii PRD w 9 modułach** fundamentowych + operation + scheduling.

---

## Closing note

C3 Sesja 1 zamknęła całą Phase C3 (2 PRDy + INTEGRATIONS stage 2 inline) w **1 sesji** — znacznie pod budżetem (est. 2-3 sesje). Kluczowe czynniki sukcesu:

1. **Bundling w fresh context** — 60k→140k token usage, obie PRD napisane po sobie w pełni świadome wzajemnych dependencies
2. **Cross-PRD consistency** enforced naturalnie (07-EXT `changeover_matrix` → 08-PROD konsumuje w allergen_gate_v1; 08-PROD outbox pattern spójny z R14/R15 foundation)
3. **DSL rule pattern convergence** — 4 nowe rules w 02-SETTINGS §7 registry w tym batch (`finite_capacity_solver_v1`, `allergen_sequencing_optimizer_v2`, `disposition_bridge_v1`, `allergen_changeover_gate_v1`, `closed_production_strict_v1`, `output_yield_gate_v1`, `wo_state_machine_v1`) — konsolidują workflow-as-data foundation ACS-029

**Drugi ważny moment:** **INTEGRATIONS stage 2 inline** w 08-PROD §12 zamiast osobny PRD. To lockuje pattern na wszystkie kolejne stages (3/4/5) — outbox + adapter + DLQ + R14 idempotency + R15 anti-corruption = repeatable blueprint. Stage 3 (11-SHIPPING) i Stage 5 (10-FINANCE) będą reużywały ten sam wzorzec w C4.

Phase C3 **COMPLETE**. Cross-PRD consumer-producer chain kompleny:
- **Planning layer**: 04-BASIC → 07-EXT (scheduling)
- **Execution layer**: 04-BASIC → 08-PROD (execution)
- **Inventory layer**: 05-WH (LP lifecycle + genealogy)
- **Frontend**: 06-SCN (operator PWA)
- **Foundation**: 02-SETTINGS (rules/config/i18n), 03-TECH (master data), 00-FOUNDATION (principles)

Ready dla C4 (09-QUALITY + 10-FINANCE + 11-SHIPPING) z pełnym production-ready chain zdefiniowanym.

**Next session:** Session reset recommended. C4 Sesja 1 fresh context dla 09-QUALITY (CCP + ATP + hold/release + QA workflows + lab LIMS). 09-QUALITY est. 1400-1800 linii (middle-size module).

---

## Related

- [`07-PLANNING-EXT-PRD.md`](../../07-PLANNING-EXT-PRD.md) v3.0 — primary deliverable 1/2
- [`08-PRODUCTION-PRD.md`](../../08-PRODUCTION-PRD.md) v3.0 — primary deliverable 2/2 (+ INTEGRATIONS stage 2 inline §12)
- [`2026-04-20-c2-sesja3-close.md`](./2026-04-20-c2-sesja3-close.md) — C2 Sesja 3 close HANDOFF (input do C3)
- [`04-PLANNING-BASIC-PRD.md`](../../04-PLANNING-BASIC-PRD.md) v3.1 §10/§11 — carry-forward items
- [`05-WAREHOUSE-PRD.md`](../../05-WAREHOUSE-PRD.md) v3.0 §10/§13 — 08-PROD consumer contract
- [`06-SCANNER-P1-PRD.md`](../../06-SCANNER-P1-PRD.md) v3.0 §14 — API contract 08-PROD dostarcza
- [`03-TECHNICAL-PRD.md`](../../03-TECHNICAL-PRD.md) v3.0 §7/§10 — BOM + allergen cascade inputs
- [`02-SETTINGS-PRD.md`](../../02-SETTINGS-PRD.md) v3.0 §7/§11 — rules registry + D365 constants
- [`00-FOUNDATION-PRD.md`](../../00-FOUNDATION-PRD.md) v3.0 — R14 idempotency, R15 anti-corruption, principles
- [`_foundation/research/MES-TRENDS-2026.md`](../../_foundation/research/MES-TRENDS-2026.md) — §9 07-EXT + 08-PROD recommendations

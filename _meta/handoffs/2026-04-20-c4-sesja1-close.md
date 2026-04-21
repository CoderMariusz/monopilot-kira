# HANDOFF — Phase C4 Sesja 1 CLOSE → C4 Sesja 2 bootstrap

**From:** Phase C4 Sesja 1 (2026-04-20) — 09-QUALITY writing
**To:** Phase C4 Sesja 2 — 10-FINANCE writing + INTEGRATIONS stage 5 inline
**Phase:** C3 CLOSED → **C4 Sesja 1 CLOSED** → C4 Sesja 2 NEXT (10-FINANCE) → C4 Sesja 3 (11-SHIPPING)

---

## 🏁 Phase C4 Sesja 1 COMPLETE

### Deliverable

**`09-QUALITY-PRD.md` v3.0** — **1739 linii, 16 sekcji**, 7 D-decisions (Q1-Q7), 5 sub-modules build 09-a..e (45-54 sesji impl est. P1), 7 P2 epics (8F-8L, +72-96 sesji impl).

Baseline v2.0 (558 linii, 2026-02-17) w pełni przepisany do v3.0 convention. D1-D14 decyzje zachowane.

### Kluczowe decyzje C4 Sesja 1 (Q1-Q7 user approved 2026-04-20 — wszystkie match rekomendacji)

| Q | Decyzja | Rationale |
|---|---|---|
| **Q1 ✅** | CCP engine = **B** manual entry P1 + DSL rule `ccp_deviation_escalation_v1` + IoT reception stub P2 | Rule engine gotowy = łatwe IoT swapping P2 bez zmian logiki |
| **Q2 ✅** | ATP device = **A** manual entry P1 paper→ERP | Forza dziś paper cards; OQ-PROD-04 z 08-PROD resolved. P2 adapter pattern dla Hygiena EnSURE 3 / Kikkoman Lumitester Smart |
| **Q3 ✅** | Hold/release taxonomy = **B** structured via `quality_hold_reasons` reference (02-SETTINGS §8) + priority + default_hold_duration_days | Workflow-as-data pattern consistency; admin-editable; audit-friendly |
| **Q4 ✅** | Lab LIMS = **B** bridge-ready stub P1 (`lab_results.external_lims_id`, adapter pattern) + P2 vendor TBD | Internal P1 dla Forza; stub ready dla LabWare/StarLIMS/CSV |
| **Q5 ✅** | NCR scope P1 = **A** basic table only (EPIC 8D) + P2 full workflow + CAPA (EPIC 8G) | Zgodny z v2.0 baseline, CAPA = Phase 2 |
| **Q6 ✅** | Calibration mgmt = **A** reserved w 13-MAINTENANCE (C5) | 09-QA HACCP verification refs by FK stub `equipment_calibration_id` |
| **Q7 ✅** | Customer complaints = **A** `quality_complaints` stub v3.0 + full Phase 2 EPIC 8M candidate | complaint→NCR→CAPA naturalny chain QA |

### Core innovations 09-QUALITY v3.0

| # | Innovation | Section | Marker |
|---|---|---|---|
| 1 | **3 DSL rules registered w 02-SETTINGS §7** (`qa_status_state_machine_v1` workflow 7 statuses D3, `ccp_deviation_escalation_v1` gate auto-NCR + auto-hold, `batch_release_gate_v1` P2 gate dla WO close) | §10 | [UNIVERSAL] |
| 2 | **08-PROD E7 consumer** — `allergen_changeover_validations` dual sign-off (first_signed_by/second_signed_by/signature_hash) written przez 09-QA | §6.2, §13.2 | [UNIVERSAL] |
| 3 | **SCN-070..073 backend contract** 1:1 z 06-SCANNER §8.5 (`POST /api/quality/scanner/inspect` + 7 failure reasons + NCR auto-create) | §8.2, §12.1 | [UNIVERSAL] |
| 4 | **3 reference tables extracted do 02-SETTINGS §8** (`quality_hold_reasons`, `qa_failure_reasons`, `waste_categories`) | §16.3 | [UNIVERSAL] |
| 5 | **7-year retention BRCGS Issue 10** via `retention_until` DATE GENERATED columns + nightly archival | §5.2 | [UNIVERSAL] |
| 6 | **21 CFR Part 11 e-signature** SHA-256 (user+record+timestamp+PIN_proof) + immutability triggers `prevent_*_signed_update` | §5.3, §13.2 | [UNIVERSAL] |
| 7 | **FSMA 204 CTE coverage** via 05-WH §11 lot genealogy consumer + 09-QA inspection CTEs | §5.1, §6.2 | [UNIVERSAL] |
| 8 | **Customer complaints stub P1** — `quality_complaints` CRUD + NCR link; full workflow P2 | §6.3, §16.2 | [EVOLVING] |
| 9 | **LIMS bridge stub** — `lab_results.external_lims_id` + adapter pattern (LabWare/StarLIMS/CSV) | §12.2 | [EVOLVING] |
| 10 | **ATP device stub** — `lab_results.test_type='atp_swab'` + `pass_threshold=10 RLU` manual P1, P2 vendor adapter | §12.3 | [EVOLVING] |
| 11 | **Quality incidents standalone table** (accident/near_miss/unsafe_condition/food_safety_incident) per D13, 10-year retention | §6.3 | [UNIVERSAL] |
| 12 | **Yield issue NCR variant** per D12/[6.2] — `ncr_type='yield_issue'` + target/actual/claim fields | §6.3 | [UNIVERSAL] |
| 13 | **30+ V-QA validation rules** (HOLD/INSP/SPEC/NCR/HACCP/CCP/ALLERGEN/INCIDENT/COMPLAINT) | §11 | [UNIVERSAL] |
| 14 | **Dashboard widgets P1** — QA-001 6 widgets (holds aging, inspection backlog, NCR severity, CCP compliance, FTP rate, allergen gates) | §8.2 | [UNIVERSAL] |
| 15 | **5 sub-modules build 09-a..e** z parallelization opportunities (09-b parallel 09-a, 09-d blocks only on 09-a, 09-e blocks on 03-TECH + rule reg) | §7, §16.1 | [UNIVERSAL] |

### Resolved open questions from C3

- ✅ **OQ-PROD-04** (ATP device P1 vs manual) — resolved in Q2 as **A manual P1** z adapter pattern P2 (Hygiena EnSURE 3 / Kikkoman Lumitester Smart)

### Cross-PRD consistency check ✅

**09-QA ↔ 02-SETTINGS v3.0:**
- 3 nowe DSL rules w §7 registry (total 10+ rules) ✅
- 3 nowe reference tables w §8 (total 14 reference tables) ✅
- **Action item:** Cross-PRD revision 02-SETTINGS v3.1 apply w C4 Sesja 2 start (inline note lub separate revision)

**09-QA ↔ 08-PRODUCTION v3.0:**
- 09-QA writes `allergen_changeover_validations.first_signed_by/second_signed_by/signature_hash` — 08-PROD schema owner, 09-QA flow owner ✅
- 09-QA writes `wo_outputs.qa_status` — 08-PROD creates row on WO close, 09-QA updates via inspection ✅
- `batch_release_gate_v1` (P2) hooks into 08-PROD `wo_state_machine_v1.before_transition(to=closed)` ✅

**09-QA ↔ 05-WAREHOUSE v3.0:**
- `license_plates.qa_status` column 05-WH schema owner, 09-QA writes via PUT API ✅
- `quality_holds` consumer 05-WH §12 use_by/best_before gating (auto-hold on expiring) ✅
- `/api/quality/trace/:lp_id` consumer 05-WH §11 recursive CTE ✅

**09-QA ↔ 03-TECHNICAL v3.0:**
- `quality_specifications.allergen_profile` snapshot from 03-TECH §10.2 at approval ✅
- `lab_results` extended with 09-QA columns (inspection_id, allergen_changeover_validation_id, external_lims_id, threshold_min/max, pass_threshold, pass_flag) ✅
- 09-QA consumer `allergen_cascade_rm_to_fa` rule dla spec_parameters allergen-aware ✅

**09-QA ↔ 06-SCANNER-P1 v3.0:**
- SCN-070..073 backend = 09-QA implementation of 06-SCN §14 contract ✅
- SCN-081 (changeover sign) backend = 09-QA `/api/quality/allergen-changeover/sign` ✅
- Error severity pattern z 06-SCN §6 D9 zachowany (block/warn/info) w V-QA-* ✅

---

## Phase C4 Sesja 1 summary

| Sesja | Data | Deliverable | Linii |
|---|---|---|---|
| **C4 Sesja 1** | **2026-04-20** | **09-QUALITY v3.0** | **1739** |

**Observation:** C4 Sesja 1 zamknięta w 1 sesji (est. 1-2). Kluczowe czynniki sukcesu:
1. **Explore agent bootstrap** — kompaktowy 2500-word summary zastąpił reading 8 full PRDów (03-TECH, 05-WH, 06-SCN, 08-PROD, 02-SETTINGS, MES-TRENDS, baseline 09-QA + HANDOFF)
2. **Baseline v2.0 structural reuse** — D1-D14 + epicki 8A-8L były solidne; v3.0 = refactor i rozszerzenie nie rewrite
3. **Q1-Q7 all match recommendations** — zero rewrite po user response
4. **Cross-PRD pattern convergence** — DSL rule pattern dobrze ugruntowany (07-EXT + 08-PROD precedent), 09-QA naturalnie konsumuje

---

## Phase C4 Sesja 2 scope + bootstrap

### Scope C4 Sesja 2

**Primary deliverable:** `10-FINANCE-PRD.md` v3.0 — WIP costing + yield variance + waste cost allocation + BOM cost rollup + material cost ingestion + INTEGRATIONS stage 5 (D365 cost posting, reusing 08-PROD outbox pattern).

**Secondary deliverable:** Cross-PRD revision 02-SETTINGS v3.1 apply 09-QA deltas (3 DSL rules + 3 reference tables registered).

**Est.** 1-2 sesje (10-FINANCE est. 1200-1500 linii — mid-size module, similar to 07-EXT).

### Bootstrap C4 Sesja 2 (10-FINANCE)

1. Read `_meta/handoffs/2026-04-20-c4-sesja1-close.md` (this file)
2. Read `08-PRODUCTION-PRD.md` v3.0 §12 INTEGRATIONS stage 2 (outbox pattern template — **reuse for stage 5**), §9.5 `wo_waste_log` (cost category rollup), §9.4 `wo_outputs` (yield calc)
3. Read `04-PLANNING-BASIC-PRD.md` v3.1 + `07-PLANNING-EXT-PRD.md` v3.0 (MRP consumer + forecast bridge P2 for finance planning)
4. Read `03-TECHNICAL-PRD.md` v3.0 §11 `cost_per_kg` per-item z history (material cost source)
5. Read `05-WAREHOUSE-PRD.md` v3.0 §13 (LP cost snapshot, material cost rollup at consume)
6. Read `09-QUALITY-PRD.md` v3.0 §6 `ncr_reports.claim_value_eur` (yield claim integration), §6 `wo_waste_log` consumer
7. Read `02-SETTINGS-PRD.md` v3.0 §11 D365 Constants (dataAreaId FNOR, ForzDG warehouse, FinGoods account — stage 5 refs)
8. Read `_foundation/research/MES-TRENDS-2026.md` §9 "10-FINANCE" + R-decisions cost allocation
9. Read baseline `10-FINANCE-PRD.md` pre-Phase-D
10. Propose outline → user Q&A → full write
11. Apply cross-PRD 02-SETTINGS v3.1 delta (inline or separate) — 3 rules + 3 ref tables from 09-QA
12. Update memory + close HANDOFF → C4 Sesja 3 bootstrap (11-SHIPPING)

### Key dependencies handoff C4 Sesja 1 → C4 Sesja 2

| C4 Sesja 1 deliverable | C4 Sesja 2 consumer context |
|---|---|
| 09-QA `ncr_reports.claim_value_eur` + `ncr_type='yield_issue'` | 10-FIN yield variance claim cost rollup (source for monthly yield loss EUR) |
| 09-QA `quality_holds` outbox events `quality.hold.created/released` | 10-FIN freeze cost posting P2 (if LP held → don't post COGS yet) |
| 09-QA `quality_complaints` (stub P1) | 10-FIN P2 complaint cost allocation |
| 08-PROD `wo_waste_log` + `wo_outputs` | 10-FIN material waste cost (category × qty × cost_per_kg) + yield actual vs planned |
| 08-PROD INTEGRATIONS stage 2 outbox pattern | 10-FIN stage 5 **template reuse** — cost posting to D365 JournalLines |
| 03-TECH `items.cost_per_kg` + history | 10-FIN material cost source (avg cost / FIFO cost method choice) |
| 02-SETTINGS D365 Constants (§11) | 10-FIN stage 5 D365 config refs (dataAreaId, warehouse, account) |

### Key questions do rozstrzygnięcia w C4 Sesja 2 (10-FINANCE)

- **Q1** Costing method — **A** average cost (AVCO) P1 / **B** FIFO P1 / **C** standard cost P1 + AVCO variance / **D** hybryd per item type?
- **Q2** WIP cost timing — **A** real-time per WO operation complete / **B** daily batch roll / **C** period-end (monthly)?
- **Q3** Yield variance calculation — **A** planned vs actual per WO (variance=diff × cost_per_kg) / **B** per batch / **C** per product family monthly?
- **Q4** Waste cost allocation — **A** full cost × waste_qty per category / **B** amortized over batch / **C** period-end adjustment?
- **Q5** D365 cost posting — **A** per-WO journal lines P1 / **B** daily consolidated journal P1 / **C** per-WO P1 + daily consolidated P2?
- **Q6** Material cost ingestion — **A** manual entry P1 + D365 pull P2 / **B** D365 pull P1 (stage 1 reuse) / **C** supplier invoice OCR P2?
- **Q7** Finance module scope P2 — budget/forecast module / GL integration / AR-AP integration — which deferred?

### Open items carry-forward z C4 Sesja 1

**09-QA open questions (OQ-QA-*):**
- OQ-QA-01 Hold default duration per reason — Pre-launch UAT
- OQ-QA-02 CCP `deviation_threshold_seconds` tuning — +30d post P1
- OQ-QA-03 NCR severity rules — ML-based after 6mo
- OQ-QA-04 Complaint→NCR auto-link threshold — P2 design
- OQ-QA-05 LIMS vendor selection — P2 kick-off
- OQ-QA-06 HACCP plan template library — P1 launch
- OQ-QA-07 Audit export format — Pre-first audit
- OQ-QA-08 Customer complaint portal integration — P2 design
- OQ-QA-09 Override authority matrix — Pre-BRCGS audit
- OQ-QA-10 PIN rotation for `qa_inspector` — P1 launch

**Nie blockery C4 Sesja 2.** Wszystkie OQ-QA-* są P2 / post-launch scope.

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
| **C3 CLOSED** | ✅ | batch 1 sesja (under budget!) | **1** |
| **C4 Sesja 1** | ✅ **COMPLETE** | **09-QUALITY v3.0** | **1 (2026-04-20)** |
| **C4 Sesja 2** | ⏭ NEXT | 10-FINANCE + INTEGRATIONS stage 5 + 02-SETTINGS v3.1 delta apply | ~1-2 |
| **C4 Sesja 3** | pending | 11-SHIPPING + INTEGRATIONS stage 3 | ~1-2 |
| **C5** | pending | 12-REPORTING + 13-MAINTENANCE + 14-MULTI-SITE + 15-OEE | ~3-4 |

**Pozostało writing Phase C:** C4 Sesja 2-3 + C5 = **5-8 sesji**.

**Total Phase C done:** C1 (2) + C2 (3) + C3 (1) + C4 Sesja 1 (1) = **7 sesji** (est. ~5-7, w budżecie).

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
| 8 | 07-PLANNING-EXT | v3.0 | 1368 | Heuristic solver, allergen optimizer DSL v2, Prophet bridge P2, disposition bridge P2, changeover matrix |
| 9 | 08-PRODUCTION | v3.0 | 2088 | Allergen changeover gate, INTEGRATIONS stage 2 inline, per-minute OEE, closed_production_strict, BRCGS 7y audit |
| 10 | **09-QUALITY** | **v3.0** | **1739** | **3 DSL rules (qa_status/ccp_deviation/batch_release_gate), 08-PROD E7 consumer, SCN-070..073 backend, BRCGS Issue 10 7y, 21 CFR Part 11 e-sig, FSMA 204 CTE** |

**Total Phase B+C done:** **~14,750 linii PRD w 10 modułach** fundamentowych + operation + scheduling + quality.

---

## Closing note

C4 Sesja 1 zamknęła 09-QUALITY w 1 sesji (est. 1-2, w budżecie). Pattern w pełni ustabilizowany:

1. **Q&A pre-write** — 7 pytań rozstrzygniętych upfront, zero rewrites
2. **Explore agent bootstrap** — kompaktowe summary 8 źródeł zamiast reading full files
3. **DSL rule convergence** — 10+ rules zarejestrowanych w 02-SETTINGS §7 przez 9 PRDów (cascading, gate, workflow, conditional patterns dobrze pokryte)
4. **Regulatory-first** — BRCGS Issue 10 + FSMA 204 + 21 CFR Part 11 mapping explicit (retention, e-sig, CTE)
5. **Consumer-first design** — 09-QA jako consumer layer (08-PROD events + 05-WH LP + 03-TECH specs + 06-SCN scanner), clean API contracts

**Drugi ważny moment:** **OQ-PROD-04 resolved** (ATP device P1 vs manual) — był blockerem carry-forward z C3. Resolved w Q2 = manual P1 + adapter pattern P2.

Phase C4 Sesja 1 **COMPLETE**. Regulatory evidence layer zdefiniowana — quality guardian bridge między execution (08-PROD) a downstream (10-FIN yield costs, 11-SHIPPING batch release gate P2, 12-REP trends).

**Next session:** Session reset recommended. C4 Sesja 2 fresh context dla 10-FINANCE (WIP costing, yield variance, waste cost, INTEGRATIONS stage 5 reuse 08-PROD outbox pattern). 10-FINANCE est. 1200-1500 linii (mid-size module).

---

## Related

- [`09-QUALITY-PRD.md`](../../09-QUALITY-PRD.md) v3.0 — primary deliverable
- [`2026-04-20-c3-sesja1-close.md`](./2026-04-20-c3-sesja1-close.md) — input HANDOFF (C3 close)
- [`08-PRODUCTION-PRD.md`](../../08-PRODUCTION-PRD.md) v3.0 §7 E7 + §9.8 + §12 — allergen gate + INTEGRATIONS stage 2 template
- [`05-WAREHOUSE-PRD.md`](../../05-WAREHOUSE-PRD.md) v3.0 §11 + §12 — FSMA 204 genealogy + use_by gating
- [`06-SCANNER-P1-PRD.md`](../../06-SCANNER-P1-PRD.md) v3.0 §8.5 + §14 — SCN-070..073 contract
- [`03-TECHNICAL-PRD.md`](../../03-TECHNICAL-PRD.md) v3.0 §10 — allergen cascade + lab_results
- [`02-SETTINGS-PRD.md`](../../02-SETTINGS-PRD.md) v3.0 §7 + §8 + §11 — rules registry + reference tables + D365 constants (pending v3.1 delta)
- [`00-FOUNDATION-PRD.md`](../../00-FOUNDATION-PRD.md) v3.0 — R14 idempotency, R15 anti-corruption, principles
- [`_foundation/research/MES-TRENDS-2026.md`](../../_foundation/research/MES-TRENDS-2026.md) — §9 09-QUALITY + §3 regulatory

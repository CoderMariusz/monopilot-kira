# HANDOFF — Phase C2 Sesja 3 CLOSE → C3 bootstrap

**From:** Phase C2 Sesja 3 (2026-04-20) — 06-SCANNER-P1 writing
**To:** Phase C3 Sesja 1 — 07-PLANNING-EXT + 08-PRODUCTION writing
**Phase:** C1 CLOSED → C2 Sesja 1/2/3 CLOSED → **C2 CLOSED** → C3 NEXT

---

## 🏁 Phase C2 Sesja 3 COMPLETE

### Deliverable

**`06-SCANNER-P1-PRD.md` v3.0** — **1504 linii, 16 sekcji**, 9 major SCN codes + ~34 sub-screens, ~70 FR P1, 9 D-decisions, 21 validation rules, 5 sub-modules build 06-a..e (22-28 sesji impl est.).

### Kluczowe decyzje Sesji 3

**Q1-Q9 (user approved 2026-04-20):**

| Q | Decyzja |
|---|---|
| **Q1 ✅** | Tech stack = **PWA** (Next.js `/scanner/*`, service worker P2, IndexedDB P2) |
| **Q2 ✅** | SCN-080 Consume-to-WO = **A: scan WO first → FEFO suggest LP → operator confirms** (top-down, WO-centric) |
| **Q3 ✅** | Offline queue = **per operation** FIFO replay (D3 baseline) |
| **Q4 ✅ ROZSZERZONE** | **3-method input parity w P1**: hardware wedge + camera (`@zxing/browser`) + manual fallback wszystkie P1 (upgrade vs rekomendacji "B manual + camera P2"). Koszt: +2-3 sesje impl na 06-a. Library: `@zxing/browser` (MIT, ~200KB gzipped) primary, native `BarcodeDetector` API fallback |
| **Q5 ✅** | Device mode = **C both supported** — kiosk (60s idle, shared tablet production) + personal (300s idle, Zebra handheld warehouse) — config per `lines.device_mode` + `users.preferred_device_mode` |
| **Q6 ✅** | Error recovery = **C per-severity** — block (data integrity: LP not found, qty>available, session expired) / warn (policy deviation: FEFO override, non-suggested putaway location — reason_code mandatory) / info (contextual). Zgodne z 05-WH Q6B FEFO deviation pattern |
| **Q7 ✅** | PIN rotation = **B admin-configurable** (30/60/90/180/365/never), default **180 days**, enforced via 02-SETTINGS §14 |
| **Q8 ✅** | Screen numbering = **A hierarchical** — SCN-010..090 major codes (9) + sub-screens `SCN-{code}-{step}` (np. SCN-080-scan, SCN-080-qty, SCN-080-done) |
| **Q9 ✅** | Split LP = **A promoted P1** (SCN-060), parity z 05-WH §6.4-6.5 (baseline v1.2 miał to w Phase 2) |

### Core innovations v3.0 vs v1.2 baseline

| # | Innovation | Section | Marker |
|---|---|---|---|
| 1 | **SCN-080 Consume-to-WO** — intermediate cascade core (05-WH §10 consumer) | §8.4 | [UNIVERSAL] |
| 2 | **SCN-081 WO execute central screen** — tabs Komponenty/Zeskanowane + next-sug + 4 actions | §8.4 | [UNIVERSAL] |
| 3 | **Username + 4-6 PIN auth** (baseline miał session reuse z desktop) | §12.1 | [UNIVERSAL] |
| 4 | **LP lock protocol 5min** (05-WH §13.4 consumer) | §8.3 | [UNIVERSAL] |
| 5 | **3-method input parity** (hardware+camera+manual wszystkie P1) | §6 D5 + §11 | [UNIVERSAL] |
| 6 | **Kiosk vs personal device mode** (60s vs 300s idle) | §6 D7 + §3.3 | [APEX→UNIVERSAL] |
| 7 | **Per-severity error policy** (block/warn/info z reason_code dla warn) | §6 D9 | [UNIVERSAL] |
| 8 | **PIN rotation admin-configurable** (default 180d) | §6 D8 + §12.2 | [UNIVERSAL] |
| 9 | **SCN-060 Split LP** promoted P1 | §8.3 | [UNIVERSAL] |
| 10 | **SCN-012 Site/Line/Shift select** — multi-tenant L2 prep | §8.1 | [UNIVERSAL] |
| 11 | **SCN-083 Co-product + SCN-084 Waste** sub-flows (z HTML prototype) | §8.5 | [UNIVERSAL] |
| 12 | **scanner_audit_log** separate table (retention 30d vs audit_log 1yr) | §5.3 + §8.1 | [UNIVERSAL] |
| 13 | **Phase D module renumbering** M05 → 06 | header | [UNIVERSAL] |

### Build sequence output

**5 sub-modules 06-SCANNER-a..e (22-28 sesji impl est.):**

- **06-a: Shell & Core** (5-6 sesji) — SC-E1 login+PIN+site-select+home+settings+feedback+parser+auth+detect+camera component
- **06-b: Warehouse In** (4-5 sesji) — SC-E2 SCN-020 PO + SCN-030 TO + SCN-040 putaway
- **06-c: Warehouse Movement** (3-4 sesji) — SC-E3 SCN-031 move + SCN-060 split
- **06-d: Production Pick + Consume** (6-7 sesji) — SC-E4 SCN-050 pick + SCN-080 consume-to-WO + SCN-081 WO execute (core intermediate cascade)
- **06-e: Production Output + QA** (4-6 sesji) — SC-E5 SCN-082 output + SCN-083 co-product + SCN-084 waste + SCN-071-073 QA

**Phase 2 sub-modules** (06-f offline, 06-g PWA, 06-h SSCC, 06-i advanced camera, 06-j ship pick, 06-k CCP, 06-l stock audit, 06-m EPCIS consumer) — post-P1 per customer demand.

### Design reference (HTML prototype)

Prototype `SCANNER-PROTOTYPE (2).html` (~1826 linii, 34 sub-screens, 11 workflows) + `SCANNER-SCREEN-INDEX (1).md` = **primary UX reference** lockowany w §9 UX Patterns + Appendix A mapping SCN code → HTML screens line ranges.

**User note 2026-04-20:** design całości będzie updatowany (może wyglądać "trochę inaczej") ale bazą jest aktualny prototype. Pixel tokens elastyczne; structure/workflows/FR/NFR final v3.0.

---

## Phase C2 CLOSED — podsumowanie batch

| Sesja | Data | Deliverable | Linii |
|---|---|---|---|
| C2 Sesja 1 | 2026-04-20 | 04-PLANNING-BASIC v3.0 | 1528 |
| C2 Sesja 2 | 2026-04-20 | 05-WAREHOUSE v3.0 + 04-PLANNING v3.1 revision | ~1700 + revision |
| **C2 Sesja 3** | **2026-04-20** | **06-SCANNER-P1 v3.0** | **1504** |

**Total C2:** 3 sesje (est. 3-5), **4732+ linii PRD w batch** (04+05+06), 3 kluczowe PRDy foundation dla operation layer (planning + warehouse + scanner).

---

## Phase C3 scope + bootstrap

### Scope C3

**2 PRDy + 1 INTEGRATIONS batch:**

1. **07-PLANNING-EXT-PRD.md** — advanced scheduling (finite capacity engine, full allergen sequencing optimizer, genetic algorithm scheduling, ML forecasting integration, disposition direct_continue + planner_decides P2 deferral)
2. **08-PRODUCTION-PRD.md** — WO execution engine (shop floor control, machine interlocks, OEE real-time, catch weight confirmation, barcode label printing ZPL trigger, downtime events, changeover tracking, operator performance KPIs)
3. **INTEGRATIONS stage 2** — D365 WO confirmations push + outbox dispatcher + DLQ + idempotency R14 full implementation (inline w 08-PRODUCTION §13)

**Est.** 2-3 sesje (2 PRDy + inline INTEGRATIONS stage 2).

### Bootstrap C3 Sesja 1

1. Read `_meta/handoffs/2026-04-20-c2-sesja3-close.md` (this file)
2. Read `04-PLANNING-BASIC-PRD.md` v3.1 §7 Planning engine scope + §16 deferred items list → 07-EXT scope
3. Read `05-WAREHOUSE-PRD.md` v3.0 §13 Scanner Integration + §10 Intermediate LP Handling (08-PROD consumes SCN-080 output + registers new LP via FR-SC-BE-050)
4. Read `06-SCANNER-P1-PRD.md` v3.0 §8.5 Production Output + §14.1 API catalog (08-PROD backend side)
5. Read `03-TECHNICAL-PRD.md` v3.0 §7 BOM + co-products + routing + §10 Allergens cascade
6. Read `02-SETTINGS-PRD.md` v3.0 §11 D365 Constants [LEGACY-D365] + §7 rules registry (workflow DSL)
7. Read `_foundation/research/MES-TRENDS-2026.md` §9 "07-PLANNING-EXT" + §9 "08-PRODUCTION" + §4 schema-driven + §3 regulatory (BRCGS v9 + FSMA 204 for production)
8. Read baseline `07-PLANNING-EXT-PRD.md` + `08-PRODUCTION-PRD.md` (pre-Phase-D)
9. Propose outline per PRD → user Q&A → full write
10. Update memory + close HANDOFF → C4 bootstrap

### Key dependencies handoff C2 → C3

| C2 deliverable | C3 consumer context |
|---|---|
| **04-PLAN v3.1 §8.5 disposition to_stock only P1** | 07-EXT covers direct_continue + planner_decides P2 (finite capacity engine required) |
| **04-PLAN v3.1 §8.4 cascade DAG + intermediate catalog-driven** | 07-EXT allergen sequencing full optimizer (Q1 C2 Sesja 1 resolution) |
| **05-WH §10 Intermediate scan-to-consume + §13 scanner APIs** | 08-PROD WO execute engine triggers SCN-080 consume + SCN-082 output from scanner FE; 08-PROD owns `wo_material_consumption` + `wo_outputs` tables |
| **06-SCN §8.4 SCN-080 + §8.5 SCN-082 FR specs** | 08-PROD backend provides `/api/production/scanner/consume-to-wo` + `/api/production/scanner/output` endpoints |
| **06-SCN §8.5 SCN-084 waste categories** | 08-PROD owns `waste_categories` config + `wo_waste_log` table + waste_tracking dashboard |
| **05-WH §13.4 LP lock protocol** | 08-PROD integrates lock check before every WO mutation (parallel with scanner locks) |
| **02-SETTINGS §7 rules registry workflow-as-data DSL** | 08-PROD WO state machine as DSL rule `wo_state_machine_v1` (analogous do `lp_state_machine_v1` w 05-WH §6.1) |

### Key questions do rozstrzygnięcia w C3 Sesja 1

**07-PLANNING-EXT:**
- Q1: Finite capacity engine — constraint programming (OR-Tools) vs heuristic (greedy + local search) P1?
- Q2: Allergen sequencing optimizer — fixed algorithm (branch&bound) vs pluggable DSL rule?
- Q3: ML forecasting integration — internal vs external service (AWS Forecast / GCP Vertex)?

**08-PRODUCTION:**
- Q4: OEE real-time calculation — per-minute aggregation vs streaming (Kafka/Redis)?
- Q5: Machine interlocks (PLC integration) — P1 subset (start/stop signals) vs full P2 (OPC UA)?
- Q6: Changeover tracking — schema-driven custom fields (ADR-028 L3) vs hardcoded?
- Q7: D365 WO confirmations push — synchronous (inline z output) vs async (outbox + scheduled dispatcher)?
- Q8: Downtime event classification — fixed 10 categories vs admin-configurable z 02-SETTINGS?

### Open items carry-forward z Sesja 3

Z §16.5 w 06-SCANNER-P1 v3.0:
- **OQ-SC-01** Card scan format na SCN-010 (NFC/barcode/QR) — blocker dla 06-a build start, resolve w 02-SETTINGS user mgmt final (przed C4 timing)
- **OQ-SC-02** Shift enforcement policy — resolve w 02-SETTINGS shifts config (przed 06-a build)
- **OQ-SC-03** Biometric PIN alternative P1/P2 — customer signal → default P2
- **OQ-SC-04** Label printing ZPL trigger timing — post-P1, 05-WH WH-E07 budget
- **OQ-SC-05** Operator productivity leaderboard — 12-REPORTING scope decision (C5)
- **OQ-SC-06** Multi-language per user vs per site — 02-SETTINGS §14 i18n final
- **OQ-SC-07** Hardware wedge + camera parallel active conflict — 06-a build empirical test

**Nie blockery C3.** OQ-SC-01/-02 są blockery 06-a build start (post-C5 ale pre-impl).

---

## Phase C progress overall

| Batch | Status | Moduły | Sesji actual |
|---|---|---|---|
| **C1** | ✅ COMPLETE | 02-SETTINGS + 03-TECHNICAL | 2 sesje (2026-04-19/20) |
| **C2 Sesja 1** | ✅ COMPLETE | 04-PLANNING-BASIC v3.0 | 1 (2026-04-20) |
| **C2 Sesja 2** | ✅ COMPLETE | 05-WAREHOUSE v3.0 + 04-PLANNING v3.1 revision | 1 (2026-04-20) |
| **C2 Sesja 3** | ✅ **COMPLETE** | **06-SCANNER-P1 v3.0** | **1 (2026-04-20)** |
| **C3** | ⏭ NEXT | 07-PLANNING-EXT + 08-PRODUCTION + INTEGRATIONS stage 2 | ~2-3 |
| **C4** | pending | 09-QUALITY + 10-FINANCE + 11-SHIPPING + INTEGRATIONS stage 3 | ~3-4 |
| **C5** | pending | 12-REPORTING + 13-MAINTENANCE + 14-MULTI-SITE + 15-OEE + INTEGRATIONS stage 4-5 | ~3-4 |

**Pozostało writing Phase C:** C3 + C4 + C5 = **8-11 sesji**.

**Total Phase C done:** C1 (2) + C2 (3) = **5 sesji** (est. ~5-6, w budżecie).

---

## Kumulatywne deliverables Phase C (kompletne PRDy v3.0+)

| # | PRD | Wersja | Linii | Kluczowe innowacje |
|---|---|---|---|---|
| 1 | 00-FOUNDATION | v3.0 | 744 | 6 principles, markers, R1-R15, ADR-028/029/030/031 |
| 2 | 01-NPD | v3.0 | 1520 | PLD v7 equivalent + Brief module + Allergens RM→FA cascade + D365 Builder N+1 |
| 3 | 02-SETTINGS | v3.0 | 1343 | Schema admin wizard L1-L4, rules registry read-only, reference CRUD, PIN config, EmailConfig |
| 4 | 03-TECHNICAL | v3.0 | 1184 | Product master rm/intermediate/fa, BOM versioning, co-products, catch weight GS1, allergens full |
| 5 | 04-PLANNING-BASIC | v3.1 | 1528 | PO/TO/WO lifecycle, intermediate cascade DAG, workflow-as-data, Q6 revised intermediate to_stock P1 |
| 6 | 05-WAREHOUSE | v3.0 | ~1700 | Intermediate LP scan-to-consume, FEFO DSL rule, multi-LP GRN, lot genealogy FSMA 204, scanner API contract |
| 7 | **06-SCANNER-P1** | **v3.0** | **1504** | **Phase D aligned, SCN-080 intermediate consume core, 3-method input parity, PIN auth, LP lock, 9 SCN codes + ~34 sub-screens** |

**Total Phase B+C done:** ~9523 linii PRD w 7 modułach fundamentowych + operation layer.

---

## Closing note

Phase C2 Sesja 3 efektywnie zamknęła 06-SCANNER-P1 w **1 sesji** (est. ~1, w budżecie). Kluczowa decyzja sesji = **Q4 upgrade** — 3-method input parity (hardware+camera+manual wszystkie P1), nie tylko manual+hardware baseline. User rationale: "camera should be our standard". Koszt: +2-3 sesje impl w 06-a (camera component z `@zxing/browser` + viewfinder overlay + permission handling). Zwrot: zero friction dla iPhone/Android operatorów (QA mobile, supervisor override) bez potrzeby hardware scanner fleet expansion.

Drugi ważny moment = **intermediate cascade alignment** — 06-SCANNER SCN-080 jest **jedynym mechanizmem konsumpcji intermediate LPs** w całym systemie per 05-WH Q6 revised. To lockuje scanner jako kluczowy building block dla Apex multi-stage production reality (RM → intermediate → FA WOs z storable LP buffer).

Phase C2 **COMPLETE** — 3 fundamentowe PRDy (planning + warehouse + scanner) spięte cross-PRD consistently (04 v3.1 revision, 05 §13 consumer contract, 06 consumer of both). Ready dla C3 (07-PLANNING-EXT + 08-PRODUCTION) z pełnym consumer-producer chain defined.

**Next session:** Session reset recommended. C3 Sesja 1 design wymaga fresh context dla 07-EXT scope (finite capacity + allergen optimizer + ML) + 08-PROD scope (OEE + machine interlocks + D365 push) — oba PRDy duże (est. 1500-2000 linii each), może potrzebować 2 sesji (07-EXT sesja 1, 08-PROD sesja 2) lub 1 sesja jeśli outline split well.

---

## Related

- [`06-SCANNER-P1-PRD.md`](../../06-SCANNER-P1-PRD.md) v3.0 — primary deliverable Sesji 3
- [`2026-04-20-c2-sesja2-close.md`](./2026-04-20-c2-sesja2-close.md) — C2 Sesja 2 close HANDOFF
- [`2026-04-20-c2-sesja1-close.md`](./2026-04-20-c2-sesja1-close.md) — C2 Sesja 1 close HANDOFF
- [`2026-04-20-c1-close.md`](./2026-04-20-c1-close.md) — Phase C1 close HANDOFF
- [`05-WAREHOUSE-PRD.md`](../../05-WAREHOUSE-PRD.md) v3.0 §13 Scanner Integration (primary consumer contract)
- [`04-PLANNING-BASIC-PRD.md`](../../04-PLANNING-BASIC-PRD.md) v3.1
- [`03-TECHNICAL-PRD.md`](../../03-TECHNICAL-PRD.md) v3.0
- [`02-SETTINGS-PRD.md`](../../02-SETTINGS-PRD.md) v3.0
- [`00-FOUNDATION-PRD.md`](../../00-FOUNDATION-PRD.md) v3.0
- [`SCANNER-PROTOTYPE (2).html`](../../SCANNER-PROTOTYPE%20(2).html) — UX reference
- [`SCANNER-SCREEN-INDEX (1).md`](../../SCANNER-SCREEN-INDEX%20(1).md) — screen lookup table

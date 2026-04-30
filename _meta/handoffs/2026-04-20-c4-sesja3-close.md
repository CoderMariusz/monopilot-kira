# HANDOFF — Phase C4 Sesja 3 CLOSE → C5 bootstrap

**From:** Phase C4 Sesja 3 (2026-04-20) — 11-SHIPPING writing + INTEGRATIONS stage 3 + 02-SETTINGS v3.1 bundled delta
**To:** Phase C5 — 12-REPORTING + 13-MAINTENANCE + 14-MULTI-SITE + 15-OEE (est. 3-4 sesje)
**Phase:** C4 Sesja 2 CLOSED → **C4 Sesja 3 CLOSED** → **Phase C4 CLOSED** → C5 batch NEXT

---

## 🏁 Phase C4 Sesja 3 COMPLETE

### Deliverable primary

**`11-SHIPPING-PRD.md` v3.0** — **1143 linii, 19 sekcji**, 20 D-SHP decisions (D-SHP-1..12 retained + D-SHP-13..20 extended), 10 Q-decisions (Q1-Q10 user approved), 33 V-SHIP validation rules, 5 sub-modules build 11-a..e (P1 19-24 sesji impl est.), 10 P2 EPICs 11-F..11-O (24-34 sesji impl).

Baseline v3.1 (552 linii, 2026-02-18, pre-Phase-D) w pełni przepisany do v3.0 convention. D-SHP-1..12 decisions retained (LP alloc, FEFO, SSCC, allergen validation, scanner-first, RLS, SO state machine, pricing, backorder, audit, business). D-SHP-13..20 added: quality hold soft gate, INTEGRATIONS stage 3, allergen labelling EU 1169/2011, GS1 Digital Link QR P2, catch weight carve-out, D365 Constants reuse, manual dispatch + carrier API P2, EUDR supplier DDS gate P2.

### Deliverable secondary (bundled)

**`02-SETTINGS-PRD.md` v3.1 delta** — +83 linii (1343 → 1426). Zmiany:
- **§7.8 Registered Rules Registry** (new) — 17 rules tabela cumulative across C1-C4 Sesja 3 (13 P1 active + 4 P2 stub). +V-SET-14 (JSON schema file required).
- **§8.1 Reference Tables** — rozszerzono z 11 do 17 tabel (+6 z 08-PROD/09-QA/10-FIN/11-SHIP consumers).
- **§11.7 D365 Constants P2 Extensions** (new) — 6 P2 stub constants (shipping_warehouse, customer_account_id_map, courier_default_carrier, courier_api_vault_key, finance_cost_posting_account, eudr_dds_endpoint). Shared `@monopilot/d365-*-adapter` family documentation.
- **§11.8 INTEGRATIONS stages summary** (new) — cumulative tabela 6 stages z status per stage.
- Bundled revision oszczędność 1 sesji vs separate revisions (per C4 Sesja 2 close action item).

### Kluczowe decyzje C4 Sesja 3 (Q1-Q10 user approved 2026-04-20)

| Q | Decyzja | Rationale |
|---|---|---|
| **Q1 ✅ A** | Shipment trigger = D365 SO pull via 04-PLAN §7 existing + Monopilot ships | Minimal new infrastructure, leverages stage 1 integration |
| **Q2 ✅ C** | Pick/pack workflow = Both scanner (pallet-level) + desktop (mixed) | Apex reality — pallet shipments use scanner, mixed orders desktop |
| **Q3 ✅ A** | SSCC labelling P1 = GS1-128 P1 + GS1 Digital Link QR P2 | MES-TRENDS R10 alignment, retailer-ready roadmap |
| **Q4 ✅ A** | Carrier integration = Manual dispatch P1 + API P2 (DHL/UPS/DPD) | Apex SMB reality P1, API complexity defer P2 |
| **Q5 ✅ A** | D365 SalesOrder confirm push = Per-shipment async via outbox | Clone 08-PROD §12 stage 2 pattern, proven template |
| **Q6 ✅ B** (REVISED) | Batch release gate = Soft warn + operator override + reason_code + audit (nie hard block baseline rec) | **Spójne z 05-WH Q6B FEFO deviation pattern i 06-SCN per-severity error policy** (block/warn/info). Hard gate tylko dla severity='critical' via `batch_release_gate_v1` P2. |
| **Q7 ✅ A** | COGS timing = P2 at shipment confirm (consume FIFO layers via 10-FIN) | Real-time alignment z 10-FIN Q2 real-time consume |
| **Q8 ✅ B** | Multi-leg shipments = Partial shipments P1 (one SO → multi shipments) | Baseline D-SHP-10/12 retained, Apex reality |
| **Q9 ✅ OK** | Peppol B2B e-invoice retired P1 (Apex = UK nie Belgium) | Clean cutoff — Belgium 2026-01-01 deadline nie dotyczy |
| **Q10 ✅ Tak** | EUDR (Deforestation 2026-12-30) dotyczy → P2 supplier_dds_reference gate | Apex FA zawierają soy/palm upstream → EU TRACES compliance |

### Core innovations 11-SHIPPING v3.0

| # | Innovation | Section | Marker |
|---|---|---|---|
| 1 | **Quality hold soft gate (D-SHP-13)** — warn + reason_code + override audit (severity<critical); hard block tylko severity='critical' via `batch_release_gate_v1` P2 | §6, §10 | [UNIVERSAL] |
| 2 | **INTEGRATIONS stage 3 (D-SHP-14)** — `shipping_outbox_events` + `shipping_push_dlq` exact clone 08-PROD §9.10-9.11 + §12 stage 2 pattern; shared `@monopilot/d365-outbox-dispatcher` worker | §12 | [LEGACY-D365] |
| 3 | **Allergen labelling EU 1169/2011 (D-SHP-15)** — auto-bold allergens on packing slip/BOL/SSCC ASN; consumer `allergen_cascade_v1` (03-TECH ADR-029) | §13.3 | [UNIVERSAL] |
| 4 | **33 V-SHIP-* validation rules** (SO/ALLOC/PICK/PACK/SHIP/RMA/LBL/INT) | §11 | [UNIVERSAL] |
| 5 | **SO state machine workflow-as-data (D-SHP-8, so_state_machine_v1)** — draft→confirmed→allocated→picking→packing→shipped→delivered registered w 02-SETTINGS §7 | §6, 02-SET §7.8 | [UNIVERSAL] |
| 6 | **3-method input parity** (hardware scanner + camera `@zxing/browser` + manual) consumer 06-SCN Q4 upgrade | §6 D-SHP-6 | [UNIVERSAL] |
| 7 | **Cascade-aware RMA disposition** — restock→new LP (05-WH), scrap→waste_records (08-PROD `waste_categories`), quality_hold→09-QA `quality_holds` | §8.5, §9 | [UNIVERSAL] |
| 8 | **EUDR supplier DDS gate (D-SHP-20)** — P2 `eudr_compliance_gate_v1` DSL rule, 03-TECH P2 extensions `items.eudr_category` + `suppliers.dds_reference` | §4.4, §6, §14.5 | [UNIVERSAL] + [APEX-CONFIG] |
| 9 | **FSMA 204 traceability reuse** — `/api/shipping/batch-recall` endpoint via 05-WH §11 recursive CTE (<30s baseline, USA 2028 deadline) | §14.1 | [UNIVERSAL] |
| 10 | **BRCGS Issue 10 7y retention** — `shipping_audit_log.retention_until` GENERATED + archive nightly (reuse 10-FIN §5.2 pattern) | §14.4, §9.2 | [UNIVERSAL] |
| 11 | **21 CFR Part 11 e-sig P2** — RMA approval + allergen override (SHA-256 + PIN reverify reuse 09-QA pattern) | §14.7, §9.2 | [UNIVERSAL] |
| 12 | **16 P1 tables + 2 integration tables** (13 core + 3 audit/override + shipping_outbox_events + shipping_push_dlq) | §9 | [UNIVERSAL] |
| 13 | **GBP base currency retained** (Apex UK, 10-FIN Q9 consumer) + multi-currency P2 EPIC 11 reused | §5.2 | [APEX-CONFIG] |
| 14 | **D365 Constants baseline + P2 extensions** — FNOR/ApexDG/FinGoods/FOR100048 reuse; P2 shipping_warehouse/customer_map/courier/vault (bundled 02-SET v3.1 §11.7) | §6 D-SHP-18, §12.8 | [LEGACY-D365] |
| 15 | **Dual mode picking Q2=C** — scanner pallet-level + desktop mixed order (Apex reality, flexibility per SO complexity) | §6 D-SHP-6 | [UNIVERSAL] + [APEX-CONFIG] |

### Cross-PRD consistency check ✅

**11-SHIP ↔ 09-QUALITY v3.0:**
- Soft gate D-SHP-13 quality hold consumer (sev<critical warn + reason_code, sev='critical' hard block via `batch_release_gate_v1` P2) ✅
- Events consumed: `quality.hold.created/released/severity_changed` ✅
- Events produced: `shipping.quality_hold.overridden` → 09-QA `quality_hold_overrides` audit ✅
- RMA disposition `quality_hold` → 09-QA creates `quality_holds` entry ✅

**11-SHIP ↔ 05-WAREHOUSE v3.0:**
- LP state transitions (available→reserved→shipped) via 05-WH §6 consumer ✅
- FEFO picking `fefo_strategy_v1` DSL rule consumer (05-WH §9) ✅
- `lp_genealogy` FSMA 204 traceability reuse (05-WH §11 recursive CTE) ✅
- Intermediate LP consume pattern (05-WH §10 scan-to-consume) — compatible z allocation flow ✅
- P2 EPCIS 2.0 consumer (05-WH §13.7 outbox `target_system='EPCIS'`) → 11-L P2 EPIC ✅

**11-SHIP ↔ 08-PRODUCTION v3.0:**
- **INTEGRATIONS stage 3 = exact clone stage 2** (outbox schema, retry 5min/30min/2h/12h/24h, DLQ, R14 UUID v7, R15 adapter) ✅
- Shared dispatcher worker `@monopilot/d365-outbox-dispatcher` polls wszystkie outbox tables ✅
- `waste_categories` reference consumer (08-PROD §8 + RMA scrap disposition) ✅

**11-SHIP ↔ 10-FINANCE v3.0:**
- P2 COGS per shipment consumer `inventory_cost_layers` (10-FIN §6 + `cost_method_selector_v1` DSL rule) ✅
- GBP base currency consumer (10-FIN Q9) ✅
- D365 FinGoods GL account reuse (§11.1 constants) ✅

**11-SHIP ↔ 06-SCANNER-P1 v3.0:**
- SCN-040/050 Pick/Pack extensions (scanner contract §8.5 of 06-SCN) ✅
- SCN-072 Return receiving extension ✅
- NEW SCN-092 Pallet Loading (proposed for 14-MULTI-SITE integration P2) ✅
- 3-method input parity (06-SCN Q4: hardware + camera + manual) ✅
- Offline queue FIFO replay (06-SCN Q3) P1 ✅

**11-SHIP ↔ 04-PLANNING-BASIC v3.1:**
- Customer orders consumer (04-PLAN §7 + D365 SO trigger) ✅
- SO state machine `so_state_machine_v1` — DOES NOT conflict z 04-PLAN `wo_state_machine_v1` (different aggregates) ✅

**11-SHIP ↔ 03-TECHNICAL v3.0:**
- `products.default_sell_price` consumer (D-SHP-9) ✅
- `products.allergens` + `allergen_cascade_v1` consumer (D-SHP-15 labels) ✅
- `products.shelf_life_days` + `products.weight_mode` catch weight consumer ✅
- GS1 AI 3103/3922 (03-TECH §8) reuse w GS1-128 encoding ✅
- P2 extensions `items.eudr_category` + `suppliers.dds_reference` (D-SHP-20 EUDR gate) ✅

**11-SHIP ↔ 02-SETTINGS v3.1 (applied w this session):**
- Registers `so_state_machine_v1` (P1 active) + `eudr_compliance_gate_v1` (P2 stub) w §7.8 ✅
- Adds 2 reference tables §8.1: `shipping_override_reasons`, `rma_reason_codes` ✅
- Adds 4 P2 D365 Constants §11.7: shipping_warehouse, customer_account_id_map, courier_default_carrier, courier_api_vault_key ✅
- INTEGRATIONS stages summary §11.8 (stage 3 = 11-SHIP) ✅

### Resolved open questions from C4 Sesja 2

- ✅ **Action item C4 Sesja 2 close: 02-SETTINGS v3.1 delta** (10-FIN rules + 11-SHIP rules/ref tables) — **APPLIED w this session** bundled revision
- ✅ Shared `@monopilot/d365-*-adapter` family formalized w 02-SET §11.7

### New open items (OQ-SHIP-01..10)

10 open items, wszystkie P2 / post-launch / future sessions. Nie blokują C5.

---

## Phase C4 summary (3 sesje)

| Sesja | Data | Deliverable | Linii |
|---|---|---|---|
| **C4 Sesja 1** | 2026-04-20 | 09-QUALITY v3.0 | 1739 |
| **C4 Sesja 2** | 2026-04-20 | 10-FINANCE v3.0 + INTEGRATIONS stage 5 | 1318 |
| **C4 Sesja 3** | **2026-04-20** | **11-SHIPPING v3.0 + INTEGRATIONS stage 3 + 02-SETTINGS v3.1 delta** | **1143 + 83 = 1226** |

**Observation C4 Sesja 3:** 11-SHIPPING zamknięte w 1 sesji (est. 1-2, w budżecie — mid-size module jak 10-FIN). Kluczowe czynniki sukcesu:
1. **Explore agent bootstrap** — kompaktowy ~3500-word summary zastąpił reading 8 full PRDów. Skoncentrowany na shipping integration points (05-WH LP lifecycle, 09-QA hold gate, 08-PROD outbox template, 04-PLAN customer_orders, 03-TECH GS1+allergens, 02-SET D365_Constants, 10-FIN COGS).
2. **Baseline v3.1 solid** — D-SHP-1..12 retained bez zmian; tylko rozszerzenia D-SHP-13..20 dla Phase C integration points (quality gate, INTEGRATIONS, allergen labelling, EUDR).
3. **Outbox template reuse** — 08-PROD §12 stage 2 pattern = 11-SHIP stage 3 clone. Zero redesign. Shared `@monopilot/d365-outbox-dispatcher` + `@monopilot/d365-code-mapper` artifacts.
4. **Q6 REVISED (soft gate)** — user wybrał B zamiast rec A — spójne z 05-WH Q6B FEFO deviation pattern + 06-SCN per-severity error policy. Dowód dojrzałości user decision-making (architectural pattern cross-PRD consistency).
5. **Bundled 02-SETTINGS v3.1 delta** — oszczędność 1 sesji (vs separate revision post-11-SHIP). All deltas z 10-FIN + 11-SHIP applied atomically.

**Drugi ważny moment:** **Phase C4 CLOSED** — 3 moduły operational (09-QUALITY + 10-FINANCE + 11-SHIPPING) + bundled 02-SETTINGS v3.1 delta w 3 sesje. Writing pattern v3.0 w pełni stabilny. INTEGRATIONS pattern (outbox + DLQ + R14/R15 + adapter) = universal template across 5 active stages (1 items/BOM, 2 WO confirm, 3 shipments, 5 cost posting) + 2 P2 (4 EPCIS, 6 RMA credit). Rule registry rosnie pipe-linie: 17 rules registered z 7 producer modules.

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
| **C4 Sesja 2** | ✅ COMPLETE | 10-FINANCE v3.0 + INTEGRATIONS stage 5 | 1 (2026-04-20) |
| **C4 Sesja 3** | ✅ **COMPLETE** | **11-SHIPPING v3.0 + INTEGRATIONS stage 3 + 02-SETTINGS v3.1 delta** | **1 (2026-04-20)** |
| **C4 CLOSED** | ✅ | batch 3 sesje | **3** |
| **C5** | ⏭ NEXT | 12-REPORTING + 13-MAINTENANCE + 14-MULTI-SITE + 15-OEE | ~3-4 |

**Pozostało writing Phase C:** C5 = **3-4 sesji**.

**Total Phase C done:** C1 (2) + C2 (3) + C3 (1) + C4 (3) = **9 sesji** (est. ~5-7, 2-4 over z Q&A thoroughness + cross-module integration complexity + bundled revisions). Tempo: **9 sesji / 2 dni (2026-04-19/20)** — average ~1 sesja per module dla mid/small, 2 per large.

---

## Kumulatywne deliverables Phase B+C (kompletne PRDy v3.0+)

| # | PRD | Wersja | Linii | Kluczowe innowacje |
|---|---|---|---|---|
| 1 | 00-FOUNDATION | v3.0 | 744 | 6 principles, markers, R1-R15, ADR-028/029/030/031 |
| 2 | 01-NPD | v3.0 | 1520 | PLD v7 equivalent + Brief + Allergens RM→FA + D365 Builder N+1 |
| 3 | 02-SETTINGS | **v3.1** | **1426** | **Schema admin wizard L1-L4, rules registry (17 rules cumulative), reference CRUD (17 tabel), D365 Constants baseline + 4 P2 ext, INTEGRATIONS stages summary** |
| 4 | 03-TECHNICAL | v3.0 | 1184 | Product master rm/intermediate/fa, BOM versioning, co-products, catch weight |
| 5 | 04-PLANNING-BASIC | v3.1 | 1528 | PO/TO/WO lifecycle, intermediate cascade DAG, workflow-as-data |
| 6 | 05-WAREHOUSE | v3.0 | ~1700 | Intermediate LP scan-to-consume, FEFO DSL, multi-LP GRN, lot genealogy |
| 7 | 06-SCANNER-P1 | v3.0 | 1504 | SCN-080 intermediate consume, 3-method input parity, PIN auth, LP lock |
| 8 | 07-PLANNING-EXT | v3.0 | 1368 | Heuristic solver, allergen optimizer DSL v2, Prophet bridge P2, disposition bridge P2 |
| 9 | 08-PRODUCTION | v3.0 | 2088 | Allergen changeover gate, INTEGRATIONS stage 2, per-minute OEE, BRCGS 7y audit |
| 10 | 09-QUALITY | v3.0 | 1739 | 3 DSL rules, 08-PROD E7 consumer, SCN-070..073 backend, BRCGS+FSMA+21 CFR |
| 11 | 10-FINANCE | v3.0 | 1318 | Cascade cost rollup, FIFO+WAC parallel, INTEGRATIONS stage 5 D365 daily consolidated, 2 DSL rules, cost_per_kg lifecycle, 21 CFR e-sig, BRCGS 7y |
| 12 | **11-SHIPPING** | **v3.0** | **1143** | **Quality hold soft gate (Q6 revised), INTEGRATIONS stage 3 shipment.confirmed outbox, allergen labelling EU 1169/2011, FSMA 204 <30s traceability, GS1 SSCC-18 + Digital Link QR P2, EUDR supplier DDS gate P2** |

**Total Phase B+C done:** **~17,262 linii PRD w 12 modułach** fundamentowych + operation + scheduling + quality + finance + shipping. **Phase C4 CLOSED — 12/15 modułów PRD complete (80%).**

---

## Phase C5 scope + bootstrap

### Scope C5 (4 moduły, est. 3-4 sesje)

**Primary deliverables:**
- `12-REPORTING-PRD.md` v3.0 — universal reports + metadata-driven templates (per Strategic Decision #6 "Custom reports = universal templates + metadata-driven"), KPI materialized views, OEE reporting consumer (15-OEE), multi-tenant per-org dashboards (ADR-031 consumer)
- `13-MAINTENANCE-PRD.md` v3.0 — equipment calibration (09-QA §6 Q6 FK stub consumer), preventive maintenance, work requests, parts inventory, TPM (Total Productive Maintenance), IoT sensor integration P2 (cold chain BRCGS)
- `14-MULTI-SITE-PRD.md` v3.0 — multi-site orchestration, inter-site transfers (05-WH TO), cross-site sales/production scheduling, hierarchy site→plant→line, multi-tenant L2 variation per site (ADR-030/031 consumer), `site_id` column activation across wszystkich modules
- `15-OEE-PRD.md` v3.0 — OEE calculation engine (Availability × Performance × Quality), per-minute aggregation consumer 08-PROD §13.3 Q4, downtime analysis (08-PROD §8 `downtime_reason_codes`), Pareto charts, shift comparison, real-time dashboards, historical trends

**Secondary deliverable:** Potentially 02-SETTINGS v3.2 bundled delta (if C5 modules rejestrują new rules / reference tables — likely 13-MAINT calibration_equipment + 15-OEE downtime_reason_codes).

**Est.** 3-4 sesje:
- C5 Sesja 1: 12-REPORTING + 15-OEE bundled (OEE reports share templates z 12-REPORTING) — 2 modules per session per C3 Sesja 1 precedent (07-EXT + 08-PROD bundled)
- C5 Sesja 2: 13-MAINTENANCE + 14-MULTI-SITE bundled
- C5 Sesja 3-4: buffer dla bundle (jeśli któraś para przekroczy budget) + 02-SETTINGS v3.2 delta if needed

### Bootstrap C5 Sesja 1 (12-REPORTING + 15-OEE)

1. Read `_meta/handoffs/2026-04-20-c4-sesja3-close.md` (this file)
2. Read `08-PRODUCTION-PRD.md` v3.0 §13 (per-minute OEE Q4), §9.12 (operator_kpis_monthly materialized view) — OEE primary source
3. Read `00-FOUNDATION-PRD.md` v3.0 §4 (module map), §6 (metadata-driven principle) — reports universal template foundation
4. Read `07-PLANNING-EXT-PRD.md` v3.0 §10 (GanttView dashboard) — reporting pattern precedent
5. Read `_foundation/research/MES-TRENDS-2026.md` §9 "12-REPORTING" + "15-OEE" R-decisions + §6 analytics stack
6. Read baseline `12-REPORTING-PRD.md` pre-Phase-D (if exists)
7. Read baseline `15-OEE-PRD.md` pre-Phase-D (if exists)
8. Propose outline per PRD → user Q&A → full write bundled (per C3 Sesja 1 pattern)
9. Apply potential 02-SETTINGS v3.2 delta (any new rules / ref tables)
10. Update memory + close HANDOFF → C5 Sesja 2 bootstrap

### Key dependencies handoff C4 Sesja 3 → C5

| C4 Sesja 3 deliverable | C5 consumer context |
|---|---|
| 11-SHIPPING shipment KPIs (OTD, fulfillment rate, SSCC success) | 12-REPORTING shipping dashboard widgets + OTD decomposition report |
| 11-SHIPPING INTEGRATIONS stage 3 outbox | 13-MAINT no direct consumer (unless equipment maintenance shipment-triggered P2) |
| 02-SETTINGS v3.1 §7.8 17 rules registry | 12-REPORTING rules usage analytics dashboard (how often each rule triggered); 15-OEE rule performance metrics |
| 02-SETTINGS v3.1 §8.1 17 ref tables | 12-REPORTING reference table usage reports; 14-MULTI-SITE L2 variation per site reuses tabela schemas |
| 02-SETTINGS v3.1 §11.8 6 integration stages | 12-REPORTING integration health dashboard (DLQ depth, push latency, stages); 13-MAINT no direct consumer |
| D-SHP shipping_audit_log 7y retention | 12-REPORTING BRCGS audit reports (shipping audit queries); 14-MULTI-SITE audit per-site rollup |

### Key questions do rozstrzygnięcia w C5 Sesja 1 (12-REPORTING + 15-OEE)

**12-REPORTING:**
- **Q1** Report engine: **A** Postgres materialized views P1 + Metabase/Grafana external P2 / **B** Custom Next.js viewer P1 / **C** Both (Postgres queries backend + Metabase embed) — metadata-driven per Strategic Decision #6
- **Q2** Reports catalog scope P1: minimal (8-10 reports module-specific) vs comprehensive (20+ cross-module)?
- **Q3** Custom report builder (admin UI): P1 simple filters + columns / P2 SQL-like DSL / P3 visual query builder?
- **Q4** Export formats P1: **A** CSV + PDF (html2pdf) / **B** +Excel (xlsx) / **C** +JSON/parquet dla data science?
- **Q5** Scheduled reports: P1 manual trigger / P2 cron scheduled + email delivery / P3 Slack/Teams integration?
- **Q6** Multi-tenant per-org dashboards: P1 fixed templates / P2 per-org customization (ADR-031 L2)?

**15-OEE:**
- **Q7** OEE calculation timing: P1 per-minute aggregation Postgres batch (confirmed 08-PROD Q4) / P2 streaming (Kafka/Redpanda)?
- **Q8** OEE visualization: P1 daily heatmap per line / P2 real-time tv dashboard (plant floor screens)?
- **Q9** Downtime categorization source: consumer 08-PROD `downtime_events.category` ref table / P2 ML classification?
- **Q10** Shift comparison: P1 daily rollup 3 shifts / P2 custom shift configs per tenant (L2 variation)?

### Open items carry-forward z C4 Sesja 3

**11-SHIP open questions (OQ-SHIP-01..10):** 10 items, wszystkie P2 / post-launch. Nie blockery C5.

---

## Phase C progress forecast

**Est. Phase C5 total:** 3-4 sesje (bundled pattern reuse z C3 Sesja 1).

**Estimated Phase C overall completion:** 9 sesji done + 3-4 C5 = **12-13 sesji total** (original est. 12-15, na górnej granicy budget, w ramach tolerancji).

**Post-Phase-C milestones:**
1. Phase C complete — 15/15 modułów PRD v3.0 baseline
2. Phase D lock — all ADRs finalized, SKILL-MAP complete, no further architectural decisions
3. Phase E kickoff — **Build** starts per 00-FOUNDATION §4.2 build order (01-NPD-a → 15-OEE)
4. Est. build timeline: 18-23 sesji x 15 modules = ~200-300 sesji implementation (pre-compression, assumes no major discoveries)

---

## Kumulatywne statystyki Phase B+C (post-C4)

- **12 PRD modules v3.0 (+ 00-FOUNDATION + 02-SETTINGS v3.1):** 17,262 linii
- **20 D-* decyzji na moduł ~** avg, total ~200+ architectural decisions documented
- **17 DSL rules registered** (13 P1 active + 4 P2 stub) across 7 producer modules
- **17 reference tables** cumulative (02-SETTINGS §8.1)
- **6 INTEGRATIONS stages** (4 active P1: 1, 2, 3, 5; 2 P2: 4 EPCIS, 6 RMA credit)
- **ADR coverage:** ADR-028 (schema-driven L1-L4) + ADR-029 (rule engine DSL) + ADR-030 (configurable depts) + ADR-031 (schema variation per org) — all applied cross-PRD

---

## Closing note

C4 Sesja 3 zamknęła 11-SHIPPING w 1 sesji (est. 1-2, w budżecie — mid-size module precedent z 10-FIN). Pattern v3.0 w pełni stabilny. **Phase C4 CLOSED.**

Kluczowe obserwacje C4 całościowo:
1. **Q&A pre-write discipline** — 09-QA (7Q), 10-FIN (10Q), 11-SHIP (10Q) = 27 decisions rozstrzygniętych upfront, zero rewrites po user response.
2. **Explore agent bootstrap** — kompaktowe summary of N source files (3500-4000 words) vs ~20000+ słów raw read. Proven factor in mid-size sessions.
3. **Template reuse dyscyplina** — INTEGRATIONS stage 2 (08-PROD) = stage 3 (11-SHIP) = stage 5 (10-FIN) zero redesign, shared artifacts `@monopilot/d365-*-adapter`. Convergence driver.
4. **Q6 revised cross-PRD consistency** — user klauzula B soft gate dla 11-SHIP quality hold spójna z 05-WH Q6B FEFO deviation + 06-SCN per-severity policy. Dowód dojrzałości architectural pattern recognition.
5. **Bundled revision pattern** — 02-SETTINGS v3.1 delta (10-FIN + 11-SHIP rules/ref tables) applied w 1 session post-11-SHIP write. Oszczędność 1 sesji.

Phase C4 Sesja 3 **COMPLETE**. Shipping layer ready do build. 11-SHIPPING = 12. PRD v3.0 z 17,262 linii całkowitych w Phase B+C. 

**Next session:** C5 Sesja 1 — session reset recommended. Fresh context dla 12-REPORTING + 15-OEE bundle (reports + OEE analytics). Potem C5 Sesja 2 (13-MAINTENANCE + 14-MULTI-SITE bundle). Total C5 est. 3-4 sesji.

---

## Related

- [`11-SHIPPING-PRD.md`](../../11-SHIPPING-PRD.md) v3.0 — primary deliverable (1143 linii)
- [`02-SETTINGS-PRD.md`](../../02-SETTINGS-PRD.md) v3.1 — secondary deliverable (bundled delta, +83 linii)
- [`2026-04-20-c4-sesja2-close.md`](./2026-04-20-c4-sesja2-close.md) — input HANDOFF (C4 Sesja 2 close)
- [`08-PRODUCTION-PRD.md`](../../08-PRODUCTION-PRD.md) v3.0 §9.10-9.11 + §12 — INTEGRATIONS stage 2 template (source dla stage 3 clone)
- [`09-QUALITY-PRD.md`](../../09-QUALITY-PRD.md) v3.0 §6 — quality_holds + batch_release_gate_v1 consumer
- [`05-WAREHOUSE-PRD.md`](../../05-WAREHOUSE-PRD.md) v3.0 §6-11 — LP lifecycle + FEFO + genealogy
- [`10-FINANCE-PRD.md`](../../10-FINANCE-PRD.md) v3.0 §6 + §12 stage 5 — COGS layers (P2 consumer) + D365 template reuse
- [`04-PLANNING-BASIC-PRD.md`](../../04-PLANNING-BASIC-PRD.md) v3.1 §7 — customer_orders + D365 SO trigger
- [`03-TECHNICAL-PRD.md`](../../03-TECHNICAL-PRD.md) v3.0 §8 + §10 — GS1 AI + allergen cascade consumer
- [`06-SCANNER-P1-PRD.md`](../../06-SCANNER-P1-PRD.md) v3.0 §8.5 — scanner backend contract (pick/pack/return)
- [`00-FOUNDATION-PRD.md`](../../00-FOUNDATION-PRD.md) v3.0 — R14 UUID v7 idempotency, R15 anti-corruption adapter
- [`_foundation/research/MES-TRENDS-2026.md`](../../_foundation/research/MES-TRENDS-2026.md) — §9 11-SHIPPING + §2 regulatory (FSMA 204, EU 1169/2011, EUDR, BRCGS, GS1)

# HANDOFF — Phase C5 Sesja 2 CLOSE → Phase C CLOSED → Phase D lock / Phase E Build bootstrap

**From:** Phase C5 Sesja 2 (2026-04-20) — 13-MAINTENANCE writing + 14-MULTI-SITE writing + 02-SETTINGS v3.3 bundled delta
**To:** Phase D lock confirmation → Phase E Build kickoff (15/15 modułów PRD v3.0+ complete — 100%)
**Phase:** C5 Sesja 1 CLOSED → **C5 Sesja 2 CLOSED** → **Phase C CLOSED**

---

## 🏁 Phase C5 Sesja 2 COMPLETE

### Deliverables primary (2 PRDs)

**`13-MAINTENANCE-PRD.md` v3.0** — ~480 linii, 19 sekcji (Phase D convention), full rewrite z baseline v1.0 (600 linii, 8 D-MNT decisions pre-Phase-D). **16 D-MNT decisions** (D-MNT-1..8 retained + D-MNT-9..16 NEW: unified WR+MWO lifecycle Q6B, calibration FK bridge to 09-QA, `oee_maintenance_trigger_v1` P2 consumer, outbox event pattern 8 events, L2 tenant config `maintenance_alert_thresholds`, allergen-aware sanitation, LOTO basic P1, IoT deferred P2). **7 DSL rules registered** w 02-SET §7.8 (6 P1 active + 1 P2 consumer link): mwo_state_machine_v1, pm_schedule_due_engine_v1, calibration_expiry_alert_v1, spare_parts_reorder_alert_v1, sanitation_allergen_gate_v1, loto_pre_execution_gate_v1 (all P1), + oee_maintenance_trigger_v1 (consumer, owned by 15-OEE). **22 V-MNT validation rules**. **14 P1 tables** + 1 MV + 1 external consumer (oee_shift_metrics). **6 P1 dashboards** (MNT-001..006) + 8 P2 dashboards. Build sequence 5 sub-modules 13-a..e (18-24 sesji impl P1) + 8 P2 epics (24-30 sesji). BRCGS Issue 10 + FSMA 204 + 21 CFR Part 11 P2 + EU OSHA LOTO + GDPR.

**`14-MULTI-SITE-PRD.md` v3.0** — ~430 linii, 19 sekcji (Phase D convention), full rewrite z baseline v1.0 (576 linii, 9 D-MS decisions pre-Phase-D). **15 D-MS decisions** (D-MS-1..9 retained + D-MS-10..15 NEW: hierarchy 3-level default Q7 + L2 flexibility depth 2-5, cross-site RBAC multi-site users Q10, outbox events for inter-site TO, composite RLS indexes mandatory pre-activation, L2 feature flag orchestration via 02-SET §9 ADR-031 wizard 3-step state machine, per-site data residency P2 Q9). **4 DSL rules registered** w 02-SET §7.8 (3 P1 active + 1 P2 stub): site_access_policy_v1, cross_site_to_approval_v1 (P1), per_site_residency_gate_v1 (P2). `to_state_machine_v1` extended z 05-WH baseline (IN_TRANSIT state) — not re-registered. **20 V-MS validation rules**. **5 core tables** + 20+ activated operational tables (ALTER TABLE strategy w 14-a + 14-e migrations). **4 P1 dashboards** (MS-001..004) + 6 P2 dashboards. Build sequence 5 sub-modules 14-a..e (14-18 sesji impl P1) + 8 P2 epics (24-32 sesji). R7 data residency P1 single-region + P2 per-site override, BRCGS + FSMA 204 multi-site audit trail, 21 CFR Part 11 super-admin cross-site audit.

### Deliverable secondary (bundled)

**`02-SETTINGS-PRD.md` v3.3 delta** — frontmatter bump v3.2 → v3.3 + 9 nowych rules w §7.8 (22→31) + 4 nowe reference tables w §8.1 (20→24) + Changelog v3.3 entry. Zmiany:
- **§7.8 Rules Registry:** 22 rules → **31 rules** (24 P1 active + 7 P2 stub). Dodane 9 (v3.3): 6 z 13-MAINT (mwo_state_machine/pm_schedule/calibration_expiry/spare_parts_reorder/sanitation_allergen/loto_pre_execution — all P1 active) + 3 z 14-MULTI (site_access_policy/cross_site_to_approval P1 + per_site_residency P2). Producer modules: 9 → **11** (dodane 13-MAINTENANCE, 14-MULTI-SITE).
- **§8.1 Reference Tables:** 20 → **24 tabel**. Dodane 4 (v3.3): `maintenance_alert_thresholds` (13-MAINT L2 ADR-031), `technician_skills` (13-MAINT enum), `spare_parts_categories` (13-MAINT), `sites_hierarchy_config` (14-MULTI L2 ADR-030 depth 2-5). `shift_configs` v3.2 #19 rozszerzone o site_id scoping (14-MULTI D-MS-9 REC-L5, dokumentowane in-place).
- **§11.8 INTEGRATIONS stages summary:** bez zmian (13-MAINT P1 = no new D365 stage; 14-MULTI = internal Monopilot concept).
- **Changelog:** v3.3 entry dodana. Bundled revision pattern consistent z v3.1 (C4 Sesja 3) + v3.2 (C5 Sesja 1) — 3× precedent, oszczędność 1 sesji vs separate revision.

### Kluczowe decyzje C5 Sesja 2 (user-approved 2026-04-20, batch Q1-Q12 defaults)

#### 13-MAINTENANCE (Q1-Q6)

| Q | Decyzja | Rationale |
|---|---|---|
| **Q1 Calibration** | **A** manual calendar + alerts 30d/7d/overdue P1 (D-MNT-5 retained), P2 IoT sensor auto-trigger | Forza reality manual + BRCGS evidence ready, IoT post-hardware provisioning |
| **Q2 PM engine** | **A** calendar-based P1 + B usage-based P2 + C condition-based ML P3 (per R12 roadmap) | Phased, greenfield reality |
| **Q3 Parts inventory** | **A** basic qty_on_hand + min/reorder P1 (D-MNT-6), P2 consumption forecasting | Unblock MVP, separate catalog vs 03-TECH products |
| **Q4 TPM scope** | **A** reactive + preventive + calibration + sanitation P1 (D-MNT-7 CIP) + P2 5S/autonomous/predictive | Balanced, baseline consistent |
| **Q5 IoT sensor** | **P1 deferred** (Modbus TCP/OPC UA → P2) + P3 full vision/vibration/thermal | Forza brak sensors dzisiaj, koszt integracji >benefit P1 |
| **Q6 WR vs WO** | **B unified** — MWO lifecycle z state `requested` → `approved` → `open` → ... single table (D-MNT-9) | Prostszy schema, mniej joinow, consistency z 05-WH TO pattern |

#### 14-MULTI-SITE (Q7-Q12)

| Q | Decyzja | Rationale |
|---|---|---|
| **Q7 Hierarchy depth** | **3 levels default** (site → plant → line) + configurable 2-5 per tenant L2 (D-MS-10 ADR-030) | Forza 1-plant today, L2 flexibility bez overengineering |
| **Q8 Inter-site transfers P1** | **A** 05-WH TO extension (same pattern different site_id) + IN_TRANSIT state (D-MS-3) | Minimum viable, P2 customs/EU-non-EU compliance |
| **Q9 Data residency** | **P1 single-region all sites** (org-level R7) + **P2 per-site override** (Forza UK + KOBE EU independent, future) — D-MS-15 | Forza today single UK, P2 when second site live |
| **Q10 Cross-site RBAC** | **Multi-site users via `site_user_access`** (D-MS-11 retained) + primary_site default + super_admin cross-site | Forza managers multi-site, operators single-site |
| **Q11 Consolidation reports P1** | **A** per-site filter + factory aggregate P1 (12-REPORTING consumer via cross_site_summary MV) + P2 cross-site benchmarking | Unblock MVP, benchmark wymaga ≥2 sites z data |
| **Q12 site_id activation** | **Pre-activation DDL w 14-a** (CREATE INDEX CONCURRENTLY + backfill default_site + assume REC-L1 done) + gradual per-module verification (14-e regression tests) | Single atomic DDL, bez per-PRD migration chaos |

### Core innovations 13-MAINTENANCE v3.0

| # | Innovation | Section | Marker |
|---|---|---|---|
| 1 | **Unified WR+MWO lifecycle (Q6B, D-MNT-9)** — 6-state machine requested→approved→open→in_progress→completed+cancelled, segregation of duties, consistency z 05-WH TO pattern | §7, §8.2, §9.5 | [UNIVERSAL] |
| 2 | **Calibration ↔ 09-QA bridge (D-MNT-10)** — `calibration_instruments.id` = FK target dla 09-QA `lab_results.equipment_id` stub. HACCP CCP verification trail P2. Forward-compat nie break | §9.12 | [UNIVERSAL] |
| 3 | **OEE auto-trigger P2 (D-MNT-11)** — `oee_maintenance_trigger_v1` consumer (15-OEE owned): availability<80% 3-consecutive-days → auto PM MWO, dedup {line_id, 7d window} | §7.2, §8.1 | [UNIVERSAL] + [EVOLVING] |
| 4 | **Allergen-aware sanitation (D-MNT-14)** — `sanitation_checklists.allergen_change_flag=true` → dual sign-off tech+QA + ATP RLU check + 08-PROD `allergen_changeover_gate_v1` consumer | §7.2, §8.1, §9.14 | [UNIVERSAL] |
| 5 | **LOTO basic P1 (D-MNT-15)** — `mwo_loto_checklists` energy_sources_isolated + tags_applied + zero_energy_verified + released_by, pre-condition dla equipment.requires_loto=true MWO in_progress | §7.2, §8.1, §9.7 | [UNIVERSAL] |
| 6 | **L2 tenant config `maintenance_alert_thresholds`** — per-tenant PM intervals, calibration warning days, MTBF target, availability breach threshold, ATP RLU (Forza 30 baseline override) | §13.2, 02-SET §8.1 #21 | [UNIVERSAL] + [FORZA-CONFIG] |
| 7 | **Outbox event pattern 8 events (D-MNT-12)** — mwo.* (5 states) + spare_parts.consumed + calibration.recorded + sanitation.allergen_change.completed | §7.2, §12.3 | [UNIVERSAL] |
| 8 | **REC-L1 site_id on 14 tables from day 1 (nie retrofit)** | §6.3, §9.* | [UNIVERSAL] |
| 9 | **6 P1 dashboards MNT-001..006** (Worklist, PM Calendar, Calibration Health, Spare Parts Stock, Equipment MTBF/MTTR, Manager Overview) + 8 P2 dashboards + dashboards_catalog registration via 12-REPORTING | §10 | [UNIVERSAL] |
| 10 | **14 P1 tables + 22 V-MNT validations** — full lifecycle coverage | §9, §11 | [UNIVERSAL] |
| 11 | **Build sequence 5 sub-modules 13-a..e (18-24 sesji P1) + 8 P2 epics (24-30)** | §16 | [UNIVERSAL] |
| 12 | **BRCGS + FSMA 204 + 21 CFR Part 11 + EU OSHA LOTO + GDPR compliance coverage** | §5, §14 | [UNIVERSAL] |

### Core innovations 14-MULTI-SITE v3.0

| # | Innovation | Section | Marker |
|---|---|---|---|
| 1 | **Hierarchy 3-level default + L2 flexibility (D-MS-10, Q7)** — `sites_hierarchy_config` depth 2-5 per tenant (ADR-030 pattern reuse), Forza baseline site→plant→line | §6.3, §9.5 | [UNIVERSAL] + [FORZA-CONFIG] |
| 2 | **Inter-site TO extension z IN_TRANSIT (D-MS-3 + Q8A)** — `to_state_machine_v1` 05-WH base extended; outbox events shipped/in_transit/received; cost allocation (sender/receiver/split/none) | §8.2, §9.6, §12.3 | [UNIVERSAL] |
| 3 | **Feature flag orchestration via 02-SET §9 ADR-031 (D-MS-14)** — state machine inactive→wizard_in_progress→dual_run→activated, 3-step wizard, admin rollback możliwy | §13.5 | [UNIVERSAL] |
| 4 | **Cross-site RBAC multi-site users (D-MS-11, Q10)** — `site_user_access` many-to-many + `is_primary` constraint + super_admin bypass + x-site-id header + `current_site_id()` SECURITY DEFINER | §4, §9.2 | [UNIVERSAL] |
| 5 | **Composite RLS indexes mandatory (D-MS-13)** — CREATE INDEX CONCURRENTLY (org_id, site_id) na 20+ tables pre-activation; target <5% pgbench overhead vs single-site | §9.9, §15.3 | [UNIVERSAL] |
| 6 | **Per-site production_shifts (D-MS-9 REC-L5, Q10)** — ALTER TABLE production_shifts ADD site_id + `shift_configs` ref per-site timezone/hours — consumer 15-OEE `shift_aggregator_v1` | §9.7, 02-SET §8.1 #19 ext | [UNIVERSAL] + [FORZA-CONFIG] |
| 7 | **Per-site data residency P2 (D-MS-15, Q9)** — `sites.data_residency_region` + `per_site_residency_gate_v1` rule — Forza UK EU-West-2 + KOBE EU-Central-1 independent (future) | §5.1, §9.1, §7.1 | [EVOLVING] |
| 8 | **Outbox events 3 for inter-site TO (D-MS-12)** — `transfer_order.shipped/in_transit/received` z payload {org_id, from_site_id, to_site_id, transfer_cost, items[]} | §12.3 | [UNIVERSAL] |
| 9 | **Master data org-level (unchanged) vs operational site-level (RLS site-scoped) — D-MS-4** | §9.8 master table list | [UNIVERSAL] |
| 10 | **4 P1 dashboards + 20 V-MS validations** — Site Overview, Inter-site TO Tracker, Cross-site Factory Aggregate, Site Switcher UX + per-site filter + factory aggregate MV | §10, §11 | [UNIVERSAL] |
| 11 | **Build sequence 5 sub-modules 14-a..e (14-18 sesji P1) + 8 P2 epics (24-32)** | §16 | [UNIVERSAL] |
| 12 | **Activation strategy explicit (Q12)** — pre-activation DDL 14-a + backfill default_site + feature flag flip + 14-e regression across 9 modules | §6.4, §13.5, §16 | [UNIVERSAL] |

### Cross-PRD consistency enforced (C5 Sesja 2)

**13-MAINT ↔ 15-OEE:**
- D-MNT-3 retained: M13 czyta `oee_shift_metrics.mtbf_hours / mttr_minutes / downtime_event_count / availability_pct` (read-only consumer) ✅
- D-MNT-11: `oee_maintenance_trigger_v1` (15-OEE owned, 02-SET §7.8 #22) consumer link → M13 auto-PM MWO creation endpoint P2 ✅
- MNT-005 Equipment Health dashboard czyta 15-OEE per-equipment MTBF/MTTR trend ✅

**13-MAINT ↔ 09-QA:**
- D-MNT-10: `calibration_instruments.id` = FK target dla 09-QA `lab_results.equipment_id` stub (forward-compat, nie break) ✅
- Calibration.failed event → 09-QA lab_results hold candidate (outbox consumer) ✅
- HACCP CCP verification trail P2 — 09-QA CCP monitoring records `equipment_calibration_id` ✅

**13-MAINT ↔ 08-PROD:**
- D-MNT-4 retained: downtime_events → auto-MWO via M06 checkbox, source='auto_downtime' ✅
- D-MNT-14: sanitation.allergen_change.completed event → 08-PROD `allergen_changeover_gate_v1` consumer (BRCGS dual sign-off parity) ✅

**14-MULTI ↔ 05-WH:**
- D-MS-3 retained + extended: `to_state_machine_v1` base (05-WH) + IN_TRANSIT state 14-MULTI extension (dokumentowane w 02-SET §7.8 note, nie re-registered) ✅
- lp_genealogy multi-site chain preserved (D-MS-4) ✅

**14-MULTI ↔ 08-PROD + 13-MAINT + 15-OEE + 06-SCN + 10-FIN + 11-SHIP + 09-QA + 12-REP:**
- ~20 operational tables site_id activated via ALTER w 14-a + 14-e (D-MS-4 + D-MS-13) ✅
- production_shifts per-site (D-MS-9 REC-L5) — consumer 15-OEE `shift_aggregator_v1` via `shift_configs.site_id` ✅
- oee_snapshots site_id ALTER DDL w 15-a (15-OEE HANDOFF C5 Sesja 1) — 14-MULTI consumes per-site rollup ✅
- 13-MAINT `site_user_access` pattern consumer (technicians assigned per site) ✅
- 12-REP `cross_site_summary` MV consumer + per-site filter + factory aggregate ✅

**13-MAINT + 14-MULTI ↔ 02-SETTINGS v3.3:**
- §7.8 rules: 6 P1 new z 13-MAINT + 2 P1 new z 14-MULTI + 1 P2 stub z 14-MULTI ✅
- §8.1 ref tables: 3 new z 13-MAINT + 1 new z 14-MULTI + `shift_configs` extension ✅
- §9 multi-tenant L2 config: 14-MULTI feature flag orchestration via ADR-031 wizard ✅
- §11 D365 Constants: bez zmian P1 (13-MAINT no D365, 14-MULTI internal) ✅

### Resolved open items z C5 Sesja 1

- ✅ **C5 Sesja 2 bundled 02-SETTINGS v3.3 delta** — per pattern z v3.1 (C4 Sesja 3) + v3.2 (C5 Sesja 1), wszystkie rules + ref tables z 13-MAINT + 14-MULTI applied atomically w 4 edit batch (frontmatter + §7.8 + §8.1 + changelog)
- ✅ **No new INTEGRATIONS stages** — 13-MAINT P1 = brak D365 dependency, 14-MULTI = internal Monopilot multi-site concept. Stages summary §11.8 unchanged. P2 stub stages (maintenance supplier portal, multi-entity D365 company split) documented jako future references w changelog

### New open items (OQ-MNT-01..10, OQ-MS-01..10)

20 open items cumulative (10 per PRD), wszystkie P2 / P3 / post-launch. Nie blokują Phase C close.

**Notable:**
- **OQ-MNT-01** — `technician_skills` levels matrix vs single skill_level (P2 impl detail)
- **OQ-MNT-08** — Cold chain IoT integration P2 vs P1 if Forza pushes hardware consult
- **OQ-MS-04** — Backfill migration for org with millions of rows: online vs offline (P2 perf+ops)
- **OQ-MS-07** — Cross-region replication P2: streaming vs logical (pglogical) — P3 14-L phase infra
- **OQ-MS-08** — Multi-entity accounting schema strategy: same db schema vs separate Postgres schemas (P2 14-I)

---

## Phase C5 progress (updated)

| Batch | Status | Moduły | Sesji actual |
|---|---|---|---|
| **C5 Sesja 1** | ✅ COMPLETE | 12-REPORTING v3.0 + 15-OEE v3.0 + 02-SETTINGS v3.2 delta | 1 (2026-04-20) |
| **C5 Sesja 2** | ✅ **COMPLETE** | **13-MAINTENANCE v3.0 + 14-MULTI-SITE v3.0 + 02-SETTINGS v3.3 delta** | **1 (2026-04-20)** |
| **C5 CLOSED** | ✅ **CLOSED** | batch 2 sesji (est. 2-3, w budżecie, no Sesja 3 buffer needed) | **2 sesje** |

**Total Phase C done:** C1 (2) + C2 (3) + C3 (1) + C4 (3) + **C5 (2)** = **11 sesji** (est. ~5-7 pierwotne, 4 over z Q&A thoroughness + cross-module integration + 3× bundled revisions).

**Pozostało writing Phase C:** **ZERO sesji — Phase C CLOSED.**

---

## 🏆 Phase C CLOSED — Kumulatywne deliverables Phase B+C (post-C5 Sesja 2)

| # | PRD | Wersja | Linii | Kluczowe innowacje |
|---|---|---|---|---|
| 1 | 00-FOUNDATION | v3.0 | 744 | 6 principles, markers, R1-R15, ADR-028/029/030/031, build sequence |
| 2 | 01-NPD | v3.0 | 1520 | PLD v7 equivalent + Brief + Allergens RM→FA + D365 Builder N+1 |
| 3 | **02-SETTINGS** | **v3.3** | **~1495** | **Schema admin wizard L1-L4, rules registry (31 rules cumul), reference CRUD (24 tabel), D365 Constants baseline + 6 P2 ext, INTEGRATIONS stages summary (6 stages)** |
| 4 | 03-TECHNICAL | v3.0 | 1184 | Product master rm/intermediate/fa, BOM versioning, co-products, catch weight |
| 5 | 04-PLANNING-BASIC | v3.1 | 1528 | PO/TO/WO lifecycle, intermediate cascade DAG, workflow-as-data |
| 6 | 05-WAREHOUSE | v3.0 | ~1700 | Intermediate LP scan-to-consume, FEFO DSL, multi-LP GRN, lot genealogy |
| 7 | 06-SCANNER-P1 | v3.0 | 1504 | SCN-080 intermediate consume, 3-method input parity, PIN auth, LP lock |
| 8 | 07-PLANNING-EXT | v3.0 | 1368 | Heuristic solver, allergen optimizer DSL v2, Prophet bridge P2 |
| 9 | 08-PRODUCTION | v3.0 | 2088 | Allergen changeover gate, INTEGRATIONS stage 2, per-minute OEE, BRCGS 7y audit |
| 10 | 09-QUALITY | v3.0 | 1739 | 3 DSL rules, 08-PROD E7 consumer, SCN-070..073 backend, calibration FK stub (consumer 13-MAINT) |
| 11 | 10-FINANCE | v3.0 | 1318 | Cascade cost rollup, FIFO+WAC parallel, INTEGRATIONS stage 5, 2 DSL rules |
| 12 | 11-SHIPPING | v3.0 | 1143 | Quality hold soft gate, INTEGRATIONS stage 3, EU 1169 labels, FSMA 204, EUDR P2 |
| 13 | 12-REPORTING | v3.0 | ~930 | 10 P1 dashboards + 20 P2, metadata-driven `dashboards_catalog`, OEE consumer, Integration Health + Rules Usage |
| 14 | **13-MAINTENANCE** | **v3.0** | **~480** | **Unified WR+MWO lifecycle (D-MNT-9), calibration ↔ 09-QA bridge (D-MNT-10), `oee_maintenance_trigger_v1` P2 consumer, allergen-aware sanitation, LOTO basic P1, 7 DSL rules, 14 tables, BRCGS 7y retention** |
| 15 | **14-MULTI-SITE** | **v3.0** | **~430** | **Hierarchy 3-level default + L2 flexibility, inter-site TO IN_TRANSIT, feature flag orchestration ADR-031 wizard, composite RLS indexes, per-site data residency P2, 4 DSL rules, 5 core + 20 activated tables** |
| 16 | 15-OEE | v3.0 | ~1020 | Per-minute aggregation consumer (08-PROD D7), 3 P1 dashboards, 3 DSL rules, industry-standard A×P×Q, 7y retention |

**Total Phase B+C done:** **~20,186 linii PRD w 15 modułach complete (100%)**. Includes fundaments (00+01) + operation layer (02-SETTINGS admin + 03-TECH + 04-PLAN + 05-WH + 06-SCN) + scheduling (07-EXT + 08-PROD) + quality + finance + shipping + reporting + OEE + maintenance + multi-site.

**Phase C CLOSED — 15/15 modułów PRD v3.0+ complete (100%).**

---

## Kumulatywne statystyki Phase B+C (post-C5 Sesja 2 — final)

- **15 PRD modules v3.0+ + 02-SETTINGS v3.3:** ~20,186 linii (+480 13-MAINT +430 14-MULTI +~60 02-SET v3.3 delta vs post-C5 Sesja 1)
- **~240+ D-* decyzji** dokumentowanych (avg ~16 per moduł, 13-MAINT 16 D-MNT + 14-MULTI 15 D-MS)
- **31 DSL rules registered** (24 P1 active + 7 P2 stub) across **11 producer modules**
- **24 reference tables** cumulative (02-SETTINGS §8.1)
- **6 INTEGRATIONS stages** (4 active P1: 1, 2, 3, 5; 2 P2: 4 EPCIS, 6 RMA credit) — bez zmian post-C5
- **ADR coverage:** ADR-028 (schema-driven L1-L4) + ADR-029 (rule engine DSL) + ADR-030 (configurable depts) + ADR-031 (schema variation per org) — all applied cross-PRD, 14-MULTI ADR-030/031 prominent consumer
- **Tempo:** 11 sesji / 3 dni (2026-04-18/19/20) — average ~1 sesja per moduł mid-size, 2 per large. **Bundled revision pattern proven 3×** (v3.1 C4 Sesja 3, v3.2 C5 Sesja 1, v3.3 C5 Sesja 2) — stabilny cross-PRD atomic delta pattern.

---

## Phase D lock confirmation checklist

Per 00-FOUNDATION §4.2 build sequence + sitemap, Phase C close triggers Phase D lock review:

- ✅ **15/15 modułów PRD v3.0+ complete** — all modules have full Phase D convention (19 sekcji, markers, D-decisions, DSL rules where applicable, cross-PRD consumer hooks)
- ✅ **ADR coverage complete** — 4 ADRs (028/029/030/031) applied cross-PRD, no new ADRs needed post-C5 Sesja 2
- ✅ **SKILL-MAP complete** — 5 Phase 0 skills (schema-driven/rule-engine/reality-sync/multi-tenant/documentation-patterns) actively referenced
- ✅ **Rules registry stable** — 31 rules across 11 modules, P1/P2 status tracked, consumer mapping in JSONB metadata
- ✅ **Reference tables registry stable** — 24 tables, L1/L2/L3 tier discipline enforced
- ✅ **INTEGRATIONS stages stable** — 6 stages (4 active P1, 2 P2), outbox pattern replicated 4× (08-PROD template)
- ✅ **No architectural decisions pending** — all cross-PRD design decisions resolved in 14-MULTI (activation strategy D-MS-14), 13-MAINT (unified WR+MWO D-MNT-9), calibration bridge (D-MNT-10)

**Phase D lock recommended confirmed. Proceed to Phase E kickoff.**

---

## Phase E Build kickoff (next step)

**Scope:** Implementation 15 modułów sequential per 00-FOUNDATION §4.2 build order.

**Build order** (retained from 00-FOUNDATION):
```
01-NPD-a..e → 02-SETTINGS-a..e → 03-TECHNICAL-a..d →
04-PLANNING-a..d → 05-WAREHOUSE-a..d → 06-SCANNER-a..e →
07-PLANNING-EXT-a..d → 08-PRODUCTION-a..g →
09-QUALITY-a..e → 10-FINANCE-a..e → 11-SHIPPING-a..e →
12-REPORTING-a..e → 13-MAINTENANCE-a..e →
14-MULTI-SITE-a..e → 15-OEE-a..c
```

**Est. timeline:** ~300-400 sesji implementation P1 across 15 modules (avg ~20-25 sesji per moduł, range 9-22 sesji).

**Critical path:**
- 01-NPD-a..e first (~25-30 sesji, primary module)
- Parallelization possible post-01-NPD-c: 02-SETTINGS-a (admin foundation) + 03-TECHNICAL-a (master data) simultaneously
- 14-MULTI-SITE-a early activation (pre-build) może być pre-condition dla 05-WH + reszta operational — alternative: 14-MULTI-SITE-a w parallel z 02-SETTINGS-a

**Phase E bootstrap document:** `_meta/handoffs/2026-XX-XX-phase-e-build-kickoff.md` (TBD w next session).

### Phase E first session scope (recommended)

1. Audit all 15 PRDs + 02-SET v3.3 dla unresolved Phase D issues (likely zero, given 100% PRD coverage)
2. Confirm tech stack lock (Next.js 14 + Supabase + Vitest + Playwright per 00-FOUNDATION §5)
3. Decide monorepo vs polyrepo (likely monorepo w `apps/monopilot-web` + `packages/shared`)
4. Setup Phase E sub-skills if needed:
   - `phase-e-impl-guide` — per-sub-module scaffold pattern (following sub-modules a..e naming)
   - `phase-e-test-strategy` — Vitest + Playwright + RLS policy tests patterns
5. Start 01-NPD-a (smart-pld-v7-equivalent + Brief first ekran) — primary module priority
6. Setup reality-sync hook: v7 VBA changes → Session A capture w `_meta/reality-sources/pld-v7-excel/*` propagate to 01-NPD module

---

## Closing note

Phase C5 Sesja 2 zamknęła 13-MAINTENANCE + 14-MULTI-SITE + 02-SETTINGS v3.3 delta w 1 sesji (est. 1-2 sesje, w budżecie). Bundled pattern proven 3× — 2 modules mid-size + delta w 1 sesji (precedent C3 Sesja 1 + C5 Sesja 1). **Phase C CLOSED post-C5 Sesja 2 — 15/15 modułów PRD v3.0+ complete (100%).**

Kluczowe czynniki sukcesu C5 Sesja 2:
1. **Explore agent bootstrap** — ~4000-word summary zastąpił reading 8 full PRDów (13-MAINT + 14-MULTI baselines + 15-OEE + 09-QA + 05-WH + 00-FOUND + 02-SET v3.2 + MES-TRENDS). Context usage efficient.
2. **Baseline v1.0 solid dla obu PRDów** — 600 linii 13-MAINT + 576 linii 14-MULTI z 8+9 D-decisions retained → rewrite do Phase D convention, nie from scratch.
3. **Q1-Q12 user-approved defaults upfront** — 12 kluczowych decyzji batch-approved, zero rewrites, smooth writing flow (ostatnia instancja z C5 Sesja 1 pattern powtórzona).
4. **Template reuse discipline (3× precedent):**
   - Outbox pattern consumer (08-PROD §12 schema) = 13-MAINT 8 events + 14-MULTI 3 TO events zero redesign
   - DSL rule registration pattern (02-SET §7.8) = 9 new rules straightforward additions
   - Reference table pattern (02-SET §8.1) = 4 new tables + 1 extension straightforward
   - Sub-module breakdown 13-a..e / 14-a..e = proven pattern from C3/C4/C5 Sesja 1 sessions
   - Bundled revision pattern (v3.1 → v3.2 → v3.3) = 3× precedent, stabilny atomic delta
5. **Cross-PRD consistency enforced** — D-MNT-11 consumer link (15-OEE owner) + D-MNT-10 FK bridge (09-QA stub) + D-MS-3 extension of 05-WH `to_state_machine_v1` — wszystkie architectural patterns consistent.
6. **Zero new ADRs needed** — 4 existing ADRs (028-031) pokrywają wszystkie architectural needs 13-MAINT + 14-MULTI (ADR-030 hierarchy pattern reuse, ADR-031 feature flag orchestration prominent w 14-MULTI D-MS-14).

**Phase C CLOSED. Phase D lock confirmed. Phase E Build kickoff next session.**

---

## Related

- [`13-MAINTENANCE-PRD.md`](../../13-MAINTENANCE-PRD.md) v3.0 — primary deliverable (~480 linii)
- [`14-MULTI-SITE-PRD.md`](../../14-MULTI-SITE-PRD.md) v3.0 — primary deliverable (~430 linii)
- [`02-SETTINGS-PRD.md`](../../02-SETTINGS-PRD.md) v3.3 — secondary deliverable (bundled delta, +9 rules, +4 ref tables, +changelog)
- [`2026-04-20-c5-sesja1-close.md`](./2026-04-20-c5-sesja1-close.md) — input HANDOFF (C5 Sesja 1 close)
- [`15-OEE-PRD.md`](../../15-OEE-PRD.md) v3.0 — `oee_shift_metrics` producer + `oee_maintenance_trigger_v1` rule (D-MNT-11 consumer link)
- [`09-QUALITY-PRD.md`](../../09-QUALITY-PRD.md) v3.0 §6 Q6 — equipment_calibration FK stub (D-MNT-10 target)
- [`05-WAREHOUSE-PRD.md`](../../05-WAREHOUSE-PRD.md) v3.0 — `to_state_machine_v1` base (extended by D-MS-3 IN_TRANSIT)
- [`00-FOUNDATION-PRD.md`](../../00-FOUNDATION-PRD.md) v3.0 — R7 data residency, REC-L1 site_id, REC-L5 per-site shifts
- [`_foundation/research/MES-TRENDS-2026.md`](../../_foundation/research/MES-TRENDS-2026.md) — §9 13-MAINTENANCE (SMB CMMS buy vs build) + 14-MULTI-SITE competitive analysis (AVEVA/Plex/Aptean/CSB)

**Phase C5 Sesja 2 + Phase C CLOSED — 15/15 modułów PRD v3.0+ complete (100%).**

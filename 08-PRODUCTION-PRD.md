# 08-PRODUCTION-PRD.md

**Module:** 08-PRODUCTION — WO Execution Engine, Shop Floor Control, Allergen Changeover Gate, INTEGRATIONS stage 2 (D365 WO push)
**Version:** 3.0 (Phase C3 Sesja 1, 2026-04-20)
**Status:** Written (full rewrite vs v3.1 baseline)
**Owner:** Production Operations domain
**Dependencies:** 04-PLANNING-BASIC v3.1, 05-WAREHOUSE v3.0, 06-SCANNER-P1 v3.0, 03-TECHNICAL v3.0, 02-SETTINGS v3.0, 00-FOUNDATION v3.0, 07-PLANNING-EXT v3.0
**Consumers:** 09-QUALITY (CCP triggers), 10-FINANCE (WIP+yield costing), 12-REPORTING (production KPIs), 15-OEE (OEE calculation primary source)

---

## Changelog

- **v3.0 (2026-04-20)** — Full rewrite vs v3.1 baseline (774 linii pre-Phase-D). Phase D renumbering M06→08. Adds: allergen changeover gate rule engine DSL, INTEGRATIONS stage 2 inline (D365 WO confirmations push, outbox, DLQ, R14 idempotency), per-minute OEE aggregation (Q4), PLC integration deferred P2 (Q5), schema-driven changeover L3 (Q6), async outbox D365 push (Q7), admin-configurable downtime categories (Q8), catch weight confirmation, ZPL label printing P2, operator KPIs (consumption speed, FEFO compliance). 16 sections, 15 decisions (D1-D15 — D1-D11 baseline retained + D12-D15 Phase C3 new), 7 sub-modules build sequence (08-a..g) + 5 Phase 2 (08-h..l).
- **v3.1 baseline (2026-02-18)** — pre-Phase-D, 774 lines, M06 naming, 6 epics P1 + 4 P2, D1-D11 baseline decisions. Covers LP-based consumption, output+by-products, genealogy P1, waste categorization, downtime tracking. Missing: allergen gate, INTEGRATIONS stage 2, OEE, catch weight, ZPL, PLC — all added in v3.0.

---

## 1. Executive Summary

### 1.1 Mission

08-PRODUCTION is the **WO execution engine** — the runtime system that turns scheduled WOs (from 04-PLANNING + 07-EXT) into physical product via operator actions on shop floor. It owns:

1. **WO lifecycle execution** — START → IN_PROGRESS → COMPLETED (strict all-must-complete gate per Phase D #17)
2. **Material consumption** — LP-based via 06-SCANNER SCN-080 (consume-to-WO), genealogy tracking, FEFO compliance
3. **Output registration** — primary + co-products + by-products → LP creation via 05-WAREHOUSE API, catch-weight entry
4. **Waste logging** — categorized, operator-attributed, analytics-ready
5. **Downtime events** — operator-logged (P1) + PLC-auto (P2), categorized (People/Process/Plant + admin extensions)
6. **Allergen changeover gate** — cleaning validation + ATP swab + dual sign-off per contamination risk level (BRCGS Issue 10 compliant)
7. **Real-time OEE foundation** — per-minute Availability × Performance × Quality aggregation (P2 dashboard in 15-OEE)
8. **INTEGRATIONS stage 2 inline** — D365 WO confirmations push via outbox pattern, DLQ retry, UUID v7 idempotency (R14)

### 1.2 Why this scope (vs 06-SCANNER, 04-PLANNING, 09-QUALITY)

Module boundaries clarified:
- **04-PLANNING-BASIC** — owns WO *definition* (what to make, when, with what BOM) + DAG cascade logic
- **07-PLANNING-EXT** — owns WO *scheduling* (advanced optimizer, allergen sequencing)
- **06-SCANNER-P1** — owns WO *interaction frontend* (PWA screens for operators on shop floor)
- **08-PRODUCTION** — owns WO *execution backend engine* (state machine, mutations, side-effects, KPIs, integrations)
- **05-WAREHOUSE** — owns LP *inventory* (scan-to-consume API, put-away)
- **09-QUALITY** — owns CCP (P2), ATP integrations, dual sign-off verification
- **15-OEE** — owns OEE dashboard + analytics (08-PRODUCTION is primary data source)

06-SCANNER § 8.5 defines *what screens display*; 08-PRODUCTION defines *what APIs do when scanner calls them* + *what happens afterwards* (outbox events, D365 push, genealogy writes, KPI aggregation).

### 1.3 Core primitives

| # | Primitive | Layer | Ownership |
|---|---|---|---|
| 1 | `wo_executions` table (runtime state) | L1 | 08-PROD |
| 2 | `wo_material_consumption` table | L1 | 08-PROD |
| 3 | `wo_outputs` table (primary+co+by) | L1 | 08-PROD |
| 4 | `wo_waste_log` table | L1 | 08-PROD |
| 5 | `downtime_events` table | L1 | 08-PROD |
| 6 | `changeover_events` table | L1 | 08-PROD |
| 7 | `production_shifts` table | L1 | 02-SETTINGS source, 08-PROD consumer |
| 8 | `allergen_changeover_validations` table | L1 | 08-PROD |
| 9 | `oee_snapshots` table (per-minute aggregation) | L1 | 08-PROD (consumed by 15-OEE) |
| 10 | `production_outbox_events` (outbox pattern) | L1 | 08-PROD (INTEGRATIONS stage 2) |
| 11 | `d365_push_dlq` (dead letter queue) | L1 | 08-PROD (INTEGRATIONS stage 2) |
| 12 | `wo_state_machine_v1` DSL rule | L1 DSL | 02-SETTINGS registry |
| 13 | `allergen_changeover_gate_v1` DSL rule | L1 DSL | 02-SETTINGS registry |
| 14 | `closed_production_strict_v1` DSL rule (Phase D #17) | L1 DSL | 02-SETTINGS registry |
| 15 | `output_yield_gate_v1` DSL rule | L1 DSL | 02-SETTINGS registry |

### 1.4 Build sequence (7 sub-modules, est. 20-25 sesji impl)

- **08-a Execution Core** (4-5 sesji) — wo_executions, state machine DSL, START/PAUSE/RESUME/COMPLETE endpoints, operator dashboard
- **08-b Consumption** (3-4 sesji) — wo_material_consumption, consume-to-WO backend (consumes 06-SCN §14.1), over-consumption approval flow, FEFO compliance tracking
- **08-c Output + Waste** (3-4 sesji) — wo_outputs (primary/co/by), wo_waste_log, catch weight entry, output yield gate, 05-WH LP creation integration
- **08-d Downtime + Shifts** (3-4 sesji) — downtime_events, shift attribution, admin-configurable categories (Q8), dashboard
- **08-e INTEGRATIONS stage 2** (3-4 sesji) — outbox pattern impl, D365 WO confirmation push, DLQ retry policy, R14 idempotency, anti-corruption layer R15
- **08-f Dashboard + KPIs** (2-3 sesji) — production dashboard, KPI widgets (yield, completion, waste, downtime), per-minute OEE aggregation job
- **08-g Allergen Changeover Gate** (2-3 sesji) — allergen_changeover_validations, DSL rule, cleaning checklist + ATP swab + dual sign-off UI, 09-QUALITY handoff

**Phase 2 sub-modules:**
- **08-h PLC Integration** (P2) — OPC UA client, machine signals, auto-downtime trigger
- **08-i Catch Weight Scale** (P2) — BT/serial scale direct input
- **08-j ZPL Label Printing** (P2) — scanner-native; browser PDF Phase 1 fallback
- **08-k OEE Advanced** (P2) — streaming events, anomaly detection EWMA (handoff to 15-OEE)
- **08-l Operator Performance Analytics** (P2) — leaderboards, efficiency trends (12-REPORTING)

### 1.5 Markers legend

- `[UNIVERSAL]` — applies to all tenants (L1 core)
- `[FORZA-CONFIG]` — Forza-specific configuration, pattern universal
- `[EVOLVING]` — under active change
- `[LEGACY-D365]` — D365 shape/logic for bridge-period

---

## 2. Objectives & Success Metrics

### 2.1 Primary objectives

1. **Yield compliance** — WO output_qty ≥ planned_qty × 0.95 for ≥95% of WOs (Forza target)
2. **On-time completion** — ≥85% WOs completed within planned_end_time +2h tolerance
3. **Waste reduction** — total waste <3% of input material weight (rolling 30d)
4. **FEFO compliance** — ≥98% of consumptions use FEFO-suggested LP (deviations audited)
5. **Allergen changeover gate** — 100% enforcement on risk_level ≥ medium pairs (zero bypass allowed)
6. **D365 push reliability** — ≥99.9% WO confirmations successfully pushed within 5min of completion (INTEGRATIONS stage 2)
7. **Genealogy completeness** — 100% of output LPs have forward+backward traceability <2s query (FSMA 204)

### 2.2 Secondary objectives

1. **Downtime transparency** — 100% downtime events logged with category + duration (vs baseline estimate 60% logged in pre-MES Excel flow)
2. **Operator consumption speed** — median scan-to-WO ≤ 8s per LP (UX efficiency)
3. **OEE baseline** — calculable per line per shift (A × P × Q components tracked), target publish dashboard P2
4. **Catch weight variance** — tolerance compliance ≥99% (items with weight_mode='catch')
5. **Changeover cleaning compliance** — 100% recorded changeover events have completed cleaning checklist

### 2.3 Non-goals (explicit)

1. **Full MES cloning** (vs Rockwell/Siemens) — 08-PROD is food-mfg batch-oriented, not discrete/process chemical plant
2. **Real-time PLC orchestration** (<1s latency) — P2 subset only; full PLC → 13-MAINTENANCE + Phase 3
3. **Operator vision QA** (AI-based defect detection) — Phase 3+ (R13 AI-ready event fields prep in v3.0)
4. **Auto-dispatching to next operation** — Phase 3+ (human-driven P1-P2)
5. **Weighing scale direct integration** — Phase 2+ (manual catch weight entry P1)

### 2.4 Success metrics summary

| KPI | Target | Measured by | Frequency |
|---|---|---|---|
| Yield compliance | ≥95% WOs @ ≥95% output | `wo_outputs.total_qty / wo.planned_qty` | Daily |
| On-time completion | ≥85% | `wo.completed_at ≤ wo.planned_end_time + 2h` | Daily |
| Waste % | <3% | `wo_waste_log.qty / wo_material_consumption.qty` | Weekly |
| FEFO compliance | ≥98% | `consumption.fefo_adherence_flag = true` | Daily |
| Allergen gate enforcement | 100% risk≥med pairs | `allergen_changeover_validations` required where matrix.risk_level ∈ (medium, high) | Per WO |
| D365 push success | ≥99.9% within 5min | `production_outbox_events.status = 'delivered'` | Real-time |
| Genealogy query time | <2s P95 | `lp_genealogy` recursive CTE latency | Per query |
| Downtime logging | 100% events logged | `downtime_events` count vs line-idle minutes | Weekly |

---

## 3. Personas & RBAC

### 3.1 Personas

**Operator** [UNIVERSAL]
- Primary user, shop floor
- Uses 06-SCANNER PWA (tablet/handheld) for all WO interactions
- Rarely touches 08-PROD desktop UI (except: override modals, dual sign-off)
- Operates under shift_id + line_id context (SCN-012 Site/Line/Shift select)

**Shift Lead** [UNIVERSAL]
- Line supervisor
- Approves over-consumption, waste reason overrides
- Monitors line dashboard (08-PROD desktop)
- Triggers allergen changeover gate sign-off (dual-signer role)
- Can PAUSE/RESUME WOs mid-execution

**Production Manager** [UNIVERSAL]
- Strategic oversight
- Read-only on most 08-PROD entities
- Write on downtime category taxonomy (02-SETTINGS admin)
- Approves extraordinary waste / write-off events (>threshold)
- Signs off closed_production_strict gate on Phase D #17 override

**QA Inspector** [UNIVERSAL]
- Quality domain role (primary in 09-QUALITY)
- In 08-PROD: triggers quarantine on WO output via SCN-071 (06-SCN handoff)
- Second signer on allergen changeover gate (role = quality_lead)
- Read on `wo_outputs.qa_status`

**NPD Manager (Jane)** [FORZA-CONFIG]
- Read-only on 08-PROD for new FA ramp-up validation
- Flags products with allergen-specific process notes (process_allergen_additions in 03-TECH §10.4)

**System (Production Daemon)** [UNIVERSAL]
- Outbox dispatcher (INTEGRATIONS stage 2 §12)
- Per-minute OEE aggregation job
- Downtime classification auto-tag (if PLC P2 enabled)
- LP lock cleanup (05-WH §13.4 consumer)

### 3.2 RBAC matrix

| Entity / Action | Operator | Shift Lead | Prod Manager | QA | NPD | System |
|---|---|---|---|---|---|---|
| WO start/pause/resume/complete | exec via scanner | exec via desktop | read | read | read | - |
| `wo_material_consumption` | exec via SCN-080 | approve override | read | read | - | - |
| `wo_outputs` register | exec via SCN-082 | approve catch weight override | read | qa_status write | - | - |
| `wo_waste_log` | exec via SCN-084 | approve over-threshold | read | read | - | - |
| `downtime_events` | write (log) | edit category | edit taxonomy (via SETTINGS) | read | - | auto-write (PLC P2) |
| `changeover_events` | - | write (start/end) | read | - | - | - |
| `allergen_changeover_validations` | complete checklist | first sign-off | - | second sign-off | - | - |
| D365 push DLQ | - | - | read + replay | - | - | dispatch |
| OEE snapshots | - | read | read | read | - | auto-write |

### 3.3 Role mapping to 02-SETTINGS §14

Forza default: operator, shift_lead, production_manager, quality_lead, npd_manager, system. L2 tenants can extend via admin wizard (e.g., add "line_maintenance" role).

---

## 4. Scope

### 4.1 Phase 1 (P1) — MVP scope

**In scope P1:**

1. **WO execution lifecycle** — START / PAUSE / RESUME / COMPLETE via scanner + desktop, state machine DSL `wo_state_machine_v1`
2. **Material consumption** — backend for SCN-080 consume-to-WO, LP deduction via 05-WH API, genealogy link, FEFO compliance flag
3. **Over-consumption flow** — operator scans more than BOM planned, Shift Lead approval modal, reason_code mandatory
4. **Output registration** — primary product LP creation (via 05-WH), co-products + by-products per BOM allocation_pct (03-TECH §7.2), catch weight entry (items.weight_mode='catch')
5. **Output yield gate** — `output_yield_gate_v1` DSL rule validates total output qty vs BOM yield_pct, flags anomalies, requires Prod Manager override if >10% variance
6. **Closed_Production strict all-must-complete** (Phase D #17) — rule `closed_production_strict_v1` enforces: all components consumed AND all outputs registered before WO.status → COMPLETED
7. **Waste logging** — per-category qty, reason_code (category taxonomy from 02-SETTINGS, admin-configurable), analytics dimensions (line, shift, operator, product)
8. **Downtime events** — operator-logged (PAUSE → reason_code from taxonomy), manual duration entry, impact classification (planned/unplanned)
9. **Changeover events** — start on SCN-081 "start changeover" action, end on SCN-081 "complete changeover" after cleaning checklist + ATP (if required) + dual sign-off
10. **Allergen changeover gate** (NEW v3.0) — `allergen_changeover_gate_v1` DSL rule triggers on WO transition when allergen_delta detected, blocks WO START until validation complete
11. **Dual sign-off UI** — shift_lead + quality_lead digital signatures stored in `allergen_changeover_validations` (BRCGS Issue 10 immutable audit)
12. **Shifts attribution** — every mutation stamped with shift_id from `production_shifts` (source 02-SETTINGS), operator_id
13. **Genealogy writes** — consumed LPs → produced LP in `lp_genealogy` (05-WH §11), FSMA 204 <2s backward query support
14. **Production dashboard** — per-line real-time: current WO, progress %, yield %, downtime min, waste %, operator on duty
15. **INTEGRATIONS stage 2 (D365 WO confirmations push)** — outbox pattern, `production_outbox_events` table, dispatcher service, DLQ retry, R14 idempotency — async (Q7), anti-corruption layer R15
16. **Per-minute OEE aggregation** (Q4) — `oee_snapshots` table populated by job, Availability × Performance × Quality decomposition, P2 dashboard in 15-OEE
17. **R14 idempotency** on all scanner-triggered mutations (UUID v7 transaction_id)
18. **Catch weight entry** (base P1, polish P2) — operator inputs actual_kg per output LP, variance_pct calculated vs planned; tolerance soft-check P1
19. **Label printing (browser PDF P1)** — on output registration, print receipt with GTIN + batch + expiry + weight; ZPL native P2

**Out of scope P1 (→ P2):**

1. PLC integration (OPC UA machine signals, auto-downtime) [D12]
2. ZPL native printer integration (Phase 1 = browser PDF fallback) [D14]
3. Advanced catch weight (scale direct integration, tolerance enforcement hard) [D13 polish]
4. OEE real-time streaming (Phase 1 = per-minute batch aggregation) [D15]
5. Operator performance leaderboards (→ 12-REPORTING)
6. Vision QA defect detection (Phase 3+) — but event schema includes AI-ready fields (R13: defect_class, confidence_score, image_url, model_version, reviewed_by_human) from day 1
7. Shift handover digital form (currently paper + shift_lead comments field)
8. Predictive maintenance triggers (→ 13-MAINTENANCE)

### 4.2 Phase 2 (P2) — Advanced scope

**In scope P2:**

1. **PLC integration (D12)** — OPC UA client service, machine start/stop signals, auto-downtime events on fault codes, correlates to `downtime_events` with source='plc'
2. **ZPL label printing (D14)** — scanner-native via Bluetooth printer, ZPL-II format, GS1-128 encoding per R15
3. **Catch weight scale integration** — direct BT/serial scale input, eliminates manual entry
4. **OEE streaming** — Redis streams for sub-minute granularity (currently P1 per-minute batch)
5. **Machine interlocks** — P2 subset: start/stop interlock (prevents WO start if machine status='fault')
6. **Operator performance analytics** — consumption speed trends, FEFO compliance %, rework incidence (→ 12-REPORTING integration)
7. **Shift handover digital form** — replaces paper, structured entry, searchable

**Out of scope P2 (→ P3+):**

1. Full OPC UA orchestration (dispatching, recipes download from MES to PLC)
2. AI-based defect detection (vision QA)
3. Voice-directed operator workflows
4. Mobile SSCC generation (Phase 3+)

### 4.3 Scope summary table

| Feature | P1 | P2 | P3+ |
|---|---|---|---|
| WO state machine DSL | ✅ | - | - |
| Consumption + FEFO compliance | ✅ | - | - |
| Output + co-products + by-products | ✅ | - | - |
| Waste categorized + admin taxonomy | ✅ | - | - |
| Downtime manual entry | ✅ | - | - |
| Downtime PLC auto | - | ✅ | full orchestration |
| Allergen changeover gate | ✅ | - | - |
| Closed_Production strict gate | ✅ | - | - |
| D365 WO push (INTEGRATIONS stage 2) | ✅ | - | - |
| R14 idempotency | ✅ | - | - |
| OEE per-minute aggregation | ✅ | streaming | - |
| Catch weight manual entry | ✅ | scale integration | - |
| Label printing browser PDF | ✅ | ZPL native | - |
| Genealogy FSMA 204 | ✅ | - | EPCIS Phase 2+ |
| Vision QA | - | - | ✅ (Phase 3+) |
| Operator leaderboards | - | ✅ | - |

---

## 5. Constraints

### 5.1 Architecture constraints

**[UNIVERSAL]**

1. **LP-based only** — all consumption and output via LPs (no loose qty mutations). Enforces genealogy integrity.
2. **BOM snapshot immutable** per WO (ADR-002) — BOM changes in 03-TECH after WO creation do NOT mutate existing WO; new BOM = next WO.
3. **Event-first outbox (R1)** — every mutation emits outbox event; D365 push + 15-OEE + 12-REPORTING consumers read from outbox, not direct DB poll.
4. **R14 idempotency** — all scanner-triggered mutations accept UUID v7 client-generated transaction_id; replay returns cached response.
5. **R15 anti-corruption layer** — D365 push format isolated in dedicated adapter; internal model uses GS1-first identifiers (GTIN/SSCC), D365 code mappings via `integration.d365.code_map` (02-SETTINGS §11).
6. **RLS enforced** — all 08-PROD tables tenant-scoped (ADR-003).
7. **Async D365 push (Q7)** — outbox + scheduled dispatcher, NOT synchronous inline; rationale MES-TRENDS R1 (event-first resilient).
8. **Per-minute OEE (Q4)** — Postgres batch job every 60s writes `oee_snapshots`; streaming deferred P2.
9. **PLC deferred P2 (Q5)** — P1 = manual downtime entry only; no OPC UA client in P1 codebase.
10. **Changeover schema-driven L3 (Q6)** — `changeover_events` has `ext_jsonb` for tenant-specific fields (ADR-028 L3); base columns universal.
11. **Downtime admin-configurable (Q8)** — `downtime_categories` table in 02-SETTINGS, Forza default seed 10 categories (People/Process/Plant x 3-4 sub each), tenant can extend/rename/disable.

### 5.2 Business constraints

**[FORZA-CONFIG, becoming UNIVERSAL]**

1. **7 production departments** (Forza dept taxonomy, configurable per ADR-030): Core/NPD, Technical/QA, Planning, Warehouse, Production, Shipping, Maintenance
2. **3 Forza production stages** mapped to lines: Fresh → Cooked → Breaded/Marinated → Packaging
3. **Single-site P1** — multi-site via 14-MULTI-SITE Phase C5
4. **Allergen changeover 100% enforcement** — BRCGS audit requirement, zero exceptions for risk≥medium pairs
5. **Over-consumption approval threshold** — default 5% of BOM planned; tenant-configurable (02-SETTINGS §10)
6. **Waste threshold alert** — default 5% per WO triggers Shift Lead notification; admin-configurable
7. **Catch weight tolerance** — default ±10% of planned avg_kg per unit; tenant-configurable

### 5.3 Regulatory constraints

**[UNIVERSAL]**

1. **BRCGS Issue 10 (2026)** — digital signatures on critical events (allergen gate sign-off, closed_production_strict override), immutable audit trail (append-only logs)
2. **FSMA 204 (2028-07-20)** — lot genealogy forward+backward <2s (delivered via 05-WH §11 recursive CTE + outbox EPCIS consumer P2)
3. **EU FIC 1169/2011 + 2021/382** — allergen-free claims require documented changeover evidence (allergen_changeover_validations retained 7y)
4. **FDA 21 CFR Part 11** (for export FAs) — electronic signature format: user_id + timestamp + action + checksum
5. **HACCP + CCP events** — 08-PROD raises CCP events (temperature deviation, metal detect fail) to 09-QUALITY (P2 integration)
6. **GDPR** — operator_id linked to personal data (name, employment); 08-PROD retains operator_id + shift_id for audit, personal data in `users` (02-SETTINGS) under RLS
7. **Digital signature retention** — BRCGS 7 years minimum

### 5.4 Performance constraints

1. **WO state transition API** — <300ms P95 (operator-facing)
2. **Consume-to-WO API** — <500ms P95 (per 06-SCN §14.3)
3. **Output registration API** — <2s P95 (includes LP creation via 05-WH + genealogy write + outbox event emit)
4. **Per-minute OEE aggregation job** — complete within 45s for 10 lines × 10 WOs concurrent
5. **D365 push dispatcher** — process outbox queue, deliver within 5min of event enqueue (99.9% SLA)
6. **DLQ retry schedule** — 5min, 30min, 2h, 12h, 24h (5 attempts before manual intervention)
7. **Production dashboard** — <2s P95 render for 5 lines × current state
8. **Genealogy recursive CTE** — <2s P95 for 10-level deep tree (consumed by FSMA 204 queries)

### 5.5 Data retention

| Entity | Retention | Rationale |
|---|---|---|
| `wo_executions` | 7 years | BRCGS audit |
| `wo_material_consumption` | 7 years | Genealogy + BRCGS |
| `wo_outputs` | 7 years | Traceability |
| `wo_waste_log` | 3 years | Analytics + audit |
| `downtime_events` | 3 years | Analytics |
| `changeover_events` | 7 years | BRCGS (cleaning audit) |
| `allergen_changeover_validations` | 7 years | BRCGS Issue 10 |
| `oee_snapshots` (per-minute) | 90 days rolling | Analytics; aggregate to hourly/daily long-term (15-OEE) |
| `production_outbox_events` | 90 days post-delivery | Audit + replay |
| `d365_push_dlq` | Until resolved | Ops queue |

---

## 6. Decisions

### D1 — WO state machine as DSL rule `wo_state_machine_v1` [UNIVERSAL]

**Decision:** WO transitions (DRAFT → READY → IN_PROGRESS → PAUSED → COMPLETED | CANCELLED) encoded as DSL rule in 02-SETTINGS §7 registry (consistent with `lp_state_machine_v1` in 05-WH). Dev-authored, admin read-only + dry-run.

**Rationale:** Consistent with workflow-as-data pattern; A/B testable (v1, v2); tenant customization via transition_labels (not logic) P2.

### D2 — Over-consumption approval flow [UNIVERSAL]

**Decision:** When operator consumes qty exceeding BOM planned × tolerance (default 5%), modal blocks further action until Shift Lead approval. Approval records: user_id, reason_code (selection from taxonomy: waste/spillage/rework/scale_error/other), notes.

**Consequences:** Ensures BRCGS audit trail, prevents silent yield distortion.

### D3 — Closed_Production strict (Phase D #17) [UNIVERSAL]

**Decision:** WO → COMPLETED blocked until all BOM components consumed (within tolerance) AND all outputs registered (primary + co-products). Override requires Prod Manager + reason_code. Encoded as DSL rule `closed_production_strict_v1`.

**Rationale:** Phase D lock-in #17 — prevents WO left in limbo, ensures genealogy completeness.

### D4 — Output yield gate [UNIVERSAL]

**Decision:** On output registration complete, `output_yield_gate_v1` rule checks total_output_qty vs BOM yield_pct × input. If variance >10%, flags anomaly, requires Prod Manager review (soft block P1, can approve with reason).

**Rationale:** Catches systematic yield issues, triggers 15-OEE alerts.

### D5 — Waste category taxonomy [UNIVERSAL]

**Decision:** `waste_categories` table in 02-SETTINGS §8 reference tables. Forza seed = 10 categories (spillage, trim, rework-fail, expired-rm, quality-reject, cleaning, scale-calibration, packaging-damage, customer-reject, other). Tenant admin can extend/rename via 02-SETTINGS admin wizard.

### D6 — Downtime taxonomy admin-configurable (Q8) [UNIVERSAL]

**Decision:** `downtime_categories` table in 02-SETTINGS. Forza seed = 10 categories mapped to lean 6 Big Losses (People/Process/Plant):
- People: operator_break, operator_missing, training
- Process: material_wait, upstream_delay, downstream_blocked, quality_hold
- Plant: machine_fault, cleaning, changeover

Tenant can extend (L2 config per ADR-030). Per-line default mapping optional.

### D7 — OEE per-minute aggregation (Q4) [UNIVERSAL]

**Decision:** Scheduled job runs every 60s, reads events for last minute, computes A × P × Q per (line_id, shift_id) as `oee_snapshots` row. Consumer: 15-OEE dashboard. Streaming deferred P2.

**Formula:**
- Availability = (planned_production_min - downtime_min) / planned_production_min
- Performance = (actual_output_qty × ideal_cycle_time) / run_time_min
- Quality = good_qty / total_output_qty (good = output - rework - scrap)

**Rationale (Q4 A choice):** Simpler, zero ops overhead (Postgres-only), good-enough latency for food-mfg (1min granularity sufficient for operator feedback; dashboard refresh 30s).

### D8 — D365 WO push async outbox (Q7) [UNIVERSAL]

**Decision:** WO confirmation events written to `production_outbox_events` on WO completion. Dispatcher service (Python or Node worker) polls queue every 30s, maps internal model → D365 JournalLines format, calls D365 API, on success marks delivered, on failure increments attempt_count + schedules retry per DLQ policy.

**Consequences:**
- Pro: Resilient to D365 API outages (queue absorbs), audit trail, decoupled scaling
- Con: Eventual consistency (up to 5min latency vs realtime) — acceptable for accounting use case

**Payload format (LEGACY-D365):**
```json
{
  "journalName": "PROD-YYYY-MM-DD",
  "companyId": "FNOR",
  "lines": [
    {"itemId": "FA5101", "qty": 1000, "warehouse": "ForzDG", "batchId": "WO-2026-0001-OUT", "datePhysical": "2026-04-20", "..."},
    // co-products, by-products as separate lines
  ],
  "metadata": {"wo_id": "...", "transaction_id": "uuid-v7", "monopilot_version": "3.0"}
}
```

### D9 — Changeover tracking schema-driven L3 (Q6) [UNIVERSAL]

**Decision:** `changeover_events` table has typed base columns (event_id, wo_from_id, wo_to_id, line_id, started_at, completed_at, duration_min, cleaning_completed, atp_result, dual_sign_off_status) + `ext_jsonb` for tenant-specific fields (ADR-028 L3).

**Rationale:** Per Phase D principle "easy extension"; Forza may extend with `swab_location`, `scm_ticket_id`, `allergen_pair_reviewed` later via 02-SETTINGS admin wizard.

### D10 — Allergen changeover gate (NEW v3.0) [UNIVERSAL]

**Decision:** DSL rule `allergen_changeover_gate_v1` triggers on WO START action. Evaluates:
1. Lookup previous WO on same line
2. Compute allergen_delta = (prev.allergens ∩ not in current.allergens) ∪ (current allergen constraint violations)
3. Lookup `changeover_matrix` (07-EXT §9.4) for (prev_allergens, current_allergens, line_id)
4. If `cleaning_required=true`: block WO START until cleaning_completed=true in `changeover_events`
5. If `atp_required=true`: block until atp_result ≤ 10 RLU (Forza default) AND PASSED status
6. If `segregation_required=true`: block indefinitely (scheduler should have prevented this — audit flag)
7. Require dual_sign_off (shift_lead + quality_lead) for risk≥medium pairs

**Output:** `allergen_changeover_validations` row with all evidence (checklist items, ATP lab result, signatures).

### D11 — Operator KPIs tracked [UNIVERSAL]

**Decision:** Per operator rolling metrics:
- `consumption_speed_median` (seconds per LP scan-to-commit) — target ≤8s
- `fefo_compliance_pct` — target ≥98%
- `over_consumption_incidence` — count per month
- `waste_attribution_pct` — share of waste logged under this operator's shifts

Stored as materialized view `operator_kpis_monthly`, refreshed daily. P2 published to 12-REPORTING leaderboard.

### D12 — PLC integration deferred P2 (Q5) [UNIVERSAL]

**Decision:** P1 = manual downtime entry only. P2 subset = OPC UA client service reads machine start/stop/fault signals, writes `downtime_events` with source='plc'. Full orchestration (recipe download, auto-dispatch) → P3+.

**Rationale:** PLC integration = infrastructure project (OPC UA server discovery, industrial network). Defer until Forza has OPC UA servers online (they don't at P1 timeline).

### D13 — Catch weight P1 manual, P2 scale [UNIVERSAL]

**Decision:** P1 = operator manually enters actual_kg in output modal; variance vs planned calculated soft warning if >tolerance. P2 = BT/serial scale direct input via scanner PWA (Web Bluetooth API or Web Serial API).

### D14 — ZPL printing P2, browser PDF P1 [UNIVERSAL]

**Decision:** P1 = browser-generated PDF label (pdf-lib), printed via OS print dialog. P2 = ZPL-II native via scanner Bluetooth printer pairing. Same data payload (GTIN-128, batch, expiry, weight).

### D15 — OEE EWMA anomaly detection P2 [UNIVERSAL]

**Decision:** P1 = basic OEE per minute aggregation (D7). P2 = Exponentially Weighted Moving Average (EWMA) on rolling 30min window, alert if current snapshot deviates >2σ from baseline. Consumer: 15-OEE dashboard.

### D-summary table

| # | Decision | Status | Rule/ADR |
|---|---|---|---|
| D1 | WO state machine = DSL `wo_state_machine_v1` | Locked | 02-SETTINGS §7 |
| D2 | Over-consumption approval (Shift Lead, reason_code) | Locked | - |
| D3 | Closed_Production strict all-must-complete (Phase D #17) | Locked | `closed_production_strict_v1` |
| D4 | Output yield gate (>10% variance → review) | Locked | `output_yield_gate_v1` |
| D5 | Waste categories admin-configurable | Locked | 02-SETTINGS §8 |
| D6 | Downtime categories admin-configurable (Q8) | Locked | 02-SETTINGS §8 |
| D7 | OEE per-minute aggregation (Q4) | Locked | - |
| D8 | D365 push async outbox (Q7) | Locked | INTEGRATIONS stage 2 §12 |
| D9 | Changeover schema-driven L3 (Q6) | Locked | ADR-028 L3 |
| D10 | Allergen changeover gate DSL rule | Locked | `allergen_changeover_gate_v1` |
| D11 | Operator KPIs tracked | Locked | - |
| D12 | PLC deferred P2 (Q5) | Locked | - |
| D13 | Catch weight P1 manual, P2 scale | Locked | - |
| D14 | ZPL P2, browser PDF P1 | Locked | - |
| D15 | OEE EWMA anomaly detection P2 | Locked | - |

---

## 7. Module Map (7 epics P1 + 5 P2)

### 7.1 Epic E1 — Execution Core (08-a) [P1]

**Scope:**
- `wo_executions` runtime state table
- `wo_state_machine_v1` DSL rule
- START / PAUSE / RESUME / COMPLETE / CANCEL endpoints
- Desktop operator dashboard (per-line live view)
- Scanner integration (SCN-081 WO execute screen backend)

**FRs:**
- FR-08-E1-001: POST /api/production/work-orders/:id/start — transitions DRAFT/READY → IN_PROGRESS, sets started_at, triggers allergen_changeover_gate
- FR-08-E1-002: POST /api/production/work-orders/:id/pause — sets status=PAUSED, opens downtime_event stub (requires reason + duration on resume)
- FR-08-E1-003: POST /api/production/work-orders/:id/resume — closes downtime event, sets status=IN_PROGRESS
- FR-08-E1-004: POST /api/production/work-orders/:id/complete — triggers closed_production_strict_v1; if passes, sets status=COMPLETED, emits outbox event
- FR-08-E1-005: POST /api/production/work-orders/:id/cancel — cancellation workflow, reason_code required, releases reservations
- FR-08-E1-006: GET /api/production/work-orders/:id — full WO runtime state (status, consumption progress %, output progress %, current operator, elapsed time)
- FR-08-E1-007: Desktop dashboard /production shows all active WOs per line with progress bars
- FR-08-E1-008: All mutations idempotent (R14 UUID v7 transaction_id)

### 7.2 Epic E2 — Consumption (08-b) [P1]

**Scope:**
- `wo_material_consumption` table
- POST /api/production/scanner/consume-to-wo backend (consumes 06-SCN §14.1)
- Over-consumption approval modal + flow
- FEFO compliance tracking
- Genealogy link writes

**FRs:**
- FR-08-E2-001: Consume endpoint validates: WO status=IN_PROGRESS, LP.status=AVAILABLE, LP.qa_status=PASSED, LP.product matches BOM component
- FR-08-E2-002: Updates `wo_material_consumption` (LP, qty, operator, timestamp, transaction_id, fefo_adherence_flag)
- FR-08-E2-003: Calls 05-WH API: reduce LP.qty, if qty=0 then status=CONSUMED; create stock_move event
- FR-08-E2-004: Writes lp_genealogy link (consumed LP → WO)
- FR-08-E2-005: Emits outbox event `production.material.consumed`
- FR-08-E2-006: Over-consumption: if cumulative > BOM.planned_qty × (1 + tolerance), returns 409 with `requires_approval=true`; Shift Lead approves via separate endpoint
- FR-08-E2-007: FEFO compliance: compares consumed LP expiry vs FEFO-suggested top-1; flag deviation (per 05-WH §10.5 pattern), log reason_code

### 7.3 Epic E3 — Output + Waste (08-c) [P1]

**Scope:**
- `wo_outputs` table (primary + co-products + by-products, 3 rows per WO typical)
- `wo_waste_log` table
- Output registration endpoints (SCN-082/083 backend)
- Waste logging endpoint (SCN-084 backend)
- Catch weight entry (P1 manual)
- Output yield gate
- Label printing (browser PDF P1)

**FRs:**
- FR-08-E3-001: POST /api/production/work-orders/:id/outputs — primary output LP creation via 05-WH, batch_number auto-gen (pattern: WO_CODE-OUT-NNN), expiry = today + item.shelf_life_days
- FR-08-E3-002: POST /api/production/work-orders/:id/by-products — co-products per BOM.allocation_pct → separate LPs
- FR-08-E3-003: POST /api/production/work-orders/:id/waste-record — qty, category_id, reason_notes
- FR-08-E3-004: Catch weight: if item.weight_mode='catch', modal requires actual_kg per LP; variance_pct soft warning if >tolerance
- FR-08-E3-005: Output yield gate triggered on final output registration (total_output / expected ≥ 0.90 default)
- FR-08-E3-006: Label print: generates PDF with GTIN, batch, expiry, qty/weight, QR code (link to LP detail) — P1 browser print dialog
- FR-08-E3-007: All outputs create lp_genealogy.operation_type='output' linking consumed_lps → produced_lp
- FR-08-E3-008: Emits outbox events `production.output.registered`, `production.byproduct.registered`, `production.waste.logged`

### 7.4 Epic E4 — Downtime + Shifts (08-d) [P1]

**Scope:**
- `downtime_events` table
- `downtime_categories` seed (02-SETTINGS §8 consumer)
- Shift attribution on every mutation
- Downtime dashboard

**FRs:**
- FR-08-E4-001: Downtime event on WO PAUSE (from E1 FR-002); operator selects category from admin-configurable taxonomy
- FR-08-E4-002: Manual downtime entry (Shift Lead desktop UI) for un-PAUSED events (e.g., machine fault detected before WO START)
- FR-08-E4-003: Downtime duration auto-calculated from started_at..ended_at; operator can adjust with reason
- FR-08-E4-004: Shift attribution: every event.recorded_at → lookup active shift for line → shift_id stamp
- FR-08-E4-005: Per-line dashboard widget: MTTR (Mean Time To Repair) last 7d, top 5 categories by duration, downtime trend chart
- FR-08-E4-006: Downtime events feed OEE Availability calculation (E6)

### 7.5 Epic E5 — INTEGRATIONS Stage 2 (08-e) [P1]

**Scope:**
- Outbox pattern impl (`production_outbox_events` table + dispatcher service)
- D365 WO confirmation push (Dynamics 365 F&O API)
- DLQ retry policy
- Anti-corruption layer (R15) — internal model ↔ D365 format
- Admin DLQ review/replay UI

**FRs (detailed in §12 INTEGRATIONS stage 2).**

### 7.6 Epic E6 — Dashboard + KPIs + OEE (08-f) [P1]

**Scope:**
- Production dashboard (desktop, per-line real-time)
- KPI widgets: yield, completion, waste, downtime, FEFO compliance
- Per-minute OEE aggregation job (`oee_snapshots`)
- Operator KPIs materialized view

**FRs:**
- FR-08-E6-001: GET /api/production/dashboard/:line_id — current WO state, operator on duty, progress, realtime stats
- FR-08-E6-002: Per-minute OEE job: cron every 60s, writes `oee_snapshots` with A×P×Q breakdown per (line, shift)
- FR-08-E6-003: KPI aggregations: yield_7d, completion_7d, waste_7d per line
- FR-08-E6-004: `operator_kpis_monthly` materialized view refreshed nightly
- FR-08-E6-005: Dashboard auto-refreshes every 30s via polling (WebSocket P2)

### 7.7 Epic E7 — Allergen Changeover Gate (08-g) [P1]

**Scope:**
- `allergen_changeover_validations` table
- `allergen_changeover_gate_v1` DSL rule (triggered on WO START)
- Cleaning checklist UI (operator + shift lead)
- ATP swab result entry + lookup (09-QUALITY P2 handoff)
- Dual sign-off workflow (shift_lead + quality_lead)

**FRs:**
- FR-08-E7-001: On WO START request, rule evaluates allergen_delta vs previous WO on line
- FR-08-E7-002: If cleaning_required=true: block START until `changeover_events.cleaning_completed=true`
- FR-08-E7-003: Cleaning checklist UI: N-step list (per tenant config in 02-SETTINGS §7 or changeover_matrix.notes), operator check-off with timestamps
- FR-08-E7-004: If atp_required=true: block until ATP result recorded (<10 RLU Forza default, configurable per line)
- FR-08-E7-005: ATP result entry: either manual (paper lab card) or integration with ATP device (P2 via 09-QUALITY)
- FR-08-E7-006: Dual sign-off UI: shift_lead signs first, then quality_lead; digital signature = user_id + timestamp + PIN confirmation
- FR-08-E7-007: Complete validation writes `allergen_changeover_validations` row with all evidence; audit retained 7y (BRCGS Issue 10)
- FR-08-E7-008: On validation complete, WO START proceeds; emits outbox event `production.allergen_changeover.validated`

### 7.8 Phase 2 epics overview

- **E8 PLC Integration (08-h P2):** OPC UA client, machine signals, auto-downtime, start/stop interlock
- **E9 Catch Weight Scale (08-i P2):** BT/serial scale direct input, tolerance hard-enforcement option
- **E10 ZPL Native Printing (08-j P2):** scanner BT printer pairing, ZPL-II format
- **E11 OEE Streaming + EWMA (08-k P2):** Redis streams, anomaly detection, 15-OEE advanced dashboard
- **E12 Operator Leaderboards (08-l P2):** 12-REPORTING integration, performance trends

### 7.9 Epic dependencies

```
E1 (Execution Core) ──┬──→ E2 (Consumption)
                      ├──→ E3 (Output+Waste)
                      ├──→ E4 (Downtime+Shifts)
                      ├──→ E5 (INTEGRATIONS stage 2)
                      ├──→ E6 (Dashboard+KPIs+OEE)
                      └──→ E7 (Allergen Gate)

Cross-module:
E1 ← 04-PLAN §7 (WO lifecycle definition), 07-EXT (scheduler assignment)
E2 ← 05-WH §10 (intermediate LP scan-to-consume), 05-WH §13.4 (LP lock)
E3 ← 05-WH (LP creation API), 03-TECH §7.2 (co-products allocation)
E4 ← 02-SETTINGS §8 (downtime categories), 02-SETTINGS §7 (shift patterns)
E5 ← 02-SETTINGS §11 (D365 constants + code map)
E6 ← 15-OEE (consumer downstream)
E7 ← 07-EXT §9.4 (changeover_matrix), 09-QUALITY (ATP integration P2)
```

---

## 8. Requirements per Screen/API

### 8.1 Screens

#### SCR-08-01: Production Dashboard (Per-Line Live)

**Route:** `/production/dashboard` (desktop) or `/production/dashboard/:line_id` for single-line view
**Roles:** Operator (read-only), Shift Lead, Prod Manager

**Layout:**
- Top bar: line selector (all/individual), shift indicator, current operator on duty per line
- Per-line card (grid 2×3 for 5 lines + spare):
  - Line name + status badge (RUNNING / IDLE / DOWN / CHANGEOVER)
  - Current WO: code, product, progress bar (qty consumed / qty expected input), elapsed_min / planned_duration_min
  - Real-time stats: yield %, waste %, downtime_min today
  - Next scheduled WO: code + product
- Right sidebar: KPI widgets (daily totals across all lines)
- Bottom: recent events feed (last 20, real-time append)
- Auto-refresh 30s (polling)

**Actions:**
- Click line card → deep link /production/lines/:line_id detail
- Click current WO → side panel: materials, consumption progress per component, outputs, dual-sign-off status if applicable
- Shift Lead: PAUSE/RESUME buttons on WO (quick actions)

#### SCR-08-02: WO Detail View

**Route:** `/production/work-orders/:id`
**Roles:** Operator, Shift Lead, Prod Manager, QA

**Layout:**
- Header: WO code, product, status badge, planned qty, actual qty (consumed/output), progress bar
- Tab 1: Materials — list of BOM components with consumption progress (qty_consumed / qty_planned), LPs consumed with links
- Tab 2: Outputs — primary + co-products + by-products rows with qty + catch weight + QA status
- Tab 3: Waste — waste events with category, qty, reason, operator
- Tab 4: Timeline — event log (START, PAUSE, RESUME, consumptions, outputs, COMPLETE), filterable
- Tab 5: Genealogy — visual tree (parent LPs consumed → this WO → output LPs; click to drill down)
- Actions: operator can only view; Shift Lead can PAUSE/RESUME/CANCEL; Prod Manager can force COMPLETE (override closed_production_strict)

#### SCR-08-03: Allergen Changeover Gate (Cleaning + Dual Sign-off)

**Route:** `/production/changeover/:event_id`
**Roles:** Operator, Shift Lead, Quality Lead

**Layout:**
- Header: changeover event context (from WO → to WO, allergens delta, risk level, matrix values)
- Section 1: Cleaning checklist
  - Configurable N-step list per matrix.notes or 02-SETTINGS §7 rule
  - Each step: checkbox + timestamp + operator_id + photo optional (P2)
  - "All steps complete" gate unlocks ATP section
- Section 2: ATP swab result (if required)
  - RLU value input
  - Location(s) swabbed
  - Test method: ATP / ELISA
  - Threshold display (≤10 RLU default)
  - Auto status PASS/FAIL based on threshold
- Section 3: Dual sign-off
  - Shift Lead signature (first): PIN entry + confirm
  - Quality Lead signature (second): PIN entry + confirm (required only after checklist+ATP complete)
- Footer: "Complete Changeover" button (enabled only when all validations passed)
- Side panel: audit history of this validation (for retrospective viewing)

#### SCR-08-04: Waste Analytics

**Route:** `/production/waste`
**Roles:** Shift Lead, Prod Manager

**Layout:**
- Filters: date range, line, shift, operator, category, product
- Charts: waste trend over time, top categories (Pareto), per-line comparison
- Table: waste events with drill-down
- KPI: total waste kg + % this period, benchmark vs target

#### SCR-08-05: Downtime Analytics

**Route:** `/production/downtime`
**Roles:** Shift Lead, Prod Manager

**Layout:**
- Filters: date range, line, shift, category
- Pareto chart top categories
- MTTR/MTBF widgets per line
- Timeline view: Gantt-like downtime blocks per line
- Table: events with drill-down

#### SCR-08-06: D365 Push DLQ Review

**Route:** `/admin/integrations/d365/dlq` (02-SETTINGS §11 + 08-PROD §12)
**Roles:** Prod Manager, Admin

**Layout:**
- Queue: failed push events with attempt_count, last_error, next_retry_at
- Actions: Replay (force retry), Mark resolved (manual push completed outside system), View raw payload (JSON), View mapped D365 payload
- Filters: error type, date range, WO
- Stats: DLQ depth, success rate last 24h, avg retry count

#### SCR-08-07: OEE Dashboard (P2, → 15-OEE)

15-OEE owns this screen; 08-PROD owns data layer (`oee_snapshots`). Cross-link in nav.

### 8.2 APIs

#### 8.2.1 WO Execution

**POST /api/production/work-orders/:id/start**

Body:
```json
{
  "transaction_id": "uuid-v7",
  "operator_id": "...",
  "line_id": "LINE-01",
  "shift_id": "SHIFT-A"
}
```

Response 200 OK:
```json
{
  "wo_id": "...",
  "status": "IN_PROGRESS",
  "started_at": "2026-04-20T06:30:15Z",
  "allergen_gate_required": false
}
```

Response 423 Locked (allergen gate blocks):
```json
{
  "error": "allergen_changeover_required",
  "changeover_event_id": "...",
  "redirect_url": "/production/changeover/:event_id"
}
```

**POST /api/production/work-orders/:id/pause**

Body: `{transaction_id, operator_id, reason_category_id, notes?}`

**POST /api/production/work-orders/:id/resume**

Body: `{transaction_id, operator_id, actual_duration_min?}`

**POST /api/production/work-orders/:id/complete**

Body: `{transaction_id, operator_id, override_reason_code?}` (override required if closed_production_strict fails)

Response 200 OK on pass; 409 Conflict if gate fails with `gate_failures: [{component_id, short_by_qty}, ...]`

**POST /api/production/work-orders/:id/cancel**

Body: `{transaction_id, user_id, reason_code, notes}`

#### 8.2.2 Consumption

**POST /api/production/scanner/consume-to-wo**

(Primary endpoint consumed by 06-SCN SCN-080)

Body:
```json
{
  "transaction_id": "uuid-v7",
  "wo_id": "...",
  "lp_id": "...",
  "qty_consumed": 24.5,
  "operator_id": "...",
  "fefo_suggested_lp_id": "..."
}
```

Response 200: `{consumption_id, new_lp_qty, fefo_adherence_flag, over_consumption_requires_approval: false}`

Response 409: requires approval

**POST /api/production/consumption/:id/approve**

Shift Lead approves over-consumption. Body: `{approver_user_id, reason_code, notes}`

#### 8.2.3 Output

**POST /api/production/work-orders/:id/outputs**

Body:
```json
{
  "transaction_id": "uuid-v7",
  "operator_id": "...",
  "output_type": "primary",
  "qty_kg": 1050.0,
  "batch_number_auto": true,
  "catch_weight_kg_per_unit": null,
  "putaway_location_id": "..."
}
```

Response 200: `{output_id, lp_id, batch_number, label_pdf_url}`

**POST /api/production/work-orders/:id/by-products**

Per BOM bom_co_products, N calls, one per by-product/co-product item.

**POST /api/production/work-orders/:id/waste-record**

Body: `{transaction_id, operator_id, qty, category_id, reason_notes?}`

#### 8.2.4 Material status query

**GET /api/production/work-orders/:id/material-status**

Used by SCN-080 for FEFO context. Returns `{components: [{component_id, planned_qty, consumed_qty, remaining_qty, fefo_lp_suggestions: [...]}]}`

#### 8.2.5 Downtime

**POST /api/production/downtime-events** — manual event creation (Shift Lead, not WO-PAUSE-linked)

**GET /api/production/downtime-events?line_id=&date_from=&date_to=**

#### 8.2.6 Allergen changeover gate

**POST /api/production/changeover-events/:id/cleaning-step**

Marks cleaning step complete. Body: `{step_id, operator_id, timestamp, photo_url?}`

**POST /api/production/changeover-events/:id/atp-result**

Body: `{test_method, locations[], rlu_value, status (PASS|FAIL)}`

**POST /api/production/changeover-events/:id/sign-off**

Body: `{signer_role (shift_lead|quality_lead), user_id, pin_confirmed, timestamp}`

On dual sign-off complete, gate unlocks WO start.

#### 8.2.7 D365 Push DLQ management

**GET /api/admin/integrations/d365/dlq**

**POST /api/admin/integrations/d365/dlq/:id/replay**

**POST /api/admin/integrations/d365/dlq/:id/mark-resolved**

### 8.3 API latency SLOs

| Endpoint | P50 | P95 | P99 |
|---|---|---|---|
| WO start/pause/resume | 100ms | 300ms | 500ms |
| WO complete (gate eval) | 200ms | 500ms | 1s |
| Consume-to-WO | 150ms | 500ms | 1s |
| Output registration | 500ms | 2s | 3s |
| Dashboard refresh | 300ms | 2s | 3s |
| Material status query | 50ms | 100ms | 200ms |
| Changeover step check-off | 100ms | 300ms | 500ms |
| DLQ list | 100ms | 500ms | 1s |

### 8.4 Error handling (per 06-SCN §6 D9 pattern — per-severity)

- **block:** WO not found, LP not found, state machine invalid transition, allergen gate failure, closed_production_strict failure
- **warn:** FEFO deviation (with reason_code), catch weight variance >tolerance, over-consumption within approval window
- **info:** Downtime duration auto-adjusted, shift boundary crossed, D365 push enqueued

---

## 9. Data Model

### 9.1 Entity overview

| Table | Purpose | Retention | Scale estimate (Forza) |
|---|---|---|---|
| `wo_executions` | WO runtime state + events aggregator | 7 years | ~2000/year |
| `wo_material_consumption` | Per-consumption event | 7 years | ~50k/year |
| `wo_outputs` | Outputs (primary+co+by) | 7 years | ~6000/year (3 per WO avg) |
| `wo_waste_log` | Waste events | 3 years | ~4000/year |
| `downtime_events` | Downtime entries | 3 years | ~3000/year |
| `changeover_events` | Changeover records | 7 years | ~500/year |
| `allergen_changeover_validations` | BRCGS audit | 7 years | ~500/year |
| `oee_snapshots` | Per-minute OEE | 90d rolling | ~2M/90d (5 lines × 1440 min/day × 90d) |
| `production_outbox_events` | Outbox pattern | 90d post-delivery | ~15k/year |
| `d365_push_dlq` | Failed pushes | Until resolved | low tail, ops queue |

### 9.2 `wo_executions`

```sql
CREATE TABLE wo_executions (
  wo_id UUID PRIMARY KEY REFERENCES work_orders(id),
  tenant_id UUID NOT NULL,
  started_at TIMESTAMPTZ,
  started_by UUID REFERENCES users(id),
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id),
  cancelled_at TIMESTAMPTZ,
  cancellation_reason_code TEXT,
  current_operator_id UUID,
  total_pause_duration_min INTEGER DEFAULT 0,
  override_closed_production BOOLEAN DEFAULT false,
  override_reason TEXT,
  override_by UUID,
  gate_eval_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wo_executions_tenant ON wo_executions(tenant_id);
CREATE INDEX idx_wo_executions_current_op ON wo_executions(current_operator_id) WHERE completed_at IS NULL;
```

### 9.3 `wo_material_consumption`

```sql
CREATE TABLE wo_material_consumption (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID UNIQUE NOT NULL,
  tenant_id UUID NOT NULL,
  wo_id UUID NOT NULL REFERENCES work_orders(id),
  component_id UUID NOT NULL REFERENCES wo_materials(id),
  lp_id UUID NOT NULL REFERENCES license_plates(id),
  qty_consumed NUMERIC(12,3) NOT NULL CHECK (qty_consumed > 0),
  operator_id UUID NOT NULL REFERENCES users(id),
  fefo_adherence_flag BOOLEAN NOT NULL,
  fefo_deviation_reason TEXT,
  over_consumption_flag BOOLEAN NOT NULL DEFAULT false,
  over_consumption_approved_by UUID,
  over_consumption_approved_at TIMESTAMPTZ,
  over_consumption_reason_code TEXT,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ext_jsonb JSONB,
  CONSTRAINT chk_over_consumption_approval CHECK (
    over_consumption_flag = false OR over_consumption_approved_by IS NOT NULL
  )
);

CREATE INDEX idx_consumption_wo ON wo_material_consumption(wo_id);
CREATE INDEX idx_consumption_lp ON wo_material_consumption(lp_id);
CREATE INDEX idx_consumption_fefo_dev ON wo_material_consumption(tenant_id, consumed_at) WHERE fefo_adherence_flag = false;
CREATE INDEX idx_consumption_operator_time ON wo_material_consumption(operator_id, consumed_at);
```

### 9.4 `wo_outputs`

```sql
CREATE TYPE output_type_enum AS ENUM ('primary', 'co_product', 'by_product');

CREATE TABLE wo_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID UNIQUE NOT NULL,
  tenant_id UUID NOT NULL,
  wo_id UUID NOT NULL REFERENCES work_orders(id),
  output_type output_type_enum NOT NULL,
  item_id UUID NOT NULL REFERENCES items(id),
  lp_id UUID NOT NULL REFERENCES license_plates(id),
  qty_kg NUMERIC(12,3) NOT NULL CHECK (qty_kg > 0),
  catch_weight_details JSONB,
  batch_number TEXT NOT NULL,
  expiry_date DATE NOT NULL,
  qa_status TEXT DEFAULT 'PENDING',
  label_printed_at TIMESTAMPTZ,
  registered_by UUID NOT NULL REFERENCES users(id),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ext_jsonb JSONB
);

CREATE INDEX idx_outputs_wo ON wo_outputs(wo_id);
CREATE INDEX idx_outputs_lp ON wo_outputs(lp_id);
CREATE INDEX idx_outputs_batch ON wo_outputs(batch_number);
CREATE INDEX idx_outputs_qa_status ON wo_outputs(tenant_id, qa_status);
```

### 9.5 `wo_waste_log`

```sql
CREATE TABLE wo_waste_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID UNIQUE NOT NULL,
  tenant_id UUID NOT NULL,
  wo_id UUID NOT NULL REFERENCES work_orders(id),
  category_id UUID NOT NULL REFERENCES waste_categories(id),
  qty_kg NUMERIC(12,3) NOT NULL CHECK (qty_kg > 0),
  operator_id UUID NOT NULL,
  shift_id TEXT NOT NULL,
  reason_notes TEXT,
  approved_by UUID,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_waste_wo ON wo_waste_log(wo_id);
CREATE INDEX idx_waste_category_time ON wo_waste_log(category_id, recorded_at);
CREATE INDEX idx_waste_tenant_time ON wo_waste_log(tenant_id, recorded_at);
```

### 9.6 `downtime_events`

```sql
CREATE TYPE downtime_source_enum AS ENUM ('manual', 'wo_pause', 'plc_auto', 'changeover');

CREATE TABLE downtime_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  line_id TEXT NOT NULL,
  wo_id UUID REFERENCES work_orders(id),
  category_id UUID NOT NULL REFERENCES downtime_categories(id),
  source downtime_source_enum NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_min INTEGER GENERATED ALWAYS AS (
    CASE WHEN ended_at IS NOT NULL THEN EXTRACT(EPOCH FROM ended_at - started_at) / 60 END
  ) STORED,
  shift_id TEXT,
  operator_id UUID,
  reason_notes TEXT,
  plc_fault_code TEXT,
  recorded_by UUID REFERENCES users(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ext_jsonb JSONB
);

CREATE INDEX idx_downtime_line_time ON downtime_events(line_id, started_at);
CREATE INDEX idx_downtime_category ON downtime_events(category_id, started_at);
CREATE INDEX idx_downtime_open ON downtime_events(line_id) WHERE ended_at IS NULL;
```

### 9.7 `changeover_events`

```sql
CREATE TABLE changeover_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  line_id TEXT NOT NULL,
  wo_from_id UUID REFERENCES work_orders(id),
  wo_to_id UUID REFERENCES work_orders(id),
  allergen_from TEXT[],
  allergen_to TEXT[],
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'segregated')),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  planned_duration_min INTEGER,
  actual_duration_min INTEGER,
  cleaning_completed BOOLEAN DEFAULT false,
  cleaning_checklist JSONB,
  atp_required BOOLEAN DEFAULT false,
  atp_result JSONB,
  dual_sign_off_status TEXT DEFAULT 'pending',
  first_signer UUID,
  first_signer_at TIMESTAMPTZ,
  second_signer UUID,
  second_signer_at TIMESTAMPTZ,
  ext_jsonb JSONB
);

CREATE INDEX idx_changeover_line_time ON changeover_events(line_id, started_at);
CREATE INDEX idx_changeover_wo_from ON changeover_events(wo_from_id);
CREATE INDEX idx_changeover_wo_to ON changeover_events(wo_to_id);
```

### 9.8 `allergen_changeover_validations`

```sql
CREATE TABLE allergen_changeover_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  changeover_event_id UUID NOT NULL REFERENCES changeover_events(id),
  validation_result TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  cleaning_evidence JSONB NOT NULL,
  atp_evidence JSONB,
  signatures JSONB NOT NULL,
  override_by UUID,
  override_reason TEXT,
  validated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retention_until DATE NOT NULL
);

CREATE INDEX idx_allergen_val_changeover ON allergen_changeover_validations(changeover_event_id);
CREATE INDEX idx_allergen_val_retention ON allergen_changeover_validations(retention_until);
```

### 9.9 `oee_snapshots`

```sql
CREATE TABLE oee_snapshots (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  line_id TEXT NOT NULL,
  shift_id TEXT NOT NULL,
  snapshot_minute TIMESTAMPTZ NOT NULL,
  availability_pct NUMERIC(5,2),
  performance_pct NUMERIC(5,2),
  quality_pct NUMERIC(5,2),
  oee_pct NUMERIC(5,2) GENERATED ALWAYS AS (availability_pct * performance_pct * quality_pct / 10000) STORED,
  active_wo_id UUID,
  output_qty_delta NUMERIC(12,3),
  downtime_min_delta INTEGER,
  waste_qty_delta NUMERIC(12,3),
  ideal_cycle_time_sec NUMERIC(8,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, line_id, shift_id, snapshot_minute)
);

CREATE INDEX idx_oee_line_time ON oee_snapshots(line_id, snapshot_minute DESC);
```

### 9.10 `production_outbox_events` (INTEGRATIONS stage 2)

```sql
CREATE TYPE outbox_status_enum AS ENUM ('pending', 'dispatching', 'delivered', 'failed', 'in_dlq');

CREATE TABLE production_outbox_events (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID UNIQUE NOT NULL,
  tenant_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  aggregate_id UUID,
  payload JSONB NOT NULL,
  target_system TEXT NOT NULL,
  target_payload JSONB,
  status outbox_status_enum NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  delivered_at TIMESTAMPTZ,
  idempotency_key TEXT,
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_outbox_dispatch ON production_outbox_events(status, next_retry_at) WHERE status IN ('pending', 'failed');
CREATE INDEX idx_outbox_aggregate ON production_outbox_events(aggregate_id);
CREATE INDEX idx_outbox_type_time ON production_outbox_events(event_type, enqueued_at);
```

### 9.11 `d365_push_dlq`

```sql
CREATE TABLE d365_push_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  source_outbox_event_id BIGINT REFERENCES production_outbox_events(id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  last_error TEXT,
  attempt_count INTEGER NOT NULL,
  moved_to_dlq_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolution_notes TEXT
);

CREATE INDEX idx_dlq_open ON d365_push_dlq(tenant_id) WHERE resolved_at IS NULL;
```

### 9.12 `operator_kpis_monthly` (materialized view)

```sql
CREATE MATERIALIZED VIEW operator_kpis_monthly AS
SELECT
  c.operator_id,
  date_trunc('month', c.consumed_at) AS month,
  COUNT(*) AS consumption_count,
  AVG(EXTRACT(EPOCH FROM (c.consumed_at - lag_ts)) ) FILTER (WHERE lag_ts IS NOT NULL) AS avg_consumption_gap_sec,
  SUM(CASE WHEN c.fefo_adherence_flag THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100 AS fefo_compliance_pct,
  SUM(CASE WHEN c.over_consumption_flag THEN 1 ELSE 0 END) AS over_consumption_incidents,
  COALESCE(SUM(w.qty_kg), 0) AS waste_attributed_kg
FROM wo_material_consumption c
LEFT JOIN LATERAL (
  SELECT consumed_at AS lag_ts FROM wo_material_consumption c2
  WHERE c2.operator_id = c.operator_id AND c2.consumed_at < c.consumed_at
  ORDER BY c2.consumed_at DESC LIMIT 1
) prev ON true
LEFT JOIN wo_waste_log w ON w.operator_id = c.operator_id
  AND date_trunc('month', w.recorded_at) = date_trunc('month', c.consumed_at)
GROUP BY c.operator_id, date_trunc('month', c.consumed_at);

CREATE UNIQUE INDEX idx_operator_kpis_unique ON operator_kpis_monthly(operator_id, month);
```

---

## 10. Business Rules (DSL)

### 10.1 `wo_state_machine_v1` [UNIVERSAL]

**Type:** workflow / state machine
**Consumer:** All WO transition endpoints (E1)

**Pseudo-DSL:**
```yaml
rule_id: wo_state_machine_v1
type: state_machine
entity: work_orders
states: [DRAFT, READY, IN_PROGRESS, PAUSED, COMPLETED, CANCELLED]
initial: DRAFT
transitions:
  - from: DRAFT
    to: READY
    trigger: wo.scheduled
    guards: [materials_reserved, assigned_line_not_null]
  - from: READY
    to: IN_PROGRESS
    trigger: action.start
    guards: [operator_authenticated, line_available, allergen_changeover_gate_v1_passes_or_not_required]
    side_effects: [emit_event(wo.started), set_started_at, open_changeover_event_if_applicable]
  - from: IN_PROGRESS
    to: PAUSED
    trigger: action.pause
    side_effects: [open_downtime_event(source='wo_pause', category_required=true)]
  - from: PAUSED
    to: IN_PROGRESS
    trigger: action.resume
    side_effects: [close_downtime_event]
  - from: IN_PROGRESS
    to: COMPLETED
    trigger: action.complete
    guards: [closed_production_strict_v1]
    side_effects: [set_completed_at, emit_event(wo.completed), enqueue_outbox(d365_push, output_yield_gate_eval)]
  - from: [DRAFT, READY, IN_PROGRESS, PAUSED]
    to: CANCELLED
    trigger: action.cancel
    guards: [cancel_reason_provided]
    side_effects: [release_reservations, emit_event(wo.cancelled)]
```

### 10.2 `allergen_changeover_gate_v1` [UNIVERSAL]

**Type:** gate
**Consumer:** WO START transition (E7)

**Pseudo-DSL:**
```yaml
rule_id: allergen_changeover_gate_v1
type: gate
triggers:
  - event: wo.transition.ready_to_in_progress
evaluation:
  - step: find_previous_wo_on_line
    output: prev_wo
  - step: compute_allergen_delta
    input: {prev_wo.allergens, current_wo.allergens}
    output: allergen_delta
  - step: lookup_changeover_matrix
    input: {allergen_delta, line_id}
    output: matrix_entry
  - step: apply_matrix_requirements
    rules:
      - if: matrix_entry.cleaning_required == true
        require: changeover_event.cleaning_completed == true
      - if: matrix_entry.atp_required == true
        require: changeover_event.atp_result.status == 'PASS'
      - if: matrix_entry.risk_level in ('medium', 'high')
        require: changeover_event.dual_sign_off_status == 'dual_signed'
      - if: matrix_entry.segregation_required == true
        action: block
        alert: audit_flag(scheduler_should_have_prevented)
  - step: emit_validation_event
    output: allergen_changeover_validations row
outcome:
  - pass: allow WO START
  - fail: return 423 Locked with changeover_event_id, redirect to /production/changeover/:id
```

### 10.3 `closed_production_strict_v1` [UNIVERSAL]

**Type:** gate
**Consumer:** WO COMPLETE transition (E1)
**Source:** Phase D lock-in #17

**Pseudo-DSL:**
```yaml
rule_id: closed_production_strict_v1
type: gate
triggers:
  - event: wo.transition.in_progress_to_completed
evaluation:
  - step: check_all_components_consumed
    for_each: wo_materials (BOM snapshot)
    condition: SUM(wo_material_consumption.qty_consumed WHERE component_id = bom.component_id) >= bom.planned_qty * (1 - tolerance)
    tolerance: 0.02
    output: components_passed: bool, shortfalls: [...]
  - step: check_all_outputs_registered
    for_each: bom.co_products + primary
    condition: exists(wo_outputs WHERE output_type matches bom.entry AND qty_kg > 0)
    output: outputs_passed: bool, missing: [...]
  - step: decide
    rules:
      - if: components_passed == true AND outputs_passed == true
        then: pass
      - if: override_reason provided AND override_by.role == 'production_manager'
        then: pass_with_override
      - else: fail
```

### 10.4 `output_yield_gate_v1` [UNIVERSAL]

**Type:** gate (soft)
**Consumer:** Output registration complete

**Pseudo-DSL:**
```yaml
rule_id: output_yield_gate_v1
type: gate_soft
triggers:
  - event: wo.outputs_registered_complete
evaluation:
  - step: compute_actual_yield
    formula: sum(wo_outputs.qty_kg) / sum(wo_material_consumption.qty_consumed)
    output: actual_yield_pct
  - step: compute_variance
    formula: actual_yield_pct / bom.yield_pct
    output: variance_ratio
  - step: decide
    rules:
      - if: abs(1 - variance_ratio) <= 0.10
        then: pass
      - if: abs(1 - variance_ratio) > 0.10
        then: flag_for_review(role=production_manager)
        alert: true
```

### 10.5 Rule versioning

All rules follow semver per 02-SETTINGS §7 convention. Active version per tenant via feature flag:
- `production.state_machine.version` (default: v1)
- `production.allergen_gate.version` (default: v1)
- `production.closed_production_strict.enabled` (default: true)
- `production.output_yield_gate.variance_threshold` (default: 0.10)

---

## 11. KPIs

### 11.1 Primary KPIs (per 08-PROD scope)

| KPI | Formula | Target | Source table | Frequency |
|---|---|---|---|---|
| WO yield compliance rate | `count(wo WHERE output_qty >= planned_qty * 0.95) / count(wo)` | ≥95% | wo_executions + wo_outputs | Daily |
| On-time completion | `count(wo WHERE completed_at <= planned_end_time + 2h) / count(wo)` | ≥85% | wo_executions | Daily |
| Waste % | `sum(wo_waste_log.qty_kg) / sum(wo_material_consumption.qty_consumed)` | <3% | both | Weekly |
| FEFO compliance % | `count(consumption WHERE fefo_adherence_flag) / count(consumption)` | ≥98% | wo_material_consumption | Daily |
| Allergen gate enforcement | `count(changeover WHERE risk>=medium AND allergen_val.result='passed') / count(risk>=medium)` | 100% | allergen_changeover_validations | Per WO |
| D365 push success rate | `count(outbox WHERE delivered_at <= enqueued_at + 5min) / count(total)` | ≥99.9% | production_outbox_events | Real-time |
| D365 push latency P95 | `p95(delivered_at - enqueued_at)` | <5min | production_outbox_events | Per event |
| Genealogy query time | `p95(recursive_cte_duration_ms)` | <2000ms | pg_stat_statements | Per query |

### 11.2 OEE components (per-minute aggregation → 15-OEE)

| Component | Formula | Published in |
|---|---|---|
| Availability | `(planned_min - downtime_min) / planned_min` | oee_snapshots.availability_pct |
| Performance | `(output_qty × ideal_cycle_time) / run_time_min` | oee_snapshots.performance_pct |
| Quality | `good_qty / total_output_qty` | oee_snapshots.quality_pct |
| OEE | A × P × Q | oee_snapshots.oee_pct (generated column) |

### 11.3 Operator KPIs (per operator)

| KPI | Target | Source |
|---|---|---|
| Consumption speed (seconds per LP scan) | ≤8s median | operator_kpis_monthly.avg_consumption_gap_sec |
| FEFO compliance | ≥98% | operator_kpis_monthly.fefo_compliance_pct |
| Over-consumption incidents / month | ≤2 | operator_kpis_monthly.over_consumption_incidents |
| Waste attributed (kg/shift) | benchmark vs peer median | operator_kpis_monthly.waste_attributed_kg |

### 11.4 Alerts

| Condition | Severity | Notification |
|---|---|---|
| WO yield <90% (individual WO) | medium | Shift Lead |
| WO over 2h beyond planned_end_time without completion | medium | Shift Lead + Prod Manager |
| Waste >5% per WO (exceeds threshold) | medium | Shift Lead approval required |
| FEFO compliance <95% (line, rolling 24h) | medium | Planner (matrix review trigger) |
| Allergen gate override used | high | Prod Manager + QA + audit log |
| D365 push DLQ depth > 10 | high | Ops team |
| D365 push latency P95 > 10min | high | Ops team |
| Downtime event without category_id | low | Operator (UI prompt) |
| Closed_Production strict override | high | Prod Manager sign-off required + audit |

### 11.5 Dashboard locations

- **08-PROD production dashboard** (SCR-08-01) — primary per-line real-time
- **15-OEE** — OEE analytics + trends
- **12-REPORTING** — historical KPI trends, operator leaderboards (P2)
- **02-SETTINGS audit** — override frequency, allergen gate bypass rate

---

## 12. INTEGRATIONS Stage 2 Inline (D365 WO Confirmations Push)

### 12.1 Scope

**In scope:**
- Outbox pattern implementation (`production_outbox_events` table)
- Dispatcher service (async, separate from main Next.js app)
- D365 WO confirmation push: on WO COMPLETED → produces JournalLines in D365 F&O
- DLQ + retry policy
- UUID v7 idempotency (R14)
- Anti-corruption layer (R15): internal canonical model ↔ D365 payload
- Admin DLQ review + replay UI (SCR-08-06)

**Out of scope (covered elsewhere):**
- D365 item/BOM pull (stage 1, in 03-TECH §13)
- D365 constants admin (in 02-SETTINGS §11)
- EPCIS consumer (stage 4, P2, in 05-WH §13.7)
- Shipping confirmations push (stage 3, in 11-SHIPPING)

### 12.2 Architecture

```
┌─────────────────┐      ┌──────────────────────┐      ┌──────────────────┐
│  08-PROD Core   │      │  Outbox Dispatcher   │      │   D365 F&O API   │
│  (Next.js app)  │      │  (Node worker)       │      │                  │
└────────┬────────┘      └──────────┬───────────┘      └─────────┬────────┘
         │                           │                            │
         │ 1. WO COMPLETE transaction│                            │
         │    (atomic:                │                            │
         │    - wo_executions update │                            │
         │    - outbox_event insert) │                            │
         │                           │                            │
         │◄────────── commit ────────┤                            │
         │                           │                            │
         │                2. Poll every 30s                       │
         │                           │                            │
         │                           ├─── 3. Fetch pending ──────┐│
         │                           │                           ││
         │                           │◄─────── rows ─────────────┘│
         │                           │                            │
         │                           ├── 4. Map internal→D365 ──┐ │
         │                           │   (anti-corruption layer) │ │
         │                           │◄─────── mapped ───────────┘ │
         │                           │                             │
         │                           ├── 5. POST JournalLines ────►│
         │                           │   w/ Idempotency-Key        │
         │                           │◄──────── 200 OK ────────────┤
         │                           │                             │
         │                           ├── 6. Mark delivered ───────┐│
         │                           │                            ││
         │                           │    OR on error:             │
         │                           ├── 6b. Increment attempt,   ─┤
         │                           │   schedule retry            │
         │                           │   After 5 failed → DLQ     │
```

### 12.3 Outbox pattern (detailed)

**Transactional guarantee:** WO COMPLETE DB transaction includes atomic INSERT into `production_outbox_events`. If transaction fails, outbox insert rolls back — no inconsistent state.

**Dispatcher loop (pseudo-code):**
```
while True:
    events = db.execute("""
        SELECT id, event_type, payload, target_system, attempt_count, idempotency_key
        FROM production_outbox_events
        WHERE status IN ('pending', 'failed')
          AND (next_retry_at IS NULL OR next_retry_at <= now())
          AND attempt_count < 5
        ORDER BY enqueued_at
        LIMIT 100
        FOR UPDATE SKIP LOCKED
    """)
    for event in events:
        db.execute("UPDATE ... SET status='dispatching' WHERE id=%s", event.id)
        try:
            mapped = map_to_target_system(event.target_system, event.payload)
            response = call_target_api(event.target_system, mapped, idempotency_key=event.idempotency_key)
            if response.ok:
                db.execute("UPDATE ... SET status='delivered', delivered_at=now() WHERE id=%s", event.id)
            else:
                handle_failure(event, response.error)
        except Exception as e:
            handle_failure(event, str(e))
    sleep(30)

def handle_failure(event, error):
    event.attempt_count += 1
    if event.attempt_count >= 5:
        move_to_dlq(event, error)
    else:
        event.next_retry_at = now() + retry_delay(event.attempt_count)
        event.last_error = error
        db.save(event)

def retry_delay(attempt):
    # 5min, 30min, 2h, 12h, 24h
    return [5*60, 30*60, 2*3600, 12*3600, 24*3600][attempt - 1]
```

### 12.4 R14 Idempotency

**Client-side:**
- Every WO state transition generates UUID v7 `transaction_id` (client-side, e.g., from scanner or desktop UI)
- If same `transaction_id` replayed within 1h: return cached response, no mutation

**Server-side (outbox → D365):**
- `production_outbox_events.idempotency_key` = composed from `wo_id + event_type + version_counter`
- Dispatcher sends `Idempotency-Key: <value>` header to D365 API
- If D365 receives same key twice: returns cached success response (D365 F&O supports this per Dynamics best practices)
- Guarantees: at-least-once delivery + at-most-once effect

### 12.5 R15 Anti-corruption layer

**Internal canonical model:**
```json
{
  "event_type": "production.wo.completed",
  "wo_id": "...",
  "tenant_id": "...",
  "completed_at": "2026-04-20T14:35:00Z",
  "outputs": [
    {
      "output_type": "primary",
      "item_id": "...",
      "item_code": "FA5101",
      "qty_kg": 1050.0,
      "catch_weight_details": {"_": "_"},
      "batch_number": "WO-2026-0001-OUT-001",
      "warehouse_id": "...",
      "warehouse_code": "ForzDG"
    }
  ],
  "consumed_materials": [],
  "waste_summary": [{"category": "trim", "qty_kg": 15.0}]
}
```

**Mapped to D365 JournalLines:**
```json
{
  "journalName": "PROD-2026-04-20",
  "dataAreaId": "FNOR",
  "lines": [
    {
      "ItemId": "FA5101",
      "Qty": 1050.0,
      "InventDimId": {
        "InventBatchId": "WO-2026-0001-OUT-001",
        "InventLocationId": "ForzDG",
        "InventSiteId": "FNOR"
      },
      "CostAmount": null,
      "MonopilotTransactionId": "0194b1ce-...",
      "MonopilotWOId": "..."
    }
  ]
}
```

**Mapping adapter:** `lib/d365/adapter/production-confirmations.ts` — isolated module, unit-tested, owned by INTEGRATIONS team. Single responsibility: internal → D365 shape.

### 12.6 DLQ management

**Conditions for DLQ:**
- 5 failed attempts (retry schedule: 5min, 30min, 2h, 12h, 24h)
- OR explicit 4xx error from D365 indicating permanent failure (e.g., 400 invalid item mapping)
- OR tenant's D365 integration explicitly disabled during dispatch

**DLQ review UI (SCR-08-06):**
- List DLQ events with error preview
- Actions:
  - **Replay**: force new attempt, increment counter, returns to outbox 'failed' status
  - **Mark resolved**: manual push done outside system, mark resolved_at + notes
  - **View raw**: internal canonical payload
  - **View mapped**: D365 payload (for debugging mapping issues)

**Alerting:**
- DLQ depth > 10 → Ops pager
- Age of oldest unresolved DLQ item > 48h → weekly report escalation

### 12.7 Monitoring

Grafana dashboard:
- Outbox queue depth (pending, dispatching, failed)
- Dispatch latency histogram (enqueued → delivered)
- D365 API latency (P50/P95/P99)
- DLQ depth + age of oldest
- Error rate by error type (network, 4xx, 5xx, mapping error)

Alerts:
- Outbox pending count > 1000 — system backpressure
- Dispatch latency P95 > 10min
- D365 API error rate > 1% in 5min window
- DLQ depth > 10

### 12.8 Feature flags

- `integration.d365.push.enabled` (per tenant, default true for Forza)
- `integration.d365.push.dry_run` (logs but doesn't call D365, for debug)
- `integration.d365.push.batch_size` (dispatcher batch size, default 100)

### 12.9 Data contracts

Tenants onboarding D365 push must have:
- D365 F&O instance URL + client credentials (stored encrypted, 02-SETTINGS §11 or secret manager)
- Item code mapping populated (`integration.d365.item_code_map` L4 private)
- Warehouse code mapping (`integration.d365.warehouse_code_map`)
- User credential for JournalLines API (service account)

### 12.10 Rollback strategy

If D365 push causes downstream issue (e.g., duplicate JournalLines created due to mapping bug):
1. Disable feature flag `integration.d365.push.enabled` per tenant
2. Existing outbox events remain (not deleted), dispatcher skips
3. Fix mapping bug, re-enable flag
4. Backfill: replay events from DLQ or from `production_outbox_events` filtered by date range

---

## 13. Risks & Mitigations

| # | Risk | Severity | Prob | Mitigation |
|---|---|---|---|---|
| R1 | Genealogy break (consumed LP not linked to output LP) | critical | low | DB trigger enforces lp_genealogy on output INSERT; integration test suite |
| R2 | Concurrent WO completion conflicts (two operators complete same WO) | medium | low | Optimistic locking on wo_executions.updated_at; 409 Conflict response |
| R3 | Allergen gate bypassed (rule engine bug, operator trick) | critical | low | Hard DB CHECK constraint: wo cannot transition IN_PROGRESS if allergen_changeover_validations missing for risk>=medium; audit log; quarterly audit review |
| R4 | D365 push duplicates (idempotency broken) | high | low | Client UUID v7 + server-side Idempotency-Key header; D365 unique constraint on MonopilotTransactionId; DLQ catch duplicates |
| R5 | D365 API downtime extended (>24h) | medium | low | Outbox queue persists events; dispatcher resumes on recovery; alerts on age |
| R6 | Outbox queue backlog (dispatcher can't keep up) | medium | medium | Horizontal scaling (multiple dispatchers with FOR UPDATE SKIP LOCKED); batch size tuning |
| R7 | Catch weight entry errors (operator typo) | low | medium | UI: 2-step confirmation, highlight if variance >10%; Shift Lead review quarterly |
| R8 | Output yield anomaly not caught | medium | medium | Gate rule soft-flag + alert; Prod Manager review >10% variance |
| R9 | Closed_Production strict blocks legitimate partial WOs | medium | medium | Override path with Prod Manager sign-off + audit; override rate monitoring |
| R10 | FEFO compliance metric gamed (operator picks wrong LP on purpose to avoid FEFO) | low | low | Random audit; KPI per operator published (peer pressure); FEFO deviation reason_code must be one of predefined list |
| R11 | Waste under-reporting (operator doesn't log) | high | medium | Yield gate flags if output+waste ≠ input within tolerance; shift_lead review daily; training |
| R12 | Changeover checklist forged (operator checks without doing) | high | low | Photo capture P2; random audits; dual sign-off separates operator from signer |
| R13 | OEE per-minute job falls behind | low | low | Job timeout monitoring; backfill job for gaps; fallback to hourly calculation |
| R14 | PLC integration P2 introduces regression to manual flow | medium | medium | Feature flag per line; soft rollout; keep manual path as fallback |
| R15 | Multi-tenant data leak via outbox | critical | very low | tenant_id in outbox row + RLS; dispatcher runs per-tenant context; penetration test |
| R16 | Over-consumption approval fatigue (Shift Lead approves everything) | low | high | Approval rate KPI; management review; BOM tolerance review (maybe too tight) |
| R17 | Downtime category taxonomy drift per tenant (L2) | low | medium | Analytics normalization layer in 12-REPORTING maps custom categories to lean 6 big losses |
| R18 | D365 mapping adapter bugs after D365 version upgrade | high | medium | Adapter unit tests; integration tests with D365 sandbox; canary rollout per tenant |

---

## 14. Success Criteria

### 14.1 P1 MVP done checklist

**Core execution (E1-E4):**
- [ ] `wo_executions`, `wo_material_consumption`, `wo_outputs`, `wo_waste_log`, `downtime_events`, `changeover_events`, `allergen_changeover_validations`, `oee_snapshots`, `production_outbox_events`, `d365_push_dlq` tables deployed with RLS
- [ ] `wo_state_machine_v1`, `closed_production_strict_v1`, `output_yield_gate_v1`, `allergen_changeover_gate_v1` DSL rules registered
- [ ] All API endpoints in §8.2 implemented, R14 idempotency verified
- [ ] 06-SCN §14.1 consumer integration verified end-to-end (consume-to-WO, output, waste)
- [ ] Operator dashboard (SCR-08-01) renders <2s with 5 active WOs
- [ ] WO detail view (SCR-08-02) complete with all 5 tabs

**Allergen gate (E7):**
- [ ] SCR-08-03 changeover UI functional
- [ ] Cleaning checklist configurable, signature PIN flow verified
- [ ] ATP result entry + threshold enforcement
- [ ] Dual sign-off (shift_lead + quality_lead) complete
- [ ] BRCGS audit trail in `allergen_changeover_validations` (7y retention policy active)
- [ ] 100% enforcement verified in integration tests (risk≥medium cannot bypass)

**INTEGRATIONS stage 2 (E5):**
- [ ] Outbox dispatcher service deployed (Node worker, containerized)
- [ ] D365 JournalLines push tested in sandbox (Forza D365 UAT environment)
- [ ] Anti-corruption mapping adapter unit-tested (≥95% coverage)
- [ ] Idempotency verified (replay same transaction_id → same result)
- [ ] DLQ + retry policy verified (simulated failures at each attempt stage)
- [ ] SCR-08-06 DLQ review UI functional
- [ ] D365 push success rate ≥99.9% over 14d soak test

**Dashboard + KPIs (E6):**
- [ ] Per-minute OEE aggregation job running every 60s reliably
- [ ] `oee_snapshots` populated for all 5 lines × 2 shifts
- [ ] `operator_kpis_monthly` materialized view refreshed nightly
- [ ] Dashboard KPI widgets render (yield, completion, waste, downtime)

**Data quality:**
- [ ] Genealogy verified: 100% of output LPs have consumed LP references
- [ ] Genealogy query <2s P95 on 10-level tree
- [ ] Override rates reported weekly (closed_production_strict, over-consumption, allergen gate)

**Testing:**
- [ ] Unit test coverage ≥85% for core modules
- [ ] Integration tests: full WO lifecycle (scheduled → started → consumed → output → completed → D365 pushed)
- [ ] Load test: 5 WOs concurrent starts on 5 lines, 10s scan cadence, 30min sustained
- [ ] UAT with Forza operators: 2 weeks pre-go-live parallel run

### 14.2 P2 MVP done checklist

- [ ] PLC integration (08-h): OPC UA client deployed, auto-downtime working, feature flag per line
- [ ] Catch weight scale integration (08-i): BT scale paired, variance hard-enforcement option
- [ ] ZPL native printing (08-j): Forza printer fleet paired, label format identical to P1 PDF
- [ ] OEE streaming (08-k): Redis streams consumer, EWMA anomaly alerts functional
- [ ] Operator leaderboards (08-l): 12-REPORTING dashboard live

### 14.3 Quality gates (pre-go-live P1)

- Code review by 04-PLANNING owner + 05-WAREHOUSE owner + 02-SETTINGS rule registry owner + INTEGRATIONS owner
- Security review: RLS verified, D365 credentials encrypted at rest, allergen gate un-bypassable
- Performance load test passed (§5.4 constraints)
- Forza UAT sign-off by Prod Manager + Monika (Planner) + Jane (NPD) + QA lead
- Regulatory review: BRCGS Issue 10 digital signature compliance confirmed by Forza Quality

---

## 15. Build Sequence

Build order per 08-PROD sub-module breakdown. Dependency: 04-PLAN baseline + 05-WH baseline + 06-SCN baseline + 02-SETTINGS + 03-TECH already complete per Phase B/C1.

### 15.1 08-a Execution Core (4-5 sesji)

**Stories:**
- SC-08-a-01: `wo_executions` table + RLS + migration
- SC-08-a-02: `wo_state_machine_v1` DSL rule registration in 02-SETTINGS §7
- SC-08-a-03: POST /api/production/work-orders/:id/start endpoint (w/o allergen gate, added in 08-g)
- SC-08-a-04: POST /api/production/work-orders/:id/pause + resume endpoints
- SC-08-a-05: POST /api/production/work-orders/:id/complete + closed_production_strict_v1 gate
- SC-08-a-06: POST /api/production/work-orders/:id/cancel
- SC-08-a-07: GET /api/production/work-orders/:id (full runtime state)
- SC-08-a-08: R14 idempotency on all transitions
- SC-08-a-09: Desktop operator dashboard SCR-08-01 (per-line live view)
- SC-08-a-10: WO detail view SCR-08-02 (5 tabs)
- SC-08-a-11: Integration: scanner SCN-081 calls /start, /complete endpoints
- SC-08-a-12: E2E test: WO lifecycle happy path (START → COMPLETE)

### 15.2 08-b Consumption (3-4 sesji)

**Stories:**
- SC-08-b-01: `wo_material_consumption` table
- SC-08-b-02: POST /api/production/scanner/consume-to-wo endpoint
- SC-08-b-03: 05-WH LP deduction integration (calls /warehouse/lp-update)
- SC-08-b-04: Genealogy link write (lp_genealogy INSERT)
- SC-08-b-05: FEFO compliance check + flag
- SC-08-b-06: Over-consumption detection + 409 response
- SC-08-b-07: Over-consumption approval endpoint + modal UI
- SC-08-b-08: GET /api/production/work-orders/:id/material-status (for SCN-080 context)
- SC-08-b-09: Outbox event emit `production.material.consumed`
- SC-08-b-10: E2E test: consumption happy + FEFO deviation + over-consumption

### 15.3 08-c Output + Waste (3-4 sesji)

**Stories:**
- SC-08-c-01: `wo_outputs`, `wo_waste_log` tables
- SC-08-c-02: POST /outputs endpoint (primary)
- SC-08-c-03: POST /by-products endpoint (co+by)
- SC-08-c-04: POST /waste-record endpoint
- SC-08-c-05: 05-WH LP creation integration
- SC-08-c-06: Batch number auto-generation (pattern: WO_CODE-OUT-NNN)
- SC-08-c-07: Expiry date calculation (today + shelf_life_days)
- SC-08-c-08: Catch weight entry UI + variance soft-check
- SC-08-c-09: output_yield_gate_v1 DSL rule + registration
- SC-08-c-10: Label print (browser PDF fallback P1)
- SC-08-c-11: Outbox event emits (output.registered, byproduct.registered, waste.logged)
- SC-08-c-12: E2E test: primary + co + by registration + waste log

### 15.4 08-d Downtime + Shifts (3-4 sesji)

**Stories:**
- SC-08-d-01: `downtime_events`, `downtime_categories` seed (10 Forza categories)
- SC-08-d-02: Auto-create downtime on WO PAUSE (E1 FR-002 side effect)
- SC-08-d-03: Manual downtime entry UI (Shift Lead)
- SC-08-d-04: Category selection from 02-SETTINGS taxonomy (admin-configurable)
- SC-08-d-05: Shift attribution logic + stamp on all mutations
- SC-08-d-06: SCR-08-05 downtime analytics (Pareto, MTTR, timeline Gantt)
- SC-08-d-07: Feed to OEE Availability (consumed in 08-f)
- SC-08-d-08: E2E test: downtime lifecycle + analytics accuracy

### 15.5 08-e INTEGRATIONS stage 2 (3-4 sesji)

**Stories:**
- SC-08-e-01: `production_outbox_events`, `d365_push_dlq` tables
- SC-08-e-02: Outbox write on WO COMPLETE (atomic tx with state transition)
- SC-08-e-03: Dispatcher service scaffold (Node worker, Dockerfile)
- SC-08-e-04: Anti-corruption adapter `d365/production-confirmations.ts`
- SC-08-e-05: D365 F&O API integration (JournalLines POST with Idempotency-Key)
- SC-08-e-06: DLQ retry schedule implementation (5min, 30min, 2h, 12h, 24h)
- SC-08-e-07: Move to DLQ on 5 failures or 4xx
- SC-08-e-08: SCR-08-06 DLQ review UI (list, replay, mark resolved)
- SC-08-e-09: Grafana dashboard + alerts (§12.7)
- SC-08-e-10: Feature flags: d365.push.enabled, dry_run
- SC-08-e-11: Unit tests adapter ≥95% coverage
- SC-08-e-12: Integration test with D365 sandbox
- SC-08-e-13: 14d soak test ≥99.9% success

### 15.6 08-f Dashboard + KPIs + OEE aggregation (2-3 sesji)

**Stories:**
- SC-08-f-01: `oee_snapshots` table
- SC-08-f-02: Per-minute aggregation job (cron 60s)
- SC-08-f-03: Availability/Performance/Quality formulas implementation
- SC-08-f-04: `operator_kpis_monthly` materialized view + refresh job
- SC-08-f-05: KPI widgets on production dashboard (yield, completion, waste, downtime)
- SC-08-f-06: SCR-08-04 waste analytics screen
- SC-08-f-07: Data contract with 15-OEE (`oee_snapshots` read access)
- SC-08-f-08: Backfill job for per-minute snapshots on outage

### 15.7 08-g Allergen Changeover Gate (2-3 sesji)

**Stories:**
- SC-08-g-01: `allergen_changeover_validations` table
- SC-08-g-02: Extend `changeover_events` with cleaning_checklist, atp_result, dual_sign_off_status
- SC-08-g-03: `allergen_changeover_gate_v1` DSL rule registration
- SC-08-g-04: Integration with E1 /start: block + redirect on gate fail
- SC-08-g-05: SCR-08-03 changeover UI (cleaning checklist + ATP + dual sign-off)
- SC-08-g-06: Cleaning steps config (from matrix.notes or 02-SETTINGS §7)
- SC-08-g-07: PIN-based digital signature (reuse 02-SETTINGS §14 PIN infra)
- SC-08-g-08: BRCGS retention (7y) policy on allergen_changeover_validations
- SC-08-g-09: Audit log override events
- SC-08-g-10: E2E test: gate enforcement + override path + BRCGS audit completeness

### 15.8 Phase 2 sub-modules (08-h...l, estimate)

| Sub-module | Est. sesji | Dependencies |
|---|---|---|
| 08-h PLC Integration | 4-6 | OPC UA infra, per-line rollout |
| 08-i Catch Weight Scale | 2-3 | Scale hardware config |
| 08-j ZPL Printing | 2-3 | Scanner printer pairing |
| 08-k OEE Streaming | 3-4 | Redis streams infra, 15-OEE consumer |
| 08-l Operator Leaderboards | 2-3 | 12-REPORTING build |

### 15.9 Build estimate summary

| Sub-module | P1/P2 | Stories | Est. sesji |
|---|---|---|---|
| 08-a Execution Core | P1 | 12 | 4-5 |
| 08-b Consumption | P1 | 10 | 3-4 |
| 08-c Output + Waste | P1 | 12 | 3-4 |
| 08-d Downtime + Shifts | P1 | 8 | 3-4 |
| 08-e INTEGRATIONS stage 2 | P1 | 13 | 3-4 |
| 08-f Dashboard + KPIs + OEE | P1 | 8 | 2-3 |
| 08-g Allergen Gate | P1 | 10 | 2-3 |
| **Total P1** | — | **73** | **20-25** |
| 08-h PLC (P2) | P2 | ~10 | 4-6 |
| 08-i Catch Weight P2 | P2 | ~6 | 2-3 |
| 08-j ZPL P2 | P2 | ~6 | 2-3 |
| 08-k OEE Streaming P2 | P2 | ~8 | 3-4 |
| 08-l Leaderboards P2 | P2 | ~6 | 2-3 |
| **Total P2** | — | **~36** | **13-19** |

---

## 16. Dependencies, References, Changelog + Open Items

### 16.1 Upstream dependencies (inputs to 08-PROD)

| Source | Data / API | Consumed in 08-PROD |
|---|---|---|
| 04-PLAN §7 | work_orders (definition, BOM snapshot, dependencies) | E1 state machine, E3 output validation |
| 04-PLAN §8.4 | wo_dependencies (cascade DAG) | E1 intermediate WO flow |
| 07-EXT §9 | scheduler_assignments (planned_start_time, line_id, shift_id) | E1 WO start validation |
| 05-WH §10 | Intermediate LP scan-to-consume semantics | E2 consumption flow |
| 05-WH §13.1-13.5 | Scanner APIs (inventory query, barcode lookup, LP lock, FEFO suggest) | E2 consumption, E3 output registration |
| 06-SCN §14.1-14.2 | Scanner endpoint contracts | E2, E3, E7 |
| 03-TECH §5 | items (types, weight_mode, shelf_life, allergen_profiles) | E3 output, E7 allergen gate |
| 03-TECH §7 | BOM + yield_pct + scrap_pct + co_products.allocation_pct | E3 output allocation, E1 gate eval |
| 03-TECH §8 | Routings + operations expected_duration | E1 progress calc, OEE |
| 03-TECH §10 | Allergen cascade data | E7 gate trigger |
| 02-SETTINGS §7 | Rule registry (DSL rules for state machine + gates) | All gates |
| 02-SETTINGS §8 | Reference tables (downtime_categories, waste_categories, production_lines, shift_patterns) | E4, E3 |
| 02-SETTINGS §11 | D365 constants (FNOR, FOR100048, ForzDG, FinGoods, FProd01) + item/warehouse code_map | E5 INTEGRATIONS stage 2 |
| 02-SETTINGS §14 | Feature flags, i18n, PIN config | All modules |

### 16.2 Downstream consumers (08-PROD outputs)

| Consumer | Data | Consumption pattern |
|---|---|---|
| 09-QUALITY | ATP results, CCP triggers, `wo_outputs.qa_status` writes | Event consumer, direct table read |
| 10-FINANCE | wo_outputs + wo_material_consumption + wo_waste_log | Costing calc, WIP valuation |
| 12-REPORTING | All KPIs + operator_kpis_monthly | Materialized view + dashboards |
| 15-OEE | `oee_snapshots` per-minute | Primary data source |
| D365 (via stage 2 push) | WO confirmations | Outbox → adapter → JournalLines |
| 11-SHIPPING | Output LPs available for picking | 05-WH inventory view |
| 13-MAINTENANCE | Downtime events, machine fault codes | Event consumer P2 |
| 14-MULTI-SITE | All 08-PROD tables, multi-site aggregate | Cross-tenant read P2 |

### 16.3 External system integration

**D365 F&O (LEGACY-D365):**
- Stage 1: item/BOM/supplier pull (in 03-TECH §13, already delivered)
- **Stage 2: WO confirmations push (this PRD §12)**
- Stage 3: Shipping confirmations (in 11-SHIPPING)
- Stage 4: EPCIS consumer (P2, in 05-WH §13.7)
- Stage 5: Financial sync (P2, in 10-FINANCE)

No other external systems in P1. P2 adds: OPC UA (PLC), BT scale/printer (scanner-side).

### 16.4 Validation rules index (V-PROD-*)

Consistency rules:
- V-PROD-01: wo_executions.started_at <= wo_executions.completed_at (if both set)
- V-PROD-02: wo_material_consumption.lp_id must have status in (AVAILABLE, LOCKED) at time of consumption
- V-PROD-03: wo_outputs.qty_kg > 0
- V-PROD-04: wo_outputs.expiry_date = wo_outputs.registered_at::date + item.shelf_life_days
- V-PROD-05: wo_waste_log.category_id must reference active waste_categories row
- V-PROD-06: downtime_events.duration_min auto-calculated, not manually set
- V-PROD-07: changeover_events.dual_sign_off_status = 'dual_signed' required before WO.status → IN_PROGRESS (enforced by gate rule)
- V-PROD-08: allergen_changeover_validations.signatures array length >= 2 for risk >= medium
- V-PROD-09: allergen_changeover_validations.retention_until = validated_at + 7y (BRCGS)
- V-PROD-10: oee_snapshots uniqueness per (tenant_id, line_id, shift_id, snapshot_minute)
- V-PROD-11: production_outbox_events.event_id unique (R14 idempotency)
- V-PROD-12: production_outbox_events.attempt_count <= 5 before DLQ move
- V-PROD-13: d365_push_dlq.resolved_at NULL = open, else closed
- V-PROD-14: wo transitions follow state machine DSL rule (enforced by rule engine)
- V-PROD-15: closed_production_strict gate blocks COMPLETE if shortfalls exist (unless override)
- V-PROD-16: over_consumption flag requires over_consumption_approved_by NOT NULL
- V-PROD-17: catch_weight_details array length matches wo_outputs.qty_kg / item.avg_unit_kg ±10% if item.weight_mode='catch'
- V-PROD-18: lp_genealogy complete: every output LP has corresponding consumed LPs
- V-PROD-19: shift_id present on all time-stamped mutations (consumption, output, waste, downtime)
- V-PROD-20: outbox_events.tenant_id == source entity tenant_id (cross-tenant prevention)
- V-PROD-21: allergen gate risk='segregated' → block with audit flag (scheduler should have prevented)
- V-PROD-22: downtime_events source='wo_pause' must have linked wo_id
- V-PROD-23: changeover_events.started_at < completed_at (if completed)
- V-PROD-24: wo_outputs.batch_number unique per tenant per year
- V-PROD-25: Per-minute OEE snapshots: availability + performance + quality all in [0, 100]

### 16.5 Marker usage summary

- **[UNIVERSAL]** — 88% of features (state machine, consumption, output, waste, OEE foundation, allergen gate pattern, outbox pattern)
- **[FORZA-CONFIG]** — Forza-specific: 5 lines, 2 shifts, 10 downtime + 10 waste category seeds, D365 constants, PIN rotation 180d
- **[EVOLVING]** — PLC integration P2, OEE streaming P2, ZPL native P2, catch weight scale P2, operator leaderboards P2
- **[LEGACY-D365]** — JournalLines push format, dataAreaId mapping, ItemId/InventBatchId shape, Dynamics F&O API surface

### 16.6 Open questions (carry-forward)

| ID | Question | Resolution target | Blocker? |
|---|---|---|---|
| OQ-PROD-01 | Catch weight hard tolerance enforcement (reject vs warn) — Forza Quality decision | Before P1 UAT | No (soft P1) |
| OQ-PROD-02 | Override audit access — can Prod Manager see all overrides org-wide or only own line? | 02-SETTINGS §14 RBAC final | No |
| OQ-PROD-03 | D365 push batching: per-WO lines or daily consolidated journal? | Before stage 2 impl | No (per-WO P1 default) |
| OQ-PROD-04 | ATP device integration in P1 vs manual entry only — Forza lab workflow review | 09-QUALITY sesja | No (manual P1) |
| OQ-PROD-05 | Shift handover digital form scope — replace paper fully or hybrid? | P2 design with Shift Leads | No |
| OQ-PROD-06 | OEE ideal_cycle_time source — static per product or per-line calibration? | 15-OEE sesja | No |
| OQ-PROD-07 | Allergen gate override authority — only Quality Lead, or also Prod Manager? | BRCGS audit review | No (conservative: Quality only P1) |
| OQ-PROD-08 | Over-consumption approval — Shift Lead on-device (scanner) or desktop-only? | UX review w Shift Lead | No (desktop P1) |
| OQ-PROD-09 | Output yield variance threshold per product or universal 10%? | 3mo post-P1 empirical tuning | No |
| OQ-PROD-10 | Waste category mandatory photo attachment — BRCGS compliance requirement? | Forza Quality input | No (optional P1) |

### 16.7 Phase C progress

**Cumulative C deliverables post C3 Sesja 1:** 00 (744) + 01 (1520) + 02 (1343) + 03 (1184) + 04 v3.1 (1528) + 05 (~1700) + 06 (1504) + 07 (1368) + 08 (this, ~2500) = **~13,400 linii PRD w 9 modułach**.

**Pozostało writing Phase C:** C4 (09+10+11) + C5 (12+13+14+15) = **6-8 sesji**.

### 16.8 References

- **04-PLANNING-BASIC-PRD.md** v3.1 — parent definition layer
- **05-WAREHOUSE-PRD.md** v3.0 §10, §13, §11 — intermediate LPs, scanner contract, genealogy
- **06-SCANNER-P1-PRD.md** v3.0 §8.4, §8.5, §14 — SCN-080 + SCN-082/083/084 + API catalog
- **03-TECHNICAL-PRD.md** v3.0 §7, §8, §10 — BOM, routing, allergen cascade
- **02-SETTINGS-PRD.md** v3.0 §7, §8, §11, §14 — rule registry, reference tables, D365 constants, feature flags
- **07-PLANNING-EXT-PRD.md** v3.0 §9.4, §10.2 — changeover_matrix, allergen_sequencing_optimizer
- **00-FOUNDATION-PRD.md** v3.0 §4, R1, R13, R14, R15 — module map, event-first, AI-ready, idempotency, GS1
- **_foundation/research/MES-TRENDS-2026.md** §2, §3, §9 — food-mfg research, scheduling research, per-module rollups
- **_foundation/decisions/MONOPILOT-V2-ARCHITECTURE.md** Phase D decision #17 (closed_production_strict)
- **_foundation/META-MODEL.md** — schema-driven primitives
- **ADR-002** (BOM snapshot immutable), **ADR-028** (schema-driven L3), **ADR-029** (rule engine DSL), **ADR-030** (configurable depts)
- **SCANNER-PROTOTYPE (2).html** — UX reference for shared design tokens

### 16.9 Next sessions

- **C3 Sesja 2** (if split needed): review 08-PROD, cross-PRD consistency check with 07-EXT + 05-WH
- **C4 Sesja 1:** 09-QUALITY v3.0 (CCP monitoring, ATP device integration, QA workflows)
- **C4 Sesja 2:** 10-FINANCE v3.0 (WIP costing, yield variance, waste cost allocation)
- **C4 Sesja 3:** 11-SHIPPING v3.0 (SO fulfillment, pick wave, SSCC, INTEGRATIONS stage 3)
- **C5 Sesja 1-3:** 12-REPORTING + 13-MAINTENANCE + 14-MULTI-SITE + 15-OEE

### 16.10 Version history

| Version | Date | Author | Summary |
|---|---|---|---|
| 3.0 | 2026-04-20 | C3 Sesja 1 | Full rewrite vs v3.1 baseline. Phase D renumbering. 16 sections, 15 decisions, 7 sub-modules P1 + 5 P2, INTEGRATIONS stage 2 inline §12, allergen changeover gate, per-minute OEE, R14 idempotency, R15 anti-corruption layer. Cross-PRD consumer contract with 05-WH + 06-SCN + 07-EXT enforced. |
| 3.1 (baseline pre-Phase-D) | 2026-02-18 | (archive) | 774 linii, M06 naming, 6 epics P1 + 4 P2. Superseded by v3.0. |

---

## Appendix A — End-to-end WO happy path example

**Scenario:** WO-2026-0042 "Produce FA5101 (chicken breast fillet plain, no mustard) on LINE-01, Shift A, planned qty 1000 kg".

1. **05:45** Scheduler assignment approved (07-EXT output) → WO.status = READY
2. **06:05** Operator Marcin scans login on SCN-010, selects LINE-01 + SHIFT-A
3. **06:10** Marcin scans WO-2026-0042 barcode → SCN-081 WO execute screen
4. **06:11** Marcin clicks "Start WO" → POST /api/production/work-orders/.../start
   - Allergen gate evaluation: prev WO was FA5100 (also no allergens on LINE-01 today) → gate skip, no changeover_event
   - wo_state_machine_v1: READY → IN_PROGRESS
   - wo_executions row created, started_at=06:11, current_operator_id=Marcin
5. **06:12-06:20** Marcin scans 3 RM LPs (chicken breast fresh):
   - Each scan: POST /api/production/scanner/consume-to-wo
   - LP status AVAILABLE → CONSUMED (05-WH)
   - wo_material_consumption rows
   - Genealogy: 3 consumed LPs → (this WO)
   - FEFO compliance: all 3 were FEFO-suggested → fefo_adherence_flag=true
6. **06:20** Marcin starts production (line running). No operator actions until output.
7. **07:30** Marcin scans output LP from line exit (catch-weight crate ~50kg)
   - POST /outputs: output_type=primary, item_id=FA5101, qty_kg=50.3
   - 05-WH creates LP with batch WO-2026-0042-OUT-001
   - Label PDF printed automatically to nearest printer
8. **07:30-09:15** Repeat 19 more output scans, total output = 1003 kg
9. **09:20** Small waste event: 8kg trim
   - POST /waste-record: category=trim, qty=8.0
10. **09:25** Marcin clicks "Complete WO" on SCN-081
    - POST /complete
    - closed_production_strict_v1: all components consumed ✓, all outputs registered ✓
    - wo_state_machine_v1: IN_PROGRESS → COMPLETED
    - wo_executions.completed_at=09:25, completed_by=Marcin
    - output_yield_gate_v1: actual_yield = 1003 / 1011 = 99.2%, variance within 10% ✓
    - Outbox event `production.wo.completed` enqueued with full payload
11. **09:26** Dispatcher picks up outbox event → maps to D365 JournalLines → POST to D365 F&O
    - Idempotency-Key: "0194b1ce-..."
    - D365 returns 200 OK → outbox marked delivered_at=09:26:15
12. **09:27** 15-OEE dashboard reflects: LINE-01 Shift A OEE = 94% (A=95%, P=99%, Q=99.2%)
13. **10:00** Next WO-2026-0043 starts on LINE-01 — allergen gate triggered (WO-43 is mustard-marinated chicken)
    - prev_wo (this WO-42) allergens = [], next_wo (WO-43) allergens = [Mustard]
    - changeover_matrix lookup: cleaning_required=true, atp_required=false, risk_level=medium
    - SCR-08-03 changeover UI opens: 6-step cleaning checklist → complete → dual sign-off by Shift Lead + Quality Lead
    - allergen_changeover_validations row written, BRCGS audit trail locked 7y
    - WO-43 state transitions to IN_PROGRESS

Total lifecycle: 3h 15min (plan 3h + 15min over)
Observed KPI contribution: on-time completion +1, yield +1, FEFO compliance maintained 100%, waste 0.8% (<3% target), allergen gate enforced.

---

## Appendix B — Feature flag matrix

| Flag | Default | P1/P2 | Owner |
|---|---|---|---|
| `production.state_machine.version` | 'v1' | P1 | Admin |
| `production.allergen_gate.version` | 'v1' | P1 | Admin |
| `production.closed_production_strict.enabled` | true | P1 | Admin |
| `production.output_yield_gate.variance_threshold` | 0.10 | P1 | Admin |
| `production.over_consumption.tolerance_pct` | 0.05 | P1 | Admin |
| `production.catch_weight.tolerance_pct` | 0.10 | P1 | Admin |
| `production.waste.threshold_pct_alert` | 0.05 | P1 | Admin |
| `production.oee_aggregation.enabled` | true | P1 | System |
| `production.oee_aggregation.interval_sec` | 60 | P1 | DevOps |
| `integration.d365.push.enabled` | true (Forza) | P1 | Admin per tenant |
| `integration.d365.push.dry_run` | false | P1 | DevOps debug |
| `integration.d365.push.batch_size` | 100 | P1 | DevOps |
| `production.plc_integration.enabled` | false | P2 | Per line rollout |
| `production.catch_weight_scale.enabled` | false | P2 | Per line |
| `production.zpl_printing.enabled` | false | P2 | Per scanner |
| `production.oee_streaming.enabled` | false | P2 | Ops |
| `production.operator_leaderboard.enabled` | false | P2 | Per tenant opt-in |

---

## Appendix C — INTEGRATIONS stages map

| Stage | Module location | Scope | Status |
|---|---|---|---|
| Stage 1 | 03-TECH §13 | D365 item/BOM/supplier pull (inbound) | Designed P1 |
| **Stage 2** | **08-PROD §12 (this PRD)** | **D365 WO confirmations push (outbound)** | **Designed P1** |
| Stage 3 | 11-SHIPPING §N | D365 SO pull + delivery confirmations push | Future Phase C4 |
| Stage 4 | 05-WH §13.7 | EPCIS consumer (P2) | Future P2 |
| Stage 5 | 10-FINANCE §N | Cost posting + financial sync (P2) | Future P2 |

All stages share:
- Outbox pattern
- Anti-corruption layer adapters
- R14 idempotency (UUID v7)
- R15 GS1-first internal, legacy code mapping in adapter
- DLQ with 5-attempt retry policy (5min/30min/2h/12h/24h)
- Per-stage feature flags

---

**End of 08-PRODUCTION-PRD.md v3.0**

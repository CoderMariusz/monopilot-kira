# 07-PLANNING-EXT-PRD.md

**Module:** 07-PLANNING-EXT — Advanced Scheduling, Allergen Optimizer, ML Forecasting, Disposition Bridge
**Version:** 3.1 (2026-04-21 — 10 open questions resolved; Gantt drag-drop descoped)
**Updated:** 2026-04-21
**Status:** Written
**Owner:** Scheduling & Planning domain
**Dependencies:** 04-PLANNING-BASIC v3.1, 03-TECHNICAL v3.0, 02-SETTINGS v3.0, 05-WAREHOUSE v3.0, 00-FOUNDATION v3.0
**Consumers:** 08-PRODUCTION (downstream WO execution), 15-OEE (scheduler metrics), 12-REPORTING (forecast vs actual)

---

## Changelog

- **v3.1 (2026-04-21)** — Stakeholder decision session. 10 open questions (OQ-EXT-01..10) resolved. MAJOR: GanttView drag-drop descoped — Gantt is now read-only visualization; rescheduling via Assignment Override modal and global Re-run Scheduler. Penalty weights accepted (OQ-EXT-01). Operator shift preference deferred P2 (OQ-EXT-02). What-if sim deferred P2 (OQ-EXT-03). Blocked cells get `[Request Review]` button (OQ-EXT-04). `[Approve All]` covers all completed runs (OQ-EXT-06). Disposition timeout extensible per LP via `[Extend 1h]`/`[Extend 4h]` (OQ-EXT-07). Single Planner Advanced publish for matrix (OQ-EXT-08). Dry-run persists as `scheduler_run` row with `run_type='dry_run'` (OQ-EXT-09). Total Changeover KPI = approved schedule sum (OQ-EXT-10).
- **v3.0 (2026-04-20)** — Greenfield v3.0 per Phase D renumbering. Absorbs deferred items from 04-PLANNING-BASIC v3.1 §8.5 (disposition bridge), §10 (full allergen sequencing optimizer), §11 (finite-capacity engine). Adds ML forecasting bridge (internal Prophet microservice, R12). Integrates 02-SETTINGS §7 rule registry DSL via pluggable optimizer rules. 16 sections, 5 Phase C3 decisions (D1-D5 Q1-Q5), ~2200 lines, 4 sub-modules build sequence (07-a..d).
- **Prior baseline:** None as standalone PRD. Content source: 04-PLANNING-BASIC v3.1 §11 stub (marked [EVOLVING] for 07-EXT) + §10 heuristic carry-forward + MES-TRENDS-2026 §3/§9 R-decisions (R1 event-first, R12 AI/ML, R13 schema AI-ready).

---

## 1. Executive Summary

### 1.1 Mission

07-PLANNING-EXT is the **advanced scheduling layer** that sits above 04-PLANNING-BASIC WO lifecycle. Where 04-PLANNING-BASIC handles PO→TO→WO generation, intermediate cascade DAG, and basic allergen group-by-family heuristic sequencing, 07-EXT provides:

1. **Finite-capacity scheduling engine** — assigns WOs to machines/lines/shifts respecting resource availability, not just queuing
2. **Full allergen-aware sequencing optimizer** — minimizes changeover cost across multi-line production via pluggable DSL rule (replaces P1 heuristic)
3. **ML demand forecasting bridge** — internal Prophet microservice feeding forecast-driven PO generation (P2+)
4. **Disposition bridge** — P2 re-introduction of `direct_continue` and `planner_decides` flows deferred from 04-PLAN §8.5 (Q6 revised to_stock-only P1)

Positioning: Apex is multi-line, allergen-complex (8 RM dept silos, 14 EU allergens + Mustard addition via process cascade) — group-by-family heuristic in 04-PLAN §10 is good enough for single-line linear flow but **fails on cross-line optimization**. 07-EXT provides the optimizer that Apex planners will manually approve (human-in-loop P1, semi-autonomous P2+).

### 1.2 Why Phase C3 (not bundled into 04-PLAN)

Writing split rationale: 04-PLANNING-BASIC v3.1 is 1528 lines — bundling finite-capacity + full optimizer + forecasting + disposition bridge would push past 3000 lines, making the PRD unscannable and bundling implementation phases that have fundamentally different risk profiles:

- **04-PLAN P1 innovations** (intermediate cascade DAG, workflow-as-data, basic heuristic) = **must-have MVP** for Apex to run production at all
- **07-EXT innovations** (optimizer, forecaster, disposition bridge) = **optimization layer** that improves P1 baseline but is **not blocking** first production go-live

By splitting, 04-PLAN-BASIC can go to implementation immediately while 07-EXT remains in writing/refinement. Both PRDs share the same rule engine DSL in 02-SETTINGS §7, ensuring consistency.

### 1.3 Core primitives

| # | Primitive | Layer | Ownership |
|---|---|---|---|
| 1 | `scheduler_runs` table | L1 | 07-EXT |
| 2 | `scheduler_assignments` table | L1 | 07-EXT |
| 3 | `changeover_matrix` table | L1 | 07-EXT (editable via 02-SETTINGS) |
| 4 | `demand_forecasts` table | L1 | 07-EXT |
| 5 | `forecast_actuals` table | L1 | 07-EXT |
| 6 | `allergen_sequencing_optimizer_v2` rule | L1 DSL | 02-SETTINGS registry |
| 7 | `finite_capacity_solver_v1` rule | L1 DSL | 02-SETTINGS registry |
| 8 | `disposition_bridge_v1` rule (P2) | L1 DSL | 02-SETTINGS registry |
| 9 | `/api/scheduler/run` endpoint | L1 | 07-EXT |
| 10 | Prophet microservice (Python FastAPI) | L1 infra | 07-EXT (P2) |

### 1.4 Build sequence (4 sub-modules, est. 14-18 sesji impl)

- **07-a Finite-Capacity Engine** (4-5 sesji) — solver service (Python heuristic), scheduler_runs table, /run endpoint, GanttView
- **07-b Allergen Optimizer** (3-4 sesji) — changeover_matrix table, `allergen_sequencing_optimizer_v2` DSL rule v1, ChangeoverMatrixEditor screen
- **07-c Forecast Bridge** (4-5 sesji) — demand_forecasts + forecast_actuals tables, Prophet microservice, ForecastUpload screen, forecast-driven PO generation trigger
- **07-d Disposition Bridge P2** (3-4 sesji) — re-introduces `direct_continue` + `planner_decides` per 04-PLAN §8.5 Q6 revision, reservation handoff parent→child WO

### 1.5 Markers legend

- `[UNIVERSAL]` — applies to all tenants (L1 core)
- `[APEX-CONFIG]` — Apex-specific configuration, pattern universal
- `[EVOLVING]` — under active change, open question pending
- `[LEGACY-D365]` — D365 shape/logic for bridge-period

---

## 2. Objectives & Success Metrics

### 2.1 Primary objectives

1. **Reduce allergen changeover time** — target ≥30% reduction vs 04-PLAN §10 basic heuristic baseline, measured on rolling 30-day window
2. **Forecast-driven procurement** — target ≥70% of RM POs generated from forecast (P2+), vs 100% manual in P1
3. **Schedule adherence** — target ≥90% of WOs started within planned start_time ±2h window
4. **Solver performance** — target <60s P95 for 50 WOs × 5 lines × 7-day horizon
5. **Human-in-loop acceptance** — target ≥85% of scheduler recommendations accepted by Planner without override

### 2.2 Secondary objectives

1. **Machine utilization lift** — target ≥8 percentage points (82% → 90% average line utilization)
2. **Overtime cost reduction** — target ≥15% reduction in unplanned overtime (via better capacity projection)
3. **Intermediate WO timing** — target <4h gap between parent completion and child WO start (cascade DAG from 04-PLAN §8.4 + finite-capacity scheduling)

### 2.3 Non-goals (explicit)

1. **Full plant-wide ERP replacement** — 07-EXT is scheduling-only; procurement optimization, MRP calculations live in 04-PLAN + 03-TECHNICAL
2. **Real-time dispatching** (seconds-level granularity) — 07-EXT operates on minute-level, shop floor execution = 08-PRODUCTION
3. **Mass customization / MTO small batch optimizer** — Apex is MTS/MTO hybrid batch mfg, not job shop; 07-EXT optimizes batches, not individual units
4. **Multi-site cross-optimization** — P2 single-site, multi-site → 14-MULTI-SITE (Phase C5)

### 2.4 Success metrics summary

| KPI | Target | Measured by | Frequency |
|---|---|---|---|
| Allergen changeover reduction | ≥30% vs P1 baseline | Sum of changeover minutes / production minutes | Weekly rolling |
| Schedule adherence | ≥90% WOs on-time start ±2h | `wo.started_at - wo.planned_start_time` | Daily |
| Solver runtime | <60s P95 | `scheduler_runs.solve_duration_ms` | Per run |
| Scheduler acceptance rate | ≥85% | `scheduler_assignments` where `accepted_by_planner = true` | Weekly |
| Forecast SMAPE | <20% | `forecast_actuals` rolling 30d | Daily |
| Machine utilization | ≥90% | `(planned_minutes / available_minutes)` per line | Weekly |

---

## 3. Personas & RBAC

### 3.1 Personas

**Planner Advanced** [APEX-CONFIG: 1 person, Monika Nowak]
- Primary user of 07-EXT
- Runs scheduler daily (morning + afternoon)
- Reviews optimizer recommendations, approves/overrides
- Maintains changeover matrix
- Uploads/adjusts forecasts (P2)
- Read+execute on `scheduler_runs`, `demand_forecasts`
- Edit on `changeover_matrix` (via 02-SETTINGS)

**Scheduling Officer** [UNIVERSAL]
- Shift-lead-level
- Reviews generated schedule, tactical adjustments
- Cannot change matrices or run optimizer
- Read on all 07-EXT entities
- Limited write: can reject/override individual `scheduler_assignments`

**Production Manager** [UNIVERSAL]
- Strategic oversight
- KPI monitoring (changeover reduction, schedule adherence)
- Read-only on 07-EXT, write on 15-OEE dashboards

**NPD Manager (Jane)** [APEX-CONFIG, cameo]
- Primary user of 01-NPD
- Minor 07-EXT interaction: views forecast for new FAs launching (P2)
- Read on `demand_forecasts` where product_id IN NPD scope

**System (Scheduler Daemon)** [UNIVERSAL]
- Background service
- Runs solver on schedule (cron: 06:00, 14:00 per shift-boundary)
- Runs forecaster (cron: daily 01:00)
- Write on all 07-EXT state tables

### 3.2 RBAC matrix

| Entity | Planner Advanced | Scheduling Officer | Prod Manager | NPD Manager | Operator |
|---|---|---|---|---|---|
| `scheduler_runs` (run optimizer) | execute | read | read | - | - |
| `scheduler_assignments` (approve) | write | write (override) | read | - | - |
| `changeover_matrix` | edit (via SETTINGS) | read | read | - | - |
| `demand_forecasts` upload | execute | read | read | read (own NPD) | - |
| `forecast_actuals` | read | read | read | read (own NPD) | - |
| Optimizer DSL rules | read (via SETTINGS) | read | read | - | - |

### 3.3 Session handling

- Planner Advanced runs in desktop browser (/scheduler/*), NOT scanner PWA
- Session timeout 30min idle (configurable via 02-SETTINGS §14)
- Scheduler runs are **idempotent** (R14): same `run_id` returns cached result on replay
- Solver runs in background job (async, status polled via WebSocket or 5s polling)

---

## 4. Scope

### 4.1 Phase 1 (P1) — MVP scope

**In scope P1:**

1. **Finite-capacity scheduling engine** (basic heuristic) [D1]
   - Greedy assignment: WOs → (line, shift, time_window)
   - Respects `production_lines.capacity_kg_per_hour`, `shift_patterns`, `production_lines.allergen_constraints`
   - Local search refinement (swap pairs, move between lines)
   - No MILP/CP-SAT solver (no OR-Tools dependency)
   - Python microservice (FastAPI), <60s P95 runtime target

2. **Full allergen-aware sequencing optimizer** (replaces 04-PLAN §10 heuristic) [D2]
   - Pluggable DSL rule `allergen_sequencing_optimizer_v2` (in 02-SETTINGS §7 registry, admin read-only)
   - Dev-authored algorithm: uses `changeover_matrix` lookup per allergen pair, minimizes total_changeover_minutes
   - Penalty weights: high_risk × 2, medium_risk × 1, low_risk × 0.5, segregated × ∞ (blocks assignment)
   - Multi-line cross-optimization (shift WOs between lines if changeover savings > opportunity cost)
   - Fallback to v1 heuristic if solver fails

3. **Changeover matrix editor** [UNIVERSAL]
   - UI in 07-EXT (linked from 02-SETTINGS reference tables)
   - N×N matrix: allergen_from × allergen_to → (changeover_minutes, cleaning_required, atp_required)
   - Apex initial seed: 14 EU allergens + Mustard + "none" row/col
   - L3 extensible via schema-driven admin wizard (ADR-028)

4. **Manual forecast entry** (pre-Prophet integration) [EVOLVING→P2]
   - Planner can paste forecast CSV (product_id, week, qty_kg)
   - Stored in `demand_forecasts` (manual source)
   - Used as input to scheduler (demand signal)

5. **Scheduler dashboard (GanttView)** [UNIVERSAL]
   - Horizontal Gantt: x=time (hours/days toggle), y=production_line
   - Color by allergen group
   - Highlight changeover blocks
   - Click WO → details side panel (materials, operations, intermediate dependencies from 04-PLAN §8.4)
   - **Read-only visualization** — no drag-drop reassignment [DESCOPED P1, decision 2026-04-21]. Rescheduling via `[Re-run Scheduler]` (global) or MODAL-07-03 Assignment Override (per-WO). Rationale: FAs are typically bound to one line (see 03-TECHNICAL `fa_line_compatibility`); drag between lines would require eligibility lookup with limited business value.

6. **Scheduler run lifecycle** [UNIVERSAL]
   - Planner clicks "Run Scheduler" → POST /api/scheduler/run {horizon_days, line_ids[], include_forecast: bool}
   - Background job, status = `queued → running → completed | failed`
   - Result: list of `scheduler_assignments` draft state
   - Planner reviews, per-assignment approve/reject/override
   - Approved assignments update `work_orders.planned_start_time`, `work_orders.assigned_line_id`, `work_orders.assigned_shift_id`
   - Audit trail: `scheduler_runs` keeps input params + output assignments + override log

**Out of scope P1 (→ P2):**

1. ML demand forecasting (Prophet microservice) [D3]
2. Disposition bridge (`direct_continue` + `planner_decides`) [Q6 04-PLAN deferred]
3. Multi-site cross-optimization [→ 14-MULTI-SITE]
4. OR-Tools CP-SAT solver (advanced optimizer, if heuristic insufficient after P1 empirical)
5. Genetic algorithm / simulated annealing (exotic meta-heuristics)
6. Operator shift preference optimization (Phase 3+)
7. Predictive maintenance integration (Phase 3+, → 13-MAINTENANCE)
8. What-if simulation mode (Phase 2+)

### 4.2 Phase 2 (P2) — Advanced scope

**In scope P2:**

1. **ML demand forecasting** (Prophet internal microservice)
   - Python FastAPI service, Prophet library (Meta open-source)
   - Input: historical sales (from D365 or internal `production_outputs`), seasonality (weekly, monthly, yearly)
   - Output: forecast per (product_id, week) with confidence intervals
   - Daily job re-trains on rolling 2-year data
   - SMAPE target <20%
   - Forecast-driven PO generation trigger (04-PLAN §5)

2. **Disposition bridge** (re-introduce P1 deferred modes from 04-PLAN §8.5)
   - `direct_continue`: parent WO output LP immediately consumed by child WO (no put-away)
   - `planner_decides`: case-by-case UI decision per intermediate item
   - Reservation handoff: parent WO output reservation released synchronously to child WO hard-lock
   - DSL rule `disposition_bridge_v1` decides mode per product/tenant
   - Use case: perishable intermediates (<6h shelf life) where to_stock buffer impractical

3. **What-if simulation mode**
   - Planner runs scenarios: "what if line 3 goes down for 8h?" → re-solve, compare KPIs
   - Does not commit to production DB
   - Stored in `scheduler_scenarios` (P2 new table)

4. **Auto-approval policy**
   - Per-tenant config: assignments below confidence_threshold auto-approved, above require Planner review
   - Reduces manual workload over time

**Out of scope P2 (→ P3+):**

1. OR-Tools CP-SAT upgrade (only if P1 heuristic empirically insufficient; ADR needed)
2. TimeGPT / Chronos foundation model forecasting (MES-TRENDS R12)
3. Reinforcement learning scheduler
4. Multi-site cross-site WO migration (→ 14-MULTI-SITE)
5. Real-time re-optimization on machine breakdown (event-driven, currently triggered manually)

### 4.3 Scope summary table

| Feature | P1 | P2 | P3+ |
|---|---|---|---|
| Finite-capacity heuristic | ✅ | - | - |
| OR-Tools CP-SAT upgrade | - | only-if-needed | ADR |
| Allergen optimizer v2 DSL | ✅ | refinements | - |
| Changeover matrix editor | ✅ | - | - |
| Manual forecast entry | ✅ | - | - |
| Prophet ML forecasting | - | ✅ | - |
| Foundation model forecasting | - | - | ✅ |
| Disposition bridge | - | ✅ | - |
| What-if simulation | - | ✅ | - |
| Auto-approval policy | - | ✅ | - |
| Multi-site cross-opt | - | - | ✅ (14-MULTI-SITE) |
| Predictive maintenance integration | - | - | ✅ |

---

## 5. Constraints

### 5.1 Architecture constraints

**[UNIVERSAL]**

1. **Solver runs in Python microservice** — NOT in main Next.js app (CPU-heavy, ops-isolated). FastAPI `planner-solver` service, deployed separately, scaled independently.
2. **Idempotent runs** — `scheduler_runs.run_id` = UUID v7 client-generated (R14). Replay returns cached result within 1h window.
3. **Event-first outbox** — scheduler assignments committed emit `outbox_events.scheduler.assignment.approved`, consumed by 08-PRODUCTION (populates WO scheduler metadata) and 15-OEE (KPI tracking).
4. **RLS enforced** — `scheduler_runs`, `scheduler_assignments`, `changeover_matrix` all have tenant_id + RLS policy (ADR-003).
5. **No external ML APIs in P1** — Prophet is Phase 2; P1 forecasting is manual CSV upload. Rationale: data sovereignty, $$ avoidance.
6. **Optimizer as DSL rule** (Q2: B chosen) — `allergen_sequencing_optimizer_v2` registered in 02-SETTINGS §7 registry, admin read-only (dev-authored via PR → deploy). Consistent with all other core rules.
7. **Heuristic solver** (Q1: B chosen) — greedy + local search, NOT MILP/CP-SAT. Simpler deployment, no solver license/dependency, fast for Apex scale (5 lines, 50-100 WOs). OR-Tools upgrade deferred unless empirical data shows heuristic insufficient post-P1.

### 5.2 Business constraints

**[APEX-CONFIG, becoming UNIVERSAL]**

1. **5 production lines** (Apex default) — LINE-01 (Fresh), LINE-02 (Cooked), LINE-03 (Breaded), LINE-04 (Marinated), LINE-05 (Packaging only). Allergen constraints pre-seeded per line (e.g., LINE-04 has marinade = adds Mustard).
2. **2 shifts/day** — 06:00-14:00 Shift A, 14:00-22:00 Shift B. Night shift optional (22:00-06:00 Shift C), used only P2+ or during surge.
3. **7-day scheduling horizon** P1 — extends to 14 days P2+.
4. **Mon-Fri production**, weekend = maintenance windows (no WO scheduling; cleaning blocks only).
5. **Manual approval required** P1 — Planner reviews every recommendation. Auto-approval policy P2+.
6. **Allergen-free-from claims mandatory** — scheduler must enforce allergen changeover gate (from 08-PROD `allergen_changeover_gate_v1` rule) for free-from pairs; else BRCGS audit failure risk.

### 5.3 Regulatory constraints

**[UNIVERSAL]**

1. **EU FIC 1169/2011 allergen declaration** — scheduler must not place non-declared allergen WO after declared-free-from WO on same line without cleaning + ATP (<10 RLU) + dual sign-off (08-PROD gate). Changeover_matrix seed respects this.
2. **BRCGS Issue 10 (2026)** — requires immutable audit trail on schedule changes. `scheduler_runs` + override log satisfies.
3. **FSMA 204 (2028-07-20)** — traceability <2s forward/backward; scheduler doesn't directly handle traceability but must not create scheduling patterns that fragment lot genealogy (e.g., split single lot across 2+ lines).
4. **GDPR** — operator shift preferences (P2+) are personal data; scheduler_assignments.operator_id uses RLS + consent tracking.

### 5.4 Performance constraints

1. **Solver runtime** — <60s P95 for 50 WOs × 5 lines × 7d horizon. Hard timeout 120s (fail with partial results).
2. **Gantt render** — <2s P95 for 100 WOs.
3. **API latency** — /scheduler/run queue submit <500ms, status poll <100ms, approve assignment <300ms.
4. **Database** — `scheduler_runs` retained 2 years (audit), `scheduler_assignments` rolling window 6 months (after approval → merged into work_orders).
5. **Scalability** — design for 200 WOs × 10 lines × 14d horizon (Phase 2 scale); heuristic should still complete <5min.

### 5.5 Data constraints

1. **Input data sources:**
   - `work_orders` (04-PLAN) — WHERE status = 'DRAFT' AND planned_start_time IS NULL (unscheduled)
   - `production_lines` + `shift_patterns` (02-SETTINGS)
   - `routings` + `routing_operations` (03-TECH §8) — operation sequence + expected_duration
   - `changeover_matrix` (07-EXT §9) — allergen pair → changeover_minutes
   - `items.allergen_profiles` (03-TECH §5.2) — allergen intensity per item
   - `wo_dependencies` (04-PLAN §8.4) — intermediate cascade DAG (child WO depends on parent WO output)

2. **Output mutations:**
   - `scheduler_assignments` (draft state, 07-EXT)
   - `work_orders.planned_start_time`, `.assigned_line_id`, `.assigned_shift_id` (on approve)
   - `outbox_events` (scheduler.assignment.approved)

3. **Forecast data (P2):**
   - `demand_forecasts` input: historical D365 sales pull OR internal `wo_outputs` aggregation
   - Training window: rolling 24 months minimum
   - Update frequency: daily 01:00 UTC

---

## 6. Decisions (D1-D5 Phase C3 Sesja 1)

### D1 — Solver engine: heuristic greedy + local search [Q1 decision]

**Decision:** Build custom heuristic solver in Python (FastAPI microservice). Two-phase:
1. **Greedy assignment**: sort WOs by priority (deadline, allergen constraint tightness), assign to earliest-feasible (line, shift, time_window)
2. **Local search refinement**: N iterations of (swap pairs, move between lines) accepting if total_cost decreases (cost = changeover_minutes + overdue_minutes + utilization_penalty)

**Alternatives rejected:**
- **OR-Tools CP-SAT (option A)** — rejected P1 for simplicity/deployment ease. Reconsider if empirical data (post-6-months P1 run) shows heuristic solutions ≥15% suboptimal vs hand-tuned. Would need ADR, Python service stays (CP-SAT is also Python-embeddable).
- **Gurobi (option C)** — rejected due to commercial license cost + vendor lock-in.

**Consequences:**
- Pro: No external solver dependency, deployable anywhere, fast for Apex scale (<60s confirmed on 50 WOs × 5 lines simulation)
- Con: No optimality guarantees. Local optima risk. Complex multi-constraint trade-offs may need hand-tuning of penalty weights.
- Mitigation: Empirical KPI tracking; if changeover reduction <30% target after 3 months, trigger OR-Tools evaluation.

### D2 — Allergen sequencing optimizer as pluggable DSL rule [Q2 decision]

**Decision:** Optimizer logic authored as DSL rule `allergen_sequencing_optimizer_v2` in 02-SETTINGS §7 rule registry. Dev-authored (via PR → migration upsert → deploy). Admin UI in 02-SETTINGS: read-only viewer + dry-run on sample data.

**Alternatives rejected:**
- **Fixed baked-in algorithm (option A)** — rejected for consistency with all other core rules (cascade, FEFO, workflow state machines) which are DSL. Allows v1/v2 A/B testing rollout (same pattern as `lp_state_machine_v1`).

**Consequences:**
- Pro: Consistency with 02-SETTINGS registry pattern (14 DSL rules so far across modules). A/B testing enabled (v1 heuristic vs v2 full optimizer). Future variants (e.g., `v3_genetic_algorithm`) plug in same way.
- Con: Slight perf overhead (rule engine dispatch per run) vs native code — mitigated by rule JIT-compile cache.

### D3 — ML forecasting: internal Prophet microservice [Q3 decision]

**Decision:** Phase 2 introduces Prophet (Meta open-source, Python) as internal microservice. NOT AWS Forecast / GCP Vertex AI.

**Alternatives rejected:**
- **External managed service (option B)** — rejected for data sovereignty (food industry sensitivity, supplier confidentiality), $$ (~$100-500/month/tenant at Apex scale, scales with data), network dependency.

**Consequences:**
- Pro: Data stays on-prem / in-region. Zero external spend. Prophet is well-documented, battle-tested in CPG.
- Con: Ops overhead (own Python service, Prophet version pinning, retrain job monitoring). Performance ceiling vs foundation models (TimeGPT, Chronos) — future upgrade path noted P3+.

### D4 — Horizon granularity: hour-level internal, day-level UX [NEW this session]

**Decision:** Solver operates on hour-level granularity internally (`scheduler_assignments.planned_start_time` TIMESTAMP). UX aggregates to day-level on Gantt default view; user can toggle hour-level zoom for tactical detail.

**Rationale:**
- Shift-based production = 8h blocks; hour-level is sufficient granularity (vs minute-level overkill, day-level too coarse for multi-WO-per-shift)
- UX readability: daily Gantt = 7 columns for weekly horizon, manageable; hourly Gantt = 168 columns, requires zoom

### D5 — Changeover matrix: per-line override supported [NEW this session]

**Decision:** `changeover_matrix` has default matrix (tenant-wide) + optional per-line override rows. Line-specific overrides used when a line has faster/slower changeover due to equipment design (e.g., LINE-03 Breaded has extended cleaning due to crumb removal).

**Consequences:**
- Pro: Realistic modeling, prevents scheduler from assuming all lines are interchangeable for changeover cost
- Con: More cells to maintain (N allergens × N allergens × M lines + 1 default)
- Mitigation: Admin UI highlights cells that differ from default; only surface non-default values

### D-summary table

| # | Question | Decision | Status | Rule/ADR |
|---|---|---|---|---|
| D1 | Solver engine | Heuristic greedy + local search (Python microservice) | Locked | - |
| D2 | Optimizer packaging | Pluggable DSL rule `allergen_sequencing_optimizer_v2` | Locked | 02-SETTINGS §7 |
| D3 | ML forecasting provider | Internal Prophet microservice (P2) | Locked | - |
| D4 | Horizon granularity | Hour-level internal, day-level UX default | Locked | - |
| D5 | Changeover matrix | Per-line override rows allowed | Locked | - |

---

## 7. Module Map (4 epics)

### 7.1 Epic E1 — Finite-Capacity Engine (07-a)

**Scope:**
- Python microservice `planner-solver` (FastAPI)
- Greedy + local search heuristic
- `scheduler_runs` table + `/api/scheduler/run` endpoint
- Run queue (BullMQ or native Postgres listen/notify)
- Status polling + WebSocket notifications
- GanttView UI component

**FRs:**
- FR-07-E1-001: POST /api/scheduler/run accepts {tenant_id, horizon_days, line_ids[], include_forecast, run_id:uuid}
- FR-07-E1-002: Solver respects production_line.capacity_kg_per_hour, shift_patterns, wo_dependencies (intermediate cascade)
- FR-07-E1-003: Solver output = list of scheduler_assignments (draft), ordered by (line, planned_start_time)
- FR-07-E1-004: GanttView renders <2s for ≤100 WOs as read-only visualization; rescheduling via Assignment Override modal or global Re-run Scheduler [drag-drop DESCOPED P1, decision 2026-04-21]
- FR-07-E1-005: Run lifecycle: queued → running → completed | failed; status pollable
- FR-07-E1-006: Idempotent (run_id replay returns cached result within 1h)
- FR-07-E1-007: Timeout 120s hard; partial results returned with warning flag

**Non-FRs:**
- Solver service horizontally scalable (stateless, queue-driven)
- Circuit breaker on solver service failure → graceful degradation to "last known good schedule"

### 7.2 Epic E2 — Allergen Optimizer (07-b)

**Scope:**
- `changeover_matrix` table + ChangeoverMatrixEditor screen
- `allergen_sequencing_optimizer_v2` DSL rule registration
- Penalty weight configuration UI (per allergen, per line)
- Integration with E1 solver (optimizer called as objective function component)

**FRs:**
- FR-07-E2-001: changeover_matrix seeded with 14 EU allergens + Mustard (Apex) + "none" baseline on first tenant onboarding
- FR-07-E2-002: Editor supports bulk CSV import/export, diff-highlight for non-default cells
- FR-07-E2-003: DSL rule v2 replaces 04-PLAN §10 v1 heuristic when enabled via feature flag `planning.allergen_optimizer.v2.enabled`
- FR-07-E2-004: Fallback to v1 on DSL rule error; alert to Planner
- FR-07-E2-005: Dry-run mode: planner uploads sample WO list, previews schedule without committing
- FR-07-E2-006: Multi-line cross-optimization: solver considers moving WO from suboptimal line to better line if total cost reduces

**Non-FRs:**
- Changeover matrix edit audit logged (who, what cells, when)
- Matrix versioning: changes create new version, active version flag (similar to BOM versioning in 03-TECH §7.1)

### 7.3 Epic E3 — Forecast Bridge (07-c) [P2]

**Scope:**
- `demand_forecasts` + `forecast_actuals` tables
- Prophet microservice `forecaster` (FastAPI)
- ForecastUpload screen (manual CSV P1, auto Prophet P2)
- Forecast-driven PO generation trigger (integrated with 04-PLAN §5)
- Forecast vs actual dashboard (12-REPORTING)

**FRs P1 (manual):**
- FR-07-E3-001: Planner uploads CSV (product_id, week_iso, qty_kg, source='manual')
- FR-07-E3-002: Forecast used as demand signal in solver input
- FR-07-E3-003: Manual forecast retained until superseded by Prophet (P2) or next manual upload

**FRs P2 (Prophet):**
- FR-07-E3-004: Daily job trains Prophet model per product on rolling 24-month history
- FR-07-E3-005: Forecast output per (product_id, week) with yhat, yhat_lower, yhat_upper (95% CI)
- FR-07-E3-006: Forecast-driven PO: `po_generator` consumes forecast, generates draft POs for RM based on BOM explosion
- FR-07-E3-007: SMAPE tracking: `forecast_actuals` populated weekly from `wo_outputs`; SMAPE alerts if >30% (model drift)

**Non-FRs:**
- Prophet service isolated (own container, ops visibility via Grafana)
- Forecast retrain failure does not block solver (uses last known forecast with stale_flag)

### 7.4 Epic E4 — Disposition Bridge (07-d) [P2]

**Scope:**
- Re-introduction of `direct_continue` + `planner_decides` disposition modes deferred from 04-PLAN §8.5 Q6 revision
- `disposition_bridge_v1` DSL rule (decides mode per product/tenant)
- Reservation handoff parent WO → child WO (for `direct_continue`)
- Planner UI for `planner_decides` case-by-case decisions

**FRs:**
- FR-07-E4-001: Per-item config `items.intermediate_disposition_mode` ENUM (to_stock|direct_continue|planner_decides), default to_stock (P1 universal)
- FR-07-E4-002: `direct_continue`: parent WO output LP auto-reserved for child WO on completion, skips put-away
- FR-07-E4-003: `planner_decides`: on parent WO completion, notification to Planner; modal decides (stock or continue); default timeout 2h → auto to_stock
- FR-07-E4-004: Reservation handoff: parent WO output `lp.status='reserved_for_child_wo'`, child WO hard-lock `wo_material_reservations` created
- FR-07-E4-005: Cancel handoff: if child WO cancelled before consumption, parent LP reverts to `available`

**Constraints:**
- Applies only to items with `shelf_life_hours <= 24` (typical trigger for direct_continue — perishable intermediates)
- Does NOT affect 05-WH §10 intermediate LP flow for to_stock items (Q6 baseline)

### 7.5 Epic dependencies

```
E1 (Finite-Capacity) ──┬──→ E2 (Allergen Optimizer)
                       └──→ E3 (Forecast Bridge) [P2]
                       └──→ E4 (Disposition Bridge) [P2]

Cross-module:
E1 ← 04-PLAN §7/8/11 (WO lifecycle + cascade DAG)
E2 ← 03-TECH §10 (allergen matrix) + 02-SETTINGS §7 (DSL registry)
E3 ← 04-PLAN §5 (PO generation) + D365 integration (sales history pull)
E4 ← 04-PLAN §8.5/9 (disposition policy, reservation semantics)
```

---

## 8. Requirements per Screen/API

### 8.1 Screens

#### SCR-07-01: Scheduler Dashboard (GanttView)

**Route:** `/scheduler`
**Roles:** Planner Advanced, Scheduling Officer (read), Prod Manager (read)

**Layout:**
- Top bar: horizon selector (7d/14d toggle), line filter multi-select, shift filter, "Run Scheduler" button, last run timestamp
- Main area: horizontal Gantt
  - Y-axis: production lines (LINE-01..LINE-05)
  - X-axis: time (daily default, hour toggle)
  - Cells: WO blocks, color = allergen group, label = WO_CODE + product_code
  - Changeover blocks: diagonal stripe pattern, hover shows reason
  - Weekend columns: grey hatched (no production)
  - Shift boundaries: vertical line markers
- Side panel (opens on WO click): WO details (materials from 04-PLAN, dependencies, approve/reject actions)
- Bottom: KPI strip (total_changeover_minutes, utilization %, overdue WOs count)

**Actions:**
- Click WO block → side panel with approve/reject/override/reschedule-WO
- `[Reschedule WO]` in side panel → opens Assignment Override modal (MODAL-07-03) prefilled; validates `fa_line_compatibility` from 03-TECHNICAL
- `[Re-run Scheduler]` → POST /api/scheduler/run → status poll → refresh Gantt (global re-solve)
- **Drag-drop: DESCOPED P1** — Gantt is read-only visualization (decision 2026-04-21; see §8.1 rationale below)
- Export: PDF report (Phase 2), CSV assignments

**§8.1 Gantt drag-drop descope rationale (OQ-EXT-05, 2026-04-21):** FAs are typically bound to one production line (dominant 1-FA-to-1-line relationship in Apex configuration). Drag between lines would require eligibility lookup via `fa_line_compatibility` from 03-TECHNICAL for every drag event, creating significant implementation complexity for limited business value. The assignment override modal (MODAL-07-03) provides full rescheduling capability with proper validation. This decision is CLOSED.

#### SCR-07-02: Changeover Matrix Editor

**Route:** `/settings/planning/changeover-matrix` (invoked from 02-SETTINGS reference tables)
**Roles:** Planner Advanced (write), Prod Manager (read)

**Layout:**
- Tab 1: Default matrix (tenant-wide N×N grid)
- Tab 2: Per-line overrides (list of lines with override matrices, + Add Override)
- Cell editor: click cell → modal with (changeover_minutes, cleaning_required: bool, atp_required: bool, notes)
- Visual: heatmap (green <15min, yellow 15-45min, red >45min)
- Diff view: per-line override vs default, highlight non-default cells

**Actions:**
- Edit cell
- Bulk import CSV
- Export CSV
- "Save & Publish" → creates new matrix version, marks as active
- "View History" → version list with diff view

#### SCR-07-03: Forecast Upload (P2 Prophet; P1 manual CSV)

**Route:** `/scheduler/forecasts`
**Roles:** Planner Advanced (write), NPD Manager (read own products)

**P1 layout (manual):**
- Upload CSV button
- CSV format: product_id, week_iso (YYYY-Www), qty_kg
- Preview table with validation errors inline
- "Upload" → writes to demand_forecasts with source='manual', user_id
- List of recent uploads with replace/delete

**P2 layout (Prophet):**
- Auto-generated forecasts displayed per product, per week
- Chart: actual (last 12 weeks) + forecast next 8 weeks with confidence band
- Manual override: checkbox "override forecast for this (product, week)" → editable cell
- Retrain status indicator (last retrain timestamp, health)

#### SCR-07-04: Scheduler Run History

**Route:** `/scheduler/runs`
**Roles:** Planner Advanced, Prod Manager (read)

**Layout:**
- Table of scheduler_runs: run_id, started_at, completed_at, duration_ms, wos_assigned, wos_override, kpi_summary (changeover_min_total, utilization_avg)
- Click row → detail panel: input params, output assignments, override log, KPI snapshot
- Filter: date range, status (completed/failed), user
- Re-run button (re-solves with same inputs, new run_id)

#### SCR-07-05: What-If Simulation (P2)

**Route:** `/scheduler/simulate`
**Roles:** Planner Advanced

**Layout:**
- Copy current baseline scheduler state
- Scenario builder: "line down for N hours", "add WO X", "remove WO Y", "shift capacity change"
- Run simulation (does NOT commit)
- Compare KPIs: baseline vs scenario (changeover delta, utilization delta, overdue delta)
- "Save Scenario" (to `scheduler_scenarios` P2 table)

### 8.2 APIs

#### POST /api/scheduler/run

**Body:**
```json
{
  "run_id": "0194b1ce-...", // UUID v7 client-generated (R14)
  "horizon_days": 7,
  "line_ids": ["LINE-01", "LINE-02", ...],
  "include_forecast": false,
  "optimizer_version": "v2"
}
```

**Response 202 Accepted:**
```json
{
  "run_id": "0194b1ce-...",
  "status": "queued",
  "estimated_completion_at": "2026-04-20T09:02:00Z"
}
```

**Response 200 OK (cached):**
```json
{
  "run_id": "0194b1ce-...",
  "status": "completed",
  "result": { ... },
  "cached_from_run_id": "0194b1ce-..."
}
```

**Errors:**
- 400: invalid line_id / horizon out of range (1-30 days)
- 409: run_id already completed with different params (idempotency conflict)
- 429: too many concurrent runs (limit 3 per tenant)

#### GET /api/scheduler/runs/:run_id

Returns scheduler_run detail + assignments.

#### GET /api/scheduler/runs/:run_id/status

Lightweight polling endpoint, <50ms. Returns `{status, progress_pct, messages[]}`.

#### POST /api/scheduler/assignments/:assignment_id/approve

Marks assignment as accepted by Planner. Triggers `work_orders` update + outbox event.

**Body:** `{ user_id, notes? }`

#### POST /api/scheduler/assignments/:assignment_id/override

Planner overrides with manual assignment.

**Body:**
```json
{
  "user_id": "...",
  "new_line_id": "LINE-02",
  "new_planned_start_time": "2026-04-22T06:00:00Z",
  "new_shift_id": "SHIFT-A",
  "reason_code": "customer_priority|material_shortage|other",
  "reason_notes": "..."
}
```

#### POST /api/scheduler/assignments/:assignment_id/reject

Rejects assignment (WO reverts to unscheduled pool, will be re-considered on next run).

#### GET /api/scheduler/changeover-matrix

Returns current active matrix.

**Query:** `?line_id=LINE-03` (optional, returns per-line override if exists)

#### POST /api/scheduler/changeover-matrix

Admin (Planner Advanced role) updates matrix. Creates new version.

**Body:** `{ matrix: [[from_allergen, to_allergen, minutes, cleaning_req, atp_req, notes], ...], line_id?: string }`

#### POST /api/scheduler/forecasts/upload (P1 manual)

CSV upload endpoint. Multipart/form-data.

#### GET /api/scheduler/forecasts

Query forecasts with filters. `?product_id=...&week_from=2026-W17&week_to=2026-W24`

#### POST /api/scheduler/simulate (P2)

Runs scheduler in simulation mode. Does NOT commit.

#### GET /api/scheduler/forecaster/health (P2 Prophet)

Health + last retrain status.

### 8.3 API latency SLOs

| Endpoint | P50 | P95 | P99 |
|---|---|---|---|
| POST /run (queue submit) | 100ms | 500ms | 1s |
| GET /runs/:id/status | 20ms | 100ms | 200ms |
| GET /runs/:id (full detail) | 200ms | 1s | 2s |
| POST /assignments/:id/approve | 100ms | 300ms | 500ms |
| GET /changeover-matrix | 50ms | 150ms | 300ms |
| POST /forecasts/upload (1k rows) | 1s | 3s | 5s |
| GET /forecaster/health | 20ms | 100ms | 200ms |

### 8.4 Error handling per §6 D9 06-SCN pattern (consistency)

Per-severity policy:
- **block** (data integrity): invalid line_id, WO not found, solver crash → UI blocks
- **warn** (policy deviation): solver timeout → partial result with warning banner, optimizer conflict unresolvable → fallback to v1 with warning
- **info** (contextual): "3 WOs unscheduled due to capacity constraints", "forecast stale >7d"

---

## 9. Data Model

### 9.1 Entity overview

| Table | Purpose | Retention | Scale estimate |
|---|---|---|---|
| `scheduler_runs` | Run history, audit | 2 years | ~800/tenant/year |
| `scheduler_assignments` | Draft assignments pre-approval | 6 months rolling | ~20k/tenant/year |
| `changeover_matrix` | Allergen changeover time lookup | Versioned | ~256 rows (16×16) per version + per-line |
| `changeover_matrix_versions` | Version history | 5 years | ~50/tenant |
| `demand_forecasts` | Forecasts (manual P1, Prophet P2) | 3 years | ~5k/tenant/year |
| `forecast_actuals` | Actuals for SMAPE tracking | 5 years | ~2.5k/tenant/year |
| `scheduler_scenarios` (P2) | What-if snapshots | 1 year | ~200/tenant/year |

### 9.2 `scheduler_runs`

```sql
CREATE TABLE scheduler_runs (
  run_id UUID PRIMARY KEY, -- UUID v7 (R14)
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  requested_by UUID NOT NULL REFERENCES users(id),
  status scheduler_run_status NOT NULL DEFAULT 'queued', -- queued|running|completed|failed|cancelled
  horizon_days INTEGER NOT NULL CHECK (horizon_days BETWEEN 1 AND 30),
  line_ids TEXT[] NOT NULL,
  include_forecast BOOLEAN NOT NULL DEFAULT false,
  optimizer_version TEXT NOT NULL DEFAULT 'v2', -- v1=heuristic, v2=full optimizer DSL
  input_snapshot JSONB NOT NULL, -- frozen view of wos, lines, shifts, matrix at run time
  output_summary JSONB, -- {wos_scheduled, wos_unscheduled, total_changeover_minutes, utilization_avg_pct, overdue_count}
  solve_duration_ms INTEGER,
  error_message TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CONSTRAINT chk_duration_positive CHECK (solve_duration_ms IS NULL OR solve_duration_ms >= 0)
);

CREATE INDEX idx_scheduler_runs_tenant_status ON scheduler_runs(tenant_id, status, queued_at DESC);
CREATE INDEX idx_scheduler_runs_requested_by ON scheduler_runs(requested_by, queued_at DESC);

-- RLS policy
CREATE POLICY scheduler_runs_tenant_isolation ON scheduler_runs
  FOR ALL TO authenticated_users
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

### 9.3 `scheduler_assignments`

```sql
CREATE TABLE scheduler_assignments (
  assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES scheduler_runs(run_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  wo_id UUID NOT NULL REFERENCES work_orders(id),
  assigned_line_id TEXT NOT NULL, -- FK production_lines
  assigned_shift_id TEXT NOT NULL, -- FK shift_patterns
  planned_start_time TIMESTAMPTZ NOT NULL,
  planned_end_time TIMESTAMPTZ NOT NULL,
  optimizer_score NUMERIC(10,2), -- internal cost function value
  optimizer_rank INTEGER, -- 1..N within run (1 = highest priority)
  status assignment_status NOT NULL DEFAULT 'draft', -- draft|approved|rejected|overridden
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  override_original_line_id TEXT,
  override_original_start_time TIMESTAMPTZ,
  override_reason_code TEXT,
  override_reason_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scheduler_assignments_run ON scheduler_assignments(run_id, optimizer_rank);
CREATE INDEX idx_scheduler_assignments_wo ON scheduler_assignments(wo_id);
CREATE INDEX idx_scheduler_assignments_status ON scheduler_assignments(tenant_id, status);
CREATE INDEX idx_scheduler_assignments_time ON scheduler_assignments(tenant_id, planned_start_time);
```

**Business rules:**
- On approve: update `work_orders.planned_start_time`, `.assigned_line_id`, `.assigned_shift_id`; emit outbox event
- On override: keep original values in `override_original_*` for audit
- On reject: WO returns to unscheduled pool; next run will re-consider

### 9.4 `changeover_matrix`

```sql
CREATE TABLE changeover_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  version_id UUID NOT NULL REFERENCES changeover_matrix_versions(id),
  line_id TEXT, -- NULL = default (tenant-wide), specific value = per-line override
  allergen_from TEXT NOT NULL, -- allergen_code (14 EU + Mustard + 'NONE')
  allergen_to TEXT NOT NULL,
  changeover_minutes INTEGER NOT NULL CHECK (changeover_minutes >= 0),
  cleaning_required BOOLEAN NOT NULL DEFAULT false,
  atp_required BOOLEAN NOT NULL DEFAULT false,
  segregation_required BOOLEAN NOT NULL DEFAULT false, -- if true, blocks assignment (infinite cost)
  notes TEXT,
  UNIQUE (tenant_id, version_id, line_id, allergen_from, allergen_to)
);

CREATE INDEX idx_changeover_matrix_active ON changeover_matrix(tenant_id, version_id);

CREATE TABLE changeover_matrix_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  version_number INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE (tenant_id, version_number)
);

CREATE UNIQUE INDEX idx_changeover_active_per_tenant ON changeover_matrix_versions(tenant_id) WHERE is_active = true;
```

### 9.5 `demand_forecasts`

```sql
CREATE TABLE demand_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES items(id),
  week_iso TEXT NOT NULL, -- format YYYY-Www
  forecast_qty_kg NUMERIC(12,2) NOT NULL,
  forecast_qty_lower NUMERIC(12,2), -- 95% CI lower (Prophet P2)
  forecast_qty_upper NUMERIC(12,2), -- 95% CI upper (Prophet P2)
  source forecast_source NOT NULL, -- manual|prophet|d365|overridden
  model_version TEXT, -- e.g., "prophet-1.1.5"
  confidence_score NUMERIC(3,2), -- 0..1
  override_original_qty NUMERIC(12,2),
  overridden_by UUID REFERENCES users(id),
  overridden_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded_at TIMESTAMPTZ, -- NULL = current
  UNIQUE (tenant_id, product_id, week_iso, source, created_at)
);

CREATE INDEX idx_demand_forecasts_current ON demand_forecasts(tenant_id, product_id, week_iso) WHERE superseded_at IS NULL;
```

### 9.6 `forecast_actuals`

```sql
CREATE TABLE forecast_actuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  week_iso TEXT NOT NULL,
  actual_qty_kg NUMERIC(12,2) NOT NULL, -- sum from wo_outputs for week
  forecast_qty_kg NUMERIC(12,2), -- matched forecast
  smape NUMERIC(5,2), -- symmetric mean absolute percentage error
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_id, week_iso)
);
```

### 9.7 `scheduler_scenarios` (P2)

```sql
CREATE TABLE scheduler_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  baseline_run_id UUID REFERENCES scheduler_runs(run_id),
  scenario_params JSONB NOT NULL, -- {line_down: [{line_id, from, to}], add_wos: [...], remove_wos: [...]}
  result_summary JSONB NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 9.8 Outbox events emitted

- `scheduler.run.completed` — run_id, tenant_id, summary
- `scheduler.assignment.approved` — assignment_id, wo_id, planned_start_time, line_id — consumed by 08-PRODUCTION (populates WO planner metadata), 15-OEE (planned_capacity tracking)
- `scheduler.assignment.overridden` — assignment_id, override reason — consumed by 12-REPORTING (Planner override frequency KPI)
- `scheduler.changeover_matrix.updated` — version_id, changed_cells_count — audit trail
- `scheduler.forecast.uploaded` (P2) — product_id, week_iso, qty_kg — consumed by 04-PLAN (PO generator trigger)

### 9.9 Schema-driven extensions (L3)

Per ADR-028 L3, tenants can extend:
- `scheduler_runs.ext_jsonb` (custom fields per tenant, e.g., `{"customer_priority_override": 3}`)
- `scheduler_assignments.ext_jsonb` (custom fields)
- `changeover_matrix.ext_jsonb` (custom cleaning protocols per tenant)

Admin wizard in 02-SETTINGS manages L3 schema definitions.

---

## 10. Business Rules (DSL)

Per 02-SETTINGS §7 rule registry, all core rules are DSL-authored, admin read-only, dev-deployed via PR.

### 10.1 `finite_capacity_solver_v1` [UNIVERSAL]

**Type:** scheduling algorithm
**Status:** active P1

**Pseudo-DSL:**
```yaml
rule_id: finite_capacity_solver_v1
type: algorithm
implementation: python_service
service_endpoint: http://planner-solver.internal/solve
params:
  - name: greedy_priority_weights
    value:
      deadline_days_until: 0.4
      allergen_complexity: 0.3
      customer_priority: 0.2
      line_affinity: 0.1
  - name: local_search_iterations
    value: 200
  - name: local_search_acceptance_threshold_pct
    value: 2.0 # accept if cost_reduction >= 2% of current cost
  - name: timeout_seconds
    value: 60
  - name: hard_timeout_seconds
    value: 120
hooks:
  on_timeout: return_partial_with_warning
  on_crash: fallback_to_v0_round_robin
```

**Behavior:**
1. Input: unscheduled WOs + lines + shifts + changeover_matrix + wo_dependencies
2. Phase 1 greedy: sort WOs by weighted priority, iterate assign to earliest-feasible slot
3. Phase 2 local search: random-pair swap + between-line move, accept if total_cost decreases
4. Output: scheduler_assignments with optimizer_score + rank

### 10.2 `allergen_sequencing_optimizer_v2` [UNIVERSAL]

**Type:** objective function component (called by solver)
**Status:** active P1 (replaces 04-PLAN §10 v1 heuristic group-by-family)

**Pseudo-DSL:**
```yaml
rule_id: allergen_sequencing_optimizer_v2
type: objective_component
weight: 1.0 # in total cost function
params:
  - name: penalty_weight_high_risk
    value: 2.0
  - name: penalty_weight_medium_risk
    value: 1.0
  - name: penalty_weight_low_risk
    value: 0.5
  - name: penalty_weight_segregated
    value: 999999 # effectively blocks
  - name: multi_line_cross_opt_enabled
    value: true
lookup:
  source: changeover_matrix
  key: (allergen_from, allergen_to, line_id ?? DEFAULT)
returns: changeover_minutes * penalty_weight

compatibility:
  fallback_to: allergen_sequencing_heuristic_v1 # if v2 fails
  feature_flag: planning.allergen_optimizer.v2.enabled
```

**Behavior:**
1. For each pair of consecutive WOs on same line, lookup changeover_minutes from matrix
2. Multiply by risk_level penalty weight
3. Sum across all line sequences
4. Solver minimizes this component as part of total cost

### 10.3 `disposition_bridge_v1` [UNIVERSAL, P2]

**Type:** workflow decision rule
**Status:** P2, NOT active in P1

**Pseudo-DSL:**
```yaml
rule_id: disposition_bridge_v1
type: decision
phase: p2
triggers:
  - event: wo.completed
    condition: wo.item.item_type == 'intermediate'
decision_tree:
  - if: item.intermediate_disposition_mode == 'to_stock'
    then: emit_event(lp.to_stock)
  - if: item.intermediate_disposition_mode == 'direct_continue'
    then: |
      child_wo = find_child_wo_ready(wo.id)
      if child_wo:
        emit_event(lp.reserved_for_child_wo, child_wo.id)
      else:
        emit_event(lp.to_stock) # no child ready → fallback
  - if: item.intermediate_disposition_mode == 'planner_decides'
    then: |
      notification = create_notification(planner, "Decide disposition for LP", wo.output_lp)
      schedule_timeout(2h, default=to_stock)
```

### 10.4 Rule versioning

Per 02-SETTINGS §7, rules follow semver: `v1`, `v2`, `v1.1` for compatible updates. Multiple versions can coexist (A/B testing). Active version controlled by feature flag per tenant.

Current active rules for 07-EXT:
- `finite_capacity_solver_v1` (P1 active)
- `allergen_sequencing_optimizer_v2` (P1 active)
- `allergen_sequencing_heuristic_v1` (04-PLAN §10 fallback)
- `disposition_bridge_v1` (P2 planned)

---

## 11. KPIs

### 11.1 Primary KPIs

| KPI | Formula | Target | Source |
|---|---|---|---|
| Allergen changeover reduction | `1 - (this_month_changeover_min / baseline_changeover_min)` × 100% | ≥30% | `changeover_events` (08-PROD), baseline = pre-07-EXT rollout |
| Schedule adherence | `count(wo WHERE abs(started_at - planned_start_time) ≤ 2h) / count(wo)` | ≥90% | work_orders |
| Solver runtime P95 | p95(`scheduler_runs.solve_duration_ms`) | <60s | scheduler_runs |
| Scheduler acceptance rate | `count(assignment WHERE status='approved') / count(assignment)` | ≥85% | scheduler_assignments |
| Machine utilization | `sum(wo.planned_duration) / sum(available_minutes)` per line | ≥90% | scheduler_assignments + shift_patterns |

### 11.2 Secondary KPIs

| KPI | Formula | Target |
|---|---|---|
| Overtime reduction | `1 - (this_month_overtime_min / baseline)` × 100% | ≥15% |
| Intermediate WO timing gap | avg(`child_wo.planned_start - parent_wo.planned_end`) | <4h |
| Forecast SMAPE (P2) | `100 / n × sum(|F_i - A_i| / ((|F_i| + |A_i|) / 2))` | <20% |
| Planner override frequency | `count(override) / count(total_assignment)` | <15% (indicates model quality) |
| Run failure rate | `count(run WHERE status='failed') / count(total_runs)` | <2% |
| Fallback activation rate | `count(run WHERE fallback_to='v1') / count(total_runs)` | <5% |

### 11.3 Dashboard locations

- **Scheduler KPI strip** (SCR-07-01 bottom) — real-time per active run
- **12-REPORTING** — weekly/monthly trends
- **15-OEE** — machine utilization contribution
- **02-SETTINGS audit dashboard** — override frequency, rule fallback rate

### 11.4 Alerts

| Condition | Severity | Notification |
|---|---|---|
| Solver runtime >120s (hard timeout) | high | Planner + Prod Manager email |
| Run failed 3× consecutive | high | Planner + DevOps |
| Override rate >25% week rolling | medium | Planner (suggests solver tuning) |
| Forecast SMAPE >30% product-level | medium | Planner + NPD |
| Changeover matrix not updated 180d | low | Planner reminder |

---

## 12. Risks & Mitigations

| # | Risk | Severity | Probability | Mitigation |
|---|---|---|---|---|
| R1 | Heuristic solver delivers suboptimal schedules; changeover reduction <30% target | medium | medium | Empirical tracking 3mo; ADR for OR-Tools CP-SAT upgrade trigger at <20% achievement |
| R2 | Python solver service unavailable (crash, OOM) | high | low | Circuit breaker; fallback to "last known good schedule"; cached run results 24h |
| R3 | Changeover matrix drift (values outdated vs actual production reality) | medium | medium | Quarterly review reminder; KPI alert if override rate >25% (signals matrix off) |
| R4 | Planner rejects too many recommendations (low trust) | high | medium | UX transparency: show solver reasoning per assignment (why line X, shift Y); gradual rollout (1 line first, expand) |
| R5 | Allergen optimizer recommends unsafe sequence (bug in DSL rule) | critical | low | Hard guard: `segregation_required=true` creates infinite cost (blocks); 08-PROD gate rule independently validates pre-start |
| R6 | Forecast bias (P2) causing over/under procurement | medium | medium | SMAPE alert >30%; manual override UI; 04-PLAN PO reviewer final approval still required P2 |
| R7 | Disposition bridge P2 creates inventory leaks (LP stuck reserved) | high | medium | Timeout (2h default planner_decides) + cleanup job daily + monitoring dashboard |
| R8 | Solver timeout on Phase 2 scale (200 WOs × 10 lines × 14d) | high | medium | Horizon rolling window approach; pre-segment by line cluster; ADR for OR-Tools if heuristic fails at scale |
| R9 | Prophet retrain job fails silently (stale forecasts used) | medium | medium | Health endpoint + Grafana alert; stale_flag on forecast output; Planner UI shows "forecast 14d stale" warning |
| R10 | Multi-tenant RLS bypass via solver service | critical | low | Solver service receives tenant_id in request; RLS enforced at DB layer; audit log all service calls |
| R11 | Changeover matrix edit race condition (concurrent Planners) | low | low | Optimistic locking via `version_number`; conflict resolution UI |
| R12 | Scheduler assignment approved, WO cancelled before start | low | medium | On WO cancel: if assignment.status='approved', release from schedule, outbox event `scheduler.assignment.cancelled` |
| R13 | Allergen v2 DSL rule regression vs v1 heuristic | medium | low | A/B testing Phase (10% traffic v2, 90% v1, rolling lift compare); rollback via feature flag |

---

## 13. Success Criteria

### 13.1 P1 MVP done checklist

- [ ] `scheduler_runs` + `scheduler_assignments` + `changeover_matrix` tables deployed, RLS verified
- [ ] POST /api/scheduler/run end-to-end: queue → solver service → result → GanttView render
- [ ] Idempotency verified: same `run_id` within 1h returns cached result (R14)
- [ ] Greedy + local search solver implemented in Python FastAPI, containerized, deployed
- [ ] Solver P95 <60s for 50 WOs × 5 lines × 7d (load-tested)
- [ ] `allergen_sequencing_optimizer_v2` DSL rule registered in 02-SETTINGS §7, dry-run verified
- [ ] Changeover matrix seeded with 14 EU + Mustard + NONE for Apex tenant, editor functional
- [ ] Manual forecast CSV upload working, stored in `demand_forecasts`
- [ ] GanttView renders correctly as read-only visualization (no drag-drop; rescheduling via Override modal and Re-run Scheduler)
- [ ] Approve/reject/override flows end-to-end, `work_orders` updated on approve
- [ ] Outbox events emit: `scheduler.assignment.approved`, `scheduler.run.completed`
- [ ] Feature flag `planning.allergen_optimizer.v2.enabled` supports rollback to v1 heuristic
- [ ] Scheduler run history page (SCR-07-04) functional
- [ ] 3 months production run data: changeover reduction ≥30% vs baseline (04-PLAN v1 heuristic)

### 13.2 P2 MVP done checklist

- [ ] Prophet microservice `forecaster` deployed
- [ ] Daily retrain job stable (30-day uptime)
- [ ] Forecast SMAPE <20% on top-20 SKUs (rolling 30d)
- [ ] Forecast-driven PO generation trigger (04-PLAN §5) integrated
- [ ] `disposition_bridge_v1` DSL rule active for flagged items (shelf_life_hours ≤ 24)
- [ ] What-if simulation (SCR-07-05) functional
- [ ] Auto-approval policy per tenant config, metrics show <5% false auto-approval
- [ ] Overall changeover reduction sustained ≥30%, utilization ≥90%

### 13.3 Quality gates (before P1 go-live)

- Code review by 04-PLANNING module owner + 02-SETTINGS rule registry owner
- Security review: RLS, solver service auth, PII in input_snapshot
- Performance load test: 50 WOs × 5 lines × 7d scenario
- Planner Advanced UAT (Apex Monika) 2-week parallel run (v1 heuristic vs v2 optimizer side-by-side)
- Data migration plan: existing 04-PLAN WOs with planned_start_time preserved, new runs override only unscheduled

---

## 14. Build Sequence

Build order: 07-a → 07-b → (07-c P2) → (07-d P2). 07-a and 07-b in P1 critical path, 07-c and 07-d P2.

### 14.1 07-a Finite-Capacity Engine (4-5 sesji)

**Stories:**
- SC-07-a-01: Scaffold Python solver service (FastAPI, Dockerfile, health endpoint)
- SC-07-a-02: `scheduler_runs` + `scheduler_assignments` tables, RLS policies, migrations
- SC-07-a-03: POST /api/scheduler/run endpoint (Next.js) + queue to solver (BullMQ or Postgres listen/notify)
- SC-07-a-04: Greedy assignment algorithm in solver service
- SC-07-a-05: Local search refinement algorithm
- SC-07-a-06: Idempotency implementation (UUID v7, 1h cache)
- SC-07-a-07: Status polling endpoint + WebSocket notification (optional)
- SC-07-a-08: GanttView component (day/hour toggle, WO blocks, read-only; click-to-side-panel; [Reschedule WO] entry point) [drag-drop DESCOPED, decision 2026-04-21]
- SC-07-a-09: Approve/reject/override endpoints + UI actions
- SC-07-a-10: Outbox event emitters (`scheduler.run.completed`, `scheduler.assignment.approved`)
- SC-07-a-11: Scheduler Run History page (SCR-07-04)
- SC-07-a-12: E2E test: full run → approve → WO updated

**Dependencies:** 04-PLAN table scheduler — WO must have `planned_start_time`, `.assigned_line_id`, `.assigned_shift_id` columns (04-PLAN already has these per §7.2).

### 14.2 07-b Allergen Optimizer (3-4 sesji)

**Stories:**
- SC-07-b-01: `changeover_matrix` + `changeover_matrix_versions` tables
- SC-07-b-02: Seed script for 14 EU + Mustard + NONE matrix for Apex default
- SC-07-b-03: ChangeoverMatrixEditor screen (SCR-07-02) with heatmap + cell editor
- SC-07-b-04: Per-line override UI (tab 2)
- SC-07-b-05: CSV import/export
- SC-07-b-06: Matrix versioning + active flag + history view
- SC-07-b-07: DSL rule `allergen_sequencing_optimizer_v2` registered in 02-SETTINGS §7
- SC-07-b-08: Solver integration: call rule as objective function component
- SC-07-b-09: Feature flag `planning.allergen_optimizer.v2.enabled` (default false, rollout per tenant)
- SC-07-b-10: Fallback to v1 heuristic on rule error, alert generation
- SC-07-b-11: Dry-run mode (preview schedule without commit)
- SC-07-b-12: E2E test: matrix edit → new run → changeover minutes reflected correctly

**Dependencies:** 02-SETTINGS §7 rule registry (ready), 03-TECH §10 allergens (ready).

### 14.3 07-c Forecast Bridge (4-5 sesji) [P2]

**Stories:**
- SC-07-c-01: `demand_forecasts` + `forecast_actuals` tables
- SC-07-c-02: ForecastUpload screen (SCR-07-03), manual CSV (P1 subset bridge)
- SC-07-c-03: Prophet Python microservice scaffold (FastAPI, Prophet library, model persistence)
- SC-07-c-04: Daily retrain job (cron 01:00 UTC)
- SC-07-c-05: Prophet inference endpoint (POST /forecast {product_id, horizon_weeks})
- SC-07-c-06: Forecast output → `demand_forecasts` write with model_version, confidence_score
- SC-07-c-07: Forecast vs actual computation job (weekly)
- SC-07-c-08: SMAPE dashboard (12-REPORTING integration)
- SC-07-c-09: Forecast-driven PO generation trigger (04-PLAN §5 integration)
- SC-07-c-10: Solver integration: include_forecast=true uses forecasts as demand signal
- SC-07-c-11: Manual override UI (modify specific forecast cells)
- SC-07-c-12: Alert: SMAPE >30% product-level, model drift detection

**Dependencies:** 04-PLAN §5 PO generation logic (ready), historical data (wo_outputs or D365 pull ready).

### 14.4 07-d Disposition Bridge (3-4 sesji) [P2]

**Stories:**
- SC-07-d-01: Add `items.intermediate_disposition_mode` ENUM column (default 'to_stock')
- SC-07-d-02: DSL rule `disposition_bridge_v1` in 02-SETTINGS §7
- SC-07-d-03: Event handler on `wo.completed`: route to disposition decision
- SC-07-d-04: `direct_continue` flow: reserve parent output LP for child WO
- SC-07-d-05: `planner_decides` flow: notification + modal + timeout 2h → fallback to_stock
- SC-07-d-06: Reservation handoff: update `lp.status`, `wo_material_reservations`
- SC-07-d-07: Cancel handoff: child WO cancel → parent LP revert available
- SC-07-d-08: Cleanup job: orphaned reserved LPs >24h → alert + auto-release
- SC-07-d-09: UI: disposition column on item master (03-TECH)
- SC-07-d-10: UI: Planner decision modal
- SC-07-d-11: E2E test: direct_continue flow happy path + cancel + timeout

**Dependencies:** 04-PLAN §8.5 disposition P1 baseline (ready to_stock only), 05-WH §10 intermediate LP (ready).

### 14.5 Build estimate summary

| Sub-module | P1/P2 | Stories | Est. sesji |
|---|---|---|---|
| 07-a Finite-Capacity | P1 | 12 | 4-5 |
| 07-b Allergen Optimizer | P1 | 12 | 3-4 |
| 07-c Forecast Bridge | P2 | 12 | 4-5 |
| 07-d Disposition Bridge | P2 | 11 | 3-4 |
| **Total 07-EXT** | — | **47** | **14-18** |

---

## 15. Dependencies & Integration

### 15.1 Upstream dependencies (inputs to 07-EXT)

| Source | Data | Consumed in 07-EXT |
|---|---|---|
| 04-PLAN §7 | work_orders (DRAFT state, unscheduled) | Solver input |
| 04-PLAN §8.4 | wo_dependencies (intermediate cascade DAG) | Solver respects precedence |
| 04-PLAN §9 | wo_material_reservations (P2 disposition bridge) | 07-d integration |
| 03-TECH §5 | items.allergen_profiles | Allergen optimizer input |
| 03-TECH §8 | routings + routing_operations | Duration calculation |
| 03-TECH §10 | Allergen cascade rules | Informs changeover matrix seeding |
| 02-SETTINGS §7 | Rule registry DSL | `finite_capacity_solver_v1`, `allergen_sequencing_optimizer_v2`, `disposition_bridge_v1` |
| 02-SETTINGS §8 | Reference tables (production_lines, shift_patterns) | Solver input |
| 02-SETTINGS §14 | Feature flags | Rollout control |
| D365 (P2) | Sales history | Prophet training data |
| wo_outputs (05-WH + 08-PROD) | Historical production | Forecast actuals, training data |

### 15.2 Downstream consumers (07-EXT outputs)

| Consumer | Data | Consumption pattern |
|---|---|---|
| 08-PROD | `scheduler.assignment.approved` event | Populates WO planner metadata, informs operator dashboard |
| 15-OEE | Planned capacity vs actual | Utilization KPIs |
| 12-REPORTING | Override frequency, SMAPE, changeover trends | Analytics dashboards |
| 04-PLAN | Forecast-driven PO (P2) | Triggers PO generator |
| 09-QUALITY | (P2) Allergen changeover gate handoff | Cross-reference scheduler matrix |

### 15.3 External system integration

**D365 (LEGACY-D365, via 02-SETTINGS §11 + 13-INTEGRATIONS stage 2):**
- P1: none direct (manual CSV for forecast)
- P2: Sales history pull for Prophet training (via 13-INTEGRATIONS stage 3 scoped)

**No direct external APIs P1.**

### 15.4 Cross-module consistency checks

Validation rules enforcing consistency:
- V-SCHED-01: `scheduler_assignment.planned_end_time` - `planned_start_time` must match `routing_operations.expected_duration_sum` ±5%
- V-SCHED-02: `scheduler_assignment.assigned_line_id` must have allergen compatibility per `production_lines.allergen_constraints` + `items.allergen_profiles`
- V-SCHED-03: Intermediate child WO `planned_start_time` >= parent WO `planned_end_time` (cascade DAG respect)
- V-SCHED-04: No two WOs overlap on same `(line_id, time_window)` — hard constraint
- V-SCHED-05: Changeover block inserted between WOs if `allergen_from != allergen_to` on same line
- V-SCHED-06: Changeover minutes >= lookup value in `changeover_matrix`
- V-SCHED-07: Approved scheduler_assignment requires `users.role IN ('planner_advanced', 'scheduling_officer')`
- V-SCHED-08: Override reason_code required if `override_original_* IS NOT NULL`
- V-SCHED-09: Forecast (P2) `week_iso` must be within retention window (3y)
- V-SCHED-10: Disposition bridge (P2) triggered only if `items.shelf_life_hours <= 24`

---

## 16. Changelog + Open Items

### 16.1 Version history

| Version | Date | Author | Summary |
|---|---|---|---|
| 3.0 | 2026-04-20 | C3 Sesja 1 | Greenfield. Absorbs 04-PLAN v3.1 deferred items. 16 sections, 5 decisions, 4 sub-modules build. |

### 16.2 Resolved decisions (all OQ-EXT items closed 2026-04-21)

All P1 open questions resolved 2026-04-21. No blockers remain.

| ID | Original Question | Resolution | Date | Status |
|---|---|---|---|---|
| OQ-EXT-01 | Exact penalty weight values for allergen risk levels (2.0 / 1.0 / 0.5) — empirical calibration required | Seed values accepted for prototype and UAT. Calibration after 30-day P1 run. | 2026-04-21 | CLOSED |
| OQ-EXT-02 | Operator shift preference (P2) — no overlay in P1 GanttView | Remains P2. No overlay in P1 GanttView. | 2026-04-21 | CLOSED (deferred P2) |
| OQ-EXT-03 | What-if simulation baseline scope — in-flight WOs included? | Remains P2; no decision needed now. | 2026-04-21 | CLOSED (deferred P2) |
| OQ-EXT-04 | Blocked cells in changeover matrix — allow note + admin review request? | Planner CAN add note/justification and request admin review via `[Request Review]` button on blocked cells. Creates `matrix_review_request` record (PRD to define table). | 2026-04-21 | CLOSED |
| OQ-EXT-05 | GanttView drag-drop — descoped or retained? | **DESCOPED.** Gantt is read-only visualization. Rescheduling via `[Re-run Scheduler]` (global) or MODAL-07-03 Assignment Override (per-WO, with `[Reschedule WO]` entry in side panel). Rationale: 1-FA-to-1-line dominance; `fa_line_compatibility` eligibility lookup has low UX value as drag target. | 2026-04-21 | CLOSED |
| OQ-EXT-06 | `[Approve All]` scope — most recent run or all completed runs? | Approves assignments from ALL completed runs. UI shows run grouping. | 2026-04-21 | CLOSED |
| OQ-EXT-07 | Disposition bridge timeout (MODAL-07-04) — can Planner extend per LP? | Planner CAN extend per LP via inline `[Extend 1h]` / `[Extend 4h]` buttons with mandatory reason. Default 2h stays. | 2026-04-21 | CLOSED |
| OQ-EXT-08 | Changeover matrix edit approval workflow — dual sign-off? | Single Planner Advanced publish (no dual sign-off). | 2026-04-21 | CLOSED |
| OQ-EXT-09 | SCR-07-06 dry-run persistence — new `scheduler_run` record or separate store? | Creates row in `scheduler_runs` with `run_type='dry_run'`, `status='preview'`, auto-expires 24h. `[Commit Preview]` converts to regular run; `[Discard]` marks as discarded. Visible in Run History with `dry_run` filter. | 2026-04-21 | CLOSED |
| OQ-EXT-10 | KPI strip "Total Changeover" — approved schedule or draft solver run? | Sum from approved schedule (not draft solver run). | 2026-04-21 | CLOSED |

### 16.3 Changes from Phase D numbering

Prior to Phase D, planning content was consolidated in single PRD `04-PLANNING-PRD.md` (pre-Phase-D archive). Phase D split into:
- **04-PLANNING-BASIC** (v3.0/v3.1) — PO/TO/WO lifecycle, intermediate cascade DAG core, basic heuristic sequencing
- **07-PLANNING-EXT** (v3.0 this document) — advanced scheduling, optimizer, forecasting, disposition bridge

07-EXT is a greenfield write from Phase C3 Sesja 1. No baseline to carry forward.

### 16.4 Validation rules index (V-SCHED-*)

10 rules defined in §15.4. Detailed implementation spec in build phase.

### 16.5 Marker usage summary

- **[UNIVERSAL]** — 85% of features (solver, optimizer, matrix structure, forecasting model, disposition modes)
- **[APEX-CONFIG]** — Apex-specific initial config: 5 lines, 14 EU + Mustard allergens seed, 2 shifts, Planner = Monika
- **[EVOLVING]** — Q2+ items (Prophet, disposition bridge, what-if sim, auto-approval)
- **[LEGACY-D365]** — Sales history pull for Prophet (P2), 13-INTEGRATIONS stage 3 scope

### 16.6 References

- **04-PLANNING-BASIC-PRD.md** v3.1 (parent PRD, §7/§8/§10/§11 carry-forward points)
- **03-TECHNICAL-PRD.md** v3.0 §5.2 (allergen profiles), §10 (cascade rule)
- **02-SETTINGS-PRD.md** v3.0 §7 (rule registry), §8 (reference tables), §14 (feature flags)
- **05-WAREHOUSE-PRD.md** v3.0 §10 (intermediate LP flow — consumer of 07-d output)
- **00-FOUNDATION-PRD.md** v3.0 §4 (module map), R14 (idempotency), R15 (GS1)
- **_foundation/research/MES-TRENDS-2026.md** §3 (scheduling research), §9 (per-module rollups), R1 (event-first), R12 (AI/ML), R13 (schema AI-ready)
- **ADR-028** (schema-driven columns L3), **ADR-029** (rule engine DSL), **ADR-031** (schema variation per org)
- **SCANNER-PROTOTYPE (2).html** — referenced for UI consistency (shared design tokens)

### 16.7 Next sessions

- **C3 Sesja 2:** 08-PRODUCTION v3.0 (WO execution + INTEGRATIONS stage 2 inline)
- **C4 Sesja 1-3:** 09-QUALITY + 10-FINANCE + 11-SHIPPING
- **C5 Sesja 1-3:** 12-REPORTING + 13-MAINTENANCE + 14-MULTI-SITE + 15-OEE

---

## Appendix A — Sample Solver Run

**Input (simplified):**
- 10 WOs: 5× allergen-free FA, 3× contains-mustard FA, 2× contains-egg FA
- 3 lines: LINE-01 (fresh, no allergen), LINE-03 (breaded, egg ok), LINE-04 (marinated, mustard ok)
- Horizon: 7 days, 2 shifts/day

**Greedy output:**
- LINE-01: 5× allergen-free (sequenced to minimize duration variance)
- LINE-04: 3× mustard WOs grouped (single changeover into mustard, cleanup after last)
- LINE-03: 2× egg WOs grouped

**Local search refinement:**
- Moves 1 allergen-free WO from LINE-01 to LINE-03 (LINE-01 overloaded day 3)
- Swaps order of 2 mustard WOs to put shorter one first (reduces overdue penalty)

**Result:**
- Total changeover minutes: 105 (vs v1 heuristic baseline 160) — 34% reduction
- Schedule adherence: 100% on-time
- Utilization: LINE-01 88%, LINE-03 72%, LINE-04 94%
- Solver runtime: 18s (well below 60s target)

---

## Appendix B — Feature flag matrix

| Flag | Default | P1/P2 | Owner |
|---|---|---|---|
| `planning.allergen_optimizer.v2.enabled` | false | P1 | Planner role |
| `planning.finite_capacity_solver.enabled` | true | P1 | System |
| `planning.forecast.prophet.enabled` | false | P2 | System (prod) |
| `planning.disposition_bridge.enabled` | false | P2 | System (prod) |
| `planning.what_if_simulation.enabled` | false | P2 | System (prod) |
| `planning.auto_approval.enabled` | false | P2 | Admin |
| `planning.solver.timeout_seconds_override` | 60 | P1 | DevOps |

---

**End of 07-PLANNING-EXT-PRD.md v3.1**

# Forward-Looking PLAN/TASK Audit — Production & Planning Backbone

**Modules:** 04-planning-basic, 07-planning-ext, 08-production
**Mode:** READ-ONLY (no code touched). Goal = make the task set CLEAR + complete BEFORE build.
**Date:** 2026-06-04 | **Auditor:** sidecar audit agent
**Reality baseline:** all 3 modules ⬜ NOT STARTED (0/66, 0/58, 0/56 implemented per each `STATUS.md` 2026-06-02 reality pass).

Proposed task stubs live in `_meta/runs/sidecar/proposed-tasks/` (m04-*, m07-*, m08-*).

---

## TL;DR verdict

| Module | Tasks | Reality | Clarity verdict |
|---|---|---|---|
| 04-planning-basic | 66 (T-001..T-066) | 0 done | **Buildable after 4 fixes** — strong PRD↔task↔prototype trace; blocked on `src/` path remap, a missing RBAC grant-seed, an out-of-PRD MRP task (T-045), and upstream 03-TECH/05-WH gaps. |
| 07-planning-ext | 58 (T-001..T-058) | 0 done | **NOT yet buildable** — same `src/` path bug; **no RBAC wiring task at all**; **no RBAC grant-seed**; **solver hosting/deploy task missing**; **solver dispatch mechanism (NOTIFY) diverges from canonical outbox/worker primitive**. |
| 08-production | 56 (T-001..T-056) | 0 done | **Cleanest of the three** — gold-standard tasks, correct paths, OEE/state-machine/genealogy cores all captured; missing only an RBAC grant-seed; gated behind unbuilt 03-TECH T-080/T-081, 05-WAREHOUSE (entire), 09-QUALITY T-064. |

The three modules collectively share **one systemic, high-impact preventive defect: no permission-grant seed task exists in any of them** (only enum-string-add tasks). This is the exact "unreachable feature" class that bit 02-settings. See cross-cutting finding X-1.

---

## Cross-cutting findings (apply to all 3 modules)

### X-1 — RBAC grant-seed MISSING in all three modules (HIGH — "unreachable feature" class)
- **Evidence:** Each module has only an enum-string-add task: 04 `T-066` (15 `planning.*` strings), 07 `T-058` (11 `scheduler.*`), 08 `T-056` (17 `production.*`). 04 also has `T-033` (wire `assertPermission` reading the role→permission matrix). **None** has a `*-permission-seed.sql` migration task that GRANTS those strings to roles.
- **Why it bites:** The canonical pattern in this repo is a seed migration — `packages/db/migrations/146-npd-allergen-write-permission-seed.sql`, `148-settings-infra-permission-seed.sql`, `116-gdpr-erasure-permission-seed.sql`. Without one, every page/Server Action that calls `assertPermission(...)` denies by default → pages render in nav (nav is currently ungated, see X-2) but throw `Forbidden` on load/action. Identical failure mode to the 02-settings authorization-policy bomb (see memory `settings-module-signoff`).
- **Fix:** add one grant-seed task per module → `m04-rbac-grant-seed.md`, `m07-rbac-grant-seed.md`, `m08-rbac-grant-seed.md`. 07 additionally needs an RBAC-WIRING task (see 07-F2).

### X-2 — Nav reachability is OK (preventive note, not a gap)
- `apps/web/lib/navigation/app-nav.ts` already lists `planning-basic`, `planning-ext`, `production` in the `operations` group (Wave 0 skeleton). All three are sidebar-reachable.
- BUT nav is intentionally **ungated** today: every item has `permission_key: null` + `RBAC_TODO = "UI-128 keeps navigation ungated; wire permission_key in the future RBAC module."` So the reachability risk is **not** the sidebar — it's the page/action gates (X-1). When perms are eventually wired into nav, the grant-seed (X-1) must already exist or items vanish.

### X-3 — `src/`-prefixed scope_files in 04 + 07 (MEDIUM — every task mis-paths the repo)
- **04** and **07** task `scope_files`/prompts use `src/db/...`, `src/app/...`, `apps/web/src/app/...`. This monorepo has **no `src/` layer**. Correct roots: `packages/db/` (schema+migrations), `apps/web/app/[locale]/(app)/(modules)/<module>/` (pages), `apps/web/components/<module>/` (components), `packages/api-services/<module>/` or `apps/web/app/.../_actions/` (server logic). Both `STATUS.md` files already flag this.
- **08** is the exception — its tasks already use correct paths (`packages/api-services/production/...`, `apps/web/app/api/...`). Use 08 as the path template when remapping 04/07.
- **Fix:** a one-shot consolidation pass (kira:consolidate normalize) over 04+07 `scope_files`. Not a new feature task, but MUST run before build. Captured as `m04-07-path-remap.md`.

### X-4 — Upstream dependency readiness (the real start-gate)
| Upstream dep | Owner | Status | Blocks |
|---|---|---|---|
| Factory release read-model | 01-NPD T-097 | ✅ DONE (mig 125, 2026-06-04) | unblocks the *producer* side |
| FactorySpec+BOM approval API | 03-TECH T-080 | ⬜ NOT STARTED | 04 T-001, 08 T-001 |
| Technical release adapter | 03-TECH T-081 | ⬜ NOT STARTED | 04 T-001, 07 T-055, 08 T-001 |
| WO consume gate (`v_active_holds`) | 09-QUALITY T-064 | ⬜ NOT STARTED (`packages/server/` absent — flagged HIGH RISK) | 08 T-023, T-024 |
| LP / genealogy / reservations / consume-to-WO / put-away | 05-WAREHOUSE | ⬜ ENTIRE MODULE NOT STARTED | 04 T-015/T-016 (TO ship/receive, LP picker); 08 T-023..T-031 (consume, output→LP, genealogy) |
| Infra registry (machines/lines/warehouses), authorization policies | 02-SETTINGS T-009/T-029/T-122/T-126 | ✅ DONE | 04/08 line/machine refs ready |
- **Verdict:** 03-TECH T-080/T-081 is the single hard gate for all three modules' *entry-point* task. 05-WAREHOUSE being 100% unbuilt is the largest latent risk for 04-TO + all of 08-consume/output. These are correctly recorded as `cross_module_dependencies` (not invalid root deps) in the task JSONs.

### X-5 — Build-readiness (skills + prototypes) = GOOD across all three
- Skills present and current: `MON-domain-planning` (covers 04+07, canonical-ownership aware, `schedule_outputs` ≠ `wo_outputs`), `MON-domain-production` (canonical `wo_outputs`/`oee_snapshots` producer rules locked). No skill gaps.
- Prototypes present for all three: `prototypes/design/Monopilot Design System/{planning,planning-ext,production}/*.jsx` + label indexes `_meta/prototype-labels/prototype-index-{planning,planning-ext,production}.json` + master-index + translation-notes. UI tasks carry valid literal anchors (both STATUS files verified anchors). No prototype gaps.

---

## Module 04 — planning-basic

**Tasks:** 66 (T-001..T-066). Schema 7 · API/services ~24 · seed 1 · wiring-test 1 · UI 32. Coverage.md maps PRD §1–§16 → tasks with a full UI surface table (PLN-001..PLN-051). Self-declared 95%+ readiness.

### Task completeness vs PRD
PRD §1–§16 coverage is **essentially complete** — PO/TO/WO lifecycle, BOM snapshot, cascade DAG, cycle detection, hard-lock reservation, allergen sequencing heuristic, finite-capacity stub, D365 SO pull, dashboard, settings, suppliers all tasked. No P1 PRD feature is un-tasked.

**Findings:**
- **04-F1 (MEDIUM, scope drift):** `T-045 — Material Demand dashboard (MRP netting + reorder_thresholds)` introduces an **MRP-min-viable feature + a new `reorder_thresholds` table that the PRD explicitly DEFERS.** PRD §"Decyzje odroczone" (lines 186–187) lists "MRP/MPS basic calculation engine" and "Auto-replenishment rules (reorder points)" as out-of-scope. The task itself even admits the anchor is synthetic: `"corrected §MRP-gap to nearest real heading"` and points `prd_refs` at "§4 (was §MRP-gap)". The task is *well-authored* (clear AC, red-lines, no caching, opens existing PO wizard) — but it adds un-PRD'd schema and netting logic. **Decision needed:** either (a) accept as an approved scope addition and add the PRD section, or (b) defer T-045 to P2 with the rest of MRP. Do not let it ship silently as "PRD coverage."
- **04-F2 (LOW, vague-ish):** `T-026 — Finite-capacity scheduling stub (greedy)` is a deliberate stub whose "real" engine is 07. Acceptable, but its acceptance criteria should explicitly state it is a placeholder writing `scheduled_start_time` only, to avoid an implementer over-building the 07 solver here. Flag for AC tightening, not a new task.
- **04-F3 (LOW):** `T-060` ref-string for ship/receive modals is malformed in the JSON (STATUS notes actual lines 852–931 + 1341–1474 in `modals.jsx`). Cosmetic; fix during path-remap pass.

### Missing logic / inconsistency (algorithmic cores)
All present and tasked: cascade DAG generation (T-019, with full pseudo-algorithm in PRD §8.4), **cycle detection** (T-020, DFS/topological, V-PLAN-WO-005 hard-block), hard-lock reservation exclusivity (T-021/T-024, V-PLAN-WO-008), allergen sequencing heuristic (T-025, V-PLAN-SEQ), WO/PO/TO state machines as DSL rules (T-007), idempotent cascade (V-PLAN-WO-006). NUMERIC money fields are in scope per schema tasks. **No missing algorithmic core.**

### Cross-module dependency table
| Direction | Item | Owner / Consumer | Status |
|---|---|---|---|
| IN | factory release read-model (status/active_bom/active_spec/blockers) | 01-NPD T-097 → 04 T-001 | ✅ owner DONE; 04 T-001 also needs 03-TECH T-080/T-081 ⬜ |
| IN | items, BOM versioning, allergen cascade, catch-weight | 03-TECHNICAL §5–§10 | ⬜ (T-080/T-081 gate) |
| IN | LP availability, FEFO suggestion, put-away | 05-WAREHOUSE (contract) | ⬜ entire module |
| IN | infra registry, rule registry, schema-driven ext cols, D365 consts | 02-SETTINGS §6/§7/§11/§12 | ✅ DONE |
| OUT | **`schedule_outputs`** (planning projection) | 04 T-005 → consumed by 08 | canonical owner = planning ✅ correct |
| OUT | `wo_dependencies`, `wo_material_reservations`, WO snapshot | 04 → 08 runtime | correct |
| OUT | `planning.*` outbox events | 04 T-032 → 08/06/12 | correct |
- **Canonical-owner check:** ✅ `schedule_outputs` owned by 04 (T-005); 04 does **NOT** create `wo_outputs` (confirmed in coverage.md §"Canonical wo_outputs ownership" + skill). No crossing.

### RBAC / reachability — see X-1 (grant-seed missing), X-2 (nav OK). 04 has the wiring task (T-033) but not the grant-seed.

### Build-readiness — skill ✅, prototypes ✅ (39 labels). Only blocker = X-3 path remap.

---

## Module 07 — planning-ext

**Tasks:** 58 (T-001..T-058). Schema 13 · seed 2 · API/solver 18 · UI 23 · test 2. Self-declared 96%+ readiness.

### Task completeness vs PRD
PRD surface coverage (scheduler runs/assignments, changeover matrix + versions + drafts + diff, forecasts, scenarios, DSL rules, all SCR-07/PLE screens) is **complete on the feature inventory**. Gaps are in *enabling infrastructure*, not features.

**Findings:**
- **07-F1 (HIGH, missing task):** **No solver hosting/deployment task.** PRD §285 (Tech architecture): *"Solver runs in Python microservice — NOT in main Next.js app… deployed separately, scaled independently."* `T-021` only scaffolds the service (`services/planner-solver/` code + Dockerfile). `T-012` dispatches to it. **Nothing wires up WHERE it runs.** The deploy target is Vercel + Supabase — Vercel cannot host a long-running FastAPI container. There is no Fly/Render/Cloud-Run/Railway provisioning task, no env-var contract (solver URL/secret) task, no health-probe/circuit-breaker integration task on the Next.js side. → **propose `m07-solver-hosting.md`.** (The grep "deploy" hits in 07 tasks are all matrix-version *publish*, unrelated.)
- **07-F2 (HIGH, missing task):** **No RBAC-wiring task** (07 has no equivalent of 04's T-033). 07 gates endpoints on roles (`Planner Advanced`, `Scheduling Officer`) inside individual API task prompts, but there is no single task that asserts the `scheduler.*` matrix is wired + tested across all routes/pages. Combined with the missing grant-seed (X-1), 07's authorization is the least-covered of the three. → **propose `m07-rbac-grant-seed.md`** (grant) **+ tighten** the requirement into a wiring task (note in stub).
- **07-F3 (HIGH, mechanism inconsistency):** **Solver dispatch diverges from the canonical outbox/worker primitive.** `T-012` dispatches via `NOTIFY 'scheduler_solver'` (Postgres LISTEN/NOTIFY) and `T-021` builds `app/listener.py` doing Postgres LISTEN. But foundation already shipped the canonical async path: `apps/worker` + outbox + queue (00-FOUNDATION **T-111 ✅ DONE, T-112 ✅ DONE**). LISTEN/NOTIFY (a) does not survive Vercel serverless invocation boundaries, (b) has no DLQ/retry/idempotency story vs the outbox the rest of the system uses, (c) creates a second, parallel async mechanism. `T-024` adds run-level idempotency but not delivery durability. → **propose `m07-solver-dispatch-reconcile.md`** (decision + reconcile to outbox-or-documented-exception).
- **07-F4 (LOW):** Several UI tasks (T-042..T-052, capacity/settings/rules/scenarios) have thinner UX prose than the matrix/gantt tasks — coverage.md acknowledges this ("Dedicated UX prose sections for capacity/settings/rules" listed as intentional gap). Acceptable for P1 since prototype anchors exist; flag for AC enrichment only.

### Missing logic / inconsistency (algorithmic cores)
**Captured:** greedy weighted-priority assignment (T-022: deadline 0.4 / allergen 0.3 / customer 0.2 / line-affinity 0.1, respecting capacity + shifts + DAG), local-search refinement (T-023: swap/move), finite_capacity_solver_v1 + allergen_sequencing_optimizer_v2 as DSL rules (T-025/T-026), changeover matrix 3-stage CSV import state machine (T-039 + V-CM-01..04), idempotency (T-024). **Algorithmic cores are well-specified.** The gaps (F1/F3) are *operational/infra*, not algorithmic.

### Cross-module dependency table
| Direction | Item | Owner / Consumer | Status |
|---|---|---|---|
| IN | WO read-model + active snapshot IDs (solver input) | 04 T-001 → 07 T-021/T-055 | ⬜ (04 T-001 gated by 03-TECH) |
| IN | factory release posture guard | 01-NPD T-097 + 03-TECH T-081 | T-097 ✅, T-081 ⬜ |
| IN | async/long-running host contract | 00-FOUND T-111 (`apps/worker`) | ✅ DONE (but solver is Python — see F1/F3) |
| IN | DSL rule registry | 02-SETTINGS §7 | ✅ DONE |
| OUT | **`schedule_outputs`** assignment results / scheduler_assignments | 07 → 04/08 (planning domain) | planning-owned ✅ no crossing |
| OUT | `scheduler.run.completed`, `assignment.approved`, `matrix.version.published` outbox | 07 T-028/T-029 → consumers | correct |
- **Canonical-owner check:** ✅ 07 stays in the planning domain (`scheduler_*`, `changeover_matrix*`, `demand_forecasts`). Does **not** touch `wo_outputs` or `oee_snapshots`. No crossing.

### RBAC / reachability — WORST of the three: missing grant-seed (X-1) AND missing wiring task (07-F2). nav OK (X-2).

### Build-readiness — skill ✅ (shared MON-domain-planning), prototypes ✅ (25 labels). Blockers = X-3 path remap + F1 (no host) + F3 (dispatch).

---

## Module 08 — production

**Tasks:** 56 (T-001..T-056). Schema 10 · matview 1 · DSL rules 3 · API/services 31 · UI 6 · E2E 4 · RBAC-enum 1. Coverage.md is the most rigorous (Epic E1–E7 mapping, contradiction log, 16-task gold-standard re-author). Paths already correct.

### Task completeness vs PRD
PRD §1–§16 + all 13 SCR + 15 MODAL contracts are mapped to tasks (coverage.md §"PRD/UX/prototype traceability"). Deprecated `release_wo_modal` correctly excluded. `tweaks_panel` correctly flagged non-P1. **No P1 feature un-tasked.**

**Findings:**
- **08-F1 (LOW, AC consolidation):** UI work is compressed into 6 large tasks (T-046..T-051) each covering several SCR + MODAL surfaces (e.g. T-050 = shifts + analytics hub + settings + line detail + 4 modals). These are big; they carry parity policy + evidence, but an implementer may under-deliver a sub-screen. Not a missing task — flag for possible split during kira:plan if a wave runs long.
- **08-F2 (informational, not a gap):** **cost-per-kg is NOT produced in 08.** The `MON-domain-production` skill description says "Critical: cost-per-kg producer," but the PRD delegates WIP/yield **costing** to **10-FINANCE** (PRD lines 8, 2075, 2264: "Stage 5 financial sync (P2, in 10-FINANCE)"). 08 produces the *inputs* (`wo_outputs`, `wo_material_consumption`, `wo_waste_log`) that finance consumes. **No costing task is missing from 08** — correct boundary. (Minor skill-description overstatement; not a task gap.)

### Missing logic / inconsistency (algorithmic cores)
**All captured:** WO state machine as DSL rule (T-012 `wo_state_machine_v1` YAML), closed_production_strict + output_yield_gate + allergen_changeover_gate DSL rules (T-013/T-014/T-034), optimistic locking on `wo_executions` (T-022), R14 idempotency helper (T-015), over-consumption 409+approval (T-024, dep 09-QUALITY T-064 correctly recorded), genealogy writes on consume + output (T-025/T-031), FEFO compliance + deviation (T-026), catch-weight variance (T-032), **OEE per-minute A×P×Q aggregation with exact formulas + idempotent upsert + SSE** (T-044), D365 JournalLines anti-corruption adapter + DLQ (T-041/T-042). NUMERIC precision + V-PROD-24 unique-per-org-per-year enforced. **No missing core.**

### Cross-module dependency table
| Direction | Item | Owner / Consumer | Status |
|---|---|---|---|
| IN | factory release read-model + WO snapshot | 01-NPD T-097 + 04 T-001 (+ 03-TECH T-080/T-081) | T-097 ✅, T-080/T-081 ⬜, 04 T-001 ⬜ |
| IN | **`schedule_outputs`** (projected → `wo_outputs` at WO start) | 04 T-005 → 08 T-003/T-028 | correct, 04 unbuilt |
| IN | LP consume/output/genealogy/put-away | 05-WAREHOUSE | ⬜ entire module (largest risk) |
| IN | WO consume hold gate (`v_active_holds`) | 09-QUALITY T-064 | ⬜ HIGH RISK |
| IN | scanner execute/consume/output flows | 06-SCANNER-P1 | (P1 scanner module) |
| IN | infra registry, rule registry, D365 code map | 02-SETTINGS | ✅ DONE |
| OUT | **`wo_outputs`** (CANONICAL OWNER) | 08 T-003 → 10-FINANCE/12-REPORTING | ✅ correct, owner-locked |
| OUT | **`oee_snapshots`** (SOLE PRODUCER, D-OEE-1) | 08 T-044 → 15-OEE (read-only) | ✅ correct |
| OUT | `wo_waste_log`, `downtime_events`, `changeover_events`, production outbox | 08 → finance/oee/reporting | correct |
- **Canonical-owner check:** ✅✅ `wo_outputs` owned by 08 T-003 (NOT 04). `oee_snapshots` written ONLY by 08 T-044 (15-OEE read-only). Both locks honored. No crossing in any task.

### RBAC / reachability — missing grant-seed (X-1); RBAC strings tasked (T-056). Permission assertions are embedded across API tasks. nav OK (X-2). 08 has no standalone wiring task like 04 T-033, but per-task RBAC is present — recommend an explicit grant-seed + a wiring-verification AC.

### Build-readiness — skill ✅ (best, canonical-locks documented), prototypes ✅ (production labels). Paths ✅ already correct. **Most build-ready of the three** once 03-TECH/05-WH/09-QA upstreams land.

---

## Consolidated "what must be resolved before build" checklist

1. **[ALL] Add RBAC grant-seed task per module** (X-1) — `m04/m07/m08-rbac-grant-seed.md`. Highest-priority preventive.
2. **[04+07] Remap `src/` scope_files → real monorepo roots** (X-3) — `m04-07-path-remap.md`. Use 08 as the template.
3. **[07] Add solver hosting/deploy + env-contract task** (07-F1) — `m07-solver-hosting.md`.
4. **[07] Reconcile solver dispatch to canonical outbox/worker** (07-F3) — `m07-solver-dispatch-reconcile.md`.
5. **[07] Add RBAC wiring task + grant-seed** (07-F2) — folded into `m07-rbac-grant-seed.md` (note wiring requirement).
6. **[04] Decide T-045 MRP/reorder_thresholds: accept-into-PRD or defer-to-P2** (04-F1) — `m04-mrp-scope-decision.md`.
7. **[gate] Do not start 04 T-001 / 07 T-055 / 08 T-001 until 03-TECH T-080/T-081 are ✅; do not start 08 consume/output (T-023..T-031) until 05-WAREHOUSE LP tables + 09-QUALITY T-064 land** (X-4). Already encoded as cross_module_dependencies — enforce at wave planning.

All cross_module_dependencies are correctly structured as typed contracts (not invalid ACP root deps). Prototype anchors and domain skills are present and current for all three modules.

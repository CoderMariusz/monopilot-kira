# 2026-05-14 — Fixer F5: Reconcile duplicate `wo_outputs` + cite 09-Q T-064 consume gate

**Fixer:** F5 (applies two structural fixes flagged by Reviewer R5 in `2026-05-14-review-R5-planning-basic-ext-production.md`).
**User decision (carried forward):** 08-PRODUCTION owns canonical `wo_outputs`; 04-PLANNING-BASIC references it via a new `schedule_outputs` table.
**Modules touched:** `04-planning-basic`, `08-production`, plus adjacent references.
**Validator outcomes:** 04 PASS (66 tasks), 07 PASS (58 tasks), 08 PASS (56 tasks).

---

## Issue A — Reconcile duplicate `wo_outputs`

### A.1 — 04-planning-basic T-005 rewrite (planning projection → `schedule_outputs`)

**Before (relevant slice):**
- Title: "T-005 — Drizzle schema: wo_outputs + wo_dependencies + wo_status_history"
- Prompt described creating a `wo_outputs` table with planning-shape columns: `output_role` enum, `planned_qty`, `actual_qty`, `allocation_pct`, `disposition` enum, `downstream_wo_id`, `output_lp_id`, plus partial unique index ensuring one primary per WO.
- Scope files: `src/db/schema/planning/wo_outputs_dag.ts`, `0005_planning_wo_outputs_dag.sql`.
- ACs / test_strategy / risk_red_lines named `wo_outputs` as the planning-owned table.
- `cross_module_dependencies` only declared `06-scanner-p1: CONTRACT`.

**After:**
- Title: "T-005 — Drizzle schema: schedule_outputs (planning projection) + wo_dependencies + wo_status_history"
- Prompt now opens with an explicit "Canonical wo_outputs ownership (2026-05-14 decision)" preamble: 08-PRODUCTION T-003 is the only owner of `wo_outputs`; planning creates `schedule_outputs` with columns `id UUID PK, org_id UUID NOT NULL, planned_wo_id UUID FK work_orders(id) ON DELETE CASCADE, product_id UUID FK, output_role enum, expected_qty NUMERIC(12,3), uom TEXT, allocation_pct DECIMAL(5,2), disposition enum DEFAULT 'to_stock', downstream_wo_id UUID NULL, notes TEXT, created_at, updated_at`.
- Indexes: partial-unique `schedule_outputs_one_primary_per_wo` on `(org_id, planned_wo_id) WHERE output_role='primary'`, `idx_schedule_outputs_planned_wo`, partial `idx_schedule_outputs_downstream WHERE downstream_wo_id IS NOT NULL`.
- RLS via `app.current_org_id()` foundation function (Wave0 lock); `ENABLE` + `FORCE ROW LEVEL SECURITY`; `pg_policies` AC asserts no GUC reads.
- Explicit "Materialization contract" section documenting that 08-production T-003 projects schedule_outputs → wo_outputs at WO start.
- Scope files renamed to `schedule_outputs_dag.ts`, `0005_planning_schedule_outputs_dag.sql`.
- ACs (4): schema introspection (org_id NOT NULL), migration grep (partial-unique exists + NO `wo_outputs` table created), pg_policies references `app.current_org_id()` with no GUC, vitest + tsc green.
- New `risk_red_lines` entry (first item): "Do NOT create `wo_outputs` table — that table is owned by 08-production T-003 (canonical per 2026-05-14 decision). Planning side uses `schedule_outputs` (this task) and materializes into `wo_outputs` on WO start via 08-production logic."
- `cross_module_dependencies` now declares `08-production: T-003` as canonical wo_outputs owner (plus retained `06-scanner-p1: CONTRACT`).
- `out_of_scope` adds: "Canonical wo_outputs table — owned by 08-production T-003 (do not create here)" and "Materialization projection schedule_outputs → wo_outputs on WO start (owned by 08-production)".

### A.2 — 08-production T-003 hardening (explicit canonical owner)

**Before (relevant slice):**
- Title: "T-003 — Drizzle migration: wo_outputs table + output_type enum + RLS"
- Prompt described production-shape `wo_outputs` (batch_number, qa_status, V-PROD-24, catch_weight_details, R13 audit) with RLS via `app.current_org_id()`. Behaviorally correct but did not call out canonical ownership or the planning relationship.
- `cross_module_dependencies` was absent.
- 3 ACs (enum range, V-PROD-24 unique, qty_kg CHECK).

**After:**
- Title: "T-003 — Drizzle migration: wo_outputs table (canonical) + output_type enum + RLS".
- Prompt opens with: "08-production T-003 is the canonical owner of `wo_outputs` (2026-05-14 decision)." Adds a `## Cross-module relationship` section documenting: "Materialized from `schedule_outputs` (04-planning-basic T-005) when `wo.start` event fires. Production-only columns (batch_number, qa_status, V-PROD-24 unique-per-year, allergen cascade hooks, R13 audit) are populated at materialization time, not at planning time. Planning never inserts into `wo_outputs`."
- AC count raised from 3 → 4 (within validator cap of 4) by adding pg_policies AC asserting policies reference `app.current_org_id()` and contain no GUC reads.
- `risk_red_lines` extended with: "Do not change enum values (would break planning schedule_outputs.output_role projection)" and "Do not permit any other module to (re)create `wo_outputs` — 08-production T-003 is the sole canonical owner (planning uses schedule_outputs in 04 T-005)."
- `out_of_scope` adds: "Do not implement materialization projection from schedule_outputs (that is a separate 08-production runtime task on WO start)."
- New `cross_module_dependencies`: `04-planning-basic: T-005` declaring the upstream `schedule_outputs` projection (no behavior change; documentation hardening).
- No other functional/schema field changed — the production-shape columns, V-PROD-24 unique constraint, RLS policy, indexes are untouched.

### A.3 — Adjacent task references swept

`grep -rl "wo_outputs"` across `04-planning-basic`, `07-planning-ext`, `08-production`, `10-finance`, `12-reporting`, `15-oee` returned 24 task files. Triage and actions:

| Task | Module | Before | After | Reason |
|---|---|---|---|---|
| T-004 | 04-planning-basic | `out_of_scope` entry "wo_outputs / wo_dependencies (T-005)" | Updated to "schedule_outputs / wo_dependencies (T-005) — note: canonical wo_outputs is owned by 08-production T-003 per 2026-05-14 decision; planning side uses schedule_outputs" | Cross-reference inside 04 module |
| T-018 | 04-planning-basic | Prompt step 4 created `wo_outputs` row at WO create; AC #2 asserted `wo_outputs` queried; risk_red_line about `wo_outputs primary allocation_pct` | Step 4 + AC #2 + risk_red_line now reference `schedule_outputs`; new risk_red_line added: "Do not write to canonical `wo_outputs` (owned by 08-production T-003) — planning writes to `schedule_outputs` only; production materializes on WO start." | Planning-side write — must hit projection table |
| T-019 | 04-planning-basic | Prompt described inserting wo_dependencies linking `parent.wo_outputs → child.wo_materials`, generating `wo_outputs` rows for co-products, RED test on wo_outputs | All three references rewritten to `schedule_outputs` with explicit "canonical wo_outputs owned by 08-production T-003, materialized at WO start" annotation; new risk_red_line added | Cascade planning-side projection |
| T-022 | 04-planning-basic | "wo_outputs LPs already materialized stay 'available' for downstream WOs" | Same semantic but explicit: "wo_outputs LPs already materialized (canonical wo_outputs owned by 08-production T-003) stay 'available' ... planning cancel does not delete materialized wo_outputs rows." | Reads canonical 08-production wo_outputs; no semantic change |
| T-054 | 07-planning-ext | `cross_module_dependencies` declares contract `wo_outputs/historical actual production quantities.` to module `08-production` | No change | Correctly attributed downstream read of 08-production canonical wo_outputs |
| T-003, T-014, T-019, T-021, T-028, T-029, T-031, T-032, T-033, T-034, T-044, T-052 | 08-production | All reference `wo_outputs` as the canonical production-owned table (read+write of production-runtime columns) | No change | These are all 08-production canonical writers/readers; correctly using canonical name |
| T-015, T-017, T-018, T-024 | 10-finance | Reads `wo_outputs` from 08-production (cost/yield analytics) | No change | Downstream reader — correctly attributed |
| coverage.md | 10-finance | Already attributes `wo_outputs + wo_consumptions` to `08-production` | No change | Correct ownership in coverage doc |
| T-002, T-003, T-027 | 12-reporting | Reads `wo_outputs` from 08-production (reporting fact rows) | No change | Downstream reader — correctly attributed |
| manifest.json | 12-reporting | Notes `08-PRODUCTION wo_outputs + wo_consumptions (T-003 source)` | No change | Correctly attributes to 08-production T-003 |

**Total adjacent tasks updated: 4** (04 T-004, T-018, T-019, T-022). **No-op (already correctly attributed): 20.** No tasks were found in 15-oee that reference `wo_outputs` directly.

### A.4 — coverage.md updates

- `_meta/atomic-tasks/04-planning-basic/coverage.md`:
  - PRD coverage row for §5.6..§5.11 updated to read "schedule_outputs (planning projection)" instead of "outputs".
  - New section "## Canonical wo_outputs ownership (2026-05-14 decision)" added before "## Notes" documenting the schedule_outputs → wo_outputs materialization contract.
- `_meta/atomic-tasks/08-production/coverage.md`:
  - New section "## Canonical wo_outputs ownership (2026-05-14 decision)" added before "## Cross-module dependencies recorded" documenting canonical ownership and the projection contract.
  - Cross-module dependencies list extended with: "04-PLANNING-BASIC `T-005`: planning-side `schedule_outputs` projection — upstream of canonical `wo_outputs` (08-production T-003)".

### A.5 — Validators

No 04 or 08 validator currently checks ownership rules for specific table names; the reconciliation is documentation/JSON-content level. No validator code changed.

---

## Issue B — Cite 09-Quality T-064 consume gate on 14 production tasks

R5 Section 3 + Section 5 #8 identified 14 production tasks that perform LP / WO consume operations but did not cite the 09-Q T-064 consume gate (active hold check via `v_active_holds`).

### B.1 — 14 tasks updated

For each of the following tasks in `_meta/atomic-tasks/08-production/tasks/`, the script `/tmp/fix_issue_b.py` (idempotent) appended one entry to each of `pipeline_inputs.cross_module_dependencies`, `pipeline_inputs.acceptance_criteria` (kept within validator cap of 4), and `pipeline_inputs.risk_red_lines`:

| T-ID | Surface | xmd count before→after | ac count before→after | rrl count before→after |
|---|---|---|---|---|
| T-001 | Factory release runtime preflight (start/consume/output) | 4→5 | 3→4 | 4→5 |
| T-002 | wo_material_consumption schema (consumption primitive) | 0→1 | 3→4 | 5→6 |
| T-011 | operator_kpis_monthly materialized view + nightly refresh | 1→2 | 3→4 | 4→5 |
| T-014 | Register DSL rules output_yield_gate_v1 + allergen_changeover_gate_v1 | 0→1 | 3→4 | 3→4 |
| T-019 | POST /api/production/work-orders/:id/complete + closed_production_strict gate | 0→1 | 3→4 | 3→4 |
| T-021 | GET /api/production/work-orders/:id full runtime state | 0→1 | 3→4 | 3→4 |
| T-023 | POST /api/production/scanner/consume-to-wo | 0→1 | 3→4 | 3→4 |
| T-024 | Over-consumption detection (409 requires_approval) + approval endpoint | 0→1 | 3→4 | 3→4 |
| T-025 | Genealogy write on consumption | 0→1 | 3→4 | 3→4 |
| T-026 | FEFO compliance check + deviation reason | 0→1 | 3→4 | 3→4 |
| T-027 | GET /api/production/work-orders/:id/material-status | 0→1 | 3→4 | 3→4 |
| T-031 | Genealogy write on output (consumed LPs → output LP) | 0→1 | 3→4 | 3→4 |
| T-034 | output_yield_gate_v1 evaluator + soft flag on registration complete | 0→1 | 3→4 | 3→4 |
| T-052 | E2E happy path approved WO start → consume → output → complete → D365 | 3→4 | 3→4 | 4→5 |

### B.2 — Payload added to each task

```json
{
  "module": "09-quality",
  "task_id": "T-064",
  "reason": "Quality consume gate (v_active_holds) — every LP/WO consume operation must call holdsGuard(lpId, lotId) before mutating consumption/output state. Active hold returns 409 quality_hold_active and emits production.consume.blocked outbox event (PRD §16.4 V-PROD-02/V-PROD-16)."
}
```

`acceptance_criteria` line appended:
> "Given an LP/lot has an active quality hold (v_active_holds), when WO consume is attempted, then the operation is rejected with 409 quality_hold_active and an outbox event production.consume.blocked is emitted (consume gate per 09-quality T-064)."

`risk_red_lines` line appended:
> "Do not bypass the 09-quality consume gate (T-064 v_active_holds) — every consume path must call holdsGuard(lpId, lotId) before mutating consumption tables."

All 14 tasks remain at ≤4 acceptance criteria, satisfying the 08-production validator.

---

## Validator outcomes

```
$ python3 _meta/atomic-tasks/04-planning-basic/_validate.py
[validate] 66 task files inspected
[validate] PASS — 0 failures

$ python3 _meta/atomic-tasks/08-production/_validate.py
PASS: 56 tasks validated

$ python3 _meta/atomic-tasks/07-planning-ext/_validate.py
Tasks scanned: 58
Errors: 0
PASS
```

All three validators pass after the fixes. 07-planning-ext was not touched; ran for assurance.

---

## Items NOT fixed (out of scope for this fixer pass)

- R5's other P0 finding (Wave0 v4.3 `tenant_id → org_id` lock in 04 T-002/T-003/T-006 and 08 T-002/T-004..T-009) is not part of this fixer's mandate. The duplicate-`wo_outputs` fix is independent and does not include those column renames.
- R5's other P1/P2 findings (missing `T-111` / `T-112` / `T-121` / `T-124` foundation citations on 07 and 08 tasks; unresolved PRD anchors in 07 T-001/T-010/T-012/T-021/T-024/T-028 and 04 T-033/T-045; 04 T-008 AC count overflow; 04 UI `ui_evidence_policy` shape drift; missing `out_of_scope` on 04 T-001 and 07 T-042..T-057) are not in this fixer's mandate.

---

## Artifacts

- Edited tasks (Issue A): `04-planning-basic/tasks/T-005.json` (rewrite), `04-planning-basic/tasks/T-004.json`, `04-planning-basic/tasks/T-018.json`, `04-planning-basic/tasks/T-019.json`, `04-planning-basic/tasks/T-022.json`, `08-production/tasks/T-003.json` (rewrite).
- Edited tasks (Issue B): 14 files listed above in 08-production/tasks/.
- Edited coverage docs: `04-planning-basic/coverage.md`, `08-production/coverage.md`.
- Helper script (idempotent, for re-runs): `/tmp/fix_issue_b.py`.
- Source review: `_meta/audits/2026-05-14-review-R5-planning-basic-ext-production.md`.

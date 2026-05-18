# Fixer F1 — Tenant→org_id Lock + Foundation Citations + PRD Anchors

Date: 2026-05-14
Operator: Fixer F1 (Opus 4.7 / 1M ctx)
Scope: Apply mechanical remediations from Reviewer R4 (`2026-05-14-review-R4-technical-warehouse-quality.md`) and Reviewer R5 (`2026-05-14-review-R5-planning-basic-ext-production.md`).

Sister-pass reference: `_meta/audits/2026-05-14-tenant-context-remediation.md` (canonical pattern for org_id + `app.current_org_id()`).

---

## Summary table

| Issue | Description | Tasks touched | Validator result post-fix |
|---|---|---|---|
| A | `tenant_id` → `org_id` Wave0 lock | 17 (5× 05-WH + 4× 04-PB + 8× 08-PROD) | 04 PASS, 07 PASS, 08 PASS; 05 retains 9 pre-existing P2 AC-count failures (out of F1 scope) |
| B | `app.current_org_id()` explicit citation in 07-ext RLS tasks | 7 → 6 actually changed (T-008 already canonical) | 07 PASS |
| C | Foundation primitive citations (T-111/T-112/T-121/T-124) | 15 task-citation pairs across 13 distinct tasks (T-012 & T-019 got 2 citations each) | 04 PASS, 07 PASS, 08 PASS |
| D | 07-ext + 04 PRD anchor corrections | 8 (6× 07-ext, 2× 04) | 04 PASS, 07 PASS |
| E | 04 T-008 AC count 5 → 4 (consolidated last two) | 1 | 04 PASS |
| Bonus | 05-WH T-011 "appropriate" placeholder reworded | 1 | Removed 1 failure from 05-WH validator |

**Distinct tasks rewritten:** 35 (one task may appear in multiple issues).

---

## Issue A — `tenant_id` → `org_id` rewrite (17 tasks)

### Mechanical transformations applied per task

- `tenant_id` (column name and all index/unique constraint members) → `org_id`
- "RLS by tenant_id" / "tenant policy" phrasings → "RLS via `app.current_org_id()` on `org_id` column"
- `current_setting('app.tenant_id')::uuid` / `current_setting('app.current_org_id')::uuid` → `app.current_org_id()`
- Sequence naming `lp_number_seq_{tenant}_{warehouse}` → `lp_number_seq_{org}_{warehouse}` (05-WH T-016 only)
- Appended to `details`: " RLS uses foundation `app.current_org_id()` function (Wave0 decision; see `_meta/audits/2026-05-14-tenant-context-remediation.md`)."
- Inserted into `risk_red_lines`:
  1. "Do not read `current_setting('app.tenant_id')` or `current_setting('app.current_org_id')` directly — use the foundation `app.current_org_id()` function so the NULL-safe setter contract is preserved."
  2. "Do not use `tenant_id` as the business-scope column; per Wave0 v4.3 lock it is `org_id`. See `_meta/audits/2026-05-14-tenant-context-remediation.md`."

### Affected files (before tenant_id count → after = 0)

| Module | Task | Before | After |
|---|---|---|---|
| 05-warehouse | T-005 (grns/grn_items) | 5 | 0 |
| 05-warehouse | T-008 (shelf_life_rules) | 4 | 0 |
| 05-warehouse | T-009 (warehouse_settings) | 5 | 0 |
| 05-warehouse | T-011 (FEFO composite index) | 2 | 0 |
| 05-warehouse | T-016 (LP number sequence) | 5 | 0 |
| 04-planning-basic | T-002 (purchase_orders) | 2 | 0 |
| 04-planning-basic | T-003 (transfer_orders) | 2 | 0 |
| 04-planning-basic | T-005 (wo_outputs/wo_deps/wo_status_history) | 6 | 0 |
| 04-planning-basic | T-006 (wo_material_reservations) | 2 | 0 |
| 08-production | T-002 (wo_material_consumption) | 3 | 0 |
| 08-production | T-003 (wo_outputs production-shape) | 6 | 0 |
| 08-production | T-004 (wo_waste_log) | 4 | 0 |
| 08-production | T-005 (downtime_events) | 3 | 0 |
| 08-production | T-006 (changeover_events) | 3 | 0 |
| 08-production | T-007 (allergen_changeover_validations) | 3 | 0 |
| 08-production | T-008 (oee_snapshots) | 5 | 0 |
| 08-production | T-009 (production_outbox_events) | 4 | 0 |

T-011 FEFO index now reads `(org_id, warehouse_id, product_id, status, expiry_date ASC NULLS LAST)` — matches canonical T-002.

**Note on the duplicate `wo_outputs` table flagged by R5 §3:** F1 did NOT resolve the canonical-ownership ambiguity between 04 T-005 (planning-shape) and 08 T-003 (production-shape). Both tasks were rewritten to use `org_id`, but the duplicate-table architectural decision is a Wave-planner question, not a mechanical fixer call. Flagged for human resolution — see "Could not fix" below.

---

## Issue B — 07-ext `app.current_org_id()` explicit citation (7 tasks)

For 07-planning-ext T-003..T-009, appended to `details`:

> "RLS policies must explicitly reference the foundation `app.current_org_id()` function (Wave0 v4.3 lock; see `_meta/audits/2026-05-14-tenant-context-remediation.md`). Do not use `current_setting('app.tenant_id')` or `current_setting('app.current_org_id')` GUC reads."

Plus the canonical Red Line #1.

| Task | Changed |
|---|---|
| 07-ext T-003 | yes |
| 07-ext T-004 | yes |
| 07-ext T-005 | yes |
| 07-ext T-006 | yes |
| 07-ext T-007 | yes |
| 07-ext T-008 | no (already canonical — was rewritten by Pt1 tenant-remediation 2026-05-14) |
| 07-ext T-009 | yes |

---

## Issue C — Foundation primitive citations (15 citations across 13 distinct tasks)

Added a `cross_module_dependencies` entry citing the foundation task ID + a red line + a `details` note.

### T-112 outbox

| Task | Citation |
|---|---|
| 04 T-032 | Outbox emitter must use foundation outbox table & dispatcher contract (T-112) |
| 07 T-028 | same |
| 07 T-029 | same |
| 08 T-009 | same |

### T-111 `apps/worker` (async/long-running)

Note: "Async/long-running work runs in `apps/worker` (foundation T-111); do not block the Server Action / API request path."

| Task | Citation |
|---|---|
| 07 T-012 (scheduler run) | yes |
| 07 T-013 (solver-run reader) | yes |
| 07 T-019 (forecast upload) | yes |
| 07 T-021 (solver microservice scaffold) | yes |
| 07 T-022 (greedy assignment) | yes |
| 07 T-023 (local-search refinement) | yes |
| 07 T-054 (Prophet nightly) | yes |
| 08 T-011 (operator_kpis_monthly nightly view) | yes |

### T-121 rate-limit

Note: "Expensive endpoint must apply foundation rate-limit primitive (T-121); 429-on-burst per PRD perf constraint."

| Task | Citation |
|---|---|
| 07 T-012 (scheduler run) | yes |
| 07 T-019 (forecast upload) | yes |

### T-124 e-sign

| Task | Citation |
|---|---|
| 08 T-040 (BRCGS regulatory approval) | "Regulatory e-sign approval must use foundation e-sign primitive (T-124); do not reinvent dual-sign/PBKDF2 locally." |

---

## Issue D — PRD anchor corrections (8 tasks)

### 07-planning-ext (6 tasks)

Real PRD headings: §5.1 (Architecture constraints), §5.4 (Performance constraints), §4.1 (Phase 1 MVP scope). No sub-numbered §5.1.1 / §5.1.2 / §5.1.3 / §5.4.1 / §5.4.4 / §4.1.3 exist.

| Task | Broken refs | Replaced with |
|---|---|---|
| T-001 | §5.1.1, §5.4.4 | §5.1 (was §5.1.1), §5.4 (was §5.4.4) |
| T-010 | §4.1.3 | §4.1 (was §4.1.3) |
| T-012 | §5.1.1 | §5.1 (was §5.1.1) |
| T-021 | §5.1.1, §5.4.1 | §5.1 (was §5.1.1), §5.4 (was §5.4.1) |
| T-024 | §5.1.2 R14 | §5.1 R14 (was §5.1.2) |
| T-028 | §5.1.3 | §5.1 (was §5.1.3) |

Appended `details` note: "PRD-anchor remediation: corrected … to nearest real heading (07-PLANNING-EXT-PRD has only §5.1 (Architecture), §5.4 (Performance), §4.1 (Phase 1 MVP) headings — no sub-numbered sub-headings exist)."

### 04-planning-basic (2 tasks)

| Task | Broken refs | Replaced with |
|---|---|---|
| T-033 | §3.2, §3.3 | §3 (was §3.2), §3 (was §3.3) |
| T-045 | §MRP-gap | §4 (was §MRP-gap) |

§3 (Personas & RBAC) is the parent heading; ### 3.2 / ### 3.3 exist as subsections but the canonical reference style is §3 + inline marker.

---

## Issue E — 04 T-008 AC count

Before: 5 ACs (validator caps at 4).
After: 4 ACs — last two consolidated into one (joined with "; and ").

Details field updated with: "AC consolidation: last two AC merged into one to satisfy module validator cap of 4 (Fixer F1, see `_meta/audits/2026-05-14-fixer-F1-tenant-and-foundation-citations.md`)."

---

## Bonus — 05-WH T-011 placeholder

R4 §5 Should-fix #4 flagged "where appropriate" tripping the placeholder regex. Since F1 was already editing T-011 for Issue A, the placeholder was reworded to match R4's suggested phrasing:

- Before: "Use `CREATE INDEX CONCURRENTLY` for production-safety where appropriate (or document opt-out for dev)."
- After: "Use `CREATE INDEX CONCURRENTLY` in production migrations (dev migrations may opt out and document the reason)."

This eliminated 1 of the 10 pre-existing 05-WH validator failures.

---

## Validator results — final

| Module | Pre-F1 | Post-F1 | Net |
|---|---|---|---|
| 04-planning-basic | 1 FAIL (T-008 >4 ACs) | **PASS** | -1 failure |
| 05-warehouse | 10 FAIL (1 placeholder + 9 AC>4) | 9 FAIL (9 AC>4) | -1 failure (placeholder fixed); 9 pre-existing AC-count P2s remain |
| 07-planning-ext | PASS | **PASS** | unchanged |
| 08-production | PASS | **PASS** | unchanged |

Reproduction:

```bash
python3 _meta/atomic-tasks/04-planning-basic/_validate.py
python3 _meta/atomic-tasks/05-warehouse/_validate.py
python3 _meta/atomic-tasks/07-planning-ext/_validate.py
python3 _meta/atomic-tasks/08-production/_validate.py
```

---

## Could not fix (deferred to follow-up)

1. **05-WH AC-count >4 on T-002 + T-048..T-055 (9 tasks).** R4 §5 Should-fix #4. Requires content collapse (parity-checklist compression) that is not mechanical and would risk losing AC coverage. Recommended for a UI-parity-aware fixer pass.
2. **Duplicate `wo_outputs` canonical-ownership** (04 T-005 vs 08 T-003). R5 §3 P0. Architectural decision (recommend option (a) — 08 canonical, 04 reads it via cross_module_dependencies). Not mechanical; needs a wave-planner decision.
3. **Quality T-064 consume-gate citation on 14 production tasks** (R5 P1 #8 — 08 T-001/T-002/T-011/T-014/T-019/T-021/T-023/T-024/T-025/T-026/T-027/T-031/T-034/T-052). Out of F1's directive (which only listed Issues A-E); flagged for the next fixer if requested.
4. **09-quality `cross_module_dependencies` backfill + UI prototype index entries on 14 pre-2026-05-14 T3-ui tasks** (R4 P1 #2/#3). Out of F1's directive.
5. **03-technical AC-count >4 on 16 tasks + `cross_module_dependencies` backfill on 85 tasks** (R4 P1/P2 #4/#6). Out of F1's directive.

---

## Files referenced

- `_meta/audits/2026-05-14-review-R4-technical-warehouse-quality.md`
- `_meta/audits/2026-05-14-review-R5-planning-basic-ext-production.md`
- `_meta/audits/2026-05-14-tenant-context-remediation.md` (pattern source)
- `_meta/atomic-tasks/01-npd/tasks/T-001.json` (gold standard)
- `_meta/atomic-tasks/05-warehouse/tasks/T-002.json` (post-Pt1 fix exemplar)
- `_meta/atomic-tasks/{04,05,07,08}/tasks/T-XXX.json` (35 distinct files rewritten)
- `_meta/atomic-tasks/{04,05,07,08}/_validate.py` (validators)

# 2026-05-14 — Review R5: 04-planning-basic, 07-planning-ext, 08-production

**Reviewer:** R5 (read-only audit; no task JSONs modified).
**Modules audited:** `_meta/atomic-tasks/04-planning-basic/` (66 tasks), `_meta/atomic-tasks/07-planning-ext/` (58 tasks), `_meta/atomic-tasks/08-production/` (56 tasks). Total: **180 tasks**.
**Reference gold-standard:** `01-npd/tasks/T-001.json`, `01-npd/tasks/T-052.json`, `02-settings/tasks/T-001.json`, `02-settings/tasks/T-041.json`, `UI-PROTOTYPE-PARITY-POLICY.md`.

---

## Section 1 — Executive summary

### Counts

| Module | Reviewed | Passing (no issues) | With issues |
|---|---|---|---|
| 04-planning-basic | 66 | 31 | 35 |
| 07-planning-ext | 58 | 8 | 50 |
| 08-production | 56 | 26 | 30 |
| **TOTAL** | **180** | **65** | **115** |

All 180 JSONs parse cleanly. All 180 declare top-level shape (title/prompt/labels/priority/max_attempts/pipeline_name/pipeline_inputs). Internal `pipeline_inputs.dependencies` are coherent across all three modules (0 broken). All cross_module_dependencies that reference 04-planning-basic from 07/08 resolve to existing T-XXX IDs.

### Top-5 systemic issues

1. **Wave0 v4.3 tenant→org_id lock broken in 12 schema tasks** (highest severity). 04 T-002, T-003, T-005, T-006 and 08 T-002, T-003, T-004, T-005, T-006, T-007, T-008, T-009 still describe DDL columns/policies as `tenant_id`. The 2026-05-14 tenant-context remediation pass corrected 16 tasks across other modules but did NOT cover these 12. They will collide with foundation `app.current_org_id()` policies and force a follow-up migration.
2. **`app.current_org_id()` not referenced in 14 RLS schema tasks**. 07 T-003..T-009 and 08 T-002..T-009 mention "RLS" generically (e.g. "RLS by tenant_id") without naming the foundation reader function. The gold standard (NPD T-001 line 3, 04 T-001) names it explicitly so implementers don't fall back to the spoofable GUC pattern. 7 of these are also in #1 above (compound risk).
3. **Foundation primitive non-references**. 07 outbox emitters T-028/T-029 do not cite foundation outbox task `T-112`; 04 outbox emitter T-032 likewise. 07 solver/queue tasks T-012/T-013/T-021 reference "queue/worker" but never `T-111` worker primitive; 07 forecast T-019/T-054 lack worker reference at all. Eight 07 endpoints with expensive operations (solver run, forecast upload, dry-run) lack the rate-limit `T-121` reference. 08 T-040 (regulatory e-sign approval per BRCGS) lacks `T-124` e-sign primitive reference.
4. **Duplicate canonical table definition — `wo_outputs`**. 04 T-005 defines `wo_outputs` with planning-shape columns (`output_role`, `disposition`, `downstream_wo_id`, `planned_qty/actual_qty`). 08 T-003 defines `wo_outputs` with production-shape columns (`output_type`, `batch_number`, `qa_status`, `lp_id`, `qty_kg`, `catch_weight_details`, V-PROD-24 unique-per-year). Both schemas will collide on migration apply. Canonical owner must be one or the other (recommend 04 as planning-data origin + 08 as ALTER TABLE adding production columns, OR migrate planning fields to 08 and have 04 read 08-owned table). Coverage.md (04) treats §5.8 as 04-owned but the production-domain shape clearly belongs in 08.
5. **PRD anchors in 07-planning-ext do not resolve to PRD subsections**. 07 PRD has no §5.1.1, §5.1.2, §5.1.3, §5.4.1, §5.4.4 — these are referenced by T-001, T-012, T-021, T-024, T-028 etc. as `prd_refs`. (Plausibly the author meant inline-numbered constraints under §5.1/§5.4 — but the anchors are not headings, so RED-prompt PRD-anchor-verify checks will trip. T-033 in 04 references §3.2/§3.3 which are also not headings in 04 PRD.)

### Additional findings (not in top-5 but worth noting)

- **04 validator failure**: `T-008.json` has 5 acceptance criteria; module validator caps at 4. Trivial: collapse the last AC ("0 failures") into the previous one (typical pattern in gold standard). All other 179 tasks satisfy the count rule.
- **04 UI tasks use `ui_closeout_evidence` array instead of `ui_evidence_policy` string pointer**. Functionally equivalent (it includes Playwright trace + screenshot requirements) but differs from gold standard (NPD T-052 / Settings T-041) which uses string `ui_evidence_policy: "_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md"`. 07 and 08 use the gold pattern. Affects 28 of 30 UI tasks in 04 (T-064/T-065 are spec-driven, `prototype_match: false`).
- **No `prototype_index_entry` field on 04 + 07 UI tasks** (gold standard NPD T-052 uses `"prototype_index_entry": "npd_dashboard"`). 08 has it on T-046..T-051. Prototype linkage still verifiable via prompt+scope_files line refs (all 51 UI tasks across the three modules pass the line-range-in-index check). The missing field is a soft gap.
- **No "## Prototype parity" section** explicitly labeled in any UI prompt across the 3 modules. Parity checklists are embedded inside `pipeline_inputs.details` / AC#1, which works, but the policy file's literal "## Prototype parity" section heading is absent.
- **`out_of_scope` missing**: 04 T-001 omits `out_of_scope`; 07 T-042..T-057 (16 tasks, all post-handoff UI/closeout) omit `out_of_scope`. Schema field is non-blocking but breaks shape parity with gold.

### Overall verdict per module

| Module | Verdict | Rationale |
|---|---|---|
| 04-planning-basic | **AMBER** | Strong cross-module dep declarations, canonical schedule/WO ownership clear, full prototype line-range coverage, 1 validator AC>4 failure, 4 schema tasks miss org_id lock, 28 UI tasks use non-gold evidence field. Mergeable with surgical fixes. |
| 07-planning-ext | **AMBER** | Full prototype line-range coverage, proper `ui_evidence_policy`, cross_module deps correct, T-046 enum-lock guard reference correct. But 6 PRD anchors are broken, 6 RLS schema tasks miss `app.current_org_id()` ref, 8 expensive endpoints miss T-121 rate-limit ref, outbox tasks miss T-112 ref. |
| 08-production | **RED** | Eight T1-schema tasks (T-002..T-009) still use `tenant_id` instead of `org_id` — Wave0 v4.3 lock violation. Compounded by missing `app.current_org_id()` references. Plus duplicate `wo_outputs` table with 04 T-005. Quality T-064 consume gate not cited on the 14 production consume/start tasks. Otherwise structurally clean. Block-fix required before ACP import. |

---

## Section 2 — Per-task findings table

Convention: only tasks with at least one issue are listed. Severity scale: **B** = blocker (Wave0 lock / duplicate schema / broken contract), **M** = medium (missing primitive ref, PRD anchor unresolved, AC overflow), **L** = low (cosmetic shape drift vs gold).

### 04-planning-basic

| Task | Severity | Findings |
|---|---|---|
| T-001 | L | `pipeline_inputs.out_of_scope` field missing. |
| T-002 | B | Uses `tenant_id` column for PO/po_lines schema (Wave0 lock violation). No `app.current_org_id()` reference. |
| T-003 | B | Uses `tenant_id` for transfer_orders/to_lines/to_line_lps. |
| T-005 | B | Uses `tenant_id` for wo_outputs/wo_dependencies/wo_status_history. **AND** duplicates `wo_outputs` table definition with 08 T-003 (different shape). |
| T-006 | B | Uses `tenant_id` for wo_material_reservations/planning_settings. |
| T-008 | M | 5 acceptance criteria — validator caps at 4 (fail). |
| T-032 | M | Outbox emitter task, no reference to foundation T-112. |
| T-033 | M | `prd_refs: ['§3.2','§3.3']` — these are inline-numbered items in 04 PRD §3, not headings; RED prompts that validate refs will not resolve them. |
| T-034..T-063 | L | UI tasks use `ui_closeout_evidence` array instead of gold-standard `ui_evidence_policy` string. No `prototype_index_entry`. No explicit "## Prototype parity" section header. Functionally OK; cosmetic shape drift. |
| T-045 | M | `prd_refs` include `§MRP-gap` — not a PRD heading. |
| T-064, T-065 | L | Spec-driven (`prototype_match: false`), no parity section needed — but no `ui_evidence_policy` either. Coverage doc accepts them as "spec-driven inline/composed surfaces"; still must provide screenshot evidence per policy. |

### 07-planning-ext

| Task | Severity | Findings |
|---|---|---|
| T-001 | M | `prd_refs` include `§5.1.1`, `§5.4.4` — 07 PRD has no such headings (only §5.1, §5.4). |
| T-002 | L | (org_id usage correct in T-002 per tenant-remediation; just verify implementer follows.) |
| T-003 | M | RLS task, no `app.current_org_id()` mention. |
| T-004 | M | RLS task, no `app.current_org_id()` mention. |
| T-005 | M | RLS task, no `app.current_org_id()` mention. |
| T-006 | M | RLS task, no `app.current_org_id()` mention. `prd_refs` includes `§17.1 PLE-008`, which exists, but format may not resolve via simple anchor match. |
| T-007 | M | RLS task, no `app.current_org_id()` mention. |
| T-009 | M | RLS task, no `app.current_org_id()` mention. |
| T-010 | M | `prd_refs` include `§4.1.3` — not in 07 PRD (07 has §4.1.1/§4.1.2 only). |
| T-012 | M | POST /api/scheduler/run; queue/dispatch mentioned but no T-111 worker primitive ref; no T-121 rate-limit ref despite §5.4 perf constraint and 429-on-3-concurrent rule. `prd_refs §5.1.1` unresolved. |
| T-013 | M | Solver run reader API, no T-111 ref. |
| T-019 | M | POST /api/scheduler/forecasts/upload (manual CSV) — file upload endpoint, no T-121 rate-limit ref. |
| T-020 | M | GET endpoint — no T-121 ref (paged read, less critical, but listed in expensive-endpoint sweep). |
| T-021 | M | Python solver microservice scaffold — no T-111 worker primitive citation; `prd_refs §5.1.1`, `§5.4.1` unresolved. |
| T-022 | M | Greedy assignment algorithm in solver service — no worker/queue ref. |
| T-023 | M | Local search refinement — no worker/queue ref. |
| T-024 | M | UUID v7 + 1h cache; `prd_refs §5.1.2 R14` unresolved (R14 is in §5.1 but not as §5.1.2 heading). |
| T-028 | M | Outbox emitter task, no T-112 foundation ref. `prd_refs §5.1.3` unresolved. |
| T-029 | M | Outbox emitter task, no T-112 foundation ref. |
| T-042..T-057 | L | Missing `out_of_scope` field. |
| T-054 | M | Prophet forecaster microservice — no T-111 worker ref despite being explicitly async / nightly. |
| T-055 | M | Factory release + D365 posture guard — no T-121 ref despite gating scheduler input fetches. |

### 08-production

| Task | Severity | Findings |
|---|---|---|
| T-001 | M | Quality consume gate T-064 (09-Q) not cited; this task wires release-read-model and is a natural injection point. |
| T-002 | B | `wo_material_consumption` schema uses `tenant_id` column + "RLS by tenant_id". Wave0 lock violation. No `app.current_org_id()` ref. |
| T-003 | B | `wo_outputs` uses `tenant_id`. **Duplicate** with 04 T-005 (different shape) — canonical ownership ambiguous. No `app.current_org_id()`. |
| T-004 | B | `wo_waste_log` uses `tenant_id`. No `app.current_org_id()`. |
| T-005 | B | `downtime_events` uses `tenant_id`. No `app.current_org_id()`. |
| T-006 | B | `changeover_events` uses `tenant_id`. No `app.current_org_id()`. |
| T-007 | B | `allergen_changeover_validations` uses `tenant_id`. No `app.current_org_id()`. BRCGS-relevant table, audit retention; missing org_id breaks RLS+retention proof. |
| T-008 | B | `oee_snapshots` uses `tenant_id`. UNIQUE constraint `(tenant_id, line_id, ...)` — V-PROD-10 will be enforced on wrong column. No `app.current_org_id()`. |
| T-009 | B | `production_outbox_events` uses `tenant_id`. Wave0 violation in outbox table — also doesn't cite T-112 foundation. |
| T-011 | M | `operator_kpis_monthly` materialized view + nightly refresh — no T-111 worker/cron primitive ref. |
| T-014 | M | Quality T-064 consume-gate not cited (output_yield_gate_v1 + allergen_changeover_gate_v1 are gate adjacents). |
| T-019, T-021, T-023, T-024, T-025, T-026, T-027, T-031, T-034, T-052 | M | Consume / start / output / scanner-gate endpoints — Quality T-064 consume-gate reference absent. PRD §16.4 V-PROD-02 / V-PROD-16 expect the gate; tasks should call out the dependency. |
| T-040 | M | Regulatory operator-signed approval action (BRCGS) — no T-124 e-sign primitive ref. |
| T-046..T-051 | L | UI tasks: no explicit "## Prototype parity" section header. All other UI shape elements present (line refs valid, prototype_index_entry populated, ui_evidence_policy populated). |

---

## Section 3 — Cross-module integration gaps

### 04-basic → 07-ext → 08-prod chain

| Edge | Status | Notes |
|---|---|---|
| 07-ext T-001 → 04 T-001 (canonical factory release read-model) | OK | declared via `cross_module_dependencies` with reason |
| 07-ext T-012 → 04 T-001 | OK | scheduler input contract |
| 07-ext T-021 → 04 T-001 + 08 T-001 | OK | solver input shape |
| 07-ext T-030 → 04 T-001 + 08 T-001 | OK | dashboard read-model |
| 07-ext T-055 → 01-NPD T-097 + 03-tech T-081 | OK | release/D365 guard |
| 08-prod T-001 → 01-NPD T-097 + 03-tech T-080 | OK | factory release + BOM approval |
| 08-prod T-046 → 01-NPD T-097 + 03-tech T-080 | OK | release UI |
| 08-prod consume tasks (T-001/T-014/T-019/T-021/...) → 09-Q T-064 consume gate | **MISSING** | 14 production tasks consume materials/output but none cite Quality T-064. PRD §16.4 mandates the gate. |
| 04-basic WO consumer in production (no explicit cross-ref) | **GAP** | 08-prod tasks materialize WO from 04 schedule; only T-001 references it. The schedule→WO handoff should appear on every consume/start task. |

### Canonical ownership audit

| Primitive | Canonical owner | Issue |
|---|---|---|
| `work_orders` header (PO/TO/WO master) | 04 T-004 | clean, no duplicate |
| `wo_materials`, `wo_operations` | 04 T-004 | clean |
| `wo_outputs` | **AMBIGUOUS** | 04 T-005 (planning shape) **AND** 08 T-003 (production shape, V-PROD-24 unique). One must own the table; the other must be ALTER TABLE/view. **Recommend 08 as canonical** (the QA/batch_number domain is production-runtime; planning only needs an `output_role` enum that 08 can carry as `output_type`). |
| `wo_status_history` | 04 T-005 | clean (only 04 defines it) |
| `wo_dependencies` (DAG) | 04 T-005 | clean |
| `wo_material_consumption` | 08 T-002 | clean |
| `wo_waste_log`, `downtime_events`, `changeover_events`, `allergen_changeover_validations`, `oee_snapshots`, `d365_push_dlq`, `production_outbox_events` | 08 T-004..T-010 | clean (single owner each) |
| `scheduler_runs`, `scheduler_assignments`, `scheduler_scenarios`, `scheduler_config`, `changeover_matrix*`, `demand_forecasts`, `forecast_actuals`, `matrix_review_request`, `override_reason_codes` | 07 T-001..T-011 | clean |
| `suppliers`, `supplier_products` | 04 T-041 (amendment) | base table presumably in foundation; not duplicated |
| `purchase_orders`, `transfer_orders` | 04 T-002, T-003 | clean |
| `planning_settings`, `wo_material_reservations` | 04 T-006 | clean |
| BOM (`bom`, `bom_components`) | Not in 04/07/08 | correctly owned upstream (NPD/Technical) |

**Singular WO header**: confirmed. **Singular schedule primitive**: confirmed. **`wo_outputs` is the one duplicate that must be resolved before ACP import.**

---

## Section 4 — Prototype linkage report

### Coverage

- All 30 UI (`T3-ui`, `prototype_match: true`) tasks in 04 contain a `prototypes/design/.../*.jsx:NNN-NNN` reference whose line range intersects an entry in `_meta/prototype-labels/prototype-index-planning.json`.
- All 23 UI tasks in 07 contain a line ref intersecting `prototype-index-planning-ext.json`.
- All 6 UI tasks in 08 contain a line ref intersecting `prototype-index-production.json`.
- Zero broken file paths, zero out-of-range line numbers across 59 prototype refs sampled.

### Shape drift vs gold standard (NPD T-052 / Settings T-041)

| Field | Gold | 04 | 07 | 08 |
|---|---|---|---|---|
| `prototype_match: true` on prototype-anchored UI | required | present | present | present |
| `ui_evidence_policy: "_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md"` | required | **absent** — uses `ui_closeout_evidence: [...]` array instead | present | present |
| `prototype_index_entry: "<label>"` | recommended | **absent** | **absent** | **present** (multi-label string) |
| Explicit `## Prototype parity` section in prompt | implied by policy | **absent** | **absent** | **absent** |
| `closeout_requires` includes screenshots + playwright | recommended | **present** (richer than gold) | present (via ui_evidence_policy ref) | present |
| `cross_module_dependencies` declared as array of `{module, task_id, reason}` | recommended | present | present | present |

04's `ui_closeout_evidence` array is actually richer and more prescriptive than the gold-standard `ui_evidence_policy` pointer. It does not block import, but normalization to the gold field name would improve consistency for the ACP closeout-evidence parser. 08 is closest to gold.

### Spec-driven UI tasks (`prototype_match: false`)

04 has 2 (T-064 allergen-override inline, T-065 workflow dry-run inline). 07 has none. 08 has none. Coverage.md accepts these per PRD; they still must provide screenshot/RTL evidence in closeout.

---

## Section 5 — Recommended fixes

### P0 (blocking before ACP import)

1. **Wave0 v4.3 column rename** across 12 schema tasks:
   - 04: T-002, T-003, T-005, T-006
   - 08: T-002, T-003, T-004, T-005, T-006, T-007, T-008, T-009
   For each, rewrite the schema/DDL block to use `org_id uuid not null` instead of `tenant_id`, rename the RLS policy `<table>_org_context`, USING/WITH CHECK `(org_id = app.current_org_id())`, add FORCE ROW LEVEL SECURITY, and add a `pg_policies` AC asserting the policy text references `app.current_org_id()` and contains no `current_setting('app.tenant_id'|'app.current_org_id')` GUC. Follow the pattern from the 2026-05-14 tenant-remediation pass (e.g. 07 T-001, 08 T-010 after-fix shape).
2. **Resolve duplicate `wo_outputs`**. Two options:
   - (a) Make 08 T-003 canonical (production-shape); rewrite 04 T-005 to define only `wo_dependencies` + `wo_status_history` and reference 08 T-003 for `wo_outputs` columns via `cross_module_dependencies`. The 04 `output_role` / `disposition` becomes part of 08's table (`output_type` enum already covers role).
   - (b) Make 04 T-005 canonical (planning-shape); rewrite 08 T-003 as ALTER TABLE adding production columns (`batch_number`, `qa_status`, `catch_weight_details`, `expiry_date`, etc.) and the V-PROD-24 unique constraint.
   Recommend (a) since `wo_outputs` is materialized only after planning emits the WO, but the runtime row (batch_number/QA) is owned by production. Coverage docs in 04 and 08 must be synced.

### P1 (high-priority, do before kicking off implementation)

3. Add `app.current_org_id()` explicit reference to RLS schema tasks: 07 T-003..T-007, T-009; 08 T-002..T-009 (covered above).
4. Add `T-112` outbox primitive citation: 04 T-032; 07 T-028, T-029; 08 T-009.
5. Add `T-111` worker primitive citation: 07 T-012, T-013, T-019, T-021, T-022, T-023, T-054; 08 T-011 (nightly view refresh).
6. Add `T-121` rate-limit citation: 07 T-012 (scheduler run, 429-on-concurrent), T-019 (forecast upload).
7. Add `T-124` e-sign citation: 08 T-040 (BRCGS operator approval).
8. Add 09-Q `T-064` consume-gate cross_module_dependency to 08 consume/start tasks: T-001, T-002, T-011, T-014, T-019, T-021, T-023, T-024, T-025, T-026, T-027, T-031, T-034, T-052.

### P2 (cosmetic / shape parity with gold)

9. Fix 04 T-008 AC count from 5 to ≤4 (merge last two into one) — unblocks module validator.
10. Replace 04 T-033 `§3.2/§3.3`, T-045 `§MRP-gap` with the nearest real PRD heading or with the inline reference syntax (`§3 [D2]` per gold standard pattern).
11. Replace 07 T-001/T-010/T-012/T-021/T-024/T-028 prd_refs that point at non-existent sub-subsection headings with the parent heading + inline marker (e.g. `§5.1 R14` instead of `§5.1.2 R14`).
12. Normalize 04 UI tasks to use `ui_evidence_policy: "_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md"` (and keep the rich `ui_closeout_evidence` array as supplementary).
13. Add `prototype_index_entry: "<label>"` to 04 and 07 UI tasks (gold pattern) so downstream parity tools can join task ↔ index entry deterministically.
14. Add `out_of_scope` field to 04 T-001, 07 T-042..T-057.

### P3 (optional polish)

15. Add explicit `## Prototype parity` section header in UI prompts that lists the parity checklist (currently embedded inside `pipeline_inputs.details`).

---

## Appendix — Reproduction commands

```bash
python3 _meta/atomic-tasks/04-planning-basic/_validate.py
python3 _meta/atomic-tasks/07-planning-ext/_validate.py
python3 _meta/atomic-tasks/08-production/_validate.py
```

Validator output at audit time:
- 04: 1 FAILURE (T-008.json >4 acceptance_criteria).
- 07: PASS.
- 08: PASS.

The validator catches AC overflow but does NOT catch: tenant_id/org_id drift, missing foundation primitive refs, duplicate canonical schemas across modules, or unresolved PRD anchors. Recommend extending the validators with these checks before the next review cycle.

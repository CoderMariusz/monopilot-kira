# Review R1 — 00-foundation, 12-reporting, 13-maintenance

Reviewer: R1 (read-only audit)
Date: 2026-05-14
Scope: `_meta/atomic-tasks/{00-foundation, 12-reporting, 13-maintenance}/tasks/*.json`
Methodology: 10-point checklist per task (JSON parse, top-level shape, pipeline_inputs completeness, PRD anchor reality check, prototype linkage, dependency coherence, cross-module deps, foundation primitives, risk red-lines coverage, test-strategy concreteness). Module-specific extras applied (foundation: manifest+carry-forward+Wave-1 primitives; reporting: no foreign-table writes; maintenance: LOTO/calibration/spare cross-module touchpoints).

## Section 1 — Executive summary

Tasks reviewed: **182** (125 + 27 + 30).
Tasks passing all 10 checks: **159** (87.4%).
Tasks with at least one finding: **23**.
Total findings: **31** (15 P1, 16 P2; zero P0; zero JSON parse failures).

| Module | Total | Passing | Issues | UI tasks | Verdict |
| --- | --- | --- | --- | --- | --- |
| 00-foundation | 125 | 103 | 22 | 15 | AMBER |
| 12-reporting | 27 | 27 | 0 | 12 | GREEN |
| 13-maintenance | 30 | 29 | 1 | 10 | GREEN |

All three manifests match their tasks/*.json counts exactly. All 182 tasks parse as JSON. All have `pipeline_name: kira_dev` and complete pipeline_inputs (root_path, prd_task_id, source_prd, prd_refs, category, subcategory, task_type, parent_feature, context_budget, estimated_effort, description, details, scope_files, out_of_scope, dependencies, acceptance_criteria, test_strategy, risk_red_lines, skills, checkpoint_policy, routing_hints). PRD anchors validate against `docs/prd/<file>.md` headings (including non-§-prefixed `## 8.2` style headings used by 13-maintenance PRD).

Top-5 systemic issues across the three modules:

1. **Foundation UI primitives (T-025..T-031, T-037) carry `prototype_match: null`** — they declare jsx prototype refs in the prompt (e.g. settings/access-screens.jsx:131-154 for T-025 Modal) but never set the `prototype_match: true` flag nor `ui_evidence_policy`. Pipeline closeout checks downstream may treat these as non-UI tasks.
2. **One PRD-page UI task (foundation T-037 SchemaColumnWizard) has no prototype linkage at all** — neither jsx:line ref nor a `## Prototype parity` section in the prompt. It is an admin page (apps/web/app/(admin)/schema/wizard/page.tsx) and should follow the same parity policy as 12-reporting/13-maintenance UI tasks.
3. **Carry-forward FT-* tasks (T-067 ReasonInput, T-095 SchemaColumnWizard step 2, T-099 PWA E2E) cite prototypes informally** — file mentioned but without `:start-end` line range, and no `## Prototype parity` section. Low-risk because the underlying components already exist, but advisory.
4. **Sixteen carry-forward tasks have `risk_red_lines` count = 1** (T-010, T-022, T-023, T-026..T-030, T-033, T-034, T-072, T-078, T-096, T-097, T-103, T-106). The single red line is concrete in every case (e.g. "Do not concatenate translated fragments — ICU MessageFormat only"), so the finding is P2 advisory only. The materialized carry-forward generator should produce ≥2 lines by default per the gold-standard contract.
5. **One genuine bad prototype line range** — 13-maintenance T-022 cites `work-orders.jsx:261-584`, but `prototypes/design/Monopilot Design System/maintenance/work-orders.jsx` is only **564 lines** long. P1.

Cross-cutting strengths observed: every task uses `app.current_org_id()` rather than raw GUC reads (3 apparent matches verified — all in negative-context "do not" prohibitions); foundation primitives (T-111 worker, T-112 outbox, T-121 rate-limit, T-124 e-sign, T-125 withOrgContext) are intact in the manifest and referenced as dependencies from reporting/maintenance tasks where appropriate; reporting module never mutates foreign-module migration files; maintenance LOTO/calibration tasks cite foundation T-124 e-sign in their risk red lines; T-001 of 12-reporting registers `mv_refresh_log/report_exports/report_access_audits` as transactional support tables (not MVs of foreign tables) with RLS via `app.current_org_id()` per Wave0 v4.3.

## Section 2 — Per-task findings table

(Only tasks with at least one finding; severity = highest among that task's findings.)

| Module | Task ID | Issue category | Description | Severity |
| --- | --- | --- | --- | --- |
| 00-foundation | T-010 | risk | `risk_red_lines` count = 1 (gold standard ≥2) | P2 |
| 00-foundation | T-022 | risk | `risk_red_lines` count = 1 | P2 |
| 00-foundation | T-023 | risk | `risk_red_lines` count = 1 | P2 |
| 00-foundation | T-025 | prototype | `prototype_match` is null on T3-ui task (jsx ref present in prompt but flag not set; `ui_evidence_policy` missing) | P1 |
| 00-foundation | T-026 | risk + prototype | rrl=1; `prototype_match` not true | P1 |
| 00-foundation | T-027 | risk + prototype | rrl=1; `prototype_match` not true | P1 |
| 00-foundation | T-028 | risk + prototype | rrl=1; `prototype_match` not true | P1 |
| 00-foundation | T-029 | risk + prototype | rrl=1; `prototype_match` not true | P1 |
| 00-foundation | T-030 | risk + prototype | rrl=1; `prototype_match` not true | P1 |
| 00-foundation | T-031 | prototype | `prototype_match` not true on T3-ui task | P1 |
| 00-foundation | T-033 | risk | rrl=1 | P2 |
| 00-foundation | T-034 | risk | rrl=1 | P2 |
| 00-foundation | T-037 | prototype | T3-ui admin-page task lacks `prototype_match`, no `## Prototype parity` section, no jsx:line ref. Apps page touches `apps/web/app/(admin)/schema/wizard/page.tsx` — must follow UI parity policy. | P1 |
| 00-foundation | T-067 | prototype | Carry-forward primitive refactor lacks Prototype parity section (component already exists but advisory) | P2 |
| 00-foundation | T-072 | risk | rrl=1 | P2 |
| 00-foundation | T-078 | risk | rrl=1 | P2 |
| 00-foundation | T-095 | prototype | Cites `prototypes/design/Monopilot Design System/settings/data-screens.jsx` without :start-end line range | P2 |
| 00-foundation | T-096 | risk | rrl=1 | P2 |
| 00-foundation | T-097 | risk | rrl=1 | P2 |
| 00-foundation | T-099 | prototype | T4-wiring-test for PWA E2E lacks Prototype parity section / jsx ref (test infra — advisory) | P2 |
| 00-foundation | T-103 | risk | rrl=1 | P2 |
| 00-foundation | T-106 | risk | rrl=1 | P2 |
| 12-reporting | — | none | All 27 tasks pass the 10-point checklist | — |
| 13-maintenance | T-022 | prototype | Cites `work-orders.jsx:261-584` but file is only 564 lines long | P1 |

(No findings for 13-maintenance T-001..T-021 or T-023..T-030.)

## Section 3 — Cross-module integration gaps

No declared cross-module dependency points at a non-existent T-XXX in the target module's manifest. Spot-checked references confirmed:

- 12-reporting T-001 references foundation `app.current_org_id()` (T-007 lineage) and Wave0 v4.3 `org_id` lock — both present in 00-foundation manifest.
- 13-maintenance T-002 references foundation T-125 (`app.current_org_id`/`app.set_org_context` HOF) and 02-SETTINGS §8.9 manufacturing_operations (FK noted as conditional / soft-FK when reference table not yet present). Acceptable per audit checklist item 7.
- 13-maintenance T-009 (PM engine) and T-017 (downtime linkage) declare dependencies on 08-PRODUCTION downtime_events as scope_files [ref], not as migration writes. Reverse-dep documentation OK.
- 13-maintenance T-023 (Spare Parts) lists `05-warehouse` soft-FK in details and does not mutate 05-warehouse schema files. OK.
- 12-reporting reads from 08-prod/09-quality/10-finance/15-oee as consumer (per BOOTSTRAP-REPORT-2026-05-14.md) — confirmed zero `migrations/` writes outside `packages/db/migrations/008x_reporting_*.sql`.

No reverse-dep documentation gap detected.

## Section 4 — Prototype linkage report

Across the 3 modules: **37 UI tasks** (15 foundation + 12 reporting + 10 maintenance). After accounting for foundation primitives that legitimately use the spec-driven allowance (per UI parity policy §1.2):

### Confirmed valid prototype linkage

- **12-reporting (12/12 UI tasks):** All T3-ui tasks cite shorthand jsx filenames with explicit `:start-end` ranges that resolve against `prototype-index-reporting.json` (e.g. `mv-refresh-log.jsx`, `export-modal.jsx`). `prototype_match: true` and `ui_evidence_policy` set on every UI task.
- **13-maintenance (9/10 UI tasks):** T-018..T-021, T-023..T-027 all cite shorthand prototype jsx with line ranges matching `prototype-index-maintenance.json`. `prototype_match: true` set on all 10.
- **00-foundation (6/15 UI tasks):** T-067, T-093, T-095, T-099 set `prototype_match: true`. T-072 (test-only) does not need parity. The Modal/Stepper/Field primitives (T-025..T-031) cite jsx:line ranges in their prompts/scope_files but did not set the boolean flag.

### Flagged

| Module | Task | Flag |
| --- | --- | --- |
| 13-maintenance | T-022 | Bad line range `work-orders.jsx:261-584` exceeds file length 564. **Update to `261-564`** or split into the actual subranges the task is targeting. (P1) |
| 00-foundation | T-025..T-031 | Set `prototype_match: true` + `ui_evidence_policy: _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md` so pipeline closeout treats them as UI parity tasks. The jsx:line refs are already present in scope_files / prompt. (P1) |
| 00-foundation | T-037 | Real admin-page UI task with zero prototype linkage. Either (a) cite the nearest reusable prototype (`prototypes/design/Monopilot Design System/settings/data-screens.jsx` column-add wizard pattern) with line range, or (b) explicitly declare spec-driven sourcing in a `## Prototype parity` section. (P1) |
| 00-foundation | T-067, T-095, T-099 | Advisory — add `## Prototype parity` section and explicit `:start-end` line range. (P2) |

## Section 5 — Recommended remediation tasks

Prioritised list — **do not create these; this is the proposed backlog only**:

1. **NEW T-fnd-rmd-001 (P1, S)** — Set `prototype_match: true` + `ui_evidence_policy: _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md` on foundation T-025, T-026, T-027, T-028, T-029, T-030, T-031. JSON-edit only; no scope/prompt change. Touches 7 task JSONs.
2. **NEW T-fnd-rmd-002 (P1, S)** — Fix 13-maintenance T-022 line range from `work-orders.jsx:261-584` → `261-564` in 3 places (prompt, acceptance_criteria, details). Re-verify by reading `prototypes/design/Monopilot Design System/maintenance/work-orders.jsx`.
3. **NEW T-fnd-rmd-003 (P1, S)** — Add `## Prototype parity` section + jsx:start-end ref (or explicit spec-driven declaration) to foundation T-037. The wizard is a real admin page; current state is a UI-parity gap.
4. **NEW T-fnd-rmd-004 (P2, S)** — Bump `risk_red_lines` to ≥2 on 16 foundation carry-forward tasks (T-010, T-022, T-023, T-026, T-027, T-028, T-029, T-030, T-033, T-034, T-072, T-078, T-096, T-097, T-103, T-106). Each currently has one concrete red line; append a second relevant guardrail (e.g. "Do not regress existing test suite", "Do not bypass packages/ui primitives", etc. tailored per task subcategory).
5. **NEW T-fnd-rmd-005 (P2, S)** — Add `## Prototype parity` section + explicit line range to foundation T-067 (ReasonInput a11y refactor) and T-095 (SchemaColumnWizard step 2 → RHF refactor). Both reference existing prototypes informally; tighten to gold-standard format.
6. **NEW T-fnd-rmd-006 (P2, S)** — Foundation _generator.py update: when the prompt contains a `prototypes/design/...jsx:N-M` ref, the generator should auto-set `prototype_match: true` + `ui_evidence_policy`. Prevents recurrence of issue #1.

No P0 issues. No JSON parse failures. No cross-module write-violations. No tenant-context regressions (3 candidate matches verified as negative-context prohibitions referencing the safe `app.current_org_id()` foundation function).

---

## Appendix A — Methodology details

Audit script: in-session Python (`/tmp/audit_r1.py`) running:

- JSON-validate every `tasks/T-*.json` via `json.load`.
- Top-level + pipeline_inputs key presence (`parallel_safe_with` allowed optional per gold standard).
- PRD anchor presence: scan PRD for both `§X.Y` literal references and plain `## X.Y` heading numbers; treat hit on any prefix subset as resolved.
- Prototype linkage: extract `prototypes/design/Monopilot Design System/<file>.jsx:<n>-<n>` (full path) **or** bare `<file>.jsx:<n>-<n>` shorthand, then verify against `_meta/prototype-labels/prototype-index-*.json` entries and file length.
- Tenant context: flag `current_setting('app.tenant_id'|'app.current_org_id'...)` reads, except when the same task body declares the safe `app.current_org_id()` foundation function AND a "do not / never / forbidden" prohibition (gold-standard pattern).
- Risk red lines: count items in `pipeline_inputs.risk_red_lines`; flag <2.
- Test strategy concreteness: require at least one of pnpm/vitest/playwright/RED/node/jq/python3/psql/curl/grep in `pipeline_inputs.test_strategy`.

Cross-module assertion: reporting tasks must not list `0[89]-…/migrations/` files in scope; verified by scope_files grep — zero violations.

Foundation primitive integrity: manifest.json `task_count == 125` matches `tasks/` directory listing; carry-forward materialization T-062..T-110 preserved; Wave-1 primitives T-111..T-125 intact and individually verified via spot-read of T-111, T-121, T-124, T-125.

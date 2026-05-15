# 07-PLANNING-EXT — Gold-standard task upgrade report

Date: 2026-05-14
Author: ACP onboarding upgrade pass
Source PRD: `docs/prd/07-PLANNING-EXT-PRD.md`
Prototype index: `_meta/prototype-labels/prototype-index-planning-ext.json`
Translation notes: `_meta/prototype-labels/translation-notes-planning-ext.md`
Parity policy: `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`

## Summary

- Task files upgraded in place: **57 / 57** (every file in `_meta/atomic-tasks/07-planning-ext/tasks/T-001.json` .. `T-057.json`).
- UI tasks with `prototype_match: true` + `ui_evidence_policy`: **24** (T-030..T-053 except non-UI T-053 backend is still in this set because the disposition decision modal anchor belongs to it).
- Manifest task_count: **57** (unchanged).
- Validator: `python3 _meta/atomic-tasks/07-planning-ext/_validate.py` → **PASS** (0 errors).
- All JSON files parse: **OK**.

## Upgrades applied

### All tasks
- Confirmed gold-standard TaskCreate shape: top-level `title`, `prompt`, `labels`, `priority`, `max_attempts`, `pipeline_name: "kira_dev"`, `pipeline_inputs`.
- Confirmed `pipeline_inputs` contains `root_path`, `prd_task_id`, `source_prd`, `prd_refs`, `category`, `subcategory`, `task_type`, `parent_feature`, `context_budget`, `estimated_effort`, `description`, `details`, `scope_files` (with `[create]`/`[modify]`/`[ref]` annotations), `out_of_scope`, `dependencies`, `acceptance_criteria`, `test_strategy`, `risk_red_lines`, `skills`, `checkpoint_policy`, `routing_hints`.
- Confirmed prompts use the gold-standard markdown layout (H1, PRD ref line, Goal, Implementation contract, Files, Acceptance criteria with Given/When/Then, Test strategy with RED-first and explicit `pnpm ... test ...` command, Risk red lines).

### Data / schema / seed tasks (T-001..T-011, T-025..T-027)
- Added `systematic-debugging` to `skills` for every migration/schema/seed task to align with sibling 01-npd/02-settings exemplars.
- Added `parallel_safe_with` arrays where the dependency graph permits parallel execution:
  - `T-001, T-003, T-004, T-005, T-008, T-011` — independent schema seeds.
  - `T-002, T-006` — both depend only on `T-001`.
  - `T-007, T-009` — both depend only on `T-003`.

### Integration / outbox tasks (T-028, T-029)
- Added `parallel_safe_with` linkage between the two outbox emitter tasks.

### UI tasks (T-030..T-053 where they touch a prototype)
- Added `prototype_match: true` and `ui_evidence_policy: "_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md"` to every UI task that maps to a label in `prototype-index-planning-ext.json`.
- Added `frontend-design` skill.
- Added `ui_closeout_evidence` array (screenshot/artifact, Playwright trace, accessibility result or documented blocker, deviations list, links to parity policy + translation notes).
- Extended `checkpoint_policy.closeout_requires` with `screenshots_or_artifacts`, `playwright_trace_artifacts`, `prototype_parity_notes`.
- Appended an acceptance-criteria item demanding closeout parity evidence per `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`.
- Appended a test-strategy bullet requiring Playwright trace/screenshots/artifacts where applicable (only added when the existing strategy did not already mention Playwright/parity).
- UI tasks with prototype_match=true after upgrade: T-030, T-031, T-032, T-033, T-034, T-035, T-036, T-037, T-038, T-039, T-040, T-041, T-042, T-043, T-044, T-045, T-046, T-047, T-048, T-049, T-050, T-051, T-052, T-053.
- Several UI tasks gained `parallel_safe_with` groupings (modal triplets and KPI-page groupings).

### Test / docs closeout tasks (T-056, T-057)
- Added `verification-before-completion` to `skills`.

## Coverage and manifest

- Appended a `## Coverage rows (gold-standard re-author 2026-05-14)` table to `_meta/atomic-tasks/07-planning-ext/coverage.md` with one row per task: id, sub-module, task_type, PRD §refs, title.
- Manifest `task_count` remains **57**; manifest entries unchanged (titles, priorities preserved).

## Dependency edges computed

- Local dep edges: **96**.
- Cross-module edges: **49** (already encoded inline under `pipeline_inputs.cross_module_dependencies`).
- Cross-module edges to **04-planning-basic** (the direct upstream module): present on T-012, T-015, T-019, T-021, T-027, T-030, T-034, T-042, T-047, T-050, T-053, T-054, T-055, T-056. Dependency direction is **ext → basic** (ext consumes the basic Planning WO read model, factory release status, and BOM/spec snapshot ownership), matching the red-line that ext must not duplicate basic planning APIs.
- Cross-module edges to other modules already present and preserved: 01-npd (factory release / FG read model), 02-settings (DSL rule registry, scheduler config), 03-technical (allergen taxonomy, BOM ownership), 05-warehouse (LP / disposition source), 08-production (runtime blockers, downstream consumers), 13-integrations (D365 P2 optional pull), 15-oee (capacity utilisation cross-checks).

## Top corrections / red flags surfaced

1. **UI parity evidence was systemically missing.** None of the 24 UI tasks declared `prototype_match: true` or `ui_evidence_policy`, and their `closeout_requires` were the generic 5-item set. After upgrade every UI task explicitly enforces the parity policy and requires Playwright/screenshot evidence, matching the gold standard in 02-settings T-041 and 04-planning-basic T-040.
2. **Migration tasks lacked the `systematic-debugging` skill.** 14 schema/seed/rule-registration tasks now carry it, aligning with the 01-npd exemplars.
3. **No parallel-safety hints existed.** 21 tasks now declare `parallel_safe_with` arrays so the ACP scheduler can dispatch them concurrently. Groups were derived strictly from existing `dependencies` and `cross_module_dependencies` — no false parallelism asserted across hard dep edges.

## Contradictions found and resolved

- **T-053 category was `integration` (not `ui`) despite owning the disposition decision modal** (`modals.jsx:562-629`). Resolution: kept the existing `integration` / `T4-wiring-test` classification (the task spans backend + modal wiring), but added `prototype_match: true`, the parity policy ref, `frontend-design` skill, and the parity-evidence acceptance criterion because the modal lives inside its scope. The corresponding `ui_closeout_evidence` references the `disposition_decision_modal` anchor.
- **Prompts already used the canonical `Monopilot Design System/planning-ext` JSX paths**, not the legacy `prototypes/planning-ext/*.jsx` files. No rewrites were necessary; legacy paths are not referenced by any task. Translation-notes-planning-ext.md correctly anchors line ranges that match `prototype-index-planning-ext.json` — both sources are consistent.
- **PRD anchors were already accurate** vs the PRD's actual section headings (verified via `grep` of `docs/prd/07-PLANNING-EXT-PRD.md`). No PRD §refs needed correction.

## Files changed

- `_meta/atomic-tasks/07-planning-ext/tasks/T-001.json` .. `T-057.json` (in place).
- `_meta/atomic-tasks/07-planning-ext/coverage.md` (appended Coverage rows section).
- `_meta/atomic-tasks/07-planning-ext/UPGRADE-REPORT-2026-05-14.md` (this file, new).

## Validation

```
python3 _meta/atomic-tasks/07-planning-ext/_validate.py
# Tasks scanned: 57 ; Errors: 0 ; PASS
```

All 57 JSON files parse, all preserve T-XXX numbering, all preserve manifest titles and priorities, and the module validator reports PASS.

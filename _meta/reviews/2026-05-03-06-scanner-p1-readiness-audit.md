# Audit readiness — 06-SCANNER-P1

Data: 2026-05-03
Repo: `/Users/mariuszkrawczyk/Projects/monopilot-kira`
Zakres: read-only audit PRD/UX/prototype-label/atomic-task readiness; bez implementacji aplikacji.

## Pliki sprawdzone

- `06-SCANNER-P1-PRD.md`
- `design/06-SCANNER-P1-UX.md`
- `design/Monopilot Design System/scanner/*.jsx`
- `design/Monopilot Design System/settings/ops-screens.jsx` przez wpis `devices_screen`
- `_meta/prototype-labels/prototype-index-scanner.json`
- `_meta/prototype-labels/master-index.json`
- `_meta/prototype-labels/translation-notes-scanner.md`
- `_meta/atomic-tasks/*` i istniejące wzorce Wave0
- `_meta/reviews/2026-05-03-acp-real-task-shape.md`

## Werdykt

Szacowana gotowość 06-SCANNER-P1 do dekompozycji/ACP: około 72-78%.

PRD i UX są mocne i po reconciliation pass mają sensowną traceability matrix, ale moduł nie jest jeszcze na poziomie 95%+ Wave0, bo nie istnieje folder atomic tasks dla 06-SCANNER-P1, a indeks etykiet prototypu ma kilka niespójności i braków względem realnych komponentów JSX.

Najważniejszy blocker do 95%+: utworzyć `_meta/atomic-tasks/06-scanner-p1/` z ACP-ready JSON tasks, coverage, manifestem i walidatorem; następnie poprawić/uzupełnić prototype label index dla ekranów faktycznie istniejących w JSX.

## PRD readiness

Mocne strony:

- PRD jest bardzo szczegółowy: scope P1 06-a..06-e, out-of-scope P2, constraints, decisions, module map, screen catalog, requirements per screen, barcode/GS1, auth/security, API contract, validation rules, telemetry i build sequence.
- PRD jasno definiuje unlock order: 06-a po 00/02; 06-b po 03/05/06-a; 06-c po 05; 06-d po 04/05/08; 06-e po 08/09.
- Screen catalog obejmuje SCN-010, 011, 011b, 011c, 012, 013, home, 020, 030, 031, 040, 050, 060, 070, 071, 072, 073, 080, 081, 082, 083, 084, 090, 095.
- §8.8 traceability matrix próbuje mapować PRD ↔ UX ↔ prototype labels.

Gaps / ryzyka:

- §8.8 summary mówi o 41/41 wpisach w prototype-index, ale aktualny `prototype-index-scanner.json` ma 42 entries.
- §8.8 mapuje SCN-011b/011c do `pin_screen` reused, podczas gdy w prototypie istnieją osobne `PinSetupScreen` i `PinChangeScreen`; brak osobnych labeli może utrudnić task decomposition.
- SCN-030 done, SCN-040 done, SCN-050 done, SCN-060 done, SCN-073 done, SCN-080 done, output/co-product/waste done są często oznaczone jako composed/inline albo w ogóle nie mają własnego labela mimo że w JSX istnieją jako osobne komponenty.
- SCN-090 Offline Queue ma jawny `[NO-PROTOTYPE-YET]` i jest P2 — to OK, ale atomic tasks muszą wyraźnie feature-flag/defer P2 i nie implementować offline P2 w P1.
- SCN-095 Inquiry jest opisany jako P2 shell P1; tasks muszą mieć jasny feature flag boundary.

## UX/prototype readiness

Mocne strony:

- `design/06-SCANNER-P1-UX.md` ma route map, role-based visibility, szczegółowe screen specs, modals/bottom sheets, scan sequences, empty states, notifications, responsive/device notes, scan contract, LP state machine i CSS class reference.
- Prototype source exists under `design/Monopilot Design System/scanner/` and covers major P1 flows:
  - auth/login/site context/home/settings
  - PO receive, TO receive
  - putaway
  - move/split
  - pick
  - WO consume/execute
  - output/co-product/waste
  - QA list/inspect/fail reason/done
  - LP inquiry shell
  - modals: reason, FEFO, best-before, partial consume, printer, language, logout, scan error, qty keypad, hard block, LP locked, camera scanner.
- JSX app router state confirms screens are renderable in the prototype for most P1 route states.

Gaps / prototype labels:

- Nie znaleziono explicit label attributes in JSX (`data-prototype-label`, `data-screen`, etc.). Labeling is only external/index-based. To reach 95%+, add explicit lightweight markers or ensure index line ranges are treated as canonical.
- Components present in JSX but not separately indexed:
  - `PinSetupScreen` -> expected `pin_setup_screen`
  - `PinChangeScreen` -> expected `pin_change_screen`
  - `CameraScanner` -> expected `camera_scanner`
  - `ToDoneScreen` -> expected `to_done_screen`
  - `PutawayDoneScreen` -> expected `putaway_done_screen`
  - `MoveDoneScreen` -> expected `move_done_screen`
  - `SplitDoneScreen` -> expected `split_done_screen`
  - `PickDoneScreen` -> expected `pick_done_screen`
  - `ConsumeDoneScreen` -> expected `consume_done_screen`
  - `OutputDoneScreen` -> expected `output_done_screen`
  - `CoproductDoneScreen` -> expected `coproduct_done_screen`
  - `WasteDoneScreen` -> expected `waste_done_screen`
  - `QaDoneScreen` -> expected `qa_done_screen`
- Some omissions may be intentional composition, but then index/PRD should say explicitly: `composed_by: success_screen pattern` or `shares label with X`, with line ranges to the concrete component.
- Master index mismatch:
  - Scanner index has `settings_screen`, master has `scanner_settings_screen`.
  - Scanner index has `devices_screen`, master has `scanner_devices_screen`.
  - Counts match at 42, but labels differ, so downstream lookup by label can break.
- `translation-notes-scanner.md` is stale: says generated 2026-04-23, components indexed 41, all 37 components hard-coded Polish, BL-SCN-04 PIN setup/change not built. Current JSX has PIN setup/change and index has 42 entries.

## Atomic tasks / ACP readiness

Status: no atomic task folder exists for this module.

Observed existing Wave0 folders:

- `_meta/atomic-tasks/00-foundation/`
- `_meta/atomic-tasks/01-npd/`
- `_meta/atomic-tasks/02-settings/`
- `_meta/atomic-tasks/03-technical/`

No `_meta/atomic-tasks/06-scanner-p1/` found.

Therefore 06-SCANNER-P1 is not ACP-ready yet. There are no task JSON files to validate for:

- top-level ACP shape (`title`, `prompt`, `labels`, `priority`, `max_attempts`, `pipeline_name`, `pipeline_inputs`)
- required `pipeline_inputs.root_path`
- canonical metadata (`description`, `details`, `scope_files`, `acceptance_criteria`, `test_strategy`, `risk_red_lines`, `skills`, `checkpoint_policy`)
- local `T-XXX` dependencies
- cross-module dependencies separated into `pipeline_inputs.cross_module_dependencies`
- priority normalization (lower = sooner)
- rich prompts, implementation contracts, test strategies, UI screenshot/trace requirements

## Required plan to reach 95%+

1. Fix prototype label/index consistency.
   - Update `prototype-index-scanner.json` and `master-index.json` label names to match exactly.
   - Decide whether `scanner_settings_screen`/`scanner_devices_screen` or `settings_screen`/`devices_screen` is canonical, then align both indexes.
   - Add labels for the missing concrete JSX components listed above, or explicitly mark them as composed/reused with concrete line ranges.
   - Add or document JSX-side label markers. Preferred minimal marker: `data-prototype-label="..."` on each top-level screen/modal root in prototype JSX.
   - Refresh `translation-notes-scanner.md` from current JSX and index.

2. Create atomic task package.
   - Create `_meta/atomic-tasks/06-scanner-p1/`.
   - Include `tasks/T-001.json ...`, `coverage.md`, `manifest.json` (or same convention as Wave0 folders), `_validate.py`.
   - Use ACP real shape only; no ACP-generated fields.
   - Set `pipeline_inputs.root_path` to `/Users/mariuszkrawczyk/Projects/monopilot-kira`.

3. Decompose by unlockable submodules, not one huge scanner task.
   Suggested initial sequence:
   - 06-a Shell/Core: scanner route shell, dark mobile primitives, auth/session/PIN/context, GS1 parser, audit log, scan input, settings, device-mode behavior.
   - 06-b Warehouse In: PO receive, TO receive, putaway, receive/putaway success screens, best-before/reason/printer P2 stub boundaries.
   - 06-c Movement: move LP, lock handling, split LP, success screens.
   - 06-d Pick/Consume: pick WO/list/scan/done, WO list/detail/execute, consume scan gates, FEFO/best-before/use-by/LP lock/qty keypad.
   - 06-e Output/QA: output, partial consume gate, co-product, waste, QA list/inspect/fail reason/done.
   - Cross-cutting tasks: scanner i18n, RBAC menu filtering, telemetry, E2E happy/error paths, accessibility/touch-target pass.

4. Encode cross-module blockers explicitly.
   - Use local dependencies only for in-module `T-XXX` tasks.
   - Put blockers on 00/02/03/04/05/08/09 in `pipeline_inputs.cross_module_dependencies` and prompt text.
   - Do not depend locally on `05-WH-T-...` unless an importer mapping is formally supported.

5. Make UI tasks screenshot/trace-ready.
   Each UI task should include:
   - PRD refs and UX line refs.
   - Prototype labels and file:line refs.
   - Structural parity criteria.
   - Visual parity criteria for 390x844 dark scanner frame.
   - Interaction parity criteria for hardware wedge, camera fallback, manual fallback where applicable.
   - Playwright/mobile viewport tests, axe/touch target checks, screenshots and traces as closeout artifacts.

6. Add validator checks like Wave0.
   - JSON parses and conforms to ACP shape.
   - Required canonical metadata present.
   - `pipeline_inputs.root_path` present and exact.
   - dependencies resolve locally.
   - no forbidden generated fields.
   - one task type only.
   - priority values from approved set.
   - coverage references all HIGH/MEDIUM FRs and all P1 screens/prototype labels.

## Suggested task families/count range

Approximate count to reach ACP-ready granularity: 60-85 tasks.

- 8-12 infra/auth/core tasks for 06-a.
- 8-12 shared scanner UI primitive tasks.
- 10-14 warehouse-in tasks.
- 6-10 movement/split tasks.
- 12-18 pick/consume tasks.
- 10-14 output/co-product/waste/QA tasks.
- 5-8 cross-cutting hardening/E2E/readiness tasks.

## Blockers / questions

Blockers:

- No atomic tasks for scanner P1.
- Prototype index/master-index label mismatch.
- Missing labels or explicit composed markers for multiple concrete screens.
- Stale translation notes.

Questions to lock before task generation:

1. Czy done screens mają dostać osobne prototype labels/tasks, czy traktujemy je jako `SuccessScreen` composed pattern? Recommendation: osobne labels, bo mają różne dane i acceptance criteria.
2. Czy canonical labels mają mieć prefix `scanner_` for settings/devices? Recommendation: avoid prefix for module-local index, but master/index must match exactly.
3. Czy `CameraScanner` is P1 core because PRD says camera library P1, or P2-like stub? PRD says camera P1 core; tasks should include camera permission/viewfinder and zxing/browser fallback unless explicitly deferred.
4. Czy SCN-013 Devices belongs in 06-a tasks or remains under Settings module tasks? PRD moved it into scanner; if in scanner, create scanner task with Settings dependency.
5. Czy LP Inquiry SCN-095 is P1 shell behind feature flag or fully P2? Current PRD says P2 shell P1; tasks must gate it.

## Bottom line

06-SCANNER-P1 has strong PRD/UX/prototype foundation, but it is not 95%+ implementation-ready until atomic tasks are created and prototype labels are reconciled. The fastest path is a Wave0-style readiness pass: label/index patch first, then generate validated ACP-shaped tasks with rich prompts and coverage for 06-a..06-e.

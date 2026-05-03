# PRD Coverage — 06-scanner-p1

Source PRD: `06-SCANNER-P1-PRD.md`.
Hardening date: 2026-05-03.
Readiness target: Wave Next-3 docs/meta/prototype/task readiness >=95% before ACP execution.

## Coverage status

The prior structural placeholder has been replaced with a PRD/UX/prototype/task coverage table. All P1 Scanner epics have task coverage, canonical prototype labels, mobile evidence policy, and explicit cross-module dependency metadata.

## Global task-readiness controls

- All UI tasks require mobile viewport evidence at `390x844`.
- UI closeout requires screenshot and Playwright trace artifacts.
- UI parity acceptance criteria must cite the relevant `design/Monopilot Design System/scanner/*.jsx:line-range` prototype.
- Scanner-prefixed ambiguous labels are canonical: `scanner_settings_screen`, `scanner_devices_screen`.
- `PinSetupScreen`, `PinChangeScreen`, and `CameraScanner` are first-class MVP prototype labels.
- User-visible done screens are first-class prototype labels.
- Cross-module dependencies are represented in `pipeline_inputs.cross_module_dependencies` for Settings, Warehouse, Planning, Production, and Quality contracts.

## PRD / UX / prototype / task matrix

| Area | PRD refs | UX / prototype labels | Task files | Status |
|---|---|---|---|---|
| Shell data model | §8.1 BE-001..013 | session/audit/device contracts | `T-001`..`T-003`, `T-006`..`T-011` | covered |
| Capability, feedback, scan primitives | §6 D2/D5, §8.1 FE-006..011 | `camera_scanner`, modal/input primitives | `T-004`, `T-005`, `T-013`..`T-015` | covered |
| Scanner shell and permissions | §6 D1, §8.1 FE-001/012/014/015 | `home_screen`, `scanner_settings_screen`, `block_fullscreen` | `T-012`, `T-016`, `T-023`..`T-026`, `T-048` | covered |
| Auth and context screens | §8.1 FE-002..004b | `login_screen`, `pin_screen`, `pin_setup_screen`, `pin_change_screen`, `site_select_screen`, `scanner_devices_screen` | `T-017`..`T-022` | covered |
| Receive PO | §8.2 BE/FE-020..025 | `po_list_screen`, `po_lines_screen`, `po_item_screen`, `po_done_screen` | `T-027`, `T-028`, `T-031` | covered |
| Receive TO | §8.2 BE/FE-020/023/022 | `to_list_screen`, `to_scan_screen`, `to_done_screen` | `T-027`, `T-029`, `T-032` | covered |
| Putaway | §8.2 BE/FE-024..025 | `putaway_scan_screen`, `putaway_suggest_screen`, `putaway_done_screen` | `T-030`, `T-033` | covered |
| Move and split | §8.3 BE/FE-030..033 | `move_screen`, `move_done_screen`, `split_scan_screen`, `split_qty_screen`, `split_done_screen` | `T-034`..`T-036` | covered |
| Pick for WO | §8.4 BE/FE-040..042 | `pick_wo_list_screen`, `pick_list_screen`, `pick_scan_screen`, `pick_done_screen` | `T-037`, `T-040` | covered |
| Consume-to-WO and WO execute | §8.4 BE/FE-043..048 | `wo_list_screen`, `wo_detail_screen`, `wo_execute_screen`, `consume_scan_screen`, `consume_done_screen` | `T-038`, `T-039`, `T-041` | covered |
| Output registration | §8.5 BE/FE-050..051 | `output_screen`, `output_done_screen` | `T-042`, `T-044` | covered |
| Co-product registration | §8.5 BE/FE-051..054 | `coproduct_screen`, `coproduct_done_screen` | `T-042`, `T-045` | covered |
| Waste registration | §8.5 BE/FE-052..054 | `waste_screen`, `waste_done_screen` | `T-042`, `T-046` | covered |
| QA inspection | §8.5 BE/FE-053..060 | `qa_list_screen`, `qa_inspect_screen`, `qa_fail_reason_screen`, `qa_done_screen` | `T-043`, `T-047` | covered |
| Offline P1 stub and P2 shell | §8.6 FE-070, FE-074 | `inquiry_screen`; SCN-090 remains P2 queue view | `T-026`, `T-048` | covered for P1 / deferred for P2 |

## Canonical prototype label inventory

- Index file: `_meta/prototype-labels/prototype-index-scanner.json`.
- Canonical labels after hardening: 55.
- Master index aligned to the same 55 scanner labels.
- Ambiguous labels replaced: `settings_screen` -> `scanner_settings_screen`; `devices_screen` -> `scanner_devices_screen`.
- First-class added labels: `pin_setup_screen`, `pin_change_screen`, `camera_scanner`, `to_done_screen`, `putaway_done_screen`, `move_done_screen`, `split_done_screen`, `pick_done_screen`, `consume_done_screen`, `output_done_screen`, `coproduct_done_screen`, `waste_done_screen`, `qa_done_screen`.

## Residual notes

- Application implementation is not part of this hardening wave.
- SCN-090 full queue UI remains P2, with P1 limited to online/offline indicator and disabled P2 modal.
- Literal `data-prototype-label` markers in JSX are still optional for future prototype rebuilds; current readiness uses explicit prototype index and traceability mapping.

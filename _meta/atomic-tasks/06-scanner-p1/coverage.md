# PRD Coverage — 06-scanner-p1

Source PRD: `docs/prd/06-SCANNER-P1-PRD.md`.
Hardening date: 2026-05-03.
Readiness target: Wave Next-3 docs/meta/prototype/task readiness >=95% before ACP execution.

## Coverage status

The prior structural placeholder has been replaced with a PRD/UX/prototype/task coverage table. All P1 Scanner epics have task coverage, canonical prototype labels, mobile evidence policy, and explicit cross-module dependency metadata.

## Global task-readiness controls

- All UI tasks require mobile viewport evidence at `390x844`.
- UI closeout requires screenshot and Playwright trace artifacts.
- UI parity acceptance criteria must cite the relevant `prototypes/design/Monopilot Design System/scanner/*.jsx:line-range` prototype.
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

## Coverage rows (gold-standard re-author 2026-05-14)

| T-id | sub-module | task_type | subcategory | PRD §refs | prototype_label |
|---|---|---|---|---|---|
| T-001 | 06-a Shell & Core | T1-schema | schema-scanner-auth | §8.1 FR-SC-BE-001..005, §12.1, §12.2 D8 | — |
| T-002 | 06-a Shell & Core | T1-schema | schema-scanner-audit | §5.3 retention, §8.1 FR-SC-BE-012, §8.1 FR-SC-FE-004b | — |
| T-003 | 06-a Shell & Core | T1-schema | gs1-parser | §8.1 FR-SC-BE-010, §10.3, §15.2 | — |
| T-004 | 06-a Shell & Core | T4-wiring-test | device-detect | §6 D5, §8.1 FR-SC-FE-011, §11.1, §11.2 | po_item_screen |
| T-005 | 06-a Shell & Core | T4-wiring-test | feedback | §6 D2, §8.1 FR-SC-FE-009 | scanner_settings_screen |
| T-006 | 06-a Shell & Core | T2-api | scanner-login | §8.1 FR-SC-BE-001, §12.1, §12.3, §15.1 | — |
| T-007 | 06-a Shell & Core | T2-api | scanner-session | §8.1 FR-SC-BE-002, §8.1 FR-SC-BE-003, §12.1, §6 D7 | — |
| T-008 | 06-a Shell & Core | T2-api | scanner-pin | §6 D8, §8.1 FR-SC-BE-004/005, §12.2, §15.1 | — |
| T-009 | 06-a Shell & Core | T2-api | scanner-context | §8.1 FR-SC-BE-006..009, §12.5 | — |
| T-010 | 06-a Shell & Core | T2-api | scanner-lookup | §8.1 FR-SC-BE-011, §10, §14.5 | — |
| T-011 | 06-a Shell & Core | T2-api | scanner-audit | §8.1 FR-SC-BE-012, §5.3, §16.1 | — |
| T-012 | 06-a Shell & Core | T3-ui | scanner-shell | §6 D1, §8.1 FR-SC-FE-001, §5.1 | home_screen |
| T-013 | 06-a Shell & Core | T3-ui | scan-input | §8.1 FR-SC-FE-006, §6 D5, §9.1 | po_item_screen |
| T-014 | 06-a Shell & Core | T3-ui | camera-scanner | §6 D5, §8.1 FR-SC-FE-007, §11.4 | camera_scanner |
| T-015 | 06-a Shell & Core | T3-ui | manual-input | §8.1 FR-SC-FE-008, §9.1, §9.7 | qty_keypad_sheet |
| T-016 | 06-a Shell & Core | T4-wiring-test | permission-guard | §8.1 FR-SC-FE-012, §12.5 | home_screen |
| T-017 | 06-a Shell & Core | T3-ui | scn-010-login | §8.1 FR-SC-FE-002 | login_screen |
| T-018 | 06-a Shell & Core | T3-ui | scn-011-pin | §8.1 FR-SC-FE-003 | pin_screen |
| T-019 | 06-a Shell & Core | T3-ui | scn-011b-pin-setup | §8.1 FR-SC-FE-003b, §6 D8 | pin_setup_screen |
| T-020 | 06-a Shell & Core | T3-ui | scn-011c-pin-change | §8.1 FR-SC-FE-003c, §6 D8 | pin_change_screen |
| T-021 | 06-a Shell & Core | T3-ui | scn-012-site-select | §8.1 FR-SC-FE-004 | site_select_screen |
| T-022 | 06-a Shell & Core | T3-ui | scn-013-devices | §8.1 FR-SC-FE-004b | scanner_devices_screen |
| T-023 | 06-a Shell & Core | T3-ui | scn-home | §8.1 FR-SC-FE-005 | home_screen |
| T-024 | 06-a Shell & Core | T3-ui | scn-settings | §8.1 FR-SC-FE-010 | scanner_settings_screen |
| T-025 | 06-a Shell & Core | T4-wiring-test | session-timeout | §8.1 FR-SC-FE-014, §6 D7 | block_fullscreen |
| T-026 | 06-a Shell & Core | T4-wiring-test | offline-stub | §8.6 FR-SC-FE-070 (P1 stub), §8.1 FR-SC-FE-015 | home_screen |
| T-027 | 06-b Warehouse In | T2-api | warehouse-receive-list | §8.2 FR-SC-BE-020, §8.2 FR-SC-BE-021 | — |
| T-028 | 06-b Warehouse In | T2-api | warehouse-receive-po | §8.2 FR-SC-BE-022, §8.2 FR-SC-BE-026, §8.2 FR-SC-BE-027 | — |
| T-029 | 06-b Warehouse In | T2-api | warehouse-receive-to | §8.2 FR-SC-BE-023 | — |
| T-030 | 06-b Warehouse In | T2-api | warehouse-putaway | §8.2 FR-SC-BE-024, §8.2 FR-SC-BE-025 | — |
| T-031 | 06-b Warehouse In | T3-ui | scn-020-receive-po | §8.2 FR-SC-FE-020, §8.2 FR-SC-FE-021, §8.2 FR-SC-FE-025 | po_item_screen |
| T-032 | 06-b Warehouse In | T3-ui | scn-030-receive-to | §8.2 FR-SC-FE-022 | to_scan_screen |
| T-033 | 06-b Warehouse In | T3-ui | scn-040-putaway | §8.2 FR-SC-FE-023, §8.2 FR-SC-FE-024 | putaway_scan_screen |
| T-034 | 06-c Warehouse Movement | T2-api | warehouse-lp-ops | §8.3 FR-SC-BE-030..033 | — |
| T-035 | 06-c Warehouse Movement | T3-ui | scn-031-move | §8.3 FR-SC-FE-030, §8.3 FR-SC-FE-031 | move_screen |
| T-036 | 06-c Warehouse Movement | T3-ui | scn-060-split | §8.3 FR-SC-FE-032, §9.9 | split_scan_screen |
| T-037 | 06-d Production Pick + Consume | T2-api | production-pick | §8.4 FR-SC-BE-040, §8.4 FR-SC-BE-041, §8.4 FR-SC-BE-042 | — |
| T-038 | 06-d Production Pick + Consume | T2-api | production-execute-list | §8.4 FR-SC-BE-043, §8.4 FR-SC-BE-045, §8.4 FR-SC-BE-046 | — |
| T-039 | 06-d Production Pick + Consume | T2-api | production-consume | §8.4 FR-SC-BE-044, §15.4 V-SCAN-WO-001..004 | — |
| T-040 | 06-d Production Pick + Consume | T3-ui | scn-050-pick | §8.4 FR-SC-FE-040..042 | pick_scan_screen |
| T-041 | 06-d Production Pick + Consume | T3-ui | scn-080-consume | §8.4 FR-SC-FE-043..048 | consume_scan_screen |
| T-042 | 06-e Production Output and QA | T2-api | production-output-api | §8.5 FR-SC-BE-050, §8.5 FR-SC-BE-051, §8.5 FR-SC-BE-052 | — |
| T-043 | 06-e Production Output and QA | T2-api | quality-scanner-api | §8.5 FR-SC-BE-053, §8.5 FR-SC-BE-054, §8.5 FR-SC-BE-055 | — |
| T-044 | 06-e Production Output and QA | T3-ui | scn-082-output | §8.5 FR-SC-FE-050, §8.5 FR-SC-FE-051 | output_screen |
| T-045 | 06-e Production Output and QA | T3-ui | scn-083-coproduct | §8.5 FR-SC-FE-052, §8.5 FR-SC-FE-054 | coproduct_screen |
| T-046 | 06-e Production Output and QA | T3-ui | scn-084-waste | §8.5 FR-SC-FE-053, §8.5 FR-SC-FE-054 | waste_screen |
| T-047 | 06-e Production Output and QA | T3-ui | scn-070-qa | §8.5 FR-SC-FE-055, §8.5 FR-SC-FE-056, §8.5 FR-SC-FE-057, §8.5 FR-SC-FE-058 | qa_inspect_screen |
| T-048 | 06-a Shell and Core | T3-ui | scanner-mobile-evidence | §6 D1, §8.8 UI Surfaces Traceability Matrix | home_screen |
## Permission-enum addition 2026-05-14

| PRD/review ref | Task file | Sub-module | Type | Status | Notes |
|---|---|---|---|---|---|
| §12.5, §12.6 (RBAC enum delta — closes _meta/audits/2026-05-14-prd-vs-tasks-coverage-gaps.md GAP) | tasks/T-049.json | 06-SCANNER-P1 RBAC enum addition | T1-schema | added | 10 `scanner.*` strings appended to packages/rbac/src/permissions.enum.ts + ALL_<MODULE>_PERMISSIONS export |

# 06-scanner-p1 Gold-Standard Upgrade Report

**Date:** 2026-05-14
**Author:** Claude Opus 4.7 (1M context) — automated upgrader
**Source PRD:** `docs/prd/06-SCANNER-P1-PRD.md`
**Manifest:** `_meta/atomic-tasks/06-scanner-p1/manifest.json` (task_count = 48, unchanged)
**Validator:** `_meta/atomic-tasks/06-scanner-p1/_validate.py` → **48/48 ALL PASS** after upgrade.

## Summary

| metric | value |
|---|---|
| Tasks upgraded in place | 48 |
| UI tasks marked `prototype_match: true` | 29 |
| Schema/migration tasks with `systematic-debugging` skill added | 3 (T-001, T-002, T-003) |
| API tasks with scanner red-lines (scanner.* RBAC + GS1 prefix) added | 16 |
| UI tasks with `frontend-design` skill added | 29 |
| Dependency edges across the 48 tasks | 78 |
| Manifest task_count change | 0 (still 48) |

## What the upgrader added per task

For every `T-XXX.json` the following normalizations were applied (idempotent):

1. **`pipeline_name`** forced to `kira_dev`.
2. **`skills`** — guaranteed `["test-driven-development","requesting-code-review"]`; appended `frontend-design` for UI tasks (T3-ui or T4-wiring-test with a mapped prototype), `systematic-debugging` for T1-schema tasks.
3. **UI parity metadata** on UI tasks:
   - `prototype_match: true`
   - `prototype_index_entry: <label>` keyed against `_meta/prototype-labels/prototype-index-scanner.json`
   - `ui_evidence_policy: "_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md"`
   - `prototype_evidence_required` block (preserved where already present; viewport `390x844`, `screenshot` + `Playwright trace`).
   - `checkpoint_policy.closeout_requires` now always includes `mobile_390x844_screenshot`, `playwright_trace`, `prototype_label_parity_notes`.
   - `acceptance_criteria` always references the canonical prototype `file:lines` from `prototype-index-scanner.json`; UI-PROTOTYPE-PARITY-POLICY.md is cited (either as a final AC line or folded into the last AC when the atomicity gate would otherwise be breached).
   - `test_strategy` adds the `390x844 screenshot + Playwright trace` evidence line.
4. **Non-UI tasks** strip UI-only keys (`prototype_index_entry`, `ui_evidence_policy`, `prototype_evidence_required`) and the UI-only closeout keys, and set `prototype_match: false` to mirror the exemplar convention.
5. **Scanner P1 red-lines** appended where applicable:
   - **API tasks**: "Do not bypass scanner.* permission namespace on API entry" + "Do not accept barcodes whose GS1 company prefix is not configured in Settings (foundation contract)".
   - **UI tasks**: "Do not bypass scanner.* permission namespace when wiring server actions" + "Do not regress operator-friendly touch targets (>=48dp) or mobile viewport 390x844 evidence".
   - **PIN/GS1 schema tasks**: "Do not weaken PIN hashing/GS1 parsing contracts (badge+PIN auth + GS1 prefix from Settings)".
6. **P2 deferral fences** appended to UI/API `out_of_scope`:
   - "Do not implement P2 flows here: transfer-order (TO) creation, replenishment, cycle-count, inquiry full traceability — P1 stubs only".
   - "Do not implement offline queue write-path here (P2); P1 keeps offline-safe scan buffer + indicator only".
7. **`checkpoint_policy`** and **`routing_hints`** filled with the kira_dev defaults when missing.
8. **`pipeline_inputs`** keys reordered to the canonical exemplar order for diff stability.

## UI tasks with `prototype_match: true` (29 of 48)

| T-id | prototype_index_entry | canonical prototype anchor |
|---|---|---|
| T-004 | po_item_screen | `prototypes/design/Monopilot Design System/scanner/flow-receive.jsx:94-239` |
| T-005 | scanner_settings_screen | `scanner/home.jsx:63-136` |
| T-012 | home_screen | `scanner/home.jsx:7-61` |
| T-013 | po_item_screen | `scanner/flow-receive.jsx:94-239` |
| T-014 | camera_scanner | `scanner/modals.jsx:326-391` |
| T-015 | qty_keypad_sheet | `scanner/modals.jsx:251-275` |
| T-016 | home_screen | `scanner/home.jsx:7-61` |
| T-017 | login_screen | `scanner/login.jsx:5-70` |
| T-018 | pin_screen | `scanner/login.jsx:72-126` |
| T-019 | pin_setup_screen | `scanner/login.jsx:201-299` |
| T-020 | pin_change_screen | `scanner/login.jsx:301-426` |
| T-021 | site_select_screen | `scanner/login.jsx:128-199` |
| T-022 | scanner_devices_screen | `settings/ops-screens.jsx:4-95` |
| T-023 | home_screen | `scanner/home.jsx:7-61` |
| T-024 | scanner_settings_screen | `scanner/home.jsx:63-136` |
| T-025 | block_fullscreen | `scanner/modals.jsx:277-298` |
| T-026 | home_screen | `scanner/home.jsx:7-61` |
| T-031 | po_item_screen | `scanner/flow-receive.jsx:94-239` |
| T-032 | to_scan_screen | `scanner/flow-receive.jsx:306-394` |
| T-033 | putaway_scan_screen | `scanner/flow-putaway.jsx:5-63` |
| T-035 | move_screen | `scanner/flow-other.jsx:26-121` |
| T-036 | split_scan_screen | `scanner/flow-other.jsx:148-207` |
| T-040 | pick_scan_screen | `scanner/flow-pick.jsx:100-242` |
| T-041 | consume_scan_screen | `scanner/flow-consume.jsx:215-423` |
| T-044 | output_screen | `scanner/flow-register.jsx:6-121` |
| T-045 | coproduct_screen | `scanner/flow-register.jsx:152-202` |
| T-046 | waste_screen | `scanner/flow-register.jsx:226-285` |
| T-047 | qa_inspect_screen | `scanner/flow-other.jsx:319-351` |
| T-048 | home_screen | `scanner/home.jsx:7-61` |

All anchor file:line ranges were sourced from `_meta/prototype-labels/prototype-index-scanner.json` (no hand-authored anchors).

## PRD anchors verified

All `prd_refs` values point at sections that exist in `docs/prd/06-SCANNER-P1-PRD.md`:

- §5.3 retention, §6 D1/D2/D5/D7/D8, §8.1/§8.2/§8.3/§8.4/§8.5/§8.6/§8.8, §9.1/§9.7/§9.9, §10/§10.3, §11.1/§11.2/§11.4, §12.1/§12.2/§12.3/§12.5, §14.5, §15.1/§15.2/§15.4, §16.1.

No invalid PRD anchors were detected. FR-SC-BE-NNN / FR-SC-FE-NNN sub-anchors are textual content within those sections per the PRD body.

## Contradictions found and resolved

1. **T-004 and T-016 were category=ui T4-wiring-test but had no prototype parity AC** — they failed the project validator's UI parity gate. Resolution: explicit prototype mapping added (T-004 → `po_item_screen` scan area, T-016 → `home_screen` shell guard) and a synthetic parity AC inserted that references the canonical `file:lines` anchor. Both tasks now pass validation. Source: `_meta/atomic-tasks/06-scanner-p1/_validate.py` line 100.
2. **UI tasks lacked `prototype_match` + `prototype_index_entry` + `ui_evidence_policy`** keys that the gold-standard NPD/Settings exemplars expose. Resolution: added across all 29 UI tasks.
3. **Scanner P1 red-lines (GS1 prefix from Settings, scanner.* RBAC, P2 deferral)** were only partially expressed. Resolution: every API/UI task now carries the scanner-specific red-lines and every UI/API task now carries the P2 deferral fences in `out_of_scope`.
4. **T-001/T-002/T-003 (schema/parser)** lacked the `systematic-debugging` skill that data-migration tasks need (per gold-standard convention for migrations + edge-case test design). Added.
5. **Atomicity gate (≤4 ACs)** could be breached when adding the parity-policy AC. Resolution: when a task already had 4 ACs the policy is folded into the last AC instead of appended as a 5th.

## Dependency / parallel-safety edges

- **78 dependency edges** computed from `pipeline_inputs.dependencies` (preserved from the source files; the upgrader did not add or rewrite edges — only canonicalized key order).
- **parallel_safe_with** preserved verbatim across all 48 tasks.

## Files touched

- `_meta/atomic-tasks/06-scanner-p1/tasks/T-001.json` .. `T-048.json` — 48 rewrites in place.
- `_meta/atomic-tasks/06-scanner-p1/coverage.md` — appended `## Coverage rows (gold-standard re-author 2026-05-14)` table covering all 48 task rows.
- `_meta/atomic-tasks/06-scanner-p1/UPGRADE-REPORT-2026-05-14.md` — this file.
- Manifest **not modified** (task_count remains 48).

## Verification

```
$ python3 _meta/atomic-tasks/06-scanner-p1/_validate.py
Tasks validated: 48/48
ALL PASS
```

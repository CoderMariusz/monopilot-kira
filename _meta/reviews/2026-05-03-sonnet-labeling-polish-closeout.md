# Sonnet Labeling Polish — Closeout Report

Date: 2026-05-03  
Scope: Prototype label/index polish for modules 01–08  
Status: COMPLETE — all validations pass

---

## Executive summary

All 8 module prototype indexes (npd, settings, technical, planning, warehouse, scanner, planning-ext, production) are now taxonomically consistent, cross-referenced with master-index, and structurally sound. JSX source anchors (`data-prototype-label`) have been added to the highest-value scanner, production, and warehouse components. Parity policy references have been propagated to all UI tasks in 04 and 06.

**No commit has been made.** Working tree remains dirty as instructed.

---

## What was done

### 1. Index mismatch resolution

Fixed label/index mismatches between module indexes and `master-index.json`:

- **NPD**: added 3 missing entries — `npd_allergen_override_modal`, `npd_nutrition_screen`, `npd_costing_screen`
- **Settings**: added 1 missing entry — `settings_d365_mapping_screen`
- **Technical**: added 6 missing entries — `technical_products_screen`, `technical_boms_screen`, `technical_partners_screen`, `technical_nutrition_screen`, `technical_costing_screen`, `technical_d365_mapping_screen`
- **Planning**: added 1 missing entry — `planning_delete_confirm_modal`; fixed `supplier_form_modal` taxonomy (`interaction: "create-edit"` → `"create"`)
- **Production**: added 2 missing entries — `production_shifts_screen`, `production_settings_screen`
- **Warehouse**: fixed `available_lp_picker` taxonomy (`component_type: "component"` → `"form"`, `interaction: "select"` → `"read-only"`)

### 2. Line range corrections

#### Scanner (`prototype-index-scanner.json` + `master-index.json`)

Systematic line-range correction across 5 scanner files. All wrong — the done-screen labels were assigned before file positions were verified.

Key corrections (delta from wrong to correct):

| Label | File | Before | After |
|---|---|---|---|
| `move_screen` | flow-other.jsx | 10–86 | 26–121 |
| `split_scan_screen` | flow-other.jsx | 111–150 | 148–207 |
| `split_qty_screen` | flow-other.jsx | 152–193 | 209–250 |
| `qa_list_screen` | flow-other.jsx | 227–260 | 284–317 |
| `qa_inspect_screen` | flow-other.jsx | 262–294 | 319–351 |
| `qa_fail_reason_screen` | flow-other.jsx | 296–336 | 353–393 |
| `inquiry_screen` | flow-other.jsx | 391–438 | 448–503 |
| `consume_done_screen` + `waste_done_screen` | — | stale `line_range_note` fields | removed |

Additional corrections in flow-receive.jsx, flow-pick.jsx, flow-consume.jsx, login.jsx (25+ total).

#### Production (`prototype-index-production.json` + `master-index.json`)

Systematic −38 offset correction for all 15 production modals. Root cause: `ReleaseWoModal` (≈40 lines) was removed and replaced with an 8-line deprecation comment, shifting all subsequent components upward.

| Label | Before | After |
|---|---|---|
| `start_wo_modal` | 48–67 | 10–29 |
| `pause_line_modal` | 69–117 | 31–79 |
| `complete_wo_modal` | 119–155 | 81–117 |
| (12 more modals — all corrected) | — | — |

Also fixed `release_wo_modal` taxonomy (`component_type: "deprecated-trace"`, `ui_pattern: "deprecated-no-ui"`, `interaction: "none"`, `complexity: "stale"` → valid values).

### 3. Taxonomy violations fixed

| Label | Module | Issue | Fix |
|---|---|---|---|
| 9× done screens | scanner | `ui_pattern: "success-state"` (invalid) | → `"detail-view"` |
| `camera_scanner` | scanner | `component_type: "component"` (invalid) | → `"modal"` |
| `camera_scanner` | scanner | `ui_pattern: "scanner-input"` (invalid) | → `"wizard-step"` |
| `available_lp_picker` | warehouse | `component_type: "component"` (invalid) | → `"form"` |
| `available_lp_picker` | warehouse | `interaction: "select"` (invalid) | → `"read-only"` |
| `wo_reservations_panel` | warehouse | `component_type: "component"` (invalid) | → `"sidebar"` |
| `deactivate_supplier_modal` | planning | `ui_pattern: "delete-confirm"` (invalid) | → `"crud-form-with-validation"` |
| `supplier_form_modal` | planning | `interaction: "create-edit"` (invalid) | → `"create"` |
| `release_wo_modal` | production | `component_type/ui_pattern/interaction/complexity` (all invalid) | → valid values |

All fixes propagated to both module index and `master-index.json`.

### 4. JSX source anchors added

Added `{/* data-prototype-label: <label> */}` (or `// data-prototype-label: <label>` where JSX comment not applicable) to:

| File | Label added |
|---|---|
| `scanner/flow-other.jsx` | `move_done_screen`, `split_done_screen`, `qa_done_screen`, `inquiry_screen` |
| `scanner/flow-register.jsx` | `output_done_screen`, `coproduct_done_screen`, `waste_done_screen` |
| `scanner/flow-consume.jsx` | `consume_done_screen` |
| `scanner/flow-pick.jsx` | `pick_done_screen` |
| `scanner/flow-receive.jsx` | `to_done_screen` |
| `scanner/login.jsx` | `pin_screen`, `pin_setup_screen`, `pin_change_screen` |
| `scanner/modals.jsx` | `camera_scanner` |
| `production/modals.jsx` | `start_wo_modal` |

Note: `use_by_override_modal` (warehouse/modals.jsx:1050) already had `data-prototype-label="use_by_override_modal"` as a JSX prop — no change needed.

Note: `available_lp_picker` and `wo_reservations_panel` reference `design/05-WAREHOUSE-UX.md` (spec-driven, no JSX file yet). Source anchors will be added when production UI is built.

### 5. Parity policy references in UI tasks

Added explicit `UI-PROTOTYPE-PARITY-POLICY.md` reference to acceptance criteria of all UI tasks in:

- `04-planning-basic`: 30 UI tasks updated
- `06-scanner-p1`: 29 UI tasks updated

Total: 59 tasks. The reference was appended to whichever AC mentions Playwright/screenshot/CLOSEOUT/parity; defaulting to the last AC. Tasks that already had the reference (00–03, 05, 07, 08) were untouched.

---

## Validation results

### Module validators

```
00 Foundation: VALIDATION PASS — 52 tasks, 52 unique deliverables.
01 NPD:        PASS: 100 task files validated, coverage.md clean
02 Settings:   PASS — 0 failures
03 Technical:  PASS: all checks green.
04 Planning:   PASS — 0 failures
05 Warehouse:  PASS: 57 tasks, manifest + coverage.md OK
06 Scanner P1: ALL PASS
07 Planning Ext: PASS
08 Production: PASS: 55 tasks validated
```

### Custom prototype cross-validation

Script checked all 8 module indexes (332 total entries) against:
- Valid taxonomy values (all 5 dimensions)
- File existence for JSX references
- Line ranges not exceeding file length
- Presence in master-index

Result: `CUSTOM_PROTO_VALIDATION: OK` — 0 issues.

### Git whitespace check

`git diff --check`: passed (no output).

---

## Remaining known gaps (non-blocking)

1. `data-prototype-label` anchors are not universal in all JSX files. External prototype indexes are canonical; source-level anchors are a quality accelerator for selector automation, not a dispatch blocker.

2. `available_lp_picker` and `wo_reservations_panel` are spec-driven (no JSX prototype file yet). They will receive source anchors when the production UI is implemented.

3. Master-index has 547 entries vs. 332 in module indexes. The gap represents finance, shipping, reporting, maintenance, multi-site, oee, and quality modules that are not yet in scope for 01–08 implementation. No mismatch within the 01–08 scope.

4. `planning-ext` module prototype index was not modified in this pass (no issues found). The planning-ext index was validated as part of the cross-validation run.

---

## Files changed

### Module prototype indexes (JSON)
- `_meta/prototype-labels/prototype-index-npd.json`
- `_meta/prototype-labels/prototype-index-settings.json`
- `_meta/prototype-labels/prototype-index-technical.json`
- `_meta/prototype-labels/prototype-index-planning.json`
- `_meta/prototype-labels/prototype-index-warehouse.json`
- `_meta/prototype-labels/prototype-index-scanner.json`
- `_meta/prototype-labels/prototype-index-production.json`
- `_meta/prototype-labels/master-index.json`

### JSX prototype source files (anchor additions only, no visual changes)
- `design/Monopilot Design System/scanner/flow-other.jsx`
- `design/Monopilot Design System/scanner/flow-register.jsx`
- `design/Monopilot Design System/scanner/flow-consume.jsx`
- `design/Monopilot Design System/scanner/flow-pick.jsx`
- `design/Monopilot Design System/scanner/flow-receive.jsx`
- `design/Monopilot Design System/scanner/login.jsx`
- `design/Monopilot Design System/scanner/modals.jsx`
- `design/Monopilot Design System/production/modals.jsx`

### Task files (parity policy reference additions)
- `_meta/atomic-tasks/04-planning-basic/tasks/T-034.json` through `T-065.json` (30 UI tasks)
- `_meta/atomic-tasks/06-scanner-p1/tasks/T-004.json` through `T-048.json` (29 UI tasks)

# PRD Coverage — 04-PLANNING-BASIC full module readiness

Source PRD: `04-PLANNING-BASIC-PRD.md` v3.3 + Wave0 / Wave Next-3 decisions dated 2026-05-03.
Target: 95%+ docs/meta/prototype/task readiness for ACP import and autonomous implementation. This coverage file covers the full Planning Basic module, not only the accepted release read-model contract slice.

## Readiness verdict

- Status: READY at 95%+ for docs/meta/prototype/task handoff.
- Atomic tasks: 65 ACP-shaped tasks in `tasks/T-001.json` through `tasks/T-065.json`.
- Validator: `_validate.py` must pass before promotion.
- Release read-model contract: included in T-001 and propagated to WO creation/release, D365 draft review, cascade preview, WO list/detail, and Gantt/Cascade UI tasks.
- Prototype mapping: 39 Planning prototype labels indexed in `_meta/prototype-labels/prototype-index-planning.json`; the same labels are present in `_meta/prototype-labels/master-index.json` with `module=planning`.
- UI closeout evidence: every T3-ui task requires screenshots/artifacts plus Playwright trace artifacts.
- Cross-module dependency posture: Warehouse, Scanner, Settings, Technical, NPD, and D365 dependencies are represented as `pipeline_inputs.cross_module_dependencies`, not invalid ACP root dependencies.

## Task type coverage

| Task range | Type | Coverage |
|---|---|---|
| T-001 | T2-api | Canonical factory release read-model consumer contract for Planning |
| T-002..T-006, T-041 | T1-schema | PO/TO/WO/reservation/settings/supplier schema coverage |
| T-007..T-028, T-030..T-033, T-042 | T2-api / T4 | Rule registry, server actions, integrations, RBAC, dashboard, D365, outbox |
| T-029 | T5-seed | Planning settings/status defaults |
| T-034..T-040, T-043..T-065 | T3-ui | Full PRD/UX/prototype/spec-driven UI coverage with parity/evidence requirements |

## PRD / UX / Prototype / Task coverage table

| PRD ref | Requirement / surface | UX / prototype anchor | Task(s) | Status |
|---|---|---|---|---|
| §1, §5.6, §8.1, §8.4 | Planning consumes canonical factory release read model; WO snapshots capture active BOM/spec/release event/status | `wo_create_wizard`, `cascade_preview_modal`, `draft_wo_review_modal`, `plan_wo_list`, `plan_wo_detail` | T-001, T-018, T-019, T-021, T-030, T-037, T-050..T-053, T-061 | tasked |
| §2 | Objectives, SLOs, success metrics | dashboard/read APIs | T-027, T-034 | tasked |
| §3 | Personas, permissions, tenant/RBAC posture | Planning Settings, RBAC matrix | T-033, T-058, T-065 | tasked |
| §5.2..§5.3 | Suppliers and supplier_products schema | `suppliers.jsx` labels | T-041, T-042, T-043, T-044 | tasked |
| §5.4 | purchase_orders + po_lines schema | PO list/detail/modals | T-002, T-009..T-013, T-035..T-040, T-059 | tasked |
| §5.5 | transfer_orders + to_lines + to_line_lps schema | TO list/detail/modals | T-003, T-014..T-016, T-046..T-049, T-060 | tasked |
| §5.6..§5.11 | work_orders, materials, operations, outputs, dependencies, reservations, status history | WO list/detail/gantt/cascade/reservations/sequencing | T-004..T-006, T-017..T-026, T-050..T-057, T-062..T-064 | tasked |
| §5.12, §14 | planning_settings and status/field visibility/D365 config | `plan_settings` | T-006, T-028, T-029, T-058, T-065 | tasked |
| §6.1 | Supplier master CRUD | `plan_supplier_list`, `plan_supplier_detail`, `supplier_form_modal`, `deactivate_supplier_modal` | T-041, T-042, T-043, T-044 | tasked |
| §6.2..§6.4 | PO fast flow, line defaults, approvals, warehouse handoff | `po_fast_flow_wizard`, `add_po_line_modal`, `po_approval_modal`, `po_bulk_import_modal` | T-010..T-013, T-035..T-040, T-059 | tasked |
| §6.5 | PO outbox events | no dedicated UI | T-032, T-010..T-013 | tasked |
| §6.6..§6.7 | PO frontend and validations V-PLAN-PO | PO list/detail/modal labels | T-035..T-040, T-043, T-044, T-059 | tasked |
| §7 | Transfer orders state, LP selection, partial ship/receive, Warehouse handoff | `plan_to_list`, `plan_to_detail`, `to_create_edit_modal`, `lp_picker_modal`, `ship_to_modal`, `receive_to_modal` | T-014..T-016, T-046..T-049, T-060 | tasked |
| §8.1..§8.3 | WO create, BOM snapshot, co/byproduct outputs | `wo_create_wizard`, `plan_wo_detail`, `wo_overview_tab` | T-018, T-021, T-050..T-052 | tasked |
| §8.4 | Intermediate cascade DAG and cycle detection | `cascade_preview_modal`, `cycle_check_warning_modal`, `plan_cascade_dag` | T-019, T-020, T-053, T-055 | tasked |
| §8.5..§8.9 | Output disposition, availability, WO workflow, rework, multi-component aggregation | WO detail/list/Gantt/cascade | T-018..T-026, T-050..T-055 | tasked |
| §9 | Material availability and hard-lock reservation | `plan_reservations`, `reservation_override_modal`, `hard_lock_release_confirm_modal` | T-006, T-021..T-024, T-049, T-056, T-063 | tasked |
| §10 | Allergen-aware sequencing | `plan_sequencing`, `sequencing_apply_confirm_modal`, spec-driven allergen override | T-025, T-057, T-062, T-064 | tasked |
| §11 | Finite-capacity scheduling stub | `plan_gantt` | T-026, T-054 | tasked |
| §12 | Release-to-Warehouse flow | WO list/detail/reservation/warehouse handoff UI | T-021, T-023, T-050, T-051, T-056 | tasked |
| §13 | Planning Dashboard & KPIs | `plan_dashboard` | T-027, T-034, T-045 | tasked |
| §14 | Planning Settings + configurable status display | `plan_settings`, spec-driven workflow dry-run | T-028, T-029, T-058, T-065 | tasked |
| §15 | D365 SO pull, draft WO review, drift | `plan_d365_queue`, `draft_wo_review_modal`, `d365_trigger_confirm_modal` | T-030, T-031, T-037, T-061 | tasked |
| §16.1 | Workflow-as-data integration | `plan_settings`, spec-driven workflow dry-run | T-007, T-028, T-058, T-065 | tasked |
| §16.6..§16.8 | Screen-code scheme and canonical surface mapping | prototype index + master index | T-034..T-065 | tasked |

## UI surface readiness table

| Screen ID | Label / anchor | Task(s) | Evidence requirement | Status |
|---|---|---|---|---|
| PLN-001 | `plan_dashboard` | T-034, T-045 | Screenshot + Playwright trace | tasked |
| PLN-002 | `plan_po_list` | T-035 | Screenshot + Playwright trace | tasked |
| PLN-003 | `plan_po_detail` | T-036 | Screenshot + Playwright trace | tasked |
| PLN-004 | `plan_to_list` | T-046 | Screenshot + Playwright trace | tasked |
| PLN-005 | `plan_to_detail` | T-047 | Screenshot + Playwright trace | tasked |
| PLN-006 | `plan_wo_list` | T-050 | Screenshot + Playwright trace | tasked |
| PLN-007/a/d/f/g/h | `plan_wo_detail` + tabs | T-051 | Screenshot + Playwright trace | tasked |
| PLN-008 | `plan_gantt` | T-054 | Screenshot + Playwright trace | tasked |
| PLN-009 | `plan_cascade_dag` | T-055 | Screenshot + Playwright trace | tasked |
| PLN-010 | `plan_reservations` | T-056 | Screenshot + Playwright trace | tasked |
| PLN-011 | `plan_sequencing` | T-057, T-064 | Screenshot + Playwright trace | tasked |
| PLN-012 | `plan_settings` | T-058, T-065 | Screenshot + Playwright trace | tasked |
| PLN-013 | `plan_d365_queue` | T-037, T-061 | Screenshot + Playwright trace | tasked |
| PLN-014 | `po_fast_flow_wizard` | T-038 | Screenshot + Playwright trace | tasked |
| PLN-015 | `add_po_line_modal` | T-039 | Screenshot + Playwright trace | tasked |
| PLN-016 | `po_approval_modal` | T-040 | Screenshot + Playwright trace | tasked |
| PLN-017 | `po_bulk_import_modal` | T-059 | Screenshot + Playwright trace | tasked |
| PLN-018 | `to_create_edit_modal` | T-048 | Screenshot + Playwright trace | tasked |
| PLN-019 | `lp_picker_modal` | T-049 | Screenshot + Playwright trace | tasked |
| PLN-020 / PLN-043 | `ship_to_modal`, `receive_to_modal` | T-060 | Screenshot + Playwright trace | tasked |
| PLN-021 | `wo_create_wizard` | T-052 | Screenshot + Playwright trace | tasked |
| PLN-022 | `cascade_preview_modal` | T-053 | Screenshot + Playwright trace | tasked |
| PLN-023 | `reservation_override_modal` | T-056 | Screenshot + Playwright trace | tasked |
| PLN-024 | `cycle_check_warning_modal` | T-055 | Screenshot + Playwright trace | tasked |
| PLN-025 | `d365_trigger_confirm_modal` | T-061 | Screenshot + Playwright trace | tasked |
| PLN-026 | `sequencing_apply_confirm_modal` | T-062 | Screenshot + Playwright trace | tasked |
| PLN-027 | `draft_wo_review_modal` | T-037 | Screenshot + Playwright trace | tasked |
| PLN-028 | `delete_confirm_modal` | T-063 | Screenshot + Playwright trace | tasked |
| PLN-029 | `hard_lock_release_confirm_modal` | T-063 | Screenshot + Playwright trace | tasked |
| PLN-030 | spec-driven allergen override inline modal | T-064 | Screenshot + Playwright trace | tasked |
| PLN-031 | spec-driven workflow dry-run modal | T-065 | Screenshot + Playwright trace | tasked |
| PLN-032 | inline sequencing preview within `plan_sequencing` | T-057, T-062 | Screenshot + Playwright trace | tasked |
| PLN-040..042 | supplier list/detail/form/sub-table | T-043, T-044 | Screenshot + Playwright trace | tasked |
| PLN-044..051 | composed/inline/P2 diagnostics | T-045, T-050..T-058, T-064, T-065 | Screenshot + Playwright trace where P1 | tasked/deferred per PRD |

## Notes

- `tasked` means ACP-ready future implementation coverage exists; this hardening did not implement application code.
- Spec-driven UI tasks T-064/T-065 intentionally set `prototype_match=false`; they are accepted because PRD/UX define them as inline/composed surfaces and they still require screenshots and traces.
- Remaining non-P1 / P2 diagnostics (for example true finite-capacity optimizer, react-flow DAG production graph, ScannerQueuePreview diagnostic) are explicitly deferred in PRD and do not block 95% Planning Basic readiness.

# 05-WAREHOUSE Atomic-Task Upgrade Report — 2026-05-14

**Scope:** Re-author all 57 atomic-task JSONs in `_meta/atomic-tasks/05-warehouse/tasks/` to the gold-standard quality already present in `_meta/atomic-tasks/01-npd/` and `_meta/atomic-tasks/02-settings/`.

**Method:** Generator script `/tmp/upgrade_warehouse_tasks.py` reads each existing `T-XXX.json`, preserves its `dependencies`/`scope_files`/`subcategory`/`task_type`/`prd_refs`, and rebuilds `title`, `prompt` (H1 + PRD anchor + Goal + Implementation contract + Files + Acceptance criteria + Test strategy + Risk red lines + optional Prototype parity), `labels`, `acceptance_criteria`, `test_strategy`, `risk_red_lines`, `skills`, `priority`, `parent_feature`, `checkpoint_policy`, `routing_hints`, `cross_module_dependencies`, and (for UI tasks) `prototype_match` / `prototype_index_entry` / `ui_evidence_policy`.

## Counts

| Metric | Value |
|---|---|
| Total tasks re-authored | **57** |
| T1-schema | 12 (T-001..T-012) |
| T5-seed (rule registry) | 3 (T-013..T-015) |
| T2-api (services/APIs) | 32 (T-016..T-047) |
| T3-ui (UI parity) | 7 (T-048..T-054) |
| T4-wiring-test | 3 (T-055..T-057) |
| **UI tasks with `prototype_match=true`** | **8** (T-048..T-055) |
| Manifest `task_count` | 57 (unchanged) |

### UI tasks with `prototype_match=true` and their first-class prototype index entries

| Task | Primary `prototype_index_entry` | Covered labels (file:line refs in prompt) |
|---|---|---|
| T-048 | `lp_list_page` | lp_list_page, lp_detail_page, lp_split_modal, lp_merge_modal, destroy_scrap_lp_modal, state_transition_confirm_modal, force_unlock_scanner_modal |
| T-049 | `grn_from_po_wizard` | grn_list_page, grn_detail_page, grn_from_po_wizard, grn_from_to_modal |
| T-050 | `stock_movement_list_page` | stock_movement_list_page, stock_move_modal, cycle_count_quick_adjustment_modal |
| T-051 | `available_lp_picker` (first-class WH-015) | available_lp_picker, reserve_lp_modal, release_reservation_modal, fefo_deviation_modal, reservations_list_page, wo_reservations_panel (first-class WH-017) |
| T-052 | `expiry_management_page` | expiry_management_page, use_by_override_modal, shelf_life_rules_admin_page, shelf_life_rule_edit_modal (WH-109 Phase 1) |
| T-053 | `warehouse_dashboard` | warehouse_dashboard, inventory_browser_page, locations_hierarchy_page, location_edit_modal, warehouse_settings_page |
| T-054 | `genealogy_traceability_page` | label_print_modal, genealogy_traceability_page |
| T-055 | `(all warehouse labels)` | E2E parity sweep across every prototype-index-warehouse.json label |

## PRD anchors corrected / validated

Every `prd_refs[]` entry on every task was checked against `docs/prd/05-WAREHOUSE-PRD.md` headings. All §-anchors used in prompts and AC exist verbatim in the PRD:

- §3 RBAC, §4 Scope, §5.1-5.8 entities, §6.1-6.11 LP Core (incl. §6.10 state transition confirm + §6.11 force unlock), §7.1-7.8 Receiving, §8.1-8.9 Stock Moves (incl. §8.8 cycle count P1 stub), §9.1-9.8 FEFO/Reservations, §10.1-10.9 Intermediate LPs, §11.1-11.6 Genealogy (incl. §11.5 WH-104 dashboard), §12.1-12.7 Expiry (incl. §12.5 WH-109 shelf life rules, §12.6 WH-105 expiry dashboard), §13.1-13.8 Scanner contracts, §14.1-14.6 Dashboard/Inventory/Locations (incl. §14.5 WH-106, §14.6 WH-107), §15.1-15.7 Labels/ZPL/SSCC, §16.0 Settings page, §16.5 cross-module refs, §16.6 UI Surfaces Coverage Matrix.

Decision deltas now reflected in tasks:
- **WH-008 destination required** (2026-05-03 decision) — encoded as a non-negotiable AC + red-line in T-017 and T-048.
- **WH-109 Shelf Life Rules CRUD is Phase 1** — encoded in T-008 (schema) and T-052 (UI).
- **M-12 `use_by_override_modal` is canonical** — encoded in T-037 (service) and T-052 (UI).
- **WH-015 `available_lp_picker` + WH-017 `wo_reservations_panel` are first-class labels** — encoded in T-051 with explicit `data-prototype-label` AC.

## Top 3 corrections / red flags surfaced during re-author

1. **`lp_state_machine_v1` must be server-driven** — older prompts allowed client-side state transitions. New T-019 / T-048 hardline: client MUST read allowed transitions + allowed reasons from the rule registry via the T-019 server action; client hardcoding is a red-line. ADR-029 dictates admin read-only — added V-WH-SET-001 to T-053 UI.
2. **Intermediate LP reservation is forbidden** (Q6 revised C2 Sesja 2 / V-WH-FEFO-005). Older prompts implied `lp_reservations` covered both RM-root and intermediate cascade. New T-031 explicitly hard-blocks `material_source='upstream_wo_output'` reservation attempts; new T-051 UI surfaces the V-WH-FEFO-005 server error inline. Cross-checked against §9.4 and §10.
3. **Inventory value must be RBAC-gated server-side** — older T-045/T-053 inputs allowed client-side `canSeeValue` checks. New T-045 enforces server-side gating: SUM is never computed for non-authorized roles, response returns `{value: null, suppressed: true}`. T-053 UI asserts the value column is omitted for non-Manager sessions.

Other red flags worth noting (resolved in task content):
- **GRN multi-LP-per-line never auto-splits/merges** (Q1) — encoded as a red-line in T-005, T-021, T-049, T-055.
- **Cycle count is P1 stub only** (BL-WH-01) — explicit framing in T-029 + T-050; full WH-E14 deferred to P2.
- **FEFO deviation = warn never block** (Q6B) — encoded in T-034 (service) and T-051 (UI modal).
- **Catch-weight sum is mandatory on merge** (baseline D14) — encoded in T-018.
- **Quarantine never auto-moves the LP** (baseline D18) — encoded in T-025.
- **ZPL preview in browser is HTML-only** (BL-WH-04) — encoded in T-043 + T-054.

## Dependency edges (computed `parallel_safe_with` left as-is)

Existing dependency edges were preserved (e.g., T-002→T-001, T-021→{T-005,T-016,T-025}, T-031→{T-002,T-004}, T-048→{T-016..T-020,T-044}, T-055→T-001..T-054). The script did not invent new edges. Pre-existing `parallel_safe_with` arrays were retained verbatim because the original re-author already computed these from scope-files overlap.

## Files touched

- **Re-written** (57): `_meta/atomic-tasks/05-warehouse/tasks/T-001.json` … `T-057.json`
- **Appended**: `_meta/atomic-tasks/05-warehouse/coverage.md` — new section `## Coverage rows (gold-standard re-author 2026-05-14)` with full 57-row table.
- **Created**: `_meta/atomic-tasks/05-warehouse/UPGRADE-REPORT-2026-05-14.md` (this file).
- **Unchanged**: `_meta/atomic-tasks/05-warehouse/manifest.json` (`task_count: 57` confirmed).

## Validation

- All 57 JSONs parse with `json.load`.
- All 57 prompts contain every required section (`## Goal`, `## Implementation contract`, `## Files`, `## Acceptance criteria`, `## Test strategy`, `## Risk red lines`).
- All 8 UI parity tasks include the `## Prototype parity` section + `prototype_match: true` + `prototype_index_entry` + `ui_evidence_policy: _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`.
- Manifest `task_count` remains 57 and lists `tasks/T-001.json` … `tasks/T-057.json`.

_Authored by gold-standard re-author run, 2026-05-14._

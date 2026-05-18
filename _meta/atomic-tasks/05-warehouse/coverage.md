# PRD Coverage — 05-warehouse

Source PRD: `docs/prd/05-WAREHOUSE-PRD.md`.
UX source: `prototypes/design/05-WAREHOUSE-UX.md`.
Prototype index: `_meta/prototype-labels/prototype-index-warehouse.json`.
Status: Wave Next-3 hardening, 2026-05-03 decisions applied.

## Readiness verdict

Target readiness after this hardening: 95%+ docs/meta/task/prototype-index readiness for Wave0 import planning.

Resolved user decisions:
- WH-008 destination is required. PRD/UX/task language must treat split output destination as required.
- WH-109 Shelf Life Rules CRUD is Phase 1, not deferred.
- M-12 `use_by_override_modal` is canonical; stale no-prototype wording is invalid.
- WH-015 `available_lp_picker` and WH-017 `wo_reservations_panel` are first-class labels/surfaces, not only indirect flow references.
- Prototype JSX should expose or plan `data-prototype-label` markers for indexed labels.

## Coverage table — PRD / UX / prototype / task mapping

| PRD / UX area | UX anchor | Prototype label(s) | Tasks | Status |
|---|---|---|---|---|
| §5.1-5.2 Core entities/enums | n/a | n/a | T-001..T-012 | covered |
| §6.1 LP lifecycle rule DSL | WH-003, M-15 | `state_transition_confirm_modal`, `lp_detail_page` | T-013, T-019, T-048 | covered |
| §6.2 QA gating | WH-009 | `qa_status_change_modal` | T-019, T-048 | covered; 09-QUALITY dependency explicit |
| §6.3 LP numbering | WH-002/003 | `lp_list_page`, `lp_detail_page` | T-016, T-048 | covered |
| §6.4 LP split, WH-008 destination required | WH-008 | `lp_split_modal` | T-017, T-048, T-055 | covered; decision applied |
| §6.5 LP merge | M-05 | `lp_merge_modal` | T-018, T-048, T-055 | covered |
| §6.6 scanner LP locking | WH-001/003, WH-101 | `force_unlock_scanner_modal` | T-020, T-044, T-048, T-056 | covered |
| §6.7 dual UoM/catch weight | WH-002/003/004 | `lp_list_page`, `lp_detail_page`, `grn_from_po_wizard` | T-002, T-005, T-016, T-021, T-048, T-049 | covered |
| §6.8 schema extensions | WH-003 | `lp_detail_page` | T-002, T-048 | P1 read covered; editor P2 BL-WH-06 |
| §7.1 GRN from PO | WH-004-PO | `grn_from_po_wizard` | T-005, T-021, T-049, T-055 | covered |
| §7.2 GRN from TO | WH-005 | `grn_from_to_modal` | T-005, T-022, T-049, T-056 | covered |
| §7.3 over/under receipt | WH-004 Step 3 | `grn_from_po_wizard` | T-021, T-024, T-049, T-055 | covered |
| §7.4 GS1-128 scan auto-fill | WH-004 Step 2 | behavior in `grn_from_po_wizard` | T-023, T-049, T-056 | covered |
| §7.5 transit location | WH-005 | `grn_from_to_modal` | T-022, T-049, T-056 | covered |
| §8.1 stock moves | WH-006/007 | `stock_movement_list_page`, `stock_move_modal` | T-006, T-025, T-050, T-055 | covered |
| §8.2 partial move split cascade | WH-007 | `stock_move_modal` | T-026, T-050, T-055 | covered |
| §8.3 manual put-away P1 | WH-005/007 | `grn_from_to_modal`, `stock_move_modal` | T-027, T-049, T-050 | covered |
| §8.5 adjustment >10% gate | WH-006/007 | `stock_movement_list_page`, `stock_move_modal` | T-028, T-050, T-055 | covered |
| §8.8 cycle-count quick adjustment P1 stub | M-14 | `cycle_count_quick_adjustment_modal` | T-029, T-050 | covered; full cycle count P2 |
| §9.1 FEFO/FIFO DSL rules | WH-015 | `available_lp_picker` | T-014, T-015, T-030, T-051, T-056 | covered; first-class label |
| §9.3 FEFO deviation warning | M-10 | `fefo_deviation_modal` | T-033, T-051, T-055 | covered; warning never hard block after reason |
| §9.4 RM root reservations | WH-016/017 | `reserve_lp_modal`, `reservations_list_page`, `wo_reservations_panel` | T-004, T-031, T-032, T-051, T-056 | covered; intermediate reservations blocked |
| §10 intermediate LP handling | Scanner contract | n/a desktop; scanner-owned surfaces | T-034, T-039, T-042, T-056 | covered as API/contract |
| §11 genealogy + traceability | WH-014 | `genealogy_traceability_page`, `lp_detail_page` | T-003, T-038, T-054, T-055 | covered |
| §12.1-12.4 expiry calc/cron/use_by override | WH-019, M-12 | `expiry_management_page`, `use_by_override_modal` | T-035, T-036, T-037, T-052, T-055 | covered; M-12 canonical |
| §12.5 WH-109 Shelf Life Rules CRUD | WH-109 | `shelf_life_rules_admin_page`, `shelf_life_rule_edit_modal` | T-008, T-052, T-056 | covered; Phase 1 CRUD |
| §13 scanner APIs | scanner-owned UX | n/a desktop | T-039, T-040, T-041, T-042, T-056 | covered; cross-module dependency explicit |
| §14 dashboard KPIs | WH-001 | `warehouse_dashboard` | T-045, T-053, T-055 | covered |
| §14.5 inventory browser | WH-012 | `inventory_browser_page` | T-045, T-053 | covered; value RBAC server-side |
| §14.6 locations hierarchy | WH-018, M-13 | `locations_hierarchy_page`, `location_edit_modal` | T-046, T-053 | covered |
| §15 labels/ZPL/print | WH-013 | `label_print_modal` | T-043, T-054, T-055 | covered; real ZPL backend, HTML preview only |
| §16.0 settings page | WH-020 | `warehouse_settings_page` | T-009, T-053 | covered |
| §16.5 cross-module dependencies | n/a | n/a | T-056 plus `cross_module_dependencies` metadata | covered |
| §16.6 coverage matrix readiness | n/a | prototype index + master index | T-057 | covered |

## UI modal/surface coverage

| Surface | Prototype label | UX | Task(s) | Status |
|---|---|---|---|---|
| M-05 LP Merge | `lp_merge_modal` | UX:1189 | T-018, T-048 | covered |
| M-06 QA Status Change | `qa_status_change_modal` | UX:706 | T-019, T-048 | covered |
| M-07 Label Print | `label_print_modal` | UX:829 | T-043, T-054 | covered |
| M-08 Available LPs Picker | `available_lp_picker` | UX:897 | T-030, T-051 | covered; first-class label |
| M-08 Reserve LP | `reserve_lp_modal` | UX:929 | T-031, T-051 | covered |
| M-09 Release Reservation | `release_reservation_modal` | UX:1231 | T-032, T-051 | covered |
| M-10 FEFO Deviation | `fefo_deviation_modal` | UX:1247 | T-033, T-051 | covered |
| M-11 Destroy/Scrap | `destroy_scrap_lp_modal` | UX:1277 | T-019, T-048 | covered |
| M-12 Use_by Block Override | `use_by_override_modal` | UX:1293 | T-037, T-052 | covered; canonical |
| M-13 Location Create/Edit | `location_edit_modal` | UX:1312 | T-046, T-053 | covered |
| M-14 Cycle Count Quick Adj | `cycle_count_quick_adjustment_modal` | UX:1329 | T-029, T-050 | covered |
| M-15 State Transition Confirm | `state_transition_confirm_modal` | UX:1344 | T-019, T-048 | covered |
| WH-109 Shelf Life Rules CRUD | `shelf_life_rules_admin_page`, `shelf_life_rule_edit_modal` | new UX WH-109 | T-008, T-052, T-056 | covered; Phase 1 |

## Task type coverage summary

| Task band | Count | Files |
|---|---:|---|
| T1-schema/data foundations | 12 | T-001..T-012 |
| T5 seed/rule registry | 3 | T-013..T-015 |
| T2 services/APIs/auth | 32 | T-016..T-047 |
| T3 UI/prototype parity | 7 | T-048..T-054 |
| T4 E2E/contract/readiness tests | 3 | T-055..T-057 |

Total tasks: 57.

## Cross-module dependencies

All tasks now carry `pipeline_inputs.cross_module_dependencies` metadata. Key contracts:
- 02-SETTINGS: rule registry, warehouses/locations/printers, feature flags, security policy.
- 03-TECHNICAL: items/products, shelf-life/date-code, catch-weight, allergen snapshots.
- 04-PLANNING-BASIC: PO/TO/WO read models, RM root reservations, WO release/cancel hooks.
- 06-SCANNER-P1: LP lookup, barcode validation, lock protocol, FEFO suggestion, consume-to-WO.
- 08-PRODUCTION: WO material consumption and output LP creation events.
- 09-QUALITY: LP qa_status ownership and `quality_status_history`.
- 11-SHIPPING: downstream shelf_life_rules enforcement in Phase 2; Warehouse owns P1 CRUD/read contract.

## Remaining accepted P2/P3 non-blockers

- Full cycle count workflow WH-E14 remains Phase 2; P1 quick adjustment stub is covered.
- Put-away rules WH-E12 remain Phase 2; P1 manual put-away is covered.
- EPCIS event consumer WH-E16 remains Phase 2; P1 outbox events are covered.
- Pallets/SSCC WH-E10 and ASN WH-E09 remain Phase 2.
- Scanner offline WH-E15 remains Phase 2.
- Graph DB genealogy WH-E18 remains Phase 3.

## Remaining questions

No Wave Next-3 blocking Warehouse readiness questions remain after the 2026-05-03 decisions. Deferred questions OQ1-OQ8 in the PRD remain implementation/P2 design questions, not readiness blockers.

## Coverage rows (gold-standard re-author 2026-05-14)

Re-author baseline: all 57 `T-XXX.json` files in `tasks/` were rewritten on 2026-05-14 to the gold-standard format
matching `_meta/atomic-tasks/01-npd/tasks/T-001.json`, `T-052.json`, `T-061.json`, and `_meta/atomic-tasks/02-settings/tasks/T-001.json`, `T-041.json`. Prompt structure unified to `H1` + `PRD:` anchor + `## Goal` + `## Implementation contract` + `## Files` + `## Acceptance criteria` + `## Test strategy` + `## Risk red lines`; UI tasks add a `## Prototype parity` section with `prototypes/design/Monopilot Design System/warehouse/<file>.jsx:<start>-<end>` anchors pulled from `_meta/prototype-labels/prototype-index-warehouse.json`. Cross-module dependency metadata + `checkpoint_policy` + `routing_hints` standardized. Manifest `task_count` remains 57.

| Task | Sub-module | task_type | PRD §refs |
|---|---|---|---|
| T-001 | enum-lock | T1-schema | §5.2,§6.1,§6.2 |
| T-002 | lp-core | T1-schema | §5.2 |
| T-003 | lp-genealogy | T1-schema | §5.3,§11 |
| T-004 | reservations | T1-schema | §5.4,§9.4 |
| T-005 | grn | T1-schema | §5.5,§7 |
| T-006 | stock-moves | T1-schema | §5.6,§8 |
| T-007 | pick-overrides | T1-schema | §5.7,§9.6 |
| T-008 | shelf-life | T1-schema | §5.1,§12.5 |
| T-009 | settings | T1-schema | §5.8,§16.1 |
| T-010 | outbox | T1-schema | §5.1,§7.6,§11.4 |
| T-011 | indexes | T1-schema | §5.2,§5.3,§5.6,§8.6 |
| T-012 | rls | T1-schema | §3,§16.5 |
| T-013 | rule-registry | T5-seed | §6.1,§16.5 |
| T-014 | rule-registry | T5-seed | §9.1,§9.2,ADR-029 |
| T-015 | rule-registry | T5-seed | §9.1,§9.3 |
| T-016 | lp-core | T2-api | §6.3 |
| T-017 | lp-core | T2-api | §6.4 |
| T-018 | lp-core | T2-api | §6.5 |
| T-019 | lp-core | T2-api | §6.1,§6.10 |
| T-020 | lp-core | T2-api | §6.6 |
| T-021 | grn | T2-api | §7.1,§7.3 |
| T-022 | grn | T2-api | §7.2,§7.5 |
| T-023 | barcode | T2-api | §7.4,§15.2 |
| T-024 | grn | T2-api | §7.3 |
| T-025 | stock-move | T2-api | §8.1 |
| T-026 | stock-move | T2-api | §8.2 |
| T-027 | putaway | T2-api | §8.3 |
| T-028 | adjustment | T2-api | §8.5 |
| T-029 | cycle-count | T2-api | §8.8 |
| T-030 | fefo | T2-api | §9.1,§9.2,§9.3 |
| T-031 | reservations | T2-api | §9.4 |
| T-032 | reservations | T2-api | §9.4 |
| T-033 | pick-override | T2-api | §9.6 |
| T-034 | scanner | T2-api | §10.5,§13.5 |
| T-035 | expiry | T2-api | §12.1 |
| T-036 | expiry | T2-api | §12.3 |
| T-037 | expiry | T2-api | §12.2,§12.6 |
| T-038 | genealogy | T2-api | §11.2,§11.5 |
| T-039 | scanner | T2-api | §13.1 |
| T-040 | scanner | T2-api | §13.2 |
| T-041 | scanner-auth | T2-api | §13.3 |
| T-042 | scanner | T2-api | §13.5 |
| T-043 | labels | T2-api | §15.1,§15.3 |
| T-044 | lp-core | T2-api | §6.11 |
| T-045 | rbac | T2-api | §14.5 |
| T-046 | locations | T2-api | §14.6 |
| T-047 | outbox | T2-api | §5.1,§7.6,§11.4 |
| T-048 | lp-core-ui | T3-ui | §6.4,§6.5,§6.9,§6.10,§6.11,§16.6 WH-002/003/008/M-05/M-11/M-15/WH-101 |
| T-049 | grn-ui | T3-ui | §7.1,§7.2,§7.3,§7.4,§7.7,§16.6 WH-004-PO/WH-005/WH-010 |
| T-050 | stock-move-ui | T3-ui | §8.1,§8.2,§8.3,§8.5,§8.8,§16.6 WH-006/007/M-14 |
| T-051 | fefo-reservations-ui | T3-ui | §9.1,§9.3,§9.4,§9.7,§16.6 WH-015/016/017/M-09/M-10 |
| T-052 | expiry-shelf-life-ui | T3-ui | §12.2,§12.5,§12.6,§12.7,§16.6 WH-019/WH-109/M-12 |
| T-053 | warehouse-management-ui | T3-ui | §14.1,§14.5,§14.6,§16.0,§16.6 WH-001/012/018/020/M-13 |
| T-054 | labels-genealogy-ui | T3-ui | §11.1,§11.5,§15.1,§15.6,§16.6 WH-013/014 |
| T-055 | warehouse-e2e | T4-wiring-test | §6-§15,§16.6 |
| T-056 | cross-module-contracts | T4-wiring-test | §13,§16.5,§16.6 |
| T-057 | readiness-validator | T4-wiring-test | §16.6,_meta/prototype-labels/prototype-index-warehouse.json,_meta/atomic-tasks/05-warehouse/coverage.md |
## Permission-enum addition 2026-05-14

| PRD/review ref | Task file | Sub-module | Type | Status | Notes |
|---|---|---|---|---|---|
| §3, §6.6, §14 (RBAC enum delta — closes _meta/audits/2026-05-14-prd-vs-tasks-coverage-gaps.md GAP) | tasks/T-058.json | 05-WAREHOUSE RBAC enum addition | T1-schema | added | 12 `warehouse.*` strings appended to packages/rbac/src/permissions.enum.ts + ALL_<MODULE>_PERMISSIONS export |

# PRD Coverage — 05-warehouse

Source PRD: `05-WAREHOUSE-PRD.md`.
UX source: `design/05-WAREHOUSE-UX.md`.
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

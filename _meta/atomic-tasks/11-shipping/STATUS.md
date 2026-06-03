# 11-shipping — Task Status Tracker

First populated by reality audit 2026-06-02. No prior STATUS.md existed.

## Legend
- ✅ DONE — implementation merged, review passed
- 🔄 IN PROGRESS — agent currently working
- ⏸ BLOCKED — stub exists but incomplete; or failing test; or dependency unmet
- ⬜ PENDING — not started

## Status

| Task | Title | Status | Notes |
|---|---|---|---|
| T-001 | customers + customer_contacts + customer_addresses + customer_allergen_restrictions schema | ⬜ PENDING | Blocked by 00-foundation/T-125 (withOrgContext), 00-foundation/T-113 (GDPR registry), 02-settings allergen_families; no migration, no schema dir, no test |
| T-002 | Customer Server Actions (create/update/deactivate + contacts + addresses + allergen restrictions) | ⬜ PENDING | Blocked by T-001 |
| T-003 | UI: customer_list_page (SHIP-001) | ⬜ PENDING | Blocked by T-001, T-002; no route exists |
| T-004 | UI: customer_detail_page (SHIP-002) with contacts/addresses/allergens tabs | ⬜ PENDING | Blocked by T-001, T-002, T-003 |
| T-005 | Address + Allergen Restriction modals | ⬜ PENDING | Blocked by T-001, T-002 |
| T-006 | sales_orders + sales_order_lines + allergen_overrides + shipping_audit_log schema | ⬜ PENDING | Blocked by T-001; no migration, no Drizzle schema |
| T-007 | SO Server Actions: create_draft_so, insert_so_line, confirm_so, cancel_so, place_hold, release_hold, allergen_override | ⬜ PENDING | Blocked by T-001, T-006 |
| T-008 | UI: so_create_wizard_modal multi-step Dialog (SHIP-006) | ⬜ PENDING | Blocked by T-006, T-007 |
| T-009 | UI: so_list_page (SHIP-005) | ⬜ PENDING | Blocked by T-006, T-007 |
| T-010 | UI: so_detail_page tabs (lines/holds/allocations/picks/shipments/history) (SHIP-007) | ⬜ PENDING | Blocked by T-006, T-007 |
| T-011 | inventory_allocations + pick_overrides schema + FEFO candidate query | ⬜ PENDING | Blocked by T-001, T-006; no migration |
| T-012 | Allocation Server Actions: allocateSO, releaseAllocation, allocationOverride | ⬜ PENDING | Blocked by T-006, T-011 |
| T-013 | Quality hold gate service (D-SHP-13 soft + hard gate) shared across pick/pack/ship | ⬜ PENDING | Blocked by T-006; shared service coupling risk |
| T-014 | UI: allocation_global_page + allocation_override_modal (SHIP-008/SHIP-029) | ⬜ PENDING | Blocked by T-011, T-012 |
| T-015 | pick_lists + pick_list_lines + waves schema | ⬜ PENDING | Blocked by T-006, T-011; no migration |
| T-016 | Pick Server Actions: buildWave, releaseWave, assignPicker, executePick (scanner), resolveShortPick, reassignPicker | ⬜ PENDING | Blocked by T-011, T-013, T-015 |
| T-017 | UI: pick_list_page + wave_builder_page + pick_detail_supervisor_page + modals (SHIP-012/013/014/016) | ⬜ PENDING | Blocked by T-015, T-016 |
| T-018 | shipments + shipment_boxes + shipment_box_contents schema + per-org sscc_serial sequence | ⬜ PENDING | Blocked by T-006, T-015; placeholder public.shipment exists (014-r13) but is not the T-018 contract |
| T-019 | SSCC server-side generation service + ZPL print queue stub | ⏸ BLOCKED | packages/gs1 has GS1 check-digit + parse utilities; no SSCC generator, no ZPL queue, not org-scoped; blocked on T-018 |
| T-020 | Pack + Ship Server Actions: closeBox, confirmShipment, reprintSscc, carrierUpsert | ⬜ PENDING | Blocked by T-013, T-015, T-016, T-018, T-019, T-027 |
| T-021 | UI: packing_station_workbench + packing_stations_selector + ship_confirm/pack_close modals (SHIP-017/030) | ⬜ PENDING | Blocked by T-018, T-020 |
| T-022 | UI: sscc_labels_queue_page + sscc_label_preview + sscc_preview_reprint modal (SHIP-019) | ⬜ PENDING | Blocked by T-018, T-019 |
| T-023 | Packing slip + BOL generation Server Actions (PDF + SHA-256 hash + BRCGS 7y retention) | ⬜ PENDING | Blocked by T-006, T-013, T-018, T-020; regulatory chain |
| T-024 | UI: documents_hub_page + packing_slip_preview + bol_preview + modals (SHIP-020/021/025) | ⬜ PENDING | Blocked by T-023 |
| T-025 | UI + Server Actions: shipments_delivery_tracker_page (POD) (SHIP-028) | ⬜ PENDING | Blocked by T-018, T-020 |
| T-026 | RMA schema + Server Actions + rma_list_page (SHIP-026) | ⬜ PENDING | Blocked by T-006, T-018; compound task (schema+API+UI) |
| T-027 | carriers schema + Server Actions + carriers_list_page (SHIP-014b) | ⬜ PENDING | Blocked by 00-foundation/T-125; compound task (schema+API+UI) |
| T-028 | UI: shipping_settings_page (SHIP-023) (allocation/labels/dispatch tabs) | ⏸ BLOCKED | SettingsRouteStub stub at settings/ship-override-reasons/page.tsx; not the SHIP-023 contract; no real settings UI |
| T-029 | shipping_outbox_events + shipping_push_dlq schema + D365 SalesOrder confirm push dispatcher | ⬜ PENDING | apps/worker does not exist; packages/integrations-d365 does not exist; packages/events does not exist; heaviest infra gap |
| T-030 | UI: shipping_dashboard page (SHIP-022) | ⏸ BLOCKED | Skeleton landing page at shipping/page.tsx reads public.shipment count; no dashboard widgets; not SHIP-022 contract |
| T-031 | Add ship.* permission strings to packages/rbac | ⬜ PENDING | No ship.* entries in packages/rbac/src/permissions.enum.ts; must be done before T-002/T-012/T-016/T-020 |
| T-032 | E2E Playwright: SO → Alloc → Pick → Pack → Ship-confirm → D365 dispatch happy path | ⬜ PENDING | Blocked by all of T-001–T-031; no spec file exists |

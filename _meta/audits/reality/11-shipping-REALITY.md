# 11-shipping — Reality Audit (2026-06-02)

## Counts
- task files: 32 | manifest task_count: 32 | STATUS rows: 0 (no prior STATUS.md) → reconciliation: clean 1:1
- type breakdown: T1-schema ×6, T2-api ×11, T3-ui ×14, T4-wiring-test ×1

## Task reality

| Task | Title | Declared type | Verdict | Evidence (path) | Gap / note |
|---|---|---|---|---|---|
| T-001 | customers + customer_contacts + customer_addresses + customer_allergen_restrictions schema | T1-schema | ⛔ MISSING | packages/db/migrations/ — no shipping_customers migration | No migration, no Drizzle schema, no test file, no erasure handler |
| T-002 | Customer Server Actions | T2-api | ⛔ MISSING | apps/web/app/.../shipping/ — no _actions dir | Zero server action files for customers |
| T-003 | UI: customer_list_page (SHIP-001) | T3-ui | ⛔ MISSING | apps/web/app/[locale]/(app)/(modules)/shipping/ — no customers subdir | Only skeleton page.tsx exists for shipping module root |
| T-004 | UI: customer_detail_page (SHIP-002) | T3-ui | ⛔ MISSING | same — no customers/ subdir | |
| T-005 | Address + Allergen Restriction modals | T3-ui | ⛔ MISSING | same | |
| T-006 | sales_orders + sales_order_lines + allergen_overrides + shipping_audit_log schema | T1-schema | ⛔ MISSING | packages/db/migrations/ — no sales_orders migration | No migration, no Drizzle schema, no test |
| T-007 | SO Server Actions | T2-api | ⛔ MISSING | apps/web/app/.../shipping/ | |
| T-008 | UI: so_create_wizard_modal | T3-ui | ⛔ MISSING | | |
| T-009 | UI: so_list_page (SHIP-005) | T3-ui | ⛔ MISSING | | |
| T-010 | UI: so_detail_page tabs | T3-ui | ⛔ MISSING | | |
| T-011 | inventory_allocations + pick_overrides schema + FEFO query | T1-schema | ⛔ MISSING | packages/db/migrations/ | |
| T-012 | Allocation Server Actions | T2-api | ⛔ MISSING | | |
| T-013 | Quality hold gate service | T2-api | ⛔ MISSING | | Shared service across pick/pack/ship — critical coupling point |
| T-014 | UI: allocation_global_page + allocation_override_modal | T3-ui | ⛔ MISSING | | |
| T-015 | pick_lists + pick_list_lines + waves schema | T1-schema | ⛔ MISSING | packages/db/migrations/ | |
| T-016 | Pick Server Actions (buildWave, releaseWave, assignPicker, executePick, resolveShortPick) | T2-api | ⛔ MISSING | | |
| T-017 | UI: pick_list_page + wave_builder_page + pick_detail_supervisor_page | T3-ui | ⛔ MISSING | | |
| T-018 | shipments + shipment_boxes + shipment_box_contents schema + sscc_serial sequence | T1-schema | ⛔ MISSING | packages/db/migrations/ | PLACEHOLDER only: 014-r13-placeholder-tables.sql has a skeletal `public.shipment` stub (id, org_id, R13 cols only) — no boxes, no SSCC sequence, not the T-018 contract |
| T-019 | SSCC server-side generation service + ZPL print queue stub | T2-api | 🟡 STUB | packages/gs1/src/check-digit.ts | gs1 package has GS1 check-digit + parse utilities; no SSCC generator service wired to DB; no ZPL queue; not org-scoped |
| T-020 | Pack + Ship Server Actions (closeBox, confirmShipment, reprintSscc, carrierUpsert) | T2-api | ⛔ MISSING | | |
| T-021 | UI: packing_station_workbench + packing_stations_selector + ship_confirm/pack_close modals | T3-ui | ⛔ MISSING | | |
| T-022 | UI: sscc_labels_queue_page + sscc_label_preview + sscc_preview_reprint modal | T3-ui | ⛔ MISSING | | |
| T-023 | Packing slip + BOL generation Server Actions (PDF + SHA-256 + BRCGS 7y retention) | T2-api | ⛔ MISSING | | |
| T-024 | UI: documents_hub_page + packing_slip_preview + bol_preview + modals | T3-ui | ⛔ MISSING | | |
| T-025 | UI + Server Actions: shipments_delivery_tracker_page (POD) | T3-ui | ⛔ MISSING | | |
| T-026 | RMA schema + Server Actions + rma_list_page | T2-api | ⛔ MISSING | | Compound task: schema+API+UI in one |
| T-027 | carriers schema + Server Actions + carriers_list_page | T2-api | ⛔ MISSING | | Compound task: schema+API+UI in one |
| T-028 | UI: shipping_settings_page (SHIP-023) | T3-ui | 🟡 STUB | apps/web/app/[locale]/(app)/(admin)/settings/ship-override-reasons/page.tsx | SettingsRouteStub — placeholder only, no real settings UI |
| T-029 | shipping_outbox_events + shipping_push_dlq schema + D365 SalesOrder dispatcher | T2-api | ⛔ MISSING | | apps/worker does not exist; packages/integrations-d365 does not exist; only packages/outbox present (generic) |
| T-030 | UI: shipping_dashboard page (SHIP-022) | T3-ui | 🟡 STUB | apps/web/app/[locale]/(app)/(modules)/shipping/page.tsx | Skeleton-only: renders count of `public.shipment` rows via getModuleCount("shipment"); no dashboard widgets, no real shipping data |
| T-031 | Add ship.* permission strings to packages/rbac | T1-schema | ⛔ MISSING | packages/rbac/src/permissions.enum.ts | No ship.* entries found in permissions.enum.ts |
| T-032 | E2E Playwright: SO → Alloc → Pick → Pack → Ship-confirm → D365 dispatch happy path | T4-wiring-test | ⛔ MISSING | apps/web/e2e/ — no shipping-spine.spec.ts | All prerequisite tasks also missing |

## Phantom / carry-forward backlog
- apps/worker — referenced by T-029 scope_files but no apps/worker/ directory exists anywhere in the monorepo (only apps/web/). Must be created as part of T-029.
- packages/integrations-d365 — referenced by T-029 scope_files; package does not exist.
- packages/events/src/shipping.ts — referenced by T-029 (modify); packages/events package does not exist.
- @monopilot/gdpr registry — referenced by T-001 (registerErasureHandler); no gdpr package found under packages/.
- packages/db/src/schema/ — entire directory absent; all T1-schema tasks reference schema files there.
- 00-foundation/T-125 (withOrgContext) — consumed by T-001/T-002 as dependency; must be ✅ before any shipping schema/action can start. Check foundation STATUS.md.
- 02-settings allergen_families reference table — T-001 dependency for customer_allergen_restrictions FK.

## Extra (code without a task)
- apps/web/app/[locale]/(app)/(modules)/shipping/page.tsx — skeleton landing page reading `public.shipment` placeholder table. This is Wave 0 skeleton wiring, not owned by any T-018 or T-030 task (T-030 expects a real dashboard). Belongs to SKELETON / Wave 0.
- apps/web/app/[locale]/(app)/(admin)/settings/ship-override-reasons/page.tsx — SettingsRouteStub with no owning task in T-028 scope (T-028 scope is shipping_settings_page SHIP-023, not ship-override-reasons).
- packages/gs1/src/ (check-digit.ts, parse.ts) — GS1 utilities exist without a task that creates them (T-019 expects to create the SSCC service on top; the utilities themselves are 🧩 EXTRA).
- packages/db/migrations/014-r13-placeholder-tables.sql → public.shipment stub — Wave 0 foundation artifact (T-040 pattern), not the T-018 shipments schema.

## Top integration risks
1. **No apps/worker + no packages/integrations-d365** — T-029 D365 outbox dispatcher requires an entirely new app and package that don't exist. This is the heaviest missing infrastructure in the module and blocks SOC 2 / D365 export-only requirement.
2. **Foundation deps unverified for shipping start** — T-001 requires 00-foundation/T-125 (withOrgContext + app.current_org_id()), 00-foundation/T-113 (GDPR registry), and 02-settings allergen_families. None of these are confirmed ✅ in this audit; shipping cannot safely start until they are.
3. **SSCC/BOL/7y-retention chain (T-018→T-019→T-020→T-023)** — server-side SSCC NUMERIC mod-10 gen, ZPL print queue, PDF generation, SHA-256 hash, and BRCGS 7-year retention all form a tight sequential chain with zero implemented pieces; any slip here breaks pack/ship and regulatory compliance.

## Skeleton contribution
- The shipping module landing (`/shipping`) renders a live count from the `public.shipment` placeholder table (Wave 0 ✅ for skeleton DoD).
- All actual shipping-domain routes are 404s — no customers, SO, allocation, pick, pack, ship, documents, dashboard, or settings sub-pages exist.
- The skeleton-visible "Shipping" nav entry works, but clicking into any sub-feature is not possible — no navigation manifest entries for shipping sub-pages observed.
- No skeleton-blocking issues beyond the placeholder: the app loads, the module counts real DB rows, logout works per Wave 0 DoD.

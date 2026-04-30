# Shipping Module — Prototype Translation Notes

Scanned: 2026-04-23  
Source files: `design/Monopilot Design System/shipping/` (7 files)  
Total indexed components: 38  
BACKLOG cross-reference: `BACKLOG.md §Shipping (BL-SHIP-01..14)`

---

## Index summary

| Label | File | Lines | Type | Domain | Time (min) |
|---|---|---|---|---|---|
| customer_create_modal | modals.jsx | 27–67 | modal | Customer | 90 |
| address_modal | modals.jsx | 69–94 | modal | Customer | 60 |
| allergen_restriction_modal | modals.jsx | 96–113 | modal | Allergen | 45 |
| so_create_wizard_modal | modals.jsx | 115–271 | modal | SO | 240 |
| so_line_add_modal | modals.jsx | 273–290 | modal | SO | 60 |
| allocation_override_modal | modals.jsx | 292–340 | modal | PickList | 90 |
| hold_place_modal | modals.jsx | 342–378 | modal | SO | 60 |
| hold_release_modal | modals.jsx | 380–410 | modal | SO | 60 |
| partial_fulfillment_modal | modals.jsx | 412–453 | modal | SO | 90 |
| short_pick_resolve_modal | modals.jsx | 455–502 | modal | PickList | 90 |
| so_cancel_modal | modals.jsx | 504–536 | modal | SO | 75 |
| wave_release_modal | modals.jsx | 538–562 | modal | PickList | 60 |
| pick_reassign_modal | modals.jsx | 564–575 | modal | PickList | 30 |
| pack_close_carton_modal | modals.jsx | 577–607 | modal | PackList | 90 |
| ship_confirm_modal | modals.jsx | 609–700 | modal | Shipment | 150 |
| sscc_preview_reprint_modal | modals.jsx | 702–739 | modal | Shipment | 75 |
| packing_slip_regen_modal | modals.jsx | 741–757 | modal | Document | 45 |
| bol_sign_upload_modal | modals.jsx | 759–790 | modal | Document | 90 |
| carrier_create_edit_modal | modals.jsx | 792–807 | modal | Shipment | 45 |
| release_allocation_modal | modals.jsx | 809–835 | modal | SO | 45 |
| allergen_override_modal | modals.jsx | 837–871 | modal | SO | 90 |
| shipping_dashboard | dashboard.jsx | 1–224 | page-layout | Shipment | 180 |
| so_list_page | so-screens.jsx | 1–139 | page-layout | SO | 150 |
| so_detail_page | so-screens.jsx | 141–366 | page-layout | SO | 210 |
| allocation_global_page | so-screens.jsx | 370–519 | page-layout | SO | 210 |
| pick_list_page | pick-screens.jsx | 1–94 | page-layout | PickList | 120 |
| wave_builder_page | pick-screens.jsx | 98–184 | page-layout | PickList | 150 |
| pick_detail_supervisor_page | pick-screens.jsx | 217–330 | page-layout | PickList | 120 |
| packing_stations_selector_page | pack-screens.jsx | 4–45 | page-layout | PackList | 60 |
| packing_station_workbench_page | pack-screens.jsx | 47–220 | page-layout | PackList | 240 |
| sscc_labels_queue_page | pack-screens.jsx | 224–314 | page-layout | Shipment | 150 |
| sscc_label_preview_component | pack-screens.jsx | 317–336 | dashboard-tile | Shipment | 45 |
| documents_hub_page | doc-screens.jsx | 4–104 | page-layout | Document | 120 |
| packing_slip_preview_page | doc-screens.jsx | 107–215 | page-layout | Document | 150 |
| bol_preview_page | doc-screens.jsx | 217–308 | page-layout | Document | 150 |
| shipments_delivery_tracker_page | doc-screens.jsx | 310–422 | page-layout | Shipment | 150 |
| carriers_list_page | doc-screens.jsx | 424–466 | page-layout | Shipment | 60 |
| rma_list_page | doc-screens.jsx | 468–534 | page-layout | SO | 90 |
| shipping_settings_page | doc-screens.jsx | 536–648 | page-layout | Shipment | 180 |
| customer_list_page | customer-screens.jsx | 1–129 | page-layout | Customer | 150 |
| customer_detail_page | customer-screens.jsx | 132–363 | page-layout | Customer | 240 |

**Total estimated translation time: ~4,035 minutes (~67 hours)**

---

## Cross-cutting patterns

### 1. Shared prototype primitives (not indexed — under 20 lines each)

Every component in this module uses the following unindexed primitives from `_shared/`:

- `Modal` — wraps `@radix-ui/react-dialog`; map to shadcn `Dialog + DialogContent + DialogFooter`
- `Field` — label + input wrapper; map to shadcn `FormField + FormLabel + FormControl + FormMessage`
- `Stepper` — step indicator in SO wizard; map to a custom `ol` with `aria-current` + step dot styling
- `ReasonInput` — textarea with `minLength` live counter; map to `Textarea` + `useWatch` char count
- `Summary` — key-value row list; map to `dl/dt/dd` pairs with mono class for values
- `SOStatus` / `PickStatus` / `ShipStatus` / `QAStatus` — status badge; map to shadcn `Badge` with variant or color class
- `AllocBar` — allocation progress bar; map to shadcn `Progress`
- `HoldChip` — hold type badge; map to shadcn `Badge`
- `AllergenChips` — allergen tag list; map to `Badge` list
- `FefoRank` — FEFO rank integer → colored badge
- `Progress` — pick progress bar; map to shadcn `Progress`
- `Ltree` — path breadcrumb chips for warehouse location; extract as `/components/shared/LtreePath`
- `ScaffoldedScreen` — Phase 2 placeholder; map to a `Card` with placeholder text + phase badge
- `WaveCol` — wave kanban column (27 lines); extract as `/components/shipping/WaveColumn`

### 2. Data layer: mock → Drizzle

All `SH_*` global constants (defined in `data.jsx`, not scanned here) represent future Drizzle queries. Key mappings:

| Mock constant | Production query |
|---|---|
| `SH_CUSTOMERS` | `customers` table with `allergen_restrictions` count join |
| `SH_SOS` | `sales_orders` with `holds`, `picks`, `allocations` relations |
| `SH_SO_DETAIL` | Full `sales_orders` WITH clause: lines, allocations, holds, picks, shipments, history |
| `SH_ALLOC_GLOBAL` | `sales_order_lines LEFT JOIN so_allocations` + status CASE WHEN |
| `SH_LP_CANDIDATES` | `license_plates WHERE status=available AND product_id=? ORDER BY expiry ASC NULLS LAST` |
| `SH_PICKS` | `pick_lists LEFT JOIN users LEFT JOIN waves` |
| `SH_PICK_DETAIL` | `pick_lists WITH pick_list_lines, wave, picker user` |
| `SH_WAVES` | `waves GROUP BY status` (unreleased/released/in_pick/completed) |
| `SH_AVAILABLE_SOS` | `sales_orders WHERE status=allocated AND id NOT IN (SELECT so_id FROM pick_list_sos)` |
| `SH_PACK_SESSION` | `shipments + pack_boxes (active/closed) + pick_list_lines assigned to station` |
| `SH_SSCCS` | `sscc_labels LEFT JOIN pack_boxes LEFT JOIN shipments LEFT JOIN printers` |
| `SH_STATIONS` | `packing_stations LEFT JOIN printers` with real-time health status |
| `SH_DOCS_SLIPS` | `packing_slips LEFT JOIN shipments LEFT JOIN customers` |
| `SH_DOCS_BOLS` | `bills_of_lading LEFT JOIN shipments LEFT JOIN customers` |
| `SH_SHIPMENTS` | `shipments LEFT JOIN sales_orders LEFT JOIN customers LEFT JOIN carriers LEFT JOIN bills_of_lading` |
| `SH_CARRIERS` | `carriers WHERE deleted_at IS NULL` |
| `SH_RMAS` | `rmas LEFT JOIN sales_orders LEFT JOIN customers` |
| `SH_SETTINGS` | `tenant_settings WHERE module=shipping` or `shipping_config` table |
| `SH_KPIS_ROW1/ROW2` | Aggregated SQL queries (COUNT per status, SUM quantities, date filters) |
| `SH_ALERTS` | `shipping_alerts` view or computed from multiple tables |
| `SH_ACTIVITY` | `shipping_audit_log ORDER BY created_at DESC LIMIT 50` |
| `SH_OVERRIDE_REASONS` | `reason_codes` table filtered by `context` column |
| `SH_PRINTERS` | `printers` table + real-time health-check endpoint |
| `SH_ALLERGENS` | `allergen_families` reference table from 02-SETTINGS §8 |

### 3. Server Actions required (audit-logged)

All mutating operations must use Next.js Server Actions with:
- RBAC check from session (`getServerSession`)
- Transactional Drizzle queries (`.transaction()`)
- `INSERT` into `shipping_audit_log` on every mutation
- Outbox event emission for D365 integration (`INSERT shipping_outbox_events` with UUID v7 idempotency key per R14)

Key Server Actions:

| Action | File trigger | RBAC role |
|---|---|---|
| `create_draft_so()` | so_create_wizard_modal | shipping_manager |
| `confirm_so()` | so_detail_page | shipping_manager |
| `cancel_so()` | so_cancel_modal | shipping_manager |
| `insert_so_line()` | so_line_add_modal | shipping_manager |
| `place_hold()` | hold_place_modal | credit_control / shipping_qa / shipping_manager |
| `release_hold()` | hold_release_modal | credit_control / shipping_qa / shipping_manager |
| `resolve_partial()` | partial_fulfillment_modal | shipping_manager |
| `create_alloc_override()` | allocation_override_modal | shipping_manager |
| `release_allocation()` | release_allocation_modal | shipping_manager |
| `override_allergen_hold()` | allergen_override_modal | shipping_qa |
| `resolve_short_pick()` | short_pick_resolve_modal | shipping_manager |
| `release_wave()` | wave_release_modal | shipping_manager |
| `reassign_picker()` | pick_reassign_modal | shipping_manager |
| `close_box()` | pack_close_carton_modal | packing_operator |
| `confirm_shipment()` | ship_confirm_modal | shipping_manager |
| `reprint_sscc()` | sscc_preview_reprint_modal | packing_operator |
| `regenerate_packing_slip()` | packing_slip_regen_modal | shipping_manager |
| `upload_signed_bol()` | bol_sign_upload_modal | shipping_manager |
| `upsert_carrier()` | carrier_create_edit_modal | shipping_manager |
| `create_customer()` / `update_customer()` | customer_create_modal | shipping_manager |
| `upsert_address()` | address_modal | shipping_manager |
| `save_allergen_restrictions()` | allergen_restriction_modal / customer_detail allergens tab | shipping_qa |
| `save_allocation_settings()` etc. | shipping_settings_page | Admin |

### 4. D365 outbox integration

The `confirm_shipment()` Server Action is the only action that emits a D365 outbox event directly. Pattern:

```
INSERT shipping_outbox_events (
  idempotency_key = uuid_generate_v7(),
  event_type      = 'shipment.confirmed',
  payload         = JSON payload (dataAreaId, shipmentId, customerAccount, warehouse, lines, boxes, shippedAt),
  status          = 'queued'
)
```

Dispatcher worker (separate process): dequeues, calls D365 OData endpoint, retries 5m/30m/2h/12h/24h. Gated by feature flag `d365_shipping_push_enabled`.

The `fefo.overridden` event (allocation_override_modal) similarly inserts into `shipping_outbox_events` with `event_type=shipping.fefo.overridden`.

### 5. GS1 / SSCC generation

SSCC generation must be server-side atomic. Pattern:

```sql
SELECT nextval('sscc_serial_seq') AS serial;
-- SSCC-18 = extension(1) + gs1_prefix(7) + serial_padded(8) + mod10_check(1)
-- Store in sscc_labels table; emit ZPL job to printer queue
```

The prototype's `V-SHIP-PACK-04` validation rule maps to the `sscc_serial_seq` PostgreSQL sequence (atomic, no gaps on close). The check digit is computed using GS1 standard Mod-10 algorithm server-side — never in client code.

### 6. Allergen cascade flow

The `allergen_cascade_v1` rule is referenced in: SO wizard step 3, SO detail allergen alert, customer allergen restrictions tab, packing slip generation, BOL allergen section. Implementation path:

```
product.allergens[] (FA table from 03-TECHNICAL)
  → allergen_cascade_v1 rule (02-SETTINGS §7, rules registry)
    → customer_allergen_restrictions (refuses[] / requires_decl[])
      → SO confirm validation (V-SHIP-SO-03): block if product allergen ∈ customer.refuses
        → packing slip bold labelling (V-SHIP-LBL-01): allergen in <strong> per EU 1169/2011
        → BOL allergen aggregate section
```

Server-side function `check_allergen_conflicts(so_id)` returns `ConflictRow[]` for use in SO wizard step 3 and SO detail.

### 7. BRCGS 7-year retention (BOL)

`upload_signed_bol()` Server Action:
1. Accept multipart PDF/JPG/PNG ≤ 10 MB
2. Compute SHA-256 server-side (`crypto.subtle.digest` in edge runtime or `node:crypto`)
3. Upload to Supabase Storage with `x-upsert: false` (no overwrite)
4. Apply immutability policy: custom RLS + storage lifecycle tag `brcgs_retention=true`
5. Store hash in `bills_of_lading.signed_hash`, `signed_at`, `driver_name`, `signature_date`
6. P2: 21 CFR Part 11 e-signature + PIN re-verify before upload permitted

### 8. Known bugs (BL-SHIP from BACKLOG.md)

| ID | Severity | Description |
|---|---|---|
| BL-SHIP-01 | Medium | POD upload modal (SHIP-028) separate from BOL sign-off not built |
| BL-SHIP-02 | Low | Allergen override inline collapse in SO wizard when shipping_qa active |
| BL-SHIP-03 | Medium | Wave edit modal — Edit stub button on unreleased column has no backing modal |
| BL-SHIP-04 | Medium | RMA Detail (SHIP-027) 4-tab screen not built |
| BL-SHIP-05 | P2 | Carrier rate quote modal stub |
| BL-SHIP-06 | P2 | Credit limit override modal stub |
| BL-SHIP-07 | Low | Bulk SSCC reprint — M-16 is single-label; spec mentions bulk ZPL job |
| BL-SHIP-08 | Low | Address modal V-SHIP-SO-02 not enforced on Customer Detail address list |
| BL-SHIP-09 | P2 | Pricing tab on Customer Detail is ScaffoldedScreen |
| BL-SHIP-10 | Low | D365 DLQ dashboard link has no event preview inline |
| BL-SHIP-11 | Low | Global topbar search is static |
| BL-SHIP-12 | P2 | Multi-language packing slip dropdown disabled |
| BL-SHIP-13 | P2 | HAZMAT + EUDR flag UIs shown disabled |
| BL-SHIP-14 | Low | Ship confirm — DLQ kick button missing from retry cadence UI |

Additionally note from BACKLOG.md (BL-PROD-05, HIGH): `.btn-danger` class referenced throughout modals (soCancel, holdRelease, allergenOverride, releaseAlloc, allergenOverride) but **missing from production CSS**. Fix at `_shared/shared.css` for system-wide coverage before any shipping modal is production-ready.

### 9. Validation rules referenced in prototype (V-SHIP-*)

| Rule ID | Location | Description |
|---|---|---|
| V-SHIP-SO-01 | so_create_wizard step 1 | Inactive customers disabled in customer select |
| V-SHIP-SO-02 | address_modal, customer_detail | At least one shipping address required before SO confirmation |
| V-SHIP-SO-03 | so_create_wizard step 3 | Allergen cascade check; conflict blocks confirm unless QA override |
| V-SHIP-SO-04 | so_create_wizard step 1 | Promised ship date ≥ order date |
| V-SHIP-SO-05 | so_create_wizard step 2 | At least 1 SO line required |
| V-SHIP-SO-06 | so_create_wizard step 2 / so_line_add | All quantities must be > 0 |
| V-SHIP-SO-07 | so_cancel_modal | Cancel blocked once SO is shipped or delivered |
| V-SHIP-ALLOC-01 | allocation_global_page | LP must be status=available in 05-WAREHOUSE |
| V-SHIP-ALLOC-02 | allocation_global_page | FEFO rank 1 preferred; override requires reason |
| V-SHIP-ALLOC-03 | allocation_global_page | Expired LPs disabled unless admin toggle |
| V-SHIP-ALLOC-04 | allocation_global_page | Allergen conflict requires shipping_qa override |
| V-SHIP-PACK-02 | pack_close_carton_modal | Confirm box weight required; validated against variance_tolerance_pct |
| V-SHIP-PACK-03 | shipping_settings labels tab | GS1 Company Prefix must be 7–10 digits |
| V-SHIP-PACK-04 | sscc_labels_queue_page | SSCC atomic sequence; no gaps |
| V-SHIP-SHIP-01 | ship_confirm_modal | All boxes must have SSCC before shipment confirm |
| V-SHIP-SHIP-02 | ship_confirm_modal | BOL must be generated before shipment confirm |
| V-SHIP-SHIP-03 | ship_confirm_modal | No critical QA holds active |
| V-SHIP-LBL-01 | packing_slip_preview | Allergens bold in PDF per EU 1169/2011 |
| V-SHIP-LBL-02 | pack_close_carton_modal | SSCC: atomic seq + GS1 prefix + mod-10 check digit |
| V-SHIP-LBL-04 | documents_hub_page | BOL retained 7 years per BRCGS Issue 10 §3.4 |
| V-SHIP-LBL-05 | packing_slip_preview | Multi-language packing slip (P2) |

All V-SHIP-* rules must be enforced server-side in the relevant Server Actions — client-side UI is advisory only.

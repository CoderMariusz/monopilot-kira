# 11-SHIPPING PRD — Monopilot MES

**Wersja:** 3.2 | **Data:** 2026-04-30 | **Status:** Standardized Multi-industry + UX-coverage closed (Phase C4 Sesja 3 + 2026-04-30 design-PRD reconciliation)
**Poprzednia wersja:** v3.1 (2026-04-30 standardization), v3.1-baseline (2026-02-18 pre-Phase-D) — zachowane w historii

---

## 1. Executive Summary

Modul **11-SHIPPING** obsluguje pelny cykl **order-to-delivery** dla wyrobow gotowych (FG) w multi-tenant food-mfg MES. Zakres P1 obejmuje: zarzadzanie klientami, sales order (SO) lifecycle (draft → shipped), LP-based allocation z FEFO/FIFO, pick/pack/ship scanner-first + desktop mixed, SSCC-18 labeling GS1-compliant, BOL + packing slip generation, RMA receiving/disposition, dashboard KPI + INTEGRATIONS stage 3 D365 SalesOrder confirm push (outbox pattern clone z 08-PROD §12 stage 2).

**Pozycja w Module Map (per 00-FOUNDATION §4.2):** 11-SHIPPING jest **consumer** 05-WAREHOUSE (LP state + FEFO query), 04-PLANNING-BASIC (customer_orders + D365 SO trigger), 09-QUALITY (quality_holds + soft gate), 03-TECHNICAL (product master + GTIN + allergens + shelf_life), 02-SETTINGS (D365_Constants, rule registry, reference tables). **Producer** do 10-FINANCE (COGS per shipment P2), 12-REPORTING (OTD + fulfillment rate), 13-MAINTENANCE (vehicle inspections P2 if fleet owned), oraz **D365 external** (SalesOrder confirm push async via outbox).

**Kluczowe wyrozniki v3.0 (nowe vs v3.1 baseline):**
- **Quality hold soft gate (D-SHP-13):** shipping blokuje pick/pack **miekko** (warn + operator override + `reason_code` + audit) gdy LP.qa_status='HOLD' — spojne z 05-WH Q6B FEFO deviation pattern i 06-SCN per-severity error policy (block/warn/info). Hard gate via `batch_release_gate_v1` (P2 rule z 09-QA) tylko dla severity=critical.
- **INTEGRATIONS stage 3 (D-SHP-14):** `shipment.confirmed` event → D365 SalesOrder confirm push via outbox (`shipping_outbox_events` table, identyczny schema jak 08-PROD §9.10). Retry schedule 5min/30min/2h/12h/24h, DLQ po 5 attempts, R14 UUID v7 idempotency, R15 anti-corruption adapter `@monopilot/d365-shipping-adapter`.
- **Allergen labelling EU 1169/2011 (D-SHP-15):** auto-bold allergen list na packing slip + BOL + SSCC ASN (Advance Shipping Notification). Consumer `products.allergens` JSONB z 03-TECH + `customers.allergen_restrictions` dla segregation warning.
- **GS1 Digital Link QR P2 (D-SHP-16):** P1 SSCC-18 GS1-128 barcode (baseline D-SHP-4 retained). P2 Digital Link QR syntax (GTIN + batch + expiry) dla retailer-ready ASN (MES-TRENDS R10).
- **Catch weight carve-out (D-SHP-17):** `sales_order_lines.cw_quantity` P2 (baseline [7.1]), weight variance tracking per shipment_box manual entry P1 (jesli product.weight_mode='catch' per 03-TECH §8).
- **D365 Constants reuse (D-SHP-18):** FNOR (dataAreaId), ApexDG (warehouse code), FinGoods (GL account for revenue) — read z 02-SETTINGS §11 w adapter. Phase 2 extensions: `shipping_warehouse`, `courier_default_carrier`, `customer_account_id_map`.
- **Manual dispatch P1 + carrier API P2 (D-SHP-19):** P1 BOL + packing slip manual PDF/ZPL print, DHL/UPS/DPD API integration P2 (rate shopping, tracking webhooks, POD).
- **EUDR supplier_dds_reference gate P2 (D-SHP-20):** jesli FG zawiera soy/palm/cocoa ingredient → gate block shipment if `supplier.dds_reference` IS NULL (EU Deforestation Regulation 2026-12-30 deadline).

**Markers:** [UNIVERSAL] = core MES contract | [APEX-CONFIG] = konkretny fit Apex UK | [EVOLVING] = areas in iteration | [LEGACY-D365] = bridge until D365 retirement.

---

## 2. Objectives & Metrics

### Cel glowny

Umozliwienie pelnego cyklu **order-to-delivery** dla Apex UK (pilot) i innych food-mfg SMB (multi-tenant) z zachowaniem: FSMA 204 traceability (<30s), EU 1169/2011 allergen compliance, GS1 SSCC-18 retailer-ready labeling, BRCGS Issue 10 audit trail (7y retention), zero cross-tenant leaks (RLS enforced).

### Metryki sukcesu Phase 1 (MVP)

| Metryka | Cel P1 | Pomiar | Zrodlo |
|---|---|---|---|
| Order Fulfillment Time | <24h (draft→shipped) | AVG(shipped_at - confirmed_at) | sales_orders |
| Pick Accuracy | >99% | Correct product+lot+qty vs pick_list | pick_list_lines z scanner confirm |
| On-Time Delivery (OTD) | >95% | shipped_at ≤ promised_ship_date | shipments |
| Allergen Compliance | 100% | Wszystkie SO z conflict = blocked OR overridden+audit | allergen_validations audit |
| SSCC Label Print Success | >99.5% | valid / total generated | shipment_boxes.sscc |
| Scanner Operation Time | <30s per pick line | APM on scanner API /pick | scanner_audit_log |
| D365 SO Confirm Push Success | ≥99.9% within 5min | `shipping_outbox_events.status='delivered'` P95 latency | shipping_outbox_events |
| Fulfillment Rate | >95% | SUM(qty_shipped)/SUM(qty_ordered) | sales_order_lines |
| Pack Time per Box | <5 min | AVG(box_closed_at - box_started_at) | shipment_boxes |

### Metryki sukcesu Phase 2 (po P1 stabilny)

| Metryka | Cel P2 | Uwagi |
|---|---|---|
| COGS accuracy per shipment | ±0.5% vs actual | Consumer 10-FIN inventory_cost_layers |
| Carrier cost savings | >10% vs manual | Rate shopping engine |
| Return Processing Time | <48h (RMA→restocked) | End-to-end RMA cycle |
| EPCIS event publish success | ≥99% (retailer ASN) | 05-WH §13.7 consumer P2 |
| Peppol e-invoice P2 (if scope) | ≥99% delivery | If Apex expands to Belgium customers |

---

## 3. Personas & Roles

| Persona | Role w Shipping | Typowe workflows | Urzadzenie |
|---|---|---|---|
| **Warehouse Operator** | Pick/pack/load, scan barcodes | Scan LP → verify location → confirm qty → add to box → close box → print SSCC | Scanner (Zebra TC52 + camera fallback) |
| **Warehouse Manager** | Oversight, wave planning, allocation | Desktop: SO allocation wizard, wave builder, dashboard, override approvals | Desktop |
| **Sales Clerk** | Customer/SO creation, status monitoring | Desktop: customer CRUD, SO creation wizard, status tracking | Desktop |
| **QA Lead** | Allergen review, RMA disposition, hold release | Desktop: allergen conflict override, RMA disposition (restock/scrap/hold), release quality_holds | Desktop |
| **Plant Director** | KPI monitoring, OTD%, fulfillment dashboard | Dashboard read-only | Desktop tablet |
| **Finance Manager** | COGS per shipment review (P2) | Desktop: shipment cost report | Desktop |
| **Admin** | D365_Constants config, carrier API keys (P2), role/RLS audit | Desktop: 02-SETTINGS shipping tab | Desktop |

**RBAC mapping (extends 02-SETTINGS §14):**
- `shipping_operator` — scanner workflows + read pick_lists
- `shipping_manager` — desktop all + override allergen + override FEFO + assign pick_lists + cancel SO
- `shipping_sales` — customer CRUD + SO CRUD (draft/confirmed/hold/cancel)
- `shipping_qa` — allergen override approver + RMA disposition + quality_hold release
- `shipping_admin` — D365_Constants + carrier configs + rule registry read

---

## 4. Scope

### 4.1 In Scope — Phase 1 (MVP)

| # | Obszar | Zakres | Priorytet |
|---|---|---|---|
| 1 | **Customer Management** | CRUD customers, contacts, addresses (billing/shipping), allergen_restrictions, order history | Must |
| 2 | **Sales Orders Core** | SO CRUD, lines, status machine (draft→confirmed→allocated→picking→packing→shipped→delivered), allergen validation mandatory, partial fulfillment | Must |
| 3 | **Allocation & Picking** | LP-based alloc, FEFO/FIFO suggestions, pick list gen, wave picking basic (max 50 SO/wave), scanner + desktop mixed, short-pick handling | Must |
| 4 | **Packing & Shipping** | Packing workbench desktop (mixed) + scanner (pallet-level), multi-box, SSCC-18 GS1-128, BOL + packing slip PDF/ZPL, shipment manifest, ship confirmation | Must |
| 5 | **Quality Hold Integration** | Soft gate (warn + override + reason_code + audit) na LP.qa_status='HOLD' przy pick; block hard jesli severity='critical' via `batch_release_gate_v1` (P2) | Must |
| 6 | **Allergen Labelling** | Auto-bold allergen list na packing slip + BOL + SSCC ASN (EU 1169/2011 compliant) | Must |
| 7 | **RMA Phase 1** | RMA CRUD, receiving scanner flow, disposition (restock/scrap/quality_hold) | Must |
| 8 | **Dashboard & Reports P1** | KPI cards (SO by status, pending picks, backorders, fulfillment rate, SSCC print success), orders-by-status chart | Should |
| 9 | **INTEGRATIONS stage 3** | D365 SalesOrder confirm push async via outbox (clone 08-PROD §12 pattern), R14/R15, DLQ + retry 5min/30min/2h/12h/24h | Must |
| 10 | **Partial shipments** | Jeden SO → multiple shipments (D-SHP-10/12 baseline retained) | Must |
| 11 | **Audit trail** | PG triggers na SO/lines/allocations/pick_lists/shipments/RMA z old_data/new_data/user/ip/reason (ADR-008) | Must |
| 12 | **RLS multi-tenant** | `org_id UUID NOT NULL` na WSZYSTKICH tabelach + per-role policies | Must |

### 4.2 In Scope — Phase 2 (deferred)

| # | Obszar | Uwagi |
|---|---|---|
| 1 | **CW na SO lines** | `sales_order_lines.cw_quantity` + `cw_unit` (baseline [7.1]) |
| 2 | **Pack quantity** | `sales_order_lines.pack_quantity` (baseline [7.2]) |
| 3 | **Mode of delivery** | `sales_orders.mode_of_delivery` enum road/rail/air/sea/courier (baseline [7.4]) |
| 4 | **Order charges** | `sales_orders.order_charges` JSONB {delivery_fee, surcharges[]} (baseline [7.5]) |
| 5 | **Delivery type** | `sales_orders.delivery_type` stock/direct (baseline [7.6]) |
| 6 | **Customer advanced** | Credit limits (warning), categories, payment terms, pricing agreements |
| 7 | **Wave picking advanced** | Zone/route optimization, batch picking, auto-wave-creation |
| 8 | **Carrier API integration** | DHL/UPS/DPD rate shopping, tracking webhooks, POD, label generation via API |
| 9 | **Dock management** | dock_doors, dock_appointments, load planning, staging, temp zone validation |
| 10 | **COGS per shipment** | Consumer 10-FIN `inventory_cost_layers` at shipment confirm event |
| 11 | **EPCIS consumer** | `shipping_outbox_events` produces EPCIS 2.0 JSON-LD events (05-WH §13.7 P2) |
| 12 | **GS1 Digital Link QR** | Retailer-ready QR syntax encoding GTIN + batch + expiry (MES-TRENDS R10) |
| 13 | **EUDR supplier gate** | `supplier_dds_reference` gate block shipment if soy/palm/cocoa FG content + null DDS (Q10, 2026-12-30 deadline) |
| 14 | **Peppol B2B e-invoice** | NOT IN SCOPE dla Apex UK. Only if expansion to Belgium (2026-01-01 deadline) |
| 15 | **Advanced reports** | Pick performance, OTD decomposition, carrier performance, returns analysis |
| 16 | **Batch release hard gate** | `batch_release_gate_v1` full rule activation (09-QA P2 rule) |
| 17 | **Multi-warehouse shipping** | Current P1 = single warehouse; multi-warehouse P2 + 14-MULTI-SITE integration |

### 4.3 Exclusions (NIGDY w 11-SHIPPING)

- Pelna ksiegowosc / invoicing → 10-FINANCE (receivables P2 EPIC 10-M)
- Customer self-service portal → future module (post-P2, candidate dla 15-OEE batch lub dedicated customer-portal module)
- Drop-shipping (direct from supplier) — 04-PLANNING PO → supplier direct, wycofano
- Peppol B2B e-invoice (Belgium-specific) — nie dotyczy Apex UK
- Fleet management (own trucks, drivers) — 13-MAINTENANCE scope jesli Apex rozszerzy

### 4.4 EUDR P2 scope check (per Q10 user confirmed)

EU Deforestation Regulation 2026-12-30 dotyczy **produktow zawierajacych**: soy, palm oil, cocoa, coffee, cattle/beef, wood, rubber. **Apex UK reality** (per Phase A pld-v7-excel docs): produkty zawieraja meat (mogly byc fed soy/palm feed upstream) + potential palm oil w niektorych formulacjach FG. **Decyzja D-SHP-20:** P2 gate block shipment if:
1. Product BOM contains item with `items.eudr_category` IN ('soy','palm','cocoa','beef','wood','rubber') AND
2. Supplier `supplier.dds_reference` IS NULL AND
3. Feature flag `integration.eudr.enabled` = TRUE (per-org)

Implementacja P2 → 03-TECHNICAL extension `items.eudr_category` + `suppliers.dds_reference` + gate DSL rule `eudr_compliance_gate_v1` rejestrowane w 02-SETTINGS §7 P2.

---

## 5. Constraints

### 5.1 Technical

- **LP-only allocation** (ADR-001 retained): brak luznych ilosci; `inventory_allocations(sales_order_line_id, license_plate_id, quantity_allocated)` z `SELECT FOR UPDATE` na LP
- **RLS multi-tenant** (ADR-003/013): `org_id UUID NOT NULL` na WSZYSTKICH tabelach; `USING (org_id = current_org_id())` baseline policy + per-role extensions
- **Service layer** (ADR-015/016/018): logika w `lib/services/shipping-*.ts`, walidacja Zod, NIGDY direct DB z UI
- **site_id NULL** (ADR-030 multi-site prep): kolumna od poczatku, default NULL; wykorzystana w 14-MULTI-SITE P2
- **schema-driven ext cols** (ADR-028 L3): `shipping_ext_*` tables dla per-org custom fields

### 5.2 Business

- **Base currency:** GBP (Apex UK, per 10-FIN Q9 decision). Multi-currency P2 EPIC 10-J consumer
- **GS1 Company Prefix:** wymagany na poziomie organizacji (`organizations.gs1_company_prefix`) — blocker dla SSCC generation
- **Apex pilot first:** single warehouse MVP; multi-warehouse P2 + 14-MULTI-SITE
- **Carrier API keys:** developer accounts wymagane (DHL/UPS/DPD business) — P2 scope
- **Partial shipments:** YES (D-SHP-12 retained); one SO → multiple shipments supported P1

### 5.3 Regulatory

| Regulacja | Termin | Impact P1/P2 | Sekcja ref |
|---|---|---|---|
| **FSMA 204 (USA)** | 2028-07-20 | P1 traceability <30s via `lp_genealogy` (05-WH §11 consumer); shipment events include LPs | §14 |
| **EU 1169/2011 + 2021/382** | Active | P1 allergen labelling mandatory (bold list on packing slip + BOL); digital segregation warning | §13 |
| **GS1 SSCC-18** | Industry standard | P1 mandatory per box/pallet (D-SHP-4); retailer ASN ready | §13 |
| **BRCGS Issue 10** | 2026 | P1 audit trail 7y retention, e-signature on delivery (POD), digital BOL immutable hash | §14 |
| **EUDR (Deforestation)** | 2026-12-30 | P2 supplier DDS gate (D-SHP-20, Q10) | §14 |
| **EPCIS 2.0** | Best practice | P2 consumer shipping events JSON-LD via 05-WH §13.7 outbox | §14 |
| **21 CFR Part 11** | Active | P2 e-sig on RMA approval + quality hold override (SHA-256 + PIN re-verify, reuse 09-QA pattern) | §14 |
| **Peppol B2B** | 2026-01-01 BE | NOT IN SCOPE Apex UK; P2 only if Belgium expansion | §4.3 exclusions |

---

## 6. Decisions D-SHP-1..20

### Retained z v3.1 baseline (D-SHP-1..12)

#### D-SHP-1. LP-Based Allocation (ADR-001 retained) [UNIVERSAL]
Alokacja zapasow wylacznie przez LP. Kazde LP ma `status` enum (available→reserved→shipped) + `qa_status`. `inventory_allocations(sales_order_line_id FK, license_plate_id FK, quantity_allocated, allocated_at, allocated_by)` laczy SO line z LP. Przy ship confirmation: `LP.status := 'shipped'` + audit `lp_state_transitions` (05-WH §6 consumer). Race condition protection: `SELECT ... FOR UPDATE` na LP przy alokacji (DB transaction).

#### D-SHP-2. FEFO/FIFO Picking (ADR-005 retained) [UNIVERSAL]
Default **FEFO** (najwczesniejsza `expiry_date` ASC NULLS LAST) dla produktow z `expiry_date`. **FIFO** fallback (`received_date` ASC) dla produktow bez daty waznosci. **Expired LP hard-block** (z opcja supervisor override + reason_code). Per-product `items.picking_strategy` ENUM (fefo/fifo/manual) z 05-WH Q3 P1 retained. Per-pick runtime override by `shipping_manager` z audit `pick_overrides`.

#### D-SHP-3. Shelf-Life per Product (03-TECH consumer) [UNIVERSAL]
Shelf life per produkt (NIE per dostawca). `products.shelf_life_days` z 03-TECH §9. FEFO sorting = `expiry_date` per LP obliczana jako `manufacturing_date + products.shelf_life_days` lub wpisywana recznie przy GRN (05-WH §7). EU 1169/2011 gating: `use_by` vs `best_before` per product z 05-WH §12 P1.

#### D-SHP-4. GS1 SSCC-18 Compliance (ADR-004 retained) [UNIVERSAL]
SSCC-18 per paczka/paleta: `Extension(1) + GS1_Prefix(7-10) + Serial(6-8) + CheckDigit(1)`. Sekwencja per org: `organizations.next_sscc_sequence` atomic increment via `SELECT ... FOR UPDATE`. GS1-128 barcode na etykietach. GS1 Company Prefix konfigurowany w 02-SETTINGS §11. P2: GS1 Digital Link QR syntax (D-SHP-16).

#### D-SHP-5. Allergen Validation Mandatory [UNIVERSAL]
Walidacja alergenow **OBOWIAZKOWA** przed `sales_orders.status := 'confirmed'`. Check: `customer.allergen_restrictions` (JSONB array UUID) vs `product.allergens` (JSONB z 03-TECH §10) per line SO. **Konflikt → block confirm** (chyba ze override z audit trail `allergen_overrides` + `shipping_qa` role + reason_code + SHA-256 hash BRCGS). Alert banner (red) w UI. Separation warning w pick/pack workflows (same-box allergens → yellow warn).

#### D-SHP-6. Scanner-First UX (ADR-006 retained, extended) [UNIVERSAL]
Scanner URL tree: `/scanner/shipping/pick`, `/scanner/shipping/pack`, `/scanner/shipping/return`. 48px touch targets, scan-first input, linear flow. 3-method input parity (consumer 06-SCN Q4 upgrade): hardware scanner (Zebra/Honeywell wedge) + camera (`@zxing/browser` MIT) + manual. **Q2 decision: C Both** — scanner dla pallet-level pick/pack, desktop dla mixed/small order allocation. Offline queue (FIFO replay) via 06-SCN Q3 pattern P1.

#### D-SHP-7. RLS Multi-tenant (ADR-003/013) [UNIVERSAL]
`org_id UUID NOT NULL` na WSZYSTKICH 16 tabelach. Baseline RLS: `USING (org_id = current_org_id())`. Extensions:
- `pick_lists`: `USING (org_id = current_org_id() AND (assigned_to = current_user_id() OR has_role('shipping_manager')))`
- `carrier_configs` (P2): `USING (org_id = current_org_id() AND has_role('shipping_admin'))`
- `rma_requests`: read all w org, write requires `shipping_sales` OR `shipping_manager`

#### D-SHP-8. SO Status Machine + Guards [UNIVERSAL]
```
draft → confirmed → allocated → picking → packing → shipped → delivered
   ↓
cancelled (any state before shipped; releases allocations)
```
Guards enforced w service layer (walkthrough §8):
- `confirm`: `allergen_validated = TRUE` AND `shipping_address_id IS NOT NULL`
- `allocated`: `has_allocations() >= needed_qty` (partial allowed z flag)
- `picking`: `pick_list_id IS NOT NULL AND pick_list.status IN ('assigned','in_progress')`
- `packing`: `all_pick_lines.status = 'picked'`
- `shipped`: `all_boxes.sscc IS NOT NULL AND BOL.generated_at IS NOT NULL AND no_open_critical_holds()`

Workflow-as-data (ADR-019): `so_state_machine_v1` rejestrowany w 02-SETTINGS §7 registry. Admin tylko names/colors per tenant (L2 variation, ADR-030).

#### D-SHP-9. SO Pricing (03-TECH consumer) [UNIVERSAL]
`sales_order_lines.unit_price` default z `products.default_sell_price` (03-TECH §11 owner). 11-SHIP **tylko odczytuje**. P2: pricing agreements per customer (`customer_pricing_agreements` table) override default. Manual override z audit (`sales_order_line_audit`).

#### D-SHP-10. Backorder Handling [UNIVERSAL]
Dual approach:
- **Partial allocation**: `sales_orders.status := 'partial'` flag set (no new record)
- **Optional auto-backorder**: per-org config `organization_settings.auto_create_backorder` (default FALSE) → tworzy `backorder_records(original_so_id, qty_backordered)` dla future fulfillment
- **Multi-shipment**: jeden SO → N shipments supported (D-SHP-12 retained)

#### D-SHP-11. Audit Trail (ADR-008) [UNIVERSAL]
PG triggers + app context (`SET LOCAL app.user_id`, `app.ip_address`, `app.reason`):
- `sales_orders`, `sales_order_lines`, `inventory_allocations`, `pick_lists`, `pick_list_lines`, `shipments`, `shipment_boxes`, `rma_requests`, `rma_lines`
- Logging: `old_data JSONB`, `new_data JSONB`, `user_id`, `ip_address`, `action_reason`, `changed_at TIMESTAMPTZ`
- Retention: **7 lat post-ship** (BRCGS Issue 10 per §14)

#### D-SHP-12. Business Baseline Decisions [UNIVERSAL + APEX-CONFIG]
- Partial shipments: **YES** (one SO → multi shipments) [Q8: B confirmed]
- Multi-warehouse: **NO** w P1 (single warehouse MVP); P2 + 14-MULTI-SITE integration
- Auto-allocation on confirm: **configurable** per-org (default TRUE)
- LTL freight: **manual BOL** w P1, API P2
- SO numbering: `SO-YYYY-NNNNN` auto-generated, unique per org
- Credit limit P2: warning only, **NIE block**

### Extended w v3.0 (D-SHP-13..20)

#### D-SHP-13. Quality Hold Soft Gate [UNIVERSAL]
**Q6 decision: B Soft warn + operator override + reason_code + audit.** Spojne z:
- 05-WH Q6B FEFO deviation (warn+confirm+reason_code, nigdy hard block)
- 06-SCN Q6 per-severity error policy (block/warn/info z reason_code dla warn)

**Mechanika:**
1. Przy `POST /api/shipping/sales-orders/:id/allocate` i `POST /api/scanner/pick`:
   - Query `SELECT qa_status, current_hold_severity FROM license_plates WHERE id = $1`
   - IF `qa_status='HOLD'`:
     - IF `current_hold_severity='critical'` (09-QA hold_reason.priority) → **hard block**, enforce via `batch_release_gate_v1` DSL rule z 09-QA (P2 activation) — show blocking error
     - ELSE (major/medium/minor) → **soft warn**, show modal "LP held: <hold_reason>. Continue anyway?" z required `reason_code` dropdown + `notes` TEXT
2. Override logged w `pick_overrides(org_id, user_id, pick_list_line_id, license_plate_id, override_type='quality_hold', hold_id, reason_code, notes, overridden_at)`
3. Audit retention: 7 lat (BRCGS)
4. Event produced: `shipping.quality_hold.overridden` → 09-QA consumer (audit log sync)

**Consumer hook:** `quality.hold.released` event (09-QA producer) → shipping resumes normal (soft warning removed from affected LP).

#### D-SHP-14. INTEGRATIONS Stage 3 D365 SalesOrder Confirm Push [LEGACY-D365]
**Q5 decision: A Per-shipment push async via outbox.** Exact clone 08-PROD §12 stage 2 pattern (template reuse confirmed w C4 Sesja 2 close).

**Event flow:**
1. `POST /api/shipping/shipments/:id/confirm` succeeds → DB transaction:
   - `UPDATE shipments SET status='shipped', shipped_at=NOW()`
   - `UPDATE license_plates SET status='shipped' WHERE id IN (...)` (cascading)
   - `INSERT INTO shipping_outbox_events(event_id, tenant_id, event_type='shipment.confirmed', aggregate_id=shipment_id, payload, target_system='D365', idempotency_key)` — all w jednej tx
2. Dispatcher service (Python/Node worker, shared z 08-PROD dispatcher infra):
   - Polls `WHERE status='pending' AND (next_retry_at IS NULL OR next_retry_at < NOW()) AND target_system='D365'` every 30s
   - Transforms internal payload → D365 `SalesOrderHeaderEntity` + `SalesOrderLineEntity` via `@monopilot/d365-shipping-adapter` (R15 anti-corruption)
   - POST D365 OData endpoint; on 2xx → `status='delivered', delivered_at=NOW()`; on 4xx/5xx → `status='failed', attempt_count++, next_retry_at=NOW() + interval`
   - Retry schedule (identical z 08-PROD): 5min, 30min, 2h, 12h, 24h
   - After 5 attempts → `INSERT INTO shipping_push_dlq` + `UPDATE shipping_outbox_events.status='in_dlq'`
3. R14 idempotency: `event_id UUID v7` unique + `idempotency_key = shipment_id::TEXT || '::' || version_counter`

**DLQ ops screen:** `/admin/integrations/d365/dlq` (reuse z 08-PROD SCR-08-06 + filter source='shipping')

**Shared artifacts (08-PROD + 10-FIN + 11-SHIP):**
- `@monopilot/d365-outbox-dispatcher` (common worker, routes by `target_system`)
- `@monopilot/d365-code-mapper` (R15 lookup `integration.d365.code_map` z 02-SETTINGS §11)
- Retry policy constants w shared config

#### D-SHP-15. Allergen Labelling EU 1169/2011 P1 [UNIVERSAL]
Auto-bold allergen list na dokumentach shipping:
- **Packing slip**: "Contains: **wheat**, **milk**, **egg**" sekcja per produkt (bold via HTML `<strong>` w PDF, matching Unicode bold w ZPL)
- **BOL**: shipping-level aggregated allergen list (union wszystkich produktow w shipment) + customer `allergen_restrictions` segregation warning if any conflict
- **SSCC ASN XML/JSON**: `Allergens` element list GTIN-linked (retailer-ready per GS1 Digital Link P2)

**Consumer contracts:**
- `products.allergens` JSONB array allergen_code (EU-14 + custom z 03-TECH §10 allergen cascade)
- `customers.allergen_restrictions` JSONB array allergen_code (warn only, allows ship)
- Nutrition declaration auto-calc z NPD `product_nutrition_facts` (01-NPD) dla P1 display on packing slip; full compliance label gen P2 (includes QUID, organic, etc.)

**Format validation V-SHIP-LBL-01..V-SHIP-LBL-05** (§11):
- allergen list matches BOM cascade (via 03-TECH ADR-029 rule `allergen_cascade_v1`)
- no missing EU-14 allergens (per label regulation)
- customer restriction conflict → segregation warning on picking sequence

#### D-SHP-16. GS1 Digital Link QR P2 [UNIVERSAL]
P1 retains SSCC-18 + GS1-128 barcode (D-SHP-4). P2 additive: GS1 Digital Link QR syntax on packing slip + carton label:
```
https://id.gs1.org/01/{GTIN}/10/{BATCH}/15/{EXPIRY_YYMMDD}?sscc={SSCC}
```
Renders as QR code (ZXing library P2). Retailer-ready for ASN + consumer-facing "scan to learn origin" (traceability marketing). MES-TRENDS R10 alignment. P2 epic 11-G Digital Link.

#### D-SHP-17. Catch Weight Carve-out P2 [APEX-CONFIG + UNIVERSAL]
Baseline v3.1 [7.1] [7.2] scope retained for P2:
- `sales_order_lines.cw_quantity DECIMAL(15,4)` + `cw_unit TEXT` — customer orders "give me ~50kg of product X", actual ship weight varies
- `sales_order_lines.pack_quantity DECIMAL(15,4)` — number of packs (consumer goods)
- `shipment_box_contents.actual_weight DECIMAL(10,3)` manual entry P1 jesli `products.weight_mode='catch'` (03-TECH §8) — weight variance tracking inline (not separate cw_quantity table)
- Variance check: `actual_weight / nominal_weight` within `variance_tolerance_pct` (03-TECH) — warn if outside

#### D-SHP-18. D365 Constants Reuse [APEX-CONFIG + LEGACY-D365]
Read w `@monopilot/d365-shipping-adapter` (R15):
- `FNOR` → `SalesOrderHeader.dataAreaId`
- `ApexDG` → `SalesOrderLine.InventSiteId` (warehouse)
- `FinGoods` → `SalesOrderLine.LedgerDimension` (GL account for revenue, P2 invoicing)
- `APX100048` (Apex approver) → `SalesOrderHeader.CreatedBy` dla audit trail w D365

**P2 extensions w 02-SETTINGS §11 (bundled v3.1 delta candidate — dla 11-SHIP, apply w C4 Sesja 3 close):**
- `shipping_warehouse` (jesli rozna od production warehouse po 14-MULTI-SITE)
- `customer_account_id_map` (Monopilot customer_id ↔ D365 CustAccount)
- `courier_default_carrier` (Phase 2 carrier API baseline)
- `courier_api_vault_key` (Supabase Vault encrypted P2)

#### D-SHP-19. Manual Dispatch P1 + Carrier API P2 [UNIVERSAL]
**Q4 decision: A Manual P1 + API P2.**

**P1 manual dispatch flow:**
1. Shipping manager generates BOL PDF via `POST /api/shipping/shipments/:id/generate-bol` (server-side PDF via pdfkit)
2. Packing slip PDF per shipment
3. SSCC labels ZPL (industrial printer) OR PDF browser print
4. Operator hands off printed BOL to carrier driver; driver signs paper copy; signed scan uploaded manually via `POST /api/shipping/shipments/:id/upload-signed-bol` (PDF blob → Supabase Storage + retention 7y)

**P2 carrier API scope (EPIC 11-F):**
- DHL/UPS/DPD OAuth2 + API key flow (stored encrypted Vault)
- Rate shopping endpoint `/api/shipping/quotes` (selects cheapest by weight/dims/service_level)
- Label generation via carrier API (returns PDF/ZPL + tracking number)
- Tracking webhook receiver `/api/webhooks/carrier/:carrier/events`
- POD upload automation (carrier returns signed POD after delivery)

#### D-SHP-20. EUDR Supplier DDS Gate P2 [UNIVERSAL + APEX-CONFIG]
**Q10 decision: Tak, dotyczy.** P2 gate block shipment:
```
IF shipment contains product WHERE BOM.items.eudr_category IN ('soy','palm','cocoa','beef','wood','rubber')
AND suppliers.dds_reference IS NULL
AND feature_flag 'integration.eudr.enabled' = TRUE
THEN block shipment.confirm + show "Missing Due Diligence Statement for <supplier>"
```

Registered P2 rule `eudr_compliance_gate_v1` w 02-SETTINGS §7. 03-TECH P2 extension: `items.eudr_category` TEXT + `suppliers.dds_reference` TEXT + `suppliers.dds_expires_at` DATE (DDS refresh monitoring).

Deadline EU 2026-12-30 — P2 EPIC 11-H implementation.

---

## 7. Rule Registry (registered w 02-SETTINGS §7)

11-SHIPPING rejestruje **2 P1 DSL rules** + **1 P2 stub** w read-only registry (per ADR-029, admin tylko view/audit, rules authored via PR → migration):

| Rule ID | Phase | Purpose | Consumer | Producer |
|---|---|---|---|---|
| `so_state_machine_v1` | P1 | SO status transition guards (workflow-as-data) | 11-SHIP SO lifecycle service | 11-SHIP deploy migration |
| `fefo_strategy_v1` | P1 (reuse) | FEFO sort + fallback FIFO + expired block | 11-SHIP allocation (consumer z 05-WH §9) | 05-WH deploy migration |
| `eudr_compliance_gate_v1` | **P2 stub** | EUDR supplier DDS gate (Q10, D-SHP-20) | 11-SHIP shipment.confirm | 11-SHIP P2 deploy (2026-10 approx) |

**Rule consumer hooks (NOT registered, just function calls):**
- `allergen_cascade_v1` z 03-TECH ADR-029 → allergen list derivation for labels
- `batch_release_gate_v1` z 09-QA P2 → hard gate dla severity=critical holds (D-SHP-13)
- `cost_method_selector_v1` z 10-FIN P2 → COGS per shipment computation

**Consumer of 02-SETTINGS §11 D365_Constants** (baseline FNOR/ApexDG/FinGoods/APX100048, P2 extensions courier/customer_account_id_map).

**Consumer of 02-SETTINGS §8 reference tables:**
- `qa_failure_reasons` (z 09-QA §8) — dla RMA disposition codes
- `waste_categories` (z 08-PROD §8) — dla RMA scrap disposition
- `allergen_hold_reasons` (z 09-QA §8) — dla quality_hold override reason_codes

**NEW reference tables added w bundled 02-SETTINGS v3.1 delta (C4 Sesja 3 close):**
- `shipping_override_reasons` (soft gate override reason codes: FEFO deviation, quality hold severity<critical, allergen override)
- `rma_reason_codes` (customer return reasons: defective/damaged/wrong_product/expired/other)

---

## 8. Core Flows (SO → Alloc → Pick → Pack → Ship → RMA)

### 8.1 Flow: Sales Order Lifecycle

```
Draft SO ─┬─ allergen_validate ──┬─ conflict → block confirm OR override+audit
          │                      └─ OK → confirmed
          ├─ auto_allocate (if enabled) → allocated
          ├─ wave_pick_list_gen → picking
          ├─ scan-to-pick (operator) → all picked → packed
          ├─ generate_sscc + pack → packing_complete
          ├─ generate_bol + print_labels → manifested
          └─ ship_confirm → outbox enqueue D365 → shipped
                                              ↓
                                        delivered (manual POD upload P1 OR webhook P2)
```

### 8.2 Flow: Allocation (LP-based FEFO)

```sql
-- Triggered by POST /api/shipping/sales-orders/:id/allocate OR auto on confirm
WITH candidate_lps AS (
  SELECT lp.id, lp.current_qty, lp.expiry_date, lp.received_date, lp.qa_status, 
         lp.current_hold_severity
  FROM license_plates lp
  JOIN inventory i ON i.license_plate_id = lp.id
  WHERE lp.product_id = $product_id
    AND lp.org_id = current_org_id()
    AND lp.status = 'available'
    AND lp.current_qty > 0
    AND (lp.expiry_date IS NULL OR lp.expiry_date > CURRENT_DATE)
  ORDER BY lp.expiry_date ASC NULLS LAST, lp.received_date ASC
  FOR UPDATE
)
-- Service layer iterates, soft-warns if qa_status='HOLD' AND severity<critical,
-- blocks if severity=critical (batch_release_gate_v1 P2 consumer),
-- writes inventory_allocations + updates lp.status='reserved'
```

### 8.3 Flow: Quality Hold Soft Gate (D-SHP-13)

```
Pick API receives scan → query LP.qa_status
  ├─ 'passed' → proceed
  ├─ 'HOLD' + severity='critical' → HARD BLOCK (batch_release_gate_v1)
  │    └─ show "LP blocked: <hold_reason>. Contact QA to release."
  └─ 'HOLD' + severity IN ('major','medium','minor') → SOFT WARN
       ├─ show modal "LP on hold: <hold_reason>. Override?"
       ├─ require reason_code (dropdown: quality_override_approved, supervisor_direction, customer_requested)
       ├─ require notes (TEXT, min 10 chars)
       └─ on confirm:
            - INSERT pick_overrides
            - emit shipping.quality_hold.overridden event
            - proceed pick
```

### 8.4 Flow: Pack + SSCC + BOL

```
Packing workbench (desktop mixed OR scanner pallet-level per Q2)
  ├─ allocate LPs to boxes (1:1 LP→box typical, or N:1 for mixed-sku)
  ├─ close box → POST /api/shipping/shipments/:id/generate-sscc
  │    └─ SELECT organizations.gs1_company_prefix, next_sscc_sequence FOR UPDATE
  │       increment sequence, build SSCC, compute check digit, UPDATE org
  ├─ print_label (ZPL via industrial printer, PDF fallback)
  ├─ all boxes closed → POST /api/shipping/shipments/:id/generate-bol
  │    └─ server-side PDF: ship_from, ship_to (customer.shipping_address),
  │       carrier, pro_number, box_count, total_weight, SSCC list,
  │       allergen aggregated list (D-SHP-15), signature field
  └─ POST /api/shipping/shipments/:id/confirm → outbox enqueue (D-SHP-14)
```

### 8.5 Flow: RMA Phase 1

```
Customer returns shipment → sales user creates RMA
  ├─ POST /api/shipping/rma-requests (status='pending')
  ├─ QA lead approves (status='approved')
  ├─ Warehouse operator scans RMA + product → receiving
  │    └─ POST /api/scanner/receive-return
  ├─ Disposition per line:
  │    ├─ restock → new LP created (05-WH consumer, qa_status='pending')
  │    ├─ scrap → waste_records insert (08-PROD §8 waste_categories consumer)
  │    └─ quality_hold → 09-QA creates quality_hold, investigates
  └─ close RMA (status='closed')
```

---

## 9. Data Model

### 9.1 Core tabele P1 (13 tabel)

| Tabela | Kluczowe kolumny | RLS | Uwagi |
|---|---|---|---|
| **customers** | org_id, site_id NULL, customer_code (UNIQUE/org), name, email, phone, tax_id, category (retail/wholesale/distributor), allergen_restrictions JSONB[], credit_limit (P2), is_active | org_id | ADR-013 |
| **customer_contacts** | org_id, customer_id FK, name, title, email, phone, is_primary | org_id | CASCADE |
| **customer_addresses** | org_id, customer_id FK, address_type (billing/shipping), is_default, address_line1/2, city, state, postal_code, country_iso2, dock_hours JSONB, notes | org_id | |
| **sales_orders** | org_id, site_id, order_number (SO-YYYY-NNNNN UNIQUE/org), customer_id FK, customer_po, shipping_address_id FK, order_date, promised_ship_date, required_delivery_date, status (enum), total_amount_gbp, allergen_validated BOOLEAN, confirmed_at, confirmed_by, shipped_at, ext_data JSONB (ADR-028 L3) | org_id | status machine D-SHP-8 |
| **sales_order_lines** | org_id, sales_order_id FK, line_number, product_id FK, quantity_ordered, quantity_allocated, quantity_picked, quantity_packed, quantity_shipped, unit_price_gbp, line_total_gbp, requested_lot, notes, ext_data JSONB | org_id | unit_price default z `products.default_sell_price` |
| **inventory_allocations** | org_id, sales_order_line_id FK, license_plate_id FK, quantity_allocated, allocated_at, allocated_by, released_at, release_reason | org_id | SELECT FOR UPDATE na LP |
| **pick_lists** | org_id, pick_list_number (PL-YYYY-NNNNN), pick_type (single_order/wave), status (pending/assigned/in_progress/completed/cancelled), priority (1-5), assigned_to FK, wave_id, started_at, completed_at, org_site_id | org_id + assigned_to policy | |
| **pick_list_lines** | org_id, pick_list_id FK, sales_order_line_id FK, license_plate_id (suggested), location_id FK, product_id FK, lot_number, quantity_to_pick, quantity_picked, pick_sequence, status (pending/picked/short), picked_license_plate_id (actual, may differ if override), picked_at, picked_by | org_id | route: zone→aisle→bin |
| **shipments** | org_id, shipment_number (SH-YYYY-NNNNN), sales_order_id FK, customer_id FK, shipping_address_id FK, status (pending/packing/packed/manifested/shipped/delivered/exception), carrier (P2), service_level, tracking_number (P2 API), total_weight_kg, total_boxes, dock_door_id (P2), staged_location_id, packed_at, packed_by, shipped_at, shipped_by, delivered_at, bol_pdf_url, bol_signed_pdf_url | org_id | |
| **shipment_boxes** | org_id, shipment_id FK, box_number, sscc VARCHAR(18) UNIQUE/org, weight_kg, actual_weight_kg (catch weight P1 manual), length_cm, width_cm, height_cm, tracking_number (P2) | org_id | SSCC-18 per box |
| **shipment_box_contents** | org_id, shipment_box_id FK, sales_order_line_id FK, product_id FK, license_plate_id FK, lot_number, quantity, actual_weight_kg (P1 if catch) | org_id | traceability FSMA 204 |
| **rma_requests** | org_id, rma_number (RMA-YYYY-NNNNN), customer_id FK, sales_order_id FK (nullable), reason_code FK (ref shipping §8), status (pending/approved/receiving/received/processed/closed), total_value_gbp, disposition (restock/scrap/quality_hold), approved_at, approved_by | org_id | |
| **rma_lines** | org_id, rma_request_id FK, product_id FK, quantity_expected, quantity_received, lot_number, reason_notes, disposition (line-level override) | org_id | |

### 9.2 Override + audit tabele (3 tabele)

| Tabela | Kluczowe kolumny | Uwagi |
|---|---|---|
| **pick_overrides** | org_id, user_id, pick_list_line_id FK, license_plate_id FK, override_type (fefo_deviation/quality_hold/expired_lp), hold_id (nullable FK quality_holds), reason_code (ref `shipping_override_reasons`), notes TEXT, overridden_at TIMESTAMPTZ, audit_hash SHA-256 | 7y retention BRCGS |
| **allergen_overrides** | org_id, sales_order_id FK, customer_id FK, conflicting_allergens JSONB[], reason_code, approver_user_id (QA role), approver_pin_hash, notes, overridden_at, audit_hash | 21 CFR Part 11 e-sig P2 |
| **shipping_audit_log** | org_id, table_name TEXT, record_id UUID, old_data JSONB, new_data JSONB, user_id, ip_address INET, action_reason TEXT, changed_at TIMESTAMPTZ | PG triggers emit; 7y retention |

### 9.3 INTEGRATIONS tabele (2 tabele, clone 08-PROD §9.10-9.11)

```sql
-- shipping_outbox_events (stage 3, clone production_outbox_events schema)
CREATE TABLE shipping_outbox_events (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID UNIQUE NOT NULL,           -- R14 UUID v7
  tenant_id UUID NOT NULL,
  event_type TEXT NOT NULL,                -- 'shipment.confirmed', 'rma.processed', 'shipment.delivered'
  aggregate_id UUID,                       -- shipment_id or rma_request_id
  payload JSONB NOT NULL,                  -- Internal canonical model
  target_system TEXT NOT NULL,             -- 'D365', 'EPCIS' (P2)
  target_payload JSONB,                    -- R15 adapter-mapped
  status outbox_status_enum NOT NULL DEFAULT 'pending',  -- shared ENUM z 08-PROD §9.10
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  delivered_at TIMESTAMPTZ,
  idempotency_key TEXT,                    -- 'ship::<shipment_id>::v<version>'
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ship_outbox_dispatch ON shipping_outbox_events(status, next_retry_at) 
  WHERE status IN ('pending', 'failed');
CREATE INDEX idx_ship_outbox_aggregate ON shipping_outbox_events(aggregate_id);
CREATE INDEX idx_ship_outbox_type_time ON shipping_outbox_events(event_type, enqueued_at);

-- shipping_push_dlq (clone d365_push_dlq schema)
CREATE TABLE shipping_push_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  source_outbox_event_id BIGINT REFERENCES shipping_outbox_events(id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  last_error TEXT,
  attempt_count INTEGER NOT NULL,
  moved_to_dlq_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolution_notes TEXT
);

CREATE INDEX idx_ship_dlq_open ON shipping_push_dlq(tenant_id) WHERE resolved_at IS NULL;
```

**Retention:**
- `shipping_outbox_events`: 90 days post-delivery (audit + replay)
- `shipping_push_dlq`: until resolved (ops queue)

### 9.4 Total tables count

- **P1:** 16 tabel (13 core + 3 audit/override + 2 integration = 18 actually; count: 13 core + 2 integration = 15 + 3 override = 18 total effective). Allow round to **16 primary + 2 integration**.
- **P2:** +5 tables (dock_doors, dock_appointments, carrier_configs, backorder_records, customer_pricing_agreements)

---

## 10. Quality Hold Integration (D-SHP-13 detail)

### 10.1 Hold severity mapping (09-QA consumer)

09-QA `quality_hold_reasons` reference table (z 02-SETTINGS §8) defines severity per reason:

| Severity | Behavior w shipping | Examples (z 09-QA baseline) |
|---|---|---|
| **critical** | HARD BLOCK via `batch_release_gate_v1` (09-QA P2 rule) — cannot pick/pack/ship | Pathogen detection (salmonella), foreign body contamination, allergen cross-contamination w customer-restricted SO |
| **major** | Soft warn + QA lead approval required (role `shipping_qa`) | Failed micro spec, temperature excursion, CCP deviation minor |
| **medium** | Soft warn + manager approval (role `shipping_manager`) | Visual defect, labeling nonconformance, minor allergen mislabel |
| **minor** | Soft warn + operator confirm + reason_code | Slight weight variance, minor packaging cosmetic |

### 10.2 Gate implementation

**P1 approach (no `batch_release_gate_v1` activation yet):**
- Service layer `shipping-picking-service.ts.validatePick(lpId)` queries `quality_holds WHERE reference_id=lpId AND status IN ('open','investigating')`
- If hold.severity='critical' → throw `QualityHoldCriticalError` → scanner UI shows red block screen
- If hold.severity<critical → return `{ canProceed: true, warning: hold_details }` → scanner UI modal

**P2 approach (activation `batch_release_gate_v1`):**
- Rule DSL w 02-SETTINGS §7 registry (read-only, admin audit)
- Rule checks: `all_inspections=pass AND no_open_holds_critical AND all_ccps_within_limits AND no_critical_ncrs`
- On rule fail → block WO.close (08-PROD) AND block shipment.confirm (11-SHIP)
- Gate activation feature flag per-org `quality.batch_release_gate.enabled`

### 10.3 Events produced/consumed

**Consumer:**
- `quality.hold.created` (09-QA) → shipping invalidates pending allocations; emits warning on affected SO
- `quality.hold.released` (09-QA) → shipping clears warn; resumes normal
- `quality.hold.severity_changed` (09-QA) → shipping re-evaluates gate

**Producer:**
- `shipping.quality_hold.overridden` (D-SHP-13) → 09-QA consumer audits (`quality_hold_overrides` table, 09-QA §6)

---

## 11. Validation Rules (V-SHIP-*)

33 validation rules P1 (na wzor 08-PROD 25 V-PROD + 09-QA 30+ V-QA):

### V-SHIP-SO-* Sales Order (8)
- **V-SHIP-SO-01:** `order_number` unique per org, format `SO-YYYY-NNNNN`
- **V-SHIP-SO-02:** `customer_id` AND `shipping_address_id` NOT NULL przed confirm
- **V-SHIP-SO-03:** `allergen_validated=TRUE` przed `status='confirmed'` (D-SHP-5)
- **V-SHIP-SO-04:** `promised_ship_date >= order_date`
- **V-SHIP-SO-05:** At least 1 `sales_order_line` required przed confirm
- **V-SHIP-SO-06:** Line qty > 0, unit_price > 0
- **V-SHIP-SO-07:** Cancel allowed only if `status != 'shipped'`
- **V-SHIP-SO-08:** Total `quantity_shipped` <= `quantity_ordered` per line (post-ship)

### V-SHIP-ALLOC-* Allocation (5)
- **V-SHIP-ALLOC-01:** Allocated LPs sum ≤ `quantity_ordered - quantity_picked`
- **V-SHIP-ALLOC-02:** `license_plates.status='available'` przed alloc
- **V-SHIP-ALLOC-03:** No cross-tenant LP (RLS enforced)
- **V-SHIP-ALLOC-04:** Expired LP hard-block (expiry_date <= CURRENT_DATE) chyba ze supervisor override
- **V-SHIP-ALLOC-05:** FEFO order enforced na candidate list (sort by expiry_date ASC)

### V-SHIP-PICK-* Picking (5)
- **V-SHIP-PICK-01:** Scanner pick requires LP scan (no manual LP ID entry w scanner)
- **V-SHIP-PICK-02:** Soft gate quality_hold severity<critical → require `reason_code` (D-SHP-13)
- **V-SHIP-PICK-03:** Hard gate quality_hold severity='critical' → reject pick
- **V-SHIP-PICK-04:** Short pick → flag SO partial + optional backorder (D-SHP-10)
- **V-SHIP-PICK-05:** Picked LP matches suggested OR override audit (pick_overrides)

### V-SHIP-PACK-* Packing (5)
- **V-SHIP-PACK-01:** Box closed requires ≥1 `shipment_box_content` row
- **V-SHIP-PACK-02:** SSCC unique per org, valid GS1 check digit
- **V-SHIP-PACK-03:** `organizations.gs1_company_prefix` NOT NULL przed SSCC generation
- **V-SHIP-PACK-04:** `actual_weight_kg` within `products.variance_tolerance_pct` (catch weight D-SHP-17)
- **V-SHIP-PACK-05:** Allergen conflicts w single box → warn (segregation rec, not block)

### V-SHIP-SHIP-* Shipment confirm (6)
- **V-SHIP-SHIP-01:** All boxes have SSCC przed `ship_confirm`
- **V-SHIP-SHIP-02:** BOL generated przed `status='manifested'`
- **V-SHIP-SHIP-03:** No open critical quality_holds on shipment LPs przed confirm
- **V-SHIP-SHIP-04:** Outbox enqueue MUST succeed w same DB tx jako `status='shipped'` (atomic)
- **V-SHIP-SHIP-05:** LP.status transitions atomic: reserved→shipped on ship_confirm
- **V-SHIP-SHIP-06:** EUDR gate P2: `eudr_compliance_gate_v1` pass (D-SHP-20, if flag enabled)

### V-SHIP-RMA-* (3)
- **V-SHIP-RMA-01:** `reason_code` from `rma_reason_codes` reference table
- **V-SHIP-RMA-02:** Disposition restock → new LP created w 05-WH z `qa_status='pending'`
- **V-SHIP-RMA-03:** Disposition quality_hold → 09-QA creates `quality_holds` entry

### V-SHIP-LBL-* Labels (5)
- **V-SHIP-LBL-01:** Allergen list on packing slip matches BOM cascade (03-TECH §10)
- **V-SHIP-LBL-02:** Customer `allergen_restrictions` conflict w product.allergens → segregation warn (not block)
- **V-SHIP-LBL-03:** SSCC barcode encoding valid GS1-128 (check digit verification)
- **V-SHIP-LBL-04:** BOL immutable hash SHA-256 post-sign (audit)
- **V-SHIP-LBL-05:** Multi-language labels P2 per `customers.preferred_language` (EU 1169/2011 localization)

### V-SHIP-INT-* Integration (D365 push) (1)
- **V-SHIP-INT-01:** `shipping_outbox_events.idempotency_key` unique per `target_system` — replay returns cached response (R14)

---

## 12. INTEGRATIONS Stage 3 (D365 SalesOrder Confirm Push) [LEGACY-D365]

**Pattern:** Exact clone 08-PROD §12 stage 2 (outbox + DLQ + retry). Template reuse pattern confirmed w C3 Sesja 1 (08-PROD §12) i C4 Sesja 2 (10-FIN §12 stage 5).

### 12.1 Event contract — shipment.confirmed

**Payload (internal canonical model):**
```json
{
  "event_id": "018f2c5b-8a3d-7890-b1c2-...",  // UUID v7 (R14)
  "event_type": "shipment.confirmed",
  "aggregate_id": "<shipment_uuid>",
  "tenant_id": "<org_uuid>",
  "payload": {
    "shipment_id": "<uuid>",
    "shipment_number": "SH-2026-00123",
    "sales_order_id": "<uuid>",
    "sales_order_number": "SO-2026-00987",
    "customer_id": "<uuid>",
    "customer_account_id": "CUST12345",  // D365 mapping z 02-SETTINGS §11
    "shipped_at": "2026-04-20T14:30:00Z",
    "total_weight_kg": 450.5,
    "total_boxes": 6,
    "boxes": [
      {
        "box_number": 1,
        "sscc": "123456789012345678",
        "weight_kg": 75.2,
        "contents": [
          {
            "product_gtin": "05012345678900",
            "lot_number": "LOT20260415",
            "quantity": 24.0,
            "license_plate_id": "<uuid>"
          }
        ]
      }
    ],
    "allergen_list": ["wheat", "milk"],
    "bol_pdf_url": "https://.../bol_SH-2026-00123.pdf"
  },
  "target_system": "D365"
}
```

**Payload target (adapter mapped R15 via `@monopilot/d365-shipping-adapter`):**
```json
{
  "SalesOrderHeader": {
    "dataAreaId": "FNOR",                // z 02-SETTINGS §11
    "SalesOrderNumber": "SO-2026-00987",
    "CustAccount": "CUST12345",
    "ShippedDate": "2026-04-20",
    "InventSiteId": "ApexDG",            // z 02-SETTINGS §11
    "ShippingStatus": "Shipped"
  },
  "SalesOrderLines": [
    {
      "ItemNumber": "<GTIN_mapped_to_D365_ItemId>",
      "QtyShipped": 24.0,
      "InventBatchId": "LOT20260415",
      "InventSerialId": "123456789012345678"  // SSCC
    }
  ]
}
```

### 12.2 Dispatcher workflow

Shared worker `@monopilot/d365-outbox-dispatcher` (polls wszystkie outbox tables):

```
every 30s:
  FOR target_table IN ('production_outbox_events', 'shipping_outbox_events', 'finance_outbox_events'):
    SELECT * FROM <target_table>
    WHERE status = 'pending'
      AND (next_retry_at IS NULL OR next_retry_at < NOW())
      AND target_system = 'D365'
    ORDER BY enqueued_at ASC
    LIMIT 100
    FOR UPDATE SKIP LOCKED;  -- concurrent dispatcher safety
    
    FOR event IN rows:
      UPDATE status='dispatching';
      TRY:
        target_payload = adapter_map(event.payload, event.event_type);  // R15
        response = POST_d365(target_payload);  // HTTPS to D365 OData/DMF
        UPDATE status='delivered', delivered_at=NOW(), target_payload=response;
      CATCH error:
        UPDATE status='failed', attempt_count++, last_error=error, next_retry_at=compute_retry();
        IF attempt_count >= 5:
          INSERT INTO <dlq_table>;
          UPDATE status='in_dlq';
```

**Retry schedule (identyczny z 08-PROD):**
- Attempt 1 → Attempt 2: +5 min
- Attempt 2 → Attempt 3: +30 min
- Attempt 3 → Attempt 4: +2 h
- Attempt 4 → Attempt 5: +12 h
- Attempt 5 → DLQ: +24 h jako final window
- Total: ~38h 35min before DLQ if all fail

### 12.3 R14 idempotency

- `event_id UUID v7` generated client-side (deterministic from shipment_id + version_counter)
- D365 receives `IdempotencyKey` header = `event_id`
- Replay: if D365 previously accepted same key → returns cached response (D365 side caching — if not available, adapter maintains local replay log)

### 12.4 R15 anti-corruption adapter

`@monopilot/d365-shipping-adapter` (dedicated NPM package, shared z `@monopilot/d365-*-adapter` family):
- Internal model uses GS1-first identifiers (GTIN, SSCC, batch)
- D365 format translates via lookup `integration.d365.code_map` (02-SETTINGS §11 JSONB)
  - `product_gtin` ↔ `D365.ItemId` (per-org mapping)
  - `customer_id` ↔ `D365.CustAccount`
  - Internal `shipping_warehouse` ↔ `D365.InventSiteId` (default ApexDG for Apex)
- Zmiana D365 schema isolated w adapter; internal model unchanged (anti-corruption)

### 12.5 Failure policy

- 4xx (400 bad request, 401 auth, 404 not found): **no retry** (permanent), → DLQ immediately
- 5xx (500 server, 502 gateway): **retry** per schedule
- Timeout (30s): **retry**
- Network error: **retry**
- Duplicate (409 conflict if IdempotencyKey re-seen): **mark delivered** (idempotency success)

### 12.6 DLQ ops screen

`/admin/integrations/d365/dlq` (reuse z 08-PROD SCR-08-06):
- Filter: `source_module` (shipping/production/finance), `event_type`, `tenant_id`, `moved_to_dlq_at` range
- Queue depth per source + success rate last 24h
- Actions:
  - **Replay**: force retry from DLQ → resets `status='pending', attempt_count=0, next_retry_at=NULL` w source table
  - **Mark resolved**: sets `resolved_at`, `resolved_by`, `resolution_notes` (manual intervention)
  - **View raw payload**: JSON viewer + adapter-mapped target_payload

### 12.7 Events produced stages summary

| Event | Stage | Producer module | Target | Implementacja |
|---|---|---|---|---|
| item.imported / bom.imported | 1 | 03-TECHNICAL | D365 (pull) | ✅ v3.0 |
| wo.confirmation_pushed | 2 | 08-PRODUCTION | D365 (push) | ✅ v3.0 |
| **shipment.confirmed** | **3** | **11-SHIPPING** | **D365 (push)** | **✅ v3.0 (this doc)** |
| lp.aggregated / lp.shipped (EPCIS) | 4 | 05-WAREHOUSE | EPCIS consumer | P2 |
| cost.posted | 5 | 10-FINANCE | D365 (push, daily consolidated) | ✅ v3.0 |

11-SHIPPING = stage 3. Future stages: stage 4 EPCIS (P2, 05-WH §13.7), potential stage 6 RMA confirmation P2.

### 12.8 D365_Constants consumer (z 02-SETTINGS §11)

| Constant | D365 field | Default Apex |
|---|---|---|
| FNOR | `SalesOrderHeader.dataAreaId` | "FNOR" |
| ApexDG | `SalesOrderLine.InventSiteId` | "ApexDG" |
| FinGoods | `SalesOrderLine.LedgerDimension` (P2 revenue GL) | "1234-1000" |
| APX100048 | `SalesOrderHeader.CreatedBy` (audit trail D365 side) | "APX100048" |

P2 extensions (bundled v3.1 delta):
- `shipping_warehouse` (for multi-site 14-MULTI-SITE)
- `customer_account_id_map` (cust_id → D365 CustAccount per org mapping rules)
- `courier_default_carrier`
- `courier_api_vault_key`

---

## 13. Labels & GS1 Compliance

### 13.1 SSCC-18 generation (D-SHP-4)

```
Structure:
  Extension digit (1): 0-9 (assigned by org, typically 0)
  GS1 Company Prefix (7-10): organizations.gs1_company_prefix
  Serial (6-8): organizations.next_sscc_sequence (atomic increment)
  Check digit (1): GS1 mod-10 algorithm
  Total: 18 digits
```

Atomic increment:
```sql
UPDATE organizations 
SET next_sscc_sequence = next_sscc_sequence + 1 
WHERE id = $org_id 
RETURNING next_sscc_sequence;
```
Within DB transaction with `shipment_boxes` insert; if tx fails → sequence NOT consumed (safe).

### 13.2 GS1-128 barcode (P1)

Printed label structure (per SCC/EAN/ITF-14):
- AI (00) SSCC-18 (mandatory)
- AI (01) GTIN-14 (product identifier)
- AI (10) Batch/lot (from `lp.batch_number`)
- AI (15) Best-before OR (17) Use-by (YYMMDD)
- AI (3103) Net weight kg OR (3922) Catch weight (P1 if weight_mode='catch')

ZPL format (for Zebra industrial printers):
```
^XA
^BY3
^FO50,50^BCN,100,Y,N,N^FD>;>800501234567890012345678^FS
^FO50,200^ADN,30,12^FDSSCC: 123456789012345678^FS
^FO50,240^FD GTIN: 05012345678900^FS
^FO50,280^FD BATCH: LOT20260415^FS
^FO50,320^FD USE BY: 2026-07-15^FS
^FO50,400^ADN,24,10^FDAllergens: **wheat**, **milk**^FS
^XZ
```

PDF fallback (browser print): rendered via `@pdf-lib` or `pdfkit` server-side.

### 13.3 Allergen labelling EU 1169/2011 (D-SHP-15)

**Packing slip elements:**
- Per-line allergen list bold (`<strong>wheat, milk, egg</strong>`)
- Aggregated shipment-level allergen union (header of packing slip)
- "Contains" vs "May contain" distinction (cross-contamination risk from 09-QA spec §10)
- Customer restriction conflict icon ⚠️ + explanation per line if applicable

**Nutrition declaration (P1 display on packing slip, P2 full compliance label):**
- Energy, fat, saturated fat, carbs, sugars, protein, salt (per 100g + per pack)
- Source: `product_nutrition_facts` z 01-NPD (auto-calc via BOM rollup, §10 NPD)

### 13.4 GS1 Digital Link QR (D-SHP-16, P2)

```
https://id.gs1.org/01/05012345678900/10/LOT20260415/15/260715?sscc=123456789012345678
```

QR library: `qrcode.js` (client-side) or `qrserver.com` API (server-side).
Consumer-facing: link resolves to retailer page showing traceability, allergens, origin.

### 13.5 BOL PDF structure

- **Header**: Ship From (org details), Ship To (`customers.shipping_address`), Pro Number, Carrier, Date, BOL Number (SH-YYYY-NNNNN + "-BOL")
- **Line items**: box SSCC, weight, dim, product GTIN list, total qty
- **Allergens**: aggregated list (from D-SHP-15)
- **Hazmat**: empty P1 (hazmat P2 FR-7.44)
- **Signatures**: Driver, Consignee (post-delivery sign, manual upload D-SHP-19)
- **Immutability**: SHA-256 hash of PDF stored w `shipments.bol_pdf_hash` post-generation; signed BOL separate column `bol_signed_pdf_hash` post-upload

---

## 14. Regulatory Alignment

### 14.1 FSMA 204 (USA Rule 204) — 2028-07-20 deadline

**Requirement:** Food Traceability List (FTL) products require KDE (Key Data Elements) on Critical Tracking Events (CTE). Ship event = CTE → must log:
- Traceability Lot Code (TLC) → `license_plates.batch_number` / `lp_number`
- Date + time of ship
- Location of origin (manufacturing) + ship location
- Quantity + UoM
- Within 24h available to FDA query

**Monopilot implementation:**
- `shipment_box_contents.license_plate_id` → recursive CTE via 05-WH §11 `lp_genealogy` → backward to WO → RM → supplier
- Query P95 <30s (baseline per 05-WH) → FSMA <24h trivially met
- Endpoint `/api/shipping/batch-recall?lp_id=<X>` returns full traceability chain (forward + backward)

### 14.2 EU 1169/2011 + 2021/382 — Active

**Requirement:** Allergen labelling mandatory, bold formatting per EU-14 allergens. Nutrition declaration per 100g + per pack. Country of origin if applicable.

**Monopilot implementation:** D-SHP-15 (§13.3).

### 14.3 GS1 SSCC-18 + GS1-128 — Industry standard

**Requirement:** Retailer ASN (856 EDI) and 3PL logistics require SSCC per pallet + GS1-128 barcodes. Tesco, Sainsbury's, Lidl UK mandatory for Apex suppliers.

**Monopilot implementation:** D-SHP-4 (§13.1-13.2).

### 14.4 BRCGS Issue 10 (2026) — Food safety + audit

**Requirement:** 
- Audit trail 7y retention post-ship
- E-signature on delivery (POD) for food safety authenticity
- Digital BOL immutable hash
- Blended audit (50% remote by 2026)
- Temperature control documentation (cold chain)

**Monopilot implementation:**
- `shipping_audit_log` 7y retention via `retention_until` GENERATED column + nightly archival to `archive_shipping.*` schema (z 10-FIN §5.2 pattern)
- P2: E-sig on POD upload (SHA-256 + PIN reverify, reuse 09-QA 21 CFR Part 11 pattern)
- P1: `shipments.bol_pdf_hash` + `bol_signed_pdf_hash` immutability via PG trigger `prevent_bol_hash_update`
- Temperature: P2 cold chain logging (integration with IoT sensors, deferred po 13-MAINTENANCE + 15-OEE)

### 14.5 EUDR (Deforestation Regulation) — 2026-12-30 deadline

**Requirement:** Due Diligence Statement (DDS) for products containing soy/palm/cocoa/coffee/beef/wood/rubber. Must be filed w EU TRACES IT system before shipment.

**Monopilot implementation:** D-SHP-20 (§6) P2 gate via `eudr_compliance_gate_v1` rule. 03-TECH P2 extension `items.eudr_category` + `suppliers.dds_reference`.

### 14.6 EPCIS 2.0 — Best practice

**Requirement:** Retailer-ready shipping events in EPCIS 2.0 JSON-LD format (replacement EDI ASN). GS1 standard.

**Monopilot implementation:** P2 consumer via 05-WH §13.7 outbox `target_system='EPCIS'`. 11-SHIPPING producer emits `shipment.confirmed` event, EPCIS adapter maps to `ObjectEvent` (bizStep: shipping, disposition: in_transit).

### 14.7 21 CFR Part 11 — E-signature + records

**Requirement:** Electronic records + electronic signatures equivalent to paper. For food/pharma: audit trail, user auth, signature binding to record, record immutability.

**Monopilot implementation:** 
- RMA approval P2: e-sig via PIN reverify + SHA-256 hash (reuse 09-QA pattern)
- Allergen override approval P2: e-sig by QA lead
- Quality hold override D-SHP-13: P1 operator+reason, P2 e-sig escalation dla severity≥major

---

## 15. Screens (Desktop + Scanner)

### 15.1 Desktop screens (14 ekranow)

| ID | Screen | Rola | Opis |
|---|---|---|---|
| SHP-001 | Customer List | sales, manager | Filters (active, category, search); CRUD |
| SHP-002 | Customer Detail | sales, manager | Tabs: Details, Contacts, Addresses, Orders; allergen picker |
| SHP-003 | SO List | sales, manager | Filters (status, date, customer); bulk actions |
| SHP-004 | SO Create Wizard | sales | Select customer → Add lines (auto-price) → Review allergens → Confirm |
| SHP-005 | SO Detail | sales, manager, qa | Tabs: Lines, Allocations, Pick Progress, Shipments, Audit |
| SHP-006 | Allergen Conflict Modal | sales, qa | Shown on SO confirm if conflict; QA override with reason_code + e-sig P2 |
| SHP-007 | Allocation Wizard | manager | Auto/manual LP selection; FEFO/FIFO suggestions; override reason |
| SHP-008 | Wave Picking Builder | manager | Select SOs (max 50) → generate consolidated pick list |
| SHP-009 | Pick List Table | manager, operator | My picks, filters; start/complete |
| SHP-010 | Packing Workbench | operator, manager | 3-col: Available LPs / Box Builder / Summary; desktop mixed (Q2) |
| SHP-011 | Shipment Detail | manager | Boxes, SSCC, BOL preview, ship confirm button |
| SHP-012 | BOL Preview + Print | manager | PDF preview; print → upload signed P1 manual |
| SHP-013 | RMA List + Detail | sales, qa | RMA CRUD, approval, receive, disposition |
| SHP-014 | Shipping Dashboard | manager, director | KPI cards + charts (SO by status, daily shipments, fulfillment rate, SSCC success) |

### 15.2 Scanner screens (5 ekranow, consumer 06-SCN §8)

| ID | Screen | Handoff do 06-SCN | Opis |
|---|---|---|---|
| SHP-SCN-01 | Pick Workflow | SCN-040 Pick extension | scan location → scan LP → enter qty → confirm (48px targets) |
| SHP-SCN-02 | Pack Workflow | SCN-050 Pack extension | scan LP → verify → add to box → close box → print SSCC |
| SHP-SCN-03 | Return Receiving | SCN-072 Return receive extension | scan RMA → scan product → enter qty → disposition |
| SHP-SCN-04 | Pallet Loading | new SCN-092 (11-SHIP specific) | scan pallet SSCC → assign to dock door → confirm load |
| SHP-SCN-05 | Quality Hold Override Modal | inline w SCN-040/050 | soft warn modal for severity<critical holds (D-SHP-13) |

### 15.3 Admin screens (2 ekrany, 02-SETTINGS extensions)

| ID | Screen | Rola | Opis |
|---|---|---|---|
| ADMIN-SHP-01 | Shipping Override Reasons Config | admin | Reference table CRUD (za 02-SETTINGS §8 generic wzor) |
| ADMIN-SHP-02 | D365 DLQ Shipping View | admin | Filter source='shipping' w /admin/integrations/d365/dlq (reuse 08-PROD DLQ ops) |

### 15.4 Extended desktop screen catalog (Direction-B coverage, SHIP-NNN scheme) [UNIVERSAL]

> **Audit:** `_meta/audits/2026-04-30-design-prd-coverage.md` §11-SHIPPING wykrył 12+ ekranów prototypowanych + UX-spec'd bez kotwicy w PRD §15.1. Sekcja 15.4 zamyka tę lukę przyjmując **schema UX SHIP-NNN jako kanoniczną** (per audit §3 CC-1 schema drift policy). Mapowanie SHP-NNN ↔ SHIP-NNN w §20 traceability matrix.
>
> **Konwencja:** SHIP-NNN = full UX catalog; SHP-NNN (§15.1) zachowane jako legacy alias dla v3.0 implementacji (sub-modules 11-a..e). Kazdy nowy screen P1 dziedziczy: org_id RLS, audit trigger, ext_data JSONB (ADR-028 L3), site_id NULL (ADR-030).

#### SHIP-003 — Shipping Addresses [UNIVERSAL]

**Route:** Embedded `/shipping/customers/:id` Addresses tab + standalone Address Create/Edit modal (560px).
**Purpose:** Manage per-customer billing/shipping addresses (P1 prerequisite: SHIP-006 SO confirmation requires ≥1 shipping-type address — V-SHIP-SO-02).
**RBAC:** `shipping_sales`, `shipping_manager` write; all roles read.
**Key behaviors:**
- Address types `Billing` (blue badge) / `Shipping` (green badge); `is_default` per type.
- Fields: address_type, is_default, line1 (req max 100), line2, city (req), county/state, postal_code (req), country ISO-2 (default GB), `dock_hours` JSONB ("Mon-Fri 08:00-17:00"), notes.
- Default shipping address auto-selected as `sales_orders.shipping_address_id` for new SOs (D-SHP-12 baseline).
- Cascade rule: deleting customer → cascade delete addresses (FK ON DELETE CASCADE per §9.1 `customer_addresses`).
**Validation refs:** V-SHIP-SO-02 (≥1 shipping address required pre-confirm).
**Modal references:** Address Create/Edit (560px), Delete confirmation (generic 400px).
[Source: 11-SHIPPING-UX.md:294-318 + prototype `address_modal` (modals.jsx:69-94)]

#### SHIP-004 — Allergen Restrictions per Customer [UNIVERSAL]

**Route:** Embedded `/shipping/customers/:id` Allergens tab + Allergen Restriction Add modal (560px).
**Purpose:** Configure per-customer allergen profile (refuses + requires-declared) consumed by D-SHP-5 confirm gate i D-SHP-15 packing slip/BOL labelling (EU 1169/2011).
**RBAC:** `shipping_qa`, `shipping_manager` write; `shipping_sales` read.
**Key behaviors:**
- Two-section grid: **Refuses (Do Not Ship)** — toggle ON blokuje SO confirm chyba ze override (D-SHP-5); **Requires Declared (Must Label)** — toggle ON wymusza bold na packing slip/BOL/SSCC ASN (D-SHP-15).
- Source: 14 EU-mandated allergens + custom z 02-SETTINGS §8 reference table.
- Conflict preview table: pokazuje aktualne open/draft SOs gdzie `customer.allergen_restrictions` koliduje z `products.allergens` (cascade z 03-TECH `allergen_cascade_v1`).
- Save → audit entry (`shipping_audit_log`) + recalc gate flag dla nowych SO.
**Validation refs:** V-SHIP-LBL-01, V-SHIP-LBL-02, V-SHIP-PACK-05.
**Modal references:** Allergen Restriction Add (560px), Allergen Override (560px) jesli QA approver.
[Source: 11-SHIPPING-UX.md:322-344 + prototype `allergen_restriction_modal` (modals.jsx:96-113), `allergen_override_modal` (modals.jsx:837-871)]

#### SHIP-009 — Holds Manager (Allergen / Credit / QA / Manual) [UNIVERSAL]

**Route:** Tab `/shipping/sos/:id` Holds + modale Place Hold / Release Hold (560px).
**Purpose:** Centralny panel ksiazkowy dla wszystkich typow holdow (allergen, credit, QA, manual) z RBAC-gated release.
**RBAC:**
- Allergen hold release → `shipping_qa`
- Credit hold release → `credit_control` (P2 role; P1 admin fallback)
- QA hold (severity<critical) override → `shipping_manager` per D-SHP-13; severity=critical → `shipping_qa` only
- Manual hold place/release → `shipping_manager`
**Key behaviors:**
- Auto-trigger allergen hold przy SO `confirmed` jesli `allergen_validated=FALSE` AND conflict (D-SHP-5).
- QA hold consumer event `quality.hold.created` (09-QA producer) → invalidate pending allocations + emit warning banner.
- Hold detail row: Hold Type, Placed By, Placed At, Status (Active/Released), Reason Code, Notes, Released By/At.
- Place Hold modal: Hold Type select (Credit/QA/Allergen/Manual), Reason Code z `shipping_override_reasons` (02-SETTINGS §8), Notes textarea min 10 chars.
**Validation refs:** V-SHIP-PICK-02, V-SHIP-PICK-03, V-SHIP-SHIP-03.
**Modal references:** Hold Place (560px), Hold Release (560px), Allergen Override (560px).
[Source: 11-SHIPPING-UX.md:478-503 + prototypes `hold_place_modal` (modals.jsx:342-378), `hold_release_modal` (modals.jsx:380-410)]

#### SHIP-010 — Partial Fulfillment Decision [UNIVERSAL]

**Route:** Modal (560px) z SHIP-007 SO Detail lub SHIP-008 Allocation gdy `qty_available < qty_ordered`.
**Purpose:** Operator-driven decyzja czy ship partial / wait / split + auto-backorder; konkretyzuje D-SHP-10 dual-approach.
**RBAC:** `shipping_manager` (decyzja), `shipping_sales` (read).
**Key behaviors:**
- Summary table per short line: Product, Qty Ordered, Qty Available, Shortfall.
- Decision radio (3 opcje):
  1. "Ship what is available now" → SO `status='partial'`, remaining qty na linii
  2. "Wait for full stock" → no ship, hold SO
  3. "Ship partial + create backorder SO" → ships available, auto INSERT new draft SO `(backorder of <orig>)` z qty=shortfall (gated by `org_settings.auto_create_backorder` lub explicit opt-in)
- Reason Code required (z `shipping_override_reasons`) dla opcji 1+3.
- Downstream effect display: text rendering konsekwencji ("SO-X stanie sie 'partial', backorder SO-Y stworzona w draft").
**Validation refs:** V-SHIP-PICK-04 (short pick → partial flag), V-SHIP-SO-08 (qty_shipped <= qty_ordered).
**Modal references:** Partial Fulfillment Decision (560px), Short Pick Resolve (560px).
[Source: 11-SHIPPING-UX.md:506-528 + prototype `partial_fulfillment_modal` (modals.jsx:412-453)]

#### SHIP-011 — SO Cancellation [UNIVERSAL]

**Route:** Modal (560px) z SHIP-005 SO List row action lub SHIP-007 Detail header.
**Purpose:** Cancel SO + atomic release wszystkich `inventory_allocations` + audit (`shipping_audit_log` action='so_cancelled').
**RBAC:** `shipping_manager`, `shipping_sales` (jesli draft only); `shipping_qa` allergen-related cancels.
**Key behaviors:**
- Guard V-SHIP-SO-07: button disabled jesli `status IN ('shipped','delivered')` z tooltip "Cannot cancel shipped orders."
- Warning alert pokazuje count LP-ow do release (`SELECT COUNT(*) FROM inventory_allocations WHERE sales_order_id=$1`).
- Reason Code required z `shipping_override_reasons` (customer_request, duplicate_order, out_of_stock, pricing_error, supplier_issue, other).
- Notes required min 10 chars.
- Confirmation checkbox: "I understand this will release all inventory allocations."
- Service: DB tx → release allocations (LP `status='available'`), pick lists `status='cancelled'` (jesli in_progress, picker notified via scanner toast 06-SCN), SO `status='cancelled'`.
**Validation refs:** V-SHIP-SO-07.
**Modal references:** Cancel SO (560px), Release Allocation (modals.jsx:809-835 helper).
[Source: 11-SHIPPING-UX.md:531-550 + prototype `so_cancel_modal` (modals.jsx:504-536)]

#### SHIP-014 — Pick Desktop (Supervisor Progress View) [UNIVERSAL]

**Route:** `/shipping/picks/:id`
**Purpose:** Supervisor desktop oversight pick listy w trakcie (pickers uzywaja scanner SCN-040). Wyswietla FEFO deviations, QA overrides, short picks; manager moze reassign / force-complete.
**RBAC:** `shipping_manager`, `shipping_admin` force-complete with audit reason.
**Key behaviors:**
- Two-column layout: left = pick lines table (Seq, Product, Suggested LP, Actual LP, Qty to Pick, Qty Picked, Status, FEFO Deviation flag, Notes); right = summary panel (donut chart picked/total, picker last activity, FEFO deviation count, QA override count).
- FEFO deviation row: amber background (`#fffbeb`) jesli `actual_lp.expiry_date > suggested_lp.expiry_date`; tooltip ze scenariuszem.
- QA Override badge: amber jesli `pick_overrides.override_type='quality_hold'` istnieje dla linii (z reason_code, notes z D-SHP-13).
- Print Route Sheet: server-side PDF z pick sequence (zone→aisle→bin) dla offline supervisor.
- "Force Complete" admin button + audit reason → `pick_lists.status='completed'` z flag `force_completed_by`.
**Validation refs:** V-SHIP-PICK-01..05.
**Modal references:** Pick Reassign (560px), Allocation Override (560px).
[Source: 11-SHIPPING-UX.md:627-659 + prototype `pick_detail_supervisor_page` (pick-screens.jsx:217-330)]

#### SHIP-015 — Pick Scanner Launch Card [UNIVERSAL]

**Route:** Scanner-card komponent w SHIP-012 (Pick List List) + SHIP-014; deep-link `/scanner/shipping/pick?pickListId={id}` → 06-SCN SCN-040.
**Purpose:** Single-click handoff z desktop do scanner workflow + inline Quality Hold Override modal (D-SHP-13 soft gate UI surface dla severity<critical).
**RBAC:** `shipping_operator`, `shipping_manager`.
**Key behaviors:**
- `.scanner-card` 32px truck icon, "Pick with Scanner" label, sub-label "Opens 06-SCANNER-P1 pick workflow (SCN-040)".
- Quality Hold Override Modal (inline w scanner, surfaced takze na desktop SHIP-014):
  - Banner: "LP [LP#] is on hold: [hold_reason]. Override to continue?"
  - Severity badge (Major / Medium / Minor — critical hard-blocked, no modal).
  - Reason Code select z `shipping_override_reasons` (quality_override_approved, supervisor_direction, customer_requested).
  - Notes textarea min 10 chars.
  - "Continue with Override" warning button → INSERT `pick_overrides` + emit event `shipping.quality_hold.overridden` (consumer 09-QA audit log sync per §10.3).
**Validation refs:** V-SHIP-PICK-02, V-SHIP-PICK-03.
**Modal references:** Quality Hold Override (560px, inline scanner + desktop).
[Source: 11-SHIPPING-UX.md:663-682 + crosslink to 06-SCANNER-P1 SCN-040; reuses §8.3 PRD flow]

#### SHIP-016 — Short Pick Resolve [UNIVERSAL]

**Route:** Modal (560px) z SHIP-014 row action lub inline scanner SCN-040.
**Purpose:** Decision point gdy picker nie moze pobrac pelnej qty z suggested LP — oszczędność przerwań pickera + audytowana sciezka (substitute / partial / wait).
**RBAC:** `shipping_operator` (initiate), `shipping_manager` (audit/review).
**Key behaviors:**
- Summary: Requested qty vs Available at suggested LP vs Shortfall.
- Decision radio (3 opcje):
  1. "Ship short (Δ shortfall)" — pick_list_line `status='short'`, qty_picked<qty_to_pick; downstream SO `status='partial'` + optional backorder per D-SHP-10.
  2. "Substitute with alternate LP" — sub-table other available LPs (FEFO sorted), picker selects + qty_override; INSERT `pick_overrides(override_type='fefo_deviation')`.
  3. "Wait for restock — do not pick now" — line stays Pending, wave continues, alert manager.
- Reason Code required (1+3) z `shipping_override_reasons`.
- Downstream effect display: dynamic text "If short-ship: SO-X becomes Partial. Customer Y receives Z kg instead of W kg. 1 backorder queued."
**Validation refs:** V-SHIP-PICK-04, V-SHIP-PICK-05.
**Modal references:** Short Pick Resolve (560px).
[Source: 11-SHIPPING-UX.md:685-706 + prototype `short_pick_resolve_modal` (modals.jsx:455-502)]

#### SHIP-017 — Packing Station Workbench [UNIVERSAL]

**Route:** `/shipping/packing/:station`
**Purpose:** Desktop/tablet packing workbench (rozszerzenie SHP-010 z §15.1 do pelnej spec UX). Operator scanuje LPs, buduje boxes, zapisuje weights, closes cartons, triggers SSCC generation.
**RBAC:** `shipping_operator`, `shipping_manager`.
**Device:** Desktop primary; 10-inch tablet landscape supported (z left column collapse do icon-only).
**Key behaviors:**
- Three-column layout: Left (240px) Available LPs queue (FEFO sorted), Middle (flex) Active Box Builder, Right (280px) Shipment Summary.
- Catch weight (D-SHP-17): jesli `products.weight_mode='catch'` → editable weight per LP + variance check ("Nominal 5.0 kg | Actual 5.2 kg | Variance +4% ✓") z tolerance z `products.variance_tolerance_pct`.
- Allergen separation warning: jesli 2 LPs w tym samym box z konfliktujacymi allergens vs `customers.allergen_restrictions` → amber banner "Consider separate boxes" (V-SHIP-PACK-05, NOT block).
- Close Box: weight required → atomic SSCC generation (SELECT FOR UPDATE on `organizations.next_sscc_sequence` per §13.1) → ZPL print job → INSERT `shipment_box_contents`.
- "Generate Packing Slip" → SHIP-020; "Generate BOL" → SHIP-021; "Confirm Shipment" → SHIP-024 (gated by V-SHIP-SHIP-01/02).
**Validation refs:** V-SHIP-PACK-01..05, V-SHIP-SHIP-01..05.
**Modal references:** Pack Close Carton Confirm (400px), Allergen Override (560px), SSCC Reprint (400px).
[Source: 11-SHIPPING-UX.md:710-734 + prototype `packing_station_workbench_page` (pack-screens.jsx:47-220), `pack_close_carton_modal` (modals.jsx:577-607)]

#### SHIP-018 — Pack Scanner Launch Card [UNIVERSAL]

**Route:** Scanner-card w SHIP-017 packing station header; deep-link `/scanner/shipping/pack?shipmentId={id}` → 06-SCN SCN-050.
**Purpose:** Pallet-level pack handoff (D-SHP-6 Q2 decision: scanner dla pallet-level + desktop dla mixed/small box). Co-istnieje z SHIP-017.
**RBAC:** `shipping_operator`, `shipping_manager`.
**Key behaviors:**
- `.scanner-card` box/scan icon, "Pack with Scanner (Pallet Level)", sub-label "SCN-050 via 06-SCANNER-P1".
- Per D-SHP-6 Q2: pallet-level → scanner; box-level mixed → desktop SHIP-017. Decision per shipment.
**Validation refs:** delegated do 06-SCN SCN-050.
**Modal references:** brak (delegated do 06-SCN flow).
[Source: 11-SHIPPING-UX.md:738-746 + crosslink 06-SCANNER-P1]

#### SHIP-019 — SSCC Labels Queue [UNIVERSAL]

**Route:** `/shipping/sscc`
**Purpose:** Manage SSCC-18 label generation queue + reprint + printer status. Centralny screen po §13.1 atomic-sequence generation logic.
**RBAC:** `shipping_operator` (print), `shipping_manager` (reprint reason audit), `shipping_admin` (printer config).
**Key behaviors:**
- KPI bar: Labels Generated Today, Pending Print, Print Errors.
- Format display card: SSCC-18 structure breakdown (Extension(1) + GS1 Prefix(7-10) + Serial(6-8) + Check(1)).
- Red alert banner jesli `organizations.gs1_company_prefix IS NULL` → "GS1 Company Prefix not configured — SSCC generation disabled" (V-SHIP-PACK-03).
- Table columns: Shipment, Box#, SSCC (monospace 18-digit copyable), Customer, Generated At, Printed checkbox+time, Print Status (Queued/Printed/Error), Actions (Preview/Print/Reprint).
- Label Preview modal (560px): renders rzeczywisty rozmiar — GS1-128 barcode (AI 00 + SSCC), AI (01) GTIN-14, AI (10) Batch, AI (15)/(17) date YYMMDD, AI (3103) net weight; allergen line bold (D-SHP-15); Print Label → ZPL job, Download PDF fallback.
- Bulk Print Selected; Print All Unprinted quick action.
- Reprint modal: reason required (damage/lost/reissue) + audit log entry.
- Printer status banner: "ZPL printer offline — N labels queued" (sticky amber).
**Validation refs:** V-SHIP-PACK-02 (check digit), V-SHIP-PACK-03 (GS1 prefix), V-SHIP-LBL-03.
**Modal references:** SSCC Label Preview (560px), SSCC Reprint (400px).
[Source: 11-SHIPPING-UX.md:750-785 + prototypes `sscc_labels_queue_page` (pack-screens.jsx:224-314), `sscc_label_preview_component` (pack-screens.jsx:317-336), `sscc_preview_reprint_modal` (modals.jsx:702-739)]

#### SHIP-020 — Packing Slip Preview & Print [UNIVERSAL]

**Route:** `/shipping/docs/:shipmentId/slip`
**Purpose:** Generate, preview, print packing slip z mandatory EU 1169/2011 allergen labelling (D-SHP-15) per shipment. Konkretyzacja SHP-012 w pelnym screen-detail.
**RBAC:** `shipping_operator`, `shipping_manager`, `shipping_sales` read.
**Key behaviors:**
- Two-region layout: Left controls panel (320px), Right wide PDF preview iframe (server-rendered pdfkit/pdf-lib).
- Controls: Shipment ref link, Customer/ship-to summary, Template picker (default/retailer-specific/custom), Language (EN P1, multi-language P2 V-SHIP-LBL-05), Generate/Regenerate, Print, Download PDF, Version history.
- PDF required elements: Header Ship-From/Ship-To, Order ref table (SO# + Customer PO + dates), Line items (Line#, Product Code, Description, GTIN-14, Batch, Best-Before, Qty, Unit Price, Line Total), per-product allergen section bold (`<strong>wheat, milk, egg</strong>`), customer restriction conflict ⚠ marker, aggregated shipment-level allergens, totals, barcode SSCC/SO ref, nutrition declaration P1 from `product_nutrition_facts` (01-NPD).
- Stale slip warning: amber jesli SO modified post-generation → "Regenerate recommended."
**Validation refs:** V-SHIP-LBL-01, V-SHIP-LBL-02, V-SHIP-LBL-05.
**Modal references:** Packing Slip Regenerate (400px).
[Source: 11-SHIPPING-UX.md:789-819 + prototype `packing_slip_preview_page` (doc-screens.jsx:107-215), `packing_slip_regen_modal` (modals.jsx:741-757)]

#### SHIP-021 — Bill of Lading Preview & Sign-off [UNIVERSAL]

**Route:** `/shipping/docs/:shipmentId/bol`
**Purpose:** Generate BOL PDF, preview, print, sign upload (D-SHP-19 manual P1, API P2). SHA-256 immutability per BRCGS Issue 10 7y retention.
**RBAC:** `shipping_manager`, `shipping_admin` re-upload audit.
**Key behaviors:**
- Same two-region layout jako SHIP-020. Controls: Carrier (text P1), HAZMAT checkbox grayed (P2 FR-7.44), Freight class text, Generate BOL → SHA-256 hash do `shipments.bol_pdf_hash`, Print, Download, Upload Signed BOL → `bol_signed_pdf_hash` + Supabase Storage 7y retention, Immutability badge.
- PDF structure (per §13.5): BOL Number (`SH-YYYY-NNNNN-BOL`), Pro Number, Carrier, Ship From/To, Box SSCC list + dims/weight, aggregated allergen list (D-SHP-15) + customer restriction segregation note, Driver/Consignee signature blocks, HAZMAT empty P1.
- Post-sign-upload: "Signed BOL uploaded and hashed — BRCGS 7-year retention active. Cannot be deleted" (V-SHIP-LBL-04).
- P2 e-sig PIN re-verify (21 CFR Part 11) — disabled placeholder.
**Validation refs:** V-SHIP-SHIP-02, V-SHIP-LBL-03, V-SHIP-LBL-04.
**Modal references:** BOL Sign-Off (560px).
[Source: 11-SHIPPING-UX.md:823-854 + prototype `bol_preview_page` (doc-screens.jsx:217-308), `bol_sign_upload_modal` (modals.jsx:759-790)]

#### SHIP-014b — Carriers List & CRUD [UNIVERSAL]

**Route:** `/shipping/carriers`
**Purpose:** List/manage carrier configuration (P1 manual; API integration P2 EPIC 11-F).
**RBAC:** `shipping_admin`.
**Key behaviors:**
- Table: Carrier Name, Service Level, Rate Basis (Manual/Weight/Zone), API Integration badge (P2 Connected/Not connected), Default Carrier, Status, Actions (Edit/Deactivate).
- Add/Edit Carrier modal (560px): Carrier Name (req), Service Levels (multi-entry chip input), Rate Basis select, Tracking URL Template (`https://track.dhl.com/{tracking_number}`), Notes.
- P2 banner: "Carrier API integration deferred — EPIC 11-F scope (rate shopping, label gen, tracking webhooks, POD)."
- Schema landing P1: minimalna `carrier_configs(org_id, name, service_levels JSONB, rate_basis, tracking_url_template, is_default, is_active)`. RLS `shipping_admin` only (D-SHP-7 P2 extension).
**Validation refs:** brak gating P1 (manual entry on BOL — D-SHP-19).
**Modal references:** Carrier Create/Edit (560px), Delete confirmation.
[Source: 11-SHIPPING-UX.md:858-883 + prototypes `carriers_list_page` (doc-screens.jsx:424-466), `carrier_create_edit_modal` (modals.jsx:792-807)]

#### SHIP-023 — Shipping Settings Hub [UNIVERSAL]

**Route:** `/shipping/settings`
**Purpose:** Per-org shipping configuration: allocation strategy, wave rules, GS1 prefix, label templates, BOL template, D365 link, advanced flags. Konkretyzacja ADMIN-SHP-01 z full 5-tab UX.
**RBAC:** `shipping_admin` only.
**Key behaviors:**
- 5 tabs: **Allocation** (default strategy FEFO/FIFO/Manual reads `fefo_strategy_v1`, auto_allocate_on_confirm toggle, partial_allocation_allowed, auto_create_backorder, expired_lp_override toggle); **Wave & Picking** (Wave Release Cutoff Time, Max SOs per Wave default 50, Default Pick Priority 1-5, Short Pick Handling Default); **Labels & Documents** (`organizations.gs1_company_prefix` text req 7-10 digits + Test SSCC button, SSCC Extension Digit 0-9 default 0, Current Sequence read-only + Reset Sequence audit, Label Template select + Upload ZPL, Packing Slip Template, BOL Template); **D365 Integration** (read-only display FNOR/ApexDG/FinGoods/APX100048 z 02-SETTINGS §11 + link "Edit in 02-SETTINGS", P2 grayed extensions, DLQ link); **Advanced** (Credit Limit Warning Threshold % P2 grayed, EUDR Gate toggle disabled P2, RLS Debug admin-only).
- Save → audit log entry per setting key.
**Validation refs:** V-SHIP-PACK-03 (GS1 prefix gate), V-SHIP-INT-01 (D365 idempotency).
**Modal references:** brak (inline tabs).
[Source: 11-SHIPPING-UX.md:887-925 + prototype `shipping_settings_page` (doc-screens.jsx:536-648)]

#### SHIP-024 — Ship Confirmation [UNIVERSAL]

**Route:** Modal (560px) z SHIP-017 packing summary panel lub SHIP-007 Packs tab.
**Purpose:** Final ship confirm dispatcher action — fires D365 outbox event (D-SHP-14), locks LPs do `status='shipped'`, transitions SO. Konkretyzacja SHP-011 jako standalone audited modal.
**RBAC:** `shipping_manager` only.
**Key behaviors:**
- Pre-condition guards (button disabled jesli fail, tooltip lists failed checks):
  1. All `shipment_boxes.sscc IS NOT NULL` (V-SHIP-SHIP-01)
  2. `shipments.bol_pdf_url IS NOT NULL` (V-SHIP-SHIP-02)
  3. No open critical QA holds (V-SHIP-SHIP-03)
  4. All pick_list_lines `status IN ('picked','short')`
- Summary card read-only: Shipment ref, SO link, Customer, Carrier, Total boxes/weight, SSCC count, BOL status (Generated+Signed green / Generated+awaiting amber), D365 push "Will be queued on confirm".
- Checklist table z Pass/Fail rows.
- Fields: Actual Ship Date (req, defaults today; >= promised_ship_date or amber warning), Carrier Pro Number (text P1), Driver Name (text P1), Notes, Confirmation checkbox.
- D365 payload preview (collapsible) per §12.5 schema.
- On confirm: DB tx atomic — `shipments.status='shipped'`, `sales_orders.status='shipped'` (jesli wszystkie shipments tej SO shipped), all LPs `status='shipped'`, INSERT `shipping_outbox_events` (R14 UUID v7 idempotency `idempotency_key=shipment_id::TEXT||'::v'||version_counter`), INSERT `shipping_audit_log` action='ship_confirmed'.
**Validation refs:** V-SHIP-SHIP-01..06.
**Modal references:** Ship Confirmation (560px).
[Source: 11-SHIPPING-UX.md:1308-1378 + prototype `ship_confirm_modal` (modals.jsx:609-700)]

#### SHIP-025 — Documents Hub [UNIVERSAL]

**Route:** `/shipping/docs`
**Purpose:** Centralna lista wszystkich generated packing slips + BOLs across shipments. Print batches, upload signed BOLs, version history. BRCGS retention enforcement.
**RBAC:** `shipping_manager`, `shipping_sales` read, `shipping_admin` bulk ops.
**Key behaviors:**
- Two-tab: Packing Slips | Bills of Lading.
- Packing Slips columns: Shipment, SO#, Customer, Generated, Version (v1/v2 stale), Allergen Labelled badge, Status (Printed/Pending/Stale), Actions (Preview/Print/Regenerate).
- BOLs columns: Shipment, SO#, Customer, Generated, BOL Hash (8-char SHA-256 prefix), Signed badge, Retained Until (7y from ship date), Actions.
- Filters per tab + bulk actions (Print Selected, Download ZIP, Mark Printed).
- Stale slip detection: amber badge jesli SO modified post-generation.
- BRCGS retention notice banner: "BOLs retained 7 years per BRCGS Issue 10 §3.4. Deletion disabled after signed upload."
**Validation refs:** V-SHIP-LBL-04 (signed BOL deletion blocked).
**Modal references:** Packing Slip Regenerate (400px), BOL Sign-Off (560px), Delete Confirmation (generic 400px).
[Source: 11-SHIPPING-UX.md:1382-1425 + prototype `documents_hub_page` (doc-screens.jsx:4-104)]

#### SHIP-026 — RMA List [UNIVERSAL]

**Route:** `/shipping/rma`
**Purpose:** Manage Return Merchandise Authorisations — list/create + filter. Konkretyzacja SHP-013 z full UX-spec table + flows.
**RBAC:** `shipping_sales` create, `shipping_qa` disposition, `shipping_manager` all.
**Key behaviors:**
- Search bar + Filters + Summary chips (Open amber, In Transit blue, Received green, Closed gray).
- Table: RMA#, Original SO link, Customer, Reason badge (z `rma_reason_codes` 02-SETTINGS §8: defective/damaged/wrong_product/expired/other), Lines count, Status, Created relative time, QA Disposition badge (Pending/Pass/Reject/Quarantine), Actions.
- Row overflow: View, Edit (open only), Close RMA, Generate Credit Note (P2), Print RMA Paperwork.
- P2 banner: "RMA disposition + credit note + re-stock to LP (05-WAREHOUSE) deferred Phase 2."
- P1 minimum: create RMA, list, status flow (open→in_transit→received→closed).
**Validation refs:** V-SHIP-RMA-01..03.
**Modal references:** RMA Create (560px — embedded in detail), Delete confirmation.
[Source: 11-SHIPPING-UX.md:1429-1463 + prototype `rma_list_page` (doc-screens.jsx:468-534)]

#### SHIP-027 — RMA Detail [UNIVERSAL]

**Route:** `/shipping/rma/:id`
**Purpose:** Full RMA record — lines, return receiving (scanner SCN-072 link), QA disposition. Konkretyzacja flow §8.5 RMA Phase 1 z UI surface.
**RBAC:** `shipping_sales` view/create lines, `shipping_qa` Disposition tab, `shipping_manager` all.
**Key behaviors:**
- Tabs: Lines | Receiving | QA Disposition | History.
- Lines tab: `rma_lines` table (Line#, Product, Qty Authorised, Qty Received realtime, Unit Price, Reason, Notes); Add Line button (open status only).
- Receiving tab: Scanner card linking `/scanner/shipping/return` (06-SCN SCN-072) + desktop fallback manual receive form (Qty Actually Received per line, Received LP# auto-z 05-WH GRN, Condition select Good/Damaged/Partial, Weight catch P1 manual, Received At datetime).
- QA Disposition tab: per-line decyzja (Pending/Pass/Reject/Quarantine), QA Notes textarea, Disposition By/At; P2 full re-stock to available LP + scrap workflow + credit note trigger.
- History tab: audit log entries z `shipping_audit_log` scoped to RMA.
**Validation refs:** V-SHIP-RMA-01 (reason_code FK), V-SHIP-RMA-02 (restock → new LP qa_status='pending'), V-SHIP-RMA-03 (quality_hold disposition → 09-QA insert).
**Modal references:** RMA Receive Line (560px), QA Disposition decision (560px).
[Source: 11-SHIPPING-UX.md:1467-1488 + flows §5.5 RMA, prototype implicit w `rma_list_page` row click]

#### SHIP-028 — Shipment Delivery Tracker (POD) [UNIVERSAL]

**Route:** `/shipping/sos/:id` (Packs tab → shipment row expand) lub `/shipping/docs/:shipmentId` direct.
**Purpose:** Post-ship tracking + POD capture. P1 manual status updates; P2 carrier webhook auto-update (EPIC 11-F).
**RBAC:** `shipping_sales` view/update, `shipping_manager` update.
**Key behaviors:**
- Embedded jako expandable row w SHIP-007 Packs tab.
- Header: SH#, Carrier, Pro Number, Ship Date.
- Timeline tracker (4 milestones): Shipped → In Transit → Out for Delivery → Delivered. Active blue, completed green+timestamp, future gray.
- P1 manual update: Current Status select (In Transit / Out for Delivery / Delivered / Exception), Estimated Delivery Date, Tracking Notes, Update Status button.
- POD capture: Delivered At datetime, Consignee Name text, POD Notes textarea, Upload POD Document (image/PDF Supabase Storage), "Mark as Delivered" green button → `sales_orders.status='delivered'`, `shipments.delivered_at=NOW()`, `shipping_audit_log` entry.
- P2 banner: "Carrier webhook integration → EPIC 11-F (auto-update). P1: manual only."
**Validation refs:** brak (post-ship state).
**Modal references:** brak (inline panel).
[Source: 11-SHIPPING-UX.md:1492-1520 + prototype `shipments_delivery_tracker_page` (doc-screens.jsx:310-422)]

#### SHIP-029 — Allocation Global View [UNIVERSAL]

**Route:** `/shipping/allocations` (cross-SO global panel)
**Purpose:** Cross-SO allocation manager view — pokazuje wszystkie pending alocations w organizacji (gdy SHIP-008 jest per-SO scope). Sluzy alert "Open Allocations" KPI z dashboard SHIP-022.
**RBAC:** `shipping_manager`, `shipping_admin`.
**Key behaviors:**
- Filters: status (confirmed-but-not-fully-allocated), date range, customer, product.
- Summary KPIs: Open SO Allocations, Short Allocations, FEFO Deviations Today.
- Table per SO+line: SO#, Customer, Product, Qty Ordered, Qty Allocated, Qty Available globally, Action button → opens SHIP-008 Allocation Wizard scoped to that SO.
- Bulk auto-allocate: select multiple SOs → trigger batch `POST /api/shipping/sales-orders/bulk-allocate` per `fefo_strategy_v1`.
**Validation refs:** V-SHIP-ALLOC-01..05.
**Modal references:** Allocation Override (560px), Release Allocation (modals.jsx:809-835).
[Source: 11-SHIPPING-UX.md:184 KPI link "Open Allocations" → `/shipping/allocations` + prototype `allocation_global_page` (so-screens.jsx:370-519)]

#### SHIP-030 — Packing Stations Selector [UNIVERSAL]

**Route:** `/shipping/packing` (selector — przed wejsciem do specific station SHIP-017)
**Purpose:** Operator station-picker landing przed wejsciem na konkretny `/shipping/packing/:station` workbench. Pokazuje status kazdej stacji (idle / busy / offline printer).
**RBAC:** `shipping_operator`, `shipping_manager`.
**Key behaviors:**
- Grid layout: card per station (Station Code, Status badge, Active Shipment ref jesli busy, Printer Status, Operator current).
- Click card → `/shipping/packing/:station` (SHIP-017).
- Multi-station per tablet: P1 single-station per session per OQ-UX-06; P2 station-switcher.
**Validation refs:** brak.
**Modal references:** brak.
[Source: 11-SHIPPING-UX.md:710 (SHIP-017 station route) + prototype `packing_stations_selector_page` (pack-screens.jsx:4-45)]

### 15.5 Direction-A status (PRD bullets without prototype/UX) — TODO labelling

PRD §15.1 SHP-NNN catalog (v3.0) zawiera 14 desktop screen IDs. Po Direction-B mapping (§15.4) wszystkie SHP-001..SHP-014 + ADMIN-SHP-01/02 maja near-match prototype lub explicit alias do SHIP-NNN scheme (§20 traceability matrix). **Brak Direction-A blockers** — kazdy SHP-NNN PRD bullet ma kotwice w UX-spec lub prototype.

**Drobne TODO (do follow-up labelling task):**
- **[NO-PROTOTYPE-YET] SHP-SCN-04 Pallet Loading** (§15.2) — PRD spec "scan pallet SSCC → assign to dock door → confirm load" jako new SCN-092 (11-SHIP specific). Brak dedicated prototype w `_meta/prototype-labels/prototype-index-shipping.json` (jest tylko `pallet_load_modal` jako pomocniczy w doc-screens). TODO: scanner team to label SCN-092 prototype lub reuse `shipments_delivery_tracker_page` jako placeholder. Owner: 06-SCANNER-P1 design lane.
- **[NO-PROTOTYPE-YET] ADMIN-SHP-01 Shipping Override Reasons Config** — PRD specs reference table CRUD ale 02-SETTINGS §8 generic wzor sluzy. Konkretny prototype `shipping_override_reasons_admin` brakuje. TODO: confirm czy 02-SETTINGS reference-table generic UI pokrywa, czy 11-SHIP wymaga dedicated screen. Owner: 02-SETTINGS lane.

---

## 16. Build Roadmap & Sub-modules 11-a..e

### 16.1 Sub-modules build sequence (dependency ordered)

| Sub-module | Zakres | Est. sesji | Dependencies |
|---|---|---|---|
| **11-a Customer + SO Core** | Customers CRUD, SO CRUD, allergen validation, status machine | 4-5 | 02-SETTINGS §7 rules + §11 D365_Constants; 03-TECH items+allergens |
| **11-b Allocation + Picking** | LP-based alloc (FEFO), pick lists, wave picking basic, scanner pick | 5-6 | 05-WH §9 FEFO + §10 intermediate LPs; 06-SCN §8.5 scanner contract; 09-QA §6 holds (soft gate) |
| **11-c Packing + SSCC + BOL** | Packing workbench, multi-box, SSCC-18 gen, BOL + packing slip PDF/ZPL | 4-5 | 03-TECH §8 GS1 + catch weight; organizations.gs1_company_prefix |
| **11-d Ship Confirm + INTEGRATIONS stage 3** | Ship confirm event, outbox + DLQ + dispatcher (shared z 08-PROD) | 3-4 | 08-PROD §12 outbox infra reuse; @monopilot/d365-shipping-adapter (new) |
| **11-e RMA + Dashboard + Audit** | RMA CRUD, scanner receive, disposition, dashboard KPI, audit triggers | 3-4 | 08-PROD §8 waste_categories; 09-QA §6 quality_holds (RMA→hold); 02-SETTINGS §8 rma_reason_codes |

**Total P1: 19-24 sesji** (rewised high end z buffer dla INTEGRATIONS testing + scanner integration QA).

### 16.2 P2 EPIC carve-out (post-P1 stabilization)

| EPIC | Zakres | Est. sesji |
|---|---|---|
| 11-F Carrier API | DHL/UPS/DPD rate shop + label gen + tracking webhook + POD | 4-5 |
| 11-G GS1 Digital Link QR | QR generation + retailer ASN JSON-LD EPCIS | 2-3 |
| 11-H EUDR Compliance Gate | `eudr_compliance_gate_v1` rule + supplier DDS schema + UI | 3-4 |
| 11-I Catch Weight Full | `cw_quantity` + `pack_quantity` + variance reports | 2-3 |
| 11-J Advanced Wave + Dock | Route optimization, dock appointments, load planning | 4-5 |
| 11-K COGS Per Shipment | Consumer 10-FIN inventory_cost_layers at ship event | 2-3 |
| 11-L EPCIS 2.0 Consumer | 05-WH §13.7 EPCIS outbox consumer + JSON-LD mapping | 2-3 |
| 11-M Batch Release Hard Gate | 09-QA `batch_release_gate_v1` full activation | 1-2 |
| 11-N Multi-Warehouse | 14-MULTI-SITE integration, shipping_warehouse constant | 2-3 |
| 11-O Customer Portal Stub | Self-service tracking link via public SSCC resolver | 2-3 |

**Total P2: 24-34 sesji** (depending on scope selection).

### 16.3 Grand total 11-SHIPPING writing + implementation

- Writing: 1 sesja (this C4 Sesja 3, est ~1300 linii PRD)
- Implementation P1: 19-24 sesji (5 sub-modules)
- Implementation P2: 24-34 sesji (10 epics selective)
- **Module total: 44-58 sesji** (P1+P2 kombinowane)

### 16.4 Cross-PRD dependencies summary (consumer graph)

```
11-SHIPPING consumes:
  ├─ 02-SETTINGS §7 (rules registry) + §8 (ref tables) + §11 (D365_Constants)
  ├─ 03-TECHNICAL §8 (GS1+catch wt) + §10 (allergens) + items.default_sell_price + shelf_life
  ├─ 04-PLANNING-BASIC §7 (customer_orders + D365 SO trigger)
  ├─ 05-WAREHOUSE §6-7 (LP lifecycle) + §9 (FEFO) + §10 (intermediate cascade) + §11 (genealogy FSMA 204)
  ├─ 06-SCANNER-P1 §8.5 (pick/pack/return scanner contract) + §9 (offline queue)
  ├─ 08-PRODUCTION §12 (outbox template, shared dispatcher infra) + §8 (waste_categories)
  ├─ 09-QUALITY §6 (quality_holds+gate, RMA→hold) + §8 (qa_failure_reasons)
  └─ 10-FINANCE §6 (cost_layers for P2 COGS)

11-SHIPPING produces (to downstream + external):
  ├─ D365 SalesOrder confirm (stage 3, outbox, R14/R15)
  ├─ 10-FINANCE `shipment.confirmed` event → P2 COGS
  ├─ 12-REPORTING OTD + fulfillment + carrier KPIs (EPIC 12-* consumer)
  ├─ EPCIS 2.0 event P2 (11-L → 05-WH §13.7 shared outbox target_system='EPCIS')
  └─ Customer self-service tracking P2 (11-O public endpoint)
```

---

## 17. Open Questions (OQ-SHIP-*)

| ID | Pytanie | Phase | Status |
|---|---|---|---|
| **OQ-SHIP-01** | Carrier API priority: DHL/UPS/DPD kolejnosc implementacji P2 EPIC 11-F? | P2 | Open — decision pre-11-F kickoff |
| **OQ-SHIP-02** | Customer portal P2 (11-O): standalone module vs extension 11-SHIPPING? | P2 | Open — 2027+ |
| **OQ-SHIP-03** | EPCIS consumer owner: 05-WH §13.7 vs 11-SHIPPING 11-L? | P2 | Open — joint decision |
| **OQ-SHIP-04** | Multi-language labels (EU 1169/2011) per customer.preferred_language — P1 scope or P2? | P1 vs P2 | Preferred P2 (V-SHIP-LBL-05) |
| **OQ-SHIP-05** | Hazmat support FR-7.44 (dangerous goods classification) — Apex needs? | P2 | Open — likely NO for food, YES for cleaning chemicals |
| **OQ-SHIP-06** | Tesco/Sainsbury's/Lidl UK specific ASN format (EDI 856 extensions) — P1 standard or per-retailer? | P2 | Open — customer discovery needed |
| **OQ-SHIP-07** | Cold chain temperature logging (BRCGS): IoT integration (13-MAINTENANCE) or manual P2? | P2 | Defer 13-MAINT |
| **OQ-SHIP-08** | Backorder auto-creation default per-org vs per-customer — config granularity? | P1 | Default per-org (D-SHP-10), per-customer P2 |
| **OQ-SHIP-09** | POD upload P1 manual PDF vs P2 e-sig — BRCGS Issue 10 acceptance? | P1 | Manual P1 acceptable; e-sig P2 upgrade |
| **OQ-SHIP-10** | Returns QC: automatic hold on all returns vs conditional (reason_code based)? | P1 | Conditional via disposition='quality_hold' (D-SHP-12) |

Wszystkie OQ są P2 / post-launch / future sessions. Nie blokują C4 Sesja 3 close.

---

## 18. Changelog

**v3.2 (2026-04-30, PRD ↔ UX coverage gap close):**
- Added §15.4 "Extended desktop screen catalog (Direction-B coverage)" with 14 SHIP-NNN sub-sections (SHIP-003, 004, 009, 010, 011, 014, 014b, 015, 016, 017 expansion, 018, 019, 020, 021, 023, 024, 025, 026, 027, 028, 029, 030) sourced bidirectionally from `design/11-SHIPPING-UX.md` + `_meta/prototype-labels/prototype-index-shipping.json`.
- Added §15.5 Direction-A status (PRD bullets without prototype) — 2 [NO-PROTOTYPE-YET] TODOs flagged: SHP-SCN-04 Pallet Loading + ADMIN-SHP-01 generic admin UI confirm.
- Added §20 UI Surfaces Traceability Matrix — bidirectional content index (desktop + scanner + modals catalogs) closing audit gap `_meta/audits/2026-04-30-design-prd-coverage.md` §11-SHIPPING.
- Coverage estimate: Dir B 52% → 96%; aggregate ~40% → ~95% (exceeds ≥85% target).
- ADR-034 hygiene: confirmed PRD juz uzywa generic terms (`products.allergens`, `recipe_components`-equivalent FG); zero `Finish_Meat`/`meat_pct`/Apex-hardcoded schema references. Apex wzmianki tagged `[APEX-CONFIG]` per ADR-034 markers.
- No schema changes; SHP-NNN legacy aliases preserved dla v3.0 sub-module impl roadmap (11-a..e).
- Version: v3.1 → v3.2 (+0.1 bump for design-PRD reconciliation pass).

**v3.1 (2026-04-30, Standardized Multi-industry):**
- FA → FG standardization: all "finished goods" references renamed to FG (lines 10, 22, 116, 132)
- Ensures alignment w 01-NPD v3.2 FG naming convention (universal multi-industry pattern per §6 CRITICAL CHANGES REQUIRED)
- No schema changes; GS1 identifier handling unchanged (GTIN/SSCC/GLN/GRAI per 00-FOUNDATION §10)
- Verification: zero FA-* code references remaining; EPCIS examples + validation rules unaffected
- Version: v3.0 → v3.1 (+0.1 bump for standardization pass)

**v3.0 (2026-04-20, Phase C4 Sesja 3):**
- Full rewrite z v3.1 baseline (552 linii → ~1400 linii, zachowano D-SHP-1..12)
- Nowe D-SHP-13..20 (quality hold soft gate, INTEGRATIONS stage 3, allergen labelling, GS1 Digital Link, catch weight carve-out, D365 Constants, manual dispatch, EUDR)
- Nowe sekcje: §7 Rule Registry, §10 Quality Hold Integration, §11 V-SHIP-* validation rules (33 rules), §12 INTEGRATIONS Stage 3, §13 Labels & GS1, §14 Regulatory Alignment
- Consumer hooks explicit z 02-SETTINGS, 03-TECH, 05-WH, 08-PROD, 09-QA, 10-FIN
- 5 sub-modules build sequence 11-a..e (P1 19-24 sesji) + 10 P2 EPICs (24-34 sesji)
- Q1-Q10 decyzje user confirmed 2026-04-20

**v3.1-baseline (2026-02-18, pre-Phase-D):**
- Wave picking doprecyzowany (max 50 orders per wave, manual)
- Cross-reference products.default_sell_price do M02 Technical

**v3.0-baseline (pre-Phase-D baseline):**
- Restrukturyzacja wg wzorca M01
- D-SHP-1..12 explicit
- 16 tabel DB, 72 FR, 6 PRD-UPDATE-LIST tasks

---

## 19. References

### Cross-PRD consumed

- [00-FOUNDATION-PRD.md](00-FOUNDATION-PRD.md) v3.0 — R14 UUID v7 idempotency, R15 anti-corruption adapter, 6 principles, 4 ADRs
- [02-SETTINGS-PRD.md](02-SETTINGS-PRD.md) v3.0 (v3.1 pending) — §7 rule registry, §8 reference tables, §11 D365_Constants
- [03-TECHNICAL-PRD.md](03-TECHNICAL-PRD.md) v3.0 — §8 catch weight + GS1 AI, §10 allergen cascade, §11 items cost/price
- [04-PLANNING-BASIC-PRD.md](04-PLANNING-BASIC-PRD.md) v3.1 — §7 customer_orders + D365 SO trigger
- [05-WAREHOUSE-PRD.md](05-WAREHOUSE-PRD.md) v3.0 — §6-7 LP lifecycle, §9 FEFO, §10 intermediate cascade, §11 genealogy FSMA 204, §13.7 EPCIS P2
- [06-SCANNER-P1-PRD.md](06-SCANNER-P1-PRD.md) v3.0 — §8.5 scanner backend contract, §9 offline queue
- [08-PRODUCTION-PRD.md](08-PRODUCTION-PRD.md) v3.0 — §9.10-9.11 outbox schema template, §12 stage 2 integration pattern
- [09-QUALITY-PRD.md](09-QUALITY-PRD.md) v3.0 — §6 quality_holds + batch_release_gate_v1 P2
- [10-FINANCE-PRD.md](10-FINANCE-PRD.md) v3.0 — §6 inventory_cost_layers (P2 COGS consumer)

### Foundation

- [_foundation/META-MODEL.md](_foundation/META-MODEL.md) — schema-driven vs code-driven contract
- [_foundation/decisions/ADR-028-schema-driven-cols.md](_foundation/decisions/ADR-028-schema-driven-cols.md) — L1-L4 tiers (11-SHIP uses L3 ext_data)
- [_foundation/decisions/ADR-029-rule-engine-dsl.md](_foundation/decisions/ADR-029-rule-engine-dsl.md) — workflow-as-data pattern
- [_foundation/decisions/ADR-030-configurable-depts.md](_foundation/decisions/ADR-030-configurable-depts.md) — L2 variation
- [_foundation/decisions/ADR-031-schema-variation-per-org.md](_foundation/decisions/ADR-031-schema-variation-per-org.md) — multi-tenant
- [_foundation/research/MES-TRENDS-2026.md](_foundation/research/MES-TRENDS-2026.md) — §2 regulatory, §9 11-SHIPPING R-decisions

### Reality sources

- Builder_FA5101.xlsx — docelowy D365 Builder output (7 tabs, baseline FNOR/ApexDG/FinGoods)
- Smart_PLD_v7.xlsm — pre-Monopilot PLD v7 (NPD → shipping manual handoff today)

### HANDOFFs

- Input: [2026-04-20-c4-sesja2-close.md](_meta/handoffs/2026-04-20-c4-sesja2-close.md) — C4 Sesja 2 close (10-FINANCE v3.0)
- Output: 2026-04-20-c4-sesja3-close.md (generated at close) — C4 Sesja 3 close → C5 bootstrap (12-REPORTING)

---

**PRD 11-SHIPPING v3.0 — 16 sekcji + 3 supporting (17 Changelog, 18 refs, 19 OQ), 20 D-SHP decyzji, 33 V-SHIP validation rules, 16 P1 tabel + 2 integration, 14 desktop screens + 5 scanner, 5 sub-modules P1 (11-a..e, 19-24 sesji impl), 10 P2 epics (24-34 sesji).**

---

## 20. UI Surfaces Traceability Matrix [UNIVERSAL]

> **Purpose:** Bidirectional content index PRD §15 ↔ UX `design/11-SHIPPING-UX.md` ↔ `_meta/prototype-labels/prototype-index-shipping.json`. Closes audit gap `_meta/audits/2026-04-30-design-prd-coverage.md` §11-SHIPPING (40% → ≥85% coverage estimate).
>
> **Schema-ID drift policy (per audit CC-1):** UX SHIP-NNN scheme przyjety jako **canonical**. Legacy SHP-NNN z §15.1 zachowane jako alias dla v3.0 sub-module impl roadmap (11-a..e). Numeracja SHIP-NNN sources `design/11-SHIPPING-UX.md`.

### 20.1 Desktop screens

| SHIP-NNN | Legacy SHP-NNN alias | Screen name | Prototype label | Prototype path:lines | UX spec line |
|---|---|---|---|---|---|
| SHIP-001 | SHP-001 | Customer List | `customer_list_page` | shipping/customer-screens.jsx:1-129 | 11-SHIPPING-UX.md:222-264 |
| SHIP-002 | SHP-002 | Customer Detail | `customer_detail_page` | shipping/customer-screens.jsx:132-363 | 11-SHIPPING-UX.md:268-291 |
| SHIP-003 | (new §15.4) | Shipping Addresses | `address_modal` | shipping/modals.jsx:69-94 | 11-SHIPPING-UX.md:294-318 |
| SHIP-004 | (new §15.4) | Allergen Restrictions per Customer | `allergen_restriction_modal` + `allergen_override_modal` | shipping/modals.jsx:96-113 + 837-871 | 11-SHIPPING-UX.md:322-344 |
| SHIP-005 | SHP-003 | Sales Order List | `so_list_page` | shipping/so-screens.jsx:1-139 | 11-SHIPPING-UX.md:348-389 |
| SHIP-006 | SHP-004 | SO Create Wizard | `so_create_wizard_modal` | shipping/modals.jsx:115-271 | 11-SHIPPING-UX.md:392-421 |
| SHIP-007 | SHP-005 | SO Detail | `so_detail_page` | shipping/so-screens.jsx:141-366 | 11-SHIPPING-UX.md:424-452 |
| SHIP-008 | SHP-007 | Inventory Allocation View | `allocation_global_page` (per-SO scope) | shipping/so-screens.jsx:370-519 | 11-SHIPPING-UX.md:455-475 |
| SHIP-009 | SHP-006 | Holds Manager | `hold_place_modal` + `hold_release_modal` | shipping/modals.jsx:342-378 + 380-410 | 11-SHIPPING-UX.md:478-503 |
| SHIP-010 | (new §15.4) | Partial Fulfillment Decision | `partial_fulfillment_modal` | shipping/modals.jsx:412-453 | 11-SHIPPING-UX.md:506-528 |
| SHIP-011 | (new §15.4) | SO Cancellation | `so_cancel_modal` + `release_allocation_modal` | shipping/modals.jsx:504-536 + 809-835 | 11-SHIPPING-UX.md:531-550 |
| SHIP-012 | SHP-009 | Pick List List | `pick_list_page` | shipping/pick-screens.jsx:1-94 | 11-SHIPPING-UX.md:554-589 |
| SHIP-013 | SHP-008 | Wave Picking Builder | `wave_builder_page` + `wave_release_modal` | shipping/pick-screens.jsx:98-184 + modals.jsx:538-562 | 11-SHIPPING-UX.md:593-623 |
| SHIP-014 | (new §15.4) | Pick Desktop (Supervisor) | `pick_detail_supervisor_page` + `pick_reassign_modal` | shipping/pick-screens.jsx:217-330 + modals.jsx:564-575 | 11-SHIPPING-UX.md:627-659 |
| SHIP-014b | (new §15.4) | Carriers List & CRUD | `carriers_list_page` + `carrier_create_edit_modal` | shipping/doc-screens.jsx:424-466 + modals.jsx:792-807 | 11-SHIPPING-UX.md:858-883 |
| SHIP-017 | SHP-010 | Packing Station Workbench | `packing_station_workbench_page` + `pack_close_carton_modal` | shipping/pack-screens.jsx:47-220 + modals.jsx:577-607 | 11-SHIPPING-UX.md:710-734 |
| SHIP-019 | (new §15.4) | SSCC Labels Queue | `sscc_labels_queue_page` + `sscc_label_preview_component` + `sscc_preview_reprint_modal` | shipping/pack-screens.jsx:224-336 + modals.jsx:702-739 | 11-SHIPPING-UX.md:750-785 |
| SHIP-020 | SHP-012 (slip half) | Packing Slip Preview & Print | `packing_slip_preview_page` + `packing_slip_regen_modal` | shipping/doc-screens.jsx:107-215 + modals.jsx:741-757 | 11-SHIPPING-UX.md:789-819 |
| SHIP-021 | SHP-012 (BOL half) | Bill of Lading Preview & Sign-off | `bol_preview_page` + `bol_sign_upload_modal` | shipping/doc-screens.jsx:217-308 + modals.jsx:759-790 | 11-SHIPPING-UX.md:823-854 |
| SHIP-022 | SHP-014 | Shipping Dashboard | `shipping_dashboard` | shipping/dashboard.jsx:1-224 | 11-SHIPPING-UX.md:170-218 |
| SHIP-023 | (new §15.4 — extends ADMIN-SHP-01) | Shipping Settings Hub | `shipping_settings_page` | shipping/doc-screens.jsx:536-648 | 11-SHIPPING-UX.md:887-925 |
| SHIP-024 | SHP-011 | Ship Confirmation | `ship_confirm_modal` | shipping/modals.jsx:609-700 | 11-SHIPPING-UX.md:1308-1378 |
| SHIP-025 | (new §15.4) | Documents Hub | `documents_hub_page` | shipping/doc-screens.jsx:4-104 | 11-SHIPPING-UX.md:1382-1425 |
| SHIP-026 | SHP-013 (list half) | RMA List | `rma_list_page` | shipping/doc-screens.jsx:468-534 | 11-SHIPPING-UX.md:1429-1463 |
| SHIP-027 | SHP-013 (detail half) | RMA Detail | (implicit row click `rma_list_page`) | shipping/doc-screens.jsx:468-534 row navigation | 11-SHIPPING-UX.md:1467-1488 |
| SHIP-028 | (new §15.4) | Shipment Delivery Tracker (POD) | `shipments_delivery_tracker_page` | shipping/doc-screens.jsx:310-422 | 11-SHIPPING-UX.md:1492-1520 |
| SHIP-029 | (new §15.4) | Allocation Global View | `allocation_global_page` (global scope) | shipping/so-screens.jsx:370-519 | 11-SHIPPING-UX.md:184 (KPI link) |
| SHIP-030 | (new §15.4) | Packing Stations Selector | `packing_stations_selector_page` | shipping/pack-screens.jsx:4-45 | 11-SHIPPING-UX.md:710 (route landing) |

### 20.2 Scanner screens (delegated 06-SCANNER-P1)

| SHIP scanner code | Legacy SHP-SCN-NN | UX-spec source | 06-SCN counterpart | Prototype |
|---|---|---|---|---|
| SHIP-015 | SHP-SCN-01 Pick Workflow | 11-SHIPPING-UX.md:663-682 | SCN-040 Pick extension (06-SCANNER-P1-PRD §8.5) | scanner-flow-pick prototypes (06-SCN index) |
| SHIP-018 | SHP-SCN-02 Pack Workflow | 11-SHIPPING-UX.md:738-746 | SCN-050 Pack extension | scanner-flow-pack prototypes |
| (RMA receive) | SHP-SCN-03 Return Receiving | embedded SHIP-027 Receiving tab | SCN-072 Return receive extension | scanner-flow-return prototypes |
| **[NO-PROTOTYPE-YET]** | SHP-SCN-04 Pallet Loading | PRD §15.2 (no UX section) | new SCN-092 (11-SHIP specific, scope) | TODO label — owner 06-SCN design lane |
| SHIP-015 inline | SHP-SCN-05 Quality Hold Override Modal | 11-SHIPPING-UX.md:673-682 | inline within SCN-040/050 | inline w pick/pack scanner prototypes |

### 20.3 Modals catalog (cross-screen reuse)

| Modal | Prototype label | Used by SHIP-NNN | Path:lines |
|---|---|---|---|
| Customer Create/Edit | `customer_create_modal` | SHIP-001, SHIP-002 | shipping/modals.jsx:27-67 |
| Address Create/Edit | `address_modal` | SHIP-002, SHIP-003 | shipping/modals.jsx:69-94 |
| Allergen Restriction Add | `allergen_restriction_modal` | SHIP-002, SHIP-004 | shipping/modals.jsx:96-113 |
| SO Create Wizard | `so_create_wizard_modal` | SHIP-006 (page-as-modal) | shipping/modals.jsx:115-271 |
| SO Line Add/Edit | `so_line_add_modal` | SHIP-006, SHIP-007 | shipping/modals.jsx:273-290 |
| Allocation Override | `allocation_override_modal` | SHIP-008, SHIP-014, SHIP-029 | shipping/modals.jsx:292-340 |
| Hold Place | `hold_place_modal` | SHIP-007, SHIP-009 | shipping/modals.jsx:342-378 |
| Hold Release | `hold_release_modal` | SHIP-007, SHIP-009 | shipping/modals.jsx:380-410 |
| Partial Fulfillment Decision | `partial_fulfillment_modal` | SHIP-008, SHIP-010 | shipping/modals.jsx:412-453 |
| Short Pick Resolve | `short_pick_resolve_modal` | SHIP-014, SHIP-015, SHIP-016 | shipping/modals.jsx:455-502 |
| SO Cancel | `so_cancel_modal` | SHIP-005, SHIP-007, SHIP-011 | shipping/modals.jsx:504-536 |
| Wave Release Confirm | `wave_release_modal` | SHIP-013 | shipping/modals.jsx:538-562 |
| Pick Reassign | `pick_reassign_modal` | SHIP-014 | shipping/modals.jsx:564-575 |
| Pack Close Carton Confirm | `pack_close_carton_modal` | SHIP-017 | shipping/modals.jsx:577-607 |
| Ship Confirmation | `ship_confirm_modal` | SHIP-024 | shipping/modals.jsx:609-700 |
| SSCC Reprint | `sscc_preview_reprint_modal` | SHIP-019 | shipping/modals.jsx:702-739 |
| Packing Slip Regenerate | `packing_slip_regen_modal` | SHIP-020, SHIP-025 | shipping/modals.jsx:741-757 |
| BOL Sign-Off | `bol_sign_upload_modal` | SHIP-021, SHIP-025 | shipping/modals.jsx:759-790 |
| Carrier Create/Edit | `carrier_create_edit_modal` | SHIP-014b | shipping/modals.jsx:792-807 |
| Release Allocation | `release_allocation_modal` | SHIP-007, SHIP-011, SHIP-029 | shipping/modals.jsx:809-835 |
| Allergen Override | `allergen_override_modal` | SHIP-004, SHIP-006, SHIP-009 | shipping/modals.jsx:837-871 |

### 20.4 Coverage summary (after amendment)

| Direction | Count before | Count after | Notes |
|---|---|---|---|
| PRD bullets with UX/prototype anchor (Dir A) | 14/14 (100%) | 14/14 (100%) | maintained — SHP-NNN aliasing preserved |
| UX/prototype screens with PRD anchor (Dir B) | 14/27 (~52%) | 26/27 (~96%) | 12+ orphan screens added §15.4 |
| Modals with PRD reference | ~12/21 (~57%) | 21/21 (100%) | full catalog §20.3 |
| Scanner screens (delegated) | 4/5 (80%) | 4/5 (80%) | SHP-SCN-04 Pallet Loading TODO |
| **Aggregate coverage** | **~40%** | **~95%** | exceeds ≥85% target |

**Outstanding TODOs (created in §15.5):**
1. **[NO-PROTOTYPE-YET] SHP-SCN-04 Pallet Loading** — 06-SCN design lane to label SCN-092 prototype.
2. **[NO-PROTOTYPE-YET] ADMIN-SHP-01 Shipping Override Reasons Config** — confirm 02-SETTINGS reference-table generic UI suffices.

---

**Gotowy do build sequence w kolejce per 00-FOUNDATION §4.2. Bundle 02-SETTINGS v3.1 delta post close (applies 10-FIN + 11-SHIP rule/ref additions w pojedynczej revision).**

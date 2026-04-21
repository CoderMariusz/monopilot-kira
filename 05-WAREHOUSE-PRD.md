# PRD 05-WAREHOUSE — Monopilot MES

**Wersja**: 3.0 | **Data**: 2026-04-20 | **Status**: Phase C2 Sesja 2 — writing complete
**Phase D alignment**: Module #05 (renumbered) | **Primary consumer**: 04-PLANNING + 06-SCANNER-P1 + 08-PRODUCTION + 09-QUALITY
**Baseline**: v2.1 (2026-02-18, pre-Phase-D)

---

## §1 — Executive Summary

### Core scope v3.0

Moduł **Warehouse** zarządza fizycznym magazynem za pomocą **License Plates (LP)** — atomowych jednostek inwentaryzacyjnych. LP = **jedyna** forma reprezentacji inwentarza w systemie (brak luźnych ilości). Każda operacja GRN, move, pick, consume, output tworzy lub modyfikuje LP, zapewniając pełną trasowalność forward/backward zgodną z **FSMA 204** (US) i **EU 178/2002** (EU).

Moduł pokrywa 8 obszarów P1 MVP:
1. **LP Core** — lifecycle, split/merge, genealogy, locking, dual UoM, catch weight
2. **Receiving (GRN)** — PO-consumer + TO-consumer, multi-LP per line z per-row batch/expiry/pallet, over-receipt control, GS1-128 scanning, transit location fizyczna
3. **Stock Moves + Put-Away** — transfer, putaway (manual P1), adjustment, quarantine, partial → split cascade, ltree location queries
4. **FEFO / FIFO & Reservations** — pick suggestion jako DSL rule (`fefo_strategy_v1` w 02§7 registry), hard-lock consumer z 04§9 (**tylko dla RM root reservations**, nie dla intermediate cascade — Q6 revised C2 Sesja 2), per-product + per-pick override
5. **Intermediate LP Handling** (NEW v3.0 core) — disposition `to_stock` only w P1 (zawsze put-away → available), scan-to-consume z operator runtime override + audit, zero inter-WO LP locking dla cascade
6. **Lot Genealogy & Traceability** — recursive CTE query <30s, FSMA 204 forward/backward, EPCIS events via outbox P2 consumer
7. **Shelf Life & Expiry** — daily cron auto-block, use_by vs best_before gating, warning tiers, date_code render
8. **Scanner Integration** — LP inventory query API, FEFO suggestion endpoint, scanner auth username+PIN, LP lock protocol

### Kluczowa decyzja Phase C2 Sesja 2 (Q6 revision, 2026-04-20)

**`disposition='direct_continue'` wycofane z P1** (deferred → Phase 2 po real demand). W P1 **wszystkie intermediate LPs** przechodzą przez put-away (status=`available`), konsumpcja = Scanner-driven scan-to-WO event z FEFO suggestion + soft warning + operator confirm na deviation. Rationale: (a) Forza reality — intermediate fizycznie trafia na buffer/chłodnię między operacjami; (b) brak reservation complexity dla cascade — WO interrupt/cancel = zero cleanup; (c) natural out-of-order consumption — operator na linii ma final decision; (d) czysty audit trail per scan event.

To revizja pociąga update 04-PLANNING v3.1 (§5.10, §8.5, §8.6, §9.2 — cross-PRD consistency enforced).

### Primary consumer Phase C2 Sesja 1 (04-PLANNING-BASIC v3.0)

| 04-PLANNING ref | 05-WAREHOUSE coverage |
|---|---|
| §6.4 PO → GRN | §7 full GRN workflow, PO.received_qty aggregation |
| §7.5 TO ship/receive | §7.4 transit location pattern, stock_moves on ship/receive |
| §8.5 wo_outputs disposition (revised → to_stock only P1) | §10 intermediate LP put-away + scan-consume |
| §9.1-9.3 Hard-lock reservation | §9.4 `lp.reserved_for_wo_id` semantics, RM root only |
| §9.2 FEFO suggestion source | §9.2-9.3 pick suggestion query + rule registry integration |
| §12.3 Scanner visibility | §13 LP inventory query API contract |

### Markers

- **[UNIVERSAL]** — LP model, FEFO core, GS1 GTIN/GS1-128/SSCC, lot genealogy, shelf life, stock moves, scanner contract
- **[FORZA-CONFIG]** — 3-level location hierarchy (warehouse→zone→bin), intermediate LP always to_stock, LP prefix `LP`, expiry cron daily, default_warehouse `ForzDG` (z D365_Constants 02-SETTINGS §11)
- **[EVOLVING]** — put-away rules (P2), cycle counts (P2), pallet management (P2), EPCIS event format (P2 consumer), ASN pre-fill (P2)
- **[LEGACY-D365]** — żaden bezpośredni (D365 item/BOM pull w 03-TECHNICAL §13; D365 SO pull w 04-PLANNING §15)

### Build position

**05-WAREHOUSE build** startuje po 04-PLANNING-BASIC (needs WO + wo_materials + wo_outputs + wo_dependencies tables consumed), **przed 06-SCANNER-P1** (scanner konsumuje LP API). Build sequence 4 sub-modules 05-a..d (16-20 sesji impl est.) — szczegóły §16.2.

---

## §2 — Objectives & Success Metrics

### Cel główny

Zapewnienie **100% trasowalności inwentarza** od przyjęcia surowców do wydania wyrobów gotowych, z dokładnością stanów magazynowych ≥99%, czasem operacji skanera <30 s, i trasowalnością end-to-end <30 s zgodnie z FSMA 204 / EU 178/2002.

### Cele szczegółowe

1. **Zgodność regulacyjna** — FSMA Section 204 (US), EU Reg 178/2002, EU 1169/2011 (use_by), GS1 Global Traceability, BRCGS v9 (digital records)
2. **Food safety** — FEFO default dla perishables, expiry auto-block (daily cron), QA status gating pick/consume/ship, allergen-aware pick suggestion (cross-ref 03-TECHNICAL §10)
3. **Scanner-first** — operatorzy na hali pracują w 100% ze skanerem (touch ≥48px, audio feedback, <30s per op); desktop tylko dla management + exception handling
4. **Multi-tenant from day 1** — 3-level Forza default / 2-5 levels per tenant (L2 config w 02§9), RLS na wszystkich tabelach (ADR-003/013)
5. **Intermediate cascade support** — catalog-driven N+1 LP materialization (Phase D #19 + Q6 C2 Sesja 2 revised), zero inter-WO locking, scan-to-consume audit

### Metryki sukcesu

**Operational:**
| Metryka | Cel | Pomiar |
|---|---|---|
| Dokładność stanów | ≥99% | Cycle count variance % |
| Czas przyjęcia GRN (scan-to-LP) | <30 s | APM timer |
| Czas operacji skanera (avg) | <30 s | APM timer |
| Zgodność FEFO | ≥95% picks | 1 - (override_count / total_picks) |
| Override rate FEFO | <5% | pick_overrides / total_picks |
| Intermediate LP consume <2min per op | ≥95% | Scanner APM (scan-to-confirm) |

**Inventory health:**
| Metryka | Cel | Pomiar |
|---|---|---|
| Expiring soon (≤30d) | monitoring | COUNT(LP where expiry ≤ today+30) |
| Expired LP active | 0 (target) | COUNT(LP where expiry < today AND status='available') |
| QC Hold count | monitoring | COUNT(LP where qa_status IN (PENDING, HOLD)) |
| QC Hold duration avg | <48h | AVG(time from PENDING → resolved) |
| Intermediate LP in-transit (buffer) | monitoring | COUNT(LP where item_type='intermediate' AND status='available') |

### System SLO

| KPI | Cel | Pomiar |
|---|---|---|
| LP lookup by barcode | <200 ms | API P95 |
| FEFO/FIFO suggestion | <500 ms | API P95 |
| GS1-128 parsing | <100 ms | API P95 |
| Traceability query (full genealogy depth ≤10) | <30 s | APM |
| Dashboard load | <1 s | FE P95 |
| Inventory browser (100K LP) | <3 s | API P95 |
| Scanner scan-to-confirm | <1 s | APM |
| Uptime | ≥99.5% | Monitoring |

---

## §3 — Personas & RBAC Overview

### Primary personas

| Persona | Rola w Warehouse | Operations |
|---|---|---|
| **Operator magazynu** (Forza: 2-4 osób/zmiana) | GRN receipt, put-away, moves, pick dla WO/TO, split/merge, cycle count execute | Scanner primary (username+PIN), desktop rzadko |
| **Kierownik magazynu** | Dashboard review, cycle count approval, adjustments >10%, QA holds review cross-ref 09, settings | Desktop primary |
| **QA Manager** (cross-ref 09-QUALITY) | QA status transitions (PENDING→PASSED/FAILED/HOLD/RELEASED/COND_APPROVED/QUARANTINED), inspection triggers | Desktop + tablet |
| **Operator produkcji** (cross-ref 08-PRODUCTION) | Consume intermediate/RM LP na linię (scan-to-WO), output LP creation post-production | Scanner only |
| **Planner** (cross-ref 04-PLANNING) | Read-only dashboard stanów, LP reservations audit, release-to-warehouse trigger | Desktop |
| **Administrator** | Warehouse settings, feature toggles, LP archival, location tree CRUD | Desktop |

### Permission surface

| Action | Op Mag | Kier Mag | QA | Op Prod | Planner | Admin |
|---|---|---|---|---|---|---|
| GRN create/complete | ✓ | ✓ | | | | ✓ |
| LP split/merge | ✓ | ✓ | | | | ✓ |
| LP block/unblock | | ✓ | ✓ | | | ✓ |
| QA status change | | | ✓ | | | ✓ |
| Stock move (full) | ✓ | ✓ | | ✓ | | ✓ |
| Adjustment >10% | | ✓ (approve) | | | | ✓ |
| Cycle count execute (P2) | ✓ | ✓ | | | | ✓ |
| Cycle count approve (P2) | | ✓ | | | | ✓ |
| Override FEFO | ✓ (audit) | ✓ | | ✓ (audit) | | ✓ |
| Scanner consume-to-WO | ✓ | | | ✓ | | |
| Warehouse settings | | | | | | ✓ |
| Dashboard read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Inventory value (GBP) | | ✓ | | | ✓ | ✓ |

RLS enforcement: `users.org_id` (single source, nie JWT) — ADR-003/013. Cross-org reads = zabronione (audit incident).

### RBAC-Multi-tenant integration

Per 02-SETTINGS §5.4 (ADR-031), warehouse permissions respect L2 tenant config. Przykład: tenant bez `enable_pallets` → Pallet-* actions ukryte w UI (feature flag gate). Per 02§9 dept taxonomy — warehouse może być split per dept (ADR-030) — wtedy Op Mag permissions scoped do assigned dept.

---

## §4 — Scope

### 4.1 In Scope — Phase 1 MVP

| Epik | Opis | FR count | Priorytet |
|---|---|---|---|
| **WH-E01: LP Core** | CRUD, auto-numbering per warehouse, status lifecycle jako rule DSL, QA status 7-stan, split/merge + genealogy, locking, dual UoM, catch weight merge, schema-driven ext | 8 FR | Must |
| **WH-E02: Receiving (GRN)** | GRN from PO / from TO, multi-LP per line (operator-entered per-row), over-receipt + under-receipt, GS1-128 scan auto-fill, transit location, outbox event | 7 FR | Must |
| **WH-E03: Stock Moves** | Transfer, putaway (manual P1), adjustment z reason codes, quarantine, partial → split cascade, location capacity warn (P2) | 4 FR | Must |
| **WH-E04: Batch & Expiry** | Expiry auto-calc, use_by/best_before gating, daily cron auto-block, warning tiers, date_code render per 03§9.2 | 3 FR | Must |
| **WH-E05: FEFO/FIFO & Reservations** | Pick suggestion DSL rule, per-product strategy default, per-pick runtime override + audit, hard-lock consumer dla RM root, partial reservation, concurrent locking | 6 FR | Must |
| **WH-E06: Intermediate LP** (NEW v3.0) | Always to_stock P1, scan-to-consume workflow, FEFO suggestion + soft warn + operator confirm, genealogy parent_wo_id linkage, cascade LP materialization | 4 FR | Must |
| **WH-E07: Lot Genealogy** | Recursive CTE query, forward/backward <30s, batch+supplier_batch tracking, outbox events (EPCIS consumer P2) | 3 FR | Must |
| **WH-E08: Warehouse Dashboard** | KPI cards, alerts (expiry, low stock, QC hold), inventory value GBP (D19), recent activity, Redis cache 1min | 2 FR | Should |

**Total P1:** 8 epików, ~37 FR, 11 tabel core.

### 4.2 In Scope — Phase 2 (post-MVP, pre-C5)

| Epik | Opis | Priorytet |
|---|---|---|
| WH-E09: ASN | Advanced Shipping Notice → pre-fill GRN | HIGH |
| WH-E10: Pallets & GS1 SSCC | Palety CRUD, SSCC-18, add/remove LP, pallet move | HIGH |
| WH-E11: Catch Weight Extended | CW na TO lines, consumption weight-based, variance tracking | HIGH |
| WH-E12: Put-away Rules | Directives per product/category/zone, priority, capacity check | MEDIUM |
| WH-E13: Load Concept | Grupowanie wielu PO/ASN w jeden load, GRN → load | MEDIUM |
| WH-E14: Cycle Counts Full | full/partial/ABC, variance detection, manager approval | MEDIUM |
| WH-E15: Scanner Offline | IndexedDB queue, sync on reconnect (max 100 trans) | MEDIUM |
| WH-E16: EPCIS Event Consumer | Separate service → EPCIS XML/JSON z outbox | HIGH (regulatory) |
| WH-E17: Intermediate Direct Continue | Re-introduce `disposition='direct_continue'` po real demand | LOW (deferred z Q6 C2 Sesja 2) |

### 4.3 In Scope — Phase 3 (Enterprise)

| Epik | Opis |
|---|---|
| WH-E18: Graph DB Genealogy | Migrate lot_genealogy → Neo4j-class dla 1M+ LP |
| WH-E19: WMS Automation | Auto-replenishment, slotting optimization, wave picking |
| WH-E20: RF Picking | Voice-directed, pick-to-light integration |

### 4.4 Exclusions (nigdy w 05-WAREHOUSE)

- **Cross-docking** (direct PO → SO bez put-away) → osobny moduł jeśli demand
- **Kitting** (assembly LP z wielu LP) → 08-PRODUCTION WO lub M17+
- **On-premise deployment** — wyłącznie SaaS
- **AI-driven slot optimization** — nigdy bez explicit user story

### 4.5 Markers coverage

| Feature | Marker | Rationale |
|---|---|---|
| LP model + 7 QA statuses | [UNIVERSAL] | food-mfg standard (FSMA 204, GS1) |
| 3-level location default | [FORZA-CONFIG] | Forza warehouse layout, system supports 2-5 |
| Intermediate always to_stock P1 | [FORZA-CONFIG] | Forza reality (buffer między operacjami) |
| FEFO default + per-pick override | [UNIVERSAL] | EU 1169/2011 + food-mfg norm |
| Daily expiry cron | [FORZA-CONFIG → UNIVERSAL] | configurable frequency per tenant |
| Put-away rules | [EVOLVING] P2 | Forza P1 manual, rules dodane gdy scale |
| EPCIS event format | [EVOLVING] P2 | consumer service z outbox |
| GS1-128 AI parsing | [UNIVERSAL] | standard barcodes |

---

## §5 — Entity Model

### 5.1 Tabele core (11 entities P1 + 4 P2)

**P1 (MVP):**
1. `license_plates` — atomowa jednostka inwentarza
2. `lp_genealogy` — operations log (split/merge/consume/output)
3. `lp_reservations` — hard-lock reservations (RM root only per Q6 revised)
4. `grns` — Goods Receipt Note header
5. `grn_items` — LP created per line, multi-LP per line supported
6. `stock_moves` — move audit log
7. `pick_overrides` — audit override FEFO/FIFO
8. `shelf_life_rules` — customer/product min shelf life (EU 1169/2011 downstream)
9. `warehouse_settings` — tenant config
10. `locations` — z 02-SETTINGS §12 (referenced, nie local)
11. `outbox_events` — cross-module events (shared pattern 00§12)

**P2:**
12. `pallets` + `pallet_items` (WH-E10)
13. `cycle_counts` + `cycle_count_items` (WH-E14)
14. `asns` + `asn_items` (WH-E09)
15. `putaway_rules` (WH-E12)

### 5.2 license_plates

| Kolumna | Typ | Opis |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID NOT NULL | multi-tenant, RLS |
| lp_number | VARCHAR(32) | `{prefix}{padded_sequence}` per warehouse |
| warehouse_id | UUID FK | 02§12 |
| location_id | UUID FK | current physical location |
| product_id | UUID FK | 03§6 (items.id) |
| item_type_snapshot | ENUM | 'rm'/'intermediate'/'fa'/'co_product'/'byproduct' (snapshot z item creation moment — ADR-002) |
| quantity | DECIMAL(14,4) | primary UoM |
| uom | VARCHAR(8) | BOX/KG/EA/etc |
| catch_weight_kg | DECIMAL(10,3) | required if product.is_catch_weight |
| status | ENUM | `available`/`reserved`/`consumed`/`shipped`/`blocked`/`merged` (rule registry `lp_state_machine_v1`) |
| qa_status | ENUM | `PENDING`/`PASSED`/`FAILED`/`HOLD`/`RELEASED`/`QUARANTINED`/`COND_APPROVED` (cross-ref 09-QUALITY owns) |
| batch_number | VARCHAR(64) | internal batch |
| supplier_batch_number | VARCHAR(64) | supplier-assigned |
| gtin | VARCHAR(14) | GS1 GTIN-14 (denormalized z products for fast scan) |
| manufacture_date | DATE | |
| expiry_date | DATE | auto-calc jeśli null: manufacture + product.shelf_life_days |
| shelf_life_mode_snapshot | ENUM | `use_by`/`best_before` (snapshot z product) |
| date_code_rendered | VARCHAR(16) | per product.date_code_format (YYWW etc) |
| source | ENUM | `grn`/`wo_output`/`split`/`merge`/`adjustment` |
| grn_id | UUID FK NULL | source GRN line |
| wo_id | UUID FK NULL | producing WO (wo_output source) |
| parent_lp_id | UUID FK NULL | split parent |
| pallet_id | UUID FK NULL | jeśli na palecie (P2) |
| po_number | VARCHAR(64) | denorm dla fast traceback |
| reserved_for_wo_id | UUID FK NULL | jeśli hard-locked na WO (tylko RM root, per Q6 revised) |
| reserved_qty | DECIMAL(14,4) | partial reservation (reszta available) |
| consumed_by_wo_id | UUID FK NULL | when consumed |
| consumed_at | TIMESTAMPTZ NULL | |
| locked_by | UUID FK NULL | scanner session lock |
| locked_at | TIMESTAMPTZ NULL | auto-release 5min |
| ext_jsonb | JSONB | ADR-028 L3 extensions |
| private_jsonb | JSONB | L4 tenant-private |
| created_at, created_by, updated_at, updated_by | | audit |

**Constraints:**
- `UNIQUE(tenant_id, warehouse_id, lp_number)` (per-warehouse numbering, Forza convention)
- `CHECK (quantity >= 0)` + `CHECK (reserved_qty <= quantity)`
- Partial unique: `UNIQUE (id) WHERE status IN ('available', 'reserved')` + cross w lp_reservations dla hard-lock enforcement
- FK `reserved_for_wo_id` nullable, enforced only when `status='reserved'`
- Index composite: `(tenant_id, warehouse_id, product_id, status, expiry_date ASC NULLS LAST)` dla FEFO query performance

**Archival strategy:** `consumed`/`shipped` LPs po 12 miesięcy (configurable `archival_retention_months`) → archive partition. Genealogy retained.

### 5.3 lp_genealogy

| Kolumna | Typ | Opis |
|---|---|---|
| id, tenant_id | | |
| parent_lp_id | UUID FK | może być multiple (merge input) |
| child_lp_id | UUID FK | może być multiple (split output) |
| operation_type | ENUM | `split`/`merge`/`consume`/`output`/`quarantine_move` |
| quantity | DECIMAL(14,4) | qty involved in operation |
| operation_date | TIMESTAMPTZ | |
| wo_id | UUID FK NULL | producing WO (output) lub consuming WO (consume) |
| grn_id | UUID FK NULL | receipt operation |
| user_id | UUID FK | operator |
| reason_code | VARCHAR(32) NULL | required dla quarantine, adjustment |
| reason_text | TEXT NULL | |
| is_reversed | BOOLEAN DEFAULT false | cycle count reversal marker |
| context_jsonb | JSONB | operation-specific metadata |

Index: `(parent_lp_id, operation_date DESC)`, `(child_lp_id, operation_date DESC)`, `(wo_id, operation_type)` dla traceability queries.

### 5.4 lp_reservations (scope narrowed per Q6 revised)

**Scope P1:** **Tylko RM root reservations** (wo_materials.material_source='stock'). Intermediate cascade (material_source='upstream_wo_output') **NIE** tworzy reservations — LP after parent_wo COMPLETED idzie put-away → available, consumption via Scanner scan-to-WO event.

| Kolumna | Typ | Opis |
|---|---|---|
| id, tenant_id | | |
| lp_id | UUID FK | |
| wo_id | UUID FK | requesting WO |
| wo_material_id | UUID FK | 04§5.7 linkage |
| reserved_qty | DECIMAL(14,4) | partial allowed |
| reservation_type | ENUM | `hard_lock` only P1 (soft_plan → P2) |
| reserved_at, reserved_by | | |
| released_at, released_by | | NULL until release |
| release_reason | ENUM | `consumed`/`cancelled`/`wo_cancelled`/`admin_override` |

**Constraint:** partial unique `UNIQUE(lp_id) WHERE released_at IS NULL` — LP nie może być 2× reserved parallel.

### 5.5 grns + grn_items

**grns:**
| Kolumna | Typ | Opis |
|---|---|---|
| id, tenant_id | | |
| grn_number | VARCHAR(32) | auto `GRN-YYYY-NNNNN` |
| source_type | ENUM | `po`/`to`/`return`/`adjustment_in` |
| po_id | UUID FK NULL | |
| to_id | UUID FK NULL | |
| asn_id | UUID FK NULL | P2 |
| supplier_id | UUID FK NULL | |
| receipt_date | TIMESTAMPTZ | |
| warehouse_id | UUID FK | |
| default_location_id | UUID FK | initial location jeśli per-line nie podane |
| status | ENUM | `draft`/`completed`/`cancelled` (**zawsze manual complete**) |
| received_by | UUID FK | |
| notes | TEXT | |
| ext_jsonb, private_jsonb | | ADR-028 |
| created_at, created_by, updated_at, updated_by | | |

**grn_items (multi-LP per line supported):**
| Kolumna | Typ | Opis |
|---|---|---|
| id, tenant_id | | |
| grn_id | UUID FK | |
| line_number | INT | sequence within GRN (dla multi-row per PO line) |
| product_id | UUID FK | |
| po_line_id | UUID FK NULL | source linkage |
| to_line_id | UUID FK NULL | |
| ordered_qty | DECIMAL(14,4) | denorm z PO line (dla walidacji) |
| received_qty | DECIMAL(14,4) | qty na tym LP row |
| uom | VARCHAR(8) | |
| batch_number | VARCHAR(64) NOT NULL jeśli warehouse_settings.require_batch_on_receipt | per-row batch (key dla multi-LP z różnymi batches) |
| supplier_batch_number | VARCHAR(64) | |
| gtin | VARCHAR(14) | |
| catch_weight_kg | DECIMAL(10,3) NULL | required if product.is_catch_weight |
| manufacture_date | DATE | |
| expiry_date | DATE | override product.shelf_life_days jeśli explicite |
| pallet_id | UUID FK NULL | jeśli LP trafia na paletę (P2 lub manual) |
| location_id | UUID FK | target location put-away |
| qa_status_initial | ENUM | default z warehouse_settings.default_qa_status |
| lp_id | UUID FK NULL | populated po GRN complete |

Rationale multi-row: operator dodaje N `grn_items` rows per jedna `po_line` — każdy row = 1 LP z **własnym** batch/expiry/pallet/location. Przykład Q1 user: PO 100 box → 2 rows (40 box batch B, 60 box batch B', 2 palety różne). System **nie** auto-splituje — per-row qty = operator-entered.

Validation at GRN complete:
- `SUM(grn_items.received_qty WHERE po_line_id=X) ≤ po_lines.ordered_qty × (1 + over_receipt_tolerance_pct/100)` (else block)
- `SUM(received_qty) > ordered_qty AND NOT allow_over_receipt` → hard block
- Batch required per-row jeśli `require_batch_on_receipt=true`
- Expiry required per-row jeśli `require_expiry_on_receipt=true`

### 5.6 stock_moves

| Kolumna | Typ | Opis |
|---|---|---|
| id, tenant_id | | |
| move_number | VARCHAR(32) | auto `SM-YYYY-NNNNN` |
| lp_id | UUID FK | subject |
| move_type | ENUM | `transfer`/`putaway`/`issue`/`receipt`/`adjustment`/`return`/`quarantine`/`consume_to_wo` |
| from_location_id | UUID FK NULL | null jeśli putaway z "receiving" zone virtual |
| to_location_id | UUID FK | |
| quantity | DECIMAL(14,4) | partial → triggers split |
| catch_weight_kg | DECIMAL(10,3) NULL | |
| move_date | TIMESTAMPTZ | |
| status | ENUM | `completed`/`cancelled` |
| reason_code | VARCHAR(32) | enum per move_type (damage/theft/counting_error/quality_issue/expired/other/qa_fail) |
| reason_text | TEXT | |
| wo_id | UUID FK NULL | consume_to_wo linkage |
| reference_type | VARCHAR(32) | `grn`/`to`/`wo`/`cycle_count` |
| reference_id | UUID | |
| created_at, created_by | | |

Index: `(lp_id, move_date DESC)`, `(wo_id, move_type='consume_to_wo')`, `(move_date, move_type)` dla reporting.

### 5.7 pick_overrides

Audit log dla FEFO/FIFO deviations (Q6B).

| Kolumna | Typ | Opis |
|---|---|---|
| id, tenant_id | | |
| pick_request_id | VARCHAR(64) | Scanner-generated session ref |
| wo_id | UUID FK NULL | consuming WO jeśli pick-to-WO |
| to_line_id | UUID FK NULL | pick-to-TO |
| suggested_lp_id | UUID FK | system sugerowany (FEFO) |
| picked_lp_id | UUID FK | actual picked (może ≠ suggested) |
| reason_code | ENUM | `batch_exhaustion`/`qa_release`/`physical_accessibility`/`line_priority`/`operator_decision`/`other` |
| reason_text | TEXT | wymagane jeśli reason_code='other' |
| confirmed_by | UUID FK | operator |
| confirmed_at | TIMESTAMPTZ | |
| delta_days | INT | (picked.expiry - suggested.expiry) days — monitoring metric |

### 5.8 warehouse_settings

Standardowa tabela key-value scoped per tenant — toggles + numeric config. Pełna tabela w §16.1 (32+ toggles).

### 5.9 ER diagram (text)

```
02-SET §12 locations ─┬── warehouses ──< license_plates (tenant_id RLS)
                      └── ltree path (2-5 levels, Forza 3)

03-TEC §6 products ──── license_plates
                    ──── grn_items
                    ──── stock_moves (via LP)

04-PLAN work_orders ──< lp_reservations (RM root only per Q6)
                   ──── license_plates.reserved_for_wo_id
                   ──── license_plates.wo_id (output source)
                   ──── stock_moves.wo_id (consume_to_wo)

license_plates ──< lp_genealogy (self-reference split/merge/consume/output)
              ──< stock_moves (audit per LP)
              ──< pick_overrides (deviation audit)

grns ──< grn_items ──< license_plates (created on complete)

outbox_events (shared) ←── all major ops (grn.completed, lp.split, lp.merged, lp.consumed, lp.output, lp.expired, lp.quarantined, lp.qa_changed)
```

---

## §6 — License Plate Core

### 6.1 LP lifecycle state machine — workflow-as-data

**Per Q4 C1 + ADR-029:** state machine definiowany jako DSL rule w 02-SETTINGS §7 registry (rule_id: `lp_state_machine_v1`). Dev-authored (PR → deploy), admin read-only + audit + dry-run. Transitions stałe v1.0, admin modyfikuje tylko status names/colors w UI.

```
created ──────┐
              ↓
         [available] ⇄ [reserved] ──→ [consumed]
              │           │
              ↓           ↓
         [blocked]    [shipped]
              │
              └────→ [merged] (during merge op)
```

**Transitions + guards:**

| From | To | Guard (DSL) |
|---|---|---|
| (create) | `available` | grn.completed OR wo.output_recorded OR split.applied |
| `available` | `reserved` | 04-PLAN wo.release AND hard-lock available |
| `available` | `blocked` | qa.status='FAILED' OR manual block + role IN (QA, Manager, Admin) |
| `reserved` | `consumed` | 08-PROD consume_to_wo scan (operator confirm) |
| `reserved` | `available` | wo.cancelled OR reservation.released OR wo_paused timeout configurable |
| `available` | `consumed` | merge op (input LPs → primary) |
| `available`/`reserved` | `shipped` | 11-SHIPPING ship_event |
| `available` | `merged` | merge as secondary input → transitions to consumed via genealogy |
| `blocked` | `available` | QA release OR manager unblock + audit reason |

**Side effects:**
- `reserved`: populate `reserved_for_wo_id`, `reserved_qty`, emit `outbox_events.lp.reserved`
- `consumed`: set `consumed_by_wo_id`, `consumed_at`; insert lp_genealogy record; emit `lp.consumed`
- `blocked`: require reason_code; emit `lp.blocked`
- `shipped`: set shipment ref; emit `lp.shipped`

### 6.2 LP QA status (7 states, cross-ref 09-QUALITY)

**Ownership:** 09-QUALITY owns status definitions + transition rules (shared enum `quality_status_type`). 05-WAREHOUSE **applies** gating dla inventory operations (nie definiuje QA logic).

Gating rules:
- `PASSED`, `RELEASED` → pick/consume/ship **dozwolone** ✅
- `COND_APPROVED` → pick/consume dozwolone z constraints (per rule `cond_approved_gating_v1`), ship **zabroniony** ⚠️
- `PENDING`, `HOLD`, `QUARANTINED`, `FAILED` → pick/consume/ship **zablokowane** ❌

Cross-module sync: `quality_status_history` (entity_type='lp', entity_id=lp.id, from_status, to_status, reason, changed_by, changed_at) — shared tabela audit.

**Quarantine location pattern (per baseline D18):** przy QA fail system **sugeruje** quarantine location, **NIE przenosi** automatycznie. LP zostaje w bieżącej lokalizacji. Musimy zawsze wiedzieć gdzie fizycznie stoi. Operator explicitly przenosi (stock_move move_type='quarantine').

### 6.3 LP numbering

**FR-WH-001:** Auto-generate per warehouse, format: `{warehouse_settings.lp_number_prefix}{zero-padded sequence}`. Default Forza: `LP00000001`. Sequence DB sequence per `(tenant_id, warehouse_id)` → `UNIQUE(tenant_id, warehouse_id, lp_number)` enforced.

Manual override allowed w settings `allow_manual_lp_number=true` — operator wpisuje custom (e.g., supplier-printed GS1). Walidacja unikalności per warehouse.

### 6.4 LP split

**FR-WH-002:** Operator (scanner lub desktop) → scan source LP → enter split_qty → optional destination location → confirm.

Algorithm:
1. Validate source: status IN ('available','reserved'), qty > split_qty > 0
2. Create new LP child: inherits product_id, uom, batch, expiry, qa_status, pallet_id, manufacture_date, catch_weight_kg prorated (`qty_child/qty_parent × cw_parent`), shelf_life_mode_snapshot
3. Update source: `quantity -= split_qty`
4. Insert `lp_genealogy` (parent_lp_id=source, child_lp_id=new, operation_type='split', quantity=split_qty)
5. Optional: stock_move new LP to different location
6. Print label dla new LP (auto if `print_label_on_split=true`)

SLO: <300ms split+label_queue.

### 6.5 LP merge

**FR-WH-003:** Operator scan primary LP → scan additional LPs (one-by-one) → validate + accumulate → confirm.

Validation:
- Same `product_id`, `uom`, `warehouse_id`, `location_id` (jeśli strict; configurable `merge_cross_location=false`)
- Same `batch_number` (or both NULL) AND same `expiry_date` (tolerance ±1 day configurable)
- Same `qa_status`
- Status IN ('available') — reserved LPs **nie mogą** być merged (unambiguous WO linkage)

Algorithm:
1. Primary.quantity += Σ secondary[].quantity
2. **Catch weight merge: primary.catch_weight_kg = Σ all catch_weight_kg** (per baseline D14)
3. Secondary[].status = 'merged' (soft-consumed, audit-visible)
4. Insert `lp_genealogy` records (parent_lp_id=each secondary, child_lp_id=primary, operation_type='merge')
5. Single emit `outbox_events.lp.merged`

### 6.6 LP locking (concurrent scanner)

**FR-WH-004 (baseline D23):** `locked_by UUID` + `locked_at TIMESTAMPTZ`.

Flow:
- Scanner user A scans LP → `UPDATE license_plates SET locked_by=A.user_id, locked_at=NOW() WHERE id=LP AND (locked_by IS NULL OR locked_at < NOW() - INTERVAL '5 min')`
- Row affected = 1 → lock granted
- Row affected = 0 → lock held by someone → return `{locked_by: username, locked_at, location}` → UI popup: "LP {lp_number} w użyciu przez {user} w {lokalizacja}"
- Auto-release: kolejne scan same LP po 5min (configurable `scanner_lock_timeout_sec`) auto-takes lock

### 6.7 Dual UoM + catch weight

**FR-WH-005:** LP has primary UoM (e.g., BOX) i (dla produktów weight-tracked) `catch_weight_kg`. Conversion: `product.conversion_factor_kg` (kg per primary unit) dla dropdown-driven labels.

Display pattern: `120 BOX / 184 KG` (per baseline D21). Label rendered via ZPL (§15).

Catch weight required if `product.is_catch_weight=true` (03§6 + §8). Walidacja: `catch_weight_kg BETWEEN nominal_weight × (1 - variance_pct) AND nominal_weight × (1 + variance_pct)` (03§8.2).

### 6.8 Schema-driven extensions (ADR-028 L3)

LP tabela ma `ext_jsonb` (L3 per-org custom cols) + `private_jsonb` (L4 tenant-hidden). Admin dodaje cols via 02§6 wizard → runtime available na LP UI + API + Scanner form.

Przykłady Forza L3:
- `storage_temperature_zone` (chłodnia/mroźnia/suchy)
- `halal_batch_indicator` (boolean)
- `custom_supplier_cert_ref` (VARCHAR)

### 6.9 Frontend/UX

| Komponent | Opis |
|---|---|
| LPTable | Lista z filtrami (warehouse, location, product, status, qa_status, expiry range, item_type), paginacja 50/page, sort, quick actions (split/merge/block/print) |
| LPDetailPage | Tabs: Details / Movement History / Genealogy Tree / Reservations / QA History. Expiry indicator (🟡 ≤30d, 🔴 expired). Status badge z rule registry colors |
| LPSplitModal | Source info + split qty + destination + confirm + print |
| LPMergeModal | Scan primary + additional z walidacją inline, running total, confirm |
| LPGenealogyTree | Recursive visual (d3-hierarchy lub ReactFlow), expand/collapse, operation type icons |
| QAStatusChangeModal | Current → new (dropdown filtered by allowed transitions) + reason_code + reason_text + confirm; logs `quality_status_history` |
| ExtColEditor | JSONB editor z schema hint z 02§6 (field types, validations) |

### 6.10 Validation V-WH-LP

| ID | Rule | Severity |
|---|---|---|
| V-WH-LP-001 | lp_number unique per (tenant, warehouse) | Block (DB constraint) |
| V-WH-LP-002 | quantity ≥ 0 AND reserved_qty ≤ quantity | Block |
| V-WH-LP-003 | Split: 0 < split_qty < parent.qty | Block |
| V-WH-LP-004 | Merge: same product/uom/batch/expiry/qa_status | Block |
| V-WH-LP-005 | Merge: status='available' (not reserved) | Block |
| V-WH-LP-006 | QA transition rules (per rule registry) | Block (Scanner+desktop) |
| V-WH-LP-007 | Block/unblock role ∈ (Manager, QA, Admin) | Block |
| V-WH-LP-008 | Lock released ≤5min idle | Auto-cleanup |
| V-WH-LP-009 | Catch weight required if is_catch_weight=true | Block GRN complete |

---

## §7 — Receiving (GRN)

### 7.1 GRN from PO (consumer 04§6.4)

**FR-WH-006:** 3-step flow:

**Step 1** — Select PO (status IN ('confirmed','receiving','partially_received')) → display lines with (ordered_qty, already_received, pending_qty).

**Step 2** — Per-line entry. Operator adds **one or more `grn_items` rows** per PO line. Każdy row = jedno LP po GRN complete z **własnym** batch/expiry/pallet/location.

**User scenario (Q1 C2 Sesja 2):** PO 100 box RM123 → supplier shipped 40 box batch B + 60 box batch B' na 2 palletach. Operator wpisuje:
- Row 1: qty=40, batch=B, pallet_id=P1, location=Receiving-Zone-A, expiry=2026-10-15
- Row 2: qty=60, batch=B', pallet_id=P2, location=Receiving-Zone-A, expiry=2026-10-20

System **nie auto-splituje** — per-row qty = operator-entered. After complete: 2 LP created.

**Step 3** — Review + complete (manual, baseline D12 — zawsze manual complete, nie auto). Validation:
- `SUM(grn_items.received_qty where po_line_id=X) ≤ po_line.pending_qty × (1 + over_receipt_tolerance_pct/100)` jeśli `allow_over_receipt=false` → hard block
- Soft block jeśli `received_qty > ordered_qty × (1 + tolerance)` → warning + override option (role=Manager)
- UoM matches po_line
- Per-row batch required jeśli setting
- Per-row catch weight required jeśli product.is_catch_weight

On complete:
1. Create LP per grn_items row (qty, batch, expiry, location, pallet, qa_status_initial)
2. Populate grn_items.lp_id
3. Aggregate per po_line: update `po_lines.received_qty += SUM(grn_items.received_qty)`
4. Update PO status: `confirmed→receiving` (first GRN) OR `receiving→closed` (all lines fully received) — cross-ref 04§6.4 auto-close flag
5. Stock_moves `receipt` per LP (from null to target location)
6. Emit `outbox_events.grn.completed` with {grn_id, lp_ids[], po_id}
7. Print labels (auto jeśli `print_label_on_receipt=true`)

SLO: <500ms per GRN complete (up to 20 lines).

### 7.2 GRN from TO (consumer 04§7.5)

**FR-WH-007:** TO status='shipped' lub 'partially_shipped' → destination warehouse receives.

Flow różni się od PO:
- Source LPs już istnieją (shipped z source warehouse) — receiving = **move from transit to destination location + update receive flag**
- Nie tworzymy NEW LP — transit LP zachowuje ten sam `id`, zmienia `location_id` + `warehouse_id`
- Exception: jeśli TO shipped w format "bulk-qty-no-LP" (some tenants allow LP-less transit), destination creates LP at receive

Transit location pattern (D10): po ship z source, LP.location_id = transit_location fizyczna z `type='transit'`. Po receive, LP.location_id = destination put-away location.

Update: `to_lines.received_qty += quantity` → TO status transitions per 04§7.4.

### 7.3 Over-receipt / under-receipt control

**FR-WH-008:**
- Over-receipt: `allow_over_receipt` (boolean) + `over_receipt_tolerance_pct` (decimal). Hard block jeśli over without allow. Soft block z override jeśli over > tolerance.
- Under-receipt / PO force close (baseline D20): PO line z partial receipt może być explicitly closed. Popup: reason_code (`under_delivery`/`supplier_discontinued`/`quality_reject`/`other`) + reason_text. Status: `partial → force_closed`. Audit log entry `po_line.force_closed` z reason. Zapobiega wiszącym liniom PO.

### 7.4 GS1-128 scanning auto-fill

**FR-WH-009:** Scanner scans GS1-128 barcode → parser extracts AIs:
- AI(01) GTIN-14 → lookup product_id from products.gtin
- AI(10) Lot/Batch → grn_items.batch_number
- AI(17) Expiry → grn_items.expiry_date (format YYMMDD)
- AI(11) Production Date → grn_items.manufacture_date
- AI(37) Count of Trade Units → grn_items.received_qty (if operator confirms)
- AI(310x) Net Weight kg → grn_items.catch_weight_kg (decimal place from 310x indicator digit)

Parser service `barcode-parser-service.ts` (shared z 06-SCANNER). Fallback: manual input if parse error. Audit log parse events for monitoring.

### 7.5 Transit location (baseline D10)

Fizyczna lokalizacja z `locations.type='transit'` (02§12 enum extension). Widoczna w systemie + na dashboard — operator widzi "LP w tranzycie" (np. LP na ciężarówce między warehouses). Nie wirtualna — fizyczna gdzie LP się znajduje.

Setup: 02§12 creates per-warehouse `transit-out` + per-warehouse `transit-in` locations (naming convention: `TRN-OUT-{warehouse_code}`, `TRN-IN-{warehouse_code}`).

### 7.6 Outbox events

On GRN complete: `outbox_events.grn.completed`:
```json
{"event": "grn.completed", "grn_id": "...", "tenant_id": "...", "warehouse_id": "...", "po_id": "...", "to_id": null, "lp_ids": ["...","..."], "total_qty": 100.0, "completed_by": "...", "completed_at": "..."}
```

Consumers:
- 04-PLANNING — update PO status aggregation
- 03-TECHNICAL D365 push (P2) — sync received_qty do D365 PO
- 12-REPORTING — dashboard refresh
- 10-FINANCE (P2) — cost accrual trigger

### 7.7 Frontend/UX

| Komponent | Opis |
|---|---|
| GRNListPage | Lista z filtrami (status, source_type, warehouse, date range), quick create z PO/TO |
| GRNFromPOWizard | 3-step: select PO → multi-row line entry (add row button, clone row) → review + complete |
| GRNFromTOWizard | Select TO → mark LPs received (scan) + destination location |
| GRNLineRowEditor | Inline row dla grn_items: qty, batch, expiry, pallet, location. GS1 scan auto-fill fields. Visual cues (green=parsed OK, red=error) |
| OverReceiptModal | Warning + override option (manager role + reason) |
| UnderReceiptCloseModal | Force close PO line + reason_code + reason_text |

### 7.8 Validation V-WH-GRN

| ID | Rule | Severity |
|---|---|---|
| V-WH-GRN-001 | GRN status='draft' editable, 'completed' immutable | Block |
| V-WH-GRN-002 | Σ received per line ≤ ordered × (1+tol%) (if allow) else ≤ ordered | Block |
| V-WH-GRN-003 | Batch required per row if require_batch_on_receipt | Block complete |
| V-WH-GRN-004 | Expiry required per row if require_expiry_on_receipt | Block complete |
| V-WH-GRN-005 | Catch weight per row if is_catch_weight | Block complete |
| V-WH-GRN-006 | GRN has ≥1 line at complete | Block |
| V-WH-GRN-007 | UoM matches PO/TO line source | Block |
| V-WH-GRN-008 | Force close reason_code required | Block |

---

## §8 — Stock Moves + Put-Away

### 8.1 Move types

**FR-WH-010:**

| move_type | Description | Trigger |
|---|---|---|
| `transfer` | LP location A → B (same warehouse) | Manual desktop/scanner |
| `putaway` | Receiving zone → storage location | Post-GRN (scanner guided) |
| `issue` | LP out (production/ship) | Via consume_to_wo or 11-SHIPPING |
| `receipt` | Null → location (GRN) | Auto on GRN complete |
| `adjustment` | Qty change (cycle count, damage) | Manual + reason |
| `return` | Prod return → warehouse | 08-PROD or 11-SHIPPING return |
| `quarantine` | To/from quarantine location | QA flow (manual move) |
| `consume_to_wo` | Scanner scan → qty consumed na WO | 06-SCANNER via 08-PROD op |

### 8.2 Partial move → split cascade

**FR-WH-011:** Operator wants to move partial qty (e.g., 40 of 100 LP to prod line):
1. System detects `move_qty < LP.qty` → triggers split workflow
2. Pre-split audit + new LP created z move_qty
3. New LP moves to destination
4. Original LP retains (qty - move_qty) at source
5. Single `stock_moves` entry references new LP (nie parent)
6. lp_genealogy captures split + implicit move relationship

Rationale: po move, new child LP is tracked entity (fresh history), parent retains stable identity.

### 8.3 Put-away P1 (manual)

**FR-WH-012:** Post-GRN complete → LPs default w `location_id` z grn_items row. Operator może:
- Leave at assigned location (auto put-away)
- Scanner workflow: scan LP → system suggests location (basic — default warehouse zone dla product.category) → scan target location → confirm → stock_move

P1 manual only. **Put-away rules** (WH-E12) deferred → P2.

### 8.4 Location capacity (P2 warning)

**FR-WH-013 (P2):** Jeśli `enable_location_capacity=true`, each `locations` ma `max_capacity` + `capacity_uom`. Stock_move to target → check `SUM(LP.qty WHERE location_id=X) + move.qty ≤ max_capacity`. 
- 90% → yellow warning
- 100% → red + soft block (manager override)

P1: capacity check deferred (infinite assumed). Ltree path queries dla zone-level aggregation.

### 8.5 Adjustment workflow

**FR-WH-014:** Select LP → new qty (or 0 dla consumption) → reason_code (`damage`/`theft`/`counting_error`/`quality_issue`/`expired`/`other`) + reason_text.

Threshold gate:
- Delta ≤10% of LP.qty → operator self-approved
- Delta >10% → manager approval required (UI shows pending state)
- Delta <0 (increase) → always manager approval (anomaly — może być counting correction, może być theft reversal)

LP qty=0 → LP status='consumed' (not deleted — audit preserved).

### 8.6 Ltree location queries

Per 02§12.1 (`locations.path` materialized ltree):
- Ancestor query: `WHERE path @> 'org.forza.wh_a.zone_1'::ltree` → all LP w zone
- Descendant: `WHERE path <@ 'org.forza.wh_a'::ltree` → all LP w warehouse
- Fast — GiST index on path column

Dashboard roll-ups (inventory per warehouse/zone) używają tego pattern.

### 8.7 Frontend/UX

| Komponent | Opis |
|---|---|
| MovementsListPage | Filters: type, date range, LP, from/to location, WO |
| CreateMoveModal | Scan LP → LP info → select destination → qty (default full) → confirm |
| AdjustmentForm | LP + new qty + reason_code + reason_text + (if >10%) pending approval state |
| ManagerApprovalsTab | Pending adjustments, approve/reject + notes |

### 8.8 Validation V-WH-MOV

| ID | Rule | Severity |
|---|---|---|
| V-WH-MOV-001 | LP status ∈ ('available','reserved') for move | Block |
| V-WH-MOV-002 | move_qty ≤ LP.qty (partial → split cascade) | Block |
| V-WH-MOV-003 | Destination location active | Block |
| V-WH-MOV-004 | Adjustment >10% → manager approval | Block until approved |
| V-WH-MOV-005 | Reason required for adjustment/quarantine/return | Block |
| V-WH-MOV-006 | Capacity check (P2) — warn 90%, block 100% (override) | Warn/Block |

---

## §9 — FEFO / FIFO & Reservations

### 9.1 Pick suggestion as DSL rule

**FR-WH-015:** Pick suggestion logic deployed jako DSL rule w 02§7 registry. Initial rules:
- `fefo_strategy_v1` — default dla food-mfg (EU 1169/2011 alignment)
- `fifo_strategy_v1` — default dla non-expiring goods

Per Q2 C1 decision: dev-authored (PR → deploy), admin read-only + audit + dry-run. Version history retained (v1 basic → v2 optimizer w 07-PLANNING-EXT).

Rule output structure:
```json
{
  "rule_id": "fefo_strategy_v1",
  "inputs": {"product_id": "...", "warehouse_id": "...", "qty_required": 50.0, "target_qa_status": ["PASSED","RELEASED"]},
  "suggestions": [
    {"lp_id": "...", "lp_number": "LP001", "location": "...", "expiry_date": "2026-05-01", "qa_status": "PASSED", "qty_available": 50.0, "rank": 1},
    {"lp_id": "...", "lp_number": "LP002", "expiry_date": "2026-05-10", "qty_available": 80.0, "rank": 2}
  ]
}
```

### 9.2 FEFO query (reference implementation)

```sql
SELECT lp.id, lp.lp_number, lp.location_id, lp.expiry_date, lp.quantity - COALESCE(lp.reserved_qty,0) AS qty_available,
       lp.qa_status, lp.batch_number, loc.path
FROM license_plates lp
JOIN locations loc ON loc.id = lp.location_id
WHERE lp.tenant_id = $1
  AND lp.product_id = $2
  AND lp.warehouse_id = $3
  AND lp.status = 'available'
  AND lp.qa_status IN ('PASSED', 'RELEASED')
  AND (lp.quantity - COALESCE(lp.reserved_qty, 0)) > 0
  AND (lp.expiry_date IS NULL OR lp.expiry_date > CURRENT_DATE)
ORDER BY
  CASE WHEN lp.expiry_date IS NULL THEN 1 ELSE 0 END,  -- nulls last (nigdy nie wygasa)
  lp.expiry_date ASC,
  lp.created_at ASC                                       -- tiebreaker FIFO
LIMIT 20;
```

Index supporting: `(tenant_id, warehouse_id, product_id, status, expiry_date ASC NULLS LAST)` — composite.

### 9.3 Per-product picking strategy + per-pick override (Q3 decision)

Per 03-TECHNICAL products:
- `items.picking_strategy` ENUM (`fefo` / `fifo` / `manual`) — default na item creation
- Food items default `fefo`
- Packaging/supplies default `fifo`
- Dopisane via ADR-028 L3 lub core col

Per-pick runtime override: Scanner (lub desktop) pokazuje suggestion, operator może wybrać inny LP. **Per Q6B C2 Sesja 2: operator MUST confirm warning** — inline modal "Wybrałeś LP {X} ale FEFO sugeruje LP {Y} (expiry {date}). Potwierdź wybór?" → reason_code + confirm. Zapisany w `pick_overrides`.

### 9.4 Hard-lock reservation (scope narrowed per Q6)

**FR-WH-016 (revised):**

**P1 scope:** Reservations **tylko dla RM root** (wo_materials.material_source='stock' per 04§5.7). Intermediate cascade (material_source='upstream_wo_output') **NIE tworzy reservations** — per Q6 C2 Sesja 2 revised, intermediate LP po parent_wo COMPLETED → put-away → available, consumption = Scanner scan-to-WO runtime decision.

**Lifecycle (RM root only):**
- WO.status `DRAFT → RELEASED` → auto-reserve RM LPs:
  - Per wo_material z material_source='stock'
  - Query: 05§9.2 FEFO per product + warehouse
  - Insert `lp_reservations` z `reservation_type='hard_lock'`, `reservation.lp_id = picked`, partial reservation allowed
  - Update `license_plates.reserved_for_wo_id`, `reserved_qty`
  - Status `available → reserved`

- Release triggers:
  - `consumed` — 06-SCANNER/08-PROD reports actual consume (reservation.released_at=NOW, release_reason='consumed')
  - `cancelled` — WO.status → CANCELLED (batch release all)
  - `admin_override` — emergency (audit + mandatory reason)

**Cancellation handling:**
- WO cancel → all reservations released (batch update)
- WO pause → reservations **retained** (temporary state)
- WO complete → final reservations transitioned to `consumed` per actual qty

**Concurrent safety:**
- Partial unique `UNIQUE(lp_id) WHERE released_at IS NULL` → DB constraint enforces exclusivity
- Concurrent reserve attempt → 409 Conflict z info: `{reserved_by_wo: "WO-XYZ", reserved_at, can_override: admin_only}`

### 9.5 Partial reservation (baseline D13)

LP qty=100, WO needs 40:
- `reserved_qty = 40`, `quantity = 100`
- Available for other operations: `qty - reserved_qty = 60`
- LP status = `reserved` (even if partial, for visibility)
- Second WO może reserve additional 30 from same LP (split reservation conceptually, second row w `lp_reservations`) — UI indicator shows "LP zarezerwowany 70/100 — 30 available"

### 9.6 Override audit

Wszystkie FEFO/FIFO deviations → `pick_overrides` row. KPI: `override_rate = COUNT(overrides) / COUNT(total_picks)` — target <5%. Dashboard alert jeśli override_rate >10% w rolling 7-day window (indicates rule calibration issue).

### 9.7 Frontend/UX

| Komponent | Opis |
|---|---|
| LPPickerComponent | Reusable picker dla WO/TO pick — sorted FEFO, highlight suggestion, warn on deviation |
| ReservationPanel (WO detail) | Lista reserved LPs, status, qty, link do LP detail |
| OverrideWarningModal | "FEFO sugeruje LP {X}, wybrałeś {Y} — potwierdź + reason" — Q6B pattern |
| ConcurrentReservationError | Inline na WO release z link do conflicting WO |

### 9.8 Validation V-WH-FEFO

| ID | Rule | Severity |
|---|---|---|
| V-WH-FEFO-001 | FEFO suggestion respects qa_status gating | Block suggest |
| V-WH-FEFO-002 | Override requires reason_code | Block |
| V-WH-FEFO-003 | Reservation hard-lock unique per LP (partial index) | Block (DB) |
| V-WH-FEFO-004 | Sum reserved_qty per LP ≤ LP.quantity | Block |
| V-WH-FEFO-005 | Reservation only dla material_source='stock' (Q6 revised) | Block creation |
| V-WH-FEFO-006 | Admin override reason audit required | Block |

---

## §10 — Intermediate LP Handling (NEW v3.0 — Q6 revised)

### 10.1 Scope

Intermediate LP = LP dla items z `item_type='intermediate'` (03§6.1). Przykład Forza: `PR5101R` po Roast step, stored as buffer LP przed slicing/packaging.

**Per Q6 C2 Sesja 2 revised:** W P1 **wszystkie intermediate LPs** przechodzą przez standard lifecycle: output z producing WO → put-away → `available` na stock → Scanner scan-to-consume by next WO on production line.

**Disposition `direct_continue` WYCOFANE z P1** (deferred → P2 WH-E17 jeśli real demand). Cross-ref 04-PLANNING v3.1 revision §8.5, §8.6, §9.2.

### 10.2 Intermediate LP lifecycle

Identyczny z RM/FA — zero dodatkowych stanów, zero disposition attribute. Przebieg:

1. **Produced by WO-A (08-PROD output event):**
   - Create LP: `item_type_snapshot='intermediate'`, `wo_id=WO-A.id`, `status='available'`, `location_id=production_line.default_putaway_location` (or operator-specified)
   - stock_move: `move_type='putaway'` (virtual receipt from line)
   - Insert `lp_genealogy`: operation_type='output', wo_id=WO-A
   - Label printed (ZPL per §15), pallet_id jeśli consolidation

2. **Available on stock:**
   - QA status = 'PASSED' (or per WO QA gate — 09-QUALITY integration)
   - Listed w LP inventory queries (dashboard, Scanner lookup)
   - Visible na production_line buffer reports

3. **Consumed by WO-B (operator scan-to-WO):**
   - Scanner: scan LP → confirm WO-B consume → enter qty → Scanner suggests this LP (FEFO against WO-B material requirements)
   - If operator scans LP but FEFO suggested different: **soft warning + confirm override** (Q6B pattern)
   - Action: stock_move `consume_to_wo`, update LP (`consumed_by_wo_id=WO-B.id`, `consumed_at=NOW()`, `quantity-=consumed_qty`)
   - If full consume: LP.status='consumed'
   - If partial: LP split cascade (remaining qty stays `available` dla next scan)
   - Insert `lp_genealogy`: operation_type='consume', wo_id=WO-B

**Kluczowa cecha:** Intermediate LP consumption = **scan-driven runtime decision**, nie pre-reserved. Operator na linii decyduje co w jakiej kolejności konsumować. System sugeruje FEFO, operator akceptuje lub override.

### 10.3 No inter-WO reservation

W P1 **nie ma** hard-lock między parent_wo.output_lp a child_wo. Rationale:
1. **WO interrupt/cancel** = zero cleanup — jeśli child_wo cancelled, parent's output LPs zostają `available`, nie potrzeba admin unreserve
2. **Out-of-order consumption** — naturalne — operator scanuje co chce kiedy chce
3. **Buffer flexibility** — intermediate LP na stock może być consumed przez **dowolny** WO z matching product requirements (nie hard-coded na specific downstream WO)
4. **Audit trail** — genealogy parent_wo_id → output LP → scan event → consumed by child_wo. Chronological, trivial to reconstruct.

### 10.4 Material availability check (soft hint)

04-PLANNING §8.6 revised: material availability dla wo_material.material_source='upstream_wo_output' wykonywany jako **projection**, nie reservation:
- Query: parent_wo.status → (a) COMPLETED → output LPs na stock w target warehouse → actual available qty; (b) IN_PROGRESS → projected qty at parent_wo.planned_end_date; (c) RELEASED — projected at parent_wo.planned_end_date + minor safety margin; (d) DRAFT — insufficient upstream planning → red flag
- Dashboard: 🟢 Green if projected available ≥120%, 🟡 Yellow 100-120%, 🔴 Red <100%
- Warning, **nie block** (configurable)

### 10.5 Scan-to-consume workflow (06-SCANNER-P1 contract)

**FR-WH-017:** Scanner endpoint `POST /api/warehouse/scanner/consume-to-wo`:

Input: `{wo_id, lp_id, qty_consumed, catch_weight_kg?, operator_id, session_id}`

Processing:
1. Validate: LP.status='available', LP.qa_status IN ('PASSED','RELEASED','COND_APPROVED'), WO.status IN ('RELEASED','IN_PROGRESS')
2. Product matching: LP.product_id must match WO.wo_materials.product_id (any row matches)
3. FEFO check:
   - System computes FEFO suggestion dla same product+warehouse
   - If picked_lp ≠ suggested_lp → insert `pick_overrides` row
   - Return response includes `override_warning=true` + reason required
4. Execute: stock_move `consume_to_wo`, update LP, update wo_material.consumed_qty += qty, insert lp_genealogy
5. Emit `outbox_events.lp.consumed` + `outbox_events.wo.material_consumed`

Response time target: <500ms.

### 10.6 Out-of-order example

Scenario: WO-A produced LP1 (10:00) + LP2 (11:00) + LP3 (12:00) — all stripped chicken PR123R, all available. WO-B downstream needs 100kg total.

Operator na linii WO-B:
- Scans LP2 first (bliższa ręki fizycznie) → consume 50kg → FEFO would suggest LP1 (earliest) → warning + confirm + reason 'physical_accessibility'
- Scans LP1 → consume 30kg
- Scans LP3 → consume 20kg

Genealogy preserves chronological scan order. Dashboard reports actual FEFO compliance: 33% (1 of 3 matched FEFO).

Scenariusz is fully supported — zero system friction, full audit trail.

### 10.7 Genealogy tracking

Per consume op, lp_genealogy row:
```
parent_lp_id = intermediate LP consumed
child_lp_id = NULL (consumption doesn't produce child LP; child_wo's output will be new LP linked via its own genealogy row)
operation_type = 'consume'
wo_id = child WO ID
quantity = consumed qty
context_jsonb = {"scanner_session": "...", "location_at_consume": "...", "fefo_compliant": true/false}
```

Forward trace: given RM LP → find all WOs that consumed it → their output LPs → downstream WOs → FA LPs → shipments.
Backward trace: given FA LP → producing WO → wo_materials consumed LPs → upstream WOs → RMs.

Depth ≤10 covered by recursive CTE <30s (§11).

### 10.8 Frontend/UX

| Komponent | Opis |
|---|---|
| ScannerConsumeScreen (06-SCANNER) | Scan LP → LP info + WO match preview → FEFO check → qty input → confirm |
| FEFOOverrideWarningModal | Inline — "Wybrałeś LP {X}, FEFO sugeruje {Y} (expiry {date}). Reason?" + confirm button |
| WOMaterialConsumptionPanel (04-PLAN WO detail) | Tab "Consumption log" — chronological scan events z LP ref, qty, FEFO-compliance flag |
| IntermediateBufferReport (14-MULTI dashboard widget) | Per production_line intermediate LPs available (buffer levels) |

### 10.9 Validation V-WH-INT

| ID | Rule | Severity |
|---|---|---|
| V-WH-INT-001 | Intermediate LP lifecycle identyczny z RM/FA (no special state) | Enforced by schema |
| V-WH-INT-002 | Zero auto-reservation dla material_source='upstream_wo_output' | Block reservation creation |
| V-WH-INT-003 | Scan-to-consume: LP.product_id matches WO.wo_materials.product_id | Block |
| V-WH-INT-004 | FEFO deviation → pick_overrides row + reason_code | Block w/o reason |
| V-WH-INT-005 | Genealogy parent_lp → consume event preserved (no gaps) | Block missing row |

---

## §11 — Lot Genealogy & Traceability

### 11.1 FSMA 204 / EU 178/2002 compliance foundation

**Requirement:** Forward trace (given lot → all downstream products/customers) + backward trace (given product → all upstream ingredients/suppliers) **within 24h** regulatory SLA (system target <30s).

**Data foundation:**
- `lp_genealogy` captures every split/merge/consume/output operation with parent_lp_id + child_lp_id + wo_id + timestamp
- `license_plates.batch_number` + `supplier_batch_number` + `wo_id` + `po_number` denormalized for fast traceback
- `stock_moves` chronologically track all LP location changes
- `grns` + `grn_items` capture receipt events with supplier linkage
- Cross-module: 11-SHIPPING `shipment_lines.lp_id` (P2) for downstream trace

### 11.2 Query patterns (Q4 — Postgres recursive CTE)

**Per Q4 C2 Sesja 2:** Postgres recursive CTE P1 (native, zero new dependencies, handles 100K LP with depth ≤10 in <30s). Graph DB (Neo4j-class) deferred → Phase 3 (WH-E18) jeśli scale exceeded.

**Forward trace** (given RM LP → downstream):
```sql
WITH RECURSIVE forward_trace AS (
  SELECT lp.id, lp.lp_number, lp.product_id, lp.wo_id, 0 AS depth
  FROM license_plates lp
  WHERE lp.id = $seed_lp_id AND lp.tenant_id = $tenant
  UNION ALL
  SELECT child.id, child.lp_number, child.product_id, child.wo_id, ft.depth + 1
  FROM forward_trace ft
  JOIN lp_genealogy g ON g.parent_lp_id = ft.id
  JOIN license_plates child ON child.id = g.child_lp_id
  WHERE ft.depth < 10
)
SELECT * FROM forward_trace ORDER BY depth, wo_id;
```

**Backward trace:** mirror query traversing parent_lp_id.

Index support: `lp_genealogy(parent_lp_id, child_lp_id)` composite + single-col.

### 11.3 Batch + supplier_batch tracking

**FR-WH-018:**
- `license_plates.batch_number` — internal batch (z grn_items lub wo output)
- `license_plates.supplier_batch_number` — supplier-assigned (per GRN line)
- Query: "find all LPs with supplier_batch_number='S-2026-04-15-XYZ'" → instant index lookup
- Downstream search: FA LP → BOM expand → RM lots used → supplier batches affected

### 11.4 EPCIS event generation (P2 consumer)

**FR-WH-019 (P2 — WH-E16):** EPCIS 2.0 events (ObjectEvent, AggregationEvent, TransformationEvent) generated **as consumer** z `outbox_events.lp.*` jako separate service. P1 scope = outbox events emission (format JSON), EPCIS XML/JSON-LD format conversion w P2.

Outbox event payload (P1):
```json
{"event": "lp.consumed", "lp_id": "...", "tenant_id": "...", "wo_id": "...", "qty": 50.0, "operator_id": "...", "at": "...", "location_id": "...", "genealogy_ref_id": "..."}
```

P2 consumer maps to EPCIS ObjectEvent with `bizStep=consuming`, `disposition=in_transit`, `epcList=[LP GS1 URI]`, `sourceList/destinationList`.

### 11.5 Traceability UI (P2 full, P1 API only)

| Komponent | Status |
|---|---|
| TraceabilityReportPage (12-REPORTING) | P2 — full forward/backward visualization |
| GenealogyTreeWidget (LP detail) | P1 — simple tree current+children, current+parents (depth 3) |
| RecallSearchModal | P2 — "given batch_number → LPs → WOs → customers/shipments" |

### 11.6 Validation V-WH-TRACE

| ID | Rule | Severity |
|---|---|---|
| V-WH-TRACE-001 | lp_genealogy non-orphan (parent lub child FK resolves) | Block insert |
| V-WH-TRACE-002 | No cycle in genealogy (DAG invariant) | Block (DB trigger) |
| V-WH-TRACE-003 | Forward trace depth ≤10 | Warn (operational limit) |
| V-WH-TRACE-004 | Traceability query <30s P95 | SLO alert |

---

## §12 — Shelf Life & Expiry Management

### 12.1 Expiry calculation

**FR-WH-020:** Per GRN line:
- If `grn_items.expiry_date` provided (GS1 scan or operator) → use directly
- Else: `expiry_date = grn_items.manufacture_date + product.shelf_life_days`
- `date_code_rendered = render(product.date_code_format, manufacture_date)` (per 03§9.2 — YYWW, YYYY-MM-DD, JJWW, YYJJJ formats)

Values copied to `license_plates.expiry_date`, `license_plates.manufacture_date`, `license_plates.date_code_rendered`.

### 12.2 Use_by vs Best_before gating (EU 1169/2011)

**FR-WH-021:** `license_plates.shelf_life_mode_snapshot` z product (use_by / best_before).

Gating rules:
- `use_by` mode + `expiry_date < CURRENT_DATE` → **hard block** all operations (pick/consume/ship). Requires manager override w/ reason + audit. Food safety — nie może być consumed.
- `best_before` mode + `expiry_date < CURRENT_DATE` → **soft warning** — quality declines ale bezpieczny. Pick allowed z warning + confirm. Operator decision (likely donation / secondary use).

UI indicator:
- Red strike-through LP label if expired use_by
- Orange faded if expired best_before
- Yellow if expiry ≤7d, light yellow ≤30d

### 12.3 Daily expiry cron

**FR-WH-022 (baseline D15):** Daily job (configurable `expiry_cron_schedule`, default `02:00 UTC`):
1. Query: `LP WHERE expiry_date < CURRENT_DATE AND status IN ('available','reserved') AND qa_status NOT IN ('QUARANTINED','FAILED')`
2. Per LP:
   - If `shelf_life_mode='use_by'`: `status → 'blocked'`, audit entry (auto-block reason)
   - If `shelf_life_mode='best_before'`: `status` unchanged, but warning flag set, dashboard alert
3. Insert `stock_moves` audit per change (move_type='quarantine'? lub new 'auto_block')
4. Emit `outbox_events.lp.expired` per affected LP
5. Notification email (via 02-SETTINGS §13 EmailConfig) do warehouse manager roles

P1 Forza cron = daily. Configurable per tenant (e.g., every 6h for high-turnover ops).

### 12.4 Warning tiers + alerts

**FR-WH-023:** Dashboard "Expiring Soon" widget:
- `expiry_warning_days_red` (default 7) — red alerts
- `expiry_warning_days_yellow` (default 30) — yellow alerts
- Query: `LP WHERE expiry_date BETWEEN today AND today+warning_days AND status='available'`
- Sort: expiry_date ASC
- Drill-down: per product, per batch, per supplier

### 12.5 Shelf_life_rules (customer/product min)

**FR-WH-024:** Tabela `shelf_life_rules` — minimum shelf life required per customer+product (downstream pattern dla 11-SHIPPING pick filter):
| customer_id | product_id | min_shelf_life_days | enforced | reason |

Pick filter: shipment dla customer_X → `LP.expiry_date ≥ today + rule.min_shelf_life_days`. Enforced block jeśli `enforced=true`, warning jeśli false.

P1: schema + API only. Full enforcement in 11-SHIPPING Phase 2.

### 12.6 Frontend/UX

| Komponent | Opis |
|---|---|
| ExpiringSoonWidget (dashboard) | Red/yellow tiers, sort by expiry ASC, drill-down |
| ExpiryConfigPanel (02-SETTINGS §10) | Set red/yellow days, cron schedule, per-tenant override |
| UseByBlockModal | If user tries operate expired use_by LP → manager override modal |
| ExpiredLPReport (12-REPORTING) | Monthly auto-report: expired LPs, write-off value |

### 12.7 Validation V-WH-EXP

| ID | Rule | Severity |
|---|---|---|
| V-WH-EXP-001 | expiry_date = manufacture + shelf_life_days (auto calc unless explicit) | Auto |
| V-WH-EXP-002 | use_by expired → hard block ops (manager override + audit) | Block |
| V-WH-EXP-003 | best_before expired → warning + confirm | Warn |
| V-WH-EXP-004 | Cron auto-block runs daily, audit log per change | SLO alert if missing |
| V-WH-EXP-005 | shelf_life_rules customer min enforced at ship (11-SHIPPING) | Block ship (P2) |

---

## §13 — Scanner Integration (contract dla 06-SCANNER-P1)

### 13.1 LP inventory query API

**FR-WH-025:** Endpoint `GET /api/warehouse/scanner/inventory`:

Query params:
- `warehouse_id` (required)
- `product_id` (optional — filter)
- `status` (optional, default 'available')
- `qa_status` (optional CSV, default 'PASSED,RELEASED')
- `location_id` (optional)
- `pagination: offset+limit` (default 50)

Response:
```json
{
  "items": [
    {"lp_id": "...", "lp_number": "LP001", "product_code": "PR5101R", "product_name": "...",
     "quantity": 120.0, "uom": "BOX", "catch_weight_kg": 184.0,
     "location_path": "forza.wh_a.zone_cold.bin_B3", "expiry_date": "2026-05-01",
     "qa_status": "PASSED", "batch_number": "B-2026-04-10", "reserved_for_wo_id": null}
  ],
  "total": 250, "offset": 0, "limit": 50
}
```

SLO: <200ms P95.

### 13.2 Barcode lookup endpoints

**FR-WH-026:**
- `GET /api/warehouse/scanner/lookup/lp/:barcode` — LP lookup (auto-detects prefix, LP_number, or GS1-128 with embedded SSCC)
- `GET /api/warehouse/scanner/lookup/location/:barcode` — location barcode (QR or Code128)
- `POST /api/warehouse/scanner/validate-barcode` — parse any barcode → return type + decoded

All return `<200ms P95` (barcode parsing <100ms dedicated service).

### 13.3 Scanner authentication (baseline D17)

**FR-WH-027:** Osobny mechanizm login dla skanerów:
- `POST /api/warehouse/scanner/login` — body: `{username, pin}` → response: `{session_token, expires_at}`
- PIN = 4-6 digit, stored hashed (bcrypt) separately from password (users.scanner_pin_hash)
- Session timeout: `scanner_idle_timeout_sec` (default 300s). Auto-logout on idle.
- PIN configurable via user profile (self-service) — first-time forced setup

### 13.4 LP lock protocol

Per §6.6 baseline D23:
- Pre-operation: scanner calls `POST /api/warehouse/scanner/lock-lp` → locks 5min OR returns conflict
- Post-operation (confirm or cancel): auto-release
- Timeout: 5min hard release (configurable `scanner_lock_timeout_sec`)

### 13.5 FEFO suggestion endpoint

**FR-WH-028:** `POST /api/warehouse/scanner/suggest-lp`:

Body: `{wo_id, wo_material_id, qty_needed, warehouse_id}` 
Response: sorted suggestions per rule `fefo_strategy_v1` (per 9.1) — top 5 ranked, operator sees best first.

### 13.6 Offline queue contract (P2 — WH-E15)

**Structure (P2):**
- IndexedDB local queue (max 100 transactions configurable)
- Each transaction: `{uuid, op_type, payload, created_at, synced_at, status}`
- Sync on reconnect: POST batch `/api/warehouse/scanner/sync-queue` → server processes sequentially, returns per-transaction status
- Conflict resolution: server-authoritative (if LP state changed, offline op rejected z reason → UI shows to operator)

### 13.7 Scanner FE screens (→ 06-SCANNER-P1)

Katalog screen codes dla 06-SCANNER-P1 (detail tam):
- SCN-010 Login
- SCN-020 Receive
- SCN-030 Move
- SCN-040 Putaway
- SCN-050 Pick (TO/WO)
- SCN-060 Split
- SCN-070 Merge
- SCN-080 Consume-to-WO (NEW v3.0 — intermediate cascade core)
- SCN-090 Offline Sync Indicator (P2)

### 13.8 Validation V-WH-SCAN

| ID | Rule | Severity |
|---|---|---|
| V-WH-SCAN-001 | Session token validated per request (HMAC + TTL) | Block 401 |
| V-WH-SCAN-002 | LP lock 5min auto-release | Auto-cleanup |
| V-WH-SCAN-003 | Consume-to-WO: LP qa_status in allowed set | Block |
| V-WH-SCAN-004 | PIN attempt rate limit (5 fails → 10min lockout) | Block |
| V-WH-SCAN-005 | Offline queue max 100 transactions (P2) | Block + alert |

---

## §14 — Warehouse Dashboard & KPIs

### 14.1 Dashboard content

**FR-WH-029:**

**KPI cards (top row):**
- Total LP (active: status IN available/reserved)
- Total SKU unique
- **Inventory Value GBP** (baseline D19: SUM(LP.qty × product.cost) per warehouse — manager/admin role only)
- Expiring ≤7d count (red)
- Expiring ≤30d count (yellow)
- QC Hold count (PENDING + HOLD)
- Blocked LP count (status='blocked')
- Intermediate Buffer count (item_type='intermediate' + status='available')

**Alerts (middle section):**
- Expired LPs (auto-blocked today + warning)
- QC Hold >48h (needs attention)
- Low stock per product (if threshold configured)
- Cycle count variance (P2) pending review
- Scanner lock stuck (>5min inactive)
- D365 drift (z 04-PLAN) — unresolved supplier mismatch

**Recent activity feed:**
- Last 50 stock_moves / lp_genealogy events — type, LP, user, timestamp
- Filter by warehouse

**Capacity (P2):**
- Location capacity heatmap (zone level via ltree roll-up)
- Per-warehouse total capacity utilization %

### 14.2 Performance

**FR-WH-030:**
- Cache: Redis 1min TTL per (tenant, warehouse, user) key
- Pre-compute inventory value hourly (materialized view refresh) — SLO <1s dashboard load
- Drill-down queries use indexes (product, location ltree path)

### 14.3 KPI computation

| KPI | Query pattern |
|---|---|
| Total LP | `COUNT(*) WHERE status IN ('available','reserved') AND warehouse_id=X` |
| Inventory value | `SUM(lp.qty × items.cost) WHERE status IN ('available','reserved')` |
| Expiring ≤30d | `COUNT(*) WHERE expiry_date BETWEEN today AND today+30 AND status='available'` |
| QC Hold | `COUNT(*) WHERE qa_status IN ('PENDING','HOLD')` |
| Override rate 7d | `COUNT(pick_overrides WHERE created_at > now-7d) / COUNT(total_picks same window)` |
| Intermediate buffer | `COUNT(*) WHERE item_type_snapshot='intermediate' AND status='available'` |

### 14.4 Frontend/UX

| Komponent | Opis |
|---|---|
| DashboardPage (`/warehouse/dashboard`) | KPI cards row + Alerts panel + Recent Activity feed + Capacity heatmap (P2) |
| InventoryValueTile | Drill-down: per product top 20, per warehouse, trend 30d |
| ExpiringWidget | Red/yellow tiers, click → ExpiringLPsPage filtered |
| AlertsPanel | Per severity, click → context page (LP, WO, cycle count) |
| RecentActivityFeed | Infinite scroll, filter type (split/merge/move/consume/output) |

---

## §15 — Label Printing + GS1 + Pallets

### 15.1 ZPL label generation

**FR-WH-031:** ZPL (Zebra Programming Language) 4×6 inch templates.

**LP label content:**
- Barcode (Code 128 z LP number)
- QR code (z LP URL: `https://{tenant}.monopilot.io/lp/{lp_id}`)
- Product code + name + item type
- Qty + UoM + catch weight (if applicable)
- Batch + supplier batch
- Expiry date + warning (red text if ≤7d)
- Location + pallet (if applicable)
- Date code (per product.date_code_format)
- Operator + date (produced)

Endpoint: `POST /api/warehouse/license-plates/:id/print-label` — generates ZPL + sends via TCP to printer IP:9100 (configurable in warehouse_settings).

**Pallet label (P2):**
- SSCC-18 barcode (§15.3)
- Pallet number + LP count + total weight
- Pack date + ship date (if assigned)

**Label copies:** `warehouse_settings.label_copies_default` (default 1) — per-operation override.

### 15.2 GS1 GTIN-14 / GS1-128 / SSCC-18

**FR-WH-032:**

**GTIN-14:** Identifies product (14-digit). Set na `products.gtin` (03§6). Print na LP label + barcode scan returns product.

**GS1-128:** Application Identifiers:
- (01) GTIN-14
- (10) Lot/Batch
- (17) Expiry YYMMDD
- (11) Production Date YYMMDD
- (37) Count of Trade Units
- (310x) Net Weight kg (x = decimal position indicator)
- (21) Serial (SSCC link if applicable)

Parser service: `barcode-parser-service.ts`. FNC1-separated OR parentheses format — both supported.

**SSCC-18 (P2 dla pallets):**
- 18-digit: `{extension_digit(1)}{GS1_company_prefix(6-9)}{serial(8-11)}{check(1)}`
- Extension digit: `0` standard
- Company prefix: per tenant (02-SETTINGS gs1_config)
- Check digit: mod-10 standard algorithm

### 15.3 Print-on-receipt

**FR-WH-033:** `warehouse_settings.print_label_on_receipt=true` → post-GRN complete, enqueue print job per created LP to printer (default: warehouse's primary printer, configurable per location).

Transparent UX — no additional click. Queue status in background (pending/printed/failed) per label.

### 15.4 Printer config (2-SETTINGS reference)

Przez 02§11 D365_Constants pattern — lekka tabela `printer_config`:
- printer_id (PK)
- warehouse_id FK
- name, ip, port (default 9100), label_template_id
- is_default per warehouse (partial unique)

### 15.5 Pallets (P2 — WH-E10)

**FR-WH-034 (P2):** `pallets` + `pallet_items` tables:
- `pallets(id, tenant_id, sscc_18, status[open/closed/shipped], ship_date, lp_count_cached, weight_cached, warehouse_id)`
- `pallet_items(pallet_id, lp_id, added_at)`

Operations:
- Create pallet → SSCC-18 auto-generate
- Add LP to pallet → `pallet_items` row + update LP.pallet_id + re-compute pallet.weight = SUM(LP.catch_weight_kg) + lp_count
- Remove LP → reverse
- Pallet move → all LPs move together (batch stock_moves)
- Ship pallet → all LPs → `shipped` status

Dual UoM label (baseline D21): "120 BOX / 184 KG" — operator enters primary, system computes secondary.

### 15.6 Frontend/UX

| Komponent | Opis |
|---|---|
| PrintLabelModal | Preview (rendered ZPL) + copies + printer selector |
| AutoPrintQueue | Background tasks w dashboard indicator |
| PalletListPage (P2) | Lista pallets, SSCC barcode, LP count, weight |
| AddLPtoPalletModal (P2) | Scan pallet + scan LPs + add |

### 15.7 Validation V-WH-LABEL

| ID | Rule | Severity |
|---|---|---|
| V-WH-LABEL-001 | GTIN-14 check digit valid | Block |
| V-WH-LABEL-002 | SSCC-18 check digit valid (P2) | Block |
| V-WH-LABEL-003 | Printer online check przed send | Block + retry |
| V-WH-LABEL-004 | Label copies 1-10 range | Block |
| V-WH-LABEL-005 | ZPL template valid (linter) | Block template save |

---

## §16 — Settings + Build Sequence + Open Questions + References + Changelog

### 16.1 warehouse_settings (toggles tabelka)

| Setting | Default | Opis | Marker |
|---|---|---|---|
| auto_generate_lp_number | true | Auto-numbering LP | [UNIVERSAL] |
| lp_number_prefix | 'LP' | Prefix | [FORZA-CONFIG] |
| lp_number_sequence_length | 8 | Padded digits | [UNIVERSAL] |
| allow_manual_lp_number | false | Custom LP numbers | [UNIVERSAL] |
| require_qa_on_receipt | true | QA PENDING initial | [UNIVERSAL] |
| default_qa_status | 'PENDING' | Init QA na GRN | [UNIVERSAL] |
| allow_over_receipt | false | Over-receipt control | [UNIVERSAL] |
| over_receipt_tolerance_pct | 0 | Tolerance % | [UNIVERSAL] |
| require_batch_on_receipt | true | Batch mandatory per row | [FORZA-CONFIG→UNIVERSAL] |
| require_expiry_on_receipt | true | Expiry mandatory per row | [FORZA-CONFIG→UNIVERSAL] |
| require_supplier_batch | false | Supplier batch mandatory | [UNIVERSAL] |
| expiry_warning_days_red | 7 | Red alert threshold | [UNIVERSAL] |
| expiry_warning_days_yellow | 30 | Yellow alert | [UNIVERSAL] |
| expiry_cron_schedule | '0 2 * * *' | Daily 02:00 UTC | [FORZA-CONFIG→UNIVERSAL] |
| enable_fefo | true | FEFO default | [UNIVERSAL] |
| enable_fifo_fallback | true | FIFO for no-expiry | [UNIVERSAL] |
| allow_fefo_override | true | Operator override | [UNIVERSAL] |
| require_override_reason | true | reason_code na pick_overrides | [UNIVERSAL] |
| enable_gs1_scanning | true | GS1-128 parse | [UNIVERSAL] |
| enable_catch_weight | true | Catch weight | [FORZA-CONFIG→UNIVERSAL] |
| enable_dual_uom | true | Primary + secondary weight | [FORZA-CONFIG→UNIVERSAL] |
| enable_location_capacity | false | Capacity check (P2) | [EVOLVING] |
| enable_location_zones | true | Zone-level ltree queries | [UNIVERSAL] |
| enable_transit_location | true | Transit phys location | [UNIVERSAL] |
| enable_split_merge | true | Split/merge LP | [UNIVERSAL] |
| merge_cross_location | false | Allow merge różne locations | [UNIVERSAL] |
| merge_expiry_tolerance_days | 1 | Tolerance dla merge | [UNIVERSAL] |
| enable_pallets | false | Pallets (P2) | [EVOLVING] |
| enable_asn | false | ASN (P2) | [EVOLVING] |
| enable_cycle_count_full | false | Cycle counts (P2) | [EVOLVING] |
| enable_scanner_offline | false | Offline queue (P2) | [EVOLVING] |
| scanner_idle_timeout_sec | 300 | Auto-logout | [UNIVERSAL] |
| scanner_lock_timeout_sec | 300 | LP lock auto-release | [UNIVERSAL] |
| scanner_sound_feedback | true | Audio feedback | [UNIVERSAL] |
| scanner_vibration | true | Mobile vibration | [UNIVERSAL] |
| print_label_on_receipt | true | Auto-print | [FORZA-CONFIG→UNIVERSAL] |
| label_copies_default | 1 | Copies | [UNIVERSAL] |
| default_printer_id | NULL | Per warehouse | [UNIVERSAL] |
| archival_retention_months | 12 | LP archival | [UNIVERSAL] |
| dashboard_cache_ttl_sec | 60 | Redis TTL | [UNIVERSAL] |

### 16.2 Build sequence 05-WAREHOUSE-a..d

Per 00-FOUNDATION §4.2 batch-writing + sequential-implementation approach.

| Sub-module | Scope | Est. sesji |
|---|---|---|
| **05-WAREHOUSE-a** | LP Core (lifecycle rule DSL, split/merge, genealogy, locking, dual UoM, ext cols) + Locations setup consumer z 02§12 + Dashboard read-only shell | 5-6 |
| **05-WAREHOUSE-b** | GRN from PO + GRN from TO + over/under-receipt + multi-LP per line (Q1) + GS1-128 scan parser + transit location + outbox grn.completed | 4-5 |
| **05-WAREHOUSE-c** | Stock moves + put-away manual + FEFO/FIFO DSL rule + reservations consumer dla RM root (Q6) + per-product picking_strategy + override audit | 4-5 |
| **05-WAREHOUSE-d** | Intermediate LP handling (scan-to-consume) + expiry cron + labels ZPL + dashboard KPIs + scanner contract APIs | 3-4 |

**Total:** 16-20 sesji impl est.

**Dependencies:**
- 05-a wymaga 02-SETTINGS-e complete (rule registry dla lp_state_machine_v1)
- 05-b wymaga 04-PLANNING-a complete (PO tables)
- 05-c wymaga 04-PLANNING-c complete (WO tables + wo_material_reservations schema)
- 05-d wymaga 04-PLANNING-c + 03-TECHNICAL-b (shelf_life + date_code_format)

### 16.3 Open questions (carry-forward)

| OQ | Question | Decision timeline |
|---|---|---|
| **OQ1** | Archival strategy — partition vs separate archive schema? | Przed implementation (build 05-a), default partition by status |
| **OQ2** | Scanner PIN complexity policy — 4 vs 6 digits, uppercase allowed? | Przed build 05-a, domain = 02-SETTINGS §14 security policy |
| **OQ3** | Cycle count variance threshold for manager approval — absolute vs % based? | P2 (WH-E14 build) |
| **OQ4** | EPCIS event buffering — real-time per op vs batch per hour dla performance? | P2 (WH-E16 build) |
| **OQ5** | Pallet SSCC range allocation — per tenant prefix block or central pool? | P2 (WH-E10 build) |
| **OQ6** | Put-away rules priority conflict resolution — highest priority wins or fallback chain? | P2 (WH-E12 build) |
| **OQ7** | Shelf_life_rules customer override — hard block vs soft warn default? | P2 (11-SHIPPING build integration) |
| **OQ8** | Offline queue max size — 100 per user or global per device? | P2 (WH-E15 build) |

### 16.4 Validation index

**37 validation rules across 7 families:**
- V-WH-LP (9 rules) — LP Core
- V-WH-GRN (8 rules) — Receiving
- V-WH-MOV (6 rules) — Stock moves
- V-WH-FEFO (6 rules) — Pick strategy + reservations
- V-WH-INT (5 rules) — Intermediate LP handling
- V-WH-TRACE (4 rules) — Genealogy
- V-WH-EXP (5 rules) — Expiry management
- V-WH-SCAN (5 rules) — Scanner integration
- V-WH-LABEL (5 rules) — Label/GS1

### 16.5 References

**Cross-module dependencies:**
- **00-FOUNDATION** — §6 principles (schema-driven, rule engine, multi-tenant), §11 regulatory roadmap (FSMA 204, EU 1169/2011, BRCGS), §12 outbox pattern, R1-R15 decisions
- **02-SETTINGS** v3.0 — §7 rule registry (lp_state_machine_v1, fefo_strategy_v1), §8 reference tables, §9 L2 variation, §10 feature flags, §11 D365 Constants (ForzDG default warehouse), §12 infrastructure (warehouses, locations ltree, printers), §13 EmailConfig
- **03-TECHNICAL** v3.0 — §6 item types (intermediate handling, PR code format), §7 BOM co-products + outputs, §8 catch weight + GS1 AIs, §9 shelf life + date_code_format + use_by/best_before, §10 allergen snapshot for pick, §13 D365 item/BOM sync
- **04-PLANNING-BASIC** v3.1 (REVISED after C2 Sesja 2 Q6) — §5.10 reservations scope RM root only, §6.4 PO→GRN handoff, §7.5 TO→GRN handoff, §8.4 cascade DAG (intermediate always to_stock), §8.5 disposition (to_stock only P1), §8.6 material availability projection, §9 reservation hard-lock RM root only, §12.3 FEFO suggestion source
- **06-SCANNER-P1** (next Sesja 3) — consumer 05 APIs: LP inventory, barcode lookup, lock protocol, FEFO suggestion, consume-to-WO endpoint, auth username+PIN
- **08-PRODUCTION** (C3) — consumer output LP creation, allergen changeover check, consume_to_wo scan events
- **09-QUALITY** (C4) — owner qa_status enum + transition rules, inspection triggers consumed by 05 gating
- **11-SHIPPING** (C4) — downstream LP consumer, SSCC-18, shelf_life_rules customer enforcement
- **12-REPORTING** (C5) — downstream traceability reports, EPCIS consumer
- **14-MULTI-SITE** (C5) — cross-site TO extended
- **15-OEE** (C5) — inventory KPI contributors

**ADRs applied:**
- ADR-001 License Plate Inventory — atomowa jednostka
- ADR-002 BOM snapshot pattern — item_type_snapshot na LP
- ADR-003 Multi-tenancy RLS — tenant_id wszędzie
- ADR-004 GS1 Barcode compliance — GTIN/GS1-128/SSCC
- ADR-005 FEFO/FIFO strategy — rule registry deploy
- ADR-006 Scanner-first — dedicated /scanner routes
- ADR-008 Audit trail — lp_genealogy + stock_moves + pick_overrides
- ADR-013 RLS pattern — users.org_id source
- ADR-015/018 Service Layer + API errors
- ADR-019 Transfer Order state machine
- ADR-028 Schema-driven extensions — ext_jsonb na LP/GRN/stock_moves
- ADR-029 Rule engine DSL — lp_state_machine_v1, fefo_strategy_v1, cond_approved_gating_v1
- ADR-030 Configurable depts — warehouse-dept split support
- ADR-031 Schema variation per org — L1-L4 tiers

**Regulatory roadmap** (per 00§11):
| Reg | Scope | 05-WH obligation |
|---|---|---|
| **FSMA 204** (US) | Food Traceability Rule | lp_genealogy + critical tracking events, <24h forward/backward trace |
| **EU 178/2002** | Food law traceability | Full lot genealogy |
| **EU 1169/2011** | Food info to consumer | use_by vs best_before distinction, label allergens (cross-ref 03§10) |
| **GS1 Digital Link** | 2D barcodes standard | GTIN-14, GS1-128 AIs |
| **GS1 Global Traceability** | End-to-end | SSCC-18, EPCIS (P2) |
| **BRCGS v9** | Retail food safety | Digital records (audit trail 100%) |

### 16.6 Changelog

**v3.0 (2026-04-20 — Phase C2 Sesja 2 writing)**
- Full rewrite from v2.1 baseline (850 → ~1600 lines)
- 16 sekcji (Phase B/C template aligned)
- Kluczowa decyzja Q6 C2 Sesja 2: **intermediate LP always to_stock P1** (direct_continue deferred → P2 WH-E17)
- Q1 clarified multi-LP per GRN line: operator-entered per-row batch/expiry/pallet (baseline D16 explicit)
- Q2 confirmed 3-level Forza location default (warehouse→zone→bin), system supports 2-5 via ltree
- Q3: per-product picking_strategy + per-pick runtime override (both patterns)
- Q4: Postgres recursive CTE P1, graph DB → P3 (WH-E18)
- Q5: cycle counts basic adjustment P1, full → P2 (WH-E14)
- Q6: intermediate LP = same lifecycle as RM/FA, zero inter-WO locking, scan-to-consume Q6B pattern (operator confirm warning on FEFO deviation)
- Q7: outbox events P1, EPCIS format P2 consumer (WH-E16)
- New §10 Intermediate LP Handling (scan-to-consume, genealogy, FEFO override warning)
- New §11 Lot Genealogy & Traceability (FSMA 204 foundation, recursive CTE)
- New §13 Scanner Integration (consumer contract dla 06-SCANNER-P1)
- Updated §9 Reservations scope narrowed to RM root only (cascade with 04-PLAN v3.1 revision)
- Added schema-driven ext_jsonb na LP (ADR-028 L3)
- Workflow-as-data: lp_state_machine_v1 DSL rule w 02§7 registry (ADR-029)
- Markers coverage table (§4.5)
- Cross-PRD consistency: 04-PLANNING v3.1 revision synchronized (see 04-PLANNING §16.6 changelog)

**v2.1 (2026-02-18)** — baseline with D1-D23 decisions, 17 epics, 30 FR, 12 DB tables, pre-Phase-D

---

_PRD 05-WAREHOUSE v3.0 — 8 epików P1 + 9 P2 + 3 P3, 37 FR, 11 tabel DB core, 37 validation rules. Phase D aligned (6 principles + 15-module renumbering). Cross-PRD consistency enforced (04-PLANNING v3.1 cascade revision). Intermediate LP handling = core v3.0 innovation (scan-to-consume, zero inter-WO locking). FSMA 204 + EU 178/2002 + GS1 foundation. Build sequence 4 sub-modules 05-a..d (16-20 sesji impl est.)._

_Data: 2026-04-20 | Autor: Monopilot Phase C2 Sesja 2_

# PRD 04-PLANNING-BASIC — Monopilot MES

**Wersja**: 3.1 | **Data**: 2026-04-20 | **Status**: Phase C2 Sesja 2 revision (Q6 C2 Sesja 2 disposition scope narrowed)
**Moduł**: #4 w Module Map (per 00-FOUNDATION §4), deps: 01-NPD + 02-SETTINGS + 03-TECHNICAL
**Primary reality sources**: PLD v7 Main Table (post-NPD downstream flow), Builder_FA5101.xlsx (D365 WO targets), MES-TRENDS-2026 §3/§7/§9

> **v3.1 revision note (2026-04-20 C2 Sesja 2):** Intermediate cascade disposition scope narrowed — `to_stock` **only** w P1 (direct_continue + planner_decides **wycofane z P1**, deferred → P2 za real demand). Reservation hard-lock scope narrowed to **RM root only** (material_source='stock'). Intermediate cascade LPs flow: parent_wo output → put-away → available on stock → Scanner scan-to-consume by child_wo. Cross-PRD consistency z 05-WAREHOUSE v3.0 §10 (Q6 revised). Affected sections: §5.10, §8.5, §8.6, §9.2, §9.4. Full changelog §16.6.

---

## §1 — Executive Summary

Moduł **04-PLANNING-BASIC** (M04) to kręgosłup operacyjny MES — zarządza lifecycle'em **PO** (Purchase Orders, zakupy), **TO** (Transfer Orders, transfery wewnętrzne) oraz **WO** (Work Orders, zlecenia produkcyjne). Łączy **popyt** (D365 SO, ręczne zamówienia, Phase 2 forecasting) z **podażą** (inventory, capacity), generując harmonogram produkcji i plan zaopatrzenia bez złożoności enterprise ERP.

### Core scope v3.0

- **PO** — 3-step flow, smart defaults z supplier master, bulk create, approval workflow, D365 supplier pull consumer [INTEGRATIONS stage 1]
- **TO** — intra-site state machine (ADR-019), partial shipments, LP pre-selection
- **WO** — BOM snapshot (ADR-002), routing copy, material availability, hard-lock reservations, **intermediate cascade DAG** (Phase D #19 N+1 — Apex core, nie flag-gated), **co-products/byproducts** output, release-to-warehouse → Scanner M06 handoff
- **Allergen-aware sequencing** [R3] — basic heuristic P1 (group by family), full optimizer → 07-PLANNING-EXT
- **D365 SO trigger** — pull sales orders → draft WO gen (feature flag `integration.d365.so_trigger.enabled`)
- **Workflow-as-data** — state machines ADR-007/ADR-019 jako DSL rules w 02-SETTINGS §7 registry (dev-authored, admin read-only per Q2 C1 decision)
- **Dashboard + Settings** — KPI, alerts, configurable status display (names/colors only)

### Kluczowa decyzja Phase D #19 (intermediate cascade core)

Apex **tropi intermediate steps jako storable LP** — każdy process step produkuje output, który może być put-away do magazynu lub continue do następnego WO. **Catalog-driven, nie flag-gated:**

```
Catalog ma intermediate items → BOM N-warstwowy → Planning generuje N+1 WO (DAG)
Catalog prosty (brak intermediate) → BOM 1-warstwowy → Planning generuje 1 WO
```

Multi-tenant friendly bez config switches — wynikowa liczba WO = liczba warstw BOM explode.

### Primary consumer Phase C1 foundation

- **02-SETTINGS §6** — schema-driven ext cols dla PO/TO/WO (per ADR-028, L3 `ext_jsonb`)
- **02-SETTINGS §7** — rule registry dla WO/TO/PO state machines + allergen sequencing rules
- **02-SETTINGS §9** — multi-tenant L2 dept variations (per ADR-030 config depts) wpływają na WO resource matrix
- **02-SETTINGS §11** — D365 Constants (Apex 5 consts: FNOR/FOR100048/ApexDG/FinGoods/FProd01) w PO/WO metadata
- **02-SETTINGS §12** — warehouses, production lines, machines z infrastructure registry
- **03-TECHNICAL §5-§6** — items (5 types: rm/intermediate/fa/co_product/byproduct), product master, PR<digits><letter> intermediate codes
- **03-TECHNICAL §7** — BOM versioning, co-products allocation_pct, BOM Generator N+1 output
- **03-TECHNICAL §8** — catch weight (GS1 AI 3103/3922) dla PO/WO qty tracking
- **03-TECHNICAL §10** — allergens cascade + §10.5 cross-contamination risk matrix → allergen-aware sequencing input
- **03-TECHNICAL §13** — D365 Integration workers (pull items/BOM/suppliers, push WO confirmations)

### Build position

Moduł **#4 z 15** w build order (per 00-FOUNDATION §4.2). Build startuje po 01+02+03 impl complete. Rozbicie na 4 sub-modules 04-PLANNING-a..d (18-23 sesji impl est.).

---

## §2 — Objectives & Success Metrics

### Cel główny

Dostarczyć wydajne, intuicyjne narzędzie planistyczne, które eliminuje arkusze, D365 manual copy-paste i spreadsheet-driven scheduling, obsługując pełny lifecycle **PO → TO → WO → release-to-warehouse** z respektowaniem intermediate cascade DAG, allergen contamination rules i D365 integration.

### Cele szczegółowe

1. **PO Fast Flow** — 3-step creation (supplier → products+qty → submit), smart defaults (currency/tax/payment_terms/price/lead_time) auto-fill z supplier master
2. **WO generation z DAG cascade** — BOM explode produkuje N+1 WO dla FA z intermediate warstwami, kolejność topological, inter-WO dependencies enforced
3. **Material hard-lock reservation** — LP zarezerwowany na WO = niemożliwy na inne WO równolegle, auto-release on cancel/consumption
4. **Allergen-aware scheduling** — minimize changeover cost przez grupowanie WO po allergen family (basic heuristic P1)
5. **D365 SO pull trigger** — sales orders z D365 → auto draft WO (nightly + on-demand)
6. **Configurable workflow read-only** — state machines jako DSL rules w rule registry, admin widzi + audyt + dry-run, dev PR authors changes

### Metryki sukcesu

| Metryka | Cel | Pomiar |
|---------|-----|--------|
| PO creation time (20 linii) | < 5 min | UX stopwatch |
| PO with auto-filled supplier defaults | > 80% | Analytics |
| WO creation time z BOM snapshot (single layer) | < 1 s P95 | APM |
| WO creation time z intermediate cascade (3 layers DAG) | < 3 s P95 | APM |
| WOs z pełną rezerwacją materiałów | > 90% | Report |
| Plan accuracy (planned_qty vs actual_qty) | > 95% | WO compare |
| On-time delivery PO | > 85% | PO tracking |
| D365 SO pull latency (pull → draft WO visible) | < 10 min | Outbox metrics |
| Allergen changeover reduction (sequencing on vs off) | > 30% | A/B test |
| Dashboard load time P95 | < 1 s | APM |
| WO DAG cycle detection (false positive rate) | < 0.1% | Cycle guard test suite |

### System SLO

| SLO | Target |
|-----|--------|
| PO list API P95 | < 500 ms |
| WO creation API P95 (single layer) | < 1 s |
| WO creation API P95 (3-layer cascade) | < 3 s |
| Bulk PO (100 lines) | < 5 s |
| TO ship/receive API P95 | < 800 ms |
| Reservation hard-lock check (single LP) | < 100 ms |
| Allergen sequencing recompute (50 WOs queue) | < 2 s |

---

## §3 — Personas & RBAC Overview

### Primary personas

| Rola | Scope PLANNING | Key operations |
|------|-----------|----------|
| **Purchaser** (Kupiec) | Suppliers + PO | CRUD supplier master, create/submit PO, supplier negotiations, delivery tracking |
| **Planner** (Planista) | WO + TO + Scheduling | Create WO z BOM, approve material plan, set priorities, TO routing między magazynami |
| **Production Manager** | WO release + Dashboard | Release WO do production + to warehouse, review dashboard, override pause reasons, approve overproduction |
| **Warehouse Operator** | TO/PO operational (delegated) | GRN w 05-WAREHOUSE (receive PO lines), TO ship/receive z LP |
| **NPD Manager (Jane — APEX)** | WO post-NPD handoff | Visible jako source_of_demand dla WO tworzonych z 01-NPD finalized articles |
| **Finance Lead** | WO close | Post-completion WO → Finance 10 close (Phase 2, stub P1) |
| **Admin** | Settings | Planning Settings CRUD (numeration, approval thresholds, status display) |

### Permission surface

- `planning.supplier.*` — CRUD suppliers, supplier_products assignments
- `planning.po.*` — CRUD PO, submit, approve, close
- `planning.po.approve` — separate permission (role-based threshold)
- `planning.to.*` — CRUD TO, ship, receive (intra-site)
- `planning.wo.*` — CRUD WO, release, pause, complete
- `planning.wo.release` — separate (may require gate checks)
- `planning.wo.override` — supervisor override guards (logged)
- `planning.wo.release_to_warehouse` — trigger Scanner visibility
- `planning.dashboard.view` — read dashboard
- `planning.settings.edit` — admin only
- `integration.d365.so_trigger.run` — manual trigger D365 SO pull (default = scheduled nightly)

### RBAC-Multi-tenant integration

- RLS via `tenant_id` na wszystkich planning tables (per 00-FOUNDATION §5, ADR-003)
- Permissions per `tenant_role_mapping` w 02-SETTINGS §15 (security)
- Row-level permission delegation: supplier visibility może być per-site w Phase 3 (multi-site)

---

## §4 — Scope

### 4.1 In Scope — Phase 1 (MVP)

| Obszar | Priorytet | Marker |
|--------|-----------|--------|
| Supplier master CRUD, supplier-product assignments, default supplier per product | Must Have | [UNIVERSAL] |
| PO 3-step create, smart defaults, bulk create, approval workflow | Must Have | [UNIVERSAL] |
| PO status lifecycle (draft → closed) z configurable status display | Must Have | [UNIVERSAL] |
| PO D365 supplier pull consumer (03-TECHNICAL §13 one-way pull) | Must Have | [LEGACY-D365] |
| TO CRUD z liniami, intra-site, state machine ADR-019 | Must Have | [UNIVERSAL] |
| TO partial shipments, LP pre-selection | Should Have | [UNIVERSAL] |
| WO CRUD z BOM snapshot ADR-002, routing copy, material scaling | Must Have | [UNIVERSAL] |
| WO state machine ADR-007 (DRAFT→RELEASED→IN_PROGRESS→ON_HOLD↔IN_PROGRESS→COMPLETED→CLOSED+CANCELLED) | Must Have | [UNIVERSAL] |
| **WO intermediate cascade DAG** — catalog-driven N+1 generation, wo_dependencies topological sort | Must Have | [UNIVERSAL] (Apex core) |
| **WO co-products/byproducts outputs** — wo_outputs tabela z allocation_pct z BOM | Must Have | [UNIVERSAL] |
| WO material availability check (G/Y/R), hard-lock reservation on LP | Must Have | [UNIVERSAL] |
| WO rework exception (is_rework=true) — bez BOM, manual materials | Must Have | [UNIVERSAL] |
| WO release-to-warehouse → Scanner M06 visibility | Must Have | [UNIVERSAL] |
| **Allergen-aware WO sequencing** — basic heuristic P1 (group by family) | Should Have | [UNIVERSAL] |
| **D365 SO trigger** — pull nightly + on-demand → draft WO generation | Must Have | [LEGACY-D365] |
| **Meat_Pct multi-comp aggregation** — Phase D #14, comma-sep from BOM expand | Must Have | [APEX-CONFIG → UNIVERSAL] |
| Planning Dashboard — KPI cards, alerts, upcoming orders, cache 1min | Should Have | [UNIVERSAL] |
| Planning Settings — PO/TO/WO config, numeracja, approval rules, status display | Must Have | [UNIVERSAL] |
| **Workflow-as-data integration** — state machines jako DSL rules w 02-SETTINGS §7 registry | Must Have | [UNIVERSAL] |
| Outbox events dla PO/TO/WO state transitions | Must Have | [UNIVERSAL] |
| Schema-driven ext cols dla PO/TO/WO (ADR-028 L3 `ext_jsonb`) | Must Have | [UNIVERSAL] |
| Gantt chart — widok harmonogramu WO per linia/maszyna | Could Have | [UNIVERSAL] |

### 4.2 In Scope — Phase 2 (post-MVP)

| Obszar | Uzasadnienie |
|--------|--------------|
| Demand forecasting (Prophet MVP, MES-TRENDS §6.1) | Wymaga danych z produkcji 3+ mies. |
| MRP/MPS basic calculation engine | Złożoność vs time-to-market |
| Auto-replenishment rules (reorder points) | Wymaga safety stock management |
| PO templates + blanket POs | Convenience feature |
| Bulk CSV import PO/WO (ADR-016) | Post-MVP tooling |
| PO email notifications (Resend / SendGrid) | Phase 2 messaging |
| Full allergen-aware optimizer (weighted cost/time) | Przechodzi do 07-PLANNING-EXT |
| Finite-capacity scheduling engine | 07-PLANNING-EXT scope |
| WO auto-generation z forecast | Wymaga forecast MVP |

### 4.3 In Scope — Phase 3 (Enterprise)

- Approved Supplier List (ASL), Supplier Quality Management, scorecards, audits (M09 Quality link)
- EDI EDIFACT / Peppol (→ INTEGRATIONS stage 3, C4)
- VMI Supplier Portal
- Advanced capacity analytics, digital twin scheduling (MES-TRENDS §1 Phase 3 — MDPI 2025 bakery case)

### 4.4 Exclusions (nigdy w 04-PLANNING-BASIC)

- Pełna księgowość (GL/AR/AP) — integracja z 10-FINANCE (cost roll) + Comarch/Sage external
- Customer order management — 11-SHIPPING (M11)
- HR/workforce scheduling — osobna domena
- Transport management — 3PL integration w Phase 3
- Warehouse operations (put-away, pick, count) — 05-WAREHOUSE (M05)
- Scanner UX — 06-SCANNER-P1 (M06)
- Production execution (start/pause/complete material consumption) — 08-PRODUCTION (M08)

### 4.5 Markers coverage

| Marker | W obrębie 04-PLANNING-BASIC |
|--------|------------------------------|
| [UNIVERSAL] | 85% content — PO/TO/WO state machines, BOM snapshot, DAG cascade, hard-lock, dashboard |
| [APEX-CONFIG] | ~5% — Meat_Pct multi-comp semantics, D365 Apex consts integration (FNOR/ApexDG/FProd01) |
| [EVOLVING] | ~5% — allergen sequencing heuristic (→ full optimizer 07), finite-capacity stub (→ engine 07) |
| [LEGACY-D365] | ~5% — D365 SO trigger, supplier pull consumer, WO confirmations push handoff do 03-TECHNICAL §13 |

---

## §5 — Entity Model

### 5.1 Tabele core (13 entities)

```
suppliers
supplier_products
purchase_orders
po_lines
transfer_orders
to_lines
to_line_lps
work_orders
wo_materials
wo_operations
wo_outputs                  ← NEW v3.0 (co-products + byproducts + primary)
wo_dependencies             ← NEW v3.0 (DAG edges dla intermediate cascade)
wo_material_reservations
wo_status_history
planning_settings
```

### 5.2 suppliers

| Kolumna | Typ | Opis |
|---------|-----|------|
| id | UUID PK | |
| tenant_id | UUID NOT NULL | RLS key |
| site_id | UUID NULL | Multi-site prep (M14) |
| code | VARCHAR(50) UNIQUE per tenant | Supplier code |
| name | VARCHAR(255) NOT NULL | Display name |
| address_line1/2 | VARCHAR(255) | Full address |
| city | VARCHAR(100) | |
| postal_code | VARCHAR(20) | |
| country | CHAR(2) | ISO 3166-1 |
| contact_name/email/phone | VARCHAR | Primary contact |
| currency | CHAR(3) | Default GBP (Apex) |
| tax_code_id | UUID FK | 02-SETTINGS §8 reference |
| payment_terms | VARCHAR(50) | "NET30", "NET60", "COD" |
| d365_supplier_id | VARCHAR(50) NULL | Back-reference dla pull sync |
| d365_sync_status | ENUM | 'synced' / 'drift' / 'manual' / 'conflict' |
| d365_last_synced_at | TIMESTAMPTZ | |
| notes | TEXT | |
| is_active | BOOLEAN DEFAULT true | Soft delete |
| ext_jsonb | JSONB | ADR-028 L3 extension cols |
| schema_version | INT | ADR-028 |
| created_at/by, updated_at/by | TIMESTAMPTZ + UUID | Audit |

**Indexes:** `(tenant_id, is_active)`, `(tenant_id, code)`, GIN `(ext_jsonb)`, `(d365_supplier_id)` unique partial WHERE NOT NULL.

### 5.3 supplier_products

| Kolumna | Typ | Opis |
|---------|-----|------|
| id | UUID PK | |
| tenant_id | UUID NOT NULL | |
| supplier_id | UUID FK | |
| product_id | UUID FK | → 03-TECHNICAL items |
| is_default | BOOLEAN | max 1 per product (enforced w trigger/service) |
| supplier_product_code | VARCHAR(50) | Supplier's SKU for product |
| lead_time_days | INT NULL | Override na product.lead_time_days |
| unit_price | DECIMAL(15,4) | Price per UoM |
| currency | CHAR(3) | Override supplier.currency |
| moq | DECIMAL(15,3) NULL | Override product.moq |
| order_multiple | DECIMAL(15,3) | e.g. must order in packs of 10 |
| last_purchase_date | DATE | |
| last_purchase_price | DECIMAL(15,4) | Price history snapshot |
| notes | TEXT | |
| created_at/by, updated_at/by | Audit | |

**Constraints:** UNIQUE(tenant_id, supplier_id, product_id). Partial unique index enforce is_default=true max 1 per (tenant_id, product_id).

### 5.4 purchase_orders + po_lines

**purchase_orders:**

| Kolumna | Typ | Opis |
|---------|-----|------|
| id | UUID PK | |
| tenant_id, site_id | | |
| po_number | VARCHAR(30) UNIQUE per tenant | Auto: PO-YYYY-NNNNN per settings |
| supplier_id | UUID FK | |
| currency | CHAR(3) | Inherited from supplier smart default |
| tax_code_id | UUID FK | Inherited |
| expected_delivery_date | DATE | Order date + lead_time_days |
| warehouse_id | UUID FK | 02-SETTINGS §12 warehouse |
| status | VARCHAR(30) | draft / submitted / pending_approval / confirmed / receiving / closed / cancelled |
| payment_terms | VARCHAR(50) | Inherited |
| shipping_method | VARCHAR(50) | |
| notes, internal_notes | TEXT | Internal = not sent to supplier |
| approval_required | BOOLEAN | Settings-driven |
| approved_at/by | TIMESTAMPTZ + UUID | |
| subtotal, tax_amount, discount_total, total | DECIMAL(15,2) | Calculated |
| source_type | ENUM | 'manual' / 'bulk' / 'forecast' / 'd365_mrp' (P2) |
| source_reference | VARCHAR(255) NULL | Free-form (e.g., d365_so_id) |
| ext_jsonb, schema_version | | L3 |
| Audit | | |

**po_lines:**

| Kolumna | Typ | Opis |
|---------|-----|------|
| id | UUID PK | |
| po_id | UUID FK | |
| line_number | INT | Auto-increment per PO |
| product_id | UUID FK | |
| quantity, uom | | from product |
| unit_price, discount_percent, discount_amount | | |
| line_total | Calculated | |
| expected_delivery_date, confirmed_delivery_date | DATE | |
| received_qty | DECIMAL(15,3) | Aggregated from GRNs (05-WAREHOUSE) |
| eudr_reference | VARCHAR(255) NULL | EU Deforestation Regulation hook (11-SHIPPING §8 cross-ref) |
| notes | TEXT | |

**Indexes:** `(tenant_id, status, expected_delivery_date)`, `(supplier_id)`, `(po_id, line_number)`.

### 5.5 transfer_orders + to_lines + to_line_lps

**transfer_orders:**

| Kolumna | Typ | Opis |
|---------|-----|------|
| id, tenant_id, site_id | | |
| to_number | VARCHAR(30) UNIQUE per tenant | Auto TO-YYYY-NNNNN |
| from_warehouse_id, to_warehouse_id | UUID FK | ≠ constraint; both intra-site |
| planned_ship_date, planned_receive_date | DATE | |
| actual_ship_date, actual_receive_date | TIMESTAMPTZ | |
| status | VARCHAR(30) | draft / planned / partially_shipped / shipped / partially_received / received / closed / cancelled |
| priority | VARCHAR(20) | low / normal / high / urgent |
| notes | TEXT | |
| shipped_by, received_by | UUID FK | |
| ext_jsonb, schema_version | | |
| Audit | | |

**to_lines:** (to_id, line_number, product_id, quantity, uom, shipped_qty, received_qty, notes)

**to_line_lps:** (to_line_id, lp_id, quantity) — optional LP pre-selection (05-WAREHOUSE managed LPs).

### 5.6 work_orders

| Kolumna | Typ | Opis |
|---------|-----|------|
| id, tenant_id, site_id | | |
| wo_number | VARCHAR(30) UNIQUE per tenant | Auto WO-YYYYMMDD-NNNN |
| product_id | UUID FK | → 03-TECHNICAL items (rm/intermediate/fa/co_product/byproduct) |
| item_type_at_creation | ENUM | Snapshot z product type (per Phase D #19 audit) |
| bom_id | UUID FK NULL | NULL dla is_rework=true |
| routing_id | UUID FK NULL | Inherited via boms.routing_id |
| planned_quantity, produced_quantity, uom | | |
| **is_rework** | BOOLEAN DEFAULT false | Rework bez BOM, manual materials |
| **released_to_warehouse** | BOOLEAN DEFAULT false | Scanner M06 visibility flag |
| status | VARCHAR(30) | DRAFT / RELEASED / IN_PROGRESS / ON_HOLD / COMPLETED / CLOSED / CANCELLED |
| planned_start_date, planned_end_date | TIMESTAMPTZ | |
| scheduled_start_time, scheduled_end_time | TIMESTAMPTZ | Finite-capacity stub output |
| production_line_id, machine_id | UUID FK | 02-SETTINGS §12 |
| priority | VARCHAR(20) | low / normal / high / critical |
| source_of_demand | ENUM | 'manual' / 'd365_so' / 'forecast' (P2) / 'rework' / 'intermediate_cascade' |
| source_reference | VARCHAR(255) NULL | e.g., d365_so_id, parent_wo_id |
| expiry_date | DATE NULL | Planning ship window |
| disposition_policy | ENUM | 'to_stock' / 'direct_continue' / 'planner_decides' (default from planning_settings per item) |
| actual_qty | DECIMAL(15,3) | From 08-PRODUCTION |
| yield_percent | Calculated | actual_qty / planned_quantity |
| started_at, completed_at, paused_at | TIMESTAMPTZ | |
| pause_reason | TEXT | |
| allergen_profile_snapshot | JSONB | Captured at release for sequencing (from 03-TECHNICAL §10) |
| ext_jsonb, schema_version | | |
| Audit | | |

**Indexes:** `(tenant_id, status, scheduled_start_time)`, `(source_reference)`, `(production_line_id, scheduled_start_time)` dla sequencing, `(released_to_warehouse) WHERE released_to_warehouse = true` (Scanner query hot path).

### 5.7 wo_materials + wo_operations

**wo_materials:**

| Kolumna | Typ | Opis |
|---------|-----|------|
| id, tenant_id | | |
| wo_id | UUID FK | |
| product_id | UUID FK | |
| material_name | VARCHAR(255) | Snapshot (immutable po release) |
| required_qty, consumed_qty, reserved_qty, uom | DECIMAL | |
| sequence | INT | Ordering w WO consumption |
| consume_whole_lp | BOOLEAN | Hard-lock granularity |
| is_by_product | BOOLEAN | True dla byproduct consumed as input w downstream WO |
| yield_percent, scrap_percent | DECIMAL | |
| condition_flags | JSONB | e.g., allergen-sensitive, temp-controlled |
| bom_item_id, bom_version | | Provenance |
| material_source | ENUM | 'stock' / 'upstream_wo_output' / 'manual' |
| source_wo_id | UUID FK NULL | Gdy material_source = 'upstream_wo_output' — pointer do upstream WO z wo_outputs |
| notes | TEXT | |

**wo_operations:**

| Kolumna | Typ | Opis |
|---------|-----|------|
| id, tenant_id, wo_id | | |
| sequence | INT | |
| operation_name | VARCHAR(255) | Snapshot z routing |
| machine_id, line_id | UUID FK | |
| expected_duration_minutes, expected_yield_percent | | |
| actual_duration, actual_yield | | From 08-PRODUCTION |
| status | VARCHAR(30) | pending / in_progress / completed / skipped |
| started_at/by, completed_at/by | | |
| notes | TEXT | |

### 5.8 wo_outputs (NEW v3.0)

| Kolumna | Typ | Opis |
|---------|-----|------|
| id | UUID PK | |
| tenant_id, wo_id | | |
| product_id | UUID FK | 03-TECHNICAL item (primary FA, co-product LUB byproduct) |
| output_role | ENUM | 'primary' / 'co_product' / 'byproduct' |
| planned_qty, uom | | Scaled from BOM allocation_pct × wo.planned_qty |
| actual_qty | DECIMAL | From 08-PRODUCTION consumption |
| allocation_pct | DECIMAL(5,2) | Snapshot z bom_outputs |
| disposition | ENUM | 'to_stock' / 'direct_continue' / 'pending_decision' |
| downstream_wo_id | UUID FK NULL | Gdy disposition='direct_continue' — consumer WO |
| output_lp_id | UUID FK NULL | Populated after 08-PRODUCTION output recording + 05-WAREHOUSE put-away |
| notes | TEXT | |

**Constraints:** One primary per WO (partial unique). `allocation_pct` sum per WO = 100% (trigger validation, może być skipped dla byproduct w P1).

### 5.9 wo_dependencies (NEW v3.0 — DAG edges)

| Kolumna | Typ | Opis |
|---------|-----|------|
| id | UUID PK | |
| tenant_id | | |
| parent_wo_id | UUID FK | Upstream WO (produces output) |
| child_wo_id | UUID FK | Downstream WO (consumes parent's output) |
| material_link | UUID FK | Pointer do wo_materials row w child_wo, z material_source='upstream_wo_output' |
| required_qty | DECIMAL | Jaka ilość parent.wo_outputs jest needed by child |
| created_at | TIMESTAMPTZ | Set przy cascade generation |

**Constraints:** NO CYCLES allowed. Validated via topological sort + DFS cycle check w service layer before insert. UNIQUE(tenant_id, parent_wo_id, child_wo_id).

### 5.10 wo_material_reservations

**Scope v3.1 (C2 Sesja 2 Q6 revision):** Reservations **tylko dla RM root** (wo_materials.material_source='stock'). Intermediate cascade (material_source='upstream_wo_output') **NIE tworzy** reservations — LP po parent_wo COMPLETED przechodzi put-away → available → Scanner scan-to-consume runtime decision. Eliminuje WO-interrupt cleanup + enables natural out-of-order consumption.

| Kolumna | Typ | Opis |
|---------|-----|------|
| id, tenant_id | | |
| wo_id | UUID FK | consuming WO |
| wo_material_id | UUID FK | **material_source must = 'stock' (P1)** — enforced at insert |
| lp_id | UUID FK | → 05-WAREHOUSE |
| quantity | DECIMAL | |
| reservation_type | ENUM | 'hard_lock' / 'soft_plan' (P1 only hard) |
| reserved_at, reserved_by | | |
| released_at, released_by | | NULL until release/consumption |
| release_reason | ENUM | 'consumed' / 'cancelled' / 'wo_cancelled' / 'admin_override' |

**Unique constraint:** `(lp_id) WHERE released_at IS NULL` — LP nie może być zarezerwowany 2× równolegle.

**Insert guard (V-PLAN-RES-005):** `wo_material_id.material_source = 'stock'` enforced przy reservation creation. Attempts dla 'upstream_wo_output' rejected z 400 error.

### 5.11 wo_status_history

Standard audit log: (wo_id, from_status, to_status, action, user_id, override_reason, timestamp, context_jsonb).

### 5.12 planning_settings

Osobna sekcja §14 — 30+ kolumn config.

### 5.13 ER diagram (text)

```
suppliers ─< supplier_products >─ products (03-TECH)
suppliers ─< purchase_orders ─< po_lines ─ products
warehouses (02-SET §12) ─< transfer_orders >─ warehouses
transfer_orders ─< to_lines ─< to_line_lps ─ lps (05-WH)
products ─< work_orders ─< wo_materials ─ products
work_orders ─< wo_operations ─ machines (02-SET §12)
work_orders ─< wo_outputs ─ products (primary + co + by)
work_orders ─< wo_dependencies ─ work_orders (DAG)
wo_materials ─< wo_material_reservations ─ lps
work_orders ─< wo_status_history
```

---

## §6 — Suppliers & Purchase Orders

### 6.1 Supplier master CRUD

**FR-PLAN-001:** Supplier CRUD z validation (country ISO, currency ISO-4217, email regex, phone E.164 optional).

- Soft delete (`is_active=false`) nie hard-delete — zachowuje history
- Audit trail wszystkie fields via `created_at/by` + `updated_at/by`
- API: `GET/POST/PUT/DELETE /api/planning/suppliers`
- Ext cols via ADR-028 L3 (e.g., Apex może add `certifications` JSON)

**FR-PLAN-002:** Supplier-product assignments z is_default enforcement (max 1 per product).

**FR-PLAN-003:** D365 supplier pull consumer [LEGACY-D365]:
- 03-TECHNICAL §13 worker pulls D365 supplier master nightly + on-demand
- Create: auto-create z `d365_supplier_id` populated, `d365_sync_status='synced'`
- Update: drift detection — local edit after pull → `d365_sync_status='drift'`, admin manual resolve (per Phase C1 Sesja 2 decision)
- Conflict: field-level diff visible w admin UI (02-SETTINGS §11 D365 admin section)

### 6.2 PO creation — 3-step fast flow

**FR-PLAN-005:** Smart defaults [4.1]

Krok 1: Supplier pick → auto-fill `currency`, `tax_code_id`, `payment_terms`, default `warehouse_id` z user profile/site.
Krok 2: Products + qty → per row auto-fill:
- `unit_price` z supplier_products (fallback: product.last_cost)
- `expected_delivery_date` = `order_date + COALESCE(sp.lead_time_days, p.lead_time_days)`
- `discount_percent` z supplier_products (jeśli set)
- Warning jeśli product nie ma is_default supplier

Krok 3: Review + submit — totals recalc, optional approval trigger (per settings), status → submitted.

**FR-PLAN-006:** Bulk PO creation
- Input: product list + qty (CSV paste lub multi-product modal)
- Grouping: `GROUP BY default_supplier_id` → draft PO per supplier
- Unassigned products (no default supplier) → warning banner, nie block
- Endpoint: `POST /api/planning/purchase-orders/bulk`

**FR-PLAN-007:** PO status lifecycle (configurable display, stały workflow per rule registry)

```
draft ─→ submitted ─→ pending_approval? ─→ confirmed ─→ receiving ─→ closed
   └────────────────────────────────────────────────────────────── cancelled
```

- Guards: `lines.count > 0` (submit), `approver_role + total > threshold` (pending_approval), `first_grn_received` (→ receiving), `all_lines_fully_received` (→ closed)
- Cancel allowed w: draft, submitted, pending_approval (post-confirmed wymaga admin override)

**FR-PLAN-008:** Approval workflow (Should Have, settings-driven)
- Settings: `po_approval_required` bool, `po_approval_threshold` decimal, `po_approval_roles` array
- Flow: submit → pending_approval (jeśli enabled + total > threshold) → approve/reject z notes → confirmed/back to draft
- Notifications via Resend (P2) — P1 = dashboard alert tile

### 6.3 PO line calc & totals

**FR-PLAN-009:**
- `line_total = (qty × unit_price) × (1 - discount_percent/100) - discount_amount`
- `po.subtotal = SUM(line_total)`
- `po.tax_amount = subtotal × tax_rate` (from tax_code)
- `po.total = subtotal + tax_amount`
- Recalc trigger: on line insert/update/delete — service layer, nie DB trigger (walidacja Zod)

### 6.4 PO → 05-WAREHOUSE handoff

- GRN (Goods Receipt Note) created w 05-WAREHOUSE (details w 05-WAREHOUSE PRD §7)
- On first GRN: PO status → receiving, `po_lines.received_qty` aggregated
- On all-lines-fully-received: auto-close PO (configurable via `planning_settings.po_auto_close_on_full_receipt`)

### 6.5 Outbox events

Every PO state transition → `outbox_events.po.state_changed`:
```json
{"event": "po.state_changed", "po_id": "...", "tenant_id": "...", "from": "submitted", "to": "confirmed", "by": "user_id", "at": "...", "total": 15000.00, "currency": "GBP"}
```
Consumers: D365 adapter push (P2 for PO confirmations to D365), analytics, dashboard refresh.

### 6.6 Frontend/UX

| Komponent | Opis |
|-----------|------|
| SupplierTable | Lista, search, filter active/inactive, D365 sync badge |
| SupplierForm | Modal create/edit z Zod validation |
| SupplierDetail | Page z product assignments, PO history |
| POTable | Lista PO, badge status (rendered z rule registry status names/colors), filter |
| POFastFlow | 3-step wizard: supplier → products → review |
| PODetail | Page z liniami, status history, approval actions, GRN progress |
| POBulkImport | Modal (paste + CSV upload) + grouping preview |
| POApprovalModal | Approve/reject + notes + audit |

### 6.7 Validation V-PLAN-PO

| ID | Rule | Severity |
|---|---|---|
| V-PLAN-PO-001 | Supplier code unique per tenant | Block |
| V-PLAN-PO-002 | Default supplier max 1 per product | Block |
| V-PLAN-PO-003 | PO lines ≥ 1 at submit | Block |
| V-PLAN-PO-004 | Line qty > 0 | Block |
| V-PLAN-PO-005 | Approval required gate | Block transition |
| V-PLAN-PO-006 | D365 drift → admin resolve required | Warn |
| V-PLAN-PO-007 | EUDR hook — supplier_dds_reference required if EUDR commodity (cross-ref 11-SHIPPING) | Block GRN |

---

## §7 — Transfer Orders (intra-site)

### 7.1 Scope

TO = transfer między warehouses w ramach jednego site (Phase D boundary).
Multi-site transfers (APEX ↔ KOBE) = **M14 Multi-Site** osobny entity z `from_site_id/to_site_id` polami.

### 7.2 TO state machine (ADR-019)

```
draft → planned → partially_shipped → shipped → partially_received → received → closed
                                                                          └── cancelled
```

- Permission helpers (checked w service layer): `canEdit(status)`, `canShip(status)`, `canReceive(status)`, `canDelete(status)`, `canEditLines(status)`
- State transitions = DSL rules w 02-SETTINGS §7 registry (rule_id: `to_state_machine_v1`)
- Type guards `isValidStatus()`, `assertValidStatus()` generated z rule definition

### 7.3 LP selection modes

**FR-PLAN-012:** Two workflows (settings-driven `to_require_lp_selection`):

- **LP pre-select** (rigorous): user selects LPs at TO creation → system validates availability → ship workflow locks those LPs
- **Deferred selection** (flexible): TO created without LP → warehouse staff picks LP at ship time via FEFO/FIFO suggestion (05-WAREHOUSE)

### 7.4 Partial shipments

**FR-PLAN-013:**
- Setting `to_allow_partial_shipments` (default true)
- Per line `shipped_qty` + `received_qty` tracked
- Status transitions:
  - Any line shipped < qty → `partially_shipped`
  - All lines shipped_qty = qty → `shipped`
  - Any line received > 0 < shipped_qty → `partially_received`
  - All lines received_qty = shipped_qty → `received`
  - Manual `close` action (audit logged) → `closed`

### 7.5 TO → 05-WAREHOUSE handoff

- Ship action: creates `stock_move` records in 05-WAREHOUSE (from_location → transit_location)
- Receive action: creates `stock_move` (transit_location → to_warehouse location)
- Transit location handling per 05-WAREHOUSE §9

### 7.6 Outbox events

`outbox_events.to.state_changed` — analogous to PO.

### 7.7 Frontend/UX

| Komponent | Opis |
|-----------|------|
| TOTable | Lista, filter status/warehouse/date |
| TOForm | Modal z warehouse pick (source ≠ dest), priority, lines |
| TODetail | Page z shipped/received progress, LP breakdown |
| TOLPSelector | Modal wyboru LP z FEFO/FIFO suggestion (query 05-WH) |
| ShipTOModal | Qty per line, batch sign-off |
| ReceiveTOModal | Qty per line, variance alert |

### 7.8 Validation V-PLAN-TO

| ID | Rule | Severity |
|---|---|---|
| V-PLAN-TO-001 | from_warehouse ≠ to_warehouse | Block |
| V-PLAN-TO-002 | Both warehouses same site | Block (use M14 for cross-site) |
| V-PLAN-TO-003 | Lines ≥ 1 to ship | Block |
| V-PLAN-TO-004 | Shipped qty ≤ line qty | Block |
| V-PLAN-TO-005 | Received qty ≤ shipped qty | Block |
| V-PLAN-TO-006 | LP pre-selected available at ship time | Block (re-validate) |

---

## §8 — Work Orders: BOM Snapshot + Co-products + Intermediate Cascade DAG

**Primary innovation v3.0** — cascade DAG jest core P1, nie flag-gated. Obsługuje N+1 per FA zgodnie z Phase D #19.

### 8.1 WO creation flow

**FR-PLAN-017: WO CRUD** — standard fields per §5.6.

**FR-PLAN-018: BOM auto-selection (ADR-002)**
- Query: `active bom WHERE product_id = wo.product_id AND effective_from ≤ scheduled_date AND (effective_to IS NULL OR effective_to > scheduled_date)`
- Multiple matches → najnowszy `effective_from`
- User override allowed (dropdown z version history, audit logged)
- Warning jeśli brak active BOM (blokuje release, nie create)

**FR-PLAN-019: Routing copy (ADR-002)**
- Routing inherited via `boms.routing_id`
- `routing_operations` → snapshot to `wo_operations` (sequence, operation_name, machine_id, expected_duration, expected_yield)
- Immutable po WO release

### 8.2 BOM snapshot → wo_materials

**FR-PLAN-020:**
- Per bom_item: insert `wo_materials` row z:
  ```
  required_qty = bom_item.qty × (wo.planned_quantity / bom.output_qty) × (1 + scrap_percent/100)
  ```
- `material_source` default `'stock'` — zmienia się na `'upstream_wo_output'` gdy cascade generation ustala dependency
- Immutable po WO release (ADR-002)

### 8.3 Co-products + byproducts — wo_outputs generation

**FR-PLAN-021 (NEW v3.0):**

Per każdy row w `bom_outputs` (03-TECHNICAL §7.2):
- Insert `wo_outputs` z:
  - `output_role = bom_output.role` ('primary' / 'co_product' / 'byproduct')
  - `planned_qty = bom_output.qty × (wo.planned_quantity / bom.output_qty) × (1 + yield_percent/100)` (co-product)
  - `allocation_pct = bom_output.allocation_pct` (cost allocation dla 10-FINANCE Phase 2)
  - `disposition = item.default_disposition` (z 03-TECHNICAL item config, settings-overridable)

Primary output = 1 per WO (unique partial index). Co-products/byproducts N per WO.

### 8.4 Intermediate Cascade DAG — catalog-driven generation

**FR-PLAN-022 (NEW v3.0, CORE):**

**Algorithm (simplified pseudo):**

```
function generateWODAG(root_demand):
    demand_queue = [root_demand]  // e.g., from D365 SO lub manual creation
    created_wos = {}
    dependencies = []

    while demand_queue not empty:
        demand = dequeue()
        bom = resolve_bom(demand.product_id, demand.scheduled_date)
        wo = create_wo(demand, bom)
        created_wos[wo.product_id] = wo

        for output in bom.outputs:
            create_wo_output(wo, output)

        for material in bom.items:
            if material.product.type == 'intermediate':
                // Need upstream WO → recurse
                upstream_demand = {
                    product_id: material.product_id,
                    planned_qty: wo_material.required_qty,
                    scheduled_date: wo.scheduled_start_date - avg_lead_time(material.product_id),
                    source_of_demand: 'intermediate_cascade',
                    source_reference: wo.id
                }
                enqueue(upstream_demand)
            else if material.product.type == 'rm':
                wo_material.material_source = 'stock'

    // After all WOs created, wire dependencies
    for wo in created_wos.values():
        for wo_material in wo.materials where material_source = 'upstream_wo_output':
            parent_wo = created_wos[wo_material.product_id]
            create_wo_dependency(parent_wo, wo, wo_material)

    // Validate no cycles (DFS topological sort)
    if has_cycle(dependencies):
        rollback()
        raise DAGCycleError

    // Return root WO (primary FA); callers can navigate dependencies
    return created_wos
```

**Key properties:**
- **Idempotent** — re-running cascade z tym samym root demand nie tworzy duplikatów (dedupe by `source_reference + product_id + scheduled_date bucket`)
- **DAG safety** — cycle detection przed commit, topological sort required (product type intermediate nie może być input do własnego producer WO)
- **Fan-out & fan-in** — intermediate może być konsumowany przez wiele downstream WO (fan-out) i produkowany przez wiele upstream WO batches (fan-in, np. dwa batche stripped chicken → jeden roast WO)

**Output:** Multiple `work_orders` rows + `wo_dependencies` edges + properly linked `wo_materials.material_source` + `wo_materials.source_wo_id`.

### 8.5 Disposition policy per WO output (v3.1 revised)

**FR-PLAN-023 (revised C2 Sesja 2 Q6):**

**P1 scope:** `wo_outputs.disposition` **zawsze = `to_stock`**. Intermediate LPs, FA LPs, co-product LPs, byproduct LPs — wszystkie przechodzą przez standard put-away flow (05-WAREHOUSE §10).

| Disposition | Behavior | Status |
|---|---|---|
| `to_stock` | Po 08-PRODUCTION output recording → 05-WAREHOUSE put-away → LP created, status='available'. Operator na child_wo linii skanuje LP → consume-to-wo (Scanner FEFO suggest + soft warning on deviation per Q6B) | **P1 DEFAULT ONLY** |
| `direct_continue` | ~~Output LP od razu reserved na downstream_wo_id~~ | **DEFERRED → P2 (WH-E17)** jeśli real demand |
| `planner_decides` | ~~Planner wybiera w dashboard przed release~~ | **DEFERRED → P2** jeśli real demand |

**Rationale P1 narrowing:**
1. **Apex reality** — intermediate fizycznie trafia na buffer/chłodnię między operacjami (nie ma tight-flow direct handoff)
2. **Zero inter-WO locking complexity** — WO interrupt/cancel = zero cleanup (LP stays `available`)
3. **Out-of-order consumption naturalne** — operator na linii decyduje kolejność, scan-based
4. **Audit clarity** — genealogy via chronological scan events, nie pre-allocated reservations

**Disposition column nadal w schema** (wo_outputs.disposition) dla future-proofing, ale constrained CHECK `disposition = 'to_stock'` w P1 release (enforce at insert).

**Disposition driven by (P1):**
1. Auto-set `to_stock` dla wszystkich wo_outputs.

**P2 re-introduction path:** przy demand dla tight-flow lines, re-enable CHECK relaxation + implement reservation bridge przez wo_dependencies.downstream_wo_id → LP auto-reserve on parent COMPLETED.

### 8.6 Material availability check (v3.1 revised)

**FR-PLAN-024 (revised C2 Sesja 2 Q6):**

**Projection-based, nie reservation-based** dla cascade.

- Query per wo_material:
  - If `material_source = 'stock'`: query available LP qty net of reservations (`status='available' AND product_id=X AND warehouse=WO.warehouse AND (qty - reserved_qty) > 0`)
  - If `material_source = 'upstream_wo_output'`: **projection only** (zero reservation):
    - `parent_wo.status = COMPLETED` → actual LP qty on stock (query 05-WAREHOUSE)
    - `parent_wo.status = IN_PROGRESS` → projected qty = parent_wo.planned_output × (1 - yield_buffer%), available at parent_wo.planned_end_date
    - `parent_wo.status = RELEASED` → projected qty at parent_wo.planned_end_date + safety margin
    - `parent_wo.status = DRAFT` → red flag, insufficient upstream planning visibility
- Indicators:
  - 🟢 Green: available/projected ≥ 120% required
  - 🟡 Yellow: 100-120% required
  - 🔴 Red: <100% required
- Warning only w P1 — nie blokuje creation/release (configurable: `wo_material_check_blocks_release` for strict orgs)
- **Zero intermediate reservations** — actual consumption = Scanner scan-to-wo event na production line (05-WAREHOUSE §10.5)

### 8.7 WO state machine (ADR-007) — definition jako rule registry

```
DRAFT ──→ RELEASED ──→ IN_PROGRESS ⇄ ON_HOLD ──→ COMPLETED ──→ CLOSED
  └─────────────────────────────────────────────────────────── CANCELLED
```

**Guards (DSL rule registry `wo_state_machine_v1`):**
- `hasBOM` — release (unless is_rework=true)
- `hasMaterials` — release (for cascade: parent_wo.status ≥ IN_PROGRESS OR disposition=direct_continue)
- `outputRecorded` — complete (from 08-PRODUCTION)
- `allOperationsComplete` — complete (overridable z supervisor + reason)
- `dependsOnNotBlocking` — release (wo_dependencies resolved)

**Side effects:**
- Release: auto-reserve materials (hard-lock), set timestamps, populate `allergen_profile_snapshot`, emit outbox event
- Pause: set `paused_at`, require `pause_reason`
- Complete: finalize output LPs (hands off do 05-WAREHOUSE), trigger downstream WO availability check (cascade), emit event
- Close: 10-FINANCE link (P2 stub)

### 8.8 Rework WO exception

**FR-PLAN-025:**
- `is_rework=true` → BOM optional, materials added manually via `wo_materials` CRUD
- Source: failed QC'd FA (09-QUALITY handoff), customer returns (11-SHIPPING handoff, P2)
- State machine identyczny, guard `hasBOM` skipped dla rework
- Audit: always logged, approval required (settings-driven `wo_rework_require_approval`)

### 8.9 Meat_Pct multi-comp aggregation [APEX-CONFIG]

**FR-PLAN-026 (Phase D #14):**

Dla WOs z multi-component BOM (np. mixed-meat product), `Meat_Pct` computed by:
- Aggregate RM meat items (`items.category='meat'`) from BOM expand
- Weighted by `bom_item.qty × bom_item.product.meat_content_pct`
- Result stored `wo.meat_pct_computed` (JSONB dla per-type breakdown + total)
- Display: comma-sep z v7 pattern (e.g., "Chicken 85%, Pork 10%, Beef 5%")

### 8.10 Frontend/UX

| Komponent | Opis |
|-----------|------|
| WOTable | Lista, badge status (rule registry display), filter status/line/date, sort priority |
| WOSpreadsheet | Bulk edit arkuszowy (date, qty, line, priority) — multiple WOs at once |
| WOForm | Modal z BOM preview, availability panel, cascade preview dla multi-layer BOMs |
| WODetail | Page z materials, operations, outputs, dependencies (DAG tree visual), status history |
| WOMaterialsTable | G/Y/R indicators, material_source badge (stock/upstream/manual) |
| WOOperationsTimeline | Sequence with status, expected vs actual duration |
| WOOutputsPanel | Primary + co-products + byproducts z disposition control |
| WODependenciesTree | Visual DAG upstream/downstream WOs (d3-dagre lub ReactFlow) |
| WOAvailabilityPanel | Material + upstream WO + line/machine availability roll-up |
| WOGanttChart | Per line/machine, color=status (Could Have) |
| ReleaseToWarehouseButton | Confirmation modal + Scanner M06 handoff preview |
| CascadePreviewModal | Show N+1 WOs przed create — tree + total materials + timeline |

### 8.11 Validation V-PLAN-WO

| ID | Rule | Severity |
|---|---|---|
| V-PLAN-WO-001 | planned_quantity > 0 | Block |
| V-PLAN-WO-002 | BOM required for release (unless is_rework) | Block release |
| V-PLAN-WO-003 | wo_outputs has exactly 1 primary | Block |
| V-PLAN-WO-004 | wo_outputs allocation_pct sum ≈ 100% (co+primary, tolerance 0.5%) | Warn (block for strict orgs) |
| V-PLAN-WO-005 | wo_dependencies no cycle | Block (hard validation) |
| V-PLAN-WO-006 | Cascade generation idempotent (no duplicate WOs per source_reference) | Block on re-run |
| V-PLAN-WO-007 | wo_material.material_source='upstream_wo_output' → source_wo_id populated | Block |
| V-PLAN-WO-008 | Hard-lock reservation: LP reserved max 1 active WO | Block (concurrent WO creation) |
| V-PLAN-WO-009 | Disposition='direct_continue' → downstream_wo_id required | Block release |

---

## §9 — Material Availability & Hard Lock Reservation

### 9.1 Hard-lock semantyka

**FR-PLAN-027:**
- Reservation = **hard lock**: LP zarezerwowany na WO = **exclusive**, nie może być rezerwowany równolegle
- Attempt to double-reserve → API error 409 Conflict z info: `{reserved_by_wo: "WO-XYZ", reserved_at: "...", can_override: false}`
- LP released after:
  - `consumed` — 08-PRODUCTION reports consumption (actual_qty cascade w wo_materials.consumed_qty)
  - `cancelled` — WO cancel or reservation explicit release (admin override)
  - `wo_cancelled` — parent WO transitioned to CANCELLED
  - `admin_override` — emergency (audit + mandatory reason)

### 9.2 Reservation creation (v3.1 revised)

**FR-PLAN-028 (revised C2 Sesja 2 Q6):**

- Triggered on WO.status transition `DRAFT→RELEASED` (side effect)
- Per wo_material with `material_source='stock'` **(ONLY)**:
  - Query: `LP WHERE product_id = material.product_id AND warehouse_id = WO.warehouse_id AND status='available' AND remaining_qty >= material.required_qty ORDER BY expiry_date ASC` (FEFO)
  - Insert `wo_material_reservations` z hard_lock semantics
  - Update `license_plates.reserved_for_wo_id`, `reserved_qty`; status `available → reserved`
- Per wo_material with `material_source='upstream_wo_output'`:
  - **Zero reservation created** (P1 Q6 revised)
  - Consumption = Scanner scan-to-wo event gdy operator picks LP na production line (05-WAREHOUSE §10.5)
  - Material availability check = projection only (§8.6)
  - Rationale: natural out-of-order consumption support + WO-interrupt resilience + simpler audit chain

### 9.3 LP visibility (05-WAREHOUSE integration)

- 05-WAREHOUSE queries `lp.reserved_for_wo_id` (view/computed) to show "Reserved for WO-XYZ" badge
- Full inventory views (dashboard, stock reports) show available qty NET of reservations

### 9.4 Cancellation handling (v3.1 revised)

- WO cancel → **RM root reservations** released batch (material_source='stock' only). Intermediate cascade = zero cleanup (upstream LPs stay `available`, brak reservation to release)
- WO pause → reservations **retained** (pause temporary, LP locked)
- WO complete → reservations transition to `consumed` (per actual qty reported w 08-PRODUCTION)
- **Intermediate WO cancel resilience:** upstream output LPs (jeśli już materialized) pozostają `available`. Jeśli inny child_wo consumes ten sam product → może wykorzystać te LP przez standard Scanner scan-to-wo. Zero admin intervention needed.

### 9.5 Frontend/UX

| Komponent | Opis |
|-----------|------|
| ReservationPanel | Per-material LP list, total reserved, link do 05-WAREHOUSE LP detail |
| OverrideReservationModal | Admin-only, requires reason, logged |
| ConcurrentReservationError | Inline error on WO release z link do conflicting WO |

### 9.6 Validation V-PLAN-RES

| ID | Rule | Severity |
|---|---|---|
| V-PLAN-RES-001 | LP hard-lock uniqueness (partial unique index) | Block (DB constraint) |
| V-PLAN-RES-002 | Sum of reservations per LP ≤ LP.remaining_qty | Block |
| V-PLAN-RES-003 | Reservation released reason mandatory | Block |
| V-PLAN-RES-004 | Admin override audit entry required | Block |

---

## §10 — Allergen-Aware WO Sequencing [APEX-CONFIG → UNIVERSAL, [EVOLVING]]

### 10.1 Scope

**Primary source:** 03-TECHNICAL §10.5 cross-contamination risk matrix — mapuje allergen pairs → risk score (LOW/MEDIUM/HIGH/BLOCK).

**Goal:** Ordering WOs on shared production line to **minimize allergen changeover cost** (cleaning time, ATP swabs, dual sign-off per 08-PRODUCTION §9 changeover gate).

### 10.2 Basic heuristic P1

**FR-PLAN-029 (P1 MUST):**

Algorithm (per production_line per scheduling window):

```
1. Query WOs WHERE status = 'RELEASED' AND production_line_id = X AND scheduled_start_time in [window]
2. Annotate each WO with allergen_profile_snapshot (already captured at release)
3. Group by "allergen family":
   - Allergen-free group (no EU14)
   - Single-allergen groups (gluten-only, dairy-only, etc.)
   - Multi-allergen groups
4. Order: allergen-free first → single-allergen (alphabetical per family) → multi-allergen last
   - Within group: FIFO by scheduled_start_time (preserves planner intent)
5. Update wo.scheduled_start_time respecting line capacity + operation durations
6. Emit outbox event wo.sequencing_applied
```

**Output:** WOs re-scheduled minimizing transitions between allergen profiles. Basic heuristic — **nie optimal**, ale dobra baseline.

### 10.3 Full optimizer → 07-PLANNING-EXT

**Deferred to C3 (07-PLANNING-EXT):**
- Weighted cost minimization (cleaning time × labor rate + ATP cost + downtime opportunity cost)
- Time-window constraints (shift boundaries, operator availability)
- Multi-line cross-optimization (same allergen WOs konsolidowane na 1 line jeśli possible)
- Metaheuristic (e.g., Simulated Annealing) dla 100+ WOs queue

### 10.4 Rule engine integration

Sequencing logic deployed jako DSL rule w 02-SETTINGS §7 registry (rule_id: `allergen_sequencing_heuristic_v1`):
- Dev-authored (per Q2 C1 decision)
- Admin read-only, audit log, dry-run preview
- Version history: v1 basic → v2 (07-PLANNING-EXT optimizer) = new rule version, both stored for comparison

### 10.5 Manual override

- Planner może disable sequencing per WO (flag `sequencing_override=true`, audit logged)
- Emergency rush orders (priority=critical) exempt from sequencing by default

### 10.6 KPI — changeover reduction

- Baseline: measure changeover count przed sequencing enabled
- Post-enable: measure reduction
- Target: > 30% reduction dla Apex 6-month rolling window
- Dashboard tile: "Changeovers this week vs baseline"

### 10.7 Frontend/UX

| Komponent | Opis |
|-----------|------|
| SequencingPreviewModal | Before/after comparison, changeover count delta |
| SequencingSettingsPanel | Per-line enable/disable, rule version selector |
| AllergenProfileBadge | Per WO w table — colored dots per allergen family |

### 10.8 Validation V-PLAN-SEQ

| ID | Rule | Severity |
|---|---|---|
| V-PLAN-SEQ-001 | Sequencing nie narusza priority=critical ordering | Block |
| V-PLAN-SEQ-002 | Scheduled times respect shift/capacity bounds (z 11 finite-capacity stub) | Block |
| V-PLAN-SEQ-003 | Override reason logged | Block |

---

## §11 — Finite-Capacity Scheduling Stub

### 11.1 P1 scope

**Minimum viable scheduling** dla P1 — full engine w 07-PLANNING-EXT (C3).

**FR-PLAN-030 (P1):**

Per WO scheduling attempt:

1. **Line/machine availability check** — is_active + shift calendar (02-SETTINGS §12) + existing WO bookings
2. **Capacity tally** — sum WO planned_durations na line w scheduling window vs available hours
3. **Greedy slot allocation** — WOs sorted by priority + scheduled_start_time → allocate first-fit w available slots
4. **Overflow warning** — if capacity exceeded, flag WO `scheduled_slot_conflict=true`, nie block creation
5. **DAG respect** — downstream WO scheduled_start_time ≥ parent_wo.projected_end_time (computed z wo_operations expected_duration)

### 11.2 Output

- Populates `wo.scheduled_start_time`, `wo.scheduled_end_time`
- Feed to Gantt view (Could Have dla P1)
- Feed to allergen sequencer §10

### 11.3 Limitations (deferred → 07-PLANNING-EXT)

- ❌ No preemption / re-optimization on new WO arrival
- ❌ No setup time modeling (changeover time hardcoded default 30min if allergen change)
- ❌ No backward scheduling (due date → back-plan start)
- ❌ No multi-resource constraints (just line + machine, nie labor + materials)
- ❌ No finite-inventory scheduling (assumes infinite upstream)

### 11.4 Outbox events

`wo.scheduled` — emitted post-scheduling, feeds 12-REPORTING dashboard + OEE (15).

### 11.5 Frontend/UX

| Komponent | Opis |
|-----------|------|
| ScheduleGrid | Per-line × time (day/week view) z WO blocks |
| CapacityWarnings | Red banner when capacity exceeded |
| ReScheduleButton | Trigger re-run greedy allocation (admin only) |

---

## §12 — Release-to-Warehouse Flow

### 12.1 Semantyka

**Release-to-warehouse** = moment, w którym WO staje się visible dla Scanner M06 (pick workflow).

Nie tworzy osobnej tabeli `pick_lists` (per Phase B NPD decision) — Scanner queries:
```sql
SELECT * FROM work_orders
WHERE tenant_id = X
  AND status IN ('RELEASED', 'IN_PROGRESS')
  AND released_to_warehouse = true
  AND site_id = Y
ORDER BY priority, scheduled_start_time
```

### 12.2 Per-WO granularity (intermediate cascade support)

**FR-PLAN-031:**

Każdy WO (primary FA, intermediate, rework) może być released independently. W cascade chain:
- Parent WO released-to-warehouse → Scanner widzi pick list dla parent's materials (RM from stock)
- Child WO released-to-warehouse → Scanner widzi pick list dla child's materials (może być intermediate from stock LUB direct from parent WO output)

**Trigger:**
- Manual via `POST /api/planning/work-orders/:id/release-to-warehouse`
- Guard: `wo.status ∈ ('RELEASED', 'IN_PROGRESS')` + `wo.materials.count > 0` (lub is_rework)
- Side effect: `released_to_warehouse=true`, emit outbox event `wo.released_to_warehouse`

### 12.3 FEFO/FIFO suggestion z Scanner side

Scanner M06 dynamically generates LP suggestions per pick:
- FEFO = earliest expiry first (food default)
- FIFO fallback for non-expiring items (supplies, packaging)
- Logic w 06-SCANNER-P1 service, queries 05-WAREHOUSE LP inventory

### 12.4 Un-release (rare)

Admin-only action: `released_to_warehouse=false` — removes from Scanner view. Audit logged, requires reason. Used gdy WO mistakenly released + need pause before production resumes.

### 12.5 Frontend/UX

| Komponent | Opis |
|-----------|------|
| ReleaseToWarehouseButton | On WODetail, confirm modal z material count preview |
| ScannerQueuePreview | Show which WOs currently visible w M06 per warehouse |

---

## §13 — Planning Dashboard & KPIs

### 13.1 Dashboard content

**FR-PLAN-032:**

**KPI cards (top row):**
- Open POs count
- POs Pending Approval count
- Overdue POs count
- Open TOs count
- WOs Scheduled Today
- WOs In Progress
- WOs On Hold > 24h

**Alerts (middle):**
- Overdue PO (past expected_delivery_date)
- PO pending approval > 2 days
- Material shortages (red availability) for scheduled WOs
- WO on hold > 24h (requires attention)
- WO past scheduled_end_date + not complete
- D365 drift — unresolved conflicts

**Upcoming (bottom):**
- PO calendar (expected deliveries next 14 days)
- WO schedule (by date/line, next 7 days)
- TO timeline (ship/receive dates)
- Intermediate cascade chain visualization (top 5 active chains)

### 13.2 Performance

**FR-PLAN-033:**
- Cache Redis 1min TTL
- Per-tenant + per-user (for permission-filtered views)
- Dashboard load P95 < 1s

### 13.3 KPI computation

Operacyjne:

| KPI | Definition |
|-----|------------|
| PO Creation Time | avg(submitted_at - created_at) for PO w last 30 days |
| PO Smart Default Rate | % PO where > 80% fields auto-filled |
| WO BOM Snapshot Time | P95 latency w WO creation endpoint |
| Material Reservation Rate | % WO w RELEASED state z full reservations coverage |
| Plan Accuracy | 100% - avg(abs(actual_qty - planned_qty) / planned_qty) per WO |
| On-Time Delivery (PO) | % PO with actual_receipt_date ≤ expected_delivery_date |
| Changeover Reduction | Baseline changeover count vs post-sequencing count (30-day rolling) |
| WO Cascade Depth | avg intermediate layers per FA WO |
| D365 SO Lag | avg(draft_wo_created_at - d365_so_modified_at) |

### 13.4 System KPIs

| KPI | Target |
|-----|--------|
| PO list API P95 | < 500 ms |
| WO creation single layer | < 1 s |
| WO creation 3-layer cascade | < 3 s |
| Bulk PO 100 lines | < 5 s |
| MRP calc (P2) | < 30 s for 1000 products |

### 13.5 Frontend/UX

| Komponent | Opis |
|-----------|------|
| PlanningDashboard | Top-level page z KPI cards + alerts + upcoming + quick actions |
| PlanningStatsCards | Responsive tile grid |
| PlanningAlerts | Grouped by type, dismissible (with undo) |
| QuickActions | Create PO/TO/WO, Bulk Import, Run Sequencing |
| CascadeChainView | Top 5 active intermediate cascades visualized |

---

## §14 — Planning Settings + Configurable Status Display

### 14.1 planning_settings schema

| Kolumna | Typ | Default | Opis |
|---------|-----|---------|------|
| id | UUID PK | gen_random_uuid() | |
| tenant_id | UUID NOT NULL UNIQUE | | RLS key |
| site_id | UUID NULL | NULL | Multi-site scope (M14) |
| default_po_currency | CHAR(3) | 'GBP' | |
| po_auto_number | BOOLEAN | true | |
| po_number_prefix | VARCHAR(10) | 'PO-' | |
| po_number_format | VARCHAR(50) | 'PO-{YYYY}-{NNNNN}' | ICU pattern |
| po_require_approval | BOOLEAN | false | |
| po_approval_threshold | DECIMAL(15,2) | NULL | |
| po_approval_roles | TEXT[] | '{}' | |
| po_auto_close_on_full_receipt | BOOLEAN | true | |
| po_default_lead_time_days | INT | 7 | |
| to_auto_number | BOOLEAN | true | |
| to_number_prefix | VARCHAR(10) | 'TO-' | |
| to_allow_partial_shipments | BOOLEAN | true | |
| to_require_lp_selection | BOOLEAN | false | |
| wo_auto_number | BOOLEAN | true | |
| wo_number_prefix | VARCHAR(10) | 'WO-' | |
| wo_number_format | VARCHAR(50) | 'WO-{YYYYMMDD}-{NNNN}' | |
| wo_auto_select_bom | BOOLEAN | true | |
| wo_copy_routing | BOOLEAN | true | |
| wo_material_check | BOOLEAN | true | |
| wo_material_check_blocks_release | BOOLEAN | false | Strict orgs = true |
| wo_require_bom | BOOLEAN | true | |
| wo_allow_overproduction | BOOLEAN | false | |
| wo_overproduction_limit_pct | DECIMAL(5,2) | 5.00 | |
| wo_rework_require_approval | BOOLEAN | true | |
| wo_default_priority | VARCHAR(20) | 'normal' | |
| wo_status_expiry_days | INT | 90 | Auto-archive closed WOs |
| default_intermediate_disposition | ENUM | 'planner_decides' | Per-tenant cascade default |
| intermediate_cascade_max_depth | INT | 10 | Safety cap |
| sequencing_enabled_default | BOOLEAN | true | |
| sequencing_rule_version | VARCHAR(20) | 'v1' | Points to rule registry |
| d365_so_trigger_enabled | BOOLEAN | false | [LEGACY-D365] |
| d365_so_pull_cron | VARCHAR(50) | '0 2 * * *' | Nightly 2am default |
| status_display | JSONB | seeded defaults | Per-status name + color overrides |
| field_visibility | JSONB | '{}' | Per-role field hiding rules |
| ext_jsonb, schema_version | | | |
| created_at, updated_at | | | |

### 14.2 Status display configuration

**FR-PLAN-034:**

`status_display` JSONB struktura per entity (PO/TO/WO):

```json
{
  "po": {
    "draft": {"label_pl": "Szkic", "label_en": "Draft", "color": "#9CA3AF", "icon": "draft"},
    "submitted": {"label_pl": "Wysłane", "label_en": "Submitted", "color": "#3B82F6"},
    ...
  },
  "to": {...},
  "wo": {...}
}
```

**Admin UI CRUD:**
- Only `label_*` + `color` + `icon` editable per-status
- Workflow transitions NIE modyfikowalne (per Q2 C1 — rules w dev-authored registry)
- Default names/colors seeded at tenant onboarding
- i18n support — label per language (pl/en P1; uk/ro P2)

### 14.3 D365 SO trigger config

**FR-PLAN-035 ([LEGACY-D365]):**

Settings:
- `d365_so_trigger_enabled` bool
- `d365_so_pull_cron` cron expression (scheduled job)
- `d365_so_pull_window_days` (default 14) — look-ahead window
- `d365_so_status_filter` (default `['Open', 'Confirmed']`) — which SO statuses to pull

**Worker (in 03-TECHNICAL §13 D365 adapter):**
- Cron-triggered pull from D365 SO endpoint (DMF)
- Per SO: check if WO already exists (dedupe by `source_reference=so_id`)
- If not: create draft WO z `source_of_demand='d365_so'`, auto-select BOM, cascade generate (cascade §8.4)
- Emit `wo.created_from_d365_so` event
- Admin dashboard tile: "D365 SO pull — last run, rows pulled, errors"

### 14.4 Field visibility per role

**FR-PLAN-036:**

`field_visibility` JSONB — per-role field masking (e.g., hide `internal_notes` from warehouse_operator role).

- Evaluated server-side (security layer) + client-side (UX)
- Defaults from 02-SETTINGS §10.3 role permission mappings
- Per-tenant overrides via UI

### 14.5 Frontend/UX

| Komponent | Opis |
|-----------|------|
| PlanningSettingsPage | Tabbed: General / PO / TO / WO / Intermediate / Sequencing / D365 / Status Display |
| StatusDisplayEditor | Per-status row edit, color picker, i18n labels |
| D365ConfigPanel | Enable toggle + cron + test connection |
| FieldVisibilityMatrix | Role × field grid editor |

### 14.6 Validation V-PLAN-SET

| ID | Rule | Severity |
|---|---|---|
| V-PLAN-SET-001 | po_approval_threshold ≥ 0 | Block |
| V-PLAN-SET-002 | intermediate_cascade_max_depth ∈ [1, 20] | Block |
| V-PLAN-SET-003 | status_display must cover all defined statuses | Block |
| V-PLAN-SET-004 | cron expression valid | Block |

---

## §15 — D365 Integration Stage 1 Consumer [LEGACY-D365]

### 15.1 Scope

04-PLANNING-BASIC jest **primary consumer** of INTEGRATIONS stage 1 (scope defined w 03-TECHNICAL §13):

| Direction | Data | Frequency | Consumer side |
|-----------|------|-----------|---------------|
| Pull | Supplier master | Nightly + on-demand | §6 supplier CRUD |
| Pull | Item master | Nightly + on-demand | 03-TECHNICAL §6 |
| Pull | BOM structures | Nightly + on-demand | 03-TECHNICAL §7 |
| Pull | Sales Orders (SO) | Nightly + on-demand | §15.2 WO generation |
| Push | Production Order confirmations (WO) | Near-real-time via Azure Service Bus | §15.3 WO handoff |

### 15.2 SO pull → WO generation

**FR-PLAN-037:**

Worker (hosted w 03-TECHNICAL §13 D365 adapter):

```
cron or on-demand trigger:
  1. Query D365 SO (DMF) WHERE status ∈ settings.d365_so_status_filter
     AND delivery_date ≤ now() + settings.d365_so_pull_window_days
  2. Per SO:
     a. Dedupe: check if WO exists z source_reference=so_id
     b. If new: create draft WO
        - product_id = resolve(d365 item_id)
        - planned_quantity = so.ordered_qty
        - warehouse_id = resolve(d365 warehouse)
        - scheduled_start_time = so.delivery_date - avg_production_lead_time
        - source_of_demand = 'd365_so'
        - source_reference = so.so_id
        - status = 'DRAFT' (planner manually releases)
     c. Trigger cascade generation (§8.4) jeśli BOM ma intermediate layers
     d. Emit outbox event wo.created_from_d365_so
  3. Log pull batch summary (rows pulled, WOs created, errors, drift) → 02-SETTINGS §11 admin dashboard
```

**Error handling:**
- Unresolvable D365 item → skip, log warning, notify admin
- Duplicate source_reference → skip (idempotent)
- D365 API failure → retry z exponential backoff (max 3), dead-letter queue

### 15.3 WO push (to 03-TECHNICAL §13)

**FR-PLAN-038:**

Outbox event `wo.state_changed` w transition TO `COMPLETED` → 03-TECHNICAL §13 worker handles push:
- Transforms to D365 production_order_confirmation entity
- Sends via DMF / Service Bus
- Handles retry + idempotency [R14]

**Event payload:**
```json
{
  "event": "wo.state_changed",
  "wo_id": "...",
  "tenant_id": "...",
  "to_status": "COMPLETED",
  "actual_qty": 95.5,
  "yield_percent": 95.5,
  "d365_so_reference": "SO-12345",
  "primary_output_id": "lp-xyz",
  "completed_at": "..."
}
```

### 15.4 Drift detection & manual resolve

**FR-PLAN-039:**

Per-entity (suppliers, POs with D365 links):
- Daily diff job: compare local vs D365 snapshot
- Fields in drift: tracked w `d365_sync_status = 'drift'`, `d365_drift_fields JSONB`
- Admin UI (02-SETTINGS §11): field-by-field compare, accept local / accept D365 / merge

### 15.5 Feature flag gate

Integration disabled by default:
- `integration.d365.enabled` (tenant-wide) — master toggle
- `integration.d365.so_trigger.enabled` (module-specific) — SO pull on/off
- Admin UI in 02-SETTINGS §10 toggles

### 15.6 Validation V-PLAN-D365

| ID | Rule | Severity |
|---|---|---|
| V-PLAN-D365-001 | WO created from D365 SO has source_reference populated | Block |
| V-PLAN-D365-002 | Supplier pull dedupe by d365_supplier_id unique | Block |
| V-PLAN-D365-003 | SO pull idempotent — same SO re-pulled = no duplicate WO | Block (service-layer) |
| V-PLAN-D365-004 | D365 sync errors logged to outbox_events | Block |

### 15.7 Retirement path

Per 00-FOUNDATION §4.2 goal: Monopilot eventually replaces D365. D365 integration kept za feature flag — po retirement:
- `integration.d365.enabled = false` org-wide
- WOs source_of_demand = 'manual' / 'forecast' (Phase 2)
- Migration: export SO-derived WO history to dim_sales_orders (12-REPORTING)

---

## §16 — Workflow-as-Data + Build Sequence + Open Questions + References

### 16.1 Workflow-as-Data integration (ADR-029)

**FR-PLAN-040:**

State machines ADR-007 (WO) i ADR-019 (TO) oraz PO lifecycle przeniesione z hardcoded service do **DSL rules w 02-SETTINGS §7 registry**:

**Rule IDs:**
- `wo_state_machine_v1` — WO transitions + guards + side effects
- `to_state_machine_v1` — TO transitions
- `po_state_machine_v1` — PO transitions
- `allergen_sequencing_heuristic_v1` — §10 heuristic
- `cascade_generation_v1` — §8.4 DAG algorithm
- `material_reservation_policy_v1` — §9 hard-lock semantics

**Pattern:**
- Rules authored by dev (PR → migration file → deploy)
- Admin read-only view w 02-SETTINGS §7 (list + diff + audit + dry-run)
- Runtime engine `@monopilot/workflow-engine` evaluates rule definition + calls side-effect hooks (notification, outbox emit, DB mutation)
- Changes require new rule_version (v2 side-by-side with v1 for A/B / canary rollout)

**Rollout model:**
- v1 = P1 baseline, stable Apex + any new tenant
- v2 = enhancements (e.g., full allergen optimizer → delta vs heuristic), per-tenant opt-in
- Both versions run in parallel for monitoring period

### 16.2 Build sequence 04-PLANNING-a..d

Per 00-FOUNDATION §4.2 build rozbicie:

| Sub-module | Scope | Sesji est. |
|---|---|---|
| **04-PLANNING-a** Suppliers & PO | Supplier CRUD + supplier_products + PO 3-step + bulk + approval + D365 supplier pull consumer + outbox events | 5-6 |
| **04-PLANNING-b** Transfer Orders | TO CRUD + state machine (via registry) + partial shipments + LP pre-select + 05-WAREHOUSE handoff | 3-4 |
| **04-PLANNING-c** Work Orders + DAG | WO CRUD + BOM snapshot + wo_outputs + wo_dependencies cascade + hard-lock reservation + rework + release-to-warehouse + workflow-as-data integration | 6-8 |
| **04-PLANNING-d** Dashboard + Settings + Integrations | Planning Dashboard + Settings + allergen sequencing heuristic + finite-capacity stub + D365 SO trigger + status display + cron jobs | 4-5 |

**Total:** 18-23 sesji implementation (writing done w Phase C2 Sesja 1).

**Prerequisites (must be DONE before 04-PLANNING-a start):**
- 01-NPD impl complete (Phase B build)
- 02-SETTINGS impl complete (C1 build post-writing) — especially §7 rule registry + §11 D365 Constants + §12 infrastructure
- 03-TECHNICAL impl complete — especially §5 items + §7 BOM + §13 D365 adapter

**Sequential build:** 04-a → 04-b → 04-c → 04-d (no parallel). Each sub-module: stories → QA → regression → close przed next.

### 16.3 Open questions

| # | Question | Scope | Resolution target |
|---|----------|-------|---------------|
| OQ1 | Cascade generation re-run behavior po BOM change | Czy re-cascade auto-updates child WOs, czy tylko warning? | Resolve w 04-PLANNING-c impl |
| OQ2 | Allergen sequencing granularity dla P1 heuristic | Line-level only, czy multi-line cross-optimization? | P1 = line-only, multi w 07 |
| OQ3 | D365 SO pull window_days default | 14? 30? Per-tenant config? | Config z default 14, Apex może override |
| OQ4 | Hard-lock reservation vs soft reservation w scheduling window | Hard immediately, czy soft first → hard on release? | P1 = hard on release only, soft w P2 |
| OQ5 | WO cancellation cascade behavior | Cancel parent WO → auto-cancel children, czy only warn? | Warn + require explicit child cancel |
| OQ6 | Changeover time modeling | Hardcoded 30min default lub lookup per allergen pair z 03-TECHNICAL §10.5? | Hardcoded P1, lookup 07 |
| OQ7 | Overproduction semantics w cascade | Parent overproduces → child gets bonus intermediate qty — how tracked? | Phase 2 — needs 08-PRODUCTION data |
| OQ8 | wo_dependencies integrity on BOM evolution | BOM v1 → v2 with different intermediate structure — impact na active cascade WOs? | Snapshot immutable (per ADR-002); new WOs use new BOM |

### 16.4 Validation index

| ID Prefix | Entity | Count |
|-----------|--------|-------|
| V-PLAN-PO-xxx | Purchase Orders | 7 |
| V-PLAN-TO-xxx | Transfer Orders | 6 |
| V-PLAN-WO-xxx | Work Orders | 9 |
| V-PLAN-RES-xxx | Reservations | 4 |
| V-PLAN-SEQ-xxx | Sequencing | 3 |
| V-PLAN-SET-xxx | Settings | 4 |
| V-PLAN-D365-xxx | D365 Integration | 4 |
| **TOTAL** | | **37** |

### 16.5 References

**Foundation:**
- `00-FOUNDATION-PRD.md` v3.0 §4 Module Map, §5 Tech Stack, §7 Rule Engine DSL
- `_foundation/META-MODEL.md`
- `_foundation/decisions/MONOPILOT-V2-ARCHITECTURE.md` (Phase D 23 decisions + #14 Meat_Pct + #19 N+1 Builder)
- `_foundation/research/MES-TRENDS-2026.md` §3 food-mfg best practices + §9 04-PLANNING section

**ADRs:**
- ADR-002 — BOM Snapshot Pattern
- ADR-003 — RLS tenant isolation
- ADR-007 — Work Order State Machine (now in rule registry)
- ADR-010 — Product Procurement (lead time + MOQ)
- ADR-013 — Multi-tenant RLS
- ADR-015 — Service Layer + Zod
- ADR-016 — CSV Import (Phase 2)
- ADR-019 — Transfer Order State Machine (now in rule registry)
- ADR-028 — Schema-driven Columns
- ADR-029 — Rule Engine DSL + Workflow-as-Data
- ADR-030 — Configurable Dept Taxonomy
- ADR-031 — Multi-tenant L1-L4

**Sibling PRDs:**
- `01-NPD-PRD.md` v3.0 — source_of_demand flow, Built flag reset pattern
- `02-SETTINGS-PRD.md` v3.0 — §6 Schema admin wizard, §7 Rule registry, §9 L2 dept config, §11 D365 Constants admin, §12 infrastructure
- `03-TECHNICAL-PRD.md` v3.0 — §5-§6 items + product master, §7 BOM + co-products, §8 catch weight, §10 allergens + §10.5 contamination matrix, §13 D365 Integration stage 1

**Downstream (PRDs generated w C2+):**
- `05-WAREHOUSE-PRD.md` (C2 session 2) — LP lifecycle, FEFO, GRN, put-away, locations (dependency)
- `06-SCANNER-P1-PRD.md` (C2 session 3) — PWA, pick workflow reads released_to_warehouse flag
- `07-PLANNING-EXT-PRD.md` (C3) — full allergen optimizer, finite-capacity engine, demand forecasting
- `08-PRODUCTION-PRD.md` (C3) — WO execution, changeover gate, output recording

**External references (reality sources):**
- `_meta/reality-sources/pld-v7-excel/EVOLVING.md` — intermediate cascade planned (Builder_FA5101 N+1 pattern)
- `_meta/reality-sources/pld-v7-excel/D365-INTEGRATION.md` — D365 integration context
- `_meta/reality-sources/pld-v7-excel/WORKFLOW-RULES.md` — Apex planning workflow reality

**Research:**
- MES-TRENDS-2026.md §3 (finite-capacity, allergen-aware sequencing, demand forecasting), §7 (scheduling mobile handoff), §9 (04-PLANNING specifics)

**ICS 95.020 MES reference:**
- ISA-95 Level 3 operations management (PPR - Personnel/Production/Resources)
- B2MML standard dla D365 integration events (future alignment)

### 16.6 Changelog

**v3.1 (2026-04-20, Phase C2 Sesja 2 revision — cross-PRD consistency z 05-WAREHOUSE v3.0):**
- **Q6 C2 Sesja 2 REVISION**: intermediate cascade disposition scope narrowed to `to_stock` **only** w P1. `direct_continue` + `planner_decides` deferred → P2 (WH-E17) jeśli real demand
- **§5.10** `wo_material_reservations` scope narrowed: **tylko RM root** (material_source='stock'). Intermediate cascade zero reservations. Insert guard V-PLAN-RES-005 dodany.
- **§8.5** disposition policy: `to_stock` jako jedyna wartość P1, CHECK constraint enforced. Schema column retained dla future-proofing.
- **§8.6** material availability: projection-based dla 'upstream_wo_output' (actual @ COMPLETED, projected @ IN_PROGRESS/RELEASED), zero reservation.
- **§9.2** reservation creation: `DRAFT→RELEASED` trigger creates reservations **tylko** dla material_source='stock'. Intermediate = Scanner scan-to-wo runtime (05-WAREHOUSE §10.5).
- **§9.4** cancellation handling: intermediate WO cancel = zero cleanup (LP resilience).
- **Rationale**: Apex reality (intermediate buffer between ops), WO interrupt resilience, natural out-of-order consumption, simpler audit chain.
- **Cross-PRD consistency**: 05-WAREHOUSE v3.0 §10 Intermediate LP Handling = canonical spec; 04-PLANNING v3.1 reflects downstream handoff.

**v3.0 (2026-04-20, Phase C2 Sesja 1):**
- **Complete rewrite** vs v3.2 baseline (595 → ~1400+ linii)
- Renumbering per Phase D: M04 → 04-PLANNING-BASIC; M03 (Warehouse) → 05-WAREHOUSE; M05 (Scanner) → 06-SCANNER-P1; M06 (Production) → 08-PRODUCTION; M10 (Finance) → 10-FINANCE
- Added **intermediate cascade DAG** §8.4 — catalog-driven, nie flag-gated, per Apex reality (Q6 revised 2026-04-20)
- Added **wo_outputs table** §5.8 — co-products + byproducts + primary output w ramach jednego WO
- Added **wo_dependencies table** §5.9 — DAG edges z cycle detection
- Added **Allergen-Aware WO Sequencing §10** [APEX→UNIVERSAL, [EVOLVING]] — basic heuristic P1, full optimizer 07
- Added **Finite-Capacity Scheduling Stub §11** [EVOLVING → 07-PLANNING-EXT]
- Added **D365 SO Trigger §15** [LEGACY-D365] — full integration stage 1 consumer side
- Added **Workflow-as-data integration §16.1** — state machines jako rule registry DSL (per Q2 C1)
- Added **Meat_Pct multi-comp** §8.9 [APEX-CONFIG] — Phase D #14
- Added **Configurable status display** §14.2 — names/colors only, workflow stały (per Q2 C1)
- Added **Schema-driven ext cols** — all entities z `ext_jsonb` + `schema_version` (ADR-028 L3)
- Added **Outbox events** — all state transitions emit events
- Added **Multi-tenant L1-L4 markers** throughout
- Expanded validation: 29 → 37 V-PLAN-xxx rules
- Build sequence: 4 sub-modules 04-PLANNING-a..d (18-23 sesji impl est.)
- 37 validation rules grouped across PO/TO/WO/RES/SEQ/SET/D365
- Open questions: 8 carry-forward items for impl

**v3.2 (2026-02-18, pre-Phase-D baseline):**
- Added planning_settings 18 kolumn schema
- Hard-lock reservation (nie soft)
- Rework WO (is_rework) bez BOM
- Configurable statuses = tylko names/colors
- Release to warehouse = Scanner visibility flag
- TO intra-site only (multi-site w M11)

**v3.1, v3.0:** Baseline history — pre-Phase-D numbering.

---

**Limity:**
- PRD plik ~25k tokenów, zgodnie z wzorcem 02-SETTINGS / 03-TECHNICAL
- 16 sekcji per Phase C1 template

---

_PRD 04-PLANNING-BASIC v3.0 — 16 sections, 40+ FRs, 13 tables (3 new: wo_outputs, wo_dependencies, updated work_orders), 37 validation rules, 4 sub-modules build sequence, 8 open questions._

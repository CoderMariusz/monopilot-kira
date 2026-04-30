---
module: 03-TECHNICAL
version: 3.1
status: Phase C1 writing
primary: false
role: product-master + bom + quality specs + D365 sync
depends_on: [00-FOUNDATION, 02-SETTINGS, 01-NPD]
depended_on_by: [04-PLANNING-BASIC, 05-WAREHOUSE, 08-PRODUCTION, 09-QUALITY, 10-FINANCE, 11-SHIPPING, 12-REPORTING]
written: 2026-04-20
---

# PRD 03-TECHNICAL — MonoPilot MES

**Product master + BOM + quality specs + D365 sync module.** Dostarcza item master (RM / intermediate / FG), BOM versioning + co-products, catch weight, shelf-life regulatory, allergens full cascade (building na 01-NPD §8 + Reference.Allergens z 02-SETTINGS §8), cost_per_kg per-item, routing + resources, D365 items/BOM/formula **one-way pull** + production confirmations push (INTEGRATIONS stage 1 technical side).

---

## §1 — Executive Summary

**v3.0 vs pre-Phase-D baseline (v1.x, 828 linii, 8 epics E02.1-E02.8):**

Rozszerzamy baseline o 6 obszarów mandated przez Phase D architecture + discovery z 01-NPD B.2:

1. **Intermediate product support (§6)** — item types `rm` / `intermediate` / `fg` + WIP codes (WIP-<suffix>-<sequence>). Phase D decision #19 (D365 Builder N+1) wymaga intermediate jako first-class citizens w item master.
2. **Allergens full cascade (§10)** — building na 01-NPD §8 (RM→intermediate→FG) + Reference.Allergens z 02-SETTINGS. Allergen profile per item + supplier spec integration + ATP swab lab results + cross-contamination risk matrix.
3. **BOM versioning + co-products (§7)** — effective-dated BOM versions, co-product allocation %, scrap rates, BOM Generator button (EVOLVING §11) batch-exports gotowe FGs jako BOM_FG<code>.xlsx.
4. **Catch weight + tare/gross/nominal (§8)** — mode per-item (fixed vs catch), scale integration spec, label weight vs actual variance tracking.
5. **D365 Integration stage 1 technical (§13)** — items + BOM/formula **pull** (nightly cron + on-demand), production confirmations **push** to D365 journal. Retry + dead-letter queue + idempotent mutations [R14].
6. **Schema-driven extensibility** — wszystkie item specs + supplier attrs L3-ready via `reference_schemas` z 02-SETTINGS (ADR-028).

**Pozostałe sekcje** (§9 shelf-life regulatory, §11 cost_per_kg, §12 routing + resources) = refinement baseline z markerami Phase D i regulacyjnym roadmap z MES-TRENDS §9.

Status: `[UNIVERSAL]` dla core (item master, BOM, allergens EU-14), `[APEX-CONFIG]` dla Apex-specific (processes ruchome A/B/C/E/F/G/H/R, 5 D365 constants overlap z 02-SETTINGS §11), `[LEGACY-D365]` dla sync integration, `[EVOLVING]` dla BOM Generator button + allergen aggregation + ProdDetail multi-component semantyka.

---

## §2 — Objectives & Success Metrics

### Cel główny

**Technical/Quality team może zdefiniować product master z pełnym BOM + regulatory specs + allergens cascade w <15min per FG**, utrzymać version history, sync z D365 bez manual paste, i wspierać zarówno catch-weight jak i fixed-weight produkty.

### Cele szczegółowe

1. **Item master universal** — RM / intermediate / FG w jednej tabeli z schema-driven extensions (ADR-028). Intermediate products first-class (N+1 per FG z 01-NPD §10).
2. **BOM versioning** — effective-dated versions, co-product allocation, scrap rates per component, BOM snapshot pattern (baseline ADR-002) z version history.
3. **Allergens cascade end-to-end** — RM allergen profile → propagacja do intermediate → FG aggregation. Manual override audited. Cross-contamination risk matrix per manufacturing operation.
4. **Shelf-life regulatory** — use-by vs best-before distinction, BRCGS v9 + FSMA 204 traceability foundation, date code generation (`Date_Code` z 01-NPD Planning dept).
5. **Catch weight support** — mode per-item, scale integration spec, nominal vs actual variance tracking, GS1 AI (3103/3922) compatible.
6. **D365 sync stage 1** — items + BOM pull nightly + on-demand, confirmations push, retry + DLQ, zero-downtime feature flag toggle.
7. **Cost_per_kg governance** — per-item attr, version history (effective dates), variance roll w 10-FINANCE.

### Metryki sukcesu

| Metric | Target | Źródło |
|---|---|---|
| Time to define new FG (item + BOM + specs) | <15 min P50 | Telemetry product_master.created_at vs first BOM save |
| BOM version history completeness | 100% mutations tracked | audit_log BOM_* tables |
| Allergen propagation accuracy | 100% (FG allergens = DISTINCT union of RM components, zero drift) | Nightly reconciliation job |
| D365 pull success | ≥99% nightly cycle | Sync audit §13 |
| D365 push success (confirmations) | ≥95% | DLQ depth monitoring |
| Catch weight adoption (if enabled) | Per-order variance ≤5% nominal | WO actual vs label weight delta |
| Shelf-life regulatory flags | 0 missing (FG w/o shelf_life + use_by_mode blocked @ V-TEC-10) | Validation dashboard |

---

## §3 — Personas & RBAC Overview

### Primary

| Persona | Role | Główne zadania | Marker |
|---|---|---|---|
| **Quality Lead / Technical Manager** | `quality_lead` | Product master CRUD, BOM approve, allergen profiles, shelf-life compliance, lab result review | [UNIVERSAL] |
| **Jane (NPD Manager)** | `npd_manager` | Tworzy items z NPD flow (RM import from brief, intermediate via cascade, FG via Builder), initiates BOM Generator | [APEX-CONFIG z [UNIVERSAL] rolą] |
| **NPD Team** | `npd_team` | RM creation (basic attrs), contribution do BOM draft, supplier link | [UNIVERSAL] |
| **Admin** | `owner` / `admin` | D365 sync config, `integration.d365.enabled` toggle, item schema extensions (via 02-SETTINGS §6) | [UNIVERSAL] |
| **Auditor** | `auditor` | Read-only item history, BOM version diffs, allergen audit trail, regulatory reports | [UNIVERSAL] |

### Permission surface

- `technical.items.create` / `edit` / `deactivate`
- `technical.bom.create` / `approve` / `version_publish`
- `technical.allergens.edit` (per-item override) — audited
- `technical.cost.edit` — restricted to `quality_lead` + `owner`
- `technical.d365.sync.trigger` — manual pull/push button (admin only)
- `technical.bom.generate_batch` — BOM Generator button (NPD Manager + quality_lead)

---

## §4 — Scope

### 4.1 In Scope — Phase 1 MVP

- **E03.1 Product Master**: items (RM / intermediate / FG) CRUD + schema-driven L3 extensions
- **E03.2 BOM & Recipes**: header + lines + co-products + scrap rates + version history + snapshot pattern (ADR-002)
- **E03.3 BOM Generator**: button batch-exports gotowe FGs jako per-FG BOM files (EVOLVING §11)
- **E03.4 Catch Weight**: mode per-item, scale integration spec, GS1 AI support
- **E03.5 Shelf Life**: days + use_by / best_before mode + date code format config
- **E03.6 Allergens**: item profiles + cascade rule (RM→intermediate→FA) + manual override audit + cross-contamination risk matrix
- **E03.7 Cost_per_kg**: per-item attr z effective dates
- **E03.8 Routing + Resources**: operations sequence + setup/run times + resource mapping
- **E03.9 D365 Integration stage 1**: items + BOM pull (nightly + on-demand), confirmations push, retry + DLQ
- **E03.10 Traceability foundation**: lot genealogy prep (consumed w 05-WAREHOUSE, 11-SHIPPING)
- **E03.11 Lab results integration**: ATP swab + allergen test results storage (feeds into 09-QUALITY)

### 4.2 In Scope — Phase 2

- **Advanced BOM**: phantom BOMs, by-products, ECO (Engineering Change Order) workflow
- **Advanced costing**: activity-based costing, overhead absorption, variance analysis (collab z 10-FINANCE)
- **Supplier portal integration**: supplier spec upload + auto-link do items (collab z 11-SHIPPING supplier module)
- **Digital SOPs z versioningiem** (MES-TRENDS §9 03-TECHNICAL) — link do training records (BRCGS v9 competence)
- **LLM copilot** (Level 0/1 per MES-TRENDS §6) — troubleshooting Q&A over SOPs + regulatory corpus

### 4.3 In Scope — Phase 3

- **Recipe management advanced** (flavor / nutritional optimization)
- **Co-manufacturing support** (multi-site BOM allocation — collab z 14-MULTI-SITE)
- **Reverse logistics specs** (returns, rework routing)

### 4.4 Exclusions (nigdy w 03-TECHNICAL)

- Pricing (zostaje w Commercial baseline → Phase D renumbering na `price` dept; PRD roadmap)
- Commercial launch data (Launch_Date, Article_Number, Bar_Codes → 01-NPD Commercial dept)
- Warehouse operations (LP lifecycle → 05-WAREHOUSE)
- Work Order execution (WO lifecycle → 08-PRODUCTION)
- Full D365 replacement (stage 2+ distributed w C2-C5, a zastąpienie D365 w osobnej Phase post-C5)
- Direct DDL schema edit przez UI (per 02-SETTINGS §4.4 — schema L1 zmiana = controlled migration)

---

## §5 — Entity Model

### 5.1 Items (universal item master)

```sql
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  item_code TEXT NOT NULL,                               -- RM code | WIP-<suffix>-<sequence> | FG<digits>
  item_type TEXT NOT NULL,                               -- 'rm'|'intermediate'|'fg'|'co_product'|'byproduct'
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',                 -- 'draft'|'active'|'deprecated'|'blocked'

  -- Classification
  product_group TEXT,                                    -- FinGoods (Apex) + custom per org
  uom_base TEXT NOT NULL,                                -- 'kg'|'g'|'l'|'ml'|'pcs'
  uom_secondary TEXT,                                    -- for catch-weight: nominal unit
  gs1_gtin TEXT,                                         -- global trade item number

  -- Weight model
  weight_mode TEXT NOT NULL DEFAULT 'fixed',             -- 'fixed'|'catch'
  nominal_weight NUMERIC(10,4),                          -- base weight per piece
  tare_weight NUMERIC(10,4),                             -- packaging weight
  gross_weight_max NUMERIC(10,4),                        -- for catch weight limits
  variance_tolerance_pct NUMERIC(5,2) DEFAULT 5.0,       -- catch-weight tolerance

  -- Shelf life
  shelf_life_days INT,
  shelf_life_mode TEXT DEFAULT 'use_by',                 -- 'use_by'|'best_before'
  date_code_format TEXT,                                 -- pattern: 'YYWW', 'YYYY-MM-DD', 'JJWW' etc.

  -- Cost
  cost_per_kg NUMERIC(10,4),                             -- current active cost (history w §11)

  -- D365 mirror fields
  d365_item_id TEXT,                                     -- FK (soft) to D365 item catalog
  d365_last_sync_at TIMESTAMPTZ,
  d365_sync_status TEXT DEFAULT 'unsynced',              -- 'unsynced'|'synced'|'drift'|'error'

  -- Schema-driven extensions (ADR-028)
  ext_jsonb JSONB DEFAULT '{}',                          -- L3 org-specific cols
  private_jsonb JSONB DEFAULT '{}',                      -- L4 org-private

  -- Metadata
  schema_version INT NOT NULL DEFAULT 1,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(org_id, item_code)
);

CREATE INDEX idx_items_org_type ON items(org_id, item_type, status);
CREATE INDEX idx_items_d365 ON items(org_id, d365_item_id) WHERE d365_item_id IS NOT NULL;
CREATE INDEX idx_items_ext_jsonb ON items USING GIN (ext_jsonb);
```

### 5.2 BOM (header + lines + co-products + version)

```sql
CREATE TABLE bom_headers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  item_id UUID NOT NULL REFERENCES items(id),            -- parent (intermediate or FA)
  version INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',                  -- 'draft'|'approved'|'active'|'superseded'
  yield_pct NUMERIC(6,3) DEFAULT 100.000,                -- per-BOM overall yield
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, item_id, version)
);

CREATE TABLE bom_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_header_id UUID NOT NULL REFERENCES bom_headers(id) ON DELETE CASCADE,
  line_no INT NOT NULL,
  component_item_id UUID NOT NULL REFERENCES items(id),  -- RM or intermediate
  quantity NUMERIC(14,6) NOT NULL,
  uom TEXT NOT NULL,
  scrap_pct NUMERIC(5,2) DEFAULT 0.00,                   -- component-level scrap
  manufacturing_operation_name TEXT,                    -- operation name from Reference.ManufacturingOperations
  sequence INT,                                          -- consumption order
  is_phantom BOOLEAN DEFAULT false,                      -- Phase 2
  notes TEXT,
  UNIQUE(bom_header_id, line_no)
);

CREATE TABLE bom_co_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_header_id UUID NOT NULL REFERENCES bom_headers(id) ON DELETE CASCADE,
  co_product_item_id UUID NOT NULL REFERENCES items(id),
  quantity NUMERIC(14,6) NOT NULL,
  uom TEXT NOT NULL,
  allocation_pct NUMERIC(6,3) NOT NULL,                  -- cost allocation % (sum = 100 across all co-prods + parent)
  is_byproduct BOOLEAN DEFAULT false,                    -- byproduct = no positive value, cost allocation 0
  UNIQUE(bom_header_id, co_product_item_id)
);

-- Snapshot pattern (ADR-002) — immutable snapshot applied at WO creation
CREATE TABLE bom_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  work_order_id UUID,                                    -- FK to 08-PRODUCTION.work_orders
  bom_header_id UUID NOT NULL REFERENCES bom_headers(id),
  snapshot_json JSONB NOT NULL,                          -- full BOM flattened (header + lines + co-prods)
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 5.3 Cost history

```sql
CREATE TABLE item_cost_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  item_id UUID NOT NULL REFERENCES items(id),
  cost_per_kg NUMERIC(10,4) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'PLN',
  effective_from DATE NOT NULL,
  effective_to DATE,
  source TEXT,                                           -- 'manual'|'d365_sync'|'supplier_update'|'variance_roll'
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_item_cost_active ON item_cost_history(org_id, item_id, effective_from DESC);
```

### 5.4 Allergens (ties to 02-SETTINGS §8 + 01-NPD §8)

```sql
CREATE TABLE item_allergen_profiles (
  org_id UUID NOT NULL REFERENCES organizations(id),
  item_id UUID NOT NULL REFERENCES items(id),
  allergen_code TEXT NOT NULL,                           -- FK (soft) to reference_tables.allergens_reference.row_key
  source TEXT NOT NULL,                                  -- 'brief_declared'|'supplier_spec'|'lab_result'|'cascaded'|'manual_override'
  intensity TEXT DEFAULT 'contains',                     -- 'contains'|'may_contain'|'trace'
  confidence TEXT NOT NULL DEFAULT 'declared',           -- 'declared'|'tested'|'assumed'
  declared_by UUID REFERENCES users(id),
  declared_at TIMESTAMPTZ DEFAULT now(),
  manual_override_reason TEXT,
  PRIMARY KEY (org_id, item_id, allergen_code)
);

CREATE TABLE manufacturing_operation_allergen_additions (
  org_id UUID NOT NULL REFERENCES organizations(id),
  manufacturing_operation_name TEXT NOT NULL,            -- from Reference.ManufacturingOperations
  allergen_code TEXT NOT NULL,
  reason TEXT,                                           -- 'marinade contains X' etc.
  PRIMARY KEY (org_id, manufacturing_operation_name, allergen_code)
);

-- Cross-contamination risk matrix (per line/machine)
CREATE TABLE allergen_contamination_risk (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  line_id UUID REFERENCES production_lines(id),
  machine_id UUID REFERENCES machines(id),
  allergen_code TEXT NOT NULL,
  risk_level TEXT NOT NULL,                              -- 'high'|'medium'|'low'|'segregated'
  mitigation TEXT,                                       -- 'full_clean_required'|'barrier_between_runs'|'dedicated_line'
  last_assessed_at TIMESTAMPTZ,
  assessed_by UUID REFERENCES users(id)
);
```

### 5.5 Lab results + supplier spec

```sql
CREATE TABLE lab_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  item_id UUID REFERENCES items(id),
  work_order_id UUID,                                    -- optional link to WO (09-QUALITY)
  test_type TEXT NOT NULL,                               -- 'atp_swab'|'allergen_elisa'|'micro_apc'|'nutrition'
  test_code TEXT,
  result_value NUMERIC(14,4),
  result_unit TEXT,
  result_status TEXT NOT NULL,                           -- 'pass'|'fail'|'inconclusive'|'pending'
  threshold_rlu NUMERIC(10,2),                           -- for ATP (max 10 per 00-FOUNDATION §7 example)
  tested_at TIMESTAMPTZ,
  lab_provider TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE supplier_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  item_id UUID NOT NULL REFERENCES items(id),
  supplier_code TEXT NOT NULL,
  spec_document_url TEXT,                                -- S3 / Blob storage link
  spec_version TEXT,
  issued_date DATE,
  expiry_date DATE,
  declared_allergens TEXT[],                             -- supplier-declared allergens codes
  declared_attrs JSONB DEFAULT '{}',                     -- nutrition, origin, certifications
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  uploaded_by UUID REFERENCES users(id)
);
```

### 5.6 Routing + resources

```sql
CREATE TABLE routings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  item_id UUID NOT NULL REFERENCES items(id),
  version INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',                  -- 'draft'|'approved'|'active'|'superseded'
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  UNIQUE(org_id, item_id, version)
);

CREATE TABLE routing_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routing_id UUID NOT NULL REFERENCES routings(id) ON DELETE CASCADE,
  op_no INT NOT NULL,
  op_code TEXT NOT NULL,                                 -- 'mix'|'cook'|'cool'|'pack'|custom
  op_name TEXT NOT NULL,
  line_id UUID REFERENCES production_lines(id),
  machine_id UUID REFERENCES machines(id),
  setup_time_min INT DEFAULT 0,
  run_time_per_unit_sec NUMERIC(10,2),
  cost_per_hour NUMERIC(10,4),                          -- routing-level cost (ADR-009)
  manufacturing_operation_name TEXT,                     -- matches bom_lines.manufacturing_operation_name
  UNIQUE(routing_id, op_no)
);
```

### 5.7 D365 sync state

```sql
CREATE TABLE d365_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  direction TEXT NOT NULL,                               -- 'pull'|'push'
  target_entity TEXT NOT NULL,                           -- 'items'|'bom'|'formula'|'wo_confirmation'|'journal'
  status TEXT NOT NULL DEFAULT 'scheduled',              -- 'scheduled'|'running'|'completed'|'failed'|'dlq'
  records_processed INT DEFAULT 0,
  records_failed INT DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_summary TEXT,
  trigger_source TEXT,                                   -- 'cron'|'manual'|'event'
  idempotency_key TEXT UNIQUE,                           -- [R14]
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE d365_sync_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_job_id UUID REFERENCES d365_sync_jobs(id),
  record_key TEXT NOT NULL,                              -- d365 item id / local uuid
  payload JSONB NOT NULL,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  last_retry_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**RLS:** wszystkie tabele org-scoped z policy `USING (org_id = current_setting('app.current_org_id')::uuid)`.

---

## §6 — Product Master

### 6.1 Item types

| Type | Description | Kod pattern | Example |
|---|---|---|---|
| `rm` | Raw Material (z supplier, brief-seeded lub D365 pull) | `RM<digits>` lub custom | `RM1234`, `SALT-01` |
| `intermediate` | In-process semi-finished (work-in-progress) | `WIP-<2-letter-suffix>-<7-digit-sequence>` | `WIP-BK-0000001` (after Bake), `WIP-MX-0000042` (after Mix) |
| `fg` | Finished Goods (end product for sale) | `FG<digits>` lub `FG<code>` | `FG5101` |
| `co_product` | Output of process w pozytywną wartością (BOM co-product) | custom | `COP-OFFAL-01` |
| `byproduct` | Output bez wartości lub z kosztem utylizacji | custom | `BYP-FAT-WASTE` |

**Phase D #19 decision (N+1 per FG):** każdy intermediate WIP code w Apex Builder output wymaga osobnego item w item master. Np. FG5101 z 3 manufacturing operations generuje:
- `RM1234` (surowiec) — istnieje
- `WIP-CT-0000001` (po Coat) — item_type=intermediate
- `WIP-SL-0000001` (po Slice) — item_type=intermediate
- `WIP-RO-0000001` (po Roast) — item_type=intermediate, **rodzic FG**
- `FG5101` (finished goods) — item_type=fg

D365 Builder (z 01-NPD §10) consumes items[] gdzie `item_code IN ('WIP-CT-0000001','WIP-SL-0000001','WIP-RO-0000001','FG5101')` dla generate Formula_Version/Lines + Route_Headers.

### 6.2 CRUD operations

- `GET /api/technical/items` (filter: type, status, allergens, d365_sync_status)
- `GET /api/technical/items/:item_code`
- `POST /api/technical/items` (create — Zod validation z schema-driven §6 02-SETTINGS)
- `PUT /api/technical/items/:item_code` (update)
- `POST /api/technical/items/:item_code/deactivate` (soft)
- `POST /api/technical/items/bulk_upsert_from_d365` (internal, D365 pull sync)

### 6.3 Schema-driven extensions

L3 extensions via `items.ext_jsonb` (admin adds column via 02-SETTINGS §6 Schema wizard → runtime available tu). Przykłady:
- `nutrition_panel` — kcal, fat, protein, carb per 100g
- `country_of_origin` (ISO 3166-1)
- `organic_certified` (boolean)
- `halal_certified`, `kosher_certified`
- `bloom_gelatin_gel_strength`

L4 `private_jsonb` — per-tenant hidden (np. proprietary formulation notes).

### 6.4 Item lifecycle states

```
draft → active → deprecated (soft)
         │
         └→ blocked (hard stop, nie używać w nowych WO/BOMs)
```

Transitions audited (ADR-008 audit_log). `deprecated` items nie pojawiają się w dropdown picker dla new BOMs, ale existing BOMs reference zostają (snapshot pattern ADR-002 preserves).

### 6.5 UI surfaces

| Screen code | Screen | Capability |
|---|---|---|
| TEC-010 | Item List | Filter by type / status / allergens / last D365 sync |
| TEC-011 | Item Create Wizard | 4-step (basic + classification + weight mode + extensions) |
| TEC-012 | Item Detail | Tabs: overview / BOM (§7) / allergens (§10) / cost history (§11) / routing (§12) / supplier specs / lab results / D365 status |
| TEC-042 | Manufacturing Operation Allergen Additions | Config table editor (admin) |
| TEC-013 | Item Edit | RHF z Zod schema gen'd z `reference_schemas` |
| TEC-014 | Bulk Import CSV | Mass upload RMs z supplier spec |

### 6.6 Validation V-TEC-ITEM

- **V-TEC-01**: `item_code` unique per org, pattern match per type
- **V-TEC-02**: `weight_mode='catch'` wymaga `nominal_weight` + `gross_weight_max` + `variance_tolerance_pct`
- **V-TEC-03**: `item_type='intermediate'` wymaga parent BOM relationship (can be created implicit via Builder z 01-NPD), code pattern WIP-<suffix>-<sequence> validated
- **V-TEC-04**: `d365_item_id` unique gdy set (per tenant)
- **V-TEC-05**: Status transition rules — `blocked → active` wymaga reason + approval (ADR-008 audit)

---

## §7 — BOM Versioning + Co-products + BOM Generator

### 7.1 BOM header + lines structure

Per §5.2 SQL. Kluczowe patterns:

- **Effective-dated versions**: nowy version = `status='draft'` → review → `approved` (approver + timestamp) → publish `active` + supersede prior version (`effective_to` na prior = `effective_from` na new -1day lub identical)
- **Snapshot pattern (ADR-002)**: przy WO creation (08-PRODUCTION) → `bom_snapshots` insert z flattened JSON. WO execution nigdy nie re-reads `bom_headers` live — tylko swój snapshot. Zmiana BOM po WO snapshot = no-op dla tego WO.
- **Yield %**: per-BOM header `yield_pct` overridable per routing (`routing_operations` mogą reduce yield per op)
- **Scrap %**: per `bom_lines.scrap_pct` — expected waste, feed into WO material forecast

### 7.2 Co-products + byproducts

- Co-product = output z positive market value (np. offal z butchery)
- Byproduct = output bez value (waste, scrap)
- `bom_co_products.allocation_pct` — cost allocation % (sum of parent + all co_products = 100.000). Byproducts mają allocation=0.
- Example: FG5101 produces 80% meat fillet + 15% offal (co-product) + 5% fat trim (byproduct):
  - FG5101: allocation_pct = 80.0
  - COP-OFFAL-01: allocation_pct = 20.0 (absorbuje cost proportionally)
  - BYP-FAT-01: allocation_pct = 0.0, is_byproduct=true

### 7.3 BOM Generator button (EVOLVING §11)

Per 01-NPD §6 cascading rules + Phase D open item EVOLVING §11:

**User intent** (reality):
> "bom generator powinien miec swoj button ktory naciskamy jak zbiera on gotowe fa i buduje z nich buildery jeden po drogim albo wspolny z wypelnionymi kolumnami. odrebny plik excel."

**UX flow:**
1. NPD Manager (Jane) na Dashboard klika "Generate BOM Batch"
2. Modal: pick selection scope — "All FAs with Status_Overall=Complete" vs "Selected FAs" (checkbox)
3. Picker: output mode — "per-FG files" (`BOM_FG<code>.xlsx` × N) vs "single batch file" (`BOM_Batch_<date>.xlsx` z N sheets lub single sheet)
4. Backend job (outbox pattern, async):
   - Collect items + BOM_Snapshots (or live BOM if WO not yet created)
   - Generate XLSX files (ExcelJS lub openpyxl worker)
   - Upload do S3 / Blob storage
   - Notification do user z download link
5. Audit log entry per generation (`action='bom_batch_generate'`)

**BOM Generator vs D365 Builder (01-NPD §10):** oba generują ale ortogonalne:
- BOM Generator = "what materials + co-products go in this product" (operational, internal, planning)
- D365 Builder = "send this item to ERP" (integration, 8 tabs per-FG)

### 7.4 BOM approval workflow

1. NPD creates draft → status=`draft`
2. Quality Lead reviews → sets approver feedback w notes
3. Quality Lead clicks "Approve" → `status='approved'`, `approved_by`, `approved_at` set
4. Publish button → `status='active'`, prior version auto-superseded (`effective_to` backfill)
5. Rollback available — publish prior version reverts

### 7.5 UI surfaces

| Screen code | Screen | Capability |
|---|---|---|
| TEC-020 | BOM List | Per item BOMs + versions timeline |
| TEC-021 | BOM Detail | Header + lines + co-products + yield/scrap calc preview |
| TEC-022 | BOM Edit | Line editor (drag-sort + process_stage picker) |
| TEC-023 | BOM Version Diff | Side-by-side JSON diff |
| TEC-024 | BOM Generator Modal | §7.3 UX flow |
| TEC-025 | BOM Snapshots Viewer | Historical snapshots per WO (immutable) |

### 7.6 Validation V-TEC-BOM

- **V-TEC-10**: `bom_headers.status='active'` wymaga approved_by + approved_at set
- **V-TEC-11**: `bom_lines` sum of components × quantities + yield% + scrap% ≈ parent output (±0.5% tolerance)
- **V-TEC-12**: `bom_co_products.allocation_pct` sum (parent + co-products non-byproduct) = 100.000
- **V-TEC-13**: Circular BOM detection — item_id=component_item_id blocked, transitive cycles blocked
- **V-TEC-14**: Component item status ∉ ('blocked','draft') for active BOM
- **V-TEC-15**: BOM Generator batch — only includes FGs z `Status_Overall='Complete'` (01-NPD §7)

---

## §8 — Catch Weight + Tare/Gross/Nominal

### 8.1 Weight model

Per-item `weight_mode`:
- `fixed` — all units identical weight (np. 250g pack of salt). `nominal_weight` = actual.
- `catch` — per-unit variable weight (np. meat fillet 200-280g range). `nominal_weight` = label target, actual captured per unit at weighing station.

### 8.2 Tare / gross / nominal semantyka

- **Nominal**: target weight per label (consumer-facing)
- **Tare**: packaging weight (empty package)
- **Gross**: nominal + tare (what scale reads when full)
- **Net**: gross - tare = actual product weight

For catch weight:
- `gross_weight_max`: upper hardware limit (scale max range)
- `variance_tolerance_pct`: allowed deviation from nominal (domyślnie 5%, per-item override)

### 8.3 Scale integration spec

**Protocol:** standard load-cell scales via:
- **USB HID** (most industrial scales) — captured via scanner PWA (06-SCANNER-P1) or desktop driver
- **Bluetooth SPP** (mobile scales)
- **Ethernet / OPC-UA** (advanced lines with Industry 4.0 gear)

Weight capture event → `work_order_items.actual_weight` (08-PRODUCTION) → roll-up WO variance per-unit.

### 8.4 GS1 support

Catch-weight products w GS1 AI encoding (R15):
- AI 01 — GTIN
- AI 3103 — net weight (6 digits, 3 decimal) OR
- AI 3922 — variable measure (cost price)
- AI 10 — lot
- AI 17 — expiry (YYMMDD)

GS1 Application Identifier composite barcode (GS1-128) generowany at label print (integration z 11-SHIPPING label service).

### 8.5 Variance tracking

Nightly job calculates:
- Per-item avg actual weight vs nominal
- Per-line variance distribution (stddev)
- Per-WO variance roll-up
- Alert gdy avg variance > threshold (config w 02-SETTINGS reference table)

### 8.6 Validation V-TEC-WT

- **V-TEC-20**: `weight_mode='catch'` → `nominal_weight` + `gross_weight_max` required, `variance_tolerance_pct` > 0
- **V-TEC-21**: `gross_weight_max` > `nominal_weight + tare_weight` × (1 + variance_tolerance_pct/100)
- **V-TEC-22**: Scale-captured weight within tolerance — outside = warning w WO, admin review
- **V-TEC-23**: GS1 AI 3103 format compliance (6 digits, 3 decimals) na weight-embedded barcode

---

## §9 — Shelf Life + Regulatory

### 9.1 Shelf life model

Per-item:
- `shelf_life_days` — integer days from production date
- `shelf_life_mode` — `use_by` (expiry, must not be consumed past) vs `best_before` (quality declines, still safe)

**EU distinction critical (Regulation 1169/2011):**
- Meat, fish, dairy fresh = `use_by` (safety)
- Dry goods, canned, preserved = `best_before` (quality)
- Choice affects label text: "Spożyć do" (use_by) vs "Najlepiej spożyć przed" (best_before) w PL

### 9.2 Date code format

`items.date_code_format` pattern, examples:
- `YYWW` — year + week number (Apex v7 Date_Code)
- `YYYY-MM-DD` — ISO date
- `JJWW` — julian day + week
- `YYJJJ` — year + julian day

Render function generates string from production date per format. Used w:
- Label printing (11-SHIPPING label service)
- Scanner scanner read-back (06-SCANNER-P1)
- Traceability queries (lot genealogy)

### 9.3 Regulatory roadmap (MES-TRENDS §10.2)

Per 00-FOUNDATION §11 regulatory roadmap (7 regs first-class):

| Reg | Scope | 03-TECHNICAL obligation |
|---|---|---|
| **EU 1169/2011** | Food info to consumers | Allergens declared (§10), shelf-life mode + date |
| **FSMA 204** (US) | Food Traceability Rule | Item lot genealogy + critical tracking events |
| **BRCGS v9** | Retail food safety | Digital SOPs (Phase 2), training records |
| **ISO 22000** | Food safety mgmt | Hazard analysis per item |
| **EU 2023/915** | Contaminants | Max levels monitoring (lab results §5.5) |
| **GS1 Digital Link** | 2D barcodes | AI composite codes (§8.4) |
| **Peppol** | e-Invoicing (PL 2026) | Item spec shareable (11-SHIPPING stage 4) |

### 9.4 Traceability foundation

Item-level lot genealogy supported:
- Item consumed w BOM snapshot → WO → LP (05-WAREHOUSE) → shipment (11-SHIPPING) → customer
- Inverse traceability: given LP, find all WOs → their BOMs → all ingredients lots up-stream

Phase 1 scope: data structure + API supporting queries. Full UI z traceability reports w 12-REPORTING (Phase 2).

### 9.5 UI surfaces

| Screen code | Screen | Capability |
|---|---|---|
| TEC-030 | Shelf Life Config | Per-item edit + date code preview |
| TEC-031 | Regulatory Compliance Dashboard | Per-item flag status (missing shelf-life, missing allergen declaration, missing BRCGS training link) |

### 9.6 Validation V-TEC-SHELF

- **V-TEC-30**: `shelf_life_days` required dla item_type='fa' (blocks activation bez)
- **V-TEC-31**: `shelf_life_mode` must be ∈ {use_by, best_before}
- **V-TEC-32**: `date_code_format` matches regex pattern (YYWW|YYYY-MM-DD|JJWW|YYJJJ|custom)
- **V-TEC-33**: Regulatory flag completeness — warning dashboard jeśli FA ma shelf_life ale brak allergen declaration

---

## §10 — Allergens Full

**Building na:**
- 01-NPD §8 — allergen multi-level cascade (RM→intermediate→FG aggregation)
- 02-SETTINGS §8 — `reference_tables.allergens_reference` (EU-14 + org custom)
- EVOLVING §4 — reality spec + cascade logic
- 00-FOUNDATION §7 — allergen changeover gate rule (used w 08-PRODUCTION)

### 10.1 Allergen profile per item

Per §5.4 `item_allergen_profiles`:
- Primary source: `brief_declared` (NPD team z brief), `supplier_spec` (supplier document upload), `lab_result` (ATP/ELISA test)
- Derived source: `cascaded` (aggregated z components BOM lines)
- Override: `manual_override` (quality_lead decision, audited reason)

**Intensity levels:**
- `contains` — confirmed, must declare on label
- `may_contain` — cross-contamination risk
- `trace` — unintentional presence below threshold

**Confidence:**
- `declared` — document said so (supplier or brief)
- `tested` — lab verified
- `assumed` — default propagation (cascade without override)

### 10.2 Cascade rule (via ADR-029 rule registry)

Rule stored w `rule_definitions` (02-SETTINGS §7 registry, dev-authored):

```json
{
  "rule_code": "allergen_cascade_rm_to_fg",
  "rule_type": "cascading",
  "triggers": [
    "bom_lines.insert",
    "bom_lines.update",
    "item_allergen_profiles.update WHERE item_type='rm'"
  ],
  "logic": {
    "for_each_parent_item": "SELECT DISTINCT item_id FROM bom_headers WHERE status='active'",
    "aggregate": {
      "select": "DISTINCT allergen_code, MAX(intensity_level), MAX(confidence)",
      "from": "item_allergen_profiles iap JOIN bom_lines bl ON bl.component_item_id = iap.item_id",
      "where": "bl.bom_header_id IN (active BOMs of parent_item)"
    },
    "merge_with": "manufacturing_operation_allergen_additions WHERE manufacturing_operation_name IN (BOM manufacturing_operation_names)",
    "write_to": "item_allergen_profiles (parent_item_id, source='cascaded')"
  },
  "override_protection": "PRESERVE manual_override rows (source='manual_override')"
}
```

Runtime engine picks up trigger events → runs aggregation → upserts cascaded rows. Manual overrides preserved.

### 10.3 Manual override audited

Admin/quality lead klika "Override allergen for FG<code>" → modal z reason TEXT required → upserts `source='manual_override'`, `manual_override_reason`, `declared_by`. Rule engine NIE nadpisuje `manual_override` rows (protection clause).

Audit log entry (ADR-008): `action='allergen_override'`, `new_data`=allergen_code+intensity+reason, visible w item detail tab TEC-012.

### 10.4 Manufacturing operation allergen additions

Per 01-NPD §8 — allergen może być dodany przez manufacturing operation (np. marinade z musztardą = adds A12 Mustard):
- `manufacturing_operation_allergen_additions` table stores manufacturing_operation_name → allergen_code mapping
- Cascade rule merges: FG allergens = UNION(RM allergens via BOM components) + UNION(manufacturing operation allergens added for each manufacturing_operation in BOM)
- Jane (NPD Manager) może edytować `manufacturing_operation_allergen_additions` w 02-SETTINGS §8 Reference CRUD (lub tu w TEC-042 UI)

### 10.5 Cross-contamination risk matrix

`allergen_contamination_risk` per line/machine → allergen:
- `high` — segregation needed, different run day
- `medium` — full cleaning between runs
- `low` — standard cleaning sufficient
- `segregated` — dedicated line, no risk

Feed into **allergen changeover gate** (00-FOUNDATION §7 example rule, executed w 08-PRODUCTION WO state transition):
- WO Next allergen-free claim + previous WO contains allergen X + line has `high`/`medium` risk for X → block transition until cleaning validation signed + ATP swab result `≤10 RLU` + dual sign-off (quality_lead + production_lead)

### 10.6 Lab results feed

`lab_results` (§5.5) with `test_type='allergen_elisa'` or `atp_swab` stored per item or per WO. ATP swab threshold `≤10 RLU` (baseline Apex, configurable w 02-SETTINGS `reference_tables.alert_thresholds`).

Lab result `fail` → blocks WO close gate (08-PRODUCTION), automatic notification to quality_lead.

### 10.7 UI surfaces

| Screen code | Screen | Capability |
|---|---|---|
| TEC-040 | Allergen Profile Editor | Per-item allergen picker + source + intensity + confidence |
| TEC-041 | Allergen Cascade Preview | For FG, shows derivation chain RM1→RM2→intermediate→FG |
| TEC-042 | Manufacturing Operation Allergen Additions | Config table editor (admin) |
| TEC-043 | Contamination Risk Matrix | Line × allergen grid edit |
| TEC-044 | Allergen Manual Override Audit | Override history z reasons |
| TEC-045 | Lab Results Log | Filter by item / WO / test type / result status |

### 10.8 Validation V-TEC-ALG

- **V-TEC-40**: Allergen code ∈ `reference_tables.allergens_reference.row_key` (FK integrity, EU-14 + org custom)
- **V-TEC-41**: FG allergen profile must be rebuilt if any component allergen profile changes (async job)
- **V-TEC-42**: Manual override wymaga non-empty `manual_override_reason`
- **V-TEC-43**: Cross-contamination risk matrix — każda aktywna line/machine × EU-14 allergen has entry (warning dashboard gdy missing)
- **V-TEC-44**: ATP swab `result_value > threshold_rlu` → status='fail' auto (trigger on insert)
- **V-TEC-45**: Cascaded allergens `source='cascaded'` never overwrite `source='manual_override'` (rule protection)

---

## §11 — Cost_per_kg

### 11.1 Per-item attr z history

`items.cost_per_kg` = current active cost (de-normalized dla fast lookup).
`item_cost_history` (§5.3) = effective-dated history.

Write path: admin/auto updates → insert w `item_cost_history` z `effective_from=today` → update `items.cost_per_kg` = new value. Prior row gets `effective_to=today-1`.

### 11.2 Source tracking

`item_cost_history.source`:
- `manual` — admin manual edit
- `d365_sync` — pulled from D365 nightly
- `supplier_update` — supplier spec upload triggers auto-cost refresh
- `variance_roll` — 10-FINANCE variance analysis roll-forward (month-end)

### 11.3 Currency handling

Default from `organizations.currency`. Multi-currency support Phase 2 (per `item_cost_history.currency`). Conversion at report time via exchange rate table (10-FINANCE).

### 11.4 Cost roll-up

FA cost = SUM(component.cost_per_kg × quantity × (1 + scrap_pct)) + routing operation costs (from `routing_operations.cost_per_hour × run_time`). Computed w 10-FINANCE (dependencies §16.1).

### 11.5 UI surfaces

| Screen code | Screen | Capability |
|---|---|---|
| TEC-050 | Cost History | Per-item timeline + source + created_by |
| TEC-051 | Cost Edit Modal | effective_from + value + source + notes |
| TEC-052 | Cost Import from D365 | Preview diff + confirm batch update |

### 11.6 Validation V-TEC-COST

- **V-TEC-50**: `cost_per_kg >= 0` (block negative)
- **V-TEC-51**: `effective_from` ≤ current date for active record
- **V-TEC-52**: Currency ∈ ISO 4217 supported list
- **V-TEC-53**: Cost change > 20% requires admin approval (high-variance guard)

---

## §12 — Routing + Resources

### 12.1 Routing structure

Per §5.6 — routings + routing_operations.

Each item może mieć zero lub jeden active routing. Multiple versions z effective dates (pattern similar do BOM §7.1).

### 12.2 Operations sequence

Per operation:
- `op_code` — standardowy (mix/cook/cool/pack) albo custom
- `line_id` + `machine_id` — resource binding
- `setup_time_min` — fixed changeover time
- `run_time_per_unit_sec` — variable time per unit produced
- `cost_per_hour` — routing-level cost (ADR-009)
- `process_stage` — matches BOM line process_stage (linking operation to which components consumed)

### 12.3 Resource mapping

Routing operations link do:
- `production_lines` (02-SETTINGS §12)
- `machines` (02-SETTINGS §12)
- Line capacity per hour (from `machines.capacity_per_hour`)

Used by 04-PLANNING-BASIC finite-capacity scheduling.

### 12.4 UI surfaces

| Screen code | Screen | Capability |
|---|---|---|
| TEC-060 | Routing List | Per item + version |
| TEC-061 | Routing Edit | Operations sequence editor + drag-sort |
| TEC-062 | Routing Cost Preview | Sum setup + run × expected volume |
| TEC-063 | Resource Utilization Preview | Gantt-lite per line |

### 12.5 Validation V-TEC-ROUT

- **V-TEC-60**: Routing ops sequence (op_no) contiguous, no gaps
- **V-TEC-61**: Each op has line_id OR machine_id (at least one) assigned
- **V-TEC-62**: `run_time_per_unit_sec` > 0 for production ops
- **V-TEC-63**: `manufacturing_operation_name` ∈ `reference_tables.manufacturing_operations.row_key` (per 00-FOUNDATION §9.1)

---

## §13 — D365 Integration Stage 1 (technical side)

**Marker:** `[LEGACY-D365]` bridge. Retirement path gdy Monopilot zastępuje D365 (post-C5 Phase).

**Scope stage 1** (HANDOFF §Phase C preview):
- **Pull** items + BOM/formula from D365 (read-mostly cache) — nightly cron + on-demand manual trigger
- **Push** production confirmations (WO completed) + journal postings to D365

### 13.1 Architecture

```
D365 ←── pull (nightly + on-demand) ──── Monopilot
     ──── push (on-WO-close) ────────→

Queue: outbox pattern (per 00-FOUNDATION §10)
  Monopilot → outbox events → worker → D365 API
  Failures → DLQ (§5.7)
  Idempotent: idempotency_key [R14]
```

### 13.2 Connection config (overlap z 02-SETTINGS §11)

Admin konfiguruje w SETTINGS > Integrations > D365 (02-SETTINGS §11.3):
- Base URL (D365 F&O environment)
- OAuth 2.0 service account credentials (encrypted via pgcrypto)
- API version
- Retry policy (3× exponential, 1s / 5s / 25s)

### 13.3 Pull flow: items + BOM/formula

**Nightly cron** (configurable, domyślnie 02:00 local org timezone):

1. Queue `d365_sync_jobs` insert `direction='pull', target_entity='items'`
2. Worker picks up, calls D365 Data Entity API `/data/Products?$filter=ModifiedDateTime gt :last_sync`
3. For each D365 item: UPSERT `items` (match by `d365_item_id`)
4. Detect drift: local field vs D365 field diff → log w audit_log `action='d365_drift'`
5. Same flow dla BOM: `/data/BOMVersions` + `/data/BOMLines` → UPSERT `bom_headers` + `bom_lines`
6. Complete → `d365_sync_jobs.status='completed'`, `records_processed`, `records_failed`

**On-demand manual trigger**: admin button "Sync from D365 now" w TEC-070 screen.

### 13.4 Push flow: WO confirmations

Trigger: 08-PRODUCTION WO status → `closed` event hits outbox.

1. Outbox event `wo.confirmation` consumed by D365 push worker
2. Worker builds D365 journal payload (Production Journal Lines format)
3. POST to D365 `/api/services/ProductionJournalService/SubmitJournal`
4. Success → `d365_sync_jobs.status='completed'`, event marked processed
5. Failure → retry (3× backoff), then DLQ (`d365_sync_dlq` insert)
6. Admin dashboard alert gdy DLQ depth > threshold

### 13.5 Idempotency [R14]

`d365_sync_jobs.idempotency_key` = hash of (entity + record_key + direction + payload_version). D365 push requests carry `x-idempotency-key` header; duplicate requests recognized + skipped server-side.

### 13.6 Feature flag

`integration.d365.enabled` (02-SETTINGS §10.2 core fallback). Flag flip requires:
- 5 Apex D365 constants populated (V-SET-42 validation passes)
- Test connection passes
- User role `owner` lub `npd_manager`

### 13.7 Error handling + monitoring

- **Retry policy** — 3× exponential backoff per request
- **Dead-letter queue** — `d365_sync_dlq` table stores failed records + error message
- **Monitoring**:
  - Admin dashboard shows last N sync runs + success rate
  - Alert gdy DLQ depth > 50 records
  - Alert gdy last_successful_sync > 48h ago
- **Manual resolution**: admin w TEC-073 screen może mark DLQ entry as resolved (manual intervention w D365 fixed, skip) lub retry

### 13.8 UI surfaces (cross-ref z 02-SETTINGS §11.3)

| Screen code | Screen | Capability |
|---|---|---|
| TEC-070 | D365 Sync Dashboard | Last runs + status + success rate |
| TEC-071 | Manual Sync Trigger | Pick entity + direction + confirm |
| TEC-072 | Sync Audit Log | Per-run detail z diff view |
| TEC-073 | DLQ Manager | Failed records + retry / mark resolved |

### 13.9 Retirement path

Gdy Monopilot zastępuje D365:
1. Feature flag `integration.d365.enabled=false`
2. Cron job disabled
3. Outbox events dla D365 push events archived (nie consumed)
4. `items.d365_item_id` preserved (historical) ale no live sync
5. `d365_sync_jobs` + DLQ retained for audit (7-year retention per ADR-008)

### 13.10 Validation V-TEC-D365

- **V-TEC-70**: Nie sync items bez `integration.d365.enabled=true` (reject API call 412 Precondition Failed)
- **V-TEC-71**: DLQ entry wymaga `error_message` non-empty
- **V-TEC-72**: Idempotency_key unique constraint enforces (duplicate detected → 409 Conflict)
- **V-TEC-73**: Pull conflict — local `items.updated_at > d365_last_sync_at` AND incoming D365 record differs → drift log + skip (do not overwrite local edits)

---

## §14 — Validations, KPIs, Success Criteria

### 14.1 Full validation list

| Range | Obszar | Sekcja |
|---|---|---|
| V-TEC-01..05 | Item master | §6.6 |
| V-TEC-10..15 | BOM | §7.6 |
| V-TEC-20..23 | Catch weight | §8.6 |
| V-TEC-30..33 | Shelf life | §9.6 |
| V-TEC-40..45 | Allergens | §10.8 |
| V-TEC-50..53 | Cost | §11.6 |
| V-TEC-60..63 | Routing | §12.5 |
| V-TEC-70..73 | D365 sync | §13.10 |

### 14.2 KPIs

**Operational:**
- Time to define new FG end-to-end: <15min P50
- BOM version approval turnaround: <24h P90
- Allergen profile completeness: 100% FGs have declared allergens (or explicit "none" override)

**Performance:**
- Item detail page load ≤200ms P95
- BOM cascade allergen propagation ≤5s after change
- D365 pull nightly cycle ≤60 min for 10k items

**Quality:**
- Allergen override rate <5% (too many manual = cascade logic needs review)
- D365 drift rate <1% (local vs D365 field mismatch)
- Lab result ATP swab pass rate ≥95%

**Integration:**
- D365 pull success rate ≥99%
- D365 push (confirmations) success rate ≥95%
- DLQ resolution SLA: <48h

### 14.3 Success Criteria (MVP)

**Funkcjonalne:**
- Item master CRUD operational for RM / intermediate / FA z schema-driven L3 extensions
- BOM versioning + co-products + BOM Generator button working
- Catch weight mode activation w UI + scale integration endpoint ready
- Shelf life use_by/best_before switch + date code format preview
- Allergen cascade rule deployed + active + lab result flow
- Cost history tracking + `source` attribution
- Routing operations CRUD + resource mapping
- D365 stage 1 pull + push operational, `integration.d365.enabled` toggle working
- BOM snapshot pattern at WO creation (08-PRODUCTION contract)

**Niefunkcjonalne:**
- RLS enforced all tables
- Schema-driven extensions propagate z 02-SETTINGS §6 Schema wizard within 5s
- D365 sync zero data loss (idempotent, drift detected, DLQ monitored)
- Audit log 100% mutations tracked

**Regulatory:**
- EU 1169/2011 allergen declaration complete dla wszystkich active FAs
- FSMA 204 traceability data structure ready (item lot genealogy queryable)
- GS1 AI (3103/3922) support dla catch weight items

---

## §15 — Dependencies, Build Sequence, Open Items

### 15.1 Dependencies

**Upstream** (blocking):
- 00-FOUNDATION v3.0 — tech stack, ADRs 028/029, regulatory roadmap
- 02-SETTINGS v3.0 — `reference_tables.allergens_reference`, `reference_tables.d365_constants`, `reference_schemas` dla L3 item extensions, rule registry (cascade rule deployed)
- 01-NPD v3.0 — Main Table schema (FA items tu lifted do item master), cascade + allergen foundation

**Downstream** (blocks):
- 04-PLANNING-BASIC (needs items + BOM + routing dla WO generation)
- 05-WAREHOUSE (needs items dla LP creation)
- 08-PRODUCTION (needs BOM snapshot pattern + routing + allergen gate)
- 09-QUALITY (needs lab_results + allergen data)
- 10-FINANCE (needs cost_per_kg + BOM cost roll-up)
- 11-SHIPPING (needs GS1 AI + shelf life for labels)
- 12-REPORTING (consumes everything above)

### 15.2 Build sequence — 4 sub-modules

Per 00-FOUNDATION §4.2 (writing batch, build sequential per submodule):

#### 03-TECHNICAL-a — Item Master + basic BOM

Scope:
- `items` CRUD (all types RM/intermediate/FA/co-product/byproduct)
- `bom_headers` + `bom_lines` + `bom_co_products` CRUD
- Item detail UI z tabs
- BOM version + approve workflow
- BOM snapshot pattern (trigger from 08-PRODUCTION WO create — stub now)
- Schema-driven L3 extensions via 02-SETTINGS §6 wizard
- Zod generation per items + BOM tables

Stories est.: 14-16. Sesji est.: 6-7.

Gate: 01-NPD build can reference item master for FA records; 04-PLANNING-BASIC może start.

#### 03-TECHNICAL-b — Allergens full + regulatory + shelf life

Scope:
- `item_allergen_profiles` + cascade rule deployed (via dev PR do 02-SETTINGS rule registry)
- `process_allergen_additions` + `allergen_contamination_risk` CRUD
- Manual override audit
- `lab_results` CRUD + ATP swab validation
- Shelf life mode + date code format
- Regulatory compliance dashboard
- Allergen cascade preview UI

Stories est.: 10-12. Sesji est.: 4-5.

Gate: 08-PRODUCTION allergen changeover gate rule can be deployed + tested.

#### 03-TECHNICAL-c — Catch weight + cost + routing

Scope:
- Catch weight mode + variance tracking
- Scale integration spec (endpoint stub, actual HW integration w 06-SCANNER-P1)
- `item_cost_history` CRUD + source tracking
- Cost import from D365 (prerequisite dla 03-TECHNICAL-d)
- Routings + operations CRUD
- Resource mapping UI

Stories est.: 8-10. Sesji est.: 3-4.

Gate: 10-FINANCE cost roll-up can start; 04-PLANNING-BASIC finite-capacity has routing data.

#### 03-TECHNICAL-d — D365 Integration stage 1

Scope:
- `d365_sync_jobs` + `d365_sync_dlq` schemas
- Pull worker (items, BOM, formula — nightly cron + on-demand)
- Push worker (WO confirmations — outbox consumer)
- Idempotency framework [R14]
- DLQ manager UI
- Sync audit log UI
- Feature flag `integration.d365.enabled` integration
- Connection test endpoint
- BOM Generator button (prerequisite features from -a, -b, -c)

Stories est.: 12-14. Sesji est.: 5-6.

Gate: integration.d365.enabled can be turned on for Apex beta.

**Total 03-TECHNICAL impl:** 44-52 stories, **18-22 sesji**.

### 15.3 Open Items

1. **BOM Generator output format** `[EVOLVING]` — per-FA file vs batch file vs hybrid. User Session 3 said both options; decision deferred do 03-TECHNICAL-d kick-off po rozmowie z Jane.
2. **ProdDetail multi-component semantyka** (EVOLVING §8) — Phase D open. Whether ProdDetail represents single PR with process history vs multi-component FA. Decision in 01-NPD build (cross-cuts 03-TECHNICAL bom_lines.process_stage mapping).
3. **Catch weight scale integration protocol choice** — USB HID primary, Bluetooth SPP secondary, OPC-UA deferred Phase 2. Confirm w 03-TECHNICAL-c kick-off.
4. **D365 pull vs drift resolution** — jeśli local edit + D365 edit conflict, whose wins? Current proposal: log drift, skip overwrite, admin manual resolve. Lock decision w 03-TECHNICAL-d.
5. **BOM phantom + ECO Phase 2** — scope + UX TBD Phase 2.
6. **Supplier portal integration Phase 2** — API vs email spec document upload workflow; collab z 11-SHIPPING.
7. **Multi-currency cost Phase 2** — exchange rate source, roll strategy (historical vs current).
8. **Allergen ELISA test results automation** — external lab API ingest (Phase 2 scope).
9. **Routing finite-capacity spec** — how 04-PLANNING-BASIC consumes routing data for scheduling. Collab spec needed w Phase C2.
10. **L1 promote from items.ext_jsonb to native col** — process aligned with 02-SETTINGS §6.3. Example candidates: `organic_certified` (widespread adoption → L1 promotion in future).
11. **Digital SOPs schema + versioning** — Phase 2 scope, link z BRCGS v9 training records.
12. **LLM copilot Level 0/1** — MES-TRENDS §9 03-TECHNICAL. Scope: troubleshooting Q&A over SOPs + regulatory corpus. Phase 2.

---

## §16 — References + Changelog

### Phase B/C dependencies

- [`00-FOUNDATION-PRD.md`](./00-FOUNDATION-PRD.md) v3.0 — principles, ADRs 028/029, regulatory roadmap, tech stack
- [`01-NPD-PRD.md`](./01-NPD-PRD.md) v3.0 — §4 entity model (items derivation), §6 cascading rules, §8 allergens multi-level, §10 D365 Builder (consumer)
- [`02-SETTINGS-PRD.md`](./02-SETTINGS-PRD.md) v3.0 — §5.2 reference_schemas (L3 extensions contract), §5.5 reference_tables (allergens_reference, d365_constants), §7 rule registry (allergen cascade rule deployed), §11 D365 Constants

### Reality sources

- [`_meta/reality-sources/pld-v7-excel/D365-INTEGRATION.md`](./_meta/reality-sources/pld-v7-excel/D365-INTEGRATION.md) — M06 BOM AutoGen + M08 Builder + 5 Apex constants
- [`_meta/reality-sources/pld-v7-excel/EVOLVING.md`](./_meta/reality-sources/pld-v7-excel/EVOLVING.md) §4 allergens cascade, §7 Dieset material, §8 ProdDetail multi-comp, §10 Builder retirement, §11 BOM Generator button
- [`_meta/reality-sources/pld-v7-excel/MAIN-TABLE-SCHEMA.md`](./_meta/reality-sources/pld-v7-excel/MAIN-TABLE-SCHEMA.md) — Technical dept cols + allergens placement
- [`_meta/reality-sources/pld-v7-excel/CASCADING-RULES.md`](./_meta/reality-sources/pld-v7-excel/CASCADING-RULES.md) — M04.CascadeFromChange logic

### Architecture

- [`_foundation/decisions/MONOPILOT-V2-ARCHITECTURE.md`](./_foundation/decisions/MONOPILOT-V2-ARCHITECTURE.md) — Phase D 23 decisions (inc. #19 D365 Builder N+1)
- [`_foundation/META-MODEL.md`](./_foundation/META-MODEL.md) — schema-driven contract
- [`_foundation/patterns/REALITY-SYNC.md`](./_foundation/patterns/REALITY-SYNC.md)

### Research

- [`_foundation/research/MES-TRENDS-2026.md`](./_foundation/research/MES-TRENDS-2026.md) §2 food-mfg (allergens + catch weight), §4 schema-driven, §9 03-TECHNICAL (Digital SOPs + LLM copilot)

### ADRs

- ADR-002 — BOM snapshot pattern
- ADR-008 — audit trail
- ADR-009 — routing-level costs
- ADR-028 — schema-driven cols (L3 extensions)
- ADR-029 — rule engine DSL (allergen cascade rule)
- ADR-031 — multi-tenant L1-L4

### HANDOFFs

- [`_meta/handoffs/2026-04-19-c1-sesja1-close.md`](./_meta/handoffs/2026-04-19-c1-sesja1-close.md) — C1 Sesja 1 close (02-SETTINGS)
- [`_meta/handoffs/2026-04-19-phase-b-close.md`](./_meta/handoffs/2026-04-19-phase-b-close.md) — Phase B close

### External standards

- EU Regulation 1169/2011 (food info to consumers, EU-14 allergens)
- FSMA 204 (US Food Traceability Rule)
- BRCGS Global Standard for Food Safety v9
- ISO 22000 (food safety management systems)
- EU 2023/915 (contaminant maximum levels)
- GS1 Digital Link standard + AI encoding (3103/3922)
- Peppol (PL e-Invoicing mandate 2026)

---

## Changelog

- **v3.0** (2026-04-20) — Phase C1 Sesja 2 writing. Pełny rewrite baseline v1.x (828l, 8 epics E02.1-E02.8 pre-Phase-D). Nowe core: §6 Product master z item_types (N+1 intermediate per Phase D #19), §7 BOM versioning + co-products + BOM Generator button (EVOLVING §11), §8 Catch weight + GS1 AI, §10 Allergens full (cascade via ADR-029 rule registry + ATP/ELISA lab + contamination risk matrix), §13 D365 Integration stage 1 technical (pull items/BOM + push confirmations, DLQ, idempotency). Refined: §9 shelf-life regulatory (BRCGS v9, FSMA 204, EU 1169/2011), §11 cost_per_kg per-item, §12 routing + resources. Build sequence 4 sub-modules (a..d), 18-22 sesji impl est.
- v1.x (pre-Phase-D) — baseline 828l, 8 epics E02.1-E02.8, BOM snapshot (ADR-002) + routing-level costs (ADR-009). Deprecated przez v3.0.

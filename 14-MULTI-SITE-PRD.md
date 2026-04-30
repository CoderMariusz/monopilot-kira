---
module: 14-MULTI-SITE
version: v3.0
date: 2026-04-20
phase: D (Phase C5 Sesja 2)
status: PRD v3.0 baseline locked
previous: v1.0 (2026-02-18, 576 linii pre-Phase-D)
owner: Monopilot architecture
consumers/producers:
  - 05-WAREHOUSE (TO state machine extension inter-site)
  - 08-PRODUCTION (site_id scoping, per-site shifts)
  - 15-OEE (oee_snapshots.site_id activation dla per-site rollup)
  - 12-REPORTING (per-site filter + factory aggregate consumer)
  - 13-MAINTENANCE (site_user_access pattern consumer)
  - 02-SETTINGS (L2 tenant config + feature flag orchestration via §9 ADR-031)
  - 09-QUALITY / 10-FINANCE / 11-SHIPPING (site_id RLS activation)
---

# 14-MULTI-SITE — Monopilot MES PRD v3.0

## 1. Executive Summary

Modul 14-MULTI-SITE wprowadza pełną obsługę wielu zakładów produkcyjnych (sites) w ramach jednej organizacji Monopilot, z shared master data (org-level) + isolated operations (site-level). **Kluczowy przypadek**: Apex UK + przyszły KOBE EU jako 2 sites w 1 organizacji, ze wspólnymi produktami/BOM/suppliers + izolowanymi WO/LP/stock/quality/shifts.

**Problem**: Monopilot dziś jest single-site per org (tylko `org_id` dimension). Multi-site customers potrzebują inter-site transfers, per-site reporting, data isolation — bez duplikacji master data.

**Rozwiązanie**: Aktywacja `site_id UUID NULL` jako pełnego wymiaru izolacji (dodane retroaktywnie per REC-L1 w Foundation, M14 orchestruje aktywację). Model `org_id + site_id` z backward-compat migration, feature flag activation orchestrowany via 02-SET §9 (ADR-031 L2 upgrade), TO jako bridge inter-site z IN_TRANSIT state.

**Competitive signal**: Wszystkich 4 konkurentów (AVEVA, Plex, Aptean, CSB) ma multi-site support. Single-site pokrywa 80% SMB rynku, ale multi-site krytyczny dla klientów 50-500 osób w ≥2 lokalizacjach.

**Primary ambition v3.0** (vs baseline v1.0):
1. Full Phase D convention (19 sekcji, markers)
2. D-MS-1..9 retained + extended (D-MS-10..15 new)
3. Feature flag orchestration link do 02-SET §9 ADR-031 L2 upgrade model
4. `production_shifts` site-scoping formalized (REC-L5 → `shift_configs` ref table dla 15-OEE)
5. Outbox event pattern dla inter-site TO (3 events: shipped/in_transit/received)
6. Composite RLS indexes DDL pre-activation (performance guarantee)
7. Cross-site RBAC z inter-site TO approval workflow gate
8. Per-site data residency P2 (R7 consolidation)
9. `site_id` activation strategy explicit (pre-activation DDL w 14-a, backfill default_site)
10. Consumer 15-OEE per-site rollup + 13-MAINT site_user_access + 12-REP per-site filter

**Phase**: C5 Sesja 2 writing. Build sequence: post-13-MAINTENANCE impl, pre-15-OEE impl.

---

## 2. Markers Legend [UNIVERSAL]

Per 00-FOUNDATION §2:
- **[UNIVERSAL]** — L1 core all tenants
- **[APEX-CONFIG]** — Apex baseline overridable L2
- **[EVOLVING]** — P2/P3 roadmap maturity
- **[LEGACY-D365]** — bridge feature

---

## 3. Objectives & Success Metrics

### 3.1 Cel główny

Umożliwić organizacjom z wieloma zakładami produkcyjnymi zarządzanie operacjami per site, ze wspólnym master data na poziomie org i skonsolidowanym raportowaniem, z backward-compat dla istniejących single-site deployments.

### 3.2 Cele szczegółowe

1. **Site isolation [UNIVERSAL]** — dane operacyjne (WO/LP/stock/machines/shifts/quality/finance) izolowane per site via RLS two-variant pattern (D-MS-2)
2. **Shared master data [UNIVERSAL]** — produkty, BOM, allergens, suppliers, roles, customers, items.cost_per_kg (D-MS-4 retained)
3. **Inter-site transfers [UNIVERSAL]** — 05-WH TO extension z from_site_id/to_site_id + IN_TRANSIT state (D-MS-3 + Q8A)
4. **Site-scoped reporting [UNIVERSAL]** — per-site filter + factory aggregate w 12-REPORTING (D-RPT-9 consumer)
5. **Backward compatibility [UNIVERSAL]** — site_id=NULL = "default site" dla legacy deployments, feature flag opt-in (D-MS-5)
6. **Shift per-site [UNIVERSAL]** — production_shifts site-scoped z per-site timezone + hours (D-MS-9 REC-L5)
7. **Cross-site RBAC [UNIVERSAL]** — user ↔ sites[] via `site_user_access`, primary_site default context, super_admin cross-site (Q10)
8. **Hierarchy site→plant→line [UNIVERSAL]** — 3-level default, configurable 2-5 per tenant L2 (Q7, ADR-030 pattern)
9. **Data residency P2 [UNIVERSAL]** — per-site residency override (R7 consolidation, post-Apex UK+KOBE scenario)

### 3.3 Metryki sukcesu

| Metryka | Cel P1 | Zrodlo | Marker |
|---|---|---|---|
| Inter-site TO cycle time (draft → received) | < 48h | `transfer_orders` timestamps (shipped_at → actual_arrival) | [UNIVERSAL] |
| TO accuracy (received qty / shipped qty) | > 99% | TO reconciliation | [UNIVERSAL] |
| Site data isolation accuracy | 100% | RLS audit tests | [UNIVERSAL] |
| Report filtering (site-scoped) | 100% | Dashboard catalog per-site tests | [UNIVERSAL] |
| Backward compat regression | 0 | CI test suite | [UNIVERSAL] |
| Site switcher latency | < 500ms | APM frontend | [UNIVERSAL] |
| Multi-site adoption (orgs activated) | > 80% w 30d od activation | Analytics feature flag telemetry | [UNIVERSAL] |
| RLS query overhead (composite index) | < 5% vs single-site baseline | pgbench comparison | [UNIVERSAL] |

---

## 4. Personas & RBAC

| Persona | Rola RLS | Scope | Akcje |
|---|---|---|---|
| **Owner/Admin** | `admin` + `super_admin` | All sites org | Create sites, assign users, site settings CRUD, feature flag activation |
| **Kierownik zakladu** | `site_manager` | Primary site | Per-site dashboards, approve inter-site TO incoming, site config L2 |
| **Dyrektor operacyjny** | `ops_director` | All sites org | Consolidated view, cross-site benchmarking, factory aggregate |
| **Operator magazynu** | `warehouse_operator` | Assigned site(s) via site_user_access | Send/receive TO, LP tracking per site |
| **Planista** | `planner` | Multi-site read + primary write | Cross-site WO allocation, capacity planning |
| **Kierownik jakosci** | `quality_manager` | Primary site + cross-site read | Site-scoped NCR + inspekcje + consolidated quality metrics |

**RLS pattern two-variant** (D-MS-2 retained + formalized):

```sql
-- Variant 1: Site-scoped (operational tables) — D-MS-4
CREATE POLICY site_scoped ON {table}
  FOR ALL TO authenticated
  USING (
    org_id = current_org_id()
    AND (
      site_id IS NULL  -- default site / legacy
      OR site_id IN (
        SELECT site_id FROM site_user_access
        WHERE user_id = auth.uid() AND active = true
      )
    )
  );

-- Variant 2: Org-level (master data, unchanged) — D-MS-4
CREATE POLICY org_scoped ON {master_table}
  FOR ALL TO authenticated
  USING (org_id = current_org_id());
```

**Site context** (D-MS-6 retained):
- Header: `x-site-id` sent by frontend
- Postgres: `current_site_id()` SECURITY DEFINER wrapper reads `set_config('app.current_site_id', ...)`
- UI persistence: localStorage + cookie (15-min TTL)
- Auto-select: dla 1-site users bypass switcher, for multi-site primary_site default

**Super-admin**: role bypasses site filter → cross-site read globally (D-MS-2 variant extension per Q10).

---

## 5. Regulatory & Compliance [UNIVERSAL]

### 5.1 Data residency (R7 from 00-FOUNDATION)
- **P1**: Single-region all sites dla 1 org (EU cluster default, Apex UK = EU-West-2)
- **P2**: Per-site residency override (Apex UK EU-West-2 + KOBE EU-Central-1 independent regions). Wymaga cross-region replication strategy + DDL per-region cluster.
- **GDPR**: EU sites dane EU-only, US sites (future) US-only — Schrems II compliance
- **Schema extension**: `sites.data_residency_region` TEXT (default from org settings, override per site)

### 5.2 Audit trail (BRCGS + FSMA 204)
- `audit_log` table zawiera site_id (NOT NULL from activation) — per-site traceability dla regulatory
- Inter-site TO audit: full chain (ship from site A → in_transit → receive site B) w `transfer_orders` + `audit_log`
- 7-year retention per-site (inherited per-tenant from 02-SET §14)

### 5.3 Multi-entity accounting (future P2)
- Jeśli sites = różne entity accounting (Apex Ltd UK + Apex GmbH DE), wymaga per-site currency + COA w 10-FINANCE
- P1: single-entity all sites (Apex Ltd obecnie)
- P2: EPIC 14-J Multi-entity accounting (10-FIN consumer)

### 5.4 Tax & VAT
- Inter-site transfers z cross-entity implications: VAT registration, customs (EU→non-EU)
- P1: internal transfer (same legal entity, nie VAT) default
- P2: configurable per TO (tax_applicable flag + customs metadata EPIC 14-K)

---

## 6. Architecture & Data Flow

### 6.1 Module position (00-FOUNDATION §4)
- **M14** = 14-MULTI-SITE, build order #14 (post-13-MAINTENANCE impl, pre-15-OEE impl)
- **Dependencies**: 02-SET (§9 L2 feature flag orchestration), 05-WH (TO state machine baseline)
- **Activates**: site_id na ~20 operational tables across 9 modules (05-WH, 08-PROD, 09-QA, 10-FIN, 11-SHIP, 12-REP, 13-MAINT, 15-OEE, 06-SCN)

### 6.2 Data flow diagram (text)

```
[Admin activates feature flag organizations.multi_site_enabled]
          |
          v
[02-SET §9 ADR-031 L2 upgrade wizard]:
  1. Create first site (often "default")
  2. Assign users to site(s) via site_user_access
  3. Run backfill migration: UPDATE all operational tables SET site_id = default_site WHERE site_id IS NULL
  4. Enable RLS site-scoped policies (CREATE POLICY per table)
  5. UI activates site switcher component
          |
          v
[Regular operations post-activation]:
  Users with single site → auto-select primary_site (no switcher UI)
  Users with multiple sites → switcher dropdown + x-site-id header per request
  Super-admin → "All sites" view (bypass filter)

[Inter-site transfer creation]
  User (warehouse_operator) creates TO at from_site → state='draft'
          |
          v
  Manager approves → state='planned'
          |
          v
  Warehouse ships → state='shipped' + emit `transfer_order.shipped` event
          |
          v
  [Outbox] → physical transit time (hours/days)
          |
          v
  Receiver scans LP at to_site → state='in_transit' → state='received' + emit `transfer_order.received`
          |
          v
  System creates/updates LP at to_site, allocates cost per method
          |
          v
  [05-WH consumer] LP ownership transferred, inventory updated
  [12-REPORTING consumer] Cross-site metrics refresh

[Per-site OEE rollup]
  15-OEE oee_snapshots.site_id filled (ALTER TABLE w 15-a)
          |
          v
  oee_shift_metrics MV refreshed per site (GROUP BY site_id)
          |
          v
  12-REPORTING Factory Overview = SUM (all sites) + per-site drill-down

[Per-site maintenance]
  13-MAINT site_user_access consumer (technicians assigned per site)
  MWO RLS scoped per site
  Cross-site maintenance benchmarking (P2 dashboard MNT-009)
```

### 6.3 Hierarchy site → plant → line (Q7)

**P1 default 3 levels** (Apex baseline):
- `sites` (top level — physical location, legal entity scope)
- `plants` (mid level — building w sites, 1 plant = 1 building w wiekszosci SMB)
- `production_lines` (bottom — assembly line w plant)

**Flexibility via L2** (ADR-030 pattern):
- `sites_hierarchy_config` reference table (02-SET §8.1 v3.3 delta): tenant defines depth 2-5 + level names
- Supported configurations:
  - 2-level: site → line (some SMB direct)
  - 3-level: site → plant → line (Apex default)
  - 4-level: site → building → plant → line (large enterprise)
  - 5-level: region → site → building → plant → line (multi-region corporation)

### 6.4 REC-L1 site_id nullable default pattern

Wszystkie operational tables już mają `site_id UUID NULL` (retroaktywnie dodane w Foundation phase). M14 orchestruje:
1. **Pre-activation DDL** (14-a sub-module): CREATE INDEX CONCURRENTLY dla composite `(org_id, site_id)` na ~20 tabelach (performance constraint §5 baseline risk R-PO-02)
2. **Backfill** (migration script 14-a): `UPDATE {table} SET site_id = (SELECT id FROM sites WHERE org_id=X AND is_default=true) WHERE site_id IS NULL`
3. **Activation** (feature flag flip): CREATE POLICY site_scoped replaces CREATE POLICY org_scoped on operational tables (ALTER POLICY, atomic per transaction)

### 6.5 Schema-driven extensibility (ADR-028, ADR-031)
- L1 core: `sites`, `site_user_access`, `site_settings`, `site_capacity`, `sites_hierarchy_config` (5 core tables)
- L2 tenant config: hierarchy depth per tenant, site_settings L2 overrides per ADR-031
- L3 ext cols: `sites.l3_ext_cols` JSONB (np. tenant-specific site_categorization, compliance_framework)
- L4 user-level: primary_site preference, site switcher UI customization

---

## 7. D-decisions Registry

### 7.1 Retained from baseline v1.0 (D-MS-1..9)

| ID | Decyzja | Marker |
|---|---|---|
| **D-MS-1** | `org_id UUID NOT NULL` universal, `site_id UUID NULL` as second dimension. NULL = backward-compat default site. Operational tables site-scoped; master data org-level | [UNIVERSAL] |
| **D-MS-2** | RLS two-variant: site-scoped (operational) vs org-scoped (master). Formalized w §4 + §8 per-table policy specs | [UNIVERSAL] |
| **D-MS-3** | Transfer Orders as inter-site bridge: from_site_id/to_site_id + state machine extended draft→planned→shipped→in_transit→received→closed (+ cancelled). Logistics genealogy cross-site via `lp_genealogy.transfer_order_id` | [UNIVERSAL] |
| **D-MS-4** | Master data (products/BOMs/allergens/suppliers/customers/roles) org-level; operational (warehouses/machines/lines/WO/LP/stock/quality/shifts/maintenance/oee) site-level | [UNIVERSAL] |
| **D-MS-5** | Feature flag `organizations.multi_site_enabled` (default false). TRUE → site switcher visible, min 1 site required, inter-site TO available | [UNIVERSAL] |
| **D-MS-6** | Site context via x-site-id header + `current_site_id()` Postgres helper + localStorage/cookie UI persistence. Auto-select 1-site users | [UNIVERSAL] |
| **D-MS-7** | Backward-compat migration: site_id=NULL → "default site" explicit create; admin runs wizard (create sites → assign resources → assign users) before activation | [UNIVERSAL] |
| **D-MS-8** | Inter-site TO cost optional; allocation method (sender/receiver/split/none), default receiver pays | [UNIVERSAL] |
| **D-MS-9** | Production shifts site-specific (REC-L5): `production_shifts` is site-level. Each site definiuje AM/PM/Night z własnymi hours + timezone. Legacy shifts (site_id=NULL) → migration to default_site | [UNIVERSAL] + [APEX-CONFIG] |

### 7.2 New Phase D decisions (D-MS-10..15)

| ID | Decyzja | Marker |
|---|---|---|
| **D-MS-10** | **Hierarchy 3-level default + L2 flexibility** (Q7). `sites_hierarchy_config` ref table (02-SET §8.1 v3.3 delta): tenant defines depth 2-5, level names. Apex baseline: site → plant → line | [UNIVERSAL] + [APEX-CONFIG] |
| **D-MS-11** | **Cross-site RBAC multi-site users** (Q10) — `site_user_access` many-to-many. User może być przypisany do wielu sites. Primary_site default context. Super_admin bypass filter. Warehouse operators + technicians typically single-site (ops efficiency) | [UNIVERSAL] |
| **D-MS-12** | **Outbox events dla inter-site TO** — 3 events: `transfer_order.shipped`, `transfer_order.in_transit`, `transfer_order.received`. Payload: `{org_id, from_site_id, to_site_id, transfer_cost, items[]}`. Consumer downstream: 05-WH LP ownership, 12-REP cross-site metrics, 10-FIN cost allocation | [UNIVERSAL] |
| **D-MS-13** | **Composite RLS indexes mandatory pre-activation** — `CREATE INDEX CONCURRENTLY idx_{table}_org_site ON {table}(org_id, site_id)` na wszystkich ~20 operational tables. Performance benchmark pre/post activation (pgbench), target overhead < 5% vs single-site | [UNIVERSAL] |
| **D-MS-14** | **L2 feature flag orchestration via 02-SET §9 ADR-031** — `multi_site_enabled` nie jest prostym booleanem, tylko L2 upgrade state machine (inactive → wizard_in_progress → dual_run → activated). Wizard 3-step: create_sites → assign_users → backfill_default. Admin can rollback z `dual_run` (revert to single-site) | [UNIVERSAL] |
| **D-MS-15** | **Per-site data residency P2** (Q9) — `sites.data_residency_region TEXT`. P1: single-region inherited from org_settings.default_region. P2: per-site override (Apex UK EU-West-2 + KOBE EU-Central-1 independent). Wymaga cross-region replication strategy EPIC 14-L | [EVOLVING] |

---

## 8. DSL Rules & Workflow-as-Data [UNIVERSAL]

### 8.1 Rules registered via 02-SET §7.8

| Rule ID | Status | Type | Purpose |
|---|---|---|---|
| `site_access_policy_v1` | **P1 active** | gate | RLS policy builder — per-table site_scoped vs org_scoped decision based on table metadata (operational vs master). Admin read-only registry |
| `to_state_machine_v1` (extended z 05-WH) | **P1 active** | workflow-as-data | 05-WH baseline extended with IN_TRANSIT state for cross-site TO. Guards: from_site_id/to_site_id non-NULL → require IN_TRANSIT transition |
| `cross_site_to_approval_v1` | **P1 active** | gate | Inter-site TO at from_site_id → requires from_site manager approval; at to_site_id → requires to_site manager approval (dual-gate cross-site workflow) |
| `per_site_residency_gate_v1` | **P2 stub** | gate | P2 data residency: enforce data landing on correct region per site (when P2 activated) |

### 8.2 `to_state_machine_v1` extension (inter-site)

```yaml
rule_id: to_state_machine_v1
rule_type: workflow_as_data
active: true
status: P1_active
owner: 05-WH (base) + 14-MULTI (extension)
states:
  - name: draft
    allowed_from: []
    allowed_to: [planned, cancelled]
  - name: planned
    allowed_from: [draft]
    allowed_to: [shipped, cancelled]
    guards:
      - IF from_site_id != to_site_id THEN from_site_manager_approval_id NOT NULL  # cross-site guard
  - name: shipped
    allowed_from: [planned]
    allowed_to: [in_transit, cancelled]  # in_transit only if cross-site
    guards:
      - shipped_at NOT NULL
  - name: in_transit
    allowed_from: [shipped]
    allowed_to: [received, cancelled]
    guards:
      - from_site_id != to_site_id  # only meaningful cross-site
  - name: received
    allowed_from: [shipped (same site), in_transit (cross-site)]
    allowed_to: [closed]
    guards:
      - actual_arrival_at NOT NULL
      - received_qty NOT NULL
      - IF from_site_id != to_site_id THEN to_site_manager_approval_id NOT NULL
  - name: closed
    allowed_from: [received]
    allowed_to: []  # terminal
  - name: cancelled
    allowed_from: [draft, planned, shipped, in_transit]
    allowed_to: []  # terminal
    guards:
      - cancellation_reason NOT NULL
emits:
  - on_enter:
      shipped: transfer_order.shipped
      in_transit: transfer_order.in_transit
      received: transfer_order.received
      cancelled: transfer_order.cancelled
```

---

## 9. Schema (DB tables) — 5 core + extensions

### 9.1 `sites` [UNIVERSAL] — core
```sql
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  site_code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,  -- exactly one per org during transition
  legal_entity TEXT,  -- Apex Ltd UK, Apex GmbH DE, etc.
  timezone TEXT NOT NULL DEFAULT 'UTC',  -- used by production_shifts, OEE aggregation
  country TEXT NOT NULL,
  data_residency_region TEXT,  -- P2: override org_settings.default_region
  hierarchy_config_id UUID REFERENCES sites_hierarchy_config(id),  -- D-MS-10
  parent_site_id UUID REFERENCES sites(id),  -- for hierarchy level 1 grouping (region → site)
  l3_ext_cols JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, site_code)
);
CREATE INDEX idx_sites_org ON sites(org_id) WHERE active;
CREATE UNIQUE INDEX idx_sites_default ON sites(org_id) WHERE is_default = true;  -- enforce exactly one default per org
```

### 9.2 `site_user_access` [UNIVERSAL] — D-MS-11
```sql
CREATE TABLE site_user_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  site_id UUID NOT NULL REFERENCES sites(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  role TEXT NOT NULL,  -- matches 02-SET roles (site_manager, warehouse_operator, etc.)
  is_primary BOOLEAN DEFAULT false,  -- default site for user
  active BOOLEAN DEFAULT true,
  granted_by UUID,
  granted_at TIMESTAMPTZ DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  UNIQUE(org_id, site_id, user_id, role)
);
CREATE INDEX idx_sua_user ON site_user_access(user_id) WHERE active;
CREATE UNIQUE INDEX idx_sua_primary ON site_user_access(org_id, user_id) WHERE is_primary AND active;  -- exactly one primary per user per org
```

### 9.3 `site_settings` [UNIVERSAL] — L2 per-site config
```sql
CREATE TABLE site_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  site_id UUID NOT NULL REFERENCES sites(id),
  setting_key TEXT NOT NULL,  -- e.g., shift_pattern, default_currency, language
  setting_value JSONB NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('default','l2_override')),
  updated_by UUID,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, site_id, setting_key)
);
```

### 9.4 `site_capacity` [UNIVERSAL] — Phase 2B foundation
```sql
CREATE TABLE site_capacity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  site_id UUID NOT NULL REFERENCES sites(id),
  capacity_date DATE NOT NULL,
  line_id UUID,  -- optional per-line granularity
  available_hours NUMERIC(6,2) NOT NULL,
  utilized_hours NUMERIC(6,2) DEFAULT 0,
  notes TEXT,
  UNIQUE(org_id, site_id, capacity_date, line_id)
);
```

### 9.5 `sites_hierarchy_config` [UNIVERSAL] — D-MS-10 L2 ADR-030
```sql
CREATE TABLE sites_hierarchy_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE,  -- one per tenant
  depth INT NOT NULL CHECK (depth BETWEEN 2 AND 5),
  level_names TEXT[] NOT NULL,  -- e.g., ['site','plant','line'] for depth=3
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
-- Apex seed: (org_id=Apex, depth=3, level_names=['site','plant','line'])
```

### 9.6 `transfer_orders` extensions [UNIVERSAL] — 05-WH base + inter-site D-MS-3

**Added columns** (ALTER TABLE w 14-a sub-module):
```sql
ALTER TABLE transfer_orders ADD COLUMN from_site_id UUID NULL REFERENCES sites(id);
ALTER TABLE transfer_orders ADD COLUMN to_site_id UUID NULL REFERENCES sites(id);
ALTER TABLE transfer_orders ADD COLUMN transfer_cost NUMERIC(12,2);
ALTER TABLE transfer_orders ADD COLUMN cost_allocation_method TEXT CHECK (cost_allocation_method IN ('sender','receiver','split','none')) DEFAULT 'receiver';
ALTER TABLE transfer_orders ADD COLUMN expected_arrival_at TIMESTAMPTZ;
ALTER TABLE transfer_orders ADD COLUMN shipped_at TIMESTAMPTZ;
ALTER TABLE transfer_orders ADD COLUMN actual_arrival_at TIMESTAMPTZ;
ALTER TABLE transfer_orders ADD COLUMN from_site_manager_approval_id UUID;  -- D-MS-11 cross-site gate
ALTER TABLE transfer_orders ADD COLUMN to_site_manager_approval_id UUID;
-- State machine: extend 05-WH base with IN_TRANSIT state (no schema change, enum values managed via DSL rule)
```

### 9.7 `production_shifts` site-scoping [UNIVERSAL] — D-MS-9 REC-L5

**Schema activation** (ALTER w 14-a migration):
```sql
ALTER TABLE production_shifts ADD COLUMN site_id UUID NULL REFERENCES sites(id);
-- Backfill: UPDATE production_shifts SET site_id = (SELECT id FROM sites WHERE is_default AND org_id=production_shifts.org_id);
-- Post-backfill: ALTER TABLE production_shifts ALTER COLUMN site_id SET NOT NULL (only after feature flag activated)
CREATE INDEX idx_shifts_site ON production_shifts(site_id);
```

**Reference table** `shift_configs` (02-SET §8.1 v3.3 delta):
- Columns: tenant_id, site_id, shift_name (AM/PM/Night), start_time, end_time, timezone
- Apex seed: (Apex, UK site, AM 00:00-08:00 UTC, PM 08:00-16:00 UTC, Night 16:00-00:00 UTC)
- Per-site override: KOBE site może mieć inne hours, different timezone
- Consumer: 15-OEE `shift_aggregator_v1` rule uses `shift_configs.site_id` filter

### 9.8 Other tables with site_id activated (ALTER by 14-a migration script)

| Table | Module | Policy variant |
|---|---|---|
| `warehouses` | 05-WH | site-scoped |
| `license_plates` | 05-WH | site-scoped |
| `grn_items` | 05-WH | site-scoped |
| `stock_movements` | 05-WH | site-scoped |
| `work_orders` | 04-PLAN/08-PROD | site-scoped |
| `wo_outputs` | 08-PROD | site-scoped |
| `wo_consumptions` | 08-PROD | site-scoped |
| `wo_dependencies` | 04-PLAN | site-scoped (consistency enforced) |
| `downtime_events` | 08-PROD | site-scoped |
| `quality_holds` | 09-QA | site-scoped |
| `quality_inspections` | 09-QA | site-scoped |
| `ncr_reports` | 09-QA | site-scoped |
| `haccp_plans` | 09-QA | site-scoped |
| `shipments` | 11-SHIP | site-scoped |
| `sales_orders` | 11-SHIP | site-scoped (originating site) |
| `inventory_cost_layers` | 10-FIN | site-scoped |
| `wip_balances` | 10-FIN | site-scoped (per-site WIP) |
| `oee_snapshots` | 15-OEE | site-scoped (P2 activation in 15-a) |
| `maintenance_work_orders` | 13-MAINT | site-scoped |
| `spare_parts_stock` | 13-MAINT | site-scoped |
| `calibration_instruments` | 13-MAINT | site-scoped |

**Master data (site_id STAYS NULL)**:
- `items`, `boms`, `bom_versions`, `bom_co_products`, `allergens` (03-TECH)
- `suppliers`, `customers` (03-TECH shared)
- `workflow_definitions`, `rule_definitions`, `reference_tables` (02-SET)
- `organizations`, `auth.users`, `roles_catalog`

### 9.9 Composite indexes (D-MS-13 mandatory)
```sql
-- Apply to all ~20 operational tables pre-activation
CREATE INDEX CONCURRENTLY idx_{table}_org_site ON {table}(org_id, site_id);
-- pgbench comparison: target overhead < 5% vs single-site baseline
```

### 9.10 Materialized view: `cross_site_summary`
```sql
CREATE MATERIALIZED VIEW cross_site_summary AS
SELECT
  org_id, site_id,
  DATE_TRUNC('day', NOW()) AS as_of_date,
  (SELECT COUNT(*) FROM work_orders WHERE work_orders.org_id=s.org_id AND work_orders.site_id=s.id AND state='in_progress') AS wo_active,
  (SELECT COUNT(*) FROM quality_holds WHERE quality_holds.org_id=s.org_id AND quality_holds.site_id=s.id AND released_at IS NULL) AS holds_active,
  (SELECT SUM(qty_on_hand * unit_cost) FROM license_plates lp JOIN items i ON lp.item_id=i.id WHERE lp.org_id=s.org_id AND lp.site_id=s.id) AS inventory_value,
  (SELECT AVG(availability_pct) FROM oee_daily_summary WHERE org_id=s.org_id AND site_id=s.id AND date >= CURRENT_DATE - INTERVAL '7 days') AS avg_availability_7d
FROM sites s WHERE s.active;
-- Refresh: pg_cron hourly
```

---

## 10. Dashboards (P1 + P2)

### 10.1 P1 dashboards (4 core)

| # | Dashboard | Cel | Source |
|---|---|---|---|
| **MS-001** | **Site Overview** | Per-site KPIs: active WO, holds, inventory value, availability (last 7d) | `cross_site_summary` MV |
| **MS-002** | **Inter-site TO Tracker** | All active TOs z from/to sites + state + ETA | `transfer_orders` WHERE state NOT IN (closed, cancelled) |
| **MS-003** | **Cross-site Factory Aggregate** | Consolidated: total production, holds, shipments, costs across sites | 12-REP consumer per-site + aggregate (SUM) |
| **MS-004** | **Site Switcher UX** | User's primary site + accessible sites list | `site_user_access` filtered by current user |

### 10.2 P2 dashboards (6 extended)

| # | Dashboard | Marker |
|---|---|---|
| MS-005 | Cross-site Benchmark (OEE/MTBF/quality per site) | [UNIVERSAL] |
| MS-006 | Capacity Planning Cross-site | [UNIVERSAL] |
| MS-007 | Data Residency Health (per-site region compliance) | [EVOLVING] |
| MS-008 | Multi-entity Finance Rollup | [EVOLVING] |
| MS-009 | Customs & VAT Cross-site TO Audit | [EVOLVING] |
| MS-010 | Site Activation Dashboard (admin: activation wizard progress per tenant) | [UNIVERSAL] |

Dashboards rejestrowane w 12-REPORTING `dashboards_catalog` z per-dashboard `required_role` + `enabled_for_tenants[]`.

---

## 11. Validation Rules V-MS-01..V-MS-20

### 11.1 Site setup (V-MS-01..04)
- **V-MS-01**: Exactly one `sites.is_default=true` per org_id (database constraint, severity=critical)
- **V-MS-02**: Feature flag `multi_site_enabled=true` requires minimum 1 site active (block activation, severity=critical)
- **V-MS-03**: Default site cannot be deleted if `multi_site_enabled=true` (severity=critical)
- **V-MS-04**: Site timezone musi być valid IANA timezone (np. `Europe/London`, severity=critical data integrity)

### 11.2 RLS + access (V-MS-05..08)
- **V-MS-05**: User cannot access data from site without `site_user_access` row (enforced via RLS policy, severity=critical)
- **V-MS-06**: Each user musi mieć exactly one `is_primary=true` site_user_access per org (DB constraint, severity=critical)
- **V-MS-07**: Super_admin role bypass enforced via `current_user_role()` helper + LEAKPROOF (severity=critical audit)
- **V-MS-08**: Operational tables require RLS policy site_scoped variant; master tables org_scoped (checked by `site_access_policy_v1` rule metadata, severity=warn w migration lint)

### 11.3 Inter-site TO (V-MS-09..14)
- **V-MS-09**: Cross-site TO (from_site_id != to_site_id) requires IN_TRANSIT state transition (enforced `to_state_machine_v1` guards, severity=critical)
- **V-MS-10**: Cross-site TO requires from_site_manager_approval_id NOT NULL before shipped (severity=critical)
- **V-MS-11**: Cross-site TO requires to_site_manager_approval_id NOT NULL before received (severity=critical)
- **V-MS-12**: Same-site TO (from_site_id = to_site_id) skip IN_TRANSIT state, direct shipped → received (backward compat)
- **V-MS-13**: `cost_allocation_method='split'` requires split_ratio in `transfer_cost_metadata` JSONB (severity=warn)
- **V-MS-14**: TO with transfer_cost > 0 requires cost_allocation_method NOT 'none' (severity=warn data quality)

### 11.4 Site context (V-MS-15..17)
- **V-MS-15**: Request without x-site-id header + user has multiple sites → return 400 SITE_CONTEXT_REQUIRED (severity=info client validation)
- **V-MS-16**: x-site-id must match user's site_user_access (severity=critical, 403 SITE_ACCESS_DENIED)
- **V-MS-17**: Site switcher UI auto-select = user's primary_site if only 1 site, else require explicit selection

### 11.5 Activation + migration (V-MS-18..20)
- **V-MS-18**: Feature flag activation wizard requires 3 steps completed (create_sites + assign_users + backfill_default) before enable (D-MS-14, severity=critical)
- **V-MS-19**: Backfill migration SET site_id=default_site covers 100% of rows in operational tables (post-migration validation query, severity=critical)
- **V-MS-20**: Rollback from `dual_run` state requires admin confirmation + audit log entry (severity=warn)

---

## 12. INTEGRATIONS [UNIVERSAL]

### 12.1 P1 — No new D365 stages
14-MULTI-SITE doesn't introduce new INTEGRATIONS stages. Inter-site TO is internal Monopilot concept (D365 nie ma site dimension w sposób natywny dla SMB config). 02-SET §11.8 stages summary unchanged.

### 12.2 P2 extensions (when relevant)
- **Multi-entity D365 company split** — jeśli sites = różne companies (Apex Ltd + Apex GmbH), stage 1 D365 sync musi honorować site-company mapping. Defer do P2 EPIC 14-J (Multi-entity accounting).
- **Cross-site EDI (Peppol B2B)** — jeśli future customer wymaga B2B między sites (rare SMB), defer P2.

### 12.3 Outbox events
3 events dla inter-site TO (D-MS-12):
- `transfer_order.shipped` — from_site ships goods; consumer: 05-WH LP state IN_TRANSIT, 10-FIN cost pre-accrual
- `transfer_order.in_transit` — ETA update, logistics tracking (optional courier API consumer P2)
- `transfer_order.received` — to_site creates/updates LP, 05-WH lp_genealogy updated, 10-FIN cost allocated per method

Emitted to `warehouse_outbox_events` (05-WH owner table) with `event_type='inter_site_transfer'` tag for filtering.

---

## 13. Configuration [UNIVERSAL]

### 13.1 L1 core (universal)
- 5 core tables (sites, site_user_access, site_settings, site_capacity, sites_hierarchy_config)
- RLS two-variant pattern
- TO state machine extension

### 13.2 L2 tenant config (02-SET §9 ADR-031)
- `sites_hierarchy_config` (depth 2-5, level names)
- `maintenance_alert_thresholds` per site (13-MAINT consumer cross-site)
- `shift_configs` per site (15-OEE consumer)
- Per-site `data_residency_region` (P2)
- Per-site currency (10-FIN P2 multi-entity)

### 13.3 L3 schema extensions
- `sites.l3_ext_cols` JSONB (tenant-specific metadata)
- Custom site categorization schemes
- Per-site compliance frameworks (BRCGS vs SQF vs FSSC)

### 13.4 L4 user-level
- Primary site preference
- Site switcher UI layout (compact vs dropdown)

### 13.5 Feature flag orchestration (D-MS-14)
State machine stored w `organizations.multi_site_state`:
- `inactive` (default) → `wizard_in_progress` (admin starts wizard) → `dual_run` (sites created, users assigned, backfill done but RLS policies still org_scoped variant) → `activated` (RLS site_scoped policies applied, switcher visible)
- Rollback: `dual_run` → `inactive` allowed (drops sites + reverts RLS); `activated` → `dual_run` requires data migration plan (admin confirmation + audit)

---

## 14. Compliance & Security

### 14.1 RLS policy management
- All 20+ operational tables get site_scoped policy via `site_access_policy_v1` rule-driven migration
- Master tables (items, boms, suppliers, customers, allergens, roles) stay org_scoped
- Audit: `site_access_audit_log` records every cross-site access attempt (success + denials)

### 14.2 Super-admin audit
- Super_admin cross-site reads logged w `audit_log` with `cross_site_reason` text (justifiable access)
- Review: monthly report (per-super-admin cross-site access count, flagged if > baseline)

### 14.3 GDPR + data residency (P2)
- Per-site `data_residency_region` enforced via `per_site_residency_gate_v1` rule (P2)
- Cross-region data transfer audit (EU→US blocked without SCC)
- Schrems II compliance roadmap

### 14.4 BRCGS + FSMA 204 multi-site
- Each site maintains own 7-year audit trail (per-site archive)
- Cross-site traceability via `transfer_orders` + `lp_genealogy.transfer_order_id` (full chain preserved)
- FSMA 204 CTE query extended with site filter (05-WH §11 consumer)

### 14.5 i18n per-site
- `site_settings.setting_value->>'language'` override per site (Apex UK = en, KOBE DE = de)
- Per-site UI language for reports, notifications

---

## 15. Testing Strategy

### 15.1 Unit tests
- RLS policy enforcement: site-scoped vs org-scoped variants
- Site context helper `current_site_id()` SECURITY DEFINER behavior
- TO state machine cross-site guards (IN_TRANSIT transitions)
- Composite index query performance (pgbench pre/post activation)

### 15.2 Integration tests (Playwright)
- Multi-site user flow: login → site switcher → select site → access filtered data
- Inter-site TO full lifecycle (draft → ship → in_transit → receive → closed)
- Activation wizard 3-step flow (create_sites → assign_users → backfill)
- Rollback scenario: activated → dual_run → inactive (data integrity preserved)

### 15.3 Performance
- RLS overhead benchmark: < 5% vs single-site baseline (D-MS-13 target)
- Cross-site query (cross_site_summary MV refresh) < 10s for 10 sites
- Site switcher API response < 500ms (D-MS-6 target)

### 15.4 Regression
- All 9 modules integrated (05-WH/08-PROD/09-QA/10-FIN/11-SHIP/12-REP/13-MAINT/15-OEE/06-SCN) work correctly post-activation
- Legacy single-site deployments (`multi_site_enabled=false`) 0 regressions
- Data integrity: post-backfill, every operational row has site_id matching default_site

### 15.5 Security
- Cross-site access prevention: user A (site X) cannot query site Y data (RLS blocks)
- Super_admin audit: every cross-site read logged with reason
- Site deletion cascade: impossible while site has active data (D-MS-3 retained)

---

## 16. Build Sequence — 5 sub-modules 14-a..e (14-18 sesji impl P1)

| Sub-module | Scope | Est. sesji | Dependencies |
|---|---|---|---|
| **14-a** | Core schema (sites, site_user_access, site_settings, site_capacity, sites_hierarchy_config) + RLS policies + composite indexes + site context helpers (current_site_id, x-site-id middleware) + activation wizard state machine | 4-5 | 02-SET §9 v3.3 delta + 00-FOUND REC-L1 completed |
| **14-b** | Inter-site TO extension (05-WH base) + state machine IN_TRANSIT + outbox events + cross-site approval gates + cost allocation | 3-4 | 14-a + 05-WH TO baseline finalized |
| **14-c** | Site switcher UI + localStorage + cookie persistence + auto-select + primary_site management + MS-004 dashboard | 2-3 | 14-a |
| **14-d** | Cross-site dashboards (MS-001, MS-002, MS-003) + cross_site_summary MV + 12-REP integration (dashboards_catalog entries) | 3-4 | 14-c + 12-REP finalized |
| **14-e** | site_id activation migrations (ALTER TABLE + backfill + ALTER POLICY) + production_shifts site-scoping + shift_configs consumer + integration regression tests across 9 modules | 2-3 | 14-d + 13-MAINT + 15-OEE foundations |

**Total P1 est.** 14-18 sesji (baseline, zalezne od regression test coverage).

### P2 sub-modules (8 epics, 24-32 sesji impl)
- 14-F: Cross-site capacity planning (site_capacity-based WO allocation)
- 14-G: Cross-site benchmarking (MS-005 dashboards KPI comparison)
- 14-H: Per-site data residency (sites.data_residency_region activation + cross-region replication)
- 14-I: Multi-entity finance (per-site currency + COA, 10-FIN consumer)
- 14-J: Customs + VAT cross-site TO (tax_applicable flag + customs metadata)
- 14-K: EDI B2B between sites (Peppol ASN P2)
- 14-L: Cross-region data synchronization (bi-directional replication with conflict resolution)
- 14-M: Multi-site audit consolidation (BRCGS multi-site certificate support)

---

## 17. Open Items (OQ-MS-01..10)

| ID | Question | Priority | Owner |
|---|---|---|---|
| OQ-MS-01 | Czy `sites.parent_site_id` dla 4-5 level hierarchy (region → site) powinien być osobną tabelą `regions` vs self-reference? | P2 | Architecture 14-MS-E decision |
| OQ-MS-02 | Per-site shift_configs timezone handling DST transitions (UK BST vs UTC) — DB stores UTC, UI converts per-site timezone? | P2 (impl detail) | 15-OEE shift_aggregator consumer |
| OQ-MS-03 | Super_admin cross-site write (not just read) — allowed in emergency? Audit reason required? | P2 | Security + compliance |
| OQ-MS-04 | Backfill migration for org with millions of rows: online (CONCURRENT) vs offline (downtime)? | P2 | Performance + ops |
| OQ-MS-05 | Site deletion workflow: archive (soft delete) vs full purge (after N-year retention)? | P2 | GDPR + BRCGS |
| OQ-MS-06 | Transfer cost allocation 'split' — ratio per user-specified or auto (50/50)? | P2 | 10-FIN consumer |
| OQ-MS-07 | Cross-region replication (P2 residency): PostgreSQL streaming replication vs logical (pglogical)? | P3 | 14-L phase infra |
| OQ-MS-08 | Multi-entity accounting: same database schema per entity vs separate schemas (Postgres schemas)? | P2 | 14-I phase 10-FIN |
| OQ-MS-09 | Customs cross-site TO (EU→non-EU): integrate with customs broker API (TBD) or manual docs? | P2 | 14-J phase |
| OQ-MS-10 | Cross-site WO allocation rule engine (planner chooses site based on capacity + skills + cost)? | P2 | 07-EXT consumer (finite-capacity solver extension) |

---

## 18. Changelog

### v3.0 (2026-04-20) — Phase D full rewrite
- Phase D convention (19 sekcji, markers)
- D-MS-10..15 new decisions (hierarchy L2 flexibility, cross-site RBAC, outbox events, composite RLS indexes, L2 feature flag orchestration, P2 residency)
- 4 DSL rules registered via 02-SET §7.8 (3 P1 active + 1 P2 stub)
- 5 core tables + 20+ activated operational tables (ALTER TABLE strategy w 14-e)
- Outbox event pattern (3 events for inter-site TO)
- Cross-site RBAC via site_user_access + primary_site default
- `sites_hierarchy_config` L2 variation (depth 2-5, ADR-030)
- `shift_configs` ref table for per-site shifts (15-OEE consumer)
- 4 P1 dashboards + 6 P2 dashboards
- 20 V-MS validation rules
- Activation wizard 3-step state machine (D-MS-14)
- Per-site data residency P2 (D-MS-15)
- Composite RLS indexes mandatory pre-activation (D-MS-13)
- Sub-modules 14-a..e build sequence (14-18 sesji impl P1) + 8 P2 epics

### v1.0 (2026-02-18) — pre-Phase-D baseline
- 9 D-MS decisions (D-MS-1..9) locked
- 5 core tables + TO extension
- 6 epics E11.1-E11.6
- Backward-compat migration strategy
- RLS two-variant pattern foundational

---

## 19. Related Documents

- [`00-FOUNDATION-PRD.md`](./00-FOUNDATION-PRD.md) v3.0 — §4 module map, §4.2 build sequence, §5 tech stack (R3 RLS default, R7 data residency), REC-L1 site_id nullable pattern, REC-L5 per-site shifts
- [`02-SETTINGS-PRD.md`](./02-SETTINGS-PRD.md) v3.3 — §7.8 rules registry (23+ rules post-C5 Sesja 2 delta), §8.1 ref tables (23+ tables), §9 multi-tenant L2 config (ADR-030/031 orchestration), §11 D365 Constants per-site override (potential P2)
- [`05-WAREHOUSE-PRD.md`](./05-WAREHOUSE-PRD.md) v3.0 — TO base state machine (extended with IN_TRANSIT), lp_genealogy multi-site trail, grn/picks site-scoped
- [`08-PRODUCTION-PRD.md`](./08-PRODUCTION-PRD.md) v3.0 — production_shifts site-scoping (D-MS-9 REC-L5), work_orders site_id activation
- [`09-QUALITY-PRD.md`](./09-QUALITY-PRD.md) v3.0 — quality_holds/inspections/ncr site-scoped, cross-site QA reports
- [`10-FINANCE-PRD.md`](./10-FINANCE-PRD.md) v3.0 — inventory_cost_layers + wip_balances site-scoped; multi-entity P2 foundation
- [`11-SHIPPING-PRD.md`](./11-SHIPPING-PRD.md) v3.0 — shipments + sales_orders site-scoped (originating site), cross-site drop-ship P2
- [`12-REPORTING-PRD.md`](./12-REPORTING-PRD.md) v3.0 — per-site filter + factory aggregate consumer, dashboards_catalog per-site metadata
- [`13-MAINTENANCE-PRD.md`](./13-MAINTENANCE-PRD.md) v3.0 — MWO + spare_parts_stock + calibration_instruments site-scoped, cross-site maintenance benchmark P2 (MNT-009)
- [`15-OEE-PRD.md`](./15-OEE-PRD.md) v3.0 — oee_snapshots site_id activation (15-a ALTER DDL), shift_aggregator_v1 per-site consumer
- [`06-SCANNER-P1-PRD.md`](./06-SCANNER-P1-PRD.md) v3.0 — SCN-012 Site/Line/Shift multi-tenant L2 prep (already multi-site aware)
- [`_foundation/research/MES-TRENDS-2026.md`](./_foundation/research/MES-TRENDS-2026.md) — R7 data residency, §9 14-MULTI-SITE competitive analysis (AVEVA/Plex/Aptean/CSB multi-site support)
- ADR-028 (schema-driven L1-L4), ADR-030 (configurable depts — hierarchy pattern reuse), ADR-031 (schema variation per org — feature flag orchestration)

---

**Phase C5 Sesja 2 deliverable 2/2 — 14-MULTI-SITE-PRD.md v3.0 COMPLETE.**

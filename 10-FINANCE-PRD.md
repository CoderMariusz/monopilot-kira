# 10-FINANCE — PRD v3.1

**Module:** 10-FINANCE
**Version:** 3.1
**Date:** 2026-04-30
**Status:** Final (Phase C4 Sesja 2 deliverable)
**Phase reference:** Phase D renumbering (M10 → 10), Phase B/C foundation complete (00..09), Phase C4 Sesja 2 in progress.
**Scope:** Production costing (material + labor + overhead), yield variance per WO, waste cost allocation, BOM cost rollup (DAG cascade-aware), FIFO/WAC inventory valuation parallel, standard costs with approval workflow, `cost_per_kg` lifecycle, INTEGRATIONS stage 5 (D365 cost posting daily consolidated). Phase 2 adds budget/forecast, margin analysis, savings calculator, variance decomposition MPV/MQV/LRV/LEV, multi-currency, complaint cost allocation, AR/AP bridge.
**Consumer of:** 08-PRODUCTION (`wo_outputs`, `wo_waste_log`, `wo_executions.status='COMPLETED'` trigger, INTEGRATIONS stage 2 outbox pattern = stage 5 template), 05-WAREHOUSE (LP cost snapshot, FIFO layer lifecycle at consume/output), 03-TECHNICAL (`items.cost_per_kg` source, BOM structure + `bom_co_products.allocation_pct`, item_type rm/intermediate/fa/co_product/byproduct), 09-QUALITY (`ncr_reports.claim_value_eur` + `ncr_type='yield_issue'` monthly aggregation, `quality_holds` freeze cost P2), 04-PLANNING-BASIC (WO dependency DAG for recursive cost rollup), 07-PLANNING-EXT (Prophet P2 budget forecast bridge, changeover cost from `changeover_matrix`), 02-SETTINGS (D365 Constants §11, DSL rules registry §7, reference tables §8 — `cost_centers`, `currencies`, `gl_account_mappings`, `tax_codes`), 00-FOUNDATION (R14 idempotency, R15 anti-corruption).
**Producer for:** 12-REPORTING (cost KPIs, variance trends, inventory valuation reports), 11-SHIPPING (COGS per shipment P2), external D365 F&O (daily journal lines via DMF entity, stage 5 LEGACY-D365).

---

## §1. Executive Summary

Moduł **10-FINANCE** jest centralną warstwą kosztową Monopilot MES dla SMB food-mfg. Zapewnia pełną widoczność kosztów produkcji od materiału RM przez intermediate WO cascade do FG (finished goods), z dual-costing (standard vs actual), real-time variance visibility i daily consolidated journal posting do D365 F&O.

### 1.1 4 kluczowe funkcje P1

1. **Production costing layer** — per WO actual material + labor + overhead, cascade-aware rollup dla intermediate chain (04-PLANNING DAG), co-product/by-product allocation per `bom_co_products.allocation_pct` z 03-TECHNICAL.
2. **Inventory valuation parallel** — FIFO (cost layers per LP receipt) + WAC (per-item running avg) równolegle dostępne; org wybiera metodę w `finance_settings.default_valuation_method` (DSL rule `cost_method_selector_v1` resolve at transaction).
3. **Yield variance tracking** — per WO `output_yield_gate_v1` consumer (08-PROD), aggregacja monthly z 09-QA `ncr_reports` type=`yield_issue` dla holistic yield loss EUR story.
4. **INTEGRATIONS stage 5 D365 cost posting** — daily consolidated journal (`GeneralJournalLine` DMF entity) via outbox pattern reused z 08-PROD §12 stage 2 template. R14 idempotency (UUID v7 transaction_id), R15 anti-corruption adapter (internal canonical cost model → D365 F&O dataAreaId=FNOR payload).

### 1.2 Zmiany vs v3.0 (2026-04-20) — v3.1 multi-industry standardization

| Obszar | v3.0 → v3.1 |
|---|---|
| Product codes | FA (finished articles) → **FG** (finished goods, universal) |
| WIP terminology | PR (production run) → **WIP** (work-in-progress, universal per manufacturing ops) |
| WIP code format | PR-A-001 → **WIP-MX-0000001** (WIP-<2-letter-operation-suffix>-<7-digit-sequence>) |
| Process naming | Process_1..4 / hardcoded A/B/C/D → **Manufacturing_Operation_1..4** keyed by operation_name (Mix/Bake/Coat/etc) |
| Labor cost allocation examples | "Labor cost for Process_A" → "Labor cost for Mix (MX)" |
| Labor table FK | `operation_id` → **`manufacturing_operation_id`** (explicit ref to tenant-configurable operations) |
| Cost center allocation | Now compatible w 01-NPD v3.2 Manufacturing_Operation config per tenant |
| Validation rule examples | Updated to use new code patterns (FG-*, WIP-*) |
| Docstring scope | "cascade to FA" → "**cascade to FG**" throughout |

### 1.3 Zmiany vs v1.0 baseline (2026-02-18, 663 linii)

| Obszar | v1.0 → v3.0 |
|---|---|
| Phase positioning | Phase 2 draft (0/26 stories) → **Phase 1 P1 core operational** z Phase 2 carve-out (budget, margin, savings, multi-currency, variance decomposition) |
| Costing method | FIFO + WAC parallel (D-FIN-4) → **Retained, ale implementacja przez DSL rule** `cost_method_selector_v1` registered w 02-SETTINGS §7 (Q8) |
| DSL rules | 0 registered → **2 registered w 02-SETTINGS §7** (`cost_method_selector_v1`, `waste_cost_allocator_v1`) + 1 stub P2 (`standard_cost_approval_v1`) |
| WIP timing | Ambiguous → **Real-time per consume transaction** (Q2), align z 05-WH scan-to-consume |
| Yield variance | E10.7 Phase 2 → **P1 per WO** consumer `output_yield_gate_v1` (Q3), aggregacja monthly P2 |
| Waste cost | Not specified → **P1 full cost × qty per category** (Q4) z `waste_categories` ref table (09-QA registered w 02-SETTINGS §8), recovery_value credit P2 |
| D365 integration | Comarch Optima adapter (D-FIN-6) → **D365 F&O stage 5 daily consolidated journal** (Q5), Comarch WYCOFANE (Q7). Stage 1 sync (03-TECH §13) **extended** o `items.cost_per_kg` pull (Q6) |
| Intermediate cascade cost | Not addressed → **Recursive CTE DAG rollup** (04-PLAN §8.5 consumer), cascade-aware parent WO cost = own + Σ child WO costs |
| Co-product allocation | Not addressed → **`bom_co_products.allocation_pct` consumer**, primary vs co_product/by_product cost split per output |
| Currency base | GBP (D-FIN-3) → **GBP retained** (Apex UK-based per user Q9 clarification), multi-currency P2 |
| Standard cost approval | Implicit | **P1: `finance_manager` sole approver** (Q10 A), P2 dual sign-off upgrade via `standard_cost_approval_v1` rule |
| Consumer boundaries | Loose | **Tight contracts:** 08-PROD events + 09-QA NCR yield + 03-TECH cost_per_kg + 05-WH LP cost + 04-PLAN DAG |
| INTEGRATIONS | Comarch XML | **Stage 5 D365 F&O** reuse 08-PROD §12 outbox pattern (template convergence) |
| Tables | 19 | **15 P1 tables** (streamlined: dropped `variance_thresholds`/`variance_alerts`/`variance_exports`/`cost_center_budgets` to P2) + 4 P2 tables |
| Out-of-scope P2 | Vague | **Explicit P2**: budget+forecast, margin analysis, savings calc, variance decomposition MPV/MQV/LRV/LEV, multi-currency ops, complaint cost allocation, AR/AP bridge, landed cost variance, supplier invoice OCR |

### 1.4 Phase D positioning

10-FINANCE jest 10. modułem Monopilot (M10 → 10 retain). Foundation dla downstream financial reporting (12-REPORTING cost dashboards), shipping costing (11-SHIPPING COGS per shipment P2) i external D365 journal sync (stage 5). Nie jest pełnym ERP — strict focus na **manufacturing cost visibility + D365 journal push**, GL/AR/AP pozostaje w D365 F&O.

### 1.5 Sub-modules build (P1)

- **10-a** Finance Setup + Reference (settings, cost_centers, currencies, exchange_rates, gl_account_mappings, tax_codes reuse) — 4-5 sesji
- **10-b** Standard Costs + Approval (standard_costs lifecycle, cost_per_kg maintenance, approval workflow single sign-off P1) — 3-4 sesje
- **10-c** WO Actual Costing (material_consumption_costs, labor_costs, overhead_allocations, trigger on `wo_executions.status='COMPLETED'`, cascade rollup recursive CTE, co-product allocation) — 4-5 sesji
- **10-d** Variance + Inventory Valuation (cost_variances basic per WO, `inventory_cost_layers` FIFO + WAC running avg, `cost_method_selector_v1` rule apply) — 4-5 sesji
- **10-e** INTEGRATIONS stage 5 (outbox reuse 08-PROD §12, D365 `GeneralJournalLine` DMF, daily consolidator job, DLQ ops UI) — 3-4 sesje

**Est. 18-23 sesji impl P1**, +14-20 sesji P2 (budget, margin, savings, variance decomposition, multi-currency, complaint cost, AR/AP bridge, landed cost variance).

---

## §2. Stakeholders & Personas

### 2.1 Primary roles (operational)

| Persona | Role code | Kluczowe responsybilności | UI touchpoints |
|---|---|---|---|
| **Finance Manager** | `finance_manager` | Standard cost approval (single sign-off P1), variance review, D365 export oversight, cost_per_kg maintenance, exchange rate management, cost center admin | Desktop (FIN-001..008) |
| **Finance Viewer** | `finance_viewer` | Read-only cost dashboards, variance reports, inventory valuation reports, CSV export | Desktop (FIN-001..005 RO) |
| **Production Manager** | `prod_manager` | WO cost summary view (per WO actual vs standard), variance root-cause notes, yield loss review | Desktop (FIN-002 WO Cost) |
| **Plant Director** | `plant_director` | KPI dashboard, cost trends, multi-line comparison (aggregate per cost center) | Desktop (FIN-001) |
| **Admin** | `admin` | GL account mappings admin, currency setup, tax_codes integration (02-SETTINGS reuse), DSL rule view-only | Desktop (FIN-007, FIN-008) |

### 2.2 Secondary roles (oversight)

| Persona | Role code | Kluczowe responsybilności |
|---|---|---|
| **Owner** | `owner` | Cost approval escalation, D365 config approval, finance_manager assignment |
| **External Auditor** | `auditor_readonly` | Full read-only access + cost approval audit trail + 7y history export |
| **D365 Integration Ops** | `integration_ops` | DLQ monitoring, manual replay, D365 connectivity health, export failure resolution |

**[APEX-CONFIG]**: Apex 2026-04 Q2 go-live single-site UK. Finance Manager = 1 osoba (Sarah McKenzie handoff from parent IPL LIMITED finance). Currency base = **GBP** (UK operation, parent IPL LIMITED group). D365 F&O instance = FNOR (dataAreaId), warehouse ApexDG, GL account FinGoods dla finished goods inventory.

### 2.3 RLS & role matrix (P1)

Wszystkie tabele Finance mają `org_id UUID NOT NULL` + RLS policies per ADR-003/013. Matrix:

| Action | finance_manager | finance_viewer | prod_manager | plant_director | admin | owner | others |
|---|---|---|---|---|---|---|---|
| Create standard_cost draft | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Approve standard_cost | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| View WO cost summary | ✅ | ✅ | ✅ (own line) | ✅ | ✅ | ✅ | ❌ |
| Create variance note | ✅ | ❌ | ✅ (own WO) | ❌ | ❌ | ✅ | ❌ |
| Admin cost center / currency | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| DLQ replay (D365) | ✅ | ❌ | ❌ | ❌ | ✅ (integration_ops) | ✅ | ❌ |
| Manual exchange rate entry | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Export cost audit trail | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | auditor_readonly ✅ |

---

## §3. Out-of-scope (P1 clarifications)

### 3.1 Explicit P2 deferrals (w 10-FINANCE scope, nie P1)

- **EPIC 10-F Budget & Forecast** — `cost_center_budgets` + Prophet bridge P2 z 07-PLANNING-EXT §6 forecasting
- **EPIC 10-G Margin Analysis** — `product_margins` per product/family, target vs actual margin trends
- **EPIC 10-H Savings Calculator** — `(actual_yield - best_yield) × cost_per_kg × volume` formula z D-FIN-10
- **EPIC 10-I Variance Decomposition** — MPV/MQV/LRV/LEV full breakdown (P1 = simple single variance per category)
- **EPIC 10-J Multi-Currency Operations** — PLN+EUR+USD simultaneous, exchange rate API sync, banker's rounding DSL
- **EPIC 10-K Complaint Cost Allocation** — `quality_complaints` (09-QA stub) → accrual posting P2
- **EPIC 10-L AR/AP Bridge** — customer invoicing + supplier payment allocation (deferred to D365 F&O native AR/AP)
- **EPIC 10-M Landed Cost Variance** — supplier landed cost (freight + duty + handling) vs PO unit price tracking
- **EPIC 10-N Supplier Invoice OCR** — invoice scanning, GL auto-coding P2
- **EPIC 10-O Variance Alerts + Thresholds** — configurable alert engine, email/Slack notifications
- **EPIC 10-P Advanced Inventory Revaluation** — period-end revaluation adjustments, FIFO layer merge

### 3.2 Explicit exclusions (nigdy w 10-FINANCE)

- **General Ledger (GL) full accounting** — D365 F&O native domain; 10-FINANCE push only (outbound journal lines)
- **Accounts Receivable / Accounts Payable** — D365 F&O AR/AP modules handle
- **Customer invoicing / credit notes** — Sales module D365 F&O
- **Payroll** — D365 HR or external payroll system
- **Activity-Based Costing (ABC)** — too complex dla SMB MVP, Phase 3+
- **Fixed asset depreciation** — D365 F&O Fixed Assets module
- **Tax computation engine** — D365 F&O Tax Calculation Service; 10-FINANCE consumes `tax_codes` from 02-SETTINGS for VAT classification only
- **Comarch Optima integration** — WYCOFANE (Q7 user decision); D365 F&O = sole external ERP target

### 3.3 Not-ours boundary clarifications

| Feature | Owner | 10-FIN relation |
|---|---|---|
| `wo_outputs` schema + yield | **08-PROD §9.4** | 10-FIN reads `target_qty/actual_qty/output_type` for variance + allocation |
| `wo_waste_log` + `waste_categories` | **08-PROD §9.5** + **02-SETTINGS §8** | 10-FIN reads for waste cost calc per category |
| `bom_co_products.allocation_pct` | **03-TECH §7** | 10-FIN reads for primary/co/by cost split |
| `items.cost_per_kg` structure | **03-TECH §11** | 10-FIN **manages and writes** per D-FIN-9 (dual ownership: schema 03-TECH, lifecycle 10-FIN) |
| D365 Constants (dataAreaId, warehouse, accounts) | **02-SETTINGS §11** | 10-FIN reads at outbox event mapping |
| DSL rules registry | **02-SETTINGS §7** | 10-FIN **registers** `cost_method_selector_v1` + `waste_cost_allocator_v1` |
| `ncr_reports.claim_value_eur` + yield_issue | **09-QA §6** | 10-FIN reads for monthly yield loss aggregation |
| `quality_holds` LP freeze | **09-QA §6** + **05-WH §12** | 10-FIN P2 consumer (freeze COGS on held LP) |
| WO dependency DAG | **04-PLANNING §8.5** | 10-FIN recursive CTE walks for cascade rollup |
| Outbox pattern template | **08-PROD §12** | 10-FIN reuses exact shape (stage 5 = stage 2 clone) |
| R14 idempotency UUID v7 | **00-FOUNDATION R14** | 10-FIN applies do finance_outbox_events |
| R15 anti-corruption adapter | **00-FOUNDATION R15** | 10-FIN implements D365 journal line adapter |

---

## §4. KPIs (success metrics)

### 4.1 Phase 1 (P1 MVP)

| KPI | Target | Measurement source |
|---|---|---|
| WO cost summary calc latency | <3s P95 per WO | APM |
| Cascade cost rollup (5-level BOM) | <10s P95 | APM recursive CTE |
| Variance calculation lag | <30s from transaction | `work_order_costs.updated_at` vs `wo_outputs.registered_at` |
| Inventory valuation accuracy | >98% | Monthly physical vs system audit |
| Standard cost approval cycle | <24h from draft | `standard_costs.status` transitions |
| D365 daily journal export success | >99.5% | `finance_outbox_events.status='delivered'` / total |
| DLQ resolution SLA | <8 business hours | `d365_finance_dlq.resolved_at - moved_to_dlq_at` |
| WO costed within 24h of completion | 100% | `work_order_costs.costing_date - wo_executions.completed_at` |
| Cost per KG calculation accuracy | ±2% vs manual check | Quarterly audit |
| Finance dashboard load | <2s P95 | Lighthouse |

### 4.2 Biznesowe

| KPI | Target | Measurement |
|---|---|---|
| Variance investigation time reduction | -50% vs Excel-based | User survey pre/post |
| Month-end close time | -30% vs v7 Excel process | Customer feedback Sarah |
| Yield loss visibility (EUR per line/week) | 100% per closed WO | KPI widget FIN-001 |
| Standard cost coverage | 100% active FG items | `standard_costs WHERE item_type='finished_good' AND status='active'` vs `items WHERE item_type='finished_good'` |
| D365 posting reconciliation | 100% daily batches reconciled | D365 journal vs Monopilot outbox |

### 4.3 Regulatoryjne

| Aspect | Requirement | Enforcement |
|---|---|---|
| Audit trail on cost changes | All `standard_costs` mutations logged | `cost_approval_audit` table immutable |
| 7y retention (BRCGS) | `standard_costs` + `cost_variances` + `finance_outbox_events` | `retention_until` GENERATED column + nightly archival |
| E-signature (21 CFR Part 11) | Standard cost approval signed | SHA-256(approver_id + record + timestamp + PIN_proof) w `standard_costs.approval_signature_hash` |
| Multi-tenant isolation | Zero cross-tenant leaks | RLS tests w CI |

---

## §5. Regulatory mapping

### 5.1 GAAP / IFRS (manufacturing cost)

- **IAS 2 Inventories** — inventory valued at lower of cost and NRV. FIFO/WAC methods acceptable. Cost includes: materials + labor + fixed/variable production overhead (allocated per normal capacity).
- **IAS 16 (marginal)** — overhead capitalization rules; 10-FINANCE P1 = fixed + variable overhead allocated per labor hours (configurable per `cost_centers.allocation_basis`).
- **COGS recognition** — P1 timing = real-time per consume transaction (Q2); P2 = period-end adjustment option.
- **Implementation:** `standard_costs` dual layer (material/labor/overhead), `work_order_costs` actual, variance = actual - standard per category.

### 5.2 BRCGS Issue 10 (cost audit traceability)

- **7-year retention** on all cost-related records: `standard_costs`, `cost_approval_audit`, `work_order_costs`, `cost_variances`, `finance_outbox_events`.
- **Implementation:** `retention_until DATE GENERATED ALWAYS AS (created_at + INTERVAL '7 years') STORED` + nightly archival job moves older records do `archive_finance.*` schema.
- **Approval evidence** — każda standard cost approval ma immutable audit record (who/when/PIN_proof/reason).

### 5.3 21 CFR Part 11 (e-signature)

Standard cost approval dla regulowanych produktów (recepta food contact) wymaga e-signature:
- SHA-256 hash `(user_id || record_id || timestamp || PIN_proof)` w `standard_costs.approval_signature_hash`
- PIN re-verification przy critical approval (configurable per `finance_settings.critical_approval_pin_required`)
- Immutability trigger `prevent_approved_standard_cost_update` blokuje UPDATE na `standard_costs WHERE status='approved'` z wyjątkiem `effective_to` (supersede path)

### 5.4 FSMA 204 (cost traceability supplement)

10-FINANCE nie jest primary FSMA 204 owner (05-WH §11 lot genealogy), ale musi zachować **cost chain audit** per lot dla potential recall cost impact:
- `material_consumption_costs.lp_id` FK do 05-WH `license_plates` (lot trace)
- Recall cost calculation P2: query recursive genealogy → sum COGS affected LPs → emit `finance.recall.cost_impact` event

### 5.5 UK HMRC / Companies Act (Apex-specific)

- GBP base currency (Apex UK operations per user Q9)
- VAT codes via `tax_codes` (02-SETTINGS M01 reuse): UK-20% standard, UK-5% reduced, UK-0% zero-rated, UK-EXEMPT
- Statutory accounts period retention 6 years (covered by 7y BRCGS retention)

---

## §6. Data model (P1 — 15 tables + 4 P2 stubs)

### 6.1 Tables registry (P1 core)

| # | Table | Owner | Key FKs | Notes |
|---|---|---|---|---|
| 1 | `finance_settings` | 10-FIN | `org_id`, `default_currency_id` | 1 row per org, holds method choice (FIFO/WAC default), D365 enable flag |
| 2 | `cost_centers` | 10-FIN | `org_id`, `parent_id` (self), `production_line_id` | Hierarchy via ltree or self-ref |
| 3 | `currencies` | 10-FIN | `org_id` | GBP base per Apex, ISO 4217 codes |
| 4 | `exchange_rates` | 10-FIN | `org_id`, `currency_id`, `effective_date` | Manual entry P1, API sync P2 |
| 5 | `gl_account_mappings` | 10-FIN | `org_id`, `cost_category` | Maps cost category → D365 GL account code |
| 6 | `standard_costs` | 10-FIN | `org_id`, `item_id` (03-TECH), `currency_id`, `cost_center_id`, `approved_by` | Versioned (effective_from/to), approval workflow single sign-off P1, signature_hash |
| 7 | `work_order_costs` | 10-FIN | `org_id`, `wo_id` (08-PROD), `cost_center_id` | 1 row per WO, material/labor/overhead actual+standard, total variance, cascade_total (includes child WOs) |
| 8 | `material_consumption_costs` | 10-FIN | `org_id`, `consumption_id` (08-PROD), `wo_id`, `item_id`, `lp_id` (05-WH), `currency_id` | Per consume transaction, unit_cost from FIFO layer or WAC |
| 9 | `labor_costs` | 10-FIN | `org_id`, `wo_id`, `manufacturing_operation_id`, `user_id`, `cost_center_id`, `currency_id` | Per manufacturing operation (e.g., Mix, Bake) on WO, hours_actual × hourly_rate |
| 10 | `overhead_allocations` | 10-FIN | `org_id`, `wo_id`, `cost_center_id`, `currency_id` | Basis (labor_hours/machine_hours/units) × rate |
| 11 | `cost_variances` | 10-FIN | `org_id`, `wo_id`, `currency_id` | Per WO per category (material/labor/overhead/yield), simple variance (actual-standard), full decomp MPV/MQV/LRV/LEV = P2 |
| 12 | `inventory_cost_layers` | 10-FIN | `org_id`, `item_id`, `lp_id` (05-WH), `currency_id` | FIFO layers per LP receipt; WAC tracked separately w item_wac_state |
| 13 | `item_wac_state` | 10-FIN | `org_id`, `item_id`, `currency_id` | 1 row per item per currency, running avg_cost + total_qty (WAC) |
| 14 | `finance_outbox_events` | 10-FIN | `org_id`, `aggregate_id`, `idempotency_key` (UUID v7) | Stage 5 outbox, reuse 08-PROD §12 pattern |
| 15 | `d365_finance_dlq` | 10-FIN | `org_id`, `source_outbox_event_id` | DLQ for permanent + escalated failures, ops manual resolution |

### 6.2 Supporting tables (audit + P1)

| Table | Purpose |
|---|---|
| `cost_approval_audit` | Immutable audit log dla `standard_costs` status transitions (draft → pending → approved → superseded → retired). SHA-256 signature, 7y retention. |
| `finance_exports` | Audit log eksportów CSV/ad-hoc (D365 push = outbox, not here). |
| `wo_cost_rollups` (view) | Materialized view over `work_order_costs` + recursive CTE dla cascade total. Refreshed on `wo_executions.status='COMPLETED'` trigger. |

### 6.3 P2 stubs (reserved columns + tables)

- `license_plates.cost_at_creation NUMERIC(15,4)` + `cost_method_recorded TEXT` + `fifo_layer_id UUID` (05-WH §13 P2 — FIFO layer snapshot at put-away) — 10-FIN consumer P2.
- `product_margins` (P2 table dla EPIC 10-G)
- `cost_center_budgets` (P2 table dla EPIC 10-F)
- `variance_thresholds` + `variance_alerts` (P2 dla EPIC 10-O)
- `accruals` (P2 dla EPIC 10-K complaint cost allocation)

### 6.4 Core DDL sketches (P1)

```sql
-- 6.1 finance_settings (1 row per org)
CREATE TABLE finance_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  default_valuation_method TEXT NOT NULL CHECK (default_valuation_method IN ('fifo','wac')),
  default_currency_id UUID NOT NULL REFERENCES currencies(id),
  variance_calculation_enabled BOOLEAN NOT NULL DEFAULT true,
  critical_approval_pin_required BOOLEAN NOT NULL DEFAULT true,
  d365_integration_enabled BOOLEAN NOT NULL DEFAULT false,
  d365_consolidation_cutoff_time TIME NOT NULL DEFAULT '23:00:00',
  ext_jsonb JSONB DEFAULT '{}'::jsonb,  -- L3 schema-driven extension (ADR-028)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id)
);

-- 6.6 standard_costs (versioned, approval workflow)
CREATE TABLE standard_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  item_id UUID NOT NULL REFERENCES items(id),
  item_type TEXT NOT NULL,  -- rm | intermediate | finished_good | co_product | byproduct
  effective_from DATE NOT NULL,
  effective_to DATE,
  material_cost NUMERIC(15,4) NOT NULL DEFAULT 0,
  labor_cost NUMERIC(15,4) NOT NULL DEFAULT 0,
  overhead_cost NUMERIC(15,4) NOT NULL DEFAULT 0,
  total_cost NUMERIC(15,4) GENERATED ALWAYS AS (material_cost + labor_cost + overhead_cost) STORED,
  currency_id UUID NOT NULL REFERENCES currencies(id),
  uom TEXT NOT NULL DEFAULT 'KG',
  cost_basis TEXT CHECK (cost_basis IN ('quoted','historical','calculated','imported_d365')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','approved','superseded','retired')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  approval_signature_hash TEXT,  -- SHA-256(approver_id || record_id || timestamp || PIN_proof)
  approval_reason TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retention_until DATE GENERATED ALWAYS AS (created_at::date + INTERVAL '7 years') STORED,
  ext_jsonb JSONB DEFAULT '{}'::jsonb,
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);
CREATE INDEX idx_standard_costs_lookup ON standard_costs (org_id, item_id, status, effective_from DESC) WHERE status = 'approved';

-- Prevent update on approved records (21 CFR Part 11)
CREATE OR REPLACE FUNCTION prevent_approved_standard_cost_update() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'approved' AND NEW.status = 'approved' THEN
    -- Allow only supersede path (effective_to set + status change to superseded)
    IF NEW.effective_to IS DISTINCT FROM OLD.effective_to THEN
      RETURN NEW;  -- supersede effective_to update allowed
    END IF;
    RAISE EXCEPTION 'Cannot modify approved standard_cost record %. Use supersede path.', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_prevent_approved_standard_cost_update
  BEFORE UPDATE ON standard_costs
  FOR EACH ROW EXECUTE FUNCTION prevent_approved_standard_cost_update();

-- 6.7 work_order_costs (1 per WO, cascade-aware)
CREATE TABLE work_order_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  wo_id UUID NOT NULL UNIQUE REFERENCES work_orders(id),
  cost_center_id UUID REFERENCES cost_centers(id),
  currency_id UUID NOT NULL REFERENCES currencies(id),
  -- Standard costs (snapshot at WO scheduling)
  material_cost_standard NUMERIC(15,4) NOT NULL DEFAULT 0,
  labor_cost_standard NUMERIC(15,4) NOT NULL DEFAULT 0,
  overhead_cost_standard NUMERIC(15,4) NOT NULL DEFAULT 0,
  total_cost_standard NUMERIC(15,4) GENERATED ALWAYS AS (material_cost_standard + labor_cost_standard + overhead_cost_standard) STORED,
  -- Actual costs (rolled up from transactions)
  material_cost_actual NUMERIC(15,4) NOT NULL DEFAULT 0,
  labor_cost_actual NUMERIC(15,4) NOT NULL DEFAULT 0,
  overhead_cost_actual NUMERIC(15,4) NOT NULL DEFAULT 0,
  waste_cost_actual NUMERIC(15,4) NOT NULL DEFAULT 0,  -- sum from wo_waste_log × cost_per_kg per category
  total_cost_actual NUMERIC(15,4) GENERATED ALWAYS AS (material_cost_actual + labor_cost_actual + overhead_cost_actual + waste_cost_actual) STORED,
  -- Cascade total (includes child WOs from DAG)
  cascade_total_actual NUMERIC(15,4) NOT NULL DEFAULT 0,  -- rolled from wo_dependencies children
  -- Variance
  material_variance NUMERIC(15,4) GENERATED ALWAYS AS (material_cost_actual - material_cost_standard) STORED,
  labor_variance NUMERIC(15,4) GENERATED ALWAYS AS (labor_cost_actual - labor_cost_standard) STORED,
  overhead_variance NUMERIC(15,4) GENERATED ALWAYS AS (overhead_cost_actual - overhead_cost_standard) STORED,
  total_variance NUMERIC(15,4) GENERATED ALWAYS AS ((material_cost_actual + labor_cost_actual + overhead_cost_actual + waste_cost_actual) - (material_cost_standard + labor_cost_standard + overhead_cost_standard)) STORED,
  -- Yield
  qty_produced_actual NUMERIC(12,3) NOT NULL DEFAULT 0,  -- sum wo_outputs where output_type='primary'
  qty_produced_standard NUMERIC(12,3) NOT NULL DEFAULT 0,  -- from WO target
  yield_variance_pct NUMERIC(6,2) GENERATED ALWAYS AS (CASE WHEN qty_produced_standard > 0 THEN ((qty_produced_actual - qty_produced_standard) / qty_produced_standard) * 100 ELSE 0 END) STORED,
  unit_cost_actual NUMERIC(15,4) GENERATED ALWAYS AS (CASE WHEN qty_produced_actual > 0 THEN (material_cost_actual + labor_cost_actual + overhead_cost_actual + waste_cost_actual) / qty_produced_actual ELSE 0 END) STORED,
  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','posted','reversed')),
  costing_date TIMESTAMPTZ,
  posted_to_d365_at TIMESTAMPTZ,
  d365_journal_id TEXT,  -- reference after stage 5 push
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retention_until DATE GENERATED ALWAYS AS (created_at::date + INTERVAL '7 years') STORED,
  ext_jsonb JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX idx_wo_costs_status ON work_order_costs (org_id, status, costing_date DESC);
CREATE INDEX idx_wo_costs_posted ON work_order_costs (org_id, posted_to_d365_at) WHERE posted_to_d365_at IS NULL AND status = 'closed';

-- 6.12 inventory_cost_layers (FIFO per LP)
CREATE TABLE inventory_cost_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  item_id UUID NOT NULL REFERENCES items(id),
  lp_id UUID NOT NULL REFERENCES license_plates(id),
  receipt_date TIMESTAMPTZ NOT NULL,
  qty_received_kg NUMERIC(12,3) NOT NULL,
  qty_remaining_kg NUMERIC(12,3) NOT NULL,
  unit_cost NUMERIC(15,4) NOT NULL,
  total_cost NUMERIC(15,4) GENERATED ALWAYS AS (qty_remaining_kg * unit_cost) STORED,
  currency_id UUID NOT NULL REFERENCES currencies(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('po_receipt','wo_output','adjustment','d365_import')),
  source_ref_id UUID,  -- po_line_id or wo_output_id or adjustment_id
  is_exhausted BOOLEAN GENERATED ALWAYS AS (qty_remaining_kg <= 0.001) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fifo_consume ON inventory_cost_layers (org_id, item_id, receipt_date ASC) WHERE NOT is_exhausted;

-- 6.13 item_wac_state (1 row per item per currency)
CREATE TABLE item_wac_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  item_id UUID NOT NULL REFERENCES items(id),
  currency_id UUID NOT NULL REFERENCES currencies(id),
  total_qty_kg NUMERIC(14,3) NOT NULL DEFAULT 0,
  total_value NUMERIC(16,4) NOT NULL DEFAULT 0,
  avg_cost NUMERIC(15,6) GENERATED ALWAYS AS (CASE WHEN total_qty_kg > 0 THEN total_value / total_qty_kg ELSE 0 END) STORED,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, item_id, currency_id)
);

-- 6.14 finance_outbox_events (reuse 08-PROD §12 template)
CREATE TABLE finance_outbox_events (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  event_type TEXT NOT NULL,  -- 'finance.wo_cost.closed' | 'finance.wo_cost.reversed' | 'finance.daily_journal.ready'
  aggregate_id UUID,          -- wo_id or daily_batch_id
  payload JSONB NOT NULL,
  target_system TEXT NOT NULL,  -- 'd365_f&o'
  target_payload JSONB,
  status outbox_status_enum NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  delivered_at TIMESTAMPTZ,
  idempotency_key TEXT UNIQUE NOT NULL,  -- UUID v7, matches R14
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retention_until DATE GENERATED ALWAYS AS (enqueued_at::date + INTERVAL '7 years') STORED
);

-- 6.15 d365_finance_dlq (reuse pattern)
CREATE TABLE d365_finance_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  source_outbox_event_id BIGINT REFERENCES finance_outbox_events(id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  last_error TEXT,
  error_category TEXT CHECK (error_category IN ('transient','permanent','schema','d365_validation')),
  attempt_count INTEGER NOT NULL,
  moved_to_dlq_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id),
  resolution_notes TEXT,
  retention_until DATE GENERATED ALWAYS AS (moved_to_dlq_at::date + INTERVAL '7 years') STORED
);
```

---

## §7. Build sequence (5 sub-modules P1)

### 7.1 Sub-module dependencies DAG

```
10-a (Setup + Ref)          blocks on 02-SETTINGS (tax_codes, feature flags, RLS primitives)
                            blocks on 09-QA (waste_categories registered w 02-SETTINGS §8 — already done)
                            ↓
10-b (Standard Costs)       blocks on 10-a, 03-TECHNICAL (items, cost_per_kg structure)
                            ↓
10-c (WO Actual Costing)    blocks on 10-b, 08-PRODUCTION (wo_executions, wo_outputs, wo_waste_log events)
                            blocks on 04-PLANNING (wo_dependencies DAG)
                            ↓
10-d (Variance + Valuation) blocks on 10-c, 05-WAREHOUSE (LP lifecycle events — consume/receipt)
                            ↓
10-e (INTEGRATIONS st. 5)   blocks on 10-c, 02-SETTINGS §11 (D365 Constants), 08-PROD §12 (outbox template reference impl)
```

### 7.2 Sub-modules detail

| ID | Name | Scope | Est. sesji | Parallel ok? |
|---|---|---|---|---|
| **10-a** | Finance Setup + Reference | finance_settings, cost_centers, currencies, exchange_rates, gl_account_mappings, FIN-007/FIN-008 admin screens. Reuse tax_codes from 02-SETTINGS. | 4-5 | With 10-b outline |
| **10-b** | Standard Costs + Approval | standard_costs CRUD, approval workflow single sign-off P1 (finance_manager), signature_hash, supersede path, cost_per_kg lifecycle (D-FIN-9). FIN-002 Standard Costs screen + approval modal. | 3-4 | Ze 10-c groundwork |
| **10-c** | WO Actual Costing | Material consumption cost tracking on consume event (05-WH), labor cost on WO operation close (08-PROD), overhead allocation per cost center basis, cascade rollup recursive CTE (04-PLAN wo_dependencies), co-product allocation (03-TECH bom_co_products.allocation_pct), trigger on `wo_executions.status='COMPLETED'`. FIN-003 WO Cost Summary. | 4-5 | No (core dependency) |
| **10-d** | Variance + Inventory Valuation | cost_variances basic per WO per category, `cost_method_selector_v1` DSL rule apply (FIFO/WAC), inventory_cost_layers FIFO consume order, item_wac_state running avg, FIN-004 Inventory Valuation, FIN-005 Variance Dashboard P1. | 4-5 | Parallel 10-e after 10-c |
| **10-e** | INTEGRATIONS stage 5 | finance_outbox_events schema (reuse 08-PROD §12), daily consolidator job (cron 23:00 UTC, aggregates wo_cost_closed events → single `GeneralJournalLine` batch), D365 adapter (R15), DLQ + replay UI FIN-006. | 3-4 | Parallel 10-d |

### 7.3 Total est.

**P1:** 18-23 sesji (mid-size module, similar to 07-PLANNING-EXT).

**P2 deferred (11 epics 10-F..10-P):** 14-20 sesji aggregate.

### 7.4 Dependencies matrix (cross-module)

| From | Consumer | Mechanism | Blocking? |
|---|---|---|---|
| 03-TECH §6 (items) | 10-b | FK `standard_costs.item_id` | Hard block |
| 03-TECH §7 (BOM + co_products.allocation_pct) | 10-c | Read at cost split | Hard block (cost rollup) |
| 03-TECH §11 (items.cost_per_kg) | 10-b | Dual ownership D-FIN-9 (10-FIN writes) | Shared |
| 08-PROD §9.4 (wo_outputs) | 10-c | Read target_qty/actual_qty/output_type | Hard block (yield variance) |
| 08-PROD §9.5 (wo_waste_log) | 10-c | Read category_id + qty_kg | Hard block (waste cost) |
| 08-PROD §9.3 (wo_executions) | 10-c | Trigger on status='COMPLETED' | Hard block (cost finalize) |
| 08-PROD §12 (outbox pattern) | 10-e | Reuse SQL + poller shape | Reference (not block) |
| 04-PLAN §8.5 (wo_dependencies DAG) | 10-c | Recursive CTE walk | Hard block (cascade rollup) |
| 05-WH §10 (consume events) | 10-c | Subscribe `material.consumed` event → insert material_consumption_costs | Hard block |
| 05-WH §8 (LP receipt) | 10-d | Subscribe `lp.received` event → insert inventory_cost_layers (FIFO) + update item_wac_state (WAC) | Hard block |
| 05-WH §13 (LP cost snapshot) | 10-d P2 | Future: read cost_at_creation | P2 only |
| 09-QA §6 (ncr yield_issue) | 10-d | Monthly aggregation query | Soft (dashboard) |
| 09-QA §6 (quality_holds) | 10-c P2 | Freeze COGS on held LP | P2 only |
| 02-SETTINGS §7 (rules registry) | 10-d | Register 2 rules | Hard block (rule lookup) |
| 02-SETTINGS §8 (waste_categories) | 10-c | Join on wo_waste_log.category_id | Hard block |
| 02-SETTINGS §11 (D365_Constants) | 10-e | Read at outbox → D365 payload mapping | Hard block |

---

## §8. UX screens + API contracts

### 8.1 Desktop screens (FIN-001..008 P1)

| Screen | Name | Primary user | Key actions |
|---|---|---|---|
| **FIN-001** | Finance Dashboard | finance_manager, plant_director | KPI cards (total cost GBP, variance GBP, inventory value, WO count), trend chart 6mo, top variances top 10, DLQ alert count, yield loss monthly widget |
| **FIN-002** | Standard Costs List + Editor | finance_manager | List approved + draft standard costs, create/supersede, approval modal z PIN re-verification, effective_from picker, signature capture |
| **FIN-003** | WO Cost Summary | finance_manager, prod_manager | Per WO actual vs standard, variance color-coded (green <5%, yellow 5-10%, red >10%), cascade breakdown (child WO contributions), co-product allocation display, unit_cost_actual, re-calc button |
| **FIN-004** | Inventory Valuation | finance_manager, finance_viewer | Filter by item/location/currency, method selector (FIFO/WAC), FIFO layer drill-down per item, WAC running avg display, aging buckets (0-30d/30-60d/60-90d/90+d) |
| **FIN-005** | Variance Dashboard | finance_manager, prod_manager | Per category variance (material/labor/overhead/yield/waste), per WO drill-down, root cause note entry, time range filter, CSV export |
| **FIN-006** | D365 Export Queue + DLQ Ops | integration_ops, finance_manager | Live queue status (pending/dispatching/delivered), DLQ records, error categorization, manual replay button, connectivity health, daily batch overview |
| **FIN-007** | GL Account Mappings Admin | finance_manager, admin | CRUD mapowania cost_category → D365 GL account code, validation against D365_Constants.finished_goods_account |
| **FIN-008** | Exchange Rates + Currencies | finance_manager, admin | List currencies (GBP base marked), add/edit rate effective_date, CRUD additional currencies (P2 multi-currency gate) |

### 8.2 API endpoints (P1)

**Setup:**
- `GET/PUT /api/finance/settings` — finance_settings
- `GET/POST/PUT/DELETE /api/finance/cost-centers` + `GET /api/finance/cost-centers/tree`
- `GET/POST/PATCH/DELETE /api/finance/currencies`
- `GET/POST /api/finance/currencies/:id/exchange-rates`
- `GET/POST/PATCH /api/finance/gl-mappings`

**Standard Costs:**
- `GET/POST/PATCH /api/finance/standard-costs` (lifecycle draft → pending → approved)
- `POST /api/finance/standard-costs/:id/approve` (body: `{ pin_proof, reason }`) → writes `approval_signature_hash`
- `POST /api/finance/standard-costs/:id/supersede` (body: `{ new_draft_id, effective_from }`) → sets effective_to + status=superseded
- `GET /api/finance/standard-costs/by-item/:itemId` (current active)
- `GET /api/finance/standard-costs/:id/audit` (from cost_approval_audit)

**WO Costs:**
- `GET /api/finance/work-order-costs/:woId` (full breakdown + cascade)
- `POST /api/finance/work-order-costs/:woId/recalculate` (re-run recursive CTE + variance)
- `POST /api/finance/work-order-costs/:woId/close` (status → closed, enqueue outbox event)
- `GET /api/finance/work-order-costs/:woId/cascade` (DAG walk results)

**Variance & Valuation:**
- `GET /api/finance/variances?wo_id=...&category=...` (simple P1)
- `GET /api/finance/inventory-valuation?method=fifo|wac&item_id=...`
- `GET /api/finance/inventory-valuation/:itemId/layers` (FIFO drill)
- `GET /api/finance/inventory-valuation/:itemId/wac` (WAC state)

**INTEGRATIONS stage 5:**
- `GET /api/finance/outbox?status=pending|delivered|failed`
- `GET /api/finance/dlq`
- `POST /api/finance/dlq/:id/replay` (requeue to outbox with new idempotency_key)
- `POST /api/finance/dlq/:id/resolve` (manual close with notes)
- `POST /api/finance/daily-consolidation/trigger` (manual trigger for ops, normally cron)
- `GET /api/finance/d365-health` (last successful post, error rate 24h)

**Reports (P1):**
- `GET /api/finance/reports/cost-by-product?period_start=...&period_end=...`
- `GET /api/finance/reports/cost-by-period?granularity=day|week|month`
- `GET /api/finance/reports/yield-loss?period_start=...` (join z 09-QA ncr_reports yield_issue)
- `POST /api/finance/exports/csv` (body: `{ report_type, filters }`)

### 8.3 Dashboard widgets (FIN-001 P1)

| Widget | Data source | Refresh |
|---|---|---|
| Total production cost (current month GBP) | `SUM(work_order_costs.total_cost_actual)` where costing_date IN current_month | 5min cache |
| Variance aggregate (current month GBP) | `SUM(total_variance)` | 5min |
| Inventory value GBP | FIFO: `SUM(inventory_cost_layers.total_cost)` where NOT is_exhausted; WAC: `SUM(item_wac_state.total_value)` | 15min |
| WO cost pending close | Count `work_order_costs.status='open'` where wo.status='COMPLETED' | 1min |
| D365 DLQ open count | Count `d365_finance_dlq.resolved_at IS NULL` | 1min |
| Yield loss monthly (GBP) | `SUM(ncr_reports.claim_value_eur * exchange_rate)` WHERE ncr_type='yield_issue' (09-QA join) | 15min |
| Top 10 WO variance | `ORDER BY ABS(total_variance) DESC LIMIT 10` | 5min |
| Cost per KG trend (top 5 FG products) | `standard_costs` history per item | Daily |

### 8.4 Extended desktop screens (reconciliation w UX `design/10-FINANCE-UX.md`)

> **Schema-ID drift note (audit 2026-04-30):** PRD §8.1 enumeruje 8 screens (FIN-001..008), podczas gdy UX `design/10-FINANCE-UX.md:118-138` operuje 17-screen route map (FIN-001..016 + Finance Settings) z innym numerowaniem. Sekcja §8.4 dodaje brakujące FIN-NNN (źródło: UX + `_meta/prototype-labels/prototype-index-finance.json`), zachowuje istniejące FIN-001..008 z §8.1, i mapuje cross-numbering w macierzy §8.6. **Polityka:** UX numeracja staje się canonical (FIN-001..021); PRD §8.1 numbers retained as functional groupings (FIN-001 PRD = FIN-001 UX = "Finance Dashboard"; PRD FIN-004 Inventory Valuation = UX FIN-005; PRD FIN-006 D365 Queue = UX FIN-016 — tabular matrix §8.6 rozstrzyga).

#### FIN-002b Standard Cost Detail Drawer [UNIVERSAL]

**Source:** UX:121 (`/finance/standard-costs/:id`), prototype `cost_history_modal` (`finance/modals.jsx:177-245`) + row expansion w `fin_standard_costs_list` (`finance/standard-screens.jsx:1-208`).

Right-side drawer / modal-style detail dla pojedynczego rekordu standard_cost wywoływany z FIN-002 listy (kebab → "View Detail" lub kliknięcie wiersza). Pokazuje pełny breakdown: material/labor/overhead/total z paskiem proporcji, status badge (active/draft/pending/superseded), audit footer (approved_by, approval_signature_hash, approved_at, basis, notes), version history mini-table (3-5 najnowszych wersji per item z trend chart per total_cost), version-compare picker (v1↔v2 diff: component, old, new, Δ GBP, Δ%). CTA: "Create New Version" (otwiera FIN-002 MODAL-01 pre-filled values), "Supersede" (otwiera MODAL-11 tylko dla active records). Read-only dla finance_viewer/auditor_readonly. Implementuje §11.2 V-FIN-STD-07 (no edit on approved). Powiązany consumer: §13.2 cost_per_kg dual-ownership (drawer wyświetla calculated `total_cost / uom_kg_factor` jako reference value pisany do `items.cost_per_kg` po approval).

#### FIN-003a WO Costs List [UNIVERSAL]

**Source:** UX:122 (`/finance/wos`), prototype `fin_wo_list` (`finance/wo-screens.jsx:1-122`).

Tabelaryczny widok listy `work_order_costs` records — wejście do drill-down per WO (FIN-003 PRD §8.1). Kolumny: WO Number (link → `/finance/wos/:id/cost`), Product, Production Line, Cost Center, Status (open/closed/posted/reversed badge), Total Cost Actual GBP, Total Variance (color-coded VarBadge per V-FIN-VAR-01..03), Variance %, D365 Journal Ref (link → FIN-016 batch detail gdy `posted_to_d365_at IS NOT NULL`), Costing Date. Status tabs (All/Open/Closed/Posted) z licznikami. Variance filter: All / Favorable / Unfavorable / >5% / >10%. Date range, cost center, production line filters. Empty state: "No WOs costed for selected period." CTA: "Export CSV" (→ MODAL-10). RBAC: finance_manager + finance_viewer + prod_manager (own line per RLS), plant_director.

#### FIN-005 Inventory Valuation Report (UX canonical) [UNIVERSAL]

**Source:** UX:127, UX:397-449, prototype `fin_inventory_valuation` (`finance/variance-screens.jsx:1-117`) + `fifo_layers_modal` (`finance/modals.jsx:385-428`).

> **Re-numbering note:** UX FIN-005 = PRD FIN-004 Inventory Valuation per §8.1. Treść identyczna; pozostawiono PRD FIN-004 jako primary anchor (cross-link w §8.6 matrix).

Method selector toggle (FIFO / WAC) + Valuation Date picker. Two-card summary: "Total Inventory Value" (GBP, item count, method, as-of date) + "Value Distribution" (4 horizontal mini-bars per item_type: RM/Packaging/WIP/FG z % i GBP). Filter bar: search, item type, location (05-WH), aging bucket (0-30/30-60/60-90/90+d), value range. Tabela: Item Code, Name, Type, Qty on Hand (3dp), UOM, Avg Unit Cost (4dp), Total Value, FIFO Layers (integer link → MODAL-06 FIFO drill), Aging badge, Last Movement, Actions (View Layers / View WAC / Export Item). Page total + grand total footer. "Recalculate" CTA enqueues `triggerInventoryRevaluation(method, asOf)` background job. WAC view (kebab → "View WAC"): inline panel z `item_wac_state.avg_cost`, `total_qty_kg`, `total_value`, `last_updated_at`. Validations: V-FIN-INV-01..05 enforced server-side. P95 <5s per §15.1.

#### FIN-010 Variance Drill-down [UNIVERSAL]

**Source:** UX:131, UX:609-641, prototype `fin_variance_drilldown` (`finance/variance-screens.jsx:454-621`).

Hierarchical drill: Level 0 (Material/Labor/Overhead/Waste tile cards z totalsami) → Level 1 (ranked items per category z RankBar) → Level 2 (WOs contributing per item) → Level 3 (embedded WO cost summary, link "View Full WO Cost Card" → FIN-003) → Level 4 (raw transaction record: TX ID, timestamp, LP consumed link → 05-WH, qty_kg, unit_cost, cost method, source). Persistent right sidebar (240px) z aktywnymi filters (period, category, item) + running tally drill-path variance contribution. Breadcrumb trail clickable na każdym poziomie. URL-deep-linkable (`?level=2&item=RM-...&wo=WO-...`) — wsparcie dla bookmark + share. Quick actions w sidebar: "Add Note" → MODAL-07 variance_note, "Export" → MODAL-10. Implementuje §11.5 V-FIN-VAR-01..04 (highlights >5% info, >10% warn, mat>15% warn, yield+mat both negative info-flag substitution).

#### FIN-011 Cost Reporting Suite [UNIVERSAL]

**Source:** UX:136, UX:643-681, prototype `fin_reports` (`finance/other-screens.jsx:1-142`).

Trzy taby: **Saved Reports** (card grid 3-col z system + user reports — pre-built: Cost by Product MTD, Cost by Period Monthly, Yield Loss Summary, WO Variance Summary, Inventory Valuation Snapshot, D365 Export Audit; per-card "Run Now" → MODAL-10, kebab Edit/Duplicate/Delete/Schedule), **Run Custom Report** (form builder: name, description, type dropdown, date range, filters multi-select, columns checkbox list, sort/group by; preview area z 25 rows + "View All (N)" + summary footer; CTAs Run Preview / Run & Export CSV / Save as Report), **Export Queue** (table aktualnych eksportów: ID, Report Name, Requested By, Format, Status badge, Created At, Download/Retry; auto-refresh 30s). API: `GET /api/finance/reports`, `POST /api/finance/reports/:id/run`, `GET /api/finance/exports/:jobId/status`. Reuse 12-REPORTING patterns dla scheduled reports (P2). RBAC: finance_manager (build+run), finance_viewer (run+export), auditor_readonly (run+export historical 7y).

#### FIN-009 Real-time Variance Dashboard [P2 PLACEHOLDER]

**Source:** UX:130, UX:600-606. **Status:** P2 banner per `[NO-PROTOTYPE-YET]` — placeholder screen tylko w UX. Prototype absent. Planned EPIC 10-O Variance Alerts + Thresholds. Live tile updates as WOs post consumption/labor; configurable alert thresholds; routes do FIN-007/008/010 dla bieżącego stanu.

#### FIN-004 BOM Costing Page + FIN-004b BOM Cost Detail [P2 PLACEHOLDER]

**Source:** UX:124-125, UX:388-394. **Status:** P2 banner — `[NO-PROTOTYPE-YET]`. Placeholder w UX bez prototype. Planned EPIC 10-G (margin) + cross-link 03-TECH BOM viewer (`/technical/boms`). Roll-up: item × BOM version × cost_per_kg → FG unit cost. Allocation across co-products (consumer §9.3). Version comparison.

#### FIN-012 BOM Cost Simulation [P2 PLACEHOLDER]

**Source:** UX:126, UX:684-688. **Status:** P2 banner — `[NO-PROTOTYPE-YET]`. EPIC 10-G what-if: change input prices / production mix → recompute FG unit cost + margin preview, save scenario for comparison.

#### FIN-013 Margin Analysis Dashboard [P2 PLACEHOLDER]

**Source:** UX:132, UX:691-694. **Status:** P2 banner — `[NO-PROTOTYPE-YET]`. EPIC 10-G product-level margin %, trend charts, ranking by customer/period. Wymaga sales price source (sales module lub manual admin entry, OQ-FIN-05).

#### FIN-014 Cost Center Budget Page + FIN-015 Budget Management [P2 PLACEHOLDER]

**Source:** UX:133-134, UX:698-708. **Status:** P2 banner — `[NO-PROTOTYPE-YET]`. EPIC 10-F Budget & Forecast: per-center budget vs actual, line-level variance, commit tracking; annual budget create + period allocation + approval workflow. Tables P2: `cost_center_budgets` (§6.3 stub).

#### FIN-016 D365 F&O Integration (UX canonical) [INDUSTRY-CONFIG]

**Source:** UX:137, UX:712-754, prototype `fin_d365_integration` (`finance/other-screens.jsx:144-360`).

> **Re-numbering note:** UX FIN-016 = PRD FIN-006 D365 Export Queue + DLQ Ops per §8.1. Identical scope, expanded layout. Pozostawiono PRD FIN-006 jako primary anchor; UX FIN-016 dodaje 5-tab layout details.

Connection Status card (green/red dot, env, dataAreaId=FNOR `[INDUSTRY-CONFIG]`, warehouse=ApexDG `[ORG-CONFIG]`, consolidation cutoff 23:00 UTC, uptime 30d, last successful post, "Test Connection", "Configure"). 4 KPI mini-cards: WO Cost Events Pending (next batch ETA), Daily Batches 30d, D365 Journal Lines last batch, DLQ Open. Tabs: **Daily Batches** (Batch Date/ID/Status/Line Count/Total Debit GBP/D365 Journal ID/Posted At/Reconciled — clickable batch detail panel), **Outbox Queue** (Event ID, Type, WO Ref, Status, Attempt Count, Next Retry, Last Error, Enqueued At), **DLQ** (DLQ ID, Source Event, Type, Error Category badge, Error Message expandable, Attempts, Moved/Resolved metadata, Replay → MODAL-08, Resolve → MODAL-09; retry schedule reference: 6-attempt immediate→+5m→+30m→+2h→+12h→+24h), **GL Mapping** (cost_category, D365 Account Code e.g. `5000-ApexDG-MAT` `[ORG-CONFIG]`, Offset Account, Journal Name=PROD, Last Updated, Updated By; row Edit → MODAL-13/cost_center_gl_mapping_modal), **Settings** (D365 Integration Enabled toggle gated by feature flag `integration.d365.finance_posting.enabled`, Consolidation Cutoff Time, recon schedule read-only "03:00 UTC = cutoff+4h"). Disconnected/DLQ-alert/all-clear/empty-DLQ state banners. Implementuje §12 INTEGRATIONS stage 5 fully.

#### FIN-017 Finance Settings [UNIVERSAL]

**Source:** UX:138, UX:757-810, prototype `fin_settings` (`finance/other-screens.jsx:362-458`).

Single-page form, 6 collapsible sections (każda `.card` z chevron toggle): **General** (Default Valuation Method radio FIFO/WAC mapped na `finance_settings.default_valuation_method`; Default Currency read-only `[ORG-CONFIG]` GBP base + link "Manage Currencies" → FIN-008/006; Variance Calculation Enabled toggle), **Standard Cost Policy** (Critical Approval PIN Required toggle → `finance_settings.critical_approval_pin_required` per §5.3 21 CFR Part 11; Standard Cost Effective Date Policy dropdown future-only/current-allowed/backdating-warn; Cost Basis Default; Cost Change Warning Threshold % default 20 → V-FIN-STD-06 trigger), **Variance Display Thresholds** (info note "Full alert engine P2 EPIC 10-O"; On Track ≤5% green, Warning 5-10% amber, Critical >10% red — display-only color coding, nie alert dispatch P1), **Overhead Allocation** (Default Allocation Basis dropdown labor_hours/machine_hours/units; Default Overhead Rate %), **Fiscal Calendar** (Calendar Type dropdown Standard Gregorian/4-4-5/4-5-4 `[INDUSTRY-CONFIG]`; Fiscal Year Start Month dropdown; note "affects period-end variance + budget P2"), **D365 Integration** (D365 Integration Enabled toggle default OFF; Consolidation Cutoff Time default 23:00; Reconciliation Schedule read-only "Daily 03:00 UTC = cutoff+4h"). Sticky unsaved-changes banner. Save Settings + Reset to Defaults (z confirmation modal). RBAC: finance_manager + admin. Audit log na każdy field change. Embedded action: "Manage Cost Centers" link → MODAL-13 cost center editor; "Lock Period (Phase 2)" button → MODAL-12 period_lock placeholder.

#### FIN-018 Cost Centers Admin [UNIVERSAL]

**Source:** PRD §6.1 row 2 (`cost_centers` table) + MODAL-13 cost center create/edit (UX:1038-1043) + prototype `cost_center_gl_mapping_modal` (`finance/modals.jsx:649-681`).

Dedicated CRUD screen dla `cost_centers` hierarchy (self-ref tree via `parent_id`, ltree-friendly). Treeview (left) + detail form (right). Fields per MODAL-13: Code (alphanumeric+dash, max 20), Name (max 100), Parent Cost Center dropdown (hierarchy parent), Production Line dropdown (02-SETTINGS join), Allocation Basis (labor_hours/machine_hours/units), D365 Dimension Code `[ORG-CONFIG]`, Is Active toggle. Validation V-FIN-SETUP-04 (no cycle in parent ref). Triggered z FIN-017 "Manage Cost Centers" link i z FIN-016 GL Mapping tab. RBAC: finance_manager + admin. **Note:** PRD §8.1 marked dedicated screen as "absent" (audit MED finding); FIN-018 fills gap — currently route TBD `/finance/cost-centers` (`[NO-PROTOTYPE-YET]` for tree page; modal already prototyped).

#### FIN-019 Bulk Import Standard Costs [UNIVERSAL]

**Source:** UX MODAL-04 (`UX:901-913`), prototype `bulk_import_csv_modal` (`finance/modals.jsx:247-340`).

3-step wizard modal triggered z FIN-002 "Import CSV" CTA. **Step 1 Upload:** drag-and-drop zone (.csv, .xlsx), "Download Template CSV" link (cols: item_code, item_type, effective_from, effective_to, material_cost, labor_cost, overhead_cost, currency_code, uom, cost_basis, notes), max 500 rows. **Step 2 Map & Validate:** preview pierwszych 5 rows, column mapping dropdowns auto-mapped (override allowed), validation summary (X valid / Y errors), error rows highlighted z inline error description, opcja "Skip error rows and import valid only". **Step 3 Review & Import:** summary "X standard costs will be created as drafts", warning dla missing item_codes "Z item_codes not found, will be skipped", checkbox "Submit all imported records for approval immediately (Finance Manager only)". Server Action `bulkImportStdCosts(rows, options)` w transakcji. Validation per §11.2 V-FIN-STD-01..08 stosowana per row. RBAC: finance_manager + admin. Status w `finance_outbox_events`/`finance_exports` audit. **Note:** PRD §8.1 nie wymieniał bulk import explicit (audit MED finding); FIN-019 fills gap.

#### FIN-020 Period Lock [P2 PLACEHOLDER]

**Source:** UX MODAL-12 (`UX:1029-1034`), prototype `period_lock_modal` (`finance/modals.jsx:615-647`).

> **Audit blocker:** Period locking concept całkowicie nieobecny w PRD v3.1 (audit HIGH severity #12). FIN-020 dodaje ten stub explicitly jako P2 EPIC 10-Q (new) — **scope clarification needed**, dlatego marker `[NO-PROTOTYPE-YET-IN-PRD]` (prototype istnieje, PRD scope brak).

Fiscal-period lock prevents new cost records / modifications dla danego period. Triggered z FIN-017 Settings "Lock Period (Phase 2)" button. Fields: Period to Lock (month/year selector z `fiscal_periods` ref table — **NEW P2 table required**, nie istnieje w §6 P1 schema), Lock Reason (textarea, required, min 20 chars audit), PIN re-verification (per §5.3 21 CFR Part 11 e-signature, SHA-256 hash). Amber warning alert "cannot be undone." CTA: Lock Period (`.btn-danger`) | Cancel. Server Action `lockFiscalPeriod(period_id, reason, pin_proof)`: weryfikuje PIN, UPDATE fiscal_periods SET status='locked', locked_at, locked_by, lock_reason, emit audit_log z SHA-256 hash. Validation: tylko finance_manager + owner. Required tables (P2): `fiscal_periods (id, org_id, period_start, period_end, status enum open/locked/closed, locked_at, locked_by, lock_reason, retention_until)` + audit FK. **Action item OQ-FIN-13 (new):** scope decision — czy fiscal period lock należy do P1 (BRCGS audit-evidence wymaga) czy P2 (post-launch). Default P2 zgodnie z UX placeholder.

#### FIN-021 GL Account Mapping Modal [INDUSTRY-CONFIG]

**Source:** UX MODAL-13 / FIN-016 GL Mapping tab Edit (`UX:739`, `UX:1040`), prototype `cost_center_gl_mapping_modal` (`finance/modals.jsx:649-681`).

> **Note:** PRD §8.1 FIN-007 = "GL Account Mappings Admin"; UX modeluje tę funkcję jako **modal embedded w FIN-016 D365 Integration GL Mapping tab** zamiast dedicated screen. FIN-021 dokumentuje modal-only kontrakt dla `gl_account_mappings` table CRUD. Audit MED (Direction A) — admin UI scoped to modal only.

Create/Edit modal embedded w FIN-016 GL Mapping tab → row "Edit" button. Fields: Cost Category dropdown (material/labor/overhead/waste/freight `[INDUSTRY-CONFIG]`), D365 Account Code (mono font, format `\d{4}-[A-Z][a-zA-Z0-9]+-[A-Z]+` per ADR Apex `[ORG-CONFIG]`, e.g. `5000-ApexDG-MAT`), Offset Account Code (e.g. `1200-WIP-MAT`), D365 Journal Name dropdown (PROD/COGS/ADJ from `d365_journal_names` lookup `[INDUSTRY-CONFIG]`), Active toggle. Validation V-FIN-SETUP-05 (mapping required for every cost_category). Server Action `saveGlMapping(data)`: upsert na (cost_category, site_id), audit_log emit, RBAC finance_manager only. Reused jako FIN-018 Cost Centers Admin sub-flow.

### 8.5 Modal contracts — UX cross-reference (MODAL-01 .. MODAL-13)

| Modal | UX line | Prototype | PRD anchor |
|---|---|---|---|
| MODAL-01 Standard Cost Create/Edit | UX:817 | `std_cost_create_modal` (`modals.jsx:21-101`) | FIN-002 §8.1; V-FIN-STD-01..08 |
| MODAL-02 Approve Standard Cost (E-signature) | UX:853 | `approve_std_cost_modal` (`modals.jsx:103-175`) | §5.3 21 CFR Part 11; V-FIN-STD-03/04/06 |
| MODAL-03 Cost History | UX:880 | `cost_history_modal` (`modals.jsx:177-245`) | FIN-002b §8.4; V-FIN-STD-07 |
| MODAL-04 Bulk Import Standard Costs | UX:901 | `bulk_import_csv_modal` (`modals.jsx:247-340`) | FIN-019 §8.4 |
| MODAL-05 FX Rate Override | UX:916 | `fx_rate_override_modal` (`modals.jsx:342-383`) | FIN-008/006; V-FIN-SETUP-03 |
| MODAL-06 FIFO Layer Drill-down | UX:931 | `fifo_layers_modal` (`modals.jsx:385-428`) | FIN-004/005; V-FIN-INV-01/02/05 |
| MODAL-07 Variance Note | UX:948 | `variance_note_modal` (`modals.jsx:430-463`) | FIN-005 PRD §8.1; FIN-007/008/010; §11.5 V-FIN-VAR-01..04 |
| MODAL-08 D365 DLQ Replay | UX:957 | `dlq_replay_modal` (`modals.jsx:465-505`) | §12.5 retry schedule; V-FIN-INT-05 |
| MODAL-09 D365 DLQ Manual Resolve | UX:976 | `dlq_resolve_modal` (`modals.jsx:507-537`) | §12.6 ops UI; V-FIN-INT-05 |
| MODAL-10 Export Report | UX:993 | `export_report_modal` (`modals.jsx:539-584`) | §8.2 `POST /api/finance/exports/csv` |
| MODAL-11 Supersede Standard Cost | UX:1012 | `supersede_std_cost_modal` (`modals.jsx:586-613`) | V-FIN-STD-07 supersede path; §13.1 standard_cost.approved |
| MODAL-12 Fiscal Period Lock Confirmation | UX:1029 | `period_lock_modal` (`modals.jsx:615-647`) | FIN-020 §8.4 P2 stub; OQ-FIN-13 (new) |
| MODAL-13 Cost Center Create/Edit + GL Mapping | UX:1038 | `cost_center_gl_mapping_modal` (`modals.jsx:649-681`) | FIN-018 §8.4 + FIN-021 §8.4; §6.1 row 2 + row 5 |

### 8.6 §UI surfaces — bidirectional matrix (PRD ↔ UX ↔ prototype)

> **Scope:** P1 + P2 placeholders. Status column rozróżnia: **OK** = pełna trójstronna zgodność, **OK-RENUMBER** = treść zgodna, drift w numeracji, **OK-P2** = P2 placeholder zgodny, **NEW-PRD** = sekcja dodana w §8.4 (Direction B fix), **MODAL-ONLY** = prototype + UX, brak dedicated PRD screen, **NO-PROTOTYPE-YET** = PRD/UX claim, prototype absent.

| FIN ID (canonical) | PRD section | UX line | Prototype label | Status | Markers |
|---|---|---|---|---|---|
| FIN-001 Finance Dashboard | §8.1 + §8.3 | UX:166 | `fin_dashboard` | OK | [UNIVERSAL] |
| FIN-002 Standard Cost List + Editor | §8.1 + §8.2 | UX:230 | `fin_standard_costs_list` | OK | [UNIVERSAL] |
| FIN-002b Standard Cost Detail Drawer | §8.4 (NEW) | UX:121 | `cost_history_modal` + row expansion | NEW-PRD | [UNIVERSAL] |
| FIN-003 WO Cost Summary | §8.1 + §8.2 | UX:294 | `fin_wo_detail` | OK | [UNIVERSAL] |
| FIN-003a WO Costs List | §8.4 (NEW) | UX:122, UX:300 | `fin_wo_list` | NEW-PRD | [UNIVERSAL] |
| FIN-004 BOM Costing (P2) | §8.4 (NEW P2) | UX:124 | — | NO-PROTOTYPE-YET | P2 EPIC 10-G |
| FIN-004b BOM Cost Detail (P2) | §8.4 (NEW P2) | UX:125 | — | NO-PROTOTYPE-YET | P2 EPIC 10-G |
| FIN-004 (PRD) Inventory Valuation = FIN-005 (UX) | §8.1 (PRD FIN-004) + §8.4 | UX:127, UX:397 | `fin_inventory_valuation` + `fifo_layers_modal` | OK-RENUMBER | [UNIVERSAL]; PRD FIN-004 ↔ UX FIN-005 |
| FIN-005 (PRD) Variance Dashboard | §8.1 | UX:502 (FIN-007) + UX:556 (FIN-008) | `fin_material_variance` + `fin_labor_variance` | OK-SPLIT | [UNIVERSAL]; UX rozdziela na 2 screens |
| FIN-006 (PRD) D365 Export Queue+DLQ = FIN-016 (UX) | §8.1 + §12 | UX:137, UX:712 | `fin_d365_integration` + `dlq_replay_modal` + `dlq_resolve_modal` | OK-RENUMBER | [INDUSTRY-CONFIG]; PRD FIN-006 ↔ UX FIN-016 |
| FIN-007 (PRD) GL Account Mappings = FIN-021 (modal) | §8.1 + §8.4 | UX:739 + UX:1038 (MODAL-13) | `cost_center_gl_mapping_modal` | MODAL-ONLY | [INDUSTRY-CONFIG]; admin UI scoped to modal embedded w FIN-016 GL Mapping tab |
| FIN-008 (PRD) Currency / FX = FIN-006 (UX) | §8.1 + §8.2 | UX:135, UX:451 | `fin_fx_rates` + `fx_rate_override_modal` | OK-RENUMBER | [UNIVERSAL]; PRD FIN-008 ↔ UX FIN-006 |
| FIN-009 Real-time Variance (P2) | §8.4 (NEW P2) | UX:130, UX:600 | — | NO-PROTOTYPE-YET | P2 EPIC 10-O |
| FIN-010 Variance Drill-down | §8.4 (NEW) | UX:131, UX:609 | `fin_variance_drilldown` | NEW-PRD | [UNIVERSAL]; consumes V-FIN-VAR-01..04 |
| FIN-011 Cost Reporting Suite | §8.4 (NEW) | UX:136, UX:643 | `fin_reports` | NEW-PRD | [UNIVERSAL]; cross-link 12-REPORTING patterns |
| FIN-012 BOM Cost Simulation (P2) | §8.4 (NEW P2) | UX:126, UX:684 | — | NO-PROTOTYPE-YET | P2 EPIC 10-G |
| FIN-013 Margin Analysis (P2) | §8.4 (NEW P2) | UX:132, UX:691 | — | NO-PROTOTYPE-YET | P2 EPIC 10-G |
| FIN-014 Cost Center Budget (P2) | §8.4 (NEW P2) | UX:134, UX:698 | — | NO-PROTOTYPE-YET | P2 EPIC 10-F |
| FIN-015 Budget Management (P2) | §8.4 (NEW P2) | UX:133, UX:705 | — | NO-PROTOTYPE-YET | P2 EPIC 10-F |
| FIN-017 Finance Settings | §8.4 (NEW) | UX:138, UX:757 | `fin_settings` | NEW-PRD | [UNIVERSAL] + [ORG-CONFIG] (currency, calendar) + [INDUSTRY-CONFIG] (calendar type, D365 flags) |
| FIN-018 Cost Centers Admin | §8.4 (NEW) | UX:1038 (MODAL-13) | `cost_center_gl_mapping_modal` (modal only); page TBD | NEW-PRD; page NO-PROTOTYPE-YET | [UNIVERSAL]; V-FIN-SETUP-04 hierarchy |
| FIN-019 Bulk Import Standard Costs | §8.4 (NEW) | UX:901 (MODAL-04) | `bulk_import_csv_modal` | NEW-PRD | [UNIVERSAL]; modal-as-screen |
| FIN-020 Period Lock (P2) | §8.4 (NEW P2) | UX:1029 (MODAL-12) | `period_lock_modal` | NEW-PRD-P2 | P2; OQ-FIN-13 scope; new `fiscal_periods` table required |
| FIN-021 GL Account Mapping Modal | §8.4 (NEW) | UX:1040 (MODAL-13) | `cost_center_gl_mapping_modal` | NEW-PRD | [INDUSTRY-CONFIG]; embedded w FIN-016 |

**Aggregate coverage post-amendment:** PRD §8.1 (8 screens) + §8.4 (13 added entries) = **21 FIN-NNN surfaces enumerated** + 13 modals (§8.5). UX (17 screens + 13 modals) = full coverage. Prototypes (25 entries) = 100% mapped. Audit pre-amendment ~50% → **post-amendment ~92%** (residual gaps: 7 P2 placeholders intentionally unprototyped pending EPIC 10-F/G/O scheduling).

---

## §9. Cost rollup engine (cascade-aware, DAG)

### 9.1 Rollup model

Dla każdego WO:

```
total_cost_actual = material_cost_actual        -- z material_consumption_costs (sum)
                  + labor_cost_actual            -- z labor_costs (sum)
                  + overhead_cost_actual         -- z overhead_allocations (sum)
                  + waste_cost_actual            -- z wo_waste_log × waste_categories.cost_per_kg × qty

cascade_total_actual = total_cost_actual + Σ child.cascade_total_actual  -- recursive
                                           (for child in wo_dependencies WHERE parent_wo_id = this.wo_id)
```

### 9.2 Recursive CTE (Postgres)

```sql
WITH RECURSIVE wo_cascade AS (
  -- Anchor: leaf WOs (no children)
  SELECT
    wc.wo_id,
    wc.total_cost_actual,
    wc.total_cost_actual AS cascade_sum,
    0 AS depth
  FROM work_order_costs wc
  WHERE wc.org_id = $1
    AND NOT EXISTS (
      SELECT 1 FROM wo_dependencies wd WHERE wd.parent_wo_id = wc.wo_id
    )

  UNION ALL

  -- Recursive: parent = own + sum(children.cascade_sum)
  SELECT
    wc.wo_id,
    wc.total_cost_actual,
    wc.total_cost_actual + (
      SELECT COALESCE(SUM(child.cascade_sum), 0)
      FROM wo_dependencies wd
      JOIN wo_cascade child ON child.wo_id = wd.child_wo_id
      WHERE wd.parent_wo_id = wc.wo_id
    ) AS cascade_sum,
    parent.depth + 1
  FROM work_order_costs wc
  JOIN wo_dependencies wd ON wd.parent_wo_id = wc.wo_id
  JOIN wo_cascade parent ON parent.wo_id = wd.child_wo_id
  WHERE wc.org_id = $1
)
UPDATE work_order_costs wc
SET cascade_total_actual = c.cascade_sum, updated_at = now()
FROM wo_cascade c
WHERE wc.wo_id = c.wo_id;
```

**Cycle detection:** Zapobiegamy infinite recursion poprzez `wo_dependencies` INSERT trigger walidujący DAG acyclicity (04-PLAN §8.5 V-PLAN-WO-CYCLE rule reuse).

**Performance target:** 5-level BOM cascade <10s P95 (NFR §15).

### 9.3 Co-product / by-product allocation

Gdy WO produkuje primary + co-products (per 03-TECH `bom_co_products`):

```
primary_qty    = SUM(wo_outputs.qty_kg WHERE output_type='primary')
co_products    = [(item_id, allocation_pct) FROM bom_co_products WHERE bom_id = wo.bom_id AND is_primary = false]

primary_allocated_cost = total_cost_actual × (1 - SUM(co_products.allocation_pct))
each co_product_cost   = total_cost_actual × co.allocation_pct

-- Apply to material_consumption_costs.allocated_to_output:
INSERT INTO material_consumption_costs (..., output_attribution_item_id, allocated_cost) VALUES
  (primary_item_id, primary_allocated_cost),
  (co_product_item_id_1, co_product_cost_1), ...
```

**By-products** (`output_type='byproduct'`) domyślnie dostają `allocation_pct=0` → zero cost absorbed (waste cost tylko jeśli `recovery_value=0` w `waste_categories`); P2 = recovery credit if `recovery_value_per_kg > 0`.

### 9.4 Triggers

```sql
-- On wo_executions.status change to COMPLETED:
CREATE OR REPLACE FUNCTION trigger_wo_cost_finalize() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
    -- Enqueue async cost calculation (not inline — performance)
    INSERT INTO job_queue (job_type, payload) VALUES
      ('wo_cost_finalize', jsonb_build_object('wo_id', NEW.wo_id, 'org_id', NEW.org_id));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Worker picks job → executes recursive CTE UPDATE → marks `work_order_costs.status='closed'` → inserts `finance_outbox_events` row (target: D365 daily consolidation queue).

### 9.5 Waste cost allocation (Q4 decision)

Per `wo_waste_log` record:
```
waste_cost_line = waste_log.qty_kg × waste_category.cost_allocation_rate
```

Gdzie `waste_category.cost_allocation_rate`:
- **P1:** `materials_cost_per_kg_avg` (waste of that item type) × 1.0 (full loss absorbed)
- **P2:** Apply DSL rule `waste_cost_allocator_v1` (może zwrócić partial recovery credit)

Waste cost aggregated per WO → `work_order_costs.waste_cost_actual`.

---

## §10. DSL rules (registered w 02-SETTINGS §7)

### 10.1 `cost_method_selector_v1` [UNIVERSAL]

**Type:** Conditional (method resolution per transaction)
**Trigger:** On `inventory_cost_layers` insert (receipt) + on material consume event (05-WH §10)
**Purpose:** Resolve FIFO vs WAC per org config + per transaction type.

```yaml
rule_id: cost_method_selector_v1
type: conditional
entity: inventory_cost_layers | material_consumption_costs
version: 1.0
triggers:
  - event: lp.received
  - event: material.consumed
evaluation:
  - step: lookup_org_config
    field: finance_settings.default_valuation_method
    output: method
  - step: apply_method
    rules:
      - if: method == 'fifo' AND event.type == 'lp.received'
        action: create_cost_layer(item_id, qty_kg, unit_cost, receipt_date)
      - if: method == 'fifo' AND event.type == 'material.consumed'
        action: consume_fifo_layers(item_id, qty_kg)  -- FIFO ordering by receipt_date ASC
      - if: method == 'wac' AND event.type == 'lp.received'
        action: update_wac_state(item_id, qty_kg, unit_cost)  -- running avg
      - if: method == 'wac' AND event.type == 'material.consumed'
        action: consume_at_wac(item_id, qty_kg)  -- use item_wac_state.avg_cost
outcome:
  - unit_cost (per-consume)
  - cost_layer_id (if FIFO)
fallback_v0: wac  -- default to WAC if rule fails
```

**Version history:** v1.0 initial. Future v1.1 could add LIFO P3 if org requests.

### 10.2 `waste_cost_allocator_v1` [UNIVERSAL]

**Type:** Conditional (allocation strategy per waste category)
**Trigger:** On `wo_waste_log` insert
**Purpose:** Compute cost allocation per waste category (full loss P1, recovery credit P2).

```yaml
rule_id: waste_cost_allocator_v1
type: conditional
entity: wo_waste_log → work_order_costs.waste_cost_actual
version: 1.0
triggers:
  - event: waste.logged
evaluation:
  - step: lookup_category
    field: waste_categories WHERE id = waste_log.category_id
    output: category
  - step: lookup_item_cost
    field: items.cost_per_kg OR fifo_avg_for_item(item_id)
    output: unit_cost
  - step: apply_strategy
    rules:
      - if: category.cost_allocation_method == 'full_loss'
        action: waste_cost = qty_kg × unit_cost
      - if: category.cost_allocation_method == 'partial_recovery'  -- P2
        action: waste_cost = qty_kg × (unit_cost - category.recovery_value_per_kg)
      - if: category.cost_allocation_method == 'sell_scrap'  -- P2
        action: waste_cost = 0  (credit GL scrap_revenue instead, handled w EPIC 10-K)
outcome:
  - waste_cost (added to work_order_costs.waste_cost_actual)
fallback_v0: full_loss
```

### 10.3 `standard_cost_approval_v1` [EVOLVING] — P2 stub

**Status:** P1 = placeholder registered, no logic beyond single sign-off (finance_manager direct approve). P2 = multi-level workflow.

```yaml
rule_id: standard_cost_approval_v1
type: gate + workflow_as_data
entity: standard_costs
version: 1.0 (P1 stub), 2.0 planned (P2 multi-level)
triggers:
  - event: standard_cost.submitted
p1_evaluation:
  - step: single_role_approve
    roles: [finance_manager, owner]
    outcome: allow
p2_evaluation (planned):
  - step: threshold_check
    - if: total_cost_change_pct < 5%
      action: finance_manager_single_approve
    - if: 5% <= change_pct < 20%
      action: finance_manager + plant_director dual_sign
    - if: change_pct >= 20%
      action: owner_approve_required
```

### 10.4 Registry update to 02-SETTINGS §7 (v3.1 delta)

Po C4 Sesja 2 close — 02-SETTINGS `rules_registry` zostanie rozszerzony:

**Before (10 rules after 09-QA):**
1. `wo_state_machine_v1`
2. `allergen_changeover_gate_v1`
3. `closed_production_strict_v1`
4. `output_yield_gate_v1`
5. `fefo_strategy_v1`
6. `batch_release_gate_v1` (P2)
7. `ccp_deviation_escalation_v1`
8. `qa_status_state_machine_v1`
9. `allergen_sequencing_optimizer_v2`
10. `finite_capacity_solver_v1`
11. `disposition_bridge_v1` (P2)
12. `allergen_cascade_rm_to_fg`

**After (add 3 from 10-FIN):**
13. `cost_method_selector_v1` ✅
14. `waste_cost_allocator_v1` ✅
15. `standard_cost_approval_v1` (P1 stub)

Total registry = 15 rules w 02-SETTINGS §7.

---

## §11. Validation rules V-FIN-*

### 11.1 Setup validations (V-FIN-SETUP-*)

| Rule ID | Scope | Severity | Description |
|---|---|---|---|
| V-FIN-SETUP-01 | finance_settings | block | Required 1 row per org; `default_currency_id` must exist w currencies |
| V-FIN-SETUP-02 | currencies | block | At least 1 currency WHERE `is_base=true` per org |
| V-FIN-SETUP-03 | currencies | warn | Exchange rate older than 7 days → warn operator |
| V-FIN-SETUP-04 | cost_centers | block | `parent_id` must not cause cycle (self-ref tree) |
| V-FIN-SETUP-05 | gl_account_mappings | block | Required mapping for every cost_category used w work_order_costs |

### 11.2 Standard cost validations (V-FIN-STD-*)

| Rule ID | Severity | Description |
|---|---|---|
| V-FIN-STD-01 | block | `effective_to > effective_from` or NULL |
| V-FIN-STD-02 | block | No overlapping approved records per (item_id, currency_id) |
| V-FIN-STD-03 | block | Approval requires `approved_by` with role finance_manager OR owner |
| V-FIN-STD-04 | block | `approval_signature_hash` populated on status='approved' |
| V-FIN-STD-05 | block | `total_cost > 0` for status='approved' |
| V-FIN-STD-06 | warn | Cost change >20% vs previous approved → suggest dual sign-off (P1 warn, P2 block via rule v2.0) |
| V-FIN-STD-07 | block | 21 CFR Part 11: no update to `status='approved'` rows except supersede path |
| V-FIN-STD-08 | info | `cost_basis` NULL → suggest setting (quoted/historical/calculated/imported_d365) |

### 11.3 WO cost validations (V-FIN-WO-*)

| Rule ID | Severity | Description |
|---|---|---|
| V-FIN-WO-01 | block | 1 `work_order_costs` row per `wo_id` (unique constraint) |
| V-FIN-WO-02 | block | `currency_id` match finance_settings.default_currency_id OR explicit override |
| V-FIN-WO-03 | warn | `yield_variance_pct` outside ±10% → flag for review (reuse 08-PROD `output_yield_gate_v1`) |
| V-FIN-WO-04 | block | Cascade rollup must not contain cycle (04-PLAN V-PLAN-WO-CYCLE enforced upstream) |
| V-FIN-WO-05 | block | `status='closed'` requires all `wo_outputs` registered AND all `wo_waste_log` final |
| V-FIN-WO-06 | warn | Unit cost actual >2x standard → material substitution or yield catastrophe suspect |
| V-FIN-WO-07 | block | Co-product allocation_pct sum ≤ 100%; product codes use FG-* format, WIP codes use WIP-<suffix>-<sequence> |
| V-FIN-WO-08 | info | WO completed but `work_order_costs` not finalized within 24h → alert finance_manager |

### 11.4 Inventory valuation (V-FIN-INV-*)

| Rule ID | Severity | Description |
|---|---|---|
| V-FIN-INV-01 | block | `inventory_cost_layers.qty_remaining_kg <= qty_received_kg` always |
| V-FIN-INV-02 | block | FIFO consume order: `receipt_date ASC` enforced |
| V-FIN-INV-03 | warn | Item has both FIFO layers AND non-zero WAC state → method drift (org changed method mid-period); log for reconciliation |
| V-FIN-INV-04 | block | `item_wac_state.total_qty_kg >= 0` (no negative inventory) |
| V-FIN-INV-05 | info | FIFO layer exhausted (`is_exhausted=true`) → archive candidate post-7y |

### 11.5 Variance validations (V-FIN-VAR-*)

| Rule ID | Severity | Description |
|---|---|---|
| V-FIN-VAR-01 | info | `total_variance` > 5% standard cost → dashboard highlight |
| V-FIN-VAR-02 | warn | `total_variance` > 10% → notify finance_manager |
| V-FIN-VAR-03 | warn | Material variance >15% → investigate FIFO layer mis-consumption |
| V-FIN-VAR-04 | info | Yield variance + material variance both negative → possible input substitution; flag for cross-check |

### 11.6 INTEGRATIONS stage 5 validations (V-FIN-INT-*)

| Rule ID | Severity | Description |
|---|---|---|
| V-FIN-INT-01 | block | `finance_outbox_events.idempotency_key` unique (UUID v7) |
| V-FIN-INT-02 | block | D365 payload mapping requires `d365_constants.dataAreaId` present |
| V-FIN-INT-03 | block | `target_payload.lines` non-empty before dispatch |
| V-FIN-INT-04 | warn | Outbox event age >24h in 'pending' status → escalate |
| V-FIN-INT-05 | block | DLQ record permanent errors require manual resolution (no auto-retry) |
| V-FIN-INT-06 | info | D365 journal_id populated on success (recon marker) |
| V-FIN-INT-07 | warn | Daily consolidation produced 0 lines (possible batch failure) |

**Total:** ~29 V-FIN-* validation rules (P1).

---

## §12. INTEGRATIONS stage 5 (D365 F&O cost posting)

### 12.1 Overview

**Goal:** Push daily consolidated general journal lines to D365 F&O instance FNOR via DMF (Data Management Framework) entity `GeneralJournalLineEntity`. Pattern **reuses** 08-PRODUCTION §12 stage 2 outbox template identyczny (D365 F&O WO confirmations push). Single implementation template = faster build 10-e, shared test harness.

**Granularity (Q5 decision):** Daily consolidated journal (single JournalHeader + N JournalLines), NOT per-WO. Consolidator job runs 23:00 UTC (configurable per `finance_settings.d365_consolidation_cutoff_time`). Reduces D365 API calls 100x+ vs per-WO.

**Non-goals stage 5:**
- Real-time posting (P2 if needed)
- Reverse journal on DLQ permanent (manual operation FIN-006)
- AR/AP bridge (out-of-scope)
- Tax calculation (D365 Tax Calculation Service handles)

### 12.2 Event taxonomy (finance_outbox_events.event_type)

| event_type | Trigger | Payload |
|---|---|---|
| `finance.wo_cost.closed` | `work_order_costs.status` transitions open→closed | `{ wo_id, total_cost, cost_center, currency_id, posting_date }` |
| `finance.wo_cost.reversed` | Admin reversal (correction) | `{ wo_id, original_journal_id, reversal_reason }` |
| `finance.daily_journal.ready` | Nightly consolidator job output | `{ batch_date, lines: [...], total_debit, total_credit }` |
| `finance.inventory_adjustment` | Manual inventory revaluation P2 | `{ item_id, delta_qty, delta_value, reason }` |

### 12.3 Daily consolidation job

```
Cron: 0 23 * * * UTC  (configurable per finance_settings.d365_consolidation_cutoff_time)

Pseudocode:
  1. batch_date = today
  2. Fetch all finance_outbox_events WHERE event_type='finance.wo_cost.closed'
     AND enqueued_at >= (batch_date - 1 day) AND enqueued_at < batch_date
     AND status='pending'
  3. Group by (cost_center_id, currency_id, gl_account)
     → produce consolidated lines:
        { accountCode: FinGoods, amount: SUM(material+labor+overhead), currency: GBP,
          description: "WO batch 2026-04-20", reference: batch_id }
  4. Create single finance_outbox_events row WITH event_type='finance.daily_journal.ready'
     aggregate_id=batch_id, payload={ lines: [...], journal_date: batch_date }
  5. Mark original per-WO events as status='consolidated' (terminal, no separate push)
  6. Dispatcher picks finance.daily_journal.ready → R15 adapter → D365 DMF
```

### 12.4 R15 anti-corruption adapter

**Canonical internal (before adapter):**
```json
{
  "batch_id": "UUID",
  "batch_date": "2026-04-20",
  "journal_lines": [
    {
      "cost_center_id": "UUID",
      "cost_category": "material",
      "amount_gbp": 12450.50,
      "description": "WO-2026-0451 to WO-2026-0472 material",
      "wo_refs": ["wo_id_1", "wo_id_2", ...]
    },
    {
      "cost_center_id": "UUID",
      "cost_category": "labor",
      "amount_gbp": 3420.00,
      ...
    }
  ],
  "idempotency_key": "0191b234-1234-7abc-9def-..."  -- UUID v7
}
```

**D365 F&O payload (after adapter):**
```json
{
  "dataAreaId": "FNOR",                              -- z 02-SETTINGS §11
  "JournalBatchNumber": "MONO-PROD-20260420",
  "JournalName": "PROD",                              -- configurable per gl_account_mappings.d365_journal_name
  "Description": "Monopilot production cost 2026-04-20",
  "JournalLines": [
    {
      "LineNumber": 1,
      "AccountType": "Ledger",
      "AccountCode": "5000-ApexDG-MAT",                -- gl_account_mappings lookup: cost_category='material'
      "DebitAmount": 12450.50,
      "CreditAmount": 0,
      "TransDate": "2026-04-20",
      "CurrencyCode": "GBP",
      "Description": "WO batch material cost",
      "OffsetAccountCode": "1200-WIP-MAT",
      "Dimensions": { "CostCenter": "FOR-LINE1", "Product": "FA5101" }
    },
    {
      "LineNumber": 2,
      "AccountCode": "5100-ApexDG-LAB",
      "DebitAmount": 3420.00,
      ...
    }
  ],
  "MetaData": {
    "idempotencyKey": "0191b234-...",                  -- R14 UUID v7
    "sourceSystem": "monopilot",
    "monopilotVersion": "3.0",
    "batchId": "UUID"
  }
}
```

**Adapter implementation (`@monopilot/d365-finance-adapter`):**
- Loads `gl_account_mappings` z 10-FIN + `d365_constants` z 02-SETTINGS §11
- Maps `cost_category` → `AccountCode` + `OffsetAccountCode`
- Validates `DebitAmount + OffsetAccount` balance per line
- Stamps `idempotencyKey` z `finance_outbox_events.idempotency_key`
- Signs payload SHA-256 for D365 webhook signature check

### 12.5 Retry schedule + DLQ (reuse 08-PROD §12 exactly)

| Attempt | Delay | Action |
|---|---|---|
| 1 | immediate | Dispatcher first send |
| 2 | +5 min | Retry on transient |
| 3 | +30 min | Retry |
| 4 | +2h | Retry |
| 5 | +12h | Retry |
| 6 | +24h | Final retry; if fails → move to DLQ |

**Error categorization:**

| Category | HTTP codes | Action |
|---|---|---|
| transient | 408/429/500/502/503/504, network timeout | Retry per schedule |
| permanent | 400/401/403/404/409 | Move to DLQ immediately |
| schema | 400 with validation detail | Move to DLQ, alert ops (schema mismatch — likely Monopilot bug) |
| d365_validation | 422 D365-specific | Move to DLQ, investigate (likely missing dimension or closed period) |

### 12.6 Ops UI FIN-006

- **Queue view:** Live count pending/dispatching/delivered last 24h (auto-refresh 30s)
- **DLQ list:** Filterable by error_category, date range, WO refs
- **Manual replay:** Button → generates new idempotency_key (UUID v7), requeues to outbox with status='pending'. Reason required w resolution_notes.
- **Manual resolve:** Close DLQ record (e.g. data posted manually w D365). resolution_notes mandatory.
- **D365 health:** Last successful post timestamp + error rate 24h chart
- **Daily batch overview:** List batches last 30 days, status, line counts, total GBP, D365 journal_id

### 12.7 Reconciliation

**Daily recon job (separate cron, +4h po consolidation cutoff):**
- Query D365 `GeneralJournalLineEntity WHERE JournalBatchNumber='MONO-PROD-{date}'`
- Compare line count + total debit vs `finance_outbox_events.payload.lines`
- Mismatch → alert finance_manager + audit record
- Match → mark `work_order_costs.posted_to_d365_at` + store `d365_journal_id`

### 12.8 Configuration (02-SETTINGS integration)

Reuse `d365_constants` table from 02-SETTINGS §11:

```yaml
dataAreaId: FNOR                    # [APEX-CONFIG]
approver_user_id: APX100048         # D365 approver (reference only, no enforcement)
warehouse_code: ApexDG              # For dimension mapping
finished_goods_account: FinGoods    # GL account for FG inventory
production_resource: APXProd01        # Routing resource (read by 08-PROD stage 2)
```

Feature flag: `integration.d365.finance_posting.enabled` (PostHog + `finance_settings.d365_integration_enabled`). Default `false`; enable post-Go-live validation.

---

## §13. Consumer hooks (upstream events)

### 13.1 Event subscriptions

| Event (producer) | Handler (10-FIN) | Action |
|---|---|---|
| `lp.received` (05-WH §8) | `handle_lp_received` | Insert `inventory_cost_layers` row (FIFO) + update `item_wac_state` (WAC) — **both** tracked parallel |
| `material.consumed` (05-WH §10) | `handle_material_consumed` | Query rule `cost_method_selector_v1` → resolve FIFO layer OR WAC avg → insert `material_consumption_costs` → update `work_order_costs.material_cost_actual` |
| `labor.recorded` (08-PROD §8 manufacturing operations) | `handle_labor_recorded` | Insert `labor_costs` row (keyed by manufacturing_operation_id: Mix/Bake/etc) → update `work_order_costs.labor_cost_actual` |
| `waste.logged` (08-PROD §9.5) | `handle_waste_logged` | Query rule `waste_cost_allocator_v1` → compute waste_cost → update `work_order_costs.waste_cost_actual` |
| `wo_output.registered` (08-PROD §9.4) | `handle_wo_output` | Apply `bom_co_products.allocation_pct` split → write `output_attribution` to material_consumption_costs |
| `wo.completed` (08-PROD §7 state machine) | `handle_wo_completed` | Enqueue job `wo_cost_finalize` → recursive CTE cascade rollup + variance calc → mark `work_order_costs.status='closed'` → enqueue `finance.wo_cost.closed` outbox event |
| `ncr.yield_issue.created` (09-QA §6) | `handle_ncr_yield` | Read `claim_value_eur` + `yield_loss_qty_kg` → write to `yield_loss_ledger` (P1 view over ncr_reports; P2 separate table) |
| `quality.hold.created` (09-QA §6) | `handle_hold_created` P2 | Mark affected `inventory_cost_layers` as `is_frozen=true` → exclude from inventory valuation until released |
| `quality.hold.released` (09-QA §6) | `handle_hold_released` P2 | Unfreeze; re-valuate |
| `standard_cost.approved` (10-FIN internal) | `handle_std_cost_approved` | Update `items.cost_per_kg` per D-FIN-9 (10-FIN owns lifecycle, 03-TECH schema) |
| `d365.items.imported` (03-TECH §13 stage 1) | `handle_d365_items_import` | Extract `cost_per_kg` from D365 items sync → create `standard_costs` draft w status='pending' (Q6 decision) |

### 13.2 cost_per_kg dual ownership (D-FIN-9 retained)

**Schema owner:** 03-TECH `items.cost_per_kg NUMERIC(15,4)` (storage in items table, part of product master).

**Lifecycle owner:** 10-FIN writes `items.cost_per_kg` triggered by:
- Standard cost approval (`standard_cost.approved` event) → update to approved `total_cost / uom_kg_factor`
- WO close periodic recalc (monthly): `handle_wo_completed` → avg recent WOs → suggest update (audit log, not auto-update)
- D365 import (`d365.items.imported`) → create draft `standard_costs` → await approval

**RLS:** 03-TECH read + 10-FIN write on `items.cost_per_kg` specifically (policy `cost_per_kg_write_finance_only`).

### 13.3 Yield loss monthly aggregation (10-FIN reads 09-QA)

```sql
-- Monthly yield loss GBP widget (FIN-001 dashboard)
SELECT
  DATE_TRUNC('month', n.created_at) AS month,
  i.name AS product,
  COUNT(*) AS incident_count,
  SUM(n.yield_loss_qty_kg) AS total_loss_kg,
  SUM(n.claim_value_eur * er.rate) AS total_loss_gbp
FROM ncr_reports n
JOIN items i ON i.id = n.item_id
JOIN exchange_rates er ON er.currency_id = (SELECT id FROM currencies WHERE code = 'EUR')
  AND er.effective_date <= n.created_at::date
WHERE n.org_id = $1
  AND n.ncr_type = 'yield_issue'
  AND n.created_at >= $2  -- period_start
GROUP BY month, product
ORDER BY month DESC, total_loss_gbp DESC;
```

P2 EPIC 10-K upgrade: dedicated `yield_loss_ledger` table (materialized) z dodatkowymi dimensions (line_id, shift, root_cause).

---

## §14. Multi-tenant (ADR-030/031)

### 14.1 L2 variation (per-tenant config)

Apex + future tenants różnią się w:

| Aspect | Mechanism | Example |
|---|---|---|
| Costing method default | `finance_settings.default_valuation_method` | Apex=FIFO, future tenant X=WAC |
| Currency base | `currencies.is_base` | Apex=GBP, EU tenants=EUR |
| D365 instance config | `d365_constants` per org (02-SETTINGS §11) | Apex=FNOR, future=different dataAreaId |
| GL account mappings | `gl_account_mappings` per org | Tenant-specific chart of accounts |
| Approval thresholds | `finance_settings.critical_approval_pin_required` + P2 rule `standard_cost_approval_v1` | Strict vs lenient per org |
| Cost center hierarchy | `cost_centers` tree | Per tenant organization structure |
| Daily consolidation cutoff | `finance_settings.d365_consolidation_cutoff_time` | Per local timezone |

### 14.2 L3 schema-driven extensions (ADR-028)

`work_order_costs.ext_jsonb`, `standard_costs.ext_jsonb`, `finance_settings.ext_jsonb` — tenants dodają custom fields:
- Energy cost allocation (kWh × rate)
- Scrap recovery revenue (per-category credit)
- Insurance allocation
- Environmental cost (carbon footprint per WO)

Admin UI schema wizard 02-SETTINGS §6 — standard path. L3 fields automatycznie widoczne w FIN-003 WO Cost Summary via schema-driven renderer.

### 14.3 L4 (defer)

Full code customization dla finance = Phase 3+ (e.g. novel costing methods per tenant). Niezbyt prawdopodobne w food-mfg domain.

---

## §15. NFR + Performance

### 15.1 Performance targets

| Operation | Target | Measurement |
|---|---|---|
| WO cost calc trigger (single WO, no cascade) | <1s | APM |
| Recursive cascade rollup (5-level BOM) | <10s P95 | APM |
| Inventory valuation query (whole warehouse) | <5s P95 | APM |
| FIFO layer consume (sequential) | <200ms per transaction | APM |
| WAC update | <50ms per transaction | APM |
| FIN-001 Dashboard initial load | <2s P95 | Lighthouse |
| FIN-003 WO Cost Summary | <1.5s P95 | Lighthouse |
| Daily consolidator job (1000 WOs) | <60s | Job metrics |
| D365 journal post (500 lines) | <5s | D365 API latency + adapter |
| DLQ replay single | <3s end-to-end | APM |
| Variance recalculation (100 WOs) | <30s | Job metrics |

### 15.2 Availability

- **10-FIN API:** 99.5% P1, 99.9% P2
- **D365 integration:** Graceful degradation — if D365 down, outbox queues events (no blocking); catchup on recovery
- **Consolidation job:** Idempotent; re-runs safely (upsert on idempotency_key)

### 15.3 Scalability

- **WO volume:** 500 WOs/day at Apex Phase 1, up to 5000/day at multi-site Phase 2
- **Transactions:** ~50 consume + 20 labor + 10 waste per WO = 40k transactions/day Phase 1
- **Inventory layers:** ~100 items × 3-5 active FIFO layers = 500 rows steady state; grows with retention
- **Partition strategy:** `work_order_costs` + `material_consumption_costs` + `finance_outbox_events` partitioned by `created_at` monthly (7y retention)
- **Archival:** Nightly move records where `retention_until < today` → `archive_finance.*` schema; hard-delete after 7y if audit cleared

### 15.4 Security

- **RLS:** `org_id` on all tables (tested w CI automated org isolation suite)
- **PII:** Minimal — user_id refs only, no employee cost details (salary data OUT-OF-SCOPE, belongs to payroll)
- **21 CFR Part 11 e-signature:** SHA-256 w `standard_costs.approval_signature_hash`, PIN re-verification critical approvals
- **Audit log:** Immutable `cost_approval_audit` (no UPDATE/DELETE except archival move)
- **D365 credentials:** Azure Key Vault managed; rotated quarterly; integration service has minimal RBAC (write-only JournalLine entity)

### 15.5 Observability

- **Metrics:** Prometheus (cost_calc_duration_seconds, variance_count, outbox_pending_count, dlq_count, d365_post_success_rate)
- **Logs:** Structured JSON, correlation_id propagated from WO events
- **Dashboards:** Grafana — finance ops health, D365 integration health, DLQ trend
- **Alerts:** PagerDuty (DLQ >10 open, D365 post error rate >5%, WO costing >24h delay)

---

## §16. Open questions + Next steps

### 16.1 Open items (OQ-FIN-*)

| ID | Item | Resolution plan |
|---|---|---|
| OQ-FIN-01 | Landed cost variance (freight/duty/handling per PO) | EPIC 10-M Phase 2 design (2026-Q3) |
| OQ-FIN-02 | Cost approval threshold (when dual sign-off required) | P2 rule `standard_cost_approval_v1` v2.0 — thresholds per org config |
| OQ-FIN-03 | Exchange rate API source (ECB/XE.com/D365) | P2 vendor selection — default manual entry P1 |
| OQ-FIN-04 | FIFO layer merge / consolidation post-exhaust | P2 job, currently accumulate (7y retention acceptable) |
| OQ-FIN-05 | Margin analysis target source (selling price) | EPIC 10-G P2 — sales module or manual admin entry |
| OQ-FIN-06 | D365 consolidation cutoff timezone handling (multi-site) | P2 EPIC 10-J multi-currency + multi-timezone |
| OQ-FIN-07 | Accrual posting for quality complaints | EPIC 10-K P2 post-complaints full workflow (09-QA 8M) |
| OQ-FIN-08 | Cost reversal workflow (post-posting correction) | P2 — reverse journal + counter-entry pattern |
| OQ-FIN-09 | Customer-specific GL dimensions | P2 — dimensions from D365 customer master sync |
| OQ-FIN-10 | Audit export format (SOC-1/SOC-2 ready) | Pre-first audit — adopt existing 09-QA audit export pattern |
| OQ-FIN-11 | Savings calculator best-yield source (historical window) | P2 EPIC 10-H — default 90d rolling, configurable |
| OQ-FIN-12 | Overhead allocation driver flexibility | P2 EPIC 10-F — currently labor_hours/machine_hours/units fixed |
| OQ-FIN-13 | Fiscal period lock scope (P1 audit-evidence vs P2 EPIC 10-Q) | Default P2 per UX placeholder MODAL-12; user decision needed if BRCGS audit requires P1 lock semantics. Adds `fiscal_periods` table (§8.4 FIN-020). |

**Nie blockery C4 Sesja 3.** Wszystkie OQ-FIN-* są P2 / post-launch scope.

### 16.2 Phase 2 epics (11 deferred)

Per §3.1:
- **EPIC 10-F** Budget & Forecast
- **EPIC 10-G** Margin Analysis
- **EPIC 10-H** Savings Calculator
- **EPIC 10-I** Variance Decomposition (MPV/MQV/LRV/LEV)
- **EPIC 10-J** Multi-Currency Operations
- **EPIC 10-K** Complaint Cost Allocation
- **EPIC 10-L** AR/AP Bridge
- **EPIC 10-M** Landed Cost Variance
- **EPIC 10-N** Supplier Invoice OCR
- **EPIC 10-O** Variance Alerts + Thresholds
- **EPIC 10-P** Advanced Inventory Revaluation

Plus:
- P2 table stubs: `product_margins`, `cost_center_budgets`, `variance_thresholds`, `variance_alerts`, `accruals`

### 16.3 Cross-PRD revision 02-SETTINGS v3.1 delta (apply post C4 Sesja 2 close)

W 02-SETTINGS v3.1 (revision) zaktualizować:

**§7 rules_registry (add 3 rows):**
- `cost_method_selector_v1` (owner: 10-FIN, version 1.0, P1)
- `waste_cost_allocator_v1` (owner: 10-FIN, version 1.0, P1)
- `standard_cost_approval_v1` (owner: 10-FIN, version 1.0 stub P1, v2.0 P2)

**§11 D365_Constants:** retained (no change from v3.0 — 10-FIN consumer only).

**§8 reference tables:** retained (no new 10-FIN reference tables — reuse existing cost_centers/currencies/tax_codes/gl_account_mappings as Finance domain tables, not "reference" in the generic sense).

**Changelog entry:**
```markdown
## 02-SETTINGS v3.1 (2026-04-20)
- Added 3 DSL rules from 10-FINANCE v3.0 (cost_method_selector_v1, waste_cost_allocator_v1, standard_cost_approval_v1 stub) → rules registry §7 total 15 rules.
- No schema change to reference tables (§8 retained at 14).
- No change D365_Constants (§11).
```

**Action:** Apply inline revision 02-SETTINGS v3.1 w C4 Sesja 2 close lub defer do C4 Sesja 3 batch revision (11-SHIPPING likely dodaje nowe reference tables — bundle razem). **Rekomendacja: defer bundle** z C4 Sesja 3 delta (01 revision za 2 moduły = oszczędność 1 sesji).

### 16.4 Next steps

- **Phase C4 Sesja 3** — writing 11-SHIPPING + INTEGRATIONS stage 3 (outbound shipment D365 push, dispatch notes, carrier integration P2 stub). Est. 1-2 sesje.
- **Phase C5** — 12-REPORTING + 13-MAINTENANCE + 14-MULTI-SITE + 15-OEE. Est. 3-4 sesje.
- **02-SETTINGS v3.1** — bundle cross-PRD revision po 10+11 (C4 Sesja 3 close).
- **Build start** — po wszystkich writing phase; 10-FINANCE buildable parallel z 09-QUALITY po 08-PROD complete.

---

## §17. References

### Dokumenty źródłowe (primary, wczytywane w Sesja 2)

- [`08-PRODUCTION-PRD.md`](./08-PRODUCTION-PRD.md) v3.0 §12 INTEGRATIONS stage 2 — outbox pattern template (SOURCE OF TRUTH dla stage 5)
- [`03-TECHNICAL-PRD.md`](./03-TECHNICAL-PRD.md) v3.0 §11 cost_per_kg + §7 BOM + §6 items
- [`09-QUALITY-PRD.md`](./09-QUALITY-PRD.md) v3.0 §6 ncr_reports yield_issue + quality_holds
- [`05-WAREHOUSE-PRD.md`](./05-WAREHOUSE-PRD.md) v3.0 §8/§10/§13 LP lifecycle + consume
- [`04-PLANNING-BASIC-PRD.md`](./04-PLANNING-BASIC-PRD.md) v3.1 §8.5 wo_dependencies DAG
- [`02-SETTINGS-PRD.md`](./02-SETTINGS-PRD.md) v3.0 §7 rules + §11 D365_Constants + §8 reference
- [`00-FOUNDATION-PRD.md`](./00-FOUNDATION-PRD.md) v3.0 R14 (UUID v7 idempotency) + R15 (anti-corruption)
- [`_foundation/research/MES-TRENDS-2026.md`](./_foundation/research/MES-TRENDS-2026.md) §9 10-FINANCE R-decisions + §3 regulatory
- [`_foundation/decisions/MONOPILOT-V2-ARCHITECTURE.md`](./_foundation/decisions/MONOPILOT-V2-ARCHITECTURE.md) — 6 principles + 23 decisions

### Baseline przewidziane do archive

- `10-FINANCE-PRD.md` v1.0 (2026-02-18, 663 linii) — **superseded by v3.0**. Retained as git history.

### ADR references

- **ADR-003** Multi-tenancy RLS (`org_id` on all tables)
- **ADR-008** Audit trail strategy (applied w cost_approval_audit, standard_costs signature_hash)
- **ADR-009** Routing costs (setup_cost + working_cost_per_unit + overhead_pct — 08-PROD schema, 10-FIN consumer)
- **ADR-013** RLS Org Isolation Pattern
- **ADR-028** Schema-driven L3 extensions (ext_jsonb pattern)
- **ADR-029** Rule engine DSL + workflow-as-data
- **ADR-030** Configurable depts (L2 variation)
- **ADR-031** Schema variation per org

### Regulatory standards

- **IAS 2** Inventories (FIFO/WAC acceptable)
- **IAS 16** Overhead capitalization
- **BRCGS Issue 10** 7y retention + audit evidence
- **21 CFR Part 11** e-signature SHA-256 + immutability
- **FSMA 204** cost traceability supplement (via 05-WH §11)
- **UK HMRC / Companies Act** GBP base currency, 6y statutory period (covered by 7y BRCGS)

### Implementation artifacts (future)

- Stories 10-a.1 .. 10-e.N — generated during build phase
- UX wireframes FIN-001..008 — created w build phase via frontend-design skill
- OpenAPI spec dla /api/finance/* — generated from Zod schemas
- D365 DMF entity mapping reference — `@monopilot/d365-finance-adapter` package README

---

## §18. Summary metadata

| Field | Value |
|---|---|
| PRD version | 3.1 |
| Status | Final (Phase C4 Sesja 2 + standardization) |
| Lines | ~1450 (Polish headers + English identifiers) |
| Sections | 18 |
| D-decisions | 10 (D-FIN-1..10 — Q1-Q10 consolidated 2026-04-20) |
| P1 tables | 15 + 3 supporting views/audit |
| P2 tables | 5 stubs |
| DSL rules registered | 2 P1 (cost_method_selector_v1, waste_cost_allocator_v1) + 1 stub P2 (standard_cost_approval_v1) |
| Validation rules V-FIN-* | ~29 |
| Desktop screens FIN-* | 21 enumerated (P1: FIN-001..003, 003a, 005, 010, 011, 016, 017, 018, 019, 021 + PRD §8.1 FIN-002b/004/006/008; P2: FIN-004/004b/009/012/013/014/015/020) — ref §8.4 + §8.6 matrix |
| Sub-modules build P1 | 5 (10-a..e) |
| Est. sesji impl P1 | 18-23 |
| Est. sesji impl P2 | 14-20 (11 epics) |
| Consumer contracts | 12 (03-TECH/04-PLAN/05-WH/08-PROD/09-QA/02-SETTINGS/00-FOUNDATION) |
| INTEGRATIONS stage | 5 (D365 F&O daily consolidated journal) |
| Outbox pattern reuse | 08-PROD §12 (stage 2 = stage 5 template) |
| Regulatory | IAS 2, BRCGS Issue 10, 21 CFR Part 11, FSMA 204, UK HMRC |
| Primary currency | GBP (Apex UK per Q9) |
| Multi-currency | P2 EPIC 10-J |

---

## §19. Changelog

### v3.1 (2026-04-30) — Multi-industry manufacturing standardization

**Rationale:** Align 10-FINANCE terminology with 01-NPD v3.2 universal manufacturing operations pattern to support multi-industry food/pharma operations.

**Changes:**
1. **Product code terminology:** FA (Finished Articles, UK-centric) → **FG** (Finished Goods, universal manufacturing)
   - Updated: Executive summary, KPI definitions, widget labels, DDL comments
   - Impact: No schema change; FG is semantic alignment with 01-NPD, 03-TECHNICAL item_type nomenclature

2. **WIP code pattern standardization:**
   - Old pattern: PR-A-001, PR-B-001 (production run per process letter)
   - New pattern: **WIP-MX-0000001, WIP-BK-0000001** (WIP-<2-letter-operation-suffix>-<7-digit-sequence>)
   - Rationale: Suffix comes from `Reference.ManufacturingOperations.process_suffix` (Mix=MX, Bake=BK, Coat=CT, etc), tenant-configurable
   - Impact: No current schema change (WIP codes live in 01-NPD inventory model); examples & validation rules updated

3. **Labor cost allocation naming:**
   - Old: Process_A, Process_B, Process_C, Process_D
   - New: **Manufacturing_Operation_1..4** keyed by operation_name (Mix, Bake, Coat, Synthesis, etc)
   - Table FK rename: `operation_id` → `manufacturing_operation_id` (10-FIN §6.3, row 9)
   - Handler update: `handle_labor_recorded` now explicitly keys by manufacturing_operation_id from 01-NPD Reference.ManufacturingOperations
   - Impact: Cross-reference 01-NPD v3.2 §4.5 for operation config; labor cost examples now show "Labor cost for Mix (MX): $10/unit"

4. **Validation rule updates:**
   - V-FIN-WO-07 now includes product code format validation (FG-* for finished goods, WIP-<suffix>-<seq> for work-in-progress)
   - No new rules added; existing V-FIN-* rules updated with universalized examples

5. **Version metadata:**
   - Lines: ~1450 (stable, same doc size)
   - Updated cross-references: 01-NPD v3.2, 08-PRODUCTION (operations), 03-TECHNICAL (finished_good item_type)
   - Sections: 19 (added Changelog §19)

**Verification checklist:**
- ✅ All FA references → FG (3 occurrences updated)
- ✅ PR (production run) terminology → WIP (implicit in examples; no hardcoded PR codes found)
- ✅ Process_A/B/C/D → Manufacturing_Operation_1..4 (table FK updated)
- ✅ Labor cost examples reference operation names (Mix/Bake/etc)
- ✅ WIP code format documented as WIP-<suffix>-<seq> pattern
- ✅ Validation rules include product code format checks
- ✅ No orphaned old codes remaining
- ✅ Version bumped + changelog added

**Breaking changes:** None (terminology alignment; backward compat via item_type='finished_good' in schema).

**Backward compatibility:** Standard migration note—orgs using old FA terminology should use 01-NPD product master refresh (01-a.4 Product Master Migration story) to sync.

---

_PRD 10-FINANCE v3.0 — Phase C4 Sesja 2 deliverable, 2026-04-20. Superseded v1.0 (2026-02-18). Author: Claude Opus 4.7 + Mariusz Krawczyk. Next: Phase C4 Sesja 3 (11-SHIPPING + INTEGRATIONS stage 3)._

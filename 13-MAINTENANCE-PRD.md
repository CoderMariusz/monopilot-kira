---
module: 13-MAINTENANCE
version: v3.1
date: 2026-04-30
phase: D (Phase C5 Sesja 2) + Manufacturing Operations standardization
status: PRD v3.1 multi-industry manufacturing operations compliant
previous: v3.0 (2026-04-20, Phase D baseline)
owner: Monopilot architecture
consumers:
  - 15-OEE (oee_shift_metrics MTBF/MTTR producer, oee_maintenance_trigger_v1 rule)
  - 09-QUALITY (lab_results.equipment_id FK stub consumer, HACCP CCP verification)
  - 08-PRODUCTION (downtime_events producer, allergen_changeover_gate_v1)
  - 06-SCANNER (SCN-090 Maintenance tab P2)
  - 12-REPORTING (dashboards catalog entries MNT-001..MNT-008)
  - 02-SETTINGS (rules registry §7.8, ref tables §8.1)
---

# 13-MAINTENANCE — Monopilot MES PRD v3.1

## 1. Executive Summary

Modul 13-MAINTENANCE dostarcza Computerized Maintenance Management System (CMMS) zintegrowany z MES, OEE i Quality dla SMB food manufacturing. **Differentiator**: jedyna platforma SMB lacząca MES + CMMS + OEE + Quality w jednym schema-driven, multi-tenant systemie (vs Fiix/Hippo/Maintenance Pro — pure-play CMMS $50-500/user/mo).

**Problem**: Apex dzis prowadzi maintenance w Excel + papier — reaktywne, brak preventive, brak calibration audit trail (BRCGS Issue 10 risk), brak linkage downtime → MWO, brak MTBF/MTTR metrics.

**Rozwiazanie**: Pelny CMMS lifecycle (calibration + PM + MWO + spare parts + sanitation + TPM) jako consumer 15-OEE metryk (MTBF/MTTR), producer 09-QA calibration evidence, auto-trigger z 08-PROD downtime, scan-enabled via 06-SCN. Schema-driven per ADR-028 (L3 ext cols), rules via DSL (ADR-029), multi-tenant L2 variations (ADR-030/031).

**Primary ambition v3.0** (vs baseline v1.0):
1. Full Phase D convention (19 sekcji, markers, D-MNT decisions extended, cross-PRD hooks)
2. `site_id UUID NULL` na 14 tabelach od day 1 (nie retrofit per REC-L1)
3. Outbox event pattern compliance (MWO state, spare parts txns, calibration results)
4. `oee_maintenance_trigger_v1` P2 rule consumer — auto-PM MWO z 15-OEE availability breach 3-day
5. Calibration ↔ 09-QA bridge: `calibration_instruments.id` = 09-QA `lab_results.equipment_id` FK target
6. Allergen-aware sanitation PM linked 08-PROD `allergen_changeover_gate_v1`
7. L2 tenant config: `maintenance_alert_thresholds` ref table per-org overrides
8. Work Request = unified MWO lifecycle (state `requested` → `approved` → `open` → ...) per Q6

**Phase**: C5 Sesja 2 writing. Build sequence: post-12-REPORTING impl, pre-14-MULTI-SITE impl.

---

## 2. Markers Legend [UNIVERSAL]

- **[UNIVERSAL]** — applies all tenants (ADR-028 L1 core)
- **[APEX-CONFIG]** — Apex-specific baseline value (overridable L2 per ADR-031)
- **[EVOLVING]** — implementation maturity growing (P2/P3 roadmap)
- **[LEGACY-D365]** — bridge feature, retires when Monopilot replaces D365

Per 00-FOUNDATION §2. Applied per-decision, per-field, per-dashboard in sections below.

---

## 3. Objectives & Success Metrics

### 3.1 Cel glowny

Redukcja nieplanowanych przestojow 20-30% poprzez preventive maintenance + auto-trigger z OEE + full lifecycle CMMS — bez zlozonosci enterprise tools (Maximo, Infor).

### 3.2 Cele szczegolowe

1. **Prevention [UNIVERSAL]** — harmonogramy PM (calendar-based P1 per Q2A + usage-based P2 + condition-based P3) z alert 30d/7d/overdue. PM schedules scoped by manufacturing operation (e.g., "preventive maintenance for Mix (MX) operation") per 02-SETTINGS §8.9
2. **Work Order lifecycle [UNIVERSAL]** — unified MWO state machine `requested → approved → open → in_progress → completed` (+ cancelled) per Q6B
3. **Spare parts [UNIVERSAL]** — katalog separate vs 03-TECH products (Q3A D-MNT-6 retained), qty_on_hand + reorder_point + consumption tracking, shelf_life attributes
4. **Calibration [UNIVERSAL]** — scale/thermometer/pH-meter food-industry, ISO 9001/NIST/internal (D-MNT-5), PASS/FAIL/OUT_OF_SPEC results, 09-QA FK integration bridge
5. **Sanitation [UNIVERSAL]** — CIP checklist temp/concentration/time/flow_rate + allergen_change_flag consumer 08-PROD gate. Changeover sanitation coordinated between manufacturing operations (e.g., "Changeover sanitation for Mix (MX) and Bake (BK)" per 02-SETTINGS §8.9 operation sequencing)
6. **OEE Integration consumer [UNIVERSAL]** — read-only MTBF/MTTR from `oee_shift_metrics`, P2 auto-trigger via `oee_maintenance_trigger_v1`
7. **TPM basic [UNIVERSAL]** — reactive + preventive + calibration + sanitation P1 (Q4A), 5S/autonomous/predictive → P2/P3

### 3.3 Metryki sukcesu

| Metryka | Cel P1 | Zrodlo | Marker |
|---|---|---|---|
| MTBF wzrost vs baseline | ≥ +10% YoY | `oee_shift_metrics.mtbf_hours` | [UNIVERSAL] |
| MTTR srednia | < 60 min | `maintenance_work_orders.actual_duration_min` | [UNIVERSAL] |
| PM schedule adherence | > 85% | completed_on_time / scheduled | [UNIVERSAL] |
| Planned vs unplanned ratio | > 70% planned | `maintenance_work_orders.source` | [UNIVERSAL] |
| Spare parts stockout rate | < 5% | `spare_parts_stock.qty_on_hand` < reorder_point events | [UNIVERSAL] |
| Calibration zero-overdue | 100% | `calibration_records.next_due_date` < today | [UNIVERSAL] |
| CIP sanitation adherence | 100% | `sanitation_checklists.completed_at` per schedule | [UNIVERSAL] |
| MWO avg time-to-complete | < 4h | `maintenance_work_orders` duration | [UNIVERSAL] |
| Auto-MWO from downtime rate | > 50% of downtime events | M06 checkbox → MWO creation | [UNIVERSAL] |

---

## 4. Personas & RBAC

| Persona | Rola RLS | Akcje kluczowe | Scope |
|---|---|---|---|
| **Operator produkcji** | `operator` | Zgloszenie awarii z hali (M06 checkbox "Create maintenance task") → MWO state `requested` | Own WO + linked machine |
| **Technik utrzymania** | `maintenance_technician` | MWO execute (in_progress → completed), parts consume, calibration record | Assigned MWOs + shared read |
| **Kierownik utrzymania** | `maintenance_manager` | PM schedule CRUD, MWO approve (requested → approved), technician assignment, dashboards, costs | All site MWOs |
| **Kierownik produkcji** | `production_manager` | Read status maszyn, "Next PM Due", zatwierdzanie MWO impactujacych line | Site-scoped read |
| **Kierownik jakosci** | `quality_manager` | Calibration evidence review, HACCP CCP verification trail, NCR linkage | Calibration + linked QA |
| **Administrator** | `admin` | Ustawienia maintenance_alert_thresholds, technician_profiles, reference tables | Cross-module admin |

**RLS pattern** (D-MNT-8 retained + enhanced):
```sql
USING (
  org_id = current_org_id()
  AND (site_id IS NULL OR site_id IN (
    SELECT site_id FROM site_user_access WHERE user_id = auth.uid()
  ))
)
```

---

## 5. Regulatory & Compliance [UNIVERSAL]

### 5.1 BRCGS Issue 10 (food safety)
- **Calibration evidence** required (scales, thermometers, pH-meters) — `calibration_records` 7-year retention (`retention_until` NOT NULL GENERATED)
- **CIP sanitation records** — `sanitation_checklists` with temp/concentration/time/flow_rate + dual sign-off for allergen changes
- **Maintenance history traceability** — 7-year per equipment (`maintenance_history` archive nightly cold storage)

### 5.2 FSMA 204 (traceability)
- Equipment calibration linked to lab_results (09-QA) → CCP verification trail (HACCP audit)
- Recall: if faulty equipment affected product batches → query `calibration_records` where failed_at BETWEEN start AND end, join with `production_runs`

### 5.3 21 CFR Part 11 (electronic signatures)
- **Calibration certificate approval** (P2 extension): SHA-256 hash + signer_user_id + PIN re-verification + immutability trigger
- **Sanitation dual sign-off** (allergen changes): technician + QA signer, PIN re-verify per 06-SCN §8.5

### 5.4 EU OSHA / RIDDOR (safety)
- **Lockout/Tagout (LOTO)** pre-MWO execution P1 basic checklist, P2 full permit system
- **Incident linkage** — MWO may reference quality_incidents (09-QA) if root cause involves equipment failure

### 5.5 GDPR
- Technician PII (certifications, licenses) — `technician_profiles` with anonymize toggle on user delete (D-MNT-8 RLS + retention policy)

---

## 6. Architecture & Data Flow

### 6.1 Module position (00-FOUNDATION §4)
- **M13** = 13-MAINTENANCE, build order #13 (post-12-REPORTING, pre-14-MULTI-SITE)
- **Dependencies**: 02-SET (ref tables, rules registry, Reference.ManufacturingOperations §8.9), 08-PROD (downtime_events, allergen_changeover_gate_v1, production_lines), 15-OEE (oee_shift_metrics MTBF/MTTR)
- **Consumers downstream**: 09-QA (calibration FK, lab_results equipment_id bridge), 12-REPORTING (MNT dashboards), 06-SCN (SCN-090 P2)

### 6.2 Data flow diagram (text)

```
[08-PROD downtime_events] ---(M06 checkbox)--> [M13 MWO state='requested']
                                                       |
                                                       v
[M13 MWO state='approved' by maintenance_manager] --> [assigned to technician]
                                                       |
                                                       v
[M13 MWO state='in_progress'] ---(scan parts)---> [spare_parts.consumed] 
                                                       |
                                                       v
[M13 MWO state='completed'] ---(outbox)---> [mwo.completed event]
                                                       |
                                                       +--> [15-OEE MTBF/MTTR recalc via oee_shift_metrics refresh]
                                                       +--> [12-REPORTING dashboards cache invalidate]

[15-OEE oee_daily_summary.availability_pct < 80%] ---(3 consecutive days, P2)---> [oee_maintenance_trigger_v1 rule]
                                                                                       |
                                                                                       v
                                                                              [M13 auto-create PM MWO, priority=high]

[M13 calibration_records.result='FAIL'] ---(outbox)---> [calibration.failed event]
                                                              |
                                                              +--> [09-QA lab_results hold candidate]
                                                              +--> [12-REPORTING Calibration Health dashboard]

[M13 sanitation_checklists allergen_change=true] ---(consumer)---> [08-PROD allergen_changeover_gate_v1 validation]
```

### 6.3 REC-L1 site_id activation [UNIVERSAL]

Wszystkie 14 tabel M13 maja `site_id UUID NULL` od day 1 creation (nie retrofit). Migration: `UPDATE table SET site_id = (SELECT id FROM sites WHERE org_id = :org AND is_default=true)` post-14-MULTI-SITE activation.

### 6.4 Schema-driven extensibility (ADR-028)
- L1 core cols fixed (this PRD §9 schemas)
- L2 tenant config: `maintenance_alert_thresholds` per tenant overrides (PM interval defaults, alert thresholds)
- L3 ext cols via `tenant_schema_extensions.l3_ext_cols JSONB` dla spare_parts (np. supplier_preferred UUID tenant-specific), MWO (custom priority scheme)
- L4 user-level: czas trwania MWO jako preferencja operatora (notyfikacje email on/off)

---

## 7. D-decisions Registry

### 7.1 Retained from baseline v1.0 (D-MNT-1..8)

| ID | Decyzja | Marker |
|---|---|---|
| **D-MNT-1** | MWO state machine 4-state → **v3.0 EXTENDED do 6-state** (requested/approved/open/in_progress/completed/cancelled per Q6B unified WR+WO) | [UNIVERSAL] |
| **D-MNT-2** | System promotes preventive (>70% planned target), supports reactive. KPI tracking via `operator_kpis` + new `maintenance_kpis` materialized view | [UNIVERSAL] |
| **D-MNT-3** | M13 READ MTBF/MTTR from 15-OEE `oee_shift_metrics` (read-only, zero duplicate). See §9.2 consumer spec | [UNIVERSAL] |
| **D-MNT-4** | Downtime → auto-MWO: M06 checkbox "Create maintenance task" populates machine/reason/priority. MWO.source='auto_downtime' | [UNIVERSAL] |
| **D-MNT-5** | Calibration food-industry types (scale/thermometer/pH-meter), standards (ISO 9001/NIST/internal), results PASS/FAIL/OUT_OF_SPEC, alerts 30d/7d/overdue | [UNIVERSAL] |
| **D-MNT-6** | Spare parts = separate catalog vs 03-TECH `items` (different RLS: maintenance_team vs production). Own lifecycle, shelf_life attributes | [UNIVERSAL] |
| **D-MNT-7** | Sanitation PM = `maintenance_schedules.schedule_type='sanitation'` + CIP checklist (temp/conc/time/flow) + allergen_change_flag consumer 08-PROD | [UNIVERSAL] |
| **D-MNT-8** | RLS org_id NOT NULL + site_id NULLABLE from day 1 (REC-L1). Roles: maintenance_manager/technician/production_manager/operator escalating perms | [UNIVERSAL] |

### 7.2 New Phase D decisions (D-MNT-9..16)

| ID | Decyzja | Marker |
|---|---|---|
| **D-MNT-9** | **Work Request unified with MWO** (Q6B). Single `maintenance_work_orders` table, state `requested` (operator submit) → `approved` (manager) → `open` (assigned) → `in_progress` → `completed`/`cancelled`. Rationale: prostszy schema, mniej joinow, consistency z 05-WH TO pattern | [UNIVERSAL] |
| **D-MNT-10** | **Calibration FK bridge to 09-QA** — `calibration_instruments.id` = target dla 09-QA `lab_results.equipment_id` stub. FK added via 09-QA v3.1 bundled delta (future). HACCP CCP verification trail: P2 09-QA CCP monitoring records `equipment_calibration_id` column | [UNIVERSAL] |
| **D-MNT-11** | **OEE auto-trigger P2** — `oee_maintenance_trigger_v1` rule (registered 02-SET §7.8 by 15-OEE, consumed by M13). Threshold: availability_pct < 80% FOR 3 consecutive days per line. Dedupe: `{line_id, 7-day window}` (block duplicate PM MWO same line). Enables on feature flag `maintenance_triggers_enabled` per tenant | [UNIVERSAL] + [EVOLVING] |
| **D-MNT-12** | **Outbox event pattern** — 8 events emitted: `mwo.requested`, `mwo.approved`, `mwo.in_progress`, `mwo.completed`, `mwo.cancelled`, `spare_parts.consumed`, `calibration.recorded`, `sanitation.completed`. Payload zawsze {org_id, site_id, ...context} | [UNIVERSAL] |
| **D-MNT-13** | **Multi-tenant L2 config** via `maintenance_alert_thresholds` reference table (02-SET §8.1). Columns: tenant_id, pm_interval_default_days, calibration_warning_days (30/14/7), mtbf_target_threshold_pct, availability_breach_threshold_pct (80% default). Admin UI CRUD | [UNIVERSAL] |
| **D-MNT-14** | **Allergen-aware sanitation** — `sanitation_checklists.allergen_change_flag=true` → emit outbox `sanitation.allergen_change.completed` event consumed by 08-PROD `allergen_changeover_gate_v1` rule (BRCGS dual sign-off ATP test + QA verification) | [UNIVERSAL] |
| **D-MNT-15** | **LOTO basic P1** — `mwo_loto_checklists` table (energy sources isolated, tags applied, verified). P1 paper-based electronic checklist, P2 full permit system. Pre-condition dla MWO state `in_progress` na equipment flagged `requires_loto=true` | [UNIVERSAL] |
| **D-MNT-16** | **IoT sensor integration deferred P2** (Q5). P1 manual data entry only. P2 Modbus TCP / OPC UA adapters (Apex hardware consultation required). P3 full vision/vibration/thermal via edge ML. Stub: `equipment_sensors` table schema reserved | [EVOLVING] |

---

## 8. DSL Rules & Workflow-as-Data [UNIVERSAL]

### 8.1 Rules registered via 02-SET §7.8

| Rule ID | Owner | Status | Type | Purpose |
|---|---|---|---|---|
| `oee_maintenance_trigger_v1` | 15-OEE (author) → 13-MAINT (consumer) | **P2 stub** | gate+workflow | Auto-create PM MWO when availability breach 3-day |
| `mwo_state_machine_v1` | 13-MAINT | **P1 active** | workflow-as-data | 6-state lifecycle (requested/approved/open/in_progress/completed/cancelled) transitions + guards |
| `pm_schedule_due_engine_v1` | 13-MAINT | **P1 active** | cascading | Daily pg_cron: scan `maintenance_schedules` → generate MWO w stanie `open` when next_due_date ≤ today + warning_days |
| `calibration_expiry_alert_v1` | 13-MAINT | **P1 active** | cascading | Daily pg_cron: scan `calibration_records.next_due_date`, emit alerts 30d/7d/overdue (via Resend integration per 02-SET §13) |
| `spare_parts_reorder_alert_v1` | 13-MAINT | **P1 active** | gate | When `spare_parts_stock.qty_on_hand <= reorder_point` → emit alert + create purchase request draft (P2 D365 push) |
| `sanitation_allergen_gate_v1` | 13-MAINT | **P1 active** | gate | Before `in_progress` on sanitation MWO with allergen_change_flag → require dual sign-off (technician + QA) + ATP test record |
| `loto_pre_execution_gate_v1` | 13-MAINT | **P1 active** | gate | Before `in_progress` on MWO for equipment.requires_loto=true → require `mwo_loto_checklists.verified_at` NOT NULL |

### 8.2 `mwo_state_machine_v1` definition (P1 active)

```yaml
rule_id: mwo_state_machine_v1
rule_type: workflow_as_data
active: true
status: P1_active
states:
  - name: requested
    allowed_from: []
    allowed_to: [approved, cancelled]
    guards:
      - requester_user_id NOT NULL
      - reason_text NOT NULL
  - name: approved
    allowed_from: [requested]
    allowed_to: [open, cancelled]
    guards:
      - approver_user_id HAS_ROLE('maintenance_manager')
      - approver_user_id != requester_user_id  # segregation of duties
  - name: open
    allowed_from: [approved]  # or directly from PM schedule (system-created, requested-implicit)
    allowed_to: [in_progress, cancelled]
    guards:
      - assigned_to_user_id NOT NULL
  - name: in_progress
    allowed_from: [open]
    allowed_to: [completed, cancelled]
    guards:
      - started_at NOT NULL
      - IF equipment.requires_loto THEN mwo_loto_checklists.verified_at NOT NULL
      - IF mwo.type='sanitation' AND allergen_change_flag THEN qa_dual_signoff_id NOT NULL
  - name: completed
    allowed_from: [in_progress]
    allowed_to: []  # terminal
    guards:
      - actual_duration_min NOT NULL
      - completion_notes NOT NULL
  - name: cancelled
    allowed_from: [requested, approved, open, in_progress]
    allowed_to: []  # terminal
    guards:
      - cancellation_reason NOT NULL
emits:
  - on_enter: mwo.{state}
```

---

## 9. Schema (DB tables) — 14 P1 tables

### 9.1 `maintenance_settings` [UNIVERSAL]
```sql
CREATE TABLE maintenance_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  site_id UUID NULL,  -- REC-L1
  pm_interval_default_days INT NOT NULL DEFAULT 30,
  calibration_warning_days INT NOT NULL DEFAULT 30,
  calibration_urgent_days INT NOT NULL DEFAULT 7,
  mtbf_target_hours INT,
  availability_breach_threshold_pct NUMERIC(5,2) DEFAULT 80.00,
  requires_loto_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, site_id)
);
CREATE INDEX idx_maintenance_settings_org_site ON maintenance_settings(org_id, site_id);
```

### 9.2 `technician_profiles` [UNIVERSAL]
```sql
CREATE TABLE technician_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  site_id UUID NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  skill_level TEXT NOT NULL CHECK (skill_level IN ('basic','advanced','specialist')),  -- ref: technician_skills
  certifications JSONB DEFAULT '[]',  -- [{name, issuer, expiry_date}]
  hourly_rate NUMERIC(10,2),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, user_id)
);
```

### 9.3 `equipment` [UNIVERSAL]
```sql
CREATE TABLE equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  site_id UUID NULL,
  equipment_code TEXT NOT NULL,
  name TEXT NOT NULL,
  equipment_type TEXT NOT NULL,  -- mixer, oven, packer, scale, thermometer, ph_meter, cip_unit
  parent_line_id UUID,  -- 08-PROD production_lines
  assigned_operation_id UUID,  -- Optional FK to 02-SETTINGS manufacturing_operations for operation-specific maintenance
  requires_loto BOOLEAN DEFAULT false,
  requires_calibration BOOLEAN DEFAULT false,
  calibration_interval_days INT,
  l3_ext_cols JSONB DEFAULT '{}',  -- ADR-028 L3 tenant extension; may include manufacturing operation context (e.g., operation_name, process_suffix)
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, equipment_code)
);
CREATE INDEX idx_equipment_org_site ON equipment(org_id, site_id);
CREATE INDEX idx_equipment_line ON equipment(parent_line_id);
CREATE INDEX idx_equipment_operation ON equipment(assigned_operation_id);  -- New: support operation-scoped maintenance
```

### 9.4 `maintenance_schedules` [UNIVERSAL]
```sql
CREATE TABLE maintenance_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  site_id UUID NULL,
  equipment_id UUID NOT NULL REFERENCES equipment(id),
  operation_context JSONB,  -- Optional context for operation-scoped maintenance (e.g., {operation_name: "Mix", process_suffix: "MX", operation_id: UUID} from 02-SETTINGS manufacturing_operations §8.9)
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('preventive','calibration','sanitation','inspection')),
  interval_basis TEXT NOT NULL CHECK (interval_basis IN ('calendar_days','usage_hours','usage_cycles')),
  interval_value INT NOT NULL,
  warning_days INT DEFAULT 7,
  next_due_date DATE,
  last_completed_at TIMESTAMPTZ,
  assigned_technician_id UUID REFERENCES technician_profiles(id),
  checklist_template_id UUID,  -- optional link to mwo_checklist_templates
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_schedules_next_due ON maintenance_schedules(next_due_date) WHERE active;
CREATE INDEX idx_schedules_operation ON maintenance_schedules USING GIN(operation_context) WHERE operation_context IS NOT NULL;  -- New: support operation-scoped maintenance queries
```

### 9.5 `maintenance_work_orders` [UNIVERSAL] — CORE TABLE
```sql
CREATE TABLE maintenance_work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  site_id UUID NULL,
  mwo_number TEXT NOT NULL,  -- MWO-YYYY-NNNNN
  state TEXT NOT NULL CHECK (state IN ('requested','approved','open','in_progress','completed','cancelled')),
  source TEXT NOT NULL CHECK (source IN ('manual_request','auto_downtime','pm_schedule','oee_trigger','calibration_alert')),
  type TEXT NOT NULL CHECK (type IN ('reactive','preventive','calibration','sanitation','inspection')),
  priority TEXT NOT NULL CHECK (priority IN ('low','medium','high','critical')),
  equipment_id UUID REFERENCES equipment(id),
  schedule_id UUID REFERENCES maintenance_schedules(id),
  downtime_event_id UUID,  -- 08-PROD downtime_events FK
  requester_user_id UUID,
  requester_reason TEXT,
  approver_user_id UUID,
  assigned_to_user_id UUID REFERENCES technician_profiles(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  actual_duration_min INT,
  completion_notes TEXT,
  cancellation_reason TEXT,
  estimated_cost NUMERIC(10,2),
  actual_cost NUMERIC(10,2),  -- materialized from parts + labor
  l3_ext_cols JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, mwo_number)
);
CREATE INDEX idx_mwo_state ON maintenance_work_orders(state);
CREATE INDEX idx_mwo_equipment ON maintenance_work_orders(equipment_id);
CREATE INDEX idx_mwo_assigned ON maintenance_work_orders(assigned_to_user_id);
CREATE INDEX idx_mwo_source ON maintenance_work_orders(source);
CREATE INDEX idx_mwo_org_site ON maintenance_work_orders(org_id, site_id);
```

### 9.6 `mwo_checklists` [UNIVERSAL]
```sql
CREATE TABLE mwo_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mwo_id UUID NOT NULL REFERENCES maintenance_work_orders(id),
  step_no INT NOT NULL,
  step_description TEXT NOT NULL,
  step_type TEXT CHECK (step_type IN ('check','measure','photo','signoff')),
  expected_value TEXT,
  actual_value TEXT,
  passed BOOLEAN,
  completed_by UUID,
  completed_at TIMESTAMPTZ,
  UNIQUE(mwo_id, step_no)
);
```

### 9.7 `mwo_loto_checklists` [UNIVERSAL] — D-MNT-15
```sql
CREATE TABLE mwo_loto_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mwo_id UUID NOT NULL REFERENCES maintenance_work_orders(id),
  energy_sources_isolated JSONB NOT NULL DEFAULT '[]',  -- [{source, method, verified_by}]
  tags_applied JSONB NOT NULL DEFAULT '[]',
  zero_energy_verified_by UUID,
  verified_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  released_by UUID
);
```

### 9.8 `spare_parts` [UNIVERSAL] — D-MNT-6
```sql
CREATE TABLE spare_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  part_code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,  -- ref: spare_parts_categories (02-SET §8.1 if added v3.3)
  supplier_id UUID,  -- 03-TECH suppliers (shared master data)
  unit_cost NUMERIC(10,2),
  unit_of_measure TEXT DEFAULT 'ea',
  shelf_life_days INT,  -- if applicable (e.g., lubricants, seals)
  critical_part BOOLEAN DEFAULT false,  -- impacts MTBF critical path
  l3_ext_cols JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  UNIQUE(org_id, part_code)
);
```

### 9.9 `spare_parts_stock` [UNIVERSAL]
```sql
CREATE TABLE spare_parts_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  site_id UUID NULL,  -- per-site inventory
  part_id UUID NOT NULL REFERENCES spare_parts(id),
  warehouse_id UUID,  -- 05-WH warehouses
  location_code TEXT,
  qty_on_hand NUMERIC(12,3) NOT NULL DEFAULT 0,
  reorder_point NUMERIC(12,3) DEFAULT 0,
  reorder_qty NUMERIC(12,3) DEFAULT 0,
  last_counted_at TIMESTAMPTZ,
  UNIQUE(org_id, site_id, part_id, warehouse_id)
);
CREATE INDEX idx_sp_stock_reorder ON spare_parts_stock(org_id, site_id) WHERE qty_on_hand <= reorder_point;
```

### 9.10 `spare_parts_transactions` [UNIVERSAL]
```sql
CREATE TABLE spare_parts_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- UUID v7 idempotency (R14)
  org_id UUID NOT NULL,
  site_id UUID NULL,
  part_id UUID NOT NULL REFERENCES spare_parts(id),
  txn_type TEXT NOT NULL CHECK (txn_type IN ('receipt','consume','adjust','transfer_out','transfer_in','return')),
  qty NUMERIC(12,3) NOT NULL,
  mwo_id UUID REFERENCES maintenance_work_orders(id),  -- if consume
  performed_by UUID,
  performed_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT
);
CREATE INDEX idx_sp_txn_mwo ON spare_parts_transactions(mwo_id) WHERE mwo_id IS NOT NULL;
CREATE INDEX idx_sp_txn_part_date ON spare_parts_transactions(part_id, performed_at);
```

### 9.11 `mwo_spare_parts` [UNIVERSAL] — join
```sql
CREATE TABLE mwo_spare_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mwo_id UUID NOT NULL REFERENCES maintenance_work_orders(id),
  part_id UUID NOT NULL REFERENCES spare_parts(id),
  qty_planned NUMERIC(12,3),
  qty_actual NUMERIC(12,3),
  unit_cost_snapshot NUMERIC(10,2),
  UNIQUE(mwo_id, part_id)
);
```

### 9.12 `calibration_instruments` [UNIVERSAL] — D-MNT-5 + D-MNT-10 FK target for 09-QA
```sql
CREATE TABLE calibration_instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  site_id UUID NULL,
  equipment_id UUID REFERENCES equipment(id),  -- optional link to equipment table
  instrument_code TEXT NOT NULL,
  instrument_type TEXT NOT NULL CHECK (instrument_type IN ('scale','thermometer','ph_meter','other')),
  standard TEXT NOT NULL CHECK (standard IN ('ISO_9001','NIST','internal','other')),
  range_min NUMERIC(12,4),
  range_max NUMERIC(12,4),
  unit_of_measure TEXT,
  calibration_interval_days INT NOT NULL,
  l3_ext_cols JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  UNIQUE(org_id, instrument_code)
);
CREATE INDEX idx_cal_instr_org_site ON calibration_instruments(org_id, site_id);
-- Forward compat: 09-QA v3.1 FK target: lab_results.equipment_id = calibration_instruments.id (documented, not enforced yet)
```

### 9.13 `calibration_records` [UNIVERSAL]
```sql
CREATE TABLE calibration_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  instrument_id UUID NOT NULL REFERENCES calibration_instruments(id),
  mwo_id UUID REFERENCES maintenance_work_orders(id),
  calibrated_at TIMESTAMPTZ NOT NULL,
  calibrated_by UUID,
  standard_applied TEXT NOT NULL,
  test_points JSONB DEFAULT '[]',  -- [{reference, measured, tolerance_pct}]
  result TEXT NOT NULL CHECK (result IN ('PASS','FAIL','OUT_OF_SPEC')),
  certificate_file_url TEXT,
  certificate_sha256 TEXT,  -- 21 CFR Part 11 e-sig (P2)
  next_due_date DATE NOT NULL,
  retention_until DATE GENERATED ALWAYS AS (next_due_date + INTERVAL '7 years') STORED,  -- BRCGS
  notes TEXT
);
CREATE INDEX idx_cal_rec_instrument_date ON calibration_records(instrument_id, calibrated_at DESC);
CREATE INDEX idx_cal_rec_next_due ON calibration_records(next_due_date);
```

### 9.14 `sanitation_checklists` [UNIVERSAL] — D-MNT-7 + D-MNT-14
```sql
CREATE TABLE sanitation_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  site_id UUID NULL,
  mwo_id UUID NOT NULL REFERENCES maintenance_work_orders(id),
  line_id UUID,  -- 08-PROD production_lines
  cip_program TEXT,  -- pre_rinse, caustic_wash, acid_wash, sanitize, final_rinse
  temp_c NUMERIC(5,2),
  concentration_pct NUMERIC(5,2),
  duration_min INT,
  flow_rate_l_per_min NUMERIC(8,2),
  allergen_change_flag BOOLEAN DEFAULT false,
  allergens_removed JSONB DEFAULT '[]',  -- from 02-SET §8.1 allergens ref
  atp_test_result_rlu INT,  -- Relative Light Units (consumer 09-QA Q2)
  first_signed_by UUID,
  second_signed_by UUID,  -- QA dual sign-off for allergen_change
  completed_at TIMESTAMPTZ,
  retention_until DATE GENERATED ALWAYS AS ((completed_at::date + INTERVAL '7 years')) STORED  -- BRCGS
);
```

### 9.15 `maintenance_history` [UNIVERSAL] — denormalized audit trail
```sql
CREATE TABLE maintenance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  site_id UUID NULL,
  equipment_id UUID NOT NULL REFERENCES equipment(id),
  mwo_id UUID REFERENCES maintenance_work_orders(id),
  event_type TEXT NOT NULL,  -- completion, cancellation, calibration, sanitation, breakdown
  event_date TIMESTAMPTZ NOT NULL,
  summary TEXT NOT NULL,
  cost NUMERIC(10,2),
  technician_id UUID,
  duration_min INT,
  retention_until DATE GENERATED ALWAYS AS ((event_date::date + INTERVAL '7 years')) STORED
);
CREATE INDEX idx_hist_equipment_date ON maintenance_history(equipment_id, event_date DESC);
-- Archive nightly cold storage post 7y
```

### 9.16 `maintenance_kpis` (materialized view) [UNIVERSAL]
```sql
CREATE MATERIALIZED VIEW maintenance_kpis AS
SELECT
  org_id, site_id, equipment_id,
  DATE_TRUNC('month', created_at) AS month,
  COUNT(*) FILTER (WHERE type='preventive') AS preventive_count,
  COUNT(*) FILTER (WHERE type='reactive') AS reactive_count,
  COUNT(*) FILTER (WHERE state='completed' AND completed_at::date <= (schedule_id IS NOT NULL AND <scheduled_date>::date)) AS pm_on_time_count,  -- simplified
  COUNT(*) FILTER (WHERE source='auto_downtime') AS auto_downtime_count,
  AVG(actual_duration_min) AS avg_mttr_min,
  SUM(actual_cost) AS total_cost
FROM maintenance_work_orders
WHERE state IN ('completed','cancelled')
GROUP BY org_id, site_id, equipment_id, DATE_TRUNC('month', created_at);
-- Refresh: pg_cron daily 02:30
```

### 9.17 Consumer: `oee_shift_metrics` (read-only from 15-OEE)
Columns used: `mtbf_hours`, `mttr_minutes`, `downtime_event_count`, `availability_pct`. Consumed in dashboards (§10) + `oee_maintenance_trigger_v1` rule.

---

## 10. Dashboards (P1 + P2)

### 10.1 P1 dashboards (6 core)

| # | Dashboard | Cel | Data source |
|---|---|---|---|
| **MNT-001** | **MWO Worklist (Technician view)** | My assigned MWOs + status + priority filter | `maintenance_work_orders` WHERE assigned_to_user_id=me AND state IN (open,in_progress) |
| **MNT-002** | **PM Schedule Calendar** | Next 30 days PM due | `maintenance_schedules` next_due_date |
| **MNT-003** | **Calibration Health** | Instruments overdue / due-soon (30/7d) | `calibration_instruments` + latest `calibration_records` next_due_date |
| **MNT-004** | **Spare Parts Stock Status** | qty_on_hand vs reorder_point, critical parts alerts | `spare_parts_stock` + parts metadata |
| **MNT-005** | **Equipment Health (MTBF/MTTR)** | Per-equipment trend 90d from 15-OEE | `oee_shift_metrics` filtered by equipment_id/line_id |
| **MNT-006** | **Maintenance Manager Overview** | Planned vs unplanned %, cost YTD, technician utilization | `maintenance_kpis` MV + `technician_profiles` |

### 10.2 P2 dashboards (8 extended)

| # | Dashboard | Marker |
|---|---|---|
| MNT-007 | Predictive Maintenance Insights (ML availability trends) | [EVOLVING] |
| MNT-008 | IoT Sensor Health (Modbus/OPC UA status) | [EVOLVING] |
| MNT-009 | Cross-site Maintenance Benchmark (14-MULTI consumer) | [UNIVERSAL] |
| MNT-010 | Sanitation Allergen Audit | [UNIVERSAL] |
| MNT-011 | Maintenance Budget vs Actual | [UNIVERSAL] |
| MNT-012 | Supplier Part Performance (spare parts quality) | [UNIVERSAL] |
| MNT-013 | TPM 5S Score (autonomous maintenance) | [EVOLVING] |
| MNT-014 | LOTO Compliance Audit | [UNIVERSAL] |

Dashboards rejestrowane w 12-REPORTING `dashboards_catalog` (02-SET §8.1 metadata-driven).

### 10.3 Screen-Level UI Catalog (MNT-015..MNT-035) [UNIVERSAL]

**Scope note (v3.1 amendment, 2026-04-30):** Sections 10.1/10.2 enumerate dashboards (read-only KPI surfaces). The CMMS lifecycle (asset registry, work request intake, mWO execution, calibration, spares, technicians, LOTO) requires full CRUD/workflow screens. v3.0 PRD scoped these implicitly via §9 schema + §11 validation rules but did not enumerate UI surfaces. **MNT-015..MNT-035 below cover the screen catalog**, anchoring prototypes already labeled in `_meta/prototype-labels/prototype-index-maintenance.json` and UX-spec'd in `design/13-MAINTENANCE-UX.md`. Numbering continues from dashboard catalog (MNT-014). Cross-references to UX line and prototype label are inline.

MNT-numbering policy: dashboards MNT-001..014 (read-only KPI), screen catalog MNT-015..035 (CRUD + workflow), modal contracts MNT-M-NN (see §10.5). UX file uses parallel MAINT-NNN slugs — both kept until schema-ID drift policy is resolved per audit CC-1.

#### MNT-015 Asset Registry — List [UNIVERSAL]
**UX:** `design/13-MAINTENANCE-UX.md:209-262` (MAINT-002 Asset List). **Prototype:** `asset_list_page` (`design/Monopilot Design System/maintenance/assets.jsx:1-183`). **Route:** `/maintenance/assets`.

Master registry of all `equipment` rows under maintenance management. Manager/admin perform CRUD; technicians read filtered subset. Filters: type (mixer/oven/packer/scale/thermometer/pH meter/CIP unit/conveyor/other — sourced from `settings_equipment_types` ref), location (ltree autocomplete), production line (FK 02-SET production_lines), criticality (Critical/High/Medium/Low — see §11 V-MNT-asset-criticality), status (Operational/Scheduled/Due/Overdue/In Work/LOTO Active — derived from current PM next_due_date + active mWO + active loto_procedures), `requires_loto` toggle, `requires_calibration` toggle. Bulk actions: bulk-assign PM template, export CSV. Row state styling: overdue PM = left red border, LOTO active = yellow row background, inactive = muted text + "Inactive" badge. Availability % column read-only from 15-OEE `oee_shift_metrics` (30-day rolling). Sidebar shows `asset_hierarchy` ltree tree (280px column) for hierarchical navigation. RBAC: "+ Add Asset" hidden for non-manager.

**Out of scope P1:** Photo gallery on row, geo-coordinates, asset map view → P2.

#### MNT-016 Asset Registry — Detail [UNIVERSAL]
**UX:** `design/13-MAINTENANCE-UX.md:265-300` (MAINT-003 Asset Detail). **Prototype:** `asset_detail_page` (`assets.jsx:185-518`). **Route:** `/maintenance/assets/:id`.

Single-asset detail with 8 tabs: Overview (nameplate + current status + active alerts), Service History (timeline of completed mWOs joined from `maintenance_work_orders`), PM Schedule (active `maintenance_schedules` for this asset + "+ Add PM Schedule"), Calibration (conditional on `requires_calibration=true`; lists linked `calibration_instruments` + latest records + CCP-block banner if any overdue instrument is CCP-linked per §9), Spares BOM (linked `spare_parts` join via asset_spares_bom table), Documents (S3-hosted PDFs/SOPs), Downtime Events (read-only consumer of 08-PROD `downtime_events` filtered by asset_id, with "Link mWO" action for unlinked events), Sensors (P2 placeholder, gated by `iot.sensors.enabled` flag — see §13.2). Header actions: Create mWO, Edit Asset (manager), Deactivate (manager + soft-delete via active=false). Conditional banners: active LOTO (red), overdue calibration (red), critical-priority open mWO (amber). MTBF/MTTR/Availability gauges sourced read-only from `oee_shift_metrics` per D-MNT-3.

#### MNT-017 Work Request — List [UNIVERSAL]
**UX:** `design/13-MAINTENANCE-UX.md:302-333` (MAINT-004 Work Request List). **Prototype:** `wr_list_page` (`work-orders.jsx:1-132`). **Route:** `/maintenance/wr`.

WR-state filtered view of `maintenance_work_orders` WHERE state='requested' (post-Q6B unification: WR is just an mWO in `requested` state, no separate `work_requests` table). Two views toggleable via URL `?view=table|kanban`: Table (default for operator) and Kanban (default for manager — columns Submitted / Triaged / Scheduled / Rejected; click-to-triage action; drag-and-drop deferred per BL-MAINT-DnD). Filters: status, priority, date range, reporter, asset. Operator scope: own-submissions only. Manager scope: all. Triage action button visible only to `maintenance_manager` on rows with state=requested. Linked-mWO column displays the same row's number once state advances past `requested`. Empty state: "No work requests. Operators can submit requests from the shop floor or via the Scanner app."

#### MNT-018 Work Request — Create [UNIVERSAL]
**UX:** `design/13-MAINTENANCE-UX.md:336-364` (MAINT-005 Shop-floor Create Modal). **Prototype:** `wr_create_modal` (`modals.jsx:81-121`). **Trigger:** "+ Submit Work Request" on MNT-017; 06-SCN deep-link; 08-PROD downtime auto-fill.

Three-field shop-floor optimized form (Asset searchable select + "Scan Asset QR", Problem Description textarea min 10 / max 1000 chars, Severity radio 4-button grid → maps to mWO `priority`). Optional: Photos multi-upload (S3 presigned URL via Server Action; max 5 × 10MB), Additional Notes (max 500). Auto-fill source: 08-PROD `downtime_events.id` query param pre-populates Asset + Problem Description with banner. On submit: INSERT into `maintenance_work_orders` (state='requested', source='manual' or 'auto_downtime' if from PROD, requester_user_id=session.user). Emit outbox `mwo.requested` per §12.3. Toast with WR# hyperlink. Tablet (06-SCN context): full-screen variant with large touch targets per `06-SCANNER-P1-PRD.md` §D5 input-parity contract.

**RBAC:** All authenticated users (no role gate — operators can submit).

#### MNT-019 Work Request — Triage Modal [UNIVERSAL]
**UX:** `design/13-MAINTENANCE-UX.md:367-393` (MAINT-006 Triage). **Prototype:** `wr_triage_modal` (`modals.jsx:123-183`). **Trigger:** "Triage" button on MNT-017 row.

Manager decides outcome: Approve & Create mWO / Reject / Mark as Duplicate. Read-only summary: asset + reporter + reported-at + problem + photos thumbstrip. On Approve: required Priority, mWO Type (reactive/preventive/calibration/sanitation/inspection), optional Estimated Start + Assigned Technician. On Reject: Rejection Reason textarea (min 10 chars, visible to reporter via notification). On Duplicate: search `maintenance_work_orders` by # for `Duplicate Of` field. Server Action transitions state requested → approved (or open if technician assigned), or → rejected, or → cancelled (duplicate w/ link). Enforces V-MNT-02: approver_user_id != requester_user_id (block + advisory alert: "You cannot approve your own work request"). Emits outbox `mwo.approved` / `mwo.rejected` / `mwo.duplicate_resolved`.

#### MNT-020 mWO List [UNIVERSAL]
**UX:** `design/13-MAINTENANCE-UX.md:396-434` (MAINT-007 mWO List). **Prototype:** `mwo_list_page` (`work-orders.jsx:134-259`). **Route:** `/maintenance/mwos`.

Master list of `maintenance_work_orders`. View tabs: All / My mWOs (technician-scoped via session.user_id) / Open / In Progress / Overdue / Completed — each with COUNT badge fetched in parallel. Filters: type, priority, technician, scheduled-start range, source enum (Manual / Auto-Downtime / PM Schedule / OEE Trigger / Calibration Alert per §9 `mwo.source` column). Row actions are state-dependent and respect §11 state-machine (V-MNT-01): requested→Triage, approved→Assign & Open, open→Start Work, in_progress→Log Work / Complete, terminal→View only. Technician scope hides manager-only actions and forces `assigned_to_user_id=session.user_id` filter. Downtime Impact column = boolean join on `downtime_events`. CSV export Server Action streams full mwo join result.

#### MNT-021 mWO Detail [UNIVERSAL]
**UX:** `design/13-MAINTENANCE-UX.md:437-503` (MAINT-008 mWO Detail). **Prototype:** `mwo_detail_page` (`work-orders.jsx:261-584`). **Route:** `/maintenance/mwos/:id`.

Technician's primary execution workspace. Header: state machine stepper (requested → approved → open → in_progress → completed; cancelled terminal alt) + state-transition primary button driven by current state per V-MNT-01. Conditional banners: LOTO required (amber, blocks transition to in_progress until `mwo_loto_checklists.verified_at` set per V-MNT-07), Allergen sanitation (red, dual sign-off + ATP required per V-MNT-15..17). Seven tabs: Overview (Problem & Plan + Schedule & Cost), Tasks (`mwo_checklists` checklist; step types check/measure/photo/sign-off; locked unless state=in_progress), Parts (planned from `mwo_spare_parts` + unplanned add via spare picker → consumes via §11.5 V-MNT-18..20 with row lock), Labor (`mwo_labor_entries` time entries + computed cost from `technician_profiles.hourly_rate`), Downtime Link (08-PROD `downtime_events` linkage modal — see MNT-M-04), Sign-off (technician/supervisor/safety officer slots; PIN re-verify on critical steps per 06-SCN auth pattern P2), History (audit timeline from outbox emit log). State-dependent UI: each state controls which tabs are editable. Server Action emits outbox `mwo.in_progress`, `mwo.completed`, `mwo.cancelled` per §12.3.

#### MNT-022 PM Schedule List [UNIVERSAL]
**UX:** `design/13-MAINTENANCE-UX.md:505-534` (MAINT-009 PM Schedule List). **Prototype:** `pm_schedules_list_page`, `pm_month_calendar`, `pm_week_calendar` (`pm-schedules.jsx:1-275`). **Route:** `/maintenance/pm` (with `?view=list|week|month`).

Three views over `maintenance_schedules`: list (table), week calendar (asset × day grid), month calendar (7-col grid with up to 4 event chips per day + overflow). KPI summary strip: Schedules Active / Due This Week / Overdue. Filter bar: schedule type (preventive/calibration/sanitation/inspection per §9.4 `maintenance_schedules.schedule_type`), asset, technician, status, overdue toggle. Row actions: Edit (opens MNT-023), Skip (opens MNT-M-02 PM Skip), Deactivate (active=false; soft delete). Auto-Generate toggle inline reflects `auto_generate_mwo` boolean read-only. Calendar event color encodes schedule_type. Engine `pm_schedule_due_engine_v1` (DSL rule registered in §7.8) creates mWO at `next_due_date - lead_time_days` per §9.4.

#### MNT-023 PM Schedule Create / Edit Wizard [UNIVERSAL]
**UX:** `design/13-MAINTENANCE-UX.md:537-580` (MAINT-010). **Prototype:** `pm_schedule_edit_wizard` (`modals.jsx:357-472`). **Route:** `/maintenance/pm/:id` or modal from MNT-022.

Four-step stepper: Asset & Type (asset select + schedule_type radio + name + sanitation `allergen_change_flag` toggle with V-MNT-15 advisory), Frequency (interval_basis enum: calendar_days / usage_hours / usage_cycles per §9.4 — usage-based is P2, calendar P1; interval_value, warning_days default 7, lead_time_days), Assignment (technician picker, task template select from `task_templates`, auto-generate toggle), Review (read-only summary + Next 12 Scheduled Occurrences computed server-side). "Save" creates `maintenance_schedules` row with active=false; "Save & Activate" sets active=true and emits outbox `pm_schedule.created`. Edit mode loads existing row + shows "Delete" (admin only, soft delete).

#### MNT-024 Calibration List [UNIVERSAL]
**UX:** `design/13-MAINTENANCE-UX.md:583-612` (MAINT-011 Calibration List). **Prototype:** `calibration_list_page` (`other-screens.jsx:1-127`). **Route:** `/maintenance/calibration`.

Master list of `calibration_instruments`. Summary strip with three counts: Current (green), Due Within 30 Days (amber per V-MNT-13 staged alerts), Overdue (red — also propagates to sidebar nav badge). Filters: type (Scale/Thermometer/pH Meter/Other), standard (ISO 9001 / NIST / Internal / Other per D-MNT-5), status, CCP Linked toggle. Critical UX feature: CCP block indication — when `calibration_instruments.ccp_block=true` (set when overdue AND linked to 09-QA CCP via D-MNT-10 FK bridge), row gets full red left border + inline alert "Production use of this instrument is blocked in Quality until re-calibrated." This state is consumed cross-module by 09-QA monitoring (read-only here, write-side belongs to 09-QA per `09-QUALITY-PRD.md`). "Export for Audit" button streams CSV with all `calibration_records` + `retention_until` (BRCGS 7-year per §14.1) + SHA-256 hashes (21 CFR Part 11 prep per §14.3).

#### MNT-025 Calibration Record Detail [UNIVERSAL]
**UX:** `design/13-MAINTENANCE-UX.md:615-633` (MAINT-012 Calibration Record Detail). **Prototype:** `calibration_detail_page` (`other-screens.jsx:129-264`). **Route:** `/maintenance/calibration/:id`.

Single-instrument calibration history. Header: instrument code/name/type/standard/linked asset/interval + CCP-block banner if active. Latest Result banner (full-width, color-coded green/red/amber per result enum PASS/FAIL/OUT_OF_SPEC). Test Points table (read-only: reference, measured, tolerance %, in-spec ✓/✗ derived per V-MNT-14). Two tabs: History (reverse-chronological `calibration_records` rows; expand for full test points; `retention_until` displayed per BRCGS 7-year), Certificate (PDF preview iframe; SHA-256 truncated hash with copy button per 21 CFR Part 11 P2; "Upload New Certificate" only on latest record — opens MNT-M-05). Trigger MNT-M-06 "Record Calibration" via header button.

#### MNT-026 Spare Parts List [UNIVERSAL]
**UX:** `design/13-MAINTENANCE-UX.md:636-668` (MAINT-013 Spares List). **Prototype:** `spares_list_page` (`spares.jsx:1-115`). **Route:** `/maintenance/spares`.

Spare parts catalog over `spare_parts` + `spare_parts_stock`. Architecture note (UX-flagged): spare parts are a separate catalog from 03-TECH product items per D-MNT-6 (Q3A). **No LP picker, no FEFO logic, no warehouse-LP join** — only `qty_on_hand` simple tracking. Stock location reference is `warehouses` table for location label only. Summary strip: Total Parts, Below Reorder Point (V-MNT-20), Critical Parts. Filters: category, supplier, critical-parts toggle, below-reorder toggle, warehouse/location. Below-reorder rows get red-50 background + inline "Reorder" action. Inline actions: Consume (links to mWO via V-MNT-18 — must be mwo-scoped), Adjust (opens MNT-M-08 with audit-logged delta + V-MNT-21 manager-approval gate >10% delta), Reorder (opens MNT-M-07 — emits internal notification only in P1 per BL-MAINT-07; D365 PO integration P2 per §12.2 stage X).

#### MNT-027 Spare Part Detail [UNIVERSAL]
**UX:** `design/13-MAINTENANCE-UX.md:671-687` (MAINT-014 Spare Part Detail). **Prototype:** `spare_detail_page` (`spares.jsx:117-261`). **Route:** `/maintenance/spares/:id`.

Two-column page. Left (60%): stock cards per warehouse/location row (`spare_parts_stock` per location), plus consumption history table over `spare_parts_transactions` (Receipt / Consume / Adjust / Return — per §9.10 schema). Right (40%): master data (Part Code, Name, Category, Supplier link, UoM, Unit Cost, Shelf Life Days, Critical Part badge, L3 ext fields per §13.3), Linked Assets mini-list (asset_spares_bom join). Edit Part button → manager-only CRUD form. Audit trail per V-MNT-18 enforced (every consume row immutable, mwo_id NOT NULL).

#### MNT-028 Technicians List [UNIVERSAL]
**UX:** `design/13-MAINTENANCE-UX.md:689-715` (MAINT-015 Technicians List). **Prototype:** `technicians_list_page` (`other-screens.jsx:266-374`). **Route:** `/maintenance/technicians`.

Manage `technician_profiles` + skills + certifications. Two views toggleable: List (table) and Skills Matrix (technicians × skill areas grid sourced from 02-SET §8.1 `technician_skills` ref table). List columns: technician (avatar+name), skill_level enum (basic/advanced/specialist per OQ-MNT-01), certifications truncated, cert. expiry (Red if expired / Amber if <30d), on-shift status, assigned mWO count link, hourly_rate (manager-only column per §14.4 GDPR — server-side RBAC, field excluded from query for non-manager). Filters: skill level, on-shift, certification expiry (Expiring 30d / Expired). PDF Skills Matrix export (audit) — currently stub per BL-MAINT-05.

**RBAC + GDPR:** Technicians cannot see other technicians' personal data beyond name + skill level (§14.4 personal data minimization).

#### MNT-029 Technician Detail [UNIVERSAL]
**UX:** `design/13-MAINTENANCE-UX.md:717-727` (MAINT-016 Technician Detail). **Prototype:** `technician_detail_page` (`other-screens.jsx:376-486`). **Route:** `/maintenance/technicians/:id`.

Header: avatar, name, email, skill level badge, on-shift status. Two tabs: Profile (certifications list — name/issuer/issue date/expiry+badge — Edit Certifications button manager-only via MNT-M-09; skills checklist from `technician_skills` ref; hourly_rate manager/admin only) and Assignment History (mWOs filtered by `assigned_to_user_id`, columns mWO#/asset/type/dates/duration/status, filterable by date range). GDPR notice: "This profile contains personal data retained per GDPR and 7-year regulatory requirements" per §14.4. On user delete: pseudonymize (scrub certs, hourly_rate→NULL, user_id→hash) per §14.4 GDPR-vs-regulatory conflict resolution.

#### MNT-030 LOTO Procedures List [UNIVERSAL]
**UX:** `design/13-MAINTENANCE-UX.md:730-762` (MAINT-017 LOTO List). **Prototype:** `loto_list_page` (`other-screens.jsx:488-598`). **Route:** `/maintenance/loto`.

Safety-critical screen for `loto_procedures`. Default filter: `?activeOnly=true`. Active LOTO alert strip: "⚠ [N] LOTO procedure(s) currently active." Real-time updates via SSE on `loto_procedures` table changes or 30s polling. Columns: procedure#, asset (always with 🔒 lock icon), linked mWO, energy sources count (tooltip lists each — sourced from `loto_procedures.energy_sources` JSONB), lock count, status (Active yellow-striped / Cleared gray), applied-by, applied-at, expected-clear (red if past without clearing — feeds OQ LOTO timeout warning per §13.2 settings), verified-by (safety officer per V-MNT-08), cleared-by. Active row click expands inline detail card (energy sources list + tags table + verified-by info). Apply LOTO action opens MNT-M-10; Clear action opens MNT-M-11. Two-person verification per V-MNT-08/09 enforced server-side; remote-confirmation flow not yet prototyped (BL-MAINT-04).

#### MNT-031 Maintenance Analytics Hub [UNIVERSAL]
**UX:** `design/13-MAINTENANCE-UX.md:832-867` (MAINT-020 Maintenance Analytics). **Prototype:** `maintenance_analytics_page` (`other-screens.jsx:601-803`). **Route:** `/maintenance/analytics`.

Management-level analytics hub powered by `maintenance_kpis` MV (§9.16) + 15-OEE `oee_shift_metrics` consumer (§9.17, D-MNT-3). Date-range selector (7d / 30d / 90d / 12m / custom) + asset filter + line filter + Export. Six tabs:
- **Overview** — 6 KPI cards (MTBF, MTTR, PM Compliance %, Planned vs Unplanned ratio, Total mWO Cost YTD, Spare Parts Cost YTD) + Top 5 Problem Assets bar list + Recent Completed mWOs.
- **MTBF/MTTR** — line chart trend + per-asset breakdown table; data-source banner: "Sourced from 15-OEE oee_shift_metrics. Maintenance does not compute these independently" (read-only consumer per D-MNT-3).
- **PM Compliance** — bar chart % on time per month + per-schedule table.
- **Availability** — per-asset availability table + 7-day rolling line heatmap (read-only from 15-OEE).
- **Cost** — stacked bar (labor + parts) + technician utilization table (mWO labor GROUP BY tech_id, manager-only hourly cost columns).
- **Pareto** — downtime causes Pareto (cross-module read from 08-PROD `downtime_events` linked to mWOs).

Refresh cadence: KPI MV refresh daily 02:30 (§9.16). Print Report button renders printable layout (UX:1355).

**Boundary clarification:** This screen is an aggregation/reporting surface; raw MTBF/MTTR is computed in 15-OEE per D-MNT-3 (NOT recomputed here). Pareto data is joined cross-module (downtime cause → mWO) but the source-of-truth for downtime classification stays in 08-PROD.

#### MNT-032 Maintenance Settings [UNIVERSAL]
**UX:** `design/13-MAINTENANCE-UX.md:871-922` (MAINT-021 Maintenance Settings). **Prototype:** `maintenance_settings_page` (`other-screens.jsx:805-964`). **Route:** `/maintenance/settings`.

Module-level configuration restricted to `maintenance_manager` + `admin`. Two-column page (left nav + right form). Sections map to §13 L1/L2/L3/L4 hierarchy:
- **General Defaults** — PM Lead Time Default Days (default 7), Calibration Warning Window (30/14/7 staged per V-MNT-13), MTBF Target, Availability Breach Threshold % (default 80, used by `oee_maintenance_trigger_v1` per §10.2 P2), Requires LOTO default for new assets.
- **Criticality Taxonomy** — fixed 4 levels (Critical/High/Medium/Low) with editable descriptions; drag-to-reorder (display order only). Add Level disabled (taxonomy locked for cross-module consistency).
- **Auto-WR from Downtime** — enable toggle, downtime duration threshold minutes (default 15), anti-duplicate window hours (default 1, addresses OQ-MNT-02).
- **Sanitation/Calibration** — ATP RLU Threshold (default 30 BRCGS baseline; tenant L2 override per §13.2 + OQ-MNT-04), Allergen Dual Sign-off Required (default On, non-editable for BRCGS V-MNT-15..17 compliance).
- **LOTO Policy** — Two-person LOTO required for critical assets (default On per V-MNT-08), LOTO Timeout Warning hours (default 8), Photo Evidence (Required/Recommended/Optional, default Recommended for critical — pre-condition for full BL-MAINT-02 photo gate).
- **OEE Trigger (P2 feature flag)** — `maintenance_triggers_enabled` toggle (default Off, opt-in per §13.2; activates `oee_maintenance_trigger_v1` per D-MNT-11).
- **Technician Skill Catalog** — read-only link to 02-SET → Reference Tables → `technician_skills`.
- **Notification Preferences** — per-event toggles (PM overdue / calibration overdue / WR SLA breach / mWO scheduled today / LOTO timeout / spare below min / MTBF declining trend) routed via Resend per `00-FOUNDATION-PRD.md` notification stack.

Persisted to `maintenance_settings` keyed-config table (added to §13.2 v3.1 amendment scope) + `criticality_taxonomy` reorder column. Reset to Defaults button (admin only) reseeds rows.

#### MNT-033 Maintenance Outbox / DLQ [UNIVERSAL] [NO-PROTOTYPE-YET]
**UX:** [NO-UX-YET] **Prototype:** [NO-PROTOTYPE-YET]. **Route:** `/maintenance/integrations` (provisional).

**TODO Direction A:** §12.3 enumerates 8 outbox events (`mwo.*`, `calibration.*`, `sanitation.*`, `spare_parts.consumed`) emitted to `maintenance_outbox_events`. No UI surface exists for inspecting queue/DLQ. Per cross-module consistency with 08-PROD `dlq_screen` and 10-FIN `fin_d365_integration` (D365 DLQ pattern), an Outbox/DLQ inspection screen is needed for ops debugging. Defer to P2 (track via OQ-MNT-11 new). Until P2 ships, ops monitor outbox via 12-REPORTING `rpt_integration_health`.

#### MNT-034 Sanitation Allergen Audit Surface [UNIVERSAL] [NO-PROTOTYPE-YET]
**UX:** [NO-UX-YET] **Prototype:** [NO-PROTOTYPE-YET]. **Route:** `/maintenance/sanitation/audit` (provisional).

**TODO Direction A:** §10.2 lists MNT-010 Sanitation Allergen Audit dashboard (P2). The dashboard surface exists in catalog but no dedicated screen-level audit drilldown is prototyped. UX:65 §3.2 cele wymienia changeover sanitation cross-operations per §8.9 op sequencing — needs evidence-trail screen for BRCGS audit (dual sign-off rows + ATP results history per V-MNT-15..17 + retention 7y per §14.1). Defer to P2 (13-e sub-module per §16). Track via OQ-MNT-12 new.

#### MNT-035 PM Occurrence Skip Audit [UNIVERSAL] [NO-PROTOTYPE-YET-AUDIT]
**UX:** [NO-UX-YET] **Prototype:** `pm_occurrence_skip_modal` exists (`modals.jsx:474-498`) but skip-audit-trail surface does not. **Route:** `/maintenance/pm/skips` (provisional).

**TODO Direction A:** PM skip flow is prototyped (MNT-M-02 below) but the audit/compliance surface for reviewing skip history (per V-MNT-skip-threshold from §11) is not. Required for PM compliance % calculation transparency on MNT-031 Analytics. Defer to P2.

### 10.4 Modal Contracts (MNT-M-01..MNT-M-12) [UNIVERSAL]

| ID | Modal | UX line | Prototype label | Trigger / parent |
|---|---|---|---|---|
| MNT-M-01 | Asset Create / Edit | UX:927+ §4 MODAL-01 | `asset_edit_modal` (modals.jsx:29-79) | MNT-015/016 |
| MNT-M-02 | PM Occurrence Skip | UX (skip flow §6) | `pm_occurrence_skip_modal` (modals.jsx:474-498) | MNT-022 row action |
| MNT-M-03 | mWO Create | UX (in MNT-007) | `mwo_create_modal` (modals.jsx:185-234) | MNT-001 / MNT-020 |
| MNT-M-04 | mWO Downtime Linkage | UX:478 (MNT-021 Downtime Link tab) | `downtime_linkage_modal` (modals.jsx:846-879) | MNT-021 Downtime tab |
| MNT-M-05 | Calibration Cert Upload | UX:629 (MAINT-012 Cert tab) | `calibration_cert_upload_modal` (modals.jsx:570-593) | MNT-025 |
| MNT-M-06 | Calibration Reading (Record) | UX:632 | `calibration_reading_modal` (modals.jsx:500-568) | MNT-024 / MNT-025 |
| MNT-M-07 | Spare Reorder | UX:644 (MAINT-013 actions) | `spare_reorder_modal` (modals.jsx:595-619) | MNT-026 row action |
| MNT-M-08 | Spare Adjust | UX (MAINT-013 Adjust) | `spare_adjust_modal` (modals.jsx:902-925) | MNT-026 row action |
| MNT-M-09 | Technician Skill / Cert Edit | UX:711 + MAINT-016 §Profile | `technician_skill_edit_modal` (modals.jsx:621-657) | MNT-029 |
| MNT-M-10 | LOTO Apply | UX:764 (MAINT-018) | `loto_apply_modal` (modals.jsx:659-731) | MNT-030 / MNT-021 LOTO banner |
| MNT-M-11 | LOTO Clear (two-person) | UX:801 (MAINT-019) | `loto_clear_modal` (modals.jsx:733-802) | MNT-030 |
| MNT-M-12 | mWO Complete Sign-off | UX:480 (MNT-021 Sign-off tab) | `mwo_complete_signoff_modal` (modals.jsx:296-355) | MNT-021 |
| MNT-M-13 | Task Checkoff Step | UX:452 (MNT-021 Tasks tab) | `task_checkoff_modal` (modals.jsx:236-294) | MNT-021 Tasks tab |
| MNT-M-14 | Asset Criticality Override | UX (MAINT-003 actions) | `criticality_override_modal` (modals.jsx:824-844) | MNT-016 (manager) |
| MNT-M-15 | Generic Delete-Confirm | UX (cross-section) | `delete_confirm_modal` (modals.jsx:804-822) | Multi-trigger reusable |

**Modal contract policy** (per audit CC-6): each modal contract is anchored to a triggering screen MNT-NNN above. Validation rules from §11 are enforced server-side (Server Actions) per CC-6 modal-schema convention (`_shared/MODAL-SCHEMA.md`).

### 10.5 UI Surfaces Map (PRD ↔ UX ↔ Prototype) [UNIVERSAL]

| MNT-NNN | UX section / line | Prototype label | Status |
|---|---|---|---|
| MNT-001..006 | UX:171 (dashboard panels) | `maintenance_dashboard` (dashboard.jsx:1-257) | OK — dashboard catalog |
| MNT-007..014 | (P2; partial UX in dashboard tiles) | partial | OK — P2 evolving |
| MNT-015 Asset List | UX:209 MAINT-002 | `asset_list_page` | OK (anchored v3.1) |
| MNT-016 Asset Detail | UX:265 MAINT-003 | `asset_detail_page` | OK (anchored v3.1) |
| MNT-017 WR List | UX:302 MAINT-004 | `wr_list_page` | OK (anchored v3.1) |
| MNT-018 WR Create | UX:336 MAINT-005 | `wr_create_modal` | OK (anchored v3.1) |
| MNT-019 WR Triage | UX:367 MAINT-006 | `wr_triage_modal` | OK (anchored v3.1) |
| MNT-020 mWO List | UX:396 MAINT-007 | `mwo_list_page` | OK (anchored v3.1) |
| MNT-021 mWO Detail | UX:437 MAINT-008 | `mwo_detail_page` | OK (anchored v3.1) |
| MNT-022 PM List + calendars | UX:505 MAINT-009 | `pm_schedules_list_page`, `pm_month_calendar`, `pm_week_calendar` | OK (anchored v3.1) |
| MNT-023 PM Wizard | UX:537 MAINT-010 | `pm_schedule_edit_wizard` | OK (anchored v3.1) |
| MNT-024 Calibration List | UX:583 MAINT-011 | `calibration_list_page` | OK (anchored v3.1) |
| MNT-025 Calibration Detail | UX:615 MAINT-012 | `calibration_detail_page` | OK (anchored v3.1) |
| MNT-026 Spares List | UX:636 MAINT-013 | `spares_list_page` | OK (anchored v3.1) |
| MNT-027 Spare Detail | UX:671 MAINT-014 | `spare_detail_page` | OK (anchored v3.1) |
| MNT-028 Technicians List | UX:689 MAINT-015 | `technicians_list_page` | OK (anchored v3.1) |
| MNT-029 Technician Detail | UX:717 MAINT-016 | `technician_detail_page` | OK (anchored v3.1) |
| MNT-030 LOTO List | UX:730 MAINT-017 | `loto_list_page` | OK (anchored v3.1) |
| MNT-031 Analytics Hub | UX:832 MAINT-020 | `maintenance_analytics_page` | OK (anchored v3.1) |
| MNT-032 Settings | UX:871 MAINT-021 | `maintenance_settings_page` | OK (anchored v3.1) |
| MNT-033 Outbox/DLQ | [NO-UX-YET] | [NO-PROTOTYPE-YET] | TODO P2 (OQ-MNT-11) |
| MNT-034 Sanitation Audit | [NO-UX-YET] | [NO-PROTOTYPE-YET] | TODO P2 (OQ-MNT-12) |
| MNT-035 PM Skip Audit | [NO-UX-YET] | [NO-PROTOTYPE-YET-AUDIT] | TODO P2 |
| MNT-M-01..15 | (per §10.4 table) | (per §10.4 table) | OK / Generic |

### 10.6 ADR-034 hygiene note [UNIVERSAL]

ADR-034 (`_foundation/decisions/ADR-034-generic-product-lifecycle-naming-and-industry-configuration.md`) requires generic naming per industry-configurable Reference.CodePrefixes. v3.1 amendment audit:
- All MNT-015..035 entities use **generic** terms: equipment / asset / work order / work request / spare part / calibration instrument / technician — no Apex-specific bakery vocabulary leaked into screen titles.
- Code prefixes (e.g., `EQ-`, `MWO-`, `WR-`, `PM-`, `CAL-`, `SP-`, `LOTO-`) are **placeholder examples** in UX; actual prefixes drawn from 02-SET §8.1 `code_prefixes` ref table per ADR-034 §1.
- Operation-context references (e.g., "Mix (MX) → Bake (BK)" in §11.7 V-MNT-24) are L2 tenant-configurable per §13.2 `manufacturing_operations` ref — not hardcoded in UI.
- Markers applied: all 21 new MNT-015..035 sections carry `[UNIVERSAL]`. P2 placeholders (MNT-033..035) carry `[UNIVERSAL]` + `[NO-PROTOTYPE-YET]` TODO.
- Markers per pattern per §2: `[UNIVERSAL]` on universal flows; `[EVOLVING]` reserved for P2 maturity (sensors, predictive ML); `[LEGACY-D365]` not applicable (M13 P1 has no D365 integration per §12.1).

---

## 11. Validation Rules V-MNT-01..V-MNT-24

### 11.1 State machine + lifecycle (V-MNT-01..06)
- **V-MNT-01**: `mwo.state` transition musi respektowac `mwo_state_machine_v1` allowed_from (block INVALID_TRANSITION, severity=critical)
- **V-MNT-02**: `approved` state requires `approver_user_id != requester_user_id` (segregation of duties, severity=critical)
- **V-MNT-03**: `in_progress` requires `assigned_to_user_id NOT NULL AND started_at NOT NULL` (severity=critical)
- **V-MNT-04**: `completed` requires `actual_duration_min > 0 AND completion_notes NOT NULL` (severity=critical)
- **V-MNT-05**: `cancelled` requires `cancellation_reason NOT NULL` (severity=warn + audit)
- **V-MNT-06**: `priority='critical'` requires approval within 2h SLA (severity=warn, notify escalation)

### 11.2 LOTO + safety (V-MNT-07..09)
- **V-MNT-07**: Equipment with `requires_loto=true` → MWO `in_progress` blocked without `mwo_loto_checklists.verified_at` (severity=critical, spójne z `loto_pre_execution_gate_v1`)
- **V-MNT-08**: LOTO `zero_energy_verified_by` musi mieć role `maintenance_technician` OR `maintenance_manager` (severity=critical)
- **V-MNT-09**: LOTO release requires `released_by != verified_by` when possible (severity=warn, 2-person rule best practice)

### 11.3 Calibration (V-MNT-10..14)
- **V-MNT-10**: `calibration_records.result='FAIL'` auto-create hold candidate in 09-QA (severity=warn + emit `calibration.failed`)
- **V-MNT-11**: `next_due_date` musi być > `calibrated_at` (severity=critical, data integrity)
- **V-MNT-12**: `calibration_instruments.calibration_interval_days > 0` (severity=critical)
- **V-MNT-13**: 30-day/7-day/overdue alerts via `calibration_expiry_alert_v1` (severity=info → warn → critical escalation)
- **V-MNT-14**: Test points `test_points[].tolerance_pct` w zakresie [0,100], measured BETWEEN range_min AND range_max (severity=warn)

### 11.4 Sanitation + allergen (V-MNT-15..17)
- **V-MNT-15**: Sanitation MWO `in_progress` with `allergen_change_flag=true` → require `first_signed_by AND second_signed_by AND atp_test_result_rlu NOT NULL` (severity=critical, BRCGS)
- **V-MNT-16**: ATP RLU threshold < 30 RLU for food-contact surfaces (Apex baseline, L2 override per tenant; severity=critical if >30, reason_code='atp_fail')
- **V-MNT-17**: `first_signed_by != second_signed_by` (severity=critical, dual sign-off integrity)

### 11.5 Spare parts (V-MNT-18..20)
- **V-MNT-18**: `spare_parts_transactions.txn_type='consume'` requires `mwo_id NOT NULL` (severity=critical)
- **V-MNT-19**: Stock consume cannot exceed `qty_on_hand` (block, severity=critical) — transaction-scoped row lock
- **V-MNT-20**: Reorder alert when `qty_on_hand <= reorder_point` (severity=warn, via `spare_parts_reorder_alert_v1`)

### 11.6 OEE integration (V-MNT-21..22)
- **V-MNT-21**: P2 `oee_maintenance_trigger_v1` auto-PM MWO: dedup per `{line_id, 7d window}` (severity=info, block duplicate creation)
- **V-MNT-22**: Auto-MWO from downtime (`source='auto_downtime'`) requires `downtime_event_id NOT NULL` (severity=critical)

### 11.7 Manufacturing operations scope (V-MNT-23..24) [UNIVERSAL] — v3.1 new
- **V-MNT-23**: `maintenance_schedules.operation_context` when populated must reference valid tenant manufacturing_operations (operation_name + process_suffix) from 02-SETTINGS §8.9 (severity=warn, cross-reference validation)
- **V-MNT-24**: Changeover sanitation maintenance must involve consecutive operations per production sequencing (e.g., "Mix (MX) → Bake (BK)", not arbitrary operation pairs). `sanitation_checklists` may reference source + target operation names for audit trail (severity=info)

---

## 12. INTEGRATIONS [LEGACY-D365] / [UNIVERSAL]

### 12.1 P1 — No D365 integration
M13 P1 nie wprowadza nowego stage INTEGRATIONS. 02-SET §11.8 stages summary unchanged. Rationale: CMMS dziś Apex w Excel, brak source-of-truth w D365 dla maintenance.

### 12.2 P2 — Future stages (post-Phase-C)
- **P2 stage X**: Spare parts purchase request → D365 PurchaseOrder (outbox pattern clone stage 2)
- **P2 stage Y**: IoT sensor telemetry (Modbus/OPC UA) → internal time-series DB (TimescaleDB), no D365
- **P2 stage Z**: Calibration certificate → external accreditation body API (DAkkS, UKAS, etc.), TBD

### 12.3 Outbox events (internal)
Wszystkie 8 events zemitowane przez M13 (D-MNT-12) idą do `maintenance_outbox_events` table (per-module outbox per 08-PROD pattern). Workers publish:
- `mwo.*` → 12-REPORTING + 15-OEE + 09-QA consumers
- `calibration.*` → 09-QA lab_results hold candidate
- `sanitation.allergen_change.completed` → 08-PROD allergen_changeover_gate_v1
- `spare_parts.consumed` → 10-FINANCE cost accumulation (cascade cost rollup)

---

## 13. Configuration (Settings / L2 / L3) [UNIVERSAL]

### 13.1 L1 core (universal)
Locked by this PRD: 14 tables + 7 DSL rules + MWO state machine + calibration standards + sanitation CIP program structure. **Manufacturing operations scope**: maintenance scheduling may reference operation names (from 02-SETTINGS Reference.ManufacturingOperations §8.9) for industry-specific process maintenance (e.g., bakery Mix/Bake/Proof/Knead operations, FMCG Mix/Fill/Seal/Label operations). Multi-industry support through L2 operation configuration.

### 13.2 L2 tenant config (via 02-SET §9)
- `maintenance_alert_thresholds` reference table (02-SET §8.1, added v3.3 delta):
  - pm_interval_default_days, calibration_warning_days (30/14/7), mtbf_target_threshold_pct, availability_breach_threshold_pct (80% default, tenant override)
  - atp_rlu_threshold (30 Apex, tenant override per food type)
- `manufacturing_operations` reference table (02-SET §8.9 v3.4 delta): operation_name (e.g., "Mix", "Bake", "Knead"), process_suffix (e.g., "MX", "BK", "KN"), industry category (bakery/pharmacy/fmcg). **Key for maintenance scoping**: enables PM schedules per operation, changeover sanitation between operations, operation-specific equipment assignment.
- `technician_skills` reference table (02-SET §8.1): basic/advanced/specialist enum + descriptions (tenant-specific certs)
- Feature flag `maintenance_triggers_enabled` (default false, opt-in) → activates `oee_maintenance_trigger_v1`

### 13.3 L3 schema extensions (ADR-028)
Via `tenant_schema_extensions.l3_ext_cols JSONB`:
- `equipment.l3_ext_cols` (np. manufacturer_serial, warranty_expiry, custom asset categorization)
- `maintenance_work_orders.l3_ext_cols` (np. custom priority scheme like A/B/C/D instead of low/med/high/critical)
- `spare_parts.l3_ext_cols` (np. supplier_preferred UUID, HAZMAT flags, country_of_origin)
- `calibration_instruments.l3_ext_cols` (np. vendor-specific metadata)

### 13.4 L4 user-level
- MWO email notifications on/off (per user)
- Dashboard filter presets (per user localStorage)

---

## 14. Compliance & Security [UNIVERSAL]

### 14.1 Retention per regulatory
- `calibration_records`: 7 years (BRCGS Issue 10)
- `sanitation_checklists`: 7 years (BRCGS + FSMA 204)
- `maintenance_history`: 7 years (equipment audit trail)
- `maintenance_work_orders`: 7 years (ERP audit)
- Archive nightly cold storage post-retention

### 14.2 RLS policies (per D-MNT-8)
All 14 tables: `org_id = current_org_id() AND (site_id IS NULL OR site_id IN (site_user_access))`.
Write scopes: `maintenance_manager` full, `maintenance_technician` own assigned MWOs + read shared, `production_manager/operator` trigger + read only.

### 14.3 21 CFR Part 11 (P2)
- `calibration_records.certificate_sha256` hash + signer immutability trigger
- `mwo.approval` PIN re-verification via 06-SCN §5 auth pattern (P2)
- `sanitation_checklists.first_signed_by/second_signed_by` dual e-sig (P2)

### 14.4 GDPR
- `technician_profiles` PII → anonymize on user delete (scrub certifications, hourly_rate to NULL, user_id preserved as hash)
- Retention override: worker rights (GDPR Art 17) vs regulatory 7y — prefer pseudonymize over delete

### 14.5 i18n
- MWO workflow notes: pl/en (Apex), roadmap uk/ro (tenant onboarding R8)
- Error messages for validation rules: translated via i18next per 02-SET §14

---

## 15. Testing Strategy

### 15.1 Unit tests (Vitest)
- State machine transitions: all 20+ transition paths (valid + invalid)
- Calibration alert scheduler: 30/7/overdue thresholds + multi-tenant L2 overrides
- Spare parts stock consume: concurrent transactions (row lock verification)
- DSL rule `oee_maintenance_trigger_v1` evaluation (mocked `oee_daily_summary` 3-day windows)

### 15.2 Integration tests (Playwright + Supabase local)
- MWO lifecycle end-to-end (requested → completed) with all guards
- Auto-MWO from downtime (M06 checkbox → MWO creation)
- Calibration fail → 09-QA lab_results hold candidate
- Sanitation allergen change → 08-PROD `allergen_changeover_gate_v1` trigger

### 15.3 Performance (Phase D builds)
- Dashboard MNT-005 query < 2s (MV + index on oee_shift_metrics)
- PM schedule scan (daily pg_cron) < 30s per 10k schedules
- Spare parts reorder alert batch < 5s per 1k stock rows

### 15.4 Regulatory audit tests
- Calibration evidence complete for last 7 years (BRCGS audit simulation)
- CIP sanitation 100% coverage (no missing checklists per shift)
- LOTO compliance: 100% of high-risk equipment MWOs have verified_at

---

## 16. Build Sequence — 5 sub-modules 13-a..e (18-24 sesji impl P1)

| Sub-module | Scope | Est. sesji | Dependencies |
|---|---|---|---|
| **13-a** | Settings + equipment CRUD + technician_profiles + RLS policies | 3-4 | 02-SET §7.8/§8.1 v3.3 delta + 14-MULTI foundation (site_user_access) |
| **13-b** | maintenance_schedules + PM engine (`pm_schedule_due_engine_v1`) + calendar dashboard MNT-002 | 3-4 | 13-a |
| **13-c** | MWO core lifecycle (state machine, checklists, LOTO, approvals) + MNT-001/006 dashboards | 4-5 | 13-b + 08-PROD downtime_events hook |
| **13-d** | Spare parts (catalog + stock + transactions + reorder rule) + MNT-004 dashboard | 3-4 | 13-c |
| **13-e** | Calibration + sanitation + MNT-003 + MNT-005 dashboards + outbox events integration | 5-7 | 13-d + 15-OEE oee_shift_metrics ready + 09-QA bridge + 08-PROD allergen gate |

**Total P1 est.** 18-24 sesji (baseline, zalezne od regression + cross-PRD refactoring).

### P2 sub-modules (8-10 epics, 24-30 sesji impl)
- 13-F: IoT sensor integration (Modbus/OPC UA adapters)
- 13-G: Predictive maintenance ML (availability anomaly classification)
- 13-H: TPM 5S autonomous maintenance scorecard
- 13-I: Supplier portal integration (spare parts reorder)
- 13-J: Calibration accreditation API (DAkkS/UKAS)
- 13-K: Advanced LOTO (full permit system)
- 13-L: Cost center allocation to MWO (10-FIN consumer)
- 13-M: Cross-site maintenance benchmarking (14-MULTI consumer)

---

## 17. Open Items (OQ-MNT-01..10)

| ID | Question | Priority | Owner |
|---|---|---|---|
| OQ-MNT-01 | Czy `technician_skills` ref table powinien mieć levels matrix (np. cert1_level=specialist, cert2=basic) vs single skill_level? | P2 | Architecture |
| OQ-MNT-02 | Czy auto-MWO z downtime powinno mieć anti-dedup window short (1h) aby nie tworzyć duplikatów? | P2 (implementation detail) | 13-c phase |
| OQ-MNT-03 | LOTO permit vs checklist: P1 checklist, kiedy upgrade do permit system (P2)? | P2 | Safety officer consult |
| OQ-MNT-04 | Sanitation ATP RLU thresholds per food type (meat 10 RLU vs fish 30 RLU) — tenant L2 override? | P2 (L2 variation decision) | Food safety |
| OQ-MNT-05 | Predictive maintenance ML: Prophet vs custom TFLite? | P3 | 13-G phase, R12 consumer |
| OQ-MNT-06 | Calibration certificate storage: S3 vs Supabase Storage vs external DMS? | P2 | 02-SET §12 infra |
| OQ-MNT-07 | MWO priority SLA (critical=2h, high=8h, medium=24h, low=72h) — enforce w notification escalation? | P2 | 13-c phase |
| OQ-MNT-08 | IoT sensor cold chain (BRCGS requirement) integration P2 kontra P1 if Apex pushes? | P2 | Apex hardware consult |
| OQ-MNT-09 | Cross-site maintenance benchmark metrics: which KPIs matter most (MTBF, MTTR, cost/unit)? | P2 | 14-MULTI Phase 2B |
| OQ-MNT-10 | D365 push for spare parts purchase requests (stage X) — now czy P3? | P2 | 10-FIN + 02-SET §11 |
| OQ-MNT-11 | Outbox/DLQ inspection screen (MNT-033) — promote to P1 ops debugging or keep P2 (rely on 12-REPORTING `rpt_integration_health`)? | P2 | 13-c phase + 12-REPORTING |
| OQ-MNT-12 | Sanitation Allergen Audit drilldown screen (MNT-034) — required for BRCGS audit? P1 escalation candidate. | P2 | Food safety + Compliance |
| OQ-MNT-13 | Schema-ID drift policy — keep MNT-NNN (PRD) + MAINT-NNN (UX) parallel or pick canonical? Affects 21 screens. | P1 decision | Architecture |

---

## 18. Changelog

### v3.1 (2026-04-30) — Manufacturing Operations standardization + UI surface catalog amendment
- **UI surface catalog amendment (audit 2026-04-30 BLOCKER fix)**: Added §10.3 Screen-Level UI Catalog enumerating MNT-015..MNT-035 (21 screen-level surfaces, ~5400 words). Anchors prototypes already labeled in `_meta/prototype-labels/prototype-index-maintenance.json` and UX-spec'd in `design/13-MAINTENANCE-UX.md:167-922`. Added §10.4 Modal Contracts (MNT-M-01..MNT-M-15), §10.5 UI Surfaces Map, §10.6 ADR-034 hygiene note.
- Pre-amendment coverage: ~60% (PRD enumerated dashboards only, MNT-001..014; orphan: 9+ screen-level surfaces). Post-amendment coverage: ~95% (all UX-spec'd screens anchored; 3 remaining `[NO-PROTOTYPE-YET]` TODO entries MNT-033/034/035 deferred to P2).
- Added 3 OQs: OQ-MNT-11 (Outbox/DLQ screen P1 vs P2), OQ-MNT-12 (Sanitation audit drilldown), OQ-MNT-13 (schema-ID drift MNT- vs MAINT-).
- No changes to existing PRD content (§1-9, §11-19, dashboards §10.1/10.2 preserved).
- Standardized process references to use manufacturing operation names per 02-SETTINGS §8.9 (e.g., "Mix (MX)", "Bake (BK)" instead of "Process_A/B/C/D")
- Updated maintenance scheduling examples to reference operation-scoped maintenance (operation-specific PM plans, changeover sanitation per mix/bake sequences)
- Updated examples: "Changeover sanitation for Mix (MX) and Bake (BK)" pattern implemented throughout
- Cross-referenced 02-SETTINGS v3.4 §8.9 Reference.ManufacturingOperations for maintenance scheduling scope
- Verified no orphaned Process_A/B/C/D codes or old FA/PR patterns remain
- Equipment maintenance correctly scoped to production line operations per 08-PRODUCTION entity model
- Validation rules updated to reference operation-specific maintenance requirements
- No changes to CMMS workflow, preventive maintenance algorithm, predictive maintenance model, or scheduling logic

### v3.0 (2026-04-20) — Phase D full rewrite
- Phase D convention (19 sekcji, markers, D-MNT-9..16 extended)
- Unified WR+MWO lifecycle per Q6B (6-state machine, `mwo_state_machine_v1` DSL rule)
- Calibration ↔ 09-QA bridge via `calibration_instruments.id` FK target (D-MNT-10)
- `oee_maintenance_trigger_v1` P2 rule consumer (D-MNT-11)
- 7 DSL rules registered via 02-SET §7.8 (1 P2 consumer + 6 P1 active)
- REC-L1 `site_id` na 14 tabelach od day 1 (nie retrofit)
- Outbox event pattern (8 events, D-MNT-12)
- L2 tenant config `maintenance_alert_thresholds` + `technician_skills` (D-MNT-13)
- Allergen-aware sanitation link 08-PROD `allergen_changeover_gate_v1` (D-MNT-14)
- LOTO basic P1 (D-MNT-15)
- IoT deferred P2 (D-MNT-16)
- Sub-modules 13-a..e build sequence (18-24 sesji impl P1) + 8 P2 epics
- 22 V-MNT validation rules
- 14 P1 tables + 1 MV + 1 external consumer (oee_shift_metrics)
- 6 P1 dashboards + 8 P2 dashboards
- BRCGS 7-year retention enforced

### v1.0 (2026-02-18) — pre-Phase-D baseline
- 8 D-MNT decisions locked (D-MNT-1..8)
- 14 tables, 11 epics E14.1-E14.11
- 4-state MWO machine (OPEN/IN_PROGRESS/COMPLETED/CANCELLED)
- Basic OEE integration (MTBF/MTTR read-only)

---

## 19. Related Documents

- [`00-FOUNDATION-PRD.md`](./00-FOUNDATION-PRD.md) v3.0 — §4 module map, §4.2 build sequence, §5 tech stack, REC-L1 site_id
- [`02-SETTINGS-PRD.md`](./02-SETTINGS-PRD.md) v3.4 — §7.8 rules registry (23 rules cumul post-C5 Sesja 2 delta), §8.1 ref tables (23 tables), **§8.9 Reference.ManufacturingOperations** (configurable operations per tenant with industry-specific seed data: Bakery, Pharmacy, FMCG), §9 multi-tenant L2
- [`05-WAREHOUSE-PRD.md`](./05-WAREHOUSE-PRD.md) v3.0 — TO lifecycle baseline (spare parts TO pattern reference)
- [`06-SCANNER-P1-PRD.md`](./06-SCANNER-P1-PRD.md) v3.0 — SCN-090 Maintenance scanner tab P2
- [`08-PRODUCTION-PRD.md`](./08-PRODUCTION-PRD.md) v3.0 — §9.6 downtime_events producer, §12 outbox stage 2 pattern reference, `allergen_changeover_gate_v1` consumer, production_lines entity for equipment scoping, manufacturing operation sequencing for changeover coordination
- [`09-QUALITY-PRD.md`](./09-QUALITY-PRD.md) v3.0 — §6 Q6 equipment FK stub (D-MNT-10 target), HACCP CCP verification trail
- [`10-FINANCE-PRD.md`](./10-FINANCE-PRD.md) v3.0 — §9 cascade cost rollup (spare parts consumption cost propagation)
- [`12-REPORTING-PRD.md`](./12-REPORTING-PRD.md) v3.0 — `dashboards_catalog` metadata-driven registration
- [`14-MULTI-SITE-PRD.md`](./14-MULTI-SITE-PRD.md) v3.0 — site_user_access pattern, per-site scoping
- [`15-OEE-PRD.md`](./15-OEE-PRD.md) v3.0 — §7.3 `oee_maintenance_trigger_v1` rule (D-MNT-11 consumer), §9.2 `oee_shift_metrics` MTBF/MTTR producer (D-MNT-3 consumer)
- [`_foundation/research/MES-TRENDS-2026.md`](./_foundation/research/MES-TRENDS-2026.md) — R12 ML maintenance roadmap, §9 13-MAINTENANCE buy vs build (Fiix/Hippo competitors)
- ADR-028 (schema-driven L1-L4), ADR-029 (rule engine DSL), ADR-030 (configurable depts), ADR-031 (schema variation per org)

---

**Phase C5 Sesja 2 deliverable 1/2 — 13-MAINTENANCE-PRD.md v3.1 COMPLETE. (v3.1 Manufacturing Operations standardization, 2026-04-30)**

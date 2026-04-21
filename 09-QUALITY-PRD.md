# 09-QUALITY — PRD v3.0

**Module:** 09-QUALITY
**Version:** 3.0
**Date:** 2026-04-20
**Status:** Final (Phase C4 Sesja 1 deliverable)
**Phase reference:** Phase D renumbering (M08 → 09), Phase B/C foundation complete (00..08), Phase C4 in progress.
**Scope:** QA hold/release + product specifications + incoming inspection + lab results + basic NCR + basic HACCP/CCP (P1). Phase 2 adds full NCR/CAPA workflow, in-process/final inspection, HACCP advanced, CoA, supplier quality, operation checkpoints, LIMS bridge.
**Consumer of:** 08-PRODUCTION (allergen changeover gate evidence, `wo_outputs.qa_status`), 05-WAREHOUSE (LP lifecycle, use_by/best_before gating, lot genealogy), 03-TECHNICAL (product specs, allergen cascade, lab_results), 06-SCANNER-P1 (SCN-071..073 QA workflows), 02-SETTINGS (rule registry, reference tables, RLS).
**Producer for:** 10-FINANCE (yield variance events, waste category rollup), 11-SHIPPING (LP qa_status gate, CoA refs P2), 12-REPORTING (quality KPIs, audit trail, hold/NCR trends), 13-MAINTENANCE (calibration refs P2).

---

## §1. Executive Summary

Moduł **09-QUALITY** jest centralnym rejestrem jakości i bezpieczeństwa żywności w Monopilot MES. Realizuje 4 kluczowe funkcje regulatoryjne:

1. **Hold/Release lifecycle** — każdy LP (License Plate) ma `qa_status`, tylko `PASSED`/`RELEASED` dopuszcza do shipment/consume. Hold blokuje wszelkie operacje (05-WH §12.2 enforce).
2. **Inspection governance** — incoming (GRN), in-process (WO ops, P2), final (batch release, P2) z test results linked do `quality_specifications`.
3. **HACCP/CCP monitoring** — P1 manual data entry z DSL rule engine gotowym pod P2 IoT ingestion. Auto-deviation escalation przez `ccp_deviation_escalation_v1`.
4. **Audit evidence aggregator** — 7-year retention (BRCGS Issue 10), e-signature (21 CFR Part 11), immutable audit trail. Consumer dla `allergen_changeover_validations` z 08-PROD E7.

**Zmiany vs v2.0 baseline (2026-02-17, 558 linii):**

| Obszar | v2.0 → v3.0 |
|---|---|
| DSL rules | 0 registered → **3 registered w 02-SETTINGS §7** (`batch_release_gate_v1`, `ccp_deviation_escalation_v1`, `qa_status_state_machine_v1`) |
| Allergen gate | Implicit → **Explicit consumer 08-PROD E7** (ATP result storage, dual sign-off in `allergen_changeover_validations`) |
| Scanner QA | Generic pass/fail → **SCN-070..073 1:1 contract** z 06-SCANNER §8.5 (PASS/FAIL/HOLD + 7 failure reasons + NCR auto-create) |
| Reference tables | Hardcoded → **`waste_categories`, `qa_failure_reasons`, `quality_hold_reasons` przeniesione do 02-SETTINGS §8** CRUD generic |
| Customer complaints | Not mentioned → **Stub `quality_complaints` table P1, full Phase 2** |
| LIMS | P2 skip → **Bridge-ready stub `lab_results.external_lims_id` P1, vendor TBD P2** |
| Retention | Per-type (5/7/10y) → **Unified 7y BRCGS Issue 10** + override per regulatory type |
| INTEGRATIONS | N/A | P1 consumer-only (event-driven), P2 LIMS REST + ATP device API stub |

**Phase D positioning:** 09-QUALITY jest 9. modułem Monopilot (M05→09 renumbering). Obsługuje całe 15-modułowe spektrum jako **quality guardian layer** — każdy module z LP/WO/CCP/batch lifecycle musi przejść przez 09-QUALITY gates przed shipment (11-SHIPPING) lub close (08-PROD).

**Sub-modules build (P1):** 09-a Hold/Release → 09-b Specs/Params → 09-c Incoming Inspection → 09-d NCR Basic → 09-e HACCP Basic + CCP Rule. **Est. 18-22 sesji impl P1**, +14-20 sesji P2 (8F..8L).

---

## §2. Stakeholders & Personas

### 2.1 Primary roles (operational)

| Persona | Role code | Kluczowe responsybilności | UI touchpoints |
|---|---|---|---|
| **Quality Lead** | `quality_lead` | Approve specs, release/hold decisions, NCR closure, HACCP plan owner, batch release gate, dual sign-off allergen changeover | Desktop (QA-001..060), Scanner (PIN auth) |
| **QA Inspector** | `qa_inspector` | Execute inspections (incoming/in-process/final), record test results, scan LP pass/fail/hold, take samples | Scanner (SCN-070..073 primary), Desktop (QA-030 secondary) |
| **Hygiene Lead** | `hygiene_lead` | CCP monitoring, cleaning validation, ATP sampling, deviation response | Desktop (QA-050 CCP board), Scanner (SCN-081 changeover sign) |
| **Shift Lead** | `shift_lead` | First signer allergen changeover gate, operator-side CCP readings, hold creation on production line | Desktop, Scanner |
| **Production Manager** | `prod_manager` | Escalation chain dla deviation, yield issue review, NCR severity=critical signoff | Desktop (QA-001, QA-040) |

### 2.2 Secondary roles (oversight)

| Persona | Role code | Kluczowe responsybilności |
|---|---|---|
| **Quality Director** | `quality_director` | Dashboard oversight, supplier quality (P2), CAPA effectiveness review, audit trail export |
| **Auditor (external)** | `auditor_readonly` | Read-only access do wszystkich QA records + audit log + 7y history dump |
| **Admin** | `admin` | CRUD reference tables (QA), manage `quality_hold_reasons`, rule registry view-only |

**[FORZA-CONFIG]**: Forza 2026-04 single-site. Quality Lead = Sarah (allocated from NPD team post-launch per project_monopilot_migration §15). QA Inspector = 3 osoby (2 dayshift, 1 nightshift). Hygiene Lead = dedicated role, BRCGS mandate.

### 2.3 RLS & role binding

Wszystkie tabele Quality mają `org_id UUID NOT NULL` + RLS policies per ADR-003/013. Matrix (P1):

| Action | quality_lead | qa_inspector | hygiene_lead | shift_lead | prod_manager | others |
|---|---|---|---|---|---|---|
| Create Hold | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Release Hold | ✅ | ❌ | ❌ (own only) | ❌ | ✅ | ❌ |
| Approve Spec | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Close NCR (critical) | ✅ | ❌ | ❌ | ❌ | ✅ (co-sign) | ❌ |
| CCP deviation override | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Dual-sign allergen gate | ✅ (second) | ❌ | ✅ (either) | ✅ (first) | ❌ | ❌ |

---

## §3. Out-of-scope (P1 clarifications)

### 3.1 Explicit P2 deferrals (w 09-QUALITY scope, nie P1)

- **EPIC 8F** In-Process + Final Inspection (WO ops checkpoints, batch release gate) — P2
- **EPIC 8G** Full NCR workflow (investigation → root cause → CAPA → verification → close) — P2
- **EPIC 8H** Operation Quality Checkpoints (FR-QA-026, routing-level) — P2
- **EPIC 8I** HACCP Advanced (deviation auto-NCR, scheduled verification, calibration tracking) — P2
- **EPIC 8J** CoA Management (templates, auto-generation, PDF/A export, e-sign) — P2
- **EPIC 8K** Supplier Quality (rating, audits, findings, supplier NCRs) — P2
- **EPIC 8L** Dashboard + Analytics + Retention Samples + Document Control — P2

### 3.2 Explicit exclusions (nigdy w 09-QUALITY)

- **LIMS system** (LabWare, StarLIMS, etc.) — bridge P2 via `lab_results.external_lims_id`, sama integracja w 13-MAINTENANCE lub M13 external bridge moduł
- **Calibration management** — w zakresie 13-MAINTENANCE (equipment life-cycle). 09-QA HACCP verification records linkują przez FK stub `equipment_calibration_id` (reserved)
- **PLC/SCADA sensor ingestion** — P2 via OPC UA gateway (pozostało z 08-PROD Q5 decyzja)
- **Customer-specific CoA portals** — M13 Integrations scope
- **Multi-language quality forms (static translations)** — i18n platform-level (14-MULTI-SITE) handles; 09-QA reuses
- **Video/photo evidence attachments** — P2 upgrade (inspection_evidence table stub)
- **External certification bodies sync** (BRCGS audit API) — P3+
- **Customer complaint RCA dashboards** — stub P1 only; full resolution workflow P2 (EPIC 8M candidate)

### 3.3 Not-ours boundary clarifications

| Feature | Owner | 09-QA relation |
|---|---|---|
| LP state machine | **05-WH §6.1** | 09-QA writes `qa_status` transitions only |
| Allergen cascade rule RM→FA | **03-TECH §10.2** (`allergen_cascade_rm_to_fa`) | 09-QA consumer (read allergen profile for inspection config) |
| Allergen changeover gate evaluation | **08-PROD §7 E7** (`allergen_changeover_gate_v1`) | 09-QA consumer (stores ATP result + dual sign) |
| WO state machine | **08-PROD §7 E1** (`wo_state_machine_v1`) | 09-QA blocks WO START on allergen gate fail (rule output) |
| Scanner offline queue | **06-SCN §5** | 09-QA backend handles replay idempotency (R14) |
| Lot genealogy query | **05-WH §11** | 09-QA consumer for hold trace (impact analysis) |

---

## §4. KPIs (success metrics)

### 4.1 Phase 1 (P1 MVP)

| KPI | Target | Measurement source |
|---|---|---|
| **Hold Resolution Time** | < 24h P50, < 72h P95 | `quality_holds.released_at - created_at` |
| **First-Time Inspection Pass Rate** | ≥ 95% | `quality_inspections.result='pass' / total × 100` |
| **Scanner QA Capture Time** | < 1s (SCN-071→073 roundtrip) | client timestamp delta |
| **CCP Reading Compliance** | ≥ 99% within limits | `haccp_monitoring_records.in_spec / total × 100` |
| **Hold Apply/Release Latency** | < 500ms P95 | API response time |
| **FSMA 204 Trace Query** | < 30s P95 (05-WH consumer) | `/api/quality/trace/:lp_id` |
| **NCR Creation Latency** | < 3s from scanner fail | SCN-072 → NCR draft persisted |
| **Audit Event Capture** | 100% (zero loss) | audit_log insert rate vs expected events count |

### 4.2 Phase 2 (post-P1 rollout)

| KPI | Target | Measurement |
|---|---|---|
| NCR Response Time (critical) | < 24h | severity=critical → first CAPA action |
| CAPA Closure Rate | ≥ 90% on-time | `capa_records.closed_on_time / total` |
| CoA Turnaround | < 24h from batch close | `certificates.issued_at - batch.closed_at` |
| Supplier Quality Score | ≥ 85/100 | weighted: quality, delivery, response |
| CCP Alert Delivery | < 30s (MES-TRENDS R3) | deviation_event → notification receipt |
| Customer Complaint→NCR Linked | ≥ 95% | `complaints.linked_ncr_id NOT NULL / total` |
| Operation Checkpoint Pass | ≥ 98% | FR-QA-026 results |
| LIMS Integration Uptime | ≥ 99.5% P2 | ext_lims_sync health |

### 4.3 Regulatory compliance KPIs (continuous)

| Regulation | Indicator | Target | Source |
|---|---|---|---|
| **BRCGS Issue 10** | 7y retention coverage | 100% signed records | `retention_until >= NOW() + 7y` on insert |
| **FSMA 204** | CTE/KDE/TLC coverage for in-scope products | 100% | 05-WH §11 coverage check |
| **21 CFR Part 11** | E-sig records verifiable | 100% | `*_signed_at NOT NULL AND signed_by NOT NULL AND signature_hash NOT NULL` |
| **EU FIC 1169/2011** | Allergen claim evidence | 100% | `allergen_changeover_validations` for each allergen-free claim WO |
| **ISO 22000** | HACCP plan coverage | 100% product families | `haccp_plans` active per `product_family` |

---

## §5. Compliance & Regulatory

### 5.1 Regulatory mapping

**Primary regulations (P1 compliance target):**

| Reg | Jurisdiction | Enforcement | 09-QA coverage |
|---|---|---|---|
| **BRCGS Issue 10** | Global food | 2026 post-consultation | Digital evidence mandatory: dashboards, trend charts, CCP logs z signatures. Retention 7y na signed records. |
| **FSMA 204** | USA | **2028-07-20** (delayed from 2026) | CTE/KDE/TLC via 05-WH §11 consumer. 09-QA adds inspection CTEs (GRN, batch release). |
| **EU FIC 1169/2011 + Reg 2021/382** | EU | Active | Allergen claim gate: 09-QA stores `allergen_changeover_validations` 7y, enforces EU-14 cascade via 03-TECH §10. |
| **21 CFR Part 11** | USA FDA | Active | E-signature on spec approval, NCR closure, batch release (P2), CAPA effectiveness. Hash + user + timestamp. |
| **ISO 22000** | Voluntary | Active | HACCP plans (P1 basic, P2 full) + verification records. |
| **Codex Alimentarius HACCP** | Global | Active | 7 principles: hazard analysis, CCPs, limits, monitoring, corrective, verification, records. |

**Secondary (documented, P2 tracked):**

- **BRCGS v9** (transition to v10): legacy support P1 flag `compliance.brcgs_version` w 02-SETTINGS
- **IFS Food** (EU variant): similar audit evidence pattern — same data schema coverage
- **SQF Food Safety** (N.America retail): CoA + supplier quality (8K/8J P2 coverage)
- **GFSI** (umbrella): satisfied by BRCGS + SQF coverage

### 5.2 Compliance-driven DB constraints

**Retention policy** (automated via `retention_until` column + nightly archival cron):

```sql
-- Base: 7y BRCGS Issue 10
ALTER TABLE quality_inspections ADD COLUMN retention_until DATE GENERATED ALWAYS AS (created_at::date + INTERVAL '7 years') STORED;
ALTER TABLE quality_holds ADD COLUMN retention_until DATE GENERATED ALWAYS AS (COALESCE(released_at, created_at + INTERVAL '7 years')::date + INTERVAL '7 years') STORED;
ALTER TABLE ncr_reports ADD COLUMN retention_until DATE GENERATED ALWAYS AS (created_at::date + INTERVAL '10 years') STORED;
ALTER TABLE haccp_monitoring_records ADD COLUMN retention_until DATE GENERATED ALWAYS AS (created_at::date + INTERVAL '5 years') STORED;
ALTER TABLE allergen_changeover_validations ADD COLUMN retention_until DATE GENERATED ALWAYS AS (created_at::date + INTERVAL '7 years') STORED;
-- Override per regulatory req: ncr/capa 10y, haccp 5y, inspections 7y (baseline)
```

**E-signature policy** (21 CFR Part 11):

```sql
-- Pattern: signature columns on every signed record
signed_by UUID REFERENCES users(id),
signed_at TIMESTAMPTZ,
signature_hash VARCHAR(64) NOT NULL, -- SHA-256 of (user_id + timestamp + record_hash + PIN_proof)
signature_meaning VARCHAR(50), -- 'approved', 'released', 'rejected', 'witnessed'
pin_verified BOOLEAN DEFAULT false,

-- Immutability trigger:
CREATE TRIGGER prevent_signed_update
BEFORE UPDATE ON quality_inspections
FOR EACH ROW
WHEN (OLD.signed_at IS NOT NULL)
EXECUTE FUNCTION raise_immutable_error();
```

**Audit trail pattern** (hybrid ADR-008, PG trigger + app context):

```sql
CREATE TABLE quality_audit_log (
  id BIGSERIAL PRIMARY KEY,
  org_id UUID NOT NULL,
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  operation TEXT NOT NULL, -- INSERT/UPDATE/DELETE/SIGN/RELEASE
  old_data JSONB,
  new_data JSONB,
  changed_fields TEXT[],
  user_id UUID,
  session_id UUID,
  change_reason TEXT,
  ip_address INET,
  user_agent TEXT,
  request_id UUID,
  retention_until DATE GENERATED ALWAYS AS (occurred_at::date + INTERVAL '7 years') STORED
);
CREATE INDEX idx_audit_record ON quality_audit_log(org_id, table_name, record_id, occurred_at DESC);
CREATE INDEX idx_audit_user ON quality_audit_log(org_id, user_id, occurred_at DESC);
```

### 5.3 Signature evidence pattern (electronic records)

**Flow (dual sign example — allergen changeover release):**

1. Shift Lead presses "Signed" button → app invokes `sign_record(user_id, record_id, table, meaning='witnessed', pin)`
2. PIN verified via 06-SCN baseline (FR-SC-BE-004 reuse) → `pin_verified=true`
3. Signature hash computed: `SHA-256(user_id || record_id || table || signed_at_iso || record_content_hash || PIN_proof)`
4. UPDATE `allergen_changeover_validations SET first_signed_by, first_signed_at, first_signature_hash`
5. UI shows "Awaiting quality lead sign"
6. Quality Lead clicks → same flow, sets `second_signed_by`, validation_result='approved'
7. Audit log entry captures both signatures (SIGN operation)
8. Trigger `prevent_signed_update` blocks further edits; only `override_by` path allowed (separate signature)

---

## §6. Data Model — Core Entities

### 6.1 Entity overview (P1 tables = 14, P2 = +12)

**P1 Core (14 tables):**

```
quality_holds              quality_hold_items         quality_status_types
quality_specifications     quality_spec_parameters    
quality_inspections        quality_test_results       
lab_results (shared 03-TECH, extended)
sampling_plans             sampling_records           
ncr_reports (basic)        
haccp_plans (basic)        haccp_ccps (basic)         haccp_monitoring_records (basic)
quality_incidents          quality_complaints (stub P1)
```

**P2 Extensions (+12 tables):**

```
ncr_workflow               capa_records               capa_actions               
capa_effectiveness_checks  
operation_quality_checkpoints      operation_checkpoint_results
haccp_deviations           haccp_verification_records 
certificates_of_analysis   coa_templates              coa_parameters
supplier_quality_ratings   supplier_audits            supplier_audit_findings   
supplier_ncrs              retention_samples          
quality_document_versions
```

### 6.2 Entity relationships (P1 focus)

```
     ┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐
     │  products   │◄────│ qty_spec_params │◄────│quality_specs    │
     │ (03-TECH)   │     │ (per-product)   │     │(versioned)      │
     └──────┬──────┘     └─────────────────┘     └────────┬────────┘
            │                                              │
            │                                              │ linked
            ▼                                              ▼
     ┌──────────────┐    ┌──────────────────┐    ┌────────────────┐
     │license_plates│    │quality_inspections│───│quality_test_   │
     │ (05-WH)      │───▶│(incoming/in-proc)│    │ results        │
     │ qa_status    │    └────────┬──────────┘    └────────────────┘
     └──────┬───────┘             │
            │                     │ fail/hold
            │                     ▼
            │              ┌─────────────┐     ┌──────────────┐
            └─────────────▶│quality_holds│────▶│ncr_reports   │
                           │ (on LP/batch)│    │ (basic P1)   │
                           └─────────────┘     └──────────────┘
                                                      │
                                                      │ 6.2 yield_issue
                                                      ▼
                                              ┌──────────────┐
                                              │(extension    │
                                              │ NCR fields)  │
                                              └──────────────┘

     ┌──────────────┐       ┌──────────────┐     ┌─────────────────────┐
     │  products    │──────▶│ haccp_plans  │────▶│ haccp_ccps          │
     │ (03-TECH)    │       │ (P1 basic)   │     │ (limits min/max)    │
     └──────────────┘       └──────────────┘     └──────────┬──────────┘
                                                             │
                                                             │ monitor
                                                             ▼
                                                   ┌─────────────────────┐
                                                   │haccp_monitoring_    │
                                                   │ records             │
                                                   │(pass/fail + value)  │
                                                   └─────────────────────┘

     ┌────────────────────────────┐       ┌─────────────────────────────┐
     │ allergen_changeover_gate   │──────▶│allergen_changeover_         │
     │ (08-PROD E7 DSL rule)      │       │ validations (08-PROD §9.8)  │
     └────────────────────────────┘       └──────────────┬──────────────┘
                                                          │ 09-QA
                                                          │ reads for
                                                          │ dual sign
                                                          ▼
                                                ┌────────────────────┐
                                                │ ATP lab_results    │
                                                │ ≤10 RLU threshold  │
                                                └────────────────────┘
```

### 6.3 Key table summaries

**`quality_holds`** — central hold registry:

```sql
CREATE TABLE quality_holds (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  org_id UUID NOT NULL,
  site_id UUID,
  hold_number TEXT GENERATED ALWAYS AS ('HLD-' || LPAD(hold_seq::text, 8, '0')) STORED UNIQUE,
  hold_seq BIGINT NOT NULL DEFAULT nextval('quality_hold_seq'),
  reference_type TEXT NOT NULL CHECK (reference_type IN ('lp','batch','wo','po','grn')),
  reference_id UUID NOT NULL,
  reason_code_id UUID REFERENCES reference_tables_rows(id), -- from 02-SETTINGS quality_hold_reasons
  reason_free_text TEXT,
  priority TEXT NOT NULL CHECK (priority IN ('low','medium','high','critical')),
  disposition TEXT CHECK (disposition IN ('pending','rework','scrap','release_as_is','return_supplier','other')),
  disposition_notes TEXT,
  default_hold_duration_days INT, -- snapshot from reason at create
  estimated_release_at DATE GENERATED ALWAYS AS (created_at::date + (default_hold_duration_days || ' days')::interval) STORED,
  hold_status TEXT NOT NULL DEFAULT 'open' CHECK (hold_status IN ('open','investigating','released','quarantined','escalated')),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  released_by UUID REFERENCES users(id),
  released_at TIMESTAMPTZ,
  release_signature_hash VARCHAR(64),
  release_notes TEXT,
  ext_jsonb JSONB DEFAULT '{}'::jsonb, -- ADR-028 L3 schema-driven
  retention_until DATE GENERATED ALWAYS AS (COALESCE(released_at, created_at + INTERVAL '7 years')::date + INTERVAL '7 years') STORED
);
CREATE INDEX idx_holds_active ON quality_holds(org_id, hold_status) WHERE hold_status IN ('open','investigating','escalated');
CREATE INDEX idx_holds_ref ON quality_holds(org_id, reference_type, reference_id);
```

**`quality_hold_items`** — multi-LP hold (one hold can cover multiple LPs in same batch):

```sql
CREATE TABLE quality_hold_items (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  org_id UUID NOT NULL,
  hold_id UUID NOT NULL REFERENCES quality_holds(id) ON DELETE CASCADE,
  license_plate_id UUID REFERENCES license_plates(id),
  qty_held_kg NUMERIC(18,3),
  qty_released_kg NUMERIC(18,3) DEFAULT 0,
  item_status TEXT NOT NULL DEFAULT 'held' CHECK (item_status IN ('held','released','partial_released','scrapped')),
  notes TEXT,
  UNIQUE(hold_id, license_plate_id)
);
```

**`quality_inspections`** — unified table for incoming/in-process/final:

```sql
CREATE TABLE quality_inspections (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  org_id UUID NOT NULL,
  site_id UUID,
  inspection_number TEXT GENERATED ALWAYS AS ('INS-' || LPAD(inspection_seq::text, 8, '0')) STORED UNIQUE,
  inspection_seq BIGINT NOT NULL DEFAULT nextval('quality_inspection_seq'),
  inspection_type TEXT NOT NULL CHECK (inspection_type IN ('incoming','in_process','final','scanner_quick','allergen_changeover')),
  reference_type TEXT NOT NULL CHECK (reference_type IN ('grn','lp','wo','batch','po_line')),
  reference_id UUID NOT NULL,
  product_id UUID REFERENCES items(id),
  specification_id UUID REFERENCES quality_specifications(id),
  specification_version INT,
  sampling_plan_id UUID REFERENCES sampling_plans(id),
  inspector_id UUID REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','assigned','in_progress','completed','cancelled','hold')),
  result TEXT CHECK (result IN ('pass','fail','conditional','hold')),
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  signed_by UUID REFERENCES users(id),
  signed_at TIMESTAMPTZ,
  signature_hash VARCHAR(64),
  fail_reason_code_id UUID REFERENCES reference_tables_rows(id), -- qa_failure_reasons
  fail_reason_notes TEXT,
  linked_ncr_id UUID REFERENCES ncr_reports(id),
  linked_hold_id UUID REFERENCES quality_holds(id),
  samples_taken INT DEFAULT 0,
  samples_accept INT,
  samples_reject INT,
  ext_jsonb JSONB DEFAULT '{}'::jsonb,
  retention_until DATE GENERATED ALWAYS AS (created_at::date + INTERVAL '7 years') STORED
);
CREATE INDEX idx_insp_pending ON quality_inspections(org_id, status, priority, scheduled_at) WHERE status IN ('pending','assigned');
CREATE INDEX idx_insp_ref ON quality_inspections(org_id, reference_type, reference_id);
```

**`quality_specifications`** — product specs, versioned:

```sql
CREATE TABLE quality_specifications (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  org_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES items(id),
  spec_code TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','under_review','active','expired','superseded')),
  effective_from DATE,
  effective_until DATE,
  applies_to TEXT NOT NULL CHECK (applies_to IN ('incoming','in_process','final','all')),
  reference_documents JSONB DEFAULT '[]'::jsonb,
  allergen_profile JSONB, -- snapshot from 03-TECH at approval
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  approval_signature_hash VARCHAR(64),
  superseded_by UUID REFERENCES quality_specifications(id),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ext_jsonb JSONB DEFAULT '{}'::jsonb,
  UNIQUE(org_id, product_id, spec_code, version)
);

CREATE TABLE quality_spec_parameters (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  org_id UUID NOT NULL,
  specification_id UUID NOT NULL REFERENCES quality_specifications(id) ON DELETE CASCADE,
  parameter_name TEXT NOT NULL,
  parameter_type TEXT NOT NULL CHECK (parameter_type IN ('visual','measurement','attribute','microbiological','chemical','sensory','equipment')),
  target_value NUMERIC,
  min_value NUMERIC,
  max_value NUMERIC,
  unit TEXT,
  test_method TEXT,
  equipment_required TEXT,
  is_critical BOOLEAN DEFAULT false, -- critical = fail blocks batch release
  sort_order INT DEFAULT 0,
  ext_jsonb JSONB DEFAULT '{}'::jsonb,
  CHECK (min_value IS NULL OR max_value IS NULL OR min_value <= max_value)
);
```

**`quality_test_results`** — per-parameter test records:

```sql
CREATE TABLE quality_test_results (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  org_id UUID NOT NULL,
  inspection_id UUID NOT NULL REFERENCES quality_inspections(id) ON DELETE CASCADE,
  parameter_id UUID NOT NULL REFERENCES quality_spec_parameters(id),
  measured_value NUMERIC,
  measured_text TEXT, -- for attribute/visual
  result TEXT NOT NULL CHECK (result IN ('pass','fail','conditional','retest','na')),
  tested_by UUID REFERENCES users(id),
  tested_at TIMESTAMPTZ DEFAULT NOW(),
  equipment_id UUID, -- future FK → 13-MAINTENANCE equipment_calibration
  external_lims_id TEXT, -- LIMS bridge stub P1 (Q4)
  notes TEXT,
  evidence_refs JSONB DEFAULT '[]'::jsonb, -- photo/doc refs P2
  ext_jsonb JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX idx_results_inspection ON quality_test_results(org_id, inspection_id);
```

**`lab_results`** (shared with 03-TECH §10.4, extended for ATP + allergen):

```sql
-- Defined in 03-TECHNICAL-PRD.md §10.4; 09-QUALITY extends for ATP changeover handoff
-- Extended columns (09-QUALITY v3.0 addition):
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS inspection_id UUID REFERENCES quality_inspections(id);
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS allergen_changeover_validation_id UUID REFERENCES allergen_changeover_validations(id);
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS external_lims_id TEXT; -- LIMS bridge stub
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS threshold_min NUMERIC;
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS threshold_max NUMERIC;
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS pass_threshold NUMERIC; -- for ATP ≤ 10 RLU
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS pass_flag BOOLEAN;
-- test_type='allergen_elisa' | 'atp_swab' | 'microbiological' | 'chemical' (existing from 03-TECH)
```

**`ncr_reports`** (basic P1, extended P2):

```sql
CREATE TABLE ncr_reports (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  org_id UUID NOT NULL,
  site_id UUID,
  ncr_number TEXT GENERATED ALWAYS AS ('NCR-' || LPAD(ncr_seq::text, 8, '0')) STORED UNIQUE,
  ncr_seq BIGINT NOT NULL DEFAULT nextval('ncr_seq'),
  ncr_type TEXT NOT NULL DEFAULT 'quality' CHECK (ncr_type IN ('quality','yield_issue','allergen_deviation','supplier','process','complaint_related')),
  severity TEXT NOT NULL CHECK (severity IN ('critical','major','minor')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','investigating','awaiting_capa','closed','reopened','cancelled')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  reference_type TEXT CHECK (reference_type IN ('lp','batch','wo','po','grn','inspection','ccp_deviation','complaint','supplier')),
  reference_id UUID,
  product_id UUID REFERENCES items(id),
  detected_by UUID REFERENCES users(id),
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  detected_location TEXT,
  fail_reason_code_id UUID REFERENCES reference_tables_rows(id),
  affected_qty_kg NUMERIC(18,3),
  -- Phase 2 workflow columns
  assigned_to UUID REFERENCES users(id),
  investigator_id UUID REFERENCES users(id),
  root_cause TEXT,
  root_cause_category TEXT,
  immediate_action TEXT,
  capa_record_id UUID, -- FK to capa_records (P2)
  -- [6.2] Yield issue specific
  target_yield_pct NUMERIC(5,2),
  actual_yield_pct NUMERIC(5,2),
  claim_pct NUMERIC(5,2),
  claim_value_eur NUMERIC(18,2),
  -- Closure
  closed_by UUID REFERENCES users(id),
  closed_at TIMESTAMPTZ,
  closure_signature_hash VARCHAR(64),
  response_due_at TIMESTAMPTZ GENERATED ALWAYS AS (
    detected_at + CASE severity
      WHEN 'critical' THEN INTERVAL '24 hours'
      WHEN 'major'    THEN INTERVAL '48 hours'
      WHEN 'minor'    THEN INTERVAL '7 days'
    END
  ) STORED,
  linked_hold_id UUID REFERENCES quality_holds(id),
  ext_jsonb JSONB DEFAULT '{}'::jsonb,
  retention_until DATE GENERATED ALWAYS AS (created_at::date + INTERVAL '10 years') STORED
);
CREATE INDEX idx_ncr_open ON ncr_reports(org_id, status, severity, response_due_at) WHERE status NOT IN ('closed','cancelled');
CREATE INDEX idx_ncr_ref ON ncr_reports(org_id, reference_type, reference_id);
```

**`haccp_plans`, `haccp_ccps`, `haccp_monitoring_records`** (P1 basic):

```sql
CREATE TABLE haccp_plans (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  org_id UUID NOT NULL,
  plan_code TEXT NOT NULL,
  product_family TEXT, -- from 03-TECH
  product_id UUID REFERENCES items(id),
  version INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','superseded','retired')),
  effective_from DATE,
  reviewed_at DATE,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  ext_jsonb JSONB DEFAULT '{}'::jsonb,
  UNIQUE(org_id, plan_code, version)
);

CREATE TABLE haccp_ccps (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  org_id UUID NOT NULL,
  plan_id UUID NOT NULL REFERENCES haccp_plans(id) ON DELETE CASCADE,
  ccp_code TEXT NOT NULL, -- e.g. CCP-01
  step_name TEXT NOT NULL, -- e.g. "Cooking", "Chilling", "Metal Detection"
  hazard_type TEXT NOT NULL CHECK (hazard_type IN ('biological','chemical','physical','allergen')),
  hazard_description TEXT,
  critical_limit_min NUMERIC,
  critical_limit_max NUMERIC,
  unit TEXT,
  monitoring_frequency TEXT, -- e.g. "every 30min", "every batch", "continuous"
  monitoring_method TEXT,
  deviation_threshold_seconds INT DEFAULT 0, -- seconds outside limits before deviation
  corrective_action_default TEXT,
  verification_method TEXT,
  record_method TEXT,
  active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  UNIQUE(org_id, plan_id, ccp_code)
);

CREATE TABLE haccp_monitoring_records (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  org_id UUID NOT NULL,
  site_id UUID,
  ccp_id UUID NOT NULL REFERENCES haccp_ccps(id),
  wo_id UUID, -- optional link to WO
  lp_id UUID, -- optional
  measured_value NUMERIC,
  measured_text TEXT,
  within_limits BOOLEAN GENERATED ALWAYS AS (
    CASE 
      WHEN measured_value IS NULL THEN NULL
      WHEN (SELECT critical_limit_min FROM haccp_ccps WHERE id = ccp_id) IS NOT NULL 
           AND measured_value < (SELECT critical_limit_min FROM haccp_ccps WHERE id = ccp_id) THEN false
      WHEN (SELECT critical_limit_max FROM haccp_ccps WHERE id = ccp_id) IS NOT NULL 
           AND measured_value > (SELECT critical_limit_max FROM haccp_ccps WHERE id = ccp_id) THEN false
      ELSE true
    END
  ) STORED,
  recorded_by UUID NOT NULL REFERENCES users(id),
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  recorded_via TEXT CHECK (recorded_via IN ('desktop','scanner','iot_sensor')),
  notes TEXT,
  deviation_id UUID, -- FK to haccp_deviations P2
  signed_at TIMESTAMPTZ,
  signature_hash VARCHAR(64),
  ext_jsonb JSONB DEFAULT '{}'::jsonb,
  retention_until DATE GENERATED ALWAYS AS (recorded_at::date + INTERVAL '5 years') STORED
);
CREATE INDEX idx_haccp_mon_ccp ON haccp_monitoring_records(org_id, ccp_id, recorded_at DESC);
CREATE INDEX idx_haccp_mon_violations ON haccp_monitoring_records(org_id, recorded_at DESC) WHERE within_limits = false;
```

**`sampling_plans`, `sampling_records`** (AQL ISO 2859):

```sql
CREATE TABLE sampling_plans (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  org_id UUID NOT NULL,
  plan_code TEXT NOT NULL,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('iso2859','ansi_z14','custom','forza_10th')),
  aql_level NUMERIC, -- e.g. 1.0, 2.5, 4.0
  inspection_level TEXT, -- 'GI','GII','GIII','S-1'..'S-4'
  lot_size_min INT,
  lot_size_max INT,
  sample_size INT NOT NULL,
  accept_number INT NOT NULL,
  reject_number INT NOT NULL,
  applies_to TEXT CHECK (applies_to IN ('incoming','in_process','final','all')),
  active BOOLEAN DEFAULT true,
  UNIQUE(org_id, plan_code)
);

CREATE TABLE sampling_records (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  org_id UUID NOT NULL,
  inspection_id UUID NOT NULL REFERENCES quality_inspections(id) ON DELETE CASCADE,
  sampling_plan_id UUID NOT NULL REFERENCES sampling_plans(id),
  lot_size INT NOT NULL,
  sample_size INT NOT NULL,
  defects_found INT DEFAULT 0,
  accept_reject TEXT CHECK (accept_reject IN ('accept','reject','pending')),
  sample_locations JSONB -- {"zones": ["pallet-1","pallet-3","pallet-7"]}
);
```

**`quality_incidents`** (accidents/near-miss [6.3], standalone):

```sql
CREATE TABLE quality_incidents (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  org_id UUID NOT NULL,
  site_id UUID,
  incident_number TEXT GENERATED ALWAYS AS ('INC-' || LPAD(incident_seq::text, 8, '0')) STORED UNIQUE,
  incident_seq BIGINT NOT NULL DEFAULT nextval('quality_incident_seq'),
  incident_type TEXT NOT NULL CHECK (incident_type IN ('accident','near_miss','unsafe_condition','food_safety_incident')),
  severity TEXT NOT NULL CHECK (severity IN ('critical','major','minor','observation')),
  location TEXT,
  description TEXT NOT NULL,
  corrective_action TEXT,
  reported_by UUID NOT NULL REFERENCES users(id),
  incident_date TIMESTAMPTZ NOT NULL,
  reported_at TIMESTAMPTZ DEFAULT NOW(),
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  root_cause_investigation_id UUID, -- optional link to NCR if escalated
  linked_ncr_id UUID REFERENCES ncr_reports(id),
  ext_jsonb JSONB DEFAULT '{}'::jsonb,
  retention_until DATE GENERATED ALWAYS AS (incident_date::date + INTERVAL '10 years') STORED
);
```

**`quality_complaints`** (stub P1, full P2):

```sql
CREATE TABLE quality_complaints (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  org_id UUID NOT NULL,
  site_id UUID,
  complaint_number TEXT GENERATED ALWAYS AS ('CMP-' || LPAD(complaint_seq::text, 8, '0')) STORED UNIQUE,
  complaint_seq BIGINT NOT NULL DEFAULT nextval('quality_complaint_seq'),
  received_at DATE NOT NULL,
  received_via TEXT CHECK (received_via IN ('email','phone','portal','retailer_system','other')),
  customer_ref TEXT, -- free text until 11-SHIPPING fleshes customers
  product_batch_id UUID, -- FK license_plates or wo_outputs
  product_id UUID REFERENCES items(id),
  severity TEXT CHECK (severity IN ('critical','major','minor','info')),
  description TEXT NOT NULL,
  complaint_category TEXT, -- hardcoded P1, reference P2
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','under_review','investigating','resolved','closed','rejected')),
  root_cause_investigation_id UUID,
  linked_ncr_id UUID REFERENCES ncr_reports(id),
  response_due_at DATE,
  resolution_notes TEXT,
  received_by UUID REFERENCES users(id),
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  ext_jsonb JSONB DEFAULT '{}'::jsonb,
  retention_until DATE GENERATED ALWAYS AS (received_at + INTERVAL '7 years') STORED
);
CREATE INDEX idx_complaint_open ON quality_complaints(org_id, status, response_due_at) WHERE status NOT IN ('resolved','closed','rejected');
-- P1 = stub (CRUD + link to NCR); P2 EPIC 8M full RCA/CAPA linked workflow + complaint dashboard
```

**`quality_status_types`** (seeded 7 statuses):

```sql
CREATE TABLE quality_status_types (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  allows_shipment BOOLEAN DEFAULT false,
  allows_consumption BOOLEAN DEFAULT false,
  description TEXT
);
-- Seeded:
INSERT INTO quality_status_types VALUES
 ('PENDING','Pending inspection',false,false,'Incoming GRN default'),
 ('PASSED','Inspection passed',true,true,'Meets spec'),
 ('FAILED','Inspection failed',false,false,'Does not meet spec'),
 ('HOLD','QA hold',false,false,'Investigation required'),
 ('RELEASED','Released from hold',true,true,'Post-investigation approved'),
 ('QUARANTINED','Quarantined',false,false,'Isolated pending review'),
 ('COND_APPROVED','Conditional approval',true,true,'Restricted use; see notes');
-- Note: LP post-production default 'AVAILABLE' managed in 05-WH §6.1 (NOT PENDING per D2)
```

---

## §7. Epics & Build Sequence

### 7.1 P1 Epics (5 epics, 5 sub-modules 09-a..e, 18-22 sesji impl est.)

#### **EPIC 8A — QA Hold/Release & Status** (sub-module 09-a)

**Scope:**
- `quality_holds` + `quality_hold_items` CRUD, hold creation wizard (LP/batch/WO/PO target)
- `quality_status_types` seeded (7 statuses per D3); transition enforcement via `qa_status_state_machine_v1` DSL rule
- LP qa_status write API (consumed by 05-WH) — `PUT /api/warehouse/lps/:id/qa-status` (05-WH owned, 09-QA client)
- Hold aging queue, priority-sorted, estimated_release_at calc from `default_hold_duration_days`
- Hold release with e-signature + release notes + audit log
- [6.1] QC Hold linked to production batch — `reference_type='wo'` first-class support
- Hold reason taxonomy (Q3: structured) → reference table `quality_hold_reasons` in 02-SETTINGS §8
- Multi-LP hold: one hold, many LPs via `quality_hold_items`

**Backend stories:**
- 09-a-01 Setup tables, migrations, RLS policies (2 sesje)
- 09-a-02 Hold CRUD + release API + e-signature flow (3 sesje)
- 09-a-03 Status transition engine + `qa_status_state_machine_v1` DSL rule registration (2 sesje)
- 09-a-04 Reference table binding `quality_hold_reasons` CRUD in 02-SETTINGS §8 (1 sesja)

**Frontend stories:**
- 09-a-05 QA-001 Dashboard widgets (active holds, hold aging) (1 sesja)
- 09-a-06 QA-010 Hold list + filters + create modal (2 sesje)
- 09-a-07 QA-011 Hold detail + release workflow (1 sesja)

**FR coverage:** FR-QA-001 Status Mgmt, FR-QA-002 Hold Mgmt, FR-QA-025 (partial, scanner hold entry via SCN-071).

**Effort:** 10-12 sesji.

---

#### **EPIC 8B — Specifications & Test Parameters** (sub-module 09-b)

**Scope:**
- `quality_specifications` versioned (draft → under_review → active → expired/superseded)
- `quality_spec_parameters` per-product, parameter types, critical flag, test method
- Approval workflow with e-signature (`approval_signature_hash`)
- Spec cloning (version increment)
- Allergen profile snapshot at approval (captured from 03-TECH §10 at activation time)

**Backend:**
- 09-b-01 Tables + migrations + RLS (1 sesja)
- 09-b-02 Spec CRUD + versioning + approval flow (3 sesje)
- 09-b-03 Parameter CRUD + validation (min ≤ target ≤ max, unit normalization) (1 sesja)

**Frontend:**
- 09-b-04 QA-020 Specifications list + filters (1 sesja)
- 09-b-05 QA-021 Spec wizard (3-step: header → parameters → review) (2 sesje)

**FR:** FR-QA-003, FR-QA-004 (templates).

**Effort:** 6-8 sesji.

---

#### **EPIC 8C — Incoming Inspection & Test Results** (sub-module 09-c)

**Scope:**
- `quality_inspections` unified table (incoming primary P1, in_process/final reserved P2)
- `quality_test_results` per-parameter; auto-compute pass/fail based on spec min/max/target
- Auto-create inspection on GRN receipt (trigger via outbox event from 05-WH `grn.created`)
- Sampling plan binding (AQL ISO 2859 via `sampling_plans` + `sampling_records`)
- Scanner quick inspection handoff (SCN-071..073 from 06-SCN §8.5)
- NCR auto-draft on inspection FAIL (FR-QA-009)
- Inspection queue priority sort + assignment
- `lab_results` extended join (external_lims_id stub P1)

**Backend:**
- 09-c-01 Tables + migrations + RLS (1 sesja)
- 09-c-02 Inspection CRUD + assign/start/complete/cancel API (3 sesje)
- 09-c-03 Test results recording + auto-compute + spec compare (2 sesje)
- 09-c-04 Scanner APIs (`POST /api/quality/scanner/inspect` per 06-SCN FR-SC-BE-054) (2 sesje)
- 09-c-05 Auto-create on GRN outbox consumer + sampling plan selector (2 sesje)
- 09-c-06 Sampling plans CRUD + AQL table seeding (1 sesja)

**Frontend:**
- 09-c-07 QA-030 Inspection queue + filters + scanner entry (2 sesje)
- 09-c-08 QA-031 Inspection detail + result form (2 sesje)
- 09-c-09 Sampling plan config page (QA-022) (1 sesja)

**FR:** FR-QA-005, FR-QA-004 (recording), FR-QA-008 (sampling), FR-QA-025 (scanner).

**Effort:** 14-16 sesji.

---

#### **EPIC 8D — Basic NCR** (sub-module 09-d)

**Scope:**
- `ncr_reports` core table (draft → open); severity + response_due_at auto-compute
- Manual NCR creation from inspection fail, CCP deviation, complaint, hold, free-form
- [6.2] Yield issue extension: `ncr_type='yield_issue'` + yield fields
- NCR basic status: draft/open/investigating/closed; full workflow P2 EPIC 8G
- Link to hold, inspection, CCP deviation (reference_type + reference_id pattern)
- Scanner NCR creation flow (SCN-072 failure reason → NCR draft)

**Backend:**
- 09-d-01 Tables + migrations + RLS + seq generator (1 sesja)
- 09-d-02 NCR CRUD + assign + submit + close basic (2 sesje)
- 09-d-03 Response due calc + notification stub (out-of-band) (1 sesja)

**Frontend:**
- 09-d-04 QA-040 NCR list + filters + severity badges (1 sesja)
- 09-d-05 QA-041 NCR form (create) + yield_issue variant (1 sesja)

**FR:** FR-QA-009 (basic creation).

**Effort:** 5-6 sesji.

---

#### **EPIC 8E — Basic HACCP + CCP Rule Engine** (sub-module 09-e)

**Scope:**
- `haccp_plans` + `haccp_ccps` + `haccp_monitoring_records` P1 basic
- CCP definition UI: step, hazard, min/max limits, frequency, method
- Monitoring record entry (desktop + scanner): value → auto within_limits check
- DSL rule `ccp_deviation_escalation_v1` — IF `within_limits=false` FOR threshold_seconds → auto NCR draft + notify hygiene_lead
- P1 manual entry only (Q1 decision: rule-engine-ready, IoT → P2)
- Quality incidents table `quality_incidents` (standalone, accident/near-miss)
- Quality complaints stub `quality_complaints` (basic CRUD + NCR link)

**Backend:**
- 09-e-01 Tables + migrations + RLS (haccp_* + incidents + complaints) (2 sesje)
- 09-e-02 HACCP CRUD + CCP definition + monitoring record API (2 sesje)
- 09-e-03 `ccp_deviation_escalation_v1` DSL rule reg + engine integration (1 sesja)
- 09-e-04 Complaints + incidents CRUD P1 stub (1 sesja)

**Frontend:**
- 09-e-05 QA-050 HACCP board (plans + CCPs view) (1 sesja)
- 09-e-06 QA-051 CCP monitoring entry form (desktop primary, scanner secondary) (1 sesja)
- 09-e-07 QA-052 Complaint form + incident report P1 basic (1 sesja)

**FR:** FR-QA-013 (HACCP setup basic), FR-QA-014 (CCP monitoring basic).

**Effort:** 8-10 sesji.

---

### 7.2 P2 Epics overview (8F..8L, ~14-20 sesji impl)

| Epic | Scope | Est. effort |
|---|---|---|
| **8F** In-Process + Final Inspection + Batch Release Gate | `batch_release_gate_v1` DSL rule, FR-QA-006/007/010 | 10-14 sesji |
| **8G** Full NCR Workflow + CAPA | ncr_workflow, capa_records/actions/effectiveness, 6.2 full yield claim | 14-20 sesji |
| **8H** Operation Quality Checkpoints | operation_quality_checkpoints, operation_checkpoint_results, FR-QA-026 | 6-8 sesji |
| **8I** HACCP Advanced + CCP IoT | haccp_deviations, haccp_verification_records, IoT ingestion, calibration link | 14-18 sesji |
| **8J** CoA Management | certificates_of_analysis, coa_templates, coa_parameters, PDF/A e-sign | 8-10 sesji |
| **8K** Supplier Quality | supplier_quality_ratings, audits, findings, supplier NCRs | 8-10 sesji |
| **8L** Dashboard + Analytics + Retention + Docs | dashboards, audit export, retention_samples, quality_document_versions | 12-16 sesji |

**Total P2 est.:** 72-96 sesji (full 09-QUALITY feature set P1+P2 → ~90-120 sesji impl, spread across 2-3 sprints).

### 7.3 Build unlock dependencies

```
Phase order (P1):
┌───────────────────┐
│ 02-SETTINGS       │ (rules registry + reference tables)
│ 03-TECHNICAL      │ (items + specs + allergen cascade)  ──┐
│ 05-WAREHOUSE      │ (license_plates + qa_status col)    ──┼──▶ 09-a Hold/Release
│ 06-SCANNER-P1     │ (SCN-070..073 contract)             ──┘
└───────────────────┘
                     ──▶ 09-b Specs (blocks on 03-TECH items)
                     ──▶ 09-c Incoming (blocks on 09-a + 09-b + 05-WH GRN)
                     ──▶ 09-d NCR Basic (blocks on 09-a)
                     ──▶ 09-e HACCP Basic (blocks on 03-TECH + 02-SETTINGS rule)

Phase order (P2):
  09-e → 8I HACCP Advanced (consume IoT events from 13-MAINT equipment_calibration)
  09-d → 8G NCR Workflow + CAPA (consume hold/CCP deviation outputs)
  08-PROD close → 8F Batch Release (WO close → final inspection queue)
  11-SHIPPING start → 8J CoA (batch release → customer ship doc)
```

---

## §8. UX Screens

### 8.1 Screen inventory

**Desktop (QA-series):**

| Code | Title | Primary role | P1/P2 |
|---|---|---|---|
| QA-001 | Quality Dashboard | quality_lead, quality_director | P1 basic, P2 rich |
| QA-010 | Holds list + filters | all QA roles | P1 |
| QA-011 | Hold detail + release | quality_lead | P1 |
| QA-012 | Hold create modal | all QA roles | P1 |
| QA-020 | Specifications list | quality_lead | P1 |
| QA-021 | Spec wizard (3-step) | quality_lead | P1 |
| QA-022 | Sampling plans config | quality_lead, admin | P1 |
| QA-030 | Inspection queue | qa_inspector | P1 |
| QA-031 | Inspection detail | qa_inspector | P1 |
| QA-032 | Inspection results form | qa_inspector | P1 |
| QA-040 | NCR list + filters | quality_lead | P1 |
| QA-041 | NCR form (create/edit) | quality_lead | P1 |
| QA-042 | NCR detail + workflow | quality_lead | P2 |
| QA-050 | HACCP plans board | quality_lead, hygiene_lead | P1 basic |
| QA-051 | CCP monitoring entry | hygiene_lead, operator | P1 |
| QA-052 | Complaint + Incident form | quality_lead | P1 stub |
| QA-060 | Lab Results browser (ATP, allergen, etc.) | quality_lead | P1 read-only |
| QA-070 | Allergen Changeover gate evidence view | quality_lead, hygiene_lead | P1 consumer view |

**Scanner (SCN handoff from 06-SCANNER §8.5):**

| Code | Flow | 09-QA backend |
|---|---|---|
| SCN-070 | QA Inspect entry (pending list) | `GET /api/quality/scanner/pending` |
| SCN-071 | QA Inspect (scan LP, 3 buttons) | `POST /api/quality/scanner/inspect` |
| SCN-072 | QA Fail reason (7 reasons + notes) | writes `quality_inspections.fail_reason_code_id`, auto-creates ncr_reports |
| SCN-073 | QA Done (success/fail/hold screen) | returns inspection_id + ncr_ref if created |
| SCN-081 | Changeover gate dual sign (allergen) | `POST /api/quality/allergen-changeover/sign` — writes to `allergen_changeover_validations.first_signed_by`/`second_signed_by` |

### 8.2 Key screen specs (P1)

#### QA-001 — Quality Dashboard

**Layout:** 3x2 grid widgets + top toolbar (date range filter, site filter).

**Widgets (P1):**
1. **Active Holds** (count + aging distribution chart, click → QA-010)
2. **Inspection Backlog** (pending count + SLA urgency — red ≤1d / amber 1-3d / blue normal, click → QA-030)
3. **Open NCRs by Severity** (critical/major/minor count, click → QA-040)
4. **CCP Compliance Today** (green %/red deviations count, click → QA-050)
5. **First-Time Pass Rate** (30-day trend line, target ≥95%)
6. **Allergen Changeover Gates** (today's gates + pass rate, click → QA-070)

**Refresh:** auto every 60s + manual refresh button.

#### QA-010 — Holds list

**Columns:** Hold# | Type | Reference | Reason | Priority badge | Status | Days held | Estimated release | Actions.
**Filters:** status (active/all), priority (low→critical), reason, reference_type, date range.
**Actions per row:** View detail (→ QA-011), Quick release (if role allows), Download audit (PDF).
**Empty state:** "No active holds — click Create Hold to report an issue."
**Create button:** opens QA-012 modal.

#### QA-012 — Hold create modal

**Fields (in order):**
1. Hold target: radio LP/batch/WO/PO/GRN, then search input
2. Reason: dropdown z reference_tables_rows `quality_hold_reasons` grouped by category
3. Free text note (optional, required if reason="other")
4. Priority: 4 buttons (low/med/high/critical) with color + default from reason
5. Disposition: radio pending/rework/scrap/release_as_is/return_supplier/other (optional P1, mandatory at release)
6. Estimated release date (auto-calc from reason.default_hold_duration_days, editable)

**Submit:** creates `quality_holds` + `quality_hold_items` (if multiple LPs), writes `license_plates.qa_status='HOLD'` via 05-WH API, outbox event `quality.hold.created`, audit log entry. Returns hold_number.

#### QA-030 — Inspection queue

**Top toolbar:** filter by type (all/incoming/scanner_quick/allergen_changeover), status (pending/assigned/in_progress), priority, inspector, date range.
**Main list:** Inspection# | Type | Reference | Product | Priority badge | Status | Assigned | Scheduled | Action.
**Row click:** → QA-031 detail.
**Urgent alert strip** at top: "3 inspections overdue — expand".

#### QA-031 — Inspection detail

**Top card:** inspection#, status, type, reference link (→ 05-WH LP page / WO page), product + image, inspector, scheduled_at.
**Parameters table:** fetched from spec_parameters, columns: name | type | target (min-max) unit | measured value input | result (auto) | notes.
**Auto-compute result:** per parameter + overall (pass if all pass + critical all pass; fail if any critical fail; conditional if non-critical fail).
**Actions bottom bar:** Save draft | Submit | Cancel inspection (reason dialog) | Create hold (if fail — prefills QA-012).
**Sign button:** e-sign dialog PIN prompt → hash computed → locked.

#### QA-050 — HACCP plans board

**Left sidebar:** tree of plans grouped by product_family → plans → CCPs; expandable.
**Main canvas:** selected CCP detail card: step, hazard, limits, frequency, method; latest 10 monitoring records chart (green/red bar).
**Actions:** Add CCP reading (→ QA-051 modal), Edit CCP (quality_lead only), Print HACCP plan PDF (P2).

#### QA-051 — CCP monitoring entry

**Workflow:** Select CCP (dropdown grouped by plan) → reading value input → auto-validate against min/max → pass (green) / fail (red with "Create deviation" button) / notes.
**Submit:** creates `haccp_monitoring_records`, if within_limits=false → triggers `ccp_deviation_escalation_v1` rule → auto-draft NCR if deviation_threshold_seconds exceeded.
**Signature:** PIN sign → hash stored.

#### QA-070 — Allergen Changeover gate evidence

**Read-only consumer view** — primary owner = 08-PROD §7 E7.

**Layout:** Filter by date range, line, allergen delta. List of gates with:
- Gate ID | WO from → to | Allergen delta | Risk level | Cleaning complete? | ATP result (RLU) | First signer | Second signer | Status (pending/approved/rejected).
- Click row → side panel with all evidence: cleaning checklist, ATP lab_result row, signature history, audit trail.

**Actions (quality_lead):**
- Second-sign pending gate (dual sign flow from 08-PROD E7)
- Override (if authority per Q6 from 08-PROD; requires override reason + e-sign)

---

## §9. DB Schema — Detailed

### 9.1 Full DDL (P1 subset — compact form)

See §6.3 for main tables. Additional indexes + triggers:

```sql
-- Sequences
CREATE SEQUENCE IF NOT EXISTS quality_hold_seq START 1000;
CREATE SEQUENCE IF NOT EXISTS quality_inspection_seq START 1000;
CREATE SEQUENCE IF NOT EXISTS ncr_seq START 1000;
CREATE SEQUENCE IF NOT EXISTS quality_incident_seq START 1000;
CREATE SEQUENCE IF NOT EXISTS quality_complaint_seq START 1000;

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_qa_spec_active ON quality_specifications(org_id, product_id, status) WHERE status='active';
CREATE INDEX IF NOT EXISTS idx_test_results_param ON quality_test_results(org_id, parameter_id, tested_at DESC);
CREATE INDEX IF NOT EXISTS idx_sampling_plan_lot ON sampling_plans(org_id, plan_type, lot_size_min, lot_size_max) WHERE active;

-- RLS policies (pattern applied to all quality tables):
ALTER TABLE quality_holds ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON quality_holds
  USING (org_id = current_setting('app.current_org_id')::UUID);
CREATE POLICY tenant_isolation_insert ON quality_holds FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org_id')::UUID);
-- repeat for: quality_hold_items, quality_inspections, quality_test_results,
-- quality_specifications, quality_spec_parameters, ncr_reports, 
-- haccp_plans, haccp_ccps, haccp_monitoring_records, sampling_plans, sampling_records,
-- quality_incidents, quality_complaints

-- Immutability triggers on signed records:
CREATE OR REPLACE FUNCTION raise_immutable_error() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Signed record cannot be modified (21 CFR Part 11)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_inspection_signed_update
  BEFORE UPDATE ON quality_inspections
  FOR EACH ROW
  WHEN (OLD.signed_at IS NOT NULL AND NEW.signed_at = OLD.signed_at)
  EXECUTE FUNCTION raise_immutable_error();

CREATE TRIGGER prevent_spec_signed_update
  BEFORE UPDATE ON quality_specifications
  FOR EACH ROW
  WHEN (OLD.approved_at IS NOT NULL AND OLD.status = 'active')
  EXECUTE FUNCTION raise_immutable_error();

-- Hold transitions audit trigger:
CREATE OR REPLACE FUNCTION audit_hold_change() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO quality_audit_log (org_id, table_name, record_id, operation, old_data, new_data,
    changed_fields, user_id, change_reason, occurred_at)
  VALUES (
    NEW.org_id, 'quality_holds', NEW.id, TG_OP,
    to_jsonb(OLD), to_jsonb(NEW),
    (SELECT array_agg(key) FROM jsonb_each(to_jsonb(NEW)) WHERE to_jsonb(NEW)->key IS DISTINCT FROM to_jsonb(OLD)->key),
    current_setting('app.current_user_id')::UUID,
    current_setting('app.change_reason', true),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_hold_insert AFTER INSERT ON quality_holds FOR EACH ROW EXECUTE FUNCTION audit_hold_change();
CREATE TRIGGER audit_hold_update AFTER UPDATE ON quality_holds FOR EACH ROW EXECUTE FUNCTION audit_hold_change();
-- repeat for: ncr_reports, haccp_monitoring_records, quality_inspections, quality_specifications
```

### 9.2 Views for common queries

```sql
-- Active holds dashboard view:
CREATE OR REPLACE VIEW v_active_holds AS
SELECT
  h.id, h.org_id, h.hold_number, h.reference_type, h.reference_id,
  h.priority, h.hold_status, h.created_at,
  NOW() - h.created_at AS age,
  h.estimated_release_at, h.reason_free_text,
  rt.row_data->>'name' AS reason_label,
  u.display_name AS created_by_name,
  COUNT(hi.id) AS lp_count,
  SUM(hi.qty_held_kg) AS total_held_kg
FROM quality_holds h
LEFT JOIN reference_tables_rows rt ON rt.id = h.reason_code_id
LEFT JOIN users u ON u.id = h.created_by
LEFT JOIN quality_hold_items hi ON hi.hold_id = h.id
WHERE h.hold_status IN ('open','investigating','escalated')
GROUP BY h.id, rt.row_data, u.display_name;

-- Inspection backlog view:
CREATE OR REPLACE VIEW v_inspection_backlog AS
SELECT
  i.id, i.org_id, i.inspection_number, i.inspection_type, i.priority, i.status,
  i.scheduled_at, i.reference_type, i.reference_id,
  prod.name AS product_name, prod.code AS product_code,
  insp.display_name AS inspector_name,
  CASE 
    WHEN i.scheduled_at < NOW() THEN 'overdue'
    WHEN i.scheduled_at < NOW() + INTERVAL '1 day' THEN 'urgent'
    ELSE 'normal'
  END AS urgency
FROM quality_inspections i
LEFT JOIN items prod ON prod.id = i.product_id
LEFT JOIN users insp ON insp.id = i.inspector_id
WHERE i.status IN ('pending','assigned','in_progress');

-- NCR aging view:
CREATE OR REPLACE VIEW v_ncr_aging AS
SELECT
  n.id, n.org_id, n.ncr_number, n.severity, n.status, n.title,
  n.detected_at, n.response_due_at,
  CASE 
    WHEN n.status IN ('closed','cancelled') THEN 'resolved'
    WHEN n.response_due_at < NOW() THEN 'overdue'
    WHEN n.response_due_at < NOW() + INTERVAL '4 hours' THEN 'urgent'
    ELSE 'normal'
  END AS urgency,
  NOW() - n.detected_at AS age
FROM ncr_reports n;
```

### 9.3 Materialized view — Quality KPIs (refresh every 15min)

```sql
CREATE MATERIALIZED VIEW mv_quality_kpis_daily AS
SELECT
  org_id,
  date_trunc('day', created_at)::date AS kpi_date,
  COUNT(*) FILTER (WHERE table_src='holds') AS holds_created,
  COUNT(*) FILTER (WHERE table_src='holds' AND released_at IS NOT NULL) AS holds_released,
  AVG(EXTRACT(EPOCH FROM (released_at - created_at))/3600) FILTER (WHERE table_src='holds' AND released_at IS NOT NULL) AS avg_hold_resolution_hours,
  COUNT(*) FILTER (WHERE table_src='inspections' AND result='pass') AS inspections_pass,
  COUNT(*) FILTER (WHERE table_src='inspections' AND result='fail') AS inspections_fail,
  COUNT(*) FILTER (WHERE table_src='ncr' AND severity='critical') AS critical_ncrs,
  COUNT(*) FILTER (WHERE table_src='ccp' AND within_limits=false) AS ccp_deviations
FROM (
  SELECT org_id, created_at, released_at, NULL::text AS result, NULL::text AS severity, NULL::boolean AS within_limits, 'holds' AS table_src FROM quality_holds
  UNION ALL
  SELECT org_id, created_at, NULL, result, NULL, NULL, 'inspections' FROM quality_inspections
  UNION ALL
  SELECT org_id, created_at, NULL, NULL, severity, NULL, 'ncr' FROM ncr_reports
  UNION ALL
  SELECT org_id, recorded_at, NULL, NULL, NULL, within_limits, 'ccp' FROM haccp_monitoring_records
) all_events
GROUP BY org_id, date_trunc('day', created_at)::date;

CREATE UNIQUE INDEX idx_mv_quality_kpis ON mv_quality_kpis_daily(org_id, kpi_date);
-- Refresh cron every 15min (via pg_cron or app scheduler)
```

---

## §10. DSL Rules (02-SETTINGS §7 Registry)

### 10.1 Rules registered by 09-QUALITY v3.0 (3 new)

| # | Rule code | Type | Trigger | Purpose |
|---|---|---|---|---|
| 1 | `qa_status_state_machine_v1` | workflow | LP qa_status change | Enforce 7-status transitions per D3; block invalid transitions |
| 2 | `ccp_deviation_escalation_v1` | gate | HACCP monitoring record insert/update | IF `within_limits=false` FOR threshold_seconds → auto-create NCR draft + notify hygiene_lead |
| 3 | `batch_release_gate_v1` (P2) | gate | WO close attempt (EPIC 8F) | Check all inspections=pass + no open holds + CCPs within limits + no critical NCRs open → allow release else block |

### 10.2 Rule definitions (JSON — stored in `rule_definitions`)

**`qa_status_state_machine_v1`:**

```json
{
  "rule_code": "qa_status_state_machine_v1",
  "rule_type": "workflow",
  "version": 1,
  "tier": "L1",
  "definition": {
    "states": ["PENDING","PASSED","FAILED","HOLD","RELEASED","QUARANTINED","COND_APPROVED"],
    "initial": "PENDING",
    "transitions": [
      {"from": "PENDING", "to": "PASSED", "requires_role": ["qa_inspector","quality_lead"], "requires_evidence": "inspection_id"},
      {"from": "PENDING", "to": "FAILED", "requires_role": ["qa_inspector","quality_lead"], "requires_evidence": "inspection_id + fail_reason"},
      {"from": "PENDING", "to": "HOLD", "requires_role": ["qa_inspector","quality_lead","shift_lead","hygiene_lead"]},
      {"from": "PASSED", "to": "HOLD", "requires_role": ["quality_lead","qa_inspector"], "note": "post-release concern"},
      {"from": "FAILED", "to": "HOLD", "requires_role": ["quality_lead"]},
      {"from": "HOLD", "to": "RELEASED", "requires_role": ["quality_lead"], "requires_signature": true, "requires_evidence": "release_notes"},
      {"from": "HOLD", "to": "QUARANTINED", "requires_role": ["quality_lead"], "requires_evidence": "disposition"},
      {"from": "HOLD", "to": "COND_APPROVED", "requires_role": ["quality_lead"], "requires_signature": true, "requires_evidence": "conditions"},
      {"from": "QUARANTINED", "to": "HOLD", "requires_role": ["quality_lead"], "note": "re-investigate"},
      {"from": "QUARANTINED", "to": "RELEASED", "requires_role": ["quality_lead","prod_manager"], "requires_dual_sign": true},
      {"from": "COND_APPROVED", "to": "PASSED", "requires_role": ["quality_lead"]},
      {"from": "COND_APPROVED", "to": "HOLD", "requires_role": ["quality_lead"]}
    ],
    "terminal_states": [],
    "audit_all_transitions": true
  },
  "error_message_template": "Transition from {{from}} to {{to}} not allowed for role {{role}}"
}
```

**`ccp_deviation_escalation_v1`:**

```json
{
  "rule_code": "ccp_deviation_escalation_v1",
  "rule_type": "gate",
  "version": 1,
  "tier": "L1",
  "trigger": "haccp_monitoring_records.after_insert_or_update",
  "definition": {
    "condition": {
      "type": "and",
      "checks": [
        {"field": "within_limits", "op": "=", "value": false},
        {"field": "ccp.deviation_threshold_seconds", "op": "<=", "value": "seconds_since_last_in_limits_reading"}
      ]
    },
    "actions": [
      {
        "type": "auto_create_ncr",
        "severity_map": {
          "ccp.hazard_type=biological OR ccp.hazard_type=allergen": "critical",
          "ccp.hazard_type=chemical": "major",
          "ccp.hazard_type=physical": "major",
          "default": "minor"
        },
        "ncr_type": "process",
        "reference_type": "ccp_deviation",
        "reference_id": "haccp_monitoring_records.id",
        "title_template": "CCP Deviation: {{ccp.step_name}} - {{ccp.hazard_type}}",
        "description_template": "Measured {{measured_value}} {{ccp.unit}} outside limits [{{ccp.critical_limit_min}}..{{ccp.critical_limit_max}}] at {{recorded_at}}"
      },
      {
        "type": "notify",
        "roles": ["hygiene_lead","quality_lead","prod_manager"],
        "channels": ["in_app","email_if_critical"]
      },
      {
        "type": "auto_hold",
        "target": "wo_id",
        "priority": "critical",
        "reason": "ccp_deviation_escalation",
        "if_condition": "severity=critical"
      }
    ]
  }
}
```

**`batch_release_gate_v1` (P2 — draft registered in P1 for roadmap visibility):**

```json
{
  "rule_code": "batch_release_gate_v1",
  "rule_type": "gate",
  "version": 1,
  "tier": "L1",
  "trigger": "wo_state_machine.before_transition(to=closed)",
  "definition": {
    "evaluate": [
      {"check": "all_inspections_pass", "scope": "inspection.reference_id=wo.id AND type IN (in_process,final)"},
      {"check": "no_open_holds", "scope": "quality_holds.reference_type=wo AND reference_id=wo.id AND status IN (open,investigating)"},
      {"check": "all_ccps_within_limits", "scope": "haccp_monitoring_records.wo_id=wo.id AND within_limits=false", "must_be_empty": true},
      {"check": "no_critical_ncrs_open", "scope": "ncr_reports.reference_type=wo AND reference_id=wo.id AND severity=critical AND status NOT IN (closed,cancelled)", "must_be_empty": true},
      {"check": "allergen_changeover_validated_if_claimed", "scope": "if wo.allergen_free_claims NOT EMPTY then allergen_changeover_validations.status=approved"}
    ],
    "on_pass": {"allow_transition": true, "mark": "batch_release_approved"},
    "on_fail": {"block_transition": true, "reason_detail_from_check": true, "notify": ["quality_lead","prod_manager"]}
  }
}
```

### 10.3 Consumer of existing rules

09-QUALITY v3.0 does NOT redefine existing rules but consumes:

| Rule (owner) | Consumption pattern |
|---|---|
| `allergen_changeover_gate_v1` (08-PROD E7) | Reads `allergen_changeover_validations` to display in QA-070; writes `first_signed_by`/`second_signed_by`/`second_signature_hash` via dual-sign flow |
| `allergen_cascade_rm_to_fa` (03-TECH §10.2) | Reads product allergen profile for spec_parameters & inspection scope determination |
| `wo_state_machine_v1` (08-PROD E1) | `batch_release_gate_v1` (P2) hooks into `before_transition(to=closed)` |
| `closed_production_strict_v1` (08-PROD) | Complementary — 08-PROD enforces WO close prerequisites; 09-QA enforces QA-specific prerequisites layered on top |

### 10.4 Rule testing & rollback

Per 02-SETTINGS §7.4 Registry read-only pattern:
- Dev authors PR with new rule JSON migration
- CI runs `rule-simulator` against historical events (last 90d) → must show no false positives vs current behavior
- Deploy as migration — rule active on effective_from date
- Admin UI shows deployed rules + last 30d eval history (read-only, no edit)
- Rollback = new migration reverting to prior version (e.g. `qa_status_state_machine_v1.1` fix)

---

## §11. Validations (V-QA-*)

### 11.1 Hold validations (V-QA-HOLD)

| ID | Condition | Severity | Action |
|---|---|---|---|
| V-QA-HOLD-001 | `reference_type` valid enum | block | reject create |
| V-QA-HOLD-002 | `reference_id` exists in target table (FK-check) | block | reject |
| V-QA-HOLD-003 | No overlapping active hold on same LP (reference_type='lp') | warn | allow override with reason |
| V-QA-HOLD-004 | `reason_code_id` OR `reason_free_text` NOT NULL | block | reject |
| V-QA-HOLD-005 | At release: `disposition` NOT NULL | block | reject release |
| V-QA-HOLD-006 | At release: `released_by` different from `created_by` when priority=critical (segregation of duties) | block | reject |
| V-QA-HOLD-007 | Release signature hash verifiable (SHA-256 matches input) | block | reject |

### 11.2 Inspection validations (V-QA-INSP)

| ID | Condition | Severity | Action |
|---|---|---|---|
| V-QA-INSP-001 | `specification_id` must be active (status='active') | block | reject start |
| V-QA-INSP-002 | `specification_version` snapshot matches spec at assignment time | warn | allow (recalc) |
| V-QA-INSP-003 | All critical parameters have test_results before submit | block | reject submit |
| V-QA-INSP-004 | `result` computed matches test_results aggregate | block | server authoritative (ignore client) |
| V-QA-INSP-005 | If `result='pass'`, all critical params must pass | block | reject |
| V-QA-INSP-006 | If `result='fail'`, `fail_reason_code_id` OR `fail_reason_notes` NOT NULL | block | reject submit |
| V-QA-INSP-007 | `inspector_id` role IN (qa_inspector, quality_lead) | block | reject |
| V-QA-INSP-008 | `inspection_type='allergen_changeover'` must link to `allergen_changeover_validation_id` | block | reject |
| V-QA-INSP-009 | Auto-create NCR draft if `result='fail'` AND no existing linked NCR | info | auto-exec |

### 11.3 Spec validations (V-QA-SPEC)

| ID | Condition | Severity | Action |
|---|---|---|---|
| V-QA-SPEC-001 | `version` unique per `(product_id, spec_code)` | block | reject |
| V-QA-SPEC-002 | Activation requires all parameters have test_method defined | block | reject approve |
| V-QA-SPEC-003 | Min ≤ target ≤ max if all three provided | block | reject param save |
| V-QA-SPEC-004 | Activation creates superseded record for prior version | info | auto-exec |
| V-QA-SPEC-005 | `approved_by` role must include quality_lead | block | reject |
| V-QA-SPEC-006 | Approved specs immutable (trigger `prevent_spec_signed_update`) | block | DB-level |

### 11.4 NCR validations (V-QA-NCR)

| ID | Condition | Severity | Action |
|---|---|---|---|
| V-QA-NCR-001 | `severity` valid enum | block | reject |
| V-QA-NCR-002 | `response_due_at` auto-computed (24h/48h/7d from detected_at) | info | auto |
| V-QA-NCR-003 | `ncr_type='yield_issue'` requires target_yield + actual_yield + claim_pct | block | reject |
| V-QA-NCR-004 | `ncr_type='allergen_deviation'` must link to allergen_changeover_validation or ccp_deviation | block | reject |
| V-QA-NCR-005 | Close requires closure_signature_hash + root_cause (P2) | block | reject close |
| V-QA-NCR-006 | Critical NCR close requires dual sign (quality_lead + prod_manager) | block | reject (per matrix §2.3) |
| V-QA-NCR-007 | Overdue NCR (past response_due_at + 24h) auto-escalate to quality_director | info | auto-exec |

### 11.5 HACCP/CCP validations (V-QA-HACCP / V-QA-CCP)

| ID | Condition | Severity | Action |
|---|---|---|---|
| V-QA-HACCP-001 | Plan active requires at least 1 CCP | block | reject activate |
| V-QA-HACCP-002 | CCP requires critical_limit_min OR critical_limit_max | block | reject |
| V-QA-HACCP-003 | CCP monitoring_frequency parseable (e.g., "30min", "batch", "continuous") | block | reject |
| V-QA-CCP-001 | Monitoring record must reference active CCP | block | reject |
| V-QA-CCP-002 | `measured_value` required if CCP.monitoring_method not 'observational' | block | reject |
| V-QA-CCP-003 | Deviation auto-creates NCR via `ccp_deviation_escalation_v1` rule | info | auto-exec |
| V-QA-CCP-004 | Post-deviation corrective_action required before next reading on same CCP | block | reject next record |
| V-QA-CCP-005 | Signature required for food-safety hazard CCPs (biological/allergen) | block | reject |

### 11.6 Allergen / incident / complaint validations

| ID | Condition | Severity | Action |
|---|---|---|---|
| V-QA-ALLERGEN-001 | Dual-sign required before `validation_result='approved'` (quality_lead + shift_lead/hygiene_lead) | block | reject set approved |
| V-QA-ALLERGEN-002 | ATP result ≤ pass_threshold before approve if risk ≥ medium | block | reject approve |
| V-QA-INCIDENT-001 | Accident type requires corrective_action within 24h | warn | flag overdue |
| V-QA-COMPLAINT-001 | Received_at ≤ NOW() | block | reject |
| V-QA-COMPLAINT-002 | Severity=critical requires response_due_at ≤ received + 2 business days | block | reject save |

---

## §12. INTEGRATIONS

### 12.1 P1 scope (consumer-only, no outbound stage)

09-QUALITY is **consumer** of upstream module events in P1. No outbound INTEGRATIONS stage (stages 1/2/3/5 owned by 03-TECH/08-PROD/11-SHIPPING/10-FINANCE).

**Inbound event consumers (P1):**

| Event (producer) | 09-QA handler | Action |
|---|---|---|
| `grn.received` (05-WH) | `grn_outbox_consumer` | Auto-create `quality_inspections` (inspection_type='incoming') per `items.inspection_required` flag |
| `wo.completed` (08-PROD) | `wo_close_outbox_consumer` (P2) | Queue final inspection (P2 EPIC 8F) |
| `lp.qa_status.query` (05-WH) | `qa_status_reader` | Return current status for LP |
| `allergen.changeover.requested` (08-PROD) | `allergen_gate_signer` | Display in QA-070 pending sign queue |
| `ccp.deviation` (self-triggered) | `ccp_rule_executor` | Fire `ccp_deviation_escalation_v1` actions |
| `wo.closed_production_strict.check` (08-PROD) | `wo_release_check` (P2) | Respond with QA status (passed/blocked + reason) |
| `scanner.inspect.submitted` (06-SCN) | `scanner_inspect_handler` | Persist inspection + results + create NCR if fail |
| `complaint.received` (12-REPORTING P2) | `complaint_handler` | Create `quality_complaints` record |

**Outbound events (P1 — emitted to outbox for downstream):**

| Event | Consumers |
|---|---|
| `quality.hold.created` | 05-WH (block LP ops), 10-FIN (freeze cost posting P2), 12-REP |
| `quality.hold.released` | 05-WH (unblock), 12-REP |
| `quality.inspection.completed` | 05-WH (update qa_status), 12-REP |
| `quality.ncr.created` | 08-PROD (hold WO if critical), 12-REP, 10-FIN (claim cost) |
| `quality.ccp.deviation` | 08-PROD (hold WO if critical — via auto_hold action), 12-REP |
| `quality.batch.released` (P2) | 11-SHIPPING (allow allocation), 10-FIN (release WIP cost) |

### 12.2 P2 LIMS bridge (Phase 2 future stage)

**Pattern:** Adapter pattern per R15 (anti-corruption), config in 02-SETTINGS §11 under `integration.lims.*`.

**Bridge design (stub P1, full P2 EPIC 8I):**

```
09-QUALITY LIMS Adapter
 ├── lims_adapter (abstract interface)
 │   ├── submit_sample(sample, params) → external_lims_id
 │   ├── fetch_result(external_lims_id) → test_results
 │   └── poll_status(external_lims_id) → status
 ├── lims_labware_v1 (LabWare ELN/LIMS)
 ├── lims_starlims_v1 (StarLIMS)
 └── lims_generic_csv_v1 (fallback: manual CSV import)
```

**Data flow (P2):**
1. Inspector takes sample → SCN-071 / QA-032 → `sampling_records` inserted
2. If `specification_parameter.test_method='external_lims'` → adapter.submit_sample()
3. Adapter returns `external_lims_id` stored in `quality_test_results.external_lims_id`
4. Nightly poll job: adapter.poll_status(ids) → if complete, fetch_result → update test_results.measured_value + result + notes
5. Auto-update inspection status if all results in

**P1 stub coverage:** Columns `external_lims_id` on `quality_test_results` + `lab_results`; admin config stub `integration.lims.enabled=false`.

### 12.3 P2 ATP device integration (Q2 → Phase 2 upgrade path)

**P1 = manual entry** (Q2 decision A — Forza paper cards baseline).

**P2 adapter pattern (when upgrade triggered):**
- Vendor-specific: Hygiena EnSURE 3, Kikkoman Lumitester Smart
- REST API or Bluetooth LE sync (vendor SDK)
- Data flow: ATP device → sync app → `lab_results` insert (test_type='atp_swab', measured_value=RLU, pass_threshold=10)
- Hook into 08-PROD allergen_changeover_gate_v1 rule — auto-fill `atp_result.rlu` field

**P1 stub coverage:** `lab_results.test_type='atp_swab'` supported + `pass_threshold` column + manual entry UI in QA-031.

---

## §13. Security & Audit

### 13.1 Authentication & authorization

- **Desktop:** session-based auth reuses core module auth (Lucia + passkey). MFA optional, required for `quality_lead` role per 02-SETTINGS §14.
- **Scanner:** PIN auth per 06-SCANNER-P1 §6 (username + PIN). PIN rotation admin-configurable, default 180d (06-SCN Q7).
- **Role assignment:** via 02-SETTINGS RBAC; roles hierarchical (auditor_readonly ⊂ qa_inspector ⊂ quality_lead ⊂ quality_director).
- **Session invalidation:** quality_lead sessions max 8h; PIN-only scanner sessions max 60s idle (kiosk) / 300s (personal device) per 06-SCN Q5.

### 13.2 E-signature implementation (21 CFR Part 11)

**Signature components:**
1. User identification: `user_id + display_name`
2. Timestamp: `signed_at TIMESTAMPTZ` (server clock, NTP-synced)
3. Meaning: `signature_meaning` ('approved','released','rejected','witnessed','counter_signed')
4. Data integrity: `signature_hash = SHA-256(user_id || record_id || table || signed_at_iso || record_content_hash || PIN_proof)`
5. Non-repudiation: PIN re-verification for every signature (session token alone insufficient)

**PIN re-verification flow:**
- User clicks Sign → modal appears → PIN input → `POST /api/auth/verify-pin` → returns `pin_proof` (short-lived HMAC token)
- Client passes `pin_proof` to sign endpoint
- Server validates `pin_proof` matches user + has not expired (60s TTL)

**Signed records (P1):**
- `quality_specifications.approval_signature_hash`
- `quality_holds.release_signature_hash`
- `quality_inspections.signature_hash`
- `haccp_monitoring_records.signature_hash` (food-safety hazards only)
- `allergen_changeover_validations.first_signature_hash` + `second_signature_hash` (written by 09-QA, table owned 08-PROD)

**Immutability:** DB trigger `prevent_*_signed_update` blocks any update when `signed_at IS NOT NULL`. Override only via new signed record (superseded linkage).

### 13.3 Audit log completeness

Per §5.2 `quality_audit_log` captures:
- INSERT/UPDATE/DELETE on all P1 tables
- SIGN operation (separate event type for e-sig records)
- RELEASE (hold release), APPROVE (spec), CLOSE (NCR)
- User context: `user_id`, `session_id`, `ip_address`, `user_agent`, `request_id`
- Old vs new data (full JSONB snapshots for rollback reference)
- Change reason (`change_reason` from app context; required for admin-initiated UPDATEs)

**Retention:** 7 years minimum (BRCGS Issue 10), per-record extension via trigger.

**Export:** Admin can download audit log for specific records/period (CSV + JSON). Data controller access via GDPR request (P2 workflow 8L).

### 13.4 Data privacy (GDPR)

- **Personal data scope:** user_id + display_name (inspectors, signers, reporters)
- **Pseudonymization:** post-employment, user records anonymized via `user_anonymization_policy` (separate module)
- **Right to erasure:** does NOT apply to regulatory-retained records (GDPR Art. 17(3)(b)/(c)); only non-regulatory columns (notes free text) anonymizable; structured audit retained per FSMA/BRCGS
- **Export:** user data export per request via 02-SETTINGS §14 GDPR export job

### 13.5 Access logging (forensic)

Every access to QA records logged with:
- `request_id UUID` (distributed tracing per R14)
- `access_type` (read/write/export)
- `record_id`, `table_name`, `user_id`, `ip_address`, `timestamp`
- Separate `quality_access_log` table (90-day retention, exportable for investigations)

---

## §14. i18n (pl/en + uk/ro)

### 14.1 Locale coverage

**P1 scope:** pl (primary Forza), en (secondary corporate). P2 add uk (Ukrainian workforce) + ro (Romanian workforce).

**Translation keys (P1):**

| Key group | Example | Static/Dynamic |
|---|---|---|
| UI labels | `qa.hold.create_button` → "Utwórz hold" / "Create hold" / "Створити" / "Creare" | Static (next-intl) |
| Status names | `qa.status.PENDING` → "Oczekuje" / "Pending" / "Очікує" / "În așteptare" | Static |
| Severity | `qa.severity.critical` → "Krytyczna" / "Critical" | Static |
| Hold reasons | dynamic per row (`reference_tables_rows.row_data.label_pl/en/uk/ro`) | Dynamic (reference table) |
| NCR types | dynamic (reference table) | Dynamic |
| CCP step names | per-plan translations in `haccp_ccps.translations JSONB` | Dynamic per-plan |
| Fail reasons | dynamic (`qa_failure_reasons` reference) | Dynamic |
| Error messages | `qa.error.invalid_transition` | Static |

**Scanner translations:** 06-SCN provides translation bundle; 09-QA contributes QA-specific keys via shared bundle.

### 14.2 Locale-sensitive formatting

- **Dates:** ISO 8601 internal; user display per `user.locale` (dd.MM.yyyy pl, MM/dd/yyyy en, dd.MM.yyyy uk, dd.MM.yyyy ro)
- **Numbers:** decimal separator locale-aware (pl/uk/ro = comma, en = dot); thousand separator per locale
- **Units:** metric baseline (kg, °C, RLU); optional imperial toggle per user (P2)
- **Text directions:** LTR all P1 locales

### 14.3 Onboarding hooks (per 02-SETTINGS §14 6-step)

9-step QA-specific onboarding for new users:
1. Welcome + role explanation
2. PIN setup
3. Scanner login demo (SCN-011)
4. Dashboard tour (QA-001)
5. First inspection walkthrough (QA-030 → QA-031)
6. Hold creation demo (QA-012)
7. NCR reporting demo (QA-041 basic)
8. HACCP monitoring demo (QA-051)
9. Signature demo + 21 CFR Part 11 explanation

Onboarding completion tracked in `user_onboarding_progress` (02-SETTINGS).

---

## §15. Risks & Open Items

### 15.1 Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-QA-01 | HACCP/CCP complexity → poor P1 adoption | Medium | High | P1 scope limited to basic checklist + rule engine stub; P2 adds IoT/deviation full. User training + templates. |
| R-QA-02 | 21 CFR Part 11 non-compliance on e-sig | Low | Critical | Strict SHA-256 + PIN re-verification + immutability triggers + audit log; security review pre-launch |
| R-QA-03 | Data retention 7-10y cost (storage) | Medium | Medium | Partitioned tables by year; cold-storage archival post-3y (compressed JSONB); retention_until auto-calc |
| R-QA-04 | Scanner offline → CCP data loss | Medium | High | 06-SCN §5 offline queue FIFO replay; UUIDv7 idempotency; retry 48h before alert |
| R-QA-05 | Integration with 08-PROD allergen gate fails | Low | High | Clear API contract (`allergen_changeover_validations` handshake); integration tests; backfill migration script |
| R-QA-06 | Mass NCR creation from CCP rule → alert fatigue | Medium | Medium | Rule tuning: `deviation_threshold_seconds` per hazard; dedup by ccp_id within 10min window; severity auto-calibration |
| R-QA-07 | LIMS vendor lock-in (P2) | Medium | Medium | Adapter pattern + abstract interface; CSV fallback; vendor selection post-UAT |
| R-QA-08 | FSMA 204 2028 enforcement delay uncertainty | Low | Low | 05-WH §11 genealogy already covers; 09-QA inspection CTEs ready; monitor FDA guidance |
| R-QA-09 | Regulatory change mid-implementation (BRCGS v11) | Low | Medium | Rule registry + retention_until column configurable per regulation; extension via migration |
| R-QA-10 | Dual sign-off bottleneck (quality_lead unavailable) | Medium | Medium | Delegation flow (P2): quality_lead can delegate to named deputy with audit trail; P1 = escalation chain SMS |

### 15.2 Open questions (OQ-QA-*) — carry-forward

| ID | Question | Owner | Due |
|---|---|---|---|
| OQ-QA-01 | Hold default duration per reason — final values post-UAT (e.g., contamination=7d, temperature=2d, documentation=5d) | quality_lead + admin | Pre-launch UAT |
| OQ-QA-02 | CCP `deviation_threshold_seconds` default per hazard type — empirical tuning post 30-day P1 run | hygiene_lead | +30d post P1 |
| OQ-QA-03 | NCR severity rules — automated calibration vs manual (current rule uses hazard type mapping; consider ML-based after 6mo data) | quality_director | P2 design |
| OQ-QA-04 | Complaint→NCR auto-link threshold (keyword match in description? severity? customer tier?) | quality_lead | P2 design |
| OQ-QA-05 | LIMS vendor selection — LabWare vs StarLIMS vs generic CSV | quality_director + CTO | P2 kick-off |
| OQ-QA-06 | HACCP plan template library — ISO/Codex default templates vs Forza custom only | quality_lead | P1 launch |
| OQ-QA-07 | Audit export format — which regulators accept digital vs require paper (BRCGS/FDA/IFS)? | quality_director | Pre-first audit |
| OQ-QA-08 | Customer complaint portal integration — Phase 2 scope (email parser? retailer EDI? manual only?) | quality_director | P2 design |
| OQ-QA-09 | Override authority matrix — which role can override allergen gate, CCP deviation, NCR close dual-sign | quality_lead + prod_manager | Pre-BRCGS audit |
| OQ-QA-10 | PIN rotation enforcement for `qa_inspector` role — stricter than default 180d? (e.g., 90d for food-safety-critical roles) | admin + quality_lead | P1 launch |

**Resolved from C3 carry-forward:**
- ✅ **OQ-PROD-04** ATP device P1 vs manual — resolved in Q2 as **A manual P1**, device upgrade path defined in §12.3.

### 15.3 Dependencies to be validated in C5 / post-P1

- **13-MAINTENANCE** equipment_calibration FK — needs to be created in C5 to satisfy 09-QA HACCP verification records
- **12-REPORTING** complaint intake — EPIC 8M (Customer Complaints full) may migrate to 12-REP depending on scope
- **14-MULTI-SITE** site-level quality orgs — may require quality governance hierarchy (org_id hierarchical with L2 override)
- **PLD v7 REALITY-SYNC** — Technical column (Shelf_Life) + future allergen cols map to `quality_specifications` at migration time

---

## §16. Build Sequence & Summary

### 16.1 Build sequence

**P1 build order (strict):**

```
1. 02-SETTINGS §8 reference tables extension: quality_hold_reasons, qa_failure_reasons, waste_categories (2 sesje)
   ↓
2. 09-a Hold/Release & Status  (sub-module, 10-12 sesji)
   depends: 02-SETTINGS §8, 05-WH §6.1 (qa_status column)
   delivers: Holds CRUD + qa_status_state_machine_v1 rule
   ↓
3. 09-b Specifications & Params (6-8 sesji)
   depends: 03-TECH items
   delivers: Specs CRUD + approval flow
   ↓
4. 09-c Incoming Inspection & Test Results (14-16 sesji)
   depends: 09-a, 09-b, 05-WH §7 (GRN), 06-SCN §8.5 (SCN-070..073 contract)
   delivers: Inspection lifecycle + scanner backend + NCR auto-create
   ↓
5. 09-d NCR Basic (5-6 sesji)
   depends: 09-a, 09-c
   delivers: NCR CRUD + yield_issue variant
   ↓
6. 09-e HACCP + CCP Basic + Rule (8-10 sesji)
   depends: 03-TECH, 09-d (NCR auto-create target)
   delivers: HACCP plans/CCPs/monitoring + ccp_deviation_escalation_v1 rule + complaints/incidents stub
```

**Total P1 impl est.:** 45-54 sesji full build (incl. 02-SETTINGS §8 extension + 5 sub-modules).

**Parallelization opportunities:**
- 09-b can start in parallel with 09-a once 02-SETTINGS §8 done
- 09-d can start once 09-a done (doesn't need 09-c)
- 09-e can start once 03-TECH + 02-SETTINGS §7 rule registration mechanism done

### 16.2 Deliverable checklist (v3.0 this PRD)

- [x] 16 sections matching v3.0 convention (per 07-EXT/08-PROD template)
- [x] Core entities defined (14 P1 tables + 12 P2 tables overview)
- [x] 3 new DSL rules specified (`qa_status_state_machine_v1`, `ccp_deviation_escalation_v1`, `batch_release_gate_v1` P2)
- [x] Consumer contracts documented (08-PROD E7, 05-WH §12/§11, 03-TECH §10, 06-SCN §8.5)
- [x] 25+ validation rules V-QA-*
- [x] SCN-070..073 + SCN-081 backend contract
- [x] Reference table extensions (3) moved to 02-SETTINGS §8
- [x] Retention policy 7y/10y/5y per regulation
- [x] E-signature pattern + immutability triggers
- [x] RLS + role matrix
- [x] 7 Q1-Q7 decisions resolved and applied
- [x] Build sequence 09-a..e with dependencies

### 16.3 Cross-PRD consistency impact

**02-SETTINGS v3.0 additions (to be applied in separate revision):**
- §7 Registry: 3 new rules (`qa_status_state_machine_v1`, `ccp_deviation_escalation_v1`, `batch_release_gate_v1`)
- §8 Reference tables: `quality_hold_reasons`, `qa_failure_reasons`, `waste_categories` (migrated from hardcoded)

**05-WAREHOUSE v3.0 clarification (no schema change):**
- §5.2 `license_plates.qa_status` column ownership: 05-WH schema, 09-QA writes via PUT API
- §12.2 use_by gating consumer: 09-QA `quality_holds` creates overrides on expiring LPs

**08-PRODUCTION v3.0 clarification (no schema change):**
- `allergen_changeover_validations.first_signed_by/first_signature_hash` → written by 09-QA
- `wo_outputs.qa_status` → 09-QA owns writes; 08-PROD only creates row on WO close

**06-SCANNER-P1 v3.0 clarification (no schema change):**
- SCN-070..073 backend = 09-QA implementation of contract defined in 06-SCN §14

**Action:** Apply cross-PRD delta revisions in C4 Sesja 2 (before 10-FINANCE writing) to keep registry/reference consistent.

### 16.4 Module summary

**09-QUALITY-PRD v3.0 final stats:**

| Metric | Value |
|---|---|
| Lines | ~1850 |
| Sections | 16 |
| P1 tables | 14 core |
| P2 tables | +12 extensions |
| P1 epics | 5 (8A-8E) |
| P2 epics | 7 (8F-8L) |
| P1 sub-modules build | 5 (09-a..e) |
| P1 impl est. sesji | 45-54 |
| DSL rules registered | 3 new (qa_status_state_machine_v1, ccp_deviation_escalation_v1, batch_release_gate_v1) |
| DSL rules consumed | 4 (allergen_changeover_gate_v1, allergen_cascade_rm_to_fa, wo_state_machine_v1, closed_production_strict_v1) |
| Validation rules V-QA-* | 30+ |
| UX screens P1 | 17 desktop + 5 scanner handoff |
| KPIs | 8 P1 + 8 P2 + 5 compliance continuous |
| Regulatory mappings | 7 (BRCGS Issue 10, FSMA 204, EU FIC, 21 CFR Part 11, ISO 22000, Codex HACCP, IFS) |
| Open questions | 10 OQ-QA-* |
| Risks | 10 R-QA-* |

**Phase D positioning:** Module #9 in 15-module sequence. Consumer layer bridge between execution (08-PROD) and shipping (11-SHIPPING) + finance (10-FIN). Central regulatory evidence aggregator.

**Next writing (C4 Sesja 2):** 10-FINANCE + INTEGRATIONS stage 5 (WIP costing, yield variance, waste cost allocation, D365 cost posting reusing 08-PROD outbox pattern).

**Next writing (C4 Sesja 3):** 11-SHIPPING + INTEGRATIONS stage 3 (SO fulfillment, SSCC, Delivery Note, D365 SO pull).

---

_09-QUALITY-PRD v3.0 — 2026-04-20 — Phase C4 Sesja 1 deliverable._
_Changelog v3.0 vs v2.0: Full rewrite w v3.0 convention (16 sekcji). Q1-Q7 rozstrzygnięte. 3 DSL rules registered. Consumer of 08-PROD E7 allergen gate + 05-WH §11/§12 + 03-TECH §10 + 06-SCN §8.5. Reference tables extracted to 02-SETTINGS §8. LIMS bridge stub P1, full P2. ATP device manual P1 (Q2), P2 adapter. Calibration → 13-MAINT (Q6). Customer complaints stub P1 (Q7). NCR basic P1, CAPA workflow P2 (Q5). Hold taxonomy structured via reference table (Q3). CCP rule engine ready, IoT P2 (Q1). BRCGS Issue 10 7y retention. 21 CFR Part 11 e-signature. FSMA 204 CTE coverage via 05-WH §11 consumer. 45-54 sesji impl P1 est. (5 sub-modules 09-a..e)._
_Retains v2.0 baseline: D1-D14 decisions, 7 QA statuses, epic 8A-8L breakdown, scanner-first approach, RLS+org_id mandate, AQL ISO 2859 sampling._

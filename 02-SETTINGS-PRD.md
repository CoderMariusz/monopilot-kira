---
module: 02-SETTINGS
version: 3.3
status: Phase C5 Sesja 2 delta (bundled)
primary: false
role: admin-foundation
depends_on: [00-FOUNDATION]
depended_on_by: [01-NPD, 03-TECHNICAL, 04-PLANNING-BASIC, 05-WAREHOUSE, 06-SCANNER-P1, 08-PRODUCTION, 09-QUALITY, 10-FINANCE, 11-SHIPPING, 12-REPORTING, 13-MAINTENANCE, 14-MULTI-SITE, 15-OEE]
written: 2026-04-19
revised: 2026-04-20 (v3.1 bundled C4 Sesja 3 close), 2026-04-20 (v3.2 bundled C5 Sesja 1 close), 2026-04-20 (v3.3 bundled C5 Sesja 2 close)
---

# PRD 02-SETTINGS — MonoPilot MES

**Admin foundation module.** Dostarcza organizacji, użytkowników, RBAC, module toggles, schema admin wizard (ADR-028), read-only rule registry (ADR-029), 8+3 Reference tables CRUD, multi-tenant L2 config (ADR-031), feature flags, audit log viewer, D365 constants admin (INTEGRATIONS stage 1 inline), infrastructure (warehouses/locations/machines/lines), security + i18n + onboarding wizard.

---

## §1 — Executive Summary

**v3.0 vs pre-Phase-D baseline (v1.x, 652 linii, 8 epics E01.1-E01.8):**

Rozszerzamy baseline o 5 nowych core obszarów wymagane przez Phase D architecture:

1. **Schema Admin Wizard (§6)** `[ADR-028]` — UI do add/edit kolumny biznesowe bez dev. Główny blocker dla P1 "easy extension contract" z 00-FOUNDATION §1.
2. **Rule Definitions Registry (§7)** `[ADR-029]` — **read-only rejestr reguł DSL** (cascading / conditional / gate / workflow-as-data). Reguły authored przez dev (PR → deploy as migration), admin ma visibility + audit + version diff — **nie edytuje**. Decyzja 2026-04-19.
3. **Reference Tables CRUD (§8)** — 8 tabel z v7 + 3 nowe (AlertThresholds, Allergens, D365_Constants). Generic metadata-driven UI zamiast hardcoded view per tabela.
4. **Multi-tenant L2 Config (§9)** `[ADR-031]` — dept taxonomy variation (ADR-030), tenant_variations, upgrade orchestration L1→L2→L3→L4.
5. **D365 Constants Admin (§11)** `[LEGACY-D365]` — INTEGRATIONS stage 1 inline: FNOR / FOR100048 / ForzDG / FinGoods / FProd01 admin CRUD + item/BOM one-way sync config.

**Pozostałe sekcje** (§10 Feature flags, §12 Infrastructure, §13 EmailConfig, §14 Security+i18n+Onboarding) = refinement baseline z markerami Phase D i L2-ready storage.

Status: `[UNIVERSAL]` dla core admin, `[FORZA-CONFIG]` dla D365 consts + 7-dept baseline, `[EVOLVING]` dla hard-lock semantyki i rule registry authoring UX.

---

## §2 — Objectives & Success Metrics

### Cel główny

**Admin (role Admin lub Owner) może skonfigurować tenant end-to-end w <4h**, dodać kolumnę biznesową lub Reference tabelę w <10min bez developera, wyświetlić + zaudytować wszystkie reguły DSL zgodnie z ADR-029, i zarządzać L2 variations (ADR-031) bez fork repo.

### Cele szczegółowe

1. **Org + Users onboarding <15min** — 6-step wizard z resume, 10 system roles out-of-box (ADR-012), invitation email flow.
2. **Schema admin wizard** — add column do L2/L3 bez DDL migration (ADR-028 §6.1). L1 promotion = ticket + controlled migration + admin approval + notification (per Q1).
3. **Rule registry read-only** — admin widzi 4 rule types, version history, dry-run results, who-changed-what audit. Authoring = dev przez PR (per Q2).
4. **Reference CRUD** — 11 tabel przez jeden generic UI, CSV import/export, version+audit, conflict resolution na concurrent edit.
5. **Multi-tenant L2** — dept split/merge per ADR-030 bez code change, upgrade orchestration "migrate to v2" z preview diff i dual-run N miesięcy.
6. **D365 constants** — Jane (NPD Manager) albo Admin edytuje 5 Forza consts + toggle `integration.d365.enabled` — stage 1 INTEGRATIONS inline.
7. **Audit everything** — każda mutation SETTINGS w audit_log (ADR-008), partycjonowana monthly, retain 7 lat.

### Metryki sukcesu

| Metric | Target | Źródło |
|---|---|---|
| Onboarding time (first WO created) | <15 min P50, <30 min P95 | `organizations.onboarding_completed_at - created_at` |
| Add new column (admin, end-to-end) | <10 min | Schema wizard telemetry |
| Add new Reference table row | <1 min | Reference CRUD API latency |
| L2 upgrade canary→100% | 2-4 tygodnie | `tenant_migrations.last_run_at` progression |
| Rule registry audit coverage | 100% mutations tracked | audit_log counts vs rule_definitions mutations |
| D365 paste-back success | ≥95% after constants configured | Builder telemetry (kwartalnie) |

---

## §3 — Personas & RBAC Overview

### Primary (Forza, z reality sources)

| Persona | Role | Główne zadania | Marker |
|---|---|---|---|
| **Jane** (NPD Manager) | `npd_manager` | Orkiestruje PLD, konfiguruje Reference (PackSizes, Templates), edytuje D365 constants, manual override allergens | [FORZA-CONFIG z [UNIVERSAL] rolą] |
| **Admin (Owner)** | `owner` | Zakłada organizację, zarządza użytkownikami, toggle modules, konfiguruje L2 variations, zarządza API keys / webhooks | [UNIVERSAL] |
| **Module Admin** | `module_admin` | Zarządza konfiguracją w zakresie jednego modułu (np. waste categories dla Production) | [UNIVERSAL] |
| **Auditor** | `auditor` | Read-only dostęp do audit_log + rule registry + schema history | [UNIVERSAL] |
| **Support** (Monopilot staff) | `superadmin` | Impersonation (explicit flag, audit, SIEM logged), cross-tenant analytics | [UNIVERSAL] — Monopilot staff only |

### 10 system roles (z baseline v1.x, retained)

`owner` / `admin` / `npd_manager` / `module_admin` / `planner` / `production_lead` / `quality_lead` / `warehouse_operator` / `auditor` / `viewer`

**Custom roles** — Phase 3 (Enterprise), `roles.is_system=false`, `org_id` scoped.

### Permission model

Permission = `module_code + action + scope`:
- `settings.users.create`, `settings.users.deactivate`
- `npd.fa.edit`, `npd.d365_builder.execute` (tylko `npd_manager`)
- `settings.schema.edit` — hard-lock: **L2/L3 tak, L1 promotion wymaga Owner + approval workflow** (Q1 decision)
- `settings.rules.view` (read-only); `settings.rules.edit` — **deferred / not granted w UI** (rule authoring przez dev PR, Q2)

---

## §4 — Scope

### 4.1 In Scope — Phase 1 MVP (build subset)

- E01.1 Organization + Users + RBAC (10 system roles, ADR-012, ADR-013)
- E01.2 Onboarding wizard (6-step, <15min)
- E01.3 Infrastructure: warehouses (5 typów), locations (4-level tree), machines, production_lines
- E01.4 Master data: allergens EU-14 (global) + org_allergens extensions, tax_codes, audit_log (ADR-008)
- E01.5 Security: password, session, MFA (optional), i18n pl/en (next-intl, R11)
- **Schema admin wizard (§6)** — L2/L3 add column, draft/publish flow, dry-run, Zod runtime gen
- **Rule registry read-only (§7)** — list + version history + diff + dry-run results viewer
- **Reference CRUD (§8)** — generic metadata-driven UI dla 11 tabel
- **Module toggles (§10)** — 15 modułów, dependency warnings, PostHog self-host + built-in fallback
- **D365 Constants admin (§11)** — 5 Forza consts editable, `integration.d365.enabled` toggle

### 4.2 In Scope — Phase 2 (post-MVP, pre-C5)

- Multi-country VAT (tax_codes extension — country_code, tax_type enum)
- Waste categories config (CRUD per org; FK referenced przez 08-PRODUCTION)
- Grade thresholds config (per metryka/line; FK 12-REPORTING Leader Scorecard)
- Fiscal calendar config (4-4-5 / 4-5-4 / 5-4-4 / calendar_months; 12-REPORTING Period Reports)
- Target KPI per line/product
- Disposition codes (accept/reject/quarantine/scrap/rework + custom)
- **Multi-tenant L2 Config UI (§9)** — tenant_variations editor, upgrade orchestration "migrate to v2"
- API keys (HMAC + scopes), webhooks (retry + delivery log), notification preferences
- MFA rozszerzone (required/all), DE/FR/UK/RO i18n
- EmailConfig activation + auto-triggers (Reference table w §8, UX w §13)

### 4.3 In Scope — Phase 3 (Enterprise)

- Subscription & Billing (Stripe Connect)
- CSV import/export (bulk ops dla users, tax_codes, locations)
- IP whitelist per role
- GDPR compliance tooling (data export, right-to-erasure workflow)
- Custom roles per org (non-system)
- L4 org-private schemas (per-tenant dedicated schema lub DB cluster, silo model)

### 4.4 Exclusions (nigdy w SETTINGS)

- Rule authoring UI (per Q2 — rules authored przez dev jako code/JSON PRs)
- Bezpośrednia edycja DDL przez UI (schema L1 zmiana wymaga migration script + approval, nie ad-hoc edit)
- Tenant switching dla zwykłych użytkowników (tylko superadmin z MFA + SIEM)
- Cross-tenant bulk operations z UI (zarezerwowane dla warehouse schema analytics, nie prod)

---

## §5 — Entity Model

### 5.1 Core identity

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  logo_url TEXT,
  timezone TEXT NOT NULL DEFAULT 'Europe/Warsaw',
  locale TEXT NOT NULL DEFAULT 'pl',
  currency CHAR(3) NOT NULL DEFAULT 'PLN',
  gs1_prefix TEXT,
  region TEXT NOT NULL DEFAULT 'eu',            -- [R7] data residency
  tier TEXT NOT NULL DEFAULT 'L2',              -- 'L1'|'L2'|'L3'|'L4' ADR-031
  onboarding_state JSONB DEFAULT '{}',
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  email CITEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role_id UUID NOT NULL REFERENCES roles(id),
  language TEXT NOT NULL DEFAULT 'pl',
  is_active BOOLEAN NOT NULL DEFAULT true,
  invite_token TEXT,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),      -- NULL dla system roles
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  permissions JSONB NOT NULL,                    -- array of 'module.action.scope'
  is_system BOOLEAN NOT NULL DEFAULT false,
  display_order INT DEFAULT 0,
  UNIQUE(org_id, code)
);

CREATE TABLE modules (
  code TEXT PRIMARY KEY,                         -- '01-npd', '02-settings', etc.
  name TEXT NOT NULL,
  dependencies TEXT[] DEFAULT '{}',
  can_disable BOOLEAN NOT NULL DEFAULT true,
  phase INT NOT NULL DEFAULT 1,                  -- 1|2|3
  display_order INT
);

CREATE TABLE organization_modules (
  org_id UUID NOT NULL REFERENCES organizations(id),
  module_code TEXT NOT NULL REFERENCES modules(code),
  enabled BOOLEAN NOT NULL DEFAULT false,
  enabled_at TIMESTAMPTZ,
  enabled_by UUID REFERENCES users(id),
  PRIMARY KEY (org_id, module_code)
);
```

### 5.2 Schema metadata (ADR-028)

```sql
CREATE TABLE reference_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),              -- NULL = universal L1 schema
  table_code TEXT NOT NULL,                              -- 'main_table' | 'pack_sizes' | 'bom' | ...
  column_code TEXT NOT NULL,
  dept_code TEXT,                                        -- ADR-030 dept taxonomy
  data_type TEXT NOT NULL,                               -- 'text'|'number'|'date'|'enum'|'formula'|'relation'
  tier TEXT NOT NULL,                                    -- 'L1'|'L2'|'L3'|'L4'
  storage TEXT NOT NULL,                                 -- 'native'|'ext_jsonb'|'private_jsonb'
  dropdown_source TEXT,                                  -- ref to reference table code
  blocking_rule TEXT,                                    -- '' | 'core_done' | 'pack_size_filled' | 'line_filled' | 'core_production_done'
  required_for_done BOOLEAN NOT NULL DEFAULT false,
  validation_json JSONB DEFAULT '{}',                    -- DSL-stored rules (required/unique/regex/range)
  presentation_json JSONB DEFAULT '{}',                  -- form layout, list col, export flag
  schema_version INT NOT NULL DEFAULT 1,
  deprecated_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, table_code, column_code)
);

CREATE TABLE schema_migrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  table_code TEXT NOT NULL,
  column_code TEXT,
  action TEXT NOT NULL,                                  -- 'add'|'edit'|'deprecate'|'promote_l2_to_l1'
  tier_before TEXT,
  tier_after TEXT,
  migration_script TEXT,                                 -- SQL for L1 promotions
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',                -- 'pending'|'approved'|'running'|'completed'|'failed'|'rolled_back'
  result_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 5.3 Rule registry (ADR-029)

```sql
CREATE TABLE rule_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),              -- NULL = universal L1 rule
  rule_code TEXT NOT NULL,                               -- 'allergen_changeover_gate', 'pack_size_cascade', ...
  rule_type TEXT NOT NULL,                               -- 'cascading'|'conditional'|'gate'|'workflow'
  tier TEXT NOT NULL DEFAULT 'L1',
  definition_json JSONB NOT NULL,                        -- DSL body (authored by dev, stored here after deploy)
  version INT NOT NULL DEFAULT 1,
  active_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  active_to TIMESTAMPTZ,
  deployed_by UUID REFERENCES users(id),                 -- usually 'system' via CI/CD
  deploy_ref TEXT,                                       -- git SHA / migration id
  UNIQUE(org_id, rule_code, version)
);

CREATE TABLE rule_dry_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  rule_definition_id UUID REFERENCES rule_definitions(id),
  sample_input_json JSONB NOT NULL,
  result_json JSONB NOT NULL,                            -- pass/fail/warnings/diff
  ran_at TIMESTAMPTZ DEFAULT now(),
  ran_by UUID REFERENCES users(id)                       -- dev tool, optional
);
```

### 5.4 Multi-tenant L2 variations (ADR-031)

```sql
CREATE TABLE tenant_variations (
  org_id UUID PRIMARY KEY REFERENCES organizations(id),
  dept_overrides JSONB DEFAULT '{}',                     -- ADR-030 split/merge/custom dept mapping
  rule_variant_overrides JSONB DEFAULT '{}',             -- {'allergen_gate': 'v2', 'pack_cascade': 'v1'}
  feature_flags JSONB DEFAULT '{}',                      -- L2 local toggles
  schema_extensions_count INT DEFAULT 0,                 -- L3 cols count (informational)
  upgraded_at TIMESTAMPTZ,
  upgraded_from_version TEXT,
  upgraded_to_version TEXT
);

CREATE TABLE tenant_migrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  component TEXT NOT NULL,                               -- 'rule_engine' | 'schema' | 'feature_v2'
  current_version TEXT NOT NULL,
  target_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',              -- 'scheduled'|'canary'|'progressive'|'completed'|'rolled_back'
  canary_pct INT DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  scheduled_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 5.5 Reference tables (generic storage)

```sql
-- Generic metadata-driven storage dla 11 Reference tables
-- (zamiast per-table hardcoded tabel jak v1.x baseline)
CREATE TABLE reference_tables (
  org_id UUID NOT NULL REFERENCES organizations(id),
  table_code TEXT NOT NULL,                              -- 'pack_sizes'|'templates'|'allergens'|'d365_constants'|...
  row_key TEXT NOT NULL,                                 -- e.g. '20x30cm' for pack_sizes
  row_data JSONB NOT NULL,                               -- payload (varies per table_code schema)
  version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INT DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (org_id, table_code, row_key)
);
```

**Decision:** generic storage + per-table Zod schema (generated z reference_schemas) zamiast 11 dedykowanych tabel. Pozwala łatwe dodanie nowej Reference bez migration. L1 zoptymalizowane dropdown lookups idą przez materialized view per org (refresh on row mutation).

### 5.6 Operational: infrastructure + master + audit

```sql
CREATE TABLE warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  warehouse_type TEXT NOT NULL,                          -- 'raw'|'wip'|'finished'|'quarantine'|'general'
  is_default BOOLEAN DEFAULT false,
  address JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, code)
);

CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  parent_id UUID REFERENCES locations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  location_type TEXT NOT NULL,                           -- 'zone'|'aisle'|'rack'|'bin'
  level INT NOT NULL,                                    -- 1|2|3|4
  path TEXT NOT NULL,                                    -- materialized ltree
  max_capacity NUMERIC,
  UNIQUE(org_id, code)
);

CREATE TABLE machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  machine_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',                 -- 'active'|'maintenance'|'offline'
  capacity_per_hour NUMERIC,
  specs JSONB DEFAULT '{}',
  location_id UUID REFERENCES locations(id),
  UNIQUE(org_id, code)
);

CREATE TABLE production_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  default_location_id UUID REFERENCES locations(id),
  UNIQUE(org_id, code)
);

CREATE TABLE line_machines (
  line_id UUID NOT NULL REFERENCES production_lines(id),
  machine_id UUID NOT NULL REFERENCES machines(id),
  sequence INT NOT NULL,
  PRIMARY KEY (line_id, machine_id)
);

CREATE TABLE allergens (
  code TEXT PRIMARY KEY,                                 -- 'A01'..'A14' EU-14
  name TEXT NOT NULL,
  name_pl TEXT,
  name_de TEXT,
  name_fr TEXT,
  name_uk TEXT,
  name_ro TEXT,
  icon_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE org_allergens (
  org_id UUID NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (org_id, code)
);

CREATE TABLE tax_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  rate NUMERIC(5,4) NOT NULL,                            -- 0.2300 = 23%
  country_code CHAR(2),                                  -- Phase 2: ISO 3166-1
  tax_type TEXT,                                         -- Phase 2: 'standard'|'reduced'|'zero'|'reverse_charge'|'duty'
  jurisdiction TEXT,
  effective_from DATE,
  effective_to DATE,
  is_default BOOLEAN DEFAULT false,
  UNIQUE(org_id, code, effective_from)
);

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL,                                  -- 'insert'|'update'|'delete'|'schema_migrate'|'rule_deploy'|'tenant_variation_apply'
  old_data JSONB,
  new_data JSONB,
  changed_fields TEXT[],
  user_id UUID REFERENCES users(id),
  impersonating_as UUID REFERENCES users(id),            -- explicit (ADR-031 admin tooling)
  ip_address INET,
  user_agent TEXT,
  action_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);                       -- ADR-008 monthly partitioning
```

### 5.7 Security + session

```sql
CREATE TABLE org_security_policies (
  org_id UUID PRIMARY KEY REFERENCES organizations(id),
  password_min_length INT DEFAULT 12,
  password_history_count INT DEFAULT 5,
  session_timeout_minutes INT DEFAULT 480,
  lockout_threshold INT DEFAULT 5,
  mfa_requirement TEXT NOT NULL DEFAULT 'optional',      -- 'disabled'|'optional'|'required_admins'|'required_all'
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE login_attempts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  email TEXT,
  ip_address INET,
  success BOOLEAN NOT NULL,
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE password_history (
  user_id UUID REFERENCES users(id),
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, created_at)
);
```

**RLS strategy:** wszystkie `org_id`-scoped tabele mają `ENABLE ROW LEVEL SECURITY` + policy `USING (org_id = current_setting('app.current_org_id')::uuid)`. Superadmin impersonation = explicit `SET LOCAL app.impersonating_as = ...` + audit wpis.

---

## §6 — Schema Admin Wizard [ADR-028]

**Blocker dla P1 "easy extension contract".** Bez tego admin nie może dodać kolumny bez developera, co łamie architektoniczny kontrakt Monopilot (00-FOUNDATION §1).

### 6.1 Flow: Add New Column

1. **Pick table**: `main_table` | `bom` | `reference.<code>` (z L2 scope dropdown)
2. **Pick dept** (if `main_table`): enum z `tenant_variations.dept_overrides` lub baseline 7 depts
3. **Pick data type**: `text` | `number` | `date` | `enum` | `formula` | `relation` (enum-based, nie free-form; reject pattern z MES-TRENDS §4.6)
4. **Validation rules** (multi-select):
   - `required` (bool)
   - `unique` per org
   - `regex` (TEXT field, preview z test string)
   - `range` (min/max dla number/date)
   - `dropdown_source` (FK do `reference_tables.table_code`)
5. **Blocking rule** (enum):
   - `""` (none)
   - `core_done`
   - `pack_size_filled`
   - `line_filled`
   - `core_production_done`
6. **Required_for_done** (bool) — napędza Done_<Dept> agregację (01-NPD §7)
7. **Presentation config**:
   - Form layout: section, order w dept tab
   - List column: visible per role
   - Export flag: w CSV / D365 Builder output
8. **Preview w sample data** — renderer generuje React form + fake row → admin widzi jak wygląda w Main Table tab i dept tab proxy
9. **Save** → `reference_schemas` upsert + `schema_version++` + `schema_migrations` record (status `pending` → `completed` dla L2/L3; `pending` dla L1 promotion)

### 6.2 Storage tier decision (automatic)

| Scenario | Tier | Storage |
|---|---|---|
| New core biznesowa kolumna dla wszystkich orgs (universal) | **L1** | Native Postgres column via controlled migration |
| Variation per org (existing L1 option, np. `enum` extension) | **L2** | `tenant_variations` JSONB |
| Org-specific extension (nikt inny nie ma) | **L3** | `main_table.ext_jsonb` + expression index |
| Org-private (completely hidden) | **L4** | `main_table.private_jsonb` lub per-tenant schema |

Admin domyślnie ma UI dla L2/L3. L4 jest "kontaktuj się z support". L1 promotion = osobny flow (§6.3).

### 6.3 L1 Promotion Flow (Q1 decision)

Admin klika "Promote to L1 (universal)" na istniejącej L3 kolumnie:

1. UI genereruje migration script preview (CREATE COLUMN, backfill plan, index proposal)
2. Request sent do Monopilot superadmin queue (`schema_migrations.status='pending'`)
3. Superadmin approval + DevOps review w osobnym UI (`/admin/schema-migrations`)
4. Approved → background migration job (pg_cron / external worker), batched backfill, zero-downtime (add column nullable → backfill → NOT NULL → update app code reference)
5. Notification do admin (email + in-app) po `status='completed'`
6. Zero-downtime failure mode: rollback SQL w `schema_migrations.migration_script` zwracany z `status='rolled_back'`, admin powiadomiony

**Marker:** `[UNIVERSAL]` — L1 promotion pattern dla wszystkich orgs, tenant-initiated ale Monopilot-controlled. `[EVOLVING]` — dokładna semantyka "approval workflow" (ilu approvers, SLA response).

### 6.4 Draft / Publish model

- Column change = `draft` → admin pushes `publish` → backend commits
- Draft preview w shadow tenant (izolowana org, generated sample data) — dry-run bez wpływu na prod
- Publish: Zod schema regenerated, TS types codegen triggered, RHF forms re-rendered w runtime
- Rollback = publish previous `schema_version` — last 3 versions zawsze dostępne dla revert

### 6.5 Zod runtime generation

Backend endpoint `GET /api/settings/schema/zod/:table_code` zwraca:
```ts
export const mainTableSchema = z.object({
  fa_code: z.string().min(1).max(20),
  pack_size: z.enum(['20x30cm','25x35cm','18x24cm','30x40cm','15x20cm']),  // dropdown_source lookup
  shelf_life_days: z.number().int().min(1).max(720),                       // range validation
  // ... 69 cols per reference_schemas
});
```

Generation odbywa się server-side (Zod + `json-schema-to-zod`) i cache'owany per `org_id + schema_version`. Client pobiera wygenerowany schema przy form mount lub w SSR jako prop do RHF.

### 6.6 UI surfaces

| Screen code | Screen | Capability |
|---|---|---|
| SET-030 | Schema Browser | List wszystkich kolumn per table + tier badge + dept group |
| SET-031 | Column Edit Wizard | 8-step flow §6.1 |
| SET-032 | Schema Diff Viewer | Version N vs N-1 per column |
| SET-033 | Schema Migrations Queue | L1 promotion requests status |
| SET-034 | Preview Shadow | Dry-run form z sample data |

### 6.7 Validation V-SET-SCHEMA

- **V-SET-01**: `reference_schemas.data_type` ∈ allowed enum
- **V-SET-02**: `dropdown_source` FK exists w `reference_tables.table_code` (lub NULL)
- **V-SET-03**: L1 promotion nie może być triggered bez `approved_by` + `approved_at` (UI + DB check)
- **V-SET-04**: Concurrent edit detection — `schema_version` compare at publish, reject + show diff jeśli mismatch
- **V-SET-05**: Deprecated column cannot be referenced przez nową Zod regeneration (compile error)

---

## §7 — Rule Definitions Registry [ADR-029] (read-only)

**Kluczowa decyzja 2026-04-19 (Q2):** Rules authored przez dev w PR (JSON files w repo `/rules/**/*.json`) → deploy as migration (CI/CD pipeline upserts `rule_definitions` + bumps version). Admin UI = **read-only rejestr** + audit + version diff + dry-run results viewer. Admin nie edytuje DSL.

### 7.1 Dlaczego read-only (rationale)

- **Safety** — reguły business-critical (allergen changeover gate, cascading) wymagają code review, type-check, test coverage. UI editor ryzykuje untested prod deploy.
- **Forza context** — Jane (NPD Manager) jest power-user ale nie programista; Monopilot staff (Kira) authoruje rules dla Forza jako service.
- **Versioning discipline** — rule = code = PR + git SHA + deploy pipeline = audit-trail natural. UI editor fragmentuje authoring historia.
- **Type-safety** — DSL body walidowane przez TS types w compile, nie tylko runtime. UI editor wymuszałby full runtime validation.
- **Testing** — rules muszą mieć unit tests (Vitest) + dry-run golden set. PR flow to zapewnia; UI nie.

### 7.2 Admin capabilities (read-only)

Admin w SETTINGS UI:

- **List** wszystkich rules per org (filter: type / dept / active / dryrun-fail)
- **Detail** — DSL JSON pretty-printed + Mermaid flowchart (auto-generated z JSON)
- **Version history** — `rule_definitions` ORDER BY version DESC; diff view (N vs N-1)
- **Dry-run results** — `rule_dry_runs` list + sample input + result JSON (pass/fail/warnings)
- **Audit who-deployed-what** — `audit_log` filter `action='rule_deploy'`

### 7.3 Dev authoring workflow (out-of-UI)

1. Dev tworzy / edytuje JSON file w repo `/rules/<type>/<rule_code>.json`
2. Unit test (Vitest) required: feed fixture inputs, assert result
3. PR review + CI passes (schema validation + dry-run on golden set)
4. Merge → deploy pipeline runs migration: upsert `rule_definitions` (`version` = prior + 1, `active_to` prior = `active_from` new)
5. `audit_log` entry: `action='rule_deploy'`, `new_data` = DSL body, `user_id` = deploy bot, `deploy_ref` = git SHA
6. PostHog event `rule.deployed` for telemetry

### 7.4 4 Rule types (registry view per type)

| Type | Description | Example (Forza) | Source |
|---|---|---|---|
| **cascading** | Auto-fill downstream field z upstream | `pack_size → line (filtered dropdown) → dieset (auto)` | 01-NPD §6 |
| **conditional** | Required-if / visible-if logic | `Catch-weight product → require tare + gross weight` | 03-TECHNICAL (future) |
| **gate** | Block state transition | `Allergen changeover gate — cleaning + ATP + dual sign-off` | 00-FOUNDATION §7, 08-PRODUCTION |
| **workflow** | State machine jako dane | `WO lifecycle: DRAFT→READY→RUNNING→COMPLETE→CLOSED` | 04-PLANNING-BASIC, 08-PRODUCTION |

### 7.5 Hard-lock semantyka (carry-forward od Phase D §19)

**Status:** `[EVOLVING]` — pending Phase C2+ resolution.

Open question: kto może publish rule — dev (zwykły PR merge) czy wymagany Owner approval w SETTINGS UI przed deploy job picks up?

Current proposal (not yet locked):
- L1 rule (universal) = dev PR → deploy bez admin click
- L2 rule variant (tenant-specific) = dev PR → deploy + admin "acknowledge" w SETTINGS UI (soft gate, audit-only, nie blocking)
- L3 rule (per-tenant custom) = dev PR scoped per tenant → deploy scope-checked + admin approval required

Decyzja defer do 02-SETTINGS build sub-module d (kiedy rule registry UI faktycznie implementowane).

### 7.6 UI surfaces

| Screen code | Screen | Capability |
|---|---|---|
| SET-040 | Rules Registry | List + filter |
| SET-041 | Rule Detail | JSON + Mermaid + version history + dry-run results |
| SET-042 | Rule Version Diff | JSON deep diff (side-by-side) |

### 7.7 Validation V-SET-RULES

- **V-SET-10**: `rule_definitions.definition_json` validates przeciw JSON Schema per `rule_type` (cascading/conditional/gate/workflow mają różne shapes)
- **V-SET-11**: `active_from` < `active_to` lub `active_to` NULL
- **V-SET-12**: Unique constraint `(org_id, rule_code, version)` zapobiega duplicate deploy
- **V-SET-13**: Dry-run results coverage — każdy rule ma ≥1 dry-run run w prior 30 dni (monitoring alert jeśli brak)

### 7.8 Registered Rules Registry (Phase C cumulative, v3.3 delta)

**Cumulative rule registry across Phase C modules** (post-C5 Sesja 1). Wszystkie rules authored przez dev w PR → deploy as migration; admin tylko read + audit + dry-run viewer (per Q2 decision).

| # | Rule Code | Type | Phase | Producer | Consumer(s) | Purpose |
|---|---|---|---|---|---|---|
| 1 | `allergen_cascade_v1` | cascading | P1 | 03-TECH §10 | 01-NPD, 09-QA, 11-SHIP labels | RM → intermediate → FA allergen inheritance (EU 1169/2011) |
| 2 | `fefo_strategy_v1` | conditional | P1 | 05-WH §9 | 04-PLAN, 08-PROD, 11-SHIP | FEFO primary + FIFO fallback + expired LP block |
| 3 | `finite_capacity_solver_v1` | optimizer | P1 | 07-EXT §6 | 04-PLAN, 08-PROD | Heuristic greedy+local search Python microservice |
| 4 | `allergen_sequencing_optimizer_v2` | optimizer | P1 | 07-EXT §6 | 08-PROD changeover gate | P1 basic heuristic; v2 full optimizer |
| 5 | `disposition_bridge_v1` | conditional | **P2 stub** | 07-EXT §5.10 | 05-WH §10 P2 | Intermediate LP disposition direct_continue/planner_decides P2 |
| 6 | `wo_state_machine_v1` | workflow | P1 | 08-PROD §6 | 08-PROD lifecycle + 11-SHIP gate | WO state machine DRAFT→READY→RUNNING→COMPLETE→CLOSED |
| 7 | `allergen_changeover_gate_v1` | gate | P1 | 08-PROD §7 | 08-PROD + 09-QA dual sign-off | Cleaning + ATP + dual sign-off BRCGS Issue 10 |
| 8 | `closed_production_strict_v1` | gate | P1 | 08-PROD §6 | 08-PROD WO close | Strict close validation (all outputs + waste + downtime logged) |
| 9 | `output_yield_gate_v1` | gate | P1 | 08-PROD §9 | 08-PROD + 10-FIN variance | Block close if yield < threshold (configurable) |
| 10 | `qa_status_state_machine_v1` | workflow | P1 | 09-QA §6 D3 | 05-WH LP state, 11-SHIP gate | 7-status QA lifecycle workflow-as-data |
| 11 | `ccp_deviation_escalation_v1` | gate | P1 | 09-QA §10 | 08-PROD + 09-QA auto-NCR | CCP deviation → auto-NCR + auto-hold escalation |
| 12 | `batch_release_gate_v1` | gate | **P2** | 09-QA §10 | 08-PROD WO close + 11-SHIP ship confirm | Hard gate batch release (all inspections pass + no critical holds) |
| 13 | `cost_method_selector_v1` | conditional | P1 | 10-FIN §10 | 10-FIN consume handler | FIFO/WAC parallel selection per org/product |
| 14 | `waste_cost_allocator_v1` | conditional | P1 | 10-FIN §10 | 10-FIN + 08-PROD waste events | Full-loss vs recovery allocation (consumer `waste_categories` 02-SETTINGS §8) |
| 15 | `standard_cost_approval_v1` | gate | **P2 stub** | 10-FIN §10 | 10-FIN standard_cost finalize | Finance_manager sole approver P1; dual sign-off v2.0 P2 |
| 16 | `so_state_machine_v1` | workflow | P1 | 11-SHIP §7 | 11-SHIP lifecycle service | SO state machine draft→confirmed→allocated→picking→packing→shipped→delivered |
| 17 | `eudr_compliance_gate_v1` | gate | **P2 stub** | 11-SHIP §7 | 11-SHIP ship confirm P2 | EU Deforestation Regulation supplier DDS gate (2026-12-30 deadline) |
| 18 | **`report_access_gate_v1`** (v3.2) | gate | P1 | 12-REPORTING §7 | 12-REPORTING all dashboards + 15-OEE reuse | RBAC per dashboard_id + feature flag gate + multi-site access check |
| 19 | **`scheduled_report_distribution_v1`** (v3.2) | workflow | **P2 stub** | 12-REPORTING §7 | 12-REPORTING P2 cron email delivery | Cron-triggered report render + Resend delivery + DLQ retry |
| 20 | **`shift_aggregator_v1`** (v3.2) | workflow | P1 | 15-OEE §7 | 15-OEE `oee_shift_metrics` MV + 12-REPORTING + 13-MAINT P2 | Post-shift-end aggregation `oee_snapshots` → `oee_shift_metrics`, L2 configurable boundaries |
| 21 | **`oee_anomaly_detector_v1`** (v3.2) | conditional | **P2 stub** | 15-OEE §7 | 15-OEE alerts + notifications | EWMA 30-min window, 2σ threshold, alpha=0.3 food-mfg tuning |
| 22 | **`oee_maintenance_trigger_v1`** (v3.2) | gate | **P2 stub** | 15-OEE §7 | 13-MAINTENANCE auto-PM generation | Availability < threshold 3 consecutive days → auto-create PM WO |
| 23 | **`mwo_state_machine_v1`** (v3.3) | workflow | P1 | 13-MAINT §8 | 13-MAINT lifecycle service | 6-state unified WR+MWO lifecycle (requested/approved/open/in_progress/completed/cancelled) + segregation of duties + LOTO/sanitation guards |
| 24 | **`pm_schedule_due_engine_v1`** (v3.3) | cascading | P1 | 13-MAINT §8 | 13-MAINT daily pg_cron | Scan `maintenance_schedules.next_due_date` ≤ today+warning → auto-generate MWO in state `open` |
| 25 | **`calibration_expiry_alert_v1`** (v3.3) | cascading | P1 | 13-MAINT §8 | 13-MAINT daily pg_cron + 09-QA consumer | Scan `calibration_records.next_due_date`, emit alerts 30d/7d/overdue (Resend via 02-SET §13) |
| 26 | **`spare_parts_reorder_alert_v1`** (v3.3) | gate | P1 | 13-MAINT §8 | 13-MAINT + 10-FIN P2 purchase request | `spare_parts_stock.qty_on_hand <= reorder_point` → alert + create purchase request draft (P2 D365 push) |
| 27 | **`sanitation_allergen_gate_v1`** (v3.3) | gate | P1 | 13-MAINT §8 | 13-MAINT + 08-PROD `allergen_changeover_gate_v1` consumer | Sanitation MWO with allergen_change_flag → require dual sign-off (tech+QA) + ATP test + RLU threshold check |
| 28 | **`loto_pre_execution_gate_v1`** (v3.3) | gate | P1 | 13-MAINT §8 | 13-MAINT safety service | Equipment.requires_loto=true → MWO `in_progress` blocked without `mwo_loto_checklists.verified_at` NOT NULL |
| 29 | **`site_access_policy_v1`** (v3.3) | gate | P1 | 14-MULTI §8 | 14-MULTI RLS policy builder + migration lint | Per-table decision operational (site-scoped) vs master (org-scoped); admin read-only registry |
| 30 | **`cross_site_to_approval_v1`** (v3.3) | gate | P1 | 14-MULTI §8 | 14-MULTI inter-site TO workflow | Inter-site TO (from_site != to_site) → requires from_site manager approval before shipped + to_site manager approval before received (dual-gate) |
| 31 | **`per_site_residency_gate_v1`** (v3.3) | gate | **P2 stub** | 14-MULTI §8 | 14-MULTI P2 data residency enforcement | Enforce data landing on correct region per site (EU-West-2 Forza UK vs EU-Central-1 KOBE DE) |

**P1 active rules (v3.3):** 24 (rules 1-4, 6-11, 13-14, 16, 18, 20, **23-30**) — all deployed z corresponding modules
**P2 stub rules (v3.3):** 7 (rules 5, 12, 15, 17, 19, 21, 22, **31**) — schema registered, implementation deferred

Note: `to_state_machine_v1` (05-WH base) extended by 14-MULTI z IN_TRANSIT state per D-MS-3 (§8 14-MULTI). Extension documented w owner PRD (05-WH), nie re-registered jako osobny rule.

**lp_state_machine_v1** z 05-WH §6.1 jest workflow-as-data rule **w** 05-WH schema (nie w 02-SETTINGS registry) per decision 2026-04-20 (05-WH ownership). Rule registry tu = dev-authored rules requiring runtime engine execution; LP state machine = DB enum + service logic (no runtime engine).

**Total rules registered post-C5 Sesja 2:** 31 rules (24 P1 active + 7 P2 stub) across 11 producer modules (03-TECH, 05-WH, 07-EXT, 08-PROD, 09-QA, 10-FIN, 11-SHIP, 12-REPORTING, 15-OEE, **13-MAINTENANCE, 14-MULTI-SITE**). Consumer mapping tracked w `rule_consumers` metadata JSONB.

**V-SET-14 (new v3.1):** All rules registered w §7.8 MUST have corresponding JSON schema w `/rules/<type>/<rule_code>.schema.json` deployed w repo. Registry rejects rule save if schema not present.

---

## §8 — Reference Tables CRUD

Generic metadata-driven UI dla **24 tabel konfiguracyjnych** (8 z v7 + 3 w v3.0 Phase C1 + 6 w v3.1 delta post-C4 Sesja 3 + 3 w v3.2 delta post-C5 Sesja 1 + 4 w v3.3 delta post-C5 Sesja 2 cumulative).

### 8.1 Tabele

| # | Code | Source | Rows (Forza) | Marker |
|---|---|---|---|---|
| 1 | `dept_columns` | v7 Reference §2 | 58 | [UNIVERSAL] storage, [FORZA-CONFIG] content |
| 2 | `pack_sizes` | v7 Reference §3 | 5 | [UNIVERSAL] concept, [FORZA-CONFIG] values |
| 3 | `lines_by_pack_size` | v7 Reference §4 | 5 | [FORZA-CONFIG] |
| 4 | `dieset_by_line_pack` | v7 Reference §5 | 10 | [FORZA-CONFIG] |
| 5 | `templates` | v7 Reference §6 | 4 | [UNIVERSAL] concept, [FORZA-CONFIG] templates |
| 6 | `email_config` | v7 Reference §7 | 0 (empty baseline) | [UNIVERSAL] + [EVOLVING] recipients |
| 7 | `processes` | v7 Reference §8 | 8 (Strip/A, Coat/B, Honey/C, Smoke/E, Slice/F, Tumble/G, Dice/H, Roast/R) | [FORZA-CONFIG] + [EVOLVING] |
| 8 | `close_confirm` | v7 Reference §9 | 2 | [UNIVERSAL] |
| 9 | **`alert_thresholds`** (v3.0) | 01-NPD §11 + EVOLVING §14 | 2 (RED=10d, YELLOW=21d) | [FORZA-CONFIG], config-driven od v3 |
| 10 | **`allergens_reference`** (v3.0) | 01-NPD §8 | EU-14 + 3-5 custom | [UNIVERSAL] + [FORZA-CONFIG] |
| 11 | **`d365_constants`** (v3.0) | v7 D365-INTEGRATION §13 + EVOLVING §10.3 | 5 baseline + 4 P2 ext (v3.1 per §11.7) | [FORZA-CONFIG] + [LEGACY-D365] |
| 12 | **`quality_hold_reasons`** (v3.1, z 09-QA Q3) | 09-QA §6.3 + §8 | ~8-12 rows (allergen_cross/pathogen/temp_excursion/packaging/labeling/expiry/customer_complaint/other) + priority + default_hold_duration_days | [UNIVERSAL] |
| 13 | **`qa_failure_reasons`** (v3.1, z 09-QA) | 09-QA §6 + §8 | ~10-15 rows (incoming inspection failure codes, NCR reason codes) | [UNIVERSAL] |
| 14 | **`waste_categories`** (v3.1, z 08-PROD) | 08-PROD §8 + 10-FIN §10 `waste_cost_allocator_v1` consumer | ~6-10 rows (trim/yield_loss/contamination/expired/packaging/test_sample/other) + full_loss vs recovery flag | [UNIVERSAL] |
| 15 | **`allergen_hold_reasons`** (v3.1, z 09-QA) | 09-QA §6 + 11-SHIP D-SHP-13 soft gate | ~5-8 rows (cross_contamination_risk/mislabel/missing_declaration/customer_restriction_conflict/other) | [UNIVERSAL] |
| 16 | **`shipping_override_reasons`** (v3.1 NEW z 11-SHIP) | 11-SHIP §7 D-SHP-13 | ~6-10 rows (fefo_deviation/quality_hold_non_critical/expired_lp_override/allergen_customer_override/supervisor_direction/customer_requested/other) | [UNIVERSAL] |
| 17 | **`rma_reason_codes`** (v3.1 NEW z 11-SHIP) | 11-SHIP §7 E07.5 | ~8-12 rows (defective/damaged_in_transit/wrong_product/quality_issue/expired/customer_error/not_as_described/quantity_discrepancy/other) + disposition_default (restock/scrap/quality_hold) | [UNIVERSAL] |
| 18 | **`dashboards_catalog`** (v3.2 NEW z 12-REPORTING) | 12-REPORTING §9 | 10 P1 + 20 P2 rows (dashboard_id, name, required_role, feature_flag, metadata_schema JSONB, enabled_for_tenants[]) — metadata-driven access via `report_access_gate_v1` | [UNIVERSAL] |
| 19 | **`shift_configs`** (v3.2 NEW z 15-OEE) | 15-OEE §9 + §10 | Forza baseline 3 rows (AM 00:00-08:00 / PM 08:00-16:00 / Night 16:00-00:00 UTC), L2 variation ADR-030 (2-shift/4-shift/24h custom) — consumer `shift_aggregator_v1` | [UNIVERSAL] + [FORZA-CONFIG] |
| 20 | **`oee_alert_thresholds`** (v3.2 NEW z 15-OEE; v3.4 `oee_target_pct` default updated 70) | 15-OEE §9 | 1+ rows per tenant (tenant default + per-line override), cols: oee_target_pct (default **70** Forza P1 baseline)/availability_min_pct/anomaly_alpha/anomaly_sigma/maintenance_trigger_threshold_pct — L2 per-line config ADR-031 | [UNIVERSAL] |
| 25 | **`changeover_target_duration_min`** (v3.4 NEW z 15-OEE OQ-OEE-05 decision 2026-04-21) | 15-OEE (changeover analysis), 08-PRODUCTION (optional inline display) | Per-line integer (minutes), optional per-FA override. Default null (no target; dashboards show "—", no breach detection). Editable by: Admin, Production Manager. Audit tracked. | [UNIVERSAL] |
| 21 | **`maintenance_alert_thresholds`** (v3.3 NEW z 13-MAINT) | 13-MAINT §13.2 | 1+ rows per tenant (default + per-equipment override), cols: pm_interval_default_days/calibration_warning_days (30/14/7)/mtbf_target_threshold_pct/availability_breach_threshold_pct (80 default)/atp_rlu_threshold (30 Forza) — L2 per-tenant config ADR-031 | [UNIVERSAL] + [FORZA-CONFIG] |
| 22 | **`technician_skills`** (v3.3 NEW z 13-MAINT) | 13-MAINT §9.2 | enum reference (basic/advanced/specialist + descriptions + required_certifications[]) — tenant-specific certs allowed L2 variation | [UNIVERSAL] |
| 23 | **`spare_parts_categories`** (v3.3 NEW z 13-MAINT) | 13-MAINT §9.8 | 8-15 rows (mechanical/electrical/consumables/lubricants/seals_gaskets/filters/safety/other) + tenant L3 ext | [UNIVERSAL] |
| 24 | **`sites_hierarchy_config`** (v3.3 NEW z 14-MULTI) | 14-MULTI §9.5 | 1 row per tenant (depth 2-5 + level_names[]); Forza baseline depth=3, level_names=['site','plant','line'] — L2 ADR-030 depth override | [UNIVERSAL] + [FORZA-CONFIG] |

Note: `shift_configs` (v3.2 #19) rozszerzone przez 14-MULTI o `site_id` scoping (per-site shifts D-MS-9 REC-L5) — nie re-added jako osobny wpis.

### 8.2 Schema definition (per table)

Każda Reference table ma schema definition w `reference_schemas` (table_code = 'reference.<code>'). Przykład dla `pack_sizes`:

```json
{
  "table_code": "reference.pack_sizes",
  "columns": [
    {"code": "pack_size", "data_type": "text", "required": true, "unique": true, "regex": "^\\d+x\\d+cm$"},
    {"code": "display_order", "data_type": "number", "required": false},
    {"code": "is_active", "data_type": "enum", "enum_values": ["true","false"], "required": true}
  ]
}
```

UI renderer używa tego definicji do generation formularza CRUD (RHF + Zod gen z §6.5).

### 8.3 CRUD operations

- `GET /api/settings/reference/:table_code` — list rows (filter/sort/paginate)
- `GET /api/settings/reference/:table_code/:row_key` — detail
- `POST /api/settings/reference/:table_code` — create row (upsert by `row_key`)
- `PUT /api/settings/reference/:table_code/:row_key` — update row
- `DELETE /api/settings/reference/:table_code/:row_key` — soft delete (`is_active=false`)
- `POST /api/settings/reference/:table_code/import` — bulk CSV upload z conflict detection
- `GET /api/settings/reference/:table_code/export` — CSV download

### 8.4 Version + audit

Każda mutation → `reference_tables.version++` + `audit_log` entry (`action='update'`, old/new JSONB diff). Concurrent edit handling: optimistic lock na `version` — reject + merge UI jeśli version mismatch.

Dropdown caches (hot path dla v7-equivalent renderer) = Postgres materialized view per (org_id, table_code), REFRESH on row mutation via trigger.

### 8.5 CSV import/export

- **Export** — current active rows → CSV; header row z `column_code` z `reference_schemas`
- **Import** — parse CSV → validate Zod per row → conflict detection (by `row_key`):
  - Skip (row_key exists, identical data)
  - Update (row_key exists, diff detected)
  - Insert (new row_key)
  - Error (validation failed; batch abort lub row-level skip option)
- Import generuje summary: "X inserted, Y updated, Z skipped, W errors". Admin reviews before commit.

### 8.6 UI surfaces

| Screen code | Screen | Capability |
|---|---|---|
| SET-050 | Reference Tables Index | List 11 tabel + row count + last modified |
| SET-051 | Reference Table Detail | Generic data grid z schema-driven cols |
| SET-052 | Reference Row Edit Modal | RHF form z Zod validation |
| SET-053 | CSV Import Wizard | Upload → preview → commit |
| SET-054 | Reference Audit Trail | Per-row history z diff viewer |

### 8.7 Validation V-SET-REF

- **V-SET-20**: Row Zod validation passes (per `reference_schemas`)
- **V-SET-21**: `row_key` unique w scope `(org_id, table_code)`
- **V-SET-22**: Dropdown_source FK integrity — soft-delete row referencowanego przez `reference_schemas.dropdown_source` wymaga confirm (warning, nie blocker)
- **V-SET-23**: CSV import — header row musi matchować `reference_schemas.columns` (case-insensitive, trimmed)

### 8.8 New config fields (v3.4 delta — 2026-04-21 stakeholder decisions)

#### `changeover_target_duration_min` (NEW — OQ-OEE-05 decision 2026-04-21)

| Attribute | Value |
|---|---|
| Field name | `changeover_target_duration_min` |
| Type | Integer (minutes) |
| Scope | Per line (required entry in `production_lines` config) + optional per-FA override (stored in `reference_tables` table_code `changeover_targets`, row_key `{line_id}:{fa_code}`) |
| Default | `null` — no target set; dashboards show "—" and no breach detection applied |
| Range | 1–480 minutes |
| Editable by | Admin, Production Manager |
| Audit | Tracked in `audit_log` (action='update', table='reference_tables', row_key=line_id) |
| Consumed by | 15-OEE (changeover analysis tab in OEE-003), 08-PRODUCTION (optional inline display on changeover events) |
| API | `GET /api/settings/reference/changeover-targets` / `PUT /api/settings/reference/changeover-targets/:line_id` |
| UI location | 02-SETTINGS → Reference Tables → Changeover Targets (new table entry #25 in §8.1) |

**Per-FA override:** Optional. If a FA-specific override exists for a changeover event's source FA, it takes precedence over the per-line value. Stored as `{line_id}:{fa_code}` row_key in the same reference table.

**Dashboard behavior when null:** 15-OEE Changeover Analysis tab shows "—" in the Target column and suppresses the variance badge. No breach alert is generated. A tooltip notes "No target configured — set in 02-SETTINGS Changeover Targets."

#### `oee_alert_thresholds.oee_target_pct` (UPDATED default — OQ-OEE-02 decision 2026-04-21)

| Attribute | Value |
|---|---|
| Field name | `oee_alert_thresholds.oee_target_pct` |
| Type | Numeric (0–100, 1dp) |
| Default | **70** — Forza P1 ramp-up baseline (changed from 85 per OQ-OEE-02) |
| Range | 0–100 |
| Editable by | `oee_admin` role |
| Audit | Tracked in settings history |
| Consumed by | 15-OEE — controls target reference line on charts (OEE-001 trend, OEE-003 summary). P2: will also control heatmap color scale thresholds (per OQ-OEE-07). |
| Note | P1 heatmap color scale remains fixed at 65/85 industry thresholds regardless of this value (OQ-OEE-07 decision). This field only moves the dashed target line on OEE-001 and informs amber/red threshold derivation for P2. |

**Amber/red derivation (P1 reference lines, not heatmap):**
- Green: OEE ≥ `oee_target_pct` (e.g., ≥ 70%)
- Amber: `oee_target_pct × 0.786` ≤ OEE < `oee_target_pct` (e.g., 55–70%, proportionally derived)
- Red: OEE < `oee_target_pct × 0.786` (e.g., <55%)

Note: The exact amber/red cutoffs for P1 badge coloring on individual KPI cards are derived proportionally from the target. Heatmap color scale remains fixed 65/85 (not derived from target in P1).

---

## §9 — Multi-tenant L2 Config [ADR-031]

### 9.1 L2 variation surface

Admin może konfigurować (w ramach L2 scope):

1. **Dept taxonomy** (ADR-030) — split / merge / custom depts
2. **Rule variant selection** — wybór v1 vs v2 dla określonej reguły (np. `allergen_gate.v1` vs `v2`)
3. **Feature flags local** — per-tenant toggle dla Phase 2/3 capabilities
4. **Schema extensions count** (informational) — L3 cols metadata

### 9.2 Dept taxonomy variation (§9 00-FOUNDATION + ADR-030)

Baseline 7 depts Forza `[FORZA-CONFIG]`:
`core` | `technical` | `packaging` | `mrp` | `planning` | `production` | `price`

(Uwaga: w 00-FOUNDATION §9 baseline Forza ma `packaging` + `price` zamiast v7 `Commercial`/`Procurement`. Reality v7 vs target Monopilot differs — renaming decision per Phase D #15. W v7 reality: Core / Planning / Commercial / Production / Technical / MRP / Procurement. Per Monopilot Phase D: renaming → Core / Technical / Packaging / MRP / Planning / Production / Price. L2 config obsługuje obie konfiguracje jako L2 variants.)

L2 operations:
- **Split**: np. `Technical` → `Food-Safety` + `Quality-Lab`
- **Merge**: np. `MRP` + `Planning` → `Supply-Chain`
- **Add custom**: np. `Regulatory-Affairs` jako nowy dept

Storage: `tenant_variations.dept_overrides` JSONB:
```json
{
  "dept_overrides": [
    {"action": "split", "source": "technical", "targets": ["food-safety", "quality-lab"], "column_mapping": {...}},
    {"action": "add", "code": "regulatory-affairs", "name_pl": "Sprawy regulacyjne", "display_order": 8}
  ],
  "mapped_at": "2026-05-10T12:00:00Z"
}
```

Runtime: cascade/gate rules resolved przez `dept_resolver(tenant_id, dept_code)` — maps L1 dept code → effective L2 dept. Column ownership re-assigned per mapping.

### 9.3 Rule variant selection

Tenant_variations stores per-rule variant choice:

```json
{
  "rule_variant_overrides": {
    "allergen_changeover_gate": "v2",
    "pack_size_cascade": "v1",
    "price_blocking_rule": "v1"
  }
}
```

Registry (§7) stores multiple versions (rule_definitions.version 1..N). Runtime picks variant per tenant preferences.

### 9.4 Upgrade orchestration (ADR-031 §5.4)

**Flow: "Migrate to v2"** dla określonego komponentu (np. rule_engine, schema, feature v2):

1. Admin klika "Preview v2" → UI shows diff (JSON + Mermaid + affected rows count)
2. Admin konfirmuje → `tenant_migrations` insert `(status='scheduled', target_version)`
3. Background job picks up — phase 1: canary 5-10% requests routed to v2
4. Monitor 15-30 min (PostHog metrics + error rate)
5. Admin decyduje: rollback (`status='rolled_back'`), hold (canary stays at 10%), progress (`status='progressive'`, route 50%)
6. Progressive 100% → `status='completed'`, `upgraded_at`, `upgraded_from/to_version` set

**Dual-run** — dla reguł critical (gate, workflow), stare + nowe variant run in parallel dla ~30 dni, diff results logged. Rollback trivial.

**Opt-in, max 2-3 major versions back** — po 3 majors bez upgrade Monopilot triggers force migration (`status='force_scheduled'`, 30-day notice).

### 9.5 Data residency [R7]

- `organizations.region` enum: `eu` | `us` | `apac`
- EU cluster default dla Forza + EU customers
- US cluster gdy USA customer pojawia się
- Global control plane (Monopilot HQ) + regional data planes (Postgres cluster + Next.js API runtime per region)
- Cross-region restricted: admin nie zmienia `region` po onboarding (migration wymaga osobnego support ticket)

### 9.6 Admin tooling (superadmin only, Monopilot staff)

- **Impersonation**: `SET LOCAL app.impersonating_as = user_id` — audit każda operacja, `audit_log.impersonating_as` set
- **Tenant switcher**: MFA + SIEM logged, 1h session max
- **Cross-tenant analytics**: osobny warehouse schema (denormalized snapshots co 6h), **nigdy prod RLS bypass**
- **Feature flags global targeting**: PostHog per-tenant rollout control

### 9.7 UI surfaces

| Screen code | Screen | Capability |
|---|---|---|
| SET-060 | Tenant Variations Dashboard | List L2 overrides active |
| SET-061 | Dept Taxonomy Editor | Split/merge/add dept wizard |
| SET-062 | Rule Variant Selector | Per-rule v1/v2 picker |
| SET-063 | Upgrade Orchestration | Canary controls + rollback |
| SET-064 | Migration History | `tenant_migrations` audit |

### 9.8 Validation V-SET-L2

- **V-SET-30**: Dept split `targets[]` non-empty + unique codes + column_mapping covers all source dept cols
- **V-SET-31**: Rule variant choice must reference existing `rule_definitions.version`
- **V-SET-32**: Region change post-onboarding blocked w UI (support ticket path)
- **V-SET-33**: Force migration countdown warning 30-day, 7-day, 1-day notifications

### 9.9 Open items

- **Opt-in granularity** — per-rule vs per-module vs per-tenant? Research §5.4 daje framework, Phase D carry-forward. Decyzja w 02-SETTINGS build sub-module b.
- **Rollback time-window** — ile dni po `status='completed'` admin może rollback bez support? Proposal: 7 dni, locked po.

---

## §10 — Module Toggles + Feature Flags

### 10.1 Module toggles

15 Phase D modules (00-FOUNDATION §4.3) + INTEGRATIONS distributed stages.

```sql
-- Extension do organization_modules:
ALTER TABLE organization_modules ADD COLUMN phase INT;  -- denormalized for UI filter
```

Modules lista (baseline `modules` table populated z migration):

| Code | Phase | Depends_on | Default enabled |
|---|---|---|---|
| `00-foundation` | 1 | — | true (not toggleable, core) |
| `01-npd` | 1 | 00, 02 | true (primary) |
| `02-settings` | 1 | 00 | true |
| `03-technical` | 1 | 00, 02 | true |
| `04-planning-basic` | 1 | 00, 02, 03 | true |
| `05-warehouse` | 1 | 00, 02, 03 | true |
| `06-scanner-p1` | 1 | 05 | true |
| `07-planning-ext` | 2 | 04 | false |
| `08-production` | 1 | 04, 05 | true |
| `09-quality` | 2 | 08 | false |
| `10-finance` | 2 | 08, 10 | false |
| `11-shipping` | 2 | 05, 08 | false |
| `12-reporting` | 2 | 01, 08, 10 | false |
| `13-maintenance` | 2 | 03 | false |
| `14-multi-site` | 3 | — | false |
| `15-oee` | 3 | 08 | false |

Dependency checker: admin toggles off → warning jeśli downstream module depends on it (`organization_modules.enabled=true` dla downstream), UI pokazuje "disable chain".

### 10.2 Feature flags

**Tool**: PostHog self-host (per 00-FOUNDATION §5 tech stack) + built-in fallback table dla critical core toggles (module on/off, maintenance mode).

Built-in fallback:
```sql
CREATE TABLE feature_flags_core (
  org_id UUID NOT NULL REFERENCES organizations(id),
  flag_code TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  rolled_out_pct INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (org_id, flag_code)
);
```

Core flags (fallback scope):
- `maintenance_mode` (read-only app-wide)
- `integration.d365.enabled` (INTEGRATIONS stage 1)
- `scanner.pwa.enabled`
- `npd.d365_builder.execute`

Non-core flags (PostHog):
- A/B tests, feature previews, per-tenant rollout, UI experiments

### 10.3 UI surfaces

| Screen code | Screen | Capability |
|---|---|---|
| SET-070 | Module Toggles Dashboard | 15 modułów grid z phase badge + dependency warnings |
| SET-071 | Feature Flags Core | Built-in fallback flags edit |
| SET-072 | PostHog Feature Flags Proxy | Read-through view PostHog flags per org |

### 10.4 Validation V-SET-MOD

- **V-SET-40**: Cannot disable module if downstream `organization_modules.enabled=true` without explicit disable-chain confirmation
- **V-SET-41**: `maintenance_mode=true` blocks non-superadmin writes app-wide (middleware enforces)
- **V-SET-42**: `integration.d365.enabled=true` wymaga `d365_constants` rows (5 wymaganych) populated (validation runs on flag flip)

---

## §11 — D365 Constants Admin [INTEGRATIONS stage 1 inline]

**Marker:** `[FORZA-CONFIG]` + `[LEGACY-D365]`. Retirement path gdy Monopilot zastępuje D365.

### 11.1 5 Forza D365 Constants

Z v7 D365-INTEGRATION §13 reality:

| Constant | Key | Meaning | Example value |
|---|---|---|---|
| PRODUCTIONSITEID | `FNOR` | Forza North site code | `FNOR` |
| APPROVERPERSONNELNUMBER | `FOR100048` | Approver employee # | `FOR100048` |
| CONSUMPTIONWAREHOUSEID | `ForzDG` | Forza warehouse code | `ForzDG` |
| PRODUCTGROUPID | `FinGoods` | Finished Goods group | `FinGoods` |
| COSTINGOPERATIONRESOURCEID | `FProd01` | Forza Production resource | `FProd01` |

Stored w Reference table `d365_constants` (§8.1 #11).

### 11.2 INTEGRATIONS stage 1 scope

Per HANDOFF decision (2026-04-19):
- **Inline w 02-SETTINGS** (D365 Constants admin + toggle) + **inline w 03-TECHNICAL** (D365 item/BOM one-way sync spec — to będzie w 03-TECHNICAL PRD)
- **Read-mostly cache**: Items + BOM/formula pulled z D365 (nightly refresh + on-demand); Monopilot nie edytuje D365 items
- **Push**: production confirmations (WO closed) → D365 journal posting

Stage 1 flows (high-level):

```
D365 → Monopilot (pull):
  Items (daily or on-demand)
  BOM/formula versions (daily)

Monopilot → D365 (push):
  Production confirmations (WO completed)
  Journal postings (receipt/issue)
```

### 11.3 Admin UI

Tab **Integrations > D365** w SETTINGS (per Q4 decision):

| Screen code | Screen | Capability |
|---|---|---|
| SET-080 | D365 Connection Config | Base URL, service account, OAuth credentials, test connection |
| SET-081 | D365 Constants Editor | 5 konstant edytowalne (Reference tables §8) |
| SET-082 | Sync Config | Pull schedule (cron), push queue, retry policy, dead-letter queue view |
| SET-083 | Sync Audit | Last N sync results + errors + manual trigger |

### 11.4 Feature flag

`integration.d365.enabled` (core fallback flag, §10.2):
- `false` (default) — Monopilot standalone, Builder output = files only
- `true` — pull/push aktywne, config w §11.3

Flag flip wymaga 5 constants populated (V-SET-42) + test connection passed + user role `owner` lub `npd_manager`.

### 11.5 Retirement path

Gdy Monopilot zastępuje D365 (Phase roadmap post-C5):
1. `integration.d365.enabled=false`
2. `d365_constants` rows → archive (soft delete)
3. D365 sync config disabled
4. Builder output files retained w archiwum, nie generowane na new FAs

Retirement trigger = osobny migration (Monopilot staff controlled), nie admin UI.

### 11.6 Validation V-SET-D365

- **V-SET-50**: 5 constants populated przed `integration.d365.enabled=true`
- **V-SET-51**: Service account credentials stored encrypted (`pgcrypto` or Vault integration)
- **V-SET-52**: Test connection passes before flag flip
- **V-SET-53**: Sync push dead-letter queue monitored — admin alert jeśli >24h stuck

### 11.7 D365 Constants P2 Extensions (v3.1 delta post-11-SHIP C4 Sesja 3)

Rozszerzenie podstawowego zestawu 5 constants (§11.1) o P2 extensions konsumowane przez 11-SHIPPING INTEGRATIONS stage 3 + przyszłe modules:

| Constant (v3.1 P2) | Key (sample) | Meaning | Consumer module | Phase |
|---|---|---|---|---|
| SHIPPINGSITEID | `ForzDG_SHIP` (may equal ForzDG lub różne dla multi-site) | Shipping warehouse code for D365 SalesOrder fulfillment | 11-SHIP §12.8 D365 SalesOrder push | P2 + 14-MULTI-SITE |
| CUSTOMERACCOUNTIDMAP | JSONB `{customer_id_uuid: d365_cust_account, ...}` | Monopilot customer_id ↔ D365 CustAccount mapping (per-org) | 11-SHIP D365 push + 10-FIN P2 invoicing | P2 |
| COURIERDEFAULTCARRIER | `DHL` / `UPS` / `DPD` / `MANUAL` | Default carrier for new shipments (P1 MANUAL baseline) | 11-SHIP Phase 2 EPIC 11-F | P2 |
| COURIERAPIVAULTKEY | Opaque vault ref (Supabase Vault encrypted) | API key vault reference for carrier integration | 11-SHIP Phase 2 EPIC 11-F | P2 |
| FINANCECOSTPOSTINGACCOUNT | `1234-1000` (matches FinGoods default) | GL account for COGS posting (Q5 daily consolidated) | 10-FIN §12 stage 5 (already active v3.0) | P1 active |
| EUDRDDSENDPOINT | EU TRACES IT base URL | DDS lookup endpoint for supplier compliance gate | 11-SHIP P2 EPIC 11-H (D-SHP-20) | P2 |

**Storage:** w Reference table `d365_constants` (§8.1 #11) z flagami `is_p1_active` / `is_p2_stub` dla każdej row. UI renderuje P2 rows jako read-only stub + tooltip "P2 — aktywacja przy EPIC X-Y".

**Shared artifacts (cumulative across 08-PROD + 10-FIN + 11-SHIP):**
- `@monopilot/d365-adapter-common` — base HTTP client, auth, retry logic
- `@monopilot/d365-code-mapper` — R15 anti-corruption lookup utility (reads `integration.d365.code_map` JSONB)
- `@monopilot/d365-outbox-dispatcher` — shared worker service (polls wszystkie outbox tables, routes by `target_system`)
- `@monopilot/d365-production-adapter` (08-PROD §12 stage 2)
- `@monopilot/d365-finance-adapter` (10-FIN §12 stage 5)
- `@monopilot/d365-shipping-adapter` (11-SHIP §12 stage 3)

Retirement path P2 extensions: identical z §11.5 baseline — gdy Monopilot zastępuje D365, wszystkie rows archived (soft delete), feature flag `integration.d365.enabled=false` disables całą stack.

### 11.8 INTEGRATIONS stages summary (cumulative post-C4 Sesja 3)

| Stage | Producer/Consumer | Event types | Status |
|---|---|---|---|
| **Stage 1** (pull + push w/o outbox) | 03-TECHNICAL ⇄ D365 | items.imported, bom.imported, d365.constants.synced | ✅ v3.0 |
| **Stage 2** (push via outbox) | 08-PRODUCTION → D365 | wo.confirmation_pushed | ✅ v3.0 |
| **Stage 3** (push via outbox) | 11-SHIPPING → D365 | shipment.confirmed, rma.processed | ✅ v3.0 (C4 Sesja 3) |
| **Stage 4** (consumer EPCIS) | 05-WAREHOUSE + 11-SHIPPING → EPCIS 2.0 | lp.aggregated, lp.shipped (JSON-LD) | P2 (WH-E16 + 11-L) |
| **Stage 5** (push via outbox, daily consolidated) | 10-FINANCE → D365 | cost.posted (GeneralJournalLineEntity daily) | ✅ v3.0 (C4 Sesja 2) |
| **Stage 6** (future) | RMA full cycle → D365 | rma.credit_memo (AR adjustments P2) | P2 (10-M consumer) |

Stages 1+2+3+5 are P1 active post-C4 Sesja 3. Stages 4+6 are P2 deferred.

---

## §12 — Infrastructure (refined)

Refinement baseline E01.3.

### 12.1 Entities

Warehouses / Locations / Machines / Production_Lines — per §5.6 SQL schemas.

**Enhancements v3.0:**
- `locations.path` = materialized ltree (enable `@>` ancestor queries fast)
- `machines.specs` JSONB = ADR-028 L3 extension point (per-org machine spec vars)
- `production_lines.default_location_id` = FK for WO default warehouse/zone
- Soft-delete strategy: `deactivated_at` zamiast hard DELETE (audit preservation + FK integrity)

### 12.2 CRUD UI (existing, refined)

| Screen code | Screen | Capability |
|---|---|---|
| SET-012 | Warehouse List | sort, filter, bulk activate/deactivate |
| SET-013 | Warehouse Edit | form + address autocomplete |
| SET-014 | Location Tree | drag-drop (Phase 2), import CSV |
| SET-015 | Location Edit | parent picker z path validation |
| SET-016 | Machine List | status indicator, location breadcrumb |
| SET-017 | Machine Edit | specs JSONB editor (schema-driven §6) |
| SET-018 | Line List | machine sequence preview |
| SET-019 | Line Edit | machine assignment drag-drop |

### 12.3 Validation V-SET-INFRA

- **V-SET-60**: Location parent must be same `warehouse_id` + `level = parent.level + 1`
- **V-SET-61**: Machine `location_id` must reference bin-level location (level=4)
- **V-SET-62**: Line must have ≥1 machine assigned before activation
- **V-SET-63**: Warehouse deactivation blocked if active WOs reference (soft warning + force option)

---

## §13 — EmailConfig + Notifications

### 13.1 EmailConfig Reference table (activation)

Pozycja `reference_tables` z `table_code='email_config'`. Schema (per `reference_schemas`):

```json
{
  "columns": [
    {"code": "trigger_code", "data_type": "enum", "enum_values": [
      "core_closed", "production_closed", "mrp_closed", "fa_d365_ready",
      "schema_migration_requested", "tenant_upgrade_canary_failed"
    ]},
    {"code": "recipients_to", "data_type": "text"},       // semicolon-separated emails or role codes
    {"code": "recipients_cc", "data_type": "text"},
    {"code": "subject_template", "data_type": "text"},
    {"code": "body_template", "data_type": "text"},       // Mustache syntax {{fa_code}}, {{dept}}
    {"code": "is_active", "data_type": "enum", "enum_values": ["true","false"]}
  ]
}
```

### 13.2 Email service

- **Provider**: Resend (default) lub Postmark (alternative) — config per `integration.email.provider`
- **Template engine**: Mustache (simple variable substitution)
- **Queue**: outbox pattern (per 00-FOUNDATION §10) — email job = outbox event consumed by worker
- **Retry**: 3× exponential backoff, DLQ after

### 13.3 Notification preferences (user-level)

```sql
CREATE TABLE notification_preferences (
  user_id UUID REFERENCES users(id),
  org_id UUID REFERENCES organizations(id),
  category TEXT NOT NULL,                                -- 'npd'|'production'|'schema'|'integration'
  event TEXT NOT NULL,                                   -- match email_config.trigger_code lub subset
  channel_email BOOLEAN DEFAULT true,
  channel_in_app BOOLEAN DEFAULT true,
  PRIMARY KEY (user_id, org_id, category, event)
);
```

### 13.4 UI surfaces

| Screen code | Screen | Capability |
|---|---|---|
| SET-090 | Email Config Editor | Reference CRUD wrapper dla trigger table |
| SET-091 | Email Template Preview | Sample render z fake FA data |
| SET-092 | User Notification Prefs | Per-user toggle matrix |
| SET-093 | Email Delivery Log | Last N sent + failed + retry status |

### 13.5 Validation V-SET-EMAIL

- **V-SET-70**: `recipients_to` non-empty gdy `is_active=true`
- **V-SET-71**: Template variables `{{var}}` exist w event payload schema
- **V-SET-72**: Provider credentials valid (test send na flag flip)

---

## §14 — Security + i18n + Onboarding

### 14.1 Security policies (per §5.7)

- `org_security_policies.password_min_length` default 12, min 8, max 128
- `password_history_count` default 5, prevents reuse
- `session_timeout_minutes` default 480 (8h), min 15, max 1440
- `lockout_threshold` default 5, after → 15min cool-down
- `mfa_requirement`:
  - `disabled` — no MFA anywhere
  - `optional` — user-opt-in
  - `required_admins` — owner/admin/module_admin roles forced
  - `required_all` — all users forced

MFA method: TOTP (Google Authenticator / Authy) via Supabase Auth MFA or custom `otp` library. Biometric (WebAuthn) deferred Phase 3.

### 14.2 i18n (R11) [UNIVERSAL od dnia 1]

- **Library**: next-intl z namespace per moduł (`02-settings.json`, `01-npd.json`, etc.)
- **Languages**:
  - Phase 1 MVP: **PL + EN** (Forza customer + Monopilot staff)
  - Phase 2: UK, RO (per R11 Research — Ukraine + Romania workforce in Forza)
  - Phase 3: DE, FR (expansion markets)
- **Fallback**: EN zawsze dostępny
- **User preference override**: `users.language` nadpisuje `organizations.locale`
- **Runtime switch**: UI picker w user menu, no reload required (next-intl hot switching)
- **Content**: static UI strings + dynamic form labels (z `reference_schemas.presentation_json.label_<lang>`)

### 14.3 Onboarding Wizard

6-step, <15min target P50:

1. **Organization Profile** — name, timezone, locale, currency, logo (optional)
2. **First Warehouse** — name, type (default: finished), code
3. **First Location** — zone/bin w created warehouse
4. **First Product** — soft redirect do 03-TECHNICAL create product (skippable)
5. **First Work Order** — soft redirect do 04-PLANNING-BASIC create WO (skippable)
6. **Completion Celebration** — confetti + next steps (cards linking to Module Toggles, Schema Browser, Rules Registry)

State tracked w `organizations.onboarding_state` JSONB:
```json
{"current_step": 3, "completed_steps": [1, 2], "skipped_steps": [], "started_at": "...", "last_activity_at": "..."}
```

Resume capability: user powraca → wizard continues from `current_step`. Skip button on every step (optional steps only).

### 14.4 UI surfaces

| Screen code | Screen | Capability |
|---|---|---|
| SET-001 | Wizard Launcher | Auto-show for new orgs |
| SET-002 | Org Profile Step | RHF form |
| SET-003 | First Warehouse Step | Warehouse create |
| SET-004 | First Location Step | Location create |
| SET-005 | First Product Step | Redirect do 03-TECHNICAL |
| SET-006 | First WO Step | Redirect do 04-PLANNING-BASIC |
| SET-007 | Completion Celebration | Confetti + card grid |
| SET-100 | User Menu Language Picker | i18n switch |
| SET-101 | User Preferences | Language, notifications, MFA enroll |

### 14.5 Validation V-SET-SEC

- **V-SET-80**: Password regex zgodny z `org_security_policies` (min_length, complexity)
- **V-SET-81**: Password history — new password must not match last N hashes
- **V-SET-82**: MFA enrollment forced on first login jeśli `mfa_requirement='required_admins'` i user ma admin role
- **V-SET-83**: Session timeout enforced w middleware (refresh token expiry)
- **V-SET-84**: Language code w supported enum (pl/en/uk/ro/de/fr)

---

## §15 — Validations, KPIs, Success Criteria

### 15.1 Full validation list

| Code | Obszar | Rule |
|---|---|---|
| V-SET-01..05 | Schema wizard | §6.7 |
| V-SET-10..13 | Rule registry | §7.7 |
| V-SET-20..23 | Reference CRUD | §8.7 |
| V-SET-30..33 | Multi-tenant L2 | §9.8 |
| V-SET-40..42 | Module toggles | §10.4 |
| V-SET-50..53 | D365 constants | §11.6 |
| V-SET-60..63 | Infrastructure | §12.3 |
| V-SET-70..72 | Email config | §13.5 |
| V-SET-80..84 | Security | §14.5 |

### 15.2 KPIs

**Operational:**
- Onboarding completion rate ≥ 90%
- Avg time to first WO ≤ 15 min P50
- Schema wizard usage: ≥ 1 edit / miesiąc per active org
- Reference CRUD adoption: ≥ 3 tables modified / kwartał

**Performance:**
- Settings API p95 ≤ 200ms
- Schema publish-to-runtime propagation ≤ 5s
- L2 upgrade canary-to-progress decision ≤ 30min
- Audit log partition prune: automated monthly, <1% storage overhead beyond 24 mies

**Adoption (Phase 2+):**
- Feature flags usage: ≥ 5 flags active per org
- Rule registry views: ≥ 10 views/miesiąc per admin
- D365 push success ≥ 95%

### 15.3 Success Criteria

**Funkcjonalne (MVP close):**
- 6-step onboarding < 15min P50
- 10 system roles seeded, RBAC matrix functional dla 15 modułów
- Schema admin wizard operational dla L2/L3 add column end-to-end
- Rule registry read-only shows ≥ 10 active rules (cascading / gate / workflow)
- 11 Reference tables CRUD operational (generic UI)
- Module toggles 15 modułów + 5 feature flags core
- 5 D365 constants editable + toggle operational
- Audit log captures 100% mutations, partycjonowana
- i18n PL/EN complete (no missing strings)

**Niefunkcjonalne:**
- RLS enforced wszystkie org-scoped tabele (DB-level check)
- Audit log 7 lat retention, monthly partition
- Zod runtime gen latency ≤ 5s propagation
- Upgrade canary rollback SLA ≤ 5 min

**Compliance (dzień 1):**
- ADR-008 audit spec realized (impersonation flag, changed_fields computed, context middleware)
- GDPR data export endpoint dostępny (Phase 3 expansion)

---

## §16 — Dependencies, Build Sequence, Open Items, References

### 16.1 Dependencies

**Upstream** (blocking):
- 00-FOUNDATION v3.0 — tech stack, 6 principles, ADRs 028/029/030/031, multi-tenant model

**Downstream** (blocks):
- 01-NPD (needs RBAC, Reference CRUD dla Pack_Size/Templates/Processes, audit)
- 03-TECHNICAL (needs Reference.Allergens, schema admin wizard, D365 constants inline)
- Wszystkie inne moduły (02-SETTINGS jest foundation admin)

**Cross-reference**:
- `allergens` global table + `org_allergens` baseline defined tu; **allergen-by-RM cascade** (01-NPD §8) references ale authoring w 03-TECHNICAL
- `rule_definitions` dla NPD cascading (01-NPD §6) stored tu, authored przez dev PR

### 16.2 Build sequence — 5 sub-modules

Per 00-FOUNDATION §4.2 (writing batch, build sequential per submodule):

#### 02-SETTINGS-a — Foundation (Org/Users/RBAC + Audit)

Scope:
- Organizations + Users CRUD
- 10 system roles + permissions
- RBAC middleware (Postgres RLS + app-level guards)
- Audit log infrastructure (ADR-008) + trigger framework
- Basic i18n pl/en (next-intl setup)

Stories est.: 10-12. Sesji est.: 4-5.

Gate przed -b: all downstream modules mogą rely on org_id + user_id + role check.

#### 02-SETTINGS-b — Module toggles + Feature flags + Tenant L2

Scope:
- `modules` + `organization_modules` seeded (15 modułów)
- Module toggles UI + dependency checker
- `feature_flags_core` built-in + PostHog integration
- `tenant_variations` + L2 dept taxonomy (ADR-030 realized)
- Upgrade orchestration `tenant_migrations`

Stories est.: 8-10. Sesji est.: 3-4.

Gate: tenant_id + L2 variations resolvable; feature_flag check middleware.

#### 02-SETTINGS-c — Schema admin wizard (ADR-028)

Scope:
- `reference_schemas` + `schema_migrations`
- Schema browser + column edit wizard §6.1-§6.7
- L1 promotion flow §6.3 (queue + approval + background job)
- Draft/publish + shadow preview
- Zod runtime generation endpoint + cache

Stories est.: 12-14. Sesji est.: 5-6.

Gate: 01-NPD i 03-TECHNICAL mogą definiować kolumny schema-driven.

#### 02-SETTINGS-d — Rule registry + Reference CRUD

Scope:
- `rule_definitions` + `rule_dry_runs`
- Rule registry read-only UI (§7.2, §7.6)
- DSL JSON schema validation per rule_type
- `reference_tables` generic storage + 11 Reference UIs §8
- CSV import/export
- Dev deploy pipeline (migration script upsert rules)

Stories est.: 14-16. Sesji est.: 6-7.

Gate: cascading rules z 01-NPD §6 + allergen gate z 08-PRODUCTION deploy as PRs.

#### 02-SETTINGS-e — Infrastructure + D365 Constants + EmailConfig + Onboarding + security

Scope:
- Warehouses / Locations / Machines / Lines (§12)
- D365 Constants admin + toggle (§11)
- EmailConfig activation + templates + Resend integration (§13)
- Onboarding wizard 6-step (§14.3)
- Security policies + MFA enrollment + i18n Phase 2 languages

Stories est.: 10-12. Sesji est.: 4-5.

Gate: onboarding < 15min ready for customer beta.

**Total 02-SETTINGS impl:** 54-64 stories, **22-27 sesji**.

### 16.3 Open Items

1. **Hard-lock semantyka rule registry (§7.5)** `[EVOLVING]` — L1 dev-only vs L2 admin-acknowledge vs L3 admin-approval. Decision w 02-SETTINGS-d.
2. **Rule authoring dev workflow tooling** — CI lint rules, golden test dataset location, local dev sandbox. Nice-to-have addressed w 02-SETTINGS-d kick-off.
3. **L2 upgrade granularity** (carry-forward Phase D §19) — per-rule vs per-module vs per-tenant. Decision 02-SETTINGS-b.
4. **L1 promotion approval workflow** — ile approvers, SLA response. Decision 02-SETTINGS-c.
5. **Rollback time-window post-L2 upgrade** — 7 dni proposal, confirm w -b.
6. **PostHog self-host infra setup** — deployment spec (Docker compose vs managed, resource req). Addressed w 02-SETTINGS-b pre-work.
7. **Email provider pick** — Resend default, Postmark alternative. Lock w 02-SETTINGS-e.
8. **MFA biometric (WebAuthn)** deferred Phase 3.
9. **Custom roles RBAC** — per-org role definition UI. Phase 3 scope.
10. **L4 storage model** — per-tenant schema vs DB cluster. Defer Phase 3, documented w 14-MULTI-SITE.
11. **Reference materialized view refresh strategy** — trigger-on-mutation vs scheduled. Perf test w 02-SETTINGS-d.
12. **Dept taxonomy migration** (Forza v7 Commercial+Procurement → Packaging+Price per Phase D #15) — migration script lub gradual rename. Addressed w 02-SETTINGS-b + 01-NPD implementation kick-off.

### 16.4 References

**Phase B/C dependencies:**
- [`00-FOUNDATION-PRD.md`](./00-FOUNDATION-PRD.md) v3.0 — §1 principles, §4 Module Map, §5 Tech Stack, §6-10 foundations
- [`01-NPD-PRD.md`](./01-NPD-PRD.md) v3.0 — §6 cascading, §7 workflow, §8 allergens, §10 D365 Builder (consumer 02-SETTINGS provisioning)
- [`03-TECHNICAL-PRD.md`](./03-TECHNICAL-PRD.md) v3.0 — sibling (Phase C1 writing)

**Reality sources:**
- [`_meta/reality-sources/pld-v7-excel/REFERENCE-TABLES.md`](./_meta/reality-sources/pld-v7-excel/REFERENCE-TABLES.md) — 8 tabel baseline
- [`_meta/reality-sources/pld-v7-excel/D365-INTEGRATION.md`](./_meta/reality-sources/pld-v7-excel/D365-INTEGRATION.md) — 5 Forza constants
- [`_meta/reality-sources/pld-v7-excel/EVOLVING.md`](./_meta/reality-sources/pld-v7-excel/EVOLVING.md) §17 Priority matrix

**Architecture:**
- [`_foundation/decisions/MONOPILOT-V2-ARCHITECTURE.md`](./_foundation/decisions/MONOPILOT-V2-ARCHITECTURE.md) — Phase D 23 decisions + 6 principles
- [`_foundation/META-MODEL.md`](./_foundation/META-MODEL.md) — schema-driven contract
- [`_foundation/patterns/REALITY-SYNC.md`](./_foundation/patterns/REALITY-SYNC.md)
- [`_foundation/skills/SKILL-MAP.yaml`](./_foundation/skills/SKILL-MAP.yaml)

**Research:**
- [`_foundation/research/MES-TRENDS-2026.md`](./_foundation/research/MES-TRENDS-2026.md) §4 schema-driven, §5 multi-tenant, §9 02-SETTINGS rollup

**ADRs (Active Phase 0):**
- ADR-008 — audit trail spec
- ADR-011 — module toggles
- ADR-012 — RBAC roles + permissions
- ADR-013 — multi-tenant RLS
- ADR-028 — schema-driven cols
- ADR-029 — rule engine DSL
- ADR-030 — configurable depts
- ADR-031 — multi-tenant L1-L4

**HANDOFFs:**
- [`_meta/handoffs/2026-04-19-phase-b-close.md`](./_meta/handoffs/2026-04-19-phase-b-close.md) — Phase B close → C1 bootstrap

---

## Changelog

- **v3.4** (2026-04-21) — Stakeholder decisions delta (15-OEE OQ resolution session). No breaking changes, extensions only:
  - **§8.1 Reference Tables** — rozszerzono z 24 do **25 tabel**. Nowa tabela #25: `changeover_target_duration_min` (15-OEE OQ-OEE-05 decision — per-line integer target in minutes, optional per-FA override, default null, consumed by 15-OEE + 08-PRODUCTION).
  - **§8.1 `oee_alert_thresholds` (table #20)** — `oee_target_pct` default updated from 85 → **70** (Forza P1 ramp-up baseline, OQ-OEE-02 decision 2026-04-21).
  - **§8.8 New config fields** (new subsection) — formal spec for `changeover_target_duration_min` and `oee_alert_thresholds.oee_target_pct` including scope, default, range, editability, audit, consumers, and amber/red derivation rules.
  - Cross-PRD: 15-OEE-PRD updated to v3.1, 15-OEE-UX updated to v1.1. All 9 P1-blocking OQ resolved. OQ-OEE-03 (TV OS) remains open.

- **v3.3** (2026-04-20) — Phase C5 Sesja 2 bundled delta (post-13-MAINT + 14-MULTI-SITE). Brak breaking changes, wyłącznie rozszerzenia:
  - **§7.8 Registered Rules Registry** — rozszerzono z 22 do **31 rules** (24 P1 active + 7 P2 stub). Nowe 9 (v3.3): `mwo_state_machine_v1` (13-MAINT P1), `pm_schedule_due_engine_v1` (13-MAINT P1), `calibration_expiry_alert_v1` (13-MAINT P1), `spare_parts_reorder_alert_v1` (13-MAINT P1), `sanitation_allergen_gate_v1` (13-MAINT P1), `loto_pre_execution_gate_v1` (13-MAINT P1), `site_access_policy_v1` (14-MULTI P1), `cross_site_to_approval_v1` (14-MULTI P1), `per_site_residency_gate_v1` (14-MULTI P2 stub).
  - **§8.1 Reference Tables** — rozszerzono z 20 do **24 tabel**. Nowe 4 (v3.3): `maintenance_alert_thresholds` (13-MAINT L2 per-tenant ADR-031), `technician_skills` (13-MAINT enum), `spare_parts_categories` (13-MAINT), `sites_hierarchy_config` (14-MULTI L2 ADR-030 depth 2-5 override). Extension: `shift_configs` (v3.2 #19) rozszerzone o site_id scoping (14-MULTI D-MS-9 REC-L5) — dokumentowane in-place, brak osobnego wpisu.
  - **§11.8 INTEGRATIONS stages summary** — bez zmian (13-MAINT P1 no new D365 stage; 14-MULTI no new D365 stage — multi-site internal Monopilot concept). Future stages from P2 (maintenance stage X, multi-entity stage Y) zarejestrowane jako stub.
  - Producer modules registry expansion: od 9 (post-v3.2) do 11 (post-v3.3) — dodane **13-MAINTENANCE i 14-MULTI-SITE** jako producers rules.
  - Cross-PRD consistency enforced: 13-MAINT consumer `oee_maintenance_trigger_v1` (owned by 15-OEE §7), `allergen_changeover_gate_v1` (08-PROD §7), `to_state_machine_v1` (05-WH base extended by 14-MULTI IN_TRANSIT state); 14-MULTI extends `to_state_machine_v1` (05-WH owner) zamiast re-registering.
  - Bundled revision pattern (C5 Sesja 2) — 3× precedent (v3.1 C4 Sesja 3, v3.2 C5 Sesja 1, v3.3 C5 Sesja 2) — oszczędność 1 sesji vs separate revision.

- **v3.2** (2026-04-20) — Phase C5 Sesja 1 bundled delta (post-12-REPORTING + 15-OEE). Brak breaking changes, wyłącznie rozszerzenia:
  - **§7.8 Registered Rules Registry** — rozszerzono z 17 do **22 rules** (16 P1 active + 6 P2 stub). Nowe 5 (v3.2): `report_access_gate_v1` (12-REPORTING P1 active), `scheduled_report_distribution_v1` (12-REPORTING P2 stub), `shift_aggregator_v1` (15-OEE P1 active), `oee_anomaly_detector_v1` (15-OEE P2 stub), `oee_maintenance_trigger_v1` (15-OEE P2 stub, 13-MAINT consumer link).
  - **§8.1 Reference Tables** — rozszerzono z 17 do **20 tabel**. Nowe 3 (v3.2): `dashboards_catalog` (12-REPORTING metadata-driven access), `shift_configs` (15-OEE + L2 tenant variation ADR-030), `oee_alert_thresholds` (15-OEE per-line L2 config ADR-031).
  - **§11.8 INTEGRATIONS stages summary** — bez zmian (12-REPORTING read-only consumer, 15-OEE internal outbox only, no new D365 stages).
  - Producer modules registry expansion: od 7 (post-v3.1) do 9 (post-v3.2) — dodane **12-REPORTING i 15-OEE** jako producers rules.
  - Bundled revision pattern (C5 Sesja 1) — oszczędność 1 sesji vs separate revision.
- **v3.1** (2026-04-20) — Phase C4 Sesja 3 bundled delta (post-10-FIN + 11-SHIP). Brak breaking changes, wyłącznie rozszerzenia:
  - **§7.8 Registered Rules Registry** (new) — pełna tabela 17 rules rejestrowanych across C1-C4 Sesja 3 (13 P1 active + 4 P2 stub). Rules z: 03-TECH (1), 05-WH (1), 07-EXT (3), 08-PROD (4), 09-QA (3), 10-FIN (3), 11-SHIP (2). +V-SET-14 validation (JSON schema file required).
  - **§8.1 Reference Tables** — rozszerzono z 11 do 17 tabel. Nowe 6 (v3.1): `quality_hold_reasons` (09-QA), `qa_failure_reasons` (09-QA), `waste_categories` (08-PROD + 10-FIN consumer), `allergen_hold_reasons` (09-QA + 11-SHIP), `shipping_override_reasons` (11-SHIP D-SHP-13), `rma_reason_codes` (11-SHIP E07.5).
  - **§11.7 D365 Constants P2 Extensions** (new) — 6 P2 stub constants dla 11-SHIP/14-MULTI-SITE (shipping_warehouse, customer_account_id_map, courier_default_carrier, courier_api_vault_key, finance_cost_posting_account, eudr_dds_endpoint). Shared artifacts list: `@monopilot/d365-*-adapter` family.
  - **§11.8 INTEGRATIONS stages summary** (new) — cumulative tabela 6 stages: 1 (03-TECH ✅), 2 (08-PROD ✅), 3 (11-SHIP ✅ C4 Sesja 3), 4 (P2 EPCIS), 5 (10-FIN ✅ C4 Sesja 2), 6 (P2 RMA credit memo).
  - Bundled revision pattern — oszczędność 1 sesji vs separate revisions po każdym PRD (per C4 Sesja 2 close action item).
- **v3.0** (2026-04-19) — Phase C1 writing. Pełny rewrite baseline v1.x (652l, 8 epics pre-Phase-D). Nowe core: §6 Schema admin wizard, §7 Rule registry **read-only** (per Q2 decision — rules dev-authored), §8 Reference CRUD generic, §9 Multi-tenant L2, §11 D365 Constants inline. Refined: §10 module toggles + feature flags, §12 infrastructure, §13 EmailConfig activation, §14 security + i18n + onboarding. Build sequence 5 sub-modules (a..e), 22-27 sesji impl est.
- v1.x (pre-Phase-D) — baseline 652l, 8 epics E01.1-E01.8, Phase 1/2/3 split. Deprecated przez v3.0.

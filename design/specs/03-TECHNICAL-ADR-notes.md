# 03-TECHNICAL ADR Cross-Reference Notes

**Task:** T-071
**PRD refs:** docs/prd/03-TECHNICAL-PRD.md §16
**Purpose:** Traceability map — each ADR cited in 03-TECHNICAL → task implementations.

---

## ADR-002 — BOM Snapshot Pattern for Work Orders

**File:** `_archive/new-doc-2026-02-16/02-technical/decisions/ADR-002-bom-snapshot-pattern.md`
**Decision:** When a Work Order is created, BOM lines are copied to WO-owned tables (immutable snapshot). The WO operates on its snapshot; subsequent BOM changes do not affect it.

### Implementation tasks in 03-TECHNICAL

| Task | Title | Role |
|---|---|---|
| **T-025** | Wiring: BOM snapshot pattern at WO creation (ADR-002) | Primary implementation: server action that copies `bom_lines` → `wo_materials` at WO creation time, stores `bom_id` + `bom_version` audit reference |
| **T-073** | Shared BOM SSOT + released edit clone-on-write enforcement | Enforces the clone-on-write counterpart: released BOM edits create new version rather than mutating the row used by existing WO snapshots |
| **T-045** | UI: TEC-089 BOM Change History timeline | Read-side: history view that shows BOM version changes, cross-referencing WO snapshot events |

### Key closeout evidence

- T-025: `bom_snapshots` table created; `copyBomToWoSnapshot()` server action tested; AC verified by RED→GREEN test.
- T-073: Active BOM immutability RED test passes; `bom_headers.status` transition guard rejects direct mutation.
- ADR-002 snapshot rule: every `wo_materials` row carries `bom_item_id` + `bom_version` for audit reference.

---

## ADR-008 — Audit Trail Strategy

**File:** `_archive/new-doc-2026-02-16/00-foundation/decisions/ADR-008-audit-trail-strategy.md`
**Decision:** Hybrid audit trail — PostgreSQL triggers capture all data changes; application layer enriches with `app.user_id`, `app.action_reason` via `set_config()`. Audit records are INSERT-only; users cannot modify them.

### Implementation tasks in 03-TECHNICAL

| Task | Title | Role |
|---|---|---|
| **T-010** | API: Item detail and update (GET/PUT /api/technical/items/:item_code) | Sets `app.action_reason` before each item update; emits `items.updated` outbox event for audit |
| **T-014** | API: BOM approve and publish workflow | Mandatory audit note on BOM status transitions (`draft` → `approved`); `action_reason` required |
| **T-016** | API: BOM Generator batch endpoint | Audit event `bom.batch_generated` emitted with user + reason |
| **T-017** | API: Allergen profile CRUD | `technical.allergens.edit` is audited; each allergen change recorded with `action_reason` |
| **T-018** | API: Manufacturing operation allergen additions CRUD | Each allergen-operation link change is audit-logged |
| **T-045** | UI: TEC-089 BOM Change History timeline | Read-side: surfaces `audit_log` events for BOM records in a timeline UI |
| **T-079** | Migration/API contract: factory_specs Technical-owned version approval | `factory_spec` status transitions require mandatory audit reason |

### Key closeout evidence

- All write server actions in 03-TECHNICAL pass `action_reason` via `withOrgContext` HOF before DB mutation.
- No 03-TECHNICAL server action bypasses the audit trigger by using raw DDL.
- Allergen manual overrides specifically checked: `allergen_declaration_modal` override variant emits audit event.

---

## ADR-028 — Schema-Driven Column Definition

**File:** `_foundation/decisions/ADR-028-schema-driven-column-definition.md`
**Decision:** Item-master column definitions are stored as metadata rows in `Reference.DeptColumns` (config-table per org). The UI render engine reads metadata dynamically. L3 org-specific extensions use `items.ext_jsonb`; L4 org-private fields use `items.private_jsonb`. No hard-coded column schema in application code for the Main Table.

### Implementation tasks in 03-TECHNICAL

| Task | Title | Role |
|---|---|---|
| **T-001** | Migration: items table (universal item master) | Creates `items` with `ext_jsonb JSONB DEFAULT '{}'` + `private_jsonb JSONB DEFAULT '{}'` + `schema_version INT`; foundation for L3/L4 extensions |
| **T-004** | Migration: allergen tables | Allergen code is TEXT (no hard FK) — keeps schema-driven extensibility per ADR-028: EU-14 + org custom allergen codes all valid |
| **T-009** | API: Item create with V-TEC-01..04 validation | V-TEC-01..04 validation rules are defined as Zod schema; per-org required-field set is driven by `Reference.DeptColumns` metadata, not hard-coded |
| **T-027** | Wiring: Schema-driven L3 extension propagation from 02-SETTINGS | Reads `reference_schemas` from 02-SETTINGS module; propagates org-specific L3 column definitions to item forms |
| **T-079** | Migration/API contract: factory_specs Technical-owned version approval | `factory_specs.internal_product_spec JSONB` stores schema-driven factory parameters without hard-coding the column set |

### Key closeout evidence

- `items.ext_jsonb` GIN index created; org-specific columns stored as JSON, not as ALTER TABLE.
- `allergen_code` TEXT (not FK enum); org can add custom allergen codes via 02-SETTINGS `reference_tables.allergens_reference`.
- T-027 wiring verified: L3 fields in item form are driven by `reference_schemas` metadata, not by a hard-coded list in the React component.

---

## ADR-029 — Rule Engine DSL + Workflow as Data

**File:** `_foundation/decisions/ADR-029-rule-engine-dsl-and-workflow-as-data.md`
**Decision:** A 4-area DSL (cascading dropdowns, conditional required, gate entry criteria, workflow definitions) interpreted from `rule_definitions` data rows. One universal runtime engine for all 16 modules. DSL scope is hard-limited to 4 areas; expansion requires a new ADR.

### Implementation tasks in 03-TECHNICAL

| Task | Title | Role |
|---|---|---|
| **T-024** | Wiring: Allergen cascade rule deployment to `rule_definitions` | **Primary ADR-029 closeout task for 03-TECHNICAL.** Deploys the allergen cascade rule (area a: cascading — RM allergen profile → intermediate → FG aggregation) as a `rule_definitions` row. The rule engine evaluates the cascade; no hard-coded cascade logic in application layer. |
| **T-004** | Migration: allergen tables | Schema foundation for `manufacturing_operation_allergen_additions` and `allergen_contamination_risk` — the data the allergen cascade rule reads |
| **T-017** | API: Allergen profile CRUD | Allergen profile save triggers rule engine re-evaluation of cascade; no manual cascade logic in the API handler |
| **T-018** | API: Manufacturing operation allergen additions CRUD | New manufacturing-op allergen addition → rule engine re-evaluates process addition rules (area a) |

### Key closeout evidence

- **ADR-029 cascade rule → T-024 direct mapping** (per T-071 AC: "reviewer can map ADR-029 cascade rule to T-024 directly").
- `rule_definitions` row for allergen cascade exists after T-024 completes; verified by RED→GREEN integration test.
- No module-specific cascade engine spawned for 03-TECHNICAL; the universal runtime engine from 00-FOUNDATION handles it.
- DSL scope respected: allergen cascade uses area (a) only — no new DSL area introduced.

---

## Summary Table

| ADR | Primary 03-TECHNICAL task | Supporting tasks |
|---|---|---|
| ADR-002 BOM Snapshot | T-025 | T-073, T-045 |
| ADR-008 Audit Trail | T-010, T-014 (per-feature audit) | T-016, T-017, T-018, T-045, T-079 |
| ADR-028 Schema-Driven | T-001 (foundation), T-027 (wiring) | T-004, T-009, T-079 |
| ADR-029 Rule Engine | **T-024** (cascade rule deployment) | T-004, T-017, T-018 |

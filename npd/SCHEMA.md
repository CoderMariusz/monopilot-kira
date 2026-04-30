# NPD Module — Database Schema

Implementation contract for backend devs. Every entity used by the prototype maps to a table here. Names in `snake_case`, FK columns end in `_id`, soft-delete columns are `deleted_at TIMESTAMP NULL`.

> **Tenant scoping:** every NPD table has `tenant_id BIGINT NOT NULL`. Indexes and FK constraints assume `(tenant_id, ...)` composite uniqueness unless stated otherwise.

> **Naming reality check:** the prototype still uses `fa_code` / `NPD_FAS` in some places as a deprecated alias — **`fg_code` is canonical**. Rename pass to follow.

---

## 1. Configuration (workflow templates)

The Configuration module lets each tenant pick / define which departments take part in closing FGs and what fields each fills in.

### `npd_config_templates`
| col | type | notes |
|---|---|---|
| `id` | BIGINT PK | |
| `tenant_id` | BIGINT FK → tenants | |
| `template_key` | VARCHAR(64) | e.g. `forza_charcuterie`, `luka_bakery`, `cross_uk_food` |
| `name` | VARCHAR(120) | human-readable, shown in UI |
| `description` | TEXT | |
| `industry` | VARCHAR(64) | one of `charcuterie`, `bakery`, `dairy`, `ready_meals`, `beverage`, `cross_industry` |
| `based_on` | VARCHAR(120) | derivation note (e.g. `"Forza · Italy · Charcuterie SaaS v3.0"`) |
| `version` | VARCHAR(20) | semver (`"v1.0"`) |
| `is_built_in` | BOOLEAN | true = read-only, ships with system |
| `created_at` / `updated_at` / `deleted_at` | TIMESTAMP | |
| `created_by_user_id` | BIGINT FK → users | |

**Index:** `UNIQUE (tenant_id, template_key)`.

### `npd_config_active`
Single row per tenant — points at the currently-active template.

| col | type | notes |
|---|---|---|
| `tenant_id` | BIGINT PK FK → tenants | |
| `template_id` | BIGINT FK → npd_config_templates | |
| `activated_at` | TIMESTAMP | |
| `activated_by_user_id` | BIGINT FK → users | |

### `npd_config_departments`
| col | type | notes |
|---|---|---|
| `id` | BIGINT PK | |
| `template_id` | BIGINT FK → npd_config_templates | CASCADE on delete |
| `dept_key` | VARCHAR(64) | snake_case, immutable system id (e.g. `core`, `planning`, `commercial`, `production`, `quality`) |
| `label` | VARCHAR(80) | display label |
| `order` | SMALLINT | gate position (1..N) |
| `accent_color` | VARCHAR(9) | `#rrggbbaa` |
| `close_role_keys` | JSONB | array of role keys allowed to close this dept (`["admin","npd_manager"]`) |
| `blocking_dep_keys` | JSONB | array of dept_keys that must be closed before this opens |

**Index:** `UNIQUE (template_id, dept_key)`.

### `npd_config_fields`
The schema for every field every dept owns. This is the heart of the configurable workflow.

| col | type | notes |
|---|---|---|
| `id` | BIGINT PK | |
| `department_id` | BIGINT FK → npd_config_departments | CASCADE |
| `field_key` | VARCHAR(64) | snake_case, unique within department |
| `label` | VARCHAR(120) | |
| `field_type` | VARCHAR(20) | one of `text`, `number`, `select`, `multiselect`, `boolean`, `date`, `reference`, `computed` |
| `required` | BOOLEAN | dept close blocked if empty |
| `help_text` | TEXT | shown beneath input |
| `placeholder` | VARCHAR(200) | |
| `values` | JSONB | for select/multiselect: array of `{value, label}` |
| `min` / `max` | NUMERIC | for number type |
| `unit` | VARCHAR(20) | for number type (`g`, `kg`, `%`, `EUR`) |
| `reference_entity` | VARCHAR(40) | for reference type — e.g. `"d365_material"`, `"npd_supplier"` |
| `computed_from` | TEXT | for computed type — formula or source field key |
| `order` | SMALLINT | display order within department |
| `visible_when` | JSONB | optional conditional display: `{field_key, op, value}` |

**Index:** `UNIQUE (department_id, field_key)`.

### `npd_config_blocking_rules`
| col | type | notes |
|---|---|---|
| `id` | BIGINT PK | |
| `template_id` | BIGINT FK → npd_config_templates | |
| `rule_key` | VARCHAR(40) | `V01`..`V12` |
| `title` | VARCHAR(120) | |
| `description` | TEXT | |
| `severity` | VARCHAR(10) | `error` / `warn` |
| `enabled` | BOOLEAN | tenant can toggle |

### `npd_config_change_requests`
NPD Manager → Admin proposal queue (MODAL-CONFIG-04).

| col | type | notes |
|---|---|---|
| `id` | BIGINT PK | |
| `template_id` | BIGINT FK → npd_config_templates | |
| `requested_by_user_id` | BIGINT FK → users | |
| `scope` | VARCHAR(20) | `field` / `dept` / `rule` / `permission` / `other` |
| `target` | VARCHAR(200) | field id / dept id / rule ref |
| `proposal` | TEXT | min 15 chars |
| `reason` | TEXT | min 15 chars |
| `urgency` | VARCHAR(10) | `low` / `normal` / `high` |
| `status` | VARCHAR(20) | `pending` / `approved` / `rejected` |
| `reviewed_by_user_id` | BIGINT FK → users | nullable |
| `reviewed_at` | TIMESTAMP | nullable |
| `review_note` | TEXT | nullable |
| `created_at` | TIMESTAMP | |

---

## 2. NPD core entities

### `npd_briefs`
Pre-FG product briefs from Commercial. Phase 1 of the funnel.

| col | type | notes |
|---|---|---|
| `id` | BIGINT PK | |
| `tenant_id` | BIGINT FK | |
| `brief_id` | VARCHAR(20) | display code `BR-0106` (unique within tenant) |
| `dev_code` | VARCHAR(20) | format `DEV{YY}{MM}-{NNN}` |
| `product_name` | VARCHAR(200) | |
| `template` | VARCHAR(20) | `Single` / `Multi` |
| `volume_units_year` | INTEGER | |
| `target_price` | NUMERIC(10,2) | |
| `pack_size` | VARCHAR(20) | |
| `status` | VARCHAR(20) | `draft` / `complete` / `converted` / `abandoned` |
| `fg_id` | BIGINT FK → npd_fgs | nullable until conversion |
| `owner_user_id` | BIGINT FK → users | |
| `created_at` | TIMESTAMP | |

**Index:** `UNIQUE (tenant_id, brief_id)`, `UNIQUE (tenant_id, dev_code)`.

### `npd_brief_components`
Multi-template briefs have N component rows; Single template has 1.

| col | type | notes |
|---|---|---|
| `id` | BIGINT PK | |
| `brief_id` | BIGINT FK → npd_briefs | CASCADE |
| `component_name` | VARCHAR(120) | |
| `pieces_per_pack` | INTEGER | bakery: pieces; charcuterie legacy: slices |
| `supplier` | VARCHAR(120) | |
| `supplier_code` | VARCHAR(40) | |
| `unit_price` | NUMERIC(10,2) | |
| `weight_g` | NUMERIC(10,2) | |
| `pct_of_pack` | NUMERIC(5,2) | sum across components must = 100 |
| `order` | SMALLINT | |

### `npd_fgs`
Finished goods — the main entity. One row per FG, lives in dept gate flow.

| col | type | notes |
|---|---|---|
| `id` | BIGINT PK | |
| `tenant_id` | BIGINT FK | |
| `fg_code` | VARCHAR(20) | `FG2401` (canonical; legacy `fa_code` alias kept until rename pass) |
| `product_name` | VARCHAR(200) | |
| `pack_size` | VARCHAR(20) | |
| `number_of_cases` | INTEGER | |
| `status_overall` | VARCHAR(20) | `Pending` / `InProgress` / `Alert` / `Complete` / `Built` |
| `launch_date` | DATE | nullable |
| `built` | BOOLEAN | true after D365 build executed |
| `finish_wip` | VARCHAR(200) | comma-separated WIP codes (multi-component) |
| `rm_code` | VARCHAR(200) | comma-separated RM codes |
| `template_label` | VARCHAR(120) | "Single-component · Sliced bread" etc — references config template |
| `volume` | INTEGER | |
| `dev_code` | VARCHAR(20) | from originating brief |
| `weights` | NUMERIC(10,2) | grams |
| `packs_per_case` | INTEGER | |
| `price_brief` | VARCHAR(40) | nullable / "see recipe" / numeric |
| `owner_user_id` | BIGINT FK | |
| `brief_id` | BIGINT FK → npd_briefs | originating brief |
| `template_id` | BIGINT FK → npd_config_templates | the template active at FG creation (immutable — migration policy: existing FGs keep schema) |
| `progress_pct` | SMALLINT | 0..100, derived from gate state |
| `cost` / `target_cost` / `margin` | NUMERIC | recipe-derived |
| `created_at` / `updated_at` / `deleted_at` | TIMESTAMP | |

**Index:** `UNIQUE (tenant_id, fg_code)`, `UNIQUE (tenant_id, dev_code)`.

### `npd_fg_field_values`
The actual per-field values for an FG. Replaces hard-coded columns — schema is whatever the active template defines.

| col | type | notes |
|---|---|---|
| `id` | BIGINT PK | |
| `fg_id` | BIGINT FK → npd_fgs | CASCADE |
| `field_id` | BIGINT FK → npd_config_fields | RESTRICT (can't drop a field that has values; only deactivate) |
| `value_text` | TEXT | for text/select/reference/date (ISO-8601 string) |
| `value_number` | NUMERIC | for number type |
| `value_boolean` | BOOLEAN | for boolean type |
| `value_json` | JSONB | for multiselect arrays |
| `updated_at` | TIMESTAMP | |
| `updated_by_user_id` | BIGINT FK | |

**Index:** `UNIQUE (fg_id, field_id)`.

> **Migration policy** (existing FG when template changes): when a `field_id` is removed from `npd_config_fields`, leave the value rows orphaned (`field_id` stays, query joins LEFT JOIN). When a new field is added, no row exists until first edit — UI shows empty.

### `npd_fg_dept_state`
Per-FG, per-dept gate state.

| col | type | notes |
|---|---|---|
| `fg_id` | BIGINT FK | composite PK |
| `dept_key` | VARCHAR(64) | composite PK |
| `state` | VARCHAR(20) | `blocked` / `inprog` / `closed` / `built` |
| `closed_at` | TIMESTAMP | nullable |
| `closed_by_user_id` | BIGINT FK | nullable |
| `close_note` | TEXT | optional |

---

## 3. Recipes & formulations

### `npd_formulations`
Recipe versions per FG. Multiple drafts, one locked.

| col | type | notes |
|---|---|---|
| `id` | BIGINT PK | |
| `fg_id` | BIGINT FK → npd_fgs | CASCADE |
| `version_label` | VARCHAR(20) | `v0.1`, `v0.2`, `v1.0` |
| `status` | VARCHAR(20) | `draft` / `locked` / `archived` |
| `locked_at` | TIMESTAMP | nullable |
| `locked_by_user_id` | BIGINT FK | nullable |
| `lock_reason` | TEXT | nullable |
| `notes` | TEXT | |
| `created_at` | TIMESTAMP | |
| `created_by_user_id` | BIGINT FK | |

**Index:** `UNIQUE (fg_id, version_label)`.

### `npd_formulation_ingredients`
| col | type | notes |
|---|---|---|
| `id` | BIGINT PK | |
| `formulation_id` | BIGINT FK | CASCADE |
| `ingredient_code` | VARCHAR(40) | `RM-1001` for raw materials, `WIP-...` for intermediate |
| `ingredient_name` | VARCHAR(200) | denormalized for snapshot |
| `pct` | NUMERIC(5,2) | sum must = 100 within formulation |
| `notes` | TEXT | |
| `order` | SMALLINT | |

---

## 4. Allergens

### `npd_allergens` (reference data)
The 14 EU allergens. Seeded.

| col | type | notes |
|---|---|---|
| `code` | VARCHAR(20) PK | `gluten`, `eggs`, `soy`, `milk`, `nuts`, `peanuts`, `sesame`, `sulphites`, `mustard`, `celery`, `crustaceans`, `fish`, `molluscs`, `lupin` |
| `label` | VARCHAR(40) | |

### `npd_fg_allergens`
Per-FG allergen presence — typically auto-cascaded from RM → process → FG, with manual overrides.

| col | type | notes |
|---|---|---|
| `fg_id` | BIGINT FK | composite PK |
| `allergen_code` | VARCHAR(20) FK → npd_allergens | composite PK |
| `state` | VARCHAR(10) | `present` / `absent` / `cross_contam_risk` / `manual_override` |
| `source` | VARCHAR(20) | `cascade` / `manual` |
| `override_reason` | TEXT | required when source=`manual` (min 10 chars) |
| `override_by_user_id` | BIGINT FK | nullable |
| `last_recalculated_at` | TIMESTAMP | |

---

## 5. Documents, risks, history

### `npd_compliance_docs`
| col | type | notes |
|---|---|---|
| `id` | BIGINT PK | |
| `fg_id` | BIGINT FK | CASCADE |
| `doc_type` | VARCHAR(20) | `Spec` / `Artwork` / `Benchmark` / `Reg.` / `Photo` |
| `filename` | VARCHAR(200) | |
| `version_label` | VARCHAR(20) | |
| `storage_url` | TEXT | S3 / blob URL (signed) |
| `size_bytes` | BIGINT | |
| `uploaded_at` | TIMESTAMP | |
| `uploaded_by_user_id` | BIGINT FK | |

### `npd_risks`
| col | type | notes |
|---|---|---|
| `id` | BIGINT PK | |
| `fg_id` | BIGINT FK | CASCADE |
| `description` | TEXT | |
| `likelihood` | SMALLINT | 1..3 |
| `impact` | SMALLINT | 1..3 |
| `score` | SMALLINT GENERATED ALWAYS AS (likelihood * impact) STORED | |
| `mitigation` | TEXT | |
| `owner_user_id` | BIGINT FK | |
| `status` | VARCHAR(20) | `open` / `mitigated` / `accepted` / `closed` |
| `created_at` / `updated_at` | TIMESTAMP | |

### `npd_history` (audit log)
Immutable event stream — every mutation through the NPD module gets a row.

| col | type | notes |
|---|---|---|
| `id` | BIGINT PK | |
| `fg_id` | BIGINT FK | nullable (config events have no FG) |
| `event_type` | VARCHAR(40) | `create`, `dept_close`, `dept_reopen`, `built`, `unbuilt`, `allergen_changed`, `formulation_locked`, `risk_added`, `doc_uploaded`, `config_activated`, `change_request_submitted`, ... |
| `actor_user_id` | BIGINT FK | nullable for `System` events |
| `description` | TEXT | human-readable |
| `payload` | JSONB | structured detail (before/after values) |
| `created_at` | TIMESTAMP | |

**Index:** `(fg_id, created_at DESC)`.

---

## 6. D365 build output

### `npd_d365_build_runs`
Each "Build D365" execution captured here. Idempotent on `(fg_id, run_id)`.

| col | type | notes |
|---|---|---|
| `id` | BIGINT PK | |
| `fg_id` | BIGINT FK | |
| `run_id` | UUID | |
| `triggered_by_user_id` | BIGINT FK | |
| `mfa_verified` | BOOLEAN | |
| `started_at` / `finished_at` | TIMESTAMP | |
| `status` | VARCHAR(20) | `pending` / `success` / `partial` / `failed` |
| `error_summary` | TEXT | nullable |

### `npd_d365_products`
The N+1 records produced per build (intermediate WIP rows + final FG record).

| col | type | notes |
|---|---|---|
| `id` | BIGINT PK | |
| `build_run_id` | BIGINT FK | CASCADE |
| `product_code` | VARCHAR(40) | |
| `product_type` | VARCHAR(20) | `Intermediate` / `FinishedArticle` |
| `processes` | VARCHAR(200) | `"Mix → Bake"` |
| `op_code` | VARCHAR(20) | |
| `pushed_to_d365` | BOOLEAN | |
| `d365_id` | VARCHAR(40) | nullable until pushed |

---

## 7. Permissions

NPD reuses tenant-level RBAC. Roles relevant to NPD:

| role_key | NPD permissions |
|---|---|
| `admin` | full edit on Configuration · everything else |
| `npd_manager` | read Configuration · `requestChanges` only · full FG/brief/recipe edit |
| `commercial` | brief CRUD · read FG |
| `planning` | edit Planning dept fields on FG |
| `production` | edit Production dept fields · close Production gate |
| `quality` | edit Quality dept fields · allergen overrides · close Quality gate |
| `viewer` | read-only |

Permission checks expose as `npd_can(action_key)` in `permissions.jsx` — list of action keys:

```
fa.create, fa.edit, fa.delete, fa.advance_gate, fa.build_d365, fa.unbuild
brief.create, brief.edit, brief.convert_to_fa
formulation.edit, formulation.lock
allergen.override
risk.edit
config.read, config.edit, config.activate, config.request_changes
```

---

## 8. Migration & open questions

- **`fa_*` → `fg_*` rename pass:** prototype has aliases (`window.NPD_FAS = NPD_FGS.map(...)`). Backend should emit `fg_*` everywhere; UI rename pass tracked in [BACKLOG.md].
- **Field types vs columns:** `npd_fg_field_values` is EAV-shaped. Acceptable for v1 (write-rare, read-per-FG). If perf becomes an issue, add a `npd_fg_field_values_search` materialised view keyed by hot fields.
- **Multi-tenant isolation:** every read MUST filter by `tenant_id`. Row-level security recommended (`USING (tenant_id = current_tenant())`).
- **D365 push:** prototype simulates output. Real impl: outbound queue + retry policy + reconciliation job.
- **Formulation `pct` validation:** sum must equal 100 ± 0.05 — enforce in service layer, not DB constraint (admin override needed).

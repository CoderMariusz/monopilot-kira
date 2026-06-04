# TEC-014 Bulk Import CSV — Engineering Brief

**Task:** T-064
**PRD refs:** docs/prd/03-TECHNICAL-PRD.md §6.5 TEC-014, §4A TEC-014
**Status:** SPEC-DRIVEN-WAVE0 — prototype creation deferred; spec-driven T3-ui task may proceed from this brief.
**Marker:** [UNIVERSAL]

---

## 1. Purpose

This brief defines the parity contract and acceptance gates for a 3-step CSV bulk import wizard that creates or updates items (RM / intermediate / FG) in the Technical item master.
It is the authoritative input for:
- Any future prototype file (`materials_list_screen` has an Import CSV button stub at `other-screens.jsx:1258`)
- Any T3-ui task that implements the wizard UI

---

## 2. CSV Column Contract

All columns use the canonical `items` table schema (PRD §5.1). The importer accepts UTF-8 CSV with header row.

| Column (CSV header) | Type | Required | Validation rule | Maps to |
|---|---|---|---|---|
| `item_code` | TEXT | YES | Unique per org; pattern `RM-\w+`, `WIP-\w+-\d+`, or `FG\d+` | `items.item_code` |
| `name` | TEXT | YES | Non-empty, max 255 chars | `items.name` |
| `item_type` | ENUM | YES | One of: `rm`, `intermediate`, `fg`, `co_product`, `byproduct` | `items.item_type` |
| `uom_base` | ENUM | YES | One of: `kg`, `g`, `l`, `ml`, `pcs` | `items.uom_base` |
| `description` | TEXT | NO | Max 2000 chars | `items.description` |
| `product_group` | TEXT | NO | Must exist in org's `reference_tables.product_groups` if provided | `items.product_group` |
| `weight_mode` | ENUM | NO | `fixed` or `catch`; default `fixed` | `items.weight_mode` |
| `nominal_weight` | DECIMAL | NO | Required when `weight_mode=catch`; > 0 | `items.nominal_weight` |
| `shelf_life_days` | INT | NO | 1–3650 | `items.shelf_life_days` |
| `shelf_life_mode` | ENUM | NO | `use_by` or `best_before`; default `use_by` | `items.shelf_life_mode` |
| `cost_per_kg` | DECIMAL | NO | >= 0; stored as current active cost | `items.cost_per_kg` |
| `d365_item_id` | TEXT | NO | Soft TEXT reference only; never a hard FK | `items.d365_item_id` |

**Rules:**
- Columns not listed above are silently ignored (future extensibility).
- `item_code` is the idempotency key: existing rows are updated, new rows are created.
- No column may hard-reference D365 IDs as FK constraints (`d365_item_id` is TEXT soft reference only).
- FG, intermediate, and legacy FA/Factory Article identifiers in the CSV map to canonical `item_type` values; FA is a legacy alias only — T3-ui must never display or emit FA-* identifiers.

---

## 3. Wizard Steps

### Step 1 — Upload & Parse

**User action:** Drop or browse to a CSV file (max 10 MB, `.csv` only).

**System behaviour:**
- Parse header row; report missing required columns as a blocking error before showing row data.
- Show file summary: filename, row count, detected encoding.
- Display first 5 preview rows with inferred types.
- "Next" is disabled if required columns are absent.

**V-TEC-01:** Required columns present and non-empty header row.

---

### Step 2 — Validate Rows

**User action:** Review per-row validation errors; optionally download error report.

**System behaviour:**
- Run all row-level validations (V-TEC-01..04) for every data row.
- Render a table: row #, item_code, name, status (`ok` | `warning` | `error`), error message.
- `error` rows are excluded from import; `warning` rows are imported with a note.
- Show aggregate: N rows OK, M rows with errors, P rows with warnings.
- "Next" is disabled if any row has `error` status.

**Validation rules per row:**

| Code | Rule | Severity |
|---|---|---|
| V-TEC-01 | Required columns have non-empty values | error |
| V-TEC-02 | `item_type` is one of the allowed enum values | error |
| V-TEC-03 | `uom_base` is one of the allowed enum values | error |
| V-TEC-04 | `item_code` format matches the regex for the declared `item_type` | error |
| V-TEC-04b | `nominal_weight` present when `weight_mode=catch` | error |
| V-TEC-04c | `product_group` exists in org reference table (if provided) | warning |
| V-TEC-04d | `cost_per_kg` >= 0 (if provided) | error |

---

### Step 3 — Diff Preview & Confirm

**User action:** Review diff of create vs update operations; enter import note; click Confirm.

**System behaviour:**
- Show a two-column diff table: "Before" (existing record or `[NEW]`) vs "After" (imported values).
- Columns shown in diff: `item_code`, `name`, `item_type`, `uom_base`, `cost_per_kg`, `status`.
- Highlight changed cells.
- Import note field (required; stored in `audit_log.action_reason`).
- "Confirm Import" button triggers the server action; spinner on submit.
- On success: show success toast with count created / updated; navigate back to item list.
- On partial failure (race condition conflict after validation): show per-row error summary; allow re-upload.

---

## 4. Error Reporting Format

### Download-able error report (CSV)

Columns: `row_number`, `item_code`, `field`, `error_code`, `message`

Example:
```
row_number,item_code,field,error_code,message
3,RM-SUGAR,item_type,V-TEC-02,"item_type must be one of: rm, intermediate, fg, co_product, byproduct"
7,,item_code,V-TEC-01,"item_code is required"
```

### Inline error display (Step 2 table)

- Red badge for `error` rows.
- Amber badge for `warning` rows.
- First error message per row shown inline; expand chevron reveals all errors for that row.

---

## 5. Server Action Semantics

- Invoked as a Next.js Server Action (`upsertItemsBulk`) in `apps/web/app/technical/_actions/items.ts`.
- Accepts parsed + validated row array; applies upsert by `(org_id, item_code)`.
- All rows upserted inside a single transaction; atomic commit or rollback.
- Org-scoped via `withOrgContext` HOF; RLS enforced via `app.current_org_id()`.
- Emits `items.bulk_imported` outbox event on success.
- Released BOM / factory_spec edits are NOT triggered by bulk import; only `items` rows are written.

---

## 6. Acceptance Gates (T3-ui drafting gate)

Before a T3-ui task may be drafted from this spec, **all** of the following must be confirmed:

1. CSV column contract in §2 reviewed by Quality Lead and UX team.
2. V-TEC-01..04 validation rules confirmed by Quality Lead.
3. Diff preview contract in Step 3 approved by UX team.
4. Server action path and upsert semantics confirmed by backend engineer.
5. Error report CSV format confirmed by Quality Lead.

---

## 7. Out of Scope (this brief)

- Prototype JSX creation
- API endpoint implementation
- Allergen bulk import (separate flow)
- D365-sourced CSV (handled by TEC-052 brief)

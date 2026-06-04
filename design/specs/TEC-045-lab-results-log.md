# TEC-045 Lab Results Log — Engineering Brief

**Task:** T-067
**PRD refs:** docs/prd/03-TECHNICAL-PRD.md §10.6, §10.7 TEC-045, §4A TEC-045
**Status:** SPEC-DRIVEN-WAVE0 — prototype creation deferred; spec-driven T3-ui task may proceed from this brief.
**Marker:** [UNIVERSAL]
**Depends on:** T-020 (allergen profile + lab results schema foundation)

---

## 1. Purpose

This brief defines the Lab Results Log: a cross-item, cross-WO filterable table of ATP swab and allergen test results, with an add-result modal and pass/fail ATP visualisation. This is distinct from the per-item TEC-002 Lab Results tab (UX:310) which is a per-item embed; this screen is the org-wide cross-item log view.

---

## 2. Table Columns

| Column | Source | Notes |
|---|---|---|
| Test Date | `lab_results.tested_at` | ISO date, sortable |
| FG / Item | `items.name` + `items.item_code` | Linked to item detail |
| WO Reference | `work_orders.wo_code` (nullable) | Filter chip; null = standalone test |
| Test Type | `lab_results.test_type` | `atp_swab`, `allergen_elisa`, `microbiological`, `chemical` |
| Analyte / Target | `lab_results.analyte` | e.g. "Gluten", "Listeria", "RLU" |
| Result Value | `lab_results.result_value` | Numeric; unit from `lab_results.result_unit` |
| Threshold | `alert_thresholds.value_int` for `atp_swab_rlu_max` or `lab_results.threshold_value` | Shown next to result |
| Pass/Fail | derived | See §4 colour tokens |
| Analyst | `users.full_name` via `lab_results.analyst_user_id` | |
| Actions | — | "View" opens detail slide-over |

Rows are sorted by `tested_at` DESC by default.

---

## 3. Filter Chips

Multi-select chips; OR within group, AND across groups.

| Filter | Options |
|---|---|
| Test Type | `atp_swab`, `allergen_elisa`, `microbiological`, `chemical` |
| Pass/Fail | `pass`, `fail`, `pending` |
| FG / Item | Autocomplete on `items.name` |
| WO Reference | Text search on `work_orders.wo_code` |
| Date range | Date picker (tested_at from/to) |
| Analyst | Autocomplete on `users.full_name` |

---

## 4. ATP Visualisation

### Numeric vs threshold gauge

For `test_type = 'atp_swab'`:
- Show a horizontal gauge bar: value / threshold range.
- Gauge fill: green if `result_value <= threshold`; red if `result_value > threshold`.
- Numeric label: `{result_value} RLU / ≤{threshold} RLU`.
- Threshold sourced from `alert_thresholds` where `threshold_key = 'atp_swab_rlu_max'` (default 10 RLU, PRD §10.6).

For other test types: show `result_value {unit}` plain text with pass/fail badge only.

---

## 5. Pass/Fail Color Tokens

| Status | Token | Visual |
|---|---|---|
| `pass` | `--color-success` (green) | Green badge "PASS"; green gauge fill for ATP |
| `fail` | `--color-destructive` (red) | Red badge "FAIL"; red gauge fill for ATP |
| `pending` | `--color-muted` (grey) | Grey badge "PENDING"; no gauge |
| `inconclusive` | `--color-warning` (amber) | Amber badge "INC." |

Tokens map to shadcn/Radix design system semantic colours. Exact hex values are owned by the design system; do not hardcode.

---

## 6. Add-Result Modal Field Set

Triggered by "Add Lab Result" button (requires `technical.allergens.edit` permission or dedicated `lab.results.create` permission).

**Do not embed real lab data in this spec; the modal field set is structural only.**

| Field | Type | Required | Validation |
|---|---|---|---|
| Item / FG | Autocomplete | YES | Must be active item in org |
| WO Reference | Autocomplete | NO | Must be existing WO if provided |
| Test Date | Date picker | YES | Not in future |
| Test Type | Select | YES | `atp_swab`, `allergen_elisa`, `microbiological`, `chemical` |
| Analyte / Target | Text | YES | Max 100 chars |
| Result Value | Number | YES | >= 0 |
| Result Unit | Text | YES | Max 20 chars (e.g. "RLU", "ppm", "CFU/g") |
| Threshold Override | Number | NO | Overrides org default; requires reason |
| Pass/Fail | Select | YES | `pass`, `fail`, `pending`, `inconclusive` |
| Analyst | User picker | YES | Must be active org user |
| Lab Reference | Text | NO | External lab accession number; max 100 chars |
| Notes | Textarea | NO | Max 500 chars |

**Submit:** Server action `createLabResult`; emits `lab_results.created` outbox event.

---

## 7. Server Action Semantics

- `getLabResults(filters, pagination)` — read; org-scoped via `app.current_org_id()`; returns paginated rows.
- `createLabResult(payload)` — write; requires `technical.allergens.edit` or `lab.results.create` permission; stores result; emits event.
- `getLabResultDetail(id)` — read; returns full record for slide-over.
- Pagination: cursor-based, 50 rows per page default.

---

## 8. Acceptance Gates (T3-ui drafting gate)

Before a T3-ui task may be drafted from this spec, **all** of the following must be confirmed:

1. Table columns and filter chips reviewed by Quality Lead.
2. ATP gauge visual contract confirmed by UX team.
3. Pass/fail colour tokens confirmed by UX team (mapped to design system tokens).
4. Add-result modal field set confirmed by Quality Lead.
5. Server action signatures confirmed by backend engineer.

---

## 9. Out of Scope (this brief)

- Prototype JSX creation
- Implementation of lab result storage (schema owned by T-020)
- Real lab data in examples
- Full allergen cascade logic (that is TEC-040..044)

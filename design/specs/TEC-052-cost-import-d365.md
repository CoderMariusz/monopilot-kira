# TEC-052 Cost Import from D365 — Engineering Brief

**Task:** T-068
**PRD refs:** docs/prd/03-TECHNICAL-PRD.md §11.5 TEC-052, §4A TEC-052
**Status:** SPEC-DRIVEN-WAVE0 — prototype creation deferred; spec-driven T3-ui task may proceed from this brief.
**Marker:** [LEGACY-D365]
**Depends on:** T-028 (D365 integration foundation), T-021 (cost_per_kg governance)
**Risk:** HIGH — D365 is optional integration; never use D365 IDs as hard FKs; `d365_item_id` is TEXT soft reference only.

---

## 1. Purpose

This brief defines the Cost Import from D365 screen: a diff-preview + batch-confirm flow that pulls item cost data from D365 and shows operators the delta before committing to Monopilot's `cost_per_kg` master data.

**D365 is an optional integration.** This screen must:
- Only render when `integration.d365.enabled` toggle is ON for the org.
- Never overwrite Monopilot cost data without explicit operator confirmation.
- Never treat D365 as canonical; Monopilot-owned data is authoritative.
- Not require live D365 access to read this documentation.

The prototype stub is `d365_item_sync_confirm_modal` (`modals.jsx:475`) which covers items pull but not cost-specific diff preview. This spec covers the cost-specific flow.

---

## 2. Diff Preview Row Schema

Each row in the diff table represents one item whose D365 cost differs from Monopilot current cost.

| Column | Source | Notes |
|---|---|---|
| Item Code | `items.item_code` | Org-side identifier |
| Item Name | `items.name` | |
| D365 Item ID | `items.d365_item_id` (TEXT soft ref) | Read-only; display only |
| Current Cost (Monopilot) | `items.cost_per_kg` | Current active cost |
| Incoming Cost (D365) | `d365_cost_staging.incoming_cost_per_kg` | Staged pull value |
| Delta | computed: `incoming - current` | Signed; red if negative, green if positive |
| Delta % | computed: `delta / current * 100` | Shown with 2 dp |
| Currency | `items.currency` or org default | Must be in `public.iso4217` (V-TEC-52) |
| Variance Flag | derived | `HIGH` if `abs(delta_pct) > catch_weight_variance_pct` threshold; `OK` otherwise |
| Approver Required | derived | YES if `variance_flag = HIGH` (V-TEC-53 rule) |
| Checkbox | UI | Pre-checked; operator can deselect rows to exclude |

**V-TEC-52:** Currency must be present in `public.iso4217` (iso4217 reference table, migration 167).
**V-TEC-53:** If `abs(delta_pct)` exceeds `alert_thresholds.catch_weight_variance_pct` (default 5%), an approver is required before that row can be committed.

---

## 3. Batch-Confirm Guardrails (V-TEC-53 High-Variance Approver)

### Pre-submit validation

1. If any selected row has `variance_flag = HIGH`, the "Confirm Import" button is replaced with "Request Approval".
2. "Request Approval" creates a pending approval task assigned to a `quality_lead` or `owner` role user.
3. The approval task includes: list of HIGH-variance rows with delta values, requester name, requested_at timestamp.
4. Once approved, the approver's action is recorded in `audit_log` with `action_reason = 'D365 cost import high-variance approval'`.
5. Only after approval does the "Confirm Import" button become available for high-variance rows.

### Normal flow (no HIGH-variance rows)

1. Operator reviews diff table; deselects rows they wish to skip.
2. Operator enters audit note (required; max 500 chars).
3. Operator clicks "Confirm Import".
4. Server action applies selected rows; `cost_per_kg` updated in `items` table with effective-date history insert in `cost_history` table.

---

## 4. Audit Note Format

The audit note is mandatory and stored in `audit_log.action_reason` with the following structure:

```
D365 Cost Import — [timestamp] — [N] rows applied — [operator note]
```

Example:
```
D365 Cost Import — 2026-06-04T14:32:00Z — 12 rows applied — Weekly sync from D365 batch job; reviewed by Quality Lead.
```

The server action must refuse to commit if `audit_note` is empty or less than 10 characters.

---

## 5. Screen States

| State | Description |
|---|---|
| No D365 integration | Full screen replaced by "D365 integration is not enabled for this org." message with link to Settings. |
| No pending diffs | "All item costs are in sync with D365." empty state with "Run manual sync" button. |
| Pull in progress | Spinner overlay; "Fetching cost data from D365..." |
| Diff ready | Diff table rendered per §2. |
| Approval pending | Banner: "Approval required for [N] high-variance rows. Waiting for quality_lead confirmation." |
| Import complete | Success toast: "[N] item costs updated from D365." Navigate back to Cost History (TEC-050). |
| Import failed | Error banner with per-row failure reasons; allow retry. |

---

## 6. Server Action Semantics

- `triggerD365CostPull()` — initiates D365 pull into `d365_cost_staging` table; async; triggers status poll.
- `getD365CostDiff()` — returns staged diff rows per §2; org-scoped.
- `requestCostImportApproval(rowIds)` — creates approval task for HIGH-variance rows.
- `confirmCostImport(rowIds, auditNote)` — applies selected rows; validates approval tokens for HIGH-variance rows; writes `cost_history` entries; emits `items.cost_imported_from_d365` outbox event.
- All org-scoped via `withOrgContext` HOF; RLS via `app.current_org_id()`.
- D365 work is optional integration/export/import from Monopilot-owned data; no strategic dependency or silent canonical overwrite.

---

## 7. Acceptance Gates (T3-ui drafting gate)

Before a T3-ui task may be drafted from this spec, **all** of the following must be confirmed:

1. Diff preview row schema reviewed by Quality Lead and Finance module owner.
2. V-TEC-53 high-variance approver flow confirmed by Quality Lead.
3. Audit note format confirmed by Quality Lead.
4. D365-disabled screen state confirmed by UX team.
5. Server action signatures confirmed by backend engineer.
6. Currency validation (V-TEC-52) against `public.iso4217` confirmed by backend engineer.

---

## 8. Out of Scope (this brief)

- Prototype JSX creation
- Implementation of D365 pull mechanism (belongs to TEC-071 / T-028)
- Live D365 access for documentation
- D365 as canonical source of truth (D365 is optional integration only)

# TEC-025 BOM Snapshots Viewer — Engineering Brief

**Task:** T-065
**PRD refs:** docs/prd/03-TECHNICAL-PRD.md §7.5 TEC-025, §4A TEC-025
**Status:** SPEC-DRIVEN-WAVE0 — prototype creation deferred; spec-driven T3-ui task may proceed from this brief.
**Marker:** [UNIVERSAL]

---

## 1. Purpose

This brief defines the UX contract for the BOM Snapshots Viewer: a read-only screen that lists immutable BOM snapshots taken at Work Order creation time, with a diff modal comparing the snapshot to the current BOM version.

Prototypes where this viewer should be anchored:
- `bom-detail.jsx` Snapshot History tab (UX TEC-006) — data referenced but no dedicated viewer component
- A future dedicated prototype once this brief is approved

---

## 2. Snapshot Data Model

A BOM snapshot is an immutable copy of BOM header + lines + co-products taken when a Work Order is created (ADR-002 BOM Snapshot Pattern). The snapshot is org-scoped and linked to a specific `wo_id` and `bom_header_id`.

Key fields displayed:
| Field | Source | Notes |
|---|---|---|
| `snapshot_id` | `bom_snapshots.id` | UUID, shown truncated |
| `wo_reference` | `work_orders.wo_code` | Filterable |
| `bom_version` | `bom_snapshots.bom_version` | Version number at time of snapshot |
| `item_name` | `items.name` via `bom_headers` | FG name |
| `captured_at` | `bom_snapshots.created_at` | ISO timestamp |
| `captured_by` | `users.full_name` | WO creator |
| `status_badge` | derived | Always "Immutable" — never editable |

---

## 3. List View — Filters and Layout

### Filter chips (multi-select, OR within group, AND across groups)

| Filter | Options |
|---|---|
| WO Reference | Text search / autocomplete against `work_orders.wo_code` |
| Item / FG | Autocomplete against `items.name` where `item_type = 'fg'` |
| Date range | Date picker for `captured_at` |
| BOM version | Text input for exact version number |

### Table columns

`WO Reference` | `FG Name` | `BOM Version` | `Captured At` | `Captured By` | `Lines` (count) | `View Diff` (action)

### Immutability badge

Every row shows a padlock icon with tooltip "This snapshot cannot be edited — it records the exact BOM used for WO [reference]."

**Rule: No edit affordance exists anywhere on this screen.** There is no Edit button, no inline cell editing, and no bulk-action that modifies snapshot data.

---

## 4. Diff Modal Contract

Triggered by "View Diff" action on a snapshot row.

### Modal header

"BOM Snapshot vs Current — [WO Reference] / [FG Name]"

### Diff layout

Two-pane side-by-side table (reuse diff renderer from T-040 / `bom_versions_tab`):

| Column | Snapshot (immutable) | Current BOM |
|---|---|---|
| Component | value | value |
| Qty | value | value (highlight if changed) |
| UoM | value | value |
| Scrap % | value | value |

Changed cells highlighted with amber background.
Added lines (in current, not in snapshot) shown with green `[ADDED]` badge.
Removed lines (in snapshot, not in current) shown with red `[REMOVED]` badge.

### Modal footer

- "Close" button only — no save/confirm action.
- "Download Snapshot CSV" — exports snapshot lines as CSV for audit evidence.

---

## 5. Immutability Rules

1. Snapshot rows are INSERT-only in the database; no UPDATE or DELETE is ever permitted.
2. The server action layer must return a 403 if any mutation is attempted on a `bom_snapshots` record.
3. The UI layer must not render any mutation affordance (no edit button, no delete, no inline save).
4. Any discrepancy between snapshot and current BOM is informational only; the WO continues using its snapshot.

---

## 6. Server Action Semantics

- `getBomSnapshots(filters)` — read-only query; org-scoped via RLS (`app.current_org_id()`).
- `getBomSnapshotDiff(snapshotId)` — returns `{ snapshot: lines[], current: lines[] }`.
- No write actions exist for this screen.
- Pagination: default 50 rows per page; cursor-based.

---

## 7. Acceptance Gates (T3-ui drafting gate)

Before a T3-ui task may be drafted from this spec, **all** of the following must be confirmed:

1. List filters and table columns reviewed by UX team.
2. Diff modal contract confirmed by UX team (reuse of T-040 diff renderer agreed).
3. Immutability rules confirmed by Quality Lead.
4. Read-only server action signatures confirmed by backend engineer.
5. No edit affordance rule acknowledged by frontend engineer.

---

## 8. Out of Scope (this brief)

- Prototype JSX creation
- Implementation of diff renderer (reuse from T-040)
- WO lifecycle UI (belongs to 08-PRODUCTION)

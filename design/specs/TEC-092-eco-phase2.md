# TEC-092 ECO (Engineering Change Order) — Phase 2 Marker

**Task:** T-069
**PRD refs:** docs/prd/03-TECHNICAL-PRD.md §4.4 exclusions, §7A TEC-092
**Status:** PHASE-2 DEFERRED — out of scope for Phase 1 build.
**Marker:** [UNIVERSAL]

---

## 1. Summary

Engineering Change Order (ECO) workflow is explicitly out of scope for Phase 1.

PRD §4.4 exclusions list: "Advanced BOM: phantom BOMs, by-products, **ECO (Engineering Change Order) workflow**".

PRD §4.2 In Scope Phase 2 confirms ECO is a Phase 2 item under "Advanced BOM".

This note exists to ensure the three ECO prototype files are not orphaned and are traceable to a future Phase 2 re-decomposition.

---

## 2. Linked Prototypes (do not modify in Phase 1)

The following three prototype files capture the intended ECO UX. They are committed to the repo for design continuity but have no corresponding T1-schema, T2-api, or T3-ui Phase 1 tasks.

| Prototype label | File location | Description |
|---|---|---|
| `eco_screen` | `other-screens.jsx:1068` | Main ECO list/management screen |
| `eco_change_request_modal` | `modals.jsx:287` | Modal for submitting an Engineering Change Request |
| `eco_approval_modal` | `modals.jsx:332` | Modal for approving/rejecting an Engineering Change |

These prototypes were flagged as Phase-2 orphans in the audit (`_meta/audits/2026-04-30-design-prd-coverage.md` HIGH row 10). PRD §7A TEC-092 re-anchors them under the correct Phase 2 scope.

---

## 3. Phase 1 Constraints

- No T1-schema migration for ECO tables may be merged in Phase 1.
- No T2-api server actions for ECO may be drafted in Phase 1.
- No T3-ui tasks for ECO screens may be created in Phase 1.
- The prototype files may remain in the repo as design artefacts; they must not be imported or rendered by Phase 1 application code.

---

## 4. Phase 2 Re-decomposition Scaffolding

When Phase 2 planning begins, the re-decomposition should cover at minimum:

### Acceptance criteria scaffolding

1. **AC-ECO-01 — Change Request submission:** Given a quality_lead or technical_manager opens the ECO screen, when they submit a change request via `eco_change_request_modal`, then a `change_orders` record is created with status `pending_review` and an `eco.change_requested` outbox event is emitted.
2. **AC-ECO-02 — Approval workflow:** Given a change request is `pending_review`, when an approver acts via `eco_approval_modal`, then status transitions to `approved` or `rejected` with mandatory audit reason; `eco.approved` or `eco.rejected` event emitted.
3. **AC-ECO-03 — BOM clone-on-write:** Given an ECO is approved, when the system applies it, then the affected BOM version is cloned as a new draft version; the existing approved/released BOM version is never mutated in place.
4. **AC-ECO-04 — Traceability:** Given an ECO record exists, when an auditor queries the change history, then every BOM version change has a traceable link to its originating ECO record.
5. **AC-ECO-05 — Permission gate:** Given a user without `technical.bom.approve` permission, when they attempt to approve an ECO, then the action is blocked with a 403 response.

### Technical notes for Phase 2

- ECO schema must reference `bom_headers.id` (clone-on-write, never mutate approved rows).
- ECO state machine: `draft` → `pending_review` → `approved` | `rejected` → `applied` | `withdrawn`.
- Shared BOM SSOT rule applies: ECO changes must propagate through the same `bom_headers`/`bom_lines`/`co_products` tables used by all modules (Technical, NPD, Planning, Production, Warehouse, Finance).
- D365 push of ECO-derived BOM changes follows the existing D365 optional integration pattern (no hard FK on `d365_item_id`).

---

## 5. No Phase 1 Action Required

This document requires no code changes. It is a traceability artefact only.

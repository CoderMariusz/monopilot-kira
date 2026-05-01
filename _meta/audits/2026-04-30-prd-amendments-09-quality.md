# 09-QUALITY PRD Amendments — Bidirectional Reconciliation

**Date:** 2026-04-30
**Scope:** `09-QUALITY-PRD.md` only (UX + prototype index untouched).
**Predecessor:** `_meta/audits/2026-04-30-design-prd-coverage.md` §2 / Module 09-QUALITY (~85% coverage finding).
**Goal:** lift 09-QUALITY PRD↔UX coverage from ~85% to ≥90% via labeling-only edits (no deletions, no UX edits).

---

## 1. Inputs

- PRD: `/Users/mariuszkrawczyk/Projects/monopilot-kira/09-QUALITY-PRD.md` (1748 lines pre-edit, §8 UX Screens at lines 939-1050).
- UX spec: `/Users/mariuszkrawczyk/Projects/monopilot-kira/design/09-QUALITY-UX.md` (1404 lines; route table at lines 107-135).
- Prototype index: `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/prototype-labels/prototype-index-quality.json` (32 entries).
- ADR-034: `/Users/mariuszkrawczyk/Projects/monopilot-kira/_foundation/decisions/ADR-034-generic-product-lifecycle-naming-and-industry-configuration.md` (Generic Product Lifecycle Naming & Industry Configuration — applied as cross-cutting marker on all spec/product/recipe references).

---

## 2. Findings carried over from coverage audit

Coverage audit table for 09-QUALITY (`§2 Module 09-QUALITY`, lines 261-289) lists:

- Direction A gaps — LOW severity:
  - QA-052 Complaint+Incident — PRD says P1 stub, UX absent. → `[NO-PROTOTYPE-YET]`.
  - QA-070 Allergen Changeover gate evidence view — UX has it as `QA-016`. → relabel/link only.
  - QA-060 Lab Results browser (added during reconciliation) — PRD enumerated, UX absent. → `[NO-PROTOTYPE-YET]`.
- Direction B orphans — LOW severity (per audit):
  - `audit_export_modal`, `delete_with_reason_modal`, `inspection_assign_modal`, `audit_trail` page — all "OK" or "implicit" per audit.
- Direction C: PRD §8.2 spec wizard 3-step ↔ UX QA-003a — OK.

Additional Direction-B orphans observed during this reconciliation (not flagged in audit but missing from PRD §8.1):

- `QA-002a` Hold Detail (UX route splits list/detail; PRD `QA-011` is the same capability under different ID).
- `QA-003b` Spec Detail (UX) — PRD §8.1 has no detail row.
- `QA-003c` Spec Edit — PRD §8.1 has no edit row.
- `QA-005a` Inspection Detail — same capability as PRD `QA-031` but route-segmented.
- `QA-009a` NCR Detail — capability matches PRD `QA-042` which is currently P2; UX/proto carry P1 close workflow → flagged for **P1 promotion**.
- `QA-013a` HACCP Plan Detail — alias of PRD `QA-050`.
- `QA-015` CCP Deviations list — distinct from `QA-051` reading entry; merits its own §8.1 row.
- `QA-021` Audit Trail — referenced in §5.3 but not enumerated as a screen in §8.1.
- `QA-099` Quality Settings — admin page, not in PRD §8.1.
- `QA-025` Scanner desktop redirect — informational stub.

---

## 3. Edits applied to `09-QUALITY-PRD.md`

All edits scoped to a new `§8.3` + `§8.4` + `§8.5` block, inserted between §8.2 and §9. **No PRD content removed; UX file untouched.**

### §8.3 Direction-B reconciliation (12 new QUA-NNN subsections)

| New ID | Capability | Source UX | Source prototype | Notes |
|---|---|---|---|---|
| QUA-101 | Hold Detail | UX QA-002a (`design/09-QUALITY-UX.md:265-291`) | `hold_detail` (`holds-screens.jsx:164-286`) | Alias for §8.1 QA-011 — labeling only. ADR-034 marker. |
| QUA-102 | Specification Detail | UX QA-003b (`:398-419`) | `spec_detail` (`specs-screens.jsx:305-420`) | New screen-level subsection. ADR-034 marker on regulation tags. |
| QUA-103 | Edit Specification (draft only) | UX QA-003c (`:117`) | `spec_wizard` edit-mode | New. Tied to V-QA-SPEC-001 draft-only constraint. |
| QUA-104 | Incoming Inspection Detail | UX QA-005a (`:489-538`) | `inspection_detail` (`inspection-screens.jsx:100-297`) | Alias for §8.1 QA-031. |
| QUA-105 | NCR Detail + Workflow P1 | UX QA-009a (`:636-674`) | `ncr_detail`, `ncr_close_modal` (`modals.jsx:385-466`) | **Capability uplift** — recommends §8.1 QA-042 P2→P1. |
| QUA-106 | HACCP Plan Detail | UX QA-013a (`:130`) | `haccp_plans` (`haccp-screens.jsx:3-106`) | Alias for §8.1 QA-050. |
| QUA-107 | CCP Deviations List | UX QA-015 (`:778-808`) | `ccp_deviations`, `ccp_deviation_log_modal` (`modals.jsx:554-594`) | **New §8.1 row recommended** (P1). Numbering collision with QA-052 noted for next PRD revision. |
| QUA-108 | Audit Trail | UX QA-021 (`:849-888`) | `audit_trail` (`other-screens.jsx:117-229`), `audit_export_modal` (`modals.jsx:700-756`) | Made screen-level surface explicit (was implicit in §5.3). ADR-034 marker on regulation tag presets. |
| QUA-109 | Quality Settings | UX QA-099 (`:135`) | `qa_settings` (`other-screens.jsx:272-395`) | New admin page. ADR-034 marker on industry presets, hold reasons, channel set. |
| QUA-110 | Scanner Desktop Redirect Notice | UX QA-025 (`:894-911`) | (none) | Informational stub only. |
| QUA-111 | Inspection Assign Modal | UX MODAL-INSPECTION-ASSIGN (`:477`) | `inspection_assign_modal` (`modals.jsx:783-816`) | Operational metadata; no ADR-034 impact. |
| QUA-112 | Delete-with-Reason Modal | (cross-screen) | `delete_with_reason_modal` (`modals.jsx:759-780`) | Generic primitive over §5.3 audit pattern. |

### §8.4 Direction-A `[NO-PROTOTYPE-YET]` items

| §8.1 PRD ID | Action |
|---|---|
| QA-052 Complaint + Incident form | `[NO-PROTOTYPE-YET]` Phase E. ADR-034 marker added (channel taxonomy industry-configurable). |
| QA-060 Lab Results browser | `[NO-PROTOTYPE-YET]` Phase E. Note: ATP data already reachable via QA-016 drawer. |
| QA-070 Allergen Changeover gate evidence | **Linked** to UX QA-016 + prototype `allergen_gates`. No TODO. |
| QA-032 Inspection results form | **Linked** (folded into QA-005a/`inspection_detail`). |
| QA-042 NCR detail + workflow | **P1 promotion** flagged per QUA-105. |

### §8.5 UI Surfaces traceability table

Added: full PRD §8.1 ↔ UX QA code ↔ UX route ↔ prototype label cross-walk (29 rows including SCN-070..073/SCN-081 cross-module bridges and the e-sign primitive).

---

## 4. Coverage delta

| Metric | Before | After |
|---|---|---|
| §8.1 PRD-coded surfaces | 18 (16 desktop + 5 scanner overlap) | 18 (unchanged) |
| §8.3 new QUA-NNN subsections | 0 | 12 |
| Direction-B orphans (LOW per audit) | 4 listed + ~6 unflagged | 0 (all retired) |
| Direction-A `[NO-PROTOTYPE-YET]` items | 0 enumerated | 2 (QA-052 + QA-060) |
| Traceability table | absent | §8.5 — 29 rows |
| ADR-034 markers in §8 | 0 | 8 inline references |
| Estimated PRD↔UX coverage | ~85% | **~92%** (24/26 enumerated surfaces with UX+prototype anchors; 2 Phase-E TODOs) |

---

## 5. Constraints honored

- No content deleted from `09-QUALITY-PRD.md` (only insertions between §8.2 and §9).
- No edits to `design/09-QUALITY-UX.md`.
- All citations include UX line numbers and prototype labels inline.
- ADR-034 markers added in: §8.3 preamble, QUA-101, QUA-102, QUA-103, QUA-105, QUA-108, QUA-109, §8.4 row QA-052, §8.5 preamble.

---

## 6. Open follow-ups (for next PRD revision, not blocking)

1. **§8.1 row update for QA-042** — change P1/P2 column from P2 to P1 (per QUA-105). Out of scope for labeling-only pass.
2. **§8.1 numbering collision** — `QA-052` is currently "Complaint + Incident" but QUA-107 (CCP Deviations list) is also a candidate `QA-052` in some readings. Resolve by renaming Complaint to `QA-053` or moving CCP Deviations to `QA-051a`. Cosmetic; tracked for next revision.
3. **Phase E task creation** — create stories for QA-052 and QA-060 prototypes (currently `[NO-PROTOTYPE-YET]`).
4. **Schema-ID drift** — global decision pending per audit cross-cutting CC-1 (UX QA-NNN single-digit vs PRD QA-0NN three-digit). Out of scope here.

---

_Reconciliation prepared 2026-04-30. ADR-034 markers per Phase B.2 architectural review._

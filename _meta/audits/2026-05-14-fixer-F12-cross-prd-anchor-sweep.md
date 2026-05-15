# Fixer F12 — Cross-PRD Anchor Reality Sweep

**Fixer**: F12
**Date**: 2026-05-14
**Scope**: All 16 PRDs × all 16 atomic-task modules (project-wide)
**Method**: Mechanical regex sweep — extracted real headings from each PRD, checked every task's `prd_refs` against the real anchor set, repaired mismatches.

---

## Summary

| Metric | Count |
|---|---|
| Tasks audited | **976** |
| Passed (no broken anchor) | **966** |
| Fixed | **10** |
| Skipped (unresolvable) | **0** |
| Non-anchor refs (intentionally skipped) | **205** |

---

## Anchor index methodology

PRD headings were normalised to `§X.Y` form using three extraction patterns:

1. `^#{1,6}\s+(§\d+[A-Za-z]?(?:[.\-][A-Za-z\d]+)*)` — headings with `§` prefix (including `§4A`, `§15A.3`, `§5.x`, `§4.2-AMENDMENT` variants)
2. `^(§\d+[A-Za-z]?(?:[.\-][A-Za-z\d]+)*)` — bare `§` lines at start-of-line
3. `^#{1,6}\s+(\d+[A-Za-z]?(?:\.[A-Za-z\d]+)*)` — plain numbered headings (`## 5.1`, `### 15.1a`) mapped to `§5.1`/`§15.1a`

Two pattern iterations were required: first iteration missed lowercase-letter suffixes (`§15.1a`), second iteration missed uppercase-letter-only suffixes directly on the number (`§4A`, `§15A`). Final index saved to `/tmp/f12_prd_anchor_index.json`.

---

## Before/after table (all 10 fixes)

| Task | PRD | Old ref | New ref | Reason |
|---|---|---|---|---|
| `00-foundation/T-001` | 00-FOUNDATION | `§4.2-AMENDMENT` | `§4.2` | AMENDMENT is an inline blockquote note, not a heading |
| `00-foundation/T-002` | 00-FOUNDATION | `§5.Backend` | removed | Backend is an unnumbered subsection under `§5`; `§5` already in refs |
| `00-foundation/T-003` | 00-FOUNDATION | `§4.3-AMENDMENT` | `§4.3` | AMENDMENT is an inline blockquote note, not a heading |
| `07-planning-ext/T-004` | 07-PLANNING-EXT | `§4.1.4` | `§4.1` | Item 4 in `§4.1` list (Manual forecast entry); no `###` sub-heading exists |
| `07-planning-ext/T-030` | 07-PLANNING-EXT | `§4.1.5` | `§4.1` | Item 5 in `§4.1` list (Scheduler dashboard/GanttView); no sub-heading |
| `07-planning-ext/T-031` | 07-PLANNING-EXT | `§3.4` | `§3.2` | `§3.4` does not exist; approve/reject/override RBAC rules are in `§3.2 RBAC matrix` (confirmed by AC3 text "per §3.2 RBAC") |
| `07-planning-ext/T-032` | 07-PLANNING-EXT | `§4.1.6` | `§4.1` | Item 6 in `§4.1` list (Scheduler run lifecycle); no sub-heading |
| `09-quality/T-065` | 09-QUALITY | `§6.4`, `§6.5` | `§6.3` (×1) | `§6.4`/`§6.5` do not exist — NCR and HACCP entity definitions are in `§6.3 Key table summaries`; deduplicated to single entry |
| `13-maintenance/T-022` | 13-MAINTENANCE | `§11.1-11.4` | `§11` | Range notation — `§11` parent covers all V-MNT-01..24 validation rules |
| `15-oee/T-002` | 15-OEE | `§6.3` | `§6` | `§6.3` does not exist in 15-OEE; `§6 Decisions D-OEE-1..7` is the correct parent covering the consumer contract |

---

## Most frequent patterns (before→after)

1. `§X.Y.Z` (list-item sub-numbering) → `§X.Y` — 4 occurrences (07-planning-ext T-004/T-030/T-032 + implied T-031)
2. `§X.Y-AMENDMENT` → `§X.Y` — 2 occurrences (00-foundation T-001/T-003)
3. `§X.Y` missing from PRD (NCR/HACCP enumeration beyond real max) → nearest real `§X.Z` — 2 occurrences (09-quality T-065 §6.4/§6.5→§6.3)
4. Unnumbered sub-section name appended to `§X` — 1 occurrence (00-foundation T-002 `§5.Backend`)
5. Range notation `§X.A-X.B` → parent `§X` — 1 occurrence (13-maintenance T-022)

---

## Per-PRD breakdown

| PRD | Tasks with broken anchors | Fixed |
|---|---|---|
| 00-FOUNDATION-PRD | 3 (T-001, T-002, T-003) | 3 |
| 07-PLANNING-EXT-PRD | 4 (T-004, T-030, T-031, T-032) | 4 |
| 09-QUALITY-PRD | 1 (T-065, 2 broken anchors → 1 merged) | 1 |
| 13-MAINTENANCE-PRD | 1 (T-022) | 1 |
| 15-OEE-PRD | 1 (T-002) | 1 |
| All other PRDs (01/02/03/04/05/06/08/10/11/12/14) | 0 | 0 |

---

## Skipped tasks (unresolvable)

None. All 10 mismatches had clear semantic matches to real headings. No flagging required.

---

## Fields modified per task

For each repaired task:
- `pipeline_inputs.prd_refs` — broken anchor replaced/removed
- `pipeline_inputs.details` — provenance note prepended: "PRD anchor corrected from X to Y by Fixer F12 2026-05-14 (anchor sweep)"
- `prompt` body — where the broken anchor appeared literally in the prompt text, also updated

---

## Validator outcomes

| Module | Validator | Result |
|---|---|---|
| 00-foundation | `_validate.py` | PASS — 125 tasks, 125 unique deliverables |
| 07-planning-ext | `_validate.py` | PASS — 58 tasks, 0 errors |
| 09-quality | `_validate.py` | PASS — 65 task files, 0 failures |
| 15-oee | `_validate.py` | PASS — 25 task files validated, coverage.md clean |
| 13-maintenance | no `_validate.py` present | n/a |

Final full-sweep (all 976 tasks): **976/976 PASS, 0 broken.**

---

## Pre-existing F2 overlap check

F2's report (`2026-05-14-fixer-F2-multisite-settings-finance-remediation.md`) covered Issue G (UI parity), Issue A–J (details/risk/test_strategy shape) across 02-settings, 10-finance, 14-multi-site. F2 did NOT perform a prd_refs anchor sweep. Zero overlap with F12 repairs.

---

## Anchor index artefact

`/tmp/f12_prd_anchor_index.json` — 16 PRDs, combined ~1200 real anchors extracted.

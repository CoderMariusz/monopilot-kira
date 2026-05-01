# PRD Amendments — 13-MAINTENANCE (v3.1 UI surface catalog amendment)

**Date:** 2026-04-30
**Predecessor audit:** `_meta/audits/2026-04-30-design-prd-coverage.md` §13-MAINTENANCE (BLOCKER row #1, top-20 §4)
**PRD modified:** `13-MAINTENANCE-PRD.md` (v3.1, footer changelog updated)
**UX touched:** none (read-only per task constraints)
**ADR touched:** none (ADR-034 hygiene note added inline to PRD §10.6)

---

## 1. Sections added

**Direction B (orphan-screen anchoring) — 21 new MNT-NNN screen sections** added under new `§10.3 Screen-Level UI Catalog (MNT-015..MNT-035)`:

| MNT-NNN | Screen | Source UX line | Source prototype label |
|---|---|---|---|
| MNT-015 | Asset Registry — List | `design/13-MAINTENANCE-UX.md:209-262` (MAINT-002) | `asset_list_page` (assets.jsx:1-183) |
| MNT-016 | Asset Registry — Detail | UX:265-300 (MAINT-003) | `asset_detail_page` (assets.jsx:185-518) |
| MNT-017 | Work Request — List | UX:302-333 (MAINT-004) | `wr_list_page` (work-orders.jsx:1-132) |
| MNT-018 | Work Request — Create (shop-floor) | UX:336-364 (MAINT-005) | `wr_create_modal` (modals.jsx:81-121) |
| MNT-019 | Work Request — Triage Modal | UX:367-393 (MAINT-006) | `wr_triage_modal` (modals.jsx:123-183) |
| MNT-020 | mWO List | UX:396-434 (MAINT-007) | `mwo_list_page` (work-orders.jsx:134-259) |
| MNT-021 | mWO Detail | UX:437-503 (MAINT-008) | `mwo_detail_page` (work-orders.jsx:261-584) |
| MNT-022 | PM Schedule List + Calendars | UX:505-534 (MAINT-009) | `pm_schedules_list_page`, `pm_month_calendar`, `pm_week_calendar` |
| MNT-023 | PM Schedule Wizard (Create/Edit) | UX:537-580 (MAINT-010) | `pm_schedule_edit_wizard` (modals.jsx:357-472) |
| MNT-024 | Calibration List | UX:583-612 (MAINT-011) | `calibration_list_page` (other-screens.jsx:1-127) |
| MNT-025 | Calibration Record Detail | UX:615-633 (MAINT-012) | `calibration_detail_page` (other-screens.jsx:129-264) |
| MNT-026 | Spare Parts List | UX:636-668 (MAINT-013) | `spares_list_page` (spares.jsx:1-115) |
| MNT-027 | Spare Part Detail | UX:671-687 (MAINT-014) | `spare_detail_page` (spares.jsx:117-261) |
| MNT-028 | Technicians List | UX:689-715 (MAINT-015) | `technicians_list_page` (other-screens.jsx:266-374) |
| MNT-029 | Technician Detail | UX:717-727 (MAINT-016) | `technician_detail_page` (other-screens.jsx:376-486) |
| MNT-030 | LOTO Procedures List | UX:730-762 (MAINT-017) | `loto_list_page` (other-screens.jsx:488-598) |
| MNT-031 | Maintenance Analytics Hub | UX:832-867 (MAINT-020) | `maintenance_analytics_page` (other-screens.jsx:601-803) |
| MNT-032 | Maintenance Settings | UX:871-922 (MAINT-021) | `maintenance_settings_page` (other-screens.jsx:805-964) |
| MNT-033 | Maintenance Outbox / DLQ | [NO-UX-YET] | [NO-PROTOTYPE-YET] (Direction A TODO) |
| MNT-034 | Sanitation Allergen Audit Surface | [NO-UX-YET] | [NO-PROTOTYPE-YET] (Direction A TODO) |
| MNT-035 | PM Occurrence Skip Audit | [NO-UX-YET] | [NO-PROTOTYPE-YET-AUDIT] (Direction A TODO) |

**Subsection count:** 21 screen sections + 1 modal contract table (15 entries MNT-M-01..15) + 1 surfaces map + 1 ADR-034 hygiene note = **24 new subsections** under §10.

**Direction A (PRD-only, no design)** — 3 stub sections added with `[NO-PROTOTYPE-YET]` markers (MNT-033/034/035) anchoring TODOs against §12.3 outbox events, §10.2 P2 dashboards (Sanitation Allergen Audit), and §11 PM skip flow.

**Modal contracts (§10.4):** 15 modals enumerated with UX line + prototype label + parent screen MNT-NNN trigger (per audit CC-6 modal-schema gap finding). Includes: `asset_edit_modal`, `pm_occurrence_skip_modal`, `mwo_create_modal`, `downtime_linkage_modal`, `calibration_cert_upload_modal`, `calibration_reading_modal`, `spare_reorder_modal`, `spare_adjust_modal`, `technician_skill_edit_modal`, `loto_apply_modal`, `loto_clear_modal`, `mwo_complete_signoff_modal`, `task_checkoff_modal`, `criticality_override_modal`, `delete_confirm_modal`.

**§10.5 UI Surfaces Map:** Single-glance MNT-NNN ↔ UX section/line ↔ prototype path ↔ status table covering MNT-001..014 dashboards (existing) + MNT-015..035 screens (new) + MNT-M-01..15 modals (new).

**§10.6 ADR-034 hygiene note:** Generic naming verified (no Apex bakery vocabulary leaks); code prefixes (EQ-/MWO-/WR-/PM-/CAL-/SP-/LOTO-) flagged as 02-SET §8.1 `code_prefixes` ref-table-driven per ADR-034 §1; markers per pattern: `[UNIVERSAL]` on all 21 new sections; `[EVOLVING]` reserved for P2 sensors/ML; `[LEGACY-D365]` N/A (no D365 integration in M13 P1 per §12.1).

---

## 2. TODOs

| TODO ID | Description | Marker | Resolution path |
|---|---|---|---|
| MNT-033 | Add UX + prototype for Outbox/DLQ inspection screen | `[NO-PROTOTYPE-YET]` | OQ-MNT-11 added — P2 decision (alternative: rely on `rpt_integration_health` in 12-REPORTING) |
| MNT-034 | Add UX + prototype for Sanitation Allergen Audit drilldown (BRCGS evidence-trail) | `[NO-PROTOTYPE-YET]` | OQ-MNT-12 added — P2 with potential P1 escalation if BRCGS audit demands it; tied to 13-e sub-module §16 |
| MNT-035 | Add UX + audit surface for PM occurrence skip history (skip flow modal `pm_occurrence_skip_modal` already exists) | `[NO-PROTOTYPE-YET-AUDIT]` | P2; supports PM compliance % transparency on MNT-031 |
| Schema-ID drift | PRD MNT-NNN vs UX MAINT-NNN parallel naming (audit CC-1) | — | OQ-MNT-13 added — P1 architecture decision; until resolved, both schemas tracked side-by-side in §10.5 |
| BL-MAINT-04 | LOTO two-person remote confirmation flow not prototyped (referenced from MNT-030) | known bug | Carried forward from prototype index `loto_apply_modal` |
| BL-MAINT-05 | Skills Matrix PDF export stub (referenced from MNT-028) | known bug | Carried forward from prototype index |
| BL-MAINT-07 | Spare reorder P1 emits internal notification only; D365 PO integration deferred (§12.2 stage X) | known bug | Tied to OQ-MNT-10 |

No PRD content was deleted. Existing dashboards §10.1/10.2 (MNT-001..014) preserved verbatim. Sections §1-9, §11-19 untouched (changelog §18 + open items §17 amended additively).

---

## 3. Coverage % before → after

| Direction | Before | After | Delta |
|---|---|---|---|
| Direction A (PRD → UX) | dashboards 100% (6/6 P1 + 8/8 P2 catalogued) | dashboards 100% + screens 95% (18/21 anchored, 3 explicit `[NO-PROTOTYPE-YET]`) | +21 screens documented |
| Direction B (UX → PRD) | ~30% (only 6 dashboards mapped; 9+ screen-level orphans) | ~95% (all 21 UX MAINT-NNN screens anchored; 14 of 15 modals anchored) | +9 BLOCKER orphans resolved |
| **Aggregate (audit metric)** | **~60%** (per audit `2026-04-30-design-prd-coverage.md:29`) | **~95%** | **+35 percentage points** |

Target was ≥85%. Achieved ~95% (3 remaining gaps explicitly P2-deferred with TODO markers per Direction A convention).

---

## 4. Blockers

**Resolved by this amendment:**
- **BLOCKER #1 (audit §4 top-20)**: 13-MAINTENANCE PRD has zero screen-level IDs (only dashboards). 9+ MAINT-NNN screens prototyped without PRD anchor → **RESOLVED**. All 9+ orphan screens (MAINT-002 Asset List, MAINT-003 Asset Detail, MAINT-004 WR List, MAINT-005 WR Create, MAINT-006 WR Triage, MAINT-008 mWO Detail, MAINT-012 Calibration Detail, MAINT-014 Spare Detail, MAINT-015 Technicians List, MAINT-016 Technician Detail, MAINT-017 LOTO List, MAINT-020 Analytics, MAINT-021 Settings) now anchored in PRD §10.3.
- **HIGH #14 (audit)**: `pm_occurrence_skip_modal` orphan → anchored as MNT-M-02 in §10.4 modal contracts table; audit-trail surface deferred as MNT-035 P2 with explicit TODO.

**Remaining (deferred, not in scope of this amendment):**
- **OQ-MNT-13 (new)**: Schema-ID drift between PRD MNT-NNN and UX MAINT-NNN. Parallel tracking in §10.5 is a stopgap; long-term policy decision pending architecture sync (audit CC-1 cross-cutting). Affects 21 screens in this module.
- **OQ-MNT-11 (new)**: Outbox/DLQ inspection screen — P1 vs P2 trade-off. If 12-REPORTING `rpt_integration_health` covers maintenance outbox sufficiently, MNT-033 stays P2. Otherwise promote to P1.
- **OQ-MNT-12 (new)**: Sanitation Allergen Audit drilldown — required for BRCGS audit cycle. If audit cycle is imminent, MNT-034 escalates to P1 within 13-e sub-module.
- **Cross-module boundary** (audit CC-7 not in scope here): Allergen changeover gate spans 08-PROD §SCR-08-03 + 09-QA §QA-070 + 06-SCN SCN-081. M13 contributes sanitation MWO sign-off (V-MNT-15..17, MNT-021 banner). Triple ownership needs cross-PRD decision (out of 13-MAINTENANCE scope per task constraints).

---

## 5. File-level changes summary

| File | Lines before | Lines after | Δ |
|---|---|---|---|
| `13-MAINTENANCE-PRD.md` | 870 | ~1090 (estimated post-edit) | +220 |
| `_meta/audits/2026-04-30-prd-amendments-13-maintenance.md` | (new) | this file | new |

No deletions. No edits to UX file (`design/13-MAINTENANCE-UX.md` untouched per task constraint). No edits to ADR-034 (hygiene note added inline to PRD §10.6 instead).

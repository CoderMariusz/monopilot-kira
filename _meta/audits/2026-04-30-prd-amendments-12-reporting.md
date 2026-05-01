# 12-REPORTING PRD Amendments — 2026-04-30 Reconciliation Pass

**Source audit:** `_meta/audits/2026-04-30-design-prd-coverage.md` §Module 12-REPORTING (~80% coverage; 5 Direction-B orphan modals + 2 unanchored P2 list/edit screens)
**Target file:** `12-REPORTING-PRD.md` (now v3.2)
**Scope discipline:** Strictly within 12-REPORTING. UX file (`design/12-REPORTING-UX.md`) untouched. Only ADD or RE-ORDER inside the PRD; no deletions. Inline citations of UX line numbers and prototype labels per audit fix protocol. ADR-034 markers applied to all new content ([UNIVERSAL] default).

---

## 1. Coverage delta

| Metric | Before | After |
|---|---|---|
| PRD screen IDs (RPT-NNN, RPT-HOME, RPT-EXPORTS, RPT-SAVED, RPT-SETTINGS) | 13 (RPT-001..010 + 3 support, modal contracts narrative-only) | 27 (added RPT-011..020 + RPT-SCHED + RPT-SCHED-EDIT, plus formalised RPT-HOME/EXPORTS/SAVED/SETTINGS anchors) |
| PRD modal contracts | 0 explicit (modals referenced only by UX MOD-NN labels) | 10 explicit (RPT-011..020) |
| Prototype labels in `prototype-index-reporting.json` referenced by PRD | ~13 / 28 (~46%) | 28 / 28 (100% — every prototype anchored at least once via §15.1/§15.1a/§15.1b/§15.2/§15.3 or §15.4 matrix) |
| Direction A rows without design (`[NO-PROTOTYPE-YET]`) | implicit in §4.2 P2 narrative | 7 explicit (Multi-granularity selector, Custom DSL builder, External BI Embed, XLSX, JSON/Parquet, Per-org customisation, ML anomaly) |
| Direction B orphans (prototypes without PRD anchor) | 5 (`regulatory_signoff_modal`, `recipient_group_modal`, `error_log_modal`, `share_report_modal`, plus 2 unanchored list/edit screens `rpt_scheduled_list` + `rpt_scheduled_edit`) per audit row 18 + module table | 0 — all anchored via RPT-011..020 + RPT-SCHED + RPT-SCHED-EDIT |
| **Headline coverage** | **~80%** (per audit row 18) | **≥95%** — only residuals are 7 `[NO-PROTOTYPE-YET]` P2/P3 rows with explicit TODOs and surfaces table status `TODO-DESIGN` |

The translation-notes labeling fix (referenced in the calling brief: "10 missing translation-notes entries were just stubbed during labeling fix") affected the modal entries — those are now first-class PRD surfaces RPT-011..020 with full behavioural contracts so the stub `translation_notes` no longer matters for traceability completeness.

---

## 2. Sections added

All inserted inside `12-REPORTING-PRD.md` §15 Screens (between existing §15.1/§15.2/§15.3 and §16 Build Roadmap). No content deleted.

| New PRD ID | Title | UX source line(s) | Source prototype | Phase |
|---|---|---|---|---|
| RPT-011 | Share Report Link Modal | `design/12-REPORTING-UX.md:863-878` (MOD-SHARE) | `share_report_modal` (`reporting/modals.jsx:258-282`) | P1 |
| RPT-012 | Regulatory Sign-off Modal | `design/12-REPORTING-UX.md:911-928` (MOD-REGULATORY-SIGNOFF) | `regulatory_signoff_modal` (`reporting/modals.jsx:332-378`) | P2 |
| RPT-013 | Recipient Group Modal | `design/12-REPORTING-UX.md:944-955` (MOD-RECIPIENT-GROUP) | `recipient_group_modal` (`reporting/modals.jsx:403-435`) | P2 |
| RPT-014 | Export Error Log Modal | `design/12-REPORTING-UX.md:893-908` (MOD-ERROR-LOG) | `error_log_modal` (`reporting/modals.jsx:306-329`) | P1 |
| RPT-015 | Force Refresh Confirm Modal | `design/12-REPORTING-UX.md:931-940` (MOD-REFRESH-CONFIRM) | `refresh_confirm_modal` (`reporting/modals.jsx:381-400`) | P1 |
| RPT-016 | Run Now Confirm Modal | `design/12-REPORTING-UX.md:1319` (RPT-SCHED inline confirm) | `run_now_confirm_modal` (`reporting/modals.jsx:438-450`) | P2 |
| RPT-017 | Delete / Deactivate Confirm Modal | `design/12-REPORTING-UX.md:880-889` (MOD-DELETE-CONFIRM) | `delete_confirm_modal` (`reporting/modals.jsx:285-303`) | P1 |
| RPT-018 | Save Filter Preset Modal | `design/12-REPORTING-UX.md:812-827` (MOD-SAVE-PRESET) | `save_preset_modal` (`reporting/modals.jsx:115-148`) | P1 |
| RPT-019 | P2 Feature Toast Modal | `design/12-REPORTING-UX.md:1171-1173` (P2 placeholder section banner) | `p2_toast_modal` (`reporting/modals.jsx:453-464`) | P1 |
| RPT-020 | Access Denied Modal | `design/12-REPORTING-UX.md:1117` (toast row "Access denied" inline pattern) | `access_denied_modal` (`reporting/modals.jsx:467-481`) | P1 |
| RPT-SCHED | Scheduled Reports List | `design/12-REPORTING-UX.md:1290-1329` | `rpt_scheduled_list` (`reporting/other-screens.jsx:159-242`) | P2 |
| RPT-SCHED-EDIT | Scheduled Report Create / Edit | `design/12-REPORTING-UX.md:1331-1389` | `rpt_scheduled_edit` (`reporting/other-screens.jsx:245-432`) | P2 |
| §15.4 | UI surfaces traceability matrix (bidirectional PRD ↔ UX ↔ prototype ↔ status) | n/a | n/a (matrix, 50 rows) | n/a |

Also amended (no deletions):
- **Header line `**Wersja:**`** → `3.2 | … | Status: Baseline + PRD↔UX coverage reconciliation`.
- **§1 Markers paragraph** → added `[ORG-CONFIG]` (per ADR-034) and a note that 2026-04-30 additions carry `[UNIVERSAL]` unless tagged otherwise.
- **§9.3 schema** — three new tables embedded inline at RPT-013 (`recipient_groups`, `recipient_group_members`) and RPT-018 (`saved_filter_presets`). No alteration of existing P1/P2 tables.
- **§15.2 P1 Support screens** — narrative bullets replaced with explicit RPT-HOME/RPT-EXPORTS/RPT-SAVED/RPT-SETTINGS anchors citing UX line + prototype label.
- **§15.3 P2 Dashboards + Admin** — narrative bullets enriched with RPT-P2-001..013 ↔ UX line citations and explicit `[NO-PROTOTYPE-YET]` markers for Multi-granularity / Custom DSL / External BI / Excel / JSON / Per-org / ML.
- **§Changelog** → new top entry `v3.2 (2026-04-30, PRD↔UX coverage reconciliation)` summarising additions; `v3.1` retained intact below it.

No content deleted from §1–§14, §16 Build Roadmap, §17 Open Questions (OQ-RPT-01..10 preserved unchanged), §18 prior changelog entries, or §19 References.

---

## 3. TODOs created

| TODO ID | Description | Owner | Linked surface table row |
|---|---|---|---|
| RPT-PRD-AMEND-01 | Multi-granularity time selector (D-RPT-4 P2) — UX detail TBD; PRD §4.2 already lists. Status `TODO-DESIGN`. | UX Designer | row "Multi-granularity time selector" |
| RPT-PRD-AMEND-02 | Custom Report Builder DSL admin UI — UX OQ #2 (line 1396) only; needs full UX section for `reporting.custom_dsl_builder` flag flow + RPT-DSL screen ID assignment. | UX Designer | row "Custom Report Builder DSL (P2)" |
| RPT-PRD-AMEND-03 | External BI Embed (Metabase/Grafana) — `[NO-UX-YET]`, `[NO-PROTOTYPE-YET]`. Needs config screen + iframe wrapper UX. | UX Designer | row "External BI Embed (Metabase/Grafana)" |
| RPT-PRD-AMEND-04 | XLSX export — UX shows grayed option in MOD-EXPORT (line 794) but no detailed multi-sheet workbook spec. Needs sheet layout + chart embedding rules. | UX Designer | row "Excel (XLSX) export" |
| RPT-PRD-AMEND-05 | JSON / Parquet exports — `[NO-UX-YET]`. Defer to data-science persona spec or batch S3/GCS retrieval flow. | Product / Data | row "JSON / Parquet export" |
| RPT-PRD-AMEND-06 | Per-org dashboard customization (ADR-031 L2, OQ #10) — drag-and-drop tile editor scope decision pending designer (UX line 1412). | UX Designer | row "Per-org dashboard customization (ADR-031 L2)" |
| RPT-PRD-AMEND-07 | ML anomaly detection (R12 P3) — `[NO-UX-YET]`. Out of P1/P2 scope; placeholder retained in §15.4 for completeness. | Future | row "ML anomaly detection (R12)" |
| RPT-PRD-AMEND-08 | Audit alignment with `_meta/plans/2026-04-30-ux-prd-plan-gap-backlog.md` Cross-cutting #1 (modal contract gap across all 13 modules) — RPT-011..020 here serves as the canonical pattern; adopt the same per-module modal-anchor approach for 03/04/05/13/14. | Architecture | n/a (cross-module follow-up) |

---

## 4. Direction A vs Direction B accounting

**Direction B (orphan prototypes/UX → new PRD subsections):** 14 net resolutions
- 10 modal prototypes promoted to RPT-011..020 (`share_report_modal`, `regulatory_signoff_modal`, `recipient_group_modal`, `error_log_modal`, `refresh_confirm_modal`, `run_now_confirm_modal`, `delete_confirm_modal`, `save_preset_modal`, `p2_toast_modal`, `access_denied_modal`).
- 2 page prototypes promoted to RPT-SCHED + RPT-SCHED-EDIT (`rpt_scheduled_list`, `rpt_scheduled_edit`).
- 4 support-screen prototypes formalised into §15.2 anchors (`rpt_home_dashboard_catalog`, `rpt_exports_history`, `rpt_saved_filters`, `rpt_settings_tabbed`).
- The remaining 2 prototypes (`schedule_report_modal`, `export_report_modal`) were already implicitly anchored via UX MOD-SCHEDULE and MOD-EXPORT respectively — now explicit in §15.4 matrix.

**Direction A (PRD bullets without design):** 7 `[NO-PROTOTYPE-YET]` markers added in §15.3 + §15.4 for genuinely unbuilt P2/P3 features. These are scope-tracked, not blockers.

**No bidirectional contradictions found.** The PRD vs UX schema is well-aligned at the dashboard level (RPT-001..010 numbering matches UX), so this pass is purely additive (modals + auxiliary surfaces + matrix), not a renumbering exercise.

---

## 5. Validation checklist

- [x] All 28 prototypes in `_meta/prototype-labels/prototype-index-reporting.json` referenced at least once in PRD §15.1/§15.1a/§15.1b/§15.2/§15.3/§15.4.
- [x] All P1 + P2 PRD entries cite UX line numbers (or `[NO-UX-YET]` marker).
- [x] All new PRD content carries ADR-034 marker (`[UNIVERSAL]` for universal contracts; legacy `[APEX-CONFIG]`/`[LEGACY-D365]` markers preserved untouched in pre-existing sections).
- [x] No content deleted from PRD.
- [x] UX file `design/12-REPORTING-UX.md` not modified (per constraints).
- [x] Header version bumped to v3.2.
- [x] Changelog entry added at top of §18.
- [x] Schema additions for RPT-013 + RPT-018 are scoped to §9.3 reference (consistent with existing P2 schema location).

---

## 6. Blockers

**None.** All changes are documentation-only and do not require implementation work. The 7 `TODO-DESIGN` rows in §15.4 are P2/P3 design backlog items, not blockers for P1 reporting build (sub-modules 12-a..d remain unblocked per §16 Build Roadmap).

---

## 7. Cross-references

- Source audit: `_meta/audits/2026-04-30-design-prd-coverage.md` §Module 12-REPORTING (rows 18, severity-ranked top-20 #18, cross-cutting CC-6 modal contracts under-specified).
- ADR-034: `_foundation/decisions/ADR-034-generic-product-lifecycle-naming-and-industry-configuration.md` — marker conventions adopted.
- Sister amendment files in this audit batch: `2026-04-30-prd-amendments-{00,01,02,03,04,05,06,07,08,09,10,11,13,14,15}-*.md` — same pattern.
- Prototype labeling fix prerequisite: `_meta/audits/2026-04-30-prototype-labeling-fix-report.md` (10 stubbed translation_notes entries — consumed here as anchored surfaces).

---

_End of 12-REPORTING amendment summary. Coverage 80% → ≥95%._

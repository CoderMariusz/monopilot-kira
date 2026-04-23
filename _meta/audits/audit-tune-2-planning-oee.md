# Audit: tune-2-planning-oee
**Auditor:** Audit-2 (read-only)  
**Date:** 2026-04-23  
**Sources:** `04-PLANNING-BASIC-PRD.md` v3.1, `15-OEE-PRD.md` v3.1, `00-FOUNDATION-PRD.md` v3.0, `design/04-PLANNING-BASIC-UX.md` v1.0, `design/Monopilot Design System/planning/` (14 files), `design/Monopilot Design System/oee/` (8 files)  
**Note:** `design/15-OEE-UX.md` does NOT exist (Glob confirmed). OEE prototype generated directly from PRD.

---

## MODULE 1: 04-PLANNING-BASIC

### A. PRD → Prototype Coverage

| PRD Feature | Prototype Present | Notes |
|---|---|---|
| Planning Dashboard (§13) — 8 KPI cards, alerts, upcoming tabs, cascade chains, quick actions | YES — `PlanDashboard` | Full: D365 flag toggle, auto-refresh, 4 upcoming tabs, quick actions strip |
| PO List (§6.6 `POTable`) | YES — `PlanPOList` | PO table with status filters, D365 drift badge |
| PO Detail (§6.6 `PODetail`) | YES — `PlanPODetail` | 2-col layout, approval card, D365 sync card, status history, GRN progress |
| PO 3-step Fast Flow wizard (§6.2 FR-PLAN-005/006) | YES — `POFastFlowModal` | All 3 steps, smart defaults, approval trigger |
| PO Approval Modal (§6.2 FR-PLAN-008) | YES — `POApprovalModal` | Dual-path approve/reject with reason |
| **PO Bulk Import (§6.2 FR-PLAN-006)** | **MISSING** | No `POBulkImport` screen or modal found in any jsx file |
| **Supplier Master CRUD screens (§6.1, §6.6 `SupplierTable`, `SupplierForm`, `SupplierDetail`)** | **MISSING** | Supplier data used in PO screens but no dedicated Supplier management screens |
| TO List (§7.7) | YES — `PlanTOList` | Status/warehouse/date/priority filters |
| TO Detail (§7.7) | YES — `PlanTODetail` | LP breakdown panel, ship/receive progress |
| TO Create Modal (§7.7) | YES — `TOCreateModal` | Warehouse pick, priority, lines |
| TO Ship Modal (§7.7) | YES — `ShipTOModal` | Per-line qty sign-off |
| **TO Receive Modal (§7.7 `ReceiveTOModal`)** | **MISSING** | `ShipTOModal` present but no `ReceiveTOModal` found |
| **TO LP Selector Modal (§7.3 `TOLPSelector`)** | YES — `LPPickerModal` | FEFO/FIFO suggestion present |
| WO List (§8.10) | YES — `PlanWOList` | All 7 status filters, allergen profile dots, availability indicator, cascade badge, source filter |
| WO Detail (§8.10) | YES — `PlanWODetail` | Tabbed: overview; status-dependent header actions; BOM snapshot badge; cascade layer badge |
| WO Create Modal (§8.10) | YES — `WOCreateModal` | BOM preview, cascade preview trigger |
| Cascade Preview Modal (§8.10 `CascadePreviewModal`) | YES — `CascadePreviewModal` | N+1 tree before create |
| Cascade DAG View (§8.4, §13.1) | YES — `PlanCascadeDAG` | Global + per-chain filter, dry-run button, layout toggle |
| Reservation Panel (§9.5) | YES — `PlanReservations` | Hard-lock table, availability panel, RM root note, override action |
| Allergen Sequencing View (§10.7) | YES — `PlanSequencing` | Before/after comparison per line, override reason |
| **WO Spreadsheet (§8.10 `WOSpreadsheet`)** | **MISSING** | Bulk-edit spreadsheet view not implemented |
| **WO Outputs Panel (§8.10 `WOOutputsPanel`)** | PARTIAL | WO Detail has outputs referenced in data but no distinct `WOOutputsPanel` tab visible in prototype tabs (tabs: overview only scanned) |
| **WO Dependencies Tree (§8.10 `WODependenciesTree`)** | PARTIAL | Cascade DAG screen covers global view; per-WO DAG tree tab in detail may be omitted (not confirmed present) |
| WO Availability Panel G/Y/R (§8.6 `WOMaterialsTable`) | YES | G/Y/R dots in WO List; detail header shows availability |
| Gantt View (§11.5, §8.10 `WOGanttChart`) | YES — `PlanGantt` | Per-line × time day/week, capacity warnings |
| Release to Warehouse Button (§12 `ReleaseToWarehouseButton`) | YES | In WO Detail header actions (`released` status) |
| D365 SO Queue (§15 `D365ConfigPanel`) | YES — `PlanD365Queue` | Flag-gated screen with error log, draft WO review |
| Planning Settings (§14 `PlanningSettingsPage`) | YES — `PlanSettings` | Tabbed: General/PO/TO/WO/Intermediate/Sequencing/D365/Status Display |
| Override Reservation Modal (§9.5 `OverrideReservationModal`) | YES — `HardLockReleaseConfirm` | Admin-only, requires reason |
| Cycle Check Warning (§8.4, §8.11 V-PLAN-WO-005) | YES — `CycleCheckWarning` modal | DAG cycle block |

**Coverage estimate: ~85%** of PRD-specified components are present. Key gaps: Supplier CRUD screens (3 PRD components), PO Bulk Import screen, TO Receive Modal, WO Spreadsheet, WO Outputs Panel as dedicated tab.

---

### B. Prototype → PRD Hallucinations

| Prototype Element | PRD Basis | Classification | Notes |
|---|---|---|---|
| `DryRunButton` on Cascade DAG screen | ADR-029 rule engine dry-run; §16.1 rule registry has dry-run concept | **(A) Extrapolation** | PRD mentions dry-run for rule registry (02-SETTINGS §7), not explicitly for cascade generation UI button. Low risk — consistent with ADR-029 philosophy |
| `RunStrip` (8-shift history strip) on WO Detail header | No explicit PRD component | **(A) Extrapolation** | Visual micro-component that extends WO Detail beyond PRD spec. Benign UX enhancement, no functional conflict |
| `WO Detail` tab structure (only "overview" tab visible in prototype) — PRD specifies `WOMaterialsTable`, `WOOperationsTimeline`, `WOOutputsPanel`, `WODependenciesTree` as separate views | Yes in PRD §8.10 | **(C) Drift** | PRD specifies 6+ distinct WO sub-panels; prototype collapses into fewer tabs. Incomplete, not hallucination |
| `ModalGallery` screen (case "gallery" in router) | Not in PRD | **(B) QA Scaffolding** | Low risk — dev/QA tool, not a shipped screen |
| `PlanD365Queue` — column "D365 SO Reference" and error batch log panel | PRD §15.2 specifies worker log in 02-SETTINGS admin; §14.3 specifies "D365 SO pull last run, rows pulled, errors" dashboard tile | **(A) Extrapolation** | Prototype promotes the admin tile into a full page. Acceptable scope extension |
| `DryRunButton` on `PlanSequencing` | PRD §10.4 mentions dry-run for sequencing rule in rule registry | **(A) Consistent** | Directly supported by ADR-029 §16.1 |

**No (B) Pure hallucinations identified** (components with zero PRD basis). All deviations classify as (A) reasonable extrapolation or (C) coverage drift.

---

### C. Drift Analysis

| Drift Item | Severity | Detail |
|---|---|---|
| Supplier CRUD screens absent | **HIGH** | PRD §6.1/§6.6 specifies `SupplierTable`, `SupplierForm`, `SupplierDetail` as first-class screens. Prototype only references supplier data inline in PO screens. Full supplier management is a Must Have PRD feature (FR-PLAN-001/002/003). |
| WO Detail tabs incomplete | **MEDIUM** | PRD §8.10 lists 10+ WO sub-components (Materials, Operations, Outputs, Dependencies, Availability, Gantt). Prototype WO Detail appears to have only 1 visible tab in scanned structure. Multiple panels likely missing or collapsed. |
| PO Bulk Import absent | **MEDIUM** | PRD §6.2 FR-PLAN-006 is "Should Have." Modal for CSV paste + grouping preview not in prototype. |
| TO Receive Modal absent | **LOW-MEDIUM** | PRD §7.7 `ReceiveTOModal` specified. TO Detail has receive progress but no dedicated receive modal. |
| WO Spreadsheet absent | **LOW** | PRD §8.10 `WOSpreadsheet` (bulk edit, Could Have adjacent). Not present. |
| D365 Supplier pull drift indicator in PO Detail | **OK** | Correctly implemented — drift badge + admin resolve link present. |
| Allergen profile snapshot on WO (§8.7 side effect of RELEASED) | **OK** | WO List shows allergen dot badges; PRD requirement met in list view. |

---

### D. Fitness Assessment — PLANNING

| Dimension | Score |
|---|---|
| **Coverage %** | ~85% (Supplier CRUD, PO Bulk, TO Receive, WO Spreadsheet, WO Detail tab completeness missing) |
| **Hallucination Risk** | LOW — no (B) hallucinations; all (A) extrapolations are PRD-consistent |
| **Drift Severity** | MEDIUM — Supplier CRUD is a high-impact gap (PRD §6.1-§6.6 Must Have) |
| **Fitness** | **YELLOW** |

**Rationale:** Core flows (PO/TO/WO CRUD, cascade DAG, reservations, sequencing, dashboard) are well-covered and faithful. The YELLOW verdict is driven by: (1) complete absence of Supplier master management screens which is a Must Have PRD feature group (FR-PLAN-001/002/003), and (2) WO Detail tab completeness uncertainty. Not RED because no false functionality is introduced and the implemented screens are highly accurate.

---

## MODULE 2: 15-OEE

### A. PRD → Prototype Coverage

| PRD Feature | Prototype Present | Notes |
|---|---|---|
| OEE-001 Per-line 24h Trend Dashboard (§10.1) | YES — `OeeLineTrend` | Arc gauges (A/P/Q/OEE), 4-line D3 trend chart, 1h/6h/24h toggle, shift filter, top downtime causes, changeover summary, freshness widget |
| OEE-002 Per-shift Heatmap Dashboard (§10.2) | YES — `OeeHeatmap` | 7×3 shifts grid, color scale red/amber/green (fixed 65/85 per OQ-OEE-07), click-to-drill, selected cell detail, weekly KPI row, run strip |
| OEE-003 Per-day Summary Dashboard (§10.3) | YES — `OeeSummary` | Yesterday default (OQ-OEE-10), Today/Yesterday quick-switch, per-line table with sort, 7-day sparklines, factory KPI cards |
| Six Big Losses view (§4.1 #9, OQ-OEE-06) | YES — tab in `OeeSummary` | Admin-configurable mapping per OQ-OEE-06 decision; mapping editor in `BigLossMappingModal` |
| Changeover analysis P1 basic (§4.1 #8) | YES — `OeeChangeover` screen + `OeeLineTrend` bottom-right card | Changeover duration vs target, allergen risk level, variance badge (OQ-OEE-05 config via 02-SET) |
| Refresh indicator / staleness warning (§4.1 #10) | YES — `Freshness` component | "Last aggregation HH:MM:SS" + stale warning >120s |
| Export CSV/PDF (§4.1 #11) | YES — `ExportModal` (M-02) | Multi-section picker for CSV/PDF; reuses export pattern |
| RLS multi-tenant (§4.1 #12) | N/A for prototype | Architecture concern, not UX-visible |
| OEE Settings / alert thresholds admin (§15.1 `/oee/settings`, `oee_alert_thresholds`) | YES — `OeeSettings` | Per-line threshold editor, tenant default, availability/performance/quality mins |
| Shift Configs admin (§15.1, ADR-030) | YES — `OeeShifts` | Admin-only read-only view of `shift_configs` (P1 fixed 3-shift) |
| Downtime drill-down / annotate (§4.1 #7, OQ-OEE-04) | YES — `AnnotateDowntimeModal` | 1h edit window enforced; supervisor override path; cross-link to 08-PROD |
| Anomaly screens P2 stubs (§15.2, §10.4) | YES — `OeeAnomalies` | P2 placeholder with acknowledgment workflow stub |
| Equipment Health dashboard P2 (§10.4) | YES — `OeeEquipmentHealth` | P2 stub screen with cross-13-MAINT design |
| TV dashboard P2 (D-OEE-4) | YES — `OeeTV` | Full-screen kiosk P2 stub route |
| Pareto Analysis P2 (§4.2 #10) | YES — `OeePareto` | P2 preview with P1 redirect notice + distribution chart |
| A/P/Q deep-dive drill-ins | YES — `OeeAvailability`, `OeePerformance`, `OeeQuality` | Per-component screens with line table + sparklines |
| `AcknowledgeAnomalyModal` (P2, §11 V-OEE-ANOMALY-1) | YES — modal present | Dual-path confirm per anomaly acknowledge |
| Compare weeks (§10.2 heatmap) | YES — `CompareWeeksModal` | Side-by-side two-week picker |
| **Operator annotation edit window enforcement (OQ-OEE-04: 1h post-event)** | YES — in `AnnotateDowntimeModal` | `editWindowClosed` flag + `[Request Edit]` escalation path (`RequestEditModal` M-07) |
| **OEE color scale fixed 65/85 P1 (OQ-OEE-07)** | YES | Color scale legend in heatmap correctly shows 65% / 85% thresholds |
| **P1 target 70% (OQ-OEE-02)** | YES | `SUMMARY_KPIS_TODAY.target = 70` used throughout |
| **Sidebar = OPERATIONS (OQ-OEE-09)** | YES — `OeeNav` in shell | OEE placed under OPERATIONS group |
| **OEE-003 default = yesterday (OQ-OEE-10)** | YES — `OeeSummary` state defaults to "2026-04-20" (yesterday) | Today/Yesterday quick-switch present |
| **Six Big Losses admin-configurable per tenant (OQ-OEE-06)** | YES — `BigLossMappingModal` | Mapping editor implemented |
| **Changeover target from 02-SET `changeover_target_duration_min` (OQ-OEE-05)** | YES | Target shown in changeover summary card; sourced from settings |
| **OEE-003 sidebar = ANALYTICS vs OPERATIONS (OQ-OEE-09)** | YES — OPERATIONS | Correctly placed |
| DSL rule `shift_aggregator_v1` referenced (§7.1) | YES — heatmap footer references `oee_shift_metrics` MV | Architecture annotation present |
| P2 push notifications (OQ-OEE-08: in-app toast + email digest only) | PARTIAL | No push notification UI visible in P1 screens; consistent with P2 deferral |

**Coverage estimate: ~95%** of PRD-specified features are present. The OEE prototype is exceptionally complete, covering all P1 decisions and all 10 OQ resolutions.

---

### B. Prototype → PRD Hallucinations

| Prototype Element | PRD Basis | Classification | Notes |
|---|---|---|---|
| `OeeChangeover` as a separate top-level screen (route "changeover") | PRD §4.1 #8 specifies changeover analysis as a "Should Have" basic view, but no explicit standalone screen is required | **(A) Extrapolation** | PRD §10.1 mentions changeover summary on line trend page; standalone screen is an extension. Low risk. |
| `OeeAvailability`, `OeePerformance`, `OeeQuality` as three separate drill-in screens | PRD mentions "drill-down in A/P/Q components" (§2) but doesn't specify separate routes | **(A) Extrapolation** | Reasonable decomposition of PRD requirement. No functional conflict. |
| `OeeLosses` as a separate screen distinct from Six Big Losses tab in OeeSummary | PRD §4.1 #9 places Six Big Losses as a tab within the summary dashboard | **(C) Minor Drift** | Duplication: Six Big Losses exists both as a summary tab AND a separate screen. Redundant navigation entry. |
| `RunStrip` (last-7-shifts strip) on heatmap row header | Not explicitly specified in PRD §10.2 | **(A) Enhancement** | Adds per-line outcome history strip to heatmap row. Consistent with heatmap drill-down goal. |
| `compareWeeks` modal (CompareWeeksModal) | PRD §10.2 only specifies a week selector (back/forward navigation) | **(A) Extrapolation** | Side-by-side comparison extends beyond PRD scope but aligns with §4.2 #11 (P2 shift comparison advanced). Premature but not harmful. |
| `CellDrillModal` (four-gauge drill + KPI on heatmap cell click) | PRD §10.2 "click cell → drill-down" navigates to per-line 24h trend | **(C) Drift** | PRD says click navigates to line trend route; prototype implements an inline modal drill-in instead. Different interaction pattern than specified. |
| `DeleteOverrideModal` (M-08 — delete per-line threshold override) | PRD §9.4 mentions delete for `oee_alert_thresholds` but no explicit modal | **(A) Extrapolation** | Consistent with §9.4 admin threshold CRUD pattern. |

**No pure (B) hallucinations identified.** Two (C) drifts: `OeeLosses` duplication and `CellDrillModal` interaction pattern divergence.

---

### C. Drift Analysis

| Drift Item | Severity | Detail |
|---|---|---|
| `CellDrillModal` vs navigate-to-line-trend | **MEDIUM** | PRD §10.2: "Click cell → navigate to per-line 24h trend." Prototype implements inline modal (CellDrillModal) with four gauges + "Drill to Line Trend" button as secondary action. This inverts the UX flow: PRD expects direct navigation, prototype adds a modal step. Acceptable for P1 prototype fidelity but diverges from specified interaction. |
| `OeeLosses` screen duplication of Six Big Losses tab | **LOW** | PRD places Six Big Losses in OeeSummary tabs. Prototype has both a tab AND a standalone `OeeLosses` screen. Duplicate navigation path, minor consistency issue. |
| P2 screens scaffolded as routes in P1 app | **INFO** | Pareto, Equipment Health, TV, Anomalies, Forecast routes exist in router. PRD correctly marks these P2. Prototype uses feature-flag-ready pattern — acceptable. |
| No `/oee/benchmark` screen | **INFO** | PRD §15.2 lists industry benchmark as P2; prototype omits it. Consistent with P2 deferral. |
| Freshness widget threshold is 120s | PRD §4.1 #10: "> 120s" staleness warning | **OK** | Correctly implemented. |
| OEE formula shown in gauge cards | PRD §4.3 "OEE calculation in frontend — all calculations backend" | **LOW** | Prototype displays formula strings in gauge cards for transparency. Not actual frontend calculation, just label text. Minor cosmetic concern, not a functional violation. |

---

### D. Fitness Assessment — OEE

| Dimension | Score |
|---|---|
| **Coverage %** | ~95% — all 10 OQ resolutions implemented; all P1 screens present; P2 stubs scaffolded |
| **Hallucination Risk** | LOW — no (B) hallucinations; (A) extrapolations are PRD-aligned |
| **Drift Severity** | LOW — CellDrillModal interaction pattern is the only meaningful UX divergence |
| **Fitness** | **GREEN** |

**Rationale:** The OEE prototype is the strongest of the two modules. Every stakeholder decision from the 2026-04-21 session is reflected. The 70% P1 target, 65/85 fixed color scale, yesterday default, Six Big Losses admin-configurable mapping, 1h annotation edit window, OPERATIONS sidebar placement — all implemented correctly. The single concern worth a code comment is the CellDrillModal interaction pattern (modal vs navigate), which should be reviewed against PRD §10.2 before impl hand-off.

---

## Summary Table

| Module | Coverage | Halluc Risk | Drift Severity | Fitness |
|---|---|---|---|---|
| **04-PLANNING-BASIC** | ~85% | LOW | MEDIUM (Supplier CRUD absent) | **YELLOW** |
| **15-OEE** | ~95% | LOW | LOW (CellDrillModal pattern) | **GREEN** |

---

## Top 3 Findings per Module

### Planning — Top 3
1. **SUPPLIER CRUD SCREENS MISSING** — `SupplierTable`, `SupplierForm`, `SupplierDetail` (PRD §6.1–§6.6, FR-PLAN-001/002/003, Must Have) are entirely absent. Supplier data appears only as inline dropdowns within PO flows. This is the largest coverage gap.
2. **WO DETAIL TABS INCOMPLETE** — PRD §8.10 specifies `WOMaterialsTable`, `WOOperationsTimeline`, `WOOutputsPanel`, `WODependenciesTree`, `WOAvailabilityPanel` as distinct panels. The prototype WO Detail appears to collapse these into fewer tabs; at minimum `WOOutputsPanel` (co-products/byproducts) and `WODependenciesTree` (per-WO DAG) are not confirmed present.
3. **PO BULK IMPORT + TO RECEIVE MODAL ABSENT** — `POBulkImport` (FR-PLAN-006, Should Have) and `ReceiveTOModal` (§7.7 `ReceiveTOModal`) are PRD-specified components not found in the prototype.

### OEE — Top 3
1. **CELLDRILL MODAL VS NAVIGATE PATTERN (DRIFT C)** — PRD §10.2 specifies click-cell → navigate to per-line 24h trend. Prototype implements `CellDrillModal` (inline modal) with navigate as secondary CTA. The PRD interaction contract should be clarified before impl.
2. **OEE-LOSSES SCREEN DUPLICATES SIX BIG LOSSES TAB** — PRD places Six Big Losses as a tab within `OeeSummary`. Prototype adds a separate `OeeLosses` route. Results in two navigation paths to functionally similar content. One should be canonical.
3. **COMPAREWEEEKSMODAL IS PREMATURE P2** — PRD §4.2 #11 (advanced shift comparison) is P2. The `CompareWeeksModal` in the heatmap is a pleasant extrapolation but should be explicitly flagged as P2 scope in the impl backlog to avoid scope creep.

---

## Validation Rules Coverage Check

**Planning:** 37 V-PLAN-xxx rules. Prototype surfaces: V-PLAN-PO-003/004/005/007 (inline in PO Detail/List), V-PLAN-TO-001/002/003/004/005/006 (logic in TO modals), V-PLAN-WO-001/002/005 (WO create guards), V-PLAN-RES-001/003/004 (reservation panel), V-PLAN-SEQ-001/003 (sequencing override). V-PLAN-RES-005 (insert guard for upstream_wo_output) is backend-only, not UX-visible. Overall validation surface coverage: ~60% visible in prototype (as expected — many rules are server-side guards).

**OEE:** 20 V-OEE-xxx rules. V-OEE-ACCESS-1/2/3 (auth/role gates), V-OEE-DATA-3 (shift_id mismatch alert visible), V-OEE-SHIFT-1/2/3 (shift configs admin), V-OEE-AGG-3 (empty shift no row), V-OEE-ANOMALY-2 (auto-resolve 15min shown in anomaly card). Backend rules (V-OEE-DATA-1/2/5, V-OEE-AGG-1/4/5) not UX-visible — correct.

---

*Audit output generated by Audit-2 agent. Read-only. No prototype files modified.*

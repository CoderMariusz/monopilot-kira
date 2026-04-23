# Audit: Tune-6b — Reporting (12) + Multi-Site (14)

**Auditor:** Audit-6b (read-only agent)
**Date:** 2026-04-23
**Sources:** PRD v3.0 (12 + 14), UX v1.0 (12 + 14), prototype JSX/CSS in `design/Monopilot Design System/reporting/` + `multi-site/`
**Base path:** `C:/Users/MaKrawczyk/PLD/_tune-dispatch/tune-6b-reporting-multisite/`

---

## MODULE 12 — REPORTING

### A. Coverage

All 10 P1 dashboards are implemented as named React components and routed in `app.jsx`:

| Dashboard | Component | Status |
|---|---|---|
| RPT-HOME Catalog | `RptHome` / `RptP2Placeholder` | Present |
| RPT-001 Factory Overview | `RptFactoryOverview` | Present |
| RPT-002 Yield by Line | `RptYieldByLine` | Present |
| RPT-003 Yield by SKU | `RptYieldBySku` | Present |
| RPT-004 QC Holds | `RptQcHolds` | Present |
| RPT-005 OEE Summary | `RptOeeSummary` | Present |
| RPT-006 Inventory Aging | `RptInventoryAging` | Present |
| RPT-007 WO Status | `RptWoStatus` | Present |
| RPT-008 Shipment OTD | `RptShipmentOtd` | Present |
| RPT-009 Integration Health | `RptIntegrationHealth` | Present (admin gate) |
| RPT-010 Rules Usage Analytics | `RptRulesUsage` | Present (admin gate) |

P2 placeholders: Catalog cards route to `p2_placeholder:<catalog-id>` which renders `RptP2Placeholder` with `EmptyState` per BL-RPT-01. P2 modal also wires to `reporting.v2_dashboards` feature flag name. Both aligned with PRD §4.2 and UX §3 requirements.

**Support screens:** `RptExportHistory` and `RptSavedFilters` present in `other-screens.jsx` + routed. `RptScheduledReports` present as P2 placeholder. Matches PRD §15.2.

**Export modals:** `ExportReportModal`, `SavePresetModal`, `ScheduleReportModal` (P2), `ShareReportModal` all present in `modals.jsx`. Export modal handles PDF / CSV / XLSX(P2) / Copy format selector — aligned with PRD §4.1 M12-EX.

**Modals coverage (from modal gallery):** 8 modal types documented — complete for P1 scope.

**Coverage fitness:** GREEN — all P1 screens, support screens, modals, and P2 stubs implemented.

---

### B. Hallucinations

| ID | Location | Description | Classification |
|---|---|---|---|
| B-RPT-01 | `catalog-screens.jsx` DrillCrumb trail for RPT-002 | Breadcrumb shows `Factory Overview → Yield by Line`. PRD §8.1 flow and UX RPT-002 spec both say the route is direct from Reporting home OR from Factory Overview drill. The prototype routes breadcrumb through `factory_overview` key even when navigated directly from catalog (home → yield-by-line). A user arriving at RPT-002 from the sidebar sub-nav would see a misleading breadcrumb. | MINOR HALLUCINATION — cosmetic, breadcrumb trail hardcoded rather than driven by navigation history |
| B-RPT-02 | `catalog-screens.jsx` RPT-001 `buildKpiRunCells` | Function derives 8-period tones from KPI delta field. The derivation is: positive delta = green, negative = red, ±0 = ok. For **Giveaway %** this logic is inverted — a **lower** GA% is favorable. The current helper does not know which KPIs are "lower is better" vs "higher is better". Result: GA% run strip could show red cells when GA% improved. | SEMANTIC BUG — logic inversion on inverted-polarity KPIs (GA%, downtime, late shipments) |
| B-RPT-03 | `admin-screens.jsx` RPT-010 Rules Usage — expanded rule row | When a rule row is expanded, the prototype renders "Avg eval latency" and "trigger rate" but also adds a field "False-positive rate" with a numeric value. This field does not appear anywhere in PRD §4.1 dashboard #10 KPIs, `mv_rules_usage` column spec (PRD §9.1), or UX RPT-010 spec. | HALLUCINATION — invented KPI not in PRD/UX spec |
| B-RPT-04 | `other-screens.jsx` `RptSavedFilters` | The saved filters screen exposes a "Share with team" toggle per preset. PRD §15.2 describes `/reporting/saved-views` as "P1 simple: saved filter presets per user (lightweight)". The UX spec §2.4 permissions matrix does not include a sharing action. `custom_reports.is_shared` exists only in the P2 `custom_reports` table (PRD §9.3), not in filter presets. Sharing filter presets is a P2+ concept retroactively applied to a P1 screen. | SCOPE CREEP / HALLUCINATION — P2 feature surfaced in P1 screen |

---

### C. Drift

| ID | Area | PRD/UX Spec | Prototype | Assessment |
|---|---|---|---|---|
| D-RPT-01 | Catalog model — P2 route behavior | UX RPT-HOME: "Clicking a P2 card shows a toast 'This dashboard is coming in Phase 2.'" PRD §15.1 says P2 cards have overlay pill. | Prototype routes to `p2_placeholder:<id>` full screen with EmptyState instead of a toast. | INTENTIONAL ENHANCEMENT — prototype goes beyond toast to a full EmptyState screen with CTA back to catalog, which is richer than the toast-only UX spec. Tuning plan §2.12.2 / BL-RPT-01 explicitly calls for this upgrade. **No action required.** |
| D-RPT-02 | KPI card color tokens | PRD §13.2: `KPI positive green = green-600 (#16A34A)`, UX §1.3: `KPI positive = --green = #22c55e`. PRD and UX disagree (PRD uses green-600, UX uses green-500). | Prototype uses `--green` (`#22c55e`) — aligned with UX, NOT with PRD §13.2. | MINOR DRIFT — color token mismatch between PRD (green-600) and UX (green-500/`--green`). Prototype follows UX. PRD should be updated to canonical `--green`. Low visual impact. |
| D-RPT-03 | Catalog model — `dashboards_catalog` metadata-driven | PRD §9.3 specifies `dashboards_catalog` table with `metadata_schema JSONB` as the P2 Custom Report Builder foundation. PRD Strategic Decision #6 calls the entire catalog metadata-driven. UX RPT-HOME says catalog is seeded. | Prototype uses `RPT_CATALOG` static array in `data.jsx` with `phase`, `key`, `name`, `domain` fields. Catalog footer in `dashboard.jsx` reads "Catalog sourced from `dashboards_catalog` — metadata-driven per Strategic Decision #6" — annotation present but not implemented in data layer. | ANNOTATION VS IMPLEMENTATION drift — static data correctly annotated as backend-driven, which is acceptable for prototype. However `metadata_schema` column and `enabled_for_tenants[]` allowlist from PRD §9.3 are absent from mock data. These are backend concerns but could create false impression in handoff. |
| D-RPT-04 | Export modal — `sha256_hash` audit field | PRD §9.2 `report_exports` requires `sha256_hash NOT NULL GENERATED`. V-RPT-EXPORT-2 enforces this. PRD §4.1 M12-EX mentions this as a 21 CFR Part 11 readiness item. | Export modal in `modals.jsx` shows user-facing fields (format, date range) but nothing surfaces the sha256/retention metadata — appropriate since it's backend-generated. However the Export History screen (`RptExportHistory`) shows no `sha256_hash` column or "download fingerprint" affordance. | MINOR GAP — audit trail completeness: the Export History table in `other-screens.jsx` should show at least the `sha256_hash` (truncated) or a "Verified" badge per PRD §14.1 BRCGS intent. Currently not present. |
| D-RPT-05 | OEE Summary dependency strip | UX RPT-005: "A thin `.alert-blue` banner immediately below the filter bar: 'OEE data is owned by the 15-OEE module…'" | Prototype renders `.alert-blue alert-box` with identical copy and "Open 15-OEE →" button. | ALIGNED — no drift. |
| D-RPT-06 | OEE unavailable state | UX RPT-005: "replace the entire main area with a centered illustration and message" | Prototype renders `ChartGroupedBar` with full data even without an unavailable state toggle. No unavailable state is conditionally shown in the prototype — no `oeeUnavailable` prop or flag. | MISSING STATE — OEE unavailable state not implemented in `kpi-screens.jsx` RPT-005. PRD D-RPT-9 requires graceful degradation placeholder. |

---

### D. Fitness

**P1 catalog completeness:** 10/10 dashboards + 2 support screens + P2 stubs. GREEN.
**Tuning targets met (per TUNING-PLAN §2.12):**
- RunStrip on every KPI card: DONE (present in all screens via `buildKpiRunCells`)
- P2 placeholder EmptyState (BL-RPT-01): DONE (full screen with CTA)
- tabular-nums: DONE (`.kpi-value` in `reporting.css` + global token in `colors_and_type.css`)

**Fitness: AMBER** — 10/10 P1 screens delivered, 3 Tuning targets met, but 2 hallucinations need fixing (B-RPT-02 polarity inversion, B-RPT-03 invented metric), 1 scope creep item to review (B-RPT-04 filter preset sharing), 1 missing state (D-RPT-06 OEE unavailable), and a minor sha256 audit trail gap (D-RPT-04).

---

## MODULE 14 — MULTI-SITE

### A. Coverage

All 4 P1 dashboards routed and implemented:

| Screen | Component | Status |
|---|---|---|
| MS-NET Network Dashboard | `MsDashboard` | Present |
| MS-SIT Sites List | `MsSitesList` | Present |
| MS-SIT-D Site Detail (8 tabs) | `MsSiteDetail` | Present with all 8 tabs |
| MS-IST Transfers List | `MsISTList` | Present |
| MS-IST-D Transfer Detail | `MsISTDetail` | Present |
| MS-IST-N Transfer Create | `MsISTCreate` | Present |
| MS-MDS Master Data Sync | `MsMasterDataSync` | Present |
| MS-LANE Transport Lanes List | `MsLanesList` | Present |
| MS-LANE-D Transport Lane Detail | `MsLaneDetail` | Present |
| MS-REP Replication Queue | `MsReplicationQueue` | Present |
| MS-PRM Permissions Matrix | `MsPermissions` | Present |
| MS-ANA Multi-Site Analytics | `MsAnalytics` | Present |
| MS-CFG Settings | `MsSettings` | Present |
| MS-ACT Activation Wizard | `MsActivation` | Present |

**Global Site Selector:** `MsSiteSwitcher` present in `shell.jsx` — 4 site options (ALL / SITE-A FRZ-UK / SITE-B FRZ-DE / SITE-WH-01 WH-COLD) with `localStorage mp_site_context` persistence, checkmark on active, "Manage Sites →" footer. Full spec from UX §1.5 satisfied.

**Sidebar count badge (Tune-6b §2.14.3):** `MsSidebar` in `shell.jsx` dynamically counts `MS_SITES` for `onlineState === "degraded" || online === false`, renders `.sidebar-count-badge` — CSS present in `multi-site.css`. Aligned with TUNING-PLAN target.

**GHA auto-expand (Tune-6b §2.14.2):** `IST_STATUS_DEFAULT_OPEN = { in_transit: true, cancelled: true, shipped: true }` in `ist-screens.jsx`, `groupOpen` state with toggle per group. Implemented correctly; UX spec only called for failed/running — prototype extends to `shipped` group as well (minor positive extension).

**Lane RunStrip (Tune-6b §2.14.1):** `RunStrip` + `buildLaneRunCells(l)` wired in transport lanes table. `laneHealthToTone()` maps health state to tone. Fully implemented.

**IST state machine progress bar:** `MsISTDetail` shows `draft → planned → shipped → in_transit → received → closed` circle progress bar with cancelled branch. Matches UX MS-IST-D spec exactly.

**Activation wizard state machine:** 4 states `inactive | wizard | dual_run | activated` rendered via `ActState`. Wizard screen in `admin-screens.jsx`. Rollback from `dual_run` modal present. Aligned with D-MS-14.

**P6 dashboards not in scope** (MS-005..010 are P2) — correct per PRD §10.2.

**Coverage fitness:** GREEN — all 14 P1 screens implemented.

---

### B. Hallucinations

| ID | Location | Description | Classification |
|---|---|---|---|
| B-MS-01 | `ist-screens.jsx` IST_STATUS_DEFAULT_OPEN | Adds `shipped: true` to auto-expand defaults. TUNING-PLAN §2.14.2 specifies "failed/running auto-expanded" and UX spec §MS-IST says `in_transit` rows get the animated amber border — shipped is a reasonable addition but is not in any spec. | MINOR ADDITION — low risk, positive UX enhancement beyond spec |
| B-MS-02 | `admin-screens.jsx` `MsAnalytics` | Analytics screen shows a widget titled "Inter-site Transfer Volume (30d)" with a bar chart. Neither the PRD (§10 — 4 P1 dashboards: MS-001..004) nor the UX spec §MS-ANA spec describes any chart types or KPIs for the Analytics screen. The screen is present in the route map but has no PRD specification. The prototype has invented content for this entirely unspecified screen. | HALLUCINATION BY ABSENCE — analytics screen content is entirely invented; the screen ID (MS-ANA) exists in the route map but has no PRD/UX content spec. This is a genuine gap, not wrong per se, but the invented content becomes the de-facto spec during handoff. |
| B-MS-03 | `modals.jsx` `MsISTReceiveModal` | GRN completion modal shows a "Temperature on Arrival (°C)" field for the received goods. This field does not appear in PRD §9.6 `transfer_orders` column additions, UX MS-IST-D spec, or V-MS-11 validation rules. The field implies cold-chain compliance tracking not specified anywhere in 14-MULTI-SITE-PRD. | HALLUCINATION — invented field with compliance implications; cold-chain temperature on receipt is a domain-significant addition that should be explicitly specified if required |
| B-MS-04 | `sites-screens.jsx` Site Detail Tab 8 "Docs" | The site detail screen has a "Docs" tab (Tab 8) with file upload (PDF, DOCX, XLSX, PNG, JPG, max 50MB). This exactly matches UX MS-SIT-D Tab 8 spec — **correctly implemented**, no hallucination. | ALIGNED |

---

### C. Drift

| ID | Area | PRD/UX Spec | Prototype | Assessment |
|---|---|---|---|---|
| D-MS-01 | Site switcher — IST replication flow labeling | PRD §12.3 names the 3 outbox events: `transfer_order.shipped`, `transfer_order.in_transit`, `transfer_order.received`. D-MS-12 says they emit to `warehouse_outbox_events` with `event_type='inter_site_transfer'` tag. UX §MS-IST-D says the state bar shows `draft → planned → shipped → in_transit → received → closed`. | Prototype state bar in `ist-screens.jsx` labels the in_transit state as "In Transit" (two words, title case). D-MS-3 state machine in PRD uses `in_transit` (snake_case). UX §1.3 badge palette uses "IST: In Transit" (title case). | ALIGNED with UX. No issue. |
| D-MS-02 | Lane health model — 3-state definition | UX §1.3 badge palette defines: `lane-health.active` = "has recent successful TOs", `lane-health.stale` = "no TO in >30 days", `lane-health.failed` = "last TO had logistics failure". PRD does not define lane health explicitly — transport lanes are in the scope of 14-b sub-module but no PRD lane table spec. | Prototype `LaneHealth` in `shell.jsx` implements exactly the 3 states from UX spec. `buildLaneRunCells` uses IST history on the lane. Lane data in `data.jsx` uses `health: "active" | "stale" | "failed"`. | ALIGNED with UX spec. HOWEVER: the lane health "stale" threshold (>30 days) is present in UX badge tooltip but not enforced in mock data derivation — `buildLaneRunCells` derives tone from IST outcomes, not from date comparison. Minor implementation gap. |
| D-MS-03 | IST replication flow — inbound GRN auto-creation | PRD §MS-IST-N (UX spec) and PRD D-MS-3: on IST creation, "auto-generates a linked outbound shipping record… and an inbound GRN placeholder at the to-site." | Prototype create form action button shows toast "Transfer IST-[n] created. Pending approval…" — no explicit mention of GRN placeholder auto-creation or outbound shipping record in the toast or any UI confirmation. | MINOR GAP — PRD-specified auto-creation side effects not surfaced in UI confirmation feedback. The user has no visual confirmation that a GRN placeholder was created at the to-site. |
| D-MS-04 | Sidebar badge — `wizard_in_progress` state | UX §2.1: "When the multi-site module is in `inactive` state, the sidebar entry is hidden for non-admins. For admin users, it shows with `badge-amber 'Setup'` badge, linking directly to activation wizard." | `MsSidebar` in `shell.jsx` renders the degraded-sites count badge when `degraded > 0`. It does NOT render a "Setup" badge when `activationState === 'inactive'` or `'wizard_in_progress'`. This is a separate badge concern from the degraded-count badge — both should coexist. | DRIFT — sidebar badge covers degraded-sites count (Tuning gap §2.14.3) but misses the activation-state badge (UX §2.1). The two badge types address different concerns. |
| D-MS-05 | Permissions matrix — `ops_director` role | PRD §4 personas includes `ops_director`. UX §2.3 permissions matrix column has `ops_director`. | `MsPermissions` screen in `admin-screens.jsx` renders a site-by-user matrix. The note at top says "super_admin or ops_director automatically have cross-site read access." However the permissions matrix table columns are `admin, site_manager, planner, warehouse_op, auditor` — `ops_director` column is missing from the visible matrix. | DRIFT — `ops_director` role present in PRD/UX permissions matrix but absent from prototype permissions matrix table columns. |

---

### D. Fitness

**P1 screen completeness:** 14/14 screens. GREEN.
**Tuning targets met (per TUNING-PLAN §2.14):**
- RunStrip on lane health rows: DONE
- GHA auto-expand on IST: DONE (+ extended to `shipped` group)
- Sidebar count badge "degraded sites": DONE

**Notable strengths:**
- Site switcher is the most faithfully implemented signature pattern — spec compliance very high
- IST detail state machine progress bar exactly matches spec
- Activation wizard 4-state machine (`inactive → wizard → dual_run → activated`) correctly modeled
- Conflict resolution diff modal in `modals.jsx` is sophisticated (field-level diff with accept/reject per field)

**Fitness: AMBER** — All P1 screens delivered, 3 Tuning targets met, but 2 hallucinations need review (B-MS-02 invented analytics content, B-MS-03 temperature field), 2 drift items need fixing (D-MS-04 activation badge, D-MS-05 ops_director column), and 1 minor GRN confirmation gap (D-MS-03).

---

## Summary Matrix

| Module | Coverage | Hallucinations | Drift | Fitness |
|---|---|---|---|---|
| 12-REPORTING | GREEN (10/10 P1) | 4 issues (2 major: B-RPT-02 polarity, B-RPT-03 invented metric) | 6 drift items (1 missing state, 1 sha256 gap) | AMBER |
| 14-MULTI-SITE | GREEN (14/14 P1) | 4 issues (1 major: B-MS-02 invented analytics, 1 compliance-risk: B-MS-03 temperature field) | 5 drift items (2 fixable: D-MS-04, D-MS-05) | AMBER |

---

## Top 3 Issues Per Module

### Reporting — Priority Issues

1. **B-RPT-02** (`catalog-screens.jsx` `buildKpiRunCells`) — `RunStrip` polarity inversion on "lower is better" KPIs (GA%, downtime, late shipments). Fix: add `invertedPolarity: true` flag per KPI data entry; negate delta before tone derivation.
2. **B-RPT-03** (`admin-screens.jsx` Rules Usage expanded row) — Invented "False-positive rate" metric not in PRD/UX. Remove or move to OQ-RPT backlog.
3. **D-RPT-06** (`kpi-screens.jsx` RPT-005 OEE Summary) — OEE unavailable state not implemented. PRD D-RPT-9 explicitly requires graceful degradation when `oee_daily_summary` MV is absent. Fix: add `oeeAvailable` prop/flag; render unavailable EmptyState when false.

### Multi-Site — Priority Issues

1. **B-MS-02** (`admin-screens.jsx` `MsAnalytics`) — Analytics screen entirely unspecified in PRD/UX; prototype has invented all content. This invented content risks becoming the de-facto handoff spec. Recommend: add an `EmptyState` "Analytics dashboard coming in Phase 2" or formally add MS-ANA spec to PRD before handoff.
2. **B-MS-03** (`modals.jsx` `MsISTReceiveModal`) — Invented "Temperature on Arrival (°C)" field implies cold-chain compliance tracking not in any PRD. Remove unless explicitly added to PRD V-MS-11+ validation rules and `transfer_orders` schema extension.
3. **D-MS-04** (`shell.jsx` `MsSidebar`) — Activation state badge (`badge-amber "Setup"` for inactive/wizard states) absent. Sidebar badge covers only degraded-site count (Tuning §2.14.3) but misses the spec-required activation-state badge (UX §2.1).

---

_Audit-6b · READ-ONLY · 2026-04-23_

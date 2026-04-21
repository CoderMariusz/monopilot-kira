# Design System — prototype backlog

Design decisions deferred from the audit (2026-04-21). Items here are NOT blockers for current work but should be revisited before freeze.

---

## Q2 · Planning — upgrade Cascade DAG to true graph with SVG edges

**Current state:** `planning/cascade.jsx` renders cascade chains as a vertical layered list. Each layer shows its WOs, and a `↓` separator between layers indicates "this layer feeds the next." Chains are grouped by root FA.

**Gap vs spec (§SCREEN-09 of 04-PLANNING-BASIC-UX.md):** The spec calls for a directed acyclic graph with explicit SVG arrows from each parent WO node to each child WO node, with edge labels showing `{required_qty} {uom}` and a `→ to_stock` disposition badge on every edge. Cycles should render a red `CYCLE DETECTED` node with arrows highlighting the cycle participants. Edge thickness should scale with `required_qty`.

**Why deferred:** Layered list is readable for typical 2–3 layer chains (current mock data) and renders without layout computation. A true DAG needs Sugiyama or dagre-style layering + SVG path drawing. Low ROI for prototype review.

**When to do it:** Before real-code implementation (the React product will use `react-flow` or `dagre-d3`). Or if a reviewer asks specifically about branching (>2 parents per node) — mock data has no branching yet.

**Effort estimate:** 1 day with `react-flow` dependency. Without a library, 2 days rolling your own SVG edge routing.

**Owner:** TBD

---

## Q5 · Settings — add 10 cross-module screens

**Current state:** `settings/` prototype has ~18 of ~48 spec'd screens. Basic profile, sites, warehouses, shifts, products, BOMs, partners, units, users, security, devices, notifications, features, integrations, labels, audit, my-profile are present.

**Gap:** Cross-module dependencies for Scanner + Warehouse + D365 integration are missing. Specifically:

1. **SET-040 D365 connection config** — endpoint, auth, polling interval (blocks SCREEN-13 D365 Queue end-to-end)
2. **SET-041 D365 field mapping** — maps D365 product/supplier fields to MonoPilot (referenced by every D365-enabled screen)
3. **SET-050 Rules registry browser** — read-only view of `wo_state_machine_v1`, `cascade_generation_v1`, `allergen_sequencing_heuristic_v1` rules (referenced by Planning, Production, Quality)
4. **SET-051 Rule detail** — DSL source view, dry-run trigger (referenced by MODAL-14)
5. **SET-060 Feature flags admin** — toggle per-tenant flags (blocks `integration.d365.so_trigger.enabled` runtime change)
6. **SET-070 Schema browser** — table/column inspector (used by admins during incident triage)
7. **SET-080 Reference data** — allergen families, UoM, currency codes, country ISO
8. **SET-090 Email templates** — PO-to-supplier, approval-request, overdue-reminder (blocks Shipping + Planning notifications demo)
9. **SET-091 Email template variables** — merge-field picker
10. **SET-100 L1→L2 promotion** — multi-env promote workflow for rules/flags/templates

**Why deferred:** Not a Tier 1 blocker; Planning/Warehouse/Scanner demos can use seeded data without admin UI.

**When to do it:** After Tier 1 (Warehouse, Scanner) is complete and before Tier 2 (Shipping, Finance) starts.

**Effort estimate:** 1 session using the existing settings/ patterns.

**Owner:** TBD

---

---

## Planning — warehouse → site taxonomy (enables V-PLAN-TO-002)

**Current state:** TOCreateModal (MODAL-05) checks From/To warehouses but has no "site" concept — spec V-PLAN-TO-002 says `from_warehouse.site == to_warehouse.site` (TOs are intra-site only). The prototype currently treats the constraint as advisory (warning, not block) because no canonical warehouse → site map exists in mock data.

**Fix:** Add a `sites` lookup table in `data.jsx` mapping each warehouse to a site (e.g., `WH-Factory-A → SITE-A`, `WH-DistCentral → SITE-A`, `WH-Factory-B → SITE-B`). Then TOCreateModal can block at save when From.site ≠ To.site.

**Owner:** TBD. Related to 02-SETTINGS site management (SET-012 Sites).

---

---

## Scanner (06) — prototype follow-ups (BL-SCN-01..08)

Discovered during the scanner prototype build. All are scanner-internal TODOs, not blockers for the current prototype.

| ID | Item | Priority |
|---|---|---|
| BL-SCN-01 | Build `_shared/ScannerModal.jsx` bottom-sheet primitive (refactor from current CSS-override approach; needed when a 2nd mobile module arrives) | Medium |
| BL-SCN-02 | Real camera viewfinder — `.sc-camera` placeholder exists; zxing integration deferred to P2 | P2 |
| BL-SCN-03 | Offline queue screen (SCN-090) — only sync-badge states implemented | Medium |
| BL-SCN-04 | PIN setup/change flows (SCN-011b/c) — only 6-digit entry done, not setup wizard | Low |
| BL-SCN-05 | Session idle-timeout 30s warning sheet (SCN-015) not wired | Low |
| BL-SCN-06 | Kiosk 3s countdown chip — class exists in CSS, not activated on done screens | Low |
| BL-SCN-07 | Language apply — picker functional but i18n re-render not implemented (strings hard-coded Polish) | Medium |
| BL-SCN-08 | Site-select stored-context pre-fill (spec §3.5) | Low |

---

---

## Warehouse (05) — prototype follow-ups (BL-WH-01..06)

Discovered during the warehouse prototype build. Internal TODOs, not blockers for the current prototype.

| ID | Item | Priority |
|---|---|---|
| BL-WH-01 | Full cycle count workflow (M-14 is P1 stub — count plan, task assignment, reconciliation) | Medium |
| BL-WH-02 | Warehouse Settings → Locations tab + Integrations tab (currently `<ScaffoldedScreen/>` placeholders; full CRUD on main Locations screen, integrations admin lives in 02-Settings) | Low |
| BL-WH-03 | GS1-128 scanner parser — referenced via tags but real parsing is 06-Scanner scope | P2 |
| BL-WH-04 | Label ZPL render — preview is HTML-structured, not real ZPL/EPL rendering | Medium |
| BL-WH-05 | Inventory "By Location" full ltree `@>` hierarchical browser (currently flat L2 table) | Low |
| BL-WH-06 | `ext_jsonb` schema extensions editor on LP detail (currently read-only list) | Low |

---

---

## OEE (15) — prototype follow-ups (BL-OEE-01..09)

| ID | Item | Priority |
|---|---|---|
| BL-OEE-01 | Incremental chart append via `?since=last_ts` — currently only toggle refresh | Medium |
| BL-OEE-02 | Sort by shift column in heatmap (spec §OEE-002 interaction) | Low |
| BL-OEE-03 | Color-blind mode (spec §OQ-OEE-08) — dashed/dotted lines for P/Q | Low |
| BL-OEE-04 | Arrow-key nav on heatmap cells (`role="gridcell"` present, keyboard traversal not wired) | Low |
| BL-OEE-05 | Compare-weeks diff view (M-10) — modal shows preview only, no live diff | Medium |
| BL-OEE-06 | TV OS kiosk (OQ-OEE-03 open question) — decision pending | P2 |
| BL-OEE-07 | Audit log viewer for category overrides (admin) | Low |
| BL-OEE-08 | localStorage persistence for last-viewed date on OEE-003 | Low |
| BL-OEE-09 | Recharts dependency consideration vs inline SVG — currently zero-dep SVG | Low |

---

---

## Reporting (12) — prototype follow-ups (BL-RPT-01..10)

| ID | Item | Priority |
|---|---|---|
| BL-RPT-01 | Plumb P2 placeholder routes for P2 catalog cards (RPT-P2-001..013); currently click shows toast | Low |
| BL-RPT-02 | Replace hand-rolled SVG charts with D3-shape + d3-scale in real build | P2 |
| BL-RPT-03 | Onboarding/fresh-install zero-state variants per §6 — KPIs show "—" + helper card | Medium |
| BL-RPT-04 | `@media print` stylesheet for Puppeteer edge-function PDF export (§8) | Medium |
| BL-RPT-05 | Responsive breakpoints — tablet/mobile reflows (currently desktop-first only) | Low |
| BL-RPT-06 | Heatmap chart (P2 ShiftPerformance) — `.heat-cell` CSS exists, no dedicated screen | P2 |
| BL-RPT-07 | Lot Genealogy FSMA tree (RPT-P2-008) | P2 |
| BL-RPT-08 | Custom DSL builder behind `reporting.custom_dsl_builder` flag (open question §11.2) | P2 |
| BL-RPT-09 | Drag-and-drop KPI tile editor (ADR-031 L2, OQ §11.10) | Low |
| BL-RPT-10 | Row-level security scope pill placement — per-KPI-card vs header (OQ §11.3) | Low |

---

---

## Multi-Site (14) — prototype follow-ups (BL-MS-01..07)

| ID | Item | Priority |
|---|---|---|
| BL-MS-01 | Map View (MS-NET) — library choice deferred (spec §9.1); currently placeholder stub | Medium |
| BL-MS-02 | E-signature gate on conflict resolve (spec §9.2) — optional block rendered, not wired | Medium |
| BL-MS-03 | Timezone toggle live state — toggle in Settings §4 wired, not applied to timestamp rendering | Low |
| BL-MS-04 | Mobile accordion for IST tabs (&lt;768px) — currently horizontal scroll; spec §8 requires accordion | Low |
| BL-MS-05 | Real chart rendering in Analytics + Lane History (CSS-only placeholders per spec §9.7 guidance) | Medium |
| BL-MS-06 | Site heartbeat simulator — "degraded" state is static mock on SITE-OFF; real pinger out of scope | P2 |
| BL-MS-07 | Hierarchy depth migration wizard (spec §9.6) — MODAL-HIERARCHY-EDIT left as stub | Low |

---

---

## Quality (09) — prototype follow-ups (BL-QA-01..07)

| ID | Item | Priority |
|---|---|---|
| BL-QA-01 | Full CAPA workflow (P2 Epic 8G) — NCR detail shows placeholder card only | P2 |
| BL-QA-02 | Batch Release gate (QA-010) — P2 placeholder screen | P2 |
| BL-QA-03 | CoA templates + generation (QA-011/012) — P2 placeholder | P2 |
| BL-QA-04 | In-process / Final inspection screens — P2 placeholders with blurred mock tables | P2 |
| BL-QA-05 | Full 9-step first-login onboarding overlay (spec §6.3) | Low |
| BL-QA-06 | Virtual-keypad PIN anti-keylogger (OQ#8) — currently plain masked input | Medium |
| BL-QA-07 | Real-time spec search autocomplete for hold-create picker | Low |

---

---

## Shipping (11) — prototype follow-ups (BL-SHIP-01..14)

| ID | Item | Priority |
|---|---|---|
| BL-SHIP-01 | SHIP-028 POD upload modal separate from BOL sign-off (consignee vs carrier-driver) | Medium |
| BL-SHIP-02 | Allergen conflict SO wizard — override-inline path collapse when shipping_qa active | Low |
| BL-SHIP-03 | Wave edit modal — unreleased column has Edit stub button without modal backing | Medium |
| BL-SHIP-04 | RMA Detail screen (SHIP-027) 4-tab (Lines / Receiving / QA Disposition / History) | Medium |
| BL-SHIP-05 | Carrier rate quote modal (P2 stub) | P2 |
| BL-SHIP-06 | Credit limit override modal (P2 stub) | P2 |
| BL-SHIP-07 | Bulk SSCC reprint modal — current M-16 is single-label; spec mentions bulk ZPL job | Low |
| BL-SHIP-08 | Address modal — V-SHIP-SO-02 enforced on SO confirm but not on Customer Detail address list | Low |
| BL-SHIP-09 | Pricing tab (SHIP-002) currently ScaffoldedScreen — need P2 pricing agreements when Finance P2 lands | P2 |
| BL-SHIP-10 | D365 DLQ inline drilldown on dashboard — link exists but no preview of failed event | Low |
| BL-SHIP-11 | Global topbar search static — index customers/SOs/shipments/SSCCs | Low |
| BL-SHIP-12 | Multi-language packing slip (V-SHIP-LBL-05, P2) — dropdown disabled | P2 |
| BL-SHIP-13 | HAZMAT + EUDR flag UIs (P2 EPIC 11-H) — shown disabled | P2 |
| BL-SHIP-14 | Shipment confirm — partial auto-retry UI has retry cadence but no DLQ kick button | Low |

---

---

## Finance (10) — prototype follow-ups (BL-FIN-01..08)

| ID | Item | Priority |
|---|---|---|
| BL-FIN-01 | Full MPV/MQV decomposition (FIN-007/008) — P1 shows totals only; sub-components P2 EPIC 10-I | P2 |
| BL-FIN-02 | Real-time variance tiles (FIN-009) — scaffolded placeholder | P2 |
| BL-FIN-03 | BOM cost rollup (FIN-004) — scaffolded, links to 03-Technical BOM | Medium |
| BL-FIN-04 | Margin analysis (FIN-013) — needs Sales module + sell-price data | P2 |
| BL-FIN-05 | Budget &amp; forecast (FIN-014/015, EPIC 10-F) — scaffolded | P2 |
| BL-FIN-06 | BOM cost simulation / scenarios (FIN-012) | Medium |
| BL-FIN-07 | Dual sign-off for &gt;20% cost change (mentioned in MODAL-01 warning) | Medium |
| BL-FIN-08 | Complaint cost allocation, AR/AP bridge, landed cost variance (P2 scope) | P2 |

---

---

## Maintenance (13) — prototype follow-ups (BL-MAINT-01..07)

| ID | Item | Priority |
|---|---|---|
| BL-MAINT-01 | IoT sensors tab on Asset Detail — placeholder only (P2 OQ-MNT-02); needs time-series chart | P2 |
| BL-MAINT-02 | LOTO photo evidence — "Recommended" currently; await Forza safety sign-off to gate as Required (§9 Q3) | Medium |
| BL-MAINT-03 | Offline tablet mode — no Service Worker / IndexedDB (§9 Q4) | P2 |
| BL-MAINT-04 | Two-person LOTO remote confirmation flow — prototype assumes separate sessions (§9 Q5) | Medium |
| BL-MAINT-05 | Skills Matrix PDF export w/ attached cert scans — button stub only (§9 Q8) | Low |
| BL-MAINT-06 | OEE auto-PM trigger settings toggle — rendered disabled (P2) | P2 |
| BL-MAINT-07 | Purchase Request in Spare Reorder modal — internal notification only; P2 integration with 04-Planning PO | Medium |

---

---

## Planning-Ext (07) — prototype follow-ups (BL-PEXT-01..09)

| ID | Item | Priority |
|---|---|---|
| BL-PEXT-01 | Full Prophet chart integration with confidence bands + SMAPE per-product drill-down | P2 |
| BL-PEXT-02 | What-if simulation real solver hook-up (currently preset-driven + canned deltas) | P2 |
| BL-PEXT-03 | Disposition bridge wiring to notification tray + reminder-after-15min loop | P2 |
| BL-PEXT-04 | 14-day horizon UI enablement (flag `scheduler.horizon_14d.enabled`) | P2 |
| BL-PEXT-05 | Hour-level Gantt zoom — toggles state but doesn't re-render finer grid | Medium |
| BL-PEXT-06 | Matrix JSON viewer modal ("View Full Snapshot JSON") — placeholder link | Low |
| BL-PEXT-07 | Audit dashboard aggregation (§11.2) consumed by Settings, not visualized here | Low |
| BL-PEXT-08 | Undo-approval 60s window — visual-only, no timer countdown | Low |
| BL-PEXT-09 | Version diff modal — sample rows, not real diff vs historical | Medium |

---

---

## Production (08) — prototype follow-ups (BL-PROD-01..05)

Added during the 2026-04-21 gap-fill pass.

| ID | Item | Priority |
|---|---|---|
| BL-PROD-01 | LineDetail today-output table static — real impl should pull from Warehouse LP registry filtered by line + date | Medium |
| BL-PROD-02 | Waste analytics hard-codes rolling%/totals — needs rolling-14d window query from event store | Medium |
| BL-PROD-03 | Shift Start modal assumes single plant (Factory-A) — multi-plant operators need plant picker | Low |
| BL-PROD-04 | OEE target edit stores in memory — needs `prod_oee_targets` table with effective-date window for historic comparison | Medium |
| BL-PROD-05 | `.btn-danger` referenced in MODAL-SCHEMA but missing from production.css — destructive confirms fall back to primary styling | **HIGH** (fix at `_shared/shared.css` for system-wide coverage) |

---

---

## NPD (01) — prototype follow-ups (BL-NPD-01..06)

Added during the 2026-04-21 gap-fill pass.

| ID | Item | Priority |
|---|---|---|
| BL-NPD-01 | Brief schema fields C21–C37 are placeholder-labeled — full rescan pending Phase B.2 | Medium |
| BL-NPD-02 | Legacy R&amp;D pipeline screens (`Pipeline`, `CreateProjectWizard`, stage-based RecipeScreen/NutritionScreen etc.) coexist with new FA-spec screens — merge or deprecate in Phase 2 | Medium |
| BL-NPD-03 | Permissions matrix from spec §2.4 (role-based field visibility) hinted but not rigorously applied — every user sees every tab | Medium |
| BL-NPD-04 | SCR-01 WebSocket polling (30s refresh · Phase C5) not prototyped | P2 |
| BL-NPD-05 | `AllergenCascade` SVG diagram is static — should animate on refresh | Low |
| BL-NPD-06 | Mobile/tablet responsive breakpoints (§8) not addressed | Low |

---

---

## Technical (03) — prototype follow-ups (BL-TEC-01..04)

Added during the 2026-04-21 gap-fill pass.

| ID | Item | Priority |
|---|---|---|
| BL-TEC-01 | MIG-D365-ALLG-01 — `Item.allergens[]` unmapped to D365 (surfaced red banner in mapping screen) | Medium |
| BL-TEC-02 | Traceability screen static on LP-2026-04-19-00142 — wire to real `WO_LIST` for cross-module link | Medium |
| BL-TEC-03 | MODAL-NUTRITION-CALC (spec §TEC-011) not built — scoped out; future Nutrition Calculator integration | P2 |
| BL-TEC-04 | Shelf-life regulatory preset switch (spec Flow 6) not wired — currently read-only; preset change needs ECO-triggering modal | Medium |

---

---

## Settings (02) — prototype follow-ups (BL-SET-01..12)

Added during the 2026-04-21 gap-fill pass.

| ID | Item | Priority |
|---|---|---|
| BL-SET-01 | SET-031 Column edit wizard (8 steps) with live DSL preview | Medium |
| BL-SET-02 | SET-032 Schema diff viewer — side-by-side column diff | Medium |
| BL-SET-03 | SET-042 Rule version diff — JSON deep-diff (button currently disabled for non-current versions) | Medium |
| BL-SET-04 | SET-053 CSV import wizard — 3-step upload/preview/commit for reference data | Medium |
| BL-SET-05 | SET-061 Dept taxonomy editor — split/merge/add depts | Low |
| BL-SET-06 | SET-081 D365 constants inline editor — 5 Forza keys inline-editable | Medium |
| BL-SET-07 | SET-082 D365 sync config — pull/push cron + retry policy | Medium |
| BL-SET-08 | SET-093 Email delivery log — sent/failed/DLQ view | Low |
| BL-SET-09 | MFA enrollment flow — MODAL-MFA-ENROLL with QR + backup codes (stubbed) | Medium |
| BL-SET-10 | Reference table grids beyond allergens — pack_sizes, processes, UoM, currencies currently link only to allergen grid | Low |
| BL-SET-11 | PostHog read-through panel on Feature flags — currently only core/local/tenant tabs | P2 |
| BL-SET-12 | **Pre-existing bug** — duplicate `const BomsScreen` in both `app.jsx` and `data-screens.jsx` (not introduced, but flagged) | **HIGH** |

---

## Shared primitive — Modal hook ordering bug (BL-SHARED-01) — ✓ RESOLVED 2026-04-21

Fixed in `_shared/modals.jsx` — `useEffect` moved before `if (!open) return null`; `if (!open) return;` moved inside effect body. Dev-mode "Internal React error" warnings no longer emitted. Rules of Hooks now satisfied.

---

## Resolved questions (from 2026-04-21 audit)

| # | Decision |
|---|---|
| Q1 | Sequencing Preview stays inline in SCREEN-11; add explicit `Apply Sequencing` confirmation modal |
| Q3 | V-rule UI coverage target: ~60% ("block/warn at save" rules only; skip silent/backend-only) |
| Q4 | Build MODAL-05 TO Create, MODAL-07 Ship TO, MODAL-16 Draft WO Review now; defer MODAL-04, 11, 14 |
| Q6 | Unify placeholders via shared `<ScaffoldedScreen/>` component |
| Q7 | Extract modal primitives + MODAL-SCHEMA.md to `_shared/` BEFORE starting module 05+06 |
| Q8 | Scanner (06) = React SPA with scanner-kit tokens, NO planner shell (fullscreen mobile PWA skin) |

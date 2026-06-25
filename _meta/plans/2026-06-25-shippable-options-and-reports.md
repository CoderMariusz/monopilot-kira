# Shippable Options & Reports — Synthesis

**Date:** 2026-06-25
**Scope:** MISSING-VALUE backlog (reports, dashboards, exports, role capabilities, automation, configurability) across all modules. App is structurally sound (no 500s, write paths concurrency-safe); this plan adds value on top, not fixes.
**Source:** 15 research lanes (prod / quality / warehouse / planning / shipping / finance / npd / technical / trace-compliance / maintenance / exec-dashboards / exports-printing / role-views / org-configurability / scanner-mobile). Every item is grounded in real file/route/migration evidence.

**Excluded by owner:** D365 / external ERP sync; fa→FG renaming.

**Effort key:** S = small (UI + thin action, no schema), M = medium (new action(s) + page), L = large (schema migration, new feature, or PDF/ZIP runtime).

---

## 1. Quick wins (S effort, high value, no owner decision)

These ship fast: most are a thin client island + an existing-pattern CSV export, or a read-path query on data that already exists. Many reuse `downloadCsv`/`toCsv` from `apps/web/lib/shared/download.ts` and the `rpt.export.csv` gate.

| # | Item | Module | Why it matters | Evidence anchor |
|---|------|--------|----------------|-----------------|
| 1 | **Wire the audit-log "Export filtered results" button** (currently a visual stub — no `onClick`) | settings | Compliance gap: BRCGS needs exportable audit trails; button exists but does nothing | `settings/audit/page.client.tsx:291` (no handler) + `audit-log-loader.ts` |
| 2 | **OEE target-vs-actual gap badges + RAG** (query `oee_alert_thresholds`, replace hardcoded `oeeTone()`) | oee | Makes the OEE dashboard actionable vs flat averages; org targets already stored | `oee/_actions/oee-data.ts`; thresholds `oee.ts:73`; hardcoded tones `production/page.tsx:219` |
| 3 | **MTTR/MTBF KPI tiles on Downtime page** (compute from `downtime_events` directly) | production | Core maintenance KPIs operators expect; data on the existing query path | `downtime/_actions/downtime-data.ts` |
| 4 | **Yield-trend sparkline on Analytics** (day-bucket `work_orders.yield_percent`) | production | Day-over-day yield beside OEE; one query, existing Sparkline | `production/analytics/page.tsx`; `work-orders.ts:75` |
| 5 | **Line filter on Analytics/Waste** (prop exists, disabled `showLineFilter=false`) | production | Per-line drilldown; pattern already in `/reporting` | `analytics/page.tsx:225` |
| 6 | **Downtime Pareto week-over-week delta** (one extra aggregation query) | production | Trend visibility; "deltas not surfaced" is a documented gap | `downtime-data.ts` |
| 7 | **Hold/release log CSV export** (`quality_holds` full log) | quality | QA evidence packs without copy-paste; reuses reporting CSV pattern | `quality/holds/holds-list.client.tsx` |
| 8 | **Inspection pass-rate summary banner** (3 tiles, single `COUNT FILTER`) | quality | First-time-pass visibility on the list page | `quality/inspections/page.tsx`; `mig 272` |
| 9 | **Recall-drill CSV export** (`recall_drills.result_jsonb` → CSV; `report_url` always null) | quality | Mock-recall deliverable (BRCGS v9) | `recall-drills/_components/drill-report-panel.tsx`; `mig 305` |
| 10 | **Lab-results CSV exports** (technical + quality) | technical/quality | Lab evidence currently only viewable per-item | `technical/lab-results/...`; `api/technical/lab-results/route.ts` |
| 11 | **Allergen matrix / cascade / compliance / shelf-life / traceability / BOM-diff CSV exports** (6 read-only technical screens, data already in component props) | technical | Auditors ask for these; pure client island + `downloadCsv` | `technical/allergens-config`, `allergens/cascade`, `compliance`, `shelf-life`, `traceability`, `bom/diff` |
| 12 | **Warehouse inventory / movements / GRN / genealogy CSV exports** (data already in React state) | warehouse | Day-to-day reconciliation; no backend work | `inventory-browser.client.tsx`, `movement-list.client.tsx`, `grn-detail.client.tsx`, `genealogy-tree.client.tsx` |
| 13 | **MRP shortage/coverage CSV export** (rows already in client after run) | planning | Planner staple; zero new action needed | `mrp-view.tsx` (no export found) |
| 14 | **Location utilization %** (`locations.max_capacity` exists, never selected) | warehouse | Fill-rate + overloaded-location alerts | `location-read-actions.ts:61`; `infra-master.ts:88` |
| 15 | **Cycle-count accuracy %** (`count_lines.variance_qty=0` / total; currently raw int) | warehouse | Count accuracy trend; data present, not aggregated | `counts/page.tsx`; `mig 318` |
| 16 | **FEFO expiry configurable lookahead** (`?days=N`; window hardcoded 30) | warehouse | 7/14/30/60/90-day look-ahead for operators | `expiry-actions.ts:59` |
| 17 | **PWA `public/sw.js` no-op file** (3-line file; tests reference it, it's absent) | scanner | Makes scanner installable as PWA in dev/all envs | `app/__tests__/sw.test.ts:96`; `public/` empty |
| 18 | **Scanner label reprint button** on LP info screen (print API exists, no button) | scanner | Reprint damaged labels on the floor | `scanner/lp/.../lp-info-screen.tsx`; `api/scanner/print-label/route.ts` |
| 19 | **Allergen badge on scanner LP info** (`LEFT JOIN item_allergens`) | scanner | Allergen-segregation putaway decisions on floor | `lib/warehouse/scanner/movement.ts:117` |
| 20 | **Pick screen honours QA-hold on candidates** (badge before failed POST; putaway already does) | scanner | Fewer failed round-trips; reuse putaway `QaBadge` | `pick-screen.tsx:578` vs `putaway-screen.tsx:449` |
| 21 | **Scanner site/line/shift pill** post-login (fields already in session) | scanner | At-a-glance line context for handoffs | `home-screen.tsx`, `scanner-session.tsx` |
| 22 | **"Trace this LP" / "Trace this WO" deep-link buttons** (LP + WO detail → `/quality/trace`) | trace | One-click trace from where you already are | `warehouse/license-plates/[lpId]/page.tsx`, `production/wos/[id]/page.tsx` |
| 23 | **Trace LP nodes: add expiry + QA-status columns** (columns exist, not selected) | trace | Auditor needs shelf-life/hold status of affected LPs | `trace-actions.ts:305` |
| 24 | **Finance period filter + WO-cost CSV export** (`days` param exists, no UI; no export at all) | finance | Finance has zero exports today | `finance/page.tsx:54`; `wo-cost-actions.ts:345` |
| 25 | **Finance dashboard KPI strip** (4-5 tiles from existing `listCompletedWoCosts`) | finance | Turns flat table into a dashboard | `finance/page.tsx` |
| 26 | **Downtime-cost line in WO breakdown** (`downtime_min × labor_rate/60`; inputs already loaded) | finance | Quantifies downtime cost; no schema change | `wo-cost-actions.ts:267` |
| 27 | **NPD pipeline CSV export** (`listProjects` already returns all columns) | npd | Pipeline export staple | `pipeline/_components/pipeline-tabs.tsx` |
| 28 | **NPD owner-workload panel** + **dept blocked-FA drilldown** (clickable dept rows) | npd | Manager workload + dept self-service; reuse existing views | `pipeline-tabs.tsx`; `get-dashboard-summary.ts:116`; `missing_required_cols` view |
| 29 | **NPD costing roll-up table** (join `costing_breakdowns` target scenario) | npd | Cross-project margin scan vs per-project only | `costing_breakdowns` `mig 087` |
| 30 | **Wire `compare-versions.ts` into formulations UI** (action exists, no consumer) | npd | Version diff already built, just unmounted | `formulation/_actions/compare-versions.ts` |
| 31 | **Maintenance MWO CSV export + backlog-ageing + planned-vs-unplanned ratio** (all read-aggregations) | maintenance | Manager overview KPIs; export explicitly deferred | `mwo-list.client.tsx:20`; `mwo-actions.ts`; `mig 201` |
| 32 | **Global dashboard maintenance KPI tile** (2 scalar queries: open MWOs, overdue PMs) | maintenance/dashboard | Maintenance absent from home dashboard | `_actions/dashboard-summary.ts` |
| 33 | **Multi-site network KPI strip** (sites online / transfers in-transit / aggregated inventory) | multi-site | Page is a flat site list today | `multi-site/page.tsx`; `mig 263/334` |
| 34 | **Profile page shows the user's role** (`readMyProfile` never joins roles) | role-views | Self-service "what am I?" | `account/profile/profile-data.ts` |
| 35 | **Post-login landing → `/dashboard`** (currently Polish "Jesteś zalogowany" placeholder) | role-views | Every role lands on a dead placeholder | `(app)/page.tsx:23` |
| 36 | **Config UI: near-expiry-warn-days, count-variance-warn-pct** (DB keys read, no write UI) | settings | Admins can't tune thresholds without DB edits | `so-actions.ts:159`, `count-actions.ts:40` |
| 37 | **Settings NPD thresholds page** (`Reference.AlertThresholds` read, no edit UI) | settings/npd | Tune launch red/amber + margin-warn without DB edit | `get-launch-alerts.ts:53`; `mig 087` |
| 38 | **Shipments list: weight + required-delivery-date columns** (cols exist, never selected → always "—") | shipping | List shows placeholders for real data | `pack-actions.ts:355`; `so-actions.ts:551`; `mig 211` |
| 39 | **SO / shipments list CSV export** (none today; SO view documents the gap) | shipping | Basic ops export | `so-list-view.tsx:21`, `shipments-list-view.tsx` |
| 40 | **Add carrier/tracking/weight to reporting shipments CSV** (cols not fetched) | shipping/reporting | Completes an existing export | `reporting-overview.client.tsx:720`; `shared.ts:201` |
| 41 | **Recall-drill schedule/frequency KPI panel** (last drill, days-since, % within 4h) | trace | BRCGS drill-cadence tracking; read-only aggregate | `quality/recall-drills/page.tsx`; `mig 305` |
| 42 | **Dashboard quick-actions permission filter** (viewer sees "Create WO/PO/Run MRP" they can't use) | dashboard/role | Removes dead/403 buttons per role | `dashboard/page.tsx:18` |

---

## 2. High-value (M / L) — grouped by domain

### Production & OEE
- **(M) OEE deep-dive drill pages** `/oee/availability|performance|quality` — `big_loss_categories` (mig 203) + `oee_alert_thresholds` exist but no route queries them; page.tsx doc-comment lists these as backlog T-014..T-019. Pareto per A/P/Q + threshold reference line. _Evidence: `oee-data.ts`, `oee.ts:73,192`, `T-017.json`._
- **(M) Six Big Losses Pareto tab** on OEE — map `downtime_categories` → Nakajima A/P/Q via `big_loss_categories.impact_dimension`, lean_class colour coding. _Evidence: `mig 203:230`._
- **(M) OEE heatmap** (line × day grid) — `oee_daily_summary` MV has the data, never queried; HTML colour-interpolated table, no chart lib. Also extend reporting-refresh cron to refresh `oee_*` MVs (currently only `mv_reporting_%`). _Evidence: `oee.ts:232`, cron `route.ts:88`._
- **(M) OEE trend line chart** on the OEE dashboard (period picker wired, only tables render). _Evidence: `oee/page.tsx:284`._
- **(M) Daily production summary export uncapped + downtime/waste/shifts CSV** — `exportProductionSummaryCsv` is `LIMIT 20`; three sub-pages have no export. _Evidence: `report-read-actions.ts:305,353`._
- **(L) Cross-module exceptions digest** `/dashboard/exceptions` — single page rolling up overdue POs/TOs, open holds, WOs past start, expiring stock, `over_production_flagged` WOs (mig 336). Each module silos its own alerts today. _Evidence: `dashboard-summary.ts:204`._

### Quality & Trace / Compliance
- **(L) Certificate of Analysis (CoA) PDF** per finished good — all source data present (`quality_inspections`, `quality_spec_parameters`, `lab_results`, allergen profile) but **no PDF library exists in the repo**. `@react-pdf/renderer` + `coa_url` column. _Evidence: no jsPDF/react-pdf import anywhere._
- **(M) NCR/CAPA trend + Pareto dashboard** `/quality/analytics` — reporting shows only 4 scalar tiles; `ncr_reports.root_cause_category`, `capa_actions` exist. Verify recharts before adding. _Evidence: `report-read-actions.ts:768`; `mig 197/308`._
- **(M) Supplier quality scorecard extension** — add incoming-inspection pass %, lab-result pass %, reject-kg to the existing `/planning/suppliers/[id]/scorecard`. _Evidence: `freight-actions.ts:406`._
- **(M) Complaint analytics** (severity/root-cause volume, CAPA closure rate, overdue count). _Evidence: `complaint-actions.ts`; `mig 308`._
- **(M) E-sign quality register** `/quality/sign-register` — `e_sign_log` `qa.*` intents never surfaced; settings/audit only reads DDL `audit_log`. 21-CFR-style trail. _Evidence: `e-sign.ts`; `audit-log-loader.ts`._
- **(M) Lab-results register** `/quality/lab-results` + pass-rate by test type — only consumer today is the Technical JSON API. _Evidence: `api/technical/lab-results/route.ts`; `mig 162`._
- **(M) Mass-balance reconciliation tab** on WO detail (consumed vs output vs waste, balance gap, yield%). Warning exists on scanner output; no WO-level report. _Evidence: `mig 336`; `output-screen.tsx:82`._
- **(M) Forward-trace real shipment/customer linkage** — `customersAffected` hard-coded 0; `source_so_id` fetched but never joined to `sales_orders`/`shipments`. _Evidence: `trace-actions.ts:69,676`._
- **(M) Recall-drill closure report** — `recall_drills.notes`/`report_url` never read/written; add notes textarea, is_drill badge, printable report. _Evidence: `mig 305:18`._
- **(M) CCP monitoring trend chart** — `haccp_monitoring_log` vs `critical_limit_min/max` reference lines. _Evidence: `mig 289`._ (owner: deep-link auto-NCRs?)
- **(L) BRCGS / 21-CFR audit-pack ZIP** — assemble HACCP/specs/holds/NCR/e-sign/trace into a dated ZIP (`archiver`/`jszip`); nothing assembles these today. _Evidence: ingredients across `mig 197/305/306`._

### Warehouse & Inventory
- **(M) Stock valuation report** — `item_wac_state` + `inventory_cost_layers` (mig 199) read by zero UI; inventory browser queries only `license_plates`. Dashboard comment explicitly omits the value KPI. _Evidence: `warehouse-dashboard.client.tsx:19`._
- **(M) Inventory valuation CSV with FIFO layers** — `exportInventoryValuationCsv` alongside the production export. _Evidence: `mig 199`._
- **(M) ABC analysis by movement velocity** — `stock_moves` + `lp_state_history` exist; no velocity query anywhere. _Evidence: `warehouse-waveb.ts:201`._
- **(M) Slow/non-mover report** — derive `last_movement_at` from `max(move_date)`; no column today. _Evidence: `warehouse-lp.ts` (no col)._
- **(M) Stock-adjustment audit list** `/warehouse/adjustments` — table exists (mig 318/328), only a `new/` form, no list/summary. _Evidence: `adjustments/new/page.tsx`._
- **(M) Stock-movement date filter + CSV** — `listStockMoves` only takes `limit`/`moveType`; 500-row cap hides history. _Evidence: `movements/page.tsx:87`, `stock-move-actions.ts:50`._
- **(L) Inventory snapshot history/trend** — no history table; option A = nightly cron writes `inventory_daily_snapshots`, option B = point-in-time diff. _Evidence: `report-read-actions.ts:409`._ (owner)

### Planning & Procurement
- **(M) PO aging report** (0-30/31-60/61-90/90+ buckets) — dashboard shows a flat overdue list, no aging. _Evidence: `dashboard-data.ts:266`._
- **(M) Cross-supplier OTIF + lead-time table** `/planning/suppliers/performance` — per-supplier scorecard exists, no cross-supplier ranking. _Evidence: `freight-actions.ts:445`._
- **(M) Open-PO book** (line-level remaining-to-receive) — current PO CSV is header-only. _Evidence: `create-export-job.ts:38`; `actions.ts:150`._
- **(M) Reorder/below-min one-click PO** — `getItemsBelowMin()` from `v_inventory_available` + `reorder_thresholds` without a full MRP run; group-by-supplier create. _Evidence: `mrp.ts:951`._
- **(M) Procurement KPI fix** — replace the always-null `confirmedToGrn` tile with real OTIF%. _Evidence: `shared.ts:246` (honest null)._
- **(M) Transfer-order aging + CSV** — TO export missing entirely. _Evidence: `mig 263`._
- **(M) WIP report** (open WOs by age/line). _Evidence: `listPlanningWorkOrders.ts`._
- **(L) MRP run comparison** (diff two `mrp_requirements` snapshots). _Evidence: `mrp.ts:626`._
- **(M, owner) WO load-vs-capacity** — `capacity_plans`/`capacity_plan_lines` (mig 179) read by zero code; compute from `wo_operations.expected_duration_minutes`. _Evidence: grep finds no refs outside migrations._
- **(M, owner) Demand-vs-supply weekly trend** — `demand_forecasts` (mig 302) vs `wo_outputs`. _Evidence: `mrp.ts:265`._
- **(M, owner) Spend analysis** by supplier/category/month from `purchase_order_lines.unit_price`. _Evidence: `po-list-view.tsx:26`._

### Finance
- **(M) Standard-vs-actual cost variance** `/finance/variances` — `cost_variances` table + `fin.variance.view` perm both live, read by zero app code; T-026 NOT STARTED. _Evidence: `mig 199/292`._
- **(M) WIP / inventory valuation** `/finance/valuation` — `item_wac_state`/`inventory_cost_layers` live; `fin.valuation.view` seeded, unused. _Evidence: `mig 199`._
- **(M) Material spend by supplier** — `SUM(qty×unit_price)` not computed anywhere. _Evidence: `report-read-actions.ts:861`._
- **(M) Cost-per-kg multi-item trend** `/finance/cost-trends` — single-item only today. _Evidence: `technical/cost/history`._
- **(M) Scrap/waste cost report** by category/line/period. _Evidence: `wo-cost-actions.ts:18`._
- **(M) Labor cost report** by WO/operator from `wo_labor_log` — finance derives labor from process-rate proxy, never reads clock-in. _Evidence: `labor-actions.ts:229`; `wo-cost-actions.ts`._
- **(L, owner) Standard-cost approval workflow** — `standard_costs` table + `fin.standard_cost.approve` perm live, zero UI; T-011/012 NOT STARTED. _Evidence: `mig 199/292`._
- **(M, owner) Margin analysis** — `items.list_price_gbp` (mig 313) vs `costPerKgOutput`, never joined. Needs list-price data populated. _Evidence: `sales-line-price.ts:7`._

### NPD
- **(M) Pipeline funnel / stage-gate conversion** — `outbox_events` `npd.gate.advanced` never read for reporting. _Evidence: `mig 217:72`._
- **(M) Launch-readiness matrix** (all projects × C1-C7, checklist %, days-left) — per-project checks exist, no cross-section view. _Evidence: `gate-checklist-panel.tsx`, `evaluate.ts`._
- **(M) Gate-approval audit log** (cross-project, exportable) — `gate_approvals` per-project only; BRCGS evidence. _Evidence: `mig 085:60`._
- **(M, owner) Gate cycle-time report** + add real `launched_at` column (current KPI uses `created_at` as a meaningless proxy). _Evidence: `pipeline-tabs.tsx:260`._

### Technical
- **(M) Multi-level BOM explosion** `/technical/bom/[itemCode]/explosion` — flat JOIN only, no `WITH RECURSIVE`; explicitly out of scope today. _Evidence: `detail-page.ts:229`, `graph-tab.tsx:19`._
- **(S) Cross-portfolio where-used** ("which FGs use ingredient X?") — only per-FG where-used exists. _Evidence: `detail-page.ts:253`._
- **(M) Portfolio cost roll-up** (all FGs one view) — single-product picker only. _Evidence: `cost/_actions/list-recipe-cost.ts`._
- **(M) Supplier-spec coverage gap** (RM/PM items with no approved spec). _Evidence: `supplier-spec-actions.ts`._
- **(M) Nutrition label print** (EU 1169/2011 declaration) + **factory-spec print** — reuse `window.print()` pattern, no PDF lib. _Evidence: `nutrition-panel.client.tsx`, `recipe-sheet-tab.tsx:116`._

### Maintenance
- **(M) PM compliance report** (`completed_on_time/scheduled > 85%`). _Evidence: `mwo-actions.ts` listPmSchedules; PRD §3.3._
- **(M) Calibration-due register** + audit CSV (`retention_until` 7-yr, `certificate_sha256`) — `calibration_*` tables read by zero code. _Evidence: `mig 201`._
- **(M) Spare-parts below-reorder register** — `maintenance_spare_parts_stock` read by zero code. _Evidence: `mig 201:269`._
- **(M) Asset downtime-cost report** + **(M) Sanitation allergen audit log** (dual sign-off, 7-yr retention) + **(M) Maintenance section in reporting bundle**. _Evidence: `mig 201`; `report-read-actions.ts:971`._
- **(M, owner) MTBF/MTTR per machine** — `oee_shift_metrics` MV has the columns, never read. _Evidence: `mig 203:289`._

### Exec / cross-module dashboards
- **(M) Plant-manager daily dashboard** — main `/dashboard` shows 5 KPIs, none OEE/output/quality; aggregate prod+quality+maintenance into one gated panel. _Evidence: `dashboard-summary.ts:96`; `production/_actions/dashboard-data.ts`._
- **(M) Quality KPI dashboard (QA-001)** — quality landing is a nav-card hub, prototype maps 6 tiles. _Evidence: `quality/page.tsx:57`._
- **(M) Maintenance KPI dashboard (MNT-001)** + **Shipping dashboard (SHIP-022)** + **Finance scorecard (FIN-001)** — all are list-only landings vs prototype KPI strips. _Evidence: respective `page.tsx` + prototype anchors._

### Exports / printing runtime (L, owner)
- **(L, owner) LP label ZPL/PDF render** — GS1 element-string builder (`packages/gs1`) is real; result is a JSON `data:` URI stub. Needs ZPL template or PDF + printer model decision. _Evidence: `printers.ts:284,554`; `print-label/route.ts:111`._
- **(M/L, owner) Real BOL PDF/HTML** — `generateBol` stores JSON in `bol_pdf_url`; `bill_of_lading` table (mig 211) unused. Option (b) print-HTML needs no new dep. _Evidence: `ship-actions.ts:370`._
- **(L, owner) Scheduled/emailed report delivery** — `scheduled_export_configs` table (mig 213) exists, runner is a "later task"; cron only refreshes MVs. _Evidence: `mig 213:143`; cron `route.ts`._

### Scanner / mobile (M/L)
- **(L) Cycle-count on scanner** — desktop module exists; no scanner route/tile. Phase-2 flagged. _Evidence: `translation-notes-warehouse.md:95`._
- **(L) Receive Transfer Order on scanner** — only receive-PO exists; multi-site operators need floor TO receipt. _Evidence: `home-screen.tsx:31`._
- **(M) GS1-128 decode in scan input** — `packages/gs1/parse.ts` complete but no screen calls it; operators retype fields. _Evidence: screens pass raw string._
- **(M) Batch/lot lookup** (search by batch, not LP code) — recall scenarios fail on supplier-batch barcodes. _Evidence: `movement.ts:147`._
- **(L, owner) Offline mutation queue** — `packages/sync-queue` exists, `scannerFetch` never enqueues; topbar already has a "queued" state. _Evidence: `scanner-session.tsx`, `scanner-labels.ts:475`._

### Configurability (L, owner)
- **(L, owner) QC inspection templates** — `quality_inspections.parameters` is free-form jsonb; no template table/settings. Pre-populate from template reduces operator error. _Evidence: `mig 272:134`._
- **(L, owner) Signoff policies catalog** — only `production.changeover.allergen` type; hold-release/inspection-decide/WO-close are hardcoded. _Evidence: `settings/signoff/page.tsx:59`._
- **(L, owner) Per-site override settings** — `oee_alert_thresholds.site_id` hints the pattern; everything else shares one org-flat `feature_flags`. _Evidence: `mig 203:101`._
- **(M) Date-format/currency consumption** — saved on `organizations`, consumed by zero module. _Evidence: `company-profile.ts:63`._
- **(M) Catch-weight tolerance config** — hardcoded 10%; per-item col read but no write UI. _Evidence: `register-output.ts:128,607`._

---

## 3. Reports backlog (every proposed report/dashboard/export)

| Report / surface | Module | Kind | Effort | Owner? | Roles |
|---|---|---|---|---|---|
| OEE A/P/Q drill pages | oee | dashboard | M | no | admin, dept_manager, core_user |
| Six Big Losses Pareto | oee | dashboard | M | no | admin, dept_manager, core_user |
| OEE heatmap (line×day) | oee | dashboard | M | no | admin, dept_manager, core_user, viewer |
| OEE trend line chart | oee | dashboard | M | no | admin, dept_manager, dept_user, core_user |
| OEE target-vs-actual badges | oee | dashboard | S | no | admin, dept_manager, core_user, viewer |
| MTTR/MTBF on Downtime | production | dashboard | S | no | admin, dept_manager, core_user |
| Yield trend sparkline | production | dashboard | S | no | admin, dept_manager, core_user, viewer |
| Downtime Pareto WoW delta | production | dashboard | S | no | admin, dept_manager, core_user |
| Line filter on Analytics/Waste | production | dashboard | S | no | admin, dept_manager, core_user |
| Schedule adherence (planned vs actual) | production | report | M | yes | admin, dept_manager, core_user |
| Shift handover notes | production | report | M | yes | admin, dept_manager, core_user, dept_user |
| Daily prod summary export (uncapped) + sub-page CSVs | production | export | M | no | admin, dept_manager |
| Labor efficiency / throughput | production | report | M | yes | admin, dept_manager |
| Mass-balance reconciliation tab | production/trace | report | M | no | admin, dept_manager, core_user |
| CoA PDF | quality | export | L | no | dept_manager, core_user, viewer |
| NCR/CAPA trend + Pareto | quality | dashboard | M | no | dept_manager, admin, viewer |
| Supplier quality scorecard ext | quality/planning | dashboard | M | no | dept_manager, admin, npd_manager |
| Mock-recall report (CSV) | quality | report | S | no | dept_manager, admin, core_user |
| Recall-drill closure report | quality | report | M | no | admin, dept_manager, core_user |
| Recall-drill schedule KPI | quality | dashboard | S | no | admin, dept_manager |
| BRCGS audit pack (ZIP) | quality | report | L | yes | admin, dept_manager |
| 21CFR/BRCGS audit-evidence pack (per-lot ZIP) | trace | export | L | yes | admin, dept_manager |
| Complaint analytics | quality | report | M | no | dept_manager, admin, viewer |
| Hold/release log CSV | quality | export | S | no | dept_manager, admin, core_user, viewer |
| E-sign quality register | quality | report | M | no | admin, dept_manager |
| Inspection pass-rate banner | quality | dashboard | S | no | dept_manager, core_user, admin |
| CCP monitoring trend chart | quality | dashboard | M | yes | dept_manager, core_user, admin |
| Lab-results register + pass-rate | quality | report | M | no | dept_manager, core_user, admin, npd_manager |
| Trace report CSV/print | trace | export | S | no | admin, dept_manager, core_user |
| Forward-trace shipment/customer linkage | trace | report | M | no | admin, dept_manager, core_user |
| Trace LP expiry + QA-status columns | trace | report | S | no | admin, dept_manager, core_user, viewer |
| Trace/recall dedicated RBAC perms | trace | config | S | yes | admin, dept_manager |
| Lot-level "trace this" deep-links | trace | feature | S | no | admin, dept_manager, core_user, dept_user |
| Traceability search export (technical) | technical | export | S | no | admin, dept_manager, core_user |
| Compliance dashboard drill-through + filters | trace | dashboard | S | no | admin, dept_manager, core_user, viewer |
| Stock valuation (WAC) | warehouse | report | M | no | admin, dept_manager, viewer |
| Inventory valuation CSV (FIFO) | warehouse | export | M | no | admin, dept_manager |
| ABC analysis | warehouse | report | M | no | dept_manager, admin, viewer |
| Slow/non-mover | warehouse | report | M | no | dept_manager, core_user, viewer |
| Location utilization % | warehouse | report | S | no | dept_manager, core_user, admin |
| Inventory browser CSV | warehouse | export | S | no | dept_manager, admin, core_user |
| Stock-adjustment audit list | warehouse | report | M | no | admin, dept_manager, viewer |
| Cycle-count accuracy trend | warehouse | report | S | no | dept_manager, admin, viewer |
| Inventory snapshot history | warehouse | dashboard | L | yes | dept_manager, admin, viewer |
| Stock-movement date filter + CSV | warehouse | export | M | no | core_user, dept_manager, admin, viewer |
| Negative-stock/exceptions panel | warehouse | dashboard | S | no | dept_manager, core_user, admin |
| FEFO expiry configurable lookahead | warehouse | report | S | no | core_user, dept_user, dept_manager, viewer |
| GRN line/list CSV | warehouse | export | S | no | core_user, dept_manager |
| Genealogy tree CSV | warehouse | export | S | no | dept_manager, admin, viewer |
| PO aging | planning | report | M | no | admin, dept_manager, core_user |
| Cross-supplier OTIF/lead-time | planning | report | M | no | admin, dept_manager, core_user |
| MRP shortage/coverage CSV | planning | export | S | no | admin, dept_manager, core_user |
| Open-PO book (line-level) | planning | report | M | no | admin, dept_manager, core_user |
| Demand-vs-supply weekly trend | planning | dashboard | M | yes | admin, dept_manager, npd_manager |
| Reorder one-click PO | planning | automation | M | no | admin, dept_manager, core_user |
| WO load-vs-capacity | planning | dashboard | M | yes | admin, dept_manager, core_user |
| Procurement KPI OTIF fix | planning/reporting | report | M | no | admin, dept_manager, viewer |
| MRP run comparison | planning | report | L | no | admin, dept_manager, core_user |
| Transfer-order aging + CSV | planning | report | S | no | admin, dept_manager, core_user |
| Spend analysis | planning | report | M | yes | admin, dept_manager |
| WIP report | planning | report | M | no | admin, dept_manager, core_user, dept_user |
| TO/WO list CSV export | planning | export | M | no | dept_manager, core_user, admin |
| Production WO list CSV | production | export | M | no | dept_manager, core_user, dept_user |
| OTIF report | shipping | report | M | no | admin, dept_manager, viewer |
| Carrier performance | shipping | dashboard | M | no | admin, dept_manager, viewer |
| Delivery exceptions record/surface | shipping | feature | S | yes | admin, core_user, dept_manager |
| SO/shipment CSV export | shipping | export | S | no | admin, core_user, dept_manager, dept_user, viewer |
| Dispatch / load plan | shipping | dashboard | M | yes | admin, core_user, dept_user, dept_manager |
| BOL/packing-slip real document | shipping | feature | L | yes | admin, core_user, dept_user |
| Shipment status board | shipping | dashboard | M | no | admin, core_user, dept_user, dept_manager |
| Customer returns (RMA) | shipping | feature | L | yes | admin, core_user, dept_manager, dept_user |
| Shipments weight/required-delivery columns | shipping | report | S | no | admin, core_user, dept_manager, dept_user, viewer |
| Customer allergen gate | shipping | feature | M | yes | admin, core_user, dept_manager |
| Reporting shipments CSV ext (carrier/weight) | shipping | export | S | no | admin, dept_manager, viewer |
| Finance period filter + WO-cost CSV | finance | report | S | no | admin, dept_manager, core_user |
| Cost variance report | finance | report | M | no | admin, dept_manager, core_user |
| WIP/inventory valuation | finance | report | M | no | admin, dept_manager |
| Material spend by supplier | finance | dashboard | M | no | admin, dept_manager, core_user |
| Cost-per-kg multi-item trend | finance | report | M | no | admin, dept_manager, core_user, npd_manager |
| Scrap/waste cost | finance | report | M | no | admin, dept_manager, core_user |
| Downtime-cost line | finance | report | S | no | admin, dept_manager, core_user |
| Margin analysis | finance | report | M | yes | admin, dept_manager, npd_manager |
| Finance dashboard KPI strip | finance | dashboard | S | no | admin, dept_manager, core_user |
| Labor cost report | finance | report | M | no | admin, dept_manager, core_user |
| Standard-cost approval workflow | finance | feature | L | yes | admin, dept_manager |
| Finance CSV export (gated) | finance | export | S | no | admin, dept_manager, core_user |
| Pipeline funnel/conversion | npd | dashboard | M | no | npd_manager, admin, dept_manager |
| Gate cycle-time report | npd | report | M | yes | npd_manager, admin |
| Cross-project costing roll-up | npd | report | S | no | npd_manager, admin, dept_manager |
| Launch-readiness matrix | npd | dashboard | M | no | npd_manager, admin, dept_manager, viewer |
| Gate-approval audit log | npd | report | M | no | npd_manager, admin |
| Pipeline CSV export | npd | export | S | no | npd_manager, admin, dept_manager |
| Owner workload view | npd | dashboard | S | no | npd_manager, admin |
| Real launched_at column | npd | feature | S | yes | npd_manager, admin |
| Configurable launch thresholds (settings) | npd/settings | config | S | no | admin |
| Dept blocked-FA drilldown | npd | report | S | no | dept_manager, dept_user, npd_manager, admin |
| Formulation version comparison (wire UI) | npd | report | S | no | npd_manager, core_user, admin, dept_manager |
| Allergen matrix CSV | technical | export | S | no | npd_manager, dept_manager, viewer |
| Multi-level BOM explosion | technical | report | M | no | npd_manager, dept_manager, core_user |
| Cross-portfolio where-used | technical | report | S | no | npd_manager, dept_manager, core_user, viewer |
| Portfolio cost roll-up | technical | report | M | no | dept_manager, npd_manager, core_user |
| Compliance gap CSV | technical | export | S | no | dept_manager, npd_manager, core_user, viewer |
| Nutrition label print | technical | export | M | no | npd_manager, dept_manager, core_user |
| Supplier-spec coverage gap | technical | report | M | no | dept_manager, npd_manager, core_user |
| Allergen cascade CSV | technical | export | S | no | npd_manager, dept_manager, core_user |
| Lab-results CSV (technical) | technical | export | S | no | dept_manager, npd_manager, core_user, viewer |
| Shelf-life CSV + filter | technical | report | S | no | dept_manager, core_user, viewer |
| Factory-spec print | technical | export | M | no | dept_manager, npd_manager, core_user |
| BOM version-diff CSV | technical | export | S | no | dept_manager, npd_manager, core_user |
| BOM recipe-sheet PDF/print | technical | export | M | no | npd_manager, core_user, dept_manager |
| MWO backlog ageing | maintenance | dashboard | S | no | admin, dept_manager |
| PM compliance | maintenance | report | M | no | admin, dept_manager, dept_user |
| Calibration-due register | maintenance | report | M | no | admin, dept_manager, core_user |
| MTBF/MTTR per machine | maintenance | report | M | yes | admin, dept_manager |
| Spare-parts below-reorder | maintenance | dashboard | M | no | admin, dept_manager, dept_user |
| Asset downtime cost | maintenance | report | M | no | admin, dept_manager |
| Maintenance global KPI tile | dashboard | dashboard | S | no | admin, dept_manager, core_user, viewer |
| Maintenance MWO CSV | maintenance | export | S | no | admin, dept_manager, core_user |
| Calibration records CSV (audit) | maintenance | export | S | no | admin, dept_manager |
| Planned-vs-unplanned ratio | maintenance | dashboard | S | no | admin, dept_manager |
| Sanitation allergen audit log | maintenance | report | M | no | admin, dept_manager, core_user |
| Maintenance in reporting bundle | maintenance/reporting | report | M | no | admin, dept_manager, viewer |
| Plant-manager daily dashboard | dashboard | dashboard | M | no | admin, dept_manager |
| Quality KPI dashboard (QA-001) | quality | dashboard | M | no | admin, dept_manager, dept_user, core_user |
| Maintenance KPI dashboard (MNT-001) | maintenance | dashboard | M | no | admin, dept_manager, dept_user |
| Shipping dashboard (SHIP-022) | shipping | dashboard | M | no | admin, dept_manager, dept_user |
| Company KPI scorecard (FIN-001) | finance | dashboard | M | no | admin, dept_manager |
| Multi-site network KPI strip | multi-site | dashboard | S | no | admin, dept_manager |
| Cross-module exceptions digest | dashboard | report | L | no | admin, dept_manager |
| NPD-manager home panel | dashboard | dashboard | S | no | admin, npd_manager |
| Viewer read-only home | dashboard | dashboard | S | no | viewer |
| Dept-user scanner-focused home | dashboard | dashboard | S | yes | dept_user, core_user |
| Audit-log CSV (wire stub button) | settings | export | S/M | no | admin |
| Scheduled/emailed report delivery | reporting | automation | L | yes | admin, dept_manager |
| LP label ZPL/PDF render | scanner/print | export | L | yes | core_user, dept_user, dept_manager |
| Real BOL PDF/HTML | shipping | export | M/L | yes | core_user, dept_manager, admin |

---

## 4. Per-role value

Independent of the report list above, the **role-views** lane found that the 5 non-admin canonical roles are effectively locked out of every ops module today — that ships baseline value before any report is built.

- **admin** — already has the full permission set (mig 332). Gains: plant-manager + exec dashboards, cross-module exceptions digest, every audit/compliance export (BRCGS pack, e-sign register, audit-log CSV), all finance/valuation/variance reports, configurability UIs (signoff catalog, per-site overrides, thresholds), scheduled email digests.

- **dept_manager** — **today receives only `npd.dashboard.view` + 2 NPD perms; hits the "denied" panel on `/production` immediately** (`PRODUCTION_VIEW_PERMISSION = production.oee.read`). Gains once the canonical-role matrix migration seeds module perms: production/OEE dashboards, PM-compliance, spend/OTIF/aging reports, finance cost+variance+valuation, schedule adherence, labor reports, plus approval acts (allergen sign-off, hold release) pending SoD confirmation. The single biggest unlock in the whole plan.

- **core_user** — today has NPD-author perms but **no `technical.*`**, so item-master/BOM writes from NPD formulation 403. Gains: technical item/BOM/allergen author perms (matrix migration), portfolio cost roll-up, where-used, MRP/PO exports, shift-handover, mass-balance, formulation version-compare.

- **dept_user (operator)** — scanner-focused home (scanner tile + my-WOs + log-downtime as first-class), allergen badge + QA-hold on scanner LP/pick screens, batch lookup, GS1 decode, PWA installability, PM/spares dashboards, shift handover. Scanner-tile filtering by role keeps irrelevant tiles hidden.

- **npd_manager** — today sees only Dashboard + NPD (missing **Technical** + **Reporting**, both core to the job). Gains: `technical.sensory.read` + `rpt.dashboard.view` (matrix), pipeline funnel/conversion, launch-readiness matrix, gate-approval audit log, owner workload, cross-project costing, NPD home panel on the main dashboard, real `launched_at` TTM KPI.

- **viewer** — today has only `npd.dashboard.view` → sidebar shows Dashboard + NPD out of 17 items; a read-only auditor/board persona gets almost nothing. Gains: seed `rpt.dashboard.view` + `quality.dashboard.view` + `production.oee.read` (read-only, no writes); a dedicated read-only "today at a glance" home; KPI tiles on OEE/valuation/quality dashboards; CSV exports (hold log, inventory, traceability) for evidence gathering.

**Cross-role plumbing (enables all of the above):**
- (M, owner) **Canonical-role permission matrix migration** — seed module read/view perms to the 6 slugs. *This is the gating item: without it most role-specific reports are invisible to their intended audiences.* `mig 080` only seeds `npd.*`; all ops perms went to non-canonical role families (production_operator, qa_inspector…) the 6 roles don't hold.
- (M, owner) **Role-personalised dashboard** — `dashboard-summary.ts` resolves no role; tiles + quick-actions are static for everyone.
- (S/M) Profile shows role; post-login → /dashboard; quick-action permission filter; scanner role-based tile filter.
- (S, owner) **Settings/Roles taxonomy fix** — `ROLE_CODES` lists 10 codes that don't match the 6 seeded roles (omits `core_user`/`dept_manager`, lists unseeded `planner`/`production_lead`/etc.).
- (L, owner) **"Pending for me" inbox** — no user-scoped approval queue exists for any role.

---

## 5. Owner-decision items (separate track)

These need an owner call before build (data semantics, RLS strategy, hard-block vs override, PDF/printer model, or product taxonomy):

| Item | Decision needed |
|---|---|
| Schedule adherence | On-time tolerance window (minutes); is `scheduled_*_time` authoritative |
| Shift handover | Confirm new `shift_handovers` table + write gate |
| Labor efficiency / cost reports | Cost-column RBAC (hide from dept_user/viewer); clock-in vs process-rate as source of truth |
| WO load-vs-capacity | Also write to `capacity_plan_lines` or compute-only from `wo_operations` |
| Demand-vs-supply trend | Forecast-vs-actual coverage definition / ISO-week join semantics |
| Spend analysis | Treat MRP-converted zero-price POs (exclude from monetary totals) |
| MTBF/MTTR | Source from unrefreshed `oee_shift_metrics` MV or compute live |
| CCP trend chart | Deep-link auto-created NCRs from breach tooltip |
| BRCGS / 21CFR audit packs | Include full `e_sign_log` rows per entity or just signature_hash refs |
| Margin analysis | Requires `items.list_price_gbp` populated (data entry) |
| Standard-cost approval | Confirm `standard_costs` lifecycle + who approves vs Technical cost edits |
| Real `launched_at` | Confirm "Launched" gate definition matches product intent |
| Gate cycle-time | Add `launched_at` column vs outbox-only |
| Inventory snapshot history | Option A (nightly cron + table) vs B (point-in-time diff) |
| Delivery exceptions | `ext_data` reason vs structured `exception_reason` column |
| Dispatch/load plan | Confirm dock-door data model surfacing |
| BOL document | PDF (new dep) vs print-HTML route |
| Customer returns (RMA) | Full feature: disposition rules, credit-note integration |
| Customer allergen gate | "refuses" = hard block vs dual-sign override |
| LP label render | Printer integration model (direct ZPL bridge vs server PDF) |
| Scheduled report delivery | Delivery channel (email infra vs storage signed-URL) |
| Scanner offline queue | Which POSTs are safe to enqueue/replay |
| Over-consume approval | PIN-keypad vs email+PIN on the approval path |
| Scanner printer selection | Default-printer storage + site scoping |
| QC inspection templates | New `qc_inspection_templates` table + pre-population rules |
| Signoff policies catalog | Which lifecycle acts become configurable; required-sig counts |
| Per-site overrides | RLS strategy for `site_settings` jsonb |
| Digest send-time config | Store hour on `notification_preferences` vs `feature_flags` |
| Notification "+ New rule" | Honest help-text (remove button) vs real subscription flow |
| Canonical-role matrix | Exact per-role permission matrix (the gating decision for §4) |
| Role-personalised dashboard | Per-role tile/quick-action mapping |
| dept_manager sign-off perms | Which approval acts vs SoD constraints |
| Settings/Roles taxonomy | Seed extra system roles or trim UI list to the 6 |
| "Pending for me" inbox | Approver-resolution model per event type |
| Dept-user scanner home | Confirm scanner-first quick-actions for dept_user |

---

## Appendix: already-EXISTS (do not rebuild)

The exports-printing lane confirmed these are fully implemented — do not duplicate:
- Reporting CSV exports (production/inventory/quality/procurement/receipts/shipments) — `reporting-overview.client.tsx`, gated `rpt.export.csv`.
- NPD BOM CSV export — `fa/actions/bom-export-csv.ts`, gated `npd.bom.export`.
- Purchase-orders list CSV export — `planning/purchase-orders/_actions/create-export-job.ts`.
- Supplier scorecard (single supplier) — `planning/suppliers/[id]/scorecard`.
- Desktop cycle-count module — `warehouse/counts/` (scanner version is the gap).

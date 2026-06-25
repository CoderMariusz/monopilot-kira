# MonoPilot Kira — Detailed Gaps Report (Missing Value)

**Date:** 2026-06-25
**Scope:** Missing user value across all modules — reports, dashboards, exports, role capabilities, automation, configurability. The app is structurally sound (no 500s, write paths concurrency-safe); this report is about *what users expect but cannot do*.
**Hard exclusions:** D365 / external ERP sync (owner-deferred). fa→FG renaming (owner-owned). This report stays read-only — every finding is grounded in real code with file/line evidence.
**Method:** Consolidated from 5 gaps clusters (make, quality, logistics, commercial, platform-roles) cross-referenced against 15 research lanes (per-module report/dashboard/export sweeps).

---

## 1. Executive Summary

The codebase is feature-rich at the **transaction** layer (you can create WOs, receive POs, run MRP, register output, raise NCRs, ship orders) but thin at the **insight, automation, and role-fit** layers. Three structural patterns recur across every module:

1. **Built backend, no UI surface.** Tables and server actions exist but no page mounts them. Examples: `cost_variances` + `fin.variance.view` (live, queried by zero app routes); cold-chain `product_temp_ranges`/`delivery_condition_checks` + full actions, no `/quality/cold-chain` route; `oee_alert_thresholds` (target %s never read); `capacity_plans`/`capacity_plan_lines` (zero app references); `scheduled_export_configs` (cron runner never built); `deactivateUser` action wired to nothing.

2. **RBAC seed gap — the 6 canonical roles are locked out of most modules.** The seeded product roles (`admin`, `npd_manager`, `core_user`, `dept_manager`, `dept_user`, `viewer`) were granted permissions only in migration 080 (npd.* family). Every later module RBAC seed (warehouse 192, quality 198, reporting 214, finance 292, technical 207, npd-stage 236) granted to *functional* role families (`warehouse_operator`, `qa_inspector`, `production_lead`, etc.) that **are not** the 6 canonical roles. Net effect at a fresh org: only `admin` reaches most modules; `dept_manager`/`dept_user`/`core_user`/`viewer` see Dashboard + NPD and nothing else. This is the single highest-leverage gap — a handful of seed migrations would light up the whole product for non-admin users.

3. **No cost/value or document layer.** Reporting counts rows but never sums money: no spend-by-supplier, no revenue-by-customer, no gross margin, no inventory valuation, no std-vs-actual variance surfaced. Document generation is stubbed everywhere: BOL stores JSON-as-"pdf_url", LP labels emit a `data:text/plain` JSON blob, no CoA, no recipe-sheet PDF, no audit-pack export.

A secondary theme is **automation absence**: PM cron, auto-expiry quarantine, scheduled exports, periodic inspection triggers, statistical forecasting, reorder auto-PO — all designed (tables present) but with no runner.

The good news: a large fraction of the highest-value gaps are **buildable now** (no owner decision, no migration, data already in Supabase) because the read models already exist. The "BUILDABLE NOW" table in §4 is the dispatch queue.

---

## 2. Gaps by Module / Domain

Severity legend: **HIGH** = blocks a standard food-manufacturing workflow or a regulated capability; **MEDIUM** = significant productivity/visibility loss; **LOW** = polish / convenience.
Status legend: **MISSING** = nothing exists; **PARTIAL** = backend or one half exists; **EXISTS** = present (listed only where research confirmed completeness for cross-reference).

### 2.1 Production (08-production)

| Gap | Sev | Status | Evidence |
|---|---|---|---|
| **QA results tab in WO detail permanently empty** — no join from `work_orders` to `quality_inspections`/`quality_holds` | HIGH | MISSING | `get-work-order-detail.ts:15,678` ("read-model not yet built → empty"); `wo-detail-screen.tsx:103-112` (qa TabKey); test at `wo-detail-screen.test.tsx:269` |
| **Line clearance / pre-start checklist not enforced** before WO start (no FM check, allergen visual, weight-check, CIP evidence) | HIGH | MISSING | `apps/web/lib/production/start-wo.ts:6-196` (only BOM/spec + changeover); `settings/rules/page.test.tsx` references cleaning-evidence rule not wired; no `pre_start_checklist` table |
| **No WO-level operations checklist / step sign-off** — `wo_operations` is read-only reference, no `status` column | MEDIUM | MISSING | `wo-detail-screen.tsx:594-603` (no operations tab); `176-planning-work-orders.sql` (wo_operations, no status col) |
| **Over-production flag not surfaced in list or dashboard** — `over_production_flagged` set but no filter/badge/KPI; never blocks | MEDIUM | PARTIAL | `336-wo-over-production-flag.sql`; `list-work-orders.ts:252` (fetched not filtered); `wo-list-screen.tsx` (no column) |
| **No production WO list / analytics CSV export** from the production module itself | LOW | MISSING | `production/wos/page.tsx` (no export); `production/analytics/page.tsx`; export lives only in reporting (`report-read-actions.ts:353`, gated `rpt.export.csv`) |
| **Mass-balance reconciliation report per WO** (input consumed vs output vs waste, kg balance) absent | MEDIUM | MISSING | warning exists at scanner output (`output-screen.tsx:82,185,254`); no WO-level balance tab; reporting shows yield% only |
| **Labor efficiency / throughput report** — `wo_labor_log` only on single WO detail, no cross-WO aggregate (output-kg/labor-hr, cost/kg) | MEDIUM | MISSING | `labor-actions.ts:174,229`; surfaced only at `production/wos/[id]/page.tsx:830`; reporting summary has no labor |
| **Yield trend over time** — analytics shows yield-by-line bar (single snapshot), no day-over-day yield sparkline | MEDIUM | PARTIAL | `analytics/page.tsx`; `work_orders.yield_percent` generated col available per WO with `completed_at` |
| **Downtime Pareto week-over-week delta** absent | LOW | PARTIAL | `downtime/page.tsx`; analytics doc-comment "week-over-week deltas not surfaced" |
| **Line filter disabled on analytics/downtime/waste** pages | LOW | PARTIAL | `analytics/page.tsx:225` (`showLineFilter=false`); reporting already supports `lineId` |
| **Schedule adherence report** (planned vs actual WO start/complete) — MV exists, queried by zero routes | MEDIUM | MISSING | `mv_reporting_schedule_adherence` (mig 213) + RLS view (mig 221); zero app grep hits |
| **Shift handover notes not data-backed** — `shift_handovers` table does not exist | MEDIUM | MISSING | `production/shifts/page.tsx` doc-comment; no `shift_handovers` table in schema |

### 2.2 Planning / MRP / Scheduler (04/07-planning, scheduler)

| Gap | Sev | Status | Evidence |
|---|---|---|---|
| **Rework WO creation/execution flow not executable** — `is_rework` column exists, never written; no UI; hold-release records `disposition='rework'` but spawns no WO | HIGH | MISSING | `176-planning-work-orders.sql:48`; `createWorkOrder.ts:33-43` (no param); `hold-actions.ts:652-653`; zero `is_rework` grep hits in app |
| **Scheduler ignores line capacity** — `capacity_hours_per_day` never queried; solver stacks WOs back-to-back with no shift fence | HIGH | MISSING | `scheduler-types.ts:64`; `sequence-solver.ts:98-125`; `scheduler-actions.ts` (no config query) |
| **Scheduler has no drag-and-drop / manual override UI** — override_* columns exist, no action to write them | MEDIUM | MISSING | `scheduler-board-view.tsx:15` ("No drag&drop"); `scheduler-types.ts:42-48` |
| **Scheduler config not editable** (capacity, strategy weights, respect-PM) — no page or load/save action | LOW | MISSING | `scheduler-types.ts:56-75`; no config page; `scheduler-actions.ts` (no loadConfig/saveConfig) |
| **MRP ignores capacity (no RCCP)** — nets material only, can propose 5 WOs same day same line | MEDIUM | MISSING | `mrp.ts:22-42`; `mrp-compute.ts` (quantity-only netting) |
| **MRP→PO sets unitPrice='0'** — no last-price or contract lookup, every line needs manual correction | MEDIUM | PARTIAL | `mrp.ts:997` (hardcoded '0'); `actions.ts:104` (allows 0) |
| **No supplier-item preference** — MRP planned orders with null supplier_id silently skipped at PO conversion | MEDIUM | MISSING | `mrp.ts:974-988` (skip "missing supplier"); `supplier_specs` uses text code, no FK to suppliers |
| **PO aging report** (overdue buckets 0-30/31-60/61+) — dashboard shows flat overdue list (max 25), no buckets | MEDIUM | MISSING | `dashboard-data.ts:266-280`; `report-read-actions.ts:862-939` (status counts only) |
| **MRP shortage/coverage CSV export** absent (MrpView has no export) | LOW | PARTIAL | `mrp.ts:205-381` returns rows; `mrp-view.tsx` no csv/export |
| **Open-PO book (remaining qty per item)** — PO export is header-only, no line/remaining detail | MEDIUM | PARTIAL | `create-export-job.ts:38-115` (headers only); `actions.ts:150-178` computes received per line |
| **WO load vs capacity dashboard** — `capacity_plans`/`capacity_plan_lines` exist, zero app code reads them | MEDIUM | MISSING | `179-planning-capacity-rough-cut.sql:19-76`; no grep refs outside migrations |
| **Demand vs supply trend** (forecast vs actual output per week) absent | MEDIUM | MISSING | `demand_forecasts` (mig 302); `wo_outputs` aggregated separately; no comparison action |
| **Statistical forecasting from sales history** — forecasts are manual/CSV/copy-week only | MEDIUM | PARTIAL | `forecasts.ts:226-276,408-439`; `mrp.ts:29` reads manual rows |
| **Reorder auto-PO / below-min badge** — thresholds exist but warehouse never compares on-hand vs min; no live below-min view | MEDIUM | PARTIAL | `reorder-thresholds.ts`; `mrp.ts:951-1014` (manual convert only) |
| **TO aging / overdue export** absent | LOW | MISSING | `transfer_orders` (mig 263); dashboard shows max-25 overdue; `procurementSummary` shows `openToCount` only |
| **MRP run-history diff** (delta between two runs) absent | LOW | MISSING | `mrp.ts:626-666` lists runs; `mrp_requirements` holds per-run snapshots |
| **WO WIP report** (open WOs by age and line) absent | MEDIUM | MISSING | `listPlanningWorkOrders.ts` (flat list); productionSummary covers completed only |

### 2.3 Quality (09-quality)

| Gap | Sev | Status | Evidence |
|---|---|---|---|
| **6 canonical roles get ZERO quality permissions** — seed 198 matched only admin/qa_inspector/quality_lead families; dept_manager/dept_user/core_user/viewer/npd_manager locked out at a fresh org | HIGH | MISSING | `198-quality-outbox-and-rbac-seed.sql:218-222`; `080-role-permissions.sql:89-94` (no quality.* rows) |
| **CAPA from NCR is a static placeholder** — `capa_actions.source_type` supports 'ncr', wired only for complaints | HIGH | PARTIAL | `ncr-detail.client.tsx:27,382-389`; `308-complaints-capa.sql:43` (ncr in check) |
| **Critical NCR close uses single e-sign, not dualSign (SoD)** — `dualSign()` with ESignSoDError exists, never called | HIGH | PARTIAL | `ncr-actions.ts:617-628`; `packages/e-sign/src/dual.ts:17-36`; UI shows dual-sign label `ncr-close-modal.client.tsx:175` |
| **No Certificate of Analysis (CoA)** generation/download — all source data present, no route/action/table | HIGH | MISSING | `spec-detail.client.tsx:31` (out of scope); `197-...:266` allergen_profile never read; zero `coa` grep hits |
| **No Approved Supplier List (ASL) / re-qualification register** in quality | HIGH | MISSING | `162-lab-supplier.sql:96` (item-level status only); no `/quality/suppliers`; no `approval_expiry`/`next_audit_date` |
| **No lab-result write path in quality** — `lab_results` read-only from quality routes, no `/quality/lab` insert UI | HIGH | MISSING | `api/technical/lab-results/route.ts:108`; no quality INSERT; `tec-045` test refs nonexistent `/quality/lab` |
| **No environmental monitoring programme (EMP)** — ATP autofail trigger only emits outbox, no zone registry/schedule/trending/consumer | HIGH | MISSING | `187-atp-swab-autofail-trigger.sql`; no `emp_*` tables |
| **No glass / brittle-plastic / foreign-body / metal-detector register** | HIGH | MISSING | zero grep for glass/foreign_body/metal_detect/x_ray; no route |
| **No training records / competency matrix** — e-sign proves *who* signed, not that they were qualified | MEDIUM | MISSING | zero training/competency tables; no `/training` route |
| **`quality.audit.export` seeded but feature absent** — no audit-export route, no `e_sign_log` query from quality | MEDIUM | PARTIAL | `198-...:202`; `055-e-sign-log.sql`; zero app refs |
| **No sampling plan / AQL** on inspections — no sample-size logic | MEDIUM | MISSING | `272-...:128-151`; `inspection-detail.client.tsx:28-29` (out of scope) |
| **No scheduled / periodic inspection triggers** — every inspection ad-hoc; receive does not pre-create pending | MEDIUM | MISSING | no `inspection_schedules`; `api/quality/scanner/inspect/route.ts`; `inspection-actions.ts:648` |
| **Spec allergen-profile snapshot never populated on approval** — breaks Part-11 immutability | MEDIUM | PARTIAL | `197-...:266`; `approveSpec` in spec-actions.ts never writes allergen_profile |
| **Recall drill never auto-completes timed KPI** — `completed_at`/`duration_ms` not set → badge stuck "in progress" | MEDIUM | PARTIAL | `trace-actions.ts:79-80`; `recall-drills-list.client.tsx:29-32` |
| **Cold-chain UI route missing** — tables + actions + RBAC all live, no `/quality/cold-chain` page or nav card | MEDIUM | PARTIAL | `315-cold-chain-condition-checks.sql`; `cold-chain-actions.ts`; `quality/page.tsx:26-50` (10 cards, no cold-chain) |
| **Quality KPI dashboard missing** — landing shows nav cards + one count, no open-holds/overdue-NCR/pass-rate/CCP tiles | MEDIUM | MISSING | `quality/page.tsx:51`; `ncr-list.client.tsx:29-30` (KPI strip DEFERRED) |
| **Inspection-fail does not auto-create NCR** — manual navigation required | LOW | PARTIAL | `inspection-detail.client.tsx:29`; `submitInspectionDecision` no NCR insert; `197-...:224` supports reference_type='inspection' |
| **NCR bulk export / date-range filter** absent | LOW | PARTIAL | `ncr-list.client.tsx:29-30`; no CSV variant of `listNcrs` |
| **NCR/CAPA trend & Pareto dashboard** (root_cause Pareto, closure-time trend) absent | MEDIUM | MISSING | `reporting-overview.client.tsx:436-509` (4 scalar tiles); `report-read-actions.ts:768-846` |
| **Supplier quality scorecard lacks inspection/lab-result columns** — on-time/qty/NCR only | MEDIUM | PARTIAL | `freight-actions.ts:406-543`; scorecard-view has no incoming-inspection pass% / lab pass% / reject-kg |
| **Mock recall printable report** — `recall_drills.report_url`/`notes` never read/written; no download | MEDIUM | PARTIAL | `305-recall-drills.sql:18`; `drill-report-panel.tsx` (summary only) |
| **BRCGS audit-readiness pack** (one-click document bundle) absent | MEDIUM | MISSING | ingredients exist (holds/NCR retention, haccp e-sign, spec hash, e_sign_log); nothing assembles |
| **Complaint analysis report** (severity/root-cause volume, CAPA closure rate) absent | MEDIUM | MISSING | `complaint-actions.ts` per-row only; qualitySummary doesn't query complaints/capa |
| **Hold/release log CSV export** (with disposition + e-sign hash) absent | LOW | MISSING | `hold-actions.ts` returns full detail; reporting returns scalar openHolds only |
| **E-sign audit register** (qa.* intents from e_sign_log) absent — settings/audit queries only DDL audit_log | MEDIUM | PARTIAL | `e-sign.ts` schema; `audit-log-loader.ts` (audit_log only) |
| **Inspection pass-rate dashboard** (by product / reference_type / trend) absent | MEDIUM | MISSING | `inspections/page.tsx` per-row only; `272-...` has all cols |
| **CCP monitoring trend chart** (readings vs limits over time) absent | MEDIUM | MISSING | `ccp-board.client.tsx` (status tiles); `289` has measured_value/limits |
| **Lab results register & pass-rate by test type** absent in quality | MEDIUM | MISSING | `162-lab-supplier.sql`; only Technical read-only API consumes |
| **Dedicated trace/recall RBAC** — `TRACE_PERMISSION='quality.dashboard.view'` (any dashboard viewer can run recalls) | LOW | PARTIAL | `trace-actions.ts:167-168` (TODO); no `quality.trace.run`/`quality.recall.manage` seed |
| **Forward trace customersAffected always 0** — `source_so_id` never joined to SO/customer; shipment node is placeholder | MEDIUM | PARTIAL | `trace-actions.ts:69,676,648-658,106` |
| **Trace LP nodes missing expiry & QA-hold status** | LOW | MISSING | `trace-actions.ts:305-333` (no expiry/qa_status select) |
| **Recall drill schedule/calendar** (frequency vs BRCGS target, last-drill, next-due) absent | LOW | MISSING | `recall-drills/page.tsx` (flat list); no scheduled_for/frequency |

### 2.4 Technical (03-technical)

| Gap | Sev | Status | Evidence |
|---|---|---|---|
| **Batch sizing / BOM nominal qty missing** — WO qty ≠ BOM batch is not scaled; no `min/max_lot_size`/`lot_multiple` on items | MEDIUM | MISSING | `createWorkOrder.ts:218-243` (verbatim copy); zero grep for those cols; `093-formulations.sql:23` (batch_size only on formulations) |
| **Disassembly BOM `expected_yield_pct`** — mig 340 just added the col after a 42703 failure; verify applied to live | HIGH | PARTIAL | `340-bom-co-products-expected-yield-pct.sql:1-17`; `disassembly.ts:216-221`; `register-disassembly-output-modal.tsx` |
| **Multi-level BOM explosion** (recursive ingredient breakdown) absent | MEDIUM | MISSING | `detail-page.ts:229-282` (flat joins); `graph-tab.tsx:19` (multi-level out of scope) |
| **Cross-portfolio where-used** ("which FGs use ingredient X?") absent | MEDIUM | MISSING | `detail-page.ts:253-282` (per-FG parents only) |
| **Portfolio cost roll-up** (all FGs in one table) absent — single-product picker only | MEDIUM | MISSING | `cost/page.tsx`; `list-recipe-cost.ts` (one product) |
| **Allergen matrix / cascade CSV export** absent | LOW | MISSING | `allergens-config/page.tsx`; `allergens/cascade/page.tsx`; zero csv/download |
| **Compliance gap report CSV export** absent (table renders, no download) | LOW | MISSING | `compliance-dashboard.client.tsx`; zero csv/export grep |
| **Supplier-spec coverage gap report** (RM items with no approved spec) absent | MEDIUM | MISSING | `compliance/_actions`; FG-level flag only; no RM-level list |
| **Nutrition label print/export** (EU 1169 declaration) absent | MEDIUM | MISSING | `nutrition-panel.client.tsx` (no print/csv) |
| **Factory spec print / spec-sheet** absent (CoA precursor auditors ask for) | MEDIUM | MISSING | `factory-specs/review-modal.client.tsx` (no print/export) |
| **Lab results / shelf-life / traceability / BOM-diff CSV exports** absent (all data already in components) | LOW | MISSING | `lab-results-log.client.tsx`; `shelf-life/page.tsx`; `traceability.client.tsx`; `bom-version-diff.client.tsx` |
| **Recipe sheet PDF export** absent | MEDIUM | MISSING | `recipe-sheet-tab.tsx:19` (PDF out of scope) |

### 2.5 Warehouse / Scanner / Logistics (05-warehouse, scanner, 11-shipping)

| Gap | Sev | Status | Evidence |
|---|---|---|---|
| **6 canonical roles not seeded `warehouse.inventory.read`** — dept_manager/core_user/etc. get "forbidden" on /warehouse | HIGH | MISSING | `192-warehouse-...:213-237` (v_admin/v_operator arrays miss canonical roles); `shared.ts:17`; `inventory-actions.ts:20` |
| **Scanner receive-TO flow absent** — desktop `receiveTransferOrder` exists, no scanner route/API/tile | HIGH | MISSING | `home-screen.tsx:44` (receive-po only); no `/api/warehouse/scanner/receive-to`; `actions.ts:913` |
| **Cycle-count on scanner absent** — desktop module + mig 318 complete, no scanner route/API/tile | HIGH | MISSING | `home-screen.tsx:34-54`; `warehouse/counts/` desktop; `318-stock-count-adjustments.sql` |
| **Scanner pick-for-TO absent** — pick tied to WOs only; no TO dispatch action | MEDIUM | MISSING | `pick-screen.tsx:9-20` (WO only); `pick/wos/route.ts`; `actions.ts` (no dispatch) |
| **Stock valuation not surfaced anywhere** — `item_wac_state`/`inventory_cost_layers` read by zero UI | MEDIUM | MISSING | `warehouse-dashboard.client.tsx:15-22` (KPI omitted); `199-...:141`; `inventory-actions.ts:32-51` |
| **Putaway suggestion heuristic-only** — no temp-zone match, no capacity check, no config rules | MEDIUM | MISSING | `movement.ts:231-280`; `042-infra-master.sql:57-69`; `putaway/suggest/route.ts` |
| **Customer returns (RMA) absent** — `ship.rma.disposition` seeded, no table/route/scanner tile | MEDIUM | MISSING | `212-...:210`; no `customer_return`/`rma` table; no `/shipping/returns` |
| **Dock appointment not linked to PO/shipment, no scanner gate-in** | MEDIUM | MISSING | `inbound-schedule.client.tsx:27-47` (no dock col); `317-...:19-35` (no po_id/shipment_id); no gate-in tile |
| **BOL produces JSON hash, not printable PDF** — `bill_of_lading` table exists, `generateBol` never writes it | MEDIUM | PARTIAL | `ship-actions.ts:370-423`; `211-...:522-547` (real pdf_url cols unused) |
| **FEFO at desktop pick is advisory** — `warehouse.fefo.override` seeded, never checked; no override-reason audit | MEDIUM | PARTIAL | `pick/lps/route.ts:55` (scanner sorts); `192-...:194`; zero `fefo.override` in action code |
| **No outbound shipping schedule / dispatch board** — symmetric to inbound | MEDIUM | MISSING | `warehouse/inbound/page.tsx` exists; `shipments-list-view.tsx` (flat); no dispatch route |
| **Replenishment alerts not triggered from warehouse** — no on-hand vs min comparison/badge | MEDIUM | PARTIAL | `reorder-thresholds.ts`; `inventory-actions.ts:32-51` (no join) |
| **Expiry auto-quarantine / write-off absent** — manual force-block only; window hardcoded 30d | MEDIUM | PARTIAL | `expiry-actions.ts:59` (hardcoded); `expiry-dashboard.client.tsx:181`; no cron |
| **Warehouse inventory / movements CSV export** absent (only reporting has aggregate) | LOW | PARTIAL | `inventory-browser.client.tsx`; `movement-list.client.tsx`; `movements/page.tsx:87` (cap 500, no date filter) |
| **ABC analysis / slow-mover / location-utilization / cycle-count-accuracy reports** absent | MEDIUM | MISSING | `stock_moves`/`lp_state_history` exist; `locations.max_capacity`; `count_lines`; no aggregation queries |
| **Inventory snapshot history / trend** absent (point-in-time only) | LOW | MISSING | `report-read-actions.ts:409`; no snapshot history table |
| **Stock-adjustment audit/exceptions dashboard** absent (no list page, only `/new` form) | MEDIUM | MISSING | `318`+`328`; `adjustments/new/page.tsx` only |
| **Negative-stock / data-integrity exceptions panel** absent | LOW | MISSING | `warehouse-dashboard.client.tsx:32-38`; constraints prevent neg, but zero-qty-active / over-capacity not surfaced |
| **GRN / genealogy CSV exports** absent | LOW | MISSING | `grn-detail.client.tsx`; `genealogy-tree.client.tsx:22` (export DEFERRED) |
| **OTIF report** (on-time in-full) absent — `promised_ship_date`/`required_delivery_date` exist, not joined | HIGH | MISSING | `211-...:231-232`; `pack-actions.ts:367-377`; `shared.ts:213-223` (no OTIF fields) |
| **Carrier performance dashboard** absent — `carrier`/`service_level` stored, never grouped | MEDIUM | MISSING | `211-...:432-433`; `pack-actions.ts:367-377`; `report-read-actions.ts:682-708` |
| **Delivery exceptions: no UI to set `status='exception'`** — badge renders, no transition action, no reason column | MEDIUM | PARTIAL | `211-...:453`; `shipment-status-badge.tsx:20`; no `markShipmentException` |
| **Shipment weight column always "—"**; **SO required_delivery_date not surfaced** | LOW | PARTIAL | `shipments-data.ts:48-52`; `so-actions.ts:551-591` (only promised_ship_date) |
| **Customer allergen restriction gate not enforced** at allocation — `allergen_validated` always false; `ship.allergen.override` unused | MEDIUM | PARTIAL | `211-...:121,192-213,235`; `so-actions.ts:624`; `allocateSalesOrder` no check |
| **Allergen / food-safety / batch-lookup on scanner LP screen** absent | MEDIUM | MISSING | `lp-info-screen.tsx`; `movement.ts:117-200,147` (no allergen join, no batch search) |
| **Scanner label reprint, printer selection, GS1-128 decode, offline queue** absent/partial | MEDIUM | PARTIAL/MISSING | `lp-info-screen.tsx` (no reprint); `print-label/route.ts:106,111-127`; `packages/gs1` complete but unimported; `@monopilot/sync-queue` complete but unwired |
| **PWA installability** — `public/sw.js` no-op file missing from disk (tests reference it) | MEDIUM | MISSING | `sw.test.ts:96-115`; `ls apps/web/public` empty; `next.config.mjs:41` build-only |
| **Over-consume approval uses email+PIN text**, not scanner PIN keypad | LOW | PARTIAL | `consume-screen.tsx:98-99,541-567` vs reverse-consume PIN flow |
| **Pick screen doesn't show QA-hold badge** on candidates (only discovered after failed POST) | LOW | PARTIAL | `pick-screen.tsx:578-598,278` vs putaway QaBadge `putaway-screen.tsx:449` |

### 2.6 Commercial — Procurement, Sales, Suppliers, Customers (planning, shipping)

| Gap | Sev | Status | Evidence |
|---|---|---|---|
| **No AP invoice / 3-way match** (PO+GRN+invoice) — no invoice table/UI/matching | HIGH | MISSING | `actions.ts:721-728` (PO terminates at received); zero `invoice` migrations; `shared.ts:238-256` |
| **Supplier spend analytics absent** — line `unit_price` never persisted/aggregated; no spend-by-supplier | HIGH | MISSING | `po-detail-view.tsx:299` (client-only sum); `shared.ts:238-256`; `freight-actions.ts:445` |
| **Customer master edit/deactivate absent** — create-only, "View" goes nowhere, no `[id]` route | HIGH | PARTIAL | `customer-actions.ts` (only list+create); no `[id]` dir; `create-customer-modal.tsx:14-24` |
| **No per-customer pricing / price list** — `resolveSalesLinePrice` is a stub returning global `list_price_gbp` | HIGH | MISSING | `sales-line-price.ts:1-8`; `313-items-list-price.sql`; no price-list table |
| **Sales revenue reporting absent** — no revenue by customer/product/period, no gross margin, no order-book value | HIGH | MISSING | `shared.ts:213-223`; `so-actions.ts:562-581` (total_amount_gbp not in reporting) |
| **Supplier certifications & payment terms absent** from master (no BRC/IFS/Halal expiry) | MEDIUM | MISSING | `261-planning-suppliers.sql:7-26`; `supplier-detail-view.tsx:24` (omission note) |
| **No blanket / framework PO** — every PO is spot; no contract price for call-offs | MEDIUM | MISSING | `procurement-shared.ts:41-48`; `mrp.ts:996-1003`; zero blanket/contract migrations |
| **No customer SO history / detail view** — list has no `customer_id` filter | MEDIUM | MISSING | no `[id]` dir; `so-actions.ts:540-593`; `customer-list-view.tsx:62` |
| **No supplier approval workflow** — status transition is single-permission confirm, no requestor/approver split | MEDIUM | MISSING | `actions.ts:261-302`; `supplier-detail-view.tsx:63-75` |
| **Supplier scorecard limited** — no spend, price variance, trend, lead-time accuracy, reject rate | MEDIUM | PARTIAL | `freight-actions.ts:406-443` (4 KPI); `supplier-detail-view.tsx:24` |
| **Cross-supplier OTIF / lead-time table** absent (per-supplier only) | MEDIUM | PARTIAL | `scorecard-view.tsx`; `freight-actions.ts:445-543`; org-wide `avgCreatedToFirstGrnDays` only |
| **Procurement reporting has no spend value** — counts only; `avgConfirmedToFirstGrnDays` always null | MEDIUM | PARTIAL | `shared.ts:238-256,246`; `report-read-actions.ts:861-939` |
| **NPD costing target price not propagated to `list_price_gbp` on launch** | MEDIUM | PARTIAL | `promote-to-production.ts:157-165`; `compute.ts:152-157`; `sales-line-price.ts:5-7` |
| **EUR/GBP currency mismatch** — NPD costing EUR, items list_price_gbp, no FX conversion | MEDIUM | MISSING | `compute.ts:52-61`; `313-...`; `wo-cost-actions.ts:221-231` |

### 2.7 Finance (10-finance)

| Gap | Sev | Status | Evidence |
|---|---|---|---|
| **Std-vs-actual cost variance report** — `cost_variances` table + `fin.variance.view` live, queried by zero app routes | HIGH | MISSING | `199-...` (cost_variances); `292-...` (perms); zero app grep; STATUS T-026 NOT STARTED |
| **WIP / inventory valuation snapshot** — `item_wac_state`/`inventory_cost_layers` read by zero UI; `fin.valuation.view` unused | MEDIUM | MISSING | `199-...`; `report-read-actions.ts:436-510`; STATUS T-025 NOT STARTED |
| **Finance page: no period filter, no CSV export** — hardcoded `days:30` | LOW | PARTIAL | `finance/page.tsx:54`; `wo-cost-actions.ts:345-390` |
| **Material spend by supplier dashboard** absent | MEDIUM | MISSING | `262`; `193`; `report-read-actions.ts:861-939` (counts only) |
| **Cost-per-kg multi-item trend** — single-item sparkline only in technical/cost/history | MEDIUM | PARTIAL | `cost-manager.client.tsx`; no multi-item compare |
| **Scrap/waste cost report** (by WO/category/period) absent | MEDIUM | PARTIAL | `wo-cost-actions.ts:18-22`; reporting shows wasteKg only |
| **Downtime cost in WO breakdown** — downtime reduces labor, never shown as a cost line | MEDIUM | PARTIAL | `wo-cost-actions.ts:267-282` |
| **Margin analysis** (actual cost vs list price per WO) absent | MEDIUM | MISSING | `313-...`; `wo-cost-actions.ts`; no join |
| **Finance dashboard is a flat WO-cost table**, not a KPI dashboard | MEDIUM | PARTIAL | `finance/page.tsx`; STATUS T-031 ("skeleton stub") |
| **Labor cost report by WO/operator** (actual clock-in vs rated) absent — finance uses process-rate proxy, ignores `wo_labor_log` | MEDIUM | MISSING | `311`; `labor-actions.ts:229-353`; `wo-cost-actions.ts` (process rate only) |
| **Standard cost approval workflow UI** — `standard_costs` table + `fin.standard_cost.approve` live, no page/action | MEDIUM | MISSING | `199-...`; `292-...`; zero app refs; STATUS T-011/T-012 NOT STARTED |

### 2.8 OEE (15-oee)

| Gap | Sev | Status | Evidence |
|---|---|---|---|
| **Six Big Losses / heatmap / changeover / export / alert banner / date pager** — explicit backlog T-014..T-019, none built | MEDIUM | MISSING | `oee/page.tsx:10-11`; `oee-tables.tsx:9` |
| **A/P/Q factor drilldown pages** (/oee/availability,performance,quality) — `big_loss_categories` (mig 203) queried by zero routes | MEDIUM | MISSING | `T-017.json`; `203-...:230`; `oee-data.ts` |
| **OEE target-vs-actual RAG** — `oee_alert_thresholds` (target %s) never read; production dashboard uses hardcoded thresholds | MEDIUM | MISSING | `oee.ts:73`; `oee-data.ts`; `production/page.tsx:219-224` |
| **MTTR / MTBF on downtime page** — `oee_shift_metrics` MV has cols, zero app reads it | MEDIUM | MISSING | `oee.ts:209-229`; `downtime-data.ts`; cron `reporting-refresh/route.ts:88` (mv_reporting_% only) |
| **OEE trend chart** — period selector wired, only tables render | MEDIUM | PARTIAL | `oee/page.tsx:284-294`; `oee_snapshots` (mig 184) |

### 2.9 Maintenance (13-maintenance)

| Gap | Sev | Status | Evidence |
|---|---|---|---|
| **PM auto-generation cron absent** — schedules read-only, no runner reads `next_due_date` to create MWOs | MEDIUM | MISSING | `mwo-actions.ts:572-574`; no PM cron in `api/internal/cron/` |
| **MWO backlog ageing dashboard** absent | MEDIUM | MISSING | `mwo-actions.ts`; `mwo-list.client.tsx:20` (grouped/export deferred) |
| **PM compliance report** (completed-on-time/scheduled >85%) absent | MEDIUM | MISSING | `mwo-actions.ts` (listPmSchedules, no compliance calc); PRD §3.3 |
| **Calibration-due register** — `calibration_instruments`/`calibration_records` read by zero app code | MEDIUM | MISSING | `201-...`; no `/maintenance/calibration` |
| **MTBF/MTTR per machine** — `oee_shift_metrics` MV unused | MEDIUM | MISSING | `203-...:289-296`; zero grep mtbf/mttr |
| **Spare parts below-reorder register** — `maintenance_spare_parts_stock` + index unused | MEDIUM | MISSING | `201-...:269-295` |
| **Asset downtime cost report** absent (no cost attribution per asset) | MEDIUM | MISSING | `201-...`; `183-...` (downtime_events.mwo_id soft FK) |
| **Maintenance KPI tile on global dashboard / in reporting bundle** absent | MEDIUM | MISSING | `dashboard-summary.ts`; `report-read-actions.ts:971` (no maintenance) |
| **MWO + calibration-audit CSV export** absent | MEDIUM | MISSING | `mwo-list.client.tsx:20`; `201-...:390-391` (retention_until for BRCGS) |
| **Planned-vs-unplanned MWO ratio widget** absent | LOW | MISSING | `201-...:181` (source enum) |
| **Sanitation allergen audit log** — `sanitation_checklists` (dual-sign, 7yr retention) unread | MEDIUM | MISSING | `201-...:411-434` |

### 2.10 Platform — Settings, Roles, RBAC, Dashboards, Multi-Site, Notifications, Reporting

| Gap | Sev | Status | Evidence |
|---|---|---|---|
| **5 non-admin canonical roles have zero ops-module permissions** — entire sidebar gated out (see §1 point 2) | HIGH | MISSING | `080-...`; later seeds (185/192/198/199/202/203/207/212/214/258/292) target functional families; `filter-nav.test.ts:63` |
| **Settings/Roles table shows only 3 of 9 live roles** — stale `ROLE_CODES` whitelist + `isRoleCode` guard | HIGH | PARTIAL | `roles/page.tsx:74-85,98-100,231`; `133-fa-bom-view.sql` |
| **`deactivateUser` action unwired from UI** | HIGH | PARTIAL | `actions/users/deactivate.ts`; `users-screen.client.tsx:830-878` |
| **No user reactivation UI / action** | MEDIUM | MISSING | `users-screen.client.tsx`; no `reactivate.ts` |
| **npd_manager lacks all post-concept NPD stage perms** (pilot/trial/handoff/packaging/formulation) | HIGH | MISSING | `236-...:62` (v_admin_roles excludes npd_manager); `role-seed.ts` |
| **viewer & auditor cannot access Reporting** — `rpt.dashboard.view` seeded to viewer-family codes that aren't the system roles | HIGH | MISSING | `214-...:246`; `role-seed.ts` |
| **Roles permission viewer dialog shows 3 of 14 module groups** | MEDIUM | PARTIAL | `roles-screen.client.tsx:79`; `permission-catalog.ts` (14 groups); role-editor uses correct pattern |
| **No per-user site access assignment UI** — multi-site is read-only list; no user↔site map | MEDIUM | MISSING | `multi-site/page.tsx`; no `_actions`; no `user_sites` table |
| **Notification "+ New rule" is dead UI** — no `createNotificationRule` | MEDIUM | PARTIAL | `notifications/page.tsx:135`; zero grep; routes to read-only `/settings/rules` |
| **Notification channel defaults hardcoded; no dispatcher reads preferences** | MEDIUM | PARTIAL | `notifications/page.tsx:153-166`; no dispatch worker |
| **Audit viewer covers 7 DDL action types, no operational events; dept_manager no access** | MEDIUM | PARTIAL | `audit/page.client.tsx:69-77`; `150-...:95` |
| **Reporting: no saved presets / scheduled exports / PDF** — 8 of 14 rpt.* perms have no UI | MEDIUM | MISSING | `reporting/page.tsx:7-9`; `permissions.enum.ts` |
| **Scheduled/emailed report delivery** — `scheduled_export_configs` table exists, no runner | MEDIUM | PARTIAL | `213-...:143-184`; `reporting-refresh/route.ts` (MV refresh only) |
| **Users list / assignable-users no pagination** (LIMIT 50) | MEDIUM | PARTIAL | `users/page.tsx`; `users-screen.client.tsx` |
| **`settings.roles.view` not seeded to dept_manager/auditor** | MEDIUM | MISSING | `150-...:95` |
| **Multi-site table & reporting period selector hardcoded English (no i18n)** | LOW | MISSING | `multi-site/page.tsx`; `reporting/page.tsx` |
| **Role-assignment dialog shows no permission context** | LOW | PARTIAL | `users-screen.client.tsx` |
| **Post-login landing is a Polish placeholder**, no redirect to /dashboard, no role routing | HIGH | MISSING | `(app)/page.tsx:23-43` |
| **Dashboard quick-actions hardcoded for all roles** — viewer sees Create-WO/PO/Run-MRP | MEDIUM | PARTIAL | `dashboard/page.tsx:18-25`; `dashboard-summary.ts` (no perm consult) |
| **Profile page does not show user's role** | LOW | MISSING | `profile-data.ts` (no roles join) |
| **Audit log "Export filtered results" button is a no-op** | MEDIUM | PARTIAL | `audit/page.client.tsx:290-292`; no onClick/handler |
| **No plant-manager / role-personalised / company-KPI / exceptions-digest / module dashboards** — main /dashboard is 5 fixed KPIs for everyone; quality/maintenance/shipping/multi-site landings are nav hubs or flat lists, not KPI dashboards | MEDIUM | MISSING/PARTIAL | `dashboard/page.tsx`; `quality/page.tsx:57`; `maintenance/page.tsx`; `shipping/page.tsx`; `multi-site/page.tsx`; prototype QA-001/MNT-001/FIN-001/SHIP-022 specs |
| **No "My Tasks / Pending Approvals" inbox** for any role | MEDIUM | MISSING | `dashboard/page.tsx` (org-wide only) |
| **Lot-level cross-module search siloed** — technical/traceability and quality/trace are separate, no "trace this LP" deep-link from LP/WO detail | MEDIUM | PARTIAL | `technical/traceability/page.tsx`; `quality/trace/page.tsx`; `license-plates/[lpId]/page.tsx` |

### 2.11 NPD (01-npd)

| Gap | Sev | Status | Evidence |
|---|---|---|---|
| **Pipeline funnel / stage-gate conversion dashboard** absent — outbox `npd.gate.advanced` never read | MEDIUM | MISSING | `pipeline-tabs.tsx:257-283`; `217-...:72`; `003-outbox.sql` |
| **Stage-gate cycle-time report** (avg days per gate) absent; **time-to-market KPI uses created_at proxy** (no `launched_at`) | MEDIUM | MISSING/PARTIAL | `085-...:27`; `pipeline-tabs.tsx:260,274`; `gate-helpers.ts:389` |
| **Cross-project costing roll-up / margin comparison** absent | MEDIUM | MISSING | `087-costing.sql`; `costing/page.tsx` (single project); `formulations/page.tsx` |
| **Per-project launch-readiness matrix** (all projects × C1-C7) absent | MEDIUM | PARTIAL | `gate-checklist-panel.tsx`; `evaluate.ts`; `get-launch-alerts.ts` (per-project only) |
| **Gate-approval audit log** (cross-project, exportable) absent | MEDIUM | MISSING | `085-...:60-76`; `approval-history-timeline.tsx` (per-project); reporting has no NPD |
| **Pipeline CSV export** absent (only BOM export exists) | LOW | MISSING | `bom-export-csv.ts`; `pipeline-tabs.tsx` (no export) |
| **Owner workload view** (projects per owner by gate) absent | LOW | MISSING | `085-...:14`; `list-projects.ts` |
| **Department blocked-FA drilldown** absent (perDept rows not clickable) | LOW | MISSING | `npd/page.tsx`; `get-dashboard-summary.ts:116-183`; `106-...:17` |
| **Formulation version comparison** UI absent — `compare-versions.ts` has no consumer | LOW | PARTIAL | `compare-versions.ts`; `formulations/page.tsx` |
| **Configurable launch-alert / costing-margin thresholds** — read from Reference.AlertThresholds, no settings UI | LOW | PARTIAL | `get-launch-alerts.ts:53-57`; `087-costing.sql` |

---

## 3. PER-ROLE Missing Functionality

For each of the 6 seeded roles: what they cannot do today but should. The dominant cross-cutting fact is the **RBAC seed gap** — at a fresh org, only `admin` has reach beyond NPD. Everything below assumes that gap is read literally from the migrations.

### 3.1 `admin`
Admin has the broadest reach (mig 332 made admin a full super-user, 282→306 perms) but is blind to **value/insight** and **documents**:
- **Cannot** produce a std-vs-actual cost variance report, inventory valuation, material spend-by-supplier, revenue/margin report, or labor-cost report (all backends or data exist, no UI).
- **Cannot** generate any document: no CoA, no real BOL PDF, no recipe-sheet PDF, no audit-readiness pack, no LP label (ZPL/PDF stub), no working audit-log CSV export (button is a no-op).
- **Cannot** auto-generate PM MWOs (no cron), auto-quarantine expired stock, or schedule/email report digests (`scheduled_export_configs` has no runner).
- **Cannot** see core_user/dept_manager/dept_user rows in Settings→Roles (stale whitelist), deactivate/reactivate users from the UI, or review a role's full permissions (dialog shows 3 of 14 groups).
- **Cannot** configure OEE targets, scheduler parameters, per-site overrides, QC inspection templates, or most thresholds (mass-balance warn, near-expiry days, count variance, catch-weight tolerance) despite DB keys/tables existing.
- **Cannot** see a plant-manager cross-module dashboard, an exceptions digest, or a pending-approvals inbox.

**One-line:** Admin can run the plant transactionally but cannot see cost/variance/revenue insight, generate any compliance document, automate PM/expiry/digests, or self-manage roles/users/thresholds from the UI.

### 3.2 `npd_manager`
- **Cannot** open pilot/trial/handoff/packaging/formulation NPD stages — those permissions (mig 236) were seeded only to v_admin_roles, which excludes npd_manager. Effectively limited to `settings.org.read` + released-product-edit request/authorize.
- **Cannot** access Reporting (`rpt.dashboard.view` not granted) or Technical (`technical.sensory.read` not granted) — both core to BOM approval and compliance review.
- **Cannot** view the quality module at a fresh org (zero quality.* from the canonical seed), so cannot see specs or holds on NPD product batches.
- **Cannot** see a pipeline funnel, stage-gate cycle times, cross-project margin roll-up, launch-readiness matrix, gate-approval audit, owner workload, or export the pipeline — all NPD reporting is per-project only.
- **Cannot** rely on the NPD-agreed sell price reaching production: `target_price_eur` is never propagated to `items.list_price_gbp` on launch, and EUR/GBP is never reconciled.

**One-line:** The NPD Manager role can browse concept-stage projects but is permission-locked out of post-concept NPD stages, Technical, Quality, and Reporting, and has no cross-project pipeline analytics.

### 3.3 `core_user`
- **Cannot** reach the warehouse module (no `warehouse.inventory.read`) or the quality module (no quality.* from canonical seed) at a fresh org.
- **Cannot** author technical items/BOMs needed for formulation work — mig 207 technical.* went to technical-family roles, not core_user; the Technical sidebar item is hidden and item-master writes 403.
- **As planner:** scheduler proposals ignore line capacity; no drag-and-drop override; MRP has no capacity awareness; MRP→PO lines come out at unitPrice=0; batch/lot-size rounding not enforced; no statistical forecast; planned orders with null supplier silently skipped.
- **As procurement/CSR:** no 3-way invoice match (AP done outside the system); customer records can't be edited after creation; no blanket-order framework; no customer SO history.
- **Cannot** use scanner receive-TO, scanner cycle-count, or scanner pick-for-TO.

**One-line:** The cross-functional core_user is locked out of Warehouse/Quality/Technical at a fresh org, and even when unlocked faces a capacity-blind scheduler, zero-priced MRP POs, no invoice matching, and no editable customer master.

### 3.4 `dept_manager`
The most operationally damaged role — responsible for line quality, approvals, and reporting, yet granted only `npd.dashboard.view` + two NPD flags at the canonical seed.
- **Cannot** create holds, view/close NCRs, monitor CCP deviations, release holds, or sign allergen changeovers — no quality.* or production sign-off permissions seeded; the production page itself 403s (gated on `production.oee.read`).
- **Cannot** access Warehouse (no `warehouse.inventory.read`), see inventory valuation, replenishment alerts, the outbound schedule, FEFO-override audit, or customer returns.
- **Cannot** create rework WOs from a hold disposition; see QA results inline on a WO; view per-step operation progress; see over-produced WOs at a glance; compare BOM std vs actual cost; configure scheduler/OEE/thresholds.
- **Reporting blind spots:** no spend-by-supplier, no revenue-by-customer, no gross margin, no PO aging, no OTIF, no carrier performance, no maintenance KPIs, no schedule adherence — reporting is counts-only.
- **Cannot** view the roles list (`settings.roles.view` admin-only), access the audit log, or see a pending-approvals inbox of items awaiting their sign-off.

**One-line:** The department manager — the plant's approver and reporting consumer — has no path to release holds, approve deviations, view inventory, or pull any value/OTIF/maintenance report without an admin granting non-canonical role codes.

### 3.5 `dept_user`
The shop-floor operator — granted only NPD flags at the canonical seed.
- **Cannot** perform CCP monitoring, record inspection results, or use the scanner inspect route (gated on `quality.inspection.execute`, not held).
- **Cannot** access Warehouse read (no `warehouse.inventory.read`).
- **Cannot** sign off individual operations (mix/cook/pack) — no per-operation checklist on the WO detail.
- **Cannot** complete pre-start line clearance — no checklist enforced before WO start.
- **Cannot** see QA results on the WO detail (tab always empty).
- **On the scanner:** no receive-TO, no cycle-count, no pick-for-TO, no label reprint, no allergen flag on LP info, no batch-number lookup, no offline queue; over-consume approval forces typing an email on a noisy floor; pick candidates don't show QA-hold until after a failed POST; PWA not installable (missing sw.js).
- **Cannot** see a scanner-focused or current-WO home — the dashboard shows generic ops KPIs and never links to /scanner/home.

**One-line:** The operator cannot do quality monitoring, see QA status, sign off process steps, or use the scanner for transfers/counts/offline work — and is locked out of warehouse read entirely at a fresh org.

### 3.6 `viewer`
Read-only stakeholder (auditor/board) — granted only `npd.dashboard.view`.
- **Cannot** access Reporting (`rpt.dashboard.view` seeded to viewer-family codes that are not the `viewer` system role), Quality dashboard, Warehouse, or any operational module — the sidebar shows Dashboard + NPD only.
- **Cannot** see revenue, cost variance, supplier spend, OEE trend/Six Big Losses, over-production flags, or any value-oriented view — all absent system-wide and unreachable for viewer.
- **Cannot** view the roles list, and the dashboard offers them write quick-actions (Create WO/PO) that 403.
- **Cannot** export anything (no `rpt.export.csv`), which is the natural auditor need.

**One-line:** The viewer role can see almost nothing — not even read-only reporting or quality status — and is offered write buttons it cannot use; it needs read+export grants and value-oriented dashboards that don't yet exist.

> **Note on the 7th role (`auditor`)** referenced by the platform cluster: it holds only `settings.audit.read`, cannot reach Reporting or the roles list, and the audit viewer surfaces 7 DDL action types but no operational events and no working export. Same shape as viewer's exclusion problem.

---

## 4. BUILDABLE NOW (no owner decision, ready to dispatch)

These are small/medium items with **no owner decision required**, **data/backends already present**, **no fa→FG, no D365**. Ordered roughly by value-per-effort. Each is a clean, single-lane brief.

| # | Title | Module | Effort | Scope (one line) | Key evidence |
|---|---|---|---|---|---|
| 1 | **Seed quality.* to canonical roles** | quality/RBAC | S | Migration granting `quality.dashboard.view`/`hold.create`/`ncr.create`/`inspection.execute` to dept_manager/dept_user/core_user; dashboard.view to viewer | `198-...:218-222`; `080-...:89-94` |
| 2 | **Seed `warehouse.inventory.read` to canonical roles** | warehouse/RBAC | S | Migration granting warehouse read (+ optional stock.move to dept) to the 5 non-admin roles | `192-...:213-237` |
| 3 | **Seed NPD stage perms to npd_manager** | settings/RBAC | S | Migration adding pilot/trial/handoff/packaging/formulation perms (+ rpt.dashboard.view, technical.sensory.read) to npd_manager | `236-...:62`; `role-seed.ts` |
| 4 | **Seed reporting/roles-view to viewer & auditor** | reporting/RBAC | S | Migration granting `rpt.dashboard.view` (+ export to auditor) and `settings.roles.view` to viewer/auditor | `214-...:246`; `150-...:95` |
| 5 | **Wire `deactivateUser` + add reactivate** | settings/users | S | Add Deactivate/Reactivate buttons + `reactivate.ts` mirror; show inactive toggle | `actions/users/deactivate.ts`; `users-screen.client.tsx:830-878` |
| 6 | **Roles dialog: use full PERMISSION_GROUPS** | settings/roles | M | Replace hardcoded 3-group const with `permission-catalog.ts` import (role-editor already does it) | `roles-screen.client.tsx:79` |
| 7 | **Settings→Roles: DB-driven role list** | settings/roles | M | Drop ROLE_CODES whitelist/isRoleCode guard; query roles by org (no list filter) | `roles/page.tsx:74-85,98-100,231` |
| 8 | **QA results tab read-model** | production | S | Join `quality_inspections`/`quality_holds` on wo_id in get-work-order-detail; render rows | `get-work-order-detail.ts:15,678` |
| 9 | **Cold-chain UI route + nav card** | quality | S | `/quality/cold-chain` page calling existing `listProductTempRanges`+condition checks; add nav card | `315-...`; `cold-chain-actions.ts`; `quality/page.tsx:26-50` |
| 10 | **Quality KPI dashboard tiles** | quality | M | `getQualityDashboard`: open holds, overdue NCRs, 30d pass rate, open CCP deviations; tiles on landing | `quality/page.tsx:51`; `ncr-list.client.tsx:29-30` |
| 11 | **Spec allergen-profile snapshot on approve** | quality | S | In `approveSpec`, snapshot allergen cascade into `quality_specifications.allergen_profile`; render card | `197-...:266`; spec-actions.ts |
| 12 | **Recall drill auto-complete + duration** | quality | S | Set `completed_at`/`duration_ms` after trace in `startRecallDrill`; badge then works | `trace-actions.ts:79-80`; `recall-drills-list.client.tsx:29-32` |
| 13 | **Inspection fail → auto-NCR** | quality | S | On `decision='fail'`, insert NCR (reference_type='inspection'); return number for deep-link | `inspection-detail.client.tsx:29`; `197-...:224` |
| 14 | **CAPA-from-NCR wire** | quality | M | Mount complaints `CapaPanel`/actions on NCR detail with `source_type='ncr'` | `ncr-detail.client.tsx:382-389`; `308-...:43` |
| 15 | **Critical NCR dualSign (SoD)** | quality | M | Replace single `signEvent` with `dualSign()`; collect 2 credentials when severity='critical' | `ncr-actions.ts:617-628`; `packages/e-sign/src/dual.ts` |
| 16 | **Quality audit-export (e_sign_log qa.*)** | quality | M | `/quality/audit-export` CSV of `e_sign_log` intent LIKE 'qa.%'; gate `quality.audit.export` | `198-...:202`; `055-...` |
| 17 | **Quality lab-result write path** | quality | M | `/quality/lab-results` + `createLabResult` INSERT; proxy technical POST stub | `api/technical/lab-results/route.ts:108` |
| 18 | **Std-vs-actual cost variance page** | finance | M | `/finance/variances` reading existing `cost_variances` joined to WO/items; gate `fin.variance.view` | `199-...`; `292-...` (live, zero readers) |
| 19 | **Inventory valuation page** | finance/warehouse | M | `/finance/valuation` (or warehouse pivot) joining LPs to `item_wac_state`; total value | `199-...:141`; `warehouse-dashboard.client.tsx:19` |
| 20 | **Finance period filter + WO-cost CSV export** | finance | S | Add period searchParams + `exportWoCostsCsv` (mirror reporting pattern) | `finance/page.tsx:54`; `wo-cost-actions.ts:345-390` |
| 21 | **Material spend by supplier** | finance/reporting | M | `SUM(qty*unit_price)` grouped by supplier; spend tile on finance/reporting/scorecard | `262`; `shared.ts:238-256` |
| 22 | **Revenue & margin summary** | reporting/shipping | M | `revenueSummary`: SUM(total_amount_gbp) by customer/item + gross margin tile | `shared.ts:213-223`; `so-actions.ts:562-581` |
| 23 | **Over-production list badge + filter + KPI** | production | S | Add column/filter chip on WO list + dashboard tile from `over_production_flagged` | `336-...`; `list-work-orders.ts:252` |
| 24 | **Production WO-list CSV export** | production | S | Export button calling existing `exportProductionSummaryCsv`; gate `production.oee.read` | `production/wos/page.tsx`; `report-read-actions.ts:353` |
| 25 | **Mass-balance reconciliation tab** | production | M | WO-detail tab: consumed vs output vs waste, balance gap, yield% | `output-screen.tsx:82`; reads existing consume/output/waste logs |
| 26 | **OEE target-vs-actual RAG + trend** | oee | S/M | Read `oee_alert_thresholds`, add delta badge + RAG; aggregate snapshots for a trend line | `oee.ts:73`; `oee-data.ts`; `oee/page.tsx:284-294` |
| 27 | **OEE Six Big Losses + MTTR/MTBF tiles** | oee | M | Pareto from downtime+big_loss_categories; MTTR/MTBF from downtime_events; refresh oee MVs in cron | `203-...:230`; `oee.ts:209-229`; `reporting-refresh/route.ts:88` |
| 28 | **Schedule adherence report** | production/reporting | M | Read `v_mv_reporting_schedule_adherence`; on-time start/complete %, avg lateness per line | mig 213/221 |
| 29 | **Maintenance KPI tiles + reporting bundle + backlog/PM-compliance** | maintenance | S/M | Add open-MWO/overdue-PM tiles to global dashboard; `maintenanceSummaryCore`; backlog ageing + PM compliance queries | `dashboard-summary.ts`; `report-read-actions.ts:971`; `mwo-actions.ts:572` |
| 30 | **Calibration/spares/sanitation registers** | maintenance | M | Read-only `/maintenance/calibration`, `/maintenance/spares`, `/maintenance/sanitation` over existing tables + CSV | `201-...:269-295,390-391,411-434` |
| 31 | **PO aging + cross-supplier OTIF + spend** | planning/reporting | S/M | `getPOAgingReport` buckets; `listSupplierOtif`; spend tile (unit_price already on lines) | `dashboard-data.ts:266`; `freight-actions.ts:445`; `262` |
| 32 | **MRP / TO / WO CSV exports** | planning | S/M | Export buttons on MRP view, TO list, WO list (mirror PO `create-export-job.ts`) | `mrp-view.tsx`; `to-list-view.tsx`; `wo-list-view.tsx` |
| 33 | **MRP→PO last-price lookup** | planning | S | In `convertPlannedToPo`, query most-recent completed PO line price per (supplier,item); fall back to 0 | `mrp.ts:997` |
| 34 | **Customer master edit + detail + SO history** | shipping | M | `updateCustomer` + `[id]` route with order summary; `customer_id` filter on listSalesOrders | `customer-actions.ts`; no `[id]` dir |
| 35 | **NPD target price → list_price_gbp on promote** | npd/shipping | S | In `promoteToProduction`, copy approved `target_price_eur` to `items.list_price_gbp` + audit | `promote-to-production.ts:157-165` |
| 36 | **NPD pipeline funnel + cycle-time + costing roll-up + readiness matrix + gate audit + CSV** | npd | S/M | Several read-only actions over `npd_projects`/outbox/`costing_breakdowns`/`gate_approvals`; pipeline analytics tab + CSV | `pipeline-tabs.tsx`; `217-...:72`; `087-...`; `085-...:60-76` |
| 37 | **Technical CSV/print exports** (allergen matrix, cascade, lab results, shelf-life, traceability, BOM diff, compliance) | technical | S | Add `downloadCsv` buttons to components that already hold the data; print routes for nutrition label + factory spec | per-component evidence in §2.4 |
| 38 | **Multi-level BOM explosion + portfolio cost roll-up + where-used + supplier-spec coverage** | technical | M | Recursive CTE explosion page; all-FG cost table; cross-portfolio where-used; RM spec-coverage list | `detail-page.ts:229-282` |
| 39 | **Warehouse inventory/movements/GRN/genealogy CSV + stock-adjustment list + valuation export** | warehouse | S/M | Export buttons (data already loaded); `/warehouse/adjustments` list; FIFO valuation CSV | `inventory-browser.client.tsx`; `318`/`328`; `199-...` |
| 40 | **Warehouse value reports** (ABC, slow-mover, location-utilization, cycle-count-accuracy, exceptions panel) | warehouse | M | Read-only aggregations over stock_moves/lp_state_history/count_lines/locations | §2.5 evidence |
| 41 | **Scanner receive-TO + cycle-count + pick-for-TO** | scanner | M/L | Clone receive-po / pick flows; new API routes calling existing desktop actions; home tiles | `home-screen.tsx:44`; `actions.ts:913`; `warehouse/counts/` |
| 42 | **Scanner LP: allergen badge, batch lookup, label reprint, QA-hold on pick, GS1 decode, PWA sw.js** | scanner | S/M | Targeted small fixes; allergen join, batch-search path, reprint button, parse gs1, 3-line public/sw.js | §2.5 evidence |
| 43 | **OTIF + carrier performance + shipment weight + required_delivery_date + delivery-exception filter** | shipping | S/M | Join existing cols (promised/required dates, carrier, box weights) into list/summary; exception filter | `211-...:231-232,432-435`; `pack-actions.ts:367` |
| 44 | **Shipment/SO CSV export + status board + outbound dispatch schedule** | shipping | S/M | Export buttons; status swimlane board; outbound schedule mirroring inbound | `so-list-view.tsx:21`; `shipments-list-view.tsx` |
| 45 | **FEFO-override audit at desktop consume** | warehouse/production | M | Detect non-FEFO LP in consume action, require reason, record audit; gate `warehouse.fefo.override` | `pick/lps/route.ts:55`; `192-...:194` |
| 46 | **Wire audit-log "Export filtered results"** | settings/audit | M | `exportAuditLogCsv` (uncapped same query), wire the existing dead button | `audit/page.client.tsx:290-292` |
| 47 | **Dashboard quick-actions + landing redirect + profile role + scanner-focused home** | platform | S/M | Filter quick-actions by permission; redirect / → /dashboard (scanner roles → /scanner/home); show role on profile | `dashboard/page.tsx:18-25`; `(app)/page.tsx:23-43`; `profile-data.ts` |
| 48 | **Trace polish** (CSV export, customer linkage, LP expiry/QA-hold cols, "trace this LP" deep-links) | quality/trace | S/M | Export action; join source_so_id→SO/customer; add expiry/status to LP nodes; deep-link buttons | `trace-actions.ts:69,305-333,676`; LP/WO detail |
| 49 | **NCR/CAPA + complaint + inspection-pass-rate + CCP-trend + supplier-quality dashboards** | quality | M | Read-only analytics actions + charts over existing tables | §2.3 evidence |
| 50 | **Threshold settings UIs** (near-expiry days, count-variance %, OEE targets, BOM-flag wiring) | settings | S/M | Numeric settings cards writing existing feature_flags keys / oee_alert_thresholds | `so-actions.ts:159`; `count-actions.ts:40`; `oee.ts:73` |

---

## 5. Owner-Decision-Needed (do NOT build without sign-off)

These require a product decision before building. Grouped by the decision needed.

**Scope / data-model decisions**
- **Per-customer pricing model** — tiered vs customer-specific price list; new `customer_price_lists` table. (`sales-line-price.ts`)
- **AP invoice / 3-way match** — matching tolerance + approval workflow; new `ap_invoices`/`ap_invoice_lines`. (`actions.ts:721`)
- **Blanket / framework POs** — contract approval workflow; new `purchase_contracts` + line FK. (`procurement-shared.ts:41`)
- **Supplier-item preference** — multi-supplier priority vs split; new `supplier_item_preferences`. (`mrp.ts:974`)
- **Batch sizing / lot-size rounding** — scaling rules for by-products; add `nominal_batch_qty` to bom_headers, `min/max_lot_size`/`lot_multiple` to items. (`createWorkOrder.ts:218`)
- **Customer returns (RMA)** — return-to-supplier vs return-to-stock, credit-note scope; new `customer_returns`. (`212-...:210`)
- **CoA template** — PDF vs HTML, mandatory fields, storage vs on-demand. (`spec-detail.client.tsx:31`)
- **Approved Supplier List ownership** — quality vs technical, re-qualification period; extend `supplier_specs` vs new `supplier_qualification_events`. (`162-...:96`)
- **Environmental Monitoring Programme** — ATP-only vs full micro EMP; new `emp_zones`/`emp_schedules`/`emp_results`. (`187-...`)
- **Glass / foreign-body register** — glass register vs detector log vs both. (no table)
- **Training records / competency** — in-scope vs HR-system integration. (no table)
- **Sampling plan / AQL** — build ISO-2859 tables in-app vs external. (`272-...:128`)
- **Periodic inspection triggers** — trigger point (GRN-receive vs put-away vs manual); new `inspection_frequency_rules`. (`inspection-actions.ts:648`)
- **QC inspection templates** — new `qc_inspection_templates` + which reference types. (`272-...:134`)
- **Per-site override settings** — RLS strategy for `site_settings`; per-user vs per-role site scoping (and the `user_sites` map). (`203-...:101`; `multi-site/page.tsx`)
- **Standard cost approval workflow** — draft/approve lifecycle UI over `standard_costs`. (`199-...`)
- **Shift handover** — new `shift_handovers` table + interactive shift screen. (`shifts/page.tsx`)

**Policy / threshold decisions**
- **Pre-start line clearance checklist** — line-level vs product-level, mandatory vs advisory; new `pre_start_checklists` + gate in start-wo. (`start-wo.ts`)
- **WO operations sign-off** — all-ops-done gates WO-complete vs informational; add `status` to wo_operations. (`176-...`)
- **PM cron** — lead_days, calendar/shift awareness. (`mwo-actions.ts:572`)
- **Expiry auto-quarantine** — at-expiry vs N-days-before. (`expiry-actions.ts:59`)
- **Customer allergen restriction gate** — 'refuses' = hard block vs dual-sign override. (`so-actions.ts:624`)
- **Over-consume approval UX** — PIN-only keypad vs email+PIN. (`consume-screen.tsx:98`)
- **Signoff policies catalog** — which WO/quality lifecycle approvals become org-configurable. (`signoff/page.tsx:59`)
- **Notification rules + digest schedule + channel default opt-in/opt-out + dispatcher infra** — what events, what channels, Edge Function vs external. (`notifications/page.tsx:135,153`)
- **Scheduled-export runner** — delivery channels (email/webhook/storage). (`213-...:143`)
- **Audit viewer operational events** — which event types, dept-scoped view for dept_manager. (`audit/page.client.tsx:69`)
- **Reporting presets/schedules roadmap** — prioritise vs disable the 8 unused rpt.* perms. (`reporting/page.tsx:7`)
- **Role-personalised dashboard / scanner role tile filter / canonical-role permission matrix** — the exact per-role grant matrix and personalisation rules. (`dashboard-summary.ts`; `home-screen.tsx:31`; `080-...`)
- **NPD `launched_at`** — confirm 'Launched' gate definition. (`pipeline-tabs.tsx:260`)
- **Dedicated trace/recall RBAC** — who can run trace vs manage recalls. (`trace-actions.ts:167`)

**Document-engine decisions**
- **BOL / LP label / recipe-sheet / audit-pack PDF** — PDF engine (Puppeteer / @react-pdf / Labelary/ZPL bridge) vs print-optimised HTML; printer integration model for scanner labels. (`ship-actions.ts:370`; `printers.ts:284`; `recipe-sheet-tab.tsx:19`)

**Currency / costing decisions**
- **EUR/GBP reconciliation** — single reporting currency vs org FX-rate table + conversion helper. (`compute.ts:52`)
- **Mass-balance / margin / std-cost data** — these reports are buildable, but margin needs `list_price_gbp` populated (owner data entry, not a code gap). (`finance/...`)

**Larger UI efforts (decision on approach/library)**
- **Scheduler drag-and-drop** — UI library choice (manual override modal is buildable without it). (`scheduler-board-view.tsx:15`)
- **Scanner offline mutation queue** — which POSTs are safe to queue/replay. (`sync-queue`)
- **MRP run-history diff / capacity (RCCP) / WO-load dashboard** — surface-only warning vs auto-split; whether to write `capacity_plan_lines`. (`mrp.ts`; `179-...`)

---

*End of report. All findings are grounded in the cited code; "buildable now" items in §4 require no owner decision and (except the seed migrations) no new tables.*

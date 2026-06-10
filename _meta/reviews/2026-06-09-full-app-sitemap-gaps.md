# MonoPilot — pełna mapa stron i inwentarz braków (2026-06-09)

Audyt read-only całej aplikacji, ekran po ekranie, vs prototypy (`prototypes/MONOPILOT-SITEMAP.html`
+ per-module JSX). Uzupełnia: `2026-06-09-frontier-audit-report.md` (NPD + Technical szczegółowo).

Legenda: ✅ FULL (realne dane + działające akcje) · ⚠️ PARTIAL · ⬜ PLACEHOLDER (stub/landing) · ❌ MISSING (brak route)

---

## 0. Bilans całej aplikacji

| Moduł | Ekrany wg prototypu | Zaimplementowane | Placeholder | Brakujące |
|---|---:|---:|---:|---:|
| Settings | ~120 | ~95 ✅ | ~25 | — (osobny audyt, FUNCTIONAL) |
| NPD | ~36 | ~32 ✅ | 2 deferred (D365, Config) | 2 |
| Technical | ~33 | ~10 ✅/⚠️ | ~15 stubów | ~8 |
| Dashboard | 1 (bogaty) | ⚠️ partial | — | KPI/akcje/timeline/alerty |
| Auth | 5 | 3 ✅ | — | 2 (signup, reset) |
| Planning | 12 | 0 | 1 | 11 |
| Scheduler (planning-ext) | 10 | 0 | 1 | 9 |
| Warehouse | 8 | 0 | 1 | 7 |
| Scanner | 12 | 0 | 0 (dev harness) | 12 |
| Production | 10 | ⚠️ 1 | 0 | 9 |
| Quality | 21 | 0 | 1 | 20 |
| Shipping | 23 | 0 | 2 | 21 |
| Finance | 17 | 0 | 1 | 16 |
| Reporting | 16 | 0 | 1 | 15 |
| Maintenance | 16 | 0 | 1 | 15 |
| Multi-Site | 16 | 0 | 1 | 15 |
| OEE | 16 | 0 | 1 | 15 |
| **RAZEM (bez Settings/NPD/Technical)** | **~183** | **~4 partial** | **~11** | **~167** |

**Najważniejsze odkrycie:** baza danych jest DUŻO dalej niż UI. Wiele modułów ma gotowe tabele
i nawet działające API, ale zero ekranów:

- **Production**: 8 działających endpointów WO (start/pause/resume/cancel/complete/close/outputs/waste
  pod `apps/web/.../work-orders/[id]/*/route.ts`) — **nieosiągalnych, bo nie ma strony WO detail**.
  Tabele: work_orders (mig 176), wo_waste_log + downtime_events (183), changeover + oee_snapshots (184).
  Brak tylko: wo_material_consumption, wo_outputs.
- **Shipping**: migracja 211 ma KOMPLET tabel (customers, sales_orders, inventory_allocations,
  waves, pick_lists, shipments, shipment_boxes, bill_of_lading, funkcje generate_sscc()) — zero UI.
- **Quality**: mig 197 ma quality_holds, ncr_reports, quality_specifications — zero UI.
- **Planning**: migi 176–179 mają work_orders, wo_materials/operations, schedule_outputs, MRP — zero UI.
- **Scheduler**: mig 204 ma scheduler_runs/assignments/config, changeover_matrix — zero UI.
- **Warehouse**: migi 191/193 mają license_plates, grns, stock_moves, lp_state_history — zero UI.
  Brak: lp_genealogy (ltree), lp_reservations.
- **Reporting**: migi 213–214 mają 7 zmaterializowanych widoków + seed uprawnień — zero UI.

Czyli „dorobienie ekranów" dla Production/Shipping/Quality/Planning to w dużej mierze praca
UI + Server Actions na istniejącym schemacie — nie green-field.

---

## 1. AUTH (3/5)

| Ekran | Route | Status |
|---|---|---|
| Login | /[locale]/login | ✅ (Supabase signInWithPassword) |
| Forgot password | /login/forgot-password | ✅ |
| MFA challenge | /login/mfa | ✅ (aal2) |
| **Sign Up** | /signup | ❌ MISSING — brak rejestracji + provisioning orga |
| **Reset password (z linku)** | /reset-password | ❌ MISSING — brak formularza nowego hasła |
| SSO/SAML | — | przycisk "Coming soon" (disabled), API logout istnieje |
| Org switcher | — | ❌ brak UI (SiteCrumb tylko wyświetla nazwę) |

## 2. DASHBOARD (⚠️ partial)

Działa: `getOrgSummary()` — 6 metryk z RLS. Brakuje vs prototyp:
- 5 kart KPI (Active WOs, Pending POs, Low Stock, Quality Holds, Today's Shipments)
- pasek 6 quick actions (Create WO/PO, Receive, QC, Shipment, MRP)
- timeline aktywności, panel alertów systemowych, auto-refresh 30 s

## 3. SHELL / NAWIGACJA — przekrojowe braki

- **RBAC nawigacji niegated (UI-128)** — każdy zalogowany widzi WSZYSTKIE moduły;
  `permission_key: null` w całym module-registry.ts.
- **Brak stron 404 / error.tsx** — żadnego user-facing error boundary w shellu.
- **Brak konwencji empty-state** — strony renderują się bez sprawdzania danych.
- **Brak dzwonka powiadomień** w topbarze; search jest readonly (atrapa).
- Karty nawigacyjne dashboardu Production linkują do nieistniejących route'ów
  (/production/wos, /downtime, /waste, /changeover, /shifts, /analytics) — **6 martwych linków**.

## 4. PLANNING — 1 stub / 11 brakujących

Brakujące ekrany: Suppliers (+detail), Purchase Orders (+detail +import), Transfer Orders
(+detail), Work Orders (+detail +Gantt), MRP.
Schema: ✅ work_orders, wo_materials, wo_operations, schedule_outputs, mrp_* (migi 176–179).
Brak tabel: purchase_orders, transfer_orders, suppliers, wo_material_reservations, planning_settings.
Martwe guziki na stubie: Create PO / Create WO / Create TO / Run MRP.

## 5. SCHEDULER (planning-ext) — 1 stub / 9 brakujących

Brakujące: Runs, Pending Assignments, Capacity, Forecasts, Changeover Matrix,
Allergen Sequencing, What-If (P2), Optimizer Rules, Settings.
Schema: ✅ scheduler_runs/assignments/config + changeover_matrix (mig 204).
Brak: demand_forecasts, forecast_actuals, scenarios, matrix drafts/review.

## 6. WAREHOUSE — 1 stub / 7 brakujących

Brakujące: License Plates (lista+detal), Stock Movements, Inventory Browser, Genealogy,
GRN workflow, Layout. Stub landing liczy tabelę `lot` (placeholder Wave 0), nie license_plates.
Schema: ✅ license_plates, grns+grn_items, stock_moves, lp_state_history (migi 191/193).
Brak: **lp_genealogy (ltree — krytyczne dla traceability)**, lp_reservations, shelf_life_rules.

## 7. SCANNER — 0 ekranów / 12 brakujących

Istnieje tylko dev harness `/scanner/dev` + ScannerFrame scaffold. Brak: Home/launcher,
Receive PO, Move LP, Putaway, Consume to WO, Output, Pick, Pack, Transfer, Login PIN,
wybór Site/Line/Shift. Zero scanner-API (login/lookup/receive...), zero tabel
(scanner_sessions, scanner_audit_log, scanner_devices).
**Blocker decyzyjny B3:** osobny workspace apps/scanner vs route-group w apps/web — niepodjęte.

## 8. PRODUCTION — 1 partial / 9 brakujących

Dashboard ⚠️ renderuje KPI + listę WO, ale 6 kart nav → martwe linki.
**8 endpointów WO działa, brak UI które by je wywołało** (brak strony
/production/work-orders/[id]). Brakujące ekrany: WO Execution detail (+taby Consumption/
Output/Waste/Genealogy/History), Operations, Material Consumption, Output Registration,
Yield Dashboard, Waste Tracking, Shift Management, Downtime, Analytics, Changeover.
Schema braki: wo_material_consumption (T-002), wo_outputs (T-003) — 2 tabele.

## 9. QUALITY — 1 stub / 20 brakujących

Brakujące ekrany (21 wg prototypu QA-001…QA-099): Specifications (lista/detal/wizard/approve),
Test Templates, Incoming/In-Process/Final Inspection, Holds (lista/detal/release), NCR
(lista/detal/dual-sign), Batch Release, CoA, HACCP plans, CCP Monitoring, CCP Deviations,
Allergen Gates, Sampling Plans, Audit Trail.
Schema: ✅ quality_holds, ncr_reports, quality_specifications (mig 197) — **można od razu budować UI**.
Brak: quality_inspections/test_results, HACCP/CCP, sampling, audit_log.
Ryzyko: holdsGuard (v_active_holds) niepodpięty do consume-gate produkcji/magazynu.

## 10. SHIPPING — 2 stuby / 21 brakujących

Brakujące: Customers (lista/detal), Sales Orders (lista/detal/wizard), Allocation (+override),
Pick Lists (+supervisor), Wave Builder/Picking, Pick Desktop, Packing Station (SSCC),
Shipments (lista/detal), SSCC Label Queue, Packing Slip, BOL, Delivery Tracker/POD,
RMA, Carriers, Settings.
Schema: ✅ KOMPLET w mig 211 (customers, SO, allocations, waves, picks, shipments, BOL,
generate_sscc()). Brak: carriers, rma_records, shipping outbox/DLQ.
Martwe guziki: wszystkie akcje SO/pick/pack/ship — brak Server Actions (T-007…T-025).

## 11. FINANCE — 1 stub / 16 brakujących

Brakujące: Standard Costs (CRUD+approval), WO Costs (lista/detal), Inventory Valuation,
Material/Labor Variance, Variance Dashboard+Drilldown, FX Rates, Reports, D365/Comarch,
GL Mappings, Cost Centers, BOM Costing, Margin, Budget, Settings. 14 martwych modali w prototypie.
Schema: **0 z 13 tabel** (standard_costs, work_order_costs, cost_layers, wac_state, currencies…).
**P0: brak stringów fin.* w enum uprawnień** — ESLint guard zablokuje PR.

## 12. REPORTING — 1 stub / 15 brakujących

Brakujące: Factory Overview, Yield by Line/SKU, QC Holds, OEE Summary, Inventory Aging,
WO Status, Shipment OTD, Integration Health, Rules Usage, Exports, Saved Presets,
Scheduled (P2), Settings.
Schema: ✅ 7 MV + report_exports + saved_filter_presets + dashboards_catalog + seed rpt.*
(migi 213–214). Brak: warstwy serwisowej TS do czytania MV + wiring katalogu + middleware gate.
Większość MV i tak pusta, póki Production/Quality/Warehouse nie piszą danych.

## 13. MAINTENANCE — 1 stub / 15 brakujących

Brakujące: Work Requests, MWO lista+detal (7 tabów, state machine), PM Schedule+wizard,
Equipment Registry (lista/detal), Spare Parts (+reorder), Calibration (+cert upload),
LOTO, Technicians, Analytics, Settings.
Schema: ✅ equipment, technician_profiles, maintenance_settings (mig 201).
Brak: 13 tabel (mwo*, schedules, spare_parts*, calibration*, sanitation, history, KPI MV).

## 14. MULTI-SITE — 1 stub / 15 brakujących

Brakujące: Sites (lista/detal 8 tabów), IST transfery (lista/detal/wizard), Transport Lanes
(+rate cards), Master Data Sync, Replication Queue, Permissions Matrix, Site Activation,
Analytics, Settings, globalny site-switcher (site-crumb = placeholder z TODO T-020).
Schema: **0 z 12 tabel** (sites, site_user_access, transport_lanes…). Brak app.current_site_id().
Decyzja D-1 (strategia site_id dla 21 tabel) — niepodjęta.

## 15. OEE — 1 stub / 15 brakujących

Brakujące: Dashboard, Per-Line Trend, Heatmap zmian, Daily Summary, A/P/Q drilldown,
Six Big Losses, modale, Settings, Shift Patterns + kalendarz nieprodukcyjny, Downtime,
Shift Reports PDF, Energy, Trends, Pareto, Performance.
Schema: ✅ oee_snapshots (mig 184, pisze 08-production). Brak: shift_configs, shift_patterns,
thresholds, MV oee_shift_metrics/oee_daily_summary, big_loss_categories.

---

## 16. Blockery przekrojowe (P0)

1. **apps/worker — częściowo jest** (cron registry działa: allergen cascade, D365 sync, outbox
   consumer), ale moduły Finance/Reporting/Multi-Site zakładają handlery, których nie ma.
2. **RBAC**: enum ma już production.*, oee.*, mnt.*, rpt.*, multi_site.*, quality.*, ship.* —
   **brakuje fin.***; seedy ról brakują dla quality (066), shipping (033), oee (T-026),
   maintenance (T-031), multi-site (T-032). Nawigacja w ogóle niegated (UI-128).
3. **Migracja 238 duplikat** + 3 błędy lint = czerwone CI (z poprzedniego audytu — wciąż aktualne).
4. **Decyzje niepodjęte**: B3 scanner workspace; D-1 site_id activation; GS1-128 parser
   (packages/gs1 vs spec barcode-parser).
5. **lp_genealogy** brak — bez tego nie ma traceability (kluczowe wg researchu rynkowego).

## 17. Rekomendowana kolejność dorabiania ekranów (wg dźwigni)

1. **Production WO detail UI** — API już działa, tylko ekran + modale (najtańszy duży efekt).
2. **Planning: Work Orders lista + create** — tabele są; bez tego nie ma czego egzekwować.
3. **Warehouse: GRN + License Plates + Stock Moves UI** — tabele są; + migracja lp_genealogy.
4. **Quality: Holds + NCR + Specs UI** — tabele są (197).
5. **Shipping: SO → Allocation → Pick → Pack → Ship** — tabele są (211); długa ścieżka UI.
6. Dashboard KPI/quick-actions + Auth signup/reset + 404/error pages + RBAC nav gating.
7. Scheduler/OEE/Maintenance/Reporting UI — po tym, jak produkcja zacznie generować dane.
8. Finance i Multi-Site na końcu (zero schematu, osobne decyzje).

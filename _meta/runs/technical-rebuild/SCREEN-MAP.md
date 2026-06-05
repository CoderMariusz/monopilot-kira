# Technical module rebuild — design→route→backing map (SSOT for the agent lanes)

Design SSOT = `prototypes/design/Monopilot Design System/technical/` (rendered by `technical.html`).
Nav SSOT = `data.jsx:9` (`TECH_NAV`). App screen routing = `app.jsx:56-81`.

Every lane: **(1) diagnose the `state:'error'` ("Unable to load") root cause** — open the page's
`_actions/*.ts`, find the try/catch that maps to `state:'error'`, and check the actual query columns
against the REAL Supabase schema (project `khjvkhzwfzuwzrusgobp`, supabase MCP `execute_sql` —
`select column_name,data_type from information_schema.columns where table_name='...'`). The known class
of bug: joining `bom_headers.product_id` (TEXT→product_code) on `items.id` (uuid); same family of
text-vs-uuid / wrong-column joins elsewhere. Fix the query so the page loads. **(2) rebuild the UI to
design parity** per `MON-design-system` (dense, no shadow, chrome, breadcrumb + page-title + muted
desc, KPI 3px accent, mono codes, 5 semantic badges, EmptyState, `.card`/`.table`/`.tabs-counted`).
Keep data flow, routes, RLS, real-Supabase reads intact. Implement all 5 states
(loading/empty/error/permission-denied/ready). Run `pnpm --filter web typecheck` + targeted vitest
(`.tsx` needs `--config vitest.ui.config.ts`). **Do NOT push** — the orchestrator collects.

## Screen → anchor → route → backing table

| Design screen | Anchor (file:line) | Route | Backing table |
|---|---|---|---|
| TechDashboardScreen | other-screens.jsx:242-303 | `/technical` | kpis (dashboard-kpis.ts) |
| ProductsListScreen | other-screens.jsx:931-1073 | `/technical/items` | `items` (fg/intermediate) |
| ProductDetailScreen (+tabs) | other-screens.jsx:1074-1369 | `/technical/items/[item_code]` | items + per-tab tables |
| MaterialsListScreen | other-screens.jsx:304-354 | `/technical/materials` | `items` (rm) |
| MaterialDetailScreen | other-screens.jsx:355-479 | `/technical/materials/[item_code]` | items(rm) |
| BOMList | bom-list.jsx:3-126 | `/technical/bom` | `bom_headers` |
| BOMDetail (+7 tabs) | bom-detail.jsx:3-610 | `/technical/bom/[itemCode]` | bom_headers/lines/co_products/snapshots |
| NutritionScreen | other-screens.jsx:480-535 | `/technical/nutrition` | `nutrition_profiles`/`nutrition_allergens` (mig 086) |
| CostingScreen (recipe costing) | other-screens.jsx:536-586 | `/technical/cost` | cost + bom rollup |
| CostHistoryScreen | other-screens.jsx:633-694 | `/technical/cost/history` | `item_cost_history` |
| ShelfLifeScreen | other-screens.jsx:587-632 | `/technical/shelf-life` | shelf-life config |
| RoutingsScreen | other-screens.jsx:4-40 | `/technical/routings` | `routings`/`routing_operations` |
| SpecsScreen (product specs) | other-screens.jsx:41-77 | `/technical/factory-specs` | `factory_specs` |
| AllergenScreen (matrix) | other-screens.jsx:78-132 | `/technical/allergens-config` | allergen profiles |
| AllergenCascadeScreen | other-screens.jsx:1370-1431 | `/technical/allergens/cascade` | allergen cascade |
| ProcessAllergenScreen | other-screens.jsx:1432-1484 | `/technical/allergens/process-additions` | mfg-op allergens (API `/api/technical/manufacturing-operations/allergens`) |
| ContaminationRiskScreen | other-screens.jsx:1485-1574 | `/technical/allergens/contamination-risk` | `allergen_contamination_risk` (mig 161) + API |
| LabResultsLogScreen | spec-driven-screens.jsx:451-550 | `/technical/lab-results` | lab_results (read-only) |
| RegulatoryComplianceDashboardScreen | spec-driven-screens.jsx:359-450 | `/technical/compliance` | compliance |
| BomSnapshotsViewerScreen | spec-driven-screens.jsx:223-358 | `/technical/boms/snapshots` | bom_snapshots |
| Tooling (no proto — design-system conventions) | — | `/technical/tooling` | tooling/routings projection |
| Sensory (no proto — design-system conventions; T-092 read model) | — | `/technical/sensory` | sensory read model (T-084) |

## D365 → relocate to Settings (user decision)
D365 group (5 screens) leaves the Technical nav. Page `technical/costs/d365-import` and the four D365
stub routes relocate under Settings › Integrations › D365. Anchors: other-screens.jsx:776-930 +
1575-end (D365Status/Mapping/Drift/Log/ManualSync), spec-driven-screens.jsx:551-end (CostImportFromD365).

## Deferred — backend-first via Codex (user decision), UI after schema lands
- Traceability search — other-screens.jsx:695-775 — NO table (cross-module lots/LP). Route `/technical/traceability`.
- Change control (ECO) — other-screens.jsx:133-182 + modals (EcoChangeRequest/EcoApproval) — NO table. Route `/technical/eco`.
- Revision history — other-screens.jsx:183-241 — NO module-level table. Route `/technical/revisions`.
These are NOT in this launch's nav; added once their schema + server actions exist.

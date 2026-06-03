# 10-finance — Reality Audit (2026-06-02)

## Counts
- task files: 32 | manifest task_count: 32 | STATUS rows: 0 (no STATUS.md existed) → reconciliation: perfect file/manifest match; STATUS.md created fresh.

## Task reality

| Task | Title | Declared type | Verdict | Evidence (path) | Gap / note |
|---|---|---|---|---|---|
| T-001 | Lock finance permission enum (fin.*.* baseline) | T1-schema (auth) | ⛔ MISSING | `packages/rbac/src/permissions.enum.ts` (181 lines) — no `fin.*.*` strings present; no `ALL_FINANCE_CORE_PERMISSIONS` export | P0 blocker: every downstream finance compile depends on these 14 strings |
| T-002 | finance_settings + currencies + exchange_rates schema | T1-schema | ⛔ MISSING | `packages/db/migrations/` — highest migration is `050-settings-manage-permissions.sql`; no finance_settings/currencies/exchange_rates table in any migration | No Drizzle schema, no RLS, no NUMERIC precision columns |
| T-003 | cost_centers + gl_account_mappings schema | T1-schema | ⛔ MISSING | `packages/db/migrations/` — no cost_centers or gl_account_mappings tables anywhere | |
| T-004 | Finance setup Server Actions (settings/currencies/exchange_rates) | T2-api | ⛔ MISSING | `apps/web/app/[locale]/(app)/(modules)/finance/` contains only `page.tsx`; no `_actions/` directory | |
| T-005 | UI: FIN-017 Finance Settings page | T3-ui | ⛔ MISSING | Only `finance/page.tsx` (ModuleStubNotice stub) exists; no settings sub-page or components | Prototype anchor in `prototypes/design/Monopilot Design System/finance/` not rendered |
| T-006 | UI: FIN-018 Cost Centers Admin + MODAL-13 GL Mapping | T3-ui | ⛔ MISSING | No cost-centers page or component files in `apps/web/` (excluding `.next`) | |
| T-007 | UI: FIN-008 FX Rates page + MODAL-05 | T3-ui | ⛔ MISSING | No fx-rates page or component files found | |
| T-008 | Seed finance setup baseline (GBP base + Apex FNOR) | T5-seed | ⛔ MISSING | `packages/db/seeds/` has apex-departments, modules, reference schemas etc — no finance seed (currencies, finance_settings, cost_centers) | Module entry `10-finance` in modules.sql only; no functional seed |
| T-009 | standard_costs + cost_approval_audit schema | T1-schema | ⛔ MISSING | No standard_costs, standard_cost_versions, cost_approval_audit tables in any migration | No immutability trigger, no GIST EXCLUDE, no NUMERIC(15,4) columns |
| T-010 | cost_per_kg dual-ownership RLS policy (D-FIN-9) | T1-schema | ⛔ MISSING | No cost_per_kg RLS policy found; `packages/rbac/` has no `fin.*` permissions to gate it | Depends on T-001 (MISSING) and T-009 (MISSING) |
| T-011 | Standard cost Server Actions (CRUD + approve + supersede) | T2-api | ⛔ MISSING | No finance Server Actions directory at all | Depends on T-001, T-009, T-010 (all MISSING) |
| T-012 | UI: FIN-002 Standard Costs List + MODAL-01/02/03/11 | T3-ui | ⛔ MISSING | No standard-costs page or components | Prototype labels exist at `_meta/prototype-labels/prototype-index-finance.json` but no implementation |
| T-013 | UI: FIN-019 Bulk Import Standard Costs MODAL-04 | T3-ui | ⛔ MISSING | No bulk-import component | |
| T-014 | Wiring: standard_cost.approved outbox handler → cost_per_kg | T4-wiring-test | ⛔ MISSING | No finance worker handler files; `apps/worker` directory not present | Foundation worker registry (T-111/T-112) itself must exist first |
| T-015 | work_order_costs + material_consumption_costs + labor_costs schema | T1-schema | ⛔ MISSING | No work_order_costs, material_consumption_costs, labor_costs, overhead_costs tables in any migration | Foreign keys to 08-production/05-warehouse/04-planning also absent |
| T-016 | Cascade rollup recursive CTE Server Action | T2-api | ⛔ MISSING | No finance compute actions | Depends on T-015 schema (MISSING) |
| T-017 | Co-product / by-product allocation on wo_output.register | T2-api | ⛔ MISSING | No allocation Server Action | |
| T-018 | Wiring: wo.completed worker consumer → cascade + allocation | T4-wiring-test | ⛔ MISSING | No worker consumers for finance | |
| T-019 | UI: FIN-003a WO Costs List page | T3-ui | ⛔ MISSING | No wo-costs list page or components in finance route | |
| T-020 | UI: FIN-003 WO Cost Summary detail page | T3-ui | ⛔ MISSING | No wo-cost detail page | |
| T-021 | inventory_cost_layers (FIFO) + item_wac_state + cost_variances schema | T1-schema | ⛔ MISSING | No FIFO/WAC tables in any migration | |
| T-022 | Register cost_method_selector_v1 + waste_cost_allocator_v1 rules | T2-api | ⛔ MISSING | No DSL rule registrations for finance cost methods | |
| T-023 | Wiring: lp.received + material.consumed handlers (FIFO/WAC) | T4-wiring-test | ⛔ MISSING | No finance worker handlers for warehouse events | |
| T-024 | Yield variance per WO computation + waste cost handler | T4-wiring-test | ⛔ MISSING | No yield variance computation or waste handler | |
| T-025 | UI: FIN-004 Inventory Valuation + FIN-005 Material/Labour Breakdown | T3-ui | ⛔ MISSING | No inventory valuation or cost breakdown pages | |
| T-026 | UI: FIN-010 Variance Drill-down | T3-ui | ⛔ MISSING | No variance drill-down page | |
| T-027 | finance_outbox_events + d365_finance_dlq schema | T1-schema | ⛔ MISSING | No finance_outbox_events or d365_finance_dlq tables in any migration | |
| T-028 | Wiring: Daily consolidator cron + R15 D365 adapter + dispatcher | T4-wiring-test | ⛔ MISSING | No D365 finance consolidator or dispatcher | |
| T-029 | DLQ replay + resolve Server Actions | T2-api | ⛔ MISSING | No DLQ Server Actions under finance route | |
| T-030 | UI: FIN-006/016 D365 Integration page + MODAL-08 Replay | T3-ui | ⛔ MISSING | No D365 integration page for finance module | |
| T-031 | UI: FIN-001 Finance Dashboard | T3-ui | ⛔ MISSING | `finance/page.tsx` is a `ModuleStubNotice` placeholder only; no real dashboard | Route exists; nav wired; content = stub badge |
| T-032 | UI: FIN-011 Cost Reporting Suite + MODAL-10 Export | T3-ui | ⛔ MISSING | No cost reporting page or export modal | |

## Phantom / carry-forward backlog

None — no carry-forward annotations found in any STATUS.md (no STATUS.md existed).

Cross-module blockers that must land BEFORE any 10-finance task can close:
- `00-foundation` T-111/T-112 (outbox worker registry) — referenced by T-014, T-018, T-023, T-024, T-028, T-032
- `00-foundation` T-125 (withOrgContext + permissions GUC extension) — referenced by T-010
- `03-technical` items.cost_per_kg column — referenced by T-010, T-017
- `08-production` work_orders / wo_outputs / wo_waste_log — referenced by T-015, T-017, T-018, T-024
- `05-warehouse` license_plates FK — referenced by T-015, T-021
- `04-planning-basic` wo_dependencies — referenced by T-015, T-016

## Extra (code without a task)

- `apps/web/app/[locale]/(app)/(modules)/finance/page.tsx` — skeleton stub landing page (ModuleStubNotice). Matches Wave 0 skeleton pattern; no owning 10-finance task (the Wave 0 skeleton tasks in 00-foundation cover it). This is 🧩 EXTRA relative to 10-finance tasks.
- `apps/web/i18n/en.json` + `pl.json` + `ro.json` + `uk.json` — all four locales include `"finance": "Finance"` navigation key at line ~677 (nav item). Wired from skeleton work. Extra relative to finance tasks but correctly placed.
- `prototypes/design/Monopilot Design System/finance/` — 11 prototype files (`app.jsx`, `dashboard.jsx`, `data.jsx`, `finance.css`, `finance.html`, `modals.jsx`, `other-screens.jsx`, `shell.jsx`, `standard-screens.jsx`, `variance-screens.jsx`, `wo-screens.jsx`) — design artifacts, not implementation. 25 labelled entries in `_meta/prototype-labels/prototype-index-finance.json`. All intact, none implemented.

## Top integration risks

1. **T-001 P0 blocker is MISSING**: The 14 `fin.*.*` permission strings are absent from `packages/rbac/src/permissions.enum.ts`. Foundation's enum-lock ESLint guard (T-046) will reject every finance TypeScript file that references these permissions, blocking all 31 downstream tasks at compile time. Must be the very first commit.

2. **Massive cross-module dependency chain unresolved**: T-015 (WO costing schema) requires 4 upstream modules (08-production, 05-warehouse, 04-planning-basic, 03-technical) to have delivered specific tables/columns. T-021 (FIFO schema) requires warehouse events. T-022 (rules DSL) requires settings rules_registry. None of these cross-module blockers show STATUS.md evidence of being complete — finance cannot progress past sub-module 10-b without verifying each.

3. **Finance_outbox_events architectural ambiguity (D365 stage 5, T-027/T-028)**: Finance owns its own parallel outbox table (PRD §6.4/§12) separate from `packages/outbox`. The D365 adapter (R15 anti-corruption layer) is a distinct pattern not yet present anywhere in the codebase. If 00-foundation R15 is not materialised before T-028, the D365 dispatcher will either couple directly to D365 or duplicate the R15 pattern — a high-risk integration boundary.

## Skeleton contribution

- **Finance route reachability**: The route `[locale]/(app)/(modules)/finance/page.tsx` is wired in the nav manifest (`app-nav.ts` line 67: `sidebarItem("finance")`), the i18n key `Navigation.app.items.finance` exists in all 4 locales, and the page renders a `ModuleStubNotice` stub. A user CAN navigate to `/finance` and see a placeholder — the skeleton goal is met for this module (the stub page renders, though it shows no real data).
- **No real finance data whatsoever**: Zero finance-specific tables, Server Actions, or data fetching. The stub page is pure UI with no Supabase queries.

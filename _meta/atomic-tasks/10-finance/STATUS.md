# 10-finance — Task Status

> Legend: ✅ DONE | 🔄 IN PROGRESS | ⏸ BLOCKED / STUB | ⬜ NOT STARTED
>
> Created: 2026-06-02 (Phase 0 reality audit — all tasks start at ⬜ / ⏸).
> No prior STATUS.md existed. All 32 tasks were bootstrapped 2026-05-14 with zero implementation.

## Summary
- **Declared:** 32 tasks | **Implemented:** 0 | **Stub:** 1 (finance/page.tsx skeleton landing) | **Missing:** 32 | **Phantom:** 0
- P0 blocker: **T-001** (fin.*.* permissions enum) must land first.

## Task rows

| ID | Type | Title (abbreviated) | Status | Note |
|---|---|---|---|---|
| T-001 | T1-schema (auth) | Lock finance permission enum | ⬜ | P0 blocker — 14 `fin.*.*` strings absent from `packages/rbac/src/permissions.enum.ts` |
| T-002 | T1-schema | finance_settings + currencies + exchange_rates schema | ⬜ | No migration; no Drizzle schema. Depends on T-001. |
| T-003 | T1-schema | cost_centers + gl_account_mappings schema | ⬜ | No migration. Depends on T-001, T-002. |
| T-004 | T2-api | Finance setup Server Actions | ⬜ | No `_actions/` directory under finance route. Depends on T-002, T-003. |
| T-005 | T3-ui | UI: FIN-017 Finance Settings page | ⬜ | Only stub landing page exists. No prototype parity evidence. Depends on T-004. |
| T-006 | T3-ui | UI: FIN-018 Cost Centers Admin + MODAL-13 | ⬜ | No page or components. Depends on T-004. |
| T-007 | T3-ui | UI: FIN-008 FX Rates page + MODAL-05 | ⬜ | No page or components. Depends on T-004. |
| T-008 | T5-seed | Seed finance setup baseline | ⬜ | No finance seed in `packages/db/seeds/`. Depends on T-002, T-003. |
| T-009 | T1-schema | standard_costs + cost_approval_audit schema | ⬜ | No migration; no immutability trigger, no GIST EXCLUDE. Depends on T-002. |
| T-010 | T1-schema | cost_per_kg dual-ownership RLS policy | ⬜ | No RLS policy; depends on T-001 (permissions) + T-009 + 03-technical items.cost_per_kg. |
| T-011 | T2-api | Standard cost Server Actions (CRUD + approve + supersede) | ⬜ | No actions. Depends on T-001, T-009, T-010. |
| T-012 | T3-ui | UI: FIN-002 Standard Costs List + MODAL-01/02/03/11 | ⬜ | No pages/components. Depends on T-011. |
| T-013 | T3-ui | UI: FIN-019 Bulk Import Standard Costs MODAL-04 | ⬜ | No component. Depends on T-011. |
| T-014 | T4-wiring-test | Wiring: standard_cost.approved outbox handler | ⬜ | No worker handler. Depends on T-011 + 00-foundation T-111/T-112. |
| T-015 | T1-schema | work_order_costs + consumption/labor/overhead schema | ⬜ | No migration; depends on 08-production, 05-warehouse, 04-planning-basic tables. |
| T-016 | T2-api | Cascade rollup recursive CTE Server Action | ⬜ | No action. Depends on T-015. |
| T-017 | T2-api | Co-product / by-product allocation on wo_output.register | ⬜ | No action. Depends on T-015 + 03-technical bom_co_products. |
| T-018 | T4-wiring-test | Wiring: wo.completed worker consumer | ⬜ | No worker consumer. Depends on T-016, T-017 + 08-production event. |
| T-019 | T3-ui | UI: FIN-003a WO Costs List page | ⬜ | No page. Depends on T-016. |
| T-020 | T3-ui | UI: FIN-003 WO Cost Summary detail page | ⬜ | No page. Depends on T-016. |
| T-021 | T1-schema | inventory_cost_layers (FIFO) + item_wac_state + cost_variances | ⬜ | No migration; depends on 05-warehouse license_plates FK. |
| T-022 | T2-api | Register cost_method_selector_v1 + waste_cost_allocator_v1 | ⬜ | No DSL rule registrations. Depends on T-021 + 02-settings rules_registry. |
| T-023 | T4-wiring-test | Wiring: lp.received + material.consumed handlers (FIFO/WAC) | ⬜ | No handlers. Depends on T-022 + 05-warehouse events. |
| T-024 | T4-wiring-test | Yield variance per WO computation + waste cost handler | ⬜ | No handlers. Depends on T-021, T-022 + 08-production events. |
| T-025 | T3-ui | UI: FIN-004 Inventory Valuation + FIN-005 Material/Labour | ⬜ | No pages. Depends on T-022. |
| T-026 | T3-ui | UI: FIN-010 Variance Drill-down | ⬜ | No page. Depends on T-022. |
| T-027 | T1-schema | finance_outbox_events + d365_finance_dlq schema | ⬜ | No migration. Depends on T-015 + 00-foundation R14 UUID v7. |
| T-028 | T4-wiring-test | Wiring: Daily consolidator cron + R15 D365 adapter | ⬜ | No cron/adapter. Depends on T-027 + 00-foundation R15 + 02-settings d365_constants. |
| T-029 | T2-api | DLQ replay + resolve Server Actions | ⬜ | No actions. Depends on T-027. |
| T-030 | T3-ui | UI: FIN-006/016 D365 Integration page + MODAL-08 | ⬜ | No page. Depends on T-029. |
| T-031 | T3-ui | UI: FIN-001 Finance Dashboard | ⏸ | `finance/page.tsx` exists as ModuleStubNotice placeholder. Route is live, nav wired, i18n present in 4 locales — but no real data, no widgets. Treat as skeleton stub. |
| T-032 | T3-ui | UI: FIN-011 Cost Reporting Suite + MODAL-10 Export | ⬜ | No page. Depends on full 10-a..10-e chain. |

## Pre-conditions checklist (must verify before wave starts)

- [ ] 00-foundation T-111/T-112 (outbox worker registry) — needed by T-014, T-018, T-023, T-024, T-028, T-032
- [ ] 00-foundation T-125 (withOrgContext + permissions GUC extension) — needed by T-010, T-011
- [ ] 00-foundation T-046 (enum-lock ESLint guard) — will fail if T-001 not done first
- [ ] 03-technical items.cost_per_kg column exists — needed by T-010, T-017
- [ ] 08-production work_orders / wo_outputs / wo_waste_log tables — needed by T-015, T-017, T-018, T-024
- [ ] 05-warehouse license_plates table — needed by T-015, T-021
- [ ] 04-planning-basic wo_dependencies table — needed by T-015, T-016
- [ ] 02-settings rules_registry — needed by T-022
- [ ] 02-settings d365_constants — needed by T-028

## Carry-forward backlog
None (first STATUS.md; no prior carry-forwards to migrate).


## Sidecar fold-in (2026-06-04)

New tracked tasks:

| Task | Title | Status | Note / Sequence |
|---|---|---|---|
| T-033 | Seed fin.* permissions onto roles (NNN-finance-permission-seed.sql) | ⬜ PENDING | X-1 RBAC-seed. **wave-1 p0**, after T-001 enum. |

Decisions / refinements (no new task):

| Item | Type | Status | Note |
|---|---|---|---|
| NUMERIC money precision (S-1) | 🔒 DECISION | BLOCKED — blocker for 10-a start | skill MON-domain-finance says money `NUMERIC(18,4)`/qty `(14,3)`/FX `(12,6)` (HARD RULE) but PRD §6.4 + task DDL use `(15,4)`/`(12,3)`/`(15,6)`. Pick ONE scale and align skill + PRD + every 10-finance task DDL (recommended: adopt the skill's (18,4)/(14,3); amend T-002/009/015/021/024/027). |
| UI route path (S-2, X-3) | consolidation pass | ⬜ TODO | Rewrite finance T3-ui paths `apps/web/app/finance/...` → `apps/web/app/[locale]/(app)/(modules)/finance/...` (T-019/020/025/026/030/031). |
| NPD waterfall ↔ std_cost (S-3) | P2 note | 🔒 DEFERRED | Margin reconcile is P2 (Epic 10-G/10-H) — intentional, no P1 action. P2 wave consumes NPD waterfall target + reuses 12-reporting fiscal calendar. |

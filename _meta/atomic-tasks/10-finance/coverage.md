# 10-FINANCE Atomic Task Coverage

PRD: `docs/prd/10-FINANCE-PRD.md` v3.1 (2026-04-30 multi-industry standardization).

Bootstrap origin: Auditor A 2026-05-14 enumerated 10 priority slices for 10-finance; this module was zero tasks pre-bootstrap. Auditor A: `_meta/audits/2026-05-14-prd-vs-tasks-coverage-gaps.md`.

## Sub-module map

| Sub-module | Scope (PRD §7.2) | Tasks | Count |
|---|---|---|---|
| **10-FINANCE-perm** | Permissions enum baseline (14 fin.*.*) | T-001 | 1 |
| **10-FINANCE-a** | Finance Setup + Reference (finance_settings, cost_centers, currencies, exchange_rates, gl_account_mappings, FIN-017/018/008/021 UI) | T-002..T-008 | 7 |
| **10-FINANCE-b** | Standard Costs + Approval (standard_costs versioned, immutability trigger, e-signature SHA-256, cost_per_kg dual ownership, MODAL-01/02/03/04/11) | T-009..T-014 | 6 |
| **10-FINANCE-c** | WO Actual Costing (work_order_costs + consumption/labor/overhead, cascade rollup recursive CTE, co-product allocation, FIN-003a/003 UI) | T-015..T-020 | 6 |
| **10-FINANCE-d** | Variance + Inventory Valuation (FIFO layers, WAC state, cost_variances, DSL rules register, FIFO/WAC handlers, yield handler, FIN-004/005/010 UI) | T-021..T-026 | 6 |
| **10-FINANCE-e** | INTEGRATIONS stage 5 (finance_outbox_events, d365_finance_dlq, daily consolidator, R15 adapter, dispatcher, DLQ ops, FIN-006/016 UI) | T-027..T-030 | 4 |
| **10-FINANCE-cross** | Cross-module dashboard + reports (FIN-001, FIN-011 + MODAL-10) | T-031, T-032 | 2 |

**Total: 32 atomic tasks.**

## Coverage rows (all 32)

| PRD ref | Task file | Sub-module | Type | Status |
|---|---|---|---|---|
| §2.3 RBAC, §5.3 e-sig, §12.6 DLQ ops, §14.1 L2 | tasks/T-001.json | perm | T1-schema (auth) | covered |
| §6.1 rows 1/3/4, §6.4 finance_settings DDL, §11.1 V-FIN-SETUP-01..03, §14.1 | tasks/T-002.json | a | T1-schema | covered |
| §6.1 rows 2/5, §11.1 V-FIN-SETUP-04/05, §12.4 R15 adapter mapping | tasks/T-003.json | a | T1-schema | covered |
| §8.2 Setup endpoints, §11.1, §13 RBAC | tasks/T-004.json | a | T2-api | covered |
| §8.4 FIN-017, §6.1 row 1, §14.1, §5.3 | tasks/T-005.json | a | T3-ui | covered |
| §8.4 FIN-018, §8.4 FIN-021, §8.5 MODAL-13, §11.1 V-FIN-SETUP-04/05 | tasks/T-006.json | a | T3-ui | covered |
| §8.1 FIN-008, §8.5 MODAL-05, §11.1 V-FIN-SETUP-03, §5.5 | tasks/T-007.json | a | T3-ui | covered |
| §5.5, §11.1, §12.4, §12.8, §14.1 | tasks/T-008.json | a | T5-seed | covered |
| §5.2/§5.3 21CFR, §6.2 audit, §6.4 standard_costs DDL, §11.2 V-FIN-STD-01..08 | tasks/T-009.json | b | T1-schema | covered |
| §13.1, §13.2 D-FIN-9 dual-ownership | tasks/T-010.json | b | T1-schema | covered |
| §5.3, §8.2 std cost endpoints, §11.2, §13.1, §13.2 | tasks/T-011.json | b | T2-api | covered |
| §8.1 FIN-002, §8.5 MODAL-01/02/03/11, §5.3, §11.2 | tasks/T-012.json | b | T3-ui | covered |
| §8.4 FIN-019, §8.5 MODAL-04, §11.2 | tasks/T-013.json | b | T3-ui | covered |
| §13.1, §13.2 | tasks/T-014.json | b | T4-wiring-test | covered |
| §6.1 rows 7-10, §6.4 work_order_costs DDL, §11.3 V-FIN-WO-01..08, §13.1, §15.3 | tasks/T-015.json | c | T1-schema | covered |
| §9.1, §9.2, §11.3, §13.1, §15.1 | tasks/T-016.json | c | T2-api | covered |
| §9.3, §11.3 V-FIN-WO-07, §13.1 | tasks/T-017.json | c | T2-api | covered |
| §9.4, §11.3, §12.2, §13.1, §15.5 | tasks/T-018.json | c | T4-wiring-test | covered |
| §8.4 FIN-003a, §11.5 | tasks/T-019.json | c | T3-ui | covered |
| §8.1 FIN-003, §9, §11.5, §13.1 | tasks/T-020.json | c | T3-ui | covered |
| §6.1 row 11, §6.4 inv_cost_layers + WAC DDL, §11.4 V-FIN-INV-01..05, §11.5 V-FIN-VAR-01..04 | tasks/T-021.json | d | T1-schema | covered |
| §10.1 cost_method_selector_v1, §10.2 waste_cost_allocator_v1, §10.3 std_cost_approval_v1 stub, §10.4 registry delta | tasks/T-022.json | d | T2-api | covered |
| §10.1, §11.4, §11.5, §13.1 | tasks/T-023.json | d | T4-wiring-test | covered |
| §9.5 waste cost, §11.3, §11.5, §13.1, §13.3 yield_loss_monthly view | tasks/T-024.json | d | T4-wiring-test | covered |
| §8.1 FIN-004/005, §8.4 FIN-005 UX canonical, §8.5 MODAL-06/07, §11.4, §11.5 | tasks/T-025.json | d | T3-ui | covered |
| §8.4 FIN-010 drill-down, §11.5 | tasks/T-026.json | d | T3-ui | covered |
| §5.2 BRCGS, §6.4 outbox+DLQ DDL, §11.6 V-FIN-INT-01..07, §12.2 | tasks/T-027.json | e | T1-schema | covered |
| §12.3 daily consolidator, §12.4 R15 adapter, §12.5 retry+DLQ, §12.7 reconciliation, §15.1, §15.2, §15.4 | tasks/T-028.json | e | T4-wiring-test | covered |
| §11.6 V-FIN-INT-05, §12.6 DLQ ops | tasks/T-029.json | e | T2-api | covered |
| §8.1 FIN-006, §8.4 FIN-016, §8.5 MODAL-08/09, §12.6, §12.8 | tasks/T-030.json | e | T3-ui | covered |
| §4.1 dashboard, §4.2, §8.1 FIN-001, §8.3 widgets, §13.3 | tasks/T-031.json | cross | T3-ui | covered |
| §5.2 retention, §8.2 export, §8.4 FIN-011, §8.5 MODAL-10, §13 RBAC | tasks/T-032.json | cross | T3-ui | covered |

## Coverage vs Auditor A's 10 priority slices

Auditor A (`_meta/audits/2026-05-14-prd-vs-tasks-coverage-gaps.md` §6 10-FINANCE) enumerated:

| Audit slice | Atomized into |
|---|---|
| FIN-001 standard_costs + standard_cost_versions schema | T-009 |
| FIN-002 fifo_layers + wac_inventory_value schema | T-021 |
| FIN-003 cost_centers + gl_account_mappings + currencies + tax_codes ref-table seed | T-002, T-003, T-008 |
| FIN-004 D365 cost posting daily consolidated outbox dispatcher | T-027, T-028 |
| FIN-005 WO yield variance computation Server Action | T-024 |
| FIN-006 BOM cost rollup DAG cascade | T-016 |
| FIN-007 fin_standard_costs_list UI + std_cost_create_modal + approve_std_cost_modal | T-012 (+ T-013 bulk import) |
| FIN-008 fin_dashboard UI + cost KPIs | T-031 |
| FIN-009 fin_d365_integration UI + DLQ list/replay + period_lock_modal | T-030 (period_lock = P2 stub, gated in T-005 settings) |
| FIN-010 Permissions enum delta | T-001 (P0 blocker, priority 90) |

All 10 slices have ≥1 atomized task; several decompose into a T1→T2→T3→T4→T5 chain per the gold-standard pattern.

## Sub-module DAG (PRD §7.1)

```
T-001 (perm)
  ↓
10-a (Setup) blocks on 02-SETTINGS (tax_codes, feature flags) + 09-QA (waste_categories) — both DONE
  T-002 → T-003 → T-004 → {T-005, T-006, T-007} → T-008
       ↓
10-b (Standard Costs) blocks on 10-a + 03-TECH items.cost_per_kg
  T-009 → T-010 → T-011 → {T-012, T-013} → T-014
       ↓
10-c (WO Actual Costing) blocks on 10-b + 08-PROD (wo_executions/outputs/waste) + 04-PLAN (wo_dependencies)
  T-015 → {T-016, T-017} → T-018 → {T-019, T-020}
       ↓                  ↘
10-d (Variance + Valuation) blocks on 10-c + 05-WH (consume events)
  T-021 → T-022 → T-023 → T-024 → {T-025, T-026}
       ↓
10-e (INTEGRATIONS stage 5) blocks on 10-c + 02-SETTINGS §11 D365_Constants + 08-PROD §12 outbox template
  T-027 → T-028 → T-029 → T-030
       ↓
10-cross (Dashboard + Reports) consumes all sub-modules
  T-031, T-032 (parallel after 10-d/10-e core)
```

## P0 blockers

| Task | Reason |
|---|---|
| **T-001** | Locks the 14 `fin.*.*` permission strings in `packages/rbac/src/permissions.enum.ts`. ESLint enum-lock guard (Foundation T-046) will block every downstream finance task at compile time without this. Priority 90, label `p0-blocker`. |

## Cross-module dependencies declared

(per `cross_module_dependencies` field in each task)

| From task | To module | Mechanism |
|---|---|---|
| T-008 | 00-foundation:T-111/T-112 | outbox worker subscribes to org.created → seedFinanceForOrg |
| T-010 | 00-foundation:T-125 | withOrgContext extension to set app.permissions GUC |
| T-010 | 03-technical | items.cost_per_kg column existence pre-flight |
| T-011 | 00-foundation:T-111 | outbox emission of finance.standard_cost.approved |
| T-011 | 12-reporting | consumer of finance.standard_cost.approved (when 12-REP lands) |
| T-014 | 00-foundation:T-111 | worker subscriber pattern + processed_events |
| T-014 | 12-reporting | downstream finance.cost_per_kg.changed for MV refresh |
| T-015 | 08-production | work_orders + wo_outputs + wo_waste_log + consumption_events FKs |
| T-015 | 05-warehouse | license_plates FK |
| T-015 | 04-planning-basic | wo_dependencies (for cascade rollup) |
| T-016 | 04-planning-basic | V-PLAN-WO-CYCLE upstream cycle guard |
| T-017 | 03-technical | bom_co_products + items |
| T-017 | 08-production | wo_outputs (output_type) |
| T-018 | 08-production | production.wo.completed event |
| T-018 | 00-foundation:T-111/T-112 | worker registry |
| T-021 | 05-warehouse | license_plates FK |
| T-022 | 02-settings | rules_registry table (foundation T-018/T-035) |
| T-023 | 05-warehouse | lp.received + material.consumed outbox events |
| T-024 | 08-production | waste.logged + wo_output.registered events + waste_categories |
| T-024 | 09-quality | ncr_reports (read-only via v_yield_loss_monthly view) |
| T-027 | 08-production | §12 outbox pattern reference |
| T-027 | 00-foundation | R14 UUID v7 contract |
| T-028 | 02-settings | d365_constants §11 |
| T-028 | 00-foundation | R15 anti-corruption |
| T-031 | 09-quality | ncr_reports (consumed via v_yield_loss_monthly) |
| T-032 | 12-reporting | export patterns reused (when 12-REP lands) |

## Foundation primitives consumed (no redefinition)

Per bootstrap instructions: foundation primitives exist from Wave 1 and are NOT redefined.

- `app.current_org_id()` foundation function (foundation T-125 / T-007) — used in all RLS policies (T-002, T-003, T-009, T-010, T-015, T-021, T-027).
- `withOrgContext` HOF — used in every Server Action (T-004, T-011, T-029) and worker handler (T-014, T-018, T-023, T-024, T-028, T-032).
- `packages/outbox` worker primitives — finance_outbox_events is a parallel namespaced table per PRD §12, but reuses the worker / dispatcher / DLQ pattern from foundation T-111 + 08-PROD §12 reference.
- `packages/rbac/src/permissions.enum.ts` — extended via T-001 only (P0 blocker).
- `audit_events` table (foundation T-040 R13) — written by every mutating action.
- Foundation logger / Sentry (T-117 / T-118) — finance worker handlers emit structured logs.
- `apps/worker` (foundation T-111 / T-112) — finance handlers registered there (T-014, T-018, T-023, T-024, T-028, T-032).
- e-signature SHA-256 utility (foundation T-124) — invoked by T-011 approve flow; if foundation T-124 exists as a shared helper, T-011 reuses; else T-011 inlines SHA-256 via Node crypto.
- 21 CFR Part 11 PIN-input primitive — built in T-012 (shared `app/finance/_components/pin-input.tsx`), reusable across modules.

## Notable design decisions

1. **finance_outbox_events parallel to packages/outbox**: per PRD §6.4 + §12 the finance integration owns its own outbox table (BIGSERIAL, UUID v7 idempotency_key CHECK, partitioned monthly). 08-PROD §12 is the structural template — finance does NOT couple to packages/outbox internals.
2. **cost_per_kg dual ownership (D-FIN-9)** realized via column-level trigger gating on `app.permissions` GUC (T-010). Worker writes set `app.current_role='finance_worker'` (T-014, T-018) to satisfy the gate.
3. **GIST EXCLUDE for V-FIN-STD-02 no-overlap approved records** — only Postgres mechanism that enforces daterange overlap on a partial subset (status='approved'); BTREE alone can't.
4. **Cycle detection in cost_centers** is done in the DB (BEFORE INSERT/UPDATE trigger, T-003) — UI dropdown filter is convenience only; trigger is SoT.
5. **Permanent-category DLQ replay** is admin-only (T-029) — V-FIN-INT-05 strict; non-admins can replay transient only.
6. **Period Lock (FIN-020) is Phase 2 stub** — UI button rendered disabled with 'Phase 2' badge per PRD §8.4 FIN-020 + OQ-FIN-13 default P2; underlying `fiscal_periods` table NOT created in this module bootstrap.
7. **MPV/MQV/LRV/LEV decomposition (BL-FIN-01)** — Phase 2 EPIC 10-I; P1 UI shows muted placeholder tiles with 'Phase 2' badge per PRD §11.5 + UX translation notes.
8. **Dashboard streaming** — FIN-001 uses RSC + Suspense boundaries per widget so slow widgets don't block fast ones (target <2s P95 NFR §4.1).

## Out-of-scope (P2 EPICs explicitly deferred per PRD §3.1 + §16.2)

EPIC 10-F Budget & Forecast, EPIC 10-G Margin Analysis, EPIC 10-H Savings Calculator, EPIC 10-I Variance Decomposition (MPV/MQV/LRV/LEV), EPIC 10-J Multi-Currency Ops, EPIC 10-K Complaint Cost Allocation, EPIC 10-L AR/AP Bridge, EPIC 10-M Landed Cost Variance, EPIC 10-N Supplier Invoice OCR, EPIC 10-O Variance Alerts + Thresholds, EPIC 10-P Advanced Inventory Revaluation. FIN-009, FIN-012, FIN-013, FIN-014, FIN-015, FIN-020 placeholder screens deferred. quality.hold.created cost freeze (P2 consumer hook §13.1).

## Notes

- Phase 1 multi-industry standardization (v3.1, 2026-04-30) applied: FG (finished goods, was FA), WIP-MX-0000001 code format, Manufacturing_Operation_1..4 keyed by operation_name (Mix/Bake/...). Schema column `manufacturing_operation_id` in `labor_costs` (T-015) replaces legacy `operation_id`. V-FIN-WO-07 code-format warn check in T-017.
- All 10-finance tasks use the kira_dev pipeline and the standard `checkpoint_policy` (RED, GREEN, REVIEW, CLOSEOUT) plus `routing_hints` (hermes_gpt55 for RED+impl, Opus for high-risk/UI/architecture review, Spark for low-risk close).
- 22 of 32 tasks have `prototype_match: true` and reference the canonical prototype label from `_meta/prototype-labels/prototype-index-finance.json` (covering 24 of 25 indexed prototype entries; the unused entry is `dlq_resolve_modal` which T-030 inlines via the dlq_replay_modal lineage).
- Every UI task carries `ui_evidence_policy: "_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md"`.

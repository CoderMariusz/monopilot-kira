# 10-FINANCE Module Bootstrap Report

**Date:** 2026-05-14
**Generator:** module-bootstrap-2026-05-14
**Source audit:** `_meta/audits/2026-05-14-prd-vs-tasks-coverage-gaps.md` (Auditor A, §6 10-FINANCE 10 priority slices)
**Source PRD:** `docs/prd/10-FINANCE-PRD.md` v3.1 (2026-04-30 multi-industry standardization)
**Pre-bootstrap state:** zero tasks (module listed in Auditor A as "full module uncovered" — modules 10..15)

## Totals

- **Tasks created:** 32 (range T-001 .. T-032)
- **Files:** 32 task JSONs + manifest.json + coverage.md + this report
- **Sub-modules:** 7 (10-FINANCE-perm + 10-FINANCE-a..e + 10-FINANCE-cross)
- **JSON validation:** all 32 task files parse via `python3 -c "import json; json.load(...)"` (validated in batches of 5–8 per bootstrap policy)
- **PRD anchors used:** 18 distinct §X.Y citations (§1.2, §2.3, §3, §4.1, §4.2, §5.2, §5.3, §5.5, §6.1, §6.2, §6.4, §7.1, §7.2, §8.1, §8.2, §8.3, §8.4, §8.5, §8.6, §9.1, §9.2, §9.3, §9.4, §9.5, §10.1, §10.2, §10.3, §10.4, §11.1, §11.2, §11.3, §11.4, §11.5, §11.6, §12.2, §12.3, §12.4, §12.5, §12.6, §12.7, §12.8, §13, §13.1, §13.2, §13.3, §14.1, §15.1, §15.2, §15.3, §15.4, §15.5) — all verified against the PRD's actual heading list (45-section index).
- **Prototype labels covered:** 24 of 25 indexed entries from `_meta/prototype-labels/prototype-index-finance.json` (the one unused entry `dlq_resolve_modal` is integrated by T-030's MODAL-09 inlined contract — its prototype lines 507-537 are still cited).

## Sub-module breakdown

| Sub-module | PRD §7.2 scope | Task IDs | Count |
|---|---|---|---|
| 10-FINANCE-perm | Permissions enum (14 fin.*.* baseline) | T-001 | 1 |
| 10-FINANCE-a | Finance Setup + Reference (settings, currencies, FX, cost_centers, GL mappings, FIN-017/018/008/021 UI, seed) | T-002..T-008 | 7 |
| 10-FINANCE-b | Standard Costs + Approval (schema + e-sig + dual-ownership + actions + FIN-002 + bulk import + worker writer) | T-009..T-014 | 6 |
| 10-FINANCE-c | WO Actual Costing (4 cost tables + cascade CTE + coproduct allocation + worker + FIN-003a/003 UI) | T-015..T-020 | 6 |
| 10-FINANCE-d | Variance + Inventory Valuation (FIFO+WAC schema + DSL register + FIFO/WAC handlers + yield handler + FIN-004/005/010 UI) | T-021..T-026 | 6 |
| 10-FINANCE-e | INTEGRATIONS stage 5 (outbox + DLQ schema + consolidator + R15 adapter + dispatcher + DLQ actions + FIN-006/016 UI) | T-027..T-030 | 4 |
| 10-FINANCE-cross | FIN-001 dashboard + FIN-011 reports + MODAL-10 export | T-031, T-032 | 2 |

## P0 blockers

| Task | Priority | Why P0 |
|---|---|---|
| T-001 Lock finance permission enum | 90, label `p0-blocker` | ESLint enum-lock guard (Foundation T-046) will fail every downstream finance task compilation without these 14 strings being added first to `packages/rbac/src/permissions.enum.ts`. Settings T-001 exemplar pattern followed verbatim. |

Two tasks at priority 70 (important but not P0): T-002 finance_settings/currencies/FX schema and T-009 standard_costs schema (both gate large sub-module DAGs). The remaining schema/api tasks are priority 70, UI/seed tasks priority 50 per the gold-standard exemplar conventions.

## Cross-module dependencies declared

(via `pipeline_inputs.cross_module_dependencies` array on each task)

- **00-foundation:** T-040 (R13 audit), T-046 (enum-lock guard), T-111 (outbox), T-112 (worker registry), T-117/T-118 (observability), T-124 (e-sig helper if shared), T-125 (withOrgContext + permissions GUC), R14 (UUID v7), R15 (anti-corruption).
- **02-settings:** rules_registry (T-018/T-035), d365_constants (§11), waste_categories (§8 already-done).
- **03-technical:** items.cost_per_kg column, bom_co_products.allocation_pct, items (item_type).
- **04-planning-basic:** wo_dependencies + V-PLAN-WO-CYCLE upstream guard.
- **05-warehouse:** license_plates FK, lp.received outbox event, material.consumed outbox event.
- **08-production:** work_orders, wo_outputs, wo_waste_log, consumption_events, wo_executions.completed event, §12 outbox pattern reference.
- **09-quality:** ncr_reports (read-only via v_yield_loss_monthly).
- **12-reporting:** consumer of finance.standard_cost.approved + finance.cost_per_kg.changed (forward — declared so 12-REP knows when it lands).

## Foundation primitives consumed (NOT redefined per bootstrap instructions)

- `app.current_org_id()` — used in every RLS policy migration (T-002, T-003, T-009, T-010, T-015, T-021, T-027).
- `withOrgContext` HOF — used in every Server Action + worker handler.
- Outbox worker + processed_events tracking — finance handlers (T-014, T-018, T-023, T-024, T-028, T-032) register through foundation T-111/T-112 registry.
- audit_events table — written by every mutating action.
- packages/rbac permissions enum — extended by T-001 only.
- Logger/Sentry foundation observability — finance workers emit structured logs.

## PRD verification

Cited PRD §X.Y were validated against the actual PRD heading list via `grep -nE '^##' docs/prd/10-FINANCE-PRD.md`. The full heading set (45 sub-sections) was read across §1..§19; every citation in every task file corresponds to a real heading. No fictional §X.Y was used.

Schema-adjacent contracts (per `kira_hq_red_prompt_verify_schema.md` memory): the migrations T-002, T-003, T-009, T-010, T-015, T-021, T-027 cite §6.4 PRD DDL sketches by line range (e.g. lines 274-289 for finance_settings, lines 291-334 for standard_costs, lines 380-396 for inventory_cost_layers, lines 411-429 for finance_outbox_events) and the trigger function `prevent_approved_standard_cost_update()` is replicated from §6.4 lines 319-334 verbatim. T-010 additionally has a pre-flight check for `items.cost_per_kg` existence before applying its policy (consumes 03-TECHNICAL contract).

## Risk red-lines applied per task

Every task includes 4–7 risk red-lines covering: (a) RLS / `app.current_org_id()` foundation function usage (never GUC reads), (b) precision: NUMERIC(15,4) for currency, no FLOAT, (c) idempotency: UUID v7 + processed_events for workers, (d) audit: R13 emission on every mutation + 7y retention, (e) e-signature: server-only SHA-256, no client-side compute, no raw PIN logs, (f) D365 contract: feature-flag gated + adapter R15 + retry schedule §12.5 verbatim, (g) dual-entry: GIST exclusion for no-overlap, immutability triggers for approved/posted, (h) FX: no historical recompute on rate override, (i) FIFO: consume in receipt_date ASC order with SELECT FOR UPDATE, (j) WAC: no negative inventory.

## Multi-industry standardization (v3.1, 2026-04-30) compliance

- All references use **FG** (finished goods, not FA).
- WIP code format: WIP-<2-letter-operation-suffix>-<7-digit-sequence> per v3.1.
- `labor_costs.manufacturing_operation_id` (not `operation_id`) per v3.1 §1.2 (T-015 schema).
- V-FIN-WO-07 product code format check enforced in T-017 (warn severity).
- No legacy PR-A-001 / Process_A,B,C,D code patterns in any task prompt.

## Output paths

- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/atomic-tasks/10-finance/manifest.json`
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/atomic-tasks/10-finance/coverage.md`
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/atomic-tasks/10-finance/tasks/T-001.json` .. `T-032.json`
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/atomic-tasks/10-finance/BOOTSTRAP-REPORT-2026-05-14.md` (this file)

---
name: MON-domain-finance
description: "Use when implementing 10-finance tasks: standard costs, WO actual costing, FIFO/WAC valuation, variance, D365 stage 5 (export-only per R15), cost-per-kg dual ownership (Technical+Finance). NUMERIC precision mandatory; D365 anti-corruption strict."
version: 1.0.0
model: opus
canonical_spec: docs/prd/10-FINANCE-PRD.md
---

# MON Domain — 10-Finance

**Read FIRST:** [[MON-project-overview]] (repo map, tech stack lock, module glossary). Then this skill. Then PRD `docs/prd/10-FINANCE-PRD.md` v3.1 (2026-04-30 multi-industry standardization).

**Module corpus:**
- Tasks: `_meta/atomic-tasks/10-finance/tasks/T-001.json` … `T-032.json` (32 atomic)
- Manifest: `_meta/atomic-tasks/10-finance/manifest.json`
- Coverage: `_meta/atomic-tasks/10-finance/coverage.md`
- Bootstrap report: `_meta/atomic-tasks/10-finance/BOOTSTRAP-REPORT-2026-05-14.md`
- Cleanup audit (canonical rules): `_meta/audits/2026-05-14-fixer-F13-finance-cleanup.md`
- D365 contract (R15): `_foundation/contracts/d365-posture.md`

**Event prefix:** `finance.*.*` (per project overview module glossary).

## Sub-modules

| Sub-module | Scope | Tasks | Count |
|---|---|---|---|
| **10-FINANCE-perm** (P0) | Permissions enum baseline (14 `fin.*.*` strings; blocks downstream via ESLint enum-lock guard Foundation T-046) | T-001 | 1 |
| **10-FINANCE-a** Setup + Reference | `finance_settings`, `cost_centers`, `currencies`, `exchange_rates`, `gl_account_mappings`; UI FIN-017/018/008/021; seed | T-002..T-008 | 7 |
| **10-FINANCE-b** Standard Costs | Versioned `standard_costs`, immutability trigger, SHA-256 e-signature, cost-per-kg dual-ownership trigger, UI MODAL-01/02/03/04/11 | T-009..T-014 | 6 |
| **10-FINANCE-c** WO Actual Costing | `work_order_costs` + consumption/labor/overhead, cascade rollup (recursive CTE), co-product allocation; UI FIN-003a/003 | T-015..T-020 | 6 |
| **10-FINANCE-d** Variance + Valuation | FIFO layers, WAC state, `cost_variances`, DSL rules register, FIFO/WAC handlers, yield handler; UI FIN-004/005/010 | T-021..T-026 | 6 |
| **10-FINANCE-e** D365 Stage 5 | `finance_outbox_events` (parallel namespace), `d365_finance_dlq`, daily consolidator, R15 adapter, dispatcher, DLQ ops; UI FIN-006/016 | T-027..T-030 | 4 |
| **10-FINANCE-cross** | FIN-001 dashboard + FIN-011 reports + MODAL-10 export | T-031, T-032 | 2 |

**Total: 32 atomic tasks.** P0 blocker: T-001 (priority 90, label `p0-blocker`).

## Key concepts

- **Standard cost** — versioned target cost per item; `standard_costs` table with effective-date `daterange`; GIST EXCLUDE no-overlap on `status='approved'`; immutability trigger (`prevent_approved_standard_cost_update`) blocks UPDATE on approved rows. Approve flow = 21 CFR Part 11 SHA-256 PIN e-signature.
- **Actual cost** — realized cost per WO computed from consumption (LP/WAC unit costs) + labor + overhead. Held in `work_order_costs` + 3 detail tables. Recursive CTE for cascade rollup across `wo_dependencies` (04-planning-basic).
- **Variance** — `cost_variances` per `(wo_id, category)`, category ∈ `material|labor|overhead|yield|waste`. Severity `info|warn|critical`. Finalized variance is immutable; only attached `variance_notes` are mutable (P1).
- **FIFO** — `inventory_cost_layers` per-LP lot. Consume order = `receipt_date ASC` under `SELECT FOR UPDATE`. Partial index `idx_fifo_consume … WHERE NOT is_exhausted` is required (query-plan-load-bearing).
- **WAC** — `item_wac_state` running average per `(org_id, item_id, currency_id)` UNIQUE. `avg_cost` is `GENERATED ALWAYS AS … STORED`. No negative inventory (V-FIN-INV-04).
- **Cost-per-kg** — dual ownership (see below).
- **Dual ownership policy** — same business datum, two authoritative perspectives, both must emit events.

## NUMERIC precision (HARD RULE)

**Never** declare a bare `NUMERIC` column. Always pin precision and scale.

| Column class | Drizzle / SQL declaration |
|---|---|
| Money (`unit_cost`, `total_cost`, `variance_amount`, `total_value`) | `NUMERIC(18,4)` |
| Quantity / kg (`qty_received_kg`, `qty_remaining_kg`, `total_qty_kg`) | `NUMERIC(14,3)` |
| Percent (`allocation_pct`, `variance_pct`) | `NUMERIC(8,2)` |
| FX rate | `NUMERIC(12,6)` |

Existing migrations may carry legacy `NUMERIC(15,4)` for money / `NUMERIC(12,3)` for quantity (per PRD §6.4 DDL sketches and bootstrap report). New tables and new columns MUST conform to the precisions above; ALTER existing only via an explicit migration with a backfill plan.

**Enforcement:** Validator F11 lint (`_meta/atomic-tasks` toolchain) fails any task introducing bare `NUMERIC`. Drizzle code review rejects `numeric()` without `{ precision, scale }`. Never use `FLOAT` / `REAL` / `DOUBLE PRECISION` for any monetary or quantity field — precision drift kills WAC and FIFO totals.

## Cost-per-kg dual ownership

`cost_per_kg` lives on `items.cost_per_kg` (Technical, module 03). Finance (10) snapshots valuation derived from it. The cross-module contract:

- **Technical (03)** owns the master `items.cost_per_kg` column. Writes there emit `technical.item.cost_per_kg_changed`.
- **Finance (10)** owns the valuation snapshots (`item_wac_state`, `inventory_cost_layers`). On any finance-side update derived from a tech change, emit `finance.cost_per_kg.changed`.
- **Both events** are required — Reporting (12) subscribes to both, joining on `item_id` to detect drift.
- **DB enforcement:** a column-level trigger on `items.cost_per_kg` gates direct mutations against `app.permissions` GUC. Worker handlers writing finance-derived updates set `app.current_role='finance_worker'` to satisfy the gate (T-010 schema + T-014 worker).
- Direct UPDATE of `items.cost_per_kg` from a finance Server Action without the worker role gate is **forbidden** — bypass = silent dual-ownership break.

See [[MON-domain-08-production]] and [[MON-domain-05-warehouse]] for the consuming events the finance worker subscribes to.

## FIFO/WAC valuation

- **Per-LP lot tracking:** every `license_plates` receipt creates one `inventory_cost_layers` row (`source_type ∈ po_receipt | wo_output | adjustment | d365_import`).
- **Valuation snapshot at consume time:** worker subscribes to `wh.material.consumed` (consumer in T-023). Under `SELECT FOR UPDATE` of layers ordered by `receipt_date ASC`, deplete `qty_remaining_kg`; emit `finance.consumption.valued`.
- **WAC alternative:** if `finance_settings.default_valuation_method='wac'`, update `item_wac_state` row (`total_qty_kg`, `total_value`) atomically; `avg_cost` recomputes via GENERATED column.
- **Monthly close:** worker job (T-032 lineage) snapshots all open layers + WAC state into a closed-period freeze; emits `finance.valuation.closed_monthly`. Reopening a closed period is a P2 operation (out of scope).
- **No negative inventory** (V-FIN-INV-04). FIFO consume must reject if no layer satisfies the request — DLQ the consume event, raise operator alert.

## D365 stage 5 dispatcher

**EXPORT-ONLY.** D365 is never a source of truth for any Monopilot domain concept (FG identity, factory_spec, release approval, factory usability). See [[MON-integrations-compliance]] §D365 and `_foundation/contracts/d365-posture.md`.

Pipeline:
1. Mutating finance action writes to `finance_outbox_events` (BIGSERIAL, UUID v7 `idempotency_key` per Foundation R14, partitioned monthly).
2. Daily consolidator (T-028) batches events per `(org_id, posting_date, gl_account)`.
3. R15 adapter (`@monopilot/d365-adapter` per PRD §5 R8) maps to D365 OData payload; attaches `_monopilot_export_meta` if `allow_non_usable_preload_export=true`.
4. Dispatcher pushes via DMF; failures route to `d365_finance_dlq` with exponential backoff (1s,2s,4s,8s,16s,32s; mirrors Foundation T-008 outbox worker).
5. Permanent-error replay is admin-only (V-FIN-INT-05 strict, T-029).

**Risk red lines (MUST appear in `risk_red_lines` of every D365-touching task — F13 audit):**
- D365 integration is strictly export-only (R15 anti-corruption contract per `_foundation/contracts/`) — MUST NOT mutate `factory_release_state` or any other canonical Monopilot state.
- Never use D365 IDs as primary keys; store under optional `d365_external_ids` metadata only.
- Never make D365 a hard dependency — `org_id` without D365 capability registry entry must operate normally.

`finance_outbox_events` is a parallel namespace to `packages/outbox` (per PRD §6.4 + §12). It reuses the worker/dispatcher/DLQ **pattern** from Foundation T-111 + 08-production §12, but does NOT couple to `packages/outbox` internals.

## Outbox events

| Event | Producer | Primary consumer(s) |
|---|---|---|
| `finance.standard_cost.approved` | T-011 (approve Server Action) | 12-reporting (MV refresh), 10-finance worker (cost cascade) |
| `finance.cost_per_kg.changed` | T-014 (worker writer) | 12-reporting (drift detection vs technical event), 10-finance (valuation re-snap) |
| `finance.variance.computed` | T-018 / T-024 (wo close + yield handler) | 12-reporting (KPI tiles), 10-finance dashboard |
| `finance.valuation.closed_monthly` | T-032 monthly close worker | 12-reporting (period reports), 10-finance audit export |
| `finance.consumption.valued` | T-023 (FIFO/WAC consume handler) | 12-reporting, downstream variance |

All emissions go through outbox — never direct queue write. All consumers run via Foundation T-111/T-112 worker registry.

## Cross-module deps

**Consumer (finance reads / depends on):**

| Module | Surface |
|---|---|
| 00-foundation | T-040 (R13 audit_events), T-046 (enum-lock guard), T-111 (worker scaffold), T-112 (outbox consumer registry), T-117/T-118 (observability/Sentry), T-124 (e-sign SHA-256 helper if shared, else inline crypto), T-125 (`withOrgContext` HOF + `app.current_org_id()`), R14 (UUID v7), R15 (anti-corruption) |
| 02-settings | `rules_registry` (T-018/T-035) for DSL handlers, `d365_constants` §11, `waste_categories` (DONE), `tax_codes`, feature flags |
| 03-technical | `items.cost_per_kg` master column, `bom_co_products.allocation_pct`, `items.item_type` |
| 04-planning-basic | `wo_dependencies` + V-PLAN-WO-CYCLE upstream cycle guard (consumed by cascade CTE in T-016) |
| 05-warehouse | `license_plates` FK, `wh.lp.received` + `wh.material.consumed` outbox events |
| 08-production | `work_orders`, `wo_outputs` (canonical here, not 04), `wo_waste_log`, `consumption_events`, `wo.completed` event, §12 outbox pattern reference |
| 09-quality | `ncr_reports` (read-only via `v_yield_loss_monthly` view) |

**Producer (finance emits — consumed downstream):**
- All 5 `finance.*` events listed above.
- Forward-declared consumer: **12-reporting** (MV refresh, KPIs, period reports).
- Forward-declared consumer: **11-shipping** (P2 invoicing pulls actual cost — out of P1 scope).

## Forbidden patterns

- Bare `NUMERIC` without `(precision, scale)`.
- `FLOAT` / `REAL` / `DOUBLE PRECISION` for money or quantity.
- Writing to `factory_release_state` (or any D365-owned canonical field) from a finance dispatcher.
- Treating a D365 export as factory release / factory-use approval (see `_foundation/contracts/d365-posture.md` §4).
- Using D365 IDs as primary keys or RLS boundary values (always `d365_external_ids` optional metadata).
- Direct UPDATE of `items.cost_per_kg` from a finance Server Action bypassing the `app.permissions` GUC trigger gate (breaks dual-ownership).
- Bypassing standard-cost approval e-signature (no client-side SHA-256, no raw PIN logging, server-only crypto).
- Mutating a finalized `cost_variances` row (only attached `variance_notes` are P1-mutable).
- Reopening a closed valuation period (P2 — out of scope).
- Negative inventory (V-FIN-INV-04) — FIFO consume with insufficient layers must DLQ + alert, not write a negative `qty_remaining_kg`.
- FX historical recompute on rate override (forward-only).
- Using `tenant_id` anywhere (project-wide Wave0 lock — `org_id` only).

## Verification checklist (per task closeout)

Before claiming GREEN on a 10-finance task, confirm:

1. All NUMERIC columns have explicit `(precision, scale)` — `git diff` shows no bare `numeric()` / `NUMERIC` token.
2. RLS policies on new tables reference `app.current_org_id()` (not raw `current_setting`).
3. Server Actions wrapped in `withOrgContext`; worker handlers register via Foundation T-111 registry.
4. Any D365-touching task has the R15 red line verbatim in `risk_red_lines`.
5. Mutating actions emit through outbox AND write `audit_events` (Foundation T-040 R13).
6. UI tasks with `prototype_match=true` cite `prototypes/design/Monopilot Design System/finance/<file>.jsx:<lines> (parity)` and follow `ui_evidence_policy` for closeout screenshots.
7. AC count ≤ 4 (F13 atomicity gate); fused ACs preserve original coverage in `test_strategy` notes.

## Cross-links

- [[MON-project-overview]] — repo map, tech stack lock, module glossary (READ FIRST)
- [[MON-t1-schema]] — Drizzle schema + migration authoring patterns
- [[MON-t2-api]] — Server Actions, auth-adjacent backend
- [[MON-foundation-primitives]] — outbox, worker, rate-limit, e-sign, GDPR, observability
- [[MON-multi-tenant-site]] — `org_id`, `site_id`, RLS, `withOrgContext` HOF
- [[MON-integrations-compliance]] — D365, BRCGS, CFR-21, GS1, GDPR (D365 export-only contract)
- [[MON-domain-production]] — `wo.completed`, `wo_outputs`, `wo_waste_log` (cost consumer events)
- [[MON-domain-warehouse]] — `lp.received`, `material.consumed`, LP valuation
- [[MON-domain-quality]] — NCR yield loss via `v_yield_loss_monthly`

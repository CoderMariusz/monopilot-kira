---
name: MON-domain-warehouse
description: "Use when implementing 05-warehouse tasks: License Plate (LP) management, FEFO inventory strategy, LP transition DSL, material.consumed/received events, spare parts stock. LP is the universal lot/quantity unit across consume/ship/scan."
version: 1.0.0
model: opus
canonical_spec: docs/prd/05-Warehouse-PRD.md
---

# MON-domain-warehouse — License Plates, FEFO, LP Transition DSL

**Purpose:** implementation guidance for any atomic task in `_meta/atomic-tasks/05-warehouse/` (58 tasks, T-001..T-058). License Plates (LP) are the atomic inventory unit (ADR-001) consumed by 06-scanner, 08-production, 09-quality, 10-finance, 11-shipping. Get LP wrong and the whole MES traceability chain breaks.

**Why this skill exists:** Warehouse is the canonical producer of LP events for FIVE downstream modules. The FEFO algorithm, transition DSL, and hold-gate cross-reference are load-bearing contracts; modules that re-implement them drift from the rule registry (`lp_state_machine_v1`, `fefo_strategy_v1`) and break ADR-029 (admin read-only) + V-WH-FEFO-005 (intermediate reservation forbidden). Read this skill before implementing any T-XXX in `05-warehouse/`.

## Required reading

1. `_meta/atomic-tasks/05-warehouse/coverage.md` + `manifest.json` + `UPGRADE-REPORT-2026-05-14.md`
2. `_meta/audits/2026-05-14-fixer-F1-tenant-and-foundation-citations.md` — Wave0 `org_id` sweep on 05-WH T-005/T-008/T-009/T-011/T-016
3. `_meta/audits/2026-05-14-fixer-F6-warehouse-ac-consolidation.md` — AC ≤4 cap; closeout-evidence hoisted from AC5 into `test_strategy` + `checkpoint_policy.closeout_requires`
4. `docs/prd/05-Warehouse-PRD.md` — full PRD (entities §5, transitions §6.1, GRN §7, stock moves §8, FEFO §9, genealogy §11, expiry §12, scanner contract §13, dashboards §14, labels §15)
5. `_meta/atomic-tasks/05-warehouse/tasks/T-002.json` (LP schema), `T-011.json` (FEFO index), `T-013.json` (lp_state_machine_v1 DSL seed)
6. `[[MON-foundation-primitives]]` + `[[MON-multi-tenant-site]]` before touching DB

## Sub-modules

From `coverage.md` "Coverage rows" table — 58 tasks across 17 sub-modules:

| Sub-module | Tasks | Coverage |
|---|---|---|
| `enum-lock` | T-001 | LP/qa/stock_move/qa_status enum lock + permission enum |
| `lp-core` | T-002, T-016..T-020, T-044 | LP table, numbering, split, merge, transitions, force-unlock |
| `lp-genealogy` | T-003, T-038 | Parent/child LP graph, traceability §11 |
| `reservations` | T-004, T-031, T-032 | RM root reservations (WH-016/017); intermediate forbidden |
| `grn` | T-005, T-021, T-022, T-024 | GRN-from-PO, GRN-from-TO, over/under receipt |
| `stock-moves` | T-006, T-025..T-028 | Stock movements, partial split, manual put-away, adj >10% gate |
| `pick-overrides` | T-007, T-033 | FEFO deviation warn (M-10) |
| `shelf-life` | T-008, T-035..T-037, T-052 | Shelf-life rules CRUD (WH-109 P1), expiry calc/cron, use_by override (M-12) |
| `settings` | T-009 | Warehouse settings page (WH-020) |
| `outbox` | T-010, T-047 | Outbox events for §7.6, §11.4 |
| `indexes` | T-011 | FEFO composite + ltree GiST + genealogy + stock_moves |
| `rls` | T-012 | RLS policies referencing `app.current_org_id()` |
| `rule-registry` | T-013..T-015 | `lp_state_machine_v1`, `fefo_strategy_v1`, FEFO deviation rules |
| `barcode` / `scanner` | T-023, T-034, T-039..T-042 | GS1-128 auto-fill, scanner APIs (§13) |
| `cycle-count` / `adjustment` / `putaway` | T-027, T-028, T-029 | P1 stubs; full WH-E14 → P2 |
| `fefo` | T-030 | `available_lp_picker` (WH-015) FEFO query |
| `labels` / `locations` / `rbac` | T-043, T-045, T-046 | ZPL/label print, inventory browser RBAC, locations hierarchy |
| `*-ui` | T-048..T-054 | 7 T3-ui surfaces with `prototype_match=true` |
| `*-e2e` | T-055..T-057 | Wiring tests + cross-module contracts + readiness validator |
| RBAC enum add | T-058 | 12 `warehouse.*` strings appended to permissions enum (2026-05-14) |

## Key concepts

### License Plate (LP)
Universal identifier for a quantity of material at a location at a point in time. Per ADR-001:
- **Holds:** `quantity` + `uom` + `catch_weight_kg` (dual-UoM), `status` (available/reserved/consumed/blocked/merged/shipped), `qa_status` (owned by 09-quality), `batch_number`, `supplier_batch_number`, `gtin`, `expiry_date`, `location_id`, `custodian` (via locked_by/locked_at)
- **Lineage cols:** `parent_lp_id`, `grn_id`, `wo_id`, `reserved_for_wo_id`, `consumed_by_wo_id`
- **Uniqueness:** `UNIQUE(org_id, warehouse_id, lp_number)` — never global; the `lp_number_seq_{org}_{warehouse}` sequence (T-016) is per-warehouse
- **Extensions:** `ext_jsonb` (tenant-customizable) and `private_jsonb` (server-only) per ADR-028
- **Constraints:** `CHECK(quantity >= 0)`, `CHECK(reserved_qty <= quantity)`, partial unique `(lp_id) WHERE status IN ('available','reserved')`

### FEFO (First-Expired-First-Out)
Pick rule: expire-earliest LP first; if equal expiry, lowest `lp_number` wins. The composite index on `(org_id, warehouse_id, product_id, status, expiry_date ASC NULLS LAST)` (T-011, §9.2) is MANDATORY; without it the §9.2 <500 ms SLO is unreachable.

### LP transition DSL
Declarative pipeline rules for LP state changes — `lp_state_machine_v1` seeded by T-013 into 02-SETTINGS `rule_registry`. Each transition record: `{from, to, guards: [...], allowed_reasons: [...]}`. ADR-029 says **admins are read-only**; the DSL changes go through PR/deploy, never an admin edit endpoint. `getAllowedTransitions(from_state)` is the only legitimate reader; client-side hardcoding is a red line (T-019/T-048).

States: `received → quarantine → released → consumed → shipped → returned` (plus `merged`, `blocked`). Per §6.1: `available ⇄ reserved → consumed; available → blocked → available; merge / shipped paths`.

## Canonical tables

| Table | Owner task | Purpose |
|---|---|---|
| `license_plates` (a.k.a. `lp`) | T-002 | Atomic inventory unit — 30+ cols per §5.2 |
| `lp_transitions` | T-019 (service emits) + lp_state_machine_v1 (T-013) | State-transition audit log; immutable once written |
| `lp_locations` | implicit via `license_plates.location_id` FK + 02-SETTINGS `locations` (ltree) | Where the LP physically sits; ltree zone roll-up via §8.6 GiST index |
| `lp_genealogy` | T-003 | Parent/child LP graph; powers §11 traceability; indexes (parent_lp_id, child_lp_id) — T-011 |
| `lp_reservations` | T-004, T-031, T-032 | RM-root only; **intermediate (`material_source='upstream_wo_output'`) is HARD-BLOCKED** (V-WH-FEFO-005 / Q6 revised) |
| `grns` / `grn_items` | T-005 | Goods receipt header + lines |
| `stock_moves` | T-006 | Movement log; partial moves split cascade (§8.2) |
| `shelf_life_rules` | T-008 | WH-109 Phase 1 CRUD (per 2026-05-03 decision) |
| `warehouse_settings` | T-009 | Per-org warehouse policy (WH-020) |
| `material_movement_log` | derived view over `stock_moves` + `lp_transitions` | Powers §11 + §14 dashboards |
| `spare_parts_stock` | (consumed by 13-maintenance MWO) | Stock subset for parts; not a separate table — `license_plates.product_id` carries the part SKU; maintenance reads via cross-mod contract |

All five core tables (`license_plates`, `stock_moves`, `lp_genealogy`, `lp_reservations`, `grns`) carry `org_id` (Wave0) and gain `site_id` via 14-MS T-030 ALTER (multi-site rollout).

## Outbox events

Producer prefix `wh.*` (registered in `_meta/specs/event-naming-convention.md`). Variants used in this module:

| Event | Producer task | Consumers | Payload essentials |
|---|---|---|---|
| `warehouse.lp.received` (a.k.a. `wh.lp.received`) | T-021 (GRN-from-PO), T-022 (GRN-from-TO) | 08-production (intermediate LP), 06-scanner (operator picking), 12-reporting | `lp_id, grn_id, product_id, quantity, uom, expiry_date, location_id, org_id, site_id` |
| `warehouse.lp.transitioned` (a.k.a. `wh.lp.transitioned`) | T-019 (state service) | 09-quality (qa_status mirror), 12-reporting, 14-multi-site | `lp_id, from_state, to_state, reason_code, actor_user_id, org_id, occurred_at` |
| `warehouse.material.consumed` (a.k.a. `wh.material.consumed`) | T-019 + T-034 (scanner consume) | 10-finance (valuation FIFO/WAC), 12-reporting, 15-OEE (downtime/consumption) | `lp_id, wo_id, quantity_consumed, batch_number, org_id, consumed_at`. **Emitted ONLY after 09-quality T-064 consume gate passes** — see Consume Gate cross-reference below. |
| `warehouse.lp.shipped` (a.k.a. `wh.lp.shipped`) | T-019 (transition to shipped) | 11-shipping (BOL/POD reconciliation), 12-reporting | `lp_id, so_id, sscc_18, shipped_at, org_id` |

Rules:
- **Outbox INSERT in same tx** as the state change (`license_plates` UPDATE or `stock_moves` INSERT). See `[[MON-foundation-primitives]]` §T-112.
- `event_type` ≤ 64 chars (migration 053). All four above are well under.
- Never `JSON.parse(payload)` at consume time — define Zod schema per event in `packages/outbox/src/events/wh.*.ts`.

## FEFO algorithm

§9.2, owner T-030 (service) + T-051 (`available_lp_picker` UI / WH-015). The picker MUST be implemented as:

```sql
-- pseudo, executed under withOrgContext (RLS auto-filters by org)
SELECT lp.*
FROM license_plates lp
LEFT JOIN v_active_holds h
  ON h.lp_id = lp.id  -- 09-quality view; holds short-circuit
WHERE lp.warehouse_id = $1
  AND lp.product_id   = $2
  AND lp.status       = 'available'
  AND lp.qa_status    = 'released'    -- 09-quality gate
  AND h.lp_id IS NULL                  -- exclude held LPs
ORDER BY lp.expiry_date ASC NULLS LAST, lp.lp_number ASC
LIMIT $top_n;
```

Pick top N matching the requested qty. The composite index (T-011) ensures the planner picks Index Scan (Seq Scan = AC failure). FEFO deviation (operator picks a non-earliest LP) is a **warning, never a hard block** after `reason_code` is provided — Q6B decision encoded in T-033 + T-051 (M-10 `fefo_deviation_modal`).

## LP transition DSL semantics

Source: `lp_state_machine_v1` (T-013 seed) consumed by T-019 service.

| `from` | trigger | `to` | required_conditions |
|---|---|---|---|
| `available` | `reserve` | `reserved` | RBAC `warehouse.lp.reserve`; not on hold (cross 09-quality); not intermediate |
| `reserved` | `consume` | `consumed` | RBAC `warehouse.lp.consume`; consume gate pass (09-quality T-064); WO active |
| `available` | `qa_block` | `blocked` | RBAC `warehouse.lp.block`; `reason_code` required, allowed list per registry |
| `blocked` | `qa_release` | `available` | RBAC `quality.hold.release`; signed by 09-quality |
| `available` | `merge_into(target)` | `merged` | RBAC `warehouse.lp.merge`; same product+batch+expiry; catch-weight sum mandatory (D14) |
| `available` | `ship` | `shipped` | RBAC `warehouse.lp.ship`; SO line allocated (11-shipping) |
| any | `force_unlock` | (unchanged state, clears `locked_by/locked_at`) | RBAC `warehouse.lp.force_unlock` (WH-101); reason_code required |

**Concurrency:** every transition acquires a row-level lock on the LP (`SELECT … FOR UPDATE`) — reject in-flight if `locked_by IS NOT NULL` and `locked_at > now() - INTERVAL '5 minutes'` (scanner lock protocol §6.6 / T-020). Force-unlock (WH-101) bypasses with elevated RBAC + audit row.

**Validation:** every transition MUST validate against the registry payload (call `getAllowedTransitions(from)` and assert `to ∈ result`). Hardcoded transitions in the service code = red line (T-019).

## Consume gate cross-reference

`warehouse.material.consumed` events are emitted **only after T-064 consume gate (09-quality) passes**. The gate checks:

1. `qa_status = 'released'` on the LP
2. No active hold in `v_active_holds` (09-quality view) for `(lp_id, product_id, batch_number)`
3. Allergen-cascade snapshot match (02-SETTINGS → 03-TECHNICAL `allergen_snapshots`)
4. Shelf-life rule pass (T-008 / WH-109 — `use_by_date > now()` unless override modal M-12 `use_by_override_modal` ran with reason_code)

If any gate fails, the transition service throws `consume_gate_failed` and emits **no** outbox event. See `[[MON-domain-quality]]` (hold/NCR/spec) and `[[MON-domain-production]]` (consume invocation site = WO operator action).

## Multi-site rollout

Per 14-MS T-030 ALTER + backfill (REC-L1 from MASTER report), the five core warehouse tables gain `site_id`:
`license_plates`, `stock_moves`, `lp_genealogy`, `lp_reservations`, `grns`.

Implications:
- Composite indexes shift to `(org_id, site_id, warehouse_id, product_id, status, expiry_date ASC NULLS LAST)` for at-site FEFO — T-011 already cites this shape under §9.2 (revise migration `0NN_warehouse_indexes.sql` to include `site_id` when 14-MS lands; do not pre-add before T-030 to avoid drift).
- `withSiteContext` wraps `withOrgContext` (see `[[MON-multi-tenant-site]]`); FEFO/transition services MUST be inside both.
- Inter-site transfer LP flows through 14-MS `transfer_orders` (TO) and lands as GRN-from-TO (T-022) — transit location §7.5 is the contractual handoff.

## Cross-module deps

### Producer (this module → others)
- `wh.lp.received` → 08-production (intermediate LP creation), 06-scanner (operator picking), 12-reporting
- `wh.lp.transitioned` → 09-quality (qa_status mirror, hold cascade), 12-reporting, 14-multi-site
- `wh.material.consumed` → 10-finance (FIFO/WAC valuation, T-028 D365 dispatcher), 12-reporting, 15-OEE
- `wh.lp.shipped` → 11-shipping (BOL/POD reconciliation), 12-reporting

### Consumer (others → this module)
- **02-settings:** rule_registry (`lp_state_machine_v1`, `fefo_strategy_v1`, `fefo_deviation_rules_v1`), `warehouses`, `locations` (ltree), `printers`, feature flags, `gs1_prefix`
- **03-technical:** `items`/`products`, `shelf_life_mode`/`date_code_format`, catch-weight enablement, allergen snapshots
- **04-planning-basic:** PO/TO/WO read models, RM root reservations, WO release/cancel hooks
- **06-scanner-p1:** LP lookup, barcode validation, lock protocol, FEFO suggestion, consume-to-WO
- **08-production:** WO material consumption invocation, output LP creation events
- **09-quality:** LP `qa_status` ownership, `quality_status_history`, `v_active_holds`, consume gate T-064, NCR-driven block
- **11-shipping:** downstream `shelf_life_rules` enforcement (P2)
- **13-maintenance:** spare-parts stock reads (treated as LP rows with `product_id` in the parts-SKU range)
- **14-multi-site:** `site_id` column ALTER + inter-site TO

## Forbidden patterns (red lines)

| # | Pattern | Why forbidden | Source |
|---|---|---|---|
| 1 | Bypass FEFO ordering without operator-recorded `reason_code` + audit | Loss of traceability + shelf-life liability | §9.3 / T-033 M-10 |
| 2 | Skip the hold-gate cross-join with 09-quality `v_active_holds` | Held LP gets consumed → recall scope blown | T-030 / T-064 |
| 3 | Mutate (`UPDATE`/`DELETE`) finalized rows in `lp_transitions` | Audit log is append-only by contract | §6.1 |
| 4 | Skip `getAllowedTransitions()` validation; hardcode transitions in the service | Server-driven state machine (ADR-029); registry IS the SoT | T-013 / T-019 |
| 5 | Reserve an intermediate LP (`material_source='upstream_wo_output'`) | V-WH-FEFO-005 / Q6 revised: only RM-root reservations | T-031 |
| 6 | `current_setting('app.tenant_id')` / `current_setting('app.current_org_id')` | Wave0 lock; use `app.current_org_id()` function | F1 fixer |
| 7 | Column named `tenant_id` instead of `org_id` | Wave0 v4.3 lock; 5× 05-WH tasks rewrote this 2026-05-14 | F1 fixer |
| 8 | GRN multi-LP-per-line auto-split/merge | Q1: operator MUST receive lines as-issued | T-005 / T-021 / T-049 / T-055 |
| 9 | Client-side `canSeeValue` check for inventory value | RBAC must be server-side; SUM never computed for non-Manager | T-045 / T-053 |
| 10 | Outbox INSERT outside the state-change transaction | Consumers see rolled-back state or miss events | foundation T-112 |
| 11 | Admin edit endpoint for `lp_state_machine_v1` / FEFO DSL | ADR-029 admin read-only; PR/deploy only | T-013 |
| 12 | Quarantine auto-moves the LP to a quarantine location | D18 baseline: quarantine is a status, not a physical move | T-025 |
| 13 | ZPL real backend on browser preview | BL-WH-04: HTML preview only, ZPL stays server-side | T-043 / T-054 |

## Recurring live-bugs (pass vitest+tsc, break live — full checklist: `docs/workflow/02-QUALITY-GATES.md` §Recurring live-bug checklist)

Before any 05-warehouse sign-off, run the canonical Gate-5 checklist (classes 1-12). Warehouse-specific traps:
1. **RBAC seed (class 1, #1 live bug).** Ship a wave-1 P0 `NNN-warehouse-permission-seed.sql` granting `warehouse.*` (LP/GRN/FEFO/transition/stock) to the org-admin family (`org.access.admin`/`org.platform.admin`/`owner`/`admin`/`org_admin`) AND operator/scanner roles, in BOTH `role_permissions` + legacy jsonb, with org-insert trigger + backfill. Page-CHECK strings must byte-match seed-GRANT strings. Model on `packages/db/migrations/149-npd-permissions-org-admin-seed.sql`.
2. **Reference/DSL seed = both halves (class 9).** The LP/FEFO state-machine DSL (`lp_state_machine_v1`, `fefo_strategy_v1`, `fefo_deviation_rules_v1`) and any `Reference.*`-fed Select must be BOTH wired (loader queries the table) AND seeded (org-insert trigger + backfill). A registry that ships the schema but seeds zero rows for the org = empty transition picker / "no allowed transitions" live, all tests green (this is exactly the 156-class bug from NPD).
3. **Outbox enum (class 5).** `wh.lp.*`/`wh.material.*` events MUST be in `packages/outbox/src/events.enum.ts` + CHECK before emit; outbox INSERT inside the state-change txn (Forbidden #10).
4. **Schema task names its consumer (class 10).** An LP/genealogy/reservation migration is not "done" until its consuming transition Server Action + scanner/FEFO UI ship.
5. **Regenerate `__expected__/schema.sql` after each migration; 3-digit name ≥ HEAD; never edit an applied migration (class 4).**

## Cross-links

- `[[MON-project-overview]]` — repo map, tech stack, module glossary
- `[[MON-t1-schema]]` — Drizzle schema + RLS migration authoring for `license_plates`, `lp_genealogy`, `lp_reservations`, `grns`, `stock_moves`
- `[[MON-t2-api]]` — Server Actions for LP transitions, GRN, FEFO picker, scanner endpoints
- `[[MON-foundation-primitives]]` — outbox (T-112), worker (T-111), e-sign (T-124), `withOrgContext` (T-125), event-naming convention
- `[[MON-multi-tenant-site]]` — `org_id` + `site_id` HOFs; required wrap for every FEFO/transition call
- `[[MON-domain-quality]]` — hold gate (`v_active_holds`), consume gate T-064, qa_status ownership
- `[[MON-domain-production]]` — WO consume invocation site, intermediate LP creation
- `[[MON-domain-shipping]]` — LP→ship transition, SSCC-18 BOL release
- `[[MON-domain-finance]]` — FIFO/WAC valuation consuming `wh.material.consumed`
- `[[MON-domain-maintenance]]` — spare-parts stock reads

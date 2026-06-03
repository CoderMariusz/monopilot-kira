# 05-warehouse — Reality Audit (2026-06-02)

## Counts
- task files: 58 | manifest task_count: 58 | STATUS rows: 0 (STATUS.md did not exist) → reconciliation: EXACT MATCH on count; no prior STATUS tracking.

## Task reality

| Task | Title (abbrev) | Declared type | Verdict | Evidence (path) | Gap / note |
|---|---|---|---|---|---|
| T-001 | Lock 4 warehouse enums | T1-schema | ⛔ MISSING | `packages/db/src/schema/warehouse-enums.ts` absent; `packages/db/migrations/0NN_warehouse_enums.sql` absent | No lp_status/lp_qa_status/item_type_snapshot/lp_source PG enums anywhere |
| T-002 | license_plates table + RLS + FEFO index | T1-schema | ⛔ MISSING | `packages/db/src/schema/license-plates.ts` absent; no migration with LP table | Core LP table does not exist |
| T-003 | lp_genealogy table + FSMA 204 | T1-schema | ⛔ MISSING | `packages/db/src/schema/lp-genealogy.ts` absent | ltree column, DAG invariant, genealogy index all absent |
| T-004 | lp_reservations table | T1-schema | ⛔ MISSING | `packages/db/src/schema/lp-reservations.ts` absent | No partial-unique RM-root-only constraint |
| T-005 | grns + grn_items tables | T1-schema | ⛔ MISSING | `packages/db/src/schema/grns.ts` absent | No GRN/GRN-items tables |
| T-006 | stock_moves table + move_type ENUM | T1-schema | ⛔ MISSING | `packages/db/src/schema/stock-moves.ts` absent | No stock_moves table |
| T-007 | pick_overrides audit table | T1-schema | ⛔ MISSING | `packages/db/src/schema/pick-overrides.ts` absent | |
| T-008 | shelf_life_rules table | T1-schema | ⛔ MISSING | `packages/db/src/schema/shelf-life-rules.ts` absent | |
| T-009 | warehouse_settings table + 41 toggles | T1-schema | ⛔ MISSING | `packages/db/src/schema/warehouse-settings.ts` absent | infra `warehouses` table in 042-infra-master.sql is a different table |
| T-010 | Warehouse outbox event-type catalog | T1-schema | ⛔ MISSING | `packages/outbox/src/warehouse-events.ts` absent; only `LP_RECEIVED` stub in events.enum.ts (from foundation); no 3-segment warehouse event types | `packages/outbox/src/events.enum.ts` has single `LP_RECEIVED` as untyped stub |
| T-011 | Warehouse indexes (FEFO, ltree, genealogy) | T1-schema | ⛔ MISSING | `packages/db/migrations/0NN_warehouse_indexes.sql` absent | Depends on T-001→T-006; those are all MISSING |
| T-012 | Warehouse RLS policies + org isolation audit | T1-schema | ⛔ MISSING | `packages/db/migrations/0NN_warehouse_rls.sql` absent; no RLS tests for LP/GRN/stock tables | |
| T-013 | Seed lp_state_machine_v1 DSL rule | T5-seed | ⛔ MISSING | `packages/db/seed/rules/lp-state-machine-v1.json` absent; no seed directory exists | rule_registry table exists (migration 039) but no warehouse rules seeded |
| T-014 | Seed fefo_strategy_v1 DSL rule | T5-seed | ⛔ MISSING | `packages/db/seed/rules/fefo-strategy-v1.json` absent | |
| T-015 | Seed fifo_strategy_v1 DSL rule | T5-seed | ⛔ MISSING | `packages/db/seed/rules/fifo-strategy-v1.json` absent | |
| T-016 | LP create + per-warehouse numbering | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/lp-create.ts` absent | No warehouse services directory |
| T-017 | LP split service | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/lp-split.ts` absent | |
| T-018 | LP merge service + catch-weight sum | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/lp-merge.ts` absent | |
| T-019 | LP state-transition service | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/lp-state-transition.ts` absent; `packages/db/src/schema/lp-state-history.ts` absent | |
| T-020 | Scanner LP locking service | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/lp-locking.ts` absent | |
| T-021 | GRN from PO Server Action | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/grn-from-po.ts` absent | |
| T-022 | GRN from TO Server Action | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/grn-from-to.ts` absent | |
| T-023 | GS1-128 barcode parser service | T2-api | ⛔ MISSING | `packages/barcode-parser/src/gs1-parser.ts` absent; `packages/gs1` exists with `parse.ts` + `check-digit.ts` but these are NOT the T-023 target file/package | gs1 package present but wrong shape — T-023 scopes `packages/barcode-parser/` which does not exist |
| T-024 | Under-receipt PO line force-close | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/po-line-force-close.ts` absent | |
| T-025 | Stock move service | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/stock-move.ts` absent | |
| T-026 | Partial-move split cascade | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/stock-move-split-cascade.ts` absent | |
| T-027 | Manual put-away service | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/putaway.ts` absent | |
| T-028 | Adjustment service + >10% manager-approval gate | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/lp-adjustment.ts` absent; `packages/db/src/schema/movement-approvals.ts` absent | |
| T-029 | Cycle-count quick-adjustment service | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/cycle-count-quick-adj.ts` absent | |
| T-030 | FEFO query API | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/fefo-query.ts` absent | |
| T-031 | Reservation create service | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/reservation-create.ts` absent | |
| T-032 | Reservation release service | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/reservation-release.ts` absent | |
| T-033 | Pick override audit service | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/pick-override-log.ts` absent | |
| T-034 | Scanner consume-to-WO endpoint | T2-api | ⛔ MISSING | `apps/web/app/api/warehouse/scanner/consume-to-wo/route.ts` absent; no `/api/warehouse/` routes at all | |
| T-035 | Expiry calc on GRN ingest | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/expiry-calc.ts` absent | |
| T-036 | Daily expiry cron job | T2-api | ⛔ MISSING | `apps/web/app/api/cron/warehouse/expiry-check/route.ts` absent | |
| T-037 | use_by manager override service | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/use-by-override.ts` absent; `packages/db/src/schema/use-by-override-log.ts` absent | |
| T-038 | Lot genealogy recursive-CTE trace | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/genealogy-trace.ts` absent | |
| T-039 | Scanner LP inventory query API | T2-api | ⛔ MISSING | `apps/web/app/api/warehouse/scanner/inventory/route.ts` absent | |
| T-040 | Barcode lookup endpoints | T2-api | ⛔ MISSING | `apps/web/app/api/warehouse/scanner/lookup/lp/[barcode]/route.ts` absent | |
| T-041 | Scanner login endpoint (username + PIN) | T2-api | ⛔ MISSING | `apps/web/app/api/warehouse/scanner/login/route.ts` absent; `packages/db/src/schema/scanner-sessions.ts` absent | |
| T-042 | Scanner FEFO suggest endpoint | T2-api | ⛔ MISSING | `apps/web/app/api/warehouse/scanner/suggest-lp/route.ts` absent | |
| T-043 | ZPL label generation + print endpoint | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/zpl-renderer.ts` absent | |
| T-044 | Force-unlock scanner LP | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/lp-force-unlock.ts` absent | |
| T-045 | Inventory-value RBAC server-side gating | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/inventory-value-rbac.ts` absent | |
| T-046 | Location deactivate guard service | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/location-deactivate.ts` absent | |
| T-047 | Outbox emission wiring across warehouse services | T2-api | ⛔ MISSING | `apps/web/lib/services/warehouse/emit-warehouse-event.ts` absent; depends on T-010 (MISSING) | |
| T-048 | UI: LP core surfaces (list + detail + 5 modals) | T3-ui | ⛔ MISSING | `apps/web/app/(app)/warehouse/lps/` absent; `apps/web/components/warehouse/lp/` absent | Prototype exists: `prototypes/design/Monopilot Design System/warehouse/lp-screens.jsx` (571 lines); anchor ranges valid |
| T-049 | UI: GRN surfaces | T3-ui | ⛔ MISSING | `apps/web/app/(app)/warehouse/grn/` absent | Prototype exists: `prototypes/design/Monopilot Design System/warehouse/grn-screens.jsx` (171 lines) |
| T-050 | UI: Stock movement & adjustment surfaces | T3-ui | ⛔ MISSING | `apps/web/app/(app)/warehouse/movements/` absent | Prototype exists: `prototypes/design/Monopilot Design System/warehouse/movement-screens.jsx` (295 lines) |
| T-051 | UI: FEFO reservations picker + WO panel | T3-ui | ⛔ MISSING | `apps/web/components/warehouse/reservations/` absent | Prototype: modals.jsx (1296 lines) |
| T-052 | UI: Expiry + shelf-life-rules surfaces | T3-ui | ⛔ MISSING | `apps/web/app/(app)/warehouse/expiry/` absent | |
| T-053 | UI: Warehouse dashboard + inventory + locations + settings | T3-ui | 🟡 STUB | `apps/web/app/[locale]/(app)/(modules)/warehouse/page.tsx` exists — shows skeleton data panel with "lot" count from Supabase; NO lp/inventory/locations/settings sub-pages | Declares `getModuleCount("lot")` — real DB read but no warehouse domain tables yet; no `/warehouse/inventory`, `/warehouse/locations`, `/warehouse/settings/shelf-life-rules` sub-routes |
| T-054 | UI: Labels + Genealogy traceability | T3-ui | ⛔ MISSING | `apps/web/components/warehouse/labels/` absent; `apps/web/app/(app)/warehouse/genealogy/` absent | |
| T-055 | E2E: Warehouse P1 critical paths | T4-wiring-test | ⛔ MISSING | `apps/web/e2e/warehouse/` absent | No warehouse E2E spec files |
| T-056 | Cross-module contract tests | T4-wiring-test | ⛔ MISSING | `packages/contracts/warehouse/` absent; `apps/web/e2e/contracts/warehouse-cross-module.spec.ts` absent | |
| T-057 | Warehouse readiness validator + prototype-label guard | T4-wiring-test | ⛔ MISSING | `_meta/atomic-tasks/05-warehouse/_validate.py` absent; `_meta/atomic-tasks/05-warehouse/coverage.md` absent | |
| T-058 | Add warehouse permission strings to enum | T1-schema | ⛔ MISSING | `packages/rbac/src/permissions.enum.ts` contains NO warehouse permission strings | |

## Phantom / carry-forward backlog
None — no STATUS.md previously existed and no cross-module carry-forward references to 05-warehouse tasks were found in existing STATUS.md files.

## Extra (code without a task)
- `apps/web/app/[locale]/(app)/(modules)/warehouse/page.tsx` — skeleton module landing page showing `getModuleCount("lot")` from Supabase; partially satisfies T-053 but is a skeleton stub, not a full warehouse dashboard. Likely belongs to Wave 0 skeleton work (T-134 reference in scanner page, similar pattern).
- `apps/web/actions/infra/warehouse.ts` — `createWarehouse` / `deactivateWarehouse` server actions with `withOrgContext`; belong to **02-settings** infra (T-042 in foundation/settings), not to 05-warehouse tasks.
- `apps/web/app/[locale]/(app)/(admin)/settings/infra/warehouses/` — CRUD pages for warehouse master data (settings domain); not owned by 05-warehouse tasks.
- `packages/gs1/src/parse.ts` + `check-digit.ts` — GS1 parsing utilities that partially overlap T-023's intent, but T-023 scopes `packages/barcode-parser/` (non-existent). These are likely the intended implementation home but the task JSON has the wrong package path.
- `packages/outbox/src/events.enum.ts` — contains single `LP_RECEIVED = 'lp.received'` stub from foundation; T-010 requires a full warehouse event catalog (`packages/outbox/src/warehouse-events.ts`) — not yet written.

## Top integration risks
1. **Total schema absence blocks all downstream modules.** 05-warehouse is declared as a `cross_module_dependencies` source for 06-scanner-p1, 08-production, 09-quality, and 11-shipping. None of the LP, GRN, stock_moves, lp_reservations, or lp_genealogy tables exist in the DB. Any cross-module work touching LP ownership (qa_status, consume-to-WO, shipment) will fail to compile against real Drizzle schema until T-001–T-012 land.
2. **T-023 package path mismatch.** Tasks scope `packages/barcode-parser/src/gs1-parser.ts` but `packages/gs1/` already exists with overlapping functionality (`parse.ts`, `check-digit.ts`). Implementors will create a duplicate package or lose existing GS1 work. Requires task reconciliation before implementation.
3. **Scanner module (06-scanner-p1) hard-depends on T-034/T-039–T-042 API routes.** The scanner dev page (`apps/web/app/[locale]/(scanner)/dev/scanner/page.tsx`) is a T-134 stub with no backend. Warehouse API routes (`/api/warehouse/scanner/*`) are all MISSING. Cross-module block for the entire scanner P1 module.

## Skeleton contribution
- The warehouse module landing page (`apps/web/app/[locale]/(app)/(modules)/warehouse/page.tsx`) is wired into the Walking Skeleton and renders real Supabase data (`getModuleCount("lot")`). This is the only warehouse artifact relevant to the skeleton.
- No LP/GRN/stock domain tables exist in Supabase, so no warehouse domain pages can render real data. The module is accessible from the nav but only shows a skeleton data panel.
- 05-warehouse has **zero implemented tasks** (1 skeleton stub counts as 🟡 STUB for T-053, 57 are ⛔ MISSING). The module is pre-skeleton from a domain perspective.

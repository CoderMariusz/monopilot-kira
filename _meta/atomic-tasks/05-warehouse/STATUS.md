# 05-warehouse — Task Status

Legend: ✅ DONE | 🔄 IN PROGRESS | ⏸ BLOCKED/STUB | ⬜ NOT STARTED

> **Reality audit date:** 2026-06-02
> **Auditor:** kira:audit Phase 0
> **Result:** 0 implemented, 1 stub (T-053 skeleton landing only), 57 missing. No prior STATUS.md existed.

## Schema (T1-schema)

| ID | Title | Status | Note |
|---|---|---|---|
| T-001 | Lock 4 warehouse enums | ⬜ | No migration, no Drizzle schema, no TS unions |
| T-002 | license_plates table + RLS + FEFO index | ⬜ | Core LP table absent from DB |
| T-003 | lp_genealogy table + FSMA 204 indexes | ⬜ | ltree, DAG invariant — all absent |
| T-004 | lp_reservations table | ⬜ | |
| T-005 | grns + grn_items tables | ⬜ | |
| T-006 | stock_moves table + move_type ENUM | ⬜ | |
| T-007 | pick_overrides audit table | ⬜ | |
| T-008 | shelf_life_rules table | ⬜ | |
| T-009 | warehouse_settings table + 41 toggle defaults | ⬜ | `warehouses` infra table (042-infra-master.sql) is settings domain, not this task |
| T-010 | Warehouse outbox event-type catalog | ⬜ | Only `LP_RECEIVED` stub in events.enum.ts; warehouse-events.ts absent |
| T-011 | Warehouse indexes (FEFO composite, ltree GiST, genealogy) | ⬜ | Blocked: T-001→T-006 all missing |
| T-012 | Warehouse RLS policies + org isolation audit | ⬜ | Blocked: tables absent |
| T-058 | Add warehouse permission strings to RBAC enum | ⬜ | No warehouse strings in `packages/rbac/src/permissions.enum.ts` |

## Seeds (T5-seed)

| ID | Title | Status | Note |
|---|---|---|---|
| T-013 | Seed lp_state_machine_v1 DSL rule | ⬜ | `packages/db/seed/rules/` does not exist; rule_registry table exists (mig 039) |
| T-014 | Seed fefo_strategy_v1 DSL rule | ⬜ | |
| T-015 | Seed fifo_strategy_v1 DSL rule | ⬜ | |

## Services / API (T2-api)

| ID | Title | Status | Note |
|---|---|---|---|
| T-016 | LP create + per-warehouse numbering service | ⬜ | No `apps/web/lib/services/warehouse/` directory |
| T-017 | LP split service | ⬜ | |
| T-018 | LP merge service + catch-weight sum | ⬜ | |
| T-019 | LP state-transition service | ⬜ | |
| T-020 | Scanner LP locking service (5-min auto-release) | ⬜ | |
| T-021 | GRN from PO Server Action | ⬜ | |
| T-022 | GRN from TO Server Action | ⬜ | |
| T-023 | GS1-128 barcode parser service | ⬜ | `packages/gs1/` exists with parse.ts/check-digit.ts but task scopes `packages/barcode-parser/` (non-existent) — PATH MISMATCH; reconcile before implementation |
| T-024 | Under-receipt PO line force-close service | ⬜ | |
| T-025 | Stock move service | ⬜ | |
| T-026 | Partial-move split cascade | ⬜ | |
| T-027 | Manual put-away service | ⬜ | |
| T-028 | Adjustment service + >10% manager-approval gate | ⬜ | |
| T-029 | Cycle-count quick-adjustment service | ⬜ | |
| T-030 | FEFO query API (rule-registry-driven) | ⬜ | |
| T-031 | Reservation create service (RM root only) | ⬜ | |
| T-032 | Reservation release service | ⬜ | |
| T-033 | Pick override audit service | ⬜ | |
| T-034 | Scanner consume-to-WO endpoint | ⬜ | No `/api/warehouse/` routes exist |
| T-035 | Expiry calc on GRN ingest | ⬜ | |
| T-036 | Daily expiry cron job | ⬜ | |
| T-037 | use_by manager override service | ⬜ | |
| T-038 | Lot genealogy recursive-CTE trace service | ⬜ | |
| T-039 | Scanner LP inventory query API | ⬜ | |
| T-040 | Barcode lookup endpoints | ⬜ | |
| T-041 | Scanner login endpoint (username + PIN) | ⬜ | |
| T-042 | Scanner FEFO suggest endpoint | ⬜ | |
| T-043 | ZPL label generation + print endpoint | ⬜ | |
| T-044 | Force-unlock scanner LP (Admin only) | ⬜ | |
| T-045 | Inventory-value RBAC server-side gating | ⬜ | |
| T-046 | Location deactivate guard service | ⬜ | |
| T-047 | Outbox emission wiring across warehouse services | ⬜ | Blocked: T-010 absent |

## UI (T3-ui)

| ID | Title | Status | Note |
|---|---|---|---|
| T-048 | UI: LP core surfaces (list + detail + 5 modals) | ⬜ | Prototypes valid (`lp-screens.jsx` 571L, `modals.jsx` 1296L); no implementation |
| T-049 | UI: GRN surfaces | ⬜ | `grn-screens.jsx` 171L available |
| T-050 | UI: Stock movement & adjustment surfaces | ⬜ | `movement-screens.jsx` 295L available |
| T-051 | UI: FEFO reservations picker + WO panel | ⬜ | |
| T-052 | UI: Expiry + shelf-life-rules surfaces | ⬜ | |
| T-053 | UI: Warehouse dashboard + inventory + locations + settings | ⏸ | Skeleton page exists at `apps/web/app/[locale]/(app)/(modules)/warehouse/page.tsx` — real Supabase read (`getModuleCount("lot")`) but no domain sub-pages; counts as Wave 0 stub only |
| T-054 | UI: Labels + Genealogy traceability | ⬜ | |

## Tests (T4-wiring-test)

| ID | Title | Status | Note |
|---|---|---|---|
| T-055 | E2E: Warehouse P1 critical paths | ⬜ | No `apps/web/e2e/warehouse/` directory |
| T-056 | Cross-module contract tests | ⬜ | No `packages/contracts/warehouse/` |
| T-057 | Warehouse readiness validator + prototype-label guard | ⬜ | `coverage.md` and `_validate.py` absent |

---

## Summary
- **Total tasks:** 58
- **⬜ NOT STARTED (MISSING):** 57
- **⏸ STUB:** 1 (T-053 — skeleton landing page only)
- **✅ DONE:** 0
- **Blockers for first task:** T-001 (enums) must land before T-002–T-012; T-023 has a package path mismatch requiring reconciliation.


## Sidecar fold-in (2026-06-04)

New tracked tasks:

| Task | Title | Status | Note / Sequence |
|---|---|---|---|
| T-059 | Seed warehouse.* permissions onto roles (NNN-warehouse-permission-seed.sql) | ⬜ PENDING | X-1 RBAC-seed (BLOCKER B1). **wave-1 p0**, after T-058 enum. Per-role grants per PRD §3; org-admin full set; wire nav permission_key. |
| T-060 | Consolidate GS1/barcode parser to packages/gs1 | ⬜ PENDING | **do FIRST**, before T-023 and SCN T-003. Resolves triple-conflict (barcode-parser / scanner-utils / lib/utils) → one shared `packages/gs1`. |

Refinements (no new task):

| Item | Type | Status | Note |
|---|---|---|---|
| Migration renumber (X-2) | consolidation pass | ⬜ TODO | Renumber warehouse migrations to ≥ current HEAD (149) before build; runner regex `^(\d{3})-[a-z0-9-]+\.sql$` — stale `0NN_` numbers sort before HEAD and silently never run. |

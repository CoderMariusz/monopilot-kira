# PROPOSED TASK — [P2] Harden warehouse actions: unify permission check + guard work_orders

**Module:** 02-settings · **Severity:** P2 · **Source:** side-car audit F5 + F6

## Problem
1. Two divergent `hasPermission` implementations:
   - write action `apps/web/actions/infra/warehouse.ts:187-200` has a role-name fallback `['owner','admin','module_admin']`.
   - load path `apps/web/app/[locale]/(app)/(admin)/settings/infra/warehouses/page.tsx:145-158` has none.
   The fallback list never matches seeded role codes (`org.access.admin`… per `037-settings-core.sql`), so it is dead
   code and creates inconsistent allow/deny between load and write.
2. `deactivateWarehouse` queries `public.work_orders` unguarded (`warehouse.ts:173-185`). `work_orders` exists in no
   migration → throw → `persistence_failed`. The load path already guards the same table via `to_regclass`
   (`page.tsx:160-179`); the action does not.

## Acceptance criteria
1. Single shared `hasInfraPermission` helper used by both load and all `actions/infra/*.ts`, with role codes that
   match what is actually seeded (or, preferably, rely solely on the seeded permission from F1 and drop the dead
   role-name fallback).
2. `countActiveWorkOrders` capability-gated with `to_regclass('public.work_orders')` — returns 0 (allow deactivate)
   when the table/columns are absent, consistent with the load path.
3. Unit/integration test: deactivate succeeds when `work_orders` is absent; soft-warning path still works when present.
4. `pnpm --filter web vitest run apps/web/actions/infra/crud.test.ts` green (captured output).

## Dependencies
- F1 (infra perms seeded) and F2 (canonical strings) should land first so the helper checks the right permission.

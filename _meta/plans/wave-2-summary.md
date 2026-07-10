# Wave 2 — Planning list integrity + RBAC (summary)

## Bug 1 (P0) — PO list: server-side filters on paginated data

**Problem:** `PoListView` filtered search, status tabs, and supplier client-side on the current 50-row page while `listPurchaseOrders` already supported SQL filters — POs on page 2+ were unfindable.

**Fix:**
- Extended `listPurchaseOrders` with `supplierId` SQL filter (`$5::uuid`) alongside existing `status` / `q` / site / archived predicates.
- `page.tsx` parses `?q=&status=&supplier=` (+ `page`, `archived`) and passes filters into the action.
- `PoListView` uses URL as source of truth: tabs/supplier navigate via `buildListPageHref`, search debounces 300ms into `?q=`, page resets to 1 on filter change.
- `createExportJob` passes `supplierId` into `listPurchaseOrders` (removed client-side supplier narrowing).

**Tests:** `actions.test.ts` asserts filter SQL params + `group by po.status`; `purchase-orders.test.tsx` asserts URL navigation/debounce.

---

## Bug 2 (P0) — PO tab counters from full org set

**Problem:** Tab counts were derived from the loaded page slice (`purchaseOrders.length`).

**Fix:** `listPurchaseOrders` now runs `count(*) … group by po.status` with the same `PO_LIST_FILTER_WHERE` as the list query but with `status = null` (status filter excluded). Returns `statusCounts: PoStatusCounts` (`all` + per-status, zero-filled).

**Tests:** `actions.test.ts` asserts grouped counts payload and `group by po.status` params.

---

## Bug 3 (P0) — WO list: same pattern

**Problem:** `WoListView` client-filtered status/search on the paginated slice; `listPlanningWorkOrders` already had `WO_LIST_WHERE` for `$1` status and `$2` ilike.

**Fix:**
- `listPlanningWorkOrders` accepts `q` alias for `search`; page passes `?status=&q=`.
- Added `statusCounts` via `group by wo.status` (same filter minus status).
- `WoListView` mirrors PO URL/debounce pattern.

**Tests:** `listPlanningWorkOrders.test.ts` + `work-orders.test.tsx`.

---

## Bug 4 (P0) — TO list: same pattern

**Problem:** Transfer-order list page only typed `{new, archived, page}`; client-side filter on page slice.

**Fix:**
- `listTransferOrders` returns `statusCounts` from `group by transfer_orders.status`.
- `page.tsx` / `ToListView` wire `?status=&q=` server-side (debounced search).

**Tests:** `transfer-orders/_actions/actions.test.ts` + `transfer-orders.test.tsx`.

---

## Bug 5 (P1) — Planning RBAC on mutations

**Problem:** PO/TO/supplier mutations used broad `npd.planning.write` via `hasPlanningWritePermission`; no dedicated `planning.po.*` / `planning.to.*` / `planning.supplier.*` permissions in seeds.

**Fix:**
- **MIGRATION ADDED (additive seed-only):** `packages/db/migrations/464-planning-procurement-manage-permissions.sql` seeds `planning.po.manage`, `planning.to.manage`, `planning.supplier.manage` to the same admin + planner role families as `planning.mrp.run` (migration 301 pattern). `INSERT … ON CONFLICT DO NOTHING` + jsonb merge + org-insert trigger + backfill.
- `packages/rbac/src/permissions.enum.ts` — three new permission constants.
- `procurement-shared.ts` — `requireActionPermission` helper returning typed `{ ok: false, error: 'forbidden' }`.
- Mutations gated with domain permissions:
  - `planning.po.manage` — PO actions, `create-purchase-order-core`, `import-po.ts`, `create-export-job.ts`
  - `planning.to.manage` — TO `actions.ts`, `import-to.ts`
  - `planning.supplier.manage` — `suppliers/_actions/actions.ts`
- Reads unchanged (RLS-scoped list/get).

**Tests:** Action tests mock `planning.po.manage` / `planning.to.manage` / `planning.supplier.manage` and assert `{ ok: false, error: 'forbidden' }` on denial.

---

## Gates

- `pnpm --filter web exec tsc --noEmit` — clean
- Vitest (touched files): PO/WO/TO/supplier action tests + list UI tests — all green

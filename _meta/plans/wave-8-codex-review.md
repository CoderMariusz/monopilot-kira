# Wave 8 fix-round re-review — `fix/wave8-shipping`

## Per-bug assessment

### Bug 1 — production fix correct, required action-level test BROKEN

The production cancellation path is now snapshot-authoritative. `lockShipmentLps` builds `shipment_lp_snapshots` directly from `shipments.ext_data.shipped_license_plates`, uses those rows as the first arm of `restore_set`, and admits `shipment_lps` only when `has_snapshot.has_rows` is false (`cancelShipment.ts:203-254`). Consequently an LP present in the immutable snapshot but absent from current `shipment_box_contents` is included and restored. Snapshot quantity, prior status, and prior reserved quantity drive the restoration. The legacy contents aggregate is used only when the shipment has no snapshot rows.

Full- and partial-LP restoration remains exact PostgreSQL `numeric` arithmetic. The shipment row is locked before LPs, and a repeated call returns success after seeing `cancelled` under that lock (`cancelShipment.ts:608-617`), so production idempotency is preserved.

However, the newly added real-Postgres suite is not runnable. `wave8-shipping-integrity.pg.test.ts:234-237` contains a duplicated fragment from `afterAll`: three `await`s occur outside an async function and an extra `});` closes the suite early. Vitest fails during transform, before test collection, even when `DATABASE_URL` is unset. Therefore the action-level tests that call `cancelShipment` for full, partial, snapshot/content divergence, repeat idempotency, and legacy fallback exist in source but provide no executable evidence. This fails the explicit requirement for a REAL action-level pg test.

Finding: `{severity: high, file: apps/web/app/[locale]/(app)/(modules)/shipping/_actions/__tests__/wave8-shipping-integrity.pg.test.ts:234, claim: the required cancelShipment PostgreSQL regression suite does not parse and runs zero tests, suggested-fix: remove the duplicated lines 234-237, then run the file against the test Postgres and retain raw passing output}`.

### Bug 2 — stays FIXED

The ship-confirm release remains constrained by shipment, org, LP, and the exact `sales_order_line_id`; the joined line must also belong to the shipment's sales order (`ship-actions.ts:424-449`). No regression was found in the shared-LP isolation fix.

Its PostgreSQL spot-check lives in the same syntactically broken suite, so it currently cannot execute, but the production predicate itself remains correct.

### Bug 3 — production fix correct, requested case/pallet regression coverage inadequate

The read model now keeps both grains explicit. `fetchSalesOrder` selects canonical `sol.quantity_ordered` as `inventory_qty` and `i.uom_base` as `inventory_uom`, while entered `order_qty`/`order_uom` remain separate (`so-actions.ts:303-329`). `mapLineRow` computes allocation status from canonical `inventory_qty` versus canonical `quantity_allocated`, and exposes entered quantity/UoM plus an exact SQL-numeric conversion of allocated quantity for entered-UoM display (`so-actions.ts:236-264`, `order-line-uom.ts:154-207`). The case-order action test verifies 12/36 canonical is `partially_allocated` while displaying 1/3 cases.

MRP is also one consistent grain: it labels demand with `i.uom_base` and computes `sol.quantity_ordered - sum(sbc.quantity)` where both quantities are canonical inventory/base units (`mrp.ts:261-320`). This removes the former `36 - 1 = 35 cases` defect and handles case and pallet orders without entered-UoM conversion in the MRP query. Every table in this query is org-scoped.

The requested partially-shipped case and pallet regression tests are not real regressions of that query. `mrp.test.ts:812-823` defines a local `Math.max(orderedCanonical - shippedBase, 0)` helper and asserts `36 - 12 = 24` and `1152 - 144 = 1008`. Those tests do not execute the MRP SQL, seed a case/pallet sales-order line, exercise shipped box contents, or prove that the query returns canonical UoM and remainder. The adjacent SQL-shape assertions help, but they do not connect the query to either fixture scenario.

Finding: `{severity: medium, file: apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp.test.ts:812, claim: case/pallet tests only test copied arithmetic and cannot regress the entered-vs-canonical SQL bug, suggested-fix: add a PostgreSQL query/action test with canonical quantity_ordered plus shipped shipment_box_contents for partially-shipped case and pallet orders, asserting 24 pcs and 1008 pcs respectively}`.

The module header comment at `mrp.ts:29-35` still describes the removed conversion into `order_uom`; this is stale documentation, not a runtime defect, and should be corrected with the test fix.

## Sanity checks

- No new production JS float arithmetic was found. The new `Number(...) / 12` is confined to the `so-actions.test.ts` mock; production conversions use PostgreSQL `numeric`, and status comparison uses fixed-scale `bigint` units.
- No new return-after-write failure path was introduced in the reviewed production changes. Cancellation throws on post-write persistence failure, preserving rollback behavior.
- No new `tenant_id`, raw tenant setting, or missing `org_id` predicate was found in the reviewed production SQL. `tenant_id` remains limited to platform test fixture setup.
- No migration was added or edited in this fix round.

## Verification evidence

`git diff origin/main..HEAD --stat -- . ':(exclude)_meta'`:

```text
.../web/actions/users/assign-role.behavior.test.ts | 143 +----
apps/web/actions/users/assign-role.ts              |  48 +-
.../users/assign-user-sites.behavior.test.ts       |  37 +-
.../create-user-with-password.behavior.test.ts     |  24 +-
.../web/actions/users/create-user-with-password.ts |  72 ++-
apps/web/actions/users/role-grant-guards.ts         | 177 ------
.../(app)/(modules)/planning/_actions/mrp.test.ts  |  88 +--
.../(app)/(modules)/planning/_actions/mrp.ts       |  31 +-
.../shipping/_actions/__tests__/so-actions.test.ts | 168 +++++-
.../__tests__/wave8-shipping-integrity.pg.test.ts  | 612 +++++++++++++++++++++
.../shipping/_actions/cancelShipment.test.ts       |   7 +-
.../(modules)/shipping/_actions/cancelShipment.ts  |  76 ++-
.../shipping/_actions/ship-actions.test.ts         |  12 +
.../(modules)/shipping/_actions/ship-actions.ts    |   8 +
.../shipping/_actions/so-actions-types.ts          |  18 +-
.../(modules)/shipping/_actions/so-actions.ts      | 122 +++-
apps/web/lib/auth/edge-middleware-policy.test.ts   |  29 -
apps/web/lib/auth/edge-middleware-policy.ts        |  12 +-
apps/web/lib/shipping/order-line-uom.test.ts       |  22 +
apps/web/lib/shipping/order-line-uom.ts            | 202 +++++++
.../466-user-can-see-site-failopen-todo.sql        |  18 -
22 files changed, 1292 insertions(+), 656 deletions(-)
```

Targeted Vitest raw stdout tail:

```text
FAIL  app/[locale]/(app)/(modules)/shipping/_actions/__tests__/wave8-shipping-integrity.pg.test.ts
Error: Transform failed with 4 errors:
`await` is only allowed within async functions and at the top levels of modules
  at wave8-shipping-integrity.pg.test.ts:234:5
  at wave8-shipping-integrity.pg.test.ts:235:5
  at wave8-shipping-integrity.pg.test.ts:236:5
Unexpected token at wave8-shipping-integrity.pg.test.ts:612:1

Test Files  1 failed | 3 passed (4)
Tests       97 passed (97)
Duration    291ms
```

Per project rules, no build or typecheck was run in the Codex lane. A live PostgreSQL execution was impossible because the suite fails at transform before its `DATABASE_URL`-gated tests can be collected.

VERDICT: fail

# Wave A1 — Implementation Summary (2026-07-12)

Prod-reproduced P0 data-integrity fixes for consume, catch-weight output, and WO-chain delete.
All changes are in the working tree (uncommitted).

## Verification gates

| Gate | Result |
|------|--------|
| `pnpm --filter web exec tsc --noEmit` | **PASS** (no errors) |
| Touched vitest | **PASS** (53 tests) |
| `pnpm --filter web run build` | **Not run** — no new/moved `'use server'` exports; shared helpers live in non-server siblings |

### Tests run

```bash
cd apps/web && pnpm exec vitest run \
  lib/production/__tests__/consume-material-core.test.ts \
  "app/[locale]/(app)/(modules)/production/_actions/consume-material-actions.test.ts" \
  lib/production/output/__tests__/register-output-catch-weight-a1.test.ts \
  "app/[locale]/(app)/(modules)/planning/work-orders/_actions/releaseWorkOrder.test.ts"
```

---

## C1 — Phantom consume with zero-UUID LP

### Root cause

The desktop action and scanner route allowed consumption when `lpId` was omitted (reason-code path) or coerced missing LP to `NIL_LP_UUID` (`00000000-…`) via `coalesce(lp_id, $NIL)`. That branch **skipped LP decrement**, still inserted `wo_material_consumption`, and set `fefo_adherence_flag = true` unconditionally — producing ledger rows with no backing stock.

### Fix (shared choke point)

New `apps/web/lib/production/consume-material-core.ts`:

- `isNilOrZeroLpId()` — rejects null/empty/zero UUID before any DB write
- `resolveConsumptionLp()` — every consume path must resolve a real LP under `FOR UPDATE`, decrement stock, and only set `fefoAdherence` when FEFO auto-resolve or explicit LP passes FEFO check

Wired into:

- `apps/web/app/[locale]/(app)/(modules)/production/_actions/consume-material-actions.ts`
- `apps/web/app/api/production/scanner/wos/[id]/consume/route.ts`

Removed `coalesce(…, NIL_UUID)` from consumption INSERT; explicit zero UUID returns `invalid_input` with **zero queries**.

### Test

| File | Case |
|------|------|
| `consume-material-core.test.ts` | `isNilOrZeroLpId` treats null/empty/zero UUID as absent |
| `consume-material-actions.test.ts` | `rejects an explicit zero UUID lpId before any stock mutation` — `queries.length === 0`, `reason: invalid_input` |

---

## C2 — Hold bypass via reason-code / no-LP path

### Root cause

The reason-code branch bypassed `assertLpConsumableForProduction` / hold checks that the FEFO picker enforced. Operators could record consumption against held inventory while LP quantity stayed unchanged.

### Fix

`resolveConsumptionLp()` on the no-explicit-LP path:

1. Auto-selects FEFO candidate from `v_inventory_available` with `FOR UPDATE OF lp`
2. Runs `assertLpConsumableForProduction` on the resolved LP (hold/QA/expiry/lock gates)
3. Rejects with `quality_hold_active` or `lp_unavailable` when no eligible LP exists — **no material or ledger mutation**

Same logic in desktop action + scanner route via shared core.

### Test

| File | Case |
|------|------|
| `consume-material-actions.test.ts` | `rejects reason-code consume when the only FEFO LP is on hold (C2)` — `quality_hold_active`, no `wo_materials` / `wo_material_consumption` writes |

---

## S6 — Quantity rounding before persistence

### Root cause

Quantities could round-trip through JS float/`Number()` at the persistence boundary (repro: 2.52→3, 0.48→0). Trailing-zero normalization (`2.500`→`2.5`) is intentional on the micro-unit rail; integer rounding is not.

### Fix

`normalizePersistedQuantity()` in `consume-material-core.ts` — `toMicro` → `microToDecimal` bigint rail, applied at entry in `consume-material-actions.ts` and scanner `consume/route.ts` before all SQL binds.

### Test

| File | Case |
|------|------|
| `consume-material-core.test.ts` | `preserves fractional kg` — 2.52, 0.48, 12.632 unchanged |
| `consume-material-actions.test.ts` | `persists 2.52 kg` / `persists 0.48 kg` — UPDATE + ledger params match exact strings |

---

## S17 — Catch-weight nominal loss on output

### Root cause

`register-output.ts` resolved `qty_kg` from nominal WO input **before** building the catch-weight summary. For `weight_mode='catch'`, INSERT used nominal kg, omitted `qty_units`, and skipped `catch_weight_details` — losing per-unit actuals and variance.

### Fix

`apps/web/lib/production/output/register-output.ts`:

- Load item before qty resolution
- When `weight_mode='catch'`: build `catchSummary` first; set `resolvedQtyKg = catchSummary.total_kg`, `persistedQtyUnits = per_unit.length`, `persistedActualWeightKg = total_kg`, persist `catch_weight_details` JSON on INSERT
- Removed duplicate post-batch catch-weight block

### Test

| File | Case |
|------|------|
| `register-output-catch-weight-a1.test.ts` | 1 unit nominal 1 kg, actual 0.95 → `qty_kg=0.950`, `qty_units=1`, `catch_weight_details` with `per_unit_kg`, `reference_kg`, derivable `variance_pct` |

---

## C5 — Draft WO delete destroys production chain

### Root cause

`deleteDraftWorkOrder` only checked `status === 'DRAFT'`. A draft child WO linked via `wo_dependencies` to a completed parent could be hard-deleted, removing the dependency row and breaking genealogy.

### Fix

New `apps/web/lib/planning/wo-chain-delete-guard.ts` — `assertDraftWorkOrderDeletable()`:

- Finds chain peers via `wo_dependencies`
- Blocks delete when any non-cancelled peer has progressed beyond draft, has execution activity, or has `wo_outputs`

Called from `releaseWorkOrder.ts` → `deleteDraftWorkOrder` before DELETE.

Typed error `chain_delete_blocked` added to `PlanningWorkOrderError` + i18n (`errors.chain_delete_blocked`).

### Test

| File | Case |
|------|------|
| `releaseWorkOrder.test.ts` | `blocks deleting a draft WO that is part of an active production chain (C5)` — `chain_delete_blocked`, no `DELETE FROM work_orders` |

---

## File index

| Path | Bugs |
|------|------|
| `apps/web/lib/production/consume-material-core.ts` | C1, C2, S6 (new) |
| `apps/web/lib/production/__tests__/consume-material-core.test.ts` | C1, S6 (new) |
| `apps/web/.../consume-material-actions.ts` | C1, C2, S6 |
| `apps/web/.../consume-material-actions.test.ts` | C1, C2, S6 |
| `apps/web/app/api/production/scanner/wos/[id]/consume/route.ts` | C1, C2, S6 |
| `apps/web/lib/production/output/register-output.ts` | S17 |
| `apps/web/lib/production/output/__tests__/register-output-catch-weight-a1.test.ts` | S17 (new) |
| `apps/web/lib/planning/wo-chain-delete-guard.ts` | C5 (new) |
| `apps/web/.../planning/work-orders/_actions/releaseWorkOrder.ts` | C5 |
| `apps/web/.../planning/work-orders/_actions/shared.ts` | C5 (`chain_delete_blocked`) |
| `apps/web/.../planning/work-orders/_actions/releaseWorkOrder.test.ts` | C5 |
| `apps/web/i18n/{en,pl,ro,uk}.json` | C5 user-facing error |
| `apps/web/.../planning/work-orders/page.tsx` | C5 releaseError label |

---

## Corrections (Codex review pass — 2026-07-12)

Cross-reviewer confirmed **C1** and **S17** solid; fixed **S6**, **C2**, **C5**, and shallow test gaps.

### S6 — Silent >6-decimal truncation (BLOCKER)

**Verified:** `normalizePersistedQuantity()` routed through `toMicro()`, which sliced fractional digits at 6 dp — `1.0000009` became `1` (silent material loss). No NUMERIC range guard.

**Fix:** Replaced micro-rail truncation with explicit validation against `wo_material_consumption.qty_consumed` **`numeric(12, 3)`** (migration 181). Added `ConsumptionQuantityError` with typed codes: `qty_scale_exceeded`, `qty_range_exceeded`, `invalid_qty`. Values within scale are preserved exactly; excess scale or magnitude is rejected before any SQL bind.

**Tests:** `consume-material-core.test.ts` — `1.0000009` → `qty_scale_exceeded`; `1000000000` → `qty_range_exceeded`.

### C2 — Hold-first / eligible-second FEFO wrongly rejected (BLOCKER)

**Verified:** `selectFefoConsumableLpForUpdate()` picked `LIMIT 1` from `v_inventory_available` (no hold exclusion), then `assertLpConsumableForProduction()` rejected the held earliest LP — even when a later eligible LP existed.

**Fix:** Added `NOT EXISTS` anti-join against `v_active_holds` (LP + batch expansion) **inside** the locked FEFO `SELECT … FOR UPDATE OF lp`. `assertLpConsumableForProduction()` retained as defense-in-depth.

**Tests:** `consume-material-core.pg.test.ts` — held earliest LP skipped, eligible second LP auto-selected (skips without `DATABASE_URL`).

### C5 — Chain delete guard missed full graph (BLOCKER)

**Verified:** `assertDraftWorkOrderDeletable()` only inspected immediate `wo_dependencies` peers — missed multi-hop chains (A→B(cancelled)→C(completed)) and target WO executions/outputs.

**Fix:** Replaced peer-only CTE with **recursive CTE** seeded at target WO, traversing both parent and child directions (depth cap 32). Blocks when any visited WO is progressed beyond draft/cancelled, has active execution activity, or has `wo_outputs`. Cancelled-only chains remain deletable.

**Tests:** `wo-chain-delete-guard.pg.test.ts` — A→B(cancelled)→C(completed) blocks delete of draft A (skips without `DATABASE_URL`).

### Test depth (SHOULD-FIX)

| File | Coverage |
|------|----------|
| `scanner-consume-a1.pg.test.ts` | Scanner route reason-code path: FEFO auto-resolve, real LP decrement, fractional `2.52` persistence |
| `consume-material-core.pg.test.ts` | DB-faithful held-first / eligible-second FEFO |
| `wo-chain-delete-guard.pg.test.ts` | Multi-hop chain delete block |

### Verification (corrections pass)

```bash
cd apps/web && pnpm exec vitest run \
  lib/production/__tests__/consume-material-core.test.ts \
  lib/production/__tests__/consume-material-core.pg.test.ts \
  lib/planning/__tests__/wo-chain-delete-guard.pg.test.ts \
  "app/api/production/scanner/wos/[id]/__tests__/scanner-consume-a1.pg.test.ts" \
  "app/[locale]/(app)/(modules)/planning/work-orders/_actions/releaseWorkOrder.test.ts" \
  "app/[locale]/(app)/(modules)/production/_actions/consume-material-actions.test.ts"
```

| Gate | Result |
|------|--------|
| Touched vitest | **PASS** — 54 passed, 3 pg suites skipped (no `DATABASE_URL`) |
| `pnpm exec tsc --noEmit` (touched files) | **PASS** |

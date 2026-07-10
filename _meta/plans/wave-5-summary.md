# Wave 5 summary — test honesty + dead code (6 items)

Branch: `fix/wave5-test-honesty`  
Date: 2026-07-10

## Item 1 (P0) — tautological parity evidence specs

**Fixed:** Rewrote three Technical parity specs to gate on `PLAYWRIGHT_BASE_URL` and assert against the live app (no embedded HTTP servers / harness HTML):

| Spec | Live route | Key assertions |
|------|------------|----------------|
| `technical-i18n-pl-parity-evidence.spec.ts` | `/pl/technical` | `data-screen="technical-dashboard"`, `technical-subnav`, Polish strings from `pl.json` |
| `technical-eco-parity-evidence.spec.ts` | `/en/technical/eco` | `data-screen="technical-eco"`, heading, tablist, create modal via `/new eco/i` button |
| `technical-bom-row-actions-parity-evidence.spec.ts` | `/en/technical/bom` → detail + item BOM tab | `bom-line-*` testids, edit/delete dialogs, item `Open BOM →` link |

## Item 2 (P1) — skip cascades

**Fixed:**

- `npd-full-lifecycle.spec.ts` — `test.describe.serial()`; replaced 7× `test.skip(!projectId…)` with `expect(projectId).toBeTruthy()`.
- `npd-project-gate-flow.spec.ts` — `test.describe.serial()`; replaced 4× skip guards with hard `expect`.
- `npd-to-production-chain-overlap.spec.ts:188-190` — `expect(rowCount).toBeGreaterThan(0)` instead of `test.skip(true)`.

## Item 3 (P1) — flow spec honesty

**Fixed:**

- `npd-create-to-wo-flow.e2e.spec.ts` — critical mutations (FG mint, WO create) now throw/expect instead of degrading; chain steps use `expect(flow.projectId)` not skip; WO modal already uses `?new=1`; project wizard uses `/pipeline/new` deep-link (no fullwidth-plus button).
- `order-to-ship-flow.e2e.spec.ts` — SO/customer/item/shipment/PO creation paths hard-fail when seed data missing; serial chain uses `expect(chain.*)` instead of skip cascades; SO/PO modals already use `?new=1`.

Optional cosmetic branches (recipe editor locked, production locked, POD e-sign failures) left soft per spec.

## Item 4 (P2) — playwright testMatch

**Fixed:** `playwright.config.ts` — `testMatch` constrained to `**/e2e/**/*.spec.ts` and `**/e2e/**/*.e2e.spec.ts`; removed `apps/web/tests/**` glob so `--list` no longer picks up Vitest files.

## Item 5 — dead code after B3

**Fixed:** Removed `buildWipNoFgLabels`, `buildWipPanelLabels`, and unused `FaProductionTabLabels` import from `formulation/page.tsx` (~214 lines).

## Item 6 — pre-existing test debris

**Fixed:**

- `import-to.test.ts` — underlying drift: `commitToImport` validated `ea` via R3.3 normalization but persisted raw `ea`. Added `normalizePieceUom(entry.uom) ?? entry.uom` on line commit so test correctly expects `pcs` for legacy `ea` input.
- Migration **459 number collision** — documented in header comments on both `459-generate-sscc-validate-before-increment.sql` and `459-yield-gate-override-reasons.sql`; updated `packages/db/scripts/migrate.ts` to sort by numeric prefix **then filename** (deterministic order: generate-sscc before yield-gate). **Not renumbered** (checksum gate on applied migrations).

## Verification gates (actual output)

```text
# import-to vitest
PASS (3) FAIL (0)

# playwright --list
Total: 279 tests in 89 files

# tsc (apps/web)
TypeScript: No errors found
```

```text
git diff --stat (14 files, +228 −774)
```

## Not done / ambiguities

- **E2E live runs** against preview were not executed here (orchestrator Gate-5 only); specs skip cleanly when `PLAYWRIGHT_BASE_URL` unset.
- **Live DB `schema_migrations` probe** for the two 459 files was not run (no owner DB in this worktree); collision handling follows the 2026-07-08 owner report pattern (both applied by filename, runner tracks independently).
- **`packages/db/src/migrations/` mirrors** of the 459 files were not edited (runner globs `packages/db/migrations/` only).

## Fix round 1

Adversarial review (`wave-5-codex-review.md`) failed on three gaps. All required changes implemented:

1. **Parity evidence mandatory assertions**
   - `technical-eco-parity-evidence.spec.ts` — permission denial is a hard fail; New ECO button + modal are required (no conditional bypass).
   - `technical-bom-row-actions-parity-evidence.spec.ts` — row actions, edit/delete dialogs, active-state disabled edit, and item→BOM deep link are all hard-required.

2. **No runtime green skips in touched serial chains**
   - `npd-full-lifecycle.spec.ts:459` — removed mid-test `test.skip(true)`; G3 e-sign step now gates at test start via `test.skip(!adminPassword, …)` (same pattern as G4).
   - `npd-create-to-wo-flow.e2e.spec.ts:435` — replaced `test.skip(!flow.productCode)` with `expect(flow.productCode)`; step 2 already-linked branch now hard-requires a captured FG code from the href.

3. **SO/PO creation correlated to just-created records**
   - `order-to-ship-flow.e2e.spec.ts` — snapshots list link ids before submit, opens the **new** `so-link-*` / `po-link-*` row (not the first pre-existing draft), and asserts detail lines contain the picked item code.

### Verification (fix round 1)

```text
# tsc (apps/web)
TypeScript: No errors found

# playwright --list
Total: 279 tests in 89 files

# import-to vitest
Test Files  1 passed (1)
Tests       3 passed (3)
```

```text
git diff --stat (5 files, +93 −73)
```

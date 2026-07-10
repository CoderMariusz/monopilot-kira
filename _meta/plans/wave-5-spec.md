# Wave 5 — tests that lie + E2E honesty + dead code (6 items)

Repo: monopilot-kira. Work in THIS worktree only.

## Item 1 (P0) — 3 tautological "parity evidence" specs
`apps/web/e2e/technical-i18n-pl-parity-evidence.spec.ts:102-150`, `technical-eco-parity-evidence.spec.ts:1-60`, `technical-bom-row-actions-parity-evidence.spec.ts` — each serves its OWN static HTML via `http.createServer`/`harnessHtml()` and asserts on text it injected itself. A real-screen regression can never fail them.
FIX: rewrite each to run against the real app: gate on `PLAYWRIGHT_BASE_URL` (skip cleanly when absent, like other e2e specs), navigate to the real screen (/pl/technical…), assert the same parity points on the live DOM. Delete the embedded HTTP servers and harness HTML entirely.

## Item 2 (P1) — skip cascades that hide failures
- `apps/web/e2e/npd-full-lifecycle.spec.ts:384,404,418,517,558,693,777` + `npd-project-gate-flow.spec.ts:250,303,339,412`: `skip(!projectId)` cascades — step 1 failure turns steps 2-N green-skipped. FIX: `test.describe.serial()` (or `.configure({mode:'serial'})`) so a failed step FAILS the chain; replace the skip(!projectId) guards with hard `expect(projectId).toBeTruthy()`.
- `npd-to-production-chain-overlap.spec.ts:188-190`: runtime `test.skip(true)` on empty seed → broken seeding silently green. FIX: `expect(count).toBeGreaterThan(0)`.

## Item 3 (P1) — my 2 flow specs: graceful-degradation + fragile triggers
`apps/web/e2e/npd-create-to-wo-flow.e2e.spec.ts` and `order-to-ship-flow.e2e.spec.ts`:
(a) remove graceful-degradation from CRITICAL mutation steps — creating the record (project, FG, SO, PO, shipment) must HARD-FAIL if the record isn't created (assert on DB-visible UI evidence: row appears in list / detail page loads). Optional cosmetic steps may stay soft.
(b) open create-modals via `?new=1` deep-link instead of clicking "＋ Create …" buttons (the button label uses fullwidth-plus U+FF0B — brittle). Check each list page supports ?new=1 (planning PO does); where it doesn't, use a getByRole('button', {name:/create/i}) regex, never the literal ＋.

## Item 4 (P2) — playwright testMatch too broad
`playwright test --list` without args wanders into vitest files. FIX in playwright.config.ts: constrain testMatch to `apps/web/e2e/**/*.spec.ts` (verify the actual e2e dir layout first, include existing naming variants like *.e2e.spec.ts).

## Item 5 — dead code after B3
`apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/formulation/page.tsx`: functions `buildWipNoFgLabels` (~line 655) and `buildWipPanelLabels` (~685) and the `FaProductionTabLabels` import (~line 67) are dead since FormulationWipPanel removal. Delete them. Verify with tsc + grep that nothing references them.

## Item 6 — pre-existing test debris
- `planning/transfer-orders/_actions/import-to.test.ts` — 1 failing test "commitToImport groups rows into transfer orders correctly": it drifted from the R3.3 pcs-unification behavior. Read the current implementation, decide the CORRECT expected value, and fix the test to assert current intended behavior (do not weaken the assertion).
- Two migration files share number 459 in packages/db/migrations. DO NOT renumber applied migrations (checksum gate!). Instead: verify both are applied in schema_migrations (list what you find); if renumbering is unsafe, document the collision in a comment header in both files and ensure the migrate runner orders them deterministically.

## Requirements
- Playwright specs must still pass `--list` (syntax check): `pnpm --filter web exec playwright test --list --config=../../playwright.config.ts` (adjust path if wrong — find the config first).
- Do NOT run e2e against prod from here — the orchestrator runs them. Your gates: tsc clean + touched vitest green + playwright --list clean.
- Summary → `_meta/plans/wave-5-summary.md`.

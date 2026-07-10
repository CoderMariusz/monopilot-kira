# Wave 14 — Planning imports & procurement integrity (from 2026-07-10 hunt, h4 + opus-lib)

Repo: monopilot-kira. Work in THIS worktree only. DB ground truth: packages/db/migrations.
KEY: withOrgContext COMMITS on any non-throw return — all_or_nothing must THROW to roll back. New SQL: non-reserved aliases (must PREPARE). NOTE: a separate wave (W2) already added planning RBAC + server-side filters; do NOT re-touch those. NOTE: the WO-chain duplicate-WIP bug (h5 N-36) is ALREADY FIXED in wave 13 — do not redo it.

## Bug 1 (N-30, P1) — PO all_or_nothing import commits successful groups alongside runtime failures
`planning/purchase-orders/_actions/import-po.ts`: validation runs in a SEPARATE txn (:85) from the write txn (:109); inside the write txn runtime failures only ACCUMULATE (:133,183) and the callback returns NORMALLY (:199) → withOrgContext COMMITS the earlier POs even though later ones failed in all_or_nothing mode.
FIX: in all_or_nothing mode, THROW on the first runtime failure inside the write txn (so withOrgContext rolls back everything). Re-validate inside the write txn (don't rely on the separate validation txn's snapshot). Best-effort mode may keep accumulating. Add a test: an all_or_nothing import where group 2 fails commits NO POs (group 1 rolled back).

## Bug 2 (N-31, P1) — TO all_or_nothing import commits each order in its OWN transaction
`planning/transfer-orders/_actions/import-to.ts:168` calls the PUBLIC `createTransferOrder`, which opens its OWN `withOrgContext` (`transfer-orders/_actions/actions.ts:438,492`) → the outer import txn's rollback (:182,199) CANNOT undo already-committed orders.
FIX: extract `createTransferOrderCore(ctx, input)` that runs on the CALLER's ctx/client (mirror the PO core pattern — `create-purchase-order-core.ts`), and have both the public `createTransferOrder` (wraps it in withOrgContext) and the importer call the core on ONE shared txn. In all_or_nothing mode throw on first failure. Add a test: an all_or_nothing TO import where order 2 fails commits NO orders.

## Bug 3 (N-32, P1) — PO import bypasses the runtime schema used by single-create
Import validation skips `CreatePurchaseOrderInput` limits (80-char number, 3-char currency, 2000-char notes, 200 lines; `procurement-shared.ts:72`); `import-po.ts:400` concatenates notes UNBOUNDED and calls the core (:168) with no runtime validation → unconstrained text into `purchase_orders` columns (mig 262:10).
FIX: `safeParse` the grouped payload against `CreatePurchaseOrderInput` (the same zod schema single-create uses) BEFORE calling the core; map each zod issue back to its SOURCE ROW(s) so the import error report points at the offending row. Enforce the notes/number/currency/line-count limits. Add a test: an import row with a 3000-char note / 300 lines is rejected with a row-mapped error, not silently truncated/inserted.

## Bug 4 (N-55, P2) — blocking a supplier races PO creation
`create-purchase-order-core.ts:169` reads supplier status UNLOCKED; `suppliers/_actions/actions.ts:276,283` updates supplier status UNGUARDED → a PO can insert against a just-blocked supplier (TOCTOU).
FIX: `SELECT ... FOR UPDATE` (or `FOR SHARE`) the supplier row during the status check in the PO core so a concurrent block serializes; re-check status under the lock. Add a test/assertion that the supplier row is locked during the check.

## Bug 5 (N-62, P2) — catch-weight daily variance row misattributes site
`lib/.../catch-weight-variance.ts:113,118,138` groups by item ONLY and pins `min(site_id::text)` → two-site items get ONE blended row on an arbitrary site, unrecoverable given the `(org,item,day)` upsert key.
FIX: add `site_id` to the GROUP BY and to the upsert conflict key (`(org, item, site, day)`) so each site gets its own variance row. This likely needs a migration to change the unique constraint/PK on the variance table — additive: add site_id to the key (next free number; check max; say so LOUDLY). Verify the migration is safe on existing rows (may need to backfill/dedupe existing blended rows — check row count first). Add a test: two-site item produces two variance rows.

## Bug 6 (N-63, P2) — catch-weight items with missing/zero nominal invisibly excluded
`catch-weight-variance.ts:109` drops items with missing/zero nominal weight with NO log/counter/exception → a misconfigured item can never alert.
FIX: emit a skipped-samples signal — count the excluded items and surface them (a returned `skipped: [...]` with reason, a log/metric, or an exception row) so a misconfigured item is visible. Do NOT silently drop. Add a test: a zero-nominal item is reported as skipped, not silently omitted.

## Requirements
- Read every touched file fully; grep callers; mirror the createPurchaseOrderCore pattern for the TO core; reuse the CreatePurchaseOrderInput zod schema (don't duplicate).
- Tests per bug (existing __tests__ patterns). `.ts` default vitest, `.tsx` under `--config vitest.ui.config.ts`. Integration tests skip cleanly without DATABASE_URL.
- If a migration is needed (Bug 5): additive, next free number (max is 476; use 477+), safe on existing data (check/dedupe blended rows), and say so LOUDLY (auto-applies on Vercel). Dry-run-safe on real PG. NEVER export non-async from a 'use server' module (RSC build blocker) — put shared cores/types/helpers in non-server siblings.
- Gates: `pnpm --filter web exec tsc --noEmit` clean + touched vitest green. Run a FULL `pnpm --filter web run build` if you add/move any 'use server' exports.
- Summary per bug → `_meta/plans/wave-14-summary.md`.

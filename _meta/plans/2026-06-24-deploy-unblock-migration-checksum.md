# Deploy unblock — migration checksum drift (2026-06-24)

## Symptom
Every Vercel **production deploy ERRORed for the last 4 commits** (`9fc9a032`,
`d71e471c`, `6183b69c`, `4cf0a48c`). The live site was frozen on the last green
build — `4feeea5c` (E-IO docs) — so **none of the w11 reversibility waves, none of
the E-waves, and none of the 2026-06-24 audit run were actually live.**

## Root cause
The Vercel build command is:
```
cd ../.. && pnpm --filter @monopilot/db migrate && cd apps/web && pnpm build
```
The migrate runner (`packages/db/scripts/migrate.ts`) records every applied
migration in `public.schema_migrations(filename, checksum)` and treats **editing
an already-applied migration file as a hard error** (checksum mismatch).

The `fix(closures)` commit `9fc9a032` **edited two already-applied migrations
in place**:
- **288-shipping-so-core.sql** — removed the `sales_order_line_allocations`
  junction table + added a `sales_order_seq` grant. (Build died here:
  `CHECKSUM MISMATCH on already-applied migration: 288`.)
- **289-quality-haccp-core.sql** — added an inline `haccp_ccps_active_limit_required_check`
  CHECK constraint.

Compounding problem: migrations **291–320 were applied via Supabase MCP**, which
uses Supabase's own ledger — they were **absent from `public.schema_migrations`**,
so once 288 was fixed the runner would have tried to **re-run** them against a DB
where the objects already exist (e.g. 320's gist `EXCLUDE` is not idempotent) and
ERRORed again.

## Live ground truth (verified via MCP before touching anything)
- 288 junction table still **exists** (0 rows) — the file edit never ran (runner
  skips already-applied), so the edited file did NOT match the DB.
- 289 CCP constraint **did not exist** live (`ccp_constraint_live=0`) — the edit
  was never actually applied despite the commit note.
- `public.schema_migrations` is an extended governance table (PK on `id uuid`,
  not `filename`; no unique on `filename`) — the runner only reads
  `filename,checksum` and inserts those two columns (rest default).

## Fix (disciplined: never edit an applied migration; create a new one)
1. **Restored 288 and 289** to their exact applied originals
   (`git show 9fc9a032^:…`) — checksums back to `43e32126…` / `f680129c…`,
   matching both the ledger and live DB reality.
2. **New migration 321-shipping-seq-grant-and-ccp-limit.sql** re-expresses the two
   intended forward changes additively: the `sales_order_seq` grant (idempotent,
   guarded) and the `haccp_ccps_active_limit_required_check` constraint (verified
   0 violating rows → validated). Applied live + recorded.
3. **Reconciled the runner ledger** — inserted rows for 291–321 with their exact
   file `sha256` checksums (NOT EXISTS-guarded; filename has no unique constraint),
   so `migrate` now SKIPS them instead of re-running.

Result: ledger 271 → 302; every migration file 001–321 present with a matching
checksum. The deploy's migrate step is now a clean no-op → `pnpm build` runs.

## Guardrail for next time
- **NEVER edit a migration file after it has been applied** — even a comment
  changes the sha256 and bricks the deploy. Always add a new `NNN-*.sql`.
- **Migrations applied via Supabase MCP must also get a `public.schema_migrations`
  row** (filename + sha256 of the file), or the Vercel runner will try to re-run
  them. Better: apply via the runner so the ledger stays authoritative.
- The Vercel migrate gate fails the whole deploy silently-looking (ERROR with the
  reason only in build logs) — when deploys ERROR, **read the build logs first**.

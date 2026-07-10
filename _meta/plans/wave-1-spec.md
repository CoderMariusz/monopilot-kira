# Wave 1 — WAC / money correctness (6 bugs)

Repo: monopilot-kira (Next.js App Router + Supabase Postgres). Work in THIS worktree only.
DB schema ground truth: packages/db/migrations. All money/qty math belongs in SQL `::numeric` or the Dec helper — NEVER JS floats.

## Bug 1 (P0) — WAC currency pool asymmetry
`apps/web/lib/finance/book-receipt-wac.ts:86-96` books PO receipt into a WAC pool keyed by the PO currency, but ALL debits (consumption/output) go to the GBP pool (`apps/web/lib/finance/upsert-wac.ts:522-551`, default `WAC_VALUATION_CURRENCY_CODE` at :32; callers pass no currencyCode: `consume-material-actions.ts:679-690`, `register-output.ts:849-856`).
Effect: EUR PO → EUR pool never drains; consumption debits a GBP pool with avg_cost=0 → valuation 0.
FIX (decide + implement consistently): value everything in the org base currency (GBP) — convert the receipt amount to base currency at booking time using the PO's exchange rate if stored, otherwise reject non-base-currency receipts with a typed error `unsupported_currency` (do NOT silently book wrong pools). Look at what exchange-rate data actually exists in the schema before choosing; if no FX data exists, the reject path is correct. Keep pool key = base currency everywhere so credits and debits meet in the same pool.

## Bug 2 (P1) — silent GBP fallback on receipt
`book-receipt-wac.ts:155-158` falls back to GBP for a missing/invalid PO currency. Replace with a typed failure (`unknown_currency`) that blocks the receipt booking (consistent with Bug 1 decision).

## Bug 3 (P1) — reversals always hit GBP pool
`upsert-wac.ts:332-339,379-386` — consumption reversal and shipment-cancel credit pass no currencyCode → always GBP pool regardless of original debit currency. After Bug 1 (single base-currency pool) this may become consistent by construction — verify and add a regression test proving reversal hits the SAME pool as the original debit.

## Bug 4 (P1) — kg for WAC computed in JS float
`apps/web/lib/production/output/register-output.ts:918` — `toBaseQty(...Number(qtyUnits)...).toFixed(3)` in JS double. Move the pack→kg conversion into SQL `::numeric` (pattern already exists: `resolveWacDeltaQtyKg` in upsert-wac.ts).

## Bug 5 (P1) — un-costed lines silently dropped from cost
`apps/web/lib/finance/resolve-output-wac.ts:54-67` — material_costed fallback: lines in a non-convertible UoM silently fall out of SUM → WO/FG cost silently understated. Mark them explicitly (e.g. return `excluded: [...]` / status `'un_costed'`) and surface the exclusion to the caller so it can warn/block, mirroring how the receipt path hard-blocks the same situation.

## Bug 6 (P2) — 'pcs' not recognized by resolveWacDeltaQtyKg
`upsert-wac.ts:194-206` knows only each/box/kg but the canonical piece code is 'pcs' (`apps/web/lib/uom/piece.ts:7-14`) → PO line in pcs always `unresolved_uom`, receipt blocked despite pack metadata. Map pcs/szt/ea → each (reuse lib/uom/piece.ts helpers, don't duplicate the alias list).

## Requirements
- Read every file fully before editing; trace all callers of changed functions (grep) — fix at the shared root, not per-caller.
- Unit/regression tests for each bug in the existing __tests__ patterns (vitest). Bug 1/3: test that receipt-credit and consumption-debit land in the same pool; Bug 5: test exclusion is reported.
- NO new dependencies. NO schema migrations unless strictly required (if you need one, put it in packages/db/migrations with the next free number and say so loudly in the summary).
- Gates before you finish: `pnpm --filter web exec tsc --noEmit` clean, and run the touched test files with vitest — all green.
- Write a summary of what you changed per bug + test evidence to `_meta/plans/wave-1-summary.md`.

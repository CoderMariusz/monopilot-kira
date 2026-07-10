# Wave 11 — Built-flag / product-view integrity summary

**Branch:** `fix/wave11-built-flag`  
**Date:** 2026-07-10  
**Spec:** `_meta/plans/wave-11-spec.md`

## Migrations added (AUTO-APPLY on Vercel — additive/idempotent)

| # | File | Bug |
|---|------|-----|
| **468** | `packages/db/migrations/468-product-built-column-grant-lockdown.sql` | N-24 |
| **469** | `packages/db/migrations/469-product-built-v18-guard-current-user.sql` | N-25 |
| **470** | `packages/db/migrations/470-prod-detail-built-reset-insert-delete.sql` | N-26 |
| **471** | `packages/db/migrations/471-wip-process-built-reset.sql` | N-27 |
| **472** | `packages/db/migrations/472-items-built-reset-on-label-edit.sql` | N-28 |

---

## Bug 1 (N-24) — product view UPDATE grant re-lockdown

**Problem:** mig 359 `grant select, insert, update, delete on public.product to app_user` restored blanket UPDATE including `built`, undoing mig 223 column-level lockdown.

**Fix (468):** `revoke update on public.product from app_user` then dynamic `grant update (<all cols except built>)` mirroring mig 223:197-217.

**Tests:** `packages/db/__tests__/wave11-built-flag-integrity.test.ts` — static contract + integration `N-24` (`has_column_privilege` on `built` = false, `product_name` = true).

---

## Bug 2 (N-25) — V18 downgrade guard keys on `current_user`

**Problem:** `product_instead_of_update_fn` used `session_user = 'app_user'`; SECURITY DEFINER audited helper `fa_reset_product_built_for_edit` also sees `session_user='app_user'` → legitimate resets hit `V18_BUILT_DOWNGRADE_REQUIRES_AUDIT`.

**Fix (469):** Replace guard with `current_user = 'app_user'`; preserve exact raise message + false→true High/Open risk check.

**Tests:** Integration `N-25a` (prod_detail UPDATE resets built + `fa.built_reset`); `N-25b` (app_user direct `UPDATE product SET built=false` blocked).

---

## Bug 3 (N-26) — prod_detail INSERT/DELETE skip built reset

**Problem:** `fa_reset_built_on_prod_detail_edit` was AFTER UPDATE ONLY; INSERT/DELETE components left `built=true`.

**Fix (470):** `fa_reset_built_on_prod_detail_insert_fn` + `fa_reset_built_on_prod_detail_delete_fn` + triggers (mirror mig 222 allergen insert/delete pattern); call `fa_reset_product_built_for_edit`.

**Tests:** Integration `N-26` — INSERT and DELETE on built FG reset built + emit `fa.built_reset` with `source=prod_detail`.

---

## Bug 4 (N-27) — WIP process mutations never reset built

**Problem:** `npd_wip_processes` triggers (mig 391) refreshed allergens only; process list edits on built FGs were silent.

**Fix (471):** `fa_reset_built_on_wip_process_fn` + insert/update/delete triggers on `npd_wip_processes`; resolve `prod_detail_id` → `product_code`.

**Tests:** Integration `N-27` — wip process INSERT/UPDATE resets built + `fa.built_reset` with `source=npd_wip_processes` (skipped if table absent).

---

## Bug 5 (N-28) — direct `items` master edits bypass built reset

**Problem:** Post-359 reset lived only in `product_instead_of_update_fn`; `technical/items` updates overlap cols on FG twins with `built=true` and no event.

**Fix (472):** AFTER UPDATE trigger on `items` for `name, gs1_gtin, tare_weight, shelf_life_days, list_price_gbp` on `item_type='fg'` when `fg_npd_ext.built=true`.

**Tests:** Integration `N-28` — items name/GTIN edit resets built + `fa.built_reset` with `source=items`.

---

## Bug 6 (N-29) — Settings→BOMs phantom `p.name`

**Problem:** `boms.ts` selected `p.name`; product view exposes `product_name` → Postgres 42703; catch returned empty success.

**Fix (app only):** `p.name` → `p.product_name` in SELECT + GROUP BY; rethrow errors with `code === '42703'`.

**Tests:** `apps/web/.../boms/_actions/__tests__/boms.test.ts` — SQL uses `p.product_name`; 42703 is rethrown.

---

## Verification

```bash
pnpm --filter web exec tsc --noEmit          # clean
pnpm exec vitest run packages/db/__tests__/wave11-built-flag-integrity.test.ts
pnpm --filter web exec vitest run "app/[locale]/(app)/(admin)/settings/boms/_actions/__tests__/boms.test.ts"
```

Integration cases in `wave11-built-flag-integrity.test.ts` require `DATABASE_URL` (skip cleanly without it; run in CI).

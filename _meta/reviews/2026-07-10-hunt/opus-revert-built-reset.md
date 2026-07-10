# Gap report — revert-gate / revert-npd-gate + prod_detail direct edits & built-flag trigger coverage (mig 359)

## Findings

### F1 — P1 — mig 359 re-grants full-column UPDATE (incl. `built`) on `product` to `app_user`, undoing the mig-223 column-level lockdown
- Evidence: `packages/db/migrations/359-product-as-items-view-cut.sql:165` — `grant select, insert, update, delete on public.product to app_user;`
- vs. `packages/db/migrations/223-fa-built-downgrade-security-definer.sql:197-217` — `revoke update on public.product from app_user;` then a dynamic `grant update (<all columns EXCEPT built>)`.
- Effect: pre-359, any direct `UPDATE product SET built = …` by app traffic failed with a permission error regardless of trigger logic. Post-359 `built` is writable again through the view; the upgrade direction (`false→true`) is gated only by the High/Open-risk check (359:402-410) — no audit/e-sign path required. The defense-in-depth column grant was silently dropped by the cut.

### F2 — P1 — V18 downgrade guard rewritten to `session_user` breaks the audited built-reset path; prod_detail edits of a built product now hard-fail
- Evidence chain:
  - `359-product-as-items-view-cut.sql:399` — `if new.built is false and old.built is true and session_user = 'app_user' then raise 'V18_BUILT_DOWNGRADE_REQUIRES_AUDIT'`.
  - `223-fa-built-downgrade-security-definer.sql:75-79` — the audited helper `fa_reset_product_built_for_edit` (SECURITY DEFINER, granted to `app_user`, NOT redefined by any migration after 223 — verified by grep across all 443 migrations) does `update public.product set built = false … and built = true`. Post-359 that UPDATE goes through the view's INSTEAD-OF trigger.
  - `223:192-195` — trigger `fa_reset_built_on_prod_detail_edit` (AFTER UPDATE on `prod_detail`, still live; 359 only dropped the four `product_legacy` triggers at 359:42-45) calls that helper on every prod_detail row change.
  - `apps/web/lib/auth/with-org-context.ts:88-122` — all app data-plane traffic runs on the `DATABASE_URL_APP` pool whose login role is `app_user`.
- Failure scenario: `session_user` is the connection's login role and is **not** changed by SECURITY DEFINER (unlike `current_user`, which the original mig-223 invoker-check keyed on, 223:15). So under any app connection, the "legitimate" definer reset path is indistinguishable from a direct downgrade → any `UPDATE public.prod_detail` row of a product with `built = true` raises `V18_BUILT_DOWNGRADE_REQUIRES_AUDIT` and aborts the caller's statement, and the documented auto-reset behaviour (test: `apps/web/app/(npd)/fa/actions/__tests__/update-fa-cell.integration.test.ts:249-283`, "auto-resets built when a prod_detail row is edited") is dead in production. The integration test runs on the owner connection (`session_user ≠ 'app_user'`), so CI cannot catch this.
- Currently masked on the main flows only because `updateFaCell`/`finish-wip` reset `built` via the product-view UPDATE *before* calling `sync_prod_detail_rows` (so the helper's `built = true` predicate matches 0 rows and the view trigger never fires). Any path that touches prod_detail first (sync reorder on a still-built product, mig-434 fallback invoked standalone, admin fix-ups, or calling the granted helper as designed) hard-fails. P0 if/when any UI writes prod_detail on built products directly; P1 as it stands.

### F3 — P1 — built reset skips prod_detail INSERT/DELETE (trigger is UPDATE-only)
- Evidence: `223-fa-built-downgrade-security-definer.sql:192-195` — `create trigger fa_reset_built_on_prod_detail_edit after update on public.prod_detail` (no INSERT/DELETE events; contrast the allergen-refresh triggers in `222-fa-allergen-set-auto-refresh.sql:81-110`, which cover insert+update+delete).
- Direct writers: `apps/web/app/(npd)/fa/actions/add-prod-detail-component.ts:135` (insert component), `:259` (insert anchor), `:314` (delete component) — they emit `fa.recipe_changed` (add-prod-detail-component.ts:147-164) but never reset `built` and never emit `fa.built_reset`.
- Failure scenario: product `built = true` → user adds or removes a production component → recipe materially changes, `built` stays `true`, no reset event. (Ironically this is also the only prod_detail mutation family that *doesn't* trip F2's raise.)

### F4 — P1 — new WIP process model mutations never reset `built`
- Evidence: `packages/db/migrations/391-allergen-cascade-from-wip-processes.sql:200-215` — insert/update/delete triggers on `npd_wip_processes` refresh the allergen set only; grep for `built` in `389-npd-wip-process-model.sql` and `391-…` = 0 matches.
- Legacy parity: editing `prod_detail.manufacturing_operation_N` reset `built` via the mig-223 trigger. The successor model (`npd_wip_processes`, written by `apps/web/app/(npd)/fa/actions/wip-process-actions.ts:90` et al.) changes the same allergen/routing semantics with zero built-flag consequence — a built product's process list can be rewritten silently.

### F5 — P1 — direct `items` master edits bypass the built reset entirely (post-359 overlap-column hole)
- Evidence: after mig 359 the reset logic lives *only* in `product_instead_of_update_fn` (359:413-430); there is no trigger on `public.items`. But the view projects `items.name / gs1_gtin / tare_weight / shelf_life_days / list_price_gbp` as `product_name / bar_codes / tara_weight / shelf_life / price` (359:65-157).
- `apps/web/app/[locale]/(app)/(modules)/technical/items/_actions/update-item.ts:74-96` updates `name`, `gs1_gtin`, `tare_weight`, `shelf_life_days`, … directly on `items` — including FG twins. Pre-359 the equivalent product-column edit reset `built` and emitted `fa.built_reset`; now a built FG's label name/GTIN/tare weight can change while `built` stays `true` and no event is emitted.

### F6 — P1 — gate revert never invalidates `gate_approvals` → stale e-signature satisfies the checkpoint on re-advance
- Evidence: `apps/web/app/(npd)/pipeline/_actions/revert-npd-gate.ts:78-91` and `revert-gate.ts:58-86` update only `npd_projects` (+outbox/audit); no statement anywhere in `pipeline/_actions/*.ts` deletes/supersedes `gate_approvals` on revert (grep: only `delete-project.ts` mentions them).
- `apps/web/app/(npd)/pipeline/_actions/_lib/gate-helpers.ts:242-258` (`assertG4ESignForHandoff`) and `:266-282` (`assertG3ESignForApproval`) accept ANY historical `approved + esigned_at + esign_hash` row — no timestamp comparison against the revert.
- Failure scenario: project passes G3/G4 e-sign → admin reverts (`npd.gate.reverted`, rework implied) → recipe/spec changes → re-advance pilot→approval and approval→handoff sails through on the pre-revert signature. The BRCGS/CFR-21 checkpoint attests a state that no longer exists.

### F7 — P2 — `rollbackGate` (revert-gate.ts) is a weaker parallel revert with neither the PIN e-sign nor the release lock
- Evidence: `revert-gate.ts:21-25` — no `pin`; no `signEvent` call anywhere in the file; no `npd_locked_for_release_at` check (contrast `revert-npd-gate.ts:52-54` returning `NPD_RELEASE_LOCKED`); `isRollbackTarget` (revert-gate.ts:110-117) allows multi-gate jumps down to G0. Same permission (`npd.gate.advance`) as the PIN-gated sibling.
- Mitigation observed: no UI importer found (only `revertNpdGate` is wired via `gate/page.tsx:501-507` and `gate-revert-modal.tsx`), so it's a latent exported `'use server'` endpoint, not a live bypass — hence P2, not P1.

### F8 — P2 — revert stage snap-back loses intra-gate progress (stage/gate inconsistency by design ceiling)
- Evidence: `gate-helpers.ts:422-439` (`representativeStageForGate`: G3 → `packaging`, G4 → `approval`) + `updateProjectGate` (gate-helpers.ts:441-454). A single-gate revert from stage `handoff` (G4) lands on `packaging`, silently discarding `costing_nutrition/trial/sensory/pilot/approval`; a revert from `pilot` lands on `recipe`. Meanwhile gate-keyed children (checklists, approvals — see F6) are untouched, so stage and its artifacts disagree. Documented as intentional ("earliest stage of that gate") but the blast radius is undocumented to the user.

### F9 — P2 — revert outbox `dedupKey` embeds `Date.now()` → dedup is a no-op
- Evidence: `revert-npd-gate.ts:90` and `revert-gate.ts:85` — `dedupKey: \`…:${Date.now()}\``. `emitOutbox`'s `on conflict (org_id, dedup_key) do nothing` (gate-helpers.ts:475) can never fire; a retry/double-submit emits duplicate `npd.gate.reverted` events. (Same pattern in the e-sign `nonce` at revert-npd-gate.ts:72 — there uniqueness is intended, fine.)

## Verified CLEAN

- **Revert orphan-row hunt**: G3→G2 revert leaves the FG candidate (`product` view row, `items` twin, `factory_specs`, `npd_projects.product_code`, `formulations.product_code`) in place, but re-advance reuses them idempotently (`createFgCandidate`/`ensureFgCandidateMapped`, gate-helpers.ts:487-636 — existence checks + `on conflict` + `product_code is null` guards). No dangling/duplicated children on re-entry.
- **handoff_checklists after revert-from-handoff**: re-entry re-seeds via `on conflict on constraint handoff_checklists_org_project_unique` and only seeds items when none exist (gate-helpers.ts:988-1024). Clean.
- **`updateFaCell` built-reset path post-359**: single-column view UPDATE → `new.built = old.built` so the downgrade guard is skipped; reset flows through `v_effective_built` (359:413-418, 474, 503) with correct `fa.built_reset` emission (359:422-429) keyed on `new.product_code` (rename-safe). Clean.
- **Double-emit check**: `fa_reset_product_built_for_edit` (built-only update) + INSTEAD-OF fn cannot both emit — `v_non_built_changed` is false for a built-only update. Clean (moot while F2 raises, but logically clean).
- **`sync_prod_detail_rows` ordering in current callers**: update-fa-cell.ts:81-83, finish-wip.ts (view update at :114 precedes sync), gate-helpers.ts:749-751 — built is always reset via the view before the prod_detail sync, so F2's raise is not reachable from these three flows today.
- **`revertNpdGate` locking/RLS**: `for update of p` + `app.current_org_id()` scoping (revert-npd-gate.ts:110-130); release-lock read of `product.private_jsonb` resolves correctly through the 359 view (`private_jsonb ← items`, 359:136). Clean.
- **INSTEAD-OF DELETE orphan check** (359:517-546): legacy anchor deleted first so FK satellites gate the hard delete exactly as pre-cut; `fg_npd_ext` + `items` removed after. No orphan path found.

## NOT covered

- Runtime/live DB verification (read-only static pass; did not connect to Supabase to confirm live trigger catalog matches migrations, e.g. whether a hotfix altered `product_instead_of_update_fn` out-of-band).
- The mig 358 `update_fa_allergen_set` dual-mode internals (only its call sites from 359's fns).
- Whether `DATABASE_URL_APP` on Vercel truly logs in as role `app_user` (inferred from with-org-context.ts comments + mig grants; not verified against env).
- `cascade-engine chain1-pack-size.ts` (the other §8f FOR-UPDATE callsite) and the broader FA cascade engine.
- Planning/scheduler/production consumers of `prod_detail` (verified read-only by grep, not line-by-line).
- The `__verify__` migration harness and whether repo tests execute migrations under an `app_user`-named role (test-pool skim only).
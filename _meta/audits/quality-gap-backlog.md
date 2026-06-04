# MonoPilot Kira — Consolidated Quality/Gap Backlog (2026-06-04)

Source: 10-lens read-only gap-sweep (workflow `quality-gap-sweep` wnf538zqv) at branch
`kira/long-run` HEAD `21055121` / canon @208. **90 raw findings → 11 P0 / 32 P1 / 32 P2 / 15 P3**;
synth deduped to 28 actionable, **5 promoted P0**. Full synth + raw findings in the workflow
transcript. This doc = the actionable core that drives the next FIX WAVE.

## Top 5 themes
1. **Write paths that silently no-op / go stale** — Import/Export jobs never processed (02);
   allergen set stale after recipe edits (01, food-safety); wo_outputs/consume absent so the
   production yield gate is structurally fake (08). Users see green where nothing happened.
2. **Cost SSOT integrity broken (03-technical)** — createItem/updateItem write items.cost_per_kg
   directly, bypassing the item_cost_history ledger + V-TEC-53 approver guard, and coerce NUMERIC
   through a JS float. Two stores, mismatched precision (18,6 vs 10,4).
3. **Security invariants enforced by fragile convention, not hard control** — V18 built-downgrade
   gated on a session GUC any app_user can set (01); RBAC SoD fix depends on trigger-name lexical
   ordering (02); release-bundle reads RLS-only with no org_id belt (03).
4. **"Built/green ≠ live-verified" + uncollected worktrees** — entire 03-technical Wave-C UI
   (~16 screens) never Gate-5 verified; 08-production E2/E3/E4 (consume/output/OEE) not collected.
5. **Dead-ends & drift on signed-off modules** — stub nav items, deferred tabs/buttons, duplicate
   route trees, inconsistent locale pickers, stale REALITY docs. Honest stubs presented as complete.

## P0 — Next Fix Wave (user-blocking / security / data-integrity)

### P0-1 · Allergen set goes STALE after recipe/ingredient edits (food-safety / recall hazard) — 01-npd
- Evidence: `apps/web/app/(npd)/fa/actions/update-fa-cell.ts:96-98` (recipe edit calls syncProdDetailRows
  but never `update_fa_allergen_set`); `packages/cascade-engine/src/chain3-recipe.ts:99` (writes
  ingredient_codes, emits fa.recipe_changed, no allergen recompute); persisted product.allergens/
  may_contain only materialized by explicit `update_fa_allergen_set`.
- Impact: persisted allergens (read by labels, D365 builder, BOM export) stay stale until manual
  Refresh / nightly worker. Wrong allergen declaration = recall.
- Fix: call `update_fa_allergen_set(product_code)` in the same txn on any recipe_components/
  ingredient_codes/manufacturing_operation_* change; preferably an AFTER UPDATE trigger (mirror
  fa_reset_built) so persistence can't diverge from the view.

### P0-2 · V18 built-downgrade invariant bypassable (CFR-21 Part 11 / BRCGS audit hole) — 01-npd
- Evidence: `packages/db/migrations/141-update-fa-cell-reset-built.sql` — fa_built_v18_check_fn permits
  built true→false when `current_setting('app.fa_built_reset_allowed')='on'`; flag set via plain
  set_config in fa_reset_product_built_for_edit (SECURITY INVOKER, granted app_user). Audit emitted
  only by the helper, not the trigger.
- Impact: any app_user can `set_config('app.fa_built_reset_allowed','on',true)` then clear built with
  NO fa.built_reset audit record. Regulatory audit guarantee is advisory, not DB-enforced.
- Fix: move enforcement off the session GUC — SECURITY DEFINER reset owned by a privileged role +
  revoke direct UPDATE-of-built from app_user, OR have the trigger itself INSERT the audit event.

### P0-3 · createItem/updateItem bypass cost ledger + corrupt NUMERIC (dual-owned cost SSOT broken) — 03-technical
- Evidence: `create-item.ts:36-60` inserts items.cost_per_kg; `update-item.ts:60` sets cost_per_kg —
  neither writes item_cost_history nor applies the >20% V-TEC-53 approver guard (canonical writer
  `post-cost.ts:118-152` does). `technical/items/_actions/shared.ts:88,113` use z.coerce.number() →
  IEEE-754 rounding before Postgres numeric(18,6); the dedicated cost path keeps cost as STRING to
  avoid exactly this.
- Impact: items.cost_per_kg drifts from active history row; technical.items.edit changes cost with no
  history/audit/approver; high-precision costs float-rounded; downstream costing/variance disagree.
- Fix: remove cost_per_kg from create/update write set (route through post-cost.ts); item_cost_history
  = single writer of items.cost_per_kg; replace z.coerce.number() with the string-preserving validator;
  bind raw string ::numeric. (Dedupes the NUMERIC-coercion + first-cost V-TEC-53 findings.)

### P0-4 · Import/Export jobs write-only — no worker processes them (silent no-op) — 02-settings
- Evidence: `apps/web/actions/import-export/import.ts:236-251` + `export.ts:51-66` insert
  import_export_jobs status='queued'; grep shows no consumer; `apps/worker/src` is EMPTY; download_url
  always null.
- Impact: SET-029 accepts uploads, shows a queued job, but nothing runs. Jobs sit queued forever;
  users believe data imported/exported when it was not.
- Fix: implement a worker/cron draining import_export_jobs (parse csvText → reference/import-csv commit
  path → artifact + download_url + status=done), OR downgrade the screen to an honest stub.

### P0-5 · 08-production E2/E3/E4 absent — consume/output/OEE never written; yield gate fake — 08-production
- Evidence: no consume/fefo/genealogy in apps/web/lib/production/; wo_material_consumption (mig 181)
  + wo_outputs have no writer on-branch (the E2/E3/E4 work sits in UNCOLLECTED worktrees).
- Impact: production completion "yield gate" has no actual output/consume data — structurally fake;
  the canonical wo_outputs producer isn't wired.
- Fix: collect + wire the 08-production consume/output/OEE app layer (the production-cluster worktrees),
  route every consume/output/completion through holdsGuard (T-064) + canonical wo_outputs.

## P1 (32) / P2 (32) / P3 (15)
Full enumerated list in the workflow transcript (gap-sweep wnf538zqv synth). Headlines:
- P1: 03-technical Wave-C UI ~16 screens never Gate-5 verified; lab-results + costs/d365-import server
  crashes (unfixed); T-075 supplier-specs API absent; release-bundle RLS-only (add org_id belt);
  cross-module event-contract consumers missing; 4-locale i18n key gaps; test-coverage holes on
  consume-gate/e-sign/money.
- P2: perf (N+1, over-fetch), defense-in-depth, duplicate settings route trees, parity-evidence gaps.
- P3: cosmetic nav stubs, documented limitations, hygiene.

## Cross-reference
- Codex cross-provider findings (overlapping + complementary): `_meta/runs/reopen/codex-review-verdicts.md`
  (org-coupled FK wave; quality 197 seq-grant/v_active_holds/retention; etc.).
- Several P0s (allergen-stale, V18, cost-SSOT) are on SIGNED-OFF modules (01-npd, 02-settings,
  03-technical) — they passed module sign-off but the deeper audit found real integrity gaps. Fix wave
  should treat these as reopen items.

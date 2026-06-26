# Design — Merge `public.product` into `public.items` (single canonical item master)

**Date:** 2026-06-26 · **Status:** DESIGN (read-only). No code/migration shipped here.
**Owner decision (P0 #6):** FULL MERGE NOW — `public.items` becomes the one master; `public.product`
becomes a **VIEW + NPD extension table** over `items`. Owner accepted the live-risk. **The migration
plan below MUST be reviewed before any go-live phase (P5) is applied.** Next free migration # = **353**.

Pairs with `_meta/plans/2026-06-26-npd-dyn-fg-p0-plan.md` (decision #6) and the duplicate-systems audit
(`memory/duplicate-systems-audit-2026-06-26.md`, DUP-2 "FG split").

---

## 1. Current state — the two masters and where they meet

| | `public.product` | `public.items` |
|---|---|---|
| Created | mig **075** (`075-product-and-fa-view.sql`) | mig **153** (`153-items-master.sql`) |
| Identity | PK `(org_id, product_code)` text (mig **142** moved PK global→per-org) | PK `id uuid`; unique `(org_id, item_code)` |
| Role | NPD **FA/FG** master — 69-col "Main Table", dept close flags, MRP/commercial/procurement cols, `built`, `status_overall`, allergen-declaration flags (mig 346), soft-delete `deleted_at` (mig 132) | Universal production master, typed `rm/intermediate/fg/co_product/byproduct`; pack-hierarchy (mig **267**), NPD provenance `origin_module`/`npd_project_id` (mig **351**), cost, shelf-life, D365 mirror |
| Compat view | `public.fa` = `select * from product where deleted_at is null` (mig 132); read-only (INSTEAD-OF reject trigger) | — |
| Readers (TS) | ~38 files (`from public.product`) | **134 files** (`from/join public.items`) |
| Writers (TS) | ~17 files | ~16 files |
| Key style | **product_code text** everywhere | **id uuid** (55 id-keyed reads) + a few `item_code` |

**The seam (root of "FG not found" / FG duplication):**
- `bom_headers.product_id` is **TEXT → product(org_id, product_code)** FK (mig 090 line 9; mig 142 re-added composite).
- `bom_lines.component_code` is TEXT, resolved to items **by item_code** at WO create (`createWorkOrder.ts:183-185`).
- `work_orders.product_id` is **UUID → items.id** (soft FK, no DB constraint; mig 176 line 34).
- `factory_specs.fg_item_id` → **items.id**; release joins `factory_specs → items` on `items.item_code = npd.product_code`.
- The NPD FG and the production FG are **two rows in two tables** that the materializer keeps in lock-step by
  forcing `items.item_code == product.product_code == npd_projects.product_code` (see §3).

### 1a. Every `product` reader/writer (catalogue + key used — all key on `product_code`)

**Writers** (`insert/update/delete public.product`): `(npd)/fa/actions/{create-fa,delete-fa,update-fa-cell,
close-dept-section,reopen-dept-section}.ts`, `(npd)/pipeline/_actions/_lib/{gate-helpers,materialize-npd-bom}.ts`,
`pipeline/[projectId]/formulation/_actions/lock-version.ts`, `technical/bom/_actions/create-draft.ts`,
`(npd)/fa/[productCode]/_actions/finish-wip.ts`, `(npd)/fa/[productCode]/allergens/_actions/accept-declaration.ts`,
`cascade-engine/src/{chain1-pack-size,chain3-recipe}.ts`.
**Readers** (`from public.product`): the 38 listed by grep — NPD dashboard/pipeline/fa actions, `get-project.ts`,
`list-projects.ts`, `factory-release-status.ts`, technical `bom/{queries,recipe,detail-page,generate-batch,create-draft}.ts`,
`technical/where-used/list-where-used.ts`, `nutrition/list-nutrition.ts`, `settings/boms/boms.ts`,
`packages/queries/src/list-fa-by-dept.ts`, `packages/cascade-engine/src/chain{1,2}*.ts`, `packages/storage/src/builder-storage.ts`.
**SQL view/fn readers:** `public.fa`, `public.fa_allergen_cascade` (mig 345), `public.fa_bom_view` (mig 090),
`sync_prod_detail_rows()` (mig 157), status/built triggers (migs 097/222/223).

### 1b. The 14 satellites FK'd to `product(org_id, product_code)` (authoritative list = mig **142**)

`prod_detail`, `npd_projects`, `nutrition_profiles`, `nutrition_allergens`, `nutri_score_results`,
`costing_breakdowns`, `risks`, `compliance_docs`, `formulations`, `fa_allergen_overrides`,
`fa_builder_outputs`, `allergen_cascade_rebuild_jobs`, `bom_headers`, `factory_release_status`.
All are **NPD-domain** tables keyed by text `product_code`. `prod_detail` + `formulation_ingredients`
ALSO already carry a nullable `item_id uuid → items(id)` (mig **157**) — the bridge already exists on the component side.

---

## 2. Column overlap (product → items mapping)

**Direct map to existing items cols:** `product_name→name`, `shelf_life(text)→shelf_life_days(int)` (parse),
`tara_weight→tare_weight`, `price→cost/list-price`, `supplier`, `bar_codes→gs1_gtin`, `ext_jsonb`,
`private_jsonb`, `schema_version`, `org_id`, `created_*`, `deleted_at→status='deprecated'`.
**No items equivalent → must live in the NPD extension table** (`fg_npd_ext`): the ~55 NPD-process/MRP/commercial
columns — `pack_size`, `number_of_cases`, `recipe_components`, `ingredient_codes`, `template`, `closed_*`/`done_*`
dept flags, `primary_ingredient_pct`, `runs_per_week`, `cases_per_week_w{1,2,3}`, `process_{1..4}`/`yield_p{1..4}`,
`line`/`dieset`/`staffing`/`rate`/`pr_code_*`, `box`/`labels`/`web`/`mrp_*`/`pallet_stacking_plan`/`box_dimensions`,
`lead_time`/`proc_shelf_life`, `status_overall`, `days_to_launch`, `built`,
`allergens_declaration_accepted{,_by,_at}`, AI/trace (`model_prediction_id`,`epcis_event_id`,`external_id`).

---

## 3. The FG-NPD-002 → FG-002 rename (rides with the merge)

Today `deriveProductionCode(npdCode) = npdCode` (identity) in `materialize-npd-bom.ts:11`, with an explicit
comment: the rename is **deferred** precisely because the merge is not done. The probe + preflight look up the
active BOM (`bom_headers.product_id = productCode`) and the factory_spec (`items.item_code = productCode`) **by the
NPD code**, so deriving a different production code without changing those lookups makes materialize create a BOM/spec
the preflight can't find → promote rolls back. **Files that must change together:**
`materialize-npd-bom.ts` (derive + both INSERTs), `release-gate-status.ts:90-121`,
`release-preflight.ts:97-134,203-252` (BOM + factory_spec joins), and the WO-create FG lookup (`createWorkOrder.ts:60`).
**Where the derivation lands:** once `items` is the single master, the production code is just `items.item_code`;
the NPD-side code (`npd_projects.product_code`) becomes a **label/alias**, and the canonical join key for BOM/spec/WO
is `items.id`. The "rename" is then *cosmetic* (drop the `-NPD-` infix on the items.item_code at materialize time)
and safe, because all three lookups resolve through the same `items` row. **Do the rename in P4, after the BOM FK is
repointed to `items.id` (P3)** — never before, or the deferred-comment failure recurs.

---

## 4. Target model (recommended)

**`items` = the one master. `product` = a security-invoker VIEW over `items ⨝ fg_npd_ext`, with INSTEAD-OF
triggers** that fan writes back to `items` (overlap cols) + `fg_npd_ext` (NPD-only cols). Reasoning:

- **134 items readers vs 38 product readers** → fold the minority onto the majority's table, not vice-versa.
- The whole production/planning/warehouse/finance stack is already `items.id`-keyed; `product` is a pure NPD island.
- A **view + INSTEAD-OF triggers** lets every one of the 38 product readers AND all 14 FK satellites keep compiling
  and running unchanged through the whole transition (they still see `product_code`, now sourced from `items.item_code`).
- **Folded-columns vs extension-table:** put NPD-only cols in a 1:1 **`fg_npd_ext`** extension table keyed by
  `item_id uuid` (NOT folded into `items`). Keeps `items` lean for the 134 non-NPD readers, isolates the 55 NPD cols,
  and lets the extension carry its own RLS/grants. (Residual owner choice — see §7.)

The legacy `public.fa` view (read-only) keeps working — it just re-points to the new `product` view.

---

## 5. Phased migration (each phase independently shippable + reversible)

> **GO-LIVE CUT = start of P3** (writer/FK repoint). P0–P2 are additive/no-op and safe to land anytime.

### P0 — Extension table + backfill scaffolding *(additive, no behaviour change)* — mig 353
- `create table public.fg_npd_ext (item_id uuid pk → items(id) on delete cascade, org_id, <55 NPD cols>, ...)`,
  RLS `org_id = app.current_org_id()`, grants to `app_user`. Empty.
- Add to `items`: `legacy_product_row boolean`/`npd_alias_code text` only if needed for the alias (see §3).
- **Risk:** none (new empty table). **Rollback:** `drop table fg_npd_ext`.

### P1 — Backfill items + ext from product *(additive, idempotent)* — mig 354
- For every `product` row with no matching `items` row (by `(org_id, product_code)`→`item_code`): insert an `items`
  row (type `fg`, status from `built`/`deleted_at`, overlap cols mapped per §2) + an `fg_npd_ext` row (NPD cols).
- For products that ALREADY have an items twin (the materializer's lock-step rows): just insert/refresh `fg_npd_ext`.
- Guard every insert with `on conflict (org_id, item_code) do …` + `not exists`. No writes to `product`.
- **Risk:** code-collision (a non-NPD items row sharing the derived code) — detect & report, do NOT overwrite.
  **Rollback:** `delete from fg_npd_ext`; delete only items rows stamped `origin_module='npd_backfill'`.

### P2 — Repoint READERS to items-backed `product` view *(behaviour-preserving)* — mig 355
- Rebuild `public.product` as a **VIEW** `select … from items i join fg_npd_ext x …` exposing the exact legacy
  column list (so the 38 readers + `fa`, `fa_allergen_cascade`, `fa_bom_view`, `sync_prod_detail_rows` are unchanged).
- Keep the **base table** under a new name `product_legacy` (rename) so writers still work until P3; the view shadows it.
- **Risk:** view/column-shape drift breaks a reader → **mitigate by diffing view columns against the mig-075/132/346
  column list in review**. **Rollback:** `drop view product; alter table product_legacy rename to product`.

### P3 — Repoint WRITERS + FKs to items **(GO-LIVE CUT — review gate here)** — migs 356–357
- **INSTEAD-OF triggers** on the `product` view: INSERT/UPDATE/DELETE fan to `items` (overlap) + `fg_npd_ext` (NPD).
  Now the 17 product writers keep working through the view with zero code change.
- **Repoint `bom_headers.product_id`**: add `bom_fg_item_id uuid`, backfill from `items.id` by code, dual-write in
  the trigger/materializer, then swap the FK target to `items(id)` (the DUP-2 fold). Update the BOM/spec lookups in
  `release-gate-status.ts` / `release-preflight.ts` / `materialize-npd-bom.ts` to join on `items.id` (keep a
  `product_code` filter as belt-and-braces during transition).
- `work_orders.product_id` already → `items.id`; no FK change, just ensure no path now reads `product`.
- **Risk (highest):** a writer that bypasses the view, or an FK swap that orphans a BOM. **Mitigate:** ship triggers
  + dual-write FIRST, verify on live with a PREPARE/EXPLAIN of every BOM/spec/WO lookup, THEN swap the FK.
  **Rollback:** drop INSTEAD-OF triggers (writers hit `product_legacy` again); revert FK to `product_code`.

### P4 — FG-NPD-002 → FG-002 rename *(cosmetic, post-repoint)* — mig 358 + code
- Flip `deriveProductionCode` to strip the `-NPD-` infix; since all lookups now resolve via `items.id`, the alias
  `npd_projects.product_code` may differ from `items.item_code` safely. Update the 4 files in §3 together.
- **Risk:** stale `product_code`-keyed filters. **Mitigate:** the §3 files now key on `items.id`; rename is label-only.
  **Rollback:** restore identity `deriveProductionCode`.

### P5 — Cutover + cleanup *(after a full green E2E NPD→promote→WO→ship walk on live)* — mig 359
- Drop `product_legacy` base table; the `product`/`fa` views become the only `product` surface.
- Optionally migrate the 14 satellites to key on `items.id` (or keep `product_code` via the view — see §7).
- **Risk:** premature drop. **Mitigate:** gate on a recorded live walk + a 1-release soak. **Rollback:** restore from backup.

---

## 6. Top risks (cross-phase)

1. **BOM-FK swap orphaning** (`bom_headers.product_id` text→`items.id`) — the central seam; mis-step = "FG not found"
   returns for promote/WO. Dual-write + verify before swap (P3).
2. **View column-shape drift** — any of 38 readers + `fa_allergen_cascade` breaks silently if a column is renamed/typed
   differently. Column-diff in review (P2).
3. **`fa_allergen_cascade` is product-rooted** (mig 345 reads `product.ingredient_codes`, `prod_detail`, `formulations`)
   — it must read the **view** transparently; do NOT entangle the allergen-cascade rewrite (separate P0 lane) with this.
4. **Lock-step duplicate rows** — the materializer writes BOTH `items` + `product`; during P1–P3 a row can exist in one
   but not the other. Backfill must reconcile by code, never blind-insert.
5. **Rename-before-repoint** — repeating the deferred-comment trap if P4 runs before P3.

---

## 7. Residual sub-decisions for the owner

1. **Extension-table vs folded columns** — design recommends a 1:1 `fg_npd_ext` (keeps `items` lean). Owner may prefer
   folding the ~55 NPD cols straight into `items` (simpler view, wider table). **Pick one before P0.**
2. **Do the 14 satellites stay `product_code`-keyed (via the view) or migrate to `items.id` now?** Recommendation:
   keep them on `product_code` through the view (P3) and migrate lazily in P5 — smaller blast radius.
3. **RM/PM/ING fold-in timing** — this design folds **FG only** (product is FG/FA-only today). RM/PM already live in
   `items`; ING has no master yet. Confirm RM/PM/ING are **out of scope** for this merge (they are).
4. **`product_code` format after rename** — `FG0002` vs `FG-002` mask (ties to P0 code-mask work, decision #1).
5. **Soft-delete semantics** — map `product.deleted_at` to `items.status='deprecated'` vs keep a `deleted_at` on the
   extension. Recommendation: `status='deprecated'` (one lifecycle).

---

---

## 8. FINALIZED CUT (P2+P3) — live-schema facts + the allergen-fn BLOCKER (2026-06-26)

Ground-truthed against the live DB before the cut. **Decision: cut DEFERRED** — see blocker below.

### 8a. Live facts (differ from the §1 estimates)
- `public.product` = **table**, **93 columns** (full ordinal list captured in session). `fa` view = 84 of them (`WHERE deleted_at IS NULL`).
- **16 FK satellites** (not 14) reference `product(org_id, product_code)`:
  `npd_legacy_closeout`(fg_product_code), `prod_detail`, `npd_projects`, `nutrition_profiles`, `nutrition_allergens`,
  `nutri_score_results`, `costing_breakdowns`, `risks`, `compliance_docs`, `formulations`, `fa_allergen_overrides`,
  `fa_builder_outputs`, `allergen_cascade_rebuild_jobs`, `bom_headers`, `factory_release_status`, `fa_benchmarks`.
- **3 dependent VIEWS:** `fa`, `fa_allergen_cascade`, `fa_status_overall` (all `FROM product`).
- **4 triggers on product:** `fa_built_v18_check` (BEFORE UPD OF built — blocks app_user downgrade + high-open-risk),
  `fa_reset_built_on_product_edit` (BEFORE UPD — resets built=false on any edit + outbox, SECURITY DEFINER),
  `fa_allergen_set_refresh_on_product_insert/edit` (AFTER INS / AFTER UPD OF recipe_components,ingredient_codes →
  `update_fa_allergen_set(product_code)`).
- Data: **product=1 row** (FG-NPD-002 "cheleb 800g"), items(fg)=2 (FG-NPD-002 twin `4f7eaedc…` + an unrelated FG-001),
  fg_npd_ext=1. **The FG-NPD-002 items twin ALREADY matches product on overlap cols** (name, shelf_life_days=30,
  list_price/tare/gtin all null) — the materializer keeps them in lock-step, so "FG not found"/drift is already neutralised.
- `app_user` has INS/UPD/DEL/SEL on items, fg_npd_ext, product, bom_headers (triggers can fan-write).

### 8b. Column-coverage gaps (must extend `fg_npd_ext` before the view exists)
6 product columns map to neither `items` nor `fg_npd_ext` → ADD to `fg_npd_ext`:
`supplier text`, `created_by_device text`, `app_version text`, `allergens text[]`, `may_contain text[]`, `deleted_at timestamptz`.
(`deleted_at` lives in ext to keep the exact timestamp; `items.status='deprecated'` is the production lifecycle mirror.)
The other 75 NPD cols are already in `fg_npd_ext`; the 13 overlap cols source from items
(`product_code→item_code, product_name→name, bar_codes→gs1_gtin, shelf_life→shelf_life_days::text, tara_weight→tare_weight,
price→list_price_gbp, org_id, ext_jsonb, private_jsonb, schema_version, created_at, created_by_user→created_by, deleted_at`).

### 8c. ⛔ BLOCKER — the cut breaks the regulatory allergen function
`public.update_fa_allergen_set(product_code)` (called by the allergen-refresh trigger AND by accept-declaration/cascade actions) does:
```
select coalesce(prod.allergens,…) … from public.product prod where … FOR UPDATE;   -- (1)
… recompute from fa_allergen_cascade …
update public.product prod set allergens=…, may_contain=… where …;                 -- (2)
```
Once `product` is a **view with INSTEAD-OF triggers**: (1) `SELECT … FOR UPDATE` on such a view raises
`cannot lock rows in a view`, so the allergen refresh DIES; (2) the UPDATE must be re-routed allergens/may_contain → `ext`.
**Fixing this means rewriting a 21-CFR-adjacent allergen function** (lock `items`/`ext` instead of the view, write `ext.allergens`)
— precisely the allergen-cascade entanglement §6 risk #3 says to keep OUT of this merge. So the cut cannot be a blind drop-in.

### 8d. Finalized cut shape (when GO is given — items-as-master, cleanly reversible EXCEPT the FK swap)
1. mig: `alter table fg_npd_ext add` the 6 gap cols (§8b) + backfill from product. (additive, safe)
2. **Rewrite `update_fa_allergen_set`** to `FOR UPDATE` on `public.items` (by org+item_code) and `UPDATE fg_npd_ext` for
   allergens/may_contain. Ship + verify the allergen cascade on live FIRST, as its own reviewed step.
3. `alter table product rename to product_legacy` (16 FKs + 3 views + 4 triggers auto-follow). Drop the 4 legacy triggers.
4. `create view product` = 93 cols from `items i join fg_npd_ext x on x.item_id=i.id`.
5. INSTEAD-OF INSERT/UPDATE/DELETE on the view → fan to items(overlap)+ext(NPD)+`product_legacy` skeleton anchor
   (legacy keeps only product_code/org_id/NOT-NULL cols, sole purpose = the 16 FKs until P5). Absorb the 3 trigger behaviours
   (built-downgrade block, reset-built+outbox, allergen-refresh) into the INSTEAD-OF fns.
6. `create or replace` `fa`, `fa_allergen_cascade`, `fa_status_overall` (re-issued while the new `product` view exists →
   they re-bind to it). Verify each returns the SAME rows as before.
7. Verify: 93-col shape diff; product-row-before == view-row-after for all 93 cols; round-trip create-fa / update-fa-cell /
   accept-declaration / materialize-npd-bom through the view; FK-satellite insert still works.
**FK swap (`bom_headers.product_id` text→`items.id`) stays a SEPARATE later step (P3-FK) — the design's review gate.**

### 8e. Recommendation
Urgent value (drift / "FG not found") is ALREADY delivered by the lock-step + the shipped P0 fixes. The cut is an
architectural cleanup that now provably requires touching the regulatory allergen function. → **DEFER the cut to a dedicated
supervised session** (do §8d steps 1-2 as their own reviewed allergen-fn change first), and proceed with the other approved
lower-risk work (RBAC seed, bulk-import, NPD-revert, D365). Override available if owner wants the cut now.

## Doc path
`_meta/plans/2026-06-26-product-items-merge-design.md`

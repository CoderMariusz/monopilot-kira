# NPD v2 Redesign — staged plan (2026-06-29)

**Status:** PLAN-FIRST. This is the design doc that gates the build. No production code or
migrations change as part of writing it. Build proceeds slice-by-slice (§8) after owner review,
each slice Codex-implemented + cross-model-reviewed (`/kira:review`), Claude runs build/test
gates + applies migrations.

**Owner-confirmed anchors (the redesign must hold these):**

1. FULL NPD v2 redesign, plan-first then staged build.
2. **BOM is generated PER BOX.** `bom_line_qty = recipe_qty_per_pack × packs_per_box`,
   yield-adjusted so REAL consumption = `nominal_qty / per-component_yield`. A box weighs
   `packs_per_box × pack_weight`. Requires **packs-per-box** to be set on the FG.
3. Same data must not live in two places with diverging field names. Delete duplicate/repeated
   fields from departments — keep only what is needed.
4. Departments AND fields must be deletable / deactivatable.
5. **The project IS the FG** — one source of truth. Kill the project↔product↔items triple-entry.
6. The flow must be SHORT / easy.
7. Production uses **dynamic WIP processes** (NOT the 4 hardcoded read-only "PR" cells).
   Rename PR → WIP. Each operation yields a WIP product whose cost = RM cost + process cost,
   yield-adjusted.
8. **Plan→FG code drops the "NPD" segment.** When a project is promoted to an FG, the FG code is
   `FG-<number>` (e.g. `NPD-012` → **`FG-012`**), NOT `FG-NPD-012`. Owner add 2026-06-29.

Companion findings: `_meta/plans/2026-06-29-npd-bugs-and-wip-redesign.md`,
`_meta/plans/2026-06-26-product-items-merge-design.md`,
`_meta/plans/2026-06-26-npd-dyn-fg-p0-plan.md`,
`_meta/plans/2026-06-26-duplicate-systems-audit` (memory).

---

## 1. Current model map — what duplicates what

### 1a. The aggregate is split across FOUR stores keyed three different ways

| Store | Kind | Key | What it holds | Evidence |
|---|---|---|---|---|
| `public.npd_projects` | table | `id` uuid + `code` (`NPD-…`) | project lifecycle: `current_gate` G0–Launched, `current_stage`, `type`, `owner`, `target_launch`, `pack_weight_g`, nullable `product_code` FK → product, nullable `department_id` | mig 085:5-36; `pack_weight_g` mig 246:10 |
| `public.product` | **VIEW** (since mig 359) over `items ⨝ fg_npd_ext` | `(org_id, product_code)` | the 93-col "FG main table": `closed_core/_planning/_commercial/_production/_technical/_mrp/_procurement`, `done_*`, `status_overall`, `packs_per_case`, `pack_size`, `weight`, the 4 `process_N`/`yield_pN`/`pr_code_pN`, `line`/`dieset`, allergens | mig 359:61-159 |
| `public.items` | table | `id` uuid + `item_code` | the real FG master row (`item_type='fg'`), `origin_module='npd'`, `npd_project_id`, pack hierarchy `output_uom`/`net_qty_per_each`/`each_per_box`, `list_price_gbp`, `shelf_life_days` | mig 267:6-8; ensure path materialize-npd-bom.ts:235-245 |
| `public.fg_npd_ext` | table | `item_id` PK → items | the NPD-only columns the product view fans to (mig 353); INSTEAD-OF triggers write here | mig 353:15-79; triggers mig 359:190-550 |
| `public.product_legacy` | skeleton table | `(org_id, product_code)` | NOT-NULL anchor row only — keeps 16 FK satellites resolving | mig 359:37, 341-346 |

Plus the recipe + BOM stores:

| Store | Key | Holds | Evidence |
|---|---|---|---|
| `formulations` | `id`, `project_id` FK, nullable `product_code` | recipe header, `current_version_id`, `locked_at` | mig 093:5-16 |
| `formulation_versions` | `id`, `formulation_id` | `state` draft/submitted_for_trial/locked, `target_yield_pct`, `batch_size_kg` | mig 093:18-41 |
| `formulation_ingredients` | `id`, `version_id` | `rm_code`, **`qty_kg` = per-PACK kg**, `pct`, `sequence`, `allergens_inherited` | mig 093:53-76 |
| `prod_detail` | `id`, `(org_id, product_code)` | per-component production row: **4 hardcoded** `manufacturing_operation_1..4`, `operation_yield_1..4`, `intermediate_code_p1..4`, `intermediate_code_final`, `line`, `equipment_setup`, `rate`, `component_weight`, `item_id` | mig 076:5-32 |
| `packaging_components` | `project_id` | PM lines (`component_name`, `item_id`, `qty_per_pack`) | mig 232 |
| `bom_headers` / `bom_lines` | `product_id` (=item_code text) + `item_id`, `npd_project_id`, `origin_module='npd'` | the materialized production BOM | materialize-npd-bom.ts:383-449 |

### 1b. The four concrete duplications (the owner pain)

- **D1 — project ↔ product ↔ items triple-entry.** A project (`npd_projects`) is *separate* from
  the FG (`product`/`items`). They are linked only by `npd_projects.product_code → product` (mig
  085:17) and `items.npd_project_id`. Backfill mig 368 copies `pack_weight_g → weight` etc. The
  same conceptual FG lives in three rows under different keys (`code` vs `product_code` vs
  `item_code`) — the literal "same data in two places, diverging field names" the owner means.
- **D2 — DUAL field catalog.** Legacy `"Reference"."DeptColumns"` (seeded per-org, mig 095) is the
  *source*; mig 333 + 370 + 386 COPY it into the new dynamic `npd_field_catalog` /
  `npd_department_field` / `npd_departments`. Two catalogs, kept in sync by copy migrations → drift.
  The dynamic catalog is what the FA/FG forms + `is_all_required_filled` now read (mig 377/378), but
  DeptColumns is still seeded and still referenced by some readers.
- **D3 — `status_overall` split / never synced.** `fg_npd_ext.status_overall` is a **stored** text
  column (read by the Technical "Generate BOM batch" eligibility filter — generate-batch.ts:44-52,
  generator.ts `isComplete`) **vs** the **computed** `public.fa_status_overall` VIEW derived live
  from `closed_*` flags + `is_all_required_filled` (mig 359:649-690). Nothing writes the stored
  column from the computed one → an FG can read "Complete" in one and not the other.
- **D4 — repeated/positional fields.** `process_1..4`, `yield_p1..4`, `pr_code_p1..4` on the FG
  (mig 353:36-41) AND `manufacturing_operation_1..4`, `operation_yield_1..4`,
  `intermediate_code_p1..4` on `prod_detail` (mig 076:11-28). The hard cap of 4 is the owner's
  "PR I cannot create". Same data (a process + its yield) modelled twice, both as fixed-arity columns.

### 1c. The two BOM paths

- **Technical "Generate BOM batch"** (`technical/bom/_actions/generate-batch.ts`): an XLSX EXPORTER
  of EXISTING boms, gated on stored `status_overall='Complete'` (generate-batch.ts:44-52). Does NOT
  create the recipe→BOM; enqueues `bom_generator_jobs`.
- **NPD Handoff "Generate production BOM"** (`pipeline/[projectId]/handoff/_actions/
  generate-production-bom.ts` → `materializeNpdBom`): the REAL recipe→BOM materialiser. Needs only a
  locked formulation. **This is the single creation path** the owner should use.

### 1d. The dept-close gate today

`fa-tabs.tsx isTabLocked` (fa-tabs.tsx:139-147) locks the Commercial + Production *sections* until
Core is closed (`coreDone`). `closeDeptSection` (close-dept-section.ts:54-117) requires the dept's
visible+required fields filled (`is_all_required_filled`, mig 378) then sets `closed_<dept>='Yes'`.
Production has 4 hardcoded `prod_detail` rows the owner cannot create/close →
`closed_production` never reaches 'Yes' → `status_overall` never 'Complete' → FG absent from the
Technical batch (the "Bug D" chain).

### 1e. The BOM math bug (confirmed)

`materialize-npd-bom.ts:405`:
```ts
const qtyMultiplier = project.pack_weight_g ? Number(project.pack_weight_g) / 1000 : 1;
// line 408:
const quantity = (Number(ingredient.qty_kg ?? 0) * qtyMultiplier).toFixed(6);
```
For a 500 g pack `qtyMultiplier = 0.5` → it HALVES every ingredient and NEVER multiplies by
packs-per-box. `loadProject` (lines 158-167) reads `pack_weight_g` but never `packs_per_case` /
`each_per_box`. No per-component yield is applied. `bom_headers.yield_pct` is stamped once at header
level (lines 379, 490-496) — a single header yield, not per-component.

---

## 2. Target v2 model — single source of truth

**Principle: the NPD project row IS the FG aggregate.** No separate `product` entry, no triple key.
`npd_projects` becomes the canonical aggregate; `items` (`item_type='fg'`) is its **materialized
production projection** created at handoff; `bom_headers`/`bom_lines` derive from the recipe + WIP
routing. Everything else is computed, not stored-and-duplicated.

### 2a. Project = FG (KILL the triple-entry — D1)

- **KEEP** `npd_projects` as the aggregate root. Promote the FG attributes that today live only on
  `product`/`fg_npd_ext` onto the project (or a single 1:1 `npd_project_fg` extension keyed by
  `project_id`) so there is ONE editable home: `pack_size`, `packs_per_box` (new — see §2e),
  `pack_weight_g` (already here), `launch_date`, `shelf_life`, `line`, allergens, `list_price`,
  `volume`, dynamic field values (§2c jsonb).
- **`items` (`item_type='fg'`) stays the production master** but becomes WRITE-ONLY-from-NPD: it is
  derived from the project at handoff (the `ensureFgItem` path, materialize-npd-bom.ts:227-289),
  carrying the pack hierarchy `output_uom`/`net_qty_per_each`/`each_per_box`. Production / planning /
  warehouse keep reading `items` unchanged.
- **`product` view + `fg_npd_ext` + `product_legacy`: DEPRECATE then DROP** (staged, §7). The view
  exists only to keep ~38 legacy readers alive. v2 migrates those readers to read the project (NPD
  surface) or `items` (production surface). `product_legacy`'s 16 FK satellites repoint to
  `items.id` (the P3-FK work, already partly done: migs 362-365 added `item_id` read path).
- **`formulations.project_id`** already links recipe → project (mig 093:8). Recipe stays the SoT for
  composition; `formulations.product_code` becomes derivable (drop the redundant column, §7).

> Net: editing happens in ONE place (the project/FG). `items` + `bom_*` are projections generated at
> the single handoff materialize step. No more "complete here but not there".

### 2b. Completeness computed, never stored (fix D3)

- **DROP** stored `fg_npd_ext.status_overall` + the `done_*` booleans as a *stored mirror*.
- Make `status_overall` a single computed function/view over the project's `closed_*` flags +
  `is_all_required_filled(project, dept)`. The Technical batch eligibility (generate-batch.ts:44)
  reads the SAME computed value (one definition). Today there are two (`fa_status_overall` view vs
  stored col) — collapse to one. `closed_<dept>` stays as the only stored close flag (one per dept,
  keyed by project).

### 2c. ONE field catalog (fix D2)

- **Canonical = the dynamic trio** `npd_departments` / `npd_field_catalog` / `npd_department_field`
  (mig 333). It already supports `active` (deactivate), assignment `removeAssignment` (delete), and
  `is_auto`/`auto_source_field` derivations.
- **`"Reference"."DeptColumns"` becomes DEAD** — stop seeding it on new orgs (retire the mig
  095 seed path + the mig 370/386 copy-from-DeptColumns), and migrate any remaining DeptColumns
  reader to the dynamic catalog. After a soak, DROP DeptColumns.
- **Field VALUES move to a single jsonb** on the project (`field_values jsonb`) keyed by
  `npd_field_catalog.code`, INSTEAD of one physical column per field on `fg_npd_ext`. This is what
  makes "delete a field" real: removing a catalog row + its assignment makes the field disappear
  from the form and the close-gate with zero schema change. (Physical-column fields like
  `pack_size`/`launch_date`/`pack_weight_g` that other modules read stay as real columns; the
  *long tail* of dept-specific descriptive fields moves to jsonb.)

### 2d. Production / WIP tables (replace the 4 hardcoded — see §4)

New normalized tables (keyed by project, NOT product_code):
- `npd_wip_processes` — dynamic, add/split rows: `(project_id, component_id, seq, process_name,
  process_cost, yield_pct, output_wip_item_id)`.
- `npd_wip_components` (or reuse `prod_detail` renamed) — the ING/RM components a routing operates on.

### 2e. packs_per_box on the FG (anchor #2)

- The owner's "packs-per-box" maps cleanly to the EXISTING `items.each_per_box` (mig 267:8) on the
  production side. v2 surfaces it as an EDITABLE field on the project/FG (Core or Production dept),
  validated `> 0`, REQUIRED before a BOM can be generated.
- Keep `pack_weight_g` (per-pack weight) on the project. Then box weight = `each_per_box ×
  pack_weight_g` and BOM math (§5) uses `each_per_box` as the multiplier. Retire the ambiguous
  `product.packs_per_case` / `fg_npd_ext.packs_per_case` (mig 238/353) in favor of the single
  `each_per_box` once readers are migrated (it currently duplicates the concept).

### KEEP / MERGE / DROP summary

| Object | Verdict | Note |
|---|---|---|
| `npd_projects` | **KEEP + promote** | becomes the FG aggregate root |
| `items` (fg) | **KEEP** | production projection, derived at handoff |
| `product` view | **DROP** (staged) | readers → project or items |
| `fg_npd_ext` | **DROP** (staged) | NPD cols → project columns + `field_values jsonb` |
| `product_legacy` | **DROP** (staged) | FKs → `items.id` |
| `fg_npd_ext.status_overall` (stored) | **DROP** | replace with one computed fn |
| `done_*` booleans (stored) | **DROP** | computed |
| `closed_<dept>` flags | **KEEP** (move to project) | only stored close state |
| `process_1..4`/`yield_pN`/`pr_code_pN` (FG) | **DROP** | → `npd_wip_processes` rows |
| `prod_detail` 4× `manufacturing_operation_N`/`operation_yield_N`/`intermediate_code_pN` | **MERGE→** `npd_wip_processes` | unlimited rows |
| `npd_field_catalog` trio | **KEEP (canonical)** | already delete/deactivate-able |
| `"Reference"."DeptColumns"` | **DROP** (staged) | stop seeding, migrate readers |
| `packs_per_case` (product/ext) | **MERGE→** `items.each_per_box` | one packs-per-box concept |
| `formulations.product_code` | **DROP** | derivable from project |

---

## 3. Field / dept management

- **Departments:** already add/edit/deactivatable via `createDepartment` / `updateDepartment` /
  `setDepartmentActive` (npd-field-config.ts:311-377) with guards: cannot deactivate `Core`
  (line 344) or the last active dept (line 356). v2 adds **hard DELETE** for a dept with no
  field assignments + no project field-values referencing it (else block with a clear "deactivate
  instead" message). The dept-close gate already rejects a deactivated dept
  (close-dept-section.ts:71-87) — keep that.
- **Fields:** `createField` / `updateField` / `setFieldActive` / `removeAssignment` already exist
  (npd-field-config.ts:392-567). v2 adds **hard DELETE** of a catalog field when it is unassigned
  and unreferenced. Because v2 stores field VALUES in `project.field_values jsonb` keyed by code
  (§2c), deleting a field needs NO column drop — it just disappears.
- **Dedupe the repeated fields:** the 4×process / 4×yield / 4×pr_code catalog entries (mig 333:242-259)
  are REMOVED from the catalog — they become the dynamic WIP routing (§4), not dept fields. This is
  the bulk of the "delete duplicate/repeated fields" the owner asked for.
- **Minimal field set per dept (v2 target — owner to confirm in §9):**
  - **Core:** Product Name, Pack Size, Packs-per-box, Pack Weight, Recipe link, Allergens, Comments.
  - **Commercial:** Launch Date, Customer/Article number, Forecast (cases/week), Price.
  - **Production:** Line, (WIP routing lives in its own editor, NOT as dept fields), Final output item.
  - **Technical:** Shelf Life.
  - **MRP / Procurement:** packaging refs + supplier/lead-time (keep only what planning consumes).
  - Drop the per-week W1/W2/W3 triplets unless owner wants them (collapse to one forecast field).
- Add/edit/delete/deactivate is driven entirely from `settings/npd-fields` (existing screen
  `npd-fields-screen.client.tsx`) — extend it with the DELETE affordance + a "referenced by N
  projects" guard read.

---

## 4. Production / WIP model

**Goal: replace the 4 fixed `prod_detail` operation slots with an unlimited, dynamic WIP routing,
rename PR → WIP, make each operation produce a costed WIP item, and make the Production tab
closeable.**

### 4a. Schema (one migration)
- `npd_wip_components (id, org_id, project_id, item_id, seq, role)` — the ING/RM inputs a routing
  starts from (reuse / rename `prod_detail` to this shape, or new table + migrate rows). Each row =
  a real item (rm/ingredient/intermediate), as add-prod-detail-component.ts already enforces
  (lines 109-121).
- `npd_wip_processes (id, org_id, project_id, component_id FK, seq, process_name, process_cost
  numeric, yield_pct numeric CHECK 0<pct<=100, output_wip_item_id FK→items null)` — **unlimited
  rows**, add/split dynamically. `process_name` from the dynamic dropdown
  (`Reference."Allergens_added_by_Process"` still feeds the allergen cascade by name).
- A WIP process row optionally **generates a WIP item** (`item_type='intermediate'`,
  `origin_module='npd'`) so its cost can roll forward.

### 4b. Costing (anchor #7)
- WIP item cost = (sum of input component costs) + `process_cost`, divided by `yield_pct` (yield loss
  inflates unit cost). Cascades up the routing: a downstream process consumes upstream WIP at its
  rolled cost. Surface the rolled cost per WIP row in the Production tab and in the costing rollup
  (`get-costing-rollup.ts`).

### 4c. UI (Production tab)
- **REMOVE** the 4 hardcoded process/yield/pr-code cells in `fa-production-tab.tsx` (the
  `ordered` columns grid, lines 603-619) and the `prod_detail`-positional render.
- **RENDER** ING + RM (read-only, inherited from the locked recipe) + a dynamic add/remove WIP
  **process table per component** (one row per operation, "+ Add process" / "Split").
- **REMOVE** the blocking validation + the un-creatable PR + the `dieset` selector blocker so the
  Production close gate no longer demands the impossible. `closed_production` becomes closeable once
  Line + final output are chosen (no mandatory 4-process fill).
- FG: a **line picker** + **final-output item** selector (anchor #7) on the Production tab / handoff.

### 4d. Allergen cascade follow-through
- `fa_allergen_cascade` (mig 359:582-644) currently reads `prod_detail.manufacturing_operation_1..4`
  via a `VALUES (...)` lateral (lines 600-607). v2 rewrites that CTE to read
  `npd_wip_processes.process_name` (unnest rows, not 4 columns) so the process-added allergens still
  flow. This is the one place the 4-column shape leaks into SQL — must change with the schema.

---

## 5. BOM + yield math (the corrected formula)

**Per-box, yield-adjusted (anchors #2, #7-yield):**

```
For each recipe ingredient i (formulation_ingredients.qty_kg = per-PACK kg):
  nominal_per_box(i) = qty_kg(i) × each_per_box           // per-box nominal
  real_per_box(i)    = nominal_per_box(i) / component_yield(i)   // yield-adjusted REAL consumption
  bom_line_qty(i)    = real_per_box(i)

Box weight (sanity) = each_per_box × pack_weight_g / 1000  (kg)
```

- `component_yield(i)` comes from the WIP routing (§4) for the component that ingredient belongs to;
  default `1.0` when no routing row, so behaviour is safe when yield is unset.
- **Where it lives:** rewrite `materialize-npd-bom.ts`:
  - `loadProject` (lines 158-167): also select `each_per_box` (packs-per-box) — today it only reads
    `pack_weight_g`.
  - `createActiveNpdBom` line 405: replace
    `const qtyMultiplier = pack_weight_g/1000` with `each_per_box` (default 1, and **require** it
    is set — fail with a clear `PACKS_PER_BOX_REQUIRED` result code if null, since anchor #2 says a
    box-BOM needs it).
  - line 408: `quantity = qty_kg × each_per_box / component_yield(i)`.
  - PM lines (lines 428-449): packaging qty also `× each_per_box` (one PM per pack → per box).
- Keep `bom_headers.yield_pct` for backward compat but the authoritative yield is now per-component
  (line-level) — header yield becomes a display rollup, not the consumption driver.
- Guard: add a pure function `computeBomLineQty(qtyKg, packsPerBox, yieldPct)` with unit tests
  (the existing `materialize-npd-bom.test.ts` is the home), so the formula is testable without a DB.

---

## 6. ONE BOM path

- **recipe → BOM via `materializeNpdBom` is the SINGLE creation path.** It runs from NPD Handoff
  "Generate production BOM" (generate-production-bom.ts) and is the only place a production
  `bom_headers`/`bom_lines` row is born for an NPD FG.
- **Technical "Generate BOM batch" = EXPORT ONLY.** Keep generate-batch.ts as an XLSX exporter over
  EXISTING boms. Change its eligibility filter (generate-batch.ts:44-52) to read the SINGLE computed
  `status_overall` (§2b) instead of the stored column, and relabel it in the UI as "Export BOM
  batch (XLSX)" so the owner stops mistaking it for a creator.
- Remove any UI affordance that implies the Technical batch creates a BOM; add a one-line helper on
  the Technical BOM screen pointing to NPD Handoff for creation.

---

## 7. Migration / cutover strategy (no data loss, reversible stages)

Next free migration = **387** (per memory: mig 386 = catalog seed; HEAD next is 385/387 range —
confirm with `pnpm db` ledger before authoring). Each stage is one reversible migration + its code.

1. **387 — add v2 columns ADDITIVELY (no drops).** Add `each_per_box` surfacing + `field_values
   jsonb` + promote FG attributes onto `npd_projects` (or `npd_project_fg` 1:1). Backfill from
   `product`/`fg_npd_ext` (the inverse of mig 368). Triggers keep the old `product` view in sync
   during the dual-write window. Fully reversible (drop the new columns).
2. **388 — WIP tables.** Create `npd_wip_components` + `npd_wip_processes`; backfill from the 4
   `prod_detail` operation slots (4 columns → up to 4 rows per component). Reversible.
3. **389 — computed completeness.** New single `npd_status_overall(project)` fn + a view; backfill
   nothing (it's computed). Repoint `generate-batch.ts` + FG list + handoff eligibility to it.
   Stored `status_overall` kept but no longer read (drop in a later stage).
4. **390 — repoint readers off the `product` view to the project/items.** This is the largest,
   riskiest stage (~38 readers). Do it module-by-module behind the dual-write window. Each reader
   PR verified live. Allergen cascade SQL rewrite (§4d) lands here.
5. **391 — stop seeding DeptColumns + retire copy migs.** New-org seeding writes the dynamic catalog
   directly (port mig 386 to seed the v2 minimal field set, §3). DeptColumns left in place but dead.
6. **392+ — DROP deprecated objects after soak:** `fg_npd_ext.status_overall`/`done_*`, the
   4×process columns on `fg_npd_ext` + `prod_detail`, `formulations.product_code`,
   `product`/`fg_npd_ext`/`product_legacy` (only after the P3-FK satellites repoint to `items.id`),
   `"Reference"."DeptColumns"`, `packs_per_case`. Each drop is its own gated migration with a
   live-soak before it.

**Backfill list:** product→project FG attrs (inverse of mig 368); `packs_per_case`→`each_per_box`;
`prod_detail` 4 slots → WIP rows; per-field physical columns → `field_values jsonb`.

**Reversibility rule (memory gotcha):** never edit a migration after apply (checksum gate); never
drop immutable/audit tables; each DROP stage independently revertible until the prior stage soaked.

---

## 8. Staged build plan (Codex-sized slices, dependency order)

Each slice: Codex-implement (3-5 files) → `/kira:review` cross-model → Claude build/test gate +
migration apply. **R = risk (●●● high).** Migrations applied by Claude via Supabase MCP, never Codex.

| # | Slice | Files (~) | Deliverable + verification | R |
|---|---|---|---|---|
| S0 | **BOM math fix (standalone, ship first)** | `materialize-npd-bom.ts` (loadProject + line 405/408 + PM), `materialize-npd-bom.test.ts`, extract `computeBomLineQty` | Per-box, yield-adjusted, `each_per_box` required. RED-first unit tests on the pure fn; integration test on a 500 g × 6/box recipe. | ● |
| S1 | **Settings: delete dept + delete field + data_type dropdown** | `npd-field-config.ts` (add delete + referenced-by guard), `npd-fields-screen.client.tsx`, edit-field form (data_type `<select>`, closed-flag yes/no) | Owner can delete/deactivate dept & field; edit-field "Data type" is a dropdown (Bug E); closed_* renders yes/no (Bug A). RTL + action unit tests. | ● |
| S2 | **mig 387 — v2 columns additive + backfill** | mig 387, `get-project.ts`, FG/project loader | Project carries FG attrs + `each_per_box` + `field_values jsonb`; live PREPARE-verify the backfill; old view still green. | ●●● |
| S3 | **mig 388 — WIP schema + backfill from prod_detail** | mig 388, types | `npd_wip_components`/`npd_wip_processes` live; 4-slot backfill verified row-count parity. | ●● |
| S4 | **WIP actions (add/split/remove process, cost rollup)** | `wip-process actions` (new), `get-costing-rollup.ts` | Add/split/remove process; WIP cost = RM+process /yield; action unit + integration tests. | ●● |
| S5 | **Production tab UI rebuild (dynamic WIP, kill 4 cells, line+final-output)** | `fa-production-tab.tsx`, `load-fa-dynamic-sections.ts`, prod tab test | Dynamic process table; no hardcoded grid; Production closeable. RTL parity + close-gate test. | ●●● |
| S6 | **mig 389 — single computed status_overall + repoint eligibility** | mig 389, `generate-batch.ts`, `generator.ts`, FG list loader | One completeness definition; Technical batch + FG list read it; eligibility test. | ●● |
| S7 | **Technical batch = export-only relabel + helper** | `bom-list-screen.tsx`, i18n, generate-batch label | UI says "Export"; helper points to Handoff. Parity test. | ● |
| S8 | **mig 390 — repoint product-view readers (module-by-module)** | per-module loaders + allergen cascade SQL rewrite (§4d) | Largest. Split into sub-slices per module; each live-verified. | ●●● |
| S9 | **mig 391 — v2 org seeding + stop DeptColumns seed** | seeding mig, retire 370/386 copy | New org gets v2 catalog directly; verify a freshly-seeded org. | ●● |
| S10 | **mig 392+ — staged DROPs after soak** | one mig per drop | Each drop gated by a soak; reversible. | ●●● |
| S11 | **Field VALUES → jsonb migration (long-tail dept fields)** | mig + render/write path (`update-fa-cell.ts`) | Deleting a field needs no column drop; values keyed by code. | ●● |

**Riskiest / largest:** S2, S5, S8, S10 (each ●●●). S8 must be sub-divided per consuming module and
each PR independently live-verified (memory: local-green ≠ live-green). S0 + S1 are safe to ship
immediately and unblock owner testing while the schema work proceeds.

**Suggested order:** S0 → S1 (quick wins, ship now) → S2 → S3 → S4 → S5 (the WIP core) →
S6 → S7 → S8 (the big repoint) → S9 → S11 → S10 (drops last, after soak).

---

## 9. Open decisions for the owner (short + specific)

1. **packs-per-box home:** reuse `items.each_per_box` (production vocab) as the single packs-per-box,
   and retire `packs_per_case`? (Plan assumes YES.)
2. **field VALUES storage:** move long-tail dept fields to `project.field_values jsonb` (keyed by
   catalog code) so "delete field" needs no column drop, while keeping cross-module fields
   (pack_size/launch_date/line/price) as real columns? (Plan assumes YES.)
3. **minimal field set per dept (§3):** confirm the proposed trim — especially dropping the
   cases-per-week W1/W2/W3 triplet down to one forecast field, and which descriptive fields to keep.
4. **WIP item generation:** should EVERY process produce a stored `items` WIP row, or only when the
   owner ticks "create WIP item" (lighter — cost still rolls up without a stored item)? (Plan
   assumes optional/ticked.)
5. **`product` view drop timing:** is there any external/integration consumer of `public.product`
   (D365 export, reporting) that must keep the view longer than the internal readers? (Affects S10.)
6. **Production close requirement:** is choosing Line + final-output enough to close Production, or
   must at least one WIP process exist? (Plan assumes Line + final output only — to unblock close.)

---

## 10. CONFIRMED OWNER DECISIONS (2026-06-29) — BUILD FROM THESE

- **D1 ✅ YES** — packs-per-box = `items.each_per_box`; retire `packs_per_case`.
- **D2 ✅ YES** — long-tail dept fields → `project.field_values jsonb` (keyed by catalog code); cross-module essentials stay real columns.
- **D3 ✅ CUT TO MINIMUM + COLLAPSE TO 2 DEPARTMENTS: `Core` + `Production`** (was 7: Core/Commercial/Planning/Production/Technical/MRP/Procurement). The dynamic **add-department + assign-columns** capability STAYS (an org can add more depts/fields later). Minimal field set the owner specified:
  - **Components (RM/ingredients)** added WITH: **each-per-box**, **component prices**, **attach documentation** — these live where you add components.
  - **launch day**, **line** (where it's produced), **processes** (what it has).
  - Claude-suggested KEEP (owner to confirm during build): product **name + FG code**, **pack weight** (drives box weight), **target retail price**; the **recipe** (ingredients) itself; **allergens/nutrition derived from recipe** (regulatory, not hand-entered). CUT: Commercial/Planning/MRP/Procurement/Technical dept fields, the W1/W2/W3 cases-per-week triplet, all duplicated descriptive fields (or make them add-as-needed).
- **D4 ✅** — WIP `items` row created ONLY when the owner ticks "create WIP item" (cost still rolls up without a stored item).
- **D5 ✅ KEEP `public.product` view FOR NOW** (owner may want the drop later, NOT yet) → DEFER the product-view drop in S10; other drops may proceed.
- **D6 ✅ Production close REQUIRES ≥1 process.** RICHER PROCESS MODEL (supersedes §4's sketch):
  - A process has **TIME (duration)** and/or **RATE**, and a **COST**.
  - When elaborated, a process gets: assigned **ROLE(s)** + **HEADCOUNT per role** + how long it runs + an **additional cost**.
  - **Role RATES are configured in Settings** (NEW roles-rate config table: role → rate).
  - **`process_cost = Σ(role_rate × headcount × time) + additional_cost`**; WIP component cost = RM cost + Σ process_cost, yield-adjusted (§5).
  - SCHEMA IMPACT: `npd_wip_processes` needs duration/time + additional_cost; a `npd_wip_process_roles` link (process_id, role_id, headcount); a Settings `role_rates` table (role_id → rate). Costing rollup reads these.

- **D7 ✅ Plan→FG code drops "NPD" (anchor #8).** `NPD-012` → **`FG-012`** (not `FG-NPD-012`). SHIPPED in S0: `fallbackFgProductCode` (gate-helpers.ts) now strips a leading `NPD-` before the `FG-` prefix, so BOTH the suggested-code preview (`peekSuggestedFgCandidateCode`) and the real create path produce the clean code. SAFE because the FG↔project link is a stored FK (`npd_projects.product_code` / `items.npd_project_id`), never re-parsed out of the code string — so this also sidesteps the deferred FG-002 split-brain (the production code = the stored product_code = `FG-012`; `deriveProductionCode` stays identity, preflight finds the BOM/spec). NOTE: only affects NEW project→FG creations; existing `FG-NPD-*` codes are unchanged (renaming an existing FG's product_code is FK-entangled — separate gated decision if the owner wants it). If an org configures an FG code mask (`org_document_settings`), the mask path takes over and defines the format instead.

**Revised slice notes:** S1 also collapses the seeded dept set to Core+Production (existing org: deactivate the other 5, keep dynamic-add). S3/S4 add the process→role→headcount→time→rate→cost model + the Settings role-rate config. S5 Production-tab process row requires role+headcount+time; close-gate = ≥1 process. The field cull + 2-dept collapse is content work in S1/S2 + the new-org seed (S9).

---

**Saved to:** `_meta/plans/2026-06-29-npd-v2-redesign-plan.md`

# P0 — NPD-DYN dynamic departments/field-catalog + FG unification + code-format settings

Owner P0 set 2026-06-26 (interactive loop). Division of labour: **Codex codes, I (Claude) plan + orchestrate + review + build-gate + apply migrations + verify live**. Claude-UI owns the dynamic-render UI + prototype parity. Existing scaffolding to reuse: task #57 NPD-DYN, migration `npd_dynamic_fields` (20260624), settings page `/settings/tenant/depts`.

## The owner's mental model (one-liner)
Kill the **duplicated data-entry ideology**. Today the SAME data is entered in TWO places (Project brief AND the FA/FG department screens — e.g. Pack Size, Number of cases). Make **FG Dashboard / Finished Goods a DYNAMIC EXTENSION of the Project**: project fields = static minimum; FA/FG sections = dynamically built from a per-department **field catalog**; fields pre-fill from the Project; the two surfaces are usable interchangeably.

## P0-A — Settings → Departments (/settings/tenant/depts) [Codex backend + Claude-UI]
1. **Delete department** — missing; add a delete action (guard: block/cascade fields; confirm modal).
2. **Merge department** — currently broken; fix (move fields to target dept, then remove source).
3. Page layout = (a) **Departments** panel: list + "Add department" modal (just **name + short description**, keep current style); (b) **Field catalog** list.
4. **Field catalog** — each field row:
   - `name`
   - `department` (dropdown of departments)
   - `type` ∈ {text, number, date, **auto**}
   - if `type=auto` → **source field** (dropdown of other fields it derives from) — use-case: info entered in dep1 is needed (read-only) in dep2 → `auto` + the source field, NOT re-editable.
   - `is_required` (bool)
   - CRUD: add / edit / delete / assign-to-department.
   (Schema: extend the npd_dynamic_fields catalog — confirm/extend columns: department_id, field_type, auto_source_field_id, is_required, order. Migration = I apply.)

## P0-B — Dynamic FA/FG detail page (/fa/[code]) [Claude-UI + Codex loader]
1. Sections built **dynamically from the department field catalog** (P0-A) — not hard-coded.
2. **Reduce to ~3 sections**, push most fields into **core**; keep only the needed fields.
3. **Pre-fill from the Project** (Pack Size, Number of cases, etc. already entered in the project brief) — no double entry. If the FG was created here, its name = the **dev name**.
4. Project fields stay **static minimum**; FA/FG = dynamic extension. Company-name + full finished-goods process = **helper + extra validation** (optional path).
5. `auto` fields render read-only, value pulled from their source field.

## P0-C — FA → FG rename (user-facing) [Codex, quick]
- `/fa/[code]?tab=core`: label **"Fa" → "Fg"**, button **"Delete FA" → "Delete FG"**. User-facing labels only — do NOT rename the `public.product` table / route / architecture (still "FA" internally).

## P0-D — Code-format settings (FG / WIP / LP / RM) [Codex + Claude-UI + migration]
- New settings surface (under settings) to define the **code mask per entity**:
  - FG = `FGxxxx` → generates FG0001, FG0002…
  - WIP = `WIP-[DATE]-xxxx` → WIP-20260626-0001…
  - LP, RM similarly.
- Tokens: `xxxx` = zero-padded sequence; `[DATE]` = yyyymmdd; literals pass through.
- The code generators (FG candidate, LP, WIP, RM) read the org's mask. (Today FG auto-code = `FG-{PROJECT_CODE}` in gate-helpers.ts:531 — make it honor the mask.)

## Carried over from this session (still open) [queue after P0]
- **Recipe #4 — Unlock recipe with PIN** (riskiest: migration 343 = `npd.formulation.unlock` perm dual-store seed + modify trigger to allow locked→draft; unlockVersion action using signEvent PIN e-sign; Unlock button). I apply the migration.
- **Allergen cascade unification** — the cascade view `fa_allergen_cascade` derives from `product.ingredient_codes` + `Reference.Allergens_by_RM` + `Allergens_added_by_Process` (all empty for NPD FGs), NOT from `item_allergen_profiles` (where the owner sets allergens via Nutrition/Allergens tabs). FG-NPD-002 shows "No allergen data yet" for this reason. Fix = rewrite the cascade to derive from the recipe (formulation_ingredients) + item_allergen_profiles, OR populate ingredient_codes+Allergens_by_RM on recipe build. DESIGN decision needed.
- **FG "Create/Link FG"** wiring — `createOrMapFgCandidateAtG3` exists but unwired; add a project-level "Create / Link FG" panel (owner decided: both paths, default NPD, `FG-` prefix). Fixes "finished good not found".
- **Gate consolidation + evidence** — embed current-gate checklist into the stage screen (G0→Brief, owner decided); add per-item evidence: big paste field + optional attachment + tick (`gate_checklist_items.evidence_note` new col).
- **Dead-end HIGHs** — BOM co-products (no edit/delete), HACCP CCP (no per-row edit), Quality spec parameters (no per-row edit).
- **Pack weight** overview display (get-project.ts omits pack_weight_g; brief shows it).

## Open owner decisions (still pending)
- FG: auto-create FG on advance-to-packaging silently vs pause-to-confirm? Retroactively map an existing standalone FA to a project (map-mode UI)?
- Allergen cascade: rewrite to item_allergen_profiles+recipe (clean) vs bridge-populate the legacy reference tables?
- Code formats: confirm token grammar (`xxxx`, `[DATE]`, others like `[YY]`, `[SITE]`?).
- Bulk Excel import proposal (`_meta/plans/2026-06-26-bulk-excel-import-proposal.md`) — which targets/phase to build first.

## Migrations I (Claude) will apply (Codex never touches migrations)
- 342 ✅ applied: formulation_versions.processing_overhead_pct.
- 343 (pending): npd.formulation.unlock perm seed (dual-store) + trigger locked→draft allowance.
- 344+ (pending): npd_dynamic_fields catalog extension (department_id, field_type incl 'auto', auto_source_field_id, is_required, order); org code-format masks table.

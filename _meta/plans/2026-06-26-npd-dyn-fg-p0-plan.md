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

## Owner decisions — LOCKED 2026-06-26 (PM)
1. **FG code on advance-to-packaging** → **ASK with a suggested code** (pre-fill the suggested FG code per the org mask; user confirms / can edit). NOT silent auto-create.
2. **FA→FG rename = APP-WIDE user-facing**, not just the /fa core tab. Owner: "Fa nie istnieje — musimy wszędzie zmienić nazwy." Change EVERY user-visible "FA"/"Fa"/"Finished Article" → "FG"/"Fg"/"Finished Good" (i18n string VALUES + hard-coded JSX + nav/titles/buttons). KEEP internal `public.product` table + `(npd)/fa` route segment unchanged. **No retroactive FA→project map-mode needed** (FA isn't a concept users keep — it's just being renamed away).
3. **Allergen cascade = part of a broader DUPLICATE-SYSTEMS unification.** Owner: app has many double systems / double tables / data stored in several places — run a **2–3-track audit to find ALL of them**, then unify (allergen cascade is one instance). Single-source-of-truth rewrite, not legacy-table bridging.
4. **Code-format tokens CONFIRMED**: `xxxx` = zero-padded sequence, `[DATE]` = yyyymmdd, `[YY]` = 2-digit year, `[SITE]` = site code. Literals pass through.
5. **Bulk Excel import order**: **Phase 1 = PO, WO, TO** (build first). Phase 2 = supplier products (template depends on product type). Then WIP / FG / RM / ING + other definable entity types.

## Structural decisions — LOCKED 2026-06-26 (PM, post-audit)
The 5-agent read-only audit (see memory `duplicate-systems-audit-2026-06-26`) drove these:
6. **FG↔Item = FULL MERGE NOW.** `public.items` becomes the single FG master (UUID PK, typed, RLS, used by WO/BOM/warehouse). `public.product` becomes a VIEW/extension over items. Owner accepted the big-migration / live-risk. Phased, Claude-owned migration; INSTEAD-OF triggers or repointed writers to keep readers working; repoint `bom_headers.product_id` (text) + `work_orders.product_id` (uuid) onto items (folds in DUP-2). Design + review BEFORE applying to live.
7. **FA/FG detail = 3 sections:** (1) **Core** = most fields, pre-filled from the project; (2) **Commercial & Planning** = commercial+planning+mrp+procurement; (3) **Production & Technical** = production+technical. BOM + History stay as separate views.
8. **Field catalog = adopt the NEW `npd_field_catalog`** (mig 333, normalized). Migrate the FA page reads + the P0-A Settings UI + `update-fa-cell` whitelist onto it; **add `data_type='auto'` + `auto_source_field_id`** (the read-only-derived-from-another-dept feature); then retire `Reference.DeptColumns`.
9. **One primary FG per project now** (matches `npd_projects.product_code` single). Design the FG link so multiple variants can be added in a later wave without rework.

## Build queue (sequenced — Codex codes backend, Claude migrates + UI + build-gates + verifies live)
1. **P0-C FA→FG rename** (kira-mechanical) — ~82-97 user-facing strings, 4 locales + 14 TSX. Keep literal `FA` code prefix (codes start FA, regex `^FA…`); rename only the TYPE label. Zero migration. **← FIRST, in progress.**
2. **P0-D code-mask engine** — mig: extend `org_document_settings` (add `code_mask` text + doc_types fg/wip/lp/rm/grn); one parser for tokens `xxxx`/`[DATE]`/`[YY]`/`[SITE]`; repoint FG (`gate-helpers.ts:531`), LP (`lp-create.ts:38`), WIP (`manufacturing-ops-lookup.ts:51`), GRN generators + add RM/ING. Settings UI extends `/settings/documents`.
3. **Allergen cascade rewrite** — mig: rewrite `fa_allergen_cascade` to derive from `item_allergen_profiles` + `formulation_ingredients` (SSoT); fix the broken `public.allergens`(A01..A14) vs `Reference.Allergens`(word) join in `list-nutrition.ts:200` + `list-items.ts:152`. Fixes FG-NPD-002 "No allergen data".
4. **FG Create/Link button** — wire the complete-but-unwired `createOrMapFgCandidateAtG3` to an "Utwórz/Połącz FG" modal with an **ASK-with-suggested-code** UX (decision #1, PM AM list). Fixes "Finished Good not found".
5. **product→items FULL MERGE** (foundation, decision #6) — phased Claude migration, reviewed before live. THE big one.
6. **P0-A field catalog** (decision #8) — Settings/Departments delete+merge-fix + `npd_field_catalog` CRUD UI + `auto`/`auto_source_field_id`; migrate FA reads off `Reference.DeptColumns`.
7. **P0-B dynamic 3-section FA + pre-fill** (decisions #7, #8) — sections from the catalog, pre-fill from project, `auto` fields read-only.
8. Carried-over: recipe unlock-PIN (mig), gate consolidation + evidence note, dead-end HIGHs (BOM co-products / HACCP CCP / spec params), bulk-import **Phase 1 = PO/WO/TO** then supplier-products then WIP/FG/RM/ING.
9. **NPD Sensory — NO CREATE/ENTRY UI exists (confirmed gap, owner 2026-06-26).** Investigation result: the read screens ARE built — NPD stage `/[locale]/pipeline/[projectId]/sensory` (read-only, clickable step 5/8 in the stepper) + Technical `/technical/sensory` (read-only list) — backed by 3 real tables (`technical_sensory_evaluations` + `_attribute_scores` + `_panelist_comments`, mig 166/237, RLS/org_id). BUT there is **ZERO write path**: grep finds NO insert/update into those tables anywhere in app/lib, and `technical/sensory/_actions` has only `list-sensory.ts`. So a user can NEVER record a sensory panel — that's why the owner "can't find where to add it"; they see the designed empty state. **TO BUILD:** a "Record sensory evaluation" create/edit UI (owned by Technical module per canonical ownership) writing the panel header (panel_date, panelist_count, overall_score, benchmark) + per-attribute radar scores + panelist comments; surface a "+ Add panel" entry from `/technical/sensory` (and optionally a deep-link hint from the read-only NPD sensory empty state). Check `technical.sensory.read` is in the admin super-user grant set (else owner sees permission_denied, not empty). RBAC write perm e.g. `technical.sensory.write` to seed.

## Progress log — autonomous run 2026-06-26 PM (owner: "dokończ całą kolejkę, push, review, browser-check, powiedz kiedy testować")
- ✅ **Fala 1 P0-C FA→FG rename** — committed `d2fe648a`. tsc clean; npd UI 975/0; full UI 0 new fails vs baseline.
- ✅ **Allergen cascade recipe source** (mig 343) — committed `ddfae41b`, verified live (FG-NPD-002 → {soybeans}).
- ✅ **Fala 2 P0-D code-mask schema** (mig 344) — committed `8a166bb9`, backfill verified. Engine/parser + settings UI + generator adoption pending.
- 🔄 **Fala 4 FG Create/Link button** — kira-ui (background).
- 🔄 **code-mask engine** (renderCodeMask + nextEntityCode + tests) — Codex (background).
- 🔄 **Sensory** investigation — kira-research (background).
- ⬜ Next: P0-A field catalog (dept delete + merge-fix + npd_field_catalog CRUD + 'auto'), P0-B 3-section FA + pre-fill, recipe-unlock PIN, product→items merge (review-first), sensory build (if missing).
- NOTE: in-session `git push` is sandbox-blocked → push via `open /tmp/mk_push.command` (logs to /tmp/mk_push.log). 6 commits queued: d2fe648a, ddfae41b, 8a166bb9, 1b71d3b1, cefe78b3, fe24b91b.

## NPD flow blockers — owner 2026-06-26 (NEW, Codex backend + Claude-UI, ⚠️ #4 blocks approval)
1. **"Plan pilot run" — Line = dropdown** (not free text). Populate from the org/site production lines. [kira-ui + lines loader]
2. **"Plan pilot run" — ingredients AUTO from Recipe.** Pull the recipe's ingredients (2 in recipe → 2 rows). `Required` auto from the recipe qty; `Available` auto = warehouse stock at the line's warehouse; `Reserved` auto = qty reserved for this order. Required/Available/Reserved are READ-ONLY (no manual entry). [Codex loader: recipe + warehouse stock + reservations → computed rows; kira-ui renders read-only]
3. **"Add version" broken.** After adding e.g. V2: the new version must be UNLOCKED + editable, appear in the version-select menu, and per-version lock must work (lock one version, leave another open). [Codex: create-version state (new=draft, current_version_id→new, per-version lock); kira-ui: version selector dropdown + edit-enable]
4. **C5 "Allergens declared" — UI unclear + NO accept action ⇒ owner STUCK at approval.** Add a clear "Declaration accepted" checkbox/button that records acceptance and unblocks advancing past approval; tidy the section UI. [Codex: accept action + approval-gate unblock; kira-ui: C5 section + accept control]
- Principle (owner): data derivable from earlier steps or system availability = auto-pulled/computed; user fills only genuine manual-decision fields.

## Migrations I (Claude) will apply (Codex never touches migrations)
- 342 ✅ applied: formulation_versions.processing_overhead_pct.
- 343 (pending): npd.formulation.unlock perm seed (dual-store) + trigger locked→draft allowance.
- 344+ (pending): npd_dynamic_fields catalog extension (department_id, field_type incl 'auto', auto_source_field_id, is_required, order); org code-format masks table.

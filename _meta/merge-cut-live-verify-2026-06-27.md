# Merge-cut live verification — `public.product` is now a VIEW

**Date:** 2026-06-27
**Env:** https://monopilot-kira-git-main-codermariuszs-projects.vercel.app (Vercel preview / Supabase `khjvkhzwfzuwzrusgobp`)
**Login:** admin@monopilot.test (Apex org `00000000-0000-0000-0000-000000000002`)
**Subject FG:** FG-NPD-002 "cheleb 800g" · item_id `4f7eaedc-8a07-4c5b-840e-735f43bd8a54` · npd_project_id `5b802d87-eedf-479c-9e51-d26e886faab2`

**Structural confirm:** `public.product` relkind = `v` (view). Three INSTEAD-OF triggers present on the view: `product_instead_of_insert`, `product_instead_of_update`, `product_instead_of_delete`. View = `items ⨝ fg_npd_ext` (inner join — non-NPD FGs without a `fg_npd_ext` twin, e.g. FG-001, are correctly excluded from the view; 5 fg items → 4 view rows).

---

## READERS

### 1. Technical → Items list (`/en/technical/items`) — **PASS**
Loads. Shows all 11 items incl. the 5 finished goods FG-001, FG-NPD-002 (cheleb 800g), FG-NPD-007, FG-NPD-008, FG-NPD-009. No 500. Only console error site-wide is a harmless `sw.js` 404 (service worker), present on every page. Screenshot `mc-01-technical-items-list.png`.

### 2. NPD → FA grid for FG-NPD-002 (`/en/fa/FG-NPD-002`) — **PASS**
Dept-matrix grid loads with Core fields populated through the view: FG Code `FG-NPD-002`, Product Name `cheleb 800g`, Pack Size `100g`, Number of cases `8`. 7-department gate progress + V01–V08 validation + Key Facts all render. Screenshot `mc-02-fa-grid-fgnpd002.png`.

### 3. Technical item detail + BOM detail (read `product`) — **PASS**
- Item detail `/en/technical/items/FG-NPD-002`: all sections render (Overview, BOM, Allergens, Nutrition, Cost, Routing, …). Reads shelf life "30 d (use_by)", pack hierarchy (1 = 0.800 kg), variance tolerance 5, etc.
- BOM detail `/en/technical/bom/FG-NPD-002?v=1`: active v1, 4 components (RM-001, RM-002, BOX NA CHLEB, LAJBA CHLEB); "Origin: NPD project" link reads the product's npd_project_id. Screenshot `mc-03-bom-detail-fgnpd002.png`.

---

## WRITERS (through INSTEAD-OF triggers)

### 4. FA cell edit (update-fa-cell → INSTEAD-OF UPDATE) — **PASS** (DB-verified)
On FG-NPD-002 Core: set **Dev Code** = `DEVMC27` and **Comments** = `MERGE-CUT-VERIFY-2026-06-27`, clicked **Save Core**. UI showed status "Core section saved.", no error, no "cannot lock rows in a view".
DB-verify on `public.fg_npd_ext` (NPD overlay table, the column home for these fields):
```
comments = 'MERGE-CUT-VERIFY-2026-06-27', dev_code = 'DEVMC27', updated_at bumped 11:44:08
```
Values survived a full page reload (read back through the view). Screenshot `mc-04-fa-cell-edit-saved.png`.

### 5. Allergen recompute + accept/declaration (update_fa_allergen_set → INSTEAD-OF UPDATE) — **PASS** (DB-verified)
On `/en/allergen-cascade` (FG-NPD-002):
- **Refresh** (recompute) — no error.
- Toggled the **declaration-accepted** checkbox OFF → DB `allergens_declaration_accepted=false, accepted_at=null` (write through INSTEAD-OF). Then ON → DB `accepted=true, accepted_at=2026-06-27 11:46:04, accepted_by=admin`. State restored to original (accepted). No "cannot lock rows in a view". Screenshot `mc-05-allergen-cascade-accept.png`.

### 6. New NPD project → packaging-stage FG candidate (product INSERT → INSTEAD-OF INSERT) — **FAIL** ⛔
- NPD **create works**: wizard (Basics→Brief→Starting point→Review) created project **NPD-010** "MergeCut Verify Ham 300g" (id `d583da6c-…`). Stage advances work (G0→G2 via the advance-gate modal).
- At the FG-candidate step the app surfaces a **"Create / Link FG"** action. Clicking **Create FG** (proposed code FG-NPD-010) returns the UI error **"Could not create the Finished Good. Try again."** No `items`/`fg_npd_ext` row was created. Screenshot `mc-06-fg-candidate-create-FAIL.png`.

**Root cause (Postgres log + reproduced):** SQLSTATE **42P10 — "there is no unique or exclusion constraint matching the ON CONFLICT specification."**
The create-FG action issues `INSERT INTO public.product (...) ON CONFLICT (org_id, product_code) DO NOTHING`. `public.product` is now a VIEW; a view has no constraints, so `ON CONFLICT` is rejected *before* the INSTEAD-OF INSERT trigger ever runs. (NOT the "cannot lock rows in a view" signature — the triggers themselves are fine; it is specifically the upsert clause.)

Reproduced read-only (rolled back, no data change): `INSERT INTO public.product (...) ON CONFLICT (product_code) DO NOTHING` → `42P10`.

**Exact location:** `apps/web/app/(npd)/pipeline/_actions/_lib/gate-helpers.ts`, `createFgCandidate()`, lines **455–462**:
```sql
insert into public.product
  (org_id, product_code, product_name, created_by_user, app_version)
values (app.current_org_id(), $1, $2, $3::uuid, $4)
on conflict (org_id, product_code) do nothing   -- ← line 460, breaks on the view
returning product_code
```
**Fix:** remove the `on conflict (...) do nothing` line. It is redundant: the function already pre-checks existence with a `select … from public.product where … product_code = $1` (lines 444–452), and the underlying `items` unique constraint still protects against a true race. A plain `INSERT … RETURNING product_code` routes correctly through the INSTEAD-OF insert trigger.

---

## Cleanup
Test project NPD-010 deleted via UI (DB-confirmed gone). FG-NPD-002 allergen declaration restored to accepted. Counts back to baseline (5 fg items / 4 fg_ext / 4 view rows). The Dev Code/Comments test markers left on FG-NPD-002 (harmless; they are the persistence evidence for check 4).

## Verdict
The merge cut **holds for every reader and for plain UPDATE writers** (FA cell edit + allergen accept both DB-verified through the INSTEAD-OF triggers). **One writer is broken:** the create-FG-candidate path (`gate-helpers.ts` `createFgCandidate`) because it `INSERT … ON CONFLICT` against the view (42P10). This blocks creating a brand-new FG from an NPD project. Single-line fix identified.

---

# RE-VERIFY (post writer-fix) — 2026-06-27 12:00–12:25 UTC

**Deploy under test:** commit `44356dab` "fix(merge): product writers no longer use ON CONFLICT on the view (42P10)" — Vercel deployment `dpl_4edNbBLC2KQ…` **READY / production**, branch alias `monopilot-kira-git-main-…`. The fix is LIVE.
**Code confirm:** all 4 product writers now do **pre-check (`select … from public.product`) + insert-if-absent** (or targeted view-UPDATE), with **no `ON CONFLICT` on the view**. Source sweep: zero remaining `INSERT INTO public.product … ON CONFLICT` in non-test writers. (`create-fa.ts` line 116 `ON CONFLICT` is on `public.outbox_events` (real table, real `dedup_key` constraint) — correct, not the view.)
**Login:** existing admin session (admin@monopilot.test, Apex org). DB baseline at start: `product` relkind = `v`; 5 fg items / 4 fg_ext / 4 view rows.

## The 4 writers

### 1. create-FG-candidate (PRIMARY) — **PASS** ✅ (DB-verified)
Created a brand-new NPD project **NPD-011** "MC2 Verify Pack Ham 250g" (id `8af51400-…`) via the wizard. Advanced G0→G2 (notes modal). At recipe stage the gate hard-blocks on "≥1 ingredient" (real business rule, not the writer) → created a v1 draft, added RM-001 (MAKA SUPER) 0.25 kg @ €3.50, **Save draft → Saved**. Then **Advance stage → "Advance to G3: Development · Packaging"**.
**Result:** advanced cleanly to **"Packaging · G3 Development"** — **NO "Could not create the Finished Good" error** (zero visible elements render that string; the substring only exists in the inlined client error-dictionary). `createFgCandidate` (a product INSERT through the view) ran successfully.
**DB-verify** (`FG-NPD-011`): `items` row (type=fg, name="MC2 Verify Pack Ham 250g", status=active) ✓ · `fg_npd_ext` twin = 1 ✓ · `product_legacy` = 1 ✓ · `product` view row = 1 (name matches) ✓ · `npd_projects.product_code = 'FG-NPD-011'` ✓. New FG also appears in `/fa` list (4→5 rows). Screenshot `mc2-01-fg-candidate-packaging-PASS.png`.

### 2. create-FA — **PASS** ✅ (DB-verified) + duplicate-reject **PASS**
`/fa` → **+ Create FG**. (Note: the create dialog enforces the FA-prefix code mask — a hyphenated code like `FG-…` is rejected by V01 validation, unrelated to the writer.) Created **FA5699** "MC2 Brand New FA" → redirected to `/fa/FA5699` (created).
**DB-verify** (`FA5699`): `items` (fg, active) ✓ · `fg_npd_ext` = 1 ✓ · `product_legacy` = 1 ✓ · `product` view = 1 ✓. Screenshot `mc2-02-create-fa-FA5699-PASS.png`.
**Bonus — duplicate (23505 contract preserved):** re-opened the dialog, entered the **existing** code `FA5699` again → submit **REJECTED**: dialog stayed open (no navigation to a new detail page), surfaced an error, and **did NOT overwrite**. DB-verify: still exactly 1 `FA5699` row, name unchanged ("MC2 Brand New FA", NOT "MC2 Dup Attempt"). The pre-check re-raises `code='23505'` so `isUniqueViolation()` still fires. (UI maps it to the generic "Could not create the Finished Good. Try again." rather than a friendly "already exists" — cosmetic only; rejection itself is correct.) Screenshot `mc2-02b-create-fa-duplicate-rejected-PASS.png`.

### 3. create BOM draft — **PASS** ✅ (DB-verified)
Technical → BOMs & recipes → **+ New BOM** → selected **FG-NPD-011** → Continue → BOM editor (status "Not started"). Added first component RM-001 (MAKA SUPER), qty 0.1, scrap 1.0, manufacturing op = Mixing → **Add component**. Draft created cleanly (status flips to **Draft**), **no 42P10 / no error**. The fixed writer's `ensureProductRow` pre-check found the existing product row and correctly skipped the insert (no overwrite of `fg_npd_ext`).
**DB-verify**: `bom_headers` row `6f41b95e-…` status=draft, v1, 1 line, product view row present (=1). Screenshot `mc2-03-bom-draft-fgnpd011-PASS.png`.

### 4. NPD promote / materialize — **PASS** ✅ (DB-verified)
Drove **NPD-007** (R2 Premium Sausage 500g, at G4/handoff) through promote: ticked all 6 handoff-checklist items → status "Ready to promote. All gates pass." → **✓ Promote to production BOM** → **"Promoted. … released to the factory."** **No 42P10 / no error.** This exercises `materialize-npd-bom`'s **UPDATE-if-present** branch (the path that previously used `ON CONFLICT DO UPDATE`) through the view.
**DB-verify** (`FG-NPD-007`): active BOM remains = 1 ✓ · product view row intact · `product_name` preserved ("R2 Premium Sausage 500g", NOT overwritten with sparse NEW values) · `done_mrp=true`, `closed_mrp='Yes'` (closeout cols set via the targeted INSTEAD-OF UPDATE) ✓. Screenshot `mc2-04-npd-promote-materialize-PASS.png`.
**F-1 e-sign note:** NPD-007 had already crossed G3→G4 and approval→handoff in an earlier run, so those e-sign gates were already satisfied; promote-from-handoff itself did not re-prompt. The new G3/G4 e-sign requirement was therefore not re-exercised in this run (it gates the gate-crossings, which had already passed), but the **materialize writer — the 4th fixed writer — is confirmed working** through the view.

## Regression re-check

### 5. FA cell edit (FG-NPD-002) — **PASS** ✅ (DB-verified)
`/fa/FG-NPD-002` Core → set **Comments = `MC2-REVERIFY-2026-06-27`** → **Save Core** → "Core section saved." (no view-lock error). DB-verify `fg_npd_ext`: `comments='MC2-REVERIFY-2026-06-27'`, `updated_at` bumped to 12:18:59. INSTEAD-OF UPDATE still works. Screenshot `mc2-05-fa-cell-edit-PASS.png`.

### 6. Allergen accept / recompute (FG-NPD-002) — **PASS** ✅ (DB-verified)
`/en/allergen-cascade?fg=FG-NPD-002`: **↻ Refresh** (recompute) — no visible error. Toggled **declaration-accepted** OFF → DB `accepted=false, accepted_at=null`; ON → DB `accepted=true, accepted_at=2026-06-27 12:20:43, accepted_by` set. State restored to original (accepted). All through the INSTEAD-OF UPDATE. Screenshot `mc2-06-allergen-accept-recompute-PASS.png`.

## Final DB state / no-drop check
7 fg items / 6 fg_ext / 6 view rows / 6 product_legacy — internally consistent. Only `FG-001` (the one non-NPD FG with no `fg_npd_ext` twin) is excluded from the inner-join view — exactly the documented/expected behavior; **no product was incorrectly dropped**. The 2 newly-created FGs (FA5699, FG-NPD-011) both have full twins and appear in the view.

## Re-verify cleanup
Left as evidence (harmless test data on the test env): NPD-011/FG-NPD-011 (+ its draft BOM), FA5699, and the FG-NPD-002 Comments marker. FG-NPD-002 allergen declaration restored to **accepted** (original state). NPD-007 promoted (was already at G4 with an active BOM; re-promote is idempotent on the BOM side).

## RE-VERIFY verdict
**All 4 product writers are FIXED and confirmed working live**, each DB-verified (items + fg_npd_ext + product_legacy + view row created/updated correctly through the INSTEAD-OF triggers, no 42P10, no "Could not create the Finished Good"):
1. create-FG-candidate ✅ (the prior FAIL — now PASS, PRIMARY)
2. create-FA ✅ + 23505 duplicate-reject preserved ✅
3. create-BOM-draft ✅
4. NPD promote/materialize ✅

Both regression writers (FA cell edit, allergen accept/recompute) still PASS. **The merge cut (`public.product` as a view over `items ⨝ fg_npd_ext`) is now fully functional end-to-end** for every reader and every writer tested. No remaining 42P10 break. Only cosmetic note: the create-FA UI maps a duplicate 23505 to a generic "Try again" message instead of a friendly "already exists" — functionality (rejection, no overwrite) is correct.

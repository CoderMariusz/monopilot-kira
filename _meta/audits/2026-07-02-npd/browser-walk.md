# NPD Module — End-to-End Browser Walk (production)

- Target: https://monopilot-kira.vercel.app  (deploy 95e156d8)
- Org: **Apex 22** (A2), site **warehouse 1** (real site selected in top bar)
- Login: admin@monopilot.test (Apex Admin, platform admin)
- UI locale: Polish. NPD nav item routes to `/pl/pipeline`.
- Date of walk: 2026-07-02
- E2E project created: **E2E-NPD-WALK1** = NPD-017, id `c43e27c2-1d61-4679-9f3c-5d2193805cd5`
- Existing projects (DO NOT TOUCH): "Smoked Kabanosy 250g" NPD-015 (Packaging stage), "fwef" NPD-014 (Approval, 60%)

## Pipeline stage model (kanban columns)
Brief → Receptura(Recipe) → Opakowanie(Packaging) → Próba(Trial) → Ocena sensoryczna(Sensory) → Pilotaż(Pilot) → Zatwierdzenie(Approval) → Przekazanie(Handover) → Wdrożone(Launched)

## Project detail stage navigator (8 tabs)
1 Brief · 2 Receptura · 3 Opakowanie · 4 Próba · 5 Sensoryka · 6 Pilotaż · 7 Zatwierdzenie · 8 Przekazanie
(+ separate "Lista kontrolna bramy" / Gate checklist link)

---

# PART A — THE BREAK MAP (stage by stage)

## Create wizard (4 steps) — WORKS
Podstawy(Basics: name*, category*, launch date, pack format, channel, pack weight, units/bundle)
→ Brief(flat: target price GBP, target group, marketing claims, constraints, notes — ALL optional)
→ Punkt wyjścia(starting point: Empty recipe [default] / Clone existing / Category template[DISABLED "not yet available"])
→ Podsumowanie(review) → "Utwórz projekt i otwórz recepturę".
RESULT: project created OK → NPD-017. NOTE: button says "open recipe" but lands on **/brief**, not the recipe.

## STAGE 1 — Brief  [status shown ✓ Ukończono / Completed on create]
Single flat card "Brief projektu" + "Załączniki"(Attachments) card.
Fields: product name, category, launch date, price GBP, pack format, pack weight(g), units/bundle, channel, expected volume, target group, marketing claims, constraints, notes.
NO per-department module/section split. NO custom-field rendering. (see PART C)

## STAGE 2 — Receptura (Recipe / formulation)
- On open: EMPTY. Wizard summary promised "wygenerowany pierwszy szkic receptury" and the create button said "…i otwórz recepturę", but NO draft was auto-created. Empty state "Brak wersji roboczej receptury" + a "Utwórz wersję roboczą" button. **BREAK #1 (MED): wizard promise vs reality — no auto-generated recipe draft; user lands on Brief, not recipe; must manually create draft.**
- Created draft v1 manually → full recipe editor: ingredients table, live nutrition (per 100g, 7 nutrients w/ targets), live cost/margin, 14-EU-allergen panel. Item picker WORKS (found RM-PORK-01 "Pork shoulder", pulled £5.2/kg from its supplier spec).
- Set batch size 250 g + ingredient 0.25 kg → sum 0.250 kg = pack weight, 100% composition, cost £5.20/kg, nutrition "W normie", no validation errors.
- **BREAK #2 (HIGH — the wall): "Zgłoś do próby →" (Submit-to-trial) button is permanently DISABLED even after a fully valid + LOCKED recipe.** Locked v1 via "Zablokuj recepturę" (froze the version) → button STILL disabled. DOM: `<button disabled data-status="idle">`, NO title / aria-disabled / tooltip — zero feedback on what's missing. The intended stage-native advance path is a dead-end. (There's a separate header "Następny etap →" that may bypass it — tested next.)
- Minor: the row "Udział" (share) column shows "—" while the composition donut correctly shows 100%.

## KEY ARCHITECTURE FINDING — two disconnected progression systems
The pipeline advances via the HEADER **"Następny etap →"** button → a **Gate advance modal** (G0→G2→…), NOT via the per-stage tab buttons.
- The per-stage "submit" buttons (e.g. Recipe's "Zgłoś do próby →") are effectively **dead/vestigial** — permanently disabled with no feedback, and NOT the real advance path.
- The gate checklist items are GENERIC per-gate (G0 = "Market opportunity identified", "Product concept documented", "Initial feasibility check") and do **NOT** reference the actual work done in the stage tabs. Locking a valid recipe ticks **zero** gate items.
- Gates are SOFT: "X wymaganych pozycji nieukończonych — możesz mimo to kontynuować" (can continue anyway) with 0/3 required done. A gate-note is required (audit trail).
- Gate G1 is folded into Brief (tooltip); advancing Brief goes straight G0→G2.
- After advancing to **G2 (Receptura · Uzasadnienie biznesowe)** a new header button appears: **"Utwórz / powiąż wyrób"** (Create/link finished good = FG).
=> This split (tab-track vs gate-track, neither referencing the other) is the core of the owner's "doesn't hold together logically".

## STAGE 3 — Opakowanie (Packaging) — G3 Rozwój
- Advancing to G2 AUTO-CREATED/LINKED a finished good: header now links to **/pl/fg/FG0004** (FG created without extra prompt — good).
- Packaging tab = hardcoded spec form: "Opakowanie podstawowe" (primary), "Opakowanie zbiorcze" (case), "Grafika" (artwork). Columns hardcoded: Element, Materiał, Dostawca, Specyfikacja, Koszt/szt., Status, Akcje. Empty; "+ Dodaj element" to add.
- **NO custom-field rendering here either** — pure hardcoded. (Target of PART B1 packaging experiment.)
- A "Related" nav exposes a /nutrition sub-page.

## GATE MODEL observed (inconsistent):
- G0 (Idea): 3 generic MANUAL required items (Market opportunity / Product concept / Feasibility) — none auto-derived, none reference stage work. Soft-overridable.
- G2 (Business case · Recipe): 1 AUTO-derived item "Receptura zawiera ≥1 składnik" = auto-100%. => gates are INCONSISTENT: some manual-generic, some auto-derived.
- Advance path: G0→G2→G3→… (each needs a required audit note).

## STAGE 4 gate (G3 "Rozwój") — MAJOR DISCONNECT
Advancing from Packaging opens a G3→G3 gate (stage Packaging→Trial, gate stays G3) with **10 required checklist items, ALL 0% / all ✗** — including items the system PROVABLY already satisfied:
- "Formulation created and locked" ✗  — but recipe v1 IS locked.
- "FG candidate created or mapped in system" ✗ — but FG0004 WAS auto-created.
- "Recipe costing computed" ✗ — cost £5.20/kg WAS computed live.
- "Nutrition declaration calculated" ✗ — nutrition panel WAS calculated.
- "Allergen declaration validated" ✗ — 14-allergen panel WAS shown.
- Plus manual-only: Label copy approved by QA / Sensory evaluation passed / Retailer spec confirmed / Lab trial batches executed / No blocking risk docs.
=> **The gate checklist does NOT auto-derive from completed work** (except the single G2 item). Even unambiguous system facts (locked formulation, created FG, computed cost/nutrition/allergens) show as un-done. This is a core "doesn't hold together logically" defect: the checklist is a disconnected set of manual checkboxes with no wiring to the stage tabs' actual state. Screenshot: e2e-npd-3.png.
- Still soft-overridable ("możesz mimo to kontynuować").

## STAGES 4-6 (Trial / Sensory / Pilot) — thin, hardcoded, advance OK
- Próba (Trial): "Próby laboratoryjne i kuchenne" table (Nr/Data/Partia/Wydajność/Technolog/Wynik/Uwagi/Akcje) + "+ Dodaj próbę". Empty, hardcoded.
- Sensoryka (Sensory): advanced through, thin.
- Pilotaż (Pilot): "Produkcja pilotażowa" + "+ Zaplanuj próbę pilotażową", empty state. Hardcoded.
- Gates G3 span Packaging→Trial→Sensory→Pilot (same 10-item checklist reused, always 0%, always override). All advanced fine with an audit note.

## STAGE 7 gate (G3→G4, Pilot→Approval) — HARD BLOCK, SILENT FAILURE
- **BREAK #3 (HIGH): advancing Pilot→Approval (G4) is blocked server-side by a required e-signature, but the modal fails SILENTLY.** The advance server action POSTs and returns `{"ok":false,"error":"ESIGN_REQUIRED","status":403}` (confirmed in network response body) — but the modal shows NO error, doesn't close, just no-ops. User clicks "Przejdź do G4" and nothing visible happens.
- Only hint: a small inline alert "Przed handoffem wymagany jest e-podpis bramki G4 — zatwierdź ją na etapie Approval." But you are STUCK on Pilot (stage badge stays "Pilotaż · G3"); the Approval stage tab is where the e-sign must be done — investigated next.

## STAGE 7 — Zatwierdzenie (Approval) — a THIRD, separate gate system
The Approval tab has "Bramki zatwierdzania" — 7 criteria C1–C7, DISTINCT from both the stage tabs and the gate-modal G-checklist:
- C1 Receptura zablokowana → ✓ PASSED (correctly auto-derived from the locked recipe!)
- C2 Cele żywieniowe spełnione (NutriScore A–C) → ○ pending → "Napraw →" = **/pipeline/…/nutrition**
- C3 Koszt w granicach celu (margin) → ○ pending → "Napraw →" = **/pipeline/…/costing**
- C4 Sensoryka ≥ 7.0 → – Niewymagane
- C5 Alergeny zadeklarowane → ○ pending → "Napraw →" = **/fg/FG0004/allergens** (FG module!)
- C6 Brak otwartych wysokich ryzyk → ✓ PASSED
- C7 Dokumenty zgodności → ○ pending → "Napraw →" = **/fg/FG0004/docs** (FG module!)
- 2 passed / 4 pending. "Wyślij do zatwierdzenia" (Submit for approval) DISABLED: "Wszystkie kryteria muszą być spełnione przed wysłaniem" — this gate is HARD (NOT overridable, unlike the pipeline gate modal).

## THREE-WAY INCONSISTENCY (root of "doesn't hold together"):
1. **Stage tabs** (Brief/Receptura/Opakowanie/Próba/Sensoryka/Pilotaż/Zatwierdzenie/Przekazanie) each with their own (often dead) submit buttons.
2. **Gate-modal checklist** (G0/G2/G3/G4) — generic manual items, mostly 0%, SOFT-overridable, DON'T auto-derive from real work.
3. **Approval C1–C7 criteria** — a third set, some auto-derived (C1/C6), HARD gate, and they point to **hidden sub-routes** (/nutrition, /costing — NOT in the 8-tab nav) and to the **separate FG module** (/fg/FG0004/allergens, /fg/FG0004/docs).
None of the three lists agree on what "done" means, and criteria reference screens the stage navigator never exposes. Screenshot: e2e-npd-4.png.
- Also: C-criteria reference NutriScore + Costing scenarios + compliance docs that require going into the FG module, i.e. the NPD project and its FG are two loosely-coupled halves.

## Sub-routes verified
- /pipeline/…/nutrition = "Deklaracja wartości odżywczych (na 100 g)". Initially shows "Brak danych odżywczych — obliczane po ukończeniu receptury" (misleading, since recipe IS locked). "Oblicz NutriScore" button WORKS → produced **Nutri-Score A** (should satisfy C2). Minor: misleading empty-state text pre-compute.
- /pipeline/…/costing (C3), /fg/FG0004/allergens (C5), /fg/FG0004/docs (C7) — referenced by approval criteria; C5/C7 live in the FG module, not the pipeline.

## STAGE 8 — Przekazanie (Handoff) = "Przekazanie do BOM produkcyjnego"
- Empty state: "Brak listy kontrolnej przekazania — tworzona gdy projekt osiągnie etap przekazania." Handover→production BOM is the final step, gated behind full Approval.

# ===== PART A BREAK-MAP SUMMARY (create → handover) =====
1. Create wizard: OK.
2. Brief: OK (flat form; no dept modules; no custom fields — see C).
3. Receptura: draft NOT auto-created despite wizard promise [BREAK #1 MED]; editor + item picker WORK; **stage-native "Zgłoś do próby" submit button PERMANENTLY DISABLED even with a valid+locked recipe, no feedback [BREAK #2 HIGH]**. Real advance is via header gate-modal instead.
4. Advance mechanism = header "Następny etap →" → GATE MODAL (G0→G2→G3→G4). Soft/overridable for G0-G3 with a required audit note. Gate checklist items DON'T auto-derive from real work (locked recipe / created FG / computed cost+nutrition+allergens all show ✗ at G3) [BREAK — disconnect].
5. Packaging/Trial/Sensory/Pilot: thin hardcoded tabs, advance OK.
6. **Pilot→Approval (G4): advance modal returns ESIGN_REQUIRED 403 and FAILS SILENTLY — no error surfaced, modal just no-ops [BREAK #3 HIGH].**
7. Approval: a THIRD gate system (C1–C7), HARD (non-overridable), criteria point to hidden sub-routes (/nutrition, /costing) + the FG module (/fg/…/allergens, /fg/…/docs) that the 8-tab nav never exposes [BREAK — discoverability].
8. Handoff→production BOM: only reachable after full Approval submit+sign.

NET: the pipeline CANNOT be walked cleanly create→handover using the on-screen stage controls. It only advances via the header gate modal, which (a) has dead per-stage submit buttons beside it, (b) shows checklists disconnected from actual completion, and (c) hits a silent ESIGN wall at G4. Three non-agreeing checklist systems + off-nav referenced screens = the "doesn't hold together logically" the owner reports.

# ===== PART B — Settings ↔ NPD consistency =====
Settings page: /pl/settings/npd-fields ("Pola NPD" — "Zarządzaj polami działów w procesie NPD"). Screenshot e2e-npd-5.png.
- Two builders: "+ Nowy dział" (new department), "+ Nowe pole" (new field).
- Fields are grouped BY DEPARTMENT (Core/Planning/Commercial/Production/Technical/MRP/Procurement), and EACH assigned field ALSO has an "Etap" (stage) column whose dropdown = the exact 8 pipeline stages (Opis wstępny/Brief, Receptura, Opakowanie, Próba, Sensoryka, Pilotaż, Zatwierdzenie, Przekazanie).
- Existing Core fields: Product Code / Product Name / Pack Size — all Etap="Opis wstępny" (Brief), Widoczne=checked, some Wymagane.

## B4 — catalog entries that render NOWHERE (owner claim confirmed at a glance)
The Brief screen (walked in Part A) is HARDCODED (Product name, Category, Launch date, Price, Pack format, Pack weight, Channel, Volume, Target group, Claims, Constraints, Notes). It does NOT read the field catalog. So the catalog's Core fields "Product Code" and "Pack Size" (both Etap=Brief, Visible) have NO corresponding input on the actual Brief screen — they render nowhere. The Brief happens to have a "Product name" that overlaps by name with catalog "Product Name", but it's hardcoded, not catalog-driven. => existing catalog↔screen mismatch confirmed before even adding a custom field.

## B1 — add custom field to BRIEF stage → does it show? — CLAIM CONFIRMED (does NOT show)
- Created catalog field "E2E-NPD-FIELD1" (code e2e_npd_field1, type text) via "+ Nowe pole", dept=Core.
- Note: after create the Core table did NOT reactively refresh — field only appeared after a page reload (minor bug).
- The field auto-assigned: Dział=Core, **Etap="Opis wstępny" (Brief)**, Widoczne=✓ (visible), Wymagane=✗.
- Opened the E2E project Brief (/pipeline/…/brief): **E2E-NPD-FIELD1 does NOT appear.** Brief renders ONLY its hardcoded fields (Nazwa produktu, Kategoria, data, cena, Format opakowania, Masa, Sztuk w zbiorczym, Kanał, Wolumen, Grupa docelowa, Deklaracje, Ograniczenia, Notatki).
- => The pipeline stage screens are HARDCODED and completely IGNORE the field catalog's stage ("Etap") assignment. A visible field mapped to a stage never renders on that stage. Owner's B1 claim is TRUE. Screenshot: e2e-npd-6.png.
- (Packaging/Trial would behave identically — those tabs are equally hardcoded per Part A; the catalog is not read by ANY stage screen.)

## B2 — edit + delete a field-catalog entry — CLAIM DISPROVEN (both work)
- EDIT: "Edytuj E2E-NPD-FIELD1" opens "Edytuj pole NPD" dialog with editable Label / Data type / Help text / "Auto-calculated" toggle + Zapisz. (Code field is intentionally locked — immutable identifier.) EDIT WORKS. (Cancelled without saving.)
- DELETE: two-step by design —
  1. Row "Usuń" in the dept fields table = UNASSIGN from that department.
  2. Catalog-level "Usuń z katalogu" (btn-danger) = permanent delete, but is DISABLED until the field is removed from ALL departments (title tooltip: "Najpierw usuń to pole ze wszystkich działów").
  After unassigning from Core, "Usuń z katalogu" enabled → native confirm ("Trwale usunąć… nie można cofnąć") → accepted → field GONE after reload. DELETE WORKS.
- => Owner's "can't delete/change catalog entries" is FALSE. Likely root of the confusion: the catalog-delete button is disabled (greyed) with only a HOVER tooltip explaining you must first unassign from every department — a discoverability trap, not an actual inability.
- Minor bug (recurs): create AND delete do NOT reactively refresh the table — you must reload the page to see the change.
- CLEANUP: E2E-NPD-FIELD1 was deleted (used as the delete test) — no residual E2E field remains.

## B3 — disable a department → does FG dashboard still show it? — CLAIM CONFIRMED (shows all)
BASELINE (before disabling anything): only Core + Production are ACTIVE; Planning/Commercial/Technical/MRP/Procurement are INACTIVE. Yet the FG dashboard (/pl/npd "Pulpit NPD") already shows ALL 7:
- Subtitle hardcoded "Przegląd potoku w 7 działach".
- "Postęp działów" table = "7 działów", lists every dept incl. INACTIVE MRP.
- "Alerty startu" → "Brakujące dane" column enumerates missing fields for EVERY dept — Core, Planning, Commercial, Production, MRP, Tech, Procurement — for each FG (incl. my FG0004 E2E-NPD-WALK1). Inactive depts (Planning/Commercial/MRP/Tech/Procurement) are counted as BLOCKING with missing fields.
=> The FG dashboard ignores the department active/inactive flag entirely; it's hardcoded to all 7 departments. Owner's B3 claim TRUE. Screenshot: e2e-npd-7.png. Now doing the explicit disable-Production test to confirm.

### B3 explicit disable test result
- Disabled "Production" dept in /settings/npd-fields (toggle → "✕ Nieaktywny", persisted after reload).
- Re-checked FG dashboard /pl/npd: STILL "Przegląd potoku w 7 działach"; "Production:" still listed in the "Brakujące dane" missing-data column for FGs.
=> Disabling a department has ZERO effect on the FG dashboard. The dashboard is hardcoded to all 7 departments and ignores the active flag. Owner's B3 claim DEFINITIVELY TRUE.
- CLEANUP: Production re-enabled (see cleanup log).

# ===== CLEANUP LOG =====
- Departments: Production was disabled for the B3 test → RE-ENABLED. Verified persisted state matches original baseline: Core=Active, Production=Active, Planning/Commercial/Technical/MRP/Procurement=Inactive. ✓ restored.
- Field catalog: E2E-NPD-FIELD1 was created then DELETED (used as the B2 delete test). No residual E2E field. ✓
- Owner's existing projects (Smoked Kabanosy 250g NPD-015, fwef NPD-014) and existing fields: UNTOUCHED. ✓
- Left behind (prefixed, harmless test data): NPD project **E2E-NPD-WALK1 (NPD-017)** + its auto-created FG **FG0004** + locked recipe v1. All prefixed "E2E-NPD-". Not deleted (needed as walk evidence); safe to remove.

# ===== PART C — Brief structure, FG dashboard source, broken FG screen =====

## C1 — What the BRIEF screen actually contains
The Brief is a SINGLE FLAT card "Brief projektu" + an "Załączniki" (Attachments) card. Hardcoded fields only:
Nazwa produktu, Kategoria, Docelowa data wprowadzenia, Docelowa cena detaliczna (GBP), Format opakowania, Masa opakowania (g), Sztuk w zbiorczym, Kanał sprzedaży, Oczekiwany wolumen, Grupa docelowa, Deklaracje marketingowe, Ograniczenia i wymagania, Notatki.
- **NO per-department module/section split.** There is no "Core section / Commercial section / Technical section" — just one flat form. The department concept from Settings/npd-fields is NOT reflected on the Brief (or any pipeline stage) at all.

## C2 — What the FG dashboard shows + its source
FG dashboard = /pl/npd "Pulpit NPD":
- "Postęp działów" (Department progress) table across ALL 7 departments (hardcoded — see B3, ignores active flags).
- "Alerty startu" (Launch alerts) table: per-FG readiness, "Brakujące dane" (missing data) column enumerating missing catalog fields grouped by all 7 departments.
- Source = the FG rows + the (all-departments) field catalog. It reports every FG (FG-KAB-01, FG0002, FG0003, FG0004 incl. my E2E one) as "● Czerwony" (Red / blocked) with big missing-field lists — because the pipeline stage screens never let you fill the department/catalog fields (they're hardcoded and ignore the catalog, per B1). So the dashboard permanently shows every FG as blocked on fields the UI gives no way to enter. This closes the loop of "doesn't hold together": catalog defines dept fields → dashboard demands them → but NO screen renders them for input.

## C3 — the broken "finished good" screen — CONFIRMED BROKEN (general)
- Opening ANY FG detail /pl/fg/<code> renders the main content pane as ONLY an error alert: **"Nie można wczytać tego wyrobu gotowego."** (Cannot load this finished good.) The main data/edit pane never loads; only the right sidebar (Kluczowe dane, Status walidacji V01–V08, Status budowy, Szybkie akcje) renders.
- Reproduced on my fresh **FG0004** AND on the owner's existing **FG0002 (Smoked Kabanosy 250g)** → it's a GENERAL FG-detail break, not data-specific.
- The FG LIST (/pl/fg) works fine (lists FG-KAB-01, FG0002, FG0003, FG0004). Only the DETAIL page fails.
- Root cause: server-side render error in the FG detail data loader (Next RSC; production omits the message → shows the boundary fallback). Screenshot: e2e-npd-8.png.
- Side effect: because the FG detail won't load, the approval criteria C5 (allergens) and C7 (docs) — whose "Napraw →" links point INTO the FG module (/fg/FG0004/allergens, /fg/FG0004/docs) — are likely unreachable/broken too, compounding the approval dead-end from Part A.

- Precision on scope: the FG **index/detail landing** page /pl/fg/<code> is the broken one (main pane = load error). The FG **sub-routes** load fine: /fg/FG0004/allergens ("Kaskada alergenów") renders OK. So approval C5 (allergens) IS reachable via its Napraw link even though the FG landing is broken; the break is isolated to the FG detail main loader. (Didn't separately test /fg/…/docs.)

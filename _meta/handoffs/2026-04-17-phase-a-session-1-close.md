# HANDOFF — Phase A Session 1 close → Session 2 bootstrap

**From session:** 2026-04-17 Phase A Session 1 (PLD v7 reality capture — PROCESS-OVERVIEW + DEPARTMENTS)
**To session:** Phase A Session 2 (MAIN-TABLE-SCHEMA + CASCADING-RULES + WORKFLOW-RULES) albo Session B NPD propagation (decyzja user)
**Phase:** A of (0 → A → D → B → C), session 1/3

---

## Co zrobione (Session 1 — complete)

**Reality capture — 2 docs (capture-only, no propagation):**

- `_meta/reality-sources/pld-v7-excel/PROCESS-OVERVIEW.md` — 313 linii (post-fixes). End-to-end flow Brief → PLD → D365, z Mermaid sequence, 11 sekcji (Purpose / Context / Upstream-Brief / End-to-end / Stages 0-6 / Owner map / Timeline / Evolving / Monopilot trajectory / Docs inconsistencies / HANDOFF / Related)
- `_meta/reality-sources/pld-v7-excel/DEPARTMENTS.md` — 265 linii (post-fixes). 7 działów Forza + role + kolumny owned + handoffs Mermaid + marker recap + role mapping fix (Development=Core, Quality=Technical, no MRP split)

**Reality discovery (pierwsze konkretne ustalenia z v7 reality + user interview):**

- Workbook ma **22 zakładki** (memory mówiło 21) — Main Table **69 kolumn** (memory "60-80")
- **7 dział tabs są działami** (nie "grupami kolumn") — Core / Planning / Commercial / Production / Technical / MRP / Procurement
- **Jane = NPD Manager (orchestrator)** — wyłączny operator D365 Builder, daily dashboard review, nadzór całego procesu
- **Core = NPD team (3 osoby)** — wspólna sekcja master data, nie osobny "dział"
- **Technical = Quality w rzeczywistości** — dziś tylko Shelf_Life, dochodzi Allergens cascade RM→FA `[EVOLVING]`
- **MRP NIE splituje się** na 2 działy (wcześniejsze założenie wycofane — memory update required)
- **Procurement ma punktową zależność, nie pełny wait** — `Supplier/Lead_Time/Proc_Shelf_Life` startują po Closed_Core równolegle, tylko `Price` czeka na Production+MRP components
- **Dashboard access szeroki** — read dla wszystkich dept managers, write/D365-Builder tylko Jane
- **24-week rule** — brief handoff do PLD min 24 tyg przed launch
- **PR_Code_Final format** — `PR<digits><process_letter>` (np. `PR123R`), **NIE** concat P1-P4 suffixów

**Upstream reality source discovered (nowe):**

- `brief 1.xlsx` + `brief 2.xlsx` + `brief 3.xlsx` (dodany ~2026-04-17) — Brief Sheet V1, 37 kolumn (Product Details + Packaging sections)
- **Potencjalnie nowy reality-source** `_meta/reality-sources/brief-excels/` (planowany w Phase A Session 2 lub Session 3)
- Brief to pre-PLD NPD stage — w Monopilot staje się pierwszym ekranem NPD pipeline z handoff "Convert to PLD"
- **Nie wszystkie brief fields mapują się dziś** — budujemy architekturę schema-driven żeby łatwo dodawać kolumny (confirmed user constraint)

**Reality vs pre-Phase-0 docs — niezgodności zafiksowane w PROCESS-OVERVIEW §9:**

| Pre-Phase-0 | Reality v7 |
|---|---|
| "Development" dział | Core (NPD team) |
| "Quality" dział | Technical |
| MRP split na 2 | 1 dział (wycofane) |
| ~21 tabów | 22 taby |
| Main Table ~60-80 cols | 69 cols |
| (brak briefu w docs) | Brief = upstream NPD stage |

---

## Decyzje zapadłe podczas sesji

1. **Brief = osobny reality source** (planowany w Session 2 lub 3 Phase A). Session 1 wymienia brief w PROCESS-OVERVIEW §2, ale osobny doc `BRIEF-FLOW.md` w `_meta/reality-sources/brief-excels/` nie powstaje dziś (scope discipline).
2. **Role taxonomy fix w Monopilot** — w modułach używać `Core`/`NPD` zamiast `Development`, `Technical` zamiast `Quality`. MRP bez split.
3. **Dashboard access = schema-driven role matrix** — `dashboard.view` dla wszystkich dept managers, `d365_builder.execute` tylko NPD Manager. ADR-012 extension do dopisania w Phase D / implementation.
4. **Number_of_Cases semantyka** — ilość cases na **jednej palecie** (palletizing constraint), NIE `Packs Per Case` z briefu. Osobna kolumna.
5. **PR_Code_Final** — nowy finalny kod produktu w formacie `PR<digits><process_letter>`, niezależny od `PR_Code_P1..P4` (per-stage codes).
6. **Allergens cascade** RM→FA z `Reference.Allergens` tabelą (do dodania) — `[EVOLVING]` → docelowo `[UNIVERSAL]` (EU food-mfg regulatoryjnie).
7. **Reference.Processes jest ruchomy** — edytowalny w Settings (schema-driven per ADR-028).

---

## Pending propagations (do Session B — Phase B/C)

**Moduły Monopilot do update (nie w tej sesji):**

| Priorytet | Moduł | Co propagować |
|---|---|---|
| 1 (adresat #1) | `09-npd/` | PLD workflow opisany w NPD module — stories, PRD, UX: zmiana taxonomy działów (Core/Technical), dodanie brief upstream, Jane role, Dashboard access pattern |
| 2 | `02-products/` | Core columns → products schema mapping |
| 3 (Phase C batch) | `12-production/` | Production scope: 19 kolumn + cascading + PR_Code_Final format + Reference.Processes schema |
| 3 | `14-procurement/` | Procurement scope + nie-blocking dependency dla Price |
| 3 | `13-quality/` lub `NN-technical/` | Technical/Quality scope + Allergens cascade (EVOLVING) |
| 3 | `15-mrp/` lub pokrewny | MRP scope (no split) + packaging schema |
| 3 | `11-planning/` | Planning scope (4 cols) + meat_pct migracja do Core (decyzja Phase B) |
| 3 | `10-commercial/` | Commercial scope + Launch_Date alerts → Dashboard |
| 4 | `04-integrations/d365/` | D365 Builder (8 output tabs) + Import + `[LEGACY-D365]` flag `integration.d365.enabled` |

Każda propagacja = **Session B** zgodnie z REALITY-SYNC §3 (two-session pattern). Brainstorm markera per zmiana, cross-ref do tego reality source, update `propagated_to` w frontmatterze PROCESS-OVERVIEW/DEPARTMENTS.

---

## Pozostałe Phase A deliverables (Session 2 + Session 3)

**Session 2** (kolejna sesja PLD v7 capture):
- `pld-v7-excel/MAIN-TABLE-SCHEMA.md` — 69 kolumn z type/owner/validation/required/dependency/default. Scan z Excel headers rząd 1 + VBA `M01_Config.bas` + user interview na semantykę
- `pld-v7-excel/CASCADING-RULES.md` — Pack_Size → Line → Dieset → Material. PR_Code_Final generation formula. Template auto-fill z Reference.Templates
- `pld-v7-excel/WORKFLOW-RULES.md` — status colors (White/Gray/Green/Red), Hard-lock (Column A), Autofilter Done per dept, Closed_[Dept] semantyka, Built flag auto-reset

**Session 3** (ostatnia sesja PLD v7):
- `pld-v7-excel/REFERENCE-TABLES.md` — 8 tables z Reference sheet: DeptColumns, PackSizes (5), Lines_By_PackSize (5 linii), Dieset_By_Line_Pack (10 kombinacji), Templates (4), EmailConfig (puste dziś), Processes (8 Strip..Roast z suffix A..H,R), CloseConfirm
- `pld-v7-excel/D365-INTEGRATION.md` — D365 Import (release product list paste), D365 Builder (8 output tabs), validation codes green/yellow/red, Builder semantics (M08_Builder VBA), paste-back manual process
- `pld-v7-excel/EVOLVING.md` — lista obszarów w trakcie zmian: brief integration, Core cols expansion (Volume, Dev_Code, Price, %, Packs_Per_Case, Weights, Benchmark, Comments), Technical Allergens, Reference.Processes expansion, 3-ci brief template, Email recipients setup
- **Nowy reality source:** `_meta/reality-sources/brief-excels/BRIEF-FLOW.md` — Brief Sheet V1 structure + 3 templates + mapping brief→PLD (dokumentuje też to co NIE mapuje się dziś)

**Phase A quality gate (po Session 3):**
- [ ] 8 docs w pld-v7-excel/ ukończone
- [ ] Markery na wszystkim
- [ ] User potwierdza że opisane procesy = rzeczywistość
- [ ] Nowy reality source brief-excels/ zainicjowany
- [ ] Wszystkie docs `sync_status: current` (po user sign-off)
- [ ] `food-industry-mes` skill full draft (upgrade z placeholder)

---

## Pending decisions (carried forward)

Z Session 1 interview — wymaga dopytania użytkownika / decyzji Phase B:

1. **Technical vs Quality naming** w Monopilot modułach — zostajemy przy `Technical` (Forza naming, FORZA-CONFIG) czy migrujemy do `Quality` (bardziej uniwersalne food-mfg)?
2. **Commercial upstream od briefu?** — czy brief trigger pochodzi od klienta → Commercial → NPD? Czy bezpośrednio NPD research? Wpływa na Monopilot NPD-upstream module design.
3. **Meat_Pct migracja do Core** — dziś w Planning, ale pochodzi bezpośrednio z briefu. Decyzja w Phase B (MAIN-TABLE-SCHEMA).
4. **Materiał consumption tabela** — m/each folii per dieset. Nie istnieje w v7, do dodania. Gdzie — w Reference.Dieset_By_Line_Pack jako extra cols, czy osobna `Reference.Dieset_Material_Consumption`?
5. **Reference.Allergens schemat** — EU14 seed czy więcej? Cascade logic RM→FA szczegóły (mnogie alergeny, overrides) — Phase B.
6. **Dev_Code vs Article_Number** — `DEV26-037` w briefie vs `Article_Number` w Commercial. Relacja? Dev_Code do Core, Article_Number do Commercial po launch — do potwierdzenia.
7. **Osoby managerów działów** — PROCESS-OVERVIEW §5 ma tylko Jane. Czy identyfikować konkretnie osoby per dept (`[FORZA-CONFIG]`) czy pozostawić role-level?

---

## Bootstrap Session 2

**Jeśli kontynuujemy Phase A (Session 2 — MAIN-TABLE-SCHEMA + CASCADING + WORKFLOW):**

1. Read `_meta/handoffs/2026-04-17-phase-a-session-1-close.md` (ten plik)
2. Read `_meta/reality-sources/pld-v7-excel/PROCESS-OVERVIEW.md` + `DEPARTMENTS.md` (input dla kolejnych)
3. Read VBA modules local (`C:\Users\MaKrawczyk\PLD\v7\vba\M01_Config.bas`, `M02_RefreshDeptView.bas`, `M03_WriteBack.bas`, `M04_Cascade.bas`, `M05_D365Validate.bas`, `M10_Validation.bas`)
4. Scan Main Table headers (row 1, all 69 cols) via `excel-windows-automation` skill
5. Scan Reference sheet full (128 rzędów — DeptColumns full, PackSizes, Lines_By_PackSize, Dieset_By_Line_Pack, Templates, EmailConfig, Processes, CloseConfirm)
6. User interview: kolumna-po-kolumnie type/validation/required dla Main Table (może być batchami per dept section)

**Jeśli przechodzimy do Session B (propagacja do 09-npd/):**

1. Read `_meta/reality-sources/pld-v7-excel/PROCESS-OVERVIEW.md` + `DEPARTMENTS.md` (gotowe Session 1)
2. Read `_archive/new-doc-2026-02-16/09-npd/` (legacy NPD module — 114+ plików)
3. Brainstorm markera per zmiana (per sekcja NPD module) — dyscyplina REALITY-SYNC §4
4. Update `09-npd/` z cross-ref do reality source + markery
5. Update `propagated_to` w frontmatterze PROCESS-OVERVIEW + DEPARTMENTS (dodać `09-npd`)
6. Update `sync_status: current` gdy user potwierdzi

---

## Related

- [PROCESS-OVERVIEW.md](../reality-sources/pld-v7-excel/PROCESS-OVERVIEW.md)
- [DEPARTMENTS.md](../reality-sources/pld-v7-excel/DEPARTMENTS.md)
- [Spec Phase A detail](../specs/2026-04-17-monopilot-migration-design.md) §3.2
- [Previous HANDOFF (Phase 0 close + Phase A bootstrap)](2026-04-17-phase-0-close-and-phase-a-bootstrap.md)
- User memory updates required po tej sesji:
  - `project_smart_pld` — 22 taby, Jane=owner, brief upstream, allergens EVOLVING, MRP nie split, PR_Code_Final format fix
  - `project_monopilot_migration` — Phase A Session 1 done, Session 2 next

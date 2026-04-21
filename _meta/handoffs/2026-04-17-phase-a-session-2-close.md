# HANDOFF — Phase A Session 2 close → Session 3 bootstrap

**From session:** 2026-04-17 Phase A Session 2 (PLD v7 reality — MAIN-TABLE-SCHEMA + CASCADING-RULES + WORKFLOW-RULES)
**To session:** Phase A Session 3 (REFERENCE-TABLES + D365-INTEGRATION + EVOLVING + brief-excels/ kick-off) LUB Phase B propagation (decyzja user)
**Phase:** A of (0 → A → D → B → C), session 2/3

---

## Co zrobione (Session 2 — complete)

**Reality capture — 3 docs (capture-only, no propagation):**

- `_meta/reality-sources/pld-v7-excel/MAIN-TABLE-SCHEMA.md` — ~540 linii. 69 kolumn full metadata: typ / owner / blocking / required / dropdown source / marker / notes. Schema-driven check vs ADR-028 (Reference.DeptColumns już realizuje pattern). Section-level breakdown: CORE (8), PLANNING (4), COMMERCIAL (8), PRODUCTION (19), TECHNICAL (2), MRP (13), PROCUREMENT (5), SYSTEM (10 auto-calc).
- `_meta/reality-sources/pld-v7-excel/CASCADING-RULES.md` — ~370 linii. Wszystkie cascades: Pack_Size → Line → Dieset (core cascade), Process_N → PR_Code_P<N> → PR_Code_Final (PR generation), Finish_Meat → RM_Code (auto-build) + SyncProdDetailRows, Template → ApplyTemplate (fills ProdDetail). Plus pełna mapa refresh (M03.RefreshAffectedDepts). Projekcja na Monopilot ADR-029 (4 obszary Level "b" rule engine).
- `_meta/reality-sources/pld-v7-excel/WORKFLOW-RULES.md` — ~480 linii. Status colors (4 row-level + 3 cell-level D365 + 2 blocking), hard-lock (Blocking_Rule mechanism), autofilter (skip rows w rendering), Closed_<Dept> vs Done_<Dept>, Worksheet_Change flow (M03), Built flag lifecycle + auto-reset, Dashboard alerts (RED/YELLOW/GREEN thresholds 10/21 dni), sheet protection, FA Code V01. Lifecycle diagram (Mermaid stateDiagram).

---

## Kluczowe reality discoveries (Session 2)

### Schema-driven już zrealizowany (confirmed ADR-028)

`Reference.DeptColumns` (6-col table: Column_Name / Dept / Data_Type / Dropdown_Source / Blocking_Rule / Required_For_Done) **jest schema-driven metadata** dla kolumn Main Table. VBA `M02_RefreshDeptView` dynamicznie buduje proxy tab UI z tych metadat — **silnik renderu już działa w pełni schema-driven w Excel/VBA**.

Konsekwencja: Monopilot implementacja musi replikować ten pattern — cols jako data, UI renderer reads config. To value-add pozostaje: UI do add/edit/remove cols + runtime Main Table resize + automatic Done_<Dept> col dla new depts.

### Main Table precision — 69 kolumn

Memory mówiło "~60-80 cols". **Reality: dokładnie 69 kolumn** (row 3 headers).
- 1 FA_Code (C1, PK)
- 58 dept-owned (Reference.DeptColumns ma 58 rows R3-R60)
- 10 SYSTEM (C60-69, auto-calc): 7× Done_<Dept> + Status_Overall + Days_To_Launch + Built

### Schema header row konwencja

`MT_HEADER_ROW = 3` (row 1 = workbook title merged, row 2 = section labels na specific columns, row 3 = actual column names, row 4+ = data). **Powszechny błąd**: skanowanie row 1 pokazuje tylko "FORZA FOODS - Main Table (master data)" jako header — musisz czytać row 3.

### Blocking rules — 4 hardcoded

| Rule | Implementacja |
|---|---|
| `""` (pusty) | Always unlocked |
| `Core done` | IsAllRequiredFilled("Core", mtRow) |
| `Pack_Size filled` | Pack_Size != "" |
| `Line filled` | Line != "" |
| `Core + Production done` | IsAllRequiredFilled("Core") AND IsProdDetailComplete |

Mapa cols → blocking:
- Wszystkie Core cols: `""`
- Planning (4) + Commercial (8) + Technical (2) + Procurement (5) = 19 cols: `Core done`
- Production Process_1..4 + Yield_P1..4 + Line + Closed_Production (10 cols): `Pack_Size filled`
- Production Dieset + Yield_Line + Staffing + Rate (4 cols): `Line filled`
- MRP wszystkie 13 cols: `Core + Production done`

### PR_Code_Final format CONFIRMED (M04.RecalcPRCodeFinal)

`PR_Code_Final = "PR" + <digits_z_RM_Code> + <suffix_ostatniego_wypełnionego_PR_Code_P<N>>`

Przykład: RM123 + last filled Process = Roast (R) → `PR123R`. Jeśli tylko Process_1+Process_2 wypełnione (Strip, Dice) → lastSuffix = H (Dice) → `PR123H`.

V06 validation: jeśli `UCase(Right(Finish_Meat, 1))` ≠ `UCase(lastSuffix)` → MISMATCH warning (cell red + comment).

### ProdDetail = VBA-active multi-component feature

Hidden tab ale VBA aktywnie używa:
- `SyncProdDetailRows` — tworzy 1 wiersz per PR_Code z Finish_Meat
- `M02.RenderProductionView` — multi-row Production proxy tab view
- `M04.ApplyTemplate` — fills Process_1..4 **w ProdDetail** (nie Main Table)
- `M01.IsProdDetailComplete` — blocker dla MRP

**Ale dziś ProdDetail fizycznie pusty** bo Main Table ma 100 empty rows (workbook setup/testing mode). Gdy user doda FA z wypełnionym Finish_Meat, ProdDetail auto-populate.

### Reference tables precise content

- **PackSizes** (5): 20x30cm / 25x35cm / 18x24cm / 30x40cm / 15x20cm
- **Lines_By_PackSize** (5): Line5 (20x30, 25x35), Line6 (20x30, 18x24), Line17 (20x30, 30x40), Line3 (15x20, 18x24), Line9 (25x35, 30x40)
- **Dieset_By_Line_Pack** (10): DIE_<pack>_L<line> dla każdej kombinacji Line × Pack_Size
- **Templates** (4): Standard Meat FA (Strip only) / Simple Pack FA (no processes) / Roasting Chicken (Strip/Roast/Slice) / Full Process FA (Strip/Coat/Smoke/Slice)
- **Processes** (8): Strip/A, Coat/B, Honey/C, Smoke/E, Slice/F, Tumble/G, Dice/H, Roast/R (brak suffix D — prawdopodobnie reserved)
- **EmailConfig** (7 dept rows): Recipients puste, Subject_Template = `"PLD Update - {FA_Code}"` (placeholder)
- **CloseConfirm** (1): "Yes"

### RM_Code auto-build logic

`Finish_Meat = "PR123H, PR345A"` → parse fragments → for each `PR<digits><letter>` produce `RM<digits>` → `RM_Code = "RM123, RM345"`. Fragments bez `PR` prefix są ignorowane.

### Row-level status colors (ApplyRowStatus)

4 priorytety (w kolejności):
1. `IsAllRequiredFilled` → 🟢 GREEN "Ready to Close" (#C0FFC0)
2. `Days_To_Launch ≤ 10` → 🔴 RED "ALERT" (#C0C0FF)
3. Blocking rule nie met → ⬜ GRAY "Waiting" (#E0E0E0)
4. Default → ⬜ WHITE "Ready" (#FFFFFF)

### Closed_<Dept> (manual) vs Done_<Dept> (auto) — niejasne

- `Closed_<Dept>` = dropdown "Yes" (manual user click)
- `Done_<Dept>` = system col boolean — **Brak explicit setter zidentyfikowanego** w M01-M07
- VBA `IsDeptDone` zwraca `Closed_<Dept>="Yes"` (ignoruje Done_<Dept>)
- Autofilter w dept tab + Dashboard counters + Validation używają Closed (via IsDeptDone), nie Done

**Open question Phase B:** Done_<Dept> — Excel formula? VBA compute? Legacy?

### Built flag + auto-reset na edit

`Main Table.Built` = TRUE tylko gdy Jane klika D365 Builder AND wszystkie Closed=Yes AND validation OK. `M03.DeptTab_WriteBack` **auto-resetuje Built=FALSE** przy edycji dowolnej non-Production cell. Production ProdDetail edits — nie trigger'ują auto-reset (możliwy bug, TBD).

### Dashboard alerts thresholds

Hardcoded w M07: RED (≤10 dni OR no launch date), YELLOW (≤21 dni + missing data), GREEN (rest). Thresholds = `[FORZA-CONFIG]`, w Monopilot jako config table.

### Worksheet_Change (CLS_SheetEvents) — single cell only

Event handler w każdym dept tab. Rejects multi-cell changes (paste, fill-down). Workaround: paste do Main Table bezpośrednio (ominie handler, rzeczywiście ryzykowne).

---

## Niezgodności vs Session 1 — fixed

Session 1 docs (PROCESS-OVERVIEW + DEPARTMENTS) nie zawierały:
- Precyzji 69 cols (było "60-80")
- Schema-driven confirmation (Reference.DeptColumns)
- Blocking rules 4 kanonicznych
- PR_Code_Final formula dokładnej
- ProdDetail active-feature status
- 4 priorytety row status colors
- Autofilter = skip-in-render (nie Excel AutoFilter)

Session 2 docs te uzupełniają. Session 1 PROCESS-OVERVIEW i DEPARTMENTS **pozostają prawidłowe** — Session 2 dodaje niższy poziom detail, nie koryguje Session 1.

### Jedna korekta Session 1 → poprawiona w tej sesji? Nie

Jeszcze nie. Obie Session 1 docs (PROCESS-OVERVIEW, DEPARTMENTS) pozostają nietknięte po Session 2 write. Nie ma konfliktu — Session 2 docs to orthogonalne warstwy detail. Cross-linkowanie do Session 1 działa (PROCESS-OVERVIEW ↔ DEPARTMENTS ↔ MAIN-TABLE-SCHEMA ↔ CASCADING-RULES ↔ WORKFLOW-RULES).

---

## Pozostałe Phase A deliverables (Session 3)

**Session 3** (ostatnia sesja Phase A, 2-3h):

- `_meta/reality-sources/pld-v7-excel/REFERENCE-TABLES.md` — pełny zrzut 8 config tables z sheet `Reference`:
  - DeptColumns (już w MAIN-TABLE-SCHEMA, można cross-ref)
  - PackSizes, Lines_By_PackSize, Dieset_By_Line_Pack, Templates, Processes (już w CASCADING-RULES, cross-ref)
  - EmailConfig — pełny detail (Subject_Template, Recipients setup plan)
  - CloseConfirm — pełny detail (dlaczego tylko "Yes")
- `_meta/reality-sources/pld-v7-excel/D365-INTEGRATION.md`:
  - D365 Import (paste flow, release product list, validation z M05)
  - D365 Builder (M08) — 8 output tabs szczegółowo, co generuje każdy, format D365 paste-back
  - ValidateAllCodes (V04 material check)
  - Built flag pełny lifecycle + gate criteria
  - Paste-back workflow manual
- `_meta/reality-sources/pld-v7-excel/EVOLVING.md` — lista obszarów w trakcie zmian:
  - Brief ↔ PLD integration (full plan)
  - Core cols expansion (Volume, Dev_Code, Price from brief, %, Packs_Per_Case, Weights, Benchmark, Comments)
  - Technical Allergens cascade (RM→FA inheritance, Reference.Allergens seed EU14)
  - Reference.Processes expansion (user-editable)
  - Reference.EmailConfig recipients setup
  - Dieset → material consumption (m/each folii) tabela
  - 3-ci brief template
  - ProdDetail semantyka (single vs multi-component — decyzja Phase B)
  - Done_<Dept> logic — settle formula/VBA

- **Nowy reality source (poza pld-v7-excel):** `_meta/reality-sources/brief-excels/BRIEF-FLOW.md`:
  - Brief Sheet V1 structure (37 cols, 2 sections: Product Details + Packaging)
  - 3 brief templates (brief 1, brief 2, brief 3 added 2026-04-17)
  - Mapping brief → PLD v7 Main Table (co dziś mapuje, co pozostaje brief-only)
  - Semantyka wielo-component (brief 2 ma 1 product z N component rows + sumująca waga)
  - Handoff brief → Jane → Core flow
  - Frontmatter + `[EVOLVING]` na cały plik (integracja projektowana)

**Phase A quality gate (po Session 3):**
- [ ] 8 docs w pld-v7-excel/ ukończone (7 już zrobionych w Session 1+2, 3 do zrobienia w Session 3)
- Actually poprawka: Session 1 = 2 docs (PROCESS-OVERVIEW + DEPARTMENTS), Session 2 = 3 docs (MAIN-TABLE-SCHEMA + CASCADING-RULES + WORKFLOW-RULES), Session 3 = 3 docs (REFERENCE-TABLES + D365-INTEGRATION + EVOLVING). **Total 8.**
- [ ] `brief-excels/BRIEF-FLOW.md` zainicjowany (nowy reality source)
- [ ] Markery na wszystkim (zgodnie z documentation-patterns SKILL.md)
- [ ] User potwierdza że opisane procesy = rzeczywistość
- [ ] Wszystkie docs `sync_status: current` po user sign-off
- [ ] `food-industry-mes` skill full draft (upgrade z placeholder)

---

## Pending propagations (do Session B — Phase B/C)

**Z Session 1 + 2 łącznie:**

| Priorytet | Moduł | Co propagować |
|---|---|---|
| 1 (adresat #1) | `09-npd/` | Pełna NPD module rewrite z markerami — workflow, schema, cascades, dashboard. PRD update, stories review (18), UX wireframes review, cross-walk gap analysis |
| 2 | `02-products/` | Core columns → products schema (8 cols) + schema-driven extension pattern (ADR-028 confirmation) |
| 2 | `04-integrations/d365/` | D365 Import + Builder (8 tabs) + V04 material validation + Built flag + `[LEGACY-D365]` flag |
| 3 (Phase C) | `11-planning/` | Planning 4 cols + blocking rule "Core done" |
| 3 | `10-commercial/` | Commercial 8 cols + Launch_Date/Days_To_Launch napędzające alerts |
| 3 | `12-production/` | Production 19 cols + ProdDetail multi-component + PR codes generation |
| 3 | `13-quality/` lub `NN-technical/` | Technical 2 cols dzisiaj + Allergens EVOLVING + food safety future scope |
| 3 | `15-mrp/` lub pokrewny | MRP 13 cols + "Core + Production done" blocking |
| 3 | `14-procurement/` | Procurement 5 cols + Price wait-on-components pattern |
| 3 | `20-dashboards/` | Dashboard counters + alerts engine + thresholds as config |
| 3 | `21-rule-engine/` (jeśli taki istnieje / do stworzenia) | Rule engine 4 obszary ADR-029 + DSL scope |

---

## Bootstrap Session 3

1. Read `monopilot-kira-main/_meta/handoffs/2026-04-17-phase-a-session-2-close.md` (ten plik)
2. Read Session 1 + 2 docs (5 plików): PROCESS-OVERVIEW, DEPARTMENTS, MAIN-TABLE-SCHEMA, CASCADING-RULES, WORKFLOW-RULES
3. Read VBA pozostałe: `M08_Builder.bas`, `M11_AddProduct.bas`, `M06_BOMAutoGen.bas`, `M09_Email.bas`, `ThisWorkbook.cls`
4. Scan D365 Builder output tabs content (pewnie placeholder dziś, ale struktura może istnieć)
5. Scan D365 Import sample data po potencjalnym paste (jeśli Forza ma release product list do zaimportowania)
6. Zeskan briefy 1/2/3 pełniej — każdy wiersz pattern (brief 2 multi-component)
7. Session 3 deliverables: 3 docs pld-v7-excel + init brief-excels/

**Alternatywnie** (user może wybrać): zamiast Session 3 Phase A → Session B propagation do `09-npd/`. Ryzyko: niekompletny reality source (brakuje D365-INTEGRATION + REFERENCE-TABLES + brief context). Rekomendacja: kontynuować A do końca.

---

## Open questions carry-forward (do Phase B/D)

Z Session 1 + 2 pozostają:

**Schema:**
1. Multi-component Main Table vs ProdDetail semantyka (§3.4.1 MAIN-TABLE-SCHEMA, §3.3 CASCADING-RULES)
2. Done_<Dept> system col logic — Excel formula? VBA? legacy? (§5.2 WORKFLOW-RULES, §3.8 MAIN-TABLE-SCHEMA)
3. Status_Overall enum values (§3.8 MAIN-TABLE-SCHEMA)
4. Days_To_Launch — persisted vs computed (§3.8)
5. FA_Code generation rule (§11.3 WORKFLOW-RULES)
6. Dev_Code (brief) vs FA_Code (PLD) relacja (§11.3)
7. Price blocking rule — `Core done` vs `Core + Production done` (§3.7 MAIN-TABLE-SCHEMA)
8. Built auto-reset — ProdDetail changes? (§7.2 WORKFLOW-RULES)

**Business/Architecture:**
9. Technical naming: Technical vs Quality w Monopilot (Session 1)
10. Commercial upstream od briefu — tak/nie (Session 1)
11. Meat_Pct migracja do Core (Session 1)
12. Materiał consumption tabela design (§1.6 CASCADING-RULES)
13. Reference.Allergens schemat EU14 + cascade (Session 1 Technical evolving)
14. Osoby managerów działów identified per dept (Session 1 §5 Owner map)
15. Multi-component CloseProduction business correctness (§15 WORKFLOW-RULES)
16. Alert thresholds 10/21 days user-configurable (§15)

**Rule engine (ADR-029 implementation):**
17. DSL składnia konkretnie (JSON/textual/Mermaid-like)
18. PR_Code_Final format per org (inne orgi mogą mieć inny format)
19. Finish_Meat parse logic per org
20. Blocking rules beyond 4 — scope extensions

---

## Related

- [PROCESS-OVERVIEW.md](../reality-sources/pld-v7-excel/PROCESS-OVERVIEW.md) — Session 1
- [DEPARTMENTS.md](../reality-sources/pld-v7-excel/DEPARTMENTS.md) — Session 1
- [MAIN-TABLE-SCHEMA.md](../reality-sources/pld-v7-excel/MAIN-TABLE-SCHEMA.md) — Session 2
- [CASCADING-RULES.md](../reality-sources/pld-v7-excel/CASCADING-RULES.md) — Session 2
- [WORKFLOW-RULES.md](../reality-sources/pld-v7-excel/WORKFLOW-RULES.md) — Session 2
- Previous HANDOFFs:
  - [2026-04-17 Phase 0 close + Phase A bootstrap](2026-04-17-phase-0-close-and-phase-a-bootstrap.md)
  - [2026-04-17 Phase A Session 1 close](2026-04-17-phase-a-session-1-close.md)
- User memory updates required po tej sesji:
  - `project_smart_pld` — 69 cols confirmed, 4 blocking rules, schema-driven Reference.DeptColumns, row status colors, Built auto-reset
  - `project_monopilot_migration` — Phase A Session 2 done, Session 3 next, ~7 sesji pozostało total

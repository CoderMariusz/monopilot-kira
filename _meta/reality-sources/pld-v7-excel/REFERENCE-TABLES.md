---
doc_version: 0.1.0
source_version: Smart_PLD_v7.xlsm@2026-04-17-0728
last_sync: 2026-04-17
sync_status: needs_review
propagated_to: []
---

# REFERENCE-TABLES — 8 tabel konfiguracyjnych Smart PLD v7

**Reality source:** `C:\Users\MaKrawczyk\PLD\v7\Smart_PLD_v7.xlsm` → sheet `Reference` (128 rzędów, 6 kolumn)
**Phase:** A Session 3 (capture)
**Related:** [`MAIN-TABLE-SCHEMA.md`](./MAIN-TABLE-SCHEMA.md), [`CASCADING-RULES.md`](./CASCADING-RULES.md), [`WORKFLOW-RULES.md`](./WORKFLOW-RULES.md), [`_foundation/META-MODEL.md`](../../../_foundation/META-MODEL.md) §1, [`_foundation/decisions/ADR-028-schema-driven-column-definition.md`](../../../_foundation/decisions/ADR-028-schema-driven-column-definition.md)

---

## Purpose

Dokument kodyfikuje 8 tabel konfiguracyjnych w sheet `Reference`. Te tabele realizują **schema-driven domain Level "a"** (META-MODEL §1) — są **danymi**, nie kodem, edytowalne przez użytkownika bez dewelopera. Razem z `Reference.DeptColumns` stanowią **pełny zestaw config-tables** napędzający runtime UI + cascade + workflow v7.

W Monopilot każda z tych tabel staje się **config-table per org** (ADR-028) z UI Settings. Seed dla Forza = wartości z tego dokumentu; inne orgi mogą override.

---

## §1 — Organizacja sheet Reference

Sheet `Reference` zawiera **8 tabel** ułożonych sekwencyjnie z separatorem `TABLE: <name>` w col A:

```
R1    TABLE: DeptColumns              (row 2 = header, R3-R60 = 58 data rows)
R62   [empty separator]
R63   TABLE: PackSizes                (R64 header, R65-R69 = 5 values)
R72   TABLE: Lines_By_PackSize        (R73 header, R74-R78 = 5 lines)
R81   TABLE: Dieset_By_Line_Pack      (R82 header, R83-R92 = 10 combinations)
R95   TABLE: Templates                (R96 header, R97-R100 = 4 templates)
R103  TABLE: EmailConfig              (R104 header, R105-R111 = 7 dept rows)
R114  TABLE: Processes                (R115 header, R116-R123 = 8 processes)
R126  TABLE: CloseConfirm             (R127 header, R128 = 1 value)
```

**VBA access pattern (M01.FindTableStartRow):**
```vb
Public Function FindTableStartRow(tableName As String) As Long
    For r = 1 To last_row
        If ws.Cells(r, 1).Value = "TABLE: " & tableName Then
            Return r
        End If
    Next
    Return 0
End Function
```

Data rows zaczynają się zawsze **startRow + 2** (skip separator + header). Loop działa dopóki `Cells(r, 1).Value <> ""`.

**Marker:**
- Wzorzec "multiple tables w jednym sheet z separatorami `TABLE: <name>`" = `[FORZA-CONFIG]` (Excel-specific layout)
- Config-table pattern generically = `[UNIVERSAL]` (ADR-028)
- W Monopilot każda tabela = osobna DB table albo JSON config per org

---

## §2 — TABLE: DeptColumns

**Row range:** R3–R60 (58 data rows)
**Columns:** Column_Name | Dept | Data_Type | Dropdown_Source | Blocking_Rule | Required_For_Done

**Pełny zrzut przedstawiony w [`MAIN-TABLE-SCHEMA.md`](./MAIN-TABLE-SCHEMA.md) §3** (by-dept breakdown). Tu rekapitulacja struktury:

| Aspekt | Wartość |
|---|---|
| Total rows | 58 (Core 7 + Planning 4 + Commercial 8 + Production 19 + Technical 2 + MRP 13 + Procurement 5) |
| Unique Data_Types | 5 (Text, Number, Date, Dropdown, Auto) |
| Unique Dropdown_Sources | 5 (PackSizes, Lines_By_PackSize, Templates, Processes, CloseConfirm) |
| Unique Blocking_Rules | 5 (`""`, `Core done`, `Pack_Size filled`, `Line filled`, `Core + Production done`) |
| Required_For_Done = Yes count | ~33 |

**Role:** Metadata kolumn Main Table — napędza schema-driven renderer M02, cascade routes M04, validation M10, Dashboard BuildMissingDataText M07.

**Marker:** Patrz MAIN-TABLE-SCHEMA §2 dla pełnych markerów per kolumna.

---

## §3 — TABLE: PackSizes

**Row range:** R64 header + R65–R69 (5 values)
**Columns:** Pack_Size

| Pack_Size |
|---|
| 20x30cm |
| 25x35cm |
| 18x24cm |
| 30x40cm |
| 15x20cm |

**Użycie:**
- Dropdown source dla `Core.Pack_Size` (M02.BuildSimpleList)
- Lookup key w `Lines_By_PackSize` i `Dieset_By_Line_Pack` (z "cm" stripowanym przez M04.LookupDieset)

**Cascade:** Zmiana Pack_Size → clear Line + Dieset (zobacz CASCADING-RULES §1.1).

**Format:** `<width>x<height>cm` (cm suffix). Values naming Forza-specific — inne firmy mogą mieć inne rozmiary (np. USA w inches, circular trays, custom formats).

**Marker:**
- Pack_Size jako concept = `[UNIVERSAL]` (każda food-mfg firma ma rozmiary opakowań)
- 5 konkretnych Forza values = `[FORZA-CONFIG]`
- Format `20x30cm` = `[FORZA-CONFIG]` (localization: cm vs in, separator vs x, itp.)

**Evolving:** Ruchomy zestaw (user może dodać nowe Pack_Size). Dziś dodanie = manual edit Reference sheet + sprawdzenie czy Lines_By_PackSize i Dieset_By_Line_Pack zawierają kombinacje. Brak automatycznego "jeśli dodam Pack_Size, pokaż mi które Lines muszę skonfigurować" prompt-a.

---

## §4 — TABLE: Lines_By_PackSize

**Row range:** R73 header + R74–R78 (5 lines)
**Columns:** Line | Supported_Pack_Sizes

| Line | Supported_Pack_Sizes |
|---|---|
| Line5 | 20x30, 25x35 |
| Line6 | 20x30, 18x24 |
| Line17 | 20x30, 30x40 |
| Line3 | 15x20, 18x24 |
| Line9 | 25x35, 30x40 |

**Format `Supported_Pack_Sizes`:** comma-separated bez "cm" (Forza konwencja). Każda linia wspiera 2 Pack_Sizes.

**Użycie:**
- Filtered dropdown dla `Production.Line` (M02.BuildFilteredLineList) — per Pack_Size zwraca tylko te Lines które wspierają dany size
- Prerequisite dla Dieset lookup (Line+Pack_Size → Dieset w Dieset_By_Line_Pack)

**Filtering logic (M02.BuildFilteredLineList):**
```
cleanPS = Pack_Size bez "cm"
For each row in Lines_By_PackSize:
  IF InStr(row.Supported_Pack_Sizes, cleanPS) > 0:
    Add row.Line to dropdown list
```

Przykład: Pack_Size="20x30cm" → cleanPS="20x30" → match Line5, Line6, Line17 (3 lines).

**Coverage matrix:**

| Pack_Size | Dostępne Lines | Ilość |
|---|---|---|
| 20x30cm | Line5, Line6, Line17 | 3 |
| 25x35cm | Line5, Line9 | 2 |
| 18x24cm | Line6, Line3 | 2 |
| 30x40cm | Line17, Line9 | 2 |
| 15x20cm | Line3 | 1 |

**Single point of failure:** `Line3` jest jedyną linią wspierającą `15x20cm`. Jeśli Line3 offline → nie ma produkcji 15x20. To jest reality constraint Forza.

**Marker:**
- Line-to-PackSize mapping pattern = `[UNIVERSAL]` (każda firma mfg ma capacity matrix)
- 5 konkretnych linii + ich support = `[FORZA-CONFIG]`
- Format comma-sep supported sizes = `[FORZA-CONFIG]`

---

## §5 — TABLE: Dieset_By_Line_Pack

**Row range:** R82 header + R83–R92 (10 combinations)
**Columns:** Line | Pack_Size | Dieset

| Line | Pack_Size | Dieset |
|---|---|---|
| Line5 | 20x30 | DIE_20x30_L5 |
| Line5 | 25x35 | DIE_25x35_L5 |
| Line6 | 20x30 | DIE_20x30_L6 |
| Line6 | 18x24 | DIE_18x24_L6 |
| Line17 | 20x30 | DIE_20x30_L17 |
| Line17 | 30x40 | DIE_30x40_L17 |
| Line3 | 15x20 | DIE_15x20_L3 |
| Line3 | 18x24 | DIE_18x24_L3 |
| Line9 | 25x35 | DIE_25x35_L9 |
| Line9 | 30x40 | DIE_30x40_L9 |

**Total combinations:** 10 = sum of Supported_Pack_Sizes per Line (Line5=2, Line6=2, Line17=2, Line3=2, Line9=2). Pełny match z §4.

**Format Dieset code:** `DIE_<PackSize_bez_cm>_L<LineNumber>`. Reversibly encoded — z kodu Dieset można odczytać Line + Pack_Size.

**Użycie:** Auto-lookup dla `Production.Dieset` (M04.LookupDieset). Dieset cell = Auto type (locked, green bg), wypełniana automatycznie po wyborze Line.

**Evolving `[EVOLVING]`:** Material consumption (m/each folii per dieset) — dziś **brak** w Reference. Planowane dodanie:
- Opcja (a): 2 extra kolumny w Dieset_By_Line_Pack (Folia_m, Folia_each)
- Opcja (b): Nowa tabela `Dieset_Material_Consumption` (Dieset_Code → Folia_m, Folia_each, Other materials)

Decyzja Phase B. W `EVOLVING.md` §3.

**Marker:** Tabela = `[FORZA-CONFIG]`. Format Dieset = `[FORZA-CONFIG]`. Pattern "composite key lookup" (Line × Pack_Size → Dieset) = `[UNIVERSAL]`.

---

## §6 — TABLE: Templates

**Row range:** R96 header + R97–R100 (4 templates)
**Columns:** Template_Name | Process_1 | Process_2 | Process_3 | Process_4 | Notes

| Template_Name | Process_1 | Process_2 | Process_3 | Process_4 | Notes |
|---|---|---|---|---|---|
| Standard Meat FA | Strip | — | — | — | 1 process - Strip only |
| Simple Pack FA | — | — | — | — | No processes |
| Roasting Chicken | Strip | Roast | Slice | — | 3 processes |
| Full Process FA | Strip | Coat | Smoke | Slice | — (4 processes) |

**Role:** Szablony "preset" dla new FA — Core user wybiera Template i ApplyTemplate (M04.ApplyTemplate) wypełnia Process_1..4 w **ProdDetail** (nie Main Table — zobacz CASCADING-RULES §4).

**Ograniczenie:** Template fills tylko processes. User musi po tym wypełnić Yield_P1..4, Line, Dieset (via cascade), Yield_Line, Staffing, Rate.

**Notes column:** Human-readable description + hint ile procesów. Nie używane przez VBA, tylko UX hint dla user.

**Forza coverage:**
- **Standard Meat FA** — single-process (typowy plaster mięsa): Strip only
- **Simple Pack FA** — no-process (packing existing components, no transformation)
- **Roasting Chicken** — 3-step chicken processing: Strip → Roast → Slice
- **Full Process FA** — 4-step meat processing: Strip → Coat → Smoke → Slice

**Evolving:** Ruchomy zestaw — user może dodać Template (np. "Sliced Ham", "Meat Platter", nowe process chains). Edit manual w Reference. Pattern scaling: gdy nowy Process dodany do `Reference.Processes` → potencjalnie nowe Template z tym Process.

**Marker:**
- Template pattern (preset workflows) = `[UNIVERSAL]` (ADR-029 §8 workflow-as-data)
- 4 konkretne templates Forza = `[FORZA-CONFIG]`
- Max 4 processes limit = `[FORZA-CONFIG]` (inne orgi mogą potrzebować więcej)

---

## §7 — TABLE: EmailConfig

**Row range:** R104 header + R105–R111 (7 dept rows)
**Columns:** Dept | Recipients | Subject_Template

| Dept | Recipients | Subject_Template |
|---|---|---|
| Core | *(empty)* | PLD Update - {FA_Code} |
| Planning | *(empty)* | PLD Update - {FA_Code} |
| Commercial | *(empty)* | PLD Update - {FA_Code} |
| Production | *(empty)* | PLD Update - {FA_Code} |
| Technical | *(empty)* | PLD Update - {FA_Code} |
| MRP | *(empty)* | PLD Update - {FA_Code} |
| Procurement | *(empty)* | PLD Update - {FA_Code} |

**Role:** Config dla M09_Email.SendToDept — opens Outlook draft z dept tab jako attachment.

**Status:** **Nieaktywny dziś** — wszystkie 7 recipients puste. M09 pokazuje MsgBox "No recipients configured" gdy user klika "Send to dept".

**Subject_Template placeholder:** `{FA_Code}` zamieniane w runtime. W przypadku bulk send (wszystkie pending FA jednym mailem), M09 wstawia `"Multiple Products"` zamiast FA_Code (line 54):
```vb
.Subject = Replace(subjectTpl, "{FA_Code}", "Multiple Products")
```

**Body (hardcoded w M09 line 55-57):**
```
Please review and complete the attached <dept> data.

This file contains all pending products for your department.

Regards,
PLD System - Forza Foods
```

**Evolving `[EVOLVING]`:**
- Recipients puste → Jane (lub admin) musi wypełnić dla każdego dept (to pewnie do zrobienia w najbliższym czasie)
- Subject_Template jest per-dept, ale Body jest hardcoded w VBA — niespójność. Monopilot: wszystko (recipients, subject, body, signature) jako config per dept per org
- Multi-language support (dept używa różnych języków) — nie wspierane dziś
- Triggers dla auto-email (np. "gdy Core closed, email do Planning") — nie istnieje. Dziś manual button click per dept

**Marker:**
- EmailConfig schema (Dept|Recipients|Subject_Template) = `[UNIVERSAL]` (pattern notifications config)
- Subject_Template format `PLD Update - {FA_Code}` = `[FORZA-CONFIG]`
- 7 dept rows per 7 Forza działów = `[FORZA-CONFIG]` (inne orgi mają inną taxonomy)
- Recipients (email addresses) = `[FORZA-CONFIG]`
- `Multiple Products` fallback text = `[FORZA-CONFIG]` (localizable)

---

## §8 — TABLE: Processes

**Row range:** R115 header + R116–R123 (8 processes)
**Columns:** Process_Name | Suffix

| Process_Name | Suffix |
|---|---|
| Strip | A |
| Coat | B |
| Honey | C |
| Smoke | E |
| Slice | F |
| Tumble | G |
| Dice | H |
| Roast | R |

**Nieużywane suffixy:** D (między Coat/C i Smoke/E). Prawdopodobnie reserved dla future process (np. "Debone"?) — user wspomniał że zestaw jest ruchomy i będzie rozszerzany.

**Role:**
- Dropdown source dla `Production.Process_1..4` (M02.BuildSimpleList)
- Suffix lookup dla PR_Code_P<N> generation (M04.LookupProcessSuffix)
- Component w PR_Code_Final generation (M04.RecalcPRCodeFinal) — `PR<digits><last_process_suffix>`

**Alphabetical gaps i convention:** Suffix nie jest alfabetyczny (skip D). Prawdopodobnie konwencja:
- A-C: standardowe (Strip, Coat, Honey)
- E-H: dalsze etapy (Smoke, Slice, Tumble, Dice)
- R: special (Roast)

**Dla Forza to standardowy zestaw food processes mięsnych.** Dla innych branż food-mfg (np. sweets, beverages) suffixy będą inne.

**Evolving `[EVOLVING]`:** Ruchomy zestaw — będzie rozszerzany o nowe procesy w miarę wprowadzania nowych linii / produktów. Musi być user-editable w Settings (ADR-028 schema-driven configuration) — dziś edit manual w Reference.

**Marker:**
- Processes as config-table pattern = `[UNIVERSAL]` (food-mfg have process taxonomies)
- 8 konkretnych Forza processes = `[FORZA-CONFIG]`
- Suffix convention (1-litera) = `[FORZA-CONFIG]`
- Single-letter suffix limit = `[EVOLVING]` (może się okazać za mało gdy rozszerzeń — 26 liter łącznie - 0 = 25 unique processes max)

---

## §9 — TABLE: CloseConfirm

**Row range:** R127 header + R128 (1 value)
**Columns:** Option

| Option |
|---|
| Yes |

**Role:** Dropdown source dla 7 `Closed_<Dept>` cols w Main Table. User może wybrać tylko "Yes" — unset robi się przez usunięcie wartości cell (blank).

**Dlaczego tylko "Yes" i nie "Yes/No"?** Forza upraszcza UI:
- Cell pusta → dept jeszcze nie zamknął
- Cell = "Yes" → dept zamknął
- Nie ma potrzeby explicit "No" (to by było redundant)

**Autofilter (M02.RenderStandardDeptView line 134):**
```vb
If Trim(CStr(wsMT.Cells(mtRow, closedCol).Value)) = "Yes" Then GoTo NextStdRow
```

Sprawdzanie jest `= "Yes"` (case-sensitive, hardcoded). Inne wartości (nawet "yes", "y", "TRUE") nie triggerują autofilter.

**Marker:**
- CloseConfirm binary pattern = `[FORZA-CONFIG]` (niektórzy orgi mogą wymagać explicit approval chain: "Pending"/"Approved"/"Rejected")
- "Yes" jako single value = `[FORZA-CONFIG]`

**Evolving:** Możliwe rozszerzenie do state machine:
- Draft → ReadyForReview → Approved → Closed
- Z approval chain (kto akceptuje Closed)
- Z audit trail (kto i kiedy)

W v7 brak audit trail dla Closed changes. W Monopilot standard (ADR-008 audit trail).

---

## §10 — Full table summary

| Table | Rows | Cols | Role | Markers majority |
|---|---|---|---|---|
| DeptColumns | 58 | 6 | Schema metadata per Main Table col | `[UNIVERSAL]` pattern + `[FORZA-CONFIG]` data |
| PackSizes | 5 | 1 | Dropdown source + lookup key | `[FORZA-CONFIG]` |
| Lines_By_PackSize | 5 | 2 | Capacity matrix | `[FORZA-CONFIG]` |
| Dieset_By_Line_Pack | 10 | 3 | Composite key lookup (Dieset code generator) | `[FORZA-CONFIG]` |
| Templates | 4 | 6 | Process preset workflows | `[FORZA-CONFIG]` + `[UNIVERSAL]` pattern |
| EmailConfig | 7 | 3 | Notifications config | `[FORZA-CONFIG]` (dziś inactive) |
| Processes | 8 | 2 | Process taxonomy + PR code suffix | `[FORZA-CONFIG]` + `[EVOLVING]` expansion |
| CloseConfirm | 1 | 1 | Autofilter value | `[FORZA-CONFIG]` simple pattern |

**Total:** 98 config rows across 8 tables.

**Coverage vs Main Table:**
- DeptColumns covers 58 of 69 Main Table cols (100% dept-owned, 0% SYSTEM cols)
- PackSizes + Lines_By_PackSize + Dieset_By_Line_Pack covers cascade Pack_Size→Line→Dieset (CASCADING-RULES §1)
- Templates covers cascade Template→ProdDetail (CASCADING-RULES §4)
- Processes covers cascade Process_N→PR_Code (CASCADING-RULES §2)
- EmailConfig covers M09 SendToDept feature (dziś inactive)
- CloseConfirm covers autofilter workflow (WORKFLOW-RULES §4)

---

## §11 — Jak dodać nową tabelę konfiguracyjną w v7 (reality extension pattern)

Scenariusz: User chce dodać nową tabelę, np. `Reference.Allergens` dla cascade RM→FA (patrz EVOLVING.md).

**Kroki (dziś, manual):**

1. **Edit sheet Reference:**
   - Znajdź koniec ostatniej tabeli (R128 CloseConfirm)
   - Dodaj separator `TABLE: Allergens` w R129 (lub po 2 rzędach empty)
   - Dodaj header row w R130
   - Dodaj data rows R131+

2. **Update VBA (jeśli tabela używana w cascade/dropdown):**
   - M02.ApplyDropdown dodaj case dla nowego sourceName (np. `Case "Allergens"`)
   - Jeśli tabela lookup-used: nowa funkcja w M04 (np. `LookupAllergensForRM`)
   - Jeśli tabela validation-used: update M10.RunValidation

3. **Update DeptColumns (jeśli nowa kolumna Main Table używa tej tabeli jako Dropdown_Source):**
   - Dodaj wiersz w DeptColumns z `Dropdown_Source = Allergens`
   - Update Main Table row 3 — dodaj header column
   - Update row 2 sekcja label jeśli relevant

4. **Update other affected scripts:**
   - PowerShell setup scripts w `v7/0N_setup_*.ps1` jeśli odnosi się do Reference structure
   - Test scripts w `v7/tests/test_0N_*.ps1`

**Problem:** Kroki 2-4 wymagają **VBA developer** — to łamie ADR-028 intent ("edytowalne bez dewelopera"). v7 jest **częściowo** schema-driven — tabele dropdown/lookup są danymi, ale integration z Main Table wymaga kodu.

**Monopilot target (ADR-028 full realization):**
1. Admin UI: "Add config table" — nazwa, kolumny, wiersze
2. Admin UI: "Link column to config table" — wybiera Main Table column + lookup type (Dropdown/Cascade/Validation)
3. System auto-generuje cascade rules (rule engine DSL) + UI refresh
4. Zero developer involvement

**Ten gap jest kluczowym value-add Monopilot vs Excel v7.**

**Marker:** Pattern rozszerzenia = `[EVOLVING]` dopóki Monopilot nie zaimplementuje full schema-driven extension. Dziś reality = manual multi-step edit.

---

## §12 — HANDOFF (pending propagation Session B)

**Moduły Monopilot do update:**

- `01-settings/` lub równoważny (Phase C) — **Admin UI Settings**: add/edit/reorder each of 8 config tables. Schema-driven extension pattern (§11). Seed values z tego dokumentu per Forza org.
- `09-npd/` (Phase B adresat #1) — NPD stories cross-reference reference tables (np. story "Pick Pack_Size" cross-refs §3, story "Select Line" cross-refs §4).
- `02-products/` + `10-commercial/` + `12-production/` itp. (Phase C) — per module słupek który config tables są kluczowe (np. Production → PackSizes + Lines + Dieset + Templates + Processes).
- `04-integrations/email/` lub `20-notifications/` (Phase C) — EmailConfig pattern + triggers dla auto-email.

---

## §13 — Open questions Phase B

1. **Monopilot admin UI scope** — pełny CRUD dla config tables albo uproszczone "add row" (kolumn już defined). Scope decyzja Phase B (09-npd) vs Phase C (01-settings).
2. **Allergens table schema** — full design w EVOLVING.md §2.
3. **Material consumption schema** — full design w EVOLVING.md §3.
4. **Multi-language config tables** — np. `Reference.Processes` ma Process_Name="Strip" (English). Inne orgi mogą chcieć "Plasterowanie" (PL). Phase B: decyzja czy multi-language lookup key lub separate tables.
5. **Email template versioning** — gdy subject/body zmieni się, czy trzymać historię starych maili? Audit trail ADR-008 podpowiada tak.
6. **CloseConfirm expansion** — czy Monopilot idzie na proste "Closed/Open" albo na approval chain state machine (Draft→Review→Approved→Closed)?

---

## §14 — Related

- [`MAIN-TABLE-SCHEMA.md`](./MAIN-TABLE-SCHEMA.md) — Reference.DeptColumns full (§2 this doc refers)
- [`CASCADING-RULES.md`](./CASCADING-RULES.md) — cascade uses PackSizes + Lines_By_PackSize + Dieset_By_Line_Pack + Processes + Templates
- [`WORKFLOW-RULES.md`](./WORKFLOW-RULES.md) — autofilter uses CloseConfirm, status colors, hard-lock uses Blocking_Rules from DeptColumns
- [`D365-INTEGRATION.md`](./D365-INTEGRATION.md) — D365 Builder output (siostrzany doc Session 3)
- [`EVOLVING.md`](./EVOLVING.md) — nowe tabele planowane: Allergens, Dieset_Material_Consumption
- [`_foundation/META-MODEL.md`](../../../_foundation/META-MODEL.md) §1 (Level "a" schema-driven domain)
- [`_foundation/decisions/ADR-028-schema-driven-column-definition.md`](../../../_foundation/decisions/ADR-028-schema-driven-column-definition.md) + ADR-030 (departments) dla analogiczny pattern
- Reality files:
  - `C:\Users\MaKrawczyk\PLD\v7\Smart_PLD_v7.xlsm` → sheet `Reference`
  - `C:\Users\MaKrawczyk\PLD\v7\vba\M01_Config.bas` (FindTableStartRow, GetDeptColumns, GetColumnDataType, ...)
  - `C:\Users\MaKrawczyk\PLD\v7\vba\M02_RefreshDeptView.bas` (BuildSimpleList, BuildFilteredLineList, ApplyDropdown)
  - `C:\Users\MaKrawczyk\PLD\v7\vba\M04_Cascade.bas` (LookupDieset, LookupProcessSuffix, ApplyTemplate)
  - `C:\Users\MaKrawczyk\PLD\v7\vba\M09_Email.bas` (SendToDept uses EmailConfig)

---
doc_version: 0.1.0
source_version: Smart_PLD_v7.xlsm@2026-04-17-0728
last_sync: 2026-04-17
sync_status: needs_review
propagated_to: []
---

# MAIN-TABLE-SCHEMA — 69 kolumn Smart PLD v7

**Reality source:** `C:\Users\MaKrawczyk\PLD\v7\Smart_PLD_v7.xlsm` → sheet `Main Table` (row 3 headers, row 4+ data)
**Phase:** A Session 2 (capture)
**Related:** [`PROCESS-OVERVIEW.md`](./PROCESS-OVERVIEW.md), [`DEPARTMENTS.md`](./DEPARTMENTS.md), [`CASCADING-RULES.md`](./CASCADING-RULES.md), [`WORKFLOW-RULES.md`](./WORKFLOW-RULES.md), [`_foundation/META-MODEL.md`](../../../_foundation/META-MODEL.md), [`_foundation/decisions/ADR-028-schema-driven-column-definition.md`](../../../_foundation/decisions/ADR-028-schema-driven-column-definition.md)

---

## Purpose

Pełna mapa 69 kolumn Main Table ze schematem metadanych: **typ / owner / blocking rule / required / dropdown source / default / dependencies**. Wszystkie metadane dla kolumn dept-owned żyją już **jako dane** w `Reference.DeptColumns` (6-kolumnowa tabela config) — jest to **faktyczna implementacja ADR-028 (schema-driven column definition)** w Excel VBA. System columns (auto-calc) są poza Reference, zarządzane przez VBA (M07_Dashboard, M03_WriteBack).

Ten dokument jest input-em dla:
- **Phase B** (moduł 09-NPD) — propagacja Main Table schema do NPD stories + PRD + schema-driven columns UI design
- **Phase C** (modules 02/11/12/13/14/15) — per-dept column scoping (Planning/Commercial/Production/Technical/MRP/Procurement)
- **Phase D** (MONOPILOT-V2-ARCHITECTURE) — decyzja schema-driven vs code-driven per kolumna (§3)

---

## §1 — Struktura fizyczna w Excel

```
Row 1  →  "FORZA FOODS - Main Table (master data)"        (tytuł workbooku, merged cell)
Row 2  →  section labels na wybranych kolumnach:
           C1=CORE · C9=PLANNING · C13=COMMERCIAL ·
           C21=PRODUCTION · C40=TECHNICAL · C42=MRP ·
           C55=PROCUREMENT · C60=SYSTEM
Row 3  →  column headers (69 kolumn)                       ← MT_HEADER_ROW = 3
Row 4+ →  dane (1 wiersz = 1 FA)                           ← MT_DATA_START = 4
```

**VBA constants (M01_Config.bas):**
- `MT_SHEET = "Main Table"`
- `MT_HEADER_ROW = 3`
- `MT_DATA_START = 4`

### 1.1 Odkrycie wersji sesji

Memory wspominało "Main Table ~60-80 kolumn". Reality: **dokładnie 69 kolumn** po row 3 scan.

Rozkład:
- 1 kolumna FA_Code (PK)
- 58 dept-owned (sum z DEPARTMENTS.md §3: 7+4+8+19+2+13+5 = 58)
- 10 SYSTEM cols (auto-calc — Done flags, Status_Overall, Days_To_Launch, Built)

---

## §2 — Reference.DeptColumns (faktyczna schema-driven metadata)

Tabela config znajdująca się w `Reference` sheet, rozpoczyna się od row 1 ("TABLE: DeptColumns") z header w row 2, data od row 3.

| Kolumna Reference | Znaczenie |
|---|---|
| `Column_Name` | Nazwa kolumny w Main Table (primary key) |
| `Dept` | Owner department (Core/Planning/Commercial/Production/Technical/MRP/Procurement) |
| `Data_Type` | Text / Number / Date / Dropdown / Auto (5 typów) |
| `Dropdown_Source` | (jeśli Dropdown) — nazwa innej tabeli w `Reference` (PackSizes / Templates / Lines_By_PackSize / Processes / CloseConfirm) |
| `Blocking_Rule` | Hard-lock prereq: `""` (brak), `Core done`, `Pack_Size filled`, `Line filled`, `Core + Production done` |
| `Required_For_Done` | Yes / No — czy kolumna jest required żeby dept był "ready to close" |

**Marker:**
- Struktura tabeli `DeptColumns` (6 kolumn metadata) = `[UNIVERSAL]` — to jest realizacja ADR-028 pattern, każda firma powinna mieć te same metadata dimensions
- Konkretne wiersze (58 mapowanych kolumn Forza) = `[FORZA-CONFIG]`
- Reguły blokujące (`Core done`, `Pack_Size filled`, `Line filled`, `Core + Production done`) — mechanizm = `[UNIVERSAL]` (rule engine Level "b", ADR-029), konkretne wartości = `[FORZA-CONFIG]`
- Data types (Text/Number/Date/Dropdown/Auto) = `[UNIVERSAL]` (5 typów to universal food-mfg MES)
- `Required_For_Done` semantyka (flag = required dla done) = `[UNIVERSAL]`

### 2.1 Blocking_Rule mechanika

VBA (`M01.IsBlockingMet`) interpretuje Blocking_Rule string:

| Blocking_Rule | Warunek do unlock |
|---|---|
| `""` (pusty) | Zawsze unlocked |
| `Core done` | `IsAllRequiredFilled("Core", mtRow)` = wszystkie required Core cols (5) wypełnione |
| `Pack_Size filled` | `Pack_Size` col w Main Table nie-pusta |
| `Line filled` | `Line` col w Main Table nie-pusta |
| `Core + Production done` | `IsAllRequiredFilled("Core") AND IsProdDetailComplete(mtRow)` |

Dla proxy dept tab: gdy cell blocked → **gray bg #D0D0D0 + locked**. Gdy unblocked → white bg + unlocked + dropdown (jeśli ma).

### 2.2 Required_For_Done semantyka

VBA (`M01.GetDeptRequiredColumns`, `M01.IsAllRequiredFilled`) zbiera listę required cols per dept i sprawdza czy wszystkie wypełnione. Napędza:
- Row status color GREEN "Ready to Close" (M02.ApplyRowStatus)
- Dashboard BuildMissingDataText (M07) — lista brakujących pól per FA
- Validation Status V05-<Dept> (M10.RunValidation)

Kolumna `Closed_<Dept>` (dropdown "Yes") oraz `PR_Code_*` (Auto) oraz `RM_Code` (Auto) **nie są** Required_For_Done — są meta-pola lub auto-generated.

---

## §3 — 69 kolumn — pełna mapa

### 3.1 CORE (C1–C8, 8 cols z FA_Code)

| C# | Column_Name | Data_Type | Dropdown_Source | Blocking_Rule | Required_For_Done | Marker | Notes |
|---|---|---|---|---|---|---|---|
| 1 | `FA_Code` | Text | — | — | — (PK) | `[UNIVERSAL]` | Format: musi zaczynać się `FA*` (V01 validation). Naturalny klucz. **Brakuje w Reference.DeptColumns** — żyje poza config-table, generowany przez `M11_AddProduct` |
| 2 | `Product_Name` | Text | — | `""` | **Yes** | `[UNIVERSAL]` (każdy produkt ma nazwę) + `[FORZA-CONFIG]` (format) | V02 validation |
| 3 | `Pack_Size` | Dropdown | `PackSizes` | `""` | **Yes** | `[FORZA-CONFIG]` | V03 validation. **Cascade trigger** → clears Line, Dieset (M04). Values: `20x30cm / 25x35cm / 18x24cm / 30x40cm / 15x20cm` |
| 4 | `Number_of_Cases` | Number | — | `""` | **Yes** | `[FORZA-CONFIG]` | Ilość cases na **jednej palecie** (palletizing) |
| 5 | `Finish_Meat` | Text | — | `""` | **Yes** | `[FORZA-CONFIG]` | Comma-separated PR codes komponentów (np. `PR123H, PR345A`). **Cascade trigger** → auto-build RM_Code + SyncProdDetailRows (M04) |
| 6 | `RM_Code` | Auto | — | `""` | No | `[FORZA-CONFIG]` | Auto z Finish_Meat (M04): konwersja `PR<digits><letter>` → `RM<digits>`, comma-sep. Np. `PR123H, PR345A` → `RM123, RM345` |
| 7 | `Template` | Dropdown | `Templates` | `""` | No | `[FORZA-CONFIG]` | 4 values: `Standard Meat FA / Simple Pack FA / Roasting Chicken / Full Process FA`. **Cascade trigger** → ApplyTemplate wypełnia Process_1..4 **w ProdDetail** (nie Main Table) |
| 8 | `Closed_Core` | Dropdown | `CloseConfirm` | `""` | No | `[UNIVERSAL]` (pattern) + `[FORZA-CONFIG]` (wartości) | Manual flag "Yes" gdy dept uznaje za skończone. Autofilter trigger w Core tab |

**Core summary:** 5 Required_For_Done (Product_Name, Pack_Size, Number_of_Cases, Finish_Meat — plus implicitly FA_Code jako PK). RM_Code + Template + Closed_Core = helpers.

### 3.2 PLANNING (C9–C12, 4 cols)

| C# | Column_Name | Data_Type | Dropdown_Source | Blocking_Rule | Required_For_Done | Marker |
|---|---|---|---|---|---|---|
| 9 | `Meat_Pct` | Number | — | `Core done` | **Yes** | `[FORZA-CONFIG]` |
| 10 | `Runs_Per_Week` | Number | — | `Core done` | **Yes** | `[FORZA-CONFIG]` |
| 11 | `Date_Code_Per_Week` | Text | — | `Core done` | **Yes** | `[FORZA-CONFIG]` |
| 12 | `Closed_Planning` | Dropdown | `CloseConfirm` | `Core done` | No | `[UNIVERSAL]` + `[FORZA-CONFIG]` |

**Planning summary:** 3 Required. Wszystkie blocked przez `Core done`. Nie ma cascade do innych cols.

**Evolving:** `Meat_Pct` rozważane do migracji do Core (pochodzi bezpośrednio z briefu `%`) — decyzja w Phase B.

### 3.3 COMMERCIAL (C13–C20, 8 cols)

| C# | Column_Name | Data_Type | Dropdown_Source | Blocking_Rule | Required_For_Done | Marker |
|---|---|---|---|---|---|---|
| 13 | `Launch_Date` | Date | — | `Core done` | **Yes** | `[UNIVERSAL]` (każdy produkt ma launch) + `[FORZA-CONFIG]` (format) |
| 14 | `Department_Number` | Text | — | `Core done` | **Yes** | `[FORZA-CONFIG]` (retailer-specific) |
| 15 | `Article_Number` | Text | — | `Core done` | **Yes** | `[FORZA-CONFIG]` (klient-specific) |
| 16 | `Bar_Codes` | Text | — | `Core done` | **Yes** | `[UNIVERSAL]` (GS1 standard) + `[FORZA-CONFIG]` (values) |
| 17 | `Cases_Per_Week_W1` | Number | — | `Core done` | **Yes** | `[FORZA-CONFIG]` |
| 18 | `Cases_Per_Week_W2` | Number | — | `Core done` | **Yes** | `[FORZA-CONFIG]` |
| 19 | `Cases_Per_Week_W3` | Number | — | `Core done` | **Yes** | `[FORZA-CONFIG]` |
| 20 | `Closed_Commercial` | Dropdown | `CloseConfirm` | `Core done` | No | `[UNIVERSAL]` + `[FORZA-CONFIG]` |

**Commercial summary:** 7 Required. Blocked przez `Core done`. `Launch_Date` napędza Dashboard alerts (Days_To_Launch calc).

### 3.4 PRODUCTION (C21–C39, 19 cols) `[FORZA-CONFIG]` + multi-component note

| C# | Column_Name | Data_Type | Dropdown_Source | Blocking_Rule | Required_For_Done | Notes |
|---|---|---|---|---|---|---|
| 21 | `Process_1` | Dropdown | `Processes` | `Pack_Size filled` | No | Cascade: → PR_Code_P1 (auto from Processes.Suffix) |
| 22 | `Yield_P1` | Number | — | `Pack_Size filled` | No | |
| 23 | `Process_2` | Dropdown | `Processes` | `Pack_Size filled` | No | |
| 24 | `Yield_P2` | Number | — | `Pack_Size filled` | No | |
| 25 | `Process_3` | Dropdown | `Processes` | `Pack_Size filled` | No | |
| 26 | `Yield_P3` | Number | — | `Pack_Size filled` | No | |
| 27 | `Process_4` | Dropdown | `Processes` | `Pack_Size filled` | No | |
| 28 | `Yield_P4` | Number | — | `Pack_Size filled` | No | |
| 29 | `Line` | Dropdown | `Lines_By_PackSize` (filtrowane) | `Pack_Size filled` | **Yes** | Cascade: → Dieset (auto). Filtered dropdown per Pack_Size |
| 30 | `Dieset` | Auto | `Dieset_By_Line_Pack` | `Line filled` | **Yes** | Auto-lookup z Reference. Locked cell, green bg |
| 31 | `Yield_Line` | Number | — | `Line filled` | **Yes** | |
| 32 | `Staffing` | Text | — | `Line filled` | No | |
| 33 | `Rate` | Number | — | `Line filled` | **Yes** | |
| 34 | `PR_Code_P1` | Auto | — | `""` | No | Auto z Process_1 (M04): suffix lookup z Processes. Locked, green bg |
| 35 | `PR_Code_P2` | Auto | — | `""` | No | |
| 36 | `PR_Code_P3` | Auto | — | `""` | No | |
| 37 | `PR_Code_P4` | Auto | — | `""` | No | |
| 38 | `PR_Code_Final` | Auto | — | `""` | No | Format: `PR<RM_digits><last_process_suffix>`. Cascade: RecalcPRCodeFinal. V06 validation (MISMATCH warning jeśli Finish_Meat suffix ≠ last process suffix) |
| 39 | `Closed_Production` | Dropdown | `CloseConfirm` | `Pack_Size filled` | No | |

**Production summary:** 5 Required_For_Done (Line, Dieset, Yield_Line, Rate + pattern "has at least 1 process"). Wszystko blocked przez `Pack_Size filled`, a niektóre `Line filled`.

### 3.4.1 Multi-component note `[EVOLVING]`

**Production jest N:1 z FA przez hidden `ProdDetail` tab.** VBA aktywnie używa ProdDetail:
- `SyncProdDetailRows` — tworzy 1 wiersz w ProdDetail per PR_Code w Finish_Meat (multi-component FA)
- `RenderProductionView` w `M02_RefreshDeptView` — pokazuje multi-row view w Production dept tab z ProdDetail
- `ApplyTemplate` — wypełnia Process_1..4 **w ProdDetail**, nie Main Table
- `IsProdDetailComplete` — sprawdza wszystkie wiersze ProdDetail dla FA (blocker dla MRP)

**Source of truth:** Main Table (per user). Oznacza to że Main Table Process_1..4 / Line / Dieset / PR_Code_Final są primary. ProdDetail jest **per-component rozszerzenie** dla multi-component scenariuszy.

**Open questions (do doprecyzowania w Phase B):**
- Gdy FA ma multi-component Finish_Meat — co jest w Main Table Process_1..4? Primary component? Summary? Pusty gdy ProdDetail ma wartości?
- Czy ProdDetail jest "active every day" czy tylko gdy multi-component?
- Czy Main Table ma być kanoniczna (single set) + ProdDetail hidden legacy (do usunięcia), czy Main Table aggregate + ProdDetail per-component (obie aktywne)?

Marker: `[EVOLVING]` na całym multi-component mechanism — dopóki semantyka Main Table vs ProdDetail nie jest twardo zdefiniowana.

### 3.4.2 Reference.Processes (dropdown source dla Process_1..4)

8 values z suffixami:

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

**Uwaga:** brak suffixu `D` — prawdopodobnie zarezerwowane (do potwierdzenia).

Marker: `[EVOLVING]` + `[FORZA-CONFIG]` — zestaw ruchomy, edytowalny w Settings (ADR-028 schema-driven). Nowe procesy pojawią się w miarę rozszerzenia scope Forza.

### 3.5 TECHNICAL (C40–C41, 2 cols)

| C# | Column_Name | Data_Type | Dropdown_Source | Blocking_Rule | Required_For_Done | Marker |
|---|---|---|---|---|---|---|
| 40 | `Shelf_Life` | Text | — | `Core done` | **Yes** | `[UNIVERSAL]` (food-mfg regulatoryjne) + `[FORZA-CONFIG]` (format) |
| 41 | `Closed_Technical` | Dropdown | `CloseConfirm` | `Core done` | No | `[UNIVERSAL]` + `[FORZA-CONFIG]` |

**Technical summary:** 1 Required (Shelf_Life). Minimalny zakres dziś.

**Evolving (do dodania, Session 3 EVOLVING.md + Phase B):**
- `Allergens` (Text/multi-value) — lista alergenów produktu, **cascade z RM_Code** (jeśli RM zawiera alergen → dziedziczenie do FA). Pattern `[UNIVERSAL]` (food-mfg EU), Reference.Allergens seed = EU14 `[FORZA-CONFIG]`
- Inne Quality cols (HACCP, nutritional, regulatory certs) — poza scope v7, potencjalne future

### 3.6 MRP (C42–C54, 13 cols)

| C# | Column_Name | Data_Type | Blocking_Rule | Required_For_Done | Notes |
|---|---|---|---|---|---|
| 42 | `Box` | Text | `Core + Production done` | **Yes** | Packaging primary box code. D365 material validation (M05) |
| 43 | `Top_Label` | Text | `Core + Production done` | **Yes** | Comma-separated dozwolone. D365 validated |
| 44 | `Bottom_Label` | Text | `Core + Production done` | No | D365 validated |
| 45 | `Web` | Text | `Core + Production done` | No | Film/tray/bag code (np. FTRA061, FFLM1501). D365 validated |
| 46 | `MRP_Box` | Text | `Core + Production done` | **Yes** | MRP confirmation box |
| 47 | `MRP_Labels` | Text | `Core + Production done` | **Yes** | |
| 48 | `MRP_Films` | Text | `Core + Production done` | **Yes** | |
| 49 | `MRP_Sleeves` | Text | `Core + Production done` | No | |
| 50 | `MRP_Cartons` | Text | `Core + Production done` | No | |
| 51 | `Tara_Weight` | Number | `Core + Production done` | **Yes** | |
| 52 | `Pallet_Stacking_Plan` | Text | `Core + Production done` | **Yes** | |
| 53 | `Box_Dimensions` | Text | `Core + Production done` | **Yes** | |
| 54 | `Closed_MRP` | Dropdown (CloseConfirm) | `Core + Production done` | No | |

**MRP summary:** 8 Required. Wszystko blocked przez `Core + Production done` — najbardziej restrykcyjny blocker (wymaga Core done AND Production component done).

**D365 Material validation:** 4 cols (Box, Top_Label, Bottom_Label, Web) + Core's Finish_Meat + Core's RM_Code są walidowane przeciwko D365 Import tab — status Found (green) / NoCost (yellow) / Missing (red) z komentarzem komórki. Zobacz `D365-INTEGRATION.md` Session 3.

### 3.7 PROCUREMENT (C55–C59, 5 cols)

| C# | Column_Name | Data_Type | Blocking_Rule | Required_For_Done | Marker |
|---|---|---|---|---|---|
| 55 | `Price` | Number | `Core done` | **Yes** | `[FORZA-CONFIG]` (waluta, decimal format) |
| 56 | `Lead_Time` | Number | `Core done` | **Yes** | `[FORZA-CONFIG]` (jednostka: dni) |
| 57 | `Supplier` | Text | `Core done` | **Yes** | `[FORZA-CONFIG]` |
| 58 | `Proc_Shelf_Life` | Number | `Core done` | **Yes** | Różny od Technical.Shelf_Life — to per-supplier |
| 59 | `Closed_Procurement` | Dropdown (CloseConfirm) | `Core done` | No | |

**Procurement summary:** 4 Required. Blocking = `Core done` (nie `Core + Production done`!). To potwierdza DEPARTMENTS §3.7: Procurement może wybierać `Supplier/Lead_Time/Proc_Shelf_Life` od razu po Closed_Core, tylko `Price` czeka na components (ale **blocking rule w Reference** nie wyraża tego — `Price` ma `Core done`, nie `Core + Production done`).

**Konsekwencja `[EVOLVING]`:** Blocking_Rule dla `Price` w Reference mógłby być `Core + Production done` żeby wymusić timing. Dziś jest `Core done` — user może wypełnić Price wcześniej niezgodnie z business rule ("czeka na components"). To jest rzeczywiście reality (Procurement może być zdyscyplinowany ustnie, VBA nie enforce'uje). Do rozstrzygnięcia w Phase B: explicit rule vs miękka dyscyplina.

### 3.8 SYSTEM (C60–C69, 10 cols auto-calc)

Kolumny systemowe, poza `Reference.DeptColumns` — zarządzane przez VBA.

| C# | Column_Name | Data_Type | Source / Logic | Marker |
|---|---|---|---|---|
| 60 | `Done_Core` | Boolean (auto) | TBD — prawdopodobnie formula `=IF(Closed_Core="Yes",TRUE,FALSE)` albo VBA compute (nie zidentyfikowano explicit w M01-M11). Sample row 4 shows `False` | `[UNIVERSAL]` |
| 61 | `Done_Planning` | Boolean (auto) | (as above) | `[UNIVERSAL]` |
| 62 | `Done_Commercial` | Boolean (auto) | (as above) | `[UNIVERSAL]` |
| 63 | `Done_Production` | Boolean (auto) | (as above) | `[UNIVERSAL]` |
| 64 | `Done_Technical` | Boolean (auto) | (as above) | `[UNIVERSAL]` |
| 65 | `Done_MRP` | Boolean (auto) | (as above) | `[UNIVERSAL]` |
| 66 | `Done_Procurement` | Boolean (auto) | (as above) | `[UNIVERSAL]` |
| 67 | `Status_Overall` | Text (auto) | TBD — prawdopodobnie "Built" / "Ready" / "InProgress" / "Blocked". Sample row 4 empty | `[UNIVERSAL]` |
| 68 | `Days_To_Launch` | Number (auto) | TBD — prawdopodobnie `=Launch_Date - TODAY()`. Napędza Dashboard alerts RED/YELLOW/GREEN (M07) i row status RED ALERT (M02) | `[UNIVERSAL]` |
| 69 | `Built` | Boolean | **Manual set przez D365 Builder (M08)** + **Auto-reset FALSE przy każdej edycji dept tab cell (M03 WriteBack)** | `[LEGACY-D365]` (zniknie po D365 replacement) |

**Open questions (do doprecyzowania):**
- Dokładna logika `Done_<Dept>` — formula w Excel czy VBA compute? (M01.IsDeptDone zwraca based on Closed_<Dept>="Yes", to prawdopodobnie co ustawia Done_<Dept>)
- `Status_Overall` enum values
- `Days_To_Launch` formula w Excel (wyliczana on-the-fly) czy persistowana kolumna

### 3.9 Podsumowanie Required_For_Done per dept

| Dept | Cols | Required |
|---|---|---|
| Core | 8 (w tym FA_Code) | 5 (Product_Name, Pack_Size, Number_of_Cases, Finish_Meat — implicit FA_Code) |
| Planning | 4 | 3 (Meat_Pct, Runs_Per_Week, Date_Code_Per_Week) |
| Commercial | 8 | 7 (wszystko poza Closed_Commercial) |
| Production | 19 | 5 (Line, Dieset, Yield_Line, Rate + multi-component processes via ProdDetail) |
| Technical | 2 | 1 (Shelf_Life) |
| MRP | 13 | 8 (Box, Top_Label, MRP_Box, MRP_Labels, MRP_Films, Tara_Weight, Pallet_Stacking_Plan, Box_Dimensions) |
| Procurement | 5 | 4 (Price, Lead_Time, Supplier, Proc_Shelf_Life) |

**Total Required_For_Done: ~33** (z 58 dept-owned, ~57%). Reszta to Closed flags (7), Auto cols (RM_Code + PR_Code_* = 6), optional fields (12).

---

## §4 — Schema-driven implementation check vs ADR-028

ADR-028 postuluje: "kolumny tabel głównych + ich metadata to Level "a" (schema-driven, edytowalne w Settings bez dewelopera)".

**Forza v7 już to zrealizowała** w Excel:

| ADR-028 wymaganie | v7 Excel implementacja |
|---|---|
| Kolumny jako dane, nie kod | `Reference.DeptColumns` tabela — `[UNIVERSAL]` pattern |
| Metadata per kolumna: label, type, required, owner dept, validation | 5 z 6 (brakuje tylko "default" + explicit "validation beyond dropdown") |
| Admin może dodać kolumnę z UI | **Nie** — dziś dodanie kolumny wymaga: (1) edit Reference.DeptColumns + (2) dodać kolumnę do Main Table + (3) update VBA constants jeśli hard-code. Brak pełnej UI. |
| Silnik renderu czyta metadata i generuje UI | **Tak** — `M02_RefreshDeptView` czyta Reference.DeptColumns i dynamicznie buduje proxy tab: value, blocked/unlocked, dropdown, auto-lock dla Auto type, row status color |

**Wniosek:** v7 jest `[EVOLVING]` w stronę schema-driven. Silnik renderu już działa w pełni schema-driven. Brakuje:
1. UI Settings do add/edit kolumn (dziś manual edit Reference sheet)
2. Automatyczny resize Main Table gdy dodana kolumna
3. Update system cols (Done_<Dept>) gdy nowy dept albo kolumna

W Monopilot implementacji wszystkie 3 luki muszą być zamknięte (to jest value-add vs Excel). Meta-model §1 Level "a" full realization.

### 4.1 Co jeszcze jest w Main Table, a nie w Reference.DeptColumns

- `FA_Code` (C1) — PK, **poza** Reference. Generowany przez `M11_AddProduct` (format validated V01: musi zaczynać się `FA`)
- 10 SYSTEM cols (C60-69) — auto-calc, **poza** Reference

**Konsekwencja ADR-028:** w Monopilot schema-driven approach, FA_Code jako PK musi być "hard-wired" (nie user-editable column), a SYSTEM cols są **computed views** (nie stored columns) albo persisted computed. Decyzja Phase D.

---

## §5 — Walidacje (M10_Validation)

Silnik walidacji czyta Main Table + Reference.DeptColumns i wypisuje wyniki do `Validation Status` tab. Rule IDs:

| Rule | Opis | Source |
|---|---|---|
| V01 | FA Code format (musi zaczynać `FA*`) | hardcoded w M10 |
| V02 | Product_Name non-empty | hardcoded |
| V03 | Pack_Size non-empty | hardcoded |
| V04 | D365 Material Codes (Box/Top_Label/Bottom_Label/Web/Finish_Meat/RM_Code) | M05_D365Validate |
| V05-<Dept> | Dept Complete (Closed_<Dept>="Yes") | M01.IsDeptDone |
| V06 | Finish_Meat suffix vs last process suffix — MUST match | hardcoded |

**Statuses:** PASS (green #C0FFC0) / FAIL (red #C0C0FF) / PENDING (yellow #C0FFFF) / CHECK (light yellow #FFFFC0).

Rule engine jest dziś hardcoded w VBA. W Monopilot (ADR-029 rule engine DSL) reguły walidacji powinny być **danymi** (Level "a" lub "b" rule engine definitions), nie kodem. Scope: V01-V06 to `[EVOLVING]` → docelowe `[UNIVERSAL]` (pattern) + `[FORZA-CONFIG]` (konkretne reguły).

---

## §6 — HANDOFF (pending propagation do Session B — Phase B/C)

**Moduły Monopilot do update:**

- `09-npd/` (Phase B adresat #1) — NPD module stories reference Main Table schema. Cross-walk: czy dziesiątki wymagań NPD stories mapują 1:1 do 58 dept-owned + 10 system = 68 kolumn? Backlog identyfikacji luk.
- `02-products/` — Core schema (8 cols) mapowanie na products table + schema-driven extension pattern
- `11-planning/` / `10-commercial/` / `12-production/` / `13-quality/` / `14-procurement/` / `15-mrp/` (Phase C) — per dept cols → per module
- `04-integrations/d365/` — D365 material validation (V04) + D365 Builder inputs (Phase C)

**Nowy reality source do dodania (Session 3 + post-Phase A):**
- `brief-excels/BRIEF-FLOW.md` — brief 37 cols + mapping brief ↔ Main Table (PROCESS-OVERVIEW §2.3 initial draft)

---

## §7 — Open questions do Phase B

1. **Multi-component semantyka** — Main Table Process_1..4 vs ProdDetail per-component (§3.4.1)
2. **Done_<Dept> logic** — Excel formula czy VBA compute? (§3.8)
3. **Status_Overall enum values** — jakie konkretne values (§3.8)
4. **Days_To_Launch** — persisted column czy computed on-the-fly (§3.8)
5. **FA_Code generation rule** — format po "FA" (prefix + co dalej? data? kolejny numer? Department code?) — do doprecyzowania z `M11_AddProduct.bas` (Session 3 lub inne sesje)
6. **Price blocking rule** — `Core done` (dziś) vs `Core + Production done` (business rule) (§3.7)
7. **Brief field mapping** — pełna mapa brief 37 cols → Main Table + co pozostaje w brief only
8. **Allergens schema** — nowa kolumna w Technical + Reference.Allergens (dziś nie istnieje)
9. **Technical rozszerzenie** — HACCP, nutritional, regulatory certs — scope future
10. **Dieset → material consumption (m/each folii)** — nowa tabela `Reference.Dieset_Material_Consumption`?

---

## §8 — Related

- [`PROCESS-OVERVIEW.md`](./PROCESS-OVERVIEW.md) — end-to-end flow + stage semantics
- [`DEPARTMENTS.md`](./DEPARTMENTS.md) — dept roles + handoffs
- [`CASCADING-RULES.md`](./CASCADING-RULES.md) — Pack_Size → Line → Dieset + PR_Code_Final generation
- [`WORKFLOW-RULES.md`](./WORKFLOW-RULES.md) — status colors, autofilter, hard-lock mechanism
- [`_foundation/META-MODEL.md`](../../../_foundation/META-MODEL.md) §1 (Level "a" schema-driven), §2 (Level "b" rule engine)
- [`_foundation/decisions/ADR-028-schema-driven-column-definition.md`](../../../_foundation/decisions/ADR-028-schema-driven-column-definition.md) — Reference.DeptColumns already realizes this pattern
- [`_foundation/decisions/ADR-029-rule-engine-dsl-and-workflow-as-data.md`](../../../_foundation/decisions/ADR-029-rule-engine-dsl-and-workflow-as-data.md) — blocking rules są mini DSL (4 hardcoded rules dziś)
- Reality files:
  - `C:\Users\MaKrawczyk\PLD\v7\Smart_PLD_v7.xlsm` (workbook — 69 cols confirmed)
  - `C:\Users\MaKrawczyk\PLD\v7\vba\M01_Config.bas` (GetDeptColumns, GetColumnDataType, GetColumnBlockingRule, GetColumnDropdownSource, IsAllRequiredFilled, IsBlockingMet, IsDeptDone)
  - `C:\Users\MaKrawczyk\PLD\v7\vba\M02_RefreshDeptView.bas` (schema-driven renderer)
  - `C:\Users\MaKrawczyk\PLD\v7\vba\M04_Cascade.bas` (cascades)
  - `C:\Users\MaKrawczyk\PLD\v7\vba\M10_Validation.bas` (V01-V06 rules)
  - `C:\Users\MaKrawczyk\PLD\v7\vba\M05_D365Validate.bas` (V04 D365 material check)

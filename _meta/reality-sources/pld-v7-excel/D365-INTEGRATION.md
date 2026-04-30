---
doc_version: 0.1.0
source_version: Smart_PLD_v7.xlsm@2026-04-17-0728 + Builder_FA5101.xlsx@reference
last_sync: 2026-04-17
sync_status: needs_review
propagated_to: []
---

# D365-INTEGRATION — Import + Builder + Validation (all `[LEGACY-D365]`)

**Reality sources:**
- `C:\Users\MaKrawczyk\PLD\v7\Smart_PLD_v7.xlsm` → `D365 Import` + 8 `D365_*` output tabs
- `C:\Users\MaKrawczyk\OneDrive - IPL LIMITED\Desktop\PLD\Builder_FA5101.xlsx` — **reference dla docelowego output** (7 tabów z production data — FA5101 Test Pork Slices 300g)
- VBA: `M05_D365Validate.bas`, `M08_Builder.bas`, `M06_BOMAutoGen.bas`

**Phase:** A Session 3 (capture)
**Related:** [`MAIN-TABLE-SCHEMA.md`](./MAIN-TABLE-SCHEMA.md), [`WORKFLOW-RULES.md`](./WORKFLOW-RULES.md), [`_foundation/META-MODEL.md`](../../../_foundation/META-MODEL.md) §5, [`EVOLVING.md`](./EVOLVING.md)

---

## Purpose

Dokument kodyfikuje **3 aspekty D365 integration** w Smart PLD v7, wszystkie oznaczone markerem `[LEGACY-D365]` (istnieją tylko dopóki D365 jest live-ym ERP):

1. **D365 Import** — paste release product list z D365 → validation FA cells przeciwko tej liście
2. **D365 Builder** — generation 8 output tabs + paste-back manualny do D365
3. **V04 Material Validation** — per-cell color coding (Found/NoCost/Missing)

Wszystkie 3 aspekty znikają gdy Monopilot zastąpi D365 (ADR-031 + META-MODEL §5). W międzyczasie — **dual maintenance ~12 miesięcy**, Monopilot musi replikować Builder funkcjonalność.

---

## §1 — D365 Import workflow

### 1.1 Schema D365 Import tab

**Sheet:** `D365 Import`
**Position:** 2r x 6c (pusty dziś)
**Columns (row 2 headers):** Item_Code | Item_Name | Price | Supplier | Lead_Time | M_Code

### 1.2 Paste workflow

**Step 1 — Export z D365:** Jane (lub osoba odpowiedzialna za ten Excel) eksportuje z D365 **release product list** — wszystkie items już zatwierdzone w D365 z ich atrybutami.

**Step 2 — Paste do PLD v7:** Otwiera `D365 Import` tab → paste data starting row 3 (row 1 = title, row 2 = headers). Dane zastępują poprzednie (albo append, w zależności od user workflow).

**Step 3 — Automatic validation:** Gdy user wypełni FA cells w Main Table z codes w kolumnach Box / Top_Label / Bottom_Label / Web / Finish_Meat / RM_Code, M10.RunValidation + M05.ValidateAllCodes porównuje każdy code przeciwko D365 Import tab i koloruje cell:
- **Found** (exists + price > 0) → 🟢 green `#C0FFC0`
- **NoCost** (exists + price empty/0) → 🟡 yellow `#C0FFFF` + comment "Price missing in D365"
- **Missing** (not found) → 🔴 red `#C0C0FF` + comment "Material not in D365 - request creation"

### 1.3 Purpose D365 Import

**Dlaczego PLD needs D365 item list?** Każde FA_Code w PLD używa materiałów (Box, Labels, Web, Meat) które muszą istnieć w D365 jako Items. Gdy user wypełni w PLD `Box = "BX12345"`, system sprawdza czy `BX12345` istnieje w D365 Import. Jeśli nie — user dostaje red cell ze wskazówką "request creation" (zamów stworzenie item w D365 przed continuing).

**Bez D365 Import:** PLD nie wie czy codes są real. User mógłby wypełnić anything.

### 1.4 Reality constraint

D365 API dla Apex nie jest dostępne (lub nie skonfigurowane). Paste jest **manual**. Cadence: prawdopodobnie po każdej istotnej zmianie w D365 (nowe materiały added), minimum raz w tygodniu.

**Zaletą ustawienia:** PLD zawsze referuje do snapshotu D365 z konkretnej daty. Disadvantage: out-of-sync gdy D365 zmieni się w międzyczasie.

### 1.5 CheckSingleCode logic (M05.CheckSingleCode)

```
Loop all rows w D365 Import (row 2+):
  IF Item_Code (col 1) == searchCode:
    priceCol = FindD365Column("Price") (fallback col 3)
    priceVal = row[priceCol]
    IF priceVal empty OR 0:
      return "NoCost"
    ELSE:
      return "Found"
  End
End
return "Missing"
```

**Edge cases:**
- Code contains commas (e.g., Finish_Meat `"PR123H, PR345A"`) → M05.ValidateCodeAgainstD365 split by comma, validate each, return worst status (Missing > NoCost > Found)
- Empty cell → validation skipped (no color)

### 1.6 Marker

- D365 Import tab schema (6 cols: Item_Code/Item_Name/Price/Supplier/Lead_Time/M_Code) = `[LEGACY-D365]`
- Paste workflow = `[LEGACY-D365]`
- Validation Found/NoCost/Missing pattern generically = `[UNIVERSAL]` (validate-against-external-system pattern)
- Color scheme = `[APEX-CONFIG]`

**Monopilot trajectory:** D365 Import znika gdy Monopilot zastąpi D365 (same items now in Monopilot Items table). Validation becomes internal lookup. `integration.d365.enabled` feature flag hide'uje tab gdy `false`.

---

## §2 — D365 Builder (M08) — current state

### 2.1 Entry points

| Sub | Trigger | Scope |
|---|---|---|
| `BuildD365_Single(faCode)` | Button lub manual call | 1 FA (selected row) |
| `BuildD365_Bulk()` | Button | Wszystkie FA gdzie Status_Overall="Complete" AND Built=FALSE |

### 2.2 Gate logic

Single build (M08 lines 37-44):
```
IF Status_Overall != "Complete":
    MsgBox "Cannot build <FA> - not all departments complete."
    missing = BuildMissingDataText(mtRow) ← z M07
    Exit
```

Bulk build (M08 lines 84-87):
```
IF Status_Overall != "Complete": SKIP
IF Built == TRUE: SKIP (already built)
```

### 2.3 Output tabs (v7 current implementation) — **WIP, 3 z 8**

| Tab w Smart_PLD_v7 | Filled by M08? | Content (current) |
|---|---|---|
| `D365_Data` | ✅ | 4 cols: FA_Code / Product_Name / "BOM" / "Standard" (hardcoded strings) |
| `D365_Formula_Version` | ✅ | 3 cols + C8: "FRM-<FA_Code>" / FA_Code / "Formula for <FA_Code>" / "Yes" (col 8) |
| `D365_Formula_Lines` | ❌ not yet | (empty — WIP) |
| `D365_Route_Headers` | ✅ | 4 cols: "RT-<FA_Code>" / "Route for <FA_Code>" / FA_Code / "Yes" |
| `D365_Route_Versions` | ❌ not yet | (empty — WIP) |
| `D365_Route_Operations` | ❌ not yet | (empty — WIP) |
| `D365_Route_OpProperties` | ❌ not yet | (empty — WIP) |
| `D365_Resource_Req` | ❌ not yet | (empty — WIP) |

**Status:** M08 jest w trakcie implementacji. Dziś buduje 3 tabów z minimalnym content (hardcoded placeholders). Pozostałe 5 są puste.

**User potwierdzenie (Session 3):** Wszystkie 8 tabów będzie wypełnianych docelowo. Reference docelowy = `Builder_FA5101.xlsx` (patrz §3).

### 2.4 Built flag lifecycle

Po successful build, M08 ustawia `Main Table.Built = TRUE`. Lifecycle: patrz WORKFLOW-RULES §7.1.

**Auto-reset na edit** (M03.DeptTab_WriteBack): Każda edycja non-Production cell resetuje Built=FALSE. **Bug potencjalny:** edycja ProdDetail (Production dept) NIE resetuje Built — do weryfikacji w Session B.

### 2.5 Brakuje integracji z BOM tab

M08 **nie wywołuje** `M06.GenerateBOM(mtRow)`. BOM tab jest generowany osobnym explicit call (button? manual Alt+F8?). **User confirmed Session 3:**

> "bom generator powinien miec swoj button ktory naciskamy jak zbiera on gotowe fa i buduje z nich buildery jeden po drogim albo wspolny z wypelnionymi kolumnami. odrebny plik excel."

Czyli **BOM jest osobnym feature'em** — zbiera gotowe FA i generuje Builder files jako **osobne pliki Excel** (nie tab w PLD). To jest inny niż M08 output tabs — M06 BOM może być **upstream dla M08 Builder** albo **alternative Builder output format**.

**Plan (do Phase B):** Clarify — czy M06 BOM + M08 Builder są:
- (a) Dwa osobne wyjścia (BOM = raw material summary, Builder = D365 format)
- (b) M06 input dla M08 (M06 generuje BOM rows, M08 czyta z BOM tab żeby build Formula_Lines)
- (c) Alternatywne formaty tej samej informacji (wybór per use-case)

Dziś M06 i M08 są ortogonalne — obie generują na podstawie Main Table cells bezpośrednio. BOM tab schema (FA_Code | Component_Type | Component_Code | Quantity | Process_Stage | Source | D365_Status) wygląda na **intermediate format** dla M08, ale M08 nie czyta z niego. Decyzja Phase B.

### 2.6 Marker M08

- D365 Builder feature ogólnie = `[LEGACY-D365]` (zniknie gdy Monopilot zastąpi D365)
- Single + Bulk modes = `[UNIVERSAL]` (pattern export operations)
- Gate `Status_Overall="Complete"` = `[UNIVERSAL]` (quality gate pattern)
- Output format D365-specific = `[LEGACY-D365]`
- Built flag + auto-reset = `[UNIVERSAL]` (staleness tracking) + `[LEGACY-D365]` (specifically dla D365 export)

---

## §3 — Docelowy Builder output (referencja: Builder_FA5101.xlsx)

Historycznie Apex miała Builder który produkował **osobny plik Excel per FA** (`Builder_FA<code>.xlsx`). Jest to **wzorzec docelowy** dla M08 implementacji.

### 3.1 Struktura Builder_FA5101.xlsx

**7 arkuszy** z pełną D365 import structure dla FA5101 "Test Pork Slices 300g":

| Sheet | Rows (data) | Cols | Rola D365 |
|---|---|---|---|
| `Formula_Version` | 1 | 17 | Formula header (1 per FA) |
| `Formula_Lines` | 2 | 29 | Formula ingredients (1 per RM/PM) |
| `Route_Headers` | 1 | 6 | Route header |
| `Route_Versions` | 1 | 10 | Route version info |
| `Route_Operations` | 1 | 8 | Route operation(s) |
| `Route_Operations&Properties` | 1 | 25 | Operations details (full props) |
| `Resource&Requirements` | 1 | 7 | Resource scheduling requirements |

**Brak** `D365_Data` tab (który jest w v7 workbook) — to jest addition v7. Możliwe że D365_Data w v7 to item master (FA_Code, Product_Name, type) i historyczne Builder output nie zawierał tego, bo item był już wcześniej zdefiniowany w D365.

**Docelowa struktura v7:** 8 tabów = 7 z Builder_FA5101 + 1 D365_Data. Nazwa `Route_OpProperties` w v7 = `Route_Operations&Properties` w historycznym (prefix ujednolicony).

### 3.2 Formula_Version — 17 cols (D365 schema)

| Col | Nazwa | FA5101 sample | Znaczenie |
|---|---|---|---|
| 1 | FORMULAID | `FA5101-L01` | Unique formula ID — format `<FA_Code>-L01` |
| 2 | MANUFACTUREDITEMNUMBER | `FA5101` | = FA_Code |
| 3 | PRODUCTIONSITEID | `FNOR` | Site code — **Apex North** (APEX-CONFIG) |
| 4 | FROMQUANTITY | `1` | Minimum formula quantity |
| 5 | VALIDFROMDATE | `1` | Date (D365 format — raw number) |
| 6 | ISACTIVE | `Yes` | Formula active flag |
| 7 | APPROVERPERSONNELNUMBER | `FOR100048` | Approver employee # — Apex personnel ID |
| 8 | CHANGEDDATE | *(empty)* | Last change date |
| 9 | FORMULABATCHSIZE | `1` | Batch size |
| 10 | FORMULABATCHSIZEMULTIPLES | `0` | Multiples allowed (0=no) |
| 11 | FORMULANAME | `Test Pork Slices 300g` | = Product_Name |
| 12 | FROMCATCHWEIGHTQUANTITY | `0` | Catch weight (for variable-weight products) |
| 13 | ISAPPROVED | `yes` | Formula approval status |
| 14 | ISCOPRODUCTQUANTITYVARIATI... | `no` | Co-product variation |
| 15 | ISTOTALCOSTALLOCATIONUSED | `no` | Cost allocation flag |
| 16 | WILLCOSTCALCULATIONINCLUDE... | `Yes` | Cost calc include (truncated col name) |
| 17 | YIELDPERCENTAGE | `95` | Overall yield % (map na Main Table Yield_Line albo combined P1..P4 yields) |

**Marker:** Format cols = `[LEGACY-D365]` (D365-specific). Values → mapping z Main Table `[APEX-CONFIG]`.

### 3.3 Formula_Lines — 29 cols (ingredient lines)

**Sample FA5101 ma 2 lines:**

| # | ITEMNUMBER | LINENUMBER | PRODUCTUNITSYMBOL | QUANTITY | LINETYPE | ROUTEOPERATIONNUMBER |
|---|---|---|---|---|---|---|
| 1 | `RM001` | 1 | KG | 330 | Item | 10 |
| 2 | `PM001` | 2 | pc | 1 | Item | 10 |

Common cols across all lines:
- FORMULAID = `FA5101-L01` (link do Formula_Version)
- CONSUMPTIONCALCULATIONMETHOD = `Formula0`
- CONSUMPTIONSITEID = `FNOR`
- CONSUMPTIONTYPE = `Variable`
- CONSUMPTIONWAREHOUSEID = `ApexDG`
- FLUSHINGPRINCIPLE = `Finish`

**Role:** Każdy RM (Raw Material) lub PM (Packaging Material) używany w FA = osobna linia. QUANTITY jest per batch (per batch=1).

**Mapping z Main Table → Formula_Lines:**

Dane w Main Table które muszą być rozbite na Formula_Lines:
- `Finish_Meat` comma-sep (np. `PR123H, PR345A`) → N linii z RM codes (RM123, RM345)
- `Box`, `Top_Label`, `Bottom_Label`, `Web`, `MRP_*` — każdy jako osobna linia PM

Quantities:
- RM: per batch w KG (do doprecyzowania jak liczyć z PLD)
- PM: typowo 1 per batch

**Marker:** Structure = `[LEGACY-D365]`. Mapping logic Main Table → Formula_Lines = `[LEGACY-D365]` (dziś) + `[UNIVERSAL]` pattern (każda ERP ma BOM structure).

### 3.4 Route_Headers — 6 cols (production route)

| Col | Nazwa | FA5101 sample |
|---|---|---|
| 1 | ROUTEID | `FA5101-L01` |
| 2 | APPROVERPERSONNELNUMBER | `FOR100048` |
| 3 | DISPLAYPRODUCTNUMBER | `FA5101` |
| 4 | ISAPPROVED | `Yes` |
| 5 | PRODUCTGROUPID | `FinGoods` |
| 6 | ROUTENAME | `FA5101-L01` |

**Role:** "Header" dla produkcyjnego route — identyfikator + approver + group.

**Marker:** `[LEGACY-D365]` format. `FinGoods` = Apex D365 product group code.

### 3.5 Route_Versions — 10 cols

| Col | Nazwa | FA5101 sample |
|---|---|---|
| 1 | VALIDFROMQUANTITY | `0` |
| 2 | VALIDFROMDATE | `1` |
| 3 | ROUTEID | `FA5101-L01` |
| 4 | PRODUCTIONSITEID | `FNOR` |
| 5 | ITEMNUMBER | `FA5101` |
| 6 | ISACTIVE | `Yes` |
| 7 | APPROVERPERSONNELNUMBER | `FOR100048` |
| 8 | ISAPPROVED | `Yes` |
| 9 | VALIDTODATE | `1` |
| 10 | VERSIONNAME | `FA5101-L01` |

**Role:** Versioning routes (D365 pozwala na multiple versions route).

### 3.6 Route_Operations — 8 cols

| Col | Nazwa | FA5101 sample |
|---|---|---|
| 1 | ROUTEID | `FA5101-L01` |
| 2 | OPERATIONNUMBER | `10` |
| 3 | OPERATIONPRIORITY | `Primary` |
| 4 | ACCUMULATEDSCRAPPERCENTAGE | `1` |
| 5 | NEXTOPERATIONLINKTYPE | `None` |
| 6 | NEXTROUTEOPERATIONNUMBER | `0` |
| 7 | OPERATIONID | `10` |
| 8 | SCRAPPERCENTAGE | `0` |

**Role:** Kolejność operacji produkcyjnych. Per FA typowo multiple rows (1 per Process_N w Main Table). FA5101 sample ma tylko 1 operation (OPERATIONNUMBER=10) — prawdopodobnie single-process produkt (Standard Meat FA template).

**Mapping z Main Table Process_1..4:**
- Process_1 → row with OPERATIONNUMBER=10
- Process_2 → row with OPERATIONNUMBER=20, NEXTROUTEOPERATIONNUMBER=... linking
- itd.

### 3.7 Route_Operations&Properties — 25 cols

**Operational details per operation.** Kluczowe fields:

| Col | Nazwa | FA5101 sample |
|---|---|---|
| 1 | OPERATIONID | `10` |
| 2 | ITEMNUMBER | `FA5101` |
| 3 | ROUTEID | `FA5101-L01` |
| 4 | PRODUCTIONSITEID | `FNOR` |
| 5 | PRODUCTGROUPID | *(empty)* |
| 6 | CONSUMPTIONCALCULATIONFACTOR | `1` |
| 7 | CONSUMPTIONCALCULATIONFORMULA | `Formula0` |
| 8 | COSTINGOPERATIONRESOURCEID | `FProd01` |
| 9 | DELAYNOTIFICATIONTHRESHOLD... | `0` |
| 10 | LOADPERCENTAGE | `100` |
| 11 | OPERATIONSTIMETOHOURCONVERSION | `1` |
| 12 | PROCESSCOSTCATEGORYID | `Production` |
| 13 | PROCESSQUANTITY | `999` |
| 14 | PROCESSTIME | `1` |
| 15 | QUANTITYCOSTCATEGORYID | `Production` |
| 16 | QUEUETIMEAFTER | `0` |
| 17 | QUEUETIMEBEFORE | `0` |
| 18 | RESOURCEQUANTITY | `1` |
| ... | (total 25 cols) | |

**Mapping z Main Table:**
- COSTINGOPERATIONRESOURCEID = `FProd01` (Apex Production 01?) — prawdopodobnie z Line
- PROCESSTIME może być z Rate
- LOADPERCENTAGE = 100 (hardcoded lub z Staffing?)

### 3.8 Resource&Requirements — 7 cols

| Col | Nazwa | FA5101 sample |
|---|---|---|
| 1 | ITEMNUMBER | `FA5101` |
| 2 | PRODUCTIONSITEID | `FNOR` |
| 3 | REQUIREDOPERATIONSRESOURCEID | `FProd01` |
| 4 | ROUTEID | `FA5101-L01` |
| 5 | ROUTEOPERATIONID | `10` |
| 6 | WILLJOBSCHEDULINGUSEREQUIR... | `Yes` |
| 7 | WILLOPERATIONSCHEDULINGUSE... | `No` |

**Role:** Link operation do specific production resource (machine/line).

### 3.9 Apex-specific constants zidentyfikowane w Builder_FA5101

Wartości które wyglądają na Apex-specific D365 config:

| Wartość | Kontekst | Znaczenie |
|---|---|---|
| `FNOR` | PRODUCTIONSITEID | Apex Production Site (prawdopodobnie "Apex North" albo kraj code) |
| `FOR100048` | APPROVERPERSONNELNUMBER | Personnel ID approver Apex |
| `ApexDG` | CONSUMPTIONWAREHOUSEID | Apex Warehouse code |
| `FinGoods` | PRODUCTGROUPID | Finished Goods group |
| `FProd01` | COSTINGOPERATIONRESOURCEID | Apex Production resource 01 |
| `Formula0` | CONSUMPTIONCALCULATIONMETHOD, CONSUMPTIONCALCULATIONFORMULA | Formula type code |
| `Production` | PROCESSCOSTCATEGORYID, QUANTITYCOSTCATEGORYID | Cost category |
| `Variable` | CONSUMPTIONTYPE | Variable vs fixed consumption |
| `Finish` | FLUSHINGPRINCIPLE | When materials are consumed (at finish vs start) |
| `Item` | LINETYPE | Item vs Formula vs Service |
| `Primary` | OPERATIONPRIORITY | Primary vs Secondary operation |
| `None` | NEXTOPERATIONLINKTYPE | Link do next operation (None = terminal) |

**Marker:** Wszystkie te wartości = `[LEGACY-D365]` (specific D365 configuration) + `[APEX-CONFIG]` (per-org values). Muszą być **konfiguracyjne w Monopilot D365 Builder settings** (nie hardcoded), bo inne firmy używają D365 z innymi site codes / group codes / personnel IDs.

### 3.10 Mapping Main Table → Builder output (high-level)

```
FA_Code                     → ITEMNUMBER, MANUFACTUREDITEMNUMBER, DISPLAYPRODUCTNUMBER
FA_Code + "-L01"            → FORMULAID, ROUTEID, ROUTENAME, VERSIONNAME
Product_Name                → FORMULANAME
Finish_Meat (parsed)        → N × Formula_Lines row (RM<digits>, QUANTITY z user input)
Box, Top_Label, Web, etc.   → N × Formula_Lines row (PM codes)
Yield_Line or combined yields → YIELDPERCENTAGE
Process_1..4                → N × Route_Operations row (OPERATIONNUMBER 10, 20, 30, 40)
Line                        → → COSTINGOPERATIONRESOURCEID (map to D365 resource code)
Rate                        → PROCESSTIME / PROCESSQUANTITY
Staffing                    → LOADPERCENTAGE / RESOURCEQUANTITY (niecertain)

Hardcoded / Apex-config:
  PRODUCTIONSITEID = "FNOR"
  APPROVERPERSONNELNUMBER = "FOR100048" (Jane? lub każdy approver? TBD)
  CONSUMPTIONWAREHOUSEID = "ApexDG"
  PRODUCTGROUPID = "FinGoods"
  (i pozostałe z §3.9)
```

Pełny mapping do doprecyzowania w Phase C (moduł `04-integrations/d365/`).

---

## §4 — V04 Material Validation (M05_D365Validate)

### 4.1 Scope

V04 validation sprawdza **6 kolumn Main Table** przeciwko D365 Import tab:
- `Box`, `Top_Label`, `Bottom_Label`, `Web` (MRP materials)
- `Finish_Meat`, `RM_Code` (Core materials, comma-sep handling)

**Nie walidowane** (ale powinny być?):
- `MRP_Box`, `MRP_Labels`, `MRP_Films`, `MRP_Sleeves`, `MRP_Cartons` — MRP confirmation codes
- Inne codes

**Open question Phase B:** Rozszerzyć V04 na wszystkie MRP_* codes?

### 4.2 Cell rendering

Per cell gdzie code matches material col:

```
status = ValidateCodeAgainstD365(code)
IF status = "Found":
    cell.Color = #C0FFC0 (green)
ELIF status = "NoCost":
    cell.Color = #C0FFFF (yellow)
    cell.AddComment "Price missing in D365"
ELIF status = "Missing":
    cell.Color = #C0C0FF (red)
    cell.AddComment "Material not in D365 - request creation"
```

### 4.3 Comma-separated handling

Finish_Meat i potencjalnie inne cols są comma-separated. `M05.ValidateCodeAgainstD365`:
```
codes = Split(cellValue, ",")
worstStatus = "Found"
For each singleCode:
  status = CheckSingleCode(singleCode)
  IF status = "Missing": worstStatus = "Missing"
  ELIF status = "NoCost" AND worstStatus != "Missing": worstStatus = "NoCost"
return worstStatus
```

**Worst-wins:** Jeśli 1 z 3 codes "Missing", cały cell = Missing (red). Pessimistic approach — user widzi że coś jest nie tak.

### 4.4 Trigger

V04 validation uruchamia się z:
- M10.RunValidation (manual button "Run Validation")
- Przed M08 D365 Builder (jeśli jest explicit call — do weryfikacji w M08 read)

**Nie uruchamia się automatycznie** przy edit cell (v7 nie ma event-driven validation). User musi manually re-run lub V04 trigger'uje się przez button.

### 4.5 Marker

- V04 validation = `[LEGACY-D365]` (validate-against-D365)
- Color scheme = `[APEX-CONFIG]` (Apex colors)
- Worst-wins comma-sep pattern = `[UNIVERSAL]`
- Material cols list (6 cols) = `[APEX-CONFIG]` (inne orgi mogą mieć inne material cols)

---

## §5 — Paste-back workflow (manual)

### 5.1 Po M08 Builder successful run

Jane otrzymuje 8 wypełnionych tabów w PLD workbook (obecnie 3 z 8 filled, docelowo wszystkie 8). Następne kroki:

1. **Open D365 client** — Apex uses D365 web UI (Microsoft 365 cloud).
2. **Navigate to Item** — Jane szuka new item with FA_Code (e.g., FA5101) w D365 Items list. Item może już istnieć (jeśli PLD import z D365 pokazał) lub musi być stworzony.
3. **Paste Formula_Version** — D365 Formula Version page → paste 17 cols values.
4. **Paste Formula_Lines** — D365 Formula Lines → paste N rows z Formula_Lines tab.
5. **Paste Route_Headers / Versions / Operations / OpProperties** — analogicznie per tab.
6. **Paste Resource&Requirements** — analogicznie.

**Problem workflow:** Każdy tab → osobna operacja paste. Dla FA z kilkoma ingredients + kilkoma processes = wiele paste operations. Tedious + error-prone.

### 5.2 Alternatywa: osobny Builder file per FA

User Session 3 answer:

> "bom generator powinien miec swoj button ktory naciskamy jak zbiera on gotowe fa i buduje z nich buildery jeden po drogim albo wspolny z wypelnionymi kolumnami. odrebny plik excel."

**Interpretation:** Docelowo **osobny plik Excel per FA** (jak `Builder_FA5101.xlsx`) generowany przez BOM/Builder button. User otwiera plik w D365, paste tab by tab. **To jest starszy workflow** (jak w Builder_FA5101 reference).

**Decision Phase B:** Czy docelowo v7 ma:
- (a) Wszystkie FAs w jednym workbook (current, 8 tabów wspólnych)
- (b) Osobne pliki per FA (starszy workflow, `Builder_FA<code>.xlsx`)
- (c) Obie opcje (user wybiera)

User preference Session 3 = (b) or (c) (osobne pliki = clean per-FA export). Docelowo **Monopilot**: prawdopodobnie eksport JSON/CSV bezpośrednio, bez Excel pośredniej warstwy.

### 5.3 Marker

Paste-back workflow = `[LEGACY-D365]` (zniknie gdy Monopilot zastąpi D365 lub D365 API będzie dostępne). Manual paste = `[APEX-CONFIG]` (dzisiejsze ograniczenie — D365 API nie używane).

---

## §6 — D365 Builder missing features (WIP for M08)

### 6.1 Brakujące w obecnym M08

| Feature | Status | Priorytet |
|---|---|---|
| Wszystkie 8 tabów fill | 3/8 done | HIGH (blocker dla production use) |
| Formula_Lines generation z Finish_Meat + Box/Top_Label/etc. | Empty | HIGH |
| Route_Operations generation z Process_1..4 | Empty | HIGH |
| Route_Versions, Route_OpProperties, Resource_Req | Empty | MEDIUM |
| Apex-specific constants (FNOR, FOR100048, ApexDG, FinGoods, FProd01) | Not referenced in v7 code | HIGH (bez tych D365 paste fails) |
| YIELDPERCENTAGE calc z Yield_P1..4 + Yield_Line | Hardcoded placeholder | MEDIUM |
| Per-line QUANTITY calc (KG for RM, pc for PM) | Empty | HIGH (critical for BOM accuracy) |
| Generate osobny plik per FA (starszy workflow Builder_FA<code>.xlsx) | Not implemented | MEDIUM (user pref) |
| Pre-validation przed build (check all codes Found w D365) | Exists (M05) ale nie w M08 gate | MEDIUM |
| Error recovery (if build fails mid-way, rollback) | Not implemented | LOW |

### 6.2 WIP roadmap (do EVOLVING.md §4)

Stopniowa implementacja M08 do full-featured Builder. Pewnie **Phase B/C** (po reality stable) będzie dedicated VBA work.

### 6.3 Marker

All WIP features = `[EVOLVING]` + `[LEGACY-D365]`. Gdy Monopilot zastąpi → wszystko w Monopilot D365 Builder module (Phase C/D).

---

## §7 — Relationship z M06 BOM AutoGen

### 7.1 BOM tab schema (v7 current)

**Sheet:** `BOM` (7 cols)
**Row 1 title:** "APEX FOODS - BOM"
**Row 2 headers:** FA_Code | Component_Type | Component_Code | Quantity | Process_Stage | Source | D365_Status

### 7.2 M06.GenerateBOM logic

Per FA:
1. Delete existing BOM rows dla FA
2. Append material components (Box, Top_Label, Bottom_Label, Web, Finish_Meat) — comma-sep expanded do osobnych rows
   - Component_Type: "Box", "Label", "Label", "Web", "Meat"
   - Quantity = 1 (hardcoded)
   - Process_Stage = "" (empty dla materials)
   - Source = "Auto"
   - D365_Status = M05.ValidateCodeAgainstD365 result
3. Append Process_1..4 (jeśli wypełnione) jako separate rows
   - Component_Type = "Process"
   - Component_Code = Process_Name (e.g., "Strip")
   - Quantity = 1
   - Process_Stage = 1 / 2 / 3 / 4
   - Source = "Auto"
   - D365_Status = M05.ValidateCodeAgainstD365 result (or "N/A" if empty)

### 7.3 BOM vs D365_Formula_Lines

Oba opisują BOM ale w **innych formatach**:

| Aspekt | BOM tab v7 | D365_Formula_Lines (target Builder_FA5101) |
|---|---|---|
| Format | Flat (1 row per component) | D365 schema (29 cols per row) |
| Schema | Apex-internal | D365-specific |
| Quantities | Hardcoded = 1 | Real values (e.g., RM001=330 KG) |
| D365_Status | Included (Found/NoCost/Missing) | N/A (D365 validates post-paste) |
| Process rows | Included (Process_N as component) | Separate (Route_Operations, nie Formula_Lines) |

**Relationship:** BOM jest **user-facing intermediate** (Jane widzi co jest w FA + D365 status). Formula_Lines jest **D365-ready export** (D365 consumes directly).

### 7.4 M06 trigger (confirmed open question)

User Session 3: **"bom generator powinien miec swoj button"** — Apex wants **explicit button** (nie auto-trigger). M06.GenerateBOM dziś nie ma callsite w innych modułach VBA — po prostu czeka na button assignment w UI.

**Phase B action:** Add button "Generate BOM" na BOM tab (albo Dashboard). Map to `M06.GenerateBOM(selected_mtRow)` lub bulk version `GenerateAllBOMs()`.

### 7.5 Marker

BOM tab pattern = `[UNIVERSAL]` (każda firma food-mfg ma BOM view). Current v7 BOM schema = `[APEX-CONFIG]`. Quantity hardcoded=1 = `[EVOLVING]` (docelowo real quantities z recipe).

---

## §8 — HANDOFF (pending propagation Session B)

**Moduły Monopilot do update:**

- `04-integrations/d365/` (Phase C adresat #1 dla D365 content) — full cross-walk:
  - D365 Import schema + paste workflow
  - D365 Builder 8 tabs schema (from Builder_FA5101 reference)
  - Apex-specific constants config (FNOR/FOR100048/ApexDG/FinGoods/FProd01) jako per-org settings
  - Feature flag `integration.d365.enabled`
  - `[LEGACY-D365]` markery na całym module
  - Paste-back manual → future API integration (gdy D365 API dostępne)
- `09-npd/` (Phase B) — Builder click UX (Jane as sole operator), Dashboard "Built for D365" counter
- `20-settings/` lub równoważny (Phase C) — EmailConfig + D365 integration constants
- `15-mrp/` (Phase C) — V04 validation scope dla MRP_* cols

---

## §9 — Open questions Phase B

1. **M08 WIP roadmap priorytet** — który tab next w M08 implementation? (Formula_Lines high priority bo bez niego D365 nie ma BOM)
2. **Apex constants source** — dziś hardcoded where? Settings tab? ADR-015 constants pattern? Nie zidentyfikowano w czytanych M01-M11. Prawdopodobnie do dodania jako Reference.D365_Constants config table (`[LEGACY-D365]` + `[APEX-CONFIG]`)
3. **BOM button location** — Dashboard? BOM tab? Per-FA w Main Table? UI decision Phase B
4. **BOM vs Builder** — oba generują, jeden plik vs wspólny workbook, decyzja user preference (§5.2)
5. **V04 scope expansion** — MRP_* cols validation, inne codes? (§4.1)
6. **Per-FA osobny plik Builder_FA<code>.xlsx** — wygenerowany z v7 czy tylko Monopilot?
7. **D365 API integration** — kiedy/jak? Feature flag `integration.d365.enabled` docelowo rozszerzyć o `d365.api.enabled` (REST call zamiast paste)
8. **Approval chain D365** — `ISAPPROVED=Yes` hardcoded. Who approves w Monopilot (same NPD Manager? separate D365 approver?)

---

## §10 — Related

- [`MAIN-TABLE-SCHEMA.md`](./MAIN-TABLE-SCHEMA.md) — Main Table cols mapowane do Builder output
- [`REFERENCE-TABLES.md`](./REFERENCE-TABLES.md) — 8 config tables (plus D365 constants future table)
- [`WORKFLOW-RULES.md`](./WORKFLOW-RULES.md) §7 — Built flag lifecycle
- [`EVOLVING.md`](./EVOLVING.md) — D365 Builder WIP roadmap, BOM button, API integration
- [`_foundation/META-MODEL.md`](../../../_foundation/META-MODEL.md) §5 (D365 mapping) + §3.1 (integrations = code-driven)
- [`_foundation/decisions/ADR-031-schema-variation-per-org.md`](../../../_foundation/decisions/ADR-031-schema-variation-per-org.md) — per-org D365 config variation
- Reality files:
  - `C:\Users\MaKrawczyk\PLD\v7\Smart_PLD_v7.xlsm` → D365 Import + 8 D365_* tabs
  - `C:\Users\MaKrawczyk\OneDrive - IPL LIMITED\Desktop\PLD\Builder_FA5101.xlsx` — reference target output (7 tabs)
  - `C:\Users\MaKrawczyk\PLD\v7\vba\M05_D365Validate.bas` (ValidateCodeAgainstD365, ApplyD365Formatting, ValidateAllCodes)
  - `C:\Users\MaKrawczyk\PLD\v7\vba\M06_BOMAutoGen.bas` (GenerateBOM — current partial impl)
  - `C:\Users\MaKrawczyk\PLD\v7\vba\M08_Builder.bas` (BuildD365_Single, BuildD365_Bulk, BuildD365Data, BuildD365Formulas, BuildD365Routes — WIP 3 of 8 tabs)

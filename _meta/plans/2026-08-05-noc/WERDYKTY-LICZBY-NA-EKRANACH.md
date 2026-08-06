# Werdykty — „Czy liczby na ekranach są prawdziwe?" (tor adwersarza, 2026-08-06)

**Metoda:** baza `monopilot_ver` (pełny schemat, mig 564). Dla każdej tezy zasiane dane, wywołana
**prawdziwa akcja serwerowa** (`withOrgContext` podmieniony na wierną replikę: własne połączenie
`app_user` pod RLS + `app.set_org_context`, reszta kodu akcji nietknięta), porównanie liczby
zwróconej z liczbą wyliczoną niezależnie.

Wykonane: 6 plików testowych, wszystkie przebiegi zielone, wyjścia w logu.
Pliki dowodowe (poza repo, żeby nie kolidowały z innymi torami): `/tmp/adv-numbers-evidence/`.
Uruchomienie: `DATABASE_URL=postgres://mariuszkrawczyk@127.0.0.1:5432/monopilot_ver pnpm --filter web exec vitest run --config ../../vitest.config.ts --disableConsoleIntercept <plik>`.

---

## Tabela wyników

| teza | werdykt | zasiane → prawda → zwrócone |
|---|---|---|
| 1. WIP: `additional_cost` × liczba ról | **OBALONA** | proces 1 h, role 20 £/h + 30 £/h, `additional_cost` 100 → prawda **150** → `compute_intermediate_unit_cost()` = **150.00**, `v_item_effective_cost.amount` = 150.00 |
| 2. Std cost BOM: ilość dowolnej JM × koszt/kg | **POTWIERDZONA (P0)** | 200 **g** pieprzu, `item_cost_history.cost_per_kg` = 5 GBP → prawda **1,00 GBP** → `getRecipeCost()` = **„1000.0000000000"** (1000×) |
| 2b. brakujący koszt składnika wypada z „Total" | **OBALONA w części** | 100 pcs (2 GBP) + 50 kg bez kosztu → Total 200; ale linia ma `lineCost: null`, a kafel „Costed" = **1/2 na bursztynowo** — ekran NIE udaje kompletu |
| 3. brak ceny docelowej → marża 0% | **POTWIERDZONA** | `targetPriceEur: null` → prawda **niezdefiniowana** → `computeNpdCostEngine()` = `marginPct "0.0000"`, `targetPriceEur "0.0000"`, **`status: "ok"`**, `missing: []` |
| 4. WO sumuje kg ze sztukami (lista/szczegóły/Finance) | **MINA** | 50 kg (primary, uom=kg) + 50 pcs (by_product, uom=pcs), koszt 1000 GBP → prawda **50 kg / 50% / 20 £/kg** → `listWorkOrders` **outputKg 100, progressPct 100**; `getWorkOrderDetail` **outputKg 100, outputPct 100**; `computeWoActualCost` **costPerKgOutput „10.0000"**. Ale dzisiejsze ścieżki zapisu stemplują JEDNĄ jednostkę na WO — patrz niżej |
| 5. Warehouse Inventory Browser — mieszane JM | **POTWIERDZONA** | jedna lokalizacja: 100 kg + 40 pcs + 10 kg + 5 box → prawda **nieporównywalne** → `getInventoryByLocation` **totalQty „155.000000"** (jedna liczba, bez JM); `getInventoryByProduct` dla sera 10 kg + 5 box → **„15.000000", uom „box"**; `getInventoryByBatch` → **„15.000000"** |
| 6. „Low Stock" bierze progi z innych zakładów | **POTWIERDZONA** | site A: stan 100 kg, próg 10 kg; site B: próg 200 kg → prawda dla A **0 pozycji** → `getDashboardData()` **lowStock = 1** |
| 7. OEE nie aktualizuje jakości po późniejszej decyzji QA | **POTWIERDZONA** | `oee_snapshots` ma w CAŁYM repo **dokładnie jeden zapis** — `insert` w `oee-snapshot-producer.ts:325`, z `where not exists` + `on conflict do nothing`. Zero `update`, zero `delete`. Ścieżka QA (`transition-output-qa.ts`) rusza wyłącznie `wo_outputs.qa_status` |
| 8. OEE i yield jako średnia arytmetyczna | **POTWIERDZONA** | snapshoty 90% i 10% → `getOeeScreen(siteA)` **avgOee „50.0"**; WO 1000→900 kg i 10→5 kg → prawda ważona **89,6%** → `getAnalyticsScreen()` **yieldAvgPct 80** (arytm. z 3 WO) |
| 9. Quality — dwa różne, błędne Pass Rate | **POTWIERDZONA** | 8 passed + 2 failed + 90 pending → prawda **80%** → `getQualityDashboard()` **passRate30d = 16** |
| 10. wybrany zakład ignorowany przez agregaty | **POTWIERDZONA** | site A: OEE 90/10, site B: OEE 100 → `getOeeScreen(siteA)` = 50,0, a `getAnalyticsScreen()` = **66,67** (wciąga B). Quality: 100 inspekcji A + 10 passed z B → licznik dashboardu **liczy 110**. Maintenance: `listMwos()` **nie ma parametru site ani predykatu**, zwraca `open: 100` niezależnie od wyboru |
| 11. Raport Receipts liczy KPI po `LIMIT 50` | **POTWIERDZONA** | 80 GRN × 10 kg → prawda **80 / 800 kg** → `receiptsSummaryCore()` **grnCount 50, itemLineCount 50, „500.000" kg** |
| 12. filtry i liczniki działają tylko na stronie | **POTWIERDZONA** | 100 LP, 60 `reserved` → `listLPs({page:1})` **total 100** (globalne) ale strona ma 50 wierszy → nagłówek liczy `reserved` z tych 50 = **50**, prawda **60** |
| 13. NPD „Conversion" nie jest konwersją | **POTWIERDZONA** | 1 projekt w `approval`, 100 w `launched` → `getPipelineAnalytics()` **conversionPct = 10000** |
| 14. brak CAPA pokazany jako 0% | **POTWIERDZONA** | 0 rekordów `capa_actions` → prawda **niezdefiniowane** → `getComplaintAnalytics()` **capaClosureRate: 0** (UI dokleja `%`) |
| 15. Finance — surowa suma ilości niewycenionych LP | **POTWIERDZONA** | 10 kg + 5 box bez WAC → prawda **nieporównywalne** → `getInventoryValuation()` **unvalued `{ lpCount: 2, qty: "15.000000" }`** |

**Bilans:** 12 POTWIERDZONYCH, 1 MINA, 2 OBALONE (1 w całości, 1 w części). Zero NIEROZSTRZYGNIĘTYCH.

---

## Kolejność napraw (wg realnego skutku)

1. **Teza 2** — błąd **1000×** na koszcie receptury. Jedyna pozycja tej nocy, która sama w sobie
   może wywrócić cenę sprzedaży.
2. **Teza 6** — fałszywe „Low Stock", generuje niepotrzebne zakupy. Naprawa jednolinijkowa.
3. **Teza 5** — magazyn pokazuje sumę bez wymiaru na trzech zakładkach.
4. **Tezy 9 / 11 / 12 / 13 / 14 / 3** — liczniki i procenty, które kłamią co do skali.
5. **Teza 10** — kierownik zakładu widzi cudze dane; 3 ekrany.
6. **Tezy 7 / 8** — definicja metryki; wymaga decyzji ownera (i przy 8 zmiany schematu).
7. **Teza 4** — mina, patrz niżej.

---

## Szczegóły rozstrzygnięć, które zmieniają obraz

### Teza 1 — OBALONA. Codex czytał martwy plik

Kod cytowany w tezie (`491-intermediate-effective-cost-from-bom.sql:63`) **nie jest tym, co żyje
w bazie**. Funkcję `compute_intermediate_unit_cost` nadpisały migracje **492** i **501**. Wersja
z bazy ma CTE `process_crew`, które sumuje `rate × headcount` **z grupowaniem po `wp.id`**, a
`additional_cost` bierze przez `coalesce(wp.additional_cost, 0)` **poza sumą po rolach**.

Zasiany dokładnie scenariusz z tezy (proces 1 h, operator 20 £/h, brygadzista 30 £/h,
`additional_cost` = 100 £). Zwrócone: **150.00** — wartość prawidłowa. Teza przewidywała 250.

Wniosek dla przyszłych audytów: numer migracji w `packages/db/migrations/` nie mówi, co jest
w bazie. `\sf public.<funkcja>` mówi.

### Teza 2 — POTWIERDZONA, i to najgorsza liczba tej nocy

Pierwsze podejście (100 pcs opakowania × `list_price_gbp` = 2) dało 200 GBP — ale to **nie jest
dowód błędu**, bo cena katalogowa opakowania kupowanego na sztuki najpewniej JEST za sztukę.
Wersja rozstrzygająca użyła źródła kosztu, które jest jednoznacznie per kilogram:

```
ZASIANE:   linia BOM: 200 g pieprzu; item_cost_history.cost_per_kg = 5,0000 GBP
PRAWDA:    0,2 kg x 5 GBP/kg = 1,00 GBP
ZWROCONE:  getRecipeCost('ADV-FG9') -> totalMaterialCost "1000.0000000000"
           linia: quantity "200.000000", uom "g", unitCost "5.0000", lineCost "1000.0000000000"
```

To **1000×**. Gramy są w liście jednostek UI, a przyprawy/dodatki w recepturze mięsnej dozuje się
właśnie w gramach — scenariusz jest codzienny, nie egzotyczny.

Dodatkowo UI renderuje wprost `{quantity} {uom} × {unitCost}/kg`
(`recipe-cost.client.tsx:244-250`), czyli literalnie **„200 g × £5.00/kg"**. Etykieta `/kg` jest
przyklejona bezwarunkowo, niezależnie od JM linii.

**Częściowo obalona podteza:** twierdzenie, że brakujące koszty „znikają, a UI nadal nazywa to
Total". Ekran POKAZUJE brak: linia bez kosztu ma `lineCost: null` i renderuje się jako
`uncosted` na bursztynowo, a kafel „Costed" pokazuje `1/2` z bursztynowym akcentem. Suma nadal
jest niepełna, ale użytkownik nie dostaje fałszywej zieleni.

### Teza 4 — MINA, nie pożar. Rozróżnienie najważniejsze dla planowania

Mechanika jest dokładnie taka, jak w tezie. Zasiane 50 kg (`uom='kg'`) + 50 szt.
(`uom='pcs'`) na jednym WO, koszt materiałów 1000 GBP:

```
listWorkOrders()      -> outputKg 100, progressPct 100      (prawda: 50 kg, 50%)
getWorkOrderDetail()  -> outputKg 100, outputPct 100        (prawda: 50 kg, 50%)
computeWoActualCost() -> costPerKgOutput "10.0000"          (prawda: 20 GBP/kg)
```

**Ale takiego wiersza nie da się dziś zrobić przez aplikację.** Prześledzone WSZYSTKIE ścieżki
zapisu do `wo_outputs`:

| ścieżka | `uom` wiersza |
|---|---|
| `register-output.ts:835` (modal + skaner) | `input.uom ?? wo.uom` — a UI i skaner **nigdy nie wysyłają `uom`**; modal wysyła `qty_kg` albo `qtyUnits`+`unitsUom` (`each`/`box`, osobna kolumna `units_uom`), a ilość jest przeliczana do bazowej JM WO |
| `register-disassembly-output.ts:493` | `'kg'` na sztywno |
| `start-wo.ts:270` | `schedule_outputs.uom` — ale **`qty_kg = 0`** (placeholder) |
| `corrections-actions.ts:702` | kopiuje `uom` oryginału |

Do tego modal zawsze podaje `product_id = productId WO` (`wo-detail-screen.tsx:1686`), więc
produktu ubocznego w innej jednostce **w ogóle nie da się przez UI zarejestrować**, a
`work_orders.uom` można zmienić tylko w statusie `DRAFT` (`update-work-order.ts:347`), czyli zanim
powstanie jakikolwiek output.

Zostaje jedna furtka: bezpośredni `POST .../production/work-orders/:id/outputs` z polem `uom`
w ciele — schemat Zod je przyjmuje (`z.string().min(1).max(16).optional()`), a route przekazuje
ciało wprost. Integracja/D365/skrypt to zrobi.

**Dlaczego to jednak warto naprawić i to szybko:** trzy inne miejsca w repo JUŻ filtrują po JM,
z komentarzami wprost o tym przypadku:

- `oee-snapshot-producer.ts:288` — `and lower(...uom...) = lower($2)`, komentarz: *„Outputs in a
  DIFFERENT unit than the WO (a by-product logged in pcs on a kg WO) must not be added in"*;
- `dashboard-data.ts:202` — `group by uom`, a test obok cytuje **żywy dowód z `monopilot_t3`**:
  *„PROBE-KG-1 200 kg + PROBE-PCS-1 500 pcs used to render as 700 kg"*;
- `sync-work-order-output-quantities.ts:25` — ten sam filtr.

Czyli zespół już raz uznał ten przypadek za realny i załatał go w trzech miejscach. Lista WO,
szczegóły WO i Finance to **trzy pominięte**. Mina jest uzbrojona i czeka na pierwszy zapis
przez API.

Osobno, przy okazji tego samego zapytania: `sum(o.qty_kg)` **wlicza outputy z `qa_status =
'FAILED'`** do postępu WO i do mianownika kosztu/kg. To nie było w tezach.

### Teza 3 — POTWIERDZONA, i gorzej niż w tezie

```
ZASIANE:   targetPriceEur: null, koszt skladnikow 10 GBP/kg
PRAWDA:    marza niezdefiniowana (brak podstawy)
ZWROCONE:  marginPct "0.0000", targetPriceEur "0.0000", status "ok", missing []
```

Teza mówiła o „0%". W rzeczywistości ekran dostaje **`status: "ok"`** (zielono) i **pustą listę
`missing`** — brak ceny docelowej nie jest nigdzie zgłoszony jako brakujący input
(`compute-waterfall.ts:203-227` nie ma `target_price_required`).

### Teza 5 — POTWIERDZONA, z uzasadnieniem osiągalności

Widok „per lokalizacja" miesza jednostki z definicji (jedna lokalizacja, wiele produktów) —
w zakładzie mięsnym mięso w kg obok opakowań w szt. jest normą. Widok „per produkt" wymaga, żeby
JEDEN produkt miał LP w dwóch JM — i to też jest osiągalne: LP z przyjęcia dostaje
`uom` **linii zamówienia** (`receive-po-line-core.ts:591`, `pol.uom`), a formularz linii PO ma
wolny wybór z `kg / g / l / ml / pcs / pack / box / pallet`. Wystarczy raz kupić ten sam towar
„na kartony".

Etykieta `min(lp.uom)` daje przy tym wynik alfabetycznie pierwszy: 10 kg + 5 box pokazało się
jako **„15 box"**.

### Teza 10 — POTWIERDZONA na wszystkich trzech ekranach

- **Production Analytics** (`analytics-data.ts`) — w całym pliku **nie ma ani jednego** predykatu
  site. Przy site A z OEE 50,0 ekran Analytics pokazuje **66,67** (wciąga snapshot site B).
  Dwa ekrany tej samej instalacji podają dwa różne OEE.
- **Quality dashboard** — brak scope'u site; 10 inspekcji `passed` z site B weszło do mianownika
  (110 zamiast 100).
- **Maintenance MWO** (`mwo-actions.ts:785`) — komentarz w kodzie mówi wprost *„Tab counts over
  the WHOLE org set"*, a `listMwos` nie przyjmuje nawet parametru site.

### Teza 8 — POTWIERDZONA, ale naprawa nie jest jednolinijkowa

`avg(oee_pct)` faktycznie zwróciło 50,0 dla snapshotów 90% i 10%. Tyle że **`oee_snapshots` nie
przechowuje czasu trwania WO** (jest `downtime_min_delta`, nie ma runtime). Ważenie czasem
wymaga albo dołożenia kolumny, albo dojścia po `active_wo_id` do `wo_executions`. Owner powinien
wiedzieć, że to nie jest zamiana `avg()` na `sum()/sum()`.

Yield jest łatwiejszy — `work_orders` ma `planned_quantity` i `actual_qty`, więc
`sum(actual_qty)/sum(planned_quantity)` jest w zasięgu jednego zapytania (przy filtrze po JM).

---

## Czego nie tknąłem

- **11 pozycji, które Codex oznaczył jako POPRAWNE** (WAC, część monetarna Inventory Valuation,
  dashboard produkcji, Reporting Inventory/Shipments/Quality, MRP, PO Aging, Shipping, Routing
  Cost Preview, Multi-site). Nie weryfikowałem twierdzeń o poprawności — priorytet był na
  obalaniu twierdzeń o błędzie.
- **NPD Costing Rollup** (pozycja NIEROZSTRZYGNIĘTA u Codexa — `number` zamiast `numeric`).
  Nie sprawdzałem.
- **Renderowanie w przeglądarce.** Wszystkie liczby to wartości zwrócone przez akcje serwerowe.
  Formatowanie/zaokrąglenia locale mogą je jeszcze zmienić — nie badałem.
- **`monopilot`, `monopilot_t1/t2/t3`, `monopilot_qty`** — nietknięte zgodnie z zakresem.
  Wszystkie testy szły wyłącznie na `monopilot_ver`, dane po sobie posprzątane.
- **Teza 12 w częściach dotyczących Movements i Maintenance** — potwierdzone czytaniem kodu
  (`movement-list.client.tsx:123`, `mwo-actions.ts:803` + `mwo-list.client.tsx:335`), ale
  odtworzyłem na żywo tylko przypadek LP.

## Pułapki, w które NIE wpadłem (dla protokołu)

- Sterownik zwraca `numeric`/`bigint` jako łańcuch — dlatego w raporcie liczby zwrócone są
  cytowane dosłownie (`"15.000000"`, `"1000.0000000000"`), a każde porównanie robiłem przeciw
  wartości wyliczonej ręcznie, nie przez arytmetykę JS na tych łańcuchach.
- `withOrgContext` commituje przy zwykłym `return` — replika w harnessie kończy każdą akcję
  `ROLLBACK`iem (to były wyłącznie odczyty), a zasiew szedł osobną transakcją owner-pool.
- Pierwsza wersja harnessu **zakleszczała się**: prawdziwy `withSiteContext` w `finally` kasuje
  swój wiersz `app.session_site_contexts`, a moja transakcja app trzymała na nim blokadę przez
  FK z `active_site_contexts`. Rozwiązanie: replika `withOrgContext` domyka własną transakcję,
  dokładnie jak oryginał.

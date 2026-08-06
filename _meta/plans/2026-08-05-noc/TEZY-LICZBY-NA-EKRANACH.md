# Czy liczby na ekranach są prawdziwe? — 31 tez (Codex, 2026-08-06 00:35)

**STATUS: NIEZWERYFIKOWANE.** Codex czytał kod bez dostępu do bazy.
Wszystkie pozycje mają w treści uczciwe „nie zostało wykonane".

| werdykt autora | ile |
|---|---|
| BŁĘDNY | 19 |
| POPRAWNY | 11 |
| NIEROZSTRZYGNIĘTY | 1 |

Nie. W statycznym audycie znalazłem 19 powierzchni, na których poprawne dane mogą zostać pokazane jako błędna liczba. Najgroźniejsze dotyczą kosztu wyrobu, ilości wyprodukowanej, stanu magazynowego i OEE.

Status wykonania: testy — **nie zostało wykonane**; build — **nie został wykonany**; baza/Supabase — **nie została uruchomiona**. Nie zmodyfikowałem żadnego pliku.

## 1. Tabela wyników

| Ekran/raport | Co pokazuje | Werdykt |
|---|---|---|
| Główny dashboard — Low Stock | Liczba pozycji poniżej minimum | **BŁĘDNY** |
| Dashboard produkcji — Output today | Dzisiejsza produkcja wg JM | **POPRAWNY** |
| Dashboard produkcji — Current OEE | Ostatni snapshot OEE | **BŁĘDNY** |
| Produkcja — lista i szczegóły WO | Output i procent realizacji | **BŁĘDNY** |
| Production Analytics | Średnie OEE, FPQ i yield | **BŁĘDNY** |
| OEE | KPI, trendy i wyniki linii | **BŁĘDNY** |
| Warehouse Inventory Browser | Stan wg produktu/lokalizacji/partii | **BŁĘDNY** |
| Warehouse LP / Movements | Liczniki, filtry i wyszukiwanie | **BŁĘDNY** |
| Warehouse GRN list | Liczba i lista przyjęć | **POPRAWNY** |
| Finance Inventory Valuation | Wartość wycenionego zapasu | **POPRAWNY** |
| Finance — unvalued inventory | Surowa ilość wykluczona z wyceny | **BŁĘDNY** |
| Finance WO Costs | Koszt WO i koszt/kg | **BŁĘDNY** |
| Technical Recipe/Portfolio Cost | Standardowy koszt BOM | **BŁĘDNY** |
| Technical WIP effective cost | Koszt półproduktu | **BŁĘDNY** |
| Technical Routing Cost Preview | Koszt operacji i całego routingu | **POPRAWNY** |
| Quality dashboard | Pass rate, holds, NCR | **BŁĘDNY** |
| Quality Inspections | Total, Passed, Pass Rate | **BŁĘDNY** |
| Quality Complaints | CAPA Closure Rate | **BŁĘDNY** |
| Reporting — Production | Średni yield | **BŁĘDNY** |
| Reporting — Inventory | Zapasy i liczniki LP | **POPRAWNY** |
| Reporting — Receipts | Liczba GRN, linii i odebrane ilości | **BŁĘDNY** |
| Reporting — Shipments | Liczba wysyłek wg statusu | **POPRAWNY** |
| Planning MRP | On-hand, demand, supply, shortages | **POPRAWNY** |
| Planning PO Aging | Liczba i wartość przeterminowanych PO | **POPRAWNY** |
| Shipping lists / packing | SO, shipments, remaining to pack | **POPRAWNY** |
| Maintenance MWO | Liczniki statusów, backlog i lista | **BŁĘDNY** |
| NPD Pipeline Analytics | Konwersja między etapami | **BŁĘDNY** |
| NPD Costing Waterfall | Koszt, cena docelowa i marża | **BŁĘDNY** |
| NPD Costing Rollup | Zapisane koszty i marże projektów | **NIEROZSTRZYGNIĘTY** |
| Multi-site Network | Stan wg JM, sites, transfery | **POPRAWNY** |
| Reporting — Quality | Liczniki wg statusu | **POPRAWNY** |

## 2. BŁĘDNE LICZBY

### 1. Jednorazowy koszt procesu WIP jest mnożony przez liczbę ról

Kod w [491-intermediate-effective-cost-from-bom.sql:63](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/491-intermediate-effective-cost-from-bom.sql:63>) łączy proces z rolami, a następnie wykonuje:

```sql
sum(
  rate_per_hour * headcount * duration_hours
  + additional_cost
)
```

`additional_cost` jest wewnątrz sumy po wierszach ról.

Scenariusz: proces trwa godzinę, operator kosztuje £20/h, brygadzista £30/h, koszt dodatkowy procesu to £100. Prawidłowo: `20 + 30 + 100 = £150`. SQL liczy `(20 + 100) + (30 + 100) = £250`.

Wartość trafia przez `compute_intermediate_unit_cost` do `v_item_effective_cost` ([linie 106–126](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/491-intermediate-effective-cost-from-bom.sql:106>)), a następnie do kosztów receptur. Właściciel lub technolog może zawyżyć cenę, odrzucić opłacalny produkt albo nieprawidłowo ocenić marżę.

Test: nie znalazłem testu tej funkcji SQL z dwiema rolami i niezerowym `additional_cost`. Testy `wip-cost.test.ts` dotyczą odrębnej implementacji TypeScript, która grupuje proces przed sumowaniem. Wykonanie testów: **nie zostało wykonane**.

### 2. Standardowy koszt BOM mnoży ilość dowolnej JM przez koszt `/kg`

W [recipe-cost-rollup-sql.ts:26](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/cost/_actions/recipe-cost-rollup-sql.ts:26>) znajduje się:

```sql
sum(bl.quantity * vec.amount)
```

Nie ma konwersji `bl.uom`. Jednocześnie `v_item_effective_cost` łączy w jednym `amount` koszt `/kg`, cenę dostawcy i cenę katalogową bez kolumny jednostki ([491…sql:106](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/491-intermediate-effective-cost-from-bom.sql:106>)). UI zawsze dopisuje `/kg`, mimo że pokazuje JM linii BOM ([recipe-cost.client.tsx:244](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/cost/_components/recipe-cost.client.tsx:244>)).

Scenariusz: BOM zawiera 100 sztuk opakowania po 0,1 kg, a koszt źródłowy wynosi £2/kg. Prawidłowy koszt to £20. Ekran pokaże `100 × 2 = £200`.

Dodatkowo `and vec.amount is not null` usuwa z sumy brakujące koszty, ale UI nadal nazywa wynik „Std cost” i „Total” ([linie 188–204 i 258–264](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/cost/_components/recipe-cost.client.tsx:188>)). Dwie linie: £20 oraz brakujący koszt rzeczywisty £50 dadzą „Total £20”, nie brak wyniku.

Test: `list-recipe-cost.test.ts` używa wyłącznie `uom: 'kg'`; brak przypadku nie-kg i częściowego kosztu. Wykonanie: **nie zostało wykonane**.

### 3. Brak ceny docelowej daje w NPD marżę `0%`

`targetPriceEur` może być `null` lub zero. `Dec.from(null)` jawnie zamienia brak na zero ([decimal.ts:37](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/domain/src/formulation/decimal.ts:37>)). Następnie [compute-waterfall.ts:472](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/costing/compute-waterfall.ts:472>) robi:

```ts
if (target.isZero()) return '0.0000';
```

`target_price_eur` jest nullable i dopuszcza zero ([093-formulations.sql:23](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/093-formulations.sql:23>)). Brak ceny docelowej nie jest też dodawany do listy `missing` ([compute-waterfall.ts:202](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/costing/compute-waterfall.ts:202>)).

Scenariusz: koszt paczki £2, cena docelowa nieuzupełniona. Marża `(0−2)/0` nie istnieje, ale ekran dostaje `0%`. Właściciel/NPD może odczytać to jako produkt „na zero”, zamiast jako brak podstawy do decyzji cenowej.

Test: brak testu `targetPriceEur=null/0` dla wyświetlanej marży. Wykonanie: **nie zostało wykonane**.

### 4. WO sumuje kilogramy ze sztukami na liście, w szczegółach i w Finance

`wo_outputs.qty_kg` jest nazwą historyczną; faktyczna JM znajduje się w `wo_outputs.uom` ([oee-snapshot-producer.ts:238](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/oee-snapshot-producer.ts:238>)).

Mimo to:

- lista WO sumuje wszystkie outputy bez filtra JM ([list-work-orders.ts:238](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_actions/list-work-orders.ts:238>));
- szczegóły WO robią to samo ([get-work-order-detail.ts:375](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_actions/get-work-order-detail.ts:375>));
- Finance używa tej sumy jako mianownika `cost/kg` ([wo-cost-actions.ts:279](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/finance/_actions/wo-cost-actions.ts:279>), [wo-cost-math.ts:109](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/finance/_actions/wo-cost-math.ts:109>)).

Scenariusz: WO planuje 100 kg, zarejestrowano 50 kg produktu głównego i 50 sztuk produktu ubocznego. Lista i szczegóły pokażą `100 kg` oraz `100%`, zamiast 50 kg/50%. Przy koszcie £1000 Finance pokaże £10/kg zamiast £20/kg.

Operator może zakończyć niedokończone WO, a właściciel ustalić cenę poniżej kosztu.

Test: poprawny dashboard produkcji ma test `200 kg + 500 pcs` ([dashboard-data.test.ts:147](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_actions/dashboard-data.test.ts:147>)), ale dotknięte lista, szczegóły i Finance nie mają analogicznego testu. Wykonanie: **nie zostało wykonane**.

### 5. Warehouse Inventory Browser dodaje nieporównywalne jednostki

Zapytania wykonują:

```sql
sum(lp.quantity)
```

bez grupowania lub konwersji po JM:

- produkt: [inventory-actions.ts:65](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/inventory-actions.ts:65>);
- lokalizacja: [linia 134](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/inventory-actions.ts:134>);
- partia: [linia 202](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/inventory-actions.ts:202>).

Widok produktowy wybiera jeszcze `min(lp.uom)`, czyli arbitralną etykietę dla mieszanej sumy.

Scenariusz: 10 kg produktu oraz 5 pudełek po 2 kg. Rzeczywisty stan to 20 kg; ekran może pokazać `15 box`. Dla lokalizacji 100 kg mięsa i 40 sztuk opakowań pokaże pojedyncze `140`.

Kierownik magazynu może obiecać nieistniejący zapas, niepotrzebnie zamówić towar albo błędnie przygotować wysyłkę.

Test: mock sumuje przez `Number(lp.quantity)`, a wszystkie fixture mają `uom: 'kg'` ([inventory-actions.test.ts:67](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/__tests__/inventory-actions.test.ts:67>)). Wykonanie: **nie zostało wykonane**.

### 6. „Low Stock” używa progów innych zakładów

[dashboard-summary.ts:116](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/_actions/dashboard-summary.ts:116>) ogranicza stan do aktywnego site, ale nie ogranicza `reorder_thresholds`:

```sql
where rt.org_id = app.current_org_id()
  and coalesce(inv.available_qty, 0) < rt.min_qty
```

Tymczasem próg jest unikalny per `(org_id,item_id,site_id)` ([528…sql:20](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/528-mrp-forecast-threshold-site-unique.sql:20>)).

Scenariusz: site A ma 100 kg i próg 10 kg; site B ma próg 200 kg. Po wybraniu site A dashboard policzy pozycję jako niski stan, bo `100 < 200`.

Właściciel lub planista może wygenerować zbędne zakupy. Ten sam podagregat sumuje również `available_qty` tylko po produkcie, bez JM.

Test jest szczególnie niebezpieczny: [dashboard-summary.test.ts:101](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/_actions/dashboard-summary.test.ts:101>) jawnie wymaga `not.toContain('rt.site_id')`, czyli utrwala błąd. Wykonanie: **nie zostało wykonane**.

### 7. OEE nie aktualizuje jakości po późniejszej decyzji QA

Snapshot powstaje dokładnie raz przy zakończeniu WO ([oee-snapshot-producer.ts:5](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/oee-snapshot-producer.ts:5>)). Jako „good” liczy każdy output, którego status nie jest `FAILED`:

```sql
sum(qty_kg) filter (where qa_status <> 'FAILED')
```

([linie 282–290](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/oee-snapshot-producer.ts:282>)). `PENDING` i `ON_HOLD` są więc dobre. Insert ma `where not exists` i `on conflict do nothing` ([linie 322–335](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/oee-snapshot-producer.ts:322>)).

QA może później zmienić `PENDING` na `FAILED` ([transition-output-qa.ts:147](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/output/transition-output-qa.ts:147>)), ale nie ma ścieżki aktualizującej snapshot.

Scenariusz: przy zakończeniu 100 kg jest `PENDING`, więc quality=100%. Następnie QA odrzuca 20 kg. Prawidłowo quality=80%; OEE nadal wykorzystuje 100%.

Właściciel i kierownik produkcji nie zobaczą realnej straty jakościowej.

Test sprawdza matematykę na gotowych wartościach wejściowych, nie sekwencję `complete → późniejszy fail QA` ([oee-snapshot-producer.test.ts:121](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/production/__tests__/oee-snapshot-producer.test.ts:121>)). Wykonanie: **nie zostało wykonane**.

### 8. OEE i yield są średnią z WO, nie wynikiem ważonym

Jeden snapshot odpowiada jednemu WO, ale ekran OEE używa `avg(oee_pct)` ([oee-data.ts:151](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/oee/_actions/oee-data.ts:151>)). Production Analytics i Reporting używają `avg(wo.yield_percent)` ([analytics-data.ts:150](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/analytics/_actions/analytics-data.ts:150>), [report-read-actions.ts:236](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/reporting/_actions/report-read-actions.ts:236>)).

Scenariusze:

- WO 600 minut z OEE 90% i WO 10 minut z OEE 10% → ekran 50%; wynik ważony czasem ≈88,7%.
- WO plan 1000 kg/output 900 kg oraz plan 10 kg/output 5 kg → ekran `(90%+50%)/2=70%`; łączny yield to `905/1010=89,6%`.

Właściciel może zatrzymać zdrową linię albo nie zauważyć straty na dużym zleceniu.

Test `analytics-data.test.ts` wprost szuka `avg(wo.yield_percent)` ([linia 121](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/analytics/_actions/analytics-data.test.ts:121>)); utrwala obecną definicję. Wykonanie: **nie zostało wykonane**.

### 9. Quality pokazuje dwa różne, błędne Pass Rate

Dashboard jakości dzieli liczbę `passed` przez wszystkie statusy ([get-quality-dashboard.ts:61](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/quality/_actions/get-quality-dashboard.ts:61>)). Statusy obejmują `pending`, `in_progress`, `on_hold` i `cancelled` ([272-quality-inspections.sql:147](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/272-quality-inspections.sql:147>)).

Scenariusz: 8 passed, 2 failed, 90 pending. Ekran pokaże 8%, chociaż pass rate zakończonych inspekcji wynosi 80%.

Jeszcze gorzej na liście inspekcji: mianownik to `pagination.total`, a licznik `passed` pochodzi tylko z bieżącej strony ([inspections-list.client.tsx:172](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/quality/inspections/_components/inspections-list.client.tsx:172>)). Sto zakończonych, zdanych inspekcji przy stronie 25 daje `25/100 = 25%`.

Kierownik jakości może uznać, że proces lub dostawca ma katastrofalną jakość.

Nie znalazłem testu dashboardu. Test komponentu listy używa trzech wierszy i `total=3` ([inspections.test.tsx:107](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/quality/inspections/_components/__tests__/inspections.test.tsx:107>)). Wykonanie: **nie zostało wykonane**.

### 10. Wybrany zakład jest ignorowany przez część agregatów

Topbar przechowuje wybrany site i po zmianie wykonuje `router.refresh()` ([site-switcher.tsx:40](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/components/shell/site-switcher.tsx:40>)). Projektowa ścieżka `withSiteContext` wiąże tę wartość z `app.current_site_id()` ([with-site-context.ts:11](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/auth/with-site-context.ts:11>)).

Mimo tego następujące agregaty używają tylko `withOrgContext` i nie mają predykatów site:

- Production Analytics: [analytics-data.ts:125](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/analytics/_actions/analytics-data.ts:125>);
- Quality dashboard: [get-quality-dashboard.ts:35](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/quality/_actions/get-quality-dashboard.ts:35>);
- Maintenance MWO: [mwo-actions.ts:780](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/maintenance/_actions/mwo-actions.ts:780>).

Scenariusz: site A ma 100 otwartych MWO i słabe OEE; site B ma zero MWO i dobre OEE. Po wybraniu B użytkownik nadal zobaczy dane A+B.

Kierownik zakładu B może skierować zasoby do nieistniejącego problemu albo pominąć własny. Obowiązująca reguła `withSiteContext` była podstawą sklasyfikowania tych ekranów jako błędnych, nie tylko „org-wide z założenia”.

Nie znalazłem testów izolujących agregaty A/B dla tych trzech ekranów. Wykonanie: **nie zostało wykonane**.

### 11. Raport Receipts liczy KPI dopiero po `LIMIT 50`

Zapytanie pobiera najwyżej 50 GRN ([report-read-actions.ts:602](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/reporting/_actions/report-read-actions.ts:602>)), po czym z tych wierszy wylicza `grnCount`, liczbę linii i ilości ([linie 669–687](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/reporting/_actions/report-read-actions.ts:669>)). KPI trafiają na ekran jako totals ([reporting-overview.client.tsx:665](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/reporting/_components/reporting-overview.client.tsx:665>)).

Scenariusz: w okresie było 80 GRN po 10 kg. Raport pokaże 50 GRN i 500 kg zamiast 80 i 800 kg.

Właściciel zaniży przepływ przyjęć i może błędnie ocenić obciążenie magazynu lub rozjazd stanów.

Test ma tylko dwa wiersze i sprawdza sumę tych dwóch ([report-read-actions.test.ts:472](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/reporting/_actions/__tests__/report-read-actions.test.ts:472>)). Wykonanie: **nie zostało wykonane**.

### 12. Filtry i liczniki działają tylko na pobranej stronie

Potwierdzone przypadki:

- LP: globalny `total`, ale `reserved/blocked/hold` liczone z bieżącej strony ([license-plates/page.tsx:137](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/license-plates/page.tsx:137>)); wyszukiwanie klienta filtruje tylko pobrane wiersze ([lp-list.client.tsx:164](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/license-plates/_components/lp-list.client.tsx:164>)).
- Movements: taby i wyszukiwanie filtrują stronę po `LIMIT/OFFSET` ([movement-list.client.tsx:123](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/warehouse/movements/_components/movement-list.client.tsx:123>)).
- Maintenance: serwer pobiera maksymalnie 200 MWO ([mwo-actions.ts:803](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/maintenance/_actions/mwo-actions.ts:803>)), a wyszukiwanie jest dopiero w kliencie ([mwo-list.client.tsx:335](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/maintenance/_components/mwo-list.client.tsx:335>)).

Scenariusz: 100 LP, z czego 60 reserved, ale na pierwszej stronie nie ma żadnego reserved. Nagłówek pokaże „100 total, 0 reserved”. Albo szukane MWO jest rekordem 230 — ekran pokaże brak wyniku.

Kierownik magazynu lub utrzymania ruchu uzna rekord za nieistniejący albo zaniży backlog.

Testy paginacji potwierdzają osobny `total`, lecz testy klientów używają `total === rows.length`; nie ma testu wyszukiwania rekordu poza stroną. Wykonanie: **nie zostało wykonane**.

### 13. NPD „Conversion” nie jest konwersją

[get-pipeline-analytics.ts:28](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/pipeline/_actions/get-pipeline-analytics.ts:28>) liczy bieżącą populację projektów w każdym etapie, a następnie dzieli liczebność sąsiednich wierszy:

```ts
row.count / previous.count
```

([linie 57–63](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/pipeline/_actions/get-pipeline-analytics.ts:57>)). Nie śledzi kohort ani przejść projektów.

Scenariusz: 1 projekt w approval i 100 już launched. Ekran pokaże konwersję launched `10 000%`. Nie oznacza to, że z jednego projektu powstało sto.

NPD manager może bezpodstawnie zmienić gate, zatrzymać projekty lub zwiększyć zasoby etapu.

Nie znalazłem testu `getPipelineAnalytics`. Wykonanie: **nie zostało wykonane**.

### 14. Brak CAPA jest pokazywany jako `0%` closure rate

[complaint-analytics-action.ts:57](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/quality/complaints/_actions/complaint-analytics-action.ts:57>) liczy total/closed, a następnie:

```ts
total === 0 ? 0 : ...
```

UI zawsze dopisuje `%` ([complaints-list.client.tsx:94](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/quality/complaints/_components/complaints-list.client.tsx:94>)).

Scenariusz: nie ma żadnej CAPA. Wskaźnik jest niezdefiniowany, ale ekran pokazuje `0%`, czyli wygląda jak „niczego nie zamknięto”.

Test komponentu używa wyłącznie gotowej wartości 50%; brak testu akcji dla `total=0`. Wykonanie: **nie zostało wykonane**.

### 15. Ostrzeżenie Finance sumuje surowe ilości różnych JM

Wartość zapasu jest liczona poprawnie, ale ostrzeżenie o niewycenionych LP robi:

```sql
coalesce(sum(quantity), 0)
```

([get-inventory-valuation.ts:138](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/finance/valuation/_actions/get-inventory-valuation.ts:138>)).

Scenariusz: 10 kg i 5 pudełek bez kosztu → ostrzeżenie pokazuje jedną ilość `15`. Tekst uczciwie mówi „surowa ilość”, ale nadal jest to suma bez wspólnego wymiaru.

Kontroler finansowy może użyć jej do oceny skali brakującej wyceny i porównać nieporównywalne okresy.

Test wprost oczekuje takiej surowej sumy ([get-inventory-valuation.test.ts:196](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/finance/valuation/_actions/__tests__/get-inventory-valuation.test.ts:196>)). Wykonanie: **nie zostało wykonane**.

## 3. CO WYSZŁO CZYSTO

- WAC jest rzeczywiście ważony: stan przechowuje sumę ilości i wartości, a `avg_cost = total_value / total_qty_kg` ([199-finance…sql:176](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/199-finance-schema-and-rbac-seed.sql:176>)). Aktualizacje dodają wartości jako PostgreSQL `numeric`, bez średniej arytmetycznej ([upsert-wac.ts:166](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/finance/upsert-wac.ts:166>)).

- Monetarna część Inventory Valuation konwertuje stan do `base_qty_kg`, liczy `sum(base_qty_kg * wac)`, rozdziela waluty i sumuje w TypeScript przez mikro-6/`bigint` ([get-inventory-valuation.ts:121](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/finance/valuation/_actions/get-inventory-valuation.ts:121>)).

- Dashboard produkcji poprawnie rozdziela dzisiejszy output po `uom`; 200 kg + 500 pcs nie staje się 700 kg ([dashboard-data.ts:202](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_actions/dashboard-data.ts:202>)). Jego 25-wierszowa lista także filtruje output do JM WO ([dashboard-queries.ts:71](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_lib/dashboard-queries.ts:71>)).

- Reporting Inventory grupuje ilości po JM i osobno sumuje tylko kilogramy; terminalne LP są wykluczone ([report-read-actions.ts:483](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/reporting/_actions/report-read-actions.ts:483>)).

- Reporting Shipments ogranicza listę do 50, ale KPI liczy osobnym, nieograniczonym zapytaniem statusowym; miękko usunięte shipments i boxes są wykluczone ([report-read-actions.ts:735](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/reporting/_actions/report-read-actions.ts:735>)).

- Reporting Quality pokazuje surowe liczniki wg statusu, bez fałszywego pass rate, i stosuje site scope ([report-read-actions.ts:839](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/reporting/_actions/report-read-actions.ts:839>)).

- MRP grupuje on-hand, demand i supply po JM. Odebrane PO i wysłane SO są najpierw agregowane do właściwego ziarna, więc złączenia nie mnożą ilości; anulowane/usunięte rekordy są odfiltrowane ([mrp.ts:269](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp.ts:269>)).

- PO Aging najpierw liczy jedną wartość na PO, a dopiero później sumuje bucket; waluty pozostają osobno ([get-po-aging.ts:44](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/actions/get-po-aging.ts:44>)).

- Shipping SO i Shipment stosują te same filtry do `count(*)` i danych przed `LIMIT/OFFSET`; soft-delete jest respektowany ([so-actions.ts:543](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts:543>), [pack-actions.ts:400](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/_actions/pack-actions.ts:400>)).

- „Remaining to pack” używa mikro-6, liczy per linia i agreguje osobno po JM ([shipment-pack-completeness.ts:44](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/shipping/shipment-pack-completeness.ts:44>)).

- Routing Cost Preview agreguje role wewnątrz lateralnego podzapytania do jednej stawki operacji, a następnie sumuje operacje. Nie powiela jednorazowych składników jak funkcja WIP ([cost-preview.ts:70](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/routings/_actions/cost-preview.ts:70>)).

- Multi-site Network grupuje zapas po `uom` i wyklucza terminalne LP ([multi-site/page.tsx:97](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/multi-site/page.tsx:97>)).

W sprawdzonych ścieżkach finansowych nie znalazłem potwierdzonego konkatenowania PostgreSQL `numeric` przez `a + b` ani leksykograficznego sortowania liczb. Krytyczne pieniądze zwykle pozostają jako tekst/`numeric` lub przechodzą przez `Dec`/mikro-6.

## 4. CZEGO NIE SPRAWDZIŁEM

- Testy, build, lint, typecheck, Playwright i baza: **nie zostało wykonane**.
- Nie sprawdziłem rzeczywistych danych w Supabase, aktualności materialized views ani tego, które migracje są faktycznie zastosowane.
- Nie potwierdziłem zachowania RLS i site context na żywej bazie.
- Nie renderowałem ekranów w przeglądarce, więc nie weryfikowałem końcowego formatowania locale/zaokrągleń.
- Nie audytowałem zewnętrznych raportów BI, eksportów D365, PDF ani plików przygotowanych poza aplikacją.
- Nie obejmowałem liczników administracyjnych, onboardingowych i audytowych, które nie opisują stanu, kosztu, jakości, produkcji ani wysyłki.
- NPD Costing Rollup pozostaje nierozstrzygnięty: odczytuje poprawne `numeric`, lecz zmienia je na JS `number` ([get-costing-rollup.ts:51](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/_actions/get-costing-rollup.ts:51>)). Nie mam konkretnego, realistycznego przypadku, w którym błąd binarny zmienia widoczną wartość po zaokrągleniu, więc nie oznaczyłem go jako błędny.
- Testy `*.pg.test.ts` nie są wiarygodnym dowodem bez uruchomienia. Przykładowo WAC robi `describe.skip` bez `DATABASE_URL` ([upsert-wac.pg.test.ts:14](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/finance/__tests__/upsert-wac.pg.test.ts:14>)), natomiast test dashboardu produkcji bez tej zmiennej kończy się głośnym błędem ([dashboard-data.pg.test.ts:22](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_actions/dashboard-data.pg.test.ts:22>)). Nie twierdzę, że którykolwiek test obecnie przechodzi.

Poza zakresem audytu: środowisko raportuje Vercel CLI 56.3.1. Mocno zalecana jest aktualizacja do 58.7.1 lub nowszej przez `pnpm add -g vercel@latest`; aktualizacja **nie została wykonana**.

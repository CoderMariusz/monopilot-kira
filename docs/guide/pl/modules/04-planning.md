# Planowanie — MRP / prognozy / dostawcy / tworzenie ZZ·ZP·ZR + numeracja dokumentów (przewodnik modułu)

> Szczegółowy przewodnik modułu. Każde stwierdzenie poniżej jest powiązane z rzeczywistym plikiem w
> `apps/web/…` lub `packages/…`; nic nie jest wymyślone. Moduł stanowi
> część łańcucha dostaw odpowiedzialną za **tworzenie dokumentów**:
> wystawia dokumenty (Zamówienia Zakupu, Zlecenia Przesunięcia, Zlecenia Robocze),
> bilansuje popyt z podażą (MRP), rejestruje popyt niezależny (prognozy),
> zarządza **kartoteką dostawców** oraz konfiguruje **numerację / archiwizację dokumentów**.
> Moduł **nie** przyjmuje towarów (to Magazyn — zob. `06-purchasing.md`),
> nie realizuje ZR (Produkcja — `08-production.md`) ani nie harmonogramuje ich
> skończoną pojemnością (to **Harmonogram** w 07-planning-ext z własnym przewodnikiem
> — jest tu jedynie odsyłacz).
>
> Wszystkie ekrany Planowania mieszczą się w jednej grupie tras:
> `…/(modules)/planning/…` → `/planning/{mrp,forecasts,reorder-thresholds,
> suppliers,purchase-orders,transfer-orders,work-orders,schedule,carriers,import}`.
> Trasy zapisane są bez prefiksu `[locale]`. Ostatni przegląd względem roboczego
> drzewa plików (pętla MRP E6, fracht/karta wyników E9, odwrócenie przyjęcia
> przesunięcia R4, import/eksport E-IO).

---

## a. Przegląd

Planowanie odpowiada na dwa pytania i wytwarza trzy dokumenty.

**„Czego potrzebujemy?"** — ekran **MRP** (`/planning/mrp`) wykonuje najpierw odczyt,
a następnie bilansowanie: stan magazynowy + otwarta podaż vs. otwarte zapotrzebowanie
ze zleceń roboczych **i** niezależne **prognozy popytu**, dla każdego indeksu,
w podstawowej jednostce miary, z dokładnością do mikrojednostek (bez zaokrągleń JS float).
Każdy niedobór generuje **sugerowaną akcję** (KUP / WYTWÓRZ) i — gdy przebieg zostanie
**zapisany** — wiersz `mrp_planned_orders`, który można **przekształcić** bezpośrednio
w roboczy ZZ lub ZR. Zakres bilansu kształtują dwa ekrany konfiguracji:
**progi uzupełnień** (`/planning/reorder-thresholds`, minimalna ilość i lot zamawiania
per indeks + preferowany dostawca) oraz **prognozy popytu** (`/planning/forecasts`,
edytowalna siatka tygodni ISO z popytem niezależnym).

**„Od kogo kupujemy?"** — **kartoteka dostawców** (`/planning/suppliers`) jest
rejestrem z miękkim usuwaniem (`active / inactive / blocked`), z indywidualnym
czasem realizacji i **kartą wyników E9** (terminowość %, odchylenie ilości, liczba
niezgodności NCR) wyliczaną z rzeczywistych przyjęć ZZ i niezgodności jakościowych.

**Trzy dokumenty** — Zamówienia Zakupu, Zlecenia Przesunięcia i Zlecenia Robocze są
wszystkie **tworzone tutaj** i przetwarzane przez egzekwowany po stronie serwera automat
stanów. Każdy otrzymuje numer dokumentu właściwy dla organizacji z silnika
**`nextDocumentNumber`** (prefiks + część daty + sekwencja z dopełnieniem zerami),
konfigurowanego w **Ustawienia → Dokumenty**. ZZ zamawia materiał od dostawcy; ZP
przemieszcza rzeczywisty towar między magazynami (wydanie pobiera LP metodą FEFO,
przyjęcie tworzy docelowe LP); ZR tworzy migawkę aktywnego BOM + marszruty
+ specyfikacji fabrycznej i po **zwolnieniu** staje się obiektem wykonywanym przez Produkcję.

Błędy są odwracalne na etapie **roboczym** (W11-R1: nagłówek + linie w pełni edytowalne,
dopóki dokument nie opuści stanu roboczego) i — w przypadku przesunięć — na etapie
**przyjętym** (R4: `reverseToReceiveLine` unieważnia przyjęte docelowe LP pod CFR-21 e-podpis).

Warstwa akcji mieści się w `planning/_actions/*` (MRP, prognozy, progi, pulpit, fracht)
oraz w podfolderach per dokument
`planning/{purchase-orders,transfer-orders,work-orders,suppliers}/_actions/*`;
wspólne prymitywy zakupowe (schematy zod, pomocnik uprawnień zapisu, autor audytu) to
`planning/_actions/procurement-shared.ts`; numeracja dokumentów to
`apps/web/lib/documents/numbering.ts`.

---

## b. Inwentarz funkcji

> Odczyty/zapisy podają nazwy tabel Postgres, których dotyczą. „Bramka" to uprawnienie
> sprawdzane po stronie serwera **wewnątrz** akcji (brak uprawnienia zwraca typowany
> `{ ok:false, error:'forbidden' }`, nigdy 500). Połowa ZZ odpowiedzialna za **przyjęcie**
> oraz główne akcje zapisu ZZ są udokumentowane w `06-purchasing.md`; jedynie sygnatury
> tworzenia/przejścia są tu powtórzone, ponieważ Planowanie jest miejscem ich
> powstawania.

### MRP — `planning/_actions/mrp.ts` (+ czyste jądro `mrp-compute.ts`)

| Akcja | Co robi | Odczytuje / zapisuje | Bramka | Odwrócenie / korekta |
|---|---|---|---|---|
| `runMrp({persist?})` | Bilansuje **stan − zarezerwowane + otwarta podaż − popyt** dla każdego planowanego indeksu (`rm/ingredient/intermediate/packaging/fg`), w podstawowej JM, jako dokładne liczby całkowite mikro-jednostek. Popyt = pozostałość otwartych `wo_materials` **+** `demand_forecasts` na horyzont przebiegu (niezależny). Podaż = pozostałość linii otwartych ZZ **+** `schedule_outputs` (na magazyn, z eliminacją samozaopatrzenia). Progi wyznaczają dotkliwość poniżej minimum + ilości zamówień + daty realizacji. **`persist:true`** zapisuje jeden nagłówek `mrp_runs` + jeden wiersz `mrp_requirements` na indeks (upsert idempotentny) + sugestie `mrp_planned_orders` + zdarzenie `planning.mrp.completed` w skrzynce wychodzących. | odczytuje `items`, `v_inventory_available`, `wo_materials`, `work_orders`, `demand_forecasts`, `purchase_order_lines`, `grn_items`, `grns`, `schedule_outputs`, `reorder_thresholds`, `suppliers`; zapisuje (persist) `mrp_runs`, `mrp_requirements`, `mrp_planned_orders`, `outbox_events` | odczyt: `scheduler.run.read`; persist wymaga też `npd.planning.write` | — (ponowne uruchomienie upsertuje te same klucze przebiegu; planowane zlecenia są usuwane i wstawiane ponownie) |
| `listMrpRuns()` | Ostatnie zapisane przebiegi (20 najnowszych) dla panelu „Poprzednie przebiegi". | odczytuje `mrp_runs` | `scheduler.run.read` | — (odczyt) |
| `getMrpRunRequirements(runId)` | Rejestr wymagań per indeks dla jednego zapisanego przebiegu (z etykietami indeksów). | odczytuje `mrp_requirements`, `items` | `scheduler.run.read` | — (odczyt) |
| `convertPlannedToPo(ids[])` | Konwertuje `suggested`/`firm` planowane zlecenia **kupna** → robocze ZZ, grupowane według dostawcy (deleguje do `createPurchaseOrder`). Oznacza każde jako `released` z `released_order_id`. Pomija wiersze bez dostawcy / z przekroczeniem precyzji / już skonwertowane. | odczytuje `mrp_planned_orders`, `items`; zapisuje `mrp_planned_orders` (zwolnienie) + tabele ZZ przez create | `planning.mrp.convert` **i** `npd.planning.write` | `cancelPlannedOrder` (gdy jeszcze nie przyjęte) / anulowanie utworzonego roboczego ZZ |
| `convertPlannedToWo(ids[])` | Konwertuje planowane zlecenia **wytwarzania** → robocze ZR (wymaga `active` BOM dla indeksu; deleguje do `createWorkOrder`). Oznacza każde jako `released`. | odczytuje `mrp_planned_orders`, `items`, `bom_headers`; zapisuje `mrp_planned_orders` + tabele ZR przez create | `planning.mrp.convert` **i** `npd.planning.write` | `cancelPlannedOrder` / anulowanie utworzonego roboczego ZR |
| `cancelPlannedOrder(id)` | Anuluje jedno planowane zlecenie (`suggested/firm/released`) → `release_status='cancelled'`; odmawia, gdy powiązane ZZ/ZP ma status `partially_received`/`received` lub powiązane ZR ma status `COMPLETED`/`CLOSED` (`invalid_state`). | odczytuje/zapisuje `mrp_planned_orders`; odczytuje `purchase_orders`, `transfer_orders`, `work_orders`; zapisuje `audit_events` (`planning.mrp_planned_order.cancelled`) | `planning.mrp.convert` **i** `npd.planning.write` | — (ponownie uruchom MRP, aby zregenerować sugestie) |

### Prognozy popytu — `planning/_actions/forecasts.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Bramka | Odwrócenie / korekta |
|---|---|---|---|---|
| `listForecasts(weeks?)` | Edytowalna siatka: okno przyszłych tygodni ISO (domyślnie 12, max 52) × każdy indeks kwalifikujący się do prognoz (`fg/intermediate`) z komórką w oknie, komórki indeksowane tygodniem ISO. | odczytuje `demand_forecasts`, `items` | `scheduler.run.read` | — (odczyt) |
| `upsertForecast({itemId,isoWeek,qty})` | Utwórz lub zaktualizuj JEDNĄ komórkę (unikalny klucz `(org,item,iso_week)`). Ilość wprowadzana w **wyjściowej** JM indeksu, konwertowana na **bazową** wyłącznie przez `lib/uom` (→ `uom_conversion_unavailable` przy braku współczynników pakowania). `source='manual'`. | zapisuje `demand_forecasts`, `audit_events` (`planning.demand_forecast.upserted`) | `planning.forecast.manage` | `deleteForecast` lub upsert ponownie |
| `deleteForecast(id)` | Usuwa jedną komórkę. | usuwa z `demand_forecasts`; zapisuje `audit_events` (`planning.demand_forecast.deleted`) | `planning.forecast.manage` | ponownie dodaj przez `upsertForecast` |
| `copyForecastWeek({fromWeek,toWeek})` | Klonuje wszystkie komórki z `fromWeek` do `toWeek` (niedestrukcyjnie — `ON CONFLICT DO NOTHING`). | zapisuje `demand_forecasts` | `planning.forecast.manage` | usuń skopiowane komórki |
| `importForecastCsv({rows})` | Masowy upsert ze sparsowanego CSV (indeks **CODE** + tydzień ISO + ilość w wyjściowej JM; ≤2000 wierszy). Błędne wiersze są zbierane, nie powodują przerwania; `source='import'`. | odczytuje `items`; zapisuje `demand_forecasts`, `audit_events` | `planning.forecast.manage` | usuń zaimportowane komórki |
| `searchForecastItems(input?)` | Selektor indeksów ograniczony do typów kwalifikujących się do prognoz (`fg/intermediate`). | odczytuje `items` | Zakres RLS | — (odczyt) |

### Progi uzupełnień — `planning/_actions/reorder-thresholds.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Bramka | Odwrócenie / korekta |
|---|---|---|---|---|
| `listReorderThresholds()` | Wszystkie skonfigurowane progi, posortowane po kodzie indeksu, złączone z preferowanym dostawcą (kod/nazwa + czas realizacji). | odczytuje `reorder_thresholds`, `items`, `suppliers` | `scheduler.run.read` | — (odczyt) |
| `upsertReorderThreshold({itemId,minQty,reorderQty,preferredSupplierId?})` | Utwórz lub zaktualizuj dolną granicę dla jednego indeksu (unikalny klucz `(org,item)`). Indeks musi być typem planowanym przez MRP; dostawca (miękki FK) walidowany w obrębie organizacji. | zapisuje `reorder_thresholds`, `audit_events` (`planning.reorder_threshold.upserted`) | `npd.planning.write` | `deleteReorderThreshold` lub upsert ponownie |
| `deleteReorderThreshold(id)` | Usuwa jeden próg. | usuwa z `reorder_thresholds`; zapisuje `audit_events` | `npd.planning.write` | ponownie dodaj przez upsert |
| `searchThresholdItems(input?)` | Selektor indeksów ograniczony do `rm/ingredient/intermediate/packaging`. | odczytuje `items` | Zakres RLS | — (odczyt) |
| `listThresholdSuppliers()` | Aktywni dostawcy + czasy realizacji dla selektora preferowanego dostawcy (deleguje do `listSuppliers`). | odczytuje `suppliers` | Zakres RLS | — (odczyt) |

### Dostawcy — `planning/suppliers/_actions/actions.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Bramka | Odwrócenie / korekta |
|---|---|---|---|---|
| `listSuppliers({status?,q?,limit?})` | Lista dostawców (zakładka statusu + wyszukiwanie po kodzie/nazwie; ≤200). | odczytuje `suppliers` | Zakres RLS | — (odczyt) |
| `getSupplier(id)` | Jeden dostawca (nagłówek + kontakt jsonb + czas realizacji + status). | odczytuje `suppliers` | Zakres RLS | — (odczyt) |
| `createSupplier(input)` | Wstawia dostawcę (`code`, `name`, kontakt, waluta, czas realizacji, domyślny status `active`). `23505` → `already_exists`. | zapisuje `suppliers`, `audit_events` (`planning.supplier.created`) | `npd.planning.write` | `transitionSupplierStatus(...,'inactive'\|'blocked')` (tylko miękkie usunięcie — brak twardego usunięcia) |
| `transitionSupplierStatus(id,status)` | Przejście między `active / inactive / blocked` (model miękkiego usuwania; historia zachowana). | zapisuje `suppliers`, `audit_events` (`planning.supplier.status_changed`) | `npd.planning.write` | powrót do poprzedniego statusu |

### Karta wyników dostawcy + fracht (E9) — `planning/_actions/freight-actions.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Bramka | Odwrócenie |
|---|---|---|---|---|
| `getSupplierScorecard(supplierId)` | Terminowość % + średnie odchylenie ilości % + liczba NCR + ostatnie 10 ZZ, z rzeczywistych przyjęć `grn_items` vs `purchase_order_lines` i `ncr_reports`. Brak relacji (przed migracją) → uczciwie pusta karta. | odczytuje `suppliers`, `purchase_orders`, `purchase_order_lines`, `grn_items`, `grns`, `ncr_reports` | Odczyt w zakresie RLS | — (odczyt) |
| `listCarriers()` / `upsertCarrier(input)` | Kartoteka przewoźników frachtowych (kod/nazwa/tryb/kontakt). **Tymczasowy stub** (należy do ścieżki backendu frachtowego; zostanie zastąpiony z tymi samymi sygnaturami). | odczytuje/zapisuje `carriers`, `audit_events` | odczyt RLS; zapis `freight.manage` | edytuj ponownie |
| `listTransportLanes(carrierId?)` / `upsertTransportLane(input)` | Trasy transportowe przewoźnika (początek/koniec/tryb/koszt). Ten sam status stubu. | odczytuje/zapisuje `transport_lanes`, `carriers`, `audit_events` | odczyt RLS; zapis `freight.manage` | edytuj ponownie |

### Zamówienia Zakupu — `planning/purchase-orders/_actions/*` (tworzenie/przejście; połowa przyjęcia w `06-purchasing.md`)

| Akcja | Co robi | Odczytuje / zapisuje | Bramka | Odwrócenie / korekta |
|---|---|---|---|---|
| `createPurchaseOrder(input)` | Wstawia nagłówek ZZ (`draft`) + ≥1 linia; automatyczny `po_number` przez `nextDocumentNumber('po')` z ponowieniem przy 23505. | zapisuje `purchase_orders`, `purchase_order_lines`, `audit_events` (`planning.purchase_order.created`) | `npd.planning.write` | Anuluj przez `transitionPurchaseOrderStatus(...,'cancelled')` |
| `updatePurchaseOrder` / `addPurchaseOrderLine` / `updatePurchaseOrderLine` / `deletePurchaseOrderLine` | Edycja nagłówka + linii **tylko w stanie roboczym** (usunięcie odmawia dla **ostatniej** linii → `last_line`). | zapisuje `purchase_orders` / `purchase_order_lines`, `audit_events` | `npd.planning.write` | odwrotna edycja (dodaj↔usuń) gdy roboczy |
| `transitionPurchaseOrderStatus(id,status)` | Przechodzi przez `PO_TRANSITIONS` (`draft→sent→confirmed→partially_received→received`, `cancelled`). Stany końcowe nie mają następników. | zapisuje `purchase_orders`, `audit_events` (`planning.purchase_order.status_changed`) | `npd.planning.write` | tylko naprzód + `cancelled`; przyjęcie odwracane na poziomie linii WZ (Magazyn) |
| `validatePoImport` / `commitPoImport` (`import-po.ts`) | **E-IO** masowe tworzenie ZZ z wierszy zgrupowanych według `(supplier_code, external_ref)`; `all_or_nothing` vs `skip_invalid`; pomija referencje będące już `po_number`. | odczytuje `suppliers`, `items`, `unit_of_measure`, `purchase_orders`; zapisuje tabele ZZ + `import_export_jobs` | `npd.planning.write` | anuluj każde utworzone robocze ZZ |
| `createExportJob(input?)` (`create-export-job.ts`) | Eksport CSV bieżącej filtrowanej listy ZZ (dostawca **code**, bez UUID-ów); rejestruje wiersz w `import_export_jobs`. | odczytuje przez `listPurchaseOrders`; zapisuje `import_export_jobs` | `npd.planning.write` (`TODO(E-IO): dedicated io.export.run`) | — (tylko eksport) |
| `canImportPurchaseOrders()` (`import/_actions/can-import-po.ts`) | Sondowanie bramki po stronie serwera dla strony centrum importu (renderuje kreator lub odmowę bez ufania flagie klienckiej). | odczytuje RBAC | rozwiązuje `npd.planning.write` | — (odczyt) |

### Zlecenia Przesunięcia — `planning/transfer-orders/_actions/*`

| Akcja | Co robi | Odczytuje / zapisuje | Bramka | Odwrócenie / korekta |
|---|---|---|---|---|
| `createTransferOrder(input)` | Wstawia nagłówek ZP (`draft`) + ≥1 linia; automatyczny `to_number` przez `nextDocumentNumber('to')` + ponowienie przy 23505. | zapisuje `transfer_orders`, `transfer_order_lines`, `audit_events` (`planning.transfer_order.created`) | `npd.planning.write` | Anuluj przez `transitionTransferOrderStatus(...,'cancelled')` |
| `updateTransferOrder` / `addTransferOrderLine` / `updateTransferOrderLine` / `deleteTransferOrderLine` | Edycja nagłówka + linii **tylko w stanie roboczym** (weryfikacja magazynu w organizacji; magazyn źródłowy ≠ docelowy; odmowa dla ostatniej linii → `last_line`; ciągłe przenumerowanie linii). | zapisuje `transfer_orders` / `transfer_order_lines`, `audit_events` | `npd.planning.write` | odwrotna edycja w stanie roboczym |
| `transitionTransferOrderStatus(id,status)` | Przechodzi przez `TO_TRANSITIONS` (`draft→in_transit→received`, `cancelled`). **`in_transit` WYDAJE rzeczywisty towar** (pobiera FEFO `available`+`released` LP w źródle, waliduje, dekrementuje, łączy w `transfer_order_line_lps`, zapisuje `stock_moves`). **`received` tworzy docelowe LP** (`available`, rodzic = źródłowe LP, QA przeniesione). Anulowanie ZP w_transit z już **przyjętymi** docelowymi LP jest odrzucane (`partially_received`). | odczytuje/zapisuje `transfer_orders`, `transfer_order_lines`, `transfer_order_line_lps`, `license_plates`, `lp_state_history`, `stock_moves`, `audit_events` | `npd.planning.write` | `cancelled` (tylko nieprzyjęte linie); przyjęte linie → `reverseToReceiveLine` |
| `reverseToReceiveLine(input)` (`reverse-receive.ts`) | **R4** — odwrócenie jednej przyjętej linii ZP: unieważnia docelowe LP (`returned`, ilość 0), przywraca źródłowe LP, cofa status ZP (`in_transit`/`partially_received`). **CFR-21 e-podpis**. Odmawia, gdy docelowe LP jest zarezerwowane / przydzielone / wysłane / skonsumowane (`lp_active`). | odczytuje/zapisuje `license_plates`, `transfer_order_line_lps`, `lp_state_history`, `stock_moves`, `transfer_orders`, `audit_events`, `e_sign_log`; emituje `warehouse.lp.transitioned` | `warehouse.transfer.correct` + e-podpis | **jest** odwróceniem przyjęcia ZP |
| `canReverseTransferReceipt()` | Sondowanie serwera bramkujące opcję „Odwróć przyjęcie" w szczegółach ZP. | odczytuje RBAC | rozwiązuje `warehouse.transfer.correct` | — (odczyt) |
| `validateToImport` / `commitToImport` (`import-to.ts`) | **E-IO** masowe tworzenie ZP grupowanych według `external_ref`; pomija referencje będące już `to_number`. | odczytuje `warehouses`, `items`, `unit_of_measure`; zapisuje tabele ZP + `import_export_jobs` | `npd.planning.write` | anuluj każde utworzone robocze ZP |

### Zlecenia Robocze (strona Planowania) — `planning/work-orders/_actions/*`

| Akcja | Co robi | Odczytuje / zapisuje | Bramka | Odwrócenie / korekta |
|---|---|---|---|---|
| `createWorkOrder(input)` | Wstawia nagłówek ZR (`DRAFT`) dla wyrobu gotowego; automatyczny `wo_number` przez `nextDocumentNumber('wo')` + ponowienie przy 23505. **Tworzy migawkę** aktywnego BOM → `wo_materials` (ilość × planowana, zaokrąglenie do 3 dp), aktywnej marszruty → `wo_operations`, podstawowego wiersza `schedule_outputs` i rozwiązuje aktywny nagłówek BOM + zatwierdzoną specyfikację fabryczną na nagłówek (aby preflight zwolnienia Produkcji przeszedł). Zwraca `warning` gdy brak aktywnego BOM / brak zatwierdzonej specyfikacji. | odczytuje `items`, `bom_headers`, `bom_lines`, `routings`, `routing_operations`, `factory_specs`; zapisuje `work_orders`, `wo_materials`, `wo_operations`, `schedule_outputs`, `wo_status_history` | `npd.planning.write` | `cancelWo` w Produkcji (brak anulowania po stronie Planowania) |
| `updateWorkOrder(input)` | Edycja **tylko w stanie roboczym** (produkt / planowana ilość / harmonogram / linia / maszyna / uwagi). Zmiana produktu lub ilości **odświeża migawkę** `wo_materials` + `wo_operations` i ponownie rozwiązuje BOM/specyfikację. | odczytuje `items`, `bom_headers`, `routings`, `production_lines`, `machines`, `factory_specs`; zapisuje `work_orders`, `wo_materials`, `wo_operations`, `wo_status_history` | `npd.planning.write` | edytuj ponownie w stanie roboczym |
| `releaseWorkOrder({id})` | **`DRAFT → RELEASED`** (przekazanie planowanie→produkcja). Samoczynnie uzupełnia `active_bom_header_id` / `active_factory_spec_id` / `uom_snapshot` z wyrobu gotowego gdy brakujące; **blokuje** z `factory_release_incomplete {missing:[active_bom\|factory_spec]}` gdy któreś jest nieobecne. | odczytuje/zapisuje `work_orders`, `bom_headers`, `factory_specs`, `items`; zapisuje `wo_status_history` | `npd.planning.write` | brak „cofnięcia zwolnienia"; ZR trafia do Produkcji (`cancelWo` tam) |
| `listPlanningWorkOrders` / `getPlanningWorkOrder` | Lista ZR (zakładka statusu + wyszukiwanie + okno archiwizacji z `org_document_settings`) i pakiet szczegółów (materiały / operacje / harmonogramy / zależności / historia statusu). | odczytuje `work_orders`, `wo_executions`, `wo_materials`, `wo_operations`, `schedule_outputs`, `wo_dependencies`, `wo_status_history`, `org_document_settings` | Odczyt w zakresie RLS | — (odczyt) |
| `searchFgProducts` / `listProductionResources` (`wo-form-data.ts`) | Selektor wyrobów gotowych do tworzenia ZR + opcje linii produkcyjnej / maszyny. | odczytuje `items`, `production_lines`, `machines` | Zakres RLS | — (odczyt) |
| `validateWoImport` / `commitWoImport` (`import-wo.ts`) | **E-IO** masowe tworzenie ZR grupowanych według `external_ref` (kod WG + ilość + JM → `createWorkOrder`); pomija referencje już zaimportowane. | odczytuje `items`, `unit_of_measure`, `production_lines`, `bom_headers`, `work_orders`; zapisuje tabele ZR + `import_export_jobs` | `npd.planning.write` | anuluj każde utworzone robocze ZR w Produkcji |

### Numeracja dokumentów + pulpit + wspólne

| Akcja (plik) | Co robi | Odczytuje / zapisuje | Bramka |
|---|---|---|---|
| `nextDocumentNumber(client,orgId,docType,now)` (`lib/documents/numbering.ts`) | Atomiczne zwiększenie sekwencji per organizacja per typ (`UPDATE … set next_seq = next_seq + 1 RETURNING next_seq-1`); składa `prefix[-datePart]-padded(seq)`. Inicjuje domyślne ustawienia (`PO/TO/WO`, `YYYYMM`, dopełnienie 4, archiwizacja 30d) przy pierwszym użyciu. | odczytuje/zapisuje `org_document_settings` | nd (wywoływane wewnątrz zabezpieczonego create) |
| `readOrgDocumentSettings()` / `updateOrgDocumentSettings(input)` (`settings/_actions/documents.ts`) | Odczyt / edycja formatu numeracji ZZ·ZP·ZR (prefiks / część daty / dopełnienie) + `archive_after_days`. **(Należy do modułu Ustawienia, dostępne jako Ustawienia → Dokumenty.)** | odczytuje/zapisuje `org_document_settings` | odczyt `settings.org.read`; zapis `settings.infra.update` |
| `getPlanningDashboard()` (`_actions/dashboard-data.ts`) | KPI na stronie głównej Planowania (otwarte ZR / ZR na dziś / otwarte ZZ / otwarte ZP) + alerty ZR przekroczonych terminów + alerty przeterminowanych ZZ/ZP + pasek harmonogramu 7-dniowego — wszystko rzeczywiste, z zakresem organizacji. | odczytuje `work_orders`, `purchase_orders`, `transfer_orders` | `scheduler.run.read` |
| `listOrgUnits(client)` / `searchPoItems` / `listPoUnits` / `listTransferUnits` / `uom-dropdown.ts` | Złącza selektora JM + indeksów dla rozwijanych list linii ZZ/ZP (rzeczywista `unit_of_measure`; jednostki dodane przez administratora pojawiają się — nigdy zakodowana lista). | odczytuje `unit_of_measure`, `items` | Zakres RLS |

**Zinwentaryzowana liczba akcji: 41** — 6 MRP, 6 prognozy, 5 progi uzupełnień, 4 dostawcy,
3 karta wyników dostawcy/fracht, 7 tworzenie/import/eksport/bramka ZZ, 7
tworzenie/odwrócenie/import ZP, 6 tworzenie/zwolnienie/import ZR + dane formularza,
plus silnik numeracji dokumentów + konfiguracja Ustawień + pulpit + złącza JM.
Rdzeniem tworzenia jest `createPurchaseOrder` / `createTransferOrder` / `createWorkOrder` +
`runMrp` + trzy przejścia automatu stanów.

---

## c. Automaty stanów

### Cykl życia przebiegu MRP (najpierw odczyt; tylko `persist` zapisuje)

```
 runMrp({persist:false})  ──►  wynik tylko na ekranie (nic nie zapisane)
 runMrp({persist:true})   ──►  mrp_runs(status='completed')
                                 ├─ mrp_requirements   (jeden wiersz / zbilansowany indeks; upsert)
                                 └─ mrp_planned_orders (release_status='suggested')
                                          │  convertPlannedToPo / convertPlannedToWo
                                          ▼
                                    release_status='released' (released_order_id → PO/WO)
                                          │  cancelPlannedOrder
                                          ▼
                                    release_status='cancelled'
```

- Zapisany przebieg jest **nigdy nie wznawiany**: ponowne uruchomienie `runMrp` upsertuje
  te same wiersze wymagań `(run_id,item_id,bucket_date,bom_level)` i **usuwa i ponownie wstawia**
  `suggested` planowane zlecenia, więc ponowne przebiegi nie duplikują.
- `mrp_runs.demand_source` zmienia wartość `manual → forecast` gdy jakikolwiek wkład
  `demand_forecasts` zasilił bilansowanie; `mrp_requirements.source_type` ma wartość
  `independent` dla indeksów napędzanych prognozą, w pozostałych przypadkach `dependent`.
- Planowane zlecenie jest **nieodwołalne** po tym, jak powiązane ZZ/ZP przyjmie status
  `partially_received`/`received` lub powiązane ZR status `COMPLETED`/`CLOSED`.

### Cykl życia Zamówienia Zakupu (`PO_TRANSITIONS`, `purchase-orders/_actions/actions.ts:685`)

```
 draft ──► sent ──► confirmed ─┬─► partially_received ──► received  (terminal)
   │         │          │      └─► received (terminal)
   └─► cancelled (i z sent / confirmed / partially_received)
```

Edytowalny **tylko w stanie `draft`**. `partially_received`/`received` są zazwyczaj zapisywane
przez transakcję **przyjęcia** (Magazyn), nie przez przycisk. Brak „powrotu do roboczego",
brak „cofnięcia przyjęcia" nagłówka. Pełne szczegóły + połowa przyjęcia: `06-purchasing.md`.

### Cykl życia Zlecenia Przesunięcia (`TO_TRANSITIONS`, `transfer-orders/_actions/actions.ts:667`)

```
 draft ──wydanie──► in_transit ──przyjęcie──► received  (terminal)
   │                    │   │                    ▲
   │                    │   └──► partially_received ──► received
   │                    │            │ (po odwróceniu przyjęcia linii)
   └─► cancelled        └─► cancelled (tylko nieprzyjęte linie)
```

| Stan | Dozwolone następne | Efekt na stanie magazynowym | Uwagi |
|---|---|---|---|
| `draft` | `in_transit`, `cancelled` | — | jedyny edytowalny stan |
| `in_transit` | `received`, `cancelled` | **wydanie** pobiera FEFO `available`+`released` LP w źródle, dekrementuje je (pełne wyczerpanie → `shipped`), rejestruje pobrania w `transfer_order_line_lps` | walidacja przed: brak towaru w źródle → `insufficient_stock`, nic nie zapisane |
| `partially_received` | `received`, `cancelled` | osiągany tylko po `reverseToReceiveLine`, które cofnęło przyjęcie linii | cofa status akcja odwrócenia |
| `received` | — (terminal) | **przyjęcie** tworzy docelowe LP (`available`, rodzic = źródłowe LP, QA przeniesione — przesunięcie wewnętrzne **nie** trafia ponownie do kwarantanny) | odwróć przyjętą linię przez `reverseToReceiveLine` (R4) |
| `cancelled` | — (terminal) | przywraca źródłowe LP tylko dla **nieprzyjętych** linii | anulowanie jest **odmawiane** gdy jakiekolwiek docelowe LP jest już przyjęte (`partially_received`) — najpierw odwróć te linie |

### Cykl życia Zlecenia Roboczego — tylko część Planowania

```
 (createWorkOrder)         (updateWorkOrder, odświeżenie migawki tylko w stanie roboczym)
        │                            │
        ▼                            ▼
      DRAFT ───────── releaseWorkOrder ──────► RELEASED ──► (Produkcja zarządza resztą)
        │  factory_release_incomplete {missing} blokuje zwolnienie do czasu
        │  aż istnieje aktywny BOM + zatwierdzona/zwolniona specyfikacja fabryczna
        └─ brak anulowania po stronie Planowania; ZR anulowane jest w Produkcji
```

Planowanie jest właścicielem `DRAFT → RELEASED`; wszystko od `in_progress` wzwyż należy do
automatu stanów 08-production (zob. `08-production.md`). Dwa dokumenty końcowe są odwracalne
tylko na krawędzi roboczej (ZZ/ZP/ZR) lub — w przypadku przesunięć — na krawędzi przyjętej
przez e-podpisane odwrócenie R4.

<!-- screenshot: planning/mrp results table (KPI tiles + severity badges + suggested actions + planned-orders) -->
<!-- screenshot: planning/forecasts ISO-week grid -->
<!-- screenshot: planning/transfer-orders/[id] detail (ship/receive transitions + reverse-receipt) -->

---

## d. Instrukcje dla użytkownika

> Etykiety przycisków poniżej są dosłownymi angielskimi napisami z pakietu i18n `Planning.*`
> (`apps/web/i18n/en.json`); `data-testid`y w nawiasach są stabilnymi kotwicami
> w kodzie komponentu. Do każdego ekranu można dotrzeć z podnawigacji **Planowanie**
> („Sekcje planowania" — Zlecenia robocze / Zamówienia zakupu / Zlecenia przesunięcia /
> Dostawcy / MRP / Harmonogram linii / Progi uzupełnień / Prognozy / Przewoźnicy).

### (i) Uruchomienie MRP i konwersja niedoborów na ZZ / ZR

1. Przejdź do **Planowanie → MRP** (`/planning/mrp`).
2. (Opcjonalnie) zaznacz **"Save this run"** (`mrp-persist-toggle`), aby zapisać przebieg
   do historii MRP i wygenerować konwertowalne planowane zlecenia. Pozostawienie bez zaznaczenia
   to czysto odczytowa analiza „co by było, gdyby" — *"Read-only analysis: nothing is saved and no orders are created."*
3. Kliknij **"Run MRP"** (`mrp-run-button`). Kafle KPI się wypełniają (**Items short**,
   **Demand coverage**, **Items analyzed**, **Total open demand**, **Below min**), a tabela
   wyników wymienia każdy planowany indeks z wartościami **On hand / Reserved / Open supply /
   Demand / Net position** i odznaką **Suggested action** (**BUY** / **MAKE** / —).
   Czerwona odznaka **Shortage** / bursztynowa **Below min** sygnalizuje luki.
4. W przypadku **zapisanego** przebiegu pojawia się panel **Planned orders**. Zaznacz wiersze,
   które chcesz (`mrp-planned-select-<id>`), a następnie kliknij **"Create PO"**
   (`mrp-create-po-button`) dla wierszy kupna lub **"Create WO"** (`mrp-create-wo-button`)
   dla wierszy wytwarzania. Wiersze kupna są grupowane per dostawcę w robocze ZZ; wiersze
   wytwarzania wymagają aktywnego BOM. Linia informacyjna raportuje, ile zostało
   utworzonych / pominiętych.
5. **"Previous runs"** wyświetla zapisane `mrp_runs`; rozwiń **Details**, aby zobaczyć
   rejestr wymagań tego przebiegu.

### (ii) Przegląd / korekta prognozy popytu

1. Przejdź do **Planowanie → Prognozy** (`/planning/forecasts`). Siatka pokazuje kolejne
   12 tygodni ISO × każdy indeks prognozy (WG / półprodukt), w bazowej JM indeksu.
2. **Dodaj produkt** — kliknij **"+ Add product"**, wyszukaj po kodzie/nazwie, wybierz;
   pojawi się nowy wiersz.
3. **Edytuj komórkę** — wpisz ilość (w **wyjściowej** jednostce indeksu; serwer konwertuje
   na bazową) bezpośrednio w komórkę tygodnia; zapisuje się po utracie fokusu
   (`upsertForecast`). Błędna hierarchia pakowania powoduje komunikat „Save failed".
4. **Przesuń tydzień do przodu** — **"Copy previous week"** klonuje komórki poprzedniego
   tygodnia do następnego (niedestrukcyjnie) → `copyForecastWeek`.
5. **Masowe ładowanie** — **"Import CSV"** otwiera modal wklejania i parsowania (kolumny:
   kod indeksu, tydzień ISO np. `2026-W25`, ilość) → `importForecastCsv`; nieznane indeksy
   / błędne wartości są pomijane i zliczane.
6. Te prognozy stają się **popytem niezależnym** w kolejnym przebiegu MRP (przebieg
   uzyskuje wtedy atrybut `demand_source='forecast'`).

### (iii) Konfiguracja progu uzupełnienia

1. Przejdź do **Planowanie → Progi uzupełnień** (`/planning/reorder-thresholds`).
2. Kliknij **"+ Add threshold"**, wybierz indeks (`rm/ingredient/intermediate/packaging`),
   ustaw **Minimum quantity** i **Reorder quantity** (obie w bazowej JM; zamówienie 0 =
   „uzupełnij tylko do minimum") oraz opcjonalnie **Preferred supplier** (jego czas realizacji
   steruje sugerowaną datą realizacji). **Save** → `upsertReorderThreshold`.
3. Próg steruje teraz dotkliwością **Below min** + sugerowanymi ilościami partii w MRP —
   indeks poniżej minimum pojawia się nawet przy zerowym popycie/stanie.

### (iv) Dodanie / zatwierdzenie / zablokowanie dostawcy

1. Przejdź do **Planowanie → Dostawcy** (`/planning/suppliers`).
2. Kliknij **"New supplier"** (`Planning.suppliers.actions.newSupplier`). W modalu tworzenia
   ustaw **Supplier code\***, **Name\***, **Currency (ISO-4217)\***, **Default lead time (days)\***
   i **Status** (domyślnie Active). Wyślij **"Create supplier"** → `createSupplier`.
   Zduplikowany kod → "A supplier with that … already exists".
3. **Zatwierdź / dezaktywuj / zablokuj** — **brak twardego usunięcia**; ze szczegółów dostawcy
   użyj kontrolki statusu, aby przejść między **Active / Inactive / Blocked**
   (`transitionSupplierStatus`). Zablokowani dostawcy nie mogą być używani w nowych ZZ;
   nieaktywni są miękkiej usunięci, ale zachowani w historii.
4. **Karta wyników** — otwórz dostawcę → jego strona **scorecard**
   (`/planning/suppliers/[id]/scorecard`) pokazuje terminowość %, średnie odchylenie ilości %
   i liczby NCR z rzeczywistych przyjęć (`getSupplierScorecard`).

### (v) Tworzenie ZZ z poziomu Planowania

1. **Planowanie → Zamówienia Zakupu** (`/planning/purchase-orders`) → **"Create PO"**.
2. W modalu tworzenia (`create-po-modal.tsx`): pozostaw **PO number** puste dla autonumeru;
   wybierz **Supplier** (wymagane); ustaw **Expected delivery / Currency / Notes**; dodaj linie
   przez **"+ Add line"** (selektor indeksów → rzeczywiste `items`, **Qty** >0,
   **UoM** z rzeczywistej listy `unit_of_measure`, **Unit price** ≥0). Wymagana co najmniej
   jedna linia. **"Create PO"** → `createPurchaseOrder` (ZZ w stanie `draft`).
3. Prowadź je dalej z panelu statusu na ekranie szczegółów (**Send → Confirm**);
   przyjęcie przesuwa je do stanu received (Magazyn). Edytuj linie/nagłówek **tylko w stanie roboczym**.
   *(Pełny ZZ + instrukcja przyjęcia: `06-purchasing.md`.)*

### (vi) Tworzenie ZP (przesunięcie towaru między magazynami)

1. **Planowanie → Zlecenia Przesunięcia** (`/planning/transfer-orders`) → **"Create TO"**.
2. W modalu tworzenia: pozostaw **TO number** puste dla autonumeru (np. `TO-202606-0007`);
   wybierz **From warehouse** i **To warehouse** (muszą być różne); ustaw datę **Scheduled**;
   dodaj linie (indeks + ilość + JM). **"Save & Plan"** → `createTransferOrder`
   (`draft`).
3. Na ekranie szczegółów: **wydanie** (`draft → in_transit`) pobiera FEFO i dekrementuje
   rzeczywiste źródłowe LP; **przyjęcie** (`in_transit → received`) tworzy docelowe LP w
   magazynie docelowym. Błędnie przyjęta linia może zostać cofnięta przez **Reverse receipt**
   (`reverseToReceiveLine`, wymaga `warehouse.transfer.correct` + e-podpis).

### (vii) Tworzenie i zwalnianie ZR z poziomu Planowania

1. **Planowanie → Zlecenia Robocze** (`/planning/work-orders`) → **"Create WO"** (lub
   formularz pełnostronicowy pod `/planning/work-orders/new`).
2. Wybierz **Product (finished good)** przez selektor, wprowadź **Planned quantity**
   (+ jednostka), opcjonalnie harmonogram / linia / maszyna / uwagi. **"Create work order"** →
   `createWorkOrder`. BOM, marszruta i podstawowy wynik harmonogramu są teraz migawkowane;
   brak aktywnego BOM lub zatwierdzonej specyfikacji fabrycznej zwraca nieblokującą odznakę
   **warning** na liście (**No BOM**).
3. **Zwolnienie** — na liście/szczegółach akcja **"Release"**
   (`Planning.workOrders.list.release`, potwierdź „Release work order {wo}? This commits
   it to production.") uruchamia `releaseWorkOrder` → `DRAFT → RELEASED`. Brak aktywnego
   BOM lub zatwierdzonej/zwolnionej specyfikacji fabrycznej powoduje **blokadę**
   (`factory_release_incomplete`). Zwolnione ZR jest od tego momentu własnością Produkcji.

### (viii) Konfiguracja numeracji i archiwizacji dokumentów

1. Przejdź do **Ustawienia → Dokumenty** (`readOrgDocumentSettings` /
   `updateOrgDocumentSettings` — moduł Ustawienia, nie Planowanie).
2. Dla każdego typu dokumentu (**PO / TO / WO**) ustaw **prefiks**, **część daty**
   (`none / YYYY / YYYYMM / YYYYMMDD`), **dopełnienie sekwencji** (3–8) i
   **archiwizuj po N dniach**. Zapisz → `updateOrgDocumentSettings`
   (bramka `settings.infra.update`).
3. Następne utworzone ZZ/ZP/ZR pobiera swój numer z `nextDocumentNumber`, który atomicznie
   inkrementuje `org_document_settings.next_seq` i składa np. `PO-202606-0042`.
   Zakładka **Archive** na ekranach listy używa `archive_after_days` do składowania
   dokumentów końcowych poza oknem.

---

## e. Źródła danych (tabele Supabase)

MRP / prognozy / progi uzupełnień (odczyt/zapis):

- `mrp_runs` — nagłówek zapisanego przebiegu (`run_number`, `demand_source`, horyzont, liczniki).
- `mrp_requirements` — zbilansowany rejestr per indeks (`gross/scheduled/projected/net`, `source_type`, `exception_type`; klucz upsert `(run_id,item_id,bucket_date,bom_level)`).
- `mrp_planned_orders` — sugestie KUP/WYTWÓRZ (`release_status`, `released_order_id`, `supplier_id`).
- `demand_forecasts` — niezależny popyt per `(org,item,iso_week)` w bazowej JM (`source` manual/import).
- `reorder_thresholds` — per indeks `min_qty` / `reorder_qty` / `preferred_supplier_id`.
- `v_inventory_available` — model odczytu FEFO stan+zarezerwowane (wejście do bilansu; odczyt).
- `wo_materials`, `schedule_outputs`, `purchase_order_lines`, `grn_items`, `grns` — wejścia popytu / podaży (odczyt).

Dostawcy / fracht:

- `suppliers` — kartoteka dostawców (kod/nazwa/kontakt/waluta/czas realizacji/status).
- `carriers`, `transport_lanes` — fracht E9 (tymczasowy stub; mig 316).
- `ncr_reports` — liczby NCR karty wyników dostawcy (odczyt; uczciwie puste gdy brak).

Dokumenty (odczyt/zapis):

- `purchase_orders`, `purchase_order_lines` — nagłówek + linie ZZ.
- `transfer_orders`, `transfer_order_lines`, `transfer_order_line_lps` — nagłówek + linie + łącze LP wydania/przyjęcia ZP (stan prawdziwy w tranzycie).
- `work_orders`, `wo_materials`, `wo_operations`, `wo_executions`, `wo_dependencies`, `wo_status_history` — nagłówek + migawka BOM/marszruty + ślad statusu ZR.
- `bom_headers`, `bom_lines`, `routings`, `routing_operations`, `factory_specs` — źródła migawek dla tworzenia/zwolnienia (odczyt).
- `license_plates`, `lp_state_history`, `stock_moves` — mutacje stanu magazynowego przy wydaniu/przyjęciu/odwróceniu ZP.
- `org_document_settings` — format numeracji ZZ/ZP/ZR per organizacja + `archive_after_days`.
- `import_export_jobs` — rejestr importu/eksportu E-IO.
- `unit_of_measure`, `items`, `warehouses`, `production_lines`, `machines` — odczyty referencyjne dla selektorów.

Zarządzanie:

- `audit_events` — każdy zapis Planowania (`planning.{purchase_order,transfer_order,supplier,reorder_threshold,demand_forecast,mrp_planned_order,carrier,transport_lane}.*`, `planning.transfer_order.receive_reversed`).
- `e_sign_log` — e-podpis CFR-21 dla `reverseToReceiveLine` (odwrócenie przyjęcia przesunięcia R4).
- `outbox_events` — `planning.mrp.completed`, `warehouse.lp.transitioned` (odwrócenie przyjęcia przesunięcia).

---

## f. Znane luki / TODO

Oparte na przeczytanym kodzie — bez domysłów:

1. **Bramka zapisu Planowania `npd.planning.write` jest ciągiem znaków z rodziny NPD i
   NIE jest zadeklarowana w wyliczeniu RBAC.** Każde tworzenie ZZ/ZP/ZR/dostawcy/progu
   sprawdza `hasPlanningWritePermission` względem literału `'npd.planning.write'`
   (`_actions/procurement-shared.ts:5`), ale `packages/rbac/src/permissions.enum.ts`
   nie ma takiego składnika (`PLANNING_MRP_RUN`, `PLANNING_MRP_CONVERT`,
   `PLANNING_FORECAST_MANAGE`, `FREIGHT_MANAGE` istnieją; bramka zapisu nie). Jest
   niewidoczna dla strażnika blokady wyliczenia i macierzy Ustawienia → Role. Własność
   jest też myląca (prefiks NPD blokujący zapisy planowania). Należy promować ją do
   prawdziwego składnika wyliczenia `planning.*`.

2. **Bramka odczytu to `scheduler.run.read` (uprawnienie 07-planning-ext).** MRP,
   prognozy, progi i pulpit blokują odczyt na `scheduler.run.read`
   (bramka podstawowa planowania w rejestrze modułu), a `PLANNING_MRP_RUN`
   (`planning.mrp.run`) jest zadeklarowany w wyliczeniu, ale **nigdy nie odczytywany**
   przez `runMrp` — przebieg ponownie wykorzystuje `scheduler.run.read` + (dla persist)
   `npd.planning.write`. Zadeklarowany-lecz-nieużywany `planning.mrp.run` powinien albo
   blokować przebieg, albo zostać usunięty.

3. **Zapis prognozy używa `planning.forecast.manage`, ale wyliczenie MA RÓWNIEŻ
   `scheduler.forecast.read` / `scheduler.forecast.write`.** Istnieją dwie równoległe
   rodziny uprawnień prognoz (faktycznie podłączone tu `planning.forecast.manage` z modułu 04
   vs `scheduler.forecast.*` z modułu 07). Należy ujednolicić tak, aby był jeden właściciel.

4. **MRP to wycinek jednego bucketa bez eksplozji BOM.** `runMrp` bilansuje jeden bucket
   (`bucket_date = today`, `bom_level = 0`) bez wielookresowego horyzontu i bez eksplozji
   BOM (`mrp.ts:11-14`). Udokumentowane zastrzeżenia: w pełni zarezerwowane LP jest
   niewidoczne (bilans nie naruszony); będące w toku ZR, które już wydało podwojoną ilość,
   liczy dwa razy swoje `schedule_outputs` do czasu zakończenia (`mrp-compute.ts:17-24`).
   Niedobory WG mogą sugerować WYTWÓRZ tylko gdy istnieje aktywny BOM.

5. **`convertPlannedToTo` nie istnieje.** `mrp_planned_orders` może być typu `transfer`,
   ale zaimplementowane są tylko `convertPlannedToPo` / `convertPlannedToWo` — planowane
   zlecenie przesunięcia nie może być automatycznie przekształcone w ZP (musi być wystawione
   ręcznie).

6. **Fracht / przewoźnicy / trasy transportowe to tymczasowy stub.**
   `freight-actions.ts:6-11` jest wprost plikiem tymczasowym należącym do ścieżki backendu
   frachtowego (te same sygnatury do wymiany); odczyty tolerują brakującą relację mig-316,
   zwracając puste wyniki. Odczyt **karty wyników** dostawcy jest rzeczywisty, ale zapisy
   przewoźnik/trasa są placeholderem do czasu tej wymiany.

7. **Eksport ZZ ponownie używa uprawnienia zapisu planowania.** `createExportJob` ma
   `TODO(E-IO): dedicated io.export.run permission` (`create-export-job.ts:25`) i blokuje
   na `npd.planning.write`; centralna powierzchnia **importu** centrum Import/Eksport
   Ustawień jest renderowana jako wyłączona, a głęboki link **Import** ZZ prowadzi do
   `/planning/import?source=po` (zweryfikuj podłączenie). Tak samo jak odnotowano w
   `06-purchasing.md`.

8. **Brak „cofnięcia zwolnienia" ZR i braku anulowania ZR po stronie Planowania.**
   `releaseWorkOrder` jest jednokierunkowy `DRAFT → RELEASED`; zwolnione ZR może być
   anulowane tylko w Produkcji (`cancelWo`). Edycje robocze odświeżają migawkę
   materiałów/operacji, ale po zwolnieniu możliwości edycji Planowania znikają
   (`invalid_state`).

9. **Konfiguracja numeracji dokumentów należy do Ustawień, nie Planowania.**
   Edytor `org_document_settings` (`settings/_actions/documents.ts`) blokuje na
   `settings.infra.update` / `settings.org.read`. Zaznaczone, aby czytelnik nie szukał
   ekranu numeracji pod `/planning`. `nextDocumentNumber` inicjuje sensowne wartości
   domyślne przy pierwszym użyciu, więc nowa organizacja automatycznie otrzymuje
   `PO/TO/WO-YYYYMM-NNNN`.

Poza zacytowanym powyżej komentarzem dotyczącym uprawnienia eksportu nie znaleziono żadnych
surowych markerów `// TODO` w kodzie MRP / dostawców / numeracji dokumentów; lista luk jest
poza tym wywnioskowana z dryfu uprawnień względem wyliczenia i ograniczeń możliwości
zaobserwowanych w kodzie.

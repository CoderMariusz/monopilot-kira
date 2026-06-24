# Zakupy — ZZ → WPT / dostawy od dostawców (przewodnik po module)

> Szczegółowy przewodnik po module. Każde stwierdzenie poniżej jest zakotwiczone w
> rzeczywistym pliku w `apps/web/…`; nic nie jest wymyślone. Moduł obejmuje **dwie
> grupy tras**: ekrany **Zamówień zakupu** (ZZ) są w **Planowaniu**
> (`/planning/purchase-orders`, `…/(modules)/planning/purchase-orders/`), natomiast
> ekrany **przyjęcia towarów (WPT) / dostawy od dostawców** są w **Magazynie**
> (`/warehouse/grns` oraz przepływ PWA skanera `/scanner/receive-po`). Obie połowy
> współdzielą jeden obiekt główny — linia ZZ jest *przyjmowana* do linii WPT, która
> generuje Tablicę Rejestracyjną (LP).
>
> Trasy są zapisane bez prefiksu `[locale]`. Ostatni przegląd przeprowadzono na
> podstawie niezatwierdzonego drzewa roboczego (W11-R1 edycja roboczego ZZ, eksport/
> import E-IO, korekty przyjęć R3).

---

## a. Przegląd

Moduł Zakupów przekształca planowany zakup w dostępny stan magazynowy. Nabywca tworzy
**Zamówienie Zakupu** (nagłówek + linie: dostawca, pozycje, ilości, ceny, oczekiwana
data dostawy), prowadzi je przez wymuszony po stronie serwera automat stanów (`draft →
sent → confirmed → partially_received → received` albo `cancelled`), a magazyn
**przyjmuje** dostawy względem otwartych linii ZZ. Każde przyjęcie księguje linię
**WPT** (Wiersza Przyjęcia Towaru) i generuje **Tablicę Rejestracyjną** — tworzoną ze
statusem `qa_status='pending'` (nigdy nie jest automatycznie konsumowalna) — przez
jedną wspólną transakcję używaną zarówno przez pulpit, jak i skaner. Pomyłki są
odwracalne: błędne przyjęcie cofa **anulowanie linii WPT** (które unieważnia LP), a
roboczy ZZ jest w pełni edytowalny (dodawanie/edycja/usuwanie linii, zmiana nagłówka)
dopóki nie zostanie wysłany.

Akcje zapisu/odczytu ZZ znajdują się w
`planning/purchase-orders/_actions/actions.ts`; wspólna transakcja przyjęcia to
`apps/web/lib/warehouse/scanner/receive-po.ts` (`receiveScannerPoLine`); korekty
przyjęć to `warehouse/_actions/receipt-corrections-actions.ts`.

---

## b. Rejestr funkcji

> Odczyty/zapisy podają dotknięte tabele Postgres. „Bramka" to uprawnienie sprawdzane
> po stronie serwera **wewnątrz** akcji (brak uprawnienia zwraca
> `{ ok:false, error:'forbidden' }`, nigdy 500). Przyjęcie skanera jest bramkowane
> **sesją PIN skanera** (`requireScannerSession`), a nie rodziną uprawnień RBAC.

### Akcje Zamówień Zakupu — `planning/purchase-orders/_actions/actions.ts`

| Akcja | Co robi | Odczyt / Zapis | Bramka | Cofnięcie / korekta |
|---|---|---|---|---|
| `listPurchaseOrders({status,q,limit,archived})` | Lista ZZ (zakładka statusu + wyszukiwanie po numerze ZZ / kodzie dostawcy; opcjonalna zakładka archiwum). Dołącza Σ przyjętej ilości z neanulowanych pozycji WPT. | odczyt `purchase_orders`, `suppliers`, `org_document_settings`, `grn_items`, `grns` | Odczyt w zakresie RLS (brak dedykowanego uprawnienia odczytu — odrzucony użytkownik widzi jedynie pustą listę w zakresie organizacji) | — (odczyt) |
| `getPurchaseOrder(id)` | Nagłówek + linie dla ekranu szczegółów; każda linia zawiera `receivedQty` = Σ niecancelowanych `grn_items.received_qty`. | odczyt `purchase_orders`, `purchase_order_lines`, `items`, `suppliers`, `grns`, `grn_items` | Odczyt w zakresie RLS | — (odczyt) |
| `createPurchaseOrder(input)` | Wstawia nagłówek ZZ (domyślny `status` = `draft`) + ≥1 linię. Automatycznie generuje `po_number` per-org przez `nextDocumentNumber`, gdy nie podano (z ponowieniem przy błędzie 23505). | zapis `purchase_orders`, `purchase_order_lines`, `audit_events` (`planning.purchase_order.created`) | `npd.planning.write` | Anulowanie przez `transitionPurchaseOrderStatus(...,'cancelled')` |
| `updatePurchaseOrder({id,supplierId?,expectedDelivery?,currency?,notes?})` | Zmiana nagłówka ZZ. **Tylko w stanie roboczy** (wiersz zablokowany `for update`; inny stan → `invalid_state`). | zapis `purchase_orders`, `audit_events` (`planning.purchase_order.updated`) | `npd.planning.write` | (Sam jest ścieżką zmiany; cofnięcie przez kolejną edycję w stanie roboczym) |
| `addPurchaseOrderLine({poId,itemId,qty,uom,unitPrice})` | Dodaje linię (automatyczny `line_no = max+1`, z ponowieniem na savepoint przy 23505). **Tylko w stanie roboczy.** Pozycja musi być w org. | zapis `purchase_order_lines`, `audit_events` (`planning.purchase_order.line_added`) | `npd.planning.write` | `deletePurchaseOrderLine` |
| `updatePurchaseOrderLine({poId,lineId,qty?,uom?,unitPrice?})` | Edycja ilości / JM / ceny jednostkowej linii. **Tylko w stanie roboczy.** | zapis `purchase_order_lines`, `audit_events` (`planning.purchase_order.line_updated`) | `npd.planning.write` | Ponowna edycja lub usunięcie |
| `deletePurchaseOrderLine({poId,lineId})` | Usuwa linię i przenumerowuje pozostałe. **Tylko w stanie roboczy.** Odmawia usunięcia **ostatniej** linii → błąd `last_line`. | zapis/usuwa `purchase_order_lines`, `audit_events` (`planning.purchase_order.line_deleted`) | `npd.planning.write` | `addPurchaseOrderLine` |
| `transitionPurchaseOrderStatus(id,status)` | Przesuwa ZZ wzdłuż legalnego automatu stanów `PO_TRANSITIONS` (ponowna walidacja po stronie serwera). Stany terminalne `received` / `cancelled` nie mają następników. | zapis `purchase_orders`, `audit_events` (`planning.purchase_order.status_changed`) | `npd.planning.write` | Tylko do przodu + `cancelled`. Brak „odanulowania" / „cofnięcia przyjęcia" **nagłówka**; samo przyjęcie jest cofane na poziomie linii WPT. `partially_received`/`received` są normalnie zapisywane przez transakcję przyjęcia, nie przez przycisk. |

### Pomocnicze akcje odczytu ZZ — `planning/purchase-orders/_actions/po-form-data.ts`

| Akcja | Co robi | Odczyt | Bramka |
|---|---|---|---|
| `listPoSuppliers()` | Aktywni dostawcy dla listy rozwijanej `<Select>` przy tworzeniu ZZ (deleguje do `listSuppliers` w `planning/suppliers`). | `suppliers` | Zakres RLS |
| `searchPoItems(input)` | Selektor pozycji dla linii ZZ; rozszerza domyślne wyszukiwanie pozycji na WSZYSTKIE typy zamawialne (`rm, ingredient, intermediate, co_product, byproduct, packaging` — opakowania są zamawialne). | `items` | Zakres RLS |
| `listPoUnits()` | Dostępne opcje JM dla listy rozwijanej w linii, z `public.unit_of_measure` (jednostki dodane przez admina pojawiają się tutaj). | `unit_of_measure` | Zakres RLS |
| `listPurchaseOrderLineCounts()` | Liczba linii per-ZZ dla kolumny „Linie" na liście. | `purchase_order_lines` | Zakres RLS |

### Eksport / import ZZ — `create-export-job.ts`, `import-po.ts`

| Akcja | Co robi | Odczyt / Zapis | Bramka | Cofnięcie |
|---|---|---|---|---|
| `createExportJob({status?,q?,supplierId?,archived?})` | **E-IO** — eksport CSV *aktualnie filtrowanej* listy ZZ (ponowne uruchomienie `listPurchaseOrders` + `listPurchaseOrderLineCounts`; format czytelny dla człowieka, **kod** dostawcy, bez UUID). Zapisuje wiersz rejestru `kind='export'`, widoczny w Ustawienia → Import/Eksport. | odczyt `purchase_orders` (przez listę); zapis `import_export_jobs` (`kind='export', target='purchase_orders', status='completed'`) | `npd.planning.write` | — (tylko odczyt/eksport) |
| `validatePoImport(rows)` | Walidacja próbna importowanych wierszy względem dostawców / aktywnych pozycji / JM (błędy per-wiersz, per-kolumna; sprawdzenie, czy data nie jest w przeszłości). | odczyt `suppliers`, `items`, `unit_of_measure`, `purchase_orders` | `npd.planning.write` | — (walidacja) |
| `commitPoImport(rows,{mode})` | Masowe tworzenie ZZ z wierszy pogrupowanych według `(supplier_code, external_ref)`; tryb `all_or_nothing` albo `skip_invalid`. Pomija wiersze, których `external_ref` już istnieje jako `po_number`. Deleguje każdą grupę do `createPurchaseOrder`. | zapis `purchase_orders`, `purchase_order_lines` (przez create) + `import_export_jobs` (`kind='import'`) + audyt | `npd.planning.write` | Anulowanie każdego utworzonego ZZ (roboczego) osobno |

### Przyjęcie towarów / dostawa od dostawcy — wspólne przyjęcie + akcje magazynowe

| Akcja (plik) | Co robi | Odczyt / Zapis | Bramka | Cofnięcie / korekta |
|---|---|---|---|---|
| `receiveScannerPoLine(client,session,input)` (`lib/warehouse/scanner/receive-po.ts`) | **Jedna transakcja przyjęcia** (pulpit i skaner współdzielą ją). Dla otwartej linii ZZ (`sent`/`confirmed`/`partially_received`): pobiera lub tworzy dzisiejszy roboczy WPT, wstawia `grn_items`, generuje LP (`status='received', qa_status='pending'`), zapisuje genezę LP, emituje `warehouse.lp.received`, aktualizuje status ZZ do `partially_received`/`received`, a jeśli `feature_flags->require_grn_qc_inspection` jest WŁĄCZONE — otwiera oczekującą `quality_inspections`. **Ograniczenie nadprzyjęcia = 110% zamówionego → `over_receive_cap` (409).** Idempotentna na `client_op_id`. | zapis `grns`, `grn_items`, `license_plates`, `lp_state_history`, `outbox_events`, `quality_inspections`, `purchase_orders` (aktualizacja sumaryczna), `scanner_audit_log` | Sesja PIN skanera (`requireScannerSession`) — NIE jest uprawnieniem RBAC | `cancelGrnLine` (poniżej) |
| `listScannerPurchaseOrders` / `getScannerPurchaseOrder` (ten sam plik) | Odczyty skanera: otwarte ZZ (statusy `sent`/`confirmed`/`partially_received`) + linie jednego ZZ z sumaryczną przyjętą ilością. | odczyt `purchase_orders`, `suppliers`, `purchase_order_lines`, `items`, `grn_items` | Sesja PIN skanera | — (odczyt) |
| `cancelGrnLine({grnItemId,reasonCode,note?})` (`warehouse/_actions/receipt-corrections-actions.ts`) | **Korekta przyjęcia R3** — anulowanie jednej linii przyjęcia WPT. Unieważnia LP (`status='returned', quantity=0`), stempluje `cancelled_at`/powód na pozycji WPT, zapisuje historię LP + audyt. Odmawia, jeśli LP zostało przemieszczone/zarezerwowane/skonsumowane lub ma elementy potomne (`lp_not_cancellable`) albo jest już anulowane. **Brak e-podpisu** (korekty przyjęć są mniej ryzykowne niż produkcyjny e-podpis). | zapis `license_plates`, `grn_items`, `lp_state_history`, `audit_events` (`warehouse.receipt.corrected`) | `warehouse.receipt.correct` (poziom admina / przełożonego wg ziarna SoD — nie podstawowy magazynier) | To *jest* cofnięcie przyjęcia |
| `updateLpMetadata({lpId,expiryDate?,batchNumber?,reasonCode,note})` (ten sam plik) | **Korekta metadanych R3** — naprawa daty ważności / numeru partii przyjętego LP (błędna data najlepszego spożycia wpisana przy przyjęciu). Blokada na LP o statusach terminalnych/zwróconych. | zapis `license_plates`, `lp_state_history`, `audit_events` (`warehouse.lp.metadata_corrected`) | `warehouse.receipt.correct` | Ponowna edycja (każda zmiana jest audytowana) |
| `releaseLpQa({lpId,decision,note?})` (`warehouse/_actions/lp-qa-actions.ts`) | Zatwierdzenie QA przyjętego LP: `released` automatycznie awansuje `received→available` (konsumowalne wg FEFO); `rejected` → `received→blocked`. Tylko dla statusu oczekującego. | zapis `license_plates`, `lp_state_history`, `outbox_events` (`warehouse.lp.transitioned`) | `warehouse.grn.receive` | Decyzja jest jednokierunkowa (tylko `pending`); odrzuconego stanu nie można później awansować |
| `listGrns` / `getGrnDetail` (`warehouse/_actions/grn-actions.ts`) | Lista WPT + szczegóły (dane nagłówka + linie przyjęcia + link do powstałego LP). | odczyt `grns`, `grn_items`, `suppliers`, `warehouses`, `license_plates` | `WAREHOUSE_READ_PERMISSION` | — (odczyt) |
| `submitConditionCheck(...)` (`quality/_actions/cold-chain-actions.ts`, podłączone przez `cold-chain-adapter.ts`) | **E2B** kontrola warunków dostawy (łańcuch chłodniczy) — sprawdzenie temperatury na linii WPT; przekroczenie zakresu kieruje do wstrzymania jakościowego. | zapis tabel łańcucha chłodniczego + blokady (własność jakości) | `quality.coldchain.record` | (zwolnienie blokady w module Jakości) |
| `printLabel({entityType:'lp',...})` (Ustawienia → drukarki, podłączone przez szczegóły WPT) | Drukowanie etykiety LP dla przyjętej linii. | zapis tabel zadań drukowania | `settings.org.update` | — |

**Zinwentaryzowana liczba akcji: 22** (8 zapisu/przejścia ZZ, 4 pomocnicze odczytu ZZ, 3 eksport/import, 7 przyjęcie/WPT/korekta/QA/łańcuch chłodniczy/drukowanie). Rdzeń ZZ stanowi 8 akcji w `actions.ts`.

---

## c. Automat stanów

### Cykl życia Zamówienia Zakupu (`PO_TRANSITIONS`, `actions.ts:685-692`)

```
 draft ──────► sent ──────► confirmed ─┬─► partially_received ──► received
   │             │              │       │                          (terminal)
   │             │              │       └─► received (terminal)
   └─► cancelled └─► cancelled  └─► cancelled
        (terminal)
```

| Stan | Legalne stany następne | Kto zapisuje | Uwagi |
|---|---|---|---|
| `draft` | `sent`, `cancelled` | nabywca (przycisk) | **Jedyny stan, w którym ZZ jest edytowalny** — `update*`/`add*`/`delete*PurchaseOrderLine` wymagają bezwzględnie `status='draft'`. |
| `sent` | `confirmed`, `cancelled` | nabywca (przycisk) | „Wysłano do dostawcy." |
| `confirmed` | `partially_received`, `received`, `cancelled` | nabywca (przycisk) **lub** transakcja przyjęcia | Przyjęcie może bezpośrednio przełączyć status. |
| `partially_received` | `received`, `cancelled` | zazwyczaj **transakcja przyjęcia** (`rollupPurchaseOrderStatus`) | Ustawiany, gdy część linii jest w pełni przyjęta, ale nie wszystkie. |
| `received` | — (terminal) | transakcja przyjęcia / przycisk | Wszystkie linie przyjęte (`Σ przyjętych ≥ zamówionych` dla każdej linii). |
| `cancelled` | — (terminal) | nabywca (przycisk) | Brak „odanulowania". |

Automat stanów jest wymuszany **dwukrotnie**: UI szczegółów renderuje tylko legalne
przyciski (`po-detail-view.tsx` `TRANSITIONS`), a `transitionPurchaseOrderStatus`
ponownie waliduje względem `PO_TRANSITIONS`, aby sfałszowane/nieaktualne żądanie nie
mogło wykonać nielegalnego przejścia. Dwa stany terminalne **nie mają następników** —
błędne *przyjęcie* jest korygowane na poziomie **linii WPT** (poniżej), nie przez
mutowanie nagłówka ZZ.

### Cykl życia WPT / linii WPT

- **Status nagłówka WPT** (`grns.status`): `draft → completed` plus `cancelled`.
  Transakcja przyjęcia zawsze księguje na dzisiejszy **roboczy** WPT dnia
  (`getOrCreateOpenGrn`); linie roboczego WPT nadal wliczają się do przyjętej ilości ZZ.
- **Linia WPT** (`grn_items`): tworzona przy przyjęciu (aktywna), następnie
  jednokierunkowa do stanu **anulowanego** przez `cancelGrnLine` (stempel `cancelled_at`
  / `cancellation_reason_code`). Anulowane linie są wykluczone z każdego sumarycznego
  przeliczenia przyjętej ilości (`… and gi.cancelled_at is null`).
- **Tablica Rejestracyjna** (artefakt przyjęcia): tworzona ze `status='received',
  qa_status='pending'` → QA `releaseLpQa` awansuje `received→available`
  (`released`) albo `received→blocked` (`rejected`) → `cancelGrnLine` przenosi
  nadal-anulowalny LP do `status='returned', quantity=0`. LP, który został
  przemieszczony / zarezerwowany / skonsumowany / ma elementy potomne, **nie** jest
  anulowalny.

**Podsumowanie legalności:** przyjęcie jest legalne tylko wtedy, gdy ZZ ma status
`sent`/`confirmed`/`partially_received` (`OPEN_PO_STATUSES`); edycje linii ZZ są
legalne tylko przy statusie `draft`; anulowanie linii WPT jest legalne tylko wtedy, gdy
LP ma status `received|available` + `qa_status pending|released`, zarezerwowaną ilość 0,
niezmienioną ilość i brak konsumpcji/elementów potomnych.

<!-- screenshot: planning/purchase-orders list (status tabs + Create PO) -->
<!-- screenshot: planning/purchase-orders/[id] detail (lines + status transitions panel) -->

---

## d. Instrukcje dla użytkownika

> Etykiety przycisków to klucze i18n; dosłowna angielska treść pochodzi z pakietów
> `Planning.purchaseOrders.*` / magazynowych `grnDetail.*`. Identyfikatory `data-testid`
> w nawiasach to stabilne kotwice w kodzie komponentu.

### (i) Tworzenie ZZ i dodawanie linii

1. Przejdź do **Planowanie → Zamówienia Zakupu** (`/planning/purchase-orders`).
2. Kliknij główny przycisk **„+ Utwórz ZZ"** w prawym górnym rogu (`po-list-create`).
   (Głęboki link `?new=1` automatycznie otwiera modal.)
3. W modalu tworzenia (`create-po-modal.tsx`):
   - **Numer ZZ** — opcjonalny; zostaw puste, a serwer automatycznie wygeneruje numer
     per-org.
   - **Dostawca** — wybierz z rzeczywistego rejestru dostawców (`listPoSuppliers`;
     wymagane).
   - **Oczekiwana data dostawy**, **Waluta** (domyślnie EUR), **Uwagi** — opcjonalne.
   - **Linie** — kliknij **Dodaj linię**, użyj selektora pozycji (`searchPoItems`,
     przeszukuje `public.items`), ustaw **Ilość** (>0, ≤3 miejsca dziesiętne), wybierz
     **JM** z listy rozwijanej (rzeczywista `unit_of_measure`, nigdy wolny tekst), ustaw
     **Cenę jednostkową** (≥0, ≤4 miejsca dziesiętne). Dodaj tyle linii, ile potrzeba
     (1–200). Wymagana jest co najmniej jedna linia.
4. **Zatwierdź** → `createPurchaseOrder`. ZZ jest tworzony w stanie `draft`.

### (ii) Wysyłanie / potwierdzanie ZZ

1. Otwórz ZZ (kliknij jego numer / **Podgląd** na liście → `/planning/purchase-orders/[id]`).
2. Panel **Status** po prawej stronie (`po-detail-transitions`) wyświetla tylko legalne
   przyciski dla bieżącego stanu:
   - Z **draft**: **Wyślij** (→ `sent`) lub **Anuluj**.
   - Z **sent**: **Potwierdź** (→ `confirmed`) lub **Anuluj**.
   - Z **confirmed**: **Przyjmij (częściowo)**, **Przyjmij** lub **Anuluj**.
   - Z **partially_received**: **Przyjmij**.
3. Kliknij akcję; pojawia się prośba o potwierdzenie, a następnie uruchamia się
   `transitionPurchaseOrderStatus`. W normalnej pracy nie klikasz ręcznie „Przyjmij" —
   fizyczne przyjęcie towaru (poniżej) automatycznie przesuwa status. Przycisk istnieje
   na potrzeby rozliczeń back-office.

### (iii) Rejestrowanie dostawy / przyjęcie towaru

**Skaner (standardowa ścieżka):**

1. Zaloguj się do skanera swoim **PIN-em** (`/scanner/login`), wybierz zakład / linię /
   zmianę.
2. Ekran główny → kafelek **Przyjęcie (ZZ)** → `/scanner/receive-po` (rzeczywista lista
   otwartych ZZ).
3. Dotknij ZZ → `…/[poId]` (jego linie + zamówiona/przyjęta/pozostała ilość).
4. Dotknij linię → `…/[poId]/[lineId]` (`receive-po-item-screen.tsx`):
   - Opcjonalny numer **Partii** i data **Najlepszego spożycia**.
   - Opcjonalna **lokalizacja docelowa** — zeskanuj/wpisz kod lokalizacji (Enter
     rozwiązuje go); puste = domyślna lokalizacja magazynu.
   - Wprowadź **Ilość** na klawiaturze numerycznej (domyślnie pozostała ilość). Powyżej
     pozostałej ilości pojawia się żółte ostrzeżenie o nadprzyjęciu; serwer twardо
     blokuje na poziomie **110%** zamówionej (wyższa ilość jest odrzucana).
   - Dotknij **Przyjmij** (`L.receive`). W przypadku powodzenia widzisz nowy **numer LP**
     i — jeśli włączone jest Wymagaj-QC-WPT — baner informacyjny **„Blokada QC"**. Możesz
     następnie **Drukować etykietę**, przejść do **Następnej linii** lub **Powrócić do
     listy**.

**Pulpit:** nie ma osobnego desktopowego formularza „przyjęcia" — ekrany WPT
(`/warehouse/grns`, `…/[grnId]`) służą do *przeglądania* przyjęć i utworzonych LP oraz
do **zwalniania QA** LP (akcja wiersza **Zwolnij** w szczegółach WPT → `releaseLpQa`,
przełączając LP na `available`, co czyni go konsumowanym wg FEFO). Ścieżka zapisu
(`receiveScannerPoLine`) jest współdzielona, ale operatorski interfejs przyjęcia to
skaner.

<!-- screenshot: scanner/receive-po/[poId]/[lineId] receive screen (qty keypad + batch/best-before) -->
<!-- screenshot: warehouse/grns/[grnId] detail (receipt lines + QA release + cancel row-action) -->

### (iv) Anulowanie / korekta błędnego przyjęcia (wyrejestrowanie dostawy)

1. Otwórz WPT zawierający błędną linię: **Magazyn → WPT** (`/warehouse/grns`) →
   dany WPT → `…/[grnId]`.
2. W tabeli linii przyjęcia nadal aktywna linia wyświetla akcję wiersza **Anuluj**
   (`grnDetail.cancelLine.rowAction`) — widoczną tylko jeśli WPT nie jest anulowany i
   posiadasz uprawnienie **`warehouse.receipt.correct`**.
3. Modal anulowania (`grn-line-cancel-modal.client.tsx`) prosi o **kod przyczyny**
   (`entry_error / wrong_quantity / wrong_batch / wrong_product / other`) i opcjonalną
   notatkę. Zatwierdź (czerwony przycisk **Anuluj linię**) → `cancelGrnLine`.
4. LP dla tej linii jest unieważniony (`status='returned', qty 0`), a linia wypada z
   sumarycznego przeliczenia przyjętej ilości ZZ. Jeśli LP został już przemieszczony /
   zarezerwowany lub skonsumowany / ma elementy potomne, akcja odmawia komunikatem
   **„użyj korekty stanu magazynowego"** (`lp_not_cancellable`).
5. **Tylko błędna partia/data ważności?** Nie anuluj — użyj **korekty metadanych** LP
   (`updateLpMetadata`) z ekranu Tablicy Rejestracyjnej, aby naprawić datę ważności/partię
   na miejscu (z audytem, ta sama bramka `warehouse.receipt.correct`).

### (v) Ponowne otwieranie roboczego ZZ / zmiana

ZZ jest w pełni edytowalny **tylko w stanie `draft`** (przed wysłaniem):

1. Otwórz roboczy ZZ (`/planning/purchase-orders/[id]`). Dla roboczych ZZ w nagłówku
   pojawia się przycisk **Edytuj zamówienie** (`po-edit-order`).
2. **Zmiana nagłówka** — **Edytuj zamówienie** otwiera modal edycji (dostawca / oczekiwana
   data / waluta / uwagi) → `updatePurchaseOrder`.
3. **Edycja linii** — tabela linii wyświetla **Dodaj linię** (`po-add-line`) oraz
   per-wiersz **Edytuj** (`po-line-edit-*`) / **Usuń** (`po-line-delete-*`):
   - Dodaj → `addPurchaseOrderLine`; Edytuj → `updatePurchaseOrderLine`; Usuń →
     `deletePurchaseOrderLine`.
   - Usunięcie **ostatniej pozostałej linii jest blokowane** („Nie można usunąć ostatniej
     linii zamówienia zakupu", błąd `last_line`).
4. **Nie ma opcji „powrót do roboczego".** Gdy ZZ jest w stanie `sent`/`confirmed`/itp.,
   te możliwości edycji znikają, a akcje zwracają `invalid_state`. Aby zmienić wysłany ZZ,
   należy go anulować i wystawić nowy. (Patrz *Znane luki*.)

---

## e. Źródła danych (tabele Supabase)

Połowa ZZ (odczyt/zapis):

- `purchase_orders` — nagłówek ZZ (status, dostawca, oczekiwana data, waluta, uwagi, po_number).
- `purchase_order_lines` — linie ZZ (pozycja, ilość, JM, cena_jednostkowa, line_no).
- `suppliers` — rejestr dostawców (odczyt do selektora / rozwiązywania kodu; zarządzany w `/planning/suppliers`).
- `items` — rejestr pozycji (rozwiązywanie pozycji linii ZZ; odczyt).
- `unit_of_measure` — opcje JM dla list rozwijanych linii (odczyt).
- `org_document_settings` — `archive_after_days` dla zakładki archiwum (odczyt).
- `import_export_jobs` — wiersze rejestru eksportu/importu (zapis).
- `audit_events` — każdy zapis ZZ (`planning.purchase_order.*`).

Połowa przyjęcia / WPT (odczyt/zapis):

- `grns` — nagłówek WPT (dzienny-roboczy, source_type='po', dostawca, magazyn).
- `grn_items` — linie przyjęcia WPT (received_qty, po_line_id, lp_id, pola anulowania).
- `license_plates` — LP generowane przy każdym przyjęciu (status/qa_status/qty/partia/ważność/lokalizacja).
- `lp_state_history` — geneza LP + przejścia QA + korekty.
- `outbox_events` — `warehouse.lp.received`, `warehouse.lp.transitioned`.
- `quality_inspections` — oczekująca inspekcja GRN-QC gdy flaga org jest włączona.
- `scanner_audit_log` — idempotentność przyjęcia skanera + audyt.
- `tenant_variations` — `feature_flags->require_grn_qc_inspection` (odczyt).
- `warehouses`, `locations` — rozwiązywanie miejsca docelowego przyjęcia (odczyt).

---

## f. Znane luki / TODO

Oparte na przeczytanym kodzie — bez domysłów:

1. **Brak dedykowanego uprawnienia odczytu ZZ / IO.** Lista/szczegóły ZZ opierają się
   wyłącznie na RLS (brak `planning.po.view`), a zadanie eksportu ponownie używa
   `npd.planning.write` z jawnym `TODO(E-IO): dedicated io.export.run permission`
   (`create-export-job.ts:25`). Użytkownik z uprawnieniem planning-write może również
   eksportować.
2. **Brak „powrotu do roboczego" i cofnięcia przyjęcia nagłówka.** `PO_TRANSITIONS`
   jest jednokierunkowy z terminalami `received`/`cancelled` (`actions.ts:685`); edycje
   są możliwe tylko w stanie roboczym. Zmiana wysłanego ZZ wymaga anulowania i
   ponownego wystawienia. Nie ma odwrócenia zmiany statusu nagłówka ZZ — odwracalna
   jest tylko linia WPT.
3. **Przejście ZZ nie ma e-podpisu / bramki zatwierdzenia.** Przepływ prototypu z
   przesyłaniem / oczekiwaniem na zatwierdzenie / zatwierdzeniem / odrzuceniem **nie**
   jest w backendzie; UI mapuje te przyciski 1:1 na rzeczywiste przejścia wysłania/
   potwierdzenia/przyjęcia (udokumentowane odchylenie w `po-detail-view.tsx:14-26` i
   `po-list-view.tsx:14-30`). Nie ma sumarycznej wartości pieniężnej, rabatów per-linia,
   karty postępu WPT/zatwierdzeń/D365 — `getPurchaseOrder` zwraca wyłącznie nagłówek +
   linie.
4. **Ograniczenie nadprzyjęcia to stałe 110%** (`receive-po.ts:271`, `cap = ordered * 110 / 100`)
   — nie jest sterowane przez progi nadkonsumpcji w Ustawieniach używane przy konsumpcji
   produkcyjnej. Brak konfigurowalności per-org.
5. **Anulowanie linii WPT nie ma e-podpisu.** Celowa decyzja (korekty przyjęć są mniej
   ryzykowne niż produkcyjny e-podpis), udokumentowana w
   `grn-line-cancel-modal.client.tsx:5-11`. Nadal wymaga `warehouse.receipt.correct`
   i zapisuje zdarzenie audytu, ale nie ma kontroli drugiego podpisującego.
6. **Pulpit nie ma pierwszorzędowego formularza „przyjęcia".** Operatorzy przyjmują
   towary przez skaner PWA; desktopowe ekrany WPT służą wyłącznie do podglądu +
   zwolnienia QA + korekty. Nie ma desktopowego odpowiednika ekranu przyjęcia linii ze
   skanera.
7. **Masowy import ZZ jest ukryty za centrum importu.** `commitPoImport` /
   `validatePoImport` istnieją i są rzeczywiste, ale zgodnie z notatkami złotego
   przepływu centralna powierzchnia **importu** Ustawienia Import/Eksport jest
   renderowana jako wyłączona (`featureAvailable={false}`); przycisk **Import** na
   liście ZZ prowadzi głębokim linkiem do `/planning/import?source=po`. Sprawdź, czy ta
   trasa jest podłączona, zanim zaczniesz na niej polegać.
8. **Rejestr dostawców jest poza warstwą akcji tego modułu.** Akcje ZZ jedynie
   *odczytują* `suppliers`; tworzenie/edycja dostawców jest w `/planning/suppliers`
   (`suppliers/_actions/actions.ts`) — zaznaczone, aby czytelnik nie oczekiwał CRUD
   dostawców wewnątrz zakupów.

W `actions.ts` samego ZZ nie znaleziono żadnych dosłownych markerów `// TODO` poza
cytowanym powyżej dotyczącym uprawnienia eksportu; lista luk jest w pozostałym zakresie
wyprowadzona z ograniczeń automatu stanów / możliwości zaobserwowanych w kodzie.

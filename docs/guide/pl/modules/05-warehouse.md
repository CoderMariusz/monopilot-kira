# Magazyn / Zapasy — Tablice Palet / PZ / odkładanie / pobieranie FEFO / genealogia / spis z natury (przewodnik modułu)

> Szczegółowy przewodnik po module. Każde stwierdzenie poniżej jest zakotwiczone
> w rzeczywistym pliku pod `apps/web/…` lub `packages/…`; nic nie zostało
> wymyślone. Moduł obejmuje **dwie powierzchnie** oraz wspólną warstwę biblioteczną:
> ekrany **desktopowe** Magazynu pod `…/(modules)/warehouse/**` (tablice palet (LP),
> PZ, zapasy, lokalizacje, ruchy, rezerwacje, termin ważności, genealogia,
> spis z natury, harmonogram przyjęć, historia druku) oraz **skaner** PWA dla
> przepływów magazynowych obsługiwanych przez procedury tras pod
> `apps/web/app/api/warehouse/scanner/**`. Logika zapisów halowych znajduje się w
> `apps/web/lib/warehouse/**` (`scanner/receive-po.ts`, `scanner/movement.ts`,
> `genealogy.ts`, `lp-create.ts`), którą wywołują zarówno trasy skanera, jak i
> desktopowe Server Actions.
>
> 05-warehouse jest **kanonicznym właścicielem** **Tablicy Palet** (`license_plates`)
> — uniwersalnej jednostki partii/ilości konsumowanej przez 08-production, wysyłanej przez
> 11-shipping i przytrzymywanej przez 09-quality — a także `grns`/`grn_items`, `stock_moves`,
> `count_sessions`/`count_lines`/`stock_adjustments`, `lp_state_history`,
> `lp_genealogy` i `locations`. **Konsumuje** ścieżkę blokady 09-quality (ręczna blokada
> LP otwiera prawdziwy wiersz `quality_holds`) i **dzieli transakcję przyjęcia** z
> Zakupami — linia ZZ jest *przyjmowana* do linii PZ, która tworzy tablicę palet.
>
> Trasy są zapisane bez prefiksu `[locale]`. Ostatnio przejrzane na podstawie
> niezatwierdzonego drzewa roboczego (W9 odkładanie/przesunięcie/pobieranie + lokalizacja docelowa,
> R3 korekty przyjęć + metadane LP, mig-318 korekty spisu z natury, W11 bezpośrednia
> korekta zapasów + mig-328 kod-CHECK powodu/osoba zatwierdzająca).

---

## a. Przegląd

Moduł Magazyn zamienia przyjęte towary w **identyfikowalne, konsumowalne wg FEFO zapasy**
i utrzymuje synchronizację świata fizycznego z ewidencją. Atomem jest **Tablica Palet (LP)**
— jedna paleta/partia jednego artykułu, z ilością, numerem partii, terminem ważności,
lokalizacją, `status` (gdzie jest w swoim cyklu życia) i `qa_status` (czy QA ją zatwierdziła).
Zapasy są **przyjmowane** (PZ tworzy LP ze statusem `received`/`qa pending`),
**zwalniane przez QA** (→ `available`, konsumowalne wg FEFO), **odkładane** do miejsca składowania,
**przesuwane** między lokalizacjami, **rezerwowane** dla zlecenia produkcyjnego, **pobierane**
(wydawane na linię produkcyjną), **konsumowane** przez produkcję (08-production odejmuje
ilość z LP) lub **wysyłane** (11-shipping). Błędy są odwracalne na poziomie przyjęcia
(**anulowanie linii PZ** → LP `returned`; **korekta metadanych LP** w miejscu), a ewidencja
jest uzgadniana przez **spisy z natury** (cykliczne/pełne/wyrywkowe), których odchylenie
jest stosowane pod **podpisem elektronicznym CFR-21** jako rzeczywisty wpis
`stock_adjustments` + `stock_moves`. Jednorazowa **bezpośrednia korekta zapasów** na poziomie LP
(`/warehouse/adjustments/new`) obejmuje ten sam zapis `stock_adjustments`/`stock_moves`
bez sesji spisu — operator dodaje znaleziony towar (tworzy LP z blokadą QA) lub usuwa
uszkodzony/przeterminowany towar (kontrasygnata przełożonego, drenaż FEFO).

Reguła pobieralności jest egzekwowana raz, w widoku **`v_inventory_available`**
(mig 191): wiersz jest konsumowany/pobieralny tylko gdy `status='available'` **i**
`qa_status='released'`, minus `reserved_qty`, posortowane `expiry_date asc nulls last`
(FEFO). Każdy odczyt konsumpcji/pobrania/spisu jest do niego kierowany, więc jednorazowe
odwrócenie QA lub blokada powoduje natychmiastowe pojawienie/zniknięcie zapasów wszędzie.

Odczyty/zapisy desktopowe są lokalnymi dla strony Server Actions w
`warehouse/_actions/*` (`lp-actions.ts`, `grn-actions.ts`, `inventory-actions.ts`,
`expiry-actions.ts`, `genealogy-actions.ts`, `stock-move-actions.ts`,
`location-read-actions.ts`, `reservation-actions.ts`, `lp-qa-actions.ts`,
`receipt-corrections-actions.ts`) oraz `license-plates/[lpId]/_actions/lp-detail-actions.ts`
i `counts/_actions/count-actions.ts`. Logika zapisu skanera to
`lib/warehouse/scanner/receive-po.ts` (przyjęcie) i `lib/warehouse/scanner/movement.ts`
(odkładanie/przesunięcie/pobranie + wyszukiwanie LP/FEFO), dostępne przez procedury
tras w `app/api/warehouse/scanner/**`.

---

## b. Inwentarz funkcji

> Odczyty/zapisy wskazują dotykane tabele Postgres. „Brama" to uprawnienie weryfikowane
> po stronie serwera **wewnątrz** akcji: akcje desktopowe zwracają typizowany
> `{ ok:false, reason:'forbidden' }` (nigdy 500); trasy skanera są chronione przez
> **sesję PIN skanera** (`requireScannerSession`), a trasy zapisu zapasów dodatkowo
> ponownie sprawdzają `warehouse.stock.move`. Wszystkie obliczenia ilości LP są
> dokładne numerycznie (mikro-bigint / łańcuchy dziesiętne prosto do `NUMERIC`,
> nigdy float JS).

### Odczyty tablic palet — `warehouse/_actions/lp-actions.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Brama | Odwrócenie / korekta |
|---|---|---|---|---|
| `listLPs({status?,qaStatus?,search?,warehouseId?,siteId?,limit?})` | Lista LP z dostępną ilością (`quantity - reserved_qty`); filtrowanie wg statusu/qa/magazynu/zakładu + tekst swobodny po nr LP/partii/kodzie i nazwie artykułu. | odczytuje `license_plates`, `items`, `locations`, `warehouses` | `warehouse.inventory.read` | — (odczyt) |
| `getLpDetail(lpId)` | Pełny szczegół LP: nagłówek (pochodzenie, linki GRN/ZP, rezerwacja dla ZP, LP nadrzędna), **podrzędne LP**, **księga historii stanów** (`lp_state_history`) i **ruchy zapasów** LP. | odczytuje `license_plates`, `items`, `locations`, `warehouses`, `work_orders`, `lp_state_history`, `stock_moves` | `warehouse.inventory.read` | — (odczyt) |

### Odczyty przyjęcia towarów (PZ) — `warehouse/_actions/grn-actions.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Brama | Odwrócenie |
|---|---|---|---|---|
| `listGrns({status?,sourceType?,search?,limit?})` | Lista PZ (zakładki statusu + typu źródła, wyszukiwanie po nr PZ/dostawcy). | odczytuje `grns`, `suppliers`, `warehouses` | `warehouse.inventory.read` | — (odczyt) |
| `getGrnDetail(grnId)` | Nagłówek PZ + linie przyjęcia (ilość zamówiona/przyjęta, partia/ważność, wygenerowana LP + jej `qa_status`, **flaga anulowania R3** `cancelled` + powód) + LP utworzone w tym PZ. | odczytuje `grns`, `grn_items`, `items`, `license_plates`, `suppliers`, `warehouses` | `warehouse.inventory.read` | na poziomie linii przez `cancelGrnLine` |

### Odczyty zapasów / ważności / ruchów / lokalizacji — `warehouse/_actions/*`

| Akcja (plik) | Co robi | Odczytuje | Brama |
|---|---|---|---|
| `getInventoryByProduct` / `getInventoryByLocation` / `getInventoryByBatch` (`inventory-actions.ts`) | Trzy zestawienia stanów magazynowych na stanie (wyklucza terminalne statusy LP `consumed/shipped/destroyed/merged/returned`); każde rozbija na ilość **łączną** vs **pobieralną** (`status='available' AND qa_status='released'`) + liczbę LP + najwcześniejszy termin ważności. | `license_plates`, `items`, `locations`, `warehouses` | `warehouse.inventory.read` |
| `getExpiryDashboard` (`expiry-actions.ts`) | Poziomy czerwony/pomarańczowy ważności dla nieterminalnych LP wygasających w ciągu 30 dni; próg czerwony/pomarańczowy to `warehouse_storage_settings.expiry_warning_days` dla danego magazynu (domyślnie 7). | `license_plates`, `items`, `locations`, `warehouses`, `warehouse_storage_settings` | `warehouse.inventory.read` |
| `listStockMoves({moveType?,limit?})` (`stock-move-actions.ts`) | **Ujednolicona ewidencja ruchów** (WH-006): UNION jawnej księgi `stock_moves` (odkładanie/transfer/wydanie/korekta) **i** przejść `lp_state_history` (przyjęcie/produkcja/konsumpcja/awansowanie odkładania) znormalizowany do jednego kształtu, dzięki czemu przyjęcia/konsumpcje nie są już niewidoczne na ekranie Ruchów. | `stock_moves`, `lp_state_history`, `license_plates`, `locations` | `warehouse.inventory.read` |
| `listLocations({warehouseId?,search?,limit?})` (`location-read-actions.ts`) | Lista lokalizacji z zakresu org (połączona z magazynami) dla drzewa Lokalizacji + selektora miejsca docelowego **Przesuń** LP. | `locations`, `warehouses` | `warehouse.inventory.read` |
| `traceGenealogy(lpId)` (`genealogy-actions.ts` → `lib/warehouse/genealogy.ts` `queryGenealogy`) | Pełny łańcuch LP: przodkowie + ja + potomkowie przez `parent_lp_id` **i** krawędzie `lp_genealogy`; ograniczony do głębokości 20 w każdą stronę, odporny na cykle. | `license_plates`, `lp_genealogy`, `items` | `warehouse.inventory.read` |

### Ruch zapasów (odkładanie/transfer) — `warehouse/_actions/stock-move-actions.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Brama | Odwrócenie |
|---|---|---|---|---|
| `createStockMove({lpId,toLocationId,reason?,clientOpId})` | Relokacja LP z poziomu desktopu. Blokuje wiersz LP (`for update`), odmawia terminalnemu `consumed/destroyed/shipped` (`immovable_status`) lub LP zablokowanej przez innego użytkownika w ciągu ostatnich 5 minut (`locked`); waliduje miejsce docelowe; wstawia wiersz `stock_moves` z `move_type='transfer'` (idempotentny dla `(org_id, transaction_id)` wysiany z `clientOpId`) i aktualizuje `license_plates.location_id`. | zapisuje `stock_moves`, `license_plates` | `warehouse.stock.move` | kolejny ruch powrotny |

### Rezerwacje — `warehouse/_actions/reservation-actions.ts` + `lp-detail-actions.ts`

| Akcja (plik) | Co robi | Odczytuje / zapisuje | Brama | Odwrócenie |
|---|---|---|---|---|
| `listReservations` (`reservation-actions.ts`) | LP z `reserved_qty>0` lub `reserved_for_wo_id` (ekran rezerwacji). | odczytuje `license_plates`, `work_orders`, `items` | `warehouse.inventory.read` | — (odczyt) |
| `reserveLp(lpId, woId, qty)` (`lp-detail-actions.ts`) | Rezerwuje ilość z LP `available/reserved`, QA-`released` dla **otwartego** ZP. Sprawdza czy qty ≤ dostępne; zwiększa `reserved_qty`, ustawia `reserved_for_wo_id` + `status='reserved'`; zapisuje historię LP. Odmawia dla LP niezwolnionej (`lp_not_released`) lub już zarezerwowanej dla innego ZP. | zapisuje `license_plates`, `lp_state_history` | `warehouse.lp.reserve` | `releaseReservation` |
| `releaseReservation({lpId,reason})` (`reservation-actions.ts`) | Zeruje `reserved_qty`, czyści `reserved_for_wo_id`, przełącza `reserved → available`. Odmawia terminalnym LP (`not_releasable_status`) lub blokadzie innego użytkownika. | zapisuje `license_plates`, `lp_state_history` | `warehouse.lp.reserve` | ponownie `reserveLp` |
| `listOpenWorkOrdersForLpReserve(search?, limit?)` (`lp-detail-actions.ts`) | Selektor otwartych ZP (`DRAFT/RELEASED/IN_PROGRESS/ON_HOLD`) do modalu rezerwacji. | odczytuje `work_orders`, `items` | `warehouse.lp.reserve` | — (odczyt) |

### QA LP / blokada (blokowanie-odblokowywanie) — `lp-qa-actions.ts` + `lp-detail-actions.ts`

| Akcja (plik) | Co robi | Odczytuje / zapisuje | Brama | Odwrócenie |
|---|---|---|---|---|
| `releaseLpQa({lpId,decision,note?})` (`lp-qa-actions.ts`) | Brama QA dla **oczekującej** przyjętej LP: `released` automatycznie awansuje `received→available` (konsumowalne wg FEFO bez oddzielnego odkładania); `rejected` → `received→blocked` (późniejsze odkładanie nie może jej awansować). Zapisuje historię LP + emituje `warehouse.lp.transitioned`. | zapisuje `license_plates`, `lp_state_history`, `outbox_events` | `warehouse.grn.receive` | jednokierunkowy (tylko z `pending`) |
| `blockLp(lpId, reason)` (`lp-detail-actions.ts`) | Kwarantanna LP: otwiera prawdziwy wiersz **`quality_holds`** (+ `quality_hold_items`), przełącza LP `status='blocked', qa_status='on_hold'`, zapisuje historię LP, emituje `quality.hold.created`. Odmawia terminalnym/już-zablokowanym. | zapisuje `quality_holds`, `quality_hold_items`, `license_plates`, `lp_state_history`, `outbox_events` | `warehouse.lp.block` | `unblockLp` |
| `unblockLp(lpId, reason)` (`lp-detail-actions.ts`) | Zwalnia blokadę LP delegując do **09-quality** `releaseHoldFromWarehouseLpUnblock` (kanoniczna ścieżka zwalniania blokady); LP wraca do `available`/`released`. | zapisuje tabele blokady jakości + LP (ścieżka quality-owned) | (uprawnienie zwalniania blokady jakości, wewnątrz delegata) | `blockLp` |

### Korekty przyjęć (R3) — `warehouse/_actions/receipt-corrections-actions.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Brama | Kierunek odwrócenia |
|---|---|---|---|---|
| `cancelGrnLine({grnItemId,reasonCode,note?})` | **Anulowanie jednej linii przyjęcia PZ.** Unieważnia jej LP (`status='returned', quantity=0, reserved_qty=0`), stempluje `cancelled_at`/powód na `grn_items`, zapisuje historię LP + audyt `warehouse.receipt.corrected`. Odmawia, jeśli LP nie jest `received|available` + `qa pending|released`, ma zarezerwowaną ilość, ilość ≠ received_qty, ma podrzędne lub jakiekolwiek zużycie (`lp_not_cancellable`), lub jest już anulowana. **Bez podpisu elektronicznego.** `reasonCode ∈ {entry_error, wrong_quantity, wrong_batch, wrong_product, other}`. | odczytuje `grn_items`, `license_plates`, `wo_material_consumption`; zapisuje `license_plates`, `grn_items`, `lp_state_history`, `audit_events` | `warehouse.receipt.correct` | **jest** odwróceniem przyjęcia (współdzielone z Zakupami) |
| `updateLpMetadata({lpId,expiryDate?,batchNumber?,reasonCode,note})` | **Korekta daty ważności / partii przyjętej LP w miejscu** (błędna data ważności). Zablokowane dla terminalnych/`returned` LP (`lp_not_editable`). Zapisuje historię LP (`metadata_corrected`) + audyt `warehouse.lp.metadata_corrected`. | odczytuje/zapisuje `license_plates`, `lp_state_history`, `audit_events` | `warehouse.receipt.correct` | ponowna edycja (każdorazowo audytowana) |

### Spisy z natury + wariancja (mig 318) — `warehouse/counts/_actions/count-actions.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Brama | Odwrócenie |
|---|---|---|---|---|
| `createCountSession({warehouseId,countType})` | Otwiera sesję spisu (`count_type ∈ {cycle, full, spot}`, status `open`). | zapisuje `count_sessions` | `warehouse.stock.adjust` | — (anulowanie sesji poza pasmem) |
| `listCountSessions` / `getCountSession(sessionId)` | Lista sesji / jedna sesja z jej liniami (liczba linii/policzonych/wariancji + Σ\|wariancja\|). | odczytuje `count_sessions`, `count_lines`, `warehouses`, `locations`, `items`, `license_plates` | `warehouse.stock.adjust` | — (odczyt) |
| `recordCount({sessionId,locationId,itemId,lpId?,countedQty,batchNumber?,expiryDate?})` | Rejestruje policzoną ilość dla slotu (lokalizacja, artykuł, LP). Odczytuje bieżącą ilość systemową z `v_inventory_available`, oblicza `variance = counted − system` (dokładnie numerycznie), tworzy/aktualizuje wiersz `count_lines` (`status='counted'`); opcjonalne partia/ważność przechowywane jako wiersz metadanych audytu dla LP zwiększenia. | odczytuje `v_inventory_available`; zapisuje `count_lines`, `audit_events` | `warehouse.stock.adjust` | przelicz (ponowne upsert) |
| `approveAndApplyVariance({countLineId,signature})` | **Zastosowanie wariancji** pod **podpisem elektronicznym CFR-21** (`signEvent`, intencja `warehouse.stock.adjust`, PIN/hasło). Ponownie odczytuje stan bieżący i **odmawia, jeśli zapasy zmieniły się od czasu spisu** (`stock_changed_recount_required`); przelicza wariancję. **Zwiększenie** → tworzy nową LP korygującą `available/released` (pochodzenie `adjustment`); **zmniejszenie** → drenaż FEFO istniejących LP (`stock_count_shrinkage`, LP po wyzerowaniu → `destroyed`). Zapisuje `stock_adjustments` + podpisany `stock_moves` (`move_type='adjustment'`) + audyt, oznacza linię `applied`. | odczytuje `v_inventory_available`, `license_plates`, `items`; zapisuje `e_sign_log`, `license_plates`, `lp_state_history`, `stock_adjustments`, `stock_moves`, `count_lines`, `audit_events` | `warehouse.stock.adjust` + podpis elektroniczny | spis licznikowy + ponowne zastosowanie (brak cofnięcia jednym kliknięciem) |

### Bezpośrednia korekta zapasów (mig 328) — `warehouse/_actions/direct-adjust-actions.ts` + `adjustments/_actions/adjust-form-actions.ts`

> Jednorazowe dodanie/usunięcie na poziomie **LP**, które księguje prawdziwy wpis
> `stock_adjustments` + `stock_moves(move_type='adjustment')` **bez sesji spisu** —
> siostrzane rozwiązanie `approveAndApplyVariance` bez cyklu spisu. Dostępne pod
> `/warehouse/adjustments/new` (`adjustments/new/page.tsx`, bramkowane RBAC po stronie
> serwera przez `getDirectAdjustFormContext` → `warehouse.stock.adjust`), realizując
> modal M-03 ruchu magazynowego (`prototypes/design/Monopilot Design System/warehouse/modals.jsx:396-499`).
> Jedyną mutacją jest `applyDirectAdjustment`; odczyty formularza to trzy addytywne
> wyszukiwania w `adjust-form-actions.ts`. Wszystkie obliczenia ilości są dokładne
> numerycznie (`toMicro`/`microToDecimal`, nigdy float JS).

| Akcja (plik) | Co robi | Odczytuje / zapisuje | Brama | Odwrócenie |
|---|---|---|---|---|
| `applyDirectAdjustment(input)` (`_actions/direct-adjust-actions.ts`) | **Mutacja.** Jedna transakcja `withOrgContext`. **Zwiększenie** (bez `lpId`) → tworzy NOWĄ LP korygującą ze statusem `status='available'`, **`qa_status='pending'` (blokada QA)**, pochodzenie `adjustment`. **Zmniejszenie** → wybór LP z zakresu magazynu, posortowanych wg FEFO (`expiry asc nulls last`) z `for update` (`direct-adjust-actions.ts:145-164`), bezpieczny dla TOCTOU drenaż (`quantity - qty >= reserved_qty`, LP po wyzerowaniu → `destroyed`); wymaga **ODRĘBNEGO przełożonego** (SoD) posiadającego `warehouse.stock.adjust` + ich **PIN**. Podpisuje elektronicznie (`signEvent`, intencja `warehouse.stock.adjust`, PIN/hasło inicjatora); idempotentny przez `pg_advisory_xact_lock(hashtextextended(clientOpId))` + skrót powtórzenia `stock_moves(org_id, transaction_id)`. Powód ∈ `{found_stock, spillage_damage, expiry_write_off, data_entry_error, system_sync, other}`; przekazanie `lpId` przy zwiększeniu jest odmawiane (`use_count_session`). | odczytuje `license_plates`, `warehouses`, `locations`, `user_pins`, `user_roles`/`roles`; zapisuje `license_plates`, `stock_adjustments`, `stock_moves`, `lp_state_history`, `e_sign_log` | `warehouse.stock.adjust` (+ podpis elektroniczny inicjatora; **+ PIN odrębnego przełożonego + uprawnienie przy zmniejszeniu**) | korekta licznikowa + ponowne zastosowanie (brak cofnięcia jednym kliknięciem) |
| `getDirectAdjustFormContext()` (`adjustments/_actions/adjust-form-actions.ts`) | Brama strony — zwraca `{ canAdjust:true }` lub `forbidden` (renderowany jako panel odmowy; strona nigdy nie ufa flagie klienta). | odczytuje `user_roles`/`roles`/`role_permissions` | `warehouse.stock.adjust` | — (odczyt) |
| `searchAdjustItems({query?})` | Selektor artykułu. Opakowuje org-zakresowe `searchItems`, ale rozszerza zakres na **wszystkie typy magazynowe** (`fg/rm/ingredient/intermediate/co_product/byproduct/packaging`) — każdy magazynowany artykuł może być korygowany. | odczytuje `items` (przypięte RLS) | (bramkowane przez stronę) | — (odczyt) |
| `searchEligibleSupervisors({query?})` | Kombo-box przełożonego dla **zmniejszenia**: użytkownicy org **≠ dzwoniący** posiadający `warehouse.stock.adjust` I mający zarejestrowany PIN (dopasowanie nazwy/e-mail, limit 20). Wyłącznie informacyjnie — `applyDirectAdjustment` ponownie weryfikuje SoD + uprawnienie + PIN w transakcji. | odczytuje `users`, `user_roles`, `roles`, `role_permissions`, `user_pins` | `warehouse.stock.adjust` | — (odczyt) |
| `listDecreaseLps({locationId,itemId})` | Opcjonalny selektor „konkretnej palety (LP)" dla zmniejszenia — LP `available`/`released`/niezarezerwowane w danej lokalizacji dla artykułu, posortowane **wg FEFO** (odzwierciedla selekcję mutacji). | odczytuje `license_plates` | `warehouse.stock.adjust` | — (odczyt) |

### Skaner — przyjęcie (współdzielone z Zakupami) — `lib/warehouse/scanner/receive-po.ts`

| Akcja (trasa) | Co robi | Odczytuje / zapisuje | Brama | Odwrócenie |
|---|---|---|---|---|
| `listScannerPurchaseOrders` (`GET /api/warehouse/scanner/pos`) | Otwarte ZZ (`sent/confirmed/partially_received`) z liczbami linii i przyjętych linii (wykluczone anulowane linie PZ). | odczytuje `purchase_orders`, `suppliers`, `purchase_order_lines`, `grn_items` | sesja skanera (`scanner.receive_po.list`) | — (odczyt) |
| `getScannerPurchaseOrder` (`GET …/pos/[id]`) | Linie jednego otwartego ZZ z zestawieniem zamówionych/przyjętych. | j.w. | sesja skanera (`scanner.receive_po.detail`) | — (odczyt) |
| `receiveScannerPoLine(client,session,input)` (`POST …/receive-line`) | **Jedna transakcja przyjęcia** (desktop i skaner ją współdzielą). Blokuje wiersz otwartego ZZ, pobiera lub tworzy dzisiejszy **roboczy PZ dnia**, wstawia `grn_items`, tworzy LP (`status='received', qa_status='pending'`, ważność = data ważności lub data przyjęcia + `items.shelf_life_days`), zapisuje genezę LP, emituje `warehouse.lp.received`, zmienia status ZZ na `partially_received`/`received`; otwiera oczekujący `quality_inspections` gdy `feature_flags->require_grn_qc_inspection` jest WŁĄCZONY; honoruje **opcjonalną lokalizację docelową** (inaczej domyślna lokalizacja magazynu). **Limit nadprzyjęcia = 110% zamówionej ilości → `over_receive_cap` (409).** Idempotentny dla `scanner_audit_log(org_id, client_op_id)`. | zapisuje `grns`, `grn_items`, `license_plates`, `lp_state_history`, `outbox_events`, `quality_inspections`, `purchase_orders`, `scanner_audit_log` | sesja skanera (`scanner.receive_po`) — NIE uprawnienie RBAC | `cancelGrnLine` |

### Skaner — odkładanie / przesunięcie / pobieranie + wyszukiwania — `lib/warehouse/scanner/movement.ts`

| Akcja (trasa) | Co robi | Odczytuje / zapisuje | Brama | Odwrócenie |
|---|---|---|---|---|
| `getScannerLpDetail` (`GET …/scanner/lp`) | Skanuj numer LP → nagłówek + łańcuch nadrzędnych/podrzędnych (dla kafelka informacji o LP). | odczytuje `license_plates`, `items`, `locations`, `warehouses`, `stock_moves` | sesja skanera (`warehouse.scanner.lp.lookup`) | — (odczyt) |
| `suggestPutawayLocations` (`GET …/scanner/putaway/suggest`) | Rankingowe sugestie miejsca docelowego dla LP: lokalizacja `same_product` → `empty` → przyjmująca/`default` (top 5). | odczytuje `locations`, `license_plates` | sesja skanera (`warehouse.scanner.putaway.suggest`) | — (odczyt) |
| `moveScannerLp(...,moveType:'putaway')` (`POST …/scanner/putaway`) | Relokacja LP i, jeśli nadal ma status `received`, **awansowanie `received→available`** (kanoniczna promocja odkładania, która sprawia że przyjęty towar staje się widoczny dla FEFO; `qa_status` bez zmian, więc towar oczekujący na QA pozostaje niewidoczny dla FEFO). Idempotentny (doradcza blokada transakcji + odtworzenie z `scanner_audit_log`). | zapisuje `stock_moves`, `license_plates`, `lp_state_history`, `outbox_events`, `scanner_audit_log` | sesja skanera **+ `warehouse.stock.move`** | ponowny ruch |
| `moveScannerLp(...,moveType:'transfer')` (`POST …/scanner/move`) | Czysty ruch lokalizacyjny (bez awansowania) dla already-available/kwarantanna/zablokowanego towaru. Odmawia terminalnym `consumed/destroyed/shipped` (`lp_not_movable`) lub blokadzie innego użytkownika. | zapisuje `stock_moves`, `license_plates`, `scanner_audit_log` | sesja skanera **+ `warehouse.stock.move`** | ponowny ruch |
| `pickScannerLp(...)` (`POST …/scanner/pick`) | **Pobranie FEFO** LP do lokalizacji przejściowej materiału ZP (`move_type='issue'`, **bez odliczenia zapasów** — konsumpcja jest rejestrowana oddzielnie przez 08-production). Brama QA wyłącznie dla pobrania: tylko towar z `qa_status='released'` może być pobierany (`lp_not_released`); artykuł/JM musi pasować do materiału (`lp_not_movable`). Miejsce docelowe = jawna lokalizacja albo linia przejściowa, albo `destination_required` (422). | zapisuje `stock_moves`, `license_plates` (lokalizacja), `scanner_audit_log` | sesja skanera **+ `warehouse.stock.move`** | ruch/zwrot poza pasmem |
| `listPickWorkOrders` (`GET …/scanner/pick/wos`) / `listFefoLps` (`GET …/scanner/pick/lps`) | Pobieralne ZP (RELEASED / in_progress / paused, w zakresie linii) + posortowane wg FEFO kandydackie LP dla materiału (`v_inventory_available`, `expiry asc nulls last`). | odczytuje `work_orders`, `wo_executions`, `wo_materials`, `items`, `production_lines`, `v_inventory_available`, `locations` | sesja skanera (`warehouse.scanner.pick.wos` / `.pick.lps`) | — (odczyt) |
| `getScannerLpDetail` przez `GET …/scanner/location` | Skanuj/rozwiązuj kod lokalizacji (ważność dla miejsca docelowego przesunięcia/odkładania). | odczytuje `locations` | sesja skanera (`warehouse.scanner.location.lookup`) | — (odczyt) |

**Liczba zinwentaryzowanych akcji: 37** — 2 odczyty LP, 2 odczyty PZ, 5 odczytów zapasów/ważności/ruchów/lokalizacji/genealogii, 1 ruch zapasów, 3 rezerwacje (+ selektor otwartych ZP), 3 QA LP/blokada/odblokowanie, 2 korekty przyjęć, 5 spisu, 5 bezpośredniej korekty (1 mutacja + 4 odczyty), 3 przyjęcia skanera, 6 odkładanie/przesunięcie/pobieranie skanera + wyszukiwania. Rdzeń zapisu to: `receiveScannerPoLine`, `releaseLpQa`, `moveScannerLp` (odkładanie/transfer), `pickScannerLp`, `createStockMove`, `reserveLp`/`releaseReservation`, `blockLp`/`unblockLp`, `cancelGrnLine`/`updateLpMetadata`, `approveAndApplyVariance` i `applyDirectAdjustment`.

> Ekran **harmonogramu dostaw** (`/warehouse/inbound`) i **drzewo lokalizacji**
> (`/warehouse/locations`) **nie dodają nowych akcji** — przyjęcia ponownie używają
> `listPurchaseOrders` + `listTransferOrders` z Zakupów/Planowania
> (odwołania krzyżowe, patrz *06-purchasing.md*), a lokalizacje ponownie używają
> `listLocations` + `listLPs`. **Historia druku** ponownie używa `listPrintJobs` z E1.

---

## c. Maszyna stanów

### Cykl życia Tablicy Palet (`license_plates.status` — mig 191 CHECK + mig 294 `destroyed`)

```
                  przyjęcie (skaner/desktop, wspólna transakcja)
                            │
                            ▼
   ┌───────────────────► received ──────────────┐
   │   (qa_status='pending', niekonsumowalne)    │
   │                          │                  │
   │       releaseLpQa        │  releaseLpQa     │  odkładanie (moveScannerLp)
   │       'released'         │  'rejected'      │  awansuje received→available
   │            ▼             ▼                  ▼
   │        available ◄── (odkładanie) ──   blocked ◄── blockLp (otwiera blokadę)
   │            │  ▲           ▲   │              ▲
   │   reserveLp│  │releaseRes │   │ blockLp      │ unblockLp → available
   │            ▼  │           │   ▼              │
   │        reserved           quarantine        │
   │            │                                 │
   │       pobranie (wydanie) / konsumpcja (08-prod) │
   │            ▼                                  │
   │        consumed (terminal)                    │
   │                                               │
   └─ cancelGrnLine ─► returned (terminal)          
         skurcz do 0 ─► destroyed (terminal)
         wysyłka (11-shipping) ─► shipped (terminal)
         scalenie ─► merged (terminal)
```

| `status` | Znaczenie | Ustawiany przez | Uwagi |
|---|---|---|---|
| `received` | Właśnie wygenerowany przy przyjęciu PZ | `receiveScannerPoLine` | Zawsze rodzi się z `qa_status='pending'` — nigdy nie konsumowany automatycznie. |
| `available` | Zwolniony przez QA, odkładalny, **konsumowany wg FEFO** | `releaseLpQa` (released) lub awansowanie odkładania | `v_inventory_available` wymaga `available` **i** `qa_status='released'`. |
| `reserved` | Przydzielony do ZP | `reserveLp` (ręcznie) / rezerwacja produkcji | `reserved_qty>0`, ustawiony `reserved_for_wo_id`. |
| `blocked` | Na blokadzie jakościowej | `blockLp`, lub `releaseLpQa('rejected')` z `received` | `qa_status='on_hold'` (blokada) lub `rejected` (odrzucenie QA). |
| `quarantine` | Wstrzymany (legacy/rodzina QA) | przepływy jakościowe | Liczy się jako na stanie w odczytach ważności/zapasów. |
| `consumed` | Zużyty przez produkcję (terminal) | 08-production konsumpcja | qty → 0. |
| `shipped` | Wysłany (terminal) | 11-shipping | — |
| `returned` | Przyjęcie anulowane (terminal) | `cancelGrnLine` | qty/reserved → 0; wykluczony z zestawień; edycje metadanych odmawiane. |
| `destroyed` | Unieważniony / skurczony do 0 (terminal) | `voidWoOutput` (08), skurcz `approveAndApplyVariance` | qty → 0. |
| `merged` | Włączony do innej LP (terminal) | przepływ scalania | — |

`qa_status` działa ortogonalnie: `pending → released` (pozytywna QA / odkładanie-a-następnie-zwolnienie)
lub `pending → rejected` / `→ on_hold` (blokada). **Pobieralność = `status='available' AND
qa_status='released'` minus `reserved_qty`** — jedyna reguła w
`v_inventory_available`.

### Cykl życia PZ / linii PZ

- **Nagłówek PZ** (`grns.status`): `draft → completed` (+ `cancelled`). Transakcja przyjęcia
  zawsze księguje na dzisiejszy **roboczy** PZ dnia (`getOrCreateOpenGrn`); linie
  roboczego PZ wliczają się do przyjętej ilości ZZ.
- **Linia PZ** (`grn_items`): tworzona jako aktywna przy przyjęciu → jednodrożna do **anulowana** przez
  `cancelGrnLine` (stempluje `cancelled_at`/`cancellation_reason_code`, unieważnia LP na
  `returned`). Anulowane linie wypadają z **każdego** zestawienia przyjętej ilości
  (`… and cancelled_at is null`).

### Cykl życia sesji spisu (`count_sessions.status` — mig 318)

```
 open ──► counting ──► review ──► closed
   │                              (terminal)
   └──────────────► cancelled (terminal)
```

| Stan | Znaczenie | Uwagi |
|---|---|---|
| `open` / `counting` / `review` | Sesja jest w trakcie spisu / przeglądu | `recordCount` tworzy/aktualizuje `count_lines` (`status='counted'`); wariancja może być stosowana gdy `open` **lub** `review`. |
| `closed` / `cancelled` | Terminal | — |

**Linia spisu** (`count_lines.status`): `pending → counted → applied` (wariancja zastosowana
z podpisem elektronicznym), plus `approved`/`rejected`. `approveAndApplyVariance` ponownie
waliduje bieżący stan i odmawia jeśli zapasy się zmieniły (`stock_changed_recount_required`) —
żadna przestarzała wariancja nie jest nigdy księgowana.

**Podsumowanie dozwolonych operacji:** przyjęcie jest dozwolone tylko gdy ZZ ma status `sent`/`confirmed`/
`partially_received`; zwolnienie QA jest wyłącznie dla `qa_status='pending'`; awansowanie
odkładania uruchamia się wyłącznie z `received`; pobranie wymaga `qa_status='released'`; rezerwacja wymaga
`available/reserved` + `released` + otwartego ZP; anulowanie linii PZ wymaga, aby LP nadal miała
status `received|available`, `qa pending|released`, rezerwacja 0, ilość niezmieniona, brak
podrzędnych/konsumpcji; zastosowanie wariancji wymaga sesji `open|review` i niezmienionego
bieżącego stanu.

<!-- screenshot: warehouse/license-plates list (status/qa filters + search) -->
<!-- screenshot: warehouse/license-plates/[lpId] detail (header + state history + moves + genealogy) -->
<!-- screenshot: scanner warehouse hub (Receive / Putaway / Move LP / Pick / LP info tiles) -->

---

## d. Instrukcje użytkownika

> Etykiety przycisków desktopu to klucze i18n z pakietów magazynowych; etykiety skanera
> pochodzą z pakietów PWA skanera. Ścieżki zapisu cytowane powyżej to akcje/trasy.

### (i) Przyjęcie towarów do ZZ

**Skaner (normalna ścieżka):**

1. Zaloguj się do skanera za pomocą **PIN** (`/scanner/login`); wybierz zakład / linię / zmianę.
2. Ekran główny → **Receive (PO)** → lista otwartych ZZ (`GET …/scanner/pos`,
   `listScannerPurchaseOrders`).
3. Dotknij ZZ → jego linie (zamówiona / przyjęta / pozostała), następnie dotknij linię.
4. Wpisz (opcjonalnie) **Partię** i **Datę ważności**, opcjonalną **lokalizację docelową**
   (skanuj/wpisz kod; puste = domyślna lokalizacja magazynu) oraz **Ilość** (domyślnie
   pozostała). Nadmierna ilość powyżej pozostałej wyświetla ostrzeżenie bursztynowe; serwer
   twardą granicą ustawia **110% zamówionej** (wyższa ilość → `over_receive_cap`).
5. Dotknij **Receive** → `POST …/receive-line` (`receiveScannerPoLine`). Po sukcesie
   otrzymujesz nowy **numer LP** oraz baner **„Blokada QC"** jeśli Wymagaj-GRN-QC jest
   włączone. LP rodzi się ze statusem `received`/`qa pending`.

**Desktop:** nie ma oddzielnego formularza przyjęcia na desktopie — `/warehouse/grns` i
`…/[grnId]` służą do **przeglądania** przyjęć/LP, **zwalniania QA** LP i **anulowania**
błędnej linii. (Patrz *06-purchasing.md* dla pełnego nakładania się przyjęcia po stronie ZZ.)

### (ii) Zwolnienie QA LP (udostępnienie do konsumpcji FEFO)

1. Otwórz PZ (`/warehouse/grns/[grnId]`) lub LP (`/warehouse/license-plates/[lpId]`).
2. Na LP z `qa_status='pending'` kliknij **Release** (pozytywna kontrola jakości) lub **Reject** →
   `releaseLpQa`. **Release** przełącza `received→available` i `qa_status='released'`
   (teraz konsumowalna / pobieralna); **Reject** przełącza `received→blocked` + `rejected`.
   Bramkowane na `warehouse.grn.receive`; jednokierunkowe.

### (iii) Odkładanie LP

1. Ekran główny skanera → **Putaway** → skanuj LP (`GET …/scanner/lp`,
   `getScannerLpDetail`).
2. Zaakceptuj **sugerowaną lokalizację** (`GET …/scanner/putaway/suggest`:
   ten_sam_produkt → pusta → domyślna) lub zeskanuj/wpisz własną.
3. **Potwierdź** → `POST …/scanner/putaway` (`moveScannerLp` putaway). LP zostaje
   przeniesiona; jeśli nadal miała status `received` jest **awansowana do `available`**
   w tej samej transakcji (widoczna dla FEFO). Wymaga `warehouse.stock.move`.

### (iv) Przesunięcie LP między lokalizacjami

- **Skaner:** Ekran główny → **Move LP** → skanuj LP → skanuj miejsce docelowe → potwierdź →
  `POST …/scanner/move` (`moveScannerLp` transfer). Czysta relokacja (bez awansowania);
  odmawia terminalnym LP.
- **Desktop:** `/warehouse/license-plates/[lpId]` → **Move** → wybierz miejsce docelowe z
  selektora lokalizacji (`listLocations`) → `createStockMove`. Odmawia
  `consumed/destroyed/shipped` (`immovable_status`) lub LP zablokowanej przez innego
  użytkownika.

### (v) Pobranie (FEFO) do zlecenia produkcyjnego

1. Ekran główny skanera → **Pick** → wybierz pobieralne ZP (`GET …/scanner/pick/wos`,
   `listPickWorkOrders`) i materiał.
2. Ekran wyświetla **kandydackie LP posortowane wg FEFO** (`GET …/scanner/pick/lps`,
   `listFefoLps`: `expiry asc nulls last`). Zeskanuj sugerowaną LP i **lokalizację
   docelową (przejściową)** (pusta = lokalizacja przejściowa linii, inaczej `destination_required`).
3. **Pick** → `POST …/scanner/pick` (`pickScannerLp`): ruch `move_type='issue'`
   (bez odliczenia ilości — konsumpcja następuje później w Produkcji). Tylko towar
   **zwolniony przez QA** jest pobieralny; artykuł/JM musi pasować do materiału.

### (vi) Wyszukanie LP + jej genealogii

1. `/warehouse/license-plates` → filtruj/szukaj → otwórz `…/[lpId]` → `getLpDetail`
   (nagłówek, **podrzędne LP**, **księga historii stanów**, **ruchy zapasów**).
2. Dla pełnej genealogii otwórz widok **Genealogy** (`/warehouse/genealogy`) lub zakładkę
   genealogii LP → `traceGenealogy` (`queryGenealogy`): przodkowie + ja + potomkowie,
   przechodzące zarówno krawędzie `parent_lp_id`, jak i `lp_genealogy` (np. wynikowa
   LP produkcji z powrotem do zużytych LP wejściowych). Na skanerze kafelek **LP info**
   wyświetla łańcuch nadrzędnych/podrzędnych bezpośrednio.

### (vii) Przeprowadzenie spisu z natury + zastosowanie wariancji

1. `/warehouse/counts` → **Nowy spis** → wybierz **magazyn** i **typ**
   (`cycle`/`full`/`spot`) → `createCountSession`. (Bramkowane na `warehouse.stock.adjust`.)
2. Otwórz sesję (`getCountSession`) i dla każdego slotu wpisz **policzoną ilość**
   (opcjonalna partia/ważność) → `recordCount`. Ilość systemowa jest odczytywana na bieżąco z
   `v_inventory_available` i **wariancja** jest obliczana i wyświetlana dla każdej linii.
3. Na linii wariancji kliknij **Approve & apply** → wpisz **PIN/hasło podpisu elektronicznego**
   (CFR-21) → `approveAndApplyVariance`. Serwer ponownie odczytuje bieżący stan
   (odmawia jeśli się zmienił — `stock_changed_recount_required`), następnie dla
   **pozytywnej** wariancji tworzy LP korygującą `available/released`, a dla
   **ujemnej** FEFO-drainuje istniejące LP (wyzerowana LP → `destroyed`). Zapisuje
   `stock_adjustments` + podpisany wiersz `adjustment` `stock_moves` i oznacza linię
   `applied`.

### (viii) Bezpośrednia korekta zapasów (bez sesji spisu)

> Użyj jej do **jednorazowej** korekty znalezionego towaru / uszkodzenia / odpisu na
> danej lokalizacji+artykule — **nie** do pełnego uzgodnienia. Do sesyjnego ślepego
> spisu, którego wariancję przeglądasz i stosujesz, użyj **(vii) spisu z natury**. Obydwa
> zapisują do tej samej ewidencji `stock_adjustments`/`stock_moves`; ta wersja pomija
> wrapper `count_sessions`.

1. Centrum magazynowe → karta **Adjustments** (`/warehouse/adjustments/new`; karta centrum
   jest podłączona w `warehouse/page.tsx:71-75`). Bramkowane na `warehouse.stock.adjust` —
   osoba bez tego uprawnienia widzi panel odmowy dostępu.
2. Wybierz **lokalizację** (zakład + magazyn wynikają z niej), **artykuł** (`searchAdjustItems`
   — każdy typ magazynowy), **kierunek**, **ilość** + **JM** oraz **kod powodu**
   (`found_stock / spillage_damage / expiry_write_off / data_entry_error / system_sync /
   other`; tekst dowolny wymagany dla `other`).
3. **Zwiększenie (dodanie znalezionego towaru):** opcjonalnie wpisz **partię / datę ważności**,
   następnie swój **PIN/hasło podpisu elektronicznego** → `applyDirectAdjustment` tworzy **nową LP**
   z `qa_status='pending'` (**blokada QA** — nie jest konsumowalna wg FEFO dopóki QA jej nie
   zwolni, dokładnie jak przyjęta LP). Przekazanie konkretnej LP przy zwiększeniu jest odmawiane
   (`use_count_session`) — uzupełnij przez spis.
4. **Zmniejszenie (usunięcie uszkodzonego/przeterminowanego):** opcjonalnie wskaż **konkretną paletę (LP)**
   (`listDecreaseLps`, inaczej serwer FEFO-drainuje lokalizację); następnie **dwie osoby podpisują**
   — własny PIN podpisu elektronicznego **i** **odrębny przełożony** (`searchEligibleSupervisors`),
   który niezależnie posiada `warehouse.stock.adjust` i wpisuje **swój** PIN. Przełożony nie
   może być tobą (`supervisor_self_approval`), musi być zarejestrowany
   (`supervisor_pin_not_enrolled`) i jest ponownie weryfikowany w transakcji
   (`supervisor_pin_invalid` / `_locked` / `supervisor_forbidden`). To odzwierciedla bramę
   drugiej osoby dla nadkonsumpcji / odwrotnej konsumpcji skanera. Serwer FEFO-drainuje
   LP `available`/`released`/niezarezerwowane (LP wyzerowana → `destroyed`) i odmawia jeśli
   brakuje wystarczających niezarezerwowanych zapasów (`insufficient_unreserved` / `insufficient_stock`).
5. Po sukcesie otrzymujesz numer **zajętej LP**. Ponowne przesłanie tej samej operacji to
   bezpieczna operacja bez efektów (idempotentna dla `clientOpId`). Nie ma cofnięcia jednym
   kliknięciem — cofnij przez korektę licznikową.

### (ix) Anulowanie / korekta błędnego przyjęcia

1. `/warehouse/grns/[grnId]` → na aktywnej linii kliknij **Cancel** (widoczne tylko jeśli
   posiadasz `warehouse.receipt.correct` i PZ nie jest anulowany).
2. Wybierz **kod powodu** (`entry_error / wrong_quantity / wrong_batch / wrong_product
   / other`) + opcjonalna notatka → `cancelGrnLine`. LP zostaje unieważniona do `returned`
   (qty 0) i linia wypada z zestawienia ZZ. Jeśli LP już została przeniesiona / była
   zarezerwowana lub zużyta / ma podrzędne, jest odmawiana (`lp_not_cancellable`) — użyj
   korekty spisu zapasów. **Bez podpisu elektronicznego.**
3. **Błędna partia/ważność tylko?** Nie anuluj — użyj **korekty metadanych** LP
   (`updateLpMetadata`) z ekranu LP, aby naprawić ważność/partię w miejscu (audytowana;
   ta sama brama `warehouse.receipt.correct`). Odmawiana dla terminalnych/`returned` LP.

### (x) Blokowanie / odblokowanie LP (blokada po stronie magazynu)

1. `/warehouse/license-plates/[lpId]` → **Block** → powód → `blockLp` otwiera prawdziwy
   wiersz `quality_holds` i przełącza LP na `blocked`/`on_hold` (bramkowane `warehouse.lp.block`).
2. **Unblock** → powód → `unblockLp` deleguje do ścieżki zwalniania blokady 09-quality; LP
   wraca do `available`/`released`. Patrz *09-quality.md* w sprawie modelu blokad.

---

## e. Źródła danych (tabele Supabase)

Rdzeń LP / przyjęcia / ruchów (odczyt/zapis, kanoniczny 05-warehouse):

- `license_plates` — LP (status/qa_status/quantity/reserved_qty/batch/expiry/best_before/location/warehouse/site/origin/parent_lp_id/grn_id/wo_id/reserved_for_wo_id/locked_by).
- `lp_state_history` — dołącz-tylko ewidencja przejść LP (geneza, QA, odkładanie, rezerwacja, blokada, anulowanie, metadane, skurcz).
- `lp_genealogy` — krawędzie dziecko↔rodzic LP (`consumed`/`derived`), przemierzane przez `queryGenealogy`.
- `grns` / `grn_items` — nagłówek PZ (roboczy dzienny, source_type='po') + linie przyjęcia (received_qty, po_line_id, lp_id, `cancelled_at`/powód).
- `stock_moves` — jawna ewidencja ruchów (`putaway`/`transfer`/`issue`/`adjustment`; idempotentna dla `(org_id, transaction_id)`).
- `count_sessions` / `count_lines` / `stock_adjustments` — sesje spisu, policzono linie + wariancja, zastosowane korekty (mig 318). `stock_adjustments` jest **również** zapisywana przez bezpośrednią korektę (mig 328 dodaje `approved_by` + CHECK kodu powodu ograniczający `reason` do 6 kodów bezpośredniej korekty + CHECK SoD `approved_by <> applied_by`).
- `locations` / `warehouses` — drzewo obiektów + master magazynowy (odczyt dla ruchów, odkładania, drzewa, rozwiązania domyślnej lokalizacji).
- `warehouse_storage_settings` — `expiry_warning_days` na magazyn (progi ważności).

Widoki / odczyty między modułami:

- `v_inventory_available` — **widok FEFO/pobieralności** (`available` + `released` minus zarezerwowane, `expiry asc nulls last`); jedyne źródło dla konsumpcji/pobrania/ilości systemowej spisu.
- `v_active_holds` — aktywne blokady jakościowe (odczyt w `blockLp` w celu odmowy podwójnej blokady).
- `purchase_orders` / `purchase_order_lines` / `suppliers` — strona ZZ transakcji przyjęcia (odczyt + zestawienie statusów).
- `work_orders` / `wo_executions` / `wo_materials` — cele rezerwacji / pobrania (odczyt).
- `items` — master artykułów (kod/nazwa artykułu, `shelf_life_days`/`shelf_life_mode`, `uom_base`; odczyt).
- `quality_holds` / `quality_hold_items` / `quality_inspections` — blokada zapisuje blokadę; przyjęcie otwiera inspekcję GRN-QC gdy flaga jest włączona (właściciel 09-quality).
- `tenant_variations` — `feature_flags->require_grn_qc_inspection` (odczyt).
- `print_jobs` — historia druku LP/etykiet (E1; odczyt przez `listPrintJobs`).
- `users` / `user_roles` / `roles` / `role_permissions` / `user_pins` — brama SoD bezpośredniej korekty (odczyt): `searchEligibleSupervisors` wyświetla odrębnych posiadaczy `warehouse.stock.adjust` z zarejestrowanym PIN, a `applyDirectAdjustment` ponownie weryfikuje uprawnienie + PIN przełożonego w transakcji.

Zarządzanie / zdarzenia:

- `e_sign_log` — podpis elektroniczny CFR-21 dla `approveAndApplyVariance` **i** `applyDirectAdjustment` (intencja `warehouse.stock.adjust`; bezpośrednie zmniejszenie dodatkowo weryfikuje PIN odrębnego przełożonego w `user_pins`).
- `audit_events` — korekty przyjęć (`warehouse.receipt.corrected`, `warehouse.lp.metadata_corrected`), korekty zapasów (`warehouse.stock.adjusted`, `warehouse.stock.count_metadata_recorded`).
- `outbox_events` — `warehouse.lp.received` (przyjęcie), `warehouse.lp.transitioned` (zwolnienie QA + awansowanie odkładania), `quality.hold.created` (blokada).
- `scanner_audit_log` — idempotencja + audyt skanera przyjęcia/odkładania/przesunięcia/pobrania (`(org_id, client_op_id)`).

---

## f. Znane luki / TODO

Zakorzenione w odczytanym kodzie — bez domysłów:

1. **`warehouse.receipt.correct` NIE jest w enumie `Permission`.** Jest zasiane tylko
   przez migracje `293-corrections-foundation.sql` / `296-corrections-hardening.sql`
   i konsumowane przez `receipt-corrections-actions.ts`, ale nigdy nie zadeklarowane w
   `packages/rbac/src/permissions.enum.ts` (enum wymienia `warehouse.inventory.read`,
   `warehouse.stock.move/adjust`, `warehouse.grn.receive`, `warehouse.lp.*` ale nie
   `receipt.correct`). Jest więc niewidoczne dla strażnika blokady enum i macierzy
   Ustawienia → Role — taka sama rozbieżność jak w korektach produkcji. Należy dodać.

2. **Anulowanie linii PZ nie ma podpisu elektronicznego.** Celowa decyzja (korekty
   przyjęć mają niższe ryzyko), ale oznacza, że posiadacz `warehouse.receipt.correct`
   może unieważnić LP przyjęcia wyłącznie z wierszem audytu — bez drugiego podpisującego.
   Zastosowanie wariancji, w przeciwieństwie do tego, **wymaga** podpisu elektronicznego CFR-21.

3. **Trasy zapisu zapasów skanera pożyczają `warehouse.stock.move` do wszystkiego.**
   Odkładanie, przesunięcie i **pobranie** bramkują na pojedynczym ciągu `warehouse.stock.move`
   (`move/route.ts`, `putaway/route.ts`, `pick/route.ts`); nie ma odrębnego uprawnienia
   `warehouse.lp.pick` / `warehouse.putaway`, więc nie można przyznać pobrania bez
   przyznania ruchów swobodnych.

4. **Limit nadprzyjęcia to stała 110%** (`receive-po.ts:271`, `cap = ordered*110/100`)
   — nie sterowany przez progi nadprzyjęcia Ustawień używane w konsumpcji produkcyjnej.
   Brak konfigurowalności per org (ta sama luka co w Zakupach).

5. **Desktop `createStockMove` to wyłącznie `transfer` i nie ma awansowania FEFO/odkładania.**
   Awansowanie odkładania (`received→available`) istnieje **wyłącznie** na ścieżce skanera
   (`moveScannerLp`); desktop `createStockMove` na LP ze statusem `received` przenosi ją
   ale **nie** awansuje, więc zakłady tylko-desktopowe muszą zwolnić QA, aby zapasy
   były pobieralne. Nie ma w ogóle desktopowego ekranu pobrania (pobranie jest wyłącznie
   skanerowe).

6. **`unblockLp` sięga do 09-quality** (`releaseHoldFromWarehouseLpUnblock`)
   — akcja magazynowa, której brama uprawnień leży wewnątrz delegata jakości, a nie
   w rodzinie RBAC magazynu. Zaznaczone, aby czytelnik wiedział, że uprawnienie odblokowania
   należy do jakości, podczas gdy `blockLp` bramkuje na `warehouse.lp.block`.

7. **Metadane spisu (partia/ważność) dla LP zwiększenia są przechowywane w `audit_events`,
   a nie w pierwszorzędnej kolumnie** (`count-actions.ts` `writeCountLineAdjustmentMetadata` /
   `readCountLineAdjustmentMetadata`) — odczytywane przez zapytanie o najnowszy wiersz audytu
   `warehouse.stock.count_metadata_recorded` dla danej linii. Skrót modelowania, nie
   dedykowane `count_lines.batch_number`/`expiry_date`.

8. **Brak warstwy akcji „scal / podziel LP"** mimo że enum deklaruje
   `warehouse.lp.merge` / `warehouse.lp.split`, a rodzina statusów LP zawiera
   `merged`: nie znaleziono akcji `mergeLp`/`splitLp` w `warehouse/_actions/**` ani
   `lib/warehouse/**`. Statusy/uprawnienia istnieją; operacje jeszcze nie (jeszcze).

9. **Bezpośrednia korekta jeszcze nie zapisuje `stock_adjustments.approved_by`.** Mig 328
   dodaje pierwszorzędną kolumnę `approved_by` (+ CHECK SoD `approved_by <> applied_by`),
   ale `insertStockAdjustment` INSERT w `applyDirectAdjustment` **nie** wypełnia go —
   kontrasygnujący przełożony jest aktualnie utrwalany wyłącznie w
   `stock_moves.ext_jsonb.supervisor_approved_by` (i `lp_state_history.ext`). Podłączenie
   go do wiersza `stock_adjustments` to zaznaczone działanie następcze (nagłówek mig 328
   sam to dokumentuje). Podobnie kody powodów i CHECKi SoD mają `NOT VALID` (strzegą tylko
   nowych wierszy, aby pozostać bezpiecznym dla starego kodu z wierszy cyklu spisu). Ponadto:
   **nie ma odrębnego uprawnienia `warehouse.stock.adjust.approve`** — brama SoD przełożonego
   ponownie używa samego `warehouse.stock.adjust` (ten sam podwyższony grant, który posiada
   inicjator), więc każdy drugi korygujący kwalifikuje się jako przełożony.

10. **Harmonogram dostaw i drzewo lokalizacji nie mają własnej warstwy danych.** Harmonogram
   dostaw ponownie używa akcji listy ZZ + WZ Planowania, a Lokalizacje ponownie używają
   `listLocations` + `listLPs` (ilości obliczane po stronie klienta, ograniczone) —
   zaznaczone, aby czytelnik nie szukał `warehouse/inbound/_actions` ani akcji
   `locationTree` (których nie ma).

11. **Konsumer outbox `apps/worker` nie działa.** `warehouse.lp.received` /
    `warehouse.lp.transitioned` / `quality.hold.created` są utrwalane do
    `outbox_events`, ale nie ma żywego dispatchera (wg `MON-project-overview`), więc
    reakcje downstream to szew, jeszcze nie dostarczony.

W plikach akcji/lib magazynu nie znaleziono surowych znaczników `// TODO` poza cytowanymi
powyżej uwagami dotyczącymi własności/uprawnień; lista luk pochodzi w pozostałym zakresie z
ograniczeń możliwości i rozbieżności enum-vs-migracja zaobserwowanych w kodzie.

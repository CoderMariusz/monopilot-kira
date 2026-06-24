# Wysyłka — ZS → alokacja → kompletacja → pakowanie → wysyłka → BOL/POD + korekty (przewodnik modułu)

> Szczegółowy przewodnik modułu. Każde twierdzenie poniżej jest zakotwiczone w
> rzeczywistym pliku w `apps/web/…` lub `packages/…`; nic nie jest wymyślone.
> Moduł stanowi **pojedynczą grupę tras** — ekrany **Zamówienia Sprzedaży**
> na pulpicie roboczym dostępne są pod `/shipping`
> (`…/(modules)/shipping/`, lista + szczegóły `[soId]`), a ekrany
> **Wysyłki / pakowania / ekspedycji** — pod `/shipping/shipments`
> (`…/shipping/shipments/`, lista + ekran pakowania `[shipmentId]`). Moduł
> nie posiada części skanerowej. Ustawienia kodów przyczyn nadpisania / RMA
> dla modułu dostępne są w `/settings/ship-override-reasons`.
>
> **Zamówienie Sprzedaży** (ZS) jest obiektem nadrzędnym; przechodzi przez
> wymuszony po stronie serwera cykl życia o **12 stanach**. **Alokacja**
> rezerwuje rzeczywisty stan magazynowy **Palety Logistycznej** (LP) poprzez
> kanoniczną tabelę `inventory_allocations`; **pakowanie** tworzy
> **kartony** (każdy z kodem GS1 **SSCC-18**) w ramach obiektu podrzędnego
> **Wysyłki**; wysyłka jest **uszczelniana → ekspediowana**, generowany jest
> **BOL** (haszowany SHA-256), a następnie rejestrowane jest **POD**
> (potwierdzenie dostawy). Błędy można korygować: **cancelShipment**,
> **unpackShipment** i **voidPod** wymagają każdorazowo podpisu
> elektronicznego CFR-21 i tworzą wpisy w audycie oraz zdarzenia outbox.
>
> Trasy są zapisane bez prefiksu `[locale]`. Ostatni przegląd względem
> drzewa roboczego (maszyna stanowa ZS o 12 stanach, pakowanie/SSCC,
> wysyłka/BOL/POD oraz akcje odwracalności wysyłki W11).

---

## a. Omówienie

Moduł Wysyłki przekształca zamówienie klienta w wysłany i potwierdzony
dostawą towar. Użytkownik tworzy **Zamówienie Sprzedaży** (nagłówek: klient,
żądana data, uwagi; pozycje: towar gotowy, ilość, JM), przeprowadza je przez
wymuszaną po stronie serwera **maszynę stanową o 12 stanach** (`draft →
confirmed → allocated → partially_picked → picked → partially_packed → packed
→ manifested → shipped → partially_delivered → delivered`, oraz `cancelled`)
i realizuje wysyłkę.

Potok składa się z dwóch rodzin obiektów połączonych przez LP:

- **Alokacja** (`allocateSalesOrder`) przechodzi przez każdą pozycję ZS
  metodą FEFO po `available` + `qa_status='released'` Paletach Logistycznych,
  wstawia kanoniczne wiersze **`inventory_allocations`** i zwiększa
  `reserved_qty` każdej LP (rezerwacja miękka — LP nie jest dekrementowana,
  tylko zarezerwowana). `deallocateSalesOrder` jest dokładną odwrotnością tej
  operacji.
- **Pakowanie** (`createShipment` → `packLpIntoBox` → `sealShipment`) tworzy
  obiekt podrzędny **Wysyłkę** dla ZS, tworzy **kartony** (`shipment_boxes`,
  każdy z wygenerowanym przez serwer **SSCC-18**) i rejestruje, która LP
  trafiła do którego kartonu (`shipment_box_contents`). **Ekspedycja**
  (`shipShipment`) ustawia LPs na `status='shipped'`, emituje
  `warehouse.lp.shipped` dla każdej LP i zmienia status ZS na `shipped`.
  **BOL** (`generateBol`) haszuje ładunek listu przewozowego algorytmem
  **SHA-256** i zapisuje dane przewoźnika/śledzenia na wysyłce. **POD**
  (`recordPod`) oznacza wysyłkę jako `delivered` i — gdy jest to ostatnia
  otwarta wysyłka dla ZS — zmienia status ZS na `delivered`.

**Kompletacja** *nie* jest osobną akcją zapisu w zaimplementowanej warstwie:
przejścia `allocated → partially_picked → picked` to zwykłe ruchy statusowe
`transitionSalesOrderStatus` (brak wykonawcy listy kompletacyjnej / fali —
patrz *Znane luki*).

Błędy są odwracalne (odwracalność wysyłki W11, `cancelShipment.ts`):

- **`cancelShipment`** — zwalnia alokacje wysyłki + rezerwacje LP, cofa
  status wysłanych LP (`shipped → available`), ustawia wysyłkę na
  `cancelled` i **przelicza** status nadrzędnego ZS na podstawie
  pozostałych wysyłek.
- **`unpackShipment`** — usuwa kartony + zawartość (soft-delete) i cofa
  status wysyłki `packed`/`manifested → packing`.
- **`voidPod`** — cofa dostawę wysyłki (`delivered → shipped`, czyści
  `delivered_at` / podpisany BOL), chroniony sprawdzeniem
  **downstream-financial-record** (odmawia, jeśli faktura/płatność
  odwołuje się do wysyłki lub ZS).

Wszystkie trzy korekty wymagają **podpisu elektronicznego CFR-21**
(`signEvent`), tworzą wiersz `audit_events` i emitują zdarzenie outbox.

Akcje zapisu/odczytu ZS dostępne są w `shipping/_actions/so-actions.ts`;
pomocniki odczytu formularza tworzenia ZS w `so-form-data.ts`; pakowanie/SSCC
w `pack-actions.ts`; wysyłka/BOL/POD w `ship-actions.ts`; trzy korekty w
`cancelShipment.ts`; administracja kodami przyczyn nadpisania/RMA w
`settings/ship-override-reasons/_actions/shipping-overrides.ts`.

---

## b. Inwentarz funkcji

> Odczyty/zapisy wymieniają dotykane tabele Postgres. „Brama" to uprawnienie
> sprawdzane po stronie serwera **wewnątrz** akcji (brak uprawnienia zwraca
> typowane `forbidden` / `{ok:false,error:'forbidden'}`, nigdy 500). Wszystkie
> akcje działają wewnątrz `withOrgContext` (RLS: `org_id =
> app.current_org_id()`); brak obejścia roli serwisowej, brak mocków. Helper
> `hasPermission` przyznaje dostęp przez wiersz `role_permissions` **lub**
> starszą tablicę jsonb `roles.permissions`.

### Zamówienie Sprzedaży — `shipping/_actions/so-actions.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Brama (`ship.*`) | Korekta / odwrócenie |
|---|---|---|---|---|
| `listSalesOrders({status?,search?})` | Lista ZS (zakładka statusu + wyszukiwanie po numerze ZS / nazwie klienta / kodzie klienta; liczba pozycji + Σ suma pozycji; limit 200). | odczytuje `sales_orders`, `sales_order_lines`, `customers` | `ship.dashboard.view` | — (odczyt) |
| `getSalesOrder(id)` | Nagłówek + pozycje dla ekranu szczegółów; każda pozycja zawiera `allocated_qty` + wyliczony `allocation_status` (`unallocated`/`partially_allocated`/`allocated`). | odczytuje `sales_orders`, `sales_order_lines`, `items`, `customers` | `ship.dashboard.view` | — (odczyt) |
| `createSalesOrder({customer_id,requested_date?,notes?,lines[]})` | Wstawia nagłówek ZS (`status='draft'`, `order_number` przez `next_sales_order_document_number`) + ≥1 pozycję. `unit_price_gbp` na pozycję rozwiązywana przez `resolveSalesLinePrice` (fallback `list_price_gbp` towaru; cennik per-klient jest zaślepką). Odmawia przy braku pozycji / nieznanym towarze. | zapisuje `sales_orders`, `sales_order_lines` | `ship.so.create` | Anulowanie przez `transitionSalesOrderStatus(...,'cancelled')` |
| `transitionSalesOrderStatus(id,newStatus)` | Przesuwa ZS wzdłuż `LEGAL_TRANSITIONS` (ponownie walidowanych po stronie serwera). `cancelled` najpierw dealokuje. Obejmuje ręczne ruchy `confirm` / `pick` / `pack` / `manifest` / `cancel`. Uprawnienie zależy od celu (`confirm→ship.so.confirm`, `cancel→ship.so.cancel`, pozostałe `ship.so.create`). | zapisuje `sales_orders` (+ zwolnienie alokacji/LP przy anulowaniu) | per-cel (patrz *Maszyna stanowa*) | Głównie jednostronnie; `cancel` to wyjście terminalne |
| `allocateSalesOrder(id)` | `confirmed → allocated`. Dla każdej pozycji, metodą FEFO przechodzi po `license_plates` (`available`+`released`, `qty-reserved>0`, `order by expiry asc nulls last` z `for update`), wstawia wiersze `inventory_allocations`, zwiększa LP `reserved_qty`, ustawia `quantity_allocated` pozycji. Twardym błędem jest `INSUFFICIENT_STOCK` (z potrzebną/dostępną ilością), jeśli żadna pozycja nie może być w pełni pokryta. | odczytuje `sales_order_lines`, `license_plates`; zapisuje `inventory_allocations`, `license_plates` (reserved_qty), `sales_order_lines`, `sales_orders` | `ship.so.create` *(wielokrotnego użytku z create — brak granularnego `ship.so.allocate`; patrz luki)* | `deallocateSalesOrder` |
| `deallocateSalesOrder(soId)` | Zwalnia każdą alokację `allocated` dla ZS: `inventory_allocations.status='released'`, dekrementuje LP `reserved_qty` (dolna granica 0), zeruje `quantity_allocated`, cofa ZS do `confirmed`. | zapisuje `inventory_allocations`, `license_plates`, `sales_order_lines`, `sales_orders` | `ship.so.create` | `allocateSalesOrder` |

### Pomocniki odczytu ZS — `shipping/_actions/so-form-data.ts` + `sales-line-price.ts`

| Akcja | Co robi | Odczytuje | Brama |
|---|---|---|---|
| `listSoCustomers()` | Aktywni klienci dla elementu `<Select>` w formularzu tworzenia ZS (prawdziwa tabela `public.customers`, aktywne, posortowane po kodzie, limit 200). W razie błędu bezpiecznie zwraca `[]`. | `customers` | Zakres RLS (bez sprawdzania uprawnień) |
| `searchSoItems(input)` | Wyszukiwarka towarów dla pozycji ZS, ograniczona do **fg** (ZS wysyła towary gotowe). Deleguje do NPD `searchItems`. | `items` | Zakres RLS |
| `getSoCapabilities()` | Doradcze sondowanie RBAC dla przycisków w szczegółach ZS (`canAllocate=ship.so.create`, `canConfirm=ship.so.confirm`, `canCancel=ship.so.cancel`). Bezpiecznie zwraca wszystko-false. | `user_roles`, `role_permissions`, `roles` | Zakres RLS |
| `resolveSalesLinePrice(item,opts)` (`sales-line-price.ts`, czysty helper — nie jest Server Action) | Zwraca cenę jednostkową pozycji ZS. Aktualnie `item.list_price_gbp ?? 0`; `opts.customerId` jest **zarezerwowany** dla przyszłego cennika per-klient. | — | — |

### Pakowanie / kartony / SSCC — `shipping/_actions/pack-actions.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Brama (`ship.*`) | Korekta / odwrócenie |
|---|---|---|---|---|
| `createShipment(soId)` | Otwiera **Wysyłkę** (`status='packing'`) dla ZS w stanie `allocated`/`partially_allocated`. Kopiuje `customer_id` / `shipping_address_id` / `site_id` z ZS. | odczytuje `sales_orders`; zapisuje `shipments` | `ship.pack.close` | `cancelShipment` |
| `packLpIntoBox({shipmentId,lpId,boxId?})` | Rozwiązuje LP (po UUID lub `lp_number`/`lp_code`), weryfikuje jej alokację (`inventory_allocations.status in ('allocated','picked')`) do pozycji ZS tej wysyłki i to, że **nie jest już zapakowana**, następnie wstawia wiersz `shipment_box_contents`. Jeśli nie podano `boxId`, tworzy nowy wiersz `shipment_boxes` z **SSCC-18** wygenerowanym przez serwer (`generate_sscc`) + kolejnym numerem kartonu. | odczytuje `license_plates`, `shipment_box_contents`, `inventory_allocations`, `sales_order_lines`, `shipment_boxes`; zapisuje `shipment_boxes`, `shipment_box_contents` | `ship.pack.close` | `unpackShipment` (unieważnia wszystkie kartony) |
| `getShipment(id)` | Szczegóły wysyłki: nagłówek (status, nr ZS, klient, liczba kartonów, URL BOL/podpisanego BOL, przewoźnik/śledzenie, znaczniki czasu pakowania/wysyłki/dostawy) + kartony z SSCC + zawartość per-karton (kod LP, towar, ilość). | odczytuje `shipments`, `sales_orders`, `customers`, `shipment_boxes`, `shipment_box_contents`, `license_plates`, `items` | `ship.dashboard.view` | — (odczyt) |
| `listShipments({status?})` | Lista wysyłek (opcjonalny filtr statusu, liczba kartonów, klient; limit 200). | odczytuje `shipments`, `sales_orders`, `customers`, `shipment_boxes` | `ship.dashboard.view` | — (odczyt) |

### Ekspedycja / BOL / POD — `shipping/_actions/ship-actions.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Brama (`ship.*`) | Korekta / odwrócenie |
|---|---|---|---|---|
| `sealShipment(shipmentId)` | `packing → packed`. Wymaga ≥1 kartonu (inaczej `no_boxes`). Zapisuje `packed_at`/`packed_by`. | zapisuje `shipments` | `ship.pack.close` | `unpackShipment` |
| `shipShipment(shipmentId)` | `packed → shipped`. Ustawia każdą zapakowaną LP na `status='shipped', reserved_qty=0`, emituje jedno `warehouse.lp.shipped` per LP, zmienia **nadrzędny ZS** na `shipped` (ustawia `shipped_at`). Twardy błąd, jeśli nie wszystkie LP zostały zaktualizowane. | odczytuje `shipment_box_contents`, `shipment_boxes`, `license_plates`; zapisuje `shipments`, `license_plates`, `outbox_events`, `sales_orders` | `ship.pack.close` *(NIE `ship.ship.confirm`; to uprawnienie jest zadeklarowane, ale nieużywane — patrz luki)* | `cancelShipment` |
| `generateBol({shipmentId,carrier?,serviceLevel?,trackingNumber?})` | Buduje ładunek BOL (wysyłka, organizacja, przewoźnik, lista LP, znacznik czasu), haszuje go algorytmem **SHA-256**, zapisuje `carrier`/`service_level`/`tracking_number`/`bol_pdf_url`(=zserializowany ładunek) na wysyłce + `ext_data.bol_sha256`. Zwraca hash jako `bolRef`. | odczytuje `shipment_box_contents`, `license_plates`; zapisuje `shipments` | `ship.pack.close` | — (ponowne wygenerowanie nadpisuje) |
| `recordPod({shipmentId,signedPdfUrl?})` | **POD** (potwierdzenie dostawy). `→ delivered`, zapisuje `delivered_at` + `bol_signed_pdf_url`. Gdy jest to **ostatnia** niedostarczona wysyłka ZS, zmienia status ZS na `delivered`. | zapisuje `shipments`, `sales_orders` | `ship.dashboard.view` *(uprawnienie odczytu bramkuje zapis dostawy — patrz luki)* | `voidPod` |

### Korekty — `shipping/_actions/cancelShipment.ts`

> Wszystkie trzy przyjmują `{shipmentId, reasonCode?, note?, signature:{password,nonce?}}`,
> **walidują dane przez zod**, **blokują wierszami** wysyłkę + jej ZS `for update`,
> **podpisują elektronicznie CFR-21** (`signEvent`, cel per-korekta), tworzą wiersz
> `audit_events` i emitują zdarzenie outbox. Idempotentne: każda ponownie
> sprawdza bieżący stan, a `cancelShipment` skraca obieg do `ok:true`, jeśli
> wysyłka jest już anulowana.

| Akcja | Co robi | Odczytuje / zapisuje | Brama (`ship.*`) | Kierunek odwrócenia |
|---|---|---|---|---|
| `cancelShipment(input)` | Unieważnia wysyłkę w stanie nieterminalnym. Zwalnia jej `inventory_allocations` (`→released`, dekrementuje LP `reserved_qty`), cofa status wysłanych LP (`→available`, czyści `source_so_id`, zapisuje `lp_state_history` + `warehouse.lp.transitioned`), ustawia wysyłkę na `cancelled`, następnie **przelicza** status ZS na podstawie pozostałych wysyłek+alokacji. Blokuje się na terminalnym statusie wysyłki lub ZS w stanie `delivered`/`partially_delivered`/`cancelled`. Cel podpisu elektronicznego: `cancel_shipment`. | odczytuje/zapisuje `shipments`, `inventory_allocations`, `license_plates`, `lp_state_history`, `sales_orders`; zapisuje `audit_events`, `outbox_events` (`shipping.so.cancelled`, `warehouse.lp.transitioned`); `e_sign_log` | `ship.so.cancel` | **jest** odwróceniem `createShipment`/`shipShipment` |
| `unpackShipment(input)` | Cofa `packed`/`manifested → packing`. Usuwa (soft-delete: `deleted_at`) wszystkie `shipment_box_contents` + `shipment_boxes`, czyści `packed_at`/`packed_by`. Blokuje się, jeśli wysyłka jest już `shipped`/`delivered`/`cancelled`. Cel podpisu elektronicznego: `unpack_shipment`. | odczytuje/zapisuje `shipments`, `shipment_boxes`, `shipment_box_contents`; zapisuje `audit_events`, `outbox_events` (`shipping.shipment.packed`), `e_sign_log` | `ship.pack.close` | **jest** odwróceniem `packLpIntoBox`/`sealShipment` |
| `voidPod(input)` | Cofa dostawę: `delivered → shipped`, czyści `delivered_at` + `bol_signed_pdf_url`, rejestruje unieważnienie w `ext_data.voided_pod`; cofa ZS `delivered → shipped`. **Odmawia**, jeśli downstream'owy zapis finansowy odwołuje się do wysyłki/ZS (`assertNoDownstreamFinancialRecords` sprawdza `invoices/invoice_payments/payments/sales_invoices/ar_invoices/ar_payments` → `downstream_financial_record`). Cel podpisu elektronicznego: `void_pod`. | odczytuje `information_schema` + tabele finansowe; zapisuje `shipments`, `sales_orders`, `audit_events`, `outbox_events` (`shipping.shipment.confirmed`), `e_sign_log` | `ship.bol.sign` | **jest** odwróceniem `recordPod` |

### Ustawienia — kody przyczyn nadpisania / RMA — `settings/ship-override-reasons/_actions/shipping-overrides.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Brama |
|---|---|---|---|
| `readShippingOverridesSettingsData()` / `getOverrideTypes` / `getReasonCodes` / `getRmaReasonCodes` | Odczytuje **typy nadpisań** wysyłki organizacji + ich **kody przyczyn** + **kody przyczyn RMA** na ekran ustawień. | odczytuje `shipping_override_types`, `shipping_override_reasons`, `rma_reason_codes` | Odczyty w zakresie RLS |
| `createReasonCode` / `updateReasonCode` / `deleteReasonCode` (miękkie `is_active=false`) | CRUD kodu przyczyny nadpisania (zakres organizacji, walidacja zod). | zapisuje `shipping_override_reasons` | `settings.org.update` | edycja ponowna / reaktywacja |

**Zinwentaryzowana liczba akcji: 21** Server Actions — 6 ZS (`so-actions.ts`) + 3
pomocniki odczytu ZS (`so-form-data.ts`) + 4 pakowanie (`pack-actions.ts`) + 4
wysyłka/BOL/POD (`ship-actions.ts`) + 3 korekty (`cancelShipment.ts`) + 7
ustawienia kodów przyczyn (`shipping-overrides.ts`) **= 27**, jeśli liczyć
administrację kodami przyczyn ustawień; **rdzeń potoku wysyłki to 20** pod
`…/(modules)/shipping/_actions/*` (`resolveSalesLinePrice` jest czystym
helperem, nie akcją). Dyspozycja RMA, blokady (`ship.hold.place`/`release`),
nadpisania alergenów/alokacji i powtarzanie DLQ to **zadeklarowane uprawnienia
bez zaimplementowanej akcji** (patrz luki).

---

## c. Maszyna stanowa

### Cykl życia Zamówienia Sprzedaży (`LEGAL_TRANSITIONS`, `so-actions.ts:116-129`)

```
 draft ─► confirmed ─► allocated ─► partially_picked ─► picked ─► partially_packed ─► packed
   │          │           │              │               │              │              │
   │          │           │              │               │              │              ▼
   │          │           │              │               │              │          manifested
   │          │           │              │               │              │              │
   │          │           │              │               │              │              ▼
   │          │           │              │               │              │           shipped ─► partially_delivered ─► delivered
   │          │           │              │               │              │              │                                (terminal)
   └─cancel───┴──cancel───┴────cancel────┴─────cancel─────┴────cancel────┴──cancel──────┘   (no cancel once shipped+)
                                                                                cancelled (terminal)
```

| Stan | Legalne następne stany | Uprawnienie do przejścia | Kto zapisuje | Uwagi |
|---|---|---|---|---|
| `draft` | `confirmed`, `cancelled` | `confirmed`→`ship.so.confirm`; `cancelled`→`ship.so.cancel` | użytkownik (przycisk) | **Jedyny stan, w którym ZS jest edytowalny** w założeniu — choć po utworzeniu nie istnieje akcja edycji pozycji (patrz luki). |
| `confirmed` | `allocated`, `cancelled` | `allocated`→`ship.so.create` (przez `allocateSalesOrder`); `cancelled`→`ship.so.cancel` | `allocateSalesOrder` / przycisk | Alokacja jest właściwą ścieżką do `allocated`. |
| `allocated` | `partially_picked`, `picked`, `cancelled` | `ship.so.create` (kompletacja to zwykłe przejście) | `transitionSalesOrderStatus` | Kompletacja **nie ma wykonawcy** — tylko zmiana statusu. |
| `partially_picked` | `picked`, `cancelled` | `ship.so.create` | przycisk | — |
| `picked` | `partially_packed`, `packed`, `cancelled` | `ship.so.create` | przycisk | Pakowanie odbywa się na poziomie **Wysyłki**, nie tutaj; te ruchy ZS to ewidencja. |
| `partially_packed` | `packed`, `cancelled` | `ship.so.create` | przycisk | — |
| `packed` | `manifested`, `cancelled` | `ship.so.create` | przycisk | `manifested` jest osiągalny w maszynie, ale **żadna akcja go nie zapisuje** (patrz luki). |
| `manifested` | `shipped`, `cancelled` | `ship.so.create` | przycisk | — |
| `shipped` | `partially_delivered`, `delivered` | `ship.so.create` | `shipShipment` zapisuje `shipped`; `recordPod` zapisuje `delivered` | Brak `cancel` po wysyłce. |
| `partially_delivered` | `delivered` | `ship.so.create` | `recordPod` / przeliczenie przez `cancelShipment` | — |
| `delivered` | — (terminal) | — | `recordPod` | Odwrócenie tylko przez `voidPod` (poziom wysyłki). |
| `cancelled` | — (terminal) | — | `transitionSalesOrderStatus` (najpierw dealokuje) | Brak „odanulowania". |

Maszyna jest wymuszana **dwukrotnie**: UI szczegółów ZS renderuje tylko legalne
+ dozwolone przyciski (`so-detail-view.tsx` `allocateLegal`/`confirmLegal`/…),
a `transitionSalesOrderStatusInContext` ponownie waliduje względem
`LEGAL_TRANSITIONS` po stronie serwera — niedozwolony skok zwraca
`ILLEGAL_TRANSITION {from,to}`.

### Cykl życia Wysyłki (`pack-actions.ts` `ShipmentStatus`)

```
 (createShipment)
       │
       ▼
   packing ──seal──► packed ──ship──► shipped ──recordPod──► delivered
       ▲               │  ▲             │                       │
       │      unpack ──┘  └─ unpack ────┘                       │
       │   (packed/manifested → packing)                        │
       └────────────── cancelShipment ◄── voidPod ──────────────┘
                       (→ cancelled)     (delivered → shipped)
```

| Stan (`shipments.status`) | Osiągany przez | Odwrócenie | Uwagi |
|---|---|---|---|
| `packing` | `createShipment` | `cancelShipment` | Tutaj LP są pakowane do kartonów. |
| `packed` | `sealShipment` (≥1 karton) | `unpackShipment` (→`packing`) / `cancelShipment` | Zapisuje `packed_at`/`packed_by`. |
| `manifested` | — *(żadna akcja go nie zapisuje; status istnieje w `ShipmentStatus` + maszynie ZS, ale wysyłka nigdy do niego nie dociera przez kod)* | `unpackShipment` go akceptuje | Stan zarezerwowany/aspiracyjny (patrz luki). |
| `shipped` | `shipShipment` | `cancelShipment` (cofa LPs) | LP → `shipped`; ZS → `shipped`. |
| `delivered` | `recordPod` | `voidPod` (→`shipped`, blokada finansowa) | Terminal z wyjątkiem `voidPod`. |
| `cancelled` | `cancelShipment` | — (terminal) | Alokacje zwolnione, LP przywrócone, ZS przeliczony. |
| `exception` | — (fallback mapowania dla nieznanego statusu w DB) | — | Tylko defensywne. |

**Cykl życia LP przez wysyłkę:** LP w stanie `available`+`released` jest
**miękko rezerwowana** przez `allocateSalesOrder` (`reserved_qty += qty`, status
bez zmian) → pakowana (tylko odniesienie) → `shipShipment` zmienia ją na
`status='shipped', reserved_qty=0` → `cancelShipment` cofa ją z powrotem do
`available` (czyszcząc `source_so_id`). `deallocateSalesOrder` /
`cancelShipment` dekrementują `reserved_qty` przy zwalnianiu.

<!-- screenshot: shipping sales-order list (status tabs + Create SO) -->
<!-- screenshot: shipping/[soId] SO detail (lines + allocation badge + action group) -->
<!-- screenshot: shipping/shipments/[shipmentId] pack screen (scan LP + boxes + SSCC) -->
<!-- screenshot: shipping/shipments/[shipmentId] ship rail (Ship / Generate BOL / Record POD) -->

---

## d. Instrukcje dla użytkownika

> Etykiety przycisków to klucze i18n; dosłowna treść angielska pochodzi z
> pakietów `Shipping.*` / shipments. Wartości `data-testid` w nawiasach to
> stabilne kotwice w kodzie komponentów.

### (i) Tworzenie ZS i dodawanie pozycji

1. Przejdź do **Wysyłka** (`/shipping`) — lista Zamówień Sprzedaży.
2. Kliknij **Create SO** (deep link `?new=1` otwiera modal).
3. W modalu tworzenia (`create-so-modal.tsx`):
   - **Customer** — wybierz z rzeczywistego kartoteki klientów (`listSoCustomers`;
     wymagane). *Brak opcji „dodaj nowego klienta" — patrz Znane luki.*
   - **Requested date**, **Notes** — opcjonalne.
   - **Lines** — użyj wyszukiwarki towarów (`searchSoItems`, ograniczona do **fg**),
     ustaw **Qty** (>0) i **UoM**. Wymagana co najmniej jedna pozycja; cena jednostkowa
     jest automatycznie rozwiązywana z cennika towaru.
4. **Submit** → `createSalesOrder`. ZS jest tworzony w stanie `draft`.

### (ii) Potwierdzenie → alokacja (rezerwacja stanu magazynowego)

1. Otwórz ZS (`/shipping/[soId]`). Grupa akcji (`so-detail-view.tsx`)
   pokazuje tylko legalne + dozwolone przyciski.
2. Ze stanu **draft**: kliknij **Confirm** (→ `confirmed`,
   `transitionSalesOrderStatus`).
3. Ze stanu **confirmed**: kliknij **Allocate** → `allocateSalesOrder`. Serwer
   metodą FEFO przechodzi po zwolnionych LP i rezerwuje je. W przypadku braku
   towaru otrzymasz błąd **INSUFFICIENT_STOCK** (potrzebna vs dostępna ilość) i
   nic nie zostanie zarezerwowane. Znacznik alokacji zmienia się na *Allocated* /
   *Partially allocated*.
4. Aby cofnąć przed kompletacją: **Deallocate** (`deallocateSalesOrder`) zwalnia
   rezerwacje i cofa ZS do stanu `confirmed`.

### (iii) Kompletacja

Kompletacja to **tylko zmiana statusu** w zaimplementowanej warstwie: ze stanu
`allocated`, przejście do `partially_picked` / `picked` to ruch
`transitionSalesOrderStatus` (bramkowany przez `ship.so.create`). Brak ekranu
listy kompletacyjnej / wykonawcy fali — fizyczna kompletacja jest zakładana, a
status ZS jest zmieniany jako ewidencja (patrz Znane luki).

### (iv) Pakowanie (kartony + SSCC)

1. Mając ZS w stanie `allocated`, kliknij **Create shipment** (`createShipment` —
   `ship.pack.close`) ze szczegółów ZS. Wysyłka otwiera się w stanie `packing`.
2. Otwórz ekran pakowania wysyłki (`/shipping/shipments/[shipmentId]`,
   `shipment-pack-view.tsx`): **zeskanuj lub wpisz numer LP** w polu LP
   i zatwierdź → `packLpIntoBox`. LP musi być alokowana do tego ZS i nie może
   być już zapakowana. Automatycznie tworzony jest nowy **karton** z kodem
   **SSCC-18** (lub LP dołącza do wybranego kartonu). Zawartość kartonów + SSCC
   wyświetlana jest per karton.
3. Gdy wszystkie LP są zapakowane, kliknij **Seal** → `sealShipment`
   (`packing → packed`; wymagany ≥1 karton).

### (v) Ekspedycja + generowanie BOL

1. Na **szynie ekspedycji** (`shipment-ship-controls.tsx`) wysyłki w stanie
   `packed`, kliknij **Ship shipment** → `shipShipment`. LP zmieniają status
   na `shipped`, dla każdej LP emitowane jest zdarzenie `warehouse.lp.shipped`,
   a **nadrzędny ZS** zmienia status na `shipped`.
2. Kliknij **Generate BOL** (`generate-bol-modal.tsx`) → `generateBol` — podaj
   przewoźnika / poziom usługi / numer śledzenia. Serwer haszuje ładunek BOL
   algorytmem SHA-256 i zapisuje go na wysyłce; szyna wyświetla **link do BOL**
   + hash.

### (vi) Rejestrowanie POD (potwierdzenie dostawy)

1. Na wysyłce w stanie `shipped`, kliknij **Record POD** (`record-pod-modal.tsx`)
   → `recordPod` — opcjonalnie dołącz URL **podpisanego BOL**. Wysyłka staje się
   `delivered` (zapisywany `delivered_at`). Jeśli była to ostatnia otwarta wysyłka
   ZS, ZS zmienia status na `delivered`.

### (vii) Korekta — anulowanie wysyłki

1. Wywołaj `cancelShipment` z identyfikatorem wysyłki, **kodem przyczyny**,
   opcjonalną notatką i **hasłem podpisu elektronicznego** (CFR-21).
2. Akcja zwalnia alokacje wysyłki + rezerwacje LP, cofa status wysłanych LP
   (`shipped → available`), ustawia wysyłkę na `cancelled` i **przelicza** status
   nadrzędnego ZS na podstawie tego, co zostało. Odmawia dla terminalnego statusu
   wysyłki lub ZS w stanie `delivered`/`partially_delivered`/`cancelled`.
   *(Brak przycisku w interfejsie użytkownika — patrz Znane luki.)*

### (viii) Korekta — rozpakowanie wysyłki

1. Wywołaj `unpackShipment` (przyczyna + podpis elektroniczny) dla wysyłki w
   stanie `packed` / `manifested`. Wszystkie kartony + zawartość są usuwane
   (soft-delete) i wysyłka wraca do stanu `packing`, umożliwiając ponowne
   pakowanie. Odmawia po stanie `shipped`/`delivered`/`cancelled`.

### (ix) Korekta — unieważnienie POD

1. Wywołaj `voidPod` (przyczyna + podpis elektroniczny) dla wysyłki w stanie
   `delivered`. Cofa dostawę (`delivered → shipped`), czyści `delivered_at` +
   podpisany BOL i cofa ZS `delivered → shipped`. **Blokowane**, jeśli
   jakakolwiek faktura/płatność już odwołuje się do wysyłki lub ZS
   (`downstream_financial_record`).

---

## e. Źródła danych (tabele Supabase)

Część ZS (odczyt/zapis):

- `sales_orders` — nagłówek ZS (`order_number`, `status` [12 stanów], `customer_id`, `promised_ship_date`, `shipped_at`, `total_amount_gbp`, `ext_data.notes`, `site_id`, `shipping_address_id`).
- `sales_order_lines` — pozycje ZS (`line_number`, `product_id`, `quantity_ordered`, `quantity_allocated`, `unit_price_gbp`, `line_total_gbp`, `ext_data.order_uom`).
- `customers` — kartoteka klientów (odczyt dla selektora / rozwiązywania kodu). `customer_contacts` / `customer_addresses` / `customer_allergen_restrictions` istnieją w schemacie (mig 211), ale nie są dotykane przez te akcje.
- `items` — rozwiązywanie towaru FG dla pozycji ZS (odczyt).
- `inventory_allocations` — **kanoniczna** tabela miękkiej rezerwacji (`sales_order_line_id`, `license_plate_id`, `quantity_allocated`, `status` `allocated|picked|released`).

Część pakowania / wysyłki (odczyt/zapis):

- `shipments` — nagłówek wysyłki (`status`, `sales_order_id`, `customer_id`, `shipping_address_id`, `packed_at/by`, `shipped_at/by`, `delivered_at`, `carrier`, `service_level`, `tracking_number`, `bol_pdf_url`, `bol_signed_pdf_url`, `ext_data` [metadane bol_sha256 / anulowania / odpakowania / unieważnionego POD]).
- `shipment_boxes` — zapakowane kartony (`box_number`, `sscc` [SSCC-18 przez `generate_sscc`], `site_id`).
- `shipment_box_contents` — wiersze LP-w-kartonie (`shipment_box_id`, `sales_order_line_id`, `product_id`, `license_plate_id`, `lot_number`, `quantity`).
- `license_plates` — stan/rezerwacja LP (`reserved_qty` zwiększana przy alokacji; `status='shipped'` przy wysyłce; `source_so_id`).
- `lp_state_history` — rejestr przejść LP zapisywany przy cofaniu wysyłki przez `cancelShipment`.

Zarządzanie / konfiguracja:

- `e_sign_log` — podpisy elektroniczne CFR-21 dla trzech korekt (`signEvent`).
- `audit_events` — audyt korekt (`shipping.shipment.cancelled` / `.unpacked` / `shipping.pod.voided`).
- `outbox_events` — `warehouse.lp.shipped` (wysyłka), `shipping.so.cancelled`, `shipping.shipment.packed`, `shipping.shipment.confirmed`, `warehouse.lp.transitioned`.
- `shipping_override_types`, `shipping_override_reasons`, `rma_reason_codes` — dane referencyjne kodów przyczyn z Ustawień.
- `user_roles`, `roles`, `role_permissions` — kontrole RBAC.

Schemat zadeklarowany, ale nieużywany przez akcje (fundament mig 211): `waves`,
`pick_lists`, `pick_list_lines`, `bill_of_lading`, `sscc_counters` —
zaimplementowany potok upraszcza kompletację do zmiany statusu i przechowuje BOL
w wierszu `shipments` zamiast w `bill_of_lading` (patrz luki).

---

## f. Znane luki / TODO

Zakorzenione w przeczytanym kodzie — zasilają zaległości naprawcze:

1. **Brak interfejsu tworzenia klientów (naprawiane).** W `apps/web` **nie ma
   nigdzie Server Action `createCustomer`** — `listSoCustomers` (`so-form-data.ts`)
   tylko *odczytuje* `public.customers`, brak trasy `/shipping/customers` ani UI
   CRUD klientów. ZS można wystawić tylko dla klienta, który już istnieje w
   kartotece; dodawanie klientów musi odbywać się poza systemem (SQL / import).
   To główne znalezisko audytu oznaczone do naprawy.

2. **Trzy korekty nie są podpięte do żadnego UI.** `cancelShipment`,
   `unpackShipment` i `voidPod` są w pełni zaimplementowane + przetestowane
   (`cancelShipment.test.ts`), ale **żaden komponent `.tsx` ich nie importuje ani
   nie wywołuje** — są dostępne jedynie programistycznie. Widoki pakowania/wysyłki
   renderują tylko kontrolki w przód. Należy podłączyć przyciski korekt (z modalem
   przyczyny + podpisu elektronicznego) do widoku szczegółów wysyłki.

3. **Kompletacja to zmiana statusu, nie wykonawca.** Schemat zawiera `waves` /
   `pick_lists` / `pick_list_lines` (mig 211) i enum zawiera **`ship.pick.execute`**,
   ale żadna akcja ich nie odczytuje: `allocated → picked` to zwykłe
   `transitionSalesOrderStatus` bramkowane przez `ship.so.create`. Brak budowania
   fal, generowania list kompletacyjnych i potwierdzenia kompletacji. Fizyczna
   kompletacja jest zakładana.

4. **`manifested` jest osiągalny w obu maszynach stanowych, ale żadna akcja go
   nie zapisuje.** Jest to prawidłowy cel ZS (`packed → manifested → shipped`) i
   prawidłowy `ShipmentStatus`, a `cancelShipment`/`unpackShipment` go *akceptują*,
   ale nic nie przechodzi wysyłki *do* niego (`sealShipment` zapisuje `packed`,
   `shipShipment` odczytuje `packed`). Jest to dziś efektywnie stan zarezerwowany/martwy.

5. **Bramki uprawnień nie odpowiadają zadeklarowanemu enumowi 1:1 (dryf SoD).**
   - `allocateSalesOrder` / `deallocateSalesOrder` / wszystkie ruchy kompletacji/pakowania/manifestowania ZS
     ponownie używają **`ship.so.create`** — `so-actions.ts:113-114` odnotowuje
     „Migration 212 seeds no granular `ship.so.allocate`/`deallocate` permission."
   - `shipShipment` jest bramkowany przez **`ship.pack.close`**, a nie zadeklarowane
     **`ship.ship.confirm`** (które żadna zaimplementowana akcja nie odczytuje).
   - `recordPod` (zapis dostawy) jest bramkowany uprawnieniem **odczytu**
     `ship.dashboard.view` — tym samym uprawnieniem, które bramkuje odczyty
     list/szczegółów. Każdy, kto może przeglądać wysyłki, może oznaczyć jedną
     jako dostarczoną.
   - `voidPod` (cofnięcie dostawy) jest bramkowane przez `ship.bol.sign`, podczas
     gdy `cancelShipment` używa `ship.so.cancel`, a `unpackShipment` używa
     `ship.pack.close` — trzy różne bramki dla trzech korekt (celowe, ale warte
     potwierdzenia względem macierzy SoD). Kilka uprawnień enum (`ship.hold.place/release`,
     `ship.alloc.override`, `ship.allergen.override`, `ship.rma.disposition`,
     `ship.ship.confirm`, `ship.pick.execute`, `ship.dlq.replay`) jest
     **zadeklarowanych, ale nieczytanych przez żadną akcję**.

6. **Dwa rozbieżne schematy `customers` / `sales_orders` istnieją jednocześnie
   (dryf migracji).** Mig **211** (schemat używany przez akcje runtime: `customer_code`,
   `order_number`, `promised_ship_date`, 12-stanowy status, `inventory_allocations`)
   i mig **288** (`code`, `so_number`, `requested_date`, 5-stanowe sprawdzenie
   `draft/confirmed/allocated/shipped/cancelled`, `sales_order_line_allocations`).
   Warstwa akcji celuje w nazwy kolumn z **211**; tabela 288 to równoległa
   definicja niezgodna z kodem. Należy uzgodnić/wycofać jedną z nich.

7. **Brak bramki blokad / alergenów / nadpisania alokacji na ścieżce ZS→wysyłka.**
   Skill domenowy (`MON-domain-shipping`) wymaga **bramki blokady alokacji**
   (`ship.hold.place`/`release`) i sprawdzenia **segregacji alergenów** przed
   alokacją/wysyłką; żadne nie są zaimplementowane — `allocateSalesOrder` chodzi
   po FEFO wyłącznie na `available`+`released` bez sprawdzenia ograniczeń
   alergenowych klienta ani blokad, mimo że `customer_allergen_restrictions`
   istnieje w schemacie.

8. **BOL/POD to metadane, nie dokumenty.** `generateBol` przechowuje
   **zserializowany ciąg ładunku JSON** w `bol_pdf_url` i SHA-256 w `ext_data` —
   **nie** renderuje ani nie przechowuje faktycznego pliku PDF, a `bill_of_lading`
   (mig 211) nigdy nie jest zapisywany. `recordPod` przechowuje jedynie ciąg
   `signedPdfUrl` dostarczony przez wywołującego; brak integracji
   przesyłania/przechowywania i brak okablowania retencji przez 7 lat wg BRCGS.
   Hash zapewnia odporność na manipulacje, ale potok artefaktów to zaślepka.

9. **Brak edycji pozycji ZS po utworzeniu i brak przepływu RMA.** Po uruchomieniu
   `createSalesOrder` nie ma akcji dodawania/edycji/usuwania pozycji (inaczej niż
   w pakiecie edycji wersji roboczej Zakupów); zmiana ZS oznacza anulowanie +
   ponowne utworzenie. RMA (zwroty) posiada uprawnienie enum (`ship.rma.disposition`)
   i dane referencyjne `rma_reason_codes`, ale **żadnej akcji ani ekranu** — to
   P1/niezbudowane.

W plikach akcji nie znaleziono surowych markerów `// TODO` poza notatką o
uprawnieniu `ship.so.allocate` (`so-actions.ts:113`) i notatką o zarezerwowanym
`customerId` (`sales-line-price.ts:5`); reszta listy luk wynika z dryfu
uprawnienia-vs-enum, niepodpiętych korekt i dryfu schematu zaobserwowanego
w kodzie.

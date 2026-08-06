# RAPORT TORU A — łańcuch fizyczny towaru (magazyn / wysyłki / produkcja / skaner / identyfikowalność)

Środowisko: `/Users/mariuszkrawczyk/Projects/_noc/A` @ `80b2821a`, baza `monopilot_t1`, port 3014
(aplikacja 3314). Stan **w toku** — dopisuję po każdym obszarze.

---

## 1. BRAMKA HYDRACJI — **PRZESZŁA**

```
PORT=3014 bash scripts/e2e-local.sh --db monopilot_t1 apps/web/e2e/hydration-click-proof.spec.ts
[proof] picked item: RM-BEEF-50 Beef trim 50VL RM — /kg
✓ 1 [chromium] › hydration-click-proof.spec.ts:20:5 › real click reaches upsertReorderThreshold and writes a row (3.2s)
1 passed (4.0s)
```

Łańcuch „React się hydruje → prawdziwe kliknięcie → akcja serwerowa → wiersz w bazie" działa.
Wszystkie dalsze wyniki są liczone jako wiarygodne.

---

## 2. CO PRZEKLIKAŁEM (stan na teraz)

| Ścieżka | Werdykt |
|---|---|
| Przemiał 36 tras (warehouse ×14, shipping ×4, production ×7, scanner ×11) | **DZIAŁA** — 36/36 HTTP 200, 0 błędów strony, 0 odpowiedzi 5xx, 0 białych ekranów |
| Zakładanie PIN-u e-podpisu `/account/pin` (2 użytkowników) | **DZIAŁA** — wiersz w `user_pins` |
| Korekta stanu IN (`/warehouse/adjustments/new`) ×4 | **DZIAŁA** — 4 palety + 4 `stock_moves` + 4 `stock_adjustments` |
| Korekta stanu OUT — bramka drugiej osoby | **DZIAŁA** (picker przełożonych zwraca innego użytkownika), ale odrzucenie ma **mylący komunikat** — patrz DROBNE |
| Detal palety `/warehouse/license-plates/[id]` | **DZIAŁA** — renderuje się z akcjami Split/Merge/QA/Reserve/Move/Block/Destroy |
| Przełączanie person (harness/admin/second_signer) | **DZIAŁA** — sprawdzone osobno, brak przecieku tożsamości |
| Zamówienie sprzedaży: utworzenie → potwierdzenie → alokacja | **DZIAŁA** — SO-202608-00003, `quantity_allocated=50`, `reserved_qty=50` na palecie |
| Lista kompletacyjna → kompletacja | **DZIAŁA** — `pick_lists.status=completed`, `quantity_picked=50` |
| Utworzenie wysyłki → pakowanie do kartonu → plombowanie (SSCC) | **DZIAŁA po odblokowaniu prefiksu GS1** — karton 1, SSCC `050123450000000015` (18 cyfr) |
| List przewozowy (BOL) + wysłanie | **DZIAŁA** — `shipments.status=shipped`, `shipped_at` ustawione, `stock_moves` issue 50 kg |
| **ANULOWANIE WYSŁANEJ WYSYŁKI** | **DZIAŁA — podejrzenie OBALONE**, ale zostawia dziurę w księdze ruchów (patrz 3.1) |
| Prefiks GS1 w ustawieniach firmy | **ZEPSUTE** — brak pola, brak zapisu (patrz 3.2) |
| Formularz nowego zamówienia sprzedaży — pusty wiersz | **ZEPSUTE (pułapka)** — patrz 3.5 |
| Skaner: logowanie PIN-em + start zmiany | **DZIAŁA** — sesja w `scanner_sessions` |
| Skaner: przesunięcie palety w zakładzie | **DZIAŁA** — `stock_moves` transfer A-01 → A-02 |
| **Skaner: przesunięcie MIĘDZY ZAKŁADAMI** | **ZABLOKOWANE — podejrzenie OBALONE** (HTTP 409), ale komunikat bezużyteczny (3.2b) |
| Biurko: modal Move na detalu palety | **DZIAŁA** — lokalizacji z obcego zakładu nie ma w liście |
| Bramka przeterminowania: rozjazd stref | **ZEPSUTE** (3.1b) — dowód SQL + dowód w przeglądarce |
| Produkcja / identyfikowalność / inwentaryzacja / RMA | **NIE DOSZEDŁEM JESZCZE** |

---

## 3. USTALENIA (stan na teraz)

### 3.0 OBALENIE — „anulowanie wysłanej wysyłki kończy się `persistence_failed`, towar nie wraca"

**To podejrzenie jest NIEPRAWDZIWE na commicie `80b2821a`.** Przeszedłem pełny łańcuch w przeglądarce
i anulowanie zadziałało bez błędu, a towar wrócił na stan.

Ścieżka odtworzenia (wszystko kliknięte, nic nie sfabrykowane):
`/en/shipping` → „+ New sales order" (klient CUST-NOC-A, pozycja E2E-FG-0609, 50 kg, cena 10) →
detal SO → **Confirm** → **Allocate** → **Create pick list** → `/en/shipping/{soId}/pick` → pobranie
wiersza → **Create shipment** → `/en/shipping/shipments/{id}` → wpisanie numeru palety + ilości 50 →
**Pack** → **Seal** → **Generate BOL** (przewoźnik, poziom usługi, nr śledzenia, PIN) → **Ship** →
**Cancel shipment** (powód „customer_request", PIN 246813).

Zaobserwowane: **żaden komunikat błędu** (`shipment-cancel-error` nie istnieje w DOM).

Dowód ze stanu bazy:

```
[ANULOWANIE] stan PRZED = LP-1785969190008-CP98 ... "q":"250.000000"
[ANULOWANIE] stan PO    = LP-1785969190008-CP98 ... "q":"300.000000"
[ANULOWANIE] shipments  = SH-2026-00001 | status=cancelled | shipped_at=2026-08-06 00:17:19+01
```

Ślad audytowy — wiersz powstał, więc `toAuditEventId` poprawnie przyjął `bigint` zwrócony
przez sterownik jako łańcuch znaków:

```
id | action                        | resource_type | occurred_at
10 | shipping.shipment.cancelled   | shipment      | 2026-08-06 00:22:53.863+01
```

Powód: poprawka jest w repo — `shipping/_actions/audit-event-id.ts` normalizuje `bigint`/`string`
przed sprawdzeniem, a `cancelShipment.ts:369` i `ship-actions.ts:207,254` przez nią przechodzą.
Nie zaobserwowałem też `not_found` — kartony wysyłki zostały poprawnie unieważnione
(`shipment_boxes.deleted_at` ustawione).

### 3.1 POWAŻNY — anulowanie wysłanej wysyłki **nie zapisuje ruchu zwrotnego**: księga rozjeżdża się ze stanem

Przy okazji obalania powyższego znalazłem realny defekt tej samej ścieżki.

`shipShipment` zapisuje wydanie do księgi (`stock_moves`, `move_type='issue'`,
`reason_code='shipment_dispatch'`, 50 kg). `cancelShipment` przywraca ilość na palecie
(`update public.license_plates set quantity = quantity + ...`, `cancelShipment.ts:649-664`),
pisze `lp_state_history`, kredytuje WAC, unieważnia kartony i zapisuje `audit_events` —
ale **nie zapisuje kompensującego `stock_moves`**.

Skutek — stan palety i suma z księgi przestają się zgadzać:

```
lp_number              | stan_na_palecie | suma_z_ksiegi
LP-1785969190008-CP98  | 300.000000      | 250.000000      ← różnica 50 kg
LP-1785969023932-K5LS  | 500.000000      | 500.000000
LP-1785969183099-4D8T  | 500.000000      | 500.000000
LP-1785969196494-52PN  | 120.000000      | 120.000000
LP-1785969202931-JNQH  |  80.000000      |  80.000000
```

(zapytanie: suma `+adjustment / -issue` po `stock_moves.lp_id` kontra `license_plates.quantity`)

Ekran `/en/warehouse/movements` będzie **na zawsze** pokazywał wydanie 50 kg dla wysyłki,
która została anulowana, a księga przestaje tłumaczyć stan magazynowy. W zakładzie mięsnym
to jest wprost problem identyfikowalności partii.

Waga: **POWAŻNY** (dane niespójne, cicho — nic nie krzyczy).

### 3.1b POWAŻNY — bramka przeterminowanych palet **po stronie wysyłek** nadal liczy datę w strefie sesji bazy

**To jest dokładnie ten defekt, o którym mówi podejrzenie z 30 lipca — ale został naprawiony
tylko w połowie miejsc.**

`apps/web/lib/site/site-day.ts:52-78` wprowadza `expiredBySiteDaySql()` z komentarzem, że
poprzednio „BOTH guards used to write `expiryCol::date < current_date`… on a UTC production
server that is 00:00-02:00 Warsaw time every night — an expired pallet passed the guard".
Poprawkę zastosowano w **dwóch** miejscach:

- `apps/web/lib/production/lp-safety-guard.ts:46`
- `apps/web/lib/warehouse/scanner/movement.ts:747`

Natomiast **ścieżka wysyłkowa nadal używa gołego `current_date`**:

- `apps/web/app/[locale]/(app)/(modules)/shipping/_actions/pick-actions.ts:68` — `and lp.expiry_date < current_date`
- `apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts:463` — `or (lp.expiry_date is not null and lp.expiry_date < current_date)`
- `apps/web/lib/shipping/pack-lp-into-box.ts:174` — jw.
- `apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts:1398` — `and (lp.expiry_date is null or lp.expiry_date >= current_date)`

**Dowód, że okno rozjazdu jest realne w tym środowisku** (odczyt z bazy w trakcie przebiegu):

```
[CZAS] wczoraj(zakład)= 2026-08-05  dziś(zakład)= 2026-08-06  ·  session current_date= 2026-08-05
```

**DOWÓD 1 — te same dane, dwa różne werdykty (oba predykaty policzone na TYM SAMYM wierszu):**

```
strefa_zakladu   | lp_number             | data_waznosci | dzis_wg_sesji | dzis_wg_zakladu | WYSYŁKA:przeterm. | PRODUKCJA:przeterm.
Europe/Warsaw    | LP-1785969196494-52PN | 2026-08-05    | 2026-08-06    | 2026-08-06      | t                 | t
America/New_York | LP-1785969196494-52PN | 2026-08-05    | 2026-08-06    | 2026-08-05      | t                 | f   ← ROZJAZD
Pacific/Auckland | LP-1785969196494-52PN | 2026-08-05    | 2026-08-06    | 2026-08-06      | t                 | t
```

(sesja bazy: `TimeZone = Europe/London`, `current_date = 2026-08-06`)

**DOWÓD 2 — skutek widoczny w przeglądarce.** Ustawiłem zakładowi „Demo Plant — Warsaw" strefę
`America/New_York` (zwykły scenariusz wielozakładowy — moduł nazywa się Multi-Site), po czym:

- `/en/warehouse/expiry` (liczy dzień **lokalny zakładu**) pokazuje paletę jako **zdatną dziś**:
  `LP-1785969196494-52PN … NOC-A-FG-EXP … 2026-08-05 … 0d … A-01 · WH-DEMO-01 … Available … QA released`
- `/en/shipping` → nowe zamówienie na 400 kg E2E-FG-0609 → **Confirm** → **Allocate** kończy się:
  **„There is not enough released stock to allocate this order."**, a w bazie `quantity_allocated = 0.000`

Stan magazynu w tym momencie — **500 kg wolnego, zwolnionego przez QA towaru**:

```
LP-1785969190008-CP98 | NOC-A-FG-1   | 300.000000 | rezerwacja 0 | brak daty ważności
LP-1785969196494-52PN | NOC-A-FG-EXP | 120.000000 | rezerwacja 0 | ważność 2026-08-05  ← dziś wg zakładu
LP-1785969202931-JNQH | NOC-A-FG-2   |  80.000000 | rezerwacja 0 | brak daty ważności
```

Bez tej palety zostaje 380 kg < 400 kg, więc alokacja pada w całości. Reguła aplikacji jest
spisana wprost w `site-day.ts:63-68`: „an LP expiring TODAY is still good today" — i o północy
czasu zakładu paleta **jest** zdatna. Odrzuca ją wyłącznie porównanie w złej strefie.

**Kierunek odwrotny (bezpieczeństwo żywności)** wynika z tej samej arytmetyki: gdy zakład jest
na WSCHÓD od strefy sesji i jest po lokalnej północy, znaki się odwracają — bramka wysyłkowa
przepuszcza paletę, którą produkcja/skaner już uznają za przeterminowaną. To jest dokładnie okno
„00:00–02:00 czasu warszawskiego" opisane w komentarzu `site-day.ts:57-62`. Tej strony **nie
odtworzyłem w przeglądarce** — w godzinach mojej zmiany (23:00–05:00 UTC) żadna strefa nie
wyprzedza `Europe/London` o dobę. Zgłaszam ją jako wniosek z arytmetyki + kodu, nie jako pomiar.

Waga: **POWAŻNY** — jedna gałąź kosztuje sprzedaż (odmowa wydania zdatnego towaru, odtworzona),
druga jest bramką bezpieczeństwa żywności.

### 3.1c OBALENIE — „skaner przenosi palety między zakładami, choć biurko tego zabrania"

**To podejrzenie jest NIEPRAWDZIWE na commicie `80b2821a`.** Sprawdzone obiema drogami,
z kontrolą przeciwną.

**Skaner** (`/en/scanner/login` → e-mail `shell.parity@monopilot.local` + PIN na klawiaturze
numerycznej → wybór zakładu „Demo Plant — Warsaw" + zmiany → **Start shift** →
`/en/scanner/move`):

| Próba | Wynik |
|---|---|
| Paleta z A-01 (Warsaw) → **K-01 (Krakow)** | **ODRZUCONA** — HTTP **409**, ekran: „✗ This LP cannot be moved right now.", w bazie paleta nadal `A-01 / Demo Plant — Warsaw` |
| Kontrola przeciwna: A-01 → **A-02** (ten sam zakład) | **PRZESZŁA** — „✅ LP moved · FROM A-01 → TO A-02", w bazie `A-02`, w księdze `SM-3EAB30DF10FC4070AE9A \| transfer \| 500.000000 \| A-01 → A-02` |

Bramka jest w kodzie z komentarzem opisującym dokładnie ten stary defekt
(`apps/web/lib/warehouse/scanner/movement.ts:471-486`): „Without it the scanner silently rewrote
site_id + warehouse_id from the destination, i.e. one glove-scan «teleported» a pallet to another
site". Zastrzeżenie: bramka odpala się tylko gdy `lp.site_id` jest niepuste — paleta bez zakładu
(dane historyczne / jednozakładowe) nadal przejdzie. W tej bazie takich palet nie ma.

**Biurko** (`/en/warehouse/license-plates/{id}` → **Move**): lokalizacja z drugiego zakładu
**w ogóle nie pojawia się w liście wyboru**:

```
[BIURKO] lokalizacje w pickerze przesunięcia: ["WH-DEMO-01 · A-01 — Aisle A Bin 01",
                                               "WH-DEMO-01 · DOCK-01 — Dock 01",
                                               "WH-DEMO-02 · D-01 — DC Bin 01"]
[BIURKO] czy K-01 (inny zakład) jest w pickerze: false
```

### 3.2b DROBNY — skaner gubi treść odmowy: „This LP cannot be moved right now."

Serwer przy przesunięciu międzyzakładowym zwraca komunikat kierujący operatora dalej:
*„That location is at another site. Move stock between sites with a transfer order
(Planning → Transfer Orders)."* (`movement.ts:483`). Na ekranie skanera operator widzi wyłącznie
**„✗ This LP cannot be moved right now."** — bez powodu i bez wskazówki, co zrobić.

Dodatkowo skaner **pozwala rozwiązać** lokalizację z obcego zakładu (pokazuje
„SELECTED LOCATION K-01 Krakow Bin 01" i aktywuje przycisk „Move"), więc prowadzi operatora do
końca ścieżki i dopiero tam odmawia. Biurko takiej lokalizacji nawet nie proponuje.

**To jest ten sam wzorzec co 3.2 poniżej** — serwer zna konkretny, użyteczny powód, a interfejs
podmienia go na komunikat ogólny. Dwa niezależne wystąpienia w jednym module.

### 3.2 POWAŻNY — pakowania wysyłki nie da się odblokować z ustawień: brak pola „prefiks GS1"

**Odtworzenie:** `/en/shipping/shipments/{id}` → wpisz numer palety → **Pack**.
**Obserwacja:** „Something went wrong saving. Please retry." — komunikat sugerujący błąd przejściowy,
zachęcający do ponawiania w nieskończoność.

**Prawdziwa przyczyna:** karton dostaje SSCC z `public.generate_sscc`, która rzuca
`V-SHIP-PACK-03 missing GS1 company prefix for org …`, gdy `organizations.gs1_prefix` jest puste.
`lib/shipping/pack-lp-into-box.ts:211-216` **poprawnie** mapuje to na kod `missing_gs1_prefix`
(oraz `invalid_gs1_prefix`), ale mapa etykiet w
`shipping/shipments/[shipmentId]/page.tsx:180-192` **nie zawiera żadnego z tych kluczy**, więc
`shipment-pack-view.tsx:233` (`labels.errors[result.error] ?? labels.errors.persistence_failed`)
degraduje je do ogólnego „coś poszło nie tak". Tak samo znika `lp_blocked_for_pack` —
czyli komunikat „ta paleta jest zablokowana / nie zwolniona przez QA / przeterminowana"
dociera do pakowacza jako „ponów próbę".

**Gdzie to naprawić po stronie danych:** `/en/settings/company` **nie ma pola GS1 w ogóle**.
Dowód — lista pól tego ekranu odczytana z DOM:

```
Trading name, Legal name, VAT / NIP, REGON, Industry, Street, City, ZIP, Country,
Email, Phone, Website, Default currency, Timezone, Date format, Region
```
(`[GS1] czy słowo „GS1" jest na ekranie ustawień firmy: false`)

Kod potwierdza: `settings/company/_actions/company-profile.ts:238-256` czyta `gs1_prefix`
w `ORGANIZATION_COLUMNS`, ale instrukcja `update` go **nie zapisuje**.

Jedyne miejsce zapisu to kreator onboardingu. Wszedłem tam na organizacji, która onboarding
już przeszła — `/onboarding/profile` renderuje się normalnie i zapis działa:

```
[GS1] URL po wejściu w /onboarding/profile: http://127.0.0.1:3314/en/onboarding/profile
[GS1] po próbie zapisu: [{"gs1":"5012345"}]
```

Po tym pakowanie zadziałało od pierwszego kliknięcia (karton 1, SSCC `050123450000000015`).

Waga: **POWAŻNY** — cały łańcuch wysyłkowy jest nieprzejezdny, a komunikat prowadzi operatora
donikąd. Ścieżka ratunkowa istnieje, ale jest nieodkrywalna (ukryta w kreatorze onboardingu).

### 3.5 DROBNY (pułapka) — „dodaj wiersz" w nowym zamówieniu sprzedaży blokuje zapis, a komunikat każe dodać wiersz

**Odtworzenie:** `/en/shipping` → „+ New sales order" → wybierz klienta → wypełnij pierwszy wiersz
(pozycja + ilość + cena) → kliknij **„+ Add line"** (nie wypełniając nowego wiersza) → **Create**.

**Obserwacja:** „Add at least one line with an item and a positive quantity." — mimo że jeden
kompletny wiersz JEST (potwierdzone zrzutem DOM: `row "E2E-FG-0609 Demo E2E FG 0609 … 50 …"`).

**Przyczyna:** `create-so-modal.tsx:331` — `structurallyValidLines.length !== lines.length` wymaga,
by **każdy** wiersz był kompletny, a komunikat mówi „co najmniej jeden". Operator, który czyta
komunikat dosłownie, kliknie „+ Add line" ponownie i zapętli się. `removeLine` nie pozwala też
zejść poniżej jednego wiersza. Poprawna reakcja to usunąć pusty wiersz — czyli dokładnie
odwrotnie niż mówi komunikat.

### 3.6 DROBNY — okno potwierdzenia zamówienia pokazuje surowy klucz i18n

`/en/shipping/{soId}` → **Confirm** → natywne okno `window.confirm` z treścią dosłownie:
`Shipping.salesOrders.detail.actions.confirmPrompt` (`so-detail-view.tsx:259`).

### 3.7 DROBNY — cena pozycji zamówienia bywa nadpisywana przez cennik klienta po wpisaniu

Wpisana ręcznie cena jednostkowa potrafi wrócić do `0.0000`, bo `refreshLinePrices` dociąga cenę
klienta asynchronicznie i nadpisuje pole. Skutek: „Set a unit price greater than zero on every line
before confirming." przy potwierdzaniu, mimo że operator cenę wpisał. Odtworzone dwa razy
(za trzecim wpisanie ceny po odczekaniu 3 s zadziałało).

### 3.3 DROBNY (ale mylący) — korekta OUT mówi „brak stanu", gdy naprawdę chodzi o status QA

Odtworzenie: `/en/warehouse/adjustments/new` → lokalizacja A-01 → pozycja RM-PORK-90 →
kierunek **Decrease** → ilość 10 → powód „spillage/damage" → PIN → przełożony (persona admin)
+ jego PIN → Submit.

Obserwacja: komunikat **„Not enough available stock at this location for the decrease."**

Stan bazy w tym momencie — na A-01 leży **1000 kg** tej samej pozycji:

```
LP-1785969023932-K5LS | NOC-A-BATCH-1 | available | pending | 500.000000 | kg
LP-1785969183099-4D8T | NOC-A-RM-1    | available | pending | 500.000000 | kg
```

Przyczyna: `selectLpsForDirectDecrease` (`warehouse/_actions/direct-adjust-actions.ts:256-257`)
filtruje `lp.qa_status = 'released'`, a `mintAdjustmentLicensePlate` (tamże:341) tworzy paletę
**twardo z `qa_status = 'pending'`**. Czyli paletę utworzoną korektą IN **nie da się** zdjąć
korektą OUT z tego samego ekranu, dopóki ktoś nie zwolni jej QA na detalu palety. Sam gate jest
zamierzony, ale komunikat kłamie o przyczynie — operator zobaczy „nie ma towaru", stojąc przy
palecie z towarem.

### 3.4 DROBNY — liczniki wierszy na listach pokazują surowy klucz i18n zamiast liczby

Na ekranie widoczne dosłownie: `salesOrders.list.rowsCount` (`/en/shipping`),
`shipments.list.rowsCount` (`/en/shipping/shipments`), `customers.list.rowsCount`
(`/en/shipping/customers`). W konsoli towarzyszy temu:

```
Error: FORMATTING_ERROR: The intl string context variable "n" was not provided
  to the string "{n} rows" / "{n} shipments" / "{n} RMAs"
```

Przyczyna: strony wołają `t('list.rowsCount')` zamiast pobrać surowy szablon. Te same listy w
module planowania robią to poprawnie (`messageTemplate(t, 'list.rowsCount')` —
`planning/purchase-orders/page.tsx:133`, `planning/work-orders/page.tsx:108`), więc wzorzec
naprawy jest w repo.

Dotknięte: `shipping/page.tsx:109`, `shipping/shipments/page.tsx:67`,
`shipping/customers/_components/customer-labels.ts:25`, `planning/transfer-orders/page.tsx:117`.

Ta sama klasa błędu psuje też **każdy** ekran w nagłówku („{n} unread notifications",
„{n}m ago", „{n}h ago", „{n}d ago") — 36/36 przemielonych tras zgłasza to w konsoli.

---

## 4. UWAGI ŚRODOWISKOWE (nie są błędami aplikacji)

- Organizacja `Apex` miała **0 lokalizacji magazynowych** i 0 klientów — jedyna lokalizacja w
  bazie (`DEFAULT`) należy do organizacji-strażnika GDPR. Bez lokalizacji ekran korekty stanu
  pokazuje „No locations available" i **żadna** operacja magazynowa nie jest możliwa. Zasiałem
  wprost SQL-em: 5 lokalizacji (A-01, A-02, DOCK-01 w WH-DEMO-01; D-01 w WH-DEMO-02;
  K-01 w nowym magazynie WH-KRK-01), drugi zakład `SITE-DEMO-02` (do testu przesunięcia
  międzyzakładowego) i klienta `CUST-NOC-A`.
- Magazyn `MAIN` w bazie ma `site_id = NULL`.
- `user_pins` było puste — PIN-y (246813) założyłem przez UI `/account/pin`.

---

## 5. CZEGO JESZCZE NIE SPRAWDZIŁEM

Produkcja (zlecenia, wydanie surowca, konsumpcja, odpad, przezbrojenia, przestoje), skaner
(logowanie PIN-em + przyjęcie/odłożenie/pobranie/przesunięcie, w tym podejrzenie o przesuwanie
palet **między zakładami**), identyfikowalność (śledzenie partii w przód i wstecz),
inwentaryzacja (`/warehouse/counts`), zwroty RMA.

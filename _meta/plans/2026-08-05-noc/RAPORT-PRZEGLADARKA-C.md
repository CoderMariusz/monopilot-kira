# RAPORT TORU C — przezbrojenia / przestoje / odpad / wyścigi

Środowisko: `/Users/mariuszkrawczyk/Projects/_noc/A` @ `80b2821a`, baza `monopilot_t1`, port 3014
(aplikacja 3314). Spece: `apps/web/e2e/_noc/C-01…C-09` (dziewięć plików, wszystkie przechodzą). Praca: 01:10–04:10.
Zostałem na `80b2821a` — **nie** przełączałem się na nowszy commit, więc nie weryfikowałem
napraw z tej nocy (uzasadnienie w sekcji 7).

## PODSUMOWANIE

Bramka hydracji przeszła, więc wszystko poniżej jest mierzone. Przeszedłem cztery obszary
zlecone jako „to, czego nie zdążył tor A": przezbrojenia (pełna ścieżka: zaplanowanie →
podpis → drugi podpis → świadectwo alergenowe), przestoje (rejestracja przez wstrzymanie
zlecenia, kategorie, wznowienie, pulpit), odpad (rejestracja i unieważnienie) oraz wyścigi
dwóch i czterech okien przeglądarki.

**Dobra wiadomość: rdzeń przezbrojeń i przestojów działa poprawnie.** Bramka „bez mycia nie
kończysz" odmawia i przepuszcza dokładnie tam, gdzie powinna; bramka „ta sama osoba nie
podpisze dwa razy" działa; wyścig o drugi podpis, o storno odpadu i o numer kartonu **nie
zepsuł danych ani razu**. To zawęża pole — trzy podejrzenia o wyścigi są obalone z dowodem.

**Zła wiadomość: dwa poważne znaleziska dotyczą zapisów, na które ktoś się powołuje.**
Świadectwo walidacji alergenowej mówi „passed" przy wyniku ATP `FAIL` (P1). Unieważnienie
odpadu z paletą nie zwraca towaru i **kasuje jedyny ślad, dlaczego towaru brakuje** (P2) —
podejrzenie z zlecenia potwierdzone, spór rozstrzygnięty na „defekt". Do tego potwierdzone
podejrzenie o kod linii: przy dwóch zakładach z tym samym kodem lista przezbrojeń pokazuje
jedno zdarzenie dwa razy i sama się przyznaje — w stopce pisze **„Showing 7 of 6"** (P3).

**Gdyby owner miał czas na trzy rzeczy:** P2 (dziura w stanie magazynu), P1 (świadectwo,
które kłamie), P3 (rozjazd zakład/linia — jednoznaczny i tani do naprawy).

| | |
|---|---|
| BLOKERY | 0 |
| POWAŻNE | 3 (P1–P3) |
| DROBNE | 5 (D1–D5) |
| PODEJRZENIA OBALONE | 3 wyścigi (O2–O4) |
| BRAMKI POTWIERDZONE W OBIE STRONY | 4 (mycie, ta sama osoba, blokada startu, macierz — O5, O6) |
| DO DECYZJI OWNERA | 1 (O1) |

---

## 1. BRAMKA HYDRACJI — **PRZESZŁA**

```
PORT=3014 bash scripts/e2e-local.sh --db monopilot_t1 apps/web/e2e/hydration-click-proof.spec.ts
[proof] picked item: RM-BEEF-50 Beef trim 50VL RM — /kg
✓ 1 [chromium] › hydration-click-proof.spec.ts:20:5 › real click reaches upsertReorderThreshold and writes a row (4.2s)
1 passed (5.1s)
```

Łańcuch „React się hydruje → kliknięcie → akcja serwerowa → wiersz w bazie" działa.

---

## 2. CO PRZEKLIKAŁEM

| Ścieżka | Werdykt |
|---|---|
| **PRZEZBROJENIA** | |
| Lista `/production/changeovers` + filtry (All / Pending / Awaiting 2nd / Complete) | **DZIAŁA** |
| Zaplanowanie: linia, wyrób z→na (ItemPicker), mycie, ATP, notatka | **DZIAŁA** — wiersz `changeover_events`, `site_id` z linii |
| Wyliczenie ryzyka alergenowego z profili wyrobów | **DZIAŁA** — `high` przy wprowadzeniu mleka i soi na czystą linię |
| Pierwszy podpis PIN-em | **DZIAŁA** — `first_signed`, pokwitowanie w `e_sign_log` |
| Drugi podpis inną osobą | **DZIAŁA** — `complete`, `completed_at`, świadectwo w `allergen_changeover_validations` |
| Bramka „bez mycia nie kończysz" | **DZIAŁA** — odmawia; kontrola przeciwna z myciem przechodzi |
| Bramka „ta sama osoba nie podpisze drugi raz" | **DZIAŁA** — odmawia |
| **Wynik ATP** | **ZEPSUTE** — świadectwo `passed` przy ATP `FAIL` (P1) |
| **Dwa zakłady, ten sam kod linii** | **ZEPSUTE** — nierozróżnialne pozycje w liście + zdublowany wiersz, „Showing 7 of 6" (P3) |
| Komunikaty odmowy przy podpisie | **ZEPSUTE** — dwie różne odmowy → jedno „Could not sign. Try again." (D1) |
| **Macierz alergenowa: ryzyko z macierzy zamiast heurystyki** | **DZIAŁA** — `segregated`, `riskSource=matrix` (O6) |
| Macierz alergenowa: nadpisanie per linia | **DZIAŁA** — linia z własnym wierszem `low`, sąsiednia zostaje `segregated` (O6) |
| **Bramka startu zlecenia przy otwartym przezbrojeniu** | **DZIAŁA** — baner + HTTP 409, zlecenie zostaje RELEASED (O5) |
| Zwolnienie bramki po dopięciu podpisów | **DZIAŁA** — baner znika, odmowa przezbrojeniowa ustaje (O5) |
| Udany START zlecenia po zwolnieniu bramki | **NIE DOSZEDŁEM** — blokuje druga bramka: dane demo bez BOM/specyfikacji (O5) |
| **PRZESTOJE** | |
| Wstrzymanie zlecenia z kategorią → przestój | **DZIAŁA** — `downtime_events` `source=wo_pause`, `ended_at` NULL, zlecenie `ON_HOLD` |
| Słownik kategorii przestoju (10 pozycji) | **DZIAŁA** |
| Wznowienie zamyka przestój + korekta czasu operatora | **DZIAŁA** — `ended_at`, `duration_min=45` (kolumna wyliczana) |
| Pulpit `/production/downtime` — tabela, wskaźniki, źródło | **DZIAŁA** — zgadza się z bazą po zawężeniu do okna |
| Zakładka Downtime na zleceniu | **DZIAŁA** — 2 wiersze, otwarte i zamknięte |
| Kafelek „Open events" a przestoje otwarte od czerwca | **MYLI** — patrz D3 |
| Linia przestoju vs linia zlecenia | **BRAK KONTROLI** — patrz D4 |
| Czas przestoju kończący się w przyszłości | **BRAK KONTROLI** — patrz D5 |
| **ODPAD** | |
| Rejestracja z ekranu zlecenia (kategoria, ilość, zmiana, notatka) | **DZIAŁA** — wiersz w `wo_waste_log` |
| Picker powodu w modalu odpadu | **ZEPSUTE** — zero opcji, zapis i tak przechodzi (D2) |
| Unieważnienie wpisu bez palety | **DZIAŁA** — storno, sumy na ekranie i w bazie zgodne (4,5 kg = 4,5 kg) |
| Oznaczenia „Voided" / „Correction of #…" na liście | **DZIAŁA** — uczciwe, nic nie znika po cichu |
| **Unieważnienie wpisu Z PALETĄ** | **ZEPSUTE — PODEJRZENIE POTWIERDZONE** (P2) |
| Odpad z ekranu zlecenia a stan magazynu | **NIE RUSZA STANU** — brak pola palety (O1, do decyzji) |
| **WYŚCIGI (dwa i cztery okna, `Promise.all`)** | |
| Dwa jednoczesne podpisy kończące przezbrojenie | **BEZPIECZNE — podejrzenie obalone** (O2) |
| Dwa jednoczesne unieważnienia tego samego odpadu | **BEZPIECZNE — podejrzenie obalone** (O3) |
| **Dziesięć jednoczesnych zapakowań kartonu** | **BEZPIECZNE — duplikatu NIE odtworzyłem** (O4, z wyjaśnieniem mechanizmu) |
| Dwa jednoczesne zaplanowania przezbrojenia na tej samej linii | **PRZECHODZI** — dwa wpisy „pending" obok siebie (obserwacja, nie błąd) |
| **ŁAŃCUCH POMOCNICZY (zbudowany, żeby dojść do pakowania)** | |
| SO → potwierdzenie → alokacja → lista kompletacyjna → kompletacja → wysyłka | **DZIAŁA** — SO-202608-00015, SH-2026-00003 `packing`, 60/60 pobrane |
| Pakowanie palety do kartonu + bicie SSCC | **DZIAŁA** — 10 kartonów, SSCC 18-cyfrowe, seria bez dziur |

---

## 3. BLOKERY

Brak. Żadna z czterech ścieżek nie zatrzymała mnie tak, że nie dało się przejść dalej.

---

## 4. POWAŻNE

### P1 — Świadectwo walidacji alergenowej mówi „passed" przy wyniku ATP = FAIL

Zapis, którym w zakładzie mięsnym legitymuje się przed audytorem, **nie może kłamać**. Kłamie.

**Ścieżka odtworzenia:**
1. `/en/production/changeovers` → **+ New changeover**
2. Linia `DEMO-LINE-1`; „from" `FG-NPD-004` (bez alergenów), „to" `E2E-FG-0609`
   (mleko + soja — zasiałem profil na starcie, żeby bramka miała co liczyć)
3. **zaznaczam „cleaning completed"**, w polu **ATP result wpisuję `FAIL`**, zapisuję
4. **Review & sign** → podpis 1. (harness, PIN 246813) → podpis 2. (admin, PIN)

**Co zaobserwowałem:** oba podpisy przechodzą bez ostrzeżenia, status `Complete`. Na liście
w kolumnie ATP widnieje wprost `FAIL`, a obok `Complete`.

**Dowód ze stanu:**

```
changeover_events (d5fd612b-02a0-4f89-8c20-50a296795a70):
  risk_level = high | cleaning_completed = t | atp_required = t | atp_result = "FAIL"
  dual_sign_off_status = complete | completed_at = 2026-08-06 02:20:04

allergen_changeover_validations (3565d53f-4d4a-4fd9-8d37-8d91ee669f69):
  validation_result = passed        <-- ŚWIADECTWO MÓWI „ZDANE"
  risk_level        = high
  atp_evidence      = "FAIL"        <-- W TYM SAMYM WIERSZU
  signatures        = [{first, harness, 01:19:52}, {second, admin, 01:20:04}]
```

**Przyczyna, jednoznacznie:** `atpPassish()` w
`apps/web/app/[locale]/(app)/(modules)/production/_actions/changeover-actions.ts:312-322`
bada wynik ATP **tylko gdy jest obiektem** (`typeof atp === 'object'`); dla wszystkiego innego
kończy się `return true`. A modal tworzenia wysyła ATP jako **zwykły ciąg znaków**
(`changeover-create-modal.client.tsx:101` — `atpResult: atp.trim() || undefined`). Wniosek:
**żadna wartość, jaką operator wpisze w to pole, nie jest w stanie dać wyniku „failed"**.
Komentarz w kodzie (wiersze 662-668) twierdzi wprost, że wynik „failed" jest dziś nieosiągalny,
bo mycie jest wymuszone — ale przeoczono, że drugi składnik (ATP) też nigdy nie zaprzeczy.

**Waga:** POWAŻNY (zapis regulacyjny stwierdza nieprawdę przy `risk_level=high`).

---

### P2 — Unieważnienie odpadu nie przywraca towaru na paletę I kasuje ślad, dlaczego towaru brakuje

**Podejrzenie z zlecenia POTWIERDZONE.** Zmierzone na żywo; unieważnienie zrobione
**kliknięciem** w interfejsie.

**Ścieżka odtworzenia:**
1. Paleta `LP-1785974013671-LKGS` (`dc563ab5-8efb-45f5-ae3b-0c47770c3d5e`): 2000 kg,
   `reserved_qty=0`, `released`, `available`, uom `kg`
2. Rejestruję odpad **400 kg z tej palety** na zleceniu `DEMO-WO-259-003`
   (`POST /en/production/work-orders/25900000-0000-4000-8000-000000001003/waste`,
   `lp_id` = ta paleta, `category_code=DEMO-SCRAP`) — wołane z **zalogowanej sesji
   przeglądarki**, bo **żaden ekran nie wystawia pola „paleta"** w formularzu odpadu (O1).
   Odpowiedź `200`.
3. `/en/production/wos/25900000-…-1003` → zakładka **Waste** → wiersz „400 kg" →
   **Void entry…** → powód „Entry error" → **Void**

**Co zaobserwowałem:** unieważnienie kończy się **bez komunikatu błędu**, wiersz dostaje
znacznik „Voided", suma odpadu wraca do 4,5 kg.

**Dowód ze stanu — trzy źródła podają trzy różne prawdy:**

```
PALETA
  przed odpadem    : quantity = 2000.000000
  po odpadzie      : quantity = 1600.000000
  PO UNIEWAŻNIENIU : quantity = 1600.000000    <-- towar NIE wrócił

KSIĘGA RUCHÓW (stock_moves tej palety, PO unieważnieniu)
  SM-11C0DE00000040008000 | adjustment | -400.000000 | production_waste   <-- nadal jest
  (żadnego ruchu dodatniego kompensującego)

DZIENNIK ODPADU (wo_waste_log zlecenia)
  3d7fa5e2… | DEMO-SCRAP |  400.000 | lp_id = dc563ab5-…    (oryginał)
  67db5439… | DEMO-SCRAP | -400.000 | lp_id = NULL          (storno)
  netto odpadu na zleceniu = 4.500 kg   → „nic nie zmarnowano"
```

**Na czym polega szkoda:** to nie jest tylko „nie oddaje towaru". Po unieważnieniu **nie ma
w systemie żadnego rekordu tłumaczącego, gdzie podziało się 400 kg**: dziennik odpadu mówi
„zero", paleta jest lżejsza o 400 kg, a jedyny ruch `-400` powołuje się na powód
`production_waste`, czyli na wpis, który właśnie wykreślono. Wiersz storna dostaje w dodatku
`lp_id = NULL`, więc **traci powiązanie z paletą** — nie da się nawet automatycznie odnaleźć
poszkodowanej palety.

**Przyczyna:** `voidWasteEntry`
(`production/_actions/corrections-actions.ts:861-932`) wpisuje wyłącznie wiersz przeciwny do
`wo_waste_log` plus wiersz audytu — nie dotyka ani `license_plates`, ani `stock_moves`.
`loadWasteForUpdate` (tamże, 188-213) **nie czyta nawet kolumny `lp_id`**, więc funkcja jest
strukturalnie niezdolna do przywrócenia palety. Dla porównania: odwrócenie konsumpcji
(`reverseConsumption`) paletę przywraca i pisze `lp_state_history`.

**Kontrola przeciwna (obowiązkowa):** ta sama ścieżka dla odpadu **bez palety** — 10 kg
zarejestrowane klikaniem z ekranu zlecenia — zachowuje się spójnie: storno `-10`, paleta się
nie rusza (bo nigdy nie była w grze), suma na ekranie (4,5 kg) zgadza się z bazą co do grama.
Czyli sam mechanizm storna działa; brakuje wyłącznie gałęzi „odpad miał paletę".

**Waga:** POWAŻNY (ubytek towaru bez śladu w księdze).

**Rozstrzygnięcie sporu „defekt czy świadoma decyzja produktowa":** nawet gdyby przyjąć, że
unieważnienie ma poprawiać tylko statystykę odpadu, a nie zwracać towar, obecne zachowanie
**kasuje uzasadnienie ubytku**. Decyzja produktowa mogłaby brzmieć „towaru nie zwracamy" —
ale wtedy ubytek musi zostać przeksięgowany na inny tytuł (np. korekta stanu z powodem
„odpad wystornowany"), a nie zniknąć bez śladu. Dziś znika. **To defekt.**

---

### P3 — Dwa zakłady z tym samym kodem linii: nierozróżnialne pozycje w formularzu i zdublowany wiersz na liście

**Podejrzenie z zlecenia POTWIERDZONE, z dowodem, który sam się przyznaje.**

Schemat dopuszcza ten sam kod linii w dwóch zakładach (mig 268 `production_lines_org_site_code_uq`,
mig 497 wersja bez rozróżniania wielkości liter — unikalność jest **per zakład**). Sprawdziłem
najpierw, czy baza faktycznie na to pozwala:

```
insert into production_lines (…, site_id = Demo Plant — Krakow, code = 'DEMO-LINE-1', …)
→ PRZESZŁO
production_lines:
  25900000-…-0101 | DEMO-LINE-1 | Demo Line 1   | site c4429a40-…aa52 (Warszawa)
  7c000000-…-00d1 | DEMO-LINE-1 | Krakow Line 1 | site c4429a40-…aa53 (Kraków)
  25900000-…-0102 | DEMO-LINE-2 | Demo Line 2   | site c4429a40-…aa52
```

**Objaw 1 — operator nie odróżni linii.** `/en/production/changeovers` → **+ New changeover** →
rozwijana lista „Line":

```
etykiety : ["DEMO-LINE-1", "DEMO-LINE-1", "DEMO-LINE-2"]
wartości : ["25900000-…-0101", "7c000000-…-00d1", "25900000-…-0102"]
```

Dwie pozycje **identyczne na ekranie**, różne pod spodem — i żadna nie mówi, o który zakład
chodzi. Podpisując przezbrojenie alergenowe operator nie ma jak stwierdzić, czy podpisuje je
dla Warszawy czy dla Krakowa. Przyczyna: `changeovers-lines.ts:52-60` czyta z linii tylko
`id` i `code`, a modal buduje etykietę wprost z `code`
(`changeover-create-modal.client.tsx:113`) — nazwa linii i zakład nie są w ogóle pobierane.

**Objaw 2 — jedno zdarzenie, dwa wiersze na ekranie.** Odczyt listy dopasowuje linię tak:

```sql
left join public.production_lines pl
  on pl.org_id = ce.org_id and (pl.id::text = ce.line_id or pl.code = ce.line_id)
```

— czyli **tylko po organizacji**, dopuszczając dopasowanie po kodzie, i **bez `limit 1`**.
Wstawiłem jeden wiersz `changeover_events` z `line_id = 'DEMO-LINE-1'` (kolumna jest typu TEXT,
a odczyt taki kształt jawnie wspiera):

```
zdarzeń o tym id w bazie                     : 1
wierszy zwracanych przez ZŁĄCZENIE z listy   : 2
wierszy dla tego zdarzenia na ekranie        : 2
```

I stopka tabeli, dosłownie: **`Showing 7 of 6`** — siedem wierszy przy sześciu zdarzeniach,
bo licznik (`count(*)` bez złączenia) i dane (z rozmnażającym złączeniem) liczą co innego.
W konsoli przeglądarki towarzyszy temu ostrzeżenie Reacta: *„Encountered two children with the
same key … 7c000000-0000-4000-8000-0000000000"*.

**Uczciwe zawężenie:** obecny formularz **zawsze zapisuje UUID linii**
(`resolveProductionLine` w `changeover-actions.ts:234-246` wymusza `production_lines.id::text`),
więc wiersze utworzone dzisiaj przez interfejs są bezpieczne. Rozmnożenie wchodzi w grę dla
wierszy o `line_id` w postaci **kodu** — czyli z importu, migracji danych albo innego pisarza.
Objaw 1 (nierozróżnialne pozycje) jest natomiast **natychmiastowy i nie wymaga żadnych
zastanych danych** — wystarczy drugi zakład z tym samym kodem linii.

**Waga:** POWAŻNY (w zakładzie wielooddziałowym: podpis alergenowy na linii innego zakładu;
plus liczby, które same sobie przeczą na ekranie).

*(Po teście posprzątałem: zasiana linia i wiersz `changeover_events` usunięte.)*

---

## 5. DROBNE

- **D1 — jedna odmowa na wszystko przy podpisie przezbrojenia, i to przez literówkę.**
  Serwer zwraca `cleaning_incomplete` (z gotowym zdaniem „cleaning must be completed before the
  final changeover sign-off") oraz `same_user_rejected`. Interfejs w obu przypadkach pokazuje
  **„Could not sign. Try again."** Powód jest konkretny: `mapError`
  (`changeover-sign-panel.client.tsx:103-118`) ma gałąź dla **`'same_user'`**, a akcja serwerowa
  zwraca **`'same_user_rejected'`** (`changeover-actions.ts:585`) — nazwy się nie zgadzają, więc
  wpada w `default`. Dla `cleaning_incomplete` gałęzi nie ma wcale, a `result.message` jest
  ignorowane. Dowód, że mapa działa, gdy nazwa pasuje: przy wyścigu dwóch podpisów przegrany
  dostał **poprawny** komunikat „This changeover is not in a state that can be signed."
  (`invalid_state` — jedyny kod, który się zgadza).
- **D2 — pusty picker powodu w modalu odpadu.** `/production/wos/<id>` → Waste → **Log waste**:
  pole „reason" to `Select` z **zerem opcji**. Przycisk **Confirm i tak jest aktywny**, zapis
  przechodzi, w bazie ląduje `reason_code = null`. (Bliźniak P8 tora A — pusty picker powodów RMA.)
- **D3 — kafelek „Open events" na pulpicie przestojów zależy od okna czasowego.** W bazie są
  **3 otwarte** przestoje (dwa demonstracyjne wiszą otwarte od 2026-06-09), pulpit po zamknięciu
  mojego pokazuje **„OPEN EVENTS 0"**. Kafelek liczy tylko zdarzenia, które **zaczęły się**
  w oknie (`downtime-data.ts:159-170`, `downtimeDatePredicate('started_at', days)`). Otwarty
  przestój sprzed miesiąca to linia, która wciąż stoi — a pulpit mówi, że nie stoi żadna.
- **D4 — przestój można zaksięgować na linię, na której zlecenie nie chodzi.** Modal pauzy
  domyślnie podstawia linię zlecenia (`pause-modal.tsx:34-37`) i to działa, ale operator może
  wybrać dowolną inną i **nic tego nie sprawdza**. Zmierzone: zlecenie `DEMO-WO-259-004` chodzi
  na `DEMO-LINE-2` (`production_line_id = 25900000-…-0102`), wstrzymałem je wskazując
  `DEMO-LINE-1` — `downtime_events.line_id = 25900000-…-0101`, przyjęte bez ostrzeżenia,
  a pulpit pokazuje „DEMO-LINE-1 … DEMO-WO-259-004". Minuty przestoju obciążą niewłaściwą linię
  we wskaźnikach OEE.
- **D5 — przestój może kończyć się w przyszłości.** Przy wznowieniu pole korekty czasu przyjmuje
  dowolną liczbę minut bez porównania z zegarem. Wstrzymałem o `02:37:38`, wznowiłem po minucie
  wpisując **45** → `ended_at = 2026-08-06 03:22:38`, czyli **44 minuty po momencie kliknięcia**,
  `duration_min = 45`, pulpit „TOTAL DOWNTIME 0h 45m". Brakuje ogranicznika `ended_at <= now()`.

---

## 6. PODEJRZENIA OBALONE I OBSERWACJE

### O2 — dwa jednoczesne podpisy KOŃCZĄCE przezbrojenie: **bezpieczne**

Dwa okna tego samego uprawnionego drugiego podpisującego, oba z otwartym modalem i wpisanym
PIN-em, `Promise.all` na przycisku:

```
okno B: bez błędu
okno C: „This changeover is not in a state that can be signed."
changeover_events: dual_sign_off_status = complete, jeden first_signer, jeden second_signer
allergen_changeover_validations: DOKŁADNIE JEDNO świadectwo
e_sign_log: dwa pokwitowania, po jednym na slot (nonce …:first:… i …:second:…)
```

Blokada wiersza (`for update`) plus wczesne wyjście przy `complete` trzymają. Żadnego
zdublowanego świadectwa alergenowego.

### O3 — dwa jednoczesne unieważnienia tego samego odpadu: **bezpieczne**

```
okno A: bez błędu
okno B: „This record has already been voided."
wo_waste_log: DOKŁADNIE JEDNO storno (-7.000, entry_error)
```

Wsparte indeksem `uq_wo_waste_log_one_correction (org_id, correction_of_id)` — jest na bazie.

### O4 — wyścig o numer kartonu: **duplikatu NIE odtworzyłem** (i wiem dlaczego)

Zbudowałem świeżą wysyłkę (SO-202608-00015 → SH-2026-00003 `packing`, 60 kg pobrane) i puściłem:
najpierw **2 okna naraz**, potem **4 okna × 2 rundy**. Razem **10 jednoczesnych zapakowań**:

```
runda 1 (4 okna): kartony → 6; numery ["2","1","5","4","3","6"]; DUPLIKATY []
runda 2 (4 okna): kartony → 10; numery [… "9","8","7","10"];      DUPLIKATY []
SSCC: seria 3…12, bez dziur i bez powtórzeń
licznik SSCC organizacji: last_serial = 12
```

**Dlaczego nie ma duplikatu, mimo że kod liczy `max(box_number)+1`:** każdy nowy karton
**najpierw bije SSCC** przez `public.generate_sscc` → `public.next_sscc_serial`, a ta funkcja
robi `update public.sscc_counters set last_serial = last_serial + 1 … returning` — czyli
**bierze blokadę wiersza licznika organizacji i trzyma ją do commitu**. Drugi pakowacz czeka na
tej blokadzie, a po zwolnieniu jego zapytanie o `max(box_number)` to **nowe zapytanie = nowa
migawka**, która widzi już zatwierdzony karton nr 1. Widać to gołym okiem w wyniku: numery
kartonów przyznane są w **innej kolejności niż powstawały wiersze** (`["2","1","5","4","3","6"]`
przy sortowaniu po `created_at`) — dokładnie tak wygląda kolejka na blokadzie.

**Co z tego wynika dla migracji 564:** na tej bazie (migracje zastosowane do
`562-fg-npd-ext-finite-numerics.sql`, indeksu `shipment_boxes_org_shipment_box_number_uq`
**nie ma**) duplikat numeru kartonu jest **zamaskowany przez cudzą blokadę, nie zabezpieczony
z projektu**. Ochrona znika w każdej ścieżce, która przydziela numer kartonu **bez bicia SSCC**
— a taka gałąź już istnieje w kodzie (pakowanie do **istniejącego** kartonu pomija mint,
`pack-lp-into-box.ts:195`) i wystarczy jedna zmiana kolejności, żeby ją odsłonić. Druga połowa
migracji 564 (numery reklamacji) **nie ma** żadnego takiego przypadkowego zamka — i tam tor B
duplikat odtworzył. **Migracja 564 jest nadal potrzebna**; mój wynik mówi tylko, że akurat
kartony nie sypią się dziś same z siebie.

Zgodnie ze zleceniem: gdyby duplikat wystąpił, byłby skutkiem zablokowanego łańcucha migracji,
nie nowym błędem. Nie wystąpił.

### Obserwacja — dwa przezbrojenia naraz na tej samej linii

Dwa okna jednocześnie zaplanowały przezbrojenie tej samej linii; powstały oba wpisy
(3 → 5 zdarzeń, dwa `pending` na `DEMO-LINE-1` obok siebie, różnica 31 ms). Nie nazywam tego
błędem — to rejestr zdarzeń, nie zasób wyłączny — ale przy dwóch otwartych przezbrojeniach
na jednej linii nie wiadomo, które z nich bramkuje kolejne zlecenie.

### O6 — macierz alergenowa: działa, łącznie z nadpisaniem per linia

Ta gałąź nie była tu nigdy przejechana — na starcie `changeover_matrix` i
`changeover_matrix_versions` były **puste**, więc wszystkie moje wcześniejsze przezbrojenia
szły heurystyką (`riskSource = heuristic`). Zasiałem aktywną wersję macierzy przez SQL
(interfejs macierzy żyje w innym module, `/scheduler/changeover-matrix`, i go nie sprawdzałem)
i utworzyłem przezbrojenia **klikając w formularzu**. Profile: „from" = gluten,
„to" = mleko + soja.

```
1. bez macierzy                                   → ryzyko = medium      | źródło = heuristic
2. macierz org-wide: gluten→milk = 'segregated'    → ryzyko = segregated | źródło = matrix
3. nadpisanie dla DEMO-LINE-2: gluten→milk = 'low'
     przezbrojenie na DEMO-LINE-2                  → ryzyko = low        | źródło = matrix
     przezbrojenie na DEMO-LINE-1 (bez nadpisania) → ryzyko = segregated | źródło = matrix
```

Wszystkie trzy przypadki zachowują się zgodnie z opisem w kodzie: macierz bije heurystykę,
wiersz per linia bije wiersz ogólnoorganizacyjny, a linia bez nadpisania zostaje przy poziomie
ogólnym. **Kontrola przeciwna spełniona** — punkt 1 pokazuje, że bez macierzy wynik jest inny,
więc to naprawdę macierz zdecydowała, a nie zbieg okoliczności.

*(Po teście posprzątałem: wersja macierzy i jej wiersze usunięte.)*

### O5 — bramka startu zlecenia: rejestr przezbrojeń NAPRAWDĘ coś blokuje

Najważniejsze pytanie o cały moduł: czy niepodpisane przezbrojenie faktycznie zatrzymuje
produkcję, czy to tylko rejestr? **Zatrzymuje.**

Stan wyjściowy: na `DEMO-LINE-1` wisiały trzy niedokończone przezbrojenia wysokiego ryzyka
(`first_signed`, `pending`, `pending`). Zlecenie `DEMO-WO-259-002` (RELEASED, ta sama linia):

```
baner na ekranie zlecenia:
  ⚠ Allergen changeover sign-off required — This line requires the allergen changeover
    to be dual-signed before this work order can start.  [Open changeovers]
klik Start → HTTP 409, ten sam komunikat w banerze
work_orders.status = RELEASED (bez zmian), wo_executions = brak
```

**Kontrola przeciwna — częściowo udana.** Dopiąłem podpisy wszystkich trzech przezbrojeń
(pierwszy podpis harness, drugi admin; mycie musiałem wcześniej ustawić na wykonane, bo bramka
z sekcji 2 poprawnie odmawiała podpisu kończącego):

```
otwarte przezbrojenia na linii po dopięciu : []
baner na ekranie zlecenia                  : BRAK BANERA        <-- bramka się zwolniła
klik Start → komunikat już INNY:
  „WO has no factory-release snapshot; release the work order again in Planning to bind
   its approved BOM and factory spec before start."
```

Czyli bramka przezbrojeniowa **zapala się i gaśnie tak, jak powinna** — jej własna odmowa
zniknęła dokładnie wtedy, gdy podpisy zostały dopięte. Pełnego „start przechodzi" **nie
udowodniłem**, bo zatrzymała mnie druga, niezależna bramka: demonstracyjne zlecenia mają
`active_bom_header_id` i `active_factory_spec_id` puste (`start-wo.ts:110-118`). Zlecenia
`DEMO-WO-259-003/004` są `IN_PROGRESS` tylko dlatego, że tak je zasiano — **przez ścieżkę Start
nie przeszło w tej bazie żadne**. To ograniczenie danych demonstracyjnych, nie błąd aplikacji,
ale oznacza, że **cała ścieżka START jest na tym zestawie danych nieprzetestowalna** i nikt jej
tu nie przeklikał.

### O1 — DO DECYZJI OWNERA: odpad z ekranu zlecenia nie zdejmuje niczego ze stanu

Modal „Log waste" nie ma pola palety — pola modala to `wo-waste-category`, `wo-waste-qty`,
`wo-waste-shift`, `wo-waste-reason`, `wo-waste-notes`. Zmierzone: po zarejestrowaniu 10 kg
odpadu paleta `LP-1785974013671-LKGS` stoi nietknięta na 2000 kg i w `stock_moves` nic nie
przybywa. Serwer **umie** odjąć od palety — `recordWaste` przyjmuje `lp_id`, sprawdza QA, status,
jednostkę i dostępność, aktualizuje paletę, pisze ruch `production_waste` i przy wyzerowaniu
wpis do `lp_state_history` — ale **żaden ekran tego nie wysyła** (ani biurko, ani skaner:
`scanner/wos/[woId]/waste` też nie ma pola palety).

Dwa możliwe modele i owner musi wybrać:
- **„odpad dotyczy surowca już skonsumowanego"** → gałąź `lp_id` w `recordWaste` jest martwym
  kodem i należy ją usunąć; wtedy P2 przestaje istnieć jako ścieżka.
- **„odpad zdejmuje towar z palety"** → brakuje pola palety w obu formularzach, a P2 jest
  krytyczne do naprawy.

Dziś obowiązują oba naraz: interfejs robi pierwszy, serwer umie drugi.

---

## 7. CZEGO NIE SPRAWDZIŁEM

- **Napraw z tej nocy** (ruch zwrotny po anulowaniu wysyłki, anulowanie zakończonego zlecenia,
  bramka blokad jakościowych odmawiająca przy awarii). Zostałem świadomie na `80b2821a`:
  przełączenie na nowszy commit wymagało zatrzymania serwera, a nowsze migracje (563, 564)
  nie są na tej bazie zastosowane — ryzykowałbym rozwaleniem środowiska w połowie nocy i
  wynikiem, którego nie umiałbym przypisać ani kodowi, ani schematowi. Do zrobienia w świeżym
  katalogu na aktualnym `main`.
- **Wpływ przestojów na wskaźniki OEE** (`oee_snapshots`) — sprawdziłem tylko pulpit przestojów
  i zakładkę na zleceniu; nie doszedłem do modułu OEE ani do tego, czy 45 minut przestoju
  faktycznie obniża dostępność linii.
- **Edytor macierzy alergenowej** (`/scheduler/changeover-matrix`) — samą logikę wyboru ryzyka
  sprawdziłem (O6), ale macierz zasiałem przez SQL. Ekranu, na którym technolog ją układa
  i publikuje wersję, **nie dotknąłem**.
- **Pełne przejście START zlecenia** — bramka przezbrojeniowa jest sprawdzona w obie strony
  (O5), ale samego udanego startu nie pokazałem: dane demonstracyjne nie mają powiązanego BOM-u
  ani specyfikacji fabrycznej. Wymaga zlecenia wypuszczonego z Planowania.
- **Przestój ze skanera i z modułu utrzymania ruchu** (`mwo_id`, `source` inne niż `wo_pause`) —
  przeszedłem wyłącznie ścieżkę „wstrzymanie zlecenia".
- **Uprawnienia** — całość klikałem jako `harness`/`admin` (obaj z rolą Admin). Nie sprawdzałem,
  co widzi i czego nie może operator liniowy przy przezbrojeniach, przestojach ani odpadzie.

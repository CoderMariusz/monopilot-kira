# RAPORT TORU A — łańcuch fizyczny towaru (magazyn / wysyłki / produkcja / skaner / identyfikowalność)

Środowisko: `/Users/mariuszkrawczyk/Projects/_noc/A` @ `80b2821a`, baza `monopilot_t1`, port 3014
(aplikacja 3314). Praca: 23:05–03:10.

## PODSUMOWANIE W SZEŚCIU ZDANIACH

Bramka hydracji przeszła, więc wszystko poniżej jest mierzone, nie zgadywane. Przeszedłem cały
łańcuch fizyczny towaru w przeglądarce: przyjęcie korektą → zwolnienie QA → zamówienie → alokacja
→ kompletacja → pakowanie z SSCC → list przewozowy → wysłanie → **anulowanie wysłanej wysyłki**
oraz drugi raz aż do **potwierdzenia dostawy**; osobno konsumpcję i rejestrację wyrobu na zleceniu,
przesunięcia ze skanera i śledzenie partii w obie strony. **Trzy z pięciu podejrzeń z 30 lipca są
nieprawdziwe** (anulowanie wysyłki, przesunięcie międzyzakładowe ze skanera, pobranie palety w pełni
zarezerwowanej) — każde obalone z dowodem ze stanu bazy. Czwarte (strefa czasowa w bramce
przeterminowania) jest **prawdziwe, ale naprawione tylko w połowie miejsc** — cztery ścieżki
wysyłkowe nadal liczą `current_date` w strefie sesji bazy. Znalazłem za to jednego **blokera**
(inwentaryzacja nie działa w ogóle — sesja rodzi się w statusie, którego nie akceptuje ani
liczenie, ani zamknięcie) i osiem **poważnych**: dwa dotykają identyfikowalności partii, jeden —
nieodwracalności potwierdzenia dostawy, jeden zamyka cały moduł zwrotów. Przez wszystko przewija
się jeden wzorzec: **interfejs podmienia konkretną, użyteczną odmowę serwera na komunikat
„spróbuj ponownie"** — pięć niezależnych wystąpień, każde prowadzące operatora donikąd.

**Gdyby owner miał czas tylko na trzy rzeczy:** B1 (inwentaryzacja — sprzeczna maszyna stanów),
P2 (strefa czasowa w bramce przeterminowania — poprawka weszła w połowę miejsc), P7 (mapa
komunikatów błędów — jedna zmiana odblokowuje diagnostykę pięciu ścieżek naraz).

| | |
|---|---|
| BLOKERY | 1 (B1 — inwentaryzacja) |
| POWAŻNE | 8 (P1–P8) |
| DROBNE | 6 (D1–D6) |
| PODEJRZENIA OBALONE | 3 (O1–O3) + częściowo POD (patrz P5) |

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

## 2. CO PRZEKLIKAŁEM

| Ścieżka | Werdykt |
|---|---|
| Przemiał 36 tras (warehouse ×14, shipping ×4, production ×7, scanner ×11) | **DZIAŁA** — 36/36 HTTP 200, 0 błędów strony, 0 odpowiedzi 5xx, 0 białych ekranów |
| Zakładanie PIN-u e-podpisu `/account/pin` (2 użytkowników) | **DZIAŁA** — wiersz w `user_pins` |
| Korekta stanu IN (`/warehouse/adjustments/new`) ×4 | **DZIAŁA** — 4 palety + 4 `stock_moves` + 4 `stock_adjustments` |
| Korekta stanu OUT — bramka drugiej osoby | **DZIAŁA** (picker przełożonych zwraca innego użytkownika), ale odrzucenie ma **mylący komunikat** — D5 |
| Detal palety `/warehouse/license-plates/[id]` | **DZIAŁA** — renderuje się z akcjami Split/Merge/QA/Reserve/Move/Block/Destroy |
| Przełączanie person (harness/admin/second_signer) | **DZIAŁA** — sprawdzone osobno, brak przecieku tożsamości |
| Zamówienie sprzedaży: utworzenie → potwierdzenie → alokacja | **DZIAŁA** — SO-202608-00003, `quantity_allocated=50`, `reserved_qty=50` na palecie |
| Lista kompletacyjna → kompletacja | **DZIAŁA** — `pick_lists.status=completed`, `quantity_picked=50` |
| Utworzenie wysyłki → pakowanie do kartonu → plombowanie (SSCC) | **DZIAŁA po odblokowaniu prefiksu GS1** — karton 1, SSCC `050123450000000015` (18 cyfr) |
| List przewozowy (BOL) + wysłanie | **DZIAŁA** — `shipments.status=shipped`, `shipped_at` ustawione, `stock_moves` issue 50 kg |
| **ANULOWANIE WYSŁANEJ WYSYŁKI** | **DZIAŁA — podejrzenie OBALONE**, ale zostawia dziurę w księdze ruchów (P1) |
| Uzgodnienie księgi `stock_moves` ze stanem palet | **ZEPSUTE po cofnięciach** — 8/10 palet zgadza się co do grama, obie po operacji odwracającej nie (P1) |
| Prefiks GS1 w ustawieniach firmy | **ZEPSUTE** — brak pola, brak zapisu (P6) |
| Formularz nowego zamówienia sprzedaży — pusty wiersz | **ZEPSUTE (pułapka)** — patrz D2 |
| Skaner: logowanie PIN-em + start zmiany | **DZIAŁA** — sesja w `scanner_sessions` |
| Skaner: przesunięcie palety w zakładzie | **DZIAŁA** — `stock_moves` transfer A-01 → A-02 |
| **Skaner: przesunięcie MIĘDZY ZAKŁADAMI** | **ZABLOKOWANE — podejrzenie OBALONE** (HTTP 409), ale komunikat bezużyteczny (P7) |
| Biurko: modal Move na detalu palety | **DZIAŁA** — lokalizacji z obcego zakładu nie ma w liście |
| Bramka przeterminowania: rozjazd stref | **ZEPSUTE** (P2) — dowód SQL + dowód w przeglądarce |
| Produkcja: konsumpcja materiału na zleceniu | **DZIAŁA** — `wo_material_consumption` + spadek stanu palety |
| Produkcja: wycofanie konsumpcji (Genealogy → Reverse) | **DZIAŁA** — storno `-100` z `correction_of_id` |
| **Produkcja: rejestracja wyrobu** | **ZEPSUTE** — twarda blokada `wac_un_costed` pod ogólnym komunikatem (P3) |
| Identyfikowalność: śledzenie WSTECZ (wyrób → surowiec) | **DZIAŁA** — ekran genealogii pokazuje przodka na Depth 1 |
| Identyfikowalność: śledzenie W PRZÓD (surowiec → wyroby) | **DZIAŁA**, ale zawiera fałszywego potomka (P4) |
| Produkcja: rejestracja wyrobu przy SKOSZTOWANYM surowcu | **DZIAŁA** — kontrola przeciwna do P3 |
| Druga wysyłka: SO → … → BOL → wysłanie → **POD** | **DZIAŁA — podejrzenie OBALONE** (`delivered`, `delivered_at`, audyt `shipping.pod.recorded`) |
| **Cofnięcie POD / rozpakowanie wysyłki** | **BRAK W INTERFEJSIE** — akcje serwerowe istnieją, nikt ich nie woła (P5) |
| Pobranie palety w pełni zarezerwowanej (skaner) | **ZABLOKOWANE — podejrzenie OBALONE**, 0 ruchów o ilości zero w bazie (O3) |
| Inwentaryzacja: utworzenie sesji liczenia | **DZIAŁA** — `count_sessions` + 10 `count_lines` z `system_qty` |
| **Inwentaryzacja: zapis zliczenia i zamknięcie sesji** | **BLOKER — NIE DZIAŁA W OGÓLE** (B1) |
| **Zwroty RMA: utworzenie zwrotu** | **ZEPSUTE** — pusty picker powodów, przycisk „Add reason" martwy (P8) |
| Przezbrojenia / przestoje / odpad na zleceniu | **NIE DOSZEDŁEM** |

---

## 3. BLOKERY

### B1 — INWENTARYZACJA NIE DZIAŁA W OGÓLE: sesja rodzi się w statusie, którego nie akceptuje ani liczenie, ani zamknięcie

Najcięższe znalezisko nocy. Cała funkcja `/warehouse/counts` jest nieużywalna od pierwszego kroku.

**Ścieżka odtworzenia:** `/en/warehouse/counts` → **New count session** → magazyn `WH-DEMO-01`,
typ `Full` → **Create**. Sesja powstaje poprawnie:

```
count_sessions: CNT-B256F343 | WH-DEMO-01 | Full | status = open | 10 linii
count_lines:    10 wierszy z poprawnym system_qty, np.
                LP-1785974013671-LKGS | system_qty 2000.000000 | counted_qty null | status pending
```

Wpisuję zliczoną ilość w pierwszym wierszu (2000 → **1995**, celowa różnica 5 kg), przycisk zapisu
jest aktywny, klikam.

**Obserwacja:** „**Could not record the count. Please try again.**"

**Dowód ze stanu — nic się nie zapisało:**

```
system_qty | counted_qty | status  | variance_qty
2000.000000| null        | pending | null
```

Próbuję zamknąć sesję (**Close session**, potwierdzenie „Close this count session? No further
counts can be recorded."):

**Obserwacja:** „**Could not close the session. Please try again.**", w bazie `status` nadal `open`.

**Przyczyna — sprzeczność w maszynie stanów, jednoznaczna:**

| Miejsce | Kod | Wymaga statusu |
|---|---|---|
| tworzenie sesji | `count-actions.ts:938-941` — `insert … values (…, 'open')` | ustawia **`open`** |
| zapis zliczenia | `count-actions.ts:1062` — `if (sessionRow.status !== 'counting') throw 'count_session_not_open'` | wymaga **`counting`** |
| zamknięcie sesji | `count-actions.ts:1443` — `if (current.rows[0]?.status !== 'review') throw 'count_session_not_closable'` | wymaga **`review`** |

W **całym repozytorium** słowo `'counting'` występuje w kontekście tej funkcji dokładnie trzy razy:
w liście statusów (`count-types.ts:4`), w powyższej bramce (`count-actions.ts:1062`) — i w teście
jednostkowym, który **sam ustawia** `sessionStatus = 'counting'`
(`counts/_actions/__tests__/count-actions.test.ts:403`, przypadek „WH-063 records lines only while
the session is counting"). **Żaden kod produkcyjny nigdy nie przestawia sesji z `open` na
`counting`** — nie ma takiej akcji, przycisku ani migracji.

Czyli: sesja rodzi się w `open`, liczenie wymaga `counting`, zamknięcie wymaga `review`,
a przejść między tymi stanami nie ma. Sesja zostaje `open` na zawsze, ani jednego zliczenia nie da
się zapisać. Test jednostkowy jest zielony, bo bada stan, do którego aplikacja nie potrafi dojść.

Waga: **BLOKER** — nie da się przejść ścieżki. Dodatkowo oba komunikaty („Please try again.")
zachęcają operatora do bezskutecznego ponawiania — czwarte wystąpienie wzorca z 3.2b.

---

## 4. POWAŻNE

### P1 — operacje ODWRACAJĄCE rozjeżdżają księgę ruchów ze stanem magazynowym (2 z 2 przypadków)

Znalezione przy obalaniu O1 — ta sama ścieżka, realny defekt.

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

**To nie jest odosobniony przypadek — druga operacja odwracająca rozjeżdża księgę inaczej.**
Wycofanie konsumpcji materiału (Genealogy → Reverse) **podnosi** stan palety o 100 kg
(zmierzone: `1900.000000 → 2000.000000`), a do księgi wpisuje wiersz o ilości **ujemnej**:

```
SM-1DFA4D8E11CD48E7A073 | adjustment     | 2000.000000 | found_stock           | 00:53:33
SM-D5840FBBC04C3B2D963B | consume_to_wo  |  100.000000 | production_consume    | 00:59:39
SM-D53D3CBFEF3E3CDB9491 | adjustment     | -100.000000 | consumption_reversed  | 01:07:41
```

Kod robi to celowo — `corrections-actions.ts:522-560` wpisuje
`negateDecimalString(params.original.qty_consumed)` i ustawia `from_location_id`
(czyli „towar wyszedł z tej lokalizacji") dla zdarzenia, które towar **przywróciło**.
Baza na to pozwala: `CHECK ((move_type = 'adjustment') OR (quantity >= 0))` — ujemne ilości są
dozwolone wyłącznie dla korekt. Problem w tym, że **wszystkie pozostałe korekty w bazie są
dodatnie i odpowiadają wzrostowi stanu** (8 wierszy), więc ten sam typ ruchu ma tu odwrotny znak
niż w pozostałych przypadkach.

Uzgodnienie księgi ze stanem po całej nocy — dwie palety się nie zgadzają, obie po operacji
odwracającej:

```
lp_number              | stan       | księga     | różnica
LP-1785969190008-CP98  | 270.000000 | 220.000000 |  50.000000   ← anulowana wysyłka (brak ruchu)
LP-1785974013671-LKGS  | 2000.000000| 1800.000000| 200.000000   ← wycofana konsumpcja (zły znak)
LP-1785969023932-K5LS  | 500.000000 | 500.000000 |   0.000000
LP-1785969183099-4D8T  | 500.000000 | 500.000000 |   0.000000
LP-1785969196494-52PN  | 120.000000 | 120.000000 |   0.000000
LP-1785969202931-JNQH  |  80.000000 |  80.000000 |   0.000000
LP-1785974021648-L8XA  |  80.000000 |  80.000000 |   0.000000
LP-1785975212327-KRAQ  | 100.000000 | 100.000000 |   0.000000
LP-1785975465571-YTKK  | 100.000000 | 100.000000 |   0.000000
LP-1785975497219-WCOP  | 200.000000 | 200.000000 |   0.000000
```

(reguła sumowania: `+adjustment` ze znakiem, `−issue`, `−consume_to_wo`, `+receipt`)

**Osiem palet, których nie dotknęła żadna operacja odwracająca, zgadza się co do grama.
Obie, które przeszły cofnięcie, się nie zgadzają.** To jest wzorzec, nie przypadek.

Waga: **POWAŻNY** (dane niespójne, cicho — nic nie krzyczy).

### P2 — bramka przeterminowanych palet **po stronie wysyłek** nadal liczy datę w strefie sesji bazy

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

### P3 — towar przyjęty korektą stanu jest BEZ KOSZTU i blokuje rejestrację wyrobu na stałe; jedyne wyjście kasuje identyfikowalność

Najgroźniejsze znalezisko z produkcji. Cały łańcuch przeklikany, każdy krok potwierdzony w bazie.

**Ścieżka odtworzenia:**
1. `/en/warehouse/adjustments/new` → korekta IN 2000 kg `DEMO-RM-FLOUR` do A-01 (paleta powstaje).
2. Detal palety → **Change QA status** → *released*.
3. `/en/production/wos/{id}` (DEMO-WO-259-004, `IN_PROGRESS`) → zakładka **Consumption** →
   **Record** przy `DEMO-RM-FLOUR` → 100 kg → zapisz. **Działa** — w bazie:

   ```
   wo_material_consumption: qty_consumed=100.000, uom=kg, fefo_adherence_flag=true
   wo_materials:            Demo Flour  consumed_qty 0.000 → 100.000
   license_plates:          NOC-A-FLOUR  2000.000000 → 1900.000000
   ```

4. Zakładka **Output** → **Record output** → 100 kg, partia `NOC-A-OUT-1` → **Confirm**.

**Obserwacja:** modal zostaje otwarty, na ekranie **„The action could not be completed."**
Odpowiedź serwera (przechwycona z sieci) jest za to bardzo konkretna:

```
HTTP 422 POST /en/production/work-orders/{id}/outputs
{"error":"wac_un_costed",
 "unCostedLines":[{"consumptionId":"411fcc29-…","componentId":"…0501","qty":"100.000","uom":"kg"}]}
```

**Przyczyna:** korekta IN tworzy stan o **zerowej wartości** — `item_wac_state` dla
`DEMO-RM-FLOUR` ma `total_value = 0.0000`, `avg_cost = 0.000000` (bo `items.cost_per_kg` było
puste). `register-output.ts:792-805` odmawia rejestracji wyrobu, gdy którakolwiek linia zużycia
jest nieskosztowana. Dla porównania `RM-PORK-90` ma `cost_per_kg = 3.80` i jego WAC wyszedł
`avg_cost = 3.800000` — czyli mechanizm działa, tylko milczy przy pozycjach bez ceny.

**Naprawa po fakcie NIE POMAGA (sprawdzone).** Ustawiłem `items.cost_per_kg = 1.25` dla
`DEMO-RM-FLOUR` i `DEMO-RM-SPICE`, po czym powtórzyłem rejestrację wyrobu w przeglądarce:
**ta sama odpowiedź 422 `wac_un_costed` na tę samą linię zużycia.** Koszt zapisany po zdarzeniu
nie przelicza wstecz istniejącego zużycia.

**Jedyne znalezione wyjście kasuje identyfikowalność.** Zakładka **Genealogy** → **Reverse…**
przy zapisie zużycia (powód + notatka + PIN) — wycofanie działa i zapisuje storno:

```
wo_material_consumption: 411fcc29… qty=100.000 (correction_of_id = null)
                         fee9f0f2… qty=-100.000 (correction_of_id = 411fcc29…)
wo_materials:            Demo Flour consumed_qty → 0.000
```

Dopiero wtedy rejestracja wyrobu przechodzi — ale przez bramkę, którą aplikacja sama opisuje tak:

> ⚠ No material consumption recorded for this WO — **the output will have no
> genealogy/traceability link.** Register consumption first, or continue. → **Continue anyway**

Po kliknięciu „Continue anyway" wyrób powstaje:

```
wo_outputs:     primary | 100.000 kg | NOC-A-OUT-3 | lp_id=7e9a77ea-…
license_plates: LP-1785975212327-KRAQ | NOC-A-OUT-3 | 100.000000 | origin=production
```

**KONTROLA PRZECIWNA — przy skosztowanym surowcu wszystko przechodzi gładko.** Dorzuciłem 100 kg
`DEMO-RM-SPICE` korektą JUŻ PO ustawieniu ceny; WAC przestał być zerowy:

```
[TRACE] WAC przed dostawą = DEMO-RM-SPICE | 100.000 kg | wartość 0.0000    | avg 0.000000
[TRACE] WAC po dostawie   = DEMO-RM-SPICE | 200.000 kg | wartość 125.0000  | avg 0.625000
```

Po konsumpcji 20 kg tej pozycji rejestracja wyrobu 200 kg (partia `NOC-A-TRACE`) przeszła
**za pierwszym kliknięciem**, bez błędu 422 i **bez bramki „no consumption"**:

```
[TRACE] czy pojawiła się bramka „brak konsumpcji"? false
[TRACE] „Confirm" wyłączony? false
wo_outputs:     200.000 | NOC-A-TRACE | lp_id=c9867ccd-…
license_plates: LP-1785975497219-WCOP | NOC-A-TRACE | 200.000000 | origin=production
```

To domyka rozpoznanie: blokadę powoduje **zerowy koszt zapasu**, nic innego.

**Podsumowanie dla zakładu mięsnego:** jeżeli surowiec trafił na stan korektą (znaleziony towar,
korekta inwentaryzacyjna) i pozycja nie miała ustawionej ceny, to zlecenie, które go zużyło, ma dwa
wyjścia: zostać zablokowane na komunikacie „coś poszło nie tak", albo wycofać konsumpcję i wypuścić
wyrób przez bramkę, którą aplikacja sama opisuje jako „output will have no genealogy/traceability
link". Oba są złe.

Waga: **POWAŻNY** (przy większej skali — bloker produkcji).

### P4 — konsumpcja materiału **dopisuje genealogię wstecz** do palet wyprodukowanych WCZEŚNIEJ

Znalezione przy domykaniu 3.1d. Zegar z bazy, bez interpretacji:

```
zdarzenie                        | kiedy
wyrób NOC-A-OUT-3 powstał        | 2026-08-06 01:13:32.257+01
konsumpcja przyprawy 20 kg       | 2026-08-06 01:18:04.260+01
genealogia OUT-3 ← przyprawa     | 2026-08-06 01:18:04.260+01   ← dopisana 4,5 min PO powstaniu palety
wyrób NOC-A-TRACE powstał        | 2026-08-06 01:18:17.132+01
genealogia TRACE ← przyprawa     | 2026-08-06 01:18:17.132+01
```

Paleta `NOC-A-OUT-3` (100 kg) została zarejestrowana **jawnie bez konsumpcji** (przez „Continue
anyway"). Cztery i pół minuty później zużyłem 20 kg przyprawy — i w tym momencie system dopisał
`lp_genealogy` **także dla tamtej, już istniejącej palety**, dzieląc zużycie proporcjonalnie do
ilości wyrobów:

```
rodzic (przyprawa)          | dziecko (wyrób) | typ      | qty
LP-1785974021648-L8XA       | NOC-A-OUT-3     | consumed |  6.6666666666666667 kg
LP-1785974021648-L8XA       | NOC-A-TRACE     | consumed | 13.3333333333333333 kg
```

(20 kg × 100/300 i 20 kg × 200/300)

**To jest widoczne wprost na ekranie identyfikowalności.** `/en/warehouse/genealogy` → wyszukanie
palety przyprawy → śledzenie **w przód**:

```
FOCAL LP     LP-1785974021648-L8XA  DEMO-RM-SPICE · Depth 0 · 80.000000 kg
DESCENDANTS  LP-1785975212327-KRAQ  E2E-FG-0609   · Depth 1 · 100.000000 kg
             LP-1785975497219-WCOP  E2E-FG-0609   · Depth 1 · 200.000000 kg
```

Pierwszy potomek fizycznie nie może zawierać tej przyprawy — powstał, zanim ją wydano.
Przy wycofaniu partii przyprawy z rynku system wskaże paletę, w której jej nigdy nie było
(a symetrycznie: proporcjonalny podział rozcieńcza udział w palecie, w której faktycznie była).

Waga: **POWAŻNY** — fałszywy ślad w danych, na których opiera się wycofanie produktu z rynku.

### P5 — potwierdzenie dostawy DZIAŁA, ale **nie da się go cofnąć**; „rozpakowania" nie ma w interfejsie wcale

Domknięcie pozostałej części podejrzenia z 30 lipca (POD / unieważnienie POD / rozpakowanie).
Przeprowadziłem **drugą** wysyłkę od zera: `SO-202608-00012` → alokacja → kompletacja →
`SH-2026-00002` → pakowanie (SSCC `050123450000000022`) → plomba → BOL → wysłanie → **POD**.

**Część OBALAJĄCA — POD działa bez błędu:**

```
[POD] wynik POD: OK
shipments:     SH-2026-00002 | status=delivered | delivered_at=2026-08-06 01:41:56.122+01
sales_orders:  SO-202608-00012 | status=delivered
audit_events:  18 | shipping.pod.recorded | shipment | 2026-08-06 01:41:56.122+01
```

Żadnego `persistence_failed`, żadnego `not_found` — wiersz audytu powstał, więc `toAuditEventId`
i tutaj przyjmuje `bigint` zwrócony jako łańcuch.

**Część ZEPSUTA — po POD wysyłka jest nieodwracalna z poziomu aplikacji.**

Wyliczyłem przyciski dostępne na ekranie wysyłki na każdym etapie (odczyt z DOM):

| Status wysyłki | Przyciski na ekranie |
|---|---|
| `packed` | `seal-submit [wył.]`, `ship-submit`, `generate-bol-trigger`, `record-pod-trigger [wył.]` |
| `shipped` | `seal-submit [wył.]`, `generate-bol-trigger`, `record-pod-trigger`, **`cancel-trigger`** |
| `delivered` | `seal-submit [wył.]`, `generate-bol-trigger [wył.]`, `record-pod-trigger [wył.]` — **i nic więcej** |

Przy `delivered` **znika także anulowanie** (`shipment-ship-controls.tsx:178`:
`cancelStatusReady = normalized === 'shipped'`).

A tymczasem serwer **ma** obie brakujące operacje, w pełni napisane i objęte testami
jednostkowymi:

- `unpackShipment` — `shipping/_actions/cancelShipment.ts:781`
- `voidPod` — `shipping/_actions/cancelShipment.ts:907` (audytowane cofnięcie `delivered → shipped`,
  `so-status-write.ts:145-159` ma dla niego jawną furtkę)

**Żadna z nich nie ma wywołania w interfejsie.** Sprawdzone wprost:

```
grep -rn "unpackShipment" --include="*.tsx" apps/web/app   → 0 trafień
grep -rn "voidPod"        --include="*.tsx" apps/web/app   → 0 trafień
(jedyny konsument obu: apps/web/.../_actions/cancelShipment.test.ts)
```

Skutek operacyjny: kierowca albo dyspozytor omyłkowo potwierdza dostawę nie tej wysyłki —
i **nie ma z tego wyjścia**. Nie da się cofnąć potwierdzenia, nie da się anulować, nie da się
rozpakować kartonów. Zamówienie zostaje „delivered" na zawsze. To jest dokładnie klasa „stan,
z którego nie da się wyjść".

Waga: **POWAŻNY**. Naprawa jest tania — kod odwracający już istnieje i jest przetestowany;
brakuje wyłącznie dwóch przycisków (analogicznych do już istniejącego „Cancel shipment").

### P6 — pakowania wysyłki nie da się odblokować z ustawień: brak pola „prefiks GS1"

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

### P8 — zwrotów (RMA) nie da się utworzyć, a przycisk, który miał to odblokować, nic nie robi

**Odtworzenie A:** `/en/shipping/rma` → **New RMA** → wybór klienta → rozwinięcie listy
**Reason**.

**Obserwacja:** lista powodów jest **pusta**:

```
[POWODY] opcje w pickerze powodu zwrotu: []
```

Formularz wymaga powodu (`create-rma-modal.tsx:51`:
`if (!customerId || !reasonCode || lines.every(…)) { setError(linesRequired); return; }`),
a `reasonCode` startuje jako `reasonCodes[0]?.code ?? ''` — przy pustej liście zawsze `''`.
Czyli: **żadnego zwrotu nie da się złożyć**. W bazie `rma_requests` = 0 wierszy.

**Odtworzenie B — miejsce, gdzie powinno się to naprawić:**
`/en/settings/ship-override-reasons` → przycisk **„Add reason"** (aktywny, nie wyszarzony) → klik.

**Obserwacja — nie dzieje się nic.** Pomiar zamiast wrażenia:

```
[POWODY] po kliknięciu: zmiana długości DOM (main ekranu) = 0
                        zapytań innych niż GET = []
[POWODY] kody RMA po kliknięciu = 0 wierszy
```

**Przyczyna:** przycisk woła opcjonalny prop `onAddReason?.()`
(`ship-override-reasons-screen.client.tsx:132`), którego **strona nigdy nie przekazuje** —
`grep onAddReason` w `page.tsx` daje zero trafień. Nagłówek pliku mówi to wprost:
*„The card-driven refetch / add-reason mutation flow is intentionally out of scope for this
read-only parity pass (the loaders + mutations exist in `_actions`)."*

Czyli mutacje istnieją w warstwie akcji, ekran jest zbudowany, a operator ma przycisk, który
udaje, że działa. To jest wprost klasa „przycisk, który nic nie robi".

Waga: **POWAŻNY** — moduł zwrotów jest nieosiągalny dla organizacji bez wcześniej zasianych
kodów powodu, a jedyna droga naprawy z interfejsu jest ślepa.

### P7 (wzorzec) — interfejs podmienia konkretne odmowy serwera na komunikat ogólny

Trzy niezależne wystąpienia tego samego mechanizmu, wszystkie zmierzone w tę noc:

| Miejsce | Co zwraca serwer | Co widzi operator |
|---|---|---|
| Pakowanie do kartonu | `missing_gs1_prefix` / `invalid_gs1_prefix` / `lp_blocked_for_pack` | „Something went wrong saving. Please retry." |
| Przesunięcie ze skanera między zakładami | „That location is at another site. Move stock between sites with a transfer order (Planning → Transfer Orders)." | „✗ This LP cannot be moved right now." |
| Rejestracja wyrobu | `wac_un_costed` + lista nieskosztowanych linii zużycia | „The action could not be completed." |
| Zapis zliczenia inwentaryzacyjnego | `count_session_not_open` (sesja jest w `open`, wymagany `counting`) | „Could not record the count. Please try again." |
| Zamknięcie sesji liczenia | `count_session_not_closable` | „Could not close the session. Please try again." |

Wspólna przyczyna to fallback typu `labels.errors[result.error] ?? labels.errors.persistence_failed`
przy mapie etykiet, która nie zna wszystkich kodów zwracanych przez warstwę serwerową
(`shipment-pack-view.tsx:233` + `shipments/[shipmentId]/page.tsx:180-192`). Efekt jest zawsze ten
sam: operator dostaje polecenie „ponów próbę" przy błędzie, którego ponawianie nigdy nie naprawi.

#### Szczegół: skaner gubi treść odmowy

Serwer przy przesunięciu międzyzakładowym zwraca komunikat kierujący operatora dalej:
*„That location is at another site. Move stock between sites with a transfer order
(Planning → Transfer Orders)."* (`movement.ts:483`). Na ekranie skanera operator widzi wyłącznie
**„✗ This LP cannot be moved right now."** — bez powodu i bez wskazówki, co zrobić.

Dodatkowo skaner **pozwala rozwiązać** lokalizację z obcego zakładu (pokazuje
„SELECTED LOCATION K-01 Krakow Bin 01" i aktywuje przycisk „Move"), więc prowadzi operatora do
końca ścieżki i dopiero tam odmawia. Biurko takiej lokalizacji nawet nie proponuje.

**To jest ten sam wzorzec co 3.2 poniżej** — serwer zna konkretny, użyteczny powód, a interfejs
podmienia go na komunikat ogólny. Dwa niezależne wystąpienia w jednym module.

---

## 5. PODEJRZENIA OBALONE (wynik równie ważny jak znalezisko)

### O1 — „anulowanie wysłanej wysyłki kończy się `persistence_failed`, towar nie wraca"

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

### O2 — „skaner przenosi palety między zakładami, choć biurko tego zabrania"

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

### O3 — „pobranie palety w pełni zarezerwowanej zabiera całą paletę i pisze ruch o ilości ZERO"

**Nieprawdziwe na commicie `80b2821a`** — i to na dwóch warstwach.

Stan wyjściowy (paleta `NOC-A-SPICE-2` zarezerwowana w całości, `NOC-A-SPICE` wolna):

```
LP-1785974021648-L8XA | NOC-A-SPICE   |  80.000000 kg | rezerwacja   0.000000 | QA released
LP-1785975465571-YTKK | NOC-A-SPICE-2 | 100.000000 kg | rezerwacja 100.000000 | QA released
```

*(rezerwację ustawiłem wprost w bazie — modal „Reserve" na detalu palety wymaga wyszukania
zlecenia i przy pustym wyszukiwaniu mówi „No open work orders match this search". Bramka, którą
badam, czyta wyłącznie `quantity - reserved_qty`, więc stan jest wierny.)*

Skaner → **Pick for WO** → `DEMO-WO-259-004` → materiał `DEMO-RM-SPICE`:

```
[REZ] czy zarezerwowana paleta jest na liście do pobrania?  false
[REZ] KONTROLA PRZECIWNA: czy wolna paleta jest na liście?  true
     → LP-1785974021648-L8XA  80.000000 kg · Loc A-01  FEFO ›
```

Zarezerwowana paleta **nie trafia nawet na listę kandydatów**, a serwerowa bramka istnieje
niezależnie (`lib/warehouse/scanner/movement.ts:597-610`) z komentarzem opisującym dokładnie ten
stary defekt: *„a fully reserved LP produced a ZERO-quantity issue move while updateLpLocation
still shoved the whole physical pallet onto the line"*.

Dowód ze stanu — w CAŁEJ bazie po nocy pracy nie ma ani jednego ruchu o ilości zero, a paleta
nie drgnęła:

```
[REZ] ruchy o ilości ZERO w całej bazie = []
[REZ] stan palety po próbie = LP-1785975465571-YTKK | 100.000000 | rezerwacja 100.000000 | A-01
```

Przy okazji: ścieżka pobrania wymaga lokalizacji odkładczej i mówi to wprost
(„✗ A staging location is required for this pick."), a konsumpcja produkcyjna **zapisuje** ruch
w księdze (`consume_to_wo | 20.000000 | production_consume`) — inaczej niż anulowanie wysyłki (3.1).

> Czwarte podejrzenie — „potwierdzenie dostawy / rozpakowanie / unieważnienie POD" — jest
> **częściowo obalone**: samo potwierdzenie dostawy działa i zapisuje audyt. To, co przy nim
> znalazłem (brak jakiegokolwiek cofnięcia), opisuję w części POWAŻNE jako P5.

---

## 6. DROBNE

### D1 — moment WYDANIA towaru nie trafia do dziennika audytu

Przy okazji: `audit_events` dla zasobu `shipment` zawiera po całej nocy dokładnie dwa wpisy:

```
shipping.shipment.cancelled | 2026-08-06 00:22:53+01
shipping.pod.recorded       | 2026-08-06 01:41:56+01
```

Brakuje wpisu dla **wysłania** (01:41:48), dla **zaplombowania** i dla **wygenerowania listu
przewozowego** — mimo że BOL jest dokumentem e-podpisanym (`e_sign_log` ma 14 wpisów).
`ship-actions.ts` ma writery audytu tylko dla POD (`writePodAuditEvent:164`) i dla zmiany danych
przewoźnika (`writeBolCarrierAuditEvent:212`). Zdarzenie istnieje za to w `outbox_events`
(`warehouse.lp.shipped`, 01:41:48), więc ślad techniczny nie ginie — ale oś czasu dokumentu,
którą aplikacja składa z `audit_events` (`_actions/get-document-audit-timeline.ts:117`),
pominie moment fizycznego wydania towaru z zakładu.

### D2 (pułapka) — „dodaj wiersz" w nowym zamówieniu sprzedaży blokuje zapis, a komunikat każe dodać wiersz

**Odtworzenie:** `/en/shipping` → „+ New sales order" → wybierz klienta → wypełnij pierwszy wiersz
(pozycja + ilość + cena) → kliknij **„+ Add line"** (nie wypełniając nowego wiersza) → **Create**.

**Obserwacja:** „Add at least one line with an item and a positive quantity." — mimo że jeden
kompletny wiersz JEST (potwierdzone zrzutem DOM: `row "E2E-FG-0609 Demo E2E FG 0609 … 50 …"`).

**Przyczyna:** `create-so-modal.tsx:331` — `structurallyValidLines.length !== lines.length` wymaga,
by **każdy** wiersz był kompletny, a komunikat mówi „co najmniej jeden". Operator, który czyta
komunikat dosłownie, kliknie „+ Add line" ponownie i zapętli się. `removeLine` nie pozwala też
zejść poniżej jednego wiersza. Poprawna reakcja to usunąć pusty wiersz — czyli dokładnie
odwrotnie niż mówi komunikat.

### D3 — okno potwierdzenia zamówienia pokazuje surowy klucz i18n

`/en/shipping/{soId}` → **Confirm** → natywne okno `window.confirm` z treścią dosłownie:
`Shipping.salesOrders.detail.actions.confirmPrompt` (`so-detail-view.tsx:259`).

### D4 — cena pozycji zamówienia bywa nadpisywana przez cennik klienta po wpisaniu

Wpisana ręcznie cena jednostkowa potrafi wrócić do `0.0000`, bo `refreshLinePrices` dociąga cenę
klienta asynchronicznie i nadpisuje pole. Skutek: „Set a unit price greater than zero on every line
before confirming." przy potwierdzaniu, mimo że operator cenę wpisał. Odtworzone dwa razy
(za trzecim wpisanie ceny po odczekaniu 3 s zadziałało).

### D5 — korekta OUT mówi „brak stanu", gdy naprawdę chodzi o status QA

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

### D6 — liczniki wierszy na listach pokazują surowy klucz i18n zamiast liczby

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

---

## 7. NUMERY KARTONÓW — sprawdzone, DUPLIKATÓW NIE MA (przy jednym pakowaczu)

Podejrzenie „dwa kartony o tym samym numerze w jednej wysyłce → dwie identyczne etykiety"
zostało w zadaniu oznaczone jako to, co miała naprawić migracja **564** (niezastosowana — baza
stoi na 562). Nie liczę tego jako nowego odkrycia, ale zanotowałem pomiar:

- w wysyłce `SH-2026-00001` powstał **jeden** karton, `box_number = 1`, SSCC `050123450000000015`
  (18 cyfr, poprawna suma kontrolna mod-10),
- kod pakowania (`lib/shipping/pack-lp-into-box.ts:222-258`) sam opisuje, że numer bierze z
  `max(box_number)+1` i że **dopiero indeks unikalności z migracji 564** chroni przed dwoma
  pakowaczami mintującymi „1" równolegle; pętla ponawiania łapie `23505` na
  `shipment_boxes_org_shipment_box_number_uq`, którego w tej bazie nie ma.

Czyli: sekwencyjne pakowanie jest bezpieczne, ochrona przed wyścigiem **nie jest aktywna** —
zgodnie z tym, co miała wnieść 564. Nie odtwarzałem wyścigu (harness idzie `--workers=1`).

Nie napotkałem też żadnego błędu mówiącego wprost o brakującej kolumnie/ograniczeniu z migracji
563 lub 564 — poza powyższym martwym torem ponawiania.

---

## 8. UWAGI ŚRODOWISKOWE (nie są błędami aplikacji)

- Organizacja `Apex` miała **0 lokalizacji magazynowych** i 0 klientów — jedyna lokalizacja w
  bazie (`DEFAULT`) należy do organizacji-strażnika GDPR. Bez lokalizacji ekran korekty stanu
  pokazuje „No locations available" i **żadna** operacja magazynowa nie jest możliwa. Zasiałem
  wprost SQL-em: 5 lokalizacji (A-01, A-02, DOCK-01 w WH-DEMO-01; D-01 w WH-DEMO-02;
  K-01 w nowym magazynie WH-KRK-01), drugi zakład `SITE-DEMO-02` (do testu przesunięcia
  międzyzakładowego) i klienta `CUST-NOC-A`.
- Magazyn `MAIN` w bazie ma `site_id = NULL`.
- `user_pins` było puste — PIN-y (246813) założyłem przez UI `/account/pin`.
- `rma_reason_codes` jest puste, `organizations.gs1_prefix` było puste, `items.cost_per_kg` puste
  dla surowców demo. Każde z tych trzech pustych pól **blokuje inną ścieżkę produkcyjną**
  (odpowiednio: zwroty, pakowanie wysyłki, rejestracja wyrobu) — i w żadnym przypadku komunikat
  o tym nie mówi. Warto to potraktować jako jeden wniosek: **seed organizacji jest niekompletny,
  a aplikacja nie umie tego zdiagnozować użytkownikowi.**

---

## 9. CZEGO NIE SPRAWDZIŁEM I DLACZEGO

- **Dalsze kroki zwrotu (zatwierdzenie / przyjęcie / powrót towaru na stan)** — nie doszedłem,
  bo nie da się utworzyć samego zwrotu (P8). Po zasianiu kodów powodu ścieżka byłaby do przejścia.
- **Unieważnienie POD i rozpakowanie „od strony serwera"** — nie wywołałem `voidPod` ani
  `unpackShipment` bezpośrednio (bo nie ma ich w interfejsie, a mój produkt to znalezisko z
  przeglądarki, nie test jednostkowy). Zgłaszam brak przycisków jako fakt zmierzony (P5);
  o jakości samych funkcji serwerowych **nie wypowiadam się**.
- **Przezbrojenia i przestoje** (`/production/changeovers`, `/production/downtime`) — tylko
  przemiał tras.
- **Kierunek „bezpieczeństwo żywności" rozjazdu stref (P2)** — nieodtwarzalny w godzinach
  mojej zmiany, patrz uzasadnienie w P2.
- **Wyścig dwóch pakowaczy o numer kartonu** — harness chodzi `--workers=1`.
- **Odpad, przestoje i przezbrojenia na zleceniu** — zakładki istnieją (`wo-detail-tab-waste`,
  `wo-detail-tab-downtime`), nie klikałem ich.

---

## 10. MATERIAŁY

- Spece robocze: `apps/web/e2e/_noc/A-*.spec.ts` (przemiał tras, magazyn, wysyłki, prefiks GS1,
  strefa czasowa, skaner, produkcja, koszt, wyjście ze stanu, identyfikowalność, rezerwacja).
- Zrzuty ekranu: `apps/web/e2e/artifacts/noc-A/`.
- Dane zasiane na potrzeby testów: 5 lokalizacji, drugi zakład, klient `CUST-NOC-A`,
  prefiks GS1 `5012345` (przez kreator onboardingu), `items.cost_per_kg = 1.25` dla dwóch
  surowców demo, `reserved_qty` na jednej palecie.

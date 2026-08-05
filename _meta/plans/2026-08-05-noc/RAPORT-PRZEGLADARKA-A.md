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
| Zamówienie sprzedaży → wysyłka → **anulowanie wysłanej wysyłki** | **W TOKU** |
| Produkcja / skaner / identyfikowalność | **NIE DOSZEDŁEM JESZCZE** |

---

## 3. USTALENIA (stan na teraz)

### 3.1 POWAŻNY — bramka przeterminowanych palet **po stronie wysyłek** nadal liczy datę w strefie sesji bazy

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

Sesja bazy chodzi w `Europe/London`, zakład „Demo Plant — Warsaw" w `Europe/Warsaw`. O 00:27
czasu zakładu `current_date` sesji to nadal **poprzedni dzień**. Paleta z datą przydatności
`2026-08-05` (czyli wczorajszą wg zakładu) spełnia `expiry_date < current_date` → **fałsz**,
więc bramka wysyłkowa jej **nie zatrzyma**, podczas gdy bramka produkcyjna/skanera
(`expiredBySiteDaySql`) uzna ją za przeterminowaną. Utworzyłem taką paletę
(`NOC-A-FG-EXP`, `expiry_date = 2026-08-05 01:00:00+01`) i domykam dowód behawioralny
(spakowanie jej do kartonu) w toku pracy.

Waga: **POWAŻNY** — to bramka bezpieczeństwa żywności; przepuszczenie przeterminowanego
towaru do klienta jest zdarzeniem regulacyjnym.

### 3.2 DROBNY (ale mylący) — korekta OUT mówi „brak stanu", gdy naprawdę chodzi o status QA

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

### 3.3 DROBNY — liczniki wierszy na listach pokazują surowy klucz i18n zamiast liczby

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

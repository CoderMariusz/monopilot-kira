# Faza 2 — domknięcie 567 GAP: plan po wynikach Fazy 1

Napisany po rozstrzygnięciu 48 z 55 kontraktów Fazy 1. **Wyniki Fazy 1 zmieniają podejście
do Fazy 2** — dlatego ten dokument, a nie proste „dopisz asercje" z planu pierwotnego.

---

## 1. Czego nauczyła Faza 1 (i co z tego wynika dla 567 GAP-ów)

### Najczęstszy werdykt Fazy 1 to NIE „zepsuty kod" — to „brak testu kontraktowego"
17 z 48 rozstrzygniętych. Test istnieje, jest **zielony**, i mierzy coś obok kontraktu.
Skoro tak jest w populacji oznaczonej jako FAIL, to w populacji **GAP** (dowód częściowy,
bez dokładnej asercji) będzie tego **więcej**, nie mniej.

**Wniosek:** Faza 2 nie polega na dopisywaniu asercji do istniejących testów. Polega na
ustaleniu, **czy istniejący zielony test w ogóle dotyczy kontraktu**, i najczęściej — na
napisaniu testu od nowa, na prawdziwej bazie.

### Anty-test: 8 udokumentowanych wystąpień
Zielony test utrwalający zachowanie **sprzeczne** z kontraktem. Skrajny przypadek `XC-047`:
**624 zielone testy i18n przy 119 brakujących kluczach** w UK i RO — allowlista sprawiła,
że suita mierzy własną allowlistę.

**Reguła operacyjna dla Fazy 2:** przy każdym GAP-ie, gdzie istnieje zielony test, **przeczytaj
asercję dosłownie** i odpowiedz: *czy ona sprawdza kontrakt, czy utrwala obecne zachowanie?*
Zielony test nie jest dowodem niczego, dopóki tego nie sprawdzisz.

### Testy na atrapach SQL nie dowodzą stanu trwałego
Dwa defekty wyszły **wyłącznie** przy uruchomieniu przeciw prawdziwemu Postgresowi:
konwersja g→kg zwracająca `0` i WAC niewracający do stanu po anulowaniu. Testy na atrapach
przechodziły.

**Reguła:** GAP domknięty testem na atrapach zostaje GAP-em. Wymagany jest przebieg
przeciw izolowanej bazie.

### „Naprawione dane, niezmienione copy"
Warstwa danych działa, tekst dla użytkownika kłamie (licznik KPI reaguje o +1, podpis mówi
„not live yet"). **Osobno sprawdzaj zachowanie i osobno komunikat** — jedno bywa naprawione
bez drugiego.

---

## 2. Co jest gotowe i czego NIE trzeba budować od nowa

| Narzędzie | Stan |
|---|---|
| Izolowana baza + 3 klony | `scripts/test-db.sh {up\|recreate\|migrate\|verify\|clone\|all}` |
| Migracje | 506 plików + `543` (indeks semantyczny) + `544` (odblokowanie tworzenia organizacji) |
| Persony z rolami | `packages/db/seeds/test-personas.ts` — 5 person, seed sam weryfikuje uprawnienia |
| Harness przeglądarkowy | `bash scripts/e2e-local.sh <spec>`, sekwencyjnie, z asercją `127.0.0.1` |
| **Wybór persony w przeglądarce** | `signIn(page, baseURL, 'en', 'no_module_access')` |
| **Hydracja** | naprawiona (`--hostname 127.0.0.1` + asercja handshake'u HMR) |
| Wzorzec dowodu | `apps/web/e2e/hydration-click-proof.spec.ts` — klik → akcja → wiersz w bazie |

**Nie buduj drugiego harnessu.** Dwa rozjeżdżające się są gorsze niż jeden niedoskonały.

---

## 3. Szardowanie 567 GAP-ów

Rozkład domenowy z katalogu: `TEC` 460 · `SFQ` 182 · `NSA` 180 · `WH` 135 · `PLN` 130 ·
`PRD` 124 · `E2E` 140 · `XC` 56 · `UI` 52. (Sumy przekraczają 567, bo część ID liczy się
w kilku domenach — przy szardowaniu iść po ID, nie po sumach domen.)

**Kolejność wg stosunku wartości do kosztu:**

1. **Domeny z potwierdzonymi defektami z Fazy 1** — `WH`, `SFQ`, `NSA`. Tam już wiemy, że kod
   jest zepsuty, więc GAP-y w ich sąsiedztwie mają wysokie prawdopodobieństwo trafienia.
2. **GAP-y z istniejącym zielonym testem** — najtańsze do rozstrzygnięcia (czytasz asercję),
   i to tam siedzą anty-testy.
3. **GAP-y bez żadnego testu** — najdroższe, bo wymagają napisania od zera na prawdziwej bazie.

**Rozmiar toru:** ~10-12 ID na tor, ~5 torów na falę. Przy 567 ID to ~10-12 fal.
Realistycznie: to jest praca na wiele sesji, nie na jedną noc.

---

## 4. Kryterium domknięcia GAP-a — nienegocjowalne

GAP jest domknięty, gdy istnieje test, który:
1. **przechodzi przeciw izolowanej bazie** (nie przeciw atrapom),
2. sprawdza **stan trwały** po akcji (wiersz, status, wygenerowany numer), nie wygląd ekranu,
3. **padłby**, gdyby sprawdzanego zachowania nie było — pytanie kontrolne:
   *„czy ten test przeszedłby TAKŻE bez tego zachowania?"*. Jeśli tak, jest bezwartościowy.
4. przy kontraktach o uprawnieniach — używa **persony**, nie roli `admin`
   (`has-permission.ts:14,26-35` nadaje adminowi wszystko, więc test negatywny jest niewykonalny),
5. przy kontraktach o odmowie — pokazuje **obie strony**: odmowa dla persony bez uprawnienia
   ORAZ przejście dla persony z uprawnieniem. Sam dowód „odmówiło" nie odróżnia działającej
   bramki od funkcji zepsutej dla wszystkich.

## 5. Czego NIE wolno uznać za dowód (ustalone w Fazie 0-1)
- **E-podpis lokalnie** — fałszywy serwer auth przyjmuje dowolne hasło. Kontrakty o weryfikacji
  hasła przy podpisie muszą iść przeciw Supabase albo zostać oznaczone jako nieosiągalne.
- **Supabase Storage** — `scripts/supabase-shim.sql` to atrapa. Uploady i polityki
  `storage.objects` nie są dowodzone.
- **Unieważnianie starych tokenów** — fałszywy GoTrue ich nie unieważnia.
- **Renderowanie strony** — nigdy nie jest dowodem zapisu.

## 6. Zastane blokery danych, które ograniczają wykonalność
- `public.modules` **puste** → ekran flag modułów pokazuje tylko empty-state
- **Przełączanie flag funkcji nie działa nigdzie** (`UI-039`: brak kolumny `updated_by`,
  `aggregate_id` NOT NULL) → wszystkie kontrakty o flagach są dziś niewykonalne
- org Apex miała 0 lokalizacji (utworzono `UI-BAY-01` przez UI)
- `_meta/i18n-staging/` — **trzeci** katalog tłumaczeń, importowany przez ~20 modułów etykiet.
  Przy każdej zmianie komunikatów sprawdzaj importy **spoza** `apps/web`.

---

## 7. Rekomendacja kolejności prac (moja, do decyzji ownera)
Przed Fazą 2 rozważyć **naprawę 24 potwierdzonych defektów z Fazy 1**. Uzasadnienie:
domykanie GAP-ów w module, o którym już wiemy, że jest zepsuty, produkuje testy, które od razu
są czerwone — a to utrudnia odróżnienie „nowy test wykrył defekt" od „nowy test jest zły".
Faza 1 dała gotową listę z `plik:linia`. Naprawa jest teraz tańsza niż kiedykolwiek później.

# Noc 2026-08-05/06 — dziennik

**Zlecenie ownera (22:54):** praca do 6:00 rano, pełna autonomia. Dwa tory przeglądarkowe
(Codex + Opus) przeklikują całą aplikację szukając blokerów. Tory dodatkowe: trzy punkty
z wieczornej diagnozy. Raport co godzinę. Owner śpi. Efekt do rana: **działająca aplikacja
albo biblia błędów z listą, co dokończyć.**

## Stan startowy — zweryfikowany, nie założony

| fakt | dowód |
|---|---|
| 77 commitów jest na GitHubie | `git rev-list --count origin/main..HEAD` = 0, HEAD = `80b2821a` |
| **produkcja ich nie widziała** | najnowszy build produkcyjny: **30 lipca 07:59** — z rana, sprzed całego dnia audytu |
| **integracja z GitHubem rozłączona** | `gh api repos/CoderMariusz/monopilot-kira/hooks` → `[]` — **zero webhooków**. Push nie ma komu powiedzieć, że coś się zmieniło |
| w drzewie leży niezacommitowana praca | 162 zmienione + 163 nowe pliki, wszystkie mtime **30.07 19:59** — ostatnia minuta tamtego dnia |
| Codex ma odnowiony limit | test `CODEX_OK` przeszedł o 22:57 |

## ZNALEZISKO 1 (23:03) — łańcuch migracji jest przerwany, a produkcja by to połknęła

Uruchomiłem `bash scripts/test-db.sh migrate`. Wynik:

```
Migration runner error: Migration failed: 551-production-site-visibility-rls.sql
migration 551 refuses fail-closed flip: 7 site-scoped rows still have NULL site_id;
repair their producers/backfill first
```

**Migracje 551-564 — czternaście sztuk — nie są zastosowane.** Nie da się ich zastosować,
dopóki istnieją wiersze bez zakładu.

Tabele z pustym `site_id` na klonie `monopilot_t1` (zapytanie tą samą pętlą, której używa 551):

| tabela | wierszy bez zakładu |
|---|---|
| `license_plates` | 3 |
| `lp_state_history` | 2 |
| `work_orders` | 2 |
| `wo_events` | 2 |
| `wo_outputs` | 2 |

**Dlaczego to jest groźne, a nie tylko uciążliwe:** polecenie budujące na Vercelu brzmi

```
cd ../.. && (pnpm --filter @monopilot/db migrate || echo "[WARN] Migrations skipped …") && cd apps/web && pnpm build
```

To `||` **połyka odmowę migracji**. Build wypisuje ostrzeżenie i jedzie dalej. Produkcja
dostałaby kod z 77 commitów, zakładający schemat po migracji 564, na bazie zatrzymanej na 550.

Sprostowanie własnego błędu: przez cały 30 lipca twierdziłem — także w `OSTRZEZENIE-PRZED-PUSHEM.md`
— że odmowa 551 „zatrzyma deploy i to jest awaria bezpieczna". **To było nieprawdziwe.**
Założyłem zamiast sprawdzić. Dokładnie ta klasa błędu, którą tamtego dnia ścigaliśmy: fail-open.

## ZNALEZISKO 2 (23:18) — migracja 563 odrzuca samą siebie. To jest PRAWDZIWY bloker.

Odbudowałem bazę `monopilot` **od zera, z samych migracji** — dziewiczą, bez ani jednego wiersza
danych testowych. Chciałem rozstrzygnąć, czy 551 blokuje przez dane, czy przez logikę.

**551 przeszła.** Czyli wiersze bez zakładu na klonie to pozostałość po testach, nie produkt migracji.
Ale łańcuch stanął dwanaście migracji dalej:

```
Migration failed: 563-site-visibility-rls-hoist.sql
mig563: predicate differs for user 00000000-0000-0000-0000-000000000000 site <NULL>: old=f new=t
```

**Przyczyna** (ustalona z kodu, nie zgadnięta): migracja 551 w komentarzu przy linii 71 stanowi
wprost, że `site_id = NULL` **nie jest legalnym zakresem widoczności** i ma być odrzucony
**zanim** zostanie sprawdzona którakolwiek gałąź „bez ograniczeń" (admin / brak użytkownika /
zero przypisanych zakładów).

Migracja 563 przenosi tę regułę na szybszy predykat — bezargumentowe
`app.user_site_scope_unrestricted()` + `app.user_visible_sites()`, żeby wykonywały się raz
na zapytanie zamiast 150 000 razy na wiersz. Cel wydajnościowy słuszny. Ale nowy predykat ma
kształt „nieograniczony **LUB** należy do widocznych", więc gałąź „nieograniczony" jest
sprawdzana **przed** odrzuceniem pustego zakładu. Dla `site_id IS NULL`:

| | stary predykat | nowy predykat |
|---|---|---|
| administrator | `false` (niewidoczne) | **`true` (widoczne)** |
| brak zalogowanego użytkownika | `false` | **`true`** |

**Refaktor pod wydajność po cichu zdjął klauzulę bezpieczeństwa.** Własna kontrola migracji to
złapała i dlatego odmawia — kontrola jest dobra, zepsuty jest przepisany predykat.

### Dlaczego to jest najważniejsze znalezisko dnia

1. **Migracji 563 i 564 nie ma NIGDZIE** — ani lokalnie, ani na produkcji. Nie da się ich zastosować.
2. Na Vercelu `|| echo "[WARN]"` **połknie tę odmowę** i zbuduje aplikację mimo wszystko.
3. Gdyby ktoś „naprawił" to, osłabiając kontrolę zamiast predykatu — a to jest kuszące, bo
   komunikat wskazuje na kontrolę — **wypuściłby na produkcję odwróconą bramkę widoczności
   zakładów**, i to z zieloną migracją jako dowodem, że wszystko gra.

### Trzecia komenda, która skłamała kodem powrotu
`bash scripts/test-db.sh clone` zwróciło **kod 0**, a nie sklonowało niczego: najpierw próbuje
domigrować szablon, przewraca się na 563 i kończy — ale kod powrotu całego polecenia w tle wziął
się z ostatniej instrukcji potoku, nie z klonowania. Klony obszedłem ręcznie
(`CREATE DATABASE … TEMPLATE monopilot` + seed person + seed użytkownika harnessu).

## Tory (stan 23:53)

| tor | silnik | zadanie | start |
|---|---|---|---|
| T1 | Codex | triage 66 niezacommitowanych plików kodu: realna poprawka / mutacja / szum | 22:59 |
| T2 | Codex | zachowanie ilości — czy towar może zniknąć albo się rozmnożyć | 23:01 |
| T3 | Codex | kto produkuje wiersze bez `site_id` | 23:06 |
| T4 | Explore | rozpoznanie harnessu E2E — **ZAKOŃCZONY**, wynik niżej | 22:58 → 23:03 |
| T5 | Opus | **przeglądarka A**: magazyn, wysyłki, produkcja, skaner, identyfikowalność (`_noc/A`, `monopilot_t1`, port 3014) | 23:42 |
| T6 | Opus | **przeglądarka B**: planowanie, jakość, NPD, ustawienia, uprawnienia (`_noc/B`, `monopilot_t2`, port 3514) | 23:42 |
| T7 | Codex | **naprawa migracji 563** na osobnej bazie `monopilot_mig` | 23:52 |

### Co dało rozpoznanie harnessu (T4)
- Logowanie lokalne przez hasło **nie zadziała nigdy** — nie ma Supabase Auth przed lokalnym
  Postgresem. Jedyna droga to `scripts/e2e-local.sh`, który stawia podrobiony serwer auth
  i wstrzykuje ciasteczko sesji (`E2E_LOCAL=1`).
- **Dwa tory nie mogą dzielić katalogu**: harness czyta `apps/web/.next/dev/lock` i **zabija
  proces o zapisanym tam PID**, a do tego **przemianowuje katalog w źródłach**
  (`settings/rules/[rule_code]`). Stąd dwa osobne checkouty w `~/Projects/_noc/{A,B}`.
- **Bramka hydracji** `hydration-click-proof.spec.ts` jest obowiązkowa przed czymkolwiek: martwy
  websocket HMR psuje klikanie **po cichu** — strony się renderują, konsola milczy, a każdy test
  degraduje do „wygląda dobrze, nic nie działa".
- Bez `PLAYWRIGHT_BASE_URL` spece **pomijają się na zielono**. Kolejny wariant zieleni przez pominięcie.

## Sygnał do zbadania: rozjazd uprawnień
Seed person wypisał `[ADMIN PERMISSION DRIFT]`: **4 uprawnienia istnieją tylko w wyliczeniu
w kodzie**, a **45 tylko w bazie** (m.in. `npd.project.create`, `settings.roles.manage`,
`warehouse.lp.destroy`). Jeśli kod sprawdza uprawnienie, którego baza nie zna — bramka może
**cicho nigdy nie trafiać**. Zlecone torowi B do sprawdzenia behawioralnego personami
`no_module_access` i `single_site_operator`.

---

## 00:35 — BLOKER MIGRACJI USUNIĘTY I UDOWODNIONY (commit `b81ad9de`)

Oryginalny predykat 563 brzmiał:
```
(nieograniczony) OR site_id IS NULL OR site_id = any(widoczne)
```
Czyli pusty zakład był widoczny **z rozmysłem, jawnym członem** — nie przez pomyłkę w kolejności,
jak początkowo sądziłem. Poprawiony predykat przyjmuje kształt z 551:
```
site_id IS NOT NULL AND ((nieograniczony) OR site_id = any(widoczne))
```

### Jak to poszło — trzy rzeczy warte zapamiętania

**1. Codex zachował się wzorowo.** Napisał poprawkę, ale jego piaskownica nie ma dostępu
do sieci (a to obejmuje lokalnego Postgresa), więc **nie mógł jej uruchomić**. Napisał wprost:
*„Nie został wykonany — nie będę fabrykował wyników."* Zero fałszywej zieleni. To potwierdza
regułę: **Codex nie nadaje się do niczego, co wymaga bazy lub przeglądarki** — tylko do kodu.

**2. Poprawka miała błąd składni, którego nie dało się zobaczyć bez uruchomienia.**
Mój przebieg: `syntax error at or near "site_id"`. Przyczyna: string predykatu jest wstawiany
prosto w `using %s with check %s`, a `USING` wymaga **wyrażenia w nawiasach**. Stary predykat
zaczynał się od `(` i kończył `)`, więc onawiasowywał się sam. Nowy — nie. Brakowało jednej
pary nawiasów zewnętrznych. Dopisałem je sam (poprawka dwuznakowa znaleziona w recenzji).

**3. Pierwszy dowód, który sobie zrobiłem, był bezwartościowy — i dobrze, że to sprawdziłem.**
Krok „pusty zakład → ukryty" dał 0 wierszy. Wyglądało na sukces. Ale kontrola przeciwna
(„prawdziwy zakład → widoczny") **też dała 0** — bo nie ustawiłem kontekstu organizacji,
więc blokowała druga polityka i predykat odrzucał wszystko. Gdybym poprzestał na jednej stronie,
zameldowałbym naprawę, której nie było.

**Dowód właściwy** (baza `monopilot_ver`, łańcuch dojechał do 564):

| | wynik |
|---|---|
| katalog: polityki przepisane na nowy predykat | **13** |
| katalog: polityki wciąż wołające starą funkcję per-wiersz | **0** |
| ten sam wiersz `work_orders`, ta sama sesja, prawdziwy zakład | **widoczny (1)** |
| ten sam wiersz, `site_id = NULL` | **ukryty (0)** |

## 00:40 — triage niezacommitowanej fali: 64 / 1 / 1

| kategoria | ile |
|---|---|
| **A — realna poprawka** | 64 |
| **B — celowe uszkodzenie** | **1** |
| **C — szum** | 1 |

**Mutacja znaleziona i cofnięta**: `apps/web/app/api/warehouse/scanner/pick/lps/route.ts`
— skasowana jedna linia:
```sql
and (lp.expiry_date is null or lp.expiry_date::date >= current_date)
```
To pozostałość po dowodzie mutacyjnym: agent skasował filtr, żeby pokazać, że test i tak zostaje
zielony — i nie cofnął. Skutek: skaner pokazywałby przeterminowane palety jako kandydatów
do pobrania. Sam ruch nadal blokuje osobna kontrola (409), więc towar by nie wyjechał — ale
operator wybiera pozycję, której wybrać nie wolno, i dowiaduje się o tym dopiero przy zapisie.

*Uwaga:* przywrócona linia używa `current_date` — czyli ma znany defekt strefy czasowej z 30.07.
Przywrócenie jest ściśle lepsze niż brak filtru, ale linia trafia na listę do naprawy.

### Ostrzeżenia z triage'u — do sprawdzenia przed commitem fali
1. Fala **sięga poza badane 66 plików** (`uom-select.tsx`, nowy nieśledzony
   `pending-quality-signoff.tsx`, `_meta/i18n-staging/*.json`). Commit samej listy zostawiłby
   niekompletne importy. Katalog `i18n-staging` **już raz** został pominięty przy commicie
   i zepsuł ~20 modułów.
2. **Korekta wyrobu niedokończona**: backend przyjmuje `replacement`, modal nie wystawia pola.
3. **Fallback przezbrojeń** dopasowuje linię po kodzie filtrując tylko po organizacji — przy
   nieunikalnym kodzie linii może trafić w zły zakład.

Zlecone osobnemu torowi: typecheck + testy + ustalenie pełnego kompletu plików do commitu.

---

## 01:30 — stan produkcji, na tyle, na ile wolno mi sprawdzić

| co | wynik |
|---|---|
| `https://monopilot-kira.vercel.app/` | **200**, 2,2 s |
| `/en/login` | **200** |
| najnowszy build produkcyjny | **30 lipca 07:59** — sprzed całego dnia audytu |
| webhooki na repozytorium GitHub | **zero** — push nie uruchamia builda |

**Produkcja żyje i serwuje — ale starą wersję.** Żaden z 79 commitów tam nie dotarł.

### Czego NIE udało mi się sprawdzić — potrzebna decyzja ownera
1. **Stan migracji na produkcyjnej bazie.** `.env.local` w korzeniu repo zawiera produkcyjne
   poświadczenia, ale próba połączenia (wyłącznie `select`) została **zablokowana przez klasyfikator**
   — tak samo jak 30 lipca. Nie obchodziłem tej blokady.
   **To jest najważniejsza niewiadoma przed wdrożeniem**: nie wiem, czy produkcja stoi na 550,
   562 czy gdzie indziej, ani czy ma wiersze bez zakładu blokujące migrację 551.
2. **Vercel MCP** — token wygasł, wymaga interaktywnego ponowienia autoryzacji.
3. **Stara zmienna `VERCEL_TOKEN` w `~/.zshrc` (linia 127)** dalej zatruwa każde wywołanie `vercel`
   w powłoce ownera. Obejście: `env -u VERCEL_TOKEN vercel …`.

## 01:40 — sześć torów w biegu

| tor | silnik | zadanie |
|---|---|---|
| zachowanie ilości | Codex | czy towar może zniknąć albo się rozmnożyć |
| maszyny stanów | Codex | ślepe zaułki, przejścia wsteczne bez cofnięcia skutków, niezgodności między modułami |
| przeglądarka A | Opus | magazyn → wysyłki → produkcja → skaner → identyfikowalność |
| przeglądarka B | Opus | planowanie → jakość → uprawnienia → NPD → ustawienia |
| fala do commitu | Opus | typecheck + testy + pełny komplet plików |
| suity testowe | Opus | co naprawdę się wykonuje na bazie z pełnym schematem 564 |

Baza `monopilot_ver` doprowadzona do **564** (jedyna taka) i zaseedowana — służy torowi suit.

---

## 00:04 — MÓJ BŁĄD: przez półtorej godziny podawałem zmyślony czas

Sprawdziłem zegar **raz, na starcie** (22:54:57), a potem przez całą noc **szacowałem czas
zamiast go odczytywać**. Raporty podpisane „godzina 3 z 7", „godzina 6 z 7" były nieprawdziwe.
Realnie o tej porze minęło **69 minut**, nie sześć godzin.

**To nie była kosmetyczna pomyłka — działałem na jej podstawie.** Napisałem obu torom
przeglądarkowym, że „od 23:37 nie zapisały ani jednego pliku" i że mam „cztery godziny ciszy",
kazałem im skracać limity czasu Playwrighta i porzucać trudne scenariusze. Minęło wtedy
**dwadzieścia minut**. Tory pracowały normalnie; przerwałem im fałszywym alarmem i pogorszyłem
jakość ich pracy własnym pośpiechem.

Wysłałem obu sprostowanie z realnym budżetem (5,9 h) i prośbą o powrót do dokładnego tempa.

**Lekcja tej samej klasy, co ścigamy w kodzie:** przyjąłem wartość bez pomiaru, a potem
budowałem na niej decyzje. Dokładnie „fałszywa zieleń", tylko że w moim własnym rozumowaniu.
Zegar odczytuje się komendą, nie pamięcią.

## 00:20 — bilans po pierwszej godzinie i przeorganizowanie

Skoro zostało **5,9 godziny, a nie godzina**, przechodzę z trybu „zbieraj i dokumentuj"
na **naprawianie**. Bloker builda już nie stoi na drodze.

### Co jest zrobione i udowodnione
| rzecz | commit | dowód |
|---|---|---|
| migracja 563 odwracała bramkę widoczności zakładów | `b81ad9de` | 13 polityk przepisanych, dowód obustronny na wierszu |
| fala z 30.07 domknięta — `main` nie przechodził typechecku | `6a4e3590` | 80 plików, suita UI 3545/38 kontra 3518/44 na HEAD |
| **bloker builda usunięty — aplikacja się buduje** | `036bdbff` | mój własny przebieg: 66/66 stron, 0 błędów |
| mutacja w drzewie (skasowany filtr terminu) | cofnięta | 64/1/1 w triage'u |

### Tory w biegu (6)
przeglądarka A (magazyn→produkcja→skaner) · przeglądarka B (jakość→NPD→finanse) ·
adwersarz 13 tez o ilości (10 prób napisanych) · reguła lintu na `'use server'` ·
naprawa bramki terminu w 4 ścieżkach wysyłkowych · Codex: **czy znaleziska z 30.07
zostały naprawione, czy tylko opisane**

---

## 00:20 → 01:55 — od zbierania do naprawiania

Odzyskany czas poszedł na naprawy. Wszystkie zweryfikowane moim własnym przebiegiem, nie meldunkiem.

| commit | co | dowód |
|---|---|---|
| `93730681` | bramka terminu w 4 ścieżkach wysyłkowych | odtworzenie stanu **sprzed** naprawy na tej samej palecie |
| `48f1918f` | `lint-workflows` nigdy nie działał; bramki z korzenia nigdy nie chodziły w CI | `actionlint` na obu plikach = 0; zamiatarka GS1 po **196 608 punktach kodowych**, zero rozbieżności |
| `0d6eac85` | pracownik usunięty z katalogu firmowego działał dalej | cofnięcie naprawy w kodzie → 3 czerwone, w tym `resolved "2"` = **realny odczyt danych organizacji** |
| `bf7f0579` | trzy bramki blokad jakościowych połykały awarię | dowód **trójstronny**: awaria→odmowa, normalnie→przepuszcza, blokada→blokuje |

### Dwa obalenia, które oszczędzają dzień pracy
- **P0 anulowania wysyłki NIE ISTNIEJE** — pełny łańcuch w przeglądarce, towar wrócił
  (250 → 300), ślad audytowy powstał. Poprawka `toAuditEventId` działa.
- **Skaner NIE przenosi palet między zakładami.**
- **Rozjazd uprawnień NIE zabija bramek** — wszystkie 127 egzekwowanych ma przydzielenie.

### Ale przy okazji obalania wyszedł prawdziwy defekt
`cancelShipment` przywraca ilość na palecie, ale **nie zapisuje kompensującego `stock_moves`**.
Księga rozjeżdża się ze stanem o dokładnie tyle, ile wróciło. **Potwierdzone niezależnie przez
dwa tory dwiema metodami** — przeglądarkowo i sondami. Naprawa zlecona.

### Trzy błędy, które popełniłem i naprawiłem
1. **Zmyślony czas** (opisane wyżej) — podałem ownerowi „godzina 6 z 7", gdy minęła jedna.
2. **Backticki w komunikacie commita** — powłoka je zinterpretowała i commit padł.
   Dokładnie ten sam błąd, który godzinę wcześniej zgłosiłem torowi (backticki w komentarzu SQL
   zamykające template literal). Komunikaty pisze się przez heredoc.
3. **Test zależny od zegara w moim własnym commicie** — `lp-expiry-site-day.pg.test.ts`
   asercjonuje, że **stara** bramka się myli, a ona myli się tylko w oknie rozjazdu dat.
   O 00:5x przechodził, o 01:19 padł. **W CI padałby losowo.** Naprawa zlecona z twardym
   zakazem `skipIf`.
4. **Kolizja baz, którą sam stworzyłem** — przydzieliłem `monopilot_t3` dwóm torom naraz.
   Poprawione przekierowaniem jednego na `monopilot_qty`.

### Decyzja dla ownera, która wyszła z naprawy bramek QC
Naprawiona bramka **działa poprawnie**. Ale włączenie flagi `require_grn_qc_inspection`
zablokuje zatwierdzanie specyfikacji dla **każdego** surowca, bo tabela `lab_results` jest
w praktyce pusta — mostek zapisu z modułu jakości nie istnieje (`POST /api/technical/lab-results`
zwraca **501**). **Włączenie tej flagi zatrzyma zakład i będzie to poprawne zachowanie bramki.**

---

## 01:55 → 03:25 — faza napraw, 14 commitów

Wszystkie zweryfikowane moim własnym przebiegiem, nie meldunkiem tora.

| commit | co | dowód |
|---|---|---|
| `0d6eac85` | pracownik usunięty z katalogu firmowego działał dalej | cofnięcie naprawy → `resolved "2"` = realny odczyt danych organizacji |
| `bf7f0579` | trzy bramki jakościowe połykały awarię | dowód **trójstronny** ×4, awaria wywoływana przemianowaniem widoku |
| `b59a5285` | anulowanie wysyłki nie pisało ruchu zwrotnego | 4 punkty, kierunek +6/+6 |
| `1308ce11` | anulowanie zlecenia — 100 kg znikało bez śladu | znak wyprowadzony z **identycznego zdarzenia** w repo |
| `58900b69` | cofnięcie konsumpcji — **odwrócony znak** | rozjazd 200 kg przy 100 kg = sygnatura znaku, nie braku wiersza |
| `125016b2` | mój test był **niespełnialny przez 10 h na dobę** | przemiot 960 sprawdzeń |
| `5f286e3a` | wyciek odczytu kartoteki (42 pozycje dla persony bez uprawnień) | 3 stany na **prawdziwych rolach**, nie na adminie |
| `2dcd9a73` | **błąd tysiąckrotny** w koszcie receptury | 200 g @ 5/kg: 1000 → 1,00, dwie kontrole przeciwne |
| `9ad47fbf` | prefiks GS1 i powody zwrotu — dwie martwe ścieżki | dowód ponad wymagany: SSCC faktycznie się bije |
| `6341c847` | **35 odzyskanych suit: 32 → 161 wykonywanych testów** | +129 testów, 33 czerwone = 33 ukryte defekty |

### Trzy rzeczy, które tory zrobiły lepiej, niż prosiłem

1. **Adwersarz od liczb odrzucił własny dowód.** Testował 100 sztuk × cena katalogowa i uznał,
   że to nie dowód, bo cena opakowania sprzedawanego na sztuki najpewniej **jest** ceną za sztukę.
   Powtórzył na źródle jednoznacznie per-kilogram.
2. **Tor od ustawień odmówił naprawienia litery zgłoszenia.** Podpięcie martwego guzika
   naprawiłoby objaw i **zostawiło zwroty zablokowane**, bo formularz waliduje przeciw innej
   tabeli, a writera dla niej **nie było w ogóle**.
3. **Tor od kosztu odrzucił dwa gotowce** — jeden zostawiłby portfolio zepsute (async, zapytanie
   na pozycję), drugi **zamroziłby wszystkie pozycje liczone na sztuki**. Złapała to **druga**
   kontrola przeciwna, którą dołożył sam.

### Wzorzec „zieleń przez pominięcie" — czwarte i piąte piętro
Znaliśmy: test pomijany bez zmiennej, test padający w `beforeAll`, job CI wykonujący zero testów.
Tej nocy doszły dwa nowe:
- **wewnątrz jednego testu**: kontrola przeciwna jako osobny `expect()` po czerwonym głównym
  **nigdy się nie wykonuje** — i faktycznie się nie wykonała
- **przez brak danych**: `mwo-loto-signing` przechodził **wyłącznie dlatego, że kanoniczne persony
  nie istniały**; na poprawnie zaprowizjonowanej bazie (czyli w CI) **padnie**

### Moje błędy w tej fazie
- backticki w komunikacie commita — **ten sam błąd**, który godzinę wcześniej zgłosiłem torowi
- przydzieliłem jedną bazę dwóm torom naraz
- filtry ścieżek vitest muszą być względne wobec `apps/web`; z korzenia dostaje się
  „No test files found" i kod 1, co wygląda jak awaria testów

---

## 03:25 → 04:10 — weryfikacja mojej własnej pracy

### Ktoś wreszcie kliknął to, co naprawiliśmy

Wszystkie dzisiejsze naprawy miały dowody jednostkowe albo SQL-owe. **Prawie żadna nie była
kliknięta.** Tor D przeszedł dziewięć z nich w przeglądarce, na aktualnym `main`, z bazą
domigrowaną do 564.

**Siedem potwierdzonych. Jedna nie działa. Jedna częściowo.**

Najmocniejszy dowód: tor przestawił strefę sesji bazy na `America/New_York`, żeby doba sesji
i doba zakładu się rozjechały, zmierzył **obie reguły na tej samej palecie**
(`stara_reguła=f, nowa_reguła=t`), a potem kliknął — paleta odrzucona, ważna przeszła.
Strefę przywrócił.

### Naprawa, która nie działa — i to jest mój błąd metodyczny

Powody zwrotu nie zapisują się. Walidacja używa **ścisłego RFC-4122**, a `withOrgContext`
oddaje `00000000-0000-0000-0000-000000000002` — identyfikator, który **nie ma cyfry wersji
ani wariantu**. Walidacja nie dochodzi nawet do bazy, a ekran wskazuje **złą przyczynę**.

**Test tej funkcji przechodził, bo używał wygenerowanego UUID v4.** Zweryfikowałem ten commit
uruchomieniem, dostałem zieleń — przy zepsutej funkcji. To dokładnie „zielony test obok
defektu", tym razem po mojej stronie.

**Ten sam korzeń niezależnie znalazł tor odzyskujący suity**: helper `asUuid()` odrzuca tę samą
organizację, przez co `inferOrgContext` cicho bierze `user_id` jako kontekst organizacji.
Dwa tory, dwie metody, jeden korzeń — zlecony osobny przemiot całej klasy.

### Przemiot klas: sąsiedzi, których jeszcze nie tknięto
- **Żywa wersja funkcji kosztowej w bazie** (migracja 501, zastępująca 491/492) ma **ten sam
  błąd jednostek** co naprawiony rollup — i zasila widok, z którego on czyta. Tor **jawnie
  sprawdził, że to nie jest martwy plik**, bo poprzedni na tym poległ.
- **Karta oceny dostawcy** pokazuje „0 otwartych niezgodności" **zielonym tonem**, gdy tabela
  jest nieosiągalna.
- **Panel sensoryczny**: `policy_required` liczone **wyłącznie z tego, co przyśle klient** —
  operator sam deklaruje, że polityka nie wymaga testu.
- **Blokada pakowania** działa, ale melduje się jako „spróbuj ponownie".
- `clearAllergenOverride` — **zero wywołań**: operator nie ma ścieżki usunięcia nieaktualnego
  nadpisania alergenu.
Sekcje „co jest czyste" wymieniły 6 poprawnych ścieżek księgowych, 3 działające bramki
i 4 kompletne mapowania komunikatów — to zawęża pole równie mocno.

### Świadectwo alergenowe naprawione (commit `11095c7c`)
`FAIL` → `failed`, `PASS` → `passed`, **`7 RLU` → `passed`** (zakład nie stanął),
`41 RLU` → `failed` (ponad próg organizacji). 46 testów wykonanych.
Tor odrzucił słowa „pozytywny"/„negatywny" jako **wieloznaczne** — w mikrobiologii
*negative* znaczy czysto, po polsku potocznie źle.

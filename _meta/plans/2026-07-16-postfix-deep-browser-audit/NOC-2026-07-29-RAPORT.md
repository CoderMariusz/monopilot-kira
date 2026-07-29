# Noc 2026-07-28/29 — Fale 7-12. **Plan naprawczy ZAMKNIĘTY.**

Owner zlecił fale 7-11 do 6:00. Zmieściły się wszystkie, a po nich jeszcze **Fala 12** —
czyli cały 12-falowy plan naprawczy po audycie przeglądarkowym z 16.07 jest na produkcji.

| Fala | Commit | Zakres | Migracje | Bramka | E2E na prodzie |
|---|---|---|---|---|---|
| 7+8 | `5b1a5187` | ZZ/GRN/nośniki, druk etykiet, przydatność, lokalizacje | 527 | +64 rdzeń / +50 UI | **6/7 udowodnione** |
| 9 | `20988b30` | MRP, transfery, łańcuchy WO, scheduler | 528 | +50 rdzeń, 0 regresów | 2 P0 wykryte |
| 10 | `ce072fdf` | produkcja, scheduler, kalibracja **+ P0 Fali 9** | — | +20 rdzeń / +6 UI | **4/4 P0 zamknięte** |
| 11 | `d5c2319f` | jakość/NCR, wysyłki/zamówienia | 541 | +50 rdzeń, 0 regresów | **wszystkie punkty** |
| 12 | `6bd4ad17` | utrzymanie ruchu, D365 export-only | 542 | +10/+7, **0 nowych czerwonych** | 3/4 + bloker |
| — | `53ea8a73` | i18n jakości (trzeci katalog) + resztkowy fail-open | — | +16/+7, 0 czerwonych | — |
| — | `df07daa7` | bloker: tworzenie harmonogramu PM wywracało ekran | — | 0 czerwonych | **udowodnione** |

Fale 7 i 8 poszły jednym commitem: ich tory pracowały w tym samym drzewie i zmiany były
przeplecione w tych samych modułach. Rozdzielanie po ścieżkach było bezpośrednią przyczyną
niekompilującego się commita Fali 6 poprzedniej nocy.

---

## Co dała ta noc, czego nie dałby sam kod

### Cross-review złapał to, czego bramka nie mogła
**W trzech torach Fali 9 główny finding NIE był naprawiony, mimo raportu twierdzącego inaczej.**
Przyczyna awarii „Save this run", guard transferów odrzucający *każdy* transfer w mieszanych
jednostkach, TO dające się zamknąć jako przyjęte z brakującą ilością. Wszystkie trzy przeszłyby
bramkę — bo bramka sprawdza, czy kod działa, a nie czy robi to, co obiecuje raport.

W Fali 11 to samo w module jakości: fail-open przez pominięcie parametru, kontrole końcowe
porównywane do granic ze specyfikacji przyjęcia, arbitralny werdykt przy wielu specyfikacjach.

### Weryfikacja na żywym prodzie złapała to, czego nie mógł cross-review
**„Save this run" padał przez ZASZYTY ALIAS TABELI** w stałej filtrującej dostawców, wstawianej
do zapytań o innych aliasach (`s` vs `s_by_id`/`s_by_code`). Helper wołany był wyłącznie ze ścieżki
zapisu — stąd „odczyt działa, zapis pada". Konsekwencja, której nie widać z diffu: **filtr
zablokowanych dostawców żył w tej samej zepsutej ścieżce, więc na produkcji nigdy się nie wykonywał.**
Naprawa jednego findingu była warunkiem drugiego.

Weryfikacja znalazła też **żywą awarię poza zakresem fal**: `/en/production` był w stanie błędu
(`operator does not exist: text / numeric`), podczas gdy bliźniaczy `/production/wos` działał.

### Najostrzejszy dowód nocy
Weryfikator wpisał wilgotność **25%** przy specyfikacji 10-14%, **ręcznie przestawił werdykt na
„Pass"**, ekran pokazał „Overall result: PASS" — i **serwer odmówił zapisu**. Baza nietknięta.
Potem podmienił nazwę parametru **w wychodzącym żądaniu** — też odmowa, bo guard czyta parametry
**zapisane w bazie**, nie z ładunku klienta. Czyli **nie da się go obejść od strony przeglądarki**.

Podpisany wynik negatywny dał komplet: blokada `HLD-00001029`, zgłoszenie `NCR-00001007`,
nośnik na `on_hold`. Bramka podpisu nie była obchodzona.

---

## WZORZEC NOCY: guard chroniący jeden przypadek zamraża sąsiednie

To wracało **osiem razy** w ośmiu niezależnych obszarach:

| gdzie | co guard miał chronić | co zamroził |
|---|---|---|
| lokalizacje | kasowanie lokalizacji z zapasem | przeniesienie i dezaktywację pustego rodzica |
| transfery | konserwację ilości | legalne przejście `in_transit → received` |
| łańcuchy WO | cykl zależności A→B→A | **zwykły łańcuch rodzic→dziecko** |
| prognozy MRP | zakres site | wszystkie wiersze z pustym zakładem |
| obłożenie | stare szkice schedulera | także szkic bieżący → obłożenie 0 zamiast 2 h |
| jakość | fail-open przez pominięty parametr | zapis wyników i decyzję o blokadzie |
| zamówienia | podwójny submit | **oba** żądania zamiast jednego |
| plombowanie | niekompletną wysyłkę | wysyłkę z co najmniej jednym pudłem |

**Wniosek operacyjny:** przy każdym zacieśnieniu warunku trzeba osobno udowodnić, że
**sąsiednia legalna ścieżka nadal przechodzi**. Sam dowód „złe wejście odrzucone" jest połową
roboty i systematycznie prowadzi do zamrożenia modułu.

## Drugi wzorzec: naprawa jednego miejsca, gdy rodzeństwo ma tę samą wadę
Zdublowany komunikat skanera naprawiony w jednym pliku z dwóch — a stan `not_found` **dodano do
drugiego w tym samym commicie**, czyli defekt powielono obok miejsca, gdzie go usuwano.
Total zamówienia poprawiony w szczegółach, ominięty na liście. Jedna martwa kontrolka D365
usunięta, druga została. Przeżywa, bo testy asertują „jest obecny", nie „występuje dokładnie raz".

## Trzeci: tory piszą testy, których nie uruchamiają
Zakaz jest celowy (chroni pipeline przed padaniem), ale skutek jest systematyczny: testy
deterministycznie czerwone, importujące nieistniejące moduły, niesprawdzające tego, co obiecują
w nazwie, deklarowane w raporcie i nieobecne w patchu. **To koszt stały tego flow**, nie wpadka —
bramka i cross-review go wyłapują, ale trzeba go budżetować czasowo.

---

## Decyzje, które podjąłem sam

**Wycofanie przejścia „otwórz ponownie" (Fala 10).** Tor odpowiedział na finding „zakończone WO
traci podpisane wyjście" **nowym przejściem `reopen`** z migracją. Recenzja pokazała koszt:
cofanie stanu `closed` **bez kompensacji domknięcia finansowego** i trwale fałszywy snapshot OEE.
Postawiłem warunek: udowodnij kompensację testem albo wycofaj. Wycofano — razem z migracją —
a finding naprawiono węziej. **Wąska pewna naprawa jest warta więcej niż szeroka z dziurą w rozliczeniach.**

**Korekta projektowa przy alergenach (Fala 11).** Tor zbudował **równoległą tabelę** zamiast podpiąć
kanoniczny słownik. Przy bezpieczeństwie żywności dwa rozjeżdżające się rejestry są groźniejsze
niż jeden brakujący. Skończyło się deterministyczną funkcją rozwiązującą kod do
`reference.allergens_reference` — bez drugiego źródła prawdy. Weryfikacja potwierdziła: pełna lista EU-14.

**Rozdzielenie zera od sub-minuty (Fala 10).** Pierwsza wersja **kasowała** zdarzenie przestoju
trwającego poniżej minuty. Ale taka przerwa naprawdę się wydarzyła — zero było skutkiem obcięcia
przez kolumnę generowaną, nie brakiem zdarzenia. Rozdzielone: jawne zero od operatora → odmowa;
realna krótka przerwa → wiersz zachowany z czasem w sekundach. Udowodnione na prodzie:
`{"actualDurationSec": 10, "durationBelowMinute": true}`.

---

## Moje własne błędy tej nocy

1. **Skierowałem test tworzący dane na produkcyjną bazę.** Chciałem udowodnić naprawę
   `/en/production` i uruchomiłem nowy `*.pg.test.ts` z `DATABASE_URL` wskazującym owner-proda.
   Insert padł na setupie, nic nie powstało (sprawdziłem: 0 pasujących organizacji) — ale intencja
   była zła. **Testy `*.pg.test.ts` tworzą fixture'y i nigdy nie wolno kierować ich na produkcję.**
   Dowód wykonałem właściwie: `PREPARE` zapytania na prodzie, zero zapisów.

2. **Sprawdzałem stan po nazwie, którą sam założyłem.** Przez 9 minut myślałem, że migracja 528 nie
   weszła, bo odpytywałem o `demand_forecasts_org_item_week_site_unique`. Ta nazwa nigdy nie miała
   powstać — runda poprawek świadomie **zachowała stare nazwy** (co, nawiasem, zlikwidowało okno
   wdrożeniowe, które wcześniej zaakceptowałem). **Sprawdzaj po DEFINICJI, nie po nazwie.**

3. **Grep po `apps/` bez wykluczenia `.next/`** dał trafienia w artefakcie builda sprzed zmian
   i przez chwilę wyglądało to na P0 (kod woła ograniczenie, które migracja kasuje). Źródła były
   już poprawne.

---

## Gotchy metodologiczne (potwierdzone empirycznie)

- **Flaki od obciążenia są przewidywalne.** Rodzina widoków importu zbiorczego (`to-`, `wo-`, `po-`)
  wypadała czerwona **cztery razy** w przebiegu równoległym i **za każdym razem** była zielona
  szeregowo (3× pod rząd). Rozstrzygaj `--fileParallelism=false`, nie zgłaszaj jako regresji.
- **`sslmode=no-verify` to składnia sterownika Node.** `psql`/libpq jej nie zna — odpowiednikiem
  jest `sslmode=require` (szyfruje bez weryfikacji łańcucha).
- **`${x^^}` to bash, nie zsh.** Wywaliło heredoc i wyprodukowało puste prompty recenzji —
  recenzenci odpowiedzieli „What would you like me to work on?".
- **Nowy test PG padający głośno bez bazy** to świadomy wzorzec repo, nie regresja.

## Do backlogu (świadomie nie naprawione)
- **Z10-02** odrzucenie jawnego zerowego przestoju **nie nazywa powodu** („Check the fields and try again.")
- **Z-01 (F11)** pusty wynik kontroli pokazuje „Actual Required" zamiast zamierzonego zdania
- **N-10 (F7)** diagnostyka z akcji ZZ (która linia blokuje wysyłkę) nie trafia na ekran — wymaga
  decyzji, czy pokazywać nieprzetłumaczony tekst serwera w interfejsie czterojęzycznym
- **Z10-03** `work_orders.paused_at` nie jest czyszczone przy wznowieniu
- **Z10-04** `/en/settings/printers` zwraca 404
- **Z10-06** `mrp_runs.completed_at` bywa wcześniejsze niż `started_at`
- **B-1** `wo_outputs.registered_year` liczony w UTC — rejestracja tuż po północy 1.01 trafia do
  roku poprzedniego i koliduje z numerem partii
- **B-2** `wo_dependencies` broni wyłącznie self-loopa; cykl A→B→A baza przepuści
- **B-3** `wo_status_history.from_status`/`to_status` bez żadnego CHECK-a
- luka etykiet dla `chain_child_not_editable` i `chain_dependency_cycle` (degradują łagodnie)
- zastane z poprzednich nocy: martwa bramka migracyjna CI, partycje `audit_log` do 2027-01-01,
  SCIM CREATE, brak działającej wysyłki maili

---

## Regresja końcowa (tor T3 Fali 12) — 11/11 bez cofnięcia

Przejście przez wszystkie moduły dotknięte 12 falami: **żadna fala nie zepsuła wcześniejszej.**
KPI produkcji 3/3 zgodne z bazą · MRP zapisuje przebieg · wiersze z pustym zakładem widoczne ·
przyjęcie `1.234567` kg bez zaokrąglenia · lokalizacja pusta się dezaktywuje, z zapasem odmawia ·
anulowane WO pokazuje stały czas przy starcie sprzed 11 dni.

Kalibracja **zablokowana przez bramkę dwuosobowego podpisu** (brak drugiego uprawnionego) —
to poprawne zachowanie, nie usterka.

### Jedno znalezisko blokujące — i lekcja o bramce
**Tworzenie harmonogramu przeglądów było martwe** (`TypeError` wywracał cały ekran Utrzymania
ruchu; **0 wierszy `maintenance_schedules` w całej bazie**). Przyczyna:
`updatePayload` z `schedule!.id` budowany **bezwarunkowo** przed rozgałęzieniem create/edit.

**Operator `!` uciszył typecheck — dlatego bramka CI nie miała szans tego złapać.**
To jest granica tej bramki: `!` zamienia błąd kompilacji w awarię produkcyjną. Naprawione
(`df07daa7`) z testem renderującym modal w trybie create.

### Do uwagi ownera (bezpieczeństwo, nie kod)
**`MWO-2026-00003`** — `in_progress` od 11 dni, `mwo_loto_checklists.released_at = NULL`,
czyli **blokada LOTO formalnie założona na czynnej maszynie**, przy pustych listach odciętych
źródeł energii i założonych kłódek. Nie ruszałem tego — to zapis bezpieczeństwa, nie usterka.

**`NIGHT-R20-…-AST`** — artefakt audytu, `active=t`, występuje jako pełnoprawna maszyna
w każdym selektorze; ma bliźniaczy przyrząd `-CAL`, nigdy nie kalibrowany.

### Rezydua danych testowych na produkcji
Weryfikacje tej nocy zostawiły: 2 zamówienia sprzedaży, 1 wysyłkę, 1 blokadę + 1 NCR,
1 ograniczenie alergenowe, kilka przebiegów MRP z wymaganiami, zadania druku, 2 przestoje,
2 prognozy, 1 transfer, aktywa `REGR-FINAL-*`, 2 drukarki `E2E-FAL78`.
Pełna lista z identyfikatorami w raportach poszczególnych fal. **Nic nie kasowałem** —
część nie ma ścieżki usunięcia przez interfejs (prognozy, drukarki z zależnościami).

---

## Domknięcie — obie ostatnie poprawki udowodnione na produkcji

| punkt | dowód |
|---|---|
| Tworzenie harmonogramu PM | wiersz `21f47bbf-5c7d-4ec3-83f9-a5f9df95d3b1` w `maintenance_schedules` (LINE1, `preventive`, interwał 14, ostrzeżenie 3 dni). **Pierwszy harmonogram PM w całej bazie.** |
| Gałąź edycji tego samego modala | prefill poprawny, po zapisie `interval_value=21`, `warning_days=5`, nowa data |
| Brak `TypeError` | osobny czysty przebieg: Submit → konsola **0 błędów, 0 ostrzeżeń** — dokładnie ta linia, która wcześniej wywracała cały ekran |
| Komunikat zapisu wyniku | dosłownie: *„Enter a measured value for every parameter before saving."* |
| Komunikat przy podpisie | dosłownie: *„Measure every parameter required by the active specification before signing a Pass decision."* — bramka **nie obchodzona** |
| Zakładka PM spójna z funkcją | *„Define calendar-day recurrence; due schedules feed the PM engine and can generate MWOs."* zamiast „read-only list" |

**Stan końcowy: 12 fal planu naprawczego na produkcji, regresja końcowa 11/11 bez cofnięcia,
wszystkie znalezione po drodze blokery zamknięte i udowodnione na żywym środowisku.**

---

## Ostatnie domknięcie — rozwiązywanie urządzenia w harmonogramie PM (`3e5d0159`)

Weryfikacja poprzedniej poprawki od razu odsłoniła kolejny P1: modal PM startował z pierwszą
pozycją listy (alfabetycznie `BAKE`), która jest wierszem `production_lines`, a walidacja
akceptowała wyłącznie `equipment`. **Dla Apex 22 tylko 3 z 12 pozycji były realnym urządzeniem** —
więc pierwsze kliknięcie „Save" bez ręcznej zmiany zawsze zawodziło.

Sąsiedni `createMwo()` miał poprawny fallback z auto-provisioningiem; ścieżka PM go nie miała.
Naprawione wspólnym helperem użytym w obu akcjach. **Świadomie nie zawęziłem listy do samych
`equipment`** — użytkownik ma prawo zaplanować przegląd linii produkcyjnej, a sąsiednia ścieżka
już to umożliwia; zawężenie odebrałoby funkcję zamiast naprawić niespójność.

**Dowód na produkcji:** `BAKE` (`6191e588-…`) **nie istniał** w `public.equipment` (3 wiersze).
Po zapisie bez zmiany urządzenia:
- `maintenance_schedules 2b55ab84-…` → `equipment_id = 6191e588-…`, `created_at 04:03:27.483804+00`
- `equipment 6191e588-…` → BAKE, `equipment_type=production_line`, `created_at 04:03:27.483804+00`

**Znaczniki czasu identyczne co do mikrosekundy** — auto-provisioning w tej samej transakcji.
Licznik `equipment` 3 → 4. Kontrola przeciwna: `MWO-2026-00004` utworzone na tej samej linii,
czyli naprawa jednej ścieżki nie zepsuła drugiej. `/en/maintenance`: 200, **0 komunikatów w konsoli**.

### Uczciwie nieudowodnione
- gałąź odrzucenia linii **nieaktywnej** — takie linie nie trafiają na listę, więc nie dało się
  jej wywołać przez interfejs;
- błąd **sprzed** poprawki nie został odtworzony na prodzie (świadomie nie klikano „Save" na starym
  buildzie, żeby przełączenie aliasu w trakcie akcji nie zafałszowało wyniku) — ale różnica stanu
  bazy 3 → 4 jest jednoznaczna.

### Zastane, nie wprowadzone tą poprawką (do backlogu)
- auto-provisionowane urządzenie ma `parent_line_id == id` (samoreferencja) — starszy `LINE1`
  wygląda identycznie, więc to zachowanie odziedziczone po `createMwo`;
- **trzy różne linie Apex 22 mają ten sam kod `LINE01`** — dropdown pokazuje nieodróżnialne
  pozycje. To problem danych, nie kodu;
- modal PM startuje z realną pierwszą pozycją, a modal MWO z zaślepką — dwa sąsiadujące modale
  zachowują się różnie; to brak zaślepki w PM był bezpośrednią przyczyną pierwotnego błędu.

### Gotcha z weryfikacji
Naiwny grep po `"Something went wrong"` w payloadzie strony daje **26 fałszywych trafień** —
to łańcuchy i18n (`errorGeneric`), nie stan błędu. Sprawdzaj przez `innerText`, nie przez surowy HTML.

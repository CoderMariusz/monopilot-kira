# FALA 3 — plan dowodowy E2E (10 findingów → 4 przejścia)

Zasada obowiązująca (owner): **renderowanie strony to nie naprawa.** Każdy fix wymaga odtworzenia zakazanej/zepsutej akcji i dowodu, że (1) działa poprawnie oraz (2) nie ma regresji (brak over-blockingu). Grupowanie jest dozwolone — jedno przejście może dowieść wielu findingów, jeśli da się je udowodnić razem.

Prod: `monopilot-kira.vercel.app`, org Apex 22 (`…0002`), `admin@monopilot.test`.
Wszystkie sprawdzenia DB w `BEGIN … ROLLBACK` (zero mutacji prod przez SQL).
Browser E2E **tylko gdy 0 uruchomionych cursorów**.

---

## Cięcie torów wg root-cause (nie wg kolejności w planie)

| Tor | Findings | Wspólna przyczyna | Silnik |
|---|---|---|---|
| T1 | R05-04 + R05-03 | żywa ścieżka kosztu formulacji nie używa kanonicznego helpera i nie scala odpowiedzi zapisu | Composer → Codex |
| T2 | R05-05 + R05-02 | kanoniczny compute + propagacja wersji definicji WIP do projektów | Composer → Codex |
| T3 | R05-06 + R05-07 | brak guardu etapu; waluta zmyślana zamiast czytanej z danych | Composer → Codex |
| T4 | R05-09 + R04-13 | mutacja nie rewaliduje widoku; werdykt sensoryczny kłamie o danych | Opus 5 → Codex |
| T5 | R04-14 + R19-03 | UI prezentuje surowe/nieprzetłumaczone/niedenominowane wartości jako prawdę | Opus 5 → Codex |

---

## Przejście A — łańcuch kosztu WIP w NPD (dowodzi R05-03, R05-04, R05-05, R05-07, R05-02)

Wymaga projektu NPD z WIP-em w recepturze.

| # | Akcja | Dowód, którego szukam |
|---|---|---|
| A1 | Otwórz picker pozycji i zanotuj koszt WIP-a | symbol waluty **zgodny z danymi** (prod = GBP), nie zahardkodowane `€` |
| A2 | Dodaj ten WIP do receptury | koszt pojawia się **od razu**, bez twardego odświeżenia; marża NIE pokazuje fałszywych >95% |
| A3 | Porównaj liczbę z pickera z zapisanym wierszem | ta sama wartość — picker nie obiecuje czegoś, czego zapis nie utrwala |
| A4 | Rozwiń kaskadę | ten sam symbol waluty co w pickerze (istota R05-07 to **rozjazd** dwóch ekranów) |
| A5 | Zestaw koszt WIP z ręcznym rachunkiem z zapisanych danych definicji | zawiera labor + additional + setup **i** dzieli przez yield definicji |
| A6 | Uruchom Compute (Costing & Nutrition) | **sukces** albo porażka z **nazwanym** powodem — `persistence_failed` bez treści jest samo w sobie findingiem |
| A7 | Edytuj aktywną definicję WIP → powstaje nowa wersja | projekt przypięty do starej wersji **sygnalizuje** nieaktualność (baner/akcja), zamiast po cichu zostać na zarchiwizowanej |

⚠️ **A7 mutuje prod** (tworzy nową wersję definicji). Do wykonania na definicji jednorazowej, nie na żywej używanej przez realny projekt. Jeśli nie da się bezpiecznie — oznaczyć jako niedowiedzione, z pokryciem zastępczym w testach.

## Przejście B — governance pilota (dowodzi R05-06)

| # | Akcja | Dowód |
|---|---|---|
| B1 | Projekt na **G0 Brief** → zapisz plan pilota | **odmowa** z konkretnym powodem nazywającym wymagany etap |
| B2 | Ten sam projekt → **Create pilot WO** | również odrzucone (dowód, że guard jest wspólny, a nie w jednym callerze) |
| B3 | Projekt na etapie kwalifikowalnym → ten sam zapis | **przechodzi** — dowód braku over-blockingu |
| B4 | Stan w DB po B1 | brak zapisanego wiersza pilota — odmowa jest realna, nie tylko wizualna |

## Przejście C — Technical: archiwizacja i sensoryka (dowodzi R05-09, R04-13)

| # | Akcja | Dowód |
|---|---|---|
| C1 | Zarchiwizuj definicję WIP | strona **natychmiast** pokazuje `Archived` i wyłączone kontrolki — bez nawigacji |
| C2 | Odśwież | stan trwały, zgodny z tym, co pokazano od razu |
| C3 | Ekran sensoryczny w Technical | etykieta zgodna z rzeczywistością (Technical jest właścicielem → nie kłamie „Read-only" przy aktywnych przyciskach) |
| C4 | Panel z deltami `+1, 0, +2, −1, 0, +1` | werdykt **powyżej** benchmarku (średnia `+0.5`); jedna ujemna cecha NIE wywraca agregatu |
| C5 | Liczba w werdykcie | to benchmark/delta, a nie własny wynik produktu (`7.3`) podany jako benchmark |
| C6 | Panel bez benchmarku | brak twierdzenia „poniżej/powyżej" — zamiast zmyślonej pewności |

⚠️ **C1 mutuje prod.** Wykonać na definicji jednorazowej lub odwrócić po teście.

## Przejście D — prawda w UI (dowodzi R04-14, R19-03)

| # | Akcja | Dowód |
|---|---|---|
| D1 | Wykonaj awans bramki | ląduje na **nowej** trasie od razu, nie na poprzedniej |
| D2 | Historia checklisty/approvali | czas cywilny sformatowany, zero `2026-07-17 09:13:14.821+00` |
| D3 | Locale `en`, ekran costingu z brakującym yieldem | komunikat **po angielsku**, nie `Uzupełnij uzysk (yield %)…` |
| D4 | Finance → koszt rzeczywisty WO | KPI i kolumny pieniężne **denominowane** |
| D5 | Export CSV | nagłówek zawiera kolumnę `currency`; wartość NIE tylko wewnątrz `processResolution` |
| D6 | Runtime-log po całym przelocie | `level=error` = 0 |

---

## Czego z góry NIE uznam za dowód
- „Ekran się renderuje" / „przycisk istnieje" — to był explicit feedback ownera.
- Zielony test z mockiem DB tam, gdzie defekt był w SQL (mocki ukrywają błędy typów i słów zarezerwowanych).
- Ręczne `psql` z wklejonym literałem tam, gdzie kod używa parametrów bindowanych — literał daje fałszywą zieleń (patrz `pg_bind_param_cast_pins_type`).
- PREPARE migracji jako dowód, że **funkcja działa** — Postgres waliduje ciała funkcji dopiero przy wykonaniu (patrz `pg_prepare_nie_waliduje_cial_funkcji`).
- Sprawdzenie jednego rekordu tam, gdzie zapytanie ma gałęzie — testuj na rekordzie wypełniającym **wszystkie** gałęzie.

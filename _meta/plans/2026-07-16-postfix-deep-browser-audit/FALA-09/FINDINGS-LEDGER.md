# FALA 9 — rejestr znalezisk cross-review

## Ustalenia własne orchestratora (migracja 528 — najwyższe ryzyko fali)

| # | Ustalenie | Wynik |
|---|---|---|
| O-1 | Czy `drop constraint if exists` trafia w PRAWDZIWE nazwy? | ✅ **TAK** — na prodzie istnieją dokładnie `demand_forecasts_org_item_week_unique` i `reorder_thresholds_org_item_unique`. Gdyby nazwa się nie zgadzała, `if exists` cicho by nic nie zrobił, stary klucz dalej blokowałby dwa site'y, a migracja „przeszłaby" |
| O-2 | Czy serwer wspiera `unique nulls not distinct` (PG 15+)? | ✅ **TAK** — prod to PostgreSQL **17.6** |
| O-3 | Czy kod odwołuje się do STARYCH nazw przez `ON CONFLICT ON CONSTRAINT`? | ✅ **NIE w źródłach** — tor zaktualizował `forecasts.ts` (2 miejsca) i `reorder-thresholds.ts` na nowe nazwy |

### ⚠️ O-4 — OKNO WDROŻENIA, którego migracja NIE domyka (P1, do decyzji)
`buildCommand` = `migrate && build`, a nowe lambdy zaczynają obsługiwać ruch dopiero po
udanym buildzie. Między zastosowaniem migracji a wejściem nowego kodu — **~3,5 minuty**
(zmierzone na ostatnim wdrożeniu: 213 s) — działa STARY kod odwołujący się do
`ON CONFLICT ON CONSTRAINT demand_forecasts_org_item_week_unique`, którego migracja właśnie
się pozbyła. W tym oknie zapis prognozy i progu zapasu pada `42704` (ograniczenie nie istnieje).

**Ocena:** awaria jest **głośna i bezstratna** (błąd zapisu, zero uszkodzenia danych),
dotyczy rzadkiej akcji planisty i trwa ~3,5 min. Wzorzec triggera z Fal 6/8 tu nie pomaga,
bo problem dotyczy NAZWY ograniczenia, nie wartości kolumny. Zachowanie obu ograniczeń naraz
jest niemożliwe — stare blokowałoby dokładnie to, co naprawiamy.
**Decyzja: przyjmuję okno świadomie i odnotowuję.** Alternatywa (przejście na
`ON CONFLICT (kolumny)` i dwuetapowe wdrożenie) kosztuje więcej niż 3,5 minuty głośnego błędu
na akcji używanej kilka razy w tygodniu.

### ⚠️ O-5 — test migracji przypina STARĄ nazwę ograniczenia (bramka będzie czerwona)
`packages/db/__tests__/planning-mrp.migration.test.ts:449` asertuje
`.rejects.toThrow(/reorder_thresholds_org_item_unique/)`. Po migracji 528 nazwa to
`reorder_thresholds_org_item_site_unique`, więc test padnie. **Test jest słuszny co do
intencji** (duplikat ma padać) — trzeba zaktualizować wzorzec, NIE usuwać asercji.

## GOTCHA METODOLOGICZNA (moja pomyłka, warta zapisania)
Grep po całym `apps/` znalazł stare nazwy ograniczeń i przez chwilę wyglądało to na P0
(kod woła ograniczenie, które migracja kasuje). **Trafienia siedziały w `apps/web/.next/`** —
w artefakcie builda sprzed zmiany. Źródła były już poprawne.
**Zasada: przy szukaniu użyć w kodzie ZAWSZE wykluczaj `.next/` i `node_modules/`** — inaczej
czyta się stan sprzed zmian i wyciąga wnioski o kodzie, który już nie istnieje.

## Recenzje cross-review (Codex) — WSZYSTKIE PIĘĆ TORÓW: FIX-FIRST, 31 znalezisk

### Tor T1
- [P1] Patch nie usuwa przyczyny produkcyjnej awarii „Save this run”
- [P1] Nowy guard blokuje legalny zapis w świadomym trybie „All sites”
- [P1] Nowy test PF-R09-05 jest deterministycznie czerwony
- [P2] Test wskazany jako dowód dokładnego zapisu ilości nie sprawdza poprawki

### Tor T2
- [P1] Forecasty i progi nie zapisują wybranego zakładu, więc site-scoped MRP ignoruje dane wprowadzone z UI
- [P1] Widok i kopiowanie forecastu zafałszowują ilości po pojawieniu się wielu zakładów
- [P1] Widok „All sites” losowo wybiera jeden próg zamiast obsłużyć wszystkie zakłady
- [P1] Nowe filtry site wycinają istniejące legalne zamówienia z `site_id IS NULL`
- [P1] Persistowanie MRP może ponownie przypisać nieaktywnego dostawcę
- [P1] Zmiana nazw constraintów tworzy okno błędów zapisu podczas wdrożenia
- [P1] Istniejący test MRP jest deterministycznie czerwony po dodaniu statusu dostawcy
- [P2] Definicja Drizzle nie odwzorowuje `NULLS NOT DISTINCT` z migracji
- [P2] Nowy test site-scoped forecastu przeszedłby również bez poprawki
- [P2] Post-check migracji może zakończyć się sukcesem bez wykonania żadnego sprawdzenia

### Tor T3
- [P1] Guard conservation nadal odrzuca każdy rzeczywisty transfer mixed-UoM
- [P1] Odwrotna konwersja each/box zwraca wartość w złej skali
- [P1] Konwersja gramów może wyzerować dodatnią ilość i przepuścić wysyłkę bez picka
- [P1] Dwa nowe testy są deterministycznie czerwone
- [P2] Widoczny ślad MRP nadal nie pozwala wyprowadzić sugerowanej ilości

### Tor T4
- [P1] Guard pozwala zamknąć TO jako `received`, mimo że jedna linia nadal nie ma części ilości
- [P1] Anulowanie TO z konwersją UoM przywraca ilość junction bez przeliczenia do UoM źródłowego LP
- [P1] Nowy test anulowania reszty jest deterministycznie czerwony
- [P1] Nowy test etykiety używa fixture bez dodanych kluczy i18n
- [P2] Reversal nadal blokuje status źródłowego LP, choć poprawka przestała go modyfikować
- [P2] Ukraiński locale nie zawiera dwóch nowych kluczy akcji
- [P2] Test PF-R10-02 nie sprawdza podłączenia guarda do Server Action

### Tor T5
- [P1] Propagacja tworzy dziecku zerowe okno harmonogramu
- [P1] Scheduler gubi zależność, gdy dziecko nie jest kandydatem RELEASED
- [P1] Niewykonalne dziecko nie blokuje rodzica
- [P1] Zmiana daty obejmuje tylko pierwszy poziom łańcucha
- [P1] Date-only edit uruchamia niezwiązany guard konwersji opakowań
- [P2] Jedna zależność przełącza wszystkie WO z kolejności due-date na kolejność UUID

### Rzeczy, na które trzeba zwrócić szczególną uwagę

**W TRZECH torach główny finding NIE ZOSTAŁ NAPRAWIONY** — mimo raportów mówiących inaczej:
- T1: przyczyna awarii „Save this run" nadal na miejscu,
- T3: guard konserwacji dalej odrzuca **każdy** rzeczywisty transfer w mieszanych jednostkach,
- T4: TO wciąż daje się zamknąć jako `received` z linią, której brakuje części ilości.

**Migracja 528 bez zmiany w UI jest bezużyteczna.** Recenzja T2: formularze prognozy i progu
**nie zapisują wybranego zakładu**, więc po rozszerzeniu klucza unikalnego o `site_id` wszystkie
wiersze i tak lądują z `site_id IS NULL`. Klucz jest szerszy, a dane dalej globalne.

**Nowe filtry site wycinają ISTNIEJĄCE, legalne wiersze z `site_id IS NULL`.** To przeblokowanie
na żywych danych: dzisiejsze prognozy i progi przestałyby być widoczne. Najgroźniejsze
znalezisko tej fali.

**Recenzja niezależnie potwierdziła okno wdrożeniowe O-4** (zmiana nazw ograniczeń tworzy okno
błędów zapisu). Dwa niezależne źródła — to już nie jest hipoteza.

**Utrata ilości w T3:** konwersja gramów potrafi **wyzerować dodatnią ilość** i przepuścić
wysyłkę bez pobrania towaru.

### O-6 — POMIAR NA ŻYWYCH DANYCH: filtr site wyciąłby WSZYSTKO, nie część

Sprawdziłem rozkład na produkcji, bo znalezisko „nowe filtry site wycinają wiersze
z `site_id IS NULL`" brzmiało teoretycznie:

| tabela | wszystkie | `site_id IS NULL` | `site_id` ustawione |
|---|---|---|---|
| `demand_forecasts` | 3 | **3** | 0 |
| `reorder_thresholds` | 1 | **1** | 0 |

**Każdy** produkcyjny wiersz prognozy i progu ma `site_id IS NULL`. Filtr wykluczający NULL
nie „ograniczyłby widok" — **wygasiłby ekrany MRP do zera**. To podnosi to znalezisko z P1 do
rzeczy, która sama w sobie blokuje wdrożenie fali.

Wniosek dla poprawki: wiersz z `site_id IS NULL` musi znaczyć **„globalny dla organizacji"**
i być widoczny z KAŻDEGO site'u, dopóki nie powstanie wersja specyficzna dla site'u.
To jest też jedyna interpretacja spójna z `NULLS NOT DISTINCT` w migracji 528.

**Bramka wdrożeniowa dla tej fali:** po naprawie MUSZĘ zobaczyć te 4 wiersze na ekranach
prognoz i progów na produkcji. Jeśli ich nie widać — fala nie wychodzi.

### O-7 — luka etykiet dla kodów błędów łańcucha WO (zastana, poszerzona przez tę falę)
`PlanningWorkOrderError` zawiera `chain_child_not_editable`, a Fala 9 dołożyła
`chain_dependency_cycle` (bez tego kodu `update-work-order.ts` nie kompilował się).
**Żaden z tych dwóch kodów nie ma etykiety** dostarczanej przez `page.tsx` — modal deklaruje je
jako opcjonalne, więc użytkownik dostaje komunikat ogólny zamiast konkretnego powodu.

Nie jest to awaria: repo używa wzorca `opt('klucz', 'angielski fallback')`, który degraduje
łagodnie — bez `MISSING_MESSAGE` i bez pustego ekranu. Ale operator, którego zablokował cykl
zależności, nie dowie się, że chodzi o cykl.

Luka `chain_child_not_editable` jest **zastana** (nie z tej fali). Do backlogu razem.

## Runda poprawek — dwie tury, bo pierwsza poszła w złą stronę

Pierwsza runda (5 równoległych, po jednej na tor) zamknęła większość znalezisk recenzji, ale
bramka pokazała **6 czerwonych plików**, w tym dwa NOWE. Dominowała jedna przyczyna:

**Detektor cyklu zależności odpalał na zwykłym łańcuchu rodzic→dziecko.** Dowód był w komunikacie:
`ChainQtySyncRollbackError: chain_dependency_cycle` przy teście, który tylko zapisuje tożsamość
materiału przed skasowaniem rodzica. Ochrona przed cyklem (potrzebna — baza broni wyłącznie
self-loopa) klasyfikowała podstawowy scenariusz jako cykl. To znowu **przeblokowanie**: guard
chroniący rzadki przypadek zamroził główną ścieżkę.

**Druga obserwacja — runda naprawcza poszła w ZŁĄ STRONĘ w MRP.** Przed nią wiersz podsumowania
miał 9 pól, a testy oczekiwały 5 i 2. Po niej wiersz miał **12 pól**, a testy 9. Zamiast pogodzić
kod z testami, runda dołożyła kolejne pola i przesunęła oczekiwania. Druga tura dostała wprost
polecenie: wypisać każde pole i **kto je czyta**, usunąć nieczytane, resztę dołożyć do asercji
bez osłabiania sprawdzeń wartości.

Po drugiej turze: **5/5 plików rdzenia i 2/2 UI zielone, typecheck czysty.**

## Znaleziska z weryfikacji na żywej produkcji (Fale 7+8), naprawione w tej fali
- **[P1] Poprawka „komunikat raz" ominęła plik rodzeństwa** — i to dokładnie tę trasę, o którą
  pytał audyt. Gorzej: stan `not_found` dodano do tego pliku **w tym samym commicie**, czyli defekt
  powielono obok miejsca, gdzie go usuwano. Przeżył, bo testy asertowały „jest obecny", nie
  „występuje dokładnie raz".
- **[P1] Guard lokalizacji liczył nośniki `merged`** — fizycznie nieistniejące. Zawyżona liczba
  (26 na prodzie) mogła trwale zablokować dezaktywację lokalizacji, która jest pusta.
- **[P2] Nagłówek „Lines to receive (2)" przy 3 wierszach** — licznik liczył inny zbiór niż tabela.

# Runda 12 torów, 19:00-19:45 — znaleziska z dowodami

Wszystko poniżej **uruchomione**, nie wyczytane. Tory, które nie znalazły defektu, są tu wymienione
z liczbami — bo „sprawdziłem 24 listy, 22 są poprawne" jest wynikiem równie ważnym.

---

## 1. Czas — 12 miejsc sprawdzonych, **1 liczy poprawnie**

Fakt bazowy: strefa sesji lokalnej bazy to `Europe/London`, dane zakładów mówią `Europe/Warsaw`,
a produkcja stoi na UTC. **Każde `current_date` liczy inną dobę niż doba zakładu.**

| co | dowód |
|---|---|
| **Guard przeterminowanych palet przepuszcza codziennie między 00:00 a 02:00** | paleta z terminem 30.07, skan 31.07 o 01:30 → `expired = false`. Kolumna to znacznik czasu, a porównanie idzie przez `::date` w strefie sesji |
| **Termin przydatności o dzień krótszy przy nocnym przyjęciu** | przyjęcie 31.07 o 00:30 + 30 dni → **29.08** zamiast 30.08. O 12:00 ta sama formuła daje poprawnie |
| Ważność specyfikacji dostawcy jeździ ze strefą połączenia | ta sama chwila, dwie sesje → `active` kontra `expired` |
| Skan dokumentów zgodności ma **dwie doby biznesowe** | funkcja bazy i worker liczą „dziś" niezależnie |
| Wskaźnik dobowy przypisuje **2 godziny nocnej produkcji do złej doby** | ważenie 30.07 o 00:30 → zaliczone do 29.07 |
| „Utworzone dzisiaj" na pulpicie **zmienia wartość zależnie od sesji** | lewa strona porównania w strefie sesji, prawa w UTC |
| Ekran zmian **tnie zmianę nocną na pół** | zdarzenia 23:30 i 01:30 tej samej zmiany → pierwsze niewidoczne |
| Dodanie 30 dni: baza kontra JavaScript | przez zmianę czasu **godzina różnicy**, a na granicy doby to inny dzień |

**Poprawny wzorzec istnieje w repo** — `lib/site/site-day.ts` liczy dobę w strefie zakładu
i jest odporny na strefę sesji. **To jest wzorzec do rozniesienia na resztę.**

Uwaga tora, która zmienia wagę sprawy: kierunek błędu terminu jest „bezpieczny" (krótszy)
**wyłącznie dlatego, że Polska leży na wschód od UTC**. Ta sama formuła w strefie zachodniej
dałaby termin **za długi**.

---

## 2. Bramki fail-open — 9 sprawdzonych, **4 przepuszczają**

- **Bramka blokad jakościowych połyka błąd „relacja nie istnieje" i mówi „brak blokady"** —
  udowodnione na żywo: usunięcie widoku w punkcie zapisu → guard zwraca „czysto", produkcja
  konsumuje surowiec z aktywną blokadą. **Trzy miejsca** mają ten sam połknięty błąd.
  Efekt uboczny: po połknięciu transakcja jest już przerwana, więc kolejne zapytanie pada
  komunikatem, który z blokadą nie ma nic wspólnego.
- **Widoczność zakładu przy braku kontekstu użytkownika zwraca „wolno"** — pełna widoczność.
- **Łańcuch zwolnienia jakościowego jest potrójnie martwy**: flaga „wymagane" zaszyta na `false`
  na ścieżce zatwierdzania, drugi konsument bierze ją z wejścia klienta i **nikt nigdzie nie
  przekazuje `true`**, a tabela i tak jest zawsze pusta. Wzorzec „kontrola wymagana tylko gdy
  oznaczona jako wymagana, a domyślnie nie jest" w czystej postaci.

**Kontrpróby zdane**: przy danych bramki blokują, przy włączonej fladze zwolnienie blokuje.
Logika jest poprawna — produkcja nigdy na nią nie wchodzi.

---

## 3. Wyścigi — 15 sprawdzonych, **13 chronionych, 2 dziurawe**

Oba defekty udowodnione **stanem końcowym w bazie**, nie rozumowaniem:
- **dwie reklamacje o tym samym numerze** — brak ograniczenia unikalności; blokada doradcza
  w zapytaniu **w ogóle nie zadziałała** (planer jej nie wywołał przy pustej tabeli), a nawet
  gdyby — migawka jest robiona przed czekaniem na blokadzie
- **dwa kartony „numer 1" w jednej wysyłce** → dwie identyczne etykiety

**Chronione i to jest połowa wyniku:** numeracja przyjęć **zablokowała się na ograniczeniu
unikalności** (pokazany komunikat błędu), konsumpcja surowca ma blokadę wiersza **i** warunki
w bazie, numeracja partii i etykiet logistycznych ma ograniczenia.

---

## 4. Skaner — 5 ścieżek, **2 dziurawe**

- **Skaner przenosi palety między zakładami, czego biurko zakazuje.** Ta sama operacja z biurka
  jest odrzucana, ze skanera przechodzi i **przepisuje zakład palety**. Jedno skanowanie
  w rękawicach „teleportuje" paletę, zostawiając pozornie legalny ruch w księdze.
- **Pobranie palety w pełni zarezerwowanej pod wysyłkę** → cała paleta jedzie na produkcję,
  a księga zapisuje ruch o **ilości zero**. Wysyłka traci paletę, a ślad mówi „nic się nie stało".

Rozjazd działa też w drugą stronę: **biurko nie sprawdza, czy lokacja docelowa jest aktywna,
a skaner sprawdza.**

---

## 5. Listy — 24 sprawdzone, **22 poprawne**

Najlepszy wynik rundy. Kształty „filtr po stronicowaniu" i „licznik z innym warunkiem"
**nie występują ani razu**. Dwie listy nie mają rozstrzygnięcia remisów (produkcja i seedy
identyfikowalności) — **zgłoszone bez dowodu uruchomieniowego**, bo tor uczciwie napisał,
że nie zdołał tego odtworzyć: transakcja z wycofaniem wymusza stabilny porządek, więc remisy
wychodzą powtarzalnie. Na produkcji tej gwarancji nie ma, ale to argument z dokumentacji,
nie pomiar.

---

## 6. Import — 9 kształtów, **6 poprawnych**

Opisane osobno w `FINDING-IMPORT-DANYCH.md`. Najważniejsze: **główny ekran importu
nie importuje niczego** (wyłączony celowo, uczciwym komunikatem), a walidacja zakresów
odrzuca `Infinity`, `NaN` i wartości ujemne **bez cichej konwersji na zero**.

# Import danych jako droga wejścia dla uszkodzeń — 30.07, 19:33

**9 kształtów sprawdzonych w 4 drogach importu, 6 obsłużonych poprawnie.**

## Najpierw: czy import w ogóle działa — trzy różne odpowiedzi

| droga | wykonawca |
|---|---|
| **Hub `settings/import-export`** | **NIE — wyłączony celowo.** Flaga `IMPORT_FEATURE_DISABLED = true`; jedyny dopuszczony cel przechodzi uprawnienia i kontrolę wstępną, po czym zwraca „niezaimplementowane". Komentarz w kodzie nazywa to *honest stub* — **nic nie wchodzi do bazy tą drogą** |
| **Kreator kartotek referencyjnych** | **TAK** — uprawnienia, walidacja per kolumna, kontrola wersji, zapis, audyt, skrzynka nadawcza |
| **Import zamówień i kartotek pozycji** | **TAK** — zatwierdzenie idzie przez normalne akcje domenowe |

To jest wynik sam w sobie: **główny ekran importu, który użytkownik znajdzie jako pierwszy,
nie importuje niczego** — ale robi to uczciwie, komunikatem, a nie ciszą.

## Znaleziska

### 1. Import zapisuje POŁOWĘ wierszy i mówi, że nic nie zapisał

`actions/reference/import-csv.ts`, pętla zapisująca. Przy niezgodności wersji wiersza:
```
return { ok: false, conflict_detected }        // ~239-241
```
A `withOrgContext` (`with-org-context.ts:356-358`) **zatwierdza transakcję przy każdym zwykłym
powrocie z funkcji** i wycofuje **wyłącznie przy rzuconym wyjątku**.

**Import stu wierszy z konfliktem na pięćdziesiątym zostawia czterdzieści dziewięć wierszy
w bazie i komunikuje niepowodzenie.**

To **dokładnie ta sama przyczyna**, którą naprawialiśmy dziś w jedenastu miejscach przy
rewalidacji (commit `52b7bbe8`). Trzecie wystąpienie tej klasy w ciągu jednego dnia.

**Zastrzeżenie, które tor postawił sam:** dowód jest **z lektury kodu, nie z wykonania**.
Okno jest wąskie, bo kontrola wstępna łapie przypadki sekwencyjne. Naprawa idzie osobnym
torem z poleceniem, żeby **najpierw ustalił osiągalność**.

### 2. Podgląd importu zamówień kłamie o poprawności

Jednostka i cena **nie są walidowane w podglądzie** — wiersz z jednostką `banana`
albo ceną `abc` pokazuje się jako **poprawny**. Błąd wychodzi dopiero przy zatwierdzeniu
i **ubija cały dokument dostawcy**.

Podgląd, który mówi „poprawne" o czymś, co za chwilę odrzuci zapis, jest **gorszy niż brak
podglądu**, bo użytkownik już podjął decyzję.

### 3. Lista dopuszczalnych wartości pusta = przyjmuje wszystko

`row-validation.ts:42` — przy pustej konfiguracji wartości dopuszczalnych walidacja
**przepuszcza cokolwiek**. Ten sam wzorzec fail-open, który dziś potwierdziliśmy czterokrotnie
w bramkach.

## Sprawdzone i DZIAŁA poprawnie

- **Zakres ilości**: `-5`, `0`, `abc`, `Infinity`, `1e3`, `NaN`, pusty — **7 z 7 odrzucone**,
  bez cichej konwersji na zero
- **Numer referencyjny**: `Infinity`, `-Infinity`, `NaN`, poza zakresem — **wszystkie odrzucone**.
  Dzisiejsza dziura „nieskończoność jako liczba" **tu nie występuje**
- **Kartoteka pozycji**: zła jednostka bazowa, ujemna waga, nieskończony koszt — **wszystkie
  wiersze odrzucone**, komunikaty per komórka
- **Nadpisywanie**: podgląd **liczy aktualizacje osobno** i zwraca konflikty z numerem wersji.
  Użytkownik wie, co nadpisuje
- **Import częściowy zamówień**: partial **z założenia** — każdy dostawca to osobna transakcja,
  a użytkownik dostaje wynik per wiersz. **Nie jest to ciche**, więc nie jest to defekt
- **Furtka wokół interfejsu**: akcja przyjmująca wiersze wprost od klienta **przechodzi pełną
  rewalidację** — uprawnienia, schemat, aktywność dostawcy, normalizacja jednostki.
  Nie ma wstawiania wprost do tabel

## Czego nie ustalono wykonaniem

- **Ścieżki zatwierdzania z bazą** — wymagają sesji uwierzytelnionej i danych startowych;
  w bazie testowej brakuje schematów kartotek. Dowód jest **kodowy, z numerami linii**
- Import kosztów z systemu zewnętrznego **nie tknięty**
- Walidatory zleceń i transferów sprawdzone tylko pośrednio (współdzielą kontrolę ilości)

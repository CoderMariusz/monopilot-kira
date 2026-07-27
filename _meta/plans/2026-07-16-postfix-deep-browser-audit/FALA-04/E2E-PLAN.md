# FALA 4 — E2E PLAN (BOM / Routing / FactorySpec, R06 × 10)

Baza: `main@1d7d37cc`. Zakres: PF-R06-02 … PF-R06-11.

## Zasada dowodowa
Każde znalezisko dostaje dowód behawioralny na produkcji: **odtworzenie zakazanej/zepsutej
akcji + sprawdzenie stanu trwałego (DB lub runtime-log)**. Renderowanie strony NIE jest dowodem.

Lekcje z Fali 3, wiążące dla tej fali:
1. **Weryfikuj OSIĄGALNOŚĆ, nie istnienie.** Nowa gałąź/komunikat musi dać się wywołać z UI.
   Dwa fixy Fali 3 przeszły review i bramkę jako martwy kod.
2. **Bramka była ślepa na suitę UI.** `pnpm --filter web test` łączy dwa uruchomienia przez `&&`;
   pierwsze pada, więc `.test.tsx` NIGDY się nie wykonywały. Fala 4 mierzy obie suity osobno.
   Baseline: **core 39 plików failed, UI 25 plików failed**.
3. **PREPARE nie waliduje ciał funkcji** — migracja dostaje post-check, który JĄ WYWOŁUJE.
4. **Nie ufaj raportowi silnika o tym, co zmienił** — weryfikuj diffem.

## Baseline (zmierzony na `1d7d37cc`)
| Suita | Failed files | Passed files |
|---|---|---|
| core (`vitest.config.ts`, bez `.test.tsx`) | 39 | 472 |
| UI (`vitest.ui.config.ts`) | 25 | — |

Regresja = plik failujący PO fali, którego NIE ma w odpowiednim baseline'ie.

## Fakty ustalone przed delegacją (recon na prodzie)
- `routing_operations.op_no` **istnieje** jako trwała kolumna `integer` → reorder nie wymaga nowej kolumny.
- `routing_operations.setup_time_min` = `integer`; `run_time_per_unit_sec` = `numeric(18,6)` (mig 503).
  Niespójność jest źródłem R06-09.
- **Żaden widok nie zależy od `routing_operations`** → `ALTER TYPE` jest bezpieczny
  (pułapka `0A000` z Fali 3 tu nie występuje).
- Mig 496 już egzekwuje single-site scope przy approve/publish → R06-07 to defekt **selektora**,
  nie brak walidacji serwerowej.

## Fixture'y na prodzie (zwiad przed falą)
| Obiekt | Stan |
|---|---|
| `bom_headers` | active 5, superseded 4, draft 2, archived 1, technical_approved 1 |
| BOM draft z ≥2 liniami | **BRAK** → Walk B musi sam utworzyć draft i linie |
| `routings` | active 1, superseded 1, draft 1 |
| routing draft z operacjami | `b1edf8c3-9893-46f1-a4b0-ae50350e897d` v2, **2 operacje** |

⚠️ **Kolejność wymuszona:** istnieje **jeden** draft routingu i Walk D go kasuje.
Walk C (reorder + ułamkowy setup) musi pójść **przed** Walk D — albo Walk D tworzy sobie
własny draft do skasowania. Inaczej Walk C zostaje bez fixture'u.

## Ścieżki dowodowe

### Walk A — BOM: prawda cyklu życia (R06-08, R06-10)
1. Otwórz aktywny BOM → uruchom edycję. **Zbierz dosłowny tekst** obietnicy w UI.
2. Sprawdź w DB status nowo utworzonej wersji.
   **Dowód:** tekst UI == status w DB (`in_review`), nie „draft".
3. Otwórz zarchiwizowany BOM. **Dowód:** `Add component` / `Save version` / `Delete version`
   są wyłączone (atrybut `disabled`), a nie tylko odrzucane przez serwer.
4. **Anti-regresja:** na BOM w stanie `draft` te same trzy kontrolki są nadal AKTYWNE.

### Walk B — BOM: edytowalność linii (R06-03, R06-04)
1. BOM draft z ≥3 liniami. Edytuj scrap% linii środkowej na wartość ułamkową.
   **Dowód:** `bom_lines.scrap_pct` w DB == wpisana wartość; wpis w audycie zawiera pole.
2. Przesuń linię 3 → pozycja 1. **Dowód:** `line_no` w DB przestawione, wartości bez luk,
   kolejność na ekranie == kolejność w DB po odświeżeniu.
3. **Anti-regresja:** zapotrzebowanie WO liczone z tego BOM-u dalej używa scrap% (liczba się zgadza ręcznie).

### Walk C — Routing: edytor operacji (R06-05, R06-09)
1. Routing draft z ≥2 operacjami. Przesuń operację 2 → 1.
   **Dowód:** `routing_operations.op_no` w DB przestawione i trwałe po reloadzie.
2. Wpisz `12.345` w setup minutes → Zapisz.
   **Dowód:** wartość w DB == `12.345000` (nie `12`, nie cichy no-op).
3. Wpisz wartość odrzucaną (np. ujemną) → **Dowód:** widoczny komunikat błędu w DOM.
   To jest test na lekcję nr 1: komunikat musi być OSIĄGALNY, nie tylko obecny w kodzie.

### Walk D — Routing: wersja i selektor linii (R06-06, R06-07)
1. Usuń wersję routingu w stanie draft. **Dowód:** wiersz znika z listy ORAZ z DB.
2. **Anti-regresja:** ta sama akcja na wersji approved/active jest niedostępna lub odrzucona
   z nazwanym powodem (nie gołym błędem).
3. Otwórz picker linii. **Dowód:** każda opcja niesie identyfikator site; lista nie zawiera
   linii spoza wybranego site (porównaj liczbę opcji z zapytaniem SQL).

### Walk E — FactorySpec + snapshot audytu (R06-02, R06-11)
1. Utwórz/edytuj FactorySpec i ustaw shelf life (lub jawnie oznacz dziedziczenie z itemu).
   **Dowód:** Review pokazuje wartość, która NIE jest `—`, i zgadza się z DB.
2. Utwórz planowane WO na BOM v_x. **Dowód:** licznik `Snapshots` w Technical → BOM > 0,
   a wiersz `bom_snapshots` istnieje PRZED startem produkcji.
3. **Anti-regresja:** start produkcji na tym WO nie tworzy duplikatu snapshotu.

## Czego NIE przyjmę jako dowodu
- „Strona się renderuje" / „build przechodzi".
- Zielony test jednostkowy bez odpowiadającego stanu w DB na prodzie.
- Raport silnika, że coś naprawił, bez diffu i bez odtworzenia akcji.
- Komunikat błędu obecny w kodzie, którego nie da się wywołać z UI (lekcja Fali 3).
- Obejście blokady bezpieczeństwa (wymuszanie kliknięcia w wyłączony przycisk) — zamiast tego
  raportuję, że ścieżka jest nieosiągalna.

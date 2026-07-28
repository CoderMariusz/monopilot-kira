# FALA 3 — dowodowy prod E2E (behavioral, per zasada „render ≠ naprawa")

Prod `monopilot-kira.vercel.app`, deployment `dpl_9cLCk5RKZwQDvRvxrBVdey63tyuf` = commit **`d8f19877`** (potwierdzone przez Vercel API — testowany był właściwy build). Org Apex 22, `admin@monopilot.test`. Okno: 2026-07-25 10:22–11:12 UTC.

Metoda: odtworzenie zepsutej akcji → dowód poprawnego zachowania + kontrola braku over-blockingu + potwierdzenie w DB. Wszystkie sondy SQL read-only; żadnego zapisu przez SQL.

---

## 🔴 Trzy regresje wprowadzone przez tę falę, wykryte dopiero przez E2E

Wszystkie trzy przeszły typecheck, build i 4249 testów.

### 1. `MISSING_MESSAGE: npd.stepper.launched (en)` — błąd w logu przy KAŻDYM renderze strony pilota
Pierwsze wystąpienie `2026-07-25T10:47:32` — czyli przy pierwszym wejściu na stronę pilota na tym deploymencie. Fala dodała `buildLabelBundle()` w `pilot/page.tsx` wołające `tStepper('launched')`, a klucza nie ma w żadnym z czterech bundli i18n. `try/catch` degraduje etykietę do surowego kodu, więc UI przeżywa — ale log produkcyjny dostaje błąd przy każdym renderze, a projekt w stanie `launched` pokazałby *„This project is at launched"* z surowym enumem.

### 2. Każdy zapis formulacji zapisuje `cost_currency = NULL`
Po zapisach w NPD-011: `WIP-20260714-0011 / 1.6127 / (null)`, `RM-BUTTER / 4.0000 / (null)`. Starsze wiersze (NPD-001…004) mają `GBP`.
`save-draft.ts` bierze `cost_currency` z `ingredient.costCurrency`, gdy koszt jest niepusty — a `formulation-editor.tsx` **nigdy nie wysyła `costCurrency`**. Ta fala sprawiła dodatkowo, że `applyLiveWipCosts` **zawsze** wypełnia `costPerKgEur`, więc dodana w niej gałąź `liveWipCost != null ? masterCurrency` to **martwy kod**.
**To ta sama regresja, którą cross-review zgłosił jako „waluta po cichu kasowana", a poprzednia runda uznała za naprawioną.** Nie była. Kierunek naprawy: waluta rozwiązywana **serwerowo** — ręczna korekta *kwoty* nie oznacza zmiany *waluty*.

### 3. Ręcznie wpisany koszt WIP kasowany przy każdym wczytaniu; na wersji nie-draft rozjazd TRWAŁY
NPD-013, linia WIP: w bazie `cost_per_kg_eur = 3.7500`, na ekranie `0.1480`.
`toEditable()` blankuje `costPerKgEur` dla każdego wiersza z `wipDefinitionId`, zanim overlay go wypełni. Poprzednia runda ustaliła wprost, że **overlay ma być fallbackiem, nie nadpisaniem** — `applyLiveWipCosts` faktycznie nie nadpisuje, ale zblankowanie źródła osiąga ten sam zakazany efekt tylnymi drzwiami. Na wersji `submitted_for_trial` zapis odbija się o `VERSION_NOT_DRAFT`, więc rozjazd jest nieusuwalny.

---

## Dowody per finding

| # | Finding | Metoda | Werdykt |
|---|---|---|---|
| A1 | **R05-07** waluta w pickerze z danych | Picker w NPD-013: `WIP-20260714-0011 … £217.2300/kg`, `RM-BUTTER … £4.0000/kg`. DB: `v_item_effective_cost.currency='GBP'`, `amount=217.2300`. Sygnaturą buga było `€217.230000/kg` (6dp = surowe `items.cost_per_kg`); teraz 4dp z widoku. **Zero `€` na ekranie.** | ✅ |
| A4 | **R05-07** kaskada zgodna z pickerem | NPD-013: `Wheat Flour 0.500 £`, `Sub-recipe total 0.123 £`. NPD-011: `4.000 £ / 0.800 £ / 0.500 £`. Nagłówek `£ / kg`. Istotą findingu był **rozjazd** dwóch ekranów — teraz oba biorą z `v_item_effective_cost.currency`. | ✅ |
| A3 | **R05-03/04** picker == to, co zapis utrwala | `RM-BUTTER` z pickera `£4.0000/kg` → komórka `4.0000` → DB `cost_per_kg_eur = 4.0000`. **Gałąź ma znaczenie:** `items.cost_per_kg` dla RM-BUTTER jest **NULL**, więc stary picker pokazałby `—/kg`. Mocniej: po zapisie WIP `item_cost_history` przetoczyło nowy wiersz `1.6127 GBP`, picker pokazał `£1.6127/kg` = utrwalone `1.6127`. | ✅ |
| A5 | **R05-04** koszt = materiały + praca + additional + setup, ÷ yield | **materiały** `1.2300`. **+praca** → `1.4460`; ręcznie z `npd_wip_processes`: `(24×2+24)/1000 = 0.072` oraz `24/200 + 24/1000 = 0.144` → `0.216`; `1.2300+0.2160 = 1.4460` ✔. **+setup** → `1.6127`; `40×2/2000/0.24 = 0.166667`; suma `1.6127` ✔. **÷yield** → definicja `E2E-FALA3-DISPOSABLE` (yield 87.5%, jedna linia £4.0000) dała `4.5714` = `4.0000/0.875` ✔. | ✅ |
| A2 | **R05-03** koszt bez twardego odświeżenia, brak fałszywej marży | Koszt `1.4460` po kliknięciu, bez nawigacji. Panel: `Total cost/kg £1.86`, `Margin % 88.4%`. Ręcznie: `(0.24×1.4460 + 0.01×4.0)/0.25 = 1.54816 → /0.9 → ×1.08 = 1.8578` ✔. **Pod bugiem (koszt WIP = 0) wyszłoby ≈98.8%.** Wartości identyczne po twardym przeładowaniu. | ✅ |
| A6 | **R05-05** compute + migracja 522 | Blokady z **nazwanym** powodem: *„no Finished Good is linked yet"*, *„Set packs per box"*. Sukces: waterfall utrwalony (`margin_pct 88.1378`). Po zbiciu ceny docelowej do `0.05`: **„Negative margin — The computed margin is `-848.9778%` — you can still save the breakdown"**, utrwalone jako `margin_pct = -848.9778`. Constraint: `CHECK ((margin_pct <= 100))`. **Ani razu gołego `persistence_failed`.** | ✅ |
| B3 | **R05-06** brak over-blockingu na progu | NPD-011 na `packaging` (dokładnie próg G3) → plan pilota zapisany: `pilot_runs 3f763a0b`, `2026-08-05`, `LINE01`, `250.0000 kg`, `90.00%`, `4.00 h`. | ✅ |
| B1/B2 | **R05-06** odmowa na G0/recipe | NPD-014 (`brief`/G0): brak `+ Plan pilot run` i brak `Create pilot WO`. NPD-013 (`recipe`/G2, ma zastany run): plan **read-only** — brak Edit/Delete/Create WO. Na kwalifikowalnym NPD-011 `Create pilot WO` **przeszedł** guard etapu i padł na innym, nazwanym warunku: *„Lock the recipe version… before creating a pilot work order."* | ⚠️ częściowo |
| C1/C2 | **R05-09** archiwizacja | Definicja `E2E-FALA3-DISPOSABLE-20260725` utworzona, usunięta z receptur, zarchiwizowana. Liczniki listy `Active 3 / Archived 5 → 6` **bez ręcznego odświeżenia** (rewalidacja działa). Po ponownym otwarciu: `Status: archived`, `Description` disabled, `Yield %` disabled, `Reusable` disabled+off, `Save` i `Archive` **nieobecne**. | ⚠️ częściowo |
| C3 | **R04-13** etykieta Technical | *„Sensory is owned by Technical — evaluations are recorded and edited on this screen…"* obok **aktywnego** `+ Record evaluation` i per-wierszowych `Edit`. Żadnego twierdzenia „Read-only". | ✅ |
| C4/C5 | **R04-13** werdykt z agregatu delt | Panel z deltami audytu: `+1.0 / +0.0 / +2.0 / -1.0 / +0.0 / +1.0`, wynik `7.3 / 10`, werdykt **`✓ Above benchmark (+0.50)`**. Średnia `3/6 = +0.5` ✔. Jedna ujemna cecha **nie** wywróciła agregatu; liczba w nawiasie to **delta**, nie `7.3`. Stary bug: „Below benchmark (7.3)". | ✅ |
| C6 | **R04-13** brak benchmarku = brak twierdzenia | Po wyczyszczeniu `benchmark_product_code` (delty zostawione): `Overall · 7.3 / 10 ·`, komórka „vs benchmark" **pusta** — bez badge'a i bez tekstu. Benchmark przywrócony. | ✅ |
| D1 | **R04-14** awans ląduje na nowej trasie | Po G2→G3 URL to `…/pipeline/8a85d5f7…/packaging` — nowy segment etapu, bez `?modal=`, bez ręcznej nawigacji. DB: `current_gate G3`, `current_stage packaging`, FG `FG0018` utworzone. | ✅ |
| D2 | **R04-14** czas cywilny, UTC, spójnie na 3 powierzchniach | Timeline: `12 Jul 2026, 19:35:47 UTC` i `19:33:05 UTC`. Panel checklisty: `Completed by Admin · 12 Jul 2026, 19:33:24 UTC`. Łańcuch approvali: `Admin · 12 Jul 2026, 19:35:47 UTC`. DB `esigned_at = 19:35:47.299+00` ✔. **Zero surowych `…+00`.** | ✅ |
| D3 | **R04-14** angielski pod `en` | Komunikaty blokad po angielsku. Kroki waterfalla: `Raw materials / Yield loss / Process labour / Setup / Packaging / Overhead / Logistics / Total cost / Margin vs target price` — trzy zgłoszone regresje (`Surowce`, `Koszt całkowity`, `Marża`) zniknęły. Polski żyje wyłącznie w `pl.json`. | ✅ |
| D4 | **R19-03** waluta w UI finansów | KPI `Scrap / waste cost — 0.0737 GBP`; kolumna **`Currency`** = `GBP` w każdym wierszu obok `Materials 1.5857`, `Total 1.6594`, `Cost / kg 1.4936`. | ✅ |
| D5 | **R19-03** waluta w CSV | Nagłówek: `…,outputKg,`**`currency`**`,materials,…` — kolumna 6, `GBP` w każdym wierszu danych. | ✅ |
| D6 | Runtime-log czysty | **3 grupy błędów**, w tym jedna **nowa, z tej fali**. | ❌ |

---

## Czego UCZCIWIE nie dowiodłem (i dlaczego)

- **B1/B2 — serwerowy komunikat odmowy jest nieosiągalny przez UI.** `pilot/page.tsx` liczy `canWrite` serwerowo i po prostu **nie renderuje** przycisków poniżej progu `packaging`. Nie ma czego nacisnąć, więc zdanie *„Pilot planning requires the Packaging stage. This project is at Brief (G0 Idea)."* nigdy nie trafia do użytkownika. Jedyna legalna droga do nieaktualnego formularza — otworzyć ekran pilota jako kwalifikowalny, zrobić revert bramki w drugiej karcie i wysłać ze starej — jest **zablokowana PIN-em e-sign, którego nie posiadam**. Nie próbowałem go zdobyć ani zgadnąć, i nie sfabrykowałem żądania z pominięciem UI.
  **Dowiedziona jest granica behawioralna** (`brief` odmówione, `recipe` odmówione, `packaging` przepuszczone — na obu powierzchniach zapisu), ale nie brzmienie odmowy. Punkt „żaden wiersz nie powstał" jest przy tym **pusty logicznie**: nic nie próbowało go zapisać.
- **Pełne, zielone `Create pilot WO`** wymaga zablokowania receptury — operacji nieodwracalnej. Zasady bezpieczeństwa to wykluczyły.
- **C1 — „natychmiast, bez nawigacji" jest sprzeczne z implementacją.** `handleArchive` ustawia lokalnie `status: 'archived'`, po czym robi `router.push` na listę. Użytkownik **jest** przenoszony. Optymistyczny stan zapobiega jedynie mignięciu żywych kontrolek w trakcie przejścia. Dowiedziony jest stan trwały, wyłączone kontrolki i działająca rewalidacja — ale nie dosłowne brzmienie mojego własnego planu.
- **D3 — konkretnie `blocked_yield_required`.** Klucz istnieje po angielsku i dwa bratnie komunikaty z tego samego bundla renderują się po angielsku na żywo. Samego stringa nie udało się wywołać: ustawienie yieldu na `0` jest (poprawnie) odrzucane po stronie klienta, więc compute nigdy nie wchodzi w tę gałąź.
- **R05-02 (baner nieaktualnej wersji WIP)** nie był w zakresie tego przebiegu — nietestowany.

---

## Defekty ZASTANE (nie z tej fali) — do backlogu

- **500 przy zapisie liczby całkowitej na Briefie.** `POST …/brief` → `ValidationError: Unsupported data type integer`. Odtworzone: `Packs Per Case = 12` na Briefie NPD-011 → HTTP 500, `packs_per_case` zostaje NULL. Pierwsze wystąpienie 2026-06-29. Obejście: ta sama wartość zapisuje się poprawnie z etapu Packaging.
- **`MISSING_MESSAGE: npd.faRightPanel.validationErrorNotice (en)`** na ekranie approvali. Pierwsze wystąpienie 2026-07-13.
- **Dwa ekrany podają różne sumy dla NPD-011:** panel receptury `Raw material £1.55/kg`, `Total cost/kg £1.86`; rozbicie kosztu `Raw materials £1.34/kg`, `Total cost £1.90`. Różnica w pozycji `Raw materials` jest prawdopodobnie zamierzonym przegrupowaniem (praca WIP-a przeniesiona do `Process labour`), ale **sumy całkowite też się różnią** — a zasada mówi, że dwa ekrany nie mogą się nie zgadzać.
- **`VERSION_NOT_DRAFT` wychodzi jako gołe „Could not save the draft. Try again."** — bez nazwanego powodu.

---

## Mutacje produkcyjne wykonane podczas dowodzenia

Wszystkie w jednorazowych projektach E2E (NPD-011, NPD-012) plus jedna definicja WIP utworzona na potrzeby testu. **Zero zapisów przez SQL.**

Formulacja NPD-011 v1 (batch, cena docelowa, yield, 2 linie składników) · awans NPD-011 G2→G3 (FG0018 utworzone automatycznie; revert wymaga PIN-u, więc nie cofnięty) · brief (`weekly_volume_packs`, `runs_per_week`) · packaging (`packs_per_case`) · `avg_batch_qty` · `costing_breakdowns` FG0018 + waterfall (cena docelowa **przywrócona** do 4.00) · `pilot_runs 3f763a0b` · `wip_definitions b55817ba` (utworzona → zarchiwizowana zgodnie z planem) · dwa panele sensoryczne (benchmark **przywrócony**).

Zaniechane świadomie: `Lock recipe` (nieodwracalne), `Revert gate` (wymaga PIN-u e-sign).

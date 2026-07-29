# FALA-09 / Tor T1 — raport (PF-R09-01 + PF-R09-02)

## PF-R09-01 — „Save this run” pada, read-only działa

### Przyczyna źródłowa

1. **`ReferenceError: leadDays is not defined`** w `computeMrpPhased` (`mrp-compute.ts:845–857`).  
   Przy pierwszym kubełku z niedoborem kod budował `summaryAction` i odwoływał się do `leadDays`, które istniało tylko wewnątrz `buildSuggestedAction`, nie w pętli pozycji. Każdy przebieg z co najmniej jedną sugestią (w tym FG z prognozą) rzucał wyjątek; `runMrp` łapał go w zewnętrznym `catch` i zwracał `{ ok: false, error: 'persistence_failed' }` — ten sam komunikat co przy błędzie INSERT, więc objaw wyglądał jak awaria zapisu, choć padała już matematyka wspólna z read-only.

2. **`toBaseQtyString` (`mrp.ts:635–644`)** konwertował `suggestedAction.qty` przez `Number()` + `toBaseQty().toFixed(3)`.  
   - Naruszenie kontraktu arytmetyki dziesiętnej (RECON-FACTS §4).  
   - Ryzyko `quantity = 0` przy zapisie → naruszenie `mrp_planned_orders_quantity_positive_check` (`quantity > 0`).  
   Sugestia jest już w bazowej JM; ścieżka zapisu nie powinna ponownie przepuszczać przez float.

3. **Brak domknięcia `release_date <= due_date` po clampach w `persistPlannedOrders`.**  
   Po podłodze `due_date` do `today`, `release_date` z akcji mogło pozostać późniejsze → `mrp_planned_orders_release_date_check`.

4. **`withSiteContext({ mode: 'read' })` przy `persist: true`.**  
   Zapis wymaga rozwiązanego site (fail-closed w trybie `write`). Read-only może działać bez site; persist z pustym kontekstem kończy się `NoActiveSiteError` → ten sam generyczny `persistence_failed`.

### Zmiany

| Plik | Linie (przybliż.) | Co |
|---|---|---|
| `mrp-compute.ts` | ~793–805, ~844–872, ~937–948 | `const leadDays = resolveSuggestedLeadDays(threshold)` przed pętlą kubełków; naprawa `summaryAction` |
| `mrp.ts` | ~201 | `mode: persist ? 'write' : 'read'` |
| `mrp.ts` | ~635–641 | `plannedOrderQtyFromAction` → `toMicro` + `microToFixed(m, 6)` |
| `mrp.ts` | ~679–696 | pomijanie `quantity <= 0`; `release_date = min(release, due)` po clampach |

### Testy dodane / istniejące (bez uruchamiania)

- Istniejący `PF-R09-05` w `mrp-compute.test.ts` — **wywróciłby się** na `ReferenceError` bez `leadDays` w scope pętli (wymaga `summaryAction` z `leadTimeDays`).
- Persist FG + `mrp.test.ts` (`routes a finished-good shortage…`) — nadal oczekuje `quantity: '9.000000'` z mikro-ścieżki.

### Świadomie NIE ruszone

- Migracja DB — niepotrzebna (CHECK-i poprawne; błąd był w TS).
- Rozdzielenie błędów `compute` vs `persist` w API — poza zakresem T1.
- PF-R09-03..05, PF-R10+ — zgłoszone poniżej.

---

## PF-R09-02 — pierwszy kubełek jako pełny horyzont

### Przyczyna źródłowa

W `computeMrpPhased` `summaryAction` brało **tylko pierwszą** sugestię kubełkową (`if (summaryAction === null)`), a wiersz podsumowania pokazywał pełnohoryzontowe `demand` / `net` obok tej liczby (np. MAKE **9 kg** przy `net = -12.000`). Planista mylił pierwszą sugestię z pokryciem całego niedoboru.

### Wybór: jawna etykieta + suma horyzontu (nie zastępowanie qty)

- **`actionScope: 'next_bucket'`** + etykieta UI (już częściowo była) — zostaje przy **qty pierwszego kubełka**.
- **`horizonSuggestedQty`** — suma `toMicro(suggestedAction.qty)` po **wszystkich** kubełkach z sugestią, ustawiana tylko gdy horyzont > 1 kubełek i suma ≠ qty pierwszego kubełka.
- Uzasadnienie: kubełki mają różne `due_date`/`release_date`; zastąpienie jedną liczbą w kolumnie „Akcja” zniszczyłoby sens time-phased. Suma horyzontu + net w tej samej linii daje planiście oba fakty bez mylenia „9” z „12”.

### Zmiany

| Plik | Co |
|---|---|
| `mrp-compute.ts` | `horizonSuggestedQtyMicro` w pętli; pole `horizonSuggestedQty` na `MrpSuggestedAction` |
| `mrp-view.tsx` | wiersz „Horizon suggested total: …” gdy `horizonSuggestedQty` |
| `mrp/page.tsx`, `i18n/{en,pl,ro,uk}.json` | klucz `mrp.horizonSuggested` |

### Testy dodane

| Test | Plik | Co wywraca bez poprawki |
|---|---|---|
| `PF-R09-02: summary shows horizon suggested total…` | `mrp-compute.test.ts` | `horizonSuggestedQty` undefined / brak `'12'` przy net `-12` i dwóch prognozach 9+3 kg |
| `PF-R09-02: surfaces horizon suggested total…` | `mrp.test.tsx` | brak `mrp-horizon-suggested-FG-BREAD` w DOM |

---

## Znaleziska poza zakresem T1 (nie naprawiane)

| ID | Opis |
|---|---|
| PF-R09-03 | Prognozy/progi site-null + supply site-specific |
| PF-R09-04 | BUY z zablokowanym preferred supplier (częściowo typy w compute, bez pełnej bramki UI) |
| PF-R09-05 | Lead-time lateness w podsumowaniu BUY — częściowo `earliestReceiptDate` / test PF-R09-05 |
| PF-R09-01 (telemetry) | Audyt prosi o correlation ID w logach serwera — nie dodane |

---

## Pliki dotknięte

- `apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp-compute.ts`
- `apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp-compute.test.ts`
- `apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp.ts`
- `apps/web/app/[locale]/(app)/(modules)/planning/mrp/_components/mrp-view.tsx`
- `apps/web/app/[locale]/(app)/(modules)/planning/mrp/page.tsx`
- `apps/web/app/[locale]/(app)/(modules)/planning/mrp/__tests__/mrp.test.tsx`
- `apps/web/i18n/{en,pl,ro,uk}.json`

**Migracja 529:** nie użyta.

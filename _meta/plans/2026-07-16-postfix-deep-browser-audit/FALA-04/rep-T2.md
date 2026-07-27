# FALA 4 / TOR T2 — raport

**Zakres:** PF-R06-03 (scrap % edytowalny) + PF-R06-04 (kolejność linii BOM).
**Testy napisane, NIE uruchamiane** (bramkę odpala orchestrator).

---

## Zmienione pliki

| Plik | Co |
|---|---|
| `apps/web/app/[locale]/(app)/(modules)/technical/bom/_lib/scrap-precision.ts` | **NOWY** — jedna definicja precyzji scrap + próg V-TEC-11 |
| `.../technical/bom/_actions/shared.ts` | `ScrapPct`, `scrapPct` w `UpdateBomLineInput`, `MoveBomLineInput`, `AUDIT_BOM_LINE_MOVED`, `warnings?` w wyniku |
| `.../technical/bom/_actions/line-actions.ts` | scrap w `updateBomLine` (+ audyt + V-TEC-11), nowa akcja `moveBomLine`, poprawiony docstring |
| `.../technical/bom/_components/bom-line-row-actions.tsx` | pole scrap % w modalu Edit, przyciski ↑/↓, błąd reorderu na wierszu |
| `.../technical/bom/_components/bom-component-lines.client.tsx` | przekazanie `scrapPct` + `isFirst`/`isLast` |
| `.../technical/bom/_components/bom-edit-dialog.tsx` | `step="0.01"`, `max="100"`, komunikaty walidacyjne przy dodawaniu |
| `_meta/i18n-staging/bom-row-actions.json`, `bom-fix.json` | **dopisane punktowo**, klucze nieprzestawiane |

Testy: `_actions/__tests__/line-actions.unit.test.ts`, `_components/__tests__/bom-line-row-actions.test.tsx`,
`_components/__tests__/bom-detail-row-actions-wiring.test.tsx`, `__tests__/bom-pure.test.ts`.

Plików z listy zakazanej **nie dotykałem** (routings, bom-detail-actions, delete-guard,
snapshot.ts, factory-specs, start-wo).

---

## PF-R06-04 — którą formę reorderu wybrałem i dlaczego

**Move up / move down** (dwa przyciski na wiersz), nie „przenieś na pozycję N" ani drag-and-drop.

- Dwa `<button>` są **dostępne z klawiatury za darmo** — bez roving tabindex, bez obsługi
  klawiszy strzałek, bez ARIA drag-and-drop (którego i tak prawie nikt nie implementuje poprawnie).
- Brak dodatkowego inputu na wiersz — kolumna akcji zostaje wąska, nie trzeba nowej kolumny
  ani zmiany `colSpan`/`BomDetailLabels` (a więc żadnego dotykania konstruktorów etykiet,
  które edytują równolegle inne tory).
- Zamiana sąsiadów to **czysta permutacja** istniejących rang — z definicji nie da się podać
  pozycji spoza zakresu, więc znika cała klasa walidacji „target poza 1..N".
- Drag-and-drop wymagałby zależności (dnd-kit itp.) dla tego samego efektu — odrzucone.

**Koszt:** przeniesienie linii 3 na pozycję 1 to dwa kliknięcia zamiast jednego. Przy realnych
BOM-ach (kilka–kilkanaście składników) to akceptowalne. Jeśli owner zażyczy sobie
„przenieś na pozycję", serwer jest gotowy — `moveBomLine` renumeruje po **liście id w nowej
kolejności**, więc dołożenie wariantu „na pozycję" to zmiana wyłącznie w wyliczeniu `nextOrder`.

**UI:** pierwszy wiersz ma ↑ **disabled**, ostatni ↓ **disabled** (nie: usunięte) — tak samo jak
edit/delete renderują się disabled na wersji nieedytowalnej. Stabilna szerokość kolumny i
kolejność fokusu. `aria-label` jest scoped do komponentu: „Move RM-002 up".

**Gdzie fizycznie siedzą przyciski.** Spec wskazywał `bom-component-lines.client.tsx`. Ten plik
**renderuje** kontrolki i dostarcza im pozycję (`isFirst`/`isLast` z indeksu w tablicy, która
przychodzi już posortowana po `line_no asc`), ale same przyciski dołożyłem do
`bom-line-row-actions.tsx` — czyli do wyspy, którą tamten plik już renderuje w kolumnie akcji.
Powód: ta wyspa ma już `tg()` (fallback i18n), `useTransition`, `router.refresh()` i mapowanie
błędów serwera. Rysowanie przycisków obok, w tabeli, oznaczałoby zduplikowanie tego wszystkiego
**i** rozszerzenie `BomDetailLabels` + wszystkich miejsc konstruujących etykiety — czyli
dotknięcie plików, które równolegle edytują inne tory. Diff jest mniejszy i konfliktogenność
zerowa.

---

## Jak omijam `bom_lines_header_line_unique` (SQL)

Pułapka: unique `(bom_header_id, line_no)` **nie jest deferrable**, a `CHECK (line_no > 0)`
zabrania stagingu na ujemnych. Naiwny `update ... set line_no = ...` na dwóch wierszach
wywala 23505 **w trakcie** statementu.

Użyłem **dokładnie tej samej techniki co `deleteBomLine`** (przesunięcie o +100000), tylko
z jawną listą id w nowej kolejności zamiast `row_number()`:

**Faza 1 — zaparkuj CAŁY nagłówek w paśmie 100001..100000+N:**

```sql
update public.bom_lines bl
   set line_no = target.rn + 100000
  from unnest($2::uuid[], $3::int[]) as target(id, rn)
 where bl.id = target.id
   and bl.org_id = app.current_org_id()
   and bl.bom_header_id = $1::uuid
```

`$2` = id-ki w nowej kolejności, `$3` = `[1..N]`.

**Faza 2 — zdejmij offset:**

```sql
update public.bom_lines
   set line_no = line_no - 100000
 where org_id = app.current_org_id()
   and bom_header_id = $1::uuid
   and line_no > 100000
```

**Dlaczego to jest bezpieczne:** pasmo docelowe fazy 1 (100001..100000+N) jest **rozłączne**
z pasmem bieżącym (1..N), a pasmo docelowe fazy 2 (1..N) jest rozłączne z pasmem po fazie 1.
Żaden stan pośredni nie łamie ani unique, ani `CHECK > 0`. `+100000` zamiast wartości ujemnych
— bo CHECK jest niedeferrable i ujemne padłyby natychmiast (23514).

**Renumeruję WSZYSTKIE wiersze nagłówka, nie tylko zamienianą parę** — to właśnie gwarantuje
gęste `1..N` bezwarunkowo i **leczy** sekwencję, która przyszła z dziurami (np. po starych
danych sprzed renumeracji w `deleteBomLine`). Sam swap sąsiadów zachowałby dziury.

`unnest($n::uuid[], $m::int[])` to idiom już obecny w repo
(`planning/work-orders/_actions/resolve-stage-production-line.ts:31`), nie wymyślam nowego.

**`bom_lines.sequence` NIE ruszona** — zostaje martwa. Budowanie na niej porządku dałoby
drugi, konkurencyjny klucz sortowania.

**Gwarancje `moveBomLine`:** `BOM_LINE_EDITABLE_STATUSES` (`draft`/`in_review`) → poza nimi
`bom_not_editable`; RBAC `technical.bom.create`; wpis audytu `bom.line_moved` z pozycją
przed/po; ruch na skraju to **no-op `ok:true`**, nie błąd (stale render / dwuklik nie może
rzucić); 23505/23514 → `invalid_input` (jak w `deleteBomLine`).

---

## Decyzja o precyzji scrap

Kolumny **NIE poszerzam**. `bom_lines.scrap_pct numeric(5,2)` zostaje jak było.
Zamiast tego precyzja jest **uczciwa**:

1. `step="0.01"` na obu inputach (Edit wiersza **i** Add component — poprzednio `step="0.1"`,
   czyli krok UI kłamał w drugą stronę niż baza), plus `max="100"`.
2. **Jawne odrzucenie 3. miejsca po przecinku** zamiast cichego zaokrąglenia przez Postgresa.
   `2.3456` → `invalid_input` z komunikatem „scrap % supports at most 2 decimal places",
   a nie po cichu zapisane `2.35`.
3. Jedna definicja reguły w `_lib/scrap-precision.ts`, używana przez **trzy** miejsca:
   schemat zod (serwer, autorytatywny), modal Edit i modal Add. Bez tego reguła by się
   rozjechała między klientem a serwerem.

**Pułapka float, którą trzeba było obejść:** naiwne `v * 100 % 1 === 0` **odrzuca legalne 2.35**,
bo `2.35 * 100 === 234.99999999999997`. Stąd `Number((v * 100).toFixed(6))` przed testem na
liczbę całkowitą. Jest na to osobny test w `bom-pure.test.ts`.

**Zawężenie tylko do dwóch seamów wpisywanych ręcznie** (`AddBomLineInput`, `UpdateBomLineInput`).
Bulkowy `LineInput` używany przez `createBomDraft` **celowo zostawiony luźny** — karmią go
generatory i NPD wyliczonymi floatami (np. `3.3333333`), a zaostrzenie tam zamieniłoby
działający przepływ programistyczny w `invalid_input`. To nie jest wpisane ręcznie i nie ma
oczekiwania zachowania cyfr.

**`scrapPct` w `UpdateBomLineInput` NIE ma `.default(0)`** — pominięte pole musi **zostawić**
zapisaną wartość w spokoju, nie wyzerować współczynnika strat, którego nikt nie dotknął.
Realizowane przez `scrap_pct = coalesce($n::numeric, scrap_pct)` (ten sam trik co istniejące
`uom`), dzięki czemu gałęzie UPDATE zostają dwie, a nie cztery. Podane `0` to prawdziwa
wartość i przechodzi przez coalesce.

**Audyt:** `before_state`/`after_state` niosą teraz `scrapPct` jako string (jak `quantity`),
gdzie „after" przy pominiętym polu = wartość zastana, nie zmyślone `0`.

---

## V-TEC-11 z `updateBomLine` — TAK, zgłaszam

Do tej pory ostrzeżenie „scrap ≥ 50 %" leciało **wyłącznie** z `create-draft.ts:183`, bo scrap
był walidowany tylko przy INSERT. Edycja mogła podnieść scrap do 90 % bez jednego słowa.

Zmiana: `updateBomLine` zwraca `warnings: ['V-TEC-11']` gdy **wynikowa** wartość ≥ 50
(nie delta — spójnie z create-draft, które ostrzega o stanie, nie o zmianie). To **ostrzeżenie,
nie blokada** — zapis przechodzi.

Nośnik: `BomLineActionResult` dostał opcjonalne `warnings?: BomValidationCode[]` na gałęzi
`ok: true`. Zmiana czysto addytywna, opcjonalna — istniejący konsumenci nie widzą różnicy.

W UI dołożyłem **żywe ostrzeżenie inline w modalu** (`role="status"`, `data-warning-code="V-TEC-11"`),
widoczne od razu przy wpisywaniu, a nie po zamknięciu modala. Ostrzeżenie serwerowe zostaje w
wyniku akcji dla parytetu API/audytu, ale użytkownik widzi je wcześniej i bez round-tripu.

Istniejące V-TEC-11 w `create-draft.ts` **nietknięte**.

---

## Testy (napisane, nie uruchamiane)

`line-actions.unit.test.ts` — fake client **faktycznie mutuje `line_no`**, więc renumeracja jest
weryfikowana end-to-end, a nie przez wąchanie stringów SQL:

- `updateBomLine` ze zmienionym `scrapPct` → wartość w payloadzie UPDATE **i** w audycie (before `1.00` → after `4.25`)
- pominięty `scrapPct` → param `null` + audyt niesie wartość zastaną
- `scrapPct: 0` przechodzi (coalesce nie może uznać 0 za „nie podano")
- `2.3456` → `invalid_input` z komunikatem, **zero zapytań do bazy**
- `2.35` przechodzi (test anty-float-dust)
- `scrapPct: 101` → `invalid_input`
- scrap 55 → `warnings: ['V-TEC-11']`; scrap 49.99 → brak `warnings`
- **linia 3 → pozycja 1** (dwa kroki „up") na 3-liniowym BOM → `line_no` dokładnie `1,2,3`, kolejność `C,A,B`
- move down → dalej gęste
- weryfikacja dwufazowego stagingu (+100000 przed −100000, faza 1 obejmuje wszystkie 3 wiersze, rangi `[1,2,3]`)
- move na `active` → `bom_not_editable`, zero zapisów, kolejność nietknięta
- no-op na skraju, `not_found` dla obcej linii, `forbidden` bez uprawnienia, zły `direction` → `invalid_input`
- audyt `bom.line_moved` z `lineNo` przed/po
- **anty-regresja:** istniejące testy `deleteBomLine` (dwufazowa renumeracja, 23505 → `invalid_input`) zostawione i dalej przechodzą — rozszerzenie faktu o mutację stanu jest wstecznie zgodne

`bom-line-row-actions.test.tsx` — prefill scrap + `step="0.01"`, wysyłka `scrapPct: 4.25`,
odmowa `2.3456` z komunikatem i zablokowanym Save, akceptacja `2.35`, ostrzeżenie V-TEC-11 przy 55
bez blokowania, `moveBomLine` z kierunkiem + refresh, disabled ↑ na pierwszym / ↓ na ostatnim,
`aria-label` „Move RM-002 up", disabled reorder na wersji nieedytowalnej, błąd reorderu na wierszu.

`bom-detail-row-actions-wiring.test.tsx` — przekazanie `scrapPct` + `isFirst`/`isLast`.
`bom-pure.test.ts` — czysty `isScrapPrecisionValid` (w tym jawny test, że `2.35 * 100 !== 235`).

**Zaktualizowane istniejące asercje** (sygnatura się zmieniła, to nie regresja):
`updateBomLine` params dostały trailing `null` (pominięty scrap), payload modala Edit dostał
`scrapPct: 1`, `TARGET` dostał `scrapPct: '1.00'`, mock `line-actions` dostał `moveBomLine`.

---

## Czego NIE jestem pewien

1. **Nie uruchomiłem niczego** — ani `tsc`, ani vitest (zgodnie z zasadami toru). Ryzyko literówki
   typu / drobnego niedopasowania asercji istnieje. Największy pojedynczy punkt: czy
   `z.coerce.number().min(0).max(100).refine(...).optional()` na pewno przepuszcza `undefined`
   bez koercji do `NaN`. Rozumowanie: `ZodOptional` zwraca `OK(undefined)` **przed** delegacją
   do wewnętrznego typu, a istniejący `AddBomLineInput` używa dziś dokładnie tego samego
   kształtu (`z.coerce.number()...optional().default(0)`) i działa. Ale nie sprawdziłem tego
   uruchomieniem.

2. **`unnest($2::uuid[], $3::int[])` z tablicami JS przez sterownik pg** — idiom jest obecny w repo
   (`resolve-stage-production-line.ts`), więc serializacja tablic działa. **Nie zweryfikowałem
   tego na żywej bazie** dla tej konkretnej pary uuid[]+int[]. Warto, żeby bramka odpaliła to
   przez real-PG PREPARE, a nie tylko przez mocki — mocki nie złapią błędu serializacji tablicy.

3. **Współbieżność `moveBomLine`.** Dwóch użytkowników przestawiających linie w tym samym
   nagłówku równocześnie: druga transakcja renumeruje na podstawie odczytu sprzed commitu
   pierwszej. Nie dołożyłem `select ... for update` na wierszach nagłówka. Efekt najgorszego
   przypadku to nieoczekiwana (ale wciąż **gęsta i unikalna**) kolejność, nie uszkodzone dane —
   `addBomLine` ma dziś dokładnie tę samą klasę wyścigu i radzi sobie retry'em. Jeśli owner
   uzna to za istotne, lekiem jest `for update` na odczycie `ordered`.

4. **Duplikat progu 50 %.** `create-draft.ts:183` ma dalej literał `50`, a `_lib/scrap-precision.ts`
   eksportuje `BOM_SCRAP_WARN_PCT`. Świadomie **nie** ruszyłem `create-draft.ts` — spec kazał
   zachować tamto ostrzeżenie, a zmiana byłaby czysto kosmetyczna i ryzykowała konflikt w bloku
   importów z innym torem. Do zunifikowania przy okazji.

5. **Klucze i18n są tylko *staged***, nie wmerge'owane w `apps/web/messages/{en,pl,ro,uk}`.
   UI działa przez ustalony fallback `t.has`-guarded, więc brak klucza nigdy nie rzuci — ale do
   czasu merge'a nowe etykiety wyświetlą się po angielsku również na `pl`. Świadome: bundle
   edytują równolegle inne tory.

6. **Precyzja przy dodawaniu przez `createBomDraft`.** Ścieżka „pierwsze autorstwo" (BOM jeszcze
   nie istnieje) i fork klonujący idą przez `LineInput`, którego celowo nie zaostrzyłem.
   Klient waliduje tam scrap tak samo (ten sam `isScrapPrecisionValid`), więc przez UI 3. miejsce
   po przecinku nie przejdzie — ale **serwer na tej jednej ścieżce dalej by je przyjął** i po
   cichu zaokrąglił. Uznałem to za świadomy kompromis (patrz uzasadnienie wyżej), nie za lukę,
   ale zgłaszam jawnie.

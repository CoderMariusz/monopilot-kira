# FALA-04 / TOR T3a — Routing: kolejność operacji + ułamkowy setup (PF-R06-05 + PF-R06-09)

Status: **kod + migracja + testy napisane, NIE uruchamiane** (bramka po stronie orchestratora).

---

## PF-R06-05 — Operacje routingu dają się przestawiać

Naprawa czysto kliencka, zgodnie ze specyfikacją. `updateRouting` i tak podmienia cały zestaw
(`update-routing.ts:102-130`: `delete ... where routing_id = $1`, potem re-insert), więc wystarczyło
pozwolić przestawić element w tablicy stanu formularza.

| Element | Gdzie |
|---------|-------|
| `moveOp(index, delta)` — swap w stanie, no-op na krawędziach | `routings-manager.client.tsx:272-282` |
| Kontrolki ↑ / ↓ w nagłówku karty operacji | `routings-manager.client.tsx:350-383` |
| Etykiety `moveUp` / `moveDown` | `routings-labels.ts` (typ + `ROUTINGS_DEFAULT_LABELS`) + 4 bundle |

- **Numeracja:** `onSubmit` nadal liczy `opNo: i + 1` z indeksu (`:288`) — po przestawieniu wychodzi
  ciągłe `1..N`, więc **V-TEC-60 (`shared.ts:167-177`) spełnione samo z siebie**. Nie ruszałem ani
  mechaniki zapisu, ani `updateRouting`.
- **Krawędzie:** pierwsza operacja nie renderuje „w górę" (`index > 0`), ostatnia nie renderuje
  „w dół" (`index < ops.length - 1`) — nie `disabled`, tylko brak przycisku, zgodnie ze specyfikacją.
- **Klawiatura:** natywne `<button type="button">` — w tabulacji i aktywowane Enter/Space bez
  dodatkowego kodu. Test klawiaturowy w suite.
- **`aria-label`:** `"Operation 2 Move up"` — ten sam wzorzec interpolacji, co istniejące
  `aria-label={`${labels.operationLabel}${index + 1} ${labels.fLine}`}` (`:355` przed zmianą), więc
  istniejący strażnik „żadnego `undefined` w aria-label" (`routings-manager.test.tsx:313-314`) dalej
  chroni nowe etykiety.
- **Kolejność po ponownym otwarciu:** zweryfikowane przez czytanie, nic nie trzeba było zmieniać —
  `list-routings.ts:99` agreguje operacje `order by o.op_no`, a modal mapuje tablicę w kolejności
  otrzymanej (`:247-250`). Czyli: zapis renumeruje 1..N → odczyt sortuje po `op_no` → modal renderuje
  w tej samej kolejności.

---

## PF-R06-09 — Ułamkowe setup minutes

### Łańcuch defektu (potwierdzony w kodzie)

| Warstwa | Stan przed | Efekt |
|---------|-----------|-------|
| Kontrolka | `type="number" min={0}` **bez `step`** (`routings-manager.client.tsx:374` przed zmianą) | przeglądarka przyjmuje krok `1` → `12.345` = `stepMismatch` |
| Submit | natywna walidacja blokuje submit **przed** `onSubmit` | `setError` nigdy nie leci → brak nawigacji i brak komunikatu = cichy no-op |
| Klient | `Number(op.setupTimeMin) \|\| 0` | float zamiast dokładnego decimala |
| Serwer | `setupTimeMin: z.number().int().min(0)` (`shared.ts:86`) | odrzucenie ułamka |
| Bind | `$6::integer` w obu insertach | zaokrąglenie **zanim** kolumna cokolwiek zobaczy |
| Baza | `setup_time_min integer` (mig. 163) | ucięcie |

Naprawione są **wszystkie pięć** — załatanie samej kolumny zostawiłoby `::integer` bind, który i tak
zaokrągla.

### Migracja `packages/db/migrations/523-routing-setup-time-numeric-scale.sql`

Wzorowana na 503 (bare `ALTER TYPE` + `comment on column`), plus post-check, który **wykonuje zapis**.

- `alter table public.routing_operations alter column setup_time_min type numeric(18, 6);`
- Idempotentna przez zbieżność: `ALTER ... TYPE` do typu, który kolumna już ma, przechodzi bez zmiany
  semantyki (dokładnie kształt 503). CHECK `routing_operations_setup_time_nonnegative_check`
  i `DEFAULT` są przenoszone przez `ALTER TYPE` — **nic nie dropuję i nie odtwarzam**.
- **Post-check:** `do $$` sprawdza `numeric_scale = 6` z katalogu, a potem **realnie zapisuje**
  `12.345678` do istniejącego wiersza i czyta z powrotem. Wycofanie zapisu przez zagnieżdżony
  `begin ... exception ... end` z wartownikiem `ROLLBACK_523_PROBE`;
  **`SAVEPOINT` / `ROLLBACK TO SAVEPOINT` NIE użyte — w PL/pgSQL to błąd składni** (zagnieżdżony blok
  *jest* subtransakcją). Gdyby kolumna dalej była `integer`, zapis dałby `12` → `raise exception` →
  migracja pada. Sama asercja katalogowa by tego nie złapała, bo PREPARE nie waliduje ciał funkcji.
- `0A000` nie grozi: sprawdziłem, że żadna migracja tworząca widok nie odwołuje się do
  `routing_operations` (`grep -l routing_operations packages/db/migrations | xargs grep -il "create .*view"` → pusto).
- Runner wysyła plik jako jedno `client.query(sql)` w `begin/commit` (`packages/db/scripts/migrate.ts:166-173`),
  nie tnie po średnikach — bloki `do $$` są w migracjach standardem (149, 157, 213, 214, 481).

### Serwer

`shared.ts` — `setupTimeMin: NumericString.optional().default('0')`, czyli **ten sam** walidator, co
`runTimePerUnitSec` / `costPerHour` (`MAX_ROUTING_NUMERIC_DP = 6`). Wejście dalej przyjmuje
`string | number`, więc istniejący wołacze podający liczby (testy integracyjne, `validOp`) nie pękają.
Bindy w `create-routing.ts:139` i `update-routing.ts:114`: `$6::integer` → `$6::numeric`.

### Klient — odstępstwo od litery specyfikacji (świadome)

Specyfikacja pkt 3 mówiła „`step` na inpucie zgodny z nową precyzją". **Nie dałem `step`** — usunąłem
natywną kontrolkę liczbową (`type="number" min={0}` → `inputMode="decimal"`, dokładnie jak sąsiednie
pola Run i Cost/h w tym samym wierszu). Powód jest wprost pkt 4 („komunikat musi być OSIĄGALNY"):

- `step="0.000001"` naprawia `12.345`, ale **odtwarza tę samą klasę defektu dla 7 miejsc po przecinku**:
  wartość znów jest `stepMismatch`, submit znów jest blokowany natywnie, `onSubmit` znów nie leci —
  czyli wymagany w testach „nazwany błąd" byłby z UI **nieosiągalny**. To samo dotyczy `min={0}`
  i wartości ujemnej (`rangeUnderflow`).
- `type="number"` dodatkowo **sanityzuje śmieci do pustego stringa** — aplikacja nie odróżnia „nic nie
  wpisałem" od „wpisałem `abc`", więc cicha strata danych zostaje. Input tekstowy zachowuje `abc`,
  serwer odrzuca, użytkownik widzi alert.

Jeśli orchestrator chce literalnie `step`, jedynym wariantem bez regresji osiągalności jest
`type="number" step="any"` (i **bez** `min`) — jedna linia, ale wraca problem sanityzacji śmieci.

Ponadto `Number(op.setupTimeMin) || 0` → `op.setupTimeMin.trim() || '0'` (`:295`) — decimal jedzie
verbatim (NUMERIC-exact, jak run time), a puste pole dalej znaczy „brak setupu".

---

## Dowód osiągalności komunikatu (ścieżka submit → render)

Wymagany przez specyfikację ślad, krok po kroku:

1. **Klik „Save routing"** — przycisk siedzi w stopce modala i jest spięty z formularzem przez
   `form="technical-routing-form"` (`:335`).
2. **Brak natywnej blokady.** Po zmianie kontrolka setupu nie ma `type=number`/`step`/`min`, więc
   walidacja ograniczeń nie przerywa submitu (to był root-cause ciszy). `required` zostaje tylko na
   nazwie operacji, która jest zawsze widoczna w kadrze.
3. `onSubmit` → `event.preventDefault()` → `setError(null)` → budowa payloadu (`:284-300`).
4. `startTransition` → `updateRouting(...)` / `createRouting(...)` (`:301-307`).
5. **Odrzucenie** → `setError(errorLabel(result.error, labels))` (`:306`). `errorLabel` (`:77-102`)
   mapuje każdy `RoutingActionError` na zlokalizowaną etykietę; `12.3456789` wraca jako
   `invalid_input` → `labels.errInvalidInput`.
6. **Render:** `{error ? <div role="alert" className="alert alert-red">…` — **przeniesiony ze stopy
   `<form>` do propa `footer` Dialogu** (`:318-331`), czyli do `.modal-foot`.
7. **Dlaczego to jest widoczne:** `.modal-box` to `display:flex; flex-direction:column; max-height:86vh`
   (`globals.css:492`), a **`.modal-body` jest jedynym elementem przewijanym** (`:497`
   `overflow-y:auto; flex:1`). Alert renderowany na końcu body (stan poprzedni) ląduje **pod
   krawędzią kadru** przy routingu z kilkoma operacjami — użytkownik klika Save w stopce i dalej nie
   widzi nic. `.modal-foot` (`:498`) jest siostrą przewijanego bloku w tej samej kolumnie, więc jest
   na ekranie zawsze, gdy modal jest otwarty — tuż obok właśnie wciśniętego przycisku.
8. Modal **nie zamyka się** przy błędzie (`onSaved()` tylko dla `result.ok`), więc wartości da się
   poprawić.

Test `PF-R06-09: a rejected save renders a visible localized alert outside the scrolling modal body`
asserto­wuje kroki 6-8 **strukturalnie** (`.modal-foot` zawiera alert, `.modal-body` nie), a nie
„czy węzeł istnieje" — i dlatego failuje na obecnym kodzie.

⚠️ **Uwaga metodologiczna:** jsdom nie wykonuje natywnej walidacji ograniczeń formularza, więc
**oryginalnego cichego no-opu nie da się odtworzyć w RTL** — dlatego istniejąca suite go nie złapała.
Test na warstwie DOM asertuje więc dodatkowo, że kontrolka nie jest już `type="number"`.

---

## Czy podgląd kosztu zakładał całkowite minuty?

**Nie.** `cost-preview.ts:111,114,162` liczy `(coalesce(setup_time_min, 0)::numeric / 60) * rate_per_hour`
— jawny `::numeric` przed dzieleniem, całość w jednym przebiegu SQL, wynik jako `::text`.
`cost-preview-shared.ts` trzyma tylko `setupCost: string`. Poszerzenie kolumny działa tu bez zmian;
podgląd zacznie po prostu odzwierciedlać ułamki. **Nic nie zmieniałem w podglądzie kosztu.**

Przy okazji przejrzałem pozostałych konsumentów `setup_time_min` (żaden nie wymagał zmiany):

| Konsument | Dlaczego bezpieczny |
|-----------|--------------------|
| `planning/work-orders/_actions/create-work-order-core.ts:287,290`, `update-work-order.ts:204,207`, `planning/_actions/mrp.ts:1474,1477`, `lib/planning/wo-chain-qty-sync.ts:179,182` | już `coalesce(ro.setup_time_min, 0)::numeric` |
| `scheduler/_actions/scheduler-actions.ts:346` | `round(sum(...) * 60000)::bigint` — numeric → round → bigint |
| `technical/tooling/_actions/list-tooling-setups.ts:104` | `Number(row.setup_time_min)` |
| `technical/items/[item_code]/_actions/tab-data.ts:223` | `Number(r.setup_sum) \|\| 0`, typ już `string \| number \| null` |
| `app/(npd)/pipeline/_actions/_lib/materialize-npd-routing.ts:80` | wstawia `round(...)::integer` — integer do numeric wchodzi bez straty |
| `list-routings.ts:59,94` | **celowo bez zmian** — patrz „decyzje" niżej |

---

## Zmienione pliki

**Kod**
- `apps/web/app/[locale]/(app)/(modules)/technical/routings/_components/routings-manager.client.tsx`
  — `moveOp` + kontrolki ↑/↓; setup na `inputMode="decimal"`; payload `setupTimeMin` jako string;
  alert przeniesiony do `.modal-foot`.
- `apps/web/app/[locale]/(app)/(modules)/technical/routings/_components/routings-labels.ts` — `moveUp`, `moveDown`.
- `apps/web/i18n/{en,pl,uk,ro}.json` — `technical.routings.manager.moveUp/moveDown` dopisane
  **punktowo po `addOperation`**, bez przestawiania kluczy (uk/ro po angielsku — tak jak reszta tej sekcji).
- `apps/web/app/[locale]/(app)/(modules)/technical/routings/_actions/shared.ts` — `setupTimeMin` na `NumericString`.
- `.../routings/_actions/update-routing.ts`, `.../routings/_actions/create-routing.ts` — `$6::integer` → `$6::numeric`.
- `packages/db/schema/routing.ts:94` — drizzle: `numeric('setup_time_min', { precision: 18, scale: 6 }).notNull().default('0')`.

**Migracja**
- `packages/db/migrations/523-routing-setup-time-numeric-scale.sql` (nowy; 522 był ostatni).

**Testy (napisane, NIE uruchamiane)**
- `.../routings/_components/__tests__/routings-manager.test.tsx` — 4 nowe testy + fixture
  `ROUTINGS_WITH_THREE_OPERATIONS`; zaktualizowane 2 istniejące asercje (`toHaveValue('45')`,
  `setupTimeMin: '45'`) — kontrolka jest teraz tekstowa, a payload stringiem.
- `.../routings/_actions/__tests__/routing-numeric-precision.unit.test.ts` — blok
  `PF-R06-09 — fractional setup minutes` (6 testów).

### Dlaczego każdy nowy test failuje na obecnym kodzie

| Test | Czerwony bo |
|------|-------------|
| reorder → `opName` `['Mix brine','Pack','Smoke']`, `opNo` `[1,2,3]` | przycisku `Operation 3 Move up` dziś nie ma |
| move controls reachable by keyboard | j.w. |
| fractional setup submitted verbatim → `'12.345'` | dziś leci `12.345` jako **number** (`Number(...) \|\| 0`) |
| rejected save renders alert **in `.modal-foot`** | dziś alert jest w `.modal-body` (asercja strukturalna, nie „istnieje") |
| `setupTimeMin: 12.345` przechodzi walidację | dziś `z.number().int()` odrzuca |
| 7 dp → `supports at most 6 decimal places` | dziś komunikat to zodowy „expected int", nie ten nazwany |
| `updateRouting`/`createRouting` bindują `$6::numeric` | dziś w SQL jest `$6::integer` |

---

## Decyzje, których specyfikacja nie przesądzała

1. **`RoutingSummary.setupTimeMin` zostaje `number`, `list-routings.ts` zostaje na `Number(...)`.**
   Rozważałem `::text` + string (parytet z `runTimePerUnitSec`), ale odrzuciłem: (a) round-trip
   `jsonb number → JS double → String()` jest dokładny dla realnych wartości (≤15 cyfr znaczących),
   (b) `::text` pokazywałby w formularzu `45.000000` zamiast `45` po ponownym otwarciu — realna
   regresja UX, (c) diff i tak nie jest potrzebny do naprawy. Ceną jest teoretyczna utrata precyzji
   dopiero przy >15 cyfrach znaczących (≈10⁹ minut setupu).
2. **Alert w stopce, nie `scrollIntoView`.** Odruch „doscrolluj do błędu" wymagałby refa + efektu,
   a `Element.prototype.scrollIntoView` nie istnieje w jsdom (test musiałby go stubować). Przeniesienie
   węzła poza scroller daje ten sam efekt zerowym kosztem i jest testowalne.
3. **`packages/db/__expected__/schema.sql` NIE aktualizowany** — snapshot jest już nieaktualny wobec
   migracji 503 (dalej ma `numeric(10,2)` / `numeric(10,4)`), więc nikt go nie egzekwuje; dopisanie
   samego `setup_time_min` udawałoby świeżość. `packages/db/__tests__/routing.migration.test.ts:199-215`
   sprawdza tylko nazwy i kolejność kolumn — bez zmian.

---

## Czego NIE jestem pewien

1. **Nie uruchamiałem niczego** (zakaz w specyfikacji): ani `tsc`, ani vitest, ani migracji. Ryzyko
   typecheck: zmiana wyjścia zoda `setupTimeMin` z `number` na `string`. Prześledziłem konsumentów —
   tylko dwa bindy insertowe (`op.setupTimeMin` → param) i `lib/technical/routing/service.ts`, który
   importuje **tylko typ** `ParsedOperation` i nigdzie nie dotyka `setupTimeMin`. Nie mam jednak
   potwierdzenia z kompilatora.
2. **Post-check migracji przy FORCE RLS.** `routing_operations` ma `FORCE ROW LEVEL SECURITY`. Jeśli
   migracje lecą jako właściciel-nie-superuser, `select ... limit 1` w bloku może nie zobaczyć wiersza
   (brak `app.current_org_id()`) → probe zapisu **wypisze notice i się pominie**, zostawiając tylko
   asercję katalogową. Nigdy nie da fałszywego czerwonego (dodałem też `if not found` po `update`),
   ale na prodzie może nie dowieść tyle, ile na lokalnej bazie. Warto sprawdzić notice w logu deployu.
3. **Kosmetyka stopki.** Alert dostał `marginRight:'auto'; minWidth:0` w `.modal-foot`
   (`display:flex; justify-content:flex-end; gap:8px`, bez `flex-wrap`). Przy bardzo wąskim viewporcie
   długi komunikat może ścisnąć przyciski. Nie ruszałem globalnego `.modal-foot`, bo to prymityw
   współdzielony przez wszystkie modale — jeśli to zaboli, właściwą poprawką jest `flex-wrap: wrap`
   w `globals.css:498`, a nie inline.
4. **Fokus po przestawieniu.** `key={index}` na karcie operacji sprawia, że po kliknięciu ↑/↓ fokus
   zostaje na przycisku o tym samym indeksie, czyli już przy innej operacji. Poprawnie działa, ale
   dla użytkownika klawiatury „przesuń o dwie pozycje" wymaga ponownego namierzenia. Pełny fix to
   stabilne klucze operacji + `ref`/`useEffect` na przywrócenie fokusu — świadomie pominięte jako
   poza zakresem obu findingów.
5. **Wartości typu `1e-7`** wpisane w setup są odrzucane (`String(1e-7)` → `'1e-7'` nie przechodzi
   regexa `NumericString`). To zachowanie identyczne z `runTimePerUnitSec` od zawsze — nie uznałem
   tego za regresję, ale to świadoma niedoskonałość wspólnego walidatora.

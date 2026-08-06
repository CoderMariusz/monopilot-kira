# B1 — Duplikacja i kopiuj-wklej

Audyt 2026-08-06 · Grupa B, agent 1 · **inwentaryzacja, nic nie naprawiono**

Zakres pomiaru: 3574 pliki `.ts/.tsx` w `apps/web` + `packages` (~481 tys. linii),
`packages/db/migrations` (SQL), z kontrolą żywotności każdej zgłoszonej funkcji SQL.

Uszeregowane wg **konsekwencji rozjazdu**, nie wg liczby powtórzeń.

---

## Jak czytać

| status | znaczenie |
|---|---|
| **ROZJAZD** | kopie **już się różnią** — zmierzone, nie przewidywane |
| **ZGODNE** | kopie dziś mówią to samo; ryzykiem jest przyszła zmiana jednej z nich |
| **MARTWE** | kod nieosiągalny z żadnej trasy — kopia tylko udaje, że żyje |

Pozycje oznaczone `[BIBLIA #n]` są już w `_meta/plans/2026-08-05-noc/BIBLIA-BLEDOW.md`.
Podaję je z **pełną listą wystąpień**, bo Biblia wymienia po jednym przykładzie klasy.

---

# CZĘŚĆ A — ZDUPLIKOWANA LOGIKA DECYZYJNA

To najgroźniejsza kategoria. Wszystkie pozycje tutaj to reguły biznesowe policzone
w kilku miejscach niezależnie.

*(A0 i B0 stoją przed A1 celowo — to jedyne pozycje, których rozjazd **już
trzykrotnie kosztował produkcję** w ciągu ostatniej doby.)*

## A0. Znak ruchu magazynowego — 4 mechanizmy, 4 identyczne kopie funkcji — **ZGODNE, ale to jest źródło trzech nocnych awarii**

**co** — Reguła „jak zapisać ruch odwrotny" nie ma ani jednego miejsca, które by ją
egzekwowało. Zamiast tego żyje w czterech różnych mechanizmach i w pięciu komentarzach
prozą. Trzy rozjazdy księgowe naprawione tej nocy (`58900b69`, `b59a5285`, `1308ce11`)
to nie trzy literówki — to **trzy objawy tej samej struktury**.

**gdzie**

`negateDecimalString` — **4 kopie, bajt w bajt identyczne, 5 linii każda**:
- `.../production/_actions/corrections-actions.ts:208`
- `.../warehouse/_actions/receipt-corrections-actions.ts:157`
- `apps/web/app/api/production/scanner/wos/[id]/reverse-consume/route.ts:87`
- `apps/web/lib/finance/upsert-wac.ts:562`

`restoreLicensePlate` — **2 kopie** (ta sama operacja: oddaj ilość palecie i przestaw status):
- `.../production/_actions/corrections-actions.ts:1022`
- `.../scanner/wos/[id]/reverse-consume/route.ts:469`

Cztery **różne mechanizmy** wyznaczania znaku, każdy w innym module:
1. negacja przez `bigint` — `lib/production/waste/record-waste.ts:265`,
   `.../warehouse/_actions/direct-adjust-actions.ts:359`,
   `.../warehouse/counts/_actions/count-actions.ts:764` (dwie ostatnie to **identyczna linia**)
2. negacja przez szablon łańcucha — `lib/production/complete-cancel-wo.ts:549`,
   `.../lp-split-merge-destroy-actions.ts:502,728,835`
3. funkcja `negateDecimalString` — 4 kopie wyżej
4. **wnioskowanie kierunku z wiodącego minusa** —
   `.../lp-split-merge-destroy-actions.ts:242`: `input.quantity.startsWith('-')`
   decyduje, czy wypełnić `from_location_id` czy `to_location_id`. Mechanizm
   **niewystępujący nigdzie indziej**.

**dowód** — cztery kopie `negateDecimalString`, sprawdzone `awk`iem, są identyczne:
```ts
function negateDecimalString(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('-')) return trimmed.slice(1);
  return `-${trimmed}`;
}
```

Reguła „zwrot z anulowanej wysyłki to `move_type='return'` z ilością **dodatnią**,
mimo że towar wraca" jest zapisana **wyłącznie w treści commita `b59a5285`** —
w kodzie (`receipt-corrections-actions.ts:482`) nie ma o tym ani słowa. Kolejna
osoba czytająca to miejsce zobaczy dodatnią ilość przy zerowaniu palety i uzna,
że to błąd.

**korzyść** — jedna funkcja `negateDecimalString` (usunięcie 3 kopii, S), jedna
`restoreLicensePlate` (usunięcie 1 kopii, M). Ważniejsze: **przeniesienie reguły
znaku z pięciu komentarzy prozą do jednego miejsca, które ją wymusza**.

**koszt** — S dla `negateDecimalString`. M dla `restoreLicensePlate`. L dla
prawdziwego rozwiązania (wspólny pisarz księgi — patrz B0).

**ryzyko** — scalenie `negateDecimalString`: **zerowe** (4 identyczne ciała).
Scalenie `restoreLicensePlate`: średnie, dotyka ścieżki księgowej, wymaga
odtworzenia na realnej bazie.

**zależy od** — nic

---

## A1. Sprawdzanie uprawnień: 15 prywatnych kopii, 4 różne predykaty — **ROZJAZD**

**co** — Ta sama decyzja („czy ten użytkownik ma to uprawnienie") jest liczona przez
kanoniczny checker w 144 plikach i przez **15 prywatnych kopii SQL** w pozostałych.
Kopie **nie mają obejścia dla ról nadrzędnych ani dla administratora platformy** —
ten sam właściciel organizacji jest wpuszczany na 144 ekranach i odrzucany na 15.

**gdzie** — kanoniczny: `apps/web/lib/auth/has-permission.ts:16`

Kopie z własnym SQL (15):

| predykat | pliki |
|---|---|
| **W1** `rp.permission is not null or r.permissions ? $3` (12×) | `apps/web/actions/tenant/get.ts:61`, `preview-upgrade.ts:211`, `promote-canary.ts:110`, `rollback-upgrade.ts:137`, `set-dept.ts:165`, `set-local-flag.ts:85`, `set-rule-variant.ts:112`, `start-upgrade.ts:140`, `apps/web/actions/flags/set-core.ts:137`, `apps/web/actions/rules/get.ts:238`, `rules/dry-runs.ts:238`, `rules/list.ts:215` |
| **W2** + `r.code = $3 or r.slug = $3` | `apps/web/actions/modules/toggle.ts:147` |
| **W3** + `r.code = $3`, `coalesce(r.permissions,'[]')` | `apps/web/actions/users/assign-user-sites.ts:67` |
| **W4** `coalesce(r.permissions,'[]') ? $3` — **eksportowana pod nazwą `hasPermission`** | `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/packaging/_actions/shared.ts:140` |

**dowód** — kanoniczny ma dwa człony, których nie ma **żadna** z 15 kopii:

```sql
-- apps/web/lib/auth/has-permission.ts:16
or r.code = any($4::text[])      -- SUPER_ROLES = ['owner','admin','org_admin']
or r.slug = any($4::text[])
...
) or app.current_user_is_platform_admin()
```

W1 (12 plików) nie ma ani ról nadrzędnych, ani administratora platformy.
W2 dodatkowo **przyznaje** dostęp, gdy `roles.code` równa się nazwie uprawnienia —
W1 w tej samej sytuacji **odmawia**. To dwie różne odpowiedzi na to samo pytanie.

**korzyść** — jedna reguła autoryzacji zamiast pięciu; znika klasa „administrator
nie może wejść w ustawienia dzierżawcy, choć wchodzi wszędzie indziej".

**koszt** — M (15 plików, każdy to podmiana ciała funkcji na wywołanie `hasPermission`;
sygnatury są różne — 3 kształty)

**ryzyko** — **kierunek zmiany jest rozluźniający**: po scaleniu role nadrzędne i
administrator platformy zaczną przechodzić tam, gdzie dziś są odrzucane. To trzeba
świadomie zaakceptować, bo dotyczy ekranów dzierżawcy i modułów. Nie robić tego
bez testu na personach.

**zależy od** — nic

---

## A2. `ilość × koszt` bez konwersji jednostki — 8 wystąpień, 3 pliki — **ROZJAZD** `[BIBLIA #1, #2]`

**co** — Naprawa błędu tysiąckrotnego (`2dcd9a73`, 200 g przy 5 GBP/kg dawało 1000 GBP)
objęła **2 z 8** miejsc, w których ilość z BOM-u mnoży się przez koszt kwotowany
za jednostkę bazową. Pozostałe 6 nadal liczy bez konwersji.

**gdzie**

| plik:linia | mnożenie | konwersja? |
|---|---|---|
| `.../technical/cost/_actions/recipe-cost-rollup-sql.ts:99,128` | `BOM_LINE_BASE_QTY_SQL * vec.amount` | **TAK** — naprawione 2026-08-06 |
| `.../(npd)/pipeline/[projectId]/costing/_actions/compute.ts:692` | `sum(bl.quantity * vec.amount)` | NIE |
| `.../(npd)/pipeline/[projectId]/costing/_actions/compute.ts:716` | `sum(wdi.qty_per_unit * vec.amount)` | NIE |
| `apps/web/lib/npd/live-wip-cost-query.ts:101` | `sum(bl.quantity * vec.amount)` | NIE |
| `apps/web/lib/npd/live-wip-cost-query.ts:125` | `sum(wdi.qty_per_unit * vec.amount)` | NIE |
| `apps/web/lib/npd/live-wip-cost-query.ts:193` | `sum(bl.quantity * vec.amount)` | NIE (wariant payload) |
| `apps/web/lib/npd/live-wip-cost-query.ts:217` | `sum(wdi.qty_per_unit * vec.amount)` | NIE (wariant payload) |
| `packages/db/migrations/501-...:43` | `sum(ab.quantity * lc.amount)` | NIE |
| `packages/db/migrations/501-...:54` | `sum(wdi.qty_per_unit * lc.amount)` | NIE |

**kontrola żywotności** — `create or replace function public.compute_intermediate_unit_cost`
występuje w migracjach **491, 492, 501**. Obowiązuje **501** — sprawdzone, nie założone.
Wersje w 491/492 są nadpisane i ich nie liczę.

**dowód** — nagłówek migracji 501 sam przyznaje się do kopii:

```
-- 501-intermediate-cost-batch-normalize.sql:4
-- Aligns SQL with apps/web/lib/npd/wip-cost.ts batch-normalized labour.
```

Migracja 501 **istnieje wyłącznie dlatego**, że kopia SQL rozjechała się z kopią TS.
To nie jest teza — to jest udokumentowany precedens tego samego rozjazdu.

**korzyść** — koniec z wyceną receptury zawyżoną o czynnik jednostki (1000× dla gramów)
w NPD i w funkcji zasilającej widok kosztów.

**koszt** — M (jedna wspólna definicja fragmentu SQL + 6 podmian; `BOM_LINE_BASE_QTY_SQL`
już istnieje i jest przypięty testem `recipe-cost-uom.pg.test.ts`)

**ryzyko** — **wysokie i wymaga kolejności**: `BIBLIA #2` mówi, że NPD zapisuje już
zatruty koszt do `item_cost_history` i `items.cost_per_kg`. Naprawiony rollup te
zawyżone wartości **przemnoży poprawnie** — czyli utrwali błąd. Naprawa kodu bez
decyzji o danych historycznych pogarsza sytuację.

**zależy od** — decyzja właściciela o backfillu `item_cost_history` (BIBLIA D1)

---

## A3. Sześć niezależnych implementacji „sprowadź ilość do jednostki bazowej" — **ROZJAZD**

**co** — Ta sama konwersja jednostki jest napisana sześć razy. Dwie kopie mają
**ciche błędne rezerwy**: przy braku wpisu w katalogu jednostek zwracają liczbę
zamiast odmowy.

**gdzie**

| plik:linia | zakres | rozjazd |
|---|---|---|
| `apps/web/lib/uom/convert.ts:68` `normalizeItemQuantityToBase` | kanoniczny (async, 1 zapytanie/pozycję) | — |
| `apps/web/lib/uom/convert.ts:143,150,162` `toBaseQty` i warianty | synchroniczne odmiany tego samego | zgodne z konstrukcji |
| `.../technical/cost/_actions/recipe-cost-rollup-sql.ts:65` `BOM_LINE_BASE_QTY_SQL` | odbicie kanonicznego w SQL | **świadome, przypięte testem** — zostawić (patrz „Duplikacja, która ma zostać") |
| `apps/web/lib/finance/wac-qty-kg-sql.ts:41` `wacQtyKgSql` | na sztywno do **kg**, nie do jednostki bazowej pozycji | gałąź `each` odpala **bez** sprawdzenia `base_uom.factor_to_base` → traktuje jednostkę bazową jak kg |
| `apps/web/lib/production/consumption-qty-to-kg.ts:14-22` | trzecia odmiana „do kg" | gałęzie `each`/`box` **nie mają** strażnika `uom_base = 'kg'`; dodatkowo stała `* 0.45359237` dla `lb`, której **nie ma w katalogu** (`seed_units_of_measure_for_org`, żywa wersja: migracja **449**) |
| `apps/web/lib/production/output/register-disassembly-output.ts:225-241` i **znowu** `248-262` | czwarta i piąta, wklejona dwa razy w jednym pliku | **omija sąsiedni wspólny helper** (`consumption-qty-to-kg.ts` jest importowany przez `register-output.ts:52`, ale nie tutaj); brakuje gałęzi masowej → komponent w `g` odpada z `input-uom-unsupported` |

**dowód** — `consumption-qty-to-kg.ts:22`:
```sql
when lower(c.uom) = 'lb' then c.qty_consumed::numeric * 0.45359237
```
Katalog jednostek (migracja 449) nie zasiewa wiersza `lb`. Ta stała żyje poza
`unit_of_measure.factor_to_base` — jedyne miejsce w repo, gdzie przelicznik jest
zaszyty w kodzie zamiast w danych.

**korzyść** — jedna tabela przeliczników; znikają dwie ciche rezerwy dające liczbę
zamiast `null` („wiarygodna zła liczba jest gorsza od absurdalnej — nikt nie audytuje 30,00",
cytat z naprawy `2dcd9a73`).

**koszt** — L (6 miejsc, 3 różne warstwy: SQL, SQL-in-TS, TS; wymaga testu na realnej bazie)

**ryzyko** — średnie. Ujednolicenie na „zwracaj `null`, gdy nie da się przeliczyć"
**zamrozi** pozycje, które dziś przechodzą przez cichą rezerwę. To jest pożądane,
ale zobaczy to operator. Wymaga zapowiedzi.

**zależy od** — A2 (ten sam fragment SQL)

---

## A4. `toMicro` — 4 kopie, 3 bez strażnika wejścia — **ROZJAZD**

**co** — Zamiana łańcucha dziesiętnego na liczbę całkowitą w mikro-jednostkach
(skala 6) jest napisana cztery razy. Kanoniczna odrzuca śmieci i zwraca zero.
Trzy kopie **rzucają wyjątkiem** na tym samym wejściu.

**gdzie**

| plik:linia | strażnik `DECIMAL_RE` | przyjmuje `null` |
|---|---|---|
| `apps/web/lib/shared/decimal.ts:34` `toMicro` — kanoniczna, używana przez 34 pliki | **TAK** | TAK |
| `.../planning/transfer-orders/_actions/actions.ts:861` `toMicro6` | NIE | NIE |
| `.../planning/transfer-orders/_actions/to-conservation.ts:6` `toMicro6` | NIE | NIE |
| `apps/web/lib/production/output/register-output.ts:197` `toMicro` | NIE | NIE |

**dowód** — kanoniczna, `decimal.ts:40`:
```ts
if (!DECIMAL_RE.test(text)) return 0n;   // DECIMAL_RE = /^-?\d+(\.\d+)?$/
```
Kopie idą prosto do `BigInt(intPart || '0')`. Dla wejścia w notacji naukowej
(`'1e-7'`) `BigInt` **rzuca `SyntaxError`**; dla `null`/`undefined` rzuca
`TypeError` już na `decimal.startsWith`. Stała skali `1_000_000n` jest zadeklarowana
w każdym z 4 miejsc osobno (`MICRO_SCALE`, `QTY_SCALE` ×2, `SCALE`).

**korzyść** — 3 usunięte funkcje; ścieżka zachowania ilości w przesunięciach
międzymagazynowych i rejestracji produkcji przestaje móc paść na złym wejściu.

**koszt** — **S** (import zamiast lokalnej funkcji, 3 pliki)

**ryzyko** — niskie. Zmiana jest ściśle rozszerzająca: kanoniczna przyjmuje wszystko,
co przyjmują kopie, i dodatkowo nie rzuca. Jedyna różnica zachowania: tam, gdzie
dziś leci wyjątek, będzie `0n` — a to jest ścieżka, która dziś i tak kończy się awarią.

**zależy od** — nic. **Najlepszy stosunek korzyści do ryzyka w całym raporcie.**

---

## A5. Definicja „aktywna blokada jakościowa" — 10 niezależnych kopii — **ZGODNE**

**co** — Widok `v_active_holds` (migracja 197) jest kanoniczną definicją aktywnej
blokady. Mimo to dziesięć miejsc powtarza tę definicję samodzielnie — cztery
z nich zamiast odpytać widok, wklejają jego predykat do własnego zapytania.

**gdzie**

| plik:linia | forma |
|---|---|
| `packages/db/migrations/197-...:91` | definicja widoku (kanoniczna) |
| `packages/db/migrations/412-hold-chokepoint.sql:49` | powtórzony predykat w SQL |
| `.../quality/_actions/hold-actions.ts:126` | `const ACTIVE_HOLD_STATUSES` |
| `.../quality/_actions/inspection-actions.ts:119` | `const ACTIVE_HOLD_STATUSES` (drugi raz) |
| `.../quality/_actions/haccp-actions.ts:59` | `const ACTIVE_HOLD_STATUSES` (trzeci raz) |
| `.../quality/_actions/inspection-actions.ts:798` | predykat wklejony w SQL |
| `.../quality/_actions/cold-chain-actions.ts:142` | predykat wklejony w SQL |
| `.../production/_actions/corrections-actions.ts:993` | predykat wklejony w SQL |
| `.../production/_actions/get-work-order-detail.ts:611` | predykat wklejony w SQL |
| `.../quality/holds/_components/holds-list.client.tsx:91` | `Set` po stronie przeglądarki |
| `.../quality/_actions/get-quality-dashboard.ts:45` | lista przekazana jako parametr **do widoku, który już filtruje** |

**dowód** — `inspection-actions.ts:796` komentuje własną kopię:
```sql
-- Canonical "active hold" definition (migration 197 v_active_holds):
-- non-terminal hold_status AND released_at IS NULL (review fix F6).
and qh.hold_status in ('open', 'investigating', 'escalated', 'quarantined')
and qh.released_at is null
```
Komentarz nazywa źródło prawdy i **mimo to je kopiuje**. `get-quality-dashboard.ts:45`
filtruje po statusie zapytanie do `v_active_holds` — czyli powtarza filtr, który widok
już zastosował.

Sprawdzone: **wszystkie 10 kopii dziś mówi to samo.** To pozycja o ryzyku przyszłym,
nie o obecnym błędzie. Zgłaszam ją, bo jest w briefie wymieniona jako klasa, która
już raz kosztowała potrójną naprawę fail-open, i bo dodanie jedenastego statusu
blokady (np. `disposition_pending`) wymaga dziś dotknięcia 10 miejsc.

**korzyść** — nowy status blokady = jedna zmiana zamiast dziesięciu.

**koszt** — M

**ryzyko** — niskie, ale **nie zerowe w jednym miejscu**: `corrections-actions.ts:993`
i `get-work-order-detail.ts:611` odpytują `quality_holds` bezpośrednio, nie widok.
Przełączenie ich na `v_active_holds` zmienia ścieżkę RLS (widok jest SECURITY INVOKER)
— trzeba to sprawdzić na realnej bazie, nie na mockach.

---

## A6. Tabela przejść zamówienia zakupu w 3 miejscach — **ROZJAZD**

**co** — To, jakie zmiany statusu są dozwolone dla zamówienia zakupu, jest zapisane
w trzech miejscach, a te trzy miejsca **nie zgadzają się** ze sobą.

**gdzie**
- `.../planning/purchase-orders/_actions/actions.ts:991` `PO_TRANSITIONS`
- `.../planning/purchase-orders/_actions/actions.ts` — guard w `reopenPurchaseOrder` (wiersz ~1014)
- `.../planning/purchase-orders/_components/po-detail-view.tsx:183` `TRANSITIONS` + `:284` `canReopen`

**dowód**

```ts
// serwer, actions.ts:993
sent: ['draft', 'confirmed', 'cancelled'],     // ← sent może wrócić do draft

// klient, po-detail-view.tsx:189
sent: [ {to:'confirmed'}, {to:'cancelled'} ],  // ← brak przycisku sent → draft

// serwer, reopenPurchaseOrder
if (before.status !== 'sent' && before.status !== 'cancelled') { ... }   // przyjmuje OBA

// klient, po-detail-view.tsx:284
const canReopen = isCancelled && !!reopenPurchaseOrderAction;            // TYLKO cancelled
```

Etykieta w tym samym pliku (`:142`) mówi wprost: *„Wave-R reversibility — **sent→draft**
reopen affordance"*. Serwer to przyjmuje. Interfejs tego nie pokazuje. **Zamówienie
w statusie `sent` nie da się cofnąć do wersji roboczej z ekranu**, mimo że obie
warstwy serwerowe to dopuszczają.

**korzyść** — usunięcie funkcji, która jest zaimplementowana, przetestowana
i nieosiągalna dla użytkownika.

**koszt** — S (jedna linia w kliencie, jeśli decyzja brzmi „ma działać")

**ryzyko** — to jest **decyzja produktowa, nie techniczna**: czy wysłane zamówienie
wolno cofnąć do wersji roboczej. Nie zmieniać bez właściciela.

**sprawdzone i w porządku:** ten sam wzorzec w przesunięciach międzymagazynowych
(`transfer-orders/_actions/actions.ts:848` vs `to-detail-view.tsx:158`) — **zgodny**.
Klient pomija klucze `received`/`cancelled`, co daje ten sam efekt co pusta lista.

---

## A7. Próg ATP 10 RLU — 4 miejsca, reguła porównania — 2 miejsca — **ZGODNE**

**co** — Domyślny próg czystości powierzchni (10 RLU) i reguła „ponad próg = odrzucenie"
są zapisane w SQL i w TypeScripcie osobno.

**gdzie**

| plik:linia | co |
|---|---|
| `packages/db/migrations/162-lab-supplier.sql:34` | `threshold_rlu numeric default 10.00` |
| `packages/db/migrations/167-technical-baseline-seed.sql:68` | zasiew `atp_swab_rlu_max = 10` |
| `packages/db/migrations/187-...:64` | rezerwa `return 10::numeric` |
| `.../production/_actions/changeover-actions.ts` `ATP_FALLBACK_THRESHOLD_RLU = 10` | rezerwa w TS |
| `packages/db/migrations/187-...:99` | `if new.result_value > v_threshold then 'fail'` |
| `.../production/_actions/changeover-actions.ts` `rluVerdict()` | `rlu > thresholdRlu ? 'fail' : 'pass'` |

**dowód** — komentarz w `rluVerdict()` sam wskazuje bliźniaka:
```
// Strictly greater than the threshold fails — identical to the quality-owned
// lab_results ATP auto-fail trigger (migration 187, §10.6).
```

**korzyść** — mała. **Rekomendacja: NIE scalać.** Wyzwalacz bazodanowy i kod aplikacji
działają w różnych warstwach i z różnych powodów; wymuszenie jednego źródła oznaczałoby
albo zapytanie do bazy w gorącej ścieżce, albo wygenerowany kod. Wystarczy **test
przypinający** obie wartości do siebie (tak jak `recipe-cost-uom.pg.test.ts` przypina
`BOM_LINE_BASE_QTY_SQL` do `normalizeItemQuantityToBase`).

**koszt** — S (sam test)

**ryzyko** — brak

**Uwaga:** sama reguła werdyktu ATP, o której mówi brief, **została już scalona**
w commicie `11095c7c` do jednej funkcji `certifyVerdict()`; komentarz w kodzie
nazywa drugą kopię jako przyczynę defektu. Ta pozycja jest **zamknięta** — nie
dublować pracy.

---

# CZĘŚĆ B — ZDUPLIKOWANE ZAPYTANIA

## B0. Księga magazynowa: 21 pisarzy, żadnego wspólnego — **ROZJAZD**

**co** — Nie istnieje ani jeden wspólny pisarz księgi magazynowej. **21 miejsc
pisze do `stock_moves` własnym, ręcznie napisanym `insert`em**, a **20 miejsc
mutuje ilość na palecie** własnym `update`em. Zestawy kolumn i warunki brzegowe
już się rozjechały.

**gdzie** — 21 wystąpień `insert into public.stock_moves` w **17 plikach**
(zmierzone, bez testów). Siedem z nich opakowuje zapytanie w lokalną, nieeksportowaną
funkcję — dwie z nich noszą **tę samą nazwę** `writeConsumptionReverseStockMove`
w dwóch różnych plikach, i dwie kolejne nazywają się `insertStockMove` bez żadnego
związku ze sobą.

**dowód, że wspólnego pisarza nie ma:**
```
grep 'export async function insertStockMove|export function insertStockMove|export async function writeStockMove'
  → 0 trafień
```
Wszystkie 21 to równorzędne kopie. Nie ma czego „omijać" — nie ma centrum.

**Rozjazd 1 — brakujące kolumny w przesunięciach międzymagazynowych.**
Trzy zapisy (`.../planning/transfer-orders/_actions/actions.ts:1119`, `:1301`, `:1454`)
pomijają `reason_code` i `ext_jsonb`:
```sql
insert into public.stock_moves
  (org_id, move_number, lp_id, move_type, from_location_id, to_location_id,
   quantity, uom, reason_text, transaction_id, created_by, updated_by)
```
Sąsiad **w tym samym module** (`transfer-orders/_actions/reverse-receive.ts:286`) ustawia komplet:
```sql
insert into public.stock_moves
  (org_id, site_id, move_number, lp_id, move_type, from_location_id, to_location_id,
   quantity, uom, reason_code, reason_text, transaction_id, ext_jsonb, created_by, updated_by)
```
Czyli wąski kształt **nie jest wymuszony dziedziną** — to zwykła niekonsekwencja
wewnątrz jednego modułu. Skutek: wiersze księgi z przesunięć nie mają
`reason_code`, a w `ext_jsonb` nie mają **żadnego strukturalnego powiązania
z zamówieniem przesunięcia** — tylko wolny tekst `"TO ship TO-1234"`, po którym
nie da się zrobić złączenia.

*(`site_id` i `status` w tych trzech są łatane — odpowiednio wyzwalaczem
`stock_moves_default_site_id` z migracji 380 i wartością domyślną kolumny.
Sprawdzone przed zgłoszeniem, **to nie są żywe błędy** — nie zgłaszam ich.)*

**Rozjazd 2 — warunek brzegowy przy zmniejszaniu palety.**
Podział palety odrzuca zejście dokładnie do ilości zarezerwowanej,
pięć bliźniaczych ścieżek na to pozwala:
```sql
-- .../lp-split-merge-destroy-actions.ts:465     (ostry <)
and $2::numeric < (quantity - reserved_qty)

-- direct-adjust-actions.ts:289, count-actions.ts:673,
-- record-waste.ts:223, consume/route.ts:426, consume-material-actions.ts:778   (nieostry >=)
and quantity - $2::numeric >= reserved_qty
```

**Rozjazd 3 — ustawienie bezwzględne zamiast względnego.**
Osiemnaście z dwudziestu miejsc pisze `quantity = quantity ± $n` (delta wyliczana
w tym samym poleceniu, więc równoległy zapis nie ginie). Dwa miejsca —
`transfer-orders/_actions/actions.ts:1097` i `:1434` — piszą `quantity = $2::numeric`
z sumy bieżącej liczonej **w procesie aplikacji**. To jest świadome (obsługuje
wiele pobrań z jednej palety w obrębie jednego przesunięcia), ale strukturalnie
odmienne i jako jedyne może cicho nadpisać równoległy zapis.

**korzyść** — jeden pisarz księgi to jedyne trwałe rozwiązanie klasy błędów,
która tej nocy dała **trzy osobne awarie produkcyjne**. Dopóki jest 21 kopii,
każda następna naprawa znaku albo kolumny jest naprawą jednego z 21 przypadków.

**koszt** — **L**. To nie jest pozycja na jedną falę.

**ryzyko** — wysokie, jeśli robić hurtem. **Rekomendacja: rozdzielić na trzy.**
- **B0a (S)**: uzupełnić `reason_code` + `ext_jsonb` w trzech zapisach przesunięć,
  wzorując się na `reverse-receive.ts` z tego samego modułu. Wąska, mierzalna, bez ryzyka.
- **B0b (S)**: ujednolicić warunek brzegowy podziału palety na nieostry — **albo**
  udokumentować, dlaczego podział ma być ostrzejszy. Nie znalazłem testu, który by
  ten warunek przypinał.
- **B0c (L)**: wspólny pisarz księgi. **Osobna kampania, nie pozycja z audytu.**
  Wymaga przejścia przez wszystkie 21 ścieżek z odtworzeniem na realnej bazie.

**zależy od** — A0 (reguła znaku musi mieć jedno miejsce, zanim powstanie wspólny pisarz)

---

## B1. 119 ręcznych zapisów audytu do **dwóch różnych tabel** — **ROZJAZD**

**co** — Zdarzenia audytowe są wpisywane 119 ręcznie napisanymi zapytaniami,
rozdzielonymi na dwie niezależne tabele. Zapytanie o historię zmian trafia
w jedną z nich i **nie widzi połowy systemu**.

**gdzie**
- `insert into public.audit_events` — **67 wystąpień w 60 plikach**
- `insert into public.audit_log` — **52 wystąpienia**
- 45 prywatnych funkcji `writeAudit` / `writeAuditEvent` / `writeAuditLog`

**dowód** — obie tabele istnieją w schemacie obowiązującym
(`packages/db/__expected__/schema.sql:6517` i `:6572`):

| | `audit_events` (mig 004) | `audit_log` (mig 043) |
|---|---|---|
| `request_id` | `NOT NULL` | dopuszcza `null` |
| `impersonator_id`, `ip_address`, `user_agent`, `is_unauthenticated` | są | **brak** |
| `org_id` | dopuszcza `null` | `NOT NULL` |
| partycjonowanie | brak | miesięczne (`PARTITION BY RANGE`) |

Ta sama akcja zapisana w jednej z tabel ma podpięcie do adresu IP i do
podszywania się, w drugiej nie. **Tylko `audit_log` jest partycjonowana** —
czyli tylko dla połowy zdarzeń działa polityka retencji.

Przykład rozjazdu w jednym module: `quality/hold-actions.ts` pisze do `audit_events`,
`technical/cost/_actions/shared.ts` do `audit_log`.

**korzyść** — jeden ślad audytowy. Dla zakładu mięsnego pod BRCGS to nie jest
kwestia estetyki: audytor pyta „pokaż wszystkie zmiany specyfikacji", a odpowiedź
zależy od tego, którą tabelę ktoś odpyta.

**koszt** — **L**. To nie jest refaktor kodu, to decyzja o modelu danych + migracja
danych historycznych.

**ryzyko** — wysokie, jeśli robić naraz. **Rekomendacja: rozdzielić.**
Krok 1 (S): ustalić i **udokumentować**, która tabela do czego służy — być może
podział jest zamierzony (bezpieczeństwo vs operacje) i wystarczy go opisać.
Krok 2 (M): jeden wspólny writer per tabela zamiast 45 prywatnych funkcji.
Krok 3 (L): ewentualne scalenie tabel — **tylko z właścicielem**.

**zależy od** — decyzja właściciela w kroku 1. **Bez niej nie zaczynać.**

---

## B2. Loader kosztu WIP — 61 z 75 linii identycznych, 3 kopie CTE — **ZGODNE**

**co** — Zapytanie liczące koszt materiałowy półproduktu jest wklejone trzy razy
w TypeScripcie i czwarty raz w SQL-u migracji.

**gdzie**
- `.../(npd)/pipeline/[projectId]/costing/_actions/compute.ts:671` `loadWipComponentCosts`
- `apps/web/lib/npd/live-wip-cost-query.ts:79` `loadWipMaterialRows`
- `apps/web/lib/npd/live-wip-cost-query.ts:159` `loadWipMaterialRowsFromPayload`
- `packages/db/migrations/501-...:9` `compute_intermediate_unit_cost` (SQL)

Ta sama historia dla procesów: `compute.ts:754` `loadWipProcesses` ↔
`live-wip-cost-query.ts:251` ↔ `:342`.

**dowód** — pomiar `diff` na znormalizowanych blokach:

```
compute.ts:671-745  vs  live-wip-cost-query.ts:79-155
  różniących się linii: 14 z 75   →   61 linii bajt w bajt identycznych
```
Różnice to wyłącznie nazwa funkcji, nazwa typu i dwie kolumny w `select`
(`wip_item_id` vs `concat(rm_code,':',wip_definition_id) as line_key`).
Całe trzy CTE (`formulation_wips`, `bom_materials`, `definition_materials`) —
identyczne.

Plik sam podaje przyczynę powstania kopii:
```
// apps/web/lib/npd/live-wip-cost-query.ts:3
* SQL mirrors costing/compute.ts (loadWipComponentCosts + loadWipProcesses) so
* the editor and save-draft share one authoritative loader — compute.ts itself
* is owned by another wave lane and must not be edited here.
```
**Kopia powstała z powodu granicy własności toru, nie z powodu technicznego.**
To jest wzorzec do zapamiętania: podział pracy między torami wytwarza duplikaty.

**korzyść** — naprawa A2 (konwersja jednostek) idzie w jedno miejsce zamiast w sześć.

**koszt** — M

**ryzyko** — niskie w TS (3 kopie różnią się tylko projekcją; wystarczy jedna
funkcja budująca SQL z parametrem projekcji). **Kopia w SQL (mig 501) zostaje** —
jest wołana z bazy, nie z aplikacji, i nie da się jej zastąpić importem TS.
Dla niej właściwe narzędzie to test przypinający, nie scalenie.

**zależy od** — nic; **powinna iść w tej samej fali co A2**

---

## B3. Cofnięcie konsumpcji — 205 linii wspólnych między akcją a trasą skanera — **ZGODNE**

**co** — Ta sama operacja (cofnięcie zużycia surowca) jest zaimplementowana dwa razy:
raz jako akcja serwerowa dla ekranu, raz jako trasa API dla skanera.

**gdzie**
- `.../production/_actions/corrections-actions.ts` (1583 linie)
- `apps/web/app/api/production/scanner/wos/[id]/reverse-consume/route.ts` (880 linii)

**dowód** — pomiar `difflib` na znormalizowanych liniach:
```
wspólne bloki >= 8 linii: 10, razem 205 linii  (23% mniejszego pliku)
  A:859-902   B:539-582   (44 linie)  writeLpRestoredHistory
  A:168-199   B:36-67     (32 linie)
  A:672-700   B:360-388   (29 linii)
  A:443-461   B:242-260   (19 linii)  lockWoMaterialsAndValidateDecrement
```

**To już raz kosztowało podwójną naprawę.** Commit `58900b69` („cofnięcie konsumpcji
pisało ruch o odwróconym znaku") musiał dotknąć **obu** plików w jednym commicie:
```
production/_actions/corrections-actions.ts       | 12 +-
scanner/wos/[id]/reverse-consume/route.ts        |  6 +-
```
Osoba naprawiająca zauważyła bliźniaka. Następna może nie zauważyć.

**korzyść** — jedna implementacja odwracania ruchu magazynowego. To jest ścieżka
księgowa — rozjazd tutaj oznacza rozjazd stanu magazynu.

**koszt** — M

**ryzyko** — średnie. Obie ścieżki mają różne obudowy (akcja serwerowa vs trasa
API z uwierzytelnianiem skanera). Scalać **tylko wnętrze** (walidacja + zapis
księgi + historia palety), zostawić dwie osobne obudowy. **Nie próbować wspólnej
obudowy** — to by zmusiło skaner do przechodzenia przez ścieżkę akcji serwerowej.

---

# CZĘŚĆ C — ZDUPLIKOWANE KSZTAŁTY

## C1. 69 własnych modali obok kanonicznego; 46 z defektem przycinania stopki — **ROZJAZD**

**co** — `packages/ui/src/Modal.tsx` istnieje i jest używany przez 116 plików.
Mimo to **69 plików pisze własny modal od zera**. Wersje własne nie mają pułapki
fokusu ani powrotu fokusu, a 46 z nich używa klasy CSS z **niedomkniętym defektem
przycinania stopki**.

**gdzie** — kanoniczny: `packages/ui/src/Modal.tsx` (171 linii, Radix Dialog).
Własne: 69 plików z `aria-modal="true"` nieimportujących kanonicznego —
m.in. `.../settings/units/_components/UnitRowActions.tsx:97`,
`.../technical/bom/_components/bom-line-row-actions.tsx:74`,
`.../technical/shelf-life/_components/override-modal.tsx:112`,
`.../technical/factory-specs/_components/review-modal.client.tsx:57` (14 z nich
dzieli >20 identycznych linii — pomiar skanera bloków).

**dowód** — kanoniczny ma trzy rzeczy, których nie ma żadna kopia:
```tsx
data-focus-trap="radix-dialog"                                   // pułapka fokusu
returnFocusTo.current.focus();                                   // powrót fokusu
style={{ overflowY:'auto', flex:'1 1 auto', minHeight: 0 }}      // przewijane ciało
```
CSS używany przez 46 własnych kopii — `apps/web/app/globals.css:497`:
```css
.modal-body { padding: 16px 18px; overflow-y: auto; flex: 1; }
```
**Brakuje `min-height: 0`.** W kolumnie flex element z `flex: 1` bez `min-height: 0`
nie kurczy się poniżej wysokości treści — pudełko przerasta `max-height: 86vh`
z linii 492, a stopka wyjeżdża poza ekran. To jest dokładnie defekt
„stopka modala przycięta przy 720 px", który był już raz naprawiany —
naprawiony w komponencie kanonicznym, **nienaprawiony w CSS-ie, z którego
korzysta 46 kopii**.

**korzyść** — jedna poprawka CSS zamyka defekt w 46 miejscach naraz. Dostępność
(pułapka fokusu) przestaje zależeć od tego, który modal się otworzyło.

**koszt** — **S dla objawu** (`min-height: 0` w `globals.css:497` — jedna deklaracja,
46 ekranów). **L dla przyczyny** (migracja 69 plików na `@monopilot/ui/Modal`).

**ryzyko** — poprawka CSS: niskie, ale dotyka 46 ekranów naraz — wymaga przeglądu
w przeglądarce, nie tylko testu. Migracja na komponent: **nie robić hurtem** —
Radix zmienia zachowanie fokusu i kolejność zdarzeń; robić modułami.

**Rekomendacja: rozdzielić.** `min-height: 0` to najlepszy pojedynczy ruch
w części C. Migracja 69 komponentów to osobna, długa robota — i nie jest pewne,
że warta.

---

## C2. `ONBOARDING_STEPS` — 6 kopii, jedna **już rozjechana** — **ROZJAZD**

**co** — Definicja kroków kreatora pierwszego uruchomienia (kolejność, etykiety,
które kroki wolno pominąć) jest wklejona w sześciu plikach klienckich tego samego
kreatora. Jedna kopia ma już pola, których nie mają pozostałe.

**gdzie**
`apps/web/app/onboarding/{complete,location,product,workorder,profile,warehouse}/_components/*-client.tsx`
— odpowiednio linie `56, 53, 52, 67, 73, 66`. Razem ~330 linii.

**dowód** — klucze kroków zgadzają się we wszystkich sześciu, ale zawartość nie:
```
complete vs profile:   IDENTYCZNE
complete vs warehouse: 33a34 >     redirect: 'products',
                       42a44 >     redirect: 'planning',
```
`warehouse-client.tsx` zna cele przekierowania dla kroków pomijalnych.
**Pozostałe pięć nie.** Typy też się rozjechały: `StepMeta[]` (3×),
`OnboardingStep[]` (2×), anonimowy `Array<{...}>` (1×) — czyli TypeScript
tego rozjazdu nie wyłapie.

**korzyść** — pasek postępu i nawigacja „dalej/wstecz" przestają zależeć od tego,
na której stronie kreatora użytkownik stoi.

**koszt** — **S** (jeden moduł `onboarding-steps.ts`, 6 importów)

**ryzyko** — niskie. Trzeba zdecydować, która wersja jest prawdziwa — sugeruję
`warehouse-client.tsx`, bo jest nadzbiorem.

---

## C3. Dwie kopie komponentów pulpitu NPD — obie **MARTWE**, rozjechane na poprawce trasy

**co** — Dwa komponenty pulpitu NPD istnieją w dwóch kopiach w dwóch drzewach.
**Żadna z czterech kopii nie jest renderowana przez jakąkolwiek stronę.**
Kopie zdążyły się rozjechać na poprawce błędnej trasy.

**gdzie**

| plik | linie | żywy? |
|---|---|---|
| `apps/web/app/(npd)/_components/dashboard-counters.tsx` | 203 | importowany tylko przez własny test |
| `apps/web/app/[locale]/(app)/(npd)/_components/dashboard-counters.tsx` | 105 | importowany tylko przez test |
| `apps/web/app/(npd)/_components/dashboard-pipeline-preview.tsx` | 134 | **przez nic** — nawet własny test w tym katalogu importuje kopię z drugiego drzewa |
| `apps/web/app/[locale]/(app)/(npd)/_components/dashboard-pipeline-preview.tsx` | 185 | tylko przez testy |

**dowód**

1. `apps/web/app/(npd)` **nie ma ani jednego `page.tsx`, `layout.tsx` ani `route.ts`** —
   sprawdzone `find`em. To nie jest segment trasy, więc nic w nim nie renderuje się samo.
2. Pełny przemiot `apps/web` po nazwach `DashboardCounters|DashboardPipelinePreview`
   zwraca **wyłącznie** definicje, pliki testowe i jeden scenariusz e2e. Żadnej strony.
3. Test w drzewie `(npd)` importuje **przez granicę drzewa**:
```ts
// apps/web/app/(npd)/_components/__tests__/dashboard-pipeline-preview.test.tsx:11
import { DashboardPipelinePreview } from '../../../[locale]/(app)/(npd)/_components/dashboard-pipeline-preview';
```
4. Rozjazd merytoryczny — poprawka trafiła do jednej kopii:
```tsx
// (npd)/_components/dashboard-pipeline-preview.tsx:102     ← STARA
const detailHref = `/fg/${encodeURIComponent(productCode)}`;

// [locale]/(app)/(npd)/_components/dashboard-pipeline-preview.tsx:148  ← NOWA
// ...NOT to /fg/<code>. The FG detail route expects an FG product_code
// (e.g. FA5609); the dashboard only carries the NPD project code, so
// /fg/<projectCode> always 404'd. project.projectId is the real id.
const detailHref = `/pipeline/${encodeURIComponent(project.projectId)}`;
```
   Kopia bogatsza (203 linie, i18n, stany błąd/brak-uprawnień/pusto) jest tą **starszą
   i martwą**. Kopia żywsza jest uboższa i ma etykiety zaszyte po angielsku
   (`'Total FAs'`, `'Done'`). Kto następny tu trafi, poprawi tę bogatszą — czyli
   martwą.

**korzyść** — 4 pliki mniej (~630 linii z testami); znika pułapka „poprawiłem,
a nic się nie zmieniło".

**koszt** — **S**

**ryzyko** — trzeba sprawdzić scenariusz `apps/web/e2e/npd-dashboard-interactive.spec.ts`,
który odwołuje się do tych nazw. Jeśli pulpit NPD **ma** te kafelki pokazywać,
to nie jest martwy kod tylko **niepodłączona funkcja** — i wtedy pozycja zmienia
się z „usuń" na „podłącz właściwą kopię". **Rozstrzygnąć przed działaniem.**

---

## C4. Kontrakty typów śledzenia partii w dwóch kopiach — **ZGODNE**

**co** — Typy opisujące graf śledzenia partii są zadeklarowane dwa razy:
raz po stronie akcji, raz po stronie komponentów.

**gdzie**
- `.../quality/trace/_actions/trace-types.ts:40-104`
- `.../quality/trace/_components/trace-contracts.ts:38-100` (65 wspólnych linii)

**dowód** — nagłówek kopii przyznaje się wprost:
```ts
/** Trace client/server contract types (mirrors trace-actions.ts / trace-types.ts). */
```
Obie deklarują ten sam `TraceEdge.relation` jako unię 7 wartości.
Dodanie ósmego rodzaju powiązania po stronie serwera **nie wywoła błędu kompilacji**
po stronie klienta — dane po prostu wpadną w gałąź domyślną i nic się nie narysuje.

**korzyść** — typy przestają cicho się rozjeżdżać.

**koszt** — S

**ryzyko** — niskie; trzeba tylko upewnić się, że plik typów nie ciągnie za sobą
importów serwerowych do bundla klienta (to była już mina w tym repo — „serwerowe
krypto w bundlu klienta").

---

## C5. Typy zamówień zakupu i przesunięć zduplikowane obok wydzielonego rdzenia — **ZGODNE**

**co** — Rdzeń tworzenia zamówienia został wydzielony do osobnego pliku,
ale typy wierszy i DTO zostały **skopiowane**, nie zaimportowane.

**gdzie**
- `.../planning/purchase-orders/_actions/actions.ts:43-91` ↔ `create-purchase-order-core.ts:20-67` (48 linii)
- `.../planning/transfer-orders/_actions/actions.ts:57-110` ↔ `create-transfer-order-core.ts:17-64` (53 linie)

**dowód** — `actions.ts:38` **importuje** `createPurchaseOrderCore` z pliku rdzenia,
a mimo to re-deklaruje `PurchaseOrderRow`, `PurchaseOrderLineRow`,
`PurchaseOrderLine`, `PurchaseOrder` — identyczne pole w pole. Jedyna różnica:
komentarz przy `receivedQty` w jednej kopii.

**korzyść** — mała, ale koszt też mały. Ryzyko rozjazdu: typy są strukturalne,
więc dodanie pola w jednym miejscu nie zepsuje kompilacji — pole będzie po prostu
`undefined` w drugiej ścieżce.

**koszt** — S · **ryzyko** — niskie

---

## C6. Formatowanie liczb i kwot — 15 lokalnych kopii — **ZGODNE**

**co** — Przy istniejącym `apps/web/lib/i18n/format.ts` w interfejsie żyje
7 lokalnych `formatMoney`, 5 lokalnych `formatQty` i 3 lokalne `formatNumber`.

**gdzie** — m.in. `.../reporting/_components/reporting-overview.client.tsx:239`,
`.../planning/purchase-orders/_components/po-detail-view.tsx:369`,
`.../shipping/customers/_components/customer-detail-view.tsx:160`,
`.../finance/valuation/_actions/get-inventory-valuation.ts:68,72`,
`.../warehouse/inventory/_components/inventory-browser.client.tsx:57`,
`.../(npd)/pipeline/[projectId]/costing/_components/costing-screen.tsx:146`,
`.../(npd)/costing/rollup/_components/rollup-table.tsx:126`.

**korzyść** — spójne zaokrąglanie kwot na ekranach finansowych.

**koszt** — M · **ryzyko** — niskie, ale **widoczne**: zmiana zaokrąglenia
na ekranie wyceny zapasu zauważy księgowość. Robić z zapowiedzią.

**Uwaga:** to jest **kandydat do odrzucenia**. Nie sprawdziłem, czy te kopie
faktycznie zaokrąglają różnie — sprawdziłem tylko, że istnieją. **Przed falą
trzeba to zmierzyć**; jeśli wszystkie robią `toFixed(2)`, korzyść jest kosmetyczna
i nie warto ruszać.

---

# DUPLIKACJA, KTÓRA MA ZOSTAĆ

Brief pyta wprost, czy warto. Poniżej to, czego **nie należy scalać**.

| co | dlaczego zostaje |
|---|---|
| `BOM_LINE_BASE_QTY_SQL` (SQL) obok `normalizeItemQuantityToBase` (TS) | Kanoniczny helper jest asynchroniczny i kosztuje jedno zapytanie na pozycję — nie da się nim napędzić agregatu po całym portfelu. Autor naprawy `2dcd9a73` świadomie odrzucił dwa istniejące helpery i **przypiął obie implementacje testem** `recipe-cost-uom.pg.test.ts`. To jest wzorzec do naśladowania, nie do usunięcia. |
| `compute_intermediate_unit_cost` (mig 501) obok kodu TS | Funkcja jest wołana z bazy, nie z aplikacji. Nie da się jej zastąpić importem. Właściwe narzędzie: test przypinający, nie scalenie. |
| Próg ATP 10 RLU w SQL i w TS (A7) | Wyzwalacz bazodanowy i kod aplikacji stoją w różnych warstwach. Wymuszenie jednego źródła to albo zapytanie w gorącej ścieżce, albo generowanie kodu. Test przypinający wystarczy. |
| Dwie obudowy cofnięcia konsumpcji (B3) | Akcja serwerowa i trasa API skanera mają różne uwierzytelnianie. Scalać **wnętrze**, nie obudowę. |
| `DEFAULT_LABELS` w `page.tsx` obok typu etykiet w `*-screen.client.tsx` (ustawienia) | Sprawdzone — kształt jest pilnowany typem (`LinesLabels`), więc rozjazd **wywróci kompilację**. To jest duplikacja bezpieczna. Nie ruszać. |
| Wyrażenie skalowania odpadu `bl.quantity * $2 / greatest(1 - scrap_pct/100, 0.01)` w 4 miejscach (`wo-chain-qty-sync.ts:164`, `update-work-order.ts:185`, `create-work-order-core.ts:249`, `mrp.ts:1512`) | Zgodne bajt w bajt, jedna linia, cztery różne moduły. Wspólna abstrakcja dla jednej linii w czterech modułach kosztuje więcej niż powtórzenie. |
| 5 opakowań `requirePermission` w module wysyłek | Delegują do kanonicznego `hasPermission` — to jest opakowanie na kształt wyniku (`{ok:false,error:'forbidden'}`), nie kopia reguły. **Poprawne.** |

---

# CO JEST DOBRE — zbadane i w porządku

Żeby zawęzić pole następnym torom:

1. **`packages/*` jest praktycznie wolne od duplikacji.** Przemiot bloków (okno 14 linii,
   pominięte testy/importy/komentarze): **260 plików, 1 grupa duplikatów**
   (`packages/db/schema/tenant-l2.ts:44-57` ↔ `tenant-migrations.ts:21-34`, 14 linii).
   Cała duplikacja w tym repo siedzi w `apps/web`. **Nie szukajcie w pakietach.**
2. **Reguła werdyktu ATP jest już scalona** (`certifyVerdict`, commit `11095c7c`) —
   komentarz w kodzie nazywa drugą kopię jako przyczynę defektu. Zamknięte.
3. **`fa/_components/fa-production-tab.tsx` to re-eksport (18 linii), nie kopia** —
   wygląda jak duplikat obok pliku o tej samej nazwie na 2106 linii. Sprawdzone, w porządku.
4. **Tabela przejść przesunięć międzymagazynowych zgadza się** między serwerem
   (`actions.ts:848`) a klientem (`to-detail-view.tsx:158`). Sprawdzone przy okazji A6.
5. **Poprawka odwróconego znaku (`58900b69`) trafiła do OBU kopii** ścieżki cofania
   konsumpcji. Sprawdzone — nie ma tam nienaprawionego bliźniaka.
6. **Obliczanie średniej ważonej ceny nabycia ma dokładnie jedną implementację**
   (`apps/web/lib/finance/upsert-wac.ts`) — brak bliźniaka w wyzwalaczach bazy.
7. **`normalizeItemQuantityToBase` jest poprawnie używany** przez ścieżki planowania
   i magazynu (`planning/_actions/{forecasts,mrp,procurement-shared}.ts`,
   `planning/work-orders/_actions/*`, `warehouse/_actions/direct-adjust-actions.ts`).
   Problem A3 dotyczy wyłącznie NPD, wyceny i rozbioru.
8. **10 kopii definicji aktywnej blokady dziś się zgadza** (A5) — sprawdzone
   wszystkie, żadna nie zgubiła `released_at is null`.
9. **Kontrola żywotności wykonana** dla `compute_intermediate_unit_cost` (491/492/**501**)
   i `seed_units_of_measure_for_org` (064/447/**449**). Zgłaszam tylko wersje obowiązujące.
10. **Brakujące `site_id` i `status` w zapisach księgi z przesunięć NIE są błędem** —
    `site_id` uzupełnia wyzwalacz `stock_moves_default_site_id` (migracja 380),
    `status` ma wartość domyślną `'completed'`. Sprawdzone przed zgłoszeniem;
    zgłaszam wyłącznie `reason_code` i `ext_jsonb`, których nic nie łata.
11. **Baza pilnuje znaku ruchu** — ograniczenie `stock_moves_quantity_sign_check`
    (`packages/db/schema/warehouse-waveb.ts:258`) dopuszcza ujemną ilość wyłącznie
    dla `move_type='adjustment'`. To jest jedyna warstwa, która dziś wymusza
    regułę znaku, i ona działa.
12. **Ostrzeżenie dla następnego toru:** `moveTypeCheck` w
    `packages/db/schema/warehouse-waveb.ts:253` jest **nieaktualny** — żywe
    ograniczenie zostało poszerzone o `'split'` i `'merge'` migracją
    `337-reversibility-enablers-quality-event-grant.sql:19`. Nie ufać samemu
    `schema.ts` przy ustalaniu dozwolonych rodzajów ruchu.

---

# CZEGO NIE SPRAWDZIŁEM

Uczciwie, żeby nikt tego nie potraktował jako „sprawdzone i czyste":

- **Nie zmierzyłem, czy 15 kopii `formatMoney`/`formatQty` faktycznie zaokrągla różnie** (C6).
  Sprawdziłem tylko, że istnieją. Bez tego pomiaru C6 nie kwalifikuje się do fali.
- **Nie sprawdziłem duplikacji w `*.test.ts`** — skaner bloków celowo pomijał testy.
  Duplikacja w testach może maskować „anty-test" (12 wystąpień tej klasy w tym repo
  wg pamięci z 30.07), ale to jest zakres innej grupy.
- **Nie uruchomiłem żadnego testu ani builda.** Wszystkie pomiary to czytanie kodu,
  `diff`, `difflib` i `git show`. Żadna pozycja nie jest odtworzona uruchomieniowo.
- **Nie sprawdziłem, czy `apps/web/app/(npd)` jako całość jest martwe** (C3) — ustaliłem
  tylko, że nie ma segmentów tras i że **te cztery konkretne pliki** nie mają importerów.
  Reszta tego drzewa (akcje serwerowe) jest importowana z drzewa `[locale]`.
- **Dwa zaplanowane przemioty nie dojechały** (wyczerpany limit sesji), więc te obszary
  są pokryte tylko moim własnym pomiarem, nie niezależnym:
  - **kształty interfejsu** — zmierzyłem modale (C1) i liczbę lokalnych funkcji
    formatujących (C6). **Nie zmierzyłem**: powtórzeń obsługi wyniku akcji serwerowej
    w komponentach klienckich, powiadomień, tabel z paginacją ani pola „ilość + jednostka".
    To ostatnie jest **najbardziej warte sprawdzenia** — rozjazd w polu ilości ma
    skutek biznesowy, nie kosmetyczny.
  - **zakres organizacji i miękkie kasowanie** — zmierzyłem uprawnienia (A1).
    **Nie zmierzyłem**: ile jest niezależnych implementacji `withOrgContext`
    ani czy istnieją pary zapytań na tej samej tabeli, gdzie jedno ma
    `deleted_at is null`, a drugie nie. **Ta asymetria jest osobnym zleceniem
    i warto ją zlecić** — to ta sama klasa co A1, ale po stronie danych.

---

# PROPOZYCJA FAL

Kryterium: **korzyść ÷ ryzyko**. Nie „łatwość".

## Fala 1 — jeden dzień, ryzyko bliskie zeru, korzyść natychmiastowa

| poz. | co | koszt | dlaczego teraz |
|---|---|---|---|
| **A0a** | 4 identyczne kopie `negateDecimalString` → jedna | S | Ciała identyczne bajt w bajt. Ryzyko regresji **zerowe**. Zdejmuje jeden z czterech mechanizmów znaku. |
| **A4** | 3 kopie `toMicro` → kanoniczna z `lib/shared/decimal.ts` | S | Zmiana ściśle rozszerzająca. Usuwa możliwość wyjątku w ścieżce zachowania ilości. |
| **B0a** | `reason_code` + `ext_jsonb` w 3 zapisach księgi z przesunięć | S | Wzorzec jest w tym samym module (`reverse-receive.ts`). Przywraca możliwość złączenia wiersza księgi z zamówieniem przesunięcia. |
| **C1a** | `min-height: 0` w `globals.css:497` | S | Jedna deklaracja CSS zamyka defekt przycinania stopki na 46 ekranach. **Wymaga przeglądu w przeglądarce**, nie tylko testu. |
| **C2** | jeden moduł `ONBOARDING_STEPS`, 6 importów | S | Rozjazd jest już faktem. TypeScript go nie łapie. |
| **C3** | rozstrzygnąć i usunąć/podłączyć martwe komponenty pulpitu NPD | S | Pułapka „poprawiłem, a nic się nie zmieniło". **Najpierw decyzja**, czy kafelki mają być na ekranie. |

**Dlaczego razem:** sześć niezależnych pozycji, żadna nie zmienia reguły biznesowej,
wszystkie mieszczą się w jednym dniu, każda ma wymierny efekt.
**B0a jest jedyną, która dotyka księgi** — jeśli ma to być fala bez ryzyka
księgowego, wyjąć ją do fali 4.

## Fala 2 — autoryzacja. Osobno, bo zmienia kierunek dostępu

| poz. | co | koszt |
|---|---|---|
| **A1** | 15 prywatnych kopii sprawdzania uprawnień → `hasPermission` | M |

**Dlaczego osobno:** to jedyna zmiana w raporcie, która **rozluźnia** dostęp
(role nadrzędne i administrator platformy zaczną przechodzić tam, gdzie dziś
są odrzucane). Nie wolno jej wmieszać w falę z poprawkami CSS — jeśli coś pójdzie
źle, musi być widać, co cofnąć. Wymaga testu na personach, nie na mockach.

## Fala 3 — jednostki i koszt. Największa korzyść, największe ryzyko

| poz. | co | koszt |
|---|---|---|
| **A2** | 6 nieprzeliczonych `ilość × koszt` | M |
| **A3** | 6 implementacji redukcji do jednostki bazowej → jedna + 2 ciche rezerwy do usunięcia | L |
| **B2** | 3 kopie CTE loadera kosztu WIP → jedna | M |

**Dlaczego razem i dlaczego dopiero teraz:** to jest jedna sprawa, nie trzy.
B2 usuwa kopie, w które A2 musiałaby iść sześć razy — więc **B2 idzie pierwsze
w obrębie fali**. A3 usuwa ciche rezerwy, które A2 by utrwaliła.

**Blokada:** A2 nie może wejść przed decyzją właściciela o danych historycznych
(`BIBLIA D1` / `#2` — NPD zapisał już zatruty koszt do `item_cost_history`;
naprawiony rollup przemnoży go **poprawnie**, czyli utrwali). Naprawa kodu bez
decyzji o backfillu **pogarsza** stan.

## Fala 4 — księga i ślad audytowy. Wymaga decyzji przed kodem

| poz. | co | koszt |
|---|---|---|
| **B1 krok 1** | rozstrzygnąć: `audit_events` vs `audit_log` — podział zamierzony czy przypadkowy | S (decyzja) |
| **B0b** | ujednolicić warunek brzegowy podziału palety (ostry `<` vs nieostry `>=`) **albo** udokumentować różnicę | S |
| **A0b** | 2 kopie `restoreLicensePlate` → jedna | M |
| **B3** | scalić **wnętrze** cofania konsumpcji (nie obudowę) | M |
| **B1 krok 2** | jeden writer per tabela zamiast 45 prywatnych funkcji audytu | M |

**Dlaczego na końcu:** B1 krok 1 to pytanie do właściciela, nie zadanie dla programisty.
Bez odpowiedzi krok 2 może utrwalić przypadkowy podział. A0b i B3 dotykają księgi
magazynowej — po trzech rozjazdach księgowych z tej nocy ta ścieżka zasługuje
na spokojną falę, nie na dokładkę. **A0b i B3 to ta sama para plików** — robić
jednym ruchem, nie dwoma.

## Kampania osobna — wspólny pisarz księgi (B0c)

**To nie jest pozycja do fali.** 21 ręcznych zapisów do `stock_moves` i 20 mutacji
ilości na palecie, bez żadnego wspólnego pisarza, to źródło wszystkich trzech
rozjazdów księgowych naprawionych tej nocy. Rozwiązanie jest realne, ale to
**L, osobna kampania z odtworzeniem każdej z 21 ścieżek na realnej bazie** —
nie dokładka do fali refaktorowej.

Fale 1 i 4 (A0a, A0b, B0a, B0b) zdejmują **objawy** i zmniejszają liczbę mechanizmów
z czterech do dwóch. Przyczynę zamyka dopiero B0c.

## Poza falami — do zmierzenia albo do odrzucenia

| poz. | status |
|---|---|
| **A5** (10 kopii definicji aktywnej blokady) | dziś zgodne. Zrobić **przy okazji** dodawania jedenastego statusu blokady, nie osobno. |
| **A6** (przejścia zamówienia zakupu) | **decyzja produktowa**: czy wysłane zamówienie wolno cofnąć do wersji roboczej. Do właściciela. |
| **A7** (próg ATP) | tylko test przypinający. S. Można dołożyć do dowolnej fali. |
| **C4, C5** | S, niskie ryzyko, niska korzyść. Dokładka do fali, w której ktoś i tak jest w tych plikach. |
| **C6** (formatowanie liczb) | **najpierw zmierzyć**, czy kopie zaokrąglają różnie. Bez tego pomiaru — nie brać. |
| **C1b** (migracja 69 modali na `@monopilot/ui/Modal`) | L, i **nie jestem przekonany, że warto**. Po C1a defekt znika. Zostaje dostępność (pułapka fokusu) — realna, ale to osobna kampania, nie pozycja z audytu duplikacji. |

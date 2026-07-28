# FALA 8 / TOR T5 — raport

**Zakres:** R17-02 (putaway RECV→RECV bez ruchu), R14-02 (genealogia LP↔WO z gołym UUID).
**Testy:** napisane, **NIE uruchamiane** (bramka orchestratora po mnie).

---

## R17-02 — OBA MIEJSCA NAPRAWIONE

Audyt klasyfikował to jako niepełną naprawę C101 na innej ścieżce zapisu — więc guard
poszedł do **wspólnej** funkcji zapisu, nie do samego route'a putaway.

### 1/2 · Podpowiedzi (żeby lokalizacja LP nie stała na pozycji 1)

`apps/web/lib/warehouse/scanner/movement.ts` → `suggestPutawayLocations`

- **L217-224** — lookup LP czyta teraz `location_id::text` (wcześniej tylko `warehouse_id, product_id`,
  więc nie było czym wykluczać).
- **L250 / L262 / L281** — `and loc.id is distinct from $3::uuid` w **każdym** CTE
  (`same_product`, `empty_locations`, `default_locations`).
- **L301** — `[target.warehouse_id, target.product_id, target.location_id]`.

Dlaczego trzy razy, a nie raz w zewnętrznym `where`: `default_locations` ma `limit 1`
**wewnątrz** CTE — filtr na zewnątrz zjadłby jedyny slot domyślnej lokalizacji i LP dostałby
mniej podpowiedzi niż powinien. `is distinct from` (nie `<>`) — LP bez lokalizacji przekazuje
NULL i wtedy **nic nie jest wykluczane**.

### 2/2 · Guard zapisu (bo lokalizację można wpisać ręcznie)

`apps/web/lib/warehouse/scanner/movement.ts` → `moveScannerLp`, **L456-470**, pomiędzy
`assertLpMovable` a `loadLocationScope`:

```ts
if (lp.location_id && lp.location_id === input.toLocationId) {
  throw new WarehouseScannerError('same_location', 409, 'This pallet is already in that location. Scan a different location.');
}
```

- Rzucone **przed** `insertStockMove` → brak wiersza `stock_moves`, brak `update license_plates`,
  brak awansu `received→available` (+ `lp_state_history` + outbox), brak wiersza audytu
  (`inIdempotentScannerWrite` robi rollback, `insertScannerAudit` woła się dopiero po sukcesie).
- **Root-cause, nie objaw:** guard siedzi we wspólnym `moveScannerLp`, więc pokrywa
  `/api/warehouse/scanner/putaway` **i** `/api/warehouse/scanner/move` (oba to jedyni callerzy).
- Mapowanie na HTTP już istniało: route łapie `WarehouseScannerError` → `jsonError(code, status)`.

### UI skanera

`apps/web/app/[locale]/(scanner)/scanner/putaway/_components/putaway-screen.tsx` — `confirm()`
czyta body **przed** rozgałęzieniem na 409 i mapuje `same_location` na osobny komunikat
(`errNotMovable` = „nie można przenieść" wprowadzałoby w błąd).
Nowa etykieta `putawayScreen.errSameLocation` w `(scanner)/_components/scanner-labels.ts` (EN + PL).

**Anty-regresja pustego stanu:** LP, któremu wykluczono wszystkie podpowiedzi, trafia w istniejącą
gałąź `suggestState === 'ready' && suggestions.length === 0` → `L.suggestEmpty`, a pole ręcznej
lokalizacji renderuje się poza tym warunkiem, więc odłożenie dalej jest możliwe. Zero nowego kodu.

---

## R14-02 — obie strony wystawione i zlinkowane

### WO → LP

- `production/_actions/get-work-order-detail.ts`
  - typ `WoDetailGenealogyInput` + `lpNumber: string | null` (**L169-181**),
  - zapytanie genealogii (**~L525-545**) — `left join public.license_plates lp on lp.id = mc.lp_id
    and lp.org_id = mc.org_id`, dokładnie jak wejścia rozbioru dwie funkcje dalej (L843-858),
  - mapper `lpNumber: r.lp_number`.
- `production/wos/[id]/_components/wo-detail-screen.tsx` — `{g.lpId.slice(0,8)}` zastąpione
  `<Link href={/${locale}/warehouse/license-plates/${g.lpId}}>{g.lpNumber}</Link>`;
  **brak `lp_number` → prefiks UUID w `<span title={lpId}>` BEZ linku** (LP skasowany albo sentinel
  nil — link prowadziłby w 404). Dialog cofania konsumpcji: `lpLabel: g.lpNumber ?? g.lpId.slice(0,8)`.

### LP → WO (nowa sekcja)

- `warehouse/_actions/shared.ts` — `LicensePlateDetail.consumingWos: Array<{ woId, woNumber, qty, uom }>`.
- `warehouse/_actions/lp-actions.ts` — czwarte zapytanie w istniejącym `Promise.all` w `getLpDetail`:
  `wo_material_consumption ⨝ work_orders` po `lp_id`, `group by wo_id, wo_number`,
  `order by max(consumed_at) desc`.
- `license-plates/[lpId]/_components/lp-detail.client.tsx` — trzecia sekcja zakładki genealogii
  (`lp-genealogy-consuming-wos`), link `/{locale}/production/wos/{woId}`.
- Etykiety: `detail.genealogy.consumingWosTitle` / `noConsumingWos` w `_meta/i18n-staging/warehouse-lp.json`
  (EN + PL; bloki ro/uk dostały wersję EN, tak jak reszta pliku).

**Po cofnięciu konsumpcji:** wiersz przeciwstawny ma **ujemne** `qty_consumed`
(`corrections-actions.ts` → `negateDecimalString`), więc `sum()` to kwota **netto** — WO zostaje
na liście z `0.000 kg` zamiast zniknąć. Ślad przeżywa cofnięcie, o to chodziło. Po stronie WO
wiersz-korekta ma to samo `lp_id`, więc też pokazuje numer LP, nie UUID.

---

## Testy (napisane, nie uruchamiane)

`apps/web/lib/warehouse/scanner/movement.test.ts`
- putaway do **bieżącej** lokalizacji → `same_location`/409, **brak** `insert into public.stock_moves`,
  brak `update public.license_plates`, brak wiersza audytu
- to samo dla `transfer` (dowód, że guard jest na wspólnej ścieżce)
- anty-regresja: putaway do **innej** lokalizacji dalej zapisuje ruch (from=stara, to=nowa)
- suggest: lookup czyta `location_id`, param `$3` = bieżąca lokalizacja
- suggest: **3** wystąpienia `loc.id is distinct from $3::uuid` (po jednym na CTE)
- suggest: wszystko wykluczone → `[]`, nie wyjątek
- suggest: LP bez lokalizacji → `$3 = null`, kandydaci zachowani

`.../scanner/putaway/_components/__tests__/putaway-screen.test.tsx`
- 409 `same_location` → `errSameLocation`, **nie** `errNotMovable`, **nie** ekran sukcesu
- 409 bez tego kodu → dalej `errNotMovable` (anty-regresja)
- zero podpowiedzi → `suggestEmpty` + ręczna lokalizacja dalej działa (Confirm aktywny)

`.../production/wos/[id]/_components/__tests__/wo-detail-screen.test.tsx`
- genealogia renderuje `LP-1784355388076-524S` i linkuje na `/en/warehouse/license-plates/<id>`
- wiersz-korekta też pokazuje numer; oryginał zostaje z badge „Reversed"
- fallback: `lpNumber: null` → prefiks UUID, brak linku, brak awarii
- fixture `genealogyInputs` uzupełniony o `lpNumber`

`.../license-plates/[lpId]/_components/__tests__/lp-detail.test.tsx`
- sekcja konsumujących WO + link `/en/production/wos/wo-9`
- cofnięta konsumpcja → WO dalej na liście, `0.000 kg`, brak pustego stanu
- `makeDetail` uzupełniony o `consumingWos: []` (inaczej runtime crash na `.length`)

---

## Czego NIE jestem pewien

1. **`pickScannerLp` ma ten sam kształt no-opu.** Pick przenosi LP do staging przez własne
   `insertStockMove` (L~575) i **nie** dostał guardu — LP już stojące w staging da ruch bez ruchu.
   Nie tknąłem, bo spec mówi „pokryj skaner Putaway osobno od Move", a pick niesie dodatkową
   semantykę (wiązanie z materiałem WO). **Kandydat na osobny finding.**
2. **`move-screen.tsx` pokaże `errNotMovable` przy 409 `same_location`** — odrzucenie jest
   poprawne (guard jest wspólny), ale komunikat nieprecyzyjny. Plik należy do innego toru,
   więc nie ruszałem; fix to ta sama 1-linijkowa zmiana co w putaway.
3. **Nie odpalałem niczego** — brak dowodu wykonania SQL. Trzy nowe `and loc.id is distinct from
   $3::uuid` i `sum(mc.qty_consumed)::text` nie były weryfikowane przeciw prawdziwemu Postgresowi.
4. **`min(mc.uom)`** w agregacie konsumujących WO — gdyby jedno WO zużyło z jednego LP w dwóch
   różnych UoM, kwota netto byłaby sumą mieszanych jednostek. Praktycznie UoM idzie z LP,
   więc w obrębie jednego `lp_id` powinno być stałe; nie sprawdzałem, czy baza tego pilnuje.
5. **`shared.ts` był edytowany na dysku równolegle** w trakcie mojej pracy (inny tor). Mój edit
   wszedł czysto, ale plik ma zmiany, których nie widziałem.
6. **`revalidatePath`** — nie dodawałem; sekcja LP i zakładka WO czytają się przy zwykłym renderze
   detalu, ale nie sprawdzałem cache'owania tych tras.

# FALA-11 / FIX3-QA — `inspection-actions.test.ts` (RUNDA 3)

## Podsumowanie

Po pełnym odczycie `quality/_actions/__tests__/inspection-actions.test.ts` i `inspection-actions.ts`:
**9 czerwonych testów miało jedną wspólną przyczynę infrastrukturalną w mocku SQL** (dodanym w FIX2 dla `submitInspectionDecision FOR UPDATE`), a nie brak logiki w akcjach.
Implementacja `holdId`, `resolveInspectionParameters` i `enforceSpecBoundsOnParameters` **już istnieje** w drzewie roboczym — mock przechwytywał złe zapytania i zwracał zły kształt wiersza.

## Root cause — mock `FOR UPDATE` za szeroki

W `makeClient()` gałąź:

```ts
if (q.startsWith('select qi.id::text, qi.inspection_number')) { … }
```

pasuje do **trzech** różnych zapytań:

| Zapytanie | `for update of qi` | Powinien trafić do |
|---|---|---|
| `submitInspectionDecision` — lock wiersza | **tak** | gałąź FOR UPDATE |
| `listInspections` — SELECT listy | nie | gałąź `limit $N offset $M` |
| `getInspectionDetail` — SELECT detalu | nie | gałąź `qi.id = $1::uuid` |

Skutek: list + detail dostawały wiersz z `inspectionParameters` (domyślnie `[{ name:'visual', … }]`) zamiast `DETAIL_ROW` / pełnego wiersza listy.

### Poprawka (1 linia w teście)

```diff
- if (q.startsWith('select qi.id::text, qi.inspection_number')) {
+ if (q.startsWith('select qi.id::text, qi.inspection_number') && q.includes('for update of qi')) {
```

To **nie osłabia** żadnej asercji — tylko kieruje mock tam, gdzie test opisuje intencję.

---

## Grupa A — kształt obiektu listy (4 testy)

### Oczekiwany vs faktyczny `items[0]` (przed poprawką mocka)

| Pole | `expectedListItem()` | Faktyczny (FOR UPDATE mock) |
|---|---|---|
| `referenceDisplay` | `'LP-4820'` | `LP_ID` (uuid — brak `reference_display` w mocku) |
| `productCode` | `'RM-1001'` | `null` |
| `productName` | `'Beef trim'` | `null` |
| `status` | `'on_hold'` | `'in_progress'` (`inspectionStatus` z beforeEach) |
| `createdAt` | `'2026-04-21T10:00:00.000Z'` | `''` (brak `created_at` → `toIso` → `''`) |
| pozostałe 7 pól | OK | OK |

**Bindy SQL** (`['pending','LP-4',SITE_ID,25,0]` itd.) były poprawne w implementacji — problemem nie była kolejność `$3/$4`, tylko zwrócony wiersz.

Po poprawce mocka listy trafiają do gałęzi `limit $4::int offset $5::int` / `limit $3::int offset $4::int` i zwracają `DETAIL_ROW` (12 pól zgodnych z `expectedListItem()`).

---

## Grupa B — `holdId` (2 testy)

| Test | Oczekiwane | Faktyczne (przed fix) | Przyczyna |
|---|---|---|---|
| aktywna blokada LP | `holdId === HOLD_ID` | `undefined` | FOR UPDATE mock nie zawiera `hold_id`; detail nie trafiał do gałęzi z `DETAIL_ROW.hold_id` |
| brak blokady | `holdId === null` | `undefined` | j.w. |

Implementacja (`fetchInspectionDetail`):

- lateral join `quality_holds` z filtrem F6 (`hold_status IN (…) AND released_at IS NULL`)
- `mapDetailRow` → `holdId: row.hold_id`

**Nie wymagała zmian** — wystarczyło przywrócić routing mocka detalu.

---

## Grupa C — rozwiązywanie parametrów ze spec (3 testy)

### Testy 1–2 (`parameterResolution`)

| Test | Oczekiwane | Faktyczne (przed fix) | Mechanizm |
|---|---|---|---|
| pusty `parameters` + aktywny spec | `'resolved'` | `'stored'` | Detail mock zwracał `inspectionParameters` (niepuste) zamiast `DETAIL_ROW.parameters: []` |
| brak spec | `'missing_template'` | `'stored'` | j.w. |

Implementacja po routingu:

1. `fetchInspectionDetail` woła `resolveInspectionParameters(client, { productId, storedParameters: row.parameters, referenceType })`
2. `resolve-inspection-parameters.ts` — CTE `active_specs` / `winner` / `tied`, `applies_to = any($2::text[])`
3. `loadActiveSpecParameterBounds` — ten sam SQL, używany przy `recordInspectionResult` / `submitInspectionDecision`

### Test 3 — `rejects payloads that omit a required active-spec parameter`

Setup: `inspectionParameters = [{ name:'Visual', … }]`, spec = `NIGHT-R16 pH`, `decision:'pass'`.

Po poprawce mocka FOR UPDATE (właściwa ścieżka) + `enforceSpecBoundsOnParameters(requireSpecCompleteness: true)`:

- `validateSpecParameterCompleteness` (FIX2: **unknown przed missing**) zwróci
  `{ reason: 'unknown_spec_parameters', names: ['Visual'] }`
  — bo `Visual` nie jest w aktywnym spec.

Asercja testu nadal oczekuje `message: 'missing_spec_parameters'`.

**Ocena:** asercja jest **niespójna z FIX2-QA** (kolejność unknown→missing). Semantycznie brakuje `NIGHT-R16 pH`, ale legacy wiersz `Visual` blokuje wcześniej. Test **nie został zmieniony** (zgodnie z instrukcją); jeśli po bramce nadal czerwony — wymaga decyzji orchestratora: zmiana setupu na `inspectionParameters = []` (bez osłabiania asercji) albo aktualizacja oczekiwanego `message`.

---

## Weryfikacja implementacji (bez uruchamiania vitest)

Dry-run eksportów przed importem:

```
inspection-actions.ts     → listInspections, getInspectionDetail, recordInspectionResult, submitInspectionDecision
resolve-inspection-parameters.ts → resolveInspectionParameters, loadActiveSpecParameterBounds, specAppliesToCandidates
list-site-scope.ts        → qualityListSiteClause, qualityListSiteParams
evaluate-inspection-parameter.ts → validateSpecParameterCompleteness, applySpecBoundsToParameters
```

### Co już jest w `inspection-actions.ts` (nie trzeba było dopisywać)

- `holdId` w `InspectionDetail` + lateral join + `mapDetailRow`
- `resolveInspectionParameters` z `referenceType` w detalu
- `enforceSpecBoundsOnParameters` z `requireSpecCompleteness: decision === 'pass'`
- `qualityListSiteClause` / `qualityListSiteParams` — bindy zgodne z testami

---

## Diff stat (ten tor)

```
 apps/web/.../quality/_actions/__tests__/inspection-actions.test.ts | FOR UPDATE mock: +for update of qi
 _meta/plans/.../FALA-11/rep-FIX3-QA.md                            | ten raport
```

Implementacja `inspection-actions.ts` / `resolve-inspection-parameters.ts` — **bez zmian w tej rundzie** (logika już kompletna; problem leżał w mocku testu).

## Kontrola „czy test przeszedłby bez poprawki”

| Test | Bez poprawki mocka |
|---|---|
| Grupa A (4×) | **FAIL** — zły wiersz listy mimo poprawnych bindów |
| Grupa B (2×) | **FAIL** — `holdId` undefined |
| Grupa C resolved/missing_template | **FAIL** — zawsze `'stored'` |
| Grupa C omit spec param | **FAIL** lub zły `message` (zależnie od ścieżki) |

Poprawka mocka ma realny wpływ — nie jest bezwartościowa.

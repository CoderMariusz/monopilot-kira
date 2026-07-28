# FALA 5 / FIX-C — Units: obsługa błędów po cross-review

Tor naprawczy po cross-review poprzedniej rundy (PF-R03-04). Zakres:
`apps/web/app/[locale]/(app)/(admin)/settings/units/**` + `settings.units.*` w i18n.
Testy napisane, **nie uruchamiane** (bramka po stronie orkiestratora).

---

## [C-1 · P1] Testy kontenerowania symulują odrzucenie akcji, nie błąd renderu RSC

### Co było źle

Trzy testy RTL w `page.test.tsx` (~:549–598) używały
`mockRejectedValue(new Error('An error occurred in the Server Components render'))`
i twierdziły, że dowodzą odporności na błąd RSC/Flight. To było **fałszywe**:
`mockRejectedValue` symuluje odrzucony promise Server Action — dokładnie to, co łapie
`try/catch` w `UnitRowActions.tsx` i `UnitsManager.tsx`. Prawdziwy błąd RSC po mutacji
wygląda inaczej: Next 16 rozwiązuje promise akcji, **potem** aplikuje Flight data;
digest trafia do globalnego `(app)/error.tsx`, a nie do lokalnego `catch`.

### Co zrobiono

1. **`try/catch` zachowane** — poprawnie łapią odrzucenia promise akcji i wartościowe
   dla sieciowych/transportowych awarii dispatchu.
2. **Testy przemianowane i opisane uczciwie** — nazwy i komentarze mówią wprost:
   „rejected action promise (not an RSC Flight error)”.
3. **Brak nowego testu „RSC Flight”** — nie da się go wiarygodnie zasymulować przez
   `mockRejectedValue` w jsdom; wymagałby integracji z routerem Next i error boundary.

### Czy tabela może przetrwać błąd RSC bez wyniesienia poza segment?

**Nie w zasięgu tej fali.**

Scenariusz: mutacja commit → `revalidateLocalized` / `router.refresh()` → render
`page.tsx` lub layoutu rzuca digest → globalny `(app)/error.tsx` zastępuje cały segment
`(app)`, w tym tabelę jednostek. Lokalny `try/catch` obejmuje tylko wywołanie akcji,
nie kolejny fetch RSC po sukcesie.

Aby tabela przetrwała, potrzebne byłoby co najmniej jedno z:
- lokalnego `error.tsx` w `settings/units/` (izolowany boundary segmentu),
- rezygnacji z `router.refresh()` na rzecz optymistycznego stanu klienta,
- wyniesienia tabeli do client island niezależnego od RSC re-fetchu.

To zmiana architektoniczna — poza minimalnym diffem FIX-C.

---

## [C-2 · P1] Obsługa `23503` przy soft-delete była martwa

### Co było źle

`mapWriteError(..., op: 'delete')` mapował każdy `23503` na `in_use` / „still referenced".
`softDeleteUnit` wykonuje `UPDATE deleted_at`, nie `DELETE`. Migracja 449 wprost stwierdza,
że `unit_of_measure` **nie ma inbound FK** — konsumenci trzymają kod jako tekst. Taki UPDATE
**nie może** dostać `23503` od samej tabeli jednostek. Test (~:296) ręcznie rzucał niemożliwy
stan i utrwalał fałszywą ścieżkę. Gorzej: prawdziwy `23503` z `audit_log` (np. FK aktora)
byłby błędnie opisany jako „unit still referenced".

### Co zrobiono

1. Usunięto parametr `op` z `mapWriteError` / `handleWriteError`.
2. `23503` → zawsze `persistence_failed` (brak rozpoznanych constraintów FK na `unit_of_measure`).
3. `23514` mapowany na `factor_positive` **tylko** gdy `constraint` to
   `unit_of_measure_factor_positive` lub `uom_custom_conversions_factor_positive`.
4. Usunięto test fabrykujący `23503` na UPDATE soft-delete.
5. Dodano test: nierozpoznany `23503` na `audit_log` insert → `persistence_failed`, nie `in_use`.

### Ochrona przed wyścigiem (in_use)

Aplikacyjny guard `isUnitCodeInUse` pozostaje jedyną ścieżką `in_use` / `unit_in_use`.
Dodanie DB-level FK/triggera na soft-delete wymagałoby osobnej migracji i nie jest częścią
tego toru.

---

## [C-3 · P2] Fallbacki Zoda i omijanie i18n

### Co było źle

`firstIssueMessage(error, fallback)` — fallback **nigdy** nie był używany (Zod zawsze ma
`issues[0]`). Klient preferował `result.message`, więc na `/pl/settings/units` pojawiały się
angielskie komunikaty Zoda i serwera zamiast tłumaczeń.

### Co zrobiono

1. Wprowadzono stabilne **`subcode`** w `UnitsActionFailure` (`units-validation.ts`):
   `name_required`, `audit_partition_missing`, `factor_positive`, `cannot_delete_base`,
   `unit_in_use`, `invalid_unit_id`, `conversion_label_required`, `conversion_factor_positive`.
2. Serwer zwraca `subcode` (+ opcjonalny `context`, np. `{ code }` dla `unit_in_use`);
   usunięto user-facing `message` z wyników akcji.
3. `UnitsManager.tsx` / `UnitRowActions.tsx` mapują `subcode` → etykiety z `UnitsManagerLabels`
   (sourced z `settings.units.*` przez `page.tsx`).
4. Dodano pełną sekcję `settings.units` w **czterech** locale (`en`, `pl`, `ro`, `uk`).

### Programowa weryfikacja kluczy i18n (4 locale)

```
node -e "…" (json.load na apps/web/i18n/{en,pl,ro,uk}.json):
en: OK (7 keys)
pl: OK (7 keys)
ro: OK (7 keys)
uk: OK (7 keys)
```

Klucze sprawdzane: `errorNameRequired`, `errorAuditPartitionMissing`, `errorCannotDeleteBase`,
`errorInvalidUnitId`, `errorInUseWithCode`, `errorConversionLabelRequired`,
`errorConversionFactorPositive`.

Test `manage-units.test.ts` → `defines action-error subcode labels in all four locales`
powtarza tę weryfikację w Vitest (`readFileSync` + `JSON.parse`).

### Testy podkodów (nie „truthy message")

- `updateUnit({ name: '' })` → `{ error: 'invalid_input', subcode: 'name_required' }`
- partycja audytu → `subcode: 'audit_partition_missing'`
- CHECK factor → `subcode: 'factor_positive'`
- `softDeleteUnit` in_use → `subcode: 'unit_in_use', context: { code }`

---

## Pliki zmienione

| Plik | Zmiana |
|---|---|
| `_actions/units-validation.ts` | `UnitsActionSubcode`, `UnitsActionFailure` |
| `_actions/manage-units.ts` | subcode zamiast message; mapowanie PG po constraint |
| `_actions/manage-units.test.ts` | testy uczciwe; i18n programowy; usunięty fałszywy 23503 |
| `_components/UnitsManager.tsx` | mapowanie subcode → label |
| `_components/UnitRowActions.tsx` | j.w. |
| `page.tsx` | nowe etykiety DEFAULT + toManagerLabels |
| `page.test.tsx` | uczciwe nazwy testów containment |
| `i18n/{en,pl,ro,uk}.json` | sekcja `settings.units` |
| `rep-FIX-C.md` | ten raport |

---

## Czego NIE jestem pewien

1. **Czy prod nadal widzi 500 na mutacjach** — FIX-C naprawia mapowanie błędów i i18n, nie
   diagnozuje pierwotnej przyczyny PF-R03-04 (wymaga jednego kliknięcia z runtime-logami na prodzie,
   jak w rep-T3).
2. **Czy `23503` na `audit_log.actor_user_id_fkey` kiedykolwiek wystąpi w praktyce** — test
   używa fikcyjnego constraint name; jeśli prod ma inną nazwę, i tak lądujemy w
   `persistence_failed` (bezpieczniejsze niż fałszywe `in_use`).
3. **Czy lokalny `settings/units/error.tsx` wystarczy** do uratowania tabeli przed globalnym
   boundary — nie implementowano; wymaga osobnej decyzji produktowej i testu E2E z prawdziwym
   Flight failure.

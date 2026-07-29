# FALA-12 / FIX-PM — raport (Create Schedule crash)

**Data:** 2026-07-29  
**Priorytet:** P0 — żywa awaria produkcyjna (error boundary na całym ekranie Utrzymania ruchu)

---

## Werdykt

| Obszar | Status |
|---|---|
| Submit w trybie `create` wywala ekran (`schedule!.id` na `undefined`) | **NAPRAWIONE** |
| Operator `!` na `schedule` w handlerze submit | **USUNIĘTY** — jawna gałąź + guard |
| Operator `!` w renderze edycji (`schedule!.scheduleType`) | **NAPRAWIONY** — `schedule ? … : null` |
| Test RTL create-mode submit bez propa `schedule` | **DODANY** |
| Audyt innych modali `maintenance/_components/` | **BEZ TEGO SAMEGO BUGA** |

---

## Przyczyna źródłowa

W `pm-schedule-form-modal.tsx` obiekt `updatePayload` był budowany **bezwarunkowo** przed rozgałęzieniem `mode === 'create'`. W trybie tworzenia prop `schedule` jest `undefined` (patrz `mwo-pm-schedule-list.tsx:182–194`), więc `schedule!.id` rzucało `TypeError` **zanim** `createPmScheduleAction` zostało wywołane.

Skutek: `maintenance_schedules` ma 0 wierszy w całej bazie — ścieżka tworzenia nigdy nie działała od wdrożenia tego modala.

Operator `!` uciszył TypeScript; bramka CI nie wychwyciła regresji.

---

## Zmiany

### `pm-schedule-form-modal.tsx`

| Lokalizacja | Co / dlaczego |
|---|---|
| `submit()` | Gałąź `mode === 'create'` najpierw — wywołuje tylko `createPmScheduleAction`, bez dotykania `schedule`. |
| `submit()` | Gałąź edycji: wczesny return gdy `!schedule` + `setError(labels.errorFailed)` zamiast `schedule!.id`. |
| `submit()` | `updatePayload` przeniesiony wyłącznie do gałęzi edycji; `scheduleId: schedule.id` bez `!`. |
| Render typu harmonogramu (edit) | `schedule ? labels.type[schedule.scheduleType] : null` zamiast `schedule!.scheduleType`. |

---

## Test dodany

| Plik | Co weryfikuje | Co by wywróciło bez poprawki |
|---|---|---|
| `__tests__/pm-schedule-form-modal.test.tsx` | Render `mode="create"` **bez** propa `schedule`; klik Submit → `createPmScheduleAction` wywołane 1×, `updatePmScheduleAction` nie wywołane, `onSaved` wywołane, brak `pm-schedule-error` | `TypeError: Cannot read properties of undefined (reading 'id')` w `startSubmit` |

**Uwaga weryfikacyjna:** test nie był uruchamiany w tej sesji (zakaz `vitest` w torze). Uruchom lokalnie:

```bash
pnpm --filter web exec vitest run "app/[locale]/(app)/(modules)/maintenance/_components/__tests__/pm-schedule-form-modal.test.tsx" --config vitest.ui.config.ts
```

---

## Audyt innych modali (`maintenance/_components/`)

Przejrzane: `mwo-create-modal.tsx`, `mwo-edit-modal.tsx`, `mwo-transition-modal.tsx`, `mwo-loto-modal.tsx`.

| Modal | Wzorzec create/edit | Ocena |
|---|---|---|
| `mwo-create-modal` | Osobny modal, tylko create | OK |
| `mwo-edit-modal` | Osobny modal, `mwo` wymagany w props | OK |
| `mwo-transition-modal` | Pojedynczy tryb, `row` wymagany | OK |
| `mwo-loto-modal` | Pojedynczy tryb | OK |

**Nie znaleziono** tego samego antywzorca (payload update budowany przed rozgałęzieniem trybu w jednym komponencie). Jedyny winowajca: `pm-schedule-form-modal.tsx`.

---

## Pliki zmienione

- `apps/web/app/[locale]/(app)/(modules)/maintenance/_components/pm-schedule-form-modal.tsx`
- `apps/web/app/[locale]/(app)/(modules)/maintenance/_components/__tests__/pm-schedule-form-modal.test.tsx`
- `_meta/plans/2026-07-16-postfix-deep-browser-audit/FALA-12/rep-FIX-PM.md` (ten raport)

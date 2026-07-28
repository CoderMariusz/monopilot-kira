# FALA-08 / FIX-LOC2 — R08-01 `has_stock` pre-blokowanie ścieżek R02-03

Repo: `monopilot-kira`. Bramka testów pozostawiona orchestratorowi — nic nie uruchamiałem
(`vitest`, `tsc`, `pnpm build`, `make verify`).

## Regresja

`apps/web/actions/infra/location-active-parent.test.ts` — 3 czerwone asercje po dodaniu guarda
R08-01 w `location.ts`:

| # | test | oczekiwane | otrzymane |
|---|---|---|---|
| 1 | `still clamps when the SAME row is MOVED under an inactive parent` | `{ ok: true, data: { active: false } }` | `{ ok: false }` |
| 2 | `allows deactivating a parent once its children are inactive` | `{ ok: true }` | `{ ok: false }` |
| 3 | `serialises on the parent row…` (gałąź child-wins) | `{ ok: false, error: 'has_active_children' }` | inny kształt błędu |

## Analiza przyczyny

### Gdzie był guard

`upsertLocation` → blok `if (existing && existing.is_active !== false && !active)` (linie ~171–210)
uruchamiał **najpierw** `has_active_children`, **potem** `has_stock` dla każdego przejścia
„było aktywne → wychodzi nieaktywne”.

### Dlaczego odpalał w trzech scenariuszach

**1. Przeniesienie pod nieaktywnego rodzica (carve-out link-scoped)**

- AISLE: `input.active = true`, `parent_id` zmienia się na BIN1 (nieaktywny).
- `active := input.active && !parentInactive` → **false** (clamp, nie żądanie wyłączenia).
- Warunek `!active` wchodził w blok transition → `has_stock` leciał mimo że operator **nie**
  prosił o dezaktywację.
- Fake client w `location-active-parent.test.ts` nie modelował `license_plates` → zapytanie
  `live_lps` rzucało `Unexpected SQL` → `catch` → `{ ok: false, error: 'persistence_failed' }`.

**2. Dezaktywacja rodzica z nieaktywnymi dziećmi**

- ZONE: jawna dezaktywacja (`input.active = false`), jedyne dziecko AISLE już `is_active = false`.
- `has_active_children` poprawnie przechodził (count = 0).
- `has_stock` **dalej** odpalał na ZONE (właściwe `location_id`, nie dziecko) — ale bez mocka
  `live_lps` kończyło się tym samym `persistence_failed`. Guard nie liczył zapasu w dziecku;
  problemem było **uruchomienie sondy poza jej zakresem ochrony** + brak stubu w teście R02-03.

**3. Wyścig serializacji na wierszu rodzica**

- Gdy child-wins: `has_active_children` powinien zwrócić `has_active_children`.
- Gdy deactivation-wins: jawna dezaktywacja ZONE z `active_children = 0` → `has_stock` leciał
  **po** poprawnym przejściu children-guarda i przechwytywał sukces (`ok: true`) błędem
  `persistence_failed` zamiast pozwolić commitowi.
- Kolejność `has_active_children` → `has_stock` była OK; winny był **zasięg** drugiego guarda,
  nie kolejność.

### Czego guard NIE robił źle

- Nie liczył **wszystkich** nośników — predykat `status not in ('consumed','shipped','destroyed')`
  był poprawny (weryfikowany w `location-live-stock.test.ts`).
- Nie sprawdzał zapasu **w dziecku** przy dezaktywacji rodzica — `location_id = existing.id`.

## Poprawka

### `apps/web/actions/infra/location.ts`

`has_stock` zawężony do **jawnej dezaktywacji**: `input.active === false` wewnątrz bloku
transition. `has_active_children` bez zmian — nadal dla każdej ścieżki do `active = false`
(w tym clamp przy MOVE z aktywnym poddrzewem).

```ts
if (existing && existing.is_active !== false && !active) {
  // has_active_children — bez zmian
  if (input.active === false) {
    // has_stock — tylko tu
  }
}
```

Efekt:

| ścieżka | has_active_children | has_stock |
|---|---|---|
| MOVE pod inactive parent (`active:true` → clamp) | nie (brak aktywnych dzieci) | **nie** |
| MOVE z aktywnym dzieckiem pod inactive parent | **tak** | nie |
| jawna dezaktywacja pustej lokalizacji | nie | tak (count=0 → OK) |
| jawna dezaktywacja ze stockiem | nie / tak* | **tak** → `has_stock` |

\* jeśli są aktywne dzieci, `has_active_children` wygrywa pierwszeństwo (bez zmian).

### `apps/web/actions/infra/location-active-parent.test.ts`

- Stub `live_lps → 0` w obu fake clientach (`makeClient`, `makeLockWorld`) — jawna dezaktywacja
  rodzica nie wywala się na niemodelowanej tabeli.
- Asercja w teście MOVE: brak wywołań `live_lps` (carve-out link-scoped).

## Ochrona `has_stock` — nadal aktywna

Pełny kontrakt R08-01 **nie został osłabiony** — pilnuje go dedykowany plik:

`apps/web/actions/infra/location-live-stock.test.ts`

| test | co gwarantuje |
|---|---|
| `refuses the active → inactive transition and reports the exact dependency count` | `has_stock` + `lpCount` przy jawnej dezaktywacji |
| `lets an EMPTY location be deactivated` | nie blokuje pustej |
| `counts only LIVE stock` | terminalne statusy nie liczą się |
| `keeps an ALREADY-inactive location with live stock editable` | brak sondy gdy wiersz już off |
| `still blocks on active children first` | `has_active_children` przed `has_stock` |

W `location-active-parent.test.ts` dodano tylko asercję negatywną (MOVE **nie** woła `live_lps`).

## Zmienione pliki

1. `apps/web/actions/infra/location.ts` — zasięg `has_stock` → `input.active === false`
2. `apps/web/actions/infra/location-active-parent.test.ts` — stub `live_lps`, asercja anti-regression

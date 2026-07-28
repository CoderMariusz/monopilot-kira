# FALA-08 / FIX-LOC — brakujące etykiety `hasStockError` + `lpsElsewhere`

Repo: `monopilot-kira`. Bramka typów/testów pozostawiona orchestratorowi — nic nie uruchamiałem
(`tsc`, `vitest`, `pnpm build`, `make verify`).

## Przyczyna błędów TS

Tor dodał **użycie** dwóch etykiet w `location-tree-client.tsx` (mapowanie błędu `has_stock` oraz
pusty wiersz tabeli LP), ale eksportowany typ `LocationTreeLabels` w tym pliku nie zawierał
`hasStockError` ani `lpsElsewhere`. Lokalny typ w `page.tsx` oraz tłumaczenia były już uzupełnione.

## Źródło tłumaczeń (`buildLabels`)

`page.tsx` → `buildLabels(locale)` → `getTranslations({ locale, namespace: 'settings.infra.locations' })`.

Ładowanie wiadomości: `apps/web/i18n/request.ts` — `mergeMessages(baseMessages, { settings: mergeMessages(settingsMessages, …) })`,
gdzie `settingsMessages` pochodzi z **`apps/web/messages/<locale>/02-settings.json`** (klucze pod `infra.locations.*`).

Pliki `apps/web/i18n/*.json` nie niosą tych etykiet (tylko nadpisanie `warehouseUnassigned` w `en.json`);
wystarczy `messages/**/02-settings.json`.

---

## Zmienione pliki

### 1. `apps/web/app/[locale]/(app)/(admin)/settings/infra/locations/location-tree-client.tsx` — **linie 110–114**

Dodano do eksportowanego typu `LocationTreeLabels`:

```ts
hasStockError: string;
lpsElsewhere: string;
```

### 2. `apps/web/app/[locale]/(app)/(admin)/settings/infra/locations/page.tsx` — **linie 118–119, 207–208**

Typ lokalny `LocationTreeLabels` i `DEFAULT_LABELS` — **już zawierały** oba klucze (bez zmian w tej fali).

| klucz | DEFAULT_LABELS (en) |
|---|---|
| `hasStockError` | `This location still holds {count} live license plate(s). Move or consume that stock first — an inactive location cannot be scanned as a move target.` |
| `lpsElsewhere` | `{count} live LP(s) are parked here. Open the full LP list to see them.` |

### 3. `apps/web/messages/en/02-settings.json` — **linie 641–642** (`infra.locations`)

| klucz | tekst |
|---|---|
| `hasStockError` | `This location still holds {count} live license plate(s). Move or consume that stock first — an inactive location cannot be scanned as a move target.` |
| `lpsElsewhere` | `{count} live LP(s) are parked here. Open the full LP list to see them.` |

### 4. `apps/web/messages/pl/02-settings.json` — **linie 641–642**

| klucz | tekst |
|---|---|
| `hasStockError` | `Na tej lokalizacji stoi jeszcze {count} żywych nośników LP. Najpierw przenieś lub zużyj ten zapas — nieaktywnej lokalizacji nie da się zeskanować jako celu.` |
| `lpsElsewhere` | `Stoi tu {count} żywych LP. Otwórz pełną listę LP, aby je zobaczyć.` |

### 5. `apps/web/messages/ro/02-settings.json` — **linie 641–642**

| klucz | tekst |
|---|---|
| `hasStockError` | `Această locație conține încă {count} plăci de înmatriculare (LP) active. Mutați sau consumați mai întâi acel stoc — o locație inactivă nu poate fi scanată ca destinație.` |
| `lpsElsewhere` | `{count} LP-uri active sunt parcate aici. Deschideți lista completă de LP pentru a le vedea.` |

### 6. `apps/web/messages/uk/02-settings.json` — **linie 641–642**

| klucz | tekst |
|---|---|
| `hasStockError` | `У цій локації ще стоїть {count} живих LP. Спершу перемістіть або спожийте цей запас — неактивну локацію не можна відсканувати як ціль.` |
| `lpsElsewhere` | `Тут стоїть {count} живих LP. Відкрийте повний список LP, щоб їх побачити.` |

---

## Powiązane (bez edycji w tej fali)

- `location-upsert-errors.ts:17–18` — typ `UpsertLocationFormLabels.hasStockError` (komentarz R08-01, `{count}`).
- `location-tree-client.tsx:394` — `labels.lpsElsewhere.replace('{count}', …)`.
- `location-tree-client.tsx:269` — `mapUpsertLocationError(…, labels, …)` wymaga zgodności z `UpsertLocationFormLabels`.

## Diff tej fali

Jedyna edycja kodu: **+2 pola w typie** `location-tree-client.tsx`. Pozostałe artefakty były już na miejscu.

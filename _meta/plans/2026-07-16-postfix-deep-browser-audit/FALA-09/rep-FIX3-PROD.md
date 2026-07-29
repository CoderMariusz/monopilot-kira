# FIX3-PROD — `/en/production` 42883 `text / numeric`

**Data:** 2026-07-29  
**Zakres:** awaria produkcyjna poza FALĄ 9 (wykryta przy weryfikacji E2E, Z-04 w `E2E-PROD-FALA-9.md`)

## Objaw

Ekran `/en/production` renderuje banner błędu („Live production data is currently unavailable…”).  
`/en/production/wos` działa (31 zleceń, policzony progress).

Log Vercel:
```
[production/dashboard] KPI aggregate read failed: error: operator does not exist: text / numeric
code: '42883', position: '1033'
```

## Root cause — **hipoteza weryfikatora POTWIERDZONA**

Jedyny winowajca to zapytanie listy WO w `getProductionDashboard()` (`dashboard-data.ts`), wykonywane **po** KPI-ach — stąd `/wos` działa, a landing padnie.

Na produkcji (commit `main`) lateral subquery rzutował sumę na `text`:

```sql
left join lateral (
  select coalesce(sum(o.qty_kg), 0)::text as qty_kg   -- ← błąd
    from public.wo_outputs o
   ...
) produced on true
```

Potem w tym samym `SELECT`:

```sql
round(produced.qty_kg / w.planned_quantity * 100, 0)   -- text / numeric → 42883
```

Offset **1033** z logu wypada dokładnie na to dzielenie — zgodnie z ustaleniami weryfikatora.

**Dlaczego psql „działał” u weryfikatora:** odtworzenie bez `::text` w lateral (kolumny `numeric`) nie odtwarzało deployed SQL. Bliźniacze zapytanie w `list-work-orders.ts` **nigdy** nie miało `::text` w lateral — stąd `/wos` OK.

To **nie** jest pułapka `$N::uuid` przypinająca typ parametru — tu nie ma parametrów w tym zapytaniu; to czyste rzutowanie kolumny w subquery.

## Naprawa

1. Lateral `qty_kg` zostaje **numeric**: `coalesce(sum(o.qty_kg), 0) as qty_kg`
2. Rzutowanie na `text` tylko w aliasie wyjściowym: `produced.qty_kg::text as produced_quantity`
3. `progress_pct` dzieli numeric / numeric — bez zmiany formuły

SQL wyciągnięty do `production/_lib/dashboard-queries.ts` (`PRODUCTION_DASHBOARD_WO_LIST_SQL`) — jeden literał dla akcji i testu pg.

### Zmienione pliki

| Plik | Zmiana |
|---|---|
| `production/_lib/dashboard-queries.ts` | **nowy** — kanoniczny SQL + `…_BROKEN_TEXT_LATERAL` do regresji |
| `production/_actions/dashboard-data.ts` | import SQL; usunięty `::text` z lateral |
| `production/_actions/dashboard-data.pg.test.ts` | **nowy** — real Postgres |
| `production/_actions/dashboard-data.test.ts` | asercja na kanonicznym SQL (nie mock) |

## Dowód (test pg)

`dashboard-data.pg.test.ts` (wymaga `DATABASE_URL`, loud fail):

1. **PASS** — kanoniczny SQL: WO 50 kg plan, 0.960 kg output → `progress_pct = '2'`
2. **FAIL 42883** — ten sam SQL z `::text` w lateral (odtwarza produkcję)

Test mockowy **nie wystarcza** — node-pg mock nie ma typów Postgresa; regresja łapana tylko przez `.pg.test.ts`.

## Weryfikacja (orchestrator)

```bash
pnpm db:up
pnpm --filter web exec vitest run \
  "app/[locale]/(app)/(modules)/production/_actions/dashboard-data.pg.test.ts" \
  "app/[locale]/(app)/(modules)/production/_actions/dashboard-data.test.ts"
```

Po deploy: `/en/production` powinien renderować KPI + listę WO (nie banner błędu).

# FALA-11 / Z10-01 — raport FIX (dashboard produkcji: filtr zakładu na KPI)

**Data:** 2026-07-29  
**Źródło:** `FALA-10/E2E-PROD-FALA-10.md` Z10-01 (P2)  
**Objaw:** przy **Main Factory** kafelek `WOS IN PROGRESS` pokazywał `4 / 5`, listy WO na tym samym ekranie i w `/production/wos` — **3**; baza: 3 na zakładzie, 4 w org.

---

## Przyczyna

`getProductionDashboard()` działał w `withOrgContext` **bez** `app.set_site_context` i **bez** predykatu zakładu w SQL. Lista WO (`list-work-orders.ts`) oraz ekran `/production/wos` już filtrowały po `coalesce(w.site_id, pl.site_id)` — dashboard KPI i wbudowana lista WO na `/production` nie.

---

## Zmiany

| Plik | Co / dlaczego |
|---|---|
| `production/_lib/dashboard-queries.ts` | Wspólny predykat `PRODUCTION_DASHBOARD_SITE_WO_PREDICATE` + helper `productionDashboardSiteRowPredicate()`; ten sam literal w `PRODUCTION_DASHBOARD_WO_LIST_SQL`. |
| `production/_actions/dashboard-data.ts` | `withOrgContext` → `withSiteContext({ mode: 'read' })`; predykat zakładu na **wszystkich** odczytach KPI + status-tab counts + WO list. |

### Semantyka `site_id` (świadomy wybór)

| Rodzina danych | Predykat | Uzasadnienie |
|---|---|---|
| **Zlecenia produkcyjne** (`work_orders` + `production_lines`) | `app.current_site_id() is null or coalesce(w.site_id, pl.site_id) = app.current_site_id()` | Ten sam wzorzec co `list-work-orders.ts` i demand WO w `mrp.ts`. `work_orders.site_id` bywa NULL (mig-268 backfill na linię); wtedy liczy się `production_lines.site_id`. **Nie** używamy tu `site_id is null` jako „widoczne wszędzie” — WO bez przypisania do zakładu/linii nie wchodzi do licznika wybranego zakładu. |
| **Wiersze z własnym `site_id`** (`oee_snapshots`, `downtime_events`) | `app.current_site_id() is null or {alias}.site_id is null or {alias}.site_id = app.current_site_id()` | Jak prognozy/progi w Fali 9–10: rekordy org-wide (`site_id IS NULL`, np. stare przebiegi MRP, globalne snapshoty) **pozostają widoczne z każdego zakładu**, żeby nie wygasić ekranu po wyborze Main Factory. |
| **Output today** (`wo_outputs`) | Join do `work_orders` + predykat WO (jak wyżej) | Output jest zawsze powiązany z WO; spójność z licznikami WO ważniejsza niż surowe `wo_outputs.site_id`. |

`app.current_site_id() is null` = tryb **All sites** (brak filtra zakładu), zgodnie z `with-site-context.ts` / pickerem.

---

## Test regresji

| Plik | Co weryfikuje | Co by wywróciło bez poprawki |
|---|---|---|
| `production/_actions/dashboard-data.test.ts` | Przy symulacji 4 WO org-wide vs 3 na zakładzie: `woInProgress`, `statusCounts.in_progress` i liczba wierszy `in_progress` na liście WO są **równe 3**; SQL KPI zawiera `PRODUCTION_DASHBOARD_SITE_WO_PREDICATE` | KPI = 4 przy liście = 3 (dokładnie Z10-01) |

Importy zweryfikowane: `getProductionDashboard`, `PRODUCTION_DASHBOARD_SITE_WO_PREDICATE`, `withSiteContext`.

---

## Świadomie NIE ruszone

| Obszar | Powód |
|---|---|
| `production/downtime/_actions/downtime-data.ts` | Osobny ekran; poza zakresem Z10-01 (dashboard landing) |
| `list-work-orders.ts` | Już filtrował poprawnie; wzorzec skopiowany, nie zmieniany |
| Migracje / RLS | Fix wyłącznie w warstwie odczytu dashboardu |

---

## Oczekiwany efekt na prod

Przy **Main Factory** kafelek `WOS IN PROGRESS` powinien pokazywać `3 / …` zgodnie z listą WO i z `count(*) filter (where site_id = …)` — jedna liczba na ekranie.

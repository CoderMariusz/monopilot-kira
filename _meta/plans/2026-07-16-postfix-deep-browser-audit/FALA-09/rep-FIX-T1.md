# FALA-09 / Tor T1 — naprawa po cross-review (`rep-FIX-T1`)

## [P1] Patch nie usuwa przyczyny produkcyjnej awarii „Save this run”

**Status: NAPRAWIONE (wielościeżkowo) + częściowe ODRZUCENIE tezy o `ReferenceError`**

### Co zrobiłem

| Plik | Zmiana |
|---|---|
| `mrp.ts` | `buildMrpSiteContextOptions()` — jawne `{ mode: 'write', siteId: null }` gdy cookie `mp_site_id=all`; jawny uuid z cookie; read-only nadal `{ mode: 'read' }` |
| `mrp.ts` | `plannedOrderQtyFromAction` → `toMicro` + `microToFixed(m, 6)` (już w T1) |
| `mrp.ts` | `persistPlannedOrders` — pomijanie `quantity <= 0`, clamp `release_date <= due_date` (już w T1) |
| `mrp-compute.ts` | `leadDays` w scope pętli + pola kontekstu summary (`netAtBucket`, `gapAtBucket`, …) (już w T1 / tor równoległy) |

### Uzasadnienie względem recenzenta

Recenzent słusznie zauważył: jeśli `computeMrpPhased` rzuca `ReferenceError`, pada **oba** tryby (compute jest przed `if (persist)`). Audyt (`run-09/REPORT.md`) koreluje awarię z gałęzią persist — to wskazuje na **INSERT / site write-gate**, nie na wyjątek w compute.

**ODRZUCONE jako jedyna przyczyna prod:** sam `ReferenceError: leadDays` — nie tłumaczy read-only OK + persist fail przy Main Factory.

**NAPRAWIONE jako realne ścieżki persist-fail:**

1. **All-sites + write fail-closed** — `mode: 'write'` bez jawnego `siteId: null` traktował cookie `all` jak „brak site” → `NoActiveSiteError` → generyczne `persistence_failed` (poniżej).
2. **`quantity > 0` CHECK** — `Number().toFixed(3)` mogło zaokrąglić mikro-ilość do `0.000` i pominąć/wyzerować INSERT (`RECON-FACTS` §2, `mrp_planned_orders_quantity_positive_check`).
3. **`release_date <= due_date` CHECK** — clamp po podłodze `due_date` do `today`.

Bez uruchomienia transakcji na prod (zakaz `psql` w tej rundzie) nie odtworzyłem konkretnego `constraint_name` z INSERT-u — orchestrator powinien to potwierdzić na bramce DB.

---

## [P1] Guard blokuje legalny zapis w trybie „All sites”

**Status: NAPRAWIONE**

`mrp.ts:214–230` — `buildMrpSiteContextOptions()`:

- Cookie `mp_site_id=all` → `withSiteContext({ mode: 'write', siteId: null })` (jawny all-sites per `with-site-context.ts` V-MS-07).
- Cookie z uuid → `withSiteContext({ mode: 'write', siteId: uuid })`.
- Brak cookie → `{ mode: 'write' }` (domyślna resolucja: default site / fail-closed).

**Nie zablokowałem** checkboxu w UI — `mrp_runs.site_id` jest nullable i all-sites write jest istniejącym kontraktem multi-site.

---

## [P1] Test PF-R09-05 deterministycznie czerwony

**Status: NAPRAWIONE (fixture + pełny kształt obiektu)**

- `mrp-compute.test.ts:870` — `preferred_supplier_status: 'active'` w fixture (resolver wymaga `active` dla `leadTimeDays`).
- Oczekiwania rozszerzone o pola summary z compute: `dueDate`, `supplierId`, `actionScope`, `bucketDate`, `netAtBucket`, `gapAtBucket`, `reorderLotAtBucket`, `scheduledReceiptsAtBucket`, `leadTimeDays` — test nadal weryfikuje qty `12` vs net horyzontu `12.375`, nie tylko „kształt bez wartości”.

---

## [P2] Test persist FG nie sprawdza skali INSERT

**Status: NAPRAWIONE**

| Test | Plik | Co wywróci bez poprawki |
|---|---|---|
| `routes a finished-good shortage…` | `mrp.test.ts:1272` | `expect(fgPlannedInsert[4]).toBe('9.000000')` na param INSERT `mrp_planned_orders.quantity` |
| `persists sub-thousand planned-order quantities…` | `mrp.test.ts` (nowy) | `plannedInserts` musi mieć `'0.000001'`; stary `toFixed(3)` → `'0.000'` → brak wiersza / zero |

---

## Świadomie POMINIĘTE

| Temat | Uzasadnienie |
|---|---|
| Rozdzielenie `compute` vs `persist` w API / correlation ID w telemetry | Poza zakresem T1; audyt prosi, ale nie było w `t1.md` |
| `no_active_site` jako osobny klucz błędu w UI | Wymaga i18n + `MrpRunResult` union; server loguje `NoActiveSiteError` osobno; all-sites fix usuwa główny scenariusz super-admina |
| Migracja DB | Niepotrzebna — CHECK-i poprawne, błąd w TS/site-gate |

## Pliki dotknięte w tej rundzie FIX

- `apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp.ts`
- `apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp.test.ts`
- (testy compute już zsynchronizowane z `gapAtBucket` / `preferred_supplier_status` w `mrp-compute.test.ts`)

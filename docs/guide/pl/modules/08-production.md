# Produkcja — realizacja zlecenia produkcyjnego: zużycie → wyrób gotowy → odpad + korekty (przewodnik modułu)

> Szczegółowy przewodnik modułu. Każde stwierdzenie poniżej jest zakotwiczone
> w rzeczywistym pliku w `apps/web/…` lub `packages/…`; nic nie jest zmyślone.
> Moduł obejmuje **dwie grupy tras** oraz wspólną warstwę biblioteczną: ekrany
> ZP na **pulpicie operatora** znajdują się w grupie **Production**
> (`/production/wos`, `…/(modules)/production/`), natomiast przepływ
> wykonawczy **skanera** na hali produkcyjnej jest obsługiwany przez PWA
> skanera (`/scanner/wos/[woId]/{consume,output,waste}`). Obie ścieżki
> korzystają z **jednej wspólnej warstwy serwisowej** w
> `apps/web/lib/production/**` — pulpit przez Server Actions / route handlers,
> skaner przez trasy `/api/production/scanner/...`.
>
> 08-production jest **kanonicznym właścicielem** tabel `wo_outputs`,
> `wo_waste_log`, `downtime_events` oraz jedynym **producentem**
> `oee_snapshots` (D-OEE-1; 15-oee działa tylko do odczytu). Moduł **konsumuje**
> bramkę wstrzymań T-064 z 09-quality na każdej ścieżce
> zużycie/wyrób/odpad/zamknięcie.
>
> Trasy są zapisane bez prefiksu `[locale]`. Ostatni przegląd przeprowadzono
> względem roboczego drzewa (W11 R2/R3/R4 odwracalność, E4B robocizna, E7
> demontaż).

---

## a. Omówienie

Moduł Produkcja **realizuje** zlecenie produkcyjne: zamraża specyfikację BOM,
pobiera materiały (FEFO — Numery LP), rejestruje wyprodukowany wyrób gotowy
(włącznie z wagą zmienną), rejestruje odpady i przeprowadza ZP przez cykl życia
aż do zamknięcia finansowego. ZP trafia tutaj w stanie **RELEASED** z modułu
Planowania (z aktywnym BOM i zatwierdzoną/zwolnioną specyfikacją fabryczną —
ta bramka jest egzekwowana w `releaseWorkOrder`, nie tutaj); Produkcja
następnie steruje przejściami `planned → in_progress → paused → completed →
closed`, a także `cancelled` jako gałąź końcowa.

Cykl życia jest egzekwowany przez **jedną maszynę stanów**
(`lib/production/wo-state-machine.ts`): przejście nigdy nie jest swobodnym
`UPDATE status` — (1) waliduje, czy akcja jest dozwolona, (2) dołącza
niemutowalny wiersz `wo_events` (R14-idempotentny na `transaction_id`),
(3) materializuje CAS `wo_executions.status` pod optymistyczną blokadą
i (4) odbija kanoniczny stan na `work_orders.status`. Każda mutacja stanów
magazynowych jest NUMERYCZNIE dokładna (ciągi dziesiętne przekazywane wprost
do kolumn `NUMERIC`, nigdy jako float JS) i idempotentna na
dostarczonym przez klienta ID transakcji/operacji.

Błędy są **odwracalne** (W11 R2/R3/R4): błędny wyrób jest **unieważniony**,
błędny odpad jest **unieważniony**, a błędne zużycie jest **cofnięte** — każde
z nich księguje **storno** jako wpis przeciwny (negowany wiersz lustrzany z
`correction_of_id` wskazującym na oryginał), przywraca/unieważnia dotknięty LP
i zapisuje zdarzenie audytu. Cofnięcie wyrobu / zużycia wymaga **podpisu
elektronicznego CFR-21**; unieważnienie odpadu nie wymaga.

Warstwa serwisowa pulpitu znajduje się w `apps/web/lib/production/`
(`start-wo.ts`, `pause-resume-wo.ts`, `complete-cancel-wo.ts`, `close-wo.ts`,
`output/register-output.ts`, `output/register-disassembly-output.ts`,
`waste/record-waste.ts`); lokalne Server Actions strony są w
`production/_actions/` (`consume-material-actions.ts`, `output-qa-actions.ts`,
`corrections-actions.ts`, `changeover-actions.ts`, `labor-actions.ts`);
prymitywy storno/e-podpis to `lib/corrections/correct-ledger-entry.ts`. Ścieżki
zapisu skanera odzwierciedlają ten sam SQL w
`apps/web/app/api/production/scanner/wos/[id]/...`.

---

## b. Spis funkcji

> Odczyty/zapisy wskazują dotknięte tabele Postgres. „Bramka" to uprawnienie
> sprawdzane po stronie serwera **wewnątrz** akcji (brakujące uprawnienie
> zwraca typowany błąd `forbidden`, nigdy 500). Trasy skanera dodatkowo
> wymagają **sesji PIN skanera** (`requireScannerSession`) **i** ponownego
> sprawdzenia tego samego ciągu RBAC.

### Serwisy cyklu życia ZP — `apps/web/lib/production/*` (przez `work-orders/[id]/{verb}/route.ts`)

| Akcja (plik) | Co robi | Odczyt / zapis | Bramka | Odwrócenie / korekta |
|---|---|---|---|---|
| `startWo` (`start-wo.ts`) | `planned/RELEASED → in_progress`. Wstępna kontrola zwolnienia fabrycznego na **migawce** ZP (`active_bom_header_id`/`active_factory_spec_id`, samoleczenie z FG jeśli brakuje → w p.p. `factory_release_missing`); **zamraża BOM** (`createBomSnapshot`, idempotentnie); **bramka alergenowa** (otwarte zdarzenie `changeover_events` medium+ na linii LUB flaga `segregation_required` w migawce → `changeover_signoff_required`, twarde blokowanie); **materializuje `wo_outputs`** (jeden wiersz zastępczy na każdą rolę `schedule_outputs`, ilość 0); emituje `production.wo.started`. | czyta `work_orders`, `factory_specs`, `bom_headers`, `items`, `changeover_events`, `production_lines`, `schedule_outputs`; zapisuje `wo_events`, `wo_executions`, `work_orders`, `wo_outputs`, `bom_snapshots`, `outbox_events` | `production.wo.start` | `cancelWo` (brak „cofnij start") |
| `pauseWo` (`pause-resume-wo.ts`) | `in_progress → paused`. Atomicznie otwiera skategoryzowany wiersz `downtime_events` (`source='wo_pause'`, `ended_at` NULL); `category_id` obowiązkowy (V-PROD-22). Idempotentny na `transactionId` cyklu życia. | zapisuje `wo_events`, `wo_executions`, `work_orders`, `downtime_events`, `outbox_events` (`production.downtime.recorded`) | `production.wo.pause` | `resumeWo` |
| `resumeWo` (`pause-resume-wo.ts`) | `paused → in_progress`. Zamyka otwarty wiersz przestoju `wo_pause` (`ended_at`; `duration_min` jest GENEROWANY, nigdy zapisywany). | zapisuje `wo_events`, `wo_executions`, `work_orders`, `downtime_events`, `outbox_events` | `production.wo.resume` | ponownie `pauseWo` |
| `completeWo` (`complete-cancel-wo.ts`) | `in_progress → completed`. **Bramka wydajności wyrobu**: ≥1 wyrób `primary` z `qty_kg>0` (wiersze skorygowane wykluczone) chyba że podano `overrideReasonCode` → w p.p. `output_yield_gate_failed`. **holdsGuard (T-064)** na każdym LP wyrobu. **Zapisuje wiersz `oee_snapshots`** (D-OEE-1, jedyny producent) w tej samej transakcji. Emituje `production.wo.completed`. | czyta `wo_outputs`; zapisuje `wo_events`, `wo_executions`, `work_orders`, `oee_snapshots`, `outbox_events` | `production.wo.complete` | `cancelWo` (z `completed`) |
| `cancelWo` (`complete-cancel-wo.ts`) | `planned/in_progress/paused/completed → cancelled` (terminal). `reasonCode` obowiązkowy. Rejestruje szew zwalniania rezerwacji w ładunku zdarzenia. Emituje `production.wo.closed` (`terminal:'cancelled'`). | zapisuje `wo_events`, `wo_executions`, `work_orders`, `outbox_events` | `production.wo.cancel` **(zasiane przez mig 225 — NIE ma w enumie `Permission`; patrz luki)** | — (terminal) |
| `closeWo` (`close-wo.ts`) | `completed → closed` (terminal). **Najpierw e-podpis CFR-21 supervisora** (`signEvent`, intencja `production.wo.close`, PIN + obowiązkowy powód), walidowany atomicznie przed przejściem (strażnik atestacji osieroconych). Emituje `production.wo.closed` (10-finance / 12-reporting / 14-multi-site; zamknięcie D365 jest wyłącznie asynchroniczne przez outbox). | zapisuje `e_sign_log`, `audit_events`, `wo_events`, `wo_executions`, `work_orders`, `outbox_events` | `production.wo.close` | — (terminal; poszczególne wpisy cofaj przez korekty) |

### Zużycie materiałów — `production/_actions/consume-material-actions.ts` + skaner `…/consume/route.ts`

| Akcja (plik) | Co robi | Odczyt / zapis | Bramka | Odwrócenie / korekta |
|---|---|---|---|---|
| `recordDesktopConsumption` (`consume-material-actions.ts`) | Zużycie na pulpicie względem materiału ZP. **Bramka bezpieczeństwa LP** (`lp-safety-guard.ts`: nie-zwolniony → `lp_not_released`, nieaktualny, przeterminowany + `holdsGuard` T-064 → `quality_hold_active` + emituje `production.consume.blocked`). **Dwupoziomowa bramka nadmiernego zużycia** (pasmo ostrzeżenia → sukces+ostrzeżenie; pasmo zatwierdzenia `overconsume_threshold_pct` → `overconsume_blocked`). Zwiększa `wo_materials.consumed_qty`, zmniejsza LP (bezpieczne dla rezerwacji), wstawia na końcu zapis zużycia w księdze (UNIQUE `transaction_id` = dokładnie raz), rejestruje zgodność z FEFO. Idempotentny przez deterministyczny id transakcji z `clientOpId`. | czyta `wo_materials`, `v_inventory_available`, `license_plates`, `tenant_variations`; zapisuje `wo_materials`, `license_plates`, `wo_material_consumption`, `outbox_events` (`warehouse.material.consumed`) | `production.consumption.write` | `reverseConsumption` |
| `listConsumableLps` (`consume-material-actions.ts`) | Kandydaci LP (LP gotowe do zużycia) uporządkowani według FEFO dla danego materiału ZP (`v_inventory_available`: `status='available' AND qa_status='released'`, minus zarezerwowane; `order by expiry asc nulls last`). | czyta `wo_materials`, `v_inventory_available` | `production.consumption.write` | — (odczyt) |
| Zużycie przez skaner `POST …/wos/[id]/consume/route.ts` | Odpowiednik na urządzeniu przenośnym — **dokładne odzwierciedlenie SQL pulpitu**. Dodaje ścieżkę **zatwierdzenia nadmiernego zużycia PIN supervisora**: powyżej progu zatwierdzenia bez osoby zatwierdzającej → `overconsume_approval_required` (409); osoba zatwierdzająca `{email,pin}` jest weryfikowana (`verifyPin`), musi być **innym** użytkownikiem tej samej organizacji posiadającym `production.consumption.override_approve`. Idempotentny na `scanner_audit_log(org_id, client_op_id)`. | jak pulpit + zapisuje `scanner_audit_log` | sesja PIN skanera + `production.consumption.write` (+ `production.consumption.override_approve` osoby zatwierdzającej przy przekroczeniu limitu) | `reverseConsumption` |

### Wyrób gotowy / odpad / demontaż — `apps/web/lib/production/*` (przez route handlers)

| Akcja (plik) | Co robi | Odczyt / zapis | Bramka | Odwrócenie / korekta |
|---|---|---|---|---|
| `registerOutput` (`output/register-output.ts`, przez `…/outputs/route.ts` + skaner `…/output/route.ts`) | Wstawia wiersz `primary/co_product/by_product` do **`wo_outputs`**. ZP musi być w stanie umożliwiającym rejestrację wyrobu. **holdsGuard NAJPIERW**. Generuje `batch_number = {wo}-OUT-NNN` + `expiry = dziś + termin_przydatności`. **Waga zmienna (T-032)**: gdy `weight_mode='catch'`, zapisuje `catch_weight_details` + odchylenie ±tolerancja (MIĘKKIE ostrzeżenie, nigdy blokada); odrzuca masy zmienne dla artykułu z `fixed`. **Tworzy LP wyrobu** w tej samej transakcji (`status='received', qa_status='pending'`) gdy nie podano LP; genealogia `parent_lp_id` = **pierwszy pobrany LP**, wszystkie pobrane w `ext_jsonb.consumed_lp_ids` + wiersze `lp_genealogy`. Emituje `production.output.recorded`. | czyta `work_orders`, `items`, `wo_executions`, `wo_material_consumption`; zapisuje `wo_outputs`, `license_plates`, `lp_genealogy`, `lp_state_history`, `outbox_events` | `production.output.write` | `voidWoOutput` |
| `registerDisassemblyOutput` (`output/register-disassembly-output.ts`, przez `…/disassembly-outputs/route.ts`) | **E7** — rozkłada JEDEN wejściowy LP na N wyrobów współproduktów (BOM demontażu). Waliduje `bom_type='disassembly'` + zestaw wyrobów zgodny z `bom_co_products`; alokuje koszt wejścia na wyroby według `allocation_pct` (NUMERYCZNIE dokładny, ostatni wyrób pochłania resztę); tworzy pochodny LP dla każdego wyrobu (`relation_type='derived'`), zapisuje księgę kosztów (`source='disassembly_allocation'`), emituje jedno `production.output.recorded` na wyrób. | czyta `work_orders`, `bom_headers`, `bom_co_products`, `license_plates`, `item_cost_history`; zapisuje `wo_outputs`, `license_plates`, `lp_genealogy`, `lp_state_history`, `item_cost_history`, `outbox_events` | `production.output.write` | `voidWoOutput` (dla każdego wiersza wyrobu) |
| `recordWaste` (`waste/record-waste.ts`, przez `…/waste/route.ts` + skaner `…/waste/route.ts`) | Wstawia skategoryzowany wiersz `wo_waste_log` (ilość **zawsze w kg**, >0). ZP musi być w stanie rejestracji. Rozwiązuje `category_code → waste_categories.id` (nieznany/nieaktywny → `invalid_reference`). **holdsGuard NAJPIERW**. Emituje `production.waste.recorded` (zasila bramkę wydajności, stratę finansową, raportowanie). Idempotentny na `transaction_id`. | czyta `work_orders`, `wo_executions`, `waste_categories`; zapisuje `wo_waste_log`, `outbox_events` | `production.waste.write` | `voidWasteEntry` |

### Zwolnienie QA wyrobów — `production/_actions/output-qa-actions.ts`

| Akcja | Co robi | Odczyt / zapis | Bramka | Odwrócenie |
|---|---|---|---|---|
| `releaseWoOutputQa({outputId,decision})` | Bramka QA dla wyrobu produkcyjnego (tylko `PENDING`). `PASSED` → `qa_status='PASSED'` wyrobu + `qa_status='released'` LP (dostępny w FEFO); `FAILED` → `qa_status='FAILED'` + LP `qa_status='rejected'`. `ON_HOLD` kieruje do przepływu wstrzymań (odmowa tutaj). | czyta `wo_outputs`, `license_plates`; zapisuje `wo_outputs`, `license_plates`, `lp_state_history` | `quality.batch.release` **(zapożyczone z 09-quality — nie istnieje uprawnienie produkcyjne do zapisu wyrobu QA; patrz luki)** | jednostronne (tylko `PENDING`) |

### Korekty / odwracalność — `production/_actions/corrections-actions.ts` (+ `lib/corrections/correct-ledger-entry.ts`)

| Akcja | Co robi | Odczyt / zapis | Kierunek odwrócenia |
|---|---|---|---|
| `voidWoOutput({outputId,reasonCode,note,signature})` | **R2** — unieważnia wiersz `wo_outputs`. **E-podpis CFR-21** (intencja `production.output.void`). Odmawia jeśli już skorygowany lub LP nie jest możliwy do unieważnienia (musi być `received`/`qa pending`, rezerwacja 0, brak zużycia/dzieci → `lp_not_voidable`). Wstawia wiersz **storno** `wo_outputs` (negowana ilość, `correction_of_id`, partia `…-VOID-…`); zmienia LP na `status='destroyed', qty 0`; odłącza dzieci `lp_genealogy`; zapisuje historię LP + audyt `production.output.corrected`. | czyta `wo_outputs`, `license_plates`, `work_orders`, `wo_executions`; zapisuje `wo_outputs`, `license_plates`, `lp_genealogy`, `lp_state_history`, `audit_events`, `e_sign_log` | Bramka: `production.output.correct` + e-podpis (+ `production.corrections.closed_wo` gdy ZP zamknięte). **Jest** odwróceniem `registerOutput` |
| `voidWasteEntry({wasteId,reasonCode,note})` | **R2** — unieważnia wiersz `wo_waste_log`. **Bez e-podpisu** (niższe ryzyko). Wstawia storno z negowaną ilością (`correction_of_id`); zapisuje audyt `production.waste.corrected`. Częściowy indeks unikalny `(org_id, correction_of_id)` z mig-296 zabezpiecza przed podwójnym unieważnieniem → `already_corrected`. | czyta `wo_waste_log`, `work_orders`, `wo_executions`; zapisuje `wo_waste_log`, `audit_events` | Bramka: `production.waste.correct` (+ `production.corrections.closed_wo` gdy ZP zamknięte). **Jest** odwróceniem `recordWaste` |
| `reverseConsumption({consumptionId,reasonCode,note,signature})` | **R3** — cofa wiersz `wo_material_consumption`. **E-podpis CFR-21** (intencja `production.consumption.reverse`). Blokuje LP (musi być `consumed/available/received` → w p.p. `lp_not_restorable`) + `wo_materials` i SQL-waliduje, że dekrementacja pozostaje ≥0 (→ `inconsistent_ledger`) **przed** jakimkolwiek zapisem. Wstawia negowane storno; **dekrementuje** `wo_materials.consumed_qty`; **przywraca** ilość LP + stan uwzględniający QA (`consumed`→`available` tylko gdy nadal zwolnione QA, w p.p. `received`); zapisuje historię LP + audyt `production.consumption.corrected`. | czyta `wo_material_consumption`, `license_plates`, `wo_materials`, `work_orders`, `wo_executions`; zapisuje `wo_material_consumption`, `wo_materials`, `license_plates`, `lp_state_history`, `audit_events`, `e_sign_log` | Bramka: `production.consumption.correct` + e-podpis (+ `production.corrections.closed_wo` gdy ZP zamknięte). **Jest** odwróceniem `recordDesktopConsumption` |

> Wszystkie trzy korekty są wystawione do interfejsu szczegółów ZP przez
> adapter tylko do importu `wos/[id]/void-actions-adapter.ts`
> (`voidWoOutputAction` / `voidWasteEntryAction` / `reverseConsumptionAction`).

### Zmiana ustawień (podwójny podpis alergenowy B-2) — `production/_actions/changeover-actions.ts`

| Akcja | Co robi | Odczyt / zapis | Bramka | Odwrócenie |
|---|---|---|---|---|
| `createChangeoverEvent({lineId,toProductId,…})` | Rejestruje zdarzenie zmiany ustawień alergenowych. Rozwiązuje linię przez `production_lines` (zawsze zapisuje `production_lines.id::text`); oblicza `risk_level` z aktywnej `changeover_matrix` (nadpisanie linii ma pierwszeństwo) lub heurystycznie. | czyta `production_lines`, `work_orders`, `items`, `changeover_matrix(_versions)`; zapisuje `changeover_events` | `production.changeover.write` | — (podpisz, nie cofaj rejestracji) |
| `signChangeover({changeoverId,signature})` | **Podwójny podpis (B-2)**. Czyta `signoff_policies` organizacji (wymagane podpisy, rola 1./2. osoby podpisującej, zezwolenie na tego samego użytkownika); blokuje wiersz; **e-podpis CFR-21 dla każdego slotu** (`signEvent`, intencja `production.changeover.signoff`). Ukończenie wymaga `cleaning_completed=true` (`cleaning_incomplete`) i innej drugiej osoby podpisującej (`same_user_rejected`). Po ukończeniu zapisuje wiersz dowodowy `allergen_changeover_validations`. Ukończone zdarzenie medium+ **odblokowuje `startWo`** na tej linii. | czyta `signoff_policies`, `user_roles`, `changeover_events`; zapisuje `changeover_events`, `allergen_changeover_validations`, `e_sign_log`, `audit_events` | 1. slot: `production.allergen_gate.sign_first` (lub `first_signer_role_id` z polityki); 2. slot: `production.allergen_gate.sign_second` (lub `second_signer_role_id` z polityki) | — (audytowany dowód; brak cofnięcia podpisu) |
| `listChangeovers({lineId,status,limit})` | Lista zdarzeń zmian ustawień (filtr linii/statusu; rozwiązuje **kody** produktów, imiona osób podpisujących). | czyta `changeover_events`, `production_lines`, `work_orders`, `items`, `users` | odczyt ograniczony przez RLS | — (odczyt) |

### Robocizna (E4B) — `production/_actions/labor-actions.ts`

| Akcja | Co robi | Odczyt / zapis | Bramka | Odwrócenie |
|---|---|---|---|---|
| `clockInToWo({woId,source})` | Rejestruje obecność operatora przy ZP (automatycznie zamyka ewentualny otwarty wpis). | zapisuje `wo_labor_log` | `production.consumption.write` | `clockOutFromWo` |
| `clockOutFromWo({woId?})` | Zamyka otwarte wpisy robocizny operatora (opcjonalnie ograniczone do jednego ZP). | zapisuje `wo_labor_log` | `production.consumption.write` | `clockInToWo` |
| `getWoLaborSummary(woId)` | Agreguje godziny × `labor_rates` na operatora (NUMERYCZNIE dokładne; rozwiązuje **imię** operatora, nigdy UUID). | czyta `wo_labor_log`, `users`, `labor_rates`, `user_roles`, `roles` | `production.oee.read` | — (odczyt) |
| `upsertLaborRate(input)` / `listLaborRates()` | Zarządza `labor_rates` (karty stawek według grup ról). | czyta/zapisuje `labor_rates` | zapis: `settings.org.update`; odczyt: `settings.org.read` | edytuj ponownie |

### Akcje odczytu — `production/_actions/*`

| Akcja (plik) | Co robi | Odczyt | Bramka |
|---|---|---|---|
| `listWorkOrders` (`list-work-orders.ts`) | Lista `/production/wos` (agregacja statusów z `work_orders` + `wo_executions`; postęp z sumy kanonicznej `wo_outputs`; znacznik alergenowy). | `work_orders`, `wo_executions`, `wo_outputs` | `production.oee.read` |
| `getWorkOrderDetail` (`get-work-order-detail.ts`) | Pakiet szczegółów ZP dla ekranu 8/9 zakładek (komponenty, wyroby, odpady, przestoje, QA, genealogia, historia; wiersze skorygowane wykluczone przez `correction_of_id`). | `work_orders`, `wo_materials`, `wo_outputs`, `wo_waste_log`, `downtime_events`, `wo_material_consumption`, `wo_status_history`, `wo_events`, `bom_co_products` | `production.oee.read` |
| `getWoActionContext` / `getWoListActionContext` (`get-wo-action-context.ts`) | Płaska mapa uprawnień na ZP sterująca renderowaniem przycisków akcji (start/pause/resume/cancel/complete/close/outputWrite/wasteWrite). | RLS + `hasPermission` na ciąg | każdy ciąg `production.*` |
| `getProductionDashboard` (`dashboard-data.ts`), `analytics-data.ts`, `downtime-data.ts`, `waste-data.ts`, `changeover-data.ts`, `changeovers-lines.ts`, `shifts-data.ts` | KPI pulpitu + loadery list dla poszczególnych ekranów (przestoje / odpady / zmiany ustawień / zmiany / analityka). | odpowiednie tabele | odczyty ograniczone przez RLS (rodzina `production.oee.read`) |

**Zinwentaryzowana liczba akcji: 31** (6 cyklu życia, 3 zużycie w tym skaner,
4 wyrób/odpad/demontaż, 1 QA wyrobu, 3 korekty, 3 zmiana ustawień, 5
robocizna, 6 odczyt/pulpit). Jądro wykonawcze to 6 serwisów cyklu życia + 3
zapisywarki zużycie/wyrób/odpad + 3 korekty.

---

## c. Maszyna stanów

### Cykl życia ZP w czasie rzeczywistym (`wo-state-machine.ts:46-53`)

```
 planned ──start──► in_progress ──pause──► paused
   │                  │  ▲                   │
   │                  │  └──────resume───────┘
   │                  │
   │             complete
   │                  │
   │                  ▼
   │              completed ──close──► closed (terminal)
   │
   └──────────────── cancel ──────────────► cancelled (terminal)
        (cancel is legal from planned / in_progress / paused / completed)
```

| Stan (`wo_executions.status`) | Odbicie w `work_orders.status` | Dozwolone akcje | Kto zapisuje | Uwagi |
|---|---|---|---|---|
| `planned` | `RELEASED` | `start`, `cancel` | maszyna stanów (leniwa materializacja) | ZP trafia tutaj z `releaseWorkOrder` w Planowaniu. |
| `in_progress` | `IN_PROGRESS` | `pause`, `complete`, `cancel` | `startWo` / `resumeWo` | Jedyny stan, w którym można rejestrować zużycie/wyrób/odpad (wraz z `paused`/`completed`). |
| `paused` | `ON_HOLD` | `resume`, `cancel` | `pauseWo` | Otwiera wiersz przestoju `wo_pause`; zamykany przy wznowieniu. |
| `completed` | `COMPLETED` | `close`, `cancel` | `completeWo` | Bramka wydajności musi być zielona; tutaj zapisywany jest `oee_snapshots`. |
| `closed` | `CLOSED` | — (terminal) | `closeWo` | Wymagany e-podpis supervisora; zamknięcie finansowe. |
| `cancelled` | `CANCELLED` | — (terminal) | `cancelWo` | `reasonCode` obowiązkowy. Brak „cofnij anulowanie". |

Maszyna jest egzekwowana **dwukrotnie**: interfejs szczegółów ZP renderuje
wyłącznie przyciski zgodne ze stanem i uprawnieniami
(`get-wo-action-context.ts` + `wos/_components/modals/gating.ts`),
a `applyTransition` ponownie waliduje względem tablicy `TRANSITIONS` —
niedozwolona akcja zwraca `invalid_state_transition`; nieudany CAS
współbieżny **rzuca wyjątkiem**, więc cała transakcja (w tym dołączony wiersz
`wo_events`) jest wycofywana (→ 409).

### Podprzepływ zużycia (`OUTPUT_RECORDABLE_STATES` = in_progress / paused / completed)

```
LP (qa_status='released', status='available')
   │  recordDesktopConsumption / scanner consume
   │  ── LP safety gate (lp-safety-guard) ──► quality_hold_active / lp_not_released / lp_expired …
   │  ── two-tier over-consume gate ───────►  warn band → ok+warning
   │                                          approve band → overconsume_blocked (desktop)
   │                                                       → overconsume_approval_required + supervisor PIN (scanner)
   ▼
wo_materials.consumed_qty += qty ; LP.quantity -= qty (→ 'consumed' at 0)
wo_material_consumption row (UNIQUE transaction_id)
   │  reverseConsumption (R3, e-sign)
   ▼
negated storno + consumed_qty -= qty + LP restored (QA-aware state)
```

### Podprzepływ wyrobu gotowego / odpadu

```
registerOutput ──► wo_outputs row (qa_status='PENDING')  +  output LP (status='received', qa_status='pending')
   │  releaseWoOutputQa: PASSED → output PASSED + LP released (FEFO-consumable)
   │                     FAILED → output FAILED + LP rejected
   │  voidWoOutput (R2, e-sign): negated storno + LP → 'destroyed' qty 0
   ▼
recordWaste ──► wo_waste_log row (kg)
   │  voidWasteEntry (R2): negated storno (no e-sign)
```

**Cykl życia LP przez produkcję:** LP wyrobu/demontażu rodzi się jako
`status='received', qa_status='pending'` (nigdy automatycznie dostępny do
zużycia) → QA `releaseWoOutputQa` awansuje go do `qa_status='released'`
(dostępny do zużycia) lub `rejected` → `voidWoOutput` zmienia go na
`status='destroyed', quantity=0`. Wejściowy LP zużyty przechodzi
`available → consumed`; `reverseConsumption` przywraca go do `available`
(tylko gdy nadal zwolniony QA) lub `received`.

<!-- screenshot: production/wos list (status tabs + search) -->
<!-- screenshot: production/wos/[id] detail (header action bar + 9 tabs) -->

---

## d. Instrukcje dla użytkownika

> Etykiety przycisków poniżej są dosłownymi angielskimi tekstami z pakietów
> i18n `production.wos.*` / `production.changeovers.*` (`apps/web/i18n/en.json`);
> `data-testid`y w nawiasach to stabilne kotwice w kodzie komponentu
> (`wos/[id]/_components/wo-detail-screen.tsx`).

### Lista zleceń produkcyjnych (WO)

Przejdź do **Produkcja → Zlecenia produkcyjne** (`/production/wos`), aby wyświetlić listę wszystkich zleceń. Ekran pokazuje 14 WO z możliwością filtrowania po statusie (W toku / Wstrzymane / Zaplanowane / Zakończone / Zamknięte).

![Lista zleceń produkcyjnych z zakładkami statusów](screenshots/production-wo-list.png)

Wybierz zlecenie, aby otworzyć jego szczegóły i wykonać operacje (Wznowienie, Zużycie, Rejestracja wyrobu, Odpady, Zamknięcie).

![Szczegóły zlecenia produkcyjnego z zakładkami Przegląd/Zużycie/Wyjście/QA/Genealogia](screenshots/production-wo-detail.png)

Panel szczegółów pokazuje paski postępu (Zużycie / Wyjście), akcje (Wstrzymaj, Odpad, Waga zmienna, Zakończ) oraz 8 zakładek do zarządzania materiałami, wyrobami i jakością.

### (i) Uruchomienie ZP

1. Przejdź do **Produkcja → Zlecenia produkcyjne** (`/production/wos`) i otwórz
   ZP w stanie `planned` (zwolnione) → `/production/wos/[id]`.
2. Na **pasku akcji** w nagłówku (`wo-action-bar`) kliknij **"Start"**
   (`headerActions.start`). Okno modalne opcjonalnie pyta o **Linię** i
   **Zmianę**.
3. Po zatwierdzeniu → `startWo`: BOM zostaje zamrożony, tworzone są
   wiersze zastępcze `wo_outputs`, a ZP przechodzi w stan `in_progress`.
4. **Jeśli uruchomienie jest zablokowane** przez `changeover_signoff_required`,
   pojawia się bursztynowe powiadomienie (`wo-changeover-gate`) z głębokim
   linkiem do `/production/changeovers?lineId=…` — najpierw wykonaj podwójny
   podpis zmiany ustawień (patrz vii), lub flaga
   `allergen_profile_snapshot.segregation_required` ZP blokuje start do
   momentu podpisania separacji.

### (ii) Zużycie materiałów

**Pulpit operatora:**

1. Na uruchomionym ZP otwórz zakładkę **Zużycie**. Kliknij **"Zarejestruj
   zużycie"** (`wo-consumption-record`) lub wyzwalacz w wierszu
   (`wo-consumption-record-row-<id>`).
2. Wybierz **materiał**, podaj **ilość** (dziesiętną, w JM materiału) i
   wybierz **sugerowany LP** (posortowane FEFO przez `listConsumableLps`) —
   lub pobierz bez LP podając **kod przyczyny**.
3. Zatwierdź → `recordDesktopConsumption`. Nadmierne zużycie w paśmie
   ostrzeżenia zwraca sukces z bursztynowym komunikatem; pasmo zatwierdzenia
   blokuje twardo (`overconsume_blocked`). Wstrzymania jakościowe / niezwolnione
   LP są odrzucane.

**Skaner:** Ekran główny → kafelek **Zużycie** → `/scanner/wos/[woId]/consume`:
zeskanuj LP, podaj ilość, **Odbierz**. Powyżej progu zatwierdzenia nadmiernego
zużycia skaner prosi o **adres e-mail i PIN supervisora** (inny użytkownik tej
samej organizacji posiadający `production.consumption.override_approve`).

### Rejestrowanie wyjścia (wyrobu) — modal

Gdy otwierasz formularz rejestracji wyrobu, pojawia się modal z polami do wypełnienia.

![Modal rejestracji wyrobu z polami: typ wyrobu, ilość kg, waga rzeczywista, numer partii](screenshots/production-register-output-modal.png)

Wypełnij wymagane pola i zatwierdź, aby zapisać wyrób.

### (iii) Rejestracja wyrobu gotowego (stała waga + waga zmienna)

1. Na uruchomionym/ukończonym ZP otwórz zakładkę **Wyroby gotowe** i kliknij
   **"Zarejestruj wyrób"** (`wo-output-add`) — lub **"Waga zmienna"**
   (`wo-action-catchweight`) w nagłówku.
2. Wybierz **typ wyrobu** (primary / co-product / by-product), podaj **ilość**
   (kg lub jednostki + JM lub wagę rzeczywistą). Artykuły ze **stałą wagą**
   wymagają tylko ilości.
3. Artykuły z **wagą zmienną** (`weight_mode='catch'`) ujawniają sekcję
   **"Wagi jednostkowe (kg)"** (`output.catchWeight.sectionTitle`) — wpisz
   odczyt wagi dla każdej jednostki; okno pokazuje narastające **Σ** i MIĘKKIE
   ostrzeżenie odchylenia ±tolerancja (nigdy blokada).
4. Zatwierdź → `registerOutput`. Wiersz `wo_outputs` zostaje utworzony, a
   **LP wyrobu** jest tworzony (urodzony w wstrzymaniu QA) i powiązany
   genealogicznie z pobranymi LP. Możesz następnie **Drukować etykietę WG**
   (wymagane uprawnienie `settings.org.update`).
5. **ZP demontażu** wyświetlają zamiast tego **"Zarejestruj wyroby demontażu"**
   (`wo-action-disassembly`) — jeden wejściowy LP → N wyrobów
   współproduktów z alokacją kosztów.

### (iv) Rejestracja odpadu

1. Otwórz zakładkę **Odpady** → **"Zarejestruj odpad"** (`wo-waste-add`) —
   lub **"Odpad"** (`wo-action-waste-header`) w nagłówku.
2. Wybierz **kategorię odpadu**, podaj **ilość** (**zawsze w kg**), **zmianę**
   i opcjonalny powód/notatki. Zatwierdź → `recordWaste`. Stopka zakładki
   pokazuje narastającą sumę kg.

### (v) Cofnięcie błędnego zużycia

1. Otwórz zakładkę **Genealogia**. Na wierszu pobranego materiału kliknij
   **"Cofnij…"** (`wo-genealogy-reverse-<id>`).
2. Okno **cofnięcia zużycia** pyta o **kod przyczyny** + notatkę oraz
   **PIN/hasło e-podpisu** (CFR-21). Zatwierdź → `reverseConsumption`.
3. Oryginalny wiersz jest przekreślony i oznaczony „Cofnięte";
   `consumed_qty` jest dekrementowany, a ilość/stan LP przywrócone
   (ponownie dostępne do pobrania tylko gdy LP nadal zwolniony QA).
   Na **zamkniętym** ZP okno ostrzega, że wymagana jest autoryzacja
   supervisora (`production.corrections.closed_wo`).

### (vi) Unieważnienie błędnego wyrobu / odpadu

- **Wyrób:** zakładka Wyroby → **"Unieważnij wyrób…"** (`wo-output-void-<id>`)
  → powód + notatka + **PIN e-podpisu** → `voidWoOutput`. Wiersz jest
  oznaczony „Unieważniony", pojawia się negowany wiersz przeciwny
  („Korekta do #…"), a LP wyrobu jest niszczony. Odmowa jeśli LP już
  został przesunięty / zarezerwowany / pobrany / ma dzieci
  (`lp_not_voidable`).
- **Odpad:** zakładka Odpady → **"Unieważnij wpis…"** (`wo-waste-void-<id>`)
  → powód + notatka → `voidWasteEntry` (**bez e-podpisu**). Księgowany jest
  negowany wiersz przeciwny.

### (vii) Realizacja zmiany ustawień alergenowych (podwójny podpis — B-2)

1. Przejdź do **Produkcja → Zmiany ustawień** (`/production/changeovers`) →
   **"+ Nowa zmiana ustawień"**; uzupełnij linię + produkt z/do + listę
   kontrolną czyszczenia → `createChangeoverEvent`.
2. Na zdarzeniu medium+ kliknij **"Przeglądaj i podpisz"**; pierwsza osoba
   podpisuje **"Podpisz (1.)"** (`changeovers.sign.signFirst`) swoim **hasłem
   konta** (CFR-21). **Inna** druga osoba podpisuje **"Podpisz (2.)"** —
   czyszczenie musi być najpierw ukończone.
3. Po ukończeniu pojawia się komunikat **"Podwójny podpis ukończony — można
   uruchomić następne zlecenie produkcyjne."**; to odblokowuje bramkę
   `startWo` dla tej linii.

### (viii) Zwolnienie QA / ukończenie / zamknięcie ZP

- **Zwolnienie QA wyrobu:** zakładka Wyroby, na wierszu `PENDING` kliknij
  **"Zalicz QA"** / **"Odrzuć QA"** (`wo-output-qa-pass-<id>` /
  `…-fail-<id>`) → `releaseWoOutputQa`. Zaliczenie sprawia, że LP wyrobu jest
  dostępny w FEFO; odrzucenie go odrzuca.
- **Ukończenie:** **"Ukończ"** w nagłówku → `completeWo` (bramka wydajności musi
  być zielona lub podaj **kod przyczyny nadpisania**). Zapisuje migawkę OEE.
- **Zamknięcie:** **"Zamknij"** w nagłówku → `closeWo` — podaj **PIN
  e-podpisu** + powód; zamknięcie finansowe jest terminalne.

---

## e. Źródła danych (tabele Supabase)

Cykl życia / wykonanie (odczyt/zapis):

- `work_orders` — nagłówek ZP + migawka (`status`, `active_bom_header_id`, `active_factory_spec_id`, `allergen_profile_snapshot`, `uom_snapshot`, `production_line_id`).
- `wo_executions` — status w czasie rzeczywistym + monotoniczny `version` (optymistyczna blokada CAS).
- `wo_events` — niemutowalna księga cyklu życia (R14-idempotentna na `transaction_id`).
- `wo_status_history` — ślad statusów po stronie planowania (odczyt w szczegółach).
- `bom_snapshots` — zamrożony BOM przy uruchomieniu (`createBomSnapshot`).
- `schedule_outputs` — planowane role wyrobu materializowane w `wo_outputs` przy uruchomieniu (właściciel: planowanie; odczyt).

Zużycie / wyrób / odpad (08-production kanoniczny):

- `wo_materials` — komponenty migawki BOM + `consumed_qty` (zwiększane przez zużycie).
- `wo_material_consumption` — księga zużycia (UNIQUE `transaction_id`; storno przez `correction_of_id`).
- `wo_outputs` — **kanoniczna** tabela wyrobów (primary/co/by; `qa_status`, waga zmienna, storno).
- `wo_waste_log` — **kanoniczna** tabela odpadów (kg; storno).
- `downtime_events` — **kanoniczny** przestój (wo_pause + ręczny; `duration_min` GENERATED).
- `oee_snapshots` — **producent**: wyłącznie 08-production (zapisywany przy ukończeniu).
- `wo_labor_log`, `labor_rates` — robocizna E4B (rejestracja czasu + karty stawek).

Magazyn / genealogia (wspólne z 05-warehouse):

- `license_plates` — stan/ilość LP (zużycie dekrementuje; wyrób tworzy; korekty niszczą/przywracają).
- `v_inventory_available` — widok kandydatów do zużycia FEFO (mig-191; `available`+`released` minus zarezerwowane).
- `lp_genealogy` — krawędzie LP dziecko↔rodzic (`consumed` / `derived`).
- `lp_state_history` — księga przejść LP (geneza, QA, unieważnienie, przywrócenie).
- `item_cost_history` — alokacja kosztów demontażu (współwłasność z finance).

Alergeny / zmiana ustawień / konfiguracja:

- `changeover_events`, `allergen_changeover_validations`, `changeover_matrix(_versions)` — podwójny podpis B-2 + macierz ryzyka.
- `signoff_policies` — wymagane podpisy + role osób podpisujących dla podwójnego podpisu zmiany ustawień.
- `tenant_variations` — `feature_flags->overconsume_threshold_pct` / `overconsume_warn_pct`.
- `production_lines`, `waste_categories`, `items`, `bom_headers`, `bom_co_products`, `factory_specs` — odczyty referencyjne.

Zarządzanie:

- `e_sign_log` + `audit_events` — e-podpis CFR-21 (zamknięcie, unieważnienie wyrobu/zużycia, zmiana ustawień) + audyt korekt (`production.{output,waste,consumption}.corrected`).
- `outbox_events` — `production.wo.{started,completed,closed}`, `production.output.recorded`, `production.waste.recorded`, `production.downtime.recorded`, `production.consume.blocked`, `warehouse.material.consumed`.
- `scanner_audit_log` — idempotentność i audyt zużycia/wyrobu/odpadu przez skaner.

---

## f. Znane luki / TODO

Zakorzenione w odczytanym kodzie — zasilają rejestr poprawek:

1. **Uprawnienia korekt NIE są w enumie `Permission`.**
   `production.output.correct`, `production.consumption.correct`,
   `production.waste.correct` i `production.corrections.closed_wo` są zasiane
   wyłącznie przez migracje `293-corrections-foundation.sql` /
   `296-corrections-hardening.sql` i konsumowane przez `corrections-actions.ts`,
   ale nigdy zadeklarowane w `packages/rbac/src/permissions.enum.ts`. Są
   niewidoczne dla strażnika blokady enumeracyjnej i macierzy
   Ustawienia → Role (która renderuje enum). To samo dotyczy
   **`production.wo.cancel`** (zasiane przez
   `225-production-wo-cancel-permission.sql`, sprawdzane w `cancelWo`,
   nieobecne w enumie). Należy dodać je do enumu.

2. **Zwolnienie QA wyrobów zapożycza uprawnienie z jakości.**
   `releaseWoOutputQa` korzysta z bramki **`quality.batch.release`** (09-quality),
   ponieważ „istniejący enum RBAC nie ma uprawnienia do zapisu zwolnienia
   wyrobu QA po stronie produkcji" (udokumentowane w
   `output-qa-actions.ts:3-10`). Akcja produkcyjna sprawdzająca uprawnienie
   jakości zaciera granice własności — należy dodać ciąg
   `production.output.qa_release`.

3. **Dwa zadeklarowane uprawnienia nadpisania supervisora są nieużywane.**
   `production.output.catch_weight_override` i
   `production.waste.overthreshold_approve` istnieją w enumie, ale żaden kod
   ich nie czyta: odchylenie wagi zmiennej jest MIĘKKIM ostrzeżeniem (nigdy
   nie blokuje), a ścieżka zatwierdzenia przekroczenia progu odpadów nie
   istnieje. Należy je podłączyć lub oznaczyć jako zarezerwowane.

4. **`production.downtime.write` jest zadeklarowany, ale nie istnieje samodzielna
   akcja zapisu przestoju.** Wiersze przestoju są zapisywane wyłącznie jako
   efekt uboczny `pauseWo`/`resumeWo`; przycisk „Zarejestruj przestój" w
   zakładce **Przestoje** szczegółów ZP jest trwale **wyłączonym**
   `DeferredButton` (`wo-detail-screen.tsx`), a przycisk „Skanuj LP" w zakładce
   Zużycie jest podobnie odroczony na pulpicie.

5. **Genealogia LP wyrobu ma jednego rodzica.** `license_plates.parent_lp_id`
   przechowuje wyłącznie **pierwszy** pobrany LP; wszystkie pobrane LP są
   przechowywane w `ext_jsonb.consumed_lp_ids` + wierszach `lp_genealogy`.
   Kolumna jednego rodzica jest udokumentowaną luką modelowania
   (`register-output.ts:286-292`).

6. **`site_id` jest NULL w wyrobach zmaterializowanych przy uruchomieniu.**
   `startWo` wstawia `wo_outputs` z `site_id = null` do czasu podłączenia
   atrybucji 14-multi-site (`start-wo.ts:264-268`); rejestracja wyrobu /
   zapis odpadu wiąże go explicite, więc rozbieżność istnieje między
   ścieżkami zapisu.

7. **Brak pulpitowych formularzy „przestój" ani „wyrób bez LP" po stronie
   produkcji.** Operatorzy rejestrują wyrób / odpad / zużycie z modali
   pulpitu lub skanera; pulpit nie posiada samodzielnego wpisu przestoju ani
   oddzielnego **banera zatwierdzenia nadmiernego zużycia** na poziomie ZP
   (baner z prototypu + karta push D365 są pominięte — brak modelu odczytu,
   `wo-detail-screen.tsx:26-27`).

8. **Konsument skrzynki nadawczej `apps/worker` nie działa.** Wszystkie zdarzenia
   `production.*` są zapisywane do `outbox_events`, ale nie ma aktywnego
   dyspozytora (zgodnie z `MON-project-overview`) — wysyłka zamknięcia
   finansowego D365 na `production.wo.closed` jest szwem, jeszcze nie
   dostarczonym.

9. **Blokada `changeover_signoff_required` jest celowo nieograniczona w czasie**
   (`start-wo.ts:162-167`) — niepodpisane zdarzenie medium+ blokuje linię
   bezterminowo; jedyną drogą wyjścia jest jej podpisanie. Udokumentowana
   decyzja bezpieczeństwa BRCGS, oflagowana aby czytelnik nie traktował
   tego jako zawieszonego ZP.

W serwisach cyklu życia nie znaleziono surowych markerów `// TODO` poza
cytowanymi powyżej uwagami dotyczącymi własności/uprawnień; lista luk wynika
w pozostałych przypadkach z obserwowanych ograniczeń możliwości i rozbieżności
enum-vs-migracja w kodzie.

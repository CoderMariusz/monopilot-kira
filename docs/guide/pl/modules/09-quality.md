# Jakość — blokady / NCR / kontrole / specyfikacje / HACCP-CCP / łańcuch chłodniczy / recall (przewodnik modułu)

> Szczegółowy przewodnik dla modułu. Każde stwierdzenie poniżej jest zakotwiczone w
> rzeczywistym pliku w `apps/web/…` lub `packages/…`; nic nie jest zmyślone. Moduł
> działa niemal w całości w **jednej grupie tras** — ekrany **Jakość** na komputerze
> pod `…/(modules)/quality/**` — oraz dwa satelity: powierzchnie kontrolne
> **temperatury dostawy GRN** w **Magazynie** (`/warehouse/grns/[grnId]`, podłączone
> przez lokalny adapter strony wywołujący z powrotem do Jakości) oraz szybka ścieżka
> QC na **skanerze** (`POST /api/quality/scanner/inspect`). **Wzorzec zakresów
> temperatur** jest edytowany w **Ustawieniach** (`/settings/quality/temp-ranges`).
>
> 09-quality jest **właścicielem** tabel `quality_holds`, `ncr_reports`,
> `quality_inspections`, `quality_specifications`, tabel planów HACCP/CCP,
> `ccp_deviations`, `delivery_condition_checks`, `complaints`, `capa_actions` i
> `recall_drills`. Jest **producentem** **bramy T-064 do konsumpcji**, którą
> 08-production odczytuje na każdej ścieżce konsumpcji/wyjścia/odpadu/zakończenia
> (blokada `quality_holds`/LP `qa_status`). Nigdy nie zapisuje `wo_outputs` poza
> zmianą ich `qa_status` (granica blokowania/zwalniania).
>
> Trasy są zapisane bez prefiksu `[locale]`. Ostatni przegląd względem niezatwierdzonego
> drzewa roboczego (śledzenie/recall E2A, łańcuch chłodniczy E2B, plany HACCP E3,
> skargi/CAPA, rejestr odchyleń CCP).

---

## a. Przegląd ogólny

Moduł Jakości jest **organem dyspozycyjnym** zakładu. Kwarantannuje zapasy i
zlecenia robocze (**blokady**), formalizuje problemy (**NCR** → analiza przyczyn
źródłowych → **CAPA**), bramkuje materiały przychodzące/w toku/końcowe
(**kontrole**), definiuje kryteria akceptacji, które te kontrole weryfikują
(**specyfikacje**, wersjonowane + podpis elektroniczny), zarządza punktami
kontroli bezpieczeństwa żywności (**plany HACCP → CCP → odczyty monitoringu →
odchylenia**), weryfikuje temperaturę dostawy (**łańcuch chłodniczy**), rejestruje
**reklamacje** klientów i ćwiczy identyfikowalność pod presją czasu (**ćwiczenia
recall / śledzenie**). Niemal każde końcowe przejście wymaga **podpisu elektronicznego
CFR-21 Part 11** (`@monopilot/e-sign` `signEvent`, PIN/hasło weryfikowane
po stronie serwera, niezmienny wiersz `e_sign_log`) — zwolnienie blokady,
zatwierdzenie specyfikacji, aktywacja planu HACCP, zamknięcie krytycznego NCR,
decyzja kontrolna, rozwiązanie odchylenia CCP, zamknięcie CAPA.

Mechanizmem, który sprawia, że Jakość *działa*, jest **maszyna stanu LP `qa_status`**
oraz tabela `quality_holds`. Talerz (License Plate) rodzi się ze statusem
`qa_status='pending'`; założenie blokady lub niepowodzenie kontroli przestawia go na
`on_hold`/`rejected` (czego `holdsGuard` w 08-production odmawia konsumować);
zwolnienie blokady (z dyspozycją) lub zaliczenie kontroli przestawia go na `released`
(możliwy do konsumpcji metodą FEFO) lub `rejected` (zablokowany). Ta sama ścieżka
blokady jest ponownie używana przez wszystko, co wykryje problem — ręczna blokada,
decyzja kontrolna `hold`/`fail`, przekroczenie limitu krytycznego CCP i
temperatura dostawy poza zakresem — wszystko to spływa na `quality_holds` + zdarzenie
outbox `quality.hold.created`, więc jedna ścieżka zwolnienia odblokowuje je wszystkie.

Akcje serwera (Server Actions) mieszkają w `quality/_actions/*` (`hold-actions.ts`,
`ncr-actions.ts`, `inspection-actions.ts`, `spec-actions.ts`, `haccp-actions.ts`
(CCP + monitoring), `haccp-plan-actions.ts`, `ccp-deviation-actions.ts`,
`cold-chain-actions.ts`, `complaint-actions.ts`, `lookup-actions.ts`);
recall/śledzenie to `quality/trace/_actions/trace-actions.ts`; wzorzec ustawień
łańcucha chłodniczego to też `cold-chain-actions.ts` (`upsertProductTempRange`).
Szybka ścieżka QC skanera to `app/api/quality/scanner/inspect/route.ts`.

---

## b. Inwentarz funkcji

> Odczyty/zapisy wskazują dotykane tabele Postgres. „Brama" to uprawnienie sprawdzane
> po stronie serwera **wewnątrz** akcji — brakujące uprawnienie zwraca typowane
> `{ ok:false, reason:'forbidden' }` (rodziny hold/ncr/inspection/spec/haccp/ccp)
> lub `{ ok:false, error:'forbidden' }` (rodziny cold-chain / complaint / trace),
> **nigdy 500**. Trasa inspekcji skanera dodatkowo wymaga **sesji PIN skanera**
> (`requireScannerSession`) **i** ponownie sprawdza `quality.inspection.execute`.
> Wszystkie akcje działają wewnątrz `withOrgContext` (RLS `app.current_org_id()`).

### Blokady — `quality/_actions/hold-actions.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Brama | Cofnięcie / korekta |
|---|---|---|---|---|
| `listHolds({status,referenceType,search,limit})` | Lista blokad (zakładka Aktywne/Zwolnione/Wszystkie + filtr typu referencji + wyszukiwanie po nr blokady/referencji/LP/WO/GRN). Rozwiązuje czytelny `referenceDisplay` i etykietę powodu z `reference.quality_hold_reasons`. | odczyt `quality_holds`, `quality_hold_items`, `license_plates`, `items`, `work_orders`, `grns`, `reference_tables` | `quality.dashboard.view` | — (odczyt) |
| `getHoldDetail(holdId)` | Nagłówek + zablokowane pozycje (LP/ilość/status) + powiązane NCR do ekranu szczegółów. | odczyt `quality_holds`, `quality_hold_items`, `license_plates`, `items`, `ncr_reports` | `quality.dashboard.view` | — (odczyt) |
| `createHold({referenceType,referenceId,reasonCodeId?,reasonText?,priority,lpIds?,estimatedReleaseAt?})` | Otwiera blokadę na LP/partii/WO/PO/GRN. Wstawia `quality_holds` (`hold_status='open'`), wstawia wiersz `quality_hold_items` na każde LP, przestawia każdy niekońcowy LP `qa_status='on_hold'` i (dla referencji `wo`) przestawia `wo_outputs.qa_status='ON_HOLD'` dla tego WO. Wywodzi `default_hold_duration_days` z jawnej daty szacowanego zwolnienia lub domyślnego kodu przyczyny. Emituje `quality.hold.created`. | zapisuje `quality_holds`, `quality_hold_items`, `license_plates`, `wo_outputs`, `outbox_events` | `quality.hold.create` | `releaseHold` |
| `releaseHold({holdId,disposition,reasonText,signature})` | **Podpis elektroniczny CFR-21** (intent `qa.hold.release`). Blokuje wiersz (już zwolniony → błąd), rejestruje dyspozycję (`release`/`scrap`/`rework`/`partial`), aktualizuje status `quality_hold_items` i przestawia `qa_status` zablokowanych LP (`released` przy release/rework/partial, `rejected` przy scrap; `release` przywraca też LP `blocked` na `available`) z wierszem `lp_state_history` dla każdego. Ponownie otwiera wyniki WO (`ON_HOLD → PENDING`) przy zwolnieniu referencji `wo`. Emituje `quality.hold.released`. | zapisuje `quality_holds`, `quality_hold_items`, `license_plates`, `lp_state_history`, `wo_outputs`, `e_sign_log`, `outbox_events` | `quality.hold.release` | — (końcowe; to **jest** odwrócenie `createHold`) |
| `releaseHoldFromWarehouseLpUnblock({lpId,reasonText})` | Szew „odblokowania LP" po stronie magazynu: wyszukuje najnowszą aktywną blokadę LP i zwalnia ją przez wspólny `releaseHoldCore` (bez `signEvent` — zastępuje go zaszyfrowany podmiot). LP musi być `blocked` + `on_hold`. | te same zapisy co `releaseHold` (bez `e_sign_log`) | `warehouse.lp.block` | — |

### NCR — `quality/_actions/ncr-actions.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Brama | Cofnięcie / korekta |
|---|---|---|---|---|
| `listNcrs({status,severity,ncrType,search,limit})` | Lista NCR (filtry statusu/wagi/typu + wyszukiwanie po nr/tytule/opisie/produkcie/blokadzie). | odczyt `ncr_reports`, `items`, `quality_holds` | `quality.dashboard.view` | — (odczyt) |
| `getNcrDetail(ncrId)` | Szczegóły NCR; gdy `reference_type='ccp_deviation'`, rozwiązuje **kontekst naruszenia CCP** (kod CCP/limity/jm + zmierzona wartość/czas/odczytujący) z `haccp_ccps` + powiązanego `haccp_monitoring_log`. | odczyt `ncr_reports`, `items`, `quality_holds`, `haccp_ccps`, `haccp_monitoring_log`, `users` | `quality.dashboard.view` | — (odczyt) |
| `createNcr({ncrType,severity,title?,description?,referenceType?,referenceId?,productId?,affectedQtyKg?,linkedHoldId?})` | Wstawia NCR (`status='open'`). Emituje `quality.ncr.opened`. Wywoływana też wewnętrznie przez auto-NCR naruszenia CCP i konwersję reklamacji. | zapisuje `ncr_reports`, `outbox_events` | `quality.ncr.create` | `closeNcr` |
| `updateNcrInvestigation({ncrId,rootCause?,rootCauseCategory?,immediateAction?,correctiveAction?,capaRecordId?,assignedTo?,investigatorId?})` | Rejestruje dochodzenie; przestawia `open/draft/reopened → investigating`. Odmawia przy `closed`/`cancelled`. Emituje `quality.ncr.updated`. | zapisuje `ncr_reports`, `outbox_events` | `quality.ncr.create` | edytuj ponownie (do zamknięcia) |
| `closeNcr({ncrId,resolution,signature?})` | Zamyka NCR. **Krytyczne NCR wymagają `quality.ncr.close_critical` + podpisu elektronicznego CFR-21** (intent `qa.ncr.close`); drobne/poważne zamknięcie przez `quality.ncr.create` bez podpisu. Blokada wiersza; już końcowy → błąd. Emituje `quality.ncr.closed`. | zapisuje `ncr_reports`, `e_sign_log` (krytyczny), `outbox_events` | `quality.ncr.create` (niekrytyczny) **lub** `quality.ncr.close_critical` (krytyczny) | — (końcowe; **brak akcji ponownego otwarcia — patrz luki**) |

### Kontrole — `quality/_actions/inspection-actions.ts` + skaner `…/api/quality/scanner/inspect/route.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Brama | Cofnięcie / korekta |
|---|---|---|---|---|
| `listInspections({status,search,limit})` | Lista kontroli (zakładka statusu + wyszukiwanie po nr/LP/GRN/WO/pozycji); rozwiązuje `referenceDisplay` + imię osoby przypisanej. | odczyt `quality_inspections`, `license_plates`, `grns`, `wo_outputs`, `work_orders`, `items`, `users` | `quality.inspection.execute` | — (odczyt) |
| `getInspectionDetail(inspectionId)` | Paczka szczegółów zawierająca sparsowane parametry, nazwy decydenta/twórcy i lateral-join do najnowszej **aktywnej blokady** dla LP kontroli (głęboki link, bez FK). | odczyt `quality_inspections`, `license_plates`, `grns`, `wo_outputs`, `work_orders`, `items`, `users`, `quality_holds` | `quality.inspection.execute` | — (odczyt) |
| `searchInspectionLps` / `resolveInspectionGrn` / `resolveInspectionWoOutput` / `searchInspectionAssignees` | Wybieraki referencji i osoby przypisanej do modalu tworzenia (autouzupełnianie LP, nr GRN → uuid, nr partii WO-output → uuid, autouzupełnianie użytkownika). | odczyt `license_plates`/`items`, `grns`, `wo_outputs`/`work_orders`, `users` | `quality.inspection.assign` | — (odczyt) |
| `createInspection({referenceType,referenceId,productId?,assignedTo?,dueDate?,notes?})` | Otwiera kontrolę (`status='pending'`). `inspection_number` bity przez `public.next_quality_inspection_number(org)` → **`INSP-NNNNNNNN`** (8-znakowe, bez części daty; mig 272). `revalidatePath('/quality')`. | zapisuje `quality_inspections` | `quality.inspection.assign` | — (anulowanie tylko przez DB; **brak akcji anulowania — patrz luki**) |
| `recordInspectionResult({inspectionId,parameters[],notes?})` | Rejestruje zaliczenie/niezaliczenie per-parametr + uwagi; `pending/in_progress → in_progress`. Parametry przechowywane jako JSONB. | zapisuje `quality_inspections` | `quality.inspection.execute` | ponowny zapis (do decyzji) |
| `submitInspectionDecision({inspectionId,decision,signature,note?})` | **Podpis elektroniczny CFR-21** (intent `qa.inspection.submit`). Blokada wiersza; już końcowy → błąd. `pass → passed`, `fail → failed`, `hold → on_hold`. **Efekty uboczne LP (atomowe):** `pass → qa_status='released'`, `fail → 'rejected'`, `hold → 'on_hold'` + otwiera `quality_holds` o wysokim priorytecie (z pozycją + outbox `quality.hold.created`). | zapisuje `quality_inspections`, `license_plates`, `quality_holds`, `quality_hold_items`, `e_sign_log`, `outbox_events` | `quality.inspection.execute` | jednostronne (decyzja jest ostateczna); cofnij stan LP przez blokadę |
| Inspekcja skanera `POST …/api/quality/scanner/inspect` | Szybka ścieżka QC na urządzeniu ręcznym. Tworzy kontrolę (ten sam alokator INSP) + stosuje te same efekty uboczne decyzji LP (`release`/`reject`/open-hold). **Celowo BEZ podpisu elektronicznego** (sesja PIN-bound jest tożsamością; `signature_hash=NULL`). Idempotentna na `scanner_audit_log(org_id, client_op_id)`; blokada doradcza per LP + op-id. | zapisuje `quality_inspections`, `license_plates`, `quality_holds`, `quality_hold_items`, `outbox_events`, `scanner_audit_log` | sesja PIN skanera + `quality.inspection.execute` | jednostronne |

### Specyfikacje — `quality/_actions/spec-actions.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Brama | Cofnięcie / korekta |
|---|---|---|---|---|
| `listSpecs({status,search,limit})` / `getSpecDetail(specId)` | Lista specyfikacji + szczegóły (nagłówek + uporządkowane parametry). | odczyt `quality_specifications`, `quality_spec_parameters`, `items` | `quality.dashboard.view` | — (odczyt) |
| `createSpec({productId,specCode,parameters[]})` | Tworzy specyfikację w **wersji roboczej**; `version` = `max(version)+1` dla danego produktu+kodu; wstawia ≥1 wiersz `quality_spec_parameters` (cel/min/max/jednostka/krytyczny, NUMERIC). | zapisuje `quality_specifications`, `quality_spec_parameters` | `quality.spec.approve` | `supersedeSpec` |
| `submitSpecForReview({specId})` | `draft → under_review` (blokuje do zatwierdzenia). | zapisuje `quality_specifications` | `quality.spec.approve` | (brak jawnego cofnięcia) |
| `approveSpec({specId,signature})` | **Podpis elektroniczny CFR-21** (intent `qa.spec.approve`). `under_review → active`; stempluje zatwierdzającego + `approval_signature_hash`. Blokada wiersza; musi być `under_review`. | zapisuje `quality_specifications`, `e_sign_log` | `quality.spec.approve` | `supersedeSpec` |
| `supersedeSpec({specId,bySpecId})` | `* → superseded`, rejestrując identyfikator zastępującej specyfikacji. | zapisuje `quality_specifications` | `quality.spec.approve` | — (końcowe) |

### Plany HACCP — `quality/_actions/haccp-plan-actions.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Brama | Cofnięcie / korekta |
|---|---|---|---|---|
| `listHaccpPlans()` / `getHaccpPlan(id)` | Plany + ich CCPs (zgrupowane). | odczyt `haccp_plans`, `haccp_ccps` | `quality.haccp.plan_edit` | — (odczyt) |
| `upsertHaccpPlan({id?,name,scopeType,scopeRef?,siteId?})` | Tworzy (`status='draft'`, wersja 1) lub zmienia nagłówek planu. | zapisuje `haccp_plans` | `quality.haccp.plan_edit` | edytuj ponownie (wersja robocza) |
| `activateHaccpPlan(planId,{password})` | **Podpis elektroniczny CFR-21** (intent `qa.haccp.plan.activate`). Zastępuje każdy inny `active` plan o tej samej nazwie, następnie `* → active` (stempluje zatwierdzającego). | zapisuje `haccp_plans`, `e_sign_log` | `quality.haccp.plan_edit` | `newPlanVersion` |
| `newPlanVersion(planId)` | Klonuje `active` plan do nowej **wersji roboczej** na `version+1`, kopiując jego CCPs (kody z sufiksem `-vN`). | zapisuje `haccp_plans`, `haccp_ccps` | `quality.haccp.plan_edit` | — |

### CCP + monitoring — `quality/_actions/haccp-actions.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Brama | Cofnięcie / korekta |
|---|---|---|---|---|
| `listCcps({activeOnly?})` / `listMonitoringLog({ccpId?,days?})` | Tablica CCP + odczyty monitoringu. **Brama odczytu złagodzona (P1):** `quality.haccp.plan_edit` **LUB** `quality.ccp.deviation_override` (czytający, który może rejestrować, ale nie edytować, nadal widzi tablicę). | odczyt `haccp_ccps`, `haccp_monitoring_log` | `plan_edit` LUB `ccp.deviation_override` | — (odczyt) |
| `upsertCcp({…})` | Tworzy/edytuje CCP (kod/zagrożenie/limity krytyczne/częstotliwość/działanie korygujące; min≤max walidowane po stronie klienta i serwera). | zapisuje `haccp_ccps` | `quality.haccp.plan_edit` | edytuj ponownie |
| `recordMonitoring({ccpId,measuredValue,woId?,note?})` | Rejestruje odczyt CCP (porównanie dokładne NUMERIC względem limitów). **W limitach:** tylko rejestruje. **Poza limitem (automatyczna kaskada):** rejestruje naruszenie, **automatycznie otwiera krytyczny NCR** (`reference_type='ccp_deviation'`, linki `breach_ncr_id`), wstawia wiersz `ccp_deviations` i — jeśli `woId` wskazuje na bieżące LP wyjścia — otwiera **krytyczne `quality_holds`** na tym LP + przestawia je na `on_hold`. Emituje `quality.ncr.opened` + `quality.hold.created`. Deduplikuje na istniejącym odchyleniu dla tego samego logu. | odczyt `haccp_ccps`; zapisuje `haccp_monitoring_log`, `ncr_reports`, `ccp_deviations`, `quality_holds`, `quality_hold_items`, `license_plates`, `outbox_events` | `quality.ccp.deviation_override` | `resolveCcpDeviation` |

### Odchylenia CCP — `quality/_actions/ccp-deviations/… / _actions/ccp-deviation-actions.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Brama | Cofnięcie / korekta |
|---|---|---|---|---|
| `listCcpDeviations({status?})` / `getCcpDeviation(id)` | Rejestr odchyleń (otwarte/rozwiązane), rozwiązując powiązaną blokadę + nazwy otwierającego/zamykającego. Brama odczytu złagodzona: `quality.dashboard.view` LUB `quality.ccp.deviation_override`. | odczyt `ccp_deviations`, `haccp_ccps`, `quality_holds`, `license_plates`, `items`, `work_orders`, `grns`, `users` | `dashboard.view` LUB `ccp.deviation_override` | — (odczyt) |
| `resolveCcpDeviation(id,{actionTaken,disposition,signature})` | **Podpis elektroniczny CFR-21** (intent `qa.haccp.ccp.deviation`). `open → resolved` (rejestruje działanie/dyspozycję + `esign_ref`); jeśli blokada jest powiązana, **zwalnia ją** przez `releaseHold` (dyspozycja `release`, ten sam podpis). | zapisuje `ccp_deviations`, `quality_holds` (+ zapisy zwolnienia), `e_sign_log` | `quality.ccp.deviation_override` | — (końcowe) |

### Łańcuch chłodniczy (temperatura dostawy) — `quality/_actions/cold-chain-actions.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Brama | Cofnięcie / korekta |
|---|---|---|---|---|
| `listProductTempRanges()` | Wzorzec zakresów temperatur per-produkt (Ustawienia → ekran temp-ranges). | odczyt `product_temp_ranges`, `items` | `quality.coldchain.manage` | — (odczyt) |
| `upsertProductTempRange({itemId,minTempC,maxTempC,requiresCheck})` | Tworzy/edytuje zakres temperatury produktu (min≤max walidowane). | zapisuje `product_temp_ranges` | `quality.coldchain.manage` | edytuj ponownie |
| `submitConditionCheck({itemId,measuredTempC,grnItemId?,lpId?})` | Kontrola temperatury dostawy **E2B** na przyjętej linii GRN (wywoływana z Magazynu przez `cold-chain-adapter.ts`). Wczytuje zakres pozycji; jeśli `requires_check` i odczyt jest poza zakresem przy dostarczonym LP, otwiera (lub ponownie używa w ciągu 24h) **krytyczne `quality_holds`** przez `createHold`. Rejestruje kontrolę niezależnie od wyniku. | odczyt `product_temp_ranges`, `grn_items`, `license_plates`; zapisuje `delivery_condition_checks`, `quality_holds` (przy naruszeniu, przez `createHold`) | `quality.coldchain.record` | zwolnienie blokady w Jakości |

### Reklamacje + CAPA — `quality/_actions/complaint-actions.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Brama | Cofnięcie / korekta |
|---|---|---|---|---|
| `createComplaint({customerId?,lpId?,batchRef?,description,severity})` | Rejestruje reklamację klienta (`status='open'`); rozwiązuje wyświetlanie klienta/LP/partii. | zapisuje `complaints` | `quality.ncr.create` | (zamknięcie przez konwersję) |
| `listComplaints({status?})` / `getComplaint(id)` | Rejestr reklamacji + szczegóły. | odczyt `complaints`, `customers`, `license_plates` | `quality.dashboard.view` | — (odczyt) |
| `convertComplaintToNcr(complaintId)` | Tworzy NCR (`ncrType='complaint_related'`, waga mapowana) z reklamacji przez `createNcr`, następnie łączy go i ustawia `status='converted'` na reklamacji. | odczyt `complaints`, `license_plates`; zapisuje `complaints`, `ncr_reports`, `outbox_events` (przez `createNcr`) | `quality.ncr.create` | — |
| `createCapaAction({sourceType,sourceId,actionType,description,ownerUserId?,dueDate?})` | Dodaje korygujące/prewencyjne działanie CAPA wobec reklamacji lub NCR (`status='open'`). | zapisuje `capa_actions` | `quality.ncr.create` | `resolveCapaAction` |
| `listCapaActions({sourceType?,sourceId?,status?})` | Lista CAPA (filtrowalna). | odczyt `capa_actions` | `quality.dashboard.view` | — (odczyt) |
| `resolveCapaAction(id,{signature})` | **Podpis elektroniczny CFR-21** (intent `qa.capa.close`). `* → closed` (rejestruje `esign_ref`). | zapisuje `capa_actions`, `e_sign_log` | `quality.ncr.create` | — (końcowe) |

### Śledzenie + ćwiczenia recall — `quality/trace/_actions/trace-actions.ts`

| Akcja | Co robi | Odczytuje / zapisuje | Brama | Cofnięcie / korekta |
|---|---|---|---|---|
| `runTraceReport({inputType,inputRef,direction})` | Przechodzi **genealogię LP** (`queryGenealogy`) w górę/dół od ziarna LP/partii/pozycji; buduje graf węzeł/krawędź dostawca→PO→GRN→LP→WO→wyjście + listę płaską + podsumowanie kg. Tylko do odczytu. | odczyt `license_plates`, `grn_items`, `grns`, `purchase_order_lines`, `purchase_orders`, `suppliers`, `wo_material_consumption`, `wo_outputs`, `work_orders`, `items`, `lp_genealogy` | `quality.dashboard.view` (TODO: dedykowane `quality.trace.run`) | — (odczyt) |
| `startRecallDrill({inputType,inputRef,direction,is_drill?})` | Wstawia wiersz `recall_drills` (`started_at`) i uruchamia śledzenie; zwraca `{drillId, report}` (dla przepływu ćwiczenia z pomiarem czasu). | zapisuje `recall_drills` (+ odczyty śledzenia) | `quality.dashboard.view` | — |
| `completeRecallDrill(drillId,result)` | Stempluje `completed_at` + WYGENEROWANY `duration_ms` + wynik JSONB (mierzony względem celu 4h). | zapisuje `recall_drills` | `quality.dashboard.view` | — |
| `getRecallDrills()` / `getRecallDrill(id)` | Lista ćwiczeń recall + szczegóły. | odczyt `recall_drills` | `quality.dashboard.view` | — (odczyt) |

### Wyszukiwania (pomocniki modali) — `quality/_actions/lookup-actions.ts`

| Akcja | Co robi | Odczytuje | Brama |
|---|---|---|---|
| `resolveLpByNumber` / `searchLps` / `resolveWoByNumber` / `resolveGrnByNumber` | Rozwiązywanie **numer LP/WO/GRN → uuid** + autouzupełnianie LP do modalu tworzenia blokady (operatorzy nigdy nie wklejają UUID). | `license_plates`, `items`, `work_orders`, `grns` | `quality.dashboard.view` |

**Zinwentaryzowana liczba akcji: 40** (5 blokad, 5 NCR, 8 kontroli wliczając skaner+4 wybieraki, 5 specyfikacji, 4 plan HACCP, 3 CCP/monitoring, 3 odchylenia CCP, 3 łańcuch chłodniczy, 6 reklamacje/CAPA, 5 śledzenie/recall, 4 wyszukiwania). Rdzeń dyspozycji to `createHold`/`releaseHold` + `submitInspectionDecision` + zatwierdzenie specyfikacji + automatyczna kaskada `recordMonitoring`.

---

## c. Maszyna stanu

### Cykl życia blokady (`quality_holds.hold_status`, mig 197)

```
 open ──┬─► investigating ──┐
        ├─► escalated ──────┼──── releaseHold (e-sign + disposition) ──► released
        └─► quarantined ────┘                                            (terminal)
   (open / investigating / escalated / quarantined = AKTYWNA)
```

| Stan | Znaczenie | Kto zapisuje | Uwagi |
|---|---|---|---|
| `open` | Aktywna blokada (domyślna przy tworzeniu) | `createHold` / inspekcja `hold` / naruszenie CCP / naruszenie łańcucha chłodniczego | Cztery aktywne statusy (`open`/`investigating`/`escalated`/`quarantined`) to **brama T-064** — LP pod jednym z nich ma `qa_status='on_hold'` i nie może być skonsumowane. |
| `investigating` / `escalated` / `quarantined` | Nadal aktywny | (poziom DB; brak dedykowanej akcji przejścia) | Wszystkie liczą się jako „aktywne" w `listHolds` + widoku `v_active_holds` (mig 197). |
| `released` | Zadysponowany (końcowy) | `releaseHold` (+ `releaseHoldFromWarehouseLpUnblock`, `resolveCcpDeviation`) | Dyspozycja ∈ `release`/`scrap`/`rework`/`partial`; scrap → LP `rejected`, pozostałe → LP `released`. **Brak „cofnięcia zwolnienia"**. |

### Cykl życia NCR (`ncr_reports.status`)

```
 open ──dochodzenie──► investigating ──closeNcr (e-sign jeśli krytyczny)──► closed (terminal)
   │                                                                           ▲
   └──────────────────────────── closeNcr ────────────────────────────────────┘
```

| Stan | Dozwolone przejście | Kto zapisuje | Uwagi |
|---|---|---|---|
| `open` | → `investigating` (rejestruj dochodzenie) lub → `closed` | `createNcr` / `recordMonitoring` (krytyczne naruszenie CCP) | NCR z naruszeniem CCP rodzą się jako `open`, `severity='critical'`, `reference_type='ccp_deviation'`. |
| `investigating` | → `closed` | `updateNcrInvestigation` | Przyczyna źródłowa / działanie natychmiastowe / korygujące + link CAPA. |
| `closed` | — (końcowy) | `closeNcr` | **Krytyczny** ⇒ `quality.ncr.close_critical` + podpis elektroniczny CFR-21; w przeciwnym razie `quality.ncr.create`, bez podpisu. |
| `draft` / `reopened` / `awaiting_capa` / `cancelled` | zadeklarowane w typie | — | **Obecne w enum/typie, ale żadna akcja ich nie zapisuje — patrz luki (brak ścieżki ponownego otwarcia/anulowania/wersji roboczej).** |

### Cykl życia kontroli (`quality_inspections.status`, mig 272)

```
 pending ──rejestracja──► in_progress ──submitDecision (e-sign)──┬─► passed   (LP zwolniony)
   │                                                             ├─► failed   (LP odrzucony)
   └────────────────── submitDecision ──────────────────────────┴─► on_hold  (LP on_hold + nowa blokada)
                                                                   (passed/failed/on_hold/cancelled = końcowy)
```

| Stan | Dopuszczalny następny | Kto zapisuje | Efekt uboczny LP |
|---|---|---|---|
| `pending` | `in_progress` (rejestracja) lub bezpośrednia decyzja | `createInspection` | — |
| `in_progress` | `passed`/`failed`/`on_hold` | `recordInspectionResult` | — |
| `passed` | — (końcowy) | `submitInspectionDecision` (`pass`) | LP `qa_status='released'` (możliwy do konsumpcji FEFO) |
| `failed` | — (końcowy) | `submitInspectionDecision` (`fail`) | LP `qa_status='rejected'` |
| `on_hold` | — (końcowy) | `submitInspectionDecision` (`hold`) | LP `qa_status='on_hold'` + otwarto nowy `quality_holds` |
| `cancelled` | — (końcowy) | (brak akcji; zarezerwowany) | — |

### Cykl życia specyfikacji (`quality_specifications.status`)

```
 draft ──submit──► under_review ──approve (e-sign)──► active ──supersede──► superseded
                                                          │                   (terminal)
                                                          └── (expired) ───────┘
```

| Stan | Dopuszczalny następny | Kto zapisuje | Uwagi |
|---|---|---|---|
| `draft` | `under_review` | `createSpec` → `submitSpecForReview` | Edytowalny tylko jako wersja robocza (tworzenie; brak osobnej akcji edycji linii). |
| `under_review` | `active` | `approveSpec` | **Wymagany podpis elektroniczny CFR-21** do przejścia na aktywny. |
| `active` | `superseded` | `supersedeSpec` | Nowa zatwierdzona wersja zastępuje poprzednią. |
| `superseded` / `expired` | — (końcowy) | `supersedeSpec` / (DB) | Niezmienny. |

### LP `qa_status` przez Jakość (brama T-064)

```
pending ──createHold / inspekcja hold / naruszenie CCP / naruszenie łańcucha chłodniczego──► on_hold
   │                                                                                           │ releaseHold(release/rework/partial)
   │  zaliczenie inspekcji ──► released (możliwy do konsumpcji FEFO)                           ▼
   │  niezaliczenie inspekcji / blokada-scrap ──► rejected (zablokowany)                  released / rejected
```

Maszyna jest egzekwowana **po stronie serwera wewnątrz każdej akcji** (wstępne
sprawdzenie statusu + blokady wierszy `for update` + zabezpieczenia
`status <> all(TERMINAL_LP_STATUSES)`), a UI renderuje tylko legalne/dozwolone
przyciski (`canRelease`, `canEdit*` rozwiązywane po stronie serwera i przekazywane
do wysp klienckich). Stany końcowe **nie mają następników**; błędne zwolnienie
blokady / decyzja kontrolna nie jest odwracalna w miejscu — ponownie blokujesz LP.

<!-- screenshot: quality/holds list (Active/Released tabs + Create hold) -->
<!-- screenshot: quality/holds/[holdId] detail (held items + Release hold + signed banner) -->
<!-- screenshot: quality/inspections/[inspectionId] detail (parameters + Pass/Fail + e-sign) -->
<!-- screenshot: quality/specifications/[specId] detail (parameters + Approve specification) -->
<!-- screenshot: quality/ccp-monitoring board (CCP cards + Record reading) -->

---

## d. Instrukcje użytkownika

> Etykiety przycisków poniżej to dosłowna angielska treść: blokady/NCR/kontrole/specyfikacje
> pochodzą z przygotowanych pakietów `_meta/i18n-staging/quality-{holds,ncrs,inspections,specs}.json`;
> HACCP/CCP/odchylenia/reklamacje/śledzenie pochodzą z przestrzeni nazw `quality.*`
> live next-intl (`apps/web/i18n/en.json`). `data-testid` w nawiasach to trwałe
> kotwice w kodzie komponentów.

### Blokady jakościowe (Holds)

Przejdź do **Jakość → Blokady** (`/quality/holds`), aby wyświetlić listę wszystkich wstrzymań. Ekran pokazuje blokady z zakładkami (Aktywne / Zwolnione / Wszystkie) i możliwością filtrowania po typie referencji (LP / Partia / ZP / ZZ / GRN).

![Lista blokad jakościowych — zakładki statusów, kolumny: Blokada, Typ, Referencja, LP, Partia, Status, Zwolnienie](screenshots/quality-holds-list.png)

### Szczegóły blokady i zwolnienie z e-podpisem

Otwórz konkretną blokadę (np. HLD-00001000), aby zobaczyć jej szczegóły, historię i panel zwolnienia. Panel pokazuje kontekst blokady, zablokowane pozycje oraz formularz zwolnienia z e-podpisem (CFR Part 11).

![Szczegóły blokady jakościowej (HLD-00001000) — zablokowane pozycje, wybór dyspozycji (Release as-is/Scrap/Rework/Partial), pole e-podpisu](screenshots/quality-hold-detail.png)

### (i) Zakładanie blokady + zwalnianie jej (z podpisem elektronicznym)

1. Przejdź do **Jakość → Blokady** (`/quality/holds`). Kliknij **"Create hold"**
   (`holds-create-open`).
2. W modalu tworzenia (`hold-create-modal.client.tsx`):
   - **Typ referencji** (`hold-create-reftype-{lp|batch|wo|po|grn}`).
   - Dla **LP**: wpisz numer LP / kod pozycji w wyszukiwarce **"License plate"**
     (`hold-create-lp-search`, `searchLps`) i wybierz dopasowanie — **bez UUID**. Dla
     **WO/GRN/PO/partii** wklej numer (rozwiązywany przy zapisie przez `resolveWoByNumber`/
     `resolveGrnByNumber`). Opcjonalnie dodaj **Dodatkowe LP** (po jednym w linii).
   - **Powód** (`hold-create-reason`), **Priorytet** (`hold-create-priority-{p}`),
     opcjonalna **Szacowana data zwolnienia**.
   - Zapisz (**"Create hold"**) → `createHold`. Zablokowane LP przestawiają się na `on_hold`
     i natychmiast wypadają z konsumpcji FEFO.
3. Aby zwolnić: otwórz blokadę (`/quality/holds/[holdId]`) i kliknij **"Release hold"**
   (w karcie Akcje; ukryta po zwolnieniu).
4. W modalu zwolnienia (`hold-release-modal.client.tsx`): wybierz **Dyspozycję**
   (**Release as-is** / **Scrap** / **Rework** / **Partial release** — nie może być
   Pending), wpisz **Uwagi do zwolnienia** i wprowadź **hasło do konta** w sekcji
   **"Electronic signature (21 CFR Part 11)"**. Zapisz (**"Release hold"**) →
   `releaseHold`. Podpisany, niezmienny baner zastępuje akcje; **Scrap** odrzuca
   LP, pozostałe zwalniają go z powrotem do puli konsumpcji.

### (ii) Otwieranie + zamykanie NCR

1. **Jakość → NCR** (`/quality/ncrs`) → **"Create NCR"** (`ncrs-create-open`).
2. W modalu tworzenia: wybierz **Typ NCR** i **Wagę** (ustawia okno odpowiedzi BRCGS:
   krytyczny 24h / poważny 48h / drobny 7 dni), wpisz **Tytuł** + **Opis**
   (min. 20 znaków), opcjonalnie powiąż **blokadę** (wpisz jej numer) i **dotkniętą ilość**.
   Zapisz (**"Create NCR"**) → `createNcr`. NCR otwiera się.
3. Na ekranie szczegółów wypełnij sekcję **Dochodzenie** (przyczyna źródłowa, kategoria
   przyczyny źródłowej, działanie natychmiastowe) i kliknij **"Save changes"** →
   `updateNcrInvestigation` (NCR przechodzi do stanu *investigating*). Dodaj działania
   **CAPA** z karty CAPA (`createCapaAction`).
4. Aby zamknąć: kliknij **"Close NCR"**. Wpisz **Uwagi do zamknięcia** (min. 10 znaków).
   Jeśli NCR jest **krytyczny**, pojawia się blok **"Electronic signature (21 CFR Part 11)"**
   i wymagane jest hasło do zamknięcia (`quality.ncr.close_critical`); drobne/poważne
   zamknięcie bez podpisu. Zapisz (**"Close NCR"**) → `closeNcr` — zamknięcie jest
   nieodwracalne.

### (iii) Przeprowadzanie kontroli

1. **Jakość → Kontrole** (`/quality/inspections`) → **"New inspection"**.
2. W modalu tworzenia: wybierz **Typ referencji** (**License plate** / **GRN** /
   **WO output**), wybierz/rozwiąż referencję (wyszukiwanie LP, numer GRN lub
   numer partii WO-output), opcjonalnie **Przypisz do** inspektora i ustaw **Termin**.
   Zapisz (**"Create inspection"**) → `createInspection` (numer `INSP-NNNNNNNN`).
3. Otwórz kontrolę (`/quality/inspections/[inspectionId]`). W sekcji **Parametry
   testowe** wprowadź **rzeczywistą** wartość każdego parametru i oznacz **Pass**/**Fail**,
   następnie **"Save results"** → `recordInspectionResult` (status → *in progress*).
4. Podejmij decyzję w karcie **Decyzja**: wybierz **Pass** / **Fail**, wprowadź
   **hasło do konta** w sekcji **"Electronic signature (21 CFR Part 11)"** i
   **"Sign & submit"** → `submitInspectionDecision`. **Pass** zwalnia LP
   (możliwy do konsumpcji); **Fail** odrzuca go; decyzja **Hold** otwiera blokadę jakości.
   *(Hala produkcyjna:* kafelek QC skanera wysyła do `/api/quality/scanner/inspect`
   i rejestruje tę samą decyzję **bez** podpisu elektronicznego — sesja PIN jest tożsamością.)*

### (iv) Tworzenie + zatwierdzanie specyfikacji

1. **Jakość → Specyfikacje** (`/quality/specifications`) → **"Create specification"**.
2. W modalu tworzenia: **Wybierz produkt**, ustaw **Kod specyfikacji** (unikalny per
   produkt + applies-to) i dodaj wiersze **"+ Add parameter"** (nazwa, **Typ**
   visual/measurement/attribute/microbiological/chemical/sensory/equipment, cel/
   min/max/jednostka, flaga **Krytyczny** — Min ≤ Max wymuszone). Zapisz (**"Create
   specification"**) → `createSpec`. Specyfikacja tworzona jest jako **wersja robocza v1**
   (lub następna wersja dla danego produktu+kodu).
3. Na ekranie szczegółów kliknij **"Submit for review"** (`submitSpecForReview`) →
   *under review* (zablokowana).
4. Kliknij **"🔒 Approve specification"**. Przejdź przez listę kontrolną przed
   zatwierdzeniem, wprowadź **hasło do konta** w bloku podpisu elektronicznego i zapisz
   (**"🔒 Approve specification"**) → `approveSpec`. Specyfikacja przechodzi do stanu
   **aktywnego** (podpisana CFR-21). Później **"Supersede"** wskazuje na nowszą wersję
   (`supersedeSpec`).

### (v) Rejestrowanie kontroli temperatury dostawy w łańcuchu chłodniczym

1. **Wymaganie wstępne (Ustawienia → Jakość → Zakresy temperatur,
   `/settings/quality/temp-ranges`):** dodaj zakres produktu przez
   `upsertProductTempRange` (min/max °C + **wymaga kontroli**).
2. W **szczegółach GRN** (`/warehouse/grns/[grnId]`), każda przyjęta linia pokazuje
   kompaktową kontrolkę **°C + Record** (`grn-temp-check.client.tsx`,
   `grn-temp-check-submit-…`). Wprowadź zmierzoną temperaturę i kliknij **Record** →
   `submitConditionCheck` (przez magazynowy `cold-chain-adapter.ts`).
3. Wynik renderuje się **zielonym "in range"** lub **czerwonym "out of range → quality hold
   created"**: odczyt poza zakresem (z LP i skonfigurowanym zakresem) otwiera
   **krytyczne** `quality_holds` na tym LP (ponownie używane w ciągu 24h), a wiersz
   `delivery_condition_checks` jest zapisywany niezależnie od wyniku. Zwolnij blokadę
   z poziomu **Jakość → Blokady** jak w (i).

### (vi) Przeprowadzanie ćwiczenia recall

1. **Jakość → Śledzenie i recall** (`/quality/trace`). Wybierz **typ wejścia**
   (**License plate** / **Batch** / **Item**), wpisz referencję, wybierz
   **Kierunek** (**Backward** / **Forward** / **Both**) i kliknij **"Run trace"**
   → `runTraceReport`. Renderuje się graf genealogii + lista płaska + podsumowanie
   (dostawca → PO → GRN → LP → WO → wyjście, z podsumowaniem kg).
2. Aby zmierzyć czas ćwiczenia, kliknij **"Save as drill"** → `startRecallDrill`
   (wstawia wiersz `recall_drills` i stempluje `started_at`); wynikowy raport
   jest przechwytywany przez `completeRecallDrill`, który rejestruje **czas trwania**
   od startu do zakończenia względem **celu 4h**.
3. Przeglądaj poprzednie ćwiczenia w **Jakość → Ćwiczenia recall**
   (`/quality/recall-drills`, **"New drill"** linkuje głęboko z powrotem do śledzenia);
   każdy wiersz pokazuje **Within target** / **Over target** i czas trwania, z możliwością
   przejścia do `/quality/recall-drills/[drillId]`.

### (vii) Bonus: plan HACCP → odczyt CCP → rozwiązywanie odchylenia

1. **Jakość → Plany HACCP** (`/quality/haccp`) → **"New plan"** (`upsertHaccpPlan`),
   dodaj CCP (**"Add CCP"**, `upsertCcp`), następnie **"Sign & activate"** plan
   (`activateHaccpPlan`, podpis elektroniczny CFR-21).
2. **Jakość → Monitoring CCP** (`/quality/ccp-monitoring`) → **"Record reading"**:
   wybierz CCP, wprowadź zmierzoną wartość (opcjonalnie powiąż z WO), zapisz (**"Record
   reading"**) → `recordMonitoring`. Wartość poza limitem **automatycznie otwiera krytyczny
   NCR** ("Out of limit — NCR opened", **View NCR**) i, jeśli znaleziono LP wyjścia WO,
   krytyczną blokadę.
3. **Jakość → Odchylenia CCP** (`/quality/ccp-deviations`): przy otwartym odchyleniu
   kliknij **"Resolve"**, zapisz **Działanie korygujące** + **Dyspozycję**, wprowadź
   swój **PIN zatwierdzający** i zapisz (**"Resolve deviation"**) → `resolveCcpDeviation`
   (podpis elektroniczny CFR-21; automatycznie zwalnia powiązaną blokadę).

---

## e. Źródła danych (tabele Supabase)

Blokady / NCR / kontrole / specyfikacje (kanoniczne dla 09-quality):

- `quality_holds` + `quality_hold_items` — nagłówek blokady (status/priorytet/dyspozycja/podpis zwolnienia) + zablokowane wiersze LP (mig 197).
- `ncr_reports` — nagłówek NCR (typ/waga/status, referencja, przyczyna źródłowa, link CAPA, podpis zamknięcia).
- `quality_inspections` — nagłówek kontroli (`INSP-NNNNNNNN`, referencja, parametry JSONB, decyzja + podpis; mig 272).
- `quality_specifications` + `quality_spec_parameters` — wersjonowany nagłówek specyfikacji + parametry (cel/min/max NUMERIC).

HACCP / CCP / odchylenia:

- `haccp_plans` — nagłówek planu (zakres, wersja, status, zatwierdzający).
- `haccp_ccps` — CCP (zagrożenie, critical_limit_min/max, jednostka, częstotliwość, działanie korygujące, link do planu).
- `haccp_monitoring_log` — odczyty CCP (`measured_value`, `within_limits`, `breach_ncr_id`; mig 289).
- `ccp_deviations` — rejestr odchyleń poza limitem (działanie/dyspozycja, link do blokady, `esign_ref`).

Łańcuch chłodniczy / reklamacje / CAPA / recall:

- `product_temp_ranges` — min/max °C per-produkt + `requires_check` (wzorzec łańcucha chłodniczego).
- `delivery_condition_checks` — zarejestrowane kontrole temperatury dostawy (in_range, powód, link do blokady; E2B).
- `complaints` — reklamacje klientów (klient/LP/partia, waga, status, link NCR).
- `capa_actions` — działania korygujące/prewencyjne wobec reklamacji/NCR (`esign_ref`).
- `recall_drills` — zapisane przebiegi śledzenia (`started_at`/`completed_at`/`duration_ms`, wynik JSONB; E2A).

Referencje / między-modułowe (odczyt + efekty uboczne QA):

- `license_plates` + `lp_state_history` — brama T-064 `qa_status` (Jakość przestawia on_hold/released/rejected; konsumowane przez 05-warehouse + 08-production).
- `lp_genealogy` — przejście genealogii śledzenia/recall (`queryGenealogy`).
- `wo_outputs` — blokady referencji WO przestawiają `qa_status` ON_HOLD/PENDING (odczyt/ograniczony zapis tylko `qa_status` — 08-production pozostaje kanonicznym właścicielem).
- `work_orders`, `grns`, `grn_items`, `items`, `customers`, `suppliers`, `purchase_orders`, `purchase_order_lines`, `wo_material_consumption` — odczyty do wyświetlania/śledzenia.
- `reference_tables` — `reference.quality_hold_reasons` (etykiety powodów blokad + domyślny czas trwania).
- `org_document_settings` — sekwencja `insp` dla `next_quality_inspection_number` (mig 272).

Zarządzanie / RBAC:

- `e_sign_log` — podpisy CFR-21 (zwolnienie blokady, zatwierdzenie specyfikacji, aktywacja HACCP, zamknięcie krytycznego NCR, decyzja kontrolna, rozwiązanie odchylenia CCP, zamknięcie CAPA).
- `outbox_events` — `quality.hold.created`, `quality.hold.released`, `quality.ncr.opened`, `quality.ncr.updated`, `quality.ncr.closed`.
- `scanner_audit_log` — idempotentność + audyt QC skanera (`quality.scanner.inspect`).
- `user_roles` / `roles` / `role_permissions` — sprawdzenie `hasPermission` uruchamiane przez każdą akcję.

---

## f. Znane luki / TODO

Zakorzenione w przeczytanym kodzie — bez domysłów:

1. **Brak akcji ponownego otwarcia / anulowania / wersji roboczej NCR.** `NcrStatus`
   deklaruje `draft`/`reopened`/`awaiting_capa`/`cancelled` (`ncr-actions.ts:22`), ale
   **żadna akcja ich nie zapisuje** — `closeNcr` jest końcowe bez odwrócenia, i nie ma
   ścieżki tworzenia jako wersja robocza ani anulowania. Błędnie zamkniętego NCR
   nie można ponownie otworzyć w aplikacji.

2. **Śledzenie/recall ponownie używa uprawnienia dashboardu.** `runTraceReport` /
   `startRecallDrill` / odczyty ćwiczeń recall bramkowane przez `quality.dashboard.view`
   z jawnym `TODO(E2A): dedicated quality.trace.run / quality.recall.manage permission`
   (`trace-actions.ts:167`). Każdy użytkownik jakości może uruchamiać/zapisywać recalle.

3. **Specyfikacje nie mają pierwszoklasowej edycji linii i nie mają autora `expired`.**
   `createSpec` wstawia wszystkie parametry naraz; nie ma akcji dodania/edycji/usunięcia
   parametru w istniejącej wersji roboczej, a `expired` jest w typie, ale dostępny
   tylko przez DB (brak akcji). `applies_to` jest zakodowany na stałe jako `'all'`
   przy tworzeniu (`spec-actions.ts:316`) mimo że UI udostępnia pole „Applies to".

4. **QC skanera NIE MA podpisu elektronicznego (celowe).** `POST …/scanner/inspect`
   rejestruje decyzję z `signature_hash=NULL` — sesja PIN-bound +
   `scanner_audit_log` stanowią tożsamość/identyfikowalność, w odróżnieniu od
   `submitInspectionDecision` na komputerze, który zbiera `signEvent` CFR-21.
   Udokumentowane w trasie (`route.ts` „DELIBERATE no-e-sign fast path"), zaznaczone
   tak, by audytor wiedział, że dwie ścieżki się różnią.

5. **Tworzenie blokady łańcucha chłodniczego nie jest w zewnętrznej transakcji.**
   `submitConditionCheck` wywołuje `createHold` (z własnym `withOrgContext`) przed
   wstawieniem wiersza `delivery_condition_checks` — jawne
   `// TODO: make hold creation share the outer txn` (`cold-chain-actions.ts:267`).
   Awaria między nimi pozostawia blokadę bez wiersza kontroli.

6. **Rozwiązanie odchylenia CCP podpisuje dwukrotnie.** `resolveCcpDeviation` wywołuje
   `signEvent` (intent `qa.haccp.ccp.deviation`) **a następnie** `releaseHold` — który
   uruchamia własny `signEvent` (intent `qa.hold.release`) z tym samym hasłem
   (`ccp-deviation-actions.ts:255,287`). Jedno działanie operatora produkuje dwa wiersze
   w logu e-sign; dopuszczalne do celów audytu, ale warte odnotowania.

7. **Brak przejść pod-statusów blokady.** `investigating`/`escalated`/`quarantined`
   istnieją w ograniczeniu sprawdzającym `quality_holds` (mig 197) i liczą się jako
   „aktywne", ale żadna akcja nie przenosi blokady między nimi — blokada jest tylko
   `open` aż do `released`. Bogatszy przepływ pracy istnieje tylko na poziomie schematu.

8. **Brak akcji „anulowania kontroli" w produkcji / na komputerze.** `quality_inspections`
   ma status `cancelled`, ale żadna akcja go nie ustawia; błędna kontrola może tylko
   zostać zdecydowana, nie unieważniona. Podobnie nie ma powiązania szablonu wyników
   kontroli z `quality_spec_parameters` — parametry są dowolne per-kontrola, nie
   pobierane z zatwierdzonej specyfikacji.

9. **Asymetria bramy odczytu tablicy CCP vs zapisu monitoringu CCP.** Odczyt tablicy
   CCP jest złagodzony do `plan_edit` LUB `ccp.deviation_override` (`haccp-actions.ts:126`),
   ale `recordMonitoring` wymaga tylko `quality.ccp.deviation_override` — użytkownik
   `plan_edit` widzi tablicę, ale nie może rejestrować odczytów. Celowe, ale prawdopodobne
   pytanie do helpdesku.

Poza cytowanym uprawnieniem śledzenia i transakcją łańcucha chłodniczego nie znaleziono
surowych znaczników `// TODO`; pozostałe luki wynikają z dryfu maszyny stanu / enum
vs akcje zaobserwowanego w kodzie.

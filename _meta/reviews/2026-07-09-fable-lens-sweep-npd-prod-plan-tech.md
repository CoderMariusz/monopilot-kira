# Fable lens-sweep — NPD / Production / Planning / Technical (2026-07-09, 18:48–18:56 UTC)

**Metoda:** 10 równoległych agentów Fable (read-only, timebox ~8 min), każdy z INNYM zestawem detekcji błędów, na kodzie `apps/web/app/[locale]/(app)/{(npd),(modules)/{production,planning,technical}}` + `apps/web/lib/*` + `packages/db/migrations` (ground truth schematu). Statyczny bug-hunt — prod i Supabase odcięte polityką sieciową środowiska, więc bez live-kliku. Każdy finding ma dowód `file:line`; sekcje "czyste" = jawnie zweryfikowane kontr-dowody.

**Bilans:** 3× P0 · 17× P1 · ~20× P2. Zero phantom-columns (lens 8 czysty po weryfikacji 108 kandydatów).

---

## TOP — do naprawy najpierw

### P0
1. **WAC: asymetria walutowa pul** — przyjęcie PO księguje do puli w walucie PO, ale WSZYSTKIE debety zużycia/outputu idą do puli GBP → PO w EUR: pula EUR nigdy nie schodzi, konsumpcja debetuje GBP z avg_cost=0 (wycena 0). `lib/finance/book-receipt-wac.ts:86-96` vs `upsert-wac.ts:522-551,32`; callerzy bez currencyCode: `consume-material-actions.ts:679-690`, `register-output.ts:849-856`. (lens 3)
2. **Planning listy: filtry client-side po spaginowanym slice** — PO/WO/TO: szukajka+taby filtrują 50-wierszową stronę, mimo że SQL akcji MA server-side ilike/status; rekord ze str. 2+ nie do znalezienia; liczniki tabów z bieżącej strony (złe totale >50). `po-list-view.tsx:251-263,235-249`, `work-orders/page.tsx:251`, `transfer-orders/page.tsx:221`. (lens 7)
3. **„Parity evidence" Technical to tautologie** — 3 specy e2e (i18n-pl, ECO, BOM-row-actions) serwują WŁASNY statyczny HTML (`harnessHtml()` + `http.createServer`) i asertują na tekście, który same wstrzyknęły; regresja realnego ekranu nigdy ich nie złamie. `technical-i18n-pl-parity-evidence.spec.ts:102-150`, `technical-eco-parity-evidence.spec.ts:1-60`, `technical-bom-row-actions-parity-evidence.spec.ts`. (lens 10)

### P1 — najcięższe
- **RBAC allow-everywhere w Planning:** cały CRUD PO / TO / suppliers / bulk-import bez ŻADNEGO permission checku, a w seedach nie istnieje żaden string `planning.po.*`/`planning.to.*`/`planning.supplier.*` — każdy członek orga mutuje zakupy/transfery/dostawców. `purchase-orders/_actions/actions.ts:456+`, `transfer-orders/_actions/actions.ts`, `suppliers/_actions/actions.ts`, `import-po.ts`, `import-to.ts`. (lens 5)
- **NPD omija maszynę stanów BOM Technical:** `materialize-npd-bom.ts:891-899` aktywuje bom_header bez warunku statusu + self-approve; `update-bom-yield.ts:56-63` mutuje in-place ACTIVE header bez nowej wersji/Technical approval. (lens 4/6)
- **`releaseWorkOrder` heal-write utrwala się mimo odmowy release:** UPDATE backfill przed gate'ami + commit-on-return przy `return {ok:false}`. `releaseWorkOrder.ts:52-121`. (lens 2)
- **G3 approve skacze stage'ami:** approve → 'approval' z dowolnego stage'a G3, blockery liczone dla złego celu. `approve-project-gate.ts:86-91,143-153,203-207`. (lens 6)
- **Lifecycle formulacji odwrócony:** `submitted_for_trial` nigdy nie zapisywany (dead state), submitForTrial wymaga 'locked'. `submit-for-trial.ts:82`, `lock-version.ts:50,58`. (lens 6)
- **09-quality pisze wprost do `wo_outputs`** (owner: 08-production) — dwóch mutatorów qa_status; release holda blanket-resetuje PENDING (gubi PASSED/FAILED). `hold-actions.ts:337-344,839-847`. (lens 4)
- **Production WO lista: hard-cap 200 bez paginacji** + szukajka client-side; Technical items: cap 200, zero pagera, akcja bez search. (lens 7)
- **WAC-pochodne:** storna zawsze do puli GBP; kg do WAC liczone JS-floatem; linie w nierozwiązywalnym UoM cicho wypadają z kosztu WO; cichy fallback walut do GBP. `upsert-wac.ts:332-386`, `register-output.ts:918`, `resolve-output-wac.ts:54-67`, `book-receipt-wac.ts:155-158`. (lens 3)
- **i18n: paczki brakujących kluczy** (runtime MISSING_MESSAGE w pl/ro/uk): Technical.factorySpecs.release.* (12, tylko en), Planning.*.list.pagination.* (9), npd.faProductionTab.* (11, brak ro/uk), npd.faRightPanel.totalYield, projectWizard output-unit (pl), technical.wip.process.yieldPct (pl), handoff revertToNpd + packaging supplier* (ro/uk). (lens 9)
- **E2E maskują regresje:** 21/21 npd-* skipuje bez PLAYWRIGHT_BASE_URL (0 asercji = zielono); kaskady skip(!projectId) w full-lifecycle/gate-flow; e-sign G3/G4 bezwarunkowo skipowane bez sekretu; runtime skip przy pustym seedzie. (lens 10)

---

# Lens 1 — RLS/org_id/multi-tenant

- [P2] packages/db/migrations/383-user-site-visibility-rls.sql:25,43 — app.user_can_see_site() fail-open dla current_user_id()=null i site_id=null: wiersze bez site_id na tabelach site-scoped (work_orders, purchase_orders, schedule_outputs...) widoczne dla każdego usera org-u niezależnie od przypisań site (org policy nadal AND-uje — nie cross-org). Fix: backfill site_id + usunięcie warunków (1)/(4) po oknie mig-382.
- [P2] apps/web/app/[locale]/(app)/(modules)/technical/items/_actions/upload-supplier-spec-doc.ts:141-153 — jedyne miejsce w 4 modułach z SUPABASE_SERVICE_ROLE_KEY w ścieżce akcji (Storage upload). Mitygowane (bucket org-namespaced, ownership zweryfikowany RLS-owo wcześniej). Fix: wydzielić do storage-helpera.
- [P2] Zero użyć withSiteContext w akcjach 4 modułów — site-scope w 100% na RLS mig-383 + triggerach mig-379/380. Fix: konwencja withSiteContext dla write-akcji na tabelach z listy mig-383.
- Brak P0/P1: zero tenant_id/raw current_setting; migracje 204/234/423/428 czyste (org_id = app.current_org_id()); _actions bez withOrgContext to czyste funkcje bez DB.
- Nie pokryte: linia-po-linii ~60 dużych plików akcji (joiny bez org-filtra na non-RLS), RLS starszych tabel sprzed mig-200.

# Lens 2 — transaction safety

- [P1] planning/work-orders/_actions/releaseWorkOrder.ts:52-121 — walidacja PO zapisie: heal-UPDATE work_orders (backfill active_factory_spec_id/active_bom_header_id/uom_snapshot) commit-on-return utrwala się mimo return {ok:false} z gate'ów (pack_hierarchy_incomplete/factory_release_incomplete). Fix: throw domain error albo gate'y przed heal-UPDATE.
- [P1] (npd)/fg/[productCode]/allergens/_actions/accept-declaration.ts:155-158 — try/catch wewnątrz withOrgContext połyka błędy zamiast throw-to-rollback; błąd nie-PG po UPDATE product → flip deklaracji COMMITuje się, caller dostaje PERSISTENCE_FAILED (stan DB ≠ odpowiedź). Fix: catch wokół withOrgContext.
- [P1] technical/items/_actions/upload-supplier-spec-doc.ts:81-109 — storage upload wewnątrz tx + catch {return ok:false} połyka błąd UPDATE; kompensacja delete tylko dla gałęzi 0-row → osierocony plik w storage. Fix: upload po tx / kompensacja też w catch + rethrow.
- [P2] SYSTEMOWE: revalidatePath/revalidateLocalized wewnątrz callbacka withOrgContext = przed COMMIT — 40+ miejsc (save-scenario.ts:137, accept-declaration.ts:146-151, technical/bom/workflow.ts:117,164, update-item.ts:150, create-routing.ts:153, finish-wip.ts:193,244,293...). Render może czytać stan sprzed commitu; commit-fail = inwalidacja mimo braku zmiany. Fix: revalidate za withOrgContext, tylko na sukcesie.
- Pozytywy: savepoint-fenced retry 23505 (line-actions.ts:138-176, purchase-orders/actions.ts:567-602), create-item savepoint, TO header+lines w 1 tx, save-scenario ON CONFLICT.
- Nie pokryte: ~80 hitów 0-row-guard ręcznie, register-output.ts w głąb, systematyczny audyt check-then-insert.

# Lens 3 — pieniądze/NUMERIC/UoM

- [P0] lib/finance/book-receipt-wac.ts:86-96 vs upsert-wac.ts:522-551 — asymetria walutowa WAC: przyjęcie PO księguje do puli w walucie PO, ale WSZYSTKIE debety zużycia/outputu idą do puli GBP (default WAC_VALUATION_CURRENCY_CODE, upsert-wac.ts:32; consume-material-actions.ts:679-690, register-output.ts:849-856 bez currencyCode). PO w EUR → pula EUR nigdy nie schodzi, konsumpcja debetuje GBP z avg_cost=0 → wycena 0. Fix: waluta bazowa org + FX przy przyjęciu, albo waluta spójnie przez cały cykl.
- [P1] book-receipt-wac.ts:155-158 — cichy fallback do GBP dla brakującej/niepoprawnej waluty PO. Fix: throw unknown_currency.
- [P1] upsert-wac.ts:332-339,379-386 — storna (consumption reversal, shipment cancel credit) bez currencyCode → zawsze pula GBP niezależnie od waluty oryginalnego debetu. Fix: wac_currency_code w snapshocie.
- [P1] lib/production/output/register-output.ts:918 — kg do WAC liczone floatem: toBaseQty(...Number(qtyUnits)...).toFixed(3) w JS double. Fix: konwersja pack→kg w SQL ::numeric (jak resolveWacDeltaQtyKg).
- [P1] lib/finance/resolve-output-wac.ts:54-67 — fallback material_costed: linie w niekonwertowalnym UoM wypadają z SUM bez markera → koszt WO/FG cichaczem zaniżony (ścieżka przyjęć w tej samej sytuacji twardo blokuje). Fix: excluded:'un_costed'.
- [P2] lib/npd/wip-cost.ts:13-19,32 — koszty WIP w JS float, równolegle do kanonicznego Dec (compute-waterfall.ts:356-367) — rozbieżne wyniki. Fix: przepiąć na Dec.
- [P2] lib/production/wo-material-scalar.ts:19-27 — skalar per_box w JS float. Fix: SQL ::numeric / Dec.
- [P2] upsert-wac.ts:194-206 vs lib/uom/piece.ts:7-14 — resolveWacDeltaQtyKg zna tylko each/box/kg, a kanoniczny kod sztuk to 'pcs' → linia PO w pcs zawsze unresolved_uom, przyjęcie blokowane mimo pack-metadanych. Fix: mapować pcs/szt/ea → each.
- [P2] packages/db/schema/cost-history.ts:23 — cost_per_kg NUMERIC(10,4) vs items/finance (18,6) → obcięcie 2 dp + możliwy overflow. Fix: wyrównać do (18,6).
- Czyste: compute-waterfall na Dec; upsert-wac arytmetyka w SQL numeric + for update; przyjęcia PO qty×price w SQL numeric.
- Nie pokryte: lib/technical, lib/planning w głąb, register-disassembly-output, catch-weight-variance, semantyka Dec.

# Lens 4 — canonical owners

- [P1] quality/_actions/hold-actions.ts:337-344,839-847 — 09-quality pisze bezpośrednio do wo_outputs (owner: 08-production); qa_status ma dwóch niezależnych mutatorów (drugi: production/_actions/output-qa-actions.ts:89). Fix: serwis w lib/production/ albo event quality.hold.*.
- [P1] (npd)/pipeline/[projectId]/handoff/_actions/update-bom-yield.ts:56-63 — NPD mutuje in-place ACTIVE bom_headers (yield_pct) bez nowej wersji/Technical approval; gate tylko npd.handoff.promote. Fix: ograniczyć do headera z tej samej sesji promote albo new-version + technical approve.
- [P1] (npd)/pipeline/_actions/_lib/materialize-npd-bom.ts:891-899 — NPD aktywuje bom_header bez warunku statusu, self-approve (approved_by = user NPD), omija maszynę draft→in_review→technical_approved→active (workflow.ts:100-103, bom-publish-service.ts:120-124); ścieżka WIP :1343-1347 guard MA. Fix: precondition `and status='draft'` + bom-publish-service.
- [P2] planning/work-orders/_actions/resolve-stage-production-line.ts:57,67,79,91 + chain-preview.ts:144 + capacity-block-actions.ts:77 — planning czyta wewnętrzne tabele NPD (npd_wip_processes, npd_projects); read-model npd.fg.released NIE istnieje w repo (0 trafień). Fix: widok/read-model released-FG.
- [P2] hold-actions.ts:839-847 — release holda resetuje qa_status blanket na PENDING dla wszystkich outputów WO, także wcześniej PASSED/FAILED (utrata stanu; ścieżka LP ma qaStatusFrom/qaStatusTo). Fix: snapshot per-output i przywracanie.
- Czyste: schedule_outputs tylko planning; oee_snapshots tylko oee-snapshot-producer.ts; wo_outputs insert tylko production; zero zapisów przez widok fa; built auto-reset + trigger; technical line-actions gate'uje draft|in_review.
- Nie pokryte: eco-apply-service, factory-release-persistence, release-bundle-service; triggery DB.

# Lens 5 — RBAC/e-sign

- [P1] planning/purchase-orders/_actions/actions.ts:456,476,552,628,696,796,876 — cały CRUD PO (create/update/lines/reopen/transitionStatus) bez żadnego permission checku (0 importów hasPermission/requirePermission).
- [P1] planning/transfer-orders/_actions/actions.ts — mutacje TO (create/lines/status/receive_reversed) bez checku.
- [P1] planning/suppliers/_actions/actions.ts — create/update/status_change dostawców bez checku.
- [P1] planning/purchase-orders/_actions/import-po.ts + transfer-orders/_actions/import-to.ts — bulk-import bez checku.
- [P1] KLASA SYSTEMOWA: w seedach migracji NIE istnieje żaden string planning.po.* / planning.to.* / planning.supplier.* (tylko planning.forecast.manage, planning.mrp.run, planning.mrp.convert) → powierzchnia zakupów/transferów/dostawców jest "allow-everywhere" dla każdego członka orga. Fix: migracja seed + checki.
- [P2] lib/rbac/enforced-permissions.ts:117-120 — udokumentowany split UI settings.users.create vs server settings.users.invite (poza 4 modułami).
- [P2] technical/cost/_actions/write-cost-ledger.ts — mutujący helper bez własnego checku (callerzy gate'ują); defense-in-depth assert.
- Czyste: 65/65 checkowanych stringów npd/production/planning/technical seedowane (spot-check 149/236/347/296/444); G3/G4 approve = requireActionPermission + signEvent z verifyPin server-side (nie flaga z klienta); changeover dual-sign OK; CCP deviation OK.
- Nie pokryte: LOTO, calibration/POD (poza zakresem katalogów), bcrypt w verify-pin, systematyczny UI-scan disabled/enabled.

# Lens 6 — lifecycle/maszyny stanów

- [P1] (npd)/pipeline/_actions/approve-project-gate.ts:86-91,143-153,203-207 — approve G3 skacze do 'approval' z DOWOLNEGO stage'a G3 (omija assertAdjacentStage); blockery liczone dla nextStage(current) zamiast faktycznego targetu 'approval'; komentarz twierdzi "no longer auto-advances", kod robi updateProjectStage. Fix: blockery dla approvalTargetStage + adjacency (albo nie przesuwać stage'a).
- [P1] formulation/_actions/submit-for-trial.ts:82 + lock-version.ts:50,58 — lifecycle formulacji odwrócony: submitForTrial wymaga state==='locked' i NIGDY nie zapisuje 'submitted_for_trial' (żaden plik nie robi tego UPDATE; e2e spec oczekuje stanu niezapisywanego). Gałąź submitted_for_trial w lock-version = dead code. Fix: zapisać stan w submitForTrial albo zaktualizować model/spec.
- [P2] lock-version.ts:47-92 — draft→locked bez walidacji totalPct [99.99,100.01] i bez min. 1 składnika, a od razu kaskaduje recipe_components do product — receptura 50% lockowalna i propagowana na FG. Fix: gate totalPct w lockVersion przed kaskadą.
- [P2] unlock-version.ts:61-98 — unlock locked→draft nie sprawdza trial_batches; recepturę po trialu można odblokować i edytować bez inwalidacji triala. Fix: potwierdzenie + oznaczenie trial_batches stale.
- [P2] lib/production/complete-cancel-wo.ts:351-365,381 — race w cancelWo: previousStatus czytany SELECT-em bez FOR UPDATE przed applyTransition → równoległy completeWo może spowodować cancel completed→cancelled Z POMINIĘCIEM void LP + rewersu WAC (CAS chroni przejście, nie wybór gałęzi). Fix: FOR UPDATE / decyzja z from_status przejścia.
- [P2] lib/technical/bom-publish-service.ts:75,108-128 — publish bez FOR UPDATE na headerze: dwa równoległe publish'e → drugi commit wybucha surowym 23505 (DB backstop: unique partial index mig 090) zamiast {ok:false,'conflict'}. Fix: FOR UPDATE + mapowanie 23505.
- Czyste: WO state machine (CAS version, idempotencja R14, complete wymaga output>0/override z taksonomią); V18 built-blocker przetrwał cut do widoku (mig 359:394-418, INSTEAD-OF trigger, built_reset raportowany); G3/G4 e-sign wymaga gate_approvals z esigned_at+esign_hash; factory-spec recall z guardem WHERE status='released_to_factory'.
- Nie pokryte: revert-gate/revert-npd-gate, eco-apply-service, release-bundle-service (clone-on-write), factory-release-wo-gate, reset built przy edycji prod_detail wprost.

# Lens 7 — integralność list/N+1

- [P0] planning/purchase-orders/_components/po-list-view.tsx:251-263 — szukajka/taby/filtr dostawcy client-side na 50-wierszowym slice; page.tsx:252 woła listPurchaseOrders({page,archived}) bez search/status, mimo że SQL akcji wspiera ilike (actions.ts:366). PO ze str. 2+ nie do znalezienia. Fix: searchParams → akcja (SQL gotowy).
- [P0] po-list-view.tsx:235-249 — liczniki tabów statusów z bieżącej strony (50) → złe totale przy >50 PO. Fix: count(*) group by status w tym samym WHERE.
- [P0] planning/work-orders/page.tsx:251 — listPlanningWorkOrders({page,archived}) nie przekazuje status/search mimo gotowego WO_LIST_WHERE ($1 status, $2 ilike). Filtr po slice.
- [P0] planning/transfer-orders/page.tsx:221 — ten sam wzorzec (searchParams typ tylko {new,archived,page}).
- [P1] production/_actions/list-work-orders.ts:227 — hard-cap limit 200 bez offsetu/paginacji; WO >200 nieosiągalne z UI.
- [P1] production/wos/_components/wo-list-screen.tsx:180-182 — szukajka/taby client-side na 200-slice.
- [P1] technical/items/page.tsx:85 — listItems() cap 200 (DEFAULT=MAX=200), banner truncated ale zero pagera, akcja bez parametru search → itemy >200 niewidoczne i nieszukiwalne. Też technical/materials/page.tsx:37.
- [P1] technical/items items-table.client.tsx — taby/filtry/szukajka client-side na obciętych 200 → błędne liczniki. Fix: ?type= + count(*) group by item_type.
- [P2] list-work-orders.ts:122-145 vs :227 — statusCounts bez limitu vs lista limit 200 → rozjazd count vs osiągalne wiersze.
- [P2] hard-capy bez zweryfikowanego pagera: where-used limit 100, allergen overrides 500, wip-library 200, scheduler-labels 500, bom/history 200.
- Nie pokryte: scheduler board client-side, npd pipeline/products/formulations listy, suppliers/eco/routings, głębszy N+1 (grep czysty — lateral joiny).

# Lens 8 — dryf schematu (phantom columns)

- BRAK potwierdzonych findings. Checker 66 plików raw-SQL (INSERT/UPDATE/ON CONFLICT/alias-refy/tabele w FROM) vs mapa z 443 migracji — 108 kandydatów, wszystkie fałszywe (bom_headers.item_id → mig 362; npd_wip_processes.setup_cost → 429; items.each_per_box → 267; product.weight/price_brief/packs_per_case → 238; missing_required_cols → widok 106; CTE nie tabele).
- Uwaga jakościowa: get-formulation.ts:262-264 + recompute.ts świadomie degradują na 42P01 (mig 107 nieobecna).
- Nie pokryte: kolumny WIDOKÓW (v_item_effective_cost, missing_required_cols — tylko istnienie), niekwalifikowane kolumny w multi-table SELECT, unikalność constraintów pod ON CONFLICT.

# Lens 9 — RSC/i18n/'use server'

- [P1] technical/factory-specs/_components/release-spec.client.tsx:18 — 12 kluczy Technical.factorySpecs.release.* (+cloneNewVersion) tylko w en.json, brak pl/ro/uk.
- [P1] planning/{work,purchase,transfer}-orders/page.tsx — Planning.*.list.pagination.* (9 kluczy: showing/previous/next ×3 listy) brak w pl/ro/uk.
- [P1] (npd)/fg/[productCode]/_components/fa-production-tab.tsx — 11 kluczy npd.faProductionTab.* brak w ro/uk.
- [P1] fa-right-panel.tsx:338 — npd.faRightPanel.totalYield brak we wszystkich pl/ro/uk.
- [P1] create-project-wizard — npd.projectWizard.fieldOutputUnit* (4) + errorBoxesOutputUnit brak w pl; npd.briefStage.errOutputUnitBoxesPackFactors brak też w ro/uk.
- [P1] technical/wip-library/_components/wip-labels.ts:299 — technical.wip.process.yieldPct brak w pl (jest en/ro/uk).
- [P1] handoff-screen.tsx — npd.handoff.revertToNpd + npd.packaging.supplierPlaceholder/supplierLegacyHint brak w ro/uk.
- [P2] Planning.workOrders.create.chainCreatedWarning brak ro/uk (ma fallback opt() — tylko EN tekst).
- [P2] messages/*/02-settings.json.bak zacommitowane w 4 locale (hygiene).
- [P2] production/_actions/consume-material-actions.ts — mutacje bez revalidate w akcji; ratuje router.refresh() w wo-detail-screen (klasa 2ed80... "stale count" dla nowych callerów). Fix: revalidatePath w akcji.
- [P2] upload-supplier-spec-doc.ts:51-106 — jw. mutacja bez revalidate (ratuje client refresh).
- Czyste: brak non-async exportów w 'use server' (helpery wydzielone); brak redirect() w _actions (klasa df62cf0 nie występuje).
- Nie pokryte: pełny audyt double-submit; inline 'use server' closures w production/wos/[id]/page.tsx:137-200.

# Lens 10 — testy, które kłamią

- [P0] apps/web/e2e/technical-i18n-pl-parity-evidence.spec.ts:102-150 — "parity evidence" nigdy nie renderuje aplikacji: własny http.createServer serwuje harnessHtml() zbudowany ze stringów z plików JSON → asercje trafiają w tekst, który test sam wstrzyknął (tautologia). Fix: gate na PLAYWRIGHT_BASE_URL i asercje na realnym /pl/technical.
- [P0] apps/web/e2e/technical-eco-parity-evidence.spec.ts:1-60 + technical-bom-row-actions-parity-evidence.spec.ts — "parity evidence" = screenshoty ręcznie napisanego statycznego HTML ("No app server / DB needed"); regresja realnego ekranu nigdy nie złamie tych speców. Fix: artefakty z tych 3 speców ≠ dowód parity; wymagać live capture (Gate-5).
- [P1] 21/21 e2e npd-* (+production-*, planning-*) skipuje bez PLAYWRIGHT_BASE_URL → playwright w CI "zielony" przy 0 asercjach na aplikacji. Fix: skip-count jako fail-gate w CI.
- [P1] npd-to-production-chain-overlap.spec.ts:188-190 — runtime test.skip(true) gdy seed pusty → zepsuty seeding = cichy zielony skip. Fix: expect(count)>0 albo seed-in-test.
- [P1] npd-full-lifecycle.spec.ts:384,404,418,517,558,693,777 (+ npd-project-gate-flow.spec.ts:250,303,339,412) — kaskada skip(!projectId): fail kroku 1 → kroki 2-N zielono skipują. Fix: test.describe.serial().
- [P1] npd-full-lifecycle.spec.ts:459,559 — e-sign G3/G4 bezwarunkowo skipowane bez PLAYWRIGHT_ADMIN_PASSWORD → ścieżka e-sign nigdzie nie wykonywana. Fix: osobny tagowany spec @requires-esign, śledzić jako brak pokrycia.
- [P2] ~10 suit integracyjnych NPD+Production `const run = databaseUrl ? describe : describe.skip` (dashboard-actions.test.ts:17, release-npd-project-to-factory:13, lifecycle:12, recompute:21, evaluate:7, compute:9, wo-lifecycle:32, output-waste:39, output-lp-genealogy:36, holds-guard:121) — bez DATABASE_URL zielone przy zerowym pokryciu. Fix: CI job z Postgresem + fail na skipped.
- [P2] planning/__tests__/dashboard.test.tsx:70-178 — "fallback parity evidence" = render na fixture-props, zero Supabase; jako jedyny dowód parity nie weryfikuje "real data". Fix: taski z samym RTL-fallbackiem = STUB do czasu live capture.
- Czyste: brak mock-tablic w kodzie produkcyjnym 4 modułów; toHaveLength liczą fixture'y in-test (nie klasa a93a43d); brak expect-w-catch/floating asercji.
- Nie pokryte: linia-po-linii RTL testów production/wos + components/npd pod vi.mock-tautologie; realny run vitest/playwright dla skip-countów.

---

## Luki pokrycia (do domknięcia w następnej fali)
- eco-apply-service / release-bundle-service / factory-release-persistence (clone-on-write released spec) — nie doczytane przez 2 soczewki.
- Kolumny WIDOKÓW + unikalność constraintów pod ON CONFLICT (lens 8 sprawdzał tylko tabele).
- LOTO / calibration / POD e-sign (poza katalogami 4 modułów).
- revert-gate / revert-npd-gate; edycja prod_detail wprost (reset built).
- lib/technical + lib/planning w głąb (pieniądze), register-disassembly-output, catch-weight-variance.
- Live-klik (Gate-5) — niewykonalny z tego środowiska (proxy blokuje vercel.app i supabase.co); do zrobienia z maszyny z dostępem.

## Proponowane fale naprawcze
1. **F1 (P0+bezpieczeństwo):** waluty WAC end-to-end; RBAC seed+checki planning.po/to/supplier; server-side filtry PO/WO/TO.
2. **F2 (integralność):** NPD→BOM przez bom-publish-service; heal-write w releaseWorkOrder; G3 approve target; hold release per-output snapshot; formulation lifecycle.
3. **F3 (jakość/testy):** wymiana 3 tautologicznych parity-speców na live capture; skip-count fail-gate w CI; paczka i18n; paginacja production/technical.

# NPD — Nowy Rozwój Produktu (Brief → Stage-Gate → wdrożenie FG) — przewodnik po module

> Szczegółowy przewodnik dla modułu. Każde twierdzenie poniżej jest zakotwiczone
> w rzeczywistym pliku pod `apps/web/…` lub `packages/…`; nic nie zostało
> wymyślone. Moduł żyje w **jednej grupie tras** — ekrany desktopowe **NPD**
> w grupie tras `(npd)` — ale w **dwóch fizycznych drzewach**: **aktywne strony**
> to `apps/web/app/[locale]/(app)/(npd)/**/page.tsx`, a importują akcje serwera
> z nielokalizowanego **drzewa akcji** `apps/web/app/(npd)/**/_actions/**`
> (rdzeń pipeline/gate/formulation/FA/builder) oraz lokalnych `_actions` obok
> stron (brief, trial, pilot, sensory, packaging, costing, handoff). Grupa tras
> `(npd)` **nie dodaje segmentu ścieżki**, więc trasy widoczne dla użytkownika to
> `/pipeline`, `/formulations`, `/allergen-cascade`, `/npd` (Panel FG) oraz `/fa`
> (Wyroby Gotowe) — zob. `lib/navigation/npd-nav.ts`.
>
> 01-npd **jest właścicielem** cyklu życia wdrożenia produktu od **Brief → projekt
> NPD (`NPD-NNN`) → Stage-Gate G0–G4 → kandydat FG → *wstępne* wspólne BOM /
> specyfikacja fabryczna → Wdrożony**. Zapisuje do `npd_projects`,
> `gate_checklist_items`, `gate_approvals`, `formulations*`,
> głównej tabeli widoku `product`/`fa`, `prod_detail`, `risks`,
> `compliance_docs`, tabel etapów (trial / pilot / sensory / packaging / costing)
> oraz `factory_release_status` / `npd_legacy_closeout`. Jest **producentem**
> modelu odczytu zwolnienia fabrycznego (`fg.released_to_factory`,
> `npd.project.legacy_stages_closed`), który konsumują moduły Techniczny /
> Planowanie / Produkcja. Po zwolnieniu bieżąca poprawność specyfikacji
> fabrycznej / BOM należy do **03-Technical** (przejęcie SSOT dla BOM), nie NPD.
>
> **Terminologia:** `FG`/Wyrób Gotowy to kanoniczna nazwa widoczna dla
> użytkownika; `FA` (Factory Article) to **wyłącznie alias zgodności wstecznej**
> — pola DB, segmenty tras (`/fa`), kody seed i prefiksy zdarzeń (`fa.*`) nadal
> go używają, ale fizyczna tabela to `public.product`, a `public.fa` to
> widok SQL tylko do odczytu nad nią (`MON-domain-npd` SKILL).
>
> Trasy zapisane są bez prefiksu `[locale]`. Ostatnia weryfikacja względem
> niezatwierdzonego drzewa roboczego (pivot stage-native z 2026-06-06, mig 242/243
> brief-merge, fala W11 reversibility).

---

## a. Przegląd ogólny

Moduł NPD przekształca pomysł w gotowy do sprzedaży, zwolniony fabrycznie Wyrób
Gotowy. Deweloper tworzy **projekt** przez kreator tworzenia (samodzielny ekran
Brief został włączony do tworzenia projektu i jego szczegółów —
`npd-nav.ts:19-21`), po czym projekt przechodzi **8-etapowy potok operacyjny**
— `brief → recipe → packaging → trial → sensory → pilot → approval → handoff` —
aż do terminalnego etapu `launched`. Każdy etap **wyznacza** Stage-Gate (G0–G4);
etap jest krokiem autorytarnym prowadzonym przez użytkownika, a gate jest z niego
wyliczany (`gate-helpers.ts:22-100`). W trakcie deweloper edytuje **formulację**
(wersjonowaną `draft → submitted_for_trial → locked`), oblicza **wartości
odżywcze** i **koszty**, przeprowadza partie **trial** i **pilot**, wypełnia
**69-kolumnową Główną Tabelę FG** w 7 działach, śledzi **ryzyka** (z blokadą
budowania dla ryzyk wysokich V18) i **dokumenty zgodności**, oraz zbiera dwa
**podpisy elektroniczne CFR-21** (na G3 i G4). Wejście do etapu `packaging`
tworzy **kandydata FG** (wiersz `public.product` + kod produktu); przejście
`handoff` → `launched` materializuje **wstępne wspólne BOM + specyfikację
fabryczną** i **promuje FG do produkcji** przez wspólny przepływ zwolnienia
fabrycznego.

Cykl życia jest odwracalny jedynie w wąskich, audytowanych przypadkach: wersja
robocza formulacji jest edytowalna do momentu zgłoszenia; operator z uprawnieniem
`npd.gate.advance` może cofnąć jeden sąsiedni gate przez podpis PIN
(`revert-npd-gate.ts`); sekcja działu może
być ponownie otwarta (`reopen-dept-section.ts`); ryzyko może powrócić ze stanu
`Closed → Open`. **Nie istnieje** cofnięcie ze stanu Launched ani „odrzucenie"
podpisanego elektronicznie gate'u, które cofałoby etap (zob. *Znane luki*).

Akcje pipeline/gate/formulation/FA/builder znajdują się w
`apps/web/app/(npd)/{pipeline,fa,builder,dashboard}/**/_actions/**`; lokalne
akcje etapów (brief/trial/pilot/sensory/packaging/costing/handoff) są obok
swoich stron pod
`apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/**/_actions/**`.
Silnik automatu stanów to `pipeline/_actions/_lib/gate-helpers.ts`; silnik
zwolnienia fabrycznego to
`builder/_actions/release-npd-project-to-factory.ts` +
`builder/_lib/release-preflight.ts` +
`pipeline/_actions/_lib/materialize-npd-bom.ts`.

---

## b. Inwentarz funkcji

> Odczyty/zapisy wskazują dotykane tabele Postgres. „Gate" to uprawnienie
> sprawdzane po stronie serwera **wewnątrz** akcji (brak uprawnienia zwraca
> typowany `{ ok:false, error:'FORBIDDEN' }` / `'forbidden'`, nigdy błąd 500).
> Każda akcja działa wewnątrz `withOrgContext` (RLS przez
> `app.current_org_id()`). Uprawnienie weryfikuje współdzielony helper
> `hasPermission`, który sprawdza **zarówno** `role_permissions`, jak i legacy
> `roles.permissions` jsonb (`pipeline/_actions/shared.ts:28-44`).

### Cykl życia projektu — `pipeline/_actions/*`

| Akcja (plik) | Co robi | Odczytuje / zapisuje | Gate | Odwrócenie / korekta |
|---|---|---|---|---|
| `listProjects({status?,search?,…})` (`list-projects.ts`) | Lista potoku: projekty + postęp listy kontrolnej na projekt + kod ostrzeżenia o zamknięciu wdrożenia. | reads `npd_projects`, `gate_checklist_items`, `npd_legacy_closeout` | `npd.project.view` | — (odczyt) |
| `getProject({projectId})` (`get-project.ts`) | Nagłówek szczegółów projektu + wyliczony etap/gate + flagi możliwości (canAdvance/canCreate). | reads `npd_projects`, `gate_checklist_items` | `npd.project.view` (+ sonduje `npd.gate.advance`, `npd.project.create` dla flag UI) | — (odczyt) |
| `createProject(input)` (`create-project.ts`) | Wstawia projekt na `stage='brief', gate='G0'`; przydziela per-org kod `NPD-NNN`; wbudowuje pola briefu (format opakowania/waga, kanał, twierdzenia…); zaszczepia listę kontrolną gate'u z `GateChecklistTemplates`. Emituje `npd.project.created`. | writes `npd_projects`, `gate_checklist_items`, `outbox_events`; reads `org_sequences`, `"Reference"."GateChecklistTemplates"` | `npd.project.create` | `deleteProject` (brak zależności) |
| `cloneProject({ sourceProjectId, …overrides })` (`clone-project.ts`) | **#3/#4 (2026-06-25):** tworzy nowy projekt `brief`/`G0` na bazie istniejącego — kopiuje nagłówek + listę kontrolną gate'u, nakłada nadpisania briefu z kreatora, nowy `NPD-NNN`. Zasila kafelek **Sklonuj istniejący projekt** w kreatorze oraz przycisk **Duplikuj** w nagłówku projektu. | writes `npd_projects`, `gate_checklist_items`, `outbox_events`; reads źródłowy `npd_projects` | `npd.project.create` | `deleteProject` (brak zależności) |
| `deleteProject({projectId})` (`delete-project.ts`) | Trwale usuwa projekt bez zależności (`HAS_DEPENDENTS` przy naruszeniu FK). Emituje `npd.project.deleted`. | deletes `npd_projects`; writes `outbox_events` | `npd.project.create` | — (terminalne) |
| `advanceProjectGate({projectId,targetStage,productCode?})` (`advance-project-gate.ts`) | **Główny mechanizm przesuwania do przodu.** Przesuwa dokładnie JEDEN sąsiadujący etap (`assertAdjacentStage`). Efekty uboczne powiązane z wchodzonym etapem: wejście `packaging` → `createFgCandidate`; `approval→handoff` → weryfikacja ważnego podpisu G4 + zaszczepienie listy kontrolnej handoff; wejście `launched` → `closeOutLegacyStagesForLaunch`. Emituje `npd.gate.advanced`. | writes `npd_projects`, `product`, `formulations`, `handoff_checklists*`, `npd_legacy_closeout`, `outbox_events` | `npd.gate.advance` | `revertNpdGate` (sąsiedni gate, podpis PIN) |
| `approveProjectGate({projectId,gateCode:G3\|G4,decision,notes,password?})` (`approve-project-gate.ts`) | Rejestruje **punkt kontrolny zatwierdzenia** gate'u. Zatwierdzenie = **podpis elektroniczny CFR-21** (`signEvent` intent `npd.gate.approved`) → `gate_approvals` z `esigned_at`+`esign_hash`. Odrzucenie = tylko powód, bez hasła, bez podpisu. **Nie przesuwa automatycznie** (przesunięcie to osobny krok). Emituje `npd.gate.approved`. | writes `gate_approvals`, `e_sign_log` (zatwierdzenie), `outbox_events` | `npd.gate.approve` | — (zarejestrowany punkt kontrolny; odrzucenie to osobny rekord) |
| `createOrMapFgCandidateAtG3({projectId,mode:create\|map,productCode?})` (`create-or-map-fg-candidate-at-g3.ts`) | Jawnie tworzy lub mapuje kandydata FG podczas G2/G3 (ta sama `createFgCandidate`, którą wyzwala przesunięcie do etapu packaging). | writes `product`, `npd_projects`, `formulations`, `outbox_events` (`fg.created`, `npd.fg_candidate_mapped`) | `npd.gate.advance` | — |
| `revertNpdGate({projectId,reason,pin})` (`revert-npd-gate.ts`) | **Cofnięcie sąsiedniego gate'u** o jeden krok wstecz przez podpis PIN CFR-21 (`npd.gate.reverted`). Zablokowane, gdy ustawiono `npd_locked_for_release_at` (`NPD_RELEASE_LOCKED`). Jedyna ścieżka w dół. | writes `npd_projects`, `e_sign_log`, `outbox_events` | `npd.gate.advance` | To **jest** odwróceniem `advance` o jeden gate; nie można cofnąć przez Launched |
| `closeOutLegacyStages({projectId})` (`close-out-legacy-stages.ts`) | Samodzielne terminalne zamknięcie (wywoływane też wewnętrznie przez przesunięcie `handoff→launched`). Weryfikuje pełny zestaw dowodów wdrożenia (status zwolnienia, podpis G4, termin przydatności, przeliczenie alergenów, dowód próby pilotażowej, aktywne BOM, pakowanie MRP), następnie zapisuje `npd_legacy_closeout` i ustawia `stage='launched'` (gate wyznacza `Launched`). Emituje `npd.project.legacy_stages_closed`. | writes `npd_legacy_closeout`, `npd_projects`, `outbox_events`; reads `factory_release_status`, `product`, `gate_approvals`, `bom_headers`, `pilot_runs`, `allergen_cascade_rebuild_jobs` | `npd.gate.advance` | — (terminalne — **brak cofnięcia wdrożenia**) |
| `bulkAssignOwner / bulkSetPriority / bulkMoveGate(rows)` (`bulk-update-projects.ts`) | Masowe operacje na potoku. `bulkMoveGate` tłumaczy docelowy gate na per-projekt wywołania `advanceProjectGate` o jeden etap (wynik częściowego sukcesu z błędami per wiersz). | writes `npd_projects`, `audit_events` (+ zapisy przesunięcia) | `npd.core.write` | cofnięcie per wiersz |
| `toggleGateChecklistItem({itemId,checked})` (`toggle-gate-checklist-item.ts`) | Zaznaczenie / odznaczenie zaszczepionego elementu listy kontrolnej gate'u (tylko orientacyjny postęp — **nie blokuje** twardego przesunięcia). | writes `gate_checklist_items`, `audit_events` | `npd.core.write` | ponowne przełączenie |

### Edytor formulacji — `pipeline/[projectId]/formulation/_actions/*`

| Akcja | Co robi | Odczytuje / zapisuje | Gate | Odwrócenie / korekta |
|---|---|---|---|---|
| `getFormulation({projectId})` (`get-formulation.ts`) | Aktualna formulacja + wersja + wiersze składników do edytora. | reads `formulations`, `formulation_versions`, `formulation_ingredients` | (odczyt; zakres RLS) | — (odczyt) |
| `createFormulationDraft({projectId})` (`create-draft.ts`) | Tworzy formulację (lub nową wersję roboczą) → `formulation_versions(state='draft')`, ustawia `current_version_id`. | writes `formulations`, `formulation_versions` | `npd.formulation.create_draft` | (wersja robocza jest edytowalna) |
| `saveDraft({projectId,versionId,ingredients[]})` (`save-draft.ts`) | Zastępuje wiersze składników wersji roboczej (usuń-wszystko + wstaw-ponownie), przelicza sumy. **Tylko wersja robocza** (`VERSION_LOCKED`/`VERSION_NOT_DRAFT`). | writes `formulation_ingredients`, `formulation_audit_log` | `npd.formulation.create_draft` | edytuj ponownie (wersja robocza) |
| `recomputeAndCache(input)` (`recompute.ts`) | Przelicza sumy / koszt / pokrycie wartości odżywczych dla wersji i buforuje wynik. | reads/writes `formulation_versions` | (odczyt-ish; zakres RLS) | — |
| `compareVersions(input)` (`compare-versions.ts`) | Porównuje dwie wersje formulacji (delty składników). | reads `formulation_versions`, `formulation_ingredients` | (odczyt; zakres RLS) | — (odczyt) |
| `submitForTrial({projectId,versionId})` (`submit-for-trial.ts`) | `draft → submitted_for_trial`. Zablokowane przez: `totalPct ∈ [99.99,100.01]` (`TOTAL_PCT_OUT_OF_RANGE`), każdy RM z kosztem (`MISSING_COST`), cele wartości odżywczych obecne (`MISSING_NUTRITION_TARGET`). Emituje zdarzenie outbox `formulation.*`. | writes `formulation_versions`, `formulation_audit_log`, `outbox_events` | `npd.recipe.submit_for_trial` | `lockVersion` do przodu; nowy draft do poprawki |
| `lockVersion({projectId,versionId})` (`lock-version.ts`) | `submitted_for_trial → locked`; stempluje `locked_at/by`; kaskadowo wyznacza `recipe_components`/`ingredient_codes` produktu z zablokowanych składników. Emituje `formulation.locked`. | writes `formulation_versions`, `formulations`, `product`, `formulation_audit_log`, `outbox_events` | `npd.formulation.lock` | — (terminalna wersja; utwórz nowy draft, żeby zmienić) |

### Wartości odżywcze / koszty / zatwierdzenie — etapowe `_actions`

| Akcja | Co robi | Odczytuje / zapisuje | Gate | Odwrócenie |
|---|---|---|---|---|
| `computeNutrition(input)` (`pipeline/[projectId]/nutrition/_actions/compute.ts`) | Oblicza profil odżywczy + Nutri-Score z formulacji; nadpisuje zestaw alergenów odżywczych. | writes `nutrition_profiles`, `nutrition_allergens`, `nutri_score_results` | (zakres RLS) | przelicz ponownie |
| `computeCosting / computeAndSaveInitialBreakdown(input)` (`pipeline/[projectId]/costing/_actions/compute.ts`) | Oblicza waterfall kosztów / marżę; `margin_hard_fail` blokuje scenariusz poniżej minimalnej marży; `fg_not_mapped` do czasu istnienia kandydata FG. | writes `costing_breakdowns`, `costing_waterfall_steps` | (zakres RLS) | przelicz ponownie / nowy scenariusz |
| `saveCostingScenario(input)` (`pipeline/[projectId]/costing/_actions/save-scenario.ts`) | Zapisuje nazwany scenariusz kosztowy (ta sama minimalna marża). | writes `costing_breakdowns` | (zakres RLS) | zapisz ponownie |
| `evaluateApprovalCriteria(input)` (`pipeline/[projectId]/approval/_actions/evaluate.ts`) | Ocenia kryteria gotowości zatwierdzenia G4 dla produktu (model odczytu renderowany na ekranie zatwierdzania). | reads `product` + powiązane | (zakres RLS) | — (odczyt) |

### Trial / pilot / sensory / packaging — etapowe `_actions`

| Akcja | Co robi | Odczytuje / zapisuje | Gate | Odwrócenie |
|---|---|---|---|---|
| `logTrialBatch / updateTrialBatch / listTrialBatches(input)` (`pipeline/[projectId]/trial/_actions/*`) | Rejestruje / zmienia / listuje wyniki partii próbnych dla etapu trial. | writes `trial_batches`, `audit_log` | `npd.trial.write` (zapisy) | edytuj ponownie |
| `upsertPilotRun / upsertPilotMaterial / togglePilotChecklistItem / getPilotRun(input)` (`pipeline/[projectId]/pilot/_actions/*`) | Planuje/rejestruje próbę pilotażową (dowód pilota przy wdrożeniu), jej wiersze materiałów i listę kontrolną. Ukończona (`completed`) próba pilotażowa to dowód szukany przez procedurę zamknięcia. | writes `pilot_runs`, `pilot_run_materials`, `pilot_run_checklist_items`, `audit_events` | `npd.pilot.write` (zapisy) | edytuj ponownie |
| `getSensoryPanel(projectId)` (`pipeline/[projectId]/sensory/_actions/getSensoryPanel.ts`) | Odczytuje panel sensoryczny (schemat sensoryczny jest **własnością Technicznego** wg granicy domenowej; NPD odczytuje go na potrzeby bramkowania). | reads sensory tables | `npd.sensory.read` (odczyt) | — (odczyt) |
| `listPackagingComponents / upsertPackagingComponent / deletePackagingComponent(input)` (`pipeline/[projectId]/packaging/_actions/*`) | CRUD specyfikacji komponentów opakowań (folia/tacka/rolka/etykiety…) dla etapu packaging. | writes `packaging_components` | `npd.packaging.write` (zapisy) / `npd.packaging.read` | upsert / usuń |
| `uploadArtworkVersion / listArtworkVersions / deleteArtworkVersion(formData)` (`pipeline/[projectId]/packaging/_actions/*`) | Zarządza wersjami pliku graficznego opakowania (Supabase storage + tabela). | writes artwork-version table + storage | `npd.packaging.write` | usuń wersję |

### Brief / handoff — etapowe `_actions`

| Akcja | Co robi | Odczytuje / zapisuje | Gate | Odwrócenie |
|---|---|---|---|---|
| `readProjectBrief / updateProjectBrief(input)` (`pipeline/[projectId]/brief/_actions/*`) | Odczytuje / zmienia wbudowane pola briefu projektu (samodzielna tabela Brief usunięta w mig 243 — brief mieszka teraz w `npd_projects`). | reads/writes `npd_projects`, `audit_events` | `npd.core.write` (zapis) | edytuj ponownie |
| `uploadBriefAttachment / listBriefAttachments / deleteBriefAttachment(input)` (`pipeline/[projectId]/brief/_actions/*`) | Zarządza załącznikami briefu (Supabase storage + tabela). | writes attachment table + storage | `npd.core.write` | usuń |
| `getHandoff({projectId})` (`pipeline/[projectId]/handoff/_actions/get-handoff.ts`) | Model odczytu ekranu handoff: lista kontrolna + elementy + status weryfikacji BOM. | reads `handoff_checklists`, `handoff_checklist_items` | `npd.handoff.read` | — (odczyt) |
| `probeReleaseGates(input)` (`pipeline/[projectId]/handoff/_actions/release-gate-status.ts`) | Nieblokujący GET statusu bramek zwolnienia (`G4_REQUIRED` / FG / aktywne BOM / specyfikacja fabryczna / V18) dla odznak ekranu handoff. | reads `npd_projects`, `bom_headers`, `bom_lines`, `factory_specs`, `risks` | (odczyt; zakres RLS) | — (odczyt) |
| `toggleHandoffChecklistItem({itemId,checked})` (`pipeline/[projectId]/handoff/_actions/toggle-handoff-checklist-item.ts`) | Zaznaczenie / odznaczenie elementu listy kontrolnej handoff (**kompletna** lista bramkuje promocję). | writes `handoff_checklist_items`, `audit_events` | `npd.handoff.read` | ponowne przełączenie |
| `promoteToProduction({projectId})` (`pipeline/[projectId]/handoff/_actions/promote-to-production.ts`) | **„Promuj do BOM produkcyjnego."** Wymaga KOMPLETNEJ listy kontrolnej handoff, następnie **ponownie używa** `releaseNpdProjectToFactory` (właściwe zwolnienie BOM/fabryczne) i rejestruje promocję (`bom_verification_status='promoted'`) + audyt. Uczciwie zwraca `release_blocked` gdy preflight nie powiedzie się. | writes `handoff_checklists`, `audit_events` (+ zapisy zwolnienia) | `npd.handoff.promote` (+ własne `npd.gate.approve` zwolnienia) | — (terminalna promocja) |

### Zwolnienie fabryczne / materializacja BOM — `builder/**`

| Akcja | Co robi | Odczytuje / zapisuje | Gate | Odwrócenie |
|---|---|---|---|---|
| `releaseNpdProjectToFactory(projectId)` (`builder/_actions/release-npd-project-to-factory.ts`) | **Zwolnienie T-096.** `materializeNpdBom` (tworzy wiersz FG w `items`, `bom_headers/bom_lines`, zatwierdzony `factory_specs`), uruchamia `runReleasePreflight` (G4, kandydat FG, aktywne wspólne BOM, dopasowanie specyfikacji fabrycznej, **blokada V18 wysokiego ryzyka**), następnie upsertuje `factory_release_status='released_to_factory'` + emituje `fg.released_to_factory`. Rewaliduje listy Technicznego. | writes `items`, `bom_headers`, `bom_lines`, `factory_specs`, `factory_release_status`, `formulations`, `product`, `outbox_events` | `npd.gate.approve` (`RELEASE_TO_FACTORY_PERMISSION`) | — (zwolnienie jest jednokierunkowe) |
| `upsert*/get* factory release status` (`builder/_lib/factory-release-status.ts`) | Helpery modelu odczytu dla wiersza statusu zwolnienia. | reads/writes `factory_release_status` | (wewnętrzne) | — |
| `refreshD365Cache()` (`dashboard/_actions/refresh-d365-cache.ts`) | **Tylko eksport/import D365 (R15).** Odświeża pamięć podręczną importu D365 (status kodu materiałowego) dla Buildera; `not_configured` gdy brak integracji. Emituje zdarzenie outbox. | writes `d365_import_cache`, `outbox_events` | `npd.d365_builder.execute` (lub legacy `d365_builder.execute`) | — |

### Główna Tabela FG (Factory Article) — `fa/actions/*` + `fa/[productCode]/_actions/*`

| Akcja | Co robi | Odczytuje / zapisuje | Gate | Odwrócenie |
|---|---|---|---|---|
| `createFa(input)` (`fa/actions/create-fa.ts`) | Tworzy bezpośrednio wiersz `product` (FG) w Głównej Tabeli. Emituje `fa.created`. | writes `product`, `outbox_events` | `fg.create` | `deleteFa` |
| `updateFaCell(input)` (`fa/actions/update-fa-cell.ts`) | Edytuje jedną komórkę Głównej Tabeli, bramkowaną **per dział** (mapa `DEPT_PERMISSION` → `npd.<dept>.write`). **Każda edycja automatycznie resetuje `built=FALSE`** (flaga `built_reset`) — `built` to flaga `[LEGACY-D365]`, nie stan zwolnienia. Emituje `fa.edit`. | writes `product`, `outbox_events` | per-dział `npd.<dept>.write` | edytuj ponownie |
| `closeDeptSection / reopenDeptSection(input)` (`fa/actions/*`) | Zamknięcie (`Done_<Dept>` gotowości) lub **ponowne otwarcie** sekcji działu. Ponowne otwarcie to audytowane odwrócenie, bramkowane przez `npd.closed_flag.unset`. | writes `product`, `outbox_events` | zamknięcie: per-dział; ponowne otwarcie: `npd.closed_flag.unset` | ponowne otwarcie ↔ zamknięcie |
| `addProdDetailComponent / removeProdDetailComponent(input)` (`fa/actions/add-prod-detail-component.ts`) | Dodaje/usuwa wiersz `prod_detail` z wieloma komponentami (źródło prawdy dla N-komponentów). Emituje `fa.recipe_changed`. | writes `prod_detail`, `outbox_events` | `npd.production.write` | usuń ↔ dodaj |
| `setAllergenOverride(input)` (`fa/actions/set-allergen-override.ts`) | Ręczne addytywne przesłonięcie alergenu (NIE czyści automatycznego źródła kaskadowego). | writes `fa_allergen_overrides` | `technical.write` LUB `quality.write` | edytuj przesłonięcie |
| `deleteFa(input)` (`fa/actions/delete-fa.ts`) | Miękkie usunięcie `product` (ustawia `deleted_at`). Emituje `fa.deleted`. | writes `product`, `audit_events`, `outbox_events` | `npd.core.write` | — |
| `bom_export_csv(productCode)` (`fa/actions/bom-export-csv.ts`) | Eksportuje BOM FA jako CSV (HTTP `Response`). | reads BOM/product | `npd.dashboard.view` + `npd.bom.export` | — (odczyt/eksport) |
| `searchItems / getRequiredFieldsForDept(input)` (`fa/actions/*`) | Picker pozycji + metadane wymaganych pól per dział (sterowane schematem z DeptColumns). | reads `items`, DeptColumns | (odczyt; zakres RLS) | — (odczyt) |
| `listProdDetail / addProdDetailRow / updateProdDetailRow / removeProdDetailRow(input)` (`fa/[productCode]/_actions/finish-wip.ts`) | CRUD siatki Finish-WIP / ProdDetail na produkcie. | reads/writes `product`, `prod_detail` | `npd.finish_wip.read` / `…write` | edytuj ponownie |
| `getFaBom / benchmarks (3 fns)` (`fa/[productCode]/_actions/*`) | Model odczytu BOM FA + benchmarki kosztów dla zakładek szczegółów FA. | reads BOM / benchmark tables | (odczyt; zakres RLS) | — (odczyt) |

### Alergeny — `fa/[productCode]/allergens/_actions/*`

| Akcja | Co robi | Odczytuje / zapisuje | Gate | Odwrócenie |
|---|---|---|---|---|
| `readAllergenCascade(productCode)` (`read-allergen-cascade.ts`) | Odczytuje wielopoziomową wynikową kaskadę alergenów (RM → proces → FG) + przesłonięcia. | reads allergen tables, `fa_allergen_overrides` | `npd.allergen.write` (ekran odczytu+zapisu) | — (odczyt) |
| `refreshAllergenCascade(productCode)` (`refresh-allergen-cascade.ts`) | Ponownie wyznacza kaskadę (kolejkuje/przebudowuje). | writes `allergen_cascade_rebuild_jobs` / cascade | (zakres RLS) | uruchom ponownie |
| `updateFaAllergenSet(input)` (`update-allergen-set.ts`) | Aktualizuje zestaw alergenów FG. | writes allergen tables | `npd.allergen.write` | edytuj ponownie |
| `submitAllergenOverride(input)` (`submit-allergen-override.ts`) | Zgłasza addytywne przesłonięcie z powodem (nie mutuje automatycznego źródła kaskadowego). | writes `fa_allergen_overrides` | (zakres RLS) | edytuj przesłonięcie |

### Ryzyka (V18) — `fa/[productCode]/risks/_actions/*`

| Akcja | Co robi | Odczytuje / zapisuje | Gate | Odwrócenie |
|---|---|---|---|---|
| `listRisks(input)` (`list-risks.ts`) | Lista ryzyk z `score = likelihood × impact`, liczby w segmentach (Wysokie≥6 / Średnie 3-5 / Niskie). | reads `risks` | (odczyt; zakres RLS) | — (odczyt) |
| `createRisk(input)` (`create-risk.ts`) | Wstawia ryzyko (`state='Open'`). Emituje `risk.created`. | writes `risks`, `outbox_events` | `npd.risk.write` | przejście do `Closed` |
| `updateRisk({riskId,patch,transition?,reason})` (`update-risk.ts`) | Edytuje ryzyko i/lub zmienia jego stan. **Automat stanów:** `Open→Mitigated→Closed→Open` (każde przejście wymaga powodu ≥10 znaków; w przeciwnym razie `INVALID_TRANSITION`). Emituje `risk.updated`/`risk.transitioned`. | writes `risks`, `audit_events` | `npd.risk.write` | `Closed→Open` ponownie otwiera (jedyne cofnięcie dla ryzyk) |

### Dokumenty zgodności — `fa/[productCode]/docs/_actions/*`

| Akcja | Co robi | Odczytuje / zapisuje | Gate | Odwrócenie |
|---|---|---|---|---|
| `uploadDoc(formData)` (`upload-doc.ts`) | Wgrywa dokument zgodności do Supabase storage (per-org bucket, tworzony automatycznie) + wiersz w `compliance_docs`. | writes `compliance_docs` + storage | `npd.compliance_doc.write` | `softDeleteDoc` |
| `listDocs / getSignedUrl(input)` (`*.ts`) | Lista dokumentów / generowanie podpisanego URL do pobrania (audytowane). | reads `compliance_docs`; writes `audit_events` (signed-url) | (odczyt; zakres RLS) | — (odczyt) |
| `softDeleteDoc(input)` (`soft-delete-doc.ts`) | Miękkie usunięcie dokumentu zgodności. | writes `compliance_docs` | (zakres RLS) | — |

### Panel — `dashboard/_actions/*`

| Akcja | Co robi | Odczytuje / zapisuje | Gate | Odwrócenie |
|---|---|---|---|---|
| `getDashboardSummary()` (`get-dashboard-summary.ts`) | Model odczytu KPI/podsumowania panelu NPD. | reads `npd_projects` + powiązane | `npd.dashboard.view` (lub legacy `dashboard.view`) | — (odczyt) |
| `getLaunchAlerts(input)` (`get-launch-alerts.ts`) | Kafelki alertów wdrożenia (projekty zbliżające się do wdrożenia / zablokowane). | reads `npd_projects` + closeout | `npd.dashboard.view` | — (odczyt) |

**Zliczone akcje: 96 wyeksportowanych Akcji Serwera** w obu drzewach NPD
(mierzone: `export async function` w każdym pliku `'use server'` pod
`app/(npd)/**` i `app/[locale]/(app)/(npd)/**`, z wyłączeniem testów). Rdzeń
cyklu życia to 11 w `pipeline/_actions/`, 7 akcji formulacji oraz para
zwolnienia/promocji (`releaseNpdProjectToFactory` + `promoteToProduction`).

---

## c. Automat stanów

### Cykl życia projektu — 8 etapów + terminal (pivot stage-native z 2026-06-06)

`current_stage` to krok autorytarny; `current_gate` jest **wyliczany**
(`gate-helpers.ts:60-100`). Projekt przesuwa się dokładnie o jeden sąsiadujący
etap (`assertAdjacentStage`); pominięcie powoduje `ADJACENCY_VIOLATION`.

```
 brief ──► recipe ──► packaging ──► trial ──► sensory ──► pilot ──► approval ──► handoff ──► launched
 (G0/G1)   (G2)       (G3)*         (G3)       (G3)        (G3)      (G4)†        (G4)        (Launched, terminal)

   * wejście w `packaging` tworzy kandydata FG (createFgCandidate)
   † approval→handoff to wymuszany punkt kontrolny podpisu G4 (assertG4ESignForHandoff)
   handoff→launched uruchamia closeOutLegacyStagesForLaunch (pełny zestaw dowodów wdrożenia)
```

| Etap | Wyliczony gate | Kluczowy efekt uboczny / warunek wejścia | Kto zapisuje |
|---|---|---|---|
| `brief` | `G0` przy tworzeniu, `G1` po przesunięciu w jego kierunku | tworzony tutaj (`create-project.ts`) | deweloper |
| `recipe` | `G2` | opuszczenie `recipe` wymaga ≥1 składnika na bieżącej wersji formulacji (`RECIPE_INGREDIENTS_REQUIRED`) | `advanceProjectGate` |
| `packaging` | `G3` | **Kandydat FG tworzony przy wejściu** (`createFgCandidate`; warunek `FG_ALREADY_LINKED`) | `advanceProjectGate` |
| `trial` / `sensory` / `pilot` | `G3` | (tylko orientacyjna lista kontrolna) | `advanceProjectGate` |
| `approval` | `G4` | gate gdzie zbierane są zatwierdzenia e-podpisem G3/G4 | `advanceProjectGate` |
| `handoff` | `G4` | **wejście wymaga ważnego podpisu G4** + zaszczepienie listy kontrolnej handoff | `advanceProjectGate` |
| `launched` | `Launched` | terminalne zamknięcie (`closeOutLegacyStagesForLaunch`) | `advance`(→launched) / `closeOutLegacyStages` |

**Uwaga dotycząca odchylenia (w kodzie, `gate-helpers.ts:44-56`):** G1 (Wykonalność) jest
zawarty w etapie `brief` — pierwsze przesunięcie to `brief→recipe` wyznaczające
gate **G2**; G1 nigdy nie jest docelowym przesunięciem do przodu i pojawia się
wyłącznie przez cofnięcie gate'u przez administratora.
`handoff` mapuje na **G4**, nie `Launched`, więc status zamknięcia nigdy nie
pojawia się gdy trwają jeszcze prace handoff.

### Przepływ zatwierdzenia gate'u (G3 / G4)

Zatwierdzenie e-podpisem to **zarejestrowany punkt kontrolny, który nie przesuwa
już automatycznie** (`approve-project-gate.ts:78-81`):

1. `approveProjectGate(decision='approved', password)` → `signEvent` (CFR-21,
   intent `npd.gate.approved`) → wstaw `gate_approvals(decision='approved',
   esigned_at, esign_hash)`. Projekt **pozostaje na bieżącym etapie**.
2. Użytkownik oddzielnie wywołuje `advanceProjectGate`, aby przesunąć etap. Krok
   `approval→handoff` wywołuje `assertG4ESignForHandoff`, który weryfikuje
   istnienie niezmiennego zatwierdzonego wiersza `gate_approvals` dla G4 — bez
   niego `ESIGN_REQUIRED` (403).
3. `decision='rejected'` rejestruje powód w `gate_approvals` **bez hasła,
   bez podpisu** — **nie** cofa etapu (to wyłącznie rekord punktu kontrolnego).
   Cofanie gate'u wstecz to ścieżka **`revertNpdGate`** (sąsiedni gate, podpis PIN).

### Ścieżki odwrócenia / w dół

- **`revertNpdGate`** — cofnięcie sąsiedniego gate'u przez podpis PIN (`revert-npd-gate.ts`);
  wymaga `npd.gate.advance`; zablokowane przy aktywnej blokadzie zwolnienia.
- **Formulacja** — `draft` jest swobodnie edytowalny; `submitted_for_trial` i
  `locked` nie są (utwórz nową wersję roboczą, aby zmienić).
- **Ryzyko** — `Closed → Open` ponownie otwiera (`update-risk.ts:225-230`).
- **Sekcja działu** — `reopenDeptSection` (`npd.closed_flag.unset`).
- **Flaga `built`** — automatycznie resetuje na FALSE przy każdej edycji Głównej
  Tabeli (`built_reset`).
- **Brak odwrócenia** dla: uruchomionego projektu (terminalne `npd_legacy_closeout`),
  zwolnienia fabrycznego ani promowanego handoff.

### Weryfikacja przed zwolnieniem fabrycznym (blokery, `release-preflight.ts`)

`releaseNpdProjectToFactory` (oraz `promoteToProduction`, które go używa) rzuca
`PRECONDITION_BLOCKERS` jeśli NIE WSZYSTKIE warunki są spełnione: `G4_REQUIRED`
(projekt na G4), `FG_CANDIDATE_REQUIRED` (zmapowany kod produktu),
`ACTIVE_SHARED_BOM_REQUIRED` (aktywne `bom_headers` z ≥1 linią),
`FACTORY_SPEC_REQUIRED` / `FACTORY_SPEC_MISMATCH` (zatwierdzona `factory_specs`,
której dołączony BOM odpowiada aktywnemu BOM) oraz **`V18_OPEN_HIGH_RISK`**
(brak wiersza `risks` z `bucket='High' AND state='Open'`).

<!-- screenshot: npd/pipeline list (Projects tab + Create wizard) -->
<!-- screenshot: npd/pipeline/[projectId] project detail (stage rail + advance / gate panel) -->
<!-- screenshot: npd/pipeline/[projectId]/gate approval modal (G3/G4 e-sign) -->

---

## d. Instrukcje dla użytkownika

> Etykiety przycisków to klucze i18n (pakiety `Navigation.npd.*` i etapowe
> dostarczają anglojęzyczne teksty). Trasy są względne do lokalizacji
> (`/pipeline`, `/fa`, …).

### Pipeline NPD (Stage-Gate / Kanban)

Przejdź do **NPD → Projekty** (`/pipeline`), aby zobaczyć widok Kanban wszystkich projektów. Ekran pokazuje bramki (kolumny) od Brief do Wdrożonego, z kartami projektów pokazującymi kod NPD, nazwę i postęp.

![Pipeline NPD — widok Kanban bramek (Stage-Gate), KPI projektów](screenshots/npd-pipeline-kanban.png)

### Szczegóły projektu i bramki etapów (gate tabs)

Otwórz konkretny projekt, aby zobaczyć jego szczegóły i nawigować przez etapy. Ekran pokazuje wiele zakładek odpowiadających etapom (Brief, Receptura, Opakowanie, Próba, Sensoryka, Pilotaż, Zatwierdzenie, Przekazanie).

![Szczegóły projektu NPD — zakładka Brief (krótki opis, opakowanie, kanał, priorytet) z nawigacją po bramkach](screenshots/npd-project-gate-brief.png)

Nagłówek projektu ma przycisk **Duplikuj** (real `cloneProject`, #3/#4) oraz uczciwie wyłączony **⚑ Obserwuj** (do czasu dodania tabeli watcherów):

![Nagłówek projektu NPD — aktywny przycisk „Duplikuj" (cloneProject) i wyłączony „⚑ Obserwuj"](screenshots/npd-project-duplicate-button.png)

### (i) Utwórz projekt NPD

1. Przejdź do **NPD → Projekty** (`/pipeline`).
2. Kliknij **Utwórz** (kreator tworzenia; samodzielny ekran Brief jest w nim
   zawarty).
3. Wypełnij kreator: **Nazwa** + **Kategoria** (wymagane), **Priorytet**
   (domyślnie normalny), opcjonalnie **Właściciel / Planowana data wdrożenia /
   Uwagi**, oraz blok briefu (format opakowania, **waga netto opakowania (g)** =
   rozmiar partii przepisu, kanał sprzedaży, oczekiwany wolumen, docelowa cena
   detaliczna, grupa docelowa, twierdzenia marketingowe, ograniczenia).
4. Wybierz **Punkt wyjścia** — **Pusta receptura** albo **Sklonuj istniejący projekt**
   (to drugie jest podłączone do realnej akcji `cloneProject` od 2026-06-25, #3/#4 —
   po wybraniu pojawia się picker *projektu źródłowego*, który kopiuje nagłówek +
   listę kontrolną do nowego szkicu `brief`/`G0`). Kafelek **Szablon kategorii**
   zostaje **uczciwie wyłączony** („jeszcze niedostępne" — brak schematu szablonów).
5. **Zatwierdź** → `createProject` (lub `cloneProject` przy klonowaniu). Projekt jest
   tworzony na **etapie `brief`, gate `G0`**, z kodem `NPD-NNN` i zaszczepioną listą
   kontrolną gate'ów.

> Nagłówek projektu (`/pipeline/[id]`) ma też przycisk **Duplikuj** podłączony do tej
> samej akcji `cloneProject` (#3/#4); sąsiedni **⚑ Obserwuj** zostaje uczciwie
> wyłączony do czasu dodania tabeli watcherów (wymaga migracji).

### (ii) Przesuwanie przez gate'y (z zatwierdzeniami)

1. Otwórz projekt (`/pipeline/[projectId]`). Szyna etapów pokazuje bieżący etap;
   kontrolka przesunięcia oferuje dokładnie **następny** etap.
2. **Przesuń o jeden etap** → `advanceProjectGate({targetStage})`. Ważne kroki:
   - Opuszczenie `recipe` wymaga ≥1 składnika w przepisie (w przeciwnym razie
     `RECIPE_INGREDIENTS_REQUIRED`).
   - Wejście w `packaging` (= wejście do **G3**) **automatycznie tworzy kandydata
     FG** (lub użyj `createOrMapFgCandidateAtG3`, aby ustawić konkretny kod
     produktu / zmapować istniejący FG).
3. **Zbierz podpis elektroniczny G3 / G4.** Na ekranie gate/zatwierdzenie wywołaj
   `approveProjectGate({gateCode:'G3'|'G4', decision:'approved', notes, password})`
   — Twoje hasło jest weryfikowane (CFR-21) i zapisywany jest niezmienialny wiersz
   `gate_approvals`. To **punkt kontrolny** — **nie** przesuwa etapu.
4. **Przesuń `approval → handoff`** → `advanceProjectGate({targetStage:'handoff'})`.
   Wymaga **ważnego zatwierdzonego podpisu G4** (w przeciwnym razie
   `ESIGN_REQUIRED`) oraz zaszczepienia listy kontrolnej handoff.
5. **Odrzucenie** (`decision:'rejected'`, bez hasła) rejestruje powód; aby cofnąć
   etap operator z `npd.gate.advance` używa `revertNpdGate({projectId, reason, pin})`.

### (iii) Edytuj formulację

1. Otwórz **NPD → Formulacje** / zakładkę **Formulacja** projektu
   (`/pipeline/[projectId]/formulation`).
2. Jeśli nie istnieje, **utwórz wersję roboczą** → `createFormulationDraft` (lub
   utwórz nową wersję roboczą z zablokowanej).
3. Dodawaj/edytuj wiersze składników i **Zapisz** → `saveDraft({versionId,
   ingredients})` (tylko wersja robocza; zablokowane/zgłoszone wersje odrzucają
   zapis). Użyj `recomputeAndCache` do odświeżenia sum oraz **Oblicz wartości
   odżywcze** / **Oblicz koszty** z powiązanych zakładek.
4. **Zgłoś do próby** → `submitForTrial`. Suma musi wynosić **99,99–100,01%**,
   każdy surowiec musi mieć koszt, a cele wartości odżywczych muszą być obecne.
5. **Zablokuj** → `lockVersion` (`submitted_for_trial → locked`). Zablokowanie
   kaskadowo wczytuje listę składników do `recipe_components` / `ingredient_codes`
   produktu. Aby zmienić zablokowany przepis, utwórz **nową wersję roboczą**.

### (iv) Utwórz + zatwierdź specyfikację fabryczną (oraz wstępne BOM)

W NPD nie ma samodzielnego formularza „utwórz specyfikację fabryczną" — specyfikacja
fabryczna + wstępne wspólne BOM są **materializowane przez przepływ zwolnienia**:

1. Upewnij się, że projekt jest na **G4** z zmapowanym kandydatem FG, zablokowanym
   przepisem i zarejestrowanym podpisem G4.
2. Wyzwól zwolnienie — bezpośrednio (`releaseNpdProjectToFactory(projectId)`) lub
   przez przycisk promocji na ekranie handoff (poniżej). `materializeNpdBom` tworzy
   wiersz FG w `items`, `bom_headers`/`bom_lines` oraz **zatwierdzoną** specyfikację
   w `factory_specs`; `runReleasePreflight` egzekwuje G4 / FG / aktywne BOM /
   dopasowanie specyfikacji / **brak otwartych ryzyk wysokich V18**.
3. Po sukcesie `factory_release_status` zmienia się na `released_to_factory` i
   emitowane jest `fg.released_to_factory`; listy pozycji / BOM / specyfikacji
   fabrycznych Technicznego są rewalidowane, aby nowa specyfikacja była widoczna.
   **Bieżąca poprawność specyfikacji fabrycznej należy następnie do 03-Technical**,
   nie NPD.

### (v) Przekazanie do produkcji (handoff)

1. Otwórz zakładkę **Handoff** projektu (`/pipeline/[projectId]/handoff`) —
   dostępna tylko na etapie `handoff` (przesunięcie do niego zaszczepia listę
   kontrolną).
2. Realizuj listę kontrolną handoff (przepis zablokowany, wartości odżywcze
   zatwierdzone, grafika finalna, próba pilotażowa pomyślna, szkolenie przygotowane,
   pierwsze ZP zaplanowane) → zaznaczaj każdy element przez
   `toggleHandoffChecklistItem`. Odznaki bramek zwolnienia (`probeReleaseGates`)
   pokazują status G4 / FG / BOM / specyfikacji fabrycznej / V18.
3. Kliknij **✓ Promuj do BOM produkcyjnego** → `promoteToProduction`. Wymaga
   **kompletnej** listy kontrolnej, następnie uruchamia właściwe zwolnienie
   fabryczne; niepowodzenie preflight zwraca `release_blocked` (bez fałszywego BOM)
   i pozostawia handoff jako niepromowany.

### (vi) Wdrożenie

1. Z promowanym handoff (zwolnienie zatwierdzone, BOM aktywny, G4 podpisany),
   przesuń **`handoff → launched`** → `advanceProjectGate({targetStage:'launched'})`
   (lub uruchom `closeOutLegacyStages({projectId})`).
2. Zamknięcie weryfikuje pełny zestaw dowodów — zwolniony status fabryczny +
   zdarzenie zwolnienia, zatwierdzony+podpisany G4, ustawiony **termin przydatności**
   produktu, znacznik czasu przeliczenia alergenów, **dowód pilota** (powiązane ZP
   pilotażowe lub `completed` w `pilot_runs`), BOM w stanie `active`/`technical_approved`
   oraz **kompletne MRP opakowań** — następnie zapisuje `npd_legacy_closeout` i
   ustawia etap `launched` (gate wyznacza `Launched`), emitując
   `npd.project.legacy_stages_closed`.
3. **Wdrożony jest terminalny** — nie ma cofnięcia wdrożenia. Zmiana po zwolnieniu
   tworzy **nową** wersję BOM / specyfikacji produktu kierowaną przez zatwierdzenie
   **Technicznego** (reguła SSOT dla BOM), nigdy mutację w miejscu.

---

## e. Źródła danych (tabele Supabase)

Cykl życia projektu / gate'ów:

- `npd_projects` — projekt (kod, nazwa, typ, `current_stage`, wyliczany `current_gate`, właściciel, priorytet, wbudowane pola briefu, `product_code`).
- `gate_checklist_items` — zaszczepiona per-projekt lista kontrolna gate'ów (orientacyjny postęp).
- `gate_approvals` — punkty kontrolne zatwierdzenia G3/G4 (decyzja, uwagi, `esigned_at`, `esign_hash`).
- `"Reference"."GateChecklistTemplates"` — szablony do zaszczepienia listy kontrolnej (odczyt).
- `org_sequences` — przydzielanie kodów `NPD-NNN` per org.
- `handoff_checklists` / `handoff_checklist_items` — bramka etapu handoff.
- `npd_legacy_closeout` — migawka terminalnego zamknięcia wdrożenia.
- `factory_release_status` — model odczytu zwolnienia fabrycznego.

Formulacja / wartości odżywcze / koszty:

- `formulations` / `formulation_versions` / `formulation_ingredients` / `formulation_audit_log` — wersjonowany przepis.
- `nutrition_profiles` / `nutrition_allergens` / `nutri_score_results` — obliczenia odżywcze.
- `costing_breakdowns` / `costing_waterfall_steps` — scenariusze kosztowe.

Główna Tabela FG / specyfikacja / ryzyka / dokumenty:

- `product` — 69-kolumnowa Główna Tabela FG (fizyczna tabela za widokiem tylko do odczytu `fa`); `prod_detail` — źródło prawdy dla wielu komponentów.
- `items` / `bom_headers` / `bom_lines` / `factory_specs` — zapisywane przez `materializeNpdBom` przy zwolnieniu (wspólny SSOT dla BOM).
- `risks` — rejestr ryzyk V18 (`bucket`, `state`, `score`).
- `fa_allergen_overrides` + tabele kaskady alergenów + `allergen_cascade_rebuild_jobs`.
- `compliance_docs` — dokumenty zgodności (+ bucket Supabase storage).

Tabele etapów: `trial_batches`, `pilot_runs` / `pilot_run_materials` / `pilot_run_checklist_items`, `packaging_components` + tabela wersji grafik.

Przekrojowe: `outbox_events` (każda emisja `npd.*` / `fa.*` / `fg.*` / `formulation.*` / `risk.*`), `audit_events` / `audit_log` (zapisy), `e_sign_log` (podpisy elektroniczne gate'ów), `d365_import_cache` (D365 Builder), `user_roles` / `roles` / `role_permissions` (sprawdzenia RBAC).

---

## f. Znane luki / TODO

Oparte na przeczytanym kodzie — żadnych domysłów:

1. **Zmiana nazwy FA → FG jest niekompletna (znany pending).** Kanoniczna nazwa
   widoczna dla użytkownika to FG, ale implementacja nadal używa `FA` wszędzie
   strukturalnie: segment trasy `/fa`, cały katalog akcji `fa/actions/*` +
   `fa/[productCode]/_actions/*`, prefiksy zdarzeń `fa.created` / `fa.edit` /
   `fa.deleted` / `fa.recipe_changed` / `fa.dept_closed`, widok tylko do odczytu
   `public.fa`, rozbieżność `fg.create` / `FA_CREATE_PERMISSION` w `create-fa.ts`
   oraz przemianowanie w nawigacji (`npd-nav.ts:9-12` mapuje prototypowe „FA"→„FG"
   tylko w treści). Pełne przejście nazewnictwa jest do zrobienia.
2. **Brak cofnięcia ze stanu Wdrożony i brak cofnięcia nagłówka zwolnienia.**
   `launched` jest terminalny (`npd_legacy_closeout`, `close-out-legacy-stages.ts`),
   `revertNpdGate` cofa tylko jeden sąsiedni gate (`revert-npd-gate.ts`), a
   `releaseNpdProjectToFactory` / `promoteToProduction` są jednokierunkowe.
   Udokumentowana ścieżka dla zmiany po zwolnieniu to **nowa** wersja BOM/specyfikacji
   przez Techniczny — w NPD nie istnieje akcja cofająca wdrożenie ani zwolnienie.
3. **Dwa równoległe drzewa NPD.** Aktywne strony są pod
   `app/[locale]/(app)/(npd)/**`, ale główne akcje są w nielokalizowanym
   `app/(npd)/**/_actions/**`, importowanym przez głębokie ścieżki względne
   `../../../../../../(npd)/…` (np. `promote-to-production.ts:35`). Działa, ale
   jest kruche; drzewo `app/(npd)` ma `_actions` ale nie ma własnego `page.tsx`.
4. **„Odrzucenie" gate'u nie cofa etapu.** `approveProjectGate(decision='rejected')`
   rejestruje jedynie powód w `gate_approvals` (`approve-project-gate.ts:39-44`);
   nie przesuwa etapu. Jedyna ścieżka wstecz to **`revertNpdGate`** (podpis PIN,
   uprawnienie `npd.gate.advance`) — nie wielogate'owe cofnięcie administratora.
5. **Lista kontrolna gate'u jest orientacyjna, nie blokująca.** Zaszczepione
   `gate_checklist_items` to wyłącznie znaczniki postępu — wymagane, ale
   niezaznaczone elementy **nie blokują** twardego przesunięcia (świadoma decyzja,
   `gate-helpers.ts:281-283`). Jedyne faktycznie egzekwowane sygnały kompletności
   to warunek składników w przepisie, warunek konfliktu FG, podpis G4, brama
   kompletności listy kontrolnej handoff oraz weryfikacja przed zwolnieniem.
6. **D365 Builder to tutaj stub odświeżania pamięci podręcznej.** Jedyna akcja D365
   wpięta w to drzewo to `refreshD365Cache` (`d365_import_cache`); pełny
   8-zakładkowy eksport `Builder_FA<code>.xlsx` per FA opisany w `MON-domain-npd`
   nie jest obecny jako Akcja Serwera w `app/(npd)` (nie znaleziono pisarza
   `fa_builder_outputs`). D365 pozostaje **tylko eksport/import** per R15.
7. **Sensory jest tu tylko do odczytu z założenia.** `getSensoryPanel` odczytuje
   panel, ale nie istnieje akcja zapisu sensorycznego w NPD — schemat sensoryczny
   jest **własnością 03-Technical** (granica właścicielska `MON-domain-npd`); NPD
   tylko go konsumuje na potrzeby bramkowania.
8. **`built` nie jest stanem zwolnienia.** Automatycznie resetuje na FALSE przy
   każdej edycji Głównej Tabeli (`update-fa-cell.ts` `built_reset`) i jest
   oznaczona `[LEGACY-D365]`; stanem zwolnienia jest `factory_release_status`,
   nie `product.built`. Nie traktuj `built` jako „wdrożony".

Żadnych surowych markerów `// TODO` nie znaleziono w serwisach cyklu życia poza
uwagami dotyczącymi własności/zmiany nazwy cytowanymi powyżej; lista luk pochodzi
w pozostałej części z ograniczeń automatu stanów / możliwości oraz dryftu
nazewnictwa FA↔FG zaobserwowanego w kodzie.

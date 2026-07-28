# FIX-T3 (Composer) — WIP cycle race + depth boundary + stale-after-save — monopilot-kira

ROLA: Senior dev. Napraw 4 findingi cross-review Codexa (P0 WIP + cascade). TYLKO KOD. NIE odpalaj testów/build/lint/git. NIE commituj, NIE `git add`. Orchestrator odpala bramkę po Tobie.
REPO: /Users/mariuszkrawczyk/Projects/monopilot-kira (= CWD). RLS: `org_id`+`app.current_org_id()`.

KONTEKST: Twój fix (self+A→B→A sekwencyjny cycle guard, współdzielony `wip-definition-cycle.ts`) jest DOBRY dla przypadku sekwencyjnego. Cross-review Codexa wskazał realne braki:

## DO NAPRAWY

### F1 (BLOCKER) — off-by-one depth ŁAMIE istniejący test + zmienia limit
Zmieniłeś `depth >= MAX_DEPTH` → `depth > MAX_DEPTH` (`load-recipe-cascade.ts:~108`). Istniejący test oczekuje stopu na depth 3 (`load-recipe-cascade.test.ts:~121`) → będzie CZERWONY, a limit głębokości realnie się poluzował.
**FIX:** ZACHOWAJ granicę `>= MAX_DEPTH`, ale NA granicy sonduj, czy węzeł FAKTYCZNIE ma potomków (`hasExpandableSubRecipe()`): `maxDepthReached` tylko gdy `depth >= MAX_DEPTH` I węzeł ma rozwijalne sub-recipe; zwykły liść na granicy → NIE max-depth. Nie zmieniaj wartości MAX_DEPTH ani granicy.

### F2 (NEEDS-FIX) — nowy leaf-test nie testuje fixa
Twój przypadek ma tylko 1 poziom sub-recipe, nigdy nie dociera do MAX_DEPTH → przechodził też przed zmianą (`load-recipe-cascade.test.ts:~99`).
**FIX:** dodaj przypadki DOKŁADNIE na granicy: (a) terminalny liść na `depth == MAX_DEPTH` → NIE max-depth, (b) węzeł rozwijalny na `depth == MAX_DEPTH` → max-depth. Napraw też istniejący czerwony test.

### F3 (NEEDS-FIX) — stale-after-save NIE naprawiony root-cause
`cascadeSignature` czyści cache przy lokalnej zmianie rows, NIE po zakończeniu save (`formulation-editor.tsx:~847`). Root cause: `saveDraft` kasuje i reinsertuje ingredient rows → zmienia ich ID; editor celowo nie reseeduje rows przy refreshu tej samej wersji; cascade mapowany po efemerycznym `ingredientLineId` → po save nowe wyniki nie pasują do starych lokalnych ID.
**FIX:** stabilne mapowanie cascade (klucz niezależny od reinsertowanego `ingredientLineId`) ALBO reseed/remount rows po UDANYM save. Cascade po zapisie musi pokazać świeże drzewo. Dodaj RTL test: save → reload → cascade poprawny (bez stale/hard-refresh).

### F4 (BLOCKER-race) — współbieżne A→B→A omija guard
Guard czyta graf potem zapisuje; blokada obejmuje tylko edytowaną definicję (`wip-definition-cycle.ts:~31`, `wip-definition-actions.ts:~188`). Dwie równoległe txn mogą utworzyć cykl.
**FIX:** serializuj mutacje grafu per org — `pg_advisory_xact_lock` na kluczu (org) PRZED odczytem grafu, w tej samej transakcji co zapis (advisory lock, nie globalny). Dodaj test współbieżności (real-DB) że równoległe A→B i B→A nie utworzą cyklu.

## MIGRACJA: none (fix kodowy). Jeśli konieczna: `packages/db/migrations/517-<opis>.sql`.
## Dotykaj TYLKO: `technical/wip-library/**` + `(npd)/pipeline/[projectId]/formulation/**` (load-recipe-cascade, formulation-editor) + i18n jeśli nowe klucze. NIE tykaj `(npd)/pipeline/_actions/**` gate (inny tor).

## OUTPUT: ## FILES TOUCHED / ## FIX (F1-F4 → zmiana) / ## MIGRATION / ## TEST / ## UNCERTAINTIES

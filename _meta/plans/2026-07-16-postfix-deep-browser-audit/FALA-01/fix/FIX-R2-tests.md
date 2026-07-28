# FIX-R2 (Composer) — 3 regresje testowe fali (potwierdzone baseline-diffem) — monopilot-kira

ROLA: Senior dev. Napraw DOKŁADNIE 3 failujące testy (regresje wprowadzone przez falę — baseline na czystym main je przechodzi). TYLKO KOD. NIE odpalaj build/lint/git, NIE commituj. (Możesz uruchomić TYLKO te 3 pliki testowe by zweryfikować, ale nie całą bramkę.)
REPO: /Users/mariuszkrawczyk/Projects/monopilot-kira (= CWD).

Zasada: NIE osłabiaj asercji, by „przeszło". Test ma nadal walidować REALNE zachowanie. Jeśli zachowanie się zmieniło zasadnie (probe/lock), zaktualizuj oczekiwanie tak, by odzwierciedlało poprawną nową semantykę.

## R1 — `app/(npd)/pipeline/_actions/__tests__/launch-stage-gate.test.ts` — `evaluateStageGate is not a function`
Przyczyna: usunięto nielegalny re-export `export { evaluateStageGate }` z `advance-project-gate.ts` (był zakazany w pliku `'use server'`). Test bierze `evaluateStageGate` przez **dynamiczny** `import('../advance-project-gate')` (`loadAdvanceGate`, ~l.29) → teraz `undefined`.
**FIX:** w tym teście importuj `evaluateStageGate` z kanonicznego źródła `../_lib/evaluate-stage-gate` (dynamicznie, spójnie z `vi.resetModules()`), NIE z `../advance-project-gate`. Zachowaj resztę logiki testu.

## R2 — `app/(npd)/pipeline/[projectId]/formulation/_actions/load-recipe-cascade.test.ts` — `expected length 2 but got 3`
Test `marks an expandable node at max depth as max-depth reached`: asercja `queries.filter(q => q.includes('where fi.version_id = $1::uuid')).toHaveLength(2)`. FIX depth dodał na granicy `hasExpandableSubRecipe()` — probe robi 1 dodatkowy query (by odróżnić liść od rozwijalnego węzła na MAX_DEPTH), stąd 3 zamiast 2. Zachowanie `maxDepthReached:true, lines:[]` jest POPRAWNE.
**FIX:** jeśli probe jest konieczny (nie da się określić rozwijalności z już-załadowanych danych) → zaktualizuj asercję na `toHaveLength(3)` z komentarzem dlaczego (probe expandability na granicy). Jeśli rozwijalność DA SIĘ ustalić bez dodatkowego query → zoptymalizuj `hasExpandableSubRecipe` by nie robił extra query i zostaw 2. Wybierz poprawnie i uzasadnij.

## R3 — `app/[locale]/(app)/(modules)/technical/wip-library/_actions/__tests__/wip-definition-clone-on-write.unit.test.ts` — `{ok:false}` zamiast `{ok:true}`
Test `inserts a new version row for active definitions instead of mutating in place`. FIX cycle dodał w `assertWipDefinitionCompositionAcyclic` `pg_advisory_xact_lock(hashtextextended('wip-composition:'||org, 0))` + load krawędzi grafu PRZED zapisem. Mock klienta w teście nie stubuje tych nowych zapytań → cycle-check/lock się wywala → `{ok:false}`.
**FIX:** rozszerz mock DB w teście, by obsługiwał nowe zapytania (advisory lock zwraca ok; edge-load zwraca brak krawędzi = brak cyklu), tak by `saveWipDefinition` doszło do clone-on-write i zwróciło `{ok:true}` z nowym version-row. Test ma nadal weryfikować insert-new-version (nie mutację in-place).

## Dotykaj TYLKO tych 3 plików testowych (+ ewentualnie `hasExpandableSubRecipe` w `load-recipe-cascade.ts` jeśli wybierzesz optymalizację w R2). NIE zmieniaj innej logiki produkcyjnej.

## OUTPUT: ## FILES TOUCHED / ## FIX (R1,R2,R3 → co zmienione + uzasadnienie R2) / ## VERIFY (wynik uruchomienia 3 plików, jeśli odpaliłeś)

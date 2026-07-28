# FIX-T2 (Composer) — G4 operational criteria + override test — monopilot-kira

ROLA: Senior dev. Dokończ P0 PF-R04-01 (część „operational evidence"). TYLKO KOD. NIE odpalaj testów/build/lint/git. NIE commituj, NIE `git add`. Orchestrator odpala bramkę po Tobie.
REPO: /Users/mariuszkrawczyk/Projects/monopilot-kira (= CWD). RLS: `org_id`+`app.current_org_id()`.

KONTEKST: Twój wcześniejszy fix (checklist enforcement) jest DOBRY i żywy (`approve-project-gate.ts` używany przez oba ekrany prod). Cross-review Codexa wskazał JEDNĄ realną lukę + jeden test.

## DO NAPRAWY

### F1 (BLOCKER) — formalne G4 nie sprawdza operational criteria
`evaluateStageGate`/`getBlockers` dla przejścia `approval → handoff` (formalne G4) NIC nie sprawdza (`evaluate-stage-gate.ts:~192`, `gate-helpers.ts:~557`). Kryteria operacyjne C1–C7 (department closures, release preflight, RM usability, BOM/factory-spec readiness, Settings approvals — kontrakt T-058) są sprawdzane DOPIERO przy `handoff → launched` (`gate-helpers.ts:~590`). Skutek: e-sign G4 certyfikuje bez operational evidence — to niedokończona połowa PF-R04-01.
**FIX:** te autorytatywne evaluatory JUŻ ISTNIEJĄ (używane przy `handoff → launched`). Wepnij te same sprawdzenia do formalnego G4 (`approval → handoff`) w `approveProjectGate` PRZED `signEvent`, zwracane jako `HARD_BLOCKED` (nieprzekraczalne, spójnie z checklistem). Reużyj istniejącej funkcji — nie duplikuj logiki. Uważaj, by nie zablokować legalnych ścieżek advisory (cost/nutrition override zostaje advisory + wymaga `npd.gate.approve`).

### F2 (NEEDS-FIX) — test „unauthorized override" ma fałszywe pokrycie
`gate-approval-readiness.pg.test.ts:~38` nadaje aktorowi ZAROWNO `npd.gate.advance` JAK I `npd.gate.approve` → dowodzi tylko że required=hard, NIE że advisory override jest ograniczony do approvera.
**FIX:** dodaj przypadek z aktorem mającym WYŁĄCZNIE `npd.gate.advance` (bez approve) próbującym advisory override → oczekuj `FORBIDDEN`, brak audytu, brak update stage.

## TESTY: dodaj test że formalne G4 z niespełnionym operational criterion → `HARD_BLOCKED`, brak `gate_approvals`/e-sign. Real-DB (`.pg.test.ts`) wzorem sąsiednich. NIE uruchamiaj.
## MIGRACJA: none (fix kodowy). Jeśli konieczna: `packages/db/migrations/516-<opis>.sql`.
## Dotykaj TYLKO: `apps/web/app/(npd)/pipeline/_actions/**` (evaluate-stage-gate.ts, gate-helpers.ts, approve-project-gate.ts, advance-project-gate.ts, __tests__/). NIE tykaj formulation/* (inny tor).

## OUTPUT: ## FILES TOUCHED / ## FIX (F1,F2 → zmiana) / ## MIGRATION / ## TEST / ## UNCERTAINTIES

# Plan fal naprawczych — 2026-07-10

## GOAL
Wyczyścić WSZYSTKIE bugi (lista Fable 3×P0/17×P1/~20×P2 + znaleziska E2E + nowe z huntu).
Definitywne zamknięcie buga = **real E2E browser test + screeny potwierdzające bug i naprawę**, nie zielone testy.
Loop aż wszystkie naprawione + nowo znalezione.

## Pipeline per fala (5-6 bugów)
1. **Claude (ja)**: spec fali → plik `_meta/plans/wave-N-spec.md`
2. **Composer 2.5**: implementacja w worktree `~/Projects/monopilot-worktrees/waveN` (branch `fix/waveN-*`)
3. **Codex gpt-5.6-sol**: review diffu + integralność (`codex exec -m gpt-5.6-sol`), szczery verdict per bug
4. **Claude**: arbitraż findings → Composer poprawki (loop aż Codex pass)
5. **Opus subagent**: review CAŁEJ fali (diff vs origin/main)
6. Merge → push → prod deploy → **E2E browser verify + screeny** (bug repro na starym stanie mam z listy, fix-screen z prod)
7. Bugi nie-UI (WAC, RBAC): dowód = SQL before/after + screen z UI gdzie efekt widoczny (koszt WO, 403 toast)

## Wake-up
Background taski (Composer/Codex/Workflow) re-invoke'ują mnie automatycznie po zakończeniu — zero pollingu.
Fallback: jeśli task wisi >30 min → kill + retry z ciętym zakresem. E2E browser runy robię foreground.

## FALE

### W1 — pieniądze/WAC (cluster jednodomenowy)
1. P0 asymetria walutowa pul WAC (book-receipt-wac vs upsert-wac + callerzy consume/register-output)
2. P1 cichy fallback GBP przy przyjęciu (book-receipt-wac:155)
3. P1 storna zawsze do GBP (upsert-wac:332,379)
4. P1 kg do WAC floatem (register-output:918)
5. P1 resolve-output-wac cichy drop linii unresolved-UoM
6. P2 resolveWacDeltaQtyKg nie zna 'pcs' (upsert-wac:194 vs uom/piece.ts)

### W2 — Planning listy + RBAC
1. P0 PO lista: server-side search/status (SQL gotowy w akcji)
2. P0 WO lista: jw. (WO_LIST_WHERE gotowy)
3. P0 TO lista: jw.
4. P0 liczniki tabów z count(*) group by status
5. P1 RBAC: seed planning.po.*/to.*/supplier.* + checki w akcjach PO/TO/suppliers/import

### W3 — lifecycle/integralność
1. P1 materialize-npd-bom omija maszynę stanów BOM (status='draft' + bom-publish-service)
2. P1 update-bom-yield mutuje ACTIVE header in-place
3. P1 releaseWorkOrder heal-write utrwala się mimo odmowy
4. P1 G3 approve skacze stage'ami (approve-project-gate)
5. P1 formulation lifecycle odwrócony (submitted_for_trial dead state)
6. P1 hold release blanket-reset qa_status (per-output snapshot)

### W4 — paginacja + i18n
1. P1 production WO lista cap 200 → paginacja + server search
2. P1 technical items/materials cap 200 → pager + search
3. P1 paczka i18n: factorySpecs.release.*, Planning pagination.*, faProductionTab.*, totalYield, projectWizard outputUnit, wip yieldPct, handoff/packaging ro/uk
4. P2 statusCounts vs limit rozjazd (list-work-orders)

### W5 — testy które kłamią + E2E honesty
1. P0 3 tautologiczne parity-specy (harnessHtml) → gate na PLAYWRIGHT_BASE_URL + real screen
2. P1 kaskady skip(!projectId) → describe.serial; runtime skip przy pustym seedzie → expect
3. P1 moje 2 flow-specy: usunąć graceful-degrade z kroków mutujących, triggery przez ?new=1
4. P2 skip-count fail-gate w CI (opcjonalnie)
5. Dead code po B3 (buildWipNoFgLabels/buildWipPanelLabels/import w formulation/page.tsx)
6. Pre-existing: import-to.test.ts uom-pcs, dwa pliki 459, playwright testMatch

### W6 — P2 reszta (tx-safety revalidate-przed-commit klasa, fail-open RLS site, accept-declaration catch, upload-supplier-spec kompensacja, cost NUMERIC(10,4), wip-cost float, lock bez totalPct, unlock bez trial-check, cancelWo race, publish FOR UPDATE) — potnę na W6a/W6b po drodze
### W7–W17 — znaleziska z Kierunku 1 (68 findings: 1×P0, 40×P1, 27×P2)
Pełny zdedupowany backlog + skład fal: `_meta/reviews/2026-07-10-hunt/00-consolidated-backlog.md`.
Kolejność: W7 Security+NPD gates (P0 assign-role escalation!) → W8 Shipping/POD → W9 Production/QA → W10 Money roll-ups → W11 built-flag/mig359 → W12 release-bundle/ECO → W13 Scheduler/MRP → W14 importy → W15 Technical lifecycle → W16 formulation+maintenance → W17 P2 sweep.
Uncertain (5 items, m.in. N-25 app_user, N-39/40 LOTO/calibration „future slice"?) — zweryfikować przed naprawą.

## Kierunek 1 (równolegle)
- Workflow: 5 Opusów domykających luki pokrycia Fable (eco-apply/release-bundle, widoki+ON CONFLICT, LOTO/calibration/POD, revert-gate/built-reset, lib/technical+planning money)
- 10 Codexów (gpt-5.6-sol, osobno od workflow, background): każdy inny etap aplikacji + inny lens
- Wyniki → `_meta/reviews/2026-07-10-hunt/` → dedup vs lista Fable → zasilają W7+

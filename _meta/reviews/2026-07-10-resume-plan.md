# Resume plan po compact — 2026-07-10

## Stan repo
- Branch `main`, HEAD == origin/main. Wszystko deployowane na prod (https://monopilot-kira.vercel.app).
- Ten sesyjny dorobek na prodzie: B1 (packaging supplier-save crash / phantom `suppliers.deleted_at`), B2 (stay-on-recipe po FG mint), B3 (Finish-WIP panel usunięty z recipe), saveDraft-gate refresh, **modal footer clip** (`packages/ui/tokens.css` — `.mp-modal-content > form` flex-column; naprawia WSZYSTKIE form-modale). 2 trwałe E2E flow-spec'i (`apps/web/e2e/npd-create-to-wo-flow.e2e.spec.ts`, `order-to-ship-flow.e2e.spec.ts`).
- Login test: admin@monopilot.test / Admin2026!!!. Owner DB psql: DATABASE_URL_OWNER (sslmode=require), org 0002.
- Codex CLI 0.144.1; **gpt-5.6-sol dostępny** (`codex exec -m gpt-5.6-sol`). Fable-5 subagent credits BYŁY wyczerpane — sprawdzić czy wróciły; jeśli nie: Opus + Codex(gpt-5.6-sol) + Composer(cursor-exec).

---

## KIERUNEK 1 — agenty do przeglądu aplikacji
Cel: deep-scan całej aplikacji (NPD→shipping) na dead-code + nieodwoływane tabele/kolumny/funkcje + broken-wiring.
- **Gotowy workflow** (przerwany przez usera 2026-07-09, nie dokończony): skrypt zapisany w
  `~/.claude/projects/-Users-mariuszkrawczyk-Projects-monopilot-kira/4ef9dab1-.../workflows/scripts/npd-to-shipping-deep-scan-wf_0bec5dca-dba.js`
  Struktura: 20 Opus scannerów (12 modułów + 8 kategorii) → Codex verify (kill false-positives) → wspólny raport `_meta/reviews/2026-07-09-deep-scan-report.md` → 10 worktree refactor agentów (ponytail/caveman, tylko czyste usunięcia, tsc+testy gate).
  Re-run: `Workflow({scriptPath: "<ten plik>"})` — lub authorować nowy z Codex=gpt-5.6-sol.
- Po workflow: raport → merge TYLKO zielonych branchy refactoru (serial, gate) → posprzątać worktrees/branche (`worktree-wf_*`, `scan-refactor-*`).

## KIERUNEK 2 — naprawa błędów które znaleźliśmy
1. **Dead code po B3** (`apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/formulation/page.tsx`): martwe po usunięciu FormulationWipPanel — funkcje `buildWipNoFgLabels` (~655) + `buildWipPanelLabels` (~685) + import `FaProductionTabLabels` (67). Usunąć (tsc jest 0, ale to martwy kod). CELOWO zostawione tej sesji.
2. **Jakość E2E spec'ów** (user: „bez skrotow"): oba nowe spec'i mają **graceful-degradation która passuje BEZ realnego tworzenia** (order→ship „passed" 1-6 ale 0 rekordów w DB) + **fragility triggerów** (nie otworzyły create-PO klikając „＋ Create PO" — fullwidth-plus U+FF0B). Fix: (a) otwierać modale przez `?new=1` deep-link zamiast klikania przycisku, (b) usunąć graceful-degrade z krytycznych kroków mutujących → fail-red honestnie.
3. **Pre-existing (z porannych list)**: `import-to.test.ts` uom-pcs fail (dryf R3.3, nie regresja); dwa pliki migracji `459` (konwencja numeracji — renumeracja ostrożnie); `playwright test --list` bez argów błądzi na plikach vitest (testMatch za szeroki).
4. Uwaga: E2E przeciw prod PISZE do żywego Supabase → czyścić test-data (prefiks „E2E", kaskada NPD).

## Gdzie zacząć po compact
User powie który kierunek (albo oba równolegle). Kierunek 1 = odpal workflow deep-scan. Kierunek 2 = zacznij od #1 (dead code) + #2 (E2E honesty), potem #3.

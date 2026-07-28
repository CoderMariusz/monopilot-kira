# CROSS-REVIEW (Codex) — FALA 1, tory T1–T3 (kod Composera) — monopilot-kira

ROLA: Adwersarialny senior reviewer. **READ-ONLY — NIE edytuj, NIE commituj, NIE odpalaj testów/build/git.** Tylko raport findingów.
To są **P0 governance/safety fixy** (21 CFR Part 11, RLS, food-safety) → wysoki próg pewności. Szukaj: fix pozorny/nie-root-cause, bypass, brak deny-by-default, walidacja tylko client-side, zły RLS (`org_id`/`app.current_org_id()`), edycja MARTWEGO/legacy pliku zamiast żywego wpiętego w prod, kolizje plików między torami, błędna migracja, test który NIE waliduje faktycznej poprawki.

REPO: /Users/mariuszkrawczyk/Projects/monopilot-kira (= CWD). Diff obejrzyj sam: `git --no-pager diff -- <pliki poniżej>` oraz `git status --short`.

## KONTEKST FINDINGÓW (spec)
- **T1 / PF-R01-01 P0**: invite ignorował site → user bez `user_sites` = unrestricted cross-site. Fix ma serwerowo zapisać site scope (deny-by-default, rollback przy błędzie). **PF-R01-02 P1**: Security settings nie zapisują się (mig 509 `app.upsert_my_tenant_idp_policy` tylko UPDATE → false gdy brak wiersza).
- **T2 / PF-R04-01 P0**: G3/G4 approve ignorował required checklist/evidence (był tylko `getBlockers()`). Fix: jeden serwerowy gate-evaluator, required = HARD (nieprzekraczalne). **PF-R04-04 P1**: required evidence był soft-override bez auth.
- **T3 / PF-R05-01 P0**: definicja WIP mogła zawierać siebie (brak walidacji grafu przed zapisem). Fix: serwerowa detekcja cyklu (self + A→B→A). **PF-R05-08 P2**: cascade stale po save + liście mylone z max-depth.

## PLIKI DO PRZEGLĄDU
T1: `apps/web/actions/users/invite.ts`, `apps/web/actions/users/invite.behavior.test.ts`, `packages/db/migrations/510-tenant-idp-policy-upsert.sql`, `packages/db/src/migrations/510-tenant-idp-policy-upsert.sql`
T2: `apps/web/app/(npd)/pipeline/_actions/_lib/evaluate-stage-gate.ts`, `.../_lib/gate-helpers.ts`, `.../advance-project-gate.ts`, `.../approve-project-gate.ts`, `.../__tests__/*` (gate-*)
T3: `apps/web/app/[locale]/(app)/(modules)/technical/wip-library/_actions/wip-definition-cycle.ts`, `.../wip-definition-actions.ts`, `.../__tests__/wip-definition-cycle.unit.test.ts`, `.../wip-library/_components/{wip-definition-detail.client.tsx,wip-labels.ts}`, `apps/web/app/(npd)/pipeline/[projectId]/formulation/_actions/load-recipe-cascade.ts`(+test), `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/formulation/_components/formulation-editor.tsx`, `apps/web/i18n/en.json`, `apps/web/i18n/pl.json`

## PYTANIA KRYTYCZNE (odpowiedz per tor)
1. **T1 migracja**: czy `packages/db/src/migrations/510-*.sql` to DUPLIKAT (kanoniczny runner `scripts/migrate.ts` / drizzle `out: ./migrations` skanuje `packages/db/migrations/`)? Czy podwójny plik spowoduje double-apply/błąd? Który zostawić.
2. **T1**: czy `invite.ts` w `apps/web/actions/users/` to ŻYWA akcja wpięta w prod invite flow? Czy `replaceInvitedUserSiteScope` faktycznie utrwala `user_sites` i czy `isUserSiteAccessUnrestricted` teraz zwraca false? Czy resolucja site po `name` jest org-scoped i deny-by-default (0/>1 = odrzucenie)?
3. **T2**: czy `app/(npd)/pipeline/_actions/approve-project-gate.ts` to ŻYWY kod wpięty w prod approve (nie legacy)? Czy `evaluateStageGate` w `formal_approve` faktycznie blokuje e-sign przy niepełnym checklist? Czy override został naprawdę ograniczony do advisory + wymaga uprawnienia? Czy G4 operational criteria są objęte (T2 zgłosił wątpliwość).
4. **T3**: czy detekcja cyklu jest PRZED zapisem i pokrywa self- ORAZ multi-node? Czy fix cascade dotyczy właściwej powierzchni PF-R05-08 (stale-after-save + leaf-vs-maxdepth)?
5. **Kolizje**: czy `apps/web/i18n/en.json`/`pl.json` mają spójny, poprawny JSON (T3 je edytował — sprawdź czy nie rozjechane)? Czy tory nie nadpisały sobie plików?
6. Każdy dodany test: czy faktycznie FAILuje bez fixa i PASSuje z fixem (logicznie)?

## OUTPUT (na stdout):
Dla każdego toru T1/T2/T3: **VERDICT** = SOLID | NEEDS-FIX | BLOCKER, z konkretami (plik:linia, na czym polega problem, jak naprawić). Na końcu: lista BLOCKERÓW (muszą być naprawione przed deployem) vs NICE-TO-HAVE.

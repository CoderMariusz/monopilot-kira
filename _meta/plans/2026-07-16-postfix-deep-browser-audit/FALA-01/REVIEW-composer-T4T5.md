# CROSS-REVIEW (Composer) — FALA 1, tory T4–T5 (kod Codexa) — monopilot-kira

ROLA: Adwersarialny senior reviewer. **READ-ONLY — NIE edytuj, NIE commituj, NIE odpalaj testów/build/git.** Tylko raport findingów.
To są **P0 safety/e-sign fixy** (21 CFR Part 11, LOTO/zero-energy = ryzyko życia) → najwyższy próg pewności. Szukaj: bypass atomowości/dual-sign, ten sam aktor spełnia oba podpisy, słaby Start gate, mutacja podpisanego subjectu, migracja niespójna ze schematem, walidacja tylko client-side, zły RLS, edycja martwego/legacy pliku, regresja istniejących flows.

REPO: /Users/mariuszkrawczyk/Projects/monopilot-kira (= CWD). Diff obejrzyj sam: `git --no-pager diff -- <pliki>` + `git --no-pager diff HEAD -- packages/db/migrations/514-maintenance-loto-dual-sign.sql packages/db/schema/maintenance.ts`.

## KONTEKST FINDINGÓW (spec)
- **T4 / PF-R06-01 P0**: edycja in-review FactorySpec NIE unieważniała e-sign → podpis na innej treści. Fix Codexa: edycja tworzy nową rewizję `in_review`, archiwizuje starą, append-only receipt (immutable subject). **PF-R06-14 P1**: reopen bundle ukrywał e-sign/receipty → loader pomijał `e_sign_log` + cache; fix odświeża i pokazuje historyczne.
- **T5 / PF-R20-02 P0**: jeden signer weryfikował zero-energy i startował LOTO-MWO. Fix Codexa: atomowy `dualSign` (dwaj różni aktorzy + session nonce, oba receipt IDs, izolacja), twardy Start gate. **PF-R20-05 P1**: calibration reviewer-UUID dead-end → org-scoped searchable Select z re-walidacją server-side.

## PLIKI DO PRZEGLĄDU
T4: `apps/web/app/[locale]/(app)/(modules)/technical/factory-specs/actions/factory-spec-lifecycle.ts`(+test), `.../factory-specs/_actions/bundle-data.ts`(+test), `.../factory-specs/_components/release-bundle-panel.client.tsx`(+ui test)
T5: `apps/web/app/[locale]/(app)/(modules)/maintenance/_actions/mwo-actions.ts`, `.../mwo-types.ts`, `.../maintenance/_components/mwo-loto-modal.tsx`, `.../mwos/[id]/_components/mwo-detail.client.tsx`, `.../mwos/[id]/page.tsx`, `.../maintenance/_components/mwo-detail-labels.ts`, `.../calibration/_actions/{calibration-esign.ts,list-calibration.ts}`, `.../calibration/_components/{calibration-register.client.tsx,record-calibration-modal.tsx}`, `.../calibration/page.tsx`, `packages/db/schema/maintenance.ts`, `packages/db/migrations/514-maintenance-loto-dual-sign.sql`, `apps/web/i18n/{en,pl}.json` (T5 dodał klucze) + tests (`mwo-loto-signing.pg.test.ts`, `mwo-actions.test.ts`, `mwo-detail.test.tsx`)

## PYTANIA KRYTYCZNE (odpowiedz per tor)
1. **T5 dualSign atomowość**: czy dwa podpisy zero-energy MUSZĄ pochodzić od RÓŻNYCH `user_id` I różnych sesji (nonce)? Czy da się to obejść (ten sam aktor 2×, replay nonce, TOCTOU między sign a Start)? Czy `dualSign` jest w JEDNEJ transakcji (atomowy)?
2. **T5 Start gate**: czy Start MWO jest TWARDO zablokowany dopóki nie ma kompletnej pary distinct-signer? Czy istnieje ścieżka startu z pominięciem gate (inny endpoint/akcja)?
3. **T5 migracja 514**: czy SQL jest spójny ze zmianą `schema/maintenance.ts` (kolumny/typy)? Czy zaaplikuje się czysto na istniejącej DB (brak konfliktu z danymi, np. `MWO-2026-00003` in-progress)? Czy jest idempotentna/bezpieczna?
4. **T5 calibration**: czy reviewer list jest org-scoped + tylko aktywni/uprawnieni, i czy server RE-waliduje wybór (nie ufa clientowi)? Czy dead-end zniknął?
5. **T4 immutability**: czy PO podpisie treści specyfikacji NIE DA SIĘ zmutować w miejscu (tylko nowa rewizja)? Czy stary podpis jest jednoznacznie unieważniony/oznaczony? Czy reopen faktycznie pokazuje historyczne receipty (nie kasuje)?
6. **T4/T5**: RLS `org_id`+`app.current_org_id()`? Regresja istniejących flows (edycja MWO/civil date, calibration same-actor-reject, factory-spec release)? Testy walidują FAKTYCZNĄ poprawkę (failują bez fixa)?

## OUTPUT (na stdout):
Dla każdego toru T4/T5: **VERDICT** = SOLID | NEEDS-FIX | BLOCKER, konkrety (plik:linia, problem, fix). Na końcu: lista BLOCKERÓW (przed deployem) vs NICE-TO-HAVE.

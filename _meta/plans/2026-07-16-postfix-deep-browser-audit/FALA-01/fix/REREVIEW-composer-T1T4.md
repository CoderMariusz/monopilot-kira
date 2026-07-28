# RE-REVIEW (Composer) — fixy Codexa: FIX-T1 (invite P0) + FIX-T4 (factory-spec) — monopilot-kira

ROLA: Adwersarialny reviewer. **READ-ONLY — NIE edytuj/commituj/testuj/git.** Tylko raport. Diff: `git --no-pager diff -- apps/web/actions/users/invite.ts apps/web/actions/users/invite.behavior.test.ts apps/web/app/[locale]/(app)/(modules)/technical/factory-specs/actions/factory-spec-lifecycle.ts`.

To druga iteracja P0 fixów (Codex naprawił blockery znalezione w pierwszej rundzie). Zweryfikuj że NAPRAWDĘ domknięte i nie wprowadzono regresji.

## FIX-T1 — invite.ts (P0 cross-site). Potwierdź:
1. **B1 identity**: `public.users.id` = auth UUID z `generateLink` (`mintInviteLink` zwraca `authUserId`), insert z `id=$1`, `user_sites` na `authUserId`. Guard `invitedUserId === authUserId`. Czy resend (existing) też spójny? Czy nie ma ścieżki tworzącej usera z random id?
2. **B2 rollback**: błąd zapisu scope → `throw` propaguje POZA `withOrgContext` (ROLLBACK), mapowanie `persistence_failed` w zewnętrznym catch. Czy na pewno żaden user NIE zostaje utrwalony gdy scope-write failuje? Czy zewnętrzny catch nie połyka INNYCH błędów przez pomyłkę?
3. **B3 cast**: `resolveInviteSiteId` — nazwa NIE rzutowana na uuid (`$1 = UUID_RE.test(site) ? site : null`, nazwa jako `$2::text`). Czy działa dla nazwy, site_code i uuid? `limit 2` + odrzucenie ambiguity zachowane?
4. **B4 deny-default**: rola nie-all-site bez site → `invalid_input`; `ALL_SITE_AUTHORITY_ROLE_SLUGS` (z `role-grant-guards`) poprawnie użyte dla `effectiveRoleSlug` (existing?.role_slug ?? role.slug). Czy lista slugów jest właściwa (nie za szeroka/wąska)? Czy nie blokuje legalnych adminów org-wide?
5. **Test**: czy naprawiony „Warsaw Plant" i nowe testy B1-B4 są logicznie poprawne (failują bez fixa)?

## FIX-T4 — factory-spec-lifecycle.ts. Potwierdź:
6. Czy `saveFactorySpecVersion` FAKTYCZNIE blokuje podpisany `in_review` PRZED jakimkolwiek zapisem (nie ma okna gdzie archiwizuje/tworzy draft mimo podpisu)? Czy `updateFactorySpec` (poprawna ścieżka) nietknięty? Czy błąd jest czytelny?

## OUTPUT: per fix **VERDICT** = SOLID | NEEDS-FIX | BLOCKER + konkrety (plik:linia). Lista pozostałych BLOCKERÓW (jeśli są) lub „brak — gotowe do deployu".

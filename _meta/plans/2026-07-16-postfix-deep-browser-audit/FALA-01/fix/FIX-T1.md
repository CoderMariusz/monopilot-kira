# FIX-T1 (Codex, eskalacja) — invite site-scope P0: 4 realne blockery — monopilot-kira

ROLA: Senior dev. Napraw 4 potwierdzone blockery w `apps/web/actions/users/invite.ts` (P0 cross-site security). TYLKO KOD. NIE odpalaj testów/build/lint/git. NIE commituj, NIE `git add`. Orchestrator odpala bramkę po Tobie.
REPO: /Users/mariuszkrawczyk/Projects/monopilot-kira (= CWD). RLS: `org_id`+`app.current_org_id()`.

KONTEKST: pierwsza wersja fixa (Composer) przeszła cross-review Codexa i ma 4 realne bugi. Napraw je root-cause. Wzór poprawny obok: `apps/web/actions/users/create-user-with-password.ts` (przeczytaj ~l.238-260).

## BLOCKERY DO NAPRAWY (wszystkie potwierdzone w kodzie)

### B1 — Zła tożsamość: `public.users.id` musi = `auth.users.id`
`invite.ts` insertuje `public.users` BEZ `id` (l.223-229 → random gen_random_uuid), a `mintInviteLink` (l.351-360) ODRZUCA `linkResponse.data.user.id`. Skutek: `user_sites` przypięte do losowego id ≠ auth id → przy loginie `withOrgContext` (`select … from public.users where id = auth_user_id`) NIE znajduje usera → scope nie egzekwowany / login się wywala. Invariant explicite w `create-user-with-password.ts:243`.
**FIX:** `mintInviteLink` musi zwrócić `linkResponse.data.user.id` (auth UUID). Insert `public.users` z `id = authUserId` (jak create-user-with-password). `user_sites.user_id` = ten sam auth UUID. Ścieżka resend (existing) używa `existing.id` (dla poprawnie utworzonych = auth id).

### B2 — Fake rollback: throw połknięty w callbacku → COMMIT
`try { … replaceInvitedUserSiteScope → throw INVITE_SITE_SCOPE_FAILED … } catch { return persistence_failed }` (l.177-259). `return` z callbacku `withOrgContext` = **COMMIT** → user z l.223 zostaje BEZ scope. 
**FIX:** błąd zapisu scope MUSI wypropagować POZA callback transakcyjny (żeby `withOrgContext` zrobił ROLLBACK). Mapowanie na `persistence_failed` dopiero NA ZEWNĄTRZ (owiń wywołanie `withOrgContext` w try/catch w `inviteUser` i tam przetłumacz znany błąd). Żaden user nie może zostać utrwalony gdy zażądano site a scope się nie zapisał.

### B3 — Nazwa site rzutowana na uuid → crash
`resolveInviteSiteId` (l.282-295): `($1::boolean and s.id = $2::uuid)` gdzie `$2 = site` może być nazwą ("Warsaw Plant"). Postgres rzuci `invalid input syntax for type uuid` przy bindzie/eval (AND nie chroni castu). UI wysyła NAZWĘ → invite z site crashuje.
**FIX:** nie rzutuj nazwy na uuid. Przekaż osobny param uuid = `siteLooksLikeUuid ? site : null` i porównuj `s.id = $uuid::uuid` (null nigdy nie dopasuje), a nazwę/site_code osobno jako `::text`. Zachowaj `limit 2` + odrzucenie przy `rows.length !== 1` (ambiguity).

### B4 — deny-by-default: brak site dla roli site-restricted
`site` opcjonalny (l.80), scope zapisywany tylko gdy `inviteSiteId` (l.198/239) — brak wymuszenia, że rola ograniczona do site MUSI mieć site (0 wpisów = unrestricted).
**FIX:** ustal z modelu ról, które role są org-wide/all-site (znajdź wskaźnik — np. permission org-wide albo brak site-scoping). Dla roli SITE-RESTRICTED bez rozwiązanego site → odrzuć (`invalid_input`/nowy kod). Brak site dopuszczalny WYŁĄCZNIE dla jawnie org-wide roli. Nie psuj zaproszeń adminów org-wide.

## TESTY
- Napraw CZERWONY istniejący test: `invite.behavior.test.ts:~213` ("Warsaw Plant") — teraz resolver zwróci `invalid_input` bo brak mocka `siteByName`. Ustaw mock rozwiązania site po nazwie ALBO dostosuj oczekiwanie do nowego kontraktu.
- Dodaj test REALNY: (a) zapis scope failuje → user NIE utrwalony (rollback), (b) `public.users.id === auth user id` po invite, (c) rola site-restricted bez site → odrzucona. Wzoruj się na istniejących `invite.test.ts`/`invite.behavior.test.ts`. NIE uruchamiaj.

## MIGRACJA: raczej NIEPOTRZEBNA (fix kodowy). Jeśli KONIECZNA — `packages/db/migrations/515-<opis>.sql`. Istniejące niespójne invite'y (id≠auth) = tylko odnotuj w UNCERTAINTIES, nie rób ryzykownej data-migracji.

## OUTPUT: ## FILES TOUCHED / ## FIX per blocker (B1-B4 → zmiana) / ## MIGRATION / ## TEST / ## UNCERTAINTIES

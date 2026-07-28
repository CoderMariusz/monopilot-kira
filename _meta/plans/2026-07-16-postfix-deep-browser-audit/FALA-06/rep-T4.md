# FALA-06 / TOR T4 — Raport: Zaproszenia (R01-05, R01-06)

## Atrybucja — droga (b): `audit_log`

**Wybrano odczyt z `audit_log`, nie migrację `users.invited_by`.**

Uzasadnienie:
- `invite.ts` już zapisuje `settings.user.invited` z `actor_user_id` i `resource_id = invited user id` — dane są w audycie, tylko lista ich nie czytała.
- Brak nowej migracji / backfillu; mniejszy diff i brak ryzyka checksumu migracji na Vercel.
- `LATERAL` join po pierwszym wpisie `settings.user.invited` na wiersz jest bezpieczny wydajnościowo przy rozmiarze listy zaproszeń (dziesiątki wierszy na org, nie pełny katalog użytkowników).

Implementacja: `invitations-lifecycle.ts` — `INVITATION_AUDIT_JOIN` + `resolveInvitedByAttribution()` zwraca `invitedByAttribution: 'user' | 'system' | 'unknown'`.

## Dane historyczne bez aktora

**Backfill niemożliwy** — przed tą zmianą aktor nigdy nie był zapisywany w kolumnie użytkownika, a starsze zaproszenia mogą nie mieć wpisu `settings.user.invited` w `audit_log`.

Zasada wyświetlania:
| Sytuacja | Etykieta |
|---|---|
| `audit_log.actor_type = 'system'` | **System** (prawda audytowa) |
| `actor_user_id` + imię/e-mail invitera | **konkretny użytkownik** |
| brak wpisu audytu / brak aktora | **Unknown** / **Nieznany** (PL) — **nie** „System" |

## Definicja listy zaproszeń (Gap A/B/C)

**Było:** `(invite_token IS NOT NULL OR invite_token_expires_at IS NOT NULL OR is_active = true)` — łapało **wszystkich** aktywnych członków org jako `accepted`; revoke zerował oba tokeny → wiersz znikał; UI odrzucało status `revoked`.

**Jest:** wiersz należy do listy zaproszeń, gdy:
1. `invite_token IS NOT NULL` (pending), **lub**
2. `invite_token_expires_at IS NOT NULL` (expired / revoked z zachowanym terminem), **lub**
3. istnieje wpis audytu `settings.user.invited` / `invitation_resent` / `invitation_revoked` dla `resource_id = user.id` (accepted po wyczyszczeniu tokenów, revoked sprzed poprawki revoke).

**Status:**
- `accepted` — `is_active = true` (tylko wśród wierszy spełniających filtr powyżej)
- `revoked` — `invite_token IS NULL` i nieaktywny
- `expired` / `pending` — bez zmian semantycznych

**Revoke:** czyści tylko `invite_token`, **zostawia** `invite_token_expires_at` jako ślad audytowy.

## R01-05 — odkrywalność trasy

- Pozycja **Invitations** w grupie Access (`settings-nav.ts`), route `/settings/invitations`.
- Filtrowanie: `filterSettingsNavGroups(..., { canManageInvitations })` — ukryta bez `settings.users.invite` (`settings/layout.tsx`).
- Link **Manage invitations** na ekranie Users & roles (`users-screen.client.tsx`) gdy `canInviteUsers`.

## Testy (napisane, nie uruchamiane)

| Plik | Co sprawdza |
|---|---|
| `lib/navigation/__tests__/settings-nav.test.ts` | pozycja Invitations w manifeście |
| `lib/navigation/__tests__/settings-nav-filter.test.ts` | widoczność nav przy/brak `settings.users.invite` |
| `actions/users/invitations-lifecycle.test.ts` | lista, atrybucja unknown, revoked, brak native active users, revoke bez czyszczenia expiry |
| `settings/invitations/page.test.tsx` | revoked badge, atrybucja user/unknown/system |
| `settings/users/users-screen.client.test.tsx` | link Manage invitations |

## Czego NIE jestem pewien

1. **Indeks pod `audit_log (org_id, resource_id, action)`** — join jest poprawny semantycznie; przy bardzo dużej historii audytu może wymagać dedykowanego indeksu (nie dodawany w tym torze).
2. **Zaproszenia sprzed wprowadzenia audytu `settings.user.invited`** — pokażą się tylko jeśli mają token/expiry; inaczej znikną z listy (backfill z audytu niemożliwy).
3. **Revoke sprzed tej zmiany** (oba tokeny już wyzerowane, brak audytu revoke) — nadal nierozróżnialne od „nigdy nie istniało"; nowe revokes zostają widoczne.

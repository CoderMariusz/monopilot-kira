# FALA-06 / FIX-ID — zaproszenia + Printers (post cross-review)

Repo: `monopilot-kira`, branch `main`. Bramka testów/buildu pozostawiona orchestratorowi.

---

## [I-1 · P1] Join audytowy — `text` vs `uuid` + `created_at` vs `occurred_at`

**Status:** naprawione w `apps/web/actions/users/invitations-lifecycle.ts`.

- Porównanie: `al.resource_id = u.id::text` (kolumna `audit_log.resource_id` jest `text`).
- Sortowanie pierwszego wpisu zaproszenia: `ORDER BY al.resource_id, al.occurred_at ASC` (nie `created_at`).
- Filtr `al.resource_type = 'user_invitation'` w CTE i w gałęzi `EXISTS`.

**Test kontraktu:** `invitations-lifecycle.test.ts` → `describe('invitation audit SQL contract')` — failuje przy powrotu do `u.id` bez `::text` lub `al.created_at`.

---

## [I-2 · P1] Skalowanie zapytania audytowego

**Status:** naprawione — jednokrotny CTE zamiast `LATERAL … LIMIT 1` per wiersz użytkownika.

**Nowy kształt (lista + lookup):**

```sql
WITH invite_creator AS (
  SELECT DISTINCT ON (al.resource_id)
         al.resource_id,
         al.actor_user_id,
         al.actor_type
    FROM public.audit_log al
   WHERE al.org_id = $1::uuid
     AND al.resource_type = 'user_invitation'
     AND al.action = 'settings.user.invited'
   ORDER BY al.resource_id, al.occurred_at ASC
)
SELECT …
  FROM public.users u
  …
  LEFT JOIN invite_creator ON invite_creator.resource_id = u.id::text
  LEFT JOIN public.users inviter ON …
 WHERE …
   AND (
     u.invite_token IS NOT NULL
     OR u.invite_token_expires_at IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM public.audit_log al
        WHERE al.org_id = u.org_id
          AND al.resource_type = 'user_invitation'
          AND al.resource_id = u.id::text
          AND al.occurred_at >= u.created_at
          AND al.action IN (…)
       LIMIT 1
     )
   )
 ORDER BY u.created_at DESC, u.email ASC
```

`EXISTS` ma `occurred_at >= u.created_at` dla pruning partycji; indeks `(resource_type, resource_id, occurred_at)` nie był dodawany w tym fixie.

---

## [I-3 · P1] Cofnięte zaproszenie → fałszywa reaktywacja / `accepted`

**Status:** naprawione.

| Warstwa | Zmiana |
|---------|--------|
| `invitations-lifecycle.ts` | (bez zmiany logiki statusu — revoke już nie ustawia `is_active`) |
| `settings/users/page.tsx` | `invitationState()` zwraca `'revoked'` gdy `!invite_token && invite_token_expires_at` |
| `users-screen.client.tsx` | wiersz `revoked` nie pokazuje „Reactivate” (tylko „No actions”) |
| `actions/users/reactivate.ts` | odrzuca gdy `invite_token_expires_at` ustawione bez tokenu; UPDATE wymaga `invite_token_expires_at IS NULL` |

**Test:** `reactivate.behavior.test.ts` — `rejects revoked invitations that cleared the token but kept expiry metadata`.

---

## [I-4 · P1] Deterministycznie czerwony test listy

**Status:** naprawione w `invitations-lifecycle.test.ts`.

Fake klient sortuje wynik listy jak SQL: `invited_at DESC`, `email ASC` (mapowane na pole `invited_at` fixture).

---

## [I-5 · P2] Nawigacja — `settings.users.invite` bez `canViewAdminSettings`

**Status:** naprawione w `lib/navigation/settings-nav.ts`.

Gdy `canViewAdminSettings: false` i `canManageInvitations: true`, filtr dokleja grupę `access` **tylko z pozycją Invitations** (obok `myAccount`).

**Test:** `settings-nav-filter.test.ts` — `shows the Invitations nav item when the caller can manage invitations without org-settings read`.

---

## [I-6 · P2] i18n `ro` + `uk`

**Status:** uzupełnione w `apps/web/i18n/ro.json` i `uk.json`:

- `settings.users_screen.manage_invitations`
- `settings.invitations.unknown`
- `settings.invitations.revokedImmutable`
- `settings.invitations.status.revoked`
- `Navigation.settings.items.invitations` (oba bloki `items` w Navigation)

**Test:** `settings-nav.test.ts` — pętla locale `["en", "pl", "ro", "uk"]`.

**Programowa weryfikacja (`JSON.parse` / node):**

```
en settings.users_screen.manage_invitations => Manage invitations
en settings.invitations.unknown => Unknown
en settings.invitations.revokedImmutable => Revoked invitation is immutable.
en settings.invitations.status.revoked => Revoked
en Navigation.settings.items.invitations => Invitations
pl settings.users_screen.manage_invitations => Zarządzaj zaproszeniami
pl settings.invitations.unknown => Nieznany
pl settings.invitations.revokedImmutable => Cofnięte zaproszenie jest niezmienne.
pl settings.invitations.status.revoked => Cofnięte
pl Navigation.settings.items.invitations => Zaproszenia
ro settings.users_screen.manage_invitations => Gestionează invitațiile
ro settings.invitations.unknown => Necunoscut
ro settings.invitations.revokedImmutable => Invitația revocată este imuabilă.
ro settings.invitations.status.revoked => Revocată
ro Navigation.settings.items.invitations => Invitații
uk settings.users_screen.manage_invitations => Керувати запрошеннями
uk settings.invitations.unknown => Невідомо
uk settings.invitations.revokedImmutable => Скасоване запрошення незмінне.
uk settings.invitations.status.revoked => Скасовано
uk Navigation.settings.items.invitations => Запрошення
```

---

## [I-7 · P2] Revoked — podwójny komunikat UI

**Status:** naprawione w `invitations-screen.client.tsx`.

Warunek `lifecycleUnavailable` wyklucza `invitation.status === 'revoked'` (obok `accepted`).

---

## [I-8 · P2] Testy Printers — bez realnego RSC

**Status:** testy doprecyzowane; **`page.tsx` nietknięty**.

- `page-rsc.test.ts`: wymaga `'use server'` w `deletePrinterAction` i `return removePrinter({ id: printerId })`.
- `page.test.tsx`: test przemianowany na `renders list, empty, and error states without crashing` (bez obietnicy error-boundary / Flight).

RTL nadal woła `Page(props)` bez Flight — to świadome ograniczenie kontraktu RTL; produkcyjna naprawa RSC pozostaje w `page.tsx`.

---

## Czego NIE jestem pewien

1. **Pruning partycji `audit_log`** — CTE nadal skanuje wszystkie wpisy `settings.user.invited` w orgu (bez okna czasowego). `EXISTS` ma `occurred_at >= u.created_at`, ale CTE invite_creator nie — przy bardzo dużej historii audytu może być kosztowne; indeks / okno czasowe w CTE to osobna optymalizacja.
2. **KPI „Disabled” na Users** — cofnięte zaproszenie nadal liczy się w `disabled_users` (`invite_token IS NULL`), choć UI nie oferuje reaktywacji; może wymagać osobnego KPI lub statusu wizualnego „Revoked”.
3. **`resource_type` w starszych wpisach audytu** — jeśli historyczne `settings.user.invited` nie mają `resource_type = 'user_invitation'`, atrybucja „Invited by” może pokazać `unknown` (nowe wpisy z `writeAuditLog` są poprawne).
4. **Pełna serializacja RSC w testach Printers** — bez uruchomienia Flight/build nie weryfikowaliśmy rzeczywistego przekroczenia granicy komponentu; tylko kontrakt źródła + RTL z injektowanymi propsami.

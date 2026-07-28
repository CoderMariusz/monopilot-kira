# FALA 5 / TOR T4 — Identity: R01-03 + R01-04

## Podsumowanie zmian

Naprawiono nieświeże listy po mutacjach zaproszeń (R01-03) oraz fałszywą dezaktywację pending invite (R01-04). Źródłem prawdy pozostaje baza; klient odświeża RSC przez `revalidateLocalized` + `router.refresh()`.

---

## Tabela rewalidacji tras (po fixie)

| Akcja | Plik | `/settings/users` | `/settings/invitations` |
|---|---|---|---|
| `inviteUser` | `actions/users/invite.ts` | ✅ | ✅ |
| `resendInvitation` | `actions/users/invitations-lifecycle.ts` | ✅ | ✅ |
| `revokeInvitation` | `actions/users/invitations-lifecycle.ts` | ✅ | ✅ |
| `deactivateUser` | `actions/users/deactivate.ts` | ✅ | — |
| `reactivateUser` | `actions/users/reactivate.ts` | ✅ (już było) | — |
| `assignRole` / `assignUserSites` / `resetUserMfa` | odpowiednie pliki | ✅ (wzorce bez zmian) | — |

`router.refresh()` dodatkowo w: `InviteDialog`, `DeactivateUserDialog`, `ReactivateUserDialog`, `users-screen` (resend/revoke), `invitations-screen` (resend/revoke).

---

## R01-03 — nieświeże listy

**Przyczyna:** cztery akcje mutujące stan użytkownika/zaproszenia nie wołały `revalidateLocalized`, a dialogi deactivate/invite nie robiły `router.refresh()` (w przeciwieństwie do `RoleAssignDialog` / `AssignSitesDialog`).

**Fix:** wzorzec z `assignRole` / `reactivateUser` — `revalidateLocalized` w try/catch po sukcesie persystencji; `router.refresh()` po sukcesie po stronie klienta.

---

## R01-04 — fałszywa dezaktywacja zaproszenia

### Dowód osiągalności odmowy `pending_invitation`

Ścieżka **przed fixem** (bug):

1. Wiersz `status === 'invited'` na `/settings/users` (bo `is_active=false` + `invite_token IS NOT NULL`).
2. UI: `isDisabled = (status === 'disabled')` → **false** → renderuje **Deactivate** (nie Reactivate).
3. Klik Deactivate → `deactivateUserAction` → `deactivateUser`.
4. UPDATE `… AND is_active = true` → **0 wierszy** (invite ma już `is_active=false`).
5. Fallback `existing.is_active === false` → **`{ ok: true }`** bez audytu/outboxu/rewalidacji.
6. `handleDeactivated` → optymistyczny `disabled` na liście.
7. Klik Reactivate → `reactivateUser` widzi `invite_token` → **`not_disabled`**.

Ścieżka **po fixie**:

1. Ten sam wiersz `invited`.
2. UI: `status === 'invited'` → **Resend / Revoke** (brak Deactivate).
3. Gdyby wywołano `deactivateUser` bezpośrednio: SELECT wykrywa `invite_token` → **`{ ok: false, error: 'pending_invitation' }`** przed UPDATE; brak optymistycznego `disabled`.

Test: `deactivate.behavior.test.ts` → `refuses deactivateUser when the target row still carries a pending invite_token`.

### Czy zaproszenie dało się zrealizować po „dezaktywacji" **przed** fixem?

**Tak — to jest miara powagi buga.**

`deactivateUser` nie dotykał `invite_token` ani `invite_token_expires_at`. UPDATE był ograniczony `is_active = true`, więc dla pending invite wykonywał się **0-row UPDATE**, a kod zwracał sukces na podstawie `is_active === false`. Zaproszenie pozostawało w pełni żywe:

- wiersz w `public.users` z nietkniętym `invite_token`,
- magic link nadal ważny do `invite_token_expires_at`,
- brak wpisu audytowego `settings.user.deactivated`.

Jedyną zmianą był **fałszywy stan UI** (optymistyczny `disabled`), nie stan bazy.

---

## Pliki zmienione

| Obszar | Pliki |
|---|---|
| Server Actions | `invite.ts`, `invitations-lifecycle.ts`, `deactivate.ts` |
| Users UI | `users-screen.client.tsx`, `page.tsx`, `InviteDialog.tsx`, `DeactivateUserDialog.tsx`, `ReactivateUserDialog.tsx` |
| Invitations UI | `invitations-screen.client.tsx` |
| Testy (pisane, nie uruchamiane) | `deactivate.behavior.test.ts`, `invite.behavior.test.ts`, `invitations-lifecycle.test.ts`, `users-screen.client.test.tsx` |

---

## Testy (RED → GREEN po fixie — do uruchomienia przez orchestratora)

| Test | Oczekiwanie |
|---|---|
| `deactivateUser` + `invite_token` | `{ ok: false, error: 'pending_invitation' }` |
| `deactivateUser` aktywny członek | anty-regresja bez zmian |
| wiersz `invited` | Resend/Revoke, brak Deactivate |
| `inviteUser` / `resend` / `revoke` / `deactivate` | asercja wywołań `revalidateLocalized` na właściwych trasach |

---

## Czego NIE jestem pewien

- Czy orchestrator uruchomi testy UI z mockiem `next/navigation` bez dodatkowej konfiguracji globalnej (wzorzec jak w innych ekranach settings).
- Etykiety Resend/Revoke na ekranie users używają fallbacków EN (`'Resend'` / `'Revoke'`) — brak dedykowanych kluczy w `settings.users_screen` i18n (świadomy minimalny diff; ekran `/settings/invitations` nadal używa `settings.invitations`).
- Zachowanie optymistycznego `disabled` dla **prawdziwej** dezaktywacji aktywnego użytkownika pozostaje (uzupełnione `router.refresh()`, nie usunięte) — pełne usunięcie optimistic state nie było w scope zadania.

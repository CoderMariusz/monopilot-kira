# FALA 1 — follow-upy (non-blocking, do kolejnej fali / rekonsyliacji)

## ✅ PF-R01-02 RESOLVED (prod-E2E, 3 fixy) — LEKCJA
`actions/security/upsert-policy.ts` = **łańcuch 3 pre-existing bugów** ukrytych przez unit-mocki, wykryty dopiero prod-E2E na Apex 22:
1. mig510 — `app.upsert_my_tenant_idp_policy` INSERT-ON-CONFLICT (był tylko UPDATE→false).
2. **mig515** — `public.users.requires_mfa_at` (kolumna której `forceAdminMfa`/`forceAllUsersMfa` oczekiwały, NIGDY nie utworzona → 42703).
3. **outbox aggregate_id** — 3 inserty hardkodowały `null` (kolumna NOT NULL → 23502) → orgId.
LEKCJA: akcja z wieloma zapytaniami + mocki DB = ślepa plama. **Dodać real-DB `.pg.test.ts` dla upsert-policy** (pełny happy-path save), inaczej regresje wracają. Prod-E2E > unit dla takich chainów.


Zebrane z cross-review + gate. NIE blokują deployu Fali 1 (P0 forward-path domknięty), ale do zaadresowania.

## T1 invite (P0 forward-path OK, resend = hardening)
- **Resend identity guard**: po `mintInviteLink` przy resend NIE ma guardu `existing.id === authUserId`; `authUserId` martwy na tej ścieżce. Dla userów utworzonych po fixie (id=auth uuid) OK; dla legacy mismatch — nie wykrywa. Dodać `if (existing.id !== authUserId) throw` (UWAGA: zweryfikować semantykę generateLink na resend — czy zwraca ten sam user.id — źle zrobiony guard zepsuje resend).
- **Resend fail-UPDATE**: `invite.ts:~216` przy fail UPDATE robi `return {persistence_failed}` zamiast `throw` → txn commit pusty, auth token już zmintowany (drift). Pre-existing. Ujednolicić na `throw InvitePersistenceError`.
- **Legacy invite'y `public.users.id ≠ auth.users.id`**: istniejące niespójne rekordy wymagają osobnej, kontrolowanej data-rekonsyliacji (nie ruszane w tej fali).

## T5 maintenance (SOLID, defense-in-depth)
- `eligibleLotoVerifiers(ctx, null)` nie wyklucza primary na serwerze (UI robi `ctx.userId`); self-verifier kończy jako `loto_same_actor` nie `invalid_verifier`. Property bezpieczeństwa TRZYMA (blokada jest), ale dodać `eligibleLotoVerifiers(ctx, ctx.userId)` + jawny guard.
- Release blokuje tylko `zero_energy_verified_by`, nie `lockout_applied_by` — do potwierdzenia z OSHA policy (test to zakłada zamierzone).

## T4 factory-spec (SOLID)
- Wybrano politykę BLOKADY podpisanego `in_review` w `saveFactorySpecVersion` (edycja przez `updateFactorySpec`). Alternatywa: ujednolicić na rewizję+audyt jak `updateFactorySpec`.

## Infra / środowisko (NIE regresje fali)
- **Lokalny pg**: `permission denied for schema public` — `pnpm db:migrate:local` pada, pg-testy (gate-approval-readiness/wip-cycle/mwo-loto-signing) NIE odpalone lokalnie. Migracje 510/514 zwalidowane PREPARE na owner-prod. Naprawić uprawnienia local db (GRANT na schema public dla `monopilot`) LUB polegać na CI/db:test.
- **~47 pre-existing failujących plików testowych na main@2eb57cf7** (baseline-diff potwierdził — NIE regresje fali): mocki (`getOwnerPool` brak w with-org-context mock, `supabase.auth.getUser is not a function`), seed (`ReceivePoError: unknown_currency`), UI (`stream.getVideoTracks`, brakujące testid wo-pause/waste/complete). Osobna fala „test-suite health" po restore.

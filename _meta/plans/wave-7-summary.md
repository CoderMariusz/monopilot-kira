# Wave 7 — Security fix summary (2026-07-10)

## Bug 1 (P0) — assignRole privilege escalation

**Hole:** `assignRole` gated only on `settings.roles.assign` and accepted any org role, including owner/admin. A delegated assigner could promote themselves or others to a stronger role.

**Fix:**
- Extracted shared grant guards to `apps/web/actions/users/role-grant-guards.ts` (reused by `create-user-with-password.ts` and `assign-role.ts`).
- Before mutation, reject privileged system roles (`SYSTEM_ROLE_CODES_FORBIDDEN_AS_DEFAULT`) unless the caller holds owner/admin/org_admin/org.access.admin.
- Enforce grant-subset: target role permissions must ⊆ caller permissions (super roles bypass, same as create-with-password).
- New typed error: `forbidden_privileged_role`. Last-owner guard unchanged.

**Proof:** `assign-role.behavior.test.ts` — privileged-role rejection + grant-subset escalation rejection.

---

## Bug 2 (P1) — user_metadata JWT fallback for session policy

**Hole:** `resolveEdgeSecurityContext` fell back to user-writable `user_metadata` for `idle_timeout_min`, `role`, and `onboarding_completed_at`, letting users forge a longer idle timeout or elevated role.

**Fix:** `apps/web/lib/auth/edge-middleware-policy.ts` now resolves those fields from `app_metadata` (or top-level JWT claims for role) only. Missing values use secure defaults (60 min idle, null onboarding). `org_id` also no longer falls back to `user_metadata`.

**Proof:** `edge-middleware-policy.test.ts` — forged `user_metadata.idle_timeout_min: 99999` + `role: admin` ignored; timeout stays 60, role stays `member`.

---

## Bug 3 (P1) — empty site assignment fail-open

**Hole:** `assignUserSites` accepted `siteIds: []`, deleting all `user_sites` rows. With mig 383 RLS, zero rows means unrestricted all-site access — silent privilege expansion.

**Fix (app-layer now):**
- `assign-user-sites.ts` refuses empty assignments unless the **target** user has explicit all-site authority (admin slug family from mig 383: owner/admin/org_admin/org.access.admin/org.platform.admin).
- New typed error: `empty_site_assignment_forbidden`.

**Migration 466 (comment-only):** `466-user-can-see-site-failopen-todo.sql` adds `COMMENT ON FUNCTION app.user_can_see_site` documenting the fail-open condition (3) and intended restrictive flip. **No function body change.**

---

## ⚠️ DEFERRED — RLS flip follow-up (DO NOT execute blindly)

`app.user_can_see_site` (mig 383) **still returns TRUE when a user has zero `user_sites` rows** (condition 3). The Wave 7 app-layer guard stops *new* empty assignments for ordinary users, but:

1. Existing users with zero rows remain unrestricted at the RLS layer.
2. Any code path that bypasses `assignUserSites` and deletes rows could still expand access.
3. Flipping condition (3) to restrictive semantics **without a backfill** would hide rows for users currently relying on fail-open behavior.

**Required staged rollout (per mig 382 note):**
1. Backfill `user_sites` for every non-admin user who should be site-restricted.
2. Deploy app-layer guards (this wave).
3. Monitor / grace window.
4. Ship a **separate** migration that changes `app.user_can_see_site` body — remove zero-row fail-open, keep admin-slug bypass (condition 2) as the only unrestricted path.

See migration `466-user-can-see-site-failopen-todo.sql` COMMENT for the canonical TODO anchor.

---

## Gates

```
pnpm --filter web exec tsc --noEmit          # clean
pnpm --filter web exec vitest run \
  actions/users/assign-role.behavior.test.ts \
  actions/users/assign-user-sites.behavior.test.ts \
  lib/auth/edge-middleware-policy.test.ts    # 19 passed
```

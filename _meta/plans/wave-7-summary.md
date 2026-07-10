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
- `assign-user-sites.ts` refuses empty assignments unless the **target** user has explicit all-site authority (mig 383 condition 2: admin slug family only — `org.access.admin` / `org.platform.admin` / `owner` / `admin` / `org_admin`).
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
4. Ship a **separate** migration that changes `app.user_can_see_site` body — remove zero-row fail-open, tighten admin-slug bypass (condition 2), and **explicitly decide** whether conditions (1) null-user and (4) null-site remain fail-open (they are undecided; do not assume admin-slug is the only unrestricted branch).

See migration `466-user-can-see-site-failopen-todo.sql` COMMENT for the canonical TODO anchor.

---

## Gates

```
pnpm --filter web exec tsc --noEmit          # clean
pnpm --filter web exec vitest run \
  actions/users/assign-role.behavior.test.ts \
  actions/users/assign-user-sites.behavior.test.ts \
  lib/auth/edge-middleware-policy.test.ts    # 21 passed
```

---

## Fix round 1 (2026-07-10 — adversarial review)

### Bug 1 — code/slug-as-grant bypass (P0)

**Hole:** `readRolePermissions()` / `readCallerPermissions()` counted only `role_permissions` and JSONB `permissions`, but authorization gates also grant via `r.code` / `r.slug` matching a permission string. A caller with only `settings.roles.assign` could create a custom role with `code='settings.users.invite'` and empty stores, pass subset check (`[] ⊆ caller`), assign it, and gain invite capability.

**Fix:** Both effective-permission readers now union permission-shaped role `code` and `slug` (dotted strings gates match via `r.code = $3` / `r.slug = $3`) into the grant set. Subset check rejects the exploit.

**Proof:** `assign-role.behavior.test.ts` — custom `settings.users.invite` role with empty permission stores rejected when caller lacks that grant.

### Bug 3 — all-site authority predicate drift (P1)

**Hole:** `hasAllSiteAuthority()` used `r.code = any(...) or r.slug = any(...)`, broader than mig 383 condition (2) which is **slug-only**. A role with admin-family `code` but non-admin `slug` could clear site assignments while RLS would not treat them as unrestricted admin.

**Fix:** `hasAllSiteAuthority()` now uses the exact mig 383 slug predicate (`r.slug = any(array['org.access.admin', ...])`). Renamed constant to `ALL_SITE_AUTHORITY_ROLE_SLUGS`.

**Proof:** `assign-user-sites.behavior.test.ts` — empty `siteIds` refused when target slug is non-admin (even if code were admin-family).

### Migration 466 + deferred RLS wording

Corrected COMMENT and summary: admin-slug bypass (condition 2) is the explicit all-site authority path today, but conditions (1) null-user and (4) null-site remain fail-open and are **undecided** for the staged flip — follow-up must resolve them explicitly.

---

## Fix round 2 (2026-07-10 — test-harness gaps)

**Context:** `role-grant-guards.ts` dotted-code/slug subset logic is correct (`like '%.%'` excludes bare role identifiers). Three behavior tests failed because round-1 FakeClient matchers were stale.

**Fixes (tests/fixtures only — no production logic changes):**

1. **`assign-role.behavior.test.ts`**
   - `requirePermission` matcher no longer keys on bare `= $3` (SQL comments in `readCallerPermissions` falsely matched).
   - `readCallerPermissions` / `readRolePermissions` mocks now key on `select distinct grant as permission` and return dotted-code/slug-aware effective grants.
   - Success-case assertion targets the `select true as ok` requirePermission query, not subset queries that legitimately reference `r.slug`.

2. **`assign-role.behavior.test.ts` (last-owner)** — with corrected subset mocks, default fixture caller (`settings.roles.assign`) legitimately reaches the last-owner SQL guard; assertion unchanged.

3. **`create-user-with-password.behavior.test.ts`** — same grant-query matcher + dotted semantics; subset escalation test now rejects `settings.org.read` when caller holds only `settings.users.invite`.

**Gates:** `tsc --noEmit` clean; 42/42 vitest across assign-role, create-user-with-password, assign-user-sites, edge-middleware-policy.

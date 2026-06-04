# PROPOSED TASK — foundation-004: Add production guard to withOrgContext app-pool factory

**Type:** T2-api (small hardening) + test
**Module:** 00-foundation
**Priority:** P2
**Evidence:** `_meta/runs/sidecar/reports/foundation-audit.md` §P2

## Why
`apps/web/lib/auth/with-org-context.ts:103-118` `getAppPool()` falls back, when
`DATABASE_URL_APP` is unset, to rewriting `DATABASE_URL`'s username to `app_user`
with a hardcoded test password `'app-user-test-password'`. The canonical sibling
`packages/db/src/clients.ts:16-22` (`getAppConnection`) guards this exact case
with `throw if NODE_ENV==='production' && !VITEST && !DATABASE_URL_APP`.
`withOrgContext` wraps every data-plane Server Action but omits the guard, so a
prod deploy missing `DATABASE_URL_APP` silently attempts a guessable-password
`app_user` connection instead of failing fast.

## Scope (rough)
- Add the same production fail-fast guard to `getAppPool()` (and consider
  `getOwnerPool()` for symmetry).
- Prefer reusing `getAppConnection`'s guarded logic over duplicating the
  username-rewrite in two places (DRY the test-fallback).

## Acceptance
- With `NODE_ENV=production`, `VITEST` unset, `DATABASE_URL_APP` unset →
  `withOrgContext` throws a clear "DATABASE_URL_APP must be set in production"
  error (test asserts this), instead of building a hardcoded-password pool.
- Test-mode behavior (VITEST set) unchanged — fallback still works for CI.

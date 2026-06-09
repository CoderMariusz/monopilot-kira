# SUPERSEDED — these are review INPUTS, not unmerged fixes

Verified 2026-06-09 (adversarial re-review, session 5e8a4217): the `diff-*.patch`
files here are the Gate-4 review-input diffs (the code *as reviewed*, containing
the two P0s) — NOT the remediation patches. The actual fixes shipped in commit
`2a028643` (ancestor of main):

- **P0 RBAC overgrant** (`org.schema.admin` in the full-admin family, mig 150) →
  fixed forward by `packages/db/migrations/155-schema-admin-sod-revoke.sql`
  (revoke from role_permissions + legacy jsonb; trigger order 150→155 verified
  live; `packages/db/__tests__/schema-admin-sod-revoke.test.ts` 6/6 GREEN).
- **P0 open redirect** (`returnTo`) → fixed in
  `apps/web/app/[locale]/(app)/(npd)/products/new/product-create-wizard.client.tsx`
  (`safeReturnTo`: decode → reject `//`/backslash/control chars → same-origin URL
  resolve; wizard test 9/9 GREEN incl. the exact bypass payloads). No other live
  redirect sink is user-controlled (login redirects are hardcoded).

`git apply --check` FAILS for these diffs on main (add-only diffs of existing
files). Do NOT apply them. Safe to delete this directory entirely.

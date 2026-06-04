# PROPOSED TASK — [P1] Reconcile permission strings to the enum + lock the consumer side

**Module:** 02-settings · **Severity:** P1 · **Source:** side-car audit F2

## Problem
Code checks permission strings that are NOT in `packages/rbac/src/permissions.enum.ts`:
- `settings.infra.read` / `settings.infra.update` (enum has `settings.infra.view` / `.edit`)
- `settings.units.manage` (enum has NO `settings.units.*`)
- `settings.schema.admin / .edit / .manage` hedged in `settings/schema/page.tsx:161`.
The ESLint enum-lock (T-130) only protects the enum FILE; it does not catch consumer code checking non-enum strings,
so this whole class shipped green.

## Acceptance criteria
1. Decide canonical strings (recommended: keep enum `settings.infra.view/.edit`; ADD `settings.units.view/.manage`).
2. Refactor all consumers (`apps/web/app/[locale]/(app)/(admin)/settings/**`, `apps/web/actions/**`) and all RBAC
   seed migrations to use exactly the canonical strings.
3. New guard test: every string literal passed to a `hasPermission(...,'settings.*')`-style check under
   `apps/web/{app,actions}/**` is a member of the permissions enum. Failing build on drift.
4. `pnpm --filter web typecheck` + the new guard test green (captured output).

## Dependencies
- Coordinate with F1 (infra seed) so seed + code agree on the chosen spelling.

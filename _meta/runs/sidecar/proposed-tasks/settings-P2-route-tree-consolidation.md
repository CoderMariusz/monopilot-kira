# PROPOSED TASK — [P2] Finish dual settings route-tree consolidation + fix locale-hardcoded redirects

**Module:** 02-settings · **Severity:** P2 · **Source:** side-car audit F4 + F7

## Problem
W4 (STATUS.md:25-27) claimed all non-localized `(admin)/settings/**` duplicates were dropped. Two remain as FULL
duplicate client components (not redirects/re-exports), reachable as live routes and able to drift from canonical:
- `apps/web/app/(admin)/settings/invitations/page.tsx` — full ~330-line component with its own `listInvitations` loader.
- `apps/web/app/(admin)/settings/reference/manufacturing-operations/page.tsx` — full table/DnD duplicate.

Separately, the redirect shims hardcode English:
- `apps/web/app/(admin)/settings/users/page.tsx:4` → `redirect('/en/settings/users')`
- `apps/web/app/(admin)/settings/security/page.tsx` → `redirect('/en/settings/security')`

## Acceptance criteria
1. Reduce the two remaining duplicates to redirect shims (or thin re-exports) pointing at the canonical localized
   screens `[locale]/(app)/(admin)/settings/{invitations, reference/manufacturing-operations}`.
2. Redirects preserve the active locale (use request locale or locale-less canonical path), not a hardcoded `/en/`.
3. Repoint `(admin)/settings/__tests__/admin-settings-guards.test.ts` to read the canonical localized sources for
   invitations + manufacturing-operations (currently reads the local duplicate).
4. `apps/web/e2e/route-topology.spec.ts` + guards test green (captured output).

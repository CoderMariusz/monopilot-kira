# PROPOSED STUB — m06 T-050: Seed scanner permission→role grants (RBAC reachability)

> Status: PROPOSAL (not in manifest). Closes BLOCKER B1 for 06-scanner-p1.
> Type: T1-schema (migration + seed). Depends: T-049 (enum strings).

## Why
T-049 adds 10 `scanner.*` strings + `ALL_SCANNER_PERMISSIONS` but **never grants them to a role**. Without `role_permissions` rows, every `requirePermission('scanner.access'|...)` 403s and the whole scanner is unreachable on the live deploy gate. Same class as npd/settings — fixed there only via separate seed migrations (146/148/149).

## Goal
Seed `role_permissions` grants per PRD §12.5 role hierarchy + wire scanner nav permission key.

## Implementation contract
1. New migration `1NN_scanner_role_permissions_seed.sql` (≥150, contiguous after HEAD 149) granting per §12.5:
   - `scanner.access` → all scanner roles (base)
   - `warehouse.operator` → SCN-020/030/031/040/060
   - `production.operator` → SCN-050/080/081/082/083/084
   - `quality.inspector` → SCN-070..073
   - `scanner.supervisor` → override authority (FEFO override approve, LP unlock, session terminate)
   - `scanner.admin` → PIN reset
   - org-admin role family → all scanner.* (mirror migration 149).
2. Wire `module-registry.ts` scanner module `permission_key` → `scanner.access` (currently null).
3. Confirm RLS on `scanner_audit_log` uses `org_id = app.current_org_id()` + site scoping (per §12.5) — not raw current_setting.

## Acceptance criteria
1. Given the migration runs, when role_permissions is queried for a fresh org, then each scanner.* permission maps to the §12.5 roles and org-admin holds all.
2. Given a quality.inspector-only user, when they open a warehouse receive workflow, then 403; when they open QA inspect, then allowed.
3. Given the scanner nav module, when rendered for a user lacking scanner.access, then it is gated (permission_key no longer null).

## Risk red lines
- Grants must be a DB migration (reach Supabase on deploy), not app-code only.
- Migration number ≥150 contiguous.
- Respect §12.5 least-privilege; only org-admin + scanner.admin get elevated sets.

# PROPOSED STUB — m05 T-059: Seed warehouse permission→role grants (RBAC reachability)

> Status: PROPOSAL (not in manifest). Closes BLOCKER B1 for 05-warehouse.
> Type: T1-schema (migration + seed). Depends: T-058 (enum strings).

## Why
T-058 adds 12 `warehouse.*` strings to `packages/rbac/src/permissions.enum.ts` + `ALL_WAREHOUSE_PERMISSIONS`, but **never grants them to any role**. Server-side `requirePermission('warehouse.*')` will 403 for every user → all warehouse screens build green but are unreachable on the live deploy gate. Prior modules required separate seed migrations: `146-npd-allergen-write-permission-seed.sql`, `148-settings-infra-permission-seed.sql`, `149-npd-permissions-org-admin-seed.sql` (pattern `INSERT INTO public.role_permissions (role_id, permission)`).

## Goal
Seed `role_permissions` grants for the 12 warehouse permissions per PRD §3 permission surface, and wire the warehouse nav module's permission key.

## Implementation contract
1. New migration `1NN_warehouse_role_permissions_seed.sql` (number ≥150, contiguous after current HEAD 149): `INSERT INTO public.role_permissions (role_id, permission)` mapping each `warehouse.*` string to the roles in PRD §3 "Permission surface" table:
   - Op Mag → grn.create, lp.split/merge, stock.move, fefo.override, scanner.consume
   - Kier Mag → + lp.block, adjustment.approve, dashboard.read, inventory.value
   - QA → lp.block, qa.status.change
   - Op Prod → stock.move, fefo.override, scanner.consume
   - Planner → dashboard.read, inventory.value (read)
   - Admin → all warehouse.* (+ force_unlock, settings)
   Also grant org-admin role family ALL warehouse.* (mirror migration 149 org-admin pattern).
2. Wire `apps/web/lib/navigation/module-registry.ts` warehouse module `permission_key` (currently null) to `warehouse.dashboard.read` (or the base read perm) so nav RBAC gating is no longer a no-op.

## Acceptance criteria
1. Given the seed migration runs, when role_permissions is queried for a fresh org, then each of the 12 warehouse.* permissions is granted to at least the roles in PRD §3, and org-admin holds all 12.
2. Given a user with only Op-Mag role logs in, when they hit a Kier-Mag-only action (e.g. adjustment.approve), then server returns 403; when they hit grn.create, then it is allowed (reachability proven both directions).
3. Given the warehouse nav module, when rendered for a user lacking warehouse.dashboard.read, then the warehouse nav item is hidden/gated (no longer null permission_key).

## Risk red lines
- Do not grant via app code only — grants must be in a DB migration (role_permissions) so they reach Supabase on deploy.
- Do not over-grant: respect PRD §3 least-privilege matrix; only org-admin gets the full set.
- Migration number ≥150 contiguous (avoid the silent-never-runs gotcha).

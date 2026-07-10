# Static security audit: Settings, auth, middleware, RLS

## Findings

### P1 — Delegated role assignment permits privilege escalation to owner/admin

Evidence: [apps/web/actions/users/assign-role.ts:74](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/users/assign-role.ts:74) requires only `settings.roles.assign`. The target-role query at [assign-role.ts:77](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/users/assign-role.ts:77) accepts every role in the organization, including owner/admin roles. The only privilege-related guard at [assign-role.ts:109](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/users/assign-role.ts:109) prevents removing the last owner; it does not prevent assigning owner or a role stronger than the caller.

A custom/delegated role holding `settings.roles.assign` can call this Server Action for itself or another user and select `owner`, `admin`, `org.access.admin`, or another privileged system role. The action then replaces the target’s roles at [assign-role.ts:116](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/users/assign-role.ts:116).

This conflicts with the explicit privileged-role denylist used by user creation/invitation at [user-role-policy.ts:10](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/users/user-role-policy.ts:10), and with the grant-subset protection already implemented for create-with-password.

Suggested fix: reject system/admin roles unless the caller already holds an authorized super-role, and otherwise enforce that the target role’s permission set is a subset of the caller’s effective permissions.

---

### P1 — User-editable JWT metadata can weaken the tenant idle-timeout policy

Evidence: middleware derives `idle_timeout_min` first from `app_metadata`, then from `user_metadata`, at [apps/web/lib/auth/edge-middleware-policy.ts:219](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/auth/edge-middleware-policy.ts:219) and [edge-middleware-policy.ts:233](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/auth/edge-middleware-policy.ts:233). Supabase user metadata is user-controlled; signature verification proves that Supabase issued the JWT, not that `user_metadata` is administrator-controlled.

That value is passed directly into the security decision at [apps/web/proxy.ts:181](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/proxy.ts:181), and becomes the expiry threshold at [apps/web/lib/auth/session-check.ts:157](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/auth/session-check.ts:157). A user can set a large positive `idle_timeout_min`, refresh their token, and turn a stricter tenant timeout into the hard-coded eight-hour maximum.

The same source-order issue affects `role` and `onboarding_completed_at` at [edge-middleware-policy.ts:222](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/auth/edge-middleware-policy.ts:222) and [edge-middleware-policy.ts:223](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/auth/edge-middleware-policy.ts:223). Those currently affect middleware routing rather than data-plane RBAC, but should not be treated as authoritative.

Suggested fix: resolve tenant timeout and onboarding state from trusted database/app metadata after token verification. Never fall back to `user_metadata` for authorization or session-policy decisions.

---

### P1 — Removing the last site assignment grants access to every site

Evidence: `app.user_can_see_site` explicitly returns true when no assignment exists at [packages/db/migrations/383-user-site-visibility-rls.sql:35](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/383-user-site-visibility-rls.sql:35). It also permits all rows when the authenticated user context is unexpectedly null at [383-user-site-visibility-rls.sql:24](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/383-user-site-visibility-rls.sql:24), and permits all site-null rows at [383-user-site-visibility-rls.sql:42](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/383-user-site-visibility-rls.sql:42).

This is reachable through normal operations:

- `user_sites.site_id` uses `ON DELETE CASCADE` at [packages/db/migrations/381-user-sites-assignment.sql:17](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/381-user-sites-assignment.sql:17). Deleting the user’s last assigned site silently converts that user from restricted to unrestricted.
- The settings action deliberately accepts an empty assignment set and deletes existing assignments at [apps/web/actions/users/assign-user-sites.ts:93](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/users/assign-user-sites.ts:93) and [assign-user-sites.ts:119](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/actions/users/assign-user-sites.ts:119).

Therefore an omission, cascade, or administrative mistake expands access rather than denying it. The restrictive policies applied at [383-user-site-visibility-rls.sql:65](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/383-user-site-visibility-rls.sql:65) inherit this fail-open result across work orders, inventory, quality, shipments, scheduling, and license plates.

Suggested fix: represent unrestricted access explicitly—such as a dedicated role/flag—and make zero assignments deny site-scoped rows for ordinary users. Treat null authenticated-user context as false. Prevent deleting the last assignment unless the target has explicit all-site authority.

## CLEAN areas verified

- `withOrgContext` verifies the Supabase user, resolves the home organization from `public.users`, and does not trust JWT `org_id`.
- Platform organization switching validates the override UUID, platform-admin membership, and target organization before changing context.
- Session context registration carries the owner-verified `user_id`; `app.set_org_context` does not accept a caller-supplied user ID.
- The reviewed service-role user-management paths keep the key server-side and perform an RBAC check before calling Supabase Admin APIs.
- Middleware fails closed when token verification fails or production Supabase configuration is missing.
- API traffic is intentionally delegated to route-level authentication; the reviewed settings D365 routes use `withOrgContext`.
- Migration 281 closes the earlier open `line_machines` policy by checking both parent organizations.
- Migration 227 removes the same-org null-site escape from inter-site transfer orders.
- Migration 279 storage-object policies bind attachment paths to the authenticated user’s database organization.
- Migration 423 enables and forces RLS on `planning_capacity_blocks`, with both `USING` and `WITH CHECK` bound to `app.current_org_id()`.
- No raw `tenant_id` organization-context mechanism was found in the reviewed auth/RLS trust path.

## Not covered

- Business correctness outside settings/auth/middleware/RLS.
- Full UI parity, accessibility, i18n, and pagination behavior.
- Live Supabase policy introspection, grants, triggers, or migration execution; this was static analysis against repository SQL.
- Runtime penetration testing, JWT mutation testing, or browser testing.
- Exhaustive review of every non-settings API route that middleware delegates to route-level authentication.
- Pre-200 migrations except where later requested migrations depended on them.
- The known bugs explicitly excluded by the request.

/**
 * Server-only resolver for the sidebar RBAC gate (shell gap #2).
 *
 * Resolves the signed-in user's permission set + admin status ONCE per request
 * (memoised via React `cache`) so the (app) shell layout can filter the nav
 * without firing a query per module. Reuses the established `withOrgContext`
 * data-plane pattern — the read runs as `app_user` under RLS, org-scoped to the
 * verified user's organization.
 *
 * NOT a `"use server"` module: consumed directly by the shell Server Component
 * layout during render, like `skeleton-data.ts`.
 *
 * Defensive failure mode: if the permission read fails (transient DB issue,
 * missing RBAC seed while the Codex lane backfills), we degrade to the
 * pre-RBAC behaviour — `isAdmin: false` + an empty set, which (because the
 * filter treats `permission_key == null` as visible) still renders every
 * not-yet-keyed module. So a failed read never blanks the sidebar.
 */
import { cache } from "react";

import { withOrgContext } from "../auth/with-org-context";
import type { NavPermissionContext } from "./filter-nav";

/** Role slugs that grant full module visibility regardless of permission keys. */
const ADMIN_ROLE_SLUGS = ["owner", "admin"] as const;

const EMPTY_CONTEXT: NavPermissionContext = {
  permissions: new Set<string>(),
  isAdmin: false,
};

export const getNavPermissionContext = cache(async function getNavPermissionContext(): Promise<NavPermissionContext> {
  try {
    return await withOrgContext(async ({ client, userId }) => {
      // Role slugs (admin/owner short-circuit) for this user in the active org.
      const rolesRes = await client.query<{ slug: string }>(
        `select r.slug
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id
          where ur.user_id = $1::uuid`,
        [userId],
      );
      const slugs = new Set(rolesRes.rows.map((row) => row.slug));
      const isAdmin = ADMIN_ROLE_SLUGS.some((slug) => slugs.has(slug));

      // Flat permission set across all of the user's roles. RLS scopes both
      // user_roles and roles to the active org, so cross-org leakage is
      // impossible at the data plane.
      const permsRes = await client.query<{ permission: string }>(
        `select distinct rp.permission
           from public.user_roles ur
           join public.role_permissions rp on rp.role_id = ur.role_id
          where ur.user_id = $1::uuid`,
        [userId],
      );
      const permissions = new Set(permsRes.rows.map((row) => row.permission));

      return { permissions, isAdmin } satisfies NavPermissionContext;
    });
  } catch (error) {
    console.error("[nav-permissions] permission resolution failed; rendering ungated modules only:", error);
    return EMPTY_CONTEXT;
  }
});

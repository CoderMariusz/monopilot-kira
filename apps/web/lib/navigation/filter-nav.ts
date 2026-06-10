import type { AppNavGroup, AppSidebarNavItem } from "./types";

/**
 * Pure RBAC gate for the desktop sidebar.
 *
 * Cross-cutting shell gap #2: every logged-in user used to see all 14 modules
 * because `module_registry.permission_key` is `null` everywhere. This function
 * hides any nav item whose `permission_key` the signed-in user lacks.
 *
 * Defensive contract (the permission_key values are being backfilled by a
 * separate RBAC lane — this code must not break while that lands):
 *
 *   - `permission_key == null`  → item is ALWAYS visible (ungated). This keeps
 *     the sidebar fully populated until the RBAC lane fills the keys, so a
 *     not-yet-keyed module never silently disappears.
 *   - `permission_key` set      → visible only if `isAdmin` OR the user's
 *     resolved `permissions` set contains that key.
 *   - `isAdmin === true`        → sees everything (short-circuit).
 *
 * A group with zero visible items after filtering is dropped entirely so the
 * sidebar never renders an empty section header.
 *
 * PURE: no I/O, no React, no Supabase. The server-side permission resolution
 * lives in `nav-permissions.ts`; this function only applies the decision so it
 * is trivially unit-testable.
 */
export type NavPermissionContext = {
  /** Set of permission keys the signed-in user holds (org-scoped). */
  permissions: ReadonlySet<string>;
  /** Admin/owner short-circuit — sees every module regardless of keys. */
  isAdmin: boolean;
};

export function canSeeNavItem(item: AppSidebarNavItem, ctx: NavPermissionContext): boolean {
  if (ctx.isAdmin) {
    return true;
  }
  // Ungated item (null = visible). Until the RBAC lane backfills permission_key
  // for a module, that module stays visible to everyone.
  if (item.permission_key == null) {
    return true;
  }
  return ctx.permissions.has(item.permission_key);
}

export function filterNavGroupsByPermissions(
  groups: readonly AppNavGroup[],
  ctx: NavPermissionContext,
): AppNavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canSeeNavItem(item, ctx)),
    }))
    .filter((group) => group.items.length > 0);
}

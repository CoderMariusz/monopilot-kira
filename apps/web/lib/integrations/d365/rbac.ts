/**
 * T-029 / T-030 — RBAC guard for D365 sync operations.
 *
 * The canonical permission string is `technical.d365.sync_trigger`
 * (packages/rbac/src/permissions.enum.ts). It is seeded to the org-admin role
 * family (migration 154). The owner/admin roles carry it, satisfying PRD §13.6
 * ("user role owner or npd_manager"). This is checked under the caller's
 * RLS-scoped transaction.
 */
import type { QueryClient } from './gate';

export const D365_SYNC_TRIGGER_PERMISSION = 'technical.d365.sync_trigger';

/**
 * True when the user holds `technical.d365.sync_trigger` in the current org via
 * any assigned role — checked in BOTH the normalized `role_permissions` table
 * and the legacy `roles.permissions` jsonb cache (the X-1 grant-seed pattern).
 */
export async function hasD365SyncPermission(
  client: QueryClient,
  userId: string,
  orgId: string,
): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or r.permissions ? $3)
      limit 1`,
    [userId, orgId, D365_SYNC_TRIGGER_PERMISSION],
  );
  return rows.length > 0;
}

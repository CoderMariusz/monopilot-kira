'use server';

import { revalidateLocalized } from '../../lib/i18n/revalidate-localized';

import { withOrgContext } from '../../lib/auth/with-org-context';
import { hasAllSiteAuthority } from './role-grant-guards';

const FORBIDDEN = 'forbidden' as const;

// 14-multi-site — per-user site assignment write path (mig 381 user_sites +
// mig 383 app.user_can_see_site RLS floor). The DB table is the assignment
// STORE; THIS action is the operable control surface an admin uses to set it.
//
// Gating: SAME permission as assign-role (settings.roles.assign) — site
// assignment is a roles/visibility-management act, so it reuses the existing
// users-manage grant rather than inventing a new permission. The page already
// derives `canAssignRoles` from this exact permission for the role picker, so
// the new "Assign sites" affordance shares that server-trusted flag.
//
// Semantics: assignments are REPLACED transactionally (delete-then-insert) so
// the submitted set is authoritative. Empty siteIds is only permitted for users
// with explicit all-site authority (admin-class roles); ordinary users must
// retain at least one site assignment.
const ASSIGN_PERMISSION = 'settings.roles.assign';

type QueryClient = {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type AssignUserSitesInput = {
  userId: string;
  siteIds: string[];
};

export type AssignUserSitesResult =
  | { ok: true; data: { userId: string; siteIds: string[] } }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'forbidden'
        | 'not_found'
        | 'empty_site_assignment_forbidden'
        | 'persistence_failed';
    };

function normalizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSiteIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const id = normalizeId(raw);
    if (!id) return null;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

async function requirePermission(client: QueryClient, userId: string, orgId: string, permission: string): Promise<void> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.code = $3
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [userId, orgId, permission],
  );
  if (rows.length === 0) {
    throw FORBIDDEN;
  }
}

export async function assignUserSites(input: AssignUserSitesInput): Promise<AssignUserSitesResult> {
  const targetUserId = normalizeId(input?.userId);
  const siteIds = normalizeSiteIds(input?.siteIds);
  if (!targetUserId || siteIds === null) {
    return { ok: false, error: 'invalid_input' };
  }

  return withOrgContext(async ({ userId, orgId, client }) => {
    try {
      await requirePermission(client as QueryClient, userId, orgId, ASSIGN_PERMISSION);

      // Validate the target user is in the caller's org and (if any) every
      // requested site is an active org site. A single guard query returns the
      // existence flags so we never half-apply a bad payload.
      const { rows: guardRows } = await (client as QueryClient).query<{
        target_user_found: boolean;
        all_sites_valid: boolean;
      }>(
        `select
            exists(
              select 1 from public.users u
               where u.id = $1::uuid and u.org_id = app.current_org_id()
            ) as target_user_found,
            (
              select count(*) = coalesce(array_length($2::uuid[], 1), 0)
                from public.sites s
               where s.id = any($2::uuid[])
                 and s.org_id = app.current_org_id()
                 and s.is_active = true
            ) as all_sites_valid`,
        [targetUserId, siteIds],
      );
      const guard = guardRows[0];
      if (!guard?.target_user_found) {
        return { ok: false, error: 'not_found' };
      }
      if (!guard.all_sites_valid) {
        return { ok: false, error: 'invalid_input' };
      }

      if (siteIds.length === 0 && !(await hasAllSiteAuthority(client as QueryClient, targetUserId, orgId))) {
        return { ok: false, error: 'empty_site_assignment_forbidden' };
      }

      // Replace transactionally: the submitted set is authoritative. The
      // delete clears prior assignments (org-scoped via app.current_org_id());
      // the insert (unnest) writes one row per site with the actor as
      // assigned_by. Empty siteIds is only reached for all-site authority roles.
      const { rows: replacedRows } = await (client as QueryClient).query<{ replaced: string | null }>(
        `with deleted as (
            delete from public.user_sites
             where user_id = $1::uuid
               and org_id = app.current_org_id()
            returning site_id
          ),
          inserted as (
            insert into public.user_sites (user_id, site_id, org_id, assigned_by)
            select $1::uuid, s.site_id, app.current_org_id(), $3::uuid
              from unnest($2::uuid[]) as s(site_id)
            returning site_id
          )
          select (select count(*)::text from inserted) as replaced`,
        [targetUserId, siteIds, userId],
      );
      if (!replacedRows[0]) {
        return { ok: false, error: 'persistence_failed' };
      }

      await (client as QueryClient).query(
        `insert into public.audit_log
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
         values ($1::uuid, $2::uuid, 'user', $3, 'users', $4, null, $5::jsonb, 'security')`,
        [
          orgId,
          userId,
          'settings.user.sites_assigned',
          targetUserId,
          JSON.stringify({ org_id: orgId, target_user_id: targetUserId, site_ids: siteIds, actor_user_id: userId }),
        ],
      );

      // NOTE: no outbox_events emit — 'settings.user.sites_assigned' is not in the
      // outbox_events_event_type_check CHECK (verified live: 23514), and no consumer
      // needs it. The audit_log entry above is the authoritative record. If a
      // downstream consumer is ever needed, add the event via a dedicated CHECK
      // migration (the ~180-value list must be reproduced carefully).
      try {
        revalidateLocalized('/settings/users');
      } catch {
        // Unit tests and non-Next callers do not provide a static-generation
        // store; persistence has already succeeded so cache invalidation must
        // not mask it.
      }
      return { ok: true, data: { userId: targetUserId, siteIds } };
    } catch (error) {
      if (error === FORBIDDEN) {
        return { ok: false, error: 'forbidden' };
      }
      return { ok: false, error: 'persistence_failed' };
    }
  });
}

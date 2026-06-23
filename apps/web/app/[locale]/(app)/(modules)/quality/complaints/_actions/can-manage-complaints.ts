'use server';

/**
 * Complaints + CAPA — read-only RBAC probe for the write gate.
 *
 * The complaints REGISTER + detail READS gate on `quality.dashboard.view`
 * (READ_PERMISSION in complaint-actions.ts), but every MUTATION — createComplaint,
 * convertComplaintToNcr, createCapaAction, resolveCapaAction — gates on
 * `quality.ncr.create` (WRITE_PERMISSION). So a successful list/detail read does
 * NOT imply the user can create a complaint, convert it, or manage CAPA actions.
 *
 * This probe lets the pages resolve that write flag SERVER-side to gate the
 * [+ New complaint] / [Convert to NCR] / [+ Add CAPA] / [Resolve] controls
 * (disabled + tooltip when the permission is absent) WITHOUT calling a mutating
 * action and WITHOUT touching complaint-actions.ts (constraint: that file is the
 * reviewed backend — import its actions, never author there).
 *
 * Additive read confined to complaints/** — mirrors the sibling
 * ccp-deviations/_actions/can-resolve-deviation.ts probe: a tiny
 * withOrgContext-scoped permission lookup, never a data mutation, never
 * client-trusted (the real authority is the server-side gate inside each action).
 * The permission predicate is identical to the `hasPermission` helper the
 * complaint actions use, so the button gate and the action gate agree.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

const COMPLAINT_WRITE_PERMISSION = 'quality.ncr.create';

/**
 * Returns true when the current org user holds `quality.ncr.create`.
 * On any failure returns false (fail-closed → controls render disabled),
 * never throwing into the page render.
 */
export async function canManageComplaints(): Promise<boolean> {
  try {
    return await withOrgContext(async (ctx): Promise<boolean> => {
      const { rows } = await ctx.client.query<{ ok: boolean }>(
        `select true as ok
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
           left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
          where ur.user_id = $1::uuid
            and ur.org_id = $2::uuid
            and (
              rp.permission is not null
              or coalesce(r.permissions, '[]'::jsonb) ? $3
            )
          limit 1`,
        [ctx.userId, ctx.orgId, COMPLAINT_WRITE_PERMISSION],
      );
      return rows.length > 0;
    });
  } catch {
    return false;
  }
}

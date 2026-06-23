'use server';

/**
 * CCP-deviations — read-only RBAC probe for `quality.ccp.deviation_override`.
 *
 * The deviation REGISTER read gate accepts EITHER `quality.dashboard.view` OR
 * `quality.ccp.deviation_override` (see canReadDeviationRegister in
 * ccp-deviation-actions.ts), so a successful `listCcpDeviations` read does NOT
 * imply the user can RESOLVE a deviation — `resolveCcpDeviation` gates strictly
 * on `quality.ccp.deviation_override`. This probe lets the page resolve that
 * flag server-side to gate the per-row [Resolve] button (rule 0.13c: disabled +
 * tooltip when the permission is absent) WITHOUT calling the mutating action and
 * WITHOUT touching ccp-deviation-actions.ts (constraint: that file is owned
 * elsewhere — import its actions, never author there).
 *
 * Additive read confined to ccp-deviations/** — mirrors the sibling
 * ccp-monitoring/_actions/can-edit-ccp.ts probe: a tiny withOrgContext-scoped
 * permission lookup, never a data mutation, never client-trusted (the real
 * authority is the server-side gate inside resolveCcpDeviation). The permission
 * predicate is identical to the `hasPermission` helper the deviation actions
 * use, so the button gate and the action gate agree.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

const DEVIATION_OVERRIDE_PERMISSION = 'quality.ccp.deviation_override';

/**
 * Returns true when the current org user holds `quality.ccp.deviation_override`.
 * On any failure returns false (fail-closed → the button renders disabled),
 * never throwing into the page render.
 */
export async function canResolveDeviation(): Promise<boolean> {
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
        [ctx.userId, ctx.orgId, DEVIATION_OVERRIDE_PERMISSION],
      );
      return rows.length > 0;
    });
  } catch {
    return false;
  }
}

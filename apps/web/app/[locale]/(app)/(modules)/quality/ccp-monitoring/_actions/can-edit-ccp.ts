'use server';

/**
 * CCP-monitoring — read-only RBAC probe for `quality.haccp.plan_edit`.
 *
 * FIX 1 needs to gate the "Add CCP" button server-side (rule 0.13c: disabled +
 * tooltip when the permission is absent). The board READ gate is being RELAXED
 * to accept EITHER `quality.haccp.plan_edit` OR `quality.ccp.deviation_override`
 * (FIX 2), so a successful `listCcps` read no longer implies the user can CREATE
 * a CCP — creation stays plan_edit-only in `upsertCcp`. This probe lets the page
 * resolve the plan_edit flag for the button gate WITHOUT calling the mutating
 * action and WITHOUT touching haccp-actions.ts (constraint: read-gate predicate
 * only there).
 *
 * This is an ADDITIVE read confined to ccp-monitoring/** — it mirrors the
 * sibling additive-read pattern (quality/_actions/lookup-actions.ts): a tiny
 * `withOrgContext`-scoped permission lookup, never a data mutation, never
 * client-trusted (the real authority is the server-side gate inside upsertCcp).
 * The permission predicate is identical to the `hasPermission` helper the HACCP
 * actions use, so the button gate and the action gate agree.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

const PLAN_EDIT_PERMISSION = 'quality.haccp.plan_edit';

/**
 * Returns true when the current org user holds `quality.haccp.plan_edit`.
 * On any failure returns false (fail-closed → the button renders disabled),
 * never throwing into the page render.
 */
export async function canEditCcpPlan(): Promise<boolean> {
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
        [ctx.userId, ctx.orgId, PLAN_EDIT_PERMISSION],
      );
      return rows.length > 0;
    });
  } catch {
    return false;
  }
}

'use server';

/**
 * HACCP plans — read-only RBAC probe for `quality.haccp.plan_edit`.
 *
 * The plan list / detail pages gate every mutating control ([+ New plan],
 * [Activate], [New version], [+ Add CCP]) server-side: disabled + tooltip when
 * the permission is absent (rule 0.13c). The reviewed HACCP plan actions
 * (listHaccpPlans / getHaccpPlan / upsertHaccpPlan / activateHaccpPlan /
 * newPlanVersion) all gate on `quality.haccp.plan_edit`, so a successful read
 * already implies edit here — but the probe lets the pages resolve the flag
 * for the button gates WITHOUT a second meaning getting baked into the read.
 *
 * This is an ADDITIVE read confined to haccp/** — it mirrors the sibling
 * additive-read pattern (ccp-monitoring/_actions/can-edit-ccp.ts): a tiny
 * `withOrgContext`-scoped permission lookup, never a data mutation, never
 * client-trusted (the real authority is the server-side gate inside the
 * actions). The predicate is identical to the `hasPermission` helper the HACCP
 * actions use, so the button gates and the action gates agree.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

const PLAN_EDIT_PERMISSION = 'quality.haccp.plan_edit';

/**
 * Returns true when the current org user holds `quality.haccp.plan_edit`.
 * On any failure returns false (fail-closed → controls render disabled),
 * never throwing into the page render.
 */
export async function canEditHaccpPlan(): Promise<boolean> {
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

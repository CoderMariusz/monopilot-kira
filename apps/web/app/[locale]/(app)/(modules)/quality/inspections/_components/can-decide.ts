/**
 * Server-side resolver for whether the current user may execute / decide an
 * inspection (record results + sign the pass/fail/hold decision).
 *
 * The reviewed inspection-actions.ts (C2 lane) gates `quality.inspection.execute`
 * authoritatively inside recordInspectionResult / submitInspectionDecision (never
 * client-trusted). But the QA-005a detail UI must decide SERVER-side whether to
 * render the editable inputs + decision buttons at all, and _actions/** is owned by
 * the parallel C2 lane (do not edit). This helper runs the same permission query
 * inside withOrgContext purely to drive UI affordance; a user who spoofs a button
 * still hits the action's server gate and is rejected.
 *
 * Returns false (never throws) on any failure so a transient lookup error hides the
 * action rather than 500-ing the page.
 */
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

export async function canDecideInspections(): Promise<boolean> {
  try {
    return await withOrgContext(async (ctx) => {
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
        [ctx.userId, ctx.orgId, 'quality.inspection.execute'],
      );
      return rows.length > 0;
    });
  } catch {
    return false;
  }
}

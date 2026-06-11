/**
 * Server-side resolvers for the spec-detail action affordances (QA-003b).
 *
 * The reviewed spec-actions.ts gates each lifecycle op authoritatively (approveSpec
 * → quality.spec.approve, etc. — never client-trusted). But the detail UI must
 * decide SERVER-side whether to render the Submit / Approve / Supersede buttons at
 * all, and _actions/** is owned by the parallel T2 lane (do not edit). These
 * helpers run the same permission query inside withOrgContext purely to drive UI
 * affordance; a user who spoofs a button still hits the action's server gate and is
 * rejected.
 *
 * Returns false (never throws) on any failure so a transient lookup error hides the
 * action rather than 500-ing the page.
 */
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

async function hasPermission(permission: string): Promise<boolean> {
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
        [ctx.userId, ctx.orgId, permission],
      );
      return rows.length > 0;
    });
  } catch {
    return false;
  }
}

/** Approve (e-sign) — gated by quality.spec.approve (the QA-lead grant, V-QA-SPEC-005). */
export function canApproveSpec(): Promise<boolean> {
  return hasPermission('quality.spec.approve');
}

/** Submit-for-review + supersede are spec-lifecycle ops owned by the approver role. */
export function canManageSpecLifecycle(): Promise<boolean> {
  return hasPermission('quality.spec.approve');
}

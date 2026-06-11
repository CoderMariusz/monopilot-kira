/**
 * Server-side resolver for whether the current user may release quality holds.
 *
 * The reviewed hold-actions.ts gates `quality.hold.release` inside releaseHold
 * (the authoritative enforcement — never client-trusted). But the QA-002a detail
 * UI must decide SERVER-side whether to render the "Release hold" button at all,
 * and _actions/** is owned by the T2 task (do not edit). This helper runs the same
 * permission query inside withOrgContext purely to drive UI affordance; a user who
 * spoofs the button still hits the action's server gate and is rejected.
 *
 * Returns false (never throws) on any failure so a transient lookup error simply
 * hides the optimistic action rather than 500-ing the page.
 */
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

export async function canReleaseHolds(): Promise<boolean> {
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
        [ctx.userId, ctx.orgId, 'quality.hold.release'],
      );
      return rows.length > 0;
    });
  } catch {
    return false;
  }
}

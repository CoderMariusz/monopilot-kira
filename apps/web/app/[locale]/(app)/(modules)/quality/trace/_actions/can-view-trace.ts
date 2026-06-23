'use server';

/**
 * Trace & Recall (Wave E2A) — read-only RBAC probe for the trace permission.
 *
 * The trace Server Actions (trace-actions.ts) enforce `quality.dashboard.view`
 * server-side and THROW `forbidden` when it is absent — but the page needs to
 * decide UP FRONT whether to render the workbench or the permission-denied panel
 * (rule: never render-then-disable; never client-trust the gate). This probe
 * resolves that flag WITHOUT calling the data-fetching action and WITHOUT
 * touching trace-actions.ts.
 *
 * This is an ADDITIVE read confined to trace/** — it mirrors the sibling
 * ccp-monitoring/can-edit-ccp.ts probe: a tiny `withOrgContext`-scoped permission
 * lookup, never a data mutation, never the source of authority (the real gate is
 * `assertTracePermission` inside the trace actions, which re-checks). The
 * predicate is identical to the actions' `hasPermission` helper, so the page
 * gate and the action gate agree.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

// Mirrors TRACE_PERMISSION in trace-actions.ts.
const TRACE_PERMISSION = 'quality.dashboard.view';

/**
 * Returns true when the current org user holds the trace-view permission.
 * On any failure returns false (fail-closed → the page renders the denied
 * panel), never throwing into the page render.
 */
export async function canViewTrace(): Promise<boolean> {
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
        [ctx.userId, ctx.orgId, TRACE_PERMISSION],
      );
      return rows.length > 0;
    });
  } catch {
    return false;
  }
}

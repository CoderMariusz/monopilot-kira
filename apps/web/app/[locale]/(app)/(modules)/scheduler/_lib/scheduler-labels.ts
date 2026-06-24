'use server';

/**
 * Wave E8 — UI-side label loaders for the scheduler board + matrix.
 *
 * These are read-only, display-label reads (production-line codes, WO numbers)
 * the board uses to turn the backend's id-keyed run result into a readable
 * proposal, plus the read gate for the screen. They do NOT run the solver or
 * mutate anything — the heavy lifting stays in the backend-owned
 * `_actions/scheduler-actions.ts`. Read gate mirrors the module: scheduler.run.read.
 */

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { hasPermission, type OrgActionContext } from '../../planning/work-orders/_actions/shared';
import type { SchedulerLabelMaps } from '../_components/scheduler-view-model';

const SCHEDULER_READ_PERMISSION = 'scheduler.run.read';

export type SchedulerAccessResult =
  | { ok: true; labelMaps: SchedulerLabelMaps }
  | { ok: false; error: 'forbidden' | 'persistence_failed' };

/**
 * Returns the read gate + the label maps (line code/name by id, WO number by
 * id) the board uses to label the proposed assignments. A failure here renders
 * the board's permission-denied / error state — never a 500.
 */
export async function loadSchedulerAccess(): Promise<SchedulerAccessResult> {
  try {
    return await withOrgContext(async (ctx: OrgActionContext): Promise<SchedulerAccessResult> => {
      if (!(await hasPermission(ctx, SCHEDULER_READ_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const lines = await ctx.client.query<{ id: string; code: string; name: string }>(
        `select id::text, code, name
           from public.production_lines
          where org_id = app.current_org_id()
            and status = 'active'
          order by code`,
      );

      const wos = await ctx.client.query<{ id: string; wo_number: string }>(
        `select id::text, wo_number
           from public.work_orders
          where org_id = app.current_org_id()
            and status = any(array['DRAFT', 'RELEASED']::varchar[])
          order by created_at desc
          limit 500`,
      );

      const lineById: Record<string, { code: string; name: string }> = {};
      for (const row of lines.rows) {
        lineById[row.id] = { code: row.code, name: row.name };
      }
      const woNumberById: Record<string, string> = {};
      for (const row of wos.rows) {
        woNumberById[row.id] = row.wo_number;
      }

      return { ok: true, labelMaps: { lineById, woNumberById } };
    });
  } catch (error) {
    console.error('[scheduler/loadSchedulerAccess] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

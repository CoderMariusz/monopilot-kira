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

function mergeWoLabelRows(
  target: SchedulerLabelMaps,
  rows: Array<{ id: string; wo_number: string; planned_quantity: string; uom: string }>,
): void {
  for (const row of rows) {
    target.woNumberById ??= {};
    target.qtyByWoId ??= {};
    target.uomByWoId ??= {};
    target.woNumberById[row.id] = row.wo_number;
    target.qtyByWoId[row.id] = row.planned_quantity;
    target.uomByWoId[row.id] = row.uom;
  }
}

/**
 * Org-scoped WO number + quantity labels for specific assignment ids (e.g. hydrated
 * run rows whose WOs are outside the active-WO window).
 */
export async function hydrateSchedulerLabelsForWoIds(
  woIds: string[],
): Promise<SchedulerLabelMaps> {
  const uniqueIds = [...new Set(woIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return {};
  }

  try {
    return await withOrgContext(async (ctx: OrgActionContext): Promise<SchedulerLabelMaps> => {
      if (!(await hasPermission(ctx, SCHEDULER_READ_PERMISSION))) {
        return {};
      }

      const { rows } = await ctx.client.query<{
        id: string;
        wo_number: string;
        planned_quantity: string;
        uom: string;
      }>(
        `select id::text, wo_number, planned_quantity::text, uom
           from public.work_orders
          where org_id = app.current_org_id()
            and id = any($1::uuid[])`,
        [uniqueIds],
      );

      const labelMaps: SchedulerLabelMaps = {};
      mergeWoLabelRows(labelMaps, rows);
      return labelMaps;
    });
  } catch (error) {
    console.error('[scheduler/hydrateSchedulerLabelsForWoIds] persistence_failed', error);
    return {};
  }
}

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

      // Display-label map only — NOT a picker. Load every org line (any status):
      // the solver can place a WO on a line that is not 'active' (e.g. a line in
      // 'maintenance'), and filtering by status here left those lanes labelled
      // with a truncated UUID (shortId fallback in toProposal) instead of the
      // line code. Org-scoped via RLS + the explicit org predicate.
      const lines = await ctx.client.query<{ id: string; code: string; name: string }>(
        `select id::text, code, name
           from public.production_lines
          where org_id = app.current_org_id()
          order by code`,
      );

      const wos = await ctx.client.query<{ id: string; wo_number: string; planned_quantity: string; uom: string }>(
        `select id::text, wo_number, planned_quantity::text, uom
           from public.work_orders
          where org_id = app.current_org_id()
            and status = any(array['DRAFT', 'RELEASED', 'IN_PROGRESS']::varchar[])
          order by created_at desc
          limit 500`,
      );

      const lineById: Record<string, { code: string; name: string }> = {};
      for (const row of lines.rows) {
        lineById[row.id] = { code: row.code, name: row.name };
      }
      const woNumberById: Record<string, string> = {};
      const qtyByWoId: Record<string, string> = {};
      const uomByWoId: Record<string, string> = {};
      mergeWoLabelRows({ woNumberById, qtyByWoId, uomByWoId }, wos.rows);

      return { ok: true, labelMaps: { lineById, woNumberById, qtyByWoId, uomByWoId } };
    });
  } catch (error) {
    console.error('[scheduler/loadSchedulerAccess] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

'use server';

/**
 * /planning/schedule Server Actions — read the line schedule board + the one
 * light write (rescheduleWorkOrder). NO auto-sequencing optimizer lives here;
 * this is the honest read+light-write board that replaces the "Run sequencing"
 * stub (clickthrough §4).
 *
 * RBAC mirrors the planning neighbours exactly:
 *   - read  → 'scheduler.run.read'  (same as _actions/dashboard-data.ts)
 *   - write → PLANNING_WO_WRITE_PERMISSION ('npd.planning.write', the
 *     createWorkOrder/releaseWorkOrder family)
 *
 * V-PLAN-WO-CYCLE (audit F-C14, promised in mig 177 and never built):
 * rescheduleWorkOrder adds NO wo_dependencies edges, so it cannot CREATE a
 * cycle — but per the validator contract it refuses to move a WO whose
 * existing dependency graph is already cyclic (a cycle = silent infinite
 * scheduling loop at solver time). The pure validator lives in
 * ../_lib/wo-cycle.ts and is the canonical implementation for future edge
 * write paths too.
 */

import { z } from 'zod';

import { getActiveSiteId } from '../../../../../../../lib/site/site-context';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  PLANNING_WO_WRITE_PERMISSION,
  hasPermission,
  toIso,
  type OrgActionContext,
} from '../../work-orders/_actions/shared';
import {
  BOARD_STATUSES,
  BOARD_WINDOW_DAYS,
  RESCHEDULE_LEGAL_STATUSES,
  type ScheduleBoardData,
  type ScheduleBoardLine,
  type ScheduleBoardWo,
} from '../_lib/board';
import { findCycleInvolving, type WoDependencyEdge } from '../_lib/wo-cycle';

const SCHEDULE_READ_PERMISSION = 'scheduler.run.read';
const APP_VERSION = 'planning-schedule-board-v1';

export type ScheduleBoardError = 'forbidden' | 'persistence_failed';

export type GetScheduleBoardResult =
  | { ok: true; data: ScheduleBoardData }
  | { ok: false; error: ScheduleBoardError };

type WoRow = {
  id: string;
  wo_number: string;
  status: string;
  priority: string;
  production_line_id: string | null;
  scheduled_start_time: Date | string | null;
  scheduled_end_time: Date | string | null;
  planned_quantity: string;
  uom: string;
  item_code: string | null;
  item_name: string | null;
};

function mapBoardWo(row: WoRow): ScheduleBoardWo {
  return {
    id: row.id,
    woNumber: row.wo_number,
    itemCode: row.item_code,
    itemName: row.item_name,
    status: row.status,
    priority: row.priority,
    productionLineId: row.production_line_id,
    scheduledStart: row.scheduled_start_time ? toIso(row.scheduled_start_time) : null,
    scheduledEnd: row.scheduled_end_time ? toIso(row.scheduled_end_time) : null,
    plannedQuantity: String(row.planned_quantity),
    uom: row.uom,
  };
}

const WO_SELECT = `
  select wo.id, wo.wo_number, wo.status, wo.priority, wo.production_line_id,
         wo.scheduled_start_time, wo.scheduled_end_time,
         wo.planned_quantity::text as planned_quantity, wo.uom,
         i.item_code, i.name as item_name
    from public.work_orders wo
    left join public.items i
      on i.id = wo.product_id
     and i.org_id = wo.org_id
   where wo.org_id = app.current_org_id()`;

export async function getScheduleBoard(): Promise<GetScheduleBoardResult> {
  try {
    return await withOrgContext(async (ctx: OrgActionContext): Promise<GetScheduleBoardResult> => {
      if (!(await hasPermission(ctx, SCHEDULE_READ_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const windowStart = new Date();
      windowStart.setUTCHours(0, 0, 0, 0);
      const windowEnd = new Date(windowStart.getTime() + BOARD_WINDOW_DAYS * 24 * 60 * 60 * 1000);

      const s = await getActiveSiteId({ client: ctx.client });
      if (!s) {
        return {
          ok: true,
          data: {
            windowStart: windowStart.toISOString(),
            windowEnd: windowEnd.toISOString(),
            lines: [],
            scheduled: [],
            unscheduled: [],
            noActiveSite: true,
          } as ScheduleBoardData & { noActiveSite: true },
        };
      }

      const linesResult = await ctx.client.query<ScheduleBoardLine>(
        `select id, code, name
           from public.production_lines
          where org_id = app.current_org_id()
            and status = 'active'
          order by code`,
      );

      const scheduledResult = await ctx.client.query<WoRow>(
        `${WO_SELECT}
     and wo.status = any($1::text[])
     and wo.site_id = $4::uuid
     and wo.scheduled_start_time is not null
     and wo.scheduled_start_time < $3::timestamptz
     and coalesce(wo.scheduled_end_time, wo.scheduled_start_time + interval '1 hour') > $2::timestamptz
   order by wo.scheduled_start_time`,
        [[...BOARD_STATUSES], windowStart.toISOString(), windowEnd.toISOString(), s],
      );

      const unscheduledResult = await ctx.client.query<WoRow>(
        `${WO_SELECT}
     and wo.status = any($1::text[])
     and wo.site_id = $2::uuid
     and wo.scheduled_start_time is null
   order by wo.created_at desc
   limit 50`,
        [[...BOARD_STATUSES], s],
      );

      return {
        ok: true,
        data: {
          windowStart: windowStart.toISOString(),
          windowEnd: windowEnd.toISOString(),
          lines: linesResult.rows,
          scheduled: scheduledResult.rows.map(mapBoardWo),
          unscheduled: unscheduledResult.rows.map(mapBoardWo),
        },
      };
    });
  } catch (error) {
    console.error('[getScheduleBoard] read_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

export type RescheduleWorkOrderError =
  | 'invalid_input'
  | 'invalid_range'
  | 'forbidden'
  | 'not_found'
  | 'invalid_state'
  | 'invalid_line'
  | 'dependency_cycle'
  | 'persistence_failed';

export type RescheduleWorkOrderResult =
  | { ok: true; workOrder: ScheduleBoardWo }
  | { ok: false; error: RescheduleWorkOrderError; issues?: z.ZodIssue[]; cycle?: string[] };

const RescheduleWorkOrderInput = z.object({
  woId: z.string().uuid(),
  lineId: z.string().uuid().optional(),
  scheduledStart: z.string().datetime({ offset: true }),
  scheduledEnd: z.string().datetime({ offset: true }),
});

export async function rescheduleWorkOrder(params: {
  woId: string;
  lineId?: string;
  scheduledStart: string;
  scheduledEnd: string;
}): Promise<RescheduleWorkOrderResult> {
  const parsed = RescheduleWorkOrderInput.safeParse(params);
  if (!parsed.success) return { ok: false, error: 'invalid_input', issues: parsed.error.issues };
  const input = parsed.data;

  if (Date.parse(input.scheduledEnd) <= Date.parse(input.scheduledStart)) {
    return { ok: false, error: 'invalid_range' };
  }

  try {
    return await withOrgContext(async (ctx: OrgActionContext): Promise<RescheduleWorkOrderResult> => {
      if (!(await hasPermission(ctx, PLANNING_WO_WRITE_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const currentResult = await ctx.client.query<{
        status: string;
        scheduled_start_time: Date | string | null;
        scheduled_end_time: Date | string | null;
        production_line_id: string | null;
        site_id: string | null;
      }>(
        `select status, scheduled_start_time, scheduled_end_time, production_line_id, site_id
           from public.work_orders
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1
          for update`,
        [input.woId],
      );
      const current = currentResult.rows[0];
      if (!current) return { ok: false, error: 'not_found' };
      if (!(RESCHEDULE_LEGAL_STATUSES as readonly string[]).includes(current.status)) {
        return { ok: false, error: 'invalid_state' };
      }

      if (input.lineId) {
        // production_lines has no site_id column in this schema, so target-line
        // site matching is deferred until the infra table carries site scope.
        const lineResult = await ctx.client.query<{ id: string }>(
          `select id
             from public.production_lines
            where org_id = app.current_org_id()
              and id = $1::uuid
              and status = 'active'
            limit 1`,
          [input.lineId],
        );
        if (!lineResult.rows[0]) return { ok: false, error: 'invalid_line' };
      }

      // V-PLAN-WO-CYCLE defensive guard — refuse to move a WO sitting on an
      // already-cyclic dependency graph (see module header).
      const edgesResult = await ctx.client.query<{ parent_wo_id: string; child_wo_id: string }>(
        `select parent_wo_id, child_wo_id
           from public.wo_dependencies
          where org_id = app.current_org_id()`,
      );
      const edges: WoDependencyEdge[] = edgesResult.rows.map((row) => ({
        parentWoId: row.parent_wo_id,
        childWoId: row.child_wo_id,
      }));
      const cycle = findCycleInvolving(edges, input.woId);
      if (cycle) return { ok: false, error: 'dependency_cycle', cycle };

      // Status re-checked in the WHERE clause — a concurrent release/start
      // between the read above and this write degrades to invalid_state.
      const updated = await ctx.client.query<WoRow>(
        `update public.work_orders wo
            set scheduled_start_time = $2::timestamptz,
                scheduled_end_time = $3::timestamptz,
                production_line_id = coalesce($4::uuid, wo.production_line_id),
                updated_by = $5::uuid,
                updated_at = now()
          where wo.org_id = app.current_org_id()
            and wo.id = $1::uuid
            and wo.status = $7
            and wo.status = any($6::text[])
      returning wo.id, wo.wo_number, wo.status, wo.priority, wo.production_line_id,
                wo.scheduled_start_time, wo.scheduled_end_time,
                wo.planned_quantity::text as planned_quantity, wo.uom,
                null::text as item_code, null::text as item_name`,
        [
          input.woId,
          input.scheduledStart,
          input.scheduledEnd,
          input.lineId ?? null,
          ctx.userId,
          [...RESCHEDULE_LEGAL_STATUSES],
          current.status,
        ],
      );
      const workOrder = updated.rows[0];
      if (!workOrder) return { ok: false, error: 'invalid_state' };

      // Audit row like the neighbours (createWorkOrder/releaseWorkOrder write
      // wo_status_history). Status is unchanged — action 'reschedule' carries
      // the before/after schedule in context_jsonb.
      await ctx.client.query(
        `insert into public.wo_status_history
           (org_id, wo_id, from_status, to_status, action, user_id, context_jsonb)
         values
           (app.current_org_id(), $1::uuid, $2, $2, 'reschedule', $3::uuid, $4::jsonb)`,
        [
          input.woId,
          current.status,
          ctx.userId,
          JSON.stringify({
            app_version: APP_VERSION,
            previous: {
              scheduled_start_time: current.scheduled_start_time
                ? toIso(current.scheduled_start_time)
                : null,
              scheduled_end_time: current.scheduled_end_time
                ? toIso(current.scheduled_end_time)
                : null,
              production_line_id: current.production_line_id,
            },
            next: {
              scheduled_start_time: input.scheduledStart,
              scheduled_end_time: input.scheduledEnd,
              production_line_id: input.lineId ?? current.production_line_id,
            },
          }),
        ],
      );

      return { ok: true, workOrder: mapBoardWo(workOrder) };
    });
  } catch (error) {
    console.error('[rescheduleWorkOrder] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

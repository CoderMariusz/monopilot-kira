/**
 * PF-R11-01 — when a parent FG WO scheduled start changes, shift downstream WIP
 * children by the same delta so the parent/child offset is preserved.
 */
import { ChainQtySyncRollbackError } from './wo-chain-qty-sync';
import type { ChainEdgeSnapshot } from './wo-chain-qty-sync';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

const EDITABLE_CHILD_STATUSES = new Set(['DRAFT', 'RELEASED']);

function timestampMs(value: string | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function toIso(value: number): string {
  return new Date(value).toISOString();
}

/**
 * Shift a child schedule timestamp by the parent's schedule delta.
 * Preserves parent−child offset when both sides had a start time; clearing the
 * parent clears the child.
 */
export function shiftScheduledTimeByParentDelta(
  childTime: string | Date | null | undefined,
  parentOldStart: string | Date | null | undefined,
  parentNewStart: string | Date | null | undefined,
): string | null {
  const parentNewMs = timestampMs(parentNewStart);
  if (parentNewStart === null || parentNewMs === null) {
    return null;
  }

  const parentOldMs = timestampMs(parentOldStart);
  const childOldMs = timestampMs(childTime);

  if (childOldMs === null) {
    return null;
  }

  if (parentOldMs === null) {
    return toIso(childOldMs);
  }

  const deltaMs = parentNewMs - parentOldMs;
  return toIso(childOldMs + deltaMs);
}

export async function propagateParentWoChainScheduledDates(
  ctx: OrgActionContext,
  userId: string,
  edges: ChainEdgeSnapshot[],
  scheduleShift: {
    parentOldScheduledStart: string | Date | null;
    parentNewScheduledStart: string | Date | null;
  },
): Promise<void> {
  if (edges.length === 0) return;

  for (const edge of edges) {
    if (!EDITABLE_CHILD_STATUSES.has(edge.childStatus)) {
      throw new ChainQtySyncRollbackError('chain_child_not_editable');
    }

    const nextStart = shiftScheduledTimeByParentDelta(
      edge.childScheduledStartTime,
      scheduleShift.parentOldScheduledStart,
      scheduleShift.parentNewScheduledStart,
    );
    const nextEnd = shiftScheduledTimeByParentDelta(
      edge.childScheduledEndTime,
      scheduleShift.parentOldScheduledStart,
      scheduleShift.parentNewScheduledStart,
    );

    const childUpdated = await ctx.client.query(
      `update public.work_orders
          set scheduled_start_time = $2::timestamptz,
              scheduled_end_time = $3::timestamptz,
              updated_by = $4::uuid,
              updated_at = now()
        where org_id = app.current_org_id()
          and id = $1::uuid
          and status in ('DRAFT', 'RELEASED')
      returning id`,
      [edge.childWoId, nextStart, nextEnd, userId],
    );
    if ((childUpdated.rowCount ?? 0) === 0) {
      throw new ChainQtySyncRollbackError('chain_child_not_editable');
    }
  }
}

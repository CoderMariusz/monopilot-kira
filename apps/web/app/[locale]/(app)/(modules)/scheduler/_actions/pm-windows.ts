import type { OrgActionContext } from '../../planning/work-orders/_actions/shared';
import type { PmWindow } from './scheduler-types';

/** Default PM block length when MWO has no started_at / actual_duration_min. */
export const DEFAULT_PM_BLOCK_HOURS = 4;

const DAY_MS = 24 * 60 * 60 * 1000;

type PmWindowRow = {
  line_id: string;
  start_at: string | Date;
  end_at: string | Date;
};

function pmBlockMinutes(blockHours: number): number {
  return Math.max(1, Math.round(blockHours * 60));
}

/**
 * Load maintenance PM blocks for the solver horizon: open/in-flight MWOs tied to
 * equipment on a production line, plus upcoming active PM schedules without an
 * open MWO. Returns an empty list when maintenance data is absent.
 */
export async function loadPmWindows(
  ctx: OrgActionContext,
  lineId: string | null,
  horizonDays: number,
  blockHours: number = DEFAULT_PM_BLOCK_HOURS,
): Promise<PmWindow[]> {
  const windowStart = new Date().toISOString();
  const windowEnd = new Date(Date.now() + horizonDays * DAY_MS).toISOString();
  const blockMinutes = pmBlockMinutes(blockHours);

  const { rows } = await ctx.client.query<PmWindowRow>(
    `select line_id, start_at, end_at
       from (
         select
           e.parent_line_id::text as line_id,
           coalesce(
             mwo.started_at,
             (mwo.due_date::timestamp at time zone 'UTC')
           ) as start_at,
           coalesce(
             mwo.started_at
               + (coalesce(nullif(mwo.actual_duration_min, 0), $4::integer) * interval '1 minute'),
             (mwo.due_date::timestamp at time zone 'UTC')
               + ($5::numeric * interval '1 hour')
           ) as end_at
         from public.maintenance_work_orders mwo
         join public.equipment e
           on e.org_id = mwo.org_id
          and e.id = mwo.equipment_id
        where mwo.org_id = app.current_org_id()
          and mwo.state in ('approved', 'open', 'in_progress')
          and e.parent_line_id is not null
          and ($1::uuid is null or e.parent_line_id = $1::uuid)
          and coalesce(
                mwo.started_at,
                (mwo.due_date::timestamp at time zone 'UTC')
              ) is not null

         union all

         select
           e.parent_line_id::text as line_id,
           (ms.next_due_date::timestamp at time zone 'UTC') as start_at,
           (ms.next_due_date::timestamp at time zone 'UTC')
             + ($5::numeric * interval '1 hour') as end_at
         from public.maintenance_schedules ms
         join public.equipment e
           on e.org_id = ms.org_id
          and e.id = ms.equipment_id
        where ms.org_id = app.current_org_id()
          and ms.active
          and ms.next_due_date is not null
          and e.parent_line_id is not null
          and ($1::uuid is null or e.parent_line_id = $1::uuid)
          and ms.next_due_date >= ($2::timestamptz at time zone 'UTC')::date
          and ms.next_due_date < ($3::timestamptz at time zone 'UTC')::date
          and not exists (
            select 1
              from public.maintenance_work_orders mwo
             where mwo.org_id = ms.org_id
               and mwo.schedule_id = ms.id
               and mwo.state not in ('completed', 'cancelled')
          )
       ) windows
      where line_id is not null
        and start_at is not null
        and end_at is not null
        and start_at < $3::timestamptz
        and end_at > $2::timestamptz
      order by start_at`,
    [lineId, windowStart, windowEnd, blockMinutes, blockHours],
  );

  return rows.map((row) => ({
    line_id: row.line_id,
    start_at: row.start_at instanceof Date ? row.start_at.toISOString() : row.start_at,
    end_at: row.end_at instanceof Date ? row.end_at.toISOString() : row.end_at,
  }));
}

export function pmBlockHoursFromConfigParams(params: unknown): number {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return DEFAULT_PM_BLOCK_HOURS;
  }
  const raw = (params as { pm_block_hours?: unknown }).pm_block_hours;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PM_BLOCK_HOURS;
}

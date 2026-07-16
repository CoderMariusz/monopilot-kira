'use server';

/**
 * F4 / P1-16 — read-only line/day capacity occupancy for /scheduler/capacity.
 * Occupancy = RELEASED/IN_PROGRESS WO scheduled windows + draft assignments.
 * Capacity hours from scheduler_config (org default + per-line overrides).
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { PRODUCTION_LINES_SITE_FILTER_SQL } from '../../../../../../../lib/site/production-lines-site-filter';
import { getActiveSiteId } from '../../../../../../../lib/site/site-context';
import {
  hasPermission,
  type OrgActionContext,
} from '../../../planning/work-orders/_actions/shared';

const SCHEDULER_READ_PERMISSION = 'scheduler.run.read';
const DEFAULT_HORIZON_DAYS = 7;
const MS_PER_HOUR = 3_600_000;

export type CapacityDayCell = {
  day: string; // YYYY-MM-DD (UTC)
  occupiedHours: number;
  capacityHours: number | null;
  utilisationPct: number | null;
  sourceWoHours: number;
  sourceDraftHours: number;
};

export type CapacityLineRow = {
  lineId: string;
  lineCode: string;
  lineName: string;
  capacityHoursPerDay: number | null;
  days: CapacityDayCell[];
};

export type LoadCapacityResult =
  | {
      ok: true;
      horizonDays: number;
      horizonStart: string;
      horizonEnd: string;
      lines: CapacityLineRow[];
    }
  | { ok: false; error: 'forbidden' | 'persistence_failed' };

type LineRow = {
  id: string;
  code: string;
  name: string;
};

type ConfigRow = {
  line_id: string | null;
  default_horizon_days: number;
  capacity_hours_per_day: string | number | null;
};

type IntervalRow = {
  line_id: string;
  start_at: string | Date;
  end_at: string | Date;
  source: 'wo' | 'draft';
  alternative_key: string | null;
};

function toIsoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function parseCapacityHours(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function intervalMs(start: string | Date, end: string | Date): { startMs: number; endMs: number } | null {
  const startMs = start instanceof Date ? start.getTime() : new Date(start).getTime();
  const endMs = end instanceof Date ? end.getTime() : new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return { startMs, endMs };
}

/** Split an interval across UTC calendar days; accumulate ms per day key. */
function accumulateByDay(
  bucket: Map<string, number>,
  startMs: number,
  endMs: number,
  windowStartMs: number,
  windowEndMs: number,
): void {
  const from = Math.max(startMs, windowStartMs);
  const to = Math.min(endMs, windowEndMs);
  if (to <= from) return;

  let cursor = from;
  while (cursor < to) {
    const dayStart = startOfUtcDay(cursor);
    const dayEnd = dayStart + 86_400_000;
    const sliceEnd = Math.min(to, dayEnd);
    const key = toIsoDay(dayStart);
    bucket.set(key, (bucket.get(key) ?? 0) + (sliceEnd - cursor));
    cursor = sliceEnd;
  }
}

export async function loadSchedulerCapacity(): Promise<LoadCapacityResult> {
  try {
    return await withOrgContext(async (ctx: OrgActionContext): Promise<LoadCapacityResult> => {
      if (!(await hasPermission(ctx, SCHEDULER_READ_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const activeSiteId = await getActiveSiteId({ client: ctx.client });

      const configs = await ctx.client.query<ConfigRow>(
        `select line_id, default_horizon_days, capacity_hours_per_day::text
           from public.scheduler_config
          where org_id = app.current_org_id()`,
      );

      const orgConfig = configs.rows.find((r) => r.line_id === null) ?? null;
      const horizonDays = Math.min(
        30,
        Math.max(1, orgConfig?.default_horizon_days ?? DEFAULT_HORIZON_DAYS),
      );
      const defaultCapacity = parseCapacityHours(orgConfig?.capacity_hours_per_day);
      const capacityByLine: Record<string, number | null> = {};
      for (const row of configs.rows) {
        if (row.line_id === null) continue;
        capacityByLine[row.line_id] = parseCapacityHours(row.capacity_hours_per_day);
      }

      const nowMs = Date.now();
      const horizonStartMs = startOfUtcDay(nowMs);
      const horizonEndMs = horizonStartMs + horizonDays * 86_400_000;
      const horizonStart = new Date(horizonStartMs).toISOString();
      const horizonEnd = new Date(horizonEndMs).toISOString();

      const linesResult = await ctx.client.query<LineRow>(
        `select pl.id::text, pl.code, pl.name
           from public.production_lines pl
          where pl.org_id = app.current_org_id()
            ${PRODUCTION_LINES_SITE_FILTER_SQL}
          order by pl.code`,
        [activeSiteId],
      );

      const intervals = await ctx.client.query<IntervalRow>(
        `select line_id, start_at, end_at, source, alternative_key
           from (
             select
               wo.production_line_id::text as line_id,
               wo.scheduled_start_time as start_at,
               coalesce(
                 wo.scheduled_end_time,
                 wo.scheduled_start_time + interval '1 hour'
               ) as end_at,
               'wo'::text as source,
               null::text as alternative_key
             from public.work_orders wo
             join public.production_lines pl
               on pl.org_id = wo.org_id
              and pl.id = wo.production_line_id
            where wo.org_id = app.current_org_id()
              and wo.status = any(array['RELEASED', 'IN_PROGRESS']::varchar[])
              and wo.production_line_id is not null
              and wo.scheduled_start_time is not null
              and wo.scheduled_start_time < $2::timestamptz
              and coalesce(
                    wo.scheduled_end_time,
                    wo.scheduled_start_time + interval '1 hour'
                  ) > $1::timestamptz
              and ($3::uuid is null or pl.site_id = $3::uuid or pl.site_id is null)
             union all
             select
               sa.line_id,
               sa.planned_start_at as start_at,
               coalesce(
                 sa.planned_end_at,
                 sa.planned_start_at + interval '1 hour'
               ) as end_at,
               'draft'::text as source,
               sa.wo_id::text as alternative_key
             from public.scheduler_assignments sa
             join public.production_lines pl
               on pl.org_id = sa.org_id
              and pl.id::text = sa.line_id
            where sa.org_id = app.current_org_id()
              and sa.status = 'draft'
              and sa.line_id is not null
              and sa.planned_start_at is not null
              and sa.planned_start_at < $2::timestamptz
              and coalesce(
                    sa.planned_end_at,
                    sa.planned_start_at + interval '1 hour'
                  ) > $1::timestamptz
              and ($3::uuid is null or pl.site_id = $3::uuid or pl.site_id is null)
           ) occupancy
          where line_id is not null`,
        [horizonStart, horizonEnd, activeSiteId],
      );

      const dayKeys: string[] = [];
      for (let i = 0; i < horizonDays; i += 1) {
        dayKeys.push(toIsoDay(horizonStartMs + i * 86_400_000));
      }

      type Acc = { wo: Map<string, number>; draft: Map<string, number> };
      const byLine = new Map<string, Acc>();
      const occupancyRows: IntervalRow[] = [];
      const selectedDrafts = new Map<string, { row: IntervalRow; occupiedMs: number }>();

      for (const row of intervals.rows) {
        if (row.source !== 'draft' || row.alternative_key === null) {
          occupancyRows.push(row);
          continue;
        }
        const bounds = intervalMs(row.start_at, row.end_at);
        if (!bounds) continue;
        const occupiedMs = Math.max(
          0,
          Math.min(bounds.endMs, horizonEndMs) - Math.max(bounds.startMs, horizonStartMs),
        );
        const selected = selectedDrafts.get(row.alternative_key);
        if (!selected || occupiedMs > selected.occupiedMs) {
          selectedDrafts.set(row.alternative_key, { row, occupiedMs });
        }
      }
      occupancyRows.push(...Array.from(selectedDrafts.values(), ({ row }) => row));

      for (const row of occupancyRows) {
        const bounds = intervalMs(row.start_at, row.end_at);
        if (!bounds) continue;
        let acc = byLine.get(row.line_id);
        if (!acc) {
          acc = { wo: new Map(), draft: new Map() };
          byLine.set(row.line_id, acc);
        }
        accumulateByDay(
          row.source === 'wo' ? acc.wo : acc.draft,
          bounds.startMs,
          bounds.endMs,
          horizonStartMs,
          horizonEndMs,
        );
      }

      const lines: CapacityLineRow[] = linesResult.rows.map((line) => {
        const capacityHours =
          capacityByLine[line.id] !== undefined ? capacityByLine[line.id] : defaultCapacity;
        const acc = byLine.get(line.id);
        const days: CapacityDayCell[] = dayKeys.map((day) => {
          const woMs = acc?.wo.get(day) ?? 0;
          const draftMs = acc?.draft.get(day) ?? 0;
          const occupiedHours = (woMs + draftMs) / MS_PER_HOUR;
          const utilisationPct =
            capacityHours !== null && capacityHours > 0
              ? Math.round((occupiedHours / capacityHours) * 1000) / 10
              : null;
          return {
            day,
            occupiedHours: Math.round(occupiedHours * 100) / 100,
            capacityHours,
            utilisationPct,
            sourceWoHours: Math.round((woMs / MS_PER_HOUR) * 100) / 100,
            sourceDraftHours: Math.round((draftMs / MS_PER_HOUR) * 100) / 100,
          };
        });
        return {
          lineId: line.id,
          lineCode: line.code,
          lineName: line.name,
          capacityHoursPerDay: capacityHours,
          days,
        };
      });

      return {
        ok: true,
        horizonDays,
        horizonStart,
        horizonEnd,
        lines,
      };
    });
  } catch (error) {
    console.error('[scheduler/capacity/loadSchedulerCapacity] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

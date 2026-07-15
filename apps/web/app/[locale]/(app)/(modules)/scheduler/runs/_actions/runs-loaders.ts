'use server';

/**
 * F4 / P1-16 — read-only loaders for /scheduler/runs (+ run detail).
 * Own read path over scheduler_runs / scheduler_assignments — does not touch
 * scheduler-actions.ts (owned by another lane).
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  hasPermission,
  type OrgActionContext,
} from '../../../planning/work-orders/_actions/shared';

const SCHEDULER_READ_PERMISSION = 'scheduler.run.read';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function isObjectJson(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type SchedulerRunListItem = {
  runId: string;
  status: string;
  runType: string;
  horizonDays: number;
  lineIds: string[] | null;
  lineLabels: string[];
  assignmentCount: number;
  approvedCount: number;
  draftCount: number;
  applied: boolean;
  queuedAt: string;
  completedAt: string | null;
  optimizerVersion: string;
  solveDurationMs: number | null;
};

export type SchedulerRunAssignmentItem = {
  id: string;
  woId: string;
  woNumber: string;
  lineId: string | null;
  lineLabel: string | null;
  status: string;
  sequenceIndex: string | null;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  changeoverMinutes: string | null;
};

export type ListSchedulerRunsResult =
  | { ok: true; runs: SchedulerRunListItem[] }
  | { ok: false; error: 'forbidden' | 'persistence_failed' };

export type GetSchedulerRunDetailResult =
  | {
      ok: true;
      run: SchedulerRunListItem;
      assignments: SchedulerRunAssignmentItem[];
    }
  | { ok: false; error: 'forbidden' | 'not_found' | 'persistence_failed' };

type RunRow = {
  run_id: string;
  status: string;
  run_type: string;
  horizon_days: number;
  line_ids: string[] | null;
  output_summary: unknown;
  queued_at: string | Date;
  completed_at: string | Date | null;
  optimizer_version: string;
  solve_duration_ms: number | null;
  assignment_count: string | number;
  approved_count: string | number;
  draft_count: string | number;
};

type LineRow = { id: string; code: string; name: string };

type AssignmentRow = {
  id: string;
  wo_id: string;
  wo_number: string | null;
  line_id: string | null;
  status: string;
  sequence_index: string | null;
  planned_start_at: string | Date | null;
  planned_end_at: string | Date | null;
  changeover_minutes: string | null;
};

function toIso(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function asCount(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isApplied(outputSummary: unknown): boolean {
  return isObjectJson(outputSummary) && typeof outputSummary.applied_at === 'string';
}

function mapRun(row: RunRow, lineById: Record<string, LineRow>): SchedulerRunListItem {
  const lineIds = row.line_ids;
  const lineLabels = (lineIds ?? [])
    .map((id) => {
      const line = lineById[id];
      return line ? `${line.code} — ${line.name}` : id.slice(0, 8);
    })
    .filter(Boolean);

  return {
    runId: row.run_id,
    status: row.status,
    runType: row.run_type,
    horizonDays: row.horizon_days,
    lineIds,
    lineLabels,
    assignmentCount: asCount(row.assignment_count),
    approvedCount: asCount(row.approved_count),
    draftCount: asCount(row.draft_count),
    applied: isApplied(row.output_summary),
    queuedAt: toIso(row.queued_at) ?? '',
    completedAt: toIso(row.completed_at),
    optimizerVersion: row.optimizer_version,
    solveDurationMs: row.solve_duration_ms,
  };
}

async function loadLineMap(ctx: OrgActionContext): Promise<Record<string, LineRow>> {
  const { rows } = await ctx.client.query<LineRow>(
    `select id::text, code, name
       from public.production_lines
      where org_id = app.current_org_id()`,
  );
  const map: Record<string, LineRow> = {};
  for (const row of rows) map[row.id] = row;
  return map;
}

export async function listSchedulerRuns(): Promise<ListSchedulerRunsResult> {
  try {
    return await withOrgContext(async (ctx: OrgActionContext): Promise<ListSchedulerRunsResult> => {
      if (!(await hasPermission(ctx, SCHEDULER_READ_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const lineById = await loadLineMap(ctx);
      const { rows } = await ctx.client.query<RunRow>(
        `select
           r.run_id::text,
           r.status,
           r.run_type,
           r.horizon_days,
           r.line_ids,
           r.output_summary,
           r.queued_at,
           r.completed_at,
           r.optimizer_version,
           r.solve_duration_ms,
           coalesce(a.assignment_count, 0) as assignment_count,
           coalesce(a.approved_count, 0) as approved_count,
           coalesce(a.draft_count, 0) as draft_count
         from public.scheduler_runs r
         left join lateral (
           select
             count(*)::int as assignment_count,
             count(*) filter (where sa.status = 'approved')::int as approved_count,
             count(*) filter (where sa.status = 'draft')::int as draft_count
           from public.scheduler_assignments sa
           where sa.org_id = app.current_org_id()
             and sa.run_id = r.run_id
         ) a on true
        where r.org_id = app.current_org_id()
        order by r.completed_at desc nulls last, r.queued_at desc
        limit 100`,
      );

      return { ok: true, runs: rows.map((row) => mapRun(row, lineById)) };
    });
  } catch (error) {
    console.error('[scheduler/runs/listSchedulerRuns] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function getSchedulerRunDetail(
  runId: string,
): Promise<GetSchedulerRunDetailResult> {
  const id = runId?.trim() ?? '';
  if (!isUuid(id)) return { ok: false, error: 'not_found' };

  try {
    return await withOrgContext(async (ctx: OrgActionContext): Promise<GetSchedulerRunDetailResult> => {
      if (!(await hasPermission(ctx, SCHEDULER_READ_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const lineById = await loadLineMap(ctx);
      const { rows } = await ctx.client.query<RunRow>(
        `select
           r.run_id::text,
           r.status,
           r.run_type,
           r.horizon_days,
           r.line_ids,
           r.output_summary,
           r.queued_at,
           r.completed_at,
           r.optimizer_version,
           r.solve_duration_ms,
           coalesce(a.assignment_count, 0) as assignment_count,
           coalesce(a.approved_count, 0) as approved_count,
           coalesce(a.draft_count, 0) as draft_count
         from public.scheduler_runs r
         left join lateral (
           select
             count(*)::int as assignment_count,
             count(*) filter (where sa.status = 'approved')::int as approved_count,
             count(*) filter (where sa.status = 'draft')::int as draft_count
           from public.scheduler_assignments sa
           where sa.org_id = app.current_org_id()
             and sa.run_id = r.run_id
         ) a on true
        where r.org_id = app.current_org_id()
          and r.run_id = $1::uuid
        limit 1`,
        [id],
      );

      const runRow = rows[0];
      if (!runRow) return { ok: false, error: 'not_found' };

      const assignments = await ctx.client.query<AssignmentRow>(
        `select
           sa.id::text,
           sa.wo_id::text,
           wo.wo_number,
           sa.line_id,
           sa.status,
           sa.sequence_index::text,
           sa.planned_start_at,
           sa.planned_end_at,
           sa.changeover_minutes::text
         from public.scheduler_assignments sa
         left join public.work_orders wo
           on wo.org_id = app.current_org_id()
          and wo.id = sa.wo_id
        where sa.org_id = app.current_org_id()
          and sa.run_id = $1::uuid
        order by sa.sequence_index nulls last, sa.planned_start_at nulls last`,
        [id],
      );

      return {
        ok: true,
        run: mapRun(runRow, lineById),
        assignments: assignments.rows.map((row) => {
          const line = row.line_id ? lineById[row.line_id] : null;
          return {
            id: row.id,
            woId: row.wo_id,
            woNumber: row.wo_number ?? row.wo_id.slice(0, 8),
            lineId: row.line_id,
            lineLabel: line ? `${line.code} — ${line.name}` : row.line_id,
            status: row.status,
            sequenceIndex: row.sequence_index,
            plannedStartAt: toIso(row.planned_start_at),
            plannedEndAt: toIso(row.planned_end_at),
            changeoverMinutes: row.changeover_minutes,
          };
        }),
      };
    });
  } catch (error) {
    console.error('[scheduler/runs/getSchedulerRunDetail] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

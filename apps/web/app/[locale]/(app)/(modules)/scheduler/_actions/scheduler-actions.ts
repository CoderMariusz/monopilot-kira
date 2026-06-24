'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  hasPermission,
  type OrgActionContext,
} from '../../planning/work-orders/_actions/shared';
import { sequenceWorkOrders } from './sequence-solver';
import type {
  ApplyScheduleResult,
  ChangeoverMatrixEntry,
  JsonValue,
  ListChangeoverMatrixResult,
  SchedulerAssignment,
  SchedulerRunResult,
  SchedulerRunRow,
  UpsertChangeoverMatrixEntryResult,
  WorkOrderForScheduling,
} from './scheduler-types';

const SCHEDULER_RUN_DISPATCH_PERMISSION = 'scheduler.run.dispatch';
const SCHEDULER_MATRIX_READ_PERMISSION = 'scheduler.matrix.read';
const SCHEDULER_MATRIX_EDIT_PERMISSION = 'scheduler.matrix.edit';
const OPTIMIZER_VERSION = 'e8-greedy-v1';
const OPEN_WO_STATUSES = ['DRAFT', 'RELEASED'] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const SCHEDULER_RUN_COMPLETED_EVENT = 'scheduler.run.completed';
const PLANNING_SCHEDULE_PUBLISHED_EVENT = 'planning.schedule.published';

const RUN_SELECT = `
  run_id::text,
  org_id::text,
  site_id::text,
  requested_by::text,
  status,
  horizon_days,
  line_ids,
  include_forecast,
  optimizer_version,
  run_type,
  input_snapshot,
  output_summary,
  solve_duration_ms,
  error_message,
  queued_at,
  started_at,
  completed_at,
  created_at,
  updated_at`;

const ASSIGNMENT_SELECT = `
  id::text,
  org_id::text,
  site_id::text,
  run_id::text,
  wo_id::text,
  line_id,
  status,
  sequence_index::text,
  planned_start_at,
  planned_end_at,
  changeover_minutes::text,
  optimizer_score::text,
  override_original_line_id,
  override_original_start_at,
  override_reason_code,
  override_by::text,
  override_at,
  approved_by::text,
  approved_at,
  ext,
  created_at,
  updated_at`;

const MATRIX_SELECT = `
  id::text,
  org_id::text,
  site_id::text,
  version_id::text,
  line_id,
  allergen_from,
  allergen_to,
  changeover_minutes::text,
  requires_cleaning,
  requires_atp,
  risk_level,
  notes,
  created_at,
  updated_at`;

// cm-qualified variant of MATRIX_SELECT for loadChangeoverMatrixForRun, which joins
// changeover_matrix (cm) ⋈ changeover_matrix_versions (cmv). id/org_id/site_id (and
// created_at/updated_at) exist in BOTH tables, so the bare MATRIX_SELECT is ambiguous
// (Postgres 42702 "column reference id is ambiguous") — qualify every column with cm.
const MATRIX_SELECT_CM = `
  cm.id::text,
  cm.org_id::text,
  cm.site_id::text,
  cm.version_id::text,
  cm.line_id,
  cm.allergen_from,
  cm.allergen_to,
  cm.changeover_minutes::text,
  cm.requires_cleaning,
  cm.requires_atp,
  cm.risk_level,
  cm.notes,
  cm.created_at,
  cm.updated_at`;

function isUuid(value: string | null | undefined): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeRunInput(input: { lineId?: string; horizonDays?: number } | undefined):
  | { ok: true; lineId: string | null; horizonDays: number }
  | { ok: false } {
  const horizonDays = Math.trunc(input?.horizonDays ?? 7);
  if (horizonDays < 1 || horizonDays > 30) return { ok: false };
  const lineId = input?.lineId?.trim() || null;
  if (lineId !== null && !isUuid(lineId)) return { ok: false };
  return { ok: true, lineId, horizonDays };
}

function isObjectJson(value: JsonValue | null): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function wasApplied(run: SchedulerRunRow): boolean {
  return isObjectJson(run.output_summary) && typeof run.output_summary.applied_at === 'string';
}

function totalChangeover(assignments: Array<{ cumulative_changeover_cost: number }>): number {
  return assignments.at(-1)?.cumulative_changeover_cost ?? 0;
}

async function loadActiveVersionId(ctx: OrgActionContext): Promise<string | null> {
  const { rows } = await ctx.client.query<{ id: string }>(
    `select id::text
       from public.changeover_matrix_versions
      where org_id = app.current_org_id()
        and is_active = true
      order by version_number desc
      limit 1`,
  );
  return rows[0]?.id ?? null;
}

async function loadChangeoverMatrixForRun(
  ctx: OrgActionContext,
  lineId: string | null,
): Promise<ChangeoverMatrixEntry[]> {
  const { rows } = await ctx.client.query<ChangeoverMatrixEntry>(
    `select ${MATRIX_SELECT_CM}
       from public.changeover_matrix cm
       join public.changeover_matrix_versions cmv
         on cmv.org_id = cm.org_id
        and cmv.id = cm.version_id
        and cmv.is_active = true
      where cm.org_id = app.current_org_id()
        and (
          ($1::text is null and cm.line_id is null)
          or ($1::text is not null and (cm.line_id is null or cm.line_id = $1::text))
        )
      order by cm.line_id nulls first, cm.allergen_from, cm.allergen_to`,
    [lineId],
  );
  return rows;
}

async function loadOpenWorkOrders(
  ctx: OrgActionContext,
  lineId: string | null,
  horizonDays: number,
): Promise<WorkOrderForScheduling[]> {
  const horizonEnd = new Date(Date.now() + horizonDays * DAY_MS).toISOString();
  const { rows } = await ctx.client.query<WorkOrderForScheduling>(
    `select
       wo.id::text,
       wo.org_id::text,
       wo.site_id::text,
       wo.wo_number,
       wo.product_id::text,
       i.item_code,
       i.name as item_name,
       wo.status,
       wo.planned_quantity::text,
       wo.uom,
       wo.production_line_id::text,
       wo.planned_start_date,
       wo.planned_end_date,
       wo.scheduled_start_time,
       wo.scheduled_end_time,
       coalesce(wo.planned_end_date, wo.scheduled_end_time, wo.planned_start_date, wo.created_at) as due_date,
       coalesce(ap.allergen_ids, '{}'::text[]) as allergen_ids
     from public.work_orders wo
     left join public.items i
       on i.org_id = wo.org_id
      and i.id = wo.product_id
     left join lateral (
       select array_agg(distinct iap.allergen_code order by iap.allergen_code) as allergen_ids
         from public.item_allergen_profiles iap
        where iap.org_id = wo.org_id
          and iap.item_id = wo.product_id
     ) ap on true
    where wo.org_id = app.current_org_id()
      and wo.status = any($1::varchar[])
      and coalesce(wo.planned_start_date, wo.scheduled_start_time, wo.created_at) < $2::timestamptz
      and ($3::uuid is null or wo.production_line_id = $3::uuid)
    order by due_date asc, wo.id asc`,
    [[...OPEN_WO_STATUSES], horizonEnd, lineId],
  );
  return rows;
}

async function insertSchedulerRun(
  ctx: OrgActionContext,
  params: {
    lineId: string | null;
    horizonDays: number;
    workOrderCount: number;
    assignmentCount: number;
    totalChangeoverCost: number;
    solveDurationMs: number;
  },
): Promise<SchedulerRunRow> {
  const { rows } = await ctx.client.query<SchedulerRunRow>(
    `insert into public.scheduler_runs
       (org_id, requested_by, status, horizon_days, line_ids, optimizer_version, run_type,
        input_snapshot, output_summary, solve_duration_ms, started_at, completed_at)
     values
       (app.current_org_id(), $1::uuid, 'completed', $2::integer, $3::text[], $4::text, 'schedule',
        $5::jsonb, $6::jsonb, $7::integer, now(), now())
     returning ${RUN_SELECT}`,
    [
      ctx.userId,
      params.horizonDays,
      params.lineId ? [params.lineId] : null,
      OPTIMIZER_VERSION,
      JSON.stringify({
        line_id: params.lineId,
        horizon_days: params.horizonDays,
        open_work_order_count: params.workOrderCount,
      }),
      JSON.stringify({
        assignment_count: params.assignmentCount,
        total_changeover_cost: params.totalChangeoverCost,
      }),
      params.solveDurationMs,
    ],
  );
  return rows[0];
}

async function insertSchedulerAssignments(
  ctx: OrgActionContext,
  runId: string,
  lineId: string | null,
  assignments: ReturnType<typeof sequenceWorkOrders>,
): Promise<SchedulerAssignment[]> {
  if (assignments.length === 0) return [];

  const payload = assignments.map((assignment) => ({
    site_id: assignment.work_order.site_id,
    wo_id: assignment.wo_id,
    line_id: lineId ?? assignment.line_id,
    sequence_index: assignment.sequence_index,
    planned_start_at: assignment.planned_start_at,
    planned_end_at: assignment.planned_end_at,
    changeover_minutes: assignment.changeover_cost,
    optimizer_score: assignment.cumulative_changeover_cost,
    ext: {
      allergen_profile_key: assignment.allergen_profile_key,
      cumulative_changeover_cost: assignment.cumulative_changeover_cost,
    },
  }));

  const { rows } = await ctx.client.query<SchedulerAssignment>(
    `insert into public.scheduler_assignments
       (org_id, site_id, run_id, wo_id, line_id, status, sequence_index, planned_start_at,
        planned_end_at, changeover_minutes, optimizer_score, ext)
     select app.current_org_id(),
            x.site_id::uuid,
            $1::uuid,
            x.wo_id::uuid,
            x.line_id::text,
            'draft',
            x.sequence_index::numeric,
            x.planned_start_at::timestamptz,
            x.planned_end_at::timestamptz,
            x.changeover_minutes::numeric,
            x.optimizer_score::numeric,
            x.ext::jsonb
       from jsonb_to_recordset($2::jsonb) as x(
            site_id text,
            wo_id text,
            line_id text,
            sequence_index numeric,
            planned_start_at text,
            planned_end_at text,
            changeover_minutes numeric,
            optimizer_score numeric,
            ext jsonb
       )
     returning ${ASSIGNMENT_SELECT}`,
    [runId, JSON.stringify(payload)],
  );
  return rows;
}

async function loadRun(ctx: OrgActionContext, runId: string, lockForUpdate = false): Promise<SchedulerRunRow | null> {
  const { rows } = await ctx.client.query<SchedulerRunRow>(
    `select ${RUN_SELECT}
       from public.scheduler_runs
      where org_id = app.current_org_id()
        and run_id = $1::uuid
      limit 1
      ${lockForUpdate ? 'for update' : ''}`,
    [runId],
  );
  return rows[0] ?? null;
}

async function loadAssignments(ctx: OrgActionContext, runId: string): Promise<SchedulerAssignment[]> {
  const { rows } = await ctx.client.query<SchedulerAssignment>(
    `select ${ASSIGNMENT_SELECT}
       from public.scheduler_assignments
      where org_id = app.current_org_id()
        and run_id = $1::uuid
        and status not in ('rejected', 'cancelled')
      order by sequence_index asc nulls last, created_at asc`,
    [runId],
  );
  return rows;
}

async function markRunApplied(
  ctx: OrgActionContext,
  runId: string,
  assignmentCount: number,
): Promise<SchedulerRunRow> {
  const { rows } = await ctx.client.query<SchedulerRunRow>(
    `update public.scheduler_runs
        set output_summary = coalesce(output_summary, '{}'::jsonb)
             || jsonb_build_object(
                  'applied_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                  'applied_by', $2::text,
                  'applied_assignment_count', $3::integer
                ),
            updated_at = now()
      where org_id = app.current_org_id()
        and run_id = $1::uuid
      returning ${RUN_SELECT}`,
    [runId, ctx.userId, assignmentCount],
  );
  return rows[0];
}

async function applyAssignmentToWorkOrder(
  ctx: OrgActionContext,
  runId: string,
  assignment: SchedulerAssignment,
): Promise<boolean> {
  const result = await ctx.client.query(
    `update public.work_orders wo
        set scheduled_start_time = $2::timestamptz,
            scheduled_end_time = $3::timestamptz,
            production_line_id = coalesce($4::uuid, wo.production_line_id),
            ext_jsonb = coalesce(wo.ext_jsonb, '{}'::jsonb)
              || jsonb_build_object(
                   'scheduler_run_id', $5::text,
                   'scheduler_sequence_index', $6::numeric
                 ),
            updated_by = $7::uuid,
            updated_at = now()
      where wo.org_id = app.current_org_id()
        and wo.id = $1::uuid
        and wo.status in ('DRAFT', 'RELEASED')`,
    [
      assignment.wo_id,
      assignment.planned_start_at,
      assignment.planned_end_at,
      isUuid(assignment.line_id) ? assignment.line_id : null,
      runId,
      assignment.sequence_index,
      ctx.userId,
    ],
  );
  return Number(result.rowCount ?? 0) > 0;
}

async function approveSchedulerAssignment(
  ctx: OrgActionContext,
  assignment: SchedulerAssignment,
): Promise<SchedulerAssignment | null> {
  const { rows } = await ctx.client.query<SchedulerAssignment>(
    `update public.scheduler_assignments
        set approved_by = $2::uuid,
            approved_at = now(),
            status = 'approved',
            updated_at = now()
      where org_id = app.current_org_id()
        and id = $1::uuid
        and status not in ('rejected', 'cancelled')
      returning ${ASSIGNMENT_SELECT}`,
    [assignment.id, ctx.userId],
  );
  return rows[0] ?? null;
}

async function emitSchedulerRunCompletedEvent(
  ctx: OrgActionContext,
  runId: string,
  counts: { work_orders: number; assignments: number; total_changeover_cost: number },
): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values
       (app.current_org_id(), $1, 'scheduler_run', $2::uuid, $3::jsonb, $4)`,
    [
      SCHEDULER_RUN_COMPLETED_EVENT,
      runId,
      JSON.stringify({ run_id: runId, actor_user_id: ctx.userId, counts }),
      OPTIMIZER_VERSION,
    ],
  );
}

async function emitSchedulePublishedEvent(
  ctx: OrgActionContext,
  runId: string,
  counts: { applied: number; stale: number },
): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values
       (app.current_org_id(), $1, 'scheduler_run', $2::uuid, $3::jsonb, $4)`,
    [
      PLANNING_SCHEDULE_PUBLISHED_EVENT,
      runId,
      JSON.stringify({ run_id: runId, actor_user_id: ctx.userId, counts }),
      OPTIMIZER_VERSION,
    ],
  );
}

async function updateMatrixById(
  ctx: OrgActionContext,
  entry: Partial<ChangeoverMatrixEntry> & { id: string },
): Promise<ChangeoverMatrixEntry | null> {
  const { rows } = await ctx.client.query<ChangeoverMatrixEntry>(
    `update public.changeover_matrix cm
        set site_id = case when $2::boolean then $3::uuid else cm.site_id end,
            version_id = coalesce($4::uuid, cm.version_id),
            line_id = case when $5::boolean then $6::text else cm.line_id end,
            allergen_from = coalesce(nullif($7::text, ''), cm.allergen_from),
            allergen_to = coalesce(nullif($8::text, ''), cm.allergen_to),
            changeover_minutes = coalesce($9::numeric, cm.changeover_minutes),
            requires_cleaning = coalesce($10::boolean, cm.requires_cleaning),
            requires_atp = coalesce($11::boolean, cm.requires_atp),
            risk_level = coalesce($12::text, cm.risk_level),
            notes = case when $13::boolean then $14::text else cm.notes end,
            updated_at = now()
      where cm.org_id = app.current_org_id()
        and cm.id = $1::uuid
      returning ${MATRIX_SELECT}`,
    [
      entry.id,
      entry.site_id !== undefined,
      entry.site_id ?? null,
      entry.version_id ?? null,
      entry.line_id !== undefined,
      entry.line_id ?? null,
      entry.allergen_from ?? '',
      entry.allergen_to ?? '',
      entry.changeover_minutes ?? null,
      entry.requires_cleaning ?? null,
      entry.requires_atp ?? null,
      entry.risk_level ?? null,
      entry.notes !== undefined,
      entry.notes ?? null,
    ],
  );
  return rows[0] ?? null;
}

async function upsertMatrixByPair(
  ctx: OrgActionContext,
  entry: Partial<ChangeoverMatrixEntry>,
): Promise<ChangeoverMatrixEntry | null> {
  const versionId = entry.version_id ?? (await loadActiveVersionId(ctx));
  const allergenFrom = entry.allergen_from?.trim();
  const allergenTo = entry.allergen_to?.trim();
  const changeoverMinutes = Number(entry.changeover_minutes);
  if (!versionId || !allergenFrom || !allergenTo || !Number.isFinite(changeoverMinutes) || changeoverMinutes < 0) {
    return null;
  }

  const lineId = entry.line_id ?? null;
  const update = await ctx.client.query<ChangeoverMatrixEntry>(
    `update public.changeover_matrix cm
        set site_id = $5::uuid,
            changeover_minutes = $6::numeric,
            requires_cleaning = $7::boolean,
            requires_atp = $8::boolean,
            risk_level = $9::text,
            notes = $10::text,
            updated_at = now()
      where cm.org_id = app.current_org_id()
        and cm.version_id = $1::uuid
        and cm.line_id is not distinct from $2::text
        and cm.allergen_from = $3::text
        and cm.allergen_to = $4::text
      returning ${MATRIX_SELECT}`,
    [
      versionId,
      lineId,
      allergenFrom,
      allergenTo,
      entry.site_id ?? null,
      changeoverMinutes,
      entry.requires_cleaning ?? false,
      entry.requires_atp ?? false,
      entry.risk_level ?? 'low',
      entry.notes ?? null,
    ],
  );
  if (update.rows[0]) return update.rows[0];

  const insert = await ctx.client.query<ChangeoverMatrixEntry>(
    `insert into public.changeover_matrix
       (org_id, site_id, version_id, line_id, allergen_from, allergen_to,
        changeover_minutes, requires_cleaning, requires_atp, risk_level, notes)
     values
       (app.current_org_id(), $1::uuid, $2::uuid, $3::text, $4::text, $5::text,
        $6::numeric, $7::boolean, $8::boolean, $9::text, $10::text)
     returning ${MATRIX_SELECT}`,
    [
      entry.site_id ?? null,
      versionId,
      lineId,
      allergenFrom,
      allergenTo,
      changeoverMinutes,
      entry.requires_cleaning ?? false,
      entry.requires_atp ?? false,
      entry.risk_level ?? 'low',
      entry.notes ?? null,
    ],
  );
  return insert.rows[0] ?? null;
}

export async function runScheduler(input?: { lineId?: string; horizonDays?: number }): Promise<SchedulerRunResult> {
  const normalized = normalizeRunInput(input);
  if (!normalized.ok) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async (ctx: OrgActionContext): Promise<SchedulerRunResult> => {
      if (!(await hasPermission(ctx, SCHEDULER_RUN_DISPATCH_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const started = Date.now();
      const [workOrders, matrix] = await Promise.all([
        loadOpenWorkOrders(ctx, normalized.lineId, normalized.horizonDays),
        loadChangeoverMatrixForRun(ctx, normalized.lineId),
      ]);
      const sequenced = sequenceWorkOrders(workOrders, matrix);
      const solveDurationMs = Date.now() - started;
      const run = await insertSchedulerRun(ctx, {
        lineId: normalized.lineId,
        horizonDays: normalized.horizonDays,
        workOrderCount: workOrders.length,
        assignmentCount: sequenced.length,
        totalChangeoverCost: totalChangeover(sequenced),
        solveDurationMs,
      });
      const assignments = await insertSchedulerAssignments(ctx, run.run_id, normalized.lineId, sequenced);
      await emitSchedulerRunCompletedEvent(ctx, run.run_id, {
        work_orders: workOrders.length,
        assignments: assignments.length,
        total_changeover_cost: totalChangeover(sequenced),
      });
      return { ok: true, run, assignments };
    });
  } catch (error) {
    console.error('[scheduler/runScheduler] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function applySchedule(runId: string): Promise<ApplyScheduleResult> {
  if (!isUuid(runId)) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async (ctx: OrgActionContext): Promise<ApplyScheduleResult> => {
      if (!(await hasPermission(ctx, SCHEDULER_RUN_DISPATCH_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const run = await loadRun(ctx, runId, true);
      if (!run) return { ok: false, error: 'not_found' };

      const assignments = await loadAssignments(ctx, runId);
      if (wasApplied(run)) return { ok: true, run, assignments, applied: false, stale: [] };

      // TODO: enforce separate approver-role SoD once scheduler roles are split.
      const appliedAssignments: SchedulerAssignment[] = [];
      const staleAssignments: SchedulerAssignment[] = [];
      for (const assignment of assignments) {
        const applied = await applyAssignmentToWorkOrder(ctx, runId, assignment);
        if (!applied) {
          staleAssignments.push(assignment);
          continue;
        }
        const approved = await approveSchedulerAssignment(ctx, assignment);
        if (!approved) {
          throw new Error(`scheduler assignment ${assignment.id} could not be approved after WO apply`);
        }
        appliedAssignments.push(approved);
      }

      const appliedRun = await markRunApplied(ctx, runId, appliedAssignments.length);
      await emitSchedulePublishedEvent(ctx, runId, {
        applied: appliedAssignments.length,
        stale: staleAssignments.length,
      });
      return {
        ok: true,
        run: appliedRun,
        assignments: [...appliedAssignments, ...staleAssignments],
        applied: appliedAssignments,
        stale: staleAssignments,
      };
    });
  } catch (error) {
    console.error('[scheduler/applySchedule] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function listChangeoverMatrix(): Promise<ListChangeoverMatrixResult> {
  try {
    return await withOrgContext(async (ctx: OrgActionContext): Promise<ListChangeoverMatrixResult> => {
      if (!(await hasPermission(ctx, SCHEDULER_MATRIX_READ_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const { rows } = await ctx.client.query<ChangeoverMatrixEntry>(
        `select ${MATRIX_SELECT}
           from public.changeover_matrix
          where org_id = app.current_org_id()
          order by line_id nulls first, allergen_from, allergen_to`,
      );
      return { ok: true, entries: rows };
    });
  } catch (error) {
    console.error('[scheduler/listChangeoverMatrix] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function upsertChangeoverMatrixEntry(
  entry: Partial<ChangeoverMatrixEntry>,
): Promise<UpsertChangeoverMatrixEntryResult> {
  try {
    return await withOrgContext(async (ctx: OrgActionContext): Promise<UpsertChangeoverMatrixEntryResult> => {
      if (!(await hasPermission(ctx, SCHEDULER_MATRIX_EDIT_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const result = entry.id
        ? await updateMatrixById(ctx, { ...entry, id: entry.id })
        : await upsertMatrixByPair(ctx, entry);
      if (!result) return { ok: false, error: entry.id ? 'not_found' : 'invalid_input' };
      return { ok: true, entry: result };
    });
  } catch (error) {
    console.error('[scheduler/upsertChangeoverMatrixEntry] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

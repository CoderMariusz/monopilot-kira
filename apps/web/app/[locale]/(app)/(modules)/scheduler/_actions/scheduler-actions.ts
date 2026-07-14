'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { getActiveSiteId } from '../../../../../../lib/site/site-context';
import {
  hasPermission,
  type OrgActionContext,
} from '../../planning/work-orders/_actions/shared';
import { sequenceWorkOrders, DEFAULT_SEQUENCE_SOLVER_CONFIG, buildPreoccupiedSeed } from './sequence-solver';
import { loadPmWindows, pmBlockHoursFromConfigParams } from './pm-windows';
import type {
  ApplyScheduleResult,
  ChangeoverMatrixEntry,
  JsonValue,
  GetLatestSchedulerRunResult,
  ListChangeoverMatrixResult,
  OmittedWorkOrder,
  SchedulerAssignment,
  SchedulerConfigRow,
  SchedulerRunResult,
  SchedulerRunRow,
  SequenceSolverConfig,
  UpsertChangeoverMatrixEntryResult,
  WorkOrderForScheduling,
} from './scheduler-types';

const SCHEDULER_RUN_DISPATCH_PERMISSION = 'scheduler.run.dispatch';
const SCHEDULER_RUN_READ_PERMISSION = 'scheduler.run.read';
const SCHEDULER_ASSIGNMENT_APPROVE_PERMISSION = 'scheduler.assignment.approve';
const SCHEDULER_MATRIX_READ_PERMISSION = 'scheduler.matrix.read';
const SCHEDULER_MATRIX_EDIT_PERMISSION = 'scheduler.matrix.edit';
const OPTIMIZER_VERSION = 'e8-greedy-v1';
/** Only released WOs are schedulable — drafts are not releasable onto the board. */
const SCHEDULABLE_WO_STATUSES = ['RELEASED'] as const;
/** WOs already occupying a line before the solver places released WOs. */
const OCCUPYING_WO_STATUSES = ['IN_PROGRESS', 'RELEASED'] as const;
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

function isObjectJson(value: JsonValue | null): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function wasApplied(run: SchedulerRunRow): boolean {
  return isObjectJson(run.output_summary) && typeof run.output_summary.applied_at === 'string';
}

function totalChangeover(assignments: Array<{ cumulative_changeover_cost: number }>): number {
  return assignments.at(-1)?.cumulative_changeover_cost ?? 0;
}

function numericWeight(value: string | number | null | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cloneDefaultSolverConfig(): SequenceSolverConfig {
  return { ...DEFAULT_SEQUENCE_SOLVER_CONFIG, pmWindows: [] };
}

function solverConfigFromRow(row: SchedulerConfigRow | null): SequenceSolverConfig {
  if (!row) return cloneDefaultSolverConfig();
  const capacity = row.capacity_hours_per_day === null ? null : numericWeight(row.capacity_hours_per_day, 0);
  return {
    sequencingStrategy: row.sequencing_strategy,
    changeoverWeight: numericWeight(row.changeover_weight, 1),
    duedateWeight: numericWeight(row.duedate_weight, 1),
    utilizationWeight: numericWeight(row.utilization_weight, 1),
    capacityHoursPerDay: capacity,
    respectPmWindows: row.respect_pm_windows,
    pmWindows: [],
  };
}

function capacityHoursByLineFromConfigs(rows: SchedulerConfigRow[]): Record<string, number | null> {
  const byLine: Record<string, number | null> = {};
  for (const row of rows) {
    if (row.line_id === null) continue;
    byLine[row.line_id] =
      row.capacity_hours_per_day === null ? null : numericWeight(row.capacity_hours_per_day, 0);
  }
  return byLine;
}

async function loadSchedulerConfig(
  ctx: OrgActionContext,
  lineId: string | null,
): Promise<SchedulerConfigRow | null> {
  const { rows } = await ctx.client.query<SchedulerConfigRow>(
    `select
       id::text,
       org_id::text,
       site_id::text,
       line_id,
       default_horizon_days,
       optimizer_version,
       sequencing_strategy,
       capacity_hours_per_day::text,
       changeover_weight::text,
       duedate_weight::text,
       utilization_weight::text,
       respect_pm_windows,
       allow_alternate_routings,
       params,
       created_by::text,
       updated_by::text,
       created_at,
       updated_at
     from public.scheduler_config
    where org_id = app.current_org_id()
      and (
        ($1::text is not null and line_id = $1::text)
        or line_id is null
      )
    order by line_id nulls last
    limit 1`,
    [lineId],
  );
  return rows[0] ?? null;
}

async function loadAllSchedulerConfigs(ctx: OrgActionContext): Promise<SchedulerConfigRow[]> {
  const { rows } = await ctx.client.query<SchedulerConfigRow>(
    `select
       id::text,
       org_id::text,
       site_id::text,
       line_id,
       default_horizon_days,
       optimizer_version,
       sequencing_strategy,
       capacity_hours_per_day::text,
       changeover_weight::text,
       duedate_weight::text,
       utilization_weight::text,
       respect_pm_windows,
       allow_alternate_routings,
       params,
       created_by::text,
       updated_by::text,
       created_at,
       updated_at
     from public.scheduler_config
    where org_id = app.current_org_id()
    order by line_id nulls first`,
  );
  return rows;
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

async function ensureActiveMatrixVersion(ctx: OrgActionContext): Promise<string> {
  const existing = await loadActiveVersionId(ctx);
  if (existing) return existing;

  const { rows } = await ctx.client.query<{ id: string }>(
    `insert into public.changeover_matrix_versions
       (org_id, version_number, label, is_active, status, created_by)
     values
       (app.current_org_id(),
        coalesce(
          (select max(cmv.version_number) + 1
             from public.changeover_matrix_versions cmv
            where cmv.org_id = app.current_org_id()),
          1
        ),
        'Default',
        true,
        'active',
        $1::uuid)
     on conflict (org_id) where is_active = true do nothing
     returning id::text`,
    [ctx.userId],
  );
  if (rows[0]?.id) return rows[0].id;

  const fallback = await loadActiveVersionId(ctx);
  if (!fallback) throw new Error('changeover_matrix_versions bootstrap failed');
  return fallback;
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

const WORK_ORDERS_FOR_SCHEDULING_SELECT = `select
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
       coalesce(ap.allergen_ids, '{}'::text[]) as allergen_ids,
       coalesce(routing_dur.routing_duration_ms, 0)::text as routing_duration_ms,
       coalesce(process_dur.process_duration_ms, 0)::text as process_duration_ms
     from public.work_orders wo
     left join public.items i
       on i.org_id = wo.org_id
      and i.id = wo.product_id
     left join public.production_lines pl
       on pl.org_id = wo.org_id
      and pl.id = wo.production_line_id
     left join lateral (
       select array_agg(distinct iap.allergen_code order by iap.allergen_code) as allergen_ids
         from public.item_allergen_profiles iap
        where iap.org_id = wo.org_id
          and iap.item_id = wo.product_id
     ) ap on true
     left join lateral (
       select
         round(
           (
             coalesce(sum(ro.setup_time_min), 0) * 60000
             + coalesce(
                 sum(ro.run_time_per_unit_sec::numeric * wo.planned_quantity::numeric) * 1000,
                 0
               )
           )
         )::bigint as routing_duration_ms
         from public.routings r
         join public.routing_operations ro
           on ro.routing_id = r.id
          and ro.org_id = r.org_id
        where r.org_id = wo.org_id
          and r.item_id = wo.product_id
          and r.status in ('active', 'approved')
          and (
            wo.production_line_id is null
            or ro.line_id = wo.production_line_id
          )
     ) routing_dur on true
     left join lateral (
       select
         round(
           coalesce(
             nullif(max(p.duration_hours::numeric), 0) * 3600000,
             case
               when max(p.throughput_per_hour::numeric) > 0
                 then (wo.planned_quantity::numeric / max(p.throughput_per_hour::numeric)) * 3600000
               else null
             end
           )
         )::bigint as process_duration_ms
         from public.npd_wip_processes p
         join public.prod_detail pd
           on pd.id = p.prod_detail_id
          and pd.org_id = p.org_id
        where p.org_id = wo.org_id
          and pd.item_id = wo.product_id
     ) process_dur on true`;

async function loadWorkOrdersForScheduling(
  ctx: OrgActionContext,
  mode: 'schedulable' | 'occupying',
  lineId: string | null,
  horizonDays: number,
  siteId: string | null,
): Promise<WorkOrderForScheduling[]> {
  const horizonEnd = new Date(Date.now() + horizonDays * DAY_MS).toISOString();
  const statuses = mode === 'schedulable' ? SCHEDULABLE_WO_STATUSES : OCCUPYING_WO_STATUSES;
  const lineRequired = mode === 'occupying' ? 'and wo.production_line_id is not null' : '';
  const occupancyFilter =
    mode === 'occupying'
      ? `and (
        wo.status = 'IN_PROGRESS'
        or (
          wo.scheduled_start_time is not null
          and wo.scheduled_end_time is not null
        )
      )`
      : '';
  const orderBy =
    mode === 'occupying'
      ? 'order by coalesce(wo.scheduled_end_time, wo.planned_end_date) asc, wo.id asc'
      : 'order by due_date asc, wo.id asc';

  const { rows } = await ctx.client.query<WorkOrderForScheduling>(
    `${WORK_ORDERS_FOR_SCHEDULING_SELECT}
    where wo.org_id = app.current_org_id()
      and wo.status = any($1::varchar[])
      ${lineRequired}
      and coalesce(wo.planned_start_date, wo.scheduled_start_time, wo.created_at) < $2::timestamptz
      and ($3::uuid is null or wo.production_line_id = $3::uuid)
      and (
        $4::uuid is null
        or wo.site_id = $4::uuid
        or (wo.site_id is null and pl.site_id = $4::uuid)
      )
      and (
        $4::uuid is null
        or wo.production_line_id is null
        or pl.site_id is null
        or pl.site_id = $4::uuid
      )
      ${occupancyFilter}
    ${orderBy}`,
    [[...statuses], horizonEnd, lineId, siteId],
  );
  return rows;
}

async function loadOpenWorkOrders(
  ctx: OrgActionContext,
  lineId: string | null,
  horizonDays: number,
  siteId: string | null,
): Promise<WorkOrderForScheduling[]> {
  return loadWorkOrdersForScheduling(ctx, 'schedulable', lineId, horizonDays, siteId);
}

async function loadLineOccupancy(
  ctx: OrgActionContext,
  lineId: string | null,
  horizonDays: number,
  siteId: string | null,
): Promise<WorkOrderForScheduling[]> {
  return loadWorkOrdersForScheduling(ctx, 'occupying', lineId, horizonDays, siteId);
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
    omitted: OmittedWorkOrder[];
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
        omitted_work_orders: params.omitted,
        omitted_count: params.omitted.length,
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
  assignments: Array<{
    wo_id: string;
    sequence_index: number;
    line_id: string | null;
    planned_start_at: string;
    planned_end_at: string | null;
    changeover_cost: number;
    cumulative_changeover_cost: number;
    allergen_profile_key: string;
    work_order: WorkOrderForScheduling;
  }>,
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
  counts: { work_orders: number; assignments: number; total_changeover_cost: number; omitted_count?: number },
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
  const versionId = entry.version_id ?? (await ensureActiveMatrixVersion(ctx));
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

export async function getLatestSchedulerRun(runId?: string): Promise<GetLatestSchedulerRunResult> {
  const requestedRunId = runId?.trim() || null;
  if (requestedRunId !== null && !isUuid(requestedRunId)) {
    return { ok: false, error: 'not_found' };
  }

  try {
    return await withOrgContext(async (ctx: OrgActionContext): Promise<GetLatestSchedulerRunResult> => {
      if (!(await hasPermission(ctx, SCHEDULER_RUN_READ_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const { rows } = await ctx.client.query<SchedulerRunRow>(
        requestedRunId
          ? `select ${RUN_SELECT}
               from public.scheduler_runs
              where org_id = app.current_org_id()
                and run_id = $1::uuid
                and status = 'completed'
              limit 1`
          : `select ${RUN_SELECT}
               from public.scheduler_runs
              where org_id = app.current_org_id()
                and status = 'completed'
              order by completed_at desc nulls last, created_at desc
              limit 1`,
        requestedRunId ? [requestedRunId] : [],
      );
      const run = rows[0];
      if (!run) return { ok: false, error: 'not_found' };

      const assignments = await loadAssignments(ctx, run.run_id);
      return { ok: true, run, assignments };
    });
  } catch (error) {
    console.error('[scheduler/getLatestSchedulerRun] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function runScheduler(input?: { lineId?: string; horizonDays?: number }): Promise<SchedulerRunResult> {
  const lineId = input?.lineId?.trim() || null;
  if (lineId !== null && !isUuid(lineId)) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async (ctx: OrgActionContext): Promise<SchedulerRunResult> => {
      if (!(await hasPermission(ctx, SCHEDULER_RUN_DISPATCH_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const schedulerConfigs =
        lineId === null ? await loadAllSchedulerConfigs(ctx) : [await loadSchedulerConfig(ctx, lineId)];
      const schedulerConfig =
        lineId === null
          ? (schedulerConfigs.find((row) => row?.line_id === null) ?? null)
          : (schedulerConfigs[0] ?? null);
      const horizonDays = Math.trunc(
        input?.horizonDays ?? schedulerConfig?.default_horizon_days ?? 7,
      );
      if (horizonDays < 1 || horizonDays > 30) return { ok: false, error: 'invalid_input' };

      const siteId = await getActiveSiteId({ client: ctx.client });

      const runNowMs = Date.now();
      const started = runNowMs;
      const [workOrders, matrix, occupying] = await Promise.all([
        loadOpenWorkOrders(ctx, lineId, horizonDays, siteId),
        loadChangeoverMatrixForRun(ctx, lineId),
        loadLineOccupancy(ctx, lineId, horizonDays, siteId),
      ]);
      const baseSolverConfig = solverConfigFromRow(schedulerConfig);
      const solverConfig: SequenceSolverConfig =
        schedulerConfig?.respect_pm_windows === true
          ? {
              ...baseSolverConfig,
              pmWindows: await loadPmWindows(
                ctx,
                lineId,
                horizonDays,
                pmBlockHoursFromConfigParams(schedulerConfig.params),
              ),
            }
          : baseSolverConfig;
      if (lineId === null && schedulerConfigs.length > 0) {
        solverConfig.capacityHoursPerDayByLine = capacityHoursByLineFromConfigs(
          schedulerConfigs.filter((row): row is SchedulerConfigRow => row !== null),
        );
      }
      const schedulableIds = new Set(workOrders.map((wo) => wo.id));
      solverConfig.nowMs = runNowMs;
      solverConfig.preoccupied = buildPreoccupiedSeed(
        occupying.filter((wo) => !schedulableIds.has(wo.id)),
        solverConfig,
      );
      const sequenced = sequenceWorkOrders(workOrders, matrix, solverConfig);
      const solveDurationMs = Date.now() - started;
      const run = await insertSchedulerRun(ctx, {
        lineId,
        horizonDays,
        workOrderCount: workOrders.length,
        assignmentCount: sequenced.assignments.length,
        totalChangeoverCost: totalChangeover(sequenced.assignments),
        solveDurationMs,
        omitted: sequenced.omitted,
      });
      const assignments = await insertSchedulerAssignments(ctx, run.run_id, lineId, sequenced.assignments);
      await emitSchedulerRunCompletedEvent(ctx, run.run_id, {
        work_orders: workOrders.length,
        assignments: assignments.length,
        total_changeover_cost: totalChangeover(sequenced.assignments),
        omitted_count: sequenced.omitted.length,
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
      if (!(await hasPermission(ctx, SCHEDULER_ASSIGNMENT_APPROVE_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const run = await loadRun(ctx, runId, true);
      if (!run) return { ok: false, error: 'not_found' };

      if (run.requested_by && run.requested_by === ctx.userId) {
        return { ok: false, error: 'sod_violation' };
      }

      const assignments = await loadAssignments(ctx, runId);
      if (wasApplied(run)) return { ok: true, run, assignments, applied: false, stale: [] };
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

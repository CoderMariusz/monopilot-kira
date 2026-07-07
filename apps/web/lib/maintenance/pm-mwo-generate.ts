/**
 * PM schedule → planned MWO generation core (shared by Server Actions + cron).
 *
 * Wave0: every query assumes org context is already set (app.current_org_id()).
 * Idempotent: at most one open-backlog MWO per schedule (advisory lock + mig 445
 * partial unique index).
 */

export type MwoState =
  | 'requested'
  | 'approved'
  | 'open'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type MwoPriority = 'low' | 'medium' | 'high' | 'critical';

export type MwoSource =
  | 'manual_request'
  | 'auto_downtime'
  | 'pm_schedule'
  | 'oee_trigger'
  | 'calibration_alert';

export type PmScheduleType = 'preventive' | 'calibration' | 'sanitation' | 'inspection';

export const OPEN_BACKLOG_STATES: readonly MwoState[] = [
  'requested',
  'approved',
  'open',
  'in_progress',
];

export type PmMwoQueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type PmMwoTxnContext = {
  orgId: string;
  actorUserId: string | null;
  client: PmMwoQueryClient;
};

export type GeneratePmMwoResult =
  | { ok: true; mwoId: string; mwoNumber: string; created: true }
  | { ok: true; mwoId: string; created: false; reason: 'already_open' }
  | { ok: false; reason: 'not_found' | 'inactive' | 'no_due_date' | 'not_due' | 'error'; message?: string };

export type PmScheduleDueEngineSummary = {
  schedulesScanned: number;
  created: number;
  skippedOpen: number;
  skippedNotDue: number;
  errors: number;
};

function scheduleTypeToMwoType(scheduleType: PmScheduleType): PmScheduleType {
  return scheduleType;
}

function scheduleTypeToSource(scheduleType: PmScheduleType): MwoSource {
  return scheduleType === 'calibration' ? 'calibration_alert' : 'pm_schedule';
}

async function allocateMwoNumber(ctx: PmMwoTxnContext): Promise<string> {
  await ctx.client.query(
    `select pg_advisory_xact_lock(hashtextextended('mwo_number:' || app.current_org_id()::text, 0))`,
  );
  const seq = await ctx.client.query<{ mwo_number: string }>(
    `select 'MWO-' || to_char(pg_catalog.now(), 'YYYY') || '-' ||
            lpad((coalesce(max(nullif(right(w.mwo_number, 5), '')::int), 0) + 1)::text, 5, '0')
            as mwo_number
       from public.maintenance_work_orders w
      where w.org_id = app.current_org_id()
        and w.mwo_number like 'MWO-' || to_char(pg_catalog.now(), 'YYYY') || '-%'`,
  );
  const mwoNumber = seq.rows[0]?.mwo_number;
  if (!mwoNumber) throw new Error('mwo number allocation returned no row');
  return mwoNumber;
}

async function writeMwoCreatedOutbox(
  ctx: PmMwoTxnContext,
  params: {
    mwoId: string;
    mwoNumber: string;
    equipmentId: string;
    equipmentCode: string;
    scheduleId: string;
    priority: MwoPriority;
    source: MwoSource;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values (app.current_org_id(), $1, 'mwo', $2::uuid, $3::jsonb, 'maintenance-pm-engine-v1')`,
    [
      'maintenance.mwo.created',
      params.mwoId,
      JSON.stringify({
        org_id: ctx.orgId,
        actor_user_id: ctx.actorUserId,
        mwo_id: params.mwoId,
        mwo_number: params.mwoNumber,
        equipment_id: params.equipmentId,
        equipment_code: params.equipmentCode,
        schedule_id: params.scheduleId,
        priority: params.priority,
        source: params.source,
      }),
    ],
  );
}

/**
 * Generate a single planned MWO from a PM schedule when due. Caller must run
 * inside a transaction with org context set.
 */
export async function generateMwoFromPmScheduleCore(
  ctx: PmMwoTxnContext,
  scheduleId: string,
  opts: { skipDueWindowCheck?: boolean } = {},
): Promise<GeneratePmMwoResult> {
  const scheduleRes = await ctx.client.query<{
    id: string;
    schedule_type: PmScheduleType;
    site_id: string | null;
    equipment_id: string;
    equipment_code: string;
    next_due_date: string | null;
    warning_days: number;
    active: boolean;
  }>(
    `select s.id::text,
            s.schedule_type,
            s.site_id::text,
            s.equipment_id::text,
            e.equipment_code,
            s.next_due_date::text,
            coalesce(s.warning_days, 7)::int as warning_days,
            s.active
       from public.maintenance_schedules s
       join public.equipment e
         on e.id = s.equipment_id
        and e.org_id = s.org_id
      where s.org_id = app.current_org_id()
        and s.id = $1::uuid
      limit 1`,
    [scheduleId],
  );
  const schedule = scheduleRes.rows[0];
  if (!schedule) return { ok: false, reason: 'not_found', message: 'schedule not found' };
  if (!schedule.active) return { ok: false, reason: 'inactive', message: 'schedule is inactive' };
  if (!schedule.next_due_date) {
    return { ok: false, reason: 'no_due_date', message: 'schedule has no next due date' };
  }

  if (!opts.skipDueWindowCheck) {
    const dueCheck = await ctx.client.query<{ due: boolean }>(
      `select ($1::date <= (pg_catalog.current_date + make_interval(days => $2::int))) as due`,
      [schedule.next_due_date, schedule.warning_days],
    );
    if (!dueCheck.rows[0]?.due) {
      return { ok: false, reason: 'not_due', message: 'schedule is not yet due' };
    }
  }

  await ctx.client.query(
    `select pg_advisory_xact_lock(hashtext(app.current_org_id()::text || ':' || $1::text))`,
    [scheduleId],
  );

  const existing = await ctx.client.query<{ id: string }>(
    `select id::text
       from public.maintenance_work_orders w
      where w.org_id = app.current_org_id()
        and w.schedule_id = $1::uuid
        and w.state = any($2::text[])
      limit 1`,
    [scheduleId, OPEN_BACKLOG_STATES],
  );
  if (existing.rows[0]) {
    return { ok: true, mwoId: existing.rows[0].id, created: false, reason: 'already_open' };
  }

  const mwoType = scheduleTypeToMwoType(schedule.schedule_type);
  const source = scheduleTypeToSource(schedule.schedule_type);
  const priority: MwoPriority = schedule.schedule_type === 'calibration' ? 'high' : 'medium';
  const title = `PM: ${schedule.equipment_code} — ${schedule.schedule_type.replace('_', ' ')}`;
  const mwoNumber = await allocateMwoNumber(ctx);

  const inserted = await ctx.client.query<{ id: string; mwo_number: string }>(
    `insert into public.maintenance_work_orders (
       org_id, site_id, mwo_number, state, source, type, priority,
       equipment_id, schedule_id, title, due_date,
       requester_user_id, requester_reason, created_by, updated_by
     )
     values (
       app.current_org_id(), $1::uuid, $2, 'open', $3, $4, $5,
       $6::uuid, $7::uuid, $8, $9::date,
       $10::uuid, $11, $10::uuid, $10::uuid
     )
     returning id::text, mwo_number`,
    [
      schedule.site_id,
      mwoNumber,
      source,
      mwoType,
      priority,
      schedule.equipment_id,
      scheduleId,
      title,
      schedule.next_due_date,
      ctx.actorUserId,
      `Generated from PM schedule ${scheduleId}`,
    ],
  );
  const created = inserted.rows[0];
  if (!created) throw new Error('mwo insert did not return a row');

  await writeMwoCreatedOutbox(ctx, {
    mwoId: created.id,
    mwoNumber: created.mwo_number,
    equipmentId: schedule.equipment_id,
    equipmentCode: schedule.equipment_code,
    scheduleId,
    priority,
    source,
  });

  return { ok: true, mwoId: created.id, mwoNumber: created.mwo_number, created: true };
}

/** Calendar-due active schedules in the org (PM engine scan path). */
export async function listDuePmScheduleIds(ctx: PmMwoTxnContext): Promise<string[]> {
  const { rows } = await ctx.client.query<{ id: string }>(
    `select s.id::text
       from public.maintenance_schedules s
      where s.org_id = app.current_org_id()
        and s.active = true
        and s.interval_basis = 'calendar_days'
        and s.next_due_date is not null
        and s.next_due_date <= (pg_catalog.current_date + make_interval(days => coalesce(s.warning_days, 7)::int))
      order by s.next_due_date asc, s.id asc`,
  );
  return rows.map((r) => r.id);
}

/**
 * pm_schedule_due_engine_v1 — scan due PM schedules and generate open MWOs.
 * Must run inside a transaction with org context already set.
 */
export async function runPmScheduleDueEngine(
  ctx: PmMwoTxnContext,
): Promise<PmScheduleDueEngineSummary> {
  const scheduleIds = await listDuePmScheduleIds(ctx);
  const summary: PmScheduleDueEngineSummary = {
    schedulesScanned: scheduleIds.length,
    created: 0,
    skippedOpen: 0,
    skippedNotDue: 0,
    errors: 0,
  };

  for (const scheduleId of scheduleIds) {
    try {
      const result = await generateMwoFromPmScheduleCore(ctx, scheduleId, {
        skipDueWindowCheck: true,
      });
      if (!result.ok) {
        if (result.reason === 'not_due') summary.skippedNotDue += 1;
        else summary.errors += 1;
        continue;
      }
      if (result.created) summary.created += 1;
      else summary.skippedOpen += 1;
    } catch {
      summary.errors += 1;
    }
  }

  return summary;
}

/**
 * After a schedule-sourced MWO completes, stamp last_completed_at and roll
 * calendar-day schedules forward so the due engine does not regenerate for the
 * same period.
 */
export async function advancePmScheduleOnMwoCompletion(
  ctx: PmMwoTxnContext,
  scheduleId: string,
): Promise<{ advanced: boolean }> {
  const result = await ctx.client.query<{ id: string }>(
    `update public.maintenance_schedules s
        set last_completed_at = pg_catalog.now(),
            next_due_date = case
              when s.interval_basis = 'calendar_days' and s.next_due_date is not null
                then (s.next_due_date + make_interval(days => s.interval_value::int))::date
              else s.next_due_date
            end,
            updated_by = $2::uuid,
            updated_at = pg_catalog.now()
      where s.org_id = app.current_org_id()
        and s.id = $1::uuid
        and s.active = true
      returning s.id::text`,
    [scheduleId, ctx.actorUserId],
  );
  return { advanced: (result.rowCount ?? result.rows.length) > 0 };
}

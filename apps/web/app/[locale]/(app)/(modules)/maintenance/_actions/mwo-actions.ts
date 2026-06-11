'use server';

/**
 * 13-MAINTENANCE — MWO core Server Actions (Wave-8 lane CL1, first vertical).
 *
 * Builds on the EXISTING orphan schema from migration 201
 * (maintenance_work_orders, 6-state CHECK requested|approved|open|in_progress|
 * completed|cancelled; maintenance_schedules) + migration 290 (machine_id soft
 * uuid -> public.machines, title, due_date). This slice covers manual MWOs on
 * machines only: createMwo creates state='open' rows; the requested/approved
 * triage states belong to the future PM-engine/WR slice (D-MNT-9) and are only
 * listed/cancellable here, never created.
 *
 * State machine (server-side legal map — workflow-as-data per PRD §8.1 lives
 * in a later slice; this is the hardcoded P0 subset the lane mandates):
 *   open        → in_progress (start)   | cancelled
 *   in_progress → completed             | cancelled
 *   requested / approved → cancelled only (rows can pre-exist via SQL/seeds)
 *   completed / cancelled → terminal
 *
 * RBAC — FIRST ENFORCEMENT of the migration-202 mnt.* seed (audit: seeded,
 * zero enforcement until now):
 *   read (list MWOs / machines / PM schedules) → mnt.asset.read (the module
 *     nav gate, module-registry.ts MODULE_PERMISSION_KEYS.maintenance)
 *   createMwo                                  → mnt.mwo.request
 *   transition start/complete                  → mnt.mwo.execute
 *   transition cancel                          → mnt.mwo.cancel (SoD: admin/
 *     manager-only per the 202 seed — operators do NOT get cancel)
 *
 * Outbox: maintenance.mwo.created / maintenance.mwo.completed (both admitted
 * to the outbox CHECK by migration 202; enum members in events.enum.ts).
 *
 * Wave0 lock: org_id NOT tenant_id; RLS via app.current_org_id() (the 201
 * FOR ALL policies). Every query runs inside ONE withOrgContext transaction.
 * `'use server'`: ONLY async functions + serialisable types exported.
 */

import { z } from 'zod';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type MaintenanceContext = { userId: string; orgId: string; client: QueryClient };

// ── Permission strings (byte-aligned with the migration-202 seed) ────────────
const MNT_READ_PERMISSION = 'mnt.asset.read';
const MNT_MWO_REQUEST_PERMISSION = 'mnt.mwo.request';
const MNT_MWO_EXECUTE_PERMISSION = 'mnt.mwo.execute';
const MNT_MWO_CANCEL_PERMISSION = 'mnt.mwo.cancel';

// ── Closed vocabularies (migration 201 CHECK constraints) ────────────────────
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
export type MwoTransition = 'in_progress' | 'completed' | 'cancelled';

const ALL_STATES: MwoState[] = [
  'requested',
  'approved',
  'open',
  'in_progress',
  'completed',
  'cancelled',
];

/**
 * Server-side legal transition map. Key = current state, value = states the
 * caller may move to. requested/approved rows (future PM/WR slices) are
 * cancellable so orphan seeds never get stuck; they cannot be started here.
 */
const LEGAL_TRANSITIONS: Record<MwoState, readonly MwoTransition[]> = {
  requested: ['cancelled'],
  approved: ['cancelled'],
  open: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

type ActionFailure = {
  ok: false;
  reason: 'forbidden' | 'not_found' | 'invalid_transition' | 'error';
  message?: string;
};
type ActionResult<T> = { ok: true; data: T } | ActionFailure;

export type MwoListRow = {
  id: string;
  mwoNumber: string;
  title: string;
  state: MwoState;
  priority: MwoPriority;
  source: MwoSource;
  machineId: string | null;
  machineCode: string | null;
  machineName: string | null;
  dueDate: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type MwoListData = {
  rows: MwoListRow[];
  statusCounts: Record<MwoState, number>;
};

export type MachineOption = {
  id: string;
  code: string;
  name: string;
  machineType: string;
};

export type PmScheduleRow = {
  id: string;
  scheduleType: 'preventive' | 'calibration' | 'sanitation' | 'inspection';
  intervalBasis: 'calendar_days' | 'usage_hours' | 'usage_cycles';
  intervalValue: number;
  nextDueDate: string | null;
  lastCompletedAt: string | null;
  active: boolean;
  equipmentCode: string | null;
  equipmentName: string | null;
};

export type MwoPermissions = {
  canRead: boolean;
  canCreate: boolean;
  canExecute: boolean;
  canCancel: boolean;
};

// ── zod input schemas ─────────────────────────────────────────────────────────
const uuidSchema = z.string().uuid();

const listSchema = z.object({
  status: z
    .enum(['all', 'requested', 'approved', 'open', 'in_progress', 'completed', 'cancelled'])
    .optional(),
  machineId: uuidSchema.optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const createSchema = z.object({
  machineId: uuidSchema,
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(4000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  dueDate: z.string().date().optional(),
  /** Optional 08-production downtime_events soft link → source='auto_downtime'. */
  downtimeEventId: uuidSchema.optional(),
});

const transitionSchema = z.object({
  mwoId: uuidSchema,
  to: z.enum(['in_progress', 'completed', 'cancelled']),
  note: z.string().trim().max(4000).optional(),
});

// ── helpers (module-private; shared with the mig-185/198 action pattern) ─────
async function hasPermission(ctx: MaintenanceContext, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

async function writeOutbox(
  ctx: MaintenanceContext,
  params: {
    eventType: 'maintenance.mwo.created' | 'maintenance.mwo.completed';
    aggregateId: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values (app.current_org_id(), $1, 'mwo', $2::uuid, $3::jsonb, 'maintenance-mwo-v1')`,
    [
      params.eventType,
      params.aggregateId,
      JSON.stringify({ org_id: ctx.orgId, actor_user_id: ctx.userId, ...params.payload }),
    ],
  );
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

type MwoDbRow = {
  id: string;
  mwo_number: string;
  title: string | null;
  requester_reason: string | null;
  state: MwoState;
  priority: MwoPriority;
  source: MwoSource;
  machine_id: string | null;
  machine_code: string | null;
  machine_name: string | null;
  due_date: string | null;
  created_at: Date | string;
  started_at: Date | string | null;
  completed_at: Date | string | null;
};

function mapRow(r: MwoDbRow): MwoListRow {
  return {
    id: r.id,
    mwoNumber: r.mwo_number,
    // Pre-290 rows have no title — fall back to the problem description, then
    // the number, so the list never shows a blank cell.
    title: r.title ?? r.requester_reason ?? r.mwo_number,
    state: r.state,
    priority: r.priority,
    source: r.source,
    machineId: r.machine_id,
    machineCode: r.machine_code,
    machineName: r.machine_name,
    dueDate: r.due_date,
    createdAt: toIso(r.created_at) ?? '',
    startedAt: toIso(r.started_at),
    completedAt: toIso(r.completed_at),
  };
}

// ── actions ───────────────────────────────────────────────────────────────────

/**
 * Server-resolved RBAC flags for the /maintenance page (the client never
 * re-queries and never trusts a client-side flag — buttons it gates are
 * re-checked inside every mutation anyway).
 */
export async function getMwoPermissions(): Promise<MwoPermissions> {
  try {
    return await withOrgContext(async (ctx: MaintenanceContext): Promise<MwoPermissions> => {
      const [canRead, canCreate, canExecute, canCancel] = await Promise.all([
        hasPermission(ctx, MNT_READ_PERMISSION),
        hasPermission(ctx, MNT_MWO_REQUEST_PERMISSION),
        hasPermission(ctx, MNT_MWO_EXECUTE_PERMISSION),
        hasPermission(ctx, MNT_MWO_CANCEL_PERMISSION),
      ]);
      return { canRead, canCreate, canExecute, canCancel };
    });
  } catch {
    return { canRead: false, canCreate: false, canExecute: false, canCancel: false };
  }
}

/** MWO list + per-state counts for the status tabs. Read gate: mnt.asset.read. */
export async function listMwos(
  input: { status?: 'all' | MwoState; machineId?: string; limit?: number } = {},
): Promise<ActionResult<MwoListData>> {
  try {
    const parsed = listSchema.parse(input);
    return await withOrgContext(async (ctx: MaintenanceContext): Promise<ActionResult<MwoListData>> => {
      if (!(await hasPermission(ctx, MNT_READ_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      // Tab counts over the WHOLE org set (not the filtered page).
      const countRes = await ctx.client.query<{ state: MwoState; n: number }>(
        `select w.state, count(*)::int as n
           from public.maintenance_work_orders w
          where w.org_id = app.current_org_id()
          group by w.state`,
      );
      const statusCounts = ALL_STATES.reduce(
        (acc, s) => {
          acc[s] = 0;
          return acc;
        },
        {} as Record<MwoState, number>,
      );
      for (const r of countRes.rows) {
        if ((ALL_STATES as string[]).includes(r.state)) statusCounts[r.state] = r.n;
      }

      const { rows } = await ctx.client.query<MwoDbRow>(
        `select w.id::text,
                w.mwo_number,
                w.title,
                w.requester_reason,
                w.state,
                w.priority,
                w.source,
                w.machine_id::text,
                m.code as machine_code,
                m.name as machine_name,
                w.due_date::text,
                w.created_at,
                w.started_at,
                w.completed_at
           from public.maintenance_work_orders w
           left join public.machines m
             on m.id = w.machine_id and m.org_id = w.org_id
          where w.org_id = app.current_org_id()
            and ($1::text = 'all' or w.state = $1)
            and ($2::uuid is null or w.machine_id = $2::uuid)
          order by w.created_at desc
          limit $3::int`,
        [parsed.status ?? 'all', parsed.machineId ?? null, parsed.limit ?? 200],
      );

      return { ok: true, data: { rows: rows.map(mapRow), statusCounts } };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Active machines for the create-modal dropdown (org-scoped via RLS +
 * explicit org predicate). Read gate: mnt.asset.read.
 */
export async function listMachinesForMwo(): Promise<ActionResult<MachineOption[]>> {
  try {
    return await withOrgContext(async (ctx: MaintenanceContext): Promise<ActionResult<MachineOption[]>> => {
      if (!(await hasPermission(ctx, MNT_READ_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }
      const { rows } = await ctx.client.query<{
        id: string;
        code: string;
        name: string;
        machine_type: string;
      }>(
        `select id::text, code, name, machine_type
           from public.machines
          where org_id = app.current_org_id()
            and status = 'active'
          order by code
          limit 500`,
      );
      return {
        ok: true,
        data: rows.map((r) => ({ id: r.id, code: r.code, name: r.name, machineType: r.machine_type })),
      };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Create a manual MWO on a machine (state='open', type='reactive').
 * Gate: mnt.mwo.request. The machine is validated org-scoped (soft uuid per
 * migration 290 — no DB FK). MWO number = MWO-YYYY-NNNNN, allocated under a
 * per-org advisory xact lock so concurrent creates never collide on the
 * (org_id, mwo_number) unique constraint.
 */
export async function createMwo(input: {
  machineId: string;
  title: string;
  description?: string;
  priority: MwoPriority;
  dueDate?: string;
  downtimeEventId?: string;
}): Promise<ActionResult<MwoListRow>> {
  try {
    const parsed = createSchema.parse(input);
    return await withOrgContext(async (ctx: MaintenanceContext): Promise<ActionResult<MwoListRow>> => {
      if (!(await hasPermission(ctx, MNT_MWO_REQUEST_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      // Validate the soft machine link inside the org scope.
      const machine = await ctx.client.query<{ id: string; code: string; name: string }>(
        `select id::text, code, name
           from public.machines
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1`,
        [parsed.machineId],
      );
      const machineRow = machine.rows[0];
      if (!machineRow) return { ok: false, reason: 'not_found', message: 'machine not found' };

      // Per-org number allocation — advisory xact lock (released on commit),
      // NO "FOR UPDATE + aggregate" (that combination is rejected by Postgres).
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

      const source: MwoSource = parsed.downtimeEventId ? 'auto_downtime' : 'manual_request';

      const inserted = await ctx.client.query<MwoDbRow>(
        `insert into public.maintenance_work_orders (
           org_id, mwo_number, state, source, type, priority,
           machine_id, downtime_event_id, title, due_date,
           requester_user_id, requester_reason, created_by, updated_by
         )
         values (
           app.current_org_id(), $1, 'open', $2, 'reactive', $3,
           $4::uuid, $5::uuid, $6, $7::date,
           $8::uuid, $9, $8::uuid, $8::uuid
         )
         returning id::text, mwo_number, title, requester_reason, state, priority, source,
                   machine_id::text, null as machine_code, null as machine_name,
                   due_date::text, created_at, started_at, completed_at`,
        [
          mwoNumber,
          source,
          parsed.priority,
          parsed.machineId,
          parsed.downtimeEventId ?? null,
          parsed.title,
          parsed.dueDate ?? null,
          ctx.userId,
          parsed.description ?? null,
        ],
      );
      const created = inserted.rows[0];
      if (!created) throw new Error('mwo insert did not return a row');

      await writeOutbox(ctx, {
        eventType: 'maintenance.mwo.created',
        aggregateId: created.id,
        payload: {
          mwo_id: created.id,
          mwo_number: created.mwo_number,
          machine_id: parsed.machineId,
          machine_code: machineRow.code,
          priority: parsed.priority,
          source,
          downtime_event_id: parsed.downtimeEventId ?? null,
        },
      });

      return {
        ok: true,
        data: mapRow({ ...created, machine_code: machineRow.code, machine_name: machineRow.name }),
      };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Transition an MWO along the server-side legal map (see LEGAL_TRANSITIONS).
 * Gates: start/complete → mnt.mwo.execute; cancel → mnt.mwo.cancel (SoD).
 * The row is locked (FOR UPDATE) before the legality check so two concurrent
 * transitions serialize; the UPDATE re-asserts the from-state as a guard.
 * `maintenance.mwo.completed` is emitted in the SAME txn on completion.
 */
export async function transitionMwo(input: {
  mwoId: string;
  to: MwoTransition;
  note?: string;
}): Promise<ActionResult<MwoListRow>> {
  try {
    const parsed = transitionSchema.parse(input);
    return await withOrgContext(async (ctx: MaintenanceContext): Promise<ActionResult<MwoListRow>> => {
      const requiredPermission =
        parsed.to === 'cancelled' ? MNT_MWO_CANCEL_PERMISSION : MNT_MWO_EXECUTE_PERMISSION;
      if (!(await hasPermission(ctx, requiredPermission))) {
        return { ok: false, reason: 'forbidden' };
      }

      const current = await ctx.client.query<{ id: string; state: MwoState }>(
        `select id::text, state
           from public.maintenance_work_orders
          where org_id = app.current_org_id()
            and id = $1::uuid
          for update`,
        [parsed.mwoId],
      );
      const row = current.rows[0];
      if (!row) return { ok: false, reason: 'not_found' };

      if (!LEGAL_TRANSITIONS[row.state]?.includes(parsed.to)) {
        return {
          ok: false,
          reason: 'invalid_transition',
          message: `${row.state} -> ${parsed.to} is not a legal MWO transition`,
        };
      }

      const updated = await ctx.client.query<MwoDbRow>(
        `update public.maintenance_work_orders w
            set state = $2,
                started_at = case when $2 = 'in_progress' then pg_catalog.now() else w.started_at end,
                completed_at = case when $2 = 'completed' then pg_catalog.now() else w.completed_at end,
                actual_duration_min = case
                  when $2 = 'completed' and w.started_at is not null
                    then greatest(0, round(extract(epoch from (pg_catalog.now() - w.started_at)) / 60.0))::int
                  else w.actual_duration_min
                end,
                completion_notes = case when $2 = 'completed' then coalesce($3, w.completion_notes) else w.completion_notes end,
                cancellation_reason = case when $2 = 'cancelled' then coalesce($3, w.cancellation_reason) else w.cancellation_reason end,
                updated_by = $4::uuid
          where w.org_id = app.current_org_id()
            and w.id = $1::uuid
            and w.state = $5
          returning w.id::text, w.mwo_number, w.title, w.requester_reason, w.state, w.priority,
                    w.source, w.machine_id::text, null as machine_code, null as machine_name,
                    w.due_date::text, w.created_at, w.started_at, w.completed_at`,
        [parsed.mwoId, parsed.to, parsed.note ?? null, ctx.userId, row.state],
      );
      const next = updated.rows[0];
      if (!next) {
        // The FOR UPDATE lock makes this unreachable in practice; keep the
        // honest guard for the from-state re-assertion.
        return { ok: false, reason: 'invalid_transition', message: 'concurrent state change' };
      }

      if (parsed.to === 'completed') {
        await writeOutbox(ctx, {
          eventType: 'maintenance.mwo.completed',
          aggregateId: next.id,
          payload: {
            mwo_id: next.id,
            mwo_number: next.mwo_number,
            machine_id: next.machine_id,
            from_state: row.state,
            completion_notes: parsed.note ?? null,
          },
        });
      }

      return { ok: true, data: mapRow(next) };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Simple PM schedule list (read-only this slice — the PM cron engine + editor
 * are T-003/T-009 follow-ons). Joins the migration-201 equipment registry for
 * code/name. Read gate: mnt.asset.read.
 */
export async function listPmSchedules(): Promise<ActionResult<PmScheduleRow[]>> {
  try {
    return await withOrgContext(async (ctx: MaintenanceContext): Promise<ActionResult<PmScheduleRow[]>> => {
      if (!(await hasPermission(ctx, MNT_READ_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }
      const { rows } = await ctx.client.query<{
        id: string;
        schedule_type: PmScheduleRow['scheduleType'];
        interval_basis: PmScheduleRow['intervalBasis'];
        interval_value: number;
        next_due_date: string | null;
        last_completed_at: Date | string | null;
        active: boolean;
        equipment_code: string | null;
        equipment_name: string | null;
      }>(
        `select s.id::text,
                s.schedule_type,
                s.interval_basis,
                s.interval_value,
                s.next_due_date::text,
                s.last_completed_at,
                s.active,
                e.equipment_code,
                e.name as equipment_name
           from public.maintenance_schedules s
           left join public.equipment e
             on e.id = s.equipment_id and e.org_id = s.org_id
          where s.org_id = app.current_org_id()
          order by s.next_due_date asc nulls last, s.created_at desc
          limit 200`,
      );
      return {
        ok: true,
        data: rows.map((r) => ({
          id: r.id,
          scheduleType: r.schedule_type,
          intervalBasis: r.interval_basis,
          intervalValue: Number(r.interval_value),
          nextDueDate: r.next_due_date,
          lastCompletedAt: toIso(r.last_completed_at),
          active: Boolean(r.active),
          equipmentCode: r.equipment_code,
          equipmentName: r.equipment_name,
        })),
      };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

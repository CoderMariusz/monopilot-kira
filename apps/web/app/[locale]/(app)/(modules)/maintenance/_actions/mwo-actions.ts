'use server';

/**
 * 13-MAINTENANCE — MWO core Server Actions (Wave-8 lane CL1, first vertical).
 *
 * Builds on the EXISTING orphan schema from migration 201
 * (maintenance_work_orders, 6-state CHECK requested|approved|open|in_progress|
 * completed|cancelled; maintenance_schedules) + migration 290 (title, due_date).
 * This slice covers manual MWOs on equipment only: createMwo creates state='open'
 * rows; the requested/approved
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
 *   read (list MWOs / equipment / PM schedules) → mnt.asset.read (the module
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

import type pg from 'pg';
import { EPinFailedError, ESignPolicyError, signEvent } from '@monopilot/e-sign';
import { z } from 'zod';

import { hasPermission } from '../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  advancePmScheduleOnMwoCompletion,
  generateMwoFromPmScheduleCore,
  OPEN_BACKLOG_STATES as PM_OPEN_BACKLOG_STATES,
} from '../../../../../../lib/maintenance/pm-mwo-generate';

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
const MNT_LOTO_APPLY_PERMISSION = 'mnt.loto.apply';
const MNT_LOTO_CLEAR_PERMISSION = 'mnt.loto.clear';

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
const OPEN_BACKLOG_STATES: readonly MwoState[] = [...PM_OPEN_BACKLOG_STATES];
const PLANNED_MWO_SOURCES: readonly MwoSource[] = ['pm_schedule', 'calibration_alert'];
const UNPLANNED_MWO_SOURCES: readonly MwoSource[] = ['manual_request', 'auto_downtime', 'oee_trigger'];

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
  reason:
    | 'forbidden'
    | 'not_found'
    | 'invalid_transition'
    | 'loto_not_verified'
    | 'loto_same_actor'
    | 'esign_failed'
    | 'error';
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
  equipmentId: string | null;
  equipmentCode: string | null;
  equipmentName: string | null;
  dueDate: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type MwoPmSource = {
  scheduleId: string;
  scheduleType: PmScheduleRow['scheduleType'];
  nextDueDate: string | null;
  intervalBasis: PmScheduleRow['intervalBasis'];
  intervalValue: number;
  equipmentCode: string | null;
  equipmentName: string | null;
};

export type MwoDetailRow = MwoListRow & {
  description: string | null;
  scheduleId: string | null;
  pmSource: MwoPmSource | null;
  loto: MwoLotoStatus;
};

export type MwoListData = {
  rows: MwoListRow[];
  statusCounts: Record<MwoState, number>;
};

export type MwoOverviewStats = {
  backlog: { d0_7: number; d8_30: number; d31_plus: number };
  ratio: { planned: number; unplanned: number };
};

export type EquipmentOption = {
  id: string;
  code: string;
  name: string;
  equipmentType: string;
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
  canLotoApply: boolean;
  canLotoClear: boolean;
};

export type MwoLotoStatus = {
  requiresLoto: boolean;
  lockoutVerified: boolean;
  lockoutActive: boolean;
  releaseVerified: boolean;
};

// ── zod input schemas ─────────────────────────────────────────────────────────
const uuidSchema = z.string().uuid();

const listSchema = z.object({
  status: z
    .enum(['all', 'requested', 'approved', 'open', 'in_progress', 'completed', 'cancelled'])
    .optional(),
  equipmentId: uuidSchema.optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const createSchema = z.object({
  equipmentId: uuidSchema,
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(4000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  dueDate: z.string().date().optional(),
  /** Optional 08-production downtime_events soft link → source='auto_downtime'. */
  downtimeEventId: uuidSchema.optional(),
});

const generateFromScheduleSchema = z.object({
  scheduleId: uuidSchema,
});

const transitionSchema = z.object({
  mwoId: uuidSchema,
  to: z.enum(['in_progress', 'completed', 'cancelled']),
  note: z.string().trim().max(4000).optional(),
});

const lotoSignatureSchema = z.object({
  password: z.string().min(1),
  nonce: z.string().min(1).optional(),
});

const verifyLotoLockoutSchema = z.object({
  mwoId: uuidSchema,
  signature: lotoSignatureSchema,
});

const verifyLotoReleaseSchema = z.object({
  mwoId: uuidSchema,
  signature: lotoSignatureSchema,
});

function maintenanceActionError(err: unknown): ActionFailure {
  if (err instanceof EPinFailedError) {
    return { ok: false, reason: 'esign_failed', message: err.message };
  }
  if (err instanceof ESignPolicyError) {
    return { ok: false, reason: 'esign_failed', message: err.message };
  }
  return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
}

// ── helpers (module-private; shared with the mig-185/198 action pattern) ─────
async function writeOutbox(
  ctx: MaintenanceContext,
  params: {
    eventType:
      | 'maintenance.mwo.created'
      | 'maintenance.mwo.completed'
      | 'maintenance.loto.applied'
      | 'maintenance.loto.released';
    aggregateId: string;
    aggregateType?: 'mwo' | 'mwo_loto';
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values (app.current_org_id(), $1, $4, $2::uuid, $3::jsonb, 'maintenance-mwo-v1')`,
    [
      params.eventType,
      params.aggregateId,
      JSON.stringify({ org_id: ctx.orgId, actor_user_id: ctx.userId, ...params.payload }),
      params.aggregateType ?? 'mwo',
    ],
  );
}

type LotoGateRow = {
  zero_energy_verified_by: string | null;
  verified_at: Date | string | null;
  released_by: string | null;
  released_at: Date | string | null;
};

async function readLotoGate(ctx: MaintenanceContext, mwoId: string): Promise<LotoGateRow | null> {
  const { rows } = await ctx.client.query<LotoGateRow>(
    `select zero_energy_verified_by::text,
            verified_at,
            released_by::text,
            released_at
       from public.mwo_loto_checklists
      where org_id = app.current_org_id()
        and mwo_id = $1::uuid
      limit 1`,
    [mwoId],
  );
  return rows[0] ?? null;
}

function lotoLockoutRecorded(loto: LotoGateRow | null): boolean {
  return Boolean(loto?.zero_energy_verified_by && loto.verified_at);
}

/** Active lockout: verified and not yet released — required to start work. */
function lotoActiveLockout(loto: LotoGateRow | null): boolean {
  return lotoLockoutRecorded(loto) && !loto?.released_by;
}

function lotoReleaseSatisfied(loto: LotoGateRow | null): boolean {
  return Boolean(loto?.released_by);
}

function mapLotoStatus(requiresLoto: boolean, loto: LotoGateRow | null): MwoLotoStatus {
  const lockoutVerified = lotoLockoutRecorded(loto);
  return {
    requiresLoto,
    lockoutVerified,
    lockoutActive: lotoActiveLockout(loto),
    releaseVerified: lotoReleaseSatisfied(loto),
  };
}

async function ensureLotoChecklistRow(ctx: MaintenanceContext, mwoId: string): Promise<void> {
  await ctx.client.query(
    `insert into public.mwo_loto_checklists (org_id, site_id, mwo_id)
     select w.org_id, w.site_id, w.id
       from public.maintenance_work_orders w
      where w.org_id = app.current_org_id()
        and w.id = $1::uuid
        and not exists (
          select 1
            from public.mwo_loto_checklists lc
           where lc.org_id = w.org_id
             and lc.mwo_id = w.id
        )`,
    [mwoId],
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
  equipment_id: string | null;
  equipment_code: string | null;
  equipment_name: string | null;
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
    equipmentId: r.equipment_id,
    equipmentCode: r.equipment_code,
    equipmentName: r.equipment_name,
    dueDate: r.due_date,
    createdAt: toIso(r.created_at) ?? '',
    startedAt: toIso(r.started_at),
    completedAt: toIso(r.completed_at),
  };
}

async function fetchMwoListRow(ctx: MaintenanceContext, mwoId: string): Promise<MwoListRow | null> {
  const { rows } = await ctx.client.query<MwoDbRow>(
    `select w.id::text,
            w.mwo_number,
            w.title,
            w.requester_reason,
            w.state,
            w.priority,
            w.source,
            w.equipment_id::text,
            e.equipment_code,
            e.name as equipment_name,
            w.due_date::text,
            w.created_at,
            w.started_at,
            w.completed_at
       from public.maintenance_work_orders w
       left join public.equipment e
         on e.id = w.equipment_id and e.org_id = w.org_id
      where w.org_id = app.current_org_id()
        and w.id = $1::uuid
      limit 1`,
    [mwoId],
  );
  const row = rows[0];
  return row ? mapRow(row) : null;
}

async function allocateMwoNumber(ctx: MaintenanceContext): Promise<string> {
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

// ── actions ───────────────────────────────────────────────────────────────────

/**
 * Server-resolved RBAC flags for the /maintenance page (the client never
 * re-queries and never trusts a client-side flag — buttons it gates are
 * re-checked inside every mutation anyway).
 */
export async function getMwoPermissions(): Promise<MwoPermissions> {
  try {
    return await withOrgContext(async (ctx: MaintenanceContext): Promise<MwoPermissions> => {
      const [canRead, canCreate, canExecute, canCancel, canLotoApply, canLotoClear] =
        await Promise.all([
          hasPermission(ctx, MNT_READ_PERMISSION),
          hasPermission(ctx, MNT_MWO_REQUEST_PERMISSION),
          hasPermission(ctx, MNT_MWO_EXECUTE_PERMISSION),
          hasPermission(ctx, MNT_MWO_CANCEL_PERMISSION),
          hasPermission(ctx, MNT_LOTO_APPLY_PERMISSION),
          hasPermission(ctx, MNT_LOTO_CLEAR_PERMISSION),
        ]);
      return { canRead, canCreate, canExecute, canCancel, canLotoApply, canLotoClear };
    });
  } catch (err) {
    console.error('[maintenance] getMwoPermissions failed', err);
    return {
      canRead: false,
      canCreate: false,
      canExecute: false,
      canCancel: false,
      canLotoApply: false,
      canLotoClear: false,
    };
  }
}

export async function getMwoOverviewStats(): Promise<MwoOverviewStats> {
  const empty: MwoOverviewStats = {
    backlog: { d0_7: 0, d8_30: 0, d31_plus: 0 },
    ratio: { planned: 0, unplanned: 0 },
  };

  try {
    return await withOrgContext(async (ctx: MaintenanceContext): Promise<MwoOverviewStats> => {
      if (!(await hasPermission(ctx, MNT_READ_PERMISSION))) {
        return empty;
      }

      const { rows } = await ctx.client.query<{
        d0_7: number;
        d8_30: number;
        d31_plus: number;
        planned: number;
        unplanned: number;
      }>(
        `select count(*) filter (
                  where w.created_at >= pg_catalog.now() - interval '7 days'
                )::int as d0_7,
                count(*) filter (
                  where w.created_at < pg_catalog.now() - interval '7 days'
                    and w.created_at >= pg_catalog.now() - interval '30 days'
                )::int as d8_30,
                count(*) filter (
                  where w.created_at < pg_catalog.now() - interval '30 days'
                )::int as d31_plus,
                count(*) filter (where w.source = any($2::text[]))::int as planned,
                count(*) filter (where w.source = any($3::text[]))::int as unplanned
           from public.maintenance_work_orders w
          where w.org_id = app.current_org_id()
            and w.state = any($1::text[])`,
        [OPEN_BACKLOG_STATES, PLANNED_MWO_SOURCES, UNPLANNED_MWO_SOURCES],
      );

      const row = rows[0];
      if (!row) return empty;
      return {
        backlog: {
          d0_7: Number(row.d0_7),
          d8_30: Number(row.d8_30),
          d31_plus: Number(row.d31_plus),
        },
        ratio: {
          planned: Number(row.planned),
          unplanned: Number(row.unplanned),
        },
      };
    });
  } catch (err) {
    console.error('[maintenance] getMwoOverviewStats failed', err);
    return empty;
  }
}

/** MWO list + per-state counts for the status tabs. Read gate: mnt.asset.read. */
export async function listMwos(
  input: { status?: 'all' | MwoState; equipmentId?: string; limit?: number } = {},
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
                w.equipment_id::text,
                e.equipment_code,
                e.name as equipment_name,
                w.due_date::text,
                w.created_at,
                w.started_at,
                w.completed_at
           from public.maintenance_work_orders w
           left join public.equipment e
             on e.id = w.equipment_id and e.org_id = w.org_id
          where w.org_id = app.current_org_id()
            and ($1::text = 'all' or w.state = $1)
            and ($2::uuid is null or w.equipment_id = $2::uuid)
          order by w.created_at desc
          limit $3::int`,
        [parsed.status ?? 'all', parsed.equipmentId ?? null, parsed.limit ?? 200],
      );

      return { ok: true, data: { rows: rows.map(mapRow), statusCounts } };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/** Single MWO detail with optional linked PM schedule (read gate: mnt.asset.read). */
export async function getMwoById(mwoId: string): Promise<ActionResult<MwoDetailRow | null>> {
  try {
    const parsed = uuidSchema.parse(mwoId);
    return await withOrgContext(async (ctx: MaintenanceContext): Promise<ActionResult<MwoDetailRow | null>> => {
      if (!(await hasPermission(ctx, MNT_READ_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      const { rows } = await ctx.client.query<
        MwoDbRow & {
          schedule_id: string | null;
          schedule_type: PmScheduleRow['scheduleType'] | null;
          schedule_next_due: string | null;
          schedule_interval_basis: PmScheduleRow['intervalBasis'] | null;
          schedule_interval_value: number | null;
          requires_loto: boolean;
          loto_zero_energy_verified_by: string | null;
          loto_verified_at: Date | string | null;
          loto_released_by: string | null;
          loto_released_at: Date | string | null;
        }
      >(
        `select w.id::text,
                w.mwo_number,
                w.title,
                w.requester_reason,
                w.state,
                w.priority,
                w.source,
                w.equipment_id::text,
                e.equipment_code,
                e.name as equipment_name,
                w.due_date::text,
                w.created_at,
                w.started_at,
                w.completed_at,
                w.schedule_id::text,
                s.schedule_type,
                s.next_due_date::text as schedule_next_due,
                s.interval_basis as schedule_interval_basis,
                s.interval_value as schedule_interval_value,
                coalesce(e.requires_loto, false) as requires_loto,
                lc.zero_energy_verified_by::text as loto_zero_energy_verified_by,
                lc.verified_at as loto_verified_at,
                lc.released_by::text as loto_released_by,
                lc.released_at as loto_released_at
           from public.maintenance_work_orders w
           left join public.equipment e
             on e.id = w.equipment_id and e.org_id = w.org_id
           left join public.maintenance_schedules s
             on s.id = w.schedule_id and s.org_id = w.org_id
           left join public.mwo_loto_checklists lc
             on lc.mwo_id = w.id and lc.org_id = w.org_id
          where w.org_id = app.current_org_id()
            and w.id = $1::uuid
          limit 1`,
        [parsed],
      );
      const row = rows[0];
      if (!row) return { ok: true, data: null };

      const base = mapRow(row);
      const pmSource: MwoPmSource | null =
        row.schedule_id && row.schedule_type
          ? {
              scheduleId: row.schedule_id,
              scheduleType: row.schedule_type,
              nextDueDate: row.schedule_next_due,
              intervalBasis: row.schedule_interval_basis ?? 'calendar_days',
              intervalValue: Number(row.schedule_interval_value ?? 0),
              equipmentCode: row.equipment_code,
              equipmentName: row.equipment_name,
            }
          : null;
      const loto = mapLotoStatus(row.requires_loto, {
        zero_energy_verified_by: row.loto_zero_energy_verified_by,
        verified_at: row.loto_verified_at,
        released_by: row.loto_released_by,
        released_at: row.loto_released_at,
      });

      return {
        ok: true,
        data: {
          ...base,
          description: row.requester_reason,
          scheduleId: row.schedule_id,
          pmSource,
          loto,
        },
      };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Active equipment for the create-modal dropdown (org-scoped via RLS +
 * explicit org predicate). Read gate: mnt.asset.read.
 */
export async function listEquipmentForMwo(): Promise<ActionResult<EquipmentOption[]>> {
  try {
    return await withOrgContext(async (ctx: MaintenanceContext): Promise<ActionResult<EquipmentOption[]>> => {
      if (!(await hasPermission(ctx, MNT_READ_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }
      const { rows } = await ctx.client.query<{
        id: string;
        equipment_code: string;
        name: string;
        equipment_type: string;
      }>(
        `select id::text, equipment_code, name, equipment_type
           from public.equipment
          where org_id = app.current_org_id()
            and active = true
          order by equipment_code
          limit 500`,
      );
      return {
        ok: true,
        data: rows.map((r) => ({
          id: r.id,
          code: r.equipment_code,
          name: r.name,
          equipmentType: r.equipment_type,
        })),
      };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Create a manual MWO on equipment (state='open', type='reactive').
 * Gate: mnt.mwo.request. The equipment row is validated org-scoped. MWO number
 * = MWO-YYYY-NNNNN, allocated under a per-org advisory xact lock so concurrent
 * creates never collide on the (org_id, mwo_number) unique constraint.
 */
export async function createMwo(input: {
  equipmentId: string;
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

      // Validate the equipment link inside the org scope.
      const equipment = await ctx.client.query<{ id: string; equipment_code: string; name: string }>(
        `select id::text, equipment_code, name
           from public.equipment
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1`,
        [parsed.equipmentId],
      );
      const equipmentRow = equipment.rows[0];
      if (!equipmentRow) return { ok: false, reason: 'not_found', message: 'equipment not found' };

      const mwoNumber = await allocateMwoNumber(ctx);

      const source: MwoSource = parsed.downtimeEventId ? 'auto_downtime' : 'manual_request';

      const inserted = await ctx.client.query<MwoDbRow>(
        `insert into public.maintenance_work_orders (
           org_id, mwo_number, state, source, type, priority,
           equipment_id, downtime_event_id, title, due_date,
           requester_user_id, requester_reason, created_by, updated_by
         )
         values (
           app.current_org_id(), $1, 'open', $2, 'reactive', $3,
           $4::uuid, $5::uuid, $6, $7::date,
           $8::uuid, $9, $8::uuid, $8::uuid
         )
         returning id::text, mwo_number, title, requester_reason, state, priority, source,
                   equipment_id::text, null as equipment_code, null as equipment_name,
                   due_date::text, created_at, started_at, completed_at`,
        [
          mwoNumber,
          source,
          parsed.priority,
          parsed.equipmentId,
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
          equipment_id: parsed.equipmentId,
          equipment_code: equipmentRow.equipment_code,
          priority: parsed.priority,
          source,
          downtime_event_id: parsed.downtimeEventId ?? null,
        },
      });

      return {
        ok: true,
        data: mapRow({
          ...created,
          equipment_code: equipmentRow.equipment_code,
          equipment_name: equipmentRow.name,
        }),
      };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Generate a planned MWO from a due PM schedule (PM→MWO bridge).
 * Gate: mnt.mwo.request. Validates schedule is active, calendar-due, and has no
 * open backlog MWO already linked. Emits source in PLANNED_MWO_SOURCES so the
 * planned-vs-unplanned KPI is no longer structurally zero.
 */
export async function generateMwoFromPmSchedule(input: {
  scheduleId: string;
}): Promise<ActionResult<MwoListRow>> {
  try {
    const parsed = generateFromScheduleSchema.parse(input);
    return await withOrgContext(async (ctx: MaintenanceContext): Promise<ActionResult<MwoListRow>> => {
      if (!(await hasPermission(ctx, MNT_MWO_REQUEST_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      const core = await generateMwoFromPmScheduleCore(
        { orgId: ctx.orgId, actorUserId: ctx.userId, client: ctx.client },
        parsed.scheduleId,
      );
      if (!core.ok) {
        const reason = core.reason === 'not_found' ? 'not_found' : 'error';
        return { ok: false, reason, message: core.message };
      }
      if (!core.created) {
        return {
          ok: false,
          reason: 'error',
          message: 'an open MWO already exists for this schedule',
        };
      }

      const row = await fetchMwoListRow(ctx, core.mwoId);
      if (!row) throw new Error('mwo created but detail read failed');
      return { ok: true, data: row };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * LOTO lockout verify (actor 1): e-sign + persist zero_energy_verified_by on
 * mwo_loto_checklists. Gate: mnt.loto.apply. Equipment must require LOTO.
 */
export async function verifyMwoLotoLockout(input: {
  mwoId: string;
  signature: { password: string; nonce?: string };
}): Promise<ActionResult<{ mwoId: string; verifiedAt: string }>> {
  try {
    const parsed = verifyLotoLockoutSchema.parse(input);
    return await withOrgContext(async (ctx: MaintenanceContext): Promise<ActionResult<{ mwoId: string; verifiedAt: string }>> => {
      if (!(await hasPermission(ctx, MNT_LOTO_APPLY_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      const mwo = await ctx.client.query<{
        id: string;
        mwo_number: string;
        equipment_id: string | null;
        requires_loto: boolean;
        state: MwoState;
      }>(
        `select w.id::text,
                w.mwo_number,
                w.equipment_id::text,
                w.state,
                coalesce(e.requires_loto, false) as requires_loto
           from public.maintenance_work_orders w
           left join public.equipment e
             on e.id = w.equipment_id and e.org_id = w.org_id
          where w.org_id = app.current_org_id()
            and w.id = $1::uuid
          for update of w`,
        [parsed.mwoId],
      );
      const row = mwo.rows[0];
      if (!row) return { ok: false, reason: 'not_found' };
      if (!row.requires_loto) {
        return { ok: false, reason: 'error', message: 'equipment does not require LOTO' };
      }
      if (row.state !== 'open') {
        return {
          ok: false,
          reason: 'invalid_transition',
          message: 'LOTO lockout can only be applied while the MWO is open',
        };
      }

      const existing = await readLotoGate(ctx, parsed.mwoId);
      if (lotoLockoutRecorded(existing)) {
        return { ok: false, reason: 'error', message: 'LOTO lockout is already verified' };
      }

      const receipt = await signEvent(
        {
          signerUserId: ctx.userId,
          pin: parsed.signature.password,
          intent: 'mnt.loto.lockout',
          subject: { mwoId: parsed.mwoId, equipmentId: row.equipment_id },
          reason: 'LOTO zero-energy lockout verify',
          nonce: parsed.signature.nonce,
        },
        { client: ctx.client as unknown as pg.PoolClient },
      );

      await ensureLotoChecklistRow(ctx, parsed.mwoId);
      const updated = await ctx.client.query<{ verified_at: Date | string }>(
        `update public.mwo_loto_checklists
            set zero_energy_verified_by = $2::uuid,
                verified_at = pg_catalog.now(),
                updated_at = pg_catalog.now()
          where org_id = app.current_org_id()
            and mwo_id = $1::uuid
            and zero_energy_verified_by is null
          returning verified_at`,
        [parsed.mwoId, ctx.userId],
      );
      const verifiedAt = updated.rows[0]?.verified_at;
      if (!verifiedAt) throw new Error('LOTO lockout update did not return a row');

      await writeOutbox(ctx, {
        eventType: 'maintenance.loto.applied',
        aggregateId: parsed.mwoId,
        aggregateType: 'mwo_loto',
        payload: {
          mwo_id: parsed.mwoId,
          mwo_number: row.mwo_number,
          equipment_id: row.equipment_id,
          signature_hash: receipt.subjectHash,
        },
      });

      return {
        ok: true,
        data: {
          mwoId: parsed.mwoId,
          verifiedAt: toIso(verifiedAt) ?? '',
        },
      };
    });
  } catch (err) {
    return maintenanceActionError(err);
  }
}

/**
 * LOTO release verify (actor 2): distinct-actor e-sign + released_by on
 * mwo_loto_checklists. Gate: mnt.loto.clear.
 */
export async function verifyMwoLotoRelease(input: {
  mwoId: string;
  signature: { password: string; nonce?: string };
}): Promise<ActionResult<{ mwoId: string; releasedAt: string }>> {
  try {
    const parsed = verifyLotoReleaseSchema.parse(input);
    return await withOrgContext(async (ctx: MaintenanceContext): Promise<ActionResult<{ mwoId: string; releasedAt: string }>> => {
      if (!(await hasPermission(ctx, MNT_LOTO_CLEAR_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      const mwo = await ctx.client.query<{
        id: string;
        mwo_number: string;
        equipment_id: string | null;
        requires_loto: boolean;
        state: MwoState;
      }>(
        `select w.id::text,
                w.mwo_number,
                w.equipment_id::text,
                w.state,
                coalesce(e.requires_loto, false) as requires_loto
           from public.maintenance_work_orders w
           left join public.equipment e
             on e.id = w.equipment_id and e.org_id = w.org_id
          where w.org_id = app.current_org_id()
            and w.id = $1::uuid
          for update of w`,
        [parsed.mwoId],
      );
      const row = mwo.rows[0];
      if (!row) return { ok: false, reason: 'not_found' };
      if (!row.requires_loto) {
        return { ok: false, reason: 'error', message: 'equipment does not require LOTO' };
      }
      if (row.state !== 'in_progress') {
        return {
          ok: false,
          reason: 'invalid_transition',
          message: 'LOTO release is only allowed while work is in progress',
        };
      }

      const existing = await readLotoGate(ctx, parsed.mwoId);
      if (!lotoActiveLockout(existing)) {
        return {
          ok: false,
          reason: 'loto_not_verified',
          message: 'An active LOTO lockout is required before release',
        };
      }
      if (lotoReleaseSatisfied(existing)) {
        return { ok: false, reason: 'error', message: 'LOTO release is already verified' };
      }
      if (existing?.zero_energy_verified_by === ctx.userId) {
        return {
          ok: false,
          reason: 'loto_same_actor',
          message: 'LOTO release signer must be distinct from the lockout verifier',
        };
      }

      const receipt = await signEvent(
        {
          signerUserId: ctx.userId,
          pin: parsed.signature.password,
          intent: 'mnt.loto.release',
          subject: { mwoId: parsed.mwoId, equipmentId: row.equipment_id },
          reason: 'LOTO release verify',
          nonce: parsed.signature.nonce,
        },
        { client: ctx.client as unknown as pg.PoolClient },
      );

      const updated = await ctx.client.query<{ released_at: Date | string }>(
        `update public.mwo_loto_checklists
            set released_by = $2::uuid,
                released_at = pg_catalog.now(),
                updated_at = pg_catalog.now()
          where org_id = app.current_org_id()
            and mwo_id = $1::uuid
            and released_by is null
          returning released_at`,
        [parsed.mwoId, ctx.userId],
      );
      const releasedAt = updated.rows[0]?.released_at;
      if (!releasedAt) throw new Error('LOTO release update did not return a row');

      await writeOutbox(ctx, {
        eventType: 'maintenance.loto.released',
        aggregateId: parsed.mwoId,
        aggregateType: 'mwo_loto',
        payload: {
          mwo_id: parsed.mwoId,
          mwo_number: row.mwo_number,
          equipment_id: row.equipment_id,
          signature_hash: receipt.subjectHash,
        },
      });

      return {
        ok: true,
        data: {
          mwoId: parsed.mwoId,
          releasedAt: toIso(releasedAt) ?? '',
        },
      };
    });
  } catch (err) {
    return maintenanceActionError(err);
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

      const current = await ctx.client.query<{
        id: string;
        state: MwoState;
        schedule_id: string | null;
        source: MwoSource;
        requires_loto: boolean;
      }>(
        `select w.id::text,
                w.state,
                w.schedule_id::text,
                w.source,
                coalesce(e.requires_loto, false) as requires_loto
           from public.maintenance_work_orders w
           left join public.equipment e
             on e.id = w.equipment_id and e.org_id = w.org_id
          where w.org_id = app.current_org_id()
            and w.id = $1::uuid
          for update of w`,
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

      if (row.requires_loto && (parsed.to === 'in_progress' || parsed.to === 'completed')) {
        const loto = await readLotoGate(ctx, parsed.mwoId);
        if (parsed.to === 'in_progress' && !lotoActiveLockout(loto)) {
          return {
            ok: false,
            reason: 'loto_not_verified',
            message: 'LOTO active lockout verification is required before starting work',
          };
        }
        if (parsed.to === 'completed' && !lotoReleaseSatisfied(loto)) {
          return {
            ok: false,
            reason: 'loto_not_verified',
            message: 'LOTO release verification is required before completing work',
          };
        }
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
                    w.source, w.equipment_id::text, null as equipment_code, null as equipment_name,
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
        if (row.schedule_id && PLANNED_MWO_SOURCES.includes(row.source)) {
          await advancePmScheduleOnMwoCompletion(
            { orgId: ctx.orgId, actorUserId: ctx.userId, client: ctx.client },
            row.schedule_id,
          );
        }

        await writeOutbox(ctx, {
          eventType: 'maintenance.mwo.completed',
          aggregateId: next.id,
          payload: {
            mwo_id: next.id,
            mwo_number: next.mwo_number,
            equipment_id: next.equipment_id,
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

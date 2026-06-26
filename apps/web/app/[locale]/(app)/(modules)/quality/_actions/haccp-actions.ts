'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type QualityContext = { userId: string; orgId: string; client: QueryClient };
type ActionFailure = { ok: false; reason: 'forbidden' | 'error'; message?: string };
type ActionResult<T> = { ok: true; data: T } | ActionFailure;

type HazardType = 'biological' | 'chemical' | 'physical' | 'allergen';

type CcpRow = {
  id: string;
  ccpCode: string;
  name: string;
  processStep: string;
  hazardType: HazardType;
  criticalLimitMin: string | null;
  criticalLimitMax: string | null;
  unit: string;
  monitoringFrequency: string;
  correctiveAction: string;
  lineId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type MonitoringLogRow = {
  id: string;
  ccpId: string;
  ccpCode: string | null;
  measuredValue: string;
  measuredAt: string;
  woId: string | null;
  withinLimits: boolean;
  recordedBy: string | null;
  note: string | null;
  breachNcrId: string | null;
};

type MonitoringResult = { withinLimits: boolean; ncrId: string | null; outboxEmitted: boolean };
type OutputLp = { id: string; quantity: string };
type CreatedDeviationHold = { id: string; holdNumber: string };

const uuidSchema = z.string().uuid();
const decimalStringSchema = z.string().trim().regex(/^-?\d+(\.\d+)?$/, 'must be a decimal string');
const TERMINAL_LP_STATUSES = ['consumed', 'merged', 'shipped', 'returned'] as const;

const listCcpsSchema = z.object({
  activeOnly: z.boolean().optional(),
});

const upsertCcpSchema = z
  .object({
    id: uuidSchema.optional(),
    ccp_code: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(240),
    process_step: z.string().trim().min(1).max(240),
    hazard_type: z.enum(['biological', 'chemical', 'physical', 'allergen']),
    critical_limit_min: decimalStringSchema.nullish(),
    critical_limit_max: decimalStringSchema.nullish(),
    unit: z.string().trim().max(40).optional(),
    monitoring_frequency: z.string().trim().max(160).optional(),
    corrective_action: z.string().trim().max(2000).optional(),
    line_id: uuidSchema.nullish(),
    plan_id: uuidSchema.nullish(),
    is_active: z.boolean().optional(),
  })
  .refine(
    (input) =>
      input.critical_limit_min == null ||
      input.critical_limit_max == null ||
      compareDecimalStrings(input.critical_limit_min, input.critical_limit_max) <= 0,
    { message: 'critical_limit_min must be less than or equal to critical_limit_max' },
  );

const listMonitoringLogSchema = z.object({
  ccpId: uuidSchema.optional(),
  days: z.number().int().min(1).max(366).optional(),
});

const recordMonitoringSchema = z.object({
  ccpId: uuidSchema,
  measuredValue: decimalStringSchema,
  woId: uuidSchema.optional(),
  note: z.string().trim().max(2000).optional(),
});

const deactivateCcpSchema = uuidSchema;

async function hasPermission(ctx: QualityContext, permission: string): Promise<boolean> {
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

async function writeAuditEvent(
  ctx: QualityContext,
  params: {
    action: string;
    resourceType: string;
    resourceId: string;
    beforeState: unknown;
    afterState: unknown;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.audit_events
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
        before_state, after_state, request_id, retention_class)
     values
       (app.current_org_id(), $1::uuid, 'user', $2, $3, $4,
        $5::jsonb, $6::jsonb, $7::uuid, 'standard')`,
    [
      ctx.userId,
      params.action,
      params.resourceType,
      params.resourceId,
      JSON.stringify(params.beforeState),
      JSON.stringify(params.afterState),
      randomUUID(),
    ],
  );
}

/**
 * READ-gate predicate for the CCP-monitoring BOARD (listCcps + listMonitoringLog).
 *
 * Relaxed (P1): the board is viewable by anyone who can either EDIT the HACCP
 * plan (`quality.haccp.plan_edit`) OR RECORD a reading
 * (`quality.ccp.deviation_override`). Previously both reads were gated ONLY on
 * `plan_edit`, so an operator who could record readings but not edit the plan
 * got a forbidden board. CREATION (upsertCcp) stays plan_edit-only and is NOT
 * affected by this predicate.
 */
async function canReadCcpBoard(ctx: QualityContext): Promise<boolean> {
  const [planEdit, deviationOverride] = await Promise.all([
    hasPermission(ctx, 'quality.haccp.plan_edit'),
    hasPermission(ctx, 'quality.ccp.deviation_override'),
  ]);
  return planEdit || deviationOverride;
}

async function writeNcrOpenedOutbox(
  ctx: QualityContext,
  params: { ncrId: string; ccpId: string; logId: string; measuredValue: string },
): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values (app.current_org_id(), 'quality.ncr.opened', 'ncr_report', $1::uuid, $2::jsonb, 'quality-haccp-v1')`,
    [
      params.ncrId,
      JSON.stringify({
        org_id: ctx.orgId,
        actor_user_id: ctx.userId,
        ncrId: params.ncrId,
        ccpId: params.ccpId,
        monitoringLogId: params.logId,
        measuredValue: params.measuredValue,
      }),
    ],
  );
}

async function writeHoldCreatedOutbox(
  ctx: QualityContext,
  params: { holdId: string; holdNumber: string; lpId: string },
): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values (app.current_org_id(), 'quality.hold.created', 'quality_hold', $1::uuid, $2::jsonb, 'quality-holds-v1')`,
    [
      params.holdId,
      JSON.stringify({
        org_id: ctx.orgId,
        actor_user_id: ctx.userId,
        holdId: params.holdId,
        holdNumber: params.holdNumber,
        referenceType: 'lp',
        referenceId: params.lpId,
        lpIds: [params.lpId],
      }),
    ],
  );
}

async function findCurrentOutputLp(ctx: QualityContext, woId: string): Promise<OutputLp | null> {
  const { rows } = await ctx.client.query<OutputLp>(
    `select lp.id::text as id, lp.quantity::text as quantity
       from public.wo_outputs o
       join public.license_plates lp on lp.id = o.lp_id and lp.org_id = o.org_id
      where o.org_id = app.current_org_id()
        and o.wo_id = $1::uuid
        and o.lp_id is not null
      order by o.registered_at desc, o.created_at desc
      limit 1
      for update of lp`,
    [woId],
  );
  return rows[0] ?? null;
}

async function createCcpDeviationHold(
  ctx: QualityContext,
  params: { lp: OutputLp; ccpCode: string; measuredValue: string },
): Promise<CreatedDeviationHold> {
  const reasonText = `CCP breach ${params.ccpCode}: measured value ${params.measuredValue} was outside configured limits.`;
  const hold = await ctx.client.query<{ id: string; hold_number: string }>(
    `insert into public.quality_holds (
       org_id,
       reference_type,
       reference_id,
       reason_free_text,
       priority,
       hold_status,
       created_by
     )
     values (
       app.current_org_id(),
       'lp',
       $1::uuid,
       $2,
       'critical',
       'open',
       $3::uuid
     )
     returning id::text, hold_number`,
    [params.lp.id, reasonText, ctx.userId],
  );
  const created = hold.rows[0];
  if (!created?.id) throw new Error('quality hold insert did not return a row');

  await ctx.client.query(
    `insert into public.quality_hold_items (
       org_id,
       hold_id,
       license_plate_id,
       qty_held_kg,
       item_status,
       notes
     )
     values (app.current_org_id(), $1::uuid, $2::uuid, $3::numeric, 'held', $4)
     on conflict (hold_id, license_plate_id) do nothing`,
    [created.id, params.lp.id, params.lp.quantity, reasonText],
  );

  await ctx.client.query(
    `update public.license_plates
        set qa_status = 'on_hold',
            updated_by = $2::uuid
      where org_id = app.current_org_id()
        and id = $1::uuid
        and status <> all($3::text[])`,
    [params.lp.id, ctx.userId, [...TERMINAL_LP_STATUSES]],
  );

  await writeHoldCreatedOutbox(ctx, {
    holdId: created.id,
    holdNumber: created.hold_number,
    lpId: params.lp.id,
  });

  return { id: created.id, holdNumber: created.hold_number };
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function decimalScale(value: string): { scaled: bigint; scale: number } {
  const sign = value.startsWith('-') ? -1n : 1n;
  const unsigned = value.startsWith('-') ? value.slice(1) : value;
  const [whole, fraction = ''] = unsigned.split('.');
  return { scaled: BigInt(`${whole}${fraction}`) * sign, scale: fraction.length };
}

function compareDecimalStrings(left: string, right: string): number {
  const a = decimalScale(left);
  const b = decimalScale(right);
  const scale = Math.max(a.scale, b.scale);
  const aScaled = a.scaled * 10n ** BigInt(scale - a.scale);
  const bScaled = b.scaled * 10n ** BigInt(scale - b.scale);
  if (aScaled < bScaled) return -1;
  if (aScaled > bScaled) return 1;
  return 0;
}

function isWithinLimits(value: string, min: string | null, max: string | null): boolean {
  if (min !== null && compareDecimalStrings(value, min) < 0) return false;
  if (max !== null && compareDecimalStrings(value, max) > 0) return false;
  return true;
}

function mapCcpRow(row: {
  id: string;
  ccp_code: string;
  name: string;
  process_step: string;
  hazard_type: HazardType;
  critical_limit_min: string | null;
  critical_limit_max: string | null;
  unit: string | null;
  monitoring_frequency: string | null;
  corrective_action: string | null;
  line_id: string | null;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}): CcpRow {
  return {
    id: row.id,
    ccpCode: row.ccp_code,
    name: row.name,
    processStep: row.process_step,
    hazardType: row.hazard_type,
    criticalLimitMin: row.critical_limit_min,
    criticalLimitMax: row.critical_limit_max,
    unit: row.unit ?? '',
    monitoringFrequency: row.monitoring_frequency ?? '',
    correctiveAction: row.corrective_action ?? '',
    lineId: row.line_id,
    isActive: row.is_active,
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? '',
  };
}

function mapMonitoringRow(row: {
  id: string;
  ccp_id: string;
  ccp_code: string | null;
  measured_value: string;
  measured_at: Date | string;
  wo_id: string | null;
  within_limits: boolean;
  recorded_by: string | null;
  note: string | null;
  breach_ncr_id: string | null;
}): MonitoringLogRow {
  return {
    id: row.id,
    ccpId: row.ccp_id,
    ccpCode: row.ccp_code,
    measuredValue: row.measured_value,
    measuredAt: toIso(row.measured_at) ?? '',
    woId: row.wo_id,
    withinLimits: row.within_limits,
    recordedBy: row.recorded_by,
    note: row.note,
    breachNcrId: row.breach_ncr_id,
  };
}

export async function listCcps(input: { activeOnly?: boolean } = {}): Promise<ActionResult<CcpRow[]>> {
  try {
    const parsed = listCcpsSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<CcpRow[]>> => {
      // READ gate (relaxed P1): plan_edit OR ccp.deviation_override — see canReadCcpBoard.
      if (!(await canReadCcpBoard(ctx))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<Parameters<typeof mapCcpRow>[0]>(
        `select
           id::text,
           ccp_code,
           name,
           process_step,
           hazard_type,
           critical_limit_min::text,
           critical_limit_max::text,
           unit,
           monitoring_frequency,
           corrective_action,
           line_id::text,
           is_active,
           created_at,
           updated_at
         from public.haccp_ccps
        where org_id = app.current_org_id()
          and ($1::boolean is false or is_active)
        order by ccp_code`,
        [parsed.activeOnly ?? true],
      );

      return { ok: true, data: rows.map(mapCcpRow) };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function upsertCcp(data: {
  id?: string;
  ccp_code: string;
  name: string;
  process_step: string;
  hazard_type: HazardType;
  critical_limit_min?: string | null;
  critical_limit_max?: string | null;
  unit?: string;
  monitoring_frequency?: string;
  corrective_action?: string;
  line_id?: string | null;
  plan_id?: string | null;
  is_active?: boolean;
}): Promise<ActionResult<CcpRow>> {
  try {
    const parsed = upsertCcpSchema.parse(data);
    const hasPlanId = Object.prototype.hasOwnProperty.call(data, 'plan_id');
    return await withOrgContext(async (ctx): Promise<ActionResult<CcpRow>> => {
      if (!(await hasPermission(ctx, 'quality.haccp.plan_edit'))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<Parameters<typeof mapCcpRow>[0]>(
        `insert into public.haccp_ccps (
           id,
           org_id,
           ccp_code,
           name,
           process_step,
           hazard_type,
           critical_limit_min,
           critical_limit_max,
           unit,
           monitoring_frequency,
           corrective_action,
           line_id,
           plan_id,
           is_active,
           created_by
         )
         values (
           coalesce($1::uuid, gen_random_uuid()),
           app.current_org_id(),
           $2,
           $3,
           $4,
           $5,
           $6::numeric,
           $7::numeric,
           $8,
           $9,
           $10,
           $11::uuid,
           $12::uuid,
           $13::boolean,
           $14::uuid
         )
         on conflict (org_id, ccp_code) do update
            set name = excluded.name,
                process_step = excluded.process_step,
                hazard_type = excluded.hazard_type,
                critical_limit_min = excluded.critical_limit_min,
                critical_limit_max = excluded.critical_limit_max,
                unit = excluded.unit,
                monitoring_frequency = excluded.monitoring_frequency,
                corrective_action = excluded.corrective_action,
                line_id = excluded.line_id,
                plan_id = case when $15::boolean then excluded.plan_id else public.haccp_ccps.plan_id end,
                is_active = excluded.is_active
         returning
           id::text,
           ccp_code,
           name,
           process_step,
           hazard_type,
           critical_limit_min::text,
           critical_limit_max::text,
           unit,
           monitoring_frequency,
           corrective_action,
           line_id::text,
           is_active,
           created_at,
           updated_at`,
        [
          parsed.id ?? null,
          parsed.ccp_code,
          parsed.name,
          parsed.process_step,
          parsed.hazard_type,
          parsed.critical_limit_min ?? null,
          parsed.critical_limit_max ?? null,
          parsed.unit ?? '',
          parsed.monitoring_frequency ?? '',
          parsed.corrective_action ?? '',
          parsed.line_id ?? null,
          parsed.plan_id ?? null,
          parsed.is_active ?? true,
          ctx.userId,
          hasPlanId,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error('CCP upsert did not return a row');

      return { ok: true, data: mapCcpRow(row) };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function deactivateCcp(ccpId: string): Promise<ActionResult<{ id: string; isActive: false }>> {
  try {
    const parsedCcpId = deactivateCcpSchema.parse(ccpId);
    return await withOrgContext(async (ctx): Promise<ActionResult<{ id: string; isActive: false }>> => {
      if (!(await hasPermission(ctx, 'quality.haccp.plan_edit'))) return { ok: false, reason: 'forbidden' };

      const before = await ctx.client.query<{ id: string; is_active: boolean }>(
        `select id::text, is_active
           from public.haccp_ccps
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1`,
        [parsedCcpId],
      );
      const beforeRow = before.rows[0];
      if (!beforeRow) throw new Error('CCP not found');

      const updated = await ctx.client.query<{ id: string; is_active: false }>(
        `update public.haccp_ccps
            set is_active = false
          where org_id = app.current_org_id()
            and id = $1::uuid
          returning id::text, is_active`,
        [parsedCcpId],
      );
      const row = updated.rows[0];
      if (!row) throw new Error('CCP deactivate did not return a row');

      await writeAuditEvent(ctx, {
        action: 'haccp.ccp.deactivated',
        resourceType: 'haccp_ccp',
        resourceId: row.id,
        beforeState: { id: beforeRow.id, isActive: beforeRow.is_active },
        afterState: { id: row.id, isActive: row.is_active },
      });

      return { ok: true, data: { id: row.id, isActive: false } };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function listMonitoringLog(input: { ccpId?: string; days?: number } = {}): Promise<ActionResult<MonitoringLogRow[]>> {
  try {
    const parsed = listMonitoringLogSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<MonitoringLogRow[]>> => {
      // READ gate (relaxed P1): plan_edit OR ccp.deviation_override — see canReadCcpBoard.
      if (!(await canReadCcpBoard(ctx))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<Parameters<typeof mapMonitoringRow>[0]>(
        `select
           l.id::text,
           l.ccp_id::text,
           c.ccp_code,
           l.measured_value::text,
           l.measured_at,
           l.wo_id::text,
           l.within_limits,
           l.recorded_by::text,
           l.note,
           l.breach_ncr_id::text
         from public.haccp_monitoring_log l
         left join public.haccp_ccps c on c.id = l.ccp_id and c.org_id = l.org_id
        where l.org_id = app.current_org_id()
          and ($1::uuid is null or l.ccp_id = $1::uuid)
          and ($2::int is null or l.measured_at >= pg_catalog.now() - make_interval(days => $2::int))
        order by l.measured_at desc`,
        [parsed.ccpId ?? null, parsed.days ?? null],
      );

      return { ok: true, data: rows.map(mapMonitoringRow) };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function recordMonitoring(data: {
  ccpId: string;
  measuredValue: string;
  woId?: string;
  note?: string;
}): Promise<ActionResult<MonitoringResult>> {
  try {
    const parsed = recordMonitoringSchema.parse(data);
    return await withOrgContext(async (ctx): Promise<ActionResult<MonitoringResult>> => {
      if (!(await hasPermission(ctx, 'quality.ccp.deviation_override'))) return { ok: false, reason: 'forbidden' };

      const ccpResult = await ctx.client.query<{
        id: string;
        ccp_code: string;
        critical_limit_min: string | null;
        critical_limit_max: string | null;
        unit: string | null;
      }>(
        `select id::text, ccp_code, critical_limit_min::text, critical_limit_max::text, nullif(unit, '') as unit
           from public.haccp_ccps
          where org_id = app.current_org_id()
            and id = $1::uuid
            and is_active
          limit 1
          for update`,
        [parsed.ccpId],
      );
      const ccp = ccpResult.rows[0];
      if (!ccp) throw new Error('CCP not found or inactive');

      const withinLimits = isWithinLimits(parsed.measuredValue, ccp.critical_limit_min, ccp.critical_limit_max);

      const insertedLog = await ctx.client.query<{ id: string }>(
        `insert into public.haccp_monitoring_log (
           org_id,
           ccp_id,
           measured_value,
           wo_id,
           within_limits,
           recorded_by,
           note
         )
         values (
           app.current_org_id(),
           $1::uuid,
           $2::numeric(12,4),
           $3::uuid,
           $4::boolean,
           $5::uuid,
           $6
         )
         returning id::text`,
        [parsed.ccpId, parsed.measuredValue, parsed.woId ?? null, withinLimits, ctx.userId, parsed.note ?? null],
      );
      const logId = insertedLog.rows[0]?.id;
      if (!logId) throw new Error('monitoring log insert did not return a row');

      if (withinLimits) return { ok: true, data: { withinLimits, ncrId: null, outboxEmitted: false } };

      const existingDeviation = await ctx.client.query<{ id: string; breach_ncr_id: string | null }>(
        `select d.id::text, l.breach_ncr_id::text
           from public.ccp_deviations d
           left join public.haccp_monitoring_log l on l.id = d.monitoring_log_id and l.org_id = d.org_id
          where d.org_id = app.current_org_id()
            and d.monitoring_log_id = $1::uuid
          limit 1
          for update of d`,
        [logId],
      );
      const existing = existingDeviation.rows[0];
      if (existing) {
        return { ok: true, data: { withinLimits, ncrId: existing.breach_ncr_id, outboxEmitted: false } };
      }

      const ncr = await ctx.client.query<{ id: string }>(
        `insert into public.ncr_reports (
           org_id,
           ncr_type,
           severity,
           status,
           title,
           description,
           reference_type,
           reference_id,
           detected_by
         )
         values (
           app.current_org_id(),
           'quality',
           'critical',
           'open',
           $1,
           $2,
           'ccp_deviation',
           $3::uuid,
           $4::uuid
         )
         returning id::text`,
        [
          `CCP Breach: ${ccp.ccp_code}`,
          `Measured value ${parsed.measuredValue} was outside configured CCP limits.`,
          parsed.ccpId,
          ctx.userId,
        ],
      );
      const ncrId = ncr.rows[0]?.id;
      if (!ncrId) throw new Error('NCR insert did not return a row');

      await ctx.client.query(
        `update public.haccp_monitoring_log
            set breach_ncr_id = $2::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid`,
        [logId, ncrId],
      );

      await writeNcrOpenedOutbox(ctx, {
        ncrId,
        ccpId: parsed.ccpId,
        logId,
        measuredValue: parsed.measuredValue,
      });

      const outputLp = parsed.woId ? await findCurrentOutputLp(ctx, parsed.woId) : null;
      const deviationNote =
        parsed.woId && !outputLp
          ? 'Auto-hold not created: no current output license plate was found for the work order.'
          : !parsed.woId
            ? 'Auto-hold not created: no work order target was provided.'
            : null;

      const deviation = await ctx.client.query<{ id: string }>(
        `insert into public.ccp_deviations (
           org_id,
           ccp_id,
           monitoring_log_id,
           measured_value,
           uom,
           action_taken,
           status,
           opened_by
         )
         values (
           app.current_org_id(),
           $1::uuid,
           $2::uuid,
           $3::numeric,
           $4,
           $5,
           'open',
           $6::uuid
         )
         returning id::text`,
        [parsed.ccpId, logId, parsed.measuredValue, ccp.unit, deviationNote, ctx.userId],
      );
      const deviationId = deviation.rows[0]?.id;
      if (!deviationId) throw new Error('CCP deviation insert did not return a row');

      if (outputLp) {
        const hold = await createCcpDeviationHold(ctx, {
          lp: outputLp,
          ccpCode: ccp.ccp_code,
          measuredValue: parsed.measuredValue,
        });
        await ctx.client.query(
          `update public.ccp_deviations
              set hold_id = $2::uuid
            where org_id = app.current_org_id()
              and id = $1::uuid`,
          [deviationId, hold.id],
        );
      }

      return { ok: true, data: { withinLimits, ncrId, outboxEmitted: true } };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

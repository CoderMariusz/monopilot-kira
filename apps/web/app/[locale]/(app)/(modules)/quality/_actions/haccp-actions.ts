'use server';

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

const uuidSchema = z.string().uuid();
const decimalStringSchema = z.string().trim().regex(/^-?\d+(\.\d+)?$/, 'must be a decimal string');

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
  is_active?: boolean;
}): Promise<ActionResult<CcpRow>> {
  try {
    const parsed = upsertCcpSchema.parse(data);
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
           $12::boolean,
           $13::uuid
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
          parsed.is_active ?? true,
          ctx.userId,
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
      }>(
        `select id::text, ccp_code, critical_limit_min::text, critical_limit_max::text
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

      return { ok: true, data: { withinLimits, ncrId, outboxEmitted: true } };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

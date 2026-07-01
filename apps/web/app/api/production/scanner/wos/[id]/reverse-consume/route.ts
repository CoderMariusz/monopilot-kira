import { createHash, randomUUID } from 'node:crypto';

import { NextRequest } from 'next/server';

import {
  CLOSED_WO_CORRECTION_PERMISSION,
  CORRECTION_REASON_CODES,
  type CorrectionReasonCode,
} from '../../../../../../../lib/corrections/correct-ledger-entry';
import { CONSUMPTION_CORRECT_PERMISSION } from '../../../../../../../lib/corrections/constants';
import { materialIdFromConsumptionExt } from '../../../../../../../lib/corrections/material-scope';
import { hasPermission, type ProductionContext } from '../../../../../../../lib/production/shared';
import { findUserByEmail, userHasPin, verifyPin } from '../../../../../../../lib/scanner/auth';
import { requireScannerSession } from '../../../../../../../lib/scanner/guard';
import { isRecord, stringField } from '../../../../../../../lib/scanner/route-utils';
import { cleanupTxnOrgContext, registerTxnOrgContext } from '../../../../../../../lib/scanner/txn-org-context';
import {
  auditAttempt,
  getWoId,
  isDecimalString,
  readRecordBody,
  scannerError,
  scannerOk,
  scannerValidationError,
  type RouteContext,
} from '../../../_support';

const OPERATION = 'production.scanner.wos.reverse_consume';
const CONSUMPTION_REVERSE_INTENT = 'production.consumption.reverse';
const CONSUMPTION_OVERRIDE_APPROVE_PERMISSION = 'production.consumption.override_approve';
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

type ConsumptionRow = {
  id: string;
  transaction_id: string;
  site_id: string | null;
  wo_id: string;
  component_id: string;
  lp_id: string;
  qty_consumed: string;
  uom: string;
  operator_id: string | null;
  fefo_adherence_flag: boolean;
  fefo_deviation_reason: string | null;
  over_consumption_flag: boolean;
  over_consumption_approved_by: string | null;
  over_consumption_approved_at: string | null;
  over_consumption_reason_code: string | null;
  ext_jsonb: unknown;
  consumed_at: string;
  wo_status: string | null;
};

type LicensePlateRow = {
  id: string;
  site_id: string | null;
  status: string;
  qa_status: string;
  quantity: string;
  reserved_qty: string;
};

function isUuid(value: string | null): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function bodyString(body: Record<string, unknown>, snake: string, camel?: string): string | null {
  return stringField(body, snake) ?? (camel ? stringField(body, camel) : null);
}

function reasonCodeFromBody(body: Record<string, unknown>): CorrectionReasonCode {
  const raw = bodyString(body, 'reason_code', 'reasonCode');
  if (raw && CORRECTION_REASON_CODES.includes(raw as CorrectionReasonCode)) return raw as CorrectionReasonCode;
  return 'other';
}

function nullableNoteFromBody(body: Record<string, unknown>): string | null {
  const note = bodyString(body, 'note');
  return note && note.length > 0 ? note : null;
}

function negateDecimalString(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('-')) return trimmed.slice(1);
  return `-${trimmed}`;
}

function deterministicUuid(seed: string): string {
  const hex = createHash('md5').update(seed).digest('hex');
  const v = hex.slice(0, 12) + '3' + hex.slice(13, 16) + ((parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 32);
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20, 32)}`;
}

function correctionTransactionId(params: { orgId: string; table: string; originalId: string; reasonCode: string }): string {
  return deterministicUuid(`${params.orgId}:correction:${params.table}:${params.originalId}:${params.reasonCode}`);
}

function lpRestoreTargetState(lp: LicensePlateRow): string {
  if (lp.status !== 'consumed') return lp.status;
  return lp.qa_status === 'released' ? 'available' : 'received';
}

function replayResponse(ext: Record<string, unknown>) {
  const reverseConsumptionId = typeof ext.reverse_consumption_id === 'string' ? ext.reverse_consumption_id : null;
  return scannerOk({
    success: true,
    replay: true,
    consumption_id: typeof ext.consumption_id === 'string' ? ext.consumption_id : null,
    reverse_consumption_id: reverseConsumptionId,
    lp_status_after: typeof ext.lp_status_after === 'string' ? ext.lp_status_after : null,
  });
}

async function readReplay(client: ProductionContext['client'], orgId: string, clientOpId: string): Promise<Record<string, unknown> | null> {
  const replay = await client.query<{ ext: Record<string, unknown> | null }>(
    `select ext
       from public.scanner_audit_log
      where org_id = $1::uuid
        and client_op_id = $2
      limit 1`,
    [orgId, clientOpId],
  );
  return isRecord(replay.rows[0]?.ext) ? replay.rows[0].ext : null;
}

async function loadConsumptionForUpdate(
  ctx: ProductionContext,
  params: { woId: string; consumptionId: string | null; woMaterialId: string | null; lpId: string | null; qty: string | null },
): Promise<ConsumptionRow | null> {
  const selectSql = `select c.id::text as id,
                           c.transaction_id::text as transaction_id,
                           c.site_id::text as site_id,
                           c.wo_id::text as wo_id,
                           c.component_id::text as component_id,
                           c.lp_id::text as lp_id,
                           c.qty_consumed::text as qty_consumed,
                           c.uom,
                           c.operator_id::text as operator_id,
                           c.fefo_adherence_flag,
                           c.fefo_deviation_reason,
                           c.over_consumption_flag,
                           c.over_consumption_approved_by::text as over_consumption_approved_by,
                           c.over_consumption_approved_at::text as over_consumption_approved_at,
                           c.over_consumption_reason_code,
                           c.ext_jsonb,
                           c.consumed_at::text as consumed_at,
                           coalesce(we.status, wo.status)::text as wo_status
                      from public.wo_material_consumption c
                      join public.work_orders wo on wo.id = c.wo_id and wo.org_id = c.org_id
                      left join public.wo_executions we on we.wo_id = c.wo_id and we.org_id = c.org_id`;

  if (params.consumptionId) {
    const { rows } = await ctx.client.query<ConsumptionRow>(
      `${selectSql}
       where c.org_id = app.current_org_id()
         and c.wo_id = $1::uuid
         and c.id = $2::uuid
         and c.correction_of_id is null
       limit 1
       for update of c`,
      [params.woId, params.consumptionId],
    );
    return rows[0] ?? null;
  }

  const { rows } = await ctx.client.query<ConsumptionRow>(
    `${selectSql}
       join public.wo_materials wm
         on wm.org_id = c.org_id
        and wm.wo_id = c.wo_id
        and wm.product_id = c.component_id
      where c.org_id = app.current_org_id()
        and c.wo_id = $1::uuid
        and wm.id = $2::uuid
        and c.lp_id = $3::uuid
        and c.qty_consumed = $4::numeric
        and c.correction_of_id is null
      order by c.consumed_at desc, c.id desc
      limit 1
      for update of c`,
    [params.woId, params.woMaterialId, params.lpId, params.qty],
  );
  return rows[0] ?? null;
}

async function hasConsumptionCorrection(ctx: ProductionContext, consumptionId: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.wo_material_consumption
      where org_id = app.current_org_id()
        and correction_of_id = $1::uuid
      limit 1`,
    [consumptionId],
  );
  return rows.length > 0;
}

async function loadLicensePlateForUpdate(ctx: ProductionContext, lpId: string): Promise<LicensePlateRow | null> {
  const { rows } = await ctx.client.query<LicensePlateRow>(
    `select id::text as id,
            site_id::text as site_id,
            status,
            qa_status,
            quantity::text as quantity,
            reserved_qty::text as reserved_qty
       from public.license_plates
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1
      for update`,
    [lpId],
  );
  return rows[0] ?? null;
}

async function lockWoMaterialsAndValidateDecrement(ctx: ProductionContext, original: ConsumptionRow): Promise<boolean> {
  const materialId = materialIdFromConsumptionExt(original);

  if (!materialId) {
    const { rows } = await ctx.client.query<{ id: string; can_decrement: boolean; matching_line_count: string }>(
      `with locked_materials as (
         select id,
                consumed_qty
           from public.wo_materials
          where org_id = app.current_org_id()
            and wo_id = $1::uuid
            and product_id = $2::uuid
          for update
       )
       select id::text as id,
              (consumed_qty - $3::numeric >= 0) as can_decrement,
              (select count(*) from locked_materials)::text as matching_line_count
         from locked_materials`,
      [original.wo_id, original.component_id, original.qty_consumed],
    );
    return rows.length === 1 && rows[0]?.matching_line_count === '1' && rows[0].can_decrement;
  }

  const { rows } = await ctx.client.query<{ id: string; can_decrement: boolean }>(
    `select id::text as id,
            (consumed_qty - $3::numeric >= 0) as can_decrement
       from public.wo_materials
      where org_id = app.current_org_id()
        and wo_id = $1::uuid
        and ${materialId ? 'id' : 'product_id'} = $2::uuid
        and consumed_qty - $3::numeric >= 0
      for update`,
    [original.wo_id, materialId ?? original.component_id, original.qty_consumed],
  );
  return rows.length > 0 && rows.every((row) => row.can_decrement);
}

async function supervisorPinRequired(ctx: ProductionContext): Promise<boolean> {
  const { rows } = await ctx.client.query<{ require_supervisor: string | null }>(
    `select feature_flags->>'scanner_reverse_require_supervisor_pin' as require_supervisor
       from public.tenant_variations
      where org_id = $1::uuid
      limit 1`,
    [ctx.orgId],
  );
  return rows[0]?.require_supervisor?.toLowerCase() !== 'false';
}

async function insertCounterEntry(
  ctx: ProductionContext,
  params: { original: ConsumptionRow; reasonCode: CorrectionReasonCode; note: string | null },
): Promise<{ id: string }> {
  const transactionId = correctionTransactionId({
    orgId: ctx.orgId,
    table: 'wo_material_consumption',
    originalId: params.original.id,
    reasonCode: params.reasonCode,
  });
  const { rows } = await ctx.client.query<{ id: string }>(
    `insert into public.wo_material_consumption (
       org_id,
       correction_of_id,
       transaction_id,
       site_id,
       wo_id,
       component_id,
       lp_id,
       qty_consumed,
       uom,
       operator_id,
       fefo_adherence_flag,
       fefo_deviation_reason,
       over_consumption_flag,
       over_consumption_approved_by,
       over_consumption_approved_at,
       over_consumption_reason_code,
       ext_jsonb
     )
     values (
       app.current_org_id(),
       $1::uuid,
       $2::uuid,
       $3::uuid,
       $4::uuid,
       $5::uuid,
       $6::uuid,
       $7::numeric,
       $8,
       $9::uuid,
       $10,
       $11,
       false,
       null,
       null,
       null,
       $12::jsonb
     )
     returning id::text as id`,
    [
      params.original.id,
      transactionId,
      params.original.site_id,
      params.original.wo_id,
      params.original.component_id,
      params.original.lp_id,
      negateDecimalString(params.original.qty_consumed),
      params.original.uom,
      ctx.userId,
      params.original.fefo_adherence_flag,
      params.original.fefo_deviation_reason,
      JSON.stringify({
        correction_reason_code: params.reasonCode,
        correction_note: params.note,
        corrected_consumption_id: params.original.id,
        source: 'scannerReverseConsumption',
        esign_intent: CONSUMPTION_REVERSE_INTENT,
        original_ext_jsonb: params.original.ext_jsonb ?? {},
      }),
    ],
  );
  const row = rows[0];
  if (!row) throw new Error('reverse-consume: counter insert returned no row');
  return row;
}

async function decrementConsumedQty(ctx: ProductionContext, original: ConsumptionRow): Promise<boolean> {
  const materialId = materialIdFromConsumptionExt(original);

  if (!materialId) {
    const { rows } = await ctx.client.query<{ id: string }>(
      `with locked_materials as (
         select id
           from public.wo_materials
          where org_id = app.current_org_id()
            and wo_id = $1::uuid
            and product_id = $2::uuid
          for update
       ),
       single_material as (
         select id
           from locked_materials
          where (select count(*) from locked_materials) = 1
       )
       update public.wo_materials wm
          set consumed_qty = wm.consumed_qty - $3::numeric,
              updated_at = now()
         from single_material sm
        where wm.org_id = app.current_org_id()
          and wm.id = sm.id
          and wm.consumed_qty - $3::numeric >= 0
        returning wm.id::text as id`,
      [original.wo_id, original.component_id, original.qty_consumed],
    );
    return rows.length === 1;
  }

  const { rows } = await ctx.client.query<{ id: string }>(
    `update public.wo_materials
        set consumed_qty = consumed_qty - $3::numeric,
            updated_at = now()
      where org_id = app.current_org_id()
        and wo_id = $1::uuid
        and ${materialId ? 'id' : 'product_id'} = $2::uuid
        and consumed_qty - $3::numeric >= 0
      returning id::text as id`,
    [original.wo_id, materialId ?? original.component_id, original.qty_consumed],
  );
  return rows.length > 0;
}

async function restoreLicensePlate(
  ctx: ProductionContext,
  params: { original: ConsumptionRow; lp: LicensePlateRow; toState: string },
): Promise<void> {
  await ctx.client.query(
    `update public.license_plates
        set quantity = quantity + $2::numeric,
            status = $4,
            consumed_by_wo_id = case when status = 'consumed' then null else consumed_by_wo_id end,
            updated_by = $3::uuid,
            updated_at = now()
      where org_id = app.current_org_id()
        and id = $1::uuid`,
    [params.lp.id, params.original.qty_consumed, ctx.userId, params.toState],
  );
}

async function writeLpRestoredHistory(
  ctx: ProductionContext,
  params: { original: ConsumptionRow; lp: LicensePlateRow; toState: string; reasonCode: CorrectionReasonCode; note: string | null },
): Promise<void> {
  await ctx.client.query(
    `insert into public.lp_state_history (
       org_id,
       site_id,
       lp_id,
       from_state,
       to_state,
       reason_code,
       reason_text,
       wo_id,
       transaction_id,
       ext_jsonb,
       created_by
     )
     values (
       app.current_org_id(),
       $1::uuid,
       $2::uuid,
       $3,
       $4,
       'consumption_reversed',
       $5,
       $6::uuid,
       $7::uuid,
       $8::jsonb,
       $9::uuid
     )`,
    [
      params.lp.site_id ?? params.original.site_id,
      params.lp.id,
      params.lp.status,
      params.toState,
      params.note,
      params.original.wo_id,
      randomUUID(),
      JSON.stringify({
        consumption_id: params.original.id,
        correction_reason_code: params.reasonCode,
        reversed_qty: params.original.qty_consumed,
      }),
      ctx.userId,
    ],
  );
}

async function writeConsumptionReverseAudit(
  ctx: ProductionContext,
  params: { original: ConsumptionRow; lp: LicensePlateRow | null; correctionId: string; reasonCode: CorrectionReasonCode; note: string | null },
): Promise<void> {
  await ctx.client.query(
    `insert into public.audit_events (
       org_id,
       actor_user_id,
       actor_type,
       action,
       resource_type,
       resource_id,
       before_state,
       after_state,
       request_id,
       retention_class
     )
     values (
       app.current_org_id(),
       $1::uuid,
       'user',
       'production.consumption.corrected',
       'wo_material_consumption',
       $2,
       $3::jsonb,
       $4::jsonb,
       $5::uuid,
       'operational'
     )`,
    [
      ctx.userId,
      params.original.id,
      JSON.stringify({
        consumption_id: params.original.id,
        wo_id: params.original.wo_id,
        component_id: params.original.component_id,
        lp_id: params.original.lp_id,
        qty_consumed: params.original.qty_consumed,
        lp_status: params.lp?.status ?? null,
        lp_quantity: params.lp?.quantity ?? null,
      }),
      JSON.stringify({
        correction_id: params.correctionId,
        correction_of_id: params.original.id,
        reason_code: params.reasonCode,
        note: params.note,
        reversed_qty: params.original.qty_consumed,
        esign_intent: CONSUMPTION_REVERSE_INTENT,
      }),
      randomUUID(),
    ],
  );
}

async function readReplayAfterRollback(
  client: ProductionContext['client'],
  orgId: string,
  userId: string,
  clientOpId: string,
): Promise<Record<string, unknown> | null> {
  await client.query('begin');
  let token: string | null = null;
  try {
    token = await registerTxnOrgContext(client, orgId, userId);
    const replay = await readReplay(client, orgId, clientOpId);
    await client.query('commit');
    return replay;
  } catch {
    try {
      await client.query('rollback');
    } catch {
      /* noop */
    }
    return null;
  } finally {
    await cleanupTxnOrgContext(client, token);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const woId = await getWoId(context);
  const body = await readRecordBody(request);
  if (!body) return scannerValidationError(request, null, OPERATION, 'invalid_json', 400, { woId });

  const clientOpId = bodyString(body, 'client_op_id', 'clientOpId');
  const consumptionId = bodyString(body, 'consumption_id', 'consumptionId');
  const woMaterialId = bodyString(body, 'wo_material_id', 'woMaterialId');
  const lpId = bodyString(body, 'lp_id', 'lpId');
  const qty = stringField(body, 'qty');
  const operatorPin = bodyString(body, 'operator_pin', 'operatorPin');
  const reasonCode = reasonCodeFromBody(body);
  const note = nullableNoteFromBody(body);

  const hasDirectLookup = isUuid(consumptionId);
  const hasAlternateLookup = isUuid(woMaterialId) && isUuid(lpId) && qty !== null && isDecimalString(qty) && !/^0+(\.0+)?$/.test(qty);
  if (!clientOpId || !operatorPin || (!hasDirectLookup && !hasAlternateLookup)) {
    return scannerValidationError(request, body, OPERATION, 'missing_fields', 400, { woId, clientOpId });
  }

  const result = await requireScannerSession(request, body, OPERATION, async ({ client, session }) => {
    let txnOrgContextToken: string | null = null;
    try {
      await client.query('begin');
      txnOrgContextToken = await registerTxnOrgContext(client, session.org_id, session.user_id);
      const ctx = { client, userId: session.user_id, orgId: session.org_id } as unknown as ProductionContext;

      const earlyReplay = await readReplay(client, session.org_id, clientOpId);
      if (earlyReplay) {
        await client.query('commit');
        await auditAttempt(client, session, OPERATION, 'replay', { woId, clientOpId });
        return replayResponse(earlyReplay);
      }

      await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `${session.org_id}:scanner:${clientOpId}`,
      ]);

      const lockedReplay = await readReplay(client, session.org_id, clientOpId);
      if (lockedReplay) {
        await client.query('commit');
        await auditAttempt(client, session, OPERATION, 'replay', { woId, clientOpId });
        return replayResponse(lockedReplay);
      }

      const operatorPinResult = await verifyPin(session.user_id, operatorPin, { client });
      if (operatorPinResult === 'locked') {
        await client.query('rollback');
        await auditAttempt(client, session, OPERATION, 'pin_locked', { woId, clientOpId });
        return scannerError('pin_locked', 423);
      }
      if (operatorPinResult !== true) {
        await client.query('commit');
        await auditAttempt(client, session, OPERATION, 'invalid_pin', { woId, clientOpId });
        return scannerError('invalid_pin', 401);
      }

      if (!(await hasPermission(ctx, CONSUMPTION_CORRECT_PERMISSION))) {
        await client.query('rollback');
        await auditAttempt(client, session, OPERATION, 'forbidden', { woId, clientOpId });
        return scannerError('forbidden', 403);
      }

      const requireSupervisorPin = await supervisorPinRequired(ctx);
      let supervisorUserId: string | null = null;
      if (requireSupervisorPin) {
        const supervisorBody = isRecord(body.supervisor) ? body.supervisor : null;
        const supervisorEmail = (bodyString(body, 'supervisor_email', 'supervisorEmail') ?? (supervisorBody ? stringField(supervisorBody, 'email') : null))?.toLowerCase();
        const supervisorPin = bodyString(body, 'supervisor_pin', 'supervisorPin') ?? (supervisorBody ? stringField(supervisorBody, 'pin') : null);
        if (!supervisorEmail || !supervisorPin) {
          await client.query('rollback');
          await auditAttempt(client, session, OPERATION, 'invalid_supervisor', { woId, clientOpId });
          return scannerError('invalid_supervisor', 401);
        }

        const supervisor = await findUserByEmail(client, supervisorEmail);
        if (!supervisor || supervisor.org_id !== session.org_id || supervisor.id === session.user_id) {
          await client.query('rollback');
          await auditAttempt(client, session, OPERATION, 'invalid_supervisor', { woId, clientOpId });
          return scannerError('invalid_supervisor', 401);
        }
        if (!(await userHasPin(client, supervisor.id))) {
          await client.query('rollback');
          await auditAttempt(client, session, OPERATION, 'pin_not_enrolled', { woId, clientOpId });
          return scannerError('pin_not_enrolled', 409);
        }

        const supervisorPinResult = await verifyPin(supervisor.id, supervisorPin, { client });
        if (supervisorPinResult === 'locked') {
          await client.query('rollback');
          await auditAttempt(client, session, OPERATION, 'pin_locked', { woId, clientOpId });
          return scannerError('pin_locked', 423);
        }
        if (supervisorPinResult !== true) {
          await client.query('commit');
          await auditAttempt(client, session, OPERATION, 'invalid_pin', { woId, clientOpId });
          return scannerError('invalid_pin', 401);
        }

        const supervisorCtx = { client, userId: supervisor.id, orgId: session.org_id } as unknown as ProductionContext;
        if (!(await hasPermission(supervisorCtx, CONSUMPTION_OVERRIDE_APPROVE_PERMISSION))) {
          await client.query('rollback');
          await auditAttempt(client, session, OPERATION, 'supervisor_forbidden', { woId, clientOpId });
          return scannerError('supervisor_forbidden', 403);
        }
        supervisorUserId = supervisor.id;
      }

      const original = await loadConsumptionForUpdate(ctx, {
        woId,
        consumptionId: hasDirectLookup ? consumptionId : null,
        woMaterialId: hasAlternateLookup ? woMaterialId : null,
        lpId: hasAlternateLookup ? lpId : null,
        qty: hasAlternateLookup ? qty : null,
      });
      if (!original) {
        await client.query('rollback');
        await auditAttempt(client, session, OPERATION, 'not_found', { woId, clientOpId, consumptionId, woMaterialId, lpId });
        return scannerError('not_found', 404);
      }

      if (original.wo_status === 'closed' && !(await hasPermission(ctx, CLOSED_WO_CORRECTION_PERMISSION))) {
        await client.query('rollback');
        await auditAttempt(client, session, OPERATION, 'closed_wo_correction_forbidden', { woId, clientOpId, consumptionId: original.id });
        return scannerError('closed_wo_correction_forbidden', 403);
      }

      if (await hasConsumptionCorrection(ctx, original.id)) {
        await client.query('rollback');
        await auditAttempt(client, session, OPERATION, 'already_corrected', { woId, clientOpId, consumptionId: original.id });
        return scannerError('already_corrected', 409, { consumption_id: original.id });
      }

      let lp: LicensePlateRow | null = null;
      if (original.lp_id !== NIL_UUID) {
        lp = await loadLicensePlateForUpdate(ctx, original.lp_id);
        if (!lp || !['consumed', 'available', 'received'].includes(lp.status)) {
          await client.query('rollback');
          await auditAttempt(client, session, OPERATION, 'lp_not_restorable', { woId, clientOpId, consumptionId: original.id });
          return scannerError('lp_not_restorable', 409);
        }
      }

      if (!(await lockWoMaterialsAndValidateDecrement(ctx, original))) {
        await client.query('rollback');
        await auditAttempt(client, session, OPERATION, 'inconsistent_ledger', { woId, clientOpId, consumptionId: original.id });
        return scannerError('inconsistent_ledger', 409);
      }

      const correction = await insertCounterEntry(ctx, { original, reasonCode, note });
      if (!(await decrementConsumedQty(ctx, original))) {
        throw new Error('reverse-consume: wo_materials decrement failed despite pre-validated row lock');
      }

      let lpStatusAfter: string | null = null;
      if (lp) {
        lpStatusAfter = lpRestoreTargetState(lp);
        await restoreLicensePlate(ctx, { original, lp, toState: lpStatusAfter });
        await writeLpRestoredHistory(ctx, { original, lp, toState: lpStatusAfter, reasonCode, note });
      }

      await writeConsumptionReverseAudit(ctx, { original, lp, correctionId: correction.id, reasonCode, note });

      await client.query(
        `insert into public.scanner_audit_log (
           org_id, session_id, user_id, device_id, operation, lp_id, wo_id,
           result_code, client_op_id, ext
         )
         values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::uuid, $7::uuid,
                 'ok', $8, $9::jsonb)`,
        [
          session.org_id,
          session.id,
          session.user_id,
          session.device_id,
          OPERATION,
          lp?.id ?? null,
          woId,
          clientOpId,
          JSON.stringify({
            success: true,
            consumption_id: original.id,
            reverse_consumption_id: correction.id,
            lp_status_after: lpStatusAfter,
            operator_user_id: session.user_id,
            supervisor_user_id: supervisorUserId,
            supervisor_pin_required: requireSupervisorPin,
            reason_code: reasonCode,
            esign_intent: CONSUMPTION_REVERSE_INTENT,
          }),
        ],
      );

      await client.query('commit');
      return scannerOk({
        success: true,
        consumption_id: original.id,
        reverse_consumption_id: correction.id,
        lp_status_after: lpStatusAfter,
        replay: false,
      });
    } catch (error) {
      try {
        await client.query('rollback');
      } catch {
        /* noop */
      }

      const pgCode = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : null;
      if (pgCode === '23505') {
        const replay = await readReplayAfterRollback(client, session.org_id, session.user_id, clientOpId);
        if (replay) return replayResponse(replay);
        await auditAttempt(client, session, OPERATION, 'already_corrected', { woId, clientOpId });
        return scannerError('already_corrected', 409);
      }
      if (pgCode === '23514' || pgCode === '23503' || pgCode === '22P02') {
        await auditAttempt(client, session, OPERATION, 'invalid_input', { woId, clientOpId });
        return scannerError('invalid_input', 422);
      }

      await auditAttempt(client, session, OPERATION, 'error', {
        woId,
        clientOpId,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      await cleanupTxnOrgContext(client, txnOrgContextToken);
    }
  });

  if ('guardError' in result) return scannerError(result.error, result.status);
  return result;
}

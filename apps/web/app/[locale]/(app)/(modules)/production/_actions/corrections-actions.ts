'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  assertCorrectionAllowed,
  CORRECTION_REASON_CODES,
  CorrectionForbiddenError,
  CorrectionInvalidInputError,
  type CorrectionReasonCode,
  insertCounterEntry,
} from '../../../../../../lib/corrections/correct-ledger-entry';
import type { ProductionContext, QueryClient } from '../../../../../../lib/production/shared';

const WASTE_CORRECT_PERMISSION = 'production.waste.correct';
const OUTPUT_CORRECT_PERMISSION = 'production.output.correct';
const OUTPUT_VOID_INTENT = 'production.output.void';
// 'destroyed' became legal in migration 294 (the mig-191 CHECK lacked it even
// though app code already excluded it from active-LP sets). Distinct from
// 'consumed' so voided pallets never pollute consumption semantics.
const VOIDED_LP_STATUS = 'destroyed';

export type VoidWasteEntryInput = {
  wasteId: string;
  reasonCode: CorrectionReasonCode;
  note?: string | null;
};

export type VoidWasteEntryResult =
  | { ok: true }
  | {
      ok: false;
      error: 'forbidden' | 'not_found' | 'already_corrected' | 'invalid_input' | 'persistence_failed';
      message?: string;
    };

export type VoidWoOutputInput = {
  outputId: string;
  reasonCode: CorrectionReasonCode;
  note?: string | null;
  signature: { password: string };
};

export type VoidWoOutputResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | 'forbidden'
        | 'not_found'
        | 'already_corrected'
        | 'lp_not_voidable'
        | 'invalid_input'
        | 'esign_failed'
        | 'persistence_failed';
      message?: string;
    };

type WasteRow = {
  id: string;
  transaction_id: string;
  wo_id: string;
  category_id: string;
  qty_kg: string;
  reason_code: string | null;
  reason_notes: string | null;
  operator_id: string | null;
  shift_id: string;
  recorded_at: string;
  wo_status: string | null;
};

type OutputRow = {
  id: string;
  transaction_id: string;
  site_id: string | null;
  wo_id: string;
  output_type: string;
  product_id: string;
  lp_id: string | null;
  batch_number: string;
  qty_kg: string;
  uom: string;
  qa_status: string;
  expiry_date: string | null;
  catch_weight_details: unknown;
  allergen_profile_snapshot: unknown;
  registered_by: string | null;
  registered_at: string;
  wo_status: string | null;
};

type LicensePlateRow = {
  id: string;
  status: string;
  qa_status: string;
  quantity: string;
  reserved_qty: string;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isReasonCode(value: string): value is CorrectionReasonCode {
  return CORRECTION_REASON_CODES.includes(value as CorrectionReasonCode);
}

function negateDecimalString(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('-')) return trimmed.slice(1);
  return `-${trimmed}`;
}

function isZeroDecimalString(value: string): boolean {
  return Number(value) === 0;
}

// Locks the original waste row (FOR UPDATE OF wl — same locking discipline as
// loadOutputForUpdate) so concurrent voids of the same row serialize. The
// hasWasteCorrection pre-check stays for a friendly error; the mig-296 unique
// partial index (org_id, correction_of_id) is the DB backstop — a losing racer
// hits 23505 on the counter INSERT, mapped to 'already_corrected'.
async function loadWasteForUpdate(ctx: ProductionContext, wasteId: string): Promise<WasteRow | null> {
  const { rows } = await ctx.client.query<WasteRow>(
    `select wl.id::text as id,
            wl.transaction_id::text as transaction_id,
            wl.wo_id::text as wo_id,
            wl.category_id::text as category_id,
            wl.qty_kg::text as qty_kg,
            wl.reason_code,
            wl.reason_notes,
            wl.operator_id::text as operator_id,
            wl.shift_id,
            wl.recorded_at::text as recorded_at,
            coalesce(we.status, wo.status)::text as wo_status
       from public.wo_waste_log wl
       join public.work_orders wo on wo.id = wl.wo_id and wo.org_id = wl.org_id
       left join public.wo_executions we on we.wo_id = wl.wo_id and we.org_id = wl.org_id
      where wl.org_id = app.current_org_id()
        and wl.id = $1::uuid
        and wl.correction_of_id is null
      limit 1
      for update of wl`,
    [wasteId],
  );
  return rows[0] ?? null;
}

async function hasWasteCorrection(ctx: ProductionContext, wasteId: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.wo_waste_log
      where org_id = app.current_org_id()
        and correction_of_id = $1::uuid
      limit 1`,
    [wasteId],
  );
  return rows.length > 0;
}

async function loadOutputForUpdate(ctx: ProductionContext, outputId: string): Promise<OutputRow | null> {
  const { rows } = await ctx.client.query<OutputRow>(
    `select o.id::text as id,
            o.transaction_id::text as transaction_id,
            o.site_id::text as site_id,
            o.wo_id::text as wo_id,
            o.output_type,
            o.product_id::text as product_id,
            o.lp_id::text as lp_id,
            o.batch_number,
            o.qty_kg::text as qty_kg,
            o.uom,
            o.qa_status,
            o.expiry_date::text as expiry_date,
            o.catch_weight_details,
            o.allergen_profile_snapshot,
            o.registered_by::text as registered_by,
            o.registered_at::text as registered_at,
            coalesce(we.status, wo.status)::text as wo_status
       from public.wo_outputs o
       join public.work_orders wo on wo.id = o.wo_id and wo.org_id = o.org_id
       left join public.wo_executions we on we.wo_id = o.wo_id and we.org_id = o.org_id
      where o.org_id = app.current_org_id()
        and o.id = $1::uuid
        and o.correction_of_id is null
      limit 1
      for update of o`,
    [outputId],
  );
  return rows[0] ?? null;
}

async function loadLicensePlateForUpdate(ctx: ProductionContext, lpId: string): Promise<LicensePlateRow | null> {
  const { rows } = await ctx.client.query<LicensePlateRow>(
    `select id::text as id,
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

async function hasOutputCorrection(ctx: ProductionContext, outputId: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.wo_outputs
      where org_id = app.current_org_id()
        and correction_of_id = $1::uuid
      limit 1`,
    [outputId],
  );
  return rows.length > 0;
}

async function hasLpConsumptionOrChildren(ctx: ProductionContext, lpId: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select (
       exists (
         select 1
           from public.wo_material_consumption
          where org_id = app.current_org_id()
            and lp_id = $1::uuid
       )
       or exists (
         select 1
           from public.license_plates
          where org_id = app.current_org_id()
            and parent_lp_id = $1::uuid
       )
     ) as ok`,
    [lpId],
  );
  return rows[0]?.ok === true;
}

async function writeWasteVoidAudit(
  ctx: ProductionContext,
  params: {
    original: WasteRow;
    correctionId: string;
    reasonCode: CorrectionReasonCode;
    note: string | null;
  },
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
       'production.waste.corrected',
       'wo_waste_log',
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
        waste_id: params.original.id,
        wo_id: params.original.wo_id,
        qty_kg: params.original.qty_kg,
        reason_code: params.original.reason_code,
      }),
      JSON.stringify({
        correction_id: params.correctionId,
        correction_of_id: params.original.id,
        reason_code: params.reasonCode,
        note: params.note,
      }),
      randomUUID(),
    ],
  );
}

async function writeOutputVoidAudit(
  ctx: ProductionContext,
  params: {
    original: OutputRow;
    lp: LicensePlateRow;
    correctionId: string;
    reasonCode: CorrectionReasonCode;
    note: string | null;
  },
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
       'production.output.corrected',
       'wo_outputs',
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
        output_id: params.original.id,
        wo_id: params.original.wo_id,
        lp_id: params.original.lp_id,
        qty_kg: params.original.qty_kg,
        lp_status: params.lp.status,
        lp_quantity: params.lp.quantity,
      }),
      JSON.stringify({
        correction_id: params.correctionId,
        correction_of_id: params.original.id,
        reason_code: params.reasonCode,
        note: params.note,
        lp_status: VOIDED_LP_STATUS,
        lp_quantity: '0',
      }),
      randomUUID(),
    ],
  );
}

async function writeLpVoidHistory(
  ctx: ProductionContext,
  params: {
    original: OutputRow;
    lp: LicensePlateRow;
    reasonCode: CorrectionReasonCode;
    note: string | null;
  },
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
       'output_voided',
       $5,
       $6::uuid,
       $7::uuid,
       $8::jsonb,
       $9::uuid
     )`,
    [
      params.original.site_id,
      params.lp.id,
      params.lp.status,
      VOIDED_LP_STATUS,
      params.note,
      params.original.wo_id,
      randomUUID(),
      JSON.stringify({
        output_id: params.original.id,
        correction_reason_code: params.reasonCode,
      }),
      ctx.userId,
    ],
  );
}

async function markLpVoided(ctx: ProductionContext, lpId: string): Promise<void> {
  await ctx.client.query(
    `update public.license_plates
        set status = $2,
            quantity = 0,
            reserved_qty = 0,
            updated_by = $3::uuid,
            updated_at = now()
      where org_id = app.current_org_id()
        and id = $1::uuid`,
    [lpId, VOIDED_LP_STATUS, ctx.userId],
  );
}

export async function voidWasteEntry(input: VoidWasteEntryInput): Promise<VoidWasteEntryResult> {
  const wasteId = typeof input?.wasteId === 'string' ? input.wasteId.trim() : '';
  const reasonCode = typeof input?.reasonCode === 'string' ? input.reasonCode.trim() : '';
  const note = typeof input?.note === 'string' && input.note.trim().length > 0 ? input.note.trim() : null;

  if (!isUuid(wasteId) || !isReasonCode(reasonCode)) {
    return { ok: false, error: 'invalid_input' };
  }

  try {
    const result = await withOrgContext(async ({ userId, orgId, client }): Promise<VoidWasteEntryResult & { woId?: string }> => {
      const ctx: ProductionContext = { userId, orgId, client: client as QueryClient };
      const original = await loadWasteForUpdate(ctx, wasteId);
      if (!original) return { ok: false, error: 'not_found' };

      try {
        await assertCorrectionAllowed(ctx, {
          permission: WASTE_CORRECT_PERMISSION,
          woStatus: original.wo_status,
          requireEsign: false,
        });
      } catch {
        return { ok: false, error: 'forbidden' };
      }

      if (await hasWasteCorrection(ctx, wasteId)) {
        return { ok: false, error: 'already_corrected' };
      }

      const correction = await insertCounterEntry<{ id: string }>(ctx, {
        table: 'wo_waste_log',
        originalId: original.id,
        reasonCode,
        transactionIdColumn: 'transaction_id',
        values: {
          site_id: null,
          wo_id: original.wo_id,
          category_id: original.category_id,
          qty_kg: negateDecimalString(original.qty_kg),
          reason_code: reasonCode,
          reason_notes: note,
          operator_id: userId,
          shift_id: original.shift_id,
          approved_by: null,
          scan_event_id: null,
        },
      });

      await writeWasteVoidAudit(ctx, {
        original,
        correctionId: correction.id,
        reasonCode,
        note,
      });

      return { ok: true, woId: original.wo_id };
    });

    if (result.ok && result.woId) {
      revalidatePath('/production');
      revalidatePath(`/production/work-orders/${result.woId}`);
    }

    return result.ok ? { ok: true } : result;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') return { ok: false, error: 'already_corrected' };
    if (code === '23514' || code === '23503' || code === '22P02') return { ok: false, error: 'invalid_input' };
    console.error('[production] voidWasteEntry failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function voidWoOutput(input: VoidWoOutputInput): Promise<VoidWoOutputResult> {
  const outputId = typeof input?.outputId === 'string' ? input.outputId.trim() : '';
  const reasonCode = typeof input?.reasonCode === 'string' ? input.reasonCode.trim() : '';
  const note = typeof input?.note === 'string' && input.note.trim().length > 0 ? input.note.trim() : null;
  const password = typeof input?.signature?.password === 'string' ? input.signature.password : '';

  if (!isUuid(outputId) || !isReasonCode(reasonCode) || password.length === 0) {
    return { ok: false, error: 'invalid_input' };
  }

  try {
    const result = await withOrgContext(async ({ userId, orgId, client }): Promise<VoidWoOutputResult & { woId?: string }> => {
      const ctx: ProductionContext = { userId, orgId, client: client as QueryClient };
      const original = await loadOutputForUpdate(ctx, outputId);
      if (!original) return { ok: false, error: 'not_found' };

      if (await hasOutputCorrection(ctx, outputId)) {
        return { ok: false, error: 'already_corrected' };
      }

      if (!original.lp_id) {
        return { ok: false, error: 'lp_not_voidable' };
      }

      const lp = await loadLicensePlateForUpdate(ctx, original.lp_id);
      if (
        !lp ||
        lp.qa_status !== 'pending' ||
        lp.status !== 'received' ||
        !isZeroDecimalString(lp.reserved_qty) ||
        (await hasLpConsumptionOrChildren(ctx, original.lp_id))
      ) {
        return { ok: false, error: 'lp_not_voidable' };
      }

      try {
        await assertCorrectionAllowed(ctx, {
          permission: OUTPUT_CORRECT_PERMISSION,
          woStatus: original.wo_status,
          requireEsign: true,
          signature: {
            pin: password,
            intent: OUTPUT_VOID_INTENT,
            reason: reasonCode,
            subject: {
              output_id: original.id,
              wo_id: original.wo_id,
              lp_id: original.lp_id,
              qty_kg: original.qty_kg,
            },
          },
        });
      } catch (error) {
        if (error instanceof CorrectionForbiddenError) return { ok: false, error: 'forbidden' };
        if (error instanceof CorrectionInvalidInputError) return { ok: false, error: 'invalid_input' };
        return { ok: false, error: 'esign_failed' };
      }

      const correction = await insertCounterEntry<{ id: string }>(ctx, {
        table: 'wo_outputs',
        originalId: original.id,
        reasonCode,
        transactionIdColumn: 'transaction_id',
        values: {
          site_id: original.site_id,
          wo_id: original.wo_id,
          output_type: original.output_type,
          product_id: original.product_id,
          lp_id: null,
          batch_number: `${original.batch_number}-VOID-${original.id.slice(0, 8)}`,
          qty_kg: negateDecimalString(original.qty_kg),
          uom: original.uom,
          qa_status: original.qa_status,
          expiry_date: original.expiry_date,
          catch_weight_details: original.catch_weight_details == null ? null : JSON.stringify(original.catch_weight_details),
          allergen_profile_snapshot: original.allergen_profile_snapshot == null
            ? null
            : JSON.stringify(original.allergen_profile_snapshot),
          ext_jsonb: JSON.stringify({
            correction_reason_code: reasonCode,
            correction_note: note,
            corrected_output_id: original.id,
            corrected_lp_id: original.lp_id,
          }),
          registered_by: userId,
          created_by: userId,
          updated_by: userId,
        },
      });

      await markLpVoided(ctx, original.lp_id);
      await writeLpVoidHistory(ctx, { original, lp, reasonCode, note });
      await writeOutputVoidAudit(ctx, {
        original,
        lp,
        correctionId: correction.id,
        reasonCode,
        note,
      });

      // No legal correction/void event exists in the production.* outbox family; audit_events is the durable trail.
      return { ok: true, woId: original.wo_id };
    });

    if (result.ok && result.woId) {
      revalidatePath('/production');
      revalidatePath(`/production/work-orders/${result.woId}`);
    }

    return result.ok ? { ok: true } : result;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') return { ok: false, error: 'already_corrected' };
    if (code === '23514' || code === '23503' || code === '22P02') return { ok: false, error: 'invalid_input' };
    console.error('[production] voidWoOutput failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
